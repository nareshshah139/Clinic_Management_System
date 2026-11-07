# Topic: patients-records

Story agent output for the ux-paths Phase 2 swarm. Covers `/dashboard/patients` (PatientsManagement) and `/dashboard/patients/[id]` (patient detail + PatientProgressTracker), plus the patient-facing entry points that land there (header global search, Doctor dashboard "My Patients").

Seed context used throughout: logins `admin@clinic.test` (ADMIN), `shravya@clinic.test` (DOCTOR, Dr. Shravya Dermatologist), `praneeta@clinic.test` (DOCTOR, Dr. Praneeta Jain), `reception@clinic.test` (RECEPTION, Riya Sharma), all with password `password123`. Seed rooms are Consultation Room 1/2, Procedure Room A/B/C and Telemedicine Suite. The seed patient is John Doe.

Key UI facts from code:
- Page header "Patients Management" / "Manage patient records and information" with a "Patients Management Guide" Quick Guide button. Directly below it, the component repeats a second heading, "Patients" / "Search, add, and manage patient records", so the page has two titles.
- Toolbar: "New Patient", "Clear Filters", "Export CSV" ("Exporting..."). Filters card: search "Search by name, phone, ABHA, or email (min 2 chars)" with hint "Try: 9xxx… (phone), abha…, @email" or "Enter at least 2 characters to search" and a "Did you mean" chip box, then All Genders, All Consultations / Online / Offline, All Time / Last 1 Week / Last 1 Month, and 10/20/50 "/ page" (stored in localStorage `patientsPageSize`).
- "Patient Records" table columns: Patient (with the last 8 characters of the ID, click to copy, and a "Portal Linked" badge), Patient Code ("Copy code"), Age, Gender, Contact, ABHA ID, Last Visit (shown only when some row has a last-visit date), Referral, Consultation, and Actions. Row actions are View, Edit, Archive, Link Portal / Unlink, WhatsApp and Start Visit. Clicking the row also opens the detail page.
- Pagination reads "Showing X to Y of Z patients", with Previous, up to 5 page numbers, and Next.
- The Create/Edit dialog has the title "Create Patient" or "Edit Patient" and the buttons "Cancel" and "Create" or "Save Changes".
- Detail page: header (patient name; badges for ID, Code, ABHA, gender and age; buttons "Resume last visit", "Start new visit", "Book appointment", "Back"); a summary card (Primary contact + Primary doctor, Last visit, Next appointment + Referral); the progress tracker (Start → Document → Complete → Prescribe → Billing → Follow-up with buttons "Book"/"Start Visit"/"Continue", "Prescribe"/"View", "Bill"/"Invoices"); and the tabs **Info / History / Uploads**.
- Backend `/patients/*` has **no `@Roles`**. Any authenticated user can call every patient endpoint. The frontend sidebar shows Patients to OWNER, ADMIN, MANAGER, DOCTOR, NURSE and RECEPTION, and no route-level role guard exists.

---

## STORY-201: Receptionist finds a returning patient by phone prefix and opens her record

**Type**: short
**Topic**: patients-records
**Persona**: Riya Sharma, front-desk receptionist (`reception@clinic.test`), with a queue at the desk
**Goal**: Pull up Lakshmi Prasanna Reddy's record from the first digits of her mobile number before she reaches the counter
**Preconditions**: Logged in as RECEPTION. Patient "Lakshmi Prasanna Reddy", phone 9848012345, Banjara Hills, exists and is not archived.
**Ideal path**: 3 — open Patients, type the phone prefix, click the matching row.
**Alternate paths**: (a) Header global search "Search patients, appointments, doctors..." → patient result → `/dashboard/patients?search=<patient UUID>`. This lands on the list with the UUID in the search box and **no match** (see Defects). (b) Row click and the row's "View" button do the same thing. (c) Doctors also have Dashboard → "My Patients" panel → patient link → `/dashboard/patients/[id]`.

### Steps
1. Click sidebar **Clinical → Patients** → "Patients Management" loads with a "Loading patients…" skeleton, then the "Patient Records" table at 20 / page, newest registrations first.
2. Type `9` in the search box → the hint changes to "Enter at least 2 characters to search". A "Did you mean" box lists up to 8 phone numbers or names on the current page that start with 9. No server query runs yet.
3. Riya hesitates, then types `98480` → after a 500 ms debounce the list re-queries (phone `startsWith`) and the page resets to 1. "Lakshmi Prasanna Reddy" appears with phone 9848012345.
4. Click the row (or **View**) → `/dashboard/patients/<id>` shows "Lakshmi Prasanna Reddy", badges "ID: …", "Code: …", "FEMALE", "34 yrs", and the summary card.

### Variations
- Search by patient code: typing `ab` matches patient codes by uppercase prefix (`AB…`), so a code read aloud over the phone works.
- Search by email fragment `@gmail` → case-insensitive `contains` on email.
- Click the "Did you mean" chip `9848012345` while only 1 character is typed → the search box fills with the full number and the query runs.
- Click "ID: 1a2b3c4d" under the name → toast "Copied / Patient ID copied to clipboard". The click does not open the row (stopPropagation).

### Edge Cases
- "Did you mean" suggestions come only from the patients already loaded on the current page. A patient on page 4 is never suggested.
- Search text that matches nothing → "No patients found" / "Adjust your search or filters to find a patient."
- Same information on several surfaces: name, phone, ABHA, gender and age appear in the list row, in the detail header badges, in the summary card, and again in the Info tab.

