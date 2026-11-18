#!/usr/bin/env node
// Drives Inventory -> Purchases -> "Scan or enter bill" -> "Type instead" as a pharmacist,
// end to end on the real stack, several times in a row, and proves each run with UI state,
// network writes and database rows. Exit 0 only if every check passes.
//
// Usage: node .claude/skills/verify-clinic/scripts/drive-manual-bill.cjs [--instance default] [--only new,known,multi,duplicate,readback]
// Evidence: output/verify-clinic/evidence/<stamp>-manual-bill/ (summary.md, result.json, *.png)
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { arg, loadState, evidenceDir, sql, openPage, recorder, checker } = require("./lib.cjs");

const INTAKE = "/dashboard/inventory?area=purchases&view=intake";
const DESKTOP = { width: 1280, height: 900 };
const PHONE = { width: 390, height: 844 };
const SUPPLIER = { name: "Shree Laxmi Vitality Pharma", gstin: "27AABCS1234F1Z5", dl: "MH-PUN-SLV-2026" };
const tag = Date.now().toString(36).toUpperCase();
const cream = `Verify Barrier Cream ${tag}`;
const tablet = `Verify Cetirizine 10 ${tag}`;
const line = (o) => ({ pack: "100 g", unit: "Tube", expM: "8", expY: "2028", free: "0", hsn: "3304", kind: "Cosmetic / skin care", ...o });

const RUNS = {
  new: { label: "new product, desktop", viewport: DESKTOP, bill: `VER/${tag}/1`, lines: [line({ product: cream, batch: `BC${tag}A`, qty: "10", free: "2", rate: "320", mrp: "450" })] },
  known: { label: "known product + new batch, phone 390px", viewport: PHONE, bill: `VER/${tag}/2`, lines: [line({ product: cream, batch: `BC${tag}B`, qty: "6", rate: "318", mrp: "450" })] },
  multi: {
    label: "two lines (known batch + new product), double-clicked final action", viewport: DESKTOP, bill: `VER/${tag}/3`, doubleClick: true,
    lines: [
      line({ product: cream, batch: `BC${tag}A`, qty: "4", rate: "320", mrp: "450" }),
      line({ product: tablet, pack: "10 tablets", unit: "Strip", hsn: "3004", batch: `CT${tag}`, qty: "20", free: "5", rate: "18", mrp: "32", kind: "Other consumable" }),
    ],
  },
};

const stockByName = (state, names) =>
  Object.fromEntries(names.map((n) => [n, 0]).concat(
    sql(state, `SELECT name, sum("currentStock")::int AS qty FROM inventory_items WHERE name IN (${names.map((n) => `'${n.replace(/'/g, "''")}'`).join(",")}) GROUP BY name`).map((r) => [r.name, r.qty]),
  ));

async function shot(page, dir, name) {
  await page.screenshot({ path: path.join(dir, `${name}.png`) });
  return `${name}.png`;
}

async function fillBill(page, run, steps) {
  const act = async (what, fn) => {
    steps.push(what);
    try {
      await fn();
    } catch (e) {
      await page.screenshot({ path: path.join(run.dir, `${run.key}-driver-error.png`) }).catch(() => {});
      throw Error(`step "${what}": ${e.message.split("\n")[0]}`);
    }
  };
  await act("click Type instead", () => page.getByRole("link", { name: "Type instead" }).click());
  await act("fill Distributor", () => page.locator("#distributor-name").fill(SUPPLIER.name));
  await act("fill GSTIN", () => page.locator("#distributor-gstin").fill(SUPPLIER.gstin));
  await act("fill DL No.", () => page.locator("#distributor-dl").fill(SUPPLIER.dl));
  await act("fill Invoice No.", () => page.locator("#invoice-number").fill(run.bill));
  for (const [i, l] of run.lines.entries()) {
    if (i > 0) await act("click Add Line", () => page.getByRole("button", { name: "Add Line" }).click());
    const section = page.locator(`[aria-label="Product line ${i + 1}"]`);
    // A finished line can fold to a one-line summary; reopen it the way a user would.
    await section.locator("details:not([open]) > summary").first().click({ timeout: 2000 }).catch(() => {});
    const f = (suffix) => section.locator(`input[id$="-${suffix}"]`).first();
    for (const [suffix, key, name] of [["product", "product", "Product"], ["pack-size", "pack", "Pack Size"], ["unit", "unit", "Stock unit"], ["batch", "batch", "Batch"], ["expiry-month", "expM", "Exp. Month"], ["expiry-year", "expY", "Exp. Year"], ["qty", "qty", "Paid Qty"], ["free-qty", "free", "Free Qty"], ["rate", "rate", "Rate"], ["mrp", "mrp", "MRP"], ["hsn", "hsn", "HSN"]])
      await act(`line ${i + 1} fill ${name}`, () => f(suffix).fill(l[key]));
  }
}

