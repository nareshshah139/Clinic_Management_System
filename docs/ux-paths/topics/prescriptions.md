# Prescription writing, printing & sharing

> Source of truth for every label below is the code, mainly
> `frontend/src/components/visits/PrescriptionBuilder.tsx` (the builder is mounted only inside the
> visit form: `frontend/src/components/visits/MedicalVisitForm.tsx:2353`, tab `Prescription`).
> Only DOCTOR / ADMIN / OWNER see the tab. Items marked *(inferred)* were deduced from logic rather
> than read as a literal string. Line numbers are for orientation and may drift.
>
> Shared precondition for most stories ("visit open"): the doctor is signed in and has a visit open
> at `/dashboard/visits?patientId=…&appointmentId=…&autoStart=true`, then clicks the `Prescription`
> tab. The builder page, top to bottom, is: Templates bar → "Clinical Details & Vitals" → "Chief
> Complaints" → "Diagnosis" → "Patient History" → "On Examination" → "Treatment" → "Procedures" →
> "Investigations" → custom sections + `Add Custom Section` → "Basic Information" (Language,
> Follow-up Instructions) → "Review Date" → footer (`Print` format select, `Print Preview`,
> `Create Prescription`, `Go to Pharmacy`).

---

## STORY-001: Add one medicine by search and take the usual regimen

**Type**: short
**Topic**: Prescription writing, printing & sharing
**Persona**: Dr. Kavya Reddy, dermatologist, mid-morning OPD with six patients waiting
**Goal**: Add Doxycycline to the Treatment table with the frequency and duration she normally uses
**Preconditions**: Visit open on the `Prescription` tab for Rohan Verma (27 M). "Doxycycline 100mg Capsule" exists in the drug master with stock. She has prescribed it before, so regimen defaults exist.
**Ideal path**: 2 — type a few letters and pick the match; the usual regimen should arrive already filled and need no confirmation.
**Alternate paths**: (a) `Recent meds:` chip above the table (fills the active row by name); (b) `Reuse last meds` (STORY-002); (c) apply a template (STORY-005); (d) the automatic "Treatment suggestions" learned plan once a diagnosis is typed (STORY-006); (e) type a free-text name and never pick from the list — any row with a non-empty name counts as a medicine; (f) `+ Add to Drug Database` when the product is missing; (g) frequency/duration can be set three ways: the per-row dropdowns, the `Presets:` chips (`1-0-1`, `0-1-0`, `1-1-1`, `HS`, `5d`, `7d`, `14d`, `4w`), or `+ Custom...` inside each dropdown.

### Steps
1. In the "Treatment" card click `Add Row` → the table stops showing "No items added yet"; a blank row appears with the cursor in the Medicine field (placeholder "Search medicine name...").
2. Type `doxy` → after the second character a blue-bordered dropdown opens under the field: "Searching…", then results. The first row carries a green `Best Match` badge, the next two a blue `High Match` badge; each shows manufacturer • pack size, "Stock: 60" and a `Select` button.
3. Click the "Doxycycline 100mg Capsule" row (or its `Select` button) → the name fills, the "Stock: 60" hint shows beside the field, a new blank row is appended underneath, and "Loading usual values…" appears under the name.
4. Wait about a second → Frequency, When, Duration and Instructions fill in, each with a small underlined link `Suggested · Accept` beneath it (hover: "Suggested from your prescriptions in the last 12 months"). She hesitates: are these values already applied, or only applied if she clicks Accept? (They are already in the row; Accept only removes the hint.)
5. Change Duration from 14 to 21 by typing in the `#` box → the hint under Duration disappears because the field is now "touched"; the other three hints stay until clicked or edited.

### Variations
- **Preset chips**: instead of the dropdowns she clicks `1-0-1` then `14d` in the `Presets:` strip. They apply to the last-focused row, so if she clicked into the new blank row first the preset lands on the wrong (empty) row.
- **Custom frequency**: Frequency dropdown → `+ Custom...` → dialog "Add Custom Dose Pattern" ("Enter a custom option. It will be saved for future use.", hint "Stored in lowercase.") → type `1-0-0 alternate days` → `Add & Apply`. The option is stored in this browser's `localStorage`, not on the server, so it is missing on another PC.
- **Recent meds chip**: clicking a `Recent meds:` chip writes that medicine into the active row. If the active row already holds a medicine it is replaced, not added.
- **Keyboard**: pressing Enter in the Medicine field inserts a blank row below; it does not choose the `Best Match`. There is no arrow-key navigation of the result list, so a mouse click is required.

### Edge Cases
- **No match**: dropdown shows "No results found". She can keep the typed text as a free-text medicine (no stock, no usual values) or use `+ Add to Drug Database`.
- **Low stock**: stock of 5 or less renders in red in both the dropdown and the row; nothing blocks prescribing.
- **Regimen lookup fails**: "Suggestions unavailable. Enter values or select the medicine again to retry." under the name; the row stays editable.
- **Retyping the name**: editing the medicine text after selection clears the linked drug/inventory identity and wipes any still-"Suggested" values (accepted or edited ones are kept).
- **Strength missing**: a result can show an amber "Strength missing" line; still selectable.
- **Double click**: a second selection of the same drug within 600 ms is ignored (guards a double add).

---

## STORY-002: Repeat the last visit's medicines for a follow-up

**Type**: short
**Topic**: Prescription writing, printing & sharing
**Persona**: Dr. Kavya Reddy, dermatologist, reviewing a returning psoriasis patient
**Goal**: Bring forward the medicines from Meenakshi Nair's previous visit, extend one duration, and save
**Preconditions**: Meenakshi Nair (46 F) has an earlier visit with a saved prescription. A new visit is open; the Treatment table is empty.
**Ideal path**: 2 — one "repeat last prescription" action, then save.
**Alternate paths**: (a) the learned plan often does the same thing automatically: once a diagnosis is typed and the table is empty, "Treatment suggestions" may prefill with the label "Auto-filled from this patient’s last similar plan" (STORY-006); (b) `Recent meds:` chips (names only, one row at a time); (c) visit `History` tab to read the old prescription and retype; (d) a saved template. The concept is called "Reuse last meds" on the button, "Previous medications" in the toast, "last plan" in the suggestions panel.

### Steps
1. Click the `Prescription` tab → builder loads; Treatment shows "Total items: 0" and "No items added yet".
2. Click `Reuse last meds` → button reads "Adding..." → toast "Previous medications added — Added 3 items from the last visit." Three rows appear plus a trailing blank row.
3. In the "Clobetasol Propionate Cream 0.05%" row change Duration from 2 to 4 (unit stays WEEKS).
4. Click `Create Prescription` → toast "Prescription created — 3 medications recorded for the patient." and the dialog "Go to Pharmacy?" opens ("3 medications were added to this prescription. Continue to the pharmacy module to bill them now?").
5. Click `Stay Here` → dialog closes; she stays on the visit.

### Variations
- **Table not empty**: the button merges rather than replaces. Rows identical in name + frequency + dose pattern + when + duration are skipped; anything else is appended, so a medicine she already typed with a different duration appears twice.
- **Drop one medicine**: click the trash icon in the row's Actions cell (tooltip "Remove {medicine name}"); no confirmation.
- **Only investigations/follow-up needed again**: this button copies medicines only; the learned plan (STORY-006) is the route that also restores investigations and follow-up.

