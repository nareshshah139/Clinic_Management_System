# Unit `visit`: the doctor's visit form and prescription builder

- Worktree `/home/user/wt/visit`, branch `ux/visit`.
- Read in full: `docs/ux-flow/journeys/j03.md`; in `docs/ux-flow/redundancy.md` proposed change 15 and naming table 4.4.
- Journey you own: `j03` (baseline 26). The doctor repeats this loop 30 to 60 times a day.
- Main files: `frontend/src/components/visits/MedicalVisitForm.tsx` (2,700 lines, eleven `@cc` product rules: read every one before editing), `PrescriptionBuilder.tsx` (7,000 lines), `VisitPhotos.tsx`, `frontend/src/app/dashboard/visits/page.tsx`, and their tests. These files carry clinical data. Save, draft, conflict and consent behaviour must not change.

## Build
1. **Completing a visit needs a complaint or diagnosis and a saved prescription. Nothing else.** The owner decided photos are optional. Measured on the running app: "Mark Vitals Complete" and "Save Labs" count toward completion with nothing entered, and a photo upload was forced. Vitals, labs and photos stop being conditions; a doctor fills them when there is something to record. The `@cc completion-progress-explanation` rule must stay true: whenever completion is unavailable, the form names what is still missing and states that progress is not a clinical validation. Make the progress readout agree with the button at all times, and remove the third progress readout the critique flags.
2. **"Complete visit" saves the prescription itself** when it has unsaved medicines, through the same creation path "Create Prescription" uses, guarded against a double create on a second click. "Create Prescription" stays for saving without completing.
3. **Remove the "Go to Pharmacy?" dialog.** After a prescription is saved, offer the pharmacy handoff as a plain link or button.
4. **After completing**, one "Visit completed" confirmation, then back to the doctor's day at `/dashboard`. Never navigate away if the save failed. Disable the button while saving.
5. **Doctors open on the Prescription tab** (complaints, diagnosis, medicines). Other roles keep their first tab.
6. **One blank medicine row, focused, when the builder opens empty.** Blank rows are never sent.
7. **Duration presets**: add 10 days. Name the night-time frequency preset so it reads as "night". Remove no existing preset.
8. **A single photo uploads without the tag dialog**, with the default position; it can be retagged from the photo card.
9. **Less to scroll past in the builder**: the Treatment Suggestions panel shows only when it has a suggestion; the Templates toolbar sits behind one "Templates" control; the red "Reset to default" leaves the main path.
10. **Visits setup page** (`visits/page.tsx`): remove the role banner, the "Available Features" card and the THERAPIST entries that exist only in frontend code.
11. **The visit form's Quick Guide and tour stay** (owner decision). Rewrite their steps to match the new form. Apply the rest of j03's Subtext table. "Start visit" and "Visit" are the names.

## Do not build
- Applying a remembered dose, frequency or duration silently. The one-click "Suggested" link stays as it is.
- Removing the Overview or Customization tabs.
- Calendar or dashboard changes. The script's first two steps (Menu: Appointments, START on the row) stay.

## Expected
- `j03`: 26 to 14 or fewer. Gone: the tab click, Add Row, the separate Create Prescription click, the Go to Pharmacy dialog, both attestation clicks with their tab switches, the Photos tab, the upload and its tag dialog, one duration typing. Goal stays strict and gains one check: the visit is COMPLETED, its prescription holds Mometasone and Cetirizine, and the saved items carry the frequency, duration and instructions the script entered (through `ui.api`).
- Run the visit and prescription tests early and often (`npx jest --ci --maxWorkers=2 __tests__/visits src/components/visits`).
