import { BadRequestException, Logger, ServiceUnavailableException } from '@nestjs/common';
import ffmpeg from 'fluent-ffmpeg';
import * as fs from 'fs/promises';

export interface TranscriptionAudio {
  path: string;
  mimetype: string;
  filename: string;
}

export interface OpenAiTranscription {
  text: string;
  segments: unknown[];
}

/** A stretch of the recording, in seconds from its start. */
export interface AudioSpan {
  start: number;
  end: number;
}

export interface SegmentPlanOptions {
  targetS: number;
  searchWindowS: number;
}

const logger = new Logger('OpenAiTranscribe');

// Context only: no example vitals, doses or drug names. The previous prompt's examples ("120/80 mmHg",
// "heart rate", "azithromycin 500 mg PO OD x3 days") were played back as invented consultation passages.
const TRANSCRIPTION_PROMPT =
  'Outpatient clinic in India. Speakers use Indian English and sometimes Hindi or Telugu words.';

// gpt-4o-transcribe rejects audio over 1400 s and silently truncates long outputs (a 15-minute clip came back
// cut off mid-word). Measured on 300 s of speech with the instruction prompt: 2/10 calls returned only the first
// ~220 chars (HTTP 200); two 150 s halves with the same prompt: 0/20. Long recordings are sent as ~150 s parts.
const DEFAULT_SEGMENT_S = 150;
const SEARCH_WINDOW_S = 45;
const SILENCE_FILTER = 'silencedetect=noise=-35dB:d=0.4';

// Measured (gpt-4o-transcribe, temperature 0): ~2/60 150 s requests invented a passage (~1.5x length), 2/10 300 s requests truncated to ~220 chars, each random per request.
const AGREE_WITHIN_CHARS = 40;
const AGREE_WITHIN_FRACTION = 0.15;

export interface ConsensusChoice {
  decision: 'agree' | 'median-of-3';
  /** Which sample to keep, so a whisper caller keeps that sample's segments. */
  index: number;
  text: string;
}

/**
 * Two samples of one transcription agree when their lengths are within max(40 chars, 15%); keep the first. They
 * disagree when one sample invented or lost content, and a third sample is needed. Of three, keep the median length:
 * a rare failure is either too long or too short, so it never lands in the middle unless two requests fail alike.
 */
export function chooseConsensusTranscript(texts: [string, string]): ConsensusChoice | { decision: 'disagree' };
export function chooseConsensusTranscript(texts: [string, string, string]): ConsensusChoice;
export function chooseConsensusTranscript(texts: string[]): ConsensusChoice | { decision: 'disagree' } {
  const lengths = texts.map((text) => text.trim().length);
  if (texts.length === 2) {
    const [a, b] = lengths;
    return Math.abs(a - b) <= Math.max(AGREE_WITHIN_CHARS, AGREE_WITHIN_FRACTION * Math.max(a, b))
      ? { decision: 'agree', index: 0, text: texts[0] }
      : { decision: 'disagree' };
  }
  const index = [0, 1, 2].sort((i, j) => lengths[i] - lengths[j])[1];
  return { decision: 'median-of-3', index, text: texts[index] };
}

export function isOpenAiTranscriptionConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

function positiveEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Splits [0, durationS] into contiguous spans of at most targetS + searchWindowS seconds. Each boundary sits at the
 * midpoint of the latest silence in the window ending at the next multiple of targetS, so words are not cut in half,
 * or exactly on that multiple when the window has no silence.
 */
export function planTranscriptionSegments(
  durationS: number,
  silences: AudioSpan[],
  { targetS, searchWindowS }: SegmentPlanOptions,
): AudioSpan[] {
  const spans: AudioSpan[] = [];
  let start = 0;
  for (let k = 1; durationS - start > targetS + searchWindowS; k++) {
    const gridS = k * targetS;
    const midpoints = silences
      .map((silence) => (silence.start + silence.end) / 2)
      .filter((mid) => mid >= gridS - searchWindowS && mid <= gridS && mid > start);
    const cut = midpoints.length > 0 ? Math.max(...midpoints) : gridS;
    spans.push({ start, end: cut });
    start = cut;
  }
  spans.push({ start, end: durationS });
  return spans;
}

// gpt-4o-transcribe accepts wav, mp3, flac, opus and pcm16 but not webm.
function writeSpeechWav(inputPath: string, outputPath: string, span?: AudioSpan): Promise<void> {
  return new Promise((resolve, reject) => {
    const command = ffmpeg(inputPath);
    if (span) command.seekInput(span.start).duration(span.end - span.start);
    command
      .toFormat('wav')
      .audioCodec('pcm_s16le')
      .audioChannels(1)
      .audioFrequency(16000)
      .on('end', () => resolve())
      .on('error', (err) => reject(new Error(`FFmpeg conversion failed: ${err.message}`)))
      .save(outputPath);
  });
}

