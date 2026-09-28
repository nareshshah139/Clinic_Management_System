# CR-12 — Unified Inventory

Release candidate prepared from current GitHub main on 2026-09-28. Production deployment is recorded separately after verification.

Inventory is the single sidebar destination for stock work. Inventory Updates and Reorder targets no longer appear separately. Reorder targets remain in Inventory → Reorder → Manual targets & exclusions. Doctors now have the Inventory entry needed to review edits. Existing `/dashboard/inventory-updates` bookmarks redirect to `/dashboard/inventory?area=stock&view=approvals`.

Stock continues to query branch inventory, including depleted batch history, with the existing search, filters, export and count scope. It does not request the full drug catalog. Each row exposes Edit price and Edit stock to pharmacists, admins and owners. The dialog requires a changed valid value and an invoice/shelf-count reason. It submits the exact displayed batch ID and revision. Stock edits mean the physical count of that batch; selling-price edits are per stock unit. Submission leaves stock and price unchanged.

Today → What needs attention counts all pending branch requests and opens the paginated approval queue. Doctors, admins and owners can approve or reject. The existing Counts & audit workflow and Counts awaiting completion entry remain available for full stock takes; this change adds no new import flow.

Approval uses the existing request model and serializable approval transaction. Batch snapshots detect changes to balances, holds, revision, price or product links. Approval changes only the selected batch, retains held stock, and writes the signed stock movement with the reason and reviewer. A unique existing drug link receives the approved selling price; an unlinked clinic item can be edited without guessing or creating a drug identity. Ambiguous price links require review. Legacy aggregate requests remain reviewable, with their existing snapshot safeguards.

## Deployment requirement

Apply `backend/prisma/migrations/20260928100000_inventory_batch_edits/migration.sql` before releasing the application change and regenerate Prisma Client. It makes the request's drug link nullable so clinic items without a catalog link can use the same approval queue, retaining the existing restrictive foreign-key deletion behavior. The release includes the stock-identity dependency (`20260927170000_prescription_inventory_identity`) and approval snapshot dependency (`20260927200000_pharmacy_inventory_approval_snapshot`). These migrations add identity/snapshot fields and relax the request drug ID; they do not rewrite existing stock or clinical records. All three run in transactions with bounded lock/statement timeouts. The complete 32-migration chain passed on an empty local PostgreSQL database.

## Release scope

The release preserves the newer main-branch clinical, tele-video, signature, printing, purchase-matching and GST fixes. It includes the CR-10 stock-identity dependency for Billing and Rx, removal of the Rx hard-coded stock fallback, and stock-refresh handling. It does not include the unrelated pending bulk-stocktake/import, partner-sales, clinical-autofill or print-name changes from the shared working folder. Existing physical-count workflows remain intact.

## Verification

- Final release frontend: 14 inventory, pharmacy and Rx stock suites pass, 93 tests.
- Final release backend: 8 focused suites pass, 66 tests, covering batch approval, legacy approval integrity, clinic stock identity, workspace batches, Rx search and billing stock checks.
- Both production builds pass, including the frontend source TypeScript check.
- Prisma schema validates; `git diff --check` passes.
- `cc-check format` and `cc-check list` pass for all affected source files. Contracts on the approval writer, stock movement helper, clinic stock search and workspace navigation were also inspected for semantic compatibility.
- Impeccable's mechanical detector reported no findings on the five changed UI components.
- Whole-backend TypeScript checking remains blocked by existing errors in untouched modules (including missing main-module imports, appointments, audit logs, reports, and visits). No errors remain in the changed backend source files.

The browser run uses real application components and domain services, a synthetic HTTP/auth adapter and a dedicated local PostgreSQL database, `cr12_inventory_acceptance_20260928`. It is not a production deployment or a full Nest authentication integration test. Obscura loaded the page but stalled on the navigation-completion event, so Chrome completed the workflow and visual checks.

The browser/database acceptance verified:

1. One Inventory menu and no duplicate Updates/Reorder target entries; catalog-only drugs are absent from Stock.
2. A pharmacist price proposal leaves the live price unchanged, appears in Today, and opens the queue. Pharmacists see no approval action; a doctor can approve.
3. The approved price appears on the inventory item and the drug detail used for billing.
4. A physical batch count changes 10 → 17 only after approval, while the other batch stays 4 and holds stay 2. Stock reports 17 for the edited batch; pharmacy inventory checks and the Rx picker both report 19 available (21 physical less 2 held).
5. An unlinked clinic item's count can be approved and is reflected in the Rx picker without creating a drug link.
6. Concurrent duplicate submissions create one pending request. A stale approval writes no movement and can be rejected.
7. The old Updates URL redirects to the integrated queue. The mobile edit dialog fits at 390px without horizontal page overflow.

Evidence: `output/cr12/acceptance.json`, `stock-desktop.png`, `today-desktop.png`, `approval-desktop.png`, and `stock-edit-mobile.png`.

Reproduction: start a local frontend on port 3112 with `NEXT_PUBLIC_API_PROXY=http://127.0.0.1:4012`, initialize the dedicated database with the current schema, then run `CR12_CHROME=1 node scripts/diagnostics/cr12-inventory-browser.cjs`. The script fixes the database URL internally and never uses a production database from environment files.
