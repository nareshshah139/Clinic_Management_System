# UX flow critique and simplification, 13 to 14 November 2026

The ten journeys a clinic runs most took 113 clicks and typed fields before this run. They take 62 now. Every journey still reaches an end state that a script checks on the running app, and no journey got longer.

This report covers what was measured, what changed for each role, what the reviews caught, what the owner decided, and what is still open.

## Run summary

| | |
|---|---|
| Journeys critiqued | 10, plus one cross-journey redundancy critique |
| Evidence | Live pass on a seeded copy of the app (NestJS, Next.js, PostgreSQL, Chromium) |
| Verdicts before | 0 minimal, 3 acceptable, 7 convoluted |
| Actions before | 113 |
| Actions after | 62 |
| Journey catalog | 77 stories, `docs/ux-paths/catalog.md` |
| Decision trail | `docs/ux-flow/decisions.tsv` |

## Friction scorecard

One action is one click, one typed field, one selection or one key press. "Ideal" is the critic's own minimum for a well-designed screen.

| Journey | Who | Before | After | Ideal |
|---|---|---|---|---|
| j01 Book a returning patient | Reception | 6 | 5 | 5 |
| j02 Register a walk-in and get them on today's list | Reception | 13 | 6 | 7 |
| j03 See a patient, prescribe two medicines, complete the visit | Doctor | 26 | 14 | 9 |
| j04 Bill a waiting prescription, paid by UPI | Pharmacist | 7 | 3 | 4 |
| j05 Bill a consultation, then collect a balance | Reception | 8 | 5 | 6 |
| j06 Walk-in sale of two medicines for cash | Pharmacist | 15 | 10 | 8 |
| j07 Read the day's money, dues and low stock | Owner | 3 | 0 | 0 |
| j08 Sign in and reach today's work | Reception | 4 | 3 | 3 |
| j09 Look up a patient's last visit, fix their phone | Doctor | 10 | 4 | 4 |
| j10 Type in a supplier bill and add the stock | Pharmacist | 21 | 12 | 11 |
| **Total** | | **113** | **62** | **57** |

Both columns come from `scripts/ux/journeys/run-all.cjs`, which replays every journey from a fresh seed and records each interaction through one counter. The files are `docs/ux-flow/scorecards/baseline.json` and `after.json`.

Read the numbers with four things in mind.

- **The demo data changed once during the run.** Seeded clinic bills first carried statuses the app never sets. After that was corrected, I replayed the original journey scripts on the original code with the corrected data (`baseline-reseeded.json`). Nine journeys reproduce their original counts exactly. The tenth, j07, fails on the old code: with bills made the way the app makes them, the old dashboard cannot show who owes money. So j07's baseline of 3 is kinder to the old app than it deserves.
- **Part of j03's saving is steps that are no longer required.** Seven of its 12 saved actions were the vitals, labs and photo steps. The owner decided those are optional, so the new script does not perform them.
- **j06 is a slightly different task now.** The old script had to borrow a registered patient. The new one bills a walk-in by name and phone, as the owner decided.
- **The "ideal" is a critic's estimate.** Three journeys now come in under it.

Starting on the landing page costs no action in either column, which is why j07 can reach zero. j10's critic reported a typed pack size being overwritten; that was the demo item's placeholder pack, not a defect.

Three journeys are still above their ideal:

- **j03, 14 against 9.** What remains is typing each medicine's instructions and choosing frequency and duration. The critic proposed applying a remembered dose automatically. That was rejected: on a prescription a wrong silent default is a safety risk.
- **j06, 10 against 8.** Typing a medicine name and pressing Enter are counted as two actions.
- **j10, 12 against 11.** One "Confirm Match" click stays, because a product rule says a suggestion may not bypass an explicit selection.

## What changed for each role

**Everyone.** After sign-in each role lands on its own work, not on four admin counters. Alert and bell rows open what they name. Low stock reads the same number on the landing page, in the bell and in Inventory. The developer page "Test Transcribe" is out of the menu.

**Reception.**
- The landing page leads with "Book appointment" and "New patient", then today's patients with each bill's state. A bill chip opens the bill dialog there.
- The calendar is visible on arrival. Its first row sits at y=272 of an 850px window; it was at y=840. The legend and the filters are closed buttons.
- Typing three letters of a name selects the patient when there is one match. A note warns when the patient already has an appointment that day, with any doctor.
- "New patient" asks for name, phone, age and gender. It books today by default with the doctor preselected, and says the time and token. If today is full it saves the patient and offers "Book another day". It never books another day by itself.
- The bill dialog closes after a successful save.
- Scheduled rows have a one-click "Confirm".
- The Slots tab is gone. It showed the same calendar and dialogs as Calendar. Its component and two test files went with it; the conflict, overbooking and late-response cases they covered are tested on the Calendar.
- The header search finds patients, and appointments by patient name. It no longer lists staff or doctors.

