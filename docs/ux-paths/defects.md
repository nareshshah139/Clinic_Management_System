# Defects Found While Mapping UX Paths: Linaé ClinicMS

Generated: 2026-11-07 (ux-paths Phase 3 consolidation)

**Source.** This list merges the "Defects noticed while mapping" sections of the 10 topic files in [`topics/`](topics/). The topic agents found each defect by reading code, and most were checked against both frontend and backend. None has been reproduced in a browser yet. Entries marked *suspected* or *unconfirmed* rest on reasoning about external behaviour or on one side of the code only.

**Deduplication.** When several topics reported the same root cause in the same code path, the reports are merged into one entry, and every reporting topic is listed. When the same pattern appears in different code paths (for example, page-scoped totals in two different lists), each path gets its own entry and both point to the shared root cause below.

**Reported by** uses topic short names plus the defect number inside that topic file:
`auth` = auth-shell-navigation · `patients` = patients-records · `appts` = appointments-scheduling-rooms · `visits` = visit-documentation · `rx` = prescriptions-print-share · `counter` = pharmacy-counter-billing · `desk` = pharmacy-desk-catalog-ai · `inventory` = inventory-stock-sales-reorder · `purchases` = purchases-suppliers-compliance · `admin` = admin-users-reports-messaging. A reference like "appts story 004" points to a story rather than to a numbered defect. Catalog story IDs are in [`catalog.md`](catalog.md).

**Severity scale**
- **critical**: a security hole any logged-in user can exploit, or silent corruption or loss of clinical, financial or permission data.
- **high**: a core workflow is impossible, money or tax figures are wrong, or a serious authorization gap needs a particular role or setup.
- **medium**: a feature is broken or misleading but has a workaround, or the data harm is limited.
- **low**: cosmetic, stale copy, dead code, or a rare edge case.

## Totals

| Theme | Critical | High | Medium | Low | Total |
|---|---|---|---|---|---|
| Security & access control | 4 | 15 | 6 | 1 | 26 |
| Data integrity & money | 3 | 12 | 15 | 2 | 32 |
| Broken features | 1 | 10 | 30 | 10 | 51 |
| Role/UI mismatches | 0 | 2 | 6 | 4 | 12 |
| Misleading feedback | 0 | 1 | 10 | 6 | 17 |
| Dead UI & stale code | 0 | 0 | 2 | 11 | 13 |
| Minor | 0 | 0 | 0 | 8 | 8 |
| **Total** | **8** | **40** | **69** | **42** | **159** |

The 10 topic files list 182 numbered defects (auth 24, patients 22, appts 22, visits 20, rx 13, counter 15, desk 23, inventory 7, purchases 15, admin 21). They also mention role and navigation problems in story text, topic preambles and discovery. After merging reports with the same root cause in the same code path, and adding those unnumbered problems, 159 entries remain. 25 entries merge reports from two or more topics.

## Systemic root causes

These patterns produce most of the entries below. Fixing a pattern once, centrally, closes many defects at the same time.

1. **DOCTOR (and ADMIN) is a universal superuser in the guards.** `RolesGuard` lets OWNER, ADMIN and DOCTOR pass every `@Roles` check, and `PermissionsGuard` exempts ADMIN and DOCTOR (`backend/src/shared/guards/roles.guard.ts:27-31`, `permissions.guard.ts:47-49`, `inventory-workflow.service.ts:74`). Every controller that writes `@Roles(OWNER, ADMIN)` or `@Roles(ADMIN, PHARMACIST, ACCOUNTANT)` therefore also admits DOCTOR, even where the comment says not to. → SEC-01, SEC-18, ROL-08.
2. **No `@Roles` means open to every authenticated user.** `RolesGuard` returns `true` when no roles metadata is present (`roles.guard.ts:16-18`). Unguarded controllers include patients, users `GET`, reports, prescription share/PDF/print-events, dispense tasks and queue pull, partner sales, packages, `DELETE /visits/:id`, `/visits/transcribe` and draft-photo delete. A PATIENT portal token can reach all of them. → SEC-02, 03, 04, 05, 06, 07, 21, ROL-09.
3. **Wildcard permissions in the RBAC seed never match.** `seed_rbac.ts` grants `inventory:*`, `pharmacy:*`, `inventory:po:*`, `pharmacy:drug:*` and even `*`, but `PermissionsGuard` and the inventory workflow use exact `includes` / `Set.has`, and a spec asserts wildcards fail closed (`permissions.guard.spec.ts:39-42`). PHARMACIST and MANAGER provisioned from the seed lose most of their intended access. → SEC-08.
4. **Frontend role gating is a separate, hand-maintained copy of backend rules.** The sidebar role lists, `ROLE_PERMISSIONS` in the visit form and the Inventory task menus disagree with controller `@Roles`. Roles see buttons that always 403 (NURSE, RECEPTION, MANAGER), and DOCTOR and OWNER lack nav to things they're allowed to do. → ROL-01 to ROL-12.
5. **Messaging "succeeds" when nothing is sent.** `NotificationsService.sendWhatsApp`, `sendWhatsAppDocument`, `sendEmail` and `postWhatsApp` log and return when credentials are missing or the provider rejects the request, and callers then report success. → MIS-01.
6. **Indian phone numbers are stored without a country code, and "E.164" just prefixes `+`.** The DTO accepts 10-digit numbers and `normalizeE164` adds no `91`. Every WhatsApp path, and phone login with `+91`, is affected. → DAT-20, BRK-33, BRK-34.
7. **IST vs UTC date handling.** Appointment dates are stored at midnight UTC, `toISOString()` is used for "today", `new Date('YYYY-MM-DD')` is treated as a local date, and partner cut-offs are set with UTC hours. → DAT-17, 18, 19, 25.
8. **The whitelist ValidationPipe silently strips undecorated DTO fields.** `status`, `firstName`/`lastName`, the export `reportType`/`exportFormat` and the WhatsApp template bodies all lack class-validator decorators, so the server drops them (or 400s with `forbidUnknownValues`) without a clear error. → SEC-19, DAT-27, BRK-05, BRK-06.
9. **Frontend/backend contract drift.** Field names (`lastVisitDate` vs `lastVisitAt`, `nextAppointment`, `portalUserId` not selected, `consultationType` not mapped), response shapes (`result.backup.timestamp`) and route order (`GET /users/:id` declared before `/users/roles`) have drifted apart. → BRK-07, BRK-12, BRK-22, BRK-23, DAT-03, DAT-09.
10. **Errors are swallowed and rendered as empty or success states.** A bare `catch {}` or `console.error` turns 403/500 responses into "No invoices found", all-zero metrics, empty room calendars or "No slots available". → MIS-04, MIS-05, BRK-27, BRK-35.
11. **Business rules enforced on one code path only.** Price approval, manager-only targets, audited GSTIN correction and the stock change-request workflow each have a second writer that skips them: the AI agent, the metadata PATCH, the supplier PATCH. → SEC-11, SEC-22, SEC-23, SEC-24.
12. **Orphaned and legacy implementations still wired in.** Clinic billing, the old invoice builder, PharmacyInventoryControl and the legacy `Payment` table are still read by live screens and links, giving wrong data and dead deep links. → DAT-10, DAT-16, BRK-25, DEAD-03, DEAD-05.
13. **Counts computed over the loaded page but labelled as totals.** Examples: the cockpit's first 8 entries, invoice and drug stat cards, sorting, "Did you mean". → MIS-10, BRK-37, BRK-48, MIN-04.
14. **Help copy is not maintained alongside the UI.** QuickGuides and tours name buttons, roles, tabs and interactions that don't exist. → DEAD-01, DEAD-02.

---

## Security & access control

### SEC-01 — DOCTOR (or ADMIN) can make themselves OWNER · **critical**
- **What**: Users write endpoints are `@Roles(OWNER, ADMIN)`, but `RolesGuard` admits DOCTOR, and the controller comment admits it. The DTOs accept any `UserRoleEnum`, including OWNER, and `assignRole` / `createUser` / `updateUser` do no rank or self check. `PATCH /users/<self>/role {"role":"OWNER"}` works for a doctor.
- **Evidence**: `backend/src/shared/guards/roles.guard.ts:27-30`; `backend/src/modules/users/users.controller.ts:13-14,62-127`; `backend/src/modules/users/dto/user.dto.ts:49,125,240-241`; `backend/src/modules/users/users.service.ts:86-129,199-244,349-392`. This contradicts the rank model in `password-reset.service.ts:9,18-24`.
- **Reported by**: admin #1 (story 012).

### SEC-02 — Patient API has no role guard: any logged-in role can list, export, edit, archive and portal-link every patient · **critical**
- **What**: `PatientsController` uses only `JwtAuthGuard`. PHARMACIST, ACCOUNTANT, LAB_TECH and PATIENT portal users get full patient CRUD by API or by typing `/dashboard/patients`. PATIENT and LAB_TECH see an empty sidebar but the full header search over branch patients.
- **Evidence**: `backend/src/modules/patients/patients.controller.ts:26-113` (also `:35-67`); `backend/src/shared/guards/roles.guard.ts:16-18`; the sidebar-only gate at `frontend/src/components/layout/sidebar.tsx:63` (and `:48-57`); header search calls at `frontend/src/components/layout/header.tsx:408`; PATIENT accounts created via Link Portal at `patients.service.ts:419-431`.
- **Reported by**: patients #11 (story 212), auth #18.

### SEC-03 — Doctors' WhatsApp access tokens are readable by every signed-in user · **critical**
- **What**: The Users page saves `whatsappAccessToken` in user `metadata`. `formatUser` returns `metadata` intact, and `GET /users` and `GET /users/:id` have no role restriction. RECEPTION, PHARMACIST or PATIENT can read live Meta credentials.
- **Evidence**: `frontend/src/components/users/UsersManagement.tsx:349`; `backend/src/modules/users/users.service.ts:918-933`; `backend/src/modules/users/users.controller.ts:68-86`; credential used at `backend/src/modules/appointments/appointments.service.ts:175-176`.
- **Reported by**: admin #4 (story 007), auth #2 and #18 (`GET /users` unguarded).

### SEC-04 — Any role can email or share any branch prescription to an arbitrary address · **critical**
- **What**: `POST /prescriptions/:id/pdf|share|share-preview|print-events` have no `@Roles`, so any authenticated user, PATIENT portal users included, can send any prescription in the branch anywhere.
- **Evidence**: `backend/src/modules/prescriptions/prescriptions.controller.ts:376-412`; `roles.guard.ts:16-18`.
- **Reported by**: rx #8.

### SEC-05 — Reports API and page are open to every role · **high**
- **What**: `ReportsController` has no `@Roles` or `@Permissions`. The sidebar hides Reports from all but OWNER/ADMIN/MANAGER, but RECEPTION, NURSE, PHARMACIST, ACCOUNTANT and PATIENT can fetch revenue, doctor and payment reports by API or by typing `/dashboard/reports`.
- **Evidence**: `backend/src/modules/reports/reports.controller.ts:43-218`; `frontend/src/components/layout/sidebar.tsx:116-121`.
- **Reported by**: admin #5 (story 011).

