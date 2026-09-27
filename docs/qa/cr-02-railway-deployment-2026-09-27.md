# CR-02 Railway deployment — 2026-09-27

## Outcome

Deployed the isolated CR-02 release to production. Both Railway application deployments reached SUCCESS and passed their health checks. The frontend login rendered in Obscura with no console messages. Public HTTPS checks passed for backend health, frontend login, API proxy health, all 12 public login JavaScript assets, authentication on the new regimen endpoint (401 without a session), and redirection of unauthenticated visits to login.

- Release commit: `f76f31eeffae319256d28158650ee95908273fc4`
- Branch: `codex/cr02-smart-defaults`
- Draft PR: https://github.com/nareshshah139/Clinic_Management_System/pull/1
- Backend deployment: `5b9dc110-f132-451d-b448-4aef401c8f41`
- Frontend deployment: `af67391a-fba4-4891-8a9c-b10a61249ac8`
- Frontend: https://frontend-production-703e.up.railway.app

The release was exported from the isolated commit and uploaded through the Railway CLI. Unrelated working-directory changes were excluded. The PR must be merged before a future main-based deployment to retain CR-02 in that deployment's source.

## Database

Both expected migrations finished at 06:55:38 UTC. Their recorded checksums match the reviewed SQL:

1. `20260927120000_medicine_regimen_defaults`: five nullable inventory fields with no database defaults; bounded lock/statement timeouts.
2. `20260927120100_prescription_history_date_index`: concurrently created `prescriptions_createdAt_idx`, confirmed valid.

No existing records were backfilled. Hashes computed from every pre-existing column remained identical before and after both service deployments:

| Table | Rows | Existing values |
| --- | ---: | --- |
| patients | 578 | Unchanged |
| visits | 645 | Unchanged |
| prescriptions | 99 | Unchanged |
| inventory_items | 430 | Unchanged |
| pharmacy_invoices | 3 | Unchanged |
| stock_transactions | 226 | Unchanged |
| stock_movements | 0 | Unchanged |

These checks cover the seven named business tables, not all system/audit tables. Migration metadata changed as expected.

## Validation

The release passed 49 frontend and 34 backend tests, both local production builds, both Railway builds, synthetic PostgreSQL service checks, and all four requested browser acceptance cases. The isolated migration rehearsal preserved synthetic existing inventory values, initialized all new fields to NULL, produced a valid index, and performed no changes on repeat execution.

Production verification used public HTTP checks, startup logs showing the new route, and read-only schema/aggregate integrity checks. An authenticated end-to-end test using actual prescription history was not performed. Automatic approval review rejected downloading a production database copy and rejected an SSH test that would return derived clinical metadata. The safer alternatives were a Railway-native snapshot, synthetic behavior tests, and aggregate integrity checks. A separate synthetic-only SSH check could not connect because Railway's SSH endpoint reported an unexpected application state; HTTP health and deployment status remained successful.

## Backup and rollback

Railway-native PostgreSQL snapshot: `Pre-CR02-smart-defaults-2026-09-27`, ID `707a8006-86e5-4ca1-a56c-bd8dc653d650`. Backup data remained inside Railway. A production-data restore rehearsal was not performed.

Previous successful deployments:

- Backend: `7ecb2d58-356b-441e-b617-8cf493e8eb80`
- Frontend: `a399c0a9-8ee9-4107-98c0-4869e4af10e3`
- Previous source: `436e4cadb1eadc106d043cc45ba19000cc2ed042`

For application rollback, restore the previous application deployments while retaining the additive nullable columns and index. A database restore is unnecessary for ordinary application rollback and would discard subsequent writes.

## Evidence

Local evidence is in `output/cr02-deployment/`: `preflight.json`, `snapshot.json`, `synthetic-migration-rehearsal.json`, `integrity-before.json`, `integrity-after.json`, `release-manifest.json`, `final-http-smoke.json`, and `deployment-result.json`. Synthetic browser evidence is in the release worktree's `output/cr02-regimen/`.
