# J1 — Front desk: a receptionist's morning

**Primary story**: STORY-031 (`docs/ux-paths/topics/appointments-rooms.md`), with STORY-021 / 022 / 023 / 024 and the
alternate routes in STORY-011 / 013 / 014 (`docs/ux-paths/topics/patients.md`).
**Persona**: receptionist (`reception`, shown as "Riya Sharma"). **Walked live** on 13 Nov 2026 (≈14:00 IST) at
1440×900, on **Dr Praneeta Jain's** calendar only, with patients Anitha / Bharat / Chitra **Jone** (9848055501–03).
**Verdict**: **convoluted** — not because any one flow is long, but because the Appointments page puts the working
surface below the fold, register-and-book is interrupted by an uninvited dialog, cross-day work is a scroll
ping-pong, and two of the "find" routes dead-end. Confirm, cancel and the reschedule interaction itself are good.

Evidence tags: **[measured]** = done or counted in the live app (screenshot or DOM read-out);
**[suspected]** = read from code only. Screenshots are in `J1-front-desk-screens/`.

What was walked: open Appointments → register a new walk-in from the calendar and book her (STORY-022) → find an
existing patient by name and book (STORY-021) → confirm (STORY-023) → move an appointment to another day
(STORY-024) → cancel (STORY-023). Alternates walked: Patients › `New Patient` (STORY-011), Patients phone search
(STORY-013), patient record › `Book appointment` deep link, Patients walk-in auto-book, header search (STORY-014),
Dashboard "Today's Appointments". Not walked: procedure-with-room booking, overbooking, the Rooms page (steps 18–34
of STORY-031) — nothing below makes claims about them.

---

## Friction Scorecard

Counting unit: **one step = one click, one typed field, or one select choice**. Forced scrolls are counted
separately because they cost time but are not decisions. "Story ideal" is the number the story itself states.

| Task (as walked) | Story ideal | Measured steps | Forced scrolls | Simpler version |
|---|---|---|---|---|
| Open Appointments | 1 | 1 | 0 | 1 |
| New walk-in: register + book (STORY-022) | 5 | 9 | 2 | 6 |
| Existing patient, today: find + book (STORY-021) | 3 (5 incl. open page + pick day) | 4 | 2 | 4 |
| Confirm one patient (STORY-023) | 1 | 2 | 1 | 1 |
| Move to another day and come back (STORY-024) | 3 | 4 | 3 | 3 |
| Cancel one patient (STORY-023) | 2 | 3 | 0 | 3 |
| **Journey total** | **15** | **23** | **8** | **18** |

| Scorecard line | Count | Notes |
|---|---|---|
| Steps, actual / ideal | **23 / 15** (+8 forced scrolls) | Extra steps cluster in the walk-in (+4) and in getting back to today (+1); the scrolls are everywhere |
| Decisions the user must make | 12 | 4 are needless (below) |
| Needless decisions | **4** | `Calendar` vs `Slots` tab; room cards on an OPD booking; three ways to create a patient; `Book appointment` vs `Book` on the record |
| Re-entry | **4** | phone typed in search → retyped in `Phone *`; half-typed name corrected; phone typed in Patients search → retyped in `Create Patient`; today's date re-entered after a cross-day move |
| Confirmations guarding nothing | **0** | The one true confirmation (cancel) guards an irreversible action. `Confirm Booking` is a form with defaults, not a second "are you sure" |
| Dead ends | **3** hard, 2 soft | header-search patient result; header-search appointment result; Dashboard appointment rows · soft: Patients empty state; Patients list after `Create` |
| Hesitations | **12** | listed below |

**Step detail [measured]**

- *Walk-in*: type name in `Patient` (dialog opens itself after "Anit") → fix `First Name` → `Last Name` → `Age` →
  `Gender` → `Phone` → `Create Patient` → *scroll to grid* → click tile → *scroll inside dialog* → `Confirm Booking`.
- *Existing patient*: type "Anitha" → click result → *scroll* → click tile → *scroll inside dialog* → `Confirm Booking`.
- *Confirm*: *scroll to grid* → click tile → `Confirm`.
- *Move day*: hover → `RESCHED` → *scroll up* → `Date` → *scroll down* → click tile → *scroll up* → `Date` back to today.
- *Cancel*: click tile → `Cancel Appointment` → `Yes, Cancel Appointment`.

