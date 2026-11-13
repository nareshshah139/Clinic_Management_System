# UX Flow Critique — 13 November 2026

This is a critique pass, not a test pass. It asks whether each journey should exist in its current shape, and
how it could be simpler and clearer. Per-journey detail is in [`journeys/`](journeys/); cross-screen redundancy and
navigation are in [`redundancy.md`](redundancy.md). The story catalog the journeys were picked from is
[`../ux-paths/catalog.md`](../ux-paths/catalog.md).

## Run Summary

| Metric | Value |
|--------|-------|
| Journeys critiqued | 9 (one more than the default 8, so that every feature area is covered) |
| Evidence source | Live pass against a local build of `main` at `d05d40b`, seeded demo data, 1440×900, 13 Nov 2026; 126 journey screenshots and 35 cross-screen screenshots |
| Verdicts | 0 minimal · 0 acceptable · 9 convoluted |
| Redundancy findings | 16 duplicate paths · 11 duplicate information · 13 overlapping features · 9 navigation |

**How to read the verdicts.** Every journey is "convoluted" end to end, but none is convoluted throughout. Each one
has a core action that is already at or near its ideal (confirming an appointment, raising a standard bill,
`Mark paid`, `Reuse last meds`) surrounded by layout, hand-off and duplicate-surface friction. Those good cores
are listed under [Already Minimal](#already-minimal) and should be left alone.

**Limits of the evidence**

- Not walked live, because the service or device is not available in this environment: bill scanning (OCR), voice
  dictation, translation, WhatsApp/e-mail delivery, printing, camera capture, tele-video. Findings about those
  steps come from the code and are marked "suspected" in the journey files.
- The demo data has no OWNER or MANAGER user, so those two roles are assessed from code only.
- The seed data ships an almost empty medicine catalogue (9 entries against 84 stock items). That exaggerates how
  often a prescription or bill line arrives "not linked" (proposals 9 and 10). The structural problem is real;
  how often staff meet it in production depends on how well the live catalogue is kept in step with stock.
- Step counts use one click, one typed field or one select choice as a step. "Ideal" is the figure stated in the
  story, which critics treated as a benchmark and sometimes adjusted; where their own simpler version differs, the
  journey file says so.

## Friction Scorecard

| Journey | Persona | Steps (actual / ideal) | Needless decisions | Re-entry | Confirmations guarding nothing | Dead ends | Verdict |
|---------|---------|------------------------|--------------------|----------|--------------------------------|-----------|---------|
| [J1 Front desk: register, book, confirm, reschedule](journeys/J1-front-desk.md) | Receptionist | 23 / 15, plus 8 forced scrolls | 4 | 4 | 0 | 3 | convoluted |
| [J2 Consultation billing and day close](journeys/J2-clinic-billing.md) | Receptionist, admin | 36 / 21 | 4 | 5 | 0 | 6 | convoluted |
| [J3 Visit, appointment to `Complete Visit`](journeys/J3-doctor-visit.md) | Doctor, nurse | 23 / 14 | 6 | 4 | 1 (plus 2 "mark complete" buttons) | 3 | convoluted |
| [J4 Prescription: write, print, share, hand to pharmacy](journeys/J4-prescription.md) | Doctor | 34 / 14 | 8 | 4 | 3 | 4 | convoluted |
| [J5 Dispense a prescription to a paid bill](journeys/J5-dispense-prescription.md) | Pharmacist | 10 / 6 on clean data; 20 / 6 on the demo data | 7 | 3 | 2 | 5 | convoluted |
| [J6 Walk-in pharmacy sale and after-sale changes](journeys/J6-pharmacy-walkin-sale.md) | Pharmacist | 19 / 8 | 6 | 2 | 0 | 4 | convoluted |
| [J7 Supplier bill to stock to payment](journeys/J7-purchase-bill.md) | Pharmacist | 28 / about 20 typed; 44 for a first-time bill | 4 | 4 | 2 | 4 | convoluted |
| [J8 Stock lookup, correction and reorder](journeys/J8-stock-reorder.md) | Pharmacist, approver | 25 / 8 | 6 | 3 | 3 | 7 | convoluted |
| [J9 Month-end reports and staff onboarding](journeys/J9-reports-admin.md) | Admin, accountant | 39 / 17 | 10 | 6 | 2 | 5 | convoluted |

Three patterns recur across journeys:

1. **The work is below the fold.** The appointment grid's first bookable row sits at y=910 on a 900 px screen
   (J1, J2, J3). The visit form's first clinical field is about 740 px down (J3). The prescription preview's eight
   action buttons start at y=1281 (J4). The stock list's first result row is at y=1225 (J8). The approved purchase
   order's next action is 1,458 px down (J8).
2. **The same thing is offered in several places that disagree.** The prescription queue appears three times with
   different counts, pharmacy bills are listed on four surfaces with different actions on each, and low stock
   reads 0, 8, 8 or 5 depending on the screen ([redundancy.md](redundancy.md) I1, F3, I3).
3. **Links promise one thing and deliver another.** Header search ends on "No patients found", the patient
   tracker's `Bill` opens a pharmacy bill, and four inventory links land on Inventory › Today regardless of
   their label.

## Redundancy Map

Condensed from [`redundancy.md`](redundancy.md), which gives evidence, lead ids and a verdict for each. "Drift"
means the same thing was built, listed or named twice for no reason a user would recognise.

### Duplicate paths (16; 15 confirmed live)

| Finding | Recommendation |
|---|---|
| P1 Header search → patient result lands on "No patients found" (it searches by internal id) | Open the patient record |
| P2 Four ways to book an appointment; Calendar and Slots are the same grid | Keep Calendar, the patient-record shortcut and walk-in auto-book; remove Slots |
| P3 Two "new patient" dialogs with different fields (16 controls vs 8) | One dialog, short by default |
| P4 `/dashboard/billing`, the tracker's `Bill` and the overdue alert say "bill" for a consultation but open a pharmacy bill | Point them at the clinic bill on the appointment |
| P5 Eight controls start or resume a visit; two on one card are the same link | One `Start visit` / `Resume visit` per surface |
| P6 One prescription, five buttons that open its bill | One `Bill` per row |
| P7 `Inventory Control`, `Shelf locations` and the bell's low-stock and expiry links all land on Inventory › Today | Link to the filtered stock list |
| P8 `Daily close` opens the Pharmacy Desk | Open Daily Collection |
| P9 A due pharmacy bill is visible in Sales but collectable only on a page with no menu entry | `Collect payment` in Sales |
| P10–P12 Twin labels on Inventory (`New purchase` / `Scan or enter bill`), row-plus-button pairs on Today, one approval queue under four names | One label each |
| P13, P14 `Mark paid` vs `Payments & dues`; Daily Collection in the sidebar and inside Pharmacy Report | Deliberate shortcuts — keep |
| P15 Five help mechanisms, some describing controls that do not exist | One Quick Guide per page |
| P16 A doctor's hours and WhatsApp settings editable in two places | One canonical home, one link |

### Duplicate information (11; all confirmed live)

- **I1** The prescription queue is rendered three times and the counts disagree ("Queue 6" beside "1-2 of 2").
- **I2** "Pharmacy sales" is a different number on every screen that shows it; only Daily Collection reconciles
  with the Sales register.
- **I3** Low stock reads 0, 8, 8 or 5 depending on the screen, and the notification bell stays empty.
- **I4, I5** The patient record states identity facts twice; the visit screen says who, what and how far six times
  before the first field.
- **I6–I9** Stacked page titles, system statistics on every role's Dashboard, the clinic total three times above
  the fold in Daily Collection, two role cards on Visits setup.
- **I10, I11** Supplier credit figures repeat between register and ledger; a reorder document is drawn by two
  components on one page, giving two supplier pickers and two cancel actions.

### Overlapping features (13; 9 confirmed live)

| Finding | Recommendation | Effort |
|---|---|---|
| F1 Drug database and Inventory are two product lists; the bill searches the smaller one | Merge into Inventory | L |
| F2 Counter cockpit and Prescription Queue table are two tools for one queue | Merge | M–L |
| F3 Four lists of pharmacy bills, none complete | Sales register canonical; retire two | M |
| F4 Two tools sell stock: the Sales bill and Inventory › Counter sales (and they price the same item differently) | One selling tool | L |
| F5 Appointments › Calendar and › Slots | Remove Slots | M |
| F6 Pharmacy Desk repeats the sidebar and is the only way to two pages | Remove; give those pages real entries | M |
| F7 Two report centres plus Daily Collection split the same questions | Merge into one Reports | L |
| F8 Visit tabs and Prescription sections capture the same vitals, diagnosis and tests | One tests list; one diagnosis input | M |
| F9 Some Pharmacy Report menu entries are the same report | One entry each | S |
| F10 Procedures page and the visit both record a procedure | Differentiate or fold into the visit | M |
| F11 Four ways to change a batch quantity under different approval rules | One policy, then one "Stock adjustments" | M |
| F12 Templates, the learned plan and `Reuse last meds` all prefill treatment | Keep all three; present as one menu | S |
| F13 About 4,300 lines of unmounted components duplicate live features (from code) | Delete | S |

### Navigation and naming (9 findings)

- Every role lands on system statistics (total users, branches). A developer test page, "Test Transcribe", is a
  sidebar item and for doctors is the entire "Admin" section.
- Inventory has four tiers of navigation and puts 17 of its 31 tasks in a dropdown.
- The receptionist's menu has three pharmacy items and no way to close her day; Daily Collection, which holds
  the clinic's takings, is filed under pharmacy and refuses her.
- [`redundancy.md`](redundancy.md#naming-one-concept-one-name) proposes one term for each of 30 concepts. The
  widest drifts: a pharmacy bill has eleven names, a prescription's counter state has three vocabularies, and
  "Supplier" and "Distributor" alternate.
- [Proposed menus per role](redundancy.md#proposed-navigation) cut the admin's sidebar from 16 items to 13, the
  receptionist's from 7 to 4 or 5 and the pharmacist's from 7 to 5.

## Simplification Proposals (ranked)

Ranked by how central the journey is and how much friction goes, against effort. The first six touch the screens
used for every patient, every day. Effort: S is under a day, M is days, L is a week or more or needs a decision
first. These are design proposals; none has been implemented.

### 1. Put the appointment day grid above the fold

- **Now**: On arrival no bookable row is visible. A card title, a seven-line Legend and four filters sit above
  the grid; the first tile is at y=910 on a 900 px screen. The date control is above the fold and the grid below
  it, so a cross-day move takes three scrolls.
  ([J1 02](journeys/J1-front-desk-screens/02-appointments-arrival.jpg),
  [J2 02](journeys/J2-clinic-billing-screens/02-appointments-above-fold.jpg))
- **Proposed**: One sticky toolbar (Doctor, `‹ Today ›` date stepper, wide patient search) with sticky column
  headers. Legend moves into Quick Guide; Visit Type, Room and Grid fold into "Filters"; today scrolls to "now".
  The reschedule banner carries its own day stepper and returns to the starting day after the move.
- **Saves**: 8 forced scrolls in J1; one scroll before every bill in J2 and every visit start in J3. Three journeys
  improved.
- **Effort**: S for removing the chrome, M for the sticky toolbar.
- **Evidence**: J1 changes 1, 2, 5; J2 change 9; J3 change 8. `AppointmentsCalendar.tsx`, `CalendarColumn.tsx`.

### 2. Make links go where they say

- **Now**: Header search → patient result → "No patients found"; → appointment result → a calendar with no doctor
  or date carried. The patient tracker's `Bill`, `/dashboard/billing` and the overdue-invoice alert open a
  pharmacy bill for a consultation. `Inventory Control`, `Shelf locations` and the bell's stock links all land on
  Inventory › Today. `Daily close` opens the Desk. The cockpit's `Rx queue` does nothing. `Back to list` does
  nothing after posting a bill entered from Today.
  ([J1 14](journeys/J1-front-desk-screens/14-header-search-landing.jpg))
- **Proposed**: Patient result opens the record. Appointment result opens Appointments on that doctor and day with
  the appointment open. "Bill" on clinical surfaces opens the clinic bill on its appointment. Stock links open the
  filtered stock list. Remove buttons with no action.
- **Saves**: 3 hard dead ends at the front desk, 1 in billing, 4 in pharmacy and inventory. Five journeys improved.
- **Effort**: S each; M for the appointment deep link.
- **Evidence**: redundancy P1, P4, P7, P8; J1 change 11; J2 change 16; J5 change 4; J7 change 6; J8 change 20.
  `header.tsx:424,450`, `PatientProgressTracker.tsx`, `pharmacy-workspace.tsx`.

### 3. Let the visit's own data decide when it is complete

- **Now**: `Complete Visit` is locked until the doctor presses `Mark Vitals Complete`, presses `Save Labs` (accepted
  with nothing ticked) and uploads at least one photo. The buttons check nothing, a visit without a photo can never
  be completed, and the progress resets to 0 % when a visit is reopened. Before the first field there are about
  740 px of header, tracker, badges and an Overview tab. Three doctor pickers default to another doctor.
  ([J3 03](journeys/J3-doctor-visit-screens/03-visit-form-on-arrival.jpg),
  [J3 09](journeys/J3-doctor-visit-screens/09-completion-blocked-no-photos.jpg))
- **Proposed**: A section is done when it has data, computed from the server. `Complete Visit` is available once
  there is a complaint or a diagnosis, with "No photos · No tests ordered" shown as information beside it. The
  header collapses into the existing sticky identity bar and the form opens on the first working tab. The doctor
  defaults to the signed-in doctor. After completion the footer offers the next appointment.
- **Saves**: 7 of the 9 extra actions per consultation, 3 dead ends, 6 needless decisions.
- **Effort**: M. Note that whether a nurse may save vitals is a clinic policy decision, not a layout one.
- **Evidence**: J3 changes 1, 2, 3, 6. `MedicalVisitForm.tsx`, `visits/page.tsx`.

### 4. One save model and a pinned action bar on the prescription

- **Now**: The preview shows 17 layout controls ahead of its eight action buttons, all of which are below the fold,
  with three at primary weight. One print-and-share session saved the same prescription six times under three
  labels. `Email` is blocked until an explicit save although every other export saves by itself. The footer
  `Go to Pharmacy` navigates without saving, so medicines typed but not saved never reach the bill. A "Go to
  Pharmacy?" dialog interrupts the doctor mid-visit.
  ([J4 10](journeys/J4-prescription-screens/10-preview-actions.jpg),
  [J4 14](journeys/J4-prescription-screens/14-pharmacy-unsaved.jpg))
- **Proposed**: Pin the action bar with `Print` as the single primary; collapse layout controls under "Layout
  options". Every action saves silently and the builder shows "Saved 14:13 · in pharmacy queue · `Open bill`".
  Remove the dialog and the footer `Go to Pharmacy`.
- **Saves**: 34 → 28 actions, 3 confirmations, and the unsaved-medicines trap. Also removes one action from J3.
- **Effort**: M.
- **Evidence**: J4 changes 1, 2, 3; J3 change 4. `PrescriptionBuilder.tsx:5591–5604, 6146–6470, 6896–6926`.

### 5. Close the consultation bill when it is saved, and say the mode on the button

- **Now**: The standard bill is two clicks, which is ideal. After every save the dialog stays open on a read-only
  bill whose only controls are `Add another bill` and the X. The payment mode resets to Cash after each save.
  `Add another bill` opens prefilled with the bill that already exists, one click from a duplicate that cannot be
  removed. `Set fees` leaves the page and discards the typed bill.
  ([J2 05](journeys/J2-clinic-billing-screens/05-bill-paid.jpg),
  [J2 10](journeys/J2-clinic-billing-screens/10-add-another-bill-prefilled.jpg))
- **Proposed**: Close on success with a toast that links `View bill`. Button reads "Create bill and record ₹700 by
  UPI". Keep the last mode while the dialog is open. "Add a charge" starts empty. Admins get a "Save as the
  Procedure fee" tick in place of the detour.
- **Saves**: 36 → 23 actions across a day's billing; 5 of them from the fee detour alone.
- **Effort**: S for the first four, M for the fee tick.
- **Evidence**: J2 changes 1–7. `AppointmentBillDialog.tsx`.

### 6. Register a walk-in without the dialog ambushing the search

- **Now**: "Add New Patient" opens by itself on the first empty search while the receptionist is still typing, so
  the remaining digits of a phone number land in First Name. Gender defaults to "Other" and is saved if skipped.
  There are two new-patient dialogs with different fields.
  ([J1 03](journeys/J1-front-desk-screens/03-phone-search-auto-dialog.jpg))
- **Proposed**: The result list ends with "+ New patient '98480 55501'"; nothing opens by itself. Digits go to
  Phone. No preselected gender. Primary button "Create & book next free time", reusing the walk-in auto-book that
  the Patients page already has. One dialog for both entry points.
- **Saves**: 9 → 6 steps per walk-in, 2 re-entries, 1 silently wrong default.
- **Effort**: S–M.
- **Evidence**: J1 changes 3, 4; redundancy P3. `PatientQuickCreateDialog.tsx:74`, `AppointmentsCalendar.tsx:292–295`.

### 7. Show the prescription queue once, and end the bill on a "Paid" state

- **Now**: The queue appears in the cockpit, in a table under it, and above every bill. The cockpit's
  `Accept / Sub / Edit / NA` decisions are never read by the bill, so a substitution is done twice, and those
  buttons are cut off below 1680 px width. Five buttons open the same bill. The confirm step is called
  `Print Preview`, never shows the payment mode, and returns to a filled form that still looks unpaid.
  ([J5 02](journeys/J5-dispense-prescription-screens/02-counter-cockpit-1440.jpg),
  [J5 13](journeys/J5-dispense-prescription-screens/13-after-close-notice.jpg))
- **Proposed**: One queue per page, longest-waiting first. Line decisions are made on the bill, where `Substitute`
  already works well. `Review & confirm` with one primary "Confirm & collect ₹… (Cash)", ending on a finished-bill
  state with `Next prescription`.
- **Saves**: 10 → 4 clicks on the happy path in the critic's simpler version, 7 needless decisions, 5 dead ends.
  Improves J5 and J6, which share the confirm step.
- **Effort**: S for the layout fix and dead buttons, M for the end state, M–L for merging cockpit and table.
- **Evidence**: J5 changes 1–4, 6–8; J6 changes 4, 5; redundancy I1, F2, P6.

### 8. One list of pharmacy bills

- **Now**: Four surfaces list the same bills. Discount edits and refunds exist only in the finished-bill view.
  Collecting a due exists only on "Pharmacy Invoices", which has no menu entry, so a "Due" bill dead-ends in
  Sales. Export exists only in Pharmacy Report. The invoice list also offers `Delete Invoice` on finished bills.
  ([J6 12](journeys/J6-pharmacy-walkin-sale-screens/12-due-bill-dead-end.jpg))
- **Proposed**: The Sales register is canonical. Add `Collect payment` and PDF download to the finished-bill view
  and a list download to the register. Redirect "Pharmacy Invoices" and Inventory's "Patient invoice history" to
  it. Rename the report "GST sales register".
- **Saves**: 1 dead end and 2 surfaces. Collecting a due balance is written as 8 steps in STORY-080 against an
  ideal of 3.
- **Effort**: M.
- **Evidence**: redundancy F3, P9; J6 changes 6, 14.

### 9. One selling tool

- **Now**: `New sale` requires a registered patient and has no way to add one. An unnamed walk-in, the commonest
  counter case, must be sold through Inventory › Sales › Counter sales, a different editor that nothing in Sales
  points to. The two tools price the same sunscreen at ₹660.80 and ₹560.00, because one adds GST on top of the
  price and the other treats the price as inclusive.
  ([J6 04](journeys/J6-pharmacy-walkin-sale-screens/04-patient-no-match.jpg),
  [J6 14](journeys/J6-pharmacy-walkin-sale-screens/14-counter-sale-editor.jpg))
- **Proposed**: `New sale` accepts "Walk-in, no patient record" or an inline add-patient, and opens on the bill
  instead of on other patients' prescriptions. Returns and quotations become tabs on Sales. Decide one price basis
  first; that part is a correctness question, not a design one.
- **Saves**: 19 → 13 clicks and inputs for a walk-in bill, 2 dead ends, 1 whole editor.
- **Effort**: S to put the bill first, M for inline add-patient, L for the merge.
- **Evidence**: J6 changes 1, 7, 8, 9; redundancy F4.

### 10. One product list

- **Now**: The Drug database and Inventory are separate lists. The bill and the prescription search read the Drug
  database, so an item on the shelf that is not also in it cannot be billed until someone links it; Inventory
  shows these as "Unmapped". The Drug database is reachable only through a button on the Pharmacy Desk.
  ([J6 05](journeys/J6-pharmacy-walkin-sale-screens/05-drug-no-match.jpg))
- **Proposed**: Inventory owns the product list; bill and prescription search read inventory items; the "Unmapped"
  state disappears.
- **Saves**: The re-link at the till (9 of J5's 20 clicks on the demo data). J4's missing-medicine detour (14
  actions) has the same root; J4 change 4 is a smaller fix that takes it to about 5.
- **Effort**: L. See the caveat about the demo data under Run Summary before sizing this.
- **Evidence**: redundancy F1; J5 change 5; J4 change 4.

### 11. Remove the Appointments "Slots" tab

- **Now**: Calendar and Slots are two separately coded wrappers around the same day grid. Slots silently drops the
  Procedure Name, and its "Duration" filter is the grid step that Calendar calls "Grid".
- **Proposed**: Delete the tab and its tour step.
- **Saves**: 1 needless decision on every visit to the page, and a duplicate implementation.
- **Effort**: M.
- **Evidence**: redundancy F5, P2; J1 change 10. `AppointmentScheduler.tsx`.

### 12. Purchase bill lines that fill themselves

- **Now**: The user types pack size, unit, HSN and GST % for products the app already knows, and the supplier's
  licence number on every bill. A pristine form opens with red error blocks, and the same problems are listed
  three times down a 4,400–6,600 px page. An unfinished typed bill is absent from the register's `Not posted`
  filter and from Today. `Save draft` shows "saved", "not saved" and "corrections were not saved" together.
  ([J7 04](journeys/J7-purchase-bill-screens/04-type-instead-first-view.jpg),
  [J7 08](journeys/J7-purchase-bill-screens/08-save-draft-interrupted.jpg))
- **Proposed**: A product typeahead on each line fills pack, unit, HSN and GST and counts as the match. Licence
  number comes from the saved supplier. No errors until a field is touched. One issue list. Unfinished bills are
  listed where the user looks for them.
- **Saves**: 8 of the 28 interactions on a routine typed bill, 4 re-entries, all 4 dead ends. No check on batch,
  expiry, GST or money is removed.
- **Effort**: M.
- **Evidence**: J7 changes 1–7. `PurchaseInvoiceWorkbench.tsx`.

### 13. Put the next action where the reorder document is

- **Now**: After approval the sticky bar says only "Approved"; `Send` and `Receive` are 1,458 px down. Today says
  "4 Low stock" while the Shortbook says 0 until `Sync shortages` is pressed. A request shows two supplier
  pickers. A target proposal lists 78 lines of which 74 propose no change, with `Accept selected` at y=10,213.
  ([J8 10](journeys/J8-stock-reorder-screens/10-purchase-order-approved-delivery-panel.jpg),
  [J8 12](journeys/J8-stock-reorder-screens/12-target-proposal-bottom.jpg))
- **Proposed**: The sticky bar carries the state's next action. Shortages sync when the Shortbook opens. One
  supplier picker. No-change lines collapse.
- **Saves**: Most of the gap between today's 25 actions and the critic's 8-step version of low stock to a
  received order.
- **Effort**: M.
- **Evidence**: J8 changes 1–5. `ReplenishmentCenter.tsx`, `WorkflowDocumentEditor.tsx`.

### 14. One Reports, with the period carried across

- **Now**: Month-end is spread over Reports & Analytics, Pharmacy Report and Daily Collection, with five filter-bar
  designs and no shared period; the month is re-entered on five screens. "Total Revenue" on the admin page is
  clinic-only (₹5,600 against a whole-day ₹8,590.40) and does not say so. The report menu disappears below the
  `2xl` width once a report is open.
  ([J9 01](journeys/J9-reports-admin-screens/01-reports-analytics-revenue.jpg))
- **Proposed**: Carry the applied period from report to report; keep a report switcher visible; label clinic-only
  figures. Then fold Reports & Analytics into the catalogue as a "Clinic" group and build a month summary from
  Daily Collection's Clinic / Pharmacy / Total table.
- **Saves**: 23 → 6 steps for the month-to-date picture once the month summary exists; 6 re-entries with the
  shared period alone.
- **Effort**: S for labels and the switcher, M for the shared period, L for the merge.
- **Evidence**: J9 changes 1–8; redundancy F7, H8.

### 15. Land each role on its working screen and trim the sidebar

- **Now**: Every role lands on user and branch counts. "Test Transcribe", a developer page, is in the sidebar.
  Pharmacy Desk repeats the sidebar. The receptionist cannot open Daily Collection, which holds the money she took.
- **Proposed**: Receptionist and nurse land on Appointments, the doctor on "My day", the pharmacist on the
  prescription queue, the accountant on Daily Collection. Remove Test Transcribe and Pharmacy Desk from the menu.
  Give the receptionist the clinic half of Daily Collection.
- **Saves**: 1 click per session for every role; 3 menu items; 1 dead end at day close.
- **Effort**: S to remove Test Transcribe, M for landing pages and the Daily Collection split.
- **Evidence**: redundancy H1, H2, H6, H7, F6; J1 change 14; J2 change 13; J3 change 10.

### 16. One name per concept

- **Now**: A pharmacy bill is called Sales, sale, bill, invoice, GST bill, counter sale and document. A
  prescription's counter state has three vocabularies. Money owed is Due, Pending or Credit. Supplier and
  Distributor alternate. Page titles add "Management" to the menu label.
- **Proposed**: Adopt the 30-row term table in [`redundancy.md`](redundancy.md#naming-one-concept-one-name);
  page title equals menu label.
- **Saves**: No steps. Removes hesitations counted in every journey (between 10 and 15 each).
- **Effort**: S–M, copy only.
- **Evidence**: redundancy "Naming: one concept, one name"; each journey's Clarity Issues section.

## Already Minimal

Credit where due, so that a re-run can skip these. Details are in each journey's "Already Minimal" section.

- **Front desk**: confirming an appointment (tile → `Confirm`, no dialog, reversible); cancelling (three clicks and
  one warning that earns its place); the reschedule interaction; booking an existing patient (4 steps, at ideal);
  patient search matching; column headers that state the morning's to-do count.
- **Clinic billing**: the standard bill (chip → `Create bill and record ₹700`, everything prefilled, amount on
  the button in place of a confirm dialog); part payment; paying a balance later; changing the fee; validation
  text; the Fee list page.
- **Visit**: calendar → visit in one click; the sticky identity bar; vitals carrying to the prescription; photo
  upload with pre-guessed positions; `Complete Visit` itself; reviewing the previous visit in two clicks.
- **Prescription**: `Reuse last meds`; follow-up chips; diagnosis-driven prefill with one-click undo; usual
  regimen on re-prescribing; search results that show stock; `Print`; the WYSIWYG page with `Fit to 1 page`.
- **Dispensing**: queue row → `Bill` (two clicks to a prefilled bill, at ideal); bill prefill; remembered item
  links; `Substitute`; stock warnings that block a bad confirm.
- **Pharmacy sales**: the Sales register; Edit discount; Record refund; the finished-bill view; `Save draft`.
- **Purchases**: `Mark paid` (2 clicks, amount on the button, `Undo` in the cell); posting (one button whose
  label is the confirmation); the Purchase bills register; inline supplier and product creation.
- **Stock**: the Edit stock dialog; `Create purchase order` from a request; `Receive remaining stock`; the stock
  search itself; approval card content.
- **Reports and admin**: the Pharmacy Report catalogue and its shared toolbar; Daily Collection for the pharmacist
  and its Clinic / Pharmacy / Total table; the reset-code flow.
- **Structure**: sidebar role gating matches the documented matrix exactly; legacy redirects all work; the Fee
  list has one home.

Leads from the catalog that did **not** hold in the running app are listed in
[`redundancy.md`](redundancy.md#leads-refuted).

## Functional problems tripped over

Out of scope for this pass and not investigated further. The first four were checked against the source after
the walk; the rest are as observed by the critics.

- A new pharmacy bill started with `Start a new invoice` keeps the previous bill's discount
  (`PharmacyInvoiceBuilderFixed.tsx`: `startNewInvoice` never clears `billDiscount`).
- Hand-added pharmacy bill lines are always taxed at 18 %, whatever the product's rate
  (`PharmacyInvoiceBuilderFixed.tsx:1116`).
- Users › Role & Permissions is empty: `GET /users/roles` and `/users/permissions` return 404 because `@Get(':id')`
  is declared before them (`users.controller.ts:96, 181, 210`).
- Header search links a patient result by internal id, which the patient search does not match (`header.tsx:424`).
- Users › Edit › Status "Inactive" returns 200 but the user stays active; `New User` after a cancelled Edit opens
  the previous user's data (J9).
- The same item is priced GST-exclusive in a Sales bill and GST-inclusive in a Counter sale (J6).
- A prescription for 30 capsules was billed as 30 strips (J5; seen on API-created prescriptions, so suspected
  for builder-created ones).
- Nurse `Mark Vitals Complete` returns 403, and the doctor then sees blank vitals (J3).
- The first `Mark Vitals Complete` on an unsaved visit creates the visit but does not mark the section (J3).
- An unfinished typed purchase bill is absent from `Not posted` and from Today (J7).
- Today's "Orders awaiting receipt" counts an order still awaiting approval (J8).
- Reports & Analytics `Export` fails silently with "Unsupported report type: undefined" (J9).
- Daily Collection truncates every clinic bill number to the same "INV-202611…" and shows refunds as "-0.00" (J2).
- The login form shows a raw "ThrottlerException" when several staff sign in within a minute (J6).
