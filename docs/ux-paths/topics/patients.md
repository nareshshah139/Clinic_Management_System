# Patient records

> Source of truth: code as read on 2026-11-13 (not run in a browser). Labels in `code font` are literal UI strings.
> Main files: `frontend/src/components/patients/PatientsManagement.tsx`, `frontend/src/app/dashboard/patients/[id]/page.tsx`,
> `frontend/src/components/patients/PatientProgressTracker.tsx`, `frontend/src/components/visits/PatientHistoryVisitCard.tsx`,
> `frontend/src/components/visits/VisitPhotos.tsx`, `frontend/src/components/appointments/PatientQuickCreateDialog.tsx`,
> `frontend/src/components/layout/header.tsx`, `backend/src/modules/patients/patients.service.ts`,
> `backend/src/modules/patients/patient-deduplication.service.ts`.
> Statements marked "per code" describe behaviour deduced from the source and are worth confirming in a walk.

## STORY-011: Register a new patient from the Patients page

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

### Steps
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

### Variations
- **Doctor registers the patient**: with `Primary Doctor` left on `Automatic`, the registering doctor becomes the primary doctor (helper text: "A doctor registering the patient becomes the primary doctor; otherwise the first visiting doctor does.").
- **With ABHA**: `ABHA ID (Ayushman Bharat Health Account)` must be exactly 14 digits, otherwise `ABHA ID must be a 14-digit number` (client check).
- **Quick-create route**: the Appointments dialog marks `First Name *`, `Gender *`, `Phone *` as required and shows a success toast `Patient created` — the full form does neither.

### Edge Cases
- **Missing name or phone**: `Please fill in all required fields (Name, Phone)` (only first name and phone are checked; last name, age, gender are not).
- **Phone typed as `+91 98480 12345`**: rejected for the spaces; `+919848012345` is accepted and stored as digits only (`919848012345`), which later will not be found by searching `98480` (phone search is prefix-only).
- **Duplicate phone**: no warning at all — see STORY-019.
- **Duplicate ABHA**: `abhaId` is unique in the database; the resulting error text is whatever the server returns (unverified).
- **Dialog closed with Esc / outside click**: form is reset; nothing is saved, no "discard changes?" prompt.
- **Quick Guide mismatch**: the page's `Quick Guide` says "Click 'Add Patient'", lists "date of birth" as required and mentions "insurance details" and a status filter — none of these exist in the form or list.

## STORY-012: Register a walk-in and let the system book the next free slot

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

### Steps
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

### Variations
- **Procedure walk-in**: `Appointment Type (walk-in)` = `Procedure` clears the room and filters the room list to procedure rooms ("Selecting an available procedure room is recommended.").
- **Telemedicine**: `Telemedicine` hides the room select.
- **Slot taken in the meantime**: dialog `Overbook this slot?` → `Book anyway` or `Cancel`; on `Cancel` a toast `Walk-in not booked` — "{slot} on {date} was taken and you chose not to overbook it." The patient record still exists.

### Edge Cases
- **Walk-in chosen but no doctor selected**: the patient is created and nothing is booked, with no warning (booking only runs when both are set).
- **Doctor fully booked today**: the "walk-in" can be booked silently for tomorrow or up to 7 days ahead; only the toast date reveals it.
- **No slot in 7 days**: destructive toast `No slots available` — "No available consultation slots found in the next 7 days for the selected doctor."; patient record is kept.
- **Same fields in Edit mode**: `Patient Type` and `Doctor (for walk-in)` are also present in `Edit Patient`; choosing `Walk-in` + a doctor while editing books a new appointment on `Save Changes` (per code).
- **Naming drift inside one dialog**: `Consultation Type` (Online / Offline) vs `Appointment Type (walk-in)` (OPD Consultation / Procedure / Telemedicine) vs `Patient Type` (Walk-in / Non walk-in).

## STORY-013: Find a returning patient by phone and open the record

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

### Steps
1. Click `Patients` in the sidebar → list of the newest registrations, 20 per page (page size remembered in `localStorage`). Hint under the search box: "Try: 9xxx… (phone), abha…, @email".
2. Type `99890` in the search box → after 500 ms the list reloads with patients whose phone **starts with** 99890.
3. Click the `Lakshmi Narayana` row (or `View`) → `/dashboard/patients/{id}` with skeleton "Loading patient…", then the record.

### Variations
- **By name**: `laksh` matches anywhere in the name, case-insensitive.
- **By patient code**: prefix match, upper-cased (`K7Q` finds `K7Q2M`). The search placeholder does not mention the code.
- **Narrow further**: `Gender`, `Consultation Type`, `Date Range` (`Last 1 Week` / `Last 1 Month` = registered *or* visited in that window) selects; `Clear Filters` resets search and filters.

