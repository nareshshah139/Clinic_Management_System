# Topic: prescriptions-print-share

Scope: PrescriptionBuilder inside the visit's **Prescription** tab (`frontend/src/components/visits/PrescriptionBuilder.tsx`), templates, Hindi/Telugu translation, the full-screen Paged.js **Print Preview** dialog, Print / Download PDF / Email / "PDF via WhatsApp", the "Go to Pharmacy" handoff, and doctor signature/letterhead setup (header "My Settings", visit **Customization** tab). Backend: `backend/src/modules/prescriptions/*`, `POST /visits/translate`, `users/me/signature|letterhead`, `NotificationsService`.

Who can reach the builder: the Prescription / Lab Tests / Customization tabs render only for roles whose visit permission set is `['all']` (DOCTOR, ADMIN, OWNER, `MedicalVisitForm.tsx:191-194`, `:1698-1702`). NURSE and RECEPTION never see it. Backend create/update/cancel are `@Roles(DOCTOR, ADMIN, OWNER)`; share, PDF, print-events, translation memory and printer-profile endpoints carry no `@Roles` at all.

Surfaces that render the same prescription data (redundancy feed): builder medicine table → Print Preview pages → downloaded/emailed PDF (html2canvas capture of the preview) → Visits page right panel "Patient History" → "View Prescription" → **Prescription Details** dialog ("Prescription Overview") → MedicalVisitForm **History** tab cards ("n Rx Items") → Patient detail **History** tab → Pharmacy Billing prefill / Prescription queue → Pharmacy Counter "Rx queue". Print-format controls are duplicated too: "Print" format select in the builder footer **and** "Print Format" in the preview sidebar; top/bottom margins in the Customization tab **and** preview sliders **and** printer profiles; letterhead in header My Settings **and** Customization "Print Background Image URL" / "Save Doctor Default".

---

## STORY-001: Dr. Shravya writes, prints and hands off an acne prescription for a walk-in college student

**Type**: long
**Topic**: prescriptions-print-share
**Persona**: Dr. Shravya (DOCTOR, `shravya@clinic.test`), running a busy Saturday OPD at the Jubilee Hills clinic
**Goal**: Turn a consultation for Arjun Rao (19, moderate inflammatory acne) into a signed, letterheaded printout and send him to the pharmacy counter to buy the medicines
**Preconditions**: Arjun Rao exists (phone +91 98490 12345, email arjun.rao19@gmail.com) with today's OPD Consultation booked with Dr. Shravya; drug master / inventory contains Doxycycline 100 mg, Adapalene Gel 0.1%, Benzoyl Peroxide Gel 2.5%; Dr. Shravya has uploaded a signature and letterhead (STORY-004)
**Ideal path**: 8 — open the visit, pick a template, add one drug, set dose/duration, create, preview, print, hand off; everything else (vitals, notes) is optional
**Alternate paths**: Visit can be opened from ≥6 places (appointment tile "Start Visit", Appointment Details dialog, Patients row "Start Visit", patient detail, PatientProgressTracker, Visits "Start New Visit"). Handoff has two routes: footer "Go to Pharmacy" button (no confirm, passes `visitId`) and the post-create "Go to Pharmacy?" dialog "Yes, go to Pharmacy" (passes `prescriptionId`). Reception can also pick the Rx up independently from Pharmacy Billing's prescription queue ("Load").

