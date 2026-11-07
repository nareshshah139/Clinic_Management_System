# UX Paths: Appointments, Scheduling & Rooms

Topic agent output for **appointments-scheduling-rooms** (ux-paths Phase 2).
Covers `/dashboard/appointments` (Calendar and Slots tabs), the "Book Appointment" dialog, the inline "Add New Patient" dialog, reschedule, cancel, the Start Visit handoff, Google Calendar connect and callback, doctor working hours, leave and clinic holidays, `/dashboard/rooms` (Calendar View and Manage Rooms).

Main source files read:
`frontend/src/app/dashboard/appointments/page.tsx`, `.../google-callback/page.tsx`, `frontend/src/components/appointments/{AppointmentsCalendar,AppointmentScheduler,DoctorDayCalendar,AppointmentBookingDialog,PatientQuickCreateDialog}.tsx`, `frontend/src/lib/doctor-availability.ts`, `frontend/src/components/users/DoctorAvailabilitySettings.tsx`, `frontend/src/app/dashboard/rooms/page.tsx`, `frontend/src/components/rooms/{RoomCalendar,RoomsManagement}.tsx`, `backend/src/modules/appointments/*`, `backend/src/modules/doctor-availability/*`, `backend/src/modules/google-calendar/*`.

Seed data used in the stories: doctors **Dr. Shravya Dermatologist** (`shravya@clinic.test`) and **Dr. Praneeta Jain** (`praneeta@clinic.test`), receptionist **Riya Sharma** (`reception@clinic.test`), admin `admin@clinic.test`, all with password `password123`. Seeded rooms: Consultation Room 1, Consultation Room 2, Procedure Room A/B/C, Telemedicine Suite.

How the screens fit together:
- The **Calendar** tab (card "Doctor Calendar") and the **Slots** tab (card "Appointment Scheduler") both render the same `DoctorDayCalendar` grid and the same "Book Appointment" dialog. They differ only in their header controls. Calendar has Visit Type, Room, Patient and **Grid** fields plus Google Calendar sync. Slots has Visit Type, Room and **Duration** with the patient search below them. The Slots tab's own reschedule and start-visit handlers are dead code: they are never wired into the grid.
- Appointment actions sit on hover-only buttons at the right of each appointment: **INFO** (opens "Appointment Details"), **RESCHED**, and **START** or **CONT**.

---

## STORY-001: Receptionist books a routine OPD consultation for a returning patient

**Type**: medium
**Topic**: appointments-scheduling-rooms
**Persona**: Riya Sharma, front-desk receptionist (RECEPTION), uses the app all day
**Goal**: Book Sneha Reddy (returning acne patient, 9849012345) with Dr. Shravya at 11:30 today for a 30-minute OPD consultation in Consultation Room 1
**Preconditions**: Logged in as `reception@clinic.test`. Sneha Reddy exists. Dr. Shravya has no appointment at 11:30 today and the time is before 11:30 IST.
**Ideal path**: 5 — choose the doctor, type a few letters of the patient's name, pick the match, click the free 11:30 tile, confirm. The date already defaults to today, and OPD and 30 minutes should be the defaults.
**Alternate paths**: (a) Slots tab: same grid and dialog under a different header. (b) Patients → patient detail "Book appointment" or PatientProgressTracker "Book" → `/dashboard/appointments?patientId=` (broken, see STORY-004). (c) Patients → "New Patient" with Patient Type "Walk-in" auto-books the next free 30-minute slot (new patients only). (d) Dashboard "Today's Appointments" button and header global-search appointment results both open `/dashboard/appointments` without any context.

### Steps
1. Click **Appointments** in the sidebar (Clinical group) → Page "Appointments" loads with a card holding the **Doctor** select, the **Date** field (today in IST) and a **Quick Guide** button. Tabs **Calendar** / **Slots** show; Calendar is active. The doctor is restored from `localStorage` (`appointments.doctorId`) or defaults to the first doctor.
2. In **Doctor**, choose "Shravya Dermatologist" → The "Doctor Calendar" grid reloads ("Loading schedule..."). Grid hours follow her configured working hours, or 09:00–18:00 if none are set. Each existing appointment shows as a coloured span with time, patient name, FOLLOW-UP flag, visit type, age, sex initial and room.
3. Riya wonders whether a slot is free before choosing a patient, so she clicks the 11:30 tile → Toast "Patient required" — "Search and select a patient before booking a slot." Nothing opens.
4. In **Patient** ("Search patient by name/phone") type `sneha` → A dropdown lists matches as "Sneha Reddy — 9849012345". An amber hint reads "Select a patient from the list or add them as new before booking."
5. Click "Sneha Reddy — 9849012345" → The input fills with the name and phone. Badge "Selected: Sneha Reddy — 9849012345" appears with a **Clear** button.
6. Hover the 11:30 tile → Tooltip "Book 11:30-11:45" (the grid books in 15-minute sub-segments). Click it → Dialog **Book Appointment** opens. It shows Patient, Phone, Date (formatted) and Time Slot.
7. Check **Duration** → It shows "30 minutes", so Time Slot reads 11:30-12:00 even though the tile said 11:30-11:45. Riya leaves it.
8. **Appointment Type \*** is already "OPD Consultation" ("Regular outpatient consultation"). Under "Room Availability for OPD", Consultation Room 1 and Consultation Room 2 each show a card with Available/Occupied, "Consultation • Capacity: 2" and "✓ Available for 11:30-12:00".
9. Click the Consultation Room 1 card → It gets a blue ring. The hint says "Room selection is optional for opd appointments."
10. Click **Confirm Booking** → The button shows "Booking...". An amber "Booking In Progress" tile appears, then the dialog closes. Green status "Appointment Successfully Booked!" reads "Sneha Reddy scheduled for 11:30-12:00 in Consultation Room 1 (OPD)". The new span gets a green ring ("Newly Booked") for 5 seconds.
11. Riya checks the **Rooms** sidebar item → Room Calendar shows Sneha in the Consultation Room 1 column at 11:30 (see STORY-010).

