# UX Paths: Doctor's visit (dashboard, calendar start, vitals, photos, labs, prescription, preview/print/share, complete)

Topic: "Doctor's visit". Source read: `FE/app/dashboard/page.tsx`, `FE/components/dashboard/DoctorPatientPanels.tsx`, `FE/components/appointments/{DoctorDayCalendar,CalendarColumn}.tsx`, `FE/app/dashboard/appointments/page.tsx`, `FE/app/dashboard/visits/page.tsx`, `FE/components/visits/{MedicalVisitForm,PrescriptionBuilder,VisitPhotos,VisitIdentityBar}.tsx`, `FE/lib/medicine-regimen-defaults.ts`, `BE/modules/visits/visits.service.ts`. Not used: `VisitStateContext.tsx` and `AppointmentScheduler.handleStartVisit` (defined, never called, so no story).

Counting rule used in every story: one numbered step per click, per typed field (focus plus typing counts as one), per selection, per OS-dialog action. Hover is not counted. Marks: (required field), (optional), (default: X), (app already knows this).

Facts that apply to several stories (verified in source):
- Tabs for a DOCTOR, in order: Overview, Vitals, Photos, Prescription, Lab Tests, Customization, History. The form opens on Overview.
- Doctor progress is `completedSections.size / 5`. Only four sections can ever be marked (vitals, photos, labs, prescription), so "Complete Visit" (needs 80%) is enabled only when all four are marked. Vitals are marked only by the button "Mark Vitals Complete", labs only by "Save Labs", photos automatically when at least one photo exists, prescription when "Print Preview" opens or a prescription is created.
- The visit record is created lazily: first of Save Draft, autosave, "Mark Vitals Complete", "Save Labs", photo upload, or "Create Prescription". Creating it sets the appointment IN_PROGRESS.
- There is no confirmation dialog on "Complete Visit"; the form stays open afterwards (toast "Visit completed").

---

## DOCTOR-VISIT-01: Open the next confirmed patient from the calendar

**Type**: short
**Topic**: Doctor's visit
**Persona**: Dr. Kavita Rao, dermatologist, logged in after morning rounds
**Goal**: Get from login to the visit form of Suresh Kumar (34, acne review, 11:30 slot, Confirmed column)
**Preconditions**: Appointment for Suresh Kumar today 11:30 with Dr. Kavita Rao, status CONFIRMED (in the "Confirmed" column). Browser has no stored doctor choice, or another doctor was last chosen by a colleague on the same PC.
**Ideal path**: 1. The app knows who the doctor is and that it is today; one click on the patient in a "my day" list should open the visit.
**Alternate paths**: (a) Calendar row click opens dialog "Appointment Details", then button "Start Visit" (2 clicks, same destination). (b) Patients list row button "Start Visit" goes to `/dashboard/visits?patientId=&autoStart=true` with no appointmentId, so the visit is not linked to the appointment and the doctor falls back to the first doctor in the list. (c) Patient detail buttons "Start visit" and "Resume last visit". (d) Visits setup screen "Start New Visit": search patient, pick doctor, "Start Visit Documentation". (e) Header Notifications item for doctors (`/dashboard/visits?appointmentId=`). (f) Dashboard "Recent Visits" only resumes past visits. (g) `PatientProgressTracker` buttons "Start Visit"/"Continue". The dashboard "Today's Appointments" card rows are not clickable.

### Steps
1. Click sidebar entry "Appointments" → `/dashboard/appointments`, tab "Calendar" shown, two columns "Scheduled" and "Confirmed". Date input shows today (default: today, IST).
2. Click the "Doctor" select (app already knows this: the logged-in user is a doctor; the page instead restores `appointments.doctorId` from localStorage or falls back to the first doctor in the list) → options list opens.
3. Click "Kavita Rao" (required; wrong doctor is a silent mis-read of the schedule) → calendar columns reload for Dr. Rao.
4. Hover Suresh Kumar's row in "Confirmed" and click the blue "START" button (shows "CONT" if a visit already exists) → navigates to `/dashboard/visits?patientId=…&appointmentId=…&autoStart=true`; "Visit Documentation" appears with badge "From Appointment", sticky identity line "Patient: Suresh Kumar · 34 · Male · Doctor: …" and the form on tab "Overview". No visit record exists yet.

