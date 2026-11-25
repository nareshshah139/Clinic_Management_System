import {
  applyLessonsToDraft, buildOcrRead, buildOutcomeExamples, deriveLessons, drugIdentity, LearningDrug, LearningExample,
  lessonLookupKeys, pairOcrLines, parseLessonKey, PurchaseOcrRead, summarizeLearningMetrics, trustedLessonsEnabled,
} from '../purchase-learning';

const GSTIN = '36AAACM1234F1Z5';
const OTHER_GSTIN = '29AAACX9999F1Z5';
const KEY = 'dolo 650 tablet|15';
const at = (day: number) => new Date(Date.UTC(2026, 0, 1 + day));
const dolo: LearningDrug = {
  id: 'drug-dolo', branchId: 'branch-1', name: 'Dolo 650mg Tablet', manufacturerName: 'Micro Labs', packSizeLabel: '15',
  strength: '650mg', dosageForm: 'Tablet', type: 'allopathy', isActive: true, isDiscontinued: false,
};
const line = (overrides: Record<string, unknown> = {}) => ({
  productName: 'DOLO-650 TAB', manufacturer: 'MICRO LABS', packSize: '15', packUnitType: 'Strip', batchNumber: 'B1',
  expiryMonth: 12, expiryYear: 2099, quantityPurchased: 10, ocrFlags: [] as string[], ocrLineKey: 'doc-1:r1:0', ...overrides,
});
const draft = (items = [line()], overrides: Record<string, unknown> = {}) => ({
  distributorName: 'Micro Distributors', distributorGstin: GSTIN, ocrFlags: [] as string[], items, ...overrides,
});
const example = (overrides: Partial<LearningExample> = {}): LearningExample => ({
  invoiceId: 'inv-1', slot: 'doc-1:r1:0', field: 'product', supplierGstin: GSTIN, rawKey: KEY, rawValue: 'DOLO-650 TAB',
  finalValue: 'Dolo 650mg Tablet', drugId: 'drug-dolo', provenance: 'HUMAN_CORRECTED', origin: 'HUMAN_REVIEW',
  identitySnapshot: drugIdentity(dolo), committedAt: at(0), ...overrides,
});
const supplierLesson = (examples: LearningExample[], drugs = new Map([[dolo.id, dolo]])) =>
  deriveLessons(examples, drugs).find(lesson => lesson.supplierGstin === GSTIN && lesson.field === 'product');
const trustedHistory = (origin: LearningExample['origin'] = 'HUMAN_REVIEW') => [
  example({ invoiceId: 'inv-1', committedAt: at(0) }),
  example({ invoiceId: 'inv-2', committedAt: at(15) }),
  ...[3, 4, 5].map(n => example({ invoiceId: `inv-${n}`, provenance: 'LESSON_KEPT', origin, committedAt: at(15 + n) })),
];