// Product matching runs async after typing. Resolve every "not in inventory" line by choosing a
// product kind and "Create new item", exactly as a user would, until the checks badge says ready.
async function resolveProducts(page, run, steps) {
  const deadline = Date.now() + 90000;
  const ready = page.getByText("Ready for your final check");
  while (Date.now() < deadline) {
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    if (await ready.isVisible().catch(() => false)) return true;
    // Snapshot ids instead of holding a lazy locator: the panel re-renders after each confirmation.
    const ids = await page.locator('select[id$="-new-kind"]:visible').evaluateAll((els) => els.map((e) => e.id)).catch(() => []);
    if (ids.length) {
      const id = ids[0];
      const index = Number(id.match(/product-(\d+)-new-kind/)[1]);
      steps.push(`line ${index + 1} choose product kind`);
      await page.locator(`#${id}`).selectOption({ label: run.lines[index].kind }, { timeout: 5000 }).catch(() => {});
      const create = page.getByRole("button", { name: "Create new item" }).first();
      if (!(await create.isEnabled({ timeout: 5000 }).catch(() => false))) continue;
      steps.push(`line ${index + 1} click Create new item`);
      await Promise.all([page.waitForResponse((r) => r.url().includes("/master-confirmations"), { timeout: 30000 }), create.click()]);
      continue;
    }
    await page.waitForTimeout(750);
  }
  return false;
}