### Variations
- Patient still in the "Scheduled" column (not confirmed by phone): the same START works, no warning; the "Appointment Details" dialog offers "Confirm" instead.
- Row opened with a click: dialog "Appointment Details" repeats Date, Slot, Calendar, Patient, Phone, Email, Age, Sex, Bill type, Type, Room, Status; the same facts are on the row chip and the visit identity line.
- Existing draft visit: button reads "CONT" and URL carries `visitId`.

### Edge Cases
- Optimistic (just-booked) rows have START disabled until the server id returns.
- On the `/dashboard/visits` setup screen (no deep link) the doctor select is pre-filled with the first doctor, not the logged-in one.

---

## DOCTOR-VISIT-02: Record vitals before the consultation

**Type**: short
**Topic**: Doctor's visit
**Persona**: Dr. Kavita Rao (doctor does her own vitals in a small clinic)
**Goal**: Capture BP and weight for Suresh Kumar and mark the Vitals section complete
**Preconditions**: Visit form open from DOCTOR-VISIT-01 (Overview tab).
**Ideal path**: 3. Type the three readings; autosave persists them and the section needs no separate "mark complete" click.
**Alternate paths**: Overview "Quick Actions" button "Record Vitals" (only switches to the Vitals tab, same as the tab). The Prescription tab section "Clinical Details & Vitals" has Height, Weight, BMI, BP (Sys), BP (Dia), Pulse and is synced both ways with the Vitals tab (`receiveClinicalData`), so vitals can be typed there instead; it does not mark the vitals section complete. Nurse role reaches the same Vitals tab.

### Steps
1. Click tab "Vitals" → grid of fields BP Systolic, BP Diastolic, Heart Rate, Temperature, Weight, Height, BMI, Resp. Rate, plus Pain Score (0-10).
2. Type "122" in "BP Systolic" (optional; placeholder mmHg).
3. Type "80" in "BP Diastolic" (optional; placeholder mmHg).
4. Type "68" in "Weight" (optional; placeholder kg).
5. Click "Mark Vitals Complete" → saves the visit (creates it if first save; toast "Visit saved"), Vitals tab gets a green dot, progress bar moves to 20%.

### Variations
- Add "Height" (optional, cm): "BMI" (read-only, calculated) fills; the same BMI appears on the Prescription tab.
- "Temperature" placeholder is °F; the payload converts to Celsius.
- "Heart Rate" is labelled "Pulse (bpm)" in the Prescription tab (same value, different label).
- Pain Score here and "Itch Score (0-10)" under "On Examination" are separate fields.

### Edge Cases
- Skipping step 5: values still autosave, but the section stays "Pending" in "Progress Summary" and the doctor cannot complete the visit later.
- Overview card "Photos Captured" is hard-coded to 0 in source.

---

## DOCTOR-VISIT-03: Write a two-medicine acne prescription

**Type**: medium
**Topic**: Doctor's visit
**Persona**: Dr. Kavita Rao
**Goal**: Prescribe Adapalene 0.1% gel and Doxycycline 100 mg for Suresh Kumar with a 6-week review and save the prescription
**Preconditions**: Visit form open (DOCTOR-VISIT-01). Drugs "Adapalene 0.1% gel" and "Doxycycline 100mg capsule" exist in the drug database. Patient has no earlier prescriptions (so no regimen suggestions).
**Ideal path**: 6. Two medicines at two steps each (type, pick), one review-interval click, one save; frequency and duration come from defaults.
**Alternate paths**: Templates bar (dropdown "Templates", e.g. default "Acne (Mild) — Topical regimen") fills rows in 2 clicks; "Reuse last meds"; "Recent meds:" chips. `ensureVisitId` means Create Prescription also creates the visit. The preview dialog "Save Prescription" is a second way to save (DOCTOR-VISIT-04). Footer "Save Draft" saves clinical fields but not the prescription items.

