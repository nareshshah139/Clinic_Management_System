# Synthesis decisions for the voice bar (made by the lead)

Two candidates were designed and cross-judged. These decisions are settled. The synthesis writer folds them into one coherent design under one mental model and does not reopen them.

## Base

**Candidate 1** (`candidate-1/`, data model first) is the base. Reason: its safety rules live in one place in the bar core (`Slot<T>`, `toPrefill`, the `Reviewed<T>` brand, one wire file, apply bound to the registration the attempt started with). A page author writes only `apply`, so a new page cannot default a doctor, patient or stock row. In candidate 2 every page writes its own resolver with `Ask.defaultId` in reach.

The lead first leaned to candidate 2 for its experience work. The cross-judge chose candidate 1, and the lead agreed: candidate 2's experience work can be grafted onto candidate 1 without changing its shape, while candidate 1's safety cannot be grafted onto candidate 2 without restructuring it.

Cross-judge scores (A = candidate 1, B = candidate 2): safety 4/3, page surface 3/4, state model 4/3, failure behaviour 4/5, buildable 4/3, experience 3/5.

## Grafts from candidate 2

1. **Failure model.** A failure carries `retry: null | <the step to retry>`. `null` marks a permanent condition (not set up, forbidden, session ended, browser cannot record). The recorded audio is kept in the attempt so a transcription failure can retry without re-speaking. Keep candidate 1's rule that the heard text returns to the composer when the parse step fails.
2. **Copy.** Use candidate 2's exact wording for every state and failure (`candidate-2/usage.md` sections 3 and the failure table, `candidate-2/sketch/.../copy.ts`). All visible strings live in one `copy.ts` in the bar core. Where candidate 1's page-returned messages overlap, candidate 2's wording wins.
3. **Layout and tokens.** Candidate 2's section 4 in full: in-flow strip after `<main>`, `border-t border-border bg-card`, existing `Textarea`, `Button`, `Spinner` components, the soft/text/border token triples, 44 px targets on phones, review card `max-h-[45dvh]` (`30dvh` while the text box has focus), and the Apply row outside the scroll area. No new colours, fonts or radii.
4. **Keyboard.** `Ctrl/Cmd + /` focuses the bar from anywhere, including from inside a text field, and remembers the previously focused element. Escape returns focus there. Not `Ctrl/Cmd + K`.
5. **Viewport export** goes in `frontend/src/app/dashboard/layout.tsx`, not the root layout.
6. **Stock extras.** A spoken count equal to the shelf count is unresolved with "This count matches the current stock. Nothing to submit." A zero-match result offers a user-initiated "Show matches in the list" (the search prefill candidate 1 already has).
7. **Role-metadata equality spec** exists in both candidates. Keep candidate 1's version.

## Changes to candidate 1

1. **Sections.** Four this round: `chiefComplaints`, `examination`, `pastHistory`, `medicationHistory`. Drop personal history, family history and diagnosis from `VISIT_NOTE_SECTIONS` and from the builder binding.
2. **Unsorted sentences do not block Apply and never vanish.** Apply is enabled when at least one item is placed in a section and no `choose` is open. Applying writes the placed items. If unsorted items remain, the bar stays in review holding only those items with the status "Added to <sections>. N line(s) still to place." The user places each one (then Apply again) or presses Dismiss, which is the only way they are discarded. When nothing was placed, Apply stays disabled with "Choose where each line goes. Nothing is added until you do."
3. **Scope on the registration.** `useVoiceCapability({ intent, context, scope?, apply })`. `scope` is an opaque string. A registration's identity is (registrant, intent, scope). If the scope changes while an attempt or a review is open, the attempt is stale: the bar discards it and shows "The page changed, so this draft was discarded." The visit binding passes the builder's existing `clinicalScopeKey` (`PrescriptionBuilder.tsx:221`, built from patient, visit and doctor). This closes the risk that a draft lands on a different patient's visit. Add a machine test for it.
4. **Id constructors are private.** The base's `lookups.ts` exports the brand constructors while `types.ts` says they are unexported. Fix it: `lookups.ts` exports only functions that return refs built from API records. Tests mint refs through `testing.ts`.
5. **Voice count below set-aside stock.** `StockEditDialog` requires the count to be at least `item.heldStock` (`StockEditDialog.tsx:29-30`). `resolveStockCount` returns unresolved with "<held> <unit> are set aside for pending sales. The count cannot be lower than that." Add a test.
6. **One status route.** `GET /voice/status` on the new controller answers for both audio and typed text, is free, and refuses PATIENT. Do not add `GET /visits/transcribe/status`. The bar requests status once per page load and never calls `/visits/transcribe/health`.
7. **Do not delete the `transcribe/chunk*` routes.** The owner has not agreed. Leave them and their helper untouched.
8. **Throttle the parse routes.** `@nestjs/throttler` is installed and used only in `backend/src/modules/auth` (`auth.module.ts:12`, `auth.controller.ts:32`). The voice module registers the throttler the same way and limits each parse route to 20 requests per minute per user. The builder copies the auth module's pattern exactly, including its ttl units.
9. **No undo for booking or stock.** Those applies open a dialog whose Cancel is the undo. Only the visit note returns `undo`.
10. **iOS keyboard.** Add a small hook in the bar core that listens to `window.visualViewport` and sets the shell's height to the visual viewport height while the bar's text box has focus, so the bar stays above the on-screen keyboard on iOS Safari, where `interactive-widget` is ignored. Pure calculation in its own function with a unit test. This will be checked in the iOS Simulator at hand-test time.
11. **Timeouts map to 503**, not the 408 that `whatsapp-templates.service.ts:186-188` throws.
12. **Module names** stay candidate 1's: backend `backend/src/modules/voice/`, frontend `frontend/src/components/voice/` and `frontend/src/lib/voice/`, wire `@cms/shared-types/voice`.

## Packages

Candidate 1's split stands: **W** (wire) first, then **B** (backend, including the approved transcription fixes from `judgement.pre-bar.md` P1 minus the status route and minus the chunk-route deletion) and **C** (bar core) in parallel, then **V** (visit page and the deletions) and **P** (appointments and inventory pages) in parallel.

W is applied to the owner's working tree before builders branch, because `node_modules/@cms/shared-types` is a symlink to the main checkout's `shared-types/` folder, so a worktree cannot see a wire file that exists only in another worktree.

## Known limits to state in the design, not to solve

- The calendar loads at most 100 doctors (`AppointmentsCalendar.tsx:185`), so name matching can report "no doctor" in a clinic with more.
- Whether the chosen slot is already taken is checked by the server when the user confirms the booking, as it is today.
- Transcript text with patient names goes to an OpenAI chat model. The owner must agree before this is enabled in production. The feature is off without a key.
- A sentence that mixes a complaint and an examination finding lands in one section, and the doctor moves it.