### SEC-06 — Dispense tasks can be marked Paid/Dispensed with no invoice or payment, by any role · **high**
- **What**: The cockpit "Paid" and "Dispense" buttons are enabled on any eligible task. The server checks only READY_TO_BILL, and DISPENSED moves the prescription out of the queue with no stock deducted. The dispense-task controller and the queue `pull` route carry only `JwtAuthGuard`.
- **Evidence**: `frontend/src/components/pharmacy/PharmacyCounterCockpit.tsx:942-957`; `backend/src/modules/pharmacy/pharmacy-prescription-queue.service.ts:422-433,924-925`; `backend/src/modules/pharmacy/pharmacy-dispense-task.controller.ts:26-29,44-57`; `pharmacy-prescription-queue.controller.ts:98-106`.
- **Reported by**: counter #1.

### SEC-07 — `DELETE /visits/:id` has no role guard · **high**
- **What**: Any authenticated role (PHARMACIST, RECEPTION, PATIENT) can soft-delete a clinical visit through the API.
- **Evidence**: `backend/src/modules/visits/visits.controller.ts:488-491`.
- **Reported by**: visits #19.

### SEC-08 — RBAC seed wildcards never match, so PHARMACIST and MANAGER lose access to Desk, drugs, inventory, ledger, compliance and the AI · **high**
- **What**: `seed_rbac.ts` grants `inventory:*`, `pharmacy:*` (MANAGER), `inventory:item:*`, `inventory:po:*`, `inventory:supplier:*`, `pharmacy:invoice:*`, `pharmacy:dashboard:*`, `pharmacy:drug:*` (PHARMACIST) and even `*`. All checks are exact matches. Results:
  - MANAGER, the only non-admin workflow approver, gets `read:false` for every inventory kind and sees "You do not have permission to view …".
  - PHARMACIST cannot load the stock list, Sales, Desk metrics or the drug list.
  - PHARMACIST also lacks `pharmacy:agent:use`, `pharmacy:purchase-ledger:*` and `pharmacy:compliance:read`, although those controllers list PHARMACIST.
- **Evidence**: `backend/scripts/seed_rbac.ts:5-15,87-117` (ledger/compliance gaps at `:87-114`, wildcards at `:92-93`); `backend/src/shared/guards/permissions.guard.ts:88-95`; `permissions.guard.spec.ts:39-42`; `backend/src/modules/inventory/inventory-workflow.service.ts:35,88,102,107,109`; `inventory-workspace.service.ts:18`; `frontend/src/components/inventory/InventoryWorkspace.tsx:970`; `pharmacy-purchase-ledger.controller.ts:32-33`; `pharmacy-compliance.controller.ts:37-38`.
- **Reported by**: inventory #2, purchases #11, desk D-14.

### SEC-09 — Role, status or account changes don't affect live sessions · **high**
- **What**: `JwtStrategy.validate` takes `role` and `branchId` from the token, guards trust it, and the layout prefers the token role over the database role. Demoted, suspended or deleted staff keep their old powers until the JWT expires. A password reset doesn't revoke JWTs either; the admin topic noted this as already known.
- **Evidence**: `backend/src/modules/auth/strategies/jwt.strategy.ts:31-39`; `frontend/src/components/layout/dashboard-layout.tsx:47-50`.
- **Reported by**: admin #13 (and the known reset/JWT issue in the admin topic preamble).

### SEC-10 — Open redirect after login via `?next` · **high**
- **What**: `?next=https://evil.example` is passed unvalidated to `router.replace`, so a real login is followed by an off-site redirect, which makes credible phishing possible.
- **Evidence**: `frontend/src/app/login/page.tsx:36-37`.
- **Reported by**: auth #11 (story 002).

### SEC-11 — Pharmacy AI proposals bypass price approval and the stock change-request workflow · **high**
- **What**: An `update_drug` proposal calls `drugService.update` without `actorRole`, so the PHARMACIST price-approval check never fires. `adjust_stock` calls `inventoryService.adjustStock` directly instead of going through change requests and approval.
- **Evidence**: `backend/src/modules/pharmacy-agent/pharmacy-agent.service.ts:1414,1426-1428` vs `backend/src/modules/pharmacy/drug.service.ts:336-343`.
- **Reported by**: desk D-12 (story 710).

### SEC-12 — Pharmacy AI sessions and proposals are scoped by branch, not by owner (IDOR) · **high**
- **What**: Given a thread or proposal ID, any agent user in the branch can read, message, attach to, archive or restore another user's thread, and apply or reject their proposals. Only `listSessions` filters by `userId`.
- **Evidence**: `pharmacy-agent.service.ts:288,641,719,759` (filter only at `:308-311`).
- **Reported by**: desk D-13.

### SEC-13 — Prompt-injection exposure in the Pharmacy AI assistant, which can read repository secrets · **high**
- **What**: The user message, spreadsheet `sampleRows`, PDF and image text, and stored DB strings (drug names, invoices, patient data in the prescription queue) are concatenated into one prompt with no "treat as untrusted data" instruction. The purchase-OCR path has one. Codex runs with `-C <repo root>` under a read-only sandbox, so injected text can make it read `backend/.env` or `uploads/` and echo secrets. Model-authored proposals are then one blind click from a write (see MIS-07).
- **Evidence**: `pharmacy-agent.service.ts:1144-1156,1176-1210,1554-1568,1930-1934`; contrast `backend/src/shared/codex/codex-oauth.ts:74`.
- **Reported by**: desk D-16.

### SEC-14 — AI data reads are not role-scoped and send PHI to the external model · **high**
- **What**: `recent_invoices` (with patient names) and `prescription_queue` are available to any agent caller, including MANAGER, or a DOCTOR who has no invoice screens. Dashboard recent invoices with patient names go to the model on every turn via `buildBaseContext`.
- **Evidence**: `pharmacy-agent.service.ts:855-924,958-1000`.
- **Reported by**: desk D-17.

### SEC-15 — Agent attachments are served without authentication · **high**
- **What**: Attachments are written under `uploads/`, which `main.ts` serves statically with no auth, and the image summary returned to the client includes absolute server paths.
- **Evidence**: `backend/src/main.ts:82`; `pharmacy-agent.service.ts:393-404,1572-1583,1694-1704`.
- **Reported by**: desk D-23.

### SEC-16 — Stored HTML injection in the Pharmacy Invoices print window · **high**
- **What**: `renderPrintHtml` interpolates item names, patient name, phone and address, and free-text `invoice.notes` raw into a same-origin `window.open('')` document. The builder's print path escapes the same fields.
- **Evidence**: `frontend/src/components/pharmacy/PharmacyInvoiceList.tsx:160,272-273,305,319-327` vs `PharmacyInvoiceBuilderFixed.tsx:1475-1481`.
- **Reported by**: counter #12.

### SEC-17 — Open redirect on the Google Calendar OAuth callback · **high**
- **What**: The `state` / `redirect` value is passed through untouched and used as a navigation target.
- **Evidence**: `frontend/src/app/dashboard/appointments/google-callback/page.tsx:52-54`; `backend/src/modules/google-calendar/google-calendar.controller.ts:36-44,75-76`.
- **Reported by**: appts #14.

### SEC-18 — DOCTOR can record and reverse supplier payments · **high**
- **What**: Ledger writes are `@Roles(ADMIN, PHARMACIST, ACCOUNTANT)`, but the DOCTOR bypass in both guards and in `creditWrite` lets doctors post and reverse payables.
- **Evidence**: `pharmacy-purchase-ledger.controller.ts:32,49,56`; `roles.guard.ts:29-31`; `permissions.guard.ts:47-49`; `inventory-workflow.service.ts:74`.
- **Reported by**: purchases #12 (story 908, 912).

### SEC-19 — Users cannot be suspended or deactivated from the UI · **high**
- **What**: The Status select (Active/Inactive/Suspended/Pending) is sent but stripped, because neither DTO declares `status`, and create forces ACTIVE. `PATCH /users/:id/status` has no frontend caller. A resigned employee keeps signing in unless deleted, and deletion fails if they have appointments or visits.
- **Evidence**: `frontend/src/components/users/UsersManagement.tsx:116,467-478`; `backend/src/modules/users/dto/user.dto.ts:26-102,104-185`; `backend/src/shared/logging/http-observability.ts:166-168`; `users.service.ts:119,264-266`; `users.controller.ts:124-128`.
- **Reported by**: admin #2 (story 004).

### SEC-20 — Patient detail of archived records stays fully viewable by URL · **medium**
- **What**: `findOne` doesn't filter on `isArchived`, and the detail page shows no archived state.
- **Evidence**: `backend/src/modules/patients/patients.service.ts:243-245`.
- **Reported by**: patients #22 (part).

### SEC-21 — `/test-transcribe` sits outside the auth middleware, and `/visits/transcribe` has no role guard · **medium**
- **What**: The diagnostic page loads for anyone, shows a raw "Transcription failed: 401 - …" instead of redirecting, and appears in the production Admin nav. The transcription endpoint (OpenAI cost) is open to every role.
- **Evidence**: `frontend/src/app/test-transcribe/page.tsx:233-237`; `frontend/src/middleware.ts:28-30`; `backend/src/modules/visits/visits.controller.ts:663-690`.
- **Reported by**: visits #20 (story 412); discovery item 9.

### SEC-22 — Manager-only replenishment targets can be changed by anyone with `inventory:item:update` · **medium**
- **What**: Manual targets & exclusions requires a manager, but batch "Edit product details" PATCHes Minimum, Maximum and Reorder-at and sets `manualTargets = true`. DOCTOR and RECEPTION can change targets.
- **Evidence**: `backend/src/modules/inventory/inventory-replenishment.service.ts:38-39`; `frontend/src/components/inventory/ReplenishmentCenter.tsx:203`; `StockDetailsEditor.tsx:23-25`; `WorkspaceStock.tsx:434`; `inventory-workspace.service.ts:141-143`; `inventory-item-metadata.ts:126-157`.
- **Reported by**: inventory #5.

### SEC-23 — Selling-price approval can be bypassed at the API · **medium**
- **What**: The UI routes price edits through approval, but `saveInventoryItemMetadata` writes `sellingPrice`/`mrp` directly for any holder of `inventory:item:update`. The details editor already sends `sellingPrice` in its PATCH body.
- **Evidence**: `backend/src/modules/inventory/inventory-item-metadata.ts:172-176`; `inventory-workspace.service.ts:141-143`; `WorkspaceStock.tsx:434`.
- **Reported by**: inventory #6.

