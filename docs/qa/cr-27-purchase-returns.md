# CR-27: Purchase returns and credit notes

Purchase bills now has two tabs, Purchase and Returns. A return goes back to the distributor on a challan, waits for the distributor's credit note, and that credit is set off against the distributor's bills.

## What the pharmacist sees

### The Returns tab

- Columns are Sr No, Credit Note No., Entry Date, Credit Note Date, Entry By, Distributor, Amount and Status. The layout, filters, sortable headers, New button and empty state match the Purchase tab.
- The Credit Note No. cell holds the note's number, with the return reference and the bill the goods came in on underneath, for example "RET-SLV-12 · SLV/2026/41". Bill and return numbers never truncate. A long distributor name truncates instead, and shows in full on hover. On a 1280 px screen the entry time moves into the date's tooltip so every reason chip fits. The reason chip sits under the distributor: Expired, Near expiry, Breakage, Wrong item supplied, Excess supply or Other.
- Status is one of these:
  - **Credit note awaited · 23d** counts days from the date on the return challan, and says "today" on the day.
  - **Received** and **Adjusted** both say how much is left, for example "₹124.00 left".
  - **Fully used**, **Draft** or **Cancelled**. A cancelled row strikes through its amount only.
- A draft shows **Open draft** where the number will go.
- Filtering to Awaited with nothing waiting says "No credit notes awaited".
- On a phone, below 640 px, the list is a card list. Each card has three lines. The first has the distributor and the amount. The second has the credit note number or **Record credit note**, then the return and bill, which wrap under it at 390 px. The third has the status and **Set off** or **Undo**. Nothing scrolls sideways.
- The footer reads "Credit held (all dates) ₹X · Awaited ₹Y (N returns)". Both totals cover all dates for the distributor filter, so they match Payments & dues whatever period the list shows. An info button explains this and lists the drafts and cancelled returns left out.
- When the list is filtered to one distributor, the distributor's strip shows above it with **Set off all ₹X**.
- More, Export to Excel downloads the credit note register with the filters on screen.
- Switching between Purchase and Returns keeps the distributor and the period.

### Recording a credit note

- **Record credit note** opens a dialog with the number, date and amount empty, to be typed from the distributor's note. The date is typed as dd/mm/yyyy, like every other date in the app.
- Under the amount, "Return value ₹112.00" has a **Same as return value** button that fills it in.
- An amount below the return value gets a note ("₹48.00 less than your return value. Fine if the distributor's note says so."). An amount more than a rupee above it asks once more.
- The dialog refuses a date before the return or after today, and puts focus on the field that failed.
- If someone else changed the return while the dialog was open, the dialog closes. The message keeps what was typed, for example "Your entry was not saved: credit note CN-1, 05/11/2026, ₹220.00."
- After recording, focus moves to that row's **Set off** and the toast offers **Set off ₹X now**.
- A pencil next to a recorded number corrects it. The number and date can always change. The amount can change only while none of it is set off. A correction needs a reason, and the return's history keeps the before and after values.
- A credit set off before credit note numbers were kept shows as Adjusted. It offers **Record credit note** with its amount fixed, and offers no set-off until it has a number.

### Setting off

- **Set off** lists the distributor's open bills, filled from the oldest due date up to what each bill has left to pay. The due date column is headed "Due date" and overdue dates are red. On a phone the due date sits under the bill number and the column goes.
- The dialog keeps its button on screen with 12 or more bills, and focuses Cancel until the bills load.
- After a set-off the toast says "Undo is in the Status column for 30 seconds" and has its own **Undo**. The rows whose credit was used show **Undo** for 30 seconds.

### The Purchase tab and Payments & dues

- When the list is filtered to one distributor, or a search narrows it to one, a strip shows Due, Credit held and Net payable (or In your favour) across all bills, not just this period. Its **Set off all ₹X** sets off the smaller of the credit held and the amount due. On a phone the strip stacks the three figures and the button spans the width.
- The footer reads "Bills ₹X · Outstanding in these N bills ₹Y", so it cannot be read as the strip's all-bills Due. On a phone it wraps instead of cutting off.
- When the credit held covers a bill, Mark paid is titled "Settle bill SLV/2026/41 · ₹X" and offers **Set off ₹X credit** first, with focus on it. That button sets the credit off against this bill straight away, closes the dialog and shows **Undo** on the row. When the credit covers only part of the bill, Mark paid offers it as a link to the set-off dialog.
- Payments & dues lists a distributor who holds credit but has no bills, and its ledger opens.

### The return document and Today

- A return on challan has **Record credit note** on its own page, so a note handed over at pickup is recorded in one place. The notice that follows has **Set off ₹X now**, and after a set-off the notice has **Undo**.
- If the return changed while the note was being recorded, the page says what changed, for example "credit note CN-90 for ₹220.00 was recorded on it", and keeps what was typed.
- The return and supplier credit forms take and show dates as dd/mm/yyyy whatever the browser's language.
- A standalone supplier credit takes the credit note number and date on its form and posts as Received.
- The return form has a Reason for return list and a free-text "Note (optional)". The stock movement for the return logs the reason with the note, for example "Breakage · Two tubes crushed".
- The Stock menu points to "Supplier returns are now in Purchase bills › Returns".
- Today shows **Credit notes awaited** with the same count as the Returns tab, and opens the tab filtered to them.

