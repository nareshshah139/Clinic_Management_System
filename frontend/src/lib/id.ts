export function isUuid(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  // Relaxed UUID regex (accepts any 8-4-4-4-12 hex UUID, all versions)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(v);
}

export function isCuid(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  // CUID (cuid2 can vary; this matches classic cuid starting with 'c')
  const cuidRegex = /^c[0-9a-z]{24,32}$/i;
  return cuidRegex.test(v);
}

export function isValidId(value: unknown): boolean {
  return isUuid(value) || isCuid(value);
}