### SEC-24 — Supplier GSTIN can be changed with no validation or audit · **medium**
- **What**: The Suppliers page PATCHes `/inventory/suppliers/:id`, which writes the DTO directly (`gstNumber` is only `@IsString @IsOptional`). This bypasses the verified, audited, duplicate-checked correction path in the workbench.
- **Evidence**: `frontend/src/components/inventory/InventoryWorkspace.tsx:1192-1196`; `backend/src/modules/inventory/inventory.service.ts:694-706`; `dto/inventory.dto.ts:656`; contrast `pharmacy-purchase-invoice.service.ts:146-180`.
- **Reported by**: purchases #10 (story 907).

### SEC-25 — Login reveals which accounts exist · **medium**
- **What**: The API returns 404 "Account not found" vs 401 "Invalid password", and the login page shows both verbatim.
- **Evidence**: `backend/src/modules/auth/auth.service.ts:51-53,64-66`; `frontend/src/app/login/page.tsx:39`.
- **Reported by**: auth #14.

### SEC-26 — The session cookie outlives the JWT, with no "session expired" message · **low**
- **What**: The cookie `maxAge` is 7 days while `JWT_EXPIRES_IN` defaults to `1d`. Middleware admits the stale cookie, the page renders and then bounces to `/login`. The layout redirect also drops `next` and races the API client's redirect, which keeps it (unconfirmed race). Logging out while offline can leave the HttpOnly cookie behind.
- **Evidence**: `backend/src/modules/auth/auth.controller.ts:67`; `backend/src/shared/config/env.validation.ts:19-21`; `frontend/src/middleware.ts:14-16`; `dashboard-layout.tsx:86-88`; `frontend/src/lib/api.ts:243-255`.
- **Reported by**: auth #24 (story 004).

---

## Data integrity & money

### DAT-01 — The Visits setup screen loads only one patient and one doctor; deep-linked visits go to the wrong doctor · **critical**
- **What**: `loadData` fetches `getPatients({limit:1})` and `GET /users?role=DOCTOR&limit=1`. Effects:
  - The doctor dropdown lists only the most recently created doctor.
  - Other patients render as "Patient: Unknown".
  - `autoStart=true` deep links silently assign the visit to that doctor, not the signed-in one.
- **Evidence**: `frontend/src/app/dashboard/visits/page.tsx:519-546,673-681,942-943,1076-1077`; `backend/src/modules/users/users.service.ts:165`.
- **Reported by**: visits #1 (stories 401, 402).

### DAT-02 — The thumbnail trash icon deletes the wrong photo, permanently · **critical**
- **What**: The handler calls `setActiveIndex(idx)` and then immediately `deleteActive()`, which reads the stale `active` and deletes the previously selected photo. The confirm dialog doesn't say which photo will go.
- **Evidence**: `frontend/src/components/visits/VisitPhotos.tsx:562-564,775-783`.
- **Reported by**: visits #4 (story 405).

### DAT-03 — Role & Permissions wipes a user's permissions · **critical**
- **What**: `@Get(':id')` is declared before `@Get('permissions')` and `@Get('roles')`, so the dialog's data calls hit `findUserById` and 404. The dialog shows an empty grid. "Apply Role" succeeds but alerts "Failed to update role". **Save Permissions** then persists `[]`.
- **Evidence**: `backend/src/modules/users/users.controller.ts:83` vs `:166,:195`; `frontend/src/lib/api.ts:884-890`; `frontend/src/components/users/UsersManagement.tsx:365-379,385-400,404-409,618`.
- **Reported by**: admin #3 (stories 003, 012).

### DAT-04 — Pharmacy checkout never records payment; "Collect payment" does not collect · **high**
- **What**: Checkout stores `paymentMethod` but leaves `paymentStatus` PENDING. The Counter's "Collect payment" only opens the builder. Payment can be recorded only from Pharmacy Invoices "Mark as Paid", which Billing doesn't link to. Every sale shows as unpaid until someone reconciles it by hand.
- **Evidence**: `backend/src/modules/pharmacy/pharmacy-invoice.service.ts:285-305`; `backend/prisma/schema.prisma:1309`; `PharmacyCounterCockpit.tsx:1236-1239`.
- **Reported by**: counter #7 (stories 603, 608).

### DAT-05 — Manually added drugs and packages are taxed at 18% regardless of their GST rate · **high**
- **What**: `addDrugToInvoice` hard-codes `taxPercent: 18`, and packages are also fixed at 18%. Prescription lines and substitutes use `getDrugGstRate`. The server trusts the client's `taxPercent`, so most medicines (5%) are over-taxed.
- **Evidence**: `frontend/src/components/pharmacy/PharmacyInvoiceBuilderFixed.tsx:1022,1057` vs `:557,:989`; `backend/src/modules/pharmacy/pharmacy-invoice.service.ts:327`.
- **Reported by**: counter #4 (story 605).

### DAT-06 — Duplicate supplier-bill protection is exact-string only, so stock and payables can double · **high**
- **What**: The invoice number is stored trimmed but case- and punctuation-sensitive under `@@unique([branchId, distributorGstin, invoiceNumber])`, with no normalised pre-check. `SVPD/25-26/04417`, `svpd/25-26/04417` and `SVPD-25-26-04417` all save and post.
- **Evidence**: `backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts:957,196-237`; `backend/prisma/schema.prisma:1564`.
- **Reported by**: purchases #1 (story 903).

### DAT-07 — No backend place-of-supply check; OCR splits every bill into CGST + SGST · **high**
- **What**: A single OCR "GST %" is split into CGST/SGST whatever the supplier's state code. The IGST vs CGST/SGST exclusivity check exists only in the frontend, so an inter-state bill (state code 29) can auto-post with the wrong tax heads through "Import & Add Stock".
- **Evidence**: `pharmacy-purchase-invoice.service.ts:2536-2547,2903-2913`; `frontend/src/components/pharmacy/PurchaseInvoiceWorkbench.tsx:679`; `frontend/src/lib/purchase-invoice-batch.ts:31`.
- **Reported by**: purchases #4.

### DAT-08 — Credit notes and supplier returns are always reported as CGST/SGST · **high**
- **What**: Compliance rows for workflow documents hard-code `cgst = sgst = gstRate/2, igst = 0`, so ITC reversals from inter-state suppliers land in the wrong tax head on the GST report.
- **Evidence**: `backend/src/modules/pharmacy/pharmacy-compliance.service.ts:135`.
- **Reported by**: purchases #6 (story 910).

### DAT-09 — Edit Patient overwrites ONLINE consultation type with OFFLINE · **high**
- **What**: The list mapping drops `consultationType`, so Edit pre-selects OFFLINE and Save writes it back. The same omission blanks the Consultation column and the CSV column.
- **Evidence**: `frontend/src/components/patients/PatientsManagement.tsx:209-229,587,477,1160-1166,379`; backend returns the field at `backend/src/modules/patients/patients.service.ts:216`.
- **Reported by**: patients #4 (stories 204, 208).

### DAT-10 — Revenue, Doctor-performance and Payment reports read a table nothing writes · **high**
- **What**: Reports aggregate legacy `prisma.payment`. Pharmacy sales go to `PharmacyPayment`, clinic billing to `NewPayment`, and the dashboard uses `newPayment`. Report revenue stays at ₹0 (or shows only seed rows) and never matches Pharmacy Invoices.
- **Evidence**: `backend/src/modules/reports/reports.service.ts:91-97,165,218,378,421,779-788,859`; `pharmacy-invoice.service.ts:2226`; `backend/src/modules/billing/billing.service.ts:382`.
- **Reported by**: admin #6 (story 009).

### DAT-11 — Photos uploaded before a visit exists are never attached to it · **high**
- **What**: With no visit id, VisitPhotos posts to `/visits/photos/draft/:patientId`. The `onVisitNeeded` callback, which would create the visit and enforce consent, is never called, and `create` never claims draft attachments. After the first save the photos show as "Unattached uploads" and the Photos section drops back to Pending.
- **Evidence**: `frontend/src/components/visits/VisitPhotos.tsx:19,41,456-458`; `MedicalVisitForm.tsx:2343,2352-2363`; `backend/src/modules/visits/visits.service.ts:74-140`.
- **Reported by**: visits #3 (stories 401, 404).

### DAT-12 — Drug Management writes empty strings into unique columns, so every later add/edit fails · **high**
- **What**: Add and Edit always send `barcode: ""` and `sku: ""`. Both columns are `String? @unique`, and the duplicate check skips empty strings. After the first such row, every Add or Update returns a generic 500. Edit also wipes any existing barcode or description.
- **Evidence**: `frontend/src/components/pharmacy/DrugManagement.tsx:95-97,167-171,187-191,269-271`; `backend/src/modules/pharmacy/drug.service.ts:43-47,94-101,349`; `schema.prisma` (Drug.barcode/sku).
- **Reported by**: desk D-1 (stories 703, 704).

### DAT-13 — Clinic holidays can be deleted for every doctor, with no confirm, from one doctor's Working Hours · **high**
- **What**: Branch holidays (`doctorId: null`) appear in each doctor's time-off list, and the admin Working Hours dialog shows a trash icon on them. One click removes the holiday clinic-wide.
- **Evidence**: `backend/src/modules/doctor-availability/availability.queries.ts:37`; `frontend/src/components/users/DoctorAvailabilitySettings.tsx:166`; `UsersManagement.tsx:538`.
- **Reported by**: admin #18 (story 005); appts story 009 (alternate path).

### DAT-14 — Booking dialog ignores the chosen duration or dragged range · **high**
- **What**: `durationMinutes` is initialised once while `slot` is `''` (30) and never reset, and `derivedSlot` rewrites the end time. Drag-selected ranges and the Slots "Duration" select are cut to 30 minutes or the last value used, so procedures are booked too short.
- **Evidence**: `frontend/src/components/appointments/AppointmentBookingDialog.tsx:60-72,88-98`.
- **Reported by**: appts #2 (stories 001, 003).

### DAT-15 — A walk-in visit's local draft is lost on refresh before its first save · **high**
- **What**: The draft key ends in `date-<visitDate>`, and `visitDate` is `new Date().toISOString()`, recomputed on every render. A reload or "Back to Setup" orphans the draft, and autosave doesn't run until a visit id exists.
- **Evidence**: `frontend/src/components/visits/MedicalVisitForm.tsx:160-178,577-580,899`; `frontend/src/app/dashboard/visits/page.tsx:1131,1143`.
- **Reported by**: visits #8 (story 410).

### DAT-16 — Opening stock import confirms with no preview · **medium**
- **What**: The preview table is rendered only in the `compact` variant (used by orphaned PharmacyInventoryControl), but Inventory mounts the full one. The user clicks "Confirm opening import" without any row review, per-row "Errors" column or the "Existing batch balances cannot be reset." warning.
- **Evidence**: `frontend/src/components/pharmacy/PharmacyInventoryStarterImport.tsx:244,300,440,446`; `frontend/src/components/inventory/InventoryWorkspace.tsx:342`; `PharmacyInventoryControl.tsx:75`.
- **Reported by**: inventory #1 (story 805).