### Edge Cases
- **No earlier prescription**: toast "No previous medications found — Could not find medications in the last visits for this patient."
- **History fails to load**: toast "Unable to load previous medications" with the server message.
- **"Last" means the nearest earlier visit that has prescription items**, not necessarily the immediately preceding visit (e.g. a photo-only procedure visit is skipped).
- **Saving twice**: clicking `Create Prescription` again updates the same prescription (toast "Prescription updated") but the button label never changes from "Create Prescription", and the "Go to Pharmacy?" dialog opens again.

---

## STORY-003: Dictate the chief complaint instead of typing

**Type**: short
**Topic**: Prescription writing, printing & sharing
**Persona**: Dr. Arjun Mehta, dermatologist, slow typist, evening clinic
**Goal**: Capture the patient's complaint by voice into "Chief Complaints"
**Preconditions**: Visit open on the `Prescription` tab. Laptop microphone available; the server has an OpenAI key configured.
**Ideal path**: 2 — tap mic, tap again to stop; text lands in the field.
**Alternate paths**: (a) type, helped by the autocomplete list that drops under the Chief Complaints box while it has focus; (b) `Skin Concerns` chips directly under the field (Acne, Pigmentation, Aging, Dryness, Sensitivity, Redness, Scarring); (c) apply a template, which also sets Chief Complaints. A second mic exists only on "On Examination" → "Detailed Examination". `/test-transcribe` (sidebar Admin → "Test Transcribe") uses the same transcription service but its text cannot be sent to a visit — it is a test bench, not a route to this goal.

### Steps
1. In the "Chief Complaints" card click the microphone button to the right of the text box (tooltip "Start voice input") → on first use the browser asks for microphone permission.
2. Click `Allow` in the browser prompt → the button turns red with a crossed-mic icon (tooltip "Stop voice input"); recording has started. There is no timer or level meter.
3. He and the patient talk for ~20 seconds ("itching and red scaly patches on both elbows for three months, worse in winter"), then he clicks the red button → it becomes a spinner (tooltip "Transcribing recording"); the other mic button is disabled meanwhile.
4. A few seconds later the text is appended to whatever was already in the box, and the card turns green with the badge "Has Data" and "Auto-included in preview". He fixes one mis-heard word by hand.

### Variations
- **Examination findings**: the mic beside "Detailed Examination" works the same way but inserts the full transcript, whereas the Chief Complaints mic prefers the patient's side of the conversation when the service separates speakers (so the doctor's own spoken summary may be dropped) *(inferred from `pickSpeechToTextInsert`, `frontend/src/lib/speech-to-text.ts`)*.
- **Dictating twice**: a second recording is appended after a space, never replacing the first.
- **Checking the mic first**: on `/test-transcribe` ("Voice Transcription Test") he can `Start Recording`, watch "Audio Level", `Stop Recording`, `Transcribe`, and read tabs `Combined` / `By Speaker` / `Segments`. That page is outside the dashboard shell (no sidebar; `Back to dashboard`).

### Edge Cases
- **Permission denied**: toast "Microphone access denied" with the browser's message.
- **Unsupported browser**: toast "Voice capture unavailable — Microphone recording is not supported in this browser."
- **Silence**: toast "No speech detected — The recording may have been too quiet or contained only silence. Try speaking louder and closer to the microphone."
- **Service error / no API key**: toast "Speech-to-text error" with a status-specific message; nothing is inserted and the recording is lost.
- **Forgotten recording**: it stops by itself after 10 minutes and is then transcribed.
- **Other fields**: Diagnosis, the four history boxes, Procedures, medicine Instructions, Follow-up and custom sections have no mic.

---

## STORY-004: Send the finished prescription to the pharmacy bill

