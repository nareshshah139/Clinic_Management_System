# STORY-206: Linking patient-portal access. Walk report

**Result: FAIL.** The portal cannot be linked from the UI. 4 findings: 1 high, 2 medium, 1 low.
Persona: Admin User (ADMIN). The seed has no Keerthi Naidu; **John Doe** (`patient-seed-1`, john.doe@patient.test) is the only seeded patient with an email, so he was the target. Playwright at 1280x800.
Screenshots: `/tmp/claude-0/-home-user-Clinic-Management-System/1eff4a85-453f-5886-a484-208393c84f41/scratchpad/ux-walker/shots/patients-records--STORY-206/`

## Steps

| # | Action | Actual | Screenshot | Geometry |
|---|--------|--------|------------|----------|
| 0 | Search "john" | One row. The Actions column is letter-stacked as in STORY-201 F-201-01. | step-0-john-row.png | Clear Filters/Export widths (intentional) |
| 1 | Click **Link Portal** | The "Link Portal Access" dialog shows "Patient: John Doe" and Email prefilled `john.doe@patient.test`. Matches the catalog. Console: "Missing `Description`…" (F-206-04). | step-1-dialog.png | Cancel/Link widths differ (intentional) |
| 2 | Click **Link** | Request body `{"email":"john.doe@patient.test"}` to POST `/api/patients/patient-seed-1/link-user`, response **400** `email, password, firstName, and lastName are required to create a new user`. Red toast with the raw text and a Reference UUID, covering the header controls. The dialog stays open. **Confirms the catalog claim** (F-206-01, F-206-03). | step-2-link-result.png | n/a |
| 3 | Cancel | Dialog closes; nothing changed. | step-3-cancel.png | n/a |

## Variations and edge cases
- **Clear email**: the Link button is disabled, as the catalog says. Pressing Enter in the empty field did **not** produce the catalog's "Email required" toast. Nothing happened (the field is not in a form). Minor catalog inaccuracy. `var-empty-email.png`
- **Already linked** (set up through the API: POST link-user with the full payload for Rohit Agarwal, 201): the `GET /patients?search=rohit` keys are `abhaId, address, age, city, consultationType, createdAt, dob, email, emergencyContact, gender, id, lastVisitAt, name, patientCode, phone, primaryDoctor, referralSource, state, updatedAt`. There is **no `portalUserId`**, while `GET /patients/:id` returns it. The row still shows "Link Portal". Clicking it opens an empty email field (the patient has no email), and Link gives a **409** toast "Patient is already linked to a user". **Confirms mapped defect #2** (F-206-02). `var-already-linked-row.png`, `var-already-linked-409.png`
- The Unlink and confirm-toast path (mapped #3) is unreachable because of #2, so it was not exercised.
- Side effect of the setup: the PATIENT user `rohit.portal@patient.test` now exists in the DB and appears in the Users list (seen in STORY-007).

## Mobile spot-check (390x844)
`mobile-check-dialog.png`: the dialog fits and its title centres (it is left-aligned on desktop, a minor inconsistency). The Email label sits tight against the focused input's ring. Geometry: no overflow.

## Mapped defects touched
- CONFIRMED: patients #1 (Link Portal can never succeed), #2 (Portal Linked badge and Unlink unreachable; list omits portalUserId).
- NOT REACHABLE: #3 (Unlink toast action object), hidden behind #2.

## Flow log
- Ideal 3 steps (Link Portal, confirm email, Link). Actual: 3 steps and then a dead end. Cancel is the only exit. Completing the task is impossible from the UI.
- Hesitation: the error asks for a password and first/last name that the dialog never shows, so the admin cannot act on it.
- Re-entry: for patients without an email, the admin must type one even though the patient record has an email field that could have been filled first.
