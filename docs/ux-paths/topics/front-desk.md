# Topic 1: Front desk: find or register a patient, book, confirm, reschedule, cancel

Source read for this topic (FE = `frontend/src`, BE = `backend/src`): `FE/app/dashboard/appointments/page.tsx`, `FE/components/appointments/{AppointmentsCalendar,DoctorDayCalendar,CalendarColumn,AppointmentScheduler,AppointmentBookingDialog,PatientQuickCreateDialog,useOverbookConfirm,usePrefilledPatient,appointment-calendars,appointment-billing-view}`, `FE/components/patients/PatientsManagement.tsx` (Create Patient dialog and walk-in auto-book), `FE/app/dashboard/patients/[id]/page.tsx`, `FE/components/layout/header.tsx` (global search), `FE/lib/{overbooking,doctor-availability,appointment-access}.ts`, `BE/modules/appointments/appointments.{controller,service}.ts`, `BE/modules/patients/patients.service.ts`.

Conventions used in every story:
- Step counting: one numbered step per click, per typed field, per selection. Reads and glances are not numbered. A prefilled field the user does not touch is noted inside the step, not numbered.
- "(required field)", "(optional)", "(default: X)", "(app already knows this)" tag each input.
- Unless a story says otherwise the starting point is `/dashboard/appointments`, tab "Calendar", desktop width, with a RECEPTION user. Doctor defaults to the last doctor used (kept in the browser, key `appointments.doctorId`) or the first doctor in the list. Date defaults to today (IST). The calendar has two columns: "Scheduled" ("Booked ahead. Call to confirm.") and "Confirmed" ("Confirmed, walk-ins and visits.").
- Clinic: a small dermatology clinic in Hyderabad. Doctor on the calendar is Dr. Ramesh Kulkarni.
- Facts about the surface that apply to all stories: there is no "check-in" action (the statuses Checked in, No-show and Completed are only badges; nothing in the UI sets them). Past time tiles on today's calendar are not clickable (`pointerEvents: none`), so a missed booking cannot be entered after the fact.

---

## FRONT-DESK-01: Book a returning patient into today's Confirmed calendar

**Type**: short
**Topic**: Front desk: find or register a patient, book, confirm, reschedule, cancel
**Persona**: Kavitha Reddy, receptionist, answering the desk phone at 10:40
**Goal**: Mrs. Lakshmi Narayanan (already registered, phone 9848012345) is on the phone and wants a consultation with Dr. Kulkarni at 11:30 today. Book it as confirmed.
**Preconditions**: Logged in as RECEPTION, on `/dashboard/appointments` (Calendar tab). Patient exists. The 11:30 tile in the Confirmed column is free.
**Ideal path**: 3 (type the name, pick the match, pick the time). A plain OPD booking needs no further input: doctor, date, type and duration all have sensible defaults, so the "Book Appointment" dialog could be skipped and shown only when something needs choosing.
**Alternate paths**:
- Tab "Slots" on the same page: `AppointmentScheduler` has its own patient search and renders the same `DoctorDayCalendar`, same booking dialog (same steps, but see the Procedure Name edge case below).
- Patient detail page (`/dashboard/patients/[id]`) button "Book appointment" jumps to `/dashboard/appointments?patientId=` with the patient pre-selected (see FRONT-DESK-07).
- Patients > "New Patient" with Patient Type "Walk-in" auto-books the next free Confirmed slot (only for new patient registration, FRONT-DESK-05; it cannot pick a time).

### Steps
1. Type "Lakshmi" in the Patient field (placeholder "Search patient by name/phone") (required to book; no minimum length, a request is sent on every keystroke) → a dropdown lists up to 10 matches as "Lakshmi Narayanan — 9848012345".
2. Click the "Lakshmi Narayanan — 9848012345" row → the search box now reads that text, a badge "Selected: Lakshmi Narayanan — 9848012345" and a "Clear" button appear; the free time tiles become clickable (before this a click on a tile shows toast "Patient required").
3. Click the free 11:30 tile in the Confirmed column (Doctor: default last used doctor, app already knows this; Date: default today) → dialog "Book Appointment" opens with Patient, Phone, Date, Time Slot shown again (app already knows this), "Duration" (default: length of the clicked span, 30 minutes at the default grid), "Appointment Type *" (default: OPD Consultation), room cards (optional, none selected).
4. Click "Confirm Booking" → dialog closes, green banner "Appointment Successfully Booked!" with "Lakshmi Narayanan scheduled for 11:30-12:00 in the Confirmed calendar (OPD)" for 5 seconds, the row appears in the Confirmed column with token number and a bill chip "Not billed".

