# CR-07: Tele-video consultation

Implemented on 2026-09-27 using the disclaimer wording supplied in the change request. The clinic still needs to confirm the final wording.

## Behavior

- Visits default to `IN_PERSON`. The visit header offers In-person and Tele-video.
- Tele-video requires “Patient consented to tele-video consultation”. Manual save, autosave, prescription save and export enforce consent. Server validation also covers direct API calls and nested prescription `clinicalData`.
- `teleVideoConsentById` stores the authenticated account ID and `teleVideoConsentAt` stores server time. Client-supplied receipt fields are ignored by validation. Repeated saves retain the original receipt.
- Switching to in-person removes the printed label and disclaimer and retains the previous receipt as inactive audit evidence. Switching a saved in-person visit back to tele-video requires renewed consent and records a new receipt.
- Print preview, browser print, browser PDF downloads and PDFs attached by WhatsApp/Email include “Consultation: Tele-video” near the date and the disclaimer above the signature. Server-generated PDFs do the same. The disclaimer remains when signature display is disabled; the disclaimer and signature are grouped for pagination.
- Preview pagination refreshes when consultation type changes. Exports wait until pagination reflects the selected type.
- Draft recovery restores the consultation choice. Visit save keys distinguish later saves from retries, including Tele-video → In-person → Tele-video.
- The optional API filter is available as `GET /visits?consultationType=TELE_VIDEO`. No new report screen was added.

## Database rollout

The migration `backend/prisma/migrations/20260927160000_tele_video_consultation/migration.sql` adds the enum, default and consent receipt columns, plus a database constraint requiring a receipt for tele-video visits.

Apply this migration through the normal reviewed migration process before deploying the updated backend. Prisma Client has been regenerated locally. No clinic database migration or production deployment was performed by this task.

The migration was rehearsed against synthetic rows in an isolated PostgreSQL schema inside a transaction, then rolled back. Checks passed for legacy defaults, rejecting an unconsented tele-video insert, accepting a consented insert, and switching back to in-person.

## Release verification

The production release was isolated from `origin/main` (`9e87999`) to retain deployed CR-02 and exclude unrelated working-directory changes. PDF attachment sharing is included because the existing Email action sent text only.

- 64 targeted backend tests passed, including consent validation, actor forwarding, visit/prescription saves, PDF content/pagination and sharing boundary validation.
- 26 frontend tests passed in the form/saving/clinical-saving and preview suites. The dedicated tele-video preview/export test passed for Print, Download PDF, WhatsApp and Email and for switching back to In-person.
- Both production builds passed, including frontend production-source TypeScript validation.
- Contract format/discoverability checks passed for consultation, visit persistence, prescription output/sharing and both form components.
- The transaction-bounded migration passed an isolated local PostgreSQL rehearsal and was rolled back. It uses a five-second lock timeout and a thirty-second statement timeout.
- Chromium acceptance passed against the exact production frontend build and compiled backend services with synthetic fixtures: missing consent blocked, audit recorded, reopen retained consent, preview and print contained the label/disclaimer, a real PDF downloaded, and In-person removed additions. No page errors occurred.

Known baseline limit: seven existing dosage-preview tests expect numeric-dose controls absent from the current UI. Email/WhatsApp delivery tests use mocked transports; no real messages are sent.

Production preflight found 28 applied migrations, only CR-07 pending, no failed migrations and no checksum mismatches. Startup seeding is disabled. A Railway-native snapshot was created as `Pre-CR07-tele-video-2026-09-27` (ID `d5d32c52-07f7-452c-b93c-157736c4d85d`). Backup data remains inside Railway. Aggregate pre-deployment hashes were captured for seven clinical/stock tables without downloading records.

Local evidence: `tmp/cr07-release-ops/` and `output/cr07-deployment/`. Production rollout results will be recorded separately.
