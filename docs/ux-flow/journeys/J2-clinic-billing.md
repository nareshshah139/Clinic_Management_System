# J2 — Clinic billing at the front desk and the day's close

> UX flow critique (simplicity and clarity, not a test pass). Traversed live on 13 Nov 2026 at
> 1440×900 on Dr Shravya's calendar with four patients created for this pass (Kavya, Arjun,
> Meenakshi and Suresh **Jtwo**). Billing was done as `reception`; the Fee list, the `Set fees`
> detour and Daily Collection as `admin`.
>
> Primary story: STORY-040 (`docs/ux-paths/topics/clinic-billing-fees.md`); supporting
> STORY-032, 033, 036, 037, 038, 039.
>
> **Measured** = done or seen live (screenshot, DOM text, counted action).
> **Suspected** = from the code or the story only.
>
> Not performed live: saving the pharmacy count and `Print` on Daily Collection (the count is one
> shared record for the day and belongs to the pharmacy critics), and anything that would leave a
> deliberately wrong bill behind (it could not be removed afterwards). Those are marked suspected.

**Verdict: convoluted for the journey as a whole; the single standard bill inside it is close to minimal.**
The extra steps are not spread evenly. They sit in four places: closing the dialog after every
save, the `Set fees` detour, the balance-plus-add-on visit, and a day close the receptionist
cannot open at all.

## Friction Scorecard

| Measure | Count | Notes |
|---|---|---|
| Steps, actual vs ideal (STORY-040) | **36 vs 21** | 29 measured live (calendar, four bills, detour, balance, add-on, opening Daily Collection); 7 for the pharmacy count and print are suspected (story steps 33–37) |
| Steps, one standard bill (STORY-032) | 3 vs 2 | chip → `Create bill and record ₹700` → close. Measured |
| Steps, fee list (STORY-036) | 5 vs 4 | open, type, save, type, save. Enter saves a row. Measured |
| Decisions the user must make | 11 | 7 are carried by a good default; 4 are needless (below) |
| Needless decisions | **4** | chip or name/`INFO` as the way in; re-picking the mode after it resets; dismissing the dialog after every save; `Set fees` detour or type the fee |
| Re-entry | **5** | below |
| Confirmations guarding nothing | **0** | there are no confirmation dialogs in the flow. The opposite problem exists: money is recorded with no undo |
| Dead ends | **6** | below |
| Hesitations | **10** | below |

**Where the 15 extra steps go** (action counts; scrolling not counted)

| Part of the journey | Actual | Ideal | Why |
|---|---|---|---|
| Open the calendar | 1 | 1 | plus an unavoidable scroll, see hesitation 1 |
| Kavya — first consultation, UPI | 4 | 3 | closing the dialog |
| Arjun — ₹200 cash now | 4 | 3 | closing the dialog |
| Meenakshi — procedure, no fee, set fee, ₹3,000 card | 11 | 6 | the `Set fees` detour is 5 actions: leave, type, save, come back, re-open the bill |
| Arjun — ₹500 balance by UPI plus ₹1,200 injection | 9 | 5 | two saves, UPI picked twice, one close |
| Day close | 7 | 3 | the pharmacy count is typed by whoever opens the report; clinic cash has no box |

**Decisions carried by a default (fine as they are):** doctor (remembered), date (today), bill line,
fee (from the fee list), `Paid now` (the full fee), mode (`Cash`), which bill to pay (the first
with something due).

**Re-entry — things the app already knew**
1. Payment mode goes back to `Cash` after every save inside the same open dialog. Arjun paid ₹500 by UPI and, seconds later, ₹1,200 by UPI: UPI was picked twice (measured; `AppointmentBillDialog.tsx:129`).
2. `Add another bill` opens prefilled with the bill that already exists — "First consultation", `Fee` 700, `Paid now` 700, `Cash` ([10](J2-clinic-billing-screens/10-add-another-bill-prefilled.jpg)). Both fields must be overwritten, and leaving them raises a duplicate consultation bill that cannot be removed.
3. After `Set fees` the bill is gone: I had typed "(2 areas)" into `Bill line`, and on return the line was back to "Procedure: Q-switch laser" (measured). The row has to be found and the bill opened again.
4. A global-search hit for an appointment ("Suresh Jtwo - 17:30-17:45") opens `/dashboard/appointments` with no doctor or date carried. In a fresh session it showed Praneeta Jain's calendar and Suresh's row was not on screen (measured; `components/layout/header.tsx:450`).
5. With no Procedure fee, a receptionist types the price on every procedure bill and has no way to make it stick (measured as reception: no `Set fees` link).