---

## STORY-202: Registering a new non-walk-in patient, recovering from a phone-format error

**Type**: medium
**Topic**: patients-records
**Persona**: Riya (RECEPTION), registering a patient who booked by phone for later in the week
**Goal**: Create a complete record for Sai Charan Goud with ABHA, address, emergency contact and referral source
**Preconditions**: Logged in as RECEPTION. No existing record for Sai Charan.
**Ideal path**: 4 — click New Patient, fill the required fields (name, phone), fill the optional fields, click Create.
**Alternate paths**: (a) Appointments page patient search → "Add New Patient" (PatientQuickCreateDialog: names, age, gender, phone, email, ABHA, Consultation Type; it has no address, emergency contact, referral or primary doctor). (b) Walk-in variant of this same dialog (STORY-203). The Quick Guide tells users to click "Add Patient", but no button has that label.

### Steps
1. On `/dashboard/patients`, click **New Patient** → the "Create Patient" dialog opens, and the Doctors and Rooms lists load in the background.
2. Type First Name `Sai Charan`, Last Name `Goud`, Age (years) `29`, Gender → **Male**.
3. Type Phone `+91 99490 55123`, the way it is written on the patient's card.
4. Type ABHA ID `91234567890123` (14 digits), Email `saicharan.goud@gmail.com`, Address `Plot 42, KPHB Colony, Kukatpally, Hyderabad 500072`, Emergency Contact `Ramesh Goud – 9949011223`.
5. Leave Consultation Type on **Offline (In-Clinic Visit)**. Primary Doctor shows **Automatic** with the help text "A doctor registering the patient becomes the primary doctor; otherwise the first visiting doctor does."
6. Set "How did the patient hear about us?" → **Instagram**. Leave Patient Type on **Non walk-in**.
7. Click **Create** → the red banner in the dialog reads "phone must be a valid international phone number (E.164 format)". The **Patient Records table behind the dialog is also replaced** by the same error and a "Try Again" button.
8. Riya removes the spaces: `+919949055123` → **Create** → the dialog closes, the list refreshes, and "Sai Charan Goud" appears at the top with a new patient code. No success toast appears.
9. Click the new row → detail page. Info tab shows Gender MALE, Age 29, the phone stored as `919949055123` (the + is stripped), the ABHA and the address. The summary card shows "Primary doctor: Not assigned" (reception created the record) and "Referral: INSTAGRAM".

### Variations
- Logged in as Dr. Praneeta (`praneeta@clinic.test`) with Primary Doctor left on Automatic → the backend makes her the primary doctor. The detail page shows "Primary doctor: Dr. Praneeta Jain", and the patient appears in her Dashboard "My Patients" panel.
- Pick Primary Doctor → **Dr. Shravya Dermatologist** explicitly → saved even when reception creates the record.
- Omit Age → the age column shows "—" and the backend stores no DOB.

### Edge Cases
- First Name or Phone empty → "Please fill in all required fields (Name, Phone)". The labels have no asterisks, so nothing marks these fields as required.
- ABHA `91-2345-6789-0123` (the hyphenated form printed on ABHA cards) → "ABHA ID must be a 14-digit number". The user must strip the hyphens by hand.
- ABHA already used by another patient → the unique constraint fails, and the dialog shows a generic server error instead of a duplicate message (see Defects).
- Same phone as an existing patient → a second record is created silently with no duplicate warning.
- Phone `09949055123` (leading 0) or `99490-55123` → rejected by the E.164 regex.

---

## STORY-203: Walk-in patient registered and auto-booked into the next free slot

**Type**: medium
**Topic**: patients-records
**Persona**: Riya (RECEPTION) on a busy Saturday morning
**Goal**: Register Fatima Begum, a walk-in from Tolichowki with an acne flare-up, and get her the next available slot with Dr. Shravya without opening the scheduler
**Preconditions**: Logged in as RECEPTION. Dr. Shravya has working hours today with free 30-minute slots. Seed rooms exist.
**Ideal path**: 5 — New Patient, enter name and phone, set Patient Type Walk-in, choose the doctor, click Create (room and type use defaults).
**Alternate paths**: (a) Create a non-walk-in patient, then use the detail page "Book appointment" or tracker "Book" → `/dashboard/appointments?patientId=` → pick a slot. (b) Appointments → Calendar or Slots tab → click a free slot → "Book Appointment" dialog → "Add New Patient". That makes four ways to book in total (discovery item 5).

### Steps
1. Click **New Patient** → "Create Patient".
2. Enter First Name `Fatima`, Last Name `Begum`, Age `41`, Gender **Female**, Phone `919700112233`, Address `Tolichowki, Hyderabad`.
3. Set **Patient Type** → **Walk-in** → two more fields appear: "Appointment Type (walk-in)" (default **OPD Consultation**) and "Room (optional for OPD)".
4. In **Doctor (for walk-in)**, choose **Dr. Shravya Dermatologist**. This field is visible even for Non walk-in, and its help text reads "If Patient Type is Walk-in and a doctor is selected, the next available slot will be automatically booked after saving."
5. Room → **Consultation Room 1 — CONSULTATION**. The dropdown is filtered to active rooms that match the visit type.
6. Click **Create** → the patient is created. The client then checks available slots for today and up to 7 days ahead and books the first free one. Toast "Walk-in appointment booked" / "Appointment scheduled for 07 Nov 2026 at 11:30-12:00".
7. Go to **Appointments** → the Dr. Shravya / today view shows Fatima's tile at 11:30, marked "Newly Booked".
8. Open Fatima's detail page → the tracker shows the "Upcoming appt" badge and a **Start Visit** button. The summary card shows **"Next appointment: Not scheduled"**, which contradicts the tracker (see Defects). The History tab lists the booking as an "Appointment" card.
9. When she is called in, click **Start Visit** on the tracker → `/dashboard/visits?patientId=…&autoStart=true`.

