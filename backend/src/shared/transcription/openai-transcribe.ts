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

const TRANSCRIPTION_PROMPT =
  'Medical doctor–patient conversation transcription. ' +
  'Preserve punctuation, numbers, and units exactly (e.g., 120/80 mmHg). ' +
  'Use medical spellings; prefer Indian English when applicable. ' +
  'Expand unambiguous abbreviations (BP → blood pressure, HR → heart rate); keep ambiguous ones verbatim. ' +
  'Normalize medication mentions when clearly stated (e.g., azithromycin 500 mg PO OD x3 days). ' +
  'Do not add speaker tags or commentary; output only the transcript text.';

// gpt-4o-transcribe rejects audio over 1400 s and silently truncates long outputs (a 15-minute clip came back
// cut off mid-word), while 5-minute clips transcribe in full. Long recordings are sent as ~5-minute parts.
const SEARCH_WINDOW_S = 45;
const SILENCE_FILTER = 'silencedetect=noise=-35dB:d=0.4';

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

async function requestTranscription(apiKey: string, audio: TranscriptionAudio): Promise<OpenAiTranscription> {
  const fileBuf = await fs.readFile(audio.path);
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(fileBuf)], { type: audio.mimetype }), audio.filename);
  const transcribeModel = process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-transcribe';
  const transcribeLanguage = (process.env.OPENAI_TRANSCRIBE_LANGUAGE || '').trim();
  form.append('model', transcribeModel);
  if (transcribeLanguage) form.append('language', transcribeLanguage);
  form.append('temperature', '0');
  form.append('prompt', TRANSCRIPTION_PROMPT);
  // gpt-4o-*-transcribe answers 400 to verbose_json; only whisper returns timed segments.
  form.append('response_format', /^whisper/i.test(transcribeModel) ? 'verbose_json' : 'json');
  logger.log(
    `transcription upload size=${fileBuf.length} mime=${audio.mimetype} file=${audio.filename} ` +
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

async function transcribeInParts(apiKey: string, audio: TranscriptionAudio, durationS: number, plan: SegmentPlanOptions) {
  const spans = planTranscriptionSegments(durationS, await detectSilences(audio.path), plan);
  const concurrency = Math.floor(positiveEnv('OPENAI_TRANSCRIBE_CONCURRENCY', 4)) || 1;
  logger.log(`transcription split durationS=${durationS.toFixed(1)} parts=${spans.length} concurrency=${concurrency}`);
  const baseName = audio.filename.replace(/\.[^.]*$/, '');
  const parts = await mapWithConcurrency(spans, concurrency, async (span, index) => {
    const partPath = `${audio.path}.part${index}.wav`;
    try {
      await writeSpeechWav(audio.path, partPath, span);
      const part = await requestTranscription(apiKey, { path: partPath, mimetype: 'audio/wav', filename: `${baseName}.part${index}.wav` });
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
    const plan = { targetS: positiveEnv('OPENAI_TRANSCRIBE_SEGMENT_SECONDS', 300), searchWindowS: SEARCH_WINDOW_S };
    if (durationS <= plan.targetS + plan.searchWindowS) return await requestTranscription(apiKey, source);
    return await transcribeInParts(apiKey, source, durationS, plan);
  } finally {
    if (convertedWavPath) await fs.unlink(convertedWavPath).catch(() => undefined);
  }
}