async function receive(browser, state, dir, key, run, c) {
  Object.assign(run, { dir, key });
  const { context, page } = await openPage(browser, state, "pharmacist", { viewport: run.viewport, ...(run.viewport === PHONE && { isMobile: true, hasTouch: true }) });
  const log = recorder(page, state);
  const steps = [];
  const names = [...new Set(run.lines.map((l) => l.product))];
  const before = stockByName(state, names);
  const t0 = Date.now();
  await page.goto(`${state.base}${INTAKE}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.getByRole("link", { name: "Type instead" }).waitFor({ timeout: 180000 });
  const loadMs = Date.now() - t0;
  await shot(page, dir, `${key}-1-intake-home`);
  await fillBill(page, run, steps);
  await shot(page, dir, `${key}-2-filled`);
  const ready = await resolveProducts(page, run, steps);
  c.ok(`[${key}] checks reach "Ready for your final check"`, ready, await page.locator("main").innerText().then((t) => t.slice(t.indexOf("Check before adding stock"), t.indexOf("Check before adding stock") + 300)));
  const primary = page.getByRole("button", { name: "Confirm reviewed values & add stock" });
  await primary.scrollIntoViewIfNeeded();
  if (run.viewport === PHONE) {
    const fit = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth }));
    c.ok(`[${key}] no horizontal page scroll at 390px`, fit.scrollWidth <= fit.innerWidth, fit);
    const box = await primary.boundingBox();
    c.ok(`[${key}] final action fully on screen at 390px`, box && box.x >= 0 && box.x + box.width <= PHONE.width && box.height >= 40, box);
  }
  await shot(page, dir, `${key}-3-ready`);
  const writesBefore = log.writes.length;
  const tClick = Date.now();
  steps.push(run.doubleClick ? "double-click final action" : "click final action");
  if (run.doubleClick) await primary.dblclick();
  else await primary.click();
  const status = page.locator('[aria-label="Stock status"]');
  await status.filter({ hasText: "Stock added" }).waitFor({ timeout: 60000 }).catch(() => {});
  const postMs = Date.now() - tClick;
  c.ok(`[${key}] UI says "Stock added"`, /Stock added/.test(await status.innerText().catch(() => "")), await status.innerText().catch(() => "no status"));
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await shot(page, dir, `${key}-4-stock-added`);
  const posting = log.writes.slice(writesBefore).filter((w) => /purchase-invoices\/(drafts|[^/]+\/review|[^/]+\/commit-stock)$/.test(w.path));
  const kinds = posting.map((w) => `${w.method} ${w.path.replace(/purchase-invoices\/(?!drafts)[^/]+/, "purchase-invoices/:id")}`);
  c.ok(`[${key}] exactly one save, one review, one commit`, JSON.stringify(kinds) === JSON.stringify(["POST /api/pharmacy/purchase-invoices/drafts", "PATCH /api/pharmacy/purchase-invoices/:id/review", "POST /api/pharmacy/purchase-invoices/:id/commit-stock"]), kinds);
  const [inv] = sql(state, `SELECT status, "netPayable", "stockCommittedAt" IS NOT NULL AS committed FROM pharmacy_purchase_invoices WHERE "invoiceNumber" = '${run.bill}'`);
  c.ok(`[${key}] DB invoice ${run.bill} is STOCK_COMMITTED`, inv?.status === "STOCK_COMMITTED" && inv.committed, inv);
  const after = stockByName(state, names);
  for (const n of names) {
    const expected = run.lines.filter((l) => l.product === n).reduce((s, l) => s + Number(l.qty) + Number(l.free), 0);
    c.ok(`[${key}] DB stock of "${n}" rose by ${expected}`, after[n] - before[n] === expected, { before: before[n], after: after[n] });
  }
  const tx = sql(state, `SELECT type, quantity, "batchNumber" FROM stock_transactions WHERE reference LIKE 'PINV-${run.bill}-%' ORDER BY "batchNumber"`);
  c.ok(`[${key}] one PURCHASE ledger row per line`, tx.length === run.lines.length && tx.every((t) => t.type === "PURCHASE"), tx);
  c.ok(`[${key}] no page or console errors`, !log.pageErrors.length && !log.consoleErrors.length, { pageErrors: log.pageErrors, consoleErrors: log.consoleErrors });
  c.ok(`[${key}] no failed API calls`, !log.failures.length, log.failures);
  await context.close();
  return { key, label: run.label, bill: run.bill, viewport: run.viewport, userSteps: steps.length, steps, loadMs, postMs, stockBefore: before, stockAfter: after, ledger: tx, writes: log.writes };
}

// Re-entering an already posted bill must be refused with a way forward, and must not add stock.
async function duplicate(browser, state, dir, c) {
  const run = { ...RUNS.new, label: "duplicate of the first bill, phone 390px", dir, key: "duplicate" };
  const { context, page } = await openPage(browser, state, "pharmacist", { viewport: PHONE, isMobile: true, hasTouch: true });
  const log = recorder(page, state);
  const before = stockByName(state, [cream]);
  await page.goto(`${state.base}${INTAKE}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await fillBill(page, run, []);
  await resolveProducts(page, run, []);
  const primary = page.getByRole("button", { name: "Confirm reviewed values & add stock" });
  if (await primary.isEnabled().catch(() => false)) await primary.click();
  else await page.getByRole("button", { name: "Save draft" }).click();
  // The outcome belongs where the user clicked: the sticky action bar, judged by state (status pill,
  // which controls exist, what is covered), not by matching prose.
  const bar = page.getByRole("region", { name: "Invoice actions" });
  const outcome = bar.getByRole("alert");
  await outcome.waitFor({ timeout: 30000 }).catch(() => {});
  const box = await outcome.boundingBox().catch(() => null);
  await shot(page, dir, "duplicate-refused-as-seen");
  const open = bar.getByRole("button", { name: "Open existing invoice" });
  const reachable = await open.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth && el.contains(hit);
  }).catch(() => false);
  const message = await outcome.innerText().catch(() => null);
  c.ok("[duplicate] action bar shows a refusal at the click site, on screen", Boolean(box && box.y >= 0 && box.y + box.height <= PHONE.height), box && { y: Math.round(box.y), viewportHeight: PHONE.height });
  c.ok("[duplicate] refusal carries the red cross status", (await outcome.locator('[data-review-state="error"]').count()) === 1, message);
  c.ok("[duplicate] refused action is no longer offered", (await bar.getByRole("button", { name: "Confirm reviewed values & add stock" }).count()) === 0 && (await bar.getByRole("button", { name: "Save draft" }).count()) === 0);
  c.ok('[duplicate] "Open existing invoice" is in the bar and not covered', reachable);
  await open.click().catch(() => {});
  const compare = page.getByRole("region", { name: "Compare with saved invoice" }).or(page.locator('[aria-label="Compare with saved invoice"]'));
  await compare.first().waitFor({ timeout: 30000 }).catch(() => {});
  c.ok('[duplicate] "Open existing invoice" opens the comparison', await compare.first().isVisible().catch(() => false));
  await shot(page, dir, "duplicate-open-existing");
  const after = stockByName(state, [cream]);
  c.ok("[duplicate] stock unchanged", after[cream] === before[cream], { before, after });
  const [{ n }] = sql(state, `SELECT count(*)::int AS n FROM pharmacy_purchase_invoices WHERE "invoiceNumber" = '${run.bill}'`);
  c.ok("[duplicate] still exactly one invoice row", n === 1, n);
  c.ok("[duplicate] no page errors", !log.pageErrors.length, log.pageErrors);
  await context.close();
  return { key: "duplicate", message, failures: log.failures };
}