### Variations
- Patient is not found: see FRONT-DESK-04.
- Click the Scheduled column instead: books into the Scheduled calendar (status Scheduled, "call to confirm"), same steps.
- Drag across several tiles before releasing to choose a custom span (dialog Duration then follows the span).
- Doctor on leave or time off: the page shows a red strip "Not bookable: ..." and the dialog shows an alert and disables "Confirm Booking".
- Slot outside doctor hours: amber warning in the dialog, booking still allowed.
- Slot already holds as many patients as the doctor's overbooking limit allows: the tile shows "Overbook n/m" and the server answers 409, which opens the dialog "Overbook this slot?" (see FRONT-DESK-06).

### Edge Cases
- Clicking a tile with no patient selected: toast "Patient required: Search and select a patient before booking a slot." (tile click) and the tiles show a not-allowed cursor.
- Typing in the Patient box again after selecting clears the selection (the badge disappears) and the tiles lock again.
- Same information appears four times: the search box text, the "Selected:" badge, the dialog header block (Patient/Phone/Date/Time Slot) and the success banner. The Scheduled/Confirmed explanation appears three times: the column headers, the "Legend" card and the "Quick Guide" dialog.
- Searching by the last digits of a phone number finds nothing: the server matches phone with "starts with" only.
- Past tiles on today's calendar cannot be clicked at all.
- A booking sends a WhatsApp confirmation only if the doctor turned on "Send WhatsApp on appointment creation" in "My Settings"; the receptionist sees no sign either way.

---

## FRONT-DESK-02: Confirm a patient after the call

**Type**: short
**Topic**: Front desk: find or register a patient, book, confirm, reschedule, cancel
**Persona**: Kavitha Reddy, receptionist, doing the morning confirmation calls
**Goal**: Anita Reddy (booked ahead for 10:00 today) confirmed on the phone. Move her to the Confirmed calendar.
**Preconditions**: Anita Reddy's row is in the Scheduled column at 10:00-10:30 on the selected date. The same time in the Confirmed column has room.
**Ideal path**: 1 (one Confirm control on the row itself). The row already shows everything needed; the call result is a single yes.
**Alternate paths**:
- Row hover buttons "INFO", "RESCHED", "START" do not include Confirm, so Confirm is reachable only inside "Appointment Details".
- "RESCHED" then clicking a free tile in the Confirmed column also moves the patient to the Confirmed calendar (and may change the time), see FRONT-DESK-06.
- Tab "Slots" shows the same calendar and the same dialog.

### Steps
1. Click Anita Reddy's row (the button whose label reads like "Token 3, Anita Reddy, 10:00-10:30, Scheduled") → dialog "Appointment Details": Date (shown as 2026-11-13, unformatted), Slot, Calendar "Scheduled", Patient, Phone (a `tel:` link), Age, Sex, Bill type, Bill ("Not billed" with button "Create bill" if the role can create bills), Type, Room, Status "SCHEDULED". Footer: "Close", "Start Visit", "Reschedule", "Cancel Appointment" and the primary button "Confirm".
2. Click "Confirm" → no confirmation dialog; toast "Appointment confirmed: Anita Reddy is now at 10:00-10:30 in Confirmed."; the row jumps to the Confirmed column with the same time; status becomes CONFIRMED.

### Variations
- Same time already taken in Confirmed (and no overbooking room): the details dialog closes and the calendar enters move mode: banner "Moving Anita Reddy to Confirmed" with "10:00-10:30 is taken in Confirmed. Click a free time in the Confirmed calendar, or change the date to pick another day." plus a "Cancel" button. One more click on a free Confirmed tile completes it (this is the confirmation-with-conflict path used in FRONT-DESK-08).
- Undo a mistaken confirm: open the row again and press "Move to Scheduled" (the button changes label to that when status is CONFIRMED).
- Patient did not pick up: nothing to do; there is no "No answer" or "Called" mark, the row looks the same afterwards.

### Edge Cases
- The details dialog repeats facts already on the row (time, name, age, sex, type, room, status): the row shows them inline at wide widths.
- "Start Visit" is the first button in the dialog and is shown to RECEPTION even though the Visits menu entry is hidden for that role.
- Opening the dialog on an in-progress or completed row: no "Confirm" or "Reschedule" button (only appointments with status Scheduled or Confirmed can move).
- The phone number is a `tel:` link: on a desktop without a softphone it does nothing useful; the receptionist reads it off the screen.