### Steps
1. Click tab "Prescription" → builder with all sections expanded in one long page: Clinical Details & Vitals, Chief Complaints, Diagnosis, Patient History, On Examination, Treatment, Procedures, Investigations, Basic Information, Review Date.
2. Type "Pimples on cheeks and forehead for 3 months" in "Chief Complaints" (optional; suggestion list appears, clicking one is an extra step).
3. Type "Acne vulgaris" in "Diagnosis" (optional; placeholder e.g., Acne vulgaris).
4. In Treatment row 1, type "adap" in "Search medicine name..." (required; a blank row exists by default).
5. Click result "Adapalene 0.1% gel" in the dropdown (required) → row fills drug; app fetches regimen defaults; a new blank row 2 is appended. With no history, Frequency/When/Duration/Instructions stay empty (default: Duration unit DAYS).
6. Click preset "HS" (optional; sets Frequency ONCE_DAILY for the active row).
7. Click preset "4w" (optional; sets Duration 4 and unit WEEKS on the active row).
8. Type "Apply a pea-sized amount at night, avoid sun" in row 1 "Instructions" (optional; placeholder e.g., Avoid alcohol).
9. In row 2, type "doxy" in "Search medicine name..." (required).
10. Click "Doxycycline 100mg capsule" (required).
11. Click preset "1-0-1" (optional; sets dose pattern and infers frequency and timing).
12. Click preset "14d" (optional).
13. Click review chip "6w" under "Review Date" (optional) → fills "Review Date" and, because empty, "Follow-up Instructions" becomes "Follow up in 6 weeks" (two fields, same fact).
14. Click "Create Prescription" → toast "Prescription created: 2 medications recorded for the patient"; visit saved, Prescription tab section marked complete; dialog "Go to Pharmacy?" opens (guards leaving the visit for the billing page).
15. Click "Stay Here" → dialog closes, form remains.

### Variations
- Step 14 alternative "Yes, go to Pharmacy" leaves the visit page via `window.location.href` to a pre-filled Sales bill (patient, doctor, prescription).
- "+ Add to Drug Database" opens dialog "Add Drug to Database" (Name, Manufacturer, Price (₹), Pack Size Label, "Save & Add") when a drug is missing.
- Second visit for the same patient with history: step 5 fills duration, frequency, when and instructions with "Suggested · Accept" links beside each; the doctor's untouched suggestions already apply, so Accept is cosmetic.
- Language select (English/Telugu/Hindi) under "Basic Information": non-English triggers translation on Print Preview.

### Edge Cases
- Only the medicine name is needed for "Create Prescription"; empty frequency or duration is not blocked by the client.
- No medicine: "Create Prescription" is disabled and the preview button reads "Add medications to save".
- Draft autosaves to localStorage (`rxDraft:<patient>:<visit>`); tele-video consultation without the consent checkbox blocks saving with toast "Patient consent required".
- Vitals and complaints exist in the Overview/Vitals tabs and again in this builder; Investigations exist here and in the Lab Tests tab (see DOCTOR-VISIT-05).

---

## DOCTOR-VISIT-04: Preview and print the prescription

**Type**: medium
**Topic**: Doctor's visit
**Persona**: Dr. Kavita Rao, then front-desk printer
**Goal**: Print the A4 prescription for Suresh Kumar on the clinic letterhead
**Preconditions**: DOCTOR-VISIT-03 steps 1-13 done (medicines entered). Doctor has a signature uploaded in header "My Settings" (otherwise "Show signature" is disabled with help text "No signature uploaded…").
**Ideal path**: 2. One click "Print" (auto-save, auto-preview) plus the unavoidable OS print confirmation.
**Alternate paths**: "Download PDF" in the same dialog; "PDF via WhatsApp" and "Email" (DOCTOR-VISIT-08); pharmacy-side print of the bill is a different document. Keyboard shortcuts do not reach print.

### Steps
1. Click "Print Preview" (below the builder) → toast "Print Preview: Language is English. Skipping translation."; full-screen dialog "Prescription Preview" opens with paper, zoom, margins; Prescription section is marked complete now.
2. Click checkbox "Show signature" (optional; default: remembered for this doctor on this browser; disabled if no signature).
3. Click green "Save Prescription" (optional here, because Print/Download/WhatsApp auto-save; required before "Email") → saves; "Email" unlocks.
4. Click "Print" → `saveBeforeExport` saves the visit (PATCH) and the prescription, builds the paginated pages, opens the browser print dialog. A blue "Print Settings Tip" box tells the user to turn off "Headers and footers" by hand.
5. In the browser print dialog choose the printer "Clinic HP LaserJet" (default: last used printer; OS step).
6. Click the browser's "Print" button (OS step) → page prints.
7. Click "Close" → back to the builder.

### Variations
- Space-optimized layout / "Fit to 1 page" checkboxes and "Printer profile" select change the output; "Refill stamp" checkbox adds a stamp.
- Button "Interactions" opens dialog "Interaction Summary" (drug interaction list, button "Close").
- Translate-on-print: choose Hindi or Telugu in step 1's prerequisite and step 1 shows "Preparing…" while translating.
- Patient name, age and phone appear in the preview header, the visit identity line and the Appointment Details dialog (same information on several surfaces).

