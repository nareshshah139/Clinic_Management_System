import { createHash } from 'node:crypto';

type PrescriptionLine = {
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
 * A line key MUST distinguish clinical instructions and explicit product identity; equal
 * snapshots MUST receive separate occurrence keys. Reordering distinct snapshots MUST preserve keys.
 */
export function prescriptionLineKeys(lines: PrescriptionLine[]): string[] {
  const occurrences = new Map<string, number>();
  return lines.map((line) => {
    const signature = JSON.stringify([
      ...clinicalSnapshot(line),
      line.drugId || '',
      line.inventoryItemId || '',
    ]);
    const hash = createHash('sha256').update(signature).digest('hex');
    const occurrence = occurrences.get(hash) || 0;
    occurrences.set(hash, occurrence + 1);
    return `rx-line-v1:${hash}:${occurrence}`;
  });
}

/**
 * @cc [owner:nareshshah139,label:product] prescription-line-one-to-one
 * Each current prescription line MUST bind at most one distinct saved line. Metadata keys
 * take precedence; legacy lines MUST match the full saved clinical snapshot and be consumed
 * once in creation/ID order. Retired or changed lines MUST NOT donate a review to another line.
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
          snapshot
        );
      });
    }
    if (line) used.add(line.id);
    return line;
  });
}