**Decisions** — carried by a default (fine): Doctor (restored / first doctor), Date (today), `Grid` 30 minutes,
`Visit Type` / `Room` filters, `Duration` 30 minutes, `Appointment Type` OPD, `Consultation Type` Offline.
Genuinely the user's: which column (Scheduled = phone booking, Confirmed = walk-in), which time, which action in
"Appointment Details", gender. Needless: the four in the table. One default is *wrong* rather than missing:
`Gender *` starts on "Other" (`PatientQuickCreateDialog.tsx:74`), so skipping it silently saves a wrong value.

**Dead ends [measured]**

1. Header search → patient result → `/dashboard/patients?search=cmwepzjhu00347d00chwmif10` → "No patients found"
   ([14-header-search-landing.jpg](J1-front-desk-screens/14-header-search-landing.jpg); `header.tsx:424`).
2. Header search → "Anitha Jone - 16:30-17:00 · Appointment" → plain `/dashboard/appointments`, nothing opened,
   highlighted or dated (`header.tsx:292`).
3. Dashboard "Today's Appointments" rows do nothing when clicked; only `View All Appointments` leaves the card
   ([01-dashboard.jpg](J1-front-desk-screens/01-dashboard.jpg)).
4. *Soft*: Patients "No patients found — Adjust your search or filters" offers no "register this number"; the
   `New Patient` button is elsewhere and opens empty (`PatientsManagement.tsx:1074`).
5. *Soft*: after Patients › `Create` the list row offers `View`, `Start Visit`, `More` (Edit / Archive / Link portal
   / WhatsApp) — no way to book from the row ([11-patients-list-row.jpg](J1-front-desk-screens/11-patients-list-row.jpg)).

**Hesitations [measured unless marked]**

1. On arrival **no bookable row is on screen**: the first tile sits at y = 910 px in a 900 px viewport; today's
   "now" row (14:30) at y = 1350 ([02-appointments-arrival.jpg](J1-front-desk-screens/02-appointments-arrival.jpg)).
2. "Add New Patient" **opens by itself mid-typing**. Typing `Anitha Jone` popped it after "Anit" (First Name
   "Anit"). Typing the phone `9848055501` popped it after "984" and the remaining digits went into `First Name`
   ("8055501"), `Phone *` empty ([03-phone-search-auto-dialog.jpg](J1-front-desk-screens/03-phone-search-auto-dialog.jpg)).
3. Scrolled to the grid, the **column headers are gone** (not sticky) — two identical white columns, no way to tell
   Scheduled from Confirmed except a 2 px grey vs blue top rule ([05-day-grid-hover.jpg](J1-front-desk-screens/05-day-grid-hover.jpg)).
4. "Book Appointment": **`Confirm Booking` is below the dialog's own fold** (content 832 px in a 718 px box) for a
   default OPD booking ([06-book-appointment-dialog.jpg](J1-front-desk-screens/06-book-appointment-dialog.jpg)).
5. Same dialog: two large room cards for an OPD visit — "must I pick one?" — answered only by the last, cut-off line.
6. Clicking a free time first (the natural gesture) gives a red error toast "Patient required"; the patient box is
   ~800 px above, off screen.
7. Hover buttons `INFO` `RESCHED` `START` cover the tile's own "First / Scheduled" tags; the morning's most
   frequent action, Confirm, is not among them.
8. "Appointment Details": five footer buttons in two rows, red `Cancel Appointment` directly beside dark `Confirm`
   ([07-appointment-details.jpg](J1-front-desk-screens/07-appointment-details.jpg)). For a *Confirmed* appointment
   the dark button becomes `Start Visit`.
9. Reschedule banner says "To move to another day, change the date first" — the `Date` box is at y = −688 px
   ([08-reschedule-banner.jpg](J1-front-desk-screens/08-reschedule-banner.jpg)).
10. After a booking the patient stays armed ("Selected: …" badge) while the search box is empty; the next tile
    click books the same person. (Typing a new search does clear it — `Clear` is not required to switch.)
