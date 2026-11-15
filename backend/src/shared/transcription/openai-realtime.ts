import {
  BadGatewayException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { TRANSCRIPTION_PROMPT } from './openai-transcribe';

const logger = new Logger('OpenAiRealtime');

export interface LiveTranscriptionSession {
  type: 'transcription';
  audio: {
    input: {
      transcription: {
        model: string;
        prompt: string;
        delay: 'low';
        languages?: string[];
      };
      turn_detection: null;
    };
  };
}

export function buildLiveTranscriptionSession(
  env: NodeJS.ProcessEnv = process.env,
): LiveTranscriptionSession {
  const languages = (env.OPENAI_TRANSCRIBE_LANGUAGE || '')
    .split(',')
    .map((language) => language.trim())
    .filter(Boolean);
  return {
    type: 'transcription',
    audio: {
      input: {
        transcription: {
          model: env.OPENAI_LIVE_TRANSCRIBE_MODEL || 'gpt-live-transcribe',
          prompt: TRANSCRIPTION_PROMPT,
          delay: 'low',
          ...(languages.length > 0 ? { languages } : {}),
        },
        turn_detection: null,
      },
    },
  };
}

export async function createLiveTranscriptionCall(
  sdpOffer: string,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    logger.warn('live transcription skipped: OPENAI_API_KEY is not configured');
    throw new ServiceUnavailableException(
      'Speech transcription is unavailable. Contact an administrator to configure OPENAI_API_KEY.',
    );
  }
  const session = buildLiveTranscriptionSession();
  const model = session.audio.input.transcription.model;
  const form = new FormData();
  form.append('sdp', sdpOffer);
  form.append('session', JSON.stringify(session));

  let resp: Response;
  try {
    resp = await fetch(
      process.env.OPENAI_REALTIME_CALLS_URL ||
        'https://api.openai.com/v1/realtime/calls',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      },
    );
  } catch (e: any) {
    logger.error(
      `live transcription request failed: model=${model} error=${e?.name || 'Error'}`,
    );
    throw new BadGatewayException('Live transcription could not start.');
  }
  if (!resp.ok) {
    const body: any = await resp.json().catch(() => null);
    const param =
      typeof body?.error?.param === 'string' ? body.error.param : 'none';
    logger.error(
      `live transcription OpenAI error: status=${resp.status} model=${model} param=${param}`,
    );
    throw new BadGatewayException('Live transcription could not start.');
  }
  return resp.text();
}
