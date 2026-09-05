import type { ReactNode } from 'react';

const labels: Record<string, string> = {
  dm: 'Diabetes', htn: 'Hypertension', thyroid: 'Thyroid disease', others: 'Other history',
  bpS: 'Systolic BP (mmHg)', systolicBP: 'Systolic BP (mmHg)', bpD: 'Diastolic BP (mmHg)', diastolicBP: 'Diastolic BP (mmHg)',
  hr: 'Pulse (bpm)', heartRate: 'Pulse (bpm)', rr: 'Respiratory rate (breaths/min)', respiratoryRate: 'Respiratory rate (breaths/min)',
  height: 'Height (cm)', weight: 'Weight (kg)', bmi: 'BMI', icd10Code: 'ICD-10 code',
  priorTx: 'Prior treatments', exObjective: 'Examination findings', medicationPlan: 'Saved medication plan',
  wavelengthNm: 'Wavelength (nm)', fluenceJcm2: 'Fluence (J/cm²)', spotSizeMm: 'Spot size (mm)', pulseMs: 'Pulse duration (ms)',
  followUpDate: 'Follow-up date', validUntil: 'Prescription valid until', isGeneric: 'Generic medicine',
};
export function clinicalLabel(key: string): string {
  return labels[key] || (key.includes('(') ? key : key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/^./, c => c.toUpperCase()));
}
export function normalizeClinicalValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  if (text.startsWith('{') || text.startsWith('[')) {
    try { return JSON.parse(text); } catch { /* Preserve legacy text verbatim. */ }
  }
  return value;
}
export function hasClinicalValue(value: unknown): boolean {
  value = normalizeClinicalValue(value);
  if (value == null || (typeof value === 'string' && !value.trim())) return false;
  if (Array.isArray(value)) return value.some(hasClinicalValue);
  if (typeof value === 'object') return Object.values(value as object).some(hasClinicalValue);
  return true;
}

/** Render every nonempty clinical leaf, including unfamiliar legacy/custom fields. */
export function ClinicalHistoryDetails({ value }: { value: unknown }): ReactNode {
  const normalized = normalizeClinicalValue(value);
  if (!hasClinicalValue(normalized)) return null;
  if (Array.isArray(normalized)) {
    const items = normalized.filter(hasClinicalValue);
    if (items.every(item => typeof normalizeClinicalValue(item) !== 'object')) {
      return <ul className="flex flex-wrap gap-x-3 gap-y-0.5">{items.map((item, index) => (
        <li key={index} className="min-w-0 whitespace-pre-wrap break-words"><ClinicalHistoryDetails value={item} /></li>
      ))}</ul>;
    }
    return <ul className="space-y-1.5">{normalized.filter(hasClinicalValue).map((item, index) => (
      <li key={index} className="min-w-0 border-b border-border pb-1.5 last:border-0 last:pb-0"><ClinicalHistoryDetails value={item} /></li>
    ))}</ul>;
  }
  if (normalized && typeof normalized === 'object') {
    return <dl className="space-y-1.5">{Object.entries(normalized).filter(([, item]) => hasClinicalValue(item)).map(([key, item]) => {
      const structured = typeof normalizeClinicalValue(item) === 'object';
      return <div key={key} className={structured ? 'min-w-0 space-y-1' : 'min-w-0 grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-3 gap-y-0.5'}>
        <dt className="break-words text-xs font-medium leading-5 text-muted-foreground">{clinicalLabel(key)}</dt>
        <dd className="min-w-0 whitespace-pre-wrap break-words text-foreground"><ClinicalHistoryDetails value={item} /></dd>
      </div>;
    })}</dl>;
  }
  return typeof normalized === 'boolean' ? (normalized ? 'Yes' : 'No') : String(normalized);
}
