---
name: verify-clinic
description: Launch, drive and prove the Clinic Management System (Linaé) web UI on a real, isolated stack — Next.js frontend + NestJS API + a private Postgres schema — with Playwright. Use it whenever a change to inventory intake (Purchases → "Scan or enter bill", Import CSV, scan/OCR, opening stock) or any dashboard page must be shown working in the real app, or when asked whether a flow works consistently and with good UX. Ships a scripted end-to-end proof for manual purchase-bill intake (stock posting, duplicates, phone layout, double-click, read-back).
---

# Verify the clinic app

The user-facing surface is the Next.js web app (`frontend/`, routes under `/dashboard/...`) backed by the NestJS API (`backend/`) and Postgres via Prisma. There is no CLI surface; secondary surfaces are the raw HTTP API and the database. This skill drives the **web UI as a logged-in staff user** and proves results from the UI, the network writes and the database.

It builds on the repo's own harness, `scripts/stack/boot.cjs` (used by `scripts/stack/smoke.cjs` and the CR scenarios). That harness creates a throwaway Postgres schema, `prisma db push`es into it, seeds one branch and four users, then starts the API and `next dev` on free loopback ports. Everything below wraps it. All helper paths are relative to the repo root.

Feature recipes live in [`features/README.md`](features/README.md). Read the index and the matching feature file before driving anything; a proof that drives one convenient entry point is incomplete when the map lists others.

## Launch

One-time per container (cloud sessions start fresh):

```bash
npm ci --no-audit --no-fund          # repo root; installs all three workspaces (~60s)
.claude/skills/verify-clinic/scripts/ensure-postgres.sh   # loopback Postgres + db clinic_stack, as postgres/postgres
```

Start an instance (keep it running in the background; it holds the stack until stopped):

```bash
node .claude/skills/verify-clinic/scripts/launch.cjs            # instance "default"
node .claude/skills/verify-clinic/scripts/launch.cjs --name b   # a second, fully isolated instance
node .claude/skills/verify-clinic/scripts/launch.cjs --env-file fake-meta.env   # extra backend env (KEY=VALUE lines), e.g. WHATSAPP_GRAPH_BASE_URL of a fake Meta server
```

- **Ready signal:** stdout prints `READY <state-file> base=http://127.0.0.1:<port> api=http://127.0.0.1:<port> boot=<s>` (about 20s warm; the first boot also generates a Prisma client). The state file `output/verify-clinic/instances/<name>.json` holds `base`, `api`, `schema`, `branchId`, `gitHead` and the seeded `users`.
- **Users** (password `Synthetic-Stack-Only-2026`; all on branch "Lakshmi Family Clinic"): `pharmacist` Anil Deshmukh (seeded PHARMACIST permissions — use this for all inventory work), `owner` Rajesh Iyer, `doctor` Priya Menon, `reception` Sunita Patil.
- **Env:** `STACK_DATABASE_URL` defaults to `postgresql://postgres:postgres@127.0.0.1:5432/clinic_stack`; it must be loopback and carry no `?schema=`.
- **Isolation:** every launch gets its own schema and ports, so instances run side by side. Never point drivers at the user's own `npm run dev` or a Railway URL: they hold real clinic data.
- **Teardown:** `node .claude/skills/verify-clinic/scripts/stop.cjs [--instance NAME]` (see Cleanup).
- The stack copies `frontend/src` into a temp dir and loads `backend/src` at boot. **Edits made after launch are not served.** Stop and relaunch after every code change; doctor flags this.

## Doctor

```bash
node .claude/skills/verify-clinic/scripts/doctor.cjs [--instance NAME]
```

Read-only. It checks that the launcher pid is alive, `/login` answers 200, API `/health` answers 200 and the pharmacist can log in (a 429 counts as healthy because login is throttled), that the private schema has the seeded users, and that git HEAD and app sources are unchanged since boot. It prints `DOCTOR OK` and exits 0, or names each failing check and exits 1. Run it first, and again whenever a drive misbehaves. If it fails, stop and relaunch rather than debugging a half-dead instance.

## Drive

**Scripted proof (manual purchase-bill intake):**

```bash
node .claude/skills/verify-clinic/scripts/drive-manual-bill.cjs [--instance NAME] [--only new,known,multi,duplicate,readback]
```

As the pharmacist, it receives three bills through Inventory → Purchases → "Scan or enter bill" → "Type instead":

1. A new product on desktop.
2. The same product with a new batch on a 390px phone.
3. Two lines (an existing batch plus a new product), with the final button double-clicked.

It then re-posts bill 1 to prove duplicate refusal, and reads the bills and stock back from the register and the stock list. Each run asserts:

