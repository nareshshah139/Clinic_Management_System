export interface SpeechToTextResponse {
  text?: string;
  segments?: Array<{
    speaker?: 'DOCTOR' | 'PATIENT';
    text?: string;
    start_s?: number | null;
    end_s?: number | null;
    confidence?: number;
  }>;
  speakers?: {
    doctorText?: string;
    patientText?: string;
  };
}

export type SpeechToTextPreference = 'patient-preferred' | 'full-transcript';

function normalizeSpeechText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim();
}

export function pickSpeechToTextInsert(
  result: SpeechToTextResponse | null | undefined,
  preference: SpeechToTextPreference = 'full-transcript',
): string {
  const combinedText = normalizeSpeechText(result?.text);
  const doctorText = normalizeSpeechText(result?.speakers?.doctorText);
  const patientText = normalizeSpeechText(result?.speakers?.patientText);

  if (preference === 'patient-preferred') {
    return patientText || combinedText || doctorText;
  }

  return combinedText || doctorText || patientText;
}

export function appendSpeechToText(current: string, next: string): string {
  const base = normalizeSpeechText(current);
  const addition = normalizeSpeechText(next);

  if (!addition) return base;
  return base ? `${base} ${addition}` : addition;
}

export function formatSpeechToTextError(status: number, detail?: string): string {
  const summary = normalizeSpeechText(detail).slice(0, 140);

  switch (status) {
    case 400:
      return summary || 'The recording could not be processed. Try a shorter, clearer clip.';
    case 401:
    case 403:
      return 'Your session expired. Please sign in again.';
    case 413:
      return 'The recording is too large. Try a shorter clip.';
    case 503:
      return 'Speech transcription is temporarily unavailable. Try again shortly.';
    default:
      return summary ? `Server returned ${status}. ${summary}` : `Server returned ${status}.`;
  }
}
