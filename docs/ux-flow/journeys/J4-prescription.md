# J4 — Prescription: write, print/share, hand to pharmacy

**Journey**: a doctor writes a prescription for a new acne patient, prints it, sends it on WhatsApp/e-mail and passes it to the pharmacy.
**Stories**: STORY-062 (primary), with STORY-052, 053, 055, 056, 057, 059, 061 (`docs/ux-paths/topics/prescriptions.md`).
**Persona / data**: `doctor2` (Dr Praneeta Jain), patients "Kavya Jfour" (first prescription this doctor ever wrote for acne, then a follow-up visit) and "Rohan Jfour" (second new acne patient, so the learned plan exists). Walked live on 13 Nov 2026 at 1440×900.
**Scope**: Prescription tab, its print preview, and the hand-off. Vitals / Photos / Lab Tests tabs and the completion gate belong to another critic.

**Verdict: convoluted.** The writing part has good accelerators (diagnosis prefill, usual regimen, `Reuse last meds`, follow-up chips) and several pieces are already minimal. The friction is concentrated in three places: the missing-medicine detour, the print preview (every action button is below the fold, three "primary" buttons, 17 layout controls ahead of them) and the save / hand-off model (five different triggers that save, one of which is required before `Email`; two pharmacy buttons with different behaviour, one of which silently drops unsaved medicines).

How to read the evidence tags: **measured** = done live, counted or seen in a screenshot; **suspected** = read from code or the story only.

---

## Friction Scorecard

| Measure | Count | Notes |
|---|---|---|
| Steps — actual / ideal | **34 in-app (+ ~5 outside the app) / 14** | Story-equivalent scenario, table below. Best case today (every medicine in the drug master and prescribed before): 23. First-ever prescription for a diagnosis by this doctor (measured, Kavya): 32. |
| Decisions | 12, of which **8 a default could carry** | List below |
| Re-entry | **4** | Drug name, follow-up interval, diagnosis on a follow-up visit, PDF re-attached by hand in WhatsApp |
| Confirmations guarding nothing | **3** | "Go to Pharmacy?" dialog, browser "Leave site?" right after a save, `Suggested · Accept` ×3 per medicine. (Three destructive actions have *no* confirmation — see below.) |
| Dead ends | **4** | "No results found", after `Save Prescription`, after `PDF via WhatsApp`, footer `Go to Pharmacy` before saving |
| Hesitations | **12** | List below |

### Steps, by segment (story-equivalent: plan prefills two medicines, doctor adds one known medicine and one not in the drug master, three tests, advice, follow-up, print, WhatsApp, pharmacy)

