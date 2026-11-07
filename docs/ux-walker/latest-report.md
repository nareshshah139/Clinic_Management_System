# UX Walker — Latest Report (2026-11-07)

Report-only run: no auto-fixes, no worktrees, no GitHub issues. The skill's `agent-browser` CLI was not available in this environment, so walkers drove the pre-installed Playwright Chromium (1280×800 plus one 390px check per story) against a local copy of the app (Next dev on :3000, NestJS on :4000, Postgres 16, seeded data). 22 stories were selected from `docs/ux-paths/catalog.md` across four personas and walked in parallel, one browser each.

Per-story artifacts: `stories/{topic-slug}--STORY-{NNN}/walk-report.md` and `findings.json`. Screenshots were kept out of the repo.

## Run summary
| Metric | Value |
|---|---|
| Stories walked | 22 |
| Pass / fail | 4 / 18 |
| Findings | 8 critical · 47 high · 68 medium · 60 low · 1 suggestion |

## Results by story
| Persona | Story | Result | C | H | M | L |
|---|---|---|---|---|---|---|
| Front desk | auth STORY-001 phone sign-in | pass | 0 | 1 | 5 | 3 |
| Front desk | auth STORY-002 deep link / bookmarks / 404 | pass* | 1 | 0 | 3 | 4 |
| Front desk | patients STORY-201 find by phone | pass | 0 | 1 | 2 | 3 |
| Front desk | patients STORY-206 portal link | fail | 0 | 1 | 2 | 1 |
| Front desk | appointments STORY-004 book from chart | fail | 0 | 1 | 2 | 3 |
| Front desk | auth STORY-007 header search | fail | 0 | 2 | 2 | 1 |
| Doctor | visits STORY-401 acne follow-up to Complete | fail | 0 | 6 | 8 | 5 |
| Doctor | visits STORY-402 walk-in from Visits setup | fail | 0 | 3 | 2 | 2 |
| Doctor | visits STORY-405 photo compare / delete | fail | 1 | 2 | 2 | 3 |
| Doctor | visits STORY-411 Procedures save | fail | 1 | 0 | 2 | 4 |
| Doctor | prescriptions STORY-001 write, print, hand off | fail | 0 | 1 | 7 | 5 |
| Pharmacy | desk STORY-703 add drug | fail | 1 | 2 | 2 | 4 |
| Pharmacy | counter STORY-603 prescribe → bill → collect → dispense | fail | 2 | 5 | 5 | 3 |
| Pharmacy | counter STORY-605 walk-in OTC + package | fail | 1 | 2 | 2 | 2 |
| Pharmacy | counter STORY-608 invoice list | fail | 0 | 2 | 3 | 5 |
| Pharmacy | inventory STORY-801 Today triage | pass (admin) / blocked (pharmacist) | 0 | 2 | 2 | 3 |
| Admin | auth STORY-005 role × page matrix | fail | 0 | 3 | 8 | 3 |
| Admin | admin STORY-002 create user | fail | 0 | 3 | 2 | 3 |
| Admin | admin STORY-011 manager on Users | fail | 0 | 3 | 1 | 1 |
| Admin | admin STORY-009 revenue report | fail | 1 | 2 | 3 | 1 |
| Admin | admin STORY-010 report exports | fail | 0 | 2 | 1 | 0 |
| Admin | patients STORY-212 role boundaries by URL | fail | 0 | 3 | 2 | 1 |

\* The journey works, but it carries a critical open-redirect finding.

## Critical and high findings confirmed live
**Security**
- Open redirect: `/login?next=https://example.com` (and `//example.com`) sends the browser off-site after a real login (`frontend/src/app/login/page.tsx:36-37`).
- No route guard on any dashboard page: all 13 pages load for all 9 roles. RECEPTION's header search exposes the Users list with Edit/Delete/Reset buttons. PHARMACIST can edit, archive and export patients by URL.
- `/test-transcribe` (OpenAI Whisper test page) is reachable signed out.
- Login throttle is 5/min per IP, so a shared clinic network locks everyone out, and the error shows "ThrottlerException" plus a UUID.

**Money and clinical data**
- A doctor's "Create Prescription" silently overwrote a prescription that had already been billed and dispensed.
- Counter "Dispense" marks a prescription done with no invoice and no stock movement (one click from In Review).
- Every photo delete on a saved visit 404s (`/api/api/visits/...`, `VisitPhotos.tsx:583`). The thumbnail trash also targets the previously selected photo, so the 404 is currently the only thing preventing deletion of the wrong photo.
- Procedures "Save Procedure" always fails.
- Visits started from the patient link (`autoStart`) are attributed to the other doctor; the Visits doctor picker loads one doctor.
- Second and later drug adds return 500 (empty `barcode`/`sku` hit UNIQUE columns).
- Download PDF fails on every invoice (html2canvas can't parse `oklch`) and leaves a click-blocking overlay.
- Billing offers zero-stock products; the walk-in sale fails only at final Confirm.
- Reports return 500 for every role: the revenue report's `payment.groupBy({ by: ['createdAt'], _count: { id: true } })` with a relation filter makes Prisma emit `column reference "id" is ambiguous`. The orchestrator reproduced this outside the app. The UI shows "No data". All exports return 400.

**Broken core flows**
- Link Portal always fails (UI sends only email → 400).
- "Book appointment" from a patient chart fails with "Patient information is missing".
- Header search → patient result opens an empty list; staff/appointment results drop their target.
- PHARMACIST cannot bill anything: 403 on `/drugs`, inventory suggestions and the pharmacy dashboard (RBAC wildcard grants never match), shown as empty "No drugs / No invoices" screens.
- Counter review table is clipped to 2px at 1280×800, so Accept can't be clicked.
- Doctor day calendar hides appointments outside working hours (09–18 default).
- Patient table rows are 783px tall; the Create Patient / walk-in dialog can't be scrolled to its Create button at 1280×800.
- User Status select is ignored (Pending/Suspended save as ACTIVE). `/users/roles` and `/users/permissions` 404 (shadowed by `:id`), so the permission grid is empty even for ADMIN.

## Refuted or corrected catalog claims
- Revenue report shows a 500, not ₹0. The ₹3.4 lakh mismatch could not be tested (no pharmacy invoices at the time).
- Patient list is sorted by name, not newest first.
- Empty Link Portal email does nothing (no "Email required" toast).
- Pharmacist notifications bell is empty.
- `return=` is not kept when opening a Recent activity document (STORY-801 claim).
- In STORY-401 the first "Mark Vitals Complete" does not mark Vitals (takes two clicks), and the local draft persists after completion.

## Data left in the local database by walkers
Invoices PHI-2026-001/-004 (paid) and number gaps 002/003; package "Acne Control – 30 Day"; drug Melaglow-T; a PATIENT user `rohit.portal@patient.test`; two empty SHORTBOOK drafts; three test patients/bookings from ux-flow. The orchestrator restored a soft-deleted seed visit and reverted a self-promoted doctor.