### Edge Cases
- Print before the pagination finishes: toast "Print failed: No paginated preview is ready yet."
- Signature image fails to load: toast "Print failed", retry.
- Visit changed on another device: save conflict toast and autosave pauses ("Visit changed elsewhere").

---

## DOCTOR-VISIT-05: Full consultation, login to completed visit (long)

**Type**: long
**Topic**: Doctor's visit
**Persona**: Dr. Kavita Rao, 11:30 patient Suresh Kumar, starting isotretinoin so baseline liver and lipid tests are ordered
**Goal**: Document vitals, a photo, ordered investigations and a two-medicine prescription, print it, and complete the visit
**Preconditions**: Same as DOCTOR-VISIT-01 and 03. A JPG of the face is on the PC. Doctor signature uploaded.
**Ideal path**: 15. Open patient (1); three vitals (3); choose photo (1); two medicines (4); two investigation ticks (2); review interval (1); Print plus OS confirm (2); Complete (1). The app should infer progress, tag the photo, and not ask for the same tests twice.
**Alternate paths**: Footer shortcut Ctrl/Cmd+Shift+S for "Complete Visit" (listed in dialog "Keyboard Shortcuts"). Prescription via template. Patient-list "Start Visit" start. Photos can also be added from patient detail tab "Uploads".

### Steps
1. Click sidebar "Appointments" → calendar for today.
2. Click "Doctor" select (app already knows this).
3. Click "Kavita Rao" (required).
4. Hover row Suresh Kumar and click "START" → visit form, tab Overview.
5. Click tab "Vitals".
6. Type "122" in "BP Systolic" (optional).
7. Type "80" in "BP Diastolic" (optional).
8. Type "68" in "Weight" (optional).
9. Type "172" in "Height" (optional) → "BMI" auto-fills.
10. Click "Mark Vitals Complete" → toast "Visit saved"; visit created; progress 20%.
11. Click tab "Photos" → "Before / After Photos (0)", text "No photos attached to this visit".
12. Click "Upload" (header) or "Choose Files" (empty state) → OS file chooser.
13. Choose "suresh_face_front.jpg" in the OS chooser (required) → dialog "Tag photo positions" opens, mode "Single", position (default: Front, inferred by order).
14. Click "Upload" in the dialog → toast "Photos uploaded: 1 image(s) uploaded."; heading shows "(1)"; Photos section auto-marked (progress 40%).
15. Click tab "Lab Tests".
16. Tick "LFT" (optional) → card with five sub-rows AST (SGOT), ALT (SGPT), Bilirubin Total/Direct/Indirect, units pre-filled.
17. Tick "Fasting lipid profile" (optional) → four sub-rows pre-filled with mg/dL.
18. Click "Save Labs" → saves, Lab Tests section marked complete (progress 60%) although no result has been entered. Helper text: "Selections and results are saved under Treatment Plan → Dermatology."
19. Click tab "Prescription".
20. Type complaint in "Chief Complaints" (optional).
21. Type "Acne vulgaris" in "Diagnosis" (optional).
22. Type "adap" in medicine field row 1 (required).
23. Click "Adapalene 0.1% gel" (required).
24. Click preset "HS" (optional).
25. Click preset "4w" (optional).
26. Type "doxy" in row 2 medicine field (required).
27. Click "Doxycycline 100mg capsule" (required).
28. Click preset "1-0-1" (optional).
29. Click preset "14d" (optional).
30. In section "Investigations" tick "LFT" (optional; the same test already chosen in step 16, separate state, so it must be entered again for it to print).
31. Tick "Fasting lipid profile" (optional; same reason).
32. Click review chip "6w" (optional) → Review Date and Follow-up Instructions both fill.
33. Click "Print Preview" → dialog "Prescription Preview"; prescription section marked (progress 80%).
34. Click "Print" → auto-saves visit and prescription, browser print dialog opens (no "Go to Pharmacy?" prompt on this path, because it saves "from preview").
35. Choose printer in the browser dialog (default: last used; OS).
36. Click browser "Print" (OS).
37. Click "Close" in "Prescription Preview".
38. Click footer "Complete Visit" (enabled at 80%; no confirmation dialog) → toast "Visit completed: All documentation has been marked complete."; the page stays on the form and the Overview "Status" badge reads COMPLETED.

### Variations
- Skip the photo (not clinically needed): "Complete Visit" stays disabled; footer text reads "Completion requires 80% progress. Remaining: photos. Section progress does not verify clinical completeness."
- Skip the lab ticks: step 18 can still be clicked with nothing ticked to satisfy progress.
- Patient wants WhatsApp copy: add DOCTOR-VISIT-08 between steps 33 and 37.
- Ending by billing: use "Create Prescription" then "Yes, go to Pharmacy" instead of printing.

