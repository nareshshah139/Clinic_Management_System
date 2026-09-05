/** Empty controls are not deletion requests. Keep unrelated saved clinical data. */
export function compactClinicalPatch(value: any): any {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) {
    const items = value.map(compactClinicalPatch).filter(v => v !== undefined);
    return items.length ? items : undefined;
  }
  if (typeof value !== 'object') return value;
  const entries = Object.entries(value).map(([key, v]) => [key, compactClinicalPatch(v)]).filter(([, v]) => v !== undefined);
  return entries.length ? Object.fromEntries(entries) : undefined;
}
export function mergeClinicalPatch(previous: any, patch: any): any {
  if (patch === undefined) return previous;
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch;
  const result = previous && typeof previous === 'object' && !Array.isArray(previous) ? { ...previous } : {};
  for (const [key, value] of Object.entries(patch)) {
    if (!['__proto__', 'prototype', 'constructor'].includes(key)) result[key] = mergeClinicalPatch(result[key], value);
  }
  return result;
}