### Variations
- **Slots tab**: same flow. Success shows both a toast "Appointment Booked Successfully" and the same green banner, so the feedback is duplicated. The selected patient appears as a "✓ Selected Patient" card with ID, phone and email instead of a badge.
- **Telemedicine**: choose "Telemedicine" ("Virtual consultation via video call"). Only the Telemedicine Suite (type "Telemed") is listed and the room is optional.
- **Drag to pick a range**: press on 11:30 and drag to 12:30 → The preview tiles turn amber. On release the dialog opens, but the stale Duration (30, or whatever was used last) cuts the range back to 30 minutes (see Defects).
- **Grid select (Calendar tab only)**: switch the grid from 30 to 15 minutes to see finer tiles. The **Quick Guide** says "Calendar auto-finds 15-min slots even in larger grid views".
- **Booking outside working hours**: the dialog shows an amber "Warning: selected time … is outside doctor's working hours (…)" but still allows booking.

### Edge Cases
- Another receptionist books 11:30 for Dr. Shravya between steps 6 and 10 → Server 409 → Toast "Scheduling Conflict" — "Scheduling conflict detected — Try: 11:00-11:30, 12:00-12:30, …". Suggestions come from a fixed 09:00–18:00 half-hour list and can overlap existing bookings (see Defects).
- Visit Type filter set to "Procedure" → OPD appointments are hidden and their tiles look free, so a click opens the dialog and only fails with a 409 at confirm.
- The selected room is busy → its card is red "Occupied" with "Conflict with: <patient> / Dr. <name>" and cannot be clicked. If a room was selected earlier and the duration later grows into a conflict, Confirm shows "Validation Error — Selected room is not available at this time".
- A past slot (start ≤ now, IST) is greyed and not clickable. Booking 11:30 at 11:35 is impossible, even the free 11:45–12:00 part of a 30-minute tile.
- The same appointment details also appear in the Dashboard "Today's Appointments" list, the patient detail "Next appointment", the PatientProgressTracker "Upcoming appt" badge, the Room Calendar tooltip, header notifications and global search results. That is 7 surfaces, a redundancy candidate.
- Reloading the page always resets **Date** to today: the stored `appointments.date` is used only if it equals today.

---

## STORY-002: Walk-in first-time patient created inline while booking

**Type**: medium
**Topic**: appointments-scheduling-rooms
**Persona**: Riya (RECEPTION) at a busy morning desk. A first-time walk-in, Mohammed Imran, wants to see Dr. Praneeta about hair fall.
**Goal**: Create Mohammed's record without leaving the scheduler and book him at 12:15 today
**Preconditions**: Logged in as reception. No patient matches "Imran". Dr. Praneeta has a free 12:15.
**Ideal path**: 6 — type the name, open quick-create, add the phone, save, click the slot, confirm
**Alternate paths**: (a) Patients → "New Patient" → "Create Patient" with Patient Type "Walk-in" auto-books the next available 30-minute slot (no slot choice) → toast "Walk-in appointment booked". (b) Slots tab offers the same inline "+ Add … as a new patient" button.

### Steps
1. Open **Appointments**, choose Doctor "Praneeta Jain" → The grid loads.
2. In **Patient** start typing `Mohammed Imran` → The search fires on every keystroke. When a keystroke returns no matches, the **Add New Patient** dialog opens by itself ("Capture minimal details to create a patient record without leaving the scheduling flow."), possibly before Riya has finished typing.
3. Riya finishes typing in the dialog's **First Name \*** ("Mohammed") and **Last Name** ("Imran"). Both were prefilled from the partial search text.
4. Enter **Phone \*** `9885123456`, **Age (years)** `34`, set **Gender \*** to "Male" (it defaults to "Other"). Leave **Email** and **ABHA ID** empty and **Consultation Type** on "Offline (In-Clinic Visit)".
5. Click **Create Patient** → The button shows "Saving…". Toast "Patient created — Mohammed Imran has been added". The dialog closes. The search box shows "Mohammed Imran — 9885123456" and the badge "Selected: Mohammed Imran — 9885123456" appears.
6. Click the 12:15 tile → **Book Appointment** opens with Patient "Mohammed Imran" and Phone "9885123456".
7. Keep "OPD Consultation". Optionally pick Consultation Room 2. Click **Confirm Booking** → "Appointment Successfully Booked!" banner.

### Variations
- Riya closes the auto-opened dialog to finish typing → The dialog closes, the search box is cleared and she has to type again. Afterwards the "No matching patients found." panel offers **+ Add "Mohammed Imran" as a new patient**.
- Search by phone first (`9885123456`) → The quick-create dialog prefills **First Name** with "9885123456" and leaves Phone empty. Riya must move the number by hand.
- Riya clicks a slot before choosing a patient → Toast "Patient required" ("Select an existing patient or add a new one before booking.") and the quick-create dialog opens.

### Edge Cases
- First Name or Phone left blank → Red inline box and toast "Missing information — First name is required" / "Phone number is required".
- Duplicate phone or server validation error → Toast "Unable to create patient" with the server message. The message also shows inside the dialog.
- The phone is saved as digits only (no country code). If Dr. Praneeta has "Send WhatsApp on appointment creation" on, the confirmation goes to `+9885123456`, which is missing +91 (see Defects).
- Quick-create collects fewer fields than "Create Patient" on the Patients page (no address, emergency contact, source, primary doctor or walk-in flag). This is a duplicate creation surface.

---

## STORY-003: Book a 60-minute Chemical Peel in a procedure room

**Type**: medium
**Topic**: appointments-scheduling-rooms
**Persona**: Riya (RECEPTION) booking an aesthetic procedure that needs a room
**Goal**: Book Lakshmi Prasanna for a 60-minute Chemical Peel with Dr. Shravya at 15:00 tomorrow in Procedure Room A, with the procedure name visible on the calendar
**Preconditions**: Lakshmi Prasanna exists. Procedure Room A is free 15:00–16:00 tomorrow. Dr. Shravya is free.
**Ideal path**: 7 — set the date, pick the patient, click 15:00, choose Procedure, type the procedure name, set 60 minutes, pick the room and confirm (8 actions; the type and room choices could reasonably be merged)
**Alternate paths**: Slots tab (the procedure name is silently dropped there, see Defects). The Procedures page ("Save Procedure") records a procedure session as a visit, not a booking, so it is not an alternative.

