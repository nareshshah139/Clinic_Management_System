# Consultation billing & fee list

> Topic slug: `clinic-billing-fees`. Read-only analysis of the code as it stands on 13 Nov 2026.
> Labels in `code font` or "quotes" are the actual strings in the source.
>
> **What exists.** A clinic bill (consultation or procedure fee, no GST, number `INV-YYYYMMDD-NNN`,
> restarting every day) is created and paid only from the appointment calendar, in the dialog
> "Bill for {patient}" (`frontend/src/components/appointments/AppointmentBillDialog.tsx`). The fee
> it starts from comes from the admin-only page "Fee list" (`/dashboard/fees`). The money shows up
> in "Daily Collection" (`/dashboard/pharmacy/reports?report=daily-collection`).
>
> **What does not exist in the UI** (checked by searching every caller of the billing API in
> `frontend/src`): editing a clinic bill, cancelling/voiding it, refunding a payment, printing or
> sharing a receipt, a list/register of clinic bills, a split payment in one save, a discount field.
> The server has `PATCH /billing/invoices/:id` and `POST /billing/refunds` (ADMIN-listed) with no
> screen calling them, and `DELETE /billing/invoices/:id` always answers "Invoice cancellation is
> not supported in the current schema" (`backend/src/modules/billing/billing.service.ts`).
> `components/billing/BillingManagement.tsx` has those features but is not mounted on any route.
>
> **Who can do what** (`backend/src/modules/billing/billing-access.ts`, `billing.controller.ts`):
> OWNER, ADMIN and DOCTOR can read, create and take payment; RECEPTION can with its default grants
> (`billing:invoice:create`, `billing:invoice:read`, `billing:payment:process`); NURSE, MANAGER,
> PHARMACIST and ACCOUNTANT get no bill chip at all. Only OWNER and ADMIN can open the fee list.

---

## STORY-001: Collect a first-consultation fee in cash from the calendar row

**Type**: short
**Topic**: Consultation billing & fee list
**Persona**: Riya Thomas, receptionist (RECEPTION), Friday 10 am rush with four patients at the desk
**Goal**: Bill a new patient the standard first-consultation fee and record the cash she has just been handed
**Preconditions**: Signed in as RECEPTION with default grants. `/dashboard/appointments` is open on today for Dr. Praveen Reddy, Calendar tab. The fee list has First consultation = ₹700. Kavya Reddy (new patient, 98480 12345) has a 10:15-10:30 appointment in the "Confirmed" column; her row shows the word "First" and the chip "Not billed".
**Ideal path**: 2 — click the row's bill chip, confirm the prefilled bill-and-payment. Everything else (patient, bill type, fee, full amount, Cash) is already known.
**Alternate paths**:
- Click the patient's name on the row (or the hover button `INFO`) → dialog "Appointment Details" → `Create bill` next to "Bill: Not billed" → same bill dialog (one extra click; the details dialog closes itself).
- Appointments › **Slots** tab renders the same day calendar (`DoctorDayCalendar`) beneath its own filters, so the same chip and dialog are reachable there.
- No other route creates a clinic bill. The Patients progress tracker `Bill` button and `/dashboard/billing` look like alternates but open the **pharmacy** bill (see STORY-008).

### Steps
1. Click the chip "Not billed" at the right end of Kavya Reddy's row (tooltip and screen-reader label "First consultation bill: not billed yet") → dialog "Bill for Kavya Reddy" opens with the description "First consultation · 13 Nov 2026 · 10:15-10:30". Because there is no bill yet, a section "Create bill" is shown with `Bill line` = "First consultation", `Fee` = "700", `Paid now` = "700", the line "From fee list: First consultation ₹700", a "Payment mode" radio group (`Cash` selected, `UPI`, `Card`, `Net banking / NEFT`, `Cheque`) and the note "Consultation and procedure fees are billed without GST."
2. Check the amount against the notes in her hand, then click `Create bill and record ₹700` → the button reads "Saving…", then a toast "Bill INV-20261113-004 created and ₹700 Cash recorded". The dialog stays open; once the calendar has reloaded it shows a card "INV-20261113-004" with a green "Paid" badge, the line "First consultation ₹700", Total ₹700 / Received ₹700 / Due ₹0, the payment line "₹700 Cash · 13 Nov 2026, 10:17 am", and a link-style button `Add another bill`.
3. Close the dialog (X or Esc) → the row's chip now reads "₹700 · Paid" in green.

