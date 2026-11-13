# UX Path Catalog: ClinicMS (Clinic Management System, dermatology clinic, Hyderabad)

Generated: 2026-11-13
Total Stories: 77
Coverage: 80 / 112 features (71.4%)

Sources: `docs/ux-paths/discovery.md` and the nine files in `docs/ux-paths/topics/`. 80 stories were written by the topic agents; 3 were merged into other stories as the same journey, leaving 77. Every story keeps its original text (Type, Topic, Persona, Goal, Preconditions, Ideal path, Alternate paths, Steps, Variations, Edge Cases). Each heading shows the new id and the original id, for example `STORY-001: ... [orig FRONT-DESK-01]`. Story ids written inside the story text were rewritten as `STORY-nnn (ORIGINAL-ID)`.

Step counting convention (from the topic files): one numbered step per click, per typed field, per selection. Reads and glances are not numbered. "Ideal path" is the number of steps a well designed screen would need; ux-walker uses it as the friction benchmark.

## Summary

| Type | Count |
|------|-------|
| Short | 30 |
| Medium | 36 |
| Long | 11 |

Merged stories (kept as variants inside the surviving story):

| Surviving story | Merged in | Why they are the same journey |
|-----------------|-----------|-------------------------------|
| STORY-065 (ADMIN-SETUP-03) | SIGNIN-NAVIGATION-08 | Owner or admin opens Users, clicks Reset password on one row, confirms, reads the one-time code. Same screens and same three steps; only the persona differs. |
| STORY-034 (CLINIC-BILLING-08) | ADMIN-SETUP-05 | Owner opens Fee list, retypes the Review fee, clicks Save. Same page, same three steps; only the amounts differ. |
| STORY-076 (SIGNIN-NAVIGATION-07) | ADMIN-SETUP-04 | Redeeming a reset code on the reset page. SIGNIN-NAVIGATION-07 is the longer form (failed sign-in attempts first, then the identical reset steps, then sign-in again) and contains every step of ADMIN-SETUP-04. |

