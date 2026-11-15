import { apiClient } from '@/lib/api';

export type VoiceFillFormId = 'patient-intake' | 'visit-consultation' | 'inventory-item';
export type VoiceFillValue = string | number | boolean | string[];
export type VoiceFillFields = Record<string, VoiceFillValue>;

export interface VoiceFillApplyResult {
  filled: Array<{ label: string; elementId?: string }>;
  undo: () => void;
}

/** One entry per field a form accepts. `apply` receives a server-validated value and returns how to put the field back, or null when it did not apply. */
export type VoiceFillRegistry = Record<string, {
  label: string;
  elementId?: string;
  apply: (value: VoiceFillValue) => (() => void) | null;
}>;

/** Applies only the keys the server returned that the form has an entry for. */
export function applyVoiceFillRegistry(registry: VoiceFillRegistry, fields: VoiceFillFields): VoiceFillApplyResult {
  const filled: VoiceFillApplyResult['filled'] = [];
  const undos: Array<() => void> = [];
  for (const [key, value] of Object.entries(fields)) {
    const entry = Object.prototype.hasOwnProperty.call(registry, key) ? registry[key] : undefined;
    const undo = entry?.apply(value);
    if (!entry || !undo) continue;
    filled.push({ label: entry.label, elementId: entry.elementId });
    undos.push(undo);
  }
  return { filled, undo: () => undos.reverse().forEach((undo) => undo()) };
}

/**
 * Registry entry over one field's getter and setter. `next` maps the server value and the current value to the new
 * value (or null to skip), and undo puts the snapshot taken at apply time back through `restore`.
 */
export function valueEntry<T>(
  label: string,
  elementId: string | undefined,
  [previousValue, set, restore = set]: readonly [T, (next: T) => void, ((next: T) => void)?],
  next: (value: VoiceFillValue, previous: T) => T | null,
): VoiceFillRegistry[string] {
  return {
    label,
    elementId,
    apply: (value) => {
      const updated = next(value, previousValue);
      if (updated === null) return null;
      set(updated);
      return () => restore(previousValue);
    },
  };
}

/** Narrative fields keep what the clinician already wrote and add the new text on its own line. */
export function appendOnNewLine(existing: string, addition: string): string {
  const base = existing.replace(/\s+$/, '');
  return base ? `${base}\n${addition}` : addition;
}

/** How a server value lands in a state object. Number inputs hold strings, so `number` stringifies. */
export type StateFieldKind = 'text' | 'number' | 'boolean';
export type StateFieldSpec = { label: string; kind: StateFieldKind; elementId?: string };

function toStateValue(kind: StateFieldKind, value: VoiceFillValue): string | boolean | null {
  if (kind === 'text') return typeof value === 'string' ? value : null;
  if (kind === 'number') return typeof value === 'number' ? String(value) : null;
  return typeof value === 'boolean' ? value : null;
}

export function stateRegistry<T extends object>(
  spec: Record<string, StateFieldSpec>,
  current: T,
  update: (patch: Partial<T>) => void,
): VoiceFillRegistry {
  return Object.fromEntries(
    Object.entries(spec).map(([key, { label, kind, elementId }]) => [
      key,
      valueEntry<unknown>(
        label,
        elementId,
        [current[key as keyof T], (next) => update({ [key]: next } as Partial<T>)],
        (value) => toStateValue(kind, value),
      ),
    ]),
  );
}

// Codex can take well over the default request budget, so the server's own 45 s timeout must win.
const FILL_TIMEOUT_MS = 60_000;

let statusPromise: Promise<boolean> | null = null;

export function fetchVoiceFillStatus(): Promise<boolean> {
  statusPromise ??= Promise.resolve()
    .then(() => apiClient.get<{ available?: boolean }>('/voice-fill/status'))
    .then((res) => res?.available === true)
    .catch(() => false);
  return statusPromise;
}

export function resetVoiceFillStatusForTests() {
  statusPromise = null;
}

export async function requestVoiceFill(form: VoiceFillFormId, transcript: string): Promise<VoiceFillFields> {
  const res = await apiClient.post<{ fields?: VoiceFillFields }>(
    `/voice-fill/${form}`,
    { transcript },
    { timeoutMs: FILL_TIMEOUT_MS },
  );
  return res?.fields ?? {};
}

const FLASH_MS = 1200;

export function flashFilledElements(elementIds: string[]) {
  if (typeof document === 'undefined') return;
  const elements = elementIds
    .map((id) => document.getElementById(id))
    .filter((el): el is HTMLElement => el !== null);
  elements.forEach((el) => el.setAttribute('data-voice-filled', ''));
  window.setTimeout(() => elements.forEach((el) => el.removeAttribute('data-voice-filled')), FLASH_MS);
}
