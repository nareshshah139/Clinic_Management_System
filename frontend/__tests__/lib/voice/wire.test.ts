import {
  VISIT_NOTE_SECTIONS,
  VOICE_INTENTS,
  VOICE_ROUTES,
  VOICE_STATUS_ROUTE,
  VOICE_TEXT_LIMITS,
} from '@cms/shared-types/voice';

describe('@cms/shared-types/voice', () => {
  it('lists exactly the three intents', () => {
    expect([...VOICE_INTENTS]).toEqual(['visit-note', 'book-appointment', 'stock-count']);
  });

  it('lists exactly the four visit-note sections', () => {
    expect([...VISIT_NOTE_SECTIONS]).toEqual(['chiefComplaints', 'examination', 'pastHistory', 'medicationHistory']);
  });

  it('has one route and one text limit per intent', () => {
    expect(VOICE_ROUTES).toEqual({
      'visit-note': 'voice/visit-note',
      'book-appointment': 'voice/appointment',
      'stock-count': 'voice/stock-count',
    });
    expect(VOICE_TEXT_LIMITS).toEqual({ 'visit-note': 8000, 'book-appointment': 500, 'stock-count': 500 });
  });

  it('names the status route', () => {
    expect(VOICE_STATUS_ROUTE).toBe('voice/status');
  });

  it('freezes every list and map', () => {
    expect(Object.isFrozen(VOICE_INTENTS)).toBe(true);
    expect(Object.isFrozen(VISIT_NOTE_SECTIONS)).toBe(true);
    expect(Object.isFrozen(VOICE_ROUTES)).toBe(true);
    expect(Object.isFrozen(VOICE_TEXT_LIMITS)).toBe(true);
  });
});
