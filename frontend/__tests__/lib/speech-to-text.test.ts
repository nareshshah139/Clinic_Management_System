import {
  appendSpeechToText,
  formatSpeechToTextError,
  pickSpeechToTextInsert,
} from '@/lib/speech-to-text';

describe('speech-to-text helpers', () => {
  it('prefers the full transcript for doctor dictation fields', () => {
    const text = pickSpeechToTextInsert(
      {
        text: 'Patient has acne for two months',
        speakers: {
          doctorText: 'Acne for two months',
          patientText: 'Two months',
        },
      },
      'full-transcript',
    );

    expect(text).toBe('Patient has acne for two months');
  });

  it('prefers patient-only text for patient-focused fields when available', () => {
    const text = pickSpeechToTextInsert(
      {
        text: 'Doctor: what happened? Patient: itching for one week',
        speakers: {
          doctorText: 'what happened',
          patientText: 'itching for one week',
        },
      },
      'patient-preferred',
    );

    expect(text).toBe('itching for one week');
  });

  it('appends text without leaving duplicate whitespace', () => {
    expect(appendSpeechToText('Existing note  ', '  new detail')).toBe('Existing note new detail');
  });

  it('formats server errors into user-facing messages', () => {
    expect(formatSpeechToTextError(503, '')).toBe('Speech transcription is temporarily unavailable. Try again shortly.');
  });
});