### Steps
1. On **Appointments**, set **Date** to tomorrow and Doctor to "Shravya Dermatologist".
2. Search and select "Lakshmi Prasanna — 9703344556".
3. Press on the 15:00 tile and drag down to 15:45 → The tiles highlight amber. On release the "Book Appointment" dialog opens.
4. Riya expected 15:00-16:00, but **Time Slot** shows 15:00-15:30 because **Duration** stayed at 30. She sets **Duration** to "60 minutes" → Time Slot becomes 15:00-16:00 ("Adjusts end time and validates room availability for the new duration.").
5. Set **Appointment Type \*** to "Procedure" → Help text "Medical procedure or surgery - room selection required". The **Procedure Name** field appears. The room list now shows only procedure-type rooms (Procedure Room A/B/C) under "Room Availability for PROCEDURE \*". **Confirm Booking** is disabled until a room is chosen.
6. Type **Procedure Name** `Chemical Peel (Glycolic 35%)` → Hint "This will be shown on the calendar next to the patient name for quick reference."
7. Click the **Procedure Room A** card ("Procedure • Capacity: 3", "✓ Available for 15:00-16:00") → Ring selected. Footnote "* Room selection is required for procedures."
8. Click **Confirm Booking** → Banner "Lakshmi Prasanna scheduled for 15:00-16:00 in Procedure Room A (PROCEDURE)". The calendar span reads "15:00-16:00 Lakshmi Prasanna (Chemical Peel (Glycolic 35%))" in purple, labelled PROCEDURE.
9. Open **INFO** on the new span → "Appointment Details" shows Type PROCEDURE, "Procedure: Chemical Peel (Glycolic 35%)", "Room: Procedure Room A (Procedure)", Status SCHEDULED.

### Variations
- Changing **Appointment Type** clears the selected room and the procedure name.
- All procedure rooms are occupied → Every card is red "Occupied" with a "Conflict with" line. Confirm stays disabled, so Riya must change the time or duration.
- No procedure-type rooms exist → "No procedure rooms available / You can still book this appointment. Room assignment can be done later." Confirm is still disabled because procedures need a room, so the hint is wrong for procedures.
- On the **Slots** tab the identical steps book the appointment, but the "Chemical Peel" name is lost: no purple suffix and no "Procedure:" line.

### Edge Cases
- Dr. Shravya has blocked 15:00–16:00 tomorrow (BLOCKED, "Laser machine service") → Red banner above the grid "Not bookable: Blocked time 15:00-16:00 (Laser machine service)". The dialog shows a red alert "Cannot book 15:00-16:00: Blocked time …" and **Confirm Booking** is disabled. The grid tiles themselves are not marked blocked.
- Procedure Room A is booked 15:30–16:00 by Dr. Praneeta → After choosing 60 minutes, the Room A card turns "Occupied". If Room A was selected before the duration change, Confirm shows "Validation Error — Selected room is not available at this time".
- The procedure name also appears on the Room Calendar block and its hover tooltip ("Notes:").

---

## STORY-004: Doctor clicks "Book appointment" from a patient's chart for a follow-up

**Type**: short
**Topic**: appointments-scheduling-rooms
**Persona**: Dr. Praneeta Jain (DOCTOR) finishing a review and wanting a two-week follow-up for Arjun Varma
**Goal**: Book a follow-up for the patient she is viewing without retyping the name
**Preconditions**: Logged in as `praneeta@clinic.test`, on `/dashboard/patients/<Arjun's id>`.
**Ideal path**: 4 — click "Book appointment", set the date, click a slot, confirm (the patient is already known)
**Alternate paths**: PatientProgressTracker "Book" button (same `?patientId=` link). Appointments page with a manual patient search (STORY-001).

### Steps
1. On Arjun's patient detail page click **Book appointment** → Navigates to `/dashboard/appointments?patientId=<id>`.
2. She looks for Arjun's name → The **Patient** search box is empty and no "Selected: …" badge appears. The page silently holds the patient id.
3. Set **Date** to two weeks ahead and click the 10:00 tile → **Book Appointment** opens with "Patient: Unknown Patient" and "Phone: N/A".
4. Click **Confirm Booking** → Toast "Validation Error — Patient information is missing" and a red list "Please fix the following errors". The booking cannot go through (see Defects).
5. Workaround: Cancel, type `arjun` in **Patient**, select "Arjun Varma — 9010022334", click the slot again and confirm → The booking succeeds.

### Variations
- Same result on the **Slots** tab.
- PatientProgressTracker shows **Book** only when the patient has no upcoming appointment. Otherwise it shows "Start Visit".

### Edge Cases
- If the doctor types in the Patient box, the hidden prefilled id is cleared, so the workaround is the only path.

---

## STORY-005: Patient calls to move her appointment to the afternoon (reschedule)

**Type**: medium
**Topic**: appointments-scheduling-rooms
**Persona**: Riya (RECEPTION) on the phone with Fatima Begum, who can't make 10:00
**Goal**: Move Fatima's 10:00–10:30 OPD with Dr. Shravya to 16:30 today, or to tomorrow if today is full
**Preconditions**: Fatima has a SCHEDULED 10:00-10:30 OPD with Dr. Shravya today. 16:30 is free.
**Ideal path**: 3 — choose reschedule on the appointment, click the new slot, confirm
**Alternate paths**: none found in the UI. RESCHED is the only entry. The Slots tab's own `startReschedule` and `handleRescheduleSlotSelect` are never wired to the grid. There is no reschedule button in "Appointment Details". `PATCH /appointments/:id` has no UI.

### Steps
1. On **Appointments** (Calendar tab, Dr. Shravya, today) hover Fatima's span → **INFO**, **RESCHED** and **START** fade in on the right.
2. Click **RESCHED** → An amber banner appears above the grid: "Rescheduling Fatima Begum — Click a free time to move this appointment to <today>." with a **Cancel** button. No patient selection is needed in this mode.
3. Hover the 16:30 tile → Tooltip "Move to 16:30-17:00" (the original 30-minute duration is kept).
4. Click it → The move happens immediately, with no confirm step. Toast "Appointment rescheduled — Fatima Begum moved to 16:30-17:00". The banner clears and the grid refreshes.
5. To try tomorrow instead: click **RESCHED** again, change the page **Date** to tomorrow → The banner text updates to the new date and stays active. Click a free tile → The appointment moves to tomorrow with a new token number for that day.

### Variations
- Click **Cancel** in the banner → Reschedule mode ends and nothing changes.
- The grid is 15 minutes and the appointment is 30 minutes → The tile cannot hold the whole duration, so the UI tries `<tileStart>-<tileStart+30>`. That can overlap the next booking and return "Failed to reschedule — Scheduling conflict detected for new time slot".
- Fatima had Consultation Room 1 → The room is kept. If the room is busy at 16:30 for another doctor, the move fails with a 409 and there is no way to change the room during reschedule.