## Server changes

- Recording a credit note on a return on challan runs the ordinary posting first, then records the note as its own event that moves no stock. A posted return that never had a credit gets one when its note is recorded.
- `POST /inventory/workspace/documents/:id/credit-note` also takes `correct: true` with a reason. A retry with the same request key replays only when the number, date, amount and reason match. Other content under that key gets 409 `REQUEST_KEY_REUSED`.
- Correcting a standalone supplier credit also updates the number and date on its form. Posting one refuses a credit note dated before the credit.
- The unique credit note number covers open credits only (migration `20261107090000_supplier_credit_note_reuse`), so a reversed return frees its number. Only a clash on that index is reported as a duplicate, on recording and on posting a standalone credit. Prisma cannot express a partial index, so the schema carries a comment and the database spec checks both that the index exists and that `prisma migrate diff` finds no other difference on the credit tables.
- Set-off lives in `PharmacySupplierCreditService`, and the old `credits/allocate` route follows the same rules: a numbered credit, one bill, capped at what the bill has left to pay. Each set-off is stored with its request key and a fingerprint of its content (migration `20261107091000_supplier_credit_set_offs`). A retry of the same request replays it. A reused key with different content gets 409, and an undone set-off is never replayed. A retried `credits/allocate` request from before set-offs were stored replays its original allocation. `POST /inventory/workspace/credits/set-off/:id/reverse` undoes a whole set-off.
- Available credit has one computation, `creditBalance`, used by the register, set-off, the ledger, recording, correcting and reversing. A credit set off before allocations were kept has its stored `applied` above the sum of its allocations. That difference is money already used, so it counts as applied from the day the credit was raised. A legacy credit of ₹75.50 with ₹20 applied shows ₹55.50 left everywhere and can never be set off past ₹75.50.
- The returns totals come from two grouped queries, one over numbered open credits and one over open returns without a number, including standalone credits. The Awaited count equals the rows the Awaited filter lists.
- The returns register reads posted returns updated from two days before the range. Drafts, and drafts cancelled or rejected, are read whatever their last update, because their date was never checked. It exports to Excel with `?format=xlsx`.
- The distributor position has its own request, `GET /pharmacy/purchase-register/position`, so typing in a search does not recompute it.

## Verification, 07/11/2026

- `scripts/stack/scenarios/cr27-returns.cjs` runs 26 scenarios with 125 checks on the real stack, mostly as the seeded pharmacist with the default permission set. All 26 pass. A second full run with `STACK_LOCALE=en-US` also passes all 26.
  - **Recording.** Raising a return, the awaited badge with days, recording from the list and from the return document, empty date and amount with Same as return value, the duplicate number, a reversed return freeing its number, correcting a note, a conflict that keeps the typed entry, and a double click recording once.
  - **Setting off.** Set off now from the toast and from the return document, the cap at what a bill has left to pay, the one-step set-off from Mark paid, Set off all from the Returns strip, Undo from rows and toasts, overdue due dates in red, and set-off by keyboard alone.
  - **Totals and screens.** The position strip and footer against Payments & dues, a credit-only distributor, the Excel export, tab switching, the Today card, five rows at 1280 x 800 and seven at 1440 x 900 with bill numbers whole and long names truncated, a 390 px phone with three-line cards, the set-off sheet without its due column, the stacked strip and a wrapping footer, Mark paid and the return document at 1280 and 390 px, and dates in an en-US browser.
  - **Access.** The doctor and an admin record and set off. A reception user with read access sees no write controls, and reception without it gets the access message. Hidden panels send no requests.
- The CR-26 suite passes 20 of 20 and the CR-24/25 suite 23 of 23 as the seeded pharmacist. The access-roles suite passes 93 of 93 checks.
- Backend: 105 suites and 1384 tests pass in `src` with the purchase register, purchase returns and sales register database specs on their own schemas, including the purchase returns database spec (32 tests). That spec proves the partial index and the schema against the migrations, number reuse after reversal, the posting and credit note events, correction, credit note and set-off replay and refusal, a legacy credit through recording and set-off, the old allocate path and its pre-deploy replay, racing set-offs and racing standalone credits, credit-only distributors, totals across dates and the drafts the date bound used to drop.
- Frontend: 93 suites and 983 tests pass. Both production TypeScript checks pass.

## Open questions for the clinic

- Are these the right return reasons: Expired, Near expiry, Breakage, Wrong item supplied, Excess supply and Other?
- Credit is set off when the clinic chooses, and Mark paid offers it first when it covers the bill. Should it instead be set off on its own when the next bill from that distributor is entered?
- A credit note amount more than a rupee above our return value is accepted after a second confirmation. Should it need a doctor instead?
- Should reception see the Returns tab? Today it needs the purchase read permission, which reception does not have by default.