function probeDurationS(inputPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, data) => {
      const duration = Number(data?.format?.duration);
      if (err || !Number.isFinite(duration)) reject(new BadRequestException('The recording could not be read. Please record again.'));
      else resolve(duration);
    });
  });
}

function detectSilences(inputPath: string): Promise<AudioSpan[]> {
  return new Promise((resolve, reject) => {
    const silences: AudioSpan[] = [];
    let openedAt: number | undefined;
    ffmpeg(inputPath)
      .audioFilters(SILENCE_FILTER)
      .format('null')
      .on('stderr', (line: string) => {
        const opened = /silence_start: (-?[\d.]+)/.exec(line);
        if (opened) openedAt = Number(opened[1]);
        const closed = /silence_end: ([\d.]+)/.exec(line);
        if (closed && openedAt !== undefined) {
          silences.push({ start: openedAt, end: Number(closed[1]) });
          openedAt = undefined;
        }
      })
      .on('end', () => resolve(silences))
      .on('error', (err) => reject(new Error(`FFmpeg silence detection failed: ${err.message}`)))
      .save('-');
  });
}

interface Upload {
  bytes: Buffer;
  mimetype: string;
  filename: string;
}

/** Lets at most `limit` calls run at once; the rest start in arrival order as slots free up. */
type RequestLimiter = <T>(fn: () => Promise<T>) => Promise<T>;

function requestLimiter(limit: number): RequestLimiter {
  let active = 0;
  const waiting: Array<() => void> = [];
  return async (fn) => {
    if (active < limit) active++;
    else await new Promise<void>((resolve) => waiting.push(resolve));
    try {
      return await fn();
    } finally {
      const handOff = waiting.shift();
      if (handOff) handOff();
      else active--;
    }
  };
}

async function requestTranscription(apiKey: string, audio: Upload): Promise<OpenAiTranscription> {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(audio.bytes)], { type: audio.mimetype }), audio.filename);
  const transcribeModel = process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-transcribe';
  const transcribeLanguage = (process.env.OPENAI_TRANSCRIBE_LANGUAGE || '').trim();
  form.append('model', transcribeModel);
  if (transcribeLanguage) form.append('language', transcribeLanguage);
  form.append('temperature', '0');
  form.append('prompt', TRANSCRIPTION_PROMPT);
  const isWhisper = /^whisper/i.test(transcribeModel);
  // gpt-4o-*-transcribe answers 400 to verbose_json; only whisper returns timed segments.
  form.append('response_format', isWhisper ? 'verbose_json' : 'json');
  // Without server VAD, gpt-4o-transcribe invents speech for silence or room noise ("Doctor, I've been feeling
  // really tired lately." from 10 s of silence). With it: 0/12 on silence and noise, speech unchanged (measured).
  // Default VAD dropped a short phrase before a pause ("Adapalene gel, ... apply at bedtime" lost the drug name 5/5);
  // 800 ms silence and 500 ms padding kept it 5/5 while silence and noise still came back empty.
  if (!isWhisper) form.append('chunking_strategy', JSON.stringify({ type: 'server_vad', silence_duration_ms: 800, prefix_padding_ms: 500 }));
  logger.log(
    `transcription upload size=${audio.bytes.length} mime=${audio.mimetype} file=${audio.filename} ` +
      `model=${transcribeModel} language=${transcribeLanguage || 'auto'}`,
  );

  const resp = await fetch(process.env.OPENAI_TRANSCRIBE_URL || 'https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    logger.error(
      `transcription OpenAI error: status=${resp.status} model=${transcribeModel} ` +
        `file=${audio.filename} error=${errText.slice(0, 300)}`,
    );
    if (resp.status >= 400 && resp.status < 500) {
      throw new BadRequestException('Speech transcription rejected the recording. Please retry with a shorter, clearer clip.');
    }
    throw new ServiceUnavailableException('Speech transcription service is temporarily unavailable. Please try again.');
  }
  const data: any = await resp.json();
  const text = typeof data?.text === 'string' ? data.text : '';
  const segments: unknown[] = Array.isArray(data?.segments) ? data.segments : [];
  logger.log(`transcription transcriptLength=${text.length} segmentCount=${segments.length}`);
  return { text, segments };
}

