import { apiClient } from '@/lib/api';
import { postAudio } from '@/lib/speech-to-text';

export type VoiceFillFormId = 'patient-intake' | 'visit-consultation' | 'inventory-item';
export type VoiceFillRow = Record<string, string | number>;
export type VoiceFillValue = string | number | boolean | string[] | VoiceFillRow[];
export type VoiceFillFields = Record<string, VoiceFillValue>;

export interface VoiceFillApplyResult {
  filled: Array<{ label: string; elementId?: string }>;
  undo: () => void;
}

export type VoiceFillApply = (fields: VoiceFillFields) => VoiceFillApplyResult | Promise<VoiceFillApplyResult>;

export const isStringList = (value: VoiceFillValue): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string');

/** `apply` returns how to put the field back, or null when the value did not apply. */
export type VoiceFillRegistry = Record<string, {
  label: string;
  elementId?: string;
  apply: (value: VoiceFillValue) => (() => void) | null;
}>;

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

export function appendOnNewLine(existing: string, addition: string): string {
  const base = existing.replace(/\s+$/, '');
  return base ? `${base}\n${addition}` : addition;
}

// Number inputs hold strings, so `number` stringifies.
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

// Longer than the server's 60 s Codex timeout, so its 503 message reaches the user instead of a client abort.
const FILL_TIMEOUT_MS = 90_000;

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

function serverMessage(detail: string): string {
  try {
    const message = JSON.parse(detail)?.message;
    return typeof message === 'string' ? message.slice(0, 140) : '';
  } catch {
    return '';
  }
}

export function formatVoiceFillError(status: number, detail: string): string {
  switch (status) {
    case 400:
      return serverMessage(detail) || 'The recording could not be processed. Try again.';
    case 401:
      return 'Your session expired. Please sign in again.';
    case 403:
      return 'Your role cannot fill this form by voice.';
    case 413:
      return 'The recording is too long. Try a shorter clip.';
    case 503:
      return serverMessage(detail) || 'Voice fill is unavailable right now. Try again shortly.';
    default:
      return `Voice fill failed (server returned ${status}).`;
  }
}

export interface VoiceFillResponse {
  transcript: string;
  fields: VoiceFillFields;
}

export async function requestVoiceFill(form: VoiceFillFormId, audio: Blob, filename: string): Promise<VoiceFillResponse> {
  const res = await postAudio<Partial<VoiceFillResponse> | null>(`/api/voice-fill/${form}`, audio, filename, {
    timeoutMs: FILL_TIMEOUT_MS,
    describeError: formatVoiceFillError,
  });
  return { transcript: typeof res?.transcript === 'string' ? res.transcript : '', fields: res?.fields ?? {} };
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
