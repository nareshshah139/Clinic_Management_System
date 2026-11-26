import { apiClient } from '@/lib/api';
import { handleUnauthorizedRedirect } from '@/lib/authRedirect';

export type VoiceFillFormId = 'patient-intake' | 'visit-consultation' | 'inventory-item' | 'voice-command';
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

// Outlasts Codex's 120 s extraction timeout on a 40-minute transcript, so its 503 message reaches the user instead of a client abort.
const FILL_TIMEOUT_MS = 240_000;

export const VOICE_FILL_MAX_SPEECH_MS = 40 * 60_000;
const VOICE_FILL_MAX_TEXT_CHARS = 60_000;

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

const toVoiceFillResponse = (res: Partial<VoiceFillResponse> | null): VoiceFillResponse =>
  ({ transcript: typeof res?.transcript === 'string' ? res.transcript : '', fields: res?.fields ?? {} });

export async function requestVoiceFillFromText(form: VoiceFillFormId, text: string): Promise<VoiceFillResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FILL_TIMEOUT_MS);
  try {
    const response = await fetch(`/api/voice-fill/${form}/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.trim().slice(0, VOICE_FILL_MAX_TEXT_CHARS) }),
      credentials: 'include',
      signal: controller.signal,
    });
    if (!response.ok) {
      handleUnauthorizedRedirect(response);
      let detail = '';
      try {
        detail = await response.text();
      } catch {}
      throw new Error(formatVoiceFillError(response.status, detail));
    }
    return toVoiceFillResponse((await response.json()) as Partial<VoiceFillResponse> | null);
  } catch (error) {
    if (controller.signal.aborted) throw new Error('The server took too long to respond. Try again.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** One reviewable line of a voice draft; `fields` is the slice of the response this line stands for. */
export interface VoiceDraftLine {
  id: string;
  label: string;
  value: string;
  fields: VoiceFillFields;
}

export interface VoiceBarApplyResult {
  filled: Array<{ label: string; elementId?: string }>;
  /** Null when apply opened a dialog whose own Cancel is the undo. */
  undo: (() => void) | null;
}

/**
 * @cc [owner:nareshshah139,label:product] voice-draft-merge-keeps-every-row
 * Merging draft slices MUST keep every row of a list field, in slice order, and MUST NOT add a key no slice carries.
 */
export function mergeVoiceFillFields(slices: VoiceFillFields[]): VoiceFillFields {
  const merged: VoiceFillFields = {};
  for (const slice of slices) {
    for (const [key, value] of Object.entries(slice)) {
      const previous = merged[key];
      merged[key] = Array.isArray(previous) && Array.isArray(value)
        ? ([...previous, ...value] as VoiceFillValue)
        : value;
    }
  }
  return merged;
}

function readableValue(value: VoiceFillValue): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (!Array.isArray(value)) return String(value).trim();
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : Object.values(entry).map(String).join(', ')))
    .filter(Boolean)
    .join(', ');
}

/**
 * Draft lines for the fields a registry can fill, in registry order. A list of rows gives one line per row, so each
 * row can be kept or dropped on its own.
 */
export function voiceDraftLines(registry: VoiceFillRegistry, fields: VoiceFillFields): VoiceDraftLine[] {
  return Object.entries(registry).flatMap(([key, entry]): VoiceDraftLine[] => {
    if (!Object.prototype.hasOwnProperty.call(fields, key)) return [];
    const value = fields[key];
    if (Array.isArray(value) && value.some((row) => typeof row === 'object')) {
      return (value as VoiceFillRow[]).flatMap((row, index) => {
        const text = readableValue([row]);
        return text ? [{ id: `${key}:${index}`, label: `${entry.label} ${index + 1}`, value: text, fields: { [key]: [row] } }] : [];
      });
    }
    const text = readableValue(value);
    return text ? [{ id: key, label: entry.label, value: text, fields: { [key]: value } }] : [];
  });
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
