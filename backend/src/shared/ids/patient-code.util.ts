import { randomBytes } from 'crypto';

// Allowed characters exclude easily confusable ones like 0/O and 1/I.
const ALPHANUM = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Generate an uppercase alphanumeric patient code.
 * Length defaults to 5 but can be set to 4 for compatibility with requirements.
 */
export function generatePatientCode(length = 5): string {
  if (length < 4 || length > 5) {
    throw new Error('patient code length must be 4 or 5');
  }
  const bytes = randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += ALPHANUM[bytes[i] % ALPHANUM.length];
  }
  return code.toUpperCase();
}

/**
 * Simple validator to assert code format.
 */
export function isValidPatientCode(code: string): boolean {
  return /^[A-Z0-9]{4,5}$/.test(code);
}