**Dead ends**
1. After a save the dialog stays open showing the bill; its only controls are `Add another bill` and the X ([05](J2-clinic-billing-screens/05-bill-paid.jpg)). No "Done", no receipt.
2. A wrong amount or mode cannot be corrected, cancelled or refunded: the saved bill is read-only text (measured — the dialog has no such control; server side per STORY-037).
3. The receptionist who took the money cannot close the day: Daily Collection is not in her sidebar and the URL answers "Forbidden resource (Reference: …) Your role cannot open pharmacy reports. Ask the clinic owner or an admin for pharmacy compliance access." ([14](J2-clinic-billing-screens/14-daily-collection-reception-refused.jpg)).
4. The Fee list page has no way back to the bill it was opened from (measured: the page's only controls are three `Save` buttons).
5. In Daily Collection the "Clinic bills" rows are plain text. Suresh's ₹700 due cannot be opened from there (measured: no link, default cursor) ([13](J2-clinic-billing-screens/13-daily-collection-clinic-bills-pharmacy-count.jpg)).
6. Search → appointment result → a calendar that may be showing another doctor (re-entry 4).

**Hesitations — where a first-time user stalls**
1. The Appointments page shows no appointment at 1440×900. Header, doctor/date card, tabs, four filters and the Legend fill the screen; the calendar's column headings start at the bottom edge ([02](J2-clinic-billing-screens/02-appointments-above-fold.jpg)). Every billing action starts with a scroll, and again after returning from the Fee list.
2. The bill chip does not look like the way in. It measures 72×16 px, grey "Not billed" in small type. On hover, `INFO`, `RESCHED` and `START` appear beside it — larger, coloured, covering the bill type and status and overflowing the 15-minute row ([03](J2-clinic-billing-screens/03-calendar-rows-hover-actions.jpg)). `START` (start a visit) is the nearest neighbour of the money control.
3. Create bill opens with the cursor in `Bill line` and its text selected — the field least likely to change ([04](J2-clinic-billing-screens/04-create-bill-prefilled.jpg)). When the fee is missing, the cursor is still there and not in the empty `Fee` ([08](J2-clinic-billing-screens/08-procedure-no-fee-set-fees.jpg)). Enter in `Paid now` does nothing (measured), so the bill needs the mouse.
4. "Is it saved? Am I done?" — the form turns into a bill card and the only button says `Add another bill` ([05](J2-clinic-billing-screens/05-bill-paid.jpg)).
5. Esc after a save closes the toast, not the dialog; a second Esc is needed (measured twice).
6. Straight after a ₹200 part payment the loudest thing on screen is a dark full-width `Record ₹500 payment` with `Cash` already selected ([06](J2-clinic-billing-screens/06-part-paid-record-payment.jpg)). The patient has just said he will pay later. One click records ₹500 that was never handed over, and it cannot be undone.
7. As reception, a procedure bill says only "No fee set for Procedure." above a disabled `Create bill`. Nothing says "type the amount".
8. `Add another bill` looks like a repeat of the first bill (re-entry 2). The dialog's subtitle and fee hint still say "First consultation" while the user is billing an injection.
9. Daily Collection shows the clinic total three times before the first scroll ([12](J2-clinic-billing-screens/12-daily-collection-top.jpg)), and all five bill numbers are cut to the same "INV-202611…" ([13](J2-clinic-billing-screens/13-daily-collection-clinic-bills-pharmacy-count.jpg)).
10. Daily Collection has "Counted" boxes for the pharmacy only. Whether the desk's ₹200 cash belongs in them is left to the reader; the answer is one sentence inside the collapsed "How these figures are worked out".

## Take-away Pass

### Fee list — [01-fee-list.jpg](J2-clinic-billing-screens/01-fee-list.jpg)
- **Keep.** Three rows, one box each, Enter saves, an audit line. This is about as small as the task gets.
- Stated twice: the fee itself — "₹700 · changed 13 Nov 2026, 02:04 pm by Admin User" beside a box holding "700". The status line could read "Changed 13 Nov 2026, 02:04 pm by Admin User".
- Three `Save` buttons, all dark when enabled. Acceptable for three rows saved independently; do not add a page-level save on top.
- The description is three sentences. The third ("Changing a fee here never changes a bill already made") is the one an admin needs; the first is said again in the locked state for other roles.
- Sidebar: "Fee list" sits in the Admin group below the bottom edge of the sidebar at 900 px height (only "Reports" is visible in the group).

### Appointments, above the fold — [02-appointments-above-fold.jpg](J2-clinic-billing-screens/02-appointments-above-fold.jpg)
- Removable or collapsible: the **Legend** (eight colour swatches plus three sentences) — it is reference material and repeats the two sub-headings under "Scheduled" and "Confirmed" word for word ("Booked ahead. Call to confirm.", "Confirmed, walk-ins and visits."). Move it into `Quick Guide` or collapse it.
- Deferrable: `Visit Type`, `Room`, `Grid` — filters no billing step uses. Keep `Patient` search.
- "Doctor Calendar" heading plus its instruction line repeat what the page title and the columns already say.
- `Quick Guide` is as wide as the Doctor and Date fields — a help button with the visual weight of a primary control.
- Net effect: zero appointments visible on arrival. Of everything on this page, this costs the desk the most time per patient.

### Calendar rows — [03-calendar-rows-hover-actions.jpg](J2-clinic-billing-screens/03-calendar-rows-hover-actions.jpg), [11-calendar-rows-billed.jpg](J2-clinic-billing-screens/11-calendar-rows-billed.jpg)
- The billed states read well at a glance: "₹700 · Paid" green, "₹700 due" amber with an icon ([11](J2-clinic-billing-screens/11-calendar-rows-billed.jpg)). Keep.
- "Not billed" is the quietest thing on the row although it is the desk's next job for that patient.
- Hover buttons `INFO` / `RESCHED` / `START` outweigh the chip and hide "First · Confirmed". `INFO` duplicates clicking the name.
- Hierarchy: the time is blue and bold, the patient name black — fine. The bill type ("First") and the status ("Confirmed") sit together and read as one phrase, "First Confirmed".

### Create bill — [04-create-bill-prefilled.jpg](J2-clinic-billing-screens/04-create-bill-prefilled.jpg)
- One primary action, and its label carries the amount ("Create bill and record ₹700"). Keep exactly this.
- Stated more than once: ₹700 four times (`Fee`, `Paid now`, hint, button); "First consultation" three times (subtitle, `Bill line`, hint). The hint "From fee list: First consultation ₹700" earns its place only when the fee was *changed*; when it matches the list it could shrink to "Fee list price".
- Removable: "Consultation and procedure fees are billed without GST." — permanent text on every bill for a fact that never varies. It belongs on the Fee list page (where it already is).
- Missing rather than surplus: the mode buttons have no visible "Payment mode" label (it exists only for screen readers), and the mode is not in the button — the one thing that differs between a correct and an incorrect save is not restated at the point of commit.
- "Cheque" wraps alone to a second line; five modes of which two are rare.

### Bill saved — [05-bill-paid.jpg](J2-clinic-billing-screens/05-bill-paid.jpg)
- ₹700 five times in the dialog (line, Total, Received, payment line, and "Due ₹0" as its complement), a sixth in the toast, a seventh on the chip behind it.
- For a fully paid bill, Total / Received / Due adds nothing to "Paid" plus the payment line. Show the grid only while something is due.
- No primary action. The only button, `Add another bill`, is the rare case (once in this journey out of five saves).
- If the dialog closed itself on a full payment, nothing the user needs would be lost: the toast names the bill, amount and mode, and the chip shows the state.

### Part paid — [06-part-paid-record-payment.jpg](J2-clinic-billing-screens/06-part-paid-record-payment.jpg)
- "₹500 due" five times: badge, Due cell, `Amount received` box, button, chip.
- The primary action is wrong for the moment (hesitation 6). When the dialog is opened later from the amber chip, the same section is exactly right — one mode click and one button.
- Two stacked groups compete: `Record ₹500 payment` (dark) and `Add another bill` (text). Fine once the first is no longer pre-armed.

### Appointment Details — [07-appointment-details.jpg](J2-clinic-billing-screens/07-appointment-details.jpg)
- Thirteen label–value lines and five buttons to reach one small `Create bill`. For billing this dialog is a detour: the procedure name it was opened to check is already in the bill's `Bill line` ("Procedure: Q-switch laser").
- Stated twice: "Bill type: Procedure" and "Type: PROCEDURE"; "Calendar: Confirmed" and "Status: CONFIRMED"; `Close` button and the X.
- Hierarchy: red `Cancel Appointment` and dark `Start Visit` dominate; the money line is an outline button mid-list.
- Raw values: "Date: 2026-11-13", "Sex: FEMALE", "Status: CONFIRMED".

### Procedure with no fee — [08-procedure-no-fee-set-fees.jpg](J2-clinic-billing-screens/08-procedure-no-fee-set-fees.jpg)
- `Set fees` is a plain link out of a half-filled form: it discards the form, lands on a page with no way back, and costs five actions (measured). Removing the link and letting the admin save the fee from here would lose nothing.
- The disabled `Create bill` gives no reason; the cursor is not in the empty `Fee`.

### Changed fee, bank transfer — [09-fee-changed-neft-reference.jpg](J2-clinic-billing-screens/09-fee-changed-neft-reference.jpg)
- Good: the hint turns into "Fee list: Procedure ₹2,500, changed for this bill." with a one-click `Use ₹2,500`; the reference box appears only for the modes that have one and says "(optional)". Nothing to remove.
- The dialog is now nine stacked elements tall; removing the GST sentence gives one line back.

### Add another bill — [10-add-another-bill-prefilled.jpg](J2-clinic-billing-screens/10-add-another-bill-prefilled.jpg)
- The prefill is the problem (re-entry 2). The dark `Create bill and record ₹700` is one click from a duplicate.
- The saved bill above the form is useful context here. Keep it.
- A single transfer of ₹1,700 covering the ₹500 balance and the ₹1,200 injection has to be entered as two payments in two saves (measured).

### Daily Collection — [12-daily-collection-top.jpg](J2-clinic-billing-screens/12-daily-collection-top.jpg), [13-daily-collection-clinic-bills-pharmacy-count.jpg](J2-clinic-billing-screens/13-daily-collection-clinic-bills-pharmacy-count.jpg)
- Stated three times above the fold: clinic ₹5,600.00 — tile "Clinic", the Clinic column's Total row, tile "Clinic received". The by-mode clinic figures appear in two tables ("Whole day by payment mode" and, further down, "Clinic: consultations and procedures by payment mode").
- Heading "Whole day" directly above a tile labelled "Whole day".
- Removable: sort arrows on every column of three- and five-row tables; the "Type" column, which says "Bill" on every row; the second by-mode table whenever Refunds is all zero (it then equals the Clinic column above).
- Truncated: "Bill No." — the part that differs is the part cut off.
- The answer to "what should be in the desk drawer?" (Cash ₹200.00) is the smallest text on the screen; the three totals nobody counts by hand are the largest.
- No onward action from a due row (dead end 5). `Print` and `Download` are correctly secondary.
- The breadcrumb "← Pharmacy Report / Accounting Reports" tells a person closing the clinic's day that she is in the pharmacy.

### Daily Collection as reception — [14-daily-collection-reception-refused.jpg](J2-clinic-billing-screens/14-daily-collection-reception-refused.jpg)
- The toolbar (day picker, `Print`, `Download`) is drawn above an error — controls for a page that will not load.
- The message leads with "Forbidden resource (Reference: 64e36dce-…)" and asks for "pharmacy compliance access" — to see consultation takings.

## The Simpler Version

Same Saturday, same goal, same safety. Every amount and mode is still seen before it is recorded.

**At the desk**
1. Click **Appointments** → today's rows for the remembered doctor are on screen without scrolling.
2. Kavya: click her **Not billed** chip → the bill opens with the cursor on the payment mode.
3. Click **UPI**.
4. Click **Create bill and record ₹700 by UPI** → the dialog closes; toast "INV-… · ₹700 UPI" with a **View bill** link; chip "₹700 · Paid".
5. Arjun: click his chip.
6. Type **200** in the amount received now.
7. Click **Create bill and record ₹200 by Cash** → closes; chip "₹500 due".
8. Meenakshi: click her chip → the line already reads "Procedure: Q-switch laser"; the cursor is in the empty Fee.
9. Type **2500** in Fee.
10. Tick **Save as the Procedure fee** (admins only) — the fee list is fixed without leaving.
11. Change Fee to **3000** (the hint offers "Use ₹2,500").
12. Click **Card**.
13. Click **Create bill and record ₹3,000 by Card** → closes.
14. Arjun returns: click his **₹500 due** chip → the bill with "Record payment" ready (as today).
15. Click **Add a charge** → an empty line.
16. Type **Intralesional injection**.
17. Type **1200** → the form shows "To collect now: ₹1,700 (₹500 due + ₹1,200)".
18. Click **UPI**.
19. Click **Record ₹1,700 by UPI** → closes; chip "₹1,900 · Paid".

**Day close**
20. Click **Daily Collection** (in the receptionist's sidebar too) → "Clinic" block first: received by mode, cash to count, who still owes.
21. Type the cash in the desk drawer in **Clinic cash counted**.
22. Click **Save count** → "Clinic balanced" (the pharmacist counts the pharmacy drawer on the same page).
23. Click **Print**.

23 actions against 36 today. No information the user needs is hidden. It is two more than the
story's ideal of 21 because "Add a charge" and "Print" are counted as their own clicks here.

**Changes to get there**

| # | Change | Effort | Source |
|---|---|---|---|
| 1 | Close the bill dialog after a successful save (keep it open only on an error); toast gains **View bill** | S | `frontend/src/components/appointments/AppointmentBillDialog.tsx` (`finish`, 167–171) |
| 2 | Name the mode in the commit button ("…₹700 by UPI") and show a visible "Payment mode" label | S | same file, 45, 307, 354 |
| 3 | Keep the last mode while the dialog stays open, instead of resetting to Cash | S | same file, 129 |
| 4 | Put the cursor where the work is: the mode buttons when the fee is prefilled, `Fee` when it is empty; make the section a form so Enter commits | S | same file, 313–357 |
| 5 | Do not pre-arm "Record ₹… payment" right after a part payment; show it armed only when the dialog is opened from a due chip | S | same file, 287 |
| 6 | "Add another bill" starts empty and is renamed "Add a charge" | S | same file, 123–131, 361 |
| 7 | Replace the `Set fees` link with a "Save as the {type} fee" tick for admins; for other roles say "No standard fee — type the amount the doctor quoted" | M | same file, 330–335; `frontend/src/lib/api.ts` (`setClinicFee`) |
| 8 | Collect a balance and a new charge in one save with one mode (client records the two payments; a true multi-line bill would be L and needs the server) | M | same file, 173–215 |
| 9 | Collapse the Legend into `Quick Guide`, tuck `Visit Type` / `Room` / `Grid` behind "Filters", and scroll the calendar to the current time | S–M | `frontend/src/components/appointments/AppointmentsCalendar.tsx` (543–575, 641); `frontend/src/app/dashboard/appointments/page.tsx` |
| 10 | Give the chip a button-sized target and stop the hover actions covering the row or crowding the chip | S–M | `frontend/src/components/appointments/CalendarColumn.tsx` (301–345) |
| 11 | Drop the GST sentence from every bill; show Total / Received / Due only while something is due | S | `AppointmentBillDialog.tsx`, 267–271, 350 |
| 12 | Appointment Details: one line each for type and status, readable date and sex, one Close | S | `frontend/src/components/appointments/DoctorDayCalendar.tsx` (539–600) |
| 13 | Let roles that can take clinic payments open the clinic part of Daily Collection, with the pharmacy part hidden | M | `backend/src/modules/pharmacy/pharmacy-reports.controller.ts` (52); `frontend/src/components/layout/sidebar.tsx` (70); `frontend/src/components/pharmacy/reports/DailyCollectionReport.tsx` |
| 14 | A "Clinic cash counted" box with the same balanced / short / over banner the pharmacy has | L | `DailyCollectionReport.tsx`; `backend/src/modules/pharmacy/pharmacy-daily-collection.ts` |
| 15 | Daily Collection: one clinic total, full bill numbers, no "Type" column, no sort arrows on tiny tables, due rows link to the bill | M | `DailyCollectionReport.tsx` (133–152); `ReportTable.tsx` |
| 16 | Open a bill by link: `/dashboard/appointments?doctorId=…&date=…&bill=…`, used by search results and by Daily Collection | M | `frontend/src/app/dashboard/appointments/page.tsx` (33–68); `frontend/src/components/layout/header.tsx` (450) |
| 17 | Esc closes the dialog even while a toast is showing (cause not traced; the toast takes the first Esc) | S | `frontend/src/components/ui/toast.tsx` / `toaster.tsx` |
| 18 | Correct or cancel a bill with a reason, and print a receipt | L | new UI on `AppointmentBillDialog.tsx`; `backend/src/modules/billing/billing.service.ts` (cancel is unimplemented) |

**Steps that earn their place — do not remove**
- Choosing the payment mode. It is one click and it decides which drawer or settlement the money is checked against. Do not default it from the previous patient.
- Seeing the amount on the button before committing. This replaces a confirmation dialog and is better than one.
- Change 1 removes the "look at the saved bill" moment. That is acceptable only because looking cannot fix anything today. If change 18 is built, the toast's **View bill** is where the correction starts.
- Change 4 makes Enter commit money. It is safe only together with change 2 (the amount *and* mode on the focused button).
- The fee list staying admin-only. Change 7 keeps that rule; it only removes the trip.

## Clarity Issues

**Words that assume knowledge**
- `Bill line` — accounting wording for "what is being charged". "Charge for" would be understood at once.
- `Paid now` (create) vs `Amount received` (later) vs "Received" (saved bill) vs "Received today" (report): one idea, four labels.
- `Fee` (create) vs "Total" (saved bill) vs "Amount" (report).
- "Payment mode" (dialog, report tables) vs "Paid by" (Clinic bills column).
- "No fee set for Procedure." — states a fact about a page the receptionist cannot open, and no instruction.
- "From fee list: …" / "Fee list: …, changed for this bill." — good wording, but "fee list" names a page only admins see.
- `Add another bill` — the user's thought is "add the injection". On a second bill the subtitle and hint still say "First consultation".
- The row says "First"; the fee list, dialog and tooltip say "First consultation". Beside the status it reads "First Confirmed".
- `INFO`, `RESCHED`, `START` — capitals and an abbreviation.
- "Bill" everywhere on screen, numbered `INV-…`.
- The patient page marks the **Billing** step green for Suresh while ₹700 is due, and nowhere shows the due (measured; `PatientProgressTracker.tsx:145`). "Billing done" there means "a bill exists".
- Fee list description: "Create bill on the appointments calendar starts from these fees" — "Create bill" is used as a noun and the sentence has to be read twice. "The desk" is used for the receptionist.

**Raw or inconsistent values**
- Dates in four forms on one journey: "13 Nov 2026, 02:05 pm" (bill), "13/11/2026 14:05" (Daily Collection), "2026-11-13" (Appointment Details), and the native date box on Appointments (browser-dependent).
- "Sex: FEMALE", "Type: PROCEDURE", "Status: CONFIRMED" in Appointment Details.
- Money: "₹700" in the bill and chip, "700.00" without ₹ in report tables, "₹5,600.00" in report tiles.

**Daily Collection**
- "Forbidden resource (Reference: …) Your role cannot open pharmacy reports. Ask … for pharmacy compliance access." — shown to a receptionist looking for consultation takings.
- Breadcrumb "Pharmacy Report / Accounting Reports" over a page whose first two blocks are clinic money.
- "Clinic" here means consultations and procedures only; elsewhere it means the whole business. "Whole day" is both a heading and a tile.
- "Entry" as the column name for the time a bill was made.
- "Pharmacy not counted yet…" is the only count instruction on the page; nothing says the desk's cash is not part of it until "How these figures are worked out" is opened.

## Already Minimal

- **The standard bill.** Chip → `Create bill and record ₹700`: patient, bill type, line, fee, full amount and Cash are all prefilled. Two actions to record money, which is the story's ideal. Only the close afterwards is surplus.
- **No confirmation dialogs.** The amount in the button label does the job without an extra step.
- **Part payment.** Overwrite `Paid now`; the button follows ("…record ₹200"). Set it to 0 and the modes disappear and the button reads `Create bill`. Nothing to simplify.
- **Paying a balance later.** Due chip → amount prefilled → mode → `Record ₹500 payment`: three actions, at ideal.
- **Changing the fee.** Type over it; the hint names the list price and offers a one-click `Use ₹2,500`.
- **Reference numbers.** Asked only for bank transfer and cheque, and optional.
- **Validation text.** "Enter the fee as an amount above 0, for example 500." and "Paid now can be from 0 up to the fee." appear as you type and say what to do.
- **Billed chips.** "₹700 · Paid", "₹700 due", "₹1,900 · Paid" — the row answers "who still owes?" without opening anything.
- **Fee list page.** Three rows, Enter saves, who-and-when on each. One click over ideal and not worth a redesign.
- **Daily Collection day picker** and the clinic by-mode table: once found, "how much cash, UPI and card did the clinic take" is answered in one table with no input.
