import { VOICE_INTENT_SPECS, segmentTranscript, spokenIn } from './voice-intents';

describe('segmentTranscript', () => {
  it('cuts into trimmed slices of the input, in order', () => {
    const input = 'Itching for two weeks. On exam, papules.';
    const sentences = segmentTranscript(input);
    expect(sentences).toEqual(['Itching for two weeks.', 'On exam, papules.']);
    let from = 0;
    for (const s of sentences) {
      const at = input.indexOf(s, from);
      expect(at).toBeGreaterThanOrEqual(from);
      from = at + s.length;
    }
  });

  it('keeps text without terminal punctuation as one sentence', () => {
    expect(segmentTranscript('  itching since monday ')).toEqual(['itching since monday']);
  });

  it('splits on newlines and drops empties', () => {
    expect(segmentTranscript('one\n\ntwo?  three!')).toEqual(['one', 'two?', 'three!']);
  });
});

describe('visit-note sanitize', () => {
  const spec = VOICE_INTENT_SPECS['visit-note'];
  const heard = 'Itching for two weeks. On exam, papules. Takes cetirizine. Mild fever.';
  const run = (raw: unknown) => {
    const prepared = spec.prepare(heard);
    return spec.sanitize(raw, heard, prepared);
  };

  it('keeps valid labels and puts out-of-range, duplicate and missing indexes in unsorted', () => {
    const result = run({
      assignments: [
        { i: 0, section: 'chiefComplaints' },
        { i: 1, section: 'examination' },
        { i: 1, section: 'pastHistory' },
        { i: 9, section: 'examination' },
        { i: -1, section: 'examination' },
        { i: 1.5, section: 'examination' },
      ],
    });
    expect(result.heard).toBe(heard);
    expect(result.items.map((x) => x.section)).toEqual(['chiefComplaints', 'examination', 'unsorted', 'unsorted']);
  });

  it('never emits text that is not one of the sentences', () => {
    const sentences = segmentTranscript(heard);
    const result = run({ assignments: [{ i: 0, section: 'chiefComplaints', text: 'invented diagnosis' }] });
    for (const item of result.items) expect(sentences).toContain(item.text);
    expect(Object.keys(result.items[0]).sort()).toEqual(['section', 'text']);
  });

  it('turns a section outside the four keys into unsorted', () => {
    const result = run({ assignments: [{ i: 0, section: 'diagnosis' }] });
    expect(result.items[0].section).toBe('unsorted');
  });

  it('labels everything unsorted when the model returns garbage', () => {
    for (const raw of [null, 'x', 5, {}, { assignments: 'no' }]) {
      expect(run(raw).items.every((x) => x.section === 'unsorted')).toBe(true);
    }
  });
});

describe('book-appointment sanitize', () => {
  const spec = VOICE_INTENT_SPECS['book-appointment'];
  const heard = 'Book Anita Rao with Dr Mehta tomorrow at 4 pm';
  const full = {
    patientName: 'Anita Rao',
    doctorName: 'Dr Mehta',
    dateKind: 'TOMORROW',
    weekday: null,
    day: null,
    month: null,
    year: null,
    hour: 4,
    minute: 0,
    meridiem: 'PM',
  };
  const run = (fields: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    spec.sanitize({ ...extra, fields }, heard, spec.prepare(heard)) as any;

  it('keeps spoken, in-range values', () => {
    const result = run(full);
    expect(result.heard).toBe(heard);
    expect(result.fields).toEqual(full);
  });

  it('drops patientId, extra keys, an out-of-range hour and a name that was not heard', () => {
    const result = run(
      { ...full, patientId: 'p-1', hour: 37, patientName: 'Somebody Else', surprise: 1 },
      { patientId: 'p-2' },
    );
    expect(result.patientId).toBeUndefined();
    expect(result.fields.patientId).toBeUndefined();
    expect(result.fields.surprise).toBeUndefined();
    expect(result.fields.hour).toBeNull();
    expect(result.fields.patientName).toBeNull();
    expect(Object.keys(result.fields).sort()).toEqual(Object.keys(full).sort());
  });

  it('nulls enum values outside the lists and non-integers', () => {
    const result = run({ ...full, dateKind: 'NEXTYEAR', meridiem: 'noon', minute: 30.5 });
    expect(result.fields.dateKind).toBeNull();
    expect(result.fields.meridiem).toBeNull();
    expect(result.fields.minute).toBeNull();
  });

  it('returns all-null fields for a non-object reply', () => {
    const result = spec.sanitize('nope', heard, spec.prepare(heard)) as any;
    expect(Object.values(result.fields).every((v) => v === null)).toBe(true);
  });
});

describe('stock-count sanitize', () => {
  const spec = VOICE_INTENT_SPECS['stock-count'];
  const heard = 'Dolo 650 batch AB-1234 forty strips';
  const run = (fields: unknown) => spec.sanitize({ fields }, heard, spec.prepare(heard)) as any;

  it('keeps a spoken name, a batch matching after normalising, and a bounded integer quantity', () => {
    const result = run({ productName: 'dolo 650', batchNumber: 'AB1234', quantity: 40, unitWord: 'strips' });
    expect(result.fields).toEqual({ productName: 'dolo 650', batchNumber: 'AB1234', quantity: 40, unitWord: 'strips' });
  });

  it('nulls a name that was not heard, a batch that was not said and a bad quantity', () => {
    const result = run({ productName: 'Crocin', batchNumber: 'ZZ9', quantity: 1_000_001, unitWord: 'boxes' });
    expect(result.fields).toEqual({ productName: null, batchNumber: null, quantity: null, unitWord: null });
    expect(run({ quantity: 2.5 }).fields.quantity).toBeNull();
  });
});

describe('spokenIn', () => {
  it('ignores case and whitespace', () => {
    expect(spokenIn('Anita   RAO today', 'anita rao')).toBe(true);
    expect(spokenIn('Anita Rao', 'Sita')).toBe(false);
    expect(spokenIn('Anita Rao', '')).toBe(false);
  });
});
