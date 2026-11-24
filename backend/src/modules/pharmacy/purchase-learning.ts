import { randomUUID } from 'crypto';
import { matchProductSearch, normalizeProductSearch, ocrProductSearchQuery } from '../../shared/search/product-search';
import { canonicalPurchasePack, normalizedIdentity } from './purchase-invoice-identity';
import { purchaseFormsConflict, purchaseMatchMismatches } from './purchase-match-safety';

export type LearnableField = 'product' | 'manufacturer' | 'distributorName';
export type Provenance = 'OCR_KEPT' | 'HUMAN_CORRECTED' | 'LESSON_KEPT' | 'LESSON_OVERRIDDEN' | 'CATALOGUE';
export type Origin = 'HUMAN_REVIEW' | 'AUTOMATIC';
export type LessonTier = 'SUGGEST' | 'APPLY' | 'TRUSTED';

export interface OcrReadItem {
  key: string;
  productName: string;
  manufacturer?: string;
  packSize?: string;
  packUnitType?: string;
  batchNumber?: string;
  expiryMonth?: number;
  expiryYear?: number;
  quantityPurchased?: number;
}

export interface AppliedLesson {
  slot: string;
  field: LearnableField;
  from: string;
  to: string;
  drugId?: string;
  tier: LessonTier;
  lessonKey: string;
  support: number;
}

export interface CatalogueChange { slot: string; field: LearnableField; to: string }

export interface PurchaseOcrRead {
  version: 1;
  readId: string;
  promptVersion: string;
  header: { distributorName?: string; distributorGstin?: string };
  items: OcrReadItem[];
  applied: AppliedLesson[];
  catalogue?: CatalogueChange[];
}

export interface Lesson {
  key: string;
  field: LearnableField;
  supplierGstin: string;
  rawKey: string;
  finalValue: string;
  drugId?: string;
  independent: number;
  total: number;
  invoices: number;
  firstAt: Date;
  lastAt: Date;
  tier: LessonTier;
  alternatives: Array<{ finalValue: string; drugId?: string; support: number }>;
}

export interface LearnedCorrection { field: LearnableField; from: string; to: string; support: number; tier: LessonTier }

export interface LearningLine {
  productName: string;
  manufacturer?: string;
  packSize: string;
  packUnitType: string;
  productKind?: 'MEDICINE' | 'COSMETIC' | 'CONSUMABLE';
  batchNumber: string;
  expiryMonth: number;
  expiryYear: number;
  quantityPurchased: number;
  ocrFlags?: string[];
  ocrLineKey?: string;
  learnedCorrections?: LearnedCorrection[];
}

export interface LearningDraft<L extends LearningLine = LearningLine> {
  distributorName: string;
  distributorGstin: string;
  ocrFlags?: string[];
  items: L[];
  learnedCorrections?: LearnedCorrection[];
}

export interface DrugIdentity {
  name: string;
  manufacturerName: string;
  packSizeLabel: string;
  strength: string;
  dosageForm: string;
  type: string;
}

export interface LearningDrug {
  id: string;
  branchId: string;
  name: string;
  manufacturerName?: string | null;
  packSizeLabel?: string | null;
  strength?: string | null;
  dosageForm?: string | null;
  type?: string | null;
  isActive: boolean;
  isDiscontinued: boolean;
}

export interface LearningExample {
  invoiceId: string;
  slot: string;
  field: LearnableField;
  supplierGstin: string;
  rawKey: string;
  rawValue?: string | null;
  finalValue?: string | null;
  drugId?: string | null;
  provenance: Provenance;
  origin: Origin;
  appliedLessonKey?: string | null;
  identitySnapshot?: DrugIdentity | null;
  committedAt: Date;
  revokedAt?: Date | null;
}

export interface LearningExampleRow extends LearningExample {
  branchId: string;
  decidedBy: string;
  promptVersion: string | null;
}

export const productRawKey = (line: { productName?: string; packSize?: string; packUnitType?: string }) => {
  const name = normalizeProductSearch(ocrProductSearchQuery(line.productName || '').query);
  return name ? `${name}|${canonicalPurchasePack(line.packSize || '', line.packUnitType || '')}` : '';
};

type LineSource = { productName?: string; manufacturer?: string; packSize?: string; packUnitType?: string };
type HeaderSource = { distributorName?: string };

/**
 * Facts of one bill (GSTIN, invoice number/date, batch, expiry, quantities, money, pack,
 * strength, HSN) are never learnable: only these identity spellings are.
 */