### Variations
- Appointment Type **Procedure** → Room becomes "Procedure Room A/B/C" with the hint "Selecting an available procedure room is recommended."
- Appointment Type **Telemedicine** → the Room field is hidden.
- Patient Type Walk-in with no doctor chosen → the patient is saved, nothing is booked, and nothing tells the user why no appointment was made.
- Editing an existing patient and switching Patient Type to Walk-in with a doctor also auto-books, because the edit dialog shows the same fields.

### Edge Cases
- Doctor fully booked or on leave for 8 days → destructive toast "No slots available / No available consultation slots found in the next 7 days for the selected doctor." The patient is still created and the dialog closes.
- Any booking error (a 403, a room conflict, a network blip) is swallowed and the next **day** is tried. One room conflict at 11:30 skips the rest of today's free slots.
- As MANAGER: the appointment endpoints exclude MANAGER, so every attempt fails silently and the toast falsely says "No slots available".
- As NURSE: the Room dropdown is empty (`/appointments/rooms` excludes NURSE). Booking still works without a room.

---

## STORY-204: Correcting a patient's details with Edit Patient

**Type**: short
**Topic**: patients-records
**Persona**: Riya (RECEPTION). Anjali Rao has moved and her husband is now the emergency contact.
**Goal**: Update the address and emergency contact without disturbing anything else
**Preconditions**: Anjali Rao exists. She was registered with Consultation Type **Online** and Primary Doctor Dr. Praneeta.
**Ideal path**: 3 — Edit on the row, change the fields, click Save Changes.
**Alternate paths**: none found. The detail page has no Edit button, so editing works only from the list row.

### Steps
1. Search `Anjali` → click **Edit** on her row → the "Edit Patient" dialog opens. Primary Doctor briefly shows "Loading…" while the full record is fetched, then shows **Dr. Praneeta Jain**.
2. Notice that First Name shows **"Anjali Rao"** and Last Name is blank. The backend stores only one `name` field.
3. Change Address to `Flat 803, My Home Avali, Gachibowli, Hyderabad 500032` and Emergency Contact to `Vikram Rao – 9866044321`.
4. Click **Save Changes** → the dialog closes and the list refreshes. No success toast appears.
5. Open the detail page → Info tab shows the new address. The emergency contact is not shown anywhere on the detail page (the Info tab lists only Gender, Age, Phone, Email, ABHA ID and Address).

### Variations
- Change Primary Doctor to **Not assigned** → sends `primaryDoctorId: null` and clears it. The patient leaves Dr. Praneeta's "My Patients".
- Change Age → the backend also overwrites DOB with 1 January of the computed birth year.

### Edge Cases
- The Consultation Type select opens on **Offline** for every patient, because the list never maps `consultationType`. Saving silently flips Anjali from Online to Offline (see Defects).
- If the user "fixes" the name by typing Last Name `Rao`, the saved name becomes "Anjali Rao Rao".
- Cancel or Esc → resetForm clears the dialog and nothing is saved.

---

## STORY-205: Archiving a duplicate record, then undoing a mistaken archive

**Type**: short
**Topic**: patients-records
**Persona**: Admin User (`admin@clinic.test`) cleaning up duplicate registrations
**Goal**: Archive a duplicate "Mohammed Irfan" record created twice yesterday, accidentally archive the real one, and restore it
**Preconditions**: Two "Mohammed Irfan" rows exist with the same phone 7013655443. One has visits and the other is empty.
**Ideal path**: 2 — click Archive, and click Undo if it was a mistake.
**Alternate paths**: none found. There is no archived-patients view and no Unarchive button, so the toast's Undo is the only restore path in the UI.

### Steps
1. Search `70136` → both Mohammed Irfan rows show. Compare their Patient Codes and the "Last Visit" column. The Last Visit column never appears (see Defects), so the admin has to open each record to see which one has visits.
2. Click **Archive** on the empty duplicate → the row disappears at once (optimistic update). Toast "Patient archived / Mohammed Irfan has been archived" with an **Undo** button.
3. Click **Archive** on the second row too quickly, by mistake → that row also disappears, and the new toast **replaces** the first (only one toast is shown at a time).
4. Click **Undo** on the visible toast → toast "Archive undone / Mohammed Irfan has been restored", and the real record returns to the list.
5. The first (empty) duplicate stays archived as intended.

### Variations
- Archive while the network is down → the list re-fetches to revert, and the toast reads "Failed to archive" with the error.
- Undo fails → "Failed to restore".

### Edge Cases
- No confirmation step comes before archiving. One click removes a patient from every list.
- After the toast is dismissed there is no way back in the UI. Yet the archived patient's detail URL (`/dashboard/patients/<id>`) still opens normally, with no "Archived" badge.
- Archive is shown to NURSE and MANAGER as well, and the backend allows any role.

---

