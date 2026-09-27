# CR-15 production deployment — 2026-09-27

## Release

Final verified production release: `b8099ceee75de39c59eeb288cb1323258d0ba710`, from the concurrent consolidated release on `main`. Its history includes the combined CR-15 commit, and its purchase matching source is unchanged from that commit.

CR-15 implementation commit: `f9f493e93814e556942b526b5886ba2c185354d6`.
Combined release commit: `d74c1653aabff55806cd766feb2706624be58b82`, pushed to `codex/cr15-purchase-matching`.

During the initial rollout, the concurrent CR-06 release `7166ea575a76c6f05a7db6c13d88db867638c1da` replaced the running services. That release was merged into the CR-15 branch without conflicts and the combined revision was tested before deploying again. All current production signature changes are preserved.

Automatic approval review rejected a direct push to `main` because the deployment request did not explicitly authorize changing that branch. This task deployed the pushed feature-branch commit directly through Railway. A separate concurrent consolidation subsequently merged CR-15 into `main` and deployed it with the other releases. Final acceptance was repeated on that consolidated revision; no further deployment was triggered by this task.

| Service | Final verified deployment ID |
| --- | --- |
| Backend | `f0cacf3c-1e4f-4c8d-86dd-2636ff82e2b4` |
| Frontend | `75808515-70ac-4922-8c95-fac5431885bd` |

Frontend: https://frontend-production-703e.up.railway.app

## Preflight and local validation

- All 29 production migrations were applied, with no failed/pending migrations or checksum mismatches. This release introduces no database migration.
- Startup seeding is disabled. Existing Railway health checks and API proxy configuration were retained.
- The original isolated revision passed 148 backend and 59 frontend tests, contract format/discovery checks, frontend production TypeScript validation, and synthetic desktop/mobile browser acceptance.
- After merging the concurrent release, 162 backend and 72 frontend tests passed, plus frontend production TypeScript validation. One optional CR-06 browser test was skipped. HTTP test suites required permission to bind their temporary localhost server; rerunning them with that permission passed.
- Unrelated edits in the original workspace were not included in the release. Railway built the pushed Git commit.

## Production acceptance

Both production services reported `SUCCESS` on the final revision. Backend `/health`, frontend `/login`, proxy `/api/health`, and all 12 login JavaScript assets returned 200. Unauthenticated manual product search returned 401.

A temporary pharmacist account authenticated normally through the frontend proxy and was removed after each check. Chrome was used after Obscura's earlier hydration/navigation failure. The final live browser run completed at 12:07:40 UTC:

- The original invoice now finds an exact-name **Moisturex Hydra Gel Cream, 50 Ml** catalogue record instead of Abzorb. This record already exists and is classified as `MEDICINE`. Therefore an invoice whose kind is not recorded shows **Same product**. The initial browser assertion expecting no product failed because it omitted this real catalogue state; it was corrected to test both states.
- Selecting **Cosmetic / skin care** locally on the invoice and refreshing yields **Not in inventory**, primary **Create new item**, and no incompatible saved-product suggestion. The local kind choice was not saved to the invoice. The existing catalogue classification needs review; it was not silently changed or duplicated during deployment verification.
- Manual search finds Abzorb. Selecting it returns HTTP 409 and displays **These look like different products. Confirm anyway?**, with name, kind and pack differences. Cancelling preserves the original line.
- Desktop and 390px mobile checks passed with no horizontal overflow or browser page errors. The sole failed browser HTTP request was the expected 409 mismatch guard.
- The actual invoice, Abzorb catalogue/stock links, and Abzorb confirmation-audit count had identical before/after hashes. No invoice was processed, no mismatch was acknowledged, and no stock was posted by acceptance tests.
- Whole-table aggregate hashes remained unchanged for inventory items, drugs, stock transactions, stock movements, pharmacy sales invoices, purchase invoices and purchase lines. Patient hashes also remained unchanged. Visits and prescriptions changed during concurrent work, including one additional prescription; this task makes no unchanged-data claim for those tables and did not alter them.

The historical audit and its evidence limits remain documented in [CR-15 purchase product matching](cr-15-purchase-product-matching.md). No stock correction was justified by that audit.

## Previous production release

The combined release preserves the immediately preceding CR-06 revision. Its deployment IDs were backend `e96f183e-57ec-48c7-9785-f27ae65eb9e8` and frontend `afbc65a8-551d-4fea-b669-84852831e071`. Those versions predate the CR-15 safeguards.

Operational drivers and detailed local evidence are in the original workspace under `tmp/cr15-release-ops/` and `output/cr15-deployment/`. No passwords, tokens, or raw production invoice records are committed with this deployment report.
