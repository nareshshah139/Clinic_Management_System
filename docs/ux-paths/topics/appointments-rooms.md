# Appointments, rooms & doctor availability

> Source: read-only analysis of `frontend/src/app/dashboard/appointments/*`, `frontend/src/components/appointments/*`,
> `frontend/src/app/dashboard/rooms/page.tsx`, `frontend/src/components/rooms/*`,
> `frontend/src/components/users/DoctorAvailabilitySettings.tsx`, `frontend/src/lib/doctor-availability.ts`,
> `backend/src/modules/appointments/*`, `backend/src/modules/doctor-availability/*`.
> Labels in "quotes" / `code` are the strings in the source. Nothing here was walked in a browser; where a
> behaviour is inferred from the code rather than read off a label it is marked *(from code)*.
>
> Shared vocabulary used below: the Appointments page has a controls card (`Doctor`, `Date`, `Quick Guide`) above two
> tabs, **Calendar** ("Doctor Calendar") and **Slots** ("Appointment Scheduler"). Both tabs render the same day grid:
> a time gutter and two columns, **Scheduled** ("Booked ahead. Call to confirm.") and **Confirmed**
> ("Confirmed, walk-ins and visits."). The code calls each column a "calendar".

---

## STORY-001: Book a review visit for an existing patient who phones in

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

### Steps
1. Click `Appointments` in the sidebar (Clinical) → page "Appointments": controls card with `Doctor`, `Date`, `Quick Guide`; tabs `Calendar` (selected) and `Slots`; card "Doctor Calendar" — "Click a free time in the Scheduled or Confirmed column to book into that calendar."
2. Check the `Doctor` select → it already shows "Shravya Reddy" (last choice is restored from `localStorage`; names are listed without "Dr.").
3. Change `Date` to tomorrow using the native date input → the grid reloads ("Loading schedule..." or the "Refreshing schedule…" overlay). *The date is not remembered: every page load starts on today.*
4. Type `Meena` in the `Patient` box ("Search patient by name/phone") → a search fires on every keystroke; an amber hint "Select a patient from the list or add them as new before booking." appears, then a result list under the filter row: "Meenakshi Iyer — 9848012345". *After the first letter alone the list shows ten unrelated patients, because the server ignores searches shorter than two characters (from code: `patients.service.ts`).*
5. Click the "Meenakshi Iyer — 9848012345" row → badge "Selected: Meenakshi Iyer — 9848012345" with a `Clear` button; the hint and list disappear.
6. Scroll down past the Legend box to the grid and click the free 11:00 tile in the **Scheduled** column (tooltip "Book 11:00-11:15") → dialog "Book Appointment" showing Patient, Phone, Date and "Time Slot: 11:00-11:30".
7. Glance at the defaults — `Duration` "30 minutes", `Appointment Type *` "OPD Consultation" ("Regular outpatient consultation"), room cards under "Room Availability for OPD" with "Room selection is optional for opd appointments." → Riya hesitates over whether she must pick a room, decides not to.
8. Click `Confirm Booking` → button reads "Booking...", the tile turns amber ("Booking In Progress"), the dialog closes and a green banner appears above the grid: "Appointment Successfully Booked!" / "Meenakshi Iyer scheduled for 11:00-11:30 in the Scheduled calendar (OPD)". The tile gets a green ring; the Scheduled column header now reads "1 patient to confirm". The banner and ring clear after 5 seconds.

### Variations
- **Book straight into Confirmed**: click the tile in the right-hand column instead; the banner says "…in the Confirmed calendar" and the appointment's status is CONFIRMED from the start.
- **Longer visit**: in step 7 change `Duration` to 45/60/90 minutes; the "Time Slot" line recomputes. Dragging across several tiles (promised by the Quick Guide: "Drag across tiles to select custom time ranges") opens the same dialog, but the dialog's Duration stays at its own value (30 minutes, or whatever was chosen last) rather than the dragged range *(from code: `durationMinutes` is initialised once in `AppointmentBookingDialog.tsx`)*.
- **Arrive from the patient chart**: with `?patientId=` the badge is already present, so steps 4–5 vanish.
- **Doctor opted in to WhatsApp**: the server sends a confirmation message with the token number; nothing on screen says whether it was sent.

