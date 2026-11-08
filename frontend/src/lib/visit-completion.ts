export interface VisitCompletionRecord {
  diagnoses: string[];
  hasPrescription: boolean;
  findings: unknown[];
}

export function hasContent(value: unknown): boolean {
  if (value == null || value === false) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (typeof value === 'number') return true;
  if (value instanceof Set) return value.size > 0;
  if (Array.isArray(value)) return value.some(hasContent);
  if (typeof value === 'object') return Object.values(value).some(hasContent);
  return true;
}

export function missingForCompletion(record: VisitCompletionRecord): string[] {
  const missing: string[] = [];
  if (!record.diagnoses.some((d) => d.trim() !== '')) missing.push('a diagnosis');
  if (!record.hasPrescription && !record.findings.some(hasContent)) missing.push('a prescription, examination or notes');
  return missing;
}