const LINE_FIELDS = {
  product: { rawKey: productRawKey, read: (line: LineSource) => line.productName },
  manufacturer: {
    rawKey: (line: LineSource) => {
      const manufacturer = normalizeProductSearch(line.manufacturer), product = productRawKey(line);
      return manufacturer && product ? `${manufacturer}|${product}` : '';
    },
    read: (line: LineSource) => line.manufacturer,
  },
} satisfies Record<string, { rawKey(line: LineSource): string; read(line: LineSource): string | undefined }>;

const HEADER_FIELDS = {
  distributorName: { rawKey: (header: HeaderSource) => normalizedIdentity(header.distributorName), read: (header: HeaderSource) => header.distributorName },
} satisfies Record<string, { rawKey(header: HeaderSource): string; read(header: HeaderSource): string | undefined }>;

const FIELD_POLICY: Record<LearnableField, { trusted: boolean; crossSupplier: boolean; flag: string }> = {
  product: { trusted: true, crossSupplier: true, flag: 'learned_product_needs_confirmation' },
  manufacturer: { trusted: false, crossSupplier: true, flag: 'learned_manufacturer_needs_confirmation' },
  distributorName: { trusted: true, crossSupplier: false, flag: 'learned_distributor_needs_confirmation' },
};

export const LEARNED_FLAGS = Object.values(FIELD_POLICY).map(policy => policy.flag);
const TRUSTED_SPAN_MS = 14 * 24 * 60 * 60 * 1000;

const sameValue = (field: LearnableField, a: string | null | undefined, b: string | null | undefined) => field === 'product'
  ? normalizeProductSearch(ocrProductSearchQuery(a || '').query) === normalizeProductSearch(b)
  : normalizedIdentity(a) === normalizedIdentity(b);

export const lessonKey = (field: LearnableField, supplierGstin: string, rawKey: string) => `${field}:${supplierGstin}:${rawKey}`;

export function parseLessonKey(key: string): { field: LearnableField; supplierGstin: string; rawKey: string } | null {
  const [field, supplierGstin, ...rest] = String(key).split(':');
  const rawKey = rest.join(':');
  if (!Object.hasOwn(FIELD_POLICY, field) || !supplierGstin || !rawKey) return null;
  return { field: field as LearnableField, supplierGstin, rawKey };
}

export const drugIdentity = (drug: Omit<LearningDrug, 'id' | 'branchId' | 'isActive' | 'isDiscontinued'>): DrugIdentity => ({
  name: drug.name, manufacturerName: drug.manufacturerName || '', packSizeLabel: drug.packSizeLabel || '',
  strength: drug.strength || '', dosageForm: drug.dosageForm || '', type: drug.type || '',
});

const sameIdentity = (a: Partial<DrugIdentity> | null | undefined, b: DrugIdentity) =>
  !!a && (Object.keys(b) as Array<keyof DrugIdentity>).every(field => (a[field] || '') === b[field]);

export function buildOcrRead<D extends LearningDraft>(draft: D, documentId: string, promptVersion: string, readId = randomUUID().replace(/-/g, '').slice(0, 12)) {
  const items = draft.items.map((item, index) => ({ ...item, ocrLineKey: `${documentId}:${readId}:${index}` }));
  const read: PurchaseOcrRead = {
    version: 1, readId, promptVersion,
    header: { distributorName: draft.distributorName, distributorGstin: draft.distributorGstin },
    items: items.map(item => ({
      key: item.ocrLineKey, productName: item.productName, manufacturer: item.manufacturer, packSize: item.packSize,
      packUnitType: item.packUnitType, batchNumber: item.batchNumber, expiryMonth: item.expiryMonth,
      expiryYear: item.expiryYear, quantityPurchased: item.quantityPurchased,
    })),
    applied: [],
    catalogue: [],
  };
  return { read, draft: { ...draft, items } as D };
}

type PairableLine = { ocrLineKey?: string | null; batchNumber?: string; expiryMonth?: number; expiryYear?: number; quantityPurchased?: number };
export interface LinePairing<L> { read: OcrReadItem; line: L; by: 'key' | 'batch' }

const fingerprint = (line: PairableLine) => normalizedIdentity(line.batchNumber)
  ? [normalizedIdentity(line.batchNumber), Number(line.expiryMonth), Number(line.expiryYear), Number(line.quantityPurchased)].join('|') : '';