### Edge Cases
- **Click a tile with no patient selected**: destructive toast "Patient required — Search and select a patient before booking a slot." The cursor is `not-allowed` but the tile still looks free.
- **Past time today**: tiles are greyed and ignore clicks; no message.
- **Doctor on leave / clinic holiday**: red banner above the grid "Not bookable: Leave all day (…)". Tiles remain clickable; the dialog then shows "Cannot book 11:00-11:30: Leave all day." and `Confirm Booking` is disabled.
- **Outside working hours**: amber text in the dialog "Warning: selected time … is outside doctor's working hours (…)"; booking is still allowed.
- **Slot taken meanwhile**: toast "Scheduling Conflict" with the server message and "— Try: 11:30-12:00, …" suggestions; the dialog stays open.
- **Patient stays selected after booking**: the "Selected:" badge is not cleared, so the next click on a free tile books the same patient again unless `Clear` is pressed.
- **Same information, several surfaces**: the Scheduled/Confirmed explanation is printed in the card description, in the Legend, in each column header and in the Quick Guide dialog.

---

## STORY-002: Register and book a brand-new walk-in from the calendar

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

### Steps
1. Click in the `Patient` box and type `Arjun Rao` → after the keystroke whose search returns nothing, the dialog "Add New Patient" opens on its own ("Capture minimal details to create a patient record without leaving the scheduling flow.") with `First Name *` = "Arjun" and `Last Name` = "Rao" (or however much had been typed when it popped up). *Riya did not ask for a dialog; she was still typing.*
2. Correct the name fields if the dialog opened mid-word.
3. Type `24` in `Age (years)`.
4. Open `Gender *` (pre-set to "Other") and choose "Male".
5. Type `9000456789` in `Phone *` (placeholder "Phone number (e.g., +1234567890 or 9876543210)").
6. Skip `Email`, `ABHA ID`; leave `Consultation Type` on "Offline (In-Clinic Visit)".
7. Click `Create Patient` → button "Saving…", toast "Patient created — Arjun Rao has been added", dialog closes, badge "Selected: Arjun Rao — 9000456789".
8. In the **Confirmed** column click the next free tile, 10:30 → dialog "Book Appointment" ("Time Slot: 10:30-11:00").
9. Click `Confirm Booking` → banner "Appointment Successfully Booked! Arjun Rao scheduled for 10:30-11:00 in the Confirmed calendar (OPD)"; his tile shows a token ("#7"), the name, and a "Confirmed" status dot/badge; header "… patients confirmed".

### Variations
- **Search by phone first (the natural duplicate check)**: typing `9000…` finds nothing and the dialog pops up with the digits in `First Name *` and `Phone *` empty — the dialog only reads a phone number from text after an em dash "—" *(from code: `parseInitialValues`)*. She must clear First Name and retype the number.
- **Dismiss the auto-opened dialog** (`Cancel` or Esc): the search box is wiped as well, so the typed name is lost.
- **Use the Patients page route**: more fields, but the appointment time is chosen for her and a room is optional there too.

### Edge Cases
- **Duplicate phone / validation**: server message shown both as toast "Unable to create patient" and inline in a red strip at the top of the dialog.
- **Missing first name or phone**: toast "Missing information — First name is required" / "Phone number is required".
- **Gender left at default**: the record is saved as "Other" silently.
- **Tip text mismatch**: under an empty result the page says "Tip: enter patient name and phone, then use "Add" to create a new record instantly." — but a combined name+phone search finds nothing and only an em-dash-separated string prefills the phone.
- **Naming**: the same concept is "New Patient" → "Create Patient" on Patients, and `+ Add "…" as a new patient` → "Add New Patient" → `Create Patient` here.

---

## STORY-003: Morning confirmation calls — confirm one patient, cancel another

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

