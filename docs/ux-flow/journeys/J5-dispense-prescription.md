# J5 — Dispense a prescription: from the pharmacy queue to a paid bill

**Primary story**: STORY-064 (`docs/ux-paths/topics/pharmacy-desk-counter.md`), with STORY-063 / 065 / 066 (same
file) and STORY-074 (`docs/ux-paths/topics/pharmacy-sales.md`).
**Persona**: pharmacist (`pharmacist`, shown as "Karthik Reddy"). **Walked live** on 13 Nov 2026 (≈14:00 IST) at
1440×900, plus one deliberate 1920×1080 pass because the cockpit's review buttons cannot be reached at 1440.
**Verdict**: **convoluted**. The bill itself is good and the shortest route to it is two clicks. The trouble is
everything wrapped around it: the same queue is shown three times, the "cockpit" review is a second, parallel
place to make decisions that the bill never reads, its core buttons are cut off on laptop-width screens, and the
flow ends on a bill form that still looks unpaid.

Evidence tags: **[measured]** = done or counted in the live app (screenshot or DOM read-out);
**[suspected]** = read from code or from another critic's rows only. Screenshots are in
`J5-dispense-prescription-screens/`.

**Setup (not counted as friction).** The seeded queue was empty, so four patients were registered and given
prescriptions by Dr Shravya through the API (`POST /patients`, `POST /prescriptions/pad`), each line carrying the
`inventoryItemId` of a stocked item:

| Patient | Lines | Walked as |
|---|---|---|
| Rahul Jfive | Isotretinoin 20 mg, Clindamycin gel, Sunscreen (all in stock) | STORY-064: cockpit → `Open bill` → paid |
| Anil Jfive | Levocetirizine (in stock) | STORY-066: queue table → `Bill` → paid |
| Sita Jfive | Azelaic acid cream, Sunscreen | STORY-074: Sales › `New sale` › `Load` → paid by UPI |
| Meena Jfive | Doxycycline, Glutathione ×10 (6 in stock), a shampoo the clinic does not stock | STORY-065: cockpit `Sub` / `NA` → bill inspected, **not** confirmed |

**One fact about this database shapes several findings.** The demo data has 79 stock items but an **empty
medicine catalogue** (`drugs` table: 0 rows) [measured]. A bill line needs a catalogue product, so every
prescription line arrived on the bill as "No match" until it was re-linked. Findings that depend on this are
marked *(catalogue gap)*; they would be rarer in a clinic whose catalogue is populated, but the app's response to
the gap is itself the finding.

Not walked: the Desk's AI assistant, Partner Daily Sync and Treatment Packages; `Pause`, `Paid`, `Edit`,
`Daily close`, `Shelf locations` (not clicked — claims about them are [suspected] from code); draft bills.

---

## Friction Scorecard

Counting unit: **one step = one click, one typed field, or one select choice**. "Story ideal" is the number the
story states.

| Route (as walked) | Story ideal | Measured, clean data | Measured, this database | Simpler version |
|---|---|---|---|---|
| Cockpit: Counter → card → `Accept` ×3 → `Open bill` → `Print Preview` → `Confirm Invoice` → `Close` → back to Counter (Rahul, STORY-064) | 6 | 10 | **20** (+9 re-linking three lines, +1 quantity fix) | 4 |
| Table: Counter → row `Bill` → `Print Preview` → `Confirm Invoice` → `Close` → back to Counter (Anil, STORY-066) | 2 to reach the bill | 6 | 9 (+3 re-linking one line) | 4 |
| Sales → `New sale` → row `Load` → payment `UPI` (2) → `Print Preview` → `Confirm & Print` → `Close` → `Start a new invoice` (Sita, STORY-074) | 5 | 9 | 12 (+3) | 4 |

