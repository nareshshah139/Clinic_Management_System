# Merged branches release — 2026-09-27

## Scope

All seven feature branches updated today (Asia/Kolkata) are included. Old branches and uncommitted work in the shared main checkout are excluded. The shared checkout was not reset, stashed, or committed.

| Branch | Included tip |
| --- | --- |
| `codex/cr02-smart-defaults` | `fa7982166f58401e7fa22808f60e23404c9e6f34` |
| `codex/cr04-personal-history` | `ab608b6d63f5a3f8bea199599cbf1aa628cfaa7a` |
| `codex/cr06-doctor-signature` | `6147a12964ae4df92ada272d34c0097dbd912852` |
| `codex/cr07-tele-video-release` | `a602889dd1050d695b5b1803981df69e3f8a7be3` |
| `codex/cr08-inline-print-layout` | `50ce57f1224ec0b4005c349ec8b0d5341cd8781e` |
| `codex/cr09-pharmacy-billing-load` | `e44daa6ca26e438a5eaf5376cddcf42155a2f7ef` |
| `codex/cr15-purchase-matching` | `d74c1653aabff55806cd766feb2706624be58b82` |

Personal-history conflicts with tele-video consent and signature printing were reconciled by retaining all contracts, the authenticated consent actor, explicit history clears, and combined preview dependencies. Added two focused regression cases for consent/history interaction. Fixed the compact-print browser harness's stale selector; no product behavior was changed for that fix.

## Release validation

- Full merged tests: 632 backend and 319 frontend tests passed, with 13 backend tests skipped. All 10 backend and 9 frontend failures reproduce against unchanged main `7166ea5`; these are existing failures, not a green full-suite claim. Baseline failures involve inventory mocks, archived invoice source mocks, legacy numeric dosage controls and inventory-import labels.
- Two added merge regressions passed. Focused final reruns: 18 backend consent/history tests and 8 frontend personal-history tests.
- Frontend production build including TypeScript and backend production SWC build passed. Backend build does not perform full TypeScript checking.
- Contract format and discoverability checks passed for 35 affected production source files. Conflict resolution retained each branch's contracts and verified combined call/data flow. Diagnostic `.cjs` syntax is unsupported by cc-check; the small harness edit was inspected manually.
- Chromium against the merged production frontend passed short/long/empty normal → compact → normal printing, personal-history save/carry-forward/blank omission, and four pharmacy-billing load/switch/retry/confirm scenarios. All browser API responses were synthetic. Deliberate 503 errors appeared only in the failure/retry scenario.
- `git diff --check` passed. Production schema/migration files are unchanged by this release.

## Production safety and rollback

Both services were healthy before rollout. Railway reported 29 applied migrations, no pending/failed migrations and no checksum mismatches. Startup seeding is disabled.

Railway-native backup `Pre-all-branches-2026-09-27` completed as `5aa26711-3e7a-4f23-9e5b-abddcb237eb7`; data stayed inside Railway. Read-only before/after integrity checks cover patients, visits, prescriptions, inventory items, pharmacy invoices, stock transactions and stock movements. They are aggregate checks, not a restore rehearsal.

Previous healthy application commit: `7166ea575a76c6f05a7db6c13d88db867638c1da`.
- Backend deployment: `e96f183e-57ec-48c7-9785-f27ae65eb9e8`.
- Frontend deployment: `afbc65a8-551d-4fea-b669-84852831e071`.

Ordinary application rollback can use these deployments without reverting or restoring the database. Preserve any writes made after release. Live rollout results are recorded below.

Local evidence: `/Users/nshah/Clinic_Management_System/output/merged-branches-2026-09-27/`. The isolated release checkout remains at `/private/tmp/clinic-merge-20260927`.

## Completed deployment

Both Railway services report **SUCCESS** and are serving exact application commit `b8099ceee75de39c59eeb288cb1323258d0ba710`, verified at 12:07:48 UTC (17:37:48 IST).

| Service | Deployment |
| --- | --- |
| Backend | `f0cacf3c-1e4f-4c8d-86dd-2636ff82e2b4` |
| Frontend | `75808515-70ac-4922-8c95-fac5431885bd` |

Backend startup confirmed 29 migrations, no pending migrations and skipped startup seeding. At 12:07:17 UTC all seven checked table hashes and row counts exactly matched the pre-release baseline. No database migrations or data corrections were applied by this rollout.

Eighteen live HTTP checks passed: backend health, frontend login, frontend API proxy health, all 12 login JavaScript assets, and authentication enforcement on personal-history, purchase-search and signature routes. Obscura rendered the live login form successfully. Production clinical workflows were not exercised with real patient records; the interactive acceptance checks used local synthetic fixtures.

[GitHub CI run](https://github.com/nareshshah139/Clinic_Management_System/actions/runs/36317697408) failed before tests ran with `jest: not found`, matching the previously deployed main's documented CI setup failure. Local production builds, contract checks and merge-specific acceptance checks passed; the 19 baseline suite failures remain explicitly recorded above. No protection bypass or forced Git update was used.

This final documentation update does not change application files from the deployed commit.