### Edge Cases
- Riya switches the **Doctor** select while the banner is still showing (thinking "maybe Dr. Praneeta is free at 16:30") → The banner stays, the grid shows Dr. Praneeta's free slots, but the server keeps Dr. Shravya as the doctor. The move is validated against Dr. Shravya, and on success the appointment is not visible on the calendar she is looking at (see Defects).
- New slot falls in Dr. Shravya's leave → 409 "Doctor is on leave at this time (…)" → Toast "Failed to reschedule".
- COMPLETED or CANCELLED appointments → Server returns 400 "Cannot reschedule completed appointment". The UI still shows RESCHED on completed spans.
- A NURSE clicks RESCHED → 403 Forbidden ("Failed to reschedule"), because `POST /appointments/:id/reschedule` omits NURSE even though seeded NURSE permissions include `appointments:reschedule`.
- Rescheduling resets the status to SCHEDULED.

---

## STORY-006: Cancel a no-show appointment, with a "Keep" change of mind

**Type**: short
**Topic**: appointments-scheduling-rooms
**Persona**: Riya (RECEPTION), careful about destructive actions
**Goal**: Cancel Kiran Goud's 17:00 appointment after he messages that he is travelling to Warangal
**Preconditions**: Kiran has a SCHEDULED 17:00-17:30 appointment with Dr. Praneeta today, with no visit started.
**Ideal path**: 3 — open the appointment, choose cancel, confirm
**Alternate paths**: none that work. Long-press on a tile is meant to open details but is unreachable on both desktop and touch. The Quick Guide's "double-click appointment to view/edit/cancel" has no handler. The inline X cancel button exists in the code but is disabled (`showInlineActions = false`).

### Steps
1. Hover Kiran's span and click **INFO** → Dialog "Appointment Details": Date, Slot, Patient, Phone, Age, Sex, FOLLOW-UP badge if he has past visits, Type, Room, Status. Buttons **Close**, **Start Visit**, **Cancel Appointment**.
2. Click **Cancel Appointment** → Confirm dialog "Cancel Appointment": "Are you sure you want to cancel this appointment? This action cannot be undone." with Patient, Date, Time and Type repeated. Buttons **Keep Appointment** and **Yes, Cancel Appointment**.
3. Riya hesitates and clicks **Keep Appointment** → She returns to "Appointment Details" and nothing changes.
4. Kiran confirms he won't come. Click **Cancel Appointment** → **Yes, Cancel Appointment** → Toast "Appointment Cancelled — The appointment has been successfully cancelled." The span disappears from the grid. 17:00 is bookable again.

### Variations
- Logged in as a NURSE → The same buttons show, but confirm returns 403 → Toast "Failed to cancel appointment". "Yes, Cancel Appointment" then stays disabled until the dialog is reopened.
- Appointment with a visit IN_PROGRESS → 400 "Cannot cancel appointment in progress". COMPLETED → "Cannot cancel completed appointment".
- If the doctor had connected Google Calendar, the event is deleted in the background.

### Edge Cases
- Cancelled appointments vanish from every surface (doctor grid, Room Calendar, dashboard). There is no "show cancelled" filter and no undo, unlike patient archive, which has one.
- The details are shown three times in a row: the calendar span, "Appointment Details" and the cancel confirm card.

---

## STORY-007: Doctor connects her Google Calendar

**Type**: medium
**Topic**: appointments-scheduling-rooms
**Persona**: Dr. Shravya (DOCTOR), wants clinic bookings on her phone's Google Calendar
**Goal**: Connect Google Calendar so new bookings appear on her calendar
**Preconditions**: Server has `GCAL_CLIENT_ID`, `GCAL_CLIENT_SECRET` and `GCAL_REDIRECT_URI`, so `/google-calendar/configured` is true. Logged in as `shravya@clinic.test`.
**Ideal path**: 3 — click connect, approve on Google, return
**Alternate paths**: none found. The button exists only in the Calendar tab header. The header "My Settings" dialog has no Google section, and the Slots tab has none.

### Steps
1. Open **Appointments** → The "Doctor Calendar" card header shows **Sync with Google Calendar** (Google "G" icon).
2. Click it → It changes to "Connecting...", then the browser goes to Google's consent screen.
3. Approve the calendar scope → Google redirects to `/dashboard/appointments/google-callback?code=…&state=/dashboard/appointments` → A spinner shows "Connecting your Google Calendar...".
4. → A green check shows "Google Calendar connected successfully!" and "Redirecting to appointments...". After about 1.5 s she is back on Appointments.
5. The header now shows "Syncing", a badge with her email and a **Disconnect** link. With her own name selected in Doctor, a green strip reads "Dr. Shravya Dermatologist's appointments will auto-sync to Google Calendar (shravya@clinic.test)".
6. Book a test appointment (STORY-001 flow) → An event "<patient> — OPD" with doctor, patient, visit type, slot and room is created on her primary calendar in the background. No success or failure feedback appears in the UI.
7. Later she clicks **Disconnect** → "Disconnecting...", then toast "Google Calendar — Disconnected successfully." and the button returns.

### Variations
- She clicks "Cancel"/"Deny" on Google → The callback shows a red X with "You denied access to Google Calendar." and "Redirecting back...", then returns after 3 s.
- The callback URL is opened without a code → "No authorization code received from Google."
- Google returns no refresh token → "Google did not return a refresh token. Please retry with "consent" prompt." and a redirect after 4 s.
- Receptionist view: Riya sees the same **Sync with Google Calendar** button. If Riya has connected and Dr. Praneeta has not, an amber strip says "Dr. Praneeta Jain's Google Calendar is not connected. Appointments won't sync to their calendar. Ask the doctor to log in and connect their own Google Calendar."
- Server not configured → The whole Google area is hidden.

### Edge Cases
- Riya connects her own Google account → Every appointment she books for any doctor syncs to Riya's calendar, not the doctor's, because the sync uses the caller's credentials first. The green strip still tells her the doctor's appointments will auto-sync (see Defects).
- An event created by one user's credentials and later rescheduled or cancelled by another user → The patch or delete goes to the second user's calendar and fails silently. The original event is left stale.
- The badge shows the clinic login email (from `users.email`), not the Google account that was actually connected.