| Scorecard line | Count | Notes |
|---|---|---|
| Steps, actual / ideal | **10 / 6** on clean data; **20 / 6** as measured | The cockpit route costs 4 more than the table route and produces the same bill |
| Decisions | **13**, of which **7 needless** | See list below |
| Re-entry | **3** (2 measured, 1 suspected) | Re-link a line the app already has linked; redo cockpit `Sub`/`NA` on the bill; convert doses to packs |
| Confirmations guarding nothing | **2** | Per-line `Accept` (bill opens at 0/N reviewed) and `Ready` (already set automatically) |
| Dead ends | **5** | `Rx queue`; Scan next / Barcode tiles; cockpit "Needs pharmacist action" with no action; the bill form after confirming; empty substitute / link searches |
| Hesitations | **13** | Listed below |

**Decisions** (needless ones in *italics*):
1. *Which sidebar item to open: Pharmacy Desk, Pharmacy Counter or Sales* — all three lead to the same bill.
2. *Which of two queues on the Counter to use* (cockpit column or the table under it).
3. Which prescription to serve — real.
4. *Accept / Sub / Edit / NA on every line* — when everything is in stock a default can carry it, and the answer changes nothing on the bill.
5. *Reason drop-down* (six options, preset to "Substitution requested") — only matters for an exception.
6. *Pause / Ready / Paid* — `Ready` is automatic; `Paid` sets a status by hand without taking money [suspected].
7. *Which of three buttons opens the bill*: header `Bill`, `Open bill`, `Collect payment` (one handler, `PharmacyCounterCockpit.tsx:405`, used at :595, :950, :1230).
8. *`Link item` per line* *(catalogue gap)* — the line already carries its stock item.
9. Quantity per line — real, and it needs more help than it gets (see Clarity).
10. Payment method — real; default Cash is right.
11. `Print Preview` or `Save draft` — real.
12. `Confirm Invoice` or `Confirm & Print` — real but could be one button plus a remembered preference.
13. After confirming: `Close`, then `Reopen confirmed invoice` / `Start a new invoice` / `Back to Sales` / sidebar — real, but the right answer ("next patient") is not offered.

**Hesitations** [all measured unless marked]:
1. Desk, Counter or Sales? The Desk's own tiles say "Pharmacy Counter — Review and pick" and "New sale — Bill a prescription or walk-in" ([01](J5-dispense-prescription-screens/01-desk.jpg)).
2. Two headings "Pharmacy Counter" and two queues on one page ([02](J5-dispense-prescription-screens/02-counter-cockpit-1440.jpg), [04](J5-dispense-prescription-screens/04-counter-queue-table.jpg)).
3. "Review every medicine before billing" — but at 1440 wide the `Accept / Sub / Edit / NA` column is not on screen ([02](J5-dispense-prescription-screens/02-counter-cockpit-1440.jpg)).
4. The active patient's name is squeezed to zero width; the status is printed one letter per line ("Q-u-e-u-e-d").
5. A line reads "No inventory match — Needs pharmacist action" and "IN STOCK" at the same time, while the table below says "In stock … Change link" for the same line.
6. Eight status pills and two header chips ("Pharmacist review", "Shelf locations") look clickable and are not.
7. `Sub` opens nothing — no place to say what was substituted ([03](J5-dispense-prescription-screens/03-cockpit-review-1920.jpg)).
8. "3/3 lines reviewed" next to "Review every medicine before billing", `Ready` greyed out ([03](J5-dispense-prescription-screens/03-cockpit-review-1920.jpg)).
9. The bill opens mid-page with the top bar pushed off screen and the tail of another patient's row above it ([06](J5-dispense-prescription-screens/06-bill-arrival.jpg)).
10. "link inventory before billing" for medicines just shown as in stock ([06](J5-dispense-prescription-screens/06-bill-arrival.jpg)).
11. `Quantity 30` — thirty what? ([08](J5-dispense-prescription-screens/08-bill-items.jpg))
12. The button that takes the money is called `Print Preview`; inside, two confirm buttons ([09](J5-dispense-prescription-screens/09-bill-summary-payment.jpg), [11](J5-dispense-prescription-screens/11-print-preview.jpg)).
13. After `Close` the bill still looks open and editable; back on the Counter a paid prescription shows the chip "Bill" ([13](J5-dispense-prescription-screens/13-after-close-notice.jpg), [14](J5-dispense-prescription-screens/14-counter-after-payment.jpg)).

---

## Take-away Pass