### DAT-17 — Server past-booking check reads the IST slot as UTC · **medium**
- **What**: `new Date(\`${date}T${start}:00.000Z\`)` lets bookings through up to 5 h 30 m in the past, and reschedule has no past check at all.
- **Evidence**: `backend/src/modules/appointments/appointments.service.ts:1036-1043` vs `:667`; reschedule at `:454-489`.
- **Reported by**: appts #15.

### DAT-18 — Later-today appointments are treated as past · **medium**
- **What**: Appointments are stored at midnight UTC and `getNextAppointment` filters `date >= now`. From 05:30 IST onward, a later-today appointment is invisible to the WhatsApp reminder ("No upcoming appointment found") and to the tracker's "Upcoming appt".
- **Evidence**: `appointments.service.ts:123`; `patients.service.ts:295-301`.
- **Reported by**: patients #7 (story 207).

### DAT-19 — Partner daily-sync cut-off and dates use UTC · **medium**
- **What**: "Cutoff 22:00" is applied as 22:00 UTC (03:30 IST the next day), which shifts Late flags. The date defaults to the UTC date (yesterday before 05:30 IST), and the summary cards ignore the selected Date.
- **Evidence**: `backend/src/modules/pharmacy/pharmacy-partner-sales.service.ts:167-170,269-277,889-892`; `frontend/src/components/pharmacy/PartnerDailySync.tsx:138,183`.
- **Reported by**: desk D-8, D-9 (stories 708, 709).

### DAT-20 — Indian patient numbers are mis-addressed on every WhatsApp path · **medium**
- **What**: Phones are stored as 10 digits, and `normalizeE164` or the callers only prefix `+`. `9849012345` becomes `+9849012345`. Affected paths: appointment confirmations, patient reminders and template sends (Cloud API), and the prescription "PDF via WhatsApp" link (`wa.me/<digits>`, so "90…" opens Turkey).
- **Evidence**: `backend/src/modules/notifications/notifications.service.ts:68-73`; `backend/src/modules/patients/patients.service.ts:21-25,335`; `backend/src/modules/appointments/appointments.service.ts:207-209`; `backend/src/modules/patients/dto/create-patient.dto.ts:32`; `frontend/src/components/visits/PrescriptionBuilder.tsx:6261-6262`; seed `backend/scripts/seed.ts:204`.
- **Reported by**: patients #10, appts #16, admin #12, rx #2 (stories 207, 006 rx, 007 admin).

### DAT-21 — GST summary purchase slabs don't add up · **medium**
- **What**: CGST/SGST/IGST are recomputed as taxable × % per line, while `totalGst` uses the bill's `gstAmount`. Columns differ from Total GST by paise per line.
- **Evidence**: `pharmacy-compliance.service.ts:76-80`.
- **Reported by**: purchases #5 (story 910).

### DAT-22 — "Stock at cost" and expiry "valueAtCost" are overstated · **medium**
- **What**: On commit, batch `costPrice` is set to the undiscounted PTR, while the stock transaction records the effective cost. Reports multiply stock by `costPrice`, so Adapalene shows ₹150 instead of ₹122.73.
- **Evidence**: `pharmacy-purchase-invoice.service.ts:1460,1961,1991,2033-2036`; `pharmacy-compliance.service.ts:230-233,341,363`.
- **Reported by**: purchases #7.

### DAT-23 — Post-dated supplier payments leave an inconsistent balance · **medium**
- **What**: `paymentDate` has no future check. Allocation validation counts all allocations, but displayed balances drop future-dated ones. The UI offers **Max** on a bill that then fails with "Allocation exceeds outstanding balance".
- **Evidence**: `backend/src/modules/pharmacy/dto/pharmacy-purchase-ledger.dto.ts:61-62`; `pharmacy-purchase-ledger.service.ts:100,598-601,633`.
- **Reported by**: purchases #8 (story 908).

### DAT-24 — Desk "Sales" metric includes unpaid, draft and cancelled invoices, and its growth figure is wrong · **medium**
- **What**: Growth compares today against month-to-date, so it is ≤ 0% on every day except the 1st.
- **Evidence**: `backend/src/modules/pharmacy/pharmacy.service.ts:82-88,250-253,261`.
- **Reported by**: desk D-2 (story 701).

### DAT-25 — Report end date excludes the whole end day · **medium**
- **What**: `new Date('YYYY-MM-DD')` is midnight UTC. Data created on the end date after 05:30 IST is excluded, and start = end returns nothing. The default range also uses `toISOString()`, so "today" is yesterday before 05:30 IST.
- **Evidence**: `reports.service.ts:1215`; `frontend/src/app/dashboard/reports/page.tsx:204-205,271-274`.
- **Reported by**: admin #9 (story 009).

### DAT-26 — Partner sale lines without a batch are silently dropped · **medium**
- **What**: On Submit, lines without a batch are dropped while "Form total" still includes them. There is no edit path afterwards (409 on resubmit).
- **Evidence**: `PartnerDailySync.tsx:166-176,228-233`; `pharmacy-partner-sales.service.ts:62-73`.
- **Reported by**: desk D-10 (story 708).

### DAT-27 — Patient name editing round-trips badly · **medium**
- **What**: The model has only `name`. The pipe drops `firstName`/`lastName`, and the list maps first name = full name. Edit shows the full name in First Name with Last Name blank, and re-entering a last name duplicates it.
- **Evidence**: `backend/prisma/schema.prisma:255`; `PatientsManagement.tsx:213`.
- **Reported by**: patients #21 (story 204).

### DAT-28 — Duplicate patients are created silently · **medium**
- **What**: `PatientDeduplicationService` is registered but never used, and phone has no unique constraint. The same name and phone register twice with no warning.
- **Evidence**: `backend/src/modules/patients/patients.module.ts:11`; `schema.prisma:259`.
- **Reported by**: patients #20 (stories 202, 205).

### DAT-29 — Any doctor can delete any branch prescription template with one click · **medium**
- **What**: The trash icon has no confirm, and the backend checks only the branch, not the creator.
- **Evidence**: `frontend/src/components/visits/PrescriptionBuilder.tsx:2962-2969`; `backend/src/modules/prescriptions/prescriptions.service.ts:1022-1040`.
- **Reported by**: rx #5 (story 007 rx).

### DAT-30 — "Add to Drug Database" from a prescription row loses the new drug's id · **medium**
- **What**: The created drug's `id` isn't copied into the row, so stock lookup and pharmacy matching treat it as free text.
- **Evidence**: `PrescriptionBuilder.tsx:347-362`.
- **Reported by**: rx #9 (story 010 rx).

### DAT-31 — Footer "Go to Pharmacy" hands off an unsaved prescription · **low**
- **What**: The button navigates with only `visitId` and doesn't save. Billing loads `visit.prescription`, so an unsaved Rx gives an empty bill. The post-create dialog uses a different URL (`prescriptionId`, no `visitId`).
- **Evidence**: `PrescriptionBuilder.tsx:5463-5474,6750`; `PharmacyInvoiceBuilderFixed.tsx:653-658`.
- **Reported by**: rx #4 (stories 001 rx, 610).

### DAT-32 — The WhatsApp share print event is recorded before sharing happens · **low**
- **What**: The event is posted before `navigator.share` or the wa.me fallback, so a cancelled share still counts as shared.
- **Evidence**: `PrescriptionBuilder.tsx:6246,6252,6268`.
- **Reported by**: rx #3.

---

## Broken features

### BRK-01 — Procedures "Save Procedure" always fails · **critical**
- **What**: The payload omits `complaints`, which `CreateVisitDto` requires, and the service re-checks it. The user sees only `alert('Failed to save procedure…')`, so the whole Procedures page records nothing.
- **Evidence**: `frontend/src/app/dashboard/procedures/page.tsx:271-300,314`; `backend/src/modules/visits/dto/create-visit.dto.ts:231-234`; `visits.service.ts:92-94`.
- **Reported by**: visits #14 (story 411).

### BRK-02 — "Book appointment" from a patient's page can't be completed · **high**
- **What**: The `?patientId=` prefill sets `selectedPatientId` but never `selectedPatient`. The dialog gets `patient={null}`, shows "Unknown Patient" and fails "Patient information is missing".
- **Evidence**: `frontend/src/components/appointments/AppointmentsCalendar.tsx:98-102,713`; `AppointmentScheduler.tsx:80-84,794`; `AppointmentBookingDialog.tsx:178-180`; entry links `frontend/src/app/dashboard/patients/[id]/page.tsx:221`, `PatientProgressTracker.tsx:191`.
- **Reported by**: appts #1 (story 004); patients story 210.

### BRK-03 — Complete Visit needs photos and labs, but the message asks for other things · **high**
- **What**: Only vitals, photos, labs and prescription can be marked, out of 5 sections. Reaching the 80% gate therefore requires at least one photo and pressing "Save Labs". The toast says "Fill vitals, complaints, diagnosis, and prescription…". A scalp consult with no photos can never be completed.
- **Evidence**: `frontend/src/components/visits/MedicalVisitForm.tsx:797,1522-1533,1559-1565,2159,2330,2456-2457,2742`.
- **Reported by**: visits #2 (story 401).

### BRK-04 — Link Portal can never succeed · **high**
- **What**: The frontend sends only `{email}`. The backend requires `email`, `password`, `firstName` and `lastName` when no `userId` is given, and the dialog has no fields for them.
- **Evidence**: `PatientsManagement.tsx:660,1026-1031`; `patients.service.ts:415-417`.
- **Reported by**: patients #1 (story 206).

### BRK-05 — Every report export fails, and PDF export would be empty anyway · **high**
- **What**: `ExportReportDto.reportType`/`exportFormat` have no class-validator decorators, so they are stripped and the service throws "Unsupported report type: undefined". The page also sends plural names the switch rejects. The error is swallowed, and the uncontrolled Export select can't re-fire the same format. Separately, `Buffer.concat(chunks)` runs synchronously after `doc.end()`, so PDFs come out empty.
- **Evidence**: `backend/src/modules/reports/dto/reports.dto.ts:1122-1127`; `reports.service.ts:903,907-926,951-976`; `frontend/src/app/dashboard/reports/page.tsx:330,349-351,1247`; weak test at `backend/src/modules/reports/tests/reports.service.spec.ts:94-98`.
- **Reported by**: admin #7, #8 (story 010).

### BRK-06 — WhatsApp template create, update, generate and test all return 400 · **high**
- **What**: The body classes have no decorators. With class-validator 0.14 (`forbidUnknownValues`) and the global pipe, validation fails, and only GET and DELETE work. `saveTemplate` has no catch.
- **Evidence**: `backend/src/modules/whatsapp-templates/whatsapp-templates.controller.ts:8-40`; `backend/package-lock.json:6776-6777`; `UsersManagement.tsx:229-267`.
- **Reported by**: admin #10 (story 008).