---

## STORY-008: Doctor sets a split weekly schedule and marks a CME leave

**Type**: medium
**Topic**: appointments-scheduling-rooms
**Persona**: Dr. Praneeta Jain (DOCTOR), works 10:00–13:00 and 16:00–20:00 on weekdays and attends a dermatology CME in Hyderabad next Friday morning
**Goal**: Configure her hours and block the CME so reception can't book her then
**Preconditions**: Logged in as `praneeta@clinic.test`. No hours configured yet (source "default").
**Ideal path**: 7 — open settings, set Monday's two shifts (2), copy to Tue–Fri, save, then add the leave with dates and times (about 3)
**Alternate paths**: An Admin or Owner can do the same from Users → doctor row **Working Hours** → dialog "Availability: Dr. Praneeta Jain" (STORY-009). Same component, two entry points, a redundancy candidate.

### Steps
1. Click the gear (**Open settings**) in the header → Dialog **My Settings** opens with Doctor signature, Prescription letterhead, the availability sections, then the WhatsApp toggles.
2. In "Weekly working hours (IST)" she sees an amber note: "No hours set yet; the clinic default 09:00-18:00 applies every day. Save to set a schedule." Every weekday reads "Day off".
3. On Monday click **+ Shift** → 09:00 to 13:00 is added. Change the start to 10:00. Click **+ Shift** again → 14:00 to 18:00 is added. Change it to 16:00–20:00.
4. Click **Copy Monday to Tue–Fri** → Tuesday to Friday show the same two shifts. Saturday and Sunday stay "Day off".
5. Click **Save hours** → "Saving…", then the status line "Working hours saved." The amber note disappears.
6. In "Leave and blocked time" ("Appointments cannot be booked during leave, blocked time, or clinic holidays.") keep **Type** "Leave". Set **From** and **To** to next Friday, untick **All day**, set **Start time** 10:00 and **End time** 13:00, **Reason (optional)** "IADVL CME, HICC".
7. Click **Add leave** → "Adding…", then the list shows "Leave · 13 Nov 2026, 10:00 – 13 Nov 2026, 13:00 · IADVL CME, HICC" with a trash button.
8. Close the dialog. As a check she opens **Appointments** with herself selected and next Friday's date → The red banner "Not bookable: Leave 10:00-13:00 (IADVL CME, HICC)". The grid now runs 10:00–20:00.

### Variations
- Overlapping shifts (Monday 10:00–13:00 and 12:00–15:00) → Red alert "Monday: shifts overlap". End before start → "Monday: 16:00-14:00 must end after it starts". All days empty → "Add at least one shift".
- Whole-day leave: keep **All day** ticked with From/To spanning Mon–Wed → The entry reads "16 Nov 2026 – 18 Nov 2026 (all day)".
- **Type** "Blocked time" for a lunch block, labelled "Blocked time" in lists and banners.
- Remove a leave with the trash icon → The list reloads.
- Clinic holidays added by admin appear in her list as "Clinic holiday · …" without a trash button. Only admins can remove them.

### Edge Cases
- She adds leave over a slot that already has a booking → It is accepted with no warning. The existing appointment stays on the calendar inside a "Not bookable" window.
- Reception books 14:00 (inside her 13:00–16:00 break) → Allowed with the amber warning "Warning: selected time 14:00-14:30 is outside doctor's working hours (10:00-13:00, 16:00-20:00)." Only time off is blocked.
- Evening appointments from 18:00 to 20:00 appear on her doctor grid but are invisible on the Room Calendar, which is fixed at 09:00–18:00 (see Defects).
- Conflict suggestions after a 409 are limited to 09:00–18:00 and never offer her evening slots.

---

## STORY-009: Admin declares Sankranti a clinic holiday and fixes a doctor's hours

**Type**: medium
**Topic**: appointments-scheduling-rooms
**Persona**: Clinic admin (`admin@clinic.test`) planning the January calendar
**Goal**: Close the clinic on 14–15 Jan 2027 for Sankranti and set Dr. Shravya's Saturday half-day
**Preconditions**: Logged in as ADMIN. No holidays exist yet.
**Ideal path**: 6 — open holidays, set dates and reason, add; open the doctor's hours, add Saturday, save
**Alternate paths**: Holidays can only be added from Users → **Clinic Holidays**. They can also be deleted from a doctor's **Working Hours** dialog, which shows holiday rows with a trash icon for admins. Doctor hours can also be edited by the doctor in header **My Settings** (STORY-008).

### Steps
1. Sidebar **Users** → "Users Management". Click **Clinic Holidays** (top right) → Dialog "Clinic Holidays": "Holidays close the clinic for all doctors. Appointments cannot be booked on them." and "No upcoming holidays."
2. Set **From** 2027-01-14 and **To** 2027-01-15, keep **All day**, set the reason "Sankranti". Click **Add clinic holiday** → The list shows "14 Jan 2027 – 15 Jan 2027 (all day) · Sankranti".
3. Close the dialog. In the user table, on Dr. Shravya's row click **Working Hours** → Dialog "Availability: Dr. Shravya Dermatologist" with the same sections as STORY-008. The Sankranti holiday is listed with a trash icon.
4. On Saturday click **+ Shift**, set 09:00–13:00, then **Save hours** → "Working hours saved."
5. To check, open **Appointments**, choose Dr. Shravya and date 2027-01-14 → The banner "Not bookable: Clinic holiday all day (Sankranti)". Clicking any tile and confirming is blocked: the dialog shows a red "Cannot book …: Clinic holiday all day (Sankranti)." and Confirm is disabled.

### Variations
- A MANAGER opens Users → The **Clinic Holidays** and **Working Hours** buttons are visible but every call returns 403, shown as "Could not load holidays." / "Could not load availability." (see Defects).
- A DOCTOR calls the holiday API directly → 403 "Only an admin can manage clinic holidays".
- Ranges longer than one year → 400 "Time off cannot exceed one year". To earlier than From → "The end date must be on or after the start date."

### Edge Cases
- Appointments already booked on 14 Jan stay as they are. Nothing warns that the holiday overlaps existing bookings.
- The holiday list shows only upcoming entries. Past holidays drop off with no history view.

---

## STORY-010: Receptionist checks which procedure room is free for a walk-in laser touch-up