### Pharmacy Desk — [01-desk.jpg](J5-dispense-prescription-screens/01-desk.jpg)

What it is for: the back-office landing page (figures, shortcuts, AI assistant, partner sync, packages). What it
is for *in this journey*: nothing except a hop to the Counter.

- **Missing, not removable**: the Desk shows Sales, Invoices, Stock and Packages but **not how many prescriptions
  are waiting** — the one number a pharmacist wants at the start of a shift [measured].
- Tile `New sale` says "Bill a prescription or walk-in" and tile `Pharmacy Counter` says "Review and pick". Both
  are ways to dispense a prescription; the pharmacist has to guess which. One of them should own prescriptions.
- At 1440 the header is cramped: the page title "Pharmacy Desk" is not visible in the dark header (the `<h1>` is
  there, 231×38 px, but cannot be seen) and the Sales figure is cut to "₹…" [measured].
- Partner Daily Sync and Treatment Packages take the whole first screen below the header; neither is used in any
  dispensing step. Candidates for their own pages or collapsed sections.

### Pharmacy Counter, cockpit — [02-counter-cockpit-1440.jpg](J5-dispense-prescription-screens/02-counter-cockpit-1440.jpg), [03-cockpit-review-1920.jpg](J5-dispense-prescription-screens/03-cockpit-review-1920.jpg)

This screen fails heuristics 8, 9, 10 and 12 at once.

**Layout at laptop width (the biggest single problem)** [measured]. The review table needs about 814 px; the
middle column is 426 px at 1440 and the overflow is hidden (`PharmacyCounterCockpit.tsx:609`, `:980–981`, `:1025`).
The `Accept / Sub / Edit / NA` buttons sit at x≈1225, underneath the Pick + Pay column — a click there lands on the
"GST bill" tile. Measured at 900 px height:

| Viewport width | Action column | Height left for medicine rows |
|---|---|---|
| 1280 | cut off | 0 px |
| 1366 | cut off | 28 px |
| 1440 | cut off | 89 px (one row) |
| 1536 | cut off | 112 px |
| 1680 | visible | 150 px |
| 1800+ | visible | all rows (189 px for a two-line prescription) |

So on the most common laptop screens the cockpit's one job cannot be done with a mouse. Screenshot 03 shows the
screen as designed, at 1920.

**One primary action?** No. Dark, filled buttons on one screen: header `Bill`, `Open bill`, `Collect payment`,
plus the dark queue card, the dark patient strip and the dark "Scan next" card. Three of those buttons do the
same thing.

**Removable or collapsible:**
- Second heading "Pharmacy Counter" inside the cockpit, and its tag line "Queue to pick to bill in one workstation."
- Chips "Pharmacist review" and "Shelf locations" (decorative; "Shelf locations" is also a button lower down).
- Header counters `Queue / Review / Exceptions / Ready/Paid` **or** the `Queued / Exceptions` tiles in the Queue
  column — they repeat each other, and the lane chips repeat them a third time.
- `Rx queue` — does nothing (`pharmacy-workspace.tsx:379`, URL and scroll unchanged after click) [measured].
- Header `Bill` and `Collect payment` — duplicates of `Open bill`.
- The rail of eight status pills — the badge next to the name already states the status; the queue chip states it
  a third time; the six checklist tiles state it a fourth time.
- The six checklist tiles (`Validate`, `Pick earliest-expiry batch`, `Barcode`, `GST bill`, `Payment`,
  `Dispense`). They are read-only and some tick themselves without anything being checked: `Validate — Allergy
  and dose` is ticked as soon as a prescription is selected (`:1143–1145`), although no allergy is shown anywhere
  on the screen. A tick that the pharmacist did not earn is worse than no tick.
- "Scan next" card — there is no scan input; it repeats the first row of Pick Assist.
- Pick Assist — repeats stock, shelf, batch and expiry already in the review row. With this data every value was
  "Unmapped / No batch / No expiry", so the whole right column carried no information.