### Edge Cases
- Tele-video consultation type (select "Consultation type" under the progress card): all saves blocked until "Patient consented to tele-video consultation" is ticked.
- Browser closed mid-visit: `beforeunload` guard and localStorage draft; on reopen progress may reset (see DOCTOR-VISIT-09).
- Same visit edited on two devices: 409, toast, autosave paused, "discard and reload" button.
- The same facts live on several surfaces: patient identity (calendar row, Appointment Details dialog, identity line, progress tracker), vitals (Vitals tab and Prescription "Clinical Details & Vitals"), investigations (Lab Tests tab and Prescription "Investigations"), complaints and diagnosis (builder, Overview-derived history cards, History tab).

---

## DOCTOR-VISIT-06: Attach a lesion photo to the visit

**Type**: short
**Topic**: Doctor's visit
**Persona**: Dr. Kavita Rao
**Goal**: Add one close-up photo of a back lesion to Suresh Kumar's visit
**Preconditions**: Visit form open; a JPG on the PC (or a phone camera).
**Ideal path**: 2. Choose or capture the file; the position is auto-tagged and upload starts at once (retag only when wrong).
**Alternate paths**: "Camera" / "Take Photo" (opens the device camera via `capture=environment`); patient detail tab "Uploads" (`VisitPhotos`/`PatientPhotoArchive`); Overview "Capture Photos" only switches to the Photos tab.