// What the user sees afterwards: the bills in the register and the stock in the stock list.
async function readback(browser, state, dir, bills, c) {
  const { context, page } = await openPage(browser, state, "pharmacist", { viewport: DESKTOP });
  await page.goto(`${state.base}/dashboard/inventory?area=purchases&view=register`, { waitUntil: "domcontentloaded", timeout: 180000 });
  for (const bill of bills) {
    const row = page.getByRole("button", { name: new RegExp(`Open bill ${bill.replace(/[/]/g, "\\/")}`) }).first();
    await row.waitFor({ timeout: 60000 }).catch(() => {});
    c.ok(`[readback] Purchase bills lists ${bill}`, await row.isVisible().catch(() => false));
  }
  await shot(page, dir, "readback-register");
  await page.goto(`${state.base}/dashboard/inventory?area=stock&view=list&q=${encodeURIComponent("Verify Barrier Cream")}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  const item = page.getByText(cream).first();
  await item.waitFor({ timeout: 60000 }).catch(() => {});
  c.ok(`[readback] Stock list shows "${cream}"`, await item.isVisible().catch(() => false));
  await shot(page, dir, "readback-stock");
  await context.close();
}

(async () => {
  const state = loadState(arg("instance", "default"));
  const only = (arg("only", "new,known,multi,duplicate,readback")).split(",");
  const dir = evidenceDir("manual-bill");
  const c = checker();
  const browser = await chromium.launch();
  const results = [];
  try {
    for (const key of ["new", "known", "multi"].filter((k) => only.includes(k))) {
      console.log(`RUN ${key}: ${RUNS[key].label}`);
      results.push(await receive(browser, state, dir, key, RUNS[key], c).catch(async (e) => {
        c.ok(`[${key}] run completed without a driver error`, false, e.message.split("\n")[0]);
        return { key, error: e.message };
      }));
    }
    const first = results.find((r) => r.key === "new");
    if (only.includes("duplicate") && !(first && first.postMs)) c.ok("[duplicate] skipped: needs a successful 'new' run to duplicate", false);
    else if (only.includes("duplicate")) results.push(await duplicate(browser, state, dir, c).catch((e) => (c.ok("[duplicate] run completed", false, e.message.split("\n")[0]), { key: "duplicate", error: e.message })));
    if (only.includes("readback")) await readback(browser, state, dir, results.filter((r) => r.bill).map((r) => r.bill), c).catch((e) => c.ok("[readback] run completed", false, e.message.split("\n")[0]));
  } finally {
    await browser.close();
  }
  const timing = results.filter((r) => r.postMs).map((r) => `| ${r.key} | ${r.label} | ${r.userSteps} | ${(r.loadMs / 1000).toFixed(1)}s | ${(r.postMs / 1000).toFixed(1)}s |`);
  fs.writeFileSync(path.join(dir, "result.json"), JSON.stringify({ instance: state.name, base: state.base, schema: state.schema, gitHead: state.gitHead, checks: c.checks, results }, null, 2));
  fs.writeFileSync(path.join(dir, "summary.md"), [
    `# Manual bill intake — ${c.failed.length ? `FAIL (${c.failed.length}/${c.checks.length})` : `PASS (${c.checks.length} checks)`}`,
    "", `Stack ${state.base} · schema ${state.schema} · git ${state.gitHead ?? "unknown"}`, "",
    "| run | scenario | user steps | page load | click → Stock added |", "|---|---|---|---|---|", ...timing, "",
    ...c.checks.map((k) => `- ${k.ok ? "PASS" : "**FAIL**"} ${k.label}${k.ok ? "" : ` — \`${JSON.stringify(k.detail)}\``}`), "",
    "Screenshots: " + fs.readdirSync(dir).filter((f) => f.endsWith(".png")).join(", "),
  ].join("\n"));
  console.log(`${c.failed.length ? "FAIL" : "PASS"} ${c.checks.length - c.failed.length}/${c.checks.length} checks · evidence ${dir}`);
  process.exit(c.failed.length ? 1 : 0);
})();