## STORY-206: Linking (and later unlinking) patient-portal access

**Type**: short
**Topic**: patients-records
**Persona**: Admin User setting up portal access for a long-term isotretinoin patient, Keerthi Naidu
**Goal**: Give Keerthi a portal login tied to her email
**Preconditions**: Keerthi Naidu exists with email `keerthi.naidu@outlook.com`, and no portal user is linked
**Ideal path**: 3 — click Link Portal, confirm the email, click Link.
**Alternate paths**: none found. No patient-facing UI exists, so a linked PATIENT user would see an empty sidebar.

### Steps
1. Click **Link Portal** on Keerthi's row → the "Link Portal Access" dialog opens with "Patient: Keerthi Naidu", and the Email field is pre-filled with her email.
2. Click **Link** → destructive toast "Failed to link portal user / email, password, firstName, and lastName are required to create a new user". The dialog stays open, and it has no password or name fields to fill in.
3. Admin clicks **Cancel**. There is no way to complete the link from the UI (see Defects).

### Variations
- Clear the Email field → the **Link** button is disabled. Forcing it (e.g. by pressing Enter) gives "Email required / Please enter an email address".
- **Unlink** path (only if a patient was linked through the API): the row would show the "Portal Linked" badge and an **Unlink** button → toast "Confirm unlink / Remove portal access for …?" with a Confirm action. In practice the list API never returns `portalUserId`, so the badge and the Unlink button never render. And the confirm toast passes a plain object as its action, which React cannot render (see Defects).

### Edge Cases
- Patient already linked (through the API) → 409 "Patient is already linked to a user". The UI would still show "Link Portal", because the list does not know about the link.

---

## STORY-207: Sending a WhatsApp appointment reminder from the patient list

**Type**: short
**Topic**: patients-records
**Persona**: Riya (RECEPTION) doing the 5 pm reminder round for tomorrow's patients
**Goal**: Send Rohit Varma (laser hair reduction, tomorrow 10:00 with Dr. Praneeta, Procedure Room A) a WhatsApp reminder
**Preconditions**: Rohit, phone `919912345678`, has a SCHEDULED appointment tomorrow. Backend WhatsApp credentials are configured.
**Ideal path**: 2 — find the patient, click WhatsApp.
**Alternate paths**: Appointment-creation WhatsApp is sent automatically when the doctor's "Send WhatsApp on appointment creation" setting is on (header My Settings), but that is a confirmation, not a reminder. There is no reminder action on the Appointments page or the patient detail page.

### Steps
1. Search `Rohit` → click **WhatsApp** on his row → the action runs with no confirmation.
2. Toast "Reminder sent / WhatsApp reminder sent to Rohit Varma". The message reads: "Hello Rohit Varma, Reminder: Appointment with Dr. Praneeta Jain on 08 Nov 2026 at 10:00-10:30. Room: Procedure Room A. Please arrive 10 minutes early." A "Token: #n" line is added when the appointment has a token number.

### Variations
- Patient with no future appointment → "Failed to send reminder / No upcoming appointment found".
- WhatsApp **not** configured on the backend → the send is skipped silently, and the user still sees "Reminder sent" (see Defects).

### Edge Cases
- Appointment **later today** (e.g. 4 pm today, sent at 11 am) → "No upcoming appointment found". The backend compares the appointment's midnight-UTC date with "now" (see Defects).
- Phone stored as 10 digits `9912345678` (typed without 91) → sent to `+9912345678`, which is not an Indian number (see Defects).
- Double-click on WhatsApp → `actionLoading` does not disable the row buttons, so two reminders go out.

---

## STORY-208: Admin filters recent female online patients and exports them to CSV

**Type**: medium
**Topic**: patients-records
**Persona**: Admin User preparing a list for the clinic's Instagram tele-consult campaign review
**Goal**: Export every female patient registered or seen in the last month whose consultation type is Online
**Preconditions**: Logged in as ADMIN. Around 140 patients, about 25 of which match.
**Ideal path**: 4 — set three filters, click Export CSV.
**Alternate paths**: Reports & Analytics → "Patient Analytics" → Export (JSON/CSV/PDF/Excel) gives aggregates, not a patient roster. The header "Export CSV" here is the only roster export.

### Steps
1. Open **Patients** → set **All Genders** → **Female**. The list re-queries and resets to page 1.
2. Set **All Time** → **Last 1 Month**. This counts patients registered in the last month **or** with a non-deleted visit in that window.
3. Set **All Consultations** → **Online**.
4. Switch **20 / page** → **50 / page**. The choice persists in localStorage for next time.
5. Check the footer "Showing 1 to 25 of 25 patients". If everything fits on one page, the pagination bar is hidden.
6. Every row's **Consultation** cell shows "—" instead of the "Online" badge, even though the filter returned only Online patients (see Defects).
7. Click **Export CSV** → the button shows "Exporting...". The browser downloads `patients_export_2026-11-07.csv` and a toast reads "Exported 25 patients to CSV".
8. Open the CSV. Its columns are ID, Name, Age, Gender, Phone, Email, ABHA ID, Referral, Consultation Type, Portal Linked, Created At. The **Consultation Type column is blank**, every **Portal Linked** value is **No**, and there is no Patient Code column even though the code is the clinic-facing identifier.
9. Click **Clear Filters** → search, gender, consultation and date reset, but the page size stays at 50.