### Variations
- **Pays by UPI or card**: one more click on `UPI` / `Card` before step 2; the toast names the mode ("… ₹700 UPI recorded").
- **Bill now, pay later**: clear `Paid now` (or type 0) → the payment-mode radios disappear and the button reads `Create bill`; the chip becomes "₹700 due" in amber with an alert icon.
- **Review patient**: the row says "Review", `Bill line` is "Review consultation" and the fee comes from the Review row of the fee list. The bill type is decided by the server: Procedure appointment → Procedure; otherwise First consultation when the patient has no earlier visit in the branch, else Review (`backend/src/modules/appointments/appointment-billing.ts`). The desk cannot change the bill type, only the line text and the amount.
- **Doctor or owner at the desk**: OWNER, ADMIN and DOCTOR get exactly the same dialog (they pass every role gate).
- **Narrow rows / phone**: the chip shortens to "Paid" / "₹700 due", and at phone width to "₹✓" / "₹!".

### Edge Cases
- **Permission removed**: a RECEPTION user whose `billing:invoice:create` grant was removed (Users › "Role & Permissions") still sees the chip; the details-dialog button reads `View bill` and the bill dialog says "Not billed yet. The front desk creates the bill." — addressed to the front desk itself.
- **Roles with no billing read (NURSE, MANAGER)**: no chip on the row and no "Bill:" line in "Appointment Details".
- **Finished visit with no bill**: the chip stays "Not billed" but turns amber with an alert icon; label "… not billed yet, visit finished". At phone width an ordinary unbilled row has an empty chip (no text) *(inferred from `billingChip`)*.
- **Server refuses the bill**: red text "{reason} Nothing was saved." under the form; the typed values stay.
- **Bill saved but payment refused**: "Bill INV-… was created, but the payment was not recorded: {reason}" — the bill exists with the full amount due and the desk must use "Record payment".
- **Double click window**: after the save the form is briefly shown again with its defaults until the new bill loads; `createInvoice` sends no idempotency key, so a second click there would raise a second bill that cannot be cancelled *(inferred)*.
- **Loading failure when reopening**: "Could not load the bill: {reason}" with `Retry`.
- The dialog cannot be dismissed while a save is in flight.

---

## STORY-002: Procedure bill with part payment by UPI now and the balance by card later

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

### Steps
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

### Variations
- **Split at the same moment (₹2,000 UPI + ₹1,500 cash)**: there is no split row. The desk does steps 3–6 with the first mode, then immediately uses "Record payment" for the second — two saves, two toasts, one bill.
- **Balance paid in two instalments**: change `Amount received` to a smaller figure (button `Record ₹500 payment`); the section stays with the new balance prefilled.
- **Balance paid on a later day**: the appointment is on a past date, so the desk must change the `Date` picker (and possibly the `Doctor` select) back to the appointment's day to find the row — the only way to reach an old bill.
- **Procedure fee set in the fee list**: `Fee` and `Paid now` are prefilled and the hint reads "From fee list: Procedure ₹…".

### Edge Cases
- **Over-payment**: typing more than the due amount shows "Enter an amount above 0 and up to the ₹1,500 due." and disables the button; the server also refuses with "Only ₹1,500 is due on bill INV-…, so ₹2,000 cannot be recorded."
- **Paid now above the fee**: "Paid now can be from 0 up to the fee."
- **Fee typed as text or 0**: "Enter the fee as an amount above 0, for example 500." ("1,200.50" and "₹ 500" are accepted; three decimals are not.)
- **Two desks take the same balance**: the second save fails with "Bill INV-… is already paid in full, so ₹1,500 cannot be recorded. Nothing was saved." and the calendar row reloads.
- **Wrong mode recorded**: there is no way to correct a payment's mode afterwards (see STORY-006).
- **Mode resets**: after every successful save the mode returns to `Cash`; a desk taking several UPI payments must re-select UPI each time.

---

## STORY-003: Charge less than the fee list, change her mind, and record a bank transfer with its UTR

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