### Steps
1. Go to `/login`, enter `shravya@clinic.test` / `password123`, click "Sign in" → lands on `/dashboard` ("Welcome back! Here's what's happening at your clinic today.") with "Today's Appointments".
2. Click "Appointments" in the sidebar, find Arjun Rao's 10:30 tile, click "Start Visit" → `/dashboard/visits?patientId=…&appointmentId=…&autoStart=true`; "Linked to Appointment" badge shows and MedicalVisitForm opens on **Overview**.
3. Click the **Prescription** tab → builder loads; while templates fetch the bar reads "Loading templates…", then the "Templates" dropdown appears with "Select a template".
4. Open "Templates", choose "Acne (Mild) — Topical regimen" under "Default templates" → Adapalene Gel 0.1% (Bedtime) and Benzoyl Peroxide Gel 2.5% (Morning) rows appear in the Treatment table with 12-week durations. Dr. Shravya thinks: "mild template, but he has pustules — I need an oral antibiotic too."
5. In "Clinical Details & Vitals" leave vitals blank (nurse already took them); in Diagnosis type "Acne vulgaris – grade 2" → the dark "Treatment suggestions" card updates its title from "Enter a diagnosis to see treatment suggestions." to a matched plan (if past plans exist).
6. Click "Add Row" (or press Enter in the last Medicine field) → a blank row is focused with placeholder "Search medicine name...".
7. Type "doxy" → fixed dropdown lists matches with "Stock:" counts (red when ≤5); pick "Doxycycline 100 mg" → regimen defaults fill in.
8. She wants once daily after food: under "Presets:" click "0-1-0", then in "When" pick "After Lunch", then click the "4w" duration preset → row shows 4 WEEKS.
9. In Instructions type "Take with a full glass of water, do not lie down for 30 min" (thinking: Telugu-speaking parents may read this later, but Arjun reads English).
10. Under Basic Information leave Language as English; type Follow-up Instructions "Review in 4 weeks" or click the "4w" review-date shortcut under "Review Date" → Review Date set and follow-up text auto-filled if empty.
11. Check footer: "Total items: 3 • Total qty: …". Click "Create Prescription" → toast "Prescription created — 3 medications recorded for the patient." and the "Go to Pharmacy?" dialog opens: "3 medications were added to this prescription. Continue to the pharmacy module to bill them now?"
12. Click "Stay Here" (she wants to print first) → dialog closes; the Prescription tab gets the green completion dot.
13. Click "Print Preview" (English) → toast "Print Preview — Language is English. Skipping translation." and the full-screen preview opens; "Processing pagination..." spinner runs, then page(s) render on her letterhead.
14. In the right sidebar confirm "Letterhead (doctor's own)" is selected, tick "Show signature" (help text "Remembered for this doctor on this browser. Applies to print, PDF, WhatsApp and Email.") → signature image appears above "Dr. Shravya …".
15. Read the "📋 Print Settings Tip" and click "Print" → visit is saved first, the browser print dialog opens showing only the paged prescription; she prints on the A4 printer.
16. Click "Download PDF" → toast "Generating PDF…" then "PDF ready — Prescription PDF downloaded." (file `prescription-<id>.pdf`) for the clinic's records.
17. Click "Close" on the preview, scroll to the footer and click "Go to Pharmacy" → full page navigation to `/dashboard/pharmacy?patientId=…&doctorId=…&visitId=…` which opens **Pharmacy Billing** ("Visit drugs auto-load as a draft; pharmacist review is required…") and the invoice builder loads the visit's prescription.
18. Back in the visit (browser Back), click "Complete Visit" → visit completes.

### Variations
- Dialog route: at step 12 click "Yes, go to Pharmacy" instead → navigates to `/dashboard/pharmacy?patientId=…&prescriptionId=…&doctorId=…` (no `visitId`), skipping the print steps; she must reopen the visit to print.
- Tele-video consult: with consultation type Tele-video and "Patient consented to tele-video consultation" unticked, "Create Prescription" toasts "Patient consent required"; once ticked, the preview shows the tele-video label beside the date and the clinic disclaimer above the signature.
- Re-saving: clicking "Create Prescription" again after edits PATCHes the same Rx → toast "Prescription updated" and the pharmacy dialog reappears.
- Saving from inside preview: green "Save Prescription" button in the preview sidebar saves without opening the pharmacy dialog.

### Edge Cases
- Empty table: "Create Prescription" toasts "Cannot create prescription — Add at least one medication to create a prescription."; preview's save button reads "Add medications to save".
- Visit edited in another tab: 409 → "Visit changed elsewhere" conflict gate; Print/PDF/Email/WhatsApp are blocked until resolved ("Save required before export").
- Network drop during create → "Connection timed out"; session expired → "Signed out".
- Doxycycline not in drug master: dropdown shows no match; see STORY-010.
- Footer "Go to Pharmacy" before "Create Prescription": navigates with only `visitId`; billing finds no saved prescription and the bill stays empty (see Defects).

---

## STORY-002: Printing a Telugu prescription for an elderly patient

