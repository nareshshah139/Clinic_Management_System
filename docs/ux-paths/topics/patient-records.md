# Patient Records: UX Path Stories

**Topic**: Patient records: list, search, detail, history, photos, portal link, archive, export
**Source read**: `FE/components/patients/PatientsManagement.tsx`, `FE/app/dashboard/patients/page.tsx`, `FE/app/dashboard/patients/[id]/page.tsx`, `FE/components/patients/PatientProgressTracker.tsx`, `FE/components/visits/{usePatientHistory,PatientPhotoArchive,VisitPhotos,PatientHistoryVisitCard}.tsx`, `FE/lib/{patient-history,history-visibility}.ts`, `FE/components/dashboard/DoctorPatientPanels.tsx`, header search in `FE/components/layout/header.tsx`, `BE/modules/patients/{patients.controller,patients.service}.ts`.

Counting convention used in every story: one numbered step per click, per typed field and per dropdown selection. A dropdown selection (open the Select, pick the option) is one step although it is two clicks. Optional steps are numbered and marked "(optional)"; the step count in each story header counts every numbered step. Tags: "(required field)", "(optional)", "(default: X)", "(app already knows this)".

Facts that apply to several stories (read from source):
- The Patients page title is "Patients Management" (description "Manage patient records and information"), with a "Quick Guide" button titled "Patients Management Guide". Inside it is a second heading "Patients" ("Search, add, and manage patient records") and a card "Patient Records" ("Manage and view all patient information"). Same list, three headings.
- The list loads 20 rows per page (default: 20, remembered in browser storage as `patientsPageSize`), sorted by name ascending. Sorting by Patient, Age, Gender, Referral is done in the browser on the current page only.
- Search is debounced 500 ms and needs 2 or more characters. Server match rules: name contains, phone starts with, ABHA contains, patient code starts with (upper-cased), email contains. Archived patients are never returned.
- Row columns: Patient (avatar, name, "ID: <last 8 characters of the internal id>" button that copies the id, "Portal Linked" badge), Patient Code (with "Copy code"), Age, Gender, Contact (phone, email), ABHA ID, Referral, Consultation, Actions ("View", "Start Visit", "More").
- Source defects seen in the list that affect every story: the row mapper drops `consultationType` and `lastVisitAt`, so the "Consultation" column always shows an em dash and the "Last Visit" column (which only renders if some row has `lastVisitDate`) never appears, even though the backend sends both. The "Clear Filters" button does not reset sort order or page size.
- Detail page `/dashboard/patients/[id]` has a header (name, badges "ID: <full internal id>", "Code: ...", "ABHA: ...", gender, "NN yrs"), buttons "Resume last visit" (only when a visit exists), "Start new visit", "Book appointment", "Back", a card with Primary contact / Last visit / Next appointment, the `PatientProgressTracker` strip, and tabs "Info", "History", "Uploads". There is no Edit, Archive, Portal or Export action on the detail page.

---

## PATIENT-RECORDS-01: Receptionist finds a returning patient by phone number

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

## PATIENT-RECORDS-02: Receptionist registers a new patient

**Type**: short
**Topic**: Patient records
**Persona**: Pooja Nair, receptionist. Ramesh Gupta, 42, comes in on a Google referral for the first time; he will see the doctor later this week, so no walk-in booking.
**Goal**: Create Ramesh's record so he can be booked tomorrow.
**Preconditions**: RECEPTION signed in; no existing record for this phone.
**Ideal path**: 6. New Patient, name, age, gender, phone, Create; phone typed once, name in one field, referral and consultation type left to defaults.
**Alternate paths**:
- Appointments, patient picker, "+ Add "<name>" as a new patient" opens dialog "Add New Patient" (`PatientQuickCreateDialog`: first and last name, age, gender, phone, ABHA, consultation type). A second, different form for the same record.
- Patients "New Patient" with Patient Type "Walk-in" (see PATIENT-RECORDS-04): creates the record and auto-books.
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

## PATIENT-RECORDS-03: Doctor checks the last visit's diagnosis and medicines

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

## PATIENT-RECORDS-04: Walk-in patient from empty search to first visit, with a typo fix

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

## PATIENT-RECORDS-05: Doctor finds an August prescription using the History filters and resumes it

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

## PATIENT-RECORDS-06: Nurse uploads three before/after photos from the patient record

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

## PATIENT-RECORDS-07: Owner exports the month's patients to CSV

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

## PATIENT-RECORDS-08: Receptionist archives a duplicate patient record

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
- Archive is guarded only by the toast "Undo"; "Unlink portal" instead uses a toast-confirm (see PATIENT-RECORDS-09).

---

## PATIENT-RECORDS-09: Receptionist links a patient to an existing portal account

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
