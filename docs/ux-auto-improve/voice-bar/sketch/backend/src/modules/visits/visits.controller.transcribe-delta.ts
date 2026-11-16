// Repo path: backend/src/modules/visits/visits.controller.ts  (DELTA ONLY, package B)
// Judgement P1 items 1-5, 7 and 8, minus item 6 (no GET /visits/transcribe/status: the status
// route is GET /voice/status) and minus the deletion of the chunk routes (decision 7).
// Lines verified: `@Post('transcribe')` :661, `transcribeAudio` :688, missing-key 503 :716-718,
// response_format :790 and :1192, transcribe/health :1054, chunk routes :1106, :1117, :1286,
// ensureTranscribeSessionDir :188, Roles and UserRole imports :35-36.

import type { UserRole } from '@prisma/client';

/**
 * @cc [owner:nareshshah139,label:product] transcription-format-per-model
 * POST /visits/transcribe MUST send verbose_json only for whisper-1 and json for every other model.
 */
export function transcriptionResponseFormat(model: string): 'json' | 'verbose_json' {
  // return model === 'whisper-1' ? 'verbose_json' : 'json'
  // Used at :790 only. The chunk route's own line at :1192 stays as it is (decision 7).
  throw new Error('not implemented');
}

/** New multipart field `context`: 'clinical' (default, today's prompt) | 'plain'. Anything else is 'clinical'. */
export type TranscribeContext = 'clinical' | 'plain';
export const PLAIN_TRANSCRIPTION_PROMPT =
  'Transcribe exactly what is said. Keep numbers, units, batch codes and names as spoken. ' +
  'Do not expand abbreviations or rename medicines. Output only the transcript.';

/**
 * Added as `@Roles(...TRANSCRIBE_STAFF_ROLES)` on transcribeAudio (:661) and, as a decorator line
 * only, on the three chunk routes (:1106, :1117, :1286). Their bodies and the
 * ensureTranscribeSessionDir helper are not touched. See rationale "Problems found" 2.
 */
export declare const TRANSCRIBE_STAFF_ROLES: readonly [
  typeof UserRole.NURSE, typeof UserRole.RECEPTION, typeof UserRole.PHARMACIST,
  typeof UserRole.MANAGER, typeof UserRole.LAB_TECH, typeof UserRole.ACCOUNTANT,
];

/**
 * @cc [owner:nareshshah139,label:security] transcription-staff-only
 * Patients MUST NOT be able to call any /visits/transcribe route.
 */
/**
 * @cc [owner:nareshshah139,label:product] diarization-opt-in
 * Speaker separation MUST run only when the caller sends diarize=true; otherwise no second provider
 * call is made and segments and speakers are empty.
 */
/**
 * @cc [owner:nareshshah139,label:product] transcription-timeout
 * The transcription fetch MUST abort after OPENAI_TRANSCRIBE_TIMEOUT_MS (default 60000) and answer
 * 503 "Speech transcription took too long. Please try a shorter clip."
 */
export declare function transcribeAudio(): void;
// transcribeAudio changes (response shape unchanged; missing-key 503 copy at :716-718 unchanged):
//   - form.append('response_format', transcriptionResponseFormat(model))            (:790)
//   - prompt = body.context === 'plain' ? PLAIN_TRANSCRIPTION_PROMPT : today's clinical prompt
//   - diarization chat call only when body.diarize === 'true'; else segments [] and empty speakers
//   - diarization schema: additionalProperties false at all three levels; every key required;
//     confidence { type: ['number', 'null'] }; strict true
//   - AbortController + OPENAI_TRANSCRIBE_TIMEOUT_MS -> ServiceUnavailableException (503, decision 11)
//
// Also (package B): frontend/src/app/test-transcribe/page.tsx gets formData.append('diarize', 'true')
// next to the existing file append (~:219) so the debug page keeps its speaker panels.
// Not changed: GET transcribe/health (:1054; the bar never calls it), the chunk route bodies, the
// temp-file clean-up in `finally`, upload limits, legacy-photo-route.
