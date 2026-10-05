import { createHash } from 'node:crypto';

type PrescriptionLine = {
  sourceItem?: Record<string, unknown>;
  drugName: string;
  genericName?: string | null;
  drugId?: string | null;
  inventoryItemId?: string | null;
  dosage?: string | number | null;
  dosageUnit?: string | null;
  frequency?: string | null;
  duration?: string | number | null;
  durationUnit?: string | null;
  instructions?: string | null;
  prescribedQuantity?: number | null;
  sourceLineKey?: string;
};
type SavedLine = PrescriptionLine & {
  id: string;
  originalText?: string | null;
  metadata?: unknown;
  createdAt?: Date;
};

const clinicalFields = [
  'drugName',
  'genericName',
  'dosage',
  'dosageUnit',
  'frequency',
  'duration',
  'durationUnit',
  'instructions',
  'prescribedQuantity',
] as const;
const text = (value: unknown) =>
  value == null
    ? ''
    : String(value).normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
const clinicalSnapshot = (line: PrescriptionLine) =>
  clinicalFields.map((field) => text(line[field]));
const normalizedSourceFields = new Set<string>([
  ...clinicalFields,
  'drugId',
  'inventoryItemId',
  'quantity',
  'totalQuantity',
  'qty',
]);
const canonicalValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [
          key,
          canonicalValue((value as Record<string, unknown>)[key]),
        ]),
    );
  }
  return typeof value === 'string' ? text(value) : value;
};
const additionalSnapshot = (source: Record<string, unknown> = {}) =>
  Object.keys(source)
    .sort()
    .filter(
      (key) =>
        !normalizedSourceFields.has(key) &&
        source[key] != null &&
        (typeof source[key] !== 'string' || text(source[key]) !== ''),
    )
    .map((key) => [key, canonicalValue(source[key])]);
export const lineMetadata = (line: {
  metadata?: unknown;
}): Record<string, unknown> =>
  line.metadata &&
  typeof line.metadata === 'object' &&
  !Array.isArray(line.metadata)
    ? (line.metadata as Record<string, unknown>)
    : {};

/**
 * @cc [owner:nareshshah139,label:product] prescription-line-source-identity
 * A line key MUST cover the complete persisted prescription item, including route, timing,
 * application, taper, dose patterns and warnings beyond the normalized base fields. Empty fields
 * may be omitted; false and zero MUST remain distinct. Equal snapshots MUST receive separate
 * occurrence keys, and reordering distinct snapshots MUST preserve keys.
 */
export function prescriptionLineKeys(lines: PrescriptionLine[]): string[] {
  const occurrences = new Map<string, number>();
  return lines.map((line) => {
    const additional = additionalSnapshot(line.sourceItem);
    const signature = JSON.stringify([
      ...clinicalSnapshot(line),
      line.drugId || '',
      line.inventoryItemId || '',
      ...(additional.length ? [additional] : []),
    ]);
    const hash = createHash('sha256').update(signature).digest('hex');
    const occurrence = occurrences.get(hash) || 0;
    occurrences.set(hash, occurrence + 1);
    return `rx-line-${additional.length ? 'v2' : 'v1'}:${hash}:${occurrence}`;
  });
}

/**
 * @cc [owner:nareshshah139,label:product] prescription-line-one-to-one
 * Each current prescription line MUST bind at most one distinct saved line. Metadata keys
 * take precedence; legacy lines MUST match the full saved clinical snapshot and be consumed
 * once in creation/ID order. Missing saved regimen fields MUST NOT match present source fields.
 * Retired or changed lines MUST NOT donate a review to another line.
 */
export function matchPrescriptionLines<T extends SavedLine>(
  medications: PrescriptionLine[],
  saved: T[],
): Array<T | undefined> {
  const keys = prescriptionLineKeys(medications);
  const candidates = [...saved]
    .filter((line) => !lineMetadata(line).prescriptionLineRetired)
    .sort(
      (a, b) =>
        (a.createdAt?.getTime() || 0) - (b.createdAt?.getTime() || 0) ||
        a.id.localeCompare(b.id),
    );
  const used = new Set<string>();
  return medications.map((medication, index) => {
    let line = candidates.find(
      (candidate) =>
        !used.has(candidate.id) &&
        lineMetadata(candidate).prescriptionLineKey === keys[index],
    );
    if (!line) {
      const snapshot = JSON.stringify(clinicalSnapshot(medication));
      line = candidates.find((candidate) => {
        if (
          used.has(candidate.id) ||
          lineMetadata(candidate).prescriptionLineKey
        )
          return false;
        let original: Record<string, unknown> = {};
        try {
          const parsed = JSON.parse(candidate.originalText || '{}');
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
            original = parsed;
        } catch {
          /* Older counter lines can contain plain text. */
        }
        return (
          JSON.stringify(clinicalSnapshot({ ...candidate, ...original })) ===
            snapshot &&
          JSON.stringify(additionalSnapshot(original)) ===
            JSON.stringify(additionalSnapshot(medication.sourceItem))
        );
      });
    }
    if (line) used.add(line.id);
    return line;
  });
}