11. Past and future tiles look almost the same; only a thin red line marks "now" (05).
12. After the booking the green "Appointment Successfully Booked!" banner renders above the grid — off screen when
    you are looking at the grid; only the green ring is visible.

---

## Take-away Pass

### Dashboard — [01-dashboard.jpg](J1-front-desk-screens/01-dashboard.jpg)
- **Removable for this role**: `Total Users`, `Active Users`, `Total Branches`, `System Status` cards and the
  "System Alerts — All systems operational" card. None is used by any front-desk step; together they take the
  whole top half (`app/dashboard/page.tsx:219-234`).
- **Keep, but fix**: "Today's Appointments" is the only useful block. It mixes all doctors without naming them,
  shows raw statuses (`IN_PROGRESS`), and rows are not links.
- **Primary action**: none. The receptionist's next step ("who do I still have to call?") is not offered.

### Appointments, on arrival — [02-appointments-arrival.jpg](J1-front-desk-screens/02-appointments-arrival.jpg)
Above the first bookable row there are, in order: page title, controls card, tab strip, card title + description,
filter row, Legend box, column headers. That is ~910 px of chrome before content.
- **Remove**: card title "Doctor Calendar" + description "Click a free time in the Scheduled or Confirmed column to
  book into that calendar." (`AppointmentsCalendar.tsx:458`) — the page is already titled Appointments, and the
  instruction is repeated in the Legend, the column headers and the Quick Guide.
- **Remove from the page, keep in Quick Guide**: the whole Legend (`AppointmentsCalendar.tsx:641+`). It restates
  the Scheduled/Confirmed definitions (3rd of 4 places) and a colour key with eight swatches, three of which are
  near-white and hard to tell apart on screen (Telemedicine, Past (OPD), Past (Procedure)).
- **Remove**: the `Slots` tab. Same grid, same dialogs [measured]; the user gains nothing from choosing.
- **Collapse behind "Filters"**: `Visit Type`, `Room`, `Grid`. No step of the walked journey touched them.
- **Demote**: `Quick Guide` is a full-width button in the same row and weight as `Doctor` and `Date`.
- **Hierarchy**: `Patient` — the one input every booking needs — is the third of four equal-looking small boxes in
  the filter row, visually a *filter*, with its placeholder truncated ("Search patient by name/"). It is not a
  filter; it arms the next click. It should be the most prominent control on the page.
- **Stated more than once**: Scheduled/Confirmed explanation ×4 (card description, Legend, column headers, Quick
  Guide); "Confirmed: Confirmed, walk-ins and visits." defines the word with itself.
- **Primary action**: none visible; the page's real primary action (a free time) is off screen.

### Patient search + auto dialog — [03-phone-search-auto-dialog.jpg](J1-front-desk-screens/03-phone-search-auto-dialog.jpg)
- **Remove**: the automatic opening (`AppointmentsCalendar.tsx:292-295`). The explicit
  `+ Add "…" as a new patient` button already exists underneath; the auto-open only ever fires on a partial query.
- **Remove**: amber strip "Select a patient from the list or add them as new before booking." — it appears on
  every keystroke, directly above the list it describes, and pushes the grid down another 50 px.
- A one-letter query lists unrelated patients ("A" returned 9 rows including "John Doe") — noise before signal.

### Add New Patient — [04-add-new-patient.jpg](J1-front-desk-screens/04-add-new-patient.jpg)
- **Defer under "More details"**: `Email`, `ABHA ID`, `Consultation Type` — three of eight fields, none needed to
  seat a walk-in, and they push the buttons down.
- **Remove**: description "Capture minimal details to create a patient record without leaving the scheduling flow."
- **Keep**: First/Last name, Age, Gender, Phone. Gender earns its step (patient identity) — but it must be asked,
  not defaulted to "Other".
- **Hierarchy**: one primary (`Create Patient`) — correct.
- Behind the dialog the page still shows `+ Add "Anit" as a new patient`: the same action twice.