### BRK-07 — "Create Backup" always reports failure, and backup status is never polled · **high**
- **What**: The page reads `result.backup.timestamp`, but the API returns `{success, jobId}`. The resulting TypeError shows "❌ Backup Failed" after a successful enqueue, and nothing polls `GET /auth/backup/:jobId`. Admins can't tell whether backups work.
- **Evidence**: `frontend/src/app/dashboard/page.tsx:189-193`; `backend/src/modules/auth/auth.controller.ts:191,199`; `frontend/src/lib/api.ts:1111-1113`.
- **Reported by**: auth #7 (story 011).

### BRK-08 — CSV purchase import fails reconciliation for discounted lines and can't carry TCS · **high**
- **What**: The draft sets `grossAmount = Σ qty×rate` (pre-discount), with no header discounts or `tcsAmount`, and the template has no such columns. The workbench blocks on "Printed Gross differs" and the backend flags "Header taxable mismatch".
- **Evidence**: `backend/src/modules/inventory/inventory-intake.service.ts:132-155`; `frontend/src/components/inventory/AlternateInvoiceIntake.tsx:10-41`; `PurchaseInvoiceWorkbench.tsx:539,2361-2365`; `pharmacy-purchase-invoice.service.ts:2807-2812`.
- **Reported by**: purchases #3 (story 905).

### BRK-09 — RECEPTION's pharmacy billing is impossible end to end · **high**
- **What**: RECEPTION has Desk, Counter and Billing in the sidebar, but `/pharmacy/dashboard`, `/drugs`, `/pharmacy/invoices*` (read, checkout, payments) and `link-inventory` are ADMIN/PHARMACIST (and DOCTOR) only. One failing initial load then blanks every list in the builder (see BRK-27). The role mismatch is in ROL-02.
- **Evidence**: see ROL-02 and BRK-27; `frontend/src/components/layout/sidebar.tsx:89-95`.
- **Reported by**: counter preamble (a), counter story 609; desk D-20 (story 702).

### BRK-10 — Pending pharmacy checkout can't be discarded after a permanent failure · **high**
- **What**: The attempt is cleared only on 400/404. A different sale is blocked while it is pending, and "Start a new invoice" appears only when the attempt is already confirmed. A 403 or a persistent 500 locks the builder until the tab is closed. A second tab doesn't see the attempt, so a duplicate sale from another tab isn't guarded.
- **Evidence**: `PharmacyInvoiceBuilderFixed.tsx:1297-1298,1361-1365,2066-2073`.
- **Reported by**: counter #5 (story 606).

### BRK-11 — (merged into SEC-19: Users "Status" select does nothing)

### BRK-12 — Patient detail "Next appointment" always reads "Not scheduled" · **medium**
- **What**: The page reads `patient.nextAppointment`, which `findOne` never returns. The tracker on the same page can show "Upcoming appt".
- **Evidence**: `frontend/src/app/dashboard/patients/[id]/page.tsx:120`; `patients.service.ts:242-289`.
- **Reported by**: patients #6 (story 209).

### BRK-13 — New User opens as "Edit User" after cancelling an edit · **high**
- **What**: `onEdit` fills `form.id`, and Cancel only closes. The New User trigger doesn't reset the form, so the dialog shows the previous user's data, and **Save** updates that user, possibly changing their role or email.
- **Evidence**: `UsersManagement.tsx:137-140,430-435,487`.
- **Reported by**: admin #14 (story 002).

### BRK-14 — Visit Type / Room filters make booked tiles look free · **medium**
- **What**: Free and overlap detection uses `filteredSchedule`, so hidden appointments look bookable and the booking fails with a 409.
- **Evidence**: `frontend/src/components/appointments/DoctorDayCalendar.tsx:120-138,551,609,743`.
- **Reported by**: appts #4 (story 001).

### BRK-15 — Slots tab drops the procedure name · **medium**
- **What**: `handleBookingConfirm` neither accepts nor forwards `notes`.
- **Evidence**: `AppointmentScheduler.tsx:314-329` vs `AppointmentsCalendar.tsx:358-366`.
- **Reported by**: appts #3 (story 003).

### BRK-16 — Reschedule mode survives a doctor change · **medium**
- **What**: `rescheduleTarget` isn't cleared when the doctor changes. The UI validates against the new doctor's grid while the server keeps the original doctor, so the appointment vanishes from view or hits an unexpected 409.
- **Evidence**: `DoctorDayCalendar.tsx:84,343-352,872-889`; `appointments.service.ts:473-489`.
- **Reported by**: appts #5 (story 005).

### BRK-17 — Doctor resets to the first doctor when switching Calendar/Slots tabs · **medium**
- **What**: Radix tabs unmount, and the async `fetchDoctors` overwrites the controlled doctor with `list[0]` while the page select still shows the persisted one.
- **Evidence**: `frontend/src/components/ui/tabs.tsx:131-141`; `AppointmentsCalendar.tsx:143-145,174-179`; `AppointmentScheduler.tsx:87-89,162-168`.
- **Reported by**: appts #6.

### BRK-18 — Manage Rooms never lists inactive rooms, so a deactivated room can't be reactivated · **medium**
- **Evidence**: `frontend/src/components/rooms/RoomsManagement.tsx:62-71`; `appointments.service.ts:784-797`.
- **Reported by**: appts #10 (story 011).

### BRK-19 — Google Calendar syncs to whoever booked, not to the doctor · **medium**
- **What**: Sync and delete prefer the caller's credentials. The "Sync with Google Calendar" button is shown to every role, and the UI says "Dr. X's appointments will auto-sync". Reception bookings land in the receptionist's calendar.
- **Evidence**: `backend/src/modules/google-calendar/google-calendar.service.ts:181-186,264-272`; `AppointmentsCalendar.tsx:436-497`.
- **Reported by**: appts #13 (story 007).

### BRK-20 — Doctor notification deep links drop the appointment · **medium**
- **What**: The bell links to `/dashboard/visits?appointmentId=…` without `patientId`. The Visits page reads `appointmentId` only when `patientId` is present, so the doctor lands on an empty setup screen.
- **Evidence**: `frontend/src/components/layout/header.tsx:177`; `frontend/src/app/dashboard/visits/page.tsx:575-588`.
- **Reported by**: auth #4, appts #18, visits #13 (stories 008, 012 appts).

### BRK-21 — Global search results land on the wrong place · **medium**
- **What**:
  - Patient results go to `/dashboard/patients?search=<cuid>`, which the list can't match, so it shows "No patients found".
  - Staff results go to `/dashboard/users?search=<id>`, which UsersManagement never reads. The Users page also opens for roles whose sidebar hides it.
  - Appointment results, and RECEPTION's notification items, go to bare `/dashboard/appointments`, which opens today and the persisted doctor.
- **Evidence**: `frontend/src/components/layout/header.tsx:188,418,444,463`; `PatientsManagement.tsx:142-148`; `patients.service.ts:174-183`; `UsersManagement.tsx:92-105`; `frontend/src/app/dashboard/appointments/page.tsx:21-47`.
- **Reported by**: auth #1, #2, #3; patients #8; appts #19; admin #19 (stories 007, 201, 209).

### BRK-22 — "Portal Linked" badge and Unlink are unreachable; the CSV always says "No" · **medium**
- **What**: The list query doesn't select `portalUserId`, but the UI branches on it.
- **Evidence**: `patients.service.ts:201-221`; `PatientsManagement.tsx:226,380,1107,1173`.
- **Reported by**: patients #2.

### BRK-23 — The Last Visit column never renders · **medium**
- **What**: The UI checks `lastVisitDate`, but the backend returns `lastVisitAt`. The LAST_VISIT sort is unreachable too.
- **Evidence**: `PatientsManagement.tsx:209-229,1074,1151`; `patients.service.ts:227`.
- **Reported by**: patients #5.

### BRK-24 — Admin template list labels other doctors' templates "Mine", and admin-created doctor templates are never used · **medium**
- **What**: The label is `t.ownerId ? 'Mine' : 'Branch'`. A "My Template" an admin creates from a doctor's WhatsApp Settings is owned by the admin, so the doctor's sends never pick it up.
- **Evidence**: `whatsapp-templates.controller.ts:52-56,61-66`; `UsersManagement.tsx:735`; `appointments.service.ts:213-218`.
- **Reported by**: admin #17 (story 008).

### BRK-25 — The tracker's Billing step reads the orphaned clinic-billing API · **medium**
- **What**: `PatientProgressTracker` calls `/billing/invoices`, which has no UI. Pharmacy invoices are never counted, so Billing never shows "done" and the button opens a new prefilled bill even after the pharmacy has billed the visit, which invites a duplicate bill.
- **Evidence**: `frontend/src/components/patients/PatientProgressTracker.tsx:60,212`; `frontend/src/lib/api.ts:539-540`.
- **Reported by**: patients #18, counter #13 (stories 210, 611).

### BRK-26 — Invoice list "Delete" can never succeed, and there is no cancel or void · **medium**
- **What**: The trash icon shows on every row, but the backend rejects anything that isn't DRAFT or that has a `checkoutRequestKey`, so every builder invoice fails with "Failed to delete invoice. Please try again." A wrong bill can't be voided.
- **Evidence**: `PharmacyInvoiceList.tsx:371-373,769-777`; `pharmacy-invoice.service.ts:2165-2166`.
- **Reported by**: counter #8 (story 608).

### BRK-27 — One failing initial load blanks the invoice builder's patient, doctor, drug and package lists · **medium**
- **What**: A single `Promise.all` over four endpoints only logs the error. A `/drugs` 403 empties the patient search and the doctor select.
- **Evidence**: `PharmacyInvoiceBuilderFixed.tsx:723-729,788-790`.
- **Reported by**: counter #6.

### BRK-28 — Pharmacy package creation is half-built · **medium**
- **What**:
  - There is no Public toggle and no package-level Instructions, so every package is Private and invisible to colleagues.
  - Subcategory is free text, but the backend needs an exact enum value, so other text gets a 400.
  - Cancel does nothing, and the dialog stays open and filled after a successful create, so a second click makes a duplicate.
  - The Desk browser hard-codes `category: 'Dermatology'`, so "General" packages never show.
- **Evidence**: `frontend/src/components/pharmacy/PharmacyPackageCreator.tsx:51,54,124,127,167-175`; `backend/src/modules/pharmacy/dto/pharmacy-package.dto.ts:21-32,98`; `frontend/src/app/dashboard/pharmacy/page.tsx:655-662` vs `frontend/src/components/ui/dialog.tsx:70-76`; `PackageBrowser.tsx:91-94`.
- **Reported by**: desk D-4, D-5, D-6, D-7 (stories 706, 707).

