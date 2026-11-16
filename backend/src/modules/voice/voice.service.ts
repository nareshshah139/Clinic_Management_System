import { BadRequestException, Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { VOICE_TEXT_LIMITS, type ParsedByIntent, type VoiceIntent, type VoiceStatus } from '@cms/shared-types/voice';
import { VOICE_INTENT_SPECS } from './voice-intents';

export const VOICE_CHAT = Symbol('VOICE_CHAT');

export const VOICE_NOT_CONFIGURED_MESSAGE = 'Voice commands are not set up. Ask your administrator.';
export const VOICE_UNAVAILABLE_MESSAGE = 'Could not read that just now. Fill the form by hand or try again.';
export const VOICE_BAD_TEXT_MESSAGE = 'Say it again; it was empty or too long.';

/** Parsed JSON content of the first choice. Throws on non-2xx; rejects with AbortError on abort. */
export type ChatCall = (req: {
  apiKey: string; model: string; system: string; user: string; schema: object; signal: AbortSignal;
}) => Promise<unknown>;

@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);

  /** `chat` is injected (VOICE_CHAT, default openAiChat) so specs never touch the network. */
  constructor(@Inject(VOICE_CHAT) private readonly chat: ChatCall) {}

  status(): VoiceStatus {
    return { configured: !!process.env.OPENAI_API_KEY };
  }

  /**
   * @cc [owner:nareshshah139,label:product] voice-parse-no-key
   * Without OPENAI_API_KEY every parse MUST answer 503 with the not-set-up message and MUST NOT
   * contact the provider.
   */
  /**
   * @cc [owner:nareshshah139,label:product] voice-parse-unavailable-503
   * A provider timeout, non-2xx reply or unparsable reply MUST become a 503 with the unavailable
   * message, and logs MUST carry the intent and status only, never the transcript.
   */
  /**
   * @cc [owner:nareshshah139,label:security] voice-parse-spoken-only
   * A parse response MUST be rebuilt from the intent's whitelist: no ids, no extra keys, numbers in
   * range, names that are substrings of the transcript, and `heard` equal to the request text.
   */
  async parse<K extends VoiceIntent>(intent: K, text: string): Promise<ParsedByIntent[K]> {
    const heard = text.replace(/\s+/g, ' ').trim();
    if (!heard || heard.length > VOICE_TEXT_LIMITS[intent]) {
      throw new BadRequestException(VOICE_BAD_TEXT_MESSAGE);
    }
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new ServiceUnavailableException(VOICE_NOT_CONFIGURED_MESSAGE);

    const spec = VOICE_INTENT_SPECS[intent];
    const prepared = spec.prepare(heard);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Number(process.env.OPENAI_HTTP_TIMEOUT_MS || 15000));
    let raw: unknown;
    try {
      raw = await this.chat({
        apiKey,
        model: process.env.OPENAI_COMMAND_MODEL || 'gpt-4o-mini',
        system: spec.system,
        user: prepared.user,
        schema: spec.schema,
        signal: controller.signal,
      });
    } catch (e) {
      // Status or error name only: provider error text can echo the transcript.
      const reason = (e as { status?: number })?.status ?? (e as Error)?.name ?? 'unknown';
      this.logger.warn(`voice ${intent} failed: ${reason}`);
      throw new ServiceUnavailableException(VOICE_UNAVAILABLE_MESSAGE);
    } finally {
      clearTimeout(timer);
    }
    return spec.sanitize(raw, heard, prepared);
  }
}

/** Default ChatCall: POST https://api.openai.com/v1/chat/completions, temperature 0,
 *  response_format { type: 'json_schema', json_schema: { name, strict: true, schema } }. */
export const openAiChat: ChatCall = async ({ apiKey, model, system, user, schema, signal }) => {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: 'json_schema', json_schema: { name: 'voice_parse', strict: true, schema } },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
    signal,
  });
  if (!resp.ok) throw Object.assign(new Error(`OpenAI ${resp.status}`), { status: resp.status });
  const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return JSON.parse(data.choices?.[0]?.message?.content ?? '');
};
