# CR-07 production deployment — 2026-09-27

## Release

CR-07 was committed as `d9efdcddf9ec150d6f477eedb4b04f85c56e8a7c`. The inventory readability release `86fdce0` landed while CR-07 was being prepared, so it was merged without conflicts. The combined release `037e77e5cdce695d0ac5a3ca9ab09ac3c25031ca` was pushed to `main` and explicitly deployed to both Railway production services.

| Service | Healthy deployment |
| --- | --- |
| Backend | `10ca239c-8d4e-4934-81ab-bd8609b5436b` |
| Frontend | `65b4feec-0d68-40e0-9984-e73d5566ddd7` |

Both report SUCCESS with the combined release commit. Production frontend: https://frontend-production-703e.up.railway.app

## Database

Railway-native snapshot `Pre-CR07-tele-video-2026-09-27`, ID `d5d32c52-07f7-452c-b93c-157736c4d85d`, was created before migration. Backup data remained inside Railway.

Only `20260927160000_tele_video_consultation` was pending. It applied successfully at 10:36:53 UTC during the initial backend deployment (`2cf6dd64-59f3-40de-92d1-017dc30d01b1`). The migration adds the enum, defaulted consultation type, nullable receipt fields and consent constraint in one transaction, with bounded lock/statement timeouts. Its recorded SHA-256 checksum matches the reviewed SQL: `f5eaa6b78a7247c4912b3a7d0c0209d501a2aed41e04a9145e677fea8ed9a080`.

Read-only aggregate hashes over all pre-existing columns were identical before deployment and after the final synthetic acceptance cleanup:

| Table | Rows | Existing values |
| --- | ---: | --- |
| patients | 578 | Unchanged |
| visits | 645 | Unchanged |
| prescriptions | 99 | Unchanged |
| inventory_items | 430 | Unchanged |
| pharmacy_invoices | 3 | Unchanged |
| stock_transactions | 226 | Unchanged |
| stock_movements | 0 | Unchanged |

These checks cover the named clinical/stock tables, not every system/audit table. Migration metadata and synthetic audit activity changed as expected. A production-data restore rehearsal was not performed.

## Live acceptance

Thirteen checks passed using a temporary, isolated synthetic branch, doctor account, patient, visit and prescription. No real patient records were used or edited.

1. Normal authentication and frontend API proxy.
2. API blocks unconsented Tele-video before writing a visit.
3. API records the authenticated actor and consent timestamp.
4. Tele-video visit filter returns the synthetic visit.
5. Prescription clinical-data updates also enforce consent.
6. Live server PDF includes the label and disclaimer above the signature.
7. Live server PDF omits both additions for In-person.
8. Live browser blocks Save Draft without consent.
9. Consent persists after saving and reopening the visit.
10. Live preview contains the consultation label and disclaimer.
11. Browser print content includes the disclaimer.
12. A real PDF downloads from the production browser; rendered visual inspection confirmed readable content and placement.
13. Switching back to In-person removes both additions in the browser.

The browser reported no page errors. All synthetic clinical records, idempotency records, the test account and temporary branch were removed afterward. No WhatsApp or Email messages were sent; attachment generation and sharing validation were tested with mocked delivery transports locally.

Public backend health, frontend login and frontend API proxy health returned 200. The unauthenticated visit filter returned 401. All 12 login JavaScript assets loaded successfully.

## Test limits and rollback

Local verification included 64 targeted backend tests, 26 passing frontend form/saving/preview tests, both production builds, contract checks and an isolated migration rehearsal. The merged inventory/CR-07 frontend build and nine selected integration tests passed. Seven numeric-dose preview tests failed identically when run against the original production component, confirming they predate CR-07.

GitHub CI run https://github.com/nareshshah139/Clinic_Management_System/actions/runs/36313159552 failed before running frontend tests with `jest: not found`. The same CI setup failure was already recorded for the previous main releases. No branch-protection override was used. Railway builds and local production builds passed.

For application rollback, retain the additive schema and the existing inventory release. Older application versions do not understand tele-video disclaimers, so they must not be used to issue tele-video prescriptions. A database restore is unnecessary for ordinary application rollback and would discard subsequent writes.

Evidence remains local under `output/cr07-deployment/`: deployment/status records, snapshot, integrity checks, HTTP smoke report, synthetic production acceptance report, screenshot and downloaded PDFs. The test driver is under `tmp/cr07-release-ops/` and contains no saved passwords or authentication tokens.
