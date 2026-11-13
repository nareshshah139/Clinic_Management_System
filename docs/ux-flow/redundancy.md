# Redundancy and Information Architecture — ClinicMS

Cross-screen critique. Journey critics judge one flow at a time; this pass looks at what is built twice, said
twice or named twice across the whole app, and whether the navigation matches what each role does all day.

**How this was done.** The lead list in `docs/ux-paths/catalog.md` (`## Redundancy Candidates`, about 200 items
built from code reading) was triaged, and the most consequential leads were checked in the running app at
1440×900 on 13 Nov 2026 as admin, doctor, receptionist, nurse, pharmacist and accountant. Browsing was read-only.
Screenshots are in [`redundancy-screens/`](redundancy-screens/) (35 files). Where a journey critic had already
measured something live, their screenshot is cited instead of repeating the walk.

**Evidence labels**

- **confirmed live** — seen in the running app by this pass (screenshot or page read-out named).
- **confirmed live (J-n)** — measured live by a journey critic; their file is cited.
- **from code only** — carried from the catalog or read in source; not seen in a browser.

**Verdict labels** — *deliberate*: a shortcut to, or a different context for, one implementation. *drift*: the
same thing built, listed or named twice with no reason a user would recognise.

**Two limits.** There is no OWNER or MANAGER login in the demo data, so everything about those two roles is from
code only. Nine other critics were writing to the same database during the walk; any two figures compared below
were captured within a few minutes of each other and reconcile arithmetically, and the one mismatch that was
caused by a colleague's edit is listed under Leads Refuted.

| Section | Findings | Confirmed live | From code only |
|---|---|---|---|
| Duplicate Paths | 16 | 15 | 1 |
| Duplicate Information | 11 | 11 | 0 |
| Overlapping Features | 13 | 9 | 4 |
| Hierarchy & IA | 9 | 8 | 1 |

---

## Duplicate Paths

Ordered by how central the journey is: front desk, consultation, pharmacy counter, then stock and settings.

### P1. Opening a patient from the header search ends on "No patients found"

- **Leads**: DP-01, DP-06, discovery D.
- **Evidence**: [header-search-results.jpg](redundancy-screens/header-search-results.jpg) → click "Kavya Jfour" →
  [header-search-patient-lands.jpg](redundancy-screens/header-search-patient-lands.jpg). The app opens
  `/dashboard/patients?search=cmwepx0a3000d7d00ipasvggl`, puts that internal ID in the Patients search box and shows
  "No patients found". Clicking an Appointment result opens the plain Appointments page with no date, doctor or
  booking selected.
- **Status**: confirmed live.
- **Verdict**: drift. The search box is on every screen and is the fastest-looking route to a patient, and it
  ends in an empty list. The Patients page's own search followed by `View` does reach the record (confirmed live).
- **Recommendation**: patient result → `/dashboard/patients/<id>`; appointment result →
  `/dashboard/appointments?date=…&doctorId=…` with the booking opened. Keep the header search as the canonical
  "find anything" route. **S** (`components/layout/header.tsx`).

### P2. Four ways to book an appointment, two of them the same screen

- **Leads**: DP-03, DP-05, DP-07, OF-02.
- **Evidence**: [appointments-calendar-tab.jpg](redundancy-screens/appointments-calendar-tab.jpg) and
  [appointments-slots-tab.jpg](redundancy-screens/appointments-slots-tab.jpg) list the same tiles, the same `Book
  hh:mm` buttons and the same INFO / RESCHED / START controls (page read-out identical apart from the Legend).
  The record's `Book appointment` is in [patient-detail.jpg](redundancy-screens/patient-detail.jpg). The fourth
  route, a walk-in booked silently by "Create Patient", is in
  [J1 12-create-patient-walkin.jpg](journeys/J1-front-desk-screens/12-create-patient-walkin.jpg).
- **Status**: confirmed live (tabs, record button); confirmed live (J1) for the walk-in route.
- **Verdict**: Calendar and Slots are drift (see F5). `Book appointment` on the record is a deliberate shortcut.
  The walk-in auto-booking is a parallel implementation that picks the slot itself.
- **Recommendation**: Calendar tab is canonical. Remove Slots. Keep the record shortcut. Make the walk-in route
  open the same booking dialog with the first free slot pre-selected instead of booking unseen. **M**.

### P3. Two "new patient" dialogs with different fields

