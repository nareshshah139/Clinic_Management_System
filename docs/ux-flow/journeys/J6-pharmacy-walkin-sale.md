# J6 — Pharmacy walk-in sale: a bill from scratch, then what happens after the sale

**Persona**: `pharmacist` (Karthik Reddy). **Stories**: STORY-073 (primary), 075, 076, 078, 080, 081, 082 in
`docs/ux-paths/topics/pharmacy-sales.md`; STORY-068 in `docs/ux-paths/topics/pharmacy-desk-counter.md`.
**Walked**: 13 Nov 2026, live app at `localhost:3000`, 1440×900, Playwright. Source paths are relative to
`frontend/src/` unless prefixed.

**Verdict: convoluted.** The register and the after-sale correction screens are good. The path *to* a finished
walk-in bill is not: 19 actions against an ideal of 8, two different selling tools that price the same bottle
differently, two dead ends before the first item is on the bill, and a "Due" balance that cannot be collected
where it is shown.

**Evidence labels** — *measured*: done live and seen in a screenshot or the page text. *suspected*: read in code
only. Three things could not be done live and are marked suspected:
- **Printing** — headless browser, no printer. `window.print` was stubbed; the confirm call itself was live.
- **`Mark as Paid`** on the "Pharmacy Invoices" list — the run's permission layer refused the script that clicks it
  and accepts the native dialogs, so I did not retry. Dialog text is quoted from `components/pharmacy/PharmacyInvoiceList.tsx:237-262`.
- **Counter `Walk-in bill` / `Start billing`** — only rendered when the queue is empty; it never was.

**Data I left behind** (all mine): patient "Farhan Jsix" 98530 12345; bills `PHI-2026-002` (revised −10 %, refund
recorded), `PHI-2026-003` (revised, **still shows Due ₹66.08**); counter sale `COUNTER-SALE-2026-11-13`
("Jsix walk-in"). Four bottles of sunscreen and one tube of clindamycin left stock.

### How is a pharmacist expected to bill someone who is not a registered patient?

There is no designed answer; there are two accidental ones, both measured.

1. **Leave Sales and use a different tool.** Inventory › Sales › Counter sales › `New document`
   ([14](J6-pharmacy-walkin-sale-screens/14-counter-sale-editor.jpg)). The customer name is optional there. Nothing in
   Sales points to it: the bill's patient box just says "No patients found"
   ([04](J6-pharmacy-walkin-sale-screens/04-patient-no-match.jpg)).
2. **Register the patient through a page the pharmacist has no menu entry for.** The sidebar gives PHARMACIST no
   `Patients` item (`components/layout/sidebar.tsx:76-80`), but typing `/dashboard/patients` opens the page, `New Patient`
   opens a 14-field "Create Patient" dialog, and saving with four fields (first name, last name, age, phone) worked
   (`POST /api/patients` → 201; gender silently became "Other"). That is how "Farhan Jsix" was made. A pharmacist who
   does not know the URL cannot do this, and one who does loses any bill already started (no leave-page guard).

---

## Friction Scorecard

| Measure | Count | Notes |
|---|---|---|
| **Steps, primary (STORY-073)** | **19 actual / 8 ideal** | measured; registered patient, both items already in the drug master. The story counts coarsely (search + pick = 2, "open" = 1, print dialog excluded); at that grain today's path is **13 / 8** |
| Steps, unnamed walk-in via Counter sale (082) | 9 / 4 | measured; includes 2 to get a receipt printed |
| Steps, draft and resume (075) | 7 / 4 | measured |
| Steps, forgotten discount + refund (078) | 6 / 5 | measured — near minimal |
| Steps, collect a "Due" (080) | 5–7 / 3 | counted from screens + code; payment click not executed |
| Steps, find and reprint (076) | 3 / 3 | controls seen on [01](J6-pharmacy-walkin-sale-screens/01-sales-register.jpg); print not executed |
| **Decisions** | 14, of which **6 needless** | list below |
| **Re-entry** | 2 (+1 recall) | GST rate the app already knows; patient re-searched after registering; due bill re-found on another page |
| **Confirmations guarding nothing** | 0 measured, 2 suspected | native "Invoice marked as paid successfully" alert; "delete this invoice?" on finished bills the server always refuses |
| **Dead ends** | 4 | no patient match; no drug match; "Due" bill in Sales; posted counter sale |
| **Hesitations** | 12 | list below |

