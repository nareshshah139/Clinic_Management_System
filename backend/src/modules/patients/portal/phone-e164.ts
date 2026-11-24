const INDIA = '91';

/**
 * @cc [owner:nareshshah139,label:integrity] one-e164-per-patient
 * Every patient phone MUST map to one E.164 number through this function only: ten digits take
 * country code 91, a leading trunk 0 is dropped, and anything else that is not 8 to 15 digits with
 * a country code maps to null, which sends nothing.
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
  return null;
}