- The checks badge reaches "Ready for your final check".
- The UI shows "Stock added".
- There is exactly one `POST drafts`, one `PATCH :id/review` and one `POST :id/commit-stock`.
- The invoice is `STOCK_COMMITTED` in the database.
- `inventory_items.currentStock` rose by paid + free quantity, with one `PURCHASE` row per line in `stock_transactions`.
- There are no page or console errors and no 4xx/5xx API responses.
- On the phone: no horizontal scroll, and the final button is fully on screen.

Names carry a per-run tag, so repeated runs against one instance stay independent. Exit 0 means every check passed.

**Ad-hoc driving (other features):** write a throwaway Playwright script in your scratchpad that reuses the helpers. Keep the login reuse: `/auth/login` allows 5 calls a minute.

```js
const { chromium } = require("playwright");
const L = require("/ABS/REPO/.claude/skills/verify-clinic/scripts/lib.cjs");
const state = L.loadState("default");
(async () => {
  const browser = await chromium.launch();
  const { page } = await L.openPage(browser, state, "pharmacist", { viewport: { width: 1280, height: 900 } });
  const log = L.recorder(page, state);              // pageErrors, consoleErrors, writes, failures
  await page.goto(`${state.base}/dashboard/inventory?area=purchases&view=csv`);
  // ... act through roles/labels from the feature file ...
  console.log(L.sql(state, `SELECT status FROM pharmacy_purchase_invoices`), log.failures);
  await browser.close();
})();
```

Stable handles for this app: route query params (`area`, `view`, `invoice`, `new`); element ids on the bill form (`#distributor-name`, `#distributor-gstin`, `#distributor-dl`, `#invoice-number`, `#invoice-date`, `#goods-date`, `#purchase-invoice-upload`, line inputs `input[id$="-product|-pack-size|-unit|-batch|-expiry-month|-expiry-year|-qty|-free-qty|-rate|-mrp|-hsn"]`); `aria-label`s such as `Product line N`, `Stock status`, `Invoice actions`, `Open bill <no>`; and accessible button names. Prefer these over coordinates and nth-child.

## Evidence

- Drivers write to `output/verify-clinic/evidence/<UTC-stamp>-<feature>/`: `summary.md` (pass/fail table, user-step counts, timings), `result.json` (every check, network writes, DB before and after, ledger rows) and numbered screenshots per step (`<run>-1-intake-home.png` … `<run>-4-stock-added.png`, `duplicate-refused-as-seen.png`, `readback-*.png`). Put ad-hoc evidence in the same tree.
- Server and frontend logs are in `output/stack/verify-clinic-<name>/{backend,frontend}.log`. They are wiped at that instance's next launch, so copy anything you cite into the evidence dir.
- `output/verify-clinic/` is git-ignored; evidence is for reporting, not committing.

Proof standards:

- Drive the real user path: real login, clicks and typing in the browser. Don't call internal setters, write to the DB to fake state, or use test-only endpoints. Read the DB only to *check* results.
- Capture the action and the resulting state: a screenshot before the action, one after, and the network writes the action caused. A final screen alone is not proof.
- Check side effects alongside what is visible: invoice status, `currentStock`, `stock_transactions` and invoice row counts.
- For UX claims, measure what the user experiences. Is the outcome on screen where they acted (`boundingBox` inside the viewport) without scrolling? How many user steps did it take, how long, and does the layout fit at 390px?
- Scan/OCR calls an external model and fails in this stack by design (see the feature file). Don't mock it and call that verified; report it as unverified, or verify only its failure UX.

## Cleanup

```bash
node .claude/skills/verify-clinic/scripts/stop.cjs [--instance NAME]
```

This sends SIGTERM to the launcher pid from the state file, never kills by process name. The launcher's handler kills only the API and Next processes it started, drops its private schema and removes the state file. Evidence under `output/verify-clinic/evidence/` is never touched. If a launcher died uncontrolled, the next launch sweeps orphaned `stack_<deadpid>_*` schemas automatically. Run `stop.cjs` after every failed iteration too, so broken attempts don't strand ports.

## Helpers

All are in `.claude/skills/verify-clinic/scripts/` and run from the repo root.

| Script | What it does |
|---|---|
| `ensure-postgres.sh` | Starts the local Postgres and creates `clinic_stack`. Idempotent; needs root. |
| `launch.cjs [--name N] [--env-file F]` | Boots an isolated stack (F adds backend env such as fake WhatsApp settings; the backend keeps raw bodies like `main.ts`), writes `output/verify-clinic/instances/N.json`, prints `READY`, and runs until stopped. Run it in the background. |
| `doctor.cjs [--instance N]` | Read-only health check; exits 0 or 1. |
| `drive-manual-bill.cjs [--instance N] [--only …]` | Scripted end-to-end proof of manual bill intake; exits 0 only if all checks pass. |
| `stop.cjs [--instance N]` | Tears down only what `launch.cjs` started. |
| `lib.cjs` | Library, not a CLI: `loadState`, `openPage` (one login per role, cookie reuse), `recorder`, `sql` (read-only JSON rows from the instance schema), `evidenceDir`, `checker`. |