const groupBy = <T>(values: T[], key: (value: T) => string) => values.reduce((groups, value) => {
  const id = key(value);
  if (id) groups.set(id, [...(groups.get(id) || []), value]);
  return groups;
}, new Map<string, T[]>());

/** Pairs each committed line with the machine read it came from. Split, added and deleted lines stay unpaired. */
export function pairOcrLines<L extends PairableLine>(read: PurchaseOcrRead, lines: L[]): LinePairing<L>[] {
  const readByKey = new Map(read.items.map(item => [item.key, item]));
  const lineKeys = groupBy(lines, line => line.ocrLineKey || '');
  const pairs: LinePairing<L>[] = [];
  for (const line of lines) {
    const item = line.ocrLineKey ? readByKey.get(line.ocrLineKey) : undefined;
    if (item && lineKeys.get(line.ocrLineKey!)!.length === 1) pairs.push({ read: item, line, by: 'key' });
  }
  const pairedRead = new Set(pairs.map(pair => pair.read.key)), pairedLines = new Set(pairs.map(pair => pair.line));
  const readByPrint = groupBy(read.items.filter(item => !pairedRead.has(item.key)), fingerprint);
  const linesByPrint = groupBy<L>(lines.filter(line => !pairedLines.has(line)), fingerprint);
  for (const [print, items] of readByPrint) {
    const matches = linesByPrint.get(print);
    if (items.length === 1 && matches?.length === 1) pairs.push({ read: items[0], line: matches[0], by: 'batch' });
  }
  return pairs;
}

/** Chooses the read whose line keys the committed lines carry, else the newest one. */
export function pickOcrRead(reads: PurchaseOcrRead[], lines: PairableLine[]): PurchaseOcrRead | null {
  const used = (read: PurchaseOcrRead) => lines.filter(line => line.ocrLineKey?.split(':')[1] === read.readId).length;
  return reads.reduce<PurchaseOcrRead | null>((best, read) => !best || used(read) > used(best) ? read : best, null);
}

type CommittedLine = PairableLine & { lineNumber: number; productName: string; manufacturer?: string | null };

export function buildOutcomeExamples(input: {
  invoice: { id: string; branchId: string; distributorGstin: string; distributorName: string; items: CommittedLine[] };
  read: PurchaseOcrRead;
  committed: Array<{ lineNumber: number; drug: Omit<LearningDrug, 'branchId' | 'isActive' | 'isDiscontinued'> }>;
  origin: Origin;
  decidedBy: string;
  committedAt: Date;
}): LearningExampleRow[] {
  const { invoice, read, origin, decidedBy, committedAt } = input;
  const supplierGstin = invoice.distributorGstin.trim().toUpperCase();
  const drugs = new Map(input.committed.map(line => [line.lineNumber, line.drug]));
  const applied = (slot: string, field: LearnableField) => read.applied.find(lesson => lesson.slot === slot && lesson.field === field);
  const catalogue = (slot: string, field: LearnableField) => (read.catalogue || []).find(change => change.slot === slot && change.field === field);
  const rows: LearningExampleRow[] = [];
  const record = (slot: string, field: LearnableField, rawKey: string, rawValue: string | undefined, finalValue: string | undefined, drug?: { id: string } & DrugIdentity) => {
    if (!rawKey || !rawValue?.trim() || !finalValue?.trim()) return;
    const lesson = applied(slot, field), fromCatalogue = catalogue(slot, field);
    const provenance: Provenance = lesson
      ? (field === 'product' ? lesson.drugId === drug?.id : sameValue(field, lesson.to, finalValue)) ? 'LESSON_KEPT' : 'LESSON_OVERRIDDEN'
      : fromCatalogue && sameValue(field, fromCatalogue.to, finalValue) ? 'CATALOGUE'
        : sameValue(field, rawValue, finalValue) ? 'OCR_KEPT' : 'HUMAN_CORRECTED';
    rows.push({
      branchId: invoice.branchId, invoiceId: invoice.id, slot, field, supplierGstin, rawKey, rawValue, finalValue,
      drugId: drug?.id ?? null, provenance, origin, appliedLessonKey: lesson?.lessonKey ?? null,
      identitySnapshot: drug ? drugIdentity(drug) : null, decidedBy, promptVersion: read.promptVersion || null, committedAt,
    });
  };
  for (const { read: raw, line } of pairOcrLines(read, invoice.items)) {
    const drug = drugs.get(line.lineNumber);
    if (!drug) continue;
    record(raw.key, 'product', LINE_FIELDS.product.rawKey(raw), LINE_FIELDS.product.read(raw), drug.name, { id: drug.id, ...drugIdentity(drug) });
    // A learned product mapping also sets the master's manufacturer; that is not evidence about the manufacturer spelling.
    if (!applied(raw.key, 'product')) {
      record(raw.key, 'manufacturer', LINE_FIELDS.manufacturer.rawKey(raw), LINE_FIELDS.manufacturer.read(raw), line.manufacturer || undefined);
    }
  }
  if (normalizedIdentity(read.header.distributorGstin) === normalizedIdentity(supplierGstin)) {
    record('header', 'distributorName', HEADER_FIELDS.distributorName.rawKey(read.header), HEADER_FIELDS.distributorName.read(read.header), invoice.distributorName);
  }
  return rows;
}

