/**
 * The digits WhatsApp addresses a number by: country code and number, no plus.
 * A bare 10-digit number is an Indian mobile and gets the 91 prefix. Anything that is not
 * 10 to 15 digits once spaces, dashes, brackets and a leading plus are removed is not a number.
 */
export function normalizeWhatsAppNumber(
  input: string | null | undefined,
): string | null {
  if (typeof input !== 'string') return null;
  const compact = input.replace(/[\s\-().]/g, '');
  if (!/^\+?\d{10,15}$/.test(compact)) return null;
  const digits = compact.replace('+', '');
  return digits.length === 10 ? `91${digits}` : digits;
}

export const INVALID_NUMBER_REASON =
  'Enter a WhatsApp number with its country code, for example +91 97048 02443.';
