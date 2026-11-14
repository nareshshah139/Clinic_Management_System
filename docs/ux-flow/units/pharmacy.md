# Unit `pharmacy`: counter and sales bill

- Worktree `/home/user/wt/pharmacy`, branch `ux/pharmacy`.
- Read in full: `docs/ux-flow/journeys/j04.md`, `docs/ux-flow/journeys/j06.md`; in `docs/ux-flow/redundancy.md` proposed change 6 and naming table 4.4.
- Journeys you own: `j04` (baseline 7), `j06` (baseline 15).
- Main files: `frontend/src/components/pharmacy/PharmacyInvoiceBuilderFixed.tsx` (3,200 lines), `PharmacyCounterCockpit.tsx`, `PrescriptionDispensingQueue.tsx`, `frontend/src/app/dashboard/pharmacy/pharmacy-workspace.tsx`, `frontend/src/app/dashboard/pharmacy/sales/{page,bill/page}.tsx`, `backend/src/modules/pharmacy/pharmacy-invoice.service.ts`, `backend/src/modules/pharmacy/dto/pharmacy-invoice.dto.ts`, `backend/prisma/schema.prisma` (item 1 only), and their tests. This is money and stock: totals, tax, stock deduction, invoice numbering and the checkout state machine do not change except where items 1 and 5 say so. Read every `@cc` rule in each file before editing it.

## Build
1. **A walk-in sale needs no patient record, only a name and a phone.** The owner decided this. Today the patient is required and j06 had to borrow an unrelated registered patient, whose home address then printed on the receipt. The bill page gets a "Walk-in customer" choice beside the patient search; with it, the pharmacist types the customer's name and phone (both required) and no patient is selected.
   - Do this last, after items 2 to 8 are proven, and commit it separately.
   - Start with a census: every place that reads a pharmacy invoice's patient (`grep -rn "patientId\|\.patient\b" backend/src/modules/pharmacy backend/src/modules/reports backend/src/modules/inventory frontend/src/components/pharmacy frontend/src/app/dashboard/pharmacy`), including the sales register, returns and refunds, PDFs and print, Daily Collection, the pharmacy reports, GST exports and any raw SQL. Write the list into your report.
   - If `PharmacyInvoice.patientId` must become nullable, add a Prisma migration that only drops the NOT NULL (follow the naming and style of the newest folders in `backend/prisma/migrations`, and note that `.gitignore` ignores `*.sql` except listed migrations: add the un-ignore line the same way the others are listed). Existing rows are untouched. The stack harness uses `prisma db push`, so the schema change is picked up there.
   - Every reader must handle a bill with no patient: show the billing name and phone, never crash, never show another patient's details. A prescription medicine that requires a prescription keeps whatever rule it has today.
   - Tests: a backend spec that creates, confirms, lists, reprints and refunds a walk-in bill, and a frontend test for the bill form in walk-in mode.
   - If the census shows this cannot be done safely in this unit (for example a report that joins on patient in raw SQL you cannot verify), stop before the schema change, leave items 2 to 8 in place, and report the census and what blocks it.
2. **Payment method as visible buttons** (the modes the select offers today), Cash preselected.
3. **One way to finish a bill.** The bill page's primary button confirms the bill and takes the payment ("Confirm and print"); the preview is an optional secondary button. After confirming, show the finished bill (reuse the existing finished-bill view) with "Print" and one next step ("New sale", or back to the waiting prescriptions when the bill came from one). The preview keeps a single confirm button; remove the duplicate "Confirm Invoice" and duplicate download buttons there. The checkout attempt and retry rules stay exactly as they are.
4. **Enter in the medicine search adds the top match and puts the cursor in its quantity.** The top match is visibly marked before Enter.
5. **Tax % for a manually added medicine comes from that medicine's own GST rate**, not a fixed 18. First prove the defect on the running app or in a test. If real, fix it the way the prescription-loaded path does (`getDrugGstRate`) with a test that pins the rate. If not real, change nothing and say so.
6. **A sale with no prescription hides what it does not use**: doctor field, directions block, Treatment Packages tab and print font controls stay one click away but off the main path; "Bill discount" collapses.
7. **Counter**: one "Bill" button per prescription (remove the "Open bill" and "Collect payment" duplicates); remove the second "Prescription Queue" section; point "Daily close" to Daily Collection; fix the "Inventory Control" and "Shelf locations" links to the `area` and `view` values the Inventory page reads (`frontend/src/components/inventory/InventoryWorkspace.tsx`). Keep the Pause, Ready and Paid buttons. The bill form comes first on the bill page; the prescription queue stays reachable there without pushing the form down.
8. **Names** per the naming table, display text only: "Bill" for the document, "New sale" for the action, "Medicine" for the stocked thing. **Guides stay** (owner decision): rewrite any Quick Guide or tour step on these screens to match. Apply the rest of both Subtext tables.

## Do not build
- Removing the Pharmacy Desk, the Pharmacy Invoices list or Inventory "Counter sales".
- Dashboard or sidebar changes. Your scripts keep starting from `/dashboard` through the sidebar.

## Expected
- `j04`: 7 to 4 (Menu: Pharmacy Counter, Bill, UPI, Confirm and print). Goal unchanged.
- `j06`: 15 to 9 or fewer with item 1 (Menu: Sales, New sale, Walk-in customer, name, phone, two medicines with quantities, Confirm and print). Goal: a confirmed, paid cash invoice today with 10 Cetirizine and 1 Sunscreen, no patient attached, billing name and phone as typed, and each line's tax matching that medicine's GST rate in the seed. Also assert the printed or previewed bill shows no address.
- The bill and its preview scroll inside their own container, so also capture the scrolled-down state for your visual check.