- `Ready` — the status is already set when the last line is accepted (chip turned to "Bill" by itself) [measured].
- `Paid` — a manual status next to `Ready`; it does not take money [suspected]. Remove from this row.
- Reason drop-down + note box — show only when `Sub`, `Edit` or `NA` is pressed, attached to that line.
- `Daily close` and `Shelf locations` — unrelated to the prescription in hand.
- Prescription ID (`cmwepyaii000q7d00no0zi6rk`) in the patient strip — means nothing to a pharmacist.

**What the review actually buys** [measured]. `Open bill` is enabled at "0/2 lines reviewed" (screenshot 02), the
table's `Bill` skips review entirely, and nothing chosen here reaches the bill: Meena's `Sub` on Glutathione and
`NA` (with reason and note) on the shampoo were followed by a bill with all three original lines, the shampoo
still "No match" ([10](J5-dispense-prescription-screens/10-exception-bill-lines.jpg)). A pharmacist looking at
each medicine before it leaves the counter earns its place; *clicking* Accept on each one, in a screen that
neither gates the bill nor informs it, does not.

**Queue order**: newest first (Sita, Anil, Meena, Rahul = reverse of creation), and the newest is pre-selected.
A counter serves the longest-waiting patient first.

### Pharmacy Counter, the table under the cockpit — [04-counter-queue-table.jpg](J5-dispense-prescription-screens/04-counter-queue-table.jpg)

- This is the second showing of the queue, one scroll below the first. It is the better one: patient, doctor,
  time, medicines with dispensed/prescribed counts, stock per line with the linked item, and one `Bill` button.
- Removable: the white strip "Prescription Queue — Review visit prescriptions and send approved medicines into a
  Sales bill." directly above the card titled "Prescription dispensing queue" (same thing named twice); the green
  pill "Validate before adding stock" (unrelated to a queue).
