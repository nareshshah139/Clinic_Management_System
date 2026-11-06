# CR-27: Purchase returns and credit notes

Purchase bills now has two tabs, Purchase and Returns. A return goes back to the distributor on a challan, waits for the distributor's credit note, and that credit is set off against the distributor's bills.

## What the pharmacist sees

### The Returns tab

- Columns are Sr No, Credit Note No., Entry Date, Credit Note Date, Entry By, Distributor, Amount and Status, the same layout, filters, sortable headers, New button and empty state as the Purchase tab.
- The Distributor cell names the bill the goods came in on and the reason as a chip: Expired, Near expiry, Breakage, Wrong item supplied, Excess supply or Other.
- Status is one of these:
  - **Credit note awaited · 23d** counts days from the date on the return challan, and says "today" on the day.
  - **Received** and **Adjusted** both say how much is left, for example "₹124.00 left".
  - **Fully used**, **Draft** or **Cancelled**.
- An awaited return shows **Record credit note** where its number will go. The dialog takes the number, the date (dd/mm/yyyy, today by default) and the amount (the return value by default). It explains a smaller amount ("₹48.00 less than your return value. Fine if the distributor's note says so."), asks once more for an amount more than a rupee above the return value, refuses a date before the return or after today, and puts focus on the field that failed.
- After recording, focus moves to that row's **Set off** and the toast offers **Set off ₹X now**.
- A pencil next to a recorded number corrects it. The number and date can always change. The amount can change only while none of it is set off. A correction needs a reason, and the return's history keeps the before and after values.
- **Set off** lists the distributor's open bills, due first, filled in up to what each bill has left to pay. The dialog keeps its button on screen with 12 or more bills. After a set-off the row offers **Undo** for 30 seconds.
- The footer reads "Credit held (all dates) ₹X · Awaited ₹Y (N returns) · M returns". Credit held and Awaited cover all dates for the distributor filter, so they match Payments & dues whatever period the list shows. An info button explains this and lists the drafts and cancelled returns left out.
- More, Export to Excel downloads the credit note register with the filters on screen.
- Switching between Purchase and Returns keeps the distributor and the period.

### The Purchase tab and Payments & dues

- When the list is filtered to one distributor, or a search narrows it to one, a strip shows Due, Credit held and Net payable (or In your favour) across all bills, not just this period. On a phone it stacks the three on separate lines.
- When the credit held covers a bill, Mark paid offers **Set off ₹X credit** first, with focus on it. When it covers only part, Mark paid offers it as a link. Set-off from Mark paid marks the bill being paid, and the bill then offers Undo.
- Payments & dues lists a distributor who holds credit but has no bills, and its ledger opens.

### The return document and Today

- A return on challan has **Record credit note** on its own page, so a note handed over at pickup is recorded in one place.
- A standalone supplier credit takes the credit note number and date on its form and posts as Received.
- The return form has a Reason for return list and a free-text "Note (optional)". The stock movement for the return logs the reason with the note, for example "Breakage · Two tubes crushed".
- The Stock menu points to "Supplier returns are now in Purchase bills › Returns".
- Today shows **Credit notes awaited** with the same count as the Returns tab, and opens the tab filtered to them.

## Server changes

- Recording a credit note on a return on challan runs the ordinary posting first, then records the note as its own event that moves no stock. A posted return that never had a credit gets one when its note is recorded.
- `POST /inventory/workspace/documents/:id/credit-note` also takes `correct: true` with a reason.
- The unique credit note number covers open credits only (migration `20261107090000_supplier_credit_note_reuse`), so a reversed return frees its number. Only a clash on that index is reported as a duplicate.
- Set-off lives in `PharmacySupplierCreditService`, and the old `credits/allocate` route follows the same rules: a numbered credit, one bill, capped at what the bill has left to pay. Each set-off is stored with its request key and a fingerprint of its content (migration `20261107091000_supplier_credit_set_offs`). A retry of the same request replays it. A reused key with different content gets 409, and an undone set-off is never replayed. `POST /inventory/workspace/credits/set-off/:id/reverse` undoes a whole set-off.
- Available credit has one computation, `creditBalance`, and a used-up credit shows zero.
- The returns register reads only returns updated from two days before the range, and exports to Excel with `?format=xlsx`.
- The distributor position has its own request, `GET /pharmacy/purchase-register/position`, so typing in the purchase search does not recompute it.

## Verification, 07/11/2026

- `scripts/stack/scenarios/cr27-returns.cjs` runs 22 scenarios on the real stack, mostly as the seeded pharmacist with the default permission set. All 22 pass.
  - **Recording.** Raising a return, the awaited badge with days, recording from the list and from the return document, the duplicate number, a reversed return freeing its number, correcting a note, and a double click recording once.
  - **Setting off.** Set off now from the toast, the cap at what a bill has left to pay, set-off from Mark paid when the credit covers the bill, Undo from both lists, and set-off by keyboard alone.
  - **Totals and screens.** The position strip and footer against Payments & dues, a credit-only distributor, the Excel export, tab switching, the Today card, five rows at 1280 x 800 and seven at 1440 x 900, and a 390 px phone with no sideways page scroll.
  - **Access.** The doctor and an admin record and set off; a reception user with read access sees no write controls, and reception without it gets the access message. Hidden panels send no requests.
- The CR-26 suite passes 20 of 20 and the CR-24/25 suite 23 of 23 as the seeded pharmacist. The access-roles suite passes 93 of 93 checks.
- Backend: 104 suites and 1370 tests pass in `src`, including the purchase returns database spec (22 tests). That spec proves the partial index, number reuse after reversal, the posting and credit note events, correction, set-off replay and refusal, the old allocate path, credit-only distributors and totals across dates.
- Frontend: 93 suites and 976 tests pass. Both production TypeScript checks pass.
- The suite found and fixed these before they shipped: the Status column pushed the table 82 px past the edge at 1280, only three rows showed at 1280, More fell off a 390 px screen, and a duplicate number left focus nowhere because the field was still disabled.

## Open questions for the clinic

- Are these the right return reasons: Expired, Near expiry, Breakage, Wrong item supplied, Excess supply and Other?
- Credit is set off when the clinic chooses, and Mark paid offers it first when it covers the bill. Should it instead be set off on its own when the next bill from that distributor is entered?
- A credit note amount more than a rupee above our return value is accepted after a second confirmation. Should it need a doctor instead?
- Should reception see the Returns tab? Today it needs the purchase read permission, which reception does not have by default.