/**
 * @cc [owner:nareshshah139,label:product;security] purchase-learning-human-support
 * Only human-reviewed, unrevoked outcomes MAY support a learned correction. AUTOMATIC and
 * catalogue-derived outcomes MUST NOT count as support, a lesson that was applied and kept MUST
 * NOT count as independent evidence, and any later human contradiction MUST restart support.
 */
export function deriveLessons(examples: LearningExample[], currentDrugs?: Map<string, Omit<LearningDrug, 'branchId' | 'isActive' | 'isDiscontinued'>>): Lesson[] {
  const groups = new Map<string, LearningExample[]>();
  const add = (key: string, example: LearningExample) => groups.set(key, [...(groups.get(key) || []), example]);
  for (const example of examples) {
    if (example.revokedAt || example.origin !== 'HUMAN_REVIEW' || example.provenance === 'CATALOGUE' || !Object.hasOwn(FIELD_POLICY, example.field)) continue;
    add(lessonKey(example.field, example.supplierGstin, example.rawKey), example);
    if (FIELD_POLICY[example.field].crossSupplier) add(lessonKey(example.field, '*', example.rawKey), example);
  }
  return [...groups].flatMap(([key, group]) => {
    const lesson = deriveLesson(key, group, currentDrugs);
    return lesson ? [lesson] : [];
  });
}

const valueOf = (example: LearningExample) => example.field === 'product' && example.drugId
  ? `drug:${example.drugId}` : `text:${normalizedIdentity(example.finalValue)}`;

function deriveLesson(key: string, group: LearningExample[], currentDrugs?: Map<string, Omit<LearningDrug, 'branchId' | 'isActive' | 'isDiscontinued'>>): Lesson | null {
  const ordered = [...group].sort((a, b) => new Date(a.committedAt).getTime() - new Date(b.committedAt).getTime());
  const newest = ordered[ordered.length - 1];
  const leading = valueOf(newest);
  let start = 0, contradictions = 0;
  ordered.forEach((example, index) => {
    if (example.provenance === 'LESSON_OVERRIDDEN' || valueOf(example) !== leading) {
      start = index + 1;
      contradictions++;
    }
  });
  const support = ordered.slice(start);
  const independent = support.filter(example => example.provenance === 'HUMAN_CORRECTED');
  if (!independent.length) return null;
  const total = independent.length + support.filter(example => example.provenance === 'LESSON_KEPT').length;
  const invoices = new Set(independent.map(example => example.invoiceId)).size;
  const { field, supplierGstin, rawKey } = parseLessonKey(key)!;
  const firstAt = new Date(support[0].committedAt), lastAt = new Date(newest.committedAt);
  let tier: LessonTier | null = null;
  if (supplierGstin === '*') {
    if (new Set(independent.map(example => example.supplierGstin)).size >= 2) tier = 'SUGGEST';
  } else {
    tier = 'SUGGEST';
    if (independent.length >= 2 && invoices >= 2) tier = 'APPLY';
    const current = newest.drugId ? currentDrugs?.get(newest.drugId) : undefined;
    const identityStable = field !== 'product' || (!!current && support.every(example => sameIdentity(example.identitySnapshot, drugIdentity(current))));
    if (tier === 'APPLY' && FIELD_POLICY[field].trusted && total >= 5 && contradictions === 0 &&
        lastAt.getTime() - firstAt.getTime() >= TRUSTED_SPAN_MS && identityStable) tier = 'TRUSTED';
  }
  if (!tier) return null;
  const alternatives = [...groupBy(ordered.filter(example => valueOf(example) !== leading && ['HUMAN_CORRECTED', 'LESSON_KEPT', 'OCR_KEPT'].includes(example.provenance)), valueOf).values()]
    .map(examples => ({ finalValue: examples[examples.length - 1].finalValue || '', ...(examples[0].drugId ? { drugId: examples[0].drugId } : {}), support: examples.length }));
  return {
    key, field, supplierGstin, rawKey, finalValue: newest.finalValue || '', ...(newest.drugId ? { drugId: newest.drugId } : {}),
    independent: independent.length, total, invoices, firstAt, lastAt, tier, alternatives,
  };
}