### Edge Cases
- **Last four digits (`4512`)**: no result — phone search is prefix-only.
- **Number stored with country code** (`919989044512`): `99890` does not find it.
- **One character typed**: "Enter at least 2 characters to search"; the server is not queried.
- **Column sort** (`Patient`, `Age`, `Gender`, `Referral` headers): sorts only the rows of the current page in the browser; the server always pages by newest registration, so page 1 sorted A–Z is not the first A–Z patients.
- **`Consultation` column and `Last Visit` column**: per code the list mapper drops `consultationType` and reads `lastVisitDate` while the server sends `lastVisitAt`, so `Consultation` shows "—" for everyone and `Last Visit` never appears.
- **Coming back**: `Back` on the record returns to `/dashboard/patients` with search and filters cleared (they are not kept in the URL), so the next lookup starts from scratch.
- **Load failure**: red text with `Try Again`.

## STORY-014: Use the header global search to reach a patient

**Type**: short
**Topic**: Patient records
**Persona**: Anjali, nurse, at the nursing-station desktop while on the Rooms page
**Goal**: Jump to Lakshmi Narayana's record without first navigating to Patients
**Preconditions**: Desktop width (the header search is hidden on mobile). Patient exists.
**Ideal path**: 2 — type the name, click the patient result, land on the record.
**Alternate paths**: Sidebar `Patients` → page search → row (STORY-013, 3 steps and it does reach the record); doctor Dashboard `My Patients`.

### Steps
1. Click the header search box and type `Lakshmi` → after 300 ms a dropdown lists up to 5 patients (badge `Patient`, phone, "Patient • FEMALE • 34 yrs"), then appointments (`Appointment`) and staff (`Staff`); footer "Press Enter to go to first result • Type more to refine search".
2. Click the `Lakshmi Narayana` patient result (or press Enter if it is first) → the header box is cleared and the app navigates to `/dashboard/patients?search=<internal patient id>`.
3. The Patients page opens with the **internal ID** (a long cuid) pre-typed in its search box and queries the server with it. Per code the server searches only name, phone, ABHA, patient code and e-mail — not the ID — so the result is `No patients found` / "Adjust your search or filters to find a patient."
4. Select the ID text in the Patients search box and type `Lakshmi` instead → after 500 ms her row appears.
5. Click the row → `/dashboard/patients/{id}`.

### Variations
- **Keyboard only**: Enter opens the first result; patients are listed first, so Enter normally means "first patient".
- **Escape**: closes the dropdown but keeps the typed query; focusing the box re-opens it.

### Edge Cases
- **No match**: "No results found for "…"" / "Try searching for patient names, phone numbers, or doctor names".
- **Search API failure**: logged to the console only; the user sees no results and no error.
- **Appointment result for the same patient**: opens plain `/dashboard/appointments` (no patient or date context).
- **Roles without Patients in the sidebar** (PHARMACIST, ACCOUNTANT): the header search still returns patients and navigates them to `/dashboard/patients`.
- **Same search, three behaviours**: header search (300 ms, links to list), Patients page search (500 ms, min-2 guard, chips), Dashboard `My Patients` search (250 ms, links to record).

## STORY-015: Correct a patient's phone number and primary doctor

