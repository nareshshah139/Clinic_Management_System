# Voice bar on main: design

This file is the design that gets built. The other files in this folder were written against a line that split from
main on 27 Sep 2026. They explain the intent and the wording, but their file names, packages and routes do not exist on
main.

## What main already has

- `POST /voice-fill/:form` takes audio and returns `{ transcript, fields }`. Forms: `patient-intake`,
  `visit-consultation`, `inventory-item`, `voice-command`.
- `VoiceFillButton` records, then fills the form at once. The user sees the result only after it is in the form, with
  an Undo.
- `VoiceCommandButton` sits in the header and the mobile top bar. It records a command and opens `VoiceCommandDialog`,
  a confirm card that resolves patient, doctor and slot and writes only on Confirm.
- Per-field live dictation in the visit form (`useSpeechToTextRecorder`).

## What the bar adds

1. **Typing.** The same request can be typed. This needs one new route.
2. **Review before fill.** The bar shows what it heard and every field it would fill. The user can untick a line, or
   edit the heard text and send it again. Nothing reaches the form until the user presses the button.
3. **One place.** A bar docked under the page content replaces the header mic and the visit toolbar mic.

## Shape

A page that owns a form registers it with one hook. The bar never knows about pages.

```ts
// frontend/src/components/voice/VoiceBarProvider.tsx
export interface VoiceBarForm {
  form: Exclude<VoiceFillFormId, 'voice-command'>;
  label: string;                      // "Visit notes", "New stock item": names the target in the bar
  hint: string;                       // placeholder, e.g. "Say or type the visit notes"
  scope: string;                      // opaque; a change discards an open draft and a pending undo
  preview(fields: VoiceFillFields): VoiceDraftLine[];
  apply(fields: VoiceFillFields): VoiceBarApplyResult | Promise<VoiceBarApplyResult>;
}
export function useVoiceBarForm(form: VoiceBarForm | null): { busy: boolean };

// frontend/src/lib/voice-fill.ts
export interface VoiceDraftLine { id: string; label: string; value: string; fields: VoiceFillFields }
export interface VoiceBarApplyResult {
  filled: Array<{ label: string; elementId?: string }>;
  undo: (() => void) | null;          // null when apply opened a dialog: its Cancel is the undo
}
export function mergeVoiceFillFields(slices: VoiceFillFields[]): VoiceFillFields;
export function requestVoiceFillFromText(form: VoiceFillFormId, text: string): Promise<VoiceFillResponse>;
```

Each draft line carries the slice of `fields` it stands for. Applying sends `mergeVoiceFillFields` of the kept lines to
`apply`, so an unticked line cannot reach the form. Row fields (prescription items) give one line per row, and the merge
concatenates rows.

The bar's state is one union in `frontend/src/lib/voice-bar.ts` with a pure reducer:

```ts
export type VoiceBarTarget = { kind: 'command' } | { kind: 'form'; registrationId: string };
export type VoiceBarRetry = { kind: 'audio'; audio: Blob; filename: string } | { kind: 'text'; text: string };
export type VoiceBarState =
  | { kind: 'idle'; notice: string | null }
  | { kind: 'listening'; target: VoiceBarTarget; startedAt: number }
  | { kind: 'working'; target: VoiceBarTarget; attempt: number; retry: VoiceBarRetry }
  | { kind: 'draft'; registrationId: string; heard: string; lines: VoiceDraftLine[]; kept: string[] }
  | { kind: 'applied'; registrationId: string; labels: string[]; undo: (() => void) | null }
  | { kind: 'failed'; target: VoiceBarTarget; message: string; retry: VoiceBarRetry | null };
```

Rules the reducer owns:

- A result for an attempt other than the current one is dropped.
- When the registration a state belongs to goes away or its `scope` changes, `listening`, `working`, `draft` and
  `applied` all become `idle` with the notice "The page changed, so this draft was discarded." A pending Undo is dropped
  with it, so it cannot write into another patient's visit.
- A command result leaves the bar `idle` and hands `{ transcript, command }` to the existing `VoiceCommandDialog`.
- An empty transcript is `failed` with "Did not catch anything. Please try again."

## Pages

| Page | Registers | Apply does | The write |
|---|---|---|---|
| Visit (`PrescriptionBuilder`) | `visit-consultation`, scope from patient and visit | the existing `applyVoiceFill`, returns its Undo | the visit form's own save |
| Inventory (`WorkspaceStock`) | `inventory-item` | opens `AddInventoryItemDialog` pre-filled with a "Filled by voice" note; `undo: null` | the dialog's own save |
| Appointments, and every other page | nothing | the bar takes commands; a booking goes to `VoiceCommandDialog` | Confirm in that card |

The in-dialog mics (patient intake, quick create, add item) stay. A modal covers the bar, so the bar cannot serve a form
inside one.

## Server

`POST /voice-fill/:form/text` with `{ text }`. Same guard, same per-form role check, same response, same 503 text. It
skips transcription and runs the same extraction. Limited to 20 requests a minute per user if the throttler can be
applied to this route alone.

## Differences from the old design, and why

| Old design | On main | Reason |
|---|---|---|
| New `/voice/*` routes and wire file | one text route on `voice-fill` | main's registry already generates prompt, schema and validation per form |
| Booking pre-fills the calendar and opens the booking dialog | booking goes to the existing confirm card | that card is already confirm-first, idempotent and tested on 36 spoken commands; a second booking path would have to re-earn that |
| Stock count by batch | pre-filled add-item dialog | main's `inventory-item` form describes a new item; a stock count form does not exist in the registry |
| Bar shown only where a page registers | bar shown on every dashboard page | commands work everywhere, so the header mic moves into the bar |
| Delete the recorder hook and per-field mics | keep them | main rebuilt them as live dictation in PR #121 |
| Light and dark | default and branded palettes | main has no dark mode and its colour check rejects `dark:` |
