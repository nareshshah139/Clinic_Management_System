export const BILL_TYPES = {
  FIRST_CONSULTATION: 'First consultation',
  REVIEW: 'Review',
  PROCEDURE: 'Procedure',
} as const;

/**
 * @cc [owner:nareshshah139,label:product] recorded-bill-type
 * Missing or unknown bill types MUST be shown as unrecorded, never inferred from
 * the patient's visit count or the appointment category.
 */
export function billTypeLabel(value: string | null | undefined): string {
  return value && value in BILL_TYPES ? BILL_TYPES[value as keyof typeof BILL_TYPES] : 'Bill type not recorded';
}

export const clinicMoney = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value);