### Steps
1. Click the "Not billed" chip on Suresh Babu's row → "Bill for Suresh Babu" ("Review · 13 Nov 2026 · 15:30-15:45") with `Bill line` "Review consultation", `Fee` "500", `Paid now` "500", "From fee list: Review ₹500", `Cash` selected.
2. Replace `Fee` with `30o` (slip of the finger) → red text "Enter the fee as an amount above 0, for example 500." and, because `Paid now` mirrors the fee, a second line "Paid now can be from 0 up to the fee."; the save button is disabled.
3. Correct `Fee` to `300` → the hint changes to "Fee list: Review ₹500, changed for this bill." followed by a link-style button `Use ₹500`; `Paid now` follows to "300"; the button reads `Create bill and record ₹300`.
4. Riya wonders whether the lower price needs a reason and looks for a discount or remarks field → there is none; the only free text is `Bill line`. She edits `Bill line` to "Review consultation (concession by Dr. Praveen)".
5. Suresh shows a NEFT confirmation on his phone. Click `Net banking / NEFT` → a field "Bank reference / UTR (optional)" appears under the radios.
6. Type `HDFCN52026111398765` in "Bank reference / UTR (optional)".
7. Click `Create bill and record ₹300` → toast "Bill INV-20261113-009 created and ₹300 Net banking / NEFT recorded"; the bill card shows "Paid" and the payment line "₹300 Net banking / NEFT · HDFCN52026111398765 · 13 Nov 2026, 03:34 pm".
8. Close the dialog → chip "₹300 · Paid".

### Variations
- **Changes her mind about the concession**: before saving, click `Use ₹500` → `Fee` returns to 500, the hint returns to "From fee list: Review ₹500" (and `Paid now` follows as long as it was not typed into).
- **Cheque**: click `Cheque` → field "Cheque number (optional)". Cash, UPI and Card ask for no reference.
- **Reference left empty**: allowed; the payment line then shows only mode and time.
- **Charging more than the list** (e.g. long consultation ₹800): identical flow; the dialog treats any difference from the list the same way.

### Edge Cases
- **Reference carries across modes**: the reference text is one shared box — typing a cheque number, then switching to `Net banking / NEFT`, shows the same text relabelled "Bank reference / UTR". Switching to Cash/UPI/Card hides the box and the text is not sent.
- **Paid now typed first**: once `Paid now` has been typed into it no longer follows `Fee`; lowering the fee below it shows "Paid now can be from 0 up to the fee."
- **Empty bill line**: the save button is disabled with no message explaining why.
- **Concession is invisible afterwards**: the saved bill shows only the line text and ₹300; neither the bill, the chip nor Daily Collection shows that the list fee was ₹500.
- **Fee list changed meanwhile**: the fee shown is the one loaded with the calendar; a fee an admin changed since is picked up only when the day's schedule reloads *(inferred from `appointments.service.ts` returning `fee` with the schedule)*.

---

## STORY-004: Add a second bill to the same appointment for an add-on procedure

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

### Steps
1. Click the "₹500 · Paid" chip on Arjun Menon's row → "Bill for Arjun Menon" shows "Loading the bill…", then the card INV-20261113-006 with "Paid", "Review consultation ₹500", Total / Received / Due, "₹500 Cash · 13 Nov 2026, 11:16 am", and the button `Add another bill`.
2. Click `Add another bill` → a section "Add another bill" opens with `Bill line` = "Review consultation", `Fee` = "500", `Paid now` = "500", "From fee list: Review ₹500", `Cash` selected, and buttons `Cancel` and `Create bill and record ₹500`. The form is prefilled exactly as for a first bill — a quick click here would bill the review a second time.
3. Replace `Bill line` with "Intralesional steroid injection".
4. Replace `Fee` with `1200` → hint "Fee list: Review ₹500, changed for this bill." with `Use ₹500`; `Paid now` follows to "1200".
5. Arjun has ₹1,000 in cash and will send ₹200 by UPI. Overwrite `Paid now` with `1000` → button `Create bill and record ₹1,000`.
6. Click `Create bill and record ₹1,000` → toast "Bill INV-20261113-010 created and ₹1,000 Cash recorded". The dialog now starts with the summary line "2 bills · ₹1,700 · Due ₹200", lists both bill cards (the new one with an amber "Due ₹200"), and shows "Record payment" with `Amount received` = "200".
7. Click `UPI`.
8. Click `Record ₹200 payment` → toast "₹200 UPI recorded on INV-20261113-010"; the summary reads "2 bills · ₹1,700 · Paid".
9. Close the dialog → chip "₹1,700 · Paid" (on a wide row "₹1,700 · Paid · 2 bills").

### Variations
- **Changes her mind**: `Cancel` in the "Add another bill" section closes the form and brings back "Record payment" (which is hidden while adding).
- **Both bills have something due**: "Record payment" shows a radio group "Bill to pay" with one button per bill ("INV-20261113-006 · Due ₹300", "INV-20261113-010 · Due ₹200"); the first is preselected. One payment cannot be spread over two bills — the desk records two payments.
- **Procedure decided before the consult is billed**: the desk still raises two bills; the create form has a single line.