### BRK-29 — The partner-user path is unreachable, and DOCTOR or RECEPTION see a broken Partner card · **medium**
- **What**: Access depends on `user.metadata.partnerOrganizationId`, but `req.user` carries only id, email, role and branchId. Every role except OWNER, ADMIN and PHARMACIST gets "Partner users must have metadata.partnerOrganizationId…". The controller has no `@Roles`.
- **Evidence**: `pharmacy-partner-sales.service.ts:726-731,808-818`; `backend/src/modules/auth/strategies/jwt.strategy.ts:31-39`; `pharmacy-partner-sales.controller.ts:29-118`.
- **Reported by**: desk D-11.

### BRK-30 — The Pharmacy AI chat forgets previous turns · **medium**
- **What**: `buildCodexPrompt` includes only the current message, so follow-up questions can't be answered meaningfully.
- **Evidence**: `pharmacy-agent.service.ts:477-483,1176-1210`.
- **Reported by**: desk D-18 (story 711).

### BRK-31 — A rejected supplier bill permanently blocks re-entry under its real number · **medium**
- **What**: Reject sets CANCELLED but keeps the unique key. Edit and reopen aren't allowed from CANCELLED, and the re-save conflict points at the cancelled invoice.
- **Evidence**: `pharmacy-purchase-invoice.service.ts:414-415,1013-1014,3112-3115`.
- **Reported by**: purchases #2 (story 904).

### BRK-32 — Prescription Details "Print" prints the whole dashboard · **medium**
- **What**: `onPrint={() => window.print()}`. The only print CSS hides `.no-print`, and no layout element has that class.
- **Evidence**: `frontend/src/app/dashboard/visits/page.tsx:449,1159`; `frontend/src/lib/printStyles.ts:19`.
- **Reported by**: rx #7 (story 011 rx).

### BRK-33 — Phone login fails with the +91 prefix · **medium**
- **What**: Login strips only `+`, so `+91 90000 00003` becomes `919000000003`, which doesn't match the stored 10-digit number: "Account not found".
- **Evidence**: `backend/src/modules/auth/auth.service.ts:33-46`; `backend/scripts/seed.ts:103`.
- **Reported by**: auth #13 (story 001).

### BRK-34 — Common Indian phone formats are rejected on patient create · **medium**
- **What**: The DTO regex `^\+?[1-9]\d{6,14}$` rejects spaces, hyphens and a leading 0 before `normalizePhone` runs, so `+91 99490 55123` and `09949055123` fail with an E.164 message. The frontend checks only that the field is non-empty.
- **Evidence**: `backend/src/modules/patients/dto/create-patient.dto.ts:32`; `patients.service.ts:21-25`; `PatientsManagement.tsx:450`.
- **Reported by**: patients #13 (story 202).

### BRK-35 — Walk-in auto-booking swallows every error · **medium**
- **What**: A per-day `catch {}` hides failures. MANAGER (not allowed on `POST /appointments` or `available-slots`) gets a false "No slots available". NURSE (excluded from `GET /appointments/rooms`) gets an empty room list. One room conflict skips the rest of the day.
- **Evidence**: `PatientsManagement.tsx:562-564`; `backend/src/modules/appointments/appointments.controller.ts:47-48,71-72,111-112`.
- **Reported by**: patients #17 (story 203).

### BRK-36 — Archived patients can't be listed or restored once the Undo toast is gone · **medium**
- **What**: There is no archived view and no Unarchive, and `TOAST_LIMIT = 1` means any second toast replaces the Undo. Visibility by URL is covered in SEC-20.
- **Evidence**: `frontend/src/hooks/use-toast.ts:10`; `PatientsManagement.tsx` (no unarchive UI).
- **Reported by**: patients #22 (story 205).

### BRK-37 — Counter cockpit stats and filters cover only the first 8 queue entries · **medium**
- **What**: The queue is fetched with `limit: 8` and no paging. "Queue" shows the server total, while Review/Exceptions/Ready/Paid and the Queue-column filters count only the loaded rows.
- **Evidence**: `PharmacyCounterCockpit.tsx:246-249,412-425,569,673-704`.
- **Reported by**: counter #3 (story 612).

### BRK-38 — Procedures "View Details" is dead and "Load & Edit" can't edit · **medium**
- **What**: `selectedVisit` is never rendered, and Save always calls `createVisit`, so "Load & Edit" could only duplicate.
- **Evidence**: `frontend/src/app/dashboard/procedures/page.tsx:132,300,350,425-431`.
- **Reported by**: visits #15.

### BRK-39 — The Slots-tab Start Visit pre-creates a visit with the placeholder complaint "General consultation" · **medium**
- **What**: This contradicts the form's rule that a new visit sends an empty complaints array, and it 403s for NURSE and RECEPTION. Its handlers are otherwise unwired (DEAD-06).
- **Evidence**: `AppointmentScheduler.tsx:543-551`; `MedicalVisitForm.tsx:807-810`.
- **Reported by**: visits #18.

### BRK-40 — Unknown or 404 routes leave the app shell, and there is no error boundary · **medium**
- **What**: There is no `not-found.tsx` or `error.tsx`. Unknown `/dashboard/*` paths render Next's bare 404 with no sidebar, header or Log out, and runtime errors get the default overlay.
- **Evidence**: absence under `frontend/src/app`.
- **Reported by**: auth #23 (story 002).

### BRK-41 — The mobile shell hides the whole header · **medium**
- **What**: Below 768 px there is no global search, notifications bell, Branded switch, doctor "My Settings" (signature, letterhead, availability, WhatsApp) or "Start Tour".
- **Evidence**: `frontend/src/components/layout/dashboard-layout.tsx:140-165`.
- **Reported by**: auth #15 (story 006).

### BRK-42 — "Account & dues" errors for a supplier with no posted bills · **low**
- **What**: The backend throws `NotFoundException('Distributor ledger not found')`, shown as "Ledger error: …".
- **Evidence**: `PurchaseLedger.tsx:221-228`; `pharmacy-purchase-ledger.service.ts:311-312`.
- **Reported by**: purchases #9.

### BRK-43 — *Suspected:* Gmail attachment ids may not be stable between fetches · **medium**
- **What**: Import re-fetches the message and requires `a.id === input.attachmentId`. Gmail can return a new `attachmentId` on each `messages.get`, which would make every "Review …" fail with "Choose a PDF or photo attachment under 25 MB". Not verifiable offline.
- **Evidence**: `backend/src/modules/inventory/inventory-intake.service.ts:362-376`.
- **Reported by**: purchases #15 (story 906).

### BRK-44 — "High contrast" leaks app-wide after closing the print preview · **low**
- **Evidence**: `PrescriptionBuilder.tsx:6281`.
- **Reported by**: rx #12.

### BRK-45 — Template variable "Add" button never adds · **low**
- **What**: It reads `document.activeElement`, which is the button itself. Only Enter works.
- **Evidence**: `UsersManagement.tsx:878-889`.
- **Reported by**: admin #16.

### BRK-46 — Changing the Consultation filter doesn't reset the page · **low**
- **What**: A user on page 3 sees an empty page, and the empty-state text ignores the filter and suggests "Add a patient…".
- **Evidence**: `PatientsManagement.tsx:153-157,992,1000,1056`.
- **Reported by**: patients #15.

### BRK-47 — Patient form errors replace the list behind the dialog · **low**
- **What**: One `error` state serves both, so a validation error swaps the Patient Records table for "Try Again".
- **Evidence**: `PatientsManagement.tsx:451,458,504,1046-1052`.
- **Reported by**: patients #14.

### BRK-48 — Drug Management pagination and stats bugs · **low**
- **What**: Search and filter don't reset `page`. "Active Drugs" counts only the current page. "Total Drugs" is the filtered total. The Manufacturer filter is truncated at 50.
- **Evidence**: `DrugManagement.tsx:100-104,303,341,361,398`.
- **Reported by**: desk D-22 (story 705).

### BRK-49 — Drug delete checks only invoice usage · **low**
- **What**: A drug used by a package item or a change request (FK Restrict) fails with an opaque "Failed to delete drug".
- **Evidence**: `drug.service.ts:706-723`; `DrugManagement.tsx:236`.
- **Reported by**: desk D-3 (story 704).

### BRK-50 — Fotona Starwalker parameter grid lists "Area" twice, and the two rows mirror each other · **low**
- **Evidence**: `frontend/src/app/dashboard/procedures/page.tsx:31,480`.
- **Reported by**: visits #16.

### BRK-51 — Procedure History cards show the wrong parameters · **low**
- **What**: Cards read `fluence/spotSize/passes`, but the page saves a per-pass `parameters` grid.
- **Evidence**: `procedures/page.tsx:277-294` vs `:359-409`.
- **Reported by**: visits #17.

### BRK-52 — Unlink-portal confirm toast would crash · **low**
- **What**: It passes `{label, onClick}` as the toast `action`, which the Toaster renders as a React child. Currently hidden by BRK-22.
- **Evidence**: `PatientsManagement.tsx:685-706`; `frontend/src/components/ui/toaster.tsx:27`; `use-toast.ts:17`.
- **Reported by**: patients #3.


---

## Role/UI mismatches

### ROL-01 — NURSE, RECEPTION and MANAGER can fill the visit form, but every save is rejected · **high**
- **What**: The sidebar shows Visits to NURSE and MANAGER, and RECEPTION reaches it via Patients "Start Visit". Save Draft, Mark Vitals Complete and photo flows render. `POST /visits`, `PATCH /visits/:id` and `/complete` are DOCTOR/ADMIN/OWNER only, so the nurse's vitals never reach the doctor.
- **Evidence**: `frontend/src/components/layout/sidebar.tsx:72-75`; `MedicalVisitForm.tsx:188-195,2159,2738`; `backend/src/modules/visits/visits.controller.ts:251-252,468-469,478-479`.
- **Reported by**: visits #5 (stories 403, 404); discovery item 7.

### ROL-02 — RECEPTION sees Pharmacy Desk, Counter and Billing, but the backend refuses their data · **high**
- **What**: `/pharmacy/dashboard`, `/drugs`, `/pharmacy/invoices*` and `link-inventory` are ADMIN/PHARMACIST only (plus the DOCTOR bypass). The Desk shows all-zero metrics, Drug Management says "No drugs found" with an "Add New Drug" CTA, and Billing can't check out. See BRK-09 and MIS-04.
- **Evidence**: `frontend/src/components/layout/sidebar.tsx:89-95`; `frontend/src/app/dashboard/pharmacy/page.tsx:131-139`; `DrugManagement.tsx:137-139`.
- **Reported by**: counter preamble (a) and story 609; desk D-20 (story 702); inventory story 803.

