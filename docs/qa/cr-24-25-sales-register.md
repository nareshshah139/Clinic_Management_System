# CR-24 and CR-25: Sales register with Sales and Returns

Pharmacy staff now have one **Sales** page in the sidebar, with **Sales** and **Returns** tabs. It lists patient pharmacy bills and walk-in counter sales together, so the pinned total is the day's real takings.

## What the pharmacist sees

- Columns: Bill No, Entry Date, Bill Date, Entry By, Patient, Mobile, Bill Amount, Payment, and Print and WhatsApp actions. At 1280 and 1440 px every column fits without sideways scrolling.
- Every data column sorts both ways from its header. Bill numbers sort by their numbers, so PHI-2026-009 comes before PHI-2026-010. Drafts sort last.
- The filter bar has a field search (bill number, patient, mobile), a date range, a payment filter and More filters (state, source, entry by) with a count of active filters.
- The date range defaults to the current financial year. Presets cover Today, Yesterday, Last 7 days, This month and the last two financial years. Dates are entered and shown as dd/mm/yyyy.
- Payment badges show how a bill was actually paid. A red **Due ₹X** badge marks money still to collect. With a payment filter, the footer shows what was collected in that mode, so the cash drawer can be checked against it.
- Drafts show an amber **Draft** badge with their reserved number. Opening a draft goes to the invoice list, where it can be confirmed, paid or deleted.
- Print escapes every value, carries the clinic header, prints through a hidden frame and works for counter sales and returns. Drafts and cancelled bills cannot be printed or sent.
- WhatsApp opens a message to the patient's number that names the clinic, the bill, the date and any balance due. Refund messages name the bill they were against.
- Returns use the same layout. Each return shows the bill it was against, worked out from its stock lines. Refunds on store credit show a neutral **Store credit** badge.
- On a 390 px phone the filters collapse into one Filters control, and the footer is a single line.

## Server changes

- `GET /pharmacy/sales-register` merges `PharmacyInvoice` bills and `COUNTER_SALE` workflow documents, or lists `SALES_RETURN` documents. It filters, sorts, pages and totals on the server. Date ranges use Asia/Kolkata days and are capped at 400 days.
- `PharmacyInvoice.createdById` records who created a bill. The migration fills it for older bills from each bill's first sale stock movement, and a separate migration indexes it concurrently.
- Workflow document dates default to the clinic's day in Asia/Kolkata rather than the UTC day.
- The workspace return link only follows same-origin `/dashboard/` paths.

## Verification, 06/11/2026

- `scripts/stack/scenarios/cr24-sales.cjs` runs 23 scenarios against the real NestJS backend and Next.js frontend, using a private schema in a local Postgres seeded with a financial year of bills, counter sales and returns. All 23 pass. Results are written to `output/stack/cr24/results.json`.
- Backend: 43 suites and 624 tests pass in `src/modules/pharmacy` and `src/modules/inventory`. The sales register database spec covers the migration backfill and the index.
- Frontend: 49 suites and 579 tests pass in `__tests__/pharmacy`, `__tests__/inventory` and `__tests__/lib`. The production TypeScript check passes.
- Three reviews (correctness, simplicity, the pharmacist's experience) and a closure review were run. Every finding was fixed or dismissed with a reason. The decision log is `docs/qa/cr-24-31-decisions.tsv`.

## Open questions for the clinic

- Should reception see the Sales page? The endpoint currently allows owner, admin, doctor and pharmacist.
- Should a pending (unconfirmed) bill count as a draft, as it does now?
- Older draft bills keep the date the draft was created as their bill date. The current billing screen confirms at checkout, so new bills are not affected.
- Counter sale references are free text and can repeat.
