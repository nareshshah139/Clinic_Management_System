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

Ordinary application rollback can use these deployments without reverting or restoring the database. Preserve any writes made after release. Live rollout results will be recorded after verification.

Local evidence: `/private/tmp/clinic-merge-20260927/output/merge-2026-09-27/`; compact-print screenshots: `/private/tmp/clinic-merge-20260927/output/cr08-print-layout/`.