---

## FRONT-DESK-03: Cancel an appointment the patient no longer needs

**Type**: short
**Topic**: Front desk: find or register a patient, book, confirm, reschedule, cancel
**Persona**: Kavitha Reddy, receptionist
**Goal**: Neha Gupta phoned to cancel her 12:30 appointment today. Remove it from the day.
**Preconditions**: Neha Gupta's row is visible on the selected date and doctor; status Scheduled or Confirmed.
**Ideal path**: 2 (one Cancel control on the row, one confirmation because it cannot be undone).
**Alternate paths**: none found. The patient detail page has no cancel; the header search lists appointments but only opens `/dashboard/appointments`; the Slots tab uses the same dialog. (The API also has `PATCH /appointments/:id` and a bulk update for ADMIN only, with no UI.)

### Steps
1. Click Neha Gupta's row → dialog "Appointment Details" (same content as FRONT-DESK-02).
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

## FRONT-DESK-04: New caller who is not in the system: register in-line and book ahead

**Type**: medium
**Topic**: Front desk: find or register a patient, book, confirm, reschedule, cancel
**Persona**: Kavitha Reddy, receptionist, taking a first-time call
**Goal**: Meera Venkatesh (34, new, phone 9849012345) wants to see Dr. Kulkarni tomorrow afternoon for a pigmentation concern. Create her record and put her in the Scheduled calendar for the confirmation call.
**Preconditions**: On `/dashboard/appointments`. Nobody named Meera Venkatesh exists. A free slot tomorrow at 15:00 in the Scheduled column.
**Ideal path**: 5 (date, name, phone, pick the time, confirm: patient creation and booking happen as one action with only name and phone as required input).
**Alternate paths**:
- Patients > "New Patient" > "Create Patient" with Patient Type "Walk-in" registers and auto-books, but only the next free Confirmed slot (not a chosen time or the Scheduled calendar): FRONT-DESK-05.
- Patients > "New Patient" with Patient Type "Non walk-in" registers only, then go to Appointments and repeat FRONT-DESK-01 (longer).
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
- Procedure appointment: set "Appointment Type *" to Procedure in the dialog (see FRONT-DESK-06 edge cases for the room rule).

### Edge Cases
- Typing a name that has near matches shows the matches; the receptionist must clear the box to reach a path that adds a new patient (the "+ Add" strip only appears for zero matches).
- The quick dialog sends no address, emergency contact, referral source or primary doctor; the patient list later shows these as empty, so Patients > "Edit" is a follow-up that nothing prompts.
- Closing the quick dialog by Escape while no patient is selected clears the search box, losing the typed name.
- Information repeated: name and phone typed once in search and once in the dialog (prefilled for the name only), then displayed in the badge and again in the booking dialog.

---

## FRONT-DESK-05: Register a walk-in patient and book the next free slot

**Type**: medium
**Topic**: Front desk: find or register a patient, book, confirm, reschedule, cancel
**Persona**: Kavitha Reddy, receptionist, with a new patient standing at the desk
**Goal**: Imran Sheikh (29, male, 9701234567) walked in with acne. Register him and put him in the first available consultation slot with Dr. Kulkarni.
**Preconditions**: On `/dashboard/patients` (sidebar "Patients"). Dr. Kulkarni has at least one free Confirmed slot in the next 8 days.
**Ideal path**: 4 (name, phone, doctor, one "Register and book" click). Walk-in is the common case at a clinic; nothing else is needed to produce a record and a queue place.
**Alternate paths**:
- Appointments page: type the name, accept "Add New Patient", then click a Confirmed tile and "Confirm Booking" (FRONT-DESK-04 steps; 7 steps, but the receptionist picks the time).
- Create with Patient Type "Non walk-in", then book from the Appointments page (FRONT-DESK-01).
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
- Time not important to the patient: that is this story. If the patient wants a specific time, use FRONT-DESK-04 instead (the walk-in route cannot choose).
- No slot within 7 days: toast "No slots available: No available consultation slots found in the next 7 days for the selected doctor." The patient is already saved.
- First slot is full to the overbooking limit: the dialog "Overbook this slot?" appears; "Cancel" leaves the patient saved with toast "Walk-in not booked: <slot> on <date> was taken and you chose not to overbook it."
- Room selected: slots are filtered to those where the room is free.
- ABHA ID typed with fewer than 14 digits: error banner "ABHA ID must be a 14-digit number".