### ROL-03 — NURSE sees Rooms, RESCHED and Cancel Appointment, which the server rejects · **medium**
- **What**: The seed grants NURSE `rooms:read` and `appointments:reschedule`, but the room endpoints, reschedule and `DELETE` omit NURSE. RoomCalendar renders empty with the error swallowed, the booking dialog toasts "Failed to fetch rooms", procedure bookings become impossible, and Cancel ends in "Failed to cancel appointment".
- **Evidence**: `backend/scripts/seed_rbac.ts:30-36`; `appointments.controller.ts:97,112,119,180`; `frontend/src/components/rooms/RoomCalendar.tsx:66-84`.
- **Reported by**: appts #8 (story 006); discovery item 7.

### ROL-04 — MANAGER's nav leads to Appointments, Rooms and Users actions that are 403 throughout · **medium**
- **What**: Appointments, Rooms and Users (with "Reset password", "Clinic Holidays", "Working Hours", Edit and Delete) appear for MANAGER, but no appointment, room or availability endpoint admits MANAGER, and user writes and reset codes are OWNER/ADMIN only. The Users page is read-only in practice, with no error shown (MIS-05).
- **Evidence**: `sidebar.tsx:66-69,84-87,126`; `UsersManagement.tsx:423,528,532`; `appointments.controller.ts:48-213`; `doctor-availability.controller.ts:26-31,51,85`; `auth.controller.ts:37`; `password-reset.service.ts:9,36-39`; `users.controller.ts:14,62-63`.
- **Reported by**: appts #9, auth #17, admin story 011.

### ROL-05 — RECEPTION sees Purchases tasks it can't use, and one hidden call can blank the GST page · **medium**
- **What**: Payments & dues, Credits & vouchers and GST & monthly reports are shown (the menu filters only "Approve corrections") and end in dead-end text or a 403. ComplianceCenter `reportsOnly` still calls `/expiry-returns` and shares one error banner.
- **Evidence**: `InventoryWorkspace.tsx:44-57,225`; `frontend/src/components/pharmacy/ComplianceCenter.tsx:256`.
- **Reported by**: purchases #13 (story 912).

### ROL-06 — Photo Delete is shown to NURSE and RECEPTION, but the backend refuses; draft-photo delete is unguarded · **medium**
- **Evidence**: `MedicalVisitForm.tsx:2345`; `visits.controller.ts:402-416,632-633,647-648`.
- **Reported by**: visits #6.

### ROL-07 — ACCOUNTANT has only Dashboard, so the payables and GST work it's allowed to do is unreachable · **medium**
- **What**: The backend admits ACCOUNTANT to purchase-ledger payments and compliance GST reports, but no nav route reaches them. ACCOUNTANT also can't be created from the Role select.
- **Evidence**: `sidebar.tsx`; `pharmacy-purchase-ledger.controller.ts:32`; discovery role table.
- **Reported by**: auth story 005; admin story 011; discovery item 7.

### ROL-08 — DOCTOR and OWNER have no Pharmacy sidebar links, though the backend allows everything · **medium**
- **What**: Doctors reach billing only through "Go to Pharmacy" or the tracker "Bill", and Drug Management only by URL. OWNER can't reach the pharmacy at all from the nav.
- **Evidence**: `sidebar.tsx:89-95`; topic preambles of counter and desk.
- **Reported by**: counter preamble, desk preamble (stories 610, 705); discovery item 7.

### ROL-09 — PATIENT and LAB_TECH users get an empty sidebar but a working header search and URL access · **low**
The access itself is SEC-02 and SEC-03. This is the UX side: a blank app with a live search box.
- **Evidence**: `sidebar.tsx:48-57`; `header.tsx:408,453`.
- **Reported by**: auth #18; patients story 206.

### ROL-10 — The visit "Your Role & Permissions" card misstates access · **low**
- **What**: ADMIN, OWNER and MANAGER fall back to "Doctor – Full access", although MANAGER gets only Overview and History. The Nurse card promises "complaints, and basic assessments", which nurses can't record. ADMIN and OWNER see an empty "Available Features" card.
- **Evidence**: `frontend/src/app/dashboard/visits/page.tsx:647-671,978-1054`; `MedicalVisitForm.tsx:188-195,1688-1702`.
- **Reported by**: visits #7.

### ROL-11 — An unknown role shows the full navigation · **low**
- **What**: `sidebar.tsx` returns every item when `role` is undefined. This happens during loading, and permanently when `/auth/me` fails with a non-401 error (no retry).
- **Evidence**: `sidebar.tsx:151-156`; `dashboard-layout.tsx:84-92`.
- **Reported by**: auth #19.

### ROL-12 — The Role select and copy disagree with the real roles · **low**
- **What**: The Role select offers Admin, Doctor, Nurse, Receptionist, Manager and Pharmacist only, so OWNER, ACCOUNTANT and LAB_TECH can't be created or inspected in the UI. "Therapist" appears in guides and visit permission sets but isn't an enum value. Admin stat cards are also shown to every role.
- **Evidence**: `UsersManagement.tsx` role options; `frontend/src/app/dashboard/users/page.tsx:16-17,27,35`; `frontend/src/app/dashboard/page.tsx:215-236,274-289` (not gated by `showAdminControls` at `:44-47`).
- **Reported by**: admin stories 002, 012; auth #8 (gating part), #21.

---

## Misleading feedback

### MIS-01 — Success is shown when WhatsApp or SMTP is not configured, or the provider rejects the message · **high**
- **What**:
  - The patient WhatsApp reminder toasts "Reminder sent".
  - The prescription Email toasts "Email sent" (and records an `EMAIL_SHARE` event with status QUEUED).
  - Template "Send Test" shows "Test sent (check your WhatsApp)".
  - The prescription WhatsApp document send and appointment-creation confirmations skip silently.
- **Evidence**: `backend/src/modules/notifications/notifications.service.ts:102-117,120-123,135-146,172-180`; `patients.service.ts:336-338`; `PatientsManagement.tsx:714-718`; `prescriptions.service.ts:1483-1489`; `PrescriptionBuilder.tsx:6215-6216`; `UsersManagement.tsx:294`.
- **Reported by**: patients #9, rx #1, admin #11 (stories 207, 005 rx, 008 admin).

### MIS-02 — The dashboard always says "All systems operational", and "No alerts at this time" can never show · **medium**
- **What**: A fake "System Status" row is pushed on success and on failure, so the empty state is unreachable.
- **Evidence**: `frontend/src/app/dashboard/page.tsx:122-145,351`.
- **Reported by**: auth #9 (story 011).

### MIS-03 — Doctor notifications aren't scoped to the doctor · **medium**
- **What**: The bell lists every branch appointment for the next 48 h as the signed-in doctor's.
- **Evidence**: `backend/src/modules/reports/reports.service.ts:1160-1161`; `header.tsx:172-180`.
- **Reported by**: auth #5 (story 008).

### MIS-04 — Load failures render as "no data" · **medium**
- **What**:
  - Pharmacy Invoices shows "No invoices found / Try a different search…".
  - The Desk shows all-zero metrics.
  - Drug Management shows "No drugs found" with an "Add New Drug" CTA.
  - RoomCalendar renders empty.
  - The Reports API error leaves the previous report or "No data available".
- **Evidence**: `PharmacyInvoiceList.tsx:128-131,668`; `frontend/src/app/dashboard/pharmacy/page.tsx:131-139`; `DrugManagement.tsx:137-139`; `RoomCalendar.tsx:66-84`; `reports/page.tsx` (console.error).
- **Reported by**: counter #11, desk D-20, appts #8 (part), admin story 009.

### MIS-05 — Users page errors are silent · **medium**
- **What**: `submit` and `onDelete` have no catch. A 409 duplicate email, a 400 "Cannot delete user with existing appointments or visits" and MANAGER 403s show nothing.
- **Evidence**: `UsersManagement.tsx:107-135,142-146`; `users.service.ts:264-266`.
- **Reported by**: admin #15 (stories 002, 004, 011).

### MIS-06 — "Refill stamp" prints "Refill eligible" unconditionally · **medium**
- **What**: It depends only on the checkbox, never on the prescription's refill allowance. This is a clinical and legal risk.
- **Evidence**: `PrescriptionBuilder.tsx:3993-4007`.
- **Reported by**: rx #11.

### MIS-07 — AI proposal cards don't show what will be written · **medium**
- **What**: The backend returns `input`/`preview`, but `ProposalCard` renders only the model's title and summary, so users click "Apply" blind.
- **Evidence**: `frontend/src/components/pharmacy/AgenticPharmacyDock.tsx:1075-1160` (Apply at `:1145`); `pharmacy-agent.service.ts:1733-1734`.
- **Reported by**: desk D-15 (story 710).

### MIS-08 — "Save Fields as Template" says "on this device" but saves a public server template · **medium**
- **Evidence**: `PrescriptionBuilder.tsx:2994,3014-3016,6686`.
- **Reported by**: rx #6.

### MIS-09 — Duplicate ABHA ID gives a generic server error (500) · **medium**
- **What**: `abhaId` is `@unique`, but only P2002 on `patientCode` is handled, so the user sees a server error instead of "ABHA already registered".
- **Evidence**: `schema.prisma:254`; `patients.service.ts:41-54`.
- **Reported by**: patients #12 (story 202).

### MIS-10 — Pharmacy Invoices stat cards are page-scoped but labelled as totals · **medium**
- **What**: "Total Invoices" is `invoices.length`. "Total Amount" and "Pending Amount" sum the current page only, and Pending ignores PARTIALLY_PAID. The header shows the server total.
- **Evidence**: `PharmacyInvoiceList.tsx:469-477,491,659`.
- **Reported by**: counter #10 (story 608).

### MIS-11 — Today "Orders awaiting receipt" counts drafts and unapproved orders · **medium**
- **What**: The backend's OPEN includes DRAFT and AWAITING_APPROVAL, but receiving needs APPROVED, SENT or PART_RECEIVED.
- **Evidence**: `InventoryWorkspace.tsx:538-552,614-617`; `inventory-workflow.service.ts:673-686`; `inventory-replenishment.service.ts:362`.
- **Reported by**: inventory #3 (story 801).

### MIS-12 — Stock alerts are mislabelled · **low**
- **What**: The alert counts `currentStock <= 0`, but the dashboard says "below reorder level" and the bell says "Low stock".
- **Evidence**: `reports.service.ts:1140`; `dashboard/page.tsx:88`.
- **Reported by**: auth #10.

### MIS-13 — Dashboard "Active Users" always equals "Total Users", and differs from the Users table · **low**
- **Evidence**: `backend/src/modules/auth/auth.controller.ts:85-99`; `users.service.ts:131-137`.
- **Reported by**: auth #8, admin #20.

### MIS-14 — "My Settings" is empty for non-doctors, but Save still writes and toasts · **low**
- **What**: Save is always shown, calls `updateUserProfile` with WhatsApp metadata and toasts "WhatsApp preferences updated."
- **Evidence**: `header.tsx:353-359,681,780`.
- **Reported by**: auth #16.