### Day grid — [05-day-grid-hover.jpg](J1-front-desk-screens/05-day-grid-hover.jpg)
- **Keep**: the two-column grid, token `#`, time, name, status tag, `Not billed` chip. This is the right surface.
- **Add back, not take away**: sticky column headers; a visible past/future difference.
- **Hover actions**: three loud filled buttons (grey / orange / blue) per tile, none of them the morning's main
  job. For a Scheduled tile the receptionist needs Confirm; `START` is the doctor's action. `INFO` duplicates a
  plain click on the tile.
- **Removable tag**: "First" (bill type) on every tile — it matters at billing time, not when scanning the day.

### Book Appointment — [06-book-appointment-dialog.jpg](J1-front-desk-screens/06-book-appointment-dialog.jpg)
- **Keep**: the summary block (Patient, Phone, Date, Time Slot). With a patient that stays armed between
  bookings, this is the only identity check before a booking is made — it earns its place.
- **Collapse**: "Room Availability for OPD" (two cards, ~250 px) behind "Add a room (optional)" when the type is
  OPD. Keep it open and required for Procedure, as now.
- **Remove**: helper "Adjusts end time and validates room availability for the new duration." and "Regular
  outpatient consultation" — each explains a self-explanatory default.
- **Stated twice per card**: black "Available" badge and green "✓ Available for 16:30-17:00".
- **Hierarchy**: one primary, but off screen until scrolled (`AppointmentBookingDialog.tsx:253`, `max-h-[80vh]`).

### Appointment Details — [07-appointment-details.jpg](J1-front-desk-screens/07-appointment-details.jpg)
- **Remove**: `Close` (the ✕ and Esc already do it); "Status: SCHEDULED" (same fact as "Calendar: Scheduled").
- **Demote / move**: `Cancel Appointment` — the loudest element (red, filled) sits beside the primary. Make it a
  quiet text button on the left; the red belongs on the confirmation that follows.
- **Role-fit**: `Start Visit` and `Create bill` are not part of the confirmation call. Keep them, as outline.
- **Hierarchy**: two filled buttons (red + dark). Should be one.
- Eleven label:value lines at equal weight; the two the caller needs (name, phone) are in the middle.

### Reschedule — [08-reschedule-banner.jpg](J1-front-desk-screens/08-reschedule-banner.jpg), [09-reschedule-change-date.jpg](J1-front-desk-screens/09-reschedule-change-date.jpg)
- Nothing to remove; the sticky banner is the right idea and its wording updates to "from 13 Nov 2026 to
  16 Nov 2026" once the date changes.
- **Missing, not surplus**: the control the banner tells you to use is a screen away. In 09 the banner has
  scrolled to the bottom edge while the user is at the `Date` box.

### Cancel confirmation — [10-cancel-confirm.jpg](J1-front-desk-screens/10-cancel-confirm.jpg)
- Minimal. Restates who / when / what, names both buttons by outcome. Only nit: Date shown as `2026-11-16`.

### Patients list — [11-patients-list-row.jpg](J1-front-desk-screens/11-patients-list-row.jpg)
- **Three headings for one list**: "Patients Management" / "Patients" / "Patient Records", each with its own
  subtitle saying the same thing. Keep one.
- **Collapse**: `All Genders`, `All Consultations`, `All Time`, `20 / page`, `Clear Filters`, `Export CSV` — six
  controls competing with the one search box a receptionist uses.
- **Columns never filled at the desk**: ABHA ID, Referral, Consultation show "—"; with them the action buttons
  have no room and wrap one letter per line.
- **Two identifiers per row**: "ID: kakvbjp3" under the name and "Patient Code P5MA9 · Copy code".
- **Primary action**: `Start Visit` is the only filled button on every row; for the front desk the likely next
  action is to book.

### Create Patient (Patients page) — [12-create-patient-walkin.jpg](J1-front-desk-screens/12-create-patient-walkin.jpg)
- 14 controls, growing to 16 when `Patient Type` = Walk-in, in a dialog taller than the screen (983 px in 866);
  `Create` is below the fold. No field is marked required.
- **Defer**: ABHA ID, Email, Address, Emergency Contact, Primary Doctor (already "Automatic"), "How did the
  patient hear about us?".
