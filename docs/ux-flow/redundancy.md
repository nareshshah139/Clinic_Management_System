# Redundancy and Information Architecture: ClinicMS

Redundancy Critic pass for `/ux-flow` (cross-cutting, report-only). Date: 2026-11-07.

**Lead list:** `docs/ux-paths/catalog.md` → "Redundancy Candidates" (RC-P01…P60, RC-I01…I28, RC-F01…F18, plus 9 dead-route groups). Item IDs are kept so the synthesis step can cross-reference them. New items found in this pass are numbered **N-I** (information) and **H** (hierarchy and IA).

**Other evidence:** `docs/ux-paths/discovery.md`; `docs/ux-visual/pages/*-findings.md`; `docs/ux-walker/stories/*/walk-report.md` (Flow log sections); screenshots in the session scratchpad (`ux-visual/shots/…`, `ux-walker/shots/…`); source in `frontend/src/components/layout/`, `frontend/src/app/dashboard/**`, and the components they render.

**How sure each claim is** (honesty rule: measured vs suspected):
- **code**: I re-checked it in source during this pass (file:line given).
- **shot**: I opened the screenshot during this pass and saw it.
- **walk**: a ux-walker or ux-visual report confirmed it live. I did not re-run it.
- **lead**: catalog claim only, not re-verified. Treat it as suspected until someone checks it live.

**Recommendation vocabulary:**
- **Keep both**: deliberate, or an accelerator that gives the same result.
- **Canonical**: name one route or surface as the source of truth. The others become accelerators into it, with an identical result.
- **Remove**: delete the duplicate or dead affordance.
- **Merge**: two implementations become one.

## Summary

| Section | Items | Breakdown |
|---|---|---|
| Duplicate Paths | 60 (+9 dead-route groups) | Keep both 18 · Canonical 21 · Remove 8 · Merge 13 |
| Duplicate Information | 37 (28 leads + 9 new) | Noise 23 · Partly justified 9 · Justified (keep) 5 |
| Overlapping Features | 18 (0 new) | Merge 8 · Canonical/remove one 7 · Differentiate 3 |
| Hierarchy & IA | 12 findings (H1–H12) + 15 naming-drift concepts + depth map (11 destinations) | Structural 4 (H1, H7, H9, H12) · Role/priority 5 (H2, H3, H4, H5, H8) · Depth/weight 3 (H6, H10, H11) |

What the evidence says overall: the app is **not** redundant everywhere. Inventory has one entry point by design (`sidebar.tsx:38-41`, `@cc single-inventory-entry`), and its Today queue already deep-links correctly. Accelerator duplicates such as approval-queue links, row-vs-detail "Edit stock" and the branded switch are fine. The harm is concentrated in about a dozen **divergent** duplicates, where the route a user happens to take changes the outcome: the visit-start contract, the two sale back-ends, the Calendar/Slots split, the three sets of stock and alert definitions, and the duplicate admin editors.

---

## Duplicate Paths

"Deliberate" = a shortcut placed in context on purpose. "Drift" = parallel implementations, or routes that diverge silently. "Result" = whether the routes end in the same state.

### Clinical front office