### Variations
- Sort by clicking the "Age ▲/▼", "Gender" or "Referral" headers → this sorts **only the rows on the current page**. The backend always returns newest first, so page 2 is not "the next oldest" (see Defects).
- Search `@gmail` before exporting → the export honours the search term (≥2 chars) along with the filters.

### Edge Cases
- On page 3 at 10 / page, switch Consultation to **Online** → the page number is **not** reset. If fewer than 21 patients match, the table shows "No patients found / Add a patient to start their clinic record.", which is wrong advice, since filters caused the empty result (see Defects).
- Large clinic: the export caps at 10,000 rows with no warning.
- Export failure → "Export failed / Could not export patients."

---

## STORY-209: Doctor reviews a patient's chart on the detail page before consultation

**Type**: medium
**Topic**: patients-records
**Persona**: Dr. Shravya (`shravya@clinic.test`) between patients, reviewing John Doe's history before his follow-up for eczema
**Goal**: See John's past visits filtered to her own consultations, check the before/after photos, and resume his last visit note
**Preconditions**: Seed patient John Doe has several visits with Dr. Shravya and Dr. Praneeta, plus visit photos
**Ideal path**: 4 — open the patient, History tab, filter by doctor, click Resume session.
**Alternate paths**: To reach the patient: Dashboard → "My Patients" panel link, Patients list row or View, or header global search (broken, see STORY-201). To reach his last visit there are **four** buttons on one page: header "Resume last visit", tracker "Continue", tracker "Prescribe"/"View", and each History card's "Resume session". All except the last open the same `/dashboard/visits?visitId=<latest>&patientId=` URL.

### Steps
1. On **Dashboard**, the "My Patients" panel lists John Doe → click him → `/dashboard/patients/<id>`.
2. Header shows "John Doe", "ID: <uuid>", "Code: …", "MALE", and the age. The summary card shows the phone and email, "Primary doctor: Dr. Shravya Dermatologist", "Last visit: <date>" with "Dr. Shravya Dermatologist", and "Next appointment: Not scheduled".
3. The tracker below shows Start ✓, Document ✓, Complete ✓, Prescribe ✓, **Billing** active (blue, pulsing) with a "Bill" button, and Follow-up.
4. **Info** tab (default) → "Patient Information": Gender, Age, Phone, Email, ABHA ID, Address. This repeats the header and summary-card data.
5. Click **History** → "Patient History" with a **Refresh** button. Entries are grouped by date with collapsible headers such as "12 Oct 2026 · 2 records · Hide".
6. Filter **All doctors** → **Shravya Dermatologist** → only her visits remain. Set the From date to `2026-06-01` → older entries drop out.
7. Set a To date earlier than the From date → "No records match the current filters." → click **Clear filters**.
8. Click a date header → that group collapses ("Show").
9. Click **Uploads** → "Before / After Photos (0)" with "No photos attached to this visit" (wording made for a single visit). Below it, "Other saved photos" lists each visit's photos by date, opening in new tabs.
10. Back on History, click **Resume session** on the most recent visit card → `/dashboard/visits?visitId=…&patientId=…` opens his note.

### Variations
- From the Uploads tab, click **Upload** or **Camera** → the photos are saved as **draft (unattached) uploads** for John (`/visits/photos/draft/<patientId>`) and later appear under "Unattached uploads — <date>".
- Appointment entries in History are labelled "Appointment" and have no Resume button.
- Window regains focus → History reloads automatically.

### Edge Cases
- Invalid or foreign patient ID in the URL → a red banner with the backend message ("Patient not found") and a "Back to Patients" button.
- History API error → "Unable to load history. <message>" next to Refresh.
- The detail page has no Edit, Archive, WhatsApp or Link Portal actions. Those exist only on the list row, so the doctor must go "Back" to do them.

---

## STORY-210: Using the progress tracker to move a patient from booking to billing

**Type**: medium
**Topic**: patients-records
**Persona**: Dr. Praneeta (`praneeta@clinic.test`) handling a first-time patient, Harika Kondapalli, referred by a GP in Madhapur
**Goal**: Use the tracker's buttons to book, start the visit, prescribe and send her to billing
**Preconditions**: Harika exists (registered by reception) with no appointments and no visits
**Ideal path**: 4 — Book, Start Visit, Prescribe, Bill (one click per stage, plus the work done on each target page).
**Alternate paths**: Every tracker button duplicates a header button. "Book" = header "Book appointment", "Start Visit" = header "Start new visit" = list row "Start Visit", "Continue"/"Prescribe" = header "Resume last visit". For Bill there is Pharmacy Billing in the sidebar (DOCTOR has no Pharmacy sidebar links, so the tracker is her only shortcut).

### Steps
1. Open Harika's detail page → all tracker steps are grey. The only action is **Book**.
2. Click **Book** → `/dashboard/appointments?patientId=…` with Harika pre-filled → book 15:00 today with Dr. Praneeta → return to the patient with the browser Back button.
3. The tracker should now show "Upcoming appt" and **Start Visit**. Because the appointment is today and the backend's "next appointment" query compares against "now", the tracker may still show only **Book** (see Defects).
4. Click header **Start new visit** instead → `/dashboard/visits?patientId=…&autoStart=true` → the visit form opens. Dr. Praneeta records complaints and a diagnosis, then saves.
5. Return to the detail page → the tracker shows Start ✓, Document active (visit under 24 h old with no prescription), and **Continue** and **Prescribe** buttons.
6. Click **Prescribe** → the same visit opens. She adds Adapalene 0.1% Gel and Benzoyl Peroxide 2.5% Gel and creates the prescription.
7. Back on the detail page → Prescribe ✓, Billing active, and the button reads **Bill**.
8. Click **Bill** → `/dashboard/pharmacy?patientId=…&visitId=…` → Pharmacy Billing with the patient pre-filled → the pharmacist confirms the invoice.
9. Return to the detail page → **Billing stays "active" and the button still says "Bill"**. The tracker reads clinic-billing invoices, which no UI creates, so pharmacy invoices never count (see Defects).