**Type**: short
**Topic**: appointments-scheduling-rooms
**Persona**: Riya (RECEPTION), needs a room at a glance
**Goal**: See which procedure room is free around 14:00 today before booking
**Preconditions**: Several appointments with rooms exist today.
**Ideal path**: 3 — open Rooms, filter to Procedure, read the 14:00 row
**Alternate paths**: The "Book Appointment" dialog's room cards show the same per-room availability for the chosen slot. The Appointments **Room** filter shows one doctor's bookings in a room, not room occupancy.

### Steps
1. Sidebar **Rooms** → "Room Management — Manage room schedules, occupancy, and configurations". Tab **Calendar View** shows "Room Calendar & Occupancy" ("Loading room calendar…" first). Reception sees no **Manage Rooms** tab.
2. Stat cards read Total Rooms 6, Available 2, Occupied 4, Appointments 11. "Available" means rooms with zero bookings all day, not rooms free right now.
3. In the type select choose "⚕️ Procedure" → Only Procedure Room A/B/C columns remain.
4. Click **Now** → The grid scrolls to the current hour. Hover a purple block in Procedure Room B → A floating card shows the patient, date • slot, phone, Doctor, Type, Status, Notes (procedure name) and Room.
5. She sees Procedure Room C is empty at 14:00 → She goes to Appointments and books with Room C (STORY-003).

### Variations
- **‹ / ›** chevrons move by one day. **Today** jumps back. The **Grid: 10m–60m** select only changes the line density.
- **Search room name...** filters the columns ("Telemedicine" shows only the suite).

### Edge Cases
- Logged in as NURSE → Both room endpoints return 403, the error is swallowed, and the calendar renders empty with "Total Rooms 0" and no message (see Defects).
- Appointments after 18:00 or before 09:00 are not drawn at all.
- The page Quick Guide ("Room Management Guide") promises "Click on appointments to view details or reassign rooms", "Set room availability schedules", "Track room cleaning and maintenance schedules". None of these exist; blocks are hover-only. On a touch tablet the tooltip is unreachable.
- Overlapping appointments in one room show side by side, with no warning that the room capacity is exceeded.

---

## STORY-011: Admin adds a new laser room, then retires an old one

**Type**: medium
**Topic**: appointments-scheduling-rooms
**Persona**: Clinic admin setting up the new Kondapur branch wing
**Goal**: Add "Laser Suite 1" (Procedure, capacity 2), rename it, and take Procedure Room C out of service
**Preconditions**: Logged in as ADMIN (or DOCTOR or OWNER, who also see the tab). Procedure Room C has past appointments.
**Ideal path**: 8 — open the tab (1), add the room with name, type and capacity and save (4), rename and save (2), deactivate (1)
**Alternate paths**: Activation can be toggled from the row **Switch** or from the **Room is active** checkbox in the Edit dialog. Two controls do the same thing, a redundancy candidate.

### Steps
1. **Rooms** → tab **Manage Rooms** → "Room Configuration & Management". Inside, "Rooms Management" shows stat cards (Total Rooms, Consultation, Procedure, Telemedicine) and the "All Rooms" table (Name, Type, Capacity, Status, Created, Actions).
2. Click **Add Room** → Dialog "Add New Room": **Room Name \***, **Room Type \*** (Consultation Room, Procedure Room, Operation Theater, Telemedicine Suite, Emergency Room, Recovery Room, Waiting Area, Laboratory, Imaging Room, Pharmacy), **Capacity \*** (1–20), **Room is active** ticked.
3. Enter "Laser Suite 1", choose "🏥 Procedure Room", capacity 2. Click **Add Room** → "Saving...", then toast "Room created". The row appears and the Procedure stat goes up by one.
4. Click **Edit** on it → Dialog "Edit Room". Rename it to "Laser Suite 1 (Q-switch)". Click **Update Room** → Toast "Room updated".
5. Procedure Room C: click **Delete** → Browser confirm 'Are you sure you want to delete "Procedure Room C"?' → OK → Toast "Failed to delete room — Cannot delete room with existing appointments" (cancelled appointments also count).
6. Use the row **Switch** instead → Toast "Room deactivated". The badge shows "Inactive".
7. Back on **Calendar View** and in the booking dialog, Procedure Room C no longer appears.
8. Next week she wants to reactivate it → The row is gone from Manage Rooms, and the **Inactive** status filter shows "No rooms match your filters." The room cannot be found to reactivate (see Defects).

### Variations
- Empty name → Toast "Room name is required".
- Filters: "Search by room name...", type "All types", status All/Active/Inactive. Empty result: "No rooms match your filters."
- A RECEPTION or NURSE user never sees the **Manage Rooms** tab. The backend also limits create, update and delete to ADMIN and DOCTOR (OWNER passes the global bypass).

### Edge Cases
- Room types matter for booking: the dialog matches rooms to visit type by keyword ("consult/opd/clinic", "procedure/operation/surgery", "telemed/virtual/online"). A room typed "Laboratory" or "Imaging" never appears for any visit type.
- Stat cards here count active rooms by type. The Room Calendar's "Total Rooms" counts filtered active rooms. Same label, different meaning on two tabs of one page.

---

## STORY-012: A full clinic day — from morning schedule check to the doctor starting visits

**Type**: long
**Topic**: appointments-scheduling-rooms
**Persona**: Riya (RECEPTION) running the front desk, with Dr. Shravya (DOCTOR) in Consultation Room 1
**Goal**: Run a realistic Hyderabad clinic morning: check the day, handle a phone booking, a walk-in, a procedure, a reschedule and a cancellation, then hand patients to the doctor for documentation
**Preconditions**: Seeded users and rooms. A few existing appointments today for Dr. Shravya. Dr. Shravya's hours are 10:00–14:00 today. Two browser sessions: Riya on the front-desk PC, Dr. Shravya on her consult-room laptop.
**Ideal path**: 30 — the five booking and admin tasks at about 4 to 5 actions each (about 24), plus about 6 actions for the doctor's handoff
**Alternate paths**: Booking via the Slots tab or Patients walk-in. Starting a visit from Patients row "Start Visit", patient detail, PatientProgressTracker "Start Visit", Visits page "Start New Visit", or the doctor's notification bell (whose `visits?appointmentId=` link ignores the appointment, see Defects).

