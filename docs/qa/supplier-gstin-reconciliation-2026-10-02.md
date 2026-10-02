# Reconciliation clarity and saved supplier GSTIN correction

## Behavior

The purchase register and invoice checklist distinguish corrections, manual OCR review, totals mismatches and historical stock holds. Supplier mismatches compare the invoice GSTIN with the saved value. Incomplete catalog records name the missing fields; medicine requirements are explained next to product classification. Recorded OCR confidence is shown alongside the 98% automatic intake threshold. Status wording does not change approval eligibility.

For a supplier with the same normalized name and a different GSTIN, staff with purchase-entry and supplier-update permissions can choose **Correct saved GSTIN**. The panel shows old/new values, requires a reason and explicit verification against the original, then updates the supplier directory. Earlier invoices, payments, balances and stock are not rewritten. Invoice processing remains a separate action after correction.

The endpoint scopes the supplier to the authenticated branch, rejects stale revisions and GSTINs used by another supplier (including inactive records), and records the actor, reason and old/new values atomically. Duplicate retries do not write another correction. No database migration is required.

## Verification

- 75 frontend tests passed across `PurchaseInvoiceWorkbench.test.tsx`, `PurchaseSupplierReview.test.tsx` and `purchase-invoice-review.test.ts`.
- 168 backend tests passed across `purchase-supplier-gstin.spec.ts`, `purchase-supplier-gstin.database.spec.ts`, `pharmacy-purchase-supplier.spec.ts`, `pharmacy-purchase-invoice.access.spec.ts`, `pharmacy-purchase-invoice.automation-access.spec.ts`, `pharmacy-purchase-invoice.automation.spec.ts` and `pharmacy-purchase-invoice.service.spec.ts`.
- The three opt-in PostgreSQL tests used a fresh loopback-only instance and isolated synthetic schema. They verified concurrent retry idempotency, rejection of conflicting simultaneous edits, rollback on audit-insert failure, and preservation of an earlier invoice. They remove their schema afterward.
- Frontend production-source TypeScript check passed. Full backend TypeScript check has 60 existing errors: a compiler-host comparison against unchanged base `fb0156e` returned the identical diagnostic set with no added errors. Examples include missing `app.module` imports and existing user/appointment DTO typing errors. Targeted backend Jest suites type-check the affected imports successfully.
- `cc-check format` and `cc-check list` passed for every changed TypeScript source/test file. Semantic obligations were reviewed against tests and transaction behavior.
- Chrome fixture check passed at 1440px desktop, 390px mobile, and 200% text size, with no horizontal overflow or browser errors. Old/new values, reason, verification, successful PATCH, preserved invoice fields, and register labels were checked. The only fixture mutation was the deliberate supplier correction. Chrome was used after Obscura could not hydrate this app.
- Impeccable detector reported no non-advisory findings on the four changed UI components. `git diff --check` passed.

No production data was changed during development or verification. This branch contains only this feature, its regression tests and this QA note; unrelated changes in the original checkout are excluded.

## Reproduction

```sh
npm test --workspace=frontend -- --runInBand PurchaseInvoiceWorkbench.test.tsx PurchaseSupplierReview.test.tsx purchase-invoice-review.test.ts
npm test --workspace=backend -- --runInBand purchase-supplier-gstin.spec.ts pharmacy-purchase-supplier.spec.ts pharmacy-purchase-invoice.access.spec.ts pharmacy-purchase-invoice.automation-access.spec.ts pharmacy-purchase-invoice.automation.spec.ts pharmacy-purchase-invoice.service.spec.ts
node node_modules/typescript/bin/tsc --noEmit -p frontend/tsconfig.build.json --incremental false
# Supply a disposable local PostgreSQL URL explicitly; never production credentials.
PURCHASE_AUTOMATION_TEST_DATABASE_URL=postgresql://test_user@127.0.0.1:5432/test_db npm test --workspace=backend -- --runInBand purchase-supplier-gstin.database.spec.ts
```