- **Leads**: DP-02, ND-49.
- **Evidence**: [J1 04-add-new-patient.jpg](journeys/J1-front-desk-screens/04-add-new-patient.jpg) ("Add New
  Patient", short form, opened from Appointments) and
  [J1 12-create-patient-walkin.jpg](journeys/J1-front-desk-screens/12-create-patient-walkin.jpg) ("Create
  Patient", long form, opened from Patients `New Patient`).
- **Status**: confirmed live (J1).
- **Verdict**: drift. Same record, two components, two titles, two sets of required fields.
- **Recommendation**: one dialog titled "New patient": the short field set first, the rest under "More details".
  Use it from both pages. **M** (`PatientsManagement.tsx`, `PatientQuickCreateDialog.tsx`).

### P4. Buttons and URLs that say "bill" for a consultation but open a pharmacy bill

- **Leads**: DP-08, OF-01, ND-02, ND-26.
- **Evidence**: on [patient-detail.jpg](redundancy-screens/patient-detail.jpg) the tracker step is "Billing" and
  its button `Bill` links to `/dashboard/pharmacy/sales/bill?patientId=…&visitId=…` (link read from the page).
  `/dashboard/billing` and `/dashboard/pharmacy?section=billing` both land on the pharmacy bill page
  ([sales-bill-new.jpg](redundancy-screens/sales-bill-new.jpg) is what they show).
- **Status**: confirmed live. That the step's green tick is computed from clinic invoices is from code only.
- **Verdict**: drift. The clinic has two kinds of bill that share one word. The only route to a consultation bill
  is the appointment row; every other "bill" control leads to the pharmacy.
- **Recommendation**: tracker `Bill` opens the consultation bill for the patient's latest appointment; add a
  separate `Pharmacy bill` button next to "Prescribe". Point `/dashboard/billing` at Appointments. Adopt the two
  names in the naming table below. **S–M**.

### P5. Eight controls start or resume a visit; two on the same card are the same link

- **Leads**: DP-11, ND-12.
- **Evidence**: [patient-detail.jpg](redundancy-screens/patient-detail.jpg) shows `Resume last visit`, `Start new
  visit`, tracker `Continue` and tracker `View` together; `Continue` and `View` have the same address
  (`/dashboard/visits?patientId=…&visitId=…`, read from the page). The Patients list adds `Start Visit` on every
  row. All of these are shown to the receptionist, who has no Visits menu entry. The appointment tile adds START /
  CONT. A visit started from the record opened under the wrong doctor in
  [J3 13-new-visit-from-record-wrong-doctor.jpg](journeys/J3-doctor-visit-screens/13-new-visit-from-record-wrong-doctor.jpg).
- **Status**: confirmed live; the wrong-doctor result is confirmed live (J3).
- **Verdict**: the appointment tile is the canonical route and the only one that links visit and booking. The
  record-level buttons are drift: four controls, two outcomes, and one of the outcomes is wrong.
- **Recommendation**: on the record keep one button that reads `Resume visit` when a draft exists and `Start
  visit` otherwise; drop tracker `Continue` / `View`. Hide visit buttons from roles that cannot open a visit.
  Use two verbs only (see naming). **S**.

### P6. One prescription, five buttons that open its bill

- **Leads**: DP-22, DP-24, DP-25, DP-35.
- **Evidence**: [pharmacy-counter.jpg](redundancy-screens/pharmacy-counter.jpg) shows header `Bill`, `Open bill`
  and `Collect payment` at once; [pharmacy-counter-queue-below.jpg](redundancy-screens/pharmacy-counter-queue-below.jpg)
  shows `Bill` on each table row; [sales-bill-new.jpg](redundancy-screens/sales-bill-new.jpg) shows `Load` on the
  same rows on the bill page. The three cockpit buttons call one handler, `openActiveBilling`
  (`components/pharmacy/PharmacyCounterCockpit.tsx:405, 595, 617–644`). The same page has three refresh controls
  (cockpit `Refresh`, "Refresh prescription queue", a refresh icon per row).
- **Status**: labels confirmed live; the shared handler is from code.
- **Verdict**: the row-level `Bill` is the deliberate route. The three cockpit labels are drift, and `Collect
  payment` is misleading because it collects nothing.
- **Recommendation**: one `Bill` per prescription. Remove header `Bill` and `Collect payment`. One refresh. **S**.

### P7. Three pharmacy links to Inventory that all land on Inventory › Today

- **Leads**: DP-37, DP-63, ND-34, discovery D.
- **Evidence**: Desk tile "Inventory Control — Shelves, invoice scanning, expiry" opens
  `/dashboard/inventory?tab=pharmacy-control`; the cockpit's `Shelf locations` opens
  `…?tab=pharmacy-control&section=shelf`. Both show [desk-inventory-control-lands.jpg](redundancy-screens/desk-inventory-control-lands.jpg),
  which is Today. The bell's addresses `?tab=low-stock` and `?tab=expiry` (`components/layout/header.tsx:213–283`)
  were opened directly and also show Today.
- **Status**: confirmed live. The bell itself had no items in this data, so its links were tested by address.
- **Verdict**: drift. The `tab` parameter belongs to a screen that no longer exists.
- **Recommendation**: map each link to the real filtered view (low stock → Stock list with "Low stock"; expiry →
  "Within 3 months"; shelf → "Missing location"), or remove `Shelf locations`. **S**.

### P8. `Daily close` opens the Pharmacy Desk

- **Leads**: DP-36, ND-30.
- **Evidence**: clicking `Daily close` in [pharmacy-counter.jpg](redundancy-screens/pharmacy-counter.jpg) opened
  `/dashboard/pharmacy?section=desk` ([pharmacy-desk.jpg](redundancy-screens/pharmacy-desk.jpg)). The drawer count
  a pharmacist would expect is in Daily Collection ([daily-collection.jpg](redundancy-screens/daily-collection.jpg)).
- **Status**: confirmed live.
- **Verdict**: drift (a label left over from an older Desk).
- **Recommendation**: point `Daily close` at Daily Collection, or remove it. **S**.

### P9. A due pharmacy bill is shown in Sales but can only be collected on a list with no menu entry

- **Leads**: DP-29, DP-31, DP-32, discovery A.11.
- **Evidence**: [bills-1-sales-register.jpg](redundancy-screens/bills-1-sales-register.jpg) shows "Due ₹66.08" on
  PHI-2026-003 with only discount, print and WhatsApp icons. `Mark as Paid` for the same bill exists only on
  "Pharmacy Invoices" ([bills-2-pharmacy-invoices.jpg](redundancy-screens/bills-2-pharmacy-invoices.jpg), read-out),
  which is reached from Desk › `Invoices`. The finished bill view has no collect action
  ([J6 12-due-bill-dead-end.jpg](journeys/J6-pharmacy-walkin-sale-screens/12-due-bill-dead-end.jpg)).
- **Status**: confirmed live (both lists); the finished view is confirmed live (J6).
- **Verdict**: drift. Actions on one bill are split across two lists so that neither is complete.
- **Recommendation**: add `Collect payment` to the due chip in the register and to the finished bill. Then retire
  the second list (F3). **M**.

### P10. `New purchase` and `Scan or enter bill` are two labels for one destination on one screen

- **Leads**: DP-40, ND-36.
- **Evidence**: [inventory-area-purchases.jpg](redundancy-screens/inventory-area-purchases.jpg) shows the task
  `Scan or enter bill` and the button `New purchase` on the same screen; [inventory-today.jpg](redundancy-screens/inventory-today.jpg)
  shows a third `Scan or enter bill`. J7 confirms the destination is the same and is headed "Scan or enter bill".
- **Status**: confirmed live (labels); same destination confirmed live (J7).
- **Verdict**: the Today button is a deliberate shortcut. The label pair is drift.
- **Recommendation**: keep the button, call it `Scan or enter bill` everywhere, and drop the task-strip entry that
  repeats it. **S**.

### P11. Each alert list on Inventory › Today has a row and a button that do the same thing

- **Leads**: DP-63.
- **Evidence**: page read-out of [inventory-today.jpg](redundancy-screens/inventory-today.jpg): rows "8 Low stock",
  "0 Expiring in the next 3 months", "0 Overdue supplier bills", followed by buttons `Check low stock`, `Check next
  3 months' expiry`, `Check overdue supplier balances`.
- **Status**: confirmed live.
- **Verdict**: drift.
- **Recommendation**: remove the three buttons; the rows already open the lists. **S**.

### P12. One approval queue, four names, and a count printed twice

- **Leads**: DP-60, DI-24, ND-42.
- **Evidence**: `/dashboard/inventory-updates` opens [redirect-inventory-updates.jpg](redundancy-screens/redirect-inventory-updates.jpg):
  task `Approve corrections`, heading "Price / stock approval queue", inner tabs `Price / stock` and `New items`.
  Today lists the same queue as "0 Price/stock edits awaiting approval (0)" ([inventory-today.jpg](redundancy-screens/inventory-today.jpg)).
  A separate task called `Corrections` is something else.
- **Status**: confirmed live. Whether the three counters disagree could not be judged because all were zero.
- **Verdict**: routes are deliberate shortcuts; the names are drift.
- **Recommendation**: call the task, the page and the Today row "Approvals"; show the count once. **S**.

### P13. Two ways to pay a supplier

- **Leads**: DP-50, DP-51, OF-17, ND-39.
- **Evidence**: `Mark paid` on each row in [inventory-area-purchases.jpg](redundancy-screens/inventory-area-purchases.jpg)
  (amounts in "₹"); `Payments & dues` opens "Purchase Ledger" in
  [task-payments-and-dues.jpg](redundancy-screens/task-payments-and-dues.jpg) (amounts in "Rs").
- **Status**: confirmed live. The capability difference (full single bill versus part and multi-bill) is from code
  and J7.
- **Verdict**: deliberate. A one-click settle and a bulk allocation are different jobs.
- **Recommendation**: keep both. Use one currency symbol and one date control, and link the row's `Mark paid`
  dialog to "Pay part or several bills". **S**.

### P14. Daily Collection is in the sidebar and inside Pharmacy Report

- **Leads**: DP-68.
- **Evidence**: sidebar item in [sidebar-admin.jpg](redundancy-screens/sidebar-admin.jpg); card and menu entry in
  [pharmacy-report-home.jpg](redundancy-screens/pharmacy-report-home.jpg); same page either way
  ([daily-collection.jpg](redundancy-screens/daily-collection.jpg)).
- **Status**: confirmed live.
- **Verdict**: deliberate shortcut to one implementation. The problem is where the report lives, not how many
  links reach it (H6).
- **Recommendation**: keep both.

### P15. Five help mechanisms

- **Leads**: DP-77, OF-26, ND-51.
- **Evidence**: header `Start Tour` appears for the receptionist only ([sidebar-reception.jpg](redundancy-screens/sidebar-reception.jpg));
  page-header `Quick Guide` on most pages; a second `Quick Guide` button inside the Appointments filter card
  ([appointments-calendar-tab.jpg](redundancy-screens/appointments-calendar-tab.jpg)); `Visit Workflow Tour` and
  `Shortcuts` in the visit header ([J3 03-visit-form-on-arrival.jpg](journeys/J3-doctor-visit-screens/03-visit-form-on-arrival.jpg)).
- **Status**: confirmed live. That several guides describe controls that do not exist is from code only.
- **Verdict**: drift.
- **Recommendation**: one help button in the header that opens the guide for the current page; delete guide text
  that describes missing features. **M**.

### P16. A doctor's hours and WhatsApp settings can be edited in two places

- **Leads**: DP-74, DP-75, OF-22.
- **Evidence**: catalog STORY-006, 029, 113. Seen live only that the same "My Settings" dialog is empty, with a
  `Save` button, for an admin ([my-settings-admin.jpg](redundancy-screens/my-settings-admin.jpg)).
- **Status**: from code only (the empty dialog is confirmed live).
- **Verdict**: availability is deliberate (self-service and admin use one component). WhatsApp is drift (two
  different field sets).
- **Recommendation**: keep both entry points on one component each; hide the gear for roles with nothing to set.
  **S–M**.

### Not re-walked here

These leads sit inside one journey and are judged by that journey's critic: DP-12 to DP-21 and DP-23 (visit and
prescription: J3, J4), DP-26 to DP-28 (cockpit substitution and linking: J5), DP-39 to DP-52 (purchases: J7),
DP-53 to DP-67 (stock and reorder: J8), DP-70 to DP-73, DP-76 and DP-79 (reports and users: J9). DP-10 and DP-78
were not checked.

---

## Duplicate Information

### I1. The prescription queue is rendered three times, and the counts disagree

- **Leads**: DI-17, DI-19, ND-30, discovery A.8.
- **Evidence**: cockpit "Queue" column and, directly beneath it, a card titled "Prescription Queue" containing a
  table titled "Prescription dispensing queue" ([pharmacy-counter.jpg](redundancy-screens/pharmacy-counter.jpg),
  [pharmacy-counter-queue-below.jpg](redundancy-screens/pharmacy-counter-queue-below.jpg)). The same table fills
  the whole first screen of every new bill ([sales-bill-new.jpg](redundancy-screens/sales-bill-new.jpg)); the
  "New bill" form is below the fold and comes into view after scrolling about 780 px
  ([sales-bill-new-form-below.jpg](redundancy-screens/sales-bill-new-form-below.jpg)).
  On one screen the cockpit says "Queue 6", "6 today or open" and "Queued 3" while the table says "1-2 of 2
  prescriptions".
- **Status**: confirmed live.
- **Second occurrence**: noise in both cases. A pharmacist who pressed `New sale` for a walk-in has to scroll past
  other patients' prescriptions to reach the form.
- **Recommendation**: canonical surface is the Counter, with one list. On the bill page replace the table with a
  one-line "2 prescriptions waiting · Open queue" that appears only when the bill was opened without a
  prescription. **M**.

### I2. "Pharmacy sales" is a different number on every screen that shows it

- **Leads**: DI-20, DP-69, ND-09.
- **Evidence** (all captured within a few minutes, same day's data):

  | Surface | Default period | Figure shown | What it counts |
  |---|---|---|---|
  | Sales register footer ([bills-1](redundancy-screens/bills-1-sales-register.jpg)) | Financial year | ₹5,187.28 · 6 bills | billed, with the counter sale |
  | "Pharmacy Invoices" tile ([bills-2](redundancy-screens/bills-2-pharmacy-invoices.jpg)) | Today | ₹4627.28 · 5 invoices | billed, without the ₹560 counter sale |
  | Inventory › Sales › Patient invoice history ([bills-3](redundancy-screens/bills-3-inventory-patient-invoice-history.jpg)) | Today | ₹4627.28 · 5 | same component as above |
  | Daily Collection "Pharmacy" ([daily-collection](redundancy-screens/daily-collection.jpg)) | Today | ₹5,121.20 | received (billed less the ₹66.08 still due) |
  | Pharmacy Report › Sales Register ([bills-4](redundancy-screens/bills-4-report-sales-register.jpg)) | Last month | ₹0.00 | nothing, because the default is October |
  | Pharmacy Report › Day wise Summary (read-out) | Recent days | ₹5,187.28 · "5 bills" | same total as the register, one bill fewer |
  | Pharmacy Desk "Sales" ([pharmacy-desk](redundancy-screens/pharmacy-desk.jpg)) | Today | "₹…" | cut off at 1440 px |

- **Status**: confirmed live. Each difference is explainable; none is labelled.
- **Second occurrence**: the register (list of bills) and Daily Collection (money in the drawer) serve different
  contexts. The other five are repeats.
- **Recommendation**: label every total with its basis ("Billed" or "Received", "includes counter sales"). Give
  every sales surface the same default period (today). Remove the invoice-list tiles with the list (F3) and the
  Desk metric with the Desk (F6). **S** for labels and defaults.

### I3. Low stock is 0, 8, 8 or 5 depending on where you look, and the bell says nothing

- **Leads**: DI-23, OF-27, DP-63.
- **Evidence**: Reports & Analytics "System Alerts · Low Stock 0" ([reports-analytics.jpg](redundancy-screens/reports-analytics.jpg));
  the Inventory Report card on that same page lists "Low Stock 8" with five named items (read-out); Inventory ›
  Today "8 Low stock" ([inventory-today.jpg](redundancy-screens/inventory-today.jpg)); Pharmacy Desk "Stock 9 · 5
  low" ([pharmacy-desk.jpg](redundancy-screens/pharmacy-desk.jpg)); the header bell "No notifications" for admin
  and receptionist; Dashboard "System Alerts" lists only "System Status — All systems operational"
  ([sidebar-admin.jpg](redundancy-screens/sidebar-admin.jpg)). The same alert strip reported "Upcoming
  Appointments 0" while the calendar held bookings for later that day. J9 saw the same 0-versus-list contradiction.
- **Status**: confirmed live.
- **Second occurrence**: noise, and worse than noise because three of the five surfaces say there is nothing to do.
- **Recommendation**: one definition (available at or below the reorder level) served by one endpoint. Canonical
  surface is Inventory › Today; the bell links to it; remove the alert strip from Reports & Analytics and the
  "System Alerts" card from the Dashboard. **S–M**.

### I4. The patient record states each identity fact twice and contradicts the calendar

- **Leads**: DI-02, DI-03, ND-26.
- **Evidence**: [patient-detail.jpg](redundancy-screens/patient-detail.jpg). Gender and age appear as header
  badges and again in "Patient Information"; phone and e-mail appear in the summary card and again below. The
  header badge shows the raw internal ID beside the human "Code: MAEP7". "Next appointment: Not scheduled" is shown
  for a patient who had a Scheduled 18:00 booking that day (Appointments read-out, "#4 18:00-18:30 Kavya Jfour
  Review Scheduled").
- **Status**: confirmed live.
- **Second occurrence**: noise. The "Info" tab adds only ABHA ID and address to what is already above it.
- **Recommendation**: keep the header and summary card; reduce the Info tab to the fields not shown above; remove
  the internal ID; compute "Next appointment" from bookings. **S**.

### I5. The visit screen says who, what and how far six times before the first field

- **Leads**: DI-02, DI-04, DI-05, OF-11.
- **Evidence**: [J3 03-visit-form-on-arrival.jpg](journeys/J3-doctor-visit-screens/03-visit-form-on-arrival.jpg):
  "Visit Documentation" with a "From Appointment" badge, the six-step patient tracker, an identity bar, a "Patient
  Context" card repeating name, raw ID, age and phone, "Visit #1 · DRAFT · Linked to Appointment", "Medical Visit
  Documentation • Role: DOCTOR • Progress: 0%", a progress bar, then "Visit Information" and "Progress Summary"
  cards with the visit number, status and progress again.
- **Status**: confirmed live (J3).
- **Second occurrence**: noise, except the tracker, which is a different concept that happens to look like the
  visit's own progress.
- **Recommendation**: one identity bar (name, age, sex, code, appointment time); one status line with one progress
  indicator; remove the tracker from the visit screen. **S–M**.

### I6. Page titles are stacked two and three deep

- **Leads**: DI-36, ND-55.
- **Evidence**: "Patients Management" → "Patients" → "Patient Records"
  ([header-search-patient-lands.jpg](redundancy-screens/header-search-patient-lands.jpg)); "Pharmacy Counter" twice
  ([pharmacy-counter.jpg](redundancy-screens/pharmacy-counter.jpg)); "Drug Management" → "Drug Database"
  ([title-drugs.jpg](redundancy-screens/title-drugs.jpg)); "Pharmacy Invoices" twice
  ([bills-2-pharmacy-invoices.jpg](redundancy-screens/bills-2-pharmacy-invoices.jpg)); "Prescription Queue" →
  "Prescription dispensing queue"; "Day wise Summary" → "Day-wise Summary"; "Users Management" → "Users"; "Room
  Management" → "Room Calendar & Occupancy" → "Room Occupancy Calendar" (page read-outs).
- **Status**: confirmed live.
- **Recommendation**: one H1 per page, equal to the sidebar label; card titles only where a page has more than one
  card. **S**.

### I7. The Dashboard shows system statistics to every role

- **Leads**: DI-34.
- **Evidence**: "Total Users 8 · Active Users 8 · Total Branches 1 · System Status operational", then "System
  Status" again as an alert row, for the receptionist ([sidebar-reception.jpg](redundancy-screens/sidebar-reception.jpg)),
  nurse ([sidebar-nurse.jpg](redundancy-screens/sidebar-nurse.jpg)), pharmacist
  ([dashboard-pharmacist.jpg](redundancy-screens/dashboard-pharmacist.jpg)) and accountant
  ([dashboard-accountant.jpg](redundancy-screens/dashboard-accountant.jpg)). For the last two that is the whole page.
- **Status**: confirmed live. That the two user counts come from one server number is from code only.
- **Recommendation**: see H1. **M**.

### I8. Daily Collection gives the clinic total three times above the fold

- **Leads**: DI-16.
- **Evidence**: [daily-collection.jpg](redundancy-screens/daily-collection.jpg): tile "Clinic ₹5,600.00", the
  Clinic column total "5,600.00", tile "Clinic received ₹5,600.00"; "Whole day" is both a heading and a tile label.
  J2 measured the same.
- **Status**: confirmed live.
- **Recommendation**: keep the payment-mode table as the canonical figure; keep one row of three tiles (Clinic,
  Pharmacy, Whole day) and drop "Clinic received". **S**.

### I9. Visits setup has two cards about the user's role, one of them empty

- **Leads**: DI-05, DI-37.
- **Evidence**: [title-visits-setup.jpg](redundancy-screens/title-visits-setup.jpg): "Your Role & Permissions" with
  "Current Role", and an "Available Features" card with no content. The admin is told the role is "Doctor".
- **Status**: confirmed live.
- **Recommendation**: delete both cards; the page is a patient picker. **S**.

### I10. Supplier credits and net position repeat between the register and the ledger

- **Leads**: DI-29, DI-30.
- **Evidence**: strip "Due − Credit held = Net payable" on the register
  ([inventory-area-purchases.jpg](redundancy-screens/inventory-area-purchases.jpg)); "Outstanding" tile and
  "Distributor Summary" on the ledger, which also embeds the whole "Supplier credits & vouchers" panel that has its
  own task ([task-payments-and-dues.jpg](redundancy-screens/task-payments-and-dues.jpg), read-out).
- **Status**: confirmed live.
- **Second occurrence**: the register strip serves a new context (it appears only when one supplier is in view)
  and should stay. The embedded credits panel is a repeat.
- **Recommendation**: in the ledger, replace the embedded panel with a one-line "Credits held ₹… · Open credits".
  **S**.

### I11. A reorder document is drawn by two components on one page

- **Leads**: DI-28, DP-64, DP-66.
- **Evidence**: [J8 08-shortbook-request-top.jpg](journeys/J8-stock-reorder-screens/08-shortbook-request-top.jpg)
  and [09](journeys/J8-stock-reorder-screens/09-shortbook-request-lines-and-supplier.jpg): two headings, two
  supplier controls, two cancel actions, 1,769 px for one line item.
- **Status**: confirmed live (J8).
- **Recommendation**: as J8 proposes, one supplier picker and one action bar. **M**.

Not checked in a browser: DI-08, DI-09, DI-12 to DI-14, DI-22, DI-25 to DI-27, DI-31, DI-32, DI-35.

---

## Overlapping Features

### F1. The Drug database and Inventory are two product lists, and the bill searches the smaller one

- **Leads**: OF-12, DP-53, ND-21, ND-33, ND-41.
- **Evidence**: "Drug Database · Total Drugs 9 · Manage your pharmacy's drug inventory"
  ([title-drugs.jpg](redundancy-screens/title-drugs.jpg)) against Inventory Report "Total Items 84" and Inventory ›
  Today "Unmapped 73" ([inventory-today.jpg](redundancy-screens/inventory-today.jpg)). J6 typed a product that had
  40 bottles in stock into the bill and got "No matching drugs found in the drug master"
  ([J6 05-drug-no-match.jpg](journeys/J6-pharmacy-walkin-sale-screens/05-drug-no-match.jpg)); J5 found every
  prescription line arriving as "No match" until re-linked. The Drug database has no sidebar entry and is reached
  only through Pharmacy Desk › `Drugs`.
- **Status**: confirmed live, and by J5 and J6.
- **Verdict**: drift. This is the overlap that stops work: stock on the shelf cannot be sold until someone links it.
- **Recommendation**: merge. One product list, owned by Inventory. The bill and the prescription search read
  inventory items directly; the "Unmapped" state disappears. The Drug database page becomes Inventory › Stock ›
  "Products". **L**.

### F2. The Counter cockpit and the Prescription Queue table are two tools for one queue

- **Leads**: OF-03, DI-18, DI-19, ND-31, DP-26, DP-27.
- **Evidence**: [pharmacy-counter.jpg](redundancy-screens/pharmacy-counter.jpg) and
  [pharmacy-counter-queue-below.jpg](redundancy-screens/pharmacy-counter-queue-below.jpg). The cockpit labels a
  prescription Queued / Review / Partial / Bill / Done and shows an eight-pill rail; the table labels the same
  prescriptions Pending. Stock is "IN STOCK" in one and "In stock" in the other. J5 measured that Accept / Sub / NA
  decisions made in the cockpit do not reach the bill.
- **Status**: confirmed live; the lost decisions are confirmed live (J5).
- **Verdict**: drift. The table is the complete list and the only place to link stock; the cockpit is a second
  decision surface whose output is discarded.
- **Recommendation**: merge into one list. Each row expands to show lines, stock and shelf, with one `Bill` button.
  Bring the review step back only when the bill reads it. One status vocabulary (see naming). **L**.

### F3. Four lists of pharmacy bills, none complete

- **Leads**: OF-05, DP-30, DP-31, DP-32, DI-21, ND-01, ND-09, ND-10.
- **Evidence**: Sales register ([bills-1](redundancy-screens/bills-1-sales-register.jpg)); "Pharmacy Invoices" at
  `/dashboard/pharmacy/invoices` ([bills-2](redundancy-screens/bills-2-pharmacy-invoices.jpg)); the identical
  component inside Inventory › Sales › More tasks › "Patient invoice history"
  ([bills-3](redundancy-screens/bills-3-inventory-patient-invoice-history.jpg)); Pharmacy Report › "Sales Register"
  ([bills-4](redundancy-screens/bills-4-report-sales-register.jpg)).

  | | Sales register | Pharmacy Invoices / Patient invoice history | Report › Sales Register |
  |---|---|---|---|
  | Includes counter sales | yes | no | yes (per its description) |
  | Default period | financial year | today | last month |
  | Status words | Revised, Due, Refunded, payment mode | CONFIRMED, COMPLETED | none |
  | Edit discount, refund | yes | no | no |
  | Collect a due | no | `Mark as Paid` | no |
  | Download PDF | no | yes | no |
  | Delete | no | `Delete Invoice`, also on finished bills | no |
  | Export the list | no | no | `Download` |

- **Status**: confirmed live.
- **Verdict**: drift for the middle column; the report is a deliberate statutory view with a clashing name.
- **Recommendation**: Sales register is canonical. Move `Collect payment` and `Download PDF` into it, add a list
  download, then remove `/dashboard/pharmacy/invoices` and "Patient invoice history" (redirect both to the
  register). Rename the report "GST sales register". **M**.

### F4. Two tools sell stock: the Sales bill and Inventory › Sales › Counter sales

- **Leads**: OF-04, DP-25, DP-33, ND-08.
- **Evidence**: the register lists a "Counter sale" row beside pharmacy bills
  ([bills-1](redundancy-screens/bills-1-sales-register.jpg)); the tool that made it is under Inventory › Sales with
  a button called `New document` ([bills-3](redundancy-screens/bills-3-inventory-patient-invoice-history.jpg) shows
  that area's task strip: Counter sales, Quotations, Customer returns). J6 measured that the Sales bill cannot bill
  an unregistered customer, that nothing in Sales points to Counter sales, and that the two tools price the same
  bottle differently ([J6 14-counter-sale-editor.jpg](journeys/J6-pharmacy-walkin-sale-screens/14-counter-sale-editor.jpg)).
- **Status**: confirmed live, and by J6.
- **Verdict**: drift. Functionally different today, but a pharmacist cannot tell which to use, and the difference
  that matters (no patient needed) is the commonest counter case.
- **Recommendation**: merge. Give the Sales bill a "Walk-in, no patient record" option. Move Quotations and
  Customer returns to tabs on the Sales page (Returns is already a tab there). Remove the "Sales" area from
  Inventory. **L**.

### F5. Appointments › Calendar and Appointments › Slots

- **Leads**: OF-02, ND-27.
- **Evidence**: [appointments-calendar-tab.jpg](redundancy-screens/appointments-calendar-tab.jpg),
  [appointments-slots-tab.jpg](redundancy-screens/appointments-slots-tab.jpg). Same two columns, same tiles, same
  booking buttons. Differences: Calendar has a Legend and calls the interval "Grid"; Slots calls it "Duration" and
  carries the stale sentence "Select a doctor and date to view available appointment slots".
- **Status**: confirmed live. J1 reached the same conclusion.
- **Verdict**: drift.
- **Recommendation**: remove Slots; collapse the Legend so the grid starts above the fold. **M**.

### F6. Pharmacy Desk repeats the sidebar and hides two pages

- **Leads**: ND-30, DP-36, DP-37, OF-28.
- **Evidence**: [pharmacy-desk.jpg](redundancy-screens/pharmacy-desk.jpg). Three tiles (Pharmacy Counter, New
  sale, Inventory Control) repeat three sidebar items shown beside them. Four metrics (Sales, Invoices, Stock,
  Packages) repeat figures owned by other pages. The rest is an AI assistant launcher, "Partner Daily Sync" with a
  manual entry form whose labels overlap at 1440 px, and Treatment Packages. `Invoices` and `Drugs` are the only route to two pages with no menu entry.
  The receptionist's Desk ([reception-pharmacy-desk.jpg](redundancy-screens/reception-pharmacy-desk.jpg)) is two
  tiles that repeat her sidebar plus tools for partner sales and packages.
- **Status**: confirmed live.
- **Verdict**: drift. A hub page made of links the menu already has, plus three unrelated tools.
- **Recommendation**: remove the Desk as a destination. Metrics go to the pharmacist's landing page (H1); Drugs
  into Inventory (F1); Invoices is retired (F3); Partner Daily Sync and Treatment Packages become tabs under Sales;
  the AI assistant becomes a header button on pharmacy pages. **M–L**.

### F7. Two report centres and Daily Collection split the same questions

- **Leads**: OF-06, OF-32, DP-69, DP-70, DI-33, ND-48, DP-79.
- **Evidence**: "Reports & Analytics › Revenue Report · Total Revenue ₹5,600.00 · GST Amount ₹0.00"
  ([reports-revenue-body.jpg](redundancy-screens/reports-revenue-body.jpg)) is exactly the "Clinic" figure in Daily
  Collection ([daily-collection.jpg](redundancy-screens/daily-collection.jpg)); pharmacy sales of ₹5,187.28 are not
  in it and the page does not say so. "Inventory Report" (stock value, low stock, top sellers) lives in this clinic
  centre ([reports-analytics.jpg](redundancy-screens/reports-analytics.jpg)), not in Pharmacy Report. "Payment Mode
  Breakdown" appears with identical numbers in Revenue Report and Payment Analytics, and again in Daily Collection.
  Daily Collection, the one report covering both businesses, is filed under "Pharmacy Report / Accounting Reports".
  `Generate Report` reloads a report that is already on screen (J9). Default periods differ on every screen: last
  30 days, last month, a recent range, today.
- **Status**: confirmed live.
- **Verdict**: drift in where things are filed; the reports themselves are mostly distinct.
- **Recommendation**: one "Reports" entry with four groups: Money (Daily Collection, Clinic revenue, Pharmacy
  sales), GST, Stock, Clinic activity. Rename "Revenue Report" to "Clinic revenue (consultations and procedures)".
  Move Inventory Report under Stock. Keep one payment-mode table. One toolbar and one default period. **M** for
  the menu and labels, **L** for a shared toolbar.

### F8. Visit tabs and Prescription sections capture the same clinical data

- **Leads**: OF-08, DP-13, DP-15, DI-06, ND-16, ND-18.
- **Evidence**: Vitals tab ([J3 05](journeys/J3-doctor-visit-screens/05-vitals-marked-complete.jpg), "Heart Rate
  78") and Prescription › "Clinical Details & Vitals" ([J3 07](journeys/J3-doctor-visit-screens/07-prescription-tab-clinical-notes.jpg),
  "Pulse (bpm) 78") hold the same values. J3 measured that tests ticked in `Lab Tests` did not appear in
  Prescription › "Investigations" and that the print showed "Investigations: 0".
- **Status**: confirmed live (J3).
- **Verdict**: vitals are a tolerable repeat (they sync; the tab is for the nurse). The two test lists are drift
  with a wrong result on paper.
- **Recommendation**: one tests list that feeds both the results tab and the print. Show vitals in the
  Prescription tab as a read-only line with "Edit in Vitals". **M**.

### F9. Inside Pharmacy Report, some menu entries are the same report

- **Leads**: OF-07, DP-72, DP-71.
- **Evidence**: "Sales Bills" and "Purchase Bills" each open a report with a "Type: Sales | Purchase" switch (page
  read-outs); the menu also has "Sales Register" and "Purchase Register"
  ([pharmacy-report-home.jpg](redundancy-screens/pharmacy-report-home.jpg)).
- **Status**: the one-report-two-entries pair is confirmed live. Differences in calculation between GSTR-3B and GST
  Summary, and between Item Wise Margin and Monthly Report, are from code only.
- **Verdict**: statutory formats (GSTR-1, 3B, 2A, 2B) are deliberate. The Bills pair is drift.
- **Recommendation**: one "Bills" entry with the Type switch; where two reports give different profit or tax
  figures, say why under the total. **S**.

### F10. Procedures page and the visit both record a procedure

- **Leads**: OF-09, DP-16.
- **Evidence**: catalog STORY-051. Seen live only that the page is titled "Smart Procedures Management" and has an
  "Analytics" tab.
- **Status**: from code only.
- **Recommendation**: differentiate. Open the Procedures form from inside a visit, so that a procedure is a section
  of a visit and not a second kind of visit. **M–L**.

### F11. Four ways to change a batch quantity

- **Leads**: OF-13, DP-54.
- **Evidence**: catalog STORY-098 to 101; J8 walked `Edit stock` and `Loss & breakage`.
- **Status**: from code only for the overlap as a whole.
- **Verdict**: the controls differ on purpose in part (a count needs sign-off); the inconsistency is that one
  route needs approval and another, for the same change, does not.
- **Recommendation**: differentiate. One "Adjust stock" entry that asks for the reason first and applies the same
  approval rule to every reason. **L**.

### F12. Templates, the learned plan and `Reuse last meds` all prefill treatment

- **Leads**: OF-10, DP-18 to DP-20, ND-23.
- **Status**: from code only here; J4 judges it in context.
- **Recommendation**: defer to J4.

### F13. About 4,300 lines of unmounted components duplicate live features

- **Leads**: OF-31, OF-21.
- **Evidence**: no importer found for `components/billing/BillingManagement.tsx` (1,514 lines),
  `pharmacy/PharmacyPackageManager.tsx` (994), `pharmacy/PharmacyDashboard.tsx` (345),
  `stock-prediction/StockPredictionDashboard.tsx` (496) or `inventory/PharmacyInventoryControl.tsx` (319), which is
  the only importer of `inventory/ShelfIntelligence.tsx` (658).
- **Status**: from code only (import search).
- **Verdict**: drift. Not visible to users, but each is a second implementation that the next change may edit by
  mistake.
- **Recommendation**: delete, after confirming nothing loads them dynamically. `BillingManagement.tsx` contains the
  clinic-bill edit and refund screens that the app lacks; decide whether to mount it before deleting. **S**.

---

## Hierarchy & IA

### H1. The landing page is system statistics

- **Leads**: DI-34.
- **Evidence**: [dashboard-pharmacist.jpg](redundancy-screens/dashboard-pharmacist.jpg),
  [dashboard-accountant.jpg](redundancy-screens/dashboard-accountant.jpg),
  [sidebar-reception.jpg](redundancy-screens/sidebar-reception.jpg), [sidebar-nurse.jpg](redundancy-screens/sidebar-nurse.jpg).
  Every role lands on "Total Users · Active Users · Total Branches · System Status". Only the doctor's version
  ([sidebar-doctor.jpg](redundancy-screens/sidebar-doctor.jpg): Recent Visits, My Patients) is about the day's work.
- **Status**: confirmed live.
- **Recommendation**: land each role on its working screen: receptionist and nurse on Appointments, pharmacist on
  the Counter, accountant on Daily Collection, doctor on the present Dashboard. Keep the statistics and the backup
  button for admins under Settings. **M**.

### H2. A developer test page is a top-level menu item, and for doctors it is the whole "Admin" section

- **Leads**: OF-25, discovery D.
- **Evidence**: [sidebar-doctor.jpg](redundancy-screens/sidebar-doctor.jpg) shows an "Admin" heading with one item,
  "Test Transcribe". The page ([test-transcribe.jpg](redundancy-screens/test-transcribe.jpg)) has no sidebar or
  header and describes itself as "Test the OpenAI Whisper transcription API with speaker diarization".
- **Status**: confirmed live.
- **Recommendation**: remove it from the sidebar (`components/layout/sidebar.tsx:155-160`). If doctors need a
  microphone check, put it in "My Settings". **S**.

### H3. Two pages can be reached only through Pharmacy Desk buttons

- **Evidence**: `Invoices` and `Drugs` in [pharmacy-desk.jpg](redundancy-screens/pharmacy-desk.jpg) open
  `/dashboard/pharmacy/invoices` and `/dashboard/pharmacy/drugs`. Neither is in the sidebar. The first holds the
  only way to collect a due (P9); the second holds the list the bill searches (F1).
- **Status**: confirmed live.
- **Recommendation**: resolved by F1 and F3. Until then, add both to the Pharmacy section. **S**.

### H4. "Sales" exists twice

- **Evidence**: sidebar `Sales` ([bills-1](redundancy-screens/bills-1-sales-register.jpg)) and Inventory › `Sales`
  ([bills-3](redundancy-screens/bills-3-inventory-patient-invoice-history.jpg)). The second holds counter sales,
  quotations, customer returns and a copy of the invoice list. The sidebar `Sales` page has a `Returns` tab that
  opens the Inventory editor.
- **Status**: confirmed live.
- **Recommendation**: one Sales, in the sidebar (F4). **L** with F4.

### H5. Inventory has four tiers of navigation and puts 17 of its 31 tasks in a dropdown

- **Leads**: ND-37.
- **Evidence**: area tabs (5), a task strip, a `More tasks…` select and inner tabs
  ([inventory-area-purchases.jpg](redundancy-screens/inventory-area-purchases.jpg),
  [redirect-inventory-updates.jpg](redundancy-screens/redirect-inventory-updates.jpg)). Counted from the page:
  Purchases 11 tasks (8 in the select), Stock 10 (5), Sales 4 (1), Reorder 6 (3). When a task from the select is
  open, the select shows its name and the strip shows nothing as current
  ([task-payments-and-dues.jpg](redundancy-screens/task-payments-and-dues.jpg)). The Stock area carries a permanent
  notice, "Supplier returns are now in Purchase bills › Returns", in its navigation
  ([inventory-area-stock.jpg](redundancy-screens/inventory-area-stock.jpg)). The task name and the page title differ
  for seven tasks (confirmed live): `Payments & dues` → "Purchase Ledger"; `Purchase costs` → "Distributor
  Analytics"; `Gmail intake` → "Invoice attachments from Gmail"; `Import CSV` → "Import purchase CSV"; `Manual
  opening stock` → "Opening stock entries"; `Automation settings` → "Automation setup & summary"; `Monitor` →
  "Replenishment monitor".
- **Status**: confirmed live.
- **Recommendation**: replace the strip and the select with one visible list per area, grouped (for Purchases:
  Bills · Suppliers · Money · Receiving). Page title equals task name. Remove the notice. **M**.

  How deep the frequent destinations sit today, against one that needs no menu entry at all:

  | Destination | Used by | Path today | Interactions |
  |---|---|---|---|
  | Collect a due pharmacy bill | pharmacist, daily | Pharmacy Desk › Invoices › find bill › Mark as Paid | 4, through a page with no menu entry |
  | Counter sale to an unregistered customer | pharmacist, daily | Inventory › Sales › Counter sales › New document | 4, outside "Sales" |
  | Supplier payments | pharmacist, weekly | Inventory › Purchases › More tasks… › Payments & dues | 4, inside a dropdown |
  | Approve a new item | doctor or admin | Inventory › Stock › Approve corrections › New items | 4 |
  | Drug database | pharmacist | Pharmacy Desk › Drugs | 2, no menu entry |
  | Clinic holidays, WhatsApp templates | admin, rare | Users › button | 2 (from code only) |
  | Test Transcribe | no clinic task | sidebar | 1 |

### H6. Daily Collection is the clinic's end-of-day page but belongs to the pharmacy and excludes the desk

- **Leads**: OF-06, ND-55.
- **Evidence**: breadcrumb "Pharmacy Report / Accounting Reports" on a page whose first table is clinic money
  ([daily-collection.jpg](redundancy-screens/daily-collection.jpg)). The receptionist, who takes the consultation
  payments, has no menu entry for it ([sidebar-reception.jpg](redundancy-screens/sidebar-reception.jpg)) and is
  refused by address ([J2 14](journeys/J2-clinic-billing-screens/14-daily-collection-reception-refused.jpg)).
- **Status**: confirmed live, and by J2.
- **Recommendation**: file it under Reports › Money; give the receptionist the clinic half. **M** (needs a
  permission change).

### H7. The receptionist's menu has three pharmacy items and no way to close her day

- **Evidence**: [sidebar-reception.jpg](redundancy-screens/sidebar-reception.jpg): Pharmacy Desk, Pharmacy Counter
  and Inventory, three of her seven items. Her Counter page renders Accept, Sub, NA, Pause, Ready, Paid, Open bill
  and Collect payment (page read-out; not pressed). Her Inventory › Today shows purchase and reorder queues.
- **Status**: confirmed live for what is shown. Which of those buttons the server would accept was not tested.
- **Recommendation**: ask the clinic whether the front desk dispenses. If not, remove all three. If she only
  checks whether a prescription is ready, give her one read-only "Pharmacy queue". **S**.

### H8. Two report entries sit in two different sections under different names

- **Leads**: ND-48.
- **Evidence**: "Pharmacy Report" (singular) under Pharmacy and "Reports" under Admin, which opens "Reports &
  Analytics" ([sidebar-admin.jpg](redundancy-screens/sidebar-admin.jpg)).
- **Status**: confirmed live.
- **Recommendation**: one "Reports" (F7). **M**.

### H9. Owner and Manager menus have gaps

- **Leads**: discovery D.
- **Evidence**: `components/layout/sidebar.tsx`: OWNER has no Pharmacy Desk or Counter although the server admits
  the role; MANAGER has Inventory but no Sales and sees a Users list it cannot change.
- **Status**: from code only (no login for either role).
- **Recommendation**: give OWNER the admin menu; decide what MANAGER is for and cut the menu to match. **S**.

### Naming: one concept, one name

"Seen live" lists only wording observed in the running app during this pass or in a journey critic's screenshot.

| Concept | Names seen live | Proposed term |
|---|---|---|
| Pharmacy bill | Sales, New sale, New bill, Add Items to Invoice, Invoice Summary, Pharmacy Invoices, Patient invoice history, Bill No, GST bill, Counter sale, New document | **Pharmacy bill**. List: "Pharmacy bills". Action: `New bill` |
| Consultation or procedure bill | bill, Bill, Billing (tracker step), Overdue Invoices (alert strip) | **Clinic bill** |
| Money not yet received | Due, Pending Amount, Pending Payments, Clinic still due | **Due** |
| How it was paid | Payment, Payment Method, Payment mode, Paid by | **Payment mode** |
| The dispensing queue | Queue, Rx queue, Prescription Queue, Prescription dispensing queue | **Prescription queue** |
| State of a prescription at the counter | Pending; Queued, Review, Partial, Bill, Done; In Review, Partially Filled, Ready to Bill, Paid, Dispensed | **Waiting · Ready to bill · Billed · Dispensed · On hold** |
| Stock state | IN STOCK / In stock; Low stock; Unmapped / Not linked | **In stock · Low · Out** (and no "unmapped" after F1) |
| Something the pharmacy stocks | Drug, Drugs, Medicine, Medication, Item, Product, Batch (`Add batch` adds an item) | **Item** in pharmacy and inventory, **Batch** only for a lot, **Medicine** only on the prescription |
| Who the clinic buys from | Supplier, Distributor | **Supplier** |
| A supplier's bill | Purchase bills, New purchase, Scan or enter bill, Purchase invoices to review, Invoices (ledger) | **Purchase bill** |
| Supplier money | Payments & dues, Purchase Ledger, Mark paid | **Supplier payments** |
| Purchase analysis | Purchase costs, Distributor Analytics | **Purchase costs** |
| Approving stock changes | Approve corrections, Price / stock approval queue, Price/stock edits awaiting approval, New items | **Approvals** |
| Reordering | Reorder, Shortbook, Replenishment monitor, Target proposals, Manual targets & exclusions | **Reorder** for the area; keep "Shortbook" (trade term); "Reorder monitor"; "Stock targets" |
| A consultation record | Visits, Visit Documentation, Medical Visit Documentation, Recent Visits, "Your latest consultations" | **Visit** |
| Begin or continue one | START, Start Visit, Start new visit, Start New Visit; CONT, Continue, Resume last visit | **Start visit** and **Resume visit** |
| Tests ordered | Lab Tests, Investigations | **Investigations** (the word on the printed prescription) |
| Pulse | Heart Rate, Pulse (bpm) | **Pulse (bpm)** |
| Appointment grid interval | Grid, Duration | **Slot length** |
| The two columns | Scheduled (also a status), Confirmed | keep, but call the status "Booked" so that "Scheduled" means only the column |
| Remote consultation | Telemedicine, Telemed (Rooms) | **Telemedicine** |
| Reports | Reports, Reports & Analytics, Pharmacy Report | **Reports** |
| Report names | Day wise Summary / Day-wise Summary, Item Wise Margin Report | hyphenated, sentence case: "Day-wise summary", "Item-wise margin" |
| Getting a file | Download, Export, Export CSV | **Download** |
| End-of-day money | Daily Collection, Daily close | **Daily Collection** |
| Pharmacy home | Pharmacy Desk, Command center | none (page removed, F6) |
| Inventory, from the pharmacy | Inventory, Inventory Control, Shelf locations | **Inventory** |
| Role labels | RECEPTION, PHARMACIST, ACCOUNTANT, NURSE, DOCTOR, ADMIN (sidebar footer) | Receptionist, Pharmacist, Accountant, Nurse, Doctor, Admin |
| Making a record | New Patient → "Create Patient"; "Add New Patient"; Add New Drug; Add batch; New sale; New document; Create Package | `New <thing>` on the button and as the dialog title; `Save` to finish |
| Page title | "Patients Management", "Users Management", "Room Management", "Drug Management", "Smart Procedures Management" | the sidebar label, unchanged |

From code only, not seen in this pass: the product is "ClinicMS" in the app and "Linaé" in document titles
(ND-53); "Therapist" appears in guides although no such role exists (ND-52); raw filter keys such as
"expiryMonths: 3" appear as chips (ND-47). Raw user IDs after "Requested by" in the Shortbook were seen live.

### Proposed navigation

Principles: land each role on its working screen; one entry per job; nothing in the menu that the role cannot use;
page title equals menu label.

**Receptionist**

| Today | Proposed |
|---|---|
| Dashboard · Patients · Appointments · Rooms · Pharmacy Desk · Pharmacy Counter · Inventory | **Appointments** (landing) · Patients · Daily Collection (clinic half) · Rooms · Pharmacy queue (read-only, only if the clinic wants it) |

**Nurse**

| Today | Proposed |
|---|---|
| Dashboard · Patients · Appointments · Visits · Rooms | **Appointments** (landing) · Patients · Visits · Rooms |

**Doctor**

| Today | Proposed |
|---|---|
| Dashboard · Daily Collection · Patients · Appointments · Visits · Procedures · Rooms · Pharmacy Desk · Pharmacy Counter · Sales · Inventory · Pharmacy Report · Admin › Test Transcribe | **My day** (landing: today's list, recent visits, my patients) · Appointments · Patients · Visits · Procedures — Pharmacy: Prescription queue · Pharmacy bills · Inventory (with the approvals count) — Reports — Setup: Rooms |

**Pharmacist**

| Today | Proposed |
|---|---|
| Dashboard · Daily Collection · Pharmacy Desk · Pharmacy Counter · Sales · Inventory · Pharmacy Report | **Prescription queue** (landing, with today's sales, dues and low-stock counts on top) · Pharmacy bills (tabs: Bills · Returns · Quotations · Partner sales · Packages) · Inventory (Today · Purchases · Stock · Reorder; Products under Stock) · Daily Collection · Reports |

**Accountant**

| Today | Proposed |
|---|---|
| Dashboard · Daily Collection · Pharmacy Report | **Daily Collection** (landing) · Reports |

**Admin and Owner**

| Today | Proposed |
|---|---|
| Overview: Dashboard · Daily Collection — Clinical: Patients · Appointments · Visits · Procedures · Rooms — Pharmacy: Pharmacy Desk · Pharmacy Counter · Sales · Inventory · Pharmacy Report — Admin: Reports · Users · Fee list · Test Transcribe | Front desk: Appointments · Patients — Clinical: Visits · Procedures — Pharmacy: Prescription queue · Pharmacy bills · Inventory — Money: Daily Collection · Reports — Settings: Users · Fee list · Rooms · Clinic settings (holidays, WhatsApp templates, system statistics, backup) |

That is 16 items down to 13 for the admin, 7 down to 4 or 5 for the receptionist and 7 down to 5 for the
pharmacist, with Test Transcribe, Pharmacy Desk and the second report centre gone. Manager is left out until the
clinic says what the role is for (H9).

---

## Leads Refuted

Leads that did not hold in the running app, and observations of mine that turned out not to be findings.

1. **Legacy routes as "stale or dead paths" (discovery D).** `/dashboard/prescriptions` → Visits,
   `/dashboard/stock-predictions` → Inventory › Reorder › Manual targets, `/dashboard/inventory-updates` →
   Inventory › Stock › approvals, and the old report link `/dashboard/inventory?area=purchases&view=reports` →
   Pharmacy Report › GST Summary all redirect cleanly. They are not dead. Only `/dashboard/billing` lands somewhere
   misleading (P4), and only the `?tab=` links are truly stale (P7).
2. **ND-37, "`Opening stock import` → 'Start Pharmacy Inventory From Excel'".** The page heading in the running
   app is "Opening stock import", the same as the task. If the longer phrase exists it is an inner card title, not
   the page title. Five of ND-37's seven mismatches are real, and two more were found (H5).
3. **ND-37, "`Credits & vouchers` → 'Supplier credits & vouchers'".** True, but it is the same name with one word
   added. Not a naming problem.
4. **Supplier outstanding looked different on two screens.** The register showed "Due ₹470.40" and, a few minutes
   later, the ledger showed "Outstanding Rs 313.60". The difference is exactly one bill (₹156.80) that another
   critic marked paid in between; the ledger's own chips read "Pending 1 · Paid 1". Not a finding. The only real
   difference between the two screens is "₹" versus "Rs" (P13).
5. **OF-27 and DI-10, "the Dashboard alerts, the bell and the Reports strip all show the same alert data".** In
   this data they showed no alert data at all: no bell items, no low stock, no upcoming appointments, while
   Inventory listed eight low-stock items and the calendar had bookings later in the day. The lead is right that
   the three share a source; what the user sees is not three copies of an alert but three blanks (I3).

Leads that could not be judged either way in this data: DI-24 (three approval counters disagree; all were zero),
DP-60 (the queue opens on the wrong inner tab; nothing was pending), DI-20's "invoice-list tiles count the current
page only" (five invoices fit on one page), the sidebar approvals badge (not shown at zero), and the bell's own
links (no notifications to click).

---

## Clean Areas

- **Sales register** ([bills-1](redundancy-screens/bills-1-sales-register.jpg)). One list, one primary button,
  bills and counter sales together, due and refund states readable at a glance, one total. This is why it should
  be the surviving list in F3.
- **Sidebar role gating.** What each of the six tested roles sees matches the matrix in `discovery.md` exactly.
  The problems in H1 to H8 are about what was chosen, not about leaks.
- **Legacy redirects** (see Leads Refuted 1). Old bookmarks keep working.
- **Fee list.** One page, one purpose, three rows, title equal to the menu label; no second place edits fees.
- **Purchase bills register** ([inventory-area-purchases.jpg](redundancy-screens/inventory-area-purchases.jpg)).
  One list, one primary, a supplier strip that appears only when it adds context, a footer total that links to
  dues. J7 reached the same view.
- **Inventory › Today's "What needs attention"** ([inventory-today.jpg](redundancy-screens/inventory-today.jpg)).
  Apart from the three repeated buttons (P11) it is the one work queue in the app where every row is a count and a
  link, and it should be the canonical home for stock alerts (I3).
- **Pharmacy Report landing** ([pharmacy-report-home.jpg](redundancy-screens/pharmacy-report-home.jpg)). A search
  box, a grouped menu and six cards that each say in one sentence what the report answers. The duplicates are in
  the menu entries (F9), not in the page design.
- **Daily Collection as a concept.** It is the only screen where clinic and pharmacy money meet, and its figures
  reconcile with the Sales register to the rupee (I2). Its faults are where it is filed and who may open it (H6).
- **`Mark paid` and `Payments & dues`** (P13), **Daily Collection's two entry points** (P14) and **`Book
  appointment` on the patient record** (P2) are deliberate shortcuts and should stay.

Not examined: sign-in and password reset, Users, Rooms management, Google Calendar, small screens.
