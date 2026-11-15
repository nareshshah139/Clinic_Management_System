import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { completeJsonWithCodexOAuth, isCodexOAuthReady } from '../../shared/codex/codex-oauth';
import { isOpenAiTranscriptionConfigured, transcribeWithOpenAI } from '../../shared/transcription/openai-transcribe';
import {
  buildVoiceFillPrompt,
  buildVoiceFillSchema,
  normalizeTranscript,
  parseVoiceFillOutput,
  type VoiceFillResult,
} from './voice-fill.logic';
import type { VoiceFillForm } from './voice-fill.registry';

const UNAVAILABLE = 'Voice fill is unavailable right now. Please fill the form manually.';

export type VoiceFillAudioExtension = 'webm' | 'ogg' | 'm4a' | 'mp3' | 'wav';

export interface VoiceFillAudio {
  bytes: Buffer;
  extension: VoiceFillAudioExtension;
}

const AUDIO_MIME: Record<VoiceFillAudioExtension, string> = {
  webm: 'audio/webm',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
};

// Codex took 43 s on a 30-minute consult transcript (measured), so 60 s left too little headroom.
function timeoutMs(): number {
  const configured = Number(process.env.VOICE_FILL_CODEX_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : 120000;
}

@Injectable()
export class VoiceFillService {
  private readonly logger = new Logger(VoiceFillService.name);

  async isAvailable(): Promise<boolean> {
    return isOpenAiTranscriptionConfigured() && (await isCodexOAuthReady());
  }

  async fill(formId: string, form: VoiceFillForm, audio: VoiceFillAudio): Promise<VoiceFillResult> {
    const started = Date.now();
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'voice-fill-'));
    const outcome = (detail: string) =>
      `voice-fill form=${formId} ms=${Date.now() - started} audioBytes=${audio.bytes.length} ${detail}`;
    try {
      const audioPath = path.join(directory, `audio.${audio.extension}`);
      await fs.writeFile(audioPath, audio.bytes, { mode: 0o600 });
      const { text } = await transcribeWithOpenAI({
        path: audioPath,
        mimetype: AUDIO_MIME[audio.extension],
        filename: path.basename(audioPath),
      });
      const transcript = normalizeTranscript(text);
      if (!transcript) {
        this.logger.log(outcome('fields=0 transcript=empty'));
        return { transcript: '', fields: {} };
      }
      const raw = await completeJsonWithCodexOAuth({
        prompt: buildVoiceFillPrompt(form, transcript, new Date().toISOString().slice(0, 10)),
        schema: buildVoiceFillSchema(form),
        model: process.env.VOICE_FILL_CODEX_MODEL || process.env.PHARMACY_AGENT_CODEX_MODEL || undefined,
        timeoutMs: timeoutMs(),
      });
      const fields = parseVoiceFillOutput(form, raw);
      this.logger.log(outcome(`fields=${Object.keys(fields).length}`));
      return { transcript, fields };
    } catch (error) {
      // A JSON parse error message quotes the model output, which is patient data.
      const reason = error instanceof SyntaxError ? 'invalid model output' : error instanceof Error ? error.message : 'unknown';
      this.logger.warn(outcome(`failed: ${reason}`));
      throw new ServiceUnavailableException(UNAVAILABLE);
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  }
}
