import { useCallback, useState, type MutableRefObject, type SetStateAction } from 'react';

export type ClinicalDirtyFields = MutableRefObject<Set<string>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
}

/**
 * @cc [owner:nareshshah139,label:product] clinical-field-edit-intent
 * Edits mark changed leaf fields as dirty, including empty values. Hydration MUST
 * preserve dirty fields and MUST NOT mark server values dirty. Restored drafts
 * retain their saved dirty fields; legacy drafts restore only populated fields.
 */
export function useClinicalState<T>(initial: T, field: string, dirty: ClinicalDirtyFields) {
  const [state, setState] = useState({ value: initial });
  const setValue = useCallback((next: SetStateAction<T>) => {
    setState(previous => {
      dirty.current = new Set(dirty.current);
      const value = typeof next === 'function' ? (next as (previous: T) => T)(previous.value) : next;
      const mark = (before: unknown, after: unknown, path: string) => {
        if (isRecord(after)) {
          for (const [key, child] of Object.entries(after)) {
            const old = isRecord(before) ? before[key] : undefined;
            if (JSON.stringify(old) !== JSON.stringify(child)) mark(old, child, `${path}.${key}`);
          }
        } else dirty.current.add(path);
      };
      mark(previous.value, value, field);
      return { value };
    });
  }, [dirty, field]);
  const hydrate = useCallback((value: T, restored?: readonly string[] | 'populated') => {
    const dirtyBeforeHydration = new Set(dirty.current);
    setState(previous => {
      const merge = (current: unknown, incoming: unknown, path: string): unknown => {
        if (dirtyBeforeHydration.has(path)) return current;
        if (isRecord(incoming)) {
          return Object.fromEntries(Object.entries(incoming).map(([key, child]) =>
            [key, merge(isRecord(current) ? current[key] : undefined, child, `${path}.${key}`)]));
        }
        const populated = incoming instanceof Set ? incoming.size > 0
          : Array.isArray(incoming) ? incoming.length > 0 : incoming !== '' && incoming != null && incoming !== false;
        if (restored === 'populated' ? populated : restored?.includes(path)) dirty.current.add(path);
        return incoming;
      };
      return { value: merge(previous.value, value, field) as T };
    });
  }, [dirty, field]);
  return [state.value, setValue, hydrate] as const;
}

/**
 * @cc [owner:nareshshah139,label:product] explicit-clinical-clears
 * Only undefined fields are omitted. Empty strings, arrays, null, false, and zero
 * MUST survive serialization as explicit changes; empty object containers are omitted.
 */
export function compactClinicalPatch(value: any): any {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(compactClinicalPatch).filter(v => v !== undefined);
  const entries = Object.entries(value).map(([key, v]) => [key, compactClinicalPatch(v)]).filter(([, v]) => v !== undefined);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

/**
 * @cc [owner:nareshshah139,label:product] clinical-patch-merge
 * Omitted fields preserve previous values. Explicit scalar, null, and array values
 * replace previous values; object patches preserve untouched siblings.
 */
export function mergeClinicalPatch(previous: any, patch: any): any {
  if (patch === undefined) return previous;
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch;
  const result = previous && typeof previous === 'object' && !Array.isArray(previous) ? { ...previous } : {};
  for (const [key, value] of Object.entries(patch)) {
    if (!['__proto__', 'prototype', 'constructor'].includes(key)) result[key] = mergeClinicalPatch(result[key], value);
  }
  return result;
}