- **Progressive disclosure is backwards**: `Doctor (for walk-in)` is shown before the user has said this is a
  walk-in; the two fields that appear after choosing Walk-in arrive at the very bottom.
- Worth keeping: the walk-in route itself — one `Create` both registers and books the next free Confirmed time.

### Patient record — [13-patient-detail.jpg](J1-front-desk-screens/13-patient-detail.jpg)
- **Duplicate**: `Book appointment` (header) and `Book` (under the tracker) go to the same place.
- **Removable for this role**: the Start → Document → Complete → Prescribe → Billing → Follow-up tracker.
- **Remove**: "ID: cmweq1mef004i7d00kakvbjp3" (internal key) beside "Code: P5MA9".
- **Primary action**: `Start new visit` is filled; `Book appointment` is outline.

---

## The Simpler Version

Same goals, same safety checks, 18 steps and no forced scrolling (today: 23 + 8).

1. Sign in → land on **Appointments, today**, grid visible from the first row at or after "now"; one sticky toolbar:
   `Doctor` · `‹ Today ›` date stepper · a wide **patient search**. Column headers stick. *(1 step: none if it is
   the landing page)*
2. **Confirm calls**: Scheduled tiles show the phone number and a `Confirm` button on hover → one click moves the
   patient to Confirmed, toast with Undo. *(1)*
3. **Cancel**: click tile → `Cancel appointment` → `Yes, cancel appointment`. *(3 — unchanged; the warning stays)*
4. **Move to another day**: `Reschedule` on the tile → banner carries its own `‹ ›` day stepper and date → click the
   new time → the page returns to the day you started on, toast "Moved to Mon 16 Nov, 10:00" with a link to that
   day. *(3)*
5. **Phone booking, existing patient**: type name or phone → pick the result → click a time → `Book` in the
   dialog (summary + type/duration; rooms collapsed for OPD; button always visible). Selection clears after the
   booking. *(4)*
6. **New walk-in**: type name *or* phone → results end with a row "+ New patient '98480 55501'" (nothing opens by
   itself) → dialog arrives with whichever of name/phone was typed already in the right field → fill the other,
   age, gender (three buttons, none preselected) → **`Create & book next free time (14:30)`** as the primary, with
   `Create only` beside it for when a specific time is wanted. *(6)*
7. **Finding someone from anywhere**: header search → patient result opens the record; appointment result opens
   Appointments on that doctor and day with the appointment's details open.

**Changes to get there**