### Edge Cases
- **Bill type label does not follow the second bill**: the row keeps the word "Review" and the dialog description stays "Review · …" although the second bill is for a procedure; the fee hint keeps comparing against the Review fee.
- **Duplicate by habit**: nothing warns that an identical "Review consultation ₹500" bill already exists on the appointment.
- **Chip arithmetic**: with part payment across two bills the wide chip reads "₹1,700 · ₹200 due · 2 bills"; the desk-width chip only "₹200 due".
- **Patient pays ₹500 against two ₹300 dues**: the amount box refuses anything above the selected bill's due ("Enter an amount above 0 and up to the ₹300 due.").

---

## STORY-005: Set and maintain the clinic fee list

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

### Steps
1. Click "Fee list" in the sidebar's Admin section → page "Fee list" with the description "Create bill on the appointments calendar starts from these fees, billed without GST. The desk can still change the amount on a bill. Changing a fee here never changes a bill already made." After "Loading the fee list…" three rows appear: "First consultation — A patient's first visit in this branch", "Review — A patient who has visited before", "Procedure — A procedure appointment", each with the status "No fee set yet", a ₹ box with the placeholder "Not set", and a disabled `Save`.
2. Type `700` in the First consultation box → its `Save` becomes enabled.
3. Click `Save` (or press Enter) → "Saving…", toast "First consultation fee saved: ₹700"; the row's status becomes "₹700 · changed 13 Nov 2026, 08:42 am by Anil Varma".
4. Type `500` in the Review box.
5. Click that row's `Save` → toast "Review fee saved: ₹500". The Procedure row is left at "No fee set yet" because procedure prices vary.

### Variations
- **Raise a fee later**: overwrite 500 with 600 and `Save`; the status line shows the new amount, time and name. Bills already made keep their amounts.
- **Clear a fee**: empty the box → the button label changes to `Clear fee`; click it → toast "Review fee cleared", status "No fee · cleared {date time} by Anil Varma". The desk then sees "No fee set for Review." in Create bill.
- **Check the result**: open Appointments and click an unbilled row's chip → "From fee list: Review ₹600". There is no preview on the fee page itself.

### Edge Cases
- **Someone else saved first**: red text "{Name} set the Review fee to ₹550 while you were editing. Check it and save again. Your ₹600 is still in the box." — the status line shows their fee; a second `Save` then goes through.
- **Bad amount**: "Enter an amount above 0 and up to ₹10,00,000, for example 500."; `Save` stays disabled.
- **Not an admin**: a DOCTOR, RECEPTION or MANAGER who opens `/dashboard/fees` (no sidebar entry for them) sees a lock icon with "Only an admin can change the fee list." and "Create bill on the appointments calendar shows the fee for each appointment." A DOCTOR can create bills and override the fee on each one, yet cannot see or change the list.
- **Load failure**: "Could not load the fee list: {reason}" with `Retry`. Save failure: "{reason} Nothing was saved."
- **Only three rows exist**: one fee per bill type for the branch. There is no per-doctor fee, no per-procedure price (chemical peel vs laser), no follow-up-within-N-days rule and no effective date.

---

## STORY-006: A wrong bill, a refund and a receipt — the three things the desk cannot do

**Type**: medium
**Topic**: Consultation billing & fee list
**Persona**: Riya Thomas, receptionist (RECEPTION), with an impatient patient at the counter
**Goal**: Correct a bill raised for ₹7,000 instead of ₹700, hand back the excess, and give the patient a printed receipt
**Preconditions**: Signed in as RECEPTION. Ten minutes ago Riya created INV-20261113-013 for Lakshmi Devi (93910 20477) with `Fee` 7000 and `Paid now` 7000 in Cash (an extra zero; the patient actually paid ₹700). Chip reads "₹7,000 · Paid".
**Ideal path**: 4 — open the bill, correct the amount (or void and re-raise) with a reason, confirm, print the receipt.
**Alternate paths**: none found — no screen in `frontend/src` calls the bill update, cancel or refund endpoints, and no component prints a clinic bill. (`components/billing/BillingManagement.tsx` contains such features but is not mounted on any route.)