const manufacturerConflicts = (raw: string | undefined, saved: string | null | undefined) => !!raw?.trim() && !!saved?.trim()
  && !matchProductSearch(raw, { names: [saved] }, 'name') && !matchProductSearch(saved, { names: [raw] }, 'name');

/**
 * @cc [owner:nareshshah139,label:product;security] purchase-learning-identity-bound
 * A learned product mapping MUST NOT cross product strength, dosage form, pack or branch: every
 * application MUST re-check the current active branch product against the line as read, and a
 * failing check MUST leave the line unchanged. Below the trusted tier an applied lesson MUST leave
 * a blocking confirmation flag.
 */
export function learnedProductFits(line: LearningLine, drug: LearningDrug, branchId: string): boolean {
  return drug.branchId === branchId && drug.isActive && !drug.isDiscontinued && !!drug.packSizeLabel?.trim()
    && purchaseMatchMismatches(line, drug).every(reason => reason === 'Product names differ')
    && !purchaseFormsConflict(line.productName, drug)
    && canonicalPurchasePack(drug.packSizeLabel) === canonicalPurchasePack(line.packSize || '', line.packUnitType || '')
    && !manufacturerConflicts(line.manufacturer, drug.manufacturerName);
}

export function lessonLookupKeys(draft: LearningDraft): string[] {
  return [...new Set([
    ...draft.items.flatMap(line => [LINE_FIELDS.product.rawKey(line), LINE_FIELDS.manufacturer.rawKey(line)]),
    HEADER_FIELDS.distributorName.rawKey(draft),
  ].filter(Boolean))];
}

export function applyLessonsToDraft<D extends LearningDraft>(
  draft: D,
  lessons: Lesson[],
  drugs: Map<string, LearningDrug>,
  options: { branchId: string; trustedEnabled: boolean; supplier?: { name: string; gstNumber: string | null } },
): { draft: D; applied: AppliedLesson[]; suggestions: AppliedLesson[] } {
  const supplierGstin = draft.distributorGstin?.trim().toUpperCase() || '';
  const byKey = new Map(lessons.map(lesson => [lesson.key, lesson]));
  const find = (field: LearnableField, rawKey: string) => rawKey
    ? byKey.get(lessonKey(field, supplierGstin, rawKey)) ?? byKey.get(lessonKey(field, '*', rawKey)) : undefined;
  const applied: AppliedLesson[] = [], suggestions: AppliedLesson[] = [];
  const decide = (lesson: Lesson, slot: string, from: string, to: string, drugId?: string) => {
    const tier: LessonTier = lesson.tier === 'TRUSTED' && !options.trustedEnabled ? 'APPLY' : lesson.tier;
    const entry: AppliedLesson = { slot, field: lesson.field, from, to, ...(drugId ? { drugId } : {}), tier, lessonKey: lesson.key, support: lesson.total };
    (tier === 'SUGGEST' ? suggestions : applied).push(entry);
    return tier === 'SUGGEST' ? null : entry;
  };
  const correction = (entry: AppliedLesson): LearnedCorrection => ({ field: entry.field, from: entry.from, to: entry.to, support: entry.support, tier: entry.tier });
  const flagged = (flags: string[] | undefined, entry: AppliedLesson, cleared: string[] = []) => [
    ...(flags || []).filter(flag => !cleared.includes(flag)), ...(entry.tier === 'APPLY' ? [FIELD_POLICY[entry.field].flag] : []),
  ];

  const items = draft.items.map(line => {
    if (!line.ocrLineKey) return line;
    const product = find('product', LINE_FIELDS.product.rawKey(line));
    const drug = product?.drugId ? drugs.get(product.drugId) : undefined;
    if (product && drug && learnedProductFits(line, drug, options.branchId)) {
      const entry = decide(product, line.ocrLineKey, line.productName, drug.name, drug.id);
      if (entry) return {
        ...line, productName: drug.name, manufacturer: drug.manufacturerName || '', packSize: drug.packSizeLabel!,
        ocrFlags: flagged(line.ocrFlags, entry, ['missing_manufacturer', 'missing_packSize']),
        learnedCorrections: [...(line.learnedCorrections || []), correction(entry)],
      };
    }
    const manufacturer = find('manufacturer', LINE_FIELDS.manufacturer.rawKey(line));
    if (manufacturer && !sameValue('manufacturer', line.manufacturer, manufacturer.finalValue)) {
      const entry = decide(manufacturer, line.ocrLineKey, line.manufacturer || '', manufacturer.finalValue);
      if (entry) return {
        ...line, manufacturer: manufacturer.finalValue, ocrFlags: flagged(line.ocrFlags, entry),
        learnedCorrections: [...(line.learnedCorrections || []), correction(entry)],
      };
    }
    return line;
  });

  let header: Partial<LearningDraft> = {};
  const supplier = options.supplier;
  const distributor = find('distributorName', HEADER_FIELDS.distributorName.rawKey(draft));
  if (distributor && supplier && normalizedIdentity(supplier.gstNumber) === normalizedIdentity(supplierGstin)
      && sameValue('distributorName', distributor.finalValue, supplier.name) && !sameValue('distributorName', draft.distributorName, supplier.name)) {
    const entry = decide(distributor, 'header', draft.distributorName, supplier.name);
    if (entry) header = {
      distributorName: supplier.name, ocrFlags: flagged(draft.ocrFlags, entry),
      learnedCorrections: [...(draft.learnedCorrections || []), correction(entry)],
    };
  }
  return { draft: { ...draft, ...header, items } as D, applied, suggestions };
}

