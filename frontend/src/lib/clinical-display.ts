export const internalClinicalKeys = new Set(['regimenstate', 'touched', 'gstrate', 'language', 'rowkey', 'rowid']);

/**
 * @cc [owner:nareshshah139,label:product] clinical-history-hides-internal-state
 * Clinical history MUST omit editor bookkeeping, language and tax fields at every depth.
 * Omitting medication plans MUST preserve other treatment details and never mutate saved data.
 */
export function clinicalDisplayValue(value: unknown, omitMedicationPlan = false): unknown {
  if (typeof value === 'string' && /^[\[{]/.test(value.trim())) {
    try { return clinicalDisplayValue(JSON.parse(value), omitMedicationPlan); } catch { return value; }
  }
  if (Array.isArray(value)) return value.map(item => clinicalDisplayValue(item, omitMedicationPlan));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !internalClinicalKeys.has(key.replace(/[^a-z]/gi, '').toLowerCase()) && !(omitMedicationPlan && key === 'medicationPlan'))
    .map(([key, item]) => [key, clinicalDisplayValue(item, omitMedicationPlan)]));
  return value;
}

/**
 * @cc [owner:nareshshah139,label:product] clinical-row-insertion-preserves-state
 * Inserting after a valid row MUST preserve all existing row identities, values and order.
 * An invalid index MUST leave the existing list unchanged.
 */
export function insertClinicalRow<T>(rows: T[], after: number, row: T): T[] {
  return Number.isInteger(after) && after >= -1 && after < rows.length
    ? [...rows.slice(0, after + 1), row, ...rows.slice(after + 1)] : rows;
}

export type ClinicalPatient = { id?: string; name?: string; age?: number | null; dob?: string | Date | null; gender?: string | null };

/**
 * @cc [owner:nareshshah139,label:product] clinical-identity-patient-scope
 * Identity MUST prefer the matching visit patient, then the matching patient record.
 * A record for another patient MUST never be displayed while the next patient loads.
 */
export function resolveClinicalPatient(patientId: string, visitPatient?: ClinicalPatient | null, patient?: ClinicalPatient | null): ClinicalPatient | null {
  return [visitPatient, patient].find(candidate => candidate?.id === patientId) || null;
}

export function clinicalPatientAge(patient: ClinicalPatient, now = new Date()): string {
  if (patient.age != null && Number.isFinite(patient.age) && patient.age >= 0) return String(patient.age);
  if (!patient.dob) return 'Age not recorded';
  const dob = new Date(patient.dob);
  if (!Number.isFinite(dob.getTime()) || dob > now) return 'Age not recorded';
  const age = now.getFullYear() - dob.getFullYear() - Number(now.getMonth() < dob.getMonth() || (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate()));
  return String(age);
}

export const examinationPreferenceKey = (doctorId: string) => `cms:examination:expanded:${doctorId}`;