| # | Change | Effort | Files |
|---|---|---|---|
| 1 | Bring the grid above the fold: drop the "Doctor Calendar" title/description, move the Legend into Quick Guide, fold `Visit Type` / `Room` / `Grid` into a "Filters" disclosure, shrink `Quick Guide` to an icon button | S | `frontend/src/components/appointments/AppointmentsCalendar.tsx:455-460, 541-585, 641-700`; `frontend/src/app/dashboard/appointments/page.tsx:92-101` |
| 2 | One sticky toolbar: Doctor, date with `‹ Today ›`, and a wide patient search (promoted out of the filter row); sticky column headers; scroll the grid to "now" on today | M | `page.tsx:70-102`; `AppointmentsCalendar.tsx:569-572`; `CalendarColumn.tsx:219-221` |
| 3 | Stop auto-opening "Add New Patient"; make "+ New patient …" the last row of the result list; send an all-digit query to `Phone`, not `First Name`; drop the amber "Select a patient…" strip | S | `AppointmentsCalendar.tsx:292-295, 597-640`; `PatientQuickCreateDialog.tsx:35-55` |
| 4 | Quick-create: no default gender (segmented M / F / Other); `Email`, `ABHA ID`, `Consultation Type` under "More details"; add primary "Create & book next free time" reusing the Patients walk-in auto-book | M | `PatientQuickCreateDialog.tsx:74, 95, 239-256`; walk-in booking logic in `frontend/src/components/patients/PatientsManagement.tsx` (near `:877-902`) |
| 5 | Reschedule banner gets `‹ ›` + date; after the move return to the starting date and link the new day from the toast | S | `DoctorDayCalendar.tsx:452` and its `place()` handler |
| 6 | Booking dialog: collapse room cards for OPD, pin the footer, drop the two helper lines | S | `AppointmentBookingDialog.tsx:253, 283, 350-410` |
| 7 | Clear the selected patient after a successful booking (or keep it in a sticky chip beside the grid) and show the success message as a toast, like confirm/reschedule do | S | `AppointmentsCalendar.tsx:392-410, 588-594, 706` |
| 8 | Tile hover: `Confirm` on Scheduled tiles; rename `RESCHED` → `Reschedule`; drop `INFO` (tile click does it); stop the buttons covering the tags | S | `CalendarColumn.tsx:300-340` |
| 9 | Appointment Details: one filled button; `Cancel appointment` as a quiet left-aligned action; drop `Close` and the duplicate Status line; human-readable date | S | `DoctorDayCalendar.tsx:543, 596-640, 663` |
| 10 | Remove the `Slots` tab (and its tour step) | M | `page.tsx:128-140`; delete `AppointmentScheduler.tsx`; `components/tours/ReceptionistTour.tsx` |
| 11 | Header search: patient → `/dashboard/patients/{id}`; appointment → Appointments with doctor, date and the appointment opened | S (patient) / M (appointment) | `frontend/src/components/layout/header.tsx:424, 292`; `page.tsx` (read `date`, `doctorId`, `appointmentId`) |
| 12 | Patients: empty state offers "Register 98480… as a new patient" with the number carried in; add `Book` to row actions; hide never-filled columns so actions fit | S | `PatientsManagement.tsx:1074, 1186-1195` |
| 13 | Patients `Create Patient`: mark required fields, ask `Patient Type` first, show walk-in fields only then, move the rest under "More details" | M | `PatientsManagement.tsx:770-905` |
| 14 | Reception dashboard: replace user/branch/system cards with "To confirm today", "Arrived", per-doctor today list whose rows open the appointment | M | `frontend/src/app/dashboard/page.tsx:219-234, 420-447` |
| 15 | Patient record: one booking button; hide the internal ID | S | `frontend/src/app/dashboard/patients/[id]/page.tsx:219-221`; `components/patients/PatientProgressTracker.tsx:193` |

Steps that stay because they earn their place: the cancel warning (irreversible, a patient loses a slot); the
"Book Appointment" summary (patient-identity check); asking gender and phone for a new record; choosing the column.

---

## Clarity Issues

| Where | What it says | Problem |
|---|---|---|
| Appointments | "Calendar" tab · "Doctor Calendar" card · "book into that calendar" · "in the Scheduled calendar" · "Calendar: Scheduled" | One word for a tab, a card, and each of the two columns |
| Appointments | "Scheduled" | A column, a status tag on the tile, and the verb in "Anitha Jone scheduled for 16:30-17:00 in the Scheduled calendar" — the same "scheduled for" sentence is used when booking into Confirmed (`AppointmentsCalendar.tsx:709`) [suspected] |
| Legend / column header | "Confirmed: Confirmed, walk-ins and visits." | Defines the word with itself |
| Tabs / dialogs | `Slots` (tab) · "Slot:" (details) · "Time Slot:" (booking) · "Time:" (cancel) | Four names for a time; the `Slots` tab is not about slots any more than `Calendar` is |
| Buttons | `Confirm` · `Confirm Booking` · `Yes, Cancel Appointment` | Three different "confirm"s within one page |
| Tile hover | `INFO` · `RESCHED` · `START` | Shouted abbreviations; `START` does not say what starts |
| Tile | "First" | Means bill type "First consultation" (`appointment-billing-view.ts:23`); beside token "#2" it reads like queue order |
| Filter row | `Grid` · `Visit Type` | "Grid" = row height; the same thing is `Appointment Type` in the dialog |
| Dates | `11/13/2026` (Date box) · `2026-11-13` (details, cancel) · `13 Nov 2026` (booking dialog, toasts, banner) | Three formats in one journey; the first is month-first |
| Details | "Sex: FEMALE", "Status: SCHEDULED"; Dashboard "IN_PROGRESS" | Raw database values; "Sex" here, "Gender" on every form |
| New patient | `New Patient` → "Create Patient" → `Create` (Patients) vs `+ Add "…" as a new patient` → "Add New Patient" → `Create Patient` (Appointments) | Five labels for one action |
| Add New Patient | "Capture minimal details to create a patient record without leaving the scheduling flow." | Developer's description of the feature, not an instruction |
| Add New Patient | Phone placeholder "(e.g., +1234567890 or 9876543210)" | Foreign-format example at an Indian front desk; truncates the field |
| Book Appointment | "Room selection is optional for opd appointments." | Lower-cased code value; the answer to the screen's main question is its last, smallest line |
| Patient search | "Tip: enter patient name and phone, then use "Add" to create a new record instantly." (`AppointmentsCalendar.tsx:637`) | The button is labelled `+ Add "…" as a new patient`, and a typed phone is not carried into `Phone *` [measured]; whether a combined name + phone query can match is [suspected] not |
| No-patient click | red toast "Patient required" | Error styling for doing things in a reasonable order |
| Doctor names | "Praneeta Jain" (Appointments) · "Dr. Praneeta Jain" (walk-in form, header search) | Inconsistent title |
| Patients | "Patients Management" / "Patients" / "Patient Records" | Three titles, three subtitles |
| Patients | "ID: kakvbjp3", "Patient Code P5MA9", record header "ID: cmweq1mef004i7d00kakvbjp3" | Three identifiers; which one does the patient quote? |
| Create Patient | `Patient Type`: "Non walk-in"; `Consultation Type`: "Offline (In-Clinic Visit)" | Named by what they are not |
| Record, list, details | `Start new visit` / `Start Visit` as the filled button for reception | Reception has no Visits item in the sidebar; the label does not say this hands the patient to the doctor |
| Dashboard | "Here's what's happening at your clinic today" above Total Users 8 | Promise and content do not match for this role |