### MIS-15 — Overview "Photos Captured" is hard-coded to 0 · **low**
- **Evidence**: `MedicalVisitForm.tsx:1999` vs `:1870`.
- **Reported by**: visits #9.

### MIS-16 — Purchase costs says "Reviewed purchase invoices only" but uses committed ones · **low**
- **Evidence**: `frontend/src/components/pharmacy/DistributorAnalytics.tsx:237`; `pharmacy-purchase-invoice.service.ts:1141-1143`.
- **Reported by**: purchases #14.

### MIS-17 — "Appointment Details" always says Start Visit, even when a visit exists · **low**
- **Evidence**: `DoctorDayCalendar.tsx:997-1000` vs `:539-542`.
- **Reported by**: appts #20.


---

## Dead UI & stale code

### DEAD-01 — QuickGuides and the Receptionist tour describe UI that doesn't exist · **medium**
- **What**:
  - **Patients**: says "Add Patient" (the button is "New Patient"), date of birth (the form has Age), medical history, insurance, a status filter, invoices on the profile.
  - **Users**: "Add User" (button "New User"), Therapist/Owner roles, clickable rows.
  - **Pharmacy**: a "Billing & GST tab", "Inventory > Pharmacy Control", an "insurance" payment mode.
  - **Appointments**: "double-click appointment to view/edit/cancel".
  - **Rooms**: click to view or reassign, availability schedules, amenities, cleaning tracking.
  - **Receptionist tour and Dashboard Guide**: stat cards for appointments, registrations and occupancy, and clickable alerts and appointments.
- **Evidence**: `frontend/src/app/dashboard/patients/page.tsx:19-21,28,37`; `users/page.tsx:16-17,27,35`; `pharmacy/page.tsx:530-531,538-539`; `appointments/page.tsx:115`; `rooms/page.tsx:283,290-301`; `frontend/src/components/tours/ReceptionistTour.tsx:300-310,319`; `dashboard/page.tsx:257,354-385,410-420`; builder payment modes `PharmacyInvoiceBuilderFixed.tsx:2858-2861` vs enum `schema.prisma:1928-1935`.
- **Reported by**: auth #20, #21; patients #19; appts #7 (copy part), #12; counter #15; desk D-21.

### DEAD-02 — The Doctor "Visit Workflow Tour" highlights nothing · **low**
- **What**: All 19 steps lack `element:` anchors and float.
- **Evidence**: `frontend/src/components/tours/DoctorTour.tsx:271`.
- **Reported by**: auth #22 (story 010).

### DEAD-03 — Dead `?tab=` deep links land on Inventory → Today · **medium**
- **What**: Bell "low stock" and "expiry" (`?tab=low-stock`, `?tab=expiry`), Desk "Inventory Control", and Counter "Shelf locations" and "Inventory control" (`?tab=pharmacy-control`). InventoryWorkspace reads only `area`/`view`.
- **Evidence**: `header.tsx:207,214,269,277`; `pharmacy/page.tsx:212,223`; `InventoryWorkspace.tsx:114-115`.
- **Reported by**: auth #6, desk D-21, counter preamble, discovery item 1 (stories 008, 801, 812).

### DEAD-04 — Appointment tile long-press, double-click and inline cancel are unreachable · **low**
- **What**: The label overlay (`pointerEvents:'auto'`, `zIndex:2`) covers occupied tiles, so long-press never fires. There is no `onDoubleClick`, and the inline X is disabled (`showInlineActions = false`).
- **Evidence**: `DoctorDayCalendar.tsx:457-466` vs `:654-716`.
- **Reported by**: appts #7 (story 006).

### DEAD-05 — "Edit Invoice" is dead · **low**
- **What**: It dispatches an event and scrolls to `[data-pharmacy-invoice-builder]`, which only the orphaned `PharmacyInvoiceBuilder.tsx` listens for or carries.
- **Evidence**: `PharmacyInvoiceList.tsx:336-348`; `PharmacyInvoiceBuilder.tsx:189`.
- **Reported by**: counter #9.

### DEAD-06 — Slots tab reschedule and start-visit handlers are never wired · **low**
- **Evidence**: `AppointmentScheduler.tsx:408-490,520-571,773-786`.
- **Reported by**: appts #22.

### DEAD-07 — The Counter "Rx queue" button is a no-op, and "Pull visits" only re-reads · **low**
- **Evidence**: `frontend/src/app/dashboard/pharmacy/page.tsx:409`; `PharmacyCounterCockpit.tsx:586-594`.
- **Reported by**: counter #2 (story 612).

### DEAD-08 — "Printer profile" select is always empty · **low**
- **What**: `upsertPrinterProfile` is never called, so no user can create a profile.
- **Evidence**: `PrescriptionBuilder.tsx:6163-6175`; `frontend/src/lib/api.ts:1035`.
- **Reported by**: rx #10.

### DEAD-09 — Voice-dictation buttons for Subjective, Objective, Assessment and Plan are built but never rendered · **low**
- **Evidence**: `MedicalVisitForm.tsx:1307-1358`; dictation exists at `PrescriptionBuilder.tsx:4576,4854`.
- **Reported by**: visits #11 (story 406).

### DEAD-10 — Dead standalone photos panel and RECEPTION Lab Tests content · **low**
- **What**: `PhotosPanel` sits inside a branch that only renders when `showForm` is true. Lab Tests content renders for `basic-info`, but its tab trigger is doctor-only.
- **Evidence**: `visits/page.tsx:1150`; `MedicalVisitForm.tsx:2167` vs `:1698-1701`.
- **Reported by**: visits #10, #12.

### DEAD-11 — "Cancel remaining order" label can never show · **low**
- **What**: The label tests `PART_RECEIVED`, but the button renders only for DRAFT, AWAITING_APPROVAL, APPROVED or CHALLAN.
- **Evidence**: `WorkflowDocumentEditor.tsx:1395,1404-1405`.
- **Reported by**: inventory #7 (story 810).

### DEAD-12 — Write-only and never-true code · **low**
- **What**: `cms_next_after_login` is written but never read. The Desk `TrendingUp` icon condition (`label === "Today's sales"`) never matches "Sales".
- **Evidence**: `frontend/src/lib/api.ts:253`; `frontend/src/lib/authRedirect.ts:10`; `pharmacy/page.tsx:574`.
- **Reported by**: auth #12, desk D-21.

### DEAD-13 — Orphaned components and APIs with no UI · **low**
- **What**: Orphaned components: BillingManagement, StockPredictionDashboard, PharmacyDashboard, PharmacyPackageManager, PharmacyInvoiceBuilder (non-Fixed), PharmacyInventoryControl, ShelfIntelligence. APIs with no caller: audit-logs, 1mg, prescription refills, template version approval, appointment bulk-update, `PATCH /users/:id/status`, `POST /users/:id/change-password`, `GET /auth/backup/:jobId`, server-side `POST /prescriptions/:id/share`, translation memory, printer profiles. Also, the drug DTO's `isDiscontinued` has no toggle, so Delete is the only way to retire a drug.
- **Evidence**: discovery items 8 and "Data Entities"; desk story 704.
- **Reported by**: discovery; desk story 704; rx story 005; admin stories 001, 004.

---

## Minor

### MIN-01 — The calendar now-line and today detection go stale on a long-open page · **low**
- **Evidence**: `DoctorDayCalendar.tsx:107-117`.
- **Reported by**: appts #21.

### MIN-02 — Conflict suggestions can overlap bookings and ignore leave, hours and the past · **low**
- **Evidence**: `backend/src/modules/appointments/utils/scheduling.utils.ts:144-166`.
- **Reported by**: appts #17.

### MIN-03 — The Room Calendar is hard-coded to 09:00–18:00 · **low**
- **What**: Appointments outside that window are not drawn.
- **Evidence**: `RoomCalendar.tsx:51-52,410-411,451-453` vs `frontend/src/lib/doctor-availability.ts:70-75`.
- **Reported by**: appts #11.

### MIN-04 — Patients column sorting covers only the current page · **low**
- **Evidence**: `PatientsManagement.tsx:162,256-283`; `patients.controller.ts:36-46`; `patients.service.ts:200`.
- **Reported by**: patients #16.

### MIN-05 — Reorder screens show raw database IDs instead of names · **low**
- **What**: Affected labels: "Supplier {id}", "Requested by {id}", "Accepted … by {actorId}", "Changed … by {id}".
- **Evidence**: `frontend/src/components/inventory/ReplenishmentCenter.tsx:119,168,208`; `inventory-replenishment.service.ts:66,176`.
- **Reported by**: inventory #4 (story 810).

### MIN-06 — Duplicate page titles · **low**
- **What**: Patients, Pharmacy Invoices, Pharmacy Counter, Pharmacy Billing and Drug Management each render two stacked headings.
- **Evidence**: `frontend/src/app/dashboard/pharmacy/invoices/page.tsx:18`; `PharmacyInvoiceList.tsx:482`; `pharmacy/page.tsx:198,454`; `PharmacyCounterCockpit.tsx:553-555`.
- **Reported by**: counter #14; patients redundancy notes; desk redundancy notes.

### MIN-07 — Patient Analytics "Avg Age" is wrong · **low**
- **What**: It uses bucket lower bounds and divides by a total that includes patients with no age (NaN when 0).
- **Evidence**: `reports/page.tsx:541-542`; `reports.service.ts:278-284`.
- **Reported by**: admin #21.

### MIN-08 — Small inconsistencies · **low**
- **What**:
  - The Email button is disabled until the prescription is saved, unlike the other exports (`PrescriptionBuilder.tsx:6206,6232,6287`).
  - AI Send stays enabled while the badge says "Assistant unavailable", and the upload and send icon buttons have no accessible name (`AgenticPharmacyDock.tsx:745-768,803-813`).
- **Reported by**: rx #13; desk D-19.

---

## Severity totals note

The Totals table at the top counts each entry once. BRK-11 is merged into SEC-19 and is not counted. This table shows which entries carry each severity.

| Theme | Entries | Critical | High | Medium | Low |
|---|---|---|---|---|---|
| Security & access control | SEC-01–26 | 01–04 | 05–19 | 20–25 | 26 |
| Data integrity & money | DAT-01–32 | 01, 02, 03 | 04–15 | 16–30 | 31, 32 |
| Broken features | BRK-01–52 (excl. 11) | 01 | 02–10, 13 | 12, 14–41, 43 | 42, 44–52 |
| Role/UI mismatches | ROL-01–12 | — | 01, 02 | 03–08 | 09–12 |
| Misleading feedback | MIS-01–17 | — | 01 | 02–11 | 12–17 |
| Dead UI & stale code | DEAD-01–13 | — | — | 01, 03 | 02, 04–13 |
| Minor | MIN-01–08 | — | — | — | 01–08 |