### Variations
- Patient with a follow-up date on the last visit → Follow-up ✓.
- A visit older than 24 hours without a prescription → Document ✓ and Complete ✓, but Prescribe stays "active" indefinitely.

### Edge Cases
- NURSE or MANAGER viewing the tracker → the `/billing/invoices` request returns 403, and the tracker silently treats it as "no invoice".
- Any visit, even a year old, makes the Start step read ✓ and offers "Continue" instead of "Start Visit", so the tracker reflects the last visit, not today's.

---

## STORY-211: Front-desk morning to doctor follow-through (end-to-end)

**Type**: long
**Topic**: patients-records
**Persona**: Riya (RECEPTION) opening the clinic, then Dr. Shravya, then the Admin at day end
**Goal**: Register two walk-ins and remind tomorrow's procedure patient, then have the doctor see and document them, then have the admin export the day's new registrations
**Preconditions**: Fresh day. Dr. Shravya has free slots. Rooms are seeded. WhatsApp is configured.
**Ideal path**: 18 — about 6 actions for reception, 8 for the doctor and 4 for the admin, across three logins.
**Alternate paths**: Walk-in booking could go through Appointments "Add New Patient" instead. The doctor can reach patients through the dashboard "My Patients", the Patients list, or Appointments tiles → Start Visit. The admin could use Reports → Patient Analytics, which gives aggregates rather than a roster.