/** Like Promise.all, but rethrows the first failure only after every promise settles, so no request outlives its caller. */
async function settleAll<T>(promises: Array<Promise<T>>): Promise<T[]> {
  const settled = await Promise.allSettled(promises);
  const failed = settled.find((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (failed) throw failed.reason;
  return settled.map((result) => (result as PromiseFulfilledResult<T>).value);
}

/** Sends the file twice in parallel and a third time only when the two lengths disagree; see chooseConsensusTranscript. */
async function transcribeByConsensus(apiKey: string, audio: TranscriptionAudio, limit: RequestLimiter): Promise<OpenAiTranscription> {
  const upload: Upload = { bytes: await fs.readFile(audio.path), mimetype: audio.mimetype, filename: audio.filename };
  const send = () => limit(() => requestTranscription(apiKey, upload));
  const samples = await settleAll([send(), send()]);
  let choice = chooseConsensusTranscript([samples[0].text, samples[1].text]);
  if (choice.decision === 'disagree') {
    samples.push(await send());
    choice = chooseConsensusTranscript([samples[0].text, samples[1].text, samples[2].text]);
  }
  logger.log(
    `transcription consensus file=${audio.filename} lengths=${samples.map((sample) => sample.text.trim().length).join(',')} ` +
      `decision=${choice.decision}`,
  );
  return samples[choice.index];
}

function offsetSegment(segment: unknown, offsetS: number): unknown {
  if (!segment || typeof segment !== 'object') return segment;
  const { start, end } = segment as { start?: unknown; end?: unknown };
  return {
    ...segment,
    ...(typeof start === 'number' && { start: start + offsetS }),
    ...(typeof end === 'number' && { end: end + offsetS }),
  };
}

/** Runs fn over items with at most `limit` in flight; after the first failure no new item starts, and it rethrows once all running ones settle. */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  let failure: { error: unknown } | undefined;
  const worker = async () => {
    while (!failure && next < items.length) {
      const index = next++;
      try {
        results[index] = await fn(items[index], index);
      } catch (error) {
        failure ??= { error };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  if (failure) throw failure.error;
  return results;
}

async function transcribeInParts(
  apiKey: string,
  audio: TranscriptionAudio,
  durationS: number,
  plan: SegmentPlanOptions,
  concurrency: number,
  limit: RequestLimiter,
) {
  const silences = await detectSilences(audio.path);
  const spans = planTranscriptionSegments(durationS, silences, plan);
  logger.log(`transcription split durationS=${durationS.toFixed(1)} parts=${spans.length} concurrency=${concurrency}`);
  const baseName = audio.filename.replace(/\.[^.]*$/, '');
  // Parts are bounded too, so a long recording does not decode every part at once while waiting for request slots.
  const parts = await mapWithConcurrency(spans, concurrency, async (span, index) => {
    const partPath = `${audio.path}.part${index}.wav`;
    try {
      await writeSpeechWav(audio.path, partPath, span);
      const part = await transcribeByConsensus(
        apiKey,
        { path: partPath, mimetype: 'audio/wav', filename: `${baseName}.part${index}.wav` },
        limit,
      );
      return { text: part.text.trim(), segments: part.segments.map((segment) => offsetSegment(segment, span.start)) };
    } finally {
      await fs.unlink(partPath).catch(() => undefined);
    }
  });
  return {
    text: parts.map((part) => part.text).filter(Boolean).join(' '),
    segments: parts.flatMap((part) => part.segments),
  };
}

export async function transcribeWithOpenAI(audio: TranscriptionAudio): Promise<OpenAiTranscription> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    logger.warn('transcription skipped: OPENAI_API_KEY is not configured');
    throw new ServiceUnavailableException(
      'Speech transcription is unavailable. Contact an administrator to configure OPENAI_API_KEY.',
    );
  }
  let convertedWavPath: string | undefined;
  try {
    let source: TranscriptionAudio = { ...audio, mimetype: audio.mimetype || 'audio/webm', filename: audio.filename || 'audio.webm' };
    if (audio.mimetype === 'audio/webm' || source.filename.endsWith('.webm')) {
      convertedWavPath = `${audio.path}.wav`;
      try {
        await writeSpeechWav(audio.path, convertedWavPath);
      } catch (convErr: any) {
        logger.error(`WebM conversion failed: ${convErr.message}`);
        throw new BadRequestException(`Audio format conversion failed: ${convErr.message}`);
      }
      source = { path: convertedWavPath, mimetype: 'audio/wav', filename: source.filename.replace(/\.webm$/i, '.wav') };
    }

    const durationS = await probeDurationS(source.path);
    const maxS = positiveEnv('OPENAI_TRANSCRIBE_MAX_SECONDS', 3600);
    if (durationS > maxS) {
      throw new BadRequestException(
        `This recording is ${Math.ceil(durationS / 60)} minutes long. ` +
          `Speech transcription accepts up to ${Math.floor(maxS / 60)} minutes; please record in shorter parts.`,
      );
    }
    const plan = { targetS: positiveEnv('OPENAI_TRANSCRIBE_SEGMENT_SECONDS', DEFAULT_SEGMENT_S), searchWindowS: SEARCH_WINDOW_S };
    // Counts requests, not parts: each part sends two or three, so 8 keeps a 30-minute recording at ~3 request waves.
    const concurrency = Math.floor(positiveEnv('OPENAI_TRANSCRIBE_CONCURRENCY', 8)) || 1;
    const limit = requestLimiter(concurrency);
    if (durationS <= plan.targetS + plan.searchWindowS) return await transcribeByConsensus(apiKey, source, limit);
    return await transcribeInParts(apiKey, source, durationS, plan, concurrency, limit);
  } finally {
    if (convertedWavPath) await fs.unlink(convertedWavPath).catch(() => undefined);
  }
}