**Doctor.**
- The landing page lists today's patients, next first, each with "Start visit" or "Continue visit".
- The visit form opens on the Prescription tab with one blank medicine row ready.
- A visit completes with a complaint or a diagnosis. Photos, vitals and labs are optional. "Complete visit" saves the prescription itself; the "Go to Pharmacy?" dialog is gone.
- The patient page opens on a "Last visit" panel: date, complaint, diagnosis, medicines, advice, and the last prescription. It has an "Edit" button.

**Pharmacist.**
- The landing page lists prescriptions waiting, each with "Bill", plus "New sale" and links to low and expiring stock.
- Payment mode is four buttons with Cash chosen. One button, "Confirm and print", finishes a bill and shows the finished bill.
- A walk-in sale takes a customer name and phone and no patient record.
- Enter in the medicine search adds the top match and moves to its quantity.
- The Counter has one "Bill" button per prescription and one prescription list.
- On a supplier bill, choosing a saved supplier fills the drug licence, one "Confirm Match" fills pack, unit, HSN and manufacturer, expiry is one field, and a blank bill no longer opens showing errors.

**Owner.**
- The landing page shows today's collection with its clinic, pharmacy, cash and UPI split, bills due by patient name and balance, requests waiting for approval, and low and expiring medicines by name.

## Words on screen

`scripts/ux/measure-words.cjs` counts the words on twelve screens as a person lands on them, on the old code and the new. Files: `docs/ux-flow/scorecards/words-before.json` and `words-after.json`.

| Screen | Before | After |
|---|---|---|
| Sign-in | 34 | 18 |
| Reception landing | 86 | 76 |
| Appointments | 183 | 100 |
| Patients list | 284 | 206 |
| Patient page | 70 | 144 |
| Doctor landing | 284 | 235 |
| Visit form | 161 | 293 |
| Pharmacist landing | 57 | 30 |
| Pharmacy counter | 447 | 326 |
| New pharmacy bill | 163 | 120 |
| Inventory | 114 | 108 |
| Owner landing | 116 | 120 |
| **Total** | **1,999** | **1,776** |

Two screens went up, and both are the point of the change. The patient page now shows the last visit on arrival. The visit form now opens on the tab the doctor works in, which holds more than the old overview tab. The count measures all text, not helper text alone, so it understates what was cut on those two and cannot separate a useful label from a redundant one.

Subtext was cut on the screens the ten journeys pass through. Inventory, Reports, Users, Rooms, Procedures and Fees were not swept.

## What the independent reviews caught

Each unit was reviewed by a second agent on a stronger tier before it merged. Every finding below was reproduced on a running stack, and each fix came with tests. Five of the six fix rounds reported watching a new test fail on the earlier code; the patients round was asked to and did not say so. The reviewers' probe scripts and logs are in `docs/ux-flow/evidence/`; their screenshots were not committed.

| Unit | Finding |
|---|---|
| Patients | A fix for an overwritten date of birth could silently drop a corrected age. |
| Appointments | Typing on after an auto-selected patient opened "Add New Patient" filled with that patient, one click from a duplicate record. A cut had removed text a product rule requires. |
| Landing page | "Bills due" left out every bill made in the app, because it filtered on a status the app never sets. Two roles saw a pharmacy-only figure titled "Today's collection". |
| Pharmacy | No money, tax or stock error. A product rule had moved onto the wrong method. |
| Purchase | Confirming a product match replaced the tax typed from the supplier's bill with the catalogue's rate. A 12% bill was committed at 18%. |
| Visit form | A completed visit could keep a stale prescription. A visit with no medicines could not be completed. Completing could hang for good. |

Three of these came from instructions I gave the units: fill GST from the catalogue, book another day when today is full, and require a prescription to complete a visit. All three are withdrawn and fixed.

A new check, `scripts/contracts/compare-attachment.cjs`, compares every product rule's attached declaration and text against a base revision. The existing check only proves each rule is attached to something. The new one found nine more rules that had slid onto newly inserted code in three files after their units and reviewers had missed them. It passes now over 200 rules in 104 changed files.

## Verification on the merged code

| Check | Result |
|---|---|
| Ten journeys, each from a fresh seed | 10 pass, 62 actions |
| Frontend tests | 156 suites, 1,706 tests pass (149 and 1,581 before) |
| Frontend lint | 17 errors, in the same files as before the run |
| Frontend type-check | 91 errors in test files, unchanged; 0 in the build configuration |
| Backend type-check | Clean |
| Backend tests, with the database-backed specs | 199 suites, 2,854 tests pass; 4 suites skipped |
| Contract check | 709 of 709 rules attached |
| Rule comparison against the starting commit | Pass |
| Production build (`npm run build`) | Pass |

