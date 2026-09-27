# Inventory readability improvements — 27 September 2026

Implemented for the Inventory workspace and Inventory Updates, following the application readability audit. Existing working-tree changes were retained.

## What changed

- Inventory uses a scoped, scalable type scale: 16px body and mobile entry fields, 15px dense forms/tables, 14px secondary text at the default root size. Other application routes retain their existing typography.
- Familiar refresh, export, print, edit, back and remove actions use icons with descriptive accessible names and keyboard/hover tooltips. Stock posting, approval, reversal and payment actions retain explicit text.
- Supporting stock-search, count-policy and coverage explanations use focus/hover/touch help. CSV requirements, Gmail administrator setup, Excel columns and demand-calculation guidance use native keyboard-operable disclosures.
- Labels such as search, payment method, stock source, approval threshold and change reason are shorter. Formatting examples remain in placeholders; required status and quantity units stay visible.
- Forms and action groups wrap. Add-item fields stack on phones; its dialog retains viewport margins and grows appropriately on desktop. Long supplier selections wrap, inventory update names are no longer ellipsized, and wide tables scroll inside their containers.
- Purchase summary cards adapt to their actual available width and show complete amounts and quantities. Purchase intake actions, including Save & Process, remain visible on narrow screens.

Stock consequences, unverified quantities, validation errors, posting status and required review controls remain outside collapsed help. API operations, calculations and permissions were not changed.

## Verification

| Check | Result |
| --- | --- |
| Inventory, help and purchase regression tests | 109 passed across 11 suites |
| Purchase suite after the final summary-card change | 51 passed |
| Frontend TypeScript check | Passed: `tsc --noEmit --incremental false -p frontend/tsconfig.build.json` |
| Contract format and discovery | 22 successful checks, including the new icon, disclosure, typography and full-value contracts |
| Browser sweep | 47 screen/task states; 140 desktop/phone observations at 1440, 390 and 320px, including the add-item dialog |
| Focused interaction/layout checks | 21 observations covering keyboard/touch help, native disclosure keys, supplier selection, credit allocation, product editing, dialog footer access, tablet layout and text enlargement |
| Final tablet/enlarged-text confirmation | 12 observations across Today, intake, saved purchase, stock, counter sale and reorder settings; full text scale verified after transitions settled |
| Unrelated typography | Patients `text-sm` remains 14px; inventory secondary text is 14px |

The verified sweep has no page-width overflow or JavaScript render errors. Focused inspection also caught and fixed controls clipped by parent containers and ellipsized purchase amounts; page-width measurements alone would not detect those. Financial summary text is fully visible in the final tablet and 200% text checks. Screen-reader-only captions are excluded from visible-text clipping findings.

Tests used an isolated local frontend and synthetic records. Browser API writes were blocked. This verifies presentation and regression behavior, not production transactions or every possible record/status combination. Obscura was used for a local smoke check; Chrome supplied visual and interaction verification. Two incomplete ledger/credit fixtures were corrected before counting those screens as verified.

## Evidence

Artifacts are in [`output/inventory-readability-2026-09-27`](../../output/inventory-readability-2026-09-27/):

- `verified-summary.json`: reconciled screen sweep; `initial-observations.json` and `confirmation-observations.json` retain the underlying observations.
- `interaction-observations.json` and `type-resize-observations.json`: interaction results and final enlarged-text confirmation. Earlier purchase-summary clipping in the former is superseded by the latter.
- PNG screenshots: mobile views, dialog states, tablet views and enlarged-text views.
- `tests.log`, `purchase-final-tests.log`, `typecheck.log`, `contracts.json`, `type-scan.json`: validation evidence.
- `verify.cjs`, `interactions.cjs`: repeatable synthetic browser checks. `task-only.diff` isolates application edits from the pre-existing working tree.

Commit preparation was checked separately against the latest `origin/main`, with unrelated working-tree changes excluded. The isolated commit candidate passed 108 tests across 11 suites and the frontend TypeScript check. The shared help component and its tests are included because inventory uses them.

The screenshots and raw browser artifacts listed above remain local verification files. No deployment was performed during implementation or verification.