| ID | Goal and routes | Deliberate / drift | Result | Recommendation | Evidence |
|---|---|---|---|---|---|
| RC-P01 | **Start / open a visit**: 13 link sites into `/dashboard/visits` (tile START/CONT, Appointment Details, Slots, Patients row, patient detail ×2, tracker ×3, Dashboard Recent Visits, History "Resume session", Visits setup, bell) | Context entries are deliberate; the URL contracts are drift | **Divergent.** Slots creates a server visit with the placeholder complaint "General consultation"; `autoStart` picks the first doctor from a `limit:1` list; the bell passes only `appointmentId` | **Canonical**: one `openVisit({appointmentId?, patientId, visitId?})` helper used by every entry point. It always attributes the visit to the signed-in doctor and never pre-creates a placeholder. Keep the in-context entries (tile, patient row, patient detail) as accelerators. | code: `grep dashboard/visits?` gives 13 sites; `AppointmentScheduler.tsx:548-552`; `visits/page.tsx:520-521`; `header.tsx:177`. walk: STORY-401/402 |
| RC-P02 | **Reopen the last visit from the patient page**: header "Resume last visit", tracker "Continue", tracker "Prescribe"/"View", History "Resume session" | Drift | Same: the first three build the same `?patientId&visitId=<latest>` URL | **Remove** the tracker's Continue and Prescribe/View. The tracker becomes status only, and the header button stays. Keep "Resume session" on History cards, because it targets *any* past visit. | code: `PatientProgressTracker.tsx:174-204`, `patients/[id]/page.tsx:213-219`. shot: `ux-visual/shots/patients/detail-shravya-1440.png` shows "Resume last visit" and "Continue"/"View" 300px apart |
| RC-P03 | **Book an appointment**: Calendar tab, Slots tab, walk-in auto-book, patient detail "Book appointment", tracker "Book", in-scheduler "Add New Patient" | Calendar/Slots is drift; walk-in and chart entries are deliberate | **Divergent.** Slots drops the procedure name; `?patientId` prefill cannot complete; walk-in picks the slot silently | **Canonical**: the Appointments grid (after the F01 merge) with the patient carried in from context. Fix the `?patientId` prefill. Keep walk-in auto-book as the fast path, but show the slot it chose and surface its errors. Remove the tracker "Book" (the header already has it). | code: the Slots payload `AppointmentScheduler.tsx:322-329` has no `notes`; Calendar sends `notes` (`AppointmentsCalendar.tsx:358-366`). walk: STORY-004 (actual 9 steps vs ideal 4) |
| RC-P04 | **Create a patient**: "Create Patient" dialog, scheduler PatientQuickCreateDialog, walk-in variant | Drift | Divergent field sets and validation | **Merge**: one patient form with a short "quick" mode (name, phone, age, gender) and a "more details" disclosure, using the same validation everywhere | lead (catalog 014/015/026); discovery field lists |
| RC-P05 | **Find a patient**: header global search, Patients search, Appointments picker, Visits picker, Dashboard "My Patients" | Pickers are deliberate; global search is broken | Divergent. A global-search patient result lands on an empty list with the raw id in the search box | **Canonical**: Patients search is the place to look a patient up, and the global search result opens `/dashboard/patients/[id]` directly. Keep the contextual pickers but make them one shared component with the same matching rules. | code: `header.tsx:418` (`?search=<id>`). shot: `ux-walker/shots/auth-shell-navigation--STORY-007/step-6-patients-empty.png` ("cmw6dbbe20…", "No patients found") |
| RC-P06 | **Reschedule / cancel**: one working route each, plus dead Slots handlers, long-press, "double-click" guide text and inline X | Drift | One route works | **Remove** the dead affordances, or wire them to the single working action. Add "Reschedule" to Appointment Details. | lead (029/030); APT-12 (walk) |
| RC-P07 | **Doctor availability**: header My Settings (doctor) vs Users → Working Hours (admin) | Deliberate (self-service vs admin on behalf) | Same component | **Keep both**. They should stay one component; the holiday part is covered by P08. | code: both import `DoctorAvailabilitySettings` (`header.tsx:31`, `UsersManagement.tsx:21`) |
| RC-P08 | **Delete a clinic holiday**: Users → Clinic Holidays vs the trash icon in any doctor's Working Hours | Drift | **Divergent and dangerous**: no confirm, and it deletes the holiday for every doctor | **Remove** the delete control from the per-doctor dialog. Show holidays there read-only, with a link to Clinic Holidays. | lead (033/113); walk STORY-011 (holiday screens) |
| RC-P09 | **Room availability**: Rooms → Calendar View vs room cards in Book Appointment | Deliberate (overview vs at-booking) | Divergent hours (09:00–18:00 vs the doctor's hours) | **Keep both**, fed from one availability source and one hour window | lead (034/027); APT-01 (walk) for the hour-window cause |
| RC-P10 | **Activate / deactivate a room**: row Switch vs "Room is active" in Edit | Deliberate | Same | **Keep both**. The catalog says an inactive room "vanishes", but discovery lists an Active/Inactive filter, so confirm live that the filter brings it back. | lead; conflicting docs flagged |
| RC-P11 | **Record a procedure**: Procedures page vs the visit form's Procedures section | Drift | Divergent data shape; the page cannot save (400 "complaints must be an array") | **Remove** the Procedures page's save, or have it write through the visit form's shape. The visit form is canonical (see F04). | walk: STORY-411 step 7 |
| RC-P12 | **Order lab investigations**: Lab Tests tab vs the Prescription tab's ClinicInvestigations | Drift | Divergent (separate data) | **Merge** into one investigations list that both tabs show | walk: STORY-401 ("30-test list appears in both") |
| RC-P13 | **Enter vitals**: Vitals tab vs Prescription → Clinical Details & Vitals | Deliberate (on hand while prescribing) | Same; synced | **Canonical**: the Vitals tab. On the Prescription tab show a one-line read-only summary with "Edit" instead of a second full form. | shot: `ux-walker/shots/visit-documentation--STORY-401/step-13-prescription-tab.png` (the full vitals grid repeated). VIS-11 |
| RC-P14 | **Dictation**: in-form mics vs `/test-transcribe` | Drift (diagnostic bench) | Divergent; the bench is not tied to a visit | **Remove** `/test-transcribe` from the production nav (H4) | code: `sidebar.tsx:128-133` |

### Prescriptions

| ID | Goal and routes | Deliberate / drift | Result | Recommendation | Evidence |
|---|---|---|---|---|---|
| RC-P15 | **Hand an Rx to the pharmacy**: footer "Go to Pharmacy", post-create "Yes, go to Pharmacy", tracker "Bill", Billing "Load" / Counter queue | Push routes are drift; pull routes (pharmacy picks it up) are deliberate | **Divergent.** The footer passes `visitId` without saving; the dialog passes `prescriptionId` with no `visitId` | **Canonical**: one push action that saves first and passes both ids. Keep the pharmacy-side queue pick-up, because a different person does it. | code: `PrescriptionBuilder.tsx:5468` vs `:6750`. walk: prescriptions STORY-001 |
| RC-P16 | **Reprint an Rx**: Visits history "View Prescription" → Print vs resume the visit → Print Preview | Drift | Divergent: the first prints the whole dashboard, the second re-saves the visit | **Canonical**: one print renderer (the Preview one), reachable from any history card without re-saving | lead (059/060) |
| RC-P17 | **Re-issue the last regimen**: 5 mechanisms (Reuse last meds, Reapply learned plan, Fill missing only, template, Recent-meds chips) | Drift | Overlapping | **Merge** into one "Start from…" menu (last visit / learned plan / template). Keep the chips as an accelerator. | lead (057) |
| RC-P18 | **Create an Rx template**: 3 dialogs | Drift | Divergent: "on this device" copy, but it saves a public server template | **Merge** into one "Save as template" dialog with "include medicines / include fields" options | lead (055) |
| RC-P19 | **Print layout**: format ×2, margins ×3, letterhead ×2 | Drift | Divergent: a custom URL silently overrides the uploaded letterhead | **Canonical**: doctor defaults in My Settings, per-print overrides only in Preview. Remove the Customization-tab duplicates and the always-empty "Printer profile". | lead (051/052) |
| RC-P20 | **Share an Rx**: Email, PDF via WhatsApp, Download; a server share endpoint with no UI | Choices are deliberate; the backend is drift | Divergent: false success on email; wa.me without +91 | **Merge** the delivery path onto one backend share and keep the three user choices | lead (053/054); F13 |

### Pharmacy

| ID | Goal and routes | Deliberate / drift | Result | Recommendation | Evidence |
|---|---|---|---|---|---|
| RC-P21 | **Sell medicines**: 8+ entry points into PharmacyInvoiceBuilderFixed, plus Inventory → Sales → "Counter sales" (COUNTER_SALE workflow) | The 8 entries are accelerators; Counter sales is drift | **Divergent back-ends.** COUNTER_SALE posts only a stock `SALE` transaction and never creates a PharmacyInvoice | **Canonical**: the invoice builder. Retire Inventory "Counter sales", or make it create a PharmacyInvoice (see F02). | code: `inventory-workflow.service.ts:1444-1446`; `InventoryWorkspace.tsx:71` |
| RC-P22 | **Open the bill from the Counter**: header "Bill", Active Dispense "Open bill", "Collect payment", Rx Queue row "Bill" | Drift | Same destination; "Collect payment" collects nothing | **Remove** the header "Bill" when nothing is selected, and rename "Collect payment" to "Open bill". Keep the row and Active Dispense buttons. | shot: `ux-visual/shots/pharmacy/1440x900-counter-full.png` (header "Bill", "Open bill" and "Collect payment" on one screen) |
| RC-P23 | **Prescription queue**: cockpit Queue column, the "Prescription Queue" table under it, the same table on Billing; the cockpit "Rx queue" button | Drift | Divergent: review, pause and notes exist only in the cockpit | **Merge**: the cockpit queue is canonical. Delete the second table under the cockpit, give Billing a compact patient/Rx picker, and remove "Rx queue" (it is wired to `() => undefined`). | code: `pharmacy/page.tsx:406-424` (cockpit + `PrescriptionDispensingQueue`), `:457-464` (same table on Billing), `:410` no-op. shot: counter-full, billing |
| RC-P24 | **Link an Rx line to inventory**: Stock column (Counter, Billing), builder box; "Substitute" looks similar | Deliberate (link where the line is seen) | Divergent only for Substitute | **Keep both** link spots. Give Substitute a "remember this match" option, or style it clearly differently. | lead (064) |
| RC-P25 | **Invoice list**: Desk "Invoices" → `/dashboard/pharmacy/invoices` vs Inventory → Sales → "Patient invoice history"; the bell's "pending payments" goes to the builder | Drift | Same component (`PharmacyInvoiceList`) | **Canonical**: `/dashboard/pharmacy/invoices`. Make the Inventory sub-view a link to it, and point the bell there. | code: `pharmacy/invoices/page.tsx:3,21`; `InventoryWorkspace.tsx:20,429`; `header.tsx:194/227/234` |
| RC-P26 | **Record payment**: only the list's "Mark as Paid" works; checkout stores the method but leaves PENDING; "Collect payment" only opens the builder | Drift | Divergent | **Remove** the lookalike: checkout with a payment method should mark the invoice paid, and "Collect payment" gets renamed (P22) | lead (063/068); shot confirms the label |
| RC-P27 | **Reprint an invoice**: list View/Download (simple) vs builder "Reopen confirmed invoice" (full) | Drift | Divergent formats (no HSN, batch or GSTIN in the list version) | **Canonical**: one invoice print template, the builder's | lead (067) |
| RC-P28 | **Was this patient billed?**: tracker "Bill"/"Invoices", Pharmacy Invoices search, Inventory invoice history | Drift | Divergent: the tracker reads the orphaned clinic `/billing/invoices` | **Canonical**: Pharmacy Invoices filtered by patient. Point the tracker at it. | lead (071); code: the tracker button text depends on `hasRecentInvoice` (`PatientProgressTracker.tsx:206-214`) |
| RC-P29 | **Create a drug**: Drug Management, the Rx add-drug dialog, AI `create_drug` | In-Rx add is deliberate | Divergent validation | **Canonical**: one server-side create with one validation. Keep the in-Rx add as an accelerator, but return the new id. | lead (075/058/082) |
| RC-P30 | **Change price or details**: Drug Management, Inventory "Edit price", AI `update_drug` | Drift | Divergent approval rules | **Merge** into one approval rule (F06/F12) | lead (076/086/082) |
| RC-P31 | **Reach Drug Management**: only the Desk "Drugs" button or a typed URL | Gap | n/a | **Canonical** home needed: put it under Inventory (e.g. Stock → "Products") or a Pharmacy sub-nav item | code: `pharmacy/page.tsx:214` is the only `router.push` to it; there is no sidebar item (`sidebar.tsx:42-134`) |
| RC-P32 | **Partner daily sync**: Desk card vs Counter "Daily close" | Deliberate | Same: "Daily close" switches to the Desk | **Keep both**; label it "Daily close (on Desk)" | code: `pharmacy/page.tsx:221` `onOpenPartnerSync → openPharmacyTab('desk')` |
| RC-P33 | **Archive an AI thread**: dock header vs rail icon | Deliberate | Same | **Keep both** | lead (083) |

### Inventory and purchases

| ID | Goal and routes | Deliberate / drift | Result | Recommendation | Evidence |
|---|---|---|---|---|---|
| RC-P34 | **Check low stock**: 6+ routes with 3 definitions (Today, Stock filter, bell, Desk tile, Dashboard alert, AI, Reorder) | Accelerators are deliberate; the definitions are drift | **Divergent counts**: Desk "Stock 1 · 0 low" vs Today "4 Low stock" | **Canonical**: one definition, served by Inventory Today → Stock list `stock=LOW`. Every other surface shows that number and deep-links there. | code: the bell uses `?tab=low-stock` (`header.tsx:207,269`), but InventoryWorkspace reads only `area`/`view` (`InventoryWorkspace.tsx:112-117`). shot: `pharmacy/1440x900-desk.png` vs `inventory/1440x900-today.png` |
| RC-P35 | **Check expiring stock**: 4 routes; the bell's `?tab=expiry` is dead | Same pattern | Divergent (the dead link lands on Today) | **Canonical**: Today → Stock list expiry filter; fix the bell link | code: `header.tsx:214,277` |
| RC-P36 | **Reach the price/stock approval queue**: 4 routes | Deliberate | Same | **Keep both** (accelerators; the redirect route is fine for bookmarks) | code: `inventory-updates/page.tsx` → `area=stock&view=approvals` |
| RC-P37 | **Edit stock**: list row vs batch detail | Deliberate | Same | **Keep both** | lead (086) |
| RC-P38 | **Correct a stock quantity**: change request (OWNER/ADMIN/DOCTOR) vs count document (OWNER/ADMIN/MANAGER) | Drift | Divergent approvers | **Merge** the approval rules (F06) | lead (086/090) |
| RC-P39 | **Start a stock count**: 6+ routes | Deliberate (scoped starts) | Mostly the same | **Keep both**. Make sure each one prefills its scope. | lead (090) |
| RC-P40 | **Hold / loss / supplier return**: batch buttons vs register "New document" | Deliberate | Differ only in prefill | **Keep both**; add a batch picker to the register form | lead (091) |
| RC-P41 | **Opening stock**: "Add batch" + "Manual opening stock" (two flows), Excel import, Purchases inward | Drift for the first pair | Divergent | **Merge** Add batch and Manual opening stock into one form with a quantity field. Keep the Excel import (bulk) and inward receipts (a different business event). | INV-06 (walk: "Add batch" opens an item form with no batch/expiry); lead |
| RC-P42 | **Create a PO**: Shortbook → PO, "Add purchase order", manual request, automation drafts | Deliberate sources | Overlapping, one list | **Keep both**; label the source on each draft | lead (094/095) |
| RC-P43 | **Receive against a PO**: PO detail, Inward challans "choose PO", "Receive against order", linked receipts | Drift | Overlapping | **Canonical**: PO detail "Receive remaining stock". The other entries open that same form. | lead (094/105) |
| RC-P44 | **Cancel the rest of a part-received PO**: ReplenishmentCenter works; the editor label can never show | Drift | One works | **Remove** the dead label | lead (094) |
| RC-P45 | **Change reorder targets**: 4 routes, 2 permission rules | Drift | Divergent: the batch "Edit product details" bypasses the manager rule | **Merge** to one permission check; targets editable only in Reorder | lead (095) |
| RC-P46 | **Bring in a supplier bill**: 8+ routes incl. one-click "Import & Add Stock" | Sources are deliberate; the one-click post is drift | Divergent: one-click skips review | **Canonical**: the "Scan or enter bill" workbench. CSV and Gmail stay as intake *sources* that land in the same draft review. Remove the one-click post, or send it through review. | lead (097/098/101/102) |
| RC-P47 | **Fix a misread bill**: manual entry vs "Reject invoice" (permanently blocks the number) | Deliberate pair | Divergent; Reject is a trap | **Keep both**; make Reject reversible or confirm its consequence | lead (100) |
| RC-P48 | **Is this bill already saved?**: upload hash, Saved bills search, Supplier → Bills | Deliberate | Same | **Keep both** | lead (099) |
| RC-P49 | **Create or correct a supplier**: Suppliers edit (no checks) vs workbench (checks, reason, audit) | Drift | Divergent safeguards | **Canonical**: the workbench validation + audit, used by the Suppliers edit form too | lead (103) |
| RC-P50 | **Pay a supplier**: Today row, Today button, Payments & dues, Supplier → Account & dues | Deliberate | Same (one edge error) | **Keep both**; fix the Account & dues error for suppliers with no bills | lead (104) |
| RC-P51 | **Apply a supplier credit**: embedded panel vs Credits & vouchers | Deliberate | Same | **Keep both** | lead (104) |
| RC-P52 | **Distributor ranking**: Purchase costs vs Monthly Report "Top distributors" | Drift | Divergent metric | **Canonical**: Purchase costs. Retitle the report block "Top 10 by net payable". | lead (106/107) |

### Admin, help and shell

| ID | Goal and routes | Deliberate / drift | Result | Recommendation | Evidence |
|---|---|---|---|---|---|
| RC-P53 | **Change a user's role**: Edit → Role select vs Role & Permissions → "Apply Role" | Drift | Divergent: Apply Role overwrites explicit permissions, then shows a false "Failed to update role" | **Merge** into one role editor (F09) | code: `UsersManagement.tsx:382-399` (`applyRole`), `:461/561` (two role selects). walk: STORY-011 |
| RC-P54 | **WhatsApp settings**: header My Settings (toggles, template picker) vs Users → WhatsApp Settings (phone id, token) | Drift | Neither one is complete | **Merge** into one per-doctor settings page (F08) | lead (115); discovery |
| RC-P55 | **WhatsApp Template Editor**: only via Users → doctor row → WhatsApp Settings → Manage | Gap (depth 4) | n/a | **Canonical** home: a "Messaging" section in settings, reachable by doctors too | lead (116) |
| RC-P56 | **Reset-code entry**: login link vs direct URL | Deliberate | Same | **Keep both** | lead |
| RC-P57 | **Help**: 8 QuickGuides + Appointments guide + Receptionist tour + Doctor tour + Shortcuts; two guides both titled "Visit Documentation Guide" | Drift | Divergent and stale | **Merge** to one help surface per page. Keep only the guides that describe real UI. | code: `visits/page.tsx:751` and `:1093` (same title, two guides). PH-20 (walk: Desk guide names tabs that don't exist) |
| RC-P58 | **Export data**: Patients CSV, Reports export, Compliance export | Not real duplicates (different data) | n/a | **Keep both**. They have the same verb and different data: label them by content ("Export patient list"). | lead; judged a false positive |
| RC-P59 | **Branded mode**: switch on `/login` and in the header | Deliberate | Same key | **Keep both** (the header switch is demoted in H10) | lead |
| RC-P60 | **Reach a patient record after login**: `?next`, global search, sidebar → search → View, doctor "My Patients" | Deliberate | Global search is broken | **Canonical**: fix global search to open the record (same fix as P05) | walk: STORY-002/007 |

### Dead or broken alternate routes (they look like paths but aren't)

These inflate the route counts above. Each one should be **fixed or removed**, never left in place.

| Route | Verdict | Evidence |
|---|---|---|
| Bell `?tab=low-stock` / `?tab=expiry`; Desk "Inventory Control" and Counter "Shelf locations"/"Inventory control" (`?tab=pharmacy-control`) all land on Inventory Today | Fix: use `area=stock&view=list&stock=LOW` etc., as Today already does | code: `header.tsx:207,214,269,277`; `pharmacy/page.tsx:212,222`; `InventoryWorkspace.tsx:112-117` |
| Global search results for patient, staff and appointment | Fix: deep-link to the entity | code: `header.tsx:418,444,463`; shot STORY-007 step-6 |
| Doctor bell `visits?appointmentId=` without `patientId` | Fix | code: `header.tsx:177` |
| Patient detail / tracker "Book appointment" (`?patientId=` cannot complete) | Fix | walk: STORY-004 |
| Counter "Rx queue" (no-op), "Pull visits" (re-read only) | Remove "Rx queue" | code: `pharmacy/page.tsx:410` |
| Appointment tile long-press, "double-click", inline X | Remove or wire | lead / APT-12 |
| Invoices "Edit Invoice" (targets the old builder) and "Delete" | Remove or fix | lead (068) |
| Procedures "View Details", "Load & Edit" | Remove or fix | walk: STORY-411 step 9-10 |
| Prescription "Printer profile" select (always empty) | Remove | lead (051) |

---

## Duplicate Information

"Second occurrence serves a new context?": **Noise** = remove it; **Partly** = keep it smaller, or keep it as a link; **Justified** = keep.

| ID | Fact and surfaces | New context? | Canonical surface / recommendation | Evidence |
|---|---|---|---|---|
| RC-I01 | Appointment details on 7 surfaces; the two patient-page ones contradict each other | Partly (grid, dashboard and bell differ by intent) | The day grid is canonical. The Dashboard and bell list a count plus a link. Patient detail "Next appointment" and tracker "Upcoming appt" use the same query (they currently disagree: "Not scheduled" in `detail-shravya-1440.png`). | shot + lead |
| RC-I02 | Demographics on 4 surfaces of one page (badges, summary card, Info tab), plus the list | Noise | Header badges (name, age/sex, phone) are canonical. The Info tab holds only what the header lacks (address, email, ABHA). Drop the raw DB id badge. | shot: `detail-shravya-1440.png` ("F", "31 yrs" in badges; "Gender: F", "Age: 31 yrs", phone again in Info) |
| RC-I03 | Patient and doctor names 3× on Visits (sub-heading, Ready line, Patient Context); two are wrong | Noise | Patient Context card | shot: `visits/1440x900-shravya-landing-patient-selected.png` ("Patient: Unknown • Doctor: Dr. Praneeta Jain" under a selected Priya Sharma) |
| RC-I04 | Visit progress 4× (header %, bar, Overview, footer) | Noise | Footer "n of 5 sections" next to Complete Visit; remove the other three | walk: STORY-401; VIS-12 |
| RC-I05 | Patient visit history on 4 surfaces | Partly | Patient detail History is canonical; in-visit History is a compact list linking there | lead + walk STORY-401 step 23 |
| RC-I06 | Appointment link badged twice ("From Appointment", "Linked to Appointment") | Noise | Keep the page-title badge with the time | shot: `visits/1440x900-shravya-visit-overview.png` |
| RC-I07 | Current role 3–4× (role card, "Role: DOCTOR", "Captured By") | Noise | Nowhere: the user knows their role. Keep "Captured By" only on saved records, as a name rather than an enum. | shot (role card on the landing; "Role: DOCTOR" in the form header) |
| RC-I08 | Visit photos on 3 surfaces + 2 counts that disagree | Partly | The Photos tab; one count from one source | walk: STORY-401 step 12, STORY-405 |
| RC-I09 | Rx content on ~8 surfaces | Justified (each is a different consumer: doctor, patient, pharmacy) | Keep. All must render from one Rx record and one print renderer (P16/P27). | lead |
| RC-I10 | System alerts on 3 surfaces with different content (Dashboard, bell, Reports strip) | Noise | The bell is canonical for "needs attention"; the Dashboard shows a summary of it; drop the Reports strip | walk: STORY-005, STORY-009 |
| RC-I11 | Low-stock count on 5 surfaces, 3 definitions | Noise (contradictory) | Inventory Today (P34) | shot: Desk "0 low" vs Today "4" |
| RC-I12 | Drug count: Desk "Stock" tile = "Total Drugs" | Noise (mislabelled) | Rename the Desk tile "Drugs", or show stock | lead + shot (Desk "Stock 1") |
| RC-I13 | Packages on 3 surfaces with 3 filters | Partly | The Billing "Treatment Packages" tab; the Desk shows a count plus a link | lead |
| RC-I14 | Sales/revenue on 4–5 surfaces, 4 tables | Noise (they don't reconcile) | One revenue source (F07) | walk: STORY-009 (Reports 500) |
| RC-I15 | User counts differ (Dashboard vs Users table) | Noise | Users table; the Dashboard card is removed for non-admins (H3) | shot: `dashboard/manager-1440-populated-full.png` ("Total Users 11 / Active Users 11") |
| RC-I16 | Role label in 2 spellings (`RECEPTION` vs "Receptionist") | Noise | The display label everywhere | code: `UsersManagement.tsx:461` |
| RC-I17 | Counter stock figure 4× on one screen | Partly | The Review row "Qty"; Pick Assist keeps location and batch only | shot: counter-full ("IN STOCK Qty 30", "Pick 30 · 50 available", "STOCK 50") |
| RC-I18 | Invoice grand total 5× on one screen | Partly | The Summary card plus the sticky footer; drop the badge and the Controls copy | lead (063) |
| RC-I19 | Supplier payables in 6 places, 2 "due soon" definitions | Noise | Payments & dues; one definition | lead (104) |
| RC-I20 | A saved purchase bill in 5 places | Justified (register, supplier, GST are different questions) | Keep; same record, same id | lead |
| RC-I21 | Batch quantities in 3 places | Justified (list, detail, export) | Keep | lead |
| RC-I22 | Approval count twice in one row ("0 … (0)") | Noise | The count column | shot: `inventory/1440x900-today.png` ("0  Price/stock edits awaiting approval (0)") |
| RC-I23 | Procedure name in 3 places; dropped when booked via Slots | Justified as display; the drop is a bug | Keep; fix Slots (P03) | code (Slots payload) |
| RC-I24 | Booking success shown twice (toast + banner) | Noise | The banner, which carries the actions | lead (025) |
| RC-I25 | Duplicate page headings on 5 pages (Patients, Pharmacy Invoices, Counter, Billing, Drug Management) | Noise | One H1 per page | code: `patients/page.tsx:13` + `PatientsManagement.tsx:742,1042`; `pharmacy/drugs/page.tsx:18` + `DrugManagement.tsx:285`; `pharmacy/page.tsx:198` + `:453`. shot: patients, invoices, billing, counter |
| RC-I26 | The same invoice in 2 print formats | Noise | One template (P27) | lead |
| RC-I27 | Patient name + phone in 3 places (dropdown, row, header) | Justified (find → confirm → work) | Keep | walk: STORY-007 |
| RC-I28 | Holiday rows in 3 places with different powers | Partly | Clinic Holidays edits; the others are read-only (P08) | lead |
| N-I1 | Signed-in user's name in the header *and* the sidebar footer | Noise | The sidebar footer (it has role and logout) | shot: every screen (e.g. "Riya Sharma" top-right and bottom-left in `patients/reception-1440-populated.png`). walk: STORY-001 |
| N-I2 | Counter queue counts 3× on one screen: header chips (Queue 2, Review 1, Exceptions 0), Queue-column tiles (Queued 2, Exceptions 0), filter chips | Noise | The filter chips with counts; drop the tiles | shot: counter-full. PH-30 |
| N-I3 | Doubled field labels in the Rx tab: section "Chief Complaints" → field "Chief Complaints"; "Diagnosis" → "Diagnosis" | Noise | Section heading only | shot: `ux-walker/shots/visit-documentation--STORY-401/step-13-prescription-tab.png`. VIS-11 |
| N-I4 | The patient-journey stepper shown both on patient detail and inside the visit header, where it offers "Book" for an already-booked, open visit (a 5th progress indicator) | Noise inside the visit | Patient detail only | shot: `visits/1440x900-shravya-visit-overview.png` (6-icon stepper + "Book" under "From Appointment") |
| N-I5 | Rx "save" in 3 places (Create Prescription, Save Draft, preview Save Prescription); "Close" 3× in the print preview | Partly | Footer Save Draft / Create Prescription; preview gets Print + Close once | walk: prescriptions STORY-001 flow log |
| N-I6 | Photo actions duplicated: header Upload/Camera vs body Choose Files/Take Photo; delete in 3 places; 2 navigators | Noise | Body controls next to the photo grid | walk: STORY-401 step 9, STORY-405 |
| N-I7 | Dashboard "System Status: operational" stat card *and* a "System Status – All systems operational" row (with a LOW badge) in System Alerts | Noise (and false in the error state, D01) | Neither: show status only when something is wrong | shot: `dashboard/manager-1440-populated-full.png` |
| N-I8 | Users page: 3 headings for one table | Noise | One H1 (extends RC-I25 to 6 pages) | walk: STORY-002 flow log |
| N-I9 | Appointments patient search shows the selected name twice, and the doctor's name sits in both the page selector and the card | Partly | The search field chip | APT-10 (walk) |

Tally (one verdict per row): **Noise 23**: I02, I03, I04, I06, I07, I10, I11, I12, I14, I15, I16, I19, I22, I24, I25, I26, N-I1, N-I2, N-I3, N-I4, N-I6, N-I7, N-I8. **Partly 9**: I01, I05, I08, I13, I17, I18, I28, N-I5, N-I9. **Justified 5**: I09, I20, I21, I23, I27.

---

## Overlapping Features

| ID | Overlap | Verdict | Recommendation | Evidence |
|---|---|---|---|---|
| RC-F01 | **Calendar tab vs Slots tab**: both render `DoctorDayCalendar` and the same booking dialog. Slots drops the procedure name, resets the doctor (APT-02), and its start pre-creates a placeholder visit. | Merge | **One "Schedule" view**: Calendar plus a Duration control. Delete the Slots tab. | code: `appointments/page.tsx:124-142`; `AppointmentScheduler.tsx:20,773`; `AppointmentsCalendar.tsx:14,689`. shot: `appointments/1440x900-shravya-calendar-populated.png` vs `…-slots-populated.png` (same filters and grid, different card titles "Doctor Calendar" / "Appointment Scheduler") |
| RC-F02 | **Selling: Pharmacy Billing builder vs Counter cockpit vs Inventory "Counter sales"**. Two back-ends; COUNTER_SALE never becomes a PharmacyInvoice. | Merge | One sale model (PharmacyInvoice). The cockpit stays the review/pick/dispense workstation that hands off to the builder; retire "Counter sales" or route it through PharmacyInvoice. | code: `inventory-workflow.service.ts:1444`; `pharmacy/page.tsx:406-470` |
| RC-F03 | **"What needs attention"**: Pharmacy Desk metrics vs Dashboard System Alerts vs Inventory Today vs the bell | Canonical | Inventory Today for stock/purchase work (its rows already deep-link correctly); the bell mirrors Today's non-zero rows; the Desk and Dashboard show counts that link into it | shot: Desk vs Today. code: bell `?tab=` dead links |
| RC-F04 | **Procedures page vs visit-form procedure section** | Canonical/remove one | The visit form is canonical; the page becomes a read-only history or is removed until it can save | walk: STORY-411 |
| RC-F05 | **Lab Tests tab vs Prescription investigations** | Merge | One investigations model shown in both | walk: STORY-401 |
| RC-F06 | **Two stock-correction approval tracks** + AI and metadata bypasses | Merge | One approval policy that every writer goes through | lead (086/090/082/095) |
| RC-F07 | **Money in four places** (Reports legacy table, Invoices totals, Desk Sales, Compliance) | Canonical | One revenue service; Reports reads PharmacyInvoice. Reports Revenue currently returns 500. | walk: STORY-009 |
| RC-F08 | **Header "My Settings" vs Users per-doctor dialogs** (availability, WhatsApp) | Merge | One doctor-settings page that admins open on the doctor's behalf (availability is already a shared component, see P07) | code: shared `DoctorAvailabilitySettings` |
| RC-F09 | **Users "Edit" role vs "Role & Permissions"** | Merge | One role + permissions editor with an explicit "reset permissions to role defaults" option | code + walk STORY-011 |
| RC-F10 | **QuickGuides vs intro.js tours vs Shortcuts** | Merge | One help pattern per page; delete the stale tours | code: duplicate "Visit Documentation Guide" |
| RC-F11 | **Drug Management (drug master) vs Inventory stock list (items)**. Two catalogs; billing search uses the drug master, so stocked items aren't findable when it's empty (PH-01). | Differentiate (or merge) | Make the relationship explicit: Inventory items are *batches of* drug-master products. Put Drug Management inside Inventory (also solves P31). | walk: PH-01; shot `STORY-703/a02-drugs-admin.png` ("Drug Database: manage your pharmacy's drug **inventory**") |
| RC-F12 | **Pharmacy AI assistant vs direct screens**: every AI write duplicates a screen action without its validation | Differentiate | Keep the AI, but every write goes through the same endpoints and approval rules (proposal → the same review as the screen) | lead (082) |
| RC-F13 | **Rx share via browser vs server**: the backend `sharePrescription` is unused | Canonical/remove one | Keep one (server-side is auditable) | lead (053/054) |
| RC-F14 | **Three WhatsApp senders** (patient reminder, booking confirmation, template Send Test) sharing one silent-failure path | Differentiate | They are different messages, so they are legitimately separate. Share one send service with visible success/failure; add a reminder action on the appointment itself. | lead (019/115/116) |
| RC-F15 | **`/test-transcribe` vs in-form dictation** | Canonical/remove one | Remove the bench from the nav (H4) | code: `sidebar.tsx:128-133` |
| RC-F16 | **Visits "Patient History" vs patient detail page**: two chart hubs with different actions (print only on Visits) | Canonical/remove one | Patient detail is the chart; the Visits setup's history tab goes away (with the H8 worklist) | shot: Visits landing "Patient History" tab; patient detail History tab |
| RC-F17 | **Orphaned parallel implementations** (BillingManagement, PharmacyInvoiceBuilder non-Fixed, PharmacyInventoryControl / ShelfIntelligence, StockPredictionDashboard, PharmacyPackageManager) | Canonical/remove one | Delete the orphans; fix the links that still target them (tracker → clinic billing, "Edit Invoice" → old builder, `?tab=` links) | code: redirects in `billing/page.tsx`, `stock-predictions/page.tsx`; discovery #8 |
| RC-F18 | **Partner Daily Sync vs inventory corrections**: partner mismatches can be fixed only in the partner card | Merge | Partner fixes post through the same correction document | lead (081) |

Tally: **Merge 8**: F01, F02, F05, F06, F08, F09, F10, F18. **Canonical/remove one 7**: F03, F04, F07, F13, F15, F16, F17. **Differentiate 3**: F11, F12, F14.

No new overlapping features were found beyond the catalog's 18. I checked the candidates (Rooms calendar vs the Appointments room filter, Desk packages vs Billing packages, Inventory "GST & monthly reports" vs Reports) and they are covered by P09, I13 and F07.

---

## Hierarchy & IA

### Navigation as built

Source: `frontend/src/components/layout/sidebar.tsx:42-134`. Sections are Overview · Clinical · Pharmacy · Admin. The live role matrix is in `docs/ux-walker/stories/auth-shell-navigation--STORY-005/walk-report.md`.

| Role | Sidebar | What the role does most | Mismatch |
|---|---|---|---|
| RECEPTION | Dashboard, Patients, Appointments, Rooms, Pharmacy Desk, Counter, Billing, Inventory | Check in, book, register, take payment | 4 of 8 items are pharmacy, and Desk/Counter/Billing return **403** for this role (walk STORY-005). No Visits link, yet "Start Visit" is on every patient row. |
| DOCTOR | Dashboard, Patients, Appointments, Visits, Procedures, Rooms, Inventory, Test Transcribe | Today's patients → visit → Rx | The day sheet is below the fold on Dashboard (D03); Test Transcribe and Inventory sit at the same level as Visits; no Pharmacy link, yet the patient tracker shows "Bill" (shot `detail-shravya-1440.png`); the bell footer says "View reports & alerts", but Reports isn't in the doctor's nav (shot `STORY-005/bell-shravya.png`) |
| PHARMACIST | Dashboard, Desk, Counter, Billing, Inventory | Rx queue → pick → bill | The generic Dashboard is the landing page instead of the Counter; Drug Management is only reachable through a Desk button; Desk/Billing 403 under seeded RBAC (PH-03) |
| NURSE | Dashboard, Patients, Appointments, Visits, Rooms | Vitals, photos | Rooms shows 403-empty; the Cancel button 403s |
| MANAGER | Dashboard, Patients, Appointments, Visits, Procedures, Rooms, Inventory, Reports, Users | Approvals, reports | Appointments 403s ("Failed to load schedule"); Users is read-only in practice; Reports 500s |
| OWNER | All except the 3 Pharmacy links | Oversight | Can't reach the pharmacy from the nav |
| ACCOUNTANT | Dashboard only | Supplier payments, GST | Payables (Inventory → Purchases → Payments & dues) are unreachable |
| LAB_TECH | (empty) | Labs | Nothing |

### Findings

| ID | Finding | Recommendation | Evidence |
|---|---|---|---|
| H1 | **Three sidebar items point at one page** (`/dashboard/pharmacy?section=desk|counter|billing`), and a fourth surface (Invoices) highlights "Pharmacy Billing" in the nav. The Desk mixes four unrelated jobs: KPIs, AI, Partner Daily Sync and Packages (PH-17). | Use **one "Pharmacy" nav item** that lands on the Counter (the queue-to-bill workstation), with in-page tabs Counter · Billing · Invoices. Move the Desk content to where it is used: KPIs to the bell/Today; Partner Sync to its own tab; Packages into the Billing catalog; AI as a global dock. | code: `sidebar.tsx:88-109`, `getActivePharmacySection` (`:165-196`, invoices → "billing"). shot: `pharmacy/1440x900-desk.png` |
| H2 | **Nav is not derived from API permissions.** Links lead to 403/empty pages, and needed pages have no link (walk STORY-005 matrix). | Build the sidebar from the same permission source the API enforces. Hide what 403s; add what's allowed (ACCOUNTANT → Payments & dues). | walk: STORY-005; code: hard-coded `allowedRoles` arrays |
| H3 | **Home doesn't match the role's first task.** Admin telemetry (Total Users, Branches, System Status) leads for everyone; the doctor's day is below the fold; there is a fake "All systems operational" row. | Give each role its own landing: reception → today's appointments + check-in; doctor → today's queue; pharmacist → Counter; admin/owner → alerts + backups | shot: `dashboard/manager-1440-populated-full.png`; D02/D03 (walk) |
| H4 | **A dev/diagnostic bench is in the production nav** ("Test Transcribe", Admin section, for OWNER/ADMIN/DOCTOR). It sits outside the app shell and the middleware. | Remove it from the nav; gate it behind a dev flag | code: `sidebar.tsx:128-133`; shot: doctor sidebar |
| H5 | **Procedures is top-level** for 4 roles, but its Save always fails, its Analytics tab is "coming soon", and procedures are already captured in the visit form | Hide it until fixed, or fold it into the visit (F04) | walk: STORY-411 |
| H6 | **Important things buried; rare things on top.** Drug Management: Desk button only (no route for DOCTOR/OWNER). WhatsApp template editor: depth 4. Invoices: Desk button, or the 4th sub-tab of Inventory → Sales. Meanwhile the cosmetic "Branded" switch sits in the global header of every screen. | Promote: Drugs into Inventory, Invoices into the Pharmacy tabs, Messaging into settings. Demote: Branded → My Settings. | see the depth map below |
| H7 | **The Inventory workspace has a deliberate single entry** (`@cc single-inventory-entry`) with 5 areas and 32 views. Purchases alone has 11 sub-views, mixing daily work (Scan bill) with monthly work (GST & monthly reports, Purchase costs). | Credit: **keep** the single entry. Inside Purchases, group the views into "Daily" (intake, saved bills, payments) and "Reports" (GST, costs) to cut the 11-way choice. | code: `InventoryWorkspace.tsx:44-84` |
| H8 | **The "Visits" nav lands on a setup form**, not a worklist. It leads with a "Your Role & Permissions" card and an "Available Features" marketing grid, and its doctor picker is `limit:1`. | Make Visits a worklist (waiting / in progress / to complete today) with "Start" per row. The setup form becomes the rare manual path. | shot: `visits/1440x900-shravya-landing-patient-selected.png`; code `visits/page.tsx:520-521` |
| H9 | **Two patient-chart hubs** (patient detail, and the Visits setup's Patient History tab) with different actions | Patient detail is the chart (F16) | shot: both |
| H10 | **Header weight**: the Branded switch, a persistent "Start Tour" for reception, plus search, bell and settings. At 768px, "Start Tour" wraps to 3–4 lines and search shrinks to 56px (D09/APT-16). | Move Branded and Start Tour into the settings/help menus | shot: `patients/reception-1440-populated.png` |
| H11 | **Help is at the top level of every page** (a QuickGuide button in each header) on top of the tours and Shortcuts, and several guides describe UI that doesn't exist | One "?" help entry in the header (RC-P57/F10) | code + PH-20 |
| H12 | **Legacy redirect routes** (`/billing`, `/prescriptions`, `/stock-predictions`, `/inventory-updates`) | Credit: correct pattern for old bookmarks. Keep them. One fix: `/dashboard/billing` lands with no nav item highlighted (walk STORY-002). | code: the four `redirect()` pages |

### Click depth to common destinations (from the sidebar)

Derived from the sidebar code plus catalog routes. Depth counts clicks after the dashboard loads.

| Destination | Frequency | Depth now | Verdict |
|---|---|---|---|
| Today's appointments (doctor) | Many times daily | 1 (Appointments) or a Dashboard scroll | OK; Dashboard should show it first (H3) |
| Start visit from an appointment | Many times daily | 2, but hover-only tile buttons (APT-12) | Depth OK; discoverability poor |
| Bill a prescription | Many times daily | 2 (Billing → Load), or the Counter's 4 bill buttons | OK |
| Invoice list / record a payment | Daily | 2–3 (Desk → Invoices → Mark as Paid), or Inventory → Sales → Patient invoice history | Too buried for a daily money task (H1/H6) |
| Approve price/stock edits | Daily (doctor/owner) | 2 (Inventory → Today row) | OK (credit) |
| Drug Management | Weekly | 2 for ADMIN/PHARMACIST; **URL only** for DOCTOR/OWNER | Needs a home (P31) |
| Supplier payments | Weekly | 3 (Inventory → Purchases → Payments & dues); **unreachable** for ACCOUNTANT | Role gap (H2) |
| Clinic holidays | Rare | 2 (Users → Clinic Holidays) | OK |
| WhatsApp templates | Rare | 4 (Users → doctor row → WhatsApp Settings → Manage); unreachable for doctors | Too deep (P55) |
| Test Transcribe | Never in production | 1 | Too shallow (H4) |
| Branded switch | Rare | 0 (in every header) | Too shallow (H6/H10) |

### One concept, one name

| Concept | Names in use | Proposed single name | Evidence |
|---|---|---|---|
| Patient list | "Patients" (nav) · "Patients Management" (H1) · "Patients" (H2) · "Patient Records" (card) · "Patients Management Guide" | **Patients** | code: `patients/page.tsx:13,33`, `PatientsManagement.tsx:742,1042`. shot |
| Create a patient | "New Patient" · "Create Patient" · "Add New Patient" · "Add Patient" | **New patient** | P25 (walk); discovery |
| Start a visit | "Start Visit" · "Start new visit" · "Start New Visit" · "Start Visit Documentation" · "START" | **Start visit** | code: tracker, patient detail, Visits page |
| Reopen a visit | "Resume last visit" · "Continue" · "Continue Visit" · "CONT" · "Resume session" · "View" · "Prescribe" | **Open visit** | code: `PatientProgressTracker.tsx:179,200`; `PatientHistoryVisitCard.tsx:236` |
| Visits area | "Visits" (nav) · "Visit Documentation" (H1) · two different guides with one title | **Visits** | code: `visits/page.tsx:751,1093` |
| Booking views | "Calendar" tab → "Doctor Calendar"; "Slots" tab → "Appointment Scheduler"; Rooms "Calendar View" → "Room Calendar & Occupancy" | **Schedule** (after the F01 merge) / **Room schedule** | shot: calendar vs slots |
| Pharmacy hub | "Pharmacy Desk" (nav) · "Command center" (chip) · "Pharmacy Management Guide"; the Desk has no visible H1 (PH-04) | **Pharmacy** (H1) | shot: `pharmacy/1440x900-desk.png` |
| "Counter" | "Pharmacy Counter" (Rx dispensing workstation) **and** Inventory → Sales → "Counter sales" (a different, workflow-document sale) | Keep "Counter" for the workstation; rename the Inventory one or retire it (F02) | code: `sidebar.tsx:96`, `InventoryWorkspace.tsx:71` |
| Rx queue | "Queue" · "Prescription Queue" · "Prescription dispensing queue" · "Rx queue" (no-op button) | **Prescription queue** | code: `pharmacy/page.tsx:417`; shot billing |
| Invoice list | "Pharmacy Invoices" · "Patient invoice history" · "Invoices" (Desk) · tracker "Invoices"/"Bill" (reads clinic billing) | **Invoices** | code: P25 refs |
| Bill vs invoice | Pharmacy side: "Bill", "Open bill", "Confirm Invoice", "Pharmacy Billing". Supplier side: "Scan or enter bill", "Saved bills", "Purchase invoices to review" | Patients get an **invoice**; suppliers send a **bill**. Use each consistently. | shot: Today rows, Counter buttons |
| Drug catalog | "Drug Management" (H2) · "Drug Database" (H1) · "Drugs" (button) · "drug master" (error copy) · "Inventory Item" / "product"; the Desk "Stock" tile counts drugs | **Products** (catalog) vs **Stock** (batches) | shot: `STORY-703/a02-drugs-admin.png`; PH-01 |
| Inventory | "Inventory" (nav) · "Inventory Control" (Desk card, dead link) · "Inventory control" / "Shelf locations" (Counter) | **Inventory** | code: `pharmacy/page.tsx:212,222` |
| Approval queue | "Approve corrections" · "Price/stock edits awaiting approval" · "Price / stock approval queue" · `/inventory-updates` · "Open approval queue" | **Price & stock approvals** | code: `InventoryWorkspace.tsx:60`; shot Today |
| Roles | `RECEPTION` vs "Receptionist"; "Captured By: DOCTOR"; "Therapist" in copy but not a role | Display labels everywhere; drop "Therapist" | code: `UsersManagement.tsx:461` |

15 concepts with naming drift.

---

## Top consolidation recommendations (ranked by journeys improved × wrong outcomes prevented)

1. **One visit-start contract** (P01, P02, F01's start handler). Every Start/Continue goes through one helper that is appointment-aware, uses the signed-in doctor, and never creates a placeholder visit. Cut the four reopen buttons on patient detail to one.
2. **One sale model and one pharmacy workstation** (P21, P23, P25, F02, H1). The builder plus PharmacyInvoice is canonical. Retire or re-route Inventory "Counter sales". Delete the duplicate queue table. Collapse Desk/Counter/Billing into one "Pharmacy" nav item with one Invoices list.
3. **Merge Calendar and Slots into one schedule** (F01, P03). One grid with a duration control. Fix the `?patientId` prefill so "Book appointment" from the chart works in 4 steps instead of 9.
4. **One definition per "needs attention" metric** (P34, P35, F03, I10, I11, N-I7, H3). Inventory Today owns low stock and expiry. The bell and Desk read and deep-link to it (fix the `?tab=` links). Remove the fake "All systems operational". Give each role its own home.
5. **One editor per admin concept** (P08, P53, P54, F08, F09). One doctor-settings page (availability, holidays read-only, WhatsApp) for both self-service and admin-on-behalf, and one role/permissions editor. This removes the two dangerous divergences: a confirm-less holiday delete that hits every doctor, and "Apply Role" silently overwriting permissions.

## Already clean (credit, so re-runs skip these)

- Inventory as the single stock entry point, with Today rows that deep-link with URL-persisted filters (H7; INV "Excellent as is").
- Redirect-only legacy routes (H12).
- Accelerator duplicates that give the same result: approval-queue links (P36), row vs detail "Edit stock" (P37), branded switch on login + header (P59), reset-code link vs URL (P56), AI thread archive ×2 (P33).
- Doctor availability is already one shared component used by both the self and admin entries (P07).
- Rx content across ~8 surfaces (I09) and patient name/phone in search → row → header (I27) are justified repeats, because each serves a different reader or step.
