# CR-09 — Pharmacy Billing Load

Implemented and verified locally on 2026-09-27. Not deployed; no real patient bills or clinic stock were changed.

## Cause and correction

The browser reproduction loaded Trina's four medicines but left the invoice heading 1,319 pixels below the viewport origin in a 1,000-pixel viewport. Load scrolled to the top of the queue, while the bill was rendered below it. The pending queue did not subscribe to invoice refresh events. Persisted dispensing tasks could also override a billed prescription's Partial status with Pending.

Load now scrolls and focuses the bill, with route scrolling disabled so navigation cannot undo it. A new prescription gets a separate draft. Explicit prescription IDs take precedence over visit prefill; obsolete async results cannot replace the selected patient's bill, including React StrictMode effect replay.

The loader retains every medicine, uses the stock check's product identity, and reads product details by ID. It preserves explicit quantities or the queue's inferred quantities and Inventory GST. Unmatched, unavailable, insufficient-stock and failed-check lines remain visible. Pharmacists can substitute, adjust quantity or remove lines. Substitutions retain the prescribed name and instructions; retries preserve reviewed quantities and removed lines. Load failures have an inline error and retry button.

Successful confirmation refreshes the queue. Invoice-derived Partial/Dispensed status is no longer replaced by Pending for In Review, Ready to Bill or Paid workflow tasks. A partially fulfilled prescription remains available under Partial.

## Verification

Final validation ran against the isolated `codex/cr09-pharmacy-billing-load` branch, based on `a602889` of `origin/main`, on 2026-09-27.

- **12 frontend tests passed** in `PharmacyBilling.prescription-load.test.tsx`. Cases cover patient switching, delayed responses, StrictMode, unmatched removal, explicit substitution, inferred quantities, failed reads/retry, preserving edits, successful confirmation and failed confirmation.
- **25 backend tests passed** across `pharmacy-billing-pending.spec.ts`, `pharmacy-invoice.service.spec.ts`, `pharmacy-prescription-queue.service.spec.ts` and `drug.service.spec.ts`. These cover pending status, quantity inference, Inventory GST, stock checks and invoice confirmation.
- **Chromium acceptance passed** against the actual local frontend and a synthetic HTTP API: Trina's Itin 12, Nixiper, Fucibet and Bilashine loaded with quantities 14/5/20/5; a second patient retained an unmatched item; a third displayed an injected 503 and recovered on retry; a confirmed bill retained patient/prescription/product IDs and removed Trina from Pending.
- Browser console and local server/request logs were inspected. Only deliberately injected 503 errors appeared in the browser console; all Pharmacy Billing page requests returned 200.
- Frontend TypeScript, `git diff --check`, and affected `cc-check format`/`cc-check list` checks passed. Contract semantics were checked against load, substitution, removal, queue-refresh and product-detail consumers.

## Reproduction and limits

Run the frontend with `NEXT_PUBLIC_API_PROXY=http://127.0.0.1:4029` on port 3029, then run `node scripts/diagnostics/cr09-pharmacy-billing-browser.cjs`. The harness starts its synthetic API, exercises three patient scenarios and writes screenshots, measurements, browser console messages and API request logs to `output/cr09-pharmacy-billing/`. It uses the local Google Chrome executable by default.

No real patient bills or clinic stock were changed. Stock deduction and database persistence are covered by service tests, not a live end-to-end clinic database run. The browser save fixture supplies available stock before confirmation. Actual out-of-stock medicines must still be substituted, removed or replenished; existing backend stock validation is preserved. Full backend TypeScript/build validation is not claimed: the earlier shared-workspace run had unrelated errors outside pharmacy. This commit excludes concurrent change requests in that workspace.