### Steps
1. Click tab "Photos" → "No photos attached to this visit".
2. Click "Upload" → OS file chooser.
3. Choose "back_lesion.jpg" (required) → dialog "Tag photo positions" with Mode "Grid"/"Single", button "Infer positions", a position select (default: Front, assigned in the order Front, Left, Right, Back, Close-up, Other).
4. Click "Upload" in the dialog (the dialog's footer also has "Cancel") → toast "Photos uploaded: 1 image(s) uploaded."; heading "Before / After Photos (1)"; visit is silently created if none existed (appointment goes IN_PROGRESS).

### Variations
- Change the position (optional): click "Select position" and choose "Close-up"; the default Front is wrong for a back lesion, so correcting adds 2 steps.
- Several files: dialog steps through each with "Prev"/"Next" or all at once in "Grid"; uploads in batches of 6.
- With one photo, "Compare: On/Off" and "Delete" appear; delete asks via browser confirm "Delete this photo? This cannot be undone."

### Edge Cases
- Non-image file: toast "No valid images".
- Files above 25 MB: warning but upload is attempted.
- Tele-video without consent: upload blocked with the consent message.

---

## DOCTOR-VISIT-07: Enter a patient's lab report results

**Type**: medium
**Topic**: Doctor's visit
**Persona**: Dr. Kavita Rao, patient brings a printed CBC and Vitamin D report
**Goal**: Record Haemoglobin 13.8, WBC 6.2, Platelets 240 and Vitamin D 18 in the visit
**Preconditions**: Visit form open.
**Ideal path**: 6. Tick two tests, type four values; units are known and the section needs no manual save.
**Alternate paths**: Photo autofill in the same tab (file input, accepts JPG, PNG or PDF; the AI fills selections and values, then "Save Labs"). Investigations ordered (not resulted) are chosen under "Investigations" in the Prescription tab. Compare with previous visit lives only here.

### Steps
1. Click tab "Lab Tests" → card "Lab Tests (Investigations)", 31 checkboxes.
2. Tick "CBC" (optional) → "Enter Results" card with sub-rows "Hemoglobin", "WBC", "Platelets", units pre-filled (default: g/dL, 10^9/L).
3. Type "13.8" in Hemoglobin "Value" (optional).
4. Type "6.2" in WBC "Value" (optional).
5. Type "240" in Platelets "Value" (optional).
6. Tick "Vitamin D" (optional) → one row with unit (default: ng/mL).
7. Type "18" in its "Value" (optional).
8. Click "Save Labs" → saves the visit and marks Lab Tests complete.

### Variations
- Tick "Compare with previous visit" (optional): each value gets a "Δ +x" next to it versus the last visit.
- Autofill: choose the report image (one OS file action) → toast "Autofill complete: Extracted results inserted." or "Autofill failed".

### Edge Cases
- A test with no entered value still counts as complete on "Save Labs".
- Unknown tests (e.g. "Skin Biopsy") have an empty unit.
- Same test list is offered a second time in the prescription's "Investigations" section with its own "Add Custom Investigation" and a clinic list; the two are not linked in source.

---

## DOCTOR-VISIT-08: Send the prescription to the patient on WhatsApp or email

**Type**: medium
**Topic**: Doctor's visit
**Persona**: Dr. Kavita Rao
**Goal**: Share the PDF with Suresh Kumar (phone 98480 12345 on file)
**Preconditions**: Prescription entered (DOCTOR-VISIT-03). Patient phone on file. Desktop browser (no native file share).
**Ideal path**: 2. Click "Share on WhatsApp"; the message opens with the PDF attached and the patient's number.
**Alternate paths**: "Email" button in the same dialog (needs a saved prescription and a patient email); "Download PDF" and manual attach. Patient-list "More" menu has a "WhatsApp" action unrelated to prescriptions. Per-doctor "Send WhatsApp on appointment creation" setting is booking only.

### Steps
1. Click "Print Preview" → "Prescription Preview" dialog.
2. Click "PDF via WhatsApp" → auto-saves visit and prescription, renders PDF, records a WHATSAPP_SHARE print event; on desktop the PDF downloads and a new tab opens `wa.me/<patient phone>` (app already knows this phone); toast "PDF downloaded: Attach the downloaded PDF in the WhatsApp chat that just opened."
3. In the WhatsApp tab click the attach (paperclip) icon (outside the app).
4. Choose "prescription-<id>.pdf" in the OS chooser (outside the app).
5. Click send in WhatsApp (outside the app).
6. Click "Close" in "Prescription Preview".

### Variations
- Email: Step 2 becomes click "Save Prescription" (required; "Email" tooltip says "Save the prescription first"), then click "Email" → toast "Email sent: Prescription PDF sent by email."; message text "Your prescription is attached." is fixed.
- Phone browser/tablet with Web Share files support: step 2 opens the native share sheet (steps 3-5 replaced by choosing WhatsApp in the sheet).

### Edge Cases
- No phone on file: toast "No phone number: Patient has no phone number on file."
- No patient email: toast "Email failed: Patient has no email address on file."
- User cancels the share sheet: silent (AbortError ignored).

---

## DOCTOR-VISIT-09: Reopen a patient's visit from the dashboard and finish it

**Type**: medium
**Topic**: Doctor's visit
**Persona**: Dr. Kavita Rao, on the clinic desktop after a lunch break and a browser restart
**Goal**: Reopen Suresh Kumar's in-progress visit (photo, vitals, prescription already saved) and complete it
**Preconditions**: Visit exists with status IN_PROGRESS, one photo, vitals and a prescription saved earlier; browser localStorage for the draft was cleared by the restart (a private window or another PC gives the same result).
**Ideal path**: 2. Open the visit from "Recent Visits" and click "Complete Visit"; saved content should count as complete.
**Alternate paths**: Patient detail "Resume last visit"; Patient History cards "Resume"; calendar "CONT"; header notification. "My Patients" card goes to patient detail, not the visit.

### Steps
1. Click "Dashboard" in the sidebar (optional if already there) → cards "Recent Visits" and "My Patients" for doctors.
2. Click the "Suresh Kumar" row in "Recent Visits" → `/dashboard/visits?patientId=&visitId=`; form loads saved visit on "Overview"; footer reads "Progress: 20% • 1 of 5 sections complete" (only photos counted) with the "Completion requires 80% progress. Remaining: vitals, labs, prescription." text.
3. Click tab "Vitals".
4. Click "Mark Vitals Complete" (saved values shown; required again to count).
5. Click tab "Lab Tests".
6. Click "Save Labs" (required again to count; nothing selected is accepted).
7. Click tab "Prescription".
8. Click "Print Preview" (this alone marks the prescription section; the saved prescription is not read back as complete).
9. Click "Close".
10. Click "Complete Visit" → toast "Visit completed"; no confirmation dialog.

### Variations
- Same browser as the earlier session: the localStorage draft restores `completedSections`, and only step 2 plus step 10 are needed (the best case).
- Visit edited on another device meanwhile: toast "Visit changed elsewhere", autosave paused, button to discard the local draft and reload the saved visit (conflict path).

### Edge Cases
- I found no code that rebuilds `completedSections` from the saved visit (only localStorage draft and the photo-count effect), so on a fresh browser the progress bar lies about saved work.
- "Complete Visit" does not close the form or return to the calendar; "Back to Calendar" is `window.history.back()`.