### Steps
1. Click the "₹7,000 · Paid" chip on Lakshmi Devi's row → "Bill for Lakshmi Devi" shows the card INV-20261113-013 with "Paid", "First consultation ₹7,000", Total ₹7,000 / Received ₹7,000 / Due ₹0, "₹7,000 Cash · 13 Nov 2026, 12:05 pm".
2. Look for a way to edit the amount → the card is read-only text; the only control in the dialog is `Add another bill`. There is no Edit, no menu on the bill number, no pencil icon.
3. Look for a way to cancel the bill or refund ₹6,300 → no such control. (The dialog can *display* a line "Refund ₹… Cash" if a refund exists, but nothing in the UI creates one.)
4. Riya tries the only thing available: click `Add another bill`, hoping to enter a negative correcting line → form opens prefilled "First consultation", `Fee` 700.
5. Type `-6300` in `Fee` → "Enter the fee as an amount above 0, for example 500." (and "Paid now can be from 0 up to the fee.", since `Paid now` mirrors it); the button is disabled.
6. Click `Cancel` → back to the read-only bill. The record cannot be corrected from the app.
7. Lakshmi asks for a receipt for the ₹700 she paid. Look for Print / Download / WhatsApp on the dialog → none. The browser's own print (Ctrl+P) prints the calendar page with the dialog over it, showing the wrong ₹7,000.
8. Close the dialog. Riya writes a paper receipt and a note for the administrator. The chip keeps saying "₹7,000 · Paid", and tonight's Daily Collection will show Cash ₹6,300 higher than the drawer (see STORY-007), with no cancelled or corrected marker on the bill.

### Variations
- **Under-billed instead of over-billed** (₹70 instead of ₹700): workable — `Add another bill` for the missing ₹630 with a line such as "First consultation (balance)"; the appointment then carries two bills.
- **Wrong payment mode** (Cash recorded, patient paid by UPI): not correctable; Daily Collection will show the amount under Cash.
- **Billed on the wrong appointment/patient**: not correctable; the bill stays on that row.
- **Administrator tries**: OWNER and ADMIN see the identical dialog — no extra controls. The server would accept `PATCH /billing/invoices/:id` and `POST /billing/refunds` from them, but only through the API; `DELETE /billing/invoices/:id` always fails with "Invoice cancellation is not supported in the current schema".

### Edge Cases
- **Unpaid wrong bill**: a bill raised in error with nothing paid stays as "₹… due" on the row for ever and counts in "Clinic still due" for its day.
- **Appointment cancelled after billing**: nothing links cancelling the appointment to its bill *(inferred — no bill handling found in the cancel flow of `DoctorDayCalendar.tsx`)*.
- **Refund rows from elsewhere**: if a refund is ever posted through the API it appears as "Refund ₹6,300 Cash · {time}" in the payments list and under "Refunds" in Daily Collection, and the bill's badge goes back to "Due ₹6,300" because a refund raises the balance — the bill total itself does not change.
- **Receipt wording**: the pharmacy bill has `Print`, `Download PDF` and `Send on WhatsApp`; the clinic bill has none, so a patient who buys medicines and pays a consultation fee gets a printed bill for only one of them.

---

## STORY-007: End-of-day check of consultation takings in Daily Collection

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