describe('Purchase OCR learning', () => {
  it('keys each machine-read line and keeps the raw read without changing the extracted draft', () => {
    const extracted = draft([line({ ocrLineKey: undefined }), line({ ocrLineKey: undefined, productName: 'CROCIN 500', batchNumber: 'B2' })]);
    const { read, draft: keyed } = buildOcrRead(extracted, 'doc-1', '2026-09-14.3', 'r1');
    expect(keyed.items.map(item => item.ocrLineKey)).toEqual(['doc-1:r1:0', 'doc-1:r1:1']);
    expect(extracted.items[0].ocrLineKey).toBeUndefined();
    expect(read).toEqual({
      version: 1, readId: 'r1', promptVersion: '2026-09-14.3',
      header: { distributorName: 'Micro Distributors', distributorGstin: GSTIN },
      items: [
        { key: 'doc-1:r1:0', productName: 'DOLO-650 TAB', manufacturer: 'MICRO LABS', packSize: '15', packUnitType: 'Strip', batchNumber: 'B1', expiryMonth: 12, expiryYear: 2099, quantityPurchased: 10 },
        { key: 'doc-1:r1:1', productName: 'CROCIN 500', manufacturer: 'MICRO LABS', packSize: '15', packUnitType: 'Strip', batchNumber: 'B2', expiryMonth: 12, expiryYear: 2099, quantityPurchased: 10 },
      ],
      applied: [], catalogue: [],
    });
    expect(lessonLookupKeys(keyed)).toEqual([KEY, `micro labs|${KEY}`, 'crocin 500|15', `micro labs|crocin 500|15`, 'MICRODISTRIBUTORS']);
  });

  it('pairs committed lines by line key, then by a unique batch, expiry and quantity, and leaves added lines unpaired', () => {
    const { read } = buildOcrRead(draft([line(), line({ batchNumber: 'B2' }), line({ batchNumber: 'B3' })]), 'doc-1', 'v', 'r1');
    const committed = [
      { lineNumber: 1, ocrLineKey: 'doc-1:r1:2', batchNumber: 'B3', expiryMonth: 12, expiryYear: 2099, quantityPurchased: 10 },
      { lineNumber: 2, ocrLineKey: undefined, batchNumber: 'b-1', expiryMonth: 12, expiryYear: 2099, quantityPurchased: 10 },
      { lineNumber: 3, ocrLineKey: undefined, batchNumber: 'B9', expiryMonth: 12, expiryYear: 2099, quantityPurchased: 10 },
    ];
    expect(pairOcrLines(read, committed).map(pair => [pair.read.key, pair.line.lineNumber, pair.by])).toEqual([
      ['doc-1:r1:2', 1, 'key'], ['doc-1:r1:0', 2, 'batch'],
    ]);
    const duplicated = [committed[0], { ...committed[0], lineNumber: 4 }];
    expect(pairOcrLines(read, duplicated)).toEqual([]);
  });

  it('records what the reviewer did with each read field at commit', () => {
    const { read } = buildOcrRead(draft([line(), line({ productName: 'Crocin 500 Tablet', manufacturer: 'GSK', batchNumber: 'B2' }), line({ productName: 'PAN 40', manufacturer: 'ALKEM', batchNumber: 'B3' })], { distributorName: 'MICRO DISTRIBUTER' }), 'doc-1', 'v1', 'r1');
    read.applied = [{ slot: 'doc-1:r1:2', field: 'product', from: 'PAN 40', to: 'Pan 40mg Tablet', drugId: 'drug-pan', tier: 'APPLY', lessonKey: 'product:x:pan 40|15', support: 2 }];
    read.catalogue = [{ slot: 'doc-1:r1:1', field: 'manufacturer', to: 'GlaxoSmithKline' }];
    const committed = (drugId: string, name: string, manufacturerName: string) => ({ id: drugId, name, manufacturerName, packSizeLabel: '15', strength: '', dosageForm: 'Tablet', type: 'allopathy' });
    const rows = buildOutcomeExamples({
      invoice: { id: 'inv-9', branchId: 'branch-1', distributorGstin: GSTIN, distributorName: 'Micro Distributors', items: [
        { lineNumber: 1, ocrLineKey: 'doc-1:r1:0', productName: 'Dolo 650mg Tablet', manufacturer: 'Micro Labs' },
        { lineNumber: 2, ocrLineKey: 'doc-1:r1:1', productName: 'Crocin 500 Tablet', manufacturer: 'GlaxoSmithKline' },
        { lineNumber: 3, ocrLineKey: 'doc-1:r1:2', productName: 'Pantop 40 Tablet', manufacturer: 'Aristo' },
      ] },
      read,
      committed: [
        { lineNumber: 1, drug: committed('drug-dolo', 'Dolo 650mg Tablet', 'Micro Labs') },
        { lineNumber: 2, drug: committed('drug-crocin', 'Crocin 500 Tablet', 'GlaxoSmithKline') },
        { lineNumber: 3, drug: committed('drug-pantop', 'Pantop 40 Tablet', 'Aristo') },
      ],
      origin: 'HUMAN_REVIEW', decidedBy: 'user-1', committedAt: at(3),
    });
    expect(rows.map(row => [row.slot, row.field, row.rawKey, row.finalValue, row.drugId, row.provenance, row.appliedLessonKey])).toEqual([
      ['doc-1:r1:0', 'product', KEY, 'Dolo 650mg Tablet', 'drug-dolo', 'HUMAN_CORRECTED', null],
      ['doc-1:r1:0', 'manufacturer', `micro labs|${KEY}`, 'Micro Labs', null, 'OCR_KEPT', null],
      ['doc-1:r1:1', 'product', 'crocin 500 tablet|15', 'Crocin 500 Tablet', 'drug-crocin', 'OCR_KEPT', null],
      ['doc-1:r1:1', 'manufacturer', 'gsk|crocin 500 tablet|15', 'GlaxoSmithKline', null, 'CATALOGUE', null],
      ['doc-1:r1:2', 'product', 'pan 40|15', 'Pantop 40 Tablet', 'drug-pantop', 'LESSON_OVERRIDDEN', 'product:x:pan 40|15'],
      ['header', 'distributorName', 'MICRODISTRIBUTER', 'Micro Distributors', null, 'HUMAN_CORRECTED', null],
    ]);
    expect(rows[0]).toMatchObject({ branchId: 'branch-1', invoiceId: 'inv-9', supplierGstin: GSTIN, origin: 'HUMAN_REVIEW', decidedBy: 'user-1', promptVersion: 'v1', committedAt: at(3),
      identitySnapshot: { name: 'Dolo 650mg Tablet', manufacturerName: 'Micro Labs', packSizeLabel: '15', strength: '', dosageForm: 'Tablet', type: 'allopathy' } });
  });

  it('never learns the supplier name when the committed GSTIN differs from the one read', () => {
    const { read } = buildOcrRead(draft([line()], { distributorGstin: OTHER_GSTIN }), 'doc-1', 'v', 'r1');
    const rows = buildOutcomeExamples({ invoice: { id: 'inv', branchId: 'b', distributorGstin: GSTIN, distributorName: 'Micro Distributors',
      items: [{ lineNumber: 1, ocrLineKey: 'doc-1:r1:0', productName: 'Dolo 650mg Tablet', manufacturer: 'Micro Labs' }] },
    read, committed: [{ lineNumber: 1, drug: dolo }], origin: 'HUMAN_REVIEW', decidedBy: 'u', committedAt: at(0) });
    expect(rows.map(row => row.field)).toEqual(['product', 'manufacturer']);
  });

  it('applies a lesson after two independent corrections on two invoices', () => {
    expect(supplierLesson([example({ invoiceId: 'inv-1' }), example({ invoiceId: 'inv-2', committedAt: at(20) })])).toEqual({
      key: `product:${GSTIN}:${KEY}`, field: 'product', supplierGstin: GSTIN, rawKey: KEY, rawValue: 'DOLO-650 TAB', finalValue: 'Dolo 650mg Tablet',
      drugId: 'drug-dolo', independent: 2, total: 2, invoices: 2, firstAt: at(0), lastAt: at(20), tier: 'APPLY', alternatives: [],
    });
    expect(supplierLesson([example({ invoiceId: 'inv-1' }), example({ invoiceId: 'inv-1', slot: 'doc-1:r1:1', committedAt: at(1) })])?.tier).toBe('SUGGEST');
  });

  it('drops back to a suggestion when a reviewer chose something else in between', () => {
    const lesson = supplierLesson([
      example({ invoiceId: 'inv-1', committedAt: at(0) }),
      example({ invoiceId: 'inv-2', committedAt: at(5), drugId: 'drug-other', finalValue: 'Dolopar Tablet' }),
      example({ invoiceId: 'inv-3', committedAt: at(10) }),
    ]);
    expect(lesson).toMatchObject({ tier: 'SUGGEST', drugId: 'drug-dolo', independent: 1, total: 1,
      alternatives: [{ finalValue: 'Dolopar Tablet', drugId: 'drug-other', support: 1 }] });
  });

  it('forgets a lesson when the reviewer overrides it and relearns only from new corrections', () => {
    const history = [...trustedHistory(), example({ invoiceId: 'inv-6', committedAt: at(30), provenance: 'LESSON_OVERRIDDEN', drugId: 'drug-other', finalValue: 'Dolopar Tablet' })];
    expect(deriveLessons(history, new Map([[dolo.id, dolo]]))).toEqual([]);
    const relearned = supplierLesson([...history, example({ invoiceId: 'inv-7', committedAt: at(31), drugId: 'drug-other', finalValue: 'Dolopar Tablet' })]);
    expect(relearned).toMatchObject({ tier: 'SUGGEST', drugId: 'drug-other', independent: 1, total: 1 });
  });

  it('reaches TRUSTED only from human-reviewed outcomes; automatic commits never add support', () => {
    expect(supplierLesson(trustedHistory('HUMAN_REVIEW'))).toMatchObject({ tier: 'TRUSTED', independent: 2, total: 5, invoices: 2 });
    expect(supplierLesson(trustedHistory('AUTOMATIC'))).toMatchObject({ tier: 'APPLY', independent: 2, total: 2 });
    expect(supplierLesson(trustedHistory().map(row => row.provenance === 'LESSON_KEPT' ? { ...row, revokedAt: at(40) } : row))).toMatchObject({ tier: 'APPLY', total: 2 });
  });

  it('does not count a kept lesson as independent evidence', () => {
    const lesson = supplierLesson([
      example({ invoiceId: 'inv-1', committedAt: at(0) }),
      ...[2, 3, 4, 5].map(n => example({ invoiceId: `inv-${n}`, provenance: 'LESSON_KEPT', committedAt: at(10 * n) })),
    ]);
    expect(lesson).toMatchObject({ tier: 'SUGGEST', independent: 1, total: 5 });
  });

  it('withholds TRUSTED for a short history, a past contradiction, a catalogue-only outcome or an edited product', () => {
    const quick = trustedHistory().map((row, index) => ({ ...row, committedAt: at(index) }));
    expect(supplierLesson(quick)?.tier).toBe('APPLY');
    const contradicted = [example({ invoiceId: 'inv-0', committedAt: at(-5), drugId: 'drug-other', finalValue: 'Dolopar Tablet' }), ...trustedHistory()];
    expect(supplierLesson(contradicted)?.tier).toBe('APPLY');
    expect(supplierLesson(trustedHistory(), new Map([[dolo.id, { ...dolo, packSizeLabel: '10' }]]))?.tier).toBe('APPLY');
    expect(deriveLessons([example({ provenance: 'CATALOGUE' })])).toEqual([]);
  });

  it('suggests across suppliers only when two suppliers agree', () => {
    const lessons = deriveLessons([example(), example({ invoiceId: 'inv-2', supplierGstin: OTHER_GSTIN, committedAt: at(1) })]);
    expect(lessons.map(lesson => [lesson.supplierGstin, lesson.tier, lesson.independent])).toEqual([
      [GSTIN, 'SUGGEST', 1], ['*', 'SUGGEST', 2], [OTHER_GSTIN, 'SUGGEST', 1],
    ]);
    expect(deriveLessons([example()]).map(lesson => lesson.supplierGstin)).toEqual([GSTIN]);
  });

  describe('applying lessons to a new read', () => {
    const lessonAt = (tier: 'SUGGEST' | 'APPLY' | 'TRUSTED') => ({ ...supplierLesson(trustedHistory())!, tier });
    const apply = (tier: 'SUGGEST' | 'APPLY' | 'TRUSTED', input = draft(), drug: LearningDrug = dolo, trustedEnabled = true) =>
      applyLessonsToDraft(input, [lessonAt(tier)], new Map([[drug.id, drug]]), { branchId: 'branch-1', trustedEnabled });

    it('pre-fills the product from the master and asks for confirmation at APPLY', () => {
      const result = apply('APPLY');
      expect(result.draft.items[0]).toEqual({ ...line(), productName: 'Dolo 650mg Tablet', manufacturer: 'Micro Labs', packSize: '15',
        ocrFlags: ['learned_product_needs_confirmation'],
        learnedCorrections: [{ field: 'product', from: 'DOLO-650 TAB', to: 'Dolo 650mg Tablet', support: 5, tier: 'APPLY',
          restore: { productName: 'DOLO-650 TAB', manufacturer: 'MICRO LABS', packSize: '15' },
          applied: { productName: 'Dolo 650mg Tablet', manufacturer: 'Micro Labs', packSize: '15' }, restoreFlags: [] }] });
      expect(result.applied).toEqual([{ slot: 'doc-1:r1:0', field: 'product', from: 'DOLO-650 TAB', to: 'Dolo 650mg Tablet', drugId: 'drug-dolo',
        tier: 'APPLY', lessonKey: `product:${GSTIN}:${KEY}`, support: 5 }]);
      expect(result.suggestions).toEqual([]);
    });

    it('records what the read had so a product lesson can be undone completely', () => {
      const read = draft([line({ manufacturer: '', ocrFlags: ['missing_manufacturer'] })]);
      const corrected = apply('APPLY', read).draft.items[0];
      expect(corrected).toMatchObject({ manufacturer: 'Micro Labs', ocrFlags: ['learned_product_needs_confirmation'] });
      expect(corrected.learnedCorrections![0]).toMatchObject({
        restore: { productName: 'DOLO-650 TAB', manufacturer: '', packSize: '15' },
        applied: { productName: 'Dolo 650mg Tablet', manufacturer: 'Micro Labs', packSize: '15' }, restoreFlags: ['missing_manufacturer'],
      });
    });

    it('adds no confirmation flag at TRUSTED unless trusted lessons are switched off', () => {
      expect(apply('TRUSTED').draft.items[0]).toMatchObject({ productName: 'Dolo 650mg Tablet', ocrFlags: [] });
      expect(apply('TRUSTED', draft(), dolo, false).draft.items[0]).toMatchObject({ productName: 'Dolo 650mg Tablet', ocrFlags: ['learned_product_needs_confirmation'] });
    });

    it('only suggests at SUGGEST and leaves the line as read', () => {
      const result = apply('SUGGEST');
      expect(result.draft.items[0]).toEqual(line());
      expect(result.suggestions.map(entry => [entry.from, entry.to, entry.tier])).toEqual([['DOLO-650 TAB', 'Dolo 650mg Tablet', 'SUGGEST']]);
    });

    it('never crosses packs because the pack is part of the learned key', () => {
      const result = apply('TRUSTED', draft([line({ packSize: '10' })]));
      expect(result.draft.items[0]).toEqual(line({ packSize: '10' }));
      expect(result.applied).toEqual([]);
    });

    it.each([
      ['strength', { name: 'Dolo 500mg Tablet', strength: '500mg' }],
      ['dosage form', { name: 'Dolo 650mg Suspension', dosageForm: 'Suspension' }],
      ['pack', { packSizeLabel: '10' }],
      ['branch', { branchId: 'branch-2' }],
      ['active product', { isActive: false }],
      ['manufacturer', { manufacturerName: 'Cipla' }],
    ])('blocks the mapping when the current product differs in %s', (_reason, change) => {
      const result = apply('TRUSTED', draft(), { ...dolo, ...change });
      expect(result.draft.items[0]).toEqual(line());
      expect(result.applied).toEqual([]);
      expect(result.suggestions).toEqual([]);
    });

    it('records the manufacturer the lesson wrote so Undo can spot a later hand edit', () => {
      const lesson = deriveLessons([1, 2].map(n => example({
        invoiceId: `inv-${n}`, field: 'manufacturer', rawKey: `micro labz|${KEY}`, rawValue: 'MICRO LABZ', finalValue: 'Micro Labs',
        drugId: null, identitySnapshot: null, committedAt: at(n),
      })));
      const result = applyLessonsToDraft(draft([line({ manufacturer: 'MICRO LABZ' })]), lesson, new Map(), { branchId: 'branch-1', trustedEnabled: true });
      expect(result.draft.items[0]).toMatchObject({ manufacturer: 'Micro Labs' });
      expect(result.draft.items[0].learnedCorrections).toEqual([{ field: 'manufacturer', from: 'MICRO LABZ', to: 'Micro Labs', support: 2, tier: 'APPLY',
        restore: { manufacturer: 'MICRO LABZ' }, applied: { manufacturer: 'Micro Labs' }, restoreFlags: [] }]);
    });

    it('rewrites the supplier name only to the saved supplier for the GSTIN read', () => {
      const lesson = deriveLessons([
        example({ field: 'distributorName', rawKey: 'MICRODISTRIBUTER', drugId: null, finalValue: 'Micro Distributors', identitySnapshot: null }),
        example({ field: 'distributorName', rawKey: 'MICRODISTRIBUTER', drugId: null, finalValue: 'Micro Distributors', identitySnapshot: null, invoiceId: 'inv-2', committedAt: at(3) }),
      ]);
      const input = draft([line()], { distributorName: 'MICRO DISTRIBUTER' });
      const saved = applyLessonsToDraft(input, lesson, new Map(), { branchId: 'branch-1', trustedEnabled: true, supplier: { name: 'Micro Distributors', gstNumber: GSTIN } });
      expect(saved.draft).toMatchObject({ distributorName: 'Micro Distributors', ocrFlags: ['learned_distributor_needs_confirmation'],
        learnedCorrections: [{ field: 'distributorName', from: 'MICRO DISTRIBUTER', to: 'Micro Distributors', support: 2, tier: 'APPLY',
          restore: { distributorName: 'MICRO DISTRIBUTER' }, applied: { distributorName: 'Micro Distributors' }, restoreFlags: [] }] });
      const renamed = applyLessonsToDraft(input, lesson, new Map(), { branchId: 'branch-1', trustedEnabled: true, supplier: { name: 'Micro Pharma Agencies', gstNumber: GSTIN } });
      expect(renamed.draft.distributorName).toBe('MICRO DISTRIBUTER');
    });
  });

  it('parses a lesson key whose raw text contains separators', () => {
    expect(parseLessonKey('manufacturer:*:micro: labs|dolo|15')).toEqual({ field: 'manufacturer', supplierGstin: '*', rawKey: 'micro: labs|dolo|15' });
    expect(parseLessonKey('constructor:x:y')).toBeNull();
  });

  it('turns trusted lessons off for any spelling of off and leaves them on otherwise', () => {
    expect(['off', 'OFF', ' Off '].map(trustedLessonsEnabled)).toEqual([false, false, false]);
    expect([undefined, '', 'on', 'false'].map(trustedLessonsEnabled)).toEqual([true, true, true, true]);
  });

  it('summarizes reviewer touches, raw corrections, automation and overrides by week', () => {
    const rows = [
      example({ invoiceId: 'a', committedAt: at(4) }),
      example({ invoiceId: 'a', slot: 's2', provenance: 'OCR_KEPT', rawValue: 'Dolo 650mg Tablet', committedAt: at(4) }),
      example({ invoiceId: 'b', provenance: 'LESSON_KEPT', committedAt: at(5) }),
      example({ invoiceId: 'c', provenance: 'LESSON_OVERRIDDEN', finalValue: 'Dolopar Tablet', committedAt: at(6) }),
      example({ invoiceId: 'd', provenance: 'LESSON_KEPT', origin: 'AUTOMATIC', committedAt: at(12) }),
    ];
    const summary = summarizeLearningMetrics(rows);
    expect(summary.totals).toEqual({ lines: 5, reviewedLines: 4, reviewerTouches: 2, touchesPer100Lines: 40, rawCorrectionRate: 80,
      invoices: 4, automaticInvoices: 1, autoCommitRate: 25, lessonsKept: 2, lessonsOverridden: 1, overrideRate: 33.3 });
    expect(summary.weeks.map(week => [week.weekStart, week.reviewedLines, week.touchesPer100Lines, week.autoCommitRate])).toEqual([
      ['2026-01-05', 4, 50, 0], ['2026-01-12', 0, 0, 100],
    ]);
    expect(summary.bySupplier.map(row => [row.weekStart, row.supplierGstin, row.lines])).toEqual([['2026-01-05', GSTIN, 4], ['2026-01-12', GSTIN, 1]]);
  });
});