### Steps
1. Open `Appointments` → today's grid; Scheduled header reads "2 patients to confirm", Confirmed header "No confirmed patients yet".
2. Click Meenakshi's tile in Scheduled (or hover it and click `INFO`, title "View Appointment Details") → dialog "Appointment Details": Date (shown as `2026-11-13`), Slot, "Calendar: Scheduled", Patient, Phone as a `tel:` link, Age, Sex, Bill type, Bill + button, Type badge "OPD", "Status: SCHEDULED". Footer: `Close`, `Start Visit`, `Reschedule`, `Cancel Appointment`, `Confirm` (primary).
3. Call her (click the phone link or dial by hand); she confirms.
4. Click `Confirm` → button "Confirming…"; dialog closes; toast "Appointment confirmed — Meenakshi Iyer is now at 11:00-11:30 in Confirmed."; her tile jumps to the right column at the same time; headers become "1 patient to confirm" / "1 patient confirmed".
5. Click Farhan's tile → "Appointment Details".
6. Call him; he cannot come. Click `Cancel Appointment` (red) → the details dialog is replaced by a second dialog "Cancel Appointment": "Are you sure you want to cancel this appointment? This action cannot be undone." with Patient / Date / Time / Type.
7. Click `Yes, Cancel Appointment` → toast "Appointment Cancelled — The appointment has been successfully cancelled."; the tile disappears (cancelled appointments are never drawn); Scheduled header "No one left to confirm".

### Variations
- **Undo a confirmation**: open a Confirmed patient → `Move to Scheduled` (outline button, "Moving…") → toast "Moved to Scheduled".
- **Changed her mind on cancel**: `Keep Appointment` closes the warning and the "Appointment Details" dialog comes back.
- **Patient unreachable**: there is nothing to record — no "called / no answer" marker and no way to set No-show or Checked-in from the UI, although the tiles have styles for "Checked in" and "No-show" *(from code: no caller sets those statuses)*.

### Edge Cases
- **Confirm when that time is already taken in Confirmed (overbooking off)**: the details dialog closes and an amber sticky banner appears: "Moving Meenakshi Iyer to Confirmed" / "11:00-11:30 is taken in Confirmed. Click a free time in the Confirmed calendar, or change the date to pick another day." Only the Confirmed column accepts clicks; `Cancel` on the banner abandons the move.
- **Confirm when taken and the doctor allows overbooking**: dialog "Overbook this slot?" first; declining drops into the same restricted reschedule mode.
- **Cancel an in-progress or completed visit**: the button is still offered; the server answers "Cannot cancel appointment in progress" / "Cannot cancel completed appointment" → toast "Failed to cancel appointment".
- **Nurse at the desk**: `Confirm`, `Reschedule` and `Cancel Appointment` are all shown, but `POST /appointments/:id/reschedule` and `DELETE /appointments/:id` do not list NURSE, so each ends in an error toast.
- **Naming**: "Confirm" (move column), "Confirm Booking" (create) and "Yes, Cancel Appointment" (confirm a cancel) are three different confirmations; "Scheduled" is a column, a status, and the verb in the success banner.

---

## STORY-004: Move an appointment to another day

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

### Steps
1. On `Appointments`, set `Date` to Thursday → Riya has to already know the day; there is no search-by-patient that opens an appointment (header search results for appointments open the plain page on today).
2. Find Sunita's tile at 16:00, hover it and click `RESCHED` → amber sticky banner at the top of the grid: "Rescheduling Sunita Deshpande" / "Click a free time in either calendar. To move to another day, change the date first." with a `Cancel` button.
3. Scroll back up to the controls card and change `Date` to Saturday → the grid reloads; the banner survives and now reads "Click a free time in either calendar to move this appointment from {Thursday} to {Saturday}."
4. Scroll down and click the free 10:30 tile in the **Scheduled** column (tooltip "Move to 10:30-11:00" — the original 30-minute length is kept) → toast "Appointment rescheduled — Sunita Deshpande is now on {Saturday} at 10:30-11:00 in Scheduled."; the banner clears and the tile appears on Saturday with a new token number for that day.
5. Tell the patient the new time. *(The page stays on Saturday; Riya must set `Date` back to today herself.)*

### Variations
- **Open details first**: click the tile → `Reschedule` → same banner (one extra click).
- **Same-day move**: skip step 3.
- **Drop it in the other column**: clicking a Confirmed tile while rescheduling a Scheduled patient both moves and confirms them; the toast title is then "Appointment confirmed" instead of "Appointment rescheduled".
- **Narrow tiles** (phone, or two patients side by side in an overbooked slot): the hover buttons are hidden below a 16 rem block width, so only the details-dialog route exists.