### Steps
1. Riya logs in at `/login` with `reception@clinic.test` / `password123` → Dashboard. "Today's Appointments" lists the first 5 appointments across all doctors.
2. She clicks the button under "Today's Appointments" → `/dashboard/appointments`.
3. Doctor "Shravya Dermatologist", Date today → The grid runs 10:00–14:00, with FOLLOW-UP markers on returning patients.
4. She opens **Quick Guide** → Five tips, including "double-click appointment to view/edit/cancel" (no such gesture exists). She closes it.
5. Phone booking: types `sneha` in Patient, selects "Sneha Reddy — 9849012345", clicks 11:00 → **Book Appointment**, OPD, Consultation Room 1 → **Confirm Booking** → "Appointment Successfully Booked!".
6. Walk-in: types `Gayatri Rao` → No matches, so **Add New Patient** auto-opens. She enters Phone 9959067890, Age 41, Gender Female, then **Create Patient** → Toast "Patient created". She clicks 11:30 and confirms OPD.
7. Procedure: selects "Lakshmi Prasanna", drags 12:00→12:30, sets **Duration** to 45 and **Appointment Type** to Procedure, types **Procedure Name** "PRP – scalp", picks Procedure Room A → **Confirm Booking** → The purple span reads "Lakshmi Prasanna (PRP – scalp)".
8. She switches to the **Slots** tab to compare → The Doctor select at the top still says "Shravya Dermatologist", but the grid may show the first doctor in the list, because the tab remounts and resets to the first doctor (see Defects). She switches back to **Calendar**. Her patient selection is gone (each tab keeps its own state).
9. Reschedule: Fatima Begum calls. Riya hovers Fatima's 10:30 span → **RESCHED** → banner "Rescheduling Fatima Begum" → clicks 13:00 → Toast "Fatima Begum moved to 13:00-13:30".
10. Cancellation: Kiran Goud cancels by WhatsApp. **INFO** → **Cancel Appointment** → **Yes, Cancel Appointment** → Toast "Appointment Cancelled".
11. Room check: sidebar **Rooms** → Calendar View. Procedure Room A shows Lakshmi 12:00–12:45. Consultation Room 1 shows Sneha at 11:00.
12. Dr. Shravya logs in on her laptop (`shravya@clinic.test`). Her header bell lists upcoming appointments ("<patient> on <date>"). She clicks one → `/dashboard/visits?appointmentId=…` opens the Visits setup screen with no patient chosen; the link drops the appointment context.
13. She goes to **Appointments** instead (her own name may need selecting) and hovers Sneha's 11:00 span → **START**.
14. → Navigates to `/dashboard/visits?patientId=…&appointmentId=…&autoStart=true` → "Visit Documentation" opens the visit form for Sneha with a "Linked to Appointment" badge. The doctor is taken from the appointment.
15. She documents and saves a draft (visit-documentation topic), then returns to **Appointments** → Sneha's span now shows **CONT** instead of START.
16. She opens **INFO** on Sneha → "Appointment Details" still offers **Start Visit**, which actually continues the existing visit (`visitId` is passed). The label differs from the tile's CONT.
17. At 13:05 Riya tries to book a 13:00 latecomer → The 13:00 tile is greyed (past, IST), so she books 13:15 instead.
18. End of morning: Riya checks the Dashboard "Today's Appointments" list again → Statuses show SCHEDULED, IN_PROGRESS or COMPLETED, matching the grid colours (Completed grey, Past lighter shades).

### Variations
- Dr. Shravya starts the visit from Appointment Details **Start Visit** instead of the tile → Same URL.
- Riya clicks **START** herself (RECEPTION) → She lands on Visit Documentation with the limited reception form (Photos and basic info). Creating the visit needs a DOCTOR/ADMIN/OWNER role on the server.
- On a touch tablet at the desk, the hover-only INFO, RESCHED and START buttons are invisible and long-press does not open details.

### Edge Cases
- Two receptionists book the same 11:30 at once → The server's advisory lock lets only one through. The other gets a "Scheduling Conflict" toast.
- The schedule fails to load (network) → "Failed to load schedule" with a **Retry** button and a destructive toast.
- Each appointment on the grid fetches the patient and their visit history one by one. A 30-appointment day can show "Refreshing schedule…" for a noticeable time after every booking.
- The "now" red line and the past-tile greying are computed once when the grid mounts. Leaving the page open across the morning slowly makes the now line wrong until reload or a date change.

---

## Defects noticed while mapping

All verified by reading both the frontend and the backend. The known issue that `PATCH /appointments/:id` and bulk update skip the lock and conflict check is excluded.

