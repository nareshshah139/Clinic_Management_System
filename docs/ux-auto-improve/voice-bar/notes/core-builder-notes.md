# Notes for whoever builds package C (bar core)

A first builder read the sketch, the module map and the existing code, then was stopped before writing any file because the work moved to a cloud session. These are its findings. None was verified by running code. Treat each as a likely problem to confirm, and where it changes an exported name or type, record the change so the page packages (V and P) are briefed with it.

## Order of work

`machine.ts` needs `INTENTS` at runtime (for `toPrefill` and `summarize`), and `intents.ts` needs `copy`, `spoken-time` and `lookups`. So "types and machine" cannot be the first passing commit. An order where each commit can pass its check:

1. `types`, `copy`, `working-hours`, `spoken-time`
2. `transport`, `lookups`, `testing`
3. `intents`
4. `machine`
5. store, provider, `visual-viewport`
6. components and the shell mount

## Likely additions to the sketch's exports

- **Per-intent dispatch belongs in `intents.ts`.** The store needs typed dispatch per intent for resolve, refine and apply, and the `voice-intent-table-complete` contract says no other module may branch on intent. Suggested helpers there: `prefillFor(proposal)`, `summarizeFor(prefill)`, `resolveFor(cap, parsed, deps)`, `refineFor(...)`, and `applyCapability(cap, prefill)` returning `{ outcome, undo | null }`.
- **`transport.ts` needs a mapping from `ApiError` to `Failure`.** `apiClient.post` takes no `AbortSignal`, and it wraps a fetch `TypeError` into an `ApiError` with no status and `diagnosticCode: 'network_error'`. Under the rule "a `TypeError` gives offline", a parse that fails on the network would not come out as offline. Suggested: an exported `asFailure(step, err)` that the store can reuse for lookup errors.
- **`fakeTransport()` should not use `jest.fn`,** because `lib/voice/testing.ts` lives under `src/`. A plain deferred fake needs extra controls (`resolve`, `reject`, `mics`, `micError`), which widens its return type.

## Conflicts inside the sketch

- **The composer must keep its DOM node and focus.** The sketch replaces the `Textarea` with a span while listening and disables the composer and mic while busy. Both break `voice-bar-state-legible` and the keyboard test "Escape on a draft returns focus", since a disabled element loses focus. Fix: keep the `Textarea` mounted and hide it while listening; use `readOnly` and `aria-disabled` for busy phases; keep real `disabled` only for not-configured. In review the composer must still take focus (for the `max-h-[30dvh]` test) while editing is handled only in idle, so make it `readOnly` there too.
- **The store must not subscribe to the registry when it is created.** That would be a side effect inside a `useState` initializer, which Strict Mode runs twice, and the discarded store would also call `transport.status()`. Attach the registry subscription when the store gets its first listener, and re-send the `capability` event on every new subscribe. Otherwise, after `reset()` in the Strict Mode effect cleanup, `active` stays null and the bar never shows.
- **Stop can be pressed before the mic has opened** (`since` still null). The store needs a "finish when the mic arrives" flag, or the recording is never finished.
- **The not-configured line would show twice.** `statusLine` returns `COPY.notConfigured` when `configured === false`, and the alert shows the same `FAILURE_COPY` line. Check "a failed notice gives an empty status line" before the `configured === false` check.
- **`COPY.visitAddedAfter(n)`** ("Added after the 2 lines already there.") needs the field's existing line count, but the visit-note context is `{}`, so the bar cannot compute it. Either pass line counts in the visit-note context or drop the note.
- **Undo should render only when `canUndo && model.lastUndo`.** After a scope change in idle, `lastUndo` is dropped while the applied notice still says `canUndo: true`.

## Smaller points

- `Spinner` carries its own `role="status"`. Override it so the bar keeps one status region.
- The `User` type has no `name` field. Build the doctor name from `firstName` and `lastName`, and strip a leading "Dr.".
- `lookups.ts` must export exactly four runtime names, so the "Exp Mar 2027" month-year helper needs another home, for example `spoken-time.ts`.
- `VoiceBar()` takes no props, so component tests inject fakes with `jest.mock` of `@/lib/voice/transport` (`createTransport`, `micSupported`) and `@/lib/voice/lookups` (`createLookups`).
- jsdom has no `Response`. Mock `fetch` with plain objects, as `frontend/__tests__/lib/api.retry.test.ts` does.
- `dashboard-layout.tsx` and `app/dashboard/layout.tsx` carry no `@cc` contracts today, and no existing test renders `DashboardLayout` (`frontend/__tests__/layout` holds only `text-size-setting.test.tsx`).