## Decisions the owner made

1. **Photos are optional** for completing a visit.
2. **A walk-in sale needs a name and phone, not a patient record.** This needed one database change: a pharmacy bill may have no patient. The migration is `20261114090000_pharmacy_walk_in_bill_without_patient`. It changes no existing row.
3. **Menus stay as they are.** Only the developer page left.
4. **Guides and tours stay.** Each was rewritten to match the changed screen.

## Defaults I chose that the owner may want to change

- **A visit completes with a complaint or a diagnosis alone.** The option I offered said "and a prescription". That made advice-only, procedure and referral visits impossible to complete, which they were not before.
- **A walk-in bill refuses a medicine marked prescription-only.** Nothing checked that flag at sale before. Until now such a medicine at least needed a registered patient.
- **When a doctor removes every medicine from a saved prescription and completes, the prescription is cancelled.** The API refuses an empty prescription, and cancelling is its audited path.
- **A clinic bill is due when its balance is above zero**, whatever its status. This is the rule the billing module's own outstanding list uses. A refund adds its amount back to the balance, so a refunded bill shows as due again for that amount.

## Rejected proposals

- Booking on a single click with no dialog. A mis-click would book a patient.
- One-tap payment buttons per mode, and remembering a patient's last mode. A slip records money in the wrong mode.
- Applying a remembered dose, frequency or duration silently.
- Uploading a single photo with a default position. Photo comparison pairs photos by position.
- Remembering the sign-in name on the device. Counter computers are shared.

## Redundancy map

The cross-journey critique (`docs/ux-flow/redundancy.md`) found 14 duplicate routes, 12 repeated facts, 9 overlapping features, 15 dead or broken surfaces and 27 standing explanations.

Fixed in this run: the Slots tab, the Counter's duplicate buttons and second queue, the patient page's repeated fields and misleading tracker buttons, the alert and bell links that led to the wrong screen, and the two low-stock definitions.

Left for the owner, because each removes something a role may use: the Pharmacy Desk page, the separate Pharmacy Invoices list, Inventory "Counter sales" and "Quotations", the Drug Database page, merging "Reports" with "Pharmacy Report", and per-role menu trimming.

## Open items

Found during the run and not fixed:

1. **The Reports page summary still counts clinic bills by status**, the same cause as the bills-due defect (`backend/src/modules/reports/reports.service.ts`, near line 1078).
2. **"Start visit" from the patients list opens a second visit** when the patient already has one in progress. The patient page and the landing page avoid this; the list row does not.
3. **A prescription already billed at the pharmacy would still be cancelled** if the doctor then removes all its medicines and completes the visit.
4. **Phone.** The header with search and the bell is hidden at phone width, and the Inventory link sits behind the menu button. The visit form's medicine search opens off screen at 390px. All three were so before this run.
5. **Low stock is judged per batch.** An item with 34 in stock across two batches shows as low when one batch falls under its minimum. The row now says "13 in one batch (34 in all)". Whether the rule should be per item is the owner's call.
6. **A placeholder pack such as "1 unit"** on a saved item makes a typed pack from the bill count as a different product. Treating a placeholder as unknown needs two product rules changed.
7. **On a supplier bill, the checklist header's count** differs from the navigator's.
8. **Two rule texts are stale.** `completion-progress-explanation` still says "below 80%", and `alerts-by-grant` still says "overdue invoices". Both rules hold in behaviour. The text is the owner's to edit.
9. **One rule copy went with the Slots tab.** The Calendar carries its own rule of the same name.
10. **Seven components that nothing imports** (4,411 lines) were not deleted.
11. **Names.** "Bill", "New sale" and "Medicine" are applied on the journeys' screens only.
12. **Commit trailers.** 25 unit commits carry trailers naming the helper model. Rewriting pushed history was blocked.
13. **GitHub issues were not filed.** `ux-flow` normally files one per proposal. They post under the owner's name and were not asked for.

## Already minimal

- The sign-in form itself: two fields and a button.
- Paying a balance: the amount due and Cash are prefilled, so a full cash payment is one click in the dialog.
- Daily Collection opens on today.

## How to rerun

```bash
STACK_DATABASE_URL=postgresql://user:pw@127.0.0.1:5432/db node scripts/ux/journeys/run-all.cjs <label> --compare baseline
```

```bash
node scripts/contracts/compare-attachment.cjs <base-rev>
```

```bash
STACK_DATABASE_URL=postgresql://user:pw@127.0.0.1:5432/db node scripts/ux/measure-words.cjs <label>
```

`run-all.cjs` exits non-zero when a journey fails or gets longer than the label it is compared with.
