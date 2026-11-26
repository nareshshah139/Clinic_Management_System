import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { CodexFailure, completeJsonWithCodexOAuth, isCodexOAuthReady, type CodexFailureKind } from '../../shared/codex/codex-oauth';
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

export type VoiceFillFailureKind = 'transcription' | CodexFailureKind | 'model-output' | 'unknown';

export interface VoiceFillFailure {
  kind: VoiceFillFailureKind;
  exitCode: number | null;
  signal: string | null;
  reason: string;
  detail: string;
}

// These transcription messages append raw ffmpeg output, which can carry container metadata from the recording.
const FFMPEG_DETAIL = /^(Audio format conversion failed|FFmpeg [a-z ]+ failed): .*$/s;

export function voiceFillFailure(error: unknown, step: 'transcribe' | 'extract'): VoiceFillFailure {
  if (error instanceof CodexFailure) {
    return { kind: error.kind, exitCode: error.exitCode, signal: error.signal, reason: error.message, detail: error.diagnostic };
  }
  // A JSON parse error message quotes the text it failed on, which is patient data.
  const message = error instanceof SyntaxError ? 'invalid model output' : error instanceof Error ? error.message : 'unknown';
  if (step === 'transcribe') {
    return { kind: 'transcription', exitCode: null, signal: null, reason: message.replace(FFMPEG_DETAIL, '$1'), detail: '' };
  }
  return { kind: error instanceof SyntaxError ? 'model-output' : 'unknown', exitCode: null, signal: null, reason: message, detail: '' };
}

// Codex took 43 s on a 30-minute consult transcript (measured), so 60 s left too little headroom.
function timeoutMs(): number {
  const configured = Number(process.env.VOICE_FILL_CODEX_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : 120000;
}

@Injectable()
export class VoiceFillService {
  private readonly logger = new Logger(VoiceFillService.name);
  private loggedStatus?: string;

  async isAvailable(): Promise<boolean> {
    const transcriptionKey = isOpenAiTranscriptionConfigured();
    const codexLogin = await isCodexOAuthReady();
    const available = transcriptionKey && codexLogin;
    const status = `voice-fill status available=${available} transcriptionKey=${transcriptionKey} codexLogin=${codexLogin}`;
    if (status !== this.loggedStatus) {
      this.loggedStatus = status;
      this.logger.log(status);
    }
    return available;
  }

  async fill(formId: string, form: VoiceFillForm, audio: VoiceFillAudio): Promise<VoiceFillResult> {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'voice-fill-'));
    try {
      return await this.extract(formId, form, `audioBytes=${audio.bytes.length}`, async () => {
        const audioPath = path.join(directory, `audio.${audio.extension}`);
        await fs.writeFile(audioPath, audio.bytes, { mode: 0o600 });
        const { text } = await transcribeWithOpenAI({
          path: audioPath,
          mimetype: AUDIO_MIME[audio.extension],
          filename: path.basename(audioPath),
        });
        return text;
      });
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  }

  fillText(formId: string, form: VoiceFillForm, text: string): Promise<VoiceFillResult> {
    return this.extract(formId, form, `textChars=${text.length}`, async () => text);
  }

  private async extract(
    formId: string,
    form: VoiceFillForm,
    inputSize: string,
    getText: () => Promise<string>,
  ): Promise<VoiceFillResult> {
    const started = Date.now();
    let transcribedAt: number | undefined;
    const outcome = (detail: string) => {
      const stages = transcribedAt === undefined ? '' : ` transcribeMs=${transcribedAt - started} extractMs=${Date.now() - transcribedAt}`;
      return `voice-fill form=${formId} ms=${Date.now() - started}${stages} ${inputSize} ${detail}`;
    };
    let step: 'transcribe' | 'extract' = 'transcribe';
    try {
      const transcript = normalizeTranscript(await getText());
      transcribedAt = Date.now();
      step = 'extract';
      if (!transcript) {
        this.logger.log(outcome('fields=0 transcript=empty'));
        return { transcript: '', fields: {} };
      }
      const raw = await completeJsonWithCodexOAuth({
        prompt: buildVoiceFillPrompt(form, transcript, new Date()),
        schema: buildVoiceFillSchema(form),
        model: process.env.VOICE_FILL_CODEX_MODEL || process.env.PHARMACY_AGENT_CODEX_MODEL || undefined,
        timeoutMs: timeoutMs(),
      });
      const fields = parseVoiceFillOutput(form, raw);
      this.logger.log(outcome(`fields=${Object.keys(fields).length}`));
      return { transcript, fields };
    } catch (error) {
      const { kind, exitCode, signal, reason, detail } = voiceFillFailure(error, step);
      // Double quotes delimit the values, so one inside a value would make the line ambiguous to read.
      const oneLine = (text: string) => text.replace(/\s+/g, ' ').replace(/"/g, "'");
      this.logger.warn(outcome(
        `failed step=${kind} exit=${exitCode ?? 'none'} signal=${signal ?? 'none'} reason="${oneLine(reason)}" detail="${oneLine(detail)}"`,
      ));
      throw new ServiceUnavailableException(`${UNAVAILABLE} (code: ${kind})`);
    }
  }
}
