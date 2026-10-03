# Inventory verification regression fixes

The invoice editor now owns OCR confirmations shared with its checklist. Values or dependencies that differ from a confirmation restore the pending flags used by field colors, check counts, final approval and saving. Pending checks are retained in both browser recovery and server drafts. A new invoice, replacement extraction or explicit reload clears the previous editor's confirmations.

Expiry confirmation and draft saving share one validation rule: integer month 1–12 and integer year 2020–2100. Missing, fractional and out-of-range expiry values remain red and cannot be marked checked. Existing save validation still blocks them.

Validation:

- 112 tests passed in seven related invoice, checklist, supplier, summary and inventory suites. Regression coverage includes changed batch and dependent supplier identity, saving/reopening with pending checks, fresh final confirmation, invalid expiry, and inclusive expiry limits.
- The production frontend build passed, including TypeScript checks.
- Contract format and discovery passed for all three changed production files; the shared flags were traced through approval, API saving, browser recovery and incomplete server drafts.
- The UI detector reported no findings.
- Synthetic browser acceptance passed at 1440px and 390px: invalid expiry stays red, confirmations turn green, edited values restore pending counts and block final approval, pending checks survive save/reload, and rechecking enables final confirmation. Screenshots were inspected; no horizontal overflow or page errors were found. The test did not call stock approval, processing or commit endpoints.
- Browser evidence: `output/inventory-status-fixes/verification.json`. Run `scripts/diagnostics/inventory-status-regressions-browser.cjs` against the existing synthetic API and local frontend documented in `inventory-simplicity-2026-10-03.md`. Chrome uses the established fallback after Obscura stalled on this route.

No backend or database schema change is included. Live OCR model accuracy was not benchmarked. The pre-existing CI dependency-install issue (`jest: not found`) is outside this change; the suites above ran against the installed development dependencies locally.
