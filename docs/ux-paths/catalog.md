# UX Path Catalog: ClinicMS

Generated: 2026-11-13
Total Stories: 114
Coverage: 19 / 20 (95%)

Stories were written from a read of the code, not from a browser walk. Labels marked
"(unverified)" or "(inferred)" in a story still need confirming when it is walked.
Per-topic files with the same stories live in `topics/`; the app map is `discovery.md`.

## Summary

| Type | Count |
|------|-------|
| Short | 35 |
| Medium | 64 |
| Long | 15 |

### Story index

| Story | Type | Topic | Steps (written / ideal) | Title |
|-------|------|-------|-------------------------|-------|
| STORY-001 | short | auth-shell-dashboard | 5 / 3 | Receptionist signs in with her phone number at the start of the shift |
| STORY-002 | medium | auth-shell-dashboard | 15 / 8 | Locked-out nurse gets a one-time reset code from the admin and sets a new password |
| STORY-003 | short | auth-shell-dashboard | 4 / 3 | Accountant returns after a week away and is sent back to the report she bookmarked |
| STORY-004 | medium | auth-shell-dashboard | 8 / 3 | Receptionist uses the header search to pull up a caller's record |
| STORY-005 | short | auth-shell-dashboard | 4 / 2 | Pharmacist follows a low-stock notification from the bell |
| STORY-006 | medium | auth-shell-dashboard | 14 / 9 | Doctor sets up her signature, Saturday hours, conference leave and WhatsApp confirmations in "My Settings" |
| STORY-007 | long | auth-shell-dashboard | 30 / 6 | New receptionist's first morning — sign in, look around, take every guided tour, sign out |
| STORY-008 | short | auth-shell-dashboard | 4 / 2 | Owner takes a database backup before the weekend |
| STORY-009 | medium | auth-shell-dashboard | 10 / 4 | Doctor starts the day from the dashboard — reopen yesterday's visit, look up one of her patients, check today's list |
| STORY-010 | medium | auth-shell-dashboard | 9 / 5 | Nurse on her phone finds a patient list and signs out — without the header |
| STORY-011 | medium | patients | 12 / 6 | Register a new patient from the Patients page |
| STORY-012 | medium | patients | 13 / 7 | Register a walk-in and let the system book the next free slot |
| STORY-013 | short | patients | 3 / 2 | Find a returning patient by phone and open the record |
| STORY-014 | short | patients | 5 / 2 | Use the header global search to reach a patient |
| STORY-015 | medium | patients | 9 / 4 | Correct a patient's phone number and primary doctor |
| STORY-016 | short | patients | 4 / 3 | Archive the wrong record and undo it |
| STORY-017 | long | patients | 27 / 8 | Doctor reviews a patient's full record before today's consultation |
| STORY-018 | medium | patients | 14 / 4 | Follow the progress tracker's next-step buttons from booking to billing |
| STORY-019 | medium | patients | 11 / 2 | Discover and deal with a duplicate patient |
| STORY-020 | short | patients | 4 / 3 | Export last month's patients to CSV |
| STORY-021 | medium | appointments-rooms | 8 / 5 | Book a review visit for an existing patient who phones in |
| STORY-022 | medium | appointments-rooms | 9 / 5 | Register and book a brand-new walk-in from the calendar |
| STORY-023 | medium | appointments-rooms | 7 / 4 | Morning confirmation calls — confirm one patient, cancel another |
| STORY-024 | medium | appointments-rooms | 5 / 4 | Move an appointment to another day |
| STORY-025 | short | appointments-rooms | 4 / 3 | Squeeze an urgent patient into an occupied slot (overbooking) |
| STORY-026 | medium | appointments-rooms | 12 / 7 | Book a procedure with a room from the Slots tab, then check it with the filters |
| STORY-027 | short | appointments-rooms | 3 / 2 | Doctor starts the consultation from the appointment |
| STORY-028 | medium | appointments-rooms | 12 / 6 | Check room load, add a new room and take one out of service |
| STORY-029 | medium | appointments-rooms | 11 / 9 | Doctor sets weekly hours, leave, a blocked hour and an overbooking limit |
| STORY-030 | short | appointments-rooms | 4 / 3 | Connect Google Calendar so bookings sync |
| STORY-031 | long | appointments-rooms | 36 / 21 | Monday morning at the front desk, end to end |
| STORY-032 | short | clinic-billing-fees | 3 / 2 | Collect a first-consultation fee in cash from the calendar row |
| STORY-033 | medium | clinic-billing-fees | 11 / 7 | Procedure bill with part payment by UPI now and the balance by card later |
| STORY-034 | medium | clinic-billing-fees | 8 / 5 | Charge less than the fee list, change her mind, and record a bank transfer with its UTR |
| STORY-035 | medium | clinic-billing-fees | 9 / 5 | Add a second bill to the same appointment for an add-on procedure |
| STORY-036 | short | clinic-billing-fees | 5 / 4 | Set and maintain the clinic fee list |
| STORY-037 | medium | clinic-billing-fees | 8 / 4 | A wrong bill, a refund and a receipt — the three things the desk cannot do |
| STORY-038 | medium | clinic-billing-fees | 8 / 2 | End-of-day check of consultation takings in Daily Collection |
| STORY-039 | short | clinic-billing-fees | 5 / 2 | Looking for the consultation bill and landing in the pharmacy bill ("two billing systems") |
| STORY-040 | long | clinic-billing-fees | 37 / 21 | A Saturday at the front desk — fee list, four bills, a balance, and the day's close |
| STORY-041 | short | visits-procedures | 4 / 2 | Doctor opens a visit from today's appointment |
| STORY-042 | medium | visits-procedures | 6 / 3 | Doctor starts a visit for a walk-in from the Visits page |
| STORY-043 | short | visits-procedures | 5 / 1 | Second doctor starts a visit from the Patients list and finds it under the wrong doctor |
| STORY-044 | medium | visits-procedures | 15 / 7 | Nurse records vitals and a photo before the doctor sees the patient |
| STORY-045 | long | visits-procedures | 32 / 14 | Doctor documents a full acne consultation from appointment to `Complete Visit` |
| STORY-046 | medium | visits-procedures | 12 / 6 | Doctor photographs a melasma follow-up on a tablet, compares with last visit and retakes a blurred shot |
| STORY-047 | medium | visits-procedures | 8 / 3 | Doctor enters lab results from a report photo and compares with the last visit |
| STORY-048 | medium | visits-procedures | 8 / 3 | Doctor runs a tele-video consultation and records consent |
| STORY-049 | medium | visits-procedures | 8 / 1 | Autosave stops after the same visit is edited in a second tab; doctor discards and reloads |
| STORY-050 | short | visits-procedures | 4 / 2 | Doctor checks what happened at the previous visit while documenting today's |
| STORY-051 | medium | visits-procedures | 17 / 9 | Doctor records a laser hair reduction session on the Procedures page |
| STORY-052 | short | prescriptions | 5 / 2 | Add one medicine by search and take the usual regimen |
| STORY-053 | short | prescriptions | 5 / 2 | Repeat the last visit's medicines for a follow-up |
| STORY-054 | short | prescriptions | 4 / 2 | Dictate the chief complaint instead of typing |
| STORY-055 | short | prescriptions | 3 / 1 | Send the finished prescription to the pharmacy bill |
| STORY-056 | medium | prescriptions | 13 / 5 | Start from a template, adjust it, and save it as her own |
| STORY-057 | medium | prescriptions | 9 / 3 | Let the diagnosis prefill the treatment, then take control back |
| STORY-058 | medium | prescriptions | 9 / 3 | Print the prescription in Telugu for a patient who does not read English |
| STORY-059 | medium | prescriptions | 11 / 3 | Fit the prescription on one pre-printed letterhead page, signed |
| STORY-060 | medium | prescriptions | 10 / 4 | One-time set-up of signature and letterhead |
| STORY-061 | medium | prescriptions | 10 / 3 | Share the prescription by WhatsApp, e-mail and PDF |
| STORY-062 | long | prescriptions | 32 / 14 | New acne patient — complete prescription from blank page to pharmacy bill |
| STORY-063 | short | pharmacy-desk-counter | 5 / 2 | Start-of-shift look at the Pharmacy Desk and a jump to the low-stock list |
| STORY-064 | long | pharmacy-desk-counter | 18 / 6 | Dispense a doctor's prescription from the Counter cockpit, start to finish |
| STORY-065 | medium | pharmacy-desk-counter | 13 / 7 | One medicine out of stock, one not stocked at all — substitute, mark unavailable, bill the rest |
| STORY-066 | short | pharmacy-desk-counter | 4 / 2 | Bill a prescription straight from the "Prescription Queue" table |
| STORY-067 | medium | pharmacy-desk-counter | 7 / 3 | Link a prescribed medicine to the right inventory item |
| STORY-068 | short | pharmacy-desk-counter | 4 / 1 | A walk-in customer at the counter — getting to a Sales bill |
| STORY-069 | medium | pharmacy-desk-counter | 14 / 7 | Create a treatment package and check it in the browser |
| STORY-070 | medium | pharmacy-desk-counter | 16 / 11 | Add a new medicine to the drug database, then correct and remove an entry |
| STORY-071 | long | pharmacy-desk-counter | 20 / 12 | Enter a partner pharmacy's daily sales, commit stock and resolve an unmatched batch |
| STORY-072 | medium | pharmacy-desk-counter | 10 / 5 | Ask the Pharmacy AI assistant a stock question, attach a file and review a proposed change |
| STORY-073 | long | pharmacy-sales | 23 / 8 | Bill a registered walk-in customer from scratch, print, and see it in the register |
| STORY-074 | medium | pharmacy-sales | 11 / 5 | Bill a doctor's prescription from the queue, fixing stock problems on the way |
| STORY-075 | medium | pharmacy-sales | 10 / 4 | Park a half-finished bill as a draft and finish it later |
| STORY-076 | short | pharmacy-sales | 4 / 3 | Find yesterday's bill by mobile number and reprint or WhatsApp it |
| STORY-077 | medium | pharmacy-sales | 11 / 3 | Check the day's takings by payment mode in the Sales register |
| STORY-078 | medium | pharmacy-sales | 10 / 5 | Give a forgotten discount on a finished bill and hand the money back |
| STORY-079 | medium | pharmacy-sales | 11 / 6 | Take back an unopened medicine and refund the patient (sales return) |
| STORY-080 | medium | pharmacy-sales | 8 / 3 | Collect the balance on a bill that shows "Due" |
| STORY-081 | short | pharmacy-sales | 5 / 3 | Look through the "Pharmacy Invoices" list and open one |
| STORY-082 | medium | pharmacy-sales | 10 / 4 | Sell to an unnamed walk-in choosing the exact batch (Counter sale) |
| STORY-083 | short | pharmacy-sales | 4 / 2 | Recover when the connection drops while confirming a bill |
| STORY-084 | long | inventory-purchases | 30 / 6 | Scan a two-page distributor bill, fix the reading, match products and add stock |
| STORY-085 | medium | inventory-purchases | 14 / 6 | Type a small cash bill by hand, get interrupted, resume and post |
| STORY-086 | short | inventory-purchases | 4 / 3 | Find last month's bill from one distributor and open the original |
| STORY-087 | short | inventory-purchases | 5 / 3 | Mark a supplier bill paid from the register — and undo a wrong entry |
| STORY-088 | medium | inventory-purchases | 12 / 4 | Discover a mistake after posting and correct it with a linked return |
| STORY-089 | medium | inventory-purchases | 14 / 7 | Return expired stock, record the distributor's credit note and set it off against a bill |
| STORY-090 | medium | inventory-purchases | 11 / 5 | Month-end — one cheque across three bills, a part payment, and reversing a wrong entry |
| STORY-091 | medium | inventory-purchases | 11 / 6 | Add a new distributor and record the terms the rep agreed |
| STORY-092 | short | inventory-purchases | 4 / 3 | Check whether a distributor has quietly cut the discount |
| STORY-093 | medium | inventory-purchases | 9 / 4 | Bring in an e-mailed bill through Gmail (or a CSV) and review it |
| STORY-094 | short | inventory-stock-reorder | 5 / 2 | Check whether a medicine is in stock and read its batches |
| STORY-095 | short | inventory-stock-reorder | 7 / 3 | Trace why a batch went down in the Stock ledger |
| STORY-096 | medium | inventory-stock-reorder | 17 / 6 | Pharmacist requests a new item and the doctor approves it |
| STORY-097 | medium | inventory-stock-reorder | 12 / 5 | Correct a batch's expiry and shelf, then set a stock alert |
| STORY-098 | medium | inventory-stock-reorder | 12 / 4 | Propose a stock-quantity edit and get it approved |
| STORY-099 | long | inventory-stock-reorder | 30 / 13 | Run a stock-count cycle end to end (set up → count → sign off → approve → verify) |
| STORY-100 | medium | inventory-stock-reorder | 13 / 6 | Count one shelf outside the cycle, and have the count rejected |
| STORY-101 | medium | inventory-stock-reorder | 15 / 5 | Follow an expiry alert, pull the batch from sale, then write it off |
| STORY-102 | medium | inventory-stock-reorder | 9 / 3 | Find slow stock and raise a supplier-return draft |
| STORY-103 | long | inventory-stock-reorder | 27 / 8 | From reorder targets to a received purchase order |
| STORY-104 | medium | inventory-stock-reorder | 8 / 3 | Load opening stock from an Excel sheet |
| STORY-105 | medium | reports-admin | 11 / 5 | Pharmacist counts the pharmacy drawer at closing time |
| STORY-106 | medium | reports-admin | 14 / 6 | Accountant pulls the month's GST return figures |
| STORY-107 | medium | reports-admin | 13 / 4 | Admin answers a patient's billing query from the Sales Register |
| STORY-108 | medium | reports-admin | 15 / 5 | Owner reviews item margins and the day-wise summary for October |
| STORY-109 | short | reports-admin | 5 / 3 | Pharmacist prints the near-expiry list |
| STORY-110 | long | reports-admin | 26 / 6 | Admin assembles the October month-end picture across both report centres |
| STORY-111 | long | reports-admin | 22 / 9 | Admin onboards a new pharmacist and later issues him a reset code |
| STORY-112 | short | reports-admin | 4 / 2 | Admin deactivates a receptionist who has left |
| STORY-113 | long | reports-admin | 17 / 8 | Admin sets up a doctor's WhatsApp confirmations and a message template |
| STORY-114 | short | reports-admin | 4 / 2 | Admin takes a database backup before the stock take |

## Coverage Matrix

Coverage: 19 / 20 (95%)

Counted against the 20 feature areas under "Feature Map" in `docs/ux-paths/discovery.md`. An area counts as covered when at least one story's own steps exercise it. The one area not counted, Voice transcription test, is reached only by a variation of STORY-054. The Inventory workspace is one feature area in discovery; its five areas are broken out as sub-rows (marked ↳) because coverage differs sharply between them. Ids in brackets touch the area only in passing (a variation, an alternate path or a hand-off).

| Feature Area | Stories | Gaps |
|---|---|---|
| Authentication (`/login`, `/reset-password`) | STORY-001, 002, 003, 007, 010, 111 | Suspended / disabled account and the 5-per-minute throttle appear only as edge cases (STORY-001). No story for a session that dies mid-work (variations in STORY-003, 040, 049 only). |
| App shell (sidebar, header, search, bell, My Settings, tour) | STORY-004, 005, 006, 007, 010, 014, 029, 060 [096 sidebar badge] | No story walks the OWNER or MANAGER sidebar (both flagged in discovery lead D). Legacy redirect routes are only variations (STORY-003, 039, 063, 096, 103). Bell behaviour for RECEPTION / ACCOUNTANT / DOCTOR is variation-only (STORY-005). |
| Dashboard | STORY-007, 008, 009, 114 [110 step 1] | PHARMACIST / ACCOUNTANT dashboard (no appointments card) is a one-line variation in STORY-009. |
| Patients (list, detail, tracker) | STORY-011, 012, 013, 015, 016, 017, 018, 019, 020 [004, 014, 039] | `Link portal` and `WhatsApp` reminder are variations of STORY-015 only; `Unlink portal` is reported unreachable (per code). Consultation Type filter and page size not exercised. |
| Appointments (Calendar, Slots, Google sync) | STORY-021, 022, 023, 024, 025, 026, 027, 030, 031 [012, 018, 041] | Telemedicine booking and drag-to-select are variations only (STORY-026, 021). Google callback denied / error states are edge cases only (STORY-030). Checked-in / No-show have no UI to walk (STORY-023). |
| Consultation / procedure bills and Fee list | STORY-032, 033, 034, 035, 036, 037, 038, 039, 040 | Read-only `View bill` for a user without create rights is an edge case only (STORY-032). Edit / void / refund / receipt cannot be covered: no UI exists (STORY-037). |
| Rooms | STORY-028 [007, 031 steps 32–33] | Room `Edit` / `Delete` are variations only. Discovery lists `Today`/`Now`, grid 10–60 min and room search on Calendar View; STORY-028 exercises only the day chevrons and the room-type filter (and reports no date picker). |
| Visits (setup, form, tabs, autosave) | STORY-041, 042, 043, 044, 045, 046, 047, 048, 049, 050 [009, 017, 018, 027] | The `Customization` tab has no story of its own (touched in STORY-059, 060). "Setup Required" state, `Shortcuts` dialog and `Visit Workflow Tour` are variations / edge cases only (STORY-042, 045, 007). |
| Prescription builder (Visits › Prescription tab) | STORY-052, 053, 054, 055, 056, 057, 058, 059, 060, 061, 062 [045, 047, 048] | `Refill stamp`, `High contrast`, `Printer profile` and the templates `Refresh` are listed but not walked (STORY-059); no screen creates a printer profile. Print-section toggles and header/footer frames (Customization) not walked. |
| Procedures | STORY-051 | Endymed / Fotona / Hydrafacial parameter tables are variations only; `Analytics` is a placeholder. |
| Pharmacy Desk | STORY-063, 069, 071, 072 [007 tour, 068, 070] | Reception's view of the Desk is variation-only (STORY-063). Package use on a bill is a variation of STORY-073. |
| Pharmacy Counter (cockpit, Prescription Queue, inventory link) | STORY-064, 065, 066, 067, 068 | `Pause` is a variation only (STORY-065); the empty-queue actions `Pull visits` / `Inventory control` are mentioned, not walked. |
| Drug database | STORY-070 [062 steps 12–16 quick-add] | Category / manufacturer filters and paging are variations only. |
| Sales — pharmacy bills | STORY-073, 074, 075, 076, 077, 078, 079, 080, 082, 083 [055, 062, 064–066, 068] | `Treatment Packages` tab on a bill is a variation only (STORY-073). How a finished bill becomes Cancelled is not covered (no story reports a control for it; STORY-076 edge case shows the cancelled state). |
| Pharmacy Invoices list | STORY-080, 081 [075, 076, 095 step 7] | Status / Payment Status / Payment Method filters not exercised; `Retry Payment` is a variation only (STORY-080). |
| Inventory workspace (all five areas) | STORY-084–104, 079, 082 | See sub-rows. Workflow-document actions `Correct by reversal` and `Cancel document` are variations only (STORY-079, 088, 101). |
| ↳ Today | STORY-084, 094, 098, 099, 101 [089 step 8, 103 step 26] | "Recent activity", "Original files awaiting intake" and "Purchase invoices to review" rows appear only as alternates (STORY-084, 085, 095). |
| ↳ Purchases | STORY-084, 085, 086, 087, 088, 089, 090, 091, 092, 093 | `Gate passes`: no story and no alternate-path mention. `Inward challans`: only a hand-off target (STORY-103 step 27) and a variation (STORY-084). `Credits & vouchers` as a starting point and `Automatic import` › `Import & Add Stock` are alternates only (STORY-084, 089). |
| ↳ Stock | STORY-094, 095, 096, 097, 098, 099, 100, 101, 102, 104 | `Corrections` register is described only in a STORY-098 edge case. `Manual opening stock`, `Edit price`, bulk location change, delete batch, hold release are variations / alternates (STORY-097, 098, 101, 104). `Print batch label`, resolve product identity and stock-list CSV export not exercised. |
| ↳ Sales | STORY-079, 082 | `Quotations` is only an alternate path in STORY-082. `Patient invoice history` is only an alternate (STORY-075, 076, 080, 081). |
| ↳ Reorder | STORY-103 | `Manual targets & exclusions`, `Automation settings` and `Monitor` are variations only; `Add manual request` and `Add purchase order` are alternates only. |
| Pharmacy Report | STORY-105, 106, 107, 108, 109, 110 [003, 038, 040, 077 step 11] | GSTR-2A, Composition GST Report, Purchase Register and Purchase Bills appear only as variations / alternates (STORY-086, 106, 107). |
| Reports & Analytics | STORY-110 [020 alternate, 005 variation] | Patient Analytics and Appointment Analytics are a variation only; only the Excel export is exercised (JSON / CSV / PDF not). |
| Users | STORY-002, 111, 112, 113 [029 variation] | `Clinic Holidays` is a variation only (STORY-111); no story adds a holiday and checks it blocks booking. Users › `Working Hours` for a doctor is a variation (STORY-029, 111). User `Delete` is a variation (STORY-112). |
| Voice transcription test (`/test-transcribe`) | none of its own [054 variation, 003 edge case] | Not counted as covered: no story has steps on this page. Discovery lead D calls it a developer test page exposed in the Admin sidebar. |

## Story Dependency Graph

Stories lower in a branch need the state produced by the story above them (an account, a patient, a booking, a saved visit, stock on the shelf). Parenthesised notes say what is needed. Stories not shown either sit beside a near-duplicate listed under Cross-References or need only a signed-in user and seed data.

```text
STORY-001 Sign in (every role)
│
├─ CLINIC SET-UP (admin / doctor; done once, read by later stories)
│  ├─ STORY-111 Create a user account ─► STORY-002 Reset code for a locked-out user
│  │                                  └► STORY-112 Deactivate a user
│  ├─ STORY-036 Set the fee list ─► prefills STORY-032, 033 (variation), 034, 035, 040
│  ├─ STORY-028 Add / deactivate rooms ─► room cards in STORY-026, 031; room select in STORY-012
│  ├─ STORY-029 Doctor hours, leave, overbooking limit (same dialog as STORY-006)
│  │     ├─► STORY-025 Overbook an occupied slot (needs "Allow overbooking" on)
│  │     └─► "Not bookable" banner in STORY-021, 031
│  ├─ STORY-113 WhatsApp template (admin) ─► STORY-006 Doctor picks it in "My Settings"
│  │                                       └► confirmation sent on booking (STORY-021 variation)
│  ├─ STORY-060 Upload signature + letterhead ─► STORY-059 Fit to one page, signed
│  │                                           └► STORY-061 Share PDF, STORY-062
│  └─ STORY-070 Add a drug to the drug database ─► medicine search in STORY-052, 056, 062
│                                               └► STORY-069 Create a treatment package
│
├─ CARE-TO-CASH SPINE
│  STORY-011 Register patient   (or STORY-022 register + book from the calendar,
│  │                             or STORY-012 walk-in with auto-booked slot)
│  ├─ STORY-013 Find the patient ─► STORY-015 Edit ─► STORY-016 Archive / undo
│  ├─ STORY-017 Review the record (needs earlier visits + photos)
│  ├─ STORY-018 Progress tracker: book ► visit ► prescribe ► bill
│  └─ STORY-021 Book an appointment
│     ├─ STORY-023 Confirm / cancel        (needs a Scheduled booking)
│     ├─ STORY-024 Move to another day     (needs a Scheduled or Confirmed booking)
│     ├─ STORY-032 Consultation bill from the calendar row
│     │  ├─ STORY-033 Part payment now, balance later
│     │  ├─ STORY-035 Second bill on the same appointment (needs a paid first bill)
│     │  ├─ STORY-037 Wrong bill cannot be corrected (needs a paid bill)
│     │  └─ STORY-038 Clinic takings in Daily Collection (needs the day's bills)
│     └─ STORY-027 / STORY-041 Doctor starts the visit from the appointment
│        ├─ STORY-044 Nurse vitals + photo before the doctor
│        ├─ STORY-048 Tele-video visit with consent (needs a Telemedicine booking)
│        └─ STORY-045 Full consultation to `Complete Visit` (first save creates the visit)
│           ├─ STORY-046 Photos + compare      (needs a saved visit and an earlier visit with photos)
│           ├─ STORY-047 Lab results + compare (needs a saved visit and an earlier visit with labs)
│           ├─ STORY-049 Edit conflict in a second tab (needs a saved visit)
│           ├─ STORY-050 Read the previous visit (needs an earlier visit)
│           └─ Prescription tab
│              ├─ STORY-052 Add a medicine ─► STORY-056 Template ─► STORY-057 Learned plan
│              ├─ STORY-053 Reuse last meds (needs an earlier prescription)
│              ├─ STORY-058 Telugu print / STORY-059 one-page print / STORY-061 share
│              └─ STORY-055 `Create Prescription` ► "Go to Pharmacy?"  (long form: STORY-062)
│                 ├─ STORY-067 Link a prescribed medicine to inventory (needs an unlinked line)
│                 ├─ STORY-064 Counter cockpit: review ► pick ► open bill
│                 │   └─ STORY-065 Substitute / mark unavailable (needs an out-of-stock line)
│                 ├─ STORY-066 `Bill` straight from the Prescription Queue table
│                 └─ STORY-074 Bill the prescription on the Sales bill ► confirm ► print
│                    ├─ STORY-076 Find and reprint / WhatsApp the bill
│                    ├─ STORY-078 Edit discount ► record refund ─► STORY-080 Collect a "Due" balance
│                    ├─ STORY-079 Sales return (needs a finished bill with stock sold)
│                    ├─ STORY-077 Day's takings in the Sales register
│                    └─ STORY-105 Pharmacist counts the drawer in Daily Collection
│
├─ PHARMACY SALES WITHOUT A PRESCRIPTION
│  STORY-068 Walk-in at the Counter ─► STORY-073 Bill a registered walk-in (needs a patient: STORY-011)
│  │                                   ├─ STORY-075 Park as draft, finish later
│  │                                   └─ STORY-083 Recover a dropped checkout
│  └─ STORY-082 Counter sale to an unnamed customer (needs a batch in stock)
│
├─ STOCK IN ► SHELF ► STOCK OUT
│  STORY-091 Add supplier + Terms of Trade
│  └─ STORY-084 Scan a distributor bill ► add stock   (or STORY-085 typed, STORY-093 Gmail / CSV,
│     │                                                 STORY-104 opening-stock Excel)
│     ├─ STORY-086 Find the bill ─► STORY-087 Mark paid ─► STORY-090 Ledger: multi-bill cheque, reallocate
│     ├─ STORY-088 Correct a posted bill with a linked return
│     │   └─ STORY-089 Return challan ► credit note ► set off (also entered from STORY-102)
│     ├─ STORY-092 Purchase costs / discount-drop alerts (needs reviewed bills)
│     ├─ STORY-094 Check stock and batches
│     │   ├─ STORY-095 Trace a movement in the Stock ledger (needs sales or adjustments)
│     │   ├─ STORY-097 Correct batch details, set stock alert
│     │   └─ STORY-098 Stock edit ► approval
│     ├─ STORY-096 New item request ► approval (item arrives with zero stock ► STORY-098 or STORY-104 variation)
│     ├─ STORY-099 Stock-count cycle ─► STORY-100 On-demand shelf count, rejected
│     ├─ STORY-101 Expiry alert ► block stock ► write off
│     ├─ STORY-102 Stock optimization ► supplier-return draft ─► STORY-089
│     ├─ STORY-103 Targets ► shortbook ► purchase order ► receive
│     │   └─ (Inward challan ► linked purchase bill: no story; nearest is the STORY-084 variation)
│     └─ sold through STORY-073 / 074 / 082
│
├─ PHARMACY DESK EXTRAS
│  STORY-063 Start-of-shift look ─► STORY-071 Partner daily sync (needs stock in the named batches)
│  └─ STORY-072 AI assistant (its proposal adds a medicine, as STORY-070 does)
│
└─ OVERSIGHT (needs posted bills, purchases and payments from the chains above)
   STORY-106 GST returns · STORY-107 Sales Register query · STORY-108 Margins + day-wise
   STORY-109 Near-expiry list · STORY-110 Month-end across both report centres
   STORY-008 / STORY-114 Database backup (no prerequisite)
```

## Cross-References

### (a) Overlapping and near-duplicate stories

Whole journeys told twice:

- STORY-004 ≈ STORY-014 — header global search to reach a patient; both end on the Patients list seeded with the internal ID and an empty result (per code). STORY-004 is the fuller telling (Appointment and Staff results, role cases); STORY-014 is the short nurse version.
- STORY-008 ≈ STORY-114 — database backup from Dashboard › Admin Controls, same alert / response-shape mismatch. STORY-008 is fuller (repeat clicks, doctor refused, guide); STORY-114 repeats it for ADMIN.
- STORY-002 ≈ STORY-111 (steps 16–22) — admin issues a reset code, user sets a new password. STORY-002 is the fuller telling; STORY-111 embeds it after account creation.
- STORY-027 ≈ STORY-041 — doctor starts a visit from the appointment tile `START`. STORY-027 tells the calendar side (`CONT`, billing hand-off); STORY-041 is fuller on what the visit page shows and on every other entry point.
- STORY-006 ≈ STORY-029 — doctor's "My Settings" dialog. STORY-029 is fuller for weekly hours, leave, blocked time and overbooking; STORY-006 is fuller for signature, WhatsApp switches and the misleading footer `Save`.
- STORY-006 ≈ STORY-060 — signature (and letterhead) upload in "My Settings". STORY-060 is fuller and follows it into the print preview.
- STORY-006 ≈ STORY-113 — doctor WhatsApp confirmation settings; STORY-006 is the doctor's own route, STORY-113 the admin route plus the template editor (fuller).
- STORY-038 ≈ STORY-105 ≈ STORY-040 (steps 30–37) ≈ STORY-110 (steps 23–26) — Daily Collection. STORY-105 is the fuller telling of the pharmacy count; STORY-038 of the clinic block and its role gaps. STORY-003 lands on the same report after sign-in.
- STORY-039 ≈ STORY-018 (steps 13–14) — patient tracker `Bill` opens a pharmacy bill while the step tracks clinic invoices. STORY-039 is the fuller telling.
- STORY-045 ≈ STORY-062 — the same new-acne-patient consultation (Ananya Sharma) told from the visit side (STORY-045, fuller for vitals / photos / labs / completion) and the prescription side (STORY-062, fuller for medicines, preview, sharing, hand-off). STORY-045 step 27 defers to the prescription stories.
- STORY-064 ≈ STORY-074 — bill a doctor's prescription. STORY-064 tells the Counter cockpit half, STORY-074 the Sales bill half; STORY-066 is the shortcut that skips the cockpit.
- STORY-065 ≈ STORY-074 (steps 4–5) — substitute an out-of-stock medicine; STORY-065 shows the cockpit `Sub` flag being repeated on the bill, STORY-074 only the bill's `Substitute`.
- STORY-068 ≈ STORY-073 (steps 1–4) — walk-in sale; STORY-068 is "getting to a bill from the Counter", STORY-073 the complete bill. STORY-082 is the Counter-sale alternative for an unregistered customer.
- STORY-076 ≈ STORY-081 — find a past pharmacy bill and get a copy; STORY-076 through the Sales register, STORY-081 through the "Pharmacy Invoices" list.
- STORY-005 ≈ STORY-063 ≈ STORY-101 (steps 1–3) — follow a low-stock / expiry cue and land on Inventory › Today because of a `?tab=` link the workspace ignores. STORY-101 is the fuller telling (carries on to hold and write-off).
- STORY-087 ≈ STORY-090 — pay a supplier; register `Mark paid` (full amount only) versus the ledger's bulk allocation (fuller: part payment, reallocation, reversal).

Long stories that contain shorter ones:

- STORY-031 ⊇ STORY-021, 022, 023, 024, 025, 026 (front-desk morning); its steps 35–36 hand off to STORY-041 and STORY-032.
- STORY-040 ⊇ STORY-032, 033, 035, 036 and the Daily Collection close of STORY-038 / 105.
- STORY-062 ⊇ STORY-052, 054, 055, 057, 059, 061.
- STORY-110 ⊇ parts of STORY-106, 107, 108, 109.
- STORY-007 touches the tour on every page that STORY-021, 011, 028, 063 work in.

Partial overlaps (same mechanism, different goal):

- STORY-012 ≈ STORY-022 — register and book a walk-in: Patients form with auto-booked slot versus calendar quick-create with a chosen slot. Complementary; STORY-011 and STORY-019 use the same two create dialogs.
- STORY-016 ≈ STORY-019 (step 11) — archive a patient.
- STORY-009 (steps 5–6) ≈ STORY-017 (steps 1–2) — doctor's Dashboard `My Patients` search opens the record.
- STORY-017 ≈ STORY-050 — reading past visits (record `History` tab versus the visit form `History` tab; same hook and card).
- STORY-017 (steps 20–26) ≈ STORY-046 — photo upload, tagging, compare (same `VisitPhotos` component; attached to a visit only in STORY-046).
- STORY-044 ≈ STORY-045 (steps 3–9) — vitals entry by nurse (refused on save) versus doctor.
- STORY-047 ≈ STORY-062 (steps 20–21) — `Lab Tests` tab versus Prescription "Investigations".
- STORY-051 ≈ STORY-026 — a procedure recorded (Procedures page) versus booked (appointment type Procedure).
- STORY-048 ≈ STORY-061 — tele-video visit: consent (STORY-048) and sharing the result (STORY-061).
- STORY-059 ≈ STORY-060 — letterhead / margins / signature: per-print controls versus one-time set-up.
- STORY-070 ≈ STORY-062 (steps 12–16) ≈ STORY-096 ≈ STORY-072 (steps 6–8) ≈ STORY-084 (steps 23–24) — five ways a new product enters the system.
- STORY-079 ≈ STORY-088 / 089 — customer return and supplier return use the same workflow-document editor.
- STORY-089 ≈ STORY-102 — start a supplier return; STORY-102 creates the draft, STORY-089 finishes it.
- STORY-098 ≈ STORY-099 ≈ STORY-100 ≈ STORY-101 — four routes that change a batch's quantity (approved edit, cycle count, on-demand count, loss).
- STORY-096 ≈ STORY-104 — getting new items in (single request with approval versus Excel import).
- STORY-109 ≈ STORY-101 ≈ STORY-072 (step 3) — "what is expiring".
- STORY-077 ≈ STORY-107 ≈ STORY-110 (steps 12–14) — pharmacy sales totals from the Sales page versus the Sales Register report.
- STORY-092 ≈ STORY-108 — supplier cost analysis (Inventory "Distributor Analytics") versus item margins (Pharmacy Report).
- STORY-020 ≈ STORY-110 (variation) — patient list CSV versus Patient Analytics export.

### (b) Hand-offs between topics

Front desk into clinical:

- STORY-011 / 012 / 017 / 018 (patients) → STORY-021 (appointments): `Book appointment` / tracker `Book` open `/dashboard/appointments?patientId=…`.
- STORY-022 / 031 step 35 (appointments) → STORY-041 / 045 (visits): tile `START` opens the visit with `appointmentId`; STORY-027 is the bridging story.
- STORY-027 variation / STORY-031 step 36 (appointments) → STORY-032 (clinic billing): billing chip opens "Bill for {patient}".
- STORY-017 step 27 / STORY-018 step 7 (patients) → STORY-042 / 043 (visits): `Start new visit` / tracker `Start Visit` open a visit not linked to the appointment and, per STORY-043, under the first doctor in the list.
- STORY-009 step 3 (dashboard) → STORY-045 / 049 (visits): `Recent Visits` row reopens a saved visit.
- STORY-005 variation (bell, doctor) → STORY-041 (visits): `/dashboard/visits?appointmentId=…`; STORY-041 reports this lands on the empty setup screen.

Clinical into pharmacy:

- STORY-045 step 27, STORY-047 step 8, STORY-048 step 7 (visits) → STORY-052–062 (prescriptions): the builder lives in the visit's `Prescription` tab.
- STORY-055 step 2, STORY-062 step 31, STORY-018 step 13 → STORY-074 (pharmacy sales): Sales bill prefilled from the prescription or the visit.
- STORY-053 / 056 / 057 (`Stay Here`) → STORY-064 / 066 (pharmacy counter): the saved prescription appears in the queue with no further click.
- STORY-062 steps 12–16 (prescriptions) → STORY-070 (drug database) and → STORY-096 (the new drug has no inventory batch).

Counter into sales and inventory:

- STORY-064 step 14, STORY-065 step 11, STORY-066 step 3, STORY-068 step 3 (desk / counter) → STORY-073 / 074 (sales bill). There is no link back: after confirming, the user lands on the Sales register (STORY-064 step 16).
- STORY-063 step 3, STORY-065 variation (`Shelf locations`) → Inventory › Today (STORY-094) — intended for a shelf / low-stock view.
- STORY-067 variation → STORY-096 (add the product in Inventory, then return and link).
- STORY-071 edge case → STORY-084 / 096 ("Add or correct the product in Inventory, receive its stock").
- STORY-079 step 2 and STORY-082 (sales) ↔ Inventory workflow editor, returning through `return=`.
- STORY-080 step 3 (sales) → STORY-081 (invoice list): the only place a due can be collected.
- STORY-077 step 11 (sales) → STORY-107 (Pharmacy Report): the Sales register has no export.
- STORY-095 step 7 (stock ledger) → STORY-081 (invoice list with `?search=`).
- STORY-108 step 8 (margin report) → STORY-094 (item page) and back through `return=`.

Inventory internal and into accounts:

- STORY-091 → STORY-084 (agreed terms shown beside each bill line).
- STORY-093 step 6 → STORY-084 steps 6–27 (same review workbench).
- STORY-084 → STORY-086 → STORY-087 → STORY-090 (bill, register, payment, ledger).
- STORY-088 step 12 → STORY-089 step 9 (credit note for the linked return).
- STORY-102 step 8 → STORY-089 step 7 (`Create return challan` on the draft).
- STORY-103 step 27 → Purchases › Inward challans → purchase bill (no story; nearest is STORY-084 variation "Goods were received earlier on an inward challan").
- STORY-096 → STORY-098 or STORY-104 variation (the approved item has zero stock).
- STORY-099 step 29 → STORY-095 (verify adjustments in the Stock ledger).
- STORY-100 step 12 → STORY-084 / 085 ("post the bill first, then recount").

Money and administration:

- STORY-036 → STORY-032 / 040 (fee list prefills the bill); STORY-040 step 12 leaves the bill for the fee list and returns.
- STORY-038 steps 6–7 → STORY-033 (open the due bill from the calendar row).
- STORY-073 / 074 / 082 → STORY-105 (the day's takings to be counted) → STORY-106 / 107 / 110.
- STORY-111 → STORY-001 (new login) and → STORY-105 (the compliance grant lets the pharmacist save the count).
- STORY-113 → STORY-006 (template appears under "Approved Templates") → STORY-021 variation (confirmation sent on booking).
- STORY-029 → STORY-025 (overbooking limit), STORY-021 / 031 ("Not bookable" banner).
- STORY-060 → STORY-059 / 061 / 062 (signature and letterhead on print and PDF).
- STORY-069 → STORY-073 variation (`Treatment Packages` tab on the bill).

## Cross-Topic Journeys

Each topic invented its own cast, so the same role carries different names from leg to leg (the receptionist is Riya Sharma, Riya Thomas or Riya; the doctor is Dr. Sindhu Reddy in the visit stories and Dr. Kavya Reddy in the prescription stories). A walker should carry one patient and one user per role through a chain and read each leg's persona as the role.

1. **New patient, care to cash** — STORY-001 (Riya, receptionist: sign in) → STORY-022 (Riya: register and book the walk-in) → STORY-032 (Riya: consultation fee from the calendar row) → STORY-041 (Dr. Sindhu Reddy: `START` from the appointment) → STORY-045 (doctor: document and `Complete Visit`) → STORY-062 (doctor: prescription to "Go to Pharmacy") → STORY-064 (Farheen, pharmacist: cockpit review and pick) → STORY-074 (pharmacist: bill, confirm, print) → STORY-105 (pharmacist: count the drawer) → STORY-038 (owner: clinic and pharmacy takings side by side). Proves the whole spine holds together across five roles, and shows that the two billing systems meet only in Daily Collection.

2. **Returning patient, remote review** — STORY-013 (Riya: find the patient by phone) → STORY-021 (Riya: book the review; STORY-026 variation for a Telemedicine slot) → STORY-048 (doctor: tele-video visit with consent) → STORY-053 (doctor: reuse last medicines) → STORY-061 (doctor: share the PDF by WhatsApp and e-mail) → STORY-066 (pharmacist: `Bill` from the queue) → STORY-078 (pharmacist: late discount and refund). Proves a follow-up can be completed without the patient at the desk and that the prescription reaches the pharmacy with no hand-off click.

3. **Stock in, shelf, stock out, books** — STORY-091 (Dr. Lakshmi Reddy, owner: supplier and agreed terms) → STORY-084 (Sravani, pharmacist: scan the bill and add stock) → STORY-094 (pharmacist: confirm the batch is on the shelf) → STORY-073 (pharmacist: sell it) → STORY-079 (pharmacist: take one back) → STORY-095 (owner-doctor: trace the movements) → STORY-087 (Venkat, admin: pay the supplier) → STORY-106 (Lakshmi, accountant: GST returns). Proves one batch can be followed from the purchase bill to the GST figures.

4. **Expiry and returns loop** — STORY-109 (Imran, pharmacist: print the near-expiry list) → STORY-101 (pharmacist: follow the alert, block the batch, later write off) → STORY-102 (Meera, admin: optimization run and return draft) → STORY-089 (pharmacist: challan, credit note, set-off) → STORY-090 (admin: ledger, part payment, reallocation). Proves that stock taken off sale ends as either a recorded loss or a supplier credit that reduces a payable.

5. **Counts and reorder loop** — STORY-099 (admin, pharmacist, doctor: count cycle with approval) → STORY-098 (pharmacist and doctor: single stock edit with approval) → STORY-103 (admin and pharmacist: targets, shortbook, purchase order, receive) → STORY-084 variation "received earlier on an inward challan" (pharmacist: post the supplier's bill) → STORY-086 (admin: find it in the register). Proves corrected quantities drive the order and that the order closes with a bill; the inward-challan leg between STORY-103 and STORY-084 has no story of its own (see Gaps).

6. **Opening a clinic from an empty system** — STORY-111 (Kavitha, admin: create staff accounts) → STORY-036 (admin: fee list) → STORY-028 (admin: rooms) → STORY-029 (doctor: hours, leave, overbooking) → STORY-060 (doctor: signature and letterhead) → STORY-113 (admin: WhatsApp template) → STORY-006 (doctor: pick the template) → STORY-104 (admin: opening stock from Excel) → STORY-007 (new receptionist: first-morning tour) → STORY-008 (owner: backup). Proves every prerequisite the daily stories assume can be put in place through the UI, and in which order.

## All Stories

### Sign-in, app shell & dashboard

Source: `topics/auth-shell-dashboard.md`

### STORY-001: Receptionist signs in with her phone number at the start of the shift

**Type**: short
**Topic**: Sign-in, app shell & dashboard
**Persona**: Riya Sharma, receptionist, 8:50 am on a Monday with two patients already at the desk
**Goal**: Get from a closed browser to a working dashboard
**Preconditions**: Riya has an ACTIVE user with role RECEPTION, phone stored as `9848022417`; no `auth_token` cookie in this browser
**Ideal path**: 3 — identifier, password, submit; nothing else is needed to authenticate.
**Alternate paths**: none found for authenticating (one form, no SSO / OTP / sign-up). Entry points that all funnel into the same form: `/` (server redirect to `/dashboard`), any `/dashboard/*` URL without a cookie (middleware redirect to `/login?next=…`), `/login` typed directly, and `Back to sign in` on `/reset-password`.

#### Steps
1. Riya opens the clinic bookmark (`/`) → `app/page.tsx` redirects to `/dashboard`; `middleware.ts` finds no `auth_token` cookie and redirects to `/login?next=%2Fdashboard`. She sees the letterhead image, the heading "ClinicMS Login", and a `Branded` switch in the top-right corner.
2. The "Phone or email" field already has focus. She types `98480 22417` → the server strips the space before lookup (`auth.service.ts` `validateUser`). The `Sign in` button stays disabled until both fields have content.
3. She tabs to "Password" and types her password. She hesitates: the placeholder is `••••••••` and there is no show-password control, so she cannot check what she typed.
4. She presses Enter (or clicks `Sign in`) → button shows a spinner and "Signing in…"; the server sets an HttpOnly `auth_token` cookie valid for 7 days; the page does `router.replace('/dashboard')`.
5. The dashboard shows "Dashboard — Welcome back! Here's what's happening at your clinic today." with a skeleton labelled "Loading dashboard…", then the stat cards, `System Alerts` and `Today's Appointments`. The sidebar footer shows `RS`, "Riya Sharma", `RECEPTION`.

#### Variations
- **Signs in with e-mail**: typing `riya@linaeclinic.in` (anything containing `@`) switches the server to a case-insensitive e-mail lookup. Same 3 actions.
- **Wrong password**: an inline red `role="alert"` line reads "Invalid password (Reference: 3f2a…)" — the reference UUID is appended to every error. She retypes the password and submits again (+2 actions).
- **Mistyped number**: "Account not found (Reference: …)". The copy distinguishes an unknown account from a wrong password.
- **Number typed with a leading zero** (`09848022417`): "Phone number must start with a valid country code". The lookup is an exact match on the stored digits, so `919848022417` also fails if the user was saved as `9848022417` **(derived from code — confirm when walked)**.
- **Deep link**: if she had opened a bookmarked `/dashboard/appointments`, `next` carries that path and she lands there instead of the dashboard (see STORY-003).

#### Edge Cases
- **Empty submit**: the button is disabled; if submitted anyway the client shows "Phone or email and password are required".
- **Suspended or disabled account**: "Account suspended" / "Account disabled" (HTTP 403).
- **Six tries in a minute**: login is throttled to 5 attempts per minute per client (`auth.controller.ts`); the sixth returns HTTP 429. POSTs are not retried by the client, so the throttle message is shown inline (exact wording unverified).
- **Phone keyboard**: the identifier input is `type="text" inputMode="email"`, so a phone shows the e-mail keyboard even though the label offers "Phone" first.
- **Already signed in and opens `/login`**: the form is shown anyway; nothing redirects a signed-in user away from it.
- **Unsafe `next`** (`//evil.example`, backslashes, control characters, `/%2f…`): ignored; destination falls back to `/dashboard` (`loginDestination` in `app/login/page.tsx`).

---

### STORY-002: Locked-out nurse gets a one-time reset code from the admin and sets a new password

**Type**: medium
**Topic**: Sign-in, app shell & dashboard
**Persona**: Lakshmi Devi, nurse, back from two weeks' leave and cannot remember her password; Praveen Reddy, clinic admin, at the back-office PC
**Goal**: Lakshmi can sign in again without anyone else learning her password
**Preconditions**: Lakshmi's user is ACTIVE. Praveen is signed in as ADMIN (or OWNER). Both are physically in the clinic.
**Ideal path**: 8 — admin: open Users, `Reset password` on the row, confirm (3); nurse: open the reset page, code, new password, confirm, submit (5) and be signed in. The code hand-off is deliberate (in person, by design per `@cc admin-reset-code`), so it cannot be removed, but the second sign-in afterwards could be.
**Alternate paths**: none found in the UI. Not UI: a server operator script (`issueResetCodeAsOperator` in `backend/src/modules/auth/password-reset.service.ts`) for when no OWNER/ADMIN can sign in; the API `POST /users/:id/change-password` exists but no screen calls it. The Users "Edit User" dialog does **not** offer a password field (it appears only when creating a user).

#### Steps
1. Lakshmi opens `/login`, types `9000412766` and what she thinks is her password, presses Enter → "Invalid password (Reference: …)".
2. She tries a second guess → same error. She stops, aware she may lock herself out (5 attempts a minute).
3. She reads the line under the button: "Forgot password? Ask your clinic admin for a reset code, then enter your reset code." There is no e-mail or SMS self-service, so she walks to Praveen.
4. Praveen, already signed in, clicks `Users` in the sidebar (Admin section) → `/dashboard/users`, header "Users Management".
5. He scans the users table for "Lakshmi Devi" (no search box was found in `components/users/UsersManagement.tsx`; with ~10 staff this is a visual scan).
6. In her row he clicks `Reset password` (key icon; sits beside `Edit` and `Delete`) → dialog "Reset password for Lakshmi Devi" with the warning "Only issue a code to Lakshmi Devi after confirming in person that they are asking. Anyone with the code can set this account's password." and "Issuing a code cancels any earlier code for them. It is recorded in the audit log."
7. He clicks `I have confirmed who is asking. Create code` → button reads "Creating code…", then the dialog shows the code in large monospace, e.g. `K7MP-X4QD`, with "Give this code to Lakshmi Devi in person. It works once and expires 14 Nov 2026, 9:12 am." and "This code is shown only once. Closing this window does not cancel it; issuing another code does."
8. He clicks `Copy code` → the code goes to the clipboard; **no toast or "Copied" state confirms it**, so he clicks it a second time to be sure, then writes the code on a sticky note instead (Lakshmi is on a different computer, so the clipboard does not help).
9. He closes the dialog (X or Esc) → the dialog resets to the confirm step; the code can never be displayed again.
10. Back at the nurses' station Lakshmi clicks the link `enter your reset code` on the login page → `/reset-password`, card title "Set a new password".
11. She types `k7mp x4qd` into "Reset code" (placeholder `ABCD-EFGH`; helper "The 8-character code your clinic admin gave you. It works once and expires after 24 hours."). Case, spaces and dashes are ignored by the server.
12. She types a new password in "New password" (helper "At least 8 characters.").
13. She retypes it in "Confirm new password".
14. She clicks `Set new password` → "Saving…", then the form is replaced by "Password updated. Taking you to sign in…" and after 2.5 s the page goes to `/login`.
15. She types her phone number again, the new password, and presses Enter (3 actions) → `/dashboard`.

Honest count: 2 failed attempts aside, 6 admin actions (steps 4–9) + 8 nurse actions (steps 10–15) = 14.

#### Variations
- **Admin resets another admin (or an owner)**: the server refuses — "You cannot reset the password of a user at or above your role." shown as a red alert in the same dialog; only an OWNER can reset an ADMIN or OWNER (`ROLE_RANK` in `password-reset.service.ts`). The `Reset password` button is nevertheless shown on every row.
- **Manager opens Users**: MANAGER has the Users sidebar entry and sees the `Reset password` button, but `POST /auth/users/:id/reset-code` is `@Roles(OWNER, ADMIN)`; the click ends in an error inside the dialog.
- **Praveen issues a second code** because the sticky note was lost: the first code silently stops working.
- **Lakshmi changes her mind** and remembers the password: `Back to sign in` returns to `/login`; the unused code stays valid for 24 h.

#### Edge Cases
- **Wrong, expired or already-used code**: one message for all cases — "This reset code is invalid or has expired. Ask an admin for a new one. (Reference: …)".
- **Passwords differ**: client-side "The two passwords do not match." before any request.
- **Too short / too long**: "Use 8 to 72 characters." Note the mismatch with user creation, where the admin form demands "Password (8-20 chars)".
- **Brute force**: reset is throttled to 5 attempts a minute per client.
- **Visual discontinuity**: `/login` has the letterhead image and a `Branded` switch; `/reset-password` uses `components/auth/AuthCard.tsx` and has neither.

---

### STORY-003: Accountant returns after a week away and is sent back to the report she bookmarked

**Type**: short
**Topic**: Sign-in, app shell & dashboard
**Persona**: Meenakshi Iyer, part-time accountant, comes in on Friday evenings to tally cash
**Goal**: Open Daily Collection straight from her bookmark
**Preconditions**: Role ACCOUNTANT. Her 7-day `auth_token` cookie has expired. Bookmark is `/dashboard/pharmacy/reports?report=daily-collection`.
**Ideal path**: 3 — identifier, password, submit; the app should then return her to the bookmarked report without further navigation.
**Alternate paths**: after signing in to the plain dashboard she can reach the same screen via sidebar `Daily Collection` (Overview section) or sidebar `Pharmacy Report` → "Daily Collection" in the Accounting category (the same report under two sidebar entries).

#### Steps
1. She clicks the bookmark → middleware sees no cookie and redirects to `/login?next=%2Fdashboard%2Fpharmacy%2Freports%3Freport%3Ddaily-collection`. Nothing on the login page tells her she will be returned to the report.
2. She types `meenakshi@linaeclinic.in` in "Phone or email".
3. She types her password.
4. She clicks `Sign in` → `router.replace` to the full `next` value, query string intact → the Daily Collection report opens inside the shell; sidebar highlights `Daily Collection` (not `Pharmacy Report`, because the deeper link wins in `linkIsActive`).

#### Variations
- **Cookie present but token rejected** (e.g. server secret rotated): middleware lets the page through because it only checks that the cookie exists. The shell renders, `GET /auth/me` returns 401, and two redirects fire: `lib/api.ts` sets `window.location.href = /login?next=<path+query+hash>` and `dashboard-layout.tsx` calls `router.replace('/login')` with no `next`. Which one wins decides whether she returns to the report or to the dashboard **(derived from code — confirm when walked)**.
- **Session dies mid-work**: any API call that returns 401 triggers the same `window.location` redirect with the current URL as `next`; unsaved in-page state is lost (visit and prescription drafts have their own localStorage recovery, covered in other topics).
- **Opens `/dashboard/billing` or another legacy link**: the `next` value is preserved, then the page's own redirect runs after login.

#### Edge Cases
- `lib/api.ts` and `lib/authRedirect.ts` both write the return path to `localStorage` key `cms_next_after_login` "for fallback"; nothing in `frontend/src` reads it.
- `/dashboard/appointments/google-callback` is exempt from the cookie check so the Google OAuth return can load.
- `/test-transcribe` (sidebar "Test Transcribe") is outside `/dashboard`, so the middleware never guards it and it renders without the shell.

---

### STORY-004: Receptionist uses the header search to pull up a caller's record

**Type**: medium
**Topic**: Sign-in, app shell & dashboard
**Persona**: Riya Sharma, receptionist, phone on her shoulder; the caller is Sravani Kondapalli asking "what time is my appointment tomorrow, and can you check my number on file?"
**Goal**: Answer the appointment-time question and open Sravani's patient record
**Preconditions**: Signed in on a desktop-width screen (the search does not exist below `md`). Sravani exists as a patient with an appointment on 14 Nov 2026, 11:30 with Dr. Anusha Rao.
**Ideal path**: 3 — focus search, type a few letters, pick the patient → patient record opens showing phone and next appointment.
**Alternate paths**: (a) sidebar `Patients` → page search box → row `View`; (b) sidebar `Appointments` → the calendar's own patient search; (c) for doctors, Dashboard `My Patients` search → row link straight to `/dashboard/patients/<id>`; (d) Visits setup patient type-ahead. Four separate patient searches plus this one, each with different result behaviour.

#### Steps
1. Riya clicks the header field "Search patients, appointments, doctors...".
2. She types `srav` → after the second character a spinner appears in the field; 300 ms after she stops typing three requests run one after another (patients, limit 5; appointments, limit 5; users, limit 3) and a dropdown opens.
3. She reads the dropdown. Rows carry a right-hand badge `Patient`, `Appointment` or `Staff`:
   - "Sravani Kondapalli" / `9848155302` / "Patient • Female • 29 yrs" — badge `Patient`
   - "Sravani Kondapalli - 11:30-11:45" / "Dr. Anusha Rao" / "Appointment • 14 Nov 2026 • OPD" — badge `Appointment`
   Footer hint: "Press Enter to go to first result • Type more to refine search".
   The appointment row already answers the caller's first question, and the patient row already shows the phone on file; she tells Sravani "11:30 tomorrow with Dr. Anusha".
4. To open the record she clicks the `Patient` row → the search box clears and the app navigates to `/dashboard/patients?search=<patient id>`.
5. The Patients page loads with its own search box pre-filled with the internal ID (a string like `cmf3k2x9h0007…`) and the list shows "No patients found — Adjust your search or filters to find a patient." The header link passes the database ID, but the patients search matches only name, phone, ABHA ID, patient code and e-mail (`backend/src/modules/patients/patients.service.ts`) **(derived from code — confirm when walked)**. Riya pauses, unsure whether the record was deleted.
6. She selects the ID text in the Patients search box and deletes it.
7. She types `sravani` → after the 500 ms debounce the row appears.
8. She clicks `View` on the row → `/dashboard/patients/<id>` with the summary card.

Honest count to open the record: 7 actions (steps 1, 2, 4, 6, 7, 8 plus the dead-end read at 5) against an ideal of 3.

#### Variations
- **Presses Enter instead of clicking**: opens the *first* result, whatever its type. Patients are listed first, so Enter leads to the same dead end.
- **Clicks the `Appointment` row** to reschedule: lands on plain `/dashboard/appointments` — no date, doctor or appointment is carried over. The calendar shows whichever doctor and date were last remembered in `localStorage`; she must set `Doctor` and `Date` by hand and find the tile (+3 or more actions).
- **Searches a doctor** ("anusha"): a `Staff` row links to `/dashboard/users?search=<user id>`. Riya has no Users entry in her sidebar and the Users page does not read `search`, so she gets the unfiltered staff table (or its error state for her role).
- **Presses Escape**: the dropdown closes and the text stays; focusing the field again reopens the results (`@cc search-dismissal`).
- **Changes her mind mid-typing**: clicking anywhere outside closes the dropdown, text is kept.

#### Edge Cases
- **One character**: nothing happens (minimum 2 non-space characters), and no hint says so.
- **No match**: "No results found for "srv"" / "Try searching for patient names, phone numbers, or doctor names".
- **A request fails**: each of the three lookups swallows its own error (console only); a failed patients call simply yields fewer rows, indistinguishable from "no such patient".
- **Results are mouse-only**: rows are `div`s with `onClick`; there is no arrow-key selection, only Enter for the first row.
- **Role without a grant** (e.g. PHARMACIST searching a patient name): forbidden lookups are dropped silently; the user sees "No results found".

---

### STORY-005: Pharmacist follows a low-stock notification from the bell

**Type**: short
**Topic**: Sign-in, app shell & dashboard
**Persona**: Imran Khan, pharmacist, quiet half-hour after the morning OPD
**Goal**: See which items are low and get to the list he can act on
**Preconditions**: Signed in as PHARMACIST on desktop width; `/reports/alerts` returns low-stock and near-expiry items
**Ideal path**: 2 — open the bell, click the item → a stock list already filtered to low stock.
**Alternate paths**: the same low-stock/expiry information is reachable from Dashboard `System Alerts` ("Low Stock Alert — 6 items are below reorder level", read-only), sidebar `Inventory` → Today "What needs attention" queues, Inventory › Stock list filters, `Pharmacy Report` › Expiring Stock, and the Pharmacy Desk `Stock` metric. The bell is the only one of these that tries to deep-link.

#### Steps
1. Imran notices a red count badge "8" on the bell (`aria-label="Notifications"`); the badge is red because at least one item is `destructive`.
2. He clicks the bell → dropdown "Notifications" lists up to five red rows such as "Low stock: Tretinoin 0.025% Cream" / "Stock 2 • Reorder 10" and up to three amber rows such as "Expiring soon: Azithromycin 500 mg Tab" / "21 days left • Qty 40", then a separator and `View reports & alerts`.
3. He clicks "Low stock: Tretinoin 0.025% Cream" → navigates to `/dashboard/inventory?tab=low-stock`. The Inventory workspace does not read `tab`, so it opens on the **Today** area, not on a low-stock list and not on the Tretinoin item (see discovery, Redundancy Leads D).
4. He finds the low-stock row in "What needs attention" on Today and clicks it → the filtered stock list.

#### Variations
- **Clicks `View reports & alerts`**: goes to `/dashboard/reports`. PHARMACIST has no `Reports` sidebar entry (OWNER/ADMIN/MANAGER only), so he lands on a page his navigation says he should not have.
- **ACCOUNTANT**: rows are "Pending ₹1,250.00 (UPI)" and "Overdue Invoice INV-…", all linking to `/dashboard/pharmacy/sales?pay=CREDIT`; ACCOUNTANT has no `Sales` sidebar entry.
- **RECEPTION**: up to four "Upcoming: {patient} on {date}" rows (→ `/dashboard/appointments`, no appointment focus) and up to three "Overdue Invoice …" rows (→ Sales with `pay=CREDIT`; RECEPTION has no `Sales` entry either).
- **DOCTOR**: up to six "{patient} on {date}" rows, each → `/dashboard/visits?appointmentId=…` (the only notification type that lands on the specific record).
- **OWNER / ADMIN / MANAGER / NURSE** (default branch): count summaries — "3 overdue invoices", "2 pending payments", "6 low-stock items", "4 near-expiry items", "5 upcoming appointments — Within 48 hours".

#### Edge Cases
- **Alerts request fails**: silently shows "No notifications" — the same text as a genuinely quiet day.
- **Nothing to show**: no badge; dropdown says "No notifications" and the `View reports & alerts` footer is hidden.
- **Freshness**: polled every 60 s; label shows "Notifications • Loading…" while fetching. Items cannot be dismissed or marked read, so the badge count never goes down by user action.
- **More than 9**: badge reads "9+" (cannot happen for a pharmacist: max 5 + 3).
- **Mobile**: there is no bell at all below `md`.

---

### STORY-006: Doctor sets up her signature, Saturday hours, conference leave and WhatsApp confirmations in "My Settings"

**Type**: medium
**Topic**: Sign-in, app shell & dashboard
**Persona**: Dr. Anusha Rao, dermatologist, ten minutes before OPD, leaving for a conference next Thursday
**Goal**: Upload a new signature, shorten Saturdays to a half day, block 19–21 Nov as leave, and switch on automatic WhatsApp confirmations
**Preconditions**: Signed in as DOCTOR on desktop width; a scanned signature PNG under 2 MB on the computer; at least one active "appointment_confirmation" WhatsApp template
**Ideal path**: 9 — open settings, choose signature file, change Saturday end time, add leave (from, to, reason, add), toggle WhatsApp, one Save. A single save for the whole dialog would remove three intermediate saves.
**Alternate paths**: an OWNER/ADMIN can do the hours, leave and overbooking part for her from `Users` → her row → `Working Hours`, and the WhatsApp part from `Users` → `WhatsApp Settings` (that version has extra phone-number-ID and token fields). Letterhead/print layout is also editable in Visits › Customization and in the prescription preview. Signature upload: only here.

#### Steps
1. She clicks the cog in the header (`aria-label="Open settings"`, icon only, no tooltip text) → dialog "My Settings" opens, scrollable, with sections in this order: `Doctor signature`, `Prescription letterhead`, `Weekly working hours (IST)`, `Overbooking`, `Leave and blocked time`, "Send WhatsApp on appointment creation", "Use WhatsApp Template", "How to enable WhatsApp (Doctor steps)", then `Close` / `Save`.
2. Under `Doctor signature` she clicks the file input labelled "Upload signature" (reads "Replace signature" if one exists).
3. She picks `anusha-signature.png` → status line "Saving signature…" then "Signature saved." and a preview appears. It has saved already; the helper says "Only you can change your signature. Changes save immediately."
4. She scrolls to `Weekly working hours (IST)` and changes the Saturday end time (input `aria-label="Saturday shift 1 end"`) from 18:00 to 13:00.
5. She clicks `Save hours` → status "Working hours saved."
6. She scrolls to `Leave and blocked time`; in the dashed form she leaves "Type" on `Leave`.
7. She sets "From" to 19-11-2026.
8. She sets "To" to 21-11-2026 ("All day" is ticked by default).
9. She types "Dermacon conference" in "Reason (optional)".
10. She clicks `Add leave` → a "Leave · {date span} · Dermacon conference" entry is added to the list above the form (exact date-span format unverified).
11. She scrolls on and flips the switch "Send WhatsApp on appointment creation".
12. She flips "Use WhatsApp Template" → an "Approved Templates" select plus "Template Name" and "Language Code" inputs appear.
13. She opens "Approved Templates" and picks the saved appointment template → name and language fill in.
14. She clicks the footer `Save` → toast "Settings saved — WhatsApp preferences updated." and the dialog closes.

She hesitates at step 14: the footer `Save` looks like it saves the whole dialog, but it saves only the two WhatsApp switches; hours, overbooking, leave, signature and letterhead each saved on their own. Conversely, had she clicked `Close` after step 13 believing everything auto-saves like the signature, the WhatsApp changes would have been discarded without warning.

#### Variations
- **Any non-doctor role** (reception, nurse, pharmacist, admin…) clicks the cog: the dialog shows only the title and `Close` / `Save`. Clicking `Save` still calls `PATCH /users/:id/profile`, writes WhatsApp keys into that user's metadata and toasts "Settings saved — WhatsApp preferences updated." (`saveDoctorSettings` in `components/layout/header.tsx` has no role check).
- **Template mode on, nothing chosen**: `Save` shows a warning toast "WhatsApp settings incomplete — Choose a WhatsApp template or turn template mode off." Bad language code: "Use a valid WhatsApp language code, such as en, en_US, or hi."
- **No templates exist**: "No active appointment templates were found. You can still enter the template name and language manually."
- **Lunch block instead of leave**: Type `Blocked time`, untick "All day", set "Start time" 13:00 / "End time" 14:00, `Add blocked time`.
- **Allow two patients per slot**: `Overbooking` → switch "Allow overbooking" → "Up to [2] patients per slot" → `Save overbooking` → "Saved: up to 2 patients per slot."
- **Copy Monday's hours**: `Copy Monday to Tue–Fri`, then `Save hours`.

#### Edge Cases
- **First-time hours**: a note explains the source — "No hours set yet; the clinic default 09:00-18:00 applies every day. Save to set a schedule."
- **End before start**: "The end date must be on or after the start date." / "The end time must be after the start time."
- **Signature upload fails**: red alert with `Reload signature`.
- **WhatsApp not configured on the server**: the toggles save happily; the dialog only says "Requires backend WhatsApp credentials."
- **Mobile**: no cog exists below `md`, so a doctor on a phone cannot reach any of these settings.
- **Naming**: the control is "Open settings" (aria), the dialog "My Settings", the toast "WhatsApp preferences", and the same hours screen under Users is `Working Hours`.

---

### STORY-007: New receptionist's first morning — sign in, look around, take every guided tour, sign out

**Type**: long
**Topic**: Sign-in, app shell & dashboard
**Persona**: Swathi Naidu, receptionist on her first day, given a login by the admin and told "the system will show you around"
**Goal**: Learn what the front desk can do in ClinicMS before the first patient arrives
**Preconditions**: New ACTIVE user with role RECEPTION (phone `9701234588`, initial password set by the admin). Desktop browser with empty `localStorage`. At least one appointment exists today.
**Ideal path**: 6 — sign in (3), start one tour (1) that carries her across pages, finish it (1), sign out (1). Today the tour is per page and must be restarted on each.
**Alternate paths**: help for the same screens exists in four forms — header `Start Tour` (intro.js, RECEPTION only), the page-header `Quick Guide` dialog (`components/common/QuickGuide.tsx`; Dashboard, Patients, Rooms, Pharmacy, Users, Reports, Procedures, Visits), the Appointments page's own in-page "Quick Guide", and the calendar legend. Doctors get a fifth: `Visit Workflow Tour` inside the visit form.

#### Steps
1. Swathi opens the clinic URL → redirected to `/login?next=%2Fdashboard`.
2. She notices the `Branded` switch (palette icon, top-right) and flips it → the page shifts to a cream background with sage accents; the palette is extracted from `/letterhead.png` and the choice is stored in `localStorage` (`cms_branded_mode`). She leaves it on.
3. She types `9701234588` in "Phone or email".
4. She types the initial password.
5. She clicks `Sign in` → `/dashboard`. Branded mode is still on; the same `Branded` switch now sits in the header.
6. She reads the page: "Dashboard — Welcome back! Here's what's happening at your clinic today." and four cards — `Total Users 9`, `Active Users 9`, `Total Branches 1`, `System Status operational`. She hesitates: none of this is about patients or today's desk work (and Total and Active are the same server count).
7. She reads the sidebar: **Overview** — Dashboard; **Clinical** — Patients, Appointments, Rooms; **Pharmacy** — Pharmacy Desk, Pharmacy Counter, Inventory. Footer: `SN`, "Swathi Naidu", `RECEPTION`, a logout icon.
8. She clicks `Start Tour` in the header (help-circle icon; present only for RECEPTION) → an intro.js overlay opens: "Welcome to the Receptionist Dashboard! 🎉" with progress bullets.
9. `Next →` → the sidebar is highlighted: "Navigation Sidebar … Appointments / Patients / Rooms". (Her sidebar also lists three Pharmacy items the tour does not mention.)
10. `Next →` → the stat cards are highlighted: "Today's Overview — View quick stats for today including: Number of appointments scheduled, Patient registrations, Room occupancy status". The highlighted cards actually show users, branches and system status. She re-reads both.
11. `Next →` → `Today's Appointments` card highlighted: "Click on any appointment to view details, reschedule, or cancel."
12. `Finish` → overlay closes; `tour-seen-receptionist-/dashboard` is written to `localStorage`.
13. Following the tour, she clicks the first row in `Today's Appointments` ("Farhan Ali — 10:00-10:15 — CONFIRMED") → nothing happens; rows are not links.
14. She clicks `Quick Guide` in the page header → dialog "Dashboard Guide" with sections "Overview" and "System Alerts" ("Click on any alert to view more details").
15. She closes the dialog (X) and clicks the "Low Stock Alert" row in `System Alerts` → nothing happens; alerts are not clickable either.
16. She clicks `View All Appointments` at the bottom of the card → `/dashboard/appointments`.
17. She clicks `Start Tour` again → a different, 9-card tour: "Welcome to Appointment Management!".
18. `Next →` ×3 → "Step 1: Select a Doctor" (highlights the Doctor select), "Step 2: Choose the Date" (highlights the date picker), "Step 3: Choose Your View" (highlights the Calendar / Slots tabs; Calendar marked "Recommended").
19. `Next →` ×4 → four un-anchored cards: "Booking a New Appointment" (says "New patient? Click "Add Patient" button first"), "Understanding Appointment Colors", "Modifying Appointments", "Pro Tips & Time Savers".
20. `Next →` → "You're All Set!" recap ("Doctor & Date — Always select first", "Search Patient — Before clicking slots", "Click Slot — Or drag for longer", "Double-Click — To modify existing") and "Click the "Start Tour" button in the top-right corner anytime to replay this guide!".
21. `Finish`. (Steps 17–21: 10 clicks.)
22. She clicks `Patients` in the sidebar → `/dashboard/patients`.
23. `Start Tour` → 5 cards: "Patient Management 👥", "Add New Patient" (highlights the `New Patient` button; lists "Date of birth" and "Medical history and allergies"), "Search Patients", "Patient List" ("Click on any patient row to…"), "💡 Pro Tips" → `Next →` ×4, `Finish` (6 clicks).
24. She clicks `Rooms` in the sidebar → `/dashboard/rooms`.
25. `Start Tour` → 3 cards: "Room Management 🚪", "Room Calendar" (highlighted), "Room Assignment" (describes assigning a patient to a room and updating room status on arrival) → `Next →` ×2, `Finish` (4 clicks).
26. She clicks `Pharmacy Desk` in the sidebar → `/dashboard/pharmacy?section=desk`.
27. `Start Tour` → 3 text-only cards: "Pharmacy Workflows", "Pharmacy Desk" ("dashboard metrics, Codex assistant, packages, partner sync, invoices, and drug records" — most of which reception cannot see), "Pharmacy Counter" → `Next →` ×2, `Finish` (4 clicks). The same 3 cards play on `Pharmacy Counter`, because both share the pathname `/dashboard/pharmacy`.
28. She clicks `Inventory` in the sidebar and then `Start Tour` → a single card: "Receptionist Tour — The guided tour is available on these pages: Dashboard, Appointments, Patients, Rooms, Pharmacy Desk, Pharmacy Counter … Navigate to any of these pages and click the help button to start the tour!" → `Finish`.
29. The first patient walks in. She looks for "Sign out" under her name in the header (top-right) — the name there is plain text. She finds the small logout icon at the bottom of the sidebar (`aria-label="Log out"`, no text label).
30. She clicks it → no confirmation; `POST /auth/logout` expires the cookie and she is on `/login` (no `next`). Branded mode is still on for the next person at this computer.

Honest count: about 45 clicks and field entries (5 to sign in and toggle branding, 28 inside five tours, 4 sidebar navigations, 6 on dead-end clicks / the guide dialog, 1 to log out).

#### Variations
- **Skips the tour**: Esc, the × in the tooltip, or a click on the dark overlay closes any tour at any card; the "seen" flag is set the moment `Start Tour` is clicked, not on completion.
- **Second visit**: nothing auto-starts (`autoStart` defaults to false and the header mounts `<ReceptionistTour />` without it), so the "seen" flags written to `localStorage` currently change nothing.
- **Any other role**: no `Start Tour` button. A nurse, pharmacist or accountant has only the `Quick Guide` dialogs.
- **Doctor**: no header tour; inside a visit, `Visit Workflow Tour` plays 18 un-anchored cards ("Welcome to the Doctor Visit Workflow!" … "Step 12: Completing the Visit" … "You're Ready to Go!"). The button is mounted in the visit form for every role that opens it, nurses included.
- **Turns branding off again**: flip `Branded` in the header; the `branded` class and the four `--brand-*` variables are removed immediately.

#### Edge Cases
- **No appointments today**: the card shows "No appointments scheduled for today" and the `View All Appointments` button is not rendered, so step 16 needs the sidebar instead.
- **Tour target missing**: the hook waits up to 5 s for a highlighted element; if `Today's Appointments` failed to load the card still exists, so the highlight works over an error state.
- **Tour copy vs screen**: several cards describe UI that is not there or is named differently — stat cards (step 10), clickable appointment rows (11), "Add Patient" button (19; discovery records `+ Add "<text>" as a new patient` and `New Patient`), "Double-Click to modify" (20), "Date of birth" (23; the form asks for age), room assignment/status updates (25; the Rooms calendar is read-only for reception), "click the help button" (28; the button is labelled `Start Tour`).
- **Narrow window**: below `sm` the button shows only the icon; below `md` the whole header, and with it the tour, is gone.
- **Profile fetch fails after login**: the sidebar footer shows "Unknown User"; if the role is missing as well it shows "Unknown Role" and lists **every** navigation item, since `filterNavigationByRole` without a role returns them all.
- **Product name**: the login card and sidebar say "ClinicMS"; the browser tab says "Dashboard | Linaé"; the login image is the "Linaé Skin, Hair & Aesthetic Clinic" letterhead.

---

### STORY-008: Owner takes a database backup before the weekend

**Type**: short
**Topic**: Sign-in, app shell & dashboard
**Persona**: Dr. Kavitha Menon, clinic owner, Friday 7:30 pm before a software update planned for Sunday
**Goal**: Create a full backup and know that it exists
**Preconditions**: Signed in as OWNER (or ADMIN); on `/dashboard`
**Ideal path**: 2 — click `Create Backup`, read a clear result that says where the backup is and that it finished.
**Alternate paths**: none found in the UI (only this card calls `POST /auth/backup`). `GET /auth/backup/:jobId` exists for checking a job but no screen calls it.

#### Steps
1. She scrolls past the four stat cards to the `Admin Controls` card ("Administrative tools and system management").
2. In the "Database Backup — Create a complete backup of the database" row she clicks `Create Backup` → the button changes to a spinner and "Creating...".
3. A native browser `alert()` appears. The page code expects the reply to contain `backup.timestamp`, `backup.directory` and `backup.size` and would show "✅ Database backup created successfully! … Backup saved to local server directory." The server, however, only queues a background job and replies `{ success: true, jobId }`, so reading `backup.timestamp` throws and the alert that appears is "❌ Backup Failed" followed by a JavaScript error message, even though the job was queued **(derived from code — `app/dashboard/page.tsx` `handleBackup` vs `backend/src/modules/auth/auth.controller.ts` `createBackup`; confirm when walked)**.
4. She clicks `OK` on the alert → the button returns to `Create Backup`. Nothing on the page records that a backup was requested, when, or whether it completed.

#### Variations
- **Clicks again because it "failed"**: each click queues another full `pg_dump` job on the server.
- **Opens `Quick Guide` first**: for OWNER/ADMIN the "Dashboard Guide" gains an "Admin Controls" section ("Backups are stored locally on the server", "Regular backups are recommended for data safety").
- **Doctor**: the card is hidden, and the server refuses DOCTOR explicitly ("Insufficient permissions. Admin access required.") — a deliberate exception to doctors passing every role gate.

#### Edge Cases
- **Server cannot enqueue**: alert "❌ Backup Failed" + "Failed to enqueue backup job (Reference: …)".
- **Job fails later** (e.g. the `cms-postgres` container is not running): the failure is written only to a job file on the server; the UI never learns of it.
- **No confirmation** before starting and no download: the note says "⚠️ Backups are stored locally on the server and contain sensitive data."
- Native `alert()` blocks the page and ignores branded mode; the rest of the app uses toasts.

---

### STORY-009: Doctor starts the day from the dashboard — reopen yesterday's visit, look up one of her patients, check today's list

**Type**: medium
**Topic**: Sign-in, app shell & dashboard
**Persona**: Dr. Anusha Rao, dermatologist, 9:40 am with coffee, OPD starts at 10
**Goal**: Finish the note she left open last evening, check an old patient who messaged her, and see who is booked today
**Preconditions**: Signed in as DOCTOR on desktop; she has visits on record, 34 patients with her as primary doctor, and appointments today
**Ideal path**: 4 — click the unfinished visit; back; click the patient; today's list is already on screen.
**Alternate paths**:
- Reopen a visit: Dashboard `Recent Visits`; bell notification (by appointment); sidebar `Visits` setup screen; `Patients` → patient → `Resume last visit` / tracker `Continue`; `Appointments` → appointment → `Start Visit`.
- Find her patient: Dashboard `My Patients`; header search; sidebar `Patients`; Visits type-ahead.
- Today's appointments: Dashboard card; bell; sidebar `Appointments` calendar; sidebar `Rooms` calendar.

#### Steps
1. She lands on `/dashboard`. For a doctor the page order is: header with `Quick Guide`; **`Recent Visits`** and **`My Patients`** side by side; the four stat cards (`Total Users`, `Active Users`, `Total Branches`, `System Status`); `System Alerts`; `Today's Appointments`.
2. In `Recent Visits` ("Your latest consultations", latest 8) she finds "Farhan Ali — Acne vulgaris — 12 Nov 2026, 6:42 pm". No status is shown on the row, so she cannot tell from here which visits are still in progress; she goes by memory.
3. She clicks the row → `/dashboard/visits?patientId=…&visitId=…` opens that visit.
4. She completes the note there (visit topic), then clicks `Dashboard` in the sidebar → the dashboard reloads all its data from scratch.
5. In `My Patients` ("Patients with you as their primary doctor (34)") she clicks "Search by name, phone or code" and types `98490` → 250 ms later the list narrows; rows read "Padmaja Reddy" / "LN-0412 · 9849033178" / "Last visit 28 Oct 2026".
6. She clicks the row → `/dashboard/patients/<id>` (the record itself — unlike the header search in STORY-004).
7. She reads the summary, then clicks `Dashboard` in the sidebar again; the `My Patients` search box is empty again.
8. She scrolls past the stat cards and `System Alerts` to `Today's Appointments` ("Upcoming appointments for today"). For a doctor this is her own full schedule for the IST day; each row shows patient name, the booked slot text (e.g. "10:00-10:15") and a raw status badge (`CONFIRMED`, `SCHEDULED`, `IN_PROGRESS`, `COMPLETED`).
9. She wants to start the 10:00 visit and clicks the row → nothing happens; rows are static.
10. She clicks `View All Appointments` → `/dashboard/appointments`, from where "Appointment Details" → `Start Visit` works (appointments topic).

#### Variations
- **Uses the bell instead of step 8–10**: bell → "Farhan Ali on 13 Nov 2026" / "OPD • CONFIRMED" → `/dashboard/visits?appointmentId=…`, two clicks to the visit for that appointment. The bell covers the next 48 hours (max 6 rows), the dashboard card covers today only; the bell row shows the date but not the time.
- **Pages through her patients**: `Next` / `Previous` with "Page 2 of 4" (10 per page); typing in the search resets to page 1.
- **Other roles on the same page**: RECEPTION, NURSE, MANAGER, OWNER, ADMIN see `Today's Appointments` limited to the first 5 by slot across all doctors; PHARMACIST and ACCOUNTANT do not get the card at all and are left with four stat cards and `System Alerts`.

#### Edge Cases
- **No visits yet**: "No visits yet". **No assigned patients**: "No patients assigned to you yet"; with a search term, "No matching patients".
- **Panel load fails**: "Could not load your recent visits. Refresh to try again." / "Could not load your patients. Refresh to try again." — no retry button, unlike the cards below.
- **Appointments or alerts fail**: "Couldn't load today's appointments" with either "Your account does not have access to this yet. Ask an admin to check your role permissions." (403) or "This is not an empty list. Check your connection and try again." and `Try again`.
- **Statistics fail**: swallowed; cards show `0`, `0`, `0`, `unknown`.
- **`System Alerts` is never empty** on success: a "System Status — All systems operational — LOW" row is always appended, so the "No alerts at this time" empty state with `Refresh dashboard` is unreachable in practice. "System Status" therefore appears twice on the page (stat card and alert row).
- **One-character search** in `My Patients`: ignored (minimum 2), list stays unfiltered with no hint.

---

### STORY-010: Nurse on her phone finds a patient list and signs out — without the header

**Type**: medium
**Topic**: Sign-in, app shell & dashboard
**Persona**: Lakshmi Devi, nurse, using her own Android phone in the procedure room because the desk PC is busy
**Goal**: Sign in, open Patients, and sign out again so the session is not left on a personal phone
**Preconditions**: Role NURSE; viewport narrower than `md` (768 px)
**Ideal path**: 5 — identifier, password, submit, one tap to Patients, one tap to sign out.
**Alternate paths**: none found on mobile for navigation (the hamburger sheet is the only route). On desktop the same sidebar is permanently visible. There is no second logout control anywhere.

#### Steps
1. She opens the clinic URL on her phone → `/login?next=%2Fdashboard`; the `Branded` switch is in the top-right corner.
2. She taps "Phone or email" → the **e-mail** keyboard opens (`inputMode="email"`); she switches to digits and types `9000412766`.
3. She types her password.
4. She taps `Sign in` → `/dashboard`.
5. The screen shows a slim bar with a hamburger and "ClinicMS", then the dashboard content in one column. There is no search, no bell, no settings cog, no `Branded` switch and no user name — the desktop header is not rendered at this width.
6. She taps the hamburger (`aria-label="Open clinic navigation"`) → a left-hand sheet opens with the full sidebar: Overview — Dashboard; Clinical — Patients, Appointments, Visits, Rooms; footer `LD`, "Lakshmi Devi", `NURSE`, logout icon.
7. She taps `Patients` → the sheet closes and `/dashboard/patients` loads.
8. When done she taps the hamburger again.
9. She scrolls the sheet to the bottom and taps the logout icon (`aria-label="Log out"`) → cookie expired, redirected to `/login`.

#### Variations
- **Wants to search for a patient from anywhere**: impossible on mobile; she must go to `Patients` and use that page's search.
- **Doctor on a phone**: cannot open "My Settings" (signature, hours, leave, WhatsApp) or see notifications at all.
- **Receptionist on a tablet in portrait** (< 768 px): no `Start Tour`.
- **Wanted branded colours**: can only be switched on the login screen at this width; once signed in the toggle is unreachable.

#### Edge Cases
- **Sheet dismissed by tapping outside**: stays on the current page.
- **Rotating to landscape ≥ 768 px**: the layout switches to the desktop sidebar + header; an open sheet remains controlled by its own state.
- **Profile still loading**: the sheet footer shows "Loading…" for the name and "Unknown Role" until `/auth/me` and `/users/:id` return.
- **Logout request fails** (offline): the error is swallowed and she is still sent to `/login`, but the HttpOnly cookie has not been expired by the server, so reopening `/dashboard` signs her straight back in **(derived from code — `handleLogout` in `components/layout/dashboard-layout.tsx`; confirm when walked)**.

---

### Patient records

Source: `topics/patients.md`

### STORY-011: Register a new patient from the Patients page

**Type**: medium
**Topic**: Patient records
**Persona**: Riya, receptionist, Monday morning rush — a new patient is standing at the desk filling nothing in herself
**Goal**: Create a record for Sravani Reddy (28, female, 98480 12345, found the clinic on Instagram) without booking anything yet
**Preconditions**: Riya is signed in (RECEPTION). No record exists for this phone number.
**Ideal path**: 6 — open the form, name, age, gender, phone, save. Everything else is optional for a first registration.
**Alternate paths**:
- Appointments › Calendar tab › type in `Search patient by name/phone` › `+ Add "<text>" as a new patient` › dialog `Add New Patient` (short form: no address, emergency contact, primary doctor, referral, patient type) — `PatientQuickCreateDialog.tsx`. The dialog also opens **by itself** the first time a search returns nothing.
- Appointments › Slots tab › same search and same `Add New Patient` dialog (`AppointmentScheduler.tsx`).
- Patients › `New Patient` with `Patient Type` = `Walk-in` (STORY-012) — same dialog, additionally books an appointment.
- Visits "Setup Required" card › `Manage Patients` only links to this page (not a separate create form).

#### Steps
1. Click `Patients` in the sidebar (Clinical group) → `/dashboard/patients`. Two headings stack: page header `Patients Management` / "Manage patient records and information", then `Patients` / "Search, add, and manage patient records", then a card titled `Patient Records`.
2. Type `98480` in the search box (`Search by name, phone, ABHA, or email (min 2 chars)`) to check she is not already registered → after a 500 ms pause the list reloads; empty state `No patients found` / "Adjust your search or filters to find a patient."
3. Click `New Patient` → dialog `Create Patient` opens (16 controls; none is marked required).
4. Type `Sravani` in `First Name`.
5. Type `Reddy` in `Last Name`.
6. Type `28` in `Age (years)`.
7. Open `Gender` and choose `Female` → the field was pre-set to `Other`, so skipping it silently registers the patient as OTHER.
8. Type `098480 12345` in `Phone` (as the patient dictated it, with the leading 0 and a space).
9. Open `How did the patient hear about us?` and choose `Instagram`. She leaves `Consultation Type` = `Offline (In-Clinic Visit)`, `Primary Doctor` = `Automatic`, `Patient Type` = `Non walk-in`; she hesitates over `Doctor (for walk-in)`, which is shown even though this is not a walk-in.
10. Click `Create` → the server rejects the phone (must match `+?[1-9]` followed by 6–14 digits, no spaces); a red banner appears at the top of the dialog with the server's text (expected wording: "phone must be a valid international phone number (E.164 format)" — exact rendering unverified). Per code the same `error` state also replaces the table behind the dialog with the message and a `Try Again` button.
11. Correct `Phone` to `9848012345`.
12. Click `Create` again → the dialog closes with **no success toast**; the list refetches. Because `98480` is still in the search box, the new row for Sravani Reddy is the only one shown, with a 5-character `Patient Code` and `ID: <last 8 chars>`.

#### Variations
- **Doctor registers the patient**: with `Primary Doctor` left on `Automatic`, the registering doctor becomes the primary doctor (helper text: "A doctor registering the patient becomes the primary doctor; otherwise the first visiting doctor does.").
- **With ABHA**: `ABHA ID (Ayushman Bharat Health Account)` must be exactly 14 digits, otherwise `ABHA ID must be a 14-digit number` (client check).
- **Quick-create route**: the Appointments dialog marks `First Name *`, `Gender *`, `Phone *` as required and shows a success toast `Patient created` — the full form does neither.

#### Edge Cases
- **Missing name or phone**: `Please fill in all required fields (Name, Phone)` (only first name and phone are checked; last name, age, gender are not).
- **Phone typed as `+91 98480 12345`**: rejected for the spaces; `+919848012345` is accepted and stored as digits only (`919848012345`), which later will not be found by searching `98480` (phone search is prefix-only).
- **Duplicate phone**: no warning at all — see STORY-019.
- **Duplicate ABHA**: `abhaId` is unique in the database; the resulting error text is whatever the server returns (unverified).
- **Dialog closed with Esc / outside click**: form is reset; nothing is saved, no "discard changes?" prompt.
- **Quick Guide mismatch**: the page's `Quick Guide` says "Click 'Add Patient'", lists "date of birth" as required and mentions "insurance details" and a status filter — none of these exist in the form or list.

### STORY-012: Register a walk-in and let the system book the next free slot

**Type**: medium
**Topic**: Patient records
**Persona**: Farhan, receptionist, Saturday evening — a walk-in with a painful boil wants to see whichever doctor is free
**Goal**: Register Mohammed Imran (41, male, 9000412345) and get him onto Dr. Meghana Rao's calendar in one go
**Preconditions**: At least one active doctor; rooms exist; doctor has free 30-minute slots in the next 7 days.
**Ideal path**: 7 — open form, name, age, gender, phone, doctor, save (slot chosen automatically).
**Alternate paths**:
- Appointments › Calendar tab: search patient → `+ Add "…" as a new patient` → `Add New Patient` → `Create Patient` → click a free time in the Confirmed column → dialog `Book Appointment` (explicit time, duration and room choice).
- Appointments › Slots tab: same sequence with its own search and filters.
- Patients › `New Patient` as `Non walk-in`, then open the patient and use `Book appointment` (header) or `Book` (progress tracker) → `/dashboard/appointments?patientId=…`.

#### Steps
1. Click `Patients` in the sidebar → `/dashboard/patients`.
2. Click `New Patient` → dialog `Create Patient`.
3. Type `Mohammed` in `First Name`.
4. Type `Imran` in `Last Name`.
5. Type `41` in `Age (years)`.
6. Open `Gender` → `Male`.
7. Type `9000412345` in `Phone`.
8. Open `Patient Type` → `Walk-in` → two more controls appear: `Appointment Type (walk-in)` (pre-set `OPD Consultation`) and `Room (optional for OPD)`.
9. Open `Doctor (for walk-in)` → choose `Dr. Meghana Rao`. Helper text: "If Patient Type is Walk-in and a doctor is selected, the next available slot will be automatically booked after saving."
10. Open `Room (optional for OPD)` → choose `Consultation Room 1 — Consultation` (only active rooms whose type matches the appointment type are listed).
11. Click `Create` → the patient is saved, then the system looks day by day (today + 7 days) for the first free 30-minute slot in the doctor's **Confirmed** calendar where the room is also free, and books it with source WALK_IN.
12. Read the toast `Walk-in appointment booked` — "Booked into the Confirmed calendar for {date} at {slot}" → this toast is the only place the chosen time is shown; the dialog closes and the list reloads.
13. Click `Appointments` in the sidebar to confirm the tile in the Confirmed column for Dr. Meghana Rao (Farhan does not trust a toast he half-read).

#### Variations
- **Procedure walk-in**: `Appointment Type (walk-in)` = `Procedure` clears the room and filters the room list to procedure rooms ("Selecting an available procedure room is recommended.").
- **Telemedicine**: `Telemedicine` hides the room select.
- **Slot taken in the meantime**: dialog `Overbook this slot?` → `Book anyway` or `Cancel`; on `Cancel` a toast `Walk-in not booked` — "{slot} on {date} was taken and you chose not to overbook it." The patient record still exists.

#### Edge Cases
- **Walk-in chosen but no doctor selected**: the patient is created and nothing is booked, with no warning (booking only runs when both are set).
- **Doctor fully booked today**: the "walk-in" can be booked silently for tomorrow or up to 7 days ahead; only the toast date reveals it.
- **No slot in 7 days**: destructive toast `No slots available` — "No available consultation slots found in the next 7 days for the selected doctor."; patient record is kept.
- **Same fields in Edit mode**: `Patient Type` and `Doctor (for walk-in)` are also present in `Edit Patient`; choosing `Walk-in` + a doctor while editing books a new appointment on `Save Changes` (per code).
- **Naming drift inside one dialog**: `Consultation Type` (Online / Offline) vs `Appointment Type (walk-in)` (OPD Consultation / Procedure / Telemedicine) vs `Patient Type` (Walk-in / Non walk-in).

### STORY-013: Find a returning patient by phone and open the record

**Type**: short
**Topic**: Patient records
**Persona**: Riya, receptionist, on a phone call — "Lakshmi Narayana, 99890 44512" wants to know when she last came
**Goal**: Open Lakshmi's record
**Preconditions**: Patient exists and is not archived.
**Ideal path**: 2 — type a few digits in one search, pick the result.
**Alternate paths**:
- Header global search (`Search patients, appointments, doctors...`) → Patient result → lands on the Patients list, not the record (STORY-014).
- Row click anywhere **or** the row's `View` button — two controls, same destination `/dashboard/patients/{id}`.
- "Did you mean" chips under the search box (only while exactly 1 character is typed; built from the rows already on screen).
- Doctor only: Dashboard › `My Patients` (`Search by name, phone or code`) → row links straight to the record (limited to patients whose primary doctor is that doctor).
- Appointments and Visits patient searches find the same patient but only select them for booking / a visit; neither links to the record.

#### Steps
1. Click `Patients` in the sidebar → list of the newest registrations, 20 per page (page size remembered in `localStorage`). Hint under the search box: "Try: 9xxx… (phone), abha…, @email".
2. Type `99890` in the search box → after 500 ms the list reloads with patients whose phone **starts with** 99890.
3. Click the `Lakshmi Narayana` row (or `View`) → `/dashboard/patients/{id}` with skeleton "Loading patient…", then the record.

#### Variations
- **By name**: `laksh` matches anywhere in the name, case-insensitive.
- **By patient code**: prefix match, upper-cased (`K7Q` finds `K7Q2M`). The search placeholder does not mention the code.
- **Narrow further**: `Gender`, `Consultation Type`, `Date Range` (`Last 1 Week` / `Last 1 Month` = registered *or* visited in that window) selects; `Clear Filters` resets search and filters.

#### Edge Cases
- **Last four digits (`4512`)**: no result — phone search is prefix-only.
- **Number stored with country code** (`919989044512`): `99890` does not find it.
- **One character typed**: "Enter at least 2 characters to search"; the server is not queried.
- **Column sort** (`Patient`, `Age`, `Gender`, `Referral` headers): sorts only the rows of the current page in the browser; the server always pages by newest registration, so page 1 sorted A–Z is not the first A–Z patients.
- **`Consultation` column and `Last Visit` column**: per code the list mapper drops `consultationType` and reads `lastVisitDate` while the server sends `lastVisitAt`, so `Consultation` shows "—" for everyone and `Last Visit` never appears.
- **Coming back**: `Back` on the record returns to `/dashboard/patients` with search and filters cleared (they are not kept in the URL), so the next lookup starts from scratch.
- **Load failure**: red text with `Try Again`.

### STORY-014: Use the header global search to reach a patient

**Type**: short
**Topic**: Patient records
**Persona**: Anjali, nurse, at the nursing-station desktop while on the Rooms page
**Goal**: Jump to Lakshmi Narayana's record without first navigating to Patients
**Preconditions**: Desktop width (the header search is hidden on mobile). Patient exists.
**Ideal path**: 2 — type the name, click the patient result, land on the record.
**Alternate paths**: Sidebar `Patients` → page search → row (STORY-013, 3 steps and it does reach the record); doctor Dashboard `My Patients`.

#### Steps
1. Click the header search box and type `Lakshmi` → after 300 ms a dropdown lists up to 5 patients (badge `Patient`, phone, "Patient • FEMALE • 34 yrs"), then appointments (`Appointment`) and staff (`Staff`); footer "Press Enter to go to first result • Type more to refine search".
2. Click the `Lakshmi Narayana` patient result (or press Enter if it is first) → the header box is cleared and the app navigates to `/dashboard/patients?search=<internal patient id>`.
3. The Patients page opens with the **internal ID** (a long cuid) pre-typed in its search box and queries the server with it. Per code the server searches only name, phone, ABHA, patient code and e-mail — not the ID — so the result is `No patients found` / "Adjust your search or filters to find a patient."
4. Select the ID text in the Patients search box and type `Lakshmi` instead → after 500 ms her row appears.
5. Click the row → `/dashboard/patients/{id}`.

#### Variations
- **Keyboard only**: Enter opens the first result; patients are listed first, so Enter normally means "first patient".
- **Escape**: closes the dropdown but keeps the typed query; focusing the box re-opens it.

#### Edge Cases
- **No match**: "No results found for "…"" / "Try searching for patient names, phone numbers, or doctor names".
- **Search API failure**: logged to the console only; the user sees no results and no error.
- **Appointment result for the same patient**: opens plain `/dashboard/appointments` (no patient or date context).
- **Roles without Patients in the sidebar** (PHARMACIST, ACCOUNTANT): the header search still returns patients and navigates them to `/dashboard/patients`.
- **Same search, three behaviours**: header search (300 ms, links to list), Patients page search (500 ms, min-2 guard, chips), Dashboard `My Patients` search (250 ms, links to record).

### STORY-015: Correct a patient's phone number and primary doctor

**Type**: medium
**Topic**: Patient records
**Persona**: Riya, receptionist — Kavya Nair has just said her number changed from 97012 34567 to 93911 22334 and that she now sees Dr. Meghana Rao
**Goal**: Update phone and primary doctor on the existing record
**Preconditions**: Riya already has Kavya's record open (`/dashboard/patients/{id}`).
**Ideal path**: 4 — `Edit` on the record, change phone, change doctor, save.
**Alternate paths**: none found — the record page has no edit control; list row `More` → `Edit` is the only editor. (Primary doctor can also be set implicitly: by a doctor registering the patient, or by the patient's first visit.)

#### Steps
1. On the record, look for an edit action → the header offers only `Resume last visit`, `Start new visit`, `Book appointment`, `Back`; the `Info` tab is read-only. Click `Back` → `/dashboard/patients` with an empty search box.
2. Type `Kavya` in the search box → her row appears after 500 ms.
3. Click `More` on the row → menu `Edit`, `Archive`, `Link portal`, `WhatsApp`.
4. Click `Edit` → dialog `Edit Patient`. Per code `First Name` holds the whole name ("Kavya Nair") and `Last Name` is empty (the server stores one `name`); `Primary Doctor` shows `Loading…` until the full record arrives.
5. Replace `Phone` with `9391122334`.
6. Open `Primary Doctor` → choose `Dr. Meghana Rao` (other choice: `Not assigned`).
7. Glance at `Consultation Type` → it reads `Offline (In-Clinic Visit)`; per code this is a default, not the stored value, because list rows do not carry it.
8. Click `Save Changes` → dialog closes, no toast; the list reloads and the `Contact` cell shows the new number.
9. Click the row to confirm `Primary doctor: Dr. Meghana Rao` in the summary card (the list has no doctor column).

#### Variations
- **Link portal access**: `More` → `Link portal` → dialog `Link Portal Access` (shows "Patient: …", `Email` pre-filled from the record, placeholder "Existing portal account email") → `Link` → toast `Portal user linked`. Unknown e-mail → `Failed to link portal user` with the server reason ("No patient portal account with this email exists in this branch").
- **WhatsApp reminder**: `More` → `WhatsApp` → sends immediately, no preview or confirmation; toast `Reminder sent` — "WhatsApp reminder sent to …" or `Failed to send reminder` ("No upcoming appointment found" when nothing is booked).
- **Copy identifiers**: click `ID: …` under the name (toast `Copied` — "Patient ID copied to clipboard") or `Copy code` under the patient code.

#### Edge Cases
- **Online patient edited**: because the form defaults `Consultation Type` to Offline and sends it on save, editing an Online patient changes them to Offline without the user touching the field (per code).
- **`Unlink portal` / `Portal Linked` badge**: the list API does not return `portalUserId`, so per code the badge never shows and the menu always offers `Link portal`; trying it on an already linked patient returns "Patient is already linked to a user". The unlink confirmation itself is built as a toast with a plain `{label, onClick}` action object rather than a toast action element (rendering unverified).
- **Invalid ABHA / phone**: same banners as STORY-011; the banner state is shared with the list behind the dialog.
- **Two people editing**: last save wins; there is no version check on patients.
- **Reminder number**: the reminder is sent to `+` + the stored digits, so a number saved without `91` may not be a valid WhatsApp address (per code).

### STORY-016: Archive the wrong record and undo it

**Type**: short
**Topic**: Patient records
**Persona**: Riya, receptionist, end of day, cleaning up a double entry for "Ramesh Kumar"
**Goal**: Remove the mistaken record; recover immediately when she realises she archived the one with visits
**Preconditions**: Two "Ramesh Kumar" rows exist.
**Ideal path**: 3 — open row menu, archive (with a confirmation naming the patient), undo.
**Alternate paths**: none found — no archive control on the record page, no delete anywhere in the UI or API, no archived-patients view. (Exact duplicates are also archived automatically by a server job — STORY-019.)

#### Steps
1. In Patients, type `Ramesh` → two rows with different `Patient Code` values.
2. Click `More` on the first row.
3. Click `Archive` → **no confirmation**; the row disappears at once and the count drops; toast `Patient archived` — "Ramesh Kumar has been archived" with an `Undo` action.
4. Realise from the remaining row's code that the wrong one went → click `Undo` in the toast → toast `Archive undone` — "Ramesh Kumar has been restored"; the list reloads with both rows.

#### Variations
- **Correct archive**: stop after step 3.
- **Archive fails** (network): the list is refetched and a destructive toast `Failed to archive` appears.

#### Edge Cases
- **Toast gone before `Undo`**: there is no archived filter, list or restore button; the record can only be restored through the API (`POST /patients/:id/unarchive`).
- **Misclick risk**: `Archive` sits directly under `Edit` in the same menu and acts instantly.
- **Archived record by URL**: `/dashboard/patients/{id}` still opens an archived patient (the detail query does not exclude archived) and shows no "archived" marker, although `isArchived` is returned.
- **Which duplicate to keep**: the two rows look identical in the list (no last-visit column rendered, see STORY-013), so she has to open each record to compare.

### STORY-017: Doctor reviews a patient's full record before today's consultation

**Type**: long
**Topic**: Patient records
**Persona**: Dr. Meghana Rao, dermatologist, 10 minutes before Aditya Varma (22, acne on isotretinoin, third follow-up) walks in
**Goal**: Re-read the last visits and prescriptions, look at earlier photos, attach two photos the patient e-mailed, then start today's visit
**Preconditions**: Aditya has Dr. Meghana as primary doctor, three earlier visits (one by Dr. Kiran Shetty), prescriptions and visit photos. Doctor is signed in on a desktop.
**Ideal path**: 8 — open patient (2), expand the latest visit (1), open a photo (1), upload photos (3), start visit (1); history should not need a tab switch or filters to be readable.
**Alternate paths**:
- Reach the record: Patients list search → row / `View`; header global search (lands on list, STORY-014).
- Read history: Visits setup screen › `Patient History` tab; visit form › `History` tab ("Patient Visit History"); visit form "Patient Context" side panel; Procedures › `Procedure History`; Dashboard › `Recent Visits` (same `usePatientHistory` / `PatientHistoryVisitCard` on three of these).
- See / add photos: visit form › `Photos` tab (same `VisitPhotos` component, attached to that visit).
- Open the last visit: header `Resume last visit`, tracker `Continue`, tracker `Prescribe`/`View`, history card `Resume session`, Dashboard `Recent Visits` row — five entry points, one URL.
- Start a visit: header `Start new visit`, tracker `Start Visit` (only when an appointment is upcoming and there is no visit yet), list row `Start Visit`, Appointment Details `Start Visit`, Visits setup screen.

#### Steps
1. On `/dashboard` (landing page after sign-in), in the `My Patients` card type `Aditya` in `Search by name, phone or code` → the list narrows after 250 ms.
2. Click the row `Aditya Varma` ("{code} · {phone}", "Last visit 16 Oct 2026") → `/dashboard/patients/{id}`; skeleton "Loading patient…".
3. Read the header: name; badges `ID: <full internal id>`, `Code: …`, `ABHA: …`, `MALE`, `22 yrs`; buttons `Resume last visit`, `Start new visit`, `Book appointment`, `Back`.
4. Read the summary card: `Primary contact` (phone, e-mail, "Primary doctor: Dr. Meghana Rao"), `Last visit` (date and doctor), `Next appointment` → reads `Not scheduled` (per code the page looks for a field the patient API does not send, so it always says this), plus "Referral: INSTAGRAM".
5. Read the progress tracker: circles Start, Document, Complete, Prescribe (green) → Billing (blue or green) → Follow-up; buttons `Continue`, `View`, `Bill` (or `Invoices`).
6. Look at the default `Info` tab (`Patient Information`: Gender, Age, Phone, Email, ABHA ID, Address) → it repeats the header and summary; no allergies, emergency contact or referral here.
7. Click the `History` tab → card `Patient History` with `Refresh`; skeleton "Loading history…", then a filter row and date groups, newest first, all expanded.
8. Open the doctor filter (`All doctors`) and choose `Meghana Rao` (names appear without "Dr.") → only her entries remain.
9. Set the first date field (`From date`) to 01-08-2026 → older groups drop out.
10. Read the first group header: calendar icon, date, badge `2 records`, `Hide` on the right.
11. Click the header of an older date group she does not need → it collapses (`Show`).
12. Read the top visit card in summary state: date, doctor, visit type, status badge `Completed`; `Chief Complaint` and `Diagnosis` (two lines each, clamped); footer "3 Photos", "4 Rx Items", `Resume session`, `Show details`.
13. Click `Show details` → compact view: `History` and `Medicines` (drug names only).
14. Click `Full details` → sections such as `Complaint details`, `Diagnosis details`, `History`, `Examination`, `Treatment plan`, `Vitals`, `Prescription`, `Prescription instructions`, `Follow-up date`, `Visit notes`, `Lab orders`, `Photos` (thumbnails).
15. Click the first photo thumbnail → the image opens in a new browser tab.
16. Close that tab and return to the record → the window regaining focus triggers a history reload ("Loading history…"); per code the list is unmounted while it loads, so the card she had expanded comes back collapsed (filters and collapsed date groups are kept).
17. Click `Show details` on the same card again to finish reading the medicines.
18. Click `Clear filters` → Dr. Kiran Shetty's visit and appointment-only entries return ("Appointment only — no visit documentation recorded.", label `Appointment`).
19. Click `Show details` on Dr. Shetty's visit to check what he prescribed → compact `Medicines` list.
20. Click the `Uploads` tab → card `Before / After Photos (0)` with empty state "No photos attached to this visit" (there is no visit in context here), buttons `Choose Files` / `Take Photo`, and below it `Other saved photos` grouped by the date each was saved.
21. Click `Choose Files` (or `Upload` in the card header) → the OS file picker opens.
22. Select the two e-mailed images and confirm → dialog `Tag photo positions` opens in `Single` mode with positions already guessed (first photo `Front`, …).
23. Change the first photo's position to `Left` in the select → the dialog advances to photo 2.
24. Set photo 2 to `Right`.
25. Click `Upload` → button shows "Uploading (1/2) - …%", then toast `Photos uploaded` — "2 image(s) uploaded."; the card becomes `Before / After Photos (2)` with a viewer and `Compare: Off`.
26. Click `Compare: Off` → `Compare: On`; pick an earlier visit under "Compare against:" to see old vs new side by side.
27. Scroll to the top and click `Start new visit` → `/dashboard/visits?patientId=…&autoStart=true`; the visit form opens for Aditya (continues in the Visits topic).

#### Variations
- **Nurse**: same page and tabs; `Start new visit` leads to a visit form with a reduced tab set.
- **Receptionist**: same page; `Start new visit` / `Resume last visit` still show although reception has no Visits sidebar entry and the server refuses visit creation for the role (discovery note).
- **Continue the last visit instead**: `Resume last visit` → `/dashboard/visits?visitId=…&patientId=…`.
- **Camera on a tablet**: `Take Photo` / `Camera` opens the device camera (one image), then the same tagging dialog.

#### Edge Cases
- **History fails**: "Unable to load history. {reason}"; `Refresh` retries. History also reloads on every window focus (returning from another tab, window or the OS file picker); each reload briefly removes the list and collapses any expanded visit card (per code, `usePatientHistory.ts` + `[id]/page.tsx`).
- **No history**: "No documented history to show."; filters are hidden.
- **Filters exclude everything**: "No records match the current filters."
- **Doctor filter is by display name**: two doctors with the same name collapse into one option.
- **Photos uploaded from the record are not attached to any visit** (`visitId="temp"` → draft endpoint); they later appear under `Other saved photos`. No delete control on this page (`allowDelete` is not passed).
- **Position not chosen**: toast `Tag positions` — "Please select a position for each photo."
- **Patient missing / wrong URL**: "Patient not found." or the red error banner, each with `Back to Patients`.
- **Identity repeated**: phone and e-mail appear in the summary card and `Info` tab; gender, age and ABHA appear as header badges and again in `Info`.

### STORY-018: Follow the progress tracker's next-step buttons from booking to billing

**Type**: medium
**Topic**: Patient records
**Persona**: Dr. Meghana Rao running a solo evening clinic (no receptionist), using Pooja Sharma's record as her hub
**Goal**: Take a newly registered patient with nothing booked through book → visit → prescription → bill using only the tracker's buttons
**Preconditions**: Pooja Sharma registered yesterday as `Non walk-in`; no appointment, visit or bill. Doctor role (passes every server role gate).
**Ideal path**: 4 — one click per stage (Book, Start, Prescribe, Bill), each landing on the exact screen, with the tracker state matching reality.
**Alternate paths**:
- `Book` = header `Book appointment` (same URL) = Appointments page search.
- `Start Visit` = header `Start new visit` = list row `Start Visit` = Appointment Details `Start Visit` (the only one that links the visit to the appointment) = Visits setup screen.
- `Continue` = `Prescribe` / `View` (identical URL) = header `Resume last visit` = history card `Resume session` = Dashboard `Recent Visits`.
- `Bill` / `Invoices` = prescription builder `Go to Pharmacy` = "Go to Pharmacy?" dialog = Pharmacy Counter queue `Bill` = Sales `New sale`. Consultation bills are created elsewhere (Appointments billing chip / `Create bill`).
- The same tracker (compact, icons only) is shown at the top of the Visits page once a patient is selected.

#### Steps
1. Patients → type `Pooja` → click her row → record opens. Tracker: six grey circles (Start, Document, Complete, Prescribe, Billing, Follow-up) and one button, `Book`. The header also shows `Book appointment` and `Start new visit`.
2. Click `Book` → `/dashboard/appointments?patientId=…`; the calendar shows "Selected: Pooja Sharma — 98…".
3. Click a free time in the Confirmed column → dialog `Book Appointment`.
4. Confirm the booking in the dialog (button label unverified here; see Appointments topic) → success banner.
5. Return to the record: sidebar `Patients` → type `Pooja` → click the row (Appointments has no link back to the patient record; browser Back also works).
6. Tracker now: `Start` circle blue and pulsing, badge `Upcoming appt`, button `Start Visit`. The summary card above still says `Next appointment: Not scheduled` (per code) — two statements on one page that disagree.
7. Click `Start Visit` → `/dashboard/visits?patientId=…&autoStart=true`. Per code the link carries no `appointmentId`, so the visit is not marked "From Appointment".
8. Document and save the visit (Visits topic), then return to the record as in step 5.
9. Tracker now: Start green; Document blue (visit is under 24 h old with no prescription); Complete grey; Prescribe blue; buttons `Continue`, `Prescribe`, `Bill`.
10. Click `Prescribe` → `/dashboard/visits?patientId=…&visitId=…` — the same address as `Continue`; the visit form opens on its default tab, so she clicks the `Prescription` tab herself.
11. Create the prescription (Prescriptions topic); answer `Stay Here` to "Go to Pharmacy?"; return to the record as in step 5.
12. Tracker now: Document, Complete and Prescribe all green ("Complete" is inferred from "has a prescription or is older than 24 h", not from the visit's status); Billing blue; buttons `Continue`, `View`, `Bill`.
13. Click `Bill` → `/dashboard/pharmacy/sales/bill?patientId=…&visitId=…` — a new **pharmacy** Sales bill pre-filled with the patient and visit.
14. After the pharmacy bill is confirmed, return to the record → the Billing circle is still blue: it turns green only when a **clinic** bill (consultation bill from the appointment's bill dialog, `/billing/invoices`) exists. Once one does, the button reads `Invoices` but still opens a new pharmacy Sales bill.

#### Variations
- **Patient with an old visit and nothing new**: Start/Document/Complete green regardless of whether that visit was ever completed; `Start Visit` is never offered again by the tracker (only `Continue`), so a new visit must be started from the header `Start new visit`.
- **Follow-up**: the last circle turns green when the latest visit has a follow-up date; it has no button (booking the follow-up is via header `Book appointment`).

#### Edge Cases
- **Tracker load failure**: each of its three requests fails soft (step treated as not done); a total failure prints small red text only.
- **Receptionist**: sees the same buttons; `Start Visit` / `Continue` lead to a visit form she cannot create or complete; `Bill` leads to Sales, which is not in the reception sidebar.
- **Three labels for one action**: `Resume last visit` (header), `Continue` (tracker), `Resume session` (history card).
- **Bill vs Invoices vs Billing**: step is named `Billing`, button is `Bill` or `Invoices`, destination page is a "Sales bill".

### STORY-019: Discover and deal with a duplicate patient

**Type**: medium
**Topic**: Patient records
**Persona**: Farhan, evening receptionist, taking a phone booking; next morning Riya, receptionist, tidying the list
**Goal**: Book Sunita Agarwal (52, 98850 11223) — who is already registered — without creating a second record; failing that, get back to one record
**Preconditions**: A record "Sunita Agarwal", phone 9885011223, with two past visits exists. Farhan hears the name as "Sunitha".
**Ideal path**: 2 — on entering an existing phone number the form warns "already registered" and offers the existing record; pick it.
**Alternate paths**:
- Manual clean-up: Patients row `More` → `Archive` on the unwanted record (STORY-016).
- Automatic: server job `merge-duplicate-patients` runs every 6 hours (IST) and merges non-archived records in the same branch with the **same phone digits and same normalised name**, keeping the oldest and archiving the rest (`patient-deduplication.service.ts`). No UI, no notification.
- Manual merge: none found (no merge action, no duplicates report).

#### Steps
1. Farhan clicks `Appointments` in the sidebar (Calendar tab).
2. He types `Sunitha` in `Search patient by name/phone` → matches show while he types "Sunit"; at "Sunith" nothing matches and the dialog `Add New Patient` opens by itself with `First Name *` pre-filled from the partial text.
3. Assuming she is new, he corrects `First Name *` to `Sunita` and types `Agarwal` in `Last Name`.
4. Types `52` in `Age (years)`.
5. Opens `Gender *` → `Female`.
6. Types `9885011223` in `Phone *` → no "already registered" hint.
7. Clicks `Create Patient` → toast `Patient created` — "Sunita Agarwal has been added"; the new record is selected for booking ("Selected: Sunita Agarwal — 9885011223"). He books the slot (Appointments topic).
8. Next morning Riya opens `Patients` and types `98850` → two rows named Sunita Agarwal with different patient codes — unless the 6-hourly job has already run, in which case only the older record remains and last night's appointment has moved onto it.
9. If both are still there, she clicks the first row, checks `History`, clicks `Back`, retypes `98850`, and opens the second row to see which one has the visits (4 actions; the list itself shows no visit information).
10. She opens `More` on the empty record looking for a merge action → only `Edit`, `Archive`, `Link portal`, `WhatsApp`.
11. She clicks `Archive` on the empty record → toast `Patient archived`. Per code the appointment booked last night stays attached to the archived record (manual archive moves nothing; only the server merge re-points appointments and visits).

#### Variations
- **Same phone, different spelling** ("Sunitha Agarwal" vs "Sunita Agarwal"): never merged automatically; both stay until someone archives one.
- **Family sharing a phone** (mother and daughter on 9885011223 with different names): correctly not merged.
- **Created from Patients › `New Patient`**: identical outcome — no duplicate check there either.

#### Edge Cases
- **Number entered once as `9885011223` and once as `+919885011223`**: stored as different digit strings, so not merged.
- **Silent disappearance**: after the job runs, a patient code staff wrote on a file may now point to an archived record; nothing in the UI says "merged into …".
- **Auto-opened dialog dismissed**: closing `Add New Patient` clears the search text, so he has to type the name again.
- **Portal link on the duplicate**: moved to the kept record only if the kept record has none (per service code).

### STORY-020: Export last month's patients to CSV

**Type**: short
**Topic**: Patient records
**Persona**: Suresh, clinic manager, first working day of the month, preparing a list for the owner
**Goal**: Download a spreadsheet of female patients seen or registered in the last month
**Preconditions**: MANAGER (or any role with Patients in the sidebar).
**Ideal path**: 3 — choose period, choose gender, export.
**Alternate paths**: Reports (`/dashboard/reports`) › `Patient Analytics` › `Export` (aggregated analytics, not the patient list — partial overlap only). No other patient-list export found.

#### Steps
1. Click `Patients` in the sidebar.
2. Open the date select (shows `All Time`) → choose `Last 1 Month` → the list reloads.
3. Open the gender select (`All Genders`) → `Female` → the list reloads on page 1.
4. Click `Export CSV` → button reads `Exporting...`; the browser downloads `patients_export_2026-11-13.csv`; toast "Exported 143 patients to CSV".

#### Variations
- **Everything**: skip steps 2–3; the export carries the current search and filters, not the current page or sort.
- **Reset**: `Clear Filters` (next to `Export CSV`) clears search, gender, consultation type and date range.

#### Edge Cases
- **Meaning of the period**: `Last 1 Month` = registered **or** had a visit in the last month; the control is only labelled by its value, so Suresh may read it as "new registrations".
- **Columns**: ID, Name, Age, Gender, Phone, Email, ABHA ID, Referral, Consultation Type, Portal Linked, Created At. Per code `Consultation Type` is always blank and `Portal Linked` always "No" (same dropped fields as STORY-013/015); `ID` is the internal ID, the patient code is not exported.
- **Size**: the server caps an export at 10,000 rows with no warning when the cap is hit.
- **Failure**: destructive toast `Export failed`.
- **Archived patients** are never included.

### Appointments, rooms & doctor availability

Source: `topics/appointments-rooms.md`

### STORY-021: Book a review visit for an existing patient who phones in

**Type**: medium
**Topic**: Appointments, rooms & doctor availability
**Persona**: Riya, receptionist, mid-morning, phone in one hand
**Goal**: Book Meenakshi Iyer (98480 12345) for a review with Dr. Shravya Reddy tomorrow at 11:00, as an unconfirmed booking.
**Preconditions**: Riya is signed in as RECEPTION. Meenakshi already has a patient record. Dr. Shravya has no leave tomorrow.
**Ideal path**: 5 — open Appointments, pick the patient, pick the day, click the time, confirm (doctor is remembered; type, duration and room have sensible defaults).
**Alternate paths**:
- Appointments › **Slots** tab — its own patient search and filter row above the *same* two-column day grid (`AppointmentScheduler.tsx` renders `DoctorDayCalendar`).
- Patients › patient detail › `Book appointment` → `/dashboard/appointments?patientId=…` (patient arrives pre-selected, `usePrefilledPatient.ts`).
- Patient detail progress tracker › `Book` → same deep link.
- Dashboard › "Today's Appointments" › `View All Appointments`, the notification bell, and header-search "Appointment" results all land on the plain Appointments page (no patient, date or appointment carried over).

#### Steps
1. Click `Appointments` in the sidebar (Clinical) → page "Appointments": controls card with `Doctor`, `Date`, `Quick Guide`; tabs `Calendar` (selected) and `Slots`; card "Doctor Calendar" — "Click a free time in the Scheduled or Confirmed column to book into that calendar."
2. Check the `Doctor` select → it already shows "Shravya Reddy" (last choice is restored from `localStorage`; names are listed without "Dr.").
3. Change `Date` to tomorrow using the native date input → the grid reloads ("Loading schedule..." or the "Refreshing schedule…" overlay). *The date is not remembered: every page load starts on today.*
4. Type `Meena` in the `Patient` box ("Search patient by name/phone") → a search fires on every keystroke; an amber hint "Select a patient from the list or add them as new before booking." appears, then a result list under the filter row: "Meenakshi Iyer — 9848012345". *After the first letter alone the list shows ten unrelated patients, because the server ignores searches shorter than two characters (from code: `patients.service.ts`).*
5. Click the "Meenakshi Iyer — 9848012345" row → badge "Selected: Meenakshi Iyer — 9848012345" with a `Clear` button; the hint and list disappear.
6. Scroll down past the Legend box to the grid and click the free 11:00 tile in the **Scheduled** column (tooltip "Book 11:00-11:15") → dialog "Book Appointment" showing Patient, Phone, Date and "Time Slot: 11:00-11:30".
7. Glance at the defaults — `Duration` "30 minutes", `Appointment Type *` "OPD Consultation" ("Regular outpatient consultation"), room cards under "Room Availability for OPD" with "Room selection is optional for opd appointments." → Riya hesitates over whether she must pick a room, decides not to.
8. Click `Confirm Booking` → button reads "Booking...", the tile turns amber ("Booking In Progress"), the dialog closes and a green banner appears above the grid: "Appointment Successfully Booked!" / "Meenakshi Iyer scheduled for 11:00-11:30 in the Scheduled calendar (OPD)". The tile gets a green ring; the Scheduled column header now reads "1 patient to confirm". The banner and ring clear after 5 seconds.

#### Variations
- **Book straight into Confirmed**: click the tile in the right-hand column instead; the banner says "…in the Confirmed calendar" and the appointment's status is CONFIRMED from the start.
- **Longer visit**: in step 7 change `Duration` to 45/60/90 minutes; the "Time Slot" line recomputes. Dragging across several tiles (promised by the Quick Guide: "Drag across tiles to select custom time ranges") opens the same dialog, but the dialog's Duration stays at its own value (30 minutes, or whatever was chosen last) rather than the dragged range *(from code: `durationMinutes` is initialised once in `AppointmentBookingDialog.tsx`)*.
- **Arrive from the patient chart**: with `?patientId=` the badge is already present, so steps 4–5 vanish.
- **Doctor opted in to WhatsApp**: the server sends a confirmation message with the token number; nothing on screen says whether it was sent.

#### Edge Cases
- **Click a tile with no patient selected**: destructive toast "Patient required — Search and select a patient before booking a slot." The cursor is `not-allowed` but the tile still looks free.
- **Past time today**: tiles are greyed and ignore clicks; no message.
- **Doctor on leave / clinic holiday**: red banner above the grid "Not bookable: Leave all day (…)". Tiles remain clickable; the dialog then shows "Cannot book 11:00-11:30: Leave all day." and `Confirm Booking` is disabled.
- **Outside working hours**: amber text in the dialog "Warning: selected time … is outside doctor's working hours (…)"; booking is still allowed.
- **Slot taken meanwhile**: toast "Scheduling Conflict" with the server message and "— Try: 11:30-12:00, …" suggestions; the dialog stays open.
- **Patient stays selected after booking**: the "Selected:" badge is not cleared, so the next click on a free tile books the same patient again unless `Clear` is pressed.
- **Same information, several surfaces**: the Scheduled/Confirmed explanation is printed in the card description, in the Legend, in each column header and in the Quick Guide dialog.

---

### STORY-022: Register and book a brand-new walk-in from the calendar

**Type**: medium
**Topic**: Appointments, rooms & doctor availability
**Persona**: Riya, receptionist, patient standing at the desk
**Goal**: Arjun Rao (24, M, 90004 56789) has walked in with acne and no record; get him onto Dr. Shravya's Confirmed column for the next free time today.
**Preconditions**: Signed in as RECEPTION, Appointments open on today with the right doctor. No patient record for this phone number.
**Ideal path**: 5 — type name + phone once, confirm the new patient, click the time, confirm the booking (one combined "new patient + book" step would make it 4).
**Alternate paths**:
- Patients › `New Patient` › dialog "Create Patient" with `Patient Type` = "Walk-in" and "Doctor (for walk-in)" chosen — saving the patient also auto-books the next free 30-minute slot in the Confirmed calendar (toast "Walk-in appointment booked — Booked into the Confirmed calendar for … at …"). Full form, different title, no choice of time (`PatientsManagement.tsx`).
- Appointments › **Slots** tab › same "Add New Patient" dialog from its own search box.
- Manual trigger of the same dialog: button `+ Add "<text>" as a new patient` under "No matching patients found."

#### Steps
1. Click in the `Patient` box and type `Arjun Rao` → after the keystroke whose search returns nothing, the dialog "Add New Patient" opens on its own ("Capture minimal details to create a patient record without leaving the scheduling flow.") with `First Name *` = "Arjun" and `Last Name` = "Rao" (or however much had been typed when it popped up). *Riya did not ask for a dialog; she was still typing.*
2. Correct the name fields if the dialog opened mid-word.
3. Type `24` in `Age (years)`.
4. Open `Gender *` (pre-set to "Other") and choose "Male".
5. Type `9000456789` in `Phone *` (placeholder "Phone number (e.g., +1234567890 or 9876543210)").
6. Skip `Email`, `ABHA ID`; leave `Consultation Type` on "Offline (In-Clinic Visit)".
7. Click `Create Patient` → button "Saving…", toast "Patient created — Arjun Rao has been added", dialog closes, badge "Selected: Arjun Rao — 9000456789".
8. In the **Confirmed** column click the next free tile, 10:30 → dialog "Book Appointment" ("Time Slot: 10:30-11:00").
9. Click `Confirm Booking` → banner "Appointment Successfully Booked! Arjun Rao scheduled for 10:30-11:00 in the Confirmed calendar (OPD)"; his tile shows a token ("#7"), the name, and a "Confirmed" status dot/badge; header "… patients confirmed".

#### Variations
- **Search by phone first (the natural duplicate check)**: typing `9000…` finds nothing and the dialog pops up with the digits in `First Name *` and `Phone *` empty — the dialog only reads a phone number from text after an em dash "—" *(from code: `parseInitialValues`)*. She must clear First Name and retype the number.
- **Dismiss the auto-opened dialog** (`Cancel` or Esc): the search box is wiped as well, so the typed name is lost.
- **Use the Patients page route**: more fields, but the appointment time is chosen for her and a room is optional there too.

#### Edge Cases
- **Duplicate phone / validation**: server message shown both as toast "Unable to create patient" and inline in a red strip at the top of the dialog.
- **Missing first name or phone**: toast "Missing information — First name is required" / "Phone number is required".
- **Gender left at default**: the record is saved as "Other" silently.
- **Tip text mismatch**: under an empty result the page says "Tip: enter patient name and phone, then use "Add" to create a new record instantly." — but a combined name+phone search finds nothing and only an em-dash-separated string prefills the phone.
- **Naming**: the same concept is "New Patient" → "Create Patient" on Patients, and `+ Add "…" as a new patient` → "Add New Patient" → `Create Patient` here.

---

### STORY-023: Morning confirmation calls — confirm one patient, cancel another

**Type**: medium
**Topic**: Appointments, rooms & doctor availability
**Persona**: Lakshmi, receptionist, 9:15 am before OPD starts
**Goal**: Empty today's Scheduled column: Meenakshi Iyer (11:00) confirms, Farhan Qureshi (12:30) cancels.
**Preconditions**: Two appointments in today's Scheduled column for Dr. Shravya. Lakshmi is RECEPTION (ADMIN/DOCTOR also work; a NURSE is refused by the server for both actions).
**Ideal path**: 4 — open the day, confirm from the row, cancel from the row, acknowledge the cancel warning.
**Alternate paths**:
- Confirm by "rescheduling" into the other column: `RESCHED`/`Reschedule` then click a free time in the **Confirmed** column — the toast then reads "Appointment confirmed" (`DoctorDayCalendar.tsx` `place()`).
- Same dialogs are reachable from the **Slots** tab (same grid component).
- none found for cancelling (only "Appointment Details" › `Cancel Appointment`).

#### Steps
1. Open `Appointments` → today's grid; Scheduled header reads "2 patients to confirm", Confirmed header "No confirmed patients yet".
2. Click Meenakshi's tile in Scheduled (or hover it and click `INFO`, title "View Appointment Details") → dialog "Appointment Details": Date (shown as `2026-11-13`), Slot, "Calendar: Scheduled", Patient, Phone as a `tel:` link, Age, Sex, Bill type, Bill + button, Type badge "OPD", "Status: SCHEDULED". Footer: `Close`, `Start Visit`, `Reschedule`, `Cancel Appointment`, `Confirm` (primary).
3. Call her (click the phone link or dial by hand); she confirms.
4. Click `Confirm` → button "Confirming…"; dialog closes; toast "Appointment confirmed — Meenakshi Iyer is now at 11:00-11:30 in Confirmed."; her tile jumps to the right column at the same time; headers become "1 patient to confirm" / "1 patient confirmed".
5. Click Farhan's tile → "Appointment Details".
6. Call him; he cannot come. Click `Cancel Appointment` (red) → the details dialog is replaced by a second dialog "Cancel Appointment": "Are you sure you want to cancel this appointment? This action cannot be undone." with Patient / Date / Time / Type.
7. Click `Yes, Cancel Appointment` → toast "Appointment Cancelled — The appointment has been successfully cancelled."; the tile disappears (cancelled appointments are never drawn); Scheduled header "No one left to confirm".

#### Variations
- **Undo a confirmation**: open a Confirmed patient → `Move to Scheduled` (outline button, "Moving…") → toast "Moved to Scheduled".
- **Changed her mind on cancel**: `Keep Appointment` closes the warning and the "Appointment Details" dialog comes back.
- **Patient unreachable**: there is nothing to record — no "called / no answer" marker and no way to set No-show or Checked-in from the UI, although the tiles have styles for "Checked in" and "No-show" *(from code: no caller sets those statuses)*.

#### Edge Cases
- **Confirm when that time is already taken in Confirmed (overbooking off)**: the details dialog closes and an amber sticky banner appears: "Moving Meenakshi Iyer to Confirmed" / "11:00-11:30 is taken in Confirmed. Click a free time in the Confirmed calendar, or change the date to pick another day." Only the Confirmed column accepts clicks; `Cancel` on the banner abandons the move.
- **Confirm when taken and the doctor allows overbooking**: dialog "Overbook this slot?" first; declining drops into the same restricted reschedule mode.
- **Cancel an in-progress or completed visit**: the button is still offered; the server answers "Cannot cancel appointment in progress" / "Cannot cancel completed appointment" → toast "Failed to cancel appointment".
- **Nurse at the desk**: `Confirm`, `Reschedule` and `Cancel Appointment` are all shown, but `POST /appointments/:id/reschedule` and `DELETE /appointments/:id` do not list NURSE, so each ends in an error toast.
- **Naming**: "Confirm" (move column), "Confirm Booking" (create) and "Yes, Cancel Appointment" (confirm a cancel) are three different confirmations; "Scheduled" is a column, a status, and the verb in the success banner.

---

### STORY-024: Move an appointment to another day

**Type**: medium
**Topic**: Appointments, rooms & doctor availability
**Persona**: Riya, receptionist, patient on the phone
**Goal**: Sunita Deshpande wants her Thursday 16:00 review with Dr. Shravya moved to Saturday morning.
**Preconditions**: The appointment exists with status SCHEDULED or CONFIRMED (only those can move). RECEPTION / ADMIN / DOCTOR role.
**Ideal path**: 4 — find the appointment, choose reschedule, pick the new day, click the new time.
**Alternate paths**:
- Hover action `RESCHED` on the tile (title "Reschedule Appointment") vs `Reschedule` inside "Appointment Details" — two entry points to the same mode.
- Same flow from the **Slots** tab grid.
- Cancel and re-book (the only route if the doctor, room, type or duration must change — no edit form exists).

#### Steps
1. On `Appointments`, set `Date` to Thursday → Riya has to already know the day; there is no search-by-patient that opens an appointment (header search results for appointments open the plain page on today).
2. Find Sunita's tile at 16:00, hover it and click `RESCHED` → amber sticky banner at the top of the grid: "Rescheduling Sunita Deshpande" / "Click a free time in either calendar. To move to another day, change the date first." with a `Cancel` button.
3. Scroll back up to the controls card and change `Date` to Saturday → the grid reloads; the banner survives and now reads "Click a free time in either calendar to move this appointment from {Thursday} to {Saturday}."
4. Scroll down and click the free 10:30 tile in the **Scheduled** column (tooltip "Move to 10:30-11:00" — the original 30-minute length is kept) → toast "Appointment rescheduled — Sunita Deshpande is now on {Saturday} at 10:30-11:00 in Scheduled."; the banner clears and the tile appears on Saturday with a new token number for that day.
5. Tell the patient the new time. *(The page stays on Saturday; Riya must set `Date` back to today herself.)*

#### Variations
- **Open details first**: click the tile → `Reschedule` → same banner (one extra click).
- **Same-day move**: skip step 3.
- **Drop it in the other column**: clicking a Confirmed tile while rescheduling a Scheduled patient both moves and confirms them; the toast title is then "Appointment confirmed" instead of "Appointment rescheduled".
- **Narrow tiles** (phone, or two patients side by side in an overbooked slot): the hover buttons are hidden below a 16 rem block width, so only the details-dialog route exists.

#### Edge Cases
- **Change the `Doctor` mid-reschedule**: the move is dropped without a message (a reschedule keeps the doctor).
- **Switch to the other tab mid-reschedule**: the grid is re-created and the move is lost *(from code: inactive tab content is unmounted)*.
- **Target time on leave / holiday**: toast "Failed to reschedule" with the time-off description; banner stays.
- **Target tile already holds a patient**: full tiles offer no click; with overbooking on, the tile shows "Overbook 1/2" and the "Overbook this slot?" dialog follows.
- **Room clash at the new time**: the room is carried over unchanged and cannot be re-picked; a room conflict is refused (never overbooked) with "Failed to reschedule".
- **Checked-in / in-progress / completed**: no `RESCHED` or `Reschedule` button is drawn.

---

### STORY-025: Squeeze an urgent patient into an occupied slot (overbooking)

**Type**: short
**Topic**: Appointments, rooms & doctor availability
**Persona**: Riya, receptionist, doctor has just said "send him in at 12"
**Goal**: Add Imran Sheikh to Dr. Shravya's 12:00 Confirmed slot, which already holds Kavya Nair.
**Preconditions**: Dr. Shravya has "Allow overbooking" on with "Up to 2 patients per slot" (see STORY-029). Imran has a patient record. Today, 12:00 is still in the future.
**Ideal path**: 3 — select patient, click the occupied time, one confirmation that says it is an overbook.
**Alternate paths**: Same sequence from the **Slots** tab. Patients › "Create Patient" walk-in auto-booking can also raise the same "Overbook this slot?" dialog. Otherwise none found.

#### Steps
1. Type `Imran` in `Patient` and click "Imran Sheikh — 9885011223" → badge "Selected: …".
2. In the Confirmed column at 12:00, Kavya's block fills the left half of the row and a small amber tag reads "Overbook 1/2". Click the empty right half → dialog "Book Appointment" ("Time Slot: 12:00-12:30"). *Nothing in this dialog mentions that the slot is already occupied.*
3. Click `Confirm Booking` → the server refuses with an overbook offer and a second dialog opens on top: "Overbook this slot?" — "This slot already has 1 patient. Book anyway? (2 of 2 allowed)" with `Cancel` / `Book anyway`.
4. Click `Book anyway` → both dialogs close; banner "Appointment Successfully Booked! Imran Sheikh scheduled for 12:00-12:30 in the Confirmed calendar (OPD)"; the two patients sit side by side in the 12:00 row.

#### Variations
- **Decline**: `Cancel` in the overbook dialog books nothing and shows no toast; the "Book Appointment" dialog is still open underneath.
- **Limit of 3–5**: the tag reads "Overbook 2/3" etc.; each extra patient needs the same two confirmations.

#### Edge Cases
- **Slot at its limit**: the tile offers no action; its tooltip becomes "Long press to view details: Kavya Nair — 12:00-12:30" and a 500 ms press opens the first patient's details.
- **Overbooking off (limit 1)**: occupied tiles are closed; a partially overlapping duration is answered with toast "Scheduling Conflict … — Try: …".
- **Room already in use**: never overbookable; plain "Scheduling Conflict" toast.
- **The two columns do not see each other**: a 12:00 booking in Scheduled and another at 12:00 in Confirmed raise no prompt at all — each calendar counts only its own appointments, so the doctor can be double-booked across columns silently.
- **Double notice**: the overbook state is signalled three times in sequence (tile tag, server refusal, confirm dialog) yet the booking dialog in the middle is silent about it.

---

### STORY-026: Book a procedure with a room from the Slots tab, then check it with the filters

**Type**: medium
**Topic**: Appointments, rooms & doctor availability
**Persona**: Anjali, clinic nurse covering the front desk over lunch
**Goal**: Book Pooja Malhotra for a 45-minute chemical peel with Dr. Shravya on Friday 15:00 in Procedure Room 1, and confirm it shows up correctly.
**Preconditions**: Signed in as NURSE (may create appointments). At least one active room of type "Procedure". Pooja has a record.
**Ideal path**: 7 — pick day, pick patient, click time, set type = Procedure, name it, pick room, confirm (duration could default from the procedure).
**Alternate paths**:
- **Calendar** tab — identical dialog; differs in that it has the `Grid` selector, the Legend, the Google Calendar controls and a compact "Selected:" badge.
- Patients › "Create Patient" walk-in with "Appointment Type (walk-in)" = Procedure and a room (new patients only, next free slot only).
- Procedures page records the procedure itself but books no appointment (other topic).

#### Steps
1. Open `Appointments` and click the `Slots` tab → card "Appointment Scheduler" — "Select a doctor and date to view available appointment slots" (those two controls are actually in the card above the tabs); a filter row `Visit Type`, `Room`, `Duration`; a full-width `Patient` search; the same Scheduled/Confirmed grid underneath. No Legend, no Google Calendar controls.
2. Set `Date` (controls card) to Friday.
3. Type `Pooja` in `Patient` → result rows show the name, "ID: <internal id>", 📞 phone and ✉️ e-mail. Click hers → green box "✓ Selected Patient" with name, raw ID, phone and a `Clear` button.
4. Anjali sees `Duration` in the filter row and sets it to "45 minutes", expecting a 45-minute appointment → the grid is redrawn in 45-minute rows instead (this control is the grid step; the Calendar tab labels the same thing `Grid`).
5. Click the row that starts at 15:00 in the **Scheduled** column → dialog "Book Appointment" with "Time Slot: 15:00-15:30" — still 30 minutes.
6. In the dialog set `Duration` to "45 minutes" → "Time Slot: 15:00-15:45" ("Adjusts end time and validates room availability for the new duration.").
7. Set `Appointment Type *` to "Procedure" → helper "Medical procedure or surgery - room selection required"; a `Procedure Name` field appears; the room section becomes "Room Availability for PROCEDURE *"; `Confirm Booking` is disabled.
8. Type `Chemical Peel` in `Procedure Name` ("This will be shown on the calendar next to the patient name for quick reference.").
9. Click the "Procedure Room 1" card (badge "Available", "✓ Available for 15:00-15:45") → blue ring. "Procedure Room 2" is red, badge "Occupied", "Conflict with: {patient} / Dr. {name}" and cannot be chosen.
10. Click `Confirm Booking` → toast "Appointment Booked Successfully — Pooja Malhotra scheduled for 15:00-15:45 in the Scheduled calendar" **and** the green banner "Appointment Successfully Booked! … in Procedure Room 1 (PROCEDURE)".
11. Set `Visit Type` to "Procedure" → blue strip "Filters Active: PROCEDURE"; only procedure tiles remain.
12. Set `Room` to "Procedure Room 1 (Procedure)" → strip adds "Room: Procedure Room 1". Pooja's purple tile is there with the room name — but without "(Chemical Peel)": the Slots tab does not send the procedure name to the server *(from code: `handleBookingConfirm` in `AppointmentScheduler.tsx` omits `notes`; the Calendar tab sends it)*.

#### Variations
- **Do it on the Calendar tab**: steps are the same minus step 4's trap; the tile then reads "Pooja Malhotra (Chemical Peel)" on wide rows and one banner (no toast) confirms it.
- **Telemedicine**: `Appointment Type` "Telemedicine" ("Virtual consultation via video call") lists only rooms whose type contains telemed/virtual/online; room optional.
- **No room of that kind**: "No procedure rooms available — You can still book this appointment. Room assignment can be done later." — yet for a procedure `Confirm Booking` stays disabled, and no later room-assignment screen exists.

#### Edge Cases
- **Fix the missing procedure name**: there is no edit action on an appointment; she must `Cancel Appointment` and re-book from the Calendar tab.
- **Filters hide everything**: "No appointments match the current filters."
- **Switching tabs**: the selected patient, both filters and the grid step are forgotten each time (each tab keeps its own state and is rebuilt).
- **Filter value wording**: the filter is labelled `Visit Type`, the dialog field `Appointment Type`, the details row `Type`, and the active-filter chip prints the raw code `PROCEDURE`.
- **Room types that can never be picked**: only rooms whose type text matches consultation/opd/clinic, procedure/operation/surgery or telemed/virtual/online are offered; "Recovery", "Laboratory", "Imaging", "Waiting", "Pharmacy", "Emergency" rooms never appear in a booking.

---

### STORY-027: Doctor starts the consultation from the appointment

**Type**: short
**Topic**: Appointments, rooms & doctor availability
**Persona**: Dr. Shravya Reddy, dermatologist, between patients
**Goal**: Open the visit for the next confirmed patient, Arjun Rao (10:30).
**Preconditions**: Signed in as DOCTOR; Arjun is in today's Confirmed column; no visit started yet.
**Ideal path**: 2 — open today's list, click start on the patient.
**Alternate paths**:
- Click the tile → "Appointment Details" → `Start Visit`.
- Header notification bell (doctor) → appointment item → `/dashboard/visits?appointmentId=…`.
- Visits › setup screen, Patients row `Start Visit`, patient detail `Start new visit` / tracker `Start Visit` (all start a visit *without* linking the appointment — see the visits topic).

#### Steps
1. Open `Appointments` → own name is in `Doctor`, today's grid shows the Confirmed column with tokens (#1, #2 …).
2. Hover Arjun's tile → three small buttons fade in at its right edge: `INFO`, `RESCHED`, `START`. Click `START` (title "Start Visit") → browser goes to `/dashboard/visits?patientId=…&appointmentId=…&autoStart=true`; the visit page opens with a "From Appointment" badge and a `Back to Calendar` button. → **Hand-off to the visit documentation stories.**
3. Later, `Back to Calendar` (browser back) returns to the grid; the tile's hover button now reads `CONT` (title "Continue Visit") and reopens the same visit with `visitId=`.

#### Variations
- **Via details**: the dialog button is always labelled `Start Visit`, even when it will resume an existing visit. For a still-Scheduled patient `Confirm` is the primary button and `Start Visit` is secondary; starting a visit does not require confirming first.
- **Billing afterwards**: the chip on the tile ("Not billed", "₹500 · Paid", "₹200 due") or `Create bill` / `Open bill` / `View bill` in the details dialog opens "Bill for {patient}" → **hand-off to the consultation-billing stories.**

#### Edge Cases
- **Receptionist clicks `START`**: the button is shown to every role; the visit page opens but the server refuses visit creation for RECEPTION.
- **Tile too narrow for hover buttons**: only the details-dialog route remains.
- **Just-booked (optimistic) tile**: all actions are disabled until the server copy arrives.
- **Naming**: `START` / `Start Visit` / `CONT` / "Continue Visit" for one action; the visit page says "Back to Calendar" whether the user came from the Calendar or the Slots tab.

---

### STORY-028: Check room load, add a new room and take one out of service

**Type**: medium
**Topic**: Appointments, rooms & doctor availability
**Persona**: Suresh, clinic admin, planning the week on Friday afternoon
**Goal**: See how busy the procedure rooms are on Monday, add "Laser Room 2", and stop bookings into "Procedure Room 3" during renovation.
**Preconditions**: Signed in as ADMIN (DOCTOR/OWNER also see the second tab; NURSE and RECEPTION see only the calendar; MANAGER has no Rooms entry).
**Ideal path**: 6 — open Rooms, jump to the date, add room (name + type, save), toggle the old room off.
**Alternate paths**: none found for managing rooms. Room occupancy for one time slot is also visible inside the "Book Appointment" dialog (room cards with Available / Occupied), and the Appointments `Room` filter shows one room's appointments for one doctor.

#### Steps
1. Click `Rooms` in the sidebar → page "Room Management" ("Manage room schedules, occupancy, and configurations"), `Quick Guide`, tabs `Calendar View` (selected) and `Manage Rooms`; heading "Room Calendar & Occupancy".
2. Click the right-chevron button three times to reach Monday → heading date changes each click; there is no date picker (`Today` jumps back).
3. Open the room-type select ("All Room Types") and choose "⚕️ Procedure" → only procedure-room columns remain; tiles `Total Rooms`, `Available`, `Occupied`, `Appointments` update (the `Appointments` tile keeps counting every room).
4. Hover a coloured block → a hover card shows patient, date • time, phone, doctor, Type, Status, Notes and Room. Clicking does nothing; the grid is read-only and always spans 09:00–18:00.
5. Click the `Manage Rooms` tab → heading "Room Configuration & Management", then a second heading "Rooms Management" ("Manage clinic rooms and their configurations"), tiles `Total Rooms` / `Consultation` / `Procedure` / `Telemedicine`, card "All Rooms".
6. Click `Add Room` → dialog "Add New Room".
7. Type `Laser Room 2` in `Room Name *`.
8. Open `Room Type *` (default "🩺 Consultation Room") and pick "🏥 Procedure Room" from ten types.
9. Set `Capacity *` to `2`; leave "Room is active" ticked.
10. Click `Add Room` → toast "Room created"; the row appears in the table.
11. Find "Procedure Room 3" (optionally type in "Search by room name...") and flip the switch beside its "Active" badge → toast "Room deactivated"; badge "Inactive".
12. Click `Calendar View` to check → "Procedure Room 3" is gone from the grid and "Laser Room 2" has a column.

#### Variations
- **Edit**: row `Edit` → dialog "Edit Room" → `Update Room` → toast "Room updated".
- **Delete**: row `Delete` → native browser `confirm("Are you sure you want to delete "…"?")` → toast "Room deleted", or "Failed to delete room" when the room has ever had an appointment ("Cannot delete room with existing appointments").
- **Front-desk view**: a receptionist gets steps 1–4 only (no `Manage Rooms` tab).

#### Edge Cases
- **Re-activating a room**: the Manage Rooms table loads from the endpoint that returns *active rooms only*, falling back to the all-rooms endpoint only on error *(from code: `fetchRooms` in `RoomsManagement.tsx`, `getRooms` in `appointments.service.ts`)*. After a reload the deactivated room is no longer listed, the "Inactive" status filter is empty, and there is no way to switch it back on. A room created with "Room is active" unticked vanishes immediately.
- **Appointments before 09:00 or after 18:00**: clipped out of the room grid, though the doctor grid stretches to show them.
- **Quick Guide promises that are not there**: "Click on appointments to view details or reassign rooms", "Configure room amenities and equipment", "Track room cleaning and maintenance schedules".
- **Titles stacked**: sidebar "Rooms" → "Room Management" → "Room Calendar & Occupancy" → "Room Occupancy Calendar"; second tab "Manage Rooms" → "Room Configuration & Management" → "Rooms Management" → "All Rooms".
- **Two legends**: this page's Legend (with an "Available" swatch) and the Appointments Legend describe the same visit-type colours from different colour sources.

---

### STORY-029: Doctor sets weekly hours, leave, a blocked hour and an overbooking limit

**Type**: medium
**Topic**: Appointments, rooms & doctor availability
**Persona**: Dr. Shravya Reddy, Friday evening after OPD
**Goal**: Replace the default 9–6 day with split shifts, block next week's conference days and one lunch-hour errand, and allow two patients per slot.
**Preconditions**: Signed in as DOCTOR on a desktop-width screen (the settings cog is in the desktop header only). No hours configured yet.
**Ideal path**: 9 — open settings, enter Monday's two shifts, copy to weekdays, save; add leave; add blocked hour; switch overbooking on and save. (Three separate saves is the structural minimum here; a single save would make it 7.)
**Alternate paths**:
- Users › doctor row › `Working Hours` → dialog "Availability: Dr. {name}" — the same component for any doctor (OWNER/ADMIN; lets them also remove clinic holidays from the list).
- Users › `Clinic Holidays` → dialog "Clinic Holidays" — clinic-wide closures for all doctors (admin side; reports-admin topic).

#### Steps
1. Click the cog in the header (aria-label "Open settings") → dialog "My Settings"; scroll past `Doctor signature` and `Prescription letterhead` to "Weekly working hours (IST)". An amber note says "No hours set yet; the clinic default 09:00-18:00 applies every day. Save to set a schedule." Every day reads "Day off".
2. On the Monday row click `+ Shift` → "09:00 to 13:00" appears; change the start to `10:00`.
3. Click `+ Shift` on Monday again → "14:00 to 18:00"; change it to `17:00`–`20:00`.
4. Click `Copy Monday to Tue–Fri` → Tuesday to Friday now show the same two shifts.
5. On Saturday click `+ Shift` and edit to `10:00`–`14:00`. Leave Sunday as "Day off".
6. Click `Save hours` → "Saving…" then status text "Working hours saved."; the amber note disappears.
7. In the "Overbooking" box ("Off keeps one patient per time slot. When on, reception must confirm each extra patient in an occupied slot.") switch on `Allow overbooking` → "Up to [2] patients per slot" appears. Keep 2 and click `Save overbooking` → "Saved: up to 2 patients per slot."
8. In "Leave and blocked time" ("Appointments cannot be booked during leave, blocked time, or clinic holidays." / "No upcoming time off."): keep `Type` "Leave", set `From` 20 Nov and `To` 22 Nov, leave `All day` ticked, type `IADVL conference, Pune` in "Reason (optional)", click `Add leave` → the list shows "Leave · 20 Nov 2026 – 22 Nov 2026 (all day) · IADVL conference, Pune" with a bin icon.
9. For the errand: `Type` "Blocked time", `From`/`To` 16 Nov, untick `All day` → `Start time` 13:00 and `End time` 14:00 appear (defaults); reason `Bank work`; click `Add blocked time` → second list entry with times.
10. Click `Close` at the bottom of "My Settings". *(The neighbouring `Save` button belongs to the WhatsApp switches lower down; the three availability boxes each saved on their own.)*
11. Open `Appointments`, pick 20 Nov → red banner "Not bookable: Leave all day (IADVL conference, Pune)"; on a normal weekday the grid now runs 10:00–20:00.

#### Variations
- **Admin does it for her**: Users › `Working Hours` on her row → identical sections under the title "Availability: Dr. Shravya Reddy".
- **Hours migrated from the old setting**: the note reads "These hours come from the old working-hours setting. Save to keep them as the weekly schedule."
- **Switch overbooking off**: toggle off → `Save overbooking` → "Saved: one patient per slot."

#### Edge Cases
- **Validation on save**: "Monday: shifts overlap", "Monday: 17:00-13:00 must end after it starts", "{Day}: fill in both times", "Add at least one shift" — shown as one red line at the very bottom of the component, far from `Save hours`.
- **Leave dates reversed / zero-length**: "The end date must be on or after the start date." / "The end time must be after the start time."
- **Patients already booked on the leave days**: nothing in this form mentions or lists them *(no check found in the time-off create path)*.
- **Lunch gap between shifts is not blocked time**: booking 14:00 on a split-shift day only shows the amber "outside doctor's working hours" warning in the booking dialog; leave/blocked/holiday is the only hard stop.
- **Mobile**: the header (and so "My Settings") is hidden below the `md` breakpoint; the Users route is admin-only, so a doctor on a phone has no path.
- **Naming**: button `Working Hours` → dialog "Availability: …" → section "Weekly working hours (IST)"; "Leave and blocked time" vs "time off" (empty state, errors) vs "Clinic holiday" vs the calendar's "Not bookable".

---

### STORY-030: Connect Google Calendar so bookings sync

**Type**: short
**Topic**: Appointments, rooms & doctor availability
**Persona**: Dr. Shravya Reddy, setting up on her clinic laptop
**Goal**: Have her ClinicMS appointments appear in her Google Calendar.
**Preconditions**: Signed in as DOCTOR. The server has Google credentials configured (otherwise the controls are not rendered at all). She has a Google account.
**Ideal path**: 3 — click connect, approve at Google, land back on the calendar already syncing.
**Alternate paths**: none found — the control exists only in the "Doctor Calendar" card header on the **Calendar** tab (not on Slots, not in "My Settings").

#### Steps
1. Open `Appointments` (Calendar tab) and click `Sync with Google Calendar` at the top right of the "Doctor Calendar" card → button shows "Connecting..." and the browser leaves for Google's consent screen.
2. Choose the Google account and allow access (Google's own pages).
3. Google returns to `/dashboard/appointments/google-callback` → a centred card with a spinner and "Connecting your Google Calendar...", then a green tick, "Google Calendar connected successfully!" and "Redirecting to appointments..."; after 1.5 s the Appointments page reloads.
4. The card header now shows the Google logo with "Syncing", a green badge with her e-mail, and a `Disconnect` link; below it a green strip: "Dr. Shravya Reddy's appointments will auto-sync to Google Calendar (shravya@…)".

#### Variations
- **Disconnect**: click `Disconnect` → "Disconnecting..." → toast "Google Calendar — Disconnected successfully." No confirmation is asked.
- **Receptionist clicks the button**: it connects the *receptionist's own* Google account (the button is shown to every role). If she is connected and the selected doctor is not, an amber strip says "Dr. …'s Google Calendar is not connected. Appointments won't sync to their calendar. Ask the doctor to log in and connect their own Google Calendar."

#### Edge Cases
- **Access denied at Google**: red cross, "You denied access to Google Calendar.", "Redirecting back..." (3 s).
- **No code in the return URL**: "No authorization code received from Google." (3 s).
- **Exchange fails**: the server message or "Failed to connect Google Calendar." (4 s), then back to Appointments with the button unchanged.
- **Could not start**: destructive toast "Google Calendar — Failed to start Google connect".
- **Naming**: "Sync with Google Calendar" → "Syncing" → "connected" → "auto-sync" → `Disconnect`; and "calendar" on this page already means the tab, the card, and each of the two columns.

---

### STORY-031: Monday morning at the front desk, end to end

**Type**: long
**Topic**: Appointments, rooms & doctor availability
**Persona**: Riya, receptionist, Monday 9:00–11:30 rush, one screen, phone ringing
**Goal**: Get Dr. Shravya's day into shape: clear the Scheduled column, handle a move, register and book a walk-in, take a phone booking for a laser session with a room, squeeze in an urgent patient, check the room, and hand patients on to the doctor and to billing.
**Preconditions**: Signed in as RECEPTION. Today's Scheduled column holds Meenakshi Iyer 10:00, Farhan Qureshi 10:30, Sunita Deshpande 11:00; Kavya Nair is Confirmed at 11:30. Dr. Shravya allows 2 patients per slot. Rooms "Consultation Room 1" and "Laser Room 1" (type Procedure) are active.
**Ideal path**: 21 — confirm (2), move to another day (3), register + book walk-in (5), phone booking with procedure and room (6), overbook (3), start-of-visit and billing hand-offs (2). The room check should not need a separate page.
**Alternate paths**:
- Every booking step can be done on the **Slots** tab instead of **Calendar**.
- Walk-in: Patients › `New Patient` with `Patient Type` "Walk-in" (auto-books the next free Confirmed slot).
- Room check: the room cards inside "Book Appointment" already show Available / Occupied for the chosen time; the Rooms page is the only whole-day view.
- Returning to Appointments: sidebar, Dashboard `View All Appointments`, notification bell items.

#### Steps
1. Click `Appointments` in the sidebar → Calendar tab, today, `Doctor` already "Shravya Reddy".
2. Read the column headers → Scheduled "3 patients to confirm", Confirmed "1 patient confirmed".
3. Click Meenakshi Iyer's 10:00 tile in Scheduled → "Appointment Details"; call the number shown.
4. She is coming: click `Confirm` → toast "Appointment confirmed — Meenakshi Iyer is now at 10:00-10:30 in Confirmed."; the tile moves right.
5. Click Farhan Qureshi's 10:30 tile → details; call. He asks for Wednesday evening instead.
6. Click `Reschedule` in the dialog → dialog closes; amber banner "Rescheduling Farhan Qureshi — Click a free time in either calendar. To move to another day, change the date first."
7. Scroll up and change `Date` to Wednesday → grid reloads; banner now says "…to move this appointment from {Monday} to {Wednesday}."
8. Scroll down and click the 17:30 tile in **Scheduled** → toast "Appointment rescheduled — Farhan Qureshi is now on {Wednesday} at 17:30-18:00 in Scheduled."
9. Change `Date` back to today (it does not return by itself).
10. Click Sunita Deshpande's 11:00 tile → details; call twice, no answer. Click `Close` → she stays in Scheduled; there is nowhere to note the attempt. *Riya writes it on paper.*
11. Arjun Rao walks up, new patient. Type `Arjun Rao` in `Patient` → "Add New Patient" pops open by itself with First Name "Arjun", Last Name "Rao".
12. Enter `Age (years)` 24.
13. Change `Gender *` from "Other" to "Male".
14. Type `9000456789` in `Phone *`.
15. Click `Create Patient` → toast "Patient created — Arjun Rao has been added"; badge "Selected: Arjun Rao — 9000456789".
16. Click the free 10:30 tile in **Confirmed** (the time Farhan just vacated in the other column) → "Book Appointment".
17. Click `Confirm Booking` → banner "Appointment Successfully Booked! Arjun Rao scheduled for 10:30-11:00 in the Confirmed calendar (OPD)"; Arjun gets the next token.
18. Phone rings: Pooja Malhotra wants laser hair removal on Thursday at 16:00. Click `Clear` beside the "Selected: Arjun Rao" badge (otherwise the next click books Arjun again).
19. Type `Pooja` and click "Pooja Malhotra — 9949077665" → badge updates.
20. Change `Date` to Thursday.
21. Click the 16:00 tile in **Scheduled** → "Book Appointment" ("Time Slot: 16:00-16:30").
22. Set `Duration` to "60 minutes" → "Time Slot: 16:00-17:00".
23. Set `Appointment Type *` to "Procedure" → `Procedure Name` field and required room cards appear; `Confirm Booking` greys out.
24. Type `Laser Hair Removal - underarms` in `Procedure Name`.
25. Click the "Laser Room 1" card ("✓ Available for 16:00-17:00").
26. Click `Confirm Booking` → banner "… scheduled for 16:00-17:00 in the Scheduled calendar in Laser Room 1 (PROCEDURE)".
27. Change `Date` back to today.
28. Dr. Shravya calls out: fit Imran Sheikh in at 11:30 with Kavya. Click `Clear`, type `Imran`, click "Imran Sheikh — 9885011223".
29. In **Confirmed** at 11:30 click the free half of the row next to Kavya's block (tag "Overbook 1/2") → "Book Appointment".
30. Click `Confirm Booking` → second dialog "Overbook this slot?" — "This slot already has 1 patient. Book anyway? (2 of 2 allowed)".
31. Click `Book anyway` → banner; Kavya and Imran share the 11:30 row.
32. Pooja calls back asking which room; Riya wants the whole-day view. Click `Rooms` in the sidebar → "Room Calendar & Occupancy", today.
33. Click the right chevron three times to reach Thursday; hover the block in the "Laser Room 1" column → hover card "Pooja Malhotra … 16:00-17:00 … Type PROCEDURE … Notes: Laser Hair Removal - underarms … Room: Laser Room 1 (Procedure)".
34. Click `Appointments` in the sidebar → back on today with the doctor remembered; the patient selection and any filters are gone.
35. Arjun is called in. Riya has no check-in action; the doctor clicks `START` on his tile from her own screen → **hand-off to the visit stories** (the tile later shows "In progress" / "Completed" and turns grey-blue).
36. When Arjun returns to the desk, click the amber "Not billed" chip on his tile → dialog "Bill for Arjun Rao" → **hand-off to the consultation-billing stories.**

#### Variations
- **Use `RESCHED` on hover** in step 6 instead of opening details (saves one click on wide tiles).
- **Filter the day**: `Visit Type` "Procedure" or `Room` "Laser Room 1 (Procedure)" narrows the grid ("Filters Active: …"); useful before step 32 but limited to one doctor and one day.
- **Change the row height**: `Grid` 10/15/20/30/45/60 minutes; a click still books from the first free 15-minute start in that row.
- **Second doctor**: switching `Doctor` reloads the grid and silently drops an in-progress reschedule.

#### Edge Cases
- **Date ping-pong**: steps 7→9, 20→27 and 33 each need manual date changes; the Appointments date picker and the Rooms chevrons are separate and do not follow each other.
- **Scrolling**: the patient search, `Date` and the banner sit above the Legend; the grid is below it, so most bookings involve a scroll down and, for cross-day work, back up.
- **Stale selection**: after any booking the previous patient remains selected (steps 18 and 28 exist only to undo that).
- **Cross-column blind spot**: Arjun at 10:30 in Confirmed would not have conflicted with Farhan at 10:30 in Scheduled even if Farhan had stayed.
- **Leave day chosen by mistake**: the red "Not bookable: …" banner shows on the page, but the tile still opens the dialog, where `Confirm Booking` is disabled by "Cannot book …".
- **Same day, four renderings**: today's appointments appear on the Dashboard card, this grid, the Rooms calendar and the notification bell, each with different detail and none linking to a specific appointment.

---

### Consultation billing & fee list

Source: `topics/clinic-billing-fees.md`

### STORY-032: Collect a first-consultation fee in cash from the calendar row

**Type**: short
**Topic**: Consultation billing & fee list
**Persona**: Riya Thomas, receptionist (RECEPTION), Friday 10 am rush with four patients at the desk
**Goal**: Bill a new patient the standard first-consultation fee and record the cash she has just been handed
**Preconditions**: Signed in as RECEPTION with default grants. `/dashboard/appointments` is open on today for Dr. Praveen Reddy, Calendar tab. The fee list has First consultation = ₹700. Kavya Reddy (new patient, 98480 12345) has a 10:15-10:30 appointment in the "Confirmed" column; her row shows the word "First" and the chip "Not billed".
**Ideal path**: 2 — click the row's bill chip, confirm the prefilled bill-and-payment. Everything else (patient, bill type, fee, full amount, Cash) is already known.
**Alternate paths**:
- Click the patient's name on the row (or the hover button `INFO`) → dialog "Appointment Details" → `Create bill` next to "Bill: Not billed" → same bill dialog (one extra click; the details dialog closes itself).
- Appointments › **Slots** tab renders the same day calendar (`DoctorDayCalendar`) beneath its own filters, so the same chip and dialog are reachable there.
- No other route creates a clinic bill. The Patients progress tracker `Bill` button and `/dashboard/billing` look like alternates but open the **pharmacy** bill (see STORY-039).

#### Steps
1. Click the chip "Not billed" at the right end of Kavya Reddy's row (tooltip and screen-reader label "First consultation bill: not billed yet") → dialog "Bill for Kavya Reddy" opens with the description "First consultation · 13 Nov 2026 · 10:15-10:30". Because there is no bill yet, a section "Create bill" is shown with `Bill line` = "First consultation", `Fee` = "700", `Paid now` = "700", the line "From fee list: First consultation ₹700", a "Payment mode" radio group (`Cash` selected, `UPI`, `Card`, `Net banking / NEFT`, `Cheque`) and the note "Consultation and procedure fees are billed without GST."
2. Check the amount against the notes in her hand, then click `Create bill and record ₹700` → the button reads "Saving…", then a toast "Bill INV-20261113-004 created and ₹700 Cash recorded". The dialog stays open; once the calendar has reloaded it shows a card "INV-20261113-004" with a green "Paid" badge, the line "First consultation ₹700", Total ₹700 / Received ₹700 / Due ₹0, the payment line "₹700 Cash · 13 Nov 2026, 10:17 am", and a link-style button `Add another bill`.
3. Close the dialog (X or Esc) → the row's chip now reads "₹700 · Paid" in green.

#### Variations
- **Pays by UPI or card**: one more click on `UPI` / `Card` before step 2; the toast names the mode ("… ₹700 UPI recorded").
- **Bill now, pay later**: clear `Paid now` (or type 0) → the payment-mode radios disappear and the button reads `Create bill`; the chip becomes "₹700 due" in amber with an alert icon.
- **Review patient**: the row says "Review", `Bill line` is "Review consultation" and the fee comes from the Review row of the fee list. The bill type is decided by the server: Procedure appointment → Procedure; otherwise First consultation when the patient has no earlier visit in the branch, else Review (`backend/src/modules/appointments/appointment-billing.ts`). The desk cannot change the bill type, only the line text and the amount.
- **Doctor or owner at the desk**: OWNER, ADMIN and DOCTOR get exactly the same dialog (they pass every role gate).
- **Narrow rows / phone**: the chip shortens to "Paid" / "₹700 due", and at phone width to "₹✓" / "₹!".

#### Edge Cases
- **Permission removed**: a RECEPTION user whose `billing:invoice:create` grant was removed (Users › "Role & Permissions") still sees the chip; the details-dialog button reads `View bill` and the bill dialog says "Not billed yet. The front desk creates the bill." — addressed to the front desk itself.
- **Roles with no billing read (NURSE, MANAGER)**: no chip on the row and no "Bill:" line in "Appointment Details".
- **Finished visit with no bill**: the chip stays "Not billed" but turns amber with an alert icon; label "… not billed yet, visit finished". At phone width an ordinary unbilled row has an empty chip (no text) *(inferred from `billingChip`)*.
- **Server refuses the bill**: red text "{reason} Nothing was saved." under the form; the typed values stay.
- **Bill saved but payment refused**: "Bill INV-… was created, but the payment was not recorded: {reason}" — the bill exists with the full amount due and the desk must use "Record payment".
- **Double click window**: after the save the form is briefly shown again with its defaults until the new bill loads; `createInvoice` sends no idempotency key, so a second click there would raise a second bill that cannot be cancelled *(inferred)*.
- **Loading failure when reopening**: "Could not load the bill: {reason}" with `Retry`.
- The dialog cannot be dismissed while a save is in flight.

---

### STORY-033: Procedure bill with part payment by UPI now and the balance by card later

**Type**: medium
**Topic**: Consultation billing & fee list
**Persona**: Farhan Qureshi, receptionist (RECEPTION), evening procedure slots
**Goal**: Bill a chemical peel at the price the doctor quoted, take an advance, and clear the balance when the patient comes out
**Preconditions**: Signed in as RECEPTION. Appointments › Calendar on today for Dr. Praveen Reddy. Meenakshi Iyer (99490 55521) has a 17:00-17:30 **Procedure** appointment with Procedure Name "Chemical peel". The fee list has no Procedure fee. Chip reads "Not billed".
**Ideal path**: 7 — open the bill, type the fee, type the advance, pick UPI, save; later open the bill, pick Card, save. (Fee, advance and two modes are information only the desk has.)
**Alternate paths**:
- Row chip → bill dialog directly (skips the details dialog used below).
- The balance can also be reached from "Appointment Details" → `Open bill`.
- Slots tab shows the same calendar rows.
- none found outside the appointment calendar: there is no bills list, no patient-page entry and no "dues" screen for clinic bills.

#### Steps
1. Click Meenakshi Iyer's name on her row → dialog "Appointment Details" listing Date, Slot, Calendar, Patient, Phone, "Bill type: Procedure", "Bill: Not billed" with a button `Create bill`, Type badge "PROCEDURE", "Procedure: Chemical peel".
2. Click `Create bill` → the details dialog closes and "Bill for Meenakshi Iyer" opens ("Procedure · 13 Nov 2026 · 17:00-17:30"). `Bill line` = "Procedure: Chemical peel"; `Fee` is empty with the placeholder "Type the fee"; `Paid now` is empty with the placeholder "0"; the hint reads "No fee set for Procedure." (no `Set fees` link for a receptionist); the button `Create bill` is disabled.
3. Farhan hesitates — he does not know the price. He asks the doctor, then types `3500` in `Fee` → `Paid now` fills in "3500" by itself, the payment-mode radios appear, and the button becomes `Create bill and record ₹3,500`.
4. Meenakshi says she will pay ₹2,000 now and the rest after the peel. Overwrite `Paid now` with `2000` → button reads `Create bill and record ₹2,000`.
5. Click `UPI` in "Payment mode" → UPI is highlighted (no reference box appears for UPI).
6. Click `Create bill and record ₹2,000` → toast "Bill INV-20261113-011 created and ₹2,000 UPI recorded". The dialog now shows the bill card with an amber "Due ₹1,500" badge, Total ₹3,500 / Received ₹2,000 / Due ₹1,500, the payment line "₹2,000 UPI · 13 Nov 2026, 05:02 pm", and below it a section "Record payment" with `Amount received` = "1500" and the mode back on `Cash`.
7. Close the dialog → the chip reads "₹1,500 due" in amber with an alert icon (on a wide row "₹3,500 · ₹1,500 due").
8. Forty minutes later Meenakshi returns to the desk. Click the "₹1,500 due" chip → "Bill for Meenakshi Iyer" shows "Loading the bill…", then the bill card and "Record payment" with `Amount received` = "1500".
9. Click `Card` → Card is highlighted.
10. Click `Record ₹1,500 payment` → toast "₹1,500 Card recorded on INV-20261113-011"; the badge turns to "Paid"; two payment lines are listed (UPI and Card); the "Record payment" section disappears.
11. Close the dialog → chip reads "₹3,500 · Paid".

#### Variations
- **Split at the same moment (₹2,000 UPI + ₹1,500 cash)**: there is no split row. The desk does steps 3–6 with the first mode, then immediately uses "Record payment" for the second — two saves, two toasts, one bill.
- **Balance paid in two instalments**: change `Amount received` to a smaller figure (button `Record ₹500 payment`); the section stays with the new balance prefilled.
- **Balance paid on a later day**: the appointment is on a past date, so the desk must change the `Date` picker (and possibly the `Doctor` select) back to the appointment's day to find the row — the only way to reach an old bill.
- **Procedure fee set in the fee list**: `Fee` and `Paid now` are prefilled and the hint reads "From fee list: Procedure ₹…".

#### Edge Cases
- **Over-payment**: typing more than the due amount shows "Enter an amount above 0 and up to the ₹1,500 due." and disables the button; the server also refuses with "Only ₹1,500 is due on bill INV-…, so ₹2,000 cannot be recorded."
- **Paid now above the fee**: "Paid now can be from 0 up to the fee."
- **Fee typed as text or 0**: "Enter the fee as an amount above 0, for example 500." ("1,200.50" and "₹ 500" are accepted; three decimals are not.)
- **Two desks take the same balance**: the second save fails with "Bill INV-… is already paid in full, so ₹1,500 cannot be recorded. Nothing was saved." and the calendar row reloads.
- **Wrong mode recorded**: there is no way to correct a payment's mode afterwards (see STORY-037).
- **Mode resets**: after every successful save the mode returns to `Cash`; a desk taking several UPI payments must re-select UPI each time.

---

### STORY-034: Charge less than the fee list, change her mind, and record a bank transfer with its UTR

**Type**: medium
**Topic**: Consultation billing & fee list
**Persona**: Riya Thomas, receptionist (RECEPTION), mid-afternoon lull
**Goal**: Bill a review visit at the amount the doctor asked for and note the bank reference of the transfer
**Preconditions**: Signed in as RECEPTION. Fee list: Review = ₹500. Suresh Babu (returning patient, 90000 41872) has a 15:30-15:45 appointment; his row shows "Review" and "Not billed". The doctor has said "charge him ₹300 today".
**Ideal path**: 5 — open the bill, change the fee, pick the mode, type the reference, save.
**Alternate paths**:
- "Appointment Details" → `Create bill` instead of the chip.
- Slots tab calendar.
- none found for giving a concession any other way: there is no discount field, discount reason or approval on a clinic bill (the API accepts `discount` / `discountReason`, the dialog always sends `discount: 0`).

#### Steps
1. Click the "Not billed" chip on Suresh Babu's row → "Bill for Suresh Babu" ("Review · 13 Nov 2026 · 15:30-15:45") with `Bill line` "Review consultation", `Fee` "500", `Paid now` "500", "From fee list: Review ₹500", `Cash` selected.
2. Replace `Fee` with `30o` (slip of the finger) → red text "Enter the fee as an amount above 0, for example 500." and, because `Paid now` mirrors the fee, a second line "Paid now can be from 0 up to the fee."; the save button is disabled.
3. Correct `Fee` to `300` → the hint changes to "Fee list: Review ₹500, changed for this bill." followed by a link-style button `Use ₹500`; `Paid now` follows to "300"; the button reads `Create bill and record ₹300`.
4. Riya wonders whether the lower price needs a reason and looks for a discount or remarks field → there is none; the only free text is `Bill line`. She edits `Bill line` to "Review consultation (concession by Dr. Praveen)".
5. Suresh shows a NEFT confirmation on his phone. Click `Net banking / NEFT` → a field "Bank reference / UTR (optional)" appears under the radios.
6. Type `HDFCN52026111398765` in "Bank reference / UTR (optional)".
7. Click `Create bill and record ₹300` → toast "Bill INV-20261113-009 created and ₹300 Net banking / NEFT recorded"; the bill card shows "Paid" and the payment line "₹300 Net banking / NEFT · HDFCN52026111398765 · 13 Nov 2026, 03:34 pm".
8. Close the dialog → chip "₹300 · Paid".

#### Variations
- **Changes her mind about the concession**: before saving, click `Use ₹500` → `Fee` returns to 500, the hint returns to "From fee list: Review ₹500" (and `Paid now` follows as long as it was not typed into).
- **Cheque**: click `Cheque` → field "Cheque number (optional)". Cash, UPI and Card ask for no reference.
- **Reference left empty**: allowed; the payment line then shows only mode and time.
- **Charging more than the list** (e.g. long consultation ₹800): identical flow; the dialog treats any difference from the list the same way.

#### Edge Cases
- **Reference carries across modes**: the reference text is one shared box — typing a cheque number, then switching to `Net banking / NEFT`, shows the same text relabelled "Bank reference / UTR". Switching to Cash/UPI/Card hides the box and the text is not sent.
- **Paid now typed first**: once `Paid now` has been typed into it no longer follows `Fee`; lowering the fee below it shows "Paid now can be from 0 up to the fee."
- **Empty bill line**: the save button is disabled with no message explaining why.
- **Concession is invisible afterwards**: the saved bill shows only the line text and ₹300; neither the bill, the chip nor Daily Collection shows that the list fee was ₹500.
- **Fee list changed meanwhile**: the fee shown is the one loaded with the calendar; a fee an admin changed since is picked up only when the day's schedule reloads *(inferred from `appointments.service.ts` returning `fee` with the schedule)*.

---

### STORY-035: Add a second bill to the same appointment for an add-on procedure

**Type**: medium
**Topic**: Consultation billing & fee list
**Persona**: Riya Thomas, receptionist (RECEPTION), late morning
**Goal**: Charge an injection the doctor gave during a review visit that was already billed and paid
**Preconditions**: Signed in as RECEPTION. Arjun Menon (97011 66230) has an 11:15-11:30 Review appointment; bill INV-20261113-006 for ₹500 is paid in cash; chip "₹500 · Paid". The doctor has sent a note: "intralesional steroid injection ₹1,200".
**Ideal path**: 5 — open the bill, add a line with its name and amount, pick the mode, save. (A well-designed bill would let the desk add a line to the existing bill rather than raise a second document.)
**Alternate paths**:
- "Appointment Details" → `Open bill` → same dialog.
- Slots tab calendar.
- none found for adding a line to an existing bill — a clinic bill created here always has exactly one line and cannot be edited, so "another bill" is the only route.

#### Steps
1. Click the "₹500 · Paid" chip on Arjun Menon's row → "Bill for Arjun Menon" shows "Loading the bill…", then the card INV-20261113-006 with "Paid", "Review consultation ₹500", Total / Received / Due, "₹500 Cash · 13 Nov 2026, 11:16 am", and the button `Add another bill`.
2. Click `Add another bill` → a section "Add another bill" opens with `Bill line` = "Review consultation", `Fee` = "500", `Paid now` = "500", "From fee list: Review ₹500", `Cash` selected, and buttons `Cancel` and `Create bill and record ₹500`. The form is prefilled exactly as for a first bill — a quick click here would bill the review a second time.
3. Replace `Bill line` with "Intralesional steroid injection".
4. Replace `Fee` with `1200` → hint "Fee list: Review ₹500, changed for this bill." with `Use ₹500`; `Paid now` follows to "1200".
5. Arjun has ₹1,000 in cash and will send ₹200 by UPI. Overwrite `Paid now` with `1000` → button `Create bill and record ₹1,000`.
6. Click `Create bill and record ₹1,000` → toast "Bill INV-20261113-010 created and ₹1,000 Cash recorded". The dialog now starts with the summary line "2 bills · ₹1,700 · Due ₹200", lists both bill cards (the new one with an amber "Due ₹200"), and shows "Record payment" with `Amount received` = "200".
7. Click `UPI`.
8. Click `Record ₹200 payment` → toast "₹200 UPI recorded on INV-20261113-010"; the summary reads "2 bills · ₹1,700 · Paid".
9. Close the dialog → chip "₹1,700 · Paid" (on a wide row "₹1,700 · Paid · 2 bills").

#### Variations
- **Changes her mind**: `Cancel` in the "Add another bill" section closes the form and brings back "Record payment" (which is hidden while adding).
- **Both bills have something due**: "Record payment" shows a radio group "Bill to pay" with one button per bill ("INV-20261113-006 · Due ₹300", "INV-20261113-010 · Due ₹200"); the first is preselected. One payment cannot be spread over two bills — the desk records two payments.
- **Procedure decided before the consult is billed**: the desk still raises two bills; the create form has a single line.

#### Edge Cases
- **Bill type label does not follow the second bill**: the row keeps the word "Review" and the dialog description stays "Review · …" although the second bill is for a procedure; the fee hint keeps comparing against the Review fee.
- **Duplicate by habit**: nothing warns that an identical "Review consultation ₹500" bill already exists on the appointment.
- **Chip arithmetic**: with part payment across two bills the wide chip reads "₹1,700 · ₹200 due · 2 bills"; the desk-width chip only "₹200 due".
- **Patient pays ₹500 against two ₹300 dues**: the amount box refuses anything above the selected bill's due ("Enter an amount above 0 and up to the ₹300 due.").

---

### STORY-036: Set and maintain the clinic fee list

**Type**: short
**Topic**: Consultation billing & fee list
**Persona**: Anil Varma, clinic administrator (ADMIN), before the clinic opens
**Goal**: Put in the standard consultation fees so the desk stops typing them, and raise the review fee
**Preconditions**: Signed in as ADMIN (or OWNER). No fees saved yet.
**Ideal path**: 4 — open the fee list, type two amounts, save once. (The page saves each row separately, so it takes one save per fee.)
**Alternate paths**:
- From a bill: the `Set fees` link in the "Create bill" form — shown only when the bill type has **no** fee and the user may edit fees (OWNER/ADMIN); it navigates away from the calendar.
- Direct URL `/dashboard/fees`.
- none found otherwise (no entry from Users, Reports or the Appointments page header).

#### Steps
1. Click "Fee list" in the sidebar's Admin section → page "Fee list" with the description "Create bill on the appointments calendar starts from these fees, billed without GST. The desk can still change the amount on a bill. Changing a fee here never changes a bill already made." After "Loading the fee list…" three rows appear: "First consultation — A patient's first visit in this branch", "Review — A patient who has visited before", "Procedure — A procedure appointment", each with the status "No fee set yet", a ₹ box with the placeholder "Not set", and a disabled `Save`.
2. Type `700` in the First consultation box → its `Save` becomes enabled.
3. Click `Save` (or press Enter) → "Saving…", toast "First consultation fee saved: ₹700"; the row's status becomes "₹700 · changed 13 Nov 2026, 08:42 am by Anil Varma".
4. Type `500` in the Review box.
5. Click that row's `Save` → toast "Review fee saved: ₹500". The Procedure row is left at "No fee set yet" because procedure prices vary.

#### Variations
- **Raise a fee later**: overwrite 500 with 600 and `Save`; the status line shows the new amount, time and name. Bills already made keep their amounts.
- **Clear a fee**: empty the box → the button label changes to `Clear fee`; click it → toast "Review fee cleared", status "No fee · cleared {date time} by Anil Varma". The desk then sees "No fee set for Review." in Create bill.
- **Check the result**: open Appointments and click an unbilled row's chip → "From fee list: Review ₹600". There is no preview on the fee page itself.

#### Edge Cases
- **Someone else saved first**: red text "{Name} set the Review fee to ₹550 while you were editing. Check it and save again. Your ₹600 is still in the box." — the status line shows their fee; a second `Save` then goes through.
- **Bad amount**: "Enter an amount above 0 and up to ₹10,00,000, for example 500."; `Save` stays disabled.
- **Not an admin**: a DOCTOR, RECEPTION or MANAGER who opens `/dashboard/fees` (no sidebar entry for them) sees a lock icon with "Only an admin can change the fee list." and "Create bill on the appointments calendar shows the fee for each appointment." A DOCTOR can create bills and override the fee on each one, yet cannot see or change the list.
- **Load failure**: "Could not load the fee list: {reason}" with `Retry`. Save failure: "{reason} Nothing was saved."
- **Only three rows exist**: one fee per bill type for the branch. There is no per-doctor fee, no per-procedure price (chemical peel vs laser), no follow-up-within-N-days rule and no effective date.

---

### STORY-037: A wrong bill, a refund and a receipt — the three things the desk cannot do

**Type**: medium
**Topic**: Consultation billing & fee list
**Persona**: Riya Thomas, receptionist (RECEPTION), with an impatient patient at the counter
**Goal**: Correct a bill raised for ₹7,000 instead of ₹700, hand back the excess, and give the patient a printed receipt
**Preconditions**: Signed in as RECEPTION. Ten minutes ago Riya created INV-20261113-013 for Lakshmi Devi (93910 20477) with `Fee` 7000 and `Paid now` 7000 in Cash (an extra zero; the patient actually paid ₹700). Chip reads "₹7,000 · Paid".
**Ideal path**: 4 — open the bill, correct the amount (or void and re-raise) with a reason, confirm, print the receipt.
**Alternate paths**: none found — no screen in `frontend/src` calls the bill update, cancel or refund endpoints, and no component prints a clinic bill. (`components/billing/BillingManagement.tsx` contains such features but is not mounted on any route.)

#### Steps
1. Click the "₹7,000 · Paid" chip on Lakshmi Devi's row → "Bill for Lakshmi Devi" shows the card INV-20261113-013 with "Paid", "First consultation ₹7,000", Total ₹7,000 / Received ₹7,000 / Due ₹0, "₹7,000 Cash · 13 Nov 2026, 12:05 pm".
2. Look for a way to edit the amount → the card is read-only text; the only control in the dialog is `Add another bill`. There is no Edit, no menu on the bill number, no pencil icon.
3. Look for a way to cancel the bill or refund ₹6,300 → no such control. (The dialog can *display* a line "Refund ₹… Cash" if a refund exists, but nothing in the UI creates one.)
4. Riya tries the only thing available: click `Add another bill`, hoping to enter a negative correcting line → form opens prefilled "First consultation", `Fee` 700.
5. Type `-6300` in `Fee` → "Enter the fee as an amount above 0, for example 500." (and "Paid now can be from 0 up to the fee.", since `Paid now` mirrors it); the button is disabled.
6. Click `Cancel` → back to the read-only bill. The record cannot be corrected from the app.
7. Lakshmi asks for a receipt for the ₹700 she paid. Look for Print / Download / WhatsApp on the dialog → none. The browser's own print (Ctrl+P) prints the calendar page with the dialog over it, showing the wrong ₹7,000.
8. Close the dialog. Riya writes a paper receipt and a note for the administrator. The chip keeps saying "₹7,000 · Paid", and tonight's Daily Collection will show Cash ₹6,300 higher than the drawer (see STORY-038), with no cancelled or corrected marker on the bill.

#### Variations
- **Under-billed instead of over-billed** (₹70 instead of ₹700): workable — `Add another bill` for the missing ₹630 with a line such as "First consultation (balance)"; the appointment then carries two bills.
- **Wrong payment mode** (Cash recorded, patient paid by UPI): not correctable; Daily Collection will show the amount under Cash.
- **Billed on the wrong appointment/patient**: not correctable; the bill stays on that row.
- **Administrator tries**: OWNER and ADMIN see the identical dialog — no extra controls. The server would accept `PATCH /billing/invoices/:id` and `POST /billing/refunds` from them, but only through the API; `DELETE /billing/invoices/:id` always fails with "Invoice cancellation is not supported in the current schema".

#### Edge Cases
- **Unpaid wrong bill**: a bill raised in error with nothing paid stays as "₹… due" on the row for ever and counts in "Clinic still due" for its day.
- **Appointment cancelled after billing**: nothing links cancelling the appointment to its bill *(inferred — no bill handling found in the cancel flow of `DoctorDayCalendar.tsx`)*.
- **Refund rows from elsewhere**: if a refund is ever posted through the API it appears as "Refund ₹6,300 Cash · {time}" in the payments list and under "Refunds" in Daily Collection, and the bill's badge goes back to "Due ₹6,300" because a refund raises the balance — the bill total itself does not change.
- **Receipt wording**: the pharmacy bill has `Print`, `Download PDF` and `Send on WhatsApp`; the clinic bill has none, so a patient who buys medicines and pays a consultation fee gets a printed bill for only one of them.

---

### STORY-038: End-of-day check of consultation takings in Daily Collection

**Type**: medium
**Topic**: Consultation billing & fee list
**Persona**: Dr. Lalitha Rao, owner and dermatologist (OWNER), 8:30 pm after the last patient
**Goal**: See what the front desk collected today for consultations and procedures, by mode, and compare it with the cash envelope and the pharmacy's figures
**Preconditions**: Signed in as OWNER. Today's clinic bills: seven bills totalling ₹9,400, of which ₹8,900 received (Cash ₹2,900, UPI ₹3,000, Card ₹3,000) and ₹500 still due; one ₹300 balance from yesterday's bill was paid today by UPI (so UPI received today is ₹3,300 and clinic received ₹9,200). The pharmacist has already saved the pharmacy count.
**Ideal path**: 2 — open Daily Collection, read the clinic block. (A count box for the clinic cash would add one entry and one save.)
**Alternate paths**:
- Sidebar › Overview › "Daily Collection" (used below).
- Sidebar › Pharmacy › "Pharmacy Report" → landing page "Common reports" card "Daily Collection", or the left rail under "Accounting Reports".
- Pharmacy Report search box ("Search reports, e.g. GSTR"): typing "collection", "consultation" or "clinic" finds it.
- Overlapping figures on another surface: `/dashboard/reports` › Revenue Report / Payment Analytics are built from the same clinic payments (`backend/src/modules/reports/reports.service.ts`) but with different layout and no pharmacy side.
- Per-bill detail has only one route: back to Appointments, pick the doctor and date, click the row's chip.

#### Steps
1. Click "Daily Collection" in the sidebar → `/dashboard/pharmacy/reports?report=daily-collection`; breadcrumb "← Pharmacy Report / Accounting Reports", heading "Daily Collection" with an info tip, a toolbar with `Previous day`, a "Day" field showing today, a disabled `Next day`, `Print` and `Download`; then "Loading the day's collection…".
2. Read the first block, "Whole day": tiles "Whole day", "Clinic" (₹9,200) and "Pharmacy", and the table "Whole day by payment mode" with columns Payment mode / Clinic / Pharmacy / Total and rows Cash, UPI, Card.
3. Read the second block, "Clinic: consultations and procedures": tiles "Clinic received" ₹9,200, "Clinic billed today" ₹9,400, "Clinic still due" ₹500 (amber); the table "Clinic: consultations and procedures by payment mode" (Payment mode / Received / Refunds / Net) shows Cash ₹2,900, UPI ₹3,300, Card ₹3,000.
4. She pauses: received (₹9,200) is not billed (₹9,400) minus due (₹500). Scroll to the table "Clinic bills" (Bill No. / Type / Entry / Patient / Amount / Received today / Paid by / Due) → eight rows; one has Type "Bill of 12/11/2026", Amount ₹0, Received today ₹300, Paid by "UPI" — yesterday's balance. One of today's rows shows Due ₹500.
5. Count the cash envelope from the front desk (₹2,900) and compare it by eye with the Cash row of the clinic table. There is nowhere to enter it: the heading "Pharmacy" follows, with the banner "Pharmacy balanced: what was counted matches what the system expected." and the table "Pharmacy reconciliation by payment mode", whose "Counted" boxes reconcile the pharmacy drawer only (the report's note says "The cash count below reconciles the pharmacy drawer only.").
6. She wants to see who owes the ₹500. The "Clinic bills" row shows the patient's name but is not a link. Click "Appointments" in the sidebar → the calendar opens on the doctor and date last used.
7. Find the amber "₹500 due" chip on the row and click it → "Bill for {patient}" with the bill, its payments and "Record payment".
8. Close the dialog; nothing to record tonight.

#### Variations
- **Look at an earlier day**: `Previous day` (or pick a date in "Day") reloads at once; a `Today` button appears; the address bar keeps the day.
- **Paper copy for the accountant**: `Print` opens the report's PDF in the print dialog; `Download` offers "Excel (.xlsx)", "CSV", "PDF". The file carries the clinic sections as well.
- **Pharmacy not counted yet**: amber banner "Pharmacy not counted yet. Count the pharmacy cash drawer and check its UPI and card settlements, then enter them below."; OWNER, ADMIN, MANAGER, DOCTOR and PHARMACIST can type "Counted" amounts, an optional "Note (optional)" and click `Save count` (later `Save recount`).
- **A day with a bank transfer or cheque**: extra rows "Net banking / NEFT" / "Cheque" appear in the clinic and whole-day tables (the clinic stores `NET_BANKING`, the pharmacy `NETBANKING`; the report merges them).

#### Edge Cases
- **Accountant or pharmacist opens the same page**: ACCOUNTANT, PHARMACIST and MANAGER have the sidebar entry but cannot read clinic bills, so the "Whole day" and "Clinic" blocks are absent and the notes say "Consultation and procedure takings are shown to the roles that can read clinic bills." The person who reconciles money cannot see the clinic's.
- **Receptionist**: the person who took the money has no "Daily Collection" entry, and the report route does not list RECEPTION, so opening the URL shows the report's error state.
- **Mistaken bill** (STORY-037): it stays in "Clinic billed today" and "Clinic received"; the difference from the envelope has to be explained on paper.
- **No bills on the day**: "Clinic bills" shows "No consultation or procedure bills were raised or paid on this day."
- **Clinic refunds**: the Refunds column exists and is subtracted in Net, but no screen creates a clinic refund, so it is ₹0 in practice.
- **Two people saving a pharmacy count**: "Someone else saved a count for this day while you were entering yours. Their count is shown below; your figures are still in the boxes. Check them and save again."

---

### STORY-039: Looking for the consultation bill and landing in the pharmacy bill ("two billing systems")

**Type**: short
**Topic**: Consultation billing & fee list
**Persona**: Naveen Goud, receptionist (RECEPTION) in his first week, started from the patient's page because the patient walked up without mentioning an appointment time
**Goal**: Take the ₹500 review fee from Ravi Kumar
**Preconditions**: Signed in as RECEPTION. Ravi Kumar (98660 77340) has an appointment today at 12:00 with Dr. Praveen Reddy, a visit in progress, and no clinic bill. Naveen has Ravi's patient page open (`/dashboard/patients/{id}`).
**Ideal path**: 2 — a "Bill" action on the patient opens today's consultation bill prefilled; confirm.
**Alternate paths**:
- The real route: sidebar › Appointments → choose doctor and date → row chip (or "Appointment Details" → `Create bill`).
- Look-alike routes that reach the **pharmacy** bill instead: patient progress tracker `Bill` / `Invoices`; `/dashboard/billing` (redirects to the Sales bill); `/dashboard/pharmacy?section=billing`; the bell notification "Overdue Invoice INV-…" (a clinic invoice, linked to the pharmacy Sales register filtered to dues).

#### Steps
1. On Ravi Kumar's page, look at the progress tracker (Start → Document → Complete → Prescribe → Billing → Follow-up). The "Billing" step is not done; beside the tracker is a button `Bill`. Click it → the browser goes to `/dashboard/pharmacy/sales/bill?patientId=…&visitId=…`: a prescription queue and the pharmacy bill builder ("Patient & Doctor Details", "Add Items to Invoice", "Invoice Summary") — a GST medicine bill, with no consultation fee anywhere.
2. Naveen hesitates, looks for "Consultation" among the items, finds only drugs and treatment packages, and realises this is the wrong bill. Click "Appointments" in the sidebar → the calendar opens on the doctor and date remembered from last time.
3. Find Ravi Kumar's 12:00 row in the "Confirmed" column and click its "Not billed" chip → "Bill for Ravi Kumar" with "Review consultation", `Fee` 500, `Paid now` 500, Cash.
4. Click `Create bill and record ₹500` → toast "Bill INV-20261113-008 created and ₹500 Cash recorded".
5. Close the dialog → chip "₹500 · Paid".

#### Variations
- **From the Patients list**: there is no bill action on a patient row at all; `Book appointment` on the detail page opens Appointments with `?patientId=` preselected for booking, not for billing.
- **Types `/dashboard/billing` in the address bar** (an obvious guess): redirected to the pharmacy Sales bill.
- **After the clinic bill exists**: back on the patient page the tracker's "Billing" step shows done and the button reads `Invoices` — and still opens a new pharmacy bill. The step is computed from **clinic** invoices (`apiClient.getInvoices({ patientId })`), the button links to the **pharmacy** builder (`PatientProgressTracker.tsx`).

#### Edge Cases
- **Wrong doctor or date remembered**: the calendar restores the last doctor/date from `localStorage`; if that is not Ravi's doctor the row is simply absent and nothing says where his appointment is.
- **Patient with no appointment today** (walked in to pay an old due): there is no way to raise or pay a clinic bill without finding an appointment row; a consultation fee cannot be billed against a patient alone from the UI.
- **Reception and the pharmacy builder**: reception has no "Sales" sidebar entry, yet the tracker button takes them into the Sales bill page *(what the page lets a receptionist do there is covered in the pharmacy-sales topic)*.
- **Naming**: the same thing is "bill" (chip, dialog, fee list), "invoice" (API, tracker button `Invoices`, alert "Overdue Invoices", notification "Overdue Invoice INV-…"), and numbered `INV-…`; the pharmacy document is also "bill", "invoice" and "sale", numbered `PHI-…`.

---

### STORY-040: A Saturday at the front desk — fee list, four bills, a balance, and the day's close

**Type**: long
**Topic**: Consultation billing & fee list
**Persona**: Sandhya Pillai, clinic administrator (ADMIN), covering the front desk on a Saturday because the receptionist is on leave
**Goal**: Bill every patient of the morning session correctly, fix the missing procedure price on the way, and close the day knowing the clinic's takings by mode
**Preconditions**: Signed in as ADMIN. Fee list: First consultation ₹700, Review ₹500, Procedure not set. Today's calendar for Dr. Praveen Reddy (Confirmed column): 10:00 Kavya Reddy (new patient), 10:15 Arjun Menon (returning), 11:00 Meenakshi Iyer (Procedure, Procedure Name "Q-switch laser"). The pharmacy has made sales today and its drawer has not been counted.
**Ideal path**: 21 — three bills at 2 actions each plus their real choices (mode ×3, part amount, changed fee: ~11), one fee-list fix without leaving the bill (2), one balance payment (3), one add-on line (4), day close: open, read, save count (3) — rounded to what a single-screen desk flow could plausibly need.
**Alternate paths**:
- Each bill can be opened from the row chip or from "Appointment Details" → `Create bill` / `Open bill`; the Slots tab shows the same calendar.
- Fee list: sidebar › Admin › "Fee list", or the `Set fees` link in a Create bill form with no fee.
- Daily Collection: sidebar › Overview › "Daily Collection", or Pharmacy Report › "Common reports" / "Accounting Reports" / report search.
- none found for raising a clinic bill outside the calendar, or for counting clinic cash.

#### Steps
1. Click "Appointments" in the sidebar → the page opens on the remembered `Doctor` (Dr. Praveen Reddy) and today's `Date`, Calendar tab, columns "Scheduled" and "Confirmed". Each row shows a bill-type word ("First", "Review", "Procedure") and a chip "Not billed".
2. Kavya Reddy arrives. Click her "Not billed" chip → "Bill for Kavya Reddy" ("First consultation · 14 Nov 2026 · 10:00-10:15") with "First consultation", `Fee` 700, `Paid now` 700, "From fee list: First consultation ₹700", `Cash` selected.
3. Kavya holds up her phone. Click `UPI`.
4. Click `Create bill and record ₹700` → toast "Bill INV-20261114-001 created and ₹700 UPI recorded"; the bill card shows "Paid".
5. Close the dialog → chip "₹700 · Paid".
6. Arjun Menon checks in. Click his chip → "Bill for Arjun Menon" with "Review consultation", `Fee` 500, `Paid now` 500.
7. Arjun has only ₹200 on him and will pay the rest after seeing the doctor. Overwrite `Paid now` with `200` → button `Create bill and record ₹200`.
8. Click `Create bill and record ₹200` (Cash) → toast "Bill INV-20261114-002 created and ₹200 Cash recorded"; the card shows an amber "Due ₹300"; "Record payment" appears with `Amount received` 300.
9. Close the dialog → chip "₹300 due" in amber with an alert icon.
10. Meenakshi Iyer arrives for her laser session. Sandhya wants to check the procedure name first: click Meenakshi's name on the row → "Appointment Details" with "Bill type: Procedure", "Bill: Not billed" + `Create bill`, "Procedure: Q-switch laser".
11. Click `Create bill` → "Bill for Meenakshi Iyer" with `Bill line` "Procedure: Q-switch laser", an empty `Fee` ("Type the fee"), and the hint "No fee set for Procedure." followed by a link `Set fees` (she is an admin).
12. She decides the clinic should have a standard price rather than asking the doctor each time. Click `Set fees` → the browser leaves the calendar for `/dashboard/fees`; the bill dialog is gone and nothing was saved.
13. In the "Procedure" row type `2500`.
14. Click that row's `Save` → toast "Procedure fee saved: ₹2,500"; status "₹2,500 · changed 14 Nov 2026, 10:58 am by Sandhya Pillai".
15. Click "Appointments" in the sidebar → the calendar reloads on the same doctor and date. There is no "back to the bill" link; she finds Meenakshi's row again.
16. Click Meenakshi's "Not billed" chip → the form now shows `Fee` 2500, `Paid now` 2500, "From fee list: Procedure ₹2,500".
17. The doctor calls out that today's session covered two areas — ₹3,000. Replace `Fee` with `3000` → hint "Fee list: Procedure ₹2,500, changed for this bill." with `Use ₹2,500`; `Paid now` follows to 3000.
18. Meenakshi pays by card. Click `Card`.
19. Click `Create bill and record ₹3,000` → toast "Bill INV-20261114-003 created and ₹3,000 Card recorded"; card shows "Paid".
20. Close the dialog → chip "₹3,000 · Paid".
21. Arjun comes out of the consulting room; the doctor gave an intralesional injection (₹1,200). Click Arjun's "₹300 due" chip → "Loading the bill…", then INV-20261114-002 with "Due ₹300" and "Record payment" (`Amount received` 300, mode `Cash`).
22. He will pay everything by UPI. Click `UPI`.
23. Click `Record ₹300 payment` → toast "₹300 UPI recorded on INV-20261114-002"; the badge turns "Paid"; payments list shows "₹200 Cash" and "₹300 UPI".
24. Click `Add another bill` → section "Add another bill" prefilled "Review consultation", `Fee` 500, `Paid now` 500, mode back on `Cash`.
25. Replace `Bill line` with "Intralesional injection".
26. Replace `Fee` with `1200` → "Fee list: Review ₹500, changed for this bill."; `Paid now` follows to 1200.
27. Click `UPI` again (the mode reset to Cash after the last save — she nearly misses it).
28. Click `Create bill and record ₹1,200` → toast "Bill INV-20261114-004 created and ₹1,200 UPI recorded"; summary line "2 bills · ₹1,700 · Paid".
29. Close the dialog → chip "₹1,700 · Paid" ("· 2 bills" on a wide row).
30. After the session, click "Daily Collection" in the sidebar → the report loads for today: block "Whole day" with tiles "Whole day", "Clinic" ₹5,400, "Pharmacy" and the table "Whole day by payment mode".
31. Read "Clinic: consultations and procedures": "Clinic received" ₹5,400, "Clinic billed today" ₹5,400, "Clinic still due" ₹0; by mode: Cash ₹200, UPI ₹2,200, Card ₹3,000. She checks the ₹200 note in the desk drawer against the Cash row — by eye; there is no box for it.
32. Scan the table "Clinic bills": four rows INV-20261114-001 to -004 with Patient, Amount, "Received today" and "Paid by" (INV-…-002 shows "Cash, UPI"); Due is ₹0 on each. The rows are not clickable.
33. Scroll to "Pharmacy": amber banner "Pharmacy not counted yet. Count the pharmacy cash drawer and check its UPI and card settlements, then enter them below." In "Pharmacy reconciliation by payment mode" type the pharmacy drawer's cash in the Cash "Counted" box. She hesitates over whether the clinic's ₹200 belongs in this figure — the banner says pharmacy only — and leaves it out.
34. Type the UPI and Card settlement totals in their "Counted" boxes → the "Difference" column and the Total row update as she types.
35. Type "Clinic cash ₹200 kept separately in desk envelope" in "Note (optional)".
36. Click `Save count` → "Count saved. Pharmacy balanced: what was counted matches what the system expected."; a line "Counted by Sandhya Pillai at 14 Nov 2026, 01:42 pm" appears.
37. Click `Print` → the report's PDF opens in the browser's print dialog, with the clinic and pharmacy sections, for the owner's file.

#### Variations
- **Receptionist instead of admin**: steps 2–9 and 16–29 are identical, but at step 11 there is no `Set fees` link (she must type the fee each time or ask an admin), and steps 30–37 are impossible — no "Daily Collection" entry and the report route refuses RECEPTION.
- **Stays in the bill instead of detouring** (steps 12–15): type 3000 straight into `Fee` and carry on; the fee list stays empty and the next procedure asks again.
- **Balance and add-on in one go** (steps 21–28): not possible — the due on one bill and the new line are two saves; a single UPI transfer of ₹1,500 from the patient becomes two payment records (₹300 and ₹1,200).
- **Pharmacy counted by the pharmacist**: steps 33–36 are skipped; the banner already reads "Pharmacy balanced…" or "Pharmacy short by ₹…" / "Pharmacy over by ₹…".

#### Edge Cases
- **Fee changed while the calendar is open**: had she changed the fee in another tab, the open calendar would keep offering the old amount until the schedule reloads *(inferred)*.
- **Typing in the dialog then clicking `Set fees`**: any line text or amount already typed is lost; the link is a plain navigation with no warning.
- **The same information on four surfaces**: Arjun's ₹1,700 is shown on the row chip, in "Appointment Details" ("Bill: ₹1,700 · Paid · 2 bills"), in the bill dialog (summary line plus per-bill Total / Received / Due) and in Daily Collection's "Clinic bills" rows — each with slightly different wording.
- **A slip anywhere in steps 4–28** (wrong amount or mode) cannot be undone from the app (STORY-037) and would surface only as an unexplained difference at step 31.
- **Session expiry during a save**: any 401 redirects to `/login?next=…`; on return the calendar reloads from the server, so the chip shows whether the bill was actually created.

---

### Visit documentation & procedures

Source: `topics/visits-procedures.md`

### STORY-041: Doctor opens a visit from today's appointment

**Type**: short
**Topic**: Visit documentation & procedures
**Persona**: Dr. Sindhu Reddy, dermatologist, 10:40 am on a busy OPD morning; the patient is already seated
**Goal**: Get from the calendar into the visit form for the patient in front of her
**Preconditions**: Signed in as DOCTOR. A Confirmed appointment today 10:30–10:45 for Ananya Sharma (F, 27, 98480 12345) with Dr. Sindhu Reddy; no visit recorded for it yet. Appointments page already remembers her as the selected doctor and today as the date.
**Ideal path**: 2 — open today's list, one click on the patient opens the visit already linked to the appointment.
**Alternate paths**:
- Hover the appointment tile → quick button `START` (tooltip "Start Visit"); the same button reads `CONT` ("Continue Visit") once a visit exists (`CalendarColumn.tsx`).
- Click the tile → dialog "Appointment Details" → `Start Visit` (`DoctorDayCalendar.tsx`). The dialog button always says `Start Visit`, even when it will resume an existing visit.
- Appointments › `Slots` tab renders the same calendar, so both routes above exist there too.
- Header notification bell (doctor): each upcoming appointment links to `/dashboard/visits?appointmentId=…` (`header.tsx`). The Visits page ignores `appointmentId` unless `patientId` is also present, so this lands on the empty setup screen.
- Patients list row `Start Visit`; patient detail `Start new visit`; progress tracker `Start Visit` — all open a visit that is **not** linked to the appointment (see STORY-043).
- Sidebar `Visits` → setup screen (STORY-042), also not linked to the appointment.

#### Steps
1. Click `Appointments` in the sidebar (Clinical) → "Doctor Calendar" for Dr. Sindhu Reddy, today, with Scheduled and Confirmed columns.
2. Move the pointer over Ananya Sharma's tile in the Confirmed column → three small buttons fade in: `INFO`, `RESCHED`, `START`.
3. Click `START` → browser goes to `/dashboard/visits?patientId=…&appointmentId=…&autoStart=true`; the setup screen is skipped.
4. Read the screen → title "Visit Documentation" with a blue `From Appointment` badge, a compact progress tracker (icons only) with a `Continue`/`Prescribe` button row if she has an earlier visit, buttons `Quick Guide`, `Back to Calendar`, `Back to Setup`; a sticky line "Patient: Ananya Sharma · 27 · Female · Doctor: Dr. Sindhu Reddy · 10:30–10:45 · OPD"; left card "Patient Context"; header card "Visit #3", badge `DRAFT`, second badge `Linked to Appointment`, "0 Photos", "Medical Visit Documentation • Role: DOCTOR • Progress: 0%"; `Overview` tab selected.

#### Variations
- **Via the details dialog**: click the tile body instead of `START` → "Appointment Details" (Time, Patient, Sex, Bill, Type, Room, Status) → `Start Visit`. One extra click; same destination.
- **Visit already exists**: the tile button reads `CONT`; the URL carries `visitId=` instead of `autoStart=true`, and the form loads saved vitals, complaints and status (`IN PROGRESS` or `COMPLETED`).
- **Receptionist clicks `START`**: the button is not role-gated on the calendar. She lands in the same form with only `Overview`, `Photos`, `History` tabs and "Role: RECEPTION"; `Save Draft` is shown but the server rejects it.

#### Edge Cases
- **Nothing is created yet**: arriving on the form does not create the visit or change the appointment. The appointment only flips to In Progress on the first successful save (`visits.service.ts` `create`). If the doctor reads the history and leaves, the calendar tile still says `START`.
- **Two badges for one fact**: "From Appointment" (page header) and "Linked to Appointment" (visit header card) are both on screen.
- **Two people start the same appointment**: the second save gets HTTP 409 "Visit already exists for this appointment"; the form then looks up the existing visit id, shows "Unable to save visit", and raises the conflict banner (see STORY-049).
- **Cancelled or completed appointment**: first save fails with "Cannot create a visit from a cancelled or completed appointment".
- **Telemedicine appointment**: the form still opens with `Consultation type` = "In-person" (see STORY-048).

---

### STORY-042: Doctor starts a visit for a walk-in from the Visits page

**Type**: medium
**Topic**: Visit documentation & procedures
**Persona**: Dr. Sindhu Reddy, between appointments; a known patient has walked in without a booking
**Goal**: Open a new visit for a patient who has no appointment
**Preconditions**: Signed in as DOCTOR. Patient Mohammed Irfan (M, 34, 98490 55512) exists with three earlier visits. The clinic has two doctors; "Dr. Praveen Kumar" sorts before "Dr. Sindhu Reddy" in the users list.
**Ideal path**: 3 — search the patient, pick him, start (the doctor should default to the signed-in doctor).
**Alternate paths**:
- Patients list → row `Start Visit` (→ `/dashboard/visits?patientId=…&autoStart=true`).
- Patient detail page → `Start new visit`; `Resume last visit`; progress tracker `Continue` / `Start Visit`.
- Appointments → tile `START` / "Appointment Details" › `Start Visit` (needs a booking first).
- Doctor Dashboard › "Recent Visits" row (resumes an existing visit).
- `/dashboard/prescriptions` redirects to this same setup screen.
- Procedures › `Save Procedure` also creates a visit record (STORY-051).

#### Steps
1. Click `Visits` in the sidebar → page "Visit Documentation" ("Create and manage patient visits with role-based documentation") with three cards: "Your Role & Permissions" (badge `Doctor`, "Full access to all visit documentation features"), "Start New Visit", and "Available Features" (Complete Documentation / Dermatology Specific / Treatment Planning).
2. Click the "Select Patient" box (placeholder "Search name, phone, or email") → a dropdown opens with up to 10 patients.
3. Type `98490` → "Searching…", then matching rows, each showing name, "ID: <full internal id>", 📞 phone and ✉️ e-mail.
4. Press ↓ then Enter (or click) on "Mohammed Irfan" → the box shows his name; below it two tabs appear, `Ready to Start` (selected) and `Patient History`, with "Ready to start visit" and the identity line "Patient: Mohammed Irfan · 34 · Male · Doctor: Dr. Praveen Kumar".
5. Notice the wrong doctor: "Select Doctor" was pre-filled with the first doctor in the list, not the signed-in user. Open the select and choose "Dr. Sindhu Reddy" → identity line updates.
6. Click `Start Visit Documentation` → the form opens: "Visit #4", badge `DRAFT`, no appointment badges, `Overview` tab, footer "Progress: 0% • 0 of 5 sections complete" with the hint "Completion requires 80% progress. Remaining: vitals, photos, labs, prescription. Section progress does not verify clinical completeness."

#### Variations
- **Peek at history first**: after step 4 click `Patient History` → timeline of past records with `Show details`, `Resume session` and (where a prescription exists) `View Prescription`; then back to `Ready to Start`.
- **No doctor chosen**: if the doctor select is cleared, `Ready to Start` shows a yellow note "Please select a doctor to start the visit." and no start button.
- **ADMIN / OWNER / MANAGER on this screen**: the role card falls back to the `Doctor` badge and description for any role without its own entry, and "Available Features" is an empty card (it only has content for THERAPIST, NURSE, DOCTOR). A MANAGER who starts a visit then gets only `Overview` and `History`.

#### Edge Cases
- **No patients or no doctors in the branch**: card "Setup Required" — "No patients or doctors found. Please add at least one to create a visit." with `Manage Patients` and `Manage Users`.
- **Role info shown twice**: "Your Role & Permissions" and "Available Features" both start with "Features available … your role: Doctor".
- **Search failure**: an API error while searching shows "No results" (errors are swallowed).
- **Unsaved new visit is fragile** *(inferred from `createDraftStorageKey` and `visitDate={new Date().toISOString()}`)*: until the first save, the local draft key contains a full timestamp generated at render time, so a draft for a brand-new walk-in visit is unlikely to be found again after a page reload. The browser's "leave site?" prompt is the only warning.
- **Existing open visit is not offered**: starting here always opens a blank "new" visit even if the patient has an in-progress visit from this morning; resuming needs the `Patient History` tab or another route.

---

### STORY-043: Second doctor starts a visit from the Patients list and finds it under the wrong doctor

**Type**: short
**Topic**: Visit documentation & procedures
**Persona**: Dr. Praveen Kumar, visiting cosmetologist, Saturday clinic
**Goal**: Start documenting a visit for a patient he found in the Patients list
**Preconditions**: Signed in as DOCTOR (Dr. Praveen Kumar). Patient Sunita Rao (F, 45) exists. Another doctor sorts first in the clinic's doctor list.
**Ideal path**: 1 — `Start Visit` on the patient row opens a visit under the signed-in doctor.
**Alternate paths**: patient detail `Start new visit`; patient detail progress tracker `Start Visit` (only shown when an upcoming appointment exists and no visit yet); Visits setup screen (STORY-042); appointment `START` (STORY-041).

#### Steps
1. Click `Patients` in the sidebar, type `Sunita` in the search box → her row appears.
2. Click `Start Visit` on the row → `/dashboard/visits?patientId=…&autoStart=true`; the form opens immediately, no setup screen.
3. Read the sticky identity line → "Patient: Sunita Rao · 45 · Female · Doctor: Dr. Aarti Mehta" — the first doctor in the list, because the link carries no `doctorId` and the page defaults to `doctors[0]`.
4. Click `Back to Setup` → the setup screen shows the "Start New Visit" card; the patient search box is empty although "Ready to start visit" still names Sunita Rao.
5. Change "Select Doctor" to "Dr. Praveen Kumar" → the form re-opens by itself (a deep-link effect re-shows the form whenever patient and doctor are both set), now under the right doctor; he never clicks `Start Visit Documentation`.

#### Variations
- **From the patient detail page**: `View` → `Start new visit` uses the same URL and the same doctor default.
- **Resume instead of start**: `Resume last visit` (detail page) or tracker `Continue` adds `visitId=`, so the visit's own doctor is loaded and the problem does not arise.

#### Edge Cases
- **He does not notice**: the first save creates the visit under the other doctor (and, for a patient without one, makes that doctor the patient's primary doctor — `visits.service.ts`). No UI was found to change a saved visit's doctor.
- **Typed-in data under the wrong doctor**: the local draft key includes the doctor id, so anything typed before step 4 is not carried over to the corrected form.
- **Receptionist uses the same button**: `Start Visit` is visible to RECEPTION on the Patients list although `Visits` is not in her sidebar; she gets `Overview`, `Photos`, `History` and cannot save a visit.

---

### STORY-044: Nurse records vitals and a photo before the doctor sees the patient

**Type**: medium
**Topic**: Visit documentation & procedures
**Persona**: Lakshmi Devi, staff nurse, pre-consultation desk, six patients waiting
**Goal**: Capture BP, pulse, weight, height and one photo so the doctor finds them in the visit
**Preconditions**: Signed in as NURSE. Patient Karthik Varma (M, 29) has a Confirmed appointment with Dr. Sindhu Reddy; no visit yet.
**Ideal path**: 7 — open the patient's visit (1), type five vitals (5), save (1); the doctor then sees them.
**Alternate paths**:
- Appointments → tile `START` (nurses have Appointments) — links the form to the appointment.
- Patients row `Start Visit` / patient detail `Start new visit`.
- Photos only: patient detail › `Uploads` tab (same `VisitPhotos` component with `visitId="temp"`).
- Vitals can also be typed by the doctor in Prescription › "Clinical Details & Vitals" (doctor-only).

#### Steps
1. Click `Visits` in the sidebar → setup screen; "Your Role & Permissions" shows badge `Nurse` — "Can record vitals, capture photos, complaints, and basic assessments"; "Available Features" lists Full Vitals, Photo & Complaints, Assessment Notes.
2. Click "Select Patient", type `Karthik`, click "Karthik Varma" → `Ready to Start` appears.
3. Open "Select Doctor" and choose "Dr. Sindhu Reddy".
4. Click `Start Visit Documentation` → form with four tabs only: `Overview`, `Vitals`, `Photos`, `History`. Header: "Role: NURSE • Progress: 0%". Footer: "0 of 3 sections complete" and a single button `Save Draft` (no `Complete Visit`).
5. Look for somewhere to type the complaint promised on the setup screen → there is none; complaints live in the doctor-only `Prescription` tab. She moves on.
6. Click `Record Vitals` under "Quick Actions" (or the `Vitals` tab).
7. Type `118` in "BP Systolic".
8. Type `76` in "BP Diastolic".
9. Type `82` in "Heart Rate".
10. Type `72` in "Weight".
11. Type `174` in "Height" → read-only "BMI" shows 23.8. Header status reads "Unsaved changes".
12. Click `Mark Vitals Complete` → the form tries to create the visit; the server refuses (`POST /visits` allows only DOCTOR/ADMIN/OWNER) → red toast "Unable to save visit" with the server's message *(exact text unverified)*, header "Save failed"; the Vitals tab gets no green dot.
13. Click the `Photos` tab → "No photos attached to this visit" → click `Take Photo`, shoot the forearm lesion.
14. In the dialog "Tag photo positions" change the position from the pre-selected "Front" to "Close-up", click `Upload` → toast "Photos uploaded — 1 image(s) uploaded."; header shows "1 Photos" and the Photos tab gets a green dot (progress 33 %).
15. Walk over and tell the doctor the readings, because nothing she typed in `Vitals` left her browser.

#### Variations
- **Opened from the appointment after the doctor already saved the visit**: the form loads the saved visit; `Mark Vitals Complete` then sends `PATCH /visits/:id`, which is refused the same way. Her photo, however, attaches to the visit directly (photo upload is open to clinic staff).
- **Receptionist**: only `Overview`, `Photos`, `History`; `Quick Actions` shows just `Capture Photos`.
- **Manager**: only `Overview` and `History`, an empty "Quick Actions" card, and a `Save Draft` button that cannot succeed.

#### Edge Cases
- **Where the photo went**: with no visit id the upload goes to the per-patient, per-day draft store (`/visits/photos/draft/:patientId`). When the doctor later opens the visit it appears under "Other saved photos" → "Unattached uploads — <date> (1)", not in the visit's own photo strip; nothing links draft photos to the visit on creation.
- **Delete is offered but refused**: the nurse sees `Delete` buttons (`allowDelete` is true for anyone with the Photos tab). Deleting a draft upload works; deleting a photo attached to a visit returns 403 → toast "Delete failed".
- **Vitals stay in the nurse's local draft**: the draft is keyed by doctor, patient and (here) a timestamp; it is not visible on the doctor's machine.
- **The promise vs. the form**: the setup screen and the page's `Quick Guide` both say nurses record "complaints, and assessments"; the form has no such field for this role. The guide also describes a "Therapist" role that does not exist in the role enum.

---

### STORY-045: Doctor documents a full acne consultation from appointment to `Complete Visit`

**Type**: long
**Topic**: Visit documentation & procedures
**Persona**: Dr. Sindhu Reddy, dermatologist, mid-morning; follow-up patient with a hormonal-acne work-up
**Goal**: Record vitals, photos, complaint, history, examination, diagnosis, order investigations, issue the prescription and close the visit so the appointment shows Completed
**Preconditions**: Signed in as DOCTOR. Confirmed appointment today for Ananya Sharma (F, 27). She has two earlier visits, the last with tagged photos (Front, Left, Right). Drug master and a signature are set up (prescription internals are another topic).
**Ideal path**: 14 — open from appointment (1), four vitals (4), add three photos in one action (2), complaint + diagnosis + examination chips (3), order tests (1), prescription hand-off (1), complete (2: confirm + done).
**Alternate paths**:
- Starting: any route from STORY-041/042/043.
- Vitals: `Vitals` tab **or** Prescription › "Clinical Details & Vitals" (Height, Weight, BMI, BP Sys, BP Dia, Pulse) — the two are kept in sync.
- Diagnosis: Prescription › "Diagnosis" text box **or** Prescription › "On Examination" › "Dermatology Diagnoses" chips (merged on save).
- Ordering tests: `Lab Tests` tab **or** Prescription › "Investigations" checklist.
- Saving: `Save Draft`, Ctrl/Cmd+S, `Mark Vitals Complete`, `Save Labs`, autosave, and `Create Prescription` all save the visit.
- Completing: `Complete Visit` button or Ctrl/Cmd+Shift+S.

#### Steps
1. Click `Appointments`, hover Ananya Sharma's tile, click `START` → visit form opens with `From Appointment` / `Linked to Appointment`, "Visit #3", badge `DRAFT`.
2. Glance at "Patient Context" (left) → name, "ID: …", "Age: 27 • <gender as stored>", "Phone: …", a red "⚠️ ALLERGIES" box if recorded, and "Recent Visits" with the last two dates and diagnoses.
3. Click the `Vitals` tab.
4. Type `110` in "BP Systolic".
5. Type `70` in "BP Diastolic".
6. Type `78` in "Heart Rate".
7. Type `58` in "Weight".
8. Type `162` in "Height" → "BMI" shows 22.1. Header status: "Unsaved changes" (autosave has not started — the visit does not exist yet).
9. Click `Mark Vitals Complete` → visit is created on the server; green toast "Visit saved — Your draft was saved safely."; badge becomes `IN PROGRESS`; green dot on the `Vitals` tab; "Progress: 20%"; header "Saved 10:44". The appointment is now In Progress.
10. Click the `Photos` tab → card "Before / After Photos (0)", empty state "No photos attached to this visit".
11. Click `Choose Files`, select three photos from the clinic camera folder in the OS picker.
12. Dialog "Tag photo positions" opens in `Single` mode with positions pre-guessed in order (Front, Left, Right). Click `Next` twice to check each preview against its tag.
13. Click `Upload` → button shows "Uploading (1/1) - 60%"; toast "Photos uploaded — 3 image(s) uploaded."; header "3 Photos"; green dot on `Photos`; progress 40 %.
14. Click `Compare: Off` → it becomes `Compare: On`; two panes "Visit 2 - Front" and "Visit 3 - Front", "Compare against:" pre-set to the previous visit.
15. Click `Next` twice to compare Left and Right; note visible improvement.
16. Click the `Prescription` tab → the prescription builder. "Clinical Details & Vitals" already shows Height 162, Weight 58, BMI, BP 110/70, Pulse 78 — the same readings on a second surface ("Heart Rate" is called "Pulse (bpm)" here).
17. Click in "Chief Complaints" and type `Pimples on both cheeks and jawline for 3 months, flare before periods` (a mic button offers dictation).
18. Click the `Acne` chip under "Skin Concerns".
19. In "Diagnosis" type `Acne vul` and click the suggestion "Acne vulgaris" → the section turns green with a "Has Data" badge.
20. In "Patient History" type `Used Betnovate-N on face for 2 months (self-medication)` under "Medication History".
21. Type `Irregular cycles, 40–45 days` under "Menstrual History".
22. Expand "On Examination" if it is collapsed; click `IV` under "Fitzpatrick Skin Type".
23. Type `moderate` in "Acne Severity".
24. Click `Papule`, `Pustule`, `Comedo` under "Morphology" (3 clicks).
25. Click `Face` under "Distribution / Body Areas".
26. Hesitate at "Dermatology Diagnoses": `Acne vulgaris` is offered again as a chip although it was just typed in "Diagnosis". She clicks it anyway to be safe.
27. **Hand-off — prescription topic**: fill the "Treatment" table (e.g. Adapalene 0.1% gel at night, Doxycycline 100 mg OD × 4 weeks), set "Review Date" with the `4w` shortcut, click `Create Prescription`, deal with the "Go to Pharmacy?" dialog (`Stay Here`). Creating (or even just opening `Print Preview`) marks the prescription section complete → progress 60 %.
28. Click the `Lab Tests` tab → card "Lab Tests (Investigations)".
29. Tick `Total Testosterone`, `S. Prolactin`, `TSH`, `Fasting Insulin` (4 clicks) → an "Enter Results" grid appears with Value/Unit boxes (left blank today).
30. Click `Save Labs` → toast "Visit saved"; green dot on `Lab Tests`; footer "Progress: 80% • 4 of 5 sections complete"; the 80 % hint disappears and `Complete Visit` becomes enabled.
31. Click `Complete Visit` → button reads "Completing..."; the visit is saved, then completed with the review date as follow-up; toast "Visit completed — All documentation has been marked complete."; badge `COMPLETED`; the linked appointment becomes Completed; the local draft is cleared.
32. Click `Back to Calendar` → browser history goes back to Appointments; the tile now shows the completed status.

#### Variations
- **Vitals typed in the Prescription tab instead**: values flow back to the `Vitals` tab, but the `Vitals` section is only marked complete by pressing `Mark Vitals Complete` on the Vitals tab — so she must still visit that tab and press the button before completion is possible.
- **No tests needed today**: she still has to open `Lab Tests` and press `Save Labs` with nothing ticked, because completion needs the "labs" section. The button does not check that anything was selected.
- **No photos taken** (e.g. patient declines): `Complete Visit` can never be enabled; "photos" stays in the "Remaining:" list. The only way through is to upload some image.
- **Keyboard**: Ctrl/Cmd+S = `Save Draft`; Ctrl/Cmd+Shift+S = complete. `Shortcuts` opens "Keyboard Shortcuts", which also lists patient-search keys that only apply on the setup screen.
- **Guided**: `Visit Workflow Tour` in the header starts an intro.js tour (Step 1 Patient Context … Step 12 Completing the Visit).

#### Edge Cases
- **Shortcut below 80 %**: Ctrl/Cmd+Shift+S while the button is disabled shows the toast "More details needed to complete — Fill vitals, complaints, diagnosis, and prescription to reach at least 80% before completing." — which names complaints and diagnosis, whereas the footer hint (and the code) track vitals, photos, labs, prescription.
- **Progress is shown four times**: header text, header mini-bar, `Overview` › "Progress Summary" (per-tab `Complete`/`Pending` badges + bar), footer text. The page header additionally shows the patient progress tracker, a different six-step concept (Start → Document → Complete → Prescribe → Billing → Follow-up) whose "Complete" step is a heuristic (visit older than 24 h or has a prescription), not the visit's status.
- **`Overview` › "Photos Captured: 0"** is hard-coded; the header badge next to it says "3 Photos".
- **Typing during save**: if edits land while a save is in flight the toast reads "Earlier changes saved — New edits are still waiting to save."; completing in that state fails with "New changes were entered while saving. Please save again before completing or exporting."
- **Tracker buttons inside the form**: the compact tracker's `Continue` / `View` buttons link to the patient's *latest saved* visit; before step 9 that is the previous visit, so clicking them leaves the current form.
- **After completion** the form remains editable and `Save Draft` still works; no read-only state was found in the form or in `visits.service.ts` `update`.
- **Section completion is not restored from the server**: reopening this visit on another computer shows 0 % progress except Photos (auto-detected) — see STORY-050 edge cases.

---

### STORY-046: Doctor photographs a melasma follow-up on a tablet, compares with last visit and retakes a blurred shot

**Type**: medium
**Topic**: Visit documentation & procedures
**Persona**: Dr. Sindhu Reddy using the consulting-room tablet; patient Sunita Rao, melasma, week 8 of treatment
**Goal**: Add front/left/right photos to today's visit, compare them with the previous visit, replace one bad photo
**Preconditions**: Visit already saved (`IN PROGRESS`). The previous visit has three photos tagged Front, Left, Right.
**Ideal path**: 6 — open Photos (1), shoot three angles in one capture session with auto-tagging (3), toggle compare (1), swipe through pairs (1).
**Alternate paths**:
- `Overview` › "Quick Actions" › `Capture Photos` (jumps to the Photos tab).
- `Upload` / `Choose Files` (multi-select from files) instead of `Camera` / `Take Photo`.
- Patient detail page › `Uploads` tab (same component, saves as unattached uploads).
- Viewing only: History cards › `Show details` › `Full details` › "Photos"; "Other saved photos" beneath the photo viewer.

#### Steps
1. In the open visit click the `Photos` tab → "Before / After Photos (0)", header buttons `Upload` and `Camera`, empty state with `Choose Files` and `Take Photo` (same two actions under different labels).
2. Click `Take Photo` → the tablet camera opens (single capture); shoot the front view and accept.
3. Dialog "Tag photo positions" opens in `Single` mode, position pre-set to "Front" → click `Upload` → toast "Photos uploaded — 1 image(s) uploaded."
4. Click `Camera` (the empty-state buttons are gone now) → shoot the left profile.
5. The dialog again pre-selects "Front" (the guess restarts from Front for every batch) → open the position select, choose "Left".
6. Click `Upload`.
7. Click `Camera` → shoot the right profile → change the select to "Right" → click `Upload` (3 actions). Title now "Before / After Photos (3)", thumbnails labelled Front / Left / Right.
8. Click `Compare: Off` → `Compare: On`; "Compare against:" shows the previous visit ("Visit 2 - <date>"); left pane "Visit 2 - Front", right pane "Visit 3 - Front"; footer "Position: Front • 1 / 3".
9. Click `Next` → Left pair; `Next` → Right pair. The right-profile photo from today is blurred.
10. Click the red bin icon on the "Right" thumbnail → native browser confirm "Delete this photo? This cannot be undone." → `OK` → photo removed; title "(2)"; the compare pane for Right shows "No photo".
11. Click `Camera`, reshoot, set "Right", `Upload` → pair restored.
12. Scroll below the viewer to "Other saved photos" → groups such as "Visit — <date> (3)"; tap a thumbnail → opens full size in a new browser tab.

#### Variations
- **From files**: `Upload` allows multi-select; with three files the dialog pre-tags Front, Left, Right in file order and one `Upload` click sends them all (batches of 6, progress "Uploading (1/1) - 40%").
- **Grid tagging**: `Grid` mode shows every pending photo with its own position select; `Infer positions` re-applies the Front → Left → Right → Back → Close-up → Other order.
- **Different comparison**: the "Compare against:" select lists every earlier visit as "Visit n - <date>".

#### Edge Cases
- **Three delete controls for one action**: `Delete` in the card header, `Delete` beside Prev/Next, and the bin on each thumbnail; all use the native confirm dialog.
- **Compare pairs by position, first photo only**: two photos tagged "Close-up" in one visit — only the first is ever shown in compare.
- **Photos taken before the first save**: uploads go to the draft store; after the first save the viewer reloads from the visit, shows 0 photos, the Photos section loses its green dot (progress drops 20 %), and the pictures appear only under "Other saved photos" → "Unattached uploads — <date>". *(From `VisitPhotos.tsx`: `onVisitNeeded` is accepted but never called.)*
- **Bad files**: non-images are skipped; > 25 MB is attempted with a warning; mixed outcomes give the toast "Upload completed with warnings" listing skipped/failed batches; total failure gives "Upload failed".
- **Load failure**: "Unable to load this visit's photos. Please retry." with `Retry visit photos`; the archive has its own `Retry saved photos`.
- **Stale version**: an upload or delete answered with 409 raises the visit conflict banner (STORY-049).

---

### STORY-047: Doctor enters lab results from a report photo and compares with the last visit

**Type**: medium
**Topic**: Visit documentation & procedures
**Persona**: Dr. Sindhu Reddy; Ananya Sharma returns after four weeks with a printed hormone report
**Goal**: Record TSH, Vitamin D, testosterone and prolactin results in today's visit without retyping, and see the change from last time
**Preconditions**: Today's visit is open and saved. The previous visit had the same tests ticked (with or without values). `OPENAI_API_KEY` configured on the server.
**Ideal path**: 3 — open Lab Tests (1), drop the report photo (1), confirm extracted values (1).
**Alternate paths**:
- Type each value by hand in the "Enter Results" grid.
- Ordering (not results): Prescription tab › "Investigations" checklist with "Add Custom Investigation" and `Manage saved investigations` — this is the list that prints on the prescription.
- Reading old results: History card › `Full details` › "Treatment plan" / "Lab orders".

#### Steps
1. Click the `Lab Tests` tab → card "Lab Tests (Investigations)" — "Select tests and enter results with units. You can also autofill from a photo."; 31 checkboxes (CBC, ESR, CRP, LFT … Skin Biopsy). Nothing is pre-ticked from the previous visit's orders.
2. Click the browser's file chooser at the bottom of the card (caption "Accepts JPG, PNG, or PDF"; it has no label of its own) and pick the phone photo of the report.
3. Wait → the `Save Labs` button reads "Processing…" → toast "Autofill complete — Extracted results inserted."; the matching tests become ticked and "Enter Results" shows a box per test with Value and Unit filled.
4. Check the values against the paper; correct TSH from `48` to `4.8`.
5. Testosterone came back without a unit → type `ng/dL` in its "Unit" box.
6. Tick "Compare with previous visit" (top of the card) → a small "Δ +1.3" style figure appears beside each value.
7. Click `Save Labs` → toast "Visit saved"; green dot on `Lab Tests`.
8. **Hand-off — prescription topic**: to order a repeat Vitamin D in 3 months she goes to `Prescription` › "Investigations", not back to this tab.

#### Variations
- **Manual entry**: tick `TSH` → a row with unit pre-filled "µIU/mL"; tick `CBC` → three sub-rows (Hemoglobin, WBC, Platelets) with units; `LFT`, `RFT`, `Fasting lipid profile`, `Thyroid profile` also expand into sub-rows.
- **Clinic-specific test** (e.g. "Anti-TPO"): cannot be added on this tab; custom investigations are added and managed only in Prescription › "Investigations" (`Add`, then `Manage saved investigations` → rename with the pencil, remove with "Remove <name> for everyone in the clinic?" → `Remove` / `Keep`).

#### Edge Cases
- **Two checklists, two stores**: the `Lab Tests` ticks and the Prescription "Investigations" ticks are separate state; ticking `TSH` here does not tick it there during the session *(they only converge when a saved visit is reloaded — inferred from the hydration code)*. Three names are in play: "Lab Tests", "Investigations", "Labs".
- **AI returns a name that is not in the checklist** (e.g. "Serum Prolactin"): it is added to the results grid but has no checkbox, so it cannot be removed from the UI.
- **Misleading delta**: when the previous visit has no value for a test, the comparison still shows "Δ +<current value>" (blank is treated as 0) rather than "—".
- **Autofill failure**: toast "Autofill failed" with the HTTP status text; the selections are untouched.
- **Jargon footnote**: "Selections and results are saved under Treatment Plan → Dermatology." describes the storage path, not anything the user can open.
- **Tab gating mismatch**: the tab's content is rendered for Reception (`basic-info`) but the tab button is only added for doctor-level roles, so Reception can never open it.

---

### STORY-048: Doctor runs a tele-video consultation and records consent

**Type**: medium
**Topic**: Visit documentation & procedures
**Persona**: Dr. Sindhu Reddy on a WhatsApp video call with Meera Nair (F, 38), an out-of-station psoriasis follow-up
**Goal**: Document the call as a tele-video visit with consent recorded, so the prescription carries the tele-consultation wording
**Preconditions**: Signed in as DOCTOR. A "Telemedicine" appointment exists for today (the video call itself happens outside the app — no call component exists).
**Ideal path**: 3 — open the visit from the Telemedicine appointment already set to Tele-video (1), tick consent (1), save (1).
**Alternate paths**: none found for recording consent — the `Consultation type` select and checkbox in the visit header card are the only place. (The appointment's "Telemedicine" type and the patient's "Online/Offline" consultation type are separate fields that do not feed it.)

#### Steps
1. Appointments → Meera Nair's tile (purple "TELEMED") → `START` → visit form opens; `Consultation type` shows "In-person".
2. Open `Consultation type` and choose "Tele-video" → a checkbox "Patient consented to tele-video consultation" appears with red text "Patient consent is required before saving a tele-video consultation."
3. Skip the checkbox for now; click `Vitals`, type `64` in "Weight" (patient-reported) → header "Unsaved changes".
4. Click `Mark Vitals Complete` → red toast "Patient consent required — Patient consent is required before saving a tele-video consultation."; nothing is saved and the section is not marked.
5. Ask the patient on the call, then tick "Patient consented to tele-video consultation" → helper text turns grey: "Consent will be recorded with your account and the save time."
6. Click `Mark Vitals Complete` again → toast "Visit saved"; badge `IN PROGRESS`; consent is stored server-side with her user id and the time.
7. **Hand-off — prescription topic**: in `Prescription` › `Print Preview` the date line reads "… • Consultation: Tele-video" and a disclaimer paragraph is printed ("This prescription was issued after a tele-video consultation, conducted with the patient's consent…").
8. To close the visit she still needs the four tracked sections: upload at least one image in `Photos` (e.g. a screenshot the patient sent), press `Save Labs`, then `Complete Visit`.

#### Variations
- **Changes her mind**: switching the select back to "In-person" and then to "Tele-video" again clears the checkbox each time; consent must be re-ticked.
- **Resuming later**: a saved tele-video visit reopens with "Tele-video" selected and the box ticked (restored from the server receipt or the local draft).

#### Edge Cases
- **Silent autosave skip**: with Tele-video selected and consent unticked on an already-saved visit, autosave does nothing and the header simply stays on "Unsaved changes"; only a manual save explains why.
- **Create/Export blocked too**: `Create Prescription` and exports raise the same "Patient consent required" toast.
- **Photos are not blocked** by the consent gate (the photo component uploads on its own endpoints).
- **Server double-check**: the API rejects a tele-video save without consent with the same sentence, and "Sign in before recording tele-video consent." if the actor is unknown.
- **Naming**: "Tele-video" (visit), "Telemedicine"/"TELEMED" (appointment), "Online" (patient record) all describe the same mode.

---

### STORY-049: Autosave stops after the same visit is edited in a second tab; doctor discards and reloads

**Type**: medium
**Topic**: Visit documentation & procedures
**Persona**: Dr. Sindhu Reddy, afternoon; she has Ananya Sharma's visit open in one browser tab and re-opened it from the Dashboard in another
**Goal**: Keep working without losing data after the "changed elsewhere" warning
**Preconditions**: Visit saved and `IN PROGRESS`, open in tab A.
**Ideal path**: 1 — the form merges non-overlapping changes itself, or offers a single "use latest + keep my edits" action.
**Alternate paths**: none found — `Discard draft and reload saved visit` is the only recovery; `Save Draft` and autosave stay blocked until then. (Reloading the page keeps the conflict flag because it is stored in the local draft.)

#### Steps
1. Tab A, `Vitals`: change "Weight" from `58` to `59` → header "Unsaved changes" → about 8 seconds later "Auto-saving…" → "Saved 15:02". No click needed.
2. Open the Dashboard in a new tab (B) and click Ananya's row under "Recent Visits" → the same visit opens in tab B.
3. Tab B: `Lab Tests` → tick `CBC` → click `Save Labs` → "Visit saved". (Tab A meanwhile shows the toast "Draft changed in another tab — Your local form may be out of date.")
4. Switch to tab A and type `2` in "Pain Score (0-10)" → after 8 seconds the autosave is rejected (409) → amber toast "Visit changed elsewhere — Your draft is retained and autosave is paused. Use the conflict notice to discard it and reload the saved visit."; header "Save failed".
5. Read the amber banner at the top of the form: "This visit changed elsewhere. Your local draft is retained." / "Autosave is paused. You can keep these edits here, or discard them and load the saved visit." with one button.
6. Try `Save Draft` anyway → red toast "Unable to save visit — Visit changed; reconcile the saved visit before saving".
7. Jot the pain score on paper (there is no merge or side-by-side view), then click `Discard draft and reload saved visit` → "Loading saved visit…" → the form rebuilds from the server on the `Overview` tab; `CBC` is ticked; Pain Score is empty.
8. Go back to `Vitals`, re-type `2` → "Unsaved changes" → "Auto-saving…" → "Saved 15:06".

#### Variations
- **Network blip instead of conflict**: toast "Auto-save failed — <message or 'We will retry shortly.'>"; it retries after 15 seconds on its own and returns to "Saved hh:mm".
- **Session expired**: toast "Not signed in — Your session expired. Please sign in to continue."; no retry; the draft stays in the browser.
- **Other 4xx rejection**: autosave pauses until the next edit, then tries again.
- **Conflict raised from Photos or Prescription**: an upload, delete or prescription save that gets 409 raises the same banner.

#### Edge Cases
- **Reload fails**: toast "Unable to reload saved visit — … Your draft is still available. Please try again."; the banner stays.
- **Discard also clears the prescription draft** for this visit (`rxDraft:<patient>:<visit>`), not just the visit fields.
- **Leaving with unsaved edits**: the browser's native "Leave site?" prompt appears.
- **Never-saved visit**: there is no autosave at all before the first explicit save, so the status line never shows "Auto-saving…" on a brand-new visit however long she types.

---

### STORY-050: Doctor checks what happened at the previous visit while documenting today's

**Type**: short
**Topic**: Visit documentation & procedures
**Persona**: Dr. Sindhu Reddy, mid-consultation; the patient says "the cream you gave last time burned"
**Goal**: See last visit's diagnosis, medicines and photos without leaving today's visit
**Preconditions**: Today's visit is open for Mohammed Irfan; he has earlier visits, one with a prescription and photos.
**Ideal path**: 2 — one click to open the last visit's summary beside the form, one to expand medicines.
**Alternate paths** (the same history is rendered on six surfaces):
- "Patient Context" side card › "Recent Visits" — last two visits, date + diagnosis only, not clickable.
- Visits setup screen › `Patient History` tab — same cards plus `View Prescription` → dialog "Prescription Details" (`Print`).
- Patient detail page › `History` tab (doctor/date filters, grouped by day).
- Doctor Dashboard › "Recent Visits" → opens the visit itself in the form.
- Patient progress tracker `Continue` / `View` → opens the latest visit in the form.
- Photos only: `Photos` tab › "Other saved photos"; procedures only: Procedures › `Procedure History`.

#### Steps
1. Click the `History` tab → "Patient Visit History" with `Refresh`; a timeline of cards, each with date, "Visit" (or "Appointment"), doctor, a status badge (`In progress` / `Completed`), "Chief Complaint" and "Diagnosis" lines, and a footer "3 Photos · 2 Rx Items".
2. Click `Show details` on the 14 Oct card → compact view: "History" and a "Medicines" list (e.g. Luliconazole 1% cream, Itraconazole 100 mg).
3. Click `Full details` → every recorded section: Complaint details, Diagnosis details, History, Examination, Treatment plan, Vitals, Prescription, Prescription instructions, Follow-up date, Visit notes, Lab orders, plus photo thumbnails that open in a new tab.
4. Click the `Prescription` tab to carry on with today's visit (the History tab keeps its expanded state while the form is open).

#### Variations
- **Needs the printable prescription**: not available here; `View Prescription` exists only on the setup screen's `Patient History` tab — reaching it from an open visit means `Back to Setup` → `Patient History` → `Show details` → `View Prescription`.
- **Wants to edit the old visit**: `Resume session` on the card navigates to `/dashboard/visits?visitId=…&patientId=…` (a full page load that replaces today's form). The button is shown for completed visits too.
- **Appointment-only entries**: shown as "Appointment only — no visit documentation recorded." with no `Resume session`.

#### Edge Cases
- **Resumed visit shows 0 % progress**: section completion is kept only in the browser draft. A visit reopened on another machine (or after completion cleared the draft) shows every section `Pending` except Photos; to press `Complete Visit` on it the doctor must again click `Mark Vitals Complete`, `Save Labs` and open `Print Preview`.
- **Empty past visits are hidden**: visits from earlier days with no clinical content at all are filtered out of the list (`history-visibility.ts`), so "Visit #n" can be higher than the number of cards.
- **Load failure**: "Unable to load history. <message>" (form tab) or "Unable to load patient history. … `Retry`" (setup tab); empty: "No documented history to show."
- **Units differ**: the Vitals tab takes temperature in °F; the history card labels the stored value "Temperature (°C)".
- **One thing, several names**: the cards call a past visit a "record" ("Most recent record", "n Records"), a "Visit", and a "session" (`Resume session`); the Dashboard calls them "consultations".

---

### STORY-051: Doctor records a laser hair reduction session on the Procedures page

**Type**: medium
**Topic**: Visit documentation & procedures
**Persona**: Dr. Sindhu Reddy, evening procedure slot; nurse Lakshmi Devi has just finished session 3 of beard-line laser hair reduction for Karthik Varma
**Goal**: Log machine, shot counts, body areas and per-pass settings for the session and confirm it is on record
**Preconditions**: Signed in as DOCTOR (sidebar `Procedures` is shown to OWNER, ADMIN, MANAGER, DOCTOR). Karthik Varma is among the first 100 patients returned by the API (the patient list is not searchable).
**Ideal path**: 9 — pick patient (1), machine (1), session auto-numbered, shot counts (2), body parts (2), two passes of settings pasted from last session (1), note (1), save (1).
**Alternate paths**:
- Prescription tab › "Procedures" section (free-text "Procedures" and "Procedure Planned") inside a visit — prints on the prescription.
- Appointment of type Procedure with "Procedure Name" (scheduling only).
- Procedures › `Procedure History` › `Load & Edit` to start from an earlier record.

#### Steps
1. Click `Procedures` in the sidebar → "Smart Procedures Management" ("Advanced procedure planning and tracking with machine-specific parameters"); tabs `New Procedure` (selected), `Procedure History`, `Analytics`. "Patient *", "Doctor *" and "Nurse/Therapist" are already filled with the **first** patient, doctor and nurse in each list.
2. Open "Patient *", scroll the plain list (no type-ahead) and choose "Karthik Varma".
3. Check "Doctor *" (first doctor by default); choose "Dr. Sindhu Reddy" if needed.
4. Open "Nurse/Therapist" and choose "Lakshmi Devi".
5. Replace "Session No." `1` with `3` (it is not derived from his history).
6. Type `12450` in "Shot Count (Begin)".
7. Type `13120` in "Shot Count (End)" → disabled "Total Shots" shows 670.
8. Click `Chin` and `Neck` under "Body Parts" (2 clicks).
9. Type `Laser hair reduction – beard line shaping, session 3 of 6` in "Indications".
10. Under "Skin Type Assessment" choose "Type IV" for "Fitzpatrick Type" and "None" for "Herpes Status" (2 selects).
11. Under "Machine Selection" click the `Soprano Platinum LHR` tile → a table "Soprano Platinum LHR Parameters" appears: rows Area, Fluence, Spot Size × columns Pass 1 … Pass 8.
12. Fill Pass 1 (`Chin`, `10`, `12`) and Pass 2 (`Neck`, `12`, `12`) — 6 cells.
13. Type `Mild perifollicular erythema. Ice pack applied, sunscreen advised.` in "Additional Notes".
14. Click `Save Procedure` → a native browser alert "Procedure saved successfully!" → `OK`. The form stays open: "Session No." is now `4`, shot counts are `0`, the parameter table and notes are cleared; patient, machine, body parts, indications and skin types remain.
15. Click the `Procedure History` tab → "Procedures captured from visits (n found)"; the session just saved is not listed yet.
16. Click `Refresh` → a new card: "Karthik Varma", date and time, badge "Soprano Platinum LHR", "Dr. Sindhu Reddy", buttons `Load & Edit` and `View Details`. None of the shot counts, body parts or pass settings are shown on the card.
17. Click `View Details` → nothing visible happens (the click only sets state that no part of the page renders).

#### Variations
- **Repeat next month via `Load & Edit`**: it switches to `New Procedure` and restores only patient, doctor and machine; session number resets to `1`, and body parts, shot counts, per-pass settings, indications and notes come back empty for records saved from this page. `Save Procedure` then creates a **new** record — nothing is edited.
- **Other machines**: `Endymed Pro Max` (Intensity, RF, Depth, Area Treated, Mode × 8 passes), `Fotona Starwalker` (8 rows × 8 passes), `Hydrafacial` (Actives Used, Area × 1 pass).
- **`Analytics` tab**: placeholder "Analytics dashboard coming soon".

#### Edge Cases
- **Wrong patient by default**: because the first patient in the list is pre-selected, pressing `Save Procedure` without step 2 files the session under an unrelated patient.
- **Missing machine/patient/doctor**: native alert "Please fill in all required fields" (it does not say which; only Patient and Doctor carry a `*`, Machine does not).
- **Save failure** (including a MANAGER, who sees this page but is refused by `POST /visits`): native alert "Failed to save procedure. Please try again."
- **It is a visit**: the save calls `createVisit`, so the session appears in the patient's visit history, the doctor's "Recent Visits" and the progress tracker as an in-progress visit with no complaints; there is no way to complete it from this page.
- **Fotona table quirk**: the parameter list contains "Area" twice; both rows write to the same key, so typing in one mirrors the other.
- **End below Begin**: "Total Shots" goes negative; no validation.
- **Patient beyond the first 100**: cannot be selected here at all.
- **Nurses cannot log their own procedures**: the page is hidden from NURSE and the save endpoint refuses the role, although the form has a "Nurse/Therapist" field.
- **History card reads other fields**: the card looks for Fluence / Spot Size / Passes in the visit-form procedure shape and for notes under `plan.dermatology.notes`; this page stores per-pass `parameters` and top-level notes, so its own records show only the machine badge.

---

### Prescription writing, printing & sharing

Source: `topics/prescriptions.md`

### STORY-052: Add one medicine by search and take the usual regimen

**Type**: short
**Topic**: Prescription writing, printing & sharing
**Persona**: Dr. Kavya Reddy, dermatologist, mid-morning OPD with six patients waiting
**Goal**: Add Doxycycline to the Treatment table with the frequency and duration she normally uses
**Preconditions**: Visit open on the `Prescription` tab for Rohan Verma (27 M). "Doxycycline 100mg Capsule" exists in the drug master with stock. She has prescribed it before, so regimen defaults exist.
**Ideal path**: 2 — type a few letters and pick the match; the usual regimen should arrive already filled and need no confirmation.
**Alternate paths**: (a) `Recent meds:` chip above the table (fills the active row by name); (b) `Reuse last meds` (STORY-053); (c) apply a template (STORY-056); (d) the automatic "Treatment suggestions" learned plan once a diagnosis is typed (STORY-057); (e) type a free-text name and never pick from the list — any row with a non-empty name counts as a medicine; (f) `+ Add to Drug Database` when the product is missing; (g) frequency/duration can be set three ways: the per-row dropdowns, the `Presets:` chips (`1-0-1`, `0-1-0`, `1-1-1`, `HS`, `5d`, `7d`, `14d`, `4w`), or `+ Custom...` inside each dropdown.

#### Steps
1. In the "Treatment" card click `Add Row` → the table stops showing "No items added yet"; a blank row appears with the cursor in the Medicine field (placeholder "Search medicine name...").
2. Type `doxy` → after the second character a blue-bordered dropdown opens under the field: "Searching…", then results. The first row carries a green `Best Match` badge, the next two a blue `High Match` badge; each shows manufacturer • pack size, "Stock: 60" and a `Select` button.
3. Click the "Doxycycline 100mg Capsule" row (or its `Select` button) → the name fills, the "Stock: 60" hint shows beside the field, a new blank row is appended underneath, and "Loading usual values…" appears under the name.
4. Wait about a second → Frequency, When, Duration and Instructions fill in, each with a small underlined link `Suggested · Accept` beneath it (hover: "Suggested from your prescriptions in the last 12 months"). She hesitates: are these values already applied, or only applied if she clicks Accept? (They are already in the row; Accept only removes the hint.)
5. Change Duration from 14 to 21 by typing in the `#` box → the hint under Duration disappears because the field is now "touched"; the other three hints stay until clicked or edited.

#### Variations
- **Preset chips**: instead of the dropdowns she clicks `1-0-1` then `14d` in the `Presets:` strip. They apply to the last-focused row, so if she clicked into the new blank row first the preset lands on the wrong (empty) row.
- **Custom frequency**: Frequency dropdown → `+ Custom...` → dialog "Add Custom Dose Pattern" ("Enter a custom option. It will be saved for future use.", hint "Stored in lowercase.") → type `1-0-0 alternate days` → `Add & Apply`. The option is stored in this browser's `localStorage`, not on the server, so it is missing on another PC.
- **Recent meds chip**: clicking a `Recent meds:` chip writes that medicine into the active row. If the active row already holds a medicine it is replaced, not added.
- **Keyboard**: pressing Enter in the Medicine field inserts a blank row below; it does not choose the `Best Match`. There is no arrow-key navigation of the result list, so a mouse click is required.

#### Edge Cases
- **No match**: dropdown shows "No results found". She can keep the typed text as a free-text medicine (no stock, no usual values) or use `+ Add to Drug Database`.
- **Low stock**: stock of 5 or less renders in red in both the dropdown and the row; nothing blocks prescribing.
- **Regimen lookup fails**: "Suggestions unavailable. Enter values or select the medicine again to retry." under the name; the row stays editable.
- **Retyping the name**: editing the medicine text after selection clears the linked drug/inventory identity and wipes any still-"Suggested" values (accepted or edited ones are kept).
- **Strength missing**: a result can show an amber "Strength missing" line; still selectable.
- **Double click**: a second selection of the same drug within 600 ms is ignored (guards a double add).

---

### STORY-053: Repeat the last visit's medicines for a follow-up

**Type**: short
**Topic**: Prescription writing, printing & sharing
**Persona**: Dr. Kavya Reddy, dermatologist, reviewing a returning psoriasis patient
**Goal**: Bring forward the medicines from Meenakshi Nair's previous visit, extend one duration, and save
**Preconditions**: Meenakshi Nair (46 F) has an earlier visit with a saved prescription. A new visit is open; the Treatment table is empty.
**Ideal path**: 2 — one "repeat last prescription" action, then save.
**Alternate paths**: (a) the learned plan often does the same thing automatically: once a diagnosis is typed and the table is empty, "Treatment suggestions" may prefill with the label "Auto-filled from this patient’s last similar plan" (STORY-057); (b) `Recent meds:` chips (names only, one row at a time); (c) visit `History` tab to read the old prescription and retype; (d) a saved template. The concept is called "Reuse last meds" on the button, "Previous medications" in the toast, "last plan" in the suggestions panel.

#### Steps
1. Click the `Prescription` tab → builder loads; Treatment shows "Total items: 0" and "No items added yet".
2. Click `Reuse last meds` → button reads "Adding..." → toast "Previous medications added — Added 3 items from the last visit." Three rows appear plus a trailing blank row.
3. In the "Clobetasol Propionate Cream 0.05%" row change Duration from 2 to 4 (unit stays WEEKS).
4. Click `Create Prescription` → toast "Prescription created — 3 medications recorded for the patient." and the dialog "Go to Pharmacy?" opens ("3 medications were added to this prescription. Continue to the pharmacy module to bill them now?").
5. Click `Stay Here` → dialog closes; she stays on the visit.

#### Variations
- **Table not empty**: the button merges rather than replaces. Rows identical in name + frequency + dose pattern + when + duration are skipped; anything else is appended, so a medicine she already typed with a different duration appears twice.
- **Drop one medicine**: click the trash icon in the row's Actions cell (tooltip "Remove {medicine name}"); no confirmation.
- **Only investigations/follow-up needed again**: this button copies medicines only; the learned plan (STORY-057) is the route that also restores investigations and follow-up.

#### Edge Cases
- **No earlier prescription**: toast "No previous medications found — Could not find medications in the last visits for this patient."
- **History fails to load**: toast "Unable to load previous medications" with the server message.
- **"Last" means the nearest earlier visit that has prescription items**, not necessarily the immediately preceding visit (e.g. a photo-only procedure visit is skipped).
- **Saving twice**: clicking `Create Prescription` again updates the same prescription (toast "Prescription updated") but the button label never changes from "Create Prescription", and the "Go to Pharmacy?" dialog opens again.

---

### STORY-054: Dictate the chief complaint instead of typing

**Type**: short
**Topic**: Prescription writing, printing & sharing
**Persona**: Dr. Arjun Mehta, dermatologist, slow typist, evening clinic
**Goal**: Capture the patient's complaint by voice into "Chief Complaints"
**Preconditions**: Visit open on the `Prescription` tab. Laptop microphone available; the server has an OpenAI key configured.
**Ideal path**: 2 — tap mic, tap again to stop; text lands in the field.
**Alternate paths**: (a) type, helped by the autocomplete list that drops under the Chief Complaints box while it has focus; (b) `Skin Concerns` chips directly under the field (Acne, Pigmentation, Aging, Dryness, Sensitivity, Redness, Scarring); (c) apply a template, which also sets Chief Complaints. A second mic exists only on "On Examination" → "Detailed Examination". `/test-transcribe` (sidebar Admin → "Test Transcribe") uses the same transcription service but its text cannot be sent to a visit — it is a test bench, not a route to this goal.

#### Steps
1. In the "Chief Complaints" card click the microphone button to the right of the text box (tooltip "Start voice input") → on first use the browser asks for microphone permission.
2. Click `Allow` in the browser prompt → the button turns red with a crossed-mic icon (tooltip "Stop voice input"); recording has started. There is no timer or level meter.
3. He and the patient talk for ~20 seconds ("itching and red scaly patches on both elbows for three months, worse in winter"), then he clicks the red button → it becomes a spinner (tooltip "Transcribing recording"); the other mic button is disabled meanwhile.
4. A few seconds later the text is appended to whatever was already in the box, and the card turns green with the badge "Has Data" and "Auto-included in preview". He fixes one mis-heard word by hand.

#### Variations
- **Examination findings**: the mic beside "Detailed Examination" works the same way but inserts the full transcript, whereas the Chief Complaints mic prefers the patient's side of the conversation when the service separates speakers (so the doctor's own spoken summary may be dropped) *(inferred from `pickSpeechToTextInsert`, `frontend/src/lib/speech-to-text.ts`)*.
- **Dictating twice**: a second recording is appended after a space, never replacing the first.
- **Checking the mic first**: on `/test-transcribe` ("Voice Transcription Test") he can `Start Recording`, watch "Audio Level", `Stop Recording`, `Transcribe`, and read tabs `Combined` / `By Speaker` / `Segments`. That page is outside the dashboard shell (no sidebar; `Back to dashboard`).

#### Edge Cases
- **Permission denied**: toast "Microphone access denied" with the browser's message.
- **Unsupported browser**: toast "Voice capture unavailable — Microphone recording is not supported in this browser."
- **Silence**: toast "No speech detected — The recording may have been too quiet or contained only silence. Try speaking louder and closer to the microphone."
- **Service error / no API key**: toast "Speech-to-text error" with a status-specific message; nothing is inserted and the recording is lost.
- **Forgotten recording**: it stops by itself after 10 minutes and is then transcribed.
- **Other fields**: Diagnosis, the four history boxes, Procedures, medicine Instructions, Follow-up and custom sections have no mic.

---

### STORY-055: Send the finished prescription to the pharmacy bill

**Type**: short
**Topic**: Prescription writing, printing & sharing
**Persona**: Dr. Kavya Reddy, dermatologist, finishing a consultation while the patient gathers her things
**Goal**: Save the prescription and open a pharmacy bill already filled with its medicines
**Preconditions**: Visit open; Treatment has three medicines for Sneha Iyer (31 F, 98490 55512). Nothing saved yet.
**Ideal path**: 1 — one "save and send to pharmacy" action; the pharmacist should not need the doctor to open the bill at all.
**Alternate paths**: (a) footer `Go to Pharmacy` (shown once there is at least one medicine) → Sales bill with `patientId`, `doctorId`, `visitId` — no prescription id, and **it does not save first**; (b) Pharmacy Counter → "Prescription Queue" row `Bill`; (c) Counter cockpit `Start billing`; (d) Sales → `New sale` → prescription queue row `Load`; (e) patient detail progress tracker `Bill`; (f) from the preview, `Save Prescription` then `Close` then footer `Go to Pharmacy` (the preview's save never offers the pharmacy dialog).

#### Steps
1. Click `Create Prescription` in the builder footer → toast "Prescription created — 3 medications recorded for the patient."; dialog "Go to Pharmacy?" — "3 medications were added to this prescription. Continue to the pharmacy module to bill them now?" with `Stay Here` / `Yes, go to Pharmacy`.
2. Click `Yes, go to Pharmacy` → full page navigation to `/dashboard/pharmacy/sales/bill?patientId=…&prescriptionId=…&doctorId=…`.
3. On the Sales bill, check that "Patient & Doctor Details" shows Sneha Iyer and Dr. Kavya Reddy and that "Invoice Items" lists the three prescribed medicines (with any stock warnings). From here the bill belongs to the pharmacy flow.

#### Variations
- **Doctor only wants the pharmacist to see it**: click `Stay Here`; the saved prescription still appears in the Pharmacy Counter "Prescription Queue" and at the top of a new Sales bill without any hand-off click.
- **Naming along the way**: the dialog says "pharmacy module", the button says "Pharmacy", the destination page is the "Sales" bill whose headings say "Invoice".

#### Edge Cases
- **Footer `Go to Pharmacy` before saving**: the bill opens with patient and doctor set and loads only what is already saved on the visit. Medicines typed but never saved are not on the bill (they remain only in the browser draft `rxDraft:{patientId}:{visitId}`), and nothing warns her.
- **Tele-video visit without consent ticked**: `Create Prescription` shows the destructive toast "Patient consent required" and nothing is saved.
- **Visit changed in another tab (409)**: toast "Visit changed elsewhere" / "Clinical save conflict"; no dialog, no hand-off, the local draft is preserved.
- **Session expired**: toast "Signed out — Your session expired. Log in again and retry."
- **No medicines**: `Create Prescription` is disabled; a prescription with only investigations/advice cannot be created or handed off.

---

### STORY-056: Start from a template, adjust it, and save it as her own

**Type**: medium
**Topic**: Prescription writing, printing & sharing
**Persona**: Dr. Kavya Reddy, dermatologist, third tinea case of the day
**Goal**: Fill the prescription from the tinea template, add an oral antifungal, and keep the result as a reusable template
**Preconditions**: Visit open on the `Prescription` tab for Imran Sheikh (38 M). She has already typed a line in Chief Complaints. Templates have loaded (the bar shows the dropdown rather than "Templates will appear once loaded.").
**Ideal path**: 5 — pick template, add one medicine, open save-as-template, name-and-confirm, save prescription.
**Alternate paths**: Three template-saving routes sit side by side: `Save current` (medicines + complaint + diagnosis + examination), `Save fields` (complaint + diagnosis + examination only, no medicines), `New template` (a blank form in a large dialog, independent of the current visit). For prefilling: the learned plan (STORY-057) can also fill Treatment from a saved template, where it is called a "saved order set"; `Reuse last meds`; manual entry.

#### Steps
1. Click the `Templates` dropdown (currently "Select a template") → list: `No template`; group "Saved templates" (each with a small trash icon); group "Default templates": "Acne (Mild) — Topical regimen", "Tinea (Fungal) — Topical + Hygiene", "Eczema — Emollients + Low-potency steroid".
2. Click "Tinea (Fungal) — Topical + Hygiene" → with no confirmation the builder is overwritten: Chief Complaints becomes "Itchy annular rash in folds", Diagnosis "Tinea corporis", On Examination gets skin type IV, Morphology Plaque + Scale, Distribution Flexures, Itch Score 5, "Detailed Examination" text; Treatment shows "Clotrimazole Cream 1%" twice daily for 4 WEEKS plus a blank row. Past/Medication/Menstrual/Family history, Investigations and Procedures are cleared as well.
3. She notices her own typed complaint is gone and clicks `Undo` hoping to get it back → the medicine rows are emptied (back to how the table was when the builder loaded), but Chief Complaints, Diagnosis and the examination fields stay as the template set them — Undo/Redo only track medicine rows and Follow-up Instructions. `Redo` does not bring the Clotrimazole row back *(inferred: the snapshot taken on template apply is the pre-apply table, lines 2835–2840, 4209–4214, 4379–4393)*.
4. Open `Templates` again and re-select "Tinea (Fungal) — Topical + Hygiene" → the Clotrimazole row and the template fields are back.
5. Retype the complaint in "Chief Complaints": "Itchy ring-shaped rash in both groins for 3 weeks, spreading".
6. In the blank Treatment row type `itra` and click "Itraconazole 100mg Capsule" in the dropdown.
7. Set Frequency to `1-0-1` from the dropdown (options are dose patterns shown in capitals: 1-0-0, 0-1-0 … Q8H, PRN).
8. Set When to `After Breakfast`.
9. Click the `14d` preset chip → Duration becomes 14 DAYS on that row.
10. In "Basic Information" click the chip `Follow up in 14 days` → Follow-up Instructions fills and "Review Date" jumps to today + 14 days.
11. Scroll back to the top and click `Save current` → dialog "Save as Template" ("Provide a name to reuse this prescription layout later.", placeholder "Dermatology follow-up").
12. Type `Tinea cruris — topical + itraconazole 2 wk` and click `Save Template` → toast "Template saved — Prescription template stored for future visits."; the name now appears under "Saved templates".
13. Click `Create Prescription` → toast "Prescription created — 2 medications recorded for the patient."; dialog "Go to Pharmacy?" → `Stay Here`.

#### Variations
- **Fields-only template**: `Save fields` → dialog "Save Fields as Template" ("Save only Chief Complaints, Diagnosis, and Examination as a reusable template on this device.") → name → `Save Fields Template` → toast "Fields template saved — Template stored on server." The dialog says "on this device"; the toast says "on server".
- **Template from scratch**: `New template` → dialog "Create New Template" ("Define a reusable template for Chief Complaints, Diagnosis, On Examination, and Treatment."): Name, Chief Complaints, Diagnosis, On Examination ("General Appearance", Skin Type, Itch Score, Morphology / Distribution / Skin Concerns chips), "Add Medicine" search ("Search drug name or brand (min 2 chars)" with an `Add` button per result), `Add Row`, then `Create Template` → toast "Template created — New template is ready to use." In this dialog the medicine table has both a "Dose pattern" and a "Frequency" control per row, while the main table has one combined "Frequency" control; the same examination text is labelled "General Appearance" here and "Detailed Examination" in the builder.
- **Delete a saved template**: open the dropdown and click the trash icon (tooltip "Delete template") → it is deleted immediately, toast "Template deleted". No confirmation, and templates are saved as public, so it disappears for other doctors too *(inferred from `isPublic: true`)*.
- **Clear everything**: the red `Reset to default` button empties the medicine rows and Follow-up Instructions and deletes the local draft, with no confirmation. It does not restore any "default" content.

#### Edge Cases
- **Duplicate name**: inline red text "A template with this name already exists." under the name box plus toast "Duplicate name"; the dialog stays open.
- **Empty name**: toast "Template name required" and inline "Template name is required".
- **Template list fails to load**: toast "Could not load templates — Default templates are still available."; `Refresh` retries.
- **What `Save current` leaves out**: investigations, histories, procedures, follow-up, review date and custom sections are not stored, yet applying any template clears investigations/histories/procedures. Re-applying her saved template shows the oral medicine's Frequency as `TWICE_DAILY` rather than the `1-0-1` she picked, because the dose pattern is not saved with the template *(inferred from `persistTemplate`, lines 3122–3164, and `applyTemplateToBuilder`, lines 2799–2882)*.
- **Server/timeout error on save**: toast "Server error" / "Request timed out" with a `Retry` action.
- **Selecting `No template`**: only resets the dropdown label; it does not undo what a template filled in.

---

### STORY-057: Let the diagnosis prefill the treatment, then take control back

**Type**: medium
**Topic**: Prescription writing, printing & sharing
**Persona**: Dr. Kavya Reddy, dermatologist, who has written "acne vulgaris" prescriptions dozens of times
**Goal**: Use the automatic treatment suggestion for a new acne patient, but with her own choice of antibiotic
**Preconditions**: Visit open for Ananya Sharma (24 F), Treatment empty. Dr. Reddy has several earlier prescriptions with the diagnosis "Acne vulgaris".
**Ideal path**: 3 — enter diagnosis, glance at the proposed plan, accept it (edits optional).
**Alternate paths**: Templates dropdown (STORY-056); `Reuse last meds` (STORY-053); per-medicine "Suggested · Accept" regimen defaults (STORY-052); manual rows. The same feature is called "Treatment suggestions" (panel badge), "learned plan" (`Reapply learned plan`), "autofill" (`Undo autofill`, "Autofill paused…"), "quick-fill" (`Undo quick-fill`) and "prefilled" (title text); its source labels call templates "saved order set".

#### Steps
1. Look at the dark "Treatment suggestions" panel at the top of the "Treatment" card → title "Enter a diagnosis to see treatment suggestions."; the four tiles `Combo`, `Review`, `Labs`, `Evidence` show "—".
2. In the "Diagnosis" card type `Acne vul` → a suggestion list drops down; click "Acne vulgaris" → the card turns green ("Has Data", "Auto-included in preview").
3. Watch the panel: "Reading recent plans, patterns, and saved order sets…" pulses, then, without any click, the title becomes "Treatment prefilled from previous plans" with chips "Learned from 6 similar prescriptions", "Practice-backed" and "Matched on Acne vulgaris"; pills list the medicines; tiles read Combo 3 / Review 42d / Labs 0 / Evidence 6. The Treatment table now holds three rows, Follow-up Instructions and Review Date are filled.
4. She did not ask for this and pauses to read the rows: Adapalene Gel 0.1%, Benzoyl Peroxide Gel 2.5%, Azithromycin 500mg Tablet.
5. She prefers doxycycline: click the trash icon on the Azithromycin row (tooltip "Remove Azithromycin 500mg Tablet") → the panel title changes to "Customized after autofill." ("The suggested regimen is still available, but your edits now take precedence.").
6. In the blank row type `doxy`, click "Doxycycline 100mg Capsule" → usual values load with "Suggested · Accept" hints.
7. Change her mind about the follow-up interval: under "Review Date" click the `30d` chip (the chips offered here are `6w`, `7d`, `2w`, `3w`, `30d`) → the date moves to today + 30 days. Follow-up Instructions keeps its earlier "Follow up in 6 weeks" because the chip only writes the text when it is empty — the two now disagree until she edits the text.
8. Edit "Follow-up Instructions" to `Follow up in 30 days`.
9. Click `Create Prescription` → toast "Prescription created — 3 medications recorded for the patient."; dialog "Go to Pharmacy?" → `Stay Here`.

#### Variations
- **She had already typed medicines before the diagnosis**: nothing is overwritten; the panel says "Learned plan ready. Your manual edits were preserved." and offers `Reapply learned plan` (replace everything) and `Fill missing only` (toast "Missing fields filled — The learned plan only filled blank treatment details and missing medications.").
- **Reject the prefill**: click `Undo autofill` → the table returns to its previous state and the panel reads "Autofill paused for this diagnosis." until she clicks `Reapply learned plan` or changes the diagnosis.
- **`Fill missing only` with nothing to add**: toast "Already covered — The current treatment already includes the learned plan details."
- **Returning patient**: the source chip reads "Auto-filled from this patient’s last similar plan", overlapping with `Reuse last meds`.

#### Edge Cases
- **No pattern**: "No strong pattern yet for this diagnosis." with the hint to "Keep building manually once."
- **History partly unavailable**: amber note "Some practice pattern signals are temporarily unavailable." or title "Pattern learning is partially offline right now."
- **Changing the diagnosis text while the table is still exactly as auto-filled**: the table is replaced again by the plan for the new diagnosis, silently *(inferred from the auto-apply effect, lines 2229–2233)*.
- **Second diagnosis entry point**: the "Dermatology Diagnoses" chips inside "On Examination" (Acne vulgaris, Atopic dermatitis, Psoriasis …) are saved into the same diagnosis list as the "Diagnosis" box but do not drive the suggestions panel.
- **Investigations suggested by the plan** are ticked in the "Investigations" card further down the page, out of sight of the Treatment card.

---

### STORY-058: Print the prescription in Telugu for a patient who does not read English

**Type**: medium
**Topic**: Prescription writing, printing & sharing
**Persona**: Dr. Kavya Reddy, dermatologist; patient Lakshmamma (58 F) from Nalgonda reads only Telugu
**Goal**: Hand over a printed prescription whose advice and instructions are in Telugu
**Preconditions**: Visit open; diagnosis, two medicines with English instructions, and follow-up are filled. Server translation (OpenAI) is configured.
**Ideal path**: 3 — choose Telugu, preview, print.
**Alternate paths**: none found for triggering translation — it runs only when `Print Preview` is clicked with Language ≠ English. (The API also exposes `prescriptions/translations` "translation memory" endpoints, but the builder calls `POST /visits/translate`.)

#### Steps
1. Scroll to "Basic Information" near the bottom of the builder (below Investigations and any custom sections).
2. Open the `Language` select (English / Telugu / Hindi) and choose `Telugu` → a blue box appears: "Translation enabled — On print preview, free‑form fields will be translated to Telugu. This includes: Diagnosis, Chief complaints, Histories, Family history (other), Post‑procedure care, Procedures, Procedure planned, Investigations, Custom sections, and per‑medication notes. Medication names, numbers, and units remain unchanged." Small translate icons appear beside the free-text labels and the Investigations card title becomes "Investigations (translates)".
3. Scroll up to Treatment and rewrite the shorthand in each Instructions cell as full sentences ("Apply a thin layer on the affected area and 2 cm beyond", "Take after food"), since only this column of the medicine table is translated.
4. Click `Add Custom Section` → a card appears with Section Title prefilled "Additional Advice" and an empty Content box.
5. Type in Content: `Keep the area dry. Do not share towels. Wash clothes in hot water.`
6. Click `Print Preview` in the footer → the button reads "Preparing…"; toast "Translating… — Preparing 7 field(s) in Telugu"; then the full-screen "Prescription Preview" opens.
7. Read the page: diagnosis, complaint, advice, follow-up and the Instructions column are in Telugu; medicine names are unchanged; the labels ("Rx", "Medicine / Frequency / When / Duration / Instructions", "Review Date", "Follow-up Instructions") and the values in Frequency / When / Duration (e.g. "1-0-1", "After Breakfast", "4 weeks") stay in English. She wonders whether the patient will understand "After Breakfast".
8. One Telugu phrase reads oddly: click `Close`, fix the English sentence, click `Print Preview` again → only because the text changed, a new translation request is made (unchanged content is served from an in-memory cache).
9. Click `Print` → the visit and prescription are saved first (toast "Prescription created — 2 medications recorded for the patient."), then the browser print dialog opens; print.

#### Variations
- **Hindi**: identical with `Hindi`; toast reads "…in Hindi".
- **Custom "When" in Telugu**: she can add her own timing text via When → `+ Custom...` → "Add Custom Timing" and type it in Telugu herself; it prints as typed.
- **English prescriptions**: every click of `Print Preview` shows a toast "Print Preview — Language is English. Skipping translation." before the preview opens.

#### Edge Cases
- **Translation service down / no key**: the preview still opens with the original English text and the warning toast "Translation unavailable — Showing original text. Check server OPENAI_API_KEY and network." (server-configuration wording shown to the doctor).
- **Language is per visit draft**: the choice is stored in the local draft for this patient + visit and sent with the saved prescription; the next patient starts in English again.
- **Stale copy**: the blue box lists "Post‑procedure care", a field that no longer exists in the builder.
- **Partial translation response**: any field without a returned translation prints in English beside translated ones.
- **Nothing to translate** (no free text at all): preview opens untranslated with no message.

---

### STORY-059: Fit the prescription on one pre-printed letterhead page, signed

**Type**: medium
**Topic**: Prescription writing, printing & sharing
**Persona**: Dr. Arjun Mehta, visiting dermatologist who prints on pre-printed clinic stationery
**Goal**: Print a five-medicine prescription on a single sheet, clear of the pre-printed header and footer, with his signature image
**Preconditions**: Visit open with five medicines, investigations and follow-up filled for Farhan Qureshi (52 M). His signature is already uploaded (STORY-060). An A4 printer is loaded with pre-printed letterhead paper.
**Ideal path**: 3 — open preview (remembering his last layout), confirm it fits, print.
**Alternate paths**: Margins can be set in four places: the preview sliders `Top margin` / `Bottom margin` (per visit), the visit's `Customization` tab ("Top/Bottom/Left/Right Margin (px)", saved for the doctor with `Save Doctor Default`), a `Printer profile` (selectable in the preview; no screen to create one was found), and an enforced minimum when the built-in letterhead is used. Letterhead can be chosen in three places: header cog → "My Settings" → "Prescription letterhead"; `Customization` → "Print Background Image URL (optional)" / `Choose File`; preview `Letterhead` select. Print format is selectable both in the builder footer (`Print` → Table / Text) and in the preview ("Print Format").

#### Steps
1. Click `Print Preview` in the builder footer → toast "Print Preview — Language is English. Skipping translation."; the full-screen "Prescription Preview" opens: paginated pages on the left, a controls column on the right starting with the "📋 Print Settings Tip" box. "Processing pagination..." shows briefly; a pill reads "Page 1 of 2".
2. In the `Letterhead` select change "Letterhead (doctor's own)" to `None (Plain)` so the background image is not printed over the pre-printed paper (helper text: "Applies to preview and PDF download.").
3. Drag the `Top margin` slider right until the readout shows about 53 mm, so the text starts below the pre-printed header.
4. Drag `Bottom margin` to about 23 mm for the pre-printed footer strip.
5. Tick `Fit to 1 page` → "Space-optimized layout", "Line spacing" and the four "Break before …" boxes grey out; after re-pagination the status line reads "Fits on 1 page with text at 12.5 px." and the page pill disappears.
6. Tick `Show signature` → his signature image appears bottom-right above "Dr. Arjun Mehta" (helper: "Remembered for this doctor on this browser. Applies to print, PDF, WhatsApp and Email.").
7. Use the `Zoom` slider (60–140 %) to check the bottom edge of the page against the footer area.
8. Click `Interactions` → dialog "Interaction Summary" ("Preview potential interactions based on current items.") lists pairs with Severity and Recommendation, or "No interactions found." → `Close`.
9. Click `Print` → the visit and prescription are saved (toast "Prescription created — 5 medications recorded for the patient."), then the browser print dialog opens.
10. In the browser dialog open "More settings" and switch off "Headers and footers" as the tip box instructs, then print.
11. Back in the app click `Close` to leave the preview.

#### Variations
- **Clinic letterhead image instead of pre-printed paper**: leave `Letterhead` on "Letterhead (doctor's own)" (or "(Dr. Praneeta Jain)" for the bundled one, "(Custom)" for a Customization URL, "(none uploaded)" when there is none). With the bundled letterhead the top margin cannot go below 200 px (about 53 mm) and the bottom below 86 px, whatever the sliders say.
- **Just tighter, not shrunk**: tick `Space-optimized layout` ("Inline headers for patient info, vitals, diagnosis, histories, and procedures. Forces Rx table format.") and/or set "Line spacing" to Compact or Tight instead of Fit to 1 page.
- **Force a page split**: tick `Break before Rx`, `Break before Investigations`, `Break before Follow-up` or `Break before Signature`.
- **Keep margins for every patient**: go to the visit's `Customization` tab, type the margins in px, click `Save Doctor Default` (toast "Saved — Doctor profile updated"); they load automatically for his future visits.
- **Other toggles in the column**: `Refill stamp`, `High contrast`, `Live Preview: Off/On`, `Reset margins`.

#### Edge Cases
- **Too much content**: amber status "Too much content for one page at a readable size. Printing on 2 pages with text at 11 px." — text is never shrunk below 11 px.
- **Settings do not carry over**: `Fit to 1 page`, `Space-optimized layout`, Line spacing and Print Format reset every time the builder is reloaded; slider margins, letterhead choice, page breaks and refill stamp are stored only in this patient-and-visit draft. Only `Show signature` is remembered per doctor (in this browser). For the next patient he repeats steps 2–5 unless he used the Customization tab.
- **Slider units**: the sliders move in pixels (0–300 and 0–200) while the readout is in mm.
- **No signature uploaded**: the checkbox is disabled with "No signature uploaded. The doctor can add one in My Settings → Doctor signature."; a blank signing space is printed.
- **Signature fails to load**: red text "Could not load the doctor’s signature. Retry before printing with a signature." with a `Retry` link; at print time, toast "Print failed — The signature image could not be loaded. Please retry."
- **Printing before pagination finishes**: `Print` is disabled while "Processing pagination..."; if no page is ready, toast "Print failed — No paginated preview is ready yet."
- **Pagination crash**: toast "Pagination Error — Failed to process document. Please check your content and try again."
- **`Live Preview: On`**: an effect reopens the preview whenever it is closed while this is on, so `Close` appears not to work until he toggles it back to Off *(inferred from lines 3433–3435)*.
- **Printing always saves**: `Print` writes the prescription (and visit) to the server first; a save failure ("Save required before export" or a conflict toast) blocks printing entirely.

---

### STORY-060: One-time set-up of signature and letterhead

**Type**: medium
**Topic**: Prescription writing, printing & sharing
**Persona**: Dr. Arjun Mehta, newly joined dermatologist, first day, before his first patient
**Goal**: Make his prescriptions print on his own letterhead with his signature
**Preconditions**: Signed in with role DOCTOR on a desktop (the header cog is hidden on mobile). He has `mehta-signature.png` (transparent, 180 KB) and `mehta-letterhead-a4.jpg` (1.9 MB) on the computer.
**Ideal path**: 4 — open settings, upload signature, upload letterhead, done (signature shown by default afterwards).
**Alternate paths**: Letterhead: (a) "My Settings" → "Prescription letterhead" (server-stored, per doctor); (b) visit → `Customization` tab → "Print Background Image URL (optional)" with `Choose File` / `Clear` (kept in this browser per doctor) and "Per-doctor Letterhead Profile" → `Save Doctor Default` / `Load Doctor Default` (stored on the user record); (c) preview `Letterhead` select to switch it off for one print. Signature: "My Settings" only — an admin cannot upload it for him ("Only you can change your signature.").

#### Steps
1. Click the cog icon in the top header (accessible name "Open settings") → dialog "My Settings" opens with sections "Doctor signature", "Prescription letterhead", working hours and WhatsApp options.
2. In "Doctor signature" read: "Upload your signature, then select “Show signature” in Print Preview. PNG or JPG, up to 2 MB. Transparent backgrounds are supported." Below: "No signature uploaded. Space is left for signing by hand."
3. Click the file input labelled "Upload signature" and choose `mehta-signature.png` → status "Saving signature…" then "Signature saved."; a preview of the image appears; the label changes to "Replace signature" and a `Remove signature` button appears.
4. In "Prescription letterhead" read: "Your prescriptions print on this full-page image. Use an A4 portrait PNG or JPG, up to 5 MB." Below: "No letterhead uploaded. Prescriptions print on plain paper."
5. Click "Upload letterhead" and choose `mehta-letterhead-a4.jpg` → "Saving letterhead…" then "Letterhead saved."; thumbnail shown; `Remove letterhead` appears.
6. He sees `Close` and `Save` at the bottom and is unsure whether the uploads need `Save` (each section says "Changes save immediately."). He clicks `Save` anyway (it saves the working-hours and WhatsApp options, not the uploads).
7. Open his first visit and click the `Prescription` tab; add one medicine (STORY-052) so there is something to print.
8. Click `Print Preview` → the page shows his letterhead as the background; the `Letterhead` select reads "Letterhead (doctor's own)". The signature is **not** shown.
9. Tick `Show signature` in the right column → the signature appears above "Dr. Arjun Mehta"; this choice is now remembered for him on this browser.
10. The body text overlaps the letterhead's logo band: drag `Top margin` until the text clears it (or set "Top Margin (px)" in the `Customization` tab and `Save Doctor Default` so it sticks — see STORY-059).

#### Variations
- **Replace later**: choosing a new file under "Replace signature" / "Replace letterhead" swaps it immediately; an open preview picks up the change.
- **Clinic-supplied letterhead**: for the doctor who has the bundled image, the section shows the thumbnail with "Clinic-supplied letterhead." and the preview label is "Letterhead (Dr. Praneeta Jain)".
- **One-off background**: in `Customization`, `Choose File` embeds an image for this browser only and overrides the uploaded letterhead (preview label "Letterhead (Custom)"); `Clear` returns to his own letterhead.

#### Edge Cases
- **Wrong type or too large**: "Choose a PNG or JPG image up to 2 MB." (signature) / "…up to 5 MB." (letterhead); nothing is uploaded.
- **Signature load failure in settings**: "Could not load your signature. Please retry." with `Reload signature`.
- **Different computer**: the uploaded files follow him, but `Show signature` is per browser, so on another PC the signature is hidden again until re-ticked.
- **Non-doctor roles**: "My Settings" has no signature/letterhead sections; an admin writing a prescription on a doctor's visit gets that doctor's letterhead and signature but cannot change them.
- **Naming**: the same image is "Prescription letterhead" (settings), "Print Background Image" (Customization), "Letterhead" (preview) and part of a "Per-doctor Letterhead Profile" that actually stores margins and offsets too. The header's `Branded` toggle is unrelated — it only recolours the app.

---

### STORY-061: Share the prescription by WhatsApp, e-mail and PDF

**Type**: medium
**Topic**: Prescription writing, printing & sharing
**Persona**: Dr. Kavya Reddy, dermatologist, finishing a tele-video review on her clinic desktop
**Goal**: Get the prescription PDF to Priya Menon (29 F, phone 98661 20347, priya.menon@example.com) on WhatsApp and e-mail, and keep a copy
**Preconditions**: Tele-video visit open with "Patient consented to tele-video consultation" ticked; three medicines and a follow-up instruction entered; nothing saved yet. Desktop Chrome with WhatsApp Web signed in. SMTP configured on the server.
**Ideal path**: 3 — open preview, send on WhatsApp (delivered with the PDF attached), send by e-mail.
**Alternate paths**: none found inside this topic for sending a prescription other than the preview buttons. Related but different: Patients → `More` → `WhatsApp` sends an appointment reminder; the Sales register `Send on WhatsApp` sends a bill message. The server has unused routes for the same goal — `POST /prescriptions/:id/share` (WhatsApp or e-mail, server-rendered PDF) and the WhatsApp branch of `:id/share-preview` — and the Users → WhatsApp Template Editor has a "Prescription Share" touchpoint; the preview's WhatsApp button uses none of them. Saving can happen by four routes: footer `Create Prescription`, preview `Save Prescription`, or implicitly through `Print`, `Download PDF` and `PDF via WhatsApp`.

#### Steps
1. Click `Print Preview` → the full-screen preview opens; the header strip shows "Priya Menon • Dr. Kavya Reddy", "Date: … • Consultation: Tele-video" and chips "Rx: 3", "Investigations: 0", "Follow-up: Yes"; the page ends with the tele-video disclaimer above the signature block.
2. Hover `Email` → it is greyed out with the tooltip "Save the prescription first". (`PDF via WhatsApp` and `Download PDF` are enabled and say "Saves the latest visit details before exporting".)
3. Click the green `Save Prescription` → "Saving…" → toast "Prescription created — 3 medications recorded for the patient."; `Email` becomes active. No "Go to Pharmacy?" dialog appears from here.
4. Click `PDF via WhatsApp` → the prescription is saved again (toast "Prescription updated"), toast "Generating PDF…  — Preparing prescription for WhatsApp.", then `prescription-<id>.pdf` lands in Downloads and a new browser tab opens `wa.me/<patient digits>` with the draft message "Hi, please find your prescription attached."; toast "PDF downloaded — Attach the downloaded PDF in the WhatsApp chat that just opened."
5. In the WhatsApp tab click "Continue to chat" / open WhatsApp Web (WhatsApp's own screens).
6. Click the paper-clip, choose Document, pick the downloaded PDF from Downloads and send.
7. Switch back to the ClinicMS tab.
8. Click `Email` → button reads "Sending…"; the prescription is saved once more, the PDF is rendered and uploaded; toast "Email sent — Prescription PDF sent by email." (subject "Your Prescription", body "Your prescription is attached.").
9. Click `Download PDF` → another save, toast "Generating PDF… — Capturing prescription preview.", file `prescription-<id>.pdf` downloads, toast "PDF ready — Prescription PDF downloaded." (she now has two identical files in Downloads).
10. Click `Close`.

#### Variations
- **On a phone or tablet** (browser supports file sharing): `PDF via WhatsApp` opens the device share sheet with the PDF attached (title "Prescription", text "Your prescription is ready."); she picks WhatsApp and the contact herself; toast "Shared — Prescription shared successfully." Cancelling the sheet shows nothing.
- **Signature and letterhead in the shared file**: the PDF is an image capture of the on-screen preview, so whatever is set in the right column (`Letterhead`, `Show signature`, Fit to 1 page, language) is exactly what is sent.
- **Send to a relative's number**: not possible here — recipient phone and e-mail are taken from the patient record; there is no field to type another.

#### Edge Cases
- **No phone on file**: toast "No phone number — Patient has no phone number on file." (after the save has already happened).
- **Phone stored without country code**: the link is built from the stored digits as they are; no "91" is added in this handler, so a 10-digit number may open the wrong or no chat *(inferred from line 6421–6422)*.
- **No e-mail on file**: toast "Email failed — Patient has no email address on file."
- **SMTP/server failure**: toast "Email failed" with the server message; the prescription stays saved.
- **Tele-video consent not ticked**: every save/export is refused with "Patient consent required" (or "Save required before export").
- **Save conflict (409)**: the export is abandoned with "Visit changed elsewhere" / "Clinical save conflict"; nothing is printed, downloaded or sent.
- **PDF render failure**: toast "PDF failed — Could not generate PDF. Your saved details are retained; please retry." or "WhatsApp failed — Could not share prescription PDF."
- **Pop-up blocker**: the PDF downloads but the WhatsApp tab may be blocked; the toast still says a chat "just opened".
- **Shared PDFs are rasterised pages** (text cannot be selected or searched by the patient) — see `docs/PRESCRIPTION_PDF_PIPELINE.md`.
- **No medicines**: `Save Prescription` reads "Add medications to save" and is disabled; `Email` stays disabled, while WhatsApp/Download still export a visit summary named after the visit id.

---

### STORY-062: New acne patient — complete prescription from blank page to pharmacy bill

**Type**: long
**Topic**: Prescription writing, printing & sharing
**Persona**: Dr. Kavya Reddy, dermatologist, first consultation of a new patient on a Saturday morning
**Goal**: Document the consultation, prescribe four medicines (one not yet in the drug master), order hormone tests, give written advice, print and WhatsApp the prescription, and pass it to the pharmacy
**Preconditions**: Ananya Sharma (24 F, phone 98480 12345) was booked and the visit started from the appointment (`Start Visit`). In-person consultation. Dr. Reddy's signature and letterhead are uploaded and `Show signature` was ticked on this browser earlier. The nurse has not entered vitals.
**Ideal path**: 14 — complaint, diagnosis (plan prefills), confirm plan, add two medicines (2 actions each), add the missing product (1 dialog), tick tests, advice, follow-up, preview, one "save + print + send + hand to pharmacy" action each (4). Examination chips are optional extras.
**Alternate paths**: Vitals can instead be entered on the visit's `Vitals` tab; investigations on the `Lab Tests` tab; procedures on the Procedures page; medicines via template / `Reuse last meds` / learned plan / manual; saving via `Create Prescription`, `Save Prescription` or any export button; pharmacy hand-off via the post-create dialog, footer `Go to Pharmacy`, or the pharmacy's own queues (STORY-055).

#### Steps
1. In the visit form click the `Prescription` tab → the builder shows the Templates bar ("Select a template") and the section cards; the Treatment panel says "Enter a diagnosis to see treatment suggestions."
2. In "Clinical Details & Vitals" type Height `162`, Weight `58` → BMI shows 22.1 (read-only); type BP (Sys) `110`, BP (Dia) `70`, Pulse (bpm) `78`. (These are the same vitals as the separate `Vitals` tab.)
3. In "Chief Complaints" click the microphone (tooltip "Start voice input"); the browser already has permission, so the button turns red at once.
4. Let the patient describe the problem, then click the red button → spinner → the text "pimples on cheeks and jawline for one year, worse before periods, leaves dark marks" is inserted; the card turns green ("Has Data").
5. Click the `Acne` and `Scarring` chips under "Skin Concerns" (2 clicks).
6. In "Diagnosis" type `Acne vul` and click "Acne vulgaris" in the list.
7. Glance at Treatment: the panel pulses "Reading recent plans, patterns, and saved order sets…" and then prefills on its own — title "Treatment prefilled from previous plans", chips "Learned from 6 similar prescriptions" / "Practice-backed", rows Adapalene Gel 0.1% and Benzoyl Peroxide Gel 2.5%, Follow-up Instructions "Follow up in 6 weeks" and a Review Date. She decides to keep it and continue with the history first.
8. In "Patient History" type Past History `No previous isotretinoin`, Menstrual History `Irregular cycles, 40–45 days`, tick Family History `Thyroid`, and type Personal history `Uses heavy foundation daily; night shifts` (4 entries).
9. In "On Examination" (expand it if collapsed) choose Fitzpatrick Skin Type `IV`, type Acne Severity `moderate`, click Morphology chips `Comedo`, `Papule`, `Pustule`, Distribution chip `Face`, and the "Dermatology Diagnoses" chip `Acne vulgaris` (7 actions). She notices the diagnosis is now entered in two places.
10. Back in Treatment, click into the blank last row, type `doxy` and click "Doxycycline 100mg Capsule" (Stock: 60) → usual values load with "Suggested · Accept" hints.
11. Change Duration to `6` and the unit to `WEEKS` (2 actions).
12. In the next blank row type `Photostable SPF 50` → dropdown: "No results found".
13. Click `+ Add to Drug Database` (above the table) → dialog "Add Drug to Database" ("Quickly add a new drug record and insert into this prescription."). The form is empty — what she just typed in the row is not carried over.
14. Fill Name `Photostable SPF 50 Sunscreen Gel 50g`, Manufacturer `Sun Pharmaceuticals`, Price (₹) `675`, Pack Size Label `tube of 50 g`.
15. Click `Save & Add` → toast "Drug added — Drug saved to database and added to prescription."; a **new** row with the product is appended at the bottom, while the row where she typed "Photostable SPF 50" is still there as a free-text medicine.
16. Click the trash icon on the stray free-text row (tooltip "Remove Photostable SPF 50").
17. On the sunscreen row choose Frequency `1-1-0`.
18. Open When → `+ Custom...` → dialog "Add Custom Timing" (hint "Stored as entered.") → type `Before stepping out` → `Add & Apply` (3 actions).
19. Type Instructions `Two finger-lengths on face and neck; reapply every 3 hours outdoors`.
20. In "Investigations" tick `Total Testosterone`, `S. Prolactin` and `TSH` (3 clicks). (The separate `Lab Tests` tab has its own test checklist.)
21. In "Add Custom Investigation" type `DHEAS` and click `Add` → it is ticked and added to the clinic's saved list (visible under "Manage saved investigations").
22. Click `Add Custom Section` → a card with Section Title "Additional Advice"; type Content `Do not pick or squeeze lesions. Avoid oil-based cosmetics. Wash face twice daily with a gentle cleanser.`
23. In "Basic Information" confirm Follow-up Instructions reads "Follow up in 6 weeks" and "Review Date" shows the date six weeks out (both came from the prefill); leave Language on English.
24. Click `Print Preview` → toast "Print Preview — Language is English. Skipping translation."; full-screen preview; "Processing pagination..."; pill "Page 1 of 2".
25. Tick `Fit to 1 page` → status "Fits on 1 page with text at 13 px."; the signature is already showing because `Show signature` is remembered.
26. Click `Interactions` → dialog "Interaction Summary" → "No interactions found." → `Close` (2 clicks).
27. Click the green `Save Prescription` → "Saving…" → toast "Prescription created — 4 medications recorded for the patient."
28. Click `Print` → saved again (toast "Prescription updated"), browser print dialog opens → print → hand the sheet to the patient.
29. Click `PDF via WhatsApp` → saved a third time, PDF downloads, WhatsApp opens in a new tab with "Hi, please find your prescription attached." → attach the downloaded file and send (3 actions in WhatsApp), then return to the ClinicMS tab.
30. Click `Close` to leave the preview → back on the builder; the footer shows "Total items: 4 • Total qty: …".
31. Click `Go to Pharmacy` in the footer → navigates to `/dashboard/pharmacy/sales/bill?patientId=…&doctorId=…&visitId=…`; the bill shows Ananya Sharma, Dr. Kavya Reddy and the four prescribed lines; the just-created sunscreen has no inventory batch yet, so it is expected to carry a stock warning *(inferred)*.
32. Tell the pharmacist the bill is open — or simply leave it: the prescription is also waiting in the Pharmacy Counter "Prescription Queue".

#### Variations
- **Save from the builder instead of the preview**: skip step 27, `Close` the preview and click `Create Prescription` → dialog "Go to Pharmacy?" → `Yes, go to Pharmacy`, which carries the prescription id and replaces step 31.
- **Telugu-speaking patient**: before step 24 set `Language` to Telugu (STORY-058); steps 24–29 then use the translated preview.
- **Template start**: at step 1 pick "Acne (Mild) — Topical regimen" from `Templates` instead of waiting for the suggestion panel; note it would also overwrite anything already typed in complaint/diagnosis/examination.
- **Interrupted by a phone call**: she can leave the page; the builder writes a local draft 600 ms after each change and on tab hide/unload, and restores it when the same patient + visit is reopened on the same browser.
- **Nurse already recorded vitals**: step 2 is skipped; the values appear in the print from the visit record.

#### Edge Cases
- **Duplicate drug**: at step 15, if a drug with the same name and manufacturer exists: toast "Duplicate detected — A drug with the same name and manufacturer already exists."; missing name/manufacturer: "Missing details — Name and Manufacturer are required."
- **Prefill arrives while she is typing a first medicine**: if she starts a row before the diagnosis suggestion lands, nothing is overwritten and the panel reads "Learned plan ready. Your manual edits were preserved."
- **"Total qty" is not editable**: the footer total sums a per-medicine quantity that has no input in the table; it is 0 for rows she typed and non-zero only when a reused, learned or template row carried a quantity, so the doctor cannot state how many units to dispense.
- **"Detailed Examination" text** is saved with the visit but is not printed on the prescription (see `docs/PRESCRIPTION_PDF_PIPELINE.md`).
- **Three saves, one prescription**: steps 27–29 each call save; the second and third are updates of the same record ("Prescription updated"), each with its own toast.
- **Visit completion**: merely opening the preview (step 24) marks the "prescription" section complete for the visit's progress bar, before anything is saved *(inferred from `onPreview`, `MedicalVisitForm.tsx:2433`)*.
- **Network drop at step 27**: toast "Connection timed out — Network was slow while saving. Please retry in a few seconds."; the draft stays in the browser and print/WhatsApp/e-mail are blocked until a save succeeds.
- **Another device edited the visit**: toast "Visit changed elsewhere"; the visit form's conflict gate takes over and exports are refused.

---

### Pharmacy desk, counter & dispensing

Source: `topics/pharmacy-desk-counter.md`

### STORY-063: Start-of-shift look at the Pharmacy Desk and a jump to the low-stock list

**Type**: short
**Topic**: Pharmacy desk, counter & dispensing
**Persona**: Farheen Begum, pharmacist, 9:40 am before the first OPD patients come out
**Goal**: See yesterday-vs-today figures and find out which medicines are running low before the rush
**Preconditions**: Logged in as PHARMACIST; some stock is below its alert level
**Ideal path**: 2 — open the Desk (figures visible), click the "low" figure to open the low-stock list.
**Alternate paths**: Inventory (sidebar) → Today → "Low stock" queue; Inventory → Stock › Stock list → stock-level filter "Low stock"; Dashboard "System Alerts" card; header notification bell (low stock item → `/dashboard/inventory?tab=low-stock`, which also lands on Today); Reports & Analytics alerts strip "Low Stock" (owner/admin/manager only).

#### Steps
1. Click sidebar **Pharmacy Desk** → `/dashboard/pharmacy?section=desk` loads ("Loading pharmacy dashboard…" skeleton first). A dark header shows "Pharmacy Desk" with the pill "Command center" and the line "Queue, review, pick, bill, pay, dispense."; four figures `Sales` (₹ today, growth %), `Invoices` (count, "n pending"), `Stock` (count, "9 low"), `Packages` (count, "bundles"); buttons `Quick Guide`, `Refresh`, `Invoices`, `Drugs`; three quick-action tiles `Pharmacy Counter` ("Review and pick"), `New sale` ("Bill a prescription or walk-in"), `Inventory Control` ("Shelves, invoice scanning, expiry"). Below: the "Pharmacy AI assistant" launcher, "Partner Daily Sync" and "Treatment Packages".
2. Reads "Stock 412 · 9 low" and clicks the figure → nothing happens; the four figures are plain text, not links. *(Hesitation: the number invites a click.)*
3. Clicks the quick-action tile **Inventory Control** → browser goes to `/dashboard/inventory?tab=pharmacy-control`. The Inventory workspace does not read `tab`, so it opens on its default **Today** area ("What needs attention") rather than a shelf / scanning / expiry screen.
4. In "What needs attention" clicks the **Low stock** queue row → filtered stock list of low items.
5. Clicks sidebar **Pharmacy Counter** to begin dispensing (or goes back to the Desk and uses the `Pharmacy Counter` tile — both end on `?section=counter`).

#### Variations
- **Reception (Riya)**: the Desk shows no figures and no `Refresh` / `Invoices` / `Drugs` / `New sale`; only `Quick Guide`, `Pharmacy Counter` and `Inventory Control` (two tiles). The AI assistant launcher, Partner Daily Sync form and `Create Package` button are still rendered for her (see STORY-071/072 edge cases).
- **Refresh figures**: `Refresh` in the dark header re-fetches `/pharmacy/dashboard` only; Partner Daily Sync has its own `Refresh`, and the package list reloads only after a package is created.
- **Quick Guide**: opens "Pharmacy Management Guide"; its "Inventory Controls" section still says "Use Inventory > Pharmacy Control for Excel import / invoice scanning" — an area that does not exist.
- **Owner**: has no Pharmacy Desk/Counter sidebar entry; can only arrive by typing the URL.

#### Edge Cases
- **Figures fail to load**: the error is only logged; all four figures silently show `₹0.00` / `0`, indistinguishable from a real zero day.
- **`?section=billing|invoices|payments` or any `patientId/prescriptionId/doctorId/visitId` in the URL**: the server component redirects to a new Sales bill before the Desk renders (`pharmacyBillingRedirect`).
- **Session expired**: `/auth/me` fails → "Redirecting to login..." → `/login?next=<current pharmacy URL>`.

---

### STORY-064: Dispense a doctor's prescription from the Counter cockpit, start to finish

**Type**: long
**Topic**: Pharmacy desk, counter & dispensing
**Persona**: Farheen Begum, pharmacist, 11:15 am, three patients waiting at the hatch
**Goal**: Review, pick and bill Sravani Reddy's acne prescription (3 medicines, all in stock) and see it leave the queue
**Preconditions**: Dr. Anitha Rao created an ACTIVE prescription for Sravani Reddy (P-0412) less than 24 h ago: Isotroin 20 mg cap, Deriva-BPO gel, Photostable Gold SPF 55. All three are linked to inventory with unexpired stock. No pharmacy bill exists for it yet.
**Ideal path**: 6 — open Counter, select the prescription, accept all lines in one action, open the bill, confirm + take payment, done (queue updates itself).
**Alternate paths**:
- "Prescription Queue" table under the cockpit → row `Bill` (skips review entirely — STORY-066).
- Sales (sidebar) → `New sale` → queue at the top of the bill page → row `Load`.
- Pharmacy Desk → `New sale` → same bill-page queue → `Load`.
- Doctor side: prescription builder `Go to Pharmacy` / post-create dialog `Yes, go to Pharmacy`; patient progress tracker `Bill` (all open the same Sales bill prefilled).
- Inside the cockpit the same "open the bill for the active prescription" handler sits behind four buttons: header `Bill`, footer `Open bill`, Pick + Pay `Collect payment` (and `Start billing` / `Walk-in bill` when nothing is active).

#### Steps
1. Click sidebar **Pharmacy Counter** → `/dashboard/pharmacy?section=counter`. The page shows the title "Pharmacy Counter" and, directly under it, the cockpit's own dark header also titled "Pharmacy Counter" with badges "Pharmacist review" and "Shelf locations", the line "Queue to pick to bill in one workstation.", four counters `Queue` / `Review` / `Exceptions` / `Ready/Paid`, and buttons `Refresh`, `Rx queue`, `Bill`.
2. Scan the left **Queue** column ("7 today or open", tiles `Queued` and `Exceptions`, filter chips `All` / `Queue` / `Review` / `Exceptions` / `Done`). The cockpit lists only the 8 newest prescriptions (newest first) and has already highlighted the newest pending one — not Sravani.
3. Click header **Rx queue** hoping for the full list → nothing happens (on this page the button's handler is empty). *(Hesitation.)* The full list is the separate "Prescription Queue" table further down the page.
4. Click **Sravani Reddy**'s card ("3 medicines · 38m pending") → the card turns dark; a dispense task is created and moved to review (chip changes from "Queued" to "Review").
5. Middle column **Active Dispense** now reads "0/3 lines reviewed" with a patient strip: "Sravani Reddy", badge "In Review", "Dr. Anitha Rao · {date time} · {prescription id}", and a rail of eight status pills (Queued, In Review, Partially Filled, Paused, Ready to Bill, Paid, Dispensed, Cancelled). A spinner "Checking stock and batch expiry" is replaced by a table: `Prescription` / `Inventory Match` / `Stock` / `Shelf and batch` / `Action`.
6. Read line 1: "Isotroin 20 mg" · "1-0-0" · "30 DAYS"; Inventory Match shows the stocked product and manufacturer; Stock badge "IN STOCK" and "Qty 30"; shelf "Rack B2", batch number, expiry.
7. Click **Accept** on line 1 → pill turns dark, header "1/3 lines reviewed".
8. Click **Accept** on line 2 (Deriva-BPO gel).
9. Click **Accept** on line 3 (sunscreen) → "3/3 lines reviewed"; the server moves the task to Ready to Bill on its own: badge "Ready to Bill", footer text changes from "Review every medicine before billing" to "Ready for billing review", queue chip reads "Bill", header counter `Ready/Paid` goes up, `Ready` button becomes enabled.
10. Look right at **Pick + Pay**: the dark "Scan next" card shows "Isotroin 20 mg — Pick 30 · Rack B2" with `Batch` / `Expiry` / `Stock`. Looks for somewhere to scan the strip's barcode → there is no input; "Scan next" and the six checklist tiles (Validate, Pick earliest-expiry batch, Barcode, GST bill, Payment, Dispense) are read-only indicators. *(Hesitation.)*
11. Read **Pick Assist** ("Shelf, batch, and split-stock view."): per medicine "Pick 30 · 84 available", batch badge, `Location`, `Expiry`, and for the gel "1 alternate batch available if shelf stock is short."
12. Walk to the racks and pick the three items (off-screen).
13. Click **Ready** → the status is saved again as Ready to Bill; nothing visibly changes because step 9 already did it. *(Redundant click the layout invites.)*
14. Click **Open bill** (footer of Active Dispense) → browser leaves the Counter for `/dashboard/pharmacy/sales/bill?patientId=…&prescriptionId=…&doctorId=…`.
15. **Hand-off (pharmacy-sales topic)**: the Sales bill page shows the *same* prescription queue again at the top (row action `Load`) and, scrolled into view, the bill with patient, doctor and the three medicines prefilled from the prescription. Farheen checks quantities, chooses payment mode, `Print Preview` → `Confirm Invoice` / `Confirm & Print`.
16. When the finished bill is closed the page moves to the **Sales** register (`/dashboard/pharmacy/sales`), not back to the Counter; the bill page's only way out is `Back to Sales`. Click sidebar **Pharmacy Counter** again.
17. The cockpit reloads; once the bill counts as posted Sravani's card carries the chip "Done". Click filter chip **Done** to find her; selecting the card shows the badge "Dispensed" with the checklist tiles GST bill / Payment / Dispense ticked.
18. Click filter chip **All** and select the next waiting patient.

#### Variations
- **Skip the cockpit review**: scroll to "Prescription Queue" and press `Bill` on the row — no line review is required to bill (STORY-066).
- **Accept directly on the auto-selected prescription**: clicking `Accept` without first clicking the queue card also creates the task; the click on the card is not required.
- **`Paid` button**: sets the task to Paid by hand at any time (the server only refuses a manual *Dispensed*). It does not take money or check that a bill exists, and it sits next to `Ready`, so it is easy to press by mistake. A task marked Paid stays "Paid" in the cockpit even after its bill is posted, while the table below shows the same prescription as "Dispensed".
- **Different entry button**: header `Bill` and Pick + Pay `Collect payment` do exactly what `Open bill` does.
- **Reception**: sees the whole cockpit including `Accept` / `Ready` / `Open bill`; the task endpoints admit RECEPTION, but Sales is not in her sidebar and the server refuses invoice creation for her role (result on the bill page belongs to the pharmacy-sales topic).

#### Edge Cases
- **More than 8 open prescriptions**: the cockpit never shows the older ones (no paging, newest first), so the longest-waiting "over 2h" patients can be missing from the workstation built to serve them; they are only reachable in the table below.
- **Prescription older than 24 h with no bill**: chip "Paused" in the cockpit and "Expired" in the table below, although nobody paused it and it can still be reviewed and billed.
- **Prescription inactive or past its validity date**: same "Paused" / "Expired" labels, but the review buttons, `Pause` / `Ready` / `Paid`, header `Bill` and `Open bill` are disabled; `Collect payment` stays clickable and answers with a red banner "This prescription is not active or has expired."
- **Stock check fails**: red banner "Unable to check current stock. Use Refresh to retry."; every line shows the "Checking" badge and "Stock check pending".
- **Doctor edits the prescription mid-review**: saving a line returns an error surfaced as "Unable to save medicine review" (server: "Prescription line changed. Pull the prescription and review its current medicines.").
- **Window regains focus**: the cockpit reloads queue and stock every time the browser tab is focused, briefly replacing the review table with the stock spinner.
- **Queue load fails**: "Unable to load prescription queue", empty columns.
- **Bill saved only as a draft**: the prescription stays Pending/Ready (drafts do not count as dispensed); the strip shows an "Invoice" badge.

---

### STORY-065: One medicine out of stock, one not stocked at all — substitute, mark unavailable, bill the rest

**Type**: medium
**Topic**: Pharmacy desk, counter & dispensing
**Persona**: Suresh Goud, pharmacist on the evening shift, 6:50 pm
**Goal**: Dispense what can be dispensed for Mohammed Irfan, give an equivalent for the out-of-stock cream, and record that the shampoo was not available
**Preconditions**: ACTIVE prescription for Mohammed Irfan (P-0388): Doxy-1 L-DR Forte (in stock), Aziderm 10% cream (linked, zero stock), "Ketoconazole 2% shampoo" (typed free-text, not linked to any inventory item). Ezanic 10% cream (same salt) is in stock.
**Ideal path**: 7 — select prescription, accept line 1, choose the substitute product for line 2 (one picker), mark line 3 unavailable with a reason, open bill (carrying those decisions), confirm, done.
**Alternate paths**:
- Skip the cockpit: `Bill` from the "Prescription Queue" table and handle everything on the bill with its stock warnings and `Substitute` button.
- Fix the "not linked" line first with `Link item` in the queue table (STORY-067) instead of marking it NA.
- Park it: `Pause` with reason "Paused for doctor clarification" and call the doctor.

#### Steps
1. Sidebar **Pharmacy Counter** → cockpit loads.
2. Click **Mohammed Irfan** in the Queue column → "In Review", "0/3 lines reviewed"; "Checking stock and batch expiry".
3. Read the table: line 2 shows badge "OUT OF STOCK" and an amber chip "Out of stock"; line 3 shows "No inventory match" / "Needs pharmacist action", badge "UNMATCHED", chip "No match", and "Unmapped" / "No batch" / "No expiry" under Shelf and batch. The right column header says "Pick + Pay · 2 exceptions".
4. Click **Accept** on line 1 (Doxy-1 L-DR Forte).
5. Click **Sub** on line 2 expecting a product picker → no dialog opens; the pill simply turns dark and "2/3 lines reviewed". The click has already been saved with whatever the shared reason box below the table held (default "Substitution requested", empty note). *(Hesitation: where do I say what I substituted with?)*
6. Type in the **"Reason or pharmacist note"** box under the table: "Aziderm 10% nil stock — giving Ezanic 10% (same salt), patient agreed".
7. Click **Sub** on line 2 again so the note is actually stored with the line (the note is only sent at the moment a line button or `Pause` is pressed).
8. Change the reason dropdown to **Medicine unavailable**.
9. Replace the note text with "Ketoconazole shampoo not stocked — advised outside purchase" (the box is shared by all lines; leaving the old text would attach the Ezanic note to the shampoo line).
10. Click **NA** on line 3 → "3/3 lines reviewed", but the badge becomes "Partially Filled", the queue chip "Partial", header `Exceptions` +1; the footer still says "Review every medicine before billing" and `Ready` stays disabled, because an unavailable line blocks "ready". *(Confusing: everything is reviewed, yet it says review every medicine.)*
11. Click **Open bill** (still enabled) → Sales bill for Mohammed Irfan.
12. **Hand-off (pharmacy-sales topic)**: the bill is filled from the *prescription*, not from the cockpit review — all three original lines arrive, Aziderm with an out-of-stock warning and the shampoo with no match. Suresh repeats the decisions there: `Substitute` on the Aziderm line (pick Ezanic 10%), remove the shampoo line, then confirm and take payment.
13. Sidebar **Pharmacy Counter** → find Mohammed Irfan's card again: it reads "Partial" (under the `Exceptions` chip) while the bill is confirmed but not completed, and "Done" once the bill counts as completed — a completed bill marks the whole prescription Dispensed even though the shampoo was never supplied (`pharmacy-prescription-queue-query.ts`; which bill status checkout produces belongs to the pharmacy-sales topic).

#### Variations
- **Pause for the doctor**: set the dropdown to "Paused for doctor clarification", type a note, click `Pause` → badge "Paused" (amber on the rail, red chip in the queue). There is no Resume button: pressing any line button (`Accept` etc.) recomputes the status, or `Ready` when every line is acceptable.
- **Quantity change**: `Edit` flags the line as edited with the reason/note only; there is no quantity field in the cockpit although the API accepts one. The real quantity change is made on the bill.
- **Cancel at counter**: the dropdown offers "Cancelled at counter" and the rail has a "Cancelled" pill, but no cockpit button sets a task to Cancelled.
- **Unmapped shelf**: line shows "Unmapped" → click `Shelf locations` (Pick + Pay) → `/dashboard/inventory?tab=pharmacy-control&section=shelf` → Inventory opens on **Today**; the actual route is Stock › Stock list → select batches → "Set location for N selected batches".

#### Edge Cases
- **Reason captured wrongly**: pressing `NA` without touching the dropdown records "Substitution requested" as the reason for an unavailable line; nothing on screen shows which reason/note a line was saved with.
- **`Ready` with an NA line**: disabled client-side; if forced, the server answers "Review every available medicine before marking ready for billing. Unavailable medicines must be resolved first."
- **Substitute not carried over**: nothing chosen in the cockpit reaches the bill (only `PharmacyCounterCockpit.tsx` talks to the dispense-task API), so a hurried pharmacist can confirm the original out-of-stock line or forget the substitution.
- **Two saves at once**: line buttons are ignored while a save is in flight (whole table is disabled) — a quick second click is silently dropped.
- **Disappears from the default list below**: marking a line `NA` moves the prescription to "Partial" in the "Prescription Queue" table (and `Pause` moves it to "Expired"), so it leaves that table's default `Pending` view although nothing has been dispensed yet.
- **Near-expiry / expired batch**: chips "Near expiry" or "Expired batch blocked" appear (max two chips per line are shown).

---

### STORY-066: Bill a prescription straight from the "Prescription Queue" table

**Type**: short
**Topic**: Pharmacy desk, counter & dispensing
**Persona**: Farheen Begum, pharmacist, lunchtime lull, one simple one-item prescription
**Goal**: Get Lakshmi Narayana's single-medicine prescription onto a bill without the cockpit ceremony
**Preconditions**: Pending prescription for Lakshmi Narayana (Levocet 5 mg × 10), linked and in stock
**Ideal path**: 2 — open Counter, press `Bill` on the row.
**Alternate paths**: cockpit card → `Open bill` / header `Bill` / `Collect payment`; Sales → `New sale` → queue row `Load`; Desk → `New sale` → `Load`; doctor's `Go to Pharmacy`.

#### Steps
1. Sidebar **Pharmacy Counter** → scroll past the cockpit to the white strip "Prescription Queue — Review visit prescriptions and send approved medicines into a Sales bill." (with a green pill "Validate before adding stock") and the card "Prescription dispensing queue — 1-6 of 6 prescriptions". The status select defaults to **Pending**.
2. Find the row "Lakshmi Narayana · P-0391 · 12m pending": Doctor + time, Medication "Levocet 5 mg 0/10", Status "Pending", Stock "In stock · Levocet 5 mg (40 strips) · Change link".
3. Click **Bill** on the row → `/dashboard/pharmacy/sales/bill?patientId=…&prescriptionId=…&doctorId=…&visitId=…`.
4. **Hand-off**: bill prefilled; confirm and collect payment on the Sales bill.

#### Variations
- **History**: switch the status select to `Dispensed`, `Partial`, `Expired` or `All`; paging is 20 per page with `Previous` / `Next`.
- **Refresh**: the circular-arrow icon in the card header reloads the list; the per-row refresh icon ("Refresh stock for {patient}") reloads the whole list as well.
- **Same table on the bill page**: there the row action is labelled `Load` instead of `Bill`.

#### Edge Cases
- **Expired / inactive prescription**: row stays visible as history; `Bill` is disabled and no `Link item` links are offered.
- **Over two hours waiting**: amber badge "Over 2h" under the status.
- **Stock check fails for a row**: "Stock check failed. Refresh to retry." in the Stock cell.
- **Empty filter**: "No prescriptions in this queue. Choose another status to view other prescriptions."
- **Review state shown under other names**: the table knows only Pending / Partial / Dispensed / Expired — a prescription a colleague paused "for doctor clarification" in the cockpit is listed as "Expired" (so it is missing from the default Pending view), its reason is not shown, and its `Bill` button is still active.

---

### STORY-067: Link a prescribed medicine to the right inventory item

**Type**: medium
**Topic**: Pharmacy desk, counter & dispensing
**Persona**: Suresh Goud, pharmacist, tidying up "Not linked" lines between patients
**Goal**: Teach the system that the doctor's "Ketoconazole 2% shampoo" is the stocked "Nizral 2% Shampoo 100 ml" so stock shows correctly now and for future patients
**Preconditions**: A pending prescription (Pooja Menon, P-0001) has a line whose Stock cell shows "Not linked"; Nizral 2% Shampoo exists in inventory with stock; user has pharmacy invoice-create permission (pharmacist/doctor/admin)
**Ideal path**: 3 — click `Link item`, pick the suggested product, confirm.
**Alternate paths**: none found for creating the remembered link (the cockpit shows "No inventory match" but offers no link action). On a bill, `Substitute` fixes one bill only.

#### Steps
1. Sidebar **Pharmacy Counter** → scroll to "Prescription dispensing queue".
2. In Pooja Menon's row, Stock column: badge "Not linked", text "Ketoconazole 2% shampoo (—)", link **Link item**.
3. Click **Link item** → dialog "Link Ketoconazole 2% shampoo": "Choose the exact product, strength and stock unit. This choice will be remembered for the same medicine across patients." The field "Search clinic inventory" is prefilled with the prescribed name; "Searching inventory…" then "No inventory candidates. Try another spelling or add the product in Inventory."
4. Clear the field and type `Nizral` → after a short pause a radio list appears: "**Nizral 2% Shampoo** — Janssen · bottle of 100 ml · 6 bottle available".
5. Select the radio button for Nizral 2% Shampoo.
6. Click **Confirm and remember match** ("Saving…") → dialog closes, the table reloads, the cell now reads "In stock · Nizral 2% Shampoo (6 bottle) · Change link".
7. Scroll up to the cockpit: the same line there still says "No inventory match" until **Refresh** is clicked (or the browser tab loses and regains focus) — the link does not notify the cockpit.

#### Variations
- **Wrong match made earlier**: the link reads `Change link`; same dialog, same steps.
- **Product genuinely not stocked**: the dialog can only say "…or add the product in Inventory" (no link). The pharmacist closes it, opens Inventory → Stock › Stock list → `Add batch` (approval flow for non-doctors), then returns and repeats steps 2–6.

#### Edge Cases
- **Prescription edited meanwhile**: "Prescription changed. Refresh before linking inventory." stays in the dialog.
- **Ambiguous inventory item**: "This inventory item has multiple product links. Review duplicate products first." or "Review inactive or invalid product links in Inventory first".
- **Search failure**: "Unable to search inventory. Try again."
- **Reception without the grant**: the `Link item` link is shown, but search/save are refused by permission checks (message from the server, or "Unable to remember match").
- **Typing after selecting**: editing the search text clears the selection, disabling the confirm button again.

---

### STORY-068: A walk-in customer at the counter — getting to a Sales bill

**Type**: short
**Topic**: Pharmacy desk, counter & dispensing
**Persona**: Farheen Begum, pharmacist; Karthik Rao walks up asking for a sunscreen refill, no prescription today
**Goal**: Start a bill that is not tied to any queued prescription
**Preconditions**: On the Pharmacy Counter with five prescriptions waiting in the queue; Karthik Rao is a registered patient
**Ideal path**: 1 — a `Walk-in bill` button on the Counter that opens an empty bill.
**Alternate paths**: Pharmacy Desk → `New sale`; Sales → `New sale`; cockpit `Walk-in bill` / `Start billing` (only when the queue is empty); legacy `/dashboard/billing` or `/dashboard/pharmacy?section=billing` (redirects); Inventory → Sales → `Counter sales` (a different document type that also sells stock).

#### Steps
1. On the Counter, look for "Walk-in bill" → not there: that button exists only in the Queue column's empty state ("No prescriptions waiting": `Walk-in bill`, `Pull visits`, `Inventory control`). With a non-empty queue the header `Bill`, `Open bill` and `Collect payment` all open the bill **for whichever prescription is currently highlighted**. *(Mistake risk: pressing header `Bill` starts a bill prefilled with another patient.)*
2. Click sidebar **Sales** → Sales register.
3. Click **New sale** → `/dashboard/pharmacy/sales/bill` with nothing prefilled.
4. **Hand-off (pharmacy-sales topic)**: the page shows the prescription queue again on top and the empty bill beneath ("Patient & Doctor Details", "Add Items to Invoice" …). `Patient *` is mandatory ("Search patients by name or phone..."), so a walk-in must be a registered patient.

#### Variations
- **Via the Desk**: sidebar Pharmacy Desk → tile `New sale` ("Bill a prescription or walk-in") — also two clicks.
- **Empty queue**: `Walk-in bill` (Queue column) or `Start billing` ("No active prescription" panel) open the empty bill in one click.
- **Unregistered customer**: pharmacists have no Patients entry in the sidebar; the bill cannot be saved without a patient (pharmacy-sales topic / Inventory `Counter sales` covers the rest).

#### Edge Cases
- **Reception**: has neither `New sale` on the Desk nor Sales in the sidebar, yet the cockpit's `Bill` / `Walk-in bill` buttons still navigate her to the Sales bill route.
- **Came back with browser Back**: returns to the Counter with the previously highlighted prescription reselected by the "first pending" rule, not necessarily the one she was on.

---

### STORY-069: Create a treatment package and check it in the browser

**Type**: medium
**Topic**: Pharmacy desk, counter & dispensing
**Persona**: Dr. Anitha Rao, dermatologist, setting up a kit she prescribes every day
**Goal**: Bundle an "Acne Starter Kit" at a fixed price so the pharmacy can add it to bills in one go
**Preconditions**: Logged in as DOCTOR; Deriva-BPO Gel (₹480) and Clindac A Gel (₹260) exist in the drug database
**Ideal path**: 7 — open dialog, name, price, add drug, add drug, create (dialog closes and the new card is shown).
**Alternate paths**: none found for creating (the fuller `PharmacyPackageManager` component is not mounted). Packages are *used* from the Sales bill → "Add Items to Invoice" → tab `Treatment Packages` (same `PackageBrowser` with `Add to Invoice`).

#### Steps
1. Sidebar **Pharmacy Desk** → scroll to the card "Treatment Packages — Browse and select from pre-built dermatology treatment packages".
2. Click **Create Package** → dialog "Create Treatment Package".
3. `Name`: type "Acne Starter Kit – 8 weeks".
4. `Package Price (₹)`: type `650`.
5. `Duration (optional)`: type "8 weeks". Leaves `Category` on "Dermatology" and `Subcategory (optional)` empty.
6. In "Add drugs" type `deriva` → results list after a pause ("₹480 • Galderma • tube of 15 gm").
7. Click **Add** on Deriva-BPO Gel (double-clicking the row also works) → an item row appears with `Qty`, `Dosage`, `Pattern`, `Frequency`, `Duration`.
8. Type `clindac` and click **Add** on Clindac A Gel.
9. On the Deriva row choose `Pattern` **0-0-1** → `Frequency` fills itself.
10. Check the read-only "Original price (auto)" 740.00 and "Computed discount %" 12.16.
11. Click **Create Package** ("Creating…") → toast "Package created — Acne Starter Kit – 8 weeks created successfully."; behind the dialog the list reloads and the Desk `Packages` figure refreshes. The dialog stays open with every field still filled. *(Hesitation: did it save? Pressing `Create Package` again would create a duplicate.)*
12. Close the dialog with the ✕ (or `Cancel`).
13. In "Search Treatment Packages" type `acne` → card shows "Private" badge, ₹740.00 struck through, ₹650.00, "12.2% OFF", "2 items", "8 weeks", "Dr. Anitha Rao".
14. Click **View Details** → dialog titled with the package name: Package Details, Pricing (Original / Package / Discount / Savings), Package Contents, Created By. Close it.

#### Variations
- **Pharmacist creates it**: same steps; the card and details still print "Dr. {name}" in front of the creator.
- **Manual discount**: typing a value in `Discount % (optional)` stores that number instead of the computed one, so the "% OFF" badge can disagree with the two prices shown beside it.

#### Edge Cases
- **Private by default, no switch**: the creator has no "public" control, so every package made here is saved private and is listed only for its creator — the pharmacist will not find Dr. Rao's kit on the Desk or in the bill's `Treatment Packages` tab.
- **Subcategory free text**: the field accepts anything (placeholder "e.g. Acne Treatment") but the server accepts only ten fixed values (Acne Treatment, Anti-aging, Hair Care, Pigmentation, Eczema/Psoriasis, Fungal Infections, Wound Care, Moisturizing, Sun Protection, Post-procedure Care); "Acne" → toast "Failed to create".
- **Category "General"**: saves, but the Desk browser only requests `category: Dermatology`, so the new package never appears.
- **Missing details**: `Create Package` is disabled until name (3+ chars), price > 0 and one drug are present.
- **Usage instructions**: the details dialog can show "Usage Instructions", but the create form has no field for them.
- **Load failure**: toast "Failed to load pharmacy packages. Make sure the backend server is running." and the empty state "No packages available" with `Retry Loading`.
- **Reception**: sees `Create Package`, but the drug search is refused for her role, so no results ever appear and the package cannot be completed.
- **No edit or delete** of a package anywhere in the mounted UI.

---

### STORY-070: Add a new medicine to the drug database, then correct and remove an entry

**Type**: medium
**Topic**: Pharmacy desk, counter & dispensing
**Persona**: Farheen Begum, pharmacist; a new sunscreen arrived that doctors want to prescribe by name
**Goal**: Add "Photostable Gold SPF 55 Gel", fix a typo in its pack size, and delete a duplicate entry
**Preconditions**: Logged in as PHARMACIST (or ADMIN); on the Pharmacy Desk
**Ideal path**: 11 — open the drug page, `Add New Drug`, eight field entries (seven required fields + price), save. The typo fix and the delete add 3 + 2.
**Alternate paths**: prescription builder `+ Add to Drug Database` ("Add Drug to Database" → `Save & Add`); Inventory → Stock list → `Add batch` ("Add Inventory Item", approval flow); posting a purchase bill creates products implicitly; opening-stock Excel import; AI assistant proposal "Add medicine" (STORY-072).

#### Steps
1. On the Pharmacy Desk click **Drugs** (dark header) → `/dashboard/pharmacy/drugs`. The page shows `Back`, the heading "Drug Management", and under it a second heading "Drug Database — Manage your pharmacy's drug inventory" with `Add New Drug`; tiles Total Drugs / Categories / Manufacturers / Active Drugs; a filter card (Search Drugs, Category, Manufacturer, `Clear Filters`); list "Drugs (n)".
2. Type `photostable` in "Search by name, composition..." → list filters on every keystroke; "No drugs found — Adjust your search or add a drug to the database."
3. Click **Add New Drug** → dialog "Add New Drug".
4. `Drug Name *`: "Photostable Gold SPF 55 Gel".
5. `Price (₹) *`: `845`.
6. `Manufacturer *`: "Sun Pharma".
7. `Pack Size *`: "tube of 50 gm".
8. `Primary Composition *`: "Octinoxate + Avobenzone + Oxybenzone".
9. `Category *`: "Sunscreen".
10. `Dosage Form *`: "Gel".
11. `Strength *`: "SPF 55".
12. Click **Add Drug** → dialog closes, list reloads with the new card (name, category badge, Manufacturer, Pack Size, Composition, Strength, Price ₹845.00, Form).
13. Notices she typed "50 gm" but the tube is 60 g: click the **pencil icon** on the card (icon only, no label) → dialog "Edit Drug" prefilled.
14. Change `Pack Size` to "tube of 60 gm" and click **Update Drug** → list reloads.
15. Clear the search, type `photostabl gold` and spot an older duplicate; click its **bin icon** → browser confirm "Are you sure you want to delete this drug?" → OK → list reloads.
16. Click **Back** → returns to `/dashboard/pharmacy` (the Desk).

#### Variations
- **Filter instead of search**: Category / Manufacturer selects (manufacturer list is cut to the first 50 names); `Clear Filters` resets all three.
- **Cosmetic / consumable item being edited**: Manufacturer, Primary Composition, Dosage Form and Strength switch to "(optional)".
- **Doctor**: can open the page and add; update and delete are limited server-side to admin/pharmacist role lists (doctors pass role lists by policy).

#### Edge Cases
- **Missing required field**: native `alert()` "Please fill required product master fields: Manufacturer, Strength"; the dialog stays open.
- **Price left blank**: marked `*` but not validated — saved as ₹0.00.
- **Drug already used on a bill**: delete does not remove it; the server marks it inactive and the card gains an "Inactive" badge (no message tells the user this happened).
- **Delete fails**: native alert "Failed to delete drug. Please try again."
- **Edit wipes optional fields**: the edit dialog always opens with `Barcode` and `Description` empty, whatever was saved before (server handling of the blank values unverified).
- **Search while on page 3**: the page number is not reset by typing, so a search with fewer results can show an empty list until `Clear Filters`.
- **"Active Drugs" tile** counts only the 20 cards on the current page.
- **No stock here**: despite "drug inventory" in the subtitle, quantities, batches and expiry live in Inventory; nothing links there from this page.
- **Reception**: the `Drugs` button is hidden on her Desk, and the API refuses her role.

---

### STORY-071: Enter a partner pharmacy's daily sales, commit stock and resolve an unmatched batch

**Type**: long
**Topic**: Pharmacy desk, counter & dispensing
**Persona**: Suresh Goud, pharmacist, 9:15 pm, closing the day
**Goal**: Record what the partner outlet "Glow Derma Studio, Kondapur" sold from Linaé stock today, deduct it from inventory, and sort out one line whose batch number was written wrongly
**Preconditions**: Logged in as PHARMACIST; the partner sold 6 × Tugain 5% solution (batch TG5A24) and 4 × Momate cream (written as batch "MM0912", real batch MM0921); both products are in clinic stock
**Ideal path**: 12 — open the panel, pick the partner from the missing list, two lines (medicine + batch + qty = 6 entries), one submit-and-commit action, then pick the right batch, give a reason and retry (3).
**Alternate paths**: cockpit `Daily close` (Pick + Pay column) opens the Desk — the only link to this panel besides the sidebar. No CSV upload UI is mounted (the API accepts a `CSV` source). No other way to deduct partner sales was found.

#### Steps
1. From the Counter click **Daily close** (bottom of Pick + Pay) → lands on the top of the **Pharmacy Desk**; scroll down to "Partner Daily Sync" (tiles Partners / Submitted Today / Missing / Net Sales, cards "Manual Daily Entry", "Missing Entries", "Recent Submissions").
2. Check "Missing Entries — Organizations without a sale for {date}": "Glow Derma Studio, Kondapur · Cutoff 22:00 · Pending".
3. In "Manual Daily Entry" leave `Date` on today, leave `Organization ID` ("Optional") blank.
4. `Organization Name` ("Required without ID"): type "Glow Derma Studio, Kondapur" exactly as it appears under Missing Entries (it is free text, not a picker).
5. `Submitted By` ("Optional"): "Naveen".
6. Row 1 `Medicine`: "Tugain 5% Solution".
7. Row 1 `Batch`: "TG5A24".
8. Row 1 `Qty`: `6`.
9. Row 1 `MRP`: `890`; leave `Discount` 0 and `Payment` on the default "UPI".
10. Click **Add Item** → second row.
11. Row 2: `Medicine` "Momate Cream 15 g", `Batch` "MM0912", `Qty` `4`, `MRP` `215`, `Payment` → **Cash**.
12. Check "Form total ₹6,200.00" and click **Submit** → toast "Partner sale submitted"; the item rows reset to one blank row (organisation fields stay); the partner disappears from Missing Entries; "Recent Submissions" gains a row: Partner, Date, Status "SUBMITTED", Qty 10, Net ₹6,200.00, Flags "Clear", button **Commit**.
13. Click **Commit** → spinner; toast "4 units still outstanding — Match unresolved products or receive stock, then retry outstanding quantities."; status "PARTIAL STOCK COMMITTED", flag "Discrepancy", button now **Retry outstanding**.
14. A grey box appears under the table: "Glow Derma Studio, Kondapur · 4 units outstanding" with **Resolve outstanding**. Click it → explanation "Already committed quantities stay unchanged. Correct the product lookup, choose the stocked batch and enter a reason. Matching does not deduct stock." and a card "Momate Cream 15 g · batch MM0912 — 0 committed · 4 outstanding" with the discrepancy reason.
15. In "Corrected product name or batch" (prefilled with the medicine name) click **Search batches** → select list "Choose the actual product and batch".
16. Choose "Momate Cream 15 g · batch MM0921 · 22 TUBE available · expires 31 Aug 2027".
17. `Reason for correcting the match`: "Partner wrote batch MM0912; physical stock is MM0921".
18. Click **Save match** → "Match saved. Use Retry outstanding to deduct only the remaining quantities." and "A batch is selected for the outstanding quantity. Retry outstanding when stock is available."
19. Click **Retry these outstanding units** (or the row's `Retry outstanding` — same action) → toast "All sale quantities committed"; status "STOCK COMMITTED"; the row button reads "Committed" (disabled) and the grey box disappears.
20. Click the panel's **Refresh** and confirm the tiles (Submitted Today, Net Sales) moved.

#### Variations
- **Back-dated entry**: change `Date` → Missing Entries and Recent Submissions follow the chosen date; the four tiles keep showing *today's* summary.
- **Entry after the cut-off hour**: the submission is flagged "Late".
- **Nothing to fix**: `Commit` → "All sale quantities committed" in one click.
- **Close the correction panel**: `Close corrections` (the same button toggles).

#### Edge Cases
- **Second submission for the same partner and date**: refused — "A partner daily sale already exists for this organization and date" (toast "Submission failed" + red "Partner sync error" banner). All of a partner's lines must go in one submission; there is no edit or cancel control.
- **Typo in Organization Name**: a new partner organisation is created from the typed text, and the real one stays in Missing Entries.
- **Validation**: "Partner organization required"; "At least one item is required" (rows lacking medicine, batch or a positive quantity are silently dropped rather than flagged).
- **No matching batch**: "No stocked batch matches this search. Add or correct the product in Inventory, receive its stock, then search again. The submitted sale stays saved." (text only, no link to Inventory).
- **Uncertain commit**: "Check the stock outcome — The stock outcome was not confirmed. Refresh the submission and review its quantities before retrying."; stale version → "Partner sale changed. Refresh before retrying outstanding stock."
- **Reception / manager**: the whole form is shown, but the server treats them as partner users — submit fails with "Partner users must have metadata.partnerOrganizationId to submit sales", and corrections with "Only branch pharmacy staff can correct inventory matches".
- **Before 5:30 am IST** the default date is yesterday's (the default is taken from the UTC date).
- **`Daily close` naming**: nothing on the Desk is called "Daily close"; the cash close-out is "Daily Collection" (a different sidebar item).

---

### STORY-072: Ask the Pharmacy AI assistant a stock question, attach a file and review a proposed change

**Type**: medium
**Topic**: Pharmacy desk, counter & dispensing
**Persona**: Farheen Begum, pharmacist, quiet afternoon, wants a quick answer without building a report
**Goal**: Find which acne medicines expire in the next 60 days, then let the assistant add a missing medicine from a supplier price list and approve the change
**Preconditions**: Logged in as PHARMACIST (admin and doctor also qualify; managers are admitted by the API but have no Pharmacy Desk in their sidebar); the assistant backend (Codex CLI) is configured; a supplier price list `derma-pricelist-nov.xlsx` is on her computer
**Ideal path**: 5 — open assistant, type question + send, attach file + ask, `Apply` the proposal.
**Alternate paths**: for the question — Pharmacy Report › Expiring Stock, Inventory › Today "Expiring in the next 3 months", Stock list expiry filter. For the change — Drug database `Add New Drug` (STORY-070). No other entry point to the assistant exists (Desk only; not on the Counter).

#### Steps
1. Sidebar **Pharmacy Desk** → under the dark header, the strip "Pharmacy AI assistant — Opens when needed." Click **Open AI Assistant** → "Loading pharmacy assistant…" then a three-pane panel: `Chats` rail (sections "Active", collapsible "History"), the conversation, and `Proposals` ("No pending updates."). Header badge "Checking" → "Assistant ready"; buttons `Archive` (disabled while the chat is empty) and `New chat`.
2. Read the empty-state hint "Ask about stock, billing, purchase invoices, ledger, compliance, or attach a pharmacy file."
3. Type in the box ("Ask the pharmacy assistant about pharmacy operations. Enter sends, Shift+Enter adds a line."): "Which acne medicines expire in the next 60 days? Show as a chart." and press **Enter** → her message appears on the right; "Codex is working" spinner.
4. The reply arrives as text with an inline bar chart (and, for report-type answers, a blue "Report" box of raw data).
5. Click the **upload (arrow) icon** left of the box → file picker (xlsx, xls, csv, images, PDF) → choose `derma-pricelist-nov.xlsx` → toast "Attachment ready"; a chip with the file name appears above the box (clicking the chip removes it from the next message).
6. Type "Add Acnestar gel from this list to our medicines if it is missing" and press **Enter**.
7. The reply explains the suggestion and a card appears in `Proposals` (badge count 1; header badge "1 pending"): title, summary, risk badge ("Low risk"), action row "Add medicine · Medicine", shield line "Permission to add medicines", collapsible "Technical details".
8. Expand **Technical details** to check what will be written, then click **Apply** → toast "Proposal applied"; the card badge becomes "Applied"; the Desk figures refresh.
9. Click **Archive** in the assistant header → toast "Chat archived"; the chat moves under `History` (opened automatically) and a fresh chat starts.
10. Later: click the archived chat under History → amber notice "This thread is in history. Restore it to continue the conversation." with the input disabled → **Restore** → toast "Chat restored".

#### Variations
- **Reject**: `Reject` on the card → toast "Proposal rejected"; badge "Rejected" (the reason sent is fixed: "Rejected from Pharmacy Desk").
- **Several chats**: `New chat` starts another; each rail item shows the last message, a pending-proposal count and its own `Archive`.
- **Narrow screen**: the Proposals pane is hidden; proposal cards are listed inside the conversation instead.

#### Edge Cases
- **Assistant not configured**: badge "Assistant unavailable"; messages can still be typed and the error text comes back as an assistant bubble.
- **Reception**: the launcher is shown on her Desk, but the assistant API excludes her role → toast "Agent unavailable" and badge "Assistant unavailable".
- **Apply without the needed permission / stale proposal**: toast "Apply failed" with the server message.
- **Upload fails**: toast "Upload failed"; only one file can be picked at a time.
- **No way to close the panel**: once opened it stays expanded on the Desk until the page is left; reopening the Desk shows the launcher strip again.
- **Applied changes are real writes** (medicines, stock items, stock corrections, purchase-invoice drafts/stock) made from a chat on a page whose other stock edits normally go through a doctor approval queue.

---

### Pharmacy sales, bills & returns

Source: `topics/pharmacy-sales.md`

### STORY-073: Bill a registered walk-in customer from scratch, print, and see it in the register

**Type**: long
**Topic**: Pharmacy sales, bills & returns
**Persona**: Sandeep Goud, pharmacist, Saturday 11:40 am, three people at the counter
**Goal**: Sell two over-the-counter items to a returning patient with no prescription, take UPI, hand over a printed bill
**Preconditions**: Signed in as PHARMACIST. Patient "Lakshmi Reddy, 98480 12345" exists. "Cetaphil Gentle Skin Cleanser 125 ml" and "Photostable Gold Sunscreen SPF 55 50 g" are in the drug master with unexpired stock.
**Ideal path**: 8 — open new bill, pick patient, add item ×2 (search + pick each), set one quantity, choose payment mode, confirm-and-print. Patient, items and payment are the only real decisions.
**Alternate paths**:
- Pharmacy Desk (`/dashboard/pharmacy?section=desk`) quick action `New sale` ("Bill a prescription or walk-in") → same bill page.
- Pharmacy Counter cockpit `Walk-in bill` (shown when the Rx queue is empty) / `Start billing` (no active prescription) → same bill page.
- Legacy URLs `/dashboard/billing` and `/dashboard/pharmacy?section=billing|invoices|payments` redirect to the same bill page (`sales-bill-model.ts` `pharmacyBillingRedirect`).
- Sales register empty state button `New sale` (only when the period has no rows and no filter is set).
- Inventory › Sales › `Counter sales` › `New document` — a *different document type* that also sells stock and lands in the same register (see STORY-082).

#### Steps
1. Click `Sales` in the sidebar (Pharmacy group) → `/dashboard/pharmacy/sales` opens: title "Sales", tabs `Sales` / `Returns`, button `New sale`, filter bar and the register for the current financial year (Period shows "FY 2026-27").
2. Click `New sale` → `/dashboard/pharmacy/sales/bill`. The header button changes to `Back to Sales`. The page shows the card "Prescription dispensing queue" first, and the bill card titled "New bill" below it.
3. Scroll past the prescription queue to the bill (a walk-in has nothing in the queue, but the queue is always rendered above a new bill) → "Patient & Doctor Details" is visible.
4. Click the `Patient *` field ("Search patients by name or phone...") → a dropdown lists up to 20 of the first 100 patients.
5. Type `98480` → after ~300 ms the list is replaced by server matches (search starts at 2 characters).
6. Click "Lakshmi Reddy / 9848012345" → the field reads "Lakshmi Reddy (9848012345)"; in the right column `Billing Name *` and `Phone *` fill in automatically.
7. Leave `Doctor` empty (optional, placeholder "Select doctor") — Sandeep hesitates because the select has no "none" choice, but nothing forces a pick.
8. In "Add Items to Invoice" (tab `Individual Drugs` is selected) click `Search Drugs` and type `cetaphil` → results appear with price, manufacturer, pack size and a green "Best Match" badge on the first row. No stock figure is shown in the results.
9. Click `Add` on "Cetaphil Gentle Skin Cleanser 125 ml" → the search box clears; a card appears under "Invoice Items" with Quantity 1, Unit Price, Discount % 0, **Tax % 18** and Total. An empty "Prescription directions" block (Dosage / Frequency / Duration / Instructions) is also shown on the line.
10. Type `2` in `Quantity` → line Total and the "Invoice Summary" recalculate.
11. Type `photostable` in `Search Drugs` → results list.
12. Click `Add` on "Photostable Gold Sunscreen SPF 55 50 g" → second line added with Tax % 18.
13. Check `Tax %` on each line → the manual-add path always starts at 18 (the code comment says "Default GST") regardless of the product's own GST rate, so Sandeep must correct it by hand where the rate differs; both items here are 18 %, so he leaves them.
14. In "Invoice Summary", under `Bill discount`, leave the `%` toggle selected and type `5` → a green row "Bill discount (5%): -₹…" appears; helper text reads "On the whole bill after item discounts, before tax."
15. Read `Total:` in the summary and tell the customer the amount.
16. In "Billing Information" open `Payment Method` (default Cash) and choose `UPI` → options are Cash, Card, UPI, Net Banking only.
17. Customer pays by UPI on her phone; Sandeep checks the payment app (outside the system — there is no reference field for the UPI transaction on the bill).
18. Click `Print Preview` → a full-screen dialog "Pharmacy Invoice Preview" opens showing the bill as "DRAFT", badges "2 items", "₹…", "ORIGINAL", and a side panel "Invoice Controls" ("Draft previews are confirmed before printing or PDF export."), Status "Draft preview".
19. Click `Confirm & Print` → button shows "Confirming..."; the server creates the bill, issues number `PHI-2026-…`, deducts stock and records one UPI payment for the full total; toast "Success — Invoice PHI-2026-… confirmed successfully"; the browser print dialog opens.
20. Press Print in the browser dialog → the A5 "Pharmacy Invoice" prints with HSN, batch numbers and a GST split table.
21. Back in the preview, the green button now reads `Invoice Confirmed` (disabled), Status "Confirmed", and `Download PDF` is enabled. Click `Close`.
22. The builder is still on screen with the same lines, and an amber notice: "This checkout is confirmed. Reopen it for another copy." with `Reopen confirmed invoice`, `Start a new invoice`, `Back to Sales`. `Save draft` is hidden. Sandeep pauses — the form still looks editable and `Print Preview` is still enabled.
23. Click `Back to Sales` → the register reloads; the new bill is the first row (sorted by Entry Date, newest first) with Bill No `PHI-2026-…`, Patient "Lakshmi Reddy", Mobile "98480 12345", Bill Amount, and a violet `UPI` badge in Payment.

#### Variations
- **Next customer straight away**: at step 22 click `Start a new invoice` instead → the form, patient, items and URL parameters are cleared and the title returns to "New bill".
- **Item-level discount**: type a value in a line's `Discount %` instead of (or as well as) the bill discount → summary shows "Item discounts: -₹…" above the bill discount.
- **Rupee discount**: click the `₹` toggle in `Bill discount` and type `50` → fixed-amount discount.
- **Confirm without printing**: at step 19 click the green `Confirm Invoice` instead → same checkout, no print dialog; then `Print` / `Download PDF` / `Close`.
- **Duplicate copy**: change `Copy Type` to `Duplicate` before printing → the printout says "Copy: DUPLICATE".
- **Treatment package**: switch to tab `Treatment Packages` and click a package card → one PACKAGE line with "Package Contents:".
- **Same item twice**: clicking `Add` on a drug already on the bill raises its quantity by 1 instead of adding a line.

#### Edge Cases
- **Customer is not a registered patient**: the patient dropdown shows "No patients found" only when the list is empty; there is no "create patient" link in the builder, and PHARMACIST has no `Patients` sidebar entry. `Print Preview` stays disabled until a patient is chosen. The only in-role route is a Counter sale (STORY-082).
- **Out of stock is not shown for hand-added items**: stock badges ("Out of stock", "Insufficient stock: n available", "Low stock: n available") only appear on lines loaded from a prescription or substituted. A hand-added item with no stock fails at step 19 with toast "Error Confirming Invoice — Insufficient non-expired stock for …. Required 2, available 0."
- **Missing phone**: patient without a phone leaves `Phone *` empty; `Print Preview` then shows toast "Validation Error — Billing phone is required".
- **Bill discount too large**: `₹` discount above the bill gives inline alert "Bill discount ₹… is more than the bill after item discounts (₹…)." and toast "Check the bill discount" on preview.
- **Tax % cleared**: line shows "GST rate needs review. Enter Tax % before previewing or confirming this invoice."; totals read "GST pending".
- **PDF before confirm**: `Download PDF` is disabled until the bill is confirmed.
- **No "leave page" guard**: navigating away from an unsaved new bill loses it silently (no `beforeunload` handler in the builder).

---

### STORY-074: Bill a doctor's prescription from the queue, fixing stock problems on the way

**Type**: medium
**Topic**: Pharmacy sales, bills & returns
**Persona**: Farheen Begum, pharmacist, weekday evening OPD, patient waiting with a fresh prescription from Dr. Kavya Rao
**Goal**: Turn prescription lines into a paid bill, substituting one medicine that is out of stock
**Preconditions**: An ACTIVE, unexpired prescription for "Arjun Varma, 90000 41237" with 3 medicines; one maps to an out-of-stock product, one has an ambiguous quantity. Signed in as PHARMACIST.
**Ideal path**: 5 — open the prescription's bill, resolve the one flagged line, confirm the quantity, choose payment, confirm-and-print.
**Alternate paths** (all open the same builder with `?patientId=&prescriptionId=&doctorId=` or `&visitId=`):
- Sales › `New sale` › queue row `Load` (this story).
- Pharmacy Counter: "Prescription dispensing queue" row action `Bill` *(label per discovery)*, cockpit `Open bill` / `Start billing` / `Collect payment` (all call the same open-billing handler).
- Doctor's side: prescription builder footer `Go to Pharmacy`, and the post-create dialog "Go to Pharmacy?" → `Yes, go to Pharmacy`.
- Patient detail progress tracker `Bill` / `Invoices` button (`components/patients/PatientProgressTracker.tsx`).
- Pharmacy Desk `New sale`, then `Load` from the queue.

#### Steps
1. Sidebar `Sales` → click `New sale` → bill page with "Prescription dispensing queue" on top (status filter All / Pending / Partial / Dispensed / Expired; columns Patient, Doctor, Medication, Status, Stock, Actions).
2. Find "Arjun Varma" in the queue; the Stock column already shows "Out" on one medicine and the row carries an "Over 2h" badge → click `Load` on that row.
3. The URL gains the prescription parameters and the page scrolls to the bill region; "Loading prescription data..." shows, then a blue "Linked Prescription" box ("Prescription ID: …", "Items from prescription: 3") and three lines marked 📋 with a "Prescription" badge. Patient, Doctor, Billing Name and Phone are filled in.
4. Line 2 shows a red "Out of stock" badge. Click `Substitute` on that line → focus jumps to `Search Drugs` with a blue notice "Choose a replacement for …. The prescribed quantity will be kept." and a `Cancel substitution` button.
5. Type the alternative brand name and click `Add` on the result → the line keeps its quantity and directions, shows the new product with "Prescribed: <original name>" beneath it, and its price and Tax % are replaced.
6. Line 3 shows an amber note about its quantity (server "billing quantity" review message) with a `Confirm` button → check the strip count against the prescription, adjust `Quantity` if needed (editing clears the note) or click `Confirm`.
7. Review `Tax %` on each line (prescription lines use the product's own GST rate; a line with no rate shows "GST rate needs review…").
8. Choose `Payment Method` → `Cash`.
9. Click `Print Preview` → "Pharmacy Invoice Preview" opens.
10. Click `Confirm & Print` → toast "Success — Invoice PHI-… confirmed successfully"; print dialog; print.
11. Click `Close`, then `Back to Sales` → the bill is the newest row in the register. (Farheen stops and wonders whether the prescription left the queue; the queue endpoint recomputes status server-side, per the `pending-refresh-after-invoice` contract comment.)

#### Variations
- **Unlinked medicine**: a line with a red "No match" badge appears in the blue box as "<name>: link inventory before billing." with a link control (dialog "Link <name>"); alternatively `Substitute` it or remove it with the bin icon.
- **Patient declines one medicine**: click the bin icon on that line → removed from the bill only; the blue box states "Changes here do not alter the doctor's prescription."
- **Switch to another prescription**: click `Load` on a different queue row → a separate fresh bill is started so nothing carries over (`prescription-load-visible-draft` contract).
- **Arrive from the doctor's `Go to Pharmacy`**: steps 1–2 are skipped; the page opens already scrolled to the loaded bill.
- **Add an OTC extra**: search and `Add` a non-prescribed item; it has no 📋 marker.

#### Edge Cases
- **Inventory check fails**: lines get "Inventory check failed" badges and an amber alert "Prescription loaded, but some inventory details could not be checked. Retry loading or select a replacement for the flagged items." with `Retry loading prescription`.
- **Prescription cannot load**: toast "Prescription load failed" and the same retry button; `Print Preview` then reports "Prescription not ready".
- **Unmatched line left on the bill**: preview is blocked with toast "Medicine needs review — Select a replacement or remove each unmatched medicine before confirming the invoice."
- **Queue row not billable**: when the server marks the prescription ineligible the `Load` button is disabled (expired / inactive prescriptions; server messages "Only active prescriptions can be billed", "Expired prescriptions cannot be billed").
- **Doctor mismatch**: changing the `Doctor` select away from the prescriber is refused at confirm ("Prescription doctor does not match the selected doctor").
- **Same queue, three places**: this queue component is also rendered on the Pharmacy Counter page, where the cockpit shows the same prescriptions a second time as "Rx queue".

---

### STORY-075: Park a half-finished bill as a draft and finish it later

**Type**: medium
**Topic**: Pharmacy sales, bills & returns
**Persona**: Sandeep Goud, pharmacist; patient Meenakshi Iyer has gone to the ATM mid-billing
**Goal**: Keep the bill without moving stock, serve others, then resume and finish it
**Preconditions**: A new bill with patient "Meenakshi Iyer, 99890 55214" and two matched items with Tax % filled.
**Ideal path**: 4 — save, later reopen from a visible "drafts" spot, confirm-and-print. (Autosave would make it 3.)
**Alternate paths**:
- Resume from Sales register: click the row with the "Draft" badge (this story).
- Resume from "Pharmacy Invoices" list (`/dashboard/pharmacy/invoices`, or Inventory › Sales › `Patient invoice history`): pencil icon `Continue in Sales`.
- Resume from a bookmarked/back-button URL `/dashboard/pharmacy/sales/bill?draft=<id>`.
- Remove a draft: `Discard draft` in the builder, or the red bin `Delete Invoice` on the invoice list (native confirm).

#### Steps
1. On the bill, click `Save draft` (below `Print Preview`; hint text: "Saves the bill to Sales without moving stock or taking payment.") → toast "Draft saved — Meenakshi Iyer is in Sales as a draft. Open it from the Draft row to finish it."
2. The URL becomes `?draft=<id>`; the card title changes from "New bill" to a "Draft" badge with "Gets its bill number when finished"; the hint reads "All changes saved to the draft"; a `Discard draft` button appears.
3. Click `Back to Sales` and serve other customers (each via `New sale`).
4. Patient returns. On the Sales register look for the row whose Bill No cell is a yellow "Draft" badge for "Meenakshi Iyer"; the footer note says "1 draft not included" (drafts are listed but left out of the total).
5. (If the list is long) open `More filters` → `State` → `Draft` → only drafts remain; the button shows a count badge "1".
6. Click the draft row → "Loading draft bill…", then the builder opens with patient, doctor, lines, discount, payment method and notes restored. The prescription queue is *not* shown above a reopened draft.
7. Patient adds one more item: search, `Add` → hint flips to "Unsaved changes".
8. Click `Print Preview` → preview shows "DRAFT".
9. Click `Confirm & Print` → the draft is finished as `PHI-…`, stock moves, payment is recorded; print.
10. `Close` → `Back to Sales` → the row now shows the bill number instead of the Draft badge.

#### Variations
- **Discard instead**: `Discard draft` → dialog "Discard this draft?" ("…will be removed from Sales. Nothing was sold, so stock and payments are unchanged. This cannot be undone.") → `Discard draft` (or `Keep draft`) → toast "Draft discarded" and return to Sales.
- **Save again after edits**: `Save draft` at step 7 → "All changes saved to the draft"; the save names the version it edited.
- **Print/WhatsApp a draft from the register**: both row icons are disabled with tooltip "Finish this draft bill first"; `Edit discount` is disabled with "Open the draft to change its discount".

#### Edge Cases
- **Cannot save**: toasts "Draft not saved — Select a patient before saving the draft." / "Add at least one medicine before saving the draft." / "Choose a stocked product for … or remove it before saving the draft." / "Enter Tax % for … before saving the draft."
- **Two counters edit the same draft**: the second save shows a red banner "This draft was changed after you opened it. Reload it to see the latest version. Your changes on this screen were not saved." with `Reload draft`.
- **Draft finished elsewhere**: opening its link shows the finished bill view with notice "This draft was finished as bill PHI-…, so it can no longer be edited as a draft."
- **Draft discarded elsewhere**: "This draft no longer exists — It was discarded, or the link is out of date. Nothing was sold from it." with `Back to Sales` and `New sale`.
- **Load failure**: "Could not open the draft" with `Back to Sales` / `Try again`.
- **Unsaved edits are lost on navigation**: there is no autosave and no leave-page warning; only the "Unsaved changes" hint.
- **Stock is not reserved**: another sale can consume the stock while the draft waits; the shortage only surfaces at confirm.

---

### STORY-076: Find yesterday's bill by mobile number and reprint or WhatsApp it

**Type**: short
**Topic**: Pharmacy sales, bills & returns
**Persona**: Farheen Begum, pharmacist; a patient phones asking for a copy of her bill
**Goal**: Locate one finished bill and give the patient a copy
**Preconditions**: Finished bill `PHI-2026-398` for "Sunita Sharma, 98660 73310" dated yesterday.
**Ideal path**: 3 — search by mobile, click print (or WhatsApp). 
**Alternate paths**:
- Open the row → finished bill view → `Print`.
- Pharmacy Desk › `Invoices` → "Pharmacy Invoices" list → search → eye icon `View Invoice` (opens a new tab with a `Print` button) or `Download Invoice` (PDF).
- Inventory › Sales › `Patient invoice history` — the same list component.
- Pharmacy Report › Sales Bills / Sales Register (lookup only) *(row drill-down unverified)*.
- If the bill is the one just confirmed in this browser session: reopening it shows `Reopen confirmed invoice` → preview → `Print` / `Download PDF`.

#### Steps
1. Sidebar `Sales` → in the filter bar change `Search by` from "Bill No" to `Mobile`.
2. Type `9866073310` in the search box → after 300 ms the register shows the matching rows; the URL now carries `field=mobile&q=…`.
3. Hover the printer icon at the end of the row (tooltip "Print") and click it → the bill is fetched and the browser print dialog opens with "Pharmacy Invoice PHI-2026-398".
4. Or click the green chat icon (tooltip "Send on WhatsApp") → a new tab opens `wa.me/919866073310` with the message "Dear Sunita Sharma, thank you for visiting <clinic>. Your pharmacy bill PHI-2026-398 dated … is ₹… (UPI)." — text only; no PDF is attached.

#### Variations
- **Search by name or bill number**: `Search by` → `Patient` or `Bill No`.
- **Older bill**: default period is the current financial year; for last year pick `FY 2025-26` in `Period`.
- **Counter-sale row**: `Print` produces a "Pharmacy Receipt <reference>" with a Batch column instead of the invoice layout.

#### Edge Cases
- **No mobile on the bill**: WhatsApp icon disabled, tooltip "No mobile number"; malformed number → "Mobile number is not a valid 10-digit number".
- **Cancelled bill**: Print and WhatsApp disabled, tooltip "This bill is cancelled"; amount is struck through.
- **Print fetch fails**: toast "Could not print — Check your connection and try again."
- **Different paper for the same bill**: the reprint from the register / finished view / invoice list uses `lib/pharmacy-invoice-print.ts` (no batch, HSN, copy type or GST split), whereas the print at confirm time uses the builder's own A5 layout with those details.
- **Nothing found**: empty state "No sales match your search — Nothing recorded between … and … with these filters." with `Clear filters`.

---

### STORY-077: Check the day's takings by payment mode in the Sales register

**Type**: medium
**Topic**: Pharmacy sales, bills & returns
**Persona**: Dr. Kavya Rao, clinic owner-doctor, 8:45 pm before leaving
**Goal**: See today's pharmacy sales, how much came by UPI vs cash, who entered them, and what is unpaid
**Preconditions**: Signed in as DOCTOR. Several bills, one counter sale and one draft exist for today.
**Ideal path**: 3 — open Sales, choose Today, read a per-mode breakdown in one place.
**Alternate paths**:
- Sidebar `Daily Collection` (Pharmacy Report › Daily Collection) — takings by payment mode with cash count.
- Pharmacy Report › `Sales Register` / `Sales Bills` / `Day wise Summary` — with `Download` (Excel) and `Print`.
- Pharmacy Desk header metrics `Sales` / `Invoices`.
- "Pharmacy Invoices" list tiles (Total Invoices, Total Amount, Completed, Pending Amount) — computed from the current page only.
- Reports & Analytics › Revenue Report (admin roles).

#### Steps
1. Sidebar `Sales` → register for "FY 2026-27", newest first; footer reads "Total Amount ₹… · n bills".
2. In `Period` choose `Today` → rows and footer reload; the date link beside it reads today – today; the URL gains `from`/`to`.
3. Read the footer: "Total Amount ₹18,640.00 · 23 bills" and, underneath, "1 draft not included".
4. In `Payment` choose `UPI` → rows filter to bills with a UPI payment; footer changes to "Collected by UPI ₹… · n bills".
5. Change `Payment` to `Cash` → "Collected by Cash ₹… · n bills". (She notes there is no single view of all modes side by side.)
6. Change `Payment` to `Due (unpaid)` → rows with a red "Due ₹…" badge; footer "Due (unpaid) ₹… · n bills".
7. Set `Payment` back to `All`. Click `More filters` → set `Entry by` to "Sandeep Goud" → the button shows a "1" badge; only his entries remain.
8. In the same popover set `Source` to `Counter sales` → only rows with the blue "Counter sale" badge.
9. Click the `Bill Amount` column header → sorted highest first (arrow down); click again → lowest first.
10. Click `Clear all` → search, filters and period reset to the financial year (sort order is kept).
11. She looks for an export button to send the list to her accountant — there is none on this page; she goes to sidebar `Pharmacy Report` → `Sales Register` → `Download`.

#### Variations
- **Custom dates**: `Period` → `Custom` (or click the date link) → popover "Custom dates" with `From` / `To` typed as dd/mm/yyyy; applies on blur or Enter.
- **Returns side**: click tab `Returns` → the second register (columns add "Against bill"; "Amount" and "Refund" replace "Bill Amount" and "Payment"; footer "Refunded by …"); each tab remembers its own filters while switching.
- **Phone width**: filters collapse behind a `Filters (n)` button.
- **Deep link**: the header bell's overdue items open `/dashboard/pharmacy/sales?pay=CREDIT`, i.e. this register pre-filtered to `Due (unpaid)`.

#### Edge Cases
- **Range too long / reversed**: "Pick at most 400 days at a time." / "The From date is after the To date." / "Enter the From date as dd/mm/yyyy, year 2000 or later."
- **Load error**: red bar "Could not load sales. <message>" with `Retry`; footer "Total not available".
- **No permission**: "You don't have access to sales. Ask a clinic administrator to give your account access if you need it."
- **Page beyond the end** (e.g. stale `page=9` link): the register steps back to the last page automatically.
- **Label drift inside one filter**: the same mode is "Credit" as a row badge, "Due (unpaid)" in the filter and footer, and "Store credit" on the Returns tab.
- **50 rows per page**, fixed; previous/next arrows only.

---

### STORY-078: Give a forgotten discount on a finished bill and hand the money back

**Type**: medium
**Topic**: Pharmacy sales, bills & returns
**Persona**: Sandeep Goud, pharmacist; Dr. Rao phones the counter: "Mr. Narayana is staff family, give him 10 %"
**Goal**: Reduce the total of an already-paid bill, record why, and record the cash refund
**Preconditions**: Finished, fully paid bill `PHI-2026-405` for "K. Narayana, 94400 26118", total ₹2,360.00 paid by Card; no sales return against it.
**Ideal path**: 5 — open the bill's discount editor, enter 10 %, enter reason, save, record refund (method).
**Alternate paths**:
- Register row icon `Edit discount` (opens the bill with the dialog already open: `?bill=<id>&edit=discount`) — this story.
- Click the row → finished bill view → `Edit discount`.
- For a bill still in draft: change the discount in the builder itself (`Bill discount`, line `Discount %`).
- Money back for returned goods (not a discount): Returns › `New return` (STORY-079).

#### Steps
1. Sidebar `Sales` → search `Bill No` = `405` (or find the row).
2. Click the `%` icon on the row (tooltip "Edit discount") → the bill page opens and the dialog "Edit discount on PHI-2026-405" appears on top ("Only discounts change. Items, quantities, batches and stock stay as billed, and the bill keeps its number.").
3. Under `Bill discount` keep `%` selected and type `10` → the grey box shows "Total now ₹2,360.00", "Total after change ₹2,124.00" and an amber "Refund due after saving ₹236.00".
4. `Save discount` is still disabled with the hint "Enter a reason to save." → type in `Reason *`: "Staff family discount approved by Dr. Kavya Rao on phone".
5. Click `Save discount` → toast "Discount changed — PHI-2026-405 is now ₹2,124.00."; dialog closes.
6. The bill header now shows badges "Refund due ₹236.00" and "Revised <date>", an amber notice "₹2,360.00 was taken, ₹236.00 more than the bill total of ₹2,124.00. Hand it back and record the refund.", and a new card "Discount changes" listing time, Sandeep's name, "₹2,360.00 → ₹2,124.00" and the reason.
7. Click `Record refund ₹236.00` → dialog "Record refund of ₹236.00" ("K. Narayana paid more than the revised total of PHI-2026-405. Record the money you hand back.").
8. `Paid back by` defaults to `Cash` (options Cash, UPI, Card, Net banking, Wallet) — Sandeep hesitates: the customer paid by card, but he is handing back cash; he leaves `Cash`. `Reference (optional)` left blank.
9. Click `Record refund ₹236.00` → toast "Refund recorded — ₹236.00 paid back by Cash on PHI-2026-405."; header badge becomes "Paid"; the "Payments" card lists "Received · Card · …" and "Refund · Cash · …" with "-₹236.00".
10. Click `Print` → a revised copy prints with a "Revised" line. `Back to Sales` → the row shows a blue "Revised" badge and a grey "Refunded ₹236.00" badge beside `Card`.

#### Variations
- **Per-item discount**: edit a line's box under "Item discount %" instead of the bill discount.
- **Remove a discount (total goes up)**: the preview shows "Still to collect ₹…"; after saving, the bill shows "Due ₹…" — and there is no button here to take that money (see STORY-080).
- **Refund later**: skip steps 7–9; the register row keeps an amber "Refund due ₹236.00" badge until someone records it.

#### Edge Cases
- **Nothing changed**: `Save discount` disabled, hint "Change a discount to save."
- **Invalid value**: "Discount for <item> must be between 0 and 100%." / "Bill discount cannot be more than 100%." with hint "Fix the discount first."
- **Bill changed meanwhile**: red box "Discount not changed — This bill was changed after you opened it. Reload it to see the latest amounts." with `Reload bill`.
- **Bill has a return**: "This bill has a sales return (<refs>), so its discount can no longer be changed. Correct it through the return."
- **Same drug on two lines at different effective prices**: refused with "… is on this bill more than once at different prices, so a return could not tell which price to refund…".
- **Refund amount is fixed**: the dialog always refunds the full refund-due figure; a part refund is not possible. Server guards: "Nothing is due back on this bill." / "Only ₹… is due back on this bill. Reload it to see the latest amounts."
- **Draft / cancelled / counter-sale / return rows**: the `%` icon is disabled with "Open the draft to change its discount", "Cancelled bills cannot change", "Counter sales are corrected in Inventory", "Returns have no discount to edit". Appending `&edit=discount` to a cancelled bill's URL does not open the dialog.

---

### STORY-079: Take back an unopened medicine and refund the patient (sales return)

**Type**: medium
**Topic**: Pharmacy sales, bills & returns
**Persona**: Farheen Begum, pharmacist; patient Rohit Deshmukh returns one sealed tube bought two days ago
**Goal**: Record the return against the original bill, put the tube back in stock, refund ₹412 in cash
**Preconditions**: Finished bill `PHI-2026-391` containing "Momate Cream 15 g" ×2. User has write permission for customer returns in Inventory.
**Ideal path**: 6 — open the original bill, choose "return items", tick the line and quantity, choose restock, choose refund method, post.
**Alternate paths**:
- Sales › tab `Returns` › `New return` (this story) — leaves Sales and opens Inventory with a `return=` link back.
- Sidebar `Inventory` › area `Sales` › `Customer returns` › `New document` — same editor, back button returns to the Inventory list instead.
- Returns register empty state button `New return`.
- A posted return can be undone only by an approver via `Correct by reversal` in the document.
- Price-only correction (no goods back): `Edit discount` + `Record refund` (STORY-078).

#### Steps
1. Sidebar `Sales` → click tab `Returns` → the "Sales returns" register; the header button now reads `New return`.
2. Click `New return` → the app navigates to `/dashboard/inventory?area=sales&view=SALES_RETURN&new=…&return=…`; the Inventory workspace shows status "Unsaved draft", heading "Customer returns", help "Select the original sale and choose restock, quarantine or loss for each returned batch.", buttons `Save draft` and `Post return`. Farheen notices she is now in a differently styled screen with no bill to start from.
3. In `Search original sale` ("Sale reference, product, barcode or SKU") type `PHI-2026-391` (or `momate`) → the `Add from original sale` dropdown refreshes *(server-side match on the bill number is unverified)*.
4. Open `Add from original sale` ("Select sold batch · remaining return quantity") and pick the option for bill 391 — options read "<sale reference> · Momate Cream 15 g · <batch> · 2 <unit>" (the reference is the stock movement's, written by the server as `INV-<bill number>`; exact display unverified) → a line is added with Quantity 1 and the original rate, discount and GST locked; Disposition "Restock".
5. Leave `Quantity` at 1; leave `Disposition` = `Restock` (other choices: `Quarantine`, `Record as loss`).
6. Type `Customer name (optional)` "Rohit Deshmukh" and `Phone (optional)` "9123456780" — the form does not copy these from the chosen sale.
7. Change `Refund method` from its default `CREDIT` to `CASH` (options are the raw codes CASH, UPI, CARD, CREDIT).
8. Type `Reason / notes` (placeholder "Required before posting"): "Duplicate purchase, tube sealed".
9. Click `Post return` → the draft is saved and posted in one go; green notice "Saved status confirmed. Review the outcome and recorded effects below."; status "Posted"; sections "Refund / credit recorded" ("₹412.00 · CASH · …" and "This records the refund in the ledger. Settle cash or the chosen payment method separately."), "Confirmed stock effects" and "Document history" appear.
10. Hand ₹412 to the patient.
11. Click the back arrow at top-left (tooltip "Back to customer returns") → because of the `return=` parameter it lands back on Sales › `Returns`, where the new row shows the return reference, "Against bill PHI-2026-391", Amount ₹412.00 and a `Cash` badge under "Refund".

#### Variations
- **Damaged or opened item**: set `Disposition` to `Quarantine` (stock held; later `Release held stock` on the posted document) or `Record as loss`.
- **Several items**: repeat step 4 per sold batch; `Load more original sales` pages the dropdown.
- **Refund as store credit**: leave `CREDIT` → the Returns register shows the badge "Store credit".
- **Send confirmation**: on the Returns row click `Send on WhatsApp` → "Dear Rohit Deshmukh, <clinic> has processed a refund of ₹412.00 against bill PHI-2026-391 on …".
- **Open an existing return**: click a Returns row → the same Inventory editor in read-only state, with `Export lines` and `Print QR label` icons.

#### Edge Cases
- **Already fully returned batch**: options with no remaining return quantity are filtered out of the dropdown, so the sale simply does not appear.
- **Missing reason / other server refusals**: red alert with the server message and "Your attempted edits remain in the form and have not been saved. Correct the reported issue before trying again."
- **No write permission**: fields are disabled and the action buttons are absent; a "Recovery handoff" text box is shown instead.
- **Uncertain outcome (network drop while posting)**: status "Outcome not confirmed" with a `Check saved status` button; mutation buttons are hidden until settled.
- **Discount edits blocked afterwards**: the original bill's `Edit discount` is refused once a return exists (see STORY-078).
- **Naming**: the tab says "Returns", the button "New return", the register table "Sales returns", the Inventory screen "Customer returns", the print "Sales Return".
- **Print icon on a Returns row** prints a "Sales Return <reference>" receipt; draft returns show "Finish this draft return first".

---

### STORY-080: Collect the balance on a bill that shows "Due"

**Type**: medium
**Topic**: Pharmacy sales, bills & returns
**Persona**: Sandeep Goud, pharmacist, following up the bell notification "1 overdue invoice"
**Goal**: Take ₹180 still owed on a bill and mark it settled
**Preconditions**: Bill `PHI-2026-377` (dated last week, paid by UPI) shows "Due ₹180.00" because a discount was later reduced via `Edit discount`.
**Ideal path**: 3 — open the due bill, click "record payment", choose mode and confirm.
**Alternate paths**:
- "Pharmacy Invoices" list at `/dashboard/pharmacy/invoices` (Pharmacy Desk › `Invoices`) → green tick `Mark as Paid` — this story; the only UI that calls the payment endpoint.
- Same list at Inventory › Sales › `Patient invoice history` → `Mark as Paid`.
- *Not* possible from the Sales register, the finished bill view, or the Counter cockpit's `Collect payment` (that button only opens a bill).

#### Steps
1. Click the bell in the header → click the overdue item (every overdue / pending-money notification links to the same address; whether this particular bill is counted by the alert is unverified) → `/dashboard/pharmacy/sales?pay=CREDIT`: the Sales register filtered to `Payment` = "Due (unpaid)"; the row for `PHI-2026-377` has a red "Due ₹180.00" badge.
2. Click the row → finished bill view with badge "Due ₹180.00" and summary row "Due ₹180.00". The only buttons are `Print` and `Edit discount`. Sandeep looks for a way to record the payment and finds none.
3. Sidebar `Pharmacy Desk` → click `Invoices` in the dark header → page "Pharmacy Invoices" (the title appears twice: page heading and the list's own header).
4. The list defaults to `Date Range` = "Today", so last week's bill is missing → type `377` in `Search` ("Invoice number, patient...") and change `Date Range` to `All dates`.
5. On the card for `PHI-2026-377` (status chips, "Payment: UPI") click the green tick icon (tooltip "Mark as Paid").
6. A native browser confirm appears: "Mark invoice PHI-2026-377 as paid? Remaining payment: ₹180.00" → click OK. (The payment is recorded in the bill's original method — UPI — there is no way to say it was cash.)
7. A native alert "Invoice marked as paid successfully" → click OK; the list reloads and the tick icon disappears from that card.
8. Go back to `Sales` → the row no longer shows the Due badge.

#### Variations
- **OWNER** has no `Pharmacy Desk` sidebar entry: reach the same list through `Inventory` › `Sales` › `Patient invoice history`.
- **Interrupted payment**: if the request outcome is unknown, alert "Payment could not be confirmed. Retry to reconcile the same payment." and the icon's tooltip becomes `Retry Payment`, reusing the same amount and request key.

#### Edge Cases
- **Already settled**: alert "This invoice has no remaining balance."
- **Clear vs. Today**: `Clear` sets the date range to "All dates", not back to the default "Today"; a new sale elsewhere fires an event that forces it back to "Today".
- **Tiles mislead**: "Pending Amount" sums only the invoices on the current page whose payment status is PENDING.
- **Naming**: the same state is "Due" (finished view), "Due (unpaid)" (register filter), "Credit" (mode), "Pending"/"Partially Paid" (invoice list), "overdue invoice" (bell).

---

### STORY-081: Look through the "Pharmacy Invoices" list and open one

**Type**: short
**Topic**: Pharmacy sales, bills & returns
**Persona**: Anitha Krishnan, clinic admin, checking what was billed to a patient this month
**Goal**: See a patient's pharmacy invoices with their items and download one as PDF
**Preconditions**: Signed in as ADMIN; patient "Imran Khan" has 3 pharmacy bills this month.
**Ideal path**: 3 — search patient, see bills, download.
**Alternate paths**:
- Sales register: `Search by` `Patient` → row → finished bill view (no PDF button there; `Print` only).
- Inventory › Sales › `Patient invoice history` — identical component, embedded without the `Back` button.
- Pharmacy Report › Sales Bills.
- Deep link `/dashboard/pharmacy/invoices?search=<text>` pre-fills the search and sets the date range to "All dates".

#### Steps
1. Sidebar `Pharmacy Desk` → click `Invoices` → "Pharmacy Invoices" with four tiles (Total Invoices, Total Amount, Completed, Pending Amount) and filters Search, Status, Payment Status, Payment Method, Date Range (default "Today"), `Clear`.
2. Type `Imran` in `Search` and set `Date Range` to `This Month` → cards list each invoice: number, two status chips, Patient, Phone, Doctor, Payment, Items count, Date, Subtotal, Total and the first two item lines ("+1 more items...").
3. Click the eye icon (`View Invoice`) on a card → a new browser tab opens with the printable invoice and a `Print` button.
4. Back on the list, click the download icon (`Download Invoice`) → a PDF named after the invoice number is saved without a pop-up.
5. Click `Back` (top-left) → returns to `/dashboard/pharmacy` (the Desk), not to wherever she came from.

#### Variations
- **Draft card**: shows "Draft" as its number, no eye/download icons, a pencil `Continue in Sales` that opens `/dashboard/pharmacy/sales/bill?draft=<id>`.
- **Paging**: 20 per page with `Previous` / `Next` and "Page x of y".

#### Edge Cases
- **Pop-up blocked**: native alert "Please allow pop-ups to view the invoice".
- **Delete on every card**: the red bin `Delete Invoice` is shown even on finished bills; after a native confirm "Are you sure you want to delete this invoice?" the server refuses a finished bill ("This bill was already finished. It can no longer be discarded.") in a native alert. On a draft it deletes and alerts "Invoice deleted successfully".
- **Load failure**: logged only; the list silently shows "No invoices found — Try a different search or adjust the filters."
- **Counter sales and returns are absent** from this list (it reads pharmacy invoices only), although they appear in the Sales register.
- **Icon-only actions**: labels exist only as hover titles.

---

### STORY-082: Sell to an unnamed walk-in choosing the exact batch (Counter sale)

**Type**: medium
**Topic**: Pharmacy sales, bills & returns
**Persona**: Farheen Begum, pharmacist; a passer-by wants one sunscreen and does not want to register
**Goal**: Sell from a specific batch without creating a patient, and have the sale show in Sales
**Preconditions**: User has write permission for counter sales in Inventory. "Suncros Soft SPF 50 Gel 50 g" has two batches (expiring 03/2027 and 11/2027).
**Ideal path**: 4 — start a quick sale, scan/search the item (batch pre-chosen by earliest expiry), choose payment mode, post-and-print.
**Alternate paths**:
- Sales bill builder (`New sale`) — requires a patient; batch chosen by the server, not the user (STORY-073).
- Inventory › Sales › `Quotations` › `New quotation` › `Create sale draft` → converts into a counter-sale draft.
- Reopen an existing counter sale from the Sales register row (blue "Counter sale" badge) → same editor with a link back to Sales.

#### Steps
1. Sidebar `Inventory` → top nav `Sales` → task `Counter sales` → list "Counter sales" ("Choose the actual batch and stock unit. Drafts do not reserve; posting reduces available stock.").
2. Click `New document` → editor with status "Unsaved draft", buttons `Save draft` and `Post sale`.
3. In `Add a batch` ("Search product, batch, barcode or SKU") type `suncros` → matches are listed earliest-expiry first, each as "<name> · <batch> · expires <date>" and "<n> <unit> available · <cost price>".
4. Click the first batch → a line is added: Quantity 1, Free 0, "Rate excl. GST" (selling price with GST backed out), Discount %, Scheme ₹, GST %, Total; under the name: batch, unit, expiry, MRP, location and "n <unit> available at selection".
5. Leave `Quantity` 1. (If she had picked the later-expiring batch she would type why in "Batch-selection reason (if bypassing earlier expiry)".)
6. Leave `Customer name (optional)` blank (placeholder "Walk-in customer") and `Phone (optional)` blank.
7. Set `Payment method` to `UPI` (options CASH, UPI, CARD, CREDIT); leave `Order type` = Pickup; `Doctor (optional)` blank.
8. Click `Post sale` → notice "Saved status confirmed. Review the outcome and recorded effects below."; status "Posted"; "Confirmed stock effects" lists the unit removed.
9. Sidebar `Sales` → the sale is in the register with its document reference as Bill No, a blue "Counter sale" badge, Patient "—", and a `UPI` badge.
10. Click the printer icon on that row → "Pharmacy Receipt <reference>" prints (with Batch column).

#### Variations
- **Save first, post later**: `Save draft` → appears in Sales as a Draft row; opening it returns to the Inventory editor.
- **Credit sale**: `Payment method` = `CREDIT` → the Sales row shows a red "Credit" badge and is caught by the `Due (unpaid)` filter.
- **Filter only these**: Sales › `More filters` › `Source` = `Counter sales`.

#### Edge Cases
- **No matching batch**: "No matching batch. Add the product/batch in Stock, then return here."
- **Discount change afterwards**: the Sales row's `%` icon is disabled — "Counter sales are corrected in Inventory" (i.e. `Correct by reversal`, approvers only).
- **No WhatsApp**: with no phone, the WhatsApp icon shows "No mobile number".
- **No shortcut from Sales**: on the `Sales` tab `New sale` always opens the patient bill builder; there is no button for a counter sale there.
- **Two selling tools, two vocabularies**: the bill builder says "Unit Price" and "Tax %"; this editor says "Rate excl. GST", "GST %", "Scheme ₹" and "Free". Payment options differ too (builder: Cash / Card / UPI / Net Banking; here: CASH / UPI / CARD / CREDIT).

---

### STORY-083: Recover when the connection drops while confirming a bill

**Type**: short
**Topic**: Pharmacy sales, bills & returns
**Persona**: Sandeep Goud, pharmacist, clinic Wi-Fi flickers at the moment he confirms
**Goal**: Find out whether the sale went through and avoid billing the patient twice
**Preconditions**: A complete bill for "Pooja Nair, 97010 88342" in the preview; the request to `/pharmacy/invoices/checkout` gets no response.
**Ideal path**: 2 — one "retry / check" action, then print.
**Alternate paths**:
- Check the Sales register (or "Pharmacy Invoices" list) for the bill manually — the recovery-failure toast itself says "Check the invoice list before creating another sale."
- Reload the page: the pending attempt is restored from `sessionStorage` on any bill page.

#### Steps
1. Click `Confirm & Print` → after the failure a red toast "Error Confirming Invoice — <network message>" appears; the preview stays open.
2. Click `Close` → above the bill an amber notice reads "A checkout for Pooja Nair needs confirmation. Retry it before starting another sale." with one button `Retry pending checkout`; `Save draft` is hidden.
3. Click `Retry pending checkout` → the exact same payload and request key are resent; the server either completes the sale or returns the bill it already created (no second bill); toast "Success — Invoice PHI-… confirmed successfully" and the preview reopens as Confirmed.
4. Click `Print` → print; `Close` → notice now says "This checkout is confirmed. Reopen it for another copy." → `Back to Sales`.

#### Variations
- **He reloads the tab instead**: the same amber notice is shown on the fresh page, even on a blank new sale, until retried.
- **He edits the bill and tries to confirm again**: refused with "Resolve the pending checkout before changing its details or starting another sale. Use Retry pending checkout."

#### Edge Cases
- **Server rejects outright (400/404)**: the pending attempt is dropped and only the error toast shows — fix the bill and confirm again.
- **Draft was changed/finished elsewhere**: red banner with the server message plus "Your changes on this screen were not saved." and `Reload draft`; the preview closes.
- **Stored attempt unreadable**: toast "Checkout recovery failed — Stored checkout could not be read. Check the invoice list before creating another sale."
- **Different browser / device**: the attempt lives in this tab's `sessionStorage` only; from another machine the only check is the register.

---

### Purchases, suppliers & payables

Source: `topics/inventory-purchases.md`

### STORY-084: Scan a two-page distributor bill, fix the reading, match products and add stock

**Type**: long
**Topic**: Purchases, suppliers & payables
**Persona**: Sravani Kolla, pharmacist, Friday 11:20 am — a carton from Sri Venkateshwara Pharma Distributors arrived yesterday evening and the counter is quiet for ten minutes
**Goal**: Get the 6-line credit bill SVP/26-27/4183 (₹18,642) into the system so the stock is sellable and the payable is on the books
**Preconditions**: Logged in as PHARMACIST with purchase create/review/commit permissions. Supplier "Sri Venkateshwara Pharma Distributors" (GSTIN 36AAKFS4821M1Z6) already saved. Four of the six products exist in the catalogue; one has a near-duplicate with a different pack; one (a new sunscreen) does not exist. Doctor has recorded Terms of Trade for two of the products. Two phone photos of the bill are on the desktop.
**Ideal path**: 6 — open intake, drop both pages, scan, confirm the handful of flagged values in one pass, accept product matches in bulk, post. Everything else is machine work.
**Alternate paths**:
- Entry to the same workbench: Today `Scan or enter bill` button; Purchases task strip `Scan or enter bill`; Purchase bills `New purchase`; empty-register `New purchase`; denied-register `Scan or enter a bill`; Today queue row "Original files awaiting intake".
- Other ways to bring the same bill in: `Type instead` (STORY-085), `Import CSV` and `Gmail intake` (STORY-093), `Automatic import` › `Import & Add Stock` on the same screen (skips human review when every check passes), an Inward challan followed by `Create linked purchase bill` (goods-first route, Stock/Reorder topic).
- Posting: `Confirm reviewed values & add stock` (one button saves, reviews and commits); or `Save draft` now and `Add stock` later from the reviewed bill; or `More options` › `Save & Process` (automatic processing); review-only users get `Mark Reviewed` and a colleague presses `Add stock`.

#### Steps
1. Click `Inventory` in the sidebar → "Loading inventory permissions…" skeleton, then Today with "What needs attention".
2. Click `Scan or enter bill` (primary button above the queues) → URL `?area=purchases&view=intake`; heading "Scan or enter bill", sub-line "Upload every page. Check the reading. Add stock when ready."; the "Scan a bill" panel is open with the cue "Scan only · stock stays unchanged". Also visible before she has done anything: a `Recover interrupted import` button, a collapsed "Recent invoices (n)" and a collapsed "Review status guide".
3. Click the file input "Upload invoice PDF or image" and multi-select `IMG_2291.jpg`, `IMG_2292.jpg` → helper text "PDF or photos · Up to 10 files · One invoice, in page order". There is no thumbnail or page-order preview; she has to trust the file dialog's order.
4. Look at "Received on" — prefilled with today (13/11/2026). The goods came yesterday, so she changes it to 12/11/2026. *(Hesitation: the field sits to the right of the upload, above the button; easy to miss.)*
5. Click `Scan bill` → button reads "Reading bill…" with a spinner; the whole form is disabled. After the read: notice "Extracted 6 line items from IMG_2291.jpg. Review the draft before saving; 5 OCR flags need attention." On a wide screen the page splits: form on the left, "Original invoice" viewer on the right. A "Finish this purchase" box appears above, and "Check before adding stock" shows "*n* checks to finish".
6. Read the "Supplier" block → Distributor and GSTIN are filled; status "Matching saved supplier found. Continue with invoice review." A blue panel "Agreed terms with Sri Venkateshwara Pharma Distributors — Recorded under Purchases, Terms of Trade. Compare each line with what was promised." lists two products.
7. In the amber checklist, click `Correct` beside the bill-type check ("… Check against the original before confirming.") → focus jumps down to "Bill Type" inside the "Distributor Bill" card.
8. Change Bill Type from `Cash` to `Credit` → "Due Date" becomes editable.
9. Enter Due Date 12/12/2026 → required for a credit bill ("dueDate is required before review" otherwise).
10. Type the supplier's licence into "DL No." (`TS/HYD/20B-4471`) → this is a hard requirement for posting although it is not marked required on the field.
11. Click the small source icon beside "Invoice No." (tooltip "Show on original invoice") → the right pane scrolls/highlights and reads "Invoice No. · captured: SVP/26-27/4183". She confirms it matches the paper.
12. Click `Next check` in the sticky bottom bar → counter "Check 1 of 4 · Line 2 batch"; focus lands in line 2's "Batch" field.
13. Click "Zoom in original" twice, compare, and correct batch `BN24O91` → `BN24091`.
14. Click `Next check` → "Line 5 expiry". The line is on the second photo, so she changes the viewer's "Page" select to `2`.
15. Correct "Exp. Year" 2023 → 2028 (the red "expired batches can be saved for correction but cannot be reviewed or committed" warning disappears).
16. Click `Next check` → line 6 "HSN", inside the auto-opened "Other commercial details" disclosure → type `33049990`.
17. Click `Back to review` (the `Next check` button's label on the last stop) → focus returns to "Check before adding stock". An amber "Products need attention" block now names Line 4 and Line 6.
18. Click `Resolve line 4 product` → the "Product matching and catalogue details" disclosure opens on the "Product matching and details" card.
19. For lines 1, 2, 3 and 5 the badge reads "Same product · confirm"; click `Confirm Match` on each (4 clicks) → each turns green "Matched {product}"; notice "Matched … in the drug master."
20. Line 4 ("Photostable Gold SPF 55 Gel 50g") shows "Possible match · confirm" against a saved 30 g pack. She clicks `Confirm Match` out of habit → a box "These look like different products" appears in "Finish this purchase" with "Invoice product" and "Saved product" side by side and the mismatch list. *(She hesitates — the box is at the top of the page, far from the button she pressed.)*
21. Click `Choose another product` → back in the line-4 card.
22. Type `Photostable` in "Search saved products manually" → results list; click `Match Photostable Gold SPF 55 Gel 50g`.
23. Line 6 ("Sunstop Aqua Gel SPF 50 60ml") shows the outline badge "Not in inventory". In the inline "New product details" form choose Product kind `Cosmetic / skin care` and fill "Category (required)".
24. Click `Create new item` → badge "Created Sunstop Aqua Gel SPF 50 60ml". The amber product block clears; the checklist cue reads "Ready for your final check".
25. Scroll to "Products on this bill". Line 3 carries a blue hint: "Agreed: 10% · 10+1" over "Invoice: 8% · 10 paid + 0 free · exp 08/2028 · rate ₹212.00". The distributor short-changed the scheme. She notes it in "Additional invoice details" › "Notes" to raise with the rep; the system does not block or flag it elsewhere.
26. Scroll to "Check bill total" → Gross / Taxable / GST / TCS / "Net Payable ₹18,642.00"; below, "Lines 6 · Paid stock units · Free stock units · Received stock units · Indicative margin at MRP". She compares Net Payable with the printed total.
27. Read the sticky bar guidance: "Confirm values against the original. Adds the received quantities to stock." and status text "Not saved · stock not added".
28. Click `Confirm reviewed values & add stock` → the button stays labelled and shows a spinner; top status pill cycles "Saving and checking invoice…" → "Adding stock…" → "Stock added" with "Reference: …".
29. Read the green "Stock added - saved receipt" list → six links "{product} · {batch}" each with "N stock units added"; notice "Stock added for SVP/26-27/4183. The saved record confirms the operation completed."
30. Click `New invoice` (top-right of the sticky nav) to start the next bill, or `Back to list`.

#### Variations
- **Supplier not saved yet**: step 6 shows "No saved supplier matches these details." She ticks "I checked the supplier name and GSTIN against the original invoice." and clicks `Save verified supplier` (2 extra steps) — or skips it; the hint says she can "continue without saving a supplier … then confirm your review and choose Save & Process" (that button name is stale: the primary action is now `Confirm reviewed values & add stock`).
- **Saved supplier has a different GSTIN**: red "Supplier GSTIN differs" box → `Correct saved GSTIN` → "Reason for correction" + checkbox "I checked the new GSTIN against the original invoice and want to correct this saved supplier." → `Update saved GSTIN` (needs supplier-update permission).
- **Same GST on every line misread**: open "Apply GST or discount to selected rows" → `Select all 6 rows` → Change `GST`, GST mode `CGST + SGST`, "Total GST %" 18 → `Preview 6 selected rows` → `Apply to 6 selected rows` (with `Undo shared terms`).
- **Goods were received earlier on an inward challan**: open "Link stock received earlier" → "Receipt reference" → `Find posted receipts` → choose in "Posted receipt"; the primary button becomes `Confirm & post bill` and the result reads "Stock received earlier · 0 added again".
- **Review-only colleague (no stock permission)**: primary button reads "Confirm reviewed values & mark reviewed"; outcome "Review saved. Stock not added. An authorized colleague can add stock from this reviewed invoice." A second person opens the bill and presses `Add stock`.
- **OCR garbage on a crumpled bill**: in "Finish this purchase" click `Enter complete invoice manually` → native confirm "Discard the OCR reading and type every invoice row from the complete original? …" → continues as STORY-085 with the photo kept.
- **Wrong file uploaded**: `Reject this upload` → native confirm → "Upload rejected. No stock was added; the original remains in Saved uploads."

#### Edge Cases
- **Duplicate bill**: saving a bill whose supplier + number already exists shows "Finish this purchase" with "Existing invoice: …" and `Open existing invoice` → "Compare with saved invoice" (`Use saved values` / `Apply my corrections to this invoice` / `Keep my attempted entry`).
- **Scan fails**: "Original file saved. Enter the invoice details manually or retry the upload." — the photo is kept under "Saved uploads (n)" (collapsed, bottom of the page, latest 20) with `Use for this draft`.
- **Network drops during posting**: status "Stock status unknown" and `Refresh stock status`; every write control is hidden until the saved outcome is re-read. `Recover interrupted import` (always on the page) asks for an "Import attempt ID", optional "Original operator ID" and "Recovery reason".
- **Someone else edited the draft**: alert "Saved invoice changed" → `Compare with saved version`.
- **Posting blocked**: the sticky bar replaces its guidance with the first blocker, e.g. "Resolve the product checks before adding stock.", "Enter the goods received date before adding stock.", or the raw validation string ("Line 3: purchased plus free quantity must be greater than zero"); the button is disabled but does not say which field to visit unless `Next check` stops exist.
- **`Back to list` after entering from Today or the task strip**: those entries set no `return` target, so `back()` only clears parameters that are already empty — the user appears to stay on the same posted bill *(inferred from `InventoryWorkspace.back()`; verify in a walk)*. It returns to the register only when the bill was opened from it.
- **Same thing shown several times**: stock state appears in the top "Stock status" pill, the bottom bar ("Not saved · stock not added"), the "Scan only · stock stays unchanged" cue and each notice; the "what to do next" sentence appears in "Finish this purchase", in "Finish invoice review" and in the bottom bar. `Refresh Matches` and `Retry product check` call the same function; `Resolve line N product` and `Fix products on this invoice` both just scroll to the matching card.
- **One concept, several names** on this one screen: Distributor / Supplier / "Saved supplier"; Bill / Invoice / Purchase ("Scan bill", "Invoice No.", "Finish this purchase", "Purchase documents & history"); catalogue / "saved product" / "drug master" / "inventory" ("Not in inventory") / "item" (`Create new item`); "Add stock" / "post" / "commit" ("Committed Items", "posted to inventory").

---

### STORY-085: Type a small cash bill by hand, get interrupted, resume and post

**Type**: medium
**Topic**: Purchases, suppliers & payables
**Persona**: Imran Sheikh, pharmacist on the evening shift — a local stockist dropped two items with a carbon-copy handwritten bill that will not scan
**Goal**: Record cash bill DDD/1127 from Deccan Derma Distributors (2 lines, ₹2,360) and add the stock
**Preconditions**: PHARMACIST with create/review/commit. Supplier saved. Both products exist in the catalogue. No file to upload.
**Ideal path**: 6 — open entry, pick supplier, type number/date, add two lines by picking products from a list (batch, expiry, qty, rate), post.
**Alternate paths**:
- `Type instead` link under `Scan bill` (used here); `Enter complete invoice manually` after a failed scan; `Import CSV` with a one-bill CSV.
- Stock without a supplier bill: Stock › `Manual opening stock`, Stock list `Add batch` (approval flow), `Inward challans` — these add stock but create no payable.
- Resume routes for unfinished work: "Saved unfinished intake" buttons on the scan screen (server intake drafts); Purchase bills with Payment status `Not posted` (saved invoice drafts only); "Recent invoices (n)" on the scan screen; Today › "Purchase invoices to review"; per-tab local recovery ("Restored your unfinished purchase draft from this tab.").

#### Steps
1. Sidebar `Inventory` → `Purchases` → task strip `Scan or enter bill` → the scan screen.
2. Click the `Type instead` link under the `Scan bill` button → the entry form opens and focus lands on "Distributor"; "Check before adding stock" already reports missing values.
3. Type `Deccan` in "Distributor" — it is a plain text box, so nothing is suggested. He opens the "Saved supplier" select ("Select after checking the original invoice") and picks "Deccan Derma Distributors — 36AAICD5530K1Z2" → name and GSTIN fill; "Matching saved supplier found. Continue with invoice review."
4. In "Distributor Bill" type DL No., Invoice No. `DDD/1127`; leave Invoice Date and Goods Received at today; Bill Type stays `Cash` (Due Date is disabled).
5. In "Products on this bill", line "1. New product": type Product `Benzac AC 2.5% Gel`, Pack Size `20 g`, Stock unit `Tube`, Batch `GD4417`, Exp. Month `6`, Exp. Year `2028`, Paid Qty `10`, Free Qty `0`, Rate `118`, MRP `165`, CGST % `6`, SGST % `6`. (12 fields; "Product" is free text with no autocomplete.)
6. The checklist shows "Checking invoice products…" and then "Products need attention — Line 1 … No exact active product matches this name and pack. Correct the invoice identity or choose an existing product. Create a product only if none exists." *(He typed the name slightly differently from the catalogue.)* Click `Resolve line 1 product` → matching card → `Confirm Match` on the suggested "Benzac AC 2.5% Gel 20g".
7. Click `Add Line` → line 2; type Product `Kojivit Gel`, Pack Size `15 g`, Stock unit `Tube`, Batch `KV2209` … and is called to the counter before entering the quantity.
8. Click `Save draft` so the entry is not lost → because line 2 fails validation, a red "Fix Required — These corrections were not saved. Fix the fields below, then try again." list appears *and* the notice "Unfinished invoice saved to the server. Missing fields are allowed; stock has not changed." *(Both messages render together — inferred from `saveIncompleteDraft` not clearing the validation list; the two statements contradict each other.)*
9. Twenty minutes later: `Inventory` → `Purchases` → he looks for the bill in `Purchase bills` with Payment status `Not posted` → it is not listed (the register reads saved invoices only; an "unfinished intake" is a different record).
10. Click `Scan or enter bill` → under "Saved unfinished intake" click the button `DDD/1127 · 13 Nov 2026` *(date format unverified)* → "Restored the saved invoice intake. Complete the highlighted checks before adding stock."
11. Finish line 2: Exp. Month/Year, Paid Qty `10`, Rate `104`, MRP `149`, CGST/SGST; open "Other commercial details" on both lines to enter HSN (required before review).
12. `Confirm Match` for line 2 in the matching card.
13. Compare "Net Payable ₹2,360.00" in "Check bill total" with the paper.
14. Click `Confirm reviewed values & add stock` → "Stock added"; "Stock added - saved receipt" lists both batches.

#### Variations
- **Draft that passes validation** (every required header and line value present, some checks open): `Save draft` creates a real invoice — "Invoice DDD/1127 saved. Stock not added. Check the bill before adding stock." — and that one *does* appear in Purchase bills as "Not posted" (Bill status `Draft`).
- **Product missing from catalogue**: inline "New product details" → `Create new item` (as STORY-084 step 23–24).
- **Reception enters, pharmacist posts**: a RECEPTION user without commit permission ends at "Confirm reviewed values & mark reviewed".

#### Edge Cases
- **No product picker**: product identity is typed first and matched afterwards in a separate card; a typo creates a "Products need attention" detour for every line.
- **Required-but-hidden fields**: HSN lives under "Other commercial details"; DL No. looks optional; both block posting ("… is required before review").
- **Cash bill with a due date typed earlier**: switching Bill Type back to `Cash` disables Due Date.
- **Rounding**: "Rounding adjustment cannot exceed Rs. 1".
- **Closing the tab mid-entry**: local recovery restores the draft in the same tab only; `Save draft` is the only cross-device path.
- **Two "draft" concepts under one button**: `Save draft` silently produces either an invoice draft (in the register) or an unfinished intake (not in the register) depending on validation.

---

### STORY-086: Find last month's bill from one distributor and open the original

**Type**: short
**Topic**: Purchases, suppliers & payables
**Persona**: Venkat Rao, clinic admin, on the phone with Medline Agencies' accounts person who is quoting bill "MA/2611"
**Goal**: Find the bill, see whether it is paid and open the scanned original
**Preconditions**: ADMIN. The bill was posted in October 2026 with a photo attached.
**Ideal path**: 3 — open Purchase bills, type the bill number, click the attachment.
**Alternate paths**:
- Suppliers › row `Bills` (opens the register filtered to that GSTIN).
- `Payments & dues` › pick the distributor › invoice link in "Bulk Payment Allocation" (outstanding bills only).
- "Recent invoices (n)" on the scan screen (latest few only).
- Pharmacy Report › `Purchase Register` / `Purchase Bills` (read-only GST reports with their own search "Distributor, bill no. or GSTIN"; no link to the bill or the original).
- Stock › `Stock ledger` and an item page link back to the purchase.
- `Print QR` on a bill says "scan or paste its purchase code into the register search" — the register's search only offers `Bill No` and `Distributor` *(whether a pasted code matches is unverified)*.
- Header global search does **not** cover purchase bills.

#### Steps
1. Sidebar `Inventory` → `Purchases` → lands on `Purchase bills`, tab `Purchase`; Period defaults to the current financial year; newest entry first.
2. Leave "Search by" on `Bill No`, type `2611` in the search box → the grid filters (debounced); columns Sr No · Bill No · Entry Date · Bill Date · Entry By · Distributor · Bill Amount · Payment.
3. Read the Payment cell → e.g. red badge "Overdue · 12d" with a `Mark paid` button, or "Paid".
4. Click the paper-clip beside the bill number ("Open original bill MA/2611") → the photo/PDF opens; with several files it is a small menu of file names.

#### Variations
- **Does not know the number**: "Search by" → `Distributor`, type `Medline`; or `More filters` → Distributor `Medline Agencies`. With one distributor in view a strip appears: "Medline Agencies · across all bills, not just this period — Due ₹… − Credit held ₹… = Net payable ₹…".
- **Only unpaid**: "Payment status" → `Outstanding` / `Due` / `Overdue` / `Part paid` / `Paid` / `Not posted`.
- **Other filters** under `More filters`: "Bill status" (`Draft`, `Any review step`, `OCR review required`, `Reconciliation failed`, `Reviewed`, `Stock added`, `Cancelled`), "Source" (`Typed in`, `Scanned`, `CSV import`, `Gmail`), "Entry by". `Clear all` resets.
- **Export**: `More` ▾ → `Export to Excel` (current filters).
- **Open the bill itself**: click the bill number or the row → workbench in read-only form with `Back to list`.

#### Edge Cases
- **Bill dated in the previous financial year**: nothing found until Period is changed (presets `Today`, `Yesterday`, `Last 7 days`, `This month`, the two FY labels, `Custom`). Empty state: "No purchase bills match your search — Nothing entered with a bill date between … and … with these filters." + `Clear filters`.
- **Totals footer**: "Bills ₹… · Outstanding in these N bills ₹…" (the outstanding part is a link to `Payments & dues`) with a note "*n* not posted and *m* cancelled not included".
- **MANAGER**: has Inventory in the sidebar but is not in the register's server role list — expect the denied state with `Scan or enter a bill` *(inferred from `pharmacy-purchase-register.controller.ts`)*.
- **Status vocabulary differs by surface**: the register says "Stock added" / "Not posted" / "Reviewed"; the bill itself says "Ready to add stock", "Needs corrections", "Invoice posted"; Today calls the same queue "Purchase invoices to review".

---

### STORY-087: Mark a supplier bill paid from the register — and undo a wrong entry

**Type**: short
**Topic**: Purchases, suppliers & payables
**Persona**: Venkat Rao, clinic admin, has just sent ₹12,480 by NEFT to Medline Agencies
**Goal**: Record that bill MA/2611 is fully paid
**Preconditions**: ADMIN with ledger write (`creditWrite`). Bill MA/2611 is posted ("Stock added") and shows "Due" or "Overdue". No supplier credit held for Medline.
**Ideal path**: 3 — click `Mark paid`, confirm mode/reference, record.
**Alternate paths**:
- `Payments & dues` › "Bulk Payment Allocation" (STORY-090) — the only place for a part payment or one payment across several bills.
- Set off a credit instead of paying: `Mark paid` dialog's credit banner, Returns tab `Set off`, the distributor strip `Set off all ₹…`, `Credits & vouchers` › `Set off against bills`, the bill's `Eligible supplier credits` (STORY-089).
- Undo: 30-second `Undo` in the Payment cell or in the toast; later, `Payments & dues` › "Recorded payments" › `Reverse payment` (reason required).

#### Steps
1. In `Purchase bills` (STORY-086 step 1–2) find MA/2611 and click `Mark paid` in its Payment cell → a small dialog anchored to the row: title "Pay ₹12,480.00 to Medline Agencies", description "For bill MA/2611".
2. "Mode" is preselected (`NEFT / RTGS` by default, or whatever he used last — remembered in the browser); "Date" shows today as text `13/11/2026`. He leaves both.
3. Type the UTR in "Cheque / UTR no. (optional)".
4. Click `Record payment ₹12,480.00` → dialog closes; the row's badge turns green "Paid" and an `Undo` link sits beside it for 30 seconds; focus moves to the next payable row's `Mark paid`.
5. He realises he opened the wrong MA bill → click `Undo` in the Payment cell within 30 seconds → toast "Payment undone — Bill MA/2611: Due ₹12,480.00." and `Mark paid` is back.

#### Variations
- **Paid by cheque yesterday**: change Mode to `Cheque`, overtype Date `12/11/2026` (free text, dd/mm/yyyy; not a date picker).
- **Row filtered away after paying** (e.g. Payment status `Overdue`): the row disappears, so a toast "Payment recorded — ₹12,480.00 to Medline Agencies for bill MA/2611." carries the `Undo` action instead.
- **Distributor has credit that covers the bill**: title becomes "Settle bill MA/2611 · ₹12,480.00" with a blue box "₹15,000.00 credit from Medline Agencies covers this bill. Set it off, or record a payment below." and a primary `Set off ₹12,480.00 credit`; `Record payment …` drops to an outline button.
- **Credit smaller than the bill**: blue line "₹3,000.00 credit from Medline Agencies is available." with link `Set off ₹3,000.00 instead` → hands over to the "Set off credit from …" dialog.

#### Edge Cases
- **Part payment is impossible here**: the amount is fixed to the bill's payable; there is no amount field. A cheque for less than the bill must go through `Payments & dues`.
- **Date validation**: "Enter the payment date as dd/mm/yyyy.", "The payment date cannot be after today, …", "… cannot be before the bill date, …".
- **Someone else paid it meanwhile**: toast "This payment was already recorded — The list now shows the bill’s latest balance." or "This bill’s balance changed — Check the new amount before recording a payment."
- **Undo window missed**: no undo in the register; failure copy points to "You can reverse it from Payments & dues."
- **Not-posted bill**: grey badge "Not posted" (tooltip "{status} · Post stock before paying"), no `Mark paid`.
- **Scheduled payment**: badge "Scheduled {date}" with "was due …"; `Mark paid` hidden when the whole balance is scheduled.
- **RECEPTION**: can enter bills but sees no `Mark paid` (role not in the ledger-writer list).
- **Naming**: button `Mark paid`, dialog "Pay …" or "Settle bill …", submit `Record payment`, ledger "Bulk Payment Allocation" / `Record Payment`, discovery doc calls it "Settle bill".

---

### STORY-088: Discover a mistake after posting and correct it with a linked return

**Type**: medium
**Topic**: Purchases, suppliers & payables
**Persona**: Sravani Kolla, pharmacist, doing the Saturday shelf check — bill SVP/26-27/4183 was posted with 20 tubes of Benzac AC but only 10 arrived
**Goal**: Make stock and the payable match what was actually received
**Preconditions**: PHARMACIST with purchase edit and supplier-return write. The bill is "Stock added". Nothing from that batch has been sold.
**Ideal path**: 4 — open the bill, change the wrong line's quantity with a reason, confirm, done (system posts the stock and payable difference itself).
**Alternate paths**:
- The posted bill's own header text says "Stock added. To fix a saved quantity, price or product detail, open the batch below." → batch link → item page → `Edit stock` / `Edit price` (doctor approval queue; changes stock but not the supplier payable).
- "Invoice history and documents" › `Correct posted purchase` › `Start linked return` (used here), or directly `Return to supplier` in the same button row (same destination).
- Price-only error: `Correct posted purchase` › link `Record linked supplier credit` (a Credit note document).
- Stock › `Corrections` / "Post linked correction" on the item page; Stock counts approve-and-adjust; `Loss & breakage` — all change stock without touching the payable.
- For a *draft* (not posted) bill: `Edit draft` / `Review issues`, or `Reject invoice`.

#### Steps
1. `Inventory` → `Purchases` → `Purchase bills`; search `4183`; click the bill number → workbench, heading "Stock added", status pill "Stock added", every field read-only.
2. Read the line under the heading: "Stock added. To fix a saved quantity, price or product detail, open the batch below." *(She starts toward the batch link, then remembers the supplier bill would still claim 20 tubes.)*
3. Scroll to the bottom and open the collapsed "Invoice history and documents" → section "Purchase documents & history — The receipt is posted. Keep corrections linked to its original stock and supplier history."
4. Click `Correct posted purchase` → an explanatory panel "Correct this posted purchase — Create a linked supplier return with a reason for affected quantities. Finalise its credit, then enter the corrected replacement bill. For a price-only supplier credit, use a linked credit note. …"
5. Click `Start linked return` → **full page reload** to `?area=purchases&view=SUPPLIER_RETURN&new=purchase-{id}-return&purchaseInvoiceId={id}` → a "Supplier returns" document, Supplier preselected, Note "Return against SVP/26-27/4183", and **all six bill lines prefilled at their full billed quantities**.
6. Remove the five lines that are fine (trash icon "Remove line N" × 5).
7. On the Benzac line change Quantity 20 → 10 (the ten that never arrived).
8. Choose "Reason for return" — options are `Expired`, `Near expiry`, `Breakage`, `Wrong item supplied`, `Excess supply`, `Other`; none means "billed but not delivered". She picks `Other` and types "Short supply – 10 billed extra" in "Note (optional)".
9. Leave "Return price basis" on `Purchase rate per stock unit`; check the footer "Taxable ₹… + GST ₹… Total ₹1,321.60".
10. Click `Create return challan` → heading "Return challan saved"; outcome text "Stock has already been sent back to the supplier on this return challan." and "When the distributor’s credit note arrives, choose Record credit note …". Ten tubes are now deducted from the batch.
11. Click the back arrow ("Back to supplier returns") → lands on a plain "Supplier returns" list (the generic workflow register, heading + `New document` + Status filter) — **not** on Purchase bills › Returns, and not on the bill she came from.
12. Navigate `Purchase bills` → tab `Returns` → the return shows "Credit note awaited · today"; when Sri Venkateshwara sends the credit note she continues as STORY-089 step 9.

#### Variations
- **Price was wrong, quantity right**: step 5 uses `Record linked supplier credit` → a "Credit notes" document prefilled with one line "Price adjustment credit" (qty 1, rate 0); enter "Credit note no.", "Credit note date", the amount as the line rate, then `Post supplier credit`.
- **Only the shelf location is wrong**: `Set location & discount` → "Shelf / location", "Suggested future sale discount (%)", "Reason for change" → `Save location & discount` (no stock or payable change).
- **Need the paper trail**: `Logs` (raw before/after JSON per event), `Return history (n)`, exports `PDF` / `Excel` / `Purchase CSV` / `Print QR`, `Add supporting original`.
- **Bill still a draft or "Reviewed"**: `Edit draft`, or `Reopen review and fix products` with "Reason to reopen review".

#### Edge Cases
- **Two contradictory instructions on one screen**: the header says "open the batch below" (stock-only edit via approval), the history panel says "create a linked supplier return … then enter the corrected replacement bill".
- **"Enter the corrected replacement bill"** has no button; re-entering the same supplier + invoice number is expected to trip the duplicate check ("Existing invoice …" / `Open existing invoice`) *(inferred — verify in a walk)*.
- **The mental model is wrong for a data-entry error**: goods that never arrived are "returned" on a challan, and the screen states "Stock has already been sent back to the supplier".
- **Units already sold**: return quantity cannot exceed remaining eligible units; the document shows a "Recovery steps" box and `Inspect batch balance and holds`.
- **Wrong challan**: `Cancel document` (while in challan state) or, for approvers, `Correct by reversal` → "Reversal reason" → `Reverse posted effects`.
- **Navigation loss**: `Start linked return` uses `window.location.assign`, so the return document has no route back to the bill; the "View linked …" link at the top of the document is the only way back.
- **A third returns list**: the "Supplier returns" workflow register reached in step 11 has no menu entry and duplicates Purchase bills › Returns with different columns and filters.

---

### STORY-089: Return expired stock, record the distributor's credit note and set it off against a bill

**Type**: medium
**Topic**: Purchases, suppliers & payables
**Persona**: Imran Sheikh, pharmacist — month-end expiry clear-out; later the same week the credit note arrives by WhatsApp
**Goal**: Send 8 expired tubes back to Medline Agencies, record credit note CN/MA/0412 for ₹1,416 and use it against the oldest Medline bill
**Preconditions**: PHARMACIST with supplier-return write and ledger write. Batch "Kojivit Gel 15g · KV2101" has 8 units, expired. Medline has two posted unpaid bills.
**Ideal path**: 7 — new return, pick supplier, pick batch + qty + reason, create challan; later: open the awaited return, enter note number/date/amount, confirm set-off.
**Alternate paths**:
- Start a return: Purchase bills › Returns › `New return` (used here); a posted bill's `Return to supplier` / `Start linked return`; Stock › `Stock optimization` › `Create return draft` (per distributor, returnable batches); item page button `Supplier returns`; the hidden "Supplier returns" workflow list › `New document`; Stock area link "Supplier returns are now in Purchase bills › Returns".
- Record the credit note: Returns row link `Record credit note` (used here); `Record credit note` button inside the return document; Today › "Credit notes awaited"; `Credits & vouchers` › `Record credit note` (creates a *standalone* Credit note document — a different record type that also appears in the Returns tab).
- Set off: toast action `Set off ₹… now` (used here); Returns row `Set off`; distributor strip `Set off all ₹…` (Purchase or Returns tab with a distributor filter); `Mark paid` dialog credit banner; `Credits & vouchers` › `Set off against bills`; the same panel inside `Payments & dues` and inside a bill's `Eligible supplier credits`; the green notice button in the return document.

#### Steps
1. `Inventory` → `Purchases` → `Purchase bills` → tab `Returns` → the action button changes to `New return`.
2. Click `New return` → a "Supplier returns" document, heading "Unsaved draft", help text "Save a draft and send the goods back on a challan. When the distributor's credit note arrives, record it here or from Purchase bills › Returns."
3. Choose Supplier "Medline Agencies · 36AAGFM7719Q1ZP".
4. Set "Reason for return" → `Expired`.
5. Type `Kojivit` in "Add a batch" ("Search product, batch, barcode or SKU") → pick "Kojivit Gel 15g · KV2101 · expires … — 8 Tube available · ₹…".
6. Set Quantity `8` on the line; check "Total ₹1,416.00".
7. Click `Create return challan` → heading "Return challan saved"; stock leaves the batch. Hand the tubes to the Medline delivery boy.
8. *(Four days later.)* `Inventory` → Today → click the row "Credit notes awaited — 1" → Purchase bills › Returns filtered to Status `Awaited`; the row shows amber "Credit note awaited · 4d" and, in the first column, a link `Record credit note` above the return reference.
9. Click `Record credit note` → dialog "Record credit note from Medline Agencies — For return SR-… ".
10. Type "Credit note no." `CN/MA/0412` (forced upper-case) and "Credit note date" `11/11/2026` (free text dd/mm/yyyy).
11. Click `Same as return value` to fill "Amount (₹)" with 1416 → click `Record credit note` → toast "Credit note CN/MA/0412 recorded: ₹1,416.00 from Medline Agencies. — Set it off against the distributor’s bills now, or later from this list." with action `Set off ₹1,416.00 now`; the row badge becomes blue "Received · ₹1,416.00 left" with a `Set off` button.
12. Click `Set off ₹1,416.00 now` → dialog "Set off credit from Medline Agencies — ₹1,416.00 available from credit note CN/MA/0412. Filled from the oldest due date." A table Bill · Due date · To pay · "Set off ₹" lists both open bills with the oldest prefilled; "₹0.00 credit left after this".
13. Click `Set off ₹1,416.00` → toast "Set off ₹1,416.00 against bill MA/2611. — Undo is in the Status column for 30 seconds."; the row becomes green "Fully used".
14. Switch to tab `Purchase` → MA/2611 now shows "₹11,064.00 due" with the note "₹1,416.00 paid".

#### Variations
- **Distributor credits less than the return** (deducts handling): type 1,300 → amber note "₹116.00 less than your return value. Fine if the distributor’s note says so." → `Record credit note` still works.
- **Amount more than the return by over ₹1**: first click only raises the warning "… more than your return value of … Check the amount on the distributor’s note."; the button relabels to `Record ₹1,500.00 anyway` and needs a second click.
- **Typed the note number wrong**: pencil icon beside the number ("Correct the number, date or amount") → "Correct credit note CN/MA/0412" with mandatory "Why correct it?" → `Save correction`. If part is already set off the amount is locked ("… so its amount stays ₹…").
- **Split across bills**: in step 12 edit the "Set off ₹" boxes per bill; `Set off ₹…` enables only when total > 0 and ≤ credit.
- **Not ready to dispatch**: `Save draft` instead of `Create return challan` ("Draft • no stock change"); the Returns row shows "Draft" with `Open draft`.
- **Return of blocked stock**: choose the hold in "Stock source" instead of "Available stock (no hold)".
- **Returns register filters**: Search by `Credit note no` / `Return ref` / `Distributor`; Status `Awaited`, `Received`, `Adjusted`, `Fully used`, `Draft`, `Cancelled`; More filters Distributor, Type (`Returns only` / `Credit notes only`), Reason, Entry by. Footer "Credit held (all dates) ₹… · Awaited ₹… (n returns)".

#### Edge Cases
- **Duplicate credit note number**: inline error on "Credit note no." (server code `CREDIT_NOTE_DUPLICATE`).
- **Date rules**: "The credit note date cannot be before the return date, …" / "… cannot be after today, …".
- **Return changed elsewhere**: destructive toast "This return changed — The list now shows its latest status. Your entry was not saved: credit note …".
- **No open bills**: set-off dialog says "No posted bill from Medline Agencies has anything left to pay. The credit stays available for the next bill."
- **Undo after 30 s**: Returns register has no later undo; go to `Credits & vouchers` (or the same panel in `Payments & dues`) › `Reverse allocation`, which asks for the reason in a native browser `prompt()`.
- **Vocabulary for one act**: "Set off", "Set off against bills", "Set off all", "allocated" / `Reverse allocation`, "Adjusted" / "Fully used", "applied"; the operator guide calls the button "Allocate to bill". Return states are "Draft • no stock change", "Challan • stock returned", "Return challan saved", "Credit note awaited".
- **Same credit shown in four places**: Returns register row, `Credits & vouchers`, the credits panel inside `Payments & dues`, and `Eligible supplier credits` inside each bill.

---

### STORY-090: Month-end — one cheque across three bills, a part payment, and reversing a wrong entry

**Type**: medium
**Topic**: Purchases, suppliers & payables
**Persona**: Venkat Rao, clinic admin, last working day of the month with the cheque book open
**Goal**: Record cheque 004512 for ₹40,000 to Sri Venkateshwara Pharma Distributors against three bills (two in full, one in part) and fix a payment he mis-recorded last week
**Preconditions**: ADMIN with ledger read + write. The distributor has three posted unpaid bills (₹18,642, ₹14,358, ₹12,000). A ₹9,500 UPI payment was recorded last week against the wrong bill.
**Ideal path**: 5 — open the supplier account, enter cheque details once, tick the bills (auto-fill oldest first), record; for the fix: open the payment, move it, give a reason.
**Alternate paths**:
- Reach the ledger: `More tasks…` › `Payments & dues`; Purchase bills `More` ▾ › `Payments & dues`; the register footer link "Outstanding in these N bills ₹…"; Today row "Overdue supplier bills" or button `Check overdue supplier balances`; Suppliers › `Account & dues`.
- Pay single bills in full with `Mark paid` × 2 from the register (STORY-087) — but the part payment still needs this screen.
- Reverse: register `Undo` (30 s only); here `Reverse payment` / `Reallocate payment`.

#### Steps
1. `Inventory` → `Purchases` → `More tasks…` select → `Payments & dues` → page titled "Purchase Ledger" (not "Payments & dues"). Tiles "Outstanding" (with "Net of credit held …"), "Overdue", "Due Soon", "TCS Watch"; tables "Distributor Summary", "Aging", "Alerts".
2. Click the "Sri Venkateshwara Pharma Distributors" row in "Distributor Summary" → the lower sections ("Supplier credits & vouchers", "Recorded payments", "Bulk Payment Allocation") reload for that distributor. *(Nothing scrolls or highlights; he has to scroll down to see the effect.)*
3. Scroll to "Bulk Payment Allocation"; confirm the "Distributor" select shows the right name.
4. Set "Payment Date" (native date picker), "Mode" → `CHEQUE` (raw upper-case codes here; the register dialog says "Cheque").
5. Type "Reference No" `004512` and an optional note.
6. In the invoice table click `Max` on the ₹18,642 bill and `Max` on the ₹14,358 bill → "Allocate" boxes fill and the "Amount" field is overwritten with their sum, 33000.
7. Type `7000` in the "Allocate" box of the ₹12,000 bill → the footer reads "Allocated total Rs 40,000.00 / Payment amount Rs 33,000.00" and `Record Payment` is disabled.
8. Correct "Amount" to `40000` → totals match; `Record Payment` enables.
9. Click `Record Payment` → alert "Saved — Payment recorded and allocated."; tiles and tables refresh.
10. Scroll up to "Recorded payments" → find "₹9,500.00 · UPI · 05 Nov 2026" *(date format unverified)* → click `Reallocate payment`.
11. In the "Reallocate ₹9,500.00" panel move the amount from the wrong bill's box to the right one so "Allocated ₹9,500.00 of ₹9,500.00"; type "Reason for correction"; click `Confirm reallocation` → "Payment reallocated. The original and replacement remain in the history."

#### Variations
- **Amount first**: typing `40000` in "Amount" and then pressing `Max` on any bill replaces 40000 with the allocation sum — he must re-type it.
- **Wrong amount recorded**: `Reverse payment` → "This reopens the allocated invoice balances and keeps an audit history. It does not refund or transfer money." + reason → `Confirm reversal`, then record the correct amount afresh ("To correct the amount, reverse this payment and record the correct amount.").
- **Came from the register with a distributor filter**: `More` ▾ › `Payments & dues` carries the GSTIN, so step 2 is skipped.
- **Use a credit as part of the settlement**: "Supplier credits & vouchers" in the middle of this page › `Set off against bills`.

#### Edge Cases
- **No ledger permission**: the `Payments & dues` task is hidden; a direct link shows "Supplier payments require purchase-ledger permission."
- **Read-only ledger user**: `Record Payment` stays disabled with no explanation; no `Reallocate` / `Reverse` buttons.
- **Alerts are counts only**: "Due in 7 days", "Due today", "Overdue", "TCS approaching" cannot be clicked to list the bills behind them.
- **Money and date formats differ from the register**: "Rs 18,642.00" here vs "₹18,642.00" there; native date inputs here vs typed dd/mm/yyyy in the register dialogs; mode codes vs mode labels.
- **Payment changed in another tab**: "This payment changed. Review its current details before correcting it."
- **Naming**: task `Payments & dues` → heading "Purchase Ledger" → section "Bulk Payment Allocation" → button `Record Payment`; bills are "Invoices" on this page and "Bills" in the register.

---

### STORY-091: Add a new distributor and record the terms the rep agreed

**Type**: medium
**Topic**: Purchases, suppliers & payables
**Persona**: Dr. Lakshmi Reddy, dermatologist and clinic owner, just after a meeting with the rep from Deccan Derma Distributors
**Goal**: Save the distributor and record "15% discount, 10+1 scheme, minimum 18 months expiry" for two sunscreens so the pharmacist sees it when the first bill arrives
**Preconditions**: DOCTOR (passes server gates; terms are editable by doctor/admin/owner only). The two products exist in the catalogue. Distributor not yet saved.
**Ideal path**: 6 — add supplier (name + GSTIN), open its terms, pick two products, type the terms once for both, save.
**Alternate paths**:
- Create the supplier: Purchases › `Suppliers` › `Add supplier` (used here); Purchase bills `More` ▾ › `Suppliers`; inline in the bill workbench via `Save verified supplier` (name + GSTIN only) — no supplier can be created from inside the Terms wizard ("No distributor matches. Add distributors under Suppliers.").
- See the terms: `Terms of Trade` task; the blue "Agreed terms with …" panel and per-line "Agreed: … / Invoice: …" hints in the bill workbench.

#### Steps
1. `Inventory` → `Purchases` → `More tasks…` → `Suppliers` → list "Suppliers" with `Add supplier`.
2. Click `Add supplier` → an inline form opens above the list.
3. Fill "Supplier name" `Deccan Derma Distributors`, "GSTIN" `36AAICD5530K1Z2` (both required), "Drug licence", "Contact person" `Ramesh`, "Phone" `9848012345`, "Payment terms" `30 days` (free text); "Active supplier" stays ticked.
4. Click `Save supplier` → form closes; the row shows "36AAICD5530K1Z2 · 9848012345 · Active" with `Bills`, `Account & dues` and a pencil.
5. There is no "Terms" action on the supplier row. Open `More tasks…` → `Terms of Trade` → heading "Terms of Trade — What each distributor agreed per product, so whoever receives a delivery can check it."
6. Click `Add terms` → wizard "Add terms", step chips "1. Distributor  2. Items  3. Scheme  4. Review".
7. Type `Deccan` in "Find distributor" → click the result "Deccan Derma Distributors — 36AAICD5530K1Z2 · 0 products with terms" → `Next`.
8. In "Find product" type `Photostable` → `Add`; type `Sunstop` → `Add` → "Selected products (2)" → `Next`.
9. In the dashed box "Same terms for every selected product" type Discount % `15`, Scheme: buy `10`, Scheme: get free `1`, Min expiry (months) `18`, Note `Agreed with Ramesh, Nov 2026` → click `Apply to all selected` → both product boxes fill.
10. Click `Next` → "Review" lists each product with its summary and the note "These terms will appear when an invoice from Deccan Derma Distributors is entered. Saving a product that already has terms replaces them."
11. Click `Save terms` → the "Agreed terms" table for the distributor: Product · Discount · Scheme · Min expiry · Margin · PTR · Note · Entered ("by Dr. Lakshmi Reddy on …"), each product with `Edit` and `Delete`.

#### Variations
- **Product not in the catalogue yet**: `Add “Sunstop Aqua Gel” as typed` → saved as "Not linked to a catalogue product" (matched by name later).
- **Edit one term**: `Edit` → the wizard opens directly on the Scheme step titled "Edit terms for {product}" → `Save terms`.
- **Delete**: `Delete` → inline `Confirm delete` / `Keep`.
- **Pharmacist view**: same page, banner "Read-only. Doctors and admins can change terms."; no `Add terms`, `Edit`, `Delete`.
- **Fix supplier details later**: pencil on the supplier row → same inline form → `Save supplier`.

#### Edge Cases
- **GSTIN is mandatory** in the supplier form — an unregistered local supplier cannot be saved.
- **Invalid term value**: "Check {field}." under the product box; `Next` / `Save terms` disabled.
- **Supplier vs Distributor in one flow**: task "Suppliers", button `Add supplier`, then "Find distributor", "Distributor: …", "No distributor matches. Add distributors under Suppliers."
- **Supplier "Payment terms" vs Terms of Trade**: two unrelated things with near-identical names; the supplier's "Payment terms" text is not shown in Terms of Trade, and neither visibly drives a bill's Due Date.
- **Terms are advisory**: a bill that violates them (STORY-084 step 25) is only hinted, never blocked or listed anywhere for follow-up.
- **No suppliers yet**: "No suppliers yet. Add a supplier to start recording purchases." / without permission "Ask an administrator to add a supplier."

---

### STORY-092: Check whether a distributor has quietly cut the discount

**Type**: short
**Topic**: Purchases, suppliers & payables
**Persona**: Dr. Lakshmi Reddy, owner, Sunday evening review
**Goal**: See purchase value by distributor for the last quarter and any products whose discount dropped
**Preconditions**: DOCTOR/OWNER. At least a few bills reviewed/posted in the last 90 days.
**Ideal path**: 3 — open purchase analytics, pick the distributor from a list, read the alerts.
**Alternate paths**:
- Pharmacy Report › `Purchase Register` / `Purchase Bills` / `Item Wise Margin Report` (GST and margin views of the same bills; different page, different filters).
- `Payments & dues` › "Distributor Summary" (money owed, not cost trends).
- Per-bill "Indicative margin at MRP" in the workbench; per-line "Agreed vs Invoice" hints.
- Old links `?area=purchases&view=reports|daywise|margin` redirect out to Pharmacy Report ("This report is now under Pharmacy Report. Opening it…").

#### Steps
1. `Inventory` → `Purchases` → `More tasks…` → `Purchase costs` → page titled "Distributor Analytics — Reviewed purchase invoices only. Drafts with OCR or reconciliation issues are excluded." It loads the last 90 days.
2. Read the tiles "Purchase Value", "Taxable", "Free Stock", "Effective Cost" and the "Distributor Ranking" table (Distributor · Invoices · Value · Free Qty · Avg Discount · Last Invoice).
3. To narrow to one distributor she needs its GSTIN: copy `36AAKFS4821M1Z6` from the ranking row, paste it into the "GSTIN" filter, and click `Refresh` (filters do nothing until `Refresh`).
4. Scroll to "Discount Drop Alerts" → rows Product · Distributor · Previous · Latest · Drop · Invoices; e.g. "Photostable Gold SPF 55 Gel — 12% → 8%".

#### Variations
- **One product across distributors**: type in "Product" → `Refresh` → "Product Effective Cost" (Qty · Effective Cost · Latest Rate · Discount).
- **Stricter alert threshold**: "Drop %" (default 5) → `Refresh`.
- **Start over**: `Reset` restores the default filter values but does not reload until `Refresh`.

#### Edge Cases
- **No data**: "No reviewed purchase data found", "No product analytics available", "No discount-drop alerts".
- **Mixed pack units**: "Effective Cost" tile shows "Mixed units — compare products".
- **Dead ends**: rows are not links — no way to open the bills behind an alert or jump to the distributor's terms/account.
- **Naming**: task `Purchase costs` opens "Distributor Analytics"; the page says "invoices" and "Distributor" while the task list says "Purchase bills" and "Suppliers".

---

### STORY-093: Bring in an e-mailed bill through Gmail (or a CSV) and review it

**Type**: medium
**Topic**: Purchases, suppliers & payables
**Persona**: Kavya, receptionist who also handles purchase entry on weekday mornings — Medline e-mails its invoices as PDFs
**Goal**: Pull this week's Medline invoice PDF from the clinic Gmail into a review draft without downloading and re-uploading it
**Preconditions**: RECEPTION with purchase create permission. Gmail integration configured on the server (`GMAIL_*`); not yet connected for the clinic account.
**Ideal path**: 4 — open Gmail intake, see new invoice e-mails already listed, click the attachment, land in the review draft.
**Alternate paths**:
- Download the PDF and use `Scan or enter bill` (STORY-084).
- `Import CSV` when the distributor sends a spreadsheet (see Variations).
- All three converge on the same workbench review and the same `Confirm reviewed values & add stock`.

#### Steps
1. `Inventory` → `Purchases` → `More tasks…` → `Gmail intake` → heading "Invoice attachments from Gmail — Choose an invoice attachment to open a review draft."; "Checking Gmail connection…".
2. Click `Connect Gmail` → browser leaves for Google's consent screen; she signs in as the clinic account and approves.
3. Google redirects back to the Gmail intake screen → "Connected: **linaeclinic@gmail.com** — Last attachment search: Not searched yet · current account and search query", with `Disconnect Gmail`.
4. The search box is prefilled with Gmail syntax `newer_than:30d` (placeholder "from:supplier@example.com newer_than:30d"). She edits it to `from:accounts@medlineagencies.in newer_than:7d` *(hesitates: this is raw Gmail query syntax)*.
5. Click `Find invoice attachments` → list of messages (subject, sender, date) each with buttons `Review {file name}`.
6. Click `Review MA-2648.pdf` → the app switches to `Scan or enter bill` with the notice "Imported draft ready for review. The original is saved; stock has not changed." and the PDF in the "Original invoice" viewer.
7. Review as in STORY-084 steps 6–27 (supplier, flagged fields, product matches, totals).
8. Kavya has no stock permission, so the primary button reads `Confirm reviewed values & mark reviewed` → click → "Review saved. Stock not added. An authorized colleague can add stock from this reviewed invoice."
9. The pharmacist later opens the bill from Purchase bills (Payment status `Not posted`, Bill status `Reviewed`) and clicks `Add stock`.

#### Variations
- **CSV instead**: task strip `Import CSV` → "Import purchase CSV — Review imported lines before adding stock." → download icon "Download purchase CSV template" (31 columns, one row per item with the bill header repeated) → choose file in "Purchase invoice CSV" → `Open review draft` ("Reading CSV…") → same workbench. "CSV format and required columns" explains the layout.
- **Already imported**: both routes open the existing bill directly when the server reports a duplicate.
- **More mail**: `Load more messages`.
- **Stop access**: `Disconnect Gmail` (no confirmation).

#### Edge Cases
- **Gmail not configured**: "Gmail is not configured. Ask your administrator to connect it. Photo/PDF and CSV intake are available." plus an "Administrator setup" disclosure that lists server environment variable names to an end user.
- **Connection check fails**: red error + `Retry connection check`.
- **No matches**: "No invoice attachments match this search."
- **Imported draft lives in page memory**: it is handed to the workbench through React state, so a browser refresh between step 6 and the first `Save draft` drops the extracted values (the original file is retained and reappears under "Saved uploads") *(inferred from `InventoryWorkspace` `importedDraft` state)*.
- **Label drift across the three intake screens**: `Scan bill` vs `Open review draft` vs `Review {file}`; "Import CSV" (task) vs "Import purchase CSV" (heading) vs "CSV import" (register Source filter); "Gmail intake" (task) vs "Invoice attachments from Gmail" (heading) vs "Gmail" (Source).

---

### Stock control, counts & reorder

Source: `topics/inventory-stock-reorder.md`

### STORY-094: Check whether a medicine is in stock and read its batches

**Type**: short
**Topic**: Stock control, counts & reorder
**Persona**: Kavya Reddy, pharmacist, a patient is waiting at the counter and the doctor has just asked "do we still have Isotroin 20?"
**Goal**: See how many strips of Isotroin 20 mg are available, in which batches, and where they are shelved.
**Preconditions**: Signed in as PHARMACIST; at least two batches of the item exist.
**Ideal path**: 2 — type the name into one always-visible search and read the answer (quantity, batch, shelf) in the result row.
**Alternate paths**:
- Sidebar `Inventory` → area button `Stock` (Stock list is the default task) instead of Today's `Find or correct stock`.
- Scan the pack barcode into `Search stock` (placeholder "Type a product name or scan a barcode").
- `Stock ledger` → search → click the product name in any movement → item page (`InventoryLedger.tsx` `onItem`).
- Deep links that open the item page directly: Pharmacy Report › Item Wise Margin (`ItemMarginReport.tsx`), a posted purchase line in the purchase workbench (`PurchaseInvoiceWorkbench.tsx`), the "Batch recovery reference" link printed on the item page itself.
- Pharmacy Desk quick action `Inventory Control` and the counter cockpit's `Inventory control` — both push `/dashboard/inventory?tab=pharmacy-control…`, which the workspace does not read, so they land on **Today** (one more click needed).
- The header global search does **not** search stock (patients / appointments / staff only, per `discovery.md`).
- Stock also appears, read-only, in the prescription builder's medicine search and the counter's "Pick Assist" (other topics).

#### Steps
1. Click `Inventory` in the sidebar → `/dashboard/inventory`; "Loading inventory permissions…" then the **Today** area: buttons `Scan or enter bill` and `Find or correct stock`, a "Data quality" strip, and "What needs attention".
2. Click `Find or correct stock` → URL becomes `?area=stock&view=list`; heading "Stock"; every batch is listed (batch view defaults to `All batches`, including empty ones).
3. Type `isotroin` in "Search stock" and press Enter (or click `Search`) → URL gains `search=isotroin&page=1`; a chip "search: isotroin ×" appears under "Active filters"; `Sort` shows "Best match"; status line reads "2 matching batches".
4. Read the two rows: "Product / batch" (name, pack label, batch number), "Batch state" badge ("Current / on hand"), "Expiry", "Available" (`30 STRIPS`, with "5 set aside" beneath if anything is held), "Selling price", "Location" ("Rack A-3" or "Not assigned").
5. (Only if she needs cost, MRP or totals) click the product name → `&item=<id>`; item page header shows "Current stock 42 STRIPS · 5 held · 37 available" and the `Batches` tab lists every sibling batch with Qty, Expiry, MRP, PTR, totals.

#### Variations
- **Batch view**: `Current / on hand` hides empty batches; `Previous / depleted` shows only empty ones. Kavya may be thrown by depleted batches appearing first under the default `All batches`.
- **More columns**: tick "Show cost & stock details" to add Physical, Held, Stock unit, Purchase cost, MRP — the same numbers the item page shows again in its Batches tab.
- **Fuzzy / alias match**: a mistyped "isotrion" still matches, with "Similar spelling: …" under the name; an item renamed earlier shows "Matched earlier name: …".
- **Reception role**: same list, but no `Edit` column (`canSubmitEdits` is OWNER/ADMIN/DOCTOR/PHARMACIST only).
- **Phone**: areas wrap; the task strip becomes a `Task` select.

#### Edge Cases
- **Nothing found**: table row "No batches match these filters. Reset or change the search." (`Reset` clears every parameter except `area`/`view`).
- **Request fails**: red alert with the server message and an inline `Retry`; status line "Stock results unavailable".
- **Scanned QR label**: a search beginning `purchase:` opens that purchase bill in Purchases; one beginning `inventory-document:` opens the workflow document — the search box silently changes area.
- **Active-filter chips show raw parameter names** ("stock: LOW ×", "expiryMonths: 3 ×", "batchView: ALL ×") rather than the labels used in the selects.
- **Negative stock**: state badge "Negative stock — count needed" in red.

---

### STORY-095: Trace why a batch went down in the Stock ledger

**Type**: short
**Topic**: Stock control, counts & reorder
**Persona**: Dr. Anjali Rao, dermatologist and clinic owner (DOCTOR role), Friday evening review
**Goal**: Find out who took Momate cream out of stock this week and under which bill.
**Preconditions**: Stock movements exist in the last 7 days.
**Ideal path**: 3 — open the ledger, type the product, read the rows.
**Alternate paths**:
- Item page › `Ledger` tab (per-item ledger with its own From / To / Type filter, `Download CSV`, and a reconciliation banner "Ledger matches stock on hand" / "Ledger does not match").
- Item page › `Sales`, `Purchases`, `Purchase returns`, `Sales returns`, `Blocked stock` tabs — each is a slice of the same movement history.
- Today › "Recent activity" list (workflow documents only).
- Pharmacy Report registers (other topic).

#### Steps
1. Sidebar `Inventory` → area `Stock` → URL `?area=stock` (Stock list by default).
2. Click task `Stock ledger` → `?area=stock&view=ledger…`; "Loading stock ledger…" then movements for the last 30 days, newest first, grouped under sticky clinic-day headings ("12 Nov 2026 · 14 changes").
3. Click the `7 days` preset chip → `ledgerFrom` / `ledgerTo` are set and the chip shows pressed.
4. Type `momate` in "Search" (placeholder "Product, batch or reference"); after 300 ms the URL gains `ledgerSearch=momate`.
5. Click `Stock out` in the "Direction" group → `ledgerDirection=OUT`.
6. Read each row: signed change ("−2 tubes"), product name (link), "Batch MC2231", a coloured method badge ("Pharmacy bill", "Prescription dispensed", "Approved stock edit", "Stock count"…), the document ("Rx bill PH-2026-01184"), counterparty, time · actor, and balance "14 → 12".
7. (Optional) click the document link → for pharmacy bills the browser goes to `/dashboard/pharmacy/invoices?search=<bill no>`; for purchase bills and workflow documents it stays inside Inventory.

#### Variations
- **Method filter**: `Method` select lists 16 channels (Purchase invoice, Opening stock, Customer return, …, Manual entry).
- **Export**: `Export CSV` downloads only the rows of the current page (50) as `stock-ledger-<from>-to-<to>.csv`.
- **From the item**: clicking the product name opens the item page with a `return=` back-link, so "Back to stock list" returns to the ledger with its filters intact.

#### Edge Cases
- **Empty**: dashed box "No stock changes match these filters — Widen the date range or clear the method and direction filters."
- **Too many movements**: amber note "This range holds more than N movements. Only the newest are shown. Narrow the dates or search for a product to see the rest."
- **Failed read**: red box with the error, "Reading the ledger never changes stock." and `Try again`.
- **Same bill, two destinations**: the Stock ledger opens a pharmacy bill in the *Pharmacy Invoices list* (`/dashboard/pharmacy/invoices?search=`), the item-page ledger opens the same bill in the *Sales bill view* (`billHref({ bill })`).
- **Same concept, two vocabularies**: Stock ledger says "Method" / "Stock in · Stock out" / `Export CSV` / pager "Newer · Older"; the item ledger says "Type" (Sale, Purchase, Return, Adjustment) / "In · Out" / `Download CSV`.

---

### STORY-096: Pharmacist requests a new item and the doctor approves it

**Type**: medium
**Topic**: Stock control, counts & reorder
**Persona**: Sana Fatima, pharmacist, unpacking a sample order; then Dr. Anjali Rao (DOCTOR) between patients
**Goal**: Get "Venusia Max lotion 150 ml" into inventory so it can be prescribed and sold.
**Preconditions**: Sana is PHARMACIST (holds `inventory:item:create`, cannot approve). The item does not exist yet.
**Ideal path**: 6 — open the add form, enter name, price, batch + expiry + quantity on one screen, submit; approver opens the request and approves in one click.
**Alternate paths**:
- Reception can raise the same request (`@Roles(ADMIN, PHARMACIST, RECEPTION)` on `POST /inventory/items`).
- OWNER / ADMIN / DOCTOR using the same `Add batch` button create the item immediately — no "Sent to doctor" step.
- Post a purchase bill containing the product (Purchases › `Scan or enter bill` — creates the item implicitly; other topic).
- Stock › `More tasks…` › `Opening stock import` (Excel creates drugs and batches; STORY-104).
- Drug database `Add New Drug` and the prescription builder's `+ Add to Drug Database` create a *drug* without a stock batch (other topics; listed as lead A.12 in `discovery.md`).
- Reaching the approval queue: sidebar badge → Inventory → Stock → `Approve corrections (n)`; or the legacy URL `/dashboard/inventory-updates` (redirects to `?area=stock&view=approvals`).

#### Steps
1. Sana: sidebar `Inventory` → area `Stock`.
2. Type `venusia` in "Search stock", press Enter → "No batches match these filters. Reset or change the search." (she is checking for a duplicate first).
3. Click `Add batch` (top right) → dialog titled **"Add Inventory Item"** ("Add a new item to your inventory. Fields marked with * are required."). She pauses: the button said *batch*, the dialog says *item*.
4. Leave "Type *" as `Medicine`. In the "Name on prescriptions" box choose "Form *" = `Lotion`, type "Medicine name *" = `Venusia Max`; "Strength (optional)" stays empty. The line "Prints as …" updates live as she types *(exact printed casing not verified)*.
5. Fill "Manufacturer" = `Dr. Reddy's Laboratories`, "Category" = `Moisturiser`.
6. Scroll to "Pricing": "Cost Price (₹) *" = `285.00`, "Selling Price (₹) *" = `399.00`, "MRP (₹)" = `399.00`.
7. "Unit & Packaging": "Unit *" = `Bottles`, "Pack Size" = `150`, "Pack Unit" = `ml`.
8. "Stock Levels": "Min Stock" = `4`, "Reorder Level" = `6`.
9. "Additional Details": "Batch Number" = `VM2407`, "Expiry Date" = `30/06/2028`, "HSN Code" = `33049910`, "GST Rate (%)" = `18`, "Storage Location" = `Rack C-2`.
10. She looks for a quantity field for the 6 bottles in her hand — there is none (the form has ~40 fields, none for stock on hand). She decides to sort that out later.
11. Click `Add Item` → the dialog swaps to **"Sent to doctor for approval"** ("…The item will appear in inventory once approved."). If a similar name or a second pending request exists, an amber "Possible duplicate" box lists it.
12. Click `Close`.
13. Dr. Anjali: notices the red count badge on the sidebar `Inventory` entry, clicks it, then area `Stock`.
14. Click task `Approve corrections (1)` → two tabs `Price / stock` and `New items`; `New items` is pre-selected because a request is pending. Heading "New item requests", section "Waiting for review (1)".
15. Read the card: item name, a grid (Manufacturer, Type, Category, Unit, Pack size, Batch, Expiry, MRP, Cost price, Selling price, GST %, HSN, Min stock, Reorder level), "Requested by Sana Fatima · 13 Nov 2026, 11:42", and any "Possible duplicate. Check before approving." box.
16. Click `Approve` → dialog "Approve new item" ("Venusia Max lotion. The item is added to inventory immediately.").
17. Click `Approve` in the dialog → toast "Item approved and added to inventory"; the card moves to "History" as "Approved by Dr. Anjali Rao · …".

#### Variations
- **Reject**: `Reject` → dialog "Reject new item" with "Reason for rejection (required)"; the `Reject` button stays disabled until text is entered; toast "Item request rejected"; Sana sees the note under "My item requests" › History.
- **Requester's view**: for Sana the same task shows the `Price / stock` tab first and, under `New items`, the heading "My item requests" with "Waiting for a doctor (1)". Reception sees only "My item requests" (no tabs).
- **Non-medicine**: choosing Type `Supply` / `Consumable` / `Equipment` replaces the naming box with plain "Item Name *" and "Brand Name".
- **Naming validation**: a Tablet/Capsule/Syrup without strength is refused; focus jumps to the offending field with an inline error.

#### Edge Cases
- **The approved item has zero stock**: `createInventoryItem` sets `currentStock: 0`, so the new batch appears in the stock list as "Previous / depleted" (grey) — a brand-new item labelled as a used-up one. Sana must now do a *second* flow to enter the 6 bottles: `Edit stock` (another approval, STORY-098), a `Manual opening stock` document, a stock count, or a purchase bill.
- **Another approver got there first**: a 409 shows a red banner "<message>. The list below is up to date." and the dialog closes.
- **Server error on submit**: red box at the bottom of the long form; the form keeps its values.
- **Approver naming drift**: the dialog says "doctor", the price/stock queue says "doctor or admin", workflow documents say "manager", counts say "doctor or administrator".
- **MANAGER role**: can approve counts and purchase orders but does not get the `Approve corrections` task at all (`canSeeApprovals` excludes MANAGER).

---

### STORY-097: Correct a batch's expiry and shelf, then set a stock alert

**Type**: medium
**Topic**: Stock control, counts & reorder
**Persona**: Sana Fatima, pharmacist, tidying the "Data quality" gaps on a quiet afternoon
**Goal**: Fix a mis-keyed expiry and missing shelf on Tacroz Forte ointment, and set a minimum so it shows as low stock in time.
**Preconditions**: Batch `TF2291` exists with expiry 31/12/2025 (should be 2026), no location, no min/max. Sana holds `inventory:item:update`.
**Ideal path**: 5 — open the batch, change expiry + shelf + minimum in one form, give one reason, save once.
**Alternate paths**:
- Item page › `Batches` tab › row `Edit` (same editor, for any sibling batch).
- Stock list: tick rows → `Set location for N selected batches` → "Rack / shelf / bin" + "Reason" → `Apply reviewed location` (location only, bulk).
- Reorder › `More tasks…` › `Manual targets & exclusions` (min / max / reorder level for many items, with a review step and a reason).
- Reorder › `Target proposals` → `Accept selected` (system-proposed min / max; STORY-103).
- "Data quality" strip chips `Missing location` / `Missing min/max` (Today and Stock list) → filtered list (`gap=LOCATION|MIN_MAX`) → open item.
- Stock list `Filters` › "Missing information" select — a second, differently-keyed way (`missing=`) to list incomplete batches.
- Min/max can also be typed at creation ("Stock Levels" in "Add Inventory Item") and arrive via the opening-stock Excel.

#### Steps
1. Sidebar `Inventory` → area `Stock`; type `tacroz`, press Enter.
2. Click the product name → item page (`&item=<id>`). The "Item details" strip shows "Location Not set", "Min qty Not set", "Max qty Not set"; the header badge reads "Expired, on hand" in red because of the wrong year.
3. Click `Edit item` → an inline section appears *above* the tabs: "Editing batch TF2291", form "Correct saved details" ("Check the pack or original bill. These changes apply to this batch; the original bill stays in history.").
4. Change "Expiry date" from 31/12/2025 to 31/12/2026.
5. Type "Rack / shelf" = `Rack B-4`.
6. A "Check your changes" block appears with a "Not saved yet" badge and one line per field: saved value → new value.
7. Type "Why are you changing it?" = `Expiry mis-keyed at intake; checked the tube`.
8. Click `Save corrected details` → status "Corrected details saved. Stock quantity unchanged."; the header badge turns "Current / on hand".
9. Click `Set stock alert` → the *same* editor opens again, this time with "More details: tax, stock limits & codes" expanded and the cursor in "Minimum stock".
10. Type "Minimum stock" = `5` and "Reorder at" = `8`.
11. The reason field is empty again — type `Alert level set after November stock-out`.
12. Click `Save corrected details` → saved; the strip now shows "Min qty 5 TUBES".

#### Variations
- **One pass**: an experienced user opens `Edit item`, expands "More details…" herself and does steps 4–10 with a single reason and a single save (8 steps). `Set stock alert` is only a shortcut into the same form.
- **Suggested standard name**: for an old item without a form, the editor offers "Suggested from the recorded name: **<standard name>**" with `Use suggestion` (fills Form, Medicine name, Strength, Combination and Item code).
- **Availability**: inside "More details…" the "Availability" select (Active / Inactive / Discontinued) retires a batch without deleting it.
- **Delete instead**: `Batches` tab › `Delete` works only when the server marks the batch deletable; otherwise the button is disabled and the blocking reason is printed under it. Confirm dialog "Delete batch TF2291?" → `Delete batch`.

#### Edge Cases
- **Nothing changed or no reason**: `Save corrected details` stays disabled.
- **Leave mid-edit**: the draft is kept in `sessionStorage`; on return "Restored unsaved product details." or, if someone else saved meanwhile, "This product changed since your edits. Saving will require reloading the current record."
- **Quantity and selling price are deliberately absent** from this form (they go through `Edit stock` / `Edit price` and approval). Details save immediately; a one-unit quantity fix needs a doctor.
- **One concept, many names**: "Set stock alert" (button) = "Minimum stock" / "Reorder at" (editor) = "Min qty" / "Max qty" (item strip) = "Min Stock" / "Reorder Level" / "Reorder Qty" (add dialog) = "Minimum" / "Maximum" / "Reorder level" (manual targets) = "Missing min/max" (data-quality chip) = "targets" (Reorder).
- **"Location" drift**: "Location" (list column, strip) / "Rack / shelf" (editor) / "Rack / shelf / bin" (filter, bulk form) / "Storage Location" (add dialog) / "Shelf / location" (count dialog).

---

### STORY-098: Propose a stock-quantity edit and get it approved

**Type**: medium
**Topic**: Stock control, counts & reorder
**Persona**: Ravi Teja, pharmacist, restocking the counter display; then Dr. Anjali Rao approving
**Goal**: Make the system say 8 tubes of Acnestar gel instead of 10, because two were opened as testers.
**Preconditions**: Batch `AG0917` shows 10 TUBES, none held. Ravi is PHARMACIST.
**Ideal path**: 4 — click the quantity, type 8 and a reason, submit; approver approves from a notification.
**Alternate paths** (lead A.14 in `discovery.md`, confirmed in code):
- Item page action row `Edit stock` (same dialog).
- A stock count: stock list `Count selected batches`, item page `Count this batch`, or Stock counts › `Count an item` → sign-off → `Approve and adjust stock` (STORY-099/100).
- `Loss & breakage` document (`Post stock loss` — posts immediately, **no approval**).
- Item page › `Ledger` tab › row `Correct` → "Correct signed quantity" + "Reason" → `Post linked correction` (shown to approvers only; creates a `Corrections` document).
- For price: row `Edit price` / item page `Edit price` (same dialog with "New selling price (₹ per stock unit)").
- Approval queue entry points: Today row "Price/stock edits awaiting approval (n)"; Stock › `Approve corrections`; the notice link `Open approval queue`; legacy `/dashboard/inventory-updates`.

#### Steps
1. Ravi: sidebar `Inventory` → area `Stock`; search `acnestar`.
2. In the row's "Edit" column click `Edit stock` → dialog **"Edit stock"** ("Acnestar gel · Batch AG0917. The change takes effect after doctor or admin approval."), "Current stock on shelf: 10 TUBES".
3. The field "Counted physical stock (TUBES)" is pre-filled with 10; replace it with `8`. Hint: "Count this batch only. Include the 0 units set aside." A "Check your changes — Not saved yet" block shows "Stock (TUBES) 10 → 8".
4. Type "Why are you changing it?" = `Counted 8 on the shelf; 2 opened as testers` (placeholder "e.g. Counted 8 tubes on the shelf today").
5. Click `Submit for approval` → dialog closes; status banner "Submitted for doctor or admin approval." with a link `Open approval queue`. The row still shows 10.
6. (Optional) Ravi clicks `Open approval queue` → Stock › Approve corrections; he sees his request under "Price / stock approval queue" but no Approve/Reject buttons.
7. Dr. Anjali: sidebar `Inventory` → **Today** lists "Price/stock edits awaiting approval (1)" with a large "1" beside it (the count is printed twice in the row).
8. Click that row → `?area=stock&view=approvals`.
9. If a new-item request is also pending, the screen opens on the **`New items`** tab, not on the price/stock edits she clicked — she has to click the `Price / stock` tab.
10. Read the card: "Acnestar gel", "Batch: AG0917 · TUBES", "Batch physical stock: 10 → 8", "Reason: Counted 8 on the shelf; 2 opened as testers", "Ravi Teja · 13 Nov 2026, 16:05".
11. Click `Approve` → dialog "Approve inventory change" with an optional "Review note".
12. Click `Approve` → toast "Inventory change approved"; the queue reloads ("0 pending requests"); stock list and Pharmacy Desk figures refresh through window events.

#### Variations
- **Reject**: `Reject` → "Reject inventory change" ("Close this request without changing stock or price.") → `Reject`; a note is optional here (but mandatory when rejecting a *new item*).
- **Price edit**: same flow; preview shows "Selling price ₹180.00 → ₹195.00"; decimals allowed.
- **Why not just record a loss?** Ravi could post `Loss & breakage` for 2 tubes in one go with no approver — the two routes have opposite controls for the same shelf reality.

#### Edge Cases
- **Below held stock / decimals**: "Enter a whole number of at least N. Include stock set aside."; `Submit for approval` disabled. Unchanged value or blank reason also keeps it disabled.
- **Stale row**: the request carries `expectedUpdatedAt`; if the batch changed, the server refuses and the dialog shows the message while keeping the inputs.
- **Legacy rows**: old requests appear as "Legacy product-total edit" with "No reason recorded (legacy request)".
- **Three counters that do not agree**: the task label `Approve corrections (n)` and the sidebar badge count pending **new-item requests**; the Today row counts pending **price/stock edits**; the `New items` tab badge repeats the first number.
- **"Corrections" ≠ "Approve corrections"**: the former (in `More tasks…`) is a register of posted movement corrections with no `New document` button; the latter is this approval queue, internally "Inventory Updates".

---

### STORY-099: Run a stock-count cycle end to end (set up → count → sign off → approve → verify)

**Type**: long
**Topic**: Stock control, counts & reorder
**Persona**: Meera Nair, clinic administrator (ADMIN), setting up on a Friday; Ravi Teja, pharmacist, counting on Saturday morning before OPD; Dr. Anjali Rao approving at lunch
**Goal**: Have every batch physically counted once a month, with differences approved before stock is adjusted.
**Preconditions**: Stock reconciliation is off. ~410 batches in stock. Ravi and Sana have count permission (`pharmacy:compliance:audit`).
**Ideal path**: 13 — settings on one screen (toggle, two numbers, people, save = 5); open today's list (1); enter counts (1 pass, however many rows); sign off with a note (2); approver opens the count and approves with a prefilled reason (3); glance at the result (1).
**Alternate paths**:
- Opening today's list: Today row "Stock count due today"; Stock › `Stock counts` › `My counts` › `Start counting` / `Continue counting`; a link "Open Stock counts" from workflow documents, the purchase workbench and the compliance centre (`?area=stock&view=COUNT`).
- Approving: Today row "Counts awaiting your approval"; Stock counts › `Approvals` tab › `Review` (or click the row); `History` tab → open a count still "Awaiting approval"; `Next count` button on a record.
- Settings: Stock counts › `Settings` tab; the "Turn it on in Settings" link on My counts; Today row "Batches not counted this cycle" (opens `tab=settings`). Reorder › Automation settings only *points* here ("Stock count settings are in Stock › Stock counts › Settings.").
- Out-of-cycle counts: STORY-100.

#### Steps
**A. Meera turns the cycle on**
1. Sidebar `Inventory` → area `Stock` → task `Stock counts` → `?area=stock&view=COUNT`; tabs `My counts · Approvals · History · Settings`; text "Stock reconciliation is off, so no counts are assigned. Turn it on in Settings".
2. Click `Turn it on in Settings` (same as the `Settings` tab) → `tab=settings`.
3. Flip the switch → label changes to "Stock reconciliation is on".
4. "Cycle length (days)" → `30` (hint "Every batch in stock is counted once per cycle.").
5. "Items per person per day" → `15` (hint "Each person counts at most this many a day.").
6. Under "People who count" tick `Ravi Teja · Pharmacist` and `Sana Fatima · Pharmacist`.
7. Read the live forecast: "At 15 per person per day with 2 people, a 30-day cycle covers all 412 batches in stock." and "Saving starts a new cycle today."
8. Click `Save settings` → toast "Stock count settings saved — A new cycle starts today."

**B. Ravi counts**
9. Next morning: sidebar `Inventory` → Today shows "Stock count due today" with "15" and "Open your count and sign off when every batch is counted."
10. Click the row → the count sheet opens directly (`?area=stock&view=COUNT&document=<id>`): heading = the count reference, "Count what is on the shelf. Enter 0 when a batch is not there."; columns Item · Location · System · Counted · Difference · Note; the first "Counted" box has focus and is empty.
11. He notices the "System" quantity is printed next to each box (it is not a blind count) and resists copying it.
12. Type `12` for the first batch and press Enter → focus jumps to the next box; "Difference" shows a green "✓ Matches"; the sticky footer reads "1 of 15 counted · ✓ Saved" (autosave after 0.6 s, no save button).
13. Continue down the list with number + Enter (rows 2–6).
14. Row 7, Photostable Gold SPF 55 gel, System 6: he finds 5 → "Difference" shows "−1" and "−₹612.00" in red; a "Why it differs (optional)" box appears in the Note column.
15. Type the line note `Tester opened for patients`.
16. Row 9 is not on the shelf at all → type `0`.
17. Rows 10–15: number + Enter; he accidentally Enters past row 12 without typing.
18. Enter on the last box moves focus to `Sign off count`; he presses Enter → red prompt "Count every item before signing off. 1 item still to count."; row 12 is highlighted "Not counted yet" and focused.
19. Type the missing count.
20. Click `Sign off count` → dialog **"Sign off this count"**: "15 items, 2 differ · Short −7 (−₹2,412.00)"; a list "Batches that differ" with "System 6 · counted 5" etc.
21. Type "Why do these differ? (required)" = `Tester opened; Tugain batch TG118 not found on Rack B-2`.
22. Click `Sign off and send for approval` → toast "Count signed off and sent for approval. Stock changes only when a doctor or administrator approves it."; the sheet becomes a locked record: badge "Signed – awaiting approval", "Signed by **Ravi Teja** on 14 Nov 2026, 9:20 am", and "You signed this count, so someone else decides it. Ask Dr. Anjali Rao or Meera Nair."
23. Click `Back to stock counts` → My counts shows "Nothing to count right now".

**C. Dr. Anjali decides**
24. Sidebar `Inventory` → Today shows "Counts awaiting your approval" with "1" and "Short −₹2,412.00. Stock changes only when you approve."
25. Click the row → Stock counts opens on the `Approvals` tab (`tab=approvals`); one row: date, "Counted by", "Signed at", Items 15, Differences 2, "Short ₹", "Net ₹".
26. Click `Review` → the locked record opens with only the two differing batches listed; she clicks `Show all 15 batches` to see the rest.
27. Click `Approve and adjust stock` (sticky footer; beside it "Short −7 (−₹2,412.00)" and "Stock changes only when you approve.") → dialog **"Approve and adjust stock"** ("Each difference is applied to today's stock, so sales made since the count are kept."), per batch "6 now → **5**", "Stock value changes by −₹2,412.00", and "Reason (required)" pre-filled "Physical count signed by Ravi Teja on 14 Nov 2026".
28. Click `Approve and adjust stock` in the dialog → toast "Approved. Stock adjusted. 2 batches adjusted by the counted difference."; badge becomes "Approved"; "Approved by **Dr. Anjali Rao** on …".

**D. Verify**
29. Click task `Stock ledger`, set `Method` = "Stock count" → today's group shows "−1 … Photostable Gold … 6 → 5" and "−6 … Tugain … 6 → 0", each linked to the count reference.
30. Back in `Stock counts` › `History` → the count is listed with status "Approved"; footer "1 count · Approved −₹2,412.00 · Awaiting ₹0.00".

#### Variations
- **No differences**: the dialog's note becomes "Note (optional)", the button is just `Sign off`, and the count goes straight to "Confirmed, no differences" (toast "Count signed off. Stock confirmed.") — no approver involved.
- **Several lists due**: the Today row then opens My counts ("N lists to count…") instead of a sheet; each list has `Start counting` / `Continue counting`, with "Due today" or "From 12 Nov" badges.
- **Changing the cycle later**: editing "Cycle length" shows an amber note "Saving starts a new cycle today. The 96 batches counted in this cycle will be counted again…".
- **Short-staffed forecast**: "…covers 300 of 412 batches in stock. Raise items per day to 21 or add a person."; Today then shows "Batches not counted this cycle".
- **Keyboard**: ↑ / ↓ also move between Counted boxes.

#### Edge Cases
- **Server asks for a re-type** (`COUNT_RETYPE`): the dialog closes, the affected boxes are cleared and marked "Type it again (was 5)".
- **Invalid entry**: letters or decimals → "Whole number, 0 or more"; sign-off blocked with "Fix the highlighted quantity before signing off."
- **Offline while counting**: footer "Not saved. Check your connection; your counts stay on this screen."; sign-off refuses with "Your latest counts are not saved yet…".
- **Edited elsewhere**: a 409 raises the toast "This count changed — … Showing the latest saved version."
- **Stock moved since the count**: the approval dialog adds "It was 6 when counted; stock has moved since." and applies the *difference*, not the counted number.
- **Sole approver signed it herself**: footer text "You signed this count and no other approver is active, so you decide it. This is recorded." and a mandatory checkbox "I signed this count and no other approver is active in this branch…"; History then shows "Own count" under "Decided by".
- **Someone other than the assignee opens an unsigned list**: they get the read-only record "Assigned to **Ravi Teja**. Only they can enter and sign it off."
- **No access**: the register's "denied" state replaces the tab.
- **Naming drift on one screen**: task "Stock counts", switch "Stock reconciliation is on", message "Reconciliation is off", unit "cycle", Today card "Batches not counted this cycle", stock-list filter "Count history" (URL key `audit`), server permission `pharmacy:compliance:audit`.

---

### STORY-100: Count one shelf outside the cycle, and have the count rejected

**Type**: medium
**Topic**: Stock control, counts & reorder
**Persona**: Sana Fatima, pharmacist, who thinks Rack B-4 "looks wrong"; Meera Nair (ADMIN) reviewing
**Goal**: Count everything on one shelf right now; the reviewer distrusts a surplus and sends it back.
**Preconditions**: Reconciliation may be on or off. Six batches are assigned to "Rack B-4"; one of them is already on Ravi's unsigned cycle list.
**Ideal path**: 6 — pick the shelf, enter the counts, sign off with a note; reviewer opens, rejects with a reason.
**Alternate paths** (three different entry points create the same on-demand count via `POST /inventory/workspace/counts`):
- Stock counts › `Count an item` → dialog "Count an item or a shelf" (this story).
- Stock list: tick rows → `Count selected batches`; or with nothing ticked, `Count matching batches` (counts everything the current filters match — e.g. filter "Rack / shelf / bin" = Rack B-4 first).
- Item page action row → `Count this batch`.
- Inside the dialog's item search, typing a rack name surfaces chips "Count shelf Rack B-4 · 6 batches" that switch to shelf mode.

#### Steps
1. Sidebar `Inventory` → area `Stock` → task `Stock counts`.
2. Click `Count an item` (top right) → dialog **"Count an item or a shelf"** ("Outside the cycle, for an item or a shelf that looks wrong. You count and sign it off; differences go for approval as usual.").
3. Click the `Shelf / location` toggle (default is `Item or batch`).
4. Open "Shelf" and choose `Rack B-4 · 6 batches` → the batches list appears with five ticked; the sixth is greyed with "On Ravi Teja's count of 14 Nov 2026, not signed yet"; a "Select all 5 on Rack B-4" checkbox is ticked.
5. Click `Count 5 batches` → the dialog closes and the count sheet opens (`document=<id>`).
6. Enter five counts with Enter between them; Momate cream shows System 4, counted 7 → "+3" and "+₹438.00" in amber.
7. Click `Sign off count` → dialog "Sign off this count": "5 items, 1 differs · Extra +3 (+₹438.00)".
8. Type "Why do these differ? (required)" = `3 extra tubes behind the row; maybe from Wednesday's delivery`.
9. Click `Sign off and send for approval` → locked record, "Signed – awaiting approval".
10. Meera: `Inventory` → Stock → `Stock counts` → the `Approvals` tab carries an amber badge "1"; click it, then `Review` on the row (its date cell carries the suffix "· on demand").
11. She suspects an unposted purchase bill rather than a true surplus → click `Reject` → dialog **"Reject this count"** ("Rejecting 5 batches, extra +₹438.00. Stock does not change; these batches go back into the cycle to be counted again.").
12. Type "Reason (required)" = `Looks like the unposted Sri Sai Pharma bill — post the bill first, then recount`.
13. Click `Reject count` → toast "Count rejected. Stock unchanged. These batches go back into the cycle to be counted again."; badge "Rejected"; the reason is printed on the record.

#### Variations
- **Item mode**: stay on `Item or batch`, type at least 2 characters in "Find a batch" (placeholder "Item name, batch, or rack"), tick results (zero-stock batches included), `Count 2 batches`.
- **From the stock list**: `Count matching batches` with no filters set would put every matching batch in the branch on one list in a single click, with no confirmation *(server-side limit not verified)*.
- **Sana follows up**: she finds the record under `History` (filters: date range, Status, More › Person, search "Item, batch or person"); footer note "1 rejected count is not included." A fresh `Count an item` is needed — a signed count cannot be edited ("only a fresh count can replace it").

#### Edge Cases
- **Nothing chosen**: "Choose a shelf." / "Choose at least one batch to count."
- **Batch already on an open count**: its checkbox is disabled with "On <person>'s count of <day>, not signed yet / waiting for approval".
- **Truncated search**: "Showing 30 of 84. Type more of the name or batch to narrow it down."
- **Empty shelf**: "No batch in stock on Rack B-4."
- **Button label vs dialog title**: `Count an item` opens "Count an item or a shelf"; the stock list calls the same act "Count selected batches"; the item page "Count this batch".

---

### STORY-101: Follow an expiry alert, pull the batch from sale, then write it off

**Type**: medium
**Topic**: Stock control, counts & reorder
**Persona**: Ravi Teja, pharmacist, Monday morning; the header bell shows an orange item
**Goal**: Stop 4 bottles of Tugain 5% solution (expiring in three weeks) from being sold, and later write them off.
**Preconditions**: Batch `TG204`, 4 BOTTLES, expiry 05/12/2026, all available. Ravi holds `inventory:transaction:create`.
**Ideal path**: 5 — alert opens the expiring batch directly; one action "block from sale" with a reason; later one action "write off" on the same record.
**Alternate paths** (lead A.20 in `discovery.md`):
- Today row "Expiring in the next 3 months" **and**, on the same screen, button `Check next 3 months' expiry` — identical target (`?area=stock&view=list&expiryMonths=3`). Likewise "Low stock" row + `Check low stock` button, and "Overdue supplier bills" row + `Check overdue supplier balances` button.
- Stock list › "Expiry" select (`Within 1 / 2 / 3 / 6 months`) or "Stock level" = `Expired`.
- Stock › `Stock optimization` (shelf life left per slow batch; STORY-102).
- Pharmacy Report › Expiring Stock; Dashboard "System Alerts"; Reports & Analytics alerts (other topics).
- Starting the documents from the registers: Stock › `More tasks…` › `Blocked stock` or `Loss & breakage` › `New document` › "Add a batch" search.
- Sending it back instead: item page button `Supplier returns` or Purchases › Purchase bills › Returns (purchases topic).

#### Steps
1. Click the bell in the header → item "Expiring soon: Tugain 5% solution — 21 days left • Qty 4".
2. Click it → browser goes to `/dashboard/inventory?tab=expiry`. The workspace ignores `tab`, so he lands on **Today**, not on an expiry list. He looks for the product, does not see it.
3. Click the row "Expiring in the next 3 months" → Stock list with chip "expiryMonths: 3 ×".
4. Change the "Expiry" select to `Within 1 month` → shorter list (chips now "expiryMonths: 1 ×" and "batchView: ALL ×").
5. Click the product name → item page; badge "Current / on hand", "Opened batch TG204 · Expiry 05 Dec 2026".
6. In the action row click the button labelled **`Blocked stock`** (the buttons are named after registers: `Blocked stock`, `Loss & breakage`, `Supplier returns`) → a new document opens (`?area=stock&view=HOLD&new=<key>&return=…`) with one pre-filled line: Tugain, batch TG204, Quantity 1. Help text: "Hold units from sale while keeping them in physical stock. Release from this record."
7. Change "Quantity" from 1 to `4`.
8. Type "Reason / notes" (placeholder "Required before posting") = `Near expiry 05/12/2026 — pulled from sale, asking distributor to take back`.
9. Click `Block stock` (primary, top right) → status heading "Posted"; "Saved stock effects record the units held out of available stock."
10. Click the back arrow (tooltip "Back to blocked stock") → because of `return=`, he is taken back to the **item page**, not the register; header now "4 BOTTLES · 4 held · 0 available", badge "Held, on hand".
11. Two weeks later (distributor declined): open the item again (steps as in STORY-094) → tab `Blocked stock` → "Held stock by source" lists the hold reference with "4 BOTTLES still held · POSTED".
12. Back on the action row click `Loss & breakage` → new LOSS document pre-filled with the batch.
13. In "Stock source" choose the hold reference instead of "Available stock (no hold)".
14. Set "Quantity" = `4` and "Reason / notes" = `Expired 05/12/2026 — destroyed as per SOP`.
15. Click `Post stock loss` → "Posted"; "Saved stock effects record the units removed for loss or breakage."; the batch becomes "Previous / depleted".

#### Variations
- **Still usable**: open the hold document → `Release held stock` → "Hold released".
- **Low-stock twin**: the bell item "Low stock: …" links to `?tab=low-stock` and also lands on Today; the user then clicks "Low stock" → `stock=LOW` ("Available quantity is at or below this batch's saved minimum.").
- **Already expired**: filter "Stock level" = `Expired`; rows are red with "Expired, on hand". Choosing a Stock level clears the Expiry filter and vice versa — they cannot be combined.
- **Posted the wrong quantity**: an approver uses `Correct by reversal` → "Reversal reason" → `Reverse posted effects` on the posted document; Ravi cannot.

#### Edge Cases
- **Loss with no approval**: `Post stock loss` and `Block stock` take effect immediately for a pharmacist, while `Edit stock` by one unit (STORY-098) waits for a doctor.
- **No reason**: the server refuses the post; the error appears above the form and "Your attempted edits remain in the form…".
- **Interrupted post**: heading "Outcome not confirmed", `Check saved status`, a read-only "Recovery handoff" text block and a link "Open Stock counts".
- **Search finds nothing in a new document**: "No matching batch. Add the product/batch in Stock, then return here."
- **Dead links into the workspace**: `?tab=low-stock`, `?tab=expiry` (`components/layout/header.tsx`), `?tab=pharmacy-control[&section=shelf]` (`app/dashboard/pharmacy/pharmacy-workspace.tsx`).

---

### STORY-102: Find slow stock and raise a supplier-return draft

**Type**: medium
**Topic**: Stock control, counts & reorder
**Persona**: Meera Nair, clinic administrator, month-end housekeeping
**Goal**: See which batches have not sold in four months and start a return to the distributor for those still returnable.
**Preconditions**: Purchase bills exist for some slow batches. Meera can write supplier returns.
**Ideal path**: 3 — open the screen (results already computed), press "Create return draft" on a distributor, open the draft.
**Alternate paths** (lead A.15 in `discovery.md`):
- Purchases › `Purchase bills` › `Returns` tab › new return (also reachable from the Stock strip's text link "Supplier returns are now in Purchase bills › Returns").
- Item page action row `Supplier returns` (single batch).
- "Return to supplier" inside a purchase bill's actions; `Credits & vouchers` (purchases topic).
- For spotting slow / expiring stock only: stock list Expiry filter, Pharmacy Report › Expiring Stock.

#### Steps
1. Sidebar `Inventory` → area `Stock` → task `Stock optimization` → `?area=stock&view=optimize`. The "Data quality" strip sits above; below, heading "Stock optimization", a "Rules" panel and a dashed box "Run optimization to check every batch on the shelf against its sales and purchase bills."
2. In "Rules" change "Non-moving days" from 90 to `120` (hint "Flag stock not sold for this many days."); leave "Minimum batch value (₹)" at 500.
3. Click `Save rules` → "Saved: 120 non-moving days, minimum ₹500.00."
4. Click `Run optimization` → URL gains `run=1`; summary "Checked 412 batches on the shelf on 13 Nov 2026, 5:40 pm: **23 batches** not sold for 120 days. Returnable **₹18,450.00** · non-returnable **₹6,210.00**, at PTR excluding GST."
5. Read "Returnable · bought in the last N days": one card per distributor, e.g. "Sri Venkateshwara Pharma Distributors — GSTIN 36AAACS1234F1Z5 · 5 batches · ₹9,870.00 at PTR, excluding GST", rows with "Shelf life left", Qty, PTR, GST, "Value at PTR", "Bill SV/2611 · 02/06/2026", "Last sold 141 days ago".
6. A second distributor's card shows an amber box (the server's `blocker` text for a group below the minimum value) and no button — she skips it.
7. Click `Create return draft` on the first card → green banner "Return draft SR-… created with batch, PTR and GST filled in." with `Open draft` and `See it in Purchase bills › Returns`; the list re-runs and the rows now say "On return SR-… (Draft)".
8. Click `Open draft` → the Supplier-return document opens in the **Purchases** area — hand-off to the purchases topic (`Create return challan`).
9. Use the back arrow → returns to Stock optimization (the run repeats automatically because `run=1` is still in the URL); scroll to "Non-returnable · view only" ("…Discount it, bundle it or use it in the clinic before it expires.").

#### Variations
- **Re-run**: the header button becomes `Run again`.
- **Some batches already on a return**: the card shows `Open SR-… (Draft)` plus `Draft the remaining batches`.
- **Read-only user**: rule inputs are disabled with "Ask someone who raises supplier returns to change these."; no draft buttons.
- **Phone**: tables collapse to cards with "Qty × PTR".

#### Edge Cases
- **Rules edited by someone else**: a 409 shows the error and reloads the saved rules.
- **Double click**: one request key per distributor guarantees a single draft.
- **Nothing slow**: "Nothing slow-moving can go back to a distributor." / "No slow stock is past its return window."
- **Not saved anywhere**: results exist only for the current page view; there is no history or export of a run.
- **Naming**: the task is "Stock optimization", `discovery.md` and the redirect call a neighbouring feature "Stock predictions", the output is a "return draft" / "Supplier returns" / "Purchase bills › Returns", and suppliers are "distributors" on this screen.

---

### STORY-103: From reorder targets to a received purchase order

**Type**: long
**Topic**: Stock control, counts & reorder
**Persona**: Meera Nair (ADMIN — may accept targets and approve orders); Ravi Teja (PHARMACIST — may create shortbook requests and orders, cannot approve)
**Goal**: Let the system propose minimum / maximum levels, turn shortages into a purchase order, get it approved, send it, and start receiving it.
**Preconditions**: A few months of sales history. Suppliers exist. No automation owner is configured (manual run).
**Ideal path**: 8 — accept proposed targets (2), open the generated shortage list with supplier pre-chosen and create the order (2), approve (2), send (1), receive (1).
**Alternate paths**:
- Targets: Reorder › `More tasks…` › `Manual targets & exclusions` (type min / max / reorder per item → `Review selected changes` → "Reason (required)" → `Save reviewed targets`); item page `Set stock alert` (STORY-097); legacy `/dashboard/stock-predictions` (redirects to `?area=reorder&view=targets`); Reorder › `Monitor` › "Demand & stock coverage" › `Review proposal`.
- Shortages: Shortbook › `Add manual request`; Shortbook › `Sync shortages`; ticking "Sync accepted targets to Shortbook" when accepting targets; Reorder › `Automation settings` › "Automatic PO drafts" + `Run saved settings`.
- Orders: Purchase orders › `Add purchase order` (skips the shortbook entirely).
- Receiving: order page `Receive remaining stock`; Today row "Orders awaiting receipt"; Purchases › `Inward challans` › new document › choose the order in "Purchase order"; or simply post the supplier's bill in `Scan or enter bill` (purchases topic). A `Receive against order` button also exists in the generic register (`WorkflowRegister` in `InventoryWorkspace.tsx`), but that register is never rendered for the Reorder area.
- Cancelling: `Cancel document` (document toolbar) **and** "Cancel remaining quantities" › `Cancel remaining units` (delivery panel) on the same page.

#### Steps
**A. Meera accepts targets**
1. Sidebar `Inventory` → area `Reorder` → lands on `Shortbook` (first task).
2. Click task `Target proposals` → "Target proposals — 0 matching records · all result pages included" and "No matching records. Generate a proposal to review demand and saved targets."
3. Click `Generate target proposal` → a proposal document opens: reference, a status line "<status> · <model> · 13 Nov 2026" *(initial status label inferred to be "Draft • no stock change")*, an assumptions sentence, and a three-part strip "Evidence dates", "Demand inputs" (e.g. "90 days · 3 minimum orders · Bounce Off · Refill Off"), "Coverage" ("15 / 45 min / max days").
4. Read a line: "**Acnestar gel** — AG0917 · TUBES — Ready for review"; "Saved min / max **Unconfigured / Unconfigured** → Proposed **6 / 18 TUBES**"; "Available 3 · Sales 22 · Bounce 0 · Refill 0 · 9 orders".
5. Expand "Demand records (9)" on that line to see the dated sales behind the number.
6. Click `Select unreviewed` → every undecided line is ticked; counter "14 selected".
7. Untick two lines marked "Cold start: retain saved targets".
8. Leave "Sync accepted targets to Shortbook" ticked.
9. Click `Accept selected` → "Selected targets accepted. Unselected lines remain available for review."; accepted lines now read "Accepted 13 Nov 2026, 5:52 pm by <actor id>".
10. Click `Back to list`.

**B. Ravi turns shortages into an order**
11. `Inventory` → `Reorder` → `Shortbook`: rows such as "<reference> — Acnestar gel: 15 TUBES — <source> · NORMAL · 13 Nov 2026 · Requested by … — Min 6 / available 3 · Supplier selection required", status "Draft • no stock change" *(reference format and source value not verified)*.
12. (If the list looks stale) click `Sync shortages` → "Shortbook refreshed from active targets. Existing requests are preserved."
13. Click the Acnestar request → **two stacked panels** open: the generic document editor on top (heading "Draft", "This draft has not changed stock.", fields Reference, Date, Supplier, Expected date, Priority, Reason / notes, "Add a batch" search, lines table) and under it "Supplier recommendation".
14. In "Supplier recommendation" expand "Sri Sai Pharma Agencies · Alternative · 4 posted purchase records" → past bills with rate, pack, free quantity and discount.
15. He sees two supplier pickers — "Supplier" in the top form and "Supplier" + `Save supplier` in the lower panel — hesitates, then uses the lower one: choose `Sri Sai Pharma Agencies · 36ABCFS9876K1Z2` and click `Save supplier` → "Supplier choice saved for this request and future shortages."
16. In the lines table change "Quantity" to `12`.
17. Set "Expected date" = 17/11/2026 and "Priority" = `HIGH`.
18. Click `Save draft` → "Document saved. Review the confirmed document status below."
19. Click `Create purchase order` (primary) → heading "Purchase order created"; "A purchase order was created. Stock is unchanged by this conversion."; a button `Open linked purchase order` appears.
20. Click `Open linked purchase order` → the order opens (Draft) with the same two-panel layout; the lower panel is "Order delivery & receipts" (Ordered / Previously received / Remaining).
21. Check "Rate excl. GST" and "GST %" on the line, then click `Submit for approval` → heading "Awaiting manager approval"; "Ask a manager with approval permission to review this document."

**C. Meera approves and sends**
22. `Inventory` → `Reorder` → `Purchase orders`; set "Status" = `Awaiting manager approval`, click `Apply filters` (filters here need an explicit apply, unlike the stock list).
23. Click the order → click `Approve document` (primary) → heading "Approved"; "Receive actual goods through an inward challan linked to this order."
24. In "Order delivery & receipts" click `Send purchase order` → a status note is recorded under the panel; the fixed caption underneath reads "Supplier mail transport: setup required. Sending records the setup failure; export is available for manual delivery."
25. Click the download icon (tooltip "Export order & remaining quantities") → `<reference>.csv`; she forwards it to the distributor's rep on WhatsApp outside the app.

**D. Ravi receives**
26. Tuesday, goods arrive: `Inventory` → Today row "Orders awaiting receipt" (count 1) → Reorder › Purchase orders filtered `status=OPEN`.
27. Click the order → `Receive remaining stock` → the app jumps to Purchases › Inward challans with a new document pre-filled from the order's remaining lines (reason "Receipt against <order reference>") — **hand-off to the purchases topic** (`Receive stock`, then "Create linked purchase bill").

#### Variations
- **Manual targets instead of proposals**: `Manual targets & exclusions` → search → tick items → type Minimum / Maximum / Reorder level → optionally tick "Protect manual targets for <item>" or "Exclude <item> from target proposals" → `Review selected changes` → reason → `Save reviewed targets` ("Reviewed targets and exclusions saved with their history.").
- **Reject proposals**: `Reject selected` → "Selected proposal lines rejected; saved targets retained."
- **Automation**: `Automation settings` → pick "Automation owner", tick "Automatic target proposals" / "Automatic PO drafts", set "Demand lookback (days)", "Min. cover (days)" etc. → `Save settings` → `Run saved settings` → "Saved run outcomes" list with `Open generated document`.
- **Monitor**: order-outcome bars, "Demand & stock coverage" table, "Supplier choices", `Export underlying records`.
- **Partial delivery**: after a first receipt the order shows "Part received"; `Receive remaining stock` again, or "Cancel remaining quantities" › reason › `Cancel remaining units`.

#### Edge Cases
- **Self-approval**: a DOCTOR who created the order gets "Another approver must approve a document you created"; OWNER / ADMIN / MANAGER may approve their own.
- **Pharmacist on a proposal**: `Select unreviewed` and the line checkboxes are disabled; no Accept / Reject buttons, and no hint why.
- **Supplier list is partial**: the lower "Supplier" select only offers suppliers suggested for the *first* line (`suggestions[0]`).
- **Raw identifiers leak into the UI**: "Supplier <supplierId>" in shortbook rows, "Requested by <createdBy>", "by <decision.actorId>", "Branch <branchId>" on Manual targets and Monitor.
- **Load failure**: "Could not load replenishment. Retry." with `Retry loading`; nothing is shown as zero.
- **Sending without mail set up**: the attempt is logged as a failure in the order's dispatch list; the order is still usable.
- **Naming drift**: area "Reorder"; component "Replenishment" ("Replenishment monitor", "Loading saved replenishment records…"); legacy route "stock-predictions"; "Shortbook" vs "Add manual request" vs "Sync shortages" vs (dead code) "Add low-stock demand"; "Target proposals" vs "Reorder target review" vs "Manual targets & exclusions"; list button `Add purchase order` vs generic register `New order`.

---

### STORY-104: Load opening stock from an Excel sheet

**Type**: medium
**Topic**: Stock control, counts & reorder
**Persona**: Meera Nair, clinic administrator, the weekend before go-live, with a stock sheet exported from the old billing software
**Goal**: Create the drug catalogue and opening batch balances for ~380 rows in one go.
**Preconditions**: An `.xlsx` under 5 MB and 1,000 rows. Inventory is empty or nearly so.
**Ideal path**: 3 — choose the file, review a row-by-row preview with errors, confirm.
**Alternate paths** (lead A.13 in `discovery.md`):
- Stock › `More tasks…` › `Manual opening stock` → register "Opening stock entries" → `New document` → "Add a batch" search → quantity → `Post opening stock`. It can only add balance to a batch that **already exists** ("No matching batch. Add the product/batch in Stock, then return here."), so a brand-new item needs `Add batch` (+ approval) first.
- `Add batch` then `Edit stock` (two approvals for a pharmacist).
- Post real purchase bills (`Scan or enter bill`, `Import CSV`, `Gmail intake` — purchases topic).
- An unmounted compact version of this same importer ("Start Inventory From Excel — Upload opening stock without leaving the pharmacy desk.") exists in `PharmacyInventoryControl.tsx`; the Pharmacy guide still points to it, but no route renders it.

#### Steps
1. Sidebar `Inventory` → area `Stock` → open the `More tasks…` select → choose `Opening stock import` → `?area=stock&view=opening`; heading "Opening stock import" and a card "Start Pharmacy Inventory From Excel — Import opening stock into the drug catalog and inventory in one pass."
2. Click "Excel columns and format" → filled badges (required): Drug name, Manufacturer, Composition, Category, Dosage form, Strength, Pack size, Selling price, Current stock; outlined (optional): Cost price, MRP, SKU, Batch number, Expiry date, GST %, Supplier. There is no template to download.
3. Click `Choose Excel` (or drop the file on "Drop an Excel file here") and pick `linae-opening-stock-nov-2026.xlsx` → the drop zone shows the file name and "212.4 KB selected" with a `Remove` button.
4. Click `Preview import` → a spinner; the button label then changes to **`Confirm opening import`**. On this full-width layout no preview table is rendered (the "Review N source rows…" table is only wired into the compact layout), so she sees nothing to review and hesitates before pressing a button that now says "Confirm".
5. Click `Confirm opening import` → toast "Inventory imported with errors — 371 created, 6 updated, 7 skipped."; a results block appears with tiles Rows 384 · Created 371 · Updated 6 · Drugs 352 · Stock 377 · Skipped 7.
6. Read "Rows needing review": "Row 41: …", "Row 118: …"; below it "Import reference: <id>" and a link `Download original Excel`.
7. Fix what the server marks as retryable: click `Retry failed rows` → toast "Some rows still need attention — … 3 remaining." (or "Import complete").
8. Click task `Stock list` → the new batches are listed; the "Data quality" strip shows how many lack a location, category, HSN code or min/max — the columns list in step 2 offers no way to supply location, HSN or min/max.

#### Variations
- **Clean file**: toast "Inventory import finished"; no review block.
- **Nothing imported**: toast "No inventory rows imported".
- **Uncertain outcome** (timeout): toast "Import outcome not confirmed — … Check import outcome before trying again."; `Check import outcome` re-reads the saved result without importing again; `Resume unfinished rows` appears when rows are pending.
- **Manual route for a handful of batches**: `Manual opening stock` › `New document` › search batch › quantity and "Rate excl. GST" › `Post opening stock` ("Saved stock effects record the opening quantities added to the new batches.") — no approval step.

#### Edge Cases
- **Wrong file**: toasts "Unsupported file — Upload an .xlsx or .xls Excel file.", "File too large — Upload an Excel file no larger than 5 MB.", "Empty file".
- **Preview request fails**: toast "Import failed — <message>" (the same title is used for preview and for the real import).
- **Choosing another file** resets the preview, so the button returns to `Preview import`.
- **Earlier unknown outcomes**: "Some earlier row outcomes are unknown. Ask an administrator to reconcile them before importing stock again."
- **Existing batches**: the (unrendered) preview caption states "Existing batch balances cannot be reset." — re-importing does not overwrite quantities; that warning is never shown on this screen.
- **Naming drift**: task "Opening stock import" · card "Start Pharmacy Inventory From Excel" · button "Confirm opening import" · toast "Inventory import finished" · neighbouring task "Manual opening stock" whose register is headed "Opening stock entries" · ledger methods "Opening stock" and "Excel import"; sheet column "Current stock" vs preview column "Opening qty"; "Cost price" vs "PTR".

---

### Reports, users & clinic administration

Source: `topics/reports-admin.md`

### STORY-105: Pharmacist counts the pharmacy drawer at closing time

**Type**: medium
**Topic**: Reports, users & clinic administration
**Persona**: Imran Sheikh, pharmacist, 8:45 pm, shutters half down, wants to go home
**Goal**: Record what is physically in the pharmacy drawer and on the UPI / card settlements for today, and see any shortfall the same day
**Preconditions**: Signed in as PHARMACIST with the `pharmacy:compliance:read` and `pharmacy:compliance:audit` grants; pharmacy bills and at least one counter sale were confirmed today; nobody has counted yet
**Ideal path**: 5 — open the day's collection (1), type three counted amounts (3), save (1). The code needs exactly this when nothing goes wrong.
**Alternate paths**:
- Sidebar › Overview › `Daily Collection` (direct link to `/dashboard/pharmacy/reports?report=daily-collection`).
- Sidebar › Pharmacy › `Pharmacy Report` → landing page "Common reports" card "Daily Collection".
- `Pharmacy Report` → left menu › "Accounting Reports" › "Daily Collection".
- `Pharmacy Report` → search box "Search reports, e.g. GSTR" with any of: collection, daily, cash, upi, card, payment, reconciliation, takings, consultation, procedure, clinic.
- Not a path, but looks like one: the Pharmacy Counter cockpit button `Daily close` opens the Pharmacy Desk, not this count (per `docs/ux-paths/discovery.md`, naming drift C).

#### Steps
1. Click `Daily Collection` in the sidebar (Overview group) → Page opens with breadcrumb "← Pharmacy Report / Accounting Reports", heading "Daily Collection" with an (i) tip, and a skeleton "Loading the day's collection…". The toolbar shows `Previous day` (chevron), a "Day" text box showing today as dd/mm/yyyy, `Next day` (disabled, because the day is today), `Print` and `Download`. There is no `Go` button on this report.
2. Read the amber status banner → "Pharmacy not counted yet. Count the pharmacy cash drawer and check its UPI and card settlements, then enter them below." Tiles below it: "Pharmacy billed today", "Pharmacy expected in hand", "Pharmacy still due".
3. Scroll to "Pharmacy reconciliation by payment mode" → A table with columns Mode, Today's bills, Earlier bills, Counter, Refunds, Expected, Counted, Difference. Rows Cash, UPI and Card are always present (other modes appear only if money moved in them). Expected reads Cash 18,450.00, UPI 27,310.00, Card 6,200.00.
4. Type `18250` in the "Cash counted" box → The Difference cell for Cash turns red and shows -200.00 as he types. The Total row immediately shows Counted 18,250.00 and Difference -33,710.00, because blank modes count as nothing in hand once anything is entered; the alarming total only settles after the other boxes are filled.
5. Type `27,310` in "UPI counted" → Difference for UPI shows 0.00 (commas and a leading ₹ are accepted).
6. Type `6200` in "Card counted" → Total Difference settles at -200.00.
7. Hesitates over the ₹200 gap, then types `₹200 given to front desk as change` in "Note (optional)" (placeholder "For example: ₹500 kept aside for change") → `Save count` is enabled.
8. Click `Save count` → Button reads "Saving…", then a green line: "Count saved. Pharmacy short by ₹200.00. Check the drawer, pending UPI settlements and any refunds paid in cash." The banner turns red with the same "Pharmacy short by…" text, a fourth tile "Pharmacy count difference" appears, the button is relabelled `Save recount` (disabled until a box changes), and a collapsed line "Counted by Imran Sheikh at …" appears under the table.
9. Finds the ₹200 under the coin tray; changes "Cash counted" to `18450` and clears the note → `Save recount` becomes enabled.
10. Click `Save recount` → "Count saved. Pharmacy balanced: what was counted matches what the system expected." Banner turns green; the history line now ends "· 1 earlier count" and expands to list both counts with who, when, amounts and note (counts are append-only).
11. Click `Print` → The report PDF is fetched and the browser print dialog opens from a hidden frame (if the frame cannot print, the PDF opens in a new tab instead).

#### Variations
- **Accountant (read-only)**: Lakshmi (ACCOUNTANT) opens the same page; `canRecordCount` is false for her role, so the Counted column shows the saved figure or "—", and there is no Note box and no `Save count`. She uses `Download` → "Excel (.xlsx)" / "CSV" / "PDF".
- **Owner / admin / doctor**: viewers who can read clinic bills also get two sections above the pharmacy part: "Whole day" (tiles Whole day / Clinic / Pharmacy) and "Clinic: consultations and procedures" (tiles "Clinic received", "Clinic billed today", "Clinic still due"). The count still reconciles the pharmacy drawer only.
- **Yesterday's count**: click `Previous day` (one click per day, reloads immediately) or type a date into "Day"; a `Today` button appears to jump back.
- **Phone / narrow screen**: below `md` the table is replaced by one card per mode with a larger "Counted" box.

#### Edge Cases
- **Unreadable amount** (e.g. `18k`): the box gets a red border, "Enter amounts as numbers, for example 18250 or 18,250.50." appears, and `Save count` stays disabled.
- **Two people count at once**: the second save gets a 409 → "Someone else saved a count for this day while you were entering yours. Their count is shown below; your figures are still in the boxes. Check them and save again."
- **Role without the grant**: the report fails with "Your role cannot open pharmacy reports. Ask the clinic owner or an admin for pharmacy compliance access."
- **Over, not short**: "Pharmacy over by ₹…. Check for a payment taken without a bill, or a bill not yet confirmed." (amber).
- **Future day**: `Next day` is disabled at today; a bad `from=` in the address bar falls back to today.
- **Same figures, other surfaces**: "Pharmacy billed today" is the same money as the Pharmacy Desk header metric `Sales` (today's sales), the Sales Register report "Total for the period" when the period is today, and today's row in Day wise Summary; each is computed by a different endpoint.

### STORY-106: Accountant pulls the month's GST return figures

**Type**: medium
**Topic**: Reports, users & clinic administration
**Persona**: Lakshmi Iyer, visiting accountant (ACCOUNTANT role), preparing October's GSTR-1 and GSTR-3B on 13 November
**Goal**: Download GSTR-1, GSTR-3B, the GSTR-2B ITC statement and the HSN summary for October 2026
**Preconditions**: Signed in as ACCOUNTANT with `pharmacy:compliance:read`; October sales and purchase bills are posted
**Ideal path**: 6 — open Pharmacy Report (1), tick the four returns for "Last month" (4), one download (1). Today each report is opened, exported and backed out of separately.
**Alternate paths**:
- Landing page "Common reports" cards for "GSTR-1" and "GSTR-3B" (GSTR-2A, GSTR-2B, HSN wise GST and Composition are not on the cards; menu or search only).
- Left menu › "GST Reports" lists all eleven GST reports.
- Search box: "gstr" finds the four returns; "gstr3b", "3b", "itc", "filing", "hsn", "cmp" also match.
- A bookmarked URL such as `/dashboard/pharmacy/reports?report=gstr-1&from=2026-10-01&to=2026-10-31` (report and filters live in the address bar).
- Overlapping figures elsewhere: "GST Summary & Monthly P&L" (Accounting Reports) shows Input GST / Output GST / "Net payable" for a date range; old Inventory links `?area=purchases&view=reports` forward there ("This report is now under Pharmacy Report. Opening it…").

#### Steps
1. Click `Pharmacy Report` in the sidebar (Pharmacy group) → Landing page "Pharmacy Report" with an amber notice ("Every figure comes from the stock and purchase records behind it. Until the stock take and medicine-name clean-up are done, check margins and GST totals against the bills before filing."), six "Common reports" cards, and the left menu grouped GST Reports / Margin Reports / Stock Reports / Accounting Reports / Others.
2. Type `gstr` in "Search reports, e.g. GSTR" → The menu narrows to GSTR-1, GSTR-3B, GSTR-2A, GSTR-2B. (The "Common reports" cards do not filter.)
3. Click "GSTR-1" → Report opens with Period already "Last month (October 2026)", tiles Taxable value / CGST / SGST / Total tax, and sections "B2C small, rate-wise (Table 7)", "HSN summary (Table 12)" and "Documents issued (Table 13)". On screens narrower than `2xl` the left menu disappears once a report is open.
4. Click `Download` → Menu: "Excel (.xlsx)", "CSV", "PDF".
5. Click "Excel (.xlsx)" → File downloads with the same sections, rows and totals as the screen.
6. Click the breadcrumb "← Pharmacy Report" → Back on the landing page; the search box still holds "gstr" (it is component state, expected to persist).
7. Click "GSTR-3B" → Sections "3.1 Outward supplies and 4 Eligible ITC" and "6.1 Payment of tax"; tiles Output tax / Eligible ITC / Payable in cash (plus "ITC carried forward" when applicable).
8. Expand "How these figures are worked out" → Bulleted notes, including a "Not claimed: n supplier document(s) without a valid GSTIN" line when relevant.
9. Click `Print` → Print dialog with the paper-layout PDF.
10. Breadcrumb back, click "GSTR-2B" → Section "Supplier-wise ITC"; suppliers without a valid GSTIN are flagged.
11. Click `Download` → "CSV" → File downloads for matching against the portal.
12. Breadcrumb back, replace the search text with `hsn`, click "HSN wise GST" → Opens for last month with Type "Sales".
13. Change Type to "Purchase" and waits → Nothing reloads; filters are only a draft until `Go`. She notices and clicks `Go` → table reloads, URL gains `type=PURCHASE`.
14. Click `Download` → "Excel (.xlsx)".

#### Variations
- **Composition-scheme pharmacy**: "Composition GST Report" adds a "Composition rate" select — "1% (trader)", "2% (manufacturer)", "5% (restaurant)", "6% (services)" — and a "Composition tax" headline.
- **Quarterly filer**: Period › "Last quarter" (financial-year quarters), then `Go`.
- **Odd range**: Period › "Choose dates…" reveals "From" and "To" text boxes (dd/mm/yyyy), then `Go`.
- **ITC cross-check**: "GSTR-2A" lays supplier invoices out as "B2B invoices" and "Credit / debit notes (supplier returns and credit notes)"; "Purchase Register" lists the same supplier bills one row each; "Purchase Bills" splits them by slab. Four reports over the same purchase documents.

#### Edge Cases
- **From after To**: "The start date must be on or before the end date." and `Go` is disabled.
- **Range over 400 days**: the server rejects it; the error is shown with "Check the dates and press Go to try again."
- **Nothing posted**: single-table reports show "Nothing in this period. Choose another period and press Go."
- **Bad `?report=`**: "That report is not available. Choose one from the list." above the landing page.
- **Two HSN tables**: "HSN wise GST" (Type Sales) and GSTR-1's "HSN summary (Table 12)" are the same summary in two reports; the accountant has to decide which one to trust.
- **Two "payable" numbers**: GSTR-3B "Payable in cash" (after statutory set-off) vs GST Summary "Net payable" (output minus input) are different calculations with similar names.

### STORY-107: Admin answers a patient's billing query from the Sales Register

**Type**: medium
**Topic**: Reports, users & clinic administration
**Persona**: Kavitha Nair, clinic administrator (ADMIN), patient Mrs. Padmaja Rao (98480 12345) on the phone disputing her October pharmacy spend
**Goal**: List every discounted pharmacy bill for one patient in October, then pull a slab-wise copy for the accountant
**Preconditions**: Signed in as ADMIN; the patient has several confirmed pharmacy bills in October 2026
**Ideal path**: 4 — open Sales Register (1), type the mobile number and apply (1), tick "Discounted only" (1), download (1).
**Alternate paths**:
- Sidebar › `Sales` register (`/dashboard/pharmacy/sales`): date range, search by Bill No / Patient / Mobile, payment-mode filter, more filters (per discovery) — a second "sales register" with its own filters and footer totals, and row actions the report lacks.
- Pharmacy Desk › `Invoices` (`/dashboard/pharmacy/invoices`) and Inventory › Sales › "Patient invoice history" (same invoice list component, per discovery).
- Pharmacy Report landing card "Sales Register", or menu › GST Reports › "Sales Register", or search "sales" / "customer" / "outward".
- "Sales Bills" report with the same search box gives the slab split of the same bills.
- "Purchase Bills" with Type switched to "Sales" is the identical report to "Sales Bills" (and "Sales Bills" with Type "Purchase" is "Purchase Bills"): one server branch serves both ids.

#### Steps
1. Click `Pharmacy Report` in the sidebar → Landing page.
2. Click the "Sales Register" card → Report opens for "Last month (October 2026)" with Type "Sales", GST "All bills", "Search this report" (placeholder "Customer, bill no. or mobile"), `More filters`, `Go`, `Print`, `Download`, and a headline "Total for the period".
3. Type `9848012345` in "Search this report" → Nothing changes yet (draft).
4. Press Enter → Table reloads with only her bills; URL gains `q=9848012345`; headline and the totals row under the header now cover just these rows.
5. Click `More filters` → Panel with "Source" (All sources / Prescription bills / Counter sales), "Doctor" (All doctors + the doctors present in the report) and "Discount" (All bills / Discounted only), plus `Clear`.
6. Choose Discount "Discounted only" → The `More filters` button shows a count badge "1"; still a draft.
7. Click `Go` → Only discounted bills remain.
8. Click the "Total" column heading (label unverified) → Rows sort ascending; click again for descending. The totals row stays pinned under the header.
9. Change Type to "Sales net of returns" and click `Go` → Customer returns appear as negative rows (red).
10. Click `Download` → "PDF" → File downloads to read out / forward.
11. Click breadcrumb "← Pharmacy Report", then menu › GST Reports › "Sales Bills" → Slab-banded table (Base / SGST / CGST / IGST per GST slab), Type "Sales", GST "All bills", and an extra `Show columns` button.
12. Click `Show columns` and untick the slabs with no sales → Columns hide; the button shows a badge with the number hidden; the choice is remembered in this browser per report. Footer text: "Print and Download always include every column."
13. Click `Download` → "Excel (.xlsx)" → The file still contains every column.

#### Variations
- **By doctor**: in `More filters`, "Doctor" lists only doctors who appear in the loaded period.
- **Returns only**: Type "Returns".
- **Non-GST items**: GST select "Without GST".
- **Doctor-wise totals instead of bills**: Others › "Daily Sales Summary – Doctorwise" ("Sales by doctor", headline "Total sales").

#### Edge Cases
- **Changing a filter without `Go`**: Type, GST, search and More filters are all drafts; `Print` and `Download` export the last applied filters, not what is currently selected on screen.
- **Hidden columns and export**: hiding columns never changes the download — stated only inside the `Show columns` menu.
- **"Sales Bills" showing purchases**: switching Type to "Purchase" keeps the page title "Sales Bills" and the search placeholder "Customer, bill no. or mobile" while the rows are supplier bills.
- **Naming**: the same person is "Customer" (search placeholder), "Patient / customer" (Daily Collection bill table) and "Patient" (Sales register page).

### STORY-108: Owner reviews item margins and the day-wise summary for October

**Type**: medium
**Topic**: Reports, users & clinic administration
**Persona**: Dr. Meenakshi Rao, owner-dermatologist, Sunday evening review on a laptop
**Goal**: See which products made or lost money in October, then check the daily sales pattern and any gaps in bill numbering
**Preconditions**: Signed in as OWNER; October sales posted; some stock has no recorded purchase cost
**Ideal path**: 5 — open margin report (1), choose "Last month" (1), sort by profit (1), switch to day-wise keeping the same month (1), download (1). Today the month has to be re-entered by hand in each report.
**Alternate paths**:
- Landing cards "Item Wise Margin Report" and "Day wise Summary"; menu › Margin Reports / GST Reports; search "margin", "profit", "daily", "bill range".
- Old Inventory links `/dashboard/inventory?area=purchases&view=margin` and `view=daywise` forward here ("This report is now under Pharmacy Report. Opening it…").
- Month-level profit without item detail: Accounting Reports › "GST Summary & Monthly P&L" → "Monthly Report" card ("Gross profit", "Margin").
- Top sellers without margin: Admin › Reports › "Inventory Report" → "Top Selling Items".
- Supplier-side cost analysis stays in Inventory › Purchases › `Purchase costs` ("Distributor Analytics").

#### Steps
1. Click `Pharmacy Report` in the sidebar → Landing page.
2. Click the "Item Wise Margin Report" card → Page heading "Item Wise Margin Report", and directly beneath it a card titled "Item-wise Margin" with its own controls: "From" and "To" (native date pickers, defaulting to 1 November – today), "Type", "Tags", "Search in", "Search", `Go`, `More Filters`, `Download`. No Period preset list and no `Print` here.
3. Set "From" to 01-10-2026 → Draft only.
4. Set "To" to 31-10-2026 and click `Go` → URL gains `from`/`to`; tiles "Total Sale Amount", "Total Purchase", "Total Net GST", "Total Profit" update; an amber line reads "… lines without recorded cost … is in Total Sale Amount but not in Purchase, Net GST or Profit. Add the purchase price on the item to include future sales."
5. Click `More Filters` → A panel opens with "Category", "Manufacturer", "Item type", "Cost status" and `Clear filters`.
6. Choose Manufacturer "Galderma" and click `Go` → Rows narrow; button reads "More Filters (1)".
7. Click the column heading "Profit ₹ (%)" → Sorted by percentage, lowest first; a negative profit shows in red.
8. Click the item name "Cetaphil Gentle Skin Cleanser 125 ml" → Leaves the report for the Inventory item page (`/dashboard/inventory?area=stock&view=list&item=…&return=…`).
9. Click `Back to stock list` → Returns to the margin report with dates and filters intact (the button name says stock list, but the `return=` link sends her back to the report).
10. Click `Download` → "Excel (.xlsx)".
11. Click breadcrumb "← Pharmacy Report", then the "Day wise Summary" card → Heading "Day wise Summary" over a card titled "Day-wise Summary"; "From" is back to 1 November and "To" today — the October range was not carried over and is not written to the URL.
12. Set "From" 01-10-2026 and "To" 31-10-2026, click `Go` → One row per day with "Bill Date", "Bill No." (range), slab bands and "Total for the range" top right. A summary line reads e.g. "412 bills over 31 days; 4 days with no bills are shown as ₹0 rows; 2 bill numbers are missing from the sequence. Amounts in ₹."
13. Hover an amber gap chip in the "Bill No." column → A tooltip gives detail on the gap (tooltip content unverified; the column's (i) tip says a gap lists the missing numbers and the status of the bill if it exists, e.g. a draft never confirmed).
14. Change Type to "Purchase" → Reloads immediately without `Go` (dates need `Go`, Type does not).
15. Click `Download` → "CSV".

#### Variations
- **Search by a specific field**: "Search in" chooses which field the Search box matches (options from `MARGIN_SEARCH_FIELD_LABELS`, labels unverified).
- **Returns only / sales only**: margin "Type" select (net, sales, returns).
- **Items with unknown cost only**: `More Filters` › "Cost status".

#### Edge Cases
- **No sales in range**: "No items sold in this range" / with filters "No items match these filters … Change the range or filters and press Go."
- **Refresh on Day wise Summary**: dates and Type are component state, so a browser refresh returns to this month / Sales; the margin report keeps its state because it is in the URL.
- **Download vs screen source**: both reports draw the screen from `/pharmacy/compliance/…` but `Download` calls `/pharmacy/reports/{id}` — two code paths for the same figures.
- **Three spellings**: "Item Wise Margin Report" (menu, heading), "Item-wise Margin" (card), "Item Wise Margin" (export section); "Day wise Summary" vs "Day-wise Summary".
- **Stock column**: "Stock" is current stock now, not at period end (explained only in the column's (i) tip).

### STORY-109: Pharmacist prints the near-expiry list

**Type**: short
**Topic**: Reports, users & clinic administration
**Persona**: Imran Sheikh, pharmacist, quiet Tuesday afternoon before the distributor's rep visits
**Goal**: Print the batches expiring within a month so they can be pulled and returned
**Preconditions**: Signed in as PHARMACIST with report access; stock has batches expiring in December 2026
**Ideal path**: 3 — open Expiring Stock (1), pick "Within 1 month" (1), print (1).
**Alternate paths**:
- Pharmacy Report menu › Stock Reports › "Expiring Stock" (not on the "Common reports" cards).
- Inventory › Today queue "expiring in 3 months"; Inventory › Stock › `Stock list` expiry filter; Stock › `Stock optimization` (per discovery).
- Counts only: Dashboard "System Alerts", header bell, and Admin › Reports "System Alerts" strip "Expiry Alerts" (a 30-day window, at most 10 counted).
- Admin › Reports › "Inventory Report" (its expiry alerts are fetched but not rendered on the page).

#### Steps
1. Click `Pharmacy Report` in the sidebar → Landing page.
2. Type `expiry` in "Search reports, e.g. GSTR" and click "Expiring Stock" under Stock Reports → Report opens with no Period control, an "Expiry" select on "Within 3 months", headline "Value at cost", and columns Item Name, Batch, Expiry, Supplier, Stock, Value at cost, Value at MRP, Action.
3. Change "Expiry" to "Within 1 month" → Draft only.
4. Click `Go` → Table reloads; URL gains `window=1m`.
5. Click `Print` → Print dialog with the PDF.

#### Variations
- **Already expired**: "Already expired"; also "Within 2 months", "Within 6 months".
- **Send to the distributor**: `Download` → "Excel (.xlsx)" instead of printing.

#### Edge Cases
- **Three definitions of "expiring"**: this report defaults to 3 months; the alert counts use 30 days; Inventory Today uses 3 months. The numbers will not agree.
- **Supplier vs Distributor**: this table's column is "Supplier", while the purchase reports' search box says "Distributor, bill no. or GSTIN".
- **Nothing expiring**: the section's own empty text is shown with "Choose another period and press Go." even though this report has no period.

### STORY-110: Admin assembles the October month-end picture across both report centres

**Type**: long
**Topic**: Reports, users & clinic administration
**Persona**: Kavitha Nair, clinic administrator (ADMIN), Friday 13 November, owner wants "October numbers" by evening
**Goal**: Collect October's clinic revenue, pharmacy sales, doctor-wise split, GST position, pharmacy profit and stock risk, and sanity-check them against one day's Daily Collection
**Preconditions**: Signed in as ADMIN; October has clinic bills with payments, pharmacy bills, purchases; today has some activity
**Ideal path**: 6 — one "month-end" view: pick October (1), read clinic + pharmacy + GST + profit on one page (0), drill into two figures (2), export once (1), spot-check one day (2). The code spreads this across two report pages with five different filter bars.
**Alternate paths**:
- Clinic revenue: only Admin › `Reports` (the header bell's `View reports & alerts` lands on the same page).
- Pharmacy sales total: Pharmacy Report › Sales Register / Sales Bills / Day wise Summary / Daily Sales Summary – Doctorwise; Sales page footer totals; GST Summary & Monthly P&L "Sales"; Pharmacy Desk `Sales` metric (today only).
- GST position: GSTR-3B or GST Summary & Monthly P&L.
- Profit: Item Wise Margin Report "Total Profit" or Monthly Report "Gross profit".
- One day's money: sidebar `Daily Collection` or Pharmacy Report › Daily Collection.

#### Steps
1. Open `Dashboard` → Stat cards "Total Users", "Active Users", "Total Branches", "System Status"; "Admin Controls"; "System Alerts"; "Today's Appointments". No money figure anywhere on the dashboard.
2. Click `Reports` in the sidebar (Admin group) → Page "Reports & Analytics" (sidebar says "Reports"). An orange "System Alerts" strip shows Overdue Invoices / Low Stock / Expiry Alerts / Pending Payments / Upcoming Appointments — the same alerts as the dashboard card and the bell. Six cards; "Revenue Report" is preselected and already generated for the last 30 days.
3. Set the first date ("From date") to 01-10-2026 → The report regenerates immediately; no button press needed.
4. Set the second date ("To date") to 31-10-2026 → Regenerates again. Card subtitle: "Report for 1 Oct 2026 to 31 Oct 2026" (date format unverified).
5. Read "Total Revenue", "GST Amount", "Net Revenue", "Total Invoices", then "Payment Mode Breakdown" and "Top Performing Doctors" → She pauses: is pharmacy included? Nothing on screen says. (In code this report sums completed payments on clinic bills only; pharmacy sales are not in it.)
6. Click `Generate Report` to be sure → Button reads "Generating..." and the same figures return (the button repeats what the date change already did).
7. Open the `Export` dropdown and choose "Excel" → A file downloads. The dropdown now displays "Excel".
8. Click the "Payment Analytics" card → Loads "Total Payments", "Total Amount", "Successful", "Failed", a second "Payment Mode Breakdown" and "Reconciliation Summary" (Total Transactions / Reconciled / Pending / Rate). The mode split repeats the Revenue Report's.
9. Click the "Doctor Performance" card → "Total Doctors", "Active Doctors", "Departments", and a "Doctor Performance" list with completion rate per doctor.
10. Click the "Inventory Report" card → "Total Items", "Total Value", "Low Stock", "Out of Stock", "Top Selling Items", "Low Stock Alerts". This card is pharmacy stock, on a page whose revenue card is clinic-only.
11. Click `Pharmacy Report` in the sidebar → Landing page.
12. Click the "Sales Register" card → Opens already on "Last month (October 2026)"; reads the headline "Total for the period" and notes it down as pharmacy sales.
13. Click breadcrumb "← Pharmacy Report", then menu › Others › "Daily Sales Summary – Doctorwise" → Opens on "This month (November 2026)" — unlike the GST reports, this one does not default to last month.
14. Change Period to "Last month (October 2026)" and click `Go` → "Sales by doctor" with each doctor's share; headline "Total sales". This is pharmacy sales by prescriber; step 5's "Top Performing Doctors" was clinic revenue by doctor. Two doctor-wise money tables, different money.
15. Breadcrumb back, menu › Accounting Reports › "GST Summary & Monthly P&L" → Heading "GST Summary & Monthly P&L", then a second heading "Pharmacy Compliance" ("Posted GST and monthly reports for the current branch"), then cards "GST Summary" and "Monthly Report". No Period presets, no `Go`, no `Print`/`Download`; each card has `Refresh`.
16. In "GST Summary" set "Start date" to 01-10-2026 → Both cards blank to "Loading…" and reload at once (changing one date re-runs every loader on the page).
17. Set "End date" to 31-10-2026 → Reloads again. Reads "Input GST", "Output GST", "Net payable", the "Purchase Slabs" and "Sales Slabs" tables and "GST source records".
18. In "Monthly Report" set "Month" to October 2026 → Reloads. Reads "Procurement", "Sales", "Gross profit", "Stock at cost", "Write-off", "Stock at MRP", "Margin", and the caveat "Stock valuation is the current snapshot. Historical cost is unknown for n movements / adjustments…".
19. Click `Export all source rows` beside "Monthly source records" → A CSV downloads (the only export on this page).
20. Breadcrumb back, click the "Item Wise Margin Report" card → Defaults to 1 November – today.
21. Set "From" 01-10-2026, "To" 31-10-2026, click `Go` → Reads "Total Profit" and compares with step 18's "Gross profit"; they are computed differently (item-level sale minus cost vs monthly P&L with write-offs), and nothing on either screen links the two.
22. Breadcrumb back, menu › Stock Reports › "Expiring Stock" → "Within 3 months" list with "Value at cost"; compares with the "Expiry Alerts" count from step 2 (a 30-day window capped at 10) and "Low Stock" (which there means out of stock with a minimum set).
23. Click `Daily Collection` in the sidebar → Today's collection. "Whole day" tiles: Whole day / Clinic / Pharmacy; "Clinic: consultations and procedures" tiles; "Pharmacy" section.
24. Type `31/10/2026` in the "Day" box → Loads 31 October (stepping back with `Previous day` would take 13 clicks). `Today` button appears.
25. Compare "Clinic received" with what the Revenue Report would show for that single day, and "Pharmacy billed today" with Sales Register for that day → Same money, three screens, three labels ("Total Revenue", "Clinic received", "Total for the period").
26. Click `Download` → "PDF" → Day sheet saved for the owner.

#### Variations
- **Manager (MANAGER)**: same route; sees Reports and Pharmacy Report, and with the audit grant can record a pharmacy count.
- **Owner**: has no Pharmacy Desk in the sidebar, so the desk `Sales` metric is not available as a cross-check.
- **Doctor**: the server admits DOCTOR to `/reports/*`, but the sidebar has no Reports entry; the bell's `View reports & alerts` is the only way in.
- **Appointment and patient numbers**: "Appointment Analytics" (Completed / Cancelled / No Show, "Peak Hours", "Room Utilization") and "Patient Analytics" (New / Returning, "Gender Distribution", "Most Frequent Patients") on the same page.

#### Edge Cases
- **Export of the same format twice**: the `Export` control is a select that fires on change, so choosing "Excel" again right after an Excel export does nothing (as read from the code).
- **Report or export fails**: errors are only written to the console; the page shows "No data available for the selected period" or simply no download.
- **Alert counts stop at 10**: the alerts endpoint returns at most ten items of each kind and the strip shows the list length.
- **"JSON" export** is offered to office staff alongside CSV / PDF / Excel.
- **Date pickers**: this journey used four kinds — native date inputs (Reports, Margin, GST Summary), a month picker (Monthly Report), Period presets with dd/mm/yyyy text boxes (Sales Register, Doctorwise), and the day stepper (Daily Collection).

### STORY-111: Admin onboards a new pharmacist and later issues him a reset code

**Type**: long
**Topic**: Reports, users & clinic administration
**Persona**: Kavitha Nair, clinic administrator (ADMIN); new hire Farhan Qureshi joins Monday
**Goal**: Create Farhan's account as Pharmacist, make sure he can open Pharmacy Report and record the daily count, and two days later get him back in after he forgets his password
**Preconditions**: Kavitha is signed in as ADMIN (user writes are OWNER / ADMIN on the server, plus DOCTOR which passes every role gate but has no Users entry; a MANAGER sees the same buttons but the server refuses); Farhan's phone 90001 23456 and e-mail are not already in use
**Ideal path**: 9 — open Users (1), `New User` (1), six fields (6), `Create` (1), with the role's default grants applied automatically; reset = 2 more (open, create code).
**Alternate paths**:
- Change a role: "Edit User" dialog › Role select, or "Role & Permissions" dialog › Role select + `Apply Role` (two places, different option order).
- Reset a password: only Users › `Reset password` (no e-mail self-service; the API `POST /users/:id/change-password` has no UI).
- Reach a user: header search "Staff" results link to `/dashboard/users?search=<id>`, which the Users page ignores (per discovery) — the list is unfiltered.

#### Steps
1. Click `Users` in the sidebar (Admin group) → Page header "Users Management", then a second heading "Users" ("Manage users, roles, and statuses"), buttons `Clinic Holidays` and `New User`, and a card "All Users" with columns Name, Email, Role, Status, Actions. No search box or filter; up to 100 users are listed.
2. Click `New User` → Dialog "Create User".
3. Type `Farhan` in "First Name".
4. Type `Qureshi` in "Last Name".
5. Type `farhan.q@linaeclinic.in` in "Email".
6. Type `9000123456` in "Phone".
7. Open "Role" (defaults to "Receptionist") and choose "Pharmacist" → Options are Admin, Doctor, Nurse, Receptionist, Manager, Pharmacist; there is no Owner, Accountant or Lab tech.
8. Leave "Status" on "Active" (other options: Inactive, Suspended, Pending).
9. Type `Linae1` in "Password (8-20 chars)" and click `Create` → A browser `alert()`: "Password must be 8-20 characters". Click OK; the dialog is still open with the fields kept.
10. Retype the password as `Linae@2026` and click `Create` → Dialog closes, the form resets and the table reloads. No success message; she scans the table for "Farhan Qureshi … PHARMACIST … ACTIVE" (role and status are shown as raw codes).
11. In Farhan's row click `Role & Permissions` → Dialog "Role & Permissions": left, a "Role" select showing "Pharmacist" with `Apply Role` and `Clear All`, and "Permissions — Selected: n"; right, permission checkboxes grouped by resource (e.g. "pharmacy", "inventory", "billing"), each group with `Select all` / `Clear`. The ticks shown are the Pharmacist role's defaults, not what is saved on Farhan's own record.
12. Scroll to the "pharmacy" group, look for `pharmacy:compliance:read` (needed to open Pharmacy Report) and tick `pharmacy:compliance:audit` so he can save the daily count (names as used by the report controller; their presence in the list is unverified) → "Selected" count goes up. Permission names are raw `resource:action` strings, truncated with a tooltip.
13. Click `Save Permissions` → Browser `alert()`: "Permissions updated successfully!". Click OK.
14. Close the dialog (X or Esc) → Back on the table. She did not need `Apply Role` (the role was set at creation) but hesitated over it because it sits above the permissions.
15. Tell Farhan his sign-in (phone or e-mail + the password) in person.
16. Wednesday: Farhan is locked out. Kavitha opens `Users` again and finds his row by eye.
17. Click `Reset password` in his row → Dialog "Reset password for Farhan Qureshi": "Only issue a code to Farhan Qureshi after confirming in person that they are asking. Anyone with the code can set this account's password." and "Issuing a code cancels any earlier code for them. It is recorded in the audit log."
18. Click `I have confirmed who is asking. Create code` → Button reads "Creating code…", then an 8-character code in large type with "Give this code to Farhan Qureshi in person. It works once and expires …" and "This code is shown only once. Closing this window does not cancel it; issuing another code does."
19. Click `Copy code` → Code is on the clipboard (no "Copied" feedback), and she reads it out to him.
20. Close the dialog.
21. Farhan, on the sign-in page, clicks "enter your reset code" → `/reset-password`, "Set a new password".
22. He types the code in "Reset code", a new password in "New password" and again in "Confirm new password", and clicks `Set new password` → Success message, then automatic return to `/login` (per discovery); he signs in.

#### Variations
- **New doctor**: Role "Doctor" adds two row buttons, `Working Hours` (dialog "Availability: Dr. …") and `WhatsApp Settings`. `Clinic Holidays` (top of the page) opens a dialog listing upcoming holidays with a From / To / All day / "Reason (optional)" form and an `Add clinic holiday` button.
- **Promote later**: `Edit` → Role "Manager" → `Save`; or `Role & Permissions` → Role "Manager" → `Apply Role` → `alert("Role updated to MANAGER successfully!")`, which also swaps the ticks to the Manager defaults (still to be saved with `Save Permissions`).
- **Accountant**: cannot be created here — "Accountant" is not in either role list although the role exists and has sidebar entries.

#### Edge Cases
- **Blank phone**: `alert("Phone number is required")`.
- **Duplicate e-mail / phone or other server refusal on create**: the request fails with no message in the dialog (the submit handler has no error branch); the dialog just stays open.
- **Manager clicks any of these buttons**: the server returns 403; create/edit/delete show nothing, role and permission saves show "Failed to update role. Please try again." / "Failed to update permissions. Please try again.", and Reset password shows the error text in its dialog.
- **Resetting a peer or senior**: "You cannot reset the password of a user at or above your role."
- **Password rules differ**: 8–20 characters here, 8–72 on the reset page.
- **Guide vs screen**: the page's Quick Guide says "Click 'Add User'", lists roles "Therapist" and "Owner", says "Edit user information by clicking on a user row" and "View user activity" — none of which match the screen.
- **Empty list text**: "No users found — Try a different search or add a user using the form above." (there is no search and no form above).

### STORY-112: Admin deactivates a receptionist who has left

**Type**: short
**Topic**: Reports, users & clinic administration
**Persona**: Kavitha Nair, clinic administrator (ADMIN), last working day of receptionist Anjali Verma
**Goal**: Stop Anjali's account from being used while keeping her name on past records
**Preconditions**: Signed in as ADMIN; Anjali Verma exists with Status ACTIVE
**Ideal path**: 2 — a status switch on the row (1) and a confirmation (1).
**Alternate paths**:
- `Delete` on the row → browser `confirm("Delete user?")` → permanent removal (refused by the server for a user with appointments or visits as the doctor).
- `Role & Permissions` → `Clear All` → `Save Permissions` (removes extra grants but leaves the account active).
- The API has `PATCH /users/:id/status`; the screen does not use it (status goes through Edit).

#### Steps
1. Click `Users` in the sidebar and find "Anjali Verma" by scanning the table → No search to narrow the list.
2. Click `Edit` in her row → Dialog "Edit User" with her details; there is no password field in edit mode.
3. Open "Status" and choose "Inactive" → She hesitates between "Inactive" and "Suspended"; nothing explains the difference.
4. Click `Save` → Dialog closes, table reloads, her Status cell reads "INACTIVE". No confirmation message.

#### Variations
- **Temporary block**: Status "Suspended" by the same route.
- **Remove a mistaken account**: `Delete` → OK in the confirm → row disappears.

#### Edge Cases
- **Deleting a doctor with history**: server answers "Cannot delete user with existing appointments or visits"; the page shows nothing and the row stays (the delete handler has no error message).
- **Cancel**: `Cancel` closes the dialog, but the form keeps the edited values until another row's `Edit` or a successful save resets it — clicking `New User` straight after shows "Edit User" with Anjali's details still loaded (as read from the code: the form is only reset after a successful submit).
- **Raw codes**: Role and Status columns show `RECEPTION`, `INACTIVE` while the dialogs say "Receptionist", "Inactive".

### STORY-113: Admin sets up a doctor's WhatsApp confirmations and a message template

**Type**: long
**Topic**: Reports, users & clinic administration
**Persona**: Kavitha Nair, clinic administrator (ADMIN), setting up automatic appointment confirmations for Dr. Meenakshi Rao before Monday's OPD
**Goal**: Turn on WhatsApp confirmation for the doctor's appointments, create a clinic-wide confirmation template, test it on her own phone, and point the doctor's settings at it
**Preconditions**: Signed in as ADMIN; Dr. Meenakshi Rao exists with role DOCTOR; WhatsApp Cloud API credentials and `OPENAI_API_KEY` are configured on the server; Kavitha's phone is +91 98480 12345
**Ideal path**: 8 — open a WhatsApp settings page (1), switch confirmations on (1), `New template` (1), generate draft (1), save (1), send test (2: number + send), choose the template from a list for the doctor (1).
**Alternate paths**:
- The doctor herself: header cog › "My Settings" → the same two switches ("Send WhatsApp on appointment creation", "Use WhatsApp Template") plus an "Approved Templates" dropdown of saved appointment-confirmation templates; it has no phone-number-ID / token fields and no link to the template editor.
- Template editor: reachable only through Users › a doctor row › `WhatsApp Settings` › "Templates" `Manage`. No other entry found (doctors may manage templates on the server, but have no Users page).

#### Steps
1. Click `Users` in the sidebar and find the row "Meenakshi Rao … DOCTOR" → Doctor rows have two extra buttons: `Working Hours` and `WhatsApp Settings`.
2. Click `WhatsApp Settings` → Dialog "Doctor WhatsApp Settings" with four boxed sections.
3. Switch on "Send WhatsApp on appointment creation" ("Automatic confirmation to patients when this doctor is assigned.") → Note beneath: "Requires backend WhatsApp credentials. Uses text messages by default."
4. Leave "Doctor WhatsApp Phone Number ID" and "Doctor WhatsApp Access Token" blank (both "Optional"; the token box is never prefilled — "Leave blank to keep existing").
5. Switch on "Use WhatsApp Template" ("Recommended for messages outside the 24h window.") → Two free-text boxes appear: "Template Name" (placeholder "e.g., appointment_confirm") and "Language Code" (placeholder "e.g., en, en_US, hi"). No list of saved templates to choose from in this dialog.
6. Realising there is no template yet, click `Manage` in the "Templates" box → A second dialog, "WhatsApp Template Editor", opens over the first: left "Existing Templates" ("No templates yet.") with `New`; right the form.
7. Type `appointment_confirm` in "Name" (placeholder "e.g., Appointment Confirmation").
8. Leave "Touchpoint" on "Appointment Confirmation" (others: Appointment Reminder, Invoice Share, Prescription Share) and "Language" on `en`.
9. Change "Ownership" from "My Template" to "Branch Template (Admin)" so every doctor can use it; leave "Active" on.
10. Type `Linaé Skin, Hair & Aesthetic Clinic, Hyderabad. Sign off as Team Linaé.` in "Generator Hints (optional)" and click `Generate` → Button shows "Generating…", then a toast "Template generated — Review and save if it looks good."; the "Designer (WYSIWYG)" box and "Plain Text (fallback)" fill with a draft containing `{{patient_name}}`, `{{appointment_date}}` and so on.
11. Click into the designer after the time and click the variable chip `{{queue_token}}` → The token is inserted at the cursor; plain text updates to match. (`B` / `I` / `U` buttons format the selection.)
12. Click `Save Template` → Browser `alert()`: "Template saved". Click OK → The template appears on the left as "appointment_confirm — appointment_confirmation • en • Branch".
13. Look at "Send Test" → The `Send Test` button is disabled: the form is still an unsaved "new" form. Click `Edit` on the new row in "Existing Templates" → The form reloads from the saved template and `Send Test` becomes enabled.
14. Type `+919848012345` in "Test Phone (E.164)" (placeholder "+15551234567") and click `Send Test` → Green text "Test sent (check your WhatsApp)". The side note warns "Variables will be sent blank unless you extend UI mapping; backend will still accept." — the test message arrives with empty placeholders.
15. Click `Close` in the editor → Back in "Doctor WhatsApp Settings", which was open underneath.
16. Type `appointment_confirm` in "Template Name" and leave "Language Code" as `en` → She has to retype the name exactly; nothing checks that it matches the template she just saved.
17. Click `Save` → Dialog closes, list reloads, toast "Saved — WhatsApp settings updated".

#### Variations
- **Doctor does it herself**: cog › "My Settings" → switches → pick from "Approved Templates" ("Selecting from saved templates avoids name and language mismatches.") → `Save`. If none are active: "No active appointment templates were found. You can still enter the template name and language manually."
- **Per-doctor sender number**: fill "Doctor WhatsApp Phone Number ID" (e.g. `104857392018374`) and paste a token; only an admin can do this, only from Users.
- **Personal template**: Ownership "My Template" — listed as "• Mine".
- **Edit or remove later**: `Edit` / `Delete` on a row in "Existing Templates" (`confirm("Delete this template?")`).

#### Edge Cases
- **Template mode on, name blank**: toast "WhatsApp settings incomplete — Choose a WhatsApp template or turn template mode off."
- **Bad language code**: "Use a valid WhatsApp language code, such as en, en_US, or hi."
- **Save with no name or text**: `alert("Name and Plain Text are required")`.
- **Placeholder not in the variable list**: `alert("Add these variables or remove placeholders: …")`.
- **Test before saving**: `alert("Save the template before sending a test")`; no number: `alert("Enter a phone number in E.164 format (e.g., +15551234567)")`. A failed send shows the server message in red.
- **`New` changes Ownership silently**: opening the editor defaults Ownership to "My Template", but clicking `New` resets it to "Branch Template (Admin)" (as read from the code).
- **Switches that do not stick**: "Active" is not sent when a template is first created (only on update), and "Ownership" is not sent on update, so neither can be changed at those points (as read from the code).
- **`Add` variable button**: the button reads the focused element, which after the click is usually the button itself, so it adds nothing; pressing Enter in the "Add variable (letters/numbers/underscore)" box is the route that works (as read from the code).
- **Generation unavailable**: toast "Generation failed" with the server message.
- **Two names for one thing**: "Template Name" here expects the approved WhatsApp template's technical name; the editor's "Name" suggests a human title ("Appointment Confirmation").

### STORY-114: Admin takes a database backup before the stock take

**Type**: short
**Topic**: Reports, users & clinic administration
**Persona**: Kavitha Nair, clinic administrator (ADMIN), Saturday evening before a full stock count
**Goal**: Make a full backup of the clinic database and know that it succeeded
**Preconditions**: Signed in as ADMIN or OWNER (the card is hidden for everyone else, and the server refuses DOCTOR too)
**Ideal path**: 2 — click `Create Backup` (1), read an on-page result with time and size (1).
**Alternate paths**: none found (no backup list, no download, no schedule in the UI; `GET /auth/backup/:jobId` exists on the server with no screen).

#### Steps
1. Click `Dashboard` in the sidebar and scroll to the "Admin Controls" card ("Administrative tools and system management") → Row "Database Backup — Create a complete backup of the database" with `Create Backup`, and the warning "⚠️ Backups are stored locally on the server and contain sensitive data."
2. Click `Create Backup` → Button shows a spinner and "Creating...". The server queues a background job and answers straight away with a job id.
3. Read the browser `alert()` → The page expects a `backup` object with timestamp, directory and size ("✅ Database backup created successfully! … Backup saved to local server directory."), but the server reply contains only `success` and `jobId`; as read from the code, the alert that appears is "❌ Backup Failed" followed by a script error, even though the job was queued. Click OK.
4. Look for confirmation → Nothing on the page shows whether a dump was written, where, or when the last one was taken.

#### Variations
- **Owner**: identical.
- **Guide**: the Dashboard `Quick Guide` has an "Admin Controls" section: "Create database backups from the admin controls section", "Backups are stored locally on the server", "Regular backups are recommended for data safety".

#### Edge Cases
- **Not admin / owner**: the card is not rendered; a direct call returns "Insufficient permissions. Admin access required."
- **Dump fails later** (e.g. database container not reachable): the job file is marked FAILED on the server; the UI never learns of it.
- **Repeat clicks**: the button is disabled while the request is in flight, but each later click queues another full dump.

## Redundancy Candidates

Built from every story's **Alternate paths** field, the `## Redundancy notes` section of each topic file under `docs/ux-paths/topics/`, and the "Redundancy Leads" (A–D) in `docs/ux-paths/discovery.md`. Items are ordered from the care-to-cash spine outward (patient → appointment → visit → prescription → pharmacy sale → inventory → reports → administration). Item ids (DP = duplicate path, DI = duplicate information, OF = overlapping feature, ND = naming drift) exist only so a later critique can refer to them. Nothing here was walked in a browser; qualifiers such as "(per code)", "(inferred)" and "(unverified)" are carried over from the story writers.

### Duplicate paths (same goal, multiple routes)

**Patient, appointment and front desk**

- **DP-01 Find and open a patient**: via header global search (`Patient` result); Patients page search → row click or `View` (two controls, one destination); doctor Dashboard `My Patients`; Appointments patient search on the Calendar tab and again on the Slots tab; Visits setup type-ahead; Procedures "Patient *" select (first 100 patients, no search); Sales bill `Patient *` search — **divergent**: `My Patients` and the Patients page open the record, the header search opens the Patients list seeded with the internal ID and shows "No patients found" (per code), the others only select the patient for a task; debounce is 300 / 500 / 250 ms and only some state the 2-character minimum. (STORY-004, 009, 013, 014, 017, 021, 026, 042, 051, 073; `auth-shell-dashboard.md`, `patients.md` redundancy notes; `components/layout/header.tsx`, `components/dashboard/DoctorPatientPanels.tsx`; discovery lead D)
- **DP-02 Create a patient**: via Patients `New Patient` → "Create Patient" → `Create` (16 controls, no required markers, no success toast); Appointments `+ Add "…" as a new patient` → "Add New Patient" → `Create Patient` (8 controls, required markers, toast), mounted on both the Calendar and Slots tabs and opening by itself on the first empty search — **divergent** field sets, titles and feedback; neither checks for an existing phone. (STORY-011, 012, 019, 022, 031; `PatientsManagement.tsx`, `PatientQuickCreateDialog.tsx`; discovery A.1)
- **DP-03 Book an appointment**: via Appointments › Calendar tab; Appointments › Slots tab; Patients "Create Patient" (and, per code, "Edit Patient") with `Patient Type` = Walk-in + a doctor; patient detail `Book appointment` and tracker `Book` (same `?patientId=` link) — **divergent**: the Slots tab drops the Procedure Name and shows a toast and a banner; the walk-in route picks the slot itself (today + 7 days) and reports it only in a toast. (STORY-012, 018, 021, 022, 025, 026, 031; `AppointmentsCalendar.tsx`, `AppointmentScheduler.tsx`; discovery A.2)
- **DP-04 Confirm an appointment**: via "Appointment Details" `Confirm` / `Move to Scheduled`; via `Reschedule` and a click in the other column — same server call (`POST /appointments/:id/reschedule` with `calendar`), different toasts ("Appointment confirmed" vs "Appointment rescheduled"). (STORY-023, 024; `appointments-rooms.md` redundancy notes)
- **DP-05 Open appointment details / reschedule / start the visit from a tile**: tile click, hover `INFO`, long-press on a full tile → details; hover `RESCHED` vs details `Reschedule`; hover `START` / `CONT` vs details `Start Visit`; all repeated on the Slots tab — same result; hover buttons vanish on narrow tiles. (STORY-023, 024, 027, 041; `CalendarColumn.tsx`, `DoctorDayCalendar.tsx`)
- **DP-06 Reach the Appointments page**: sidebar; Dashboard `View All Appointments`; bell items; header-search `Appointment` results — same plain page; none carries the date, doctor or appointment. (STORY-004, 009, 021, 031)
- **DP-07 Open the consultation bill dialog**: row billing chip; "Appointment Details" → `Create bill` / `Open bill` / `View bill` (details reachable by name click or `INFO`); both again on the Slots tab — same dialog. (STORY-032, 033, 034, 035, 040; `clinic-billing-fees.md` redundancy notes)
- **DP-08 "Bill" actions that look like consultation billing but open the pharmacy bill**: patient tracker `Bill` / `Invoices`; `/dashboard/billing`; `/dashboard/pharmacy?section=billing`; bell "Overdue Invoice INV-…" (a clinic invoice linked to `/dashboard/pharmacy/sales?pay=CREDIT`) — **divergent**: none reaches a clinic bill; the only real route is the appointment row. (STORY-018, 039; `PatientProgressTracker.tsx`, `app/dashboard/billing/page.tsx`, `header.tsx`; discovery C)
- **DP-09 Reach the fee list**: sidebar "Fee list"; `Set fees` link inside Create bill (only when no fee is set and the viewer is OWNER / ADMIN; discards the open bill); direct URL — same page. (STORY-036, 040)
- **DP-10 Remove a duplicate patient**: manual `More` → `Archive` vs the 6-hourly server job `merge-duplicate-patients` — **divergent**: the job re-points appointments and visits, the manual archive moves nothing; no manual merge. (STORY-016, 019; `patient-deduplication.service.ts`)

**Visit and prescription**

- **DP-11 Start or resume a visit**: calendar tile `START` / `CONT`; "Appointment Details" › `Start Visit`; the same two on the Slots tab; Patients row `Start Visit`; patient detail `Start new visit` / `Resume last visit`; tracker `Start Visit` / `Continue` / `Prescribe` / `View` (also embedded in the visit form header); Visits setup `Start Visit Documentation`; Dashboard `Recent Visits`; history card `Resume session`; doctor bell item; `/dashboard/prescriptions` redirect; Procedures `Save Procedure` (creates a visit) — **divergent**: only the appointment routes link the visit to the appointment; routes without `doctorId` / `visitId` / `appointmentId` open under the first doctor in the list; the bell link is ignored without `patientId`; tracker `Continue` and `Prescribe` / `View` are the same href. (STORY-009, 017, 018, 027, 041, 042, 043, 045, 050, 051; `visits-procedures.md`, `patients.md` redundancy notes; discovery A.3)
- **DP-12 Save the visit**: `Save Draft`; Ctrl/Cmd+S; autosave (only after the first save); `Mark Vitals Complete`; `Save Labs`; prescription create / export — same write; two of them are also the only way to tick a completion section. (STORY-045, 048, 049; `MedicalVisitForm.tsx`)
- **DP-13 Record vitals**: visit `Vitals` tab (8 fields + pain score) vs Prescription › "Clinical Details & Vitals" (5 fields) — synced, but only the Vitals-tab button marks the section complete. (STORY-044, 045, 062; discovery A.5)
- **DP-14 Enter the diagnosis**: Prescription › "Diagnosis" box vs "On Examination" › "Dermatology Diagnoses" chips — merged on save; only the box drives treatment suggestions. (STORY-045, 057, 062; `PrescriptionBuilder.tsx`)
- **DP-15 Order investigations**: visit `Lab Tests` tab (fixed 31-item list, results, photo autofill) vs Prescription › "Investigations" (same list plus clinic-saved and custom; this is what prints) — **divergent**: separate state during a session (inferred). (STORY-045, 047, 062; discovery A.6)
- **DP-16 Record a procedure**: `/dashboard/procedures` (saved as a visit); Prescription › "Procedures" / "Procedure Planned"; appointment type Procedure with "Procedure Name" — **divergent** stores; Fitzpatrick skin type is likewise entered in "On Examination" and in Procedures › "Skin Type Assessment". (STORY-026, 051, 062; discovery A.4)
- **DP-17 Add photos**: visit `Photos` tab vs patient detail `Uploads` tab (same `VisitPhotos`, `visitId="temp"` → unattached); within the tab `Upload` / `Camera` (header) duplicate `Choose Files` / `Take Photo` (empty state); three delete controls for one action. (STORY-017, 044, 046)
- **DP-18 Fill the medicine table**: per-row search; `Recent meds:` chips; `Reuse last meds`; auto-applying "Treatment suggestions" learned plan; Templates dropdown; free-text typing; `+ Add to Drug Database` — overlapping: `Reuse last meds` and the plan's "Auto-filled from this patient's last similar plan" do largely the same job. (STORY-052, 053, 056, 057, 062; `prescriptions.md` redundancy notes; `lib/prescription-learning.ts`)
- **DP-19 Set frequency and duration on a row**: per-row dropdowns; `Presets:` chips (apply to the last-focused row); `+ Custom...`; plus regimen defaults at three levels (per-medicine "Suggested · Accept", whole-plan autofill, templates), each with its own accept / undo vocabulary. (STORY-052, 056, 057)
- **DP-20 Save something as a template**: `Save current`; `Save fields`; `New template` — three buttons side by side with different scope. (STORY-056)
- **DP-21 Save the prescription**: footer `Create Prescription` (opens "Go to Pharmacy?"); preview `Save Prescription` (does not); implicit saves inside `Print`, `Download PDF`, `PDF via WhatsApp`, `Email` — same record; `Email` alone demands a prior explicit save. (STORY-053, 055, 058, 059, 061, 062)
- **DP-22 Hand a prescription to the pharmacy**: dialog `Yes, go to Pharmacy` (sends `prescriptionId`); footer `Go to Pharmacy` (sends `visitId`, does not save first); patient tracker `Bill` / `Invoices`; Counter queue table `Bill`; cockpit `Open bill` / `Bill` / `Collect payment`; Sales bill queue `Load`; or no click at all (the saved prescription appears in the queue) — **divergent** payloads. (STORY-018, 055, 062, 064, 066, 074; `PharmacyInvoiceBuilderFixed.tsx`; discovery A.7)
- **DP-23 Set prescription letterhead / margins / print format**: letterhead in "My Settings" upload, visit `Customization` ("Print Background Image URL" + `Choose File`, `Save Doctor Default`), preview `Letterhead` select; margins in preview sliders, Customization px inputs, `Printer profile`, built-in letterhead minimum (precedence slider > printer profile > Customization); print format select in both the builder footer and the preview. (STORY-059, 060; `prescriptions.md` redundancy notes; discovery A.19)

**Pharmacy counter and sales**

- **DP-24 Open the Sales bill for the active prescription**: cockpit header `Bill`; footer `Open bill`; Pick + Pay `Collect payment`; `Start billing` (no active item); `Walk-in bill` (empty queue) — five labels, one handler (`openActiveBilling`); plus the queue table `Bill` and the bill page's `Load`. (STORY-064, 066, 068; `PharmacyCounterCockpit.tsx`)
- **DP-25 Start a pharmacy sale**: Sales `New sale`; Sales register empty-state `New sale`; Pharmacy Desk `New sale`; cockpit `Walk-in bill` / `Start billing`; legacy `/dashboard/billing` and `/dashboard/pharmacy?section=billing|invoices|payments`; Inventory › Sales › `Counter sales` › `New document`; Inventory › Sales › `Quotations` › `Create sale draft` — **divergent**: the last two create a different document type that also sells stock. (STORY-068, 073, 082; `sales-bill-model.ts`; discovery A.9)
- **DP-26 Substitute an out-of-stock medicine**: cockpit `Sub` (flag and shared reason only) and again `Substitute` on the bill line — **divergent**: nothing chosen in the cockpit reaches the bill. (STORY-065, 074)
- **DP-27 Mark a dispense task ready**: automatic when the last line is accepted; manual `Ready` button — same status. (STORY-064)
- **DP-28 Link a prescribed medicine to inventory**: queue table `Link item` / `Change link`; link control in the bill's "Linked Prescription" box (STORY-074 variation; dialog "Link <name>", apparently the same one) — same result; the cockpit shows "No inventory match" but offers no link. (STORY-067, 074)
- **DP-29 Take payment on a pharmacy bill**: confirm in the builder (one payment, full total, chosen method); "Pharmacy Invoices" list `Mark as Paid` / `Retry Payment` (only route for a later due; recorded in the bill's original method); cockpit `Collect payment` (only opens a bill) and `Paid` (sets a status, takes no money) — **divergent**. (STORY-064, 073, 080; discovery A.11)
- **DP-30 Browse pharmacy bills**: Sales register; `/dashboard/pharmacy/invoices`; Inventory › Sales › "Patient invoice history" (same `PharmacyInvoiceList`); Pharmacy Report › Sales Register / Sales Bills — **divergent** defaults (financial year vs "Today" vs last month), content (only the register includes counter sales and returns) and actions. (STORY-076, 077, 080, 081, 107; `pharmacy-sales.md` redundancy notes; discovery A.10)
- **DP-31 Get a copy of a finished bill**: register print icon; finished bill view `Print`; invoice list `View Invoice` / `Download Invoice`; `Reopen confirmed invoice` → preview — **divergent** paper: confirm-time print uses the builder's A5 layout (HSN, batch, GST split, copy type), reprints use `lib/pharmacy-invoice-print.ts` without them. (STORY-073, 076, 081)
- **DP-32 Resume or remove a draft bill**: register Draft row; invoice list `Continue in Sales`; `?draft=<id>` URL; remove with `Discard draft` (builder) or `Delete Invoice` (list; same server call, also offered on finished bills). (STORY-075, 081)
- **DP-33 Record a customer return**: Sales › Returns › `New return` vs Inventory › Sales › `Customer returns` › `New document` — same `WorkflowDocumentEditor`; only the back target differs. Price-only correction uses `Edit discount` + `Record refund` instead. (STORY-078, 079)
- **DP-34 Open the discount editor**: register `%` icon (`?bill=<id>&edit=discount`) vs finished view `Edit discount` — same dialog. (STORY-078)
- **DP-35 Refresh the Counter**: cockpit `Refresh`; empty-state `Pull visits` (same function); table header refresh icon; per-row refresh icon (reloads the whole table); automatic reload on window focus; Desk `Refresh` and Partner Daily Sync `Refresh` are separate again. (STORY-063, 064, 066)
- **DP-36 Move between Desk and Counter**: two sidebar items; Desk tile `Pharmacy Counter`; cockpit `Daily close` (→ Desk); `Back` on the Drugs and Invoices pages (→ Desk). (STORY-063, 071, 081)
- **DP-37 Go to Inventory from the pharmacy**: Desk tile `Inventory Control` (`?tab=pharmacy-control`); cockpit `Inventory control`; cockpit `Shelf locations` (`&section=shelf`) — all three land on Inventory › Today because `tab` / `section` are not read. (STORY-063, 065, 094; discovery D)
- **DP-38 Retry partner stock**: row `Retry outstanding` vs panel `Retry these outstanding units` — same `commitStock`. (STORY-071)

**Inventory: purchases and payables**

- **DP-39 Bring stock in**: `Scan or enter bill` (OCR); `Type instead`; `Import CSV`; `Gmail intake`; `Automatic import` › `Import & Add Stock`; Inward challan › `Create linked purchase bill`; purchase order › `Receive remaining stock`; `Manual opening stock`; `Opening stock import` (Excel); `Add batch` then `Edit stock` — **divergent**: only bill routes create a payable; the opening-stock and edit routes do not. (STORY-084, 085, 093, 096, 103, 104; discovery A.13)
- **DP-40 Start a new purchase bill**: Today `Scan or enter bill`; task strip `Scan or enter bill`; register `New purchase`; empty-register `New purchase`; denied-register `Scan or enter a bill`; workbench `New invoice`; Today row "Original files awaiting intake" — same workbench. (STORY-084; `inventory-purchases.md` redundancy notes)
- **DP-41 Post a purchase bill**: `Confirm reviewed values & add stock` / `Confirm & post bill`; `Add stock` / `Post bill` on a reviewed bill; `Mark Reviewed` then a colleague's `Add stock`; `More options` › `Save & Process`; `Import & Add Stock` — five verbs for the final act. (STORY-084, 085, 093; `PurchaseInvoiceWorkbench.tsx`)
- **DP-42 Re-run the product check in the workbench**: `Refresh Matches` and `Retry product check` call the same function; `Resolve line N product` and `Fix products on this invoice` both only scroll to the matching card. (STORY-084)
- **DP-43 Resume unfinished purchase entry**: "Saved unfinished intake"; "Saved uploads (n)"; "Recent invoices (n)"; register Payment status `Not posted`; Today "Purchase invoices to review" and "Original files awaiting intake"; per-tab local recovery — **divergent**: `Save draft` silently writes one of two record types and only one appears in the register. (STORY-085)
- **DP-44 Find a purchase bill**: Purchase bills register; Suppliers › row `Bills`; `Payments & dues` allocation table; "Recent invoices (n)"; Pharmacy Report › Purchase Register / Purchase Bills (no link to the bill); Stock ledger / item page links. (STORY-086)
- **DP-45 Create a supplier**: Purchases › `Suppliers` › `Add supplier` (10 fields) vs workbench `Save verified supplier` (name + GSTIN); none from inside the Terms wizard. (STORY-084, 091)
- **DP-46 Fix a posted purchase bill**: header text "open the batch below" (→ `Edit stock` / `Edit price` approval; payable unchanged); "Invoice history and documents" › `Correct posted purchase` › `Start linked return`; `Return to supplier` (same destination); `Record linked supplier credit`; Stock › `Corrections`, counts, `Loss & breakage` — **divergent**, and two instructions on one screen disagree. (STORY-088; `PurchaseDocumentActions.tsx`)
- **DP-47 Start a supplier return**: Purchase bills › Returns › `New return`; bill `Return to supplier`; bill `Correct posted purchase` › `Start linked return`; Stock › `Stock optimization` › `Create return draft`; item page `Supplier returns`; unlinked "Supplier returns" workflow register › `New document`; Stock-strip link "Supplier returns are now in Purchase bills › Returns". (STORY-088, 089, 101, 102; discovery A.15)
- **DP-48 Record a supplier credit note**: Returns row link `Record credit note`; button inside the return document; Today "Credit notes awaited"; `Credits & vouchers` › `Record credit note` — **divergent**: the last creates a standalone Credit note document, a different record type. (STORY-089)
- **DP-49 Set off a supplier credit**: Returns row `Set off`; toast `Set off ₹… now`; distributor strip `Set off all ₹…` (both tabs); `Mark paid` dialog banner (two variants); `Credits & vouchers` › `Set off against bills`; the same panel inside `Payments & dues`; again in a bill's `Eligible supplier credits`; return-document notice button — eight entry points, one `SetOffCreditDialog`. (STORY-087, 089, 090)
- **DP-50 Pay a supplier**: register `Mark paid` (full amount only, typed dd/mm/yyyy date, "₹") vs `Payments & dues` › "Bulk Payment Allocation" (only place for part or multi-bill payments; native date picker, "Rs", raw mode codes) — **divergent** capability and formatting. (STORY-087, 090; discovery A.16)
- **DP-51 Reach the purchase ledger**: `More tasks…` › `Payments & dues`; register `More` ▾; register footer "Outstanding in these N bills"; Today row "Overdue supplier bills" and button `Check overdue supplier balances`; Suppliers › `Account & dues`. (STORY-090)
- **DP-52 Undo a money entry**: 30-second `Undo` (cell and toast); ledger `Reverse payment` / `Reallocate payment`; credits panel `Reverse allocation` (native `prompt()`); document `Correct by reversal` — four mechanisms with different reach and time limits. (STORY-087, 089, 090)

**Inventory: stock and reorder**

- **DP-53 Add a medicine / product**: Drug database `Add New Drug`; prescription builder `+ Add to Drug Database`; Inventory `Add batch` → "Add Inventory Item" (approval for non-approvers, zero stock); workbench `Create new item` while posting a bill; opening-stock Excel; AI assistant proposal "Add medicine"; Terms wizard `Add "…" as typed` (unlinked) — **divergent**: some create a drug without a batch, one creates a batch through approval, the assistant writes directly. (STORY-062, 070, 072, 084, 091, 096, 104; discovery A.12)
- **DP-54 Change a batch's quantity**: `Edit stock` on the list row or item page (approval); three count entry points → `Approve and adjust stock`; `Loss & breakage` (posts at once, no approval); item ledger `Correct` → `Post linked correction` (approvers only); `Manual opening stock`; linked supplier return — **divergent** controls for the same shelf reality. (STORY-088, 098, 099, 100, 101; discovery A.14)
- **DP-55 Start an on-demand count**: Stock counts `Count an item`; stock list `Count selected batches` / `Count matching batches`; item page `Count this batch` — same `POST /inventory/workspace/counts`. (STORY-100)
- **DP-56 Open a count, the approvals or the settings**: count via Today "Stock count due today", `My counts` › `Start counting`, "Open Stock counts" links; approvals via Today "Counts awaiting your approval", `Approvals` tab, `History`, `Next count`; settings via `Settings` tab, "Turn it on in Settings", Today "Batches not counted this cycle". (STORY-099)
- **DP-57 Set minimum / maximum / reorder level**: "Add Inventory Item" › Stock Levels; item `Edit item` › More details; item `Set stock alert` (same form, different focus); Reorder › `Manual targets & exclusions`; Reorder › `Target proposals` › `Accept selected`; opening-stock Excel. (STORY-097, 103)
- **DP-58 Set a shelf location**: item editor "Rack / shelf"; stock list bulk `Set location for N selected batches`; purchase bill `Set location & discount`; "Add Inventory Item" "Storage Location". (STORY-065, 088, 096, 097)
- **DP-59 List batches with missing data**: "Data quality" strip chips (`gap=`); `Filters` › "Missing information" (`missing=`); `Filters` › "Product mapping" = Unmapped; typing `MISSING` into the HSN / GST boxes. (STORY-097; `inventory-stock-reorder.md` redundancy notes)
- **DP-60 Reach the approval queue**: sidebar badge → Inventory → Stock → `Approve corrections`; Today row "Price/stock edits awaiting approval"; notice link `Open approval queue`; legacy `/dashboard/inventory-updates` — same screen, but it can open on the wrong inner tab. (STORY-096, 098)
- **DP-61 Read an item's movements**: Stock › `Stock ledger`; item page `Ledger` tab; item tabs Sales / Purchases / Purchase returns / Sales returns / Blocked stock; Today "Recent activity" — **divergent**: the same pharmacy bill opens in the invoice list from one ledger and in the Sales bill view from the other. (STORY-095)
- **DP-62 Reach an item page**: stock list row; Stock ledger product link; Pharmacy Report › Item Wise Margin item name; posted purchase line; "Batch recovery reference" link. (STORY-094, 108)
- **DP-63 Open the low-stock / expiry / overdue lists**: Today queue row and a button directly beneath it for each (`Check low stock`, `Check next 3 months' expiry`, `Check overdue supplier balances`); stock-list "Stock level" / "Expiry" selects; header bell (dead `?tab=` link → Today); Pharmacy Desk tile (same dead end); Pharmacy Report › Expiring Stock; Stock optimization; AI assistant question. (STORY-005, 063, 072, 101, 109; discovery A.20)
- **DP-64 Choose a shortbook supplier**: "Supplier" select in the document form and "Supplier" + `Save supplier` in the "Supplier recommendation" panel, on the same page. (STORY-103)
- **DP-65 Raise a shortage / create a purchase order**: Shortbook `Add manual request`; `Sync shortages`; "Sync accepted targets to Shortbook"; Automation "Automatic PO drafts"; order via shortbook `Create purchase order` or directly `Add purchase order`. (STORY-103)
- **DP-66 Cancel a purchase order**: `Cancel document` (toolbar) vs "Cancel remaining quantities" › `Cancel remaining units` (delivery panel) on the same page. (STORY-103)
- **DP-67 Receive against an order**: order page `Receive remaining stock`; Today "Orders awaiting receipt"; Inward challans › "Purchase order" select; posting the supplier's bill; an unreachable `Receive against order` in `WorkflowRegister`. (STORY-103)

**Reports, settings and shell**

- **DP-68 Open Daily Collection**: sidebar Overview › `Daily Collection`; Pharmacy Report "Common reports" card; left menu › Accounting Reports; report search; bookmark — same `?report=daily-collection`. (STORY-003, 038, 040, 105, 110; `components/layout/sidebar.tsx`, `report-catalog.ts`)
- **DP-69 Read the pharmacy sales total for a period**: Sales register footer; Pharmacy Report › Sales Register / Sales Bills / Day wise Summary / Daily Sales Summary – Doctorwise; GST Summary & Monthly P&L "Sales"; Pharmacy Desk `Sales` metric (today); invoice-list tiles (current page only); Daily Collection — each computed by a different endpoint. (STORY-077, 105, 107, 110; discovery A.21)
- **DP-70 Export a sales list**: none on the Sales register; Pharmacy Report `Download`; Reports & Analytics `Export` (clinic revenue only). (STORY-077, 107, 110)
- **DP-71 Read the GST position / pharmacy profit**: GSTR-3B "Payable in cash" vs GST Summary "Net payable"; Item Wise Margin "Total Profit" vs Monthly Report "Gross profit" — **divergent** calculations with similar names. (STORY-106, 108, 110)
- **DP-72 List supplier bills in reports**: Purchase Register; Purchase Bills; GSTR-2A; GSTR-2B — four reports over the same documents; "Sales Bills" and "Purchase Bills" are one report with a Type toggle under two menu entries; HSN summary appears as "HSN wise GST" and as GSTR-1 Table 12. (STORY-086, 106, 107)
- **DP-73 Export a patient list**: Patients `Export CSV` vs Reports › `Patient Analytics` › `Export` (aggregates only; partial overlap). (STORY-020)
- **DP-74 Set a doctor's hours, leave and overbooking**: header "My Settings" (doctor, own) vs Users › `Working Hours` → "Availability: Dr. …" (admin, any doctor; same `DoctorAvailabilitySettings`); holidays separately via Users › `Clinic Holidays`. (STORY-006, 029, 111; discovery A.17)
- **DP-75 Set a doctor's WhatsApp confirmations**: header "My Settings" (switches + "Approved Templates" dropdown) vs Users › `WhatsApp Settings` (switches + free-text template name, phone-number ID, token) — **divergent** controls; the clinic-wide Template Editor is reachable only from inside one doctor's dialog. (STORY-006, 113; discovery A.18)
- **DP-76 Change a user's role / stop a user**: role via "Edit User" Role select or "Role & Permissions" › `Apply Role` (differently ordered lists); stop via `Edit` → Status, `Delete`, or `Clear All` permissions; the API's `PATCH /users/:id/status` is unused. (STORY-111, 112)
- **DP-77 Get help on a page**: header `Start Tour` (RECEPTION only, a different tour per pathname); page-header `Quick Guide` dialogs; the Appointments page's own in-page "Quick Guide"; calendar legend; `Visit Workflow Tour`; `Shortcuts`; two different "Visit Documentation Guide" dialogs. (STORY-007, 045; discovery A.22)
- **DP-78 Arrive at the sign-in form / return after sign-in**: `/`, any `/dashboard/*` without a cookie, `/login`, `Back to sign in`; return path via middleware `?next=`, client 401 handler `?next=`, an unread `localStorage` key `cms_next_after_login`, and `router.replace('/login')` without `next` in `dashboard-layout.tsx`. (STORY-001, 003; `auth-shell-dashboard.md` redundancy notes)
- **DP-79 Regenerate a Reports & Analytics report**: selecting a card or changing a date already regenerates; `Generate Report` repeats it. (STORY-110)

### Duplicate information (same fact, multiple surfaces)

**Patient and visit**

- **DI-01 Past visits / patient history**: shown on patient detail `History` tab; Visits setup `Patient History` tab; visit form `History` tab; visit form "Patient Context" › "Recent Visits"; doctor Dashboard `Recent Visits`; Procedures `Procedure History`; "Other saved photos". (STORY-017, 050; `usePatientHistory.ts`, `PatientHistoryVisitCard.tsx`; discovery B)
- **DI-02 Patient identity**: on the record page as header badges, summary card and `Info` tab (phone, e-mail, gender, age, ABHA each twice or more); in the visit as sticky identity bar, "Patient Context" card and setup "Ready to start visit" line; raw internal id in search dropdowns and context card. (STORY-017, 042, 045)
- **DI-03 Next appointment**: summary card "Next appointment" (always `Not scheduled`, per code) vs tracker badge `Upcoming appt` — the two can disagree on one page. (STORY-017, 018)
- **DI-04 Visit progress**: header text, header mini-bar, `Overview` › "Progress Summary", footer text — plus the unrelated six-step patient tracker on the same screen; the tracker itself appears on the record (full) and the Visits page (compact). (STORY-018, 045)
- **DI-05 Appointment link, visit number, photo count, role**: "From Appointment" and "Linked to Appointment" badges together; visit number and status in the header card and `Overview`; photo count in header badge, card title and a hard-coded `Overview` "Photos Captured: 0"; role in setup "Your Role & Permissions", setup "Available Features", form header and `Overview` "Captured By". (STORY-041, 042, 045)
- **DI-06 Vitals values**: `Vitals` tab and Prescription "Clinical Details & Vitals" ("Heart Rate" vs "Pulse (bpm)"). (STORY-045, 062)
- **DI-07 Photos**: record `Uploads` tab, visit `Photos` tab, "Other saved photos", history card thumbnails. (STORY-017, 046; discovery B)
- **DI-08 Follow-up interval**: "Follow-up Instructions" text and "Review Date", with chips on both that only partly keep each other in sync. (STORY-057)
- **DI-09 Prescription builder counters and stock**: "Total items" above the table and in the footer with different numbers; stock for a medicine in the search row, the "Stock:" hint and the cell tooltip; one save reported up to three times ("Prescription created", then "Prescription updated" per export). (STORY-052, 061, 062)

**Appointments and consultation bills**

- **DI-10 Today's / upcoming appointments**: Dashboard card (today; 5 rows, full day for doctors); bell (next 48 h); Appointments calendar; Rooms calendar — different detail, none linking to a specific appointment. (STORY-009, 031; discovery B)
- **DI-11 Scheduled / Confirmed explanation**: card description, Legend, each column header, Quick Guide dialog. (STORY-021)
- **DI-12 Overbooking and blocked time**: overbook shown as tile tag "Overbook n/m", server refusal and "Overbook this slot?" dialog; blocked time as page banner "Not bookable: …" and dialog alert "Cannot book …". (STORY-021, 025)
- **DI-13 Room occupancy and legends**: Rooms calendar, booking-dialog room cards, Appointments `Room` filter, room name on the tile; two legends (Appointments, Rooms) for the same visit-type colours from different colour sources. (STORY-026, 028, 031)
- **DI-14 Booking success on the Slots tab**: toast "Appointment Booked Successfully" plus banner "Appointment Successfully Booked!". (STORY-026)
- **DI-15 Clinic bill state and bill type**: state on the row chip, "Appointment Details" ("Bill: …"), the bill dialog (summary line, badge, Total / Received / Due) and Daily Collection "Clinic bills"; bill type as a word on the row, in the chip label, "Bill type:" in details, the dialog description and the fee hint. (STORY-035, 040; discovery B)
- **DI-16 Clinic total in Daily Collection**: tile "Clinic", tile "Clinic received", the Clinic column of "Whole day by payment mode" and the "Clinic … by payment mode" table. (STORY-038)

**Pharmacy**

- **DI-17 Prescription queue**: cockpit "Queue" column (8 newest); "Prescription Queue" table directly beneath it; the same table at the top of every new Sales bill. (STORY-064, 066, 073, 074; discovery A.8)
- **DI-18 Stock for the active prescription on the Counter page**: review table (`Stock` + `Shelf and batch`), "Scan next" card, "Pick Assist" list, and the `Stock` column of the table below; batch / expiry / shelf repeat in three of them. (STORY-064)
- **DI-19 Queue size, exceptions and lifecycle in the cockpit**: queue size as header `Queue`, "N today or open" and "x-y of N prescriptions"; exceptions as header counter, Queue tile and "Pick + Pay · n exceptions" (a different number); lifecycle as badge, 8-pill rail, queue chip and six checklist tiles. (STORY-064, 065)
- **DI-20 Pharmacy sales totals for a day**: Desk `Sales` metric, Sales register footer, invoice-list tiles (current page only), Daily Collection "Pharmacy billed today", Sales Register "Total for the period", Day wise Summary, Doctorwise "Total sales", Reports & Analytics revenue (clinic only, unlabelled). (STORY-077, 105, 110; discovery B)
- **DI-21 Pharmacy bill status**: register state (Final / Draft / Cancelled); invoice-list chips (Draft / Pending / Confirmed / Dispensed / Completed / Cancelled + payment status); finished view badges (Paid / Due / Refund due / Cancelled). (STORY-075, 080, 081)
- **DI-22 Patient on the bill form and in the confirm preview**: "Patient *" search field and "Billing Name *" / "Phone *"; invoice number, patient and total in preview header badges and again in the side panel. (STORY-073)

**Inventory**

- **DI-23 Low stock / expiry / overdue alerts**: Dashboard `System Alerts`; header bell; Reports & Analytics alert strip; Inventory Today queues; Pharmacy Desk "Stock … low"; stock-list filters; Pharmacy Report › Expiring Stock — different wording and thresholds (alerts: 30 days, capped at 10; Expiring Stock: 3 months; Today: 3 months; "Low Stock" means stock ≤ 0 with a minimum in the alerts but stock ≤ minimum in Inventory Report). (STORY-005, 063, 101, 109, 110; discovery A.20)
- **DI-24 Pending approvals count**: sidebar badge and task label `Approve corrections (n)` (new-item requests); Today row "Price/stock edits awaiting approval (n)" (price / stock edits, number printed twice); `New items` tab badge — three counters that do not count the same thing. (STORY-096, 098; discovery B)
- **DI-25 Batch quantity**: stock list row; "Show cost & stock details"; item header ("Current stock … held … available"); item `Batches` table and footer; closing balances in both ledgers. (STORY-094, 095)
- **DI-26 Item master data**: "Item details" strip and the `Information` tab on the item page. (`inventory-stock-reorder.md` redundancy notes)
- **DI-27 Count results**: Today card, Approvals register, record header, sticky footer and decision dialog restate the same short / extra figures. (STORY-099)
- **DI-28 Reorder document rendered by two components**: for a shortbook request or purchase order the page mounts `WorkflowDocumentEditor` and `ReplenishmentCenter` together — two headings, two status explanations, two supplier controls, two cancel actions. (STORY-103)
- **DI-29 Supplier credits and distributor position**: a credit appears in the Returns register, `Credits & vouchers`, the panel inside `Payments & dues` and `Eligible supplier credits` in each bill; "Due − Credit held = Net payable" appears as the register strip, ledger "Distributor Summary" and ledger "Outstanding" tile. (STORY-086, 089, 090)
- **DI-30 Purchase bills and overdue payables**: bills listed in the register, "Recent invoices", Pharmacy Report purchase reports and the ledger allocation table; overdue payables on the Today row, Today button, ledger tiles / alerts, register filter and header bell. (STORY-086, 090)
- **DI-31 Workbench status and guidance**: stock state in the top pill, bottom bar, scan cue and notices; the next-step sentence in "Finish this purchase", "Finish invoice review" and the bottom bar. (STORY-084)
- **DI-32 Agreed terms**: `Terms of Trade` table; blue "Agreed terms with …" panel in the workbench; per-line "Agreed: … / Invoice: …" hints. (STORY-084, 091)

**Reports, shell and headings**

- **DI-33 Payment-mode split and doctor-wise money**: mode split in Daily Collection, Revenue Report "Payment Mode Breakdown" and Payment Analytics "Payment Mode Breakdown"; doctor-wise money in "Daily Sales Summary – Doctorwise" (pharmacy) and "Top Performing Doctors" / "Doctor Performance" (clinic). (STORY-110)
- **DI-34 Dashboard status figures**: "System Status" as a stat card and as a permanent `System Alerts` row; `Total Users` and `Active Users` are the same server count (likewise branches). (STORY-007, 009; `auth.controller.ts` `getStatistics`)
- **DI-35 Signed-in user and `Branded` toggle**: user name in the header and in the sidebar footer; `Branded` on the login page and in the header. (STORY-001, 007)
- **DI-36 Stacked page titles**: "Patients Management" → "Patients" → "Patient Records"; "Users Management" → "Users" → "All Users"; "Room Management" → tab heading → "Rooms Management" → "All Rooms"; "Pharmacy Counter" twice; "Drug Management" + "Drug Database"; "Prescription Queue" + "Prescription dispensing queue"; "Pharmacy Invoices" twice; "Item Wise Margin Report" → "Item-wise Margin"; "Day wise Summary" → "Day-wise Summary"; "GST Summary & Monthly P&L" → "Pharmacy Compliance" → "GST Summary" / "Monthly Report". (STORY-011, 028, 064, 070, 081, 108, 110, 111; discovery B)
- **DI-37 Explanatory copy repeated**: fee page description and its locked empty state both explain that Create bill uses the fee; Reorder › Automation settings carries a sentence pointing to Stock counts › Settings; Visits setup "Your Role & Permissions" and "Available Features" say the same thing. (STORY-036, 042, 099)

### Overlapping features/tools

- **OF-01 Clinic bills and pharmacy bills both bill a patient under the words "bill" / "invoice"** — distinct enough to keep (no GST, one line, raised from the calendar vs GST, items, raised in Sales), but they share vocabulary, the patient tracker's "Billing" step reads one and opens the other, and overdue clinic invoices link to the pharmacy register; they meet only in Daily Collection. (STORY-018, 037, 038, 039; discovery C)
- **OF-02 Appointments Calendar tab and Slots tab both render the same two-column day grid** (`DoctorDayCalendar`) with separate copies of patient search, quick-create, filters and booking handler — not distinct: differences are incidental (Legend, Google controls, `Grid` only on Calendar; toast + banner, raw IDs and a dropped Procedure Name only on Slots). (STORY-021, 026, 031; `appointments-rooms.md` redundancy notes)
- **OF-03 Counter cockpit and the "Prescription Queue" table both list prescriptions and lead to the same bill** — the cockpit adds a recorded line review that the bill never reads, shows only the 8 newest, and uses a different status vocabulary; the table is the only complete list and the only place to link inventory. Distinctness is questionable while cockpit decisions are not carried over. (STORY-064, 065, 066, 067)
- **OF-04 Sales bill builder and Inventory › Counter sales both sell stock and land in the Sales register** — functionally distinct today (builder: registered patient required, server-chosen batch, prescription lines; counter sale: no patient, user-chosen batch and unit), but with two vocabularies and two payment-mode lists, and no shortcut from Sales to the second. (STORY-073, 082)
- **OF-05 Sales register, "Pharmacy Invoices" list, Inventory "Patient invoice history" and Pharmacy Report Sales Register / Sales Bills all list pharmacy bills** — the invoice list and "Patient invoice history" are the same component; actions are split so that no one surface is complete (discount / refund only in the finished view, collect a due and PDF download only in the invoice list, export only in Pharmacy Report). (STORY-076, 077, 078, 080, 081, 107)
- **OF-06 Reports & Analytics and Pharmacy Report both report money, stock and doctors** — partly distinct (clinic bills vs pharmacy), but "Inventory Report" sits in the clinic centre, the Revenue Report does not say it excludes pharmacy, "Daily Collection" (clinic + pharmacy) sits under Pharmacy Report, and Purchase costs stays in Inventory. (STORY-038, 092, 110; discovery A.21)
- **OF-07 Within Pharmacy Report, pairs of reports answer one question**: GSTR-3B vs GST Summary; Item Wise Margin vs Monthly Report; HSN wise GST vs GSTR-1 Table 12; Sales Bills vs Purchase Bills (one report); Purchase Register / Purchase Bills / GSTR-2A / GSTR-2B — statutory formats justify some; the unlabelled differences in calculation do not. (STORY-106, 107, 108, 110)
- **OF-08 Visit `Vitals` and `Lab Tests` tabs and the Prescription tab's "Clinical Details & Vitals" and "Investigations" sections both capture the same clinical data** — the tabs are the only surface for nurses and for results; the sections are the only ones that print. Complaints, history, examination and diagnosis exist only in the Prescription tab. (STORY-044, 045, 047, 062)
- **OF-09 Procedures page and the visit form both record a procedure, and the Procedures page saves a Visit** — the page has machine parameters the visit lacks, but its records appear as in-progress visits with no complaints and its history card reads fields it does not write. (STORY-051; `visits-procedures.md` redundancy notes)
- **OF-10 Templates, the learned plan ("Treatment suggestions") and `Reuse last meds` all prefill treatment** — overlapping; the learned plan can also source from templates ("saved order set") and from the patient's last plan. (STORY-053, 056, 057)
- **OF-11 Patient progress tracker and the visit's own progress bar both show "progress" on the visit screen** — different concepts (six-step care journey with a time-based "Complete" vs four tracked sections). (STORY-018, 045)
- **OF-12 Drug database and Inventory (stock list / "Add Inventory Item") both hold product master data** — a drug can exist without a batch and a batch is added through a form of about 40 fields titled "item"; the drug page's subtitle says "drug inventory" but shows no stock and links nowhere. (STORY-062, 070, 096)
- **OF-13 `Edit stock` (approval), stock counts (sign-off + approval) and `Loss & breakage` (immediate) all adjust quantity** — opposite controls for the same correction; `Block stock` also acts immediately. (STORY-098, 099, 101)
- **OF-14 Stock ledger and the item page ledger both list movements** — different vocabularies ("Method" / "Stock in · Stock out" / `Export CSV` vs "Type" / "In · Out" / `Download CSV`) and different link targets for the same bill. (STORY-095)
- **OF-15 Target proposals, Manual targets & exclusions and item `Set stock alert` all set min / max** — proposals are evidence-based and reviewed; the other two are manual; six sets of names for the levels (see ND-44). (STORY-097, 103)
- **OF-16 Purchase bills › Returns register and the generic "Supplier returns" / "Credit notes" workflow register both list returns** — the second has no menu entry and is reached only by pressing Back from a return opened without a `return` target. (STORY-088)
- **OF-17 `Mark paid` and "Bulk Payment Allocation" both record supplier payments** — distinct in capability (full single bill vs part / multi-bill) but inconsistent in currency symbol, date entry and mode labels. (STORY-087, 090)
- **OF-18 Supplier "Payment terms" (free text on the supplier) and "Terms of Trade" (per product) are unrelated things with near-identical names**; neither visibly drives a bill's Due Date. (STORY-091)
- **OF-19 Stock optimization, Expiring Stock report, stock-list expiry filter and Today's expiry queue all surface ageing stock** — only optimization knows returnability; results of a run are not saved or exportable. (STORY-101, 102, 109)
- **OF-20 Inventory › `Purchase costs` ("Distributor Analytics") and Pharmacy Report purchase / margin reports both analyse purchases** — old Inventory report links already redirect to Pharmacy Report; this one stayed. (STORY-092, 108)
- **OF-21 `Opening stock import` (Excel) and `Manual opening stock` both load opening balances** — the manual document only adds to a batch that already exists; an unmounted compact copy of the importer still exists in `PharmacyInventoryControl.tsx`. (STORY-104)
- **OF-22 Header "My Settings" and Users › `Working Hours` / `WhatsApp Settings` both edit a doctor's availability and WhatsApp** — same component for availability; different field sets for WhatsApp. (STORY-006, 029, 113)
- **OF-23 "My Settings" letterhead, visit `Customization` tab and the preview's right column all control print layout** — per-doctor server setting vs per-doctor profile vs per-visit draft, with a precedence users cannot see. (STORY-059, 060)
- **OF-24 Two renderers for one document**: prescriptions — the UI rasterises the on-screen preview while the server has unused PDFKit `POST /prescriptions/:id/pdf` and `:id/share` routes (`docs/PRESCRIPTION_PDF_PIPELINE.md`); pharmacy bills — the builder's inline A5 print vs `lib/pharmacy-invoice-print.ts`. (STORY-061, 076)
- **OF-25 Prescription-builder mic buttons and `/test-transcribe` both transcribe speech** — the test page has richer feedback (level meter, timer, playback, speaker tabs) than the production button and cannot send text to a visit. (STORY-054)
- **OF-26 `Start Tour`, `Quick Guide`, the Appointments in-page guide, `Visit Workflow Tour` and `Shortcuts` all explain screens** — several describe UI that is not there. (STORY-007, 011, 028, 044, 045, 063, 111)
- **OF-27 Dashboard `System Alerts`, the header bell and the Reports & Analytics alert strip all show the same `/reports/alerts` data** — only the bell tries to link, and its links are stale. (STORY-005, 009, 110)
- **OF-28 AI assistant `Apply` and the inventory approval queue both change medicines and stock** — the assistant writes directly from a page whose other stock edits wait for a doctor. (STORY-072, 098)
- **OF-29 Manual `Archive` and the automatic duplicate-merge job both remove duplicate patients** — the job is invisible and announces nothing. (STORY-016, 019)
- **OF-30 `/login` and `/reset-password` use two auth-card implementations** (only the first has the letterhead and `Branded`). (STORY-002)
- **OF-31 Components present but not mounted, duplicating live features**: `components/billing/BillingManagement.tsx` (clinic invoices with edit / refund), `pharmacy/PharmacyDashboard.tsx`, `pharmacy/PharmacyPackageManager.tsx`, `inventory/PharmacyInventoryControl.tsx` (+ `ShelfIntelligence.tsx`), `stock-prediction/StockPredictionDashboard.tsx`, `components/visits/VisitStateContext.tsx`; dead handlers in `AppointmentScheduler.tsx` (`startReschedule`, `handleStartVisit`), reorder buttons in `WorkflowRegister`, the `COUNT` branch of `WorkflowDocumentEditor.tsx`, `PhotosPanel` in `visits/page.tsx`. (STORY-037, 069, 103, 104; discovery D; `appointments-rooms.md`, `visits-procedures.md`, `inventory-stock-reorder.md` redundancy notes)
- **OF-32 Five filter-bar designs do one job across the report screens** — `ReportToolbar.tsx` (Period presets, typed dates, draft + `Go`, `Print`, `Download`), `ItemMarginReport.tsx` (native dates, `Go`, no Print), `DayWiseSummaryReport.tsx` (`Go` for dates but instant Type, state not in the URL), `ComplianceCenter.tsx` (instant reload, `Refresh`, CSV of source rows only), `reports/page.tsx` (instant reload plus `Generate Report`, select-style `Export`); default periods differ too (last month, this month, last 30 days, today). Not distinct by intent. (STORY-106, 107, 108, 110; `reports-admin.md` redundancy notes)

### Naming drift (one concept, several names)

**Money documents**

- **ND-01 Pharmacy bill**: "Sales" (sidebar), `New sale`, "New bill", "Add Items to Invoice", "Invoice Items", "Invoice Summary", `Confirm Invoice`, "Pharmacy Invoice Preview", "Bill No" / "Bill Amount" (register), "Bill PHI-…" (finished view), "Pharmacy Invoices" (list), "Patient invoice history" (Inventory), "Pharmacy Receipt" (counter-sale print), "pharmacy module" (hand-off dialog), cockpit "Bill" / "GST bill — Invoice ready" / badge "Invoice". (STORY-055, 064, 073, 081, 082; discovery C)
- **ND-02 Clinic bill**: "bill" (chip, dialog, fee list); `invoices` (API); `Invoices` (tracker button); "Overdue Invoices" / "Overdue Invoice INV-…" (alerts, bell); number prefix `INV-` vs pharmacy `PHI-`; in Daily Collection "Clinic" means consultations and procedures only, elsewhere the whole business. (STORY-038, 039)
- **ND-03 Unpaid**: "Due", "Due (unpaid)", "Credit", "Store credit" (returns), "Pending", "Partially Paid", "overdue invoice", "Still to collect". (STORY-077, 078, 080)
- **ND-04 Payment mode**: "Payment mode" (clinic dialog, report tables), "Paid by" (Clinic bills column), "Paid back by" (refund dialog), "Payment Method" (bill builder), `method` (API); option lists differ — clinic: Cash, UPI, Card, Net banking / NEFT, Cheque; builder: Cash, Card, UPI, Net Banking; refund: adds Wallet; register filter: adds Insurance, Due (unpaid), Other; counter sale / return: raw CASH, UPI, CARD, CREDIT; supplier dialog "NEFT / RTGS" vs ledger `NEFT`, `CHEQUE`; stored as `NET_BANKING` (clinic) and `NETBANKING` (pharmacy). (STORY-034, 038, 073, 078, 082, 087, 090)
- **ND-05 Amounts on a clinic bill**: `Fee`, `Paid now`, `Amount received`, "Total / Received / Due", "Amount / Received today / Due". (STORY-033, 038)
- **ND-06 Bill type**: "Review" (row, fee list) vs "Review consultation" (line); "First" vs "First consultation". (STORY-032, 035)
- **ND-07 Discount and tax in pharmacy**: "Discount %", "Item discounts" / "Item discount %", "Bill discount", "Disc%" (print), "Scheme ₹" (counter sale); "Tax %", "GST %", "GST pending", "GST rate needs review", "Rate excl. GST". (STORY-073, 078, 082)
- **ND-08 Sales return**: "Returns" (tab), `New return`, "Sales returns" (register), "Customer returns" (Inventory), "Sales Return" (print). (STORY-079; discovery C)
- **ND-09 "Sales Register"** names both the register on the Sales page and a GST report in Pharmacy Report. (STORY-077, 107)
- **ND-10 Draft removal**: `Discard draft` (builder) vs `Delete Invoice` (list). (STORY-075, 081)

**Clinical**

- **ND-11 Visit**: "Visit", "Visit Documentation", "Medical Visit Documentation", "session" (`Resume session`), "record" ("Most recent record", "n Records"), "consultation" (Dashboard), "encounter" (code). (STORY-009, 050; discovery C)
- **ND-12 Start / continue a visit**: `START`, `Start Visit`, `Start new visit`, "Start New Visit", `Start Visit Documentation`; `CONT`, "Continue Visit", `Continue`, `Resume last visit`, `Resume session`. (STORY-018, 027, 041, 042)
- **ND-13 Complete**: `Mark Vitals Complete` (a section), `Complete Visit`, `Complete` / `Pending` badges, tracker step "Complete" (a time heuristic), status `COMPLETED`; `DRAFT` is a UI-only status. (STORY-045)
- **ND-14 Consultation mode**: "Tele-video" (visit), "Telemedicine" / `TELEMED` (appointment, room type "Telemed" / "Telemedicine Suite"), "Online" (patient); "In-person" / "OPD" / "OPD Consultation" / "Offline (In-Clinic Visit)". (STORY-012, 026, 048; discovery C)
- **ND-15 "Type" fields**: `Consultation Type` (patient), `Appointment Type (walk-in)`, `Patient Type`, `Visit Type` (filter), `Appointment Type` (dialog), `Type` (details), `Consultation type` (visit). (STORY-012, 026)
- **ND-16 Investigations**: "Lab Tests", "Lab Tests (Investigations)", "Investigations", `Save Labs`, "Labs", "Lab orders". (STORY-047)
- **ND-17 Photos**: "Photos", `Capture Photos`, "Before / After Photos", "Uploads", "Unattached uploads", "Other saved photos", "visit photos". (STORY-017, 046)
- **ND-18 Vitals and units**: "Heart Rate" vs "Pulse (bpm)"; temperature entered in °F, labelled "Temperature (°C)" in history. (STORY-045, 050)
- **ND-19 Follow-up**: "Review Date", "Follow-up date", "Follow-up Instructions", "Follow-up", "Review". (STORY-057)
- **ND-20 Prescription write**: "Create Prescription", "Save Prescription", "Prescription updated", "Add medications to save"; "Prescription" / "Rx" / "prescription layout". (STORY-053, 061)
- **ND-21 Medicine**: "Medicine" (column), "medications" (toast), `+ Add to Drug Database`, "Total items", `Reuse last meds`, "Add Medicine", "Individual Drugs", "Search Drugs", "Invoice Items", "product", "batch". (STORY-052, 073; discovery C)
- **ND-22 Dosing columns**: "Frequency (0-1-0)" holds dose patterns; dialog "Add Custom Dose Pattern"; template dialog has separate "Dose pattern" and "Frequency"; "When" vs "Add Custom Timing". (STORY-052, 056)
- **ND-23 Learned plan**: "Treatment suggestions", "learned plan", "autofill", "quick-fill", "prefilled", "saved order set"; `Reuse last meds` / "Previous medications" / "last plan". (STORY-053, 057)
- **ND-24 Template**: prescription "Templates" / "Saved templates" / "Default templates" / "Fields template" vs WhatsApp message templates; WhatsApp "Template Name" (technical name) vs editor "Name" (human title); "My Template" / "• Mine", "Branch Template (Admin)" / "• Branch". (STORY-056, 113)
- **ND-25 Letterhead and preview**: "Prescription letterhead", "Print Background Image", "Letterhead", "Per-doctor Letterhead Profile", "(Custom)", a bundled option labelled with a hard-coded doctor name; "Print Preview" / "Prescription Preview" / "Live Preview"; "Detailed Examination" vs "General Appearance"; "Additional Advice" vs "Counseling"; `Reset to default` resets to empty. (STORY-056, 059, 060)
- **ND-26 Patient identifiers and actions**: `ID: <last 8>` / `ID: <full>` / `Patient Code` / `Code:` / "code" / `ABHA ID`; tracker step "Billing" → button `Bill` / `Invoices` → "Sales bill"; `Clear Filters` vs `Clear filters`; `Refresh` vs `Try Again`. (STORY-013, 017, 018)

**Appointments and rooms**

- **ND-27 Calendar / Scheduled / slot**: "Calendar" = a tab, the "Doctor Calendar" card, each column, Google Calendar, Rooms "Calendar View"; "Scheduled" = column, status and verb; `Grid` (Calendar tab) = `Duration` (Slots filter) ≠ `Duration` (booking dialog); "Slot" / "Time Slot" / "Time". (STORY-021, 026, 030)
- **ND-28 Confirm / cancel / reschedule**: `Confirm`, `Confirm Booking`, `Yes, Cancel Appointment`; `Cancel` (dismiss, abort, decline) vs `Cancel Appointment`; `Reschedule`, `RESCHED`, "Rescheduling …", "Moving … to Confirmed", `Move to Scheduled`. (STORY-023, 024)
- **ND-29 Rooms and availability**: "Rooms", "Room Management", "Rooms Management", "Room Configuration & Management"; `Working Hours` → "Availability: …" → "Weekly working hours (IST)"; "Leave and blocked time", "time off", "Clinic holiday", "Not bookable". (STORY-028, 029)

**Pharmacy desk and counter**

- **ND-30 Desk, counter and queue**: "Pharmacy Desk", "Command center", "Loading pharmacy dashboard…", "Pharmacy Management Guide"; "Pharmacy Counter", "Counter cockpit", "Queue", "Rx queue", "Prescription Queue", "Prescription dispensing queue", "Pull visits"; `Daily close` (opens the Desk) vs "Daily Collection" vs "Partner Daily Sync". (STORY-063, 064, 071; discovery C)
- **ND-31 Prescription status at the counter**: table `Pending / Partial / Dispensed / Expired`; cockpit chip `Queued / Review / Partial / Paused / Bill / Paid / Done / Cancelled`; rail `Queued / In Review / Partially Filled / Paused / Ready to Bill / Paid / Dispensed / Cancelled`; lane chips `Queue / Review / Exceptions / Done` — "Expired" (table) = "Paused" (cockpit), "Dispensed" = "Done". Stock state: `IN STOCK / LOW STOCK / OUT OF STOCK / UNMATCHED` vs `In stock / Low / Out / Not linked`. (STORY-064, 065, 066)
- **ND-32 Linking, unavailable, substitute**: `Link item` / `Change link` / "Link inventory" / "Confirm and remember match" / "Inventory Match"; `NA` / "Medicine unavailable" / "Partially Filled" / `UNAVAILABLE`; `Sub` vs `Substitute`. (STORY-065, 067)
- **ND-33 Drugs, packages, assistant**: `Drugs`, "Drug Management", "Drug Database", "drug inventory", "product master fields"; "Packages · bundles", "Treatment Packages", "pharmacy packages"; "Pharmacy AI assistant", "Agent unavailable", "Codex is working", "Codex assistant", "Chats" / "thread", "History" / "Archived". (STORY-069, 070, 072)
- **ND-34 Inventory entry from pharmacy**: "Inventory Control" (tile), "Inventory control" (button), "Shelf locations", "Inventory > Pharmacy Control" (guide; no such area). (STORY-063, 065)

**Inventory**

- **ND-35 Supplier**: "Suppliers", "Supplier credits & vouchers", "Supplier returns" vs "Distributor" (columns, filters), "Distributor Bill", "Distributor Analytics", "Find distributor"; reports mix "Supplier" column and "Distributor, bill no. or GSTIN". (STORY-091, 092, 102, 109; discovery C)
- **ND-36 Purchase bill**: "Purchase bills", `New purchase`, "Scan or enter bill", `New invoice`, "Invoice No.", "Finish this purchase", "Purchase invoices to review", "Purchase Ledger", ledger "Invoices". (STORY-084, 086, 090)
- **ND-37 Task name ≠ page title**: `Payments & dues` → "Purchase Ledger"; `Purchase costs` → "Distributor Analytics"; `Credits & vouchers` → "Supplier credits & vouchers"; `Import CSV` → "Import purchase CSV"; `Gmail intake` → "Invoice attachments from Gmail"; `Opening stock import` → "Start Pharmacy Inventory From Excel"; `Manual opening stock` → "Opening stock entries". (STORY-090, 092, 093, 104)
- **ND-38 Posting a purchase**: "Add stock", "Post bill", "Stock added", "Invoice posted", "Posted", "Not posted", "commit" / "Committed Items", "Save & Process", "Mark Reviewed"; "Reviewed" (register) = "Ready to add stock" (bill). (STORY-084, 086)
- **ND-39 Paying and set-off**: `Mark paid`, "Pay …", "Settle bill …", `Record payment`, `Record Payment`, "Bulk Payment Allocation"; "Set off", "Set off against bills", "allocated", `Reverse allocation`, "Adjusted", "Fully used", "applied", "Allocate to bill" (operator guide). (STORY-087, 089, 090)
- **ND-40 Supplier return**: "Returns" (tab), "Purchase returns", "Supplier returns", "Return challan", "Return to supplier", "Credit note awaited". (STORY-088, 089; discovery C)
- **ND-41 Catalogue and item**: "Inventory" (sidebar) vs "Stock" (area, Desk metric); "saved product", "catalogue", "drug master", "inventory", "item", "product list"; `Add batch` → "Add Inventory Item" → `Add Item`; "Product / batch"; `Edit item` → "Correct saved details". (STORY-084, 096, 097)
- **ND-42 Approval**: approver called "doctor", "doctor or admin", "manager", "doctor or administrator"; screen called `Approve corrections`, "Price / stock approval queue", "New item requests", "My item requests", "Inventory Updates"; `Corrections` is an unrelated task. (STORY-096, 098, 099, 103; discovery C)
- **ND-43 Stock counts**: "Stock counts", "Stock reconciliation", "Reconciliation", "cycle", "Count history", `audit` (URL key, permission), "Cycle count" / "stocktake" (discovery C); `Count an item` → "Count an item or a shelf" / "Count selected batches" / "Count this batch". (STORY-099, 100)
- **ND-44 Reorder and levels**: "Reorder", "Replenishment", "Shortbook", "Stock predictions", "Targets", "Stock optimization" (neighbouring feature); levels as "Set stock alert", "Minimum stock" / "Reorder at", "Min qty" / "Max qty", "Min Stock" / "Reorder Level" / "Reorder Qty", "Minimum" / "Maximum" / "Reorder level", "Missing min/max", "targets". (STORY-097, 102, 103)
- **ND-45 Location, hold, loss, cost, quantity**: "Location", "Rack / shelf", "Rack / shelf / bin", "Storage Location", "Shelf / location"; "Blocked stock", "Held", "Set aside", "Hold"; "Loss & breakage", "Stock loss"; "Purchase cost", "PTR", "Cost Price", "Rate excl. GST", "Landing price"; "Available", "Physical", "Current stock", "On hand", "Qty", "System". (STORY-094, 097, 101)
- **ND-46 Terms**: "Terms of Trade", "Agreed terms", "Trade terms" — beside the supplier's unrelated "Payment terms". (STORY-091; discovery C)
- **ND-47 Raw keys shown as labels**: filter chips "expiryMonths: 3 ×", "stock: LOW ×"; "POSTED"; actor / supplier / branch ids in Reorder; role and status codes `RECEPTION`, `INACTIVE` in Users; permission names `resource:action`; active-filter chip `PROCEDURE`. (STORY-026, 094, 103, 111, 112)

**Reports, administration and shell**

- **ND-48 Reports**: "Reports" (sidebar), "Reports & Analytics" (page), "Pharmacy Report" (singular), "Pharmacy Compliance" (inside one report); "Item Wise" / "Item-wise"; "Day wise" / "Day-wise" / "Daily"; `Download` vs `Export` vs `Export all source rows`; `More filters` vs `More Filters`; "Customer" / "Patient" / "Patient / customer". (STORY-107, 108, 110)
- **ND-49 Add / New / Create**: `New Patient` → "Create Patient" → `Create` (guide: 'Add Patient'); `+ Add "…" as a new patient` → "Add New Patient" → `Create Patient`; `New User` → "Create User" (guide: 'Add User'); `Add Room` → "Add New Room"; `Add New Drug` → `Add Drug`. (STORY-011, 022, 028, 070, 111; discovery C)
- **ND-50 Sign-in and reset**: "ClinicMS Login", `Sign in`, `Back to sign in`, `Log out`; `Reset password`, "Reset password for …", `enter your reset code`, "Set a new password", `Set new password`; password rule "8-20 chars" (create) vs "8 to 72 characters" (reset). (STORY-001, 002, 111)
- **ND-51 Settings, help, alerts**: "Open settings" (aria), "My Settings", "WhatsApp preferences updated"; `Start Tour`, `Quick Guide`, "Dashboard Guide", `Visit Workflow Tour`, "the help button"; `System Alerts`, "Notifications", `View reports & alerts`. (STORY-005, 006, 007)
- **ND-52 Roles**: `RECEPTION` (sidebar, table), "Receptionist" (tour, Users form), "front desk", "the desk"; "Therapist" / "Nurse/Therapist" in guides and permissions though the role enum has none. (STORY-007, 038, 044, 051; discovery C)
- **ND-53 Product name**: "ClinicMS" (login, sidebar, mobile bar) vs "Linaé" (tab title, letterhead). (STORY-007; discovery C)
- **ND-54 Stale copy**: workbench hint "choose Save & Process"; `docs/product/inventory-workflow-operator-guide.md` labels ("Purchase register", **Save & Process**, **Allocate to bill**, "Stock > Supplier returns"); translation note listing "Post‑procedure care"; "Save Fields as Template … on this device" vs "stored on server"; Slots card "Select a doctor and date…"; "Prescription Queue" pill "Validate before adding stock"; Users empty text "using the form above"; receptionist tour and Quick Guides (insurance, date of birth, room amenities, "View user activity", "Add Patient", "Double-Click to modify"). (STORY-007, 011, 026, 028, 056, 058, 066, 084, 111; discovery D)
- **ND-55 Sidebar label ≠ page title**: `Procedures` → "Smart Procedures Management"; `Reports` → "Reports & Analytics"; `Rooms` → "Room Management"; `Users` → "Users Management"; `Patients` → "Patients Management"; `Daily Collection` → breadcrumb "Pharmacy Report / Accounting Reports"; `Pharmacy Desk` → pill "Command center". (STORY-011, 028, 038, 051, 063, 110, 111)

## Gaps & Recommendations

### Features and flows in discovery not covered by any story

No story's own steps exercise these (a few are mentioned as an alternate path or variation, as noted):

- **Voice transcription test (`/test-transcribe`)** — variation of STORY-054 only. Discovery lead D calls it a developer test page; a story is worthwhile only if the page is meant to stay in the Admin sidebar.
- **Inventory › Purchases › `Gate passes`** — not mentioned in any story; discovery lists the task without describing its purpose.
- **Inventory › Purchases › `Inward challans`** — only a hand-off target (STORY-103 step 27) and a one-line variation (STORY-084). The receive → `Create linked purchase bill` leg that closes the reorder loop is untold.
- **Inventory › Sales › `Quotations`** — alternate path in STORY-082 only.
- **Inventory › Purchases › `Credits & vouchers`** as a starting point (standalone credit note, `Reverse allocation`) — alternates in STORY-087, 089, 090.
- **Inventory › Stock › `Corrections` register, `Manual opening stock`, `Print batch label`, resolve product identity, bulk location change, stock-list CSV export** — variations, edge cases or not mentioned (STORY-097, 098, 104).
- **Inventory › Reorder › `Manual targets & exclusions`, `Automation settings`, `Monitor`** — variations of STORY-103 only.
- **Visit › `Customization` tab** (paper preset, header / footer frames, design aids, print-section toggles, `Save Doctor Default` / `Load Doctor Default`) — touched from STORY-059 and 060 but never walked.
- **Users › `Clinic Holidays`** — variation of STORY-111; no story shows a holiday blocking the calendar. **Users › `Working Hours`** for another doctor — variation of STORY-029.
- **Patients › `Link portal` / `Unlink portal` and `WhatsApp` reminder** — variations of STORY-015; unlink is reported unreachable (per code).
- **Reports & Analytics › Patient Analytics, Appointment Analytics; JSON / CSV / PDF export** — variation of STORY-110.
- **Pharmacy Report › GSTR-2A, Composition GST Report, Purchase Register, Purchase Bills** — variations / alternates in STORY-086, 106, 107.
- **Roles as a subject**: no story follows a MANAGER (Users list without write access, Inventory without Sales, no Rooms) or an OWNER (no Pharmacy Desk / Counter entry) through their sidebar; these appear only as edge cases across topics. `LAB_TECH` and `PATIENT` have no UI.
- **Legacy and stale links as a subject** (`/dashboard/billing`, `/dashboard/prescriptions`, `/dashboard/stock-predictions`, `/dashboard/inventory-updates`, `?tab=` links, old Inventory report views) — variations in STORY-003, 039, 042, 063, 092, 096, 103, 106, 108.
- **Session expiry mid-task** — variations in STORY-003, 040, 049, 055, 063.
- **Small screens** — only STORY-010 is a phone story; booking, the bill dialog, the cockpit and the sales bill at phone width are single-line variations.
- **Google Calendar denied / error / disconnect** — edge cases and a variation of STORY-030.
- **Treatment package from creation to sale** — creation in STORY-069, use only as a variation of STORY-073; STORY-069 reports packages are private to their creator, so the cross-role path is unproven.

Features that cannot be covered because no UI was found (confirm, then decide whether they are product gaps):

- Clinic bill edit, void, refund, receipt, discount, multi-line bill, register / dues list (STORY-037; server routes exist).
- Appointment edit (type, room, procedure name, duration) and the Checked-in / No-show statuses (STORY-023, 026).
- Patient merge, archived-patients view, edit or archive from the record page (STORY-015, 016, 019).
- "Change my password" (API `POST /users/:id/change-password`), backup job status (`GET /auth/backup/:jobId`), audit log (STORY-002, 008, 114; discovery).
- Printer-profile creation, prescription refills (only a print stamp), server-side prescription share (STORY-059, 061).
- Treatment package edit / delete and a public switch (STORY-069); pharmacy bill cancellation (no control reported; STORY-076 shows only the cancelled state).
- Creating an Accountant, Owner or Lab tech user (STORY-111); changing a saved visit's doctor (STORY-043).
- 1mg drug data (discovery: no direct UI found, inferred).

### Suggested additional stories

1. **Receive a purchase order on an inward challan and raise the linked purchase bill** — closes STORY-103 → STORY-084 and exercises `Inward challans`.
2. **Issue a gate pass** — first establishes what `Gate passes` is for.
3. **Quotation to counter sale** — `New quotation` → `Create sale draft` → `Post sale`.
4. **Standalone credit note and a reversed allocation** from `Credits & vouchers`.
5. **Give a newly approved item its first stock and a label** — `Manual opening stock` → `Print batch label`, picking up where STORY-096 leaves the item at zero.
6. **Clinic holiday end to end** — admin adds a holiday, the receptionist meets "Not bookable", admin removes it.
7. **Doctor tunes the print layout in `Customization`** and confirms it in the preview on a second visit.
8. **A manager's day** — every sidebar entry, noting which actions the server refuses.
9. **An owner covering the pharmacy** — reaching Desk / Counter without a sidebar entry and collecting a due through Inventory › "Patient invoice history" (STORY-080 variation).
10. **Session expires mid-bill and mid-visit** — what survives in each.
11. **Old bookmarks and notification links** — one pass over every legacy redirect and `?tab=` link.
12. **Portal link and WhatsApp reminder** from the Patients list.
13. **Reorder automation** — `Automation settings` → `Run saved settings` → `Monitor`; and **manual targets with exclusions**.
14. **Front desk on a phone** — find a patient, book, bill, without the desktop header.
15. **Treatment package across roles** — doctor creates, pharmacist looks for it on a bill.
16. **Tidy the stock list** — data-quality chips, bulk location change, CSV export.

### Suspected defects noted by story writers (unverified, from code reading)

One line each, for a walker to confirm or dismiss. None of these was observed in a running app; where the story writer marked the point as derived, inferred or unverified, that is repeated.

**Sign-in, shell, dashboard**

- STORY-001: phone lookup is an exact match on stored digits, so a number saved without the country code fails when typed with it (derived).
- STORY-001: login errors distinguish "Account not found" from "Invalid password", and every API error carries a trailing `(Reference: <uuid>)`.
- STORY-001, 010: the identifier field uses `inputMode="email"`, so phones open the e-mail keyboard for a "Phone or email" field.
- STORY-001: a signed-in user who opens `/login` still sees the form.
- STORY-002, 111: `Copy code` gives no "Copied" feedback.
- STORY-002: `Reset password` is shown on every row and to MANAGER, but the server refuses peers / seniors and non-admins.
- STORY-002, 111: password length is 8–20 on user creation and 8–72 on reset.
- STORY-003: with a present-but-rejected cookie two redirects race and one drops the return path (derived); `cms_next_after_login` is written and never read.
- STORY-003: `/test-transcribe` is outside the middleware guard and renders without the shell.
- STORY-004, 014: a header-search `Patient` result opens the Patients list seeded with the internal ID, which the search does not match — "No patients found" (derived / per code).
- STORY-004: `Appointment` results open the bare calendar; `Staff` results pass a `search` parameter the Users page ignores; failed lookups look like "no results".
- STORY-005, 063, 101: links with `?tab=low-stock`, `?tab=expiry`, `?tab=pharmacy-control[&section=shelf]` land on Inventory › Today.
- STORY-005, 039: `View reports & alerts` and `…/sales?pay=CREDIT` send RECEPTION, PHARMACIST and ACCOUNTANT to pages missing from their sidebars; clinic "Overdue Invoice" items link to the pharmacy register.
- STORY-005 vs STORY-041: STORY-005 says the doctor's bell item lands on the specific visit; STORY-041 says `/dashboard/visits?appointmentId=…` is ignored without `patientId` and lands on the empty setup screen — the two stories disagree.
- STORY-005: a failed alerts request shows "No notifications".
- STORY-006, 029: the "My Settings" footer `Save` saves only the WhatsApp switches, and `Close` discards them without warning. STORY-060 describes the same button as saving "the working-hours and WhatsApp options" — the stories disagree on what it saves.
- STORY-006: for non-doctors the empty dialog's `Save` still writes WhatsApp metadata and toasts success (no role check).
- STORY-007: tour cards describe UI that is not there (stat cards, clickable appointment rows, "Add Patient", "Double-Click", date of birth, room assignment); tour "seen" flags are written and never used.
- STORY-007, 009: `Today's Appointments` rows and `System Alerts` rows are not clickable although the tour and Quick Guide say they are.
- STORY-007: if the profile loads without a role, the sidebar lists every navigation item.
- STORY-008, 114: `Create Backup` shows "❌ Backup Failed" although the job was queued (response-shape mismatch; derived); nothing reports the job's outcome and each further click queues another dump.
- STORY-009: `Total Users` and `Active Users` are one server count; the "No alerts at this time" state is unreachable; `Recent Visits` rows show no status.
- STORY-010: if the logout request fails (offline) the user is sent to `/login` but the cookie survives (derived).

**Patients**

- STORY-011, 022: `Gender` defaults to "Other" and saves silently; the full form marks nothing required and shows no success toast.
- STORY-011: a server validation error in the create dialog also replaces the table behind it (shared error state; per code).
- STORY-011, 013, 019: phone search is prefix-only and numbers stored with a country code are not found by the local number; `+91…` and bare numbers are stored as different strings.
- STORY-011, 019: neither create form warns about an existing phone number.
- STORY-012: Walk-in with no doctor chosen books nothing and says nothing; a "walk-in" can be booked up to 7 days ahead with only a toast; choosing Walk-in in "Edit Patient" books a new appointment (per code).
- STORY-013: the `Consultation` column shows "—" for everyone and `Last Visit` never renders (field-name mismatch; per code); column sort is per page only.
- STORY-013, 015: search and filters are lost on `Back` from a record.
- STORY-015: editing an Online patient silently resets them to Offline (per code); `First Name` holds the whole name; `Portal Linked` / `Unlink portal` are unreachable (per code); the unlink confirmation's toast action may not render (unverified).
- STORY-015: `WhatsApp` reminder sends immediately with no preview; numbers saved without `91` may be invalid addresses (per code).
- STORY-016: `Archive` acts with no confirmation; once the toast is gone there is no archived view or restore; an archived record still opens by URL with no marker.
- STORY-017, 018: `Next appointment` always reads "Not scheduled" (per code).
- STORY-017: history reloads on every window focus and collapses expanded cards (per code); photos uploaded from the record attach to no visit while the copy says "attached to this visit".
- STORY-018: tracker `Start Visit` carries no `appointmentId`; `Prescribe` is the same link as `Continue` and does not open the Prescription tab; the "Billing" step reads clinic invoices while its button opens a pharmacy bill.
- STORY-019: a manual archive leaves the booked appointment on the archived record (per code); the auto-merge job announces nothing; dismissing the auto-opened quick-create dialog clears the search text.
- STORY-020: CSV `Consultation Type` is blank and `Portal Linked` always "No" (per code); the patient code is not exported; the 10,000-row cap is silent.

**Appointments and rooms**

- STORY-021 vs discovery: discovery says the `Date` is remembered in `localStorage`; STORY-021 says only the doctor is and every load starts on today.
- STORY-021: a one-letter patient search lists ten unrelated patients (from code); a dragged range is not reflected in the dialog's Duration (from code); the patient stays selected after a booking.
- STORY-022: the quick-create dialog opens by itself mid-typing; a phone search puts the digits into `First Name` (from code); dismissing it wipes the search box.
- STORY-023: Checked-in and No-show are styled but no UI sets them (from code); `Cancel Appointment` is offered on in-progress / completed appointments and then fails.
- STORY-023, 027: NURSE sees `Confirm` / `Reschedule` / `Cancel Appointment` and RECEPTION sees `START`, all refused by the server.
- STORY-024: changing `Doctor` or tab mid-reschedule drops the move silently (from code); the room cannot be changed on reschedule.
- STORY-025, 031: the Scheduled and Confirmed columns do not conflict with each other, so one doctor time can be double-booked across columns with no prompt.
- STORY-026: the Slots tab does not send the Procedure Name (from code); its `Duration` filter is the grid step, not the appointment length.
- STORY-026: "No procedure rooms available — You can still book this appointment" while `Confirm Booking` stays disabled; several room types can never be chosen for a booking.
- STORY-028: a deactivated room (or one created inactive) disappears from Manage Rooms after reload and cannot be re-activated (from code).
- STORY-028 vs discovery: discovery lists a date control and room search on Calendar View; STORY-028 reports only day chevrons and `Today`, a fixed 09:00–18:00 grid, and an `Appointments` tile that ignores the type filter.
- STORY-029: nothing warns about patients already booked on new leave days; validation errors render far from `Save hours`.
- STORY-030: `Sync with Google Calendar` is shown to every role and connects the clicker's own account; `Disconnect` asks no confirmation.

**Consultation billing**

- STORY-032: `createInvoice` sends no idempotency key, so a second click in the brief post-save window could raise a second, uncancellable bill (inferred); at phone width an unbilled row's chip is empty (inferred).
- STORY-032: a receptionist whose create grant was removed is told "The front desk creates the bill."
- STORY-033, 040: the payment mode resets to `Cash` after every save; a past day's bill is reachable only by resetting doctor and date.
- STORY-034: no discount field (the dialog always sends `discount: 0`); the reference text is shared between Cheque and NEFT; an empty `Bill line` disables save with no message.
- STORY-034, 040: a fee changed by an admin is picked up only when the schedule reloads (inferred).
- STORY-035: `Add another bill` opens prefilled as a duplicate of the first bill; nothing warns of an identical bill.
- STORY-037: a wrong clinic bill cannot be edited, voided or refunded and no receipt can be printed; `DELETE /billing/invoices/:id` always fails; cancelling an appointment does not touch its bill (inferred).
- STORY-038: RECEPTION cannot open Daily Collection; ACCOUNTANT / PHARMACIST / MANAGER cannot see the clinic block; clinic cash has no count box.
- STORY-039: a consultation fee cannot be billed without an appointment row; `/dashboard/billing` leads to the pharmacy bill.
- STORY-040: `Set fees` navigates away and discards the open bill without warning.

**Visits and procedures**

- STORY-041: arriving on the form creates nothing; the calendar tile still says `START` until the first save.
- STORY-042, 043: the doctor defaults to the first doctor in the list, not the signed-in doctor; a visit saved under the wrong doctor cannot be reassigned.
- STORY-042: roles without their own entry (ADMIN, OWNER, MANAGER) are shown "Doctor — Full access"; a never-saved visit's local draft is unlikely to survive a reload (inferred); an existing in-progress visit is not offered.
- STORY-044: a nurse's `Mark Vitals Complete` is refused by the server, so her vitals never leave her browser; the setup screen promises a complaint field she does not get.
- STORY-044, 046: photos uploaded before the visit's first save go to the draft store and never attach to the visit (`onVisitNeeded` never called); progress then drops.
- STORY-045: `Complete Visit` needs all four tracked sections, including at least one photo and a `Save Labs` click even with nothing ticked; the shortcut's toast names different requirements.
- STORY-045: `Overview` "Photos Captured: 0" is hard-coded; a completed visit stays editable; the in-form tracker buttons navigate away to the previous visit.
- STORY-045, 050: section completion is kept only in the browser, so a visit reopened elsewhere shows 0 % and must be re-ticked.
- STORY-046: each camera batch pre-selects "Front" again; compare shows only the first photo per position.
- STORY-047: `Lab Tests` ticks and Prescription "Investigations" ticks are separate during a session (inferred); a test name returned by autofill that is not in the checklist cannot be removed; the comparison treats a blank previous value as 0.
- STORY-048: a Telemedicine appointment opens as "In-person"; autosave silently does nothing while consent is unticked.
- STORY-049: the only conflict recovery is to discard the local draft (which also clears the prescription draft); no autosave before the first explicit save.
- STORY-050: `View Prescription` exists only on the setup screen; temperature is entered in °F and labelled °C in history.
- STORY-051: the first patient is pre-selected and the list is unsearchable and capped at 100; `View Details` does nothing; `Load & Edit` restores three fields and creates a new record; saved sessions show no parameters in history; the Fotona table has two "Area" rows bound to one key; feedback is a native `alert()`.
- STORY-051: a saved procedure is an in-progress visit that cannot be completed from the page; MANAGER sees the page but is refused on save.

**Prescriptions**

- STORY-052: "Suggested · Accept" reads as not yet applied although the values are already in the row; preset chips and `Recent meds` act on the last-focused row; custom frequencies live in this browser only; Enter does not choose `Best Match`.
- STORY-053: the button stays "Create Prescription" on updates and reopens "Go to Pharmacy?" each time.
- STORY-054: the Chief Complaints mic may drop the doctor's own speech when speakers are separated (inferred); a failed transcription loses the recording.
- STORY-055, 062: footer `Go to Pharmacy` does not save first, so unsaved medicines are missing from the bill with no warning.
- STORY-056: applying a template overwrites the builder and clears histories, investigations and procedures with no confirmation; `Undo` / `Redo` track only medicine rows (Redo behaviour inferred).
- STORY-056: deleting a saved template is immediate and affects all doctors (inferred); a saved template loses the chosen dose pattern (inferred); `Reset to default` empties the table with no confirmation.
- STORY-057: the learned plan fills the table without a click; changing the diagnosis while the table is still as auto-filled replaces it silently (inferred); Review Date and Follow-up Instructions can disagree.
- STORY-058: only free text is translated — Frequency, When, Duration and labels stay English; the failure toast tells the doctor to check `OPENAI_API_KEY`; a toast appears on every English preview.
- STORY-059: `Fit to 1 page`, layout and format reset on each reload; sliders move in px while the readout is mm; with `Live Preview: On` the preview reopens after `Close` (inferred); no screen creates a printer profile.
- STORY-060: `Show signature` is off by default and remembered per browser only.
- STORY-061: `PDF via WhatsApp` downloads the file and opens `wa.me` for manual attaching; the link uses stored digits without adding `91` (inferred); the "chat just opened" toast shows even if the pop-up was blocked.
- STORY-062: `+ Add to Drug Database` opens empty and leaves the typed row behind as a free-text medicine; "Total qty" has no input; "Detailed Examination" is not printed; merely opening the preview marks the prescription section complete (inferred).

**Pharmacy desk and counter**

- STORY-063: Desk figures are not links and show zeros when the request fails; the Quick Guide points to a non-existent "Inventory > Pharmacy Control".
- STORY-063, 069, 071, 072: reception sees the AI launcher, the Partner Daily Sync form and `Create Package` although the server refuses each.
- STORY-064: the cockpit lists only the 8 newest prescriptions, so the longest-waiting can be missing; header `Rx queue` does nothing; "Scan next" accepts no scan.
- STORY-064: `Paid` sets a task to Paid without a bill or money; a prescription over 24 h old is labelled "Paused" / "Expired" though nobody paused it; after confirming a bill the user is returned to Sales, not the Counter.
- STORY-065: `Sub` opens no product picker; the reason / note box is shared by all lines, so `NA` can be saved with "Substitution requested"; no cockpit decision reaches the bill.
- STORY-065: a completed bill marks the whole prescription Dispensed even with an unavailable line; a paused prescription shows as "Expired" in the table and leaves its default view; there is no Resume or Cancel control.
- STORY-067: saving a link does not refresh the cockpit.
- STORY-068: with a non-empty queue there is no walk-in button on the Counter, and header `Bill` starts a bill for whichever prescription is highlighted.
- STORY-069: the create dialog stays open and filled after success (duplicate risk); packages are always private to their creator; a free-text subcategory or category "General" fails or never appears.
- STORY-070: `Price (₹) *` is not validated (saves ₹0); deleting a used drug marks it inactive without saying so; the edit dialog opens with `Barcode` and `Description` blank (server handling unverified); "Active Drugs" counts the current page only.
- STORY-071: `Organization Name` is free text, so a typo creates a new partner; one submission per partner per day with no edit; invalid rows are dropped silently; the default date is yesterday before 5:30 am IST.
- STORY-072: the assistant panel cannot be closed; applied proposals write medicines and stock directly, bypassing the approval queue.

**Pharmacy sales**

- STORY-073: hand-added items always start at Tax % 18 and show no stock status until confirm fails; after confirming, the builder stays filled and looks editable; an unsaved bill is lost on navigation with no warning.
- STORY-073, 068: a sale needs a registered patient, but the builder cannot create one and PHARMACIST has no Patients entry.
- STORY-075: no autosave; drafts do not reserve stock.
- STORY-076: the reprint layout omits batch, HSN, copy type and GST split that the confirm-time print has; `Send on WhatsApp` is text only.
- STORY-077: no all-modes breakdown and no export on the Sales register.
- STORY-078: a refund is always the full refund-due amount; raising a total leaves a "Due" with no control to collect it.
- STORY-079: a return starts from an empty Inventory document, defaults the refund method to `CREDIT` with raw codes, and does not copy the customer from the sale; matching by bill number is unverified.
- STORY-080: a due can be collected only through the invoice list's `Mark as Paid`, via native confirm / alert, in the bill's original method; the list defaults to "Today" and hides older bills; whether the bell alert counts such a bill is unverified.
- STORY-081: `Delete Invoice` is offered on finished bills (server refuses); a load failure shows "No invoices found"; `Back` always goes to the Desk.
- STORY-083: the pending-checkout record lives in one tab's `sessionStorage` only.

**Purchases and payables**

- STORY-084: uploads show no thumbnails or page order; DL No. and HSN block posting but are not marked required; the "These look like different products" box appears far from the button pressed.
- STORY-084, 091: a bill that breaks the agreed terms is only hinted, never flagged or listed.
- STORY-084: the supplier hint still says "choose Save & Process"; `Back to list` after entering from Today or the task strip appears to do nothing (inferred).
- STORY-085: the Product field has no autocomplete; `Save draft` can show "These corrections were not saved" and "Unfinished invoice saved to the server" together (inferred); an unfinished intake does not appear in the register.
- STORY-086: MANAGER is expected to hit the denied state (inferred); whether a pasted QR purchase code matches the register search is unverified.
- STORY-087: `Mark paid` has no amount field (no part payment) and a free-text date; the undo window is 30 seconds.
- STORY-088: the posted bill gives two contradictory correction instructions; `Start linked return` prefills every line at full quantity, offers no "billed but not delivered" reason, and states "Stock has already been sent back to the supplier".
- STORY-088: the linked return is opened by a full page reload and Back lands on an unlinked generic register; the "corrected replacement bill" has no button and is expected to trip the duplicate check (inferred).
- STORY-089: `Reverse allocation` asks for its reason in a native `prompt()`.
- STORY-090: `Max` overwrites the typed Amount; choosing a distributor scrolls or highlights nothing; a read-only user sees `Record Payment` disabled with no explanation; alert counts are not clickable.
- STORY-091: GSTIN is mandatory, so an unregistered local supplier cannot be saved; the supplier row has no Terms action.
- STORY-092: the distributor filter needs a GSTIN copied by hand; filters apply only on `Refresh`; rows link nowhere.
- STORY-093: the search box expects raw Gmail query syntax; the not-configured state lists server environment variable names; an imported draft is lost on refresh before the first save (inferred).

**Stock, counts and reorder**

- STORY-094: the default view lists depleted batches; filter chips show raw parameter names; a scanned QR label silently changes area.
- STORY-095: `Export CSV` exports only the current page of 50.
- STORY-096: "Add Inventory Item" has no quantity field; the approved item is created with zero stock and labelled "Previous / depleted"; MANAGER can approve counts and orders but has no `Approve corrections` task.
- STORY-097: the reason must be retyped for each save; `Set stock alert` reopens the same editor.
- STORY-098: the Today row for price / stock edits can open the approvals screen on the `New items` tab; the three pending counters count different things.
- STORY-098, 101: a pharmacist can post `Loss & breakage` or `Block stock` at once, while a one-unit `Edit stock` waits for approval.
- STORY-099: the count sheet shows the System quantity beside each box (not a blind count).
- STORY-100: `Count matching batches` with no filters would put every batch on one list with no confirmation (server limit not verified).
- STORY-101: Stock level and Expiry filters cannot be combined; item-page action buttons are named after registers (`Blocked stock`, `Loss & breakage`, `Supplier returns`).
- STORY-102: optimization results are not saved or exportable.
- STORY-103: shortbook and order pages stack two panels with two supplier pickers and two cancel actions; the lower supplier list offers only the first line's suggestions; raw ids appear for supplier, requester, actor and branch.
- STORY-103: `Send purchase order` records a mail "setup required" failure; the initial proposal status label is inferred; a pharmacist's proposal controls are disabled with no hint; a DOCTOR cannot approve their own order while OWNER / ADMIN / MANAGER can.
- STORY-104: on the mounted layout `Preview import` shows no preview and the button flips to `Confirm opening import`; the warning "Existing batch balances cannot be reset." is never shown; no template is offered.

**Reports and administration**

- STORY-105: while counts are being typed the Total row shows a large interim difference.
- STORY-106, 107: report filters are drafts until `Go`; `Print` and `Download` export the last applied filters, not what is on screen; the report menu is hidden below `2xl` once a report is open.
- STORY-107: "Sales Bills" with Type "Purchase" keeps the Sales title and "Customer…" placeholder over supplier bills.
- STORY-108: Day wise Summary dates are not in the URL and reset on refresh; dates need `Go` but Type applies at once; `Download` uses a different endpoint from the screen.
- STORY-109, 110: "expiring" means 3 months in the report and Inventory Today but 30 days (capped at 10) in the alerts; "Low Stock" has two definitions.
- STORY-110: Revenue Report is clinic-only and does not say so; choosing the same export format twice does nothing (as read from the code); report and export errors go only to the console; Inventory Report's expiry alerts are fetched but not rendered.
- STORY-111: a failed create (duplicate e-mail / phone) shows nothing; success shows nothing; "Role & Permissions" shows the role's defaults rather than the user's saved grants; the presence of the compliance grants in the list is unverified.
- STORY-111: Owner, Accountant and Lab tech cannot be chosen as a role; MANAGER sees user-management buttons the server refuses; the Quick Guide and empty-state text describe controls that do not exist.
- STORY-112: a refused delete shows nothing; after `Cancel` the form keeps its values, so `New User` opens as "Edit User" with the previous person's details (as read from the code); "Inactive" and "Suspended" are unexplained.
- STORY-113: `Send Test` stays disabled until the saved template is reopened through `Edit`; test messages go out with blank variables; the admin dialog offers no template picker, so the name is retyped.
- STORY-113: `New` silently switches Ownership; "Active" is not sent on create and "Ownership" not on update; the `Add` variable button adds nothing (all as read from the code).

**Cross-cutting**

- STORY-067, 071, 082, 101: messages send the user to Inventory or Stock ("…or add the product in Inventory", "Add the product/batch in Stock, then return here") without a link.
- STORY-008, 028, 046, 051, 070, 080, 081, 084, 089, 111, 112, 113: native browser `alert()` / `confirm()` / `prompt()` dialogs are still used beside toasts; on the Users screen create, edit and delete failures show nothing at all.
- STORY-005, 018, 039, 064, 068, 080: links and buttons take RECEPTION, PHARMACIST, ACCOUNTANT and OWNER to pages that their sidebar does not list (Sales, Reports, Pharmacy Desk), or hide a needed page from a role the server admits.
- STORY-010, 029, 060: below the `md` breakpoint there is no header, so search, notifications, "My Settings", the tour and the `Branded` toggle are unreachable on a phone.

**Inconsistencies in the story text**

- Four places where two stories, or a story and discovery, describe the same control differently are listed above: STORY-005 vs STORY-041 (doctor bell link), STORY-006 / 029 vs STORY-060 ("My Settings" footer `Save`), STORY-021 vs discovery (remembered date), STORY-028 vs discovery (Rooms calendar controls). A walk should settle each.