**Type**: short
**Topic**: Prescription writing, printing & sharing
**Persona**: Dr. Kavya Reddy, dermatologist, finishing a consultation while the patient gathers her things
**Goal**: Save the prescription and open a pharmacy bill already filled with its medicines
**Preconditions**: Visit open; Treatment has three medicines for Sneha Iyer (31 F, 98490 55512). Nothing saved yet.
**Ideal path**: 1 — one "save and send to pharmacy" action; the pharmacist should not need the doctor to open the bill at all.
**Alternate paths**: (a) footer `Go to Pharmacy` (shown once there is at least one medicine) → Sales bill with `patientId`, `doctorId`, `visitId` — no prescription id, and **it does not save first**; (b) Pharmacy Counter → "Prescription Queue" row `Bill`; (c) Counter cockpit `Start billing`; (d) Sales → `New sale` → prescription queue row `Load`; (e) patient detail progress tracker `Bill`; (f) from the preview, `Save Prescription` then `Close` then footer `Go to Pharmacy` (the preview's save never offers the pharmacy dialog).

### Steps
1. Click `Create Prescription` in the builder footer → toast "Prescription created — 3 medications recorded for the patient."; dialog "Go to Pharmacy?" — "3 medications were added to this prescription. Continue to the pharmacy module to bill them now?" with `Stay Here` / `Yes, go to Pharmacy`.
2. Click `Yes, go to Pharmacy` → full page navigation to `/dashboard/pharmacy/sales/bill?patientId=…&prescriptionId=…&doctorId=…`.
3. On the Sales bill, check that "Patient & Doctor Details" shows Sneha Iyer and Dr. Kavya Reddy and that "Invoice Items" lists the three prescribed medicines (with any stock warnings). From here the bill belongs to the pharmacy flow.

### Variations
- **Doctor only wants the pharmacist to see it**: click `Stay Here`; the saved prescription still appears in the Pharmacy Counter "Prescription Queue" and at the top of a new Sales bill without any hand-off click.
- **Naming along the way**: the dialog says "pharmacy module", the button says "Pharmacy", the destination page is the "Sales" bill whose headings say "Invoice".

### Edge Cases
- **Footer `Go to Pharmacy` before saving**: the bill opens with patient and doctor set and loads only what is already saved on the visit. Medicines typed but never saved are not on the bill (they remain only in the browser draft `rxDraft:{patientId}:{visitId}`), and nothing warns her.
- **Tele-video visit without consent ticked**: `Create Prescription` shows the destructive toast "Patient consent required" and nothing is saved.
- **Visit changed in another tab (409)**: toast "Visit changed elsewhere" / "Clinical save conflict"; no dialog, no hand-off, the local draft is preserved.
- **Session expired**: toast "Signed out — Your session expired. Log in again and retry."
- **No medicines**: `Create Prescription` is disabled; a prescription with only investigations/advice cannot be created or handed off.

---

## STORY-005: Start from a template, adjust it, and save it as her own

**Type**: medium
**Topic**: Prescription writing, printing & sharing
**Persona**: Dr. Kavya Reddy, dermatologist, third tinea case of the day
**Goal**: Fill the prescription from the tinea template, add an oral antifungal, and keep the result as a reusable template
**Preconditions**: Visit open on the `Prescription` tab for Imran Sheikh (38 M). She has already typed a line in Chief Complaints. Templates have loaded (the bar shows the dropdown rather than "Templates will appear once loaded.").
**Ideal path**: 5 — pick template, add one medicine, name-and-save template, save prescription (two clicks for name + confirm).
**Alternate paths**: Three template-saving routes sit side by side: `Save current` (medicines + complaint + diagnosis + examination), `Save fields` (complaint + diagnosis + examination only, no medicines), `New template` (a blank form in a large dialog, independent of the current visit). For prefilling: the learned plan (STORY-006) can also fill Treatment from a saved template, where it is called a "saved order set"; `Reuse last meds`; manual entry.

### Steps
1. Click the `Templates` dropdown (currently "Select a template") → list: `No template`; group "Saved templates" (each with a small trash icon); group "Default templates": "Acne (Mild) — Topical regimen", "Tinea (Fungal) — Topical + Hygiene", "Eczema — Emollients + Low-potency steroid".
2. Click "Tinea (Fungal) — Topical + Hygiene" → with no confirmation the builder is overwritten: Chief Complaints becomes "Itchy annular rash in folds", Diagnosis "Tinea corporis", On Examination gets skin type IV, Morphology Plaque + Scale, Distribution Flexures, Itch Score 5, "Detailed Examination" text; Treatment shows "Clotrimazole Cream 1%" twice daily for 4 WEEKS plus a blank row. Past/Medication/Menstrual/Family history, Investigations and Procedures are cleared as well.
3. She notices her own typed complaint is gone and clicks `Undo` → the medicine rows revert, but Chief Complaints, Diagnosis and the examination fields stay as the template set them (Undo/Redo only track medicine rows and Follow-up Instructions). She clicks `Redo` to get the template's medicine back.
4. Retype the complaint in "Chief Complaints": "Itchy ring-shaped rash in both groins for 3 weeks, spreading".
5. In the blank Treatment row type `itra` and click "Itraconazole 100mg Capsule" in the dropdown.
6. Set Frequency to `1-0-1` from the dropdown (options are dose patterns shown in capitals: 1-0-0, 0-1-0 … Q8H, PRN).
7. Set When to `After Breakfast`.
8. Click the `14d` preset chip → Duration becomes 14 DAYS on that row.
9. In "Basic Information" click the chip `Follow up in 14 days` → Follow-up Instructions fills and "Review Date" jumps to today + 14 days.
10. Scroll back to the top and click `Save current` → dialog "Save as Template" ("Provide a name to reuse this prescription layout later.", placeholder "Dermatology follow-up").
11. Type `Tinea cruris — topical + itraconazole 2 wk` and click `Save Template` → toast "Template saved — Prescription template stored for future visits."; the name now appears under "Saved templates".
12. Click `Create Prescription` → toast "Prescription created — 2 medications recorded for the patient."; dialog "Go to Pharmacy?" → `Stay Here`.

### Variations
- **Fields-only template**: `Save fields` → dialog "Save Fields as Template" ("Save only Chief Complaints, Diagnosis, and Examination as a reusable template on this device.") → name → `Save Fields Template` → toast "Fields template saved — Template stored on server." The dialog says "on this device"; the toast says "on server".
- **Template from scratch**: `New template` → dialog "Create New Template" ("Define a reusable template for Chief Complaints, Diagnosis, On Examination, and Treatment."): Name, Chief Complaints, Diagnosis, On Examination ("General Appearance", Skin Type, Itch Score, Morphology / Distribution / Skin Concerns chips), "Add Medicine" search ("Search drug name or brand (min 2 chars)" with an `Add` button per result), `Add Row`, then `Create Template` → toast "Template created — New template is ready to use." In this dialog the medicine table has both a "Dose pattern" and a "Frequency" control per row, while the main table has one combined "Frequency" control; the same examination text is labelled "General Appearance" here and "Detailed Examination" in the builder.
- **Delete a saved template**: open the dropdown and click the trash icon (tooltip "Delete template") → it is deleted immediately, toast "Template deleted". No confirmation, and templates are saved as public, so it disappears for other doctors too *(inferred from `isPublic: true`)*.
- **Clear everything**: the red `Reset to default` button empties the medicine rows and Follow-up Instructions and deletes the local draft, with no confirmation. It does not restore any "default" content.

### Edge Cases
- **Duplicate name**: inline red text "A template with this name already exists." under the name box plus toast "Duplicate name"; the dialog stays open.
- **Empty name**: toast "Template name required" and inline "Template name is required".
- **Template list fails to load**: toast "Could not load templates — Default templates are still available."; `Refresh` retries.
- **What `Save current` leaves out**: investigations, histories, procedures, follow-up, review date and custom sections are not stored, yet applying any template clears investigations/histories/procedures. Re-applying her saved template shows the oral medicine's Frequency as `TWICE_DAILY` rather than the `1-0-1` she picked, because the dose pattern is not saved with the template *(inferred from `persistTemplate`, lines 3122–3164, and `applyTemplateToBuilder`, lines 2799–2882)*.
- **Server/timeout error on save**: toast "Server error" / "Request timed out" with a `Retry` action.
- **Selecting `No template`**: only resets the dropdown label; it does not undo what a template filled in.

---

## STORY-006: Let the diagnosis prefill the treatment, then take control back

**Type**: medium
**Topic**: Prescription writing, printing & sharing
**Persona**: Dr. Kavya Reddy, dermatologist, who has written "acne vulgaris" prescriptions dozens of times
**Goal**: Use the automatic treatment suggestion for a new acne patient, but with her own choice of antibiotic
**Preconditions**: Visit open for Ananya Sharma (24 F), Treatment empty. Dr. Reddy has several earlier prescriptions with the diagnosis "Acne vulgaris".
**Ideal path**: 3 — enter diagnosis, glance at the proposed plan, accept it (edits optional).
**Alternate paths**: Templates dropdown (STORY-005); `Reuse last meds` (STORY-002); per-medicine "Suggested · Accept" regimen defaults (STORY-001); manual rows. The same feature is called "Treatment suggestions" (panel badge), "learned plan" (`Reapply learned plan`), "autofill" (`Undo autofill`, "Autofill paused…"), "quick-fill" (`Undo quick-fill`) and "prefilled" (title text); its source labels call templates "saved order set".

### Steps
1. Look at the dark "Treatment suggestions" panel at the top of the "Treatment" card → title "Enter a diagnosis to see treatment suggestions."; the four tiles `Combo`, `Review`, `Labs`, `Evidence` show "—".
2. In the "Diagnosis" card type `Acne vul` → a suggestion list drops down; click "Acne vulgaris" → the card turns green ("Has Data", "Auto-included in preview").
3. Watch the panel: "Reading recent plans, patterns, and saved order sets…" pulses, then, without any click, the title becomes "Treatment prefilled from previous plans" with chips "Learned from 6 similar prescriptions", "Practice-backed" and "Matched on Acne vulgaris"; pills list the medicines; tiles read Combo 3 / Review 42d / Labs 0 / Evidence 6. The Treatment table now holds three rows, Follow-up Instructions and Review Date are filled.
4. She did not ask for this and pauses to read the rows: Adapalene Gel 0.1%, Benzoyl Peroxide Gel 2.5%, Azithromycin 500mg Tablet.
5. She prefers doxycycline: click the trash icon on the Azithromycin row (tooltip "Remove Azithromycin 500mg Tablet") → the panel title changes to "Customized after autofill." ("The suggested regimen is still available, but your edits now take precedence.").
6. In the blank row type `doxy`, click "Doxycycline 100mg Capsule" → usual values load with "Suggested · Accept" hints.
7. Change her mind about the follow-up interval: under "Review Date" click the `30d` chip (the chips offered here are `6w`, `7d`, `2w`, `3w`, `30d`) → the date moves to today + 30 days. Follow-up Instructions keeps its earlier "Follow up in 6 weeks" because the chip only writes the text when it is empty — the two now disagree until she edits the text.
8. Edit "Follow-up Instructions" to `Follow up in 30 days`.
9. Click `Create Prescription` → toast "Prescription created — 3 medications recorded for the patient."; dialog "Go to Pharmacy?" → `Stay Here`.

### Variations
- **She had already typed medicines before the diagnosis**: nothing is overwritten; the panel says "Learned plan ready. Your manual edits were preserved." and offers `Reapply learned plan` (replace everything) and `Fill missing only` (toast "Missing fields filled — The learned plan only filled blank treatment details and missing medications.").
- **Reject the prefill**: click `Undo autofill` → the table returns to its previous state and the panel reads "Autofill paused for this diagnosis." until she clicks `Reapply learned plan` or changes the diagnosis.
- **`Fill missing only` with nothing to add**: toast "Already covered — The current treatment already includes the learned plan details."
- **Returning patient**: the source chip reads "Auto-filled from this patient’s last similar plan", overlapping with `Reuse last meds`.

### Edge Cases
- **No pattern**: "No strong pattern yet for this diagnosis." with the hint to "Keep building manually once."
- **History partly unavailable**: amber note "Some practice pattern signals are temporarily unavailable." or title "Pattern learning is partially offline right now."
- **Changing the diagnosis text while the table is still exactly as auto-filled**: the table is replaced again by the plan for the new diagnosis, silently *(inferred from the auto-apply effect, lines 2229–2233)*.
- **Second diagnosis entry point**: the "Dermatology Diagnoses" chips inside "On Examination" (Acne vulgaris, Atopic dermatitis, Psoriasis …) are saved into the same diagnosis list as the "Diagnosis" box but do not drive the suggestions panel.
- **Investigations suggested by the plan** are ticked in the "Investigations" card further down the page, out of sight of the Treatment card.

---

## STORY-007: Print the prescription in Telugu for a patient who does not read English

**Type**: medium
**Topic**: Prescription writing, printing & sharing
**Persona**: Dr. Kavya Reddy, dermatologist; patient Lakshmamma (58 F) from Nalgonda reads only Telugu
**Goal**: Hand over a printed prescription whose advice and instructions are in Telugu
**Preconditions**: Visit open; diagnosis, two medicines with English instructions, and follow-up are filled. Server translation (OpenAI) is configured.
**Ideal path**: 3 — choose Telugu, preview, print.
**Alternate paths**: none found for triggering translation — it runs only when `Print Preview` is clicked with Language ≠ English. (The API also exposes `prescriptions/translations` "translation memory" endpoints, but the builder calls `POST /visits/translate`.)

### Steps
1. Scroll to "Basic Information" near the bottom of the builder (below Investigations and any custom sections).
2. Open the `Language` select (English / Telugu / Hindi) and choose `Telugu` → a blue box appears: "Translation enabled — On print preview, free‑form fields will be translated to Telugu. This includes: Diagnosis, Chief complaints, Histories, Family history (other), Post‑procedure care, Procedures, Procedure planned, Investigations, Custom sections, and per‑medication notes. Medication names, numbers, and units remain unchanged." Small translate icons appear beside the free-text labels and the Investigations card title becomes "Investigations (translates)".
3. Scroll up to Treatment and rewrite the shorthand in each Instructions cell as full sentences ("Apply a thin layer on the affected area and 2 cm beyond", "Take after food"), since only this column of the medicine table is translated.
4. Click `Add Custom Section` → a card appears with Section Title prefilled "Additional Advice" and an empty Content box.
5. Type in Content: `Keep the area dry. Do not share towels. Wash clothes in hot water.`
6. Click `Print Preview` in the footer → the button reads "Preparing…"; toast "Translating… — Preparing 7 field(s) in Telugu"; then the full-screen "Prescription Preview" opens.
7. Read the page: diagnosis, complaint, advice, follow-up and the Instructions column are in Telugu; medicine names are unchanged; the labels ("Rx", "Medicine / Frequency / When / Duration / Instructions", "Review Date", "Follow-up Instructions") and the values in Frequency / When / Duration (e.g. "1-0-1", "After Breakfast", "4 weeks") stay in English. She wonders whether the patient will understand "After Breakfast".
8. One Telugu phrase reads oddly: click `Close`, fix the English sentence, click `Print Preview` again → only because the text changed, a new translation request is made (unchanged content is served from an in-memory cache).
9. Click `Print` → the visit and prescription are saved first (toast "Prescription created — 2 medications recorded for the patient."), then the browser print dialog opens; print.

### Variations
- **Hindi**: identical with `Hindi`; toast reads "…in Hindi".
- **Custom "When" in Telugu**: she can add her own timing text via When → `+ Custom...` → "Add Custom Timing" and type it in Telugu herself; it prints as typed.
- **English prescriptions**: every click of `Print Preview` shows a toast "Print Preview — Language is English. Skipping translation." before the preview opens.

### Edge Cases
- **Translation service down / no key**: the preview still opens with the original English text and the warning toast "Translation unavailable — Showing original text. Check server OPENAI_API_KEY and network." (server-configuration wording shown to the doctor).
- **Language is per visit draft**: the choice is stored in the local draft for this patient + visit and sent with the saved prescription; the next patient starts in English again.
- **Stale copy**: the blue box lists "Post‑procedure care", a field that no longer exists in the builder.
- **Partial translation response**: any field without a returned translation prints in English beside translated ones.
- **Nothing to translate** (no free text at all): preview opens untranslated with no message.

---

## STORY-008: Fit the prescription on one pre-printed letterhead page, signed

**Type**: medium
**Topic**: Prescription writing, printing & sharing
**Persona**: Dr. Arjun Mehta, visiting dermatologist who prints on pre-printed clinic stationery
**Goal**: Print a five-medicine prescription on a single sheet, clear of the pre-printed header and footer, with his signature image
**Preconditions**: Visit open with five medicines, investigations and follow-up filled for Farhan Qureshi (52 M). His signature is already uploaded (STORY-009). An A4 printer is loaded with pre-printed letterhead paper.
**Ideal path**: 3 — open preview (remembering his last layout), confirm it fits, print.
**Alternate paths**: Margins can be set in four places: the preview sliders `Top margin` / `Bottom margin` (per visit), the visit's `Customization` tab ("Top/Bottom/Left/Right Margin (px)", saved for the doctor with `Save Doctor Default`), a `Printer profile` (selectable in the preview; no screen to create one was found), and an enforced minimum when the built-in letterhead is used. Letterhead can be chosen in three places: header cog → "My Settings" → "Prescription letterhead"; `Customization` → "Print Background Image URL (optional)" / `Choose File`; preview `Letterhead` select. Print format is selectable both in the builder footer (`Print` → Table / Text) and in the preview ("Print Format").

### Steps
1. Click `Print Preview` in the builder footer → toast "Print Preview — Language is English. Skipping translation."; the full-screen "Prescription Preview" opens: paginated pages on the left, a controls column on the right starting with the "📋 Print Settings Tip" box. "Processing pagination..." shows briefly; a pill reads "Page 1 of 2".
2. In the `Letterhead` select change "Letterhead (doctor's own)" to `None (Plain)` so the background image is not printed over the pre-printed paper (helper text: "Applies to preview and PDF download.").
3. Drag the `Top margin` slider right until the readout shows about 53 mm, so the text starts below the pre-printed header.
4. Drag `Bottom margin` to about 23 mm for the pre-printed footer strip.
5. Tick `Fit to 1 page` → "Space-optimized layout", "Line spacing" and the four "Break before …" boxes grey out; after re-pagination the status line reads "Fits on 1 page with text at 12.5 px." and the page pill disappears.
6. Tick `Show signature` → his signature image appears bottom-right above "Dr. Arjun Mehta" (helper: "Remembered for this doctor on this browser. Applies to print, PDF, WhatsApp and Email.").
7. Use the `Zoom` slider (60–140 %) to check the bottom edge of the page against the footer area.
8. Click `Interactions` → dialog "Interaction Summary" ("Preview potential interactions based on current items.") lists pairs with Severity and Recommendation, or "No interactions found." → `Close`.
9. Click `Print` → the visit and prescription are saved (toast "Prescription created — 5 medications recorded for the patient."), then the browser print dialog opens.
10. In the browser dialog open "More settings" and switch off "Headers and footers" as the tip box instructs, then print.
11. Back in the app click `Close` to leave the preview.

### Variations
- **Clinic letterhead image instead of pre-printed paper**: leave `Letterhead` on "Letterhead (doctor's own)" (or "(Dr. Praneeta Jain)" for the bundled one, "(Custom)" for a Customization URL, "(none uploaded)" when there is none). With the bundled letterhead the top margin cannot go below 200 px (about 53 mm) and the bottom below 86 px, whatever the sliders say.
- **Just tighter, not shrunk**: tick `Space-optimized layout` ("Inline headers for patient info, vitals, diagnosis, histories, and procedures. Forces Rx table format.") and/or set "Line spacing" to Compact or Tight instead of Fit to 1 page.
- **Force a page split**: tick `Break before Rx`, `Break before Investigations`, `Break before Follow-up` or `Break before Signature`.
- **Keep margins for every patient**: go to the visit's `Customization` tab, type the margins in px, click `Save Doctor Default` (toast "Saved — Doctor profile updated"); they load automatically for his future visits.
- **Other toggles in the column**: `Refill stamp`, `High contrast`, `Live Preview: Off/On`, `Reset margins`.

### Edge Cases
- **Too much content**: amber status "Too much content for one page at a readable size. Printing on 2 pages with text at 11 px." — text is never shrunk below 11 px.
- **Settings do not carry over**: `Fit to 1 page`, `Space-optimized layout`, Line spacing and Print Format reset every time the builder is reloaded; slider margins, letterhead choice, page breaks and refill stamp are stored only in this patient-and-visit draft. Only `Show signature` is remembered per doctor (in this browser). For the next patient he repeats steps 2–5 unless he used the Customization tab.
- **Slider units**: the sliders move in pixels (0–300 and 0–200) while the readout is in mm.
- **No signature uploaded**: the checkbox is disabled with "No signature uploaded. The doctor can add one in My Settings → Doctor signature."; a blank signing space is printed.
- **Signature fails to load**: red text "Could not load the doctor’s signature. Retry before printing with a signature." with a `Retry` link; at print time, toast "Print failed — The signature image could not be loaded. Please retry."
- **Printing before pagination finishes**: `Print` is disabled while "Processing pagination..."; if no page is ready, toast "Print failed — No paginated preview is ready yet."
- **Pagination crash**: toast "Pagination Error — Failed to process document. Please check your content and try again."
- **`Live Preview: On`**: an effect reopens the preview whenever it is closed while this is on, so `Close` appears not to work until he toggles it back to Off *(inferred from lines 3433–3435)*.
- **Printing always saves**: `Print` writes the prescription (and visit) to the server first; a save failure ("Save required before export" or a conflict toast) blocks printing entirely.

---

## STORY-009: One-time set-up of signature and letterhead

**Type**: medium
**Topic**: Prescription writing, printing & sharing
**Persona**: Dr. Arjun Mehta, newly joined dermatologist, first day, before his first patient
**Goal**: Make his prescriptions print on his own letterhead with his signature
**Preconditions**: Signed in with role DOCTOR on a desktop (the header cog is hidden on mobile). He has `mehta-signature.png` (transparent, 180 KB) and `mehta-letterhead-a4.jpg` (1.9 MB) on the computer.
**Ideal path**: 4 — open settings, upload signature, upload letterhead, done (signature shown by default afterwards).
**Alternate paths**: Letterhead: (a) "My Settings" → "Prescription letterhead" (server-stored, per doctor); (b) visit → `Customization` tab → "Print Background Image URL (optional)" with `Choose File` / `Clear` (kept in this browser per doctor) and "Per-doctor Letterhead Profile" → `Save Doctor Default` / `Load Doctor Default` (stored on the user record); (c) preview `Letterhead` select to switch it off for one print. Signature: "My Settings" only — an admin cannot upload it for him ("Only you can change your signature.").

### Steps
1. Click the cog icon in the top header (accessible name "Open settings") → dialog "My Settings" opens with sections "Doctor signature", "Prescription letterhead", working hours and WhatsApp options.
2. In "Doctor signature" read: "Upload your signature, then select “Show signature” in Print Preview. PNG or JPG, up to 2 MB. Transparent backgrounds are supported." Below: "No signature uploaded. Space is left for signing by hand."
3. Click the file input labelled "Upload signature" and choose `mehta-signature.png` → status "Saving signature…" then "Signature saved."; a preview of the image appears; the label changes to "Replace signature" and a `Remove signature` button appears.
4. In "Prescription letterhead" read: "Your prescriptions print on this full-page image. Use an A4 portrait PNG or JPG, up to 5 MB." Below: "No letterhead uploaded. Prescriptions print on plain paper."
5. Click "Upload letterhead" and choose `mehta-letterhead-a4.jpg` → "Saving letterhead…" then "Letterhead saved."; thumbnail shown; `Remove letterhead` appears.
6. He sees `Close` and `Save` at the bottom and is unsure whether the uploads need `Save` (each section says "Changes save immediately."). He clicks `Save` anyway (it saves the working-hours and WhatsApp options, not the uploads).
7. Open his first visit and click the `Prescription` tab; add one medicine (STORY-001) so there is something to print.
8. Click `Print Preview` → the page shows his letterhead as the background; the `Letterhead` select reads "Letterhead (doctor's own)". The signature is **not** shown.
9. Tick `Show signature` in the right column → the signature appears above "Dr. Arjun Mehta"; this choice is now remembered for him on this browser.
10. The body text overlaps the letterhead's logo band: drag `Top margin` until the text clears it (or set "Top Margin (px)" in the `Customization` tab and `Save Doctor Default` so it sticks — see STORY-008).

### Variations
- **Replace later**: choosing a new file under "Replace signature" / "Replace letterhead" swaps it immediately; an open preview picks up the change.
- **Clinic-supplied letterhead**: for the doctor who has the bundled image, the section shows the thumbnail with "Clinic-supplied letterhead." and the preview label is "Letterhead (Dr. Praneeta Jain)".
- **One-off background**: in `Customization`, `Choose File` embeds an image for this browser only and overrides the uploaded letterhead (preview label "Letterhead (Custom)"); `Clear` returns to his own letterhead.

### Edge Cases
- **Wrong type or too large**: "Choose a PNG or JPG image up to 2 MB." (signature) / "…up to 5 MB." (letterhead); nothing is uploaded.
- **Signature load failure in settings**: "Could not load your signature. Please retry." with `Reload signature`.
- **Different computer**: the uploaded files follow him, but `Show signature` is per browser, so on another PC the signature is hidden again until re-ticked.
- **Non-doctor roles**: "My Settings" has no signature/letterhead sections; an admin writing a prescription on a doctor's visit gets that doctor's letterhead and signature but cannot change them.
- **Naming**: the same image is "Prescription letterhead" (settings), "Print Background Image" (Customization), "Letterhead" (preview) and part of a "Per-doctor Letterhead Profile" that actually stores margins and offsets too. The header's `Branded` toggle is unrelated — it only recolours the app.

---

## STORY-010: Share the prescription by WhatsApp, e-mail and PDF

**Type**: medium
**Topic**: Prescription writing, printing & sharing
**Persona**: Dr. Kavya Reddy, dermatologist, finishing a tele-video review on her clinic desktop
**Goal**: Get the prescription PDF to Priya Menon (29 F, phone 98661 20347, priya.menon@example.com) on WhatsApp and e-mail, and keep a copy
**Preconditions**: Tele-video visit open with "Patient consented to tele-video consultation" ticked; three medicines and a follow-up instruction entered; nothing saved yet. Desktop Chrome with WhatsApp Web signed in. SMTP configured on the server.
**Ideal path**: 3 — open preview, send on WhatsApp (delivered with the PDF attached), send by e-mail.
**Alternate paths**: none found inside this topic for sending a prescription other than the preview buttons. Related but different: Patients → `More` → `WhatsApp` sends an appointment reminder; the Sales register `Send on WhatsApp` sends a bill message. The server has unused routes for the same goal — `POST /prescriptions/:id/share` (WhatsApp or e-mail, server-rendered PDF) and the WhatsApp branch of `:id/share-preview` — and the Users → WhatsApp Template Editor has a "Prescription Share" touchpoint; the preview's WhatsApp button uses none of them. Saving can happen by four routes: footer `Create Prescription`, preview `Save Prescription`, or implicitly through `Print`, `Download PDF` and `PDF via WhatsApp`.

### Steps
1. Click `Print Preview` → the full-screen preview opens; the header strip shows "Priya Menon • Dr. Kavya Reddy", "Date: … • Consultation: Tele-video" and chips "Rx: 3", "Investigations: 0", "Follow-up: Yes"; the page ends with the tele-video disclaimer above the signature block.
2. Hover `Email` → it is greyed out with the tooltip "Save the prescription first". (`PDF via WhatsApp` and `Download PDF` are enabled and say "Saves the latest visit details before exporting".)
3. Click the green `Save Prescription` → "Saving…" → toast "Prescription created — 3 medications recorded for the patient."; `Email` becomes active. No "Go to Pharmacy?" dialog appears from here.
4. Click `PDF via WhatsApp` → the prescription is saved again (toast "Prescription updated"), toast "Generating PDF…  — Preparing prescription for WhatsApp.", then `prescription-<id>.pdf` lands in Downloads and a new browser tab opens `wa.me/<patient digits>` with the draft message "Hi, please find your prescription attached."; toast "PDF downloaded — Attach the downloaded PDF in the WhatsApp chat that just opened."
5. In the WhatsApp tab click "Continue to chat" / open WhatsApp Web (WhatsApp's own screens).
6. Click the paper-clip, choose Document, pick the downloaded PDF from Downloads and send.
7. Switch back to the ClinicMS tab.
8. Click `Email` → button reads "Sending…"; the prescription is saved once more, the PDF is rendered and uploaded; toast "Email sent — Prescription PDF sent by email." (subject "Your Prescription", body "Your prescription is attached.").
9. Click `Download PDF` → another save, toast "Generating PDF… — Capturing prescription preview.", file `prescription-<id>.pdf` downloads, toast "PDF ready — Prescription PDF downloaded." (she now has two identical files in Downloads).
10. Click `Close`.

### Variations
- **On a phone or tablet** (browser supports file sharing): `PDF via WhatsApp` opens the device share sheet with the PDF attached (title "Prescription", text "Your prescription is ready."); she picks WhatsApp and the contact herself; toast "Shared — Prescription shared successfully." Cancelling the sheet shows nothing.
- **Signature and letterhead in the shared file**: the PDF is an image capture of the on-screen preview, so whatever is set in the right column (`Letterhead`, `Show signature`, Fit to 1 page, language) is exactly what is sent.
- **Send to a relative's number**: not possible here — recipient phone and e-mail are taken from the patient record; there is no field to type another.

### Edge Cases
- **No phone on file**: toast "No phone number — Patient has no phone number on file." (after the save has already happened).
- **Phone stored without country code**: the link is built from the stored digits as they are; no "91" is added in this handler, so a 10-digit number may open the wrong or no chat *(inferred from line 6421–6422)*.
- **No e-mail on file**: toast "Email failed — Patient has no email address on file."
- **SMTP/server failure**: toast "Email failed" with the server message; the prescription stays saved.
- **Tele-video consent not ticked**: every save/export is refused with "Patient consent required" (or "Save required before export").
- **Save conflict (409)**: the export is abandoned with "Visit changed elsewhere" / "Clinical save conflict"; nothing is printed, downloaded or sent.
- **PDF render failure**: toast "PDF failed — Could not generate PDF. Your saved details are retained; please retry." or "WhatsApp failed — Could not share prescription PDF."
- **Pop-up blocker**: the PDF downloads but the WhatsApp tab may be blocked; the toast still says a chat "just opened".
- **Shared PDFs are rasterised pages** (text cannot be selected or searched by the patient) — see `docs/PRESCRIPTION_PDF_PIPELINE.md`.
- **No medicines**: `Save Prescription` reads "Add medications to save" and is disabled; `Email` stays disabled, while WhatsApp/Download still export a visit summary named after the visit id.

---

## STORY-011: New acne patient — complete prescription from blank page to pharmacy bill

**Type**: long
**Topic**: Prescription writing, printing & sharing
**Persona**: Dr. Kavya Reddy, dermatologist, first consultation of a new patient on a Saturday morning
**Goal**: Document the consultation, prescribe four medicines (one not yet in the drug master), order hormone tests, give written advice, print and WhatsApp the prescription, and pass it to the pharmacy
**Preconditions**: Ananya Sharma (24 F, phone 98480 12345) was booked and the visit started from the appointment (`Start Visit`). In-person consultation. Dr. Reddy's signature and letterhead are uploaded and `Show signature` was ticked on this browser earlier. The nurse has not entered vitals.
**Ideal path**: 14 — complaint, diagnosis (plan prefills), confirm plan, add two medicines (2 actions each), add the missing product (1 dialog), tick tests, advice, follow-up, preview, one "save + print + send + hand to pharmacy" action each (4). Examination chips are optional extras.
**Alternate paths**: Vitals can instead be entered on the visit's `Vitals` tab; investigations on the `Lab Tests` tab; procedures on the Procedures page; medicines via template / `Reuse last meds` / learned plan / manual; saving via `Create Prescription`, `Save Prescription` or any export button; pharmacy hand-off via the post-create dialog, footer `Go to Pharmacy`, or the pharmacy's own queues (STORY-004).

### Steps
1. In the visit form click the `Prescription` tab → the builder shows the Templates bar ("Select a template") and the section cards; the Treatment panel says "Enter a diagnosis to see treatment suggestions."
2. In "Clinical Details & Vitals" type Height `162`, Weight `58` → BMI shows 22.1 (read-only); type BP (Sys) `110`, BP (Dia) `70`, Pulse (bpm) `78`. (These are the same vitals as the separate `Vitals` tab.)
3. In "Chief Complaints" click the microphone (tooltip "Start voice input"); the browser already has permission, so the button turns red at once.
4. Let the patient describe the problem, then click the red button → spinner → the text "pimples on cheeks and jawline for one year, worse before periods, leaves dark marks" is inserted; the card turns green ("Has Data").
5. Click the `Acne` and `Scarring` chips under "Skin Concerns" (2 clicks).
6. In "Diagnosis" type `Acne vul` and click "Acne vulgaris" in the list.
7. Glance at Treatment: the panel pulses "Reading recent plans, patterns, and saved order sets…" and then prefills on its own — title "Treatment prefilled from previous plans", chips "Learned from 6 similar prescriptions" / "Practice-backed", rows Adapalene Gel 0.1% and Benzoyl Peroxide Gel 2.5%, Follow-up Instructions "Follow up in 6 weeks" and a Review Date. She decides to keep it and continue with the history first.
8. In "Patient History" type Past History `No previous isotretinoin`, Menstrual History `Irregular cycles, 40–45 days`, tick Family History `Thyroid`, and type Personal history `Uses heavy foundation daily; night shifts` (4 entries).
9. In "On Examination" (expand it if collapsed) choose Fitzpatrick Skin Type `IV`, type Acne Severity `moderate`, click Morphology chips `Comedo`, `Papule`, `Pustule`, Distribution chip `Face`, and the "Dermatology Diagnoses" chip `Acne vulgaris` (7 actions). She notices the diagnosis is now entered in two places.
10. Back in Treatment, click into the blank last row, type `doxy` and click "Doxycycline 100mg Capsule" (Stock: 60) → usual values load with "Suggested · Accept" hints.
11. Change Duration to `6` and the unit to `WEEKS` (2 actions).
12. In the next blank row type `Photostable SPF 50` → dropdown: "No results found".
13. Click `+ Add to Drug Database` (above the table) → dialog "Add Drug to Database" ("Quickly add a new drug record and insert into this prescription."). The form is empty — what she just typed in the row is not carried over.
14. Fill Name `Photostable SPF 50 Sunscreen Gel 50g`, Manufacturer `Sun Pharmaceuticals`, Price (₹) `675`, Pack Size Label `tube of 50 g`.
15. Click `Save & Add` → toast "Drug added — Drug saved to database and added to prescription."; a **new** row with the product is appended at the bottom, while the row where she typed "Photostable SPF 50" is still there as a free-text medicine.
16. Click the trash icon on the stray free-text row (tooltip "Remove Photostable SPF 50").
17. On the sunscreen row choose Frequency `1-1-0`.
18. Open When → `+ Custom...` → dialog "Add Custom Timing" (hint "Stored as entered.") → type `Before stepping out` → `Add & Apply` (3 actions).
19. Type Instructions `Two finger-lengths on face and neck; reapply every 3 hours outdoors`.
20. In "Investigations" tick `Total Testosterone`, `S. Prolactin` and `TSH` (3 clicks). (The separate `Lab Tests` tab has its own test checklist.)
21. In "Add Custom Investigation" type `DHEAS` and click `Add` → it is ticked and added to the clinic's saved list (visible under "Manage saved investigations").
22. Click `Add Custom Section` → a card with Section Title "Additional Advice"; type Content `Do not pick or squeeze lesions. Avoid oil-based cosmetics. Wash face twice daily with a gentle cleanser.`
23. In "Basic Information" confirm Follow-up Instructions reads "Follow up in 6 weeks" and "Review Date" shows the date six weeks out (both came from the prefill); leave Language on English.
24. Click `Print Preview` → toast "Print Preview — Language is English. Skipping translation."; full-screen preview; "Processing pagination..."; pill "Page 1 of 2".
25. Tick `Fit to 1 page` → status "Fits on 1 page with text at 13 px."; the signature is already showing because `Show signature` is remembered.
26. Click `Interactions` → dialog "Interaction Summary" → "No interactions found." → `Close` (2 clicks).
27. Click the green `Save Prescription` → "Saving…" → toast "Prescription created — 4 medications recorded for the patient."
28. Click `Print` → saved again (toast "Prescription updated"), browser print dialog opens → print → hand the sheet to the patient.
29. Click `PDF via WhatsApp` → saved a third time, PDF downloads, WhatsApp opens in a new tab with "Hi, please find your prescription attached." → attach the downloaded file and send (3 actions in WhatsApp), then return to the ClinicMS tab.
30. Click `Close` to leave the preview → back on the builder; the footer shows "Total items: 4 • Total qty: …".
31. Click `Go to Pharmacy` in the footer → navigates to `/dashboard/pharmacy/sales/bill?patientId=…&doctorId=…&visitId=…`; the bill shows Ananya Sharma, Dr. Kavya Reddy and the four prescribed lines; the just-created sunscreen has no inventory batch yet, so it is expected to carry a stock warning *(inferred)*.
32. Tell the pharmacist the bill is open — or simply leave it: the prescription is also waiting in the Pharmacy Counter "Prescription Queue".

### Variations
- **Save from the builder instead of the preview**: skip step 27, `Close` the preview and click `Create Prescription` → dialog "Go to Pharmacy?" → `Yes, go to Pharmacy`, which carries the prescription id and replaces step 31.
- **Telugu-speaking patient**: before step 24 set `Language` to Telugu (STORY-007); steps 24–29 then use the translated preview.
- **Template start**: at step 1 pick "Acne (Mild) — Topical regimen" from `Templates` instead of waiting for the suggestion panel; note it would also overwrite anything already typed in complaint/diagnosis/examination.
- **Interrupted by a phone call**: she can leave the page; the builder writes a local draft 600 ms after each change and on tab hide/unload, and restores it when the same patient + visit is reopened on the same browser.
- **Nurse already recorded vitals**: step 2 is skipped; the values appear in the print from the visit record.

### Edge Cases
- **Duplicate drug**: at step 15, if a drug with the same name and manufacturer exists: toast "Duplicate detected — A drug with the same name and manufacturer already exists."; missing name/manufacturer: "Missing details — Name and Manufacturer are required."
- **Prefill arrives while she is typing a first medicine**: if she starts a row before the diagnosis suggestion lands, nothing is overwritten and the panel reads "Learned plan ready. Your manual edits were preserved."
- **"Total qty" stays 0**: the footer total sums a quantity field that has no input in the table, so the pharmacy receives duration and frequency but no doctor-entered quantity.
- **"Detailed Examination" text** is saved with the visit but is not printed on the prescription (see `docs/PRESCRIPTION_PDF_PIPELINE.md`).
- **Three saves, one prescription**: steps 27–29 each call save; the second and third are updates of the same record ("Prescription updated"), each with its own toast.
- **Visit completion**: merely opening the preview (step 24) marks the "prescription" section complete for the visit's progress bar, before anything is saved *(inferred from `onPreview`, `MedicalVisitForm.tsx:2433`)*.
- **Network drop at step 27**: toast "Connection timed out — Network was slow while saving. Please retry in a few seconds."; the draft stays in the browser and print/WhatsApp/e-mail are blocked until a save succeeds.
- **Another device edited the visit**: toast "Visit changed elsewhere"; the visit form's conflict gate takes over and exports are refused.

---

## Redundancy notes

**Duplicate paths to the same goal**

- **Filling the medicine table — six mechanisms on one card**: per-row search, `Recent meds:` chips, `Presets:` chips, `Reuse last meds`, the auto-applying "Treatment suggestions" learned plan, and the Templates bar above (`PrescriptionBuilder.tsx:4519–4575`, `4981–5188`, `1876–1937`, `2032–2233`). `Reuse last meds` and the learned plan's "Auto-filled from this patient’s last similar plan" (`lib/prescription-learning.ts:524–528`) largely do the same job.
- **Regimen defaults at three levels**: per-medicine "Suggested · Accept" (`lib/medicine-regimen-defaults.ts`, builder `2292–2362`), whole-plan autofill, and templates — each with its own accept/undo vocabulary.
- **Three "save as template" buttons**: `Save current`, `Save fields`, `New template` (`4571–4573`; dialogs `6928–6987`, `6844–6894`, `6508–6843`).
- **Saving the prescription — four triggers, three labels**: footer `Create Prescription` (opens "Go to Pharmacy?"), preview `Save Prescription` (does not), and implicit saves inside `Print`, `Download PDF`, `PDF via WhatsApp` and `Email` (`2631–2797`, `5591`, `6350–6356`). `Email` alone requires a prior explicit save (tooltip "Save the prescription first", `6363–6383`) although it also auto-saves once enabled.
- **Pharmacy hand-off — two buttons on one screen with different payloads**: dialog `Yes, go to Pharmacy` sends `prescriptionId`; footer `Go to Pharmacy` sends `visitId` and does not save first (`5594–5604`, `6896–6926`; consumer `components/pharmacy/PharmacyInvoiceBuilderFixed.tsx:708–769`). Plus the pharmacy-side queues listed in discovery lead A.7.
- **Margins in four places**: preview sliders (`6222–6250`), visit `Customization` tab px inputs and `Save Doctor Default` (`MedicalVisitForm.tsx:2479–2490`, `2576–2632`), `Printer profile` select (`6321–6333`; `upsertPrinterProfile` in `lib/api.ts:1065` is never called from a component, so no creation screen exists), and the built-in letterhead minimum (`lib/prescription-letterhead.ts:42–53`). Precedence is slider > printer profile > Customization (`3267–3274`).
- **Letterhead in three places**: "My Settings" upload (`components/users/DoctorLetterheadSettings.tsx`), Customization "Print Background Image URL" + `Choose File` (`MedicalVisitForm.tsx:2453–2477`), preview `Letterhead` select (`6298–6310`).
- **Print format select rendered twice**: builder footer (`5558–5569`) and preview sidebar "Print Format" (`6286–6297`), bound to the same state.
- **Two PDF renderers, two share back-ends**: the UI rasterises the on-screen preview (`renderPreviewPdf`, `3407–3425`); the server also has PDFKit `POST /prescriptions/:id/pdf` and `:id/share` (`backend/src/modules/prescriptions/prescriptions.controller.ts:378–394`) which no component calls (`docs/PRESCRIPTION_PDF_PIPELINE.md` confirms the UI "still uses its browser renderer"). WhatsApp from the preview is client-only (`wa.me` / share sheet, `6390–6433`) although `share-preview` supports `channel: 'WHATSAPP'` server-side and Users has a "Prescription Share" WhatsApp template touchpoint (`components/users/UsersManagement.tsx:762`).
- **Voice transcription on two surfaces**: builder mic buttons (`hooks/useSpeechToTextRecorder.ts`, only Chief Complaints and Detailed Examination, `4698`, `4972`) and the stand-alone `/test-transcribe` page (`app/test-transcribe/page.tsx`) with far richer feedback (level meter, timer, playback, speaker tabs) than the production button.
- **Cross-topic duplicates surfaced inside the builder**: vitals ("Clinical Details & Vitals", `4586–4620`) vs the visit `Vitals` tab; "Investigations" card (`5400–5446`) vs `Lab Tests` tab; "Procedures" card vs Procedures page; diagnosis entered both in the "Diagnosis" box and via "Dermatology Diagnoses" chips in On Examination (merged at `2595–2596`).

**Same information on several surfaces**

- Stock for a medicine: search dropdown row, "Stock:" hint beside the name, and the cell tooltip "Remaining stock: …" (`5218`, `5261–5264`, `7037–7045`).
- "Total items" appears above the table (all rows, including the blank one) and in the footer (valid rows only) with different numbers (`5126`, `5556`).
- Follow-up interval is held twice — "Follow-up Instructions" text and "Review Date" — with chips on both that only partly keep each other in sync (`4496–4512`).
- Patient/doctor/date appear in the preview toolbar strip and again on the printed page; Rx / Investigations / Follow-up counts are repeated as chips (`5754–5771`).
- Success of one save is reported up to three times in one sharing session ("Prescription created", then "Prescription updated" per export).

**Naming drift**

- **Prescription / Rx / "prescription layout"**; **Create / Save / Update** for the same write ("Create Prescription", "Save Prescription", "Prescription updated", "Add medications to save").
- **Medicine / medication / drug / item / meds**: column "Medicine", toast "medications recorded", `+ Add to Drug Database`, "Total items", `Reuse last meds`, "Add Medicine" (template dialog).
- **Frequency vs dose pattern**: column "Frequency (0-1-0)" holds dose patterns; its custom dialog is "Add Custom Dose Pattern"; the template dialog shows separate "Dose pattern" and "Frequency" controls (`5271–5291`, `6688–6703`, `360–365`).
- **When / Timing**: column "When", dialog "Add Custom Timing".
- **Learned plan / Treatment suggestions / autofill / quick-fill / prefilled / saved order set** for one feature (`4395–4443`, `5085–5109`, `lib/prescription-learning.ts:564–566`).
- **Template** means prescription templates here and WhatsApp message templates in "My Settings" / Users; inside this topic: "Templates", "Saved templates", "Default templates", "Save as Template", "Fields template", "saved order set".
- **Letterhead / Print Background Image / Per-doctor Letterhead Profile / Custom**; the bundled option is labelled with a hard-coded doctor name (`801–803`).
- **Follow-up Instructions / Follow-up / Review Date / Review**; **Additional Advice** (default custom-section title) vs "Counseling" (print-section toggle and internal name) — there is no dedicated advice field.
- **Detailed Examination** (builder) vs **General Appearance** (New template dialog) for the same stored field (`4969–4972`, `6554–6555`).
- **Pharmacy / pharmacy module / Sales bill / Invoice** across the hand-off.
- **Print Preview** (button, toast) vs **Prescription Preview** (dialog title) vs **Live Preview** (toggle).
- **`Reset to default`** resets to empty, not to a default (`4569`); **`CollapsibleSection`** cards are fixed-open except "On Examination" (`164–215`).
- **Stale copy**: translation note still lists "Post‑procedure care" (`5498–5501`, UI removed at `574`); "Save Fields as Template … on this device" vs toast "Template stored on server." (`6854`, `3081`); the translation-failure toast tells the doctor to "Check server OPENAI_API_KEY" (`1113–1116`).
