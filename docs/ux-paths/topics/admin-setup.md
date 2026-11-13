# Topic 9: Admin and setup (users, roles, reset codes, doctor hours, rooms, fee list, procedures, doctor My Settings)

Source read: `FE/components/users/{UsersManagement,ResetCodeButton,DoctorAvailabilitySettings,DoctorSignatureSettings,DoctorLetterheadSettings}.tsx`, `FE/app/dashboard/{users,rooms,fees,procedures}/page.tsx`, `FE/components/rooms/RoomsManagement.tsx`, `FE/components/billing/ClinicFeeList.tsx`, `FE/components/layout/header.tsx` (My Settings), `FE/app/reset-password/page.tsx`, `FE/app/login/page.tsx`, `BE/modules/{users,auth,doctor-availability}`. Dead code not used: `BillingManagement.tsx`.

Facts that shape several stories:
- Users page is in the sidebar for OWNER, ADMIN and MANAGER, but every write endpoint (`BE/modules/users/users.controller.ts`, `MANAGE = [OWNER, ADMIN]`) refuses MANAGER. A manager sees all buttons and gets an error on use.
- Doctor hours, overbooking and leave are one component (`DoctorAvailabilitySettings`) rendered in two places: Users > "Working Hours" (admin) and header "My Settings" (doctor). Doctor WhatsApp switches exist in both places too (admin copy adds Phone Number ID and Access Token and a template editor).
- Several saves use native `alert()`/`confirm()` (Users form, Role & Permissions, Procedures, Rooms delete, Users delete) while others use toasts or inline status text.

---

## ADMIN-SETUP-01: Dr. Anil logs a Fotona laser session for a returning patient

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

## ADMIN-SETUP-02: Doctor blocks tomorrow as leave from My Settings

**Type**: short
**Topic**: Admin and setup (doctor My Settings, availability)
**Persona**: Dr. Anil Kumar, DOCTOR, has a family function tomorrow
**Goal**: Make tomorrow unbookable so reception cannot schedule patients.
**Preconditions**: Logged in as DOCTOR on any dashboard page.
**Ideal path**: 3 (open settings, pick the date, Add leave). Single day leave needs only a date.
**Alternate paths**: Admin does the same under Users > "Working Hours" on the doctor's row (same component, section "Leave and blocked time"); a clinic-wide closure uses Users > "Clinic Holidays" instead (see ADMIN-SETUP-09). No UI warns about existing appointments on that day (backend `createTimeOff` only checks the dates).

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

## ADMIN-SETUP-03: Admin issues a reset code for a locked-out receptionist

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

---

## ADMIN-SETUP-04: Receptionist redeems the reset code and signs back in

**Type**: short
**Topic**: Admin and setup (reset codes)
**Persona**: Pooja Sharma, RECEPTION, at the login screen with the code Sunita gave her (`K7QM-2XPD`)
**Goal**: Set a new password.
**Preconditions**: Code issued in ADMIN-SETUP-03 and not expired.
**Ideal path**: 3 (type code, type new password, submit). A confirm-password box is not needed when the field has a show-password toggle.
**Alternate paths**: none found (Users > Edit has no password field; there is no change-password UI in the app, only `POST /users/:id/change-password` on the API).

### Steps
1. On "ClinicMS Login" click the link "enter your reset code" (sentence "Forgot password? Ask your clinic admin for a reset code, then enter your reset code.") → page "Set a new password" with the Reset code box focused.
2. Type "K7QM-2XPD" in "Reset code" (required field; placeholder `ABCD-EFGH`).
3. Type a new password in "New password" (required field; at least 8 characters).
4. Type the same password in "Confirm new password" (required field; the user re-enters what they just typed).
5. Click "Set new password" → "Password updated. Taking you to sign in…", redirect to login after about 2.5 seconds.

### Variations
- Click "Back to sign in" instead of waiting.
- Then sign in: "Phone or email" and "Password" and "Sign in" (3 more steps, in another story).

### Edge Cases
- Wrong or expired code: red message "Could not reset the password. Ask an admin for a new code." (or the server message).
- The button stays disabled until all three fields have content.
- Mismatching passwords: submit stays enabled; error comes back after clicking.

---

## ADMIN-SETUP-05: Owner raises the Review consultation fee

**Type**: short
**Topic**: Admin and setup (fee list)
**Persona**: Dr. Sunita Rao, OWNER, moving the review fee from ₹400 to ₹500 from next month
**Goal**: Update the "Review" fee used when reception creates bills on the appointments calendar.
**Preconditions**: Logged in as OWNER or ADMIN; fee list already has First consultation, Review, Procedure rows.
**Ideal path**: 3 (open Fee list, type amount, Save). Each fee saves alone.
**Alternate paths**: Appointment bill dialog `AppointmentBillDialog` has a link "Set fees" that opens this same page (a second route to the page, not a second editor). Non-admins reaching `/dashboard/fees` see "Only an admin can change the fee list."

### Steps
1. Click sidebar "Fee list" (Admin section) → page "Fee list", three rows, each with name, when it applies ("A patient who has visited before"), status line ("₹400 · changed 02 Nov 2026 by Sunita Rao") and a "₹" box.
2. Click the "₹" box on the "Review" row and replace 400 with 500 (required to change; placeholder "Not set") → button "Save" becomes enabled (it stays disabled while the value equals the saved one).
3. Click "Save" → toast "Review fee saved: ₹500", status line updates with time and name. No confirmation dialog; existing bills are not changed (the page description says so).

### Variations
- Empty the box → button reads "Clear fee" → click to remove the fee (toast "Review fee cleared").
- Enter 0 or above ₹10,00,000 → inline "Enter an amount above 0 and up to ₹10,00,000, for example 500."

### Edge Cases
- Another admin changed the same fee first: red message with their change and "Your ₹500 is still in the box."; row reloads to the new saved fee.
- MANAGER and ACCOUNTANT: no sidebar entry; direct URL shows the locked message.
- The same fee shows later on the appointment row chip ("₹500 due"), the "Appointment Details" dialog and the "Bill for <patient>" dialog.

---

## ADMIN-SETUP-06: Admin adds a new receptionist account

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

## ADMIN-SETUP-07: Admin sets a new doctor's weekly hours and overbooking

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

## ADMIN-SETUP-08: Admin adds a procedure room and retires an old one

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

## ADMIN-SETUP-09: Owner onboards a new dermatologist end to end

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
