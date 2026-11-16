import { formatMedicineName, type MedicineNameFields } from '@cms/shared-types/medicine-name';

/**
 * @cc [owner:nareshshah139,label:product] patient-medicine-name
 * Patient-facing medicine names MUST exclude codes, pack quantities and loose notes. Structured
 * medicine fields take precedence; missing strengths MUST never be invented.
 */
export function formatPrintedDrugName(name?: string | null, fields?: MedicineNameFields): string {
  return formatMedicineName(name, fields);
}