### Edge Cases
- **Change the `Doctor` mid-reschedule**: the move is dropped without a message (a reschedule keeps the doctor).
- **Switch to the other tab mid-reschedule**: the grid is re-created and the move is lost *(from code: inactive tab content is unmounted)*.
- **Target time on leave / holiday**: toast "Failed to reschedule" with the time-off description; banner stays.
- **Target tile already holds a patient**: full tiles offer no click; with overbooking on, the tile shows "Overbook 1/2" and the "Overbook this slot?" dialog follows.
- **Room clash at the new time**: the room is carried over unchanged and cannot be re-picked; a room conflict is refused (never overbooked) with "Failed to reschedule".
- **Checked-in / in-progress / completed**: no `RESCHED` or `Reschedule` button is drawn.

---

## STORY-005: Squeeze an urgent patient into an occupied slot (overbooking)

**Type**: short
**Topic**: Appointments, rooms & doctor availability
**Persona**: Riya, receptionist, doctor has just said "send him in at 12"
**Goal**: Add Imran Sheikh to Dr. Shravya's 12:00 Confirmed slot, which already holds Kavya Nair.
**Preconditions**: Dr. Shravya has "Allow overbooking" on with "Up to 2 patients per slot" (see STORY-009). Imran has a patient record. Today, 12:00 is still in the future.
**Ideal path**: 3 — select patient, click the occupied time, one confirmation that says it is an overbook.
**Alternate paths**: Same sequence from the **Slots** tab. Patients › "Create Patient" walk-in auto-booking can also raise the same "Overbook this slot?" dialog. Otherwise none found.

### Steps
1. Type `Imran` in `Patient` and click "Imran Sheikh — 9885011223" → badge "Selected: …".
2. In the Confirmed column at 12:00, Kavya's block fills the left half of the row and a small amber tag reads "Overbook 1/2". Click the empty right half → dialog "Book Appointment" ("Time Slot: 12:00-12:30"). *Nothing in this dialog mentions that the slot is already occupied.*
3. Click `Confirm Booking` → the server refuses with an overbook offer and a second dialog opens on top: "Overbook this slot?" — "This slot already has 1 patient. Book anyway? (2 of 2 allowed)" with `Cancel` / `Book anyway`.
4. Click `Book anyway` → both dialogs close; banner "Appointment Successfully Booked! Imran Sheikh scheduled for 12:00-12:30 in the Confirmed calendar (OPD)"; the two patients sit side by side in the 12:00 row.

### Variations
- **Decline**: `Cancel` in the overbook dialog books nothing and shows no toast; the "Book Appointment" dialog is still open underneath.
- **Limit of 3–5**: the tag reads "Overbook 2/3" etc.; each extra patient needs the same two confirmations.

### Edge Cases
- **Slot at its limit**: the tile offers no action; its tooltip becomes "Long press to view details: Kavya Nair — 12:00-12:30" and a 500 ms press opens the first patient's details.
- **Overbooking off (limit 1)**: occupied tiles are closed; a partially overlapping duration is answered with toast "Scheduling Conflict … — Try: …".
- **Room already in use**: never overbookable; plain "Scheduling Conflict" toast.
- **The two columns do not see each other**: a 12:00 booking in Scheduled and another at 12:00 in Confirmed raise no prompt at all — each calendar counts only its own appointments, so the doctor can be double-booked across columns silently.
- **Double notice**: the overbook state is signalled three times in sequence (tile tag, server refusal, confirm dialog) yet the booking dialog in the middle is silent about it.

---

## STORY-006: Book a procedure with a room from the Slots tab, then check it with the filters

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

### Steps
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

### Variations
- **Do it on the Calendar tab**: steps are the same minus step 4's trap; the tile then reads "Pooja Malhotra (Chemical Peel)" on wide rows and one banner (no toast) confirms it.
- **Telemedicine**: `Appointment Type` "Telemedicine" ("Virtual consultation via video call") lists only rooms whose type contains telemed/virtual/online; room optional.
- **No room of that kind**: "No procedure rooms available — You can still book this appointment. Room assignment can be done later." — yet for a procedure `Confirm Booking` stays disabled, and no later room-assignment screen exists.