### Steps
1. Click "Daily Collection" in the sidebar → `/dashboard/pharmacy/reports?report=daily-collection`; breadcrumb "← Pharmacy Report / Accounting Reports", heading "Daily Collection" with an info tip, a toolbar with `Previous day`, a "Day" field showing today, a disabled `Next day`, `Print` and `Download`; then "Loading the day's collection…".
2. Read the first block, "Whole day": tiles "Whole day", "Clinic" (₹9,200) and "Pharmacy", and the table "Whole day by payment mode" with columns Payment mode / Clinic / Pharmacy / Total and rows Cash, UPI, Card.
3. Read the second block, "Clinic: consultations and procedures": tiles "Clinic received" ₹9,200, "Clinic billed today" ₹9,400, "Clinic still due" ₹500 (amber); the table "Clinic: consultations and procedures by payment mode" (Payment mode / Received / Refunds / Net) shows Cash ₹2,900, UPI ₹3,300, Card ₹3,000.
4. She pauses: received (₹9,200) is not billed (₹9,400) minus due (₹500). Scroll to the table "Clinic bills" (Bill No. / Type / Entry / Patient / Amount / Received today / Paid by / Due) → eight rows; one has Type "Bill of 12/11/2026", Amount ₹0, Received today ₹300, Paid by "UPI" — yesterday's balance. One of today's rows shows Due ₹500.
5. Count the cash envelope from the front desk (₹2,900) and compare it by eye with the Cash row of the clinic table. There is nowhere to enter it: the heading "Pharmacy" follows, with the banner "Pharmacy balanced: what was counted matches what the system expected." and the table "Pharmacy reconciliation by payment mode", whose "Counted" boxes reconcile the pharmacy drawer only (the report's note says "The cash count below reconciles the pharmacy drawer only.").
6. She wants to see who owes the ₹500. The "Clinic bills" row shows the patient's name but is not a link. Click "Appointments" in the sidebar → the calendar opens on the doctor and date last used.
7. Find the amber "₹500 due" chip on the row and click it → "Bill for {patient}" with the bill, its payments and "Record payment".
8. Close the dialog; nothing to record tonight.

### Variations
- **Look at an earlier day**: `Previous day` (or pick a date in "Day") reloads at once; a `Today` button appears; the address bar keeps the day.
- **Paper copy for the accountant**: `Print` opens the report's PDF in the print dialog; `Download` offers "Excel (.xlsx)", "CSV", "PDF". The file carries the clinic sections as well.
- **Pharmacy not counted yet**: amber banner "Pharmacy not counted yet. Count the pharmacy cash drawer and check its UPI and card settlements, then enter them below."; OWNER, ADMIN, MANAGER, DOCTOR and PHARMACIST can type "Counted" amounts, an optional "Note (optional)" and click `Save count` (later `Save recount`).
- **A day with a bank transfer or cheque**: extra rows "Net banking / NEFT" / "Cheque" appear in the clinic and whole-day tables (the clinic stores `NET_BANKING`, the pharmacy `NETBANKING`; the report merges them).

### Edge Cases
- **Accountant or pharmacist opens the same page**: ACCOUNTANT, PHARMACIST and MANAGER have the sidebar entry but cannot read clinic bills, so the "Whole day" and "Clinic" blocks are absent and the notes say "Consultation and procedure takings are shown to the roles that can read clinic bills." The person who reconciles money cannot see the clinic's.
- **Receptionist**: the person who took the money has no "Daily Collection" entry, and the report route does not list RECEPTION, so opening the URL shows the report's error state.
- **Mistaken bill** (STORY-006): it stays in "Clinic billed today" and "Clinic received"; the difference from the envelope has to be explained on paper.
- **No bills on the day**: "Clinic bills" shows "No consultation or procedure bills were raised or paid on this day."
- **Clinic refunds**: the Refunds column exists and is subtracted in Net, but no screen creates a clinic refund, so it is ₹0 in practice.
- **Two people saving a pharmacy count**: "Someone else saved a count for this day while you were entering yours. Their count is shown below; your figures are still in the boxes. Check them and save again."

---

## STORY-008: Looking for the consultation bill and landing in the pharmacy bill ("two billing systems")

**Type**: short
**Topic**: Consultation billing & fee list
**Persona**: Naveen Goud, receptionist (RECEPTION) in his first week, started from the patient's page because the patient walked up without mentioning an appointment time
**Goal**: Take the ₹500 review fee from Ravi Kumar
**Preconditions**: Signed in as RECEPTION. Ravi Kumar (98660 77340) has an appointment today at 12:00 with Dr. Praveen Reddy, a visit in progress, and no clinic bill. Naveen has Ravi's patient page open (`/dashboard/patients/{id}`).
**Ideal path**: 2 — a "Bill" action on the patient opens today's consultation bill prefilled; confirm.
**Alternate paths**:
- The real route: sidebar › Appointments → choose doctor and date → row chip (or "Appointment Details" → `Create bill`).
- Look-alike routes that reach the **pharmacy** bill instead: patient progress tracker `Bill` / `Invoices`; `/dashboard/billing` (redirects to the Sales bill); `/dashboard/pharmacy?section=billing`; the bell notification "Overdue Invoice INV-…" (a clinic invoice, linked to the pharmacy Sales register filtered to dues).

### Steps
1. On Ravi Kumar's page, look at the progress tracker (Start → Document → Complete → Prescribe → Billing → Follow-up). The "Billing" step is not done; beside the tracker is a button `Bill`. Click it → the browser goes to `/dashboard/pharmacy/sales/bill?patientId=…&visitId=…`: a prescription queue and the pharmacy bill builder ("Patient & Doctor Details", "Add Items to Invoice", "Invoice Summary") — a GST medicine bill, with no consultation fee anywhere.
2. Naveen hesitates, looks for "Consultation" among the items, finds only drugs and treatment packages, and realises this is the wrong bill. Click "Appointments" in the sidebar → the calendar opens on the doctor and date remembered from last time.
3. Find Ravi Kumar's 12:00 row in the "Confirmed" column and click its "Not billed" chip → "Bill for Ravi Kumar" with "Review consultation", `Fee` 500, `Paid now` 500, Cash.
4. Click `Create bill and record ₹500` → toast "Bill INV-20261113-008 created and ₹500 Cash recorded".
5. Close the dialog → chip "₹500 · Paid".

### Variations
- **From the Patients list**: there is no bill action on a patient row at all; `Book appointment` on the detail page opens Appointments with `?patientId=` preselected for booking, not for billing.
- **Types `/dashboard/billing` in the address bar** (an obvious guess): redirected to the pharmacy Sales bill.
- **After the clinic bill exists**: back on the patient page the tracker's "Billing" step shows done and the button reads `Invoices` — and still opens a new pharmacy bill. The step is computed from **clinic** invoices (`apiClient.getInvoices({ patientId })`), the button links to the **pharmacy** builder (`PatientProgressTracker.tsx`).

### Edge Cases
- **Wrong doctor or date remembered**: the calendar restores the last doctor/date from `localStorage`; if that is not Ravi's doctor the row is simply absent and nothing says where his appointment is.
- **Patient with no appointment today** (walked in to pay an old due): there is no way to raise or pay a clinic bill without finding an appointment row; a consultation fee cannot be billed against a patient alone from the UI.
- **Reception and the pharmacy builder**: reception has no "Sales" sidebar entry, yet the tracker button takes them into the Sales bill page *(what the page lets a receptionist do there is covered in the pharmacy-sales topic)*.
- **Naming**: the same thing is "bill" (chip, dialog, fee list), "invoice" (API, tracker button `Invoices`, alert "Overdue Invoices", notification "Overdue Invoice INV-…"), and numbered `INV-…`; the pharmacy document is also "bill", "invoice" and "sale", numbered `PHI-…`.

---

## STORY-009: A Saturday at the front desk — fee list, four bills, a balance, and the day's close

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

### Steps
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

### Variations
- **Receptionist instead of admin**: steps 2–9 and 16–29 are identical, but at step 11 there is no `Set fees` link (she must type the fee each time or ask an admin), and steps 30–37 are impossible — no "Daily Collection" entry and the report route refuses RECEPTION.
- **Stays in the bill instead of detouring** (steps 12–15): type 3000 straight into `Fee` and carry on; the fee list stays empty and the next procedure asks again.
- **Balance and add-on in one go** (steps 21–28): not possible — the due on one bill and the new line are two saves; a single UPI transfer of ₹1,500 from the patient becomes two payment records (₹300 and ₹1,200).
- **Pharmacy counted by the pharmacist**: steps 33–36 are skipped; the banner already reads "Pharmacy balanced…" or "Pharmacy short by ₹…" / "Pharmacy over by ₹…".

### Edge Cases
- **Fee changed while the calendar is open**: had she changed the fee in another tab, the open calendar would keep offering the old amount until the schedule reloads *(inferred)*.
- **Typing in the dialog then clicking `Set fees`**: any line text or amount already typed is lost; the link is a plain navigation with no warning.
- **The same information on four surfaces**: Arjun's ₹1,700 is shown on the row chip, in "Appointment Details" ("Bill: ₹1,700 · Paid · 2 bills"), in the bill dialog (summary line plus per-bill Total / Received / Due) and in Daily Collection's "Clinic bills" rows — each with slightly different wording.
- **A slip anywhere in steps 4–28** (wrong amount or mode) cannot be undone from the app (STORY-006) and would surface only as an unexplained difference at step 31.
- **Session expiry during a save**: any 401 redirects to `/login?next=…`; on return the calendar reloads from the server, so the chip shows whether the bill was actually created.

---

## Redundancy notes

**Duplicate paths**
- Two entries to the same bill dialog on the same row: the billing chip, and "Appointment Details" → `Create bill` / `Open bill` / `View bill` (`components/appointments/CalendarColumn.tsx`, `DoctorDayCalendar.tsx`). The row's hover button `INFO` is a third way into the details dialog. The whole calendar, chips included, is rendered a second time under Appointments › Slots (`AppointmentScheduler.tsx`).
- Fee list: sidebar "Fee list" and the conditional `Set fees` link in Create bill (`AppointmentBillDialog.tsx`, shown only when no fee is set and the viewer is OWNER/ADMIN). The link leaves the calendar and discards the open bill.
- Daily Collection: sidebar "Daily Collection", Pharmacy Report "Common reports" card, the "Accounting Reports" rail and report search all open the same `?report=daily-collection` (`components/layout/sidebar.tsx`, `components/pharmacy/reports/PharmacyReportWorkspace.tsx`, `report-catalog.ts`). Clinic payment totals are also reported by `/dashboard/reports` (Revenue Report, Payment Analytics — `backend/src/modules/reports/reports.service.ts`).
- Look-alike paths that do **not** reach a clinic bill: `/dashboard/billing` (`app/dashboard/billing/page.tsx` redirects to the pharmacy Sales bill), `/dashboard/pharmacy?section=billing`, the patient progress tracker `Bill` / `Invoices` button (`components/patients/PatientProgressTracker.tsx` — status from clinic invoices, link to the pharmacy builder), and bell notifications "Overdue Invoice INV-…" / "n overdue invoices" (clinic `newInvoice` rows linked to `/dashboard/pharmacy/sales?pay=CREDIT` — `components/layout/header.tsx`).
- Unmounted duplicate: `components/billing/BillingManagement.tsx` implements a full invoice screen against the same `/billing/invoices` API and is on no route.

**Duplicate information**
- A bill's state appears on the row chip, in "Appointment Details" ("Bill: …"), in the bill dialog (summary line, badge, Total/Received/Due — the due amount is shown twice per bill, in the badge and in the grid) and in Daily Collection's "Clinic bills".
- The bill type appears as a word on the row ("First" / "First consultation"), in the chip's label, as "Bill type:" in the details dialog, in the bill dialog's description and again in the fee hint.
- Daily Collection shows the clinic total in two tiles at the top (tile "Clinic" and tile "Clinic received", the same number) and again per mode in the Clinic column of the whole-day table; both "Whole day by payment mode" and "Clinic … by payment mode" repeat the clinic figures per mode.
- The fee page's description and its locked empty state both explain that Create bill uses the fee.

**Naming drift**
- **Bill / invoice**: "bill" in the chip, dialog and fee list; `invoices` in the API and types; `Invoices` on the tracker button; "Overdue Invoices" / "Overdue Invoice INV-…" in alerts; number prefix `INV-`. Pharmacy documents use the same three words with prefix `PHI-`.
- **Review vs Review consultation vs First**: bill type label "Review" (row, fee list, hint) but default line "Review consultation"; row abbreviation "First" for "First consultation" (`appointment-billing-view.ts`).
- **Fee / amount / total / paid now / amount received / received**: `Fee` and `Paid now` when creating, `Amount received` when paying later, "Total / Received / Due" on the saved bill, "Amount / Received today / Due" in Daily Collection.
- **Payment mode / Paid by / method**: "Payment mode" (dialog, report tables), "Paid by" (Clinic bills column), `method` in the API; "Net banking / NEFT" is stored as `NET_BANKING` by the clinic and `NETBANKING` by the pharmacy (`lib/clinic-payment-modes.ts`, `backend/src/modules/pharmacy/pharmacy-daily-collection.ts`).
- **Front desk / the desk / reception**: "The front desk creates the bill.", "The desk can still change the amount on a bill.", role RECEPTION.
- **Daily Collection lives under "Pharmacy Report"** (breadcrumb "Pharmacy Report / Accounting Reports") although its first two blocks are clinic money; "Clinic" there means consultations and procedures only, while elsewhere "clinic" means the whole business.

**Gaps that shape every story** (not redundancy, but the main friction)
- No edit, void, refund, receipt print/share, discount, multi-line bill or one-save split payment for clinic bills in the UI; the server's update and refund routes have no screen and cancel is unimplemented (`backend/src/modules/billing/billing.controller.ts`, `billing.service.ts`).
- A clinic bill can be reached only through its appointment row on the right doctor and date; there is no register, search, patient-page entry or dues list.
- Clinic cash is reported but not counted: the count boxes and the Balanced/Short/Over banner cover the pharmacy drawer only (`DailyCollectionReport.tsx`), and the role that takes clinic money (RECEPTION) cannot open the report while the roles that reconcile (ACCOUNTANT, PHARMACIST, MANAGER) cannot see the clinic block.
