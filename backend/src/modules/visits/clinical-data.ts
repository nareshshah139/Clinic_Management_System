/** Merge a partial clinical document without dropping unrelated stored fields. */
export function mergeClinicalData(previous: unknown, patch: unknown): any {
  if (patch === undefined) return previous;
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch;
  const result: Record<string, unknown> = previous && typeof previous === 'object' && !Array.isArray(previous)
    ? { ...previous } : typeof previous === 'string' && previous ? { legacyText: previous } : {};
  for (const [key, value] of Object.entries(patch)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key) || value === undefined) continue;
    result[key] = mergeClinicalData(result[key], value);
  }
  return result;
}

/** Preserve annotations when an editor resubmits the same clinical labels. */
export function mergeClinicalEntries(previous: any, patch: any[], key: string): any[] {
  if (!Array.isArray(previous)) return patch;
  if (patch.length === 1 && previous.length > 1 && patch[0]?.[key] === previous.map(v => v?.[key]).join(', ')) return previous;
  return patch.map(entry => ({ ...previous.find(v => v?.[key] === entry?.[key]), ...entry }));
}