### Edge Cases
- **Fix the missing procedure name**: there is no edit action on an appointment; she must `Cancel Appointment` and re-book from the Calendar tab.
- **Filters hide everything**: "No appointments match the current filters."
- **Switching tabs**: the selected patient, both filters and the grid step are forgotten each time (each tab keeps its own state and is rebuilt).
- **Filter value wording**: the filter is labelled `Visit Type`, the dialog field `Appointment Type`, the details row `Type`, and the active-filter chip prints the raw code `PROCEDURE`.
- **Room types that can never be picked**: only rooms whose type text matches consultation/opd/clinic, procedure/operation/surgery or telemed/virtual/online are offered; "Recovery", "Laboratory", "Imaging", "Waiting", "Pharmacy", "Emergency" rooms never appear in a booking.

---

## STORY-007: Doctor starts the consultation from the appointment

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

### Steps
1. Open `Appointments` → own name is in `Doctor`, today's grid shows the Confirmed column with tokens (#1, #2 …).
2. Hover Arjun's tile → three small buttons fade in at its right edge: `INFO`, `RESCHED`, `START`. Click `START` (title "Start Visit") → browser goes to `/dashboard/visits?patientId=…&appointmentId=…&autoStart=true`; the visit page opens with a "From Appointment" badge and a `Back to Calendar` button. → **Hand-off to the visit documentation stories.**
3. Later, `Back to Calendar` (browser back) returns to the grid; the tile's hover button now reads `CONT` (title "Continue Visit") and reopens the same visit with `visitId=`.

### Variations
- **Via details**: the dialog button is always labelled `Start Visit`, even when it will resume an existing visit. For a still-Scheduled patient `Confirm` is the primary button and `Start Visit` is secondary; starting a visit does not require confirming first.
- **Billing afterwards**: the chip on the tile ("Not billed", "₹500 · Paid", "₹200 due") or `Create bill` / `Open bill` / `View bill` in the details dialog opens "Bill for {patient}" → **hand-off to the consultation-billing stories.**

### Edge Cases
- **Receptionist clicks `START`**: the button is shown to every role; the visit page opens but the server refuses visit creation for RECEPTION.
- **Tile too narrow for hover buttons**: only the details-dialog route remains.
- **Just-booked (optimistic) tile**: all actions are disabled until the server copy arrives.
- **Naming**: `START` / `Start Visit` / `CONT` / "Continue Visit" for one action; the visit page says "Back to Calendar" whether the user came from the Calendar or the Slots tab.

---

## STORY-008: Check room load, add a new room and take one out of service

**Type**: medium
**Topic**: Appointments, rooms & doctor availability
**Persona**: Suresh, clinic admin, planning the week on Friday afternoon
**Goal**: See how busy the procedure rooms are on Monday, add "Laser Room 2", and stop bookings into "Procedure Room 3" during renovation.
**Preconditions**: Signed in as ADMIN (DOCTOR/OWNER also see the second tab; NURSE and RECEPTION see only the calendar; MANAGER has no Rooms entry).
**Ideal path**: 6 — open Rooms, jump to the date, add room (name + type, save), toggle the old room off.
**Alternate paths**: none found for managing rooms. Room occupancy for one time slot is also visible inside the "Book Appointment" dialog (room cards with Available / Occupied), and the Appointments `Room` filter shows one room's appointments for one doctor.

### Steps
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

### Variations
- **Edit**: row `Edit` → dialog "Edit Room" → `Update Room` → toast "Room updated".
- **Delete**: row `Delete` → native browser `confirm("Are you sure you want to delete "…"?")` → toast "Room deleted", or "Failed to delete room" when the room has ever had an appointment ("Cannot delete room with existing appointments").
- **Front-desk view**: a receptionist gets steps 1–4 only (no `Manage Rooms` tab).

### Edge Cases
- **Re-activating a room**: the Manage Rooms table loads from the endpoint that returns *active rooms only*, falling back to the all-rooms endpoint only on error *(from code: `fetchRooms` in `RoomsManagement.tsx`, `getRooms` in `appointments.service.ts`)*. After a reload the deactivated room is no longer listed, the "Inactive" status filter is empty, and there is no way to switch it back on. A room created with "Room is active" unticked vanishes immediately.
- **Appointments before 09:00 or after 18:00**: clipped out of the room grid, though the doctor grid stretches to show them.
- **Quick Guide promises that are not there**: "Click on appointments to view details or reassign rooms", "Configure room amenities and equipment", "Track room cleaning and maintenance schedules".
- **Titles stacked**: sidebar "Rooms" → "Room Management" → "Room Calendar & Occupancy" → "Room Occupancy Calendar"; second tab "Manage Rooms" → "Room Configuration & Management" → "Rooms Management" → "All Rooms".
- **Two legends**: this page's Legend (with an "Available" swatch) and the Appointments Legend describe the same visit-type colours from different colour sources.

