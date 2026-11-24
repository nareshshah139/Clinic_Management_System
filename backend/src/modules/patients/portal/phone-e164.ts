const INDIA = '91';

/**
 * @cc [owner:nareshshah139,label:integrity] one-e164-per-patient
 * Every patient phone MUST map to one E.164 number through this function only: ten digits take
 * country code 91, a leading trunk 0 is dropped, 11 to 15 digits are read as already carrying
 * their country code (stored phones have no "+"), and anything else maps to null, which sends nothing.
 */
export function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const plus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;
  if (!plus && /^[6-9]\d{9}$/.test(digits)) return `+${INDIA}${digits}`;
  if (!plus && /^0[6-9]\d{9}$/.test(digits)) return `+${INDIA}${digits.slice(1)}`;
  if (/^91[6-9]\d{9}$/.test(digits)) return `+${digits}`;
  if (digits.startsWith(INDIA)) return null;
  if (plus && /^[1-9]\d{7,14}$/.test(digits)) return `+${digits}`;
  // Patient.phone is stored without "+" (and Meta sends wa_id without it), so 11 to 15 digits
  // without a plus already carry their country code.
  if (!plus && /^[1-9]\d{10,14}$/.test(digits)) return `+${digits}`;
  return null;
}
