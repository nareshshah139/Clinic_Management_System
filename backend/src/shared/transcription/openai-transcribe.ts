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

const logger = new Logger('OpenAiTranscribe');

const TRANSCRIPTION_PROMPT =
  'Medical doctor–patient conversation transcription. ' +
  'Preserve punctuation, numbers, and units exactly (e.g., 120/80 mmHg). ' +
  'Use medical spellings; prefer Indian English when applicable. ' +
  'Expand unambiguous abbreviations (BP → blood pressure, HR → heart rate); keep ambiguous ones verbatim. ' +
  'Normalize medication mentions when clearly stated (e.g., azithromycin 500 mg PO OD x3 days). ' +
  'Do not add speaker tags or commentary; output only the transcript text.';

export function isOpenAiTranscriptionConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

// gpt-4o-transcribe accepts wav, mp3, flac, opus and pcm16 but not webm.
function convertWebMToWAV(inputPath: string): Promise<string> {
  const outputPath = `${inputPath}.wav`;
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .toFormat('wav')
      .audioCodec('pcm_s16le')
      .audioChannels(1)
      .audioFrequency(16000)
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(new Error(`FFmpeg conversion failed: ${err.message}`)))
      .save(outputPath);
  });
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
    let finalPath = audio.path;
    let finalMimeType = audio.mimetype || 'audio/webm';
    let displayName = audio.filename || 'audio.webm';
    if (audio.mimetype === 'audio/webm' || displayName.endsWith('.webm')) {
      try {
        convertedWavPath = await convertWebMToWAV(finalPath);
      } catch (convErr: any) {
        logger.error(`WebM conversion failed: ${convErr.message}`);
        throw new BadRequestException(`Audio format conversion failed: ${convErr.message}`);
      }
      finalPath = convertedWavPath;
      finalMimeType = 'audio/wav';
      displayName = displayName.replace(/\.webm$/i, '.wav');
    }

    const fileBuf = await fs.readFile(finalPath);
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(fileBuf)], { type: finalMimeType }), displayName);
    const transcribeModel = process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-transcribe';
    const transcribeLanguage = (process.env.OPENAI_TRANSCRIBE_LANGUAGE || '').trim();
    form.append('model', transcribeModel);
    if (transcribeLanguage) form.append('language', transcribeLanguage);
    form.append('temperature', '0');
    form.append('prompt', TRANSCRIPTION_PROMPT);
    // gpt-4o-*-transcribe answers 400 to verbose_json; only whisper returns timed segments.
    form.append('response_format', /^whisper/i.test(transcribeModel) ? 'verbose_json' : 'json');
    logger.log(
      `transcription upload size=${fileBuf.length} mime=${finalMimeType} converted=${convertedWavPath ? 'yes' : 'no'} ` +
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
          `converted=${convertedWavPath ? 'yes' : 'no'} error=${errText.slice(0, 300)}`,
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
  } finally {
    if (convertedWavPath) await fs.unlink(convertedWavPath).catch(() => undefined);
  }
}