**Type**: medium
**Topic**: prescriptions-print-share
**Persona**: Dr. Praneeta (DOCTOR, `praneeta@clinic.test`), whose patients from Kukatpally often read only Telugu
**Goal**: Give Lakshmi Reddy (62, chronic hand eczema) a prescription whose instructions she can read herself
**Preconditions**: Lakshmi Reddy has an open visit with Dr. Praneeta; backend `OPENAI_API_KEY` configured; Dr. Praneeta's bundled letterhead in place
**Ideal path**: 4 — choose Telugu, open preview (translation happens automatically), check, print
**Alternate paths**: none found (Language select exists only under the builder's "Basic Information" section; the backend translation-memory endpoints `GET/POST /prescriptions/translations` have no UI)

### Steps
1. Open the visit → **Prescription** tab; pick template "Eczema — Emollients + Low-potency steroid" → Hydrocortisone Cream 1% row appears with "Thin layer to affected areas for 1-2 weeks then taper".
2. Click "Add Row", search "Levocetirizine 5 mg", then click the "HS" and "14d" presets; Instructions "Take at night, may cause drowsiness".
3. Type Diagnosis "Chronic hand eczema" and Follow-up Instructions "Review after 2 weeks; avoid detergents".
4. Expand "Basic Information", change Language from English to Telugu → blue box "Translation enabled — On print preview, free-form fields will be translated to Telugu…Medication names, numbers, and units remain unchanged." Languages icons appear beside Procedures, Follow-up Instructions, and "Investigations (translates)".
5. Click "Print Preview" → button reads "Preparing…", toast "Translating… Preparing 6 field(s) in Telugu", then preview opens with Telugu diagnosis, instructions and follow-up; drug names stay in English.
6. Dr. Praneeta reads the Telugu follow-up line aloud to Lakshmi's son to sanity-check it, ticks "Show signature", clicks "Print".
7. Click "Close"; click "Create Prescription" (if not already saved by Print) → "Prescription updated".

### Variations
- Hindi: same flow with "Hindi" for Fatima Begum from Tolichowki; toast says "in Hindi".
- Re-open preview without edits → translation is served from the in-memory cache; no "Translating…" toast.
- Edit one instruction after preview → next preview re-translates all fields (cache key is the full text set).

### Edge Cases
- `OPENAI_API_KEY` missing: backend 503 "Translation is unavailable. Configure OPENAI_API_KEY." → warning toast "Translation unavailable — Showing original text. Check server OPENAI_API_KEY and network." and the preview opens in English (staff-facing copy leaks a server env var name to doctors).
- Over 8,000 characters of free text → 400 "Total text too large for translation. Reduce content." → same English fallback.
- Language saved as TE but someone opens the preview on a different machine: translation re-runs; there is no stored translated copy.

---

## STORY-003: Fitting a long acne-scar + melasma regimen onto one page

**Type**: medium
**Topic**: prescriptions-print-share
**Persona**: Dr. Praneeta, fussy about one-page printouts because patients lose page 2
**Goal**: Squeeze a 7-drug regimen with investigations and custom advice onto a single A4 letterhead page
**Preconditions**: Visit for Fatima Begum (34, melasma + post-acne scars) with 7 medicines, 4 investigations ticked (e.g. CBC, TSH, Vitamin D, Serum Ferritin) and an "Additional Advice" custom section ("Strict sun protection, reapply SPF 50 every 3 hours")
**Ideal path**: 3 — open preview, switch to a compact layout, print
**Alternate paths**: Margins can be changed in three places — preview "Top margin"/"Bottom margin" sliders, Customization tab "Top/Bottom/Left/Right Margin (px)", and the "Printer profile" select (profiles cannot be created from the UI). Print format exists twice — footer "Print" select (Table/Text) and preview "Print Format". Page breaks only in the preview.

### Steps
1. In the builder click "Print Preview" → two pages render; "Page Navigation 1 / 2" appears with "← Prev", "Next →", "Go to:".
2. Click "Next →" → sees only the signature and follow-up spilled to page 2.
3. Tick "Space-optimized layout" → help "Inline headers for patient info, vitals, diagnosis…Forces Rx table format."; "Print Format" locks to Table; pagination re-runs ("Processing pagination...").
4. Change "Line spacing" from Normal to Compact → still 2 pages; change to Tight → 1 page; navigation block disappears.
5. Drag "Bottom margin" down from the letterhead minimum → value in mm changes, but with the bundled letterhead pagination keeps ≥86 px bottom / 200 px top reserved, so the slider below that has no effect. She clicks "Reset margins".
6. Untick "Avoid breaks inside tables" to let the Rx table split, re-check page count.
7. Use "Zoom" slider at 80% to eyeball the whole page; click "Print".

### Variations
- Text format: untick Space-optimized and pick "Text" in "Print Format" → medicines print as numbered sentences instead of a table.
- "Break before Signature" ticked deliberately for a two-page consent-style printout.
- "Live Preview: On/Off" toggled off to stop re-pagination while editing in the builder.
- "Letterhead" → "None (Plain)" for printing on pre-printed stationery; top/bottom margin floors no longer apply.

### Edge Cases
- Paged.js throws → toast "Pagination Error"; "Print" then fails with "Print failed — No paginated preview is ready yet."
- Clicking Print/PDF while "Processing pagination..." is shown: buttons are disabled.
- "Printer profile" dropdown is empty for every seed doctor because no UI creates profiles.

---

## STORY-004: New doctor sets up signature and letterhead before her first OPD

**Type**: short
**Topic**: prescriptions-print-share
**Persona**: Dr. Shravya on her first day, not technical
**Goal**: Make printed prescriptions carry her own letterhead and signature
**Preconditions**: Logged in as `shravya@clinic.test`; PNG scans `shravya-sign.png` (300 KB, transparent) and `shravya-letterhead-A4.jpg` (2.1 MB)
**Ideal path**: 3 — open settings, upload signature, upload letterhead (both save immediately)
**Alternate paths**: Customization tab in a visit → "Print Background Image URL (optional)" + "Choose File" → "Save Doctor Default" / "Load Doctor Default" (stores `rxPrintProfile` in the user's metadata). This is a second, differently-behaving letterhead mechanism; a custom background URL overrides the uploaded letterhead (`prescription-letterhead.ts:12`). Signature has no alternate route (generic `POST /prescriptions/assets` refuses SIGNATURE).

### Steps
1. Click the gear "Open settings" in the header → "My Settings" dialog shows "Doctor signature", "Prescription letterhead", availability and WhatsApp sections.
2. Under "Doctor signature" choose `shravya-sign.png` via "Upload signature" → status "Saving signature…" then "Signature saved." and a preview image.
3. Under "Prescription letterhead" choose `shravya-letterhead-A4.jpg` → "Letterhead saved.".
4. Click "Close" (both uploads already saved; the dialog's "Save" only stores WhatsApp preferences — she hesitates, unsure whether she must press Save).
5. Open any visit → Prescription → "Print Preview" → "Letterhead (doctor's own)" in the Letterhead select; tick "Show signature".

### Variations
- Replace: label switches to "Replace signature"/"Replace letterhead"; "Remove signature" leaves "No signature uploaded. Space is left for signing by hand."
- Dr. Praneeta with no upload sees "Clinic-supplied letterhead." (bundled) and label "Letterhead (Dr. Praneeta Jain)".

### Edge Cases
- 3 MB signature or a PDF → "Choose a PNG or JPG image up to 2 MB." (letterhead: 5 MB).
- ADMIN/RECEPTION opening "My Settings" get an empty dialog with only "Close"/"Save" (doctor sections are DOCTOR-only).
- Signature fetch fails in preview → "Could not load the doctor's signature…" with "Retry"; Print then fails "The signature image could not be loaded. Please retry."

---

## STORY-005: Emailing the prescription PDF to a patient who left without the printout

**Type**: medium
**Topic**: prescriptions-print-share
**Persona**: Dr. Shravya between patients
**Goal**: Email Arjun Rao his prescription PDF
**Preconditions**: Arjun's visit has a saved prescription; patient email arjun.rao19@gmail.com on file
**Ideal path**: 2 — open preview, click Email
**Alternate paths**: "PDF via WhatsApp" (STORY-006); "Download PDF" then attach manually from Gmail. Backend `POST /prescriptions/:id/share` (server-rendered pdfkit PDF) exists but no UI calls it.

### Steps
1. Open visit → Prescription → "Print Preview".
2. Hover "Email" → if the Rx were unsaved the tooltip would say "Save the prescription first" and the button is greyed; here it is enabled.
3. Click "Email" → label "Sending…"; visit and Rx are re-saved, the preview is captured to PDF and posted to `/prescriptions/:id/share-preview`.
4. Toast "Email sent — Prescription PDF sent by email." She tells Arjun to check his inbox.

### Variations
- Unsaved Rx: Email stays disabled while "Print", "Download PDF" and "PDF via WhatsApp" are enabled and auto-save — inconsistent gating; she must click the green "Save Prescription" first.
- Show signature ticked → signature included in the emailed PDF.

### Edge Cases
- No email on file → "Email failed — Patient has no email address on file." (she must leave the visit, edit the patient, return).
- SMTP not configured on the server: backend logs "SMTP is not configured; skipping email", still records an `EMAIL_SHARE` print event and returns `QUEUED`; UI shows "Email sent" although nothing was sent (see Defects).
- PDF > 15 MB (huge letterhead) → 400 "A valid prescription PDF up to 15 MB is required." → "Email failed".

---

## STORY-006: Sending the prescription on WhatsApp from the desktop

**Type**: medium
**Topic**: prescriptions-print-share
**Persona**: Dr. Praneeta, whose patients prefer WhatsApp
**Goal**: Get the PDF into Srinivas Goud's WhatsApp (tinea cruris, phone 9849012345)
**Preconditions**: Visit with saved Rx (template "Tinea (Fungal) — Topical + Hygiene" + Itraconazole 200 mg); desktop Chrome (no Web Share with files); WhatsApp Web logged in on the clinic PC
**Ideal path**: 2 — open preview, click "PDF via WhatsApp" (a configured provider could send directly)
**Alternate paths**: Patients row "WhatsApp" action sends only an appointment reminder, not the Rx. Backend `sharePrescription` WhatsApp channel (Cloud API) has no UI.

### Steps
1. Open "Print Preview", click "PDF via WhatsApp" (tooltip "Saves the latest visit details before exporting").
2. Toast "Generating PDF…", PDF downloads as `prescription-<id>.pdf`, a new tab opens `https://wa.me/9849012345?text=Hi, please find your prescription attached.`
3. Toast "PDF downloaded — Attach the downloaded PDF in the WhatsApp chat that just opened." She drags the PDF from Downloads into the chat.
4. She hesitates: wa.me opened a chat for the wrong country (the 10-digit number has no 91 prefix) — she edits the number by hand to 919849012345.

### Variations
- Android tablet / phone browser: `navigator.share` sheet appears with the PDF; picking WhatsApp → toast "Shared — Prescription shared successfully."; cancelling the sheet silently returns.
- Phone stored as +91 98490 12345 → wa.me link works first time.

### Edge Cases
- No phone on file → "No phone number — Patient has no phone number on file." (only after the visit has already been re-saved).
- An event `WHATSAPP_SHARE` is logged before the share sheet opens, even if the doctor cancels it.
- PDF capture fails → "WhatsApp failed — Could not share prescription PDF."

---

## STORY-007: Building a reusable melasma template and cleaning up old ones

**Type**: medium
**Topic**: prescriptions-print-share
**Persona**: Dr. Praneeta, who sees 15 melasma follow-ups a week
**Goal**: Save her standard Kligman-style regimen as a template, save a fields-only template, and delete an outdated one
**Preconditions**: A visit where the builder holds Hydroquinone 2% + Tretinoin 0.025% + Mometasone cream, Sunscreen SPF 50, Tranexamic acid 250 mg; diagnosis "Melasma – centrofacial", morphology "Macule"
**Ideal path**: 3 for save (Save current → name → Save Template); 2 for delete
**Alternate paths**: Three creation routes — "Save current" (→ "Save as Template"), "Save fields" (→ "Save Fields as Template", items excluded), "New template" (→ "Create New Template" dialog with its own drug search, morphology/distribution/skin-concern chips). Backend template versioning/approval endpoints have no UI.

### Steps
1. In the templates bar click "Save current" → "Save as Template" dialog ("Provide a name to reuse this prescription layout later.").
2. Type "Melasma – Kligman + TXA" and click "Save Template" → toast "Template saved"; dropdown now lists it under "Saved templates".
3. Click "Save fields" → "Save Fields as Template" dialog says "…as a reusable template on this device." Name "Derm Fields: Melasma follow-up", click "Save Fields Template" → toast "Fields template saved — Template stored on server." (copy contradicts the dialog).
4. Click "New template" → "Create New Template"; enter Name "Tinea – oral + topical", Diagnosis "Tinea corporis", add Itraconazole 200 mg via the dialog's search "Add", click the create button → "Template created — New template is ready to use."
5. Open "Templates", hover an old entry "Acne old 2024", click its trash icon ("Delete template") → deleted immediately with toast "Template deleted" — no confirmation.
6. Click "Refresh" to re-pull the list; "Undo"/"Redo" exist but do not restore a deleted template.

### Variations
- Applying a template to a non-empty table replaces rows; "Reset to default" (red) wipes all rows and follow-up text without confirmation (recoverable via "Undo").
- "No template" entry resets selection only, it does not clear rows.

### Edge Cases
- Duplicate name (case-insensitive, branch-wide) → 409; inline "A template with this name already exists."; dialog stays open.
- Blank name → "Template name required" toast + inline "Template name is required".
- Templates beyond the newest 50 never appear (`limit: 50`, no paging).
- Dr. Shravya can delete Dr. Praneeta's template with one click — no owner check.
- Template load fails → "Could not load templates — Default templates are still available."

---

## STORY-008: Reception bills the medicines after the doctor's handoff

**Type**: short
**Topic**: prescriptions-print-share
**Persona**: Reception (`reception@clinic.test`) at the front desk, which doubles as the pharmacy till
**Goal**: Pick up Arjun's prescription without walking to the doctor's room
**Preconditions**: Dr. Shravya created the Rx and clicked "Stay Here" (STORY-001 step 12)
**Ideal path**: 3 — open Pharmacy Billing, Load the queued Rx, review
**Alternate paths**: Doctor-side handoff ("Yes, go to Pharmacy" / footer "Go to Pharmacy") lands on the same Billing panel on the doctor's screen; Pharmacy Counter "Rx queue" → "Open bill"/"Start billing"; Inventory → Sales → "Counter sales".

### Steps
1. Sidebar "Pharmacy Billing" → `/dashboard/pharmacy?section=billing`, header "Pharmacy Billing".
2. In the prescription dispensing queue find "Arjun Rao" and click "Load" → bill region scrolls into view; patient, doctor and the three Rx lines prefill in "New Pharmacy Invoice with Packages".
3. Review "Prescription directions" lines vs. the printout Arjun hands over (same data on a second surface).

### Variations
- The doctor's own screen after "Yes, go to Pharmacy": DOCTOR has no Pharmacy sidebar links yet the page loads (backend universal) — she is now outside the clinical nav and must use Back.

### Edge Cases
- RECEPTION confirming checkout hits ADMIN/PHARMACIST-only invoice endpoints (403) — covered in pharmacy-counter-billing topic.
- Doctor used the footer "Go to Pharmacy" before saving → no prescription in queue and an empty bill.

---

## STORY-009: Quick follow-up using last visit's medicines and treatment suggestions

**Type**: short
**Topic**: prescriptions-print-share
**Persona**: Dr. Shravya at Arjun's 4-week review, wants to be done in under a minute
**Goal**: Re-issue last month's regimen with one change
**Preconditions**: Arjun has a completed visit with a prescription 4 weeks ago
**Ideal path**: 3 — reuse last meds, edit one row, create
**Alternate paths**: "Reuse last meds" button; "Treatment suggestions" → "Reapply learned plan" / "Fill missing only"; selecting the saved template; "Recent meds:" chips (per patient, else global).

### Steps
1. Open the new visit → Prescription; type Diagnosis "Acne vulgaris – improving" → "Treatment suggestions" card shows the matched plan, "Combo / Review / Labs / Evidence" tiles and "Matched on …".
2. Click "Reuse last meds" ("Adding...") → toast "Previous medications added".
3. Remove Doxycycline via its row "Remove" button; click "Create Prescription" → "Prescription created".

### Variations
- "Reapply learned plan" instead → rows, review date and labs prefilled; "Undo autofill" appears.
- With rows already filled, "Fill missing only" → toast "Missing fields filled" (or "Already covered").

### Edge Cases
- First-ever visit → "No previous medications found — Could not find medications in the last visits for this patient."
- History API fails → "Unable to load previous medications"; suggestion card shows an amber error line.

---

## STORY-010: Prescribing a brand that is not in the drug master, with a custom dosing pattern

**Type**: short
**Topic**: prescriptions-print-share
**Persona**: Dr. Praneeta prescribing a new isotretinoin brand a rep left samples of
**Goal**: Add "Isotroin 20" (Cipla) and a "Alternate Days" frequency
**Preconditions**: Drug not present in `/prescriptions/drugs/autocomplete` results
**Ideal path**: 4 — open add-drug dialog, fill name+manufacturer, save, pick custom frequency
**Alternate paths**: Pharmacy Desk → "Drug Management" → "Add New Drug" (`/dashboard/pharmacy/drugs`, not reachable from DOCTOR's sidebar); or simply type the free-text name in the row without adding to the master.

### Steps
1. Click "+ Add to Drug Database" (shown for ADMIN/PHARMACIST/DOCTOR) → "Add Drug to Database" dialog.
2. Enter name "Isotroin 20", manufacturer "Cipla", price 245, pack "10 capsules"; click "Save & Add" → toast "Drug added — Drug saved to database and added to prescription."; a new row appears.
3. In the row's frequency select choose "+ Custom..." → "Add Custom Frequency" (placeholder "e.g., Alternate Days, Twice Weekly", hint "Stored in uppercase with underscores."); type "Alternate Days", click "Add & Apply".
4. Set "When" = "After Dinner", Duration 8 WEEKS.

### Variations
- "+ Custom..." on "When" → "Add Custom Timing" (e.g., "After Snack"); on duration unit → "Add Custom Duration Unit" (e.g., "Applications"). Custom values are stored in this browser only.

### Edge Cases
- Missing manufacturer → "Missing details — Name and Manufacturer are required."
- Same name+manufacturer exists → "Duplicate detected".
- The added row carries only the name, not the new drug's id, so stock/regimen lookup and pharmacy matching treat it as free text.

---

## STORY-011: Reprinting an old prescription from the visit history

**Type**: short
**Topic**: prescriptions-print-share
**Persona**: Dr. Shravya, asked by a patient for a copy of last month's prescription for insurance
**Goal**: Print the earlier prescription without editing anything
**Preconditions**: Patient has a past visit with a prescription
**Ideal path**: 3 — find the visit, open its prescription, print
**Alternate paths**: Visits page right panel "Patient History" → "View Prescription" → "Prescription Details" → "Print"; or open that past visit (resume) → Prescription tab → "Print Preview" → "Print" (re-saves the visit first). Patient detail History tab and MedicalVisitForm History tab show "n Rx Items" but no print action.

### Steps
1. `/dashboard/visits`, select the patient in "Start New Visit" search → "Patient History" panel lists visits with "Refresh" and "n Records".
2. Click "View Prescription" on the 12 Oct visit → "Prescription Details" dialog ("Review the medications and instructions issued during this visit.") with "Prescription Overview".
3. Click "Print" → browser print of the whole dashboard page (sidebar, header and the page behind the modal), not a letterhead prescription. She gives up and uses the alternate route.

### Variations
- Alternate route through the old visit gives the proper Paged.js letterhead printout but mutates/saves the old visit.

### Edge Cases
- "Loading prescription…" then "Unable to load prescription. Please try again."
- "No documented history to show" for a new patient.

---

## STORY-012: Non-doctor roles look for the prescription controls

**Type**: short
**Topic**: prescriptions-print-share
**Persona**: Nurse or Reception staff asked by a patient to "print my prescription again"
**Goal**: Find out whether they can reprint or share an Rx
**Preconditions**: Logged in as `reception@clinic.test` (a NURSE account behaves the same in the visit form)
**Ideal path**: 2 — open the visit, reach a print action (if role allowed)
**Alternate paths**: Pharmacy Billing loads the Rx lines (RECEPTION) but has no prescription print; "Prescription Details" Print on Visits page (no Visits sidebar link for RECEPTION).

### Steps
1. From Appointments click "Start Visit" on the patient's tile → MedicalVisitForm shows only Overview / Photos / History (RECEPTION) or Overview / Vitals / Photos / History (NURSE); no Prescription tab.
2. Open History tab → past visit card shows "3 Rx Items" but no print/share button.

### Variations
- ADMIN (`admin@clinic.test`) sees the full builder and can create prescriptions on a doctor's behalf; signature shown is the prescribing doctor's.

### Edge Cases
- The backend share/print-event/PDF endpoints have no role restriction, so the UI restriction is the only barrier.

---

## Defects noticed while mapping

1. **Email share reports success when SMTP is not configured.** `NotificationsService.sendEmail` logs and returns when no transporter (`backend/src/modules/notifications/notifications.service.ts:120-123`); `sharePrescriptionPreview` then records an `EMAIL_SHARE` event and returns `{status:'QUEUED'}` (`backend/src/modules/prescriptions/prescriptions.service.ts:1483-1489`); UI toasts "Email sent" (`frontend/src/components/visits/PrescriptionBuilder.tsx:6215-6216`). Same silent-skip for WhatsApp in `sendWhatsAppDocument` (`notifications.service.ts:172-180`).
2. **"PDF via WhatsApp" builds wa.me links without a country code.** `wa.me/${digits}` uses the raw patient phone (`PrescriptionBuilder.tsx:6261-6262`); patients are stored as 10-digit local numbers (DTO allows it, `backend/src/modules/patients/dto/create-patient.dto.ts:32`; seed `backend/scripts/seed.ts:204` `9000001000`), so WhatsApp opens the wrong country (e.g. "90…" = Turkey).
3. **WHATSAPP_SHARE print event recorded before sharing happens.** Event posted at `PrescriptionBuilder.tsx:6246`, before `navigator.share` (6252) or the wa.me fallback; a cancelled share (AbortError, 6268) still counts as shared.
4. **Footer "Go to Pharmacy" hands off without saving.** Button shown whenever `validItems.length > 0` and navigates via `window.location.href` with only `visitId` (`PrescriptionBuilder.tsx:5463-5474`); billing loads only `visit.prescription` (`frontend/src/components/pharmacy/PharmacyInvoiceBuilderFixed.tsx:653-658`), so an unsaved Rx produces an empty bill. The post-create dialog uses a different URL with `prescriptionId` and no `visitId` (`PrescriptionBuilder.tsx:6750`).
5. **Any doctor can delete any branch template with one click.** Trash icon calls delete with no confirm (`PrescriptionBuilder.tsx:2962-2969`); backend checks only branch, not creator (`prescriptions.service.ts:1022-1040`).
6. **"Save Fields as Template" copy says "on this device" but saves a public server template.** Dialog text `PrescriptionBuilder.tsx:6686` vs. server POST with `isPublic: true` and toast "Template stored on server." (`:2994`, `:3014-3016`).
7. **Prescription Details "Print" prints the whole dashboard.** `onPrint={() => window.print()}` (`frontend/src/app/dashboard/visits/page.tsx:449`); the only print CSS injected there hides `.no-print` (`visits/page.tsx:1159`, `frontend/src/lib/printStyles.ts:19`), and no layout element carries that class.
8. **Share/PDF/print-event endpoints have no role guard.** `POST /prescriptions/:id/pdf|share|share-preview|print-events` lack `@Roles` (`backend/src/modules/prescriptions/prescriptions.controller.ts:376-412`), and `RolesGuard` allows any authenticated user when no roles metadata is present (`backend/src/shared/guards/roles.guard.ts:16-18`). Any role, including PATIENT portal users, can email any branch prescription to an arbitrary address.
9. **"Add to Drug Database" row loses the new drug's id.** The created drug's `id` is not copied into the new row (`PrescriptionBuilder.tsx:347-362`), so stock lookup and pharmacy matching treat it as free text.
10. **"Printer profile" select is dead UI.** It lists only existing profiles (`PrescriptionBuilder.tsx:6163-6175`). `apiClient.upsertPrinterProfile` (`frontend/src/lib/api.ts:1035`) is never called, so no user can create a profile and the dropdown is always empty.
11. **"Refill stamp" prints "Refill eligible" unconditionally.** The stamp depends only on the checkbox (`PrescriptionBuilder.tsx:3993-4007`). It never checks the prescription's refill allowance, and refills have no UI.
12. **"High contrast" leaks app-wide.** It toggles `document.body.classList` (`PrescriptionBuilder.tsx:6281`) with no pressed state and no cleanup when the preview closes, so the whole app stays in high-contrast after "Close".
13. **Email button is gated differently from the other exports.** Email is disabled until the prescription has been saved (`PrescriptionBuilder.tsx:6206`). It then runs `saveBeforeExport` anyway, as Print, Download PDF and WhatsApp do without that gate (`:6232`, `:6287`). This is friction rather than breakage.