---

## STORY-009: Doctor sets weekly hours, leave, a blocked hour and an overbooking limit

**Type**: medium
**Topic**: Appointments, rooms & doctor availability
**Persona**: Dr. Shravya Reddy, Friday evening after OPD
**Goal**: Replace the default 9–6 day with split shifts, block next week's conference days and one lunch-hour errand, and allow two patients per slot.
**Preconditions**: Signed in as DOCTOR on a desktop-width screen (the settings cog is in the desktop header only). No hours configured yet.
**Ideal path**: 9 — open settings, enter Monday's two shifts, copy to weekdays, save; add leave; add blocked hour; switch overbooking on and save. (Three separate saves is the structural minimum here; a single save would make it 7.)
**Alternate paths**:
- Users › doctor row › `Working Hours` → dialog "Availability: Dr. {name}" — the same component for any doctor (OWNER/ADMIN; lets them also remove clinic holidays from the list).
- Users › `Clinic Holidays` → dialog "Clinic Holidays" — clinic-wide closures for all doctors (admin side; reports-admin topic).

### Steps
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

### Variations
- **Admin does it for her**: Users › `Working Hours` on her row → identical sections under the title "Availability: Dr. Shravya Reddy".
- **Hours migrated from the old setting**: the note reads "These hours come from the old working-hours setting. Save to keep them as the weekly schedule."
- **Switch overbooking off**: toggle off → `Save overbooking` → "Saved: one patient per slot."

### Edge Cases
- **Validation on save**: "Monday: shifts overlap", "Monday: 17:00-13:00 must end after it starts", "{Day}: fill in both times", "Add at least one shift" — shown as one red line at the very bottom of the component, far from `Save hours`.
- **Leave dates reversed / zero-length**: "The end date must be on or after the start date." / "The end time must be after the start time."
- **Patients already booked on the leave days**: nothing in this form mentions or lists them *(no check found in the time-off create path)*.
- **Lunch gap between shifts is not blocked time**: booking 14:00 on a split-shift day only shows the amber "outside doctor's working hours" warning in the booking dialog; leave/blocked/holiday is the only hard stop.
- **Mobile**: the header (and so "My Settings") is hidden below the `md` breakpoint; the Users route is admin-only, so a doctor on a phone has no path.
- **Naming**: button `Working Hours` → dialog "Availability: …" → section "Weekly working hours (IST)"; "Leave and blocked time" vs "time off" (empty state, errors) vs "Clinic holiday" vs the calendar's "Not bookable".

---

## STORY-010: Connect Google Calendar so bookings sync

**Type**: short
**Topic**: Appointments, rooms & doctor availability
**Persona**: Dr. Shravya Reddy, setting up on her clinic laptop
**Goal**: Have her ClinicMS appointments appear in her Google Calendar.
**Preconditions**: Signed in as DOCTOR. The server has Google credentials configured (otherwise the controls are not rendered at all). She has a Google account.
**Ideal path**: 3 — click connect, approve at Google, land back on the calendar already syncing.
**Alternate paths**: none found — the control exists only in the "Doctor Calendar" card header on the **Calendar** tab (not on Slots, not in "My Settings").

