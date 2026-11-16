// Repo path: backend/src/modules/voice/voice.service.ts
// One generic parse: check length -> one chat call with a strict schema -> rebuild the response
// from a whitelist. Per-intent knowledge lives in voice-intents.ts.
// Pattern: whatsapp-templates.service.ts generate() (key check :112-115, timeout :117 and :169-170),
// except that a timeout here is a 503, not the RequestTimeoutException (408) it throws at :186-188.

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
    // heard = text.replace(/\s+/g, ' ').trim()
    // !heard || heard.length > VOICE_TEXT_LIMITS[intent] -> BadRequestException(VOICE_BAD_TEXT_MESSAGE)
    // apiKey = process.env.OPENAI_API_KEY; !apiKey -> ServiceUnavailableException(VOICE_NOT_CONFIGURED_MESSAGE)
    // spec = VOICE_INTENT_SPECS[intent]; prepared = spec.prepare(heard)
    // controller = new AbortController(); timer = setTimeout(abort, Number(process.env.OPENAI_HTTP_TIMEOUT_MS || 15000))
    // try raw = await this.chat({ apiKey, model: process.env.OPENAI_COMMAND_MODEL || 'gpt-4o-mini',
    //                             system: spec.system, user: prepared.user, schema: spec.schema, signal })
    // catch (AbortError | non-2xx | bad JSON) -> logger.warn(`voice ${intent} failed: ${status|name}`)
    //                                           ServiceUnavailableException(VOICE_UNAVAILABLE_MESSAGE)
    // finally clearTimeout(timer)
    // return spec.sanitize(raw, heard, prepared)
    void BadRequestException; void ServiceUnavailableException; void VOICE_TEXT_LIMITS; void VOICE_INTENT_SPECS;
    throw new Error('not implemented');
  }
}

/** Default ChatCall: POST https://api.openai.com/v1/chat/completions, temperature 0,
 *  response_format { type: 'json_schema', json_schema: { name, strict: true, schema } }. */
export const openAiChat: ChatCall = async () => { throw new Error('not implemented'); };