1. **"Book appointment" from a patient can't be completed.** The `?patientId=` prefill sets only `selectedPatientId` and never `selectedPatient`. The dialog gets `patient={null}`, shows "Unknown Patient", and `validateForm` fails with "Patient information is missing". Evidence: `frontend/src/components/appointments/AppointmentsCalendar.tsx:98-102,713`; `AppointmentScheduler.tsx:80-84,794`; `AppointmentBookingDialog.tsx:178-180`. Entry links: `frontend/src/app/dashboard/patients/[id]/page.tsx:221`, `frontend/src/components/patients/PatientProgressTracker.tsx:191`.
2. **The booking dialog ignores the selected time range.** `durationMinutes` is initialised once with `useState(() => getSlotDurationMinutes(slot))`, when the slot is still `''`, so it starts at 30. The close-reset block never resets it, and `derivedSlot` rewrites the end time. Drag-selected ranges and the Slots tab's "Duration" select get cut back to 30 minutes or the last value used. Evidence: `AppointmentBookingDialog.tsx:60-72,88-98`.
3. **The Slots tab drops the procedure name.** `handleBookingConfirm` neither accepts nor forwards `notes`. Evidence: `frontend/src/components/appointments/AppointmentScheduler.tsx:314-329`; compare `AppointmentsCalendar.tsx:358-366`.
4. **Visit Type and Room filters make booked tiles look free.** Free and overlap detection uses `filteredSchedule`, so hidden appointments look bookable and the booking ends in a 409. Evidence: `frontend/src/components/appointments/DoctorDayCalendar.tsx:120-138,551,609,743`.
5. **Reschedule mode survives a doctor change.** `rescheduleTarget` is never cleared when `doctorId` changes, so the UI validates against the new doctor's grid. The server always keeps the original doctor (`appointment.doctorId`), so the moved appointment disappears from view or hits an unexpected 409. Evidence: `DoctorDayCalendar.tsx:84,343-352,872-889`; `backend/src/modules/appointments/appointments.service.ts:473-489`.
6. **The chosen doctor resets to the first doctor when switching Calendar/Slots tabs.** Radix `TabsContent` unmounts inactive tabs (`frontend/src/components/ui/tabs.tsx:131-141`, no `forceMount`). On remount the controlled-doctor effect runs first, then the async `fetchDoctors` overwrites it with `list[0]`, while the page Doctor select still shows the persisted doctor. Evidence: `AppointmentsCalendar.tsx:143-145,174-179`; `AppointmentScheduler.tsx:87-89,162-168`.
7. **The Quick Guide promises interactions that don't exist.** It says "double-click appointment to view/edit/cancel", but the topic has no `onDoubleClick` and no edit UI. The long-press handlers on tiles can never fire because the label overlay (`pointerEvents:'auto'`, `zIndex:2`, full width) sits above occupied tiles. Evidence: `frontend/src/app/dashboard/appointments/page.tsx:115`; `DoctorDayCalendar.tsx:457-466` vs `654-716`.
8. **NURSE sees room and reschedule UI the server rejects.** The sidebar shows Rooms to NURSE and the grid shows RESCHED. The seed grants NURSE `rooms:read` and `appointments:reschedule` (`backend/scripts/seed_rbac.ts:30-36`). But `GET /appointments/rooms`, `/rooms/all`, `/room/:id/schedule` and `POST /:id/reschedule` omit NURSE in `@Roles` (`backend/src/modules/appointments/appointments.controller.ts:97,112,119,180`). Result: RoomCalendar renders empty with the error swallowed (`frontend/src/components/rooms/RoomCalendar.tsx:66-84`), the booking dialog toasts "Failed to fetch rooms", and procedure bookings are impossible because a room is required.
9. **MANAGER has nav links to screens that are 403 throughout.** Appointments and Rooms are in MANAGER's sidebar (`frontend/src/components/layout/sidebar.tsx:66-69,84-87`), and Users shows "Clinic Holidays" and "Working Hours" (`frontend/src/components/users/UsersManagement.tsx:423,532`). No appointment, room or doctor-availability endpoint admits MANAGER (`appointments.controller.ts:48-213`; `backend/src/modules/doctor-availability/doctor-availability.controller.ts:26-31,51,85`).
10. **Manage Rooms never lists inactive rooms, so a deactivated room can't be reactivated.** It calls `getRooms()` (`/appointments/rooms`, `isActive: true` only) and falls back to `/rooms/all` only when that throws. Evidence: `frontend/src/components/rooms/RoomsManagement.tsx:62-71`; `appointments.service.ts:784-797`.
11. **The Room Calendar is hard-coded to 09:00–18:00.** Appointments outside that window are clamped to nothing and not drawn, while the doctor grid follows working hours. Evidence: `RoomCalendar.tsx:51-52,410-411,451-453` vs `frontend/src/lib/doctor-availability.ts:70-75`.
12. **The Rooms Quick Guide advertises features that don't exist**: click to view or reassign rooms, availability schedules, amenities, cleaning tracking. Appointment blocks are hover-only with no click handler. Evidence: `frontend/src/app/dashboard/rooms/page.tsx:283,290-301`; `RoomCalendar.tsx:473,494-520`.
13. **Google Calendar syncs to whoever booked, not to the doctor.** `syncAppointmentEvent` and `deleteAppointmentEvent` prefer the caller's credentials over the doctor's. The "Sync with Google Calendar" button is shown to every role, and the UI says "Dr. X's appointments will auto-sync". Reception bookings land in the receptionist's calendar, and cross-user edits patch the wrong calendar. Evidence: `backend/src/modules/google-calendar/google-calendar.service.ts:181-186,264-272`; `AppointmentsCalendar.tsx:436-497`.
14. **Open redirect on the Google callback.** The `state` / `redirect` value is passed through untouched and used as a navigation target. Evidence: `frontend/src/app/dashboard/appointments/google-callback/page.tsx:52-54`; `backend/src/modules/google-calendar/google-calendar.controller.ts:36-44,75-76`.
15. **The server's past-booking check reads the IST slot as UTC.** `new Date(\`${date}T${start}:00.000Z\`)` lets bookings through up to 5h30m in the past. `getAvailableSlots` uses `istClock` correctly. Evidence: `appointments.service.ts:1036-1043` vs `:667`. Reschedule has no past check at all (`:454-489`).
16. **WhatsApp confirmations go to numbers without +91.** Patient phones are stored as digits only (`backend/src/modules/patients/patients.service.ts:21-25`). The confirmation just prefixes `+` (`appointments.service.ts:207-209`; `backend/src/modules/notifications/notifications.service.ts:68-73`). A 10-digit Indian mobile becomes `+9849012345`.
17. **Conflict suggestions can be wrong.** They come from a fixed 09:00–18:00 grid and exclude only exact-string matches of booked slots. They can overlap existing bookings and ignore leave, working hours and the past. Evidence: `backend/src/modules/appointments/utils/scheduling.utils.ts:144-166`.
18. **The doctor's appointment notifications drop the appointment.** They link to `/dashboard/visits?appointmentId=…` without `patientId`, and the Visits page reads `appointmentId` only when `patientId` is present. Evidence: `frontend/src/components/layout/header.tsx:177`; `frontend/src/app/dashboard/visits/page.tsx:575-588`.
19. **Search results and reception notifications land on today.** Appointment results in global search and RECEPTION notifications link to bare `/dashboard/appointments`, which opens the persisted doctor and today rather than the appointment's doctor and date. Evidence: `header.tsx:188,444`.
20. **Minor label mismatch.** "Appointment Details" always says **Start Visit**, even when a visit exists, while the tile says CONT and the handler continues the visit. Evidence: `DoctorDayCalendar.tsx:997-1000` vs `539-542`.
21. **Minor: the now-line goes stale.** "Now" and `isToday` are memoised once (deps: timezone or date only), so the now line and today detection go stale on a long-open page. Evidence: `DoctorDayCalendar.tsx:107-117`.
22. **Dead code (redundancy note, not user-visible).** `AppointmentScheduler`'s `startReschedule`, `handleRescheduleSlotSelect` and `handleStartVisit` (which auto-creates a visit) are never wired to `DoctorDayCalendar`. The Slots tab behaves like the Calendar tab with a different header. Evidence: `AppointmentScheduler.tsx:408-490,520-571,773-786`.