### Steps — primary journey as walked (19)

| # | Action | Avoidable? |
|---|---|---|
| 1 | Sidebar `Sales` | |
| 2 | `New sale` | |
| 3 | Scroll past "Prescription dispensing queue" — the bill starts 997 px down a 900 px window ([03](J6-pharmacy-walkin-sale-screens/03-new-bill-queue-first.jpg)) | **yes** |
| 4 | Click `Patient *` | yes (autofocus) |
| 5 | Type `98530` | |
| 6 | Click "Farhan Jsix" | |
| 7 | Type `sunscreen` in `Search Drugs` | |
| 8 | `Add` | |
| 9 | Quantity → 2 | |
| 10 | Type `clinda` | |
| 11 | `Add` | |
| 12 | Change `Tax %` 18 → 12 on Clindamycin (the product's own rate is 12; the line was created at 18) | **yes** |
| 13 | Open `Payment Method` | yes (visible chips) |
| 14 | Choose `UPI` | |
| 15 | `Print Preview` ([07](J6-pharmacy-walkin-sale-screens/07-preview-draft.jpg)) | **yes** (merge) |
| 16 | `Confirm & Print` → "Invoice PHI-2026-002 confirmed successfully" | |
| 17 | Print in the browser dialog *(suspected)* | |
| 18 | `Close` the preview | **yes** |
| 19 | `Back to Sales` or `Start a new invoice` ([08](J6-pharmacy-walkin-sale-screens/08-builder-after-confirm.jpg)) | **yes** |

Steps 3, 12, 18, 19 are pure overhead; 15 is a review that deserves to exist but not as a detour; 4 and 13 are
one click each that a default could carry.

### Routes to "new bill" (all measured unless noted)

| From | Control | Clicks | Lands on |
|---|---|---|---|
| Login | — | 0 | `/dashboard`: "Total Users 7 · Active Users 7 · Total Branches 1 · System Status" — nothing about pharmacy |
| Sidebar `Sales` | `New sale` | 2 | bill page, queue on top |
| Sidebar `Pharmacy Desk` | tile `New sale` "Bill a prescription or walk-in" | 2 | same |
| Sales register, empty period | second `New sale` in the empty state | 2 | same |
| `Pharmacy Counter`, patients queued | **none for a walk-in.** Header `Bill` opened `…/sales/bill?patientId=…&prescriptionId=…` — the highlighted patient's prescription ([02](J6-pharmacy-walkin-sale-screens/02-counter-no-walkin.jpg)) | — | someone else's bill |
| `Pharmacy Counter`, queue empty | `Walk-in bill` (`components/pharmacy/PharmacyCounterCockpit.tsx:747`) *(suspected)* | 2 | bill page |
| Sidebar `Inventory` › `Sales` › `Counter sales` | `New document` | 3 | a different editor ([14](J6-pharmacy-walkin-sale-screens/14-counter-sale-editor.jpg)) |

### Decisions (14) — needless ones in bold

1. **Which tool — `New sale` or `Counter sales`?** Nothing explains the difference; the result differs in price (below).
2. Patient — real.
3. Doctor — optional, no default needed for a walk-in; fine but always visible.
4. `Individual Drugs` / `Treatment Packages` — default carries.
5. Item and quantity — real.
6. Unit Price, Discount % per line — defaults carry.
7. **Tax % per line** — the default is wrong, so every line becomes a decision.
8. **"Prescription directions" (Dosage, Frequency, Duration, Instructions) on every line** — four empty boxes on an over-the-counter sunscreen.
9. Bill discount, `%` or `₹` — default carries.
10. Payment method — real; default Cash.
11. `Print Preview` or `Save draft` — real, but the first is mislabelled (Clarity).
12. **`Confirm Invoice` or `Confirm & Print`** — two full-weight buttons for one act.
13. **Copy Type, Preview Zoom** — shown at the moment of taking money.
14. **`Reopen confirmed invoice` / `Start a new invoice` / `Back to Sales`** (plus the header's own `Back to Sales`, plus a still-enabled `Print Preview`).

### Re-entry

- **GST rate.** `/api/drugs` returns `gstRate: 12` for Clindamycin 1% Gel; the hand-added line starts at 18
  (`components/pharmacy/PharmacyInvoiceBuilderFixed.tsx:1116`, `taxPercent: 18, // Default GST`). The substitute path on
  the same screen already uses the product's rate (`:1082`).
- **Patient just registered.** After "Create Patient" the name and phone must be typed again into the bill's patient search.
- **Recall across pages.** To collect a due, the bill seen in Sales must be found again on "Pharmacy Invoices", whose
  date filter defaults to "Today".
- Not re-entry, but the opposite fault: `Start a new invoice` **keeps the previous bill's discount**
  ([09](J6-pharmacy-walkin-sale-screens/09-start-new-keeps-discount.jpg)) — see Bugs.

### Confirmations

- **Preview before confirm — earns a step, not this much screen.** Confirming issues the number, moves stock and
  records payment, and afterwards only discounts can change. One deliberate review is right. A full-screen dialog
  with zoom, copy type and two confirm buttons is more than a review needs.
- **`Reason *` on Edit discount — earns its place** (money changes after the fact; it is shown in "Discount changes").
- **Record refund dialog — earns its place** (one choice, defaulted).
- *Suspected, guards nothing*: after the native `confirm("Mark invoice … as paid? Remaining payment: ₹…")`, a
  second native `alert("Invoice marked as paid successfully")` (`PharmacyInvoiceList.tsx:247,254`).
- *Suspected, guards nothing*: `confirm('Are you sure you want to delete this invoice?')` on the red bin shown on
  every finished bill ([13](J6-pharmacy-walkin-sale-screens/13-pharmacy-invoices-list.jpg)); per STORY-081 the server
  refuses finished bills, so the question protects an action that cannot happen.

### Dead ends (4, all measured)

1. **"No patients found"** — no "add", no "bill as walk-in", no pointer to Counter sales ([04](J6-pharmacy-walkin-sale-screens/04-patient-no-match.jpg)).
2. **"No matching drugs found in the drug master."** — typed `ketoconazole`; Inventory holds "Ketoconazole 2% Shampoo
   100ml · 40 BOTTLES available" ([05](J6-pharmacy-walkin-sale-screens/05-drug-no-match.jpg)). The bill searches the
   drug master; stock lives in Inventory. Inventory's own home page counts **"Unmapped 74"** batches. At the start of
   this session `/api/drugs` returned **0** products, so *nothing* could be hand-added; entries appeared only as a
   colleague linked prescription lines (a drug-master row is created as a side effect of `Link item`,
   `backend/src/modules/pharmacy/pharmacy-prescription-queue.service.ts:1301`).
3. **A "Due" bill in Sales** — badge "Due ₹66.08", buttons `Print` and `Edit discount` only
   ([12](J6-pharmacy-walkin-sale-screens/12-due-bill-dead-end.jpg); `components/pharmacy/sales/FinishedBillView.tsx:320-335`).
   The bell said "No notifications".
4. **A posted counter sale** — status "Posted", then only a back arrow, `Reload saved record`, and two unlabeled icons
   (`Export lines`, `Print QR label`). No receipt, no "new sale", no link to Sales. The customer's receipt is the printer
   icon on the Sales register row, two navigations away.

### Hesitations (12)

1. Counter with patients queued: where is the walk-in button? `Bill` bills the highlighted patient ([02](J6-pharmacy-walkin-sale-screens/02-counter-no-walkin.jpg)).
2. `New sale` opens on other patients' prescriptions; the empty bill is off-screen ([03](J6-pharmacy-walkin-sale-screens/03-new-bill-queue-first.jpg)).
3. Customer not in the list — now what? ([04](J6-pharmacy-walkin-sale-screens/04-patient-no-match.jpg))
4. Item on the shelf, not in the search ([05](J6-pharmacy-walkin-sale-screens/05-drug-no-match.jpg)).
5. No stock figure in search results; a shortage only surfaces at confirm (STORY-073 edge case; not triggered live).
6. Tax 18 on a 12 % product; nothing flags it ([06](J6-pharmacy-walkin-sale-screens/06-builder-filled.jpg)).
7. "Prescription directions" on an OTC item — must I fill these? ([06](J6-pharmacy-walkin-sale-screens/06-builder-filled.jpg))
8. The only forward button says `Print Preview`. Where do I finish and take the money?
9. `Confirm Invoice` (green) or `Confirm & Print` (dark)? ([07](J6-pharmacy-walkin-sale-screens/07-preview-draft.jpg))
10. After confirming, the form is still full and editable-looking; the notice does not say the bill number ([08](J6-pharmacy-walkin-sale-screens/08-builder-after-confirm.jpg)).
11. Due bill: no way to take the balance ([12](J6-pharmacy-walkin-sale-screens/12-due-bill-dead-end.jpg)); on the other page it is a bare green tick ([13](J6-pharmacy-walkin-sale-screens/13-pharmacy-invoices-list.jpg)).
12. Counter sale vocabulary — "Post sale", "Rate excl. GST", "Scheme ₹", "Free", "Order type" ([14](J6-pharmacy-walkin-sale-screens/14-counter-sale-editor.jpg)).

---

## Take-away Pass

### Sales register — [01-sales-register.jpg](J6-pharmacy-walkin-sale-screens/01-sales-register.jpg)

One primary (`New sale`), filters in one row, state told by badges ("Counter sale", "Revised", "Due ₹66.08",
"Refunded ₹143.92"), one footer total. **Little to take away.**
- *Collapsible*: `Entry Date` and `Bill Date` show the same day on all six rows. Show `Bill Date` only when it differs.
- *Clarity, not removal*: the three row actions are bare icons (%, printer, chat bubble); labels exist only on hover.
- Empty period shows `New sale` twice (header and empty state) — harmless.

### Pharmacy Counter — [02-counter-no-walkin.jpg](J6-pharmacy-walkin-sale-screens/02-counter-no-walkin.jpg)

Only the walk-in entry point is in scope here.
- Four controls open a bill (`Bill`, `Open bill`, `Collect payment`, queue-row `Bill`); **none opens an empty one**
  while anyone is queued. The one that would (`Walk-in bill`) exists only in the empty-queue state.
- "Pharmacy Counter" is printed twice, one above the other.

### New bill on arrival — [03-new-bill-queue-first.jpg](J6-pharmacy-walkin-sale-screens/03-new-bill-queue-first.jpg)

- *Deferrable*: the whole "Prescription dispensing queue" card. It fills the first screen; on
  [06](J6-pharmacy-walkin-sale-screens/06-builder-filled.jpg) it is the top 40 % of the page with two prescriptions,
  and was ~1,000 px with four. A walk-in never uses it. A resumed draft already opens without it — proof the bill
  stands alone.
- *Removable*: the `Sales | Returns` tabs on a bill page; `Back to Sales` beside them does the same job.
- Primary action on arrival: `Load` (×N), i.e. the wrong one for this journey.

### Bill builder — [06-builder-filled.jpg](J6-pharmacy-walkin-sale-screens/06-builder-filled.jpg), with [04](J6-pharmacy-walkin-sale-screens/04-patient-no-match.jpg), [05](J6-pharmacy-walkin-sale-screens/05-drug-no-match.jpg)

This screen fails step economy, decision economy, don't-ask-what-you-know, progressive disclosure and
once-only information.
- *Removable*: `A-` `100%` `A+` font controls above the item tabs — no story step uses them.
- *Removable*: the "DRUG" badge on every line, and the `Substitute` button on lines that did not come from a prescription.
- *Collapsible*: "Prescription directions" (4 inputs per line). Two OTC items add eight empty boxes and roughly
  double each line's height. Show only on prescription lines, or behind "Add directions".
- *Collapsible*: `Billing Name *` and `Phone *`. They repeat what the `Patient *` box already shows
  ("Farhan Jsix (9853012345)"). Keep as "Bill to a different name".
- *Collapsible*: `Doctor` and `Treatment Packages` (the latter read "No packages available" here).
- *Missing, not removable*: stock in the search result. The row shows name, pack, price and "Best Match" — not
  whether there is any to sell.
- *Hierarchy*: the amount to collect ("Total:") and the payment mode sit in a narrow right column, below the fold
  once two items are on the bill; the largest things on screen are section titles. The primary button is correct in
  weight but wrong in name.
- *Stated twice*: patient name (2), phone (2), item count and total (summary card, and "2 items • ₹1445.50 total"
  under the button).

### Preview and confirm — [07-preview-draft.jpg](J6-pharmacy-walkin-sale-screens/07-preview-draft.jpg)

- **Two primaries**: green `Confirm Invoice` at the top, dark `Confirm & Print` at the bottom. Keep one.
- *Removable*: `Preview Zoom` (3 controls). *Deferrable*: `Copy Type` — a reprint concern, not a first-sale one.
- *Removable*: the "Invoice / Status / Patient / Total" box. Total appears 4× (header chip, Grand Total, side box,
  and behind the dialog), patient 3×, "DRAFT" 3×.
- *Removable*: one of the two closers (`×` and `Close`); disabled `Download PDF` before confirm.
- **Missing**: the payment mode. The screen where money is committed never says "UPI".
- "Disc% 0.00%" column and "Item discount: -₹0.00" row on a bill with no discounts.

### After confirming — [08-builder-after-confirm.jpg](J6-pharmacy-walkin-sale-screens/08-builder-after-confirm.jpg)

- *Removable*: the entire still-filled builder. Nothing on it can be changed any more, yet every field looks live and
  `Print Preview` is enabled.
- The notice offers three exits at equal weight and names neither the bill number nor the amount.
- A clean version of this screen already exists and is not used here: the finished bill view
  ([11](J6-pharmacy-walkin-sale-screens/11-refund-due.jpg), [12](J6-pharmacy-walkin-sale-screens/12-due-bill-dead-end.jpg)).

### Edit discount — [10-edit-discount.jpg](J6-pharmacy-walkin-sale-screens/10-edit-discount.jpg)

**Nothing to take away.** One primary; "Total now / Total after change / Refund due after saving" update as you type;
the disabled button says why ("Enter a reason to save.").

### Finished bill, refund due — [11-refund-due.jpg](J6-pharmacy-walkin-sale-screens/11-refund-due.jpg)

One primary, and it appears only when it applies (`Record refund ₹143.92`). The refund figure is stated four times
(badge, button, amber sentence, summary row). The sentence explains *why* and earns its place; the badge could go.
Otherwise minimal.

### Finished bill, due — [12-due-bill-dead-end.jpg](J6-pharmacy-walkin-sale-screens/12-due-bill-dead-end.jpg)

Nothing to remove; one thing missing — the mirror of `Record refund`. **Zero primary actions on a screen whose
headline is money owed.**

### "Pharmacy Invoices" list — [13-pharmacy-invoices-list.jpg](J6-pharmacy-walkin-sale-screens/13-pharmacy-invoices-list.jpg)

Arguably the whole page is removable for this persona: the Sales register lists the same bills plus counter sales and
returns. What it uniquely holds is `Mark as Paid` and PDF download.
- *Removable*: the red bin on finished bills; the second "Pharmacy Invoices" heading; the four tiles — "Pending Amount"
  read **₹0.00** while `PHI-2026-003` on the same page owed ₹66.08 (page text; tile counts only "PENDING").
- Each card repeats the items the register opens in one click; the due amount — the reason to come here — is not on
  the card at all (only "PARTIALLY_PAID").
- No primary action; four bare icons per card.

### Counter sale editor — [14-counter-sale-editor.jpg](J6-pharmacy-walkin-sale-screens/14-counter-sale-editor.jpg)

- *Deferrable*: `Reference`, `Date`, `Doctor (optional)`, `Order type`, `Reason / notes` — five of eight header
  fields are not needed to sell one bottle; they push `Add a batch`, the first thing the user needs, below the fold.
- *Removable*: the three-sentence status box on a new document ("This document is a draft. Review its details and
  the available recovery actions…").
- *Collapsible*: `Free`, `Scheme ₹`, and "Batch-selection reason (if bypassing earlier expiry)" — shown even when the
  product has a single batch.
- After posting, the helper "Drafts do not reserve; posting reduces available stock" and all inputs remain on screen.

---

## The Simpler Version

Same goal — two items, UPI, printed bill, visible in the register — in **13 clicks and inputs instead of 19**
(counted the same way as the table above; 9 at the story's coarser grain, against its ideal of 8):

1. Sidebar `Sales`.
2. `New sale` — or one click on an always-present `Walk-in bill` in the Counter header. The bill is the first thing
   on screen with the cursor already in the customer box. Waiting prescriptions are one line:
   "2 prescriptions waiting · Load one".
3. Type phone or name.
4. Pick the patient. **No match** offers two rows in the same dropdown: *Bill as walk-in "98530…"* and
   *Add as patient* (name + phone only).
5. Type the first item. The result row shows stock.
6. Enter / `Add`. The line arrives with the product's own GST.
7. Change quantity to 2.
8. Type the second item.
9. Enter / `Add`.
10. Click a payment chip beside the total: `Cash` · `UPI` · `Card`.
11. `Review & confirm` — the review states items, total **and payment mode**.
12. `Confirm & print ₹1,439.20 · UPI`.
13. Print in the browser dialog.

The app then lands on the finished bill — number, "Paid", `Print again`, `WhatsApp`, primary `New sale` — so there
is nothing to close and no three-way exit.

The one step this keeps beyond the story's ideal is the review (11). It guards an irreversible, numbered money
record, so it earns its place. Gone are today's steps 3 (scroll), 12 (tax fix), 18 (close) and 19 (exit); 4 and
13 fold into their neighbours.

### Changes to get there

| # | Change | Effort | Touches |
|---|---|---|---|
| 1 | Put the bill first on a new sale; collapse the queue to a one-line disclosure | S | `app/dashboard/pharmacy/sales/bill/page.tsx:128-151` |
| 2 | Default a hand-added line's Tax % to the product's rate (`getDrugGstRate(drug)`, as `:1082` already does) | S | `components/pharmacy/PharmacyInvoiceBuilderFixed.tsx:1116` (and `:1151` for packages) |
| 3 | Reset the bill discount in `startNewInvoice` | S | `PharmacyInvoiceBuilderFixed.tsx:2102-2135` |
| 4 | Rename `Print Preview` → "Review & confirm"; one primary `Confirm & print`, "Confirm without printing" as a text link; drop zoom and the status box; show the payment mode | S–M | `PharmacyInvoiceBuilderFixed.tsx:3019-3036, 3099-3280` |
| 5 | After confirm, route to the finished bill view (`?bill=<id>`) with a primary `New sale`, instead of the filled builder + notice | M | `PharmacyInvoiceBuilderFixed.tsx:2075, 2184-2195`; `sales/bill/page.tsx`; `components/pharmacy/sales/FinishedBillView.tsx` |
| 6 | Add `Collect ₹…` to the finished bill view — a dialog mirroring Record refund, with a method choice | M | `FinishedBillView.tsx:320-335` (reuse the payment call in `PharmacyInvoiceList.tsx:237-262`) |
| 7 | No-match state in the patient box: inline "Add as patient" (name + phone; the pharmacist's `POST /patients` already succeeds) | M | `PharmacyInvoiceBuilderFixed.tsx:2301-2305` |
| 8 | Let `New sale` sell to an unnamed walk-in and search stocked Inventory items, so Counter sales stops being the only route — **one selling tool** | L | `PharmacyInvoiceBuilderFixed.tsx:2249-2309, 3019-3024`; `backend/src/modules/pharmacy/pharmacy-invoice.service.ts` + DTO; `backend/src/shared/search/drug-search.ts` |
| 9 | Until #8: decide one price basis. Today the bill adds GST on top of the price (`PharmacyInvoiceBuilderFixed.tsx:207-214`); the counter sale treats the same price as GST-inclusive (`components/inventory/WorkflowDocumentEditor.tsx:444`) | M | both files; a product decision first |
| 10 | Always-visible `Walk-in bill` on the Counter header | S | `components/pharmacy/PharmacyCounterCockpit.tsx:747` |
| 11 | Hide "Prescription directions" and `Substitute` on non-prescription lines; remove `A- 100% A+`; fold Billing Name/Phone behind "Bill to a different name" | S | `PharmacyInvoiceBuilderFixed.tsx:2347-2349, ~2819, 2947-2974` |
| 12 | Show available stock in drug search results | M | `backend/src/shared/search/drug-search.ts` (`drugSearchSelect`); `PharmacyInvoiceBuilderFixed.tsx:2413-2472` |
| 13 | Posted counter sale: `Print receipt`, `New counter sale`, `Back to Sales`; show selling price, not cost, in batch results | S | `WorkflowDocumentEditor.tsx:1127-1128, 1384-1392` |
| 14 | Retire "Pharmacy Invoices" for pharmacists once #6 lands (or make it read-only: no bin on finished bills, plain-language status, due amount on the card) | M | `components/pharmacy/PharmacyInvoiceList.tsx`; `app/dashboard/pharmacy/pharmacy-workspace.tsx` (`Invoices` button) |

Order of value: **#1–#4 are small** — they remove the scroll and the tax correction, one needless decision, and two
money errors. #5 removes the close-and-exit steps; #6 opens the "Due" dead end. #8 is the structural fix.

---

## Clarity Issues

**One thing, many names — within a single sale** (all seen live): `New sale` → card "New bill" → "Add Items to
Invoice" → "Invoice Items" → "Invoice Summary" → `Print Preview` → "Pharmacy Invoice Preview" → `Confirm Invoice` →
"This **checkout** is confirmed" → `Reopen confirmed invoice` → register "Bill No" → "Bill PHI-2026-002" → page
"Pharmacy Invoices" → counter sale "document" / "Posted". Pick "bill".

**Labels that hide what they do**
- `Print Preview` is the only way to finish a sale and record payment.
- "Draft previews are confirmed before printing or PDF export." and "Invoice #: Given when the bill is printed" — the
  number is given on confirm, printed or not.
- "This checkout is confirmed. Reopen it for another copy." — no bill number, no amount; "Reopen" sounds like "edit".
- After finishing a resumed draft the header still reads **"Draft · Gets its bill number when finished"** although it
  is now `PHI-2026-003` ([08](J6-pharmacy-walkin-sale-screens/08-builder-after-confirm.jpg)).
- `Load` on the Sales bill page and `Bill` on the Counter are the same action on the same queue.

**Words the pharmacist was never taught**
- "No matching drugs found in the **drug master**." It does not say the item may be sitting in Inventory, unmapped.
- "Individual Drugs", "Search Drugs", badge "DRUG" — for sunscreen and shampoo.
- Counter sale: "Post sale", "document", "recovery actions", "Rate excl. GST", "Scheme ₹", "Free",
  "Order type: Pickup", "Batch-selection reason (if bypassing earlier expiry)", "Confirmed stock effects ·
  Physical -1 · Held 0". "Document history" lists a raw user id (`cmweppwk1…`) and "CREATE" / "POST".
- In the batch picker, "20 BOTTLES available · ₹480.00" — the unlabeled rupee figure is the **cost** price
  (`WorkflowDocumentEditor.tsx:1127-1128`); the selling price is ₹560.

**Inconsistent with the rest of the app**
- Tax: label "Tax %", placeholder "Enter GST", finished view "18% GST", counter sale "GST %".
- Unpaid: "Due ₹66.08" (bill, register) · "Due (unpaid)" (filter, footer) · "Still to collect" (edit dialog) ·
  "PARTIALLY_PAID" (invoice list) · "Pending Amount" (tile) · `Mark as Paid` (tooltip).
- Payment modes: builder Cash / Card / UPI / Net Banking; refund dialog adds Wallet; register filter adds Insurance,
  Due (unpaid), Other; counter sale shows raw CASH / UPI / CARD / CREDIT; invoice list shows raw "CASH".
- Status on the invoice list is two raw codes side by side: "CONFIRMED" "PARTIALLY_PAID".
- Dates: Sales uses `01/04/2026 – 31/03/2027`; the counter sale's date box shows `11/13/2026`.
- Row actions in the register and on invoice cards are icons with hover-only names.

---

## Already Minimal

- **Sales register** ([01](J6-pharmacy-walkin-sale-screens/01-sales-register.jpg)) — one primary, one row of filters,
  badges carry state, counter sales and bills in one list, footer total with "1 draft not included". Disabled row
  actions say why ("Counter sales are corrected in Inventory", "No mobile number", "Finish this draft bill first").
  Find-and-reprint is 3 actions against an ideal of 3.
- **Edit discount** ([10](J6-pharmacy-walkin-sale-screens/10-edit-discount.jpg)) — live before/after, the refund is
  announced before saving, the mandatory reason is justified and explained. 4 actions.
- **Record refund** ([11](J6-pharmacy-walkin-sale-screens/11-refund-due.jpg)) — the button exists only when money is
  owed back; the dialog has one defaulted choice; afterwards "Payments" shows "Refund · Cash · −₹143.92" under the
  original receipt. Whole correction: 6 actions against 5.
- **Finished bill view** — items, totals, payments, discount history; nothing decorative. It is the model the
  post-confirm screen should copy.
- **Save draft** — one click, no dialog; the toast says where it went ("…is in Sales as a draft. Open it from the Draft
  row to finish it."); the reopened draft restores patient, lines, discount and payment mode and drops the queue.
- **Picking a patient** fills Billing Name and Phone; nothing is typed twice.
- **The preview-before-confirm step itself** — worth one step. Only its furniture is excess.

---

## Functional bugs tripped over (one line each)

1. `Start a new invoice` keeps the previous bill's discount: the blank next bill opened with "Bill discount 10" ([09](J6-pharmacy-walkin-sale-screens/09-start-new-keeps-discount.jpg); `startNewInvoice` never clears `billDiscount`, `PharmacyInvoiceBuilderFixed.tsx:2102-2135`).
2. Hand-added lines are always 18 % GST whatever the product's rate (Clindamycin `gstRate` 12 → line 18) (`:1116`).
3. The same sunscreen is **₹660.80** through `New sale` (₹560 + 18 %) and **₹560.00** through Counter sales (₹560 inclusive); the counter-sale line shows MRP ₹590, so the Sales bill is above MRP ([06](J6-pharmacy-walkin-sale-screens/06-builder-filled.jpg) vs [14](J6-pharmacy-walkin-sale-screens/14-counter-sale-editor.jpg)).
4. With an empty drug master (the state of the demo data when I started) no item can be hand-added to a Sales bill although Inventory is stocked.
5. A finished draft still shows "Draft · Gets its bill number when finished" ([08](J6-pharmacy-walkin-sale-screens/08-builder-after-confirm.jpg)).
6. "Pharmacy Invoices" tile "Pending Amount ₹0.00" while a listed bill owes ₹66.08.
7. Login under load shows the raw text "ThrottlerException: Too Many Requests (Reference: …)" on the sign-in form.
8. Seen in passing, other journeys: Counter "Active Dispense" renders "Queued" as a vertical column of letters ([02](J6-pharmacy-walkin-sale-screens/02-counter-no-walkin.jpg)); Pharmacy Desk "Manual Daily Entry" field labels overlap.