**Type**: medium
**Topic**: Patient records
**Persona**: Riya, receptionist — Kavya Nair has just said her number changed from 97012 34567 to 93911 22334 and that she now sees Dr. Meghana Rao
**Goal**: Update phone and primary doctor on the existing record
**Preconditions**: Riya already has Kavya's record open (`/dashboard/patients/{id}`).
**Ideal path**: 4 — `Edit` on the record, change phone, change doctor, save.
**Alternate paths**: none found — the record page has no edit control; list row `More` → `Edit` is the only editor. (Primary doctor can also be set implicitly: by a doctor registering the patient, or by the patient's first visit.)

### Steps
1. On the record, look for an edit action → the header offers only `Resume last visit`, `Start new visit`, `Book appointment`, `Back`; the `Info` tab is read-only. Click `Back` → `/dashboard/patients` with an empty search box.
2. Type `Kavya` in the search box → her row appears after 500 ms.
3. Click `More` on the row → menu `Edit`, `Archive`, `Link portal`, `WhatsApp`.
4. Click `Edit` → dialog `Edit Patient`. Per code `First Name` holds the whole name ("Kavya Nair") and `Last Name` is empty (the server stores one `name`); `Primary Doctor` shows `Loading…` until the full record arrives.
5. Replace `Phone` with `9391122334`.
6. Open `Primary Doctor` → choose `Dr. Meghana Rao` (other choice: `Not assigned`).
7. Glance at `Consultation Type` → it reads `Offline (In-Clinic Visit)`; per code this is a default, not the stored value, because list rows do not carry it.
8. Click `Save Changes` → dialog closes, no toast; the list reloads and the `Contact` cell shows the new number.
9. Click the row to confirm `Primary doctor: Dr. Meghana Rao` in the summary card (the list has no doctor column).

### Variations
- **Link portal access**: `More` → `Link portal` → dialog `Link Portal Access` (shows "Patient: …", `Email` pre-filled from the record, placeholder "Existing portal account email") → `Link` → toast `Portal user linked`. Unknown e-mail → `Failed to link portal user` with the server reason ("No patient portal account with this email exists in this branch").
- **WhatsApp reminder**: `More` → `WhatsApp` → sends immediately, no preview or confirmation; toast `Reminder sent` — "WhatsApp reminder sent to …" or `Failed to send reminder` ("No upcoming appointment found" when nothing is booked).
- **Copy identifiers**: click `ID: …` under the name (toast `Copied` — "Patient ID copied to clipboard") or `Copy code` under the patient code.

### Edge Cases
- **Online patient edited**: because the form defaults `Consultation Type` to Offline and sends it on save, editing an Online patient changes them to Offline without the user touching the field (per code).
- **`Unlink portal` / `Portal Linked` badge**: the list API does not return `portalUserId`, so per code the badge never shows and the menu always offers `Link portal`; trying it on an already linked patient returns "Patient is already linked to a user". The unlink confirmation itself is built as a toast with a plain `{label, onClick}` action object rather than a toast action element (rendering unverified).
- **Invalid ABHA / phone**: same banners as STORY-011; the banner state is shared with the list behind the dialog.
- **Two people editing**: last save wins; there is no version check on patients.
- **Reminder number**: the reminder is sent to `+` + the stored digits, so a number saved without `91` may not be a valid WhatsApp address (per code).

## STORY-016: Archive the wrong record and undo it

**Type**: short
**Topic**: Patient records
**Persona**: Riya, receptionist, end of day, cleaning up a double entry for "Ramesh Kumar"
**Goal**: Remove the mistaken record; recover immediately when she realises she archived the one with visits
**Preconditions**: Two "Ramesh Kumar" rows exist.
**Ideal path**: 3 — open row menu, archive (with a confirmation naming the patient), undo.
**Alternate paths**: none found — no archive control on the record page, no delete anywhere in the UI or API, no archived-patients view. (Exact duplicates are also archived automatically by a server job — STORY-019.)

### Steps
1. In Patients, type `Ramesh` → two rows with different `Patient Code` values.
2. Click `More` on the first row.
3. Click `Archive` → **no confirmation**; the row disappears at once and the count drops; toast `Patient archived` — "Ramesh Kumar has been archived" with an `Undo` action.
4. Realise from the remaining row's code that the wrong one went → click `Undo` in the toast → toast `Archive undone` — "Ramesh Kumar has been restored"; the list reloads with both rows.

### Variations
- **Correct archive**: stop after step 3.
- **Archive fails** (network): the list is refetched and a destructive toast `Failed to archive` appears.

### Edge Cases
- **Toast gone before `Undo`**: there is no archived filter, list or restore button; the record can only be restored through the API (`POST /patients/:id/unarchive`).
- **Misclick risk**: `Archive` sits directly under `Edit` in the same menu and acts instantly.
- **Archived record by URL**: `/dashboard/patients/{id}` still opens an archived patient (the detail query does not exclude archived) and shows no "archived" marker, although `isArchived` is returned.
- **Which duplicate to keep**: the two rows look identical in the list (no last-visit column rendered, see STORY-013), so she has to open each record to compare.

## STORY-017: Doctor reviews a patient's full record before today's consultation

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

### Steps
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

### Variations
- **Nurse**: same page and tabs; `Start new visit` leads to a visit form with a reduced tab set.
- **Receptionist**: same page; `Start new visit` / `Resume last visit` still show although reception has no Visits sidebar entry and the server refuses visit creation for the role (discovery note).
- **Continue the last visit instead**: `Resume last visit` → `/dashboard/visits?visitId=…&patientId=…`.
- **Camera on a tablet**: `Take Photo` / `Camera` opens the device camera (one image), then the same tagging dialog.

### Edge Cases
- **History fails**: "Unable to load history. {reason}"; `Refresh` retries. History also reloads on every window focus (returning from another tab, window or the OS file picker); each reload briefly removes the list and collapses any expanded visit card (per code, `usePatientHistory.ts` + `[id]/page.tsx`).
- **No history**: "No documented history to show."; filters are hidden.
- **Filters exclude everything**: "No records match the current filters."
- **Doctor filter is by display name**: two doctors with the same name collapse into one option.
- **Photos uploaded from the record are not attached to any visit** (`visitId="temp"` → draft endpoint); they later appear under `Other saved photos`. No delete control on this page (`allowDelete` is not passed).
- **Position not chosen**: toast `Tag positions` — "Please select a position for each photo."
- **Patient missing / wrong URL**: "Patient not found." or the red error banner, each with `Back to Patients`.
- **Identity repeated**: phone and e-mail appear in the summary card and `Info` tab; gender, age and ABHA appear as header badges and again in `Info`.

## STORY-018: Follow the progress tracker's next-step buttons from booking to billing

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

### Steps
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

### Variations
- **Patient with an old visit and nothing new**: Start/Document/Complete green regardless of whether that visit was ever completed; `Start Visit` is never offered again by the tracker (only `Continue`), so a new visit must be started from the header `Start new visit`.
- **Follow-up**: the last circle turns green when the latest visit has a follow-up date; it has no button (booking the follow-up is via header `Book appointment`).

### Edge Cases
- **Tracker load failure**: each of its three requests fails soft (step treated as not done); a total failure prints small red text only.
- **Receptionist**: sees the same buttons; `Start Visit` / `Continue` lead to a visit form she cannot create or complete; `Bill` leads to Sales, which is not in the reception sidebar.
- **Three labels for one action**: `Resume last visit` (header), `Continue` (tracker), `Resume session` (history card).
- **Bill vs Invoices vs Billing**: step is named `Billing`, button is `Bill` or `Invoices`, destination page is a "Sales bill".

## STORY-019: Discover and deal with a duplicate patient

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

### Steps
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

### Variations
- **Same phone, different spelling** ("Sunitha Agarwal" vs "Sunita Agarwal"): never merged automatically; both stay until someone archives one.
- **Family sharing a phone** (mother and daughter on 9885011223 with different names): correctly not merged.
- **Created from Patients › `New Patient`**: identical outcome — no duplicate check there either.

### Edge Cases
- **Number entered once as `9885011223` and once as `+919885011223`**: stored as different digit strings, so not merged.
- **Silent disappearance**: after the job runs, a patient code staff wrote on a file may now point to an archived record; nothing in the UI says "merged into …".
- **Auto-opened dialog dismissed**: closing `Add New Patient` clears the search text, so he has to type the name again.
- **Portal link on the duplicate**: moved to the kept record only if the kept record has none (per service code).

## STORY-020: Export last month's patients to CSV

**Type**: short
**Topic**: Patient records
**Persona**: Suresh, clinic manager, first working day of the month, preparing a list for the owner
**Goal**: Download a spreadsheet of female patients seen or registered in the last month
**Preconditions**: MANAGER (or any role with Patients in the sidebar).
**Ideal path**: 3 — choose period, choose gender, export.
**Alternate paths**: Reports (`/dashboard/reports`) › `Patient Analytics` › `Export` (aggregated analytics, not the patient list — partial overlap only). No other patient-list export found.

### Steps
1. Click `Patients` in the sidebar.
2. Open the date select (shows `All Time`) → choose `Last 1 Month` → the list reloads.
3. Open the gender select (`All Genders`) → `Female` → the list reloads on page 1.
4. Click `Export CSV` → button reads `Exporting...`; the browser downloads `patients_export_2026-11-13.csv`; toast "Exported 143 patients to CSV".

### Variations
- **Everything**: skip steps 2–3; the export carries the current search and filters, not the current page or sort.
- **Reset**: `Clear Filters` (next to `Export CSV`) clears search, gender, consultation type and date range.

### Edge Cases
- **Meaning of the period**: `Last 1 Month` = registered **or** had a visit in the last month; the control is only labelled by its value, so Suresh may read it as "new registrations".
- **Columns**: ID, Name, Age, Gender, Phone, Email, ABHA ID, Referral, Consultation Type, Portal Linked, Created At. Per code `Consultation Type` is always blank and `Portal Linked` always "No" (same dropped fields as STORY-013/015); `ID` is the internal ID, the patient code is not exported.
- **Size**: the server caps an export at 10,000 rows with no warning when the cap is hit.
- **Failure**: destructive toast `Export failed`.
- **Archived patients** are never included.

## Redundancy notes

**Duplicate paths**
- *Create patient*: `New Patient` → `Create Patient` → `Create` (`PatientsManagement.tsx`, 16 controls, no required markers, no success toast) vs `+ Add "…" as a new patient` → `Add New Patient` → `Create Patient` (`PatientQuickCreateDialog.tsx`, 8 controls, required markers, success toast), mounted twice (`AppointmentsCalendar.tsx`, `AppointmentScheduler.tsx`). Neither checks for an existing phone.
- *Book for a patient*: record header `Book appointment` and tracker `Book` are the same link (`[id]/page.tsx`, `PatientProgressTracker.tsx`); `Create Patient` with `Walk-in` books implicitly.
- *Open the last visit*: `Resume last visit` (header), `Continue` and `Prescribe`/`View` (tracker — literally the same href), `Resume session` (`PatientHistoryVisitCard.tsx`), Dashboard `Recent Visits` (`DoctorPatientPanels.tsx`).
- *Start a visit*: list row `Start Visit`, header `Start new visit`, tracker `Start Visit`; none of the three passes the upcoming `appointmentId`.
- *Open the record*: row click and `View` button on the same row; Dashboard `My Patients`; header search (which, per code, lands on an empty list because it passes the internal ID as the search term — `header.tsx` line 424 vs `patients.service.ts` search clause).
- *Remove a duplicate*: manual `Archive` vs the invisible 6-hourly merge job (`patient-deduplication.service.ts`); no manual merge.
- *Three patient searches*: header (300 ms), Patients page (500 ms, min-2 hint, "Did you mean"), Dashboard `My Patients` (250 ms) — plus separate patient pickers in Appointments (×2) and Visits.

**Duplicate information**
- Record page: phone/e-mail in summary card and `Info` tab; gender/age/ABHA in header badges and `Info` tab; "next appointment" in the summary card (always `Not scheduled`, per code) and as the tracker's `Upcoming appt` badge; last visit in summary card, tracker and `History`.
- History is rendered by the same hook/card on the record `History` tab, Visits setup `Patient History` tab and the visit form `History` tab (`usePatientHistory.ts`, `PatientHistoryVisitCard.tsx`).
- Photos: record `Uploads` tab and visit `Photos` tab share `VisitPhotos.tsx`; on the record it runs with `visitId="temp"`, so its copy still says "attached to this visit".
- Progress tracker appears on the record (full) and on the Visits page header (compact).
- Stacked headings: `Patients Management` → `Patients` → `Patient Records` (`patients/page.tsx`, `PatientsManagement.tsx`).

**Naming drift**
- `New Patient` (button) / `Create Patient` (dialog) / `Create` (submit) / `Add New Patient` + `Create Patient` (quick dialog) / "Add Patient" (Quick Guide).
- Patient identifiers: `ID: <last 8>` (list), `ID: <full>` (record badge), `Patient Code` / `Code:` / "code" (search), `ABHA ID`.
- `Uploads` (tab) → `Before / After Photos` (card) → "visit photos" (empty state) → `Other saved photos`.
- `Consultation Type` Online/Offline (patient) vs `Appointment Type (walk-in)` OPD Consultation/Procedure/Telemedicine vs `Patient Type` Walk-in/Non walk-in vs visit `Consultation type` In-person/Tele-video.
- Tracker step `Billing` → button `Bill` / `Invoices` → destination "Sales bill"; the step's status reads clinic invoices while the button opens a pharmacy bill (`PatientProgressTracker.tsx`, `billHref`).
- `Resume last visit` / `Continue` / `Resume session`; `Start new visit` / `Start Visit`.
- `Clear Filters` (list) vs `Clear filters` (History tab); `Refresh` (History) vs `Try Again` (list).

**Data-flow gaps that create friction (per code)**
- List mapper drops `consultationType`, expects `lastVisitDate` (server sends `lastVisitAt`) and `portalUserId` (server does not send it): `Consultation` column blank, `Last Visit` column never rendered, `Portal Linked` / `Unlink portal` unreachable, CSV columns blank, and `Edit` silently resets Online patients to Offline (`PatientsManagement.tsx` lines 213–239, 604; `patients.service.ts` lines 208–234).
- Column sorting is client-side per page; the server ignores `sortBy` / `sortOrder`.
- Search and filters are component state only (not in the URL), so `Back` from a record loses them.
- No edit, archive or portal action on the record page; no archived view; archive has no confirmation.