### Steps
1. Open `Appointments` (Calendar tab) and click `Sync with Google Calendar` at the top right of the "Doctor Calendar" card → button shows "Connecting..." and the browser leaves for Google's consent screen.
2. Choose the Google account and allow access (Google's own pages).
3. Google returns to `/dashboard/appointments/google-callback` → a centred card with a spinner and "Connecting your Google Calendar...", then a green tick, "Google Calendar connected successfully!" and "Redirecting to appointments..."; after 1.5 s the Appointments page reloads.
4. The card header now shows the Google logo with "Syncing", a green badge with her e-mail, and a `Disconnect` link; below it a green strip: "Dr. Shravya Reddy's appointments will auto-sync to Google Calendar (shravya@…)".

### Variations
- **Disconnect**: click `Disconnect` → "Disconnecting..." → toast "Google Calendar — Disconnected successfully." No confirmation is asked.
- **Receptionist clicks the button**: it connects the *receptionist's own* Google account (the button is shown to every role). If she is connected and the selected doctor is not, an amber strip says "Dr. …'s Google Calendar is not connected. Appointments won't sync to their calendar. Ask the doctor to log in and connect their own Google Calendar."

### Edge Cases
- **Access denied at Google**: red cross, "You denied access to Google Calendar.", "Redirecting back..." (3 s).
- **No code in the return URL**: "No authorization code received from Google." (3 s).
- **Exchange fails**: the server message or "Failed to connect Google Calendar." (4 s), then back to Appointments with the button unchanged.
- **Could not start**: destructive toast "Google Calendar — Failed to start Google connect".
- **Naming**: "Sync with Google Calendar" → "Syncing" → "connected" → "auto-sync" → `Disconnect`; and "calendar" on this page already means the tab, the card, and each of the two columns.

---

## STORY-011: Monday morning at the front desk, end to end

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

### Steps
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

### Variations
- **Use `RESCHED` on hover** in step 6 instead of opening details (saves one click on wide tiles).
- **Filter the day**: `Visit Type` "Procedure" or `Room` "Laser Room 1 (Procedure)" narrows the grid ("Filters Active: …"); useful before step 32 but limited to one doctor and one day.
- **Change the row height**: `Grid` 10/15/20/30/45/60 minutes; a click still books from the first free 15-minute start in that row.
- **Second doctor**: switching `Doctor` reloads the grid and silently drops an in-progress reschedule.

### Edge Cases
- **Date ping-pong**: steps 7→9, 20→27 and 33 each need manual date changes; the Appointments date picker and the Rooms chevrons are separate and do not follow each other.
- **Scrolling**: the patient search, `Date` and the banner sit above the Legend; the grid is below it, so most bookings involve a scroll down and, for cross-day work, back up.
- **Stale selection**: after any booking the previous patient remains selected (steps 18 and 28 exist only to undo that).
- **Cross-column blind spot**: Arjun at 10:30 in Confirmed would not have conflicted with Farhan at 10:30 in Scheduled even if Farhan had stayed.
- **Leave day chosen by mistake**: the red "Not bookable: …" banner shows on the page, but the tile still opens the dialog, where `Confirm Booking` is disabled by "Cannot book …".
- **Same day, four renderings**: today's appointments appear on the Dashboard card, this grid, the Rooms calendar and the notification bell, each with different detail and none linking to a specific appointment.

---

## Redundancy notes

**Duplicate paths**
- **Two tabs, one grid.** `Calendar` (`AppointmentsCalendar.tsx`) and `Slots` (`AppointmentScheduler.tsx`) both wrap `DoctorDayCalendar.tsx`, each with its own copy of patient search, quick-create wiring, filters, blocked-time banner and booking handler. Differences are incidental: only Calendar has the Legend, Google controls, `Grid` and the room-role check; only Slots shows a toast *and* a banner on success and prints raw patient IDs; Slots drops the Procedure Name (`notes` not passed). The Slots card still says "Select a doctor and date to view available appointment slots" and the receptionist tour (`components/tours/ReceptionistTour.tsx`) still describes it as a "Traditional time slot grid".
- **Book an appointment**: Calendar tab, Slots tab, Patients "Create Patient" with Walk-in (auto-books into Confirmed), plus deep links from patient detail / progress tracker (`?patientId=`).
- **Create a patient**: "Add New Patient" quick-create (auto-opens on the first empty search, both tabs — `PatientQuickCreateDialog.tsx`) vs Patients "Create Patient".
- **Confirm vs reschedule**: `Confirm` / `Move to Scheduled` and reschedule-into-the-other-column are the same server call (`POST /appointments/:id/reschedule` with `calendar`), surfaced as two features with different toasts.
- **Reschedule / start visit / details entry points**: tile click, hover `INFO`, long-press on a full tile → details; hover `RESCHED` vs details `Reschedule`; hover `START`/`CONT` vs details `Start Visit`.
- **Doctor availability**: header "My Settings" (doctor) vs Users › `Working Hours` (admin) — same `DoctorAvailabilitySettings.tsx`; holidays separately under Users › `Clinic Holidays`.
- **Dead duplicate logic** in `AppointmentScheduler.tsx`: `startReschedule`, `handleRescheduleSlotSelect`, `handleStartVisit` (which would create a visit with complaint "General consultation") and the `PatientProgressTracker` import are never rendered; the live reschedule/start-visit logic is in `DoctorDayCalendar.tsx`.

**Duplicate information**
- Scheduled/Confirmed explanation: card description, Legend, column headers, Quick Guide dialog (`appointments/page.tsx`, `AppointmentsCalendar.tsx`, `appointment-calendars.ts`).
- Overbooking: tile tag "Overbook n/m", server 409, "Overbook this slot?" dialog (`CalendarColumn.tsx`, `useOverbookConfirm.tsx`).
- Blocked time: page banner "Not bookable: …" and dialog alert "Cannot book …" (`lib/doctor-availability.ts`).
- Room occupancy: Rooms calendar, booking-dialog room cards, Appointments `Room` filter, room name on the tile.
- Legends: Appointments (hard-coded colours) and Rooms (`--calendar-*` variables) — `AppointmentsCalendar.tsx`, `RoomCalendar.tsx`.
- Today's appointments: Dashboard card, doctor grid, room grid, notification bell.
- Booking success on Slots: toast "Appointment Booked Successfully" plus banner "Appointment Successfully Booked!".

**Naming drift**
- **Calendar** = a tab, the "Doctor Calendar" card, each column ("the Scheduled calendar"), Google Calendar, Rooms "Calendar View" / "Room Occupancy Calendar".
- **Scheduled** = column, status, and the verb in "scheduled for 10:30 in the Confirmed calendar".
- **Visit Type** (filter) / **Appointment Type** (dialog) / **Type** (details); values "OPD Consultation" / `OPD`, "Telemedicine" / `TELEMED` / room type "Telemed" / "Telemedicine Suite".
- **Grid** (Calendar tab) = **Duration** (Slots tab filter) ≠ **Duration** (booking dialog).
- **Slot** / **Time Slot** / **Time** for the same value across details, booking and cancel dialogs; details shows the date as `YYYY-MM-DD`, the booking dialog formats it.
- **Confirm** / **Confirm Booking** / **Yes, Cancel Appointment**; **Cancel** (dismiss booking, abort reschedule, decline overbook) vs **Cancel Appointment**.
- **Reschedule** / `RESCHED` / "Rescheduling …" / "Moving … to Confirmed" / `Move to Scheduled`.
- **Start Visit** / `START` / `CONT` / "Continue Visit".
- **Rooms** / "Room Management" / "Rooms Management" / "Room Configuration & Management"; `Add Room` → "Add New Room".
- **Working Hours** / "Availability" / "Weekly working hours (IST)"; "Leave and blocked time" / "time off" / "Clinic holiday" / "Not bookable".

**Friction and gaps worth walking**
- Quick-create auto-opens while the user is still typing; a phone search prefills the digits into First Name; dismissing it clears the search (`AppointmentsCalendar.tsx`, `PatientQuickCreateDialog.tsx`).
- Dragged time range is not reflected in the booking dialog's Duration (`AppointmentBookingDialog.tsx`).
- Selected patient persists after a booking; tab switch wipes all state.
- The two columns never conflict with each other, so the same doctor time can hold one Scheduled and one Confirmed patient without any prompt (`appointments.service.ts`, `appointment-calendar.ts`).
- No UI to edit an appointment's type, room, procedure name or duration, and none to mark Checked-in or No-show, although both statuses are styled.
- Deactivated rooms drop out of the Manage Rooms table after reload, so they cannot be re-activated (`RoomsManagement.tsx` → `GET /appointments/rooms` returns active rooms only).
- Action buttons are shown regardless of role: NURSE cannot reschedule/confirm/cancel, RECEPTION cannot start a visit, MANAGER cannot book (`appointments.controller.ts`).
- Room calendar is hover-only, fixed 09:00–18:00, no date picker; its Quick Guide and the receptionist tour describe actions that do not exist (`rooms/page.tsx`, `RoomCalendar.tsx`).