| Segment | Ideal (story) | Actual | Evidence |
|---|---|---|---|
| Reach the builder | 0 | 1 — click `Prescription` (the visit opens on `Overview`, `MedicalVisitForm.tsx:251`); the first fold then ends at the Templates toolbar, so every field needs a scroll | measured, [01](J4-prescription-screens/01-builder-first-fold.jpg) |
| Chief complaint | 1 | 1 (typed; voice not available here) | measured |
| Diagnosis | 1 | 1 (free text, no pick list) | measured |
| Confirm the prefilled plan | 1 | 0 — it applies itself; nothing to click | measured, [03](J4-prescription-screens/03-autofill-after-diagnosis.jpg) |
| Medicine in the drug master | 2 | 3 with usual values (click field, type, click `Select`); **8** the first time the doctor prescribes it (+ Frequency open/pick, When open/pick, Duration) | measured, [04](J4-prescription-screens/04-medicine-search.jpg), [05](J4-prescription-screens/05-usual-values-suggested.jpg) |
| Medicine *not* in the drug master | 3 | **14** — click field, type, (No results found), `+ Add to Drug Database`, retype Name, Manufacturer, Price, Pack size, `Save & Add`, delete the stray free-text row, then Frequency ×2, When ×2, Duration | dialog measured ([06](J4-prescription-screens/06-add-drug-dialog.jpg)); `Save & Add` + stray row suspected (story step 15–16; not saved live to avoid polluting the shared drug master) |
| Tests | 1 | 3 (one click each) | measured |
| Advice | 1 | 2 (`Add Custom Section`, type) | measured |
| Follow-up | 1 | 0 (came with the plan; otherwise 1 chip) | measured, [08](J4-prescription-screens/08-builder-footer.jpg) |
| Open preview | 1 | 1 | measured, [09](J4-prescription-screens/09-preview-top.jpg) |
| Save | 1 | 2 — scroll the settings column ~650 px to find the buttons, `Save Prescription` | measured: buttons at y = 1281–1500 px in a 900 px viewport, [10](J4-prescription-screens/10-preview-actions.jpg) |
| Print | 1 | 1 (+ browser dialog) | measured |
| Send on WhatsApp | 1 | 1 in app + ~4 in WhatsApp (open chat, paper-clip, find the PDF in Downloads, send) | in-app measured ([11](J4-prescription-screens/11-whatsapp-after.jpg)); WhatsApp part suspected |
| Hand to pharmacy | 1 | 4 — `Close` preview, `Create Prescription` (again), `Yes, go to Pharmacy`, browser "Leave site?" | measured, [12](J4-prescription-screens/12-go-to-pharmacy-dialog.jpg), [13](J4-prescription-screens/13-pharmacy-bill.jpg) |
| **Total** | **14** (the story's stated figure; its own itemised list adds to 16) | **34** | |

Optional and not counted: `Interactions` + `Close` (2), `Show signature` (1, unticked by default for this doctor although a signature exists), `Fit to 1 page` (1).

Writes observed during one print-and-share session (measured, network log): `Save Prescription` → POST visit + POST prescription; `Print`, `PDF via WhatsApp`, `Email`, `Download PDF` each → PATCH visit + PATCH prescription; footer `Create Prescription` → PATCH prescription. **Six saves of one prescription**, with "Visit saved" / "Prescription updated" toasts repeating before each export's own toast.

### Decisions

Needed (clinical): keep or undo the prefilled plan; frequency / when / duration per medicine; which tests; language.

A default could carry these eight:
1. **Which of six ways to fill the table** — Templates bar, diagnosis plan, `Reuse last meds`, `Presets:` chips, search, `Recent meds:` — all visible at once on one card ([03](J4-prescription-screens/03-autofill-after-diagnosis.jpg)).
2. **`Suggested · Accept`** under each of three fields per medicine — the values are already in the row ([05](J4-prescription-screens/05-usual-values-suggested.jpg)).
3. **Print format `Table` / `Text`** — asked in the builder footer *and* in the preview ([08](J4-prescription-screens/08-builder-footer.jpg), [09](J4-prescription-screens/09-preview-top.jpg)).
4. **Preview layout** — 17 controls (zoom, two margins, reset, space-optimized, fit to 1 page, line spacing, print format, letterhead, five page-break boxes, printer profile, refill stamp, live preview) for a prescription that already fits one page.
5. **Save first, or just print?** — every export saves anyway.
6. **Which footer button finishes?** `Create Prescription` / `Go to Pharmacy` / `Save Draft` / `Complete Visit` within 200 px ([08](J4-prescription-screens/08-builder-footer.jpg)).
7. **"Go to Pharmacy?"** — the prescription is in the pharmacy queue either way ([14](J4-prescription-screens/14-pharmacy-unsaved.jpg) shows Kavya's row waiting without any hand-off click).
8. **Run the interaction check or not** — a safety check should not be opt-in.

### Re-entry

1. **Drug name** typed in the row is not carried into "Add Drug to Database"; the form opens empty (`PrescriptionBuilder.tsx:292–296`, comment "start with empty form"). Measured, [06](J4-prescription-screens/06-add-drug-dialog.jpg).
2. **Follow-up interval** is held twice. The `Follow up in 6 weeks` chip fills both the text and Review Date (measured: 25 Dec 2026). The chips under Review Date do not: clicking `30d` moved the date to 13 Dec while the text still said "Follow up in 6 weeks" (measured) — and both print.
3. **Diagnosis on a follow-up visit** starts blank although the Patient Context panel on the same page already shows "Recent Visits · 13 Nov 2026 · Acne vulgaris" (measured, Visit #2 for Kavya).
4. **The PDF** the app just generated has to be found in Downloads and attached by hand in WhatsApp (toast: "Attach the downloaded PDF in the WhatsApp chat that just opened.", [11](J4-prescription-screens/11-whatsapp-after.jpg)).

Not re-entry, and good: recipient phone and e-mail come from the patient record; patient/doctor arrive prefilled on the pharmacy bill.

### Confirmations

Guard nothing:
- **"Go to Pharmacy?"** after every `Create Prescription`, including a re-save, where it still says "2 medications were added" ([12](J4-prescription-screens/12-go-to-pharmacy-dialog.jpg)). It is an offer dressed as a confirmation.
- **Browser "Leave site?"** fired on `Yes, go to Pharmacy` immediately after a successful save (measured; `MedicalVisitForm.tsx:1273`, `PrescriptionBuilder.tsx:4370`).
- **`Suggested · Accept`** — clicking it only removes the hint.

Missing where one is deserved (these are the confirmations worth a step):
- **Applying a template** silently replaced the typed complaint ("Pimples on cheeks…" → "Acne lesions on face"), the diagnosis and the Doxycycline row — no dialog, no toast, and Undo does not restore the text fields (measured; `handleTemplateSelect`, `PrescriptionBuilder.tsx:3017`).
- **`Reset to default`** (red) empties the medicines and follow-up and deletes the local draft with no confirmation (`:4569`). Suspected — not clicked live.
- **Delete template** trash icon inside the menu deletes at once (`:4541–4549`). Suspected — no saved templates existed.
- **Footer `Go to Pharmacy` with unsaved medicines** — the only warning is the blank browser prompt; it does not say the medicines will not be on the bill (measured, [14](J4-prescription-screens/14-pharmacy-unsaved.jpg)).

### Dead ends

1. **"No results found"** — a one-line grey box with no action; the way out (`+ Add to Drug Database`) is a text link above the table (`:7006`). Measured.
2. **After `Save Prescription`** in the preview — a toast, and the button stays green and still says "Save Prescription" ([11](J4-prescription-screens/11-whatsapp-after.jpg)); nothing says "saved — now print / send". The pharmacy hand-off cannot be reached from the preview at all (`create(true)` skips the dialog, `:2731`).
3. **After `PDF via WhatsApp`** — a file in Downloads, a new tab, and a toast that disappears in a few seconds.
4. **Footer `Go to Pharmacy` before saving** — lands on Sales with *other patients'* prescriptions in a queue at the top and an empty bill below; the doctor's unsaved medicines are nowhere ([14](J4-prescription-screens/14-pharmacy-unsaved.jpg): Rohan's two medicines were typed; the queue shows Kavya and another critic's patient, each one `Load` click away).

### Hesitations (where a first-time doctor stalls)

1. The tab opens on a **Templates toolbar**, with red `Reset to default` and black `New template` as the two loudest things on screen ([01](J4-prescription-screens/01-builder-first-fold.jpg)).
2. **`Save current` / `Save fields`** read as "save my prescription"; they save templates.
3. **`Reset to default`** — there is no default; it clears.
4. The dark panel's tiles **COMBO / REVIEW / LABS / EVIDENCE**, and "2 meds prefilled" shown even when nothing was prefilled.
5. **`Suggested · Accept`** — applied already, or only if I click?
6. The **table header wraps** into two lines ("Medicine / Duration", "Instructions" underneath, `Actions` clipped) over two-line rows; the duration box's placeholder is `#` ([04](J4-prescription-screens/04-medicine-search.jpg)).
7. **`Presets:` chips** apply to the last-focused row — nothing shows which.
8. **Keyboard**: ↓ + Enter does not choose `Best Match`; Enter inserts a blank row (measured: the row kept the text "doxy" and a new row appeared).
9. **Two totals disagree**: "Total items: 3" above the table (counts the blank row) vs "Total items: 2 • Total qty: 0" in the footer ([03](J4-prescription-screens/03-autofill-after-diagnosis.jpg), [08](J4-prescription-screens/08-builder-footer.jpg)).
10. In the preview, **no action is visible** without scrolling the settings column ([09](J4-prescription-screens/09-preview-top.jpg)).
11. **`Email` is greyed** ("Save the prescription first") while `PDF via WhatsApp`, `Print` and `Download PDF` are not.
12. After saving, the footer still says **`Create Prescription`** — did the first save work?

---

## Take-away Pass

### 1. Builder — top of the tab ([01](J4-prescription-screens/01-builder-first-fold.jpg), [02](J4-prescription-screens/02-builder-blank-full.jpg), [07](J4-prescription-screens/07-templates-menu.jpg))

The blank builder is 4,250 px tall — about five screens — and the first fold contains no prescription field at all.

| Element | Verdict |
|---|---|
| `Refresh` (reload templates) | Remove — no story step needs it; the list loads itself and an error toast already offers retry |
| `Undo` / `Redo` | Move next to the Treatment table — they only track medicine rows and follow-up text, yet sit beside Templates |
| `Reset to default` (red, the loudest control on the page) | Remove, or rename "Clear medicines" as a quiet link with an undo toast |
| `Save current`, `Save fields`, `New template` (the page's only filled black button) | Collapse into the Templates menu as "Save as template…" (with an "include medicines" tick). Template authoring is not the task at hand |
| "Clinical Details & Vitals" card | Defer — duplicates the Vitals tab; show a one-line read-only summary when vitals exist |
| "Patient History" (4 boxes + 3 ticks + personal history) | Collapse by default like "On Examination" already is |
| "Procedures" (two text boxes) | Collapse by default |
| "Has Data" + "Auto-included in preview" badges on every filled card, plus green tint | Remove the badges; the tint (or nothing) is enough — the same fact is stated three ways |
| Card title and field label repeat: "Chief Complaints / Chief Complaints", "Diagnosis / Diagnosis", "Procedures / Procedures" | Drop the inner label |
| Mic button (Chief Complaints only) | Keep; **suspected**: failures surface as toasts ("Voice capture unavailable", "Microphone access denied", `useSpeechToTextRecorder.ts:84–212`); clicking it in a browser with no microphone gave no visible feedback (measured, headless) |

Hierarchy: **no primary action on the first fold that belongs to the task**; the two most prominent buttons are a destructive reset and template creation. Layout: once the Patient Context card scrolls away, the left ~370 px stays empty for the rest of the page while the builder is confined to ~740 px, which is what forces the medicine table into two-line rows ([03](J4-prescription-screens/03-autofill-after-diagnosis.jpg), [04](J4-prescription-screens/04-medicine-search.jpg)).

### 2. Treatment card ([03](J4-prescription-screens/03-autofill-after-diagnosis.jpg), [04](J4-prescription-screens/04-medicine-search.jpg), [05](J4-prescription-screens/05-usual-values-suggested.jpg), [06](J4-prescription-screens/06-add-drug-dialog.jpg))

| Element | Verdict |
|---|---|
| Dark "Treatment suggestions" panel, empty state: ~290 px tall, four tiles showing "—", "Enter a diagnosis to see treatment suggestions." | Collapse to one grey line until there is something to say ([02](J4-prescription-screens/02-builder-blank-full.jpg)) |
| Same panel, no pattern: "No strong pattern yet for this diagnosis. Keep building manually once. As more prescriptions land in the database…" | Remove entirely in this state — it tells the doctor nothing she can act on |
| Same panel, applied: title + subtitle + chip all say "Auto-filled from your most recent similar prescription" (stated twice in adjacent lines); medicine pills repeat the rows 150 px below; four tiles | Reduce to one strip: "Filled from your last Acne vulgaris prescription (1 match) · `Undo`". The table *is* the content |
| `Reapply learned plan` shown as the white primary button right after the plan was applied | Remove in that state; show only `Undo` |
| `+ Add to Drug Database` (above the table, far from where the miss happens) | Move into the "No results found" list as "Add "Photostable SPF 50" as a new medicine" |
| `Reuse last meds` on a first visit | Hide when the patient has no earlier prescription (it can only answer "No previous medications found") — suspected for the empty case |
| `Add Row` **and** a `+` on every row **and** an auto-appended blank row | One is enough: keep the trailing blank row, drop `Add Row` and the per-row `+` |
| `Presets:` strip (4 frequency + 4 duration chips) | Keep the idea, but attach to the focused row (or drop once usual values exist) — detached chips with an invisible target |
| `Suggested · Accept` ×3 per row (and they overlap each other, [05](J4-prescription-screens/05-usual-values-suggested.jpg)) | Remove the links; mark suggested values with a tint that clears on edit |
| "Total items: N" above the table | Remove (duplicates the footer and counts blank rows) |
| "Stock: 120" label notched into the field border | Keep — stock at the moment of choosing is useful; it is also in the result list, which is the right place |
| `Best Match` / `High Match` badges ("Clindamycin + BPO" is a `High Match` for "doxy") | Remove `High Match`; order alone carries rank |
| "Add Drug to Database": Manufacturer, Price (₹), Pack Size Label | Defer to the pharmacy — a doctor mid-consultation does not know the pack price; name alone should be enough to prescribe |

Hierarchy: the dark panel is the heaviest object on the whole tab and, in two of its four states, carries no information. The medicine table — the actual work — is visually the quietest thing on the card.

Safety note (keep the step): the plan auto-applied an oral antibiotic to a brand-new patient on the strength of **one** earlier prescription ("Emerging pattern", "Evidence 1", [03](J4-prescription-screens/03-autofill-after-diagnosis.jpg)). `Undo autofill` restores everything in one click (measured), which is good, but at this evidence level a one-click "Use this plan" would be the safer default than silent filling.

### 3. Builder tail and footer ([08](J4-prescription-screens/08-builder-footer.jpg))

| Element | Verdict |
|---|---|
| "Basic Information" card holding Language + Follow-up Instructions | Rename "Follow-up"; move Language next to the preview button (it only affects print) |
| Follow-up text chips (5) **and** Review Date chips (5: `6w 7d 2w 3w 30d`) | Merge into one interval control that writes both |
| "Total items: 2 • Total qty: 0" | Drop "Total qty" — there is no quantity input, so it reads 0 while the pharmacy queue shows 0/28 and 0/42 for the same two lines ([14](J4-prescription-screens/14-pharmacy-unsaved.jpg)) |
| `Print [Table ▾]` select | Remove — duplicated in the preview |
| `Go to Pharmacy` | Remove from the footer (does not save; see dead end 4) |
| `Create Prescription` next to `Save Draft` / `Complete Visit` | One clearly-labelled prescription action; visit actions visually separated |
| "Add Custom Section" as the only way to write advice | Provide a standing "Advice" box; keep custom sections for the rare case |

Hierarchy: one filled button (`Create Prescription`) — correct — but it is not the next step the story takes (`Print Preview` is), and saving here triggers the pharmacy dialog while saving in the preview does not.

### 4. Print preview ([09](J4-prescription-screens/09-preview-top.jpg), [10](J4-prescription-screens/10-preview-actions.jpg), [11](J4-prescription-screens/11-whatsapp-after.jpg))

The page itself is good: letterhead applied, one page, readable, what you see is what prints. The right-hand column is the problem — it is 1,548 px tall in a 900 px viewport and the eight action buttons are its last 250 px.

| Element | Verdict |
|---|---|
| "📋 Print Settings Tip" (blue box, first thing in the column, every time) | Show once, or move under `Print` as a small link |
| `Live Preview: Off` | Remove — no story uses it, and "On" re-opens the preview after `Close` (suspected, story 059) |
| `Zoom`, `Top margin`, `Bottom margin`, `Reset margins` | Collapse under "Layout"; margins belong in the doctor's saved defaults |
| `Space-optimized layout`, `Fit to 1 page`, `Line spacing` + three explanatory paragraphs | Collapse; apply fit automatically when content overflows one page and say so |
| `Print Format`, `Letterhead` | Collapse (defaults are right) |
| Five page-break checkboxes | Collapse (advanced) |
| `Printer profile` — "Select profile" with nothing to select and no screen to create one | Remove |
| `Refill stamp` | Collapse |
| `Show signature` — unticked although a signature is on file | Default on when a signature exists |
| `Save Prescription` (green, full width) | Remove as a separate step — every other button saves; show a "Saved" state instead |
| `Close` button **and** the ✕ at top right | Keep the ✕ |
| `Interactions` | Run automatically on open; show "No interactions" / a warning strip above the actions |
| `High contrast` (ghost button between the share and print rows) | Remove from the action group (it is a display preference, toggles a body class) |
| `Print` and `Download PDF` (both black) + `Save Prescription` (green) | One primary: `Print`. `Download PDF` secondary |
| Header chips "Rx: 2 · Investigations: 2 · Follow-up: Yes" | Remove — the page beside them shows exactly that; patient/doctor/date are likewise on the page |

Hierarchy: **three primary-weight buttons, all below the fold**; the visually loudest thing at the top of the column is a tip about browser settings.

### 5. Hand-off ([12](J4-prescription-screens/12-go-to-pharmacy-dialog.jpg), [13](J4-prescription-screens/13-pharmacy-bill.jpg), [14](J4-prescription-screens/14-pharmacy-unsaved.jpg))

| Element | Verdict |
|---|---|
| "Go to Pharmacy?" dialog | Replace with a quiet inline state after saving: "Saved · in the pharmacy queue · `Open bill`" |
| Footer `Go to Pharmacy` | Remove (or make it save first and carry the prescription id) |
| Browser "Leave site?" after a save | Suppress when nothing is dirty |
| On arrival: the whole pending-prescription queue sits above the linked bill | For a deep link with `prescriptionId`, open on the bill (pharmacy critic's screen; noted because it is where this journey lands) |
| "Prescription ID: cmweqbv8w00gh7d00ulxknz33" | Remove — a raw database id; patient name + date identifies it |

The pharmacist does not need the doctor to do any of this: the saved prescription appeared in the queue with stock status on its own (measured). The hand-off the story asks for is therefore already zero-click; everything on this list is surplus.

---

## The Simpler Version

Same goal, same safety checks, 13 actions plus two optional ones:

1. Open the visit's Prescription tab → the first fold shows Complaint, Diagnosis and the medicine table (history, vitals, procedures collapsed; templates behind one menu).
2. Type or dictate the complaint.
3. Type the diagnosis → a one-line strip offers "Your usual plan for Acne vulgaris: Doxycycline, Adapalene · follow-up 6 weeks — `Use plan`" (auto-applied only when evidence is strong; always one-click `Undo`).
4. Click `Use plan` → rows, follow-up and review date fill.
5. In the trailing blank row type `clin`, press Enter on the best match → usual regimen arrives filled, no "Accept".
6. Type `Photostable SPF 50` → the list offers "Add "Photostable SPF 50" as a new medicine"; Enter → the same row becomes that medicine (name carried; price/pack left for the pharmacy).
7. Set its frequency and duration (two taps on row-attached presets).
8. Tick the tests.
9. Type advice in the standing Advice box.
10. (Follow-up already set; one interval chip changes text and date together.)
11. Click `Review & print` → preview with the page on the left and a pinned action bar: `Print` (primary) · `WhatsApp` · `Email` · `Download`; an automatic line "No interactions found"; "Layout options" collapsed; signature shown.
12. `Print` → saves silently, shows "Saved", opens the print dialog.
13. `WhatsApp` → sends (or, until server send exists, opens the chat with the PDF link in the message).
14. Close → the builder shows "Saved 14:13 · in pharmacy queue · `Open bill`".
15. (Optional) `Open bill`.

### Changes to get there

| # | Change | Effort | Source |
|---|---|---|---|
| 1 | Pin the preview's action bar; one primary (`Print`); collapse the 17 layout controls under "Layout options"; drop the duplicate `Close`, `High contrast`, `Live Preview`, empty `Printer profile`; show the print tip once | M | `PrescriptionBuilder.tsx:6146–6470` |
| 2 | One save model: remove the "Save the prescription first" gate on `Email` (it already calls `saveBeforeExport`); turn `Save Prescription` into a "Saved ✓ / Save changes" state; rename footer `Create Prescription` → "Save prescription" / "Update prescription" after first save; one toast per action | S | `:5591–5593`, `:6349–6383`, `:2631–2797` |
| 3 | Hand-off: delete the "Go to Pharmacy?" dialog and footer `Go to Pharmacy`; after any save show "In pharmacy queue · Open bill" using the prescription id; don't raise `beforeunload` when nothing is dirty | M | `:5594–5604`, `:6896–6926`, `:4370`, `MedicalVisitForm.tsx:1273` |
| 4 | Medicine search: Enter / arrow keys choose a result; "Add "…" as a new medicine" item in the no-results list; prefill the dialog name; replace the typed row instead of appending; make manufacturer/price optional for doctors | M | `:5252` (key handler), `:7006`, `:292–296`, `:4623–4652`; drug create DTO in `backend/src/modules` |
| 5 | Treatment suggestions: one-line strip in empty / no-pattern states; applied state = source + `Undo` only; drop the four tiles and duplicate source text; show `Reapply` only after an undo; require more than one matching plan before auto-applying (below that, offer `Use plan`); ignore the current visit's own prescription as evidence | M | `:4395–4443`, `:4981–5110`, `lib/prescription-learning.ts:855`, `:943` |
| 6 | Replace `Suggested · Accept` links with a tint on suggested values that clears on edit | S | `:2292–2362` |
| 7 | Templates bar → one `Templates ▾` menu containing "Save as template…"; move `Undo`/`Redo` to the table; remove `Refresh` and `Reset to default`; undo-toast (or confirm) when a template would overwrite typed text | M | `:4519–4575`, `:3017` |
| 8 | One follow-up control that writes both the instruction text and Review Date | S | `:4496–4512`, `:5478–5545` |
| 9 | One item count that ignores blank rows; drop "Total qty" (or add a real quantity field, which the pharmacy queue already needs) | S | `:5126`, `:5556` |
| 10 | Remove the footer `Print [Table]` select | S | `:5558–5569` |
| 11 | Run the interaction check when the preview opens and show the result inline | S–M | `openInteractions` `:3305`, button `:6359` |
| 12 | Default `Show signature` on when a signature is uploaded | S | `hooks/usePrescriptionSignature.ts` |
| 13 | Single-line medicine rows with a real header; let the builder use the full width once Patient Context scrolls away | M | `components/visits/rx-table.tsx`, `MedicalVisitForm.tsx` layout |
| 14 | Collapse Vitals, Patient History and Procedures by default; add a standing Advice box | S–M | `:4586`, `:4754`, `:5383`, `:5473` |
| 15 | WhatsApp send with the PDF from the server (routes exist and are unused) instead of download-and-attach | L | `:6390–6433`, `backend/src/modules/prescriptions/prescriptions.controller.ts:378–394` (suspected) |

Changes 1–3 alone remove the scroll, the separate save, the repeat `Create Prescription`, the dialog and the leave-site prompt: 34 → 28 actions, and they remove the unsaved-medicines trap. Change 4 takes the missing-medicine detour from 14 to about 5.

---

## Clarity Issues

- **`Reset to default`** — clears; there is no default. **`Save current` / `Save fields`** — do not say they save *templates*.
- **`Create Prescription`** (footer) vs **`Save Prescription`** (preview) vs toasts "Prescription created" / "Prescription updated" vs "Add medications to save" — four words for one write; the footer label never changes after the first save ([12](J4-prescription-screens/12-go-to-pharmacy-dialog.jpg)).
- **"2 medications were added to this prescription"** on a re-save where nothing was added.
- **Treatment suggestions / learned plan / autofill / prefilled / pattern** — five names in one panel ([03](J4-prescription-screens/03-autofill-after-diagnosis.jpg)). Tiles **COMBO**, **EVIDENCE**, "matching plans", "suggested window" are product-analytics vocabulary, not a clinician's.
- Panel copy contradicts the screen: "**Auto-filled** from this patient's last similar plan", "2 meds **prefilled**" and `**Re**apply learned plan` were all shown on a follow-up visit where nothing had been auto-filled ("Learned plan ready. Your manual edits were preserved." — measured, Kavya visit #2). "**High confidence**" sat next to "Evidence 1".
- "**As more prescriptions land in the database**" and "**saved order sets**" — system language.
- **`Suggested · Accept`** — "Accept" implies the value is pending; it is already applied.
- **"Frequency"** column holds dose patterns (`1-0-1`); the same prescription then shows **TWICE_DAILY / ONCE_DAILY** on the pharmacy bill, and template rows show `ONCE_DAILY` in the Frequency dropdown itself (measured). "When" options mix `HS` and `QHS` (same thing) with `After Breakfast`.
- **`#`** as the placeholder for duration; unlabeled **`+`** icon on each row (accessible name "Add a medicine below …", no visible hint).
- **"Total qty: 0"** — a quantity the doctor cannot enter.
- **"Basic Information"** is the title of the follow-up/language card at the *end* of the form.
- **`PDF via WhatsApp`** — downloads a PDF and opens a chat; it does not send. The toast says the chat "just opened" whether or not the pop-up was blocked (suspected for the blocked case).
- **"Print Preview — Language is English. Skipping translation."** — a toast about something that did not happen, shown on every preview (`:5575`). **Suspected**, translation off here: the non-English note still lists "Post-procedure care", a field that no longer exists (`:5499`), and a failure toast tells the doctor to "Check server OPENAI_API_KEY" (`:1114–1115`).
- **"Go to Pharmacy?" → "pharmacy module" → page titled "Sales" → "New bill" → "Invoice Items"** — five names across one click ([12](J4-prescription-screens/12-go-to-pharmacy-dialog.jpg), [13](J4-prescription-screens/13-pharmacy-bill.jpg)).
- **"Doctor cmweot"** in the preview header and a bare **"Dr."** over "Signature" on the page for a visit not yet reloaded ([09](J4-prescription-screens/09-preview-top.jpg), [10](J4-prescription-screens/10-preview-actions.jpg)) — see bugs.
- **"Letterhead (Dr. Praneeta Jain)"** — the option is named after a person rather than "Clinic letterhead".
- **"Save Fields as Template … on this device"** — it is stored on the server (suspected, story 056).

---

## Already Minimal

These parts are fine; leave them alone.

- **`Reuse last meds`** — one click brought both medicines with frequency, timing and duration, and a clear toast ("Added 2 items from the last visit."). Measured.
- **Follow-up text chips** — one click fills the instruction *and* the review date. Measured.
- **Diagnosis-driven prefill** — zero clicks to fill, one click (`Undo autofill`) to take everything back including follow-up and review date. The mechanism is at the ideal; only its presentation and evidence threshold need work. Measured.
- **Usual regimen on re-prescribing** — the second time the doctor picked Doxycycline, frequency, timing and duration arrived on their own: 3 actions per medicine. Measured.
- **Search results** — show strength, pack and stock where the choice is made; a blank row is always waiting for the next medicine.
- **Investigations** — one click per test, no dialog.
- **`Print`** — one click; saves without a prompt and opens the browser dialog. Measured (one print call, no extra dialog).
- **`Email`** (once enabled) — one click, recipient from the record, "Email sent" toast. Measured.
- **The preview page itself** — true WYSIWYG, letterhead applied without asking, one page by default; `Fit to 1 page` is a single tick that reports its result ("Fits on 1 page.").
- **Pharmacy visibility** — a saved prescription appears in the pharmacy queue with per-line stock status with no action from the doctor; patient and doctor arrive prefilled on the bill.
- **Steps that earn their place**: the interaction check (should be automatic, not removed); the leave-page warning when work really is unsaved; stock shown before prescribing; the pharmacy note "Changes here do not alter the doctor's prescription."

---

## Functional bugs tripped over (not verified further)

- New, not-yet-reloaded visit: preview header shows "Doctor cmweot" (id fragment) and the page prints a bare "Dr." with no name above "Signature"; after reopening the visit both show "Dr. Praneeta Jain" (`PrescriptionBuilder.tsx:2460–2464`; [09](J4-prescription-screens/09-preview-top.jpg), [10](J4-prescription-screens/10-preview-actions.jpg) vs [11](J4-prescription-screens/11-whatsapp-after.jpg)).
- Adapalene chosen from the inventory-backed search (Stock: 60) arrives on the bill as "link inventory before billing" / "No match", while the queue row directly above says "In stock … (60 tubes)" ([13](J4-prescription-screens/13-pharmacy-bill.jpg)).
- The bill deep link scrolls the whole window, pushing the app header off-screen and leaving a blank band at the bottom ([13](J4-prescription-screens/13-pharmacy-bill.jpg)).
- `Suggested · Accept` links overlap each other in the row ([05](J4-prescription-screens/05-usual-values-suggested.jpg)); the table header wraps and clips `Actions` ([04](J4-prescription-screens/04-medicine-search.jpg)).
- Review-date chip leaves follow-up text contradicting the date (30 days vs "6 weeks").
- On reopening a saved visit, the suggestions panel cites that visit's own prescription as its evidence.
- Rows added by `Reuse last meds` or the plan can show "Stock: —" for a stocked item (Adapalene, [03](J4-prescription-screens/03-autofill-after-diagnosis.jpg)).
- The medicine result list stays fixed on screen when the form is scrolled, detaching from its field.

Test data left behind: patients "Kavya Jfour" (one saved prescription, pending in the pharmacy queue; one unsaved follow-up appointment) and "Rohan Jfour" (appointment only, nothing saved). No shared records were changed or deleted; no drug was added to the drug master.
