# developer-skill-pack run — findings summary (2026-11-07)

The skills from [dennisonbertram/developer-skill-pack](https://github.com/dennisonbertram/developer-skill-pack) (v1.3.0) were installed at user scope (`~/.claude/skills`, `~/.claude/agents`) in a cloud session and run against this repo at `ebc5606`. Every run was **report-only**: no product code was changed, no fixes were merged, and no GitHub issues, PRs or comments were created. The pack's hooks (TDD reminder, session-start banner) were not installed.

To exercise the browser-driven skills the app was booted locally: Postgres 16, `npm ci`, `prisma migrate deploy` plus `db push` (see S-7), the seed scripts plus extra role users and patients, the NestJS build on :4000 and the Next dev server on :3000. All backend (978) and frontend (842) tests pass, including the 17 Postgres-backed suites when their `*_TEST_DATABASE_URL` vars are set.

## Which skills ran

| Skill | Ran? | Output |
|---|---|---|
| ux-paths | Yes, full: discovery → 10-agent story swarm → consolidation | [`docs/ux-paths/`](../ux-paths/): catalog (120 stories, 98% feature coverage), topic files, deduplicated [defect register](../ux-paths/defects.md) (159 defects: 8 critical, 40 high) |
| ux-walker | Yes, 22 stories × 4 personas, report-only | [`docs/ux-walker/latest-report.md`](../ux-walker/latest-report.md): 4 pass / 18 fail; 8 critical, 47 high |
| ux-visual | Yes, 6 pages × 3 viewports; phases 3–5 compressed into one agent; `--no-implement --no-second-opinion` | [`docs/ux-visual/report.md`](../ux-visual/report.md): 148 findings (11 P0), 15 clusters, 6 decision docs |
| ux-flow | Yes, 6 journeys + redundancy critic, `--no-issues` | [`docs/ux-flow/report.md`](../ux-flow/report.md): 6/6 journeys convoluted; 9 ranked simplification proposals |
| regression-guard | Yes, on fixes #54, #55, #50, #47 | Summary below (S-4, D-6) |
| setup-repo | Audit only (no scaffolding) | Summary below (P-1…P-4) |
| deploy-check | Audit only (no instrumentation) | Summary below (P-5) |
| walk-the-issues | Grooming phase only | The repo has never had a GitHub issue, so there was nothing to groom. Five candidate issues are listed under P-6 |
| debug | No | It needs a failing symptom, and every test suite passes |
| research-spike | No | It needs a research question |
| ux-auto-improve | No | It implements and merges code and makes narrated videos; out of scope for a findings run |
| coordinator, chief, mine-transcripts | No | Session-orchestration tools (chief needs tmux/cmux and macOS notifications), not repo analysis |
| ux-paths-native, ux-walker-native, ux-flow-native | No | macOS/iOS-only; this is a web app |

**Environment substitutions.** The browser skills call the `agent-browser` CLI. Installing it globally was blocked in this environment, so every browser step used the pre-installed Playwright Chromium instead, and the skills' `geometry-audit.js` / `layout-audit.js` ran through `page.evaluate`. ux-visual's MUSE/Gemini second opinions need an OpenRouter key, so they were skipped. Screenshots (several hundred) were kept out of the repo.

## Highest-severity findings

Verification legend: **[live]** reproduced against the running app; **[code]** confirmed by reading code on both ends; **[orch]** independently re-checked by the orchestrating session, not just the sub-agent.

### Security and access control
- **S-1 Privilege escalation:** a DOCTOR can make themselves OWNER with `PATCH /users/:id/role` → 200. Cause: the role guard lets DOCTOR and ADMIN pass every `@Roles` check (`roles.guard.ts:27-30`), and `assignRole` doesn't restrict target roles. [live][orch]
- **S-2 Secrets leak:** doctors' `whatsappAccessToken` (stored in `users.metadata`) is returned by `GET /users` to every signed-in role, including RECEPTION and zero-permission LAB_TECH. `formatUser` strips the password and Google tokens but not metadata (`users.service.ts:918-933`). [live][orch]
- **S-3 Default-open endpoints:** the global guards (`JwtAuthGuard`, `RolesGuard`, `PermissionsGuard`) all return `true` when an endpoint has no `@Roles`/`@Permissions`. LAB_TECH (no permissions) can list patients and visits and soft-delete a visit (`DELETE /visits/:id` → 200). The same applies to the patients controller, prescription share/PDF/email, the dispense-task API, reports and `GET /users`. [live][orch]
- **S-4 Sessions survive a password reset:** `jwt.strategy.ts` never re-reads the user, so an admin-issued reset leaves an attacker's token valid for `JWT_EXPIRES_IN` (1d). Changing your own password doesn't void a pending reset code. [code]
- **S-5 Open redirect:** `/login?next=https://example.com` (or `//example.com`) sends the user off-site after login (`login/page.tsx:36-37`). [live]
- **S-6 Pharmacy AI agent:** stored data enters the prompt with no untrusted-data marker; Codex runs from the repo root, where `backend/.env` lives (`pharmacy-agent.service.ts:1150-1210`). AI `update_drug` proposals skip the price-approval check. Threads and proposals are scoped by branch, not owner. [code]
- **S-7 Migrations don't build the schema:** `prisma migrate deploy` (the only step in `start.sh` / `docker-entrypoint.sh`) leaves 13 tables and several columns missing (`idempotency_records`, `whatsapp_templates`, `patients.isArchived`, `pharmacy_invoices.mutationVersion`, …). A fresh deploy would break unless someone ran `db push` by hand. `prisma/migrations/20251003_add_db_attachments.sql` is a loose file Prisma ignores. [code][orch]
- Also: no frontend route guards (all 13 pages load for all 9 roles) [live]; unescaped HTML in the invoice-list print window [code]; `/test-transcribe` is reachable signed out [live]; the login throttle (5/min per IP) locks out a shared clinic network [live].

### RBAC is broken for non-doctor roles
- **R-1:** the RBAC seed grants wildcards (`inventory:item:*`, `pharmacy:drug:*`) but `PermissionsGuard` matches exact strings, so the **PHARMACIST gets 403 on inventory, drugs and the pharmacy dashboard**: they can't bill anything. MANAGER loses inventory approvals the same way. [live][orch]
- **R-2:** `GET /users/roles` and `/users/permissions` are shadowed by `GET /users/:id` (route order), so the permission grid is empty even for ADMIN, and "Save Permissions" writes `[]`. [live]
- **R-3:** the sidebar links roles to pages whose APIs 403 (reception → Pharmacy, nurse → Visits/Rooms, manager → Appointments). Failures are shown as empty or zero states. [live]

### Money and clinical data
- **D-1:** a doctor's "Create Prescription" silently overwrote a prescription that was already billed and dispensed. [live]
- **D-2:** Counter "Paid"/"Dispense" marks a prescription done with no invoice and no stock movement. [live]
- **D-3:** Inventory → Sales → "Counter sales" posts stock movements but never creates an invoice (`inventory-workflow.service.ts:1444`). [code]
- **D-4:** checkout leaves payment Pending; "Collect payment" only reopens the bill. [live]
- **D-5:** every report returns 500. In the revenue report, `payment.groupBy({ by: ['createdAt'], _count: { id: true } })` with a relation filter makes Prisma emit `column reference "id" is ambiguous`. All exports return 400. [live][orch]
- **D-6:** `PATCH /appointments/:id` and bulk update change `roomId`/`status` (including un-cancelling) with no slot lock or conflict check, a sibling of the #47 race fix. [code][orch]
- **D-7:** units: the counter shows "Pick N" in doses against stock in selling units; substituting a product keeps the old product's unit quantity (sibling gaps of #55). [live]
- **D-8:** visit photo delete always 404s (`/api/api/…`, `VisitPhotos.tsx:583`), and the thumbnail trash targets the previously selected photo. Today the 404 is the only thing preventing deletion of the wrong photo. [live][orch]
- **D-9:** the Visits doctor picker loads `limit:1` doctors, so visits get attributed to the wrong doctor. The printed prescription has no prescriber name. [live]
- **D-10:** the day calendar silently drops appointments outside the doctor's working hours (09–18 when none are set), although the backend accepts them. [live][orch]
- **D-11:** after the first drug, every drug add returns 500 (empty `barcode`/`sku` strings hit UNIQUE columns). [live]
- Also: duplicate supplier-bill check is exact-string; IGST is never used for credit notes; manually added invoice lines always get 18% GST; and the "Email/WhatsApp sent" toasts appear when nothing is configured. All of these are [code]; see the defect register.

### Broken core flows [live]
Link Portal always fails. "Book appointment" from a patient chart fails ("Patient information is missing"). Header search results open the wrong target. Procedures "Save Procedure" always fails. Download PDF fails on every invoice (html2canvas can't parse `oklch`) and leaves a click-blocking overlay. Patient-list "Last Visit" never renders (`lastVisitAt` vs `lastVisitDate`).

### Visual and flow (from ux-visual / ux-flow)
- Design-system `button`/`badge`/`select`/`tabs` use `[overflow-wrap:anywhere]`, so labels break mid-word app-wide and patient rows become 783px tall.
- `dialog.tsx` has no max-height, so Create Patient's submit button is unreachable on laptops and phones.
- The app shell double-scrolls because of an escaping `.sr-only` span, and the tablet breakpoint keeps the sidebar open.
- All six core journeys are convoluted. Examples: a visit takes ~25 actions against an ideal of 8; the prescription-to-paid sale takes 27 against 12. See the ranked proposals in `docs/ux-flow/report.md`.

## Process and tooling (setup-repo / deploy-check / walk-the-issues)
- **P-1:** CI never runs lint, and `next.config.ts` sets `eslint.ignoreDuringBuilds: true`.
- **P-2:** the backend lint glob `{src,apps,libs,test}/*.ts` doesn't recurse, and it runs with `--fix`.
- **P-3:** jest skips 13 backend specs and 1 "stale" frontend spec; `backend/test/` e2e never runs.
- **P-4:** no issue or PR templates. `.claude/settings.json` has no hooks. A stray file `frontend/=` exists.
- **P-5 (deploy-check):** there's no build fingerprint (`/health` returns `'ok'` with no SHA). The skill's template wouldn't work as-is here: App Router treats `__version` as a private folder, `.git` is absent in Docker/Railway builds, and `/api/*` is rewritten to the backend.
- **P-6 (walk-the-issues):** the repo has never had a GitHub issue; work is tracked in PRs and `@cc` contracts. `Issues.md` and `UNIMPLEMENTED_FEATURES_REPORT.md` are stale: most "unimplemented" items are done. Still open: mock drug search and interaction checks (`prescriptions.service.ts:584`), and the 1MG stub module.

## regression-guard detail
- **#54:** well pinned by tests. Edge case: the async rename reads a stale `investigations` list.
- **#55:** strongly pinned (service, frontend and SQL differential tests). Gaps: D-7. Suggested fix: carry a `unit` field on `QueueMedication`.
- **#50:** nothing pins the removed `forgot-password` path. Gaps: S-4.
- **#47:** concurrent create tests are good. Gaps: D-6 (no guarded helper shared by every slot-occupying write), and no concurrent-reschedule test.

Draft tests from the run were not committed; they were left in the session scratchpad.

## Data left in the local throwaway database
Walkers created invoices, a package, a drug, test patients and bookings, and a PATIENT user. The orchestrator restored a soft-deleted seed visit and reverted the doctor→OWNER test. None of this touches any real environment.