- Rows are tall (≈250 px for two medicines) because each medicine's stock line stacks badge, name and `Change
  link` vertically. `Change link` could be an icon on the stock line.
- Two refresh icons (card header and per row); the per-row one reloads the whole list [suspected, per story].
- A **Dispensed** row keeps an enabled `Bill` button [measured: Sita and Anil rows after payment].

### Sales bill page, on arrival — [05-bill-page-queue.jpg](J5-dispense-prescription-screens/05-bill-page-queue.jpg), [06-bill-arrival.jpg](J5-dispense-prescription-screens/06-bill-arrival.jpg)

- Third showing of the queue. It is rendered above every new bill, including one opened *for a specific
  prescription* (`sales/bill/page.tsx:131`). Arriving from the Counter, the page auto-scrolls past it
  (`:123`), which leaves another patient's row and the pager at the top of the view, pushes the app's top bar off
  screen and leaves a blank band at the bottom [measured: `window.scrollY` 64].
- Take away: when the URL names a prescription, do not render the queue at all (keep a small "Switch
  prescription" link). When it does not (`New sale`), the queue is useful — that page is in effect a complete
  dispensing workstation (queue → `Load` → confirm → `Start a new invoice`).
- "Linked Prescription" box: the raw prescription ID and "Items from prescription: 3" tell the pharmacist nothing
  the lines below do not. Keep only the sentence "Changes here do not alter the doctor's prescription." and any
  line that needs attention.
- Header: title "Sales", tabs `Sales` / `Returns`, and `Back to Sales`. On a bill the tabs are navigation noise,
  and nothing names the Counter the pharmacist came from.

### Link item dialog — [07-link-item-dialog.jpg](J5-dispense-prescription-screens/07-link-item-dialog.jpg)

- As a dialog it is close to minimal: search prefilled with the prescribed name, one candidate, one radio, one
  button. The explicit confirm earns its place because the match is remembered for every future patient.
- What should be taken away is the *need* for it here *(catalogue gap)*: the line already carries its stock item
  (the table says "In stock … Change link"), the dialog offered exactly that same item, and the pharmacist had to
  select and confirm it once per medicine — 9 clicks for Rahul's three lines [measured]. The candidate line also
  starts with a stray "·" where the manufacturer is blank.

### Sales bill, items and totals — [08-bill-items.jpg](J5-dispense-prescription-screens/08-bill-items.jpg), [09-bill-summary-payment.jpg](J5-dispense-prescription-screens/09-bill-summary-payment.jpg)

- Good: patient, doctor, billing name, phone, medicines, directions, price, GST and payment mode (Cash) all
  arrive filled in [measured]. One primary button.
- Each medicine card is about 510 px tall, so one medicine fills the screen and a three-line bill is 3,665 px of
  scroll in an 836 px view [measured]. Most of the height is the "Prescription directions" block (Dosage,
  Frequency, Duration, Instructions as editable fields), which already appears read-only two inches above it in
  the blue "Frequency / Duration" box. Collapse the editable block behind "Edit directions".
- Removable per line: the "DRUG" badge (every line is a drug), the clipboard emoji plus link icon plus
  "Prescription" badge (three marks for one fact), the empty "•" bullet when pack size is unknown.
- Removable in "Add Items to Invoice": the `A- / 100% / A+` font-size control; for a prescription bill the whole
  add-items card could sit below the lines, since adding is the exception.
- "Billing Name" and "Phone" repeat the Patient field (useful only when someone else pays) — collapse to
  "Bill to: Rahul Jfive · 98520 00051 · Change".
- Hierarchy: the Total and the pay button are in the right column and scroll away with it; the amount to collect
  is the most important number on the page and should stay in view with the button.

### Sales bill with problems — [10-exception-bill-lines.jpg](J5-dispense-prescription-screens/10-exception-bill-lines.jpg)

- The red badges "Insufficient stock: 6 available" and "No match" are clear and sit on the right line. Keep.
- Pressing `Print Preview` with an unresolved line gives a red toast "Medicine needs review — Select a replacement
  or remove each unmatched medicine…" with no pointer to the line, which is two screens further down [measured].
- `Substitute` on the unstocked shampoo → "Choose a replacement for … The prescribed quantity will be kept." →
  search → "No matching drugs found in the drug master." and nothing else to do *(catalogue gap)* [measured].

### Print preview and the finished bill — [11-print-preview.jpg](J5-dispense-prescription-screens/11-print-preview.jpg), [12-invoice-confirmed.jpg](J5-dispense-prescription-screens/12-invoice-confirmed.jpg)

- A deliberate last look before stock moves and a tax invoice number is issued earns its place — a confirmed
  bill can only be changed by a return. The step is right; its dress is wrong.
- Two primaries: green `Confirm Invoice` at the top, dark `Confirm & Print` at the bottom, and `Close` between
  them in weight. Pick one primary.
- The patient's name appears three times (header, Bill To, info box) and the total three times (chip, Grand
  Total, info box). The info box (Invoice / Status / Patient / Total) can go.
- **The payment mode appears nowhere** — not before confirming, not on the confirmed bill, not on the invoice
  [measured in 11 and 12]. The pharmacist commits "₹1,551.20 received in cash" without the screen saying so.
- `Copy Type` and `Preview Zoom` are rare; `Download PDF` is shown disabled. Move behind "More".
- After confirming, the bill is `PHI-2026-001 · Confirmed` with `Print`, `Download PDF`, `Close`. Nothing says
  "Paid", and there is no "Next prescription".

### After Close — [13-after-close-notice.jpg](J5-dispense-prescription-screens/13-after-close-notice.jpg)

- `Close` returns to the full bill form with every field still editable-looking and `Print Preview` still the
  primary button. The only sign that the bill is done is an amber notice "This checkout is confirmed. Reopen it
  for another copy." placed **above** the Linked Prescription box — off screen at the scroll position the user is
  left at (the screenshot was taken after scrolling up to find it) [measured].
- Three exits (`Reopen confirmed invoice`, `Start a new invoice`, `Back to Sales`), none of which returns to the
  Counter. `Start a new invoice` is the closest to "next patient" and works well (empty bill, queue above).

### Counter after payment — [14-counter-after-payment.jpg](J5-dispense-prescription-screens/14-counter-after-payment.jpg)

- Rahul's paid prescription shows an amber chip "Bill" and is counted under `Exceptions` and `Ready/Paid` at the
  same time; the table calls the same prescription "Partial" (3/30). Cause: the bill was corrected from 30 strips
  to 3 (see Clarity, quantity). A paid patient should not look like one still waiting to be billed.
- Finished cards stay in the default "All" list and still read "12m pending" next to the chip "Done" [measured].
- Filter chip `Done` narrows the list but the Active Dispense panel keeps showing a prescription that is not in
  the filtered list [measured].

---

## The Simpler Version

Same goal — the right medicines leave the counter, the money is taken, the queue moves on — in the fewest steps
a pharmacy needs.

1. **Click `Pharmacy Counter`.** The page is two panes. Left: one queue, longest-waiting first, with a count.
   Right: the bill for the first waiting prescription, already open — patient, doctor, and one compact row per
   medicine showing the matched product, stock, shelf, batch and expiry, quantity **in packs with the unit
   written out**, price and line total. (Click another patient only if needed.)
2. **Look at the lines; touch only the flagged ones.** A line that is in stock needs no click. A flagged line
   offers its fix in place: `Substitute` (picker), `Not available` (reason), or a quantity edit. Those actions
   *are* the pharmacist's review record.
3. **Choose the payment mode if it is not cash, then click `Confirm & collect ₹1,551.20`.** One click commits
   stock, bill and payment, and prints if that is the saved preference. The button carries the amount and the
   mode so the commit is unmistakable.
4. **Finished-bill panel**: "PHI-2026-001 · Paid ₹1,551.20 · Cash", with `Print` / `WhatsApp`, and one primary
   button `Next prescription`. The queue has already dropped the patient.

Happy path: **4 clicks** (Counter, Confirm, Next — plus one to pick a patient), against 10 today on clean data and
20 as measured.

**Changes to get there**

| # | Change | Effort | Files |
|---|---|---|---|
| 1 | Make the review column reachable at laptop widths: let the row wrap or stack the Action buttons under the medicine below ~1700 px, and stop the patient strip's status rail from taking the whole row | S | `frontend/src/components/pharmacy/PharmacyCounterCockpit.tsx` :609, :859, :980–981, :1025 |
| 2 | One queue per page: drop the table under the cockpit (or drop the cockpit's Queue column and keep the table); sort longest-waiting first; hide Done by default | M | `frontend/src/app/dashboard/pharmacy/pharmacy-workspace.tsx` :377–393; `PharmacyCounterCockpit.tsx` :248, :268–280 |
| 3 | Do not render the queue above a bill opened for a named prescription; scroll the page's own container, not the window | S | `frontend/src/app/dashboard/pharmacy/sales/bill/page.tsx` :123, :131 |
| 4 | Remove dead and duplicate buttons: `Rx queue`, header `Bill`, `Collect payment`, `Ready`; move `Paid` out of the row | S | `PharmacyCounterCockpit.tsx` :586–598, :934–949, :1230; `pharmacy-workspace.tsx` :379 |
| 5 | A stock item the prescription already points at should bill without a second link: create the catalogue product when stock is added or the line is first linked, not at the till | M | `backend/src/modules/pharmacy/pharmacy-prescription-queue.service.ts` :1240–1262, :1300–1305; `pharmacy-stock-identity.ts` :162; `PharmacyInvoiceBuilderFixed.tsx` :605–607, :2164 |
| 6 | One place for line decisions. Either carry `Sub` / `Edit` / `NA` + reason from the dispense task into the bill, or (simpler) delete those buttons and record the review from the bill's own `Substitute` / remove / quantity edits | M–L | `PharmacyCounterCockpit.tsx` :1070–1075; `PharmacyInvoiceBuilderFixed.tsx` (prescription load, :599–640) |
| 7 | Rename `Print Preview` to `Review & confirm`; in the dialog one primary `Confirm & collect ₹… (Cash)`, with "without printing" as a quiet option; show the payment mode on the draft and on the confirmed bill | S | `PharmacyInvoiceBuilderFixed.tsx` :3034, :3148, :3173, :3267 |
| 8 | After confirming, replace the form with a finished-bill state ("Paid ₹… · Cash", `Print`, `Next prescription` → queue); retire the amber notice | M | `PharmacyInvoiceBuilderFixed.tsx` :2186–2191; `sales/bill/page.tsx` :164 |
| 9 | Quantity in packs with the unit shown ("3 strips = 30 capsules"); flag a line whose quantity looks like a dose count | M | `PharmacyInvoiceBuilderFixed.tsx` :621; `backend/src/modules/pharmacy/pharmacy-billing-quantity.ts` |
| 10 | Collapse "Prescription directions" and "Billing Information" on prescription bills; keep Total + confirm button in view | S | `PharmacyInvoiceBuilderFixed.tsx` :2819, :2975 |
| 11 | Demote the cockpit's status rail, checklist tiles and Scan next card; keep one status badge and the shelf/batch facts on the line | S | `PharmacyCounterCockpit.tsx` :878, :1114–1176, :1363 |
| 12 | Desk: put "N prescriptions waiting" on the `Pharmacy Counter` tile; make `New sale` say "Walk-in sale" | S | `pharmacy-workspace.tsx` :331–345 |

Changes 1, 3, 4, 7 are small and remove most of the stalls without touching the design. Changes 2, 6 and 8 are
the ones that actually shorten the journey.

**Steps that earn their place and should stay**: the explicit "Confirm and remember match" when a link is
genuinely new; the block on confirming a bill with an unmatched or unpriced line; a single deliberate commit
before stock and money move; the stock warnings on bill lines.

---

## Clarity Issues

- **Three sidebar names for one job.** "Pharmacy Desk", "Pharmacy Counter" and "Sales" all reach the prescription
  bill. Desk = overview, Counter = dispensing, Sales = register is a fair split, but the Desk tile "New sale — Bill
  a prescription or walk-in" and the queue on every new Sales bill blur it.
- **Four vocabularies for one status** [measured on one prescription]: card chip `Queued / Review / Bill /
  Partial / Done`; rail `Queued / In Review / Partially Filled / Ready to Bill / Paid / Dispensed`; table
  `Pending / Partial / Dispensed`; lane chips `Queue / Review / Exceptions / Done`. The chip "Bill" is also the
  name of a button. Pick one set — *Waiting, Being checked, Ready to bill, Paid* — and use it everywhere.
- **"Bill", "Invoice", "Sale", "Checkout"** for the same document: `Bill` / `Open bill` / `New bill`, "Add Items
  to Invoice" / "Invoice Summary" / "Pharmacy Invoice Preview" / `Confirm Invoice`, `New sale` / "Sales", and
  "This checkout is confirmed". The rest of the app's pharmacy menu says Sales and bills.
- **"No inventory match — Needs pharmacist action"** is shown for a line that is linked and in stock, and
  "Needs pharmacist action" is in fact the fallback text for a blank manufacturer (`PharmacyCounterCockpit.tsx:1043`)
  — it still appears after the product is matched [measured on a matched Doxycycline line]. It reads as an
  instruction and no action is offered.
- **"link inventory before billing"** / `Link item` / `Change link` / "Confirm and remember match" / "Inventory
  Match" / "No match" / "UNMATCHED" / "Unmapped" — seven words around one idea. To a pharmacist: "Which product on
  our shelf is this?"
- **`Sub`, `NA`, `Edit`** — abbreviations on the most safety-relevant buttons of the screen. "Substitute", "Not
  available", "Change quantity". `Edit` opens no editor [suspected, per story].
- **`Quantity` has no unit.** The line says "• 10 caps" (the pack) and `Quantity 30`; the stock unit is strips. As
  loaded, Rahul's bill was 30 strips = 300 capsules, ₹7,728 instead of ₹772.80, with no warning [measured; the
  prescription was created by API with quantity 30 for a 30-day course, so how the doctor's builder fills
  quantity is **suspected** — but two other critics' rows in the same queue read "Doxycycline … 0/28" and
  "Adapalene 0.1% Gel 15g 0/42", the same pattern]. This is money and medicine safety; it deserves the unit and a
  conversion on the line.
- **Raw codes on screen**: "CAPSULE ONCE_DAILY", "MG TWICE_DAILY", "Frequency: ONCE_DAILY", "30 DAYS"; the
  prescription ID `cmwepyaii000q7d00no0zi6rk` in the cockpit strip and the bill's blue box; "1 medicines".
- **`Print Preview`** is the label of the step that confirms the bill, takes payment and moves stock.
- **"Draft previews are confirmed before printing or PDF export."** and **"Invoice #: Given when the bill is
  printed"** — the number is given on confirming, not printing (it appeared after `Confirm Invoice` with no
  print) [measured].
- **"This checkout is confirmed. Reopen it for another copy."** — "checkout" is used nowhere else; "Reopen"
  suggests editing a closed bill. Say "Bill PHI-2026-001 is paid. Print another copy / Next prescription".
- **"Pick + Pay"** — nothing is paid in that column; **"Scan next" / "Barcode — Confirm batch"** — nothing can be
  scanned; **"Daily close"** opens partner sync, not the cash close [suspected, per story];
  **"Validate before adding stock"** sits on a queue header.
- **"Review every medicine before billing"** remains after every line is reviewed if one is `NA`
  ([03](J5-dispense-prescription-screens/03-cockpit-review-1920.jpg)). Say what is actually blocking: "1 medicine
  not available — bill the rest".
- **"12m pending"** on a card whose chip says "Done".

---

## Already Minimal

- **Queue table row → `Bill`**: two clicks from the sidebar to a prefilled bill, exactly STORY-066's ideal
  [measured]. This is the route to keep.
- **Bill prefill**: patient, doctor, billing name, phone, each medicine, directions, price, GST and Cash all
  arrive filled; on clean data the pharmacist types nothing [measured].
- **Remembered links**: after Rahul's sunscreen was linked once, Sita's sunscreen line needed no link
  [measured]. The mechanism is right; only its timing (at the till) is wrong.
- **Link dialog**: prefilled search, one choice, one confirm.
- **Commit**: one click creates the bill, issues the number, deducts stock (60 → 57 strips seen in the queue
  table) and records the payment; the Sales register shows the row at once with a Cash badge [measured].
- **Payment method**: one select, four options, sensible default.
- **Stock warnings on bill lines** ("Insufficient stock: 6 available", "No match") and the refusal to confirm an
  unmatched line — clear, in the right place, and worth their step.
- **`Substitute`** states what will happen before the pharmacist picks: "The prescribed quantity will be kept."
- **"Changes here do not alter the doctor's prescription."** — one sentence that answers a real worry.
- **`Start a new invoice`** on a bill page that already lists the queue is a tight next-patient loop
  (`Load` → confirm → `Start a new invoice`).
- **Queue table defaults to Pending and shows waiting time** per patient.

---

## Functional bugs tripped over (not verified further)

- Cockpit review table: Action column clipped and rows squeezed to 0–112 px high on 1280–1536 px wide screens (900 px tall);
  `Accept / Sub / Edit / NA` unreachable by mouse (`PharmacyCounterCockpit.tsx:609`, `:980`, `:1025`).
- Cockpit patient strip: patient name collapses to 0 px width and the status badge wraps one letter per line at
  1440 (`PharmacyCounterCockpit.tsx:859`).
- `Rx queue` does nothing (`pharmacy-workspace.tsx:379`).
- Opening a prescription bill scrolls the browser window itself by 64 px: top bar gone, blank band at the bottom
  (`sales/bill/page.tsx:123`).
- Demo database has no medicine catalogue (`drugs` = 0 rows): every prescription line arrives "No match" and
  `Substitute` search finds nothing.
- Cockpit shows "No inventory match / Unmapped / No batch / No expiry" for lines whose stock item is linked and
  in stock; "Needs pharmacist action" is printed even for a matched product (`PharmacyCounterCockpit.tsx:1040–1043`).
- Cockpit decisions (`Sub`, `NA`, reason, note) are not carried to the bill.
- A fully Dispensed prescription keeps an enabled `Bill` button in the queue table (second bill not attempted).
- Prescription quantity is billed as that many stock packs (30 capsules → 30 strips) with no review flag
  [suspected for builder-made prescriptions].
- Pharmacy Desk title is invisible in the dark header at 1440; Sales figure truncated to "₹…".
- Marking a line `NA` moves the prescription out of the table's default Pending view although nothing has been
  dispensed (Meena disappeared from the bill-page queue).