### Edge Cases
- The patient is created before the booking runs; if booking fails, the receptionist must notice the toast and go to Appointments by hand.
- Two doctor fields in one dialog with different meanings: "Primary Doctor" (default Automatic) and "Doctor (for walk-in)".
- The booking is stored with source WALK_IN and note "Auto-booked next available slot for walk-in"; the calendar row does not show it is a walk-in.
- The patient name, phone and age are typed here exactly as in the quick dialog of FRONT-DESK-04: two different forms for the same record, with different required markers ("Add New Patient" marks First Name, Gender and Phone with `*`; "Create Patient" marks nothing).
- The dialog title for edit is "Edit Patient" and the same form is reused, but the walk-in booking fields are reset to Non walk-in on edit.

---

## FRONT-DESK-06: Move a patient's appointment to another day, with an overbook prompt

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
- Cancel the old booking and book a new one (FRONT-DESK-03 then FRONT-DESK-01): longer, loses the token number and the bill chip.

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

## FRONT-DESK-07: Find a patient with the header search, then book from the patient page

**Type**: medium
**Topic**: Front desk: find or register a patient, book, confirm, reschedule, cancel
**Persona**: Kavitha Reddy, receptionist, at a desktop screen on `/dashboard`
**Goal**: Lakshmi Narayanan's daughter rings to book for her mother; the receptionist is on the dashboard and uses the global search to get to the patient.
**Preconditions**: Desktop width (the global search box is not shown on phone width). Lakshmi Narayanan exists. Free 12:00 Confirmed tile today.
**Ideal path**: 4 (type in the search, pick the patient, pick a time, confirm). The search already knows where it is going; a "Book" shortcut on the patient result could carry straight into booking.
**Alternate paths**:
- FRONT-DESK-01: skip the header and search on the Appointments page (4 steps).
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

## FRONT-DESK-08: A morning at the front desk: confirm, book, register a walk-in, move and cancel

**Type**: long
**Topic**: Front desk: find or register a patient, book, confirm, reschedule, cancel
**Persona**: Kavitha Reddy, receptionist at a one-doctor dermatology clinic, 09:30 on a Friday, with Dr. Ramesh Kulkarni's calendar
**Goal**: Work through the front desk's typical block: confirmation calls (one hits a conflict), a returning patient's phone booking, a new walk-in, a postponement and a cancellation.
**Preconditions**: Today is Friday 13 Nov 2026. The Scheduled column holds Anita Reddy 10:00 and Sandeep Joshi 10:30 (the Confirmed column already holds a walk-in at 10:30), plus Rahul Menon at 14:00 and Neha Gupta at 12:30 (Confirmed). Lakshmi Narayanan exists. Pooja Verma does not. The doctor's per-slot limit is 1.
**Ideal path**: 15 (Anita 1; Sandeep 2, confirm and pick; Lakshmi 3; Pooja walk-in 4; Rahul postponement 3; Neha cancel 2). Every one of these tasks can be done from one screen without re-entering anything the app knows.
**Alternate paths**: every task here has the alternates listed in FRONT-DESK-01 to -07; the whole day can be run from the Appointments page only except for walk-in registration, which also exists as "Add New Patient" on that page.

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
- Receptionist skips the Appointments page and books Lakshmi through Patients > "View" > "Book appointment" (FRONT-DESK-07).
- At step 20 the overbook prompt "Overbook this slot?" appears if the first free slot is already full to the doctor's limit.
- Patient arrives: there is no check-in; the nearest action is "START" or "Start Visit" on the row, which opens the visit form and, on the server, sets the appointment to IN_PROGRESS.

### Edge Cases
- Switching to another doctor in the Doctor select mid-reschedule ends the move silently.
- Steps 24 and 26 exist only because rescheduling to another day is a calendar-wide date change; the calendar does not show the patient's new day until the Date is changed again.
- The Scheduled/Confirmed meaning is explained in the column headers, the "Legend" card, and the "Quick Guide" dialog (opened by the "Quick Guide" button): three copies of one explanation, none of them next to the Confirm button.
- A patient may appear twice in the day (one Scheduled, one Confirmed) if they are booked twice; nothing warns on a duplicate booking for the same patient on the same day.
- `ReceptionistTour` (header button "Start Tour", RECEPTION only) repeats these instructions as a guided overlay on the Appointments page.
