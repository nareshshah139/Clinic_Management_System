# Inventory and OCR simplification

The everyday path is **Scan or type → Check details → Add stock**. Scan and Save invoice now keep a reviewable draft without invoking automatic processing. Automatic import and processing remain available as explicit secondary options.

## Changes

- Everyday tasks appear first; remaining inventory tasks are available under More tasks. Today has direct entry points for scanning a bill and finding/correcting stock.
- Stock defaults to a shorter table. Purchase cost, MRP, physical quantity, held quantity and unit columns remain available under Show cost & stock details. All existing stock/expiry filters, sorting, exports, counts and depleted batches are retained.
- OCR shows numbered progress, outstanding checks, product count, printed total, calculated total and the difference. A missing printed total stays unknown. Zero OCR checks does not claim that a person verified the bill.
- Correction links open collapsed sections and focus the relevant field. Detailed explanations are disclosed on demand. Historical-stock warnings remain visible.
- Product-detail editing is a named button. The basic form contains name, batch, expiry, shelf and manufacturer; classification, tax, limits, codes and prescription defaults remain available under More details.
- Stock, price and product-detail forms show saved/proposed values. A reason is required. Stock/price corrections retain doctor/admin approval and stale-revision safeguards.
- Batch-number and expiry corrections now use the existing inventory metadata endpoint. They require item-update permission, the saved revision and a reason; the existing serializable transaction writes the correction and audit together. Invalid calendar dates fail before writing. Expiry stays valid through the selected UTC day. Quantity, pack units, historical cost and original invoice rows are not rewritten.

## Verification

- 165 frontend tests passed across the affected inventory, purchase workbench, supplier review, source preview, checklist, summary and review utility suites in the isolated release checkout. Three checklist assertions were updated to the revised accessible labels; its eight tests passed on rerun.
- 17 backend tests passed across `inventory-detail-corrections.spec.ts` and `inventory-workspace-batches.spec.ts`, covering reasons, stale revisions, permissions, leap days, invalid dates, audit contents and unchanged balances.
- Clean dependency installation from the lockfile and the complete production build passed: shared types, Next.js frontend (including source type checking), and NestJS/SWC backend.
- `cc-check format` and `cc-check list` passed for all 10 affected production source files. The contracts were also checked against the implemented state changes and guards.
- Impeccable's mechanical detector reported no findings. Desktop (1440px) and phone (390px) views were visually inspected; no page-level horizontal overflow was detected.
- Browser acceptance passed with synthetic data: manual entry, scan-only endpoint, correction/save without stock writes, one explicit review/commit, persisted expiry correction, and a stock-count approval request. No browser page errors were recorded. See [request trace](../../output/inventory-simplicity/acceptance.json).

Obscura was attempted first but stalled on this Next.js page; Chrome was used for browser verification. The synthetic API isolates these checks from clinic data and external OCR. Live OCR model accuracy was not benchmarked, no production data was changed by these acceptance checks. This document records pre-release verification.

The backend uses the repository’s SWC production build. A clean standalone whole-backend TypeScript check is not claimed.

The release was prepared on `9842a883cefa0c7a86d443d656e87720a18aab6a` (current main), preserving its supplier-GSTIN corrections and existing product matching. Unrelated local work was excluded. Railway preflight found both production services healthy, no pending or failed migrations, no migration checksum differences, and startup seeding disabled. No schema migration is included.

## Reproduce browser acceptance

Run these in separate terminals from the repository root:

```sh
node scripts/diagnostics/inventory-simplicity-fixtures.cjs
NEXT_PUBLIC_API_PROXY=http://127.0.0.1:4026 npm run dev --workspace=frontend -- --hostname 127.0.0.1 --port 3126
node scripts/diagnostics/inventory-simplicity-browser.cjs
```

The browser script uses an isolated headless Chrome session and a synthetic auth cookie. Restart the fixture API for each acceptance run. Screenshots and the request trace are written under `output/inventory-simplicity/`.