### Steps
1. Riya signs in at `/login` with `reception@clinic.test` / `password123` → Dashboard.
2. Click the header **Start Tour** → the Receptionist Tour highlights the "New Patient" button (`add-patient-btn`), the search box and the patients table. Riya skips the rest.
3. **Patients** → **New Patient** → `Pooja Kulkarni`, 26, Female, `919849076543`, Madhapur. Patient Type **Walk-in**, Doctor **Dr. Shravya Dermatologist**, OPD Consultation, Consultation Room 2 → **Create** → toast "Walk-in appointment booked … at 10:00-10:30".
4. **New Patient** again → `Venkatesh Yadav`, 52, Male, `9866012345` (she forgets the 91). Walk-in, Procedure, **Procedure Room B**, Dr. Shravya → **Create** → "Walk-in appointment booked … at 10:30-11:00".
5. Riya mistypes Venkatesh's age as 25. She clicks **Edit** → changes the age to `52` → **Save Changes**.
6. Search `Rohit` → **WhatsApp** → "Reminder sent" for tomorrow's laser session.
7. Riya opens **Appointments** → confirms Pooja at 10:00 and Venkatesh at 10:30 on Dr. Shravya's calendar.
8. Riya logs out with the sidebar footer "Log out" icon.
9. Dr. Shravya signs in as `shravya@clinic.test`. Dashboard "My Patients" does **not** list Pooja or Venkatesh yet, because reception created them and they have no primary doctor until the first visit.
10. **Patients** → search `Pooja` → click the row → detail page. The tracker shows "Upcoming appt" (if the backend query still sees today's slot) or only "Book" (see Defects).
11. Click **Start new visit** → visit form → document a chief complaint of "melasma", Fitzpatrick IV, with photos → Save Draft.
12. Return to the patient detail page → the History tab shows today's group with the visit card and the appointment card. The Uploads tab shows the visit photos under "Other saved photos".
13. Pooja now has Dr. Shravya as primary doctor (assigned by the first visit) → the detail summary shows "Primary doctor: Dr. Shravya Dermatologist", and she appears in "My Patients".
14. Back on **Patients**, find Venkatesh → row **Start Visit** → `/dashboard/visits?patientId=…&autoStart=true` → document a procedure note.
15. Dr. Shravya notices Venkatesh's phone shows `9866012345` without a country code. She cannot fix it from the detail page (no Edit), so she goes back to the list → **Edit** → Phone `919866012345` → **Save Changes**.
16. Dr. Shravya logs out.
17. Admin signs in → **Patients** → Date Range **Last 1 Week** → **Export CSV** → "Exported N patients to CSV". The file includes Pooja and Venkatesh. Consultation Type and Portal Linked carry no useful data (see Defects).
18. Admin sees a stray test record, "Test Patient", made earlier → **Archive** → toast with Undo → leaves it archived.

### Variations
- WhatsApp is not configured → step 6 still shows "Reminder sent" and nothing is delivered.
- Dr. Shravya is fully booked → step 3 shows "No slots available", and Riya must book through the Appointments page or with Dr. Praneeta.

### Edge Cases
- Step 4: if Riya had sent the reminder to Venkatesh with the 10-digit phone, it would have gone to `+9866012345`.
- Step 9: a doctor expecting walk-ins in "My Patients" finds nothing. The Appointments page is the reliable view of the day's walk-ins.

---

## STORY-212: Role boundaries on patient records (nurse, manager, pharmacist by URL)

**Type**: medium
**Topic**: patients-records
**Persona**: QA lead checking which roles can change patient records
**Goal**: Check how what the UI shows compares with what the backend allows for NURSE, MANAGER and PHARMACIST
**Preconditions**: Admin has created a NURSE (`sunitha.nurse@clinic.test`), a MANAGER (`kiran.manager@clinic.test`) and a PHARMACIST (`arif.pharma@clinic.test`) in Users, each with a password set through the reset-code flow
**Ideal path**: 3 per role — log in, open Patients (or type its URL), try one write action.
**Alternate paths**: The sidebar Patients link is shown to OWNER, ADMIN, MANAGER, DOCTOR, NURSE and RECEPTION. Any role can reach the page by typing `/dashboard/patients`, because the middleware checks only for the auth cookie.

### Steps
1. Log in as NURSE → sidebar shows Patients → open it → every row action is visible. Click **Archive** on a test patient → it succeeds (no backend role check). Click **Undo**.
2. NURSE → **New Patient** → Walk-in → the Room dropdown is empty (rooms API denied for NURSE). Choose Dr. Praneeta → **Create** → the appointment books without a room.
3. Log in as MANAGER → **New Patient** → Walk-in with Dr. Shravya → **Create** → the patient is created, but the toast says "No slots available / No available consultation slots found in the next 7 days…". The real cause is that MANAGER is not allowed to call the slot and appointment endpoints.
4. Log in as PHARMACIST → the sidebar has no Patients link → type `/dashboard/patients` in the address bar → the full Patients Management page loads. Search, Edit, Archive and **Export CSV** of every patient's phone, email and ABHA all work.

### Variations
- RECEPTION → same as NURSE, but rooms load and walk-in booking works fully.
- ACCOUNTANT by URL → same as PHARMACIST. A PATIENT portal user could do the same through the API.

### Edge Cases
- Archive, Link Portal and Export appear for every role that can see the page. Nothing in the UI tells the user that some of these are admin-level actions.

---

## Defects noticed while mapping

All of these were checked by reading both the frontend and the backend code.

1. **Link Portal can never succeed.** The frontend sends only `{ email }` (`frontend/src/components/patients/PatientsManagement.tsx:660`). The backend requires `email`, `password`, `firstName` and `lastName` when no `userId` is given (`backend/src/modules/patients/patients.service.ts:415-417`), and the "Link Portal Access" dialog has no fields for the others (`PatientsManagement.tsx:1026-1031`).
2. **The "Portal Linked" badge and Unlink button are unreachable.** The list query's `select` leaves out `portalUserId` (`patients.service.ts:201-221`), but the UI branches on it (`PatientsManagement.tsx:226, 1107, 1173`). Every row therefore shows "Link Portal", and the CSV "Portal Linked" column is always "No" (`PatientsManagement.tsx:380`).
3. **The Unlink confirm toast passes a plain object as its `action`.** The code passes `{ label, onClick }` (`PatientsManagement.tsx:685-706`), but the Toaster renders `{action}` as a React child (`frontend/src/components/ui/toaster.tsx:27`; the type is `ToastActionElement` at `frontend/src/hooks/use-toast.ts:17`). Rendering it would throw "Objects are not valid as a React child". It is hidden only by defect 2.
4. **`consultationType` is dropped when mapping list rows.** The backend returns it (`patients.service.ts:216`), but the row mapping leaves it out (`PatientsManagement.tsx:209-229`). As a result: the Consultation column always shows "—" (`:1160-1166`); the CSV "Consultation Type" column is blank (`:379`); Edit pre-selects OFFLINE (`:587`), and saving overwrites ONLINE patients to OFFLINE (`:477`).
5. **The Last Visit column never renders.** The backend returns `lastVisitAt` (`patients.service.ts:227`), but the UI checks `lastVisitDate` (`PatientsManagement.tsx:1074, 1151`), which the mapping never sets (`:209-229`). The LAST_VISIT sort is unreachable as well.
6. **The detail page's "Next appointment" always reads "Not scheduled".** It reads `patient.nextAppointment` (`frontend/src/app/dashboard/patients/[id]/page.tsx:120`), which `findOne` never returns (`patients.service.ts:242-289`). Meanwhile the tracker on the same page calls `/next-appointment` and can show "Upcoming appt".
7. **Today's appointments are treated as past.** Appointments are stored at midnight UTC (`backend/src/modules/appointments/appointments.service.ts:123`), and `getNextAppointment` filters on `date >= now` (`patients.service.ts:295-301`). From 05:30 IST onward, a later-today appointment is invisible to the WhatsApp reminder ("No upcoming appointment found") and to the tracker's "Upcoming appt".
8. **The global-search patient result is a dead deep link.** The header builds `/dashboard/patients?search=<patient UUID>` (`frontend/src/components/layout/header.tsx:418`). The list search matches only name, phone, ABHA, patient code and email, never the ID (`patients.service.ts:174-183`), so the page shows "No patients found".
9. **The WhatsApp reminder reports success when nothing is sent.** `sendWhatsApp` returns quietly when credentials are missing or the phone is invalid (`backend/src/modules/notifications/notifications.service.ts:138-146`). The service then returns `{ success: true }` (`patients.service.ts:336-338`), and the UI toasts "Reminder sent" (`PatientsManagement.tsx:714-718`).
10. **Indian 10-digit numbers get no country code.** Stored phones are digits only. The service prefixes a bare `+` (`patients.service.ts:335`), and `normalizeE164` adds no country code (`notifications.service.ts:68-73`), so `9866012345` becomes `+9866012345`. Neither the UI (`PatientsManagement.tsx:450`) nor the DTO regex (`backend/src/modules/patients/dto/create-patient.dto.ts:32`) requires the 91 prefix.
11. **No role guard on any patient endpoint.** `PatientsController` uses only `JwtAuthGuard`, with no `@Roles` or `@Permissions` (`backend/src/modules/patients/patients.controller.ts:26-113`), and the global `RolesGuard` passes when no roles are declared (`backend/src/shared/guards/roles.guard.ts:16-18`). PHARMACIST, ACCOUNTANT, LAB_TECH and even PATIENT portal users can list and export every patient, edit, archive and link. The frontend hides the link only in the sidebar (`frontend/src/components/layout/sidebar.tsx:63`) and has no route guard.
12. **A duplicate ABHA ID causes a 500.** `abhaId` is `@unique` (`backend/prisma/schema.prisma:254`), but `createPatientWithCode` handles P2002 only for `patientCode` and rethrows everything else (`patients.service.ts:41-54`). The global filter maps it to 500, and the user sees a generic server error instead of "ABHA already registered".
13. **Phone validation gaps.** The frontend checks only that the phone is non-empty (`PatientsManagement.tsx:450`). The DTO regex `^\+?[1-9]\d{6,14}$` (`create-patient.dto.ts:32`) rejects spaces, hyphens and a leading 0 before the service's `normalizePhone` (`patients.service.ts:21-25`) ever runs, so common inputs like `+91 99490 55123` or `09949055123` fail with an E.164 message.
14. **Form errors take over the list.** A single `error` state serves both the Create/Edit dialog (`PatientsManagement.tsx:451, 458, 504`) and the list. A validation error therefore replaces the Patient Records table behind the dialog with the error and a "Try Again" button (`:1046-1052`).
15. **Changing the Consultation filter does not reset the page.** The page-reset effect watches only `[search, genderFilter]` (`PatientsManagement.tsx:153-157`). Date Range resets the page explicitly (`:1000`), but Consultation does not (`:992`), so a user on page 3 can see an empty page. The empty-state text also ignores `consultationTypeFilter` (`:1056`) and wrongly suggests "Add a patient…".
16. **Column sorting covers only the current page.** `sortBy`/`sortOrder` sort the rows already loaded (`PatientsManagement.tsx:256-283`). The fetch effect does not depend on them (`:162`), the controller never reads `sortBy` (`patients.controller.ts:36-46`), and the service always orders by `createdAt desc` (`patients.service.ts:200`).
17. **Walk-in auto-booking swallows every error.** The per-day `catch {}` (`PatientsManagement.tsx:562-564`) hides all failures. MANAGER is not in `POST /appointments` or `GET /appointments/available-slots` (`backend/src/modules/appointments/appointments.controller.ts:47-48, 71-72`), so a manager gets a false "No slots available". NURSE is excluded from `GET /appointments/rooms` (`:111-112`), so the walk-in Room list is empty. A single room conflict skips the rest of that day.
18. **The tracker's Billing step reads an orphaned API.** `PatientProgressTracker` calls `apiClient.getInvoices` → `/billing/invoices`, the clinic-billing API (`frontend/src/components/patients/PatientProgressTracker.tsx:60`; `frontend/src/lib/api.ts:539-540`), which has no UI. Pharmacy invoices are never counted, so Billing never becomes "done" and the button never changes to "Invoices".
19. **The Patients Quick Guide describes a different UI.** It says to click 'Add Patient' (the button is "New Patient"), names date of birth as a required field (the form has Age only), and mentions medical history and insurance fields, a status filter, and invoices on the profile, none of which exist (`frontend/src/app/dashboard/patients/page.tsx:19-21, 28, 37`).
20. **Duplicate detection is wired but never used.** `PatientDeduplicationService` is registered (`backend/src/modules/patients/patients.module.ts:11`) but never injected or called, so registering the same name and phone twice creates silent duplicates. Phone has no unique constraint (`schema.prisma:259`).
21. **Name editing round-trips badly.** The Patient model has only `name` (`schema.prisma:255`), and the whitelist ValidationPipe drops the `firstName`/`lastName` the UI sends. The list maps `firstName = full name` (`PatientsManagement.tsx:213`), so Edit shows the full name in First Name with Last Name blank, and re-entering a last name duplicates it.
22. **Archived records are half-hidden.** `findOne` does not filter on `isArchived` (`patients.service.ts:243-245`), and the detail page never shows archived status, so archived patients stay fully viewable by URL. The UI has no way to list or unarchive them once the Undo toast is gone, and `TOAST_LIMIT = 1` (`use-toast.ts:10`) means a second toast replaces the Undo.

Redundancy notes for /ux-flow:
- The page has two headings ("Patients Management" and "Patients").
- Patient demographics appear on four surfaces: the list row, the detail header badges, the summary card and the Info tab.
- The last visit can be opened from four controls on one page ("Resume last visit", tracker "Continue", tracker "Prescribe"/"View", History "Resume session").
- Start visit has three entry points on patient surfaces (list row "Start Visit", header "Start new visit", tracker "Start Visit").
- Booking has two (header "Book appointment", tracker "Book").
