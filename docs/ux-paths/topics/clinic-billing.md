# Topic 4: Clinic billing and payments at the appointment (create bill, take payment, fee list, daily collection)

Source read: `FE/components/appointments/{AppointmentBillDialog.tsx,appointment-billing-view.ts,DoctorDayCalendar.tsx,CalendarColumn.tsx}`, `FE/app/dashboard/fees/page.tsx`, `FE/components/billing/ClinicFeeList.tsx`, `FE/lib/clinic-payment-modes.ts`, `FE/components/pharmacy/reports/{DailyCollectionReport,ReportToolbar,collection-model,report-catalog}`, `FE/components/patients/PatientProgressTracker.tsx`, `BE/modules/billing/{billing.controller,billing-access,clinic-fees.controller,billing.service}.ts`, `BE/modules/pharmacy/pharmacy-reports.service.ts`. `BillingManagement.tsx` is dead and is not used here.

Counting convention used in every story: one numbered step per click, per typed field (focusing and typing into one field = 1 step), and per selection. Looking at a result is not a step. "Close the dialog" is counted because the bill dialog never closes itself after a save (`finish()` only resets the form and reloads the calendar).

Facts that apply to all stories:
- Calendar route `/dashboard/appointments`, tab "Calendar". The row's bill chip (desktop rows; wording shrinks to "₹✓" / "₹!" on a phone) opens dialog "Bill for <patient name>" with description "<Bill type> · <date> · <slot>". The chip is only enabled for roles whose clinic-bill access has `read` (OWNER, ADMIN, RECEPTION, DOCTOR; `billingAccess` in the schedule response). MANAGER, NURSE, PHARMACIST and ACCOUNTANT get no chip action.
- Create bill and Record payment are admitted only to OWNER, ADMIN, RECEPTION (route roles on `POST /billing/invoices` and `POST /billing/payments`, plus `billing:invoice:create` / `billing:payment:process`). DOCTOR reads only.
- Bill type (First consultation / Review / Procedure) is decided by the server from visit type and earlier visits, never chosen by the desk.
- Consultation and procedure fees are billed without GST (line is saved with gstRate 0, discount 0, quantity 1).
- Same information on several surfaces: the bill state shows as (1) the row chip ("Not billed", "₹500 · Paid", "₹200 due"), (2) the "Bill:" line inside "Appointment Details", (3) inside "Bill for <patient>" (Total / Received / Due and the payment list), (4) the Daily Collection clinic tiles and "clinic-bills" table. The fee for a bill type shows on the Fee list page and again as "From fee list: <type> ₹x" inside Create bill.

---

## CLINIC-BILLING-01: Bill a first consultation and take it in cash

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

## CLINIC-BILLING-02: Collect part of a balance by UPI

**Type**: short
**Topic**: Clinic billing and payments at the appointment
**Persona**: Meena Kulkarni, receptionist
**Goal**: Suresh Naidu owes ₹3,500 on a procedure bill and pays ₹2,000 now by UPI, the rest later.
**Preconditions**: Suresh's procedure appointment row shows the chip "₹4,500 · ₹3,500 due" (bill of ₹4,500, ₹1,000 received earlier). Calendar open as in story 01.
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

## CLINIC-BILLING-03: Procedure bill with no fee on the list, paid part by cheque

**Type**: medium
**Topic**: Clinic billing and payments at the appointment
**Persona**: Meena Kulkarni, receptionist
**Goal**: Farhan Qureshi (41) had a "Chemical peel" procedure; bill ₹3,500 and take a ₹2,000 cheque advance.
**Preconditions**: Appointment is visit type Procedure with Procedure Name "Chemical peel" (shown in the row as "(Chemical peel)"); the fee list has no Procedure fee ("Not set"); Meena is a RECEPTION user, so she has no link to the fee list. Row chip: "Not billed".
**Ideal path**: 5. Open the bill, type the fee (it varies per procedure), type the amount paid, pick the mode, confirm; the cheque number is an optional extra.
**Alternate paths**: Row click > "Appointment Details" > "Create bill" (+1). The standalone page `/dashboard/procedures` ("Smart Procedures Management") records the procedure but has no fee or payment. The Procedure fee could be set once on `/dashboard/fees` (see story 08) so this step disappears for next time, but only OWNER/ADMIN can do so.

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
- The doctor later says the fee should be ₹4,000: there is no edit on an existing bill in this dialog (fee list changes never touch a bill already made); the only route is "Add another bill" for the difference (see story 05) or an admin through the API, which has no UI.

### Edge Cases
- "Paid now" above the fee: red "Paid now can be from 0 up to the fee." and the button is disabled.
- Fee typed as "3500.5" is accepted (up to 2 decimals); "35,00" is read as 3500; "abc" shows "Enter the fee as an amount above 0, for example 500."
- Fee 0 or negative is refused with the same message.
- Phone width: the chip shows only "₹!" for a finished visit not billed, or nothing as text for a quiet "Not billed" (empty string, only the border shows), so it is a small unlabelled target.

---

## CLINIC-BILLING-04: Give a senior-citizen concession by editing the fee

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

## CLINIC-BILLING-05: Add an extra bill for a procedure done on the same visit, pay later

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

## CLINIC-BILLING-06: Owner checks the day's clinic takings

**Type**: short
**Topic**: Clinic billing and payments at the appointment (daily collection)
**Persona**: Dr. Kavita Rao, owner
**Goal**: See how much the front desk collected today on consultations and procedures, and what is still due, then compare with yesterday.
**Preconditions**: Logged in as OWNER; bills from stories 01 to 05 exist for today.
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

## CLINIC-BILLING-07: Count the pharmacy drawer against the day's expected collection

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

## CLINIC-BILLING-08: Change a consultation fee on the Fee list

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

---

## CLINIC-BILLING-09: A clinic morning to closing time, from fee setup to collection check

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
- A cheque patient: see story 03 (+2 steps).

### Edge Cases
- Session expiry in the middle: any 401 sends to `/login` and the path is remembered (`?next=`), so after sign-in Meena returns to the calendar but her open dialog and typed values are lost.
- Meena opens `/dashboard/pharmacy/reports?report=daily-collection` by URL: the Pharmacy Report roles do not include RECEPTION, so the API refuses; the clinic cash she took is visible to her only through each calendar chip.
- The per-mode day table counts "Earlier bills" separately, so Suresh's ₹3,500 shows under today's receipts even if his bill were dated yesterday.