---

## Already Minimal

- **Confirm** — tile → `Confirm`; no confirmation dialog; the tile moves columns at the same time; toast says
  exactly what happened ("Anitha Jone is now at 16:30-17:00 in Confirmed."); reversible with `Move to Scheduled`.
  Only a hover shortcut could shorten it.
- **Cancel** — three clicks, one warning that restates patient / date / time and labels both buttons by outcome
  (`Keep Appointment` / `Yes, Cancel Appointment`). Do not remove this step.
- **The reschedule interaction** — pick up, banner, click the new time, done; length is kept, the tile label
  becomes "Move to 10:00-10:30", the banner names both dates, no extra confirmation, a specific toast. Only the
  date control's position and the missing return trip cost anything.
- **Booking an existing patient** — 4 steps, at the story's ideal once the page is open. Defaults (30 minutes,
  OPD, no room) carry every decision; the dialog needs one click.
- **Doctor and date defaults** — doctor remembered, date is today; neither was touched.
- **Patient search matching** — name or phone, from the second character, result rows show "Name — phone".
- **Column headers** — "2 patients to confirm" / "1 patient confirmed" is the morning's to-do count in four words.
- **Phone as a `tel:` link** in Appointment Details.
- **Patients phone search** — eight digits found the record in one field.
- **Record → `Book appointment` deep link** — arrives with the patient already selected (name display bug aside).
- **Walk-in auto-book on Patients › Create** — one save registers the patient and books the next free Confirmed
  time, with a toast naming calendar, date and time. This is the behaviour the calendar's quick-create should borrow.

---

## Functional bugs tripped over (not verified further)

- Header search → patient result lands on the Patients list with the internal ID in the search box → "No patients found" (`header.tsx:424`).
- `?patientId=` deep link: badge reads "Selected: — 9848055502" (name blank) (`usePrefilledPatient.ts` → `AppointmentsCalendar.tsx:591`).
- Auto-opened "Add New Patient" takes focus mid-typing: remaining phone digits are typed into `First Name`.
- "Book Appointment" room cards: the "Available" badge wraps to "Avai / labl / e" (screenshot 06).
- Patients table: `View` / `Start Visit` wrap one letter per line at 1440 px and the `More` button is not visible (screenshot 11).
- After a booking, the green "newly booked" ring is also drawn on the empty tile at the same time in the other column (seen live; screenshot not kept).
