# CR-12 production deployment — 2026-09-28

Application commit: `4cd85cba5ccd2abca34756e337b4f73ab86e5a32`, pushed to GitHub `main`.

Frontend: https://frontend-production-703e.up.railway.app/dashboard/inventory

Both Railway production services report `SUCCESS` for the exact application commit:

- Backend deployment: `8ec4546a-6ce8-462d-9c5d-6f58e30f12bb`.
- Frontend deployment: `f7b1375a-26d1-4a85-b28d-5dc3f4bae37d`.
- Backend health and frontend login return HTTP 200.
- All 32 Prisma migrations are applied, with no pending, failed or mismatched migrations. Startup seeding remains disabled.

The release includes CR-12 and the stock-identity / approval-snapshot dependencies required to keep Billing and Rx consistent. Unrelated shared-checkout changes were preserved. The release was prepared in a managed checkout of current main to retain previously released clinical, printing and purchase fixes.

## Validation

Both production builds passed. The release passed 22 focused suites (159 tests): 66 backend tests and 93 frontend tests. Code-contract syntax/discoverability checks passed. Browser/database acceptance passed again on the final release checkout. The complete migration chain was rehearsed successfully in a new local database. Whole-backend TypeScript checking has existing errors in untouched modules; the production SWC build passed.

Production acceptance used normal authentication through the public frontend proxy and an isolated temporary clinic branch:

- One Inventory menu, stock-row Edit price / Edit stock, and the old Updates redirect.
- A proposed price leaves the live balance unchanged and appears in Today.
- Pharmacist approval returns HTTP 403; the doctor sees review controls and can approve.
- Approval updates the selected batch price and the linked billing drug price.
- Stock count changes the selected batch from 10 to 17; the other batch stays 4 and holds stay 2. Inventory shows 17 for the edited batch; Billing and Rx both show 19 available across the two batches.
- An item without a drug-catalog link can also be approved and returned by Rx search.
- The pending Today count clears after approval.

All temporary branch, user, inventory, drug, request and request-log records were removed. Before/after hashes and counts match across ten existing tables: patients, visits, prescriptions, inventory items, pharmacy invoices, stock transactions, stock movements, drugs, purchase invoices and purchase invoice items. No existing rows in those tables changed during the deployment and smoke test.

## Recovery and evidence

Railway native database snapshot: `Pre-CR12-unified-inventory-2026-09-28`, backup ID `c0d85aa3-b2c9-4e03-aa3b-0812fc821fe1`, created before release. A rollback can redeploy the preceding application commit `b8099ceee75de39c59eeb288cb1323258d0ba710`; retain the additive schema and reconcile any newly created batch-edit requests before using the older approval screen.

Live acceptance and screenshots are in `output/cr12-deployment/`. Local browser evidence is in `output/cr12/`. Operational logs, migration preflight and aggregate integrity reports remain in the local working folder under `output/cr12-deployment/`; no credentials or clinical rows were exported.