const weekStart = (date: Date) => {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
};
const rate = (numerator: number, denominator: number, scale = 100) => denominator ? Math.round(numerator / denominator * scale * 10) / 10 : null;

type MetricExample = Pick<LearningExample, 'invoiceId' | 'slot' | 'field' | 'supplierGstin' | 'rawValue' | 'finalValue' | 'provenance' | 'origin' | 'committedAt'>;

function metricSummary(examples: MetricExample[]) {
  const human = examples.filter(example => example.origin === 'HUMAN_REVIEW');
  const humanLines = human.filter(example => example.field === 'product').length;
  const touches = human.filter(example => ['HUMAN_CORRECTED', 'LESSON_OVERRIDDEN'].includes(example.provenance)).length;
  const kept = examples.filter(example => example.provenance === 'LESSON_KEPT').length;
  const overridden = examples.filter(example => example.provenance === 'LESSON_OVERRIDDEN').length;
  const invoices = new Set(examples.map(example => example.invoiceId));
  const automatic = new Set(examples.filter(example => example.origin === 'AUTOMATIC').map(example => example.invoiceId));
  const rawChanged = examples.filter(example => !sameValue(example.field, example.rawValue, example.finalValue)).length;
  return {
    lines: examples.filter(example => example.field === 'product').length,
    reviewedLines: humanLines,
    reviewerTouches: touches,
    touchesPer100Lines: rate(touches, humanLines),
    rawCorrectionRate: rate(rawChanged, examples.length),
    invoices: invoices.size,
    automaticInvoices: automatic.size,
    autoCommitRate: rate(automatic.size, invoices.size),
    lessonsKept: kept,
    lessonsOverridden: overridden,
    overrideRate: rate(overridden, kept + overridden),
  };
}

/** Weekly (UTC Monday) learning outcomes, overall and per supplier GSTIN. */
export function summarizeLearningMetrics(examples: MetricExample[]) {
  const byWeek = groupBy(examples, example => weekStart(new Date(example.committedAt)));
  const bySupplier = groupBy(examples, example => `${weekStart(new Date(example.committedAt))}|${example.supplierGstin}`);
  return {
    totals: metricSummary(examples),
    weeks: [...byWeek].sort(([a], [b]) => a.localeCompare(b)).map(([week, rows]) => ({ weekStart: week, ...metricSummary(rows) })),
    bySupplier: [...bySupplier].sort(([a], [b]) => a.localeCompare(b)).map(([key, rows]) => {
      const [week, supplierGstin] = key.split('|');
      return { weekStart: week, supplierGstin, ...metricSummary(rows) };
    }),
  };
}