Cross-topic links the consolidation found (stories from different topics that overlap or hand off to each other):
- Book and register: STORY-004 and STORY-005 (front desk) repeat the registration of STORY-037 and STORY-039 (patient records); STORY-039 contains a walk-in auto-book that is also STORY-005.
- Visit to bill: STORY-011 (Go to Pharmacy) hands off to STORY-018 (pharmacy bill). STORY-009 starts from the calendar row that STORY-027 bills from.
- Reset code: STORY-065 (issue) leads to STORY-076 (redeem).
- Fee list: STORY-034 feeds STORY-027 to STORY-031 (the fee prefilled on the bill).
- Doctor hours and leave: STORY-067 and STORY-064 change what STORY-001 and STORY-006 can book (leave strip, overbook limit).
- Counts, loss and corrections in inventory (STORY-047, STORY-048, STORY-052, STORY-053) all change the same stock numbers seen in STORY-046 and in STORY-018 (batch picking at the counter).
- Purchase side: STORY-054 and STORY-057 add the stock that STORY-046 then finds; STORY-058 to STORY-059 return it; STORY-061 spans STORY-060 through STORY-055.
- Daily close: STORY-032, STORY-033, STORY-035 and STORY-077 all end in the Daily Collection report.
- Long cross-topic days: STORY-008 (front desk morning), STORY-013 (full consultation), STORY-035 (clinic morning), STORY-069 (onboarding a doctor, touching Users, Rooms, Fee list, My Settings), STORY-077 (owner's round across eight screens).

## Coverage Matrix

Coverage is measured against the discovery Feature Map (11 areas) broken into 112 features. Dead code listed in the discovery document is excluded. A feature counts as covered only when at least one story walks it in its Steps; a feature that a story merely mentions as an alternate path or sees on screen is listed as a gap.

| Feature Area | Features covered | Stories | Gaps |
|-------------|------------------|---------|------|
| Sign-in, shell, cross-cutting UI | 9 / 11 | STORY-007, STORY-064, STORY-069, STORY-070, STORY-071, STORY-072, STORY-073, STORY-074, STORY-075, STORY-076, STORY-077 | Branded switch (login page and header); Quick Guide dialogs and tours |
| Dashboard | 4 / 5 | STORY-017, STORY-038, STORY-074, STORY-077 | Stat cards (Total Users, Active Users, Total Branches, System Status) |
| Appointments | 9 / 12 | STORY-001, STORY-002, STORY-003, STORY-004, STORY-005, STORY-006, STORY-007, STORY-008, STORY-039 | Slots tab (AppointmentScheduler); Calendar filters (Visit Type, Room, Grid, patient search); Google Calendar sync |
| Visits and prescriptions | 11 / 17 | STORY-009, STORY-010, STORY-011, STORY-012, STORY-013, STORY-014, STORY-015, STORY-016, STORY-017, STORY-038, STORY-040, STORY-071 | Visits setup screen (Select Patient, Select Doctor, Start Visit Documentation); Prescription templates, Undo/Redo, custom sections; Voice dictation; Customization tab (print letterhead, offsets); Interaction Summary dialog; Add Drug to Database from the builder |
| Patients | 7 / 9 | STORY-036, STORY-037, STORY-038, STORY-039, STORY-040, STORY-041, STORY-042, STORY-043, STORY-044, STORY-075 | Patient row WhatsApp action; PatientProgressTracker (Continue, Book, View, Bill) |
| Pharmacy Desk and Counter | 4 / 8 | STORY-018, STORY-025, STORY-026 | AI pharmacy assistant dock; Partner daily sync (Manual Daily Entry); Treatment Packages (create, browse); Drug Database page |
| Sales billing | 8 / 8 | STORY-018, STORY-019, STORY-020, STORY-021, STORY-022, STORY-023, STORY-024, STORY-025 | none |
| Clinic fee billing and Daily Collection | 3 / 3 | STORY-027, STORY-028, STORY-029, STORY-030, STORY-031, STORY-032, STORY-033, STORY-034, STORY-035, STORY-077 | none |
| Inventory | 18 / 27 | STORY-045, STORY-046, STORY-047, STORY-048, STORY-049, STORY-050, STORY-051, STORY-052, STORY-053, STORY-054, STORY-055, STORY-056, STORY-057, STORY-058, STORY-059, STORY-060, STORY-061, STORY-062 | Blocked stock; Manual opening stock / Opening stock import; Stock optimization; Inventory Sales area (Counter sales, Quotations, Customer returns, Patient invoice history); Import CSV / Gmail intake; Terms of Trade; Gate passes; Purchase costs (DistributorAnalytics); Reorder: Manual targets, Automation settings, Monitor |
|  Reports | 0 / 2 |  | Reports & Analytics page (six reports, export); Pharmacy Report menu (GST, margin, expiring stock) |
|  Admin | 7 / 10 | STORY-063, STORY-064, STORY-065, STORY-066, STORY-067, STORY-068, STORY-069 | Users: edit / delete user; Users: Role & Permissions; Test Transcribe page |

### Feature-level detail

| Area | Feature | Stories | Note |
|------|---------|---------|------|
| Sign-in, shell, cross-cutting UI | Login (phone or email + password) | STORY-070, STORY-071, STORY-075, STORY-076, STORY-077 |  |
| Sign-in, shell, cross-cutting UI | Reset-code page (redeem a code) | STORY-076 |  |
| Sign-in, shell, cross-cutting UI | `?next=` return to the exact page after login | STORY-070, STORY-071 |  |
| Sign-in, shell, cross-cutting UI | Branded switch (login page and header) | NOT COVERED | only noted as absent on a phone (SN-06); never switched on or off |
| Sign-in, shell, cross-cutting UI | Header global search | STORY-007, STORY-077 |  |
| Sign-in, shell, cross-cutting UI | Notifications bell | STORY-072, STORY-077 |  |
| Sign-in, shell, cross-cutting UI | My Settings dialog (signature, letterhead, availability, WhatsApp switch) | STORY-064, STORY-069 |  |
| Sign-in, shell, cross-cutting UI | Log out | STORY-073, STORY-075, STORY-077 |  |
| Sign-in, shell, cross-cutting UI | Phone-width drawer menu | STORY-075 |  |
| Sign-in, shell, cross-cutting UI | Role-filtered menu and permission-denied states | STORY-074, STORY-075, STORY-077 |  |
| Sign-in, shell, cross-cutting UI | Quick Guide dialogs and tours | NOT COVERED | no story opens a Quick Guide or starts a tour (FD-08 and FD-01 only mention them) |
| Dashboard | Doctor panels: Recent Visits and My Patients | STORY-017, STORY-038 |  |
| Dashboard | Stat cards (Total Users, Active Users, Total Branches, System Status) | NOT COVERED | never exercised |
| Dashboard | Admin Controls: Create Backup | STORY-077 |  |
| Dashboard | System Alerts card | STORY-077 |  |
| Dashboard | Today's Appointments card | STORY-074 |  |
| Appointments | Calendar tab: book into a free time | STORY-001, STORY-004, STORY-007, STORY-008 |  |
| Appointments | Slots tab (AppointmentScheduler) | NOT COVERED | listed only as an alternate path; no story walks it |
| Appointments | Confirm / Move to Scheduled | STORY-002, STORY-008 | Move to Scheduled (the reverse) not walked |
| Appointments | Cancel appointment | STORY-003, STORY-008 |  |
| Appointments | Reschedule | STORY-006, STORY-008 |  |
| Appointments | Overbook prompt | STORY-006 |  |
| Appointments | In-line Add New Patient dialog | STORY-004 |  |
| Appointments | Deep link `?patientId=` (Book appointment from patient) | STORY-007 |  |
| Appointments | Appointment Details dialog | STORY-002, STORY-003, STORY-006 |  |
| Appointments | Calendar filters (Visit Type, Room, Grid, patient search) | NOT COVERED | filters never changed in any story |
| Appointments | Google Calendar sync | NOT COVERED | OAuth flow not walked |
| Appointments | Walk-in auto-book from Create Patient | STORY-005, STORY-008, STORY-039 |  |
| Visits and prescriptions | Start a visit from the calendar (START / Start Visit) | STORY-009, STORY-013 |  |
| Visits and prescriptions | Visits setup screen (Select Patient, Select Doctor, Start Visit Documentation) | NOT COVERED | only listed as an alternate path in DV-01 |
| Visits and prescriptions | Vitals tab | STORY-010, STORY-013 |  |
| Visits and prescriptions | Photos on a visit (upload, tag positions) | STORY-013, STORY-014 |  |
| Visits and prescriptions | Prescription builder (complaints, diagnosis, medicine rows) | STORY-011, STORY-013 |  |
| Visits and prescriptions | Prescription templates, Undo/Redo, custom sections | NOT COVERED | templates appear only as an alternate in DV-03 |
| Visits and prescriptions | Voice dictation | NOT COVERED | no story |
| Visits and prescriptions | Lab Tests (manual entry, photo autofill, compare) | STORY-013, STORY-015 | autofill and compare are alternates only |
| Visits and prescriptions | Customization tab (print letterhead, offsets) | NOT COVERED | no story |
| Visits and prescriptions | Visit history views (form History tab, Patient History) | STORY-038, STORY-040 |  |
| Visits and prescriptions | Print Preview, Print, Download PDF | STORY-012, STORY-013 |  |
| Visits and prescriptions | Prescription Email and PDF via WhatsApp | STORY-016 |  |
| Visits and prescriptions | Interaction Summary dialog | NOT COVERED | no story |
| Visits and prescriptions | Save Draft and Complete Visit | STORY-013, STORY-017 |  |
| Visits and prescriptions | Go to Pharmacy hand-off | STORY-011 |  |
| Visits and prescriptions | Resume an open visit | STORY-017, STORY-040, STORY-071 |  |
| Visits and prescriptions | Add Drug to Database from the builder | NOT COVERED | no story |
| Patients | Patient list search and filters | STORY-036, STORY-042, STORY-075 |  |
| Patients | Create Patient (non walk-in) | STORY-037, STORY-039 |  |
| Patients | Edit Patient | STORY-039 | typo fix only |
| Patients | Archive patient | STORY-043 |  |
| Patients | Export CSV | STORY-042 |  |
| Patients | Link / unlink portal access | STORY-044 | Unlink not walked |
| Patients | Patient row WhatsApp action | NOT COVERED | menu item only seen, never used |
| Patients | Patient detail tabs Info, History, Uploads | STORY-038, STORY-040, STORY-041 |  |
| Patients | PatientProgressTracker (Continue, Book, View, Bill) | NOT COVERED | no story clicks the tracker (alternates only) |
| Pharmacy Desk and Counter | Pharmacy Desk page and its Invoices / Drugs entry buttons | STORY-026 | metric strips only read |
| Pharmacy Desk and Counter | AI pharmacy assistant dock | NOT COVERED | seen in PC-09, never used |
| Pharmacy Desk and Counter | Partner daily sync (Manual Daily Entry) | NOT COVERED | seen in PC-09, never used |
| Pharmacy Desk and Counter | Treatment Packages (create, browse) | NOT COVERED | seen in PC-09, never used |
| Pharmacy Desk and Counter | Counter cockpit (Queue, Active Dispense, Pick + Pay) | STORY-018, STORY-025 |  |
| Pharmacy Desk and Counter | Prescription Queue section | STORY-018, STORY-025 |  |
| Pharmacy Desk and Counter | Pharmacy Invoices page | STORY-026 |  |
| Pharmacy Desk and Counter | Drug Database page | NOT COVERED | no story |
| Sales billing | Sales register search and filters | STORY-020, STORY-021, STORY-023 |  |
| Sales billing | New bill from a prescription | STORY-018, STORY-025 |  |
| Sales billing | Walk-in / OTC bill | STORY-019, STORY-022 |  |
| Sales billing | Save draft / Discard draft | STORY-021, STORY-022 |  |
| Sales billing | Print Preview, Confirm & Print, Download PDF | STORY-018, STORY-019, STORY-025 |  |
| Sales billing | Edit discount after the bill is final | STORY-023, STORY-025 |  |
| Sales billing | Record refund | STORY-023, STORY-024 |  |
| Sales billing | Returns tab / New return | STORY-024 |  |
| Clinic fee billing and Daily Collection | Fee list | STORY-030, STORY-034, STORY-035 |  |
| Clinic fee billing and Daily Collection | Create bill / Record payment at the appointment | STORY-027, STORY-028, STORY-029, STORY-030, STORY-031, STORY-035 |  |
| Clinic fee billing and Daily Collection | Daily Collection (view and cash count) | STORY-032, STORY-033, STORY-035, STORY-077 |  |
| Inventory | Inventory Today queue | STORY-045, STORY-050 |  |
| Inventory | Stock list search and item page | STORY-046, STORY-048, STORY-049 |  |
| Inventory | Add Inventory Item (with approval) | STORY-051 |  |
| Inventory | Stock price edit proposal | STORY-049 |  |
| Inventory | Approve corrections (Price / stock, New items) | STORY-050, STORY-053 |  |
| Inventory | Stock counts and sign-off | STORY-047, STORY-053 |  |
| Inventory | Loss & breakage | STORY-048 |  |
| Inventory | Corrections and Stock ledger | STORY-052, STORY-053 |  |
| Inventory | Blocked stock | NOT COVERED | button seen on the item page in ID-04, never used |
| Inventory | Manual opening stock / Opening stock import | NOT COVERED | alternates only |
| Inventory | Stock optimization | NOT COVERED | alternate only |
| Inventory | Inventory Sales area (Counter sales, Quotations, Customer returns, Patient invoice history) | NOT COVERED | alternates only (PC-02, PC-07, PC-09) |
| Inventory | Purchase bills list and Mark paid | STORY-055, STORY-056 |  |
| Inventory | Scan or enter bill (OCR review, Add stock / Post bill) | STORY-054, STORY-057, STORY-061 |  |
| Inventory | Import CSV / Gmail intake | NOT COVERED | alternates only |
| Inventory | Suppliers workspace | STORY-062 |  |
| Inventory | Terms of Trade | NOT COVERED | alternate only |
| Inventory | Payments & dues ledger | STORY-056, STORY-061 |  |
| Inventory | Credits & vouchers (credit note, set off) | STORY-059 |  |
| Inventory | Supplier returns (Purchase bills > Returns) | STORY-058 |  |
| Inventory | Inward challans (receive against an order) | STORY-061 |  |
| Inventory | Gate passes | NOT COVERED | no story |
| Inventory | Purchase costs (DistributorAnalytics) | NOT COVERED | alternate only (PO-03) |
| Inventory | Reorder: Shortbook | STORY-060, STORY-061 |  |
| Inventory | Reorder: Purchase orders | STORY-060, STORY-061 |  |
| Inventory | Reorder: Target proposals | STORY-061 |  |
| Inventory | Reorder: Manual targets, Automation settings, Monitor | NOT COVERED | alternates only |
|  Reports | Reports & Analytics page (six reports, export) | NOT COVERED | no story; whole Reports topic (discovery topic 8) was not assigned a story file |
|  Reports | Pharmacy Report menu (GST, margin, expiring stock) | NOT COVERED | only the sidebar entry is listed in SN-09; no report opened |
|  Admin | Users: create user | STORY-066, STORY-069 |  |
|  Admin | Users: edit / delete user | NOT COVERED | buttons seen, never used |
|  Admin | Users: Reset password (issue code) | STORY-065 |  |
|  Admin | Users: Working Hours (shifts, leave, overbooking) | STORY-064, STORY-067, STORY-069 |  |
|  Admin | Users: Role & Permissions | NOT COVERED | no story |
|  Admin | Users: Doctor WhatsApp Settings | STORY-069 | template editor (Manage, AI generate, Send Test) not walked |
|  Admin | Clinic Holidays | STORY-069 |  |
|  Admin | Rooms: Calendar View and Manage Rooms | STORY-068 |  |
|  Admin | Procedures page (New Procedure, Procedure History) | STORY-063 | Analytics tab is a placeholder |
|  Admin | Test Transcribe page | NOT COVERED | only listed in the menu (SN-09) |

### Topic coverage against the recommended topic list

Discovery recommended 10 topics. Nine have a story file. Topic 8 (Reports and analytics: dashboard alerts, Reports & Analytics page, Pharmacy Report menu, exports) has no topic file, so its screens appear only in passing (STORY-032, STORY-033, STORY-077). The optional spill-over (pharmacy AI assistant, partner daily sync, voice dictation, test page) was not written either.

## Story Dependency Graph

The graph shows which stories should run first. "Needs" means the later story reads data or state the earlier story creates (a registered patient, a booked appointment, a posted bill, an issued code). Stories not listed under a parent only need a signed-in user of the right role and the seeded clinic data.

```text
STORY-070 (Receptionist signs in)  -- every staff story starts signed in; also STORY-071, STORY-073, STORY-075
├── Admin and access
│   ├── STORY-065 (Admin issues a reset code)
│   │   └── STORY-076 (Staff member redeems the reset code, signs in again)
│   ├── STORY-066 (Admin adds a receptionist)  -> new user can run STORY-070
│   ├── STORY-067 (Doctor weekly hours and overbooking)
│   │   ├── STORY-064 (Doctor blocks a day as leave)  -> changes what STORY-001 can book
│   │   └── STORY-006 (Reschedule with overbook prompt)
│   ├── STORY-068 (Add and retire a procedure room)  -> rooms offered in STORY-001 dialog and STORY-063
│   └── STORY-069 (Owner onboards a dermatologist end to end; covers STORY-066, STORY-067, STORY-068, STORY-034)
├── Setting fees
│   └── STORY-034 (Change a fee on the Fee list; merged with the Review-fee story)
│       └── STORY-027 (Bill a first consultation, cash)  needs a booked appointment (STORY-001)
│           ├── STORY-028 (Collect part of a balance by UPI)
│           ├── STORY-029 (Procedure bill, no fee set, part by cheque)
│           ├── STORY-030 (Concession by editing the fee)
│           ├── STORY-031 (Extra bill on the same visit, pay later)
│           ├── STORY-032 (Owner checks the day's takings)
│           │   └── STORY-033 (Count the pharmacy drawer)
│           └── STORY-035 (Clinic morning to closing; long, repeats the above)
├── Front desk
│   ├── STORY-037 (Register a new patient)
│   │   ├── STORY-043 (Archive a duplicate record)  needs two records
│   │   └── STORY-044 (Link to a portal account)
│   ├── STORY-036 (Find a returning patient by phone)
│   │   └── STORY-007 (Header search, then book from the patient page)
│   ├── STORY-004 (New caller: register in-line and book ahead)
│   ├── STORY-005 (Walk-in: register and auto-book)
│   ├── STORY-001 (Book a returning patient, Confirmed)
│   │   ├── STORY-002 (Confirm after the call)  needs a Scheduled booking
│   │   ├── STORY-003 (Cancel)
│   │   ├── STORY-006 (Move to another day)
│   │   └── STORY-008 (A morning at the desk; long, repeats STORY-001 to STORY-006)
│   └── STORY-039 (Walk-in from empty search to first visit; long)
├── Doctor's visit
│   └── STORY-009 (Open the next confirmed patient)  needs a Confirmed appointment
│       ├── STORY-010 (Record vitals)
│       ├── STORY-014 (Attach a lesion photo)
│       ├── STORY-015 (Enter lab results)
│       ├── STORY-011 (Write the prescription)
│       │   ├── STORY-012 (Preview and print)
│       │   │   └── STORY-016 (Send on WhatsApp or email)
│       │   └── STORY-018 (Bill the waiting prescription at the pharmacy counter)
│       │       ├── STORY-020 (Reprint a lost bill)
│       │       ├── STORY-023 (Goodwill discount, then refund the difference)
│       │       ├── STORY-024 (Take back an unopened pack, refund)
│       │       ├── STORY-026 (Find a past invoice, download PDF)
│       │       └── STORY-025 (Full counter shift; long, includes STORY-018)
│       ├── STORY-017 (Reopen from the dashboard and finish)  needs an unfinished visit
│       ├── STORY-013 (Full consultation, long; includes STORY-009 to STORY-012)
│       ├── STORY-038 (Check the last visit's diagnosis)  needs a finished visit
│       ├── STORY-040 (Find an August prescription with History filters)
│       ├── STORY-041 (Nurse uploads before/after photos)
│       └── STORY-072 (Jump to the next patient from the bell)
├── Doctor-run procedures
│   └── STORY-063 (Laser session log for a returning patient)  needs a registered patient
├── Pharmacy counter without a prescription
│   ├── STORY-019 (Walk-in OTC sale)
│   └── STORY-022 (Save a draft, finish later)
│       └── STORY-021 (Discard an abandoned draft)
├── Inventory
│   ├── STORY-045 (Open Inventory, act on Low stock)
│   ├── STORY-046 (Check stock and expiry)  needs stock added by STORY-054 or STORY-057
│   ├── STORY-051 (Request a new item)
│   │   └── STORY-050 (Doctor clears the approval queue)  needs STORY-051 and STORY-049
│   ├── STORY-049 (Propose a new selling price)
│   ├── STORY-048 (Record a loss)
│   ├── STORY-052 (Correct a wrongly keyed movement)
│   ├── STORY-047 (Cycle count and sign-off)
│   └── STORY-053 (Shelf short: spot count, approval, ledger; long)  needs STORY-047 concepts
├── Purchases and reorder
│   ├── STORY-062 (Add a supplier)
│   │   ├── STORY-054 (Scan a supplier bill, add stock)
│   │   └── STORY-057 (Type a bill by hand, new product)
│   │       ├── STORY-056 (Find a distributor's bills, see what is owed)
│   │       ├── STORY-055 (Mark a bill paid)
│   │       └── STORY-058 (Return expired stock to the supplier)
│   │           └── STORY-059 (Record the credit note)
│   └── STORY-060 (Shortbook request to an approved purchase order)
│       └── STORY-061 (Weekly reorder cycle: receive, post bill, pay; long, includes STORY-060 and STORY-055)
├── Reports and records
│   ├── STORY-042 (Owner exports the month's patients)
│   └── STORY-077 (Owner's morning round; long)  best run after the day's stories above
└── Role orientation
    └── STORY-074 (Receptionist orients herself: menu and denied pages)
```

Suggested run order for a full pass: STORY-070, STORY-065, STORY-076, STORY-069, STORY-034, STORY-037, STORY-001, STORY-002, STORY-009, STORY-011, STORY-018, STORY-027, then the remaining stories of each branch, and last STORY-032, STORY-033, STORY-077, STORY-073.

## All Stories

### Front desk: find or register a patient, book, confirm, reschedule, cancel

### STORY-001: Book a returning patient into today's Confirmed calendar  [orig FRONT-DESK-01]

**Type**: short
**Topic**: Front desk: find or register a patient, book, confirm, reschedule, cancel
**Persona**: Kavitha Reddy, receptionist, answering the desk phone at 10:40
**Goal**: Mrs. Lakshmi Narayanan (already registered, phone 9848012345) is on the phone and wants a consultation with Dr. Kulkarni at 11:30 today. Book it as confirmed.
**Preconditions**: Logged in as RECEPTION, on `/dashboard/appointments` (Calendar tab). Patient exists. The 11:30 tile in the Confirmed column is free.
**Ideal path**: 3 (type the name, pick the match, pick the time). A plain OPD booking needs no further input: doctor, date, type and duration all have sensible defaults, so the "Book Appointment" dialog could be skipped and shown only when something needs choosing.
**Alternate paths**:
- Tab "Slots" on the same page: `AppointmentScheduler` has its own patient search and renders the same `DoctorDayCalendar`, same booking dialog (same steps, but see the Procedure Name edge case below).
- Patient detail page (`/dashboard/patients/[id]`) button "Book appointment" jumps to `/dashboard/appointments?patientId=` with the patient pre-selected (see STORY-007 (FRONT-DESK-07)).
- Patients > "New Patient" with Patient Type "Walk-in" auto-books the next free Confirmed slot (only for new patient registration, STORY-005 (FRONT-DESK-05); it cannot pick a time).

### Steps
1. Type "Lakshmi" in the Patient field (placeholder "Search patient by name/phone") (required to book; no minimum length, a request is sent on every keystroke) → a dropdown lists up to 10 matches as "Lakshmi Narayanan — 9848012345".
2. Click the "Lakshmi Narayanan — 9848012345" row → the search box now reads that text, a badge "Selected: Lakshmi Narayanan — 9848012345" and a "Clear" button appear; the free time tiles become clickable (before this a click on a tile shows toast "Patient required").
3. Click the free 11:30 tile in the Confirmed column (Doctor: default last used doctor, app already knows this; Date: default today) → dialog "Book Appointment" opens with Patient, Phone, Date, Time Slot shown again (app already knows this), "Duration" (default: length of the clicked span, 30 minutes at the default grid), "Appointment Type *" (default: OPD Consultation), room cards (optional, none selected).
4. Click "Confirm Booking" → dialog closes, green banner "Appointment Successfully Booked!" with "Lakshmi Narayanan scheduled for 11:30-12:00 in the Confirmed calendar (OPD)" for 5 seconds, the row appears in the Confirmed column with token number and a bill chip "Not billed".

### Variations
- Patient is not found: see STORY-004 (FRONT-DESK-04).
- Click the Scheduled column instead: books into the Scheduled calendar (status Scheduled, "call to confirm"), same steps.
- Drag across several tiles before releasing to choose a custom span (dialog Duration then follows the span).
- Doctor on leave or time off: the page shows a red strip "Not bookable: ..." and the dialog shows an alert and disables "Confirm Booking".
- Slot outside doctor hours: amber warning in the dialog, booking still allowed.
- Slot already holds as many patients as the doctor's overbooking limit allows: the tile shows "Overbook n/m" and the server answers 409, which opens the dialog "Overbook this slot?" (see STORY-006 (FRONT-DESK-06)).

### Edge Cases
- Clicking a tile with no patient selected: toast "Patient required: Search and select a patient before booking a slot." (tile click) and the tiles show a not-allowed cursor.
- Typing in the Patient box again after selecting clears the selection (the badge disappears) and the tiles lock again.
- Same information appears four times: the search box text, the "Selected:" badge, the dialog header block (Patient/Phone/Date/Time Slot) and the success banner. The Scheduled/Confirmed explanation appears three times: the column headers, the "Legend" card and the "Quick Guide" dialog.
- Searching by the last digits of a phone number finds nothing: the server matches phone with "starts with" only.
- Past tiles on today's calendar cannot be clicked at all.
- A booking sends a WhatsApp confirmation only if the doctor turned on "Send WhatsApp on appointment creation" in "My Settings"; the receptionist sees no sign either way.

---

### STORY-002: Confirm a patient after the call  [orig FRONT-DESK-02]

**Type**: short
**Topic**: Front desk: find or register a patient, book, confirm, reschedule, cancel
**Persona**: Kavitha Reddy, receptionist, doing the morning confirmation calls
**Goal**: Anita Reddy (booked ahead for 10:00 today) confirmed on the phone. Move her to the Confirmed calendar.
**Preconditions**: Anita Reddy's row is in the Scheduled column at 10:00-10:30 on the selected date. The same time in the Confirmed column has room.
**Ideal path**: 1 (one Confirm control on the row itself). The row already shows everything needed; the call result is a single yes.
**Alternate paths**:
- Row hover buttons "INFO", "RESCHED", "START" do not include Confirm, so Confirm is reachable only inside "Appointment Details".
- "RESCHED" then clicking a free tile in the Confirmed column also moves the patient to the Confirmed calendar (and may change the time), see STORY-006 (FRONT-DESK-06).
- Tab "Slots" shows the same calendar and the same dialog.

### Steps
1. Click Anita Reddy's row (the button whose label reads like "Token 3, Anita Reddy, 10:00-10:30, Scheduled") → dialog "Appointment Details": Date (shown as 2026-11-13, unformatted), Slot, Calendar "Scheduled", Patient, Phone (a `tel:` link), Age, Sex, Bill type, Bill ("Not billed" with button "Create bill" if the role can create bills), Type, Room, Status "SCHEDULED". Footer: "Close", "Start Visit", "Reschedule", "Cancel Appointment" and the primary button "Confirm".
2. Click "Confirm" → no confirmation dialog; toast "Appointment confirmed: Anita Reddy is now at 10:00-10:30 in Confirmed."; the row jumps to the Confirmed column with the same time; status becomes CONFIRMED.

### Variations
- Same time already taken in Confirmed (and no overbooking room): the details dialog closes and the calendar enters move mode: banner "Moving Anita Reddy to Confirmed" with "10:00-10:30 is taken in Confirmed. Click a free time in the Confirmed calendar, or change the date to pick another day." plus a "Cancel" button. One more click on a free Confirmed tile completes it (this is the confirmation-with-conflict path used in STORY-008 (FRONT-DESK-08)).
- Undo a mistaken confirm: open the row again and press "Move to Scheduled" (the button changes label to that when status is CONFIRMED).
- Patient did not pick up: nothing to do; there is no "No answer" or "Called" mark, the row looks the same afterwards.

### Edge Cases
- The details dialog repeats facts already on the row (time, name, age, sex, type, room, status): the row shows them inline at wide widths.
- "Start Visit" is the first button in the dialog and is shown to RECEPTION even though the Visits menu entry is hidden for that role.
- Opening the dialog on an in-progress or completed row: no "Confirm" or "Reschedule" button (only appointments with status Scheduled or Confirmed can move).
- The phone number is a `tel:` link: on a desktop without a softphone it does nothing useful; the receptionist reads it off the screen.

---

### STORY-003: Cancel an appointment the patient no longer needs  [orig FRONT-DESK-03]

**Type**: short
**Topic**: Front desk: find or register a patient, book, confirm, reschedule, cancel
**Persona**: Kavitha Reddy, receptionist
**Goal**: Neha Gupta phoned to cancel her 12:30 appointment today. Remove it from the day.
**Preconditions**: Neha Gupta's row is visible on the selected date and doctor; status Scheduled or Confirmed.
**Ideal path**: 2 (one Cancel control on the row, one confirmation because it cannot be undone).
**Alternate paths**: none found. The patient detail page has no cancel; the header search lists appointments but only opens `/dashboard/appointments`; the Slots tab uses the same dialog. (The API also has `PATCH /appointments/:id` and a bulk update for ADMIN only, with no UI.)

### Steps
1. Click Neha Gupta's row → dialog "Appointment Details" (same content as STORY-002 (FRONT-DESK-02)).
2. Click the red button "Cancel Appointment" → the details dialog closes and dialog "Cancel Appointment" opens: text "Are you sure you want to cancel this appointment? This action cannot be undone." with Patient, Date (raw 2026-11-13), Time and Type. This dialog guards the irreversible cancel (no restore button exists anywhere).
3. Click "Yes, Cancel Appointment" → toast "Appointment Cancelled: The appointment has been successfully cancelled."; row disappears from the calendar (cancelled appointments are filtered out and there is no list of them).

### Variations
- Click "Keep Appointment" → dialog closes, nothing changes.
- Appointment already started: server refuses with "Cannot cancel appointment in progress" (or "Cannot cancel completed appointment"); the receptionist sees a toast "Failed to cancel appointment".
- Cancel from the Slots tab: identical.

### Edge Cases
- No reason is asked for, no patient message is sent, and there is no waitlist or "slot freed" prompt; the slot just becomes a free tile.
- A NURSE sees the same red button but the server only allows ADMIN and RECEPTION (OWNER and DOCTOR pass every role list), so a nurse gets a failure toast after confirming.
- The cancel dialog shows the date as raw ISO text, while the booking success text and toasts use "13 Nov 2026" style.
- A cancelled appointment with a bill: nothing in this flow checks for or warns about a recorded payment.
- Google Calendar event is removed silently in the background if synced.

---

### STORY-004: New caller who is not in the system: register in-line and book ahead  [orig FRONT-DESK-04]

**Type**: medium
**Topic**: Front desk: find or register a patient, book, confirm, reschedule, cancel
**Persona**: Kavitha Reddy, receptionist, taking a first-time call
**Goal**: Meera Venkatesh (34, new, phone 9849012345) wants to see Dr. Kulkarni tomorrow afternoon for a pigmentation concern. Create her record and put her in the Scheduled calendar for the confirmation call.
**Preconditions**: On `/dashboard/appointments`. Nobody named Meera Venkatesh exists. A free slot tomorrow at 15:00 in the Scheduled column.
**Ideal path**: 5 (date, name, phone, pick the time, confirm: patient creation and booking happen as one action with only name and phone as required input).
**Alternate paths**:
- Patients > "New Patient" > "Create Patient" with Patient Type "Walk-in" registers and auto-books, but only the next free Confirmed slot (not a chosen time or the Scheduled calendar): STORY-005 (FRONT-DESK-05).
- Patients > "New Patient" with Patient Type "Non walk-in" registers only, then go to Appointments and repeat STORY-001 (FRONT-DESK-01) (longer).
- The Slots tab has the same patient search and the same "Add New Patient" dialog.
- Two dialogs create patients: "Add New Patient" (quick) and "Create Patient" (full, on Patients). They have different field sets and validation.

### Steps
1. Set the Date field (label "Date", type date; default: today) to tomorrow, 14 Nov 2026 → both columns reload for that day (a free Scheduled tile at 15:00 is visible).
2. Type "Meera Venkatesh" in the Patient field (required to book) → each keystroke triggers a search; once a keystroke returns zero matches, dialog "Add New Patient" opens by itself ("Capture minimal details to create a patient record without leaving the scheduling flow."); a strip also shows "No matching patients found." with the button `+ Add "Meera Venkatesh" as a new patient` as a second route to the same dialog. First Name "Meera" and Last Name "Venkatesh" arrive prefilled (app already knows this, typed one step ago). Note: the dialog can pop up while the name is still being typed (for example after "Meer"), and the prefill then holds the partial text.
3. Select "Gender *" = Female in the dialog (required field, default: Other; the field is marked required yet cannot be empty).
4. Type "9849012345" in "Phone *" (required field; placeholder reads "Phone number (e.g., +1234567890 or 9876543210)", no format check).
5. Type "34" in "Age (years)" (optional; placeholder "e.g. 35").
   (Not acted on: "Email" optional, "ABHA ID" optional, "Consultation Type" default: Offline (In-Clinic Visit), "Last Name" optional.)
6. Click "Create Patient" → toast "Patient created: Meera Venkatesh has been added"; dialog closes; the badge "Selected: Meera Venkatesh — 9849012345" appears (the patient is auto-selected).
7. Click the free 15:00 tile in the Scheduled column → dialog "Book Appointment" (Patient and Phone already shown, app already knows this; Duration default: span length; "Appointment Type *" default OPD Consultation).
8. Click "Confirm Booking" → banner "Appointment Successfully Booked!" "Meera Venkatesh scheduled for 15:00-15:30 in the Scheduled calendar (OPD)"; row appears in Scheduled with a "Not billed" chip.

### Variations
- Receptionist types the name and phone together ("Meera Venkatesh 9849012345"): nothing matches, the dialog opens, and the prefill puts "Meera" in First Name and "Venkatesh 9849012345" in Last Name (the dialog only splits name and phone when they are separated by an em dash "—"), so Phone stays empty.
- Cancel the "Add New Patient" dialog: the search box is cleared.
- Phone missing: toast "Missing information: Phone number is required".
- The same phone already belongs to a patient (for example a mother booking for a child): the backend has no duplicate check; a second record is created.
- Book into the Confirmed column (patient confirmed on the same call): same steps; entry status Confirmed.
- Procedure appointment: set "Appointment Type *" to Procedure in the dialog (see STORY-006 (FRONT-DESK-06) edge cases for the room rule).

### Edge Cases
- Typing a name that has near matches shows the matches; the receptionist must clear the box to reach a path that adds a new patient (the "+ Add" strip only appears for zero matches).
- The quick dialog sends no address, emergency contact, referral source or primary doctor; the patient list later shows these as empty, so Patients > "Edit" is a follow-up that nothing prompts.
- Closing the quick dialog by Escape while no patient is selected clears the search box, losing the typed name.
- Information repeated: name and phone typed once in search and once in the dialog (prefilled for the name only), then displayed in the badge and again in the booking dialog.

---

### STORY-005: Register a walk-in patient and book the next free slot  [orig FRONT-DESK-05]

**Type**: medium
**Topic**: Front desk: find or register a patient, book, confirm, reschedule, cancel
**Persona**: Kavitha Reddy, receptionist, with a new patient standing at the desk
**Goal**: Imran Sheikh (29, male, 9701234567) walked in with acne. Register him and put him in the first available consultation slot with Dr. Kulkarni.
**Preconditions**: On `/dashboard/patients` (sidebar "Patients"). Dr. Kulkarni has at least one free Confirmed slot in the next 8 days.
**Ideal path**: 4 (name, phone, doctor, one "Register and book" click). Walk-in is the common case at a clinic; nothing else is needed to produce a record and a queue place.
**Alternate paths**:
- Appointments page: type the name, accept "Add New Patient", then click a Confirmed tile and "Confirm Booking" (STORY-004 (FRONT-DESK-04) steps; 7 steps, but the receptionist picks the time).
- Create with Patient Type "Non walk-in", then book from the Appointments page (STORY-001 (FRONT-DESK-01)).
- Patient detail "Book appointment" after creation.

### Steps
1. Click the button "New Patient" (top right of the page) → dialog "Create Patient" (a long form; none of its labels carries a required marker).
2. Type "Imran" in "First Name" (required field; blank gives error "Please fill in all required fields (Name, Phone)").
3. Type "Sheikh" in "Last Name" (optional).
4. Type "29" in "Age (years)" (optional).
5. Select "Gender" = Male (required field, default: Other).
6. Type "9701234567" in "Phone" (required field).
   (Not acted on: "ABHA ID (Ayushman Bharat Health Account)" optional, must be 14 digits if given; "Email", "Address", "Emergency Contact" optional; "Consultation Type" default: Offline (In-Clinic Visit); "Primary Doctor" default: Automatic, with the hint that a doctor registering the patient becomes primary and otherwise the first visiting doctor does; "How did the patient hear about us?" optional.)
7. Select "Patient Type" = Walk-in (default: Non walk-in) → two more fields appear: "Appointment Type (walk-in)" (default: OPD Consultation) and "Room (optional for OPD)".
8. Select "Doctor (for walk-in)" = "Dr. Ramesh Kulkarni" (no default, although the Appointments page remembers the last doctor; if this is left empty nothing is booked even with Walk-in chosen; the hint says "If Patient Type is Walk-in and a doctor is selected, the next available slot will be automatically booked after saving").
9. Click "Create" → patient is saved, then the app searches today and the next 7 days for 30-minute Confirmed slots and books the first one; toast "Walk-in appointment booked: Booked into the Confirmed calendar for 13 Nov 2026 at 14:00"; the dialog closes and the patient list refreshes. The receptionist is left on the Patients list, not at the booked slot.

### Variations
- Time not important to the patient: that is this story. If the patient wants a specific time, use STORY-004 (FRONT-DESK-04) instead (the walk-in route cannot choose).
- No slot within 7 days: toast "No slots available: No available consultation slots found in the next 7 days for the selected doctor." The patient is already saved.
- First slot is full to the overbooking limit: the dialog "Overbook this slot?" appears; "Cancel" leaves the patient saved with toast "Walk-in not booked: <slot> on <date> was taken and you chose not to overbook it."
- Room selected: slots are filtered to those where the room is free.
- ABHA ID typed with fewer than 14 digits: error banner "ABHA ID must be a 14-digit number".

### Edge Cases
- The patient is created before the booking runs; if booking fails, the receptionist must notice the toast and go to Appointments by hand.
- Two doctor fields in one dialog with different meanings: "Primary Doctor" (default Automatic) and "Doctor (for walk-in)".
- The booking is stored with source WALK_IN and note "Auto-booked next available slot for walk-in"; the calendar row does not show it is a walk-in.
- The patient name, phone and age are typed here exactly as in the quick dialog of STORY-004 (FRONT-DESK-04): two different forms for the same record, with different required markers ("Add New Patient" marks First Name, Gender and Phone with `*`; "Create Patient" marks nothing).
- The dialog title for edit is "Edit Patient" and the same form is reused, but the walk-in booking fields are reset to Non walk-in on edit.

---

### STORY-006: Move a patient's appointment to another day, with an overbook prompt  [orig FRONT-DESK-06]

**Type**: medium
**Topic**: Front desk: find or register a patient, book, confirm, reschedule, cancel
**Persona**: Kavitha Reddy, receptionist
**Goal**: Karthik Rao (booked Monday 16 Nov at 17:00, Confirmed, room Consultation 1) cannot come and asks for Wednesday 18 Nov at 17:00. That slot already has one patient and Dr. Kulkarni allows 2 per slot.
**Preconditions**: Doctor Dr. Kulkarni selected; his overbooking limit is set to 2 (Users > "Working Hours" > overbooking). Karthik's row exists on 16 Nov.
**Ideal path**: 4 (open the appointment, "Reschedule", pick the new date and time, accept the overbook warning). Without the overbook case it is 3.
**Alternate paths**:
- Row hover button "RESCHED" (only appears on hover or focus, and only at row widths of 16rem and up) instead of opening the details dialog; same outcome, saves one click: open (hover) then click "RESCHED".
- "Appointment Details" > "Reschedule" (used here).
- Tab "Slots": the same `DoctorDayCalendar` (so the same two routes). `AppointmentScheduler` also contains its own reschedule code (`startReschedule`, `handleRescheduleSlotSelect`) that nothing renders or calls, so it is dead; there is one live reschedule mechanism.
- Cancel the old booking and book a new one (STORY-003 (FRONT-DESK-03) then STORY-001 (FRONT-DESK-01)): longer, loses the token number and the bill chip.

### Steps
1. Set the Date field to Monday 16 Nov 2026 (default: today) → Karthik Rao's row shows in the Confirmed column at 17:00-17:30.
2. Click Karthik Rao's row → dialog "Appointment Details".
3. Click "Reschedule" → dialog closes; amber banner "Rescheduling Karthik Rao" with the hint "Click a free time in either calendar. To move to another day, change the date first." and a "Cancel" button.
4. Set the Date field to Wednesday 18 Nov 2026 → calendar reloads; the banner now reads "Click a free time in either calendar to move this appointment from 16 Nov 2026 to 18 Nov 2026." (the move mode survives a date change, but ends if the Doctor select changes).
5. Click the 17:00 tile in the Confirmed column (it shows the badge "Overbook 1/2") → the app sends the move; the server answers 409 with an overbook offer; dialog "Overbook this slot?" opens: "This slot already has 1 patient. Book anyway? (2 of 2 allowed)". This dialog guards the doctor's per-slot limit.
6. Click "Book anyway" → toast "Appointment rescheduled: Karthik Rao is now on 18 Nov 2026 at 17:00-17:30 in Confirmed." The room (Consultation 1) is carried over without being asked about.

### Variations
- Click "Cancel" in the overbook dialog: nothing changes; the move banner stays so another tile can be clicked.
- Click "Cancel" on the amber banner: ends the move with no message.
- Click a tile in the Scheduled column instead: the appointment moves to the Scheduled calendar and its status goes back to SCHEDULED (toast "Moved to Scheduled"), a silent downgrade for a patient who had already confirmed.
- The room is busy at the new time: the server returns a conflict and the toast "Failed to reschedule" shows the message; room cannot be changed during a move.
- Date changed to a day the doctor is off: the red "Not bookable" strip shows and the server refuses.
- Appointment is in progress or completed: no "Reschedule" button.

### Edge Cases
- The token number is reissued when the date changes and kept when the day stays the same.
- During the move the patient search and the dialogs are not needed, but the booking tiles show "Move to HH:MM" instead of "Book".
- The Appointment Type "Procedure" booking dialog requires a room (`Please select a room for the procedure`; the "Confirm Booking" button stays disabled until one is clicked); reschedule never asks again.
- In the Slots tab, the "Procedure Name" typed into the "Book Appointment" dialog is not sent (the Slots tab's booking handler drops the `notes` value, while the Calendar tab sends it), so a procedure booked from Slots shows no name on the row.
- Same information on four surfaces: the old and new date appear in the banner, the Date field, the toast and the row.

---

### STORY-007: Find a patient with the header search, then book from the patient page  [orig FRONT-DESK-07]

**Type**: medium
**Topic**: Front desk: find or register a patient, book, confirm, reschedule, cancel
**Persona**: Kavitha Reddy, receptionist, at a desktop screen on `/dashboard`
**Goal**: Lakshmi Narayanan's daughter rings to book for her mother; the receptionist is on the dashboard and uses the global search to get to the patient.
**Preconditions**: Desktop width (the global search box is not shown on phone width). Lakshmi Narayanan exists. Free 12:00 Confirmed tile today.
**Ideal path**: 4 (type in the search, pick the patient, pick a time, confirm). The search already knows where it is going; a "Book" shortcut on the patient result could carry straight into booking.
**Alternate paths**:
- STORY-001 (FRONT-DESK-01): skip the header and search on the Appointments page (4 steps).
- Sidebar "Patients", type in the list search "Search by name, phone, ABHA, or email (min 2 chars)", click "View", then "Book appointment".
- Patients list row has "Start Visit" (to the visit form) but no "Book" button.
- Header search also returns appointments (opens `/dashboard/appointments` on today and the saved doctor, not on the appointment's own date or row) and users (opens `/dashboard/users`).

### Steps
1. Type "Lakshmi" in the header box "Search patients, appointments, doctors..." (min 2 characters, debounced) → dropdown lists patients (max 5), appointments (max 5) and users (max 3) with a "Press Enter to go to first result" hint.
2. Click the patient result "Lakshmi Narayanan" (subtitle: phone; description "Patient • FEMALE • 61y") → navigates to `/dashboard/patients?search=<patient id>`; the list's search box is seeded with the internal id. Per source the server's patient search matches name, phone, ABHA, patient code and email, not id, so this list is expected to show no rows (to be verified when walked).
3. Type "Lakshmi" in the Patients search "Search by name, phone, ABHA, or email (min 2 chars)" (app already knows this; it was typed in step 1) → after a 500 ms debounce the list shows the patient row.
4. Click "View" on the row → `/dashboard/patients/<id>`: header with name and badges, buttons "Resume last visit" (if any), "Start visit", "Book appointment", "Back to Patients".
5. Click "Book appointment" → `/dashboard/appointments?patientId=<id>`; the patient is fetched and pre-selected (badge "Selected: ...", the search box stays empty).
6. Click the free 12:00 tile in the Confirmed column → dialog "Book Appointment".
7. Click "Confirm Booking" → banner "Appointment Successfully Booked!"

### Variations
- Press Enter in the header box instead of clicking: opens the first result, which may be an appointment or doctor rather than the patient.
- Click the appointment result instead: lands on `/dashboard/appointments` for today and the remembered doctor; if the appointment is on another day the receptionist must set the Date by hand.
- Patient lookup in step 5 fails: toast "Patient unavailable: Search for the patient before booking."

### Edge Cases
- If step 2 does show an empty list it adds a retype (step 3); if the id happens to match, step 3 is skipped and the story is 6 steps.
- The patient's identity (name, phone, age, gender) shows in the header results, list row, detail header, "Selected:" badge and booking dialog: five surfaces for one person.
- Only desktop has the header search; at phone width the top bar has just a menu button and the app name.

---

### STORY-008: A morning at the front desk: confirm, book, register a walk-in, move and cancel  [orig FRONT-DESK-08]

**Type**: long
**Topic**: Front desk: find or register a patient, book, confirm, reschedule, cancel
**Persona**: Kavitha Reddy, receptionist at a one-doctor dermatology clinic, 09:30 on a Friday, with Dr. Ramesh Kulkarni's calendar
**Goal**: Work through the front desk's typical block: confirmation calls (one hits a conflict), a returning patient's phone booking, a new walk-in, a postponement and a cancellation.
**Preconditions**: Today is Friday 13 Nov 2026. The Scheduled column holds Anita Reddy 10:00 and Sandeep Joshi 10:30 (the Confirmed column already holds a walk-in at 10:30), plus Rahul Menon at 14:00 and Neha Gupta at 12:30 (Confirmed). Lakshmi Narayanan exists. Pooja Verma does not. The doctor's per-slot limit is 1.
**Ideal path**: 15 (Anita 1; Sandeep 2, confirm and pick; Lakshmi 3; Pooja walk-in 4; Rahul postponement 3; Neha cancel 2). Every one of these tasks can be done from one screen without re-entering anything the app knows.
**Alternate paths**: every task here has the alternates listed in STORY-001 (FRONT-DESK-01) to -07; the whole day can be run from the Appointments page only except for walk-in registration, which also exists as "Add New Patient" on that page.

### Steps
1. Click "Appointments" in the sidebar → the calendar shows today with the remembered doctor; the Scheduled column header reads "2 patients to confirm" (Doctor and Date defaults, app already knows this).
2. Click Anita Reddy's row (10:00-10:30) → "Appointment Details".
3. Click "Confirm" → toast "Appointment confirmed: Anita Reddy is now at 10:00-10:30 in Confirmed." (no confirmation dialog; she moves to Confirmed.)
4. Click Sandeep Joshi's row (10:30-11:00) → "Appointment Details".
5. Click "Confirm" → 10:30 in Confirmed is taken, so the dialog closes and the banner "Moving Sandeep Joshi to Confirmed" appears: "10:30-11:00 is taken in Confirmed. Click a free time in the Confirmed calendar, or change the date to pick another day."
6. Click the free 11:30 tile in the Confirmed column → toast "Appointment confirmed: Sandeep Joshi is now at 11:30-12:00 in Confirmed."
7. Type "Lakshmi" in the Patient field (required to book) → matches list.
8. Click "Lakshmi Narayanan — 9848012345" → badge "Selected: ..." appears.
9. Click the free 15:00 tile in the Scheduled column → dialog "Book Appointment" (Type default OPD Consultation; Duration default: span length).
10. Click "Confirm Booking" → banner "Appointment Successfully Booked!" (her call is set to be confirmed later; Scheduled).
11. Click "Patients" in the sidebar → `/dashboard/patients`.
12. Click "New Patient" → dialog "Create Patient".
13. Type "Pooja" in "First Name" (required).
14. Type "Verma" in "Last Name" (optional).
15. Type "26" in "Age (years)" (optional).
16. Select "Gender" = Female (required field, default: Other).
17. Type "9440123456" in "Phone" (required).
18. Select "Patient Type" = Walk-in (default: Non walk-in).
19. Select "Doctor (for walk-in)" = "Dr. Ramesh Kulkarni" (no default).
20. Click "Create" → toast "Walk-in appointment booked: Booked into the Confirmed calendar for 13 Nov 2026 at 12:00" (first free Confirmed slot).
21. Click "Appointments" in the sidebar → the calendar reopens with the saved doctor and today; Pooja Verma's walk-in row is in the Confirmed column at 12:00 with a bill chip "Not billed" (the receptionist was not taken here by the walk-in booking).
22. Click Rahul Menon's row (Scheduled, 14:00) → "Appointment Details" (he called to postpone to Saturday).
23. Click "Reschedule" → banner "Rescheduling Rahul Menon".
24. Set the Date field to Saturday 14 Nov 2026 → banner text updates to "...move this appointment from 13 Nov 2026 to 14 Nov 2026."
25. Click the free 14:00 tile in the Scheduled column → toast "Appointment rescheduled: Rahul Menon is now on 14 Nov 2026 at 14:00-14:30 in Scheduled." (Move ends; the page stays on Saturday.)
26. Set the Date field back to today, 13 Nov 2026 (default would be today after a reload, but the page keeps the changed date).
27. Click Neha Gupta's row (12:30) → "Appointment Details" (she cancels).
28. Click "Cancel Appointment" → dialog "Cancel Appointment" ("This action cannot be undone.").
29. Click "Yes, Cancel Appointment" → toast "Appointment Cancelled"; row removed; the 12:30 tile is free again.

### Variations
- Instead of step 5's conflict, a free 10:30 tile in Confirmed: the confirm completes in one click (story ends at step 3 for him).
- Receptionist skips the Appointments page and books Lakshmi through Patients > "View" > "Book appointment" (STORY-007 (FRONT-DESK-07)).
- At step 20 the overbook prompt "Overbook this slot?" appears if the first free slot is already full to the doctor's limit.
- Patient arrives: there is no check-in; the nearest action is "START" or "Start Visit" on the row, which opens the visit form and, on the server, sets the appointment to IN_PROGRESS.

### Edge Cases
- Switching to another doctor in the Doctor select mid-reschedule ends the move silently.
- Steps 24 and 26 exist only because rescheduling to another day is a calendar-wide date change; the calendar does not show the patient's new day until the Date is changed again.
- The Scheduled/Confirmed meaning is explained in the column headers, the "Legend" card, and the "Quick Guide" dialog (opened by the "Quick Guide" button): three copies of one explanation, none of them next to the Confirm button.
- A patient may appear twice in the day (one Scheduled, one Confirmed) if they are booked twice; nothing warns on a duplicate booking for the same patient on the same day.
- `ReceptionistTour` (header button "Start Tour", RECEPTION only) repeats these instructions as a guided overlay on the Appointments page.

---

### Doctor's visit: dashboard, calendar start, vitals, photos, labs, prescription, preview/print/share, complete

### STORY-009: Open the next confirmed patient from the calendar  [orig DOCTOR-VISIT-01]

**Type**: short
**Topic**: Doctor's visit
**Persona**: Dr. Kavita Rao, dermatologist, logged in after morning rounds
**Goal**: Get from login to the visit form of Suresh Kumar (34, acne review, 11:30 slot, Confirmed column)
**Preconditions**: Appointment for Suresh Kumar today 11:30 with Dr. Kavita Rao, status CONFIRMED (in the "Confirmed" column). Browser has no stored doctor choice, or another doctor was last chosen by a colleague on the same PC.
**Ideal path**: 1. The app knows who the doctor is and that it is today; one click on the patient in a "my day" list should open the visit.
**Alternate paths**: (a) Calendar row click opens dialog "Appointment Details", then button "Start Visit" (2 clicks, same destination). (b) Patients list row button "Start Visit" goes to `/dashboard/visits?patientId=&autoStart=true` with no appointmentId, so the visit is not linked to the appointment and the doctor falls back to the first doctor in the list. (c) Patient detail buttons "Start visit" and "Resume last visit". (d) Visits setup screen "Start New Visit": search patient, pick doctor, "Start Visit Documentation". (e) Header Notifications item for doctors (`/dashboard/visits?appointmentId=`). (f) Dashboard "Recent Visits" only resumes past visits. (g) `PatientProgressTracker` buttons "Start Visit"/"Continue". The dashboard "Today's Appointments" card rows are not clickable.

### Steps
1. Click sidebar entry "Appointments" → `/dashboard/appointments`, tab "Calendar" shown, two columns "Scheduled" and "Confirmed". Date input shows today (default: today, IST).
2. Click the "Doctor" select (app already knows this: the logged-in user is a doctor; the page instead restores `appointments.doctorId` from localStorage or falls back to the first doctor in the list) → options list opens.
3. Click "Kavita Rao" (required; wrong doctor is a silent mis-read of the schedule) → calendar columns reload for Dr. Rao.
4. Hover Suresh Kumar's row in "Confirmed" and click the blue "START" button (shows "CONT" if a visit already exists) → navigates to `/dashboard/visits?patientId=…&appointmentId=…&autoStart=true`; "Visit Documentation" appears with badge "From Appointment", sticky identity line "Patient: Suresh Kumar · 34 · Male · Doctor: …" and the form on tab "Overview". No visit record exists yet.

### Variations
- Patient still in the "Scheduled" column (not confirmed by phone): the same START works, no warning; the "Appointment Details" dialog offers "Confirm" instead.
- Row opened with a click: dialog "Appointment Details" repeats Date, Slot, Calendar, Patient, Phone, Email, Age, Sex, Bill type, Type, Room, Status; the same facts are on the row chip and the visit identity line.
- Existing draft visit: button reads "CONT" and URL carries `visitId`.

### Edge Cases
- Optimistic (just-booked) rows have START disabled until the server id returns.
- On the `/dashboard/visits` setup screen (no deep link) the doctor select is pre-filled with the first doctor, not the logged-in one.

---

### STORY-010: Record vitals before the consultation  [orig DOCTOR-VISIT-02]

**Type**: short
**Topic**: Doctor's visit
**Persona**: Dr. Kavita Rao (doctor does her own vitals in a small clinic)
**Goal**: Capture BP and weight for Suresh Kumar and mark the Vitals section complete
**Preconditions**: Visit form open from STORY-009 (DOCTOR-VISIT-01) (Overview tab).
**Ideal path**: 3. Type the three readings; autosave persists them and the section needs no separate "mark complete" click.
**Alternate paths**: Overview "Quick Actions" button "Record Vitals" (only switches to the Vitals tab, same as the tab). The Prescription tab section "Clinical Details & Vitals" has Height, Weight, BMI, BP (Sys), BP (Dia), Pulse and is synced both ways with the Vitals tab (`receiveClinicalData`), so vitals can be typed there instead; it does not mark the vitals section complete. Nurse role reaches the same Vitals tab.

### Steps
1. Click tab "Vitals" → grid of fields BP Systolic, BP Diastolic, Heart Rate, Temperature, Weight, Height, BMI, Resp. Rate, plus Pain Score (0-10).
2. Type "122" in "BP Systolic" (optional; placeholder mmHg).
3. Type "80" in "BP Diastolic" (optional; placeholder mmHg).
4. Type "68" in "Weight" (optional; placeholder kg).
5. Click "Mark Vitals Complete" → saves the visit (creates it if first save; toast "Visit saved"), Vitals tab gets a green dot, progress bar moves to 20%.

### Variations
- Add "Height" (optional, cm): "BMI" (read-only, calculated) fills; the same BMI appears on the Prescription tab.
- "Temperature" placeholder is °F; the payload converts to Celsius.
- "Heart Rate" is labelled "Pulse (bpm)" in the Prescription tab (same value, different label).
- Pain Score here and "Itch Score (0-10)" under "On Examination" are separate fields.

### Edge Cases
- Skipping step 5: values still autosave, but the section stays "Pending" in "Progress Summary" and the doctor cannot complete the visit later.
- Overview card "Photos Captured" is hard-coded to 0 in source.

---

### STORY-011: Write a two-medicine acne prescription  [orig DOCTOR-VISIT-03]

**Type**: medium
**Topic**: Doctor's visit
**Persona**: Dr. Kavita Rao
**Goal**: Prescribe Adapalene 0.1% gel and Doxycycline 100 mg for Suresh Kumar with a 6-week review and save the prescription
**Preconditions**: Visit form open (STORY-009 (DOCTOR-VISIT-01)). Drugs "Adapalene 0.1% gel" and "Doxycycline 100mg capsule" exist in the drug database. Patient has no earlier prescriptions (so no regimen suggestions).
**Ideal path**: 6. Two medicines at two steps each (type, pick), one review-interval click, one save; frequency and duration come from defaults.
**Alternate paths**: Templates bar (dropdown "Templates", e.g. default "Acne (Mild) — Topical regimen") fills rows in 2 clicks; "Reuse last meds"; "Recent meds:" chips. `ensureVisitId` means Create Prescription also creates the visit. The preview dialog "Save Prescription" is a second way to save (STORY-012 (DOCTOR-VISIT-04)). Footer "Save Draft" saves clinical fields but not the prescription items.

### Steps
1. Click tab "Prescription" → builder with all sections expanded in one long page: Clinical Details & Vitals, Chief Complaints, Diagnosis, Patient History, On Examination, Treatment, Procedures, Investigations, Basic Information, Review Date.
2. Type "Pimples on cheeks and forehead for 3 months" in "Chief Complaints" (optional; suggestion list appears, clicking one is an extra step).
3. Type "Acne vulgaris" in "Diagnosis" (optional; placeholder e.g., Acne vulgaris).
4. In Treatment row 1, type "adap" in "Search medicine name..." (required; a blank row exists by default).
5. Click result "Adapalene 0.1% gel" in the dropdown (required) → row fills drug; app fetches regimen defaults; a new blank row 2 is appended. With no history, Frequency/When/Duration/Instructions stay empty (default: Duration unit DAYS).
6. Click preset "HS" (optional; sets Frequency ONCE_DAILY for the active row).
7. Click preset "4w" (optional; sets Duration 4 and unit WEEKS on the active row).
8. Type "Apply a pea-sized amount at night, avoid sun" in row 1 "Instructions" (optional; placeholder e.g., Avoid alcohol).
9. In row 2, type "doxy" in "Search medicine name..." (required).
10. Click "Doxycycline 100mg capsule" (required).
11. Click preset "1-0-1" (optional; sets dose pattern and infers frequency and timing).
12. Click preset "14d" (optional).
13. Click review chip "6w" under "Review Date" (optional) → fills "Review Date" and, because empty, "Follow-up Instructions" becomes "Follow up in 6 weeks" (two fields, same fact).
14. Click "Create Prescription" → toast "Prescription created: 2 medications recorded for the patient"; visit saved, Prescription tab section marked complete; dialog "Go to Pharmacy?" opens (guards leaving the visit for the billing page).
15. Click "Stay Here" → dialog closes, form remains.

### Variations
- Step 14 alternative "Yes, go to Pharmacy" leaves the visit page via `window.location.href` to a pre-filled Sales bill (patient, doctor, prescription).
- "+ Add to Drug Database" opens dialog "Add Drug to Database" (Name, Manufacturer, Price (₹), Pack Size Label, "Save & Add") when a drug is missing.
- Second visit for the same patient with history: step 5 fills duration, frequency, when and instructions with "Suggested · Accept" links beside each; the doctor's untouched suggestions already apply, so Accept is cosmetic.
- Language select (English/Telugu/Hindi) under "Basic Information": non-English triggers translation on Print Preview.

### Edge Cases
- Only the medicine name is needed for "Create Prescription"; empty frequency or duration is not blocked by the client.
- No medicine: "Create Prescription" is disabled and the preview button reads "Add medications to save".
- Draft autosaves to localStorage (`rxDraft:<patient>:<visit>`); tele-video consultation without the consent checkbox blocks saving with toast "Patient consent required".
- Vitals and complaints exist in the Overview/Vitals tabs and again in this builder; Investigations exist here and in the Lab Tests tab (see STORY-013 (DOCTOR-VISIT-05)).

---

### STORY-012: Preview and print the prescription  [orig DOCTOR-VISIT-04]

**Type**: medium
**Topic**: Doctor's visit
**Persona**: Dr. Kavita Rao, then front-desk printer
**Goal**: Print the A4 prescription for Suresh Kumar on the clinic letterhead
**Preconditions**: STORY-011 (DOCTOR-VISIT-03) steps 1-13 done (medicines entered). Doctor has a signature uploaded in header "My Settings" (otherwise "Show signature" is disabled with help text "No signature uploaded…").
**Ideal path**: 2. One click "Print" (auto-save, auto-preview) plus the unavoidable OS print confirmation.
**Alternate paths**: "Download PDF" in the same dialog; "PDF via WhatsApp" and "Email" (STORY-016 (DOCTOR-VISIT-08)); pharmacy-side print of the bill is a different document. Keyboard shortcuts do not reach print.

### Steps
1. Click "Print Preview" (below the builder) → toast "Print Preview: Language is English. Skipping translation."; full-screen dialog "Prescription Preview" opens with paper, zoom, margins; Prescription section is marked complete now.
2. Click checkbox "Show signature" (optional; default: remembered for this doctor on this browser; disabled if no signature).
3. Click green "Save Prescription" (optional here, because Print/Download/WhatsApp auto-save; required before "Email") → saves; "Email" unlocks.
4. Click "Print" → `saveBeforeExport` saves the visit (PATCH) and the prescription, builds the paginated pages, opens the browser print dialog. A blue "Print Settings Tip" box tells the user to turn off "Headers and footers" by hand.
5. In the browser print dialog choose the printer "Clinic HP LaserJet" (default: last used printer; OS step).
6. Click the browser's "Print" button (OS step) → page prints.
7. Click "Close" → back to the builder.

### Variations
- Space-optimized layout / "Fit to 1 page" checkboxes and "Printer profile" select change the output; "Refill stamp" checkbox adds a stamp.
- Button "Interactions" opens dialog "Interaction Summary" (drug interaction list, button "Close").
- Translate-on-print: choose Hindi or Telugu in step 1's prerequisite and step 1 shows "Preparing…" while translating.
- Patient name, age and phone appear in the preview header, the visit identity line and the Appointment Details dialog (same information on several surfaces).

### Edge Cases
- Print before the pagination finishes: toast "Print failed: No paginated preview is ready yet."
- Signature image fails to load: toast "Print failed", retry.
- Visit changed on another device: save conflict toast and autosave pauses ("Visit changed elsewhere").

---

### STORY-013: Full consultation, login to completed visit (long)  [orig DOCTOR-VISIT-05]

**Type**: long
**Topic**: Doctor's visit
**Persona**: Dr. Kavita Rao, 11:30 patient Suresh Kumar, starting isotretinoin so baseline liver and lipid tests are ordered
**Goal**: Document vitals, a photo, ordered investigations and a two-medicine prescription, print it, and complete the visit
**Preconditions**: Same as STORY-009 (DOCTOR-VISIT-01) and 03. A JPG of the face is on the PC. Doctor signature uploaded.
**Ideal path**: 15. Open patient (1); three vitals (3); choose photo (1); two medicines (4); two investigation ticks (2); review interval (1); Print plus OS confirm (2); Complete (1). The app should infer progress, tag the photo, and not ask for the same tests twice.
**Alternate paths**: Footer shortcut Ctrl/Cmd+Shift+S for "Complete Visit" (listed in dialog "Keyboard Shortcuts"). Prescription via template. Patient-list "Start Visit" start. Photos can also be added from patient detail tab "Uploads".

### Steps
1. Click sidebar "Appointments" → calendar for today.
2. Click "Doctor" select (app already knows this).
3. Click "Kavita Rao" (required).
4. Hover row Suresh Kumar and click "START" → visit form, tab Overview.
5. Click tab "Vitals".
6. Type "122" in "BP Systolic" (optional).
7. Type "80" in "BP Diastolic" (optional).
8. Type "68" in "Weight" (optional).
9. Type "172" in "Height" (optional) → "BMI" auto-fills.
10. Click "Mark Vitals Complete" → toast "Visit saved"; visit created; progress 20%.
11. Click tab "Photos" → "Before / After Photos (0)", text "No photos attached to this visit".
12. Click "Upload" (header) or "Choose Files" (empty state) → OS file chooser.
13. Choose "suresh_face_front.jpg" in the OS chooser (required) → dialog "Tag photo positions" opens, mode "Single", position (default: Front, inferred by order).
14. Click "Upload" in the dialog → toast "Photos uploaded: 1 image(s) uploaded."; heading shows "(1)"; Photos section auto-marked (progress 40%).
15. Click tab "Lab Tests".
16. Tick "LFT" (optional) → card with five sub-rows AST (SGOT), ALT (SGPT), Bilirubin Total/Direct/Indirect, units pre-filled.
17. Tick "Fasting lipid profile" (optional) → four sub-rows pre-filled with mg/dL.
18. Click "Save Labs" → saves, Lab Tests section marked complete (progress 60%) although no result has been entered. Helper text: "Selections and results are saved under Treatment Plan → Dermatology."
19. Click tab "Prescription".
20. Type complaint in "Chief Complaints" (optional).
21. Type "Acne vulgaris" in "Diagnosis" (optional).
22. Type "adap" in medicine field row 1 (required).
23. Click "Adapalene 0.1% gel" (required).
24. Click preset "HS" (optional).
25. Click preset "4w" (optional).
26. Type "doxy" in row 2 medicine field (required).
27. Click "Doxycycline 100mg capsule" (required).
28. Click preset "1-0-1" (optional).
29. Click preset "14d" (optional).
30. In section "Investigations" tick "LFT" (optional; the same test already chosen in step 16, separate state, so it must be entered again for it to print).
31. Tick "Fasting lipid profile" (optional; same reason).
32. Click review chip "6w" (optional) → Review Date and Follow-up Instructions both fill.
33. Click "Print Preview" → dialog "Prescription Preview"; prescription section marked (progress 80%).
34. Click "Print" → auto-saves visit and prescription, browser print dialog opens (no "Go to Pharmacy?" prompt on this path, because it saves "from preview").
35. Choose printer in the browser dialog (default: last used; OS).
36. Click browser "Print" (OS).
37. Click "Close" in "Prescription Preview".
38. Click footer "Complete Visit" (enabled at 80%; no confirmation dialog) → toast "Visit completed: All documentation has been marked complete."; the page stays on the form and the Overview "Status" badge reads COMPLETED.

### Variations
- Skip the photo (not clinically needed): "Complete Visit" stays disabled; footer text reads "Completion requires 80% progress. Remaining: photos. Section progress does not verify clinical completeness."
- Skip the lab ticks: step 18 can still be clicked with nothing ticked to satisfy progress.
- Patient wants WhatsApp copy: add STORY-016 (DOCTOR-VISIT-08) between steps 33 and 37.
- Ending by billing: use "Create Prescription" then "Yes, go to Pharmacy" instead of printing.

### Edge Cases
- Tele-video consultation type (select "Consultation type" under the progress card): all saves blocked until "Patient consented to tele-video consultation" is ticked.
- Browser closed mid-visit: `beforeunload` guard and localStorage draft; on reopen progress may reset (see STORY-017 (DOCTOR-VISIT-09)).
- Same visit edited on two devices: 409, toast, autosave paused, "discard and reload" button.
- The same facts live on several surfaces: patient identity (calendar row, Appointment Details dialog, identity line, progress tracker), vitals (Vitals tab and Prescription "Clinical Details & Vitals"), investigations (Lab Tests tab and Prescription "Investigations"), complaints and diagnosis (builder, Overview-derived history cards, History tab).

---

### STORY-014: Attach a lesion photo to the visit  [orig DOCTOR-VISIT-06]

**Type**: short
**Topic**: Doctor's visit
**Persona**: Dr. Kavita Rao
**Goal**: Add one close-up photo of a back lesion to Suresh Kumar's visit
**Preconditions**: Visit form open; a JPG on the PC (or a phone camera).
**Ideal path**: 2. Choose or capture the file; the position is auto-tagged and upload starts at once (retag only when wrong).
**Alternate paths**: "Camera" / "Take Photo" (opens the device camera via `capture=environment`); patient detail tab "Uploads" (`VisitPhotos`/`PatientPhotoArchive`); Overview "Capture Photos" only switches to the Photos tab.

### Steps
1. Click tab "Photos" → "No photos attached to this visit".
2. Click "Upload" → OS file chooser.
3. Choose "back_lesion.jpg" (required) → dialog "Tag photo positions" with Mode "Grid"/"Single", button "Infer positions", a position select (default: Front, assigned in the order Front, Left, Right, Back, Close-up, Other).
4. Click "Upload" in the dialog (the dialog's footer also has "Cancel") → toast "Photos uploaded: 1 image(s) uploaded."; heading "Before / After Photos (1)"; visit is silently created if none existed (appointment goes IN_PROGRESS).

### Variations
- Change the position (optional): click "Select position" and choose "Close-up"; the default Front is wrong for a back lesion, so correcting adds 2 steps.
- Several files: dialog steps through each with "Prev"/"Next" or all at once in "Grid"; uploads in batches of 6.
- With one photo, "Compare: On/Off" and "Delete" appear; delete asks via browser confirm "Delete this photo? This cannot be undone."

### Edge Cases
- Non-image file: toast "No valid images".
- Files above 25 MB: warning but upload is attempted.
- Tele-video without consent: upload blocked with the consent message.

---

### STORY-015: Enter a patient's lab report results  [orig DOCTOR-VISIT-07]

**Type**: medium
**Topic**: Doctor's visit
**Persona**: Dr. Kavita Rao, patient brings a printed CBC and Vitamin D report
**Goal**: Record Haemoglobin 13.8, WBC 6.2, Platelets 240 and Vitamin D 18 in the visit
**Preconditions**: Visit form open.
**Ideal path**: 6. Tick two tests, type four values; units are known and the section needs no manual save.
**Alternate paths**: Photo autofill in the same tab (file input, accepts JPG, PNG or PDF; the AI fills selections and values, then "Save Labs"). Investigations ordered (not resulted) are chosen under "Investigations" in the Prescription tab. Compare with previous visit lives only here.

### Steps
1. Click tab "Lab Tests" → card "Lab Tests (Investigations)", 31 checkboxes.
2. Tick "CBC" (optional) → "Enter Results" card with sub-rows "Hemoglobin", "WBC", "Platelets", units pre-filled (default: g/dL, 10^9/L).
3. Type "13.8" in Hemoglobin "Value" (optional).
4. Type "6.2" in WBC "Value" (optional).
5. Type "240" in Platelets "Value" (optional).
6. Tick "Vitamin D" (optional) → one row with unit (default: ng/mL).
7. Type "18" in its "Value" (optional).
8. Click "Save Labs" → saves the visit and marks Lab Tests complete.

### Variations
- Tick "Compare with previous visit" (optional): each value gets a "Δ +x" next to it versus the last visit.
- Autofill: choose the report image (one OS file action) → toast "Autofill complete: Extracted results inserted." or "Autofill failed".

### Edge Cases
- A test with no entered value still counts as complete on "Save Labs".
- Unknown tests (e.g. "Skin Biopsy") have an empty unit.
- Same test list is offered a second time in the prescription's "Investigations" section with its own "Add Custom Investigation" and a clinic list; the two are not linked in source.

---

### STORY-016: Send the prescription to the patient on WhatsApp or email  [orig DOCTOR-VISIT-08]

**Type**: medium
**Topic**: Doctor's visit
**Persona**: Dr. Kavita Rao
**Goal**: Share the PDF with Suresh Kumar (phone 98480 12345 on file)
**Preconditions**: Prescription entered (STORY-011 (DOCTOR-VISIT-03)). Patient phone on file. Desktop browser (no native file share).
**Ideal path**: 2. Click "Share on WhatsApp"; the message opens with the PDF attached and the patient's number.
**Alternate paths**: "Email" button in the same dialog (needs a saved prescription and a patient email); "Download PDF" and manual attach. Patient-list "More" menu has a "WhatsApp" action unrelated to prescriptions. Per-doctor "Send WhatsApp on appointment creation" setting is booking only.

### Steps
1. Click "Print Preview" → "Prescription Preview" dialog.
2. Click "PDF via WhatsApp" → auto-saves visit and prescription, renders PDF, records a WHATSAPP_SHARE print event; on desktop the PDF downloads and a new tab opens `wa.me/<patient phone>` (app already knows this phone); toast "PDF downloaded: Attach the downloaded PDF in the WhatsApp chat that just opened."
3. In the WhatsApp tab click the attach (paperclip) icon (outside the app).
4. Choose "prescription-<id>.pdf" in the OS chooser (outside the app).
5. Click send in WhatsApp (outside the app).
6. Click "Close" in "Prescription Preview".

### Variations
- Email: Step 2 becomes click "Save Prescription" (required; "Email" tooltip says "Save the prescription first"), then click "Email" → toast "Email sent: Prescription PDF sent by email."; message text "Your prescription is attached." is fixed.
- Phone browser/tablet with Web Share files support: step 2 opens the native share sheet (steps 3-5 replaced by choosing WhatsApp in the sheet).

### Edge Cases
- No phone on file: toast "No phone number: Patient has no phone number on file."
- No patient email: toast "Email failed: Patient has no email address on file."
- User cancels the share sheet: silent (AbortError ignored).

---

### STORY-017: Reopen a patient's visit from the dashboard and finish it  [orig DOCTOR-VISIT-09]

**Type**: medium
**Topic**: Doctor's visit
**Persona**: Dr. Kavita Rao, on the clinic desktop after a lunch break and a browser restart
**Goal**: Reopen Suresh Kumar's in-progress visit (photo, vitals, prescription already saved) and complete it
**Preconditions**: Visit exists with status IN_PROGRESS, one photo, vitals and a prescription saved earlier; browser localStorage for the draft was cleared by the restart (a private window or another PC gives the same result).
**Ideal path**: 2. Open the visit from "Recent Visits" and click "Complete Visit"; saved content should count as complete.
**Alternate paths**: Patient detail "Resume last visit"; Patient History cards "Resume"; calendar "CONT"; header notification. "My Patients" card goes to patient detail, not the visit.

### Steps
1. Click "Dashboard" in the sidebar (optional if already there) → cards "Recent Visits" and "My Patients" for doctors.
2. Click the "Suresh Kumar" row in "Recent Visits" → `/dashboard/visits?patientId=&visitId=`; form loads saved visit on "Overview"; footer reads "Progress: 20% • 1 of 5 sections complete" (only photos counted) with the "Completion requires 80% progress. Remaining: vitals, labs, prescription." text.
3. Click tab "Vitals".
4. Click "Mark Vitals Complete" (saved values shown; required again to count).
5. Click tab "Lab Tests".
6. Click "Save Labs" (required again to count; nothing selected is accepted).
7. Click tab "Prescription".
8. Click "Print Preview" (this alone marks the prescription section; the saved prescription is not read back as complete).
9. Click "Close".
10. Click "Complete Visit" → toast "Visit completed"; no confirmation dialog.

### Variations
- Same browser as the earlier session: the localStorage draft restores `completedSections`, and only step 2 plus step 10 are needed (the best case).
- Visit edited on another device meanwhile: toast "Visit changed elsewhere", autosave paused, button to discard the local draft and reload the saved visit (conflict path).

### Edge Cases
- I found no code that rebuilds `completedSections` from the saved visit (only localStorage draft and the photo-count effect), so on a fresh browser the progress bar lies about saved work.
- "Complete Visit" does not close the form or return to the calendar; "Back to Calendar" is `window.history.back()`.

---

### Pharmacy counter billing: prescription queue, dispense, Sales bill, print, discount, refund, returns, drafts

### STORY-018: Bill a waiting prescription from the Counter queue and print it  [orig PHARMACY-COUNTER-01]

**Type**: medium
**Topic**: Pharmacy counter billing
**Persona**: Meenakshi Iyer, pharmacist, at the counter with a patient standing in front of her, about 40 times a day.
**Goal**: Sell the medicines Dr. Anil Reddy prescribed to Lakshmi Narayanan, take UPI payment, and hand over a printed GST bill.
**Preconditions**: Logged in as PHARMACIST. Lakshmi's visit is completed with a prescription (Tretinoin 0.025% cream, Doxycycline 100 mg x 14, Sunscreen SPF 50 gel). All three lines are matched to stocked inventory. The prescription is "Pending".
**Ideal path**: 4. Open the Counter, click the prescription, pick the payment mode, press one "Confirm and print". Patient, doctor, phone, medicines, quantities, prices and GST are all already known to the app.
**Alternate paths**: (a) Pharmacy Counter cockpit: click the patient in the "Queue" panel, then header "Bill", Active Dispense "Open bill" or Pick + Pay "Collect payment" (three buttons, same action). (b) Sales > "New sale", then "Load" on the queue at the top of the bill page (same queue component, label "Load" instead of "Bill"). (c) Visit prescription builder "Go to Pharmacy" > dialog "Go to Pharmacy?" > "Yes, go to Pharmacy". (d) Patient progress tracker "Bill" (visit-only prefill). (e) Legacy `?section=billing` redirects to the same page.

### Steps
1. Click sidebar "Pharmacy Counter" → `/dashboard/pharmacy?section=counter`; page title "Pharmacy Counter"; cockpit (panels "Queue", "Active Dispense", "Pick + Pay") loads and fires a stock check for every queued prescription.
2. Scroll down past the cockpit (it is about one screen tall) to the section "Prescription Queue" (card "Prescription dispensing queue", status filter defaults to "Pending") → Lakshmi's row shows patient name and code, doctor, medicines with coverage "0/1", status "Pending", per-line stock badges ("In stock (24 tube)"), and a "Bill" button.
3. Click the row's "Bill" button → navigates to `/dashboard/pharmacy/sales/bill?patientId=…&prescriptionId=…&doctorId=…`; the page header is "Sales" with a "Back to Sales" button; the queue is shown again above region "Prescription bill"; the page scrolls itself to the bill. The builder card "New bill" auto-fills: Patient * (app already knows this), Doctor (app already knows this), Billing Name * (app already knows this), Phone * (app already knows this), three lines under "Invoice Items" with Quantity, Unit Price, Discount % (default: 0), Tax % (taken from the drug), plus a blue "Linked Prescription" box.
4. Read the Invoice Items for amber notes (no input). If a line shows an amber quantity warning, click its "Confirm" button (optional; only appears when the prescribed quantity is ambiguous, e.g. "1 tube" on a pack-based drug).
5. Click the "Payment Method" select (default: Cash) → options Cash, Card, UPI, Net Banking.
6. Choose "UPI" (optional; skip for cash) → select shows UPI.
7. Click "Print Preview" (button also shows "N items • ₹total total") → full-screen dialog "Pharmacy Invoice Preview": Status "Draft preview", Copy Type "Original" (default: Original), zoom 90%. Nothing is saved yet.
8. Click "Confirm & Print" → POST `/pharmacy/invoices/checkout`; stock is deducted, UPI payment for the full total is recorded, a bill number is issued; preview re-renders with the number and Status "Confirmed"; the button on the left changes to "Invoice Confirmed". Guard: this is the only confirmation; there is no "are you sure" dialog before stock moves.
9. In the browser print dialog, click Print → paper bill.
10. Click "Close" in the preview → bill page now shows an amber banner "This checkout is confirmed. Reopen it for another copy." with buttons "Reopen confirmed invoice", "Start a new invoice", "Back to Sales". The builder underneath still shows the old form.
11. Click "Back to Sales" (banner) → `/dashboard/pharmacy/sales` register; the new bill is the top row, Payment badge "UPI".

### Variations
- Pay by cash: skip steps 5 and 6 (9 steps).
- Patient wants a duplicate copy for insurance: in step 7 change "Copy Type" to "Duplicate" (2 extra steps: open select, choose).
- Use the explicit two-click path: "Confirm Invoice" (left panel) then "Print" instead of "Confirm & Print" (one extra step; same result).
- Same information on several surfaces: the prescription's medicines, stock status and patient identity appear in (1) cockpit "Queue" panel, (2) cockpit "Active Dispense" table, (3) the "Prescription Queue" table, (4) the second copy of the queue on the bill page, (5) the bill's Invoice Items, (6) the "Linked Prescription" box. Stock status in particular is shown on all of these.

### Edge Cases
- Prescription expired or not eligible (`dispensingEligible === false`): the "Bill" button is disabled; the cockpit shows "This prescription is not active or has expired."
- A line is unmatched to inventory ("No match", "Not linked"): the "Linked Prescription" box shows a "link inventory before billing" prompt; "Print Preview" then fails with a toast "Medicine needs review". Fix with "Substitute" on the line or the inventory-link control.
- GST missing on a line (Tax % blank, "Enter GST"): toast "GST rate needs review" blocks Print Preview.
- Network drops during step 8: the banner "A checkout for Lakshmi Narayanan needs confirmation. Retry it before starting another sale." offers "Retry pending checkout"; the same request key prevents a double sale.
- Pharmacist-side review actions taken in the Counter cockpit (Accept, Sub, Edit, NA, Ready) are NOT read by this bill; the bill is rebuilt from the prescription plus the stock check (see story STORY-025 (PHARMACY-COUNTER-08)).

---

### STORY-019: Walk-in sale of one over-the-counter item  [orig PHARMACY-COUNTER-02]

**Type**: medium
**Topic**: Pharmacy counter billing
**Persona**: Meenakshi Iyer, pharmacist. A registered patient, Farhan Sheikh, walks in for a sunscreen without a prescription.
**Goal**: Sell 2 tubes of Sunscreen SPF 50 gel for cash and print the bill.
**Preconditions**: Logged in as PHARMACIST. Farhan Sheikh exists in Patients (phone 98480 12345). Drug "Sunscreen SPF 50 Gel 50 g" is in the drug database.
**Ideal path**: 4. Type the item, add it with quantity 2, pick Cash, press "Confirm and print". A walk-in should not need a registered patient or a name and phone.
**Alternate paths**: (a) Inventory > Sales > "Counter sales" (workflow-document editor with "Customer name (optional)" placeholder "Walk-in customer", "Phone (optional)", "Payment method" CASH/UPI/CARD/CREDIT, batch picking, no patient required; appears in the Sales register as source "Counter sales"). (b) Pharmacy Counter empty-state button "Walk-in bill" (only when the queue is empty). (c) Pharmacy Counter "Start billing" (no active prescription), Desk "New sale". All of (b) and (c) land on the same bill page with a required patient.

### Steps
1. Click sidebar "Sales" → `/dashboard/pharmacy/sales`; title "Sales", tabs "Sales" and "Returns", filters, table of bills for the financial year.
2. Click "New sale" (top right) → `/dashboard/pharmacy/sales/bill`; the prescription queue (filter "Pending") loads at the top with a stock check per prescription, below it the builder card "New bill" with empty fields. Sales bill header now shows "Back to Sales".
3. Click the "Patient *" field ("Search patients by name or phone...") and type "Farhan" (required field) → dropdown of up to 20 patients appears on focus; filters after 2 characters via `/patients?search=`.
4. Click "Farhan Sheikh" in the dropdown → Billing Name * and Phone * are filled from the patient (app already knows this; editable).
5. Click "Search Drugs" ("Search by drug name, manufacturer, or ingredient...") and type "Sunscreen" → after about 300 ms a result list of drugs with price, pack size and a green "best match" highlight on the first.
6. Click "Add" on "Sunscreen SPF 50 Gel 50 g" → a card in "Invoice Items" with Quantity 1 (default: 1), Unit Price from the drug, Discount % 0 (default: 0), Tax % 18 (default: 18 for every manually added drug, regardless of the drug's own GST), no stock badge.
7. Select the "Quantity" field of the new card and type 2 (optional; default 1).
8. Leave "Payment Method" on Cash (default: Cash). Leave Doctor and Notes empty (optional). No step.
9. Click "Print Preview" → dialog "Pharmacy Invoice Preview", Status "Draft preview".
10. Click "Confirm & Print" → bill confirmed, stock deducted from the earliest-expiry batch, cash recorded; print dialog opens.
11. Click Print in the browser print dialog.
12. Click "Close" → confirmed banner appears.
13. Click "Back to Sales" → register.

### Variations
- Customer is not a registered patient: there is no "Add patient" in the bill. The pharmacist must leave the sale, go to Patients > "New Patient" (about 6 fields), and come back (+10 steps), or use the Inventory "Counter sales" route.
- Several OTC items: repeat steps 5 and 6 per item (2 steps each). Clicking "Add" on the same drug again just increments Quantity.
- Add a "Treatment Packages" tab item: click tab "Treatment Packages" and click the package card (1 click adds it with its package price and 18% tax).

### Edge Cases
- Dermatology drug with 12% or 5% GST: the manual add still pre-fills Tax % 18; the pharmacist has to retype Tax % per line or the GST on the printed bill is wrong. Prescription-loaded lines use the drug's real rate (story STORY-018 (PHARMACY-COUNTER-01)).
- Quantity above stock: the manual line has no "Insufficient stock" badge (`availableStock` is only set on prescription and substituted lines); the server rejects the checkout and the toast "Error Confirming Invoice" shows the reason.
- No patient chosen: "Print Preview" button stays disabled.
- "Patient *" required but the customer is a stranger: the pharmacist often picks any placeholder patient, making Billing Name wrong; only Billing Name is editable afterwards.

---

### STORY-020: Reprint a bill for a patient who lost it  [orig PHARMACY-COUNTER-03]

**Type**: short
**Topic**: Pharmacy counter billing
**Persona**: Meenakshi Iyer, pharmacist. Patient Ritu Agarwal returns and says "I lost yesterday's bill", bill number is on her WhatsApp message (BILL-2026-004512).
**Goal**: Print another copy of an old confirmed bill.
**Preconditions**: Bill exists, state Final. Sales register period is the default (current financial year).
**Ideal path**: 3. Type the bill number or name, click Print, browser Print.
**Alternate paths**: (a) Sales register row printer icon "Print <bill>" (this story). (b) Click the row to open the bill and press "Print" in the "Bill …" card (+1 step, same output through the shared `printHtml`). (c) Pharmacy Desk > "Invoices" > "View Invoice" (opens a popup window) or "Download Invoice" (PDF). (d) Inventory > Sales > "Patient invoice history" (same component as (c)). (e) The "Pharmacy Invoice Preview" "Print" button, only during the sale itself. (f) Row "Send on WhatsApp" link `wa.me` with the bill amount (no PDF attached, text only).

### Steps
1. Click sidebar "Sales" → register opens.
2. Click the search box (field select "Search by" is "Bill No" by default) and type "004512" (optional narrowing; 300 ms debounce) → table filters to one row.
3. Click the printer icon in the row's Actions column (aria-label "Print BILL-2026-004512") → fetches the invoice and opens the browser print dialog.
4. Click Print in the browser dialog → paper copy. (No indication on the bill that it is a reprint: the call uses `renderPharmacyInvoiceHtml`, not the "Duplicate" copy type.)

### Variations
- Patient does not know the number: change "Search by" to "Mobile" or "Patient" first (2 extra steps: open select, choose).
- Reprint a draft: the Print icon is disabled with tooltip "Finish this draft bill first".

### Edge Cases
- Cancelled bill: print icon disabled, tooltip "This bill is cancelled".
- Print fails: toast "Could not print" / "Check your connection and try again."
- The "Copy Type" Original/Duplicate control exists only in the sale-time preview; reprints from the register are not marked "Duplicate".

---

### STORY-021: Discard an abandoned draft bill  [orig PHARMACY-COUNTER-04]

**Type**: short
**Topic**: Pharmacy counter billing
**Persona**: Meenakshi Iyer, pharmacist. A draft for Ritu Agarwal saved this morning is no longer needed (patient bought elsewhere).
**Goal**: Remove the draft so it stops cluttering the Sales list.
**Preconditions**: A draft exists (state Draft, "Draft" badge, no bill number issued).
**Ideal path**: 2. Click discard on the draft row, confirm once.
**Alternate paths**: (a) Open the draft from the register and use "Discard draft" (this story). (b) Pharmacy Desk > "Invoices" list: filter to draft, trash icon "Delete Invoice" (browser `confirm()` "Are you sure you want to delete this invoice?" and a browser `alert()` "Invoice deleted successfully"). (c) Inventory > Sales > "Patient invoice history" (same list).

### Steps
1. Click sidebar "Sales" → register; draft rows show badge "Draft" in the Bill No column and "… not final" if a number is reserved.
2. Click the "Draft" link in Ritu's row (the whole row is also clickable) → `/dashboard/pharmacy/sales/bill?draft=<id>`; builder badge "Draft", status "All changes saved to the draft".
3. Click "Discard draft" (right column, below "Save draft") → dialog "Discard this draft?" with text "Nothing was sold, so stock and payments are unchanged. This cannot be undone."; buttons "Keep draft" and "Discard draft". The dialog guards an irreversible delete.
4. Click "Discard draft" in the dialog → DELETE `/pharmacy/invoices/<id>?version=n`; toast "Draft discarded … No stock moved."; navigates back to the Sales register; the row is gone.

### Variations
- Click "Keep draft" in step 4: dialog closes, nothing changes.
- Someone else already finished or changed the draft: server returns 409; the red banner "This draft was changed after you opened it. Reload it before discarding. Your changes on this screen were not saved." with "Reload draft".

### Edge Cases
- Discard is only reachable from inside the open draft (the page has two buttons both called "Discard draft": one on the page, one in the confirm dialog).
- A finished bill cannot be discarded: "This bill was already finished. It can no longer be discarded."; cancelling a confirmed bill has no UI at all in Sales (only the Cancelled state exists).
- The "Pharmacy Invoices" list shows the Delete icon on every row, including finished bills; the server refuses (browser `alert()` with the message).

---

### STORY-022: Save a half-finished sale as a draft and finish it later  [orig PHARMACY-COUNTER-05]

**Type**: medium
**Topic**: Pharmacy counter billing
**Persona**: Meenakshi Iyer, pharmacist. Ritu Agarwal's husband picks up her Adapalene gel but has to step out to fetch money.
**Goal**: Park the bill without moving stock, then complete and print it when he returns.
**Preconditions**: Logged in as PHARMACIST. Ritu Agarwal is a registered patient.
**Ideal path**: 6. Add patient and item (2), save as draft (1), later open the draft (1), confirm and print (1), done. Ideally the drafts would be listed on the Counter without leaving it.
**Alternate paths**: (a) Draft rows are found in Sales register (this story), with the filter More filters > State > "Draft". (b) Pharmacy Desk > "Invoices" list: pencil icon "Continue in Sales". (c) The URL `?draft=<id>`. (d) The Counter and Desk do not show drafts at all.

### Steps
1. Click sidebar "Sales" → register.
2. Click "New sale" → empty bill page.
3. Click "Patient *" and type "Ritu" (required field) → patient dropdown.
4. Click "Ritu Agarwal" → Billing Name * and Phone * filled (app already knows this).
5. Click "Search Drugs" and type "Adapalene" → results list.
6. Click "Add" on "Adapalene 0.1% Gel 15 g" → card in "Invoice Items": Quantity 1 (default: 1), Tax % 18 (default: 18).
7. Click "Save draft" → POST `/pharmacy/invoices`; toast "Draft saved … is in Sales as a draft. Open it from the Draft row to finish it."; URL becomes `?draft=<id>`; heading becomes badge "Draft" and "Gets its bill number when finished"; status line "All changes saved to the draft". No stock moved, no payment taken. Requires patient, at least one line, and Tax % on every line; otherwise toast "Draft not saved".
8. Click "Back to Sales" → register; footer note "1 draft not included" under the totals; row shows "Draft" badge.
9. (Later, same or next day) Click the "Draft" link in the row → builder reopens with every field as saved.
10. Click "Print Preview" → dialog "Pharmacy Invoice Preview".
11. Click "Confirm & Print" → checkout carries `draftId` and `draftVersion`; bill number issued; stock deducted; Cash payment recorded (default: Cash).
12. Click Print in the browser dialog.
13. Click "Close".
14. Click "Back to Sales" (banner) → row now has a bill number and Final state.

### Variations
- Two people on the same draft: the second save gets "This draft was changed after you opened it" with "Reload draft".
- Edit the draft before finishing: change Quantity (type, 1 step) and press "Save draft" again (status line first says "Unsaved changes").
- Prescription-based bill: prescription header and lines are saved with the draft (the draft keeps `prescriptionId`).

### Edge Cases
- Draft with an unmatched medicine: "Draft not saved: Choose a stocked product for X or remove it before saving the draft."
- Closing the tab with unsaved changes: no beforeunload prompt in source; changes are lost.
- Drafts are listed only in Sales (and Pharmacy Invoices); neither the Counter nor the Desk shows them.

---

### STORY-023: Give a goodwill discount after the bill is printed, then refund the difference  [orig PHARMACY-COUNTER-06]

**Type**: medium
**Topic**: Pharmacy counter billing
**Persona**: Meenakshi Iyer, pharmacist, on instruction from Dr. Anil Reddy. Sunita Menon already paid ₹1,180 in cash yesterday; the doctor approves a 10% discount on the whole bill after the fact.
**Goal**: Change the discount on a finished bill with an audit reason, then record the cash handed back.
**Preconditions**: Final bill BILL-2026-004498, Cash, fully paid.
**Ideal path**: 5. Open the bill's discount editor from the register, type the percentage, type the reason, save, record the refund.
**Alternate paths**: (a) Register row "Edit discount on <bill>" (percent icon; this story). (b) Open the bill, then "Edit discount" button in the bill card. (c) Deep link `?bill=<id>&edit=discount`. (d) Discount can also be set before confirming: per line "Discount %" and "Bill discount" in the bill's Invoice Summary. Counter sales (Inventory) are corrected in Inventory ("Counter sales are corrected in Inventory"). There is no "cancel bill" or "credit note" for pharmacy bills in this UI.

### Steps
1. Click sidebar "Sales" → register.
2. Click the search box and type "004498" (default search field "Bill No") → one row.
3. Click the percent icon "Edit discount on BILL-2026-004498" → `/dashboard/pharmacy/sales/bill?bill=<id>&edit=discount`; the bill card "Bill BILL-2026-004498" with badge "Paid" appears and dialog "Edit discount on BILL-2026-004498" opens automatically. It lists each line with "Item discount %" input (current value), then "Bill discount".
4. In "Bill discount" type 10 (optional; kind toggle "%" is selected by default (default: %); the "₹" button switches to rupees) → live preview "Total now ₹1,180.00", "Total after change ₹1,062.00", "Refund due after saving ₹118.00".
5. Click "Reason *" and type "Goodwill discount approved by Dr. Anil Reddy" (required field; placeholder "For example: senior citizen discount agreed by the doctor") → "Save discount" becomes enabled (before this, hint "Enter a reason to save.").
6. Click "Save discount" → PATCH `/pharmacy/invoices/<id>/discount`; toast "Discount changed … is now ₹1,062.00."; dialog closes; header badge "Refund due ₹118.00" and "Revised <date>"; new card "Discount changes" lists who, when, ₹1,180.00 → ₹1,062.00 and the reason. No confirmation dialog guards this change; the dialog's preview is the check.
7. Click "Record refund ₹118.00" → dialog "Record refund of ₹118.00": "Paid back by" (default: Cash), "Reference (optional)".
8. Click "Record refund ₹118.00" in the dialog (accept Cash default; skip reference) → POST `/pharmacy/invoices/<id>/refunds`; toast "Refund recorded: ₹118.00 paid back by Cash"; badge becomes "Paid"; card "Payments" gains a "Refund · Cash · …" line.
9. Click "Print" in the bill card (optional) → reprint of the revised bill (browser dialog; 1 further step to click Print).
10. Click "Back to Sales" → register row shows badges "Revised" and "Refunded ₹118.00".

### Variations
- Refund by UPI: in step 7 open "Paid back by" and choose "UPI", then type the UPI reference (3 extra steps).
- Per-item discount instead: in step 4 type in the "Discount % for <drug>" input of one line (1 step per line).
- Wrong first try: "Save discount" refuses unchanged values ("Change a discount to save").

### Edge Cases
- Another user edited the bill meanwhile: server 409 "changed after you opened it", the dialog shows a "Reload bill" button.
- Discount edit never touches items, quantities, batches or stock (dialog description: "Only discounts change.").
- A discount above 100% or a rupee discount above the pre-tax total: inline red message under "Bill discount".
- Refund amount is fixed to the computed difference; it cannot be edited down (partial refunds impossible).
- Same fact on several surfaces: the due or refund state appears in the bill card badge, the Payments card, the register Payment cell, and the Pharmacy Report "Sales Register".

---

### STORY-024: Take back an unopened pack and refund the patient  [orig PHARMACY-COUNTER-07]

**Type**: medium
**Topic**: Pharmacy counter billing
**Persona**: Meenakshi Iyer, pharmacist. Priya Nair returns an unopened Tretinoin 0.025% cream; Dr. Anil Reddy changed the prescription.
**Goal**: Post a customer return against the original sale, put the tube back on the shelf, refund in cash.
**Preconditions**: Original sale from last week exists with that item and batch. Logged in as PHARMACIST (needs inventory write permission).
**Ideal path**: 5. Open the original bill, press "Return items", tick the items and quantity, pick the refund method, confirm.
**Alternate paths**: (a) Sales > tab "Returns" > "New return" (this story). (b) Sidebar "Inventory" > area "Sales" > "Customer returns" > primary "Post return" (same editor, same document). (c) The Returns tab empty-state button "New return". (d) The finished bill page has no "Return" action.

### Steps
1. Click sidebar "Sales" → register (tab "Sales").
2. Click tab "Returns" → URL `?tab=returns`; same register layout with an extra column "Against bill", payment column "Refund" (store credit shown as "Store credit"), header button now "New return".
3. Click "New return" → `/dashboard/inventory?area=sales&view=SALES_RETURN&new=<key>&return=…`; Inventory page, document editor for "Customer returns" with the help line "Select the original sale and choose restock, quarantine or loss for each returned batch."
4. Click "Search original sale" ("Sale reference, product, barcode or SKU") and type "Tretinoin" → list in the select below filters (200 ms debounce).
5. Open "Add from original sale" and choose "<sale ref> · Tretinoin 0.025% cream · batch TR2409 · 1 tube" (native select, option text "remaining return quantity") → a return line appears: price, GST, discount are copied from the sale and locked (disabled inputs).
6. Select the line's Quantity field and type 1 (optional; default 1).
7. Click the line's "Disposition" select and choose "Quarantine" or leave "Restock" (default: Restock; options Restock, Quarantine, Record as loss). Counted as 0 steps when left alone.
8. Click "Refund method" select and choose "CASH" (default: CREDIT, which is store credit, so a cash refund needs this change) → one selection.
9. Click "Customer name (optional)" and type "Priya Nair" (optional; placeholder "Walk-in customer"; app already knows this from the original sale).
10. Click "Phone (optional)" and type "9848012345" (optional; app already knows this).
11. Click "Reason / notes" and type "Doctor changed the prescription, pack unopened" (required before posting; placeholder "Required before posting").
12. Click "Post return" → return posted; stock restored for the restocked line (or held if Quarantine); the document locks.
13. Click "Back to customer returns" (top left) → back to the list; later the Sales > Returns row shows "Against bill BILL-…" and Refund badge "Cash".

### Variations
- Opened pack: choose "Quarantine" (held out of stock) or "Record as loss" in step 7.
- Return only part of a multi-line bill: repeat steps 4 and 5 per line (2 steps each).
- Save for later: click "Save draft" instead of "Post return".

### Edge Cases
- Returning more than remaining: the "Add from original sale" list only shows sold batches with remaining quantity above 0.
- Refund method CASH is only recorded on the document; the Pharmacy Invoice's own "Payments" ledger and "Refund due" state do not change (returns live in the inventory document engine, not on the pharmacy invoice).
- Customer details typed again in steps 9 and 10 are already on the original sale.
- Reason is mandatory; the primary button does not post without it.

---

### STORY-025: A full counter shift case: review lines, substitute, discount, bill, PDF, verify  [orig PHARMACY-COUNTER-08]

**Type**: long
**Topic**: Pharmacy counter billing
**Persona**: Meenakshi Iyer, pharmacist. Lakshmi Narayanan (68, senior citizen) comes with Dr. Anil Reddy's prescription: Tretinoin 0.025% cream, Doxycycline 100 mg x 14, Sunscreen SPF 50 gel. Doxycycline 100 mg is out of stock; Doxt-SL 100 is available.
**Goal**: Use the Counter's review workflow, bill with a substitute and a 5% senior discount, take UPI, print, download the PDF, then verify the register and the Counter queue.
**Preconditions**: Logged in as PHARMACIST. Prescription pending; Doxycycline line shows "Out" in stock.
**Ideal path**: 7. Click the prescription, accept the available lines (one click for all), pick a substitute from a suggestion list, enter 5% discount, choose UPI, confirm and print, share PDF. Review and billing should be one screen.
**Alternate paths**: (a) The Counter review steps (steps 2 to 8) are optional: the bill can be opened straight from the "Prescription Queue" table with "Bill" (see story STORY-018 (PHARMACY-COUNTER-01)); the Counter review state is not read by the bill. (b) Substitution can be done in the bill only; the Counter "Sub" button just records a flag. (c) Download PDF is also in Pharmacy Desk > Invoices > "Download Invoice". (d) Status buttons "Paid" and "Ready" are manual toggles unrelated to the invoice.

### Steps
1. Click sidebar "Pharmacy Counter" → cockpit loads; "Queue" panel shows Lakshmi (badge "Pending"), counts "Queued", "Exceptions".
2. Click Lakshmi's card in the "Queue" panel → POST `/pharmacy/prescription-queue/<id>/pull` creates the dispense task and sets "In Review"; "Active Dispense" shows "0/3 lines reviewed", the lifecycle rail "Queued, In Review, …", and a "Medicine review table" with columns Prescription, Inventory Match, Stock, Shelf and batch, Action.
3. Click "Accept" on the Tretinoin row → line saved as accepted ("1/3 lines reviewed").
4. The reason dropdown (below the table) is "Substitution requested" (default: Substitution requested; options also Quantity changed, Medicine unavailable, Paused for doctor clarification, Cancelled at counter, Stock correction needed). Leave it.
5. Click the "Reason or pharmacist note" box and type "Doxycycline 100 out, Doxt-SL 100 offered" (optional).
6. Click "Sub" on the Doxycycline row → line saved as substitute with that reason; no replacement can be chosen here.
7. Click "Accept" on the Sunscreen row → "3/3 lines reviewed"; the text above the buttons changes to "Ready for billing review".
8. Click "Ready" → PATCH status READY_TO_BILL; lifecycle "Ready to Bill"; checklist item "GST bill" ticks. (Ready is disabled until every line is Accept, Sub or Edit; any "NA" line blocks it.)
9. Click "Open bill" (Active Dispense; same as header "Bill" and Pick + Pay "Collect payment") → `/dashboard/pharmacy/sales/bill?patientId=…&prescriptionId=…&doctorId=…`; builder prefilled as in story STORY-018 (PHARMACY-COUNTER-01). The review actions, reason and note from steps 3 to 8 are not carried over; Doxycycline shows a red "Out of stock" badge.
10. Click "Substitute" on the Doxycycline line → blue notice "Choose a replacement for Doxycycline 100 mg. The prescribed quantity will be kept." with "Cancel substitution".
11. Click "Search Drugs" and type "Doxt" → results list.
12. Click "Add" on "Doxt-SL 100 Capsule 10s" → the Doxycycline line is replaced in place (name, price, GST, stock), keeps the "Prescribed: Doxycycline 100 mg" caption and quantity.
13. Click "Confirm" on the amber quantity note of the Tretinoin line (optional; only if shown).
14. Click "Bill discount" (Invoice Summary) and type 5 (optional; "%" selected by default (default: %)) → Summary shows "Bill discount (5%): -₹…" and Total.
15. Click the "Payment Method" select (default: Cash).
16. Choose "UPI".
17. Click "Print Preview" → dialog "Pharmacy Invoice Preview".
18. Click "Confirm Invoice" (left, green) → checkout; number issued; stock deducted; UPI payment recorded; button shows "Invoice Confirmed"; "Download PDF" becomes enabled (it is disabled before confirm).
19. Click "Print" → browser print dialog.
20. Click Print in the browser dialog.
21. Click "Download PDF" → toast "PDF ready", file "<bill number>.pdf" downloads (for WhatsApp to the patient; no in-app send).
22. Click "Close" → banner "This checkout is confirmed. Reopen it for another copy."
23. Click "Back to Sales" → register; top row has the new bill with Payment badge "UPI".
24. Click sidebar "Pharmacy Counter" → cockpit reloads on mount.
25. Click filter chip "Done" in the "Queue" panel → Lakshmi's prescription is under "Done" (invoice-derived "Dispensed"); the manual "Paid" button was never needed.

### Variations
- Medicine truly unavailable: click "NA" instead of "Sub" in step 6 and set the reason to "Medicine unavailable" first (extra 2 steps); "Ready" stays disabled until the line is resolved, but "Open bill" is not disabled, so the bill can go ahead anyway.
- Pause for doctor clarification: choose reason "Paused for doctor clarification" and click "Pause" instead of steps 2 to 8; the prescription shows under "Exceptions".
- Partial supply: remove a line from the bill (trash icon "Remove <drug>") and bill the rest; queue shows "Partial" (1/3).
- Click "Paid" in the Active Dispense row before billing: sets the task to Paid without any payment; the invoice is unaffected.

### Edge Cases
- Cockpit buttons: "Rx queue" does nothing (`onOpenQueue` is a no-op), "Daily close" jumps to Pharmacy Desk (partner daily sync), "Shelf locations" and "Inventory Control" open Inventory > Today (the `tab=pharmacy-control` parameters are not understood).
- Selecting a queue row writes to the server (creates the dispense task, sets "In Review") just by looking at it.
- Stock check failure: red text "Unable to check current stock. Use Refresh to retry."
- Stock for the same prescription is shown in at least five places: queue "Stock" column, cockpit "Stock" badge, "Pick Assist", "Scan next", and the bill line badge.
- Checklist panel (Validate, Pick earliest-expiry batch, Barcode, GST bill, Payment, Dispense) are display-only ticks; nothing scans a barcode in this flow.

---

### STORY-026: Find a past pharmacy invoice and download its PDF  [orig PHARMACY-COUNTER-09]

**Type**: short
**Topic**: Pharmacy counter billing
**Persona**: Dr. Sunita Rao is the owner; pharmacist Meenakshi Iyer does it for her accountant, who needs a PDF of yesterday's bill.
**Goal**: Download one invoice as a PDF.
**Preconditions**: Logged in as PHARMACIST (or ADMIN, DOCTOR). Invoice is confirmed.
**Ideal path**: 3. Search for the bill, click download, done. A direct download in the Sales register would save the navigation.
**Alternate paths**: (a) Pharmacy Desk > "Invoices" > "Download Invoice" (this story). (b) Inventory > Sales > "Patient invoice history" (same list). (c) Sales register row "Print" then choose "Save as PDF" in the browser dialog. (d) Download PDF is also offered inside the sale-time preview after "Confirm Invoice". (e) Pharmacy Report > "Sales Bills" / "Sales Register".

### Steps
1. Click sidebar "Pharmacy Desk" → `/dashboard/pharmacy?section=desk`; title "Pharmacy Desk" with metric strips (Sales, Invoices, Stock, Packages), AI assistant launcher, "Partner daily sync" and "Treatment Packages" cards.
2. Click "Invoices" (top right) → `/dashboard/pharmacy/invoices`; title "Pharmacy Invoices"; cards "Total Invoices", "Total Amount", "Completed", "Pending Amount"; filters Search, Status, Payment Status, Payment Method, Date Range.
3. Click "Search" ("Invoice number, patient...") and type "Menon" → list filters.
4. Click the download icon "Download Invoice" in the card → PDF is generated and saved without a popup; failure raises a browser `alert()`.

### Variations
- Open instead of download: click the eye icon "View Invoice" (opens a popup window).
- Only completed bills: change Status filter (2 clicks).

### Edge Cases
- The Sales register already lists the same bills with search by Bill No, Patient and Mobile, so this page duplicates it; it uses older styling with browser `alert()` and `confirm()` boxes.
- The list shows a trash icon on every row (confirm dialog, then server refusal for finished bills).
- Same information on several surfaces: invoice number, patient, total and payment method are shown in the Sales register, this list, the bill's own page and the Pharmacy Report.

---

### Clinic billing and payments at the appointment: create bill, take payment, fee list, daily collection

### STORY-027: Bill a first consultation and take it in cash  [orig CLINIC-BILLING-01]

**Type**: short
**Topic**: Clinic billing and payments at the appointment
**Persona**: Meena Kulkarni, receptionist, Sri Skin and Hair Clinic, Hyderabad
**Goal**: Rohit Verma (34, first visit, Dr. Priya Reddy's 10:20 slot) has finished his consultation; record the ₹600 fee as paid in cash.
**Preconditions**: Meena is on `/dashboard/appointments`, tab "Calendar", Dr. Priya Reddy and today are selected. Fee list has First consultation = ₹600. Rohit's appointment row shows the chip "Not billed" and bill type "First".
**Ideal path**: 2. Open the bill, confirm; patient, appointment, visit, bill line, fee, amount and mode (Cash) are all known, and a save should leave the dialog or return to the calendar by itself.
**Alternate paths**: (a) Click the row (not the chip) to open dialog "Appointment Details", click "Create bill" in the "Bill:" line (this closes Appointment Details and opens the same bill dialog), +2 steps. (b) The "Slots" tab (`AppointmentScheduler`) has no billing at all. (c) `PatientProgressTracker` "Bill"/"Invoices" (on a visit page) goes to the pharmacy Sales bill (`billHref`), not to the clinic bill, so it is not a route to this goal. (d) `/dashboard/billing` redirects to pharmacy Sales; none of the clinic bill is there.

### Steps
1. Click the chip "Not billed" on Rohit Verma's row → dialog "Bill for Rohit Verma" opens, section "Create bill" shown (no earlier bills). "Bill line" is "First consultation" (default), "Fee" is 600 (default: from the fee list), "Paid now" is 600 (default: follows Fee), line "From fee list: First consultation ₹600", the payment-mode buttons show "Cash" selected (default: Cash). Button reads "Create bill and record ₹600". Nothing here needs typing; patient, appointment and visit are attached silently (app already knows this).
2. Click "Create bill and record ₹600" → toast "Bill INV-… created and ₹600 Cash recorded"; the dialog now lists the bill with a "Paid" badge, Total ₹600, Received ₹600, Due ₹0 and a payment line "₹600 Cash · <time>"; the row chip behind it changes to "₹600 · Paid". The dialog stays open.
3. Close the dialog (X or Escape; no explicit Close button exists) → back on the calendar, Rohit's row reads "₹600 · Paid".

### Variations
- Patient pays by card or UPI: add one step between 1 and 2, click "Card" or "UPI" in the payment-mode buttons (no reference box for either).
- Patient has not paid yet (pays at the end of the visit): at step 1 type 0 in "Paid now" (+1); button reads "Create bill" and the mode buttons disappear; chip becomes "₹600 due".
- Dr. Priya Reddy (DOCTOR) opens the same chip: she gets the read-only dialog; with no bill it says "Not billed yet. The front desk creates the bill." and shows no Create bill form.

### Edge Cases
- Fee list has no First consultation fee: "Fee" is empty (placeholder "Type the fee") with "No fee set for First consultation." and, for OWNER/ADMIN only, a "Set fees" link to `/dashboard/fees`; the button stays disabled until a fee is typed.
- Bill is created but the payment call fails: red message "Bill INV-… was created, but the payment was not recorded: <reason>"; the chip behind refreshes to "₹600 due"; the form stays open on a bill that now exists.
- Bill creation itself fails: "<reason> Nothing was saved."
- The dialog cannot be closed while it says "Saving…".
- Optimistic (just-booked, unsaved) rows have a disabled chip.

---

### STORY-028: Collect part of a balance by UPI  [orig CLINIC-BILLING-02]

**Type**: short
**Topic**: Clinic billing and payments at the appointment
**Persona**: Meena Kulkarni, receptionist
**Goal**: Suresh Naidu owes ₹3,500 on a procedure bill and pays ₹2,000 now by UPI, the rest later.
**Preconditions**: Suresh's procedure appointment row shows the chip "₹4,500 · ₹3,500 due" (bill of ₹4,500, ₹1,000 received earlier). Calendar open as in story STORY-027 (CLINIC-BILLING-01).
**Ideal path**: 4. Open the bill, type the part amount, pick UPI, confirm. (A full settlement would be 2: open, confirm with the amount and mode already right.)
**Alternate paths**: Row click then "Appointment Details" > "Open bill" (+1 step, same dialog). No other screen records a clinic payment. The backend has `POST /billing/payments/bulk` and `payments/:id/confirm`, neither has UI.

### Steps
1. Click the chip "₹4,500 · ₹3,500 due" → dialog "Bill for Suresh Naidu" lists bill INV-… with a "Due ₹3,500" badge, Total/Received/Due, the earlier "₹1,000 Card" payment line, and section "Record payment".
2. Type 2000 in "Amount received" (optional to change; default: the full balance, 3500; app already knows the balance) → button text becomes "Record ₹2,000 payment".
3. Click "UPI" in the payment-mode buttons (default: Cash) → UPI is highlighted; no reference box for UPI.
4. Click "Record ₹2,000 payment" → toast "₹2,000 UPI recorded on INV-…"; payment list gains "₹2,000 UPI · <time>"; Due shows ₹1,500; "Amount received" resets to 1500.
5. Close the dialog → row chip reads "₹4,500 · ₹1,500 due".

### Variations
- Settle in full by cash: steps 1 and 4 only (button reads "Record ₹3,500 payment"), plus the close.
- Payment by Net banking / NEFT or Cheque: after choosing the mode, an optional field appears ("Bank reference / UTR (optional)" or "Cheque number (optional)"); typing it adds 1 step.
- Two bills with a due on one appointment: an extra row of radio buttons "Bill to pay" appears ("INV-… · Due ₹x"); the first bill is chosen by default, choosing another adds 1 step.

### Edge Cases
- Amount above the balance or 0: red text "Enter an amount above 0 and up to the ₹3,500 due." and the button is disabled.
- Amount typed as "2,000" or "₹ 2000" is accepted (`parseRupees`); "2000.555" or "two thousand" is refused as invalid.
- A payment that fails server-side shows "<reason> Nothing was saved." and the calendar is reloaded.
- "Record payment" is hidden while "Add another bill" is open and for roles without payment access.

---

### STORY-029: Procedure bill with no fee on the list, paid part by cheque  [orig CLINIC-BILLING-03]

**Type**: medium
**Topic**: Clinic billing and payments at the appointment
**Persona**: Meena Kulkarni, receptionist
**Goal**: Farhan Qureshi (41) had a "Chemical peel" procedure; bill ₹3,500 and take a ₹2,000 cheque advance.
**Preconditions**: Appointment is visit type Procedure with Procedure Name "Chemical peel" (shown in the row as "(Chemical peel)"); the fee list has no Procedure fee ("Not set"); Meena is a RECEPTION user, so she has no link to the fee list. Row chip: "Not billed".
**Ideal path**: 5. Open the bill, type the fee (it varies per procedure), type the amount paid, pick the mode, confirm; the cheque number is an optional extra.
**Alternate paths**: Row click > "Appointment Details" > "Create bill" (+1). The standalone page `/dashboard/procedures` ("Smart Procedures Management") records the procedure but has no fee or payment. The Procedure fee could be set once on `/dashboard/fees` (see story STORY-034 (CLINIC-BILLING-08)) so this step disappears for next time, but only OWNER/ADMIN can do so.

### Steps
1. Click the chip "Not billed" on Farhan's row → dialog "Bill for Farhan Qureshi", description "Procedure · <date> · <slot>"; "Bill line" is "Procedure: Chemical peel" (default: built from bill type and procedure name); "Fee" is empty; text under the fields reads "No fee set for Procedure." (no "Set fees" link, because Meena cannot edit fees); button "Create bill" is disabled.
2. Type 3500 in "Fee" (required field) → "Paid now" mirrors to 3500 (default: follows Fee); the mode buttons appear because paid is above 0; button reads "Create bill and record ₹3,500".
3. Type 2000 in "Paid now" (optional; 0 allowed) → button reads "Create bill and record ₹2,000". Typing here detaches it from the Fee field.
4. Click "Cheque" in the payment-mode buttons (default: Cash) → field "Cheque number (optional)" appears.
5. Type 004512 in "Cheque number (optional)" → kept (max 60 characters).
6. Click "Create bill and record ₹2,000" → toast "Bill INV-… created and ₹2,000 Cheque recorded"; bill shows "Due ₹1,500", payment line "₹2,000 Cheque · 004512 · <time>".
7. Close the dialog → chip reads "₹3,500 · ₹1,500 due".

### Variations
- She wants the line to read "Chemical peel (glycolic 35%)": clicking "Bill line" and editing it adds 1 step (max 120 characters; required, empty disables the button).
- Cash advance instead of a cheque: skip steps 4 and 5.
- The doctor later says the fee should be ₹4,000: there is no edit on an existing bill in this dialog (fee list changes never touch a bill already made); the only route is "Add another bill" for the difference (see story STORY-031 (CLINIC-BILLING-05)) or an admin through the API, which has no UI.

### Edge Cases
- "Paid now" above the fee: red "Paid now can be from 0 up to the fee." and the button is disabled.
- Fee typed as "3500.5" is accepted (up to 2 decimals); "35,00" is read as 3500; "abc" shows "Enter the fee as an amount above 0, for example 500."
- Fee 0 or negative is refused with the same message.
- Phone width: the chip shows only "₹!" for a finished visit not billed, or nothing as text for a quiet "Not billed" (empty string, only the border shows), so it is a small unlabelled target.

---

### STORY-030: Give a senior-citizen concession by editing the fee  [orig CLINIC-BILLING-04]

**Type**: medium
**Topic**: Clinic billing and payments at the appointment
**Persona**: Meena Kulkarni, receptionist
**Goal**: Lakshmi Devi (62, review visit) gets a ₹300 concession rate against the ₹400 Review fee, pays UPI. Meena first mistypes the amount.
**Preconditions**: Fee list has Review = ₹400. Lakshmi's row shows bill type "Review" and chip "Not billed".
**Ideal path**: 3. Open the bill, type the concession fee, confirm (with a reason and who approved it recorded, which this app does not ask for). Payment mode UPI would add 1 step.
**Alternate paths**: none found. There is no discount field on a clinic bill; the only way to charge less is overtyping "Fee", which leaves no reason and no trace other than the amount. (The pharmacy Sales bill has "Edit discount" with a reason, but that is for pharmacy bills only.)

### Steps
1. Click the chip "Not billed" → dialog "Bill for Lakshmi Devi", "Bill line" is "Review consultation" (default), "Fee" is 400 (default), "Paid now" 400 (default), text "From fee list: Review ₹400".
2. Type 3000 in "Fee" (slip, an extra zero) → text becomes "Fee list: Review ₹400, changed for this bill." with a link-style button "Use ₹400"; "Paid now" follows to 3000 and the button reads "Create bill and record ₹3,000". Nothing warns that ₹3,000 is 7.5 times the listed fee.
3. Click "Use ₹400" → Fee returns to 400, text "From fee list: Review ₹400"; "Paid now" follows to 400.
4. Type 300 in "Fee" → "Paid now" follows to 300; text "Fee list: Review ₹400, changed for this bill."
5. Click "UPI" → UPI highlighted (default: Cash).
6. Click "Create bill and record ₹300" → toast "Bill INV-… created and ₹300 UPI recorded"; bill line shows "Review consultation ₹300".
7. Close the dialog → chip "₹300 · Paid".

### Variations
- Patient is waived entirely: a fee of 0 is not accepted ("Enter the fee as an amount above 0"), so a free review cannot be billed; the row stays "Not billed" with attention colouring if the visit is finished.
- Doctor approves a concession: Dr. Priya Reddy has no bill actions, so approval is verbal.

### Edge Cases
- "Use ₹400" is only shown while the fee differs from the list; it is the only guard against a mistyped amount.
- Bill line text and fee are silently saved as a single line with no discount field; the reason for ₹300 is lost.
- If Meena typed 300 in "Paid now" first and then changed the Fee, Paid now no longer follows the Fee (it only follows until the first edit of Paid now).

---

### STORY-031: Add an extra bill for a procedure done on the same visit, pay later  [orig CLINIC-BILLING-05]

**Type**: medium
**Topic**: Clinic billing and payments at the appointment
**Persona**: Meena Kulkarni, receptionist
**Goal**: Anita Joshi's first consultation (₹600) is already paid; Dr. Priya Reddy removed a skin tag, so add a ₹1,200 "Skin tag removal" bill, leave it unpaid, and take it by UPI at the end of the day.
**Preconditions**: Row chip reads "₹600 · Paid" (one bill). Meena is a RECEPTION user.
**Ideal path**: 6. Open the bill, add a bill, give a line and fee, confirm; later open and confirm payment with mode (open, mode, confirm = 3). Total 7; with a service list for lines/fees this could be 6.
**Alternate paths**: Row click > "Appointment Details" > "Open bill" (+1 for either visit to the dialog). The "Add another bill" button exists only inside this dialog. Nothing else creates clinic bills.

### Steps
1. Click the chip "₹600 · Paid" → dialog "Bill for Anita Joshi" lists the paid bill and a ghost button "Add another bill" (there is no Create form while a bill exists).
2. Click "Add another bill" → section "Add another bill" opens with "Bill line" "First consultation" (default: from this appointment's bill type, wrong for this add-on), "Fee" 600 (default: the fee list's First consultation, wrong for this add-on), "Paid now" 600 (follows the fee). The "Record payment" section is hidden while this form is open (it is not due anyway).
3. Type "Skin tag removal" in "Bill line" (required field) → replaces the default.
4. Type 1200 in "Fee" (required field) → text "Fee list: First consultation ₹600, changed for this bill."; "Paid now" follows to 1200.
5. Type 0 in "Paid now" (optional) → mode buttons disappear; button reads "Create bill". The patient will pay later.
6. Click "Create bill" → toast "Bill INV-… created"; dialog shows "2 bills · ₹1,800 · Due ₹1,200" and a new bill with "Due ₹1,200"; "Record payment" section appears.
7. Close the dialog → chip reads "₹1,800 · ₹1,200 due" (desktop wide: "₹1,800 · ₹1,200 due · 2 bills").
8. Later, click the chip again → dialog opens with section "Record payment", "Amount received" 1200 (default: balance).
9. Click "UPI" → selected (default: Cash).
10. Click "Record ₹1,200 payment" → toast "₹1,200 UPI recorded on INV-…"; Due ₹0; summary "2 bills · ₹1,800 · Paid".
11. Close the dialog → chip "₹1,800 · Paid" (wide rows add "· 2 bills").

### Variations
- Pay at the time of adding: type 1200 (or leave it, since Paid now would follow Fee), choose "UPI", "Create bill and record ₹1,200", for about 5 steps in total instead of 11.
- She opens "Add another bill" and changes her mind: "Cancel" (appears only in this mode) returns to the bill list and the form resets to defaults.

### Edge Cases
- The defaults pre-fill the wrong line and fee for an add-on, so the two fields must always be overwritten; forgetting the Fee would double-charge ₹600 "First consultation".
- If there are two bills with money due, "Bill to pay" radio buttons appear; the first due bill is chosen by default.
- A fee list change after bill 1 does not alter bill 1 (the Fee list page says so).

---

### STORY-032: Owner checks the day's clinic takings  [orig CLINIC-BILLING-06]

**Type**: short
**Topic**: Clinic billing and payments at the appointment (daily collection)
**Persona**: Dr. Kavita Rao, owner
**Goal**: See how much the front desk collected today on consultations and procedures, and what is still due, then compare with yesterday.
**Preconditions**: Logged in as OWNER; bills from stories STORY-027 (CLINIC-BILLING-01) to 05 exist for today.
**Ideal path**: 1. One click on a menu entry that opens today's collection with clinic takings first.
**Alternate paths**: (a) Sidebar "Pharmacy Report", then the report card "Daily Collection" under Accounting Reports (or the "common reports" list on its landing page), +1 step, same report. (b) Reports page `/dashboard/reports` ("Reports & Analytics") > "Payment Analytics" or "Revenue Report" > "Generate" shows "Payment Mode Breakdown" from billing payments: +4 steps (card, date range, "Generate", read) and a different layout. (c) Header Notifications and dashboard "System Alerts" (Overdue Invoices, Pending Payments) show overdue amounts but link to pharmacy Sales (`?pay=CREDIT`), not clinic bills. (d) No role can see a per-patient list of unpaid clinic bills except by opening each calendar row.

### Steps
1. Click "Daily Collection" in the sidebar (Overview section) → route `/dashboard/pharmacy/reports?report=daily-collection`; "Day" is today (default). Headings appear: "Whole day" with tiles "Whole day", "Clinic", "Pharmacy" and a per-mode table; then "Clinic: consultations and procedures" with tiles "Clinic received" (₹5,450 in the day's example), "Clinic billed today", "Clinic still due", a mode table and a bill-by-bill table; then "Pharmacy" with a status line such as "Pharmacy not counted yet. Count the pharmacy cash drawer…".
2. Click "Previous day" (arrow button) → the same report for yesterday; "Next day" is disabled once on today and a "Today" button appears.

### Variations
- Pick a date with the "Day" field: type or choose a date, +1 step (applied immediately; there is no Go button for the day stepper).
- Download or Print the report: a "Download" menu offers Excel (.xlsx), CSV, PDF, and a "Print" button prints the PDF (+2 steps).
- DOCTOR (Dr. Priya Reddy) sees the same clinic section; PHARMACIST, ACCOUNTANT and MANAGER see only the pharmacy part, because the clinic section appears only for a viewer with clinic bill read access.
- RECEPTION (Meena) has no "Daily Collection" entry in her sidebar, so the person who took the cash cannot see the day's takings.

### Edge Cases
- "Clinic received" counts payments received today on bills of any date, less refunds; "Clinic billed today" counts only bills dated today, so the two numbers differ whenever an earlier balance is settled.
- The Reports page also shows a "Payment Mode Breakdown" (twice: in Revenue Report and Payment Analytics); the numbers come from a different query and layout than Daily Collection.
- Load failure shows an error with the HTTP status instead of the report.

---

### STORY-033: Count the pharmacy drawer against the day's expected collection  [orig CLINIC-BILLING-07]

**Type**: medium
**Topic**: Clinic billing and payments at the appointment (daily collection)
**Persona**: Imran Sheikh, pharmacist
**Goal**: At closing time, enter what is physically in hand by payment mode and see if the drawer is short.
**Preconditions**: Logged in as PHARMACIST (allowed to record counts: OWNER, ADMIN, MANAGER, DOCTOR, PHARMACIST). Today's pharmacy sales exist; no count saved yet.
**Ideal path**: 5. Open the report, type the count for each of three modes, save (the optional note is extra).
**Alternate paths**: Sidebar "Pharmacy Report" > "Daily Collection" card (+1). ACCOUNTANT and others who can read the report see the "Counted" values but have no inputs. No other screen records a count. Note the count covers the pharmacy drawer only; clinic cash is not counted anywhere, so a clinic shortfall is never flagged.

### Steps
1. Click "Daily Collection" in the sidebar → today's report; status line "Pharmacy not counted yet. Count the pharmacy cash drawer and check its UPI and card settlements, then enter them below."; table "Pharmacy reconciliation by payment mode" has one row per mode with columns "Today's bills", "Earlier bills", "Counter", "Refunds", "Expected" (all calculated by the app; app already knows this), "Counted" (an input per row) and "Difference".
2. Type 18250 in the "Cash counted" input (required field for at least one mode; accepts "18,250.50" or "₹ 18,250") → Difference shows e.g. "-₹250.00" in red as soon as typed (live preview).
3. Type 9430 in the "UPI counted" input (optional; a blank mode is treated as nothing in hand once any amount is entered) → difference updates.
4. Type 3100 in the "Card counted" input (optional) → "Total" row shows Counted and Difference.
5. Type "₹500 kept aside for change" in "Note (optional)" (optional, max 500 characters) → placeholder example is the same sentence.
6. Click "Save count" → message "Count saved. Pharmacy short by ₹250.00. Check the drawer, pending UPI settlements and any refunds paid in cash." and a line "Counted by Imran Sheikh at <time>" (expandable, "<n> earlier count(s)").

### Variations
- Later recount: the inputs start from the last saved count, so changing only Cash is 1 typed step plus "Save recount" (the button is disabled until something changed).
- Phone width: the table turns into one card per mode with the same "Counted" input and live Difference.
- A mode with no sales that day and no refunds is not listed, so a UPI payment received without a bill cannot be counted under a missing row.

### Edge Cases
- Typing text such as "eighteen thousand": red "Enter amounts as numbers, for example 18250 or 18,250.50." and the button disables.
- Another user saved a count first (409): "Someone else saved a count for this day while you were entering yours. Their count is shown below; your figures are still in the boxes. Check them and save again."
- "Save count" is disabled until at least one amount is entered.

---

### STORY-034: Change a consultation fee on the Fee list  [orig CLINIC-BILLING-08]

**Type**: short
**Topic**: Clinic billing and payments at the appointment (fee list)
**Persona**: Dr. Kavita Rao, owner
**Goal**: Raise the Review fee from ₹350 to ₹400 from today.
**Preconditions**: Logged in as OWNER (or ADMIN). Fee list has First consultation ₹600, Review ₹350, Procedure not set.
**Ideal path**: 3. Open the fee list, type the new fee, save.
**Alternate paths**: none found for editing. Another entry point only: the "Set fees" link inside a bill dialog (shown only when no fee exists for that bill type and the viewer is OWNER/ADMIN) goes to the same page. Non-admins see only "Only an admin can change the fee list."

### Steps
1. Click "Fee list" in the sidebar (Admin section) → page "Fee list" with a description ("Create bill on the appointments calendar starts from these fees, billed without GST. The desk can still change the amount on a bill. Changing a fee here never changes a bill already made."); three rows First consultation, Review, Procedure, each with a "₹" field, a status line such as "₹350 · changed <date time> by <name>" or "No fee set yet", and a "Save" button (disabled until the value changes).
2. Type 400 in the Review row "₹" field (required to save; an empty box means "clear this fee") → button stays "Save".
3. Click "Save" (or press Enter) → toast "Review fee saved: ₹400"; status line shows "₹400 · changed <now> by Dr. Kavita Rao".

### Variations
- Set the Procedure fee for the first time: type 3500 in that row, "Save" (3 steps); the status "No fee set yet" is replaced. Note that a Procedure fee is one flat amount even though each procedure (peel, PRP, laser) is priced differently.
- Clear the fee: empty the field; the button turns into "Clear fee", click it (toast "Review fee cleared"); the bill dialog then shows "No fee set for Review."
- Two fees changed: each row saves on its own, so two fees cost 2 typed fields and 2 "Save" clicks, 4 + 1 navigation.

### Edge Cases
- Amount above ₹10,00,000, 0 or text: red "Enter an amount above 0 and up to ₹10,00,000, for example 500."
- Version conflict (another admin saved first): message from the server, their fee becomes the shown base, and "Your ₹400 is still in the box."
- A non-admin (for example MANAGER or ACCOUNTANT) who opens `/dashboard/fees` by URL sees a lock empty state.
- Existing bills never change when a fee changes.

**Merged from**: ADMIN-SETUP-05 ("Owner raises the Review consultation fee"), a substantially identical journey (same goal, same screens). Its full text is kept below as a variant so no steps are lost.

#### Merged variant: ADMIN-SETUP-05 (Owner raises the Review consultation fee)
**Type**: short
**Topic**: Admin and setup (fee list)
**Persona**: Dr. Sunita Rao, OWNER, moving the review fee from ₹400 to ₹500 from next month
**Goal**: Update the "Review" fee used when reception creates bills on the appointments calendar.
**Preconditions**: Logged in as OWNER or ADMIN; fee list already has First consultation, Review, Procedure rows.
**Ideal path**: 3 (open Fee list, type amount, Save). Each fee saves alone.
**Alternate paths**: Appointment bill dialog `AppointmentBillDialog` has a link "Set fees" that opens this same page (a second route to the page, not a second editor). Non-admins reaching `/dashboard/fees` see "Only an admin can change the fee list."

##### Steps
1. Click sidebar "Fee list" (Admin section) → page "Fee list", three rows, each with name, when it applies ("A patient who has visited before"), status line ("₹400 · changed 02 Nov 2026 by Sunita Rao") and a "₹" box.
2. Click the "₹" box on the "Review" row and replace 400 with 500 (required to change; placeholder "Not set") → button "Save" becomes enabled (it stays disabled while the value equals the saved one).
3. Click "Save" → toast "Review fee saved: ₹500", status line updates with time and name. No confirmation dialog; existing bills are not changed (the page description says so).

##### Variations
- Empty the box → button reads "Clear fee" → click to remove the fee (toast "Review fee cleared").
- Enter 0 or above ₹10,00,000 → inline "Enter an amount above 0 and up to ₹10,00,000, for example 500."

##### Edge Cases
- Another admin changed the same fee first: red message with their change and "Your ₹500 is still in the box."; row reloads to the new saved fee.
- MANAGER and ACCOUNTANT: no sidebar entry; direct URL shows the locked message.
- The same fee shows later on the appointment row chip ("₹500 due"), the "Appointment Details" dialog and the "Bill for <patient>" dialog.

---

### STORY-035: A clinic morning to closing time, from fee setup to collection check  [orig CLINIC-BILLING-09]

**Type**: long
**Topic**: Clinic billing and payments at the appointment
**Persona**: Dr. Kavita Rao (owner) sets fees; Meena Kulkarni (receptionist) bills three patients; Dr. Kavita Rao checks the collection that evening.
**Goal**: Fees set, three patients billed (Rohit Verma cash, Ananya Iyer UPI, Suresh Naidu procedure with part payment settled later), and the evening Daily Collection matches the receipts.
**Preconditions**: A fresh clinic with no fees set. Today's appointments for Dr. Priya Reddy: Rohit Verma (first visit), Ananya Iyer (review), Suresh Naidu (procedure "PRP session"), all with finished consultations. Meena's last-used doctor and date are remembered by the calendar (default: today, last doctor).
**Ideal path**: 29. Fees 4 (open, two fields, one save), three sign-ins 9, two log-outs 2, bills 2 + 3 + 5, balance 2, open Appointments 1, Daily Collection 1.
**Alternate paths**: Per story: bill by row click > "Appointment Details" > "Create bill"; Daily Collection via "Pharmacy Report". The fee list has no other route. Role switching by logging out is the only way to give owner-only and receptionist-only screens to one person, because RECEPTION has no Fee list or Daily Collection and OWNER sees no "Pharmacy Counter" but can use Create bill.

### Steps
1. Type owner@sriskin.example in "Phone or email" (required) on the login card "ClinicMS Login" → filled.
2. Type the password in "Password" (required) → filled.
3. Click "Sign in" → lands on `/dashboard`.
4. Click "Fee list" in the sidebar → page with three "No fee set yet" rows.
5. Type 600 in the First consultation "₹" field → "Save" enabled.
6. Click "Save" on First consultation → toast "First consultation fee saved: ₹600".
7. Type 350 in the Review "₹" field → "Save" enabled.
8. Click "Save" on Review → toast "Review fee saved: ₹350". Procedure is left unset on purpose (prices vary by procedure).
9. Click "Log out" in the sidebar footer → back at login.
10. Type Meena's phone number in "Phone or email" (required) → filled.
11. Type her password in "Password" (required) → filled.
12. Click "Sign in" → `/dashboard`; her sidebar has Dashboard, Patients, Appointments, Rooms, Pharmacy Desk, Pharmacy Counter, Inventory (no Fee list, no Daily Collection).
13. Click "Appointments" → tab "Calendar" opens with the remembered doctor and today (default).
14. Click the chip "Not billed" on Rohit Verma's row → "Bill for Rohit Verma": line "First consultation", Fee 600 (default from fee list), Paid now 600 (default), Cash selected (default).
15. Click "Create bill and record ₹600" → toast "Bill INV-… created and ₹600 Cash recorded".
16. Close the dialog → Rohit's chip "₹600 · Paid".
17. Click the chip on Ananya Iyer's row → dialog with line "Review consultation", Fee 350, Paid now 350, Cash selected.
18. Click "UPI" → selected.
19. Click "Create bill and record ₹350" → toast "Bill INV-… created and ₹350 UPI recorded".
20. Close the dialog → chip "₹350 · Paid".
21. Click the chip on Suresh Naidu's row → dialog with line "Procedure: PRP session", Fee empty, "No fee set for Procedure." with no "Set fees" link (Meena cannot edit fees).
22. Type 4500 in "Fee" (required) → Paid now mirrors 4500.
23. Type 1000 in "Paid now" (optional) → button "Create bill and record ₹1,000".
24. Click "Card" → selected (default was Cash).
25. Click "Create bill and record ₹1,000" → toast "Bill INV-… created and ₹1,000 Card recorded"; Due ₹3,500.
26. Close the dialog → chip "₹4,500 · ₹3,500 due".
27. In the afternoon Suresh returns; click the chip "₹4,500 · ₹3,500 due" → "Record payment" with "Amount received" 3500 (default: balance), Cash selected (default).
28. Click "Record ₹3,500 payment" → toast "₹3,500 Cash recorded on INV-…"; Paid.
29. Close the dialog → chip "₹4,500 · Paid".
30. Click "Log out" → login.
31. Type the owner's "Phone or email" → filled.
32. Type the owner's "Password" → filled.
33. Click "Sign in" → `/dashboard`.
34. Click "Daily Collection" in the sidebar → "Whole day" tiles; "Clinic received" is ₹5,450 (600 + 350 + 1,000 + 3,500), "Clinic billed today" ₹5,450, "Clinic still due" ₹0; the mode table shows Cash ₹4,100, UPI ₹350, Card ₹1,000; "clinic-bills" lists the three bills.

### Variations
- Owner bills too: OWNER passes the role check and has the stored grants, so steps 9 to 12 could be skipped; the clinic does not do this because the owner is not at the desk.
- Fee list left empty: the receptionist types every fee (3 more typed fields across the day) and an admin is needed for "Set fees".
- A cheque patient: see story STORY-029 (CLINIC-BILLING-03) (+2 steps).

### Edge Cases
- Session expiry in the middle: any 401 sends to `/login` and the path is remembered (`?next=`), so after sign-in Meena returns to the calendar but her open dialog and typed values are lost.
- Meena opens `/dashboard/pharmacy/reports?report=daily-collection` by URL: the Pharmacy Report roles do not include RECEPTION, so the API refuses; the clinic cash she took is visible to her only through each calendar chip.
- The per-mode day table counts "Earlier bills" separately, so Suresh's ₹3,500 shows under today's receipts even if his bill were dated yesterday.

---

### Patient records: list, search, detail, history, photos, portal link, archive, export

### STORY-036: Receptionist finds a returning patient by phone number  [orig PATIENT-RECORDS-01]

**Type**: short
**Topic**: Patient records
**Persona**: Pooja Nair, receptionist, 9:40 on a busy Monday. Sunita Verma walks in for a review and says "my number is 98480 12345".
**Goal**: Open Sunita Verma's patient record.
**Preconditions**: Pooja is signed in as RECEPTION. Sunita is registered (phone 9848012345) and not archived.
**Ideal path**: 3. Open Patients, type the phone number, click the match; the search box should already have focus on arrival.
**Alternate paths**:
- Header global search "Search patients, appointments, doctors..." (type, click result). Its patient result links to `/dashboard/patients?search=<internal patient id>`, but the server search does not match on id (only name, phone, ABHA, patient code, email), so the list lands on "No patients found". This route is effectively broken; the user has to retype the name into the list's own search box.
- Appointments page patient picker "Search patient by name/phone" (opens a booking context, not the record).
- Visits setup "Select Patient" ("Search name, phone, or email") (clinical, not the record).
- Doctors only: Dashboard card "My Patients" (patients whose primary doctor is the signed-in doctor) links straight to the detail page.

### Steps
1. Click "Patients" in the sidebar (Clinical section) → `/dashboard/patients`, "Patients Management", skeleton "Loading patients…", then 20 rows A to Z.
2. Click the search box (placeholder "Search by name, phone, ABHA, or email (min 2 chars)"; the page does not autofocus it) (app already knows this: the page is a patient search page, yet needs a click to start typing).
3. Type "9848012345" (required to search; 2 characters minimum). While 1 character is typed the hint reads "Enter at least 2 characters to search" and a "Did you mean" chip list is built from the current page only. After 500 ms the list shows one row for Sunita Verma.
4. Click the row (or its "View" button; both open the same page) → `/dashboard/patients/<id>`.

### Variations
- Last 4 digits only ("2345"): no match, because phone is matched from the start (starts-with). Pooja must retype the full number.
- Name search "verma": matches by contains, returns every Verma; she disambiguates by age and phone in the Contact column.
- Patient code: typing the code (case-insensitive) matches by prefix. The code is also shown on the detail page badge "Code:".
- Pooja only knows the email: "@" fragments work because email is matched by contains.

### Edge Cases
- Zero matches: card shows "No patients found" with "Adjust your search or filters to find a patient." and no "Register" shortcut next to it; she must click "New Patient" at the top.
- Search term retained but a filter (Gender, Consultation Type, Date Range) set earlier narrows results silently; the only reset is "Clear Filters" at the top right, far from the filters.
- The same patient identity (name, age, gender, phone, ABHA) appears on the list row, the detail header badges, the detail "Primary contact" card and the "Info" tab (phone and email twice on one page; gender and age twice).

---

### STORY-037: Receptionist registers a new patient  [orig PATIENT-RECORDS-02]

**Type**: short
**Topic**: Patient records
**Persona**: Pooja Nair, receptionist. Ramesh Gupta, 42, comes in on a Google referral for the first time; he will see the doctor later this week, so no walk-in booking.
**Goal**: Create Ramesh's record so he can be booked tomorrow.
**Preconditions**: RECEPTION signed in; no existing record for this phone.
**Ideal path**: 6. New Patient, name, age, gender, phone, Create; phone typed once, name in one field, referral and consultation type left to defaults.
**Alternate paths**:
- Appointments, patient picker, "+ Add "<name>" as a new patient" opens dialog "Add New Patient" (`PatientQuickCreateDialog`: first and last name, age, gender, phone, ABHA, consultation type). A second, different form for the same record.
- Patients "New Patient" with Patient Type "Walk-in" (see STORY-039 (PATIENT-RECORDS-04)): creates the record and auto-books.
- Registering a patient is not available from the patient detail page.

### Steps
1. Click "New Patient" (top left, above the filters) → dialog "Create Patient" opens (doctors and rooms are fetched in the background).
2. Type "Ramesh" in "First Name" (required field; label has no asterisk, the app only says "Please fill in all required fields (Name, Phone)" after Create).
3. Type "Gupta" in "Last Name" (optional).
4. Type "42" in "Age (years)" (optional; number input, placeholder "e.g. 35").
5. Select "Male" in "Gender" (default: Other; optional in effect because it is pre-filled).
6. Type "9701234567" in "Phone" (required field; no format check on length or digits).
7. Select "Google" in "How did the patient hear about us?" (optional; options Instagram, Twitter, Google, Doctor, Friends & Family, Other).
8. Click "Create" → patient saved, dialog closes and form resets, list refetches. No success toast and no navigation to the new record; Pooja must search for Ramesh to open him.

Fields left untouched but visible in the dialog (all optional, with defaults): "ABHA ID (Ayushman Bharat Health Account)" (placeholder "Optional - Enter 14-digit ABHA number"), "Email", "Address", "Emergency Contact", "Consultation Type" (default: Offline (In-Clinic Visit)), "Primary Doctor" (default: Automatic, with help text "A doctor registering the patient becomes the primary doctor; otherwise the first visiting doctor does."), "Patient Type" (default: Non walk-in), "Doctor (for walk-in)".

### Variations
- Add the ABHA ID: must be exactly 14 digits or the dialog shows "ABHA ID must be a 14-digit number".
- Cancel (or close with the X): form resets, nothing saved, no confirm dialog even after typing.
- Doctor registering: choosing nothing in "Primary Doctor" makes that doctor the primary doctor (by the help text).

### Edge Cases
- Missing First Name or Phone: red box "Please fill in all required fields (Name, Phone)" in the dialog; Last Name is not validated.
- The same person registered twice (different phone): no duplicate warning in the UI; duplicate merging exists only as a backend cron.
- Information entered here (first/last name, age, phone, gender) is shown again on list row, detail header and the booking dialog; "Age" is entered as years, not date of birth (the app's Quick Guide text claims date of birth is required, which is stale).

---

### STORY-038: Doctor checks the last visit's diagnosis and medicines  [orig PATIENT-RECORDS-03]

**Type**: short
**Topic**: Patient records
**Persona**: Dr. Meera Iyer, dermatologist, between consults. Kavya Menon, her own patient, is back with a flare-up and asks "what cream did you give me last time?"
**Goal**: See Kavya's last diagnosis and the medicines prescribed.
**Preconditions**: Doctor signed in; Kavya has Dr. Iyer as primary doctor and at least one documented visit with a prescription.
**Ideal path**: 2. Open the patient from the dashboard list; last visit's diagnosis and medicines already on screen.
**Alternate paths**:
- Patients list: sidebar, search, row, "History" tab (4 to 5 steps instead of 2).
- Dashboard card "Recent Visits" opens the visit form itself (`/dashboard/visits?patientId=&visitId=`), not a read-only summary.
- Visit form tab "History" and Visits setup tab "Patient History" show the same past visits.
- Header "Resume last visit" on the detail page opens the last visit form.

### Steps
1. On `/dashboard` (the landing page), in card "My Patients" ("Patients with you as their primary doctor (N)") click "Kavya Menon" (use "Next" if she is not on page 1; each row shows "Last visit <date>") → `/dashboard/patients/<id>`.
2. Click tab "History" (default tab is "Info"; the history and the diagnosis are not on the first screen; "Last visit" date is, but not its diagnosis) → card "Patient History" loads; newest visit's card shows date, doctor, status badge, "Chief Complaint" and "Diagnosis" in the collapsed card. The diagnosis is answered here.
3. Click "Show details" on that visit card (needed for medicines) → card expands to compact view with "History" and "Medicines" (names only); optional "Full details" shows Examination, Treatment plan, Vitals, Prescription and more.

### Variations
- Kavya is not Dr. Iyer's patient: "My Patients" does not list her (it lists primary-doctor patients only), so Dr. Iyer must go via Patients, search, row (4 to 5 steps).
- Appointment-only entries (no documentation) appear with label "Appointment" and the text "Appointment only — no visit documentation recorded." and have no "Resume session" button.

### Edge Cases
- Past visits with no content are hidden entirely (`isEmptyHistoryEntry`); a visit that is "missing" from history may exist but be empty.
- History re-fetches every time the browser window regains focus and while loading it replaces the cards, so any card the doctor had expanded collapses again after switching windows and back.
- Same information on several surfaces: last visit date appears in the detail header card, the tracker, the History tab and the dashboard row; diagnosis appears in the History card, the visit form "History" tab and Visits setup "Patient History".

---

### STORY-039: Walk-in patient from empty search to first visit, with a typo fix  [orig PATIENT-RECORDS-04]

**Type**: long
**Topic**: Patient records
**Persona**: Pooja Nair, receptionist. Imran Qureshi, 29, walks in with no appointment, no record in the system, wants to see Dr. Suresh Reddy now.
**Goal**: Register Imran, get him a confirmed slot with Dr. Reddy, check the booking, correct a mistyped surname, and hand him over to the doctor.
**Preconditions**: RECEPTION signed in; Dr. Suresh Reddy has working hours and a free slot today; Imran has no record.
**Ideal path**: 10. Patients, type phone, New Patient (phone and name carried over from the search), name, age, gender, doctor, Create, record opens with the booked slot shown, Start Visit. No separate typo fix, no re-search, no Back navigation.
**Alternate paths**:
- Appointments page: "Calendar" tab, click a free time, patient picker, "+ Add "<name>" as a new patient", then "Confirm Booking" (separate new-patient form, plus the slot picked manually).
- Appointments tab "Slots" (`AppointmentScheduler`) does the same as the Calendar tab.
- Patient detail "Book appointment" and the tracker "Book" button both open `/dashboard/appointments?patientId=` for an existing patient.
- Start Visit has many entry points (list "Start Visit", detail "Start new visit", tracker "Start Visit"); they all go to `/dashboard/visits?patientId=&autoStart=true`.

### Steps
1. Click "Patients" in the sidebar → patients list.
2. Click the search box.
3. Type "9812345670" → after 500 ms the card shows "No patients found" ("Adjust your search or filters to find a patient.").
4. Click "New Patient" → dialog "Create Patient". The search text is not carried into the form (app already knows this: the phone was just typed).
5. Type "Imran" in "First Name" (required field).
6. Type "Quereshi" in "Last Name" (optional; Pooja mistypes the surname here).
7. Type "29" in "Age (years)" (optional).
8. Select "Male" in "Gender" (default: Other).
9. Type "9812345670" in "Phone" (required field) (app already knows this: same number as in step 3).
10. Select "Google" in "How did the patient hear about us?" (optional).
11. Select "Walk-in" in "Patient Type" (default: Non walk-in) → reveals "Appointment Type (walk-in)" (default: OPD Consultation) and "Room (optional for OPD)".
12. Select "Dr. Suresh Reddy" in "Doctor (for walk-in)" (optional in the form, but without it no booking is made; help text: "...the next available slot will be automatically booked after saving.").
13. Click "Create" → patient saved; app checks today and up to 7 days ahead for the first free 30-minute slot on the Confirmed calendar, then books it. Toast "Walk-in appointment booked" ("Booked into the Confirmed calendar for <date> at <slot>"). If the slot is taken, a prompt "Overbook this slot?" appears (guards double-booking; "Cancel" / "Book anyway"). If nothing is free in 7 days the toast "No slots available" appears and no appointment exists, but the patient was still created. Dialog closes; list refetches and still filtered by the phone number, so Imran is the only row.
14. Click the row "Imran Quereshi" → detail page. Check cell "Next appointment" ("<date> @ <slot>"), "Primary doctor: Not assigned" (the Automatic default only fills it at first visit), and the tracker badge "Upcoming appt" with a "Start Visit" button.
15. Notice the surname typo; click "Back" (the detail page has no Edit) → list, search cleared, 20 rows.
16. Click the search box.
17. Type "Imran" → list filters.
18. Click "More" in Imran's row (aria-label "More actions for Imran Quereshi").
19. Click "Edit" → dialog "Edit Patient" with fields prefilled; "Primary Doctor" shows "Loading…" until a second request (`getPatient`) returns; the Patient Type fields are also present (default: Non walk-in).
20. Retype "Qureshi" in "Last Name" (the correction).
21. Click "Save Changes" → dialog closes, list refetches; no toast confirms the save.
22. Click the row "Imran Qureshi" → detail page again.
23. Click tab "History" (optional check) → one entry labelled "Appointment" with "Appointment only — no visit documentation recorded." and no "Resume session" button.
24. Click "Start Visit" in the tracker (the header button reads "Start new visit"; same destination) → `/dashboard/visits?patientId=<id>&autoStart=true`; Imran moves to the doctor's flow (see the visits topic).

### Variations
- Pooja leaves "Patient Type" as Non walk-in and picks a doctor: nothing is booked (only the Walk-in type triggers booking).
- Walk-in selected with Appointment Type "Procedure": the "Room (optional for OPD)" list is filtered to active procedure rooms and the help text recommends a procedure room.
- Walk-in selected with "Telemedicine": the Room field disappears.
- Pooja chooses a room: the app removes slots where that room is already occupied before choosing one.
- Imran already exists but was archived: search never returns archived patients, so Pooja creates a second record; no archived list or warning exists.

### Edge Cases
- Phone already registered to another patient: the UI performs no duplicate check.
- If the list was on page 2 or had other filters when New Patient was pressed, the list refetches the same page after saving and Imran may not be visible.
- The walk-in booking runs after the patient is saved. If booking fails, the toast says so, but the dialog still closes and the record stays.
- Same information on several surfaces: Imran's phone is shown on the list row, detail header card, Info tab, booking dialog and visit header; the booked slot appears on the detail "Next appointment" cell, the Appointments calendar, the Confirmed column and the dashboard "Today's Appointments".

---

### STORY-040: Doctor finds an August prescription using the History filters and resumes it  [orig PATIENT-RECORDS-05]

**Type**: medium
**Topic**: Patient records
**Persona**: Dr. Suresh Reddy, dermatologist. Rohit Sharma, 34, returns with the same acne breakout and says the August cream worked; Dr. Reddy wants to copy that plan.
**Goal**: Locate Rohit's visit from August 2026 and reopen it.
**Preconditions**: Doctor signed in; Rohit (not necessarily the doctor's primary patient) has 6 documented visits across 2025 and 2026, two with another doctor, Dr. Anjali Deshmukh.
**Ideal path**: 7. Patients, type name, open record, History tab, pick the date range, expand the visit, resume it.
**Alternate paths**:
- Visits setup (`/dashboard/visits`): "Select Patient" and "Select Doctor", then tab "Patient History" (timeline) (per discovery document; not re-read here).
- Visit form tab "History" shows the same patient timeline without filters.
- Dashboard "My Patients" jumps straight to the record (only if Rohit's primary doctor is Dr. Reddy).
- Header "Resume last visit" resumes only the most recent visit.

### Steps
1. Click "Patients" in the sidebar.
2. Click the search box.
3. Type "Rohit Sharma".
4. Click the row "Rohit Sharma" → detail page.
5. Click tab "History" → card "Patient History" with filters "All doctors", two date fields ("From date", "To date"), "Clear filters", and one collapsible group per date ("Hide"/"Show" with "N record(s)" badge).
6. Set "From date" to 01/08/2026 (optional; native date input, typed or picked).
7. Set "To date" to 31/08/2026 (optional; the app already knows the range could be a month picker; two fields are needed even for a single month).
8. Select "Dr. Suresh Reddy" in the doctor drop-down (optional; default: All doctors; the options are built from doctors present in the loaded history).
9. Click "Show details" on the matching visit card (the card is collapsed by default) → compact view: "History", "Medicines".
10. Click "Full details" (optional; shows Examination, Treatment plan, Vitals, Prescription, Prescription instructions, Follow-up date, Visit notes, Photos).
11. Click "Resume session" → `/dashboard/visits?visitId=<id>&patientId=<id>`, the visit form (guards nothing; opening a completed visit may show conflict handling on save).

### Variations
- No match: the card reads "No records match the current filters." and "Clear filters" resets all three filters.
- "Refresh" button next to the card title reloads history; history also reloads on window focus.
- Collapsing a date group with "Hide" is remembered only until the page reloads.

### Edge Cases
- Filtering is done in the browser on the full loaded list; there is no search inside history (no text search for a medicine or diagnosis).
- Date filters compare the visit's calendar day in IST; appointment-only entries are filtered the same way.
- Empty past visits are hidden, so the visible count can differ from what staff remember booking.
- Same information on several surfaces: visit date, doctor, diagnosis, medicines appear on the History card, the visit form "History" tab and Visits setup "Patient History".

---

### STORY-041: Nurse uploads three before/after photos from the patient record  [orig PATIENT-RECORDS-06]

**Type**: medium
**Topic**: Patient records
**Persona**: Fatima Sheikh, clinic nurse. Divya Pillai, 27, is being treated for melasma; Fatima photographs the face (front, left, right) at the start of the consult.
**Goal**: Save three tagged photos against Divya's record.
**Preconditions**: NURSE signed in (sidebar has Patients); three image files are on the device or camera.
**Ideal path**: 6. Patients, type name, open record, Uploads tab, choose files, confirm upload (positions pre-filled in order).
**Alternate paths**:
- Visit form tab "Photos" and card "Quick Actions" button "Capture Photos" use the same photo component and attach photos to the visit (this is the route that allows photo deletion).
- The button "Camera" (same dialog) captures from a device camera instead of choosing files.
- Patient detail "Uploads" tab saves "unattached uploads" for the patient (draft attachments dated by upload day), not photos on a visit.

### Steps
1. Click "Patients" in the sidebar.
2. Click the search box.
3. Type "Divya Pillai".
4. Click the row "Divya Pillai" → detail page.
5. Click tab "Uploads" → card "Before / After Photos (n)"; if none, the empty text reads "No photos attached to this visit" (wording copied from the visit form, even though this is the patient page) and buttons "Choose Files" and "Take Photo".
6. Click "Upload" (header button; "Choose Files" in the empty state does the same) → the device file picker opens.
7. In the file picker select three images (front.jpg, left.jpg, right.jpg) and confirm → dialog "Tag photo positions" opens in "Single" mode with positions pre-filled in order (default: Front, Left, Right, then Back, Close-up, Other for further files). Max size per file 25 MB; images are downscaled to 1600 px before upload.
8. Click "Grid" (optional; shows all three thumbnails with their own position selectors at once; the mode button "Single" is the default).
9. Select a different position on one photo (optional; in Single mode picking a position auto-advances to the next photo).
10. Click "Upload" in the dialog → button shows "Uploading (1/1) - n%"; toast "Photos uploaded" with "3 image(s) uploaded."; the thumbnails appear, titled "Before / After Photos (3)".

Required steps only: 1 to 7 and 10 (8 steps).

### Variations
- Photos tapped through "Infer positions" (button in the dialog) resets all positions to the default order; same as the pre-filled state.
- "Compare: Off" / "Compare: On" button (shown once photos exist) switches to a side-by-side with another visit via "Select visit".
- Wrong photo uploaded: there is no Delete button on this tab (the page does not pass `allowDelete`); deleting needs the visit form, which asks `window.confirm` "Delete this photo? This cannot be undone." (guards permanent photo loss).
- Cancel in the dialog clears the pending files without uploading.

### Edge Cases
- Non-image file or file over 25 MB: toast "No valid images" lists the reasons; valid files continue.
- Failed batch: toast "Upload failed" / "Failed to upload photos. Please try again."; partial success gives "Upload completed with warnings".
- Below the viewer, section "Other saved photos" lists photos from other visits and "Unattached uploads — <date> (n)", which are thumbnails that open the full image in a new tab.
- Photos uploaded here are tied to the patient by date, not to a visit, so the History tab's "N Photos" chips only count photos attached to visits.

---

### STORY-042: Owner exports the month's patients to CSV  [orig PATIENT-RECORDS-07]

**Type**: short
**Topic**: Patient records
**Persona**: Arvind Malhotra, clinic owner, preparing the monthly review with the accountant and wanting "all new patients this month".
**Goal**: Download a CSV of patients registered in the last month.
**Preconditions**: OWNER signed in; patients exist across several months.
**Ideal path**: 3. Patients, choose a "Registered in last month" filter, Export.
**Alternate paths**:
- Reports page "Reports & Analytics" card "Patient Analytics" with export select (JSON, CSV, PDF, Excel) is a different, aggregate export (per discovery document; not re-read here).
- Pharmacy Report workspace exports are pharmacy-only.

### Steps
1. Click "Patients" in the sidebar.
2. Select "Last 1 Month" in the date range filter (aria-label "Filter by date range"; default: All Time; options All Time, Last 1 Week, Last 1 Month).
3. Click "Export CSV" (top right; label turns into "Exporting..." while it runs) → file `patients_export_2026-11-13.csv` downloads with columns ID, Name, Age, Gender, Phone, Email, ABHA ID, Referral, Consultation Type, Portal Linked, Created At; toast "Exported N patients to CSV".

### Variations
- Add Gender or Consultation Type or a search term first: the export honours the same filters (search, gender, consultation type, date range), up to 10,000 rows, no pagination.
- Do nothing but click "Export CSV" with no filters: exports every active patient.

### Edge Cases
- "Last 1 Month" means registered OR had a visit in the last month, so long-standing patients who merely visited this month are included; the owner cannot get "new patients only".
- The CSV column "Consultation Type" is always empty (the list mapper drops the field before the CSV is built), and it omits Patient Code, Address, Emergency Contact, Primary doctor and last visit. It does include the internal id.
- There is no Referral filter even though referral source is a column and a CSV field, so "Instagram patients this month" needs a spreadsheet filter.
- Archived patients never appear in the CSV.

---

### STORY-043: Receptionist archives a duplicate patient record  [orig PATIENT-RECORDS-08]

**Type**: short
**Topic**: Patient records
**Persona**: Pooja Nair, receptionist. Two records exist for Suresh Babu (one was created by a walk-in typed with a misspelling); the doctor asked her to clean up.
**Goal**: Remove the duplicate "Suresh Babu" from the active list.
**Preconditions**: Signed in as RECEPTION (or any clinic role with Patients access); both records exist, the duplicate has no clinical history worth keeping.
**Ideal path**: 4. Patients, type name, More, Archive (reversible, so no confirmation dialog is warranted).
**Alternate paths**: none found. Archive exists only in the list's "More" menu: no bulk archive, no archive from the detail page, no merge UI (merge exists only as a backend job).

### Steps
1. Click "Patients" in the sidebar.
2. Click the search box.
3. Type "Suresh Babu" → both records listed; Pooja compares Patient Code, phone and "ID: <last 8>" to pick the duplicate.
4. Click "More" in the duplicate's row (aria-label "More actions for ...") → menu: "Edit", "Archive", "Link portal" (or "Unlink portal"), "WhatsApp".
5. Click "Archive" → row disappears at once; toast "Patient archived" with "<name> has been archived" and an action "Undo". There is no confirmation dialog.

### Variations
- Click "Undo" in the toast: the patient is restored ("Archive undone", "<name> has been restored").
- Archive request fails: the row reappears and toast "Failed to archive" appears.

### Edge Cases
- After the toast closes there is no way to find or restore the patient from the UI: the list excludes archived records, there is no "Show archived" filter, and the only unarchive action is that toast's "Undo".
- Archive does not check for upcoming appointments, bills or visits (the service only flips a flag), and no warning is shown.
- The "WhatsApp" item sits directly below "Archive" in the same menu and sends an appointment reminder immediately; no confirmation.
- Archive is guarded only by the toast "Undo"; "Unlink portal" instead uses a toast-confirm (see STORY-044 (PATIENT-RECORDS-09)).

---

### STORY-044: Receptionist links a patient to an existing portal account  [orig PATIENT-RECORDS-09]

**Type**: medium
**Topic**: Patient records
**Persona**: Pooja Nair, receptionist. Ramesh Gupta has been told the clinic's patient portal exists and asks that his email ramesh.gupta@example.in be connected. (The email is not stored on his record.)
**Goal**: Link Ramesh's patient record to his portal account.
**Preconditions**: RECEPTION signed in; a portal account (role PATIENT) with that email exists in this branch; Ramesh has no email on file and is not yet linked.
**Ideal path**: 6. Patients, type name, More, Link portal, type email, Link. (If the record already held the email, the portal dialog would not be needed at all.)
**Alternate paths**: none found. There is no portal field on the patient detail page and no staff-side form that creates a portal account (the Users form offers Admin, Doctor, Nurse, Receptionist, Manager, Pharmacist only); no patient-facing portal UI exists in this app.

### Steps
1. Click "Patients" in the sidebar.
2. Click the search box.
3. Type "Ramesh Gupta".
4. Click "More" in Ramesh's row.
5. Click "Link portal" → dialog "Link Portal Access" with "Patient: Ramesh Gupta" and field "Email" (placeholder "Existing portal account email"; default: the patient's own email if one is on file, otherwise empty) (app already knows this: when the record has an email it is prefilled; here it is empty).
6. Type "ramesh.gupta@example.in" in "Email" (required field; the "Link" button stays disabled while it is empty).
7. Click "Link" → toast "Portal user linked" ("Portal access has been linked for Ramesh Gupta"), dialog closes, row now shows a "Portal Linked" badge under the name; the "More" menu item changes to "Unlink portal".

### Variations
- Unlink: "More" then "Unlink portal" shows a toast "Confirm unlink" ("Remove portal access for <name>?") with a "Confirm" action; clicking it unlinks ("Portal user unlinked"). The toast disappears by itself if ignored. Guards removal of the patient's portal access.
- Email has no matching account: toast "Failed to link portal user" with the server message "No patient portal account with this email exists in this branch". Since the UI has no way to create a portal account, the receptionist is stuck.
- Patient already linked: "More" shows "Unlink portal" instead and the server would answer "Patient is already linked to a user" for a second link.

### Edge Cases
- Two accounts with the same email: "Multiple portal accounts match this email; use an account ID" (the UI has no field for an account id).
- Cancel or close the dialog: email and target are cleared; nothing is saved.
- The badge "Portal Linked" is the only place the link status shows; it does not appear on the detail page.
- Portal status is also exported in the CSV column "Portal Linked" (Yes/No).

---

### Inventory day to day: Today queue, stock list, add item and approvals, counts, losses, corrections, ledger

### STORY-045: Meera opens Inventory and acts on the Low stock count  [orig INVENTORY-DAILY-01]

**Type**: short
**Topic**: Inventory day to day
**Persona**: Meera Pillai, pharmacist, 9:30 am before the first patients arrive
**Goal**: See what needs attention in stock today and open the list of low-stock batches to plan reorders.
**Preconditions**: Signed in as PHARMACIST. Several batches sit at or below their saved minimum (for example 14).
**Ideal path**: 2. One click to reach the queue, one click on the item that needs action; the landing screen already holds the counts.
**Alternate paths**:
- Today row "Low stock" and, further down the same screen, the button "Check low stock" both go to `?area=stock&view=list&stock=LOW` (identical result, two controls on one screen). The same duplication exists for the row "Expiring in the next 3 months" and button "Check next 3 months' expiry", and for row "Overdue supplier bills" and button "Check overdue supplier balances".
- Inventory > area button "Stock" > select "Stock level" > "Low stock" (same list, 3 more steps).
- Header "Notifications" bell for PHARMACIST links to `/dashboard/inventory?tab=low-stock`; the workspace ignores `tab` here and lands on Today, so the user must click the "Low stock" row anyway.
- Dashboard card "System Alerts" > "Low Stock Alert", Reports & Analytics "Low Stock Alerts" (OWNER/ADMIN/MANAGER only) and the Pharmacy Desk stock strip show the same low-stock figure (surfaces named in discovery; not re-read here).
**Same information on several surfaces**: low-stock count appears on Today (row and bottom button), dashboard alerts, header bell, Reports, Pharmacy Desk. "Low stock" here means a batch at or below that batch's own saved minimum.

### Steps
1. Click "Inventory" in the sidebar → page "Inventory" ("Receive, review and manage pharmacy stock.") opens on area "Today" with a brief "Loading inventory permissions…" skeleton, then the five "Data quality" chips (Missing location, Missing category, Missing HSN code, Missing min/max, Unmapped), buttons "Scan or enter bill" and "Find or correct stock", and the list under "What needs attention".
2. Click the row "Low stock" (e.g. "14") → Stock list opens with an active filter chip "stock: LOW ×" and "Stock level" showing "Low stock"; batches are listed with Available, Selling price and Location.

### Variations
- A pharmacist also sees the row "Price/stock edits awaiting approval (n)". Clicking it opens "Approve corrections" but Approve/Reject buttons are hidden for her (only DOCTOR, ADMIN, OWNER can act).
- If the same screen is opened on a phone, the five area buttons wrap and the second-level tasks collapse into a select labelled "Inventory task".

### Edge Cases
- Branch queues fail to load: "Branch queues are unavailable. Retry to see current work." with button "Retry queues".
- Permissions fail: alert "Inventory permissions could not be loaded…" with "Retry permissions"; the Today screen does not render until they load.
- A count that is not available renders as "—" in the number column.

---

### STORY-046: Meera checks whether a product is in stock and when it expires  [orig INVENTORY-DAILY-02]

**Type**: short
**Topic**: Inventory day to day
**Persona**: Meera Pillai, pharmacist, at the counter with a patient asking for "Tacroz 0.1% ointment"
**Goal**: Find the product's batches, available quantity and expiry.
**Preconditions**: Signed in as PHARMACIST; the product exists in at least one batch.
**Ideal path**: 2. Open Inventory (search focused) and type; results update live and show batch, available and expiry in the row.
**Alternate paths**:
- Inventory > area button "Stock" (its first task "Stock list" is the default view) instead of the Today button "Find or correct stock" (same destination).
- Stock ledger search "Product, batch or reference" finds movements for the product but not current availability.
- Counter sale / Counter-sales document "Add a batch" search ("Search product, batch, barcode or SKU") lists batches with "available" and expiry (inventory-side counter sales).
- Pharmacy Sales bill "Search Drugs" and the Drug Database page (named in discovery, separate Drug catalogue; not re-read here).
- Typing `purchase:<id>` or `inventory-document:<id>` (as printed on QR labels) into the same Search box opens that bill or document instead of filtering.
**Same information on several surfaces**: Available and Expiry show in the Stock list row, again in the item page "Batches" table (columns Batch no., Qty, Expiry, MRP, PTR ...), in the batch picker of every inventory document, and in the pharmacy billing search.

### Steps
1. Click "Inventory" in the sidebar → opens Today.
2. Click "Find or correct stock" → Stock list (`?area=stock&view=list`), header "Stock", batch-view chips "All batches" / "Current / on hand" / "Previous / depleted" (default: All batches).
3. Click the "Search stock" field and type "tacroz" (optional in the UI, but without it the list shows every batch in the branch, so it is needed in practice; placeholder "Type a product name or scan a barcode").
4. Click "Search" (or press Enter) → rows show product name with pack label, "Batch state" badge, Expiry, Available (e.g. "9 TUBES"), Selling price, Location. Typing alone does not filter; results change only on submit.

### Variations
- Misspelling "tacrox": rows show "Similar spelling: tacroz".
- Searching the old brand name: row shows "Matched earlier name: ...".
- Scanning a barcode into the field then pressing Enter (scanner usually sends Enter) behaves as step 4.

### Edge Cases
- No match: "No batches match these filters. Reset or change the search." plus "Reset" button next to Filters.
- Default list includes depleted and expired batches ("Previous / depleted", "Expired, on hand"); the user must read the badge to avoid quoting an expired batch. Chip "Current / on hand" is a separate click.
- Failure: alert with "Retry"; the count line says "Stock results unavailable".

---

### STORY-047: Meera does today's assigned cycle count and signs it off  [orig INVENTORY-DAILY-03]

**Type**: medium
**Topic**: Inventory day to day
**Persona**: Meera Pillai, pharmacist, assigned 6 batches for today's stock reconciliation cycle
**Goal**: Count the 6 assigned batches on the shelf and sign off the list, sending one difference to the doctor.
**Preconditions**: Reconciliation is on for the branch; Meera is an assignee; one list "due today" with 6 items; she holds count permission (compliance audit). One batch (Candid-B cream, system 8) really holds 6.
**Ideal path**: 7. Reach the list in 2, confirm the five matching batches with one "all other batches match" action (1), type the one different quantity (1), sign off (1), type reason (1), confirm (1).
**Alternate paths**:
- Inventory > "Stock" > "Stock counts" > tab "My counts" > button "Start counting" / "Continue counting" (same sheet, 2 more steps than the Today row).
- Stock list button "Count matching batches" / "Count selected batches" builds a new count from the current filters or ticked rows.
- Item page button "Count this batch" builds a one-batch count.
- Stock counts > button "Count an item" (dialog "Count an item or a shelf") for off-cycle counts.
- Stock list / item page "Edit stock" (dialog "Edit stock", field "Counted physical stock") records a physical count through a different approval route (queue "Price / stock") and does not go through counts; it is a second way to correct quantities.
**Same information on several surfaces**: today's due count shows on Today ("Stock count due today"), on the "My counts" tab (badge "Due today", cycle line "Cycle ... day x of y"), and in the count sheet header; the system quantity is shown next to every counted field.

### Steps
1. Click "Inventory" in the sidebar → Today.
2. Click the row "Stock count due today" (6; detail "Open your count and sign off when every batch is counted.") → opens the count sheet directly (title is the count reference) with columns Item, Location, System, Counted, Difference, Note; the first empty "Counted" field is focused.
3. Type "12" in "Counted" for Tacroz ointment 10 g, batch TZ2417, shelf B-3 (required field, default: empty on purpose; (app already knows this): System also shows 12) → "Matches", Enter moves to the next field.
4. Type "20" for Adapalene gel 0.1% 15 g, batch AD9032, shelf B-3 (required field; (app already knows this): System 20).
5. Type "15" for Isotroin 20 mg capsule strip, batch IS5518, shelf C-1 (required field; (app already knows this): System 15).
6. Type "30" for Cetaphil Gentle face wash 125 ml, batch CG2207, shelf A-2 (required field; (app already knows this): System 30).
7. Type "6" for Candid-B cream 15 g, batch CB1144, shelf A-4 (required field) → shows "−2 units" and a rupee value in red; a note field appears.
8. Type "25" for Sebamed sunscreen SPF 50, batch SB7731, shelf D-2 (required field; (app already knows this): System 25). Autosave shows "Saving…" then "Saved"; footer reads "6 of 6 counted · 1 differ".
9. Click "Note" on the Candid-B line (optional; the note box appears automatically when a difference exists, so this click is only needed if the user wants to hide it earlier).
10. Type in "Why it differs (optional)": "Two tubes sold on slip, not yet billed" (optional).
11. Click "Sign off count" (sticky footer) → dialog "Sign off this count" listing "Batches that differ" with "System 8 · counted 6".
12. Type in "Why do these differ? (required)" (required because something differs): "Two tubes sold on a handwritten slip yesterday" (this repeats the note typed in step 10, (app already knows this) from the same screen).
13. Click "Sign off and send for approval" (confirmation dialog guarding a locked, signed record: "The count is then locked; only a fresh count can replace it."; stock changes only after a doctor or administrator approves) → toast "Count signed off and sent for approval." and the sheet becomes a locked record.

### Variations
- No differences: step 12 becomes an optional "Note (optional)" and the button reads "Sign off"; the count posts straight away ("Count signed off. Stock confirmed.", state "POSTED_NO_DIFF") with no approval.
- Two lists assigned: Today row says "2 lists to count..." and opens "My counts" instead; the user also clicks "Start counting" first.
- Backlog from a missed day: list shows badge "From <date>".

### Edge Cases
- Sign off with an empty field: alert "Count every item before signing off. 1 item still to count." and focus jumps to the empty field; field is highlighted.
- Non-numeric entry: hint "Whole number, 0 or more"; "Enter 0 when a batch is not there."
- Count changed by someone else: toast "This count changed ... Showing the latest saved version."
- Server asks for a retype ("N to type again"): field emptied and hint "Type it again (was x)".
- Connection loss: "Not saved. Check your connection; your counts stay on this screen."

---

### STORY-048: Meera records two broken tubes as a loss  [orig INVENTORY-DAILY-04]

**Type**: medium
**Topic**: Inventory day to day
**Persona**: Meera Pillai, pharmacist; a stack of Tacroz ointment boxes fell and 2 tubes of batch TZ2417 broke
**Goal**: Remove the 2 broken units from available stock with a recorded reason.
**Preconditions**: PHARMACIST with transaction-create permission; batch TZ2417 holds at least 2 units.
**Ideal path**: 6. Open Inventory with search (1), type product (1), click a row action "Record loss" (1), type quantity (1), type reason (1), post (1).
**Alternate paths**:
- Inventory > "Stock" > "More tasks..." select > "Loss & breakage" > button "New document" > field "Add a batch" (type, click result) > quantity > reason > "Post stock loss" (adds ~3 steps; the only route for several items in one document).
- Item page or Stock list "Edit stock" (counted physical stock lowered, reason, "Submit for approval") reaches the same quantity but needs a doctor's approval and records no loss reason code.
- Customer return line with disposition "Record as loss" (Inventory > Sales > "Customer returns").
- "Blocked stock" hold then loss using "Stock source" = the hold reference.
- A count with a difference, approved by a doctor.
**Same information on several surfaces**: the quantity change appears in the loss document's "Confirmed stock effects", the item page "Ledger" tab, the "Stock ledger" (method "Loss or breakage") and the Today "Recent activity" list.

### Steps
1. Click "Inventory" in the sidebar → Today.
2. Click "Find or correct stock" → Stock list.
3. Type "tacroz" in "Search stock" (optional narrowing, practically required to find the batch).
4. Click "Search" → batches listed.
5. Click the product name link of the TZ2417 row → item page opens (header, "Current stock", item details, buttons "Edit stock", "Edit price", "Blocked stock", "Loss & breakage", "Supplier returns", "Count this batch").
6. Click "Loss & breakage" → editor opens at `?area=stock&view=LOSS&new=...` titled "Loss & breakage" ("Record a reason and remove damaged or lost units from available stock.") with Reference "LOSS-2026-11-13" (default: today's date and kind; editable, (app already knows this)), Date (default: today), "Stock source" (default: "Available stock (no hold)"), and the opened batch already added as a line with Quantity 1 (default: 1).
7. Change "Quantity" in the line from 1 to 2 (required field; default 1). The row also shows Free, Rate excl. GST, Discount %, Scheme ₹, GST % inputs, which do not apply to a loss; "Total" and "Taxable/GST/Total" lines are shown.
8. Type in "Reason / notes" (placeholder "Required before posting"): "2 tubes broken while restocking shelf B-3" (required field).
9. Click "Post stock loss" (no confirmation dialog; the required reason is the only guard) → status "Posted", section "Confirmed stock effects" shows "Physical -2 · Held 0", document history lists the post event.

### Variations
- Meera wants to save and finish later: button "Save draft" instead of step 9 (draft "Draft • no stock change").
- Loss of a held batch: select the hold in "Stock source".
- Posted by mistake: button "Correct by reversal" appears only for approver roles (OWNER, ADMIN, MANAGER, DOCTOR) and needs "Reversal reason" and "Reverse posted effects"; a pharmacist must ask the doctor.

### Edge Cases
- Empty reason: server error "Enter a reason before posting".
- Quantity above available: server guard error; the "Recovery steps" panel offers "Inspect batch balance and holds".
- Network drop after submit: "Outcome not confirmed" with "Check saved status" so the loss is not posted twice.
- Back link "Back to loss & breakage" is an icon-only button.

---

### STORY-049: Meera proposes a new selling price for a batch  [orig INVENTORY-DAILY-05]

**Type**: medium
**Topic**: Inventory day to day
**Persona**: Meera Pillai, pharmacist; the distributor revised the price of Tacroz ointment 10 g, batch TZ2417, from ₹218 to ₹224
**Goal**: Request the price change so it takes effect after doctor approval.
**Preconditions**: PHARMACIST (roles OWNER, ADMIN, DOCTOR, PHARMACIST see "Edit price"); the batch exists at ₹218.
**Ideal path**: 6. Open Inventory with search (1), type (1), open the price editor from the row (1), type price (1), type reason (1), submit (1).
**Alternate paths**:
- Item page button "Edit price" (same dialog) after clicking the product name (+1 step).
- Item page "Edit item" opens "Correct saved details" but selling price is deliberately excluded there; stock and price are only changed through proposals.
- A new purchase bill ("Scan or enter bill") posting a batch with the new rate creates a new batch rather than editing this one.
- Drug Database page edits (discovery: separate Drug catalogue; not re-read here).
**Same information on several surfaces**: Selling price is in the Stock list row, item page "Edit price" dialog, the approval queue card ("Selling price: ₹218.00 → ₹224.00"), and pharmacy billing.

### Steps
1. Click "Inventory" in the sidebar.
2. Click "Find or correct stock".
3. Type "tacroz" in "Search stock".
4. Click "Search".
5. Click "Edit price" in the TZ2417 row (Edit column; each batch has its own pair "Edit price" / "Edit stock") → dialog "Edit price", text "Tacroz ointment 10 g · Batch TZ2417. The change takes effect after doctor or admin approval." and "Current selling price: ₹218.00".
6. Type "224" in "New selling price (₹ per stock unit)" (required field; default: current price 218, (app already knows this)) → panel "Check your changes — Not saved yet" shows "Selling price ₹218.00 → ₹224.00".
7. Type "Distributor revised rate from 12 Nov" in "Why are you changing it?" (required field; placeholder "e.g. Counted 8 tubes on the shelf today").
8. Click "Submit for approval" (the dialog is the confirmation; it guards a price change that would otherwise apply immediately) → dialog closes, banner "Submitted for doctor or admin approval." with link button "Open approval queue".

### Variations
- Stock instead of price: click "Edit stock", field "Counted physical stock (TUBES)" (default: current stock; must be a whole number of at least the held units), same reason and submit.
- Several batches of the same product need the new price: steps 5-8 repeat per batch (no multi-select for price).
- Doctor Anil submits his own change: the same queue lists it; whether he may approve his own proposal is not restricted in `InventoryUpdates.tsx` (backend rule not traced).

### Edge Cases
- Submit stays disabled until the value differs from the current one and the reason is not blank.
- Stock field shows "Enter a whole number of at least N. Include stock set aside." when below held units.
- Batch changed meanwhile (`expectedUpdatedAt` mismatch): "Could not submit. Try again." with the entered values preserved.
- RECEPTION and MANAGER do not see the Edit column at all.

---

### STORY-050: Dr. Anil clears the approval queue: a new item and a price edit  [orig INVENTORY-DAILY-06]

**Type**: medium
**Topic**: Inventory day to day
**Persona**: Dr. Anil Reddy, doctor and approver, between consultations
**Goal**: Approve Sunita's new-item request and Meera's price edit.
**Preconditions**: Signed in as DOCTOR. One pending new-item request ("Cetaphil Gentle face wash", from story STORY-051 (INVENTORY-DAILY-07)) and one pending price edit (story STORY-049 (INVENTORY-DAILY-05)). Sidebar entry "Inventory" shows a red count badge for pending new-item requests.
**Ideal path**: 3. Open Inventory (1); the Today queue shows each pending proposal with its before/after and one-tap Approve (2), (3); no dialog because the card already shows what is changing.
**Alternate paths**:
- Today row "Price/stock edits awaiting approval (n)" > tab "Price / stock"; sidebar "Inventory" badge > tab "New items"; Stock list banner link "Open approval queue" (after an edit submit); legacy `/dashboard/inventory-updates` redirect; Inventory > "Stock" > "Approve corrections". Four ways into one two-tab screen.
- Stock counts approvals live in a different queue (Stock counts > "Approvals"; Today "Counts awaiting your approval"), so a doctor checks two approval screens.
**Same information on several surfaces**: pending new items are counted in the sidebar badge, in the task label "Approve corrections (1)" and in the "New items" tab badge. Pending price/stock edits appear only in the Today row; the task label and badge do not count them.

### Steps
1. Click "Inventory" in the sidebar → Today with rows "Price/stock edits awaiting approval (1)" and others.
2. Click the row "Price/stock edits awaiting approval (1)" → "Approve corrections" opens, but on the tab "New items" ("New item requests"), because the default tab is New items whenever a new item is pending, regardless of which row was clicked.
3. Click "Approve" on the card "Cetaphil Gentle" (details list Form, Medicine name, prices, unit; "Requested by Sunita Rao · 13 Nov 2026"; the "Check before approving." warning appears only if a similar item or pending request exists) → dialog "Approve new item": "The item is added to inventory immediately."
4. Click "Approve" in the dialog (confirmation guarding creation of a stock item; no note field on approve) → toast "Item approved and added to inventory"; the card moves to "History".
5. Click the tab "Price / stock" → heading "Price / stock approval queue", "1 pending request".
6. Click "Approve" on the card "Tacroz ointment 10 g" (shows "Batch: TZ2417", "Selling price: ₹218.00 → ₹224.00", "Reason: Distributor revised rate from 12 Nov", requester and time) → dialog "Approve inventory change".
7. Type in "Review note" (optional; placeholder "Optional note").
8. Click "Approve" in the dialog → toast "Inventory change approved"; the queue empties ("No pending price or stock edits.").

### Variations
- Reject a new item: click "Reject" > dialog "Reject new item" > required "Reason for rejection (required)" (button stays disabled until typed).
- Reject a price edit: "Reject" > "Reject inventory change" with an optional note.
- Request is a duplicate: card shows the duplicate warning ("An item with this name is already in inventory...").

### Edge Cases
- Another approver already decided: 409 shows a banner "... The list below is up to date." and the dialog closes.
- MANAGER role: the "Approve corrections" task is hidden (MANAGER is not an approver role).
- RECEPTION opening "Approve corrections" sees only "My item requests" with status "Waiting for doctor".
- The task label "Approve corrections (1)" counts only new items, so a queue holding only a price edit shows no number on the tab bar.

---

### STORY-051: Sunita requests a new item for the pharmacy catalogue  [orig INVENTORY-DAILY-07]

**Type**: medium
**Topic**: Inventory day to day
**Persona**: Sunita Rao, receptionist; the dermatologist wants "Cetaphil Gentle" face wash 125 ml stocked and nobody has added it
**Goal**: Request the new item so the doctor can approve it into inventory.
**Preconditions**: Signed in as RECEPTION (has full inventory item create permission, shown as button "Add batch"); the item is not yet in stock list.
**Ideal path**: 7. Reach the add form in 2 (Inventory > "Add item"), type name (1), pick form (1), type cost (1), type selling price (1), submit (1); the quantity and batch come later from a purchase bill.
**Alternate paths**:
- Pharmacy Desk > Drugs page "add drug" and the PrescriptionBuilder "+ Add to Drug Database" create items in the separate Drug catalogue (two catalogues: Drug and InventoryItem; per discovery).
- "Manual opening stock" (Inventory > Stock > "More tasks..." > "Manual opening stock" > "New document") creates a batch with quantity, and "Opening stock import" bulk-loads.
- A purchase bill ("Scan or enter bill") that includes an unknown product creates the item during intake.
**Same information on several surfaces**: the dialog title is "Add Inventory Item", while the button that opens it is "Add batch" and the Today button is "Find or correct stock"; the same fields later appear on the item page "Item details" and in the approval card.

### Steps
1. Click "Inventory" in the sidebar → Today.
2. Click "Find or correct stock" → Stock list.
3. Click "Add batch" (top right of "Stock") → dialog "Add Inventory Item" ("Fields marked with * are required.").
4. Click the select "Form" in the "Name on prescriptions" box (required field, default: "Choose the form").
5. Choose "Face wash" (selection; "Type *" above stays "Medicine", default: Medicine).
6. Type "Cetaphil Gentle" in "Medicine name *" (required field; hint "Only the name: no form, strength, code or pack size"); the live line shows "Prints as Cetaphil Gentle face wash". "Strength" is optional for this form (shown as "Strength (optional)"; it would be required for Tablet, Capsule or Syrup).
7. Type "310" in "Cost Price (₹) *" (required field).
8. Type "385" in "Selling Price (₹) *" (required field).
9. Type "425" in "MRP (₹)" (optional).
10. Click the select "Unit *" (default: Pieces).
11. Choose "Bottles" (optional change).
12. Click "Add Item" → dialog content switches to title "Sent to doctor for approval": "Sent to doctor for approval. The item will appear in inventory once approved." plus a duplicate warning if a similar item exists.
13. Click "Close" (dismisses the confirmation) → back to the Stock list; the item does not appear yet.

### Variations
- Tablet type: "Strength" becomes required and a unit prompt "Which unit?" with chips mg, mcg, g, IU, % appears if the typed strength has no unit (extra click).
- Combination product: tick "Combination product" and strength is disabled.
- Non-medicine (Equipment, Supply, Consumable): "Item Name *" replaces the Name box and the "Name on prescriptions" box disappears.
- Added by Dr. Anil, Meera or the owner: the item is created straight away; the dialog closes and the list reloads (no approval).

### Edge Cases
- Missing form or name: inline errors below the fields and focus moves to the first one.
- Same name/SKU/barcode already exists: server refuses ("assertItemIdentifiersFree"); error shows inside the dialog.
- Many optional sections (Description, Generic Name, Category, Sub-Category, Manufacturer, Supplier, Prescription defaults, Item code, Barcode, SKU, Pack Size, Pack Unit, Min/Max Stock, Reorder Level/Qty, Batch Number, Expiry Date, HSN Code, GST Rate, Storage Location, Storage Conditions, two checkboxes) are all on one scrolling form; there is no field for opening quantity, so the new item starts at 0 stock and needs a purchase bill, "Manual opening stock" or an approved "Edit stock" before it can be sold.
- The "Cost Price" label here is called "PTR" and "Purchase cost" elsewhere in the stock list.

---

### STORY-052: Rajesh corrects a wrongly keyed stock movement  [orig INVENTORY-DAILY-08]

**Type**: medium
**Topic**: Inventory day to day
**Persona**: Rajesh Agarwal, owner, reviewing a manual adjustment someone keyed as +50 for Adapalene gel 0.1% 15 g that should have been +5
**Goal**: Replace the wrong movement with a linked correction that keeps the original entry visible.
**Preconditions**: Signed in as OWNER (approver roles OWNER, ADMIN, MANAGER, DOCTOR with adjustment permission). The +50 row is a manual entry, not tied to a purchase bill or inventory document.
**Ideal path**: 6. Open Inventory with search (1), type (1), open the item's ledger row with a "Correct" action (1), type the right quantity (1), type reason (1), post (1).
**Alternate paths**:
- Stock ledger (Inventory > "Stock" > "Stock ledger") shows the same movements, with links to documents, but no "Correct" action; the user must go to the item page.
- Item page tab "Sales" is the ledger table filtered to sales and offers the same "Correct".
- Item "Edit stock" proposal sets an absolute quantity (needs doctor approval; does not retain the movement link).
- A fresh approved stock count (story STORY-053 (INVENTORY-DAILY-09)) restates the quantity without touching the wrong row.
- Posted workflow documents (loss, challans, returns) are corrected through "Correct by reversal" in their own editor instead.
**Same information on several surfaces**: each movement is listed in Stock ledger (grouped by day, with balance before → after), item "Ledger" tab (In, Out, Batch closing, Item closing), item "Sales" tab, and the "Corrections" register (Inventory > Stock > "Corrections").

### Steps
1. Click "Inventory" in the sidebar.
2. Click "Find or correct stock".
3. Type "adapalene" in "Search stock".
4. Click "Search".
5. Click the product name link of the row → item page.
6. Click the tab "Ledger" → "Ledger matches stock on hand" or "Ledger does not match" banner, filters From / To / Type, "Download CSV", and the table with the Action column.
7. Click "Correct" on the +50 row (the Action column appears only for approvers; other rows show "Open purchase correction", "Open source correction" or "Open original sale") → inline form opens under the table.
8. Type "5" in "Correct signed quantity" (required field; default: the row's current quantity "50", (app already knows this)).
9. Type "Keyed 50 instead of 5 during opening entry" in "Reason" (required field).
10. Click "Post linked correction" (posts immediately; there is no confirmation dialog) → opens the "Corrections" document `COR-...` with status "Posted", "Confirmed stock effects" "Physical -45", and history.

### Variations
- Cancel: button "Cancel" next to "Post linked correction" discards the form.
- Entering the same quantity as already recorded: server error "This movement already has the requested corrected quantity".

### Edge Cases
- Pharmacist or receptionist: Action column is empty; they cannot correct (they use "Edit stock" proposals).
- Row from a purchase bill or workflow: no direct "Correct"; server refuses "Correct the source workflow or invoice".
- Unknown direction in historical rows: "Historical direction is unknown; record an approved physical count instead".
- Ledger rows with an unrecorded stock jump are highlighted and explained ("stock that changed without a ledger entry").

---

### STORY-053: Shelf B-3 looks short: spot count, doctor approval, and ledger check  [orig INVENTORY-DAILY-09]

**Type**: long
**Topic**: Inventory day to day
**Persona**: Meera Pillai (pharmacist) in the evening, then Dr. Anil Reddy (doctor) the next morning, then Meera again
**Goal**: Count shelf B-3 outside the cycle, get the difference approved, and confirm the stock figure and ledger afterwards.
**Preconditions**: Reconciliation on; shelf "B-3" holds 4 batches in stock; one (Tacroz ointment 10 g, TZ2417) is really 2 short. Meera has count permission; Dr. Anil is an active approver (DOCTOR/ADMIN/OWNER can decide counts).
**Ideal path**: 10. Pharmacist: start a shelf count in 2 (Inventory, "Count shelf" action), pick shelf (1), type only the exception with the rest confirmed as matching (1+1), sign with reason (2). Doctor: open Inventory and approve with the prefilled reason (2). Verify: 1 click from the approval toast to the ledger entry.
**Alternate paths**:
- Start the shelf count from the Stock list: "Filters" > select "Rack / shelf / bin" > "Count matching batches" (3 steps).
- From the item page: "Count this batch" for one batch.
- Today row "Stock count due today" for cycle lists.
- Approve via Today row "Counts awaiting your approval" (story step 19) or Stock counts > tab "Approvals" (same record).
- Fixing quantity with "Edit stock" proposals (stories STORY-049 (INVENTORY-DAILY-05)/STORY-050 (INVENTORY-DAILY-06)) is a separate approval queue with similar effect.
**Same information on several surfaces**: counted difference appears in the sheet footer ("n of n counted · 1 differ"), sign-off dialog, locked record, approval dialog ("8 now → 6"), "History" tab, Stock ledger (method "Stock count"), item "Ledger" tab, and the Today cards "Counts awaiting your approval" and "Batches not counted this cycle".

### Steps
1. Click "Inventory" in the sidebar → Today.
2. Click the area button "Stock" → Stock list (first task "Stock list" shown as selected).
3. Click the task button "Stock counts" (fifth primary Stock task) → tab "My counts": "Cycle ... day x of y" and either assigned lists or "Nothing to count right now".
4. Click "Count an item" → dialog "Count an item or a shelf" ("Outside the cycle, for an item or a shelf that looks wrong...").
5. Click "Shelf / location" (radio; default: "Item or batch").
6. Click the "Shelf" select (default: "Choose a shelf").
7. Choose "B-3 · 4 batches" → all 4 batches are listed and ticked (default: all ticked; checkbox "Select all 4 on B-3").
8. Click "Count 4 batches" → count sheet opens, assigned to Meera.
9. Type "12" for Tacroz ointment 10 g TZ2417 (required field; system shows 14; difference −2 appears).
10. Type "20" for Adapalene gel 0.1% AD9032 (required field; (app already knows this): System 20).
11. Type "15" for Isotroin 20 mg capsule IS5518 (required field; (app already knows this): System 15).
12. Type "30" for Cetaphil Gentle CG2207 (required field; (app already knows this): System 30).
13. Click "Note" on the TZ2417 line (optional; opens automatically because it differs).
14. Type "Two tubes with expired seal binned earlier, not recorded" in "Why it differs (optional)" (optional).
15. Click "Sign off count".
16. Type the same explanation in "Why do these differ? (required)" in dialog "Sign off this count" (required because a batch differs; repeats step 14, (app already knows this)).
17. Click "Sign off and send for approval" (confirmation: locks the count; stock changes only on approval) → toast "Count signed off and sent for approval."
18. Dr. Anil signs in and clicks "Inventory" in the sidebar → Today shows a card "Counts awaiting your approval" (1) with the split "₹... short" and "Stock changes only when you approve."
19. Click the row "Counts awaiting your approval" → Stock counts, tab "Approvals" (table "Counts awaiting approval": Date, Counted by, Signed at, Items, Differences, Short ₹, Net ₹, Action).
20. Click "Review" in the row (the row itself is also clickable) → locked record "Signed by Meera Pillai on ..." with the differing batch first and a button "Show all 4 batches".
21. Click "Approve and adjust stock" (sticky footer; "Stock changes only when you approve.") → dialog "Approve and adjust stock" listing "12 now → ..." and "Stock value changes by −₹...".
22. Click "Approve and adjust stock" in the dialog (reason is prefilled with "Physical count signed by Meera Pillai on 12 Nov 2026" (default: prefilled), so no typing is needed; confirmation guarding the stock adjustment) → toast "Approved. Stock adjusted."
23. Meera clicks the area button "Stock" in Inventory.
24. Click the task button "Stock ledger" → ledger for the last 30 days (default: From = 30 days back, To = today).
25. Type "tacroz" in Search ("Product, batch or reference"; optional) → today's group shows an entry "−2 TUBES Tacroz ointment 10 g · Batch TZ2417", badge "Stock count", balance "14 → 12", actor Dr. Anil Reddy.

### Variations
- The count is a cycle list on Today: steps 3-8 collapse to "Stock count due today" (see story STORY-047 (INVENTORY-DAILY-03)).
- Dr. Anil rejects: "Reject" > "Reject this count" with typed reason; stock stays unchanged and the batches return to the cycle.
- Only one approver exists and Meera is not an approver; if the OWNER is the sole approver deciding his own count, the dialog adds a required tick "I signed this count and no other approver is active in this branch...".
- Stock moved after the count: dialog notes "It was 14 when counted; stock has moved since" and applies the difference to today's stock.

### Edge Cases
- Meera opens her own signed count: banner "You signed this count, so someone else decides it. Ask Dr. Anil Reddy."
- A batch is already on another undecided count: its checkbox is disabled with "On <name>'s count of <date>, waiting for approval."
- Shelf has no stock: "No batch in stock on B-3."
- Rejected or cancelled counts do not change the Today card "Batches not counted this cycle".

---

### Purchases and reorder: supplier bills, payment, returns and credit notes, suppliers, shortbook, purchase orders

### STORY-054: Scan a supplier bill photo, fix the flagged values, add stock  [orig PURCHASES-REORDER-01]

**Type**: medium
**Topic**: Purchases and reorder
**Persona**: Meena Iyer, pharmacist at a Hyderabad dermatology clinic; a courier has just dropped a 3-item bill from Sri Venkateswara Pharma Distributors (invoice SVP/2411/0873, GSTIN 36AAKCS4821M1ZP).
**Goal**: Get the three received products into stock with the correct batch and expiry.
**Preconditions**: Logged in as PHARMACIST. The distributor is already a saved supplier. A phone photo of the bill (JPG) is on the computer. OCR returns two flags: line 2 expiry month unclear, line 3 batch unclear. All three products already exist in the drug master.
**Ideal path**: 5. Choose file, fix the two flagged fields, one final "add stock" confirmation that also accepts the product matches; the app already knows today's date and the saved supplier.
**Alternate paths**: (a) Today screen button "Scan or enter bill" vs Purchases area task "Scan or enter bill" vs Purchase bills "New purchase" button vs the empty-state button "Scan or enter a bill" / "New purchase". (b) "Import CSV" and "Gmail intake" tasks (`AlternateInvoiceIntake`) produce the same draft in the same workbench. (c) Inside the scan panel, disclosure "Automatic import" with button "Import & Add Stock" (only if the user has automate access) skips review when all automatic checks pass. (d) "Type instead" link types the bill without a file (see story STORY-057 (PURCHASES-REORDER-04)). (e) Inward challan > "Create linked purchase bill" opens the same workbench. (f) "Save & Process" under "More options" saves and posts automatically.

### Steps
1. Click sidebar "Inventory" → Inventory page opens on Today with cards under "What needs attention".
2. Click the "Scan or enter bill" button on Today → workbench opens (area Purchases, task "Scan or enter bill") with the "Scan a bill" panel expanded and "Saved uploads" if any exist.
3. Click the "Upload invoice PDF or image" file input (required field) → OS file picker opens; accepts PDF or images, "Up to 10 files · One invoice, in page order".
4. Pick `svp_2411_0873.jpg` in the picker (selection) → file name shows; "Received on" is already today's date (default: today, required for the Scan button, and the Scan button stays disabled without it).
5. Click "Scan bill" → button shows "Reading bill…"; the form fills: card "Distributor Bill" with Distributor, GSTIN, DL No., Invoice No., Invoice Date, Goods Received, Bill Type; "Products on this bill" with three "Product line" cards; "Check before adding stock" panel says "2 checks to finish"; "Original file saved" appears. No stock has changed ("Scan only · stock stays unchanged").
6. Click "Next check" in the sticky "Invoice checks" bar → focus jumps to line 2 field "Exp. Month" (required field, flagged amber).
7. Retype "Exp. Month" as 08 (required field; OCR misread) → the amber check turns green; bar now says "1 check to review".
8. Click "Next check" → focus jumps to line 3 field "Batch".
9. Type "DX2417B" into "Batch" (required in practice: the line header shows "Batch needed" until filled) → check clears.
10. Click "Back to review" (the same button relabelled when no checks remain) → returns to the top of the review; status cue reads "Ready for your final check".
11. Click "Refresh Matches" in card "Product matching and details" (the `<details>` "Product matching and catalogue details" is auto-open until the catalogue is ready) → each line shows "Possible match · confirm" or "Not in inventory".
12. Click "Confirm Match" on line 1 → badge turns success and the saved product's manufacturer and pack fill in.
13. Click "Confirm Match" on line 2.
14. Click "Confirm Match" on line 3.
15. Read the Supplier section: "Matching saved supplier found. Continue with invoice review." → no action needed (app already knows this supplier from name plus GSTIN; the fields Distributor and GSTIN are shown twice, once in "Supplier" and once in "Distributor Bill").
16. Click "Confirm reviewed values & add stock" (sticky "Invoice actions" bar; there is no window.confirm; the button itself is the guard and its own text says it confirms every current value together) → saves the draft, marks reviewed, then commits stock. Status reads "Stock added" with a stock reference; the bill now appears in Purchase bills as unpaid.

### Variations
- User lacks stock-commit permission: the button reads "Confirm reviewed values & mark reviewed" and a notice says "Review saved. Stock not added. An authorized colleague can add stock from this reviewed invoice."; a colleague later opens the bill and clicks "Add stock".
- Bill was already received on an inward challan: the button reads "Confirm & post bill" and stock label reads "Stock received earlier · 0 added again".
- Multi-page bill: select up to 10 files in step 3 in page order.
- Product not in the drug master: card shows "Not in inventory"; the "Invoice product kind" choice (Medicine, Cosmetic / skin care, Other consumable) and "This is a different product: create..." path appear; without product-edit permission it says staff with that permission are needed.

### Edge Cases
- Duplicate bill (same distributor and invoice number): recovery panel "Finish this purchase" with "Open existing invoice".
- Saved draft changed by someone else: alert "Saved invoice changed" with "Compare with saved version".
- Supplier GSTIN differs from the saved supplier: "Supplier GSTIN differs" with "Correct saved GSTIN" (needs supplier-update permission, a reason and a verified checkbox).
- Scan fails: original stays under "Saved uploads (n)" with "Use for this draft" and "Refresh saved uploads".
- Abandon the upload: the button "Reject this upload" (only before an invoice is saved) uses `window.confirm` "Reject this upload without adding stock? Its archived original will be retained." The guarded action is discarding the scan.
- Same information on several surfaces: "Received on" (scan panel) and "Goods Received" (Distributor Bill) hold the same date; Distributor name and GSTIN appear in "Supplier" and in "Distributor Bill"; stock state appears in the checklist cue, the sticky bar text ("Not saved · stock not added") and the register's Payment column ("Not posted"); pending review count appears on Today ("Purchase invoices to review") and in "Saved uploads".

---

### STORY-055: Mark a supplier bill as paid  [orig PURCHASES-REORDER-02]

**Type**: short
**Topic**: Purchases and reorder
**Persona**: Suresh Reddy, owner, paying the same distributor by UPI on a Friday.
**Goal**: Record a full payment against one posted purchase bill.
**Preconditions**: A posted bill "SVP/2411/0873" for Rs 4,820 with Payment state Due. User has supplier-payment rights (OWNER, ADMIN, ACCOUNTANT-style ledger writer or pharmacist with ledger capability).
**Ideal path**: 3. Open Purchase bills, click "Mark paid", confirm with remembered mode and today's date; the amount is already known.
**Alternate paths**: (a) Inventory > Purchases > "Payments & dues" (`PurchaseLedger`, title "Purchase Ledger"): card "Bulk Payment Allocation" with Distributor, Payment Date, Mode, Amount, Reference No, Notes, per-invoice "Allocate", button "Record Payment". (b) The register footer link "Outstanding in these N bills ..." opens Payments & dues. (c) Menu "More" > "Payments & dues". (d) Settle by credit instead: "Set off ₹x credit" inside this dialog or "Set off" on the distributor strip. (e) Bill detail page (opened from the Bill No link) via the workbench.

### Steps
1. Click sidebar "Inventory" → Inventory opens on Today.
2. Click area button "Purchases" → "Purchase bills" register loads, tab "Purchase" active, columns Sr No, Bill No, Entry Date, Bill Date, Entry By, Distributor, Bill Amount, Payment.
3. (optional) Choose "Due" in the "Payment status" filter → list narrows to due bills.
4. Click "Mark paid" in the Payment cell of the SVP row → dialog "Pay ₹4,820 to Sri Venkateswara Pharma Distributors" ("Settle bill SVP/2411/0873 · ₹4,820" if the distributor holds credit). Amount is fixed to the bill payable; there is no amount field.
5. (optional) Change the "Mode" select from its default (default: the last mode used, stored in the browser, else "NEFT / RTGS"; choices Cash, Cheque, NEFT / RTGS, UPI, Card) to "UPI".
6. (optional) Date: leave the pre-filled dd/mm/yyyy (default: today).
7. (optional) Type the "Cheque / UTR no." (max 80 characters).
8. Click "Record payment ₹4,820" → dialog closes; toast "Payment recorded" with "Undo"; the Payment cell shows Paid and an "Undo" button for 30 seconds. The dialog is the only confirmation; undo is the safety net.

### Variations
- Part payment: not possible here (amount is fixed); use Payments & dues, enter Amount 2000 and allocate it.
- Credit held by the distributor covers the bill: the dialog shows "₹x credit from ... covers this bill" and button "Set off ₹4,820 credit" as the primary action.
- Bill not yet posted: Payment shows "Not posted" and there is no "Mark paid".

### Edge Cases
- Invalid date: inline error under Date, focus returns to the field.
- Someone else paid the bill meanwhile: toast with the stale message and list reload.
- Mode and Date: Mode is remembered per browser; Date defaults to today but must be re-checked for back-dated payments.
- Same information on several surfaces: outstanding amount appears in the row Payment badge, the register footer "Outstanding in ...", the distributor position strip and Payments & dues "Distributor Summary".

---

### STORY-056: Find a distributor's bills and see what is owed  [orig PURCHASES-REORDER-03]

**Type**: short
**Topic**: Purchases and reorder
**Persona**: Dr. Anita Rao, owner, before a call to the distributor about a disputed bill.
**Goal**: See all bills from one distributor and the total outstanding and credit held.
**Preconditions**: At least three bills from Sri Venkateswara Pharma Distributors exist this financial year.
**Ideal path**: 3. Open Purchase bills, pick the distributor once, read the position strip.
**Alternate paths**: (a) Search box with field select "Distributor" instead of the filter. (b) "Suppliers" task > row button "Bills" (`onBills`) opens the register already filtered by GSTIN. (c) "Suppliers" row button for the account opens "Payments & dues" for that GSTIN. (d) Purchases > "Purchase costs" (`DistributorAnalytics`). (e) "Credits & vouchers" (`SupplierCreditPanel`) for credit only.

### Steps
1. Click sidebar "Inventory" → Today.
2. Click "Purchases" → Purchase bills register.
3. Click "More filters" → extra filters appear: Distributor, Bill status, Source, Entry by.
4. Choose "Sri Venkateswara Pharma Distributors" in "Distributor" (required for this goal; list is built from bills already entered) → register filters; a strip shows the distributor position (outstanding, credit held) and, if credit is settable, a set-off button.
5. Read the footer: "Bills ₹x · Outstanding in these N bills ₹y" → the outstanding text is a link to "Payments & dues".

### Variations
- Search by bill number: choose "Bill No" (default search field) in the search field select and type "0873".
- Date range: change the date filter (default: the register's default period) to include last year's bills.

### Edge Cases
- Nothing found: EmptyState "No purchase bills match your search" with button "Clear filters".
- Role without purchase read: "Scan or enter a bill" denial card.
- Same information on several surfaces: distributor outstanding shows in the strip, footer, Payments & dues summary, Suppliers task and Purchase costs.

---

### STORY-057: Type a bill by hand and add stock for a new product  [orig PURCHASES-REORDER-04]

**Type**: medium
**Topic**: Purchases and reorder
**Persona**: Farhan Sheikh, pharmacist, receiving a hand-written cash bill for a new cosmetic (Sebamed Clear Face Gel 50 g) from Hyderabad Derma Supplies, with no scannable copy.
**Goal**: Enter the bill manually, create the missing product in the catalogue, and add stock.
**Preconditions**: PHARMACIST with create, review and commit rights. The distributor exists in Suppliers; the product does not.
**Ideal path**: 9. Open the form, type invoice no., pick distributor, enter one product with batch/expiry/qty/rate/MRP/GST (five typed fields), confirm. Everything else defaults.
**Alternate paths**: Scan a photo instead (story STORY-054 (PURCHASES-REORDER-01)); "Import CSV"; "Gmail intake"; add the product first via Stock > "Stock list" "Add Inventory Item"; Pharmacy "Drugs" page add-drug; stock via "Manual opening stock" (no supplier payable) or an inward challan first.

### Steps
1. Click sidebar "Inventory" → Today.
2. Click "Scan or enter bill" button → workbench; scan panel open.
3. Click link "Type instead" → manual form opens, focus on "Distributor".
4. Type "Hyderabad Derma Supplies" in "Distributor" (required field).
5. Type "36AABCH7312K1ZQ" in "GSTIN" (required field, validated as a 15-character GSTIN).
6. Click the "Saved supplier" select and choose "Hyderabad Derma Supplies — 36AABCH7312K1ZQ" (optional but removes the "Supplier" warning; the app already knows this supplier, yet name and GSTIN are typed anyway). If the supplier is new, tick "I checked the supplier..." and click "Save verified supplier" instead (2 steps).
7. Type "HDS-5521" in "Invoice No." (required field).
8. "Invoice Date" (required field, default: today) and "Goods Received" (default: today; must not be before the invoice date) are left as they are; "Bill Type" stays "Cash" (default: Cash; the select offers Cash and Credit; choosing Credit reveals "Due Date").
9. Type "Sebamed Clear Face Gel" in line 1 "Product" (required field).
10. Type "50 g" in "Pack Size".
11. "Stock unit" is pre-filled "Strip" (default: Strip); retype it as "Tube" (required for correct stock counting; wrong default for a gel).
12. Type "SB25107" in "Batch".
13. "Exp. Month" is pre-filled 12 (default: 12); retype "03".
14. "Exp. Year" is pre-filled with next year (default); retype "2028".
15. "Paid Qty" is pre-filled 1 (default: 1); retype "10".
16. "Free Qty" default 0, leave.
17. Type "412.00" in "Rate" (defaults to 0; required for a correct payable).
18. Type "595.00" in "MRP" (defaults to 0).
19. Type "9" in "CGST %" and "9" in "SGST %" (two typed fields; defaults 0; the form rejects combining IGST with CGST/SGST).
20. Check "Check bill total" card against the paper bill total (read only; trade, special and cash discount, TCS, rounding sit inside the disclosure "Reported discounts, TCS & rounding").
21. Click "Refresh Matches" → line shows "Not in inventory".
22. Choose "Medicine", "Cosmetic / skin care" or "Other consumable" in "Invoice product kind" → pick "Cosmetic / skin care".
23. Expand the disclosure "This is a different product: create..." (a summary, not a button; shown for matched or unmatched lines) and confirm the pre-filled Product, Manufacturer, Pack, MRP, Rate, Batch → saved product created in the drug master.
24. Click "Confirm reviewed values & add stock" → draft saved, reviewed, stock committed; label "Stock added".

### Variations
- "Save draft" in the sticky bar stores an incomplete bill ("Not saved · stock not added" becomes "Stock not added") for later completion from "Saved uploads" or the register.
- Second product: click "Add Line" (one more line card, "Remove line n" available once there are two).
- "Apply to N selected" shared terms editor sets discount/GST on many lines at once, with "Undo shared terms".

### Edge Cases
- Missing required header values: the list "Distributor name is required", "Invoice number is required" etc. is shown; the action button stays disabled with the blocker text above it ("Review checks" link).
- GSTIN typo: "Distributor GSTIN must be a valid 15-character GSTIN".
- Goods received before invoice date: error "Goods received date cannot be before invoice date".
- Both IGST and CGST/SGST filled: "use either IGST or CGST and SGST".
- Same information several surfaces: Product name, pack, MRP and rate appear in the line card, in "Product matching and details", and again in "Receipt quantity and margin summary".

---

### STORY-058: Return expired stock to a supplier  [orig PURCHASES-REORDER-05]

**Type**: medium
**Topic**: Purchases and reorder
**Persona**: Meena Iyer, pharmacist, returning 12 expired tubes of an acne gel to Sri Venkateswara Pharma Distributors.
**Goal**: Create a supplier return challan that removes the stock and awaits a credit note.
**Preconditions**: The batch exists in stock with at least 12 tubes. The user has write rights on Supplier returns.
**Ideal path**: 6. Open the return form, choose supplier, pick the batch, set quantity, confirm. The app already knows the date and reference.
**Alternate paths**: (a) Purchase bills tab "Returns" > "New return". (b) Stock area link "Supplier returns are now in Purchase bills › Returns" (goes to the same tab). (c) Empty-state button "New return". (d) Stock optimization's "onReturns" shortcut. (e) Credit notes task from "Credits & vouchers" > "New" (`CREDIT_NOTE` document) if the note arrives first.

### Steps
1. Click sidebar "Inventory" → Today.
2. Click "Purchases" → Purchase bills.
3. Click tab "Returns" → register "Purchase returns" with filters Status, Distributor, Type, Reason, Entry by.
4. Click "New return" → document editor "Supplier returns" (help: "Save a draft and send the goods back on a challan...").
5. "Reference" is pre-filled SUPPLIER-RETURN-<today> (default); leave it. "Date" is pre-filled today (default; a dd/mm/yyyy day field).
6. Choose the distributor in "Supplier" ("Select supplier"; required field).
7. "Stock source" stays "Available stock (no hold)" (default); leave.
8. Type "acne" in "Add a batch" (needs at least 2 characters) → list of batches with expiry, available units and cost.
9. Click the matching batch row (e.g. "Adapalene Gel 0.1% · AG2408 · expires 03/2026") → a line is added.
10. Change line field "quantity 1" from its default (1) to 12 (required).
11. Type "Expired March 2026" in "Note (optional)".
12. Click "Create return challan" (primary action; no separate confirm dialog, the status label "Challan • stock returned" tells the outcome) → stock leaves inventory, status CHALLAN, and a button "Record credit note" appears for users with credit-write rights.

### Variations
- "Save draft" first, then finish later from the Returns list.
- Return from a blocked batch: choose it in "Stock source" (holds list).
- Cancel: "Cancel document" while DRAFT or CHALLAN; "Correct by reversal" for approvers once posted.

### Edge Cases
- More than available: server rejects with a recovery panel ("Recovery steps").
- Returned batch should have been quarantined first: "Open blocking source hold".
- Same information several surfaces: the return appears in the Returns tab, in Stock ledger, and as "Credit notes awaited" on Today; the "Record credit note" action exists in the document, in the Returns row and in the Credits & vouchers task.

---

### STORY-059: Record the credit note when it arrives  [orig PURCHASES-REORDER-06]

**Type**: short
**Topic**: Purchases and reorder
**Persona**: Meena Iyer, three days after story STORY-058 (PURCHASES-REORDER-05); the distributor's credit note CN/24/1187 dated 10/11/2026 for Rs 3,840 arrives by email.
**Goal**: Record the credit note against the return and set it off against an open bill.
**Preconditions**: The return challan exists with state CHALLAN. User can write credits.
**Ideal path**: 5. Open Returns, click "Record credit note", type number and date, accept the return value as amount, record. Set-off is offered in the same toast.
**Alternate paths**: (a) From the return document: button "Record credit note". (b) Credits & vouchers task, button for new credit note document ("Post supplier credit" primary, with "Add credit line"). (c) Today card "Credit notes awaited". (d) Set off later from the row button "Set off", the distributor strip, or "Set off ₹x instead" in Mark paid.

### Steps
1. Click sidebar "Inventory" → Today.
2. Click "Purchases" → Purchase bills.
3. Click tab "Returns" → the return shows "No credit note yet" and a "Record credit note" button.
4. Click "Record credit note" on the row → dialog "Record credit note from Sri Venkateswara Pharma Distributors" ("For return SUPPLIER-RETURN-2026-11-10").
5. Type "CN/24/1187" in "Credit note no." (required field, auto-uppercased).
6. Type "10/11/2026" in "Credit note date" (required field, dd/mm/yyyy; no default; it cannot be before the return date, which the app already knows).
7. Click "Same as return value" (optional shortcut; "Amount (₹)" is empty by default and required) → amount fills with the return value.
8. Click "Record credit note" → if the typed amount differs from the return value the dialog shows a warning and the button changes to "Record ₹3,500 anyway" (a confirmation guarding a mismatch with the goods value; one more click). Otherwise the dialog closes with toast "Credit note CN/24/1187 recorded: ₹3,840.00 from ..." and an action "Set off ₹3,840 now".
9. Click "Set off ₹3,840.00 now" in the toast → dialog "Set off credit from Sri Venkateswara Pharma Distributors" with open bills listed and "Set off ₹" amounts pre-filled from the oldest due date (default).
10. Click "Set off ₹3,840.00" → toast "Set off ₹3,840 against bill SVP/2411/0873" with "Undo" (30 seconds, shown in the Status column).

### Variations
- Wrong number entered: row button "Correct credit note CN/24/1187" opens "Correct credit note ..." with an extra required "Why correct it?" field; amount is locked once part has been set off.
- Duplicate number: field error on "Credit note no.".

### Edge Cases
- Another user changed the return: toast "This return changed" with the entry you typed echoed so it can be re-entered.
- Same information several surfaces: the credit appears in the Returns row Status, Credits & vouchers, the distributor strip (credit held) and the "Mark paid" dialog.

---

### STORY-060: Shortbook request to an approved purchase order  [orig PURCHASES-REORDER-07]

**Type**: medium
**Topic**: Purchases and reorder
**Persona**: Meena Iyer (pharmacist) raises the order; Dr. Anita Rao (owner) approves.
**Goal**: Turn low-stock items into a purchase order to a chosen supplier.
**Preconditions**: Active reorder targets exist so some items are below minimum. At least one active saved supplier.
**Ideal path**: 5. Open Shortbook, pick a supplier on the request, create the order, submit for approval; the approver then approves (one more step by another person).
**Alternate paths**: (a) Reorder > "Purchase orders" > "Add purchase order" (build the order by hand). (b) Automation: "Automation settings" with "Automatic PO drafts" and "Run saved settings" creates PO drafts without anyone touching the Shortbook. (c) Today card "Orders awaiting receipt" for follow-up. (d) "Add manual request" in Shortbook for an item not below target.

### Steps
1. Click sidebar "Inventory" → Today.
2. Click area button "Reorder" → Shortbook list (first task), showing each request as "Min x / available y · Supplier selection required".
3. Click "Sync shortages" → toast "Shortbook refreshed from active targets. Existing requests are preserved."
4. Click a request row (e.g. "Isotretinoin 20 mg: 3 strip") → document opens with two panels: the editor ("Reference", "Date", "Supplier", "Reason / notes", lines with Quantity) and "Supplier recommendation".
5. Choose a supplier in the panel select "Supplier" ("Select a saved supplier"; required before ordering).
6. Click "Save supplier" → "Supplier choice saved for this request and future shortages." (The editor also has its own "Supplier" select in the header grid; two controls for one fact.)
7. (optional) Change the line "quantity" from the suggested shortage.
8. Click "Create purchase order" (primary) → opens the new order (reference PURCHASE-ORDER-...), status draft.
9. Click "Submit for approval" → status "Awaiting manager approval".
10. Owner opens Reorder > "Purchase orders" and clicks the order row, then clicks "Approve document" → "Approved • ready for next step".
11. Click "Send purchase order" → records a delivery attempt; the page says "Supplier mail transport: setup required. Sending records the setup failure; export is available for manual delivery."
12. Click the icon button "Export order & remaining quantities" → CSV downloads for sharing with the distributor by WhatsApp or email.

### Variations
- Reject: "Reject proposal" for the approver.
- Cancel: "Cancel document" or details "Cancel remaining quantities".
- Same person is approver (owner): steps 9 and 10 happen in one session.

### Edge Cases
- No supplier chosen: the request cannot become an order; the row says "Supplier selection required".
- Item has no supplier history: the recommendation list is empty ("live supplier stock is not connected").
- Same information several surfaces: supplier, quantity and status appear in the Shortbook row, document editor, order delivery table and "Monitor".

---

### STORY-061: Weekly reorder cycle, receive the goods, post the bill and pay  [orig PURCHASES-REORDER-08]

**Type**: long
**Topic**: Purchases and reorder
**Persona**: Dr. Anita Rao (owner) and Meena Iyer (pharmacist) over one week.
**Goal**: From demand-based targets to goods received, billed and paid, with no stock counted twice.
**Preconditions**: Sales history of at least a few weeks; active suppliers; owner set as "Automation owner"; Meena has inventory write and ledger rights.
**Ideal path**: 18. Targets accepted in one screen (4), order raised from the Shortbook (3), approved (1), received as a challan (3), bill linked and posted (4), paid (3). Most data (quantities, supplier, lines) is already known to the app at each hand-off.
**Alternate paths**: Targets: "Stock optimization" (Stock area), "Manual targets & exclusions", "Automation settings" run, legacy `/dashboard/stock-predictions`. Receipt: scan the bill directly without a challan (story STORY-054 (PURCHASES-REORDER-01)); "Purchase orders" row "Receive remaining stock". Payment: "Payments & dues" bulk allocation.

### Steps
1. Click sidebar "Inventory" → Today.
2. Click area button "Reorder" → Shortbook list.
3. Click "Target proposals" → list of proposals.
4. Click "Generate target proposal" → proposal opens: evidence dates, assumptions, each line "Saved min / max → Proposed min / max" with "Demand records (n)" disclosure.
5. Click "Select unreviewed" → all undecided lines are ticked (optional: untick any line, one click each).
6. Leave the checkbox "Sync accepted targets to Shortbook" ticked (default: ticked).
7. Click "Accept selected" → "Selected targets accepted. Unselected lines remain available for review." Shortbook gets new requests. (Alternative "Reject selected" keeps the saved targets.)
8. Click "Shortbook" task → list now includes requests.
9. Click a request row → request opens.
10. Choose the supplier in "Supplier" ("Select a saved supplier"; required).
11. Click "Save supplier".
12. Click "Create purchase order" → order draft opens.
13. Click "Submit for approval" → "Awaiting manager approval".
14. (Owner) Click "Purchase orders" task, open the order, click "Approve document" → approved.
15. (Owner or pharmacist) Click "Send purchase order" → delivery attempt recorded (mail transport not configured), then click "Export order & remaining quantities" to share the CSV.
16. Four days later the goods arrive: click "Reorder" > "Purchase orders" > open the order → "Order delivery & receipts" table shows expected, received and remaining units.
17. Click "Receive remaining stock" → "Inward challans" editor opens, supplier and lines prefilled from the order ("Receipt against PURCHASE-ORDER-..."; quantities default to remaining).
18. (optional) Edit a line "quantity" where fewer units arrived.
19. Click "Receive stock" (primary) → stock is added; status Posted. This is stock received before the bill.
20. Click "Create linked purchase bill" → the "Scan or enter bill" workbench opens linked to the receipt (the app already knows supplier and goods).
21. Click "Upload invoice PDF or image", pick the file (2 steps: click, select) → "Received on" is today (default).
22. Click "Scan bill" → "Reading bill…" and the form fills.
23. Click "Refresh Matches" and "Confirm Match" on each line (n+1 clicks; the lines were already matched on the receipt in most cases, so the matches are usually already confirmed).
24. Click "Confirm & post bill" (label because a receipt is linked) → bill posted, stock label "Stock received earlier · 0 added again". A `window.confirm` appears only if you later choose to remove the receipt link: "Remove the receipt link only if these goods have not already been added to inventory. Posting this bill will add stock. Continue?" This guards against receiving twice.
25. Click "Purchases" > "Purchase bills" → new bill shows Payment Due.
26. Click "Mark paid" on the bill → dialog "Pay ₹x to ...".
27. Click "Record payment ₹x" (Mode defaults to the remembered one; Date defaults to today; Cheque / UTR no. optional) → "Payment recorded" toast with Undo.

### Variations
- Partial delivery: the order becomes "Part received"; "Receive remaining stock" is offered again for the rest.
- Supplier sends a bill with different rates: the scan flags differences on the linked bill; use "Compare with saved version".
- Credit note from an earlier return exists: step 26 dialog offers "Set off ₹x credit" instead of paying.
- Manual override: "More inventory tasks" > "Manual targets & exclusions" to edit min, max and reorder level for selected items, then "Review selected changes", enter the required "Reason", then "Save reviewed targets" (a second confirmation form guarding bulk changes).

### Edge Cases
- Targets cold start: lines read "Unconfigured: set manual targets first".
- Automation: "Automation settings" shows "Save settings" and "Run saved settings"; with "Automatic PO drafts" on, steps 4 to 12 may already have been done by the system, surfaced under "Saved run outcomes" with "Open generated document".
- Both a challan and a direct bill used for the same goods: the duplicate guard in the workbench ("Finish this purchase", "Open existing invoice") prevents double stock.
- Same information several surfaces: item, supplier, quantity and status repeat across the proposal, Shortbook row, order table, challan, bill and ledger; Monitor shows the same outcomes in charts; PO status also appears on Today ("Orders awaiting receipt").

---

### STORY-062: Add a new supplier  [orig PURCHASES-REORDER-09]

**Type**: short
**Topic**: Purchases and reorder
**Persona**: Suresh Reddy, owner, onboarding a new distributor, Charminar Medicals.
**Goal**: Save a supplier with GSTIN so it can be chosen on bills, returns and orders.
**Preconditions**: User has supplier-create permission (button hidden otherwise).
**Ideal path**: 4. Open suppliers, "Add supplier", type name and GSTIN, save. Everything else is optional.
**Alternate paths**: (a) Purchase bills menu "More" > "Suppliers". (b) Inside the bill workbench, "Supplier" section: tick "I checked the supplier..." and "Save verified supplier" (name and GSTIN only). (c) "Terms of Trade" for payment terms per distributor, separately. Two places hold supplier data: this directory form has a free-text "Payment terms" field and Terms of Trade has structured terms.

### Steps
1. Click sidebar "Inventory" → Today.
2. Click "Purchases" → Purchase bills.
3. Click menu "More" then "Suppliers" (or choose "Suppliers" in "More inventory tasks") → "Suppliers" list.
4. Click "Add supplier" → form with Supplier name, GSTIN, Drug licence, Food licence, Contact person, Email, Phone, Address, Payment terms, Notes, checkbox "Active supplier" (default: ticked).
5. Type "Charminar Medicals" in "Supplier name" (required field).
6. Type "36AAFCC9120B1ZM" in "GSTIN" (required field).
7. (optional) Type "Drug licence" "TS/HYD/20B/2145" and "Phone".
8. Click "Save supplier" → form closes, list reloads with the new row and row buttons for bills and account.

### Variations
- Edit: icon button "Edit supplier Charminar Medicals".
- Deactivate: untick "Active supplier"; inactive suppliers disappear from selects in returns, orders and shortbook.

### Edge Cases
- Duplicate GSTIN: the error message is shown in an alert above the list.
- Read-only role: "Ask a ..." message instead of the button.
- Same information several surfaces: supplier name and GSTIN appear in the Suppliers list, in every supplier select ("Name · GSTIN"), the register Distributor column, and the bill workbench "Saved supplier" select.

---

### Admin and setup: users, reset codes, doctor hours, rooms, fee list, procedures, doctor My Settings

### STORY-063: Dr. Anil logs a Fotona laser session for a returning patient  [orig ADMIN-SETUP-01]

**Type**: long
**Topic**: Admin and setup (Smart Procedures Management)
**Persona**: Dr. Anil Kumar, dermatologist (DOCTOR), logged in at the procedure room PC
**Goal**: Record today's Fotona Starwalker pass for patient Lakshmi Devi (session 3): body parts, shot counts, skin type and the first-pass machine settings.
**Preconditions**: Logged in as DOCTOR. Lakshmi Devi exists as a patient. At least one nurse user exists. Her two earlier sessions are already saved. Dr. Anil is not the first doctor in the doctor list.
**Ideal path**: 7 (open Procedures, pick patient, "repeat last session" prefills machine, body parts, skin type, settings and next session number, then 2 shot counts, 1 tweak, Save). The app already knows the patient's last session and the logged-in doctor.
**Alternate paths**: (a) Appointments "Book Appointment" dialog with Appointment Type "Procedure" and a "Procedure Name" (books the slot, records no machine data). (b) PrescriptionBuilder section "Procedures" in the visit form (free-text procedures on a prescription). (c) On Procedures, tab "Procedure History" > "Load & Edit" copies only patient, doctor, machine, indications/notes and skin type, sets Session No back to 1 and does not copy shots, body parts or pass settings. None bills the patient: the Fee list "Procedure" fee is only used in the appointment bill dialog.

### Steps
1. Click sidebar "Procedures" (Clinical section) → page "Smart Procedures Management", tab "New Procedure" open. Patient, Doctor and Nurse/Therapist are already filled with the first entry of each list (default: first patient in the list, first doctor, first nurse). First 100 patients only are loaded.
2. Click the "Patient *" select (required field; default: first patient of the list, a wrong patient by default) → dropdown of every patient, no search box.
3. Scroll and click "Lakshmi Devi" → patient set, and the "Procedure History" list reloads for her.
4. Click the "Doctor *" select (required field; default: first doctor in the list; app already knows this user is Dr. Anil) → doctor list.
5. Click "Dr. Anil Kumar" → doctor set.
6. Nurse/Therapist (optional; default: first nurse in the list, left as is, no step). Risk: a nurse who is not on duty is stored with the procedure.
7. Click "Session No." and type 3 (optional; default: 1; app already knows earlier sessions) → field shows 3.
8. Click "Shot Count (Begin)" and type 1200 (optional; default: 0) → field shows 1200.
9. Click "Shot Count (End)" and type 1850 (optional; default: 0) → disabled "Total Shots" shows 650 (computed).
10. Click body-part button "Face" (optional) → button turns filled.
11. Click body-part button "Cheeks" (optional) → filled.
12. Click "Indications" and type "Acne scars, rolling, both cheeks" (optional) → text kept.
13. Click "Fitzpatrick Type" select (optional) → I to VI.
14. Click "IV" (app already knows this from earlier sessions) → set. Robert Type, Scar Type, Herpes Status left empty (optional).
15. Click machine button "Fotona Starwalker" (required field) → card "Fotona Starwalker Parameters" opens: 8 parameter rows (Area, Spot Size, Energy, Fluency, Frequency, Wavelength, PTP Mode, Area) by 8 passes = 64 empty boxes. "Area" appears twice and both rows write the same value.
16. Click "Pass 1" cell in row Area and type "Cheeks" (optional).
17. Click Spot Size cell, type "7 mm" (optional).
18. Energy cell, type "1.6 J" (optional).
19. Fluency cell, type "12" (optional).
20. Frequency cell, type "2 Hz" (optional).
21. Wavelength cell, type "2940" (optional).
22. PTP Mode cell, type "MSP" (optional).
23. Click "Save Procedure" → button shows "Saving...", a Visit is created.
24. Click OK on the browser alert "Procedure saved successfully!" → form resets: Session No becomes 4, shots, parameters and notes clear; patient, doctor, machine, body parts, skin type stay.

### Variations
- Second pass of the same machine: type into the "Pass 2" column; each cell is a separate field (7 more steps per pass).
- Hydrafacial: only 2 parameters and 1 pass (Actives Used, Area), about 10 steps total.
- Doctor opens "Procedure History" first and clicks "Load & Edit" on the last visit: lands back on "New Procedure" with machine and notes prefilled but Session No back to 1.

### Edge Cases
- Machine left unselected: alert "Please fill in all required fields" (browser alert); patient and doctor can never be empty because they are prefilled.
- Shot Count (End) lower than Begin: "Total Shots" shows a negative number, save still works.
- Session No cleared: field snaps to 1; shot fields snap to 0 on empty (they are text boxes that parse integers).
- Failure on save: alert "Failed to save procedure. Please try again." and nothing resets.
- Analytics tab shows "Analytics dashboard coming soon".
- Same patient/doctor/visit facts appear on Procedure History cards ("Procedures captured from visits (n found)") and later in Patients > History.

---

### STORY-064: Doctor blocks tomorrow as leave from My Settings  [orig ADMIN-SETUP-02]

**Type**: short
**Topic**: Admin and setup (doctor My Settings, availability)
**Persona**: Dr. Anil Kumar, DOCTOR, has a family function tomorrow
**Goal**: Make tomorrow unbookable so reception cannot schedule patients.
**Preconditions**: Logged in as DOCTOR on any dashboard page.
**Ideal path**: 3 (open settings, pick the date, Add leave). Single day leave needs only a date.
**Alternate paths**: Admin does the same under Users > "Working Hours" on the doctor's row (same component, section "Leave and blocked time"); a clinic-wide closure uses Users > "Clinic Holidays" instead (see STORY-069 (ADMIN-SETUP-09)). No UI warns about existing appointments on that day (backend `createTimeOff` only checks the dates).

### Steps
1. Click the gear "Open settings" in the header → dialog "My Settings" opens, long: Doctor signature, Prescription letterhead, Weekly working hours (IST), Overbooking, "Leave and blocked time", WhatsApp switches. Same data also under Users > "Working Hours".
2. In "Leave and blocked time", click "From" and pick tomorrow's date (required field; default: today). "To" follows automatically (default: today, auto-moves to the same date); "All day" is checked (default); a "Type" select shows Leave (default: Leave; other choice Blocked time).
3. Click "Reason (optional)" and type "Family function" (optional).
4. Click "Add leave" → entry "Leave · <date range> · Family function" appears in the list with a trash icon. No confirmation; the trash icon deletes immediately with no confirmation.
5. Click "Close" (bottom of the dialog) → dialog closes. Do not press "Save": it saves only the two WhatsApp switches, leave was already saved by "Add leave".

### Variations
- Two-hour block: untick "All day", fields "Start time" (default 13:00) and "End time" (default 14:00) appear, set both, choose Type "Blocked time" (2 more steps).
- Multi-day leave: also set "To" (1 more step).

### Edge Cases
- "To" before "From": inline error "The end date must be on or after the start date." (Fields cannot produce this normally because From auto-bumps To.)
- Leave longer than one year: server error shown inline.
- Existing booked appointments on that day stay booked and are not listed.
- The bottom "Save" button is next to settings that save immediately on their own button, so users can think Add leave is unsaved until Save.

---

### STORY-065: Admin issues a reset code for a locked-out receptionist  [orig ADMIN-SETUP-03]

**Type**: short
**Topic**: Admin and setup (reset codes)
**Persona**: Sunita Rao, ADMIN, with receptionist Pooja Sharma standing at the desk who forgot her password
**Goal**: Give Pooja a one-time reset code in person.
**Preconditions**: Logged in as OWNER or ADMIN; Pooja is a user.
**Ideal path**: 3 (open Users, click Reset password on her row, confirm and read the code). The confirm dialog guards against a code being handed to the wrong person.
**Alternate paths**: none found (forgot-password is admin-issued only; the login page has no email flow).

### Steps
1. Click sidebar "Users" (Admin section) → page "Users Management", card "All Users" with one row per user (name, email, role, status, buttons).
2. On Pooja Sharma's row click "Reset password" → dialog "Reset password for Pooja Sharma" asking to confirm in person and warning that an earlier code is cancelled and the action is recorded in the audit log (no UI to view the audit log).
3. Click "I have confirmed who is asking. Create code" (confirmation dialog step; guards against issuing a code to an impostor) → button shows "Creating code…", then the code `XXXX-XXXX` appears with its expiry (24 hours) and the line "This code is shown only once".
4. Click "Copy code" (optional) → code copied; or read it aloud.
5. Close the dialog with the X or Esc → code stays valid; closing does not cancel it.

### Variations
- Owner or admin issues the code for themselves: allowed from their own row.
- Issue a second code: earlier code is cancelled.

### Edge Cases
- Closed too soon: the code cannot be shown again; issue a new one.
- MANAGER sees the button but the request is refused: red message inside the dialog.
- Row buttons for every user: Edit, Delete, Reset password, Role & Permissions (plus Working Hours and WhatsApp Settings for doctors), nine to eleven controls repeated per row.

**Merged from**: SIGNIN-NAVIGATION-08 ("Owner issues a reset code for a locked-out nurse"), a substantially identical journey (same goal, same screens). Its full text is kept below as a variant so no steps are lost.

#### Merged variant: SIGNIN-NAVIGATION-08 (Owner issues a reset code for a locked-out nurse)
**Type**: medium
**Topic**: Sign-in, role landing, navigation and recovery
**Persona**: Dr. Meera Iyer, clinic owner, Priya Nair is standing in front of her
**Goal**: Hand Priya a one-time reset code
**Preconditions**: Signed in as OWNER (or ADMIN) on the Dashboard; Priya's user record exists and is active
**Ideal path**: 3 - open Users, click "Reset password" on Priya's row, confirm and show the code; the confirmation can be the same click that creates it.
**Alternate paths**: none found in the UI. The password-reset service mentions the server operator's issue-reset-code script, which is not a screen. The "Edit User" dialog on the same row is a different, non-reset way to change a user and does not set passwords by a code.

##### Steps
1. Click "Users" in the sidebar (section "Admin") → `/dashboard/users`, page "Users Management", table "All Users"
2. Find Priya Nair's row in the table (no click; scroll if the list is long) → row buttons "Edit", "Delete", "Reset password"
3. Click "Reset password" on her row → dialog "Reset password for Priya Nair" with warnings "Only issue a code to Priya Nair after confirming in person that they are asking. Anyone with the code can set this account's password." and "Issuing a code cancels any earlier code for them. It is recorded in the audit log."
4. Click "I have confirmed who is asking. Create code" (this is the confirmation that guards handing out account access; there is no second dialog) → button "Creating code…", then the dialog shows the code "K7MQ-4XWP" in large type and "It works once and expires 14 Nov 2026, 9:42 am"
5. (optional) Click "Copy code" → code copied to clipboard
6. Read the code to Priya, then close the dialog → closing resets it to the confirm step; the code is never shown again ("This code is shown only once. Closing this window does not cancel it; issuing another code does.")

##### Variations
- A MANAGER sees "Users" in the sidebar and the same "Reset password" button, but `POST /auth/users/:id/reset-code` is limited to OWNER and ADMIN; after step 4 the dialog shows an error. The button is visible to a role that cannot use it, and appears on every row including the owner's own.
- An ADMIN issuing a code for an OWNER gets "You cannot reset the password of a user at or above your role."

##### Edge Cases
- Same information on several surfaces: the reset instructions appear in this dialog ("They open the sign-in page, choose enter your reset code..."), on the login page, and on the reset page's help text, all in slightly different words.
- If the code is lost (dialog closed before it was read), the only recovery is issuing another code.

---

### STORY-066: Admin adds a new receptionist account  [orig ADMIN-SETUP-06]

**Type**: medium
**Topic**: Admin and setup (users)
**Persona**: Sunita Rao, ADMIN, onboarding Kavitha Nair as front-desk receptionist
**Goal**: Create a working RECEPTION login.
**Preconditions**: Logged in as OWNER or ADMIN; Kavitha's phone and email known.
**Ideal path**: 7 (open Users, New User, 4 fields: name, phone, email, role pick, then Create; password auto-generated and shown as a one-time code like reset codes). Today the admin invents a password for the staff member.
**Alternate paths**: none found for creating users. (After creation, "Role & Permissions" > "Apply Role" can change the role later; the create form already asks for a role.)

### Steps
1. Click sidebar "Users" → page "Users Management".
2. Click "New User" (top right) → dialog "Create User" with First Name, Last Name, Email, Phone, Role, Status, "Password (8-20 chars)", buttons "Cancel" and "Create".
3. Type "Kavitha" in "First Name" (required field).
4. Type "Nair" in "Last Name" (required field).
5. Type "kavitha.nair@clinicms.in" in "Email" (required field; the backend rejects a bad email, the form has no marker).
6. Type "9848012345" in "Phone" (required field; empty phone shows alert "Phone number is required").
7. Role: leave "Receptionist" (default: Receptionist; no step). Status: leave "Active" (default: Active; no step).
8. Type a password in "Password (8-20 chars)" (required field; no confirm box, no show/hide toggle). Under 8 or over 20 characters: alert "Password must be 8-20 characters".
9. Click "Create" → dialog closes, the table reloads (a skeleton shows while loading), Kavitha appears in "All Users" with role RECEPTION, status ACTIVE.
10. Check the row: role column shows the raw enum "RECEPTION" while the form said "Receptionist".

### Variations
- A doctor: change "Role" to "Doctor" (2 more steps: open select, choose); the doctor row then gains "Working Hours" and "WhatsApp Settings".
- Owner or accountant account: not offered in the Role list (only Admin, Doctor, Nurse, Receptionist, Manager, Pharmacist).
- Fix a typo later: row "Edit" opens "Edit User" (same fields without password), button "Save".

### Edge Cases
- Duplicate email/phone: server error; the dialog stays open, and the code shows no inline message, only whatever the API client surfaces.
- "Delete" on the row asks the browser confirm "Delete user?" (guards against deleting the account).
- Status Suspended/Pending/Inactive options exist; no tooltip says what each blocks.
- Same user data appears in the global header search results (link `/dashboard/users?search=`), the Users table, and the Procedures doctor and nurse dropdowns.

---

### STORY-067: Admin sets a new doctor's weekly hours and overbooking  [orig ADMIN-SETUP-07]

**Type**: long
**Topic**: Admin and setup (doctor hours, overbooking)
**Persona**: Sunita Rao, ADMIN; new dermatologist Dr. Kavya Reddy works Mon to Sat, 10:00 to 14:00 and 17:00 to 20:00, Saturday morning only, Sunday off, and may double-book at most 3 patients per slot.
**Goal**: Replace the default 09:00-18:00 daily schedule with her real hours and allow 3 patients per slot.
**Preconditions**: Logged in as OWNER or ADMIN; Dr. Kavya Reddy has been created with role Doctor and has no hours yet.
**Ideal path**: 9 (open Users, open Working Hours, edit Monday shift 1 start and end, add and edit shift 2 start and end, apply Monday to Mon-Sat, remove Sunday, Save hours). Overbooking needs 3 more (switch, number, save).
**Alternate paths**: Dr. Kavya can do the same in header "My Settings" (same component). WhatsApp for the doctor in both Users > "WhatsApp Settings" and My Settings.

### Steps
1. Click sidebar "Users".
2. On Dr. Kavya Reddy's row click "Working Hours" → dialog "Availability: Dr. Kavya Reddy". Amber note: "No hours set yet; the clinic default 09:00-18:00 applies every day. Save to set a schedule." All seven days are prefilled with 09:00 to 18:00 (Sunday through Saturday) as real shifts.
3. Click Sunday's trash icon "Remove Sunday shift 1" → Sunday shows "Day off". No confirmation.
4. Click Monday "start" time ("Monday shift 1 start") and type 10:00 (default: 09:00).
5. Click Monday "end" time and type 14:00 (default: 18:00).
6. Click "+ Shift" on Monday ("Add Monday shift") → second shift 14:00 to 18:00 appears (default: 14:00 to 18:00).
7. Click Monday shift 2 start and type 17:00.
8. Click Monday shift 2 end and type 20:00.
9. Click "Copy Monday to Tue–Fri" → Tuesday to Friday replaced with Monday's two shifts.
10. Click Saturday shift 1 start and type 10:00 (default: 09:00).
11. Click Saturday shift 1 end and type 14:00 (default: 18:00).
12. Click "Save hours" → status "Working hours saved." (inline text under the button; the amber note disappears).
13. Click the "Allow overbooking" switch → select "Up to [2] patients per slot" appears (default: 2).
14. Click the "Patients per slot" select → choices 2 to 5.
15. Click "3".
16. Click "Save overbooking" (disabled until the value differs from saved) → "Saved: up to 3 patients per slot."
17. Close the dialog with X.

### Variations
- Doctor with a single continuous shift: skip steps 6 to 8.
- Hours for a doctor already saved: note changes to nothing, and the weeks load from saved shifts.
- Legacy hours: note "These hours come from the old working-hours setting. Save to keep them as the weekly schedule."

### Edge Cases
- Overlapping or reversed shifts: inline red text such as "Monday: shifts overlap" or "Monday: 17:00-14:00 must end after it starts"; nothing saved.
- Every day removed: "Add at least one shift".
- "Save hours" and "Save overbooking" are separate saves; closing between them loses the unsaved one silently.
- After saving, reception sees the new hours in Appointments (calendar columns and free slots) and, with overbooking on, gets the prompt "Overbook this slot?" ("Cancel"/"Book anyway") when booking an occupied slot.

---

### STORY-068: Admin adds a procedure room and retires an old one  [orig ADMIN-SETUP-08]

**Type**: medium
**Topic**: Admin and setup (rooms)
**Persona**: Sunita Rao, ADMIN; a second laser room has opened and the old "Store Room 1" entry should stop appearing in booking
**Goal**: Add "Laser Room 2" and deactivate "Store Room 1".
**Preconditions**: Logged in as ADMIN, OWNER or DOCTOR (only these see tab "Manage Rooms"). "Store Room 1" exists.
**Ideal path**: 6 (open Rooms, Manage Rooms, Add Room, type the name with type and capacity defaults acceptable, Add Room, toggle the old room off). Tabs could be skipped if rooms were a section of one page.
**Alternate paths**: none found for creating rooms. Rooms are also visible (read only) in Appointments filters, the booking dialog room cards and Rooms > "Calendar View". Deactivate vs Delete are two ways to retire a room (Switch, or "Delete" with a browser confirm).

### Steps
1. Click sidebar "Rooms" → page "Room Management", tab "Calendar View" shown ("Room Calendar & Occupancy").
2. Click tab "Manage Rooms" → heading "Rooms Management", stat cards, card "All Rooms" with filters.
3. Click "Add Room" → dialog "Add New Room" (Room Name *, Room Type *, Capacity *, checkbox "Room is active", buttons "Cancel" and "Add Room").
4. Type "Laser Room 2" in "Room Name *" (required field; placeholder "e.g., Consultation Room 1").
5. Click "Room Type *" (required field; default: Consultation Room).
6. Click "Procedure Room" (list also has Operation Theater, Telemedicine Suite, Emergency Room, Recovery Room, Waiting Area, Laboratory).
7. Click "Capacity *" and type 2 (required field; default: 1; allowed 1 to 20).
8. "Room is active" stays checked (default: checked; no step).
9. Click "Add Room" → toast "Room created", the table gains "Laser Room 2".
10. In the "All Rooms" table click the switch (aria "Deactivate room") on the "Store Room 1" row → badge changes to Inactive, toast "Room deactivated". No confirmation.

### Variations
- Fix a name: row "Edit" opens "Edit Room", button "Update Room".
- Remove: row "Delete" opens a browser confirm `Are you sure you want to delete "Store Room 1"?` (guards the deletion), toast "Room deleted".
- Filter long lists: "Search by room name...", "Type" and "Status" selects (3 steps).

### Edge Cases
- Empty name: toast "Room name is required".
- Receptionist or nurse: tab "Manage Rooms" is not shown; they only get "Calendar View".
- The word is "Add Room" on the button and "Add New Room" in the dialog title; the tab is "Manage Rooms" and the heading "Rooms Management" under page title "Room Management" (three spellings).

---

### STORY-069: Owner onboards a new dermatologist end to end  [orig ADMIN-SETUP-09]

**Type**: long
**Topic**: Admin and setup (users, hours, overbooking, WhatsApp, holiday, doctor My Settings)
**Persona**: Dr. Sunita Rao, OWNER, brings in Dr. Kavya Reddy; then Dr. Kavya sets up her own signature and letterhead on her first day
**Goal**: Dr. Kavya has a login, her hours, overbooking limit, WhatsApp auto-confirm, the clinic closed for Sankranti, and her signature and letterhead ready for printing prescriptions.
**Preconditions**: Logged in as OWNER (steps 1 to 35), then Dr. Kavya logged in with the password the owner invented (steps 36 to 39). Signature (PNG) and A4 letterhead (PNG) files on the computer.
**Ideal path**: 24. Create user 7 (open Users, New User, names, phone, email, role pick, Create with generated password) plus open = 8; hours 6 (Monday shift edits, copy to Mon-Sat, Save); overbooking 2; WhatsApp auto-confirm 1 (on by default); holiday 4; doctor uploads 3. One-time password issued by the app removes the password field.
**Alternate paths**: (a) hours, overbooking and leave also in header "My Settings" for the doctor herself; (b) WhatsApp auto-confirm also in header "My Settings" (without Phone Number ID and Access Token); (c) holidays only exist under Users > "Clinic Holidays"; (d) signature and letterhead only in header "My Settings", owner cannot upload them for a doctor.

### Steps
1. Click sidebar "Users" → "Users Management".
2. Click "New User" → dialog "Create User".
3. Type "Kavya" in "First Name" (required field).
4. Type "Reddy" in "Last Name" (required field).
5. Type "kavya.reddy@clinicms.in" in "Email" (required field).
6. Type "9966123456" in "Phone" (required field).
7. Click "Role" select (default: Receptionist).
8. Click "Doctor". Status stays "Active" (default: Active; no step).
9. Type a password in "Password (8-20 chars)" (required field; no confirm box).
10. Click "Create" → dialog closes, Dr. Kavya's row appears with extra buttons "Working Hours" and "WhatsApp Settings".
11. Click "Working Hours" on her row → dialog "Availability: Dr. Kavya Reddy" with the default note "No hours set yet; the clinic default 09:00-18:00 applies every day." and all 7 days prefilled 09:00 to 18:00.
12. Click the trash icon "Remove Sunday shift 1" → Sunday "Day off".
13. Monday shift 1 start: type 10:00 (default: 09:00).
14. Monday shift 1 end: type 14:00 (default: 18:00).
15. Click "+ Shift" on Monday → shift 2 shown 14:00 to 18:00.
16. Monday shift 2 start: type 17:00.
17. Monday shift 2 end: type 20:00.
18. Click "Copy Monday to Tue–Fri".
19. Saturday shift 1 start: type 10:00 (default: 09:00).
20. Saturday shift 1 end: type 14:00 (default: 18:00).
21. Click "Save hours" → "Working hours saved."
22. Click the "Allow overbooking" switch (default: off) → "Up to [2] patients per slot".
23. Click the "Patients per slot" select.
24. Click "3".
25. Click "Save overbooking" → "Saved: up to 3 patients per slot."
26. Close the dialog (X).
27. Click "WhatsApp Settings" on Dr. Kavya's row → dialog "Doctor WhatsApp Settings" with switch "Send WhatsApp on appointment creation", optional "Doctor WhatsApp Phone Number ID", optional "Doctor WhatsApp Access Token", switch "Use WhatsApp Template", "Manage", "Close", "Save".
28. Click the "Send WhatsApp on appointment creation" switch (default: off).
29. Click "Save" → toast "Saved" / "WhatsApp settings updated"; dialog closes. (Phone Number ID and Access Token left blank: optional, clinic default applies.)
30. Click "Clinic Holidays" (top right) → dialog "Clinic Holidays", text "Holidays close the clinic for all doctors." and the holiday form.
31. Click "From" and pick 14 Jan 2027 (default: today).
32. Click "To" and pick 15 Jan 2027 (default: today; "All day" checked by default).
33. Click "Reason (optional)" and type "Sankranti" (optional).
34. Click "Add clinic holiday" → entry appears in the list; no confirmation; its trash icon removes it with no confirmation.
35. Close the dialog (X). Owner signs out; Dr. Kavya signs in with her phone or email and the password.
36. (Dr. Kavya) Click the gear "Open settings" → "My Settings" shows Doctor signature, Prescription letterhead, her weekly hours (same component as step 11) and WhatsApp switches (same as step 28).
37. Click "Upload signature" file box, choose `kavya-signature.png` (PNG or JPG up to 2 MB) → "Signature saved." and preview. Saves immediately, no Save needed.
38. Click "Upload letterhead" file box, choose `kavya-letterhead-a4.png` (PNG or JPG up to 5 MB) → "Letterhead saved."
39. Click "Close" (not "Save", which saves only WhatsApp switches).

### Variations
- Owner decides the doctor should be Admin too: row "Role & Permissions" dialog, Role select, "Apply Role" (alert "Role updated to ADMIN successfully!"), or fine-tune with per-resource "Select all"/"Clear" and a checkbox per permission, then "Save Permissions" (alert "Permissions updated successfully!"). The role list there omits Owner and Accountant.
- Doctor wants templates: "Use WhatsApp Template" switch then Template Name and Language Code (both required when on), or "Manage" opens "WhatsApp Template Editor" (Name, Touchpoint, Language, Ownership, Generate, Designer, Variables, Plain Text, "Save Template", "Send Test").
- Admin set hours for the doctor in step 11 but Dr. Kavya later edits them herself in My Settings; both write the same hours.

### Edge Cases
- Hours or overbooking not saved before closing the dialog: silently lost; two separate "Save" buttons.
- Doctor presses "Save" in My Settings after uploading files: only the WhatsApp switches are saved; nothing visible about files; toast "Settings saved" / "WhatsApp preferences updated."
- "Use WhatsApp Template" on with empty name: toast "WhatsApp settings incomplete".
- Non-image file or file over limit: "Choose a PNG or JPG image up to 2 MB." / "5 MB."
- MANAGER logged in on Users page: all buttons visible, API refuses writes (`MANAGE` is OWNER and ADMIN).
- Same information on several surfaces: doctor name and role appear in the Users table, the Procedures doctor dropdown, the Appointments Doctor filter, and the prescription print header; weekly hours appear in Users > Working Hours and My Settings; WhatsApp state in Users > WhatsApp Settings and My Settings.

---

### Sign-in, role landing, navigation and recovery

### STORY-070: Receptionist signs in at the start of the day  [orig SIGNIN-NAVIGATION-01]

**Type**: short
**Topic**: Sign-in, role landing, navigation and recovery
**Persona**: Ananya Reddy, receptionist at Linae Skin and Hair Clinic, Hyderabad, arriving at 9:00 and opening the clinic site on the front-desk PC
**Goal**: Get from a closed browser to the Dashboard as RECEPTION
**Preconditions**: Active RECEPTION account (ananya.reddy@linaeclinic.in), no `auth_token` cookie (logged out or expired after 7 days)
**Ideal path**: 3 - type the identifier, type the password, press Enter; the identifier is the only thing a browser could not already know, and the app needs nothing else.
**Alternate paths**: Opening `/dashboard` directly (or any `/dashboard/*` URL) does the same redirect via `middleware.ts` but carries `next=` for that page; the browser's saved-password autofill can fill both fields (then step 4 is the only action). None found for signing in a different way (no SSO, no OTP, no "remember me").

### Steps
1. Open the clinic address in the browser → `/` redirects to `/dashboard`, `middleware.ts` finds no `auth_token` cookie and redirects to `/login?next=%2Fdashboard`; card "ClinicMS Login" with the clinic letterhead image, field "Phone or email" is focused (autoFocus)
2. Type "ananya.reddy@linaeclinic.in" in "Phone or email" (required field; placeholder "Phone or email"; a phone number is also accepted) → "Sign in" is still disabled
3. Type the password in "Password" (required field; masked) → "Sign in" becomes enabled
4. Click "Sign in" (or press Enter) → button shows "Signing in…", `POST /auth/login` sets the HttpOnly cookie, `router.replace('/dashboard')`; Dashboard shows with sidebar entries Dashboard, Patients, Appointments, Rooms, Pharmacy Desk, Pharmacy Counter, Inventory

### Variations
- Sign in with the 10-digit mobile 98480 12345 instead of the email: the server strips non-digits and looks it up as stored (see story STORY-076 (SIGNIN-NAVIGATION-07) for what happens when the stored number carries a country code).
- Press Enter in "Password" instead of clicking "Sign in": same result, one fewer pointer move.

### Edge Cases
- Submit with one field empty: "Sign in" is disabled, so the message "Phone or email and password are required" in `submit()` is unreachable by click.
- Same facts on several surfaces: after landing, her name and role "RECEPTION" show only in the sidebar footer; the Dashboard greeting ("Welcome back! Here's what's happening at your clinic today.") does not name her.
- Every role lands on the same `/dashboard`; there is no reception-specific landing, so the first screen contains "Total Users", "Active Users", "Total Branches", "System Status" cards that mean nothing to a receptionist (the statistics endpoint has no role check).

---

### STORY-071: Doctor returns to an exact visit after the session lapsed  [orig SIGNIN-NAVIGATION-02]

**Type**: short
**Topic**: Sign-in, role landing, navigation and recovery
**Persona**: Dr. Kavita Rao, dermatologist, reopening a bookmarked visit link after lunch
**Goal**: Sign back in and land on the same visit page she bookmarked, not the Dashboard
**Preconditions**: DOCTOR account; no valid `auth_token` cookie; bookmark `/dashboard/visits?patientId=P-1042&appointmentId=A-5531&autoStart=true`
**Ideal path**: 3 - type identifier, type password, submit; the return address is already known to the app.
**Alternate paths**: Two separate mechanisms do the same "remember where I was" job: (a) `middleware.ts` redirect adds `next=` when the cookie is absent; (b) `apiClient` on any 401 and `handleUnauthorizedRedirect` in `authRedirect.ts` add `next=` and also write `cms_next_after_login` to localStorage. A third path, `DashboardLayout.fetchCurrentUser`, redirects a 401 from `/auth/me` to plain `/login` with no `next`. The localStorage value is never read by the login page (it reads only the `next` query), so it is dead state.

### Steps
1. Click the bookmark → `middleware.ts` redirects to `/login?next=%2Fdashboard%2Fvisits%3FpatientId%3DP-1042%26appointmentId%3DA-5531%26autoStart%3Dtrue`; "ClinicMS Login" shown
2. Type "kavita.rao@linaeclinic.in" in "Phone or email" (required field) → field accepted
3. Type the password in "Password" (required field) → "Sign in" enabled
4. Click "Sign in" → `loginDestination(next)` accepts it (starts with `/`, not `//`, no backslash or control characters) and `router.replace` opens the visit directly with the query intact

### Variations
- Cookie present but its JWT expired: the Dashboard shell renders, `/auth/me` returns 401; `apiClient` sets `window.location.href = /login?next=...` while `DashboardLayout` also calls `router.replace("/login")`. Whichever navigation wins decides whether she returns to the visit or lands on `/dashboard` after sign-in.
- Unsaved visit text: the visit form autosaves drafts to localStorage, so text typed before expiry survives, but the sign-in page gives no hint of that.

### Edge Cases
- A hand-edited `next=//evil.example` or `next=/%2f...` is rejected by `loginDestination` and falls back to `/dashboard`.
- The Google Calendar callback `/dashboard/appointments/google-callback` is exempt from the cookie redirect in `middleware.ts`.

---

### STORY-072: Doctor jumps to the next patient from the notification bell  [orig SIGNIN-NAVIGATION-03]

**Type**: short
**Topic**: Sign-in, role landing, navigation and recovery
**Persona**: Dr. Kavita Rao, between consultations on the desktop
**Goal**: Open the visit for the next booked patient (Rohit Verma, 10:30) without going through the calendar
**Preconditions**: Signed in as DOCTOR on a desktop-width window; at least one upcoming appointment within the alerts window (the Admin summary says "Within 48 hours")
**Ideal path**: 2 - open the list of upcoming patients, click one.
**Alternate paths**: Sidebar "Appointments" > calendar row "START" or "Appointment Details" > "Start Visit"; Dashboard card "Today's Appointments" (rows are not clickable; only "View All Appointments"); Dashboard "Recent Visits" and "My Patients" panels; Patients row "Start Visit"; Visits setup "Start Visit Documentation". The bell is one of about eight routes to start a visit.

### Steps
1. Click the bell button labelled "Notifications" in the header (badge shows the item count, "9+" above 9) → dropdown titled "Notifications"; each row reads like "Rohit Verma on 13 Nov 2026, 10:30" with sub-line "OPD • CONFIRMED" (up to 6 rows for a doctor); list refreshes every 60 s
2. Click the "Rohit Verma" row → `router.push('/dashboard/visits?appointmentId=<id>')`; Visits page opens for that appointment (no `autoStart`, so the setup screen or resume view appears, one more action may follow)

### Variations
- No alerts: dropdown shows "No notifications" and no badge.
- Items listed have no section for "now"; a patient already marked IN_PROGRESS appears in the same list as one a day away.

### Edge Cases
- The bell lives in the desktop header only. On a phone-width window the header is hidden (see story STORY-075 (SIGNIN-NAVIGATION-06)), so a doctor on a phone has no bell.
- Same information on several surfaces: upcoming appointments appear in the bell, Dashboard "Today's Appointments", the Appointments calendar, and Dashboard "Recent Visits" for finished ones; the bell's second dropdown row "View reports & alerts" goes to `/dashboard/reports`, which doctors have no sidebar entry for.

---

### STORY-073: Pharmacist logs out at closing time  [orig SIGNIN-NAVIGATION-04]

**Type**: short
**Topic**: Sign-in, role landing, navigation and recovery
**Persona**: Suresh Naidu, pharmacist, closing the counter PC at 9 pm
**Goal**: End the session so the next person cannot use his login
**Preconditions**: Signed in as PHARMACIST; desktop layout
**Ideal path**: 1 - one click on a clearly labelled sign-out control.
**Alternate paths**: none found (no logout in the header, no profile menu; the only control is the icon button in the sidebar footer). Closing the browser does not log out (cookie lasts 7 days).

### Steps
1. Click the icon-only button "Log out" (door icon, `aria-label="Log out"`, no visible text) at the bottom right of the sidebar footer, next to the avatar "SN", "Suresh Naidu", "PHARMACIST" → no confirmation dialog; `POST /auth/logout` expires the cookie, `router.replace('/login')`; "ClinicMS Login" appears
2. Press the browser Back button → `/dashboard` is requested without a cookie and `middleware.ts` redirects to `/login?next=%2Fdashboard`; Dashboard content is not shown

### Variations
- The logout request fails (offline): `apiClient.logout` swallows the error and clears client state; he still lands on `/login`, but the HttpOnly server cookie may remain, so Back may show the Dashboard again. Nothing tells him.
- Open Pharmacy Counter dispense work in another tab: no warning about unsaved or in-progress dispense tasks.

### Edge Cases
- Logout has no confirmation; it guards nothing and loses nothing server-side, but an unsaved Sales bill form is dropped silently.
- Same information on several surfaces: who is signed in appears only in the sidebar footer, so on a shared counter PC the user can only confirm the account by looking at that corner.

---

### STORY-074: Receptionist orients herself: what her menu shows and what it does not  [orig SIGNIN-NAVIGATION-05]

**Type**: medium
**Topic**: Sign-in, role landing, navigation and recovery
**Persona**: Ananya Reddy, receptionist, a walk-in customer asks to buy a moisturiser from the clinic pharmacy
**Goal**: Reach the day's appointments, then find out whether she can ring up a pharmacy sale
**Preconditions**: Signed in as RECEPTION on a desktop-width window, on `/dashboard`; at least one overdue pharmacy invoice exists
**Ideal path**: 3 - open Appointments, open Pharmacy, and see a plain statement of what Reception can and cannot do there; the menu and landing should already be built for her role.
**Alternate paths**: Appointments via sidebar "Appointments" (same as the Dashboard button); Pharmacy via sidebar "Pharmacy Desk", "Pharmacy Counter" (two entries, same page with `?section=desk|counter`), or by typing the URL. A pharmacy sale for a RECEPTION user could also be reached by Inventory > Sales > "Counter sales" (Inventory is in her menu) - the code offers it but it is a different workflow.

### Steps
1. Click "View All Appointments" in the Dashboard card "Today's Appointments" (she is in `APPOINTMENT_READ_ROLES`) → `/dashboard/appointments` with Calendar/Slots tabs
2. Click "Pharmacy Desk" in the sidebar (section "Pharmacy") → `/dashboard/pharmacy?section=desk`; because `sells` is false for RECEPTION, the metric strips, "Invoices", "Drugs" and "New sale" are not shown
3. Click "Pharmacy Counter" in the sidebar → `/dashboard/pharmacy?section=counter` (the sidebar highlights this one via `pharmacySection`); the Queue/Active Dispense panels show, with "Walk-in bill" in the empty queue
4. Click the bell "Notifications" → dropdown lists "Upcoming: ..." rows and "Overdue Invoice INV-2411" rows (4 upcoming plus 3 overdue at most)
5. Click "Overdue Invoice INV-2411" → `router.push('/dashboard/pharmacy/sales?pay=CREDIT')`, a Sales page her sidebar has no entry for; the page loads and the API decides what she sees (no frontend route guard exists, only an inline error if the API refuses)
6. (optional) Type `/dashboard/pharmacy/sales` into the address bar → same page; proves that hidden menu items are the only gate

### Variations
- Same walk as NURSE: sidebar has only Dashboard, Patients, Appointments, Visits, Rooms; the Dashboard still shows "Total Users" and "System Status" cards.
- Same walk as ACCOUNTANT (3 menu items): lands on Dashboard with "Today's Appointments" hidden because the role is not in `APPOINTMENT_READ_ROLES`.

### Edge Cases
- Pharmacy Desk and Pharmacy Counter are two menu entries for one route; both are visible to RECEPTION, DOCTOR, PHARMACIST, ADMIN.
- A role asked to do something it cannot: the Dashboard shows "Couldn't load today's appointments" with "Your account does not have access to this yet. Ask an admin to check your role permissions." and "Try again" (a 403) vs a network failure shows "This is not an empty list. Check your connection and try again."
- Same information on several surfaces: overdue invoices appear in the bell, in Dashboard "System Alerts" (card "Overdue Invoices") and on Sales `?pay=CREDIT`.

---

### STORY-075: Receptionist on a phone: sign in, find a patient, sign out  [orig SIGNIN-NAVIGATION-06]

**Type**: medium
**Topic**: Sign-in, role landing, navigation and recovery
**Persona**: Ananya Reddy, standing at the clinic door with her Android phone because the desk PC is busy
**Goal**: Sign in, look up the patient "Lakshmi Prasad" and then sign out
**Preconditions**: RECEPTION account; phone-width viewport (below the `md` breakpoint); logged out
**Ideal path**: 7 - sign-in is 3 (identifier, password, submit); a search box always visible on the phone is 2 (type, open result); sign-out is 2 (open menu, tap Log out). The desktop header's global search and bell are the missing parts.
**Alternate paths**: Patient lookup: global search in the desktop header (not rendered on phone), Patients page search "Search by name, phone, ABHA, or email (min 2 chars)", or the Appointments calendar's "Search patient by name/phone". Navigation: the drawer is the only route on phone. Sign-out: only the sidebar footer (inside the drawer).

### Steps
1. Open `/dashboard` in the phone browser → redirected to `/login?next=%2Fdashboard`; the login card fits (`max-w-md`)
2. Type the email in "Phone or email" (required field) → keyboard opens in email mode (`inputMode="email"`), so typing a phone number needs a keyboard switch
3. Type the password in "Password" (required field) → enabled "Sign in"
4. Tap "Sign in" → Dashboard; top bar (`h-14`) shows a menu button "Open clinic navigation" and the text "ClinicMS"; no search box, bell, gear, "Branded" switch or tour button, because the whole `Header` is `hidden md:block`
5. Tap "Open clinic navigation" → dialog "Clinic navigation" (sr-only title) slides in as a 288 px panel with the same Sidebar
6. Tap "Patients" → drawer closes (`onNavigate`), `/dashboard/patients`
7. Tap the search field "Search by name, phone, ABHA, or email (min 2 chars)" → keyboard opens
8. Type "Lakshmi" (required for results, 2+ chars) → list filters
9. Tap "Open clinic navigation" → drawer
10. Tap "Appointments" → `/dashboard/appointments`, to check whether Lakshmi is booked
11. Tap "Open clinic navigation" → drawer again (no notifications anywhere to check instead)
12. Tap the "Log out" icon in the drawer footer → no confirmation, `/login`
13. (observe) Press Back → redirected to `/login?next=...`

### Variations
- Drawer dismissal: tap outside or the dialog's close control; the menu button state is controlled by `navigationOpen`, so navigating always closes it.
- Landscape or tablet width above `md`: the full sidebar and header return and the drawer disappears.

### Edge Cases
- A phone user cannot reach notifications, global search, "My Settings" (doctor signature, WhatsApp) or the "Branded" switch at all.
- Same information on several surfaces: the drawer duplicates the desktop sidebar exactly (one `Sidebar` component rendered twice, in a hidden desktop wrapper and in the drawer).

---

### STORY-076: Nurse forgets her password and recovers with a reset code  [orig SIGNIN-NAVIGATION-07]

**Type**: medium
**Topic**: Sign-in, role landing, navigation and recovery
**Persona**: Priya Nair, nurse, back from two weeks of leave, has just been handed the one-time code K7MQ-4XWP by the owner in person
**Goal**: Set a new password and be signed in
**Preconditions**: NURSE account; admin has issued a code (valid 24 hours, single use); user is on the login page
**Ideal path**: 5 - click the reset link, type the code, type the new password, submit; the app should then sign her in (it knows who the code belongs to). Confirm-password and re-typing the identifier are both avoidable.
**Alternate paths**: none found for self-service (no email or SMS reset; the only other route is the server operator's issue-reset-code script, not a UI). Reached from the login page link "enter your reset code" or by typing `/reset-password`.

### Steps
1. Open `/login` → "ClinicMS Login"
2. Type "priya.nair@linaeclinic.in" in "Phone or email" (required field)
3. Type her remembered password in "Password" (required field) - wrong
4. Click "Sign in" → red alert "Invalid password" (backend `401`)
5. Retype the password in "Password" (required field) - still wrong
6. Click "Sign in" → "Invalid password" again (attempts 2 of 5 per minute)
7. Click the link "enter your reset code" in the sentence "Forgot password? Ask your clinic admin for a reset code, then enter your reset code." → `/reset-password`, card "Set a new password"
8. Type "K7MQ-4XWP" in "Reset code" (required field; placeholder ABCD-EFGH; help text "The 8-character code your clinic admin gave you. It works once and expires after 24 hours."; dash, spaces and case are ignored by `normalizeResetCode`)
9. Type a new password in "New password" (required field; 8 to 72 characters; help text "At least 8 characters.")
10. Type the same password in "Confirm new password" (required field) → client checks length and match before calling the server
11. Click "Set new password" → button "Saving…", then status text "Password updated. Taking you to sign in…"
12. Wait 2.5 seconds, or click "Back to sign in" → `/login`
13. Type "priya.nair@linaeclinic.in" in "Phone or email" again (required field; the app already knows this, she typed it in step 2)
14. Type the new password in "Password" (required field; a third entry of what she just chose)
15. Click "Sign in" → `/dashboard` for NURSE (menu: Dashboard, Patients, Appointments, Visits, Rooms)

### Variations
- Code mistyped or already used or expired: the same red alert "This reset code is invalid or has expired. Ask an admin for a new one." for every rejection reason (by design, no hints).
- Passwords differ: "The two passwords do not match." (client side, no server call); under 8 characters: "Use 8 to 72 characters."

### Edge Cases
- Failed attempts: login and reset are each limited to 5 per minute; a sixth attempt returns the server's throttling message in the same red alert and she must wait.
- Wrong-identifier messages are not uniform: an unknown identifier shows "Account not found" (reveals whether an account exists), a suspended one "Account suspended", a wrong phone format "Phone number must be between 7 and 15 digits". A staff member typing a 10-digit Indian mobile without the 91 prefix would pass the length check and, if the stored number carries the country code, get "Account not found".
- The reset page has no "Branded" switch and no tour; it reuses `AuthCard`, a separate shell from the login card (login does not use `AuthCard`).

**Merged from**: ADMIN-SETUP-04 ("Receptionist redeems the reset code and signs back in"), a substantially identical journey (same goal, same screens). Its full text is kept below as a variant so no steps are lost.

#### Merged variant: ADMIN-SETUP-04 (Receptionist redeems the reset code and signs back in)
**Type**: short
**Topic**: Admin and setup (reset codes)
**Persona**: Pooja Sharma, RECEPTION, at the login screen with the code Sunita gave her (`K7QM-2XPD`)
**Goal**: Set a new password.
**Preconditions**: Code issued in STORY-065 (ADMIN-SETUP-03) and not expired.
**Ideal path**: 3 (type code, type new password, submit). A confirm-password box is not needed when the field has a show-password toggle.
**Alternate paths**: none found (Users > Edit has no password field; there is no change-password UI in the app, only `POST /users/:id/change-password` on the API).

##### Steps
1. On "ClinicMS Login" click the link "enter your reset code" (sentence "Forgot password? Ask your clinic admin for a reset code, then enter your reset code.") → page "Set a new password" with the Reset code box focused.
2. Type "K7QM-2XPD" in "Reset code" (required field; placeholder `ABCD-EFGH`).
3. Type a new password in "New password" (required field; at least 8 characters).
4. Type the same password in "Confirm new password" (required field; the user re-enters what they just typed).
5. Click "Set new password" → "Password updated. Taking you to sign in…", redirect to login after about 2.5 seconds.

##### Variations
- Click "Back to sign in" instead of waiting.
- Then sign in: "Phone or email" and "Password" and "Sign in" (3 more steps, in another story).

##### Edge Cases
- Wrong or expired code: red message "Could not reset the password. Ask an admin for a new code." (or the server message).
- The button stays disabled until all three fields have content.
- Mismatching passwords: submit stays enabled; error comes back after clicking.

---

### STORY-077: Owner's morning round across alerts, collection, backup, search and staff access  [orig SIGNIN-NAVIGATION-09]

**Type**: long
**Topic**: Sign-in, role landing, navigation and recovery
**Persona**: Dr. Meera Iyer, owner, doing her routine check from the owner's PC before clinic opens
**Goal**: Sign in, act on the stock alerts, check yesterday's collection, take a backup, look up a patient, review staff access for Priya Nair and sign out
**Preconditions**: OWNER account (ADMIN differs only by also seeing Pharmacy Desk and Pharmacy Counter); logged out; low-stock and near-expiry items exist; a patient "Lakshmi Prasad" exists
**Ideal path**: 13 - sign-in 3; bell directly to low-stock list 2; Daily Collection 1; backup 1 (back on Dashboard is 1 more); search 2 (type, Enter); reset code 3; sign out 1. The gear dialog and the second visit to the Dashboard are not part of the goal.
**Alternate paths**: Low stock is reachable from the bell, Dashboard "System Alerts" (summary only, no link), sidebar Inventory (`Today` card "Low stock"), Reports page "Low Stock Alerts", Pharmacy Report "Expiring Stock". Backup: only the Dashboard "Create Backup" (the API also exposes `POST /auth/backup` and a job status route, without UI). Patient lookup: header search, Patients page search. Daily Collection: sidebar "Daily Collection" or Pharmacy Report > Daily Collection (same workspace).

### Steps
1. Open the clinic address → redirected to `/login?next=%2Fdashboard`
2. Type "meera.iyer@linaeclinic.in" in "Phone or email" (required field)
3. Type the password in "Password" (required field)
4. Click "Sign in" → `/dashboard`; Dashboard sidebar for OWNER: Dashboard, Daily Collection; Patients, Appointments, Visits, Procedures, Rooms; Sales, Inventory, Pharmacy Report; Reports, Users, Fee list, Test Transcribe (14 entries; no Pharmacy Desk or Pharmacy Counter)
5. Click the bell "Notifications" (badge "5" in red because one item is destructive) → owner summary rows: "6 low-stock items - Restock inventory", "2 near-expiry items - Check expirations", "3 overdue invoices - Billing attention needed", "4 upcoming appointments - Within 48 hours"
6. Click "6 low-stock items" → `router.push('/dashboard/inventory?tab=low-stock')`; Inventory workspace ignores `tab` (it reads `area` and `view`) and opens its Today screen, so she must find "Low stock" among the cards in "What needs attention" herself
7. Click "Daily Collection" in the sidebar (section "Overview") → `/dashboard/pharmacy/reports?report=daily-collection`; one day's clinic and pharmacy takings by payment mode with a cash count
8. Click "Dashboard" in the sidebar → `/dashboard`, stat and alert cards reload with skeleton "Loading dashboard…"
9. Click "Create Backup" in the card "Admin Controls" (section "Database Backup"; no confirmation dialog guards a whole-database dump) → button "Creating..."
10. Click "OK" on the browser alert "Database backup created successfully! Timestamp ... Location ... Size ... Backup saved to local server directory." → alert dismissed (failure shows a different alert "Backup Failed")
11. Click the header search box "Search patients, appointments, doctors..." → focus; results stay hidden until 2+ characters
12. Type "Lakshmi" (optional text, 2+ characters needed; 300 ms debounce) → dropdown with Patient, Appointment and Staff results
13. Click the first Patient result "Lakshmi Prasad" → `/dashboard/patients?search=<patient id>`; the Patients list search is seeded with the internal id rather than her name
14. Click "Open settings" (gear) → dialog "My Settings"; for an owner it contains no fields at all, only the buttons "Close" and "Save"
15. Click "Close" → back to the patients list
16. Click "Users" in the sidebar → "Users Management", table "All Users"
17. Click "Reset password" on Priya Nair's row → dialog "Reset password for Priya Nair"
18. Click "I have confirmed who is asking. Create code" (guards the account: anyone with the code can set the password) → code "K7MQ-4XWP" shown once
19. Click "Copy code" (optional) → copied
20. Close the dialog → confirm step restored; code gone
21. Click the "Log out" icon in the sidebar footer → `/login`, no confirmation

### Variations
- Instead of step 5-6, click "View reports & alerts" at the bottom of the bell: goes to `/dashboard/reports` ("Reports & Analytics").
- ADMIN signs in: the same walk plus "Pharmacy Desk" and "Pharmacy Counter" in the menu.
- The owner types `/dashboard/pharmacy?section=desk` directly: Pharmacy Desk is hidden from OWNER's menu but the route is not guarded in the frontend.

### Edge Cases
- Backup: only OWNER and ADMIN can create one; a DOCTOR who tried the API directly would get 403 "Insufficient permissions. Admin access required." (a deliberate exception to doctors passing every role check).
- Alerts load failure: Dashboard card "System Alerts" shows "Couldn't load clinic alerts" with "Try again"; the bell silently shows "No notifications" on any error, so a failure looks like an all-clear.
- Same information on several surfaces: low-stock and expiry counts appear in the bell, Dashboard "System Alerts" (Low Stock Alert, Expiring Items), Inventory Today, Reports "Low Stock Alerts" and Pharmacy Report "Expiring Stock"; overdue invoices appear in the bell, "System Alerts" and Sales `?pay=CREDIT`; "Daily Collection" and "Pharmacy Report" in the sidebar open the same workspace.
- "Test Transcribe" (a developer test page) is in the owner's production menu next to Fee list.

---

## Redundancy Candidates

Built from the discovery document's "Redundancy leads" (every lead is kept), the stories' Alternate paths fields and their multi-surface notes. Marks: "same result" means the stories say the routes end in the same state; "divergent" means a story reports a difference in outcome, effort or data; "not settled" means no story says. This section is the primary input for `/ux-flow`.

### Duplicate paths (same goal, multiple routes)
- Book an appointment: Calendar tab (click a free time) STORY-001, Slots tab (AppointmentScheduler, same dialog, same steps), patient detail "Book appointment" with `?patientId=` STORY-007, progress tracker "Book" STORY-039, and Create Patient with Patient Type "Walk-in" STORY-005 — same result for the first four (same booking dialog); divergent for the walk-in route (books only the next free Confirmed slot, cannot pick a time or the Scheduled calendar, only for a new patient)
- Register a new patient in-line: "Add New Patient" quick dialog on Appointments STORY-004 and "Create Patient" on the Patients page STORY-037 — divergent (different field sets and validation; Create Patient can also auto-book)
- Find a patient: header global search STORY-007, Patients list search STORY-036, Appointments patient picker, Visits setup "Select Patient" — divergent for the header route (its patient result links to `/dashboard/patients?search=<internal id>` and lands on "No patients found" STORY-036); same result for the rest
- Move a patient to the Confirmed calendar: "Confirm" inside Appointment Details STORY-002 and "RESCHED" then a free Confirmed tile STORY-006 — divergent (the second may change the time and date)
- Reschedule: hover button "RESCHED", Appointment Details > "Reschedule", or cancel the old booking then book again STORY-006 — same result for the first two; divergent for cancel-and-rebook (loses the token number and the bill chip)
- Start a visit (about eight routes): calendar row "START", Appointment Details > "Start Visit" STORY-009, Patients list "Start Visit", patient detail "Start visit" and "Resume last visit", progress tracker, Visits setup "Start Visit Documentation", header bell STORY-072, dashboard "Recent Visits" and "My Patients" STORY-017 — divergent (the Patients-list route carries no appointmentId, so the visit is not linked to the appointment and the doctor falls back to the first in the list; the calendar routes link the appointment and set it IN_PROGRESS); the others reach the same visit form
- Record vitals: Vitals tab, Overview "Record Vitals" (only switches to the tab), Prescription tab "Clinical Details & Vitals" STORY-010 — same result (synced both ways), but the Prescription-tab copy does not mark the vitals section complete
- Save a prescription: "Create Prescription" STORY-011, "Save Prescription" inside Print Preview STORY-012, auto-save before Download PDF, Email and WhatsApp STORY-016, and footer "Save Draft" — same result for the first three; divergent for Save Draft (saves clinical fields, not the prescription items)
- Attach photos: visit Photos tab or Quick Actions "Capture Photos" STORY-014 and patient detail "Uploads" tab STORY-041 — divergent (Uploads saves unattached patient uploads dated by day, not photos on a visit; only the visit route allows deletion)
- Send a prescription: "PDF via WhatsApp", "Email", "Download PDF" STORY-016 — divergent by channel (Email needs a saved prescription and a patient email); the patient-row "WhatsApp" action is unrelated
- Bill a prescription at the pharmacy: Counter Queue then header "Bill" / Active Dispense "Open bill" / Pick + Pay "Collect payment", Prescription Queue "Bill", Sales > "New sale" then "Load", builder "Go to Pharmacy" STORY-011, progress tracker "Bill", Desk "New sale", legacy `?section=billing` STORY-018 STORY-025 — same result (all land on the same bill page); the Counter review steps are optional and the bill does not read the Counter review state STORY-025
- Sell without a prescription: Sales "New sale" (patient required) STORY-019, Counter "Walk-in bill" or "Start billing", and Inventory > Sales > "Counter sales" (customer optional, batch picking, CREDIT as a payment method) — divergent for Counter sales (a different workflow that still appears in the Sales register as source "Counter sales"); same result for the Counter and Desk buttons
- Customer return: Sales tab "Returns" > "New return" STORY-024 and Inventory > Sales > "Customer returns" > "Post return" — same result (same editor, same document); the finished bill page has no Return action
- Reprint a pharmacy bill: register row printer icon, open the bill then "Print", Desk > Invoices > "View Invoice" or "Download Invoice", Inventory > Sales > "Patient invoice history" STORY-020 STORY-026 — same result for printing; divergent for the copy marking (register reprints are not marked "Duplicate", unlike the sale-time "Copy Type")
- Download a past invoice PDF: Desk > Invoices > "Download Invoice", Inventory > Sales > "Patient invoice history", register Print then "Save as PDF", sale-time preview, Pharmacy Report "Sales Bills" / "Sales Register" STORY-026 — same result for the first three; divergent for the report (an aggregate report, not one invoice)
- Discard a draft bill: register "Discard draft" STORY-021 and Desk > Invoices trash icon "Delete Invoice" — same result, different confirmation (app dialog versus browser `confirm()` and `alert()`)
- Continue a draft: register row STORY-022, Desk > Invoices "Continue in Sales", URL `?draft=<id>` — same result; the Counter and Desk do not list drafts
- Edit a bill discount after printing: register row percent icon, open bill > "Edit discount", deep link `?bill=<id>&edit=discount` STORY-023 — same result
- Take payment or mark paid: clinic bill dialog "Record payment" STORY-028, Counter "Paid" status STORY-025, Sales bill "Payment Method" at "Confirm & Print", purchase "Mark paid" STORY-055, Payments & dues bulk allocation, credit "Set off" — divergent (Counter "Paid" and "Ready" are manual toggles unrelated to the invoice STORY-025; Mark paid pays one bill, bulk allocation spreads one payment over several; Set off settles with credit instead of money STORY-055)
- Create a clinic bill: click the bill chip on the row, or row click > Appointment Details > "Create bill" STORY-027 STORY-028 STORY-029 — same result (the second adds two steps); the Slots tab has no billing at all
- Reach the Fee list: sidebar "Fee list" STORY-034 and the "Set fees" link in the bill dialog (only when no fee is set, OWNER/ADMIN only) — same result (same page, one editor)
- Charge a concession: overtype "Fee" on a clinic bill STORY-030 versus "Edit discount" with a reason on a pharmacy bill STORY-023 — divergent (the clinic bill keeps no reason and no trace)
- Return stock to a supplier: Purchase bills tab "Returns" > "New return" STORY-058, Stock area link "Supplier returns are now in Purchase bills > Returns", empty-state "New return", Stock optimization "onReturns", Credits & vouchers "New" — same result (the last differs only in which document is created first)
- Record a supplier credit note: from the return document "Record credit note", Returns row, Credits & vouchers "Post supplier credit", Today card "Credit notes awaited" STORY-059 — same result
- Add a stock item: "Add Inventory Item" (non-approvers send for doctor approval) STORY-051, Drug Database "add drug", builder "+ Add to Drug Database", "Manual opening stock", "Opening stock import", purchase intake with an unknown product STORY-057 — divergent (two catalogues, Drug and InventoryItem; opening stock creates a batch with a quantity but no supplier payable)
- Approve price/stock edits and new items: Today row, sidebar badge, task "Approve corrections", Stock list banner "Open approval queue", legacy `/dashboard/inventory-updates` STORY-050 — same result (four ways into one two-tab screen); divergent for stock-count approvals, which live in a different queue STORY-050 STORY-053
- Check low stock: Today row "Low stock", Today button "Check low stock" (same screen, same result), Stock > "Stock level" > "Low stock" (+3 steps), header bell STORY-045 — same result
- Check availability and expiry: Today "Find or correct stock", Inventory area "Stock" > Stock list, Stock ledger search, inventory counter-sales batch picker, pharmacy bill "Search Drugs" STORY-046 — divergent for the ledger (shows movements, not current availability)
- Count stock: Today row "Stock count due today", Stock counts > "My counts", Stock list "Count matching batches", item page "Count this batch", "Count an item or a shelf" STORY-047 STORY-053 — same result (the same count sheet); approval via Today row or the Stock counts "Approvals" tab is the same record STORY-053
- Reduce a quantity: "Loss & breakage" document STORY-048, "Edit stock" proposal, a customer-return line "Record as loss", a fresh approved stock count STORY-053, correcting the wrong movement STORY-052 — divergent (Edit stock needs a doctor's approval, keeps no loss reason code and does not keep the movement link; only the Loss document records a reason)
- Correct a wrongly keyed movement: item page tab "Sales" > "Correct" versus the Stock ledger (same movements, no Correct action) versus an "Edit stock" proposal STORY-052 — divergent (the proposal sets an absolute quantity and drops the movement link)
- Propose a price: Stock list row then "Edit price", item page "Edit price" STORY-049; "Edit item" excludes price on purpose — same result for the first two
- Start a purchase bill: Today "Scan or enter bill", Purchases task of the same name, Purchase bills "New purchase", empty-state buttons; "Import CSV" and "Gmail intake" feed the same workbench draft STORY-054 — same result
- Receive stock: "Scan or enter bill" STORY-054 STORY-057, "Import CSV", "Gmail intake", "Inward challans" and "Receive remaining stock" on a purchase order STORY-061, "Manual opening stock" — divergent (a challan receives against an order and a later bill must not double stock; opening stock has no supplier payable)
- Find a distributor's bills and what is owed: filter, search with field "Distributor", Suppliers row "Bills", Payments & dues, Purchase costs STORY-056 — same result for the first three; divergent for Purchase costs (analytics)
- Pay supplier bills: "Mark paid" on a row, Payments & dues "Bulk Payment Allocation", register footer "Outstanding..." link, "Set off" STORY-055 — divergent (see the take-payment lead)
- Add a supplier: Suppliers > "Add supplier" STORY-062, workbench "Save verified supplier" (name and GSTIN only), Terms of Trade for terms — divergent (supplier data lives in two places; a free-text "Payment terms" field and structured Terms of Trade)
- Turn a shortage into an order: Shortbook request to approved purchase order STORY-060, "Add purchase order" by hand, "Automation settings" "Automatic PO drafts", "Add manual request" — same result (a purchase order draft)
- Reorder targets: Stock optimization, Target proposals STORY-061, Manual targets & exclusions, Automation settings run, Monitor, legacy `/dashboard/stock-predictions`, and the unrendered StockPredictionDashboard — not settled by the stories (PO-08 lists four routes to the same targets topic and walks only Target proposals)
- Reports for the same numbers: Daily Collection via the sidebar, via Pharmacy Report, Reports page "Payment Analytics" / "Revenue Report" STORY-032 — same result for the first two (one workspace); divergent for the Reports page (+4 steps, a different layout, "Payment Mode Breakdown" from billing payments, shown twice)
- Record the cash count: Daily Collection report only STORY-033 — no alternate; the count covers the pharmacy drawer only and clinic cash is never counted
- Edit doctor hours, overbooking, leave: header "My Settings" (doctor) and Users > "Working Hours" (admin) STORY-064 STORY-067 — same result (one component, one data set)
- Block time: leave in My Settings or Working Hours versus a clinic-wide closure in Users > "Clinic Holidays" STORY-064 STORY-069 — divergent (one doctor versus every doctor; no warning about existing appointments on that day)
- Doctor WhatsApp: Users > "WhatsApp Settings" and header "My Settings" STORY-067 STORY-069 — divergent (the admin copy adds Phone Number ID, Access Token and the template editor)
- Record a procedure: appointment type "Procedure" with a Procedure Name STORY-001, builder "Procedures" section, Procedures page "New Procedure" (creates a Visit) STORY-063 — divergent (booking stores no machine data; none of the three bills the patient)
- Open the pharmacy: sidebar "Pharmacy Desk" and "Pharmacy Counter" (same page, `?section=desk|counter`), the typed URL STORY-074 — same result
- Remember where I was after a lapse: middleware redirect with `next=`, `apiClient` 401 handling writing `cms_next_after_login`, `DashboardLayout` redirecting to plain `/login` STORY-071 — divergent (the localStorage value is never read; one path drops `next`)
- Retire a room: Deactivate switch or Delete with a browser `confirm()` STORY-068 — divergent (deactivate is reversible, delete is not)
- Change a role: "Create User" role select STORY-066 and later "Role & Permissions" > "Apply Role" — same result (role is set in two places)
- Branded mode: switch on the login page and in the dashboard header STORY-075 (absent on a phone) — same result
- Fix a patient record: Edit Patient from "More" STORY-039, Archive and re-create STORY-043, merge (backend job only, no UI) — divergent
- Read the last visit: patient detail History tab, dashboard "Recent Visits" (opens the editable visit form, not a read-only summary), visit form History tab, Visits setup "Patient History" STORY-038 STORY-040 — divergent for Recent Visits and "My Patients" (My Patients opens patient detail, Recent Visits opens the visit)
- Log out or switch role: sidebar footer "Log out" only STORY-073 — no alternate; one person using owner-only and receptionist-only screens must log out and back in STORY-035

### Duplicate information (same fact, multiple surfaces)
- Patient identity (name, phone, age, sex): search box, "Selected:" badge, dialog header block and success banner STORY-001; appointment row and Appointment Details STORY-002 STORY-009; VisitIdentityBar and prescription preview header STORY-012; list row, detail header, Info tab, booking dialog and visit header STORY-039; pharmacy bill header
- Visit history (date, doctor, diagnosis, medicines): detail tab "History", visit form tab "History", Visits setup "Patient History", dashboard "Recent Visits", progress tracker STORY-038 STORY-040; last visit date also in the detail header card and the dashboard row
- Appointment status and slot: row badge, Appointment Details, bell, dashboard "Today's Appointments", calendar Confirmed column, detail "Next appointment" cell STORY-039 STORY-072; the old and new date after a move on four surfaces (banner, Date field, toast, row) STORY-006
- Scheduled/Confirmed explanation: column headers, "Legend" card, "Quick Guide" dialog, ReceptionistTour STORY-001 STORY-008
- Bill state of a clinic appointment: row chip, Appointment Details "Bill", "Bill for <patient>" dialog, tracker "Invoices" STORY-027; the fee also appears on the Fee list status line, the row chip and the dialog STORY-034
- Pharmacy bill and prescription facts: Counter Queue panel, Active Dispense table, Prescription Queue table, the second queue copy on the bill page, Invoice Items and "Linked Prescription" box (stock status on all of them) STORY-018; invoice number, patient, total and payment method in the Sales register, Desk Invoices list, bill page and Pharmacy Report STORY-026
- Low-stock, expiry and overdue counts: dashboard "System Alerts", header bell, Inventory Today, Reports "Low Stock Alerts", Pharmacy Desk strip, Pharmacy Report "Expiring Stock", Sales `?pay=CREDIT` STORY-045 STORY-074 STORY-077
- Stock available and expiry: Stock list row, item page Batches table, every inventory document batch picker, pharmacy billing search STORY-046
- Stock movements: loss document, item "Ledger" tab, Stock ledger, Today "Recent activity" STORY-048; ledger, item Ledger and Sales tabs, Corrections register STORY-052; count differences in sheet footer, sign-off dialog, locked record, approval dialog, History tab, ledger, item Ledger, Today cards STORY-053
- Selling price: Stock list row, "Edit price" dialog, approval queue card, pharmacy billing STORY-049
- Pending approvals: sidebar badge, task label "Approve corrections (n)", "New items" tab badge (price/stock edits counted only in the Today row) STORY-050
- Add-item fields: "Add Inventory Item" dialog, item page "Item details", approval card STORY-051; Today button "Find or correct stock" versus dialog title STORY-051
- Supplier name and GSTIN: Suppliers list, every supplier select, register Distributor column, workbench "Saved supplier" select STORY-062; Distributor and GSTIN shown twice inside the workbench, "Received on" and "Goods Received" holding the same date STORY-054
- Supplier outstanding amount: row Payment badge, register footer, distributor position strip, Payments & dues summary, Suppliers task, Purchase costs STORY-055 STORY-056
- Supplier credit and return: Returns row, Stock ledger, Today "Credit notes awaited" STORY-058; Returns row Status, Credits & vouchers, distributor strip, "Mark paid" dialog STORY-059
- Order progress: Shortbook row, document editor, order delivery table, Monitor STORY-060; proposal, Shortbook, order table, challan, bill, ledger and Today "Orders awaiting receipt" STORY-061
- Line fields of a purchase bill: product name, pack, MRP and rate in the line card, "Product matching and details" and "Receipt quantity and margin summary" STORY-057
- Doctor facts: name and role in the Users table, Procedures doctor dropdown, Appointments Doctor filter, prescription print header; weekly hours in Users > Working Hours and My Settings; WhatsApp state in Users > WhatsApp Settings and My Settings STORY-069
- Reset-code instructions: reset dialog, login page and reset page help text in different words STORY-076 STORY-065; the expiry is shown on the dialog and the reset page
- Fee amounts: Fee list, row chip ("₹500 due"), Appointment Details, "Bill for <patient>" dialog STORY-034
- Menu and navigation: the phone drawer renders the same Sidebar component as the desktop wrapper STORY-075; "Daily Collection" and "Pharmacy Report" in the sidebar open the same workspace STORY-077
- Signed-in identity: shown only in the sidebar footer STORY-073; role-specific menus differ per role STORY-074
- Quick Guide and tour text repeating on-page instructions, with stale wording (Patients guide says "Add Patient" while the button is "New Patient"; Users guide lists "Therapist")

### Overlapping features/tools
- Add Inventory Item and Drug Database "add drug" and builder "Add to Drug Database": two catalogues (Drug and InventoryItem) for one real-world item STORY-051 STORY-057 — not distinct enough; a prescription drug and a stocked batch are separate records the user must keep aligned
- Sales "New sale" (patient required, bill page) and Inventory > Sales > "Counter sales" (batch picking, optional customer, CREDIT method): both sell an item to a walk-in STORY-019 — distinct only in the stock-picking depth; Counter sales are corrected in Inventory while Sales bills are corrected with Edit discount STORY-023
- Pharmacy Invoices page, Sales register, Inventory "Patient invoice history" and Pharmacy Report "Sales Register": all list pharmacy invoices; Pharmacy Invoices is the same component as Patient invoice history, with older styling and browser `alert()`/`confirm()` boxes STORY-026 — not distinct enough to keep both the page and the register
- Daily Collection (sidebar) and Pharmacy Report > Daily Collection: one workspace, two sidebar entries STORY-032 STORY-077 — keep one
- Reports page "Payment Mode Breakdown" (Revenue Report and Payment Analytics, shown twice) and Daily Collection: collection by payment mode STORY-032 — Daily Collection adds the saved cash count; the Reports page version adds a date range and export
- Header Notifications bell, dashboard "System Alerts", Inventory Today, Reports "Low Stock Alerts": all surface the same alerts; the bell also lists upcoming patients STORY-072 STORY-077 — the bell and System Alerts overlap most; System Alerts has no links
- Stock optimization, Target proposals, Manual targets & exclusions, Automation settings and Monitor: five surfaces on reorder targets STORY-061 — Target proposals is the working screen; the rest need a story before they can be judged
- Purchase returns, Credits & vouchers and the "Credit notes" task: one return-then-credit journey with three entry points STORY-058 STORY-059 — distinct documents (return versus credit), but the entry points can be merged
- Edit stock proposal, Loss & breakage, stock count, Corrections: four ways to change a quantity, each with its own approval or reason rule STORY-048 STORY-052 STORY-053 — distinct in audit trail, overlapping in effect
- Terms of Trade and the supplier directory "Payment terms" free-text field STORY-062 — structured versus free text for the same fact; not distinct
- Appointment type "Procedure", builder "Procedures" section and the Procedures page: three places for a procedure STORY-063 — distinct data (slot, prescription text, machine log) but none bills the patient STORY-029
- Visit photos (Photos tab) and patient "Uploads" tab: both store before/after images STORY-041 — divergent storage (attached to a visit versus unattached); confusing to keep both
- Create User role select and "Role & Permissions" > "Apply Role": both set a role STORY-066 — distinct (the second edits individual permissions)
- My Settings and Users > Working Hours / WhatsApp Settings: the same availability component rendered in two places STORY-064 STORY-067 — keep both for role reasons (doctor self-service versus admin)
- Rooms Calendar View, Appointments Room filter and booking-dialog room cards: three views of room occupancy STORY-068 STORY-001 — distinct jobs (plan, filter, choose), same data
- Bell "upcoming patients", dashboard "Today's Appointments", Appointments calendar: three lists of today's patients STORY-072 STORY-074 — the dashboard card rows are not clickable and only "View All Appointments" works
- Clinic bill "Fee" overtype and pharmacy "Edit discount": both are ways to charge less STORY-030 STORY-023 — not equal (the clinic bill has no reason or trace)
- Pharmacy Desk and Pharmacy Counter: two sidebar entries for one page STORY-074 — keep one entry, two sections
- Quick Guide dialogs, tours (ReceptionistTour, DoctorTour) and on-page legends: three ways to explain the same screen STORY-001 STORY-008 — not distinct
- Test Transcribe page: a developer test page in the production sidebar for OWNER, ADMIN and DOCTOR STORY-077 — not a clinic feature; remove from navigation
- Row buttons per user on the Users table (Edit, Delete, Reset password, Role & Permissions, plus Working Hours and WhatsApp Settings for doctors): nine to eleven controls repeated per row STORY-065 — overlapping rarely used controls on one row
- Quick patient creation twice ("Add New Patient" and "Create Patient") STORY-004 STORY-037 — different field sets for the same record; keep one form

Counts: 53 duplicate-path candidates, 23 duplicate-information candidates, 22 overlapping-feature candidates (98 in total).

## Gaps & Recommendations

Features and flows not covered by any story:
- Reports and analytics (discovery topic 8): Reports & Analytics page with its six reports and export select, Pharmacy Report menu (GST, margin, expiring stock). Suggested stories: owner generates Revenue Report and exports to CSV; accountant opens GSTR-1 from Pharmacy Report; pharmacist checks Expiring Stock.
- Appointments: Slots tab, calendar filters (Visit Type, Room, Grid), Google Calendar sync, Move to Scheduled. Suggested: book from the Slots tab; filter the calendar to a room; connect Google Calendar.
- Visits: Visits setup screen, prescription templates and Undo/Redo, voice dictation, Customization tab, Interaction Summary, Add Drug to Database from the builder. Suggested: a doctor builds a prescription from a template and checks interactions; dictates a complaint; adds a missing drug.
- Patients: PatientProgressTracker, patient-row WhatsApp action, unlink portal.
- Pharmacy Desk: AI assistant, Partner daily sync, Treatment Packages, Drug Database page. Suggested: record a partner pharmacy's daily sales; create and sell a package.
- Inventory: Blocked stock, Manual opening stock and Opening stock import, Stock optimization, Inventory Sales area (Counter sales, Quotations, Customer returns), Import CSV and Gmail intake, Terms of Trade, Gate passes, Purchase costs, Manual targets, Automation settings, Monitor.
- Admin: Users edit/delete, Role & Permissions, WhatsApp template editor, Procedures Analytics (placeholder).
- Shell: Branded switch, Quick Guide dialogs and tours, dashboard stat cards, Test Transcribe.

Known risks seen by the stories that deserve a regression story: header search patient link lands on "No patients found" (STORY-036); Patients-list "Start Visit" leaves the visit unlinked (STORY-009); MANAGER sees Users buttons that fail (STORY-065); no duplicate-phone check on registration (STORY-004, STORY-039); no confirmation before Create Backup (STORY-077); Fee list hint says the Procedure fee is flat although procedures differ (STORY-034).

Suggested cross-topic stories to add: a patient's whole day from phone booking through pharmacy bill and daily collection check; a stock-in to stock-out journey (scan bill, find stock, sell it at the counter, count it); an admin change that must show on the desk (leave blocks booking).

## Core journeys (daily frequency)

The 12 stories a small clinic (one to three doctors, one reception desk, one pharmacy counter) runs most often per day, ranked by how many times a day they happen. "Actual steps" is the numbered step count of the story; "Ideal" is the story's Ideal path count.

| Rank | Story | Title | Actual steps | Ideal |
|------|-------|-------|--------------|-------|
| 1 | STORY-001 | Book a returning patient into today's Confirmed calendar | 4 | 3 |
| 2 | STORY-002 | Confirm a patient after the call | 2 | 1 |
| 3 | STORY-009 | Open the next confirmed patient from the calendar | 4 | 1 |
| 4 | STORY-011 | Write a two-medicine acne prescription | 15 | 6 |
| 5 | STORY-027 | Bill a first consultation and take it in cash | 3 | 2 |
| 6 | STORY-018 | Bill a waiting prescription from the Counter queue and print it | 11 | 4 |
| 7 | STORY-005 | Register a walk-in patient and book the next free slot | 9 | 4 |
| 8 | STORY-012 | Preview and print the prescription | 7 | 2 |
| 9 | STORY-010 | Record vitals before the consultation | 5 | 3 |
| 10 | STORY-036 | Receptionist finds a returning patient by phone number | 4 | 3 |
| 11 | STORY-019 | Walk-in sale of one over-the-counter item | 13 | 4 |
| 12 | STORY-070 | Receptionist signs in at the start of the day | 4 | 3 |

Why these twelve: booking, confirming and opening the patient happen once per patient, the prescription, its print, vitals and the clinic bill happen once per consulted patient, the pharmacy sales (prescription bill and over-the-counter sale) happen once per dispensed patient, a registration happens per walk-in, a patient lookup precedes most of them, and every staff member signs in once per day. Stories such as owner takings, drawer count, counts and reorder run once a day or once a week and are not in this list.

