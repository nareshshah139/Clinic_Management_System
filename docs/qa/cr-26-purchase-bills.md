# CR-26: Purchase bills register

Inventory > Purchases now opens on **Purchase bills**, an eVitalRx-style list of supplier bills with payment status on every row and a two-step **Mark paid** with Undo.

## What the pharmacist sees

- Columns: Sr No, Bill No, Entry Date, Bill Date, Entry By, Distributor, Bill Amount and Payment. Every column fits at 1280 and 1440 px. Bill No stays pinned on a 390 px phone.
- Sr No counts entry order within the current filter. Sorting covers every column except Payment, whose header sorts by amount outstanding.
- The Payment badge is one of:
  - **Paid**
  - **Due**
  - **Overdue · Nd** (solid red, also when part paid)
  - **₹X due** with the amount already paid
  - **Scheduled dd/mm** for a payment dated in the future
  - **Not posted**, naming its review state
  - **Cancelled**
- Filters: bill number or distributor search, a financial-year date range, payment status (Outstanding, Due, Overdue, Part paid, Paid, Not posted) and More filters (distributor, bill status, source, entry by).
- Footer: "Bills ₹X · Outstanding in these N bills ₹Y" (CR-27 renamed it so it cannot be read as the all-bills Due on the distributor strip). It counts posted bills only and says how many not-posted and cancelled bills it leaves out. Outstanding links to Payments & dues for the filtered distributor.

## Settling a bill

- **Opening:** Mark paid opens a small dialog on the payment mode. The amount is the bill's payable balance: outstanding less any scheduled payments, which is exactly what the ledger accepts. The dialog takes a date (dd/mm/yyyy, not after today, not before the bill date) and an optional cheque or UTR number.
- **Recording:** it posts an ordinary supplier ledger payment with one request key, so a double click or a retry records one payment.
- **Undo:** the row shows Paid with its own Undo for 30 seconds. Several bills can be settled in a row by keyboard, and each keeps its own Undo.
- **Focus:** after each payment, focus moves to the next bill's Mark paid.
- **Short payment:** if the balance grew meanwhile, it says "Recorded ₹X; ₹Y still due".
- **Changed balance:** if the balance changed or the payment was already recorded, the dialog closes, the list refreshes and it says so plainly.
- **Original bill:** a paperclip in the Bill No cell opens the uploaded bill.
- **Export to Excel:** downloads from the same register query, so it carries every filter.
- **Today screen:** its "Purchase invoices to review" card opens this list filtered to Not posted, and its count uses the same financial year.

## Server changes

- `GET /pharmacy/purchase-register`, plus `?format=xlsx` for the export.
- Payment state is derived from shared helpers in `purchase-payment-balance.ts`, which the ledger also uses. Supplier payment dates given as a day are stored at the start of that day in Asia/Kolkata. The register counts only payments whose date has arrived.
- The ledger's aging, alerts and due counts use clinic days. Payments dated before the bill are refused.
- Purchase bill date filters use Asia/Kolkata day bounds, and a new index on (branchId, invoiceDate) supports them.
- The stack harness applies the inventory read-query SQL that `prisma db push` skips. That was the cause of a 500 on the Today screen in tests only.

## Verification, 06/11/2026

- `scripts/stack/scenarios/cr26-purchase.cjs` runs 20 scenarios on the real stack with a seeded year of supplier bills, payments, credits and scheduled payments. All 20 pass.
  - **Settling:** keyboard settling of three bills, inline Undo, idempotent retries, the under-pay warning, stale balances and scheduled payments.
  - **Filters and export:** the Excel export with filters, and the Today link.
  - **Layout and access:** original documents, row density, roles, and the regression check against trunk.
- The CR-24/25 sales suite still passes on the shared RegisterGrid.
- Backend: 47 suites and 660 tests pass in `src/modules/pharmacy` and `src/modules/inventory`, including the register database spec. That spec proves the register and the ledger agree for a reallocated payment, a reversed credit allocation and a future-dated payment.
- Frontend: 55 suites and 645 tests pass. The production TypeScript check passes.
- Reviews: two (correctness and money; the user's experience and simplicity) and a closure review. All findings were fixed or dismissed with a reason. The trail is in `docs/qa/cr-24-31-decisions.tsv`.

## Open questions for the clinic

- Should accountants see this list? They can record supplier payments in Payments & dues, but the register's roles exclude them.
- The default payment mode, when none has been used in that browser, is NEFT.
