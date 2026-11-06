const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
const { bootStack } = require("../boot.cjs");
const { seed, derive, istDay, daysBetween } = require("./cr26-seed.cjs");
const crypto = require("node:crypto");

const root = path.resolve(__dirname, "../../..");
const out = path.join(root, "output/stack/cr26");
const FY = { from: "2026-04-01", to: "2027-03-31" };
const REGISTER = "/dashboard/inventory?area=purchases&view=register";
const PAGE_SIZE = 50;

const fmt = (cents) => {
  const rupees = String(Math.floor(cents / 100));
  const head = rupees.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `₹${head ? `${head},` : ""}${rupees.slice(-3)}.${String(cents % 100).padStart(2, "0")}`;
};
const ddmmyyyy = (day) => `${day.slice(8)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;
const chunks = (s) => s.toLowerCase().match(/\d+|\D+/g) || [];
function natural(a, b) {
  const x = chunks(String(a));
  const y = chunks(String(b));
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (/^\d/.test(x[i]) && /^\d/.test(y[i])) {
      const d = BigInt(x[i]) - BigInt(y[i]);
      if (d) return d < 0n ? -1 : 1;
    } else if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  }
  return x.length - y.length;
}
const plain = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

let sink = [];
const watch = (page) => {
  page.on("pageerror", (e) => sink.push({ type: "pageerror", text: e.message.slice(0, 300) }));
  page.on("console", (m) => m.type() === "error" && sink.push({ type: "console", text: m.text().slice(0, 300) }));
};

function makeCheck(t) {
  return {
    check(label, actual, expected) {
      const ok = JSON.stringify(actual) === JSON.stringify(expected);
      t.checks.push({ label, ok, actual: ok ? undefined : actual, expected: ok ? undefined : expected });
    },
    ok(label, cond, detail) {
      t.checks.push({ label, ok: Boolean(cond), actual: cond ? undefined : detail ?? false, expected: cond ? undefined : true });
    },
    note(text) {
      t.notes.push(text);
    },
  };
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const stack = await bootStack({ databaseUrl: process.env.STACK_DATABASE_URL, label: "cr26" });
  fs.mkdirSync(out, { recursive: true });
  console.log(`BOOT base=${stack.base}`);
  const data = await seed(stack.db, stack);
  const { today, distributors } = data;
  const all = data.model;
  assert.equal(today >= "2026-11-01" && today < "2027-03-31", true, `unexpected clock ${today}`);
  assert.equal(new Set(all.map((b) => b.billNo)).size, all.length, "bill numbers unique");
  assert.equal(new Set(all.map((b) => b.entryAt)).size, all.length, "entry instants unique");
  const st = (b) => derive(b, today);
  const inFy = (b) => b.billDay >= FY.from && b.billDay <= FY.to;
  const byEntry = (a, b) => a.entryAt - b.entryAt;
  const rankOf = (list) => new Map([...list].sort(byEntry).map((b, i) => [b.billNo, i + 1]));
  const totalsOf = (list) => {
    const posted = list.filter((b) => b.status === "STOCK_COMMITTED");
    const cancelled = list.filter((b) => b.status === "CANCELLED").length;
    return {
      amount: posted.reduce((s, b) => s + b.net, 0),
      outstanding: posted.reduce((s, b) => s + st(b).outstanding, 0),
      count: posted.length,
      cancelled,
      notPosted: list.length - posted.length - cancelled,
    };
  };
  const noteOf = (t) => {
    const parts = [t.notPosted > 0 && `${t.notPosted} not posted`, t.cancelled > 0 && `${t.cancelled} cancelled`].filter(Boolean);
    return parts.length ? `${parts.join(" and ")} not included` : null;
  };
  const summaryOf = (t) => `Bills ${fmt(t.amount)} · Outstanding ${fmt(t.outstanding)} · ${t.count} ${t.count === 1 ? "bill" : "bills"}`;
  const fyBills = () => all.filter(inFy);
  const stateOf = (b) => st(b).state;
  const countByState = (list) => list.reduce((m, b) => ((m[stateOf(b)] = (m[stateOf(b)] || 0) + 1), m), {});
  console.log(`SEED fy=${fyBills().length} all=${all.length} states=${JSON.stringify(countByState(fyBills()))} totals=${JSON.stringify(totalsOf(fyBills()))}`);

  const readonlyPermissions = JSON.parse((await stack.db.user.findUnique({ where: { id: stack.users.pharmacist.id } })).permissions).filter((p) => p !== "pharmacy:purchase-ledger:write");
  const pharmacistRow = await stack.db.user.findUnique({ where: { id: stack.users.pharmacist.id } });
  await stack.db.user.create({
    data: {
      branchId: stack.branch.id, email: "kiran.more@stack.example.invalid", firstName: "Kiran", lastName: "More", role: "PHARMACIST", password: pharmacistRow.password,
      permissions: JSON.stringify(readonlyPermissions),
    },
  }).then((u) => {
    stack.users.readonly = { id: u.id, email: u.email, password: stack.users.pharmacist.password, role: "PHARMACIST", firstName: "Kiran", lastName: "More" };
  });

  const browser = await chromium.launch();
  const results = [];
  const sessions = new Map();
  const used = new Set(all.filter((b) => b.plan.startsWith("FUTURE_")).map((b) => b.billNo)); // reserved for scenario 16

  async function open(role, size = { width: 1440, height: 900 }, { stubOpen = true } = {}) {
    const context = await browser.newContext({ viewport: size, acceptDownloads: true, ...(sessions.has(role) && { storageState: sessions.get(role) }) });
    if (stubOpen)
      await context.addInitScript(() => {
        window.__opened = [];
        window.open = (url) => {
          window.__opened.push(String(url));
          return null;
        };
      });
    context.on("page", watch);
    const page = await context.newPage();
    page.setDefaultTimeout(60000);
    if (!sessions.has(role)) {
      await stack.login(page, role);
      sessions.set(role, await context.storageState());
    }
    return { page, context };
  }

  async function settle(page) {
    await page.waitForTimeout(550);
    await page.waitForFunction(
      () => {
        const busy = document.querySelector("[aria-busy]");
        return busy && busy.getAttribute("aria-busy") === "false" && (document.body.innerText.includes("Outstanding ₹") || document.body.innerText.includes("No purchase bills") || document.querySelector('[role="alert"]'));
      },
      null,
      { timeout: 120000 },
    );
    await page.waitForTimeout(150);
  }

  const goto = async (page, route = REGISTER) => {
    await page.goto(`${stack.base}${route}`, { waitUntil: "domcontentloaded", timeout: 240000 });
    await page.locator("table").first().waitFor({ timeout: 240000 });
    await settle(page);
  };

  const readRows = (page) =>
    page.locator("table tbody tr").evaluateAll((trs) =>
      trs.map((tr) => {
        const tds = [...tr.querySelectorAll("td")];
        if (tds.length < 8) return { empty: tr.innerText.trim() };
        const norm = (v) => v.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
        const text = (i) => norm(tds[i].innerText);
        const lines = (i) => tds[i].innerText.replace(/\u00a0/g, " ").split("\n").map((v) => v.trim()).filter(Boolean);
        // The Payment cell now holds the badge, the Mark paid / Undo button and sr-only text: read only the badge, without sr-only parts.
        const flex = tds[7].firstElementChild;
        const badge = flex?.firstElementChild?.cloneNode(true);
        if (badge) badge.querySelectorAll(".sr-only").forEach((n) => n.remove());
        const linesOf = (el) => (el.classList.contains("flex-col") ? [...el.children].flatMap(linesOf) : [norm(el.textContent)]);
        const settleButton = tr.querySelector('button[aria-label^="Mark bill"]');
        const undoButton = tr.querySelector('button[aria-label^="Undo payment"]');
        const open = tds[1].querySelector('button[aria-label^="Open bill"]');
        return {
          srNo: Number(text(0)), billNo: open ? open.textContent.trim() : text(1), entry: text(2), billDate: text(3), entryBy: text(4), distributor: lines(5), amount: text(6),
          payment: badge ? linesOf(badge) : [], paymentSr: norm(tds[7].textContent), markPaid: settleButton ? settleButton.getAttribute("aria-label") : null,
          undo: undoButton ? undoButton.getAttribute("aria-label") : null, original: tds[1].querySelectorAll('[aria-label^="Open original bill"]').length, cells: tds.length,
        };
      }),
    );

  async function footer(page) {
    const raw = (await page.locator('[role="status"]', { hasText: "Outstanding ₹" }).first().innerText()).replace(/ /g, " ");
    const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
    const m = lines[0].match(/^Bills (₹[\d,]+\.\d{2}) · Outstanding (₹[\d,]+\.\d{2}) · (\d+) bills?$/);
    const pager = await page.locator('nav[aria-label="Purchase bills pages"] span').first().innerText().catch(() => null);
    return { summary: lines[0], amount: m?.[1], outstanding: m?.[2], count: m && Number(m[3]), note: lines[1] ?? null, pager };
  }

  async function readAll(page) {
    const rows = [...(await readRows(page))];
    const f = await footer(page).catch(() => ({}));
    const total = Number((f.pager || "").match(/of (\d+)/)?.[1] || rows.length);
    if (total > PAGE_SIZE) {
      await page.getByRole("button", { name: "Next page" }).click();
      await settle(page);
      rows.push(...(await readRows(page)));
      await page.getByRole("button", { name: "Previous page" }).click();
      await settle(page);
    }
    return rows;
  }

  const selectByLabel = (page, label) => page.locator("label").filter({ hasText: new RegExp(`^\\s*${label}`) }).locator("select");
  const openMore = async (page) => {
    const btn = page.getByRole("button", { name: /More filters/ });
    if ((await btn.getAttribute("aria-expanded")) !== "true") await btn.click();
  };
  const moreCount = async (page) => Number((await page.getByRole("button", { name: /More filters/ }).innerText()).replace(/\D/g, "") || 0);
  const search = async (page, field, q) => {
    await selectByLabel(page, "Search by").selectOption({ label: field });
    await page.getByRole("searchbox").fill(q);
    await settle(page);
  };
  const clearAll = async (page) => {
    const btn = page.getByRole("button", { name: /Clear all|Clear filters/ }).first();
    if (await btn.count()) {
      await btn.click();
      await settle(page);
    }
  };
  const ledgerOf = (page, gstin) =>
    page.evaluate(async (g) => {
      const r = await fetch(`/api/pharmacy/purchase-ledger/distributors/${g}`, { credentials: "include" });
      const body = await r.json().catch(() => null);
      const rows = body?.invoices ?? [];
      return { status: r.status, outstanding: Math.round(rows.reduce((s, i) => s + Number(i.outstanding || 0), 0) * 100), invoices: rows.length, keys: body ? Object.keys(body) : null };
    }, gstin);
  const paymentsFor = (invoiceId, includeReversed = false) =>
    stack.db.pharmacyPurchasePayment.findMany({
      where: { allocations: { some: { purchaseInvoiceId: invoiceId } }, NOT: { requestKey: { startsWith: "seed-" } }, ...(includeReversed ? {} : { reversedAt: null }) },
      include: { allocations: true },
      orderBy: { createdAt: "asc" },
    });
  async function resync() {
    const allocations = await stack.db.pharmacyPurchasePaymentAllocation.findMany({ where: { payment: { reversedAt: null } }, select: { purchaseInvoiceId: true, amount: true, payment: { select: { paymentDate: true } } } });
    const paid = new Map();
    const scheduled = new Map();
    const scheduledOn = new Map();
    const now = Date.now();
    for (const a of allocations) {
      const cents = Math.round(a.amount * 100);
      if (a.payment.paymentDate.getTime() > now) {
        scheduled.set(a.purchaseInvoiceId, (scheduled.get(a.purchaseInvoiceId) || 0) + cents);
        const day = istDay(a.payment.paymentDate);
        if (!scheduledOn.get(a.purchaseInvoiceId) || day < scheduledOn.get(a.purchaseInvoiceId)) scheduledOn.set(a.purchaseInvoiceId, day);
      } else paid.set(a.purchaseInvoiceId, (paid.get(a.purchaseInvoiceId) || 0) + cents);
    }
    for (const b of all) {
      b.paid = paid.get(b.id) || 0;
      b.sched = scheduled.get(b.id) || 0;
      b.schedDay = scheduledOn.get(b.id) || null;
    }
  }
  const rowFor = (page, billNo) => page.locator("tbody tr").filter({ has: page.getByRole("button", { name: `Open bill ${billNo}`, exact: true }) });
  const undoButton = (page, billNo) => page.getByRole("button", { name: `Undo payment for bill ${billNo}`, exact: true });
  const markPaidButton = (page, billNo) => page.getByRole("button", { name: `Mark bill ${billNo} paid`, exact: true });
  const pick = (states, extra = (b) => st(b).payable > 1) => {
    const bill = fyBills().filter((b) => !used.has(b.billNo) && states.includes(stateOf(b)) && extra(b)).sort(byEntry).at(-1);
    assert(bill, `no seed bill in ${states} left`);
    used.add(bill.billNo);
    return bill;
  };
  const showBill = async (page, billNo) => {
    await selectByLabel(page, "Search by").selectOption({ label: "Bill No" });
    await page.getByRole("searchbox").fill(billNo);
    await settle(page);
  };

  async function scenario(id, name, run) {
    if (process.env.ONLY && !process.env.ONLY.split(",").includes(id)) return;
    sink = [];
    const t = { checks: [], notes: [], shots: [], page: null };
    const h = makeCheck(t);
    const started = Date.now();
    const shot = async (page, slug, full = false) => {
      const file = path.join(out, `${slug}.png`);
      await page.screenshot({ path: file, fullPage: full });
      t.shots.push(path.relative(root, file));
    };
    let error = null;
    const opened = [];
    const ctx = { ...h, shot, track: (o) => (opened.push(o), (t.page = o.page), o) };
    try {
      await run(ctx);
    } catch (e) {
      error = e;
      try {
        if (t.page) await shot(t.page, `${id}-error`);
      } catch {}
    }
    for (const o of opened) await o.context.close().catch(() => {});
    await resync();
    const failed = t.checks.filter((c) => !c.ok);
    const pageErrors = sink.filter((e) => e.type === "pageerror");
    const consoleErrors = sink.filter((e) => e.type === "console");
    const pass = !error && failed.length === 0 && pageErrors.length === 0;
    const detail = [
      error && `EXCEPTION: ${error.message.split("\n")[0]}`,
      ...failed.map((c) => `FAIL ${c.label}: expected ${JSON.stringify(c.expected)} actual ${JSON.stringify(c.actual)}`),
      ...pageErrors.map((e) => `PAGEERROR ${e.text}`),
      ...t.notes.map((n) => `note: ${n}`),
      `${t.checks.length - failed.length}/${t.checks.length} checks passed`,
    ].filter(Boolean).join("\n");
    results.push({
      scenario: `${id} ${name}`, pass, detail, screenshot: t.shots[0] ?? null, screenshots: t.shots,
      consoleErrors: consoleErrors.map((e) => e.text), pageErrors: pageErrors.map((e) => e.text), seconds: Math.round((Date.now() - started) / 1000),
    });
    console.log(`${pass ? "PASS" : "FAIL"} ${id} ${name}\n${detail.split("\n").map((l) => `    ${l}`).join("\n")}`);
  }

  const shortDay = (day) => (day >= FY.from && day <= FY.to ? `${day.slice(8)}/${day.slice(5, 7)}` : ddmmyyyy(day));
  const badgeLines = (b) => {
    const s = st(b);
    if (s.scheduledOnly) return [`Scheduled ${shortDay(s.schedDay)}`, ...(s.state === "OVERDUE" ? [`was due ${shortDay(b.dueDay)}`] : [])];
    const scheduled = s.sched > 0 ? [`${fmt(s.sched)} scheduled ${shortDay(s.schedDay)}`] : [];
    switch (s.state) {
      case "PAID": return ["Paid"];
      case "DUE": return ["Due", ...scheduled];
      case "OVERDUE": return [`Overdue · ${s.lateDays}d`, ...(s.partlyPaid ? [`${fmt(s.settled)} paid`] : []), ...scheduled];
      case "PARTIAL": return [`${fmt(s.outstanding)} due`, `${fmt(s.settled)} paid`, ...scheduled];
      case "CANCELLED": return ["Cancelled"];
      default: return null;
    }
  };
  const settleable = (b) => ["DUE", "OVERDUE", "PARTIAL"].includes(stateOf(b)) && st(b).payable > 1;
  const NOT_POSTED_LABEL = { DRAFT: "Draft", OCR_REVIEW_REQUIRED: "OCR review required", RECONCILIATION_FAILED: "Reconciliation failed", REVIEWED: "Reviewed" };

  async function goRegisterFromMenu(page) {
    await page.goto(`${stack.base}/dashboard/inventory`, { waitUntil: "domcontentloaded", timeout: 240000 });
    // CR-26 fix round: the Purchases area opens on Purchase bills by itself (it is the first menu item), so there is no second click.
    const areas = page.getByRole("navigation", { name: "Inventory areas" });
    for (let attempt = 0; attempt < 8 && !(await page.locator("table").first().isVisible().catch(() => false)); attempt++) {
      await areas.getByRole("button", { name: "Purchases", exact: true }).click();
      await page.locator("table").first().waitFor({ timeout: 6000 }).catch(() => {});
    }
    await page.locator("table").first().waitFor({ timeout: 240000 });
    await settle(page);
  }

  await scenario("01", "default-fy-rows-footer", async (s) => {
    const { page } = s.track(await open("pharmacist"));
    await goRegisterFromMenu(page);
    s.ok("URL is purchases register", /area=purchases/.test(page.url()) && /view=register/.test(page.url()), page.url());
    s.check("single 'Purchase bills' landmark/heading (no duplicate h2)", [await page.getByRole("heading", { name: "Purchase bills" }).count(), await page.getByRole("region", { name: "Purchase bills" }).count()], [0, 1]);
    const heads = await page.locator("thead th").evaluateAll((ths) =>
      ths.map((th) => {
        const c = th.cloneNode(true);
        const sr = [...c.querySelectorAll(".sr-only")].map((n) => n.textContent.trim());
        c.querySelectorAll(".sr-only").forEach((n) => n.remove());
        return { text: c.textContent.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim(), sr };
      }),
    );
    // ADAPT: the Settle column is gone (Mark paid lives in the Payment cell), so 8 headers; the Payment header carries an sr-only sort hint.
    s.check("column headers (visible text)", heads.map((h) => h.text), ["Sr No", "Bill No", "Entry Date", "Bill Date", "Entry By", "Distributor", "Bill Amount", "Payment"]);
    s.check("Payment header sr-only hint", heads[7].sr, ["(by amount outstanding)"]);
    s.check("default period preset", await page.locator('select[aria-label="Period"]').evaluate((el) => el.selectedOptions[0].textContent), "FY 2026-27");
    s.check("default range shown", await page.getByRole("button", { name: /^Change dates/ }).getAttribute("aria-label"), "Change dates, 01/04/2026 to 31/03/2027");
    const fy = fyBills();
    const ranks = rankOf(fy);
    const rows = await readAll(page);
    s.check("row count (all pages)", rows.length, fy.length);
    s.check("previous-FY bills absent", rows.some((r) => ["SLV/2025/48", "SLV/2026/0", "NVJ/2025/77"].includes(r.billNo)), false);
    s.ok("boundary bill dated 01/04 00:15 IST is in range", rows.some((r) => r.billNo === "APX/2026/0"));
    s.check("page 1 order is entry date desc", rows.slice(0, PAGE_SIZE).map((r) => r.billNo), [...fy].sort((a, b) => b.entryAt - a.entryAt).slice(0, PAGE_SIZE).map((b) => b.billNo));
    const pairs = (items) => items.sort((x, y) => plain(x[0], y[0]));
    s.check("Sr No = entry order per bill", pairs(rows.map((r) => [r.billNo, r.srNo])), pairs(fy.map((b) => [b.billNo, ranks.get(b.billNo)])));
    s.check("Amount cells", pairs(rows.map((r) => [r.billNo, r.amount])), pairs(fy.map((b) => [b.billNo, fmt(b.net)])));
    const foot = await footer(page);
    const tot = totalsOf(fy);
    s.check("footer summary (POSTED bills only)", foot.summary, summaryOf(tot));
    s.check("footer excluded note", foot.note, noteOf(tot));
    s.check("pager says rows", foot.pager, `1–${PAGE_SIZE} of ${fy.length} rows`);
    s.note(`footer counts ${foot.count} posted bills; pager counts ${fy.length} rows (posted + ${tot.notPosted} not posted + ${tot.cancelled} cancelled) - distinct units now, explained by the note`);
    const ledgerLink = page.getByRole("button", { name: /open Payments & dues/ });
    s.check("footer Outstanding links to Payments & dues", [await ledgerLink.count(), (await ledgerLink.getAttribute("aria-label").catch(() => null)) || null], [1, `Outstanding ${fmt(tot.outstanding)}, open Payments & dues`]);
    await s.shot(page, "01-default-1440");
  });

  await scenario("02", "sorting", async (s) => {
    const { page } = s.track(await open("pharmacist"));
    await goto(page);
    const fy = fyBills();
    const rank = rankOf(fy);
    const heads = [
      { label: "Sr No", th: /^\s*Sr No/, cmp: (a, b) => rank.get(a.billNo) - rank.get(b.billNo) },
      { label: "Bill No", th: /^\s*Bill No/, cmp: (a, b) => natural(a.billNo, b.billNo) },
      { label: "Entry Date", th: /^\s*Entry Date/, cmp: (a, b) => a.entryAt - b.entryAt },
      { label: "Bill Date", th: /^\s*Bill Date/, cmp: (a, b) => plain(a.billDay, b.billDay) },
      { label: "Distributor", th: /^\s*Distributor/, cmp: (a, b) => plain(a.distributor.toLowerCase(), b.distributor.toLowerCase()) },
      { label: "Bill Amount", th: /^\s*Bill Amount/, cmp: (a, b) => a.net - b.net },
      { label: "Payment", th: /^\s*Payment/, cmp: (a, b) => st(a).outstanding - st(b).outstanding },
    ];
    const expectedOrder = (cmp, dir, tieFlips) =>
      [...fy].sort((a, b) => dir * cmp(a, b) || (tieFlips ? dir : 1) * (rank.get(a.billNo) - rank.get(b.billNo))).map((b) => b.billNo);
    for (const head of heads) {
      const th = page.locator("thead th", { hasText: head.th });
      const seen = {};
      for (let click = 0; click < 2; click++) {
        await th.locator("button").click();
        await settle(page);
        const attr = await th.getAttribute("aria-sort");
        const dir = attr === "ascending" ? 1 : attr === "descending" ? -1 : 0;
        s.ok(`${head.label}: aria-sort set after click ${click + 1}`, dir !== 0, attr);
        seen[attr] = true;
        const others = await page.locator("thead th[aria-sort]").evaluateAll((els) => els.filter((e) => e.getAttribute("aria-sort") !== "none").length);
        s.check(`${head.label}: only one header active`, others, 1);
        const rows = await readAll(page);
        const got = rows.map((r) => r.billNo);
        const flipped = expectedOrder(head.cmp, dir, true);
        const stable = expectedOrder(head.cmp, dir, false);
        const ok = JSON.stringify(got) === JSON.stringify(flipped) || JSON.stringify(got) === JSON.stringify(stable);
        s.ok(`${head.label} ${attr}: row order`, ok, { got: got.slice(0, 8), flipped: flipped.slice(0, 8), stable: stable.slice(0, 8) });
        if (ok && JSON.stringify(flipped) !== JSON.stringify(stable)) s.note(`${head.label} ${attr}: ties ordered ${JSON.stringify(got) === JSON.stringify(flipped) ? "by Sr No in the sort direction" : "by Sr No ascending"}`);
        if (head.label === "Bill No" && dir === 1) {
          const slv = got.filter((n) => /^SLV\/2026\/(9|10)$/.test(n));
          s.check("SLV/2026/9 sorts before SLV/2026/10 (numeric-aware)", slv, ["SLV/2026/9", "SLV/2026/10"]);
        }
        if (click === 0) s.note(`${head.label}: first click sorts ${attr}`);
      }
      s.check(`${head.label}: both directions seen`, Object.keys(seen).sort(), ["ascending", "descending"]);
      if (head.label === "Bill No") await s.shot(page, "02-sort-billno");
    }
    await s.shot(page, "02-sort-payment");
  });

  await scenario("03", "search-and-filters", async (s) => {
    const { page } = s.track(await open("pharmacist"));
    await goto(page);
    const fy = fyBills();
    const nvj = distributors.find((d) => d.code === "NVJ");
    const check = async (label, list) => {
      const rows = await readAll(page);
      const rank = rankOf(list);
      s.check(`${label}: bills`, rows.map((r) => r.billNo).sort(), list.map((b) => b.billNo).sort());
      const pairs = (items) => items.sort((x, y) => plain(x[0], y[0]));
      s.check(`${label}: Sr No renumbered within the filtered set`, pairs(rows.map((r) => [r.billNo, r.srNo])), pairs(list.map((b) => [b.billNo, rank.get(b.billNo)])));
      if (list.length) {
        const tot = totalsOf(list);
        const f = await footer(page);
        s.check(`${label}: footer`, f.summary, summaryOf(tot));
        s.check(`${label}: excluded note`, f.note, noteOf(tot));
      }
    };
    await search(page, "Distributor", "Navjeevan");
    await check("distributor name", fy.filter((b) => b.gstin === nvj.gstin));
    await s.shot(page, "03-search-distributor");
    await search(page, "Distributor", "27aaecn9087");
    await check("distributor GSTIN (lower-case partial)", fy.filter((b) => b.gstin === nvj.gstin));
    await search(page, "Bill No", "slv/2026/1");
    await check("bill no substring", fy.filter((b) => b.billNo.toLowerCase().includes("slv/2026/1")));
    await page.getByRole("searchbox").fill("");
    await settle(page);
    await clearAll(page);

    await openMore(page);
    await selectByLabel(page, "Distributor").selectOption({ value: nvj.gstin });
    await settle(page);
    s.check("More filters count after distributor", await moreCount(page), 1);
    await check("More filters distributor exact", fy.filter((b) => b.gstin === nvj.gstin));
    const options = await selectByLabel(page, "Distributor").locator("option").allInnerTexts();
    s.check("distributor options", options, ["All", ...[...distributors].map((d) => d.name).sort((a, b) => a.localeCompare(b, "en-IN"))]);
    await selectByLabel(page, "Source").selectOption({ label: "Scanned" });
    await settle(page);
    s.check("More filters count with source", await moreCount(page), 2);
    await check("distributor + source Scanned", fy.filter((b) => b.gstin === nvj.gstin && b.source === "OCR"));
    await s.shot(page, "03-more-filters");
    await clearAll(page);
    s.check("Clear all resets More count", await moreCount(page), 0);
    await check("after Clear all", fy);

    const payment = [
      ["Outstanding", (b) => ["DUE", "OVERDUE", "PARTIAL"].includes(stateOf(b))],
      ["Due", (b) => stateOf(b) === "DUE"],
      ["Overdue", (b) => stateOf(b) === "OVERDUE"],
      ["Part paid", (b) => stateOf(b) === "PARTIAL"],  // ADAPT: not-yet-late part-paid bills only; late part-paid bills are Overdue now
      ["Paid", (b) => stateOf(b) === "PAID"],
      ["Not posted", (b) => stateOf(b) === "NOT_POSTED"],
    ];
    for (const [label, pred] of payment) {
      await selectByLabel(page, "Payment status").selectOption({ label });
      await settle(page);
      const list = fy.filter(pred);
      s.ok(`${label}: seed has bills`, list.length > 0, list.length);
      await check(`Payment status ${label}`, list);
      if (label === "Overdue") await s.shot(page, "03-filter-overdue");
    }
    await clearAll(page);
    s.check("payment status back to All", await selectByLabel(page, "Payment status").inputValue(), "");
    await check("final Clear all", fy);
  });

  await scenario("04", "badges", async (s) => {
    const { page } = s.track(await open("pharmacist"));
    await goto(page);
    const fy = fyBills();
    const rows = await readAll(page);
    const by = Object.fromEntries(rows.map((r) => [r.billNo, r]));
    const states = countByState(fy);
    s.note(`seed states in view: ${JSON.stringify(states)}`);
    for (const state of ["PAID", "DUE", "OVERDUE", "PARTIAL", "NOT_POSTED", "CANCELLED"]) s.ok(`seed covers ${state}`, states[state] > 0, states);
    s.ok("seed has a late part-paid bill (now OVERDUE) and a not-yet-late PARTIAL", fy.some((b) => stateOf(b) === "OVERDUE" && st(b).partlyPaid) && fy.some((b) => stateOf(b) === "PARTIAL"));
    s.ok("seed has a scheduled-only bill and a part-scheduled bill", fy.some((b) => st(b).scheduledOnly) && fy.some((b) => st(b).sched > 0 && !st(b).scheduledOnly));
    s.ok("seed has a bill due today (not overdue)", fy.some((b) => b.dueDay === today && stateOf(b) === "DUE"));
    const wrong = [];
    for (const b of fy) {
      const expected = badgeLines(b);
      const row = by[b.billNo];
      if (expected) {
        if (JSON.stringify(row.payment) !== JSON.stringify(expected)) wrong.push({ bill: b.billNo, expected, actual: row.payment });
      } else if (JSON.stringify(row.payment) !== JSON.stringify(["Not posted"])) wrong.push({ bill: b.billNo, expected: "Not posted", actual: row.payment });
    }
    s.check("every badge matches the derived state", wrong, []);
    const overpaid = all.find((b) => b.paid > b.net);
    s.check("over-allocated bill floors outstanding at zero (Paid)", by[overpaid.billNo]?.payment, ["Paid"]);
    const reversedOne = all.find((b) => b.plan === "UNPAID_REVERSED" && b.status === "STOCK_COMMITTED");
    s.ok("bill whose only payment was reversed is not Paid", by[reversedOne.billNo] && by[reversedOne.billNo].payment[0] !== "Paid", by[reversedOne.billNo]?.payment);
    const srWrong = [];
    for (const b of fy.filter((x) => stateOf(x) === "NOT_POSTED")) {
      const sr = by[b.billNo].paymentSr;
      if (!sr.includes(`${NOT_POSTED_LABEL[b.status]}. Post stock before paying`)) srWrong.push({ bill: b.billNo, status: b.status, sr });
    }
    s.check("every Not posted badge names its distinct review state for screen readers (INV-18.2)", srWrong, []);
    const np = fy.filter((b) => stateOf(b) === "NOT_POSTED").sort((a, b) => b.entryAt - a.entryAt).find((b) => rows.slice(0, PAGE_SIZE).includes(by[b.billNo]));
    const badge = rowFor(page, np.billNo).locator("td").nth(7).locator("span").filter({ hasText: "Not posted" }).first();
    await badge.hover();
    const tip = page.getByRole("tooltip").first();
    await tip.waitFor({ timeout: 8000 });
    const tipText = (await tip.innerText()).replace(/\s+/g, " ").trim();
    s.check("Not posted hover reason", tipText, `${NOT_POSTED_LABEL[np.status]} · Post stock before paying`);
    await s.shot(page, "04-not-posted-hover");
    const cancelled = fy.find((b) => stateOf(b) === "CANCELLED");
    const decoration = await rowFor(page, cancelled.billNo).locator("td").nth(7).locator("span").first().evaluate((el) => getComputedStyle(el).textDecorationLine);
    s.check("Cancelled badge is struck through", decoration, "line-through");
    const amountDecoration = await rowFor(page, cancelled.billNo).locator("td").nth(6).locator("span").first().evaluate((el) => getComputedStyle(el).textDecorationLine);
    s.check("Cancelled amount is struck through", amountDecoration, "line-through");
    const entryBy = Object.fromEntries(rows.map((r) => [r.billNo, r.entryBy]));
    s.check("Entry By names (null/non-user creators show a dash)", Object.fromEntries(fy.map((b) => [b.billNo, entryBy[b.billNo]])), Object.fromEntries(fy.map((b) => [b.billNo, b.entryBy ? `${b.entryBy.split(" ")[0]} ${b.entryBy.split(" ").at(-1)[0]}.` : "—"])));
    const overdueRow = fy.find((b) => stateOf(b) === "OVERDUE" && st(b).partlyPaid);
    s.note(`overdue + part paid row reads ${JSON.stringify(by[overdueRow.billNo].payment)} (lateness first, part payment as secondary text)`);
    await s.shot(page, "04-badges");
  });

  const dialogOf = (page) => page.getByRole("dialog");
  const readDialog = async (page) => {
    const d = dialogOf(page);
    return {
      title: (await d.getByRole("heading").first().innerText().catch(() => "")).replace(/\s+/g, " ").trim(),
      text: (await d.innerText()).replace(/\s+/g, " ").trim(),
      mode: await d.locator("select").inputValue(),
      date: await d.locator('input[placeholder="dd/mm/yyyy"]').inputValue(),
      button: (await d.getByRole("button", { name: /^(Record payment|Recording)/ }).innerText()).trim(),
    };
  };
  async function pay(page, bill, { mode, reference, submit = true } = {}) {
    await showBill(page, bill.billNo);
    await markPaidButton(page, bill.billNo).click();
    const d = dialogOf(page);
    await d.waitFor();
    const defaultMode = await d.locator("select").inputValue();
    if (mode) await d.locator("select").selectOption(mode);
    if (reference) await d.getByLabel(/Cheque \/ UTR no\./).fill(reference);
    const info = { ...(await readDialog(page)), defaultMode };
    if (submit) await d.getByRole("button", { name: /^Record payment/ }).click();
    return info;
  }

  await scenario("05", "mark-paid-due-bill", async (s) => {
    const { page } = s.track(await open("pharmacist"));
    await goto(page);
    const bill = pick(["DUE"]);
    const out = st(bill).payable;
    const before = await ledgerOf(page, bill.gstin);
    s.check("ledger API reachable", before.status, 200);
    const expectedLedger = all.filter((b) => b.gstin === bill.gstin && b.status === "STOCK_COMMITTED").reduce((sum, b) => sum + st(b).outstanding, 0);
    s.check("ledger outstanding before = seed", before.outstanding, expectedLedger);
    await showBill(page, bill.billNo);
    const footBefore = await footer(page);
    const info = await pay(page, bill, { mode: "UPI", reference: "UTR123", submit: false });
    s.check("popover title", info.title, `Pay ${fmt(out)} to ${bill.distributor}`);
    s.ok("popover names the bill", info.text.includes(`For bill ${bill.billNo}`), info.text);
    s.check("popover date defaults to today", info.date, ddmmyyyy(today));
    s.check("popover button", info.button, `Record payment ${fmt(out)}`);
    s.note(`default mode with empty storage: ${info.defaultMode}`);
    await s.shot(page, "05-popover");
    await dialogOf(page).getByRole("button", { name: /^Record payment/ }).click();
    // ADAPT: the "Payment recorded" toast is gone while the row stays visible; the row's own inline "Undo" is the confirmation.
    await undoButton(page, bill.billNo).waitFor({ timeout: 20000 });
    await settle(page);
    await s.shot(page, "05-inline-undo");
    s.check("no 'Payment recorded' toast covers the header while the row is visible", await page.getByText("Payment recorded", { exact: true }).count(), 0);
    const row = (await readRows(page)).find((r) => r.billNo === bill.billNo);
    s.check("row is Paid", row.payment, ["Paid"]);
    s.check("Mark paid gone from the row", row.markPaid, null);
    s.check("row shows inline Undo", row.undo, `Undo payment for bill ${bill.billNo}`);
    s.check("focus moved off the removed Mark paid button (next Mark paid or the Bill No link)", await page.evaluate(() => /^(Mark bill .* paid|Open bill .*)$/.test(document.activeElement?.getAttribute("aria-label") || "")), true);
    const payments = await paymentsFor(bill.id);
    s.check("exactly one payment row", payments.length, 1);
    const p = payments[0];
    s.check("payment amount/mode/reference", [Math.round(p.amount * 100), p.mode, p.referenceNo, p.reversedAt], [out, "UPI", "UTR123", null]);
    s.check("payment date is today (IST)", istDay(p.paymentDate), today);
    s.check("allocated to that bill only", p.allocations.map((a) => [a.purchaseInvoiceId, Math.round(a.amount * 100)]), [[bill.id, out]]);
    s.check("paid by pharmacist", p.paidBy, stack.users.pharmacist.id);
    const after = await ledgerOf(page, bill.gstin);
    s.check("ledger outstanding dropped by the payment", [before.outstanding - after.outstanding, after.outstanding], [out, expectedLedger - out]);
    bill.paid += out;
    const footAfter = await footer(page);
    const toCents = (text) => Math.round(Number(text.replace(/[₹,]/g, "")) * 100);
    s.check("footer outstanding dropped by the payment", toCents(footBefore.outstanding) - toCents(footAfter.outstanding), out);
    s.check("exactly one inline Undo is offered", await page.getByRole("button", { name: /^Undo payment for bill/ }).count(), 1);
  });

  await scenario("06", "undo-inline", async (s) => {
    const { page } = s.track(await open("pharmacist"));
    await goto(page);
    const bill = pick(["DUE"]);
    const out = st(bill).payable;
    const before = await ledgerOf(page, bill.gstin);
    await showBill(page, bill.billNo);
    const footBefore = await footer(page);
    await pay(page, bill, { mode: "NEFT", reference: "UNDO-1" });
    await undoButton(page, bill.billNo).waitFor({ timeout: 20000 });
    await settle(page);
    s.check("row Paid after payment", (await readRows(page)).find((r) => r.billNo === bill.billNo).payment, ["Paid"]);
    const mid = await ledgerOf(page, bill.gstin);
    s.check("ledger dropped", before.outstanding - mid.outstanding, out);
    await undoButton(page, bill.billNo).click();
    await page.getByText("Payment undone", { exact: true }).waitFor({ timeout: 20000 });
    await page.waitForTimeout(900);
    await s.shot(page, "06-undone-toast");
    await settle(page);
    const payments = await paymentsFor(bill.id, true);
    s.check("payment kept but reversed", [payments.length, payments[0]?.reversedAt !== null, payments[0]?.reversalReason], [1, true, "Undone from purchase list"]);
    const row = (await readRows(page)).find((r) => r.billNo === bill.billNo);
    s.check("row back to Due with Mark paid", [row.payment, row.markPaid], [badgeLines(bill), `Mark bill ${bill.billNo} paid`]);
    s.check("inline Undo gone after undoing", row.undo, null);
    s.check("focus returns to the row's Mark paid button", await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), `Mark bill ${bill.billNo} paid`);
    const after = await ledgerOf(page, bill.gstin);
    s.check("ledger outstanding restored", after.outstanding, before.outstanding);
    const footAfter = await footer(page);
    s.check("footer restored", footAfter.summary, footBefore.summary);
    used.delete(bill.billNo);
  });

  await scenario("07", "idempotency", async (s) => {
    const { page } = s.track(await open("pharmacist"));
    await goto(page);
    const first = pick(["DUE", "OVERDUE"]);
    const firstOut = st(first).payable;
    const requests = [];
    page.on("request", (r) => r.method() === "POST" && /purchase-ledger\/payments$/.test(r.url()) && requests.push(r.postDataJSON?.()?.requestKey));
    await showBill(page, first.billNo);
    await markPaidButton(page, first.billNo).click();
    await dialogOf(page).getByRole("button", { name: /^Record payment/ }).dblclick();
    await undoButton(page, first.billNo).waitFor({ timeout: 20000 });
    await settle(page);
    const rows1 = await paymentsFor(first.id);
    s.check("double-click: one payment row", rows1.length, 1);
    s.ok("double-click: at most one POST left the browser", requests.length <= 1, requests);
    first.paid += firstOut;

    const second = pick(["DUE", "OVERDUE"]);
    requests.length = 0;
    let intercepted = 0;
    await page.route("**/api/pharmacy/purchase-ledger/payments", async (route) => {
      if (route.request().method() === "POST" && intercepted === 0) {
        intercepted++;
        await route.fetch();
        await route.abort("failed");
      } else await route.continue();
    });
    await showBill(page, second.billNo);
    const out = st(second).payable;
    await markPaidButton(page, second.billNo).click();
    const d = dialogOf(page);
    await d.getByRole("button", { name: /^Record payment/ }).click();
    // ADAPT: success is now the row's inline Undo, not a toast naming the bill.
    const secondToast = undoButton(page, second.billNo);
    const outcome = await Promise.race([
      d.getByRole("alert").waitFor({ timeout: 25000 }).then(() => "inline-error"),
      secondToast.waitFor({ timeout: 25000 }).then(() => "auto-retried"),
    ]);
    s.note(`after the first response was dropped the UI: ${outcome}; POSTs sent: ${requests.length}; distinct requestKeys: ${new Set(requests).size}`);
    s.check("server recorded the payment the browser never saw", (await paymentsFor(second.id)).length, 1);
    if (outcome === "inline-error") {
      await s.shot(page, "07-retry-error");
      await d.getByRole("button", { name: /^Record payment/ }).click();
    }
    await secondToast.waitFor({ timeout: 20000 });
    s.check("all POSTs for this bill reused one requestKey", new Set(requests).size, 1);
    await settle(page);
    const rows2 = await paymentsFor(second.id);
    s.check("retry with same key: still exactly one payment", [rows2.length, Math.round(rows2[0].amount * 100)], [1, out]);
    s.check("retry row is Paid", (await readRows(page)).find((r) => r.billNo === second.billNo).payment, ["Paid"]);
    second.paid += out;
  });

  await scenario("08", "mode-memory", async (s) => {
    const { page } = s.track(await open("pharmacist"));
    await goto(page);
    const a = pick(["DUE", "OVERDUE", "PARTIAL"]);
    const b = pick(["DUE", "OVERDUE", "PARTIAL"]);
    const c = pick(["DUE", "OVERDUE", "PARTIAL"]);
    const first = await pay(page, a, { mode: "UPI" });
    s.note(`default mode with empty storage: ${first.defaultMode}`);
    await undoButton(page, a.billNo).waitFor({ timeout: 20000 });
    await settle(page);
    a.paid += st(a).payable;
    await showBill(page, b.billNo);
    await markPaidButton(page, b.billNo).click();
    s.check("second bill defaults to UPI", (await readDialog(page)).mode, "UPI");
    await dialogOf(page).locator("select").selectOption("CHEQUE");
    await dialogOf(page).getByRole("button", { name: "Cancel" }).click();
    await markPaidButton(page, b.billNo).click();
    s.check("cancelled change is not remembered", (await readDialog(page)).mode, "UPI");
    await s.shot(page, "08-remembered-mode");
    await dialogOf(page).getByRole("button", { name: "Cancel" }).click();
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("table").first().waitFor();
    await settle(page);
    await showBill(page, c.billNo);
    await markPaidButton(page, c.billNo).click();
    s.check("remembered after reload", (await readDialog(page)).mode, "UPI");
    await dialogOf(page).getByRole("button", { name: "Cancel" }).click();
    s.check("focus returns to the Mark paid button", await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), `Mark bill ${c.billNo} paid`);
    used.delete(b.billNo);
    used.delete(c.billNo);
  });

  await scenario("09", "roles-and-no-settle-states", async (s) => {
    const { page } = s.track(await open("pharmacist"));
    await goto(page);
    const fy = fyBills();
    const rows = await readAll(page);
    const by = Object.fromEntries(rows.map((r) => [r.billNo, r]));
    for (const state of ["NOT_POSTED", "CANCELLED", "PAID"]) {
      const offenders = fy.filter((b) => stateOf(b) === state && by[b.billNo].markPaid).map((b) => b.billNo);
      s.check(`${state}: no Mark paid`, offenders, []);
    }
    const missing = fy.filter((b) => settleable(b) && !by[b.billNo].markPaid).map((b) => b.billNo);
    s.check("Due/Overdue/Part paid all offer Mark paid", missing, []);
    s.check("Mark paid count = settleable bills", rows.filter((r) => r.markPaid).length, fy.filter(settleable).length);
    await s.shot(page, "09-pharmacist");

    const readonly = s.track(await open("readonly"));
    await goto(readonly.page);
    const rr = await readAll(readonly.page);
    s.ok("pharmacist without ledger write: register loads with badges", rr.length === fy.length && rr.every((r) => r.payment.length > 0), rr.length);
    s.check("pharmacist without ledger write: no Mark paid", rr.filter((r) => r.markPaid).length, 0);
    s.check("pharmacist without ledger write: same 8 columns (no Settle column in either role)", await readonly.page.locator("thead th").count(), 8);
    await s.shot(readonly.page, "09-no-ledger-write");

    const rec = s.track(await open("reception"));
    await rec.page.goto(`${stack.base}/dashboard`, { waitUntil: "domcontentloaded", timeout: 240000 });
    await rec.page.getByText("Sunita", { exact: false }).first().waitFor({ timeout: 120000 });
    s.note(`reception sidebar has Inventory link: ${(await rec.page.locator("nav, aside").getByRole("link", { name: /Inventory/ }).count()) > 0}`);
    await rec.page.goto(`${stack.base}${REGISTER}`, { waitUntil: "domcontentloaded", timeout: 240000 });
    await rec.page.waitForTimeout(6000);
    const api = await rec.page.evaluate(async () => {
      const get = async (u) => {
        const r = await fetch(u, { credentials: "include" });
        return r.status;
      };
      return { register: await get("/api/pharmacy/purchase-register?from=2026-04-01&to=2027-03-31&sortBy=entryAt&sortDir=desc&page=1&limit=50"), capabilities: await get("/api/inventory/workspace/capabilities"), ledger: await get("/api/pharmacy/purchase-ledger/distributors") };
    });
    const tables = await rec.page.locator("table").count();
    const body = (await rec.page.locator("body").innerText()).replace(/\s+/g, " ");
    s.note(`reception at ${REGISTER}: url=${rec.page.url()} tables=${tables} api=${JSON.stringify(api)} body="${body.slice(0, 220)}"`);
    s.check("reception cannot write the ledger from the register", await rec.page.locator('button[aria-label^="Mark bill"]').count(), 0);
    const denied = (await rec.page.locator('[role="status"]').allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);
    s.check("reception register API is forbidden (no purchase read permission)", api.register, 403);
    // ADAPT: the broken "Could not load purchase bills / Forbidden resource" alert became an access message (D2); scenario 18 asserts it in detail.
    s.ok("reception UI shows the access message", denied.some((t) => /You don.t have access to purchase bills/.test(t)), denied);
    await s.shot(rec.page, "09-reception");

    for (const role of ["doctor", "owner"]) {
      const { page: p } = s.track(await open(role));
      await goto(p);
      const bill = pick(["DUE", "OVERDUE", "PARTIAL"], settleable);
      const out = st(bill).payable;
      await showBill(p, bill.billNo);
      s.check(`${role}: Mark paid offered`, await markPaidButton(p, bill.billNo).count(), 1);
      await markPaidButton(p, bill.billNo).click();
      await dialogOf(p).getByRole("button", { name: /^Record payment/ }).click();
      const result = await Promise.race([
        undoButton(p, bill.billNo).waitFor({ timeout: 20000 }).then(() => "recorded"),
        dialogOf(p).getByRole("alert").waitFor({ timeout: 20000 }).then(async () => `error: ${(await dialogOf(p).getByRole("alert").innerText()).trim()}`),
      ]).catch((e) => `timeout ${e.message.split("\n")[0]}`);
      s.check(`${role}: payment goes through`, result, "recorded");
      await s.shot(p, `09-${role}-settle`);
      const payments = await paymentsFor(bill.id);
      if (result === "recorded") {
        bill.paid += out;
        s.check(`${role}: payment row`, [payments.length, Math.round(payments[0].amount * 100), payments[0].paidBy], [1, out, stack.users[role].id]);
      } else used.delete(bill.billNo);
    }
  });

  await scenario("10", "links-new", async (s) => {
    const { page } = s.track(await open("pharmacist"));
    await goto(page);
    const bill = fyBills().find((b) => b.billNo === "NVJ/2026/4") || fyBills()[0];
    await showBill(page, bill.billNo);
    await page.getByRole("button", { name: `Open bill ${bill.billNo}`, exact: true }).click();
    await page.waitForURL(/invoice=/, { timeout: 60000 });
    const url = new URL(page.url());
    s.check("Bill No link: area/view/invoice", [url.searchParams.get("area"), url.searchParams.get("view"), url.searchParams.get("invoice")], ["purchases", "intake", bill.id]);
    s.ok("return param remembers the register", (url.searchParams.get("return") || "").includes("view=register"), url.search);
    await page.waitForFunction((n) => document.body.innerText.includes(n) || [...document.querySelectorAll("input")].some((i) => i.value === n), bill.billNo, { timeout: 60000 }).then(
      () => s.ok("intake shows the opened bill number", true),
      () => s.ok("intake shows the opened bill number", false, "bill number not found on the page"),
    );
    await s.shot(page, "10-bill-opened");

    await goto(page);
    await page.getByRole("button", { name: /New purchase/ }).click();
    await page.waitForURL(/new=/, { timeout: 60000 });
    const nu = new URL(page.url());
    s.check("+ New purchase: area/view and no invoice", [nu.searchParams.get("area"), nu.searchParams.get("view"), nu.searchParams.get("invoice")], ["purchases", "intake", null]);

    await goto(page);
    await page.getByRole("button", { name: "More", exact: true }).click();
    await s.shot(page, "10-more-menu");
    s.ok("More menu has Export to Excel, Payments & dues, Suppliers", (await page.getByRole("menuitem").allInnerTexts()).map((t) => t.trim()).join("|") === "Export to Excel|Payments & dues|Suppliers", await page.getByRole("menuitem").allInnerTexts());
    await page.getByRole("menuitem", { name: /Payments & dues/ }).click();
    await page.waitForURL(/view=ledger/, { timeout: 60000 });
    s.ok("More > Payments & dues opens the ledger view", true);
    await goto(page);
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("menuitem", { name: /Suppliers/ }).click();
    await page.waitForURL(/view=suppliers/, { timeout: 60000 });
    s.ok("More > Suppliers opens the suppliers view", true);

    // Footer "Outstanding" link carries the distributor filter into Payments & dues (U13).
    const nvj = distributors.find((d) => d.code === "NVJ");
    await goto(page, `${REGISTER}&gstin=${nvj.gstin}`);
    await page.getByRole("button", { name: /open Payments & dues/ }).click();
    await page.waitForURL(/view=ledger/, { timeout: 60000 });
    s.check("footer Outstanding link keeps the distributor (gstin)", new URL(page.url()).searchParams.get("gstin"), nvj.gstin);
  });

  const layoutMetrics = (page) =>
    page.evaluate(() => {
      const vw = window.innerWidth;
      const box = (el) => {
        const r = el.getBoundingClientRect();
        return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) };
      };
      const heads = [...document.querySelectorAll("thead th")].map((th) => {
        const c = th.cloneNode(true);
        c.querySelectorAll(".sr-only").forEach((n) => n.remove());
        return { name: c.textContent.replace(/\s+/g, " ").trim(), ...box(th) };
      });
      const payCells = [...document.querySelectorAll("tbody tr")].map((tr) => {
        const td = tr.querySelector("td:nth-child(8)");
        const flex = td.firstElementChild;
        return { bill: tr.querySelector("td:nth-child(2) button")?.textContent.trim(), right: Math.round(td.getBoundingClientRect().right), content: Math.round(flex.scrollWidth), text: flex.firstElementChild?.innerText.replace(/\s+/g, " ").trim() };
      });
      const buttons = [...document.querySelectorAll('button[aria-label^="Mark bill"]')].map(box);
      const container = document.querySelector("table").parentElement; // ADAPT: RegisterGrid's scroller is overflow-auto, not .overflow-x-auto
      const badgeSizes = [...document.querySelectorAll("tbody tr td:nth-child(8) *")]
        .filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
        .map((el) => parseFloat(getComputedStyle(el).fontSize));
      const gstin = [...document.querySelectorAll("tbody tr td:nth-child(6) *")].find((el) => /GSTIN|\d{2}[A-Z]{5}\d{4}/.test(el.innerText));
      return {
        vw, scrollWidth: document.documentElement.scrollWidth, heads, buttons, widestPay: payCells.sort((a, b) => b.right - a.right).slice(0, 3), containerOverflow: container ? container.scrollWidth - container.clientWidth : null,
        badgeMin: Math.min(...badgeSizes), badgeSet: [...new Set(badgeSizes)].sort(), gstinSize: gstin ? parseFloat(getComputedStyle(gstin).fontSize) : null,
        markPaidHeight: buttons.length ? Math.min(...buttons.map((b) => b.h)) : null,
      };
    });

  await scenario("11", "layout", async (s) => {
    for (const [w, hgt] of [[1280, 800], [1440, 900]]) {
      const { page } = s.track(await open("pharmacist", { width: w, height: hgt }));
      await goto(page);
      const m = await layoutMetrics(page);
      s.check(`${w}: eight headers (Settle column removed)`, m.heads.length, 8);
      s.check(`${w}: headers outside the viewport`, m.heads.filter((h) => h.left < 0 || h.right > w).map((h) => h.name), []);
      s.ok(`${w}: Mark paid buttons present`, m.buttons.length > 0, m.buttons.length);
      s.check(`${w}: Mark paid buttons outside the viewport`, m.buttons.filter((b) => b.left < 0 || b.right > w).length, 0);
      s.ok(`${w}: no horizontal page scroll`, m.scrollWidth <= w, m.scrollWidth);
      s.check(`${w}: table container does not scroll sideways`, m.containerOverflow <= 1, true);
      s.ok(`${w}: payment badge font-size >= 14px`, m.badgeMin >= 14, { min: m.badgeMin, sizes: m.badgeSet });
      s.check(`${w}: GSTIN is not printed in the Distributor cell (kept in the tooltip)`, m.gstinSize, null);
      s.note(`${w}: Mark paid height ${m.markPaidHeight}px, rightmost header edge ${Math.max(...m.heads.map((h) => h.right))}; header edges ${JSON.stringify(m.heads.map((h) => [h.name, h.left, h.right]))}; widest Payment cells ${JSON.stringify(m.widestPay)}`);
      if (w === 1280) {
        await s.shot(page, "11-layout-1280");
        const clipped = await page.evaluate(() => {
          const main = document.querySelector("main") || document.body;
          const scrollers = [];
          for (let el = document.querySelector("table"); el; el = el.parentElement) {
            const cs = getComputedStyle(el);
            if (el.scrollWidth > el.clientWidth + 1) scrollers.push({ tag: el.tagName, cls: String(el.className).slice(0, 60), overflowX: cs.overflowX, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth });
          }
          return scrollers;
        });
        s.note(`${w}: ancestors whose content is wider than they are: ${JSON.stringify(clipped)}`);
        await page.evaluate(() => window.scrollTo(0, 0));
        await selectByLabel(page, "Payment status").selectOption({ label: "Part paid" });
        await settle(page);
        const partial = await layoutMetrics(page);
        s.check("1280 with Payment status = Part paid (no scheduled note in the table): Mark paid buttons all inside the viewport", partial.buttons.filter((b) => b.right > w).length, 0);
        await s.shot(page, "11-layout-1280-partial");
        await clearAll(page);
      } else await s.shot(page, "11-layout-1440");
    }
    const { page } = s.track(await open("pharmacist", { width: 390, height: 844 }));
    await goto(page);
    const dims = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    s.ok("390: no page-level horizontal overflow", dims.sw <= dims.iw + 1, dims);
    const toggle = page.getByRole("button", { name: /^Filters/ });
    s.check("390: Filters disclosure collapsed", [await toggle.getAttribute("aria-expanded"), await selectByLabel(page, "Payment status").isVisible()], ["false", false]);
    await toggle.click();
    s.check("390: Filters disclosure expanded", [await toggle.getAttribute("aria-expanded"), await selectByLabel(page, "Payment status").isVisible()], ["true", true]);
    await selectByLabel(page, "Payment status").selectOption({ label: "Due" });
    await settle(page);
    s.check("390: Filters count", (await toggle.innerText()).replace(/\s+/g, " ").trim(), "Filters (1)");
    s.ok("390: still no page overflow with filters open", (await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)));
    await s.shot(page, "11-mobile-filters");
    await toggle.click();
    const target = (await readRows(page)).find((r) => r.markPaid);
    s.ok("390: a Due row offers Mark paid", target, "none");
    if (target) {
      const button = markPaidButton(page, target.billNo);
      await button.scrollIntoViewIfNeeded();
      await s.shot(page, "11-mobile-table");
      await button.click();
      const d = dialogOf(page);
      await d.waitFor();
      await page.waitForTimeout(300);
      const box = await d.boundingBox();
      const submit = await d.getByRole("button", { name: /^Record payment/ }).boundingBox();
      s.ok("390: popover is a full-width bottom sheet", box && box.x <= 1 && Math.abs(box.width - 390) <= 2 && Math.abs(box.y + box.height - 844) <= 2, box);
      s.ok("390: popover fully inside the viewport", box && box.y >= 0 && box.y + box.height <= 845, box);
      s.ok("390: Record payment button reachable and >= 40px tall", submit && submit.y >= 0 && submit.y + submit.height <= 844 && submit.height >= 40, submit);
      const fields = await d.locator("select, input, button").evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { n: e.getAttribute("aria-label") || e.innerText?.trim().slice(0, 18) || e.placeholder || e.tagName, l: Math.round(r.left), r: Math.round(r.right), h: Math.round(r.height) }; }));
      s.ok("390: popover controls inside 390px", fields.every((f) => f.l >= 0 && f.r <= 391), fields.filter((f) => f.l < 0 || f.r > 391));
      s.note(`390: popover control heights ${JSON.stringify(fields.map((f) => `${f.n}:${f.h}`))}`);
      await s.shot(page, "11-mobile-sheet");
      await d.getByRole("button", { name: "Cancel" }).click();
    }
  });

  await scenario("12", "regression-vs-trunk", async (s) => {
    const old = execFileSync("git", ["show", "5d1827f:frontend/src/components/inventory/InventoryWorkspace.tsx"], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    const start = old.indexOf("function PurchaseRegister(");
    s.ok("trunk has the old inline PurchaseRegister", start > 0, start);
    const next = old.slice(start + 10).search(/\n(export )?(async )?function /);
    const slice = old.slice(start, next > 0 ? start + 10 + next : undefined);
    for (const text of ["Payment", "Mark paid", "Not posted", "part paid", "Part paid", "Overdue", "Outstanding", "Sr No"]) s.check(`trunk register has no "${text}"`, slice.includes(text), false);
    s.check("trunk register headers", /"Invoice",\s*"Supplier",\s*"Date",\s*"Status",\s*"Amount",\s*"Original"/.test(slice), true);

    const { page } = s.track(await open("pharmacist"));
    const overpaid = all.find((b) => b.paid > b.net);
    const dist = distributors.find((d) => d.gstin !== overpaid.gstin && all.some((b) => b.gstin === d.gstin && b.billDay < FY.from && b.billDay >= "2026-03-01"));
    s.note(`distributor under test ${dist.name}; the seeded over-allocated bill belongs to ${overpaid.distributor}`);
    await page.goto(`${stack.base}/dashboard/inventory?area=purchases&view=ledger&gstin=${dist.gstin}`, { waitUntil: "domcontentloaded", timeout: 240000 });
    await page.getByText(dist.name).first().waitFor({ timeout: 120000 });
    await page.waitForTimeout(2500);
    const expectedAll = all.filter((b) => b.gstin === dist.gstin && b.status === "STOCK_COMMITTED").reduce((sum, b) => sum + st(b).outstanding, 0);
    const ledgerText = await page.locator("body").innerText();
    s.ok("Payments & dues shows the distributor's outstanding", ledgerText.includes(fmt(expectedAll).replace("₹", "Rs ")), { expected: fmt(expectedAll).replace("₹", "Rs ") });
    await s.shot(page, "12-ledger-view");
    const api = await ledgerOf(page, dist.gstin);
    s.check("ledger API outstanding = seed", api.outstanding, expectedAll);

    const wanted = "Change dates, 01/03/2026 to 31/03/2027";
    const probes = [];
    for (let attempt = 1; attempt <= 4; attempt++) {
      await page.goto(`${stack.base}${REGISTER}&from=2026-03-01&to=${FY.to}&gstin=${dist.gstin}`, { waitUntil: "domcontentloaded", timeout: 240000 });
      await page.locator('select[aria-label="Period"]').waitFor({ timeout: 240000 });
      await page.waitForTimeout(4000);
      probes.push({ shown: await page.getByRole("button", { name: /^Change dates/ }).getAttribute("aria-label"), url: page.url().replace(stack.base, "") });
    }
    s.note(`deep link ?from=2026-03-01&to=${FY.to}&gstin=${dist.gstin} loaded 4 times: ${JSON.stringify(probes)}`);
    s.ok("deep-link from/to range is honored on every load", probes.every((p) => p.shown === wanted), probes);
    s.ok("deep-link gstin filter is honored on every load", probes.every((p) => p.url.includes(`gstin=${dist.gstin}`)), probes);
    await goto(page);
    const setFrom = async (text) => {
      await page.locator('select[aria-label="Period"]').selectOption("custom");
      const panel = page.getByRole("group", { name: "Custom dates" });
      await panel.getByLabel("From").fill(text);
      await panel.getByLabel("From").press("Enter");
    };
    await setFrom("01/01/2025");
    // ADAPT: ranges over 400 days are now refused inside the date popover ("Pick at most 400 days at a time.") before any request is sent,
    // instead of the register showing a "Could not load purchase bills ... at most 400 days" alert from the server.
    const limitMessage = page.getByText(/Pick at most 400 days at a time/);
    await limitMessage.waitFor({ timeout: 60000 });
    s.note(`range wider than the limit shows in the popover: ${(await limitMessage.innerText()).replace(/\s+/g, " ").trim()}`);
    s.check("register explains ranges over 400 days without a load-error alert", [await limitMessage.count(), await page.getByRole("alert").filter({ hasText: "Could not load" }).count()], [1, 0]);
    await s.shot(page, "12-range-limit");
    await page.getByLabel("From").fill("01/03/2026");
    await page.getByLabel("From").press("Enter");
    await settle(page);
    await openMore(page);
    await selectByLabel(page, "Distributor").selectOption({ value: dist.gstin });
    await settle(page);
    const foot = await footer(page);
    s.check("register footer outstanding (all dates, one distributor) = ledger", foot.outstanding, fmt(api.outstanding));
    const rows = await readRows(page);
    s.check("register lists that distributor's bills", rows.length, all.filter((b) => b.gstin === dist.gstin && b.billDay >= "2026-03-01").length);
    const ledgerOver = await ledgerOf(page, overpaid.gstin);
    const registerOver = all.filter((b) => b.gstin === overpaid.gstin && b.status === "STOCK_COMMITTED").reduce((sum, b) => sum + st(b).outstanding, 0);
    s.note(`over-allocated distributor: per-invoice outstanding (register/ledger rows) ${fmt(registerOver)}; ledger rows API ${fmt(ledgerOver.outstanding)}`);
    await s.shot(page, "12-register-same-distributor");
    await clearAll(page);
    const fyFoot = await footer(page);
    s.ok("FY-only footer excludes the previous-FY dues (differs from the all-dates figure)", fyFoot.outstanding !== fmt(totalsOf(all).outstanding), fyFoot);
  });


  // ---- CR-26 fix round scenarios -------------------------------------------------------------------------------------------------

  const api = (page, method, route, body) =>
    page.evaluate(
      async ([m, r, b]) => {
        const res = await fetch(`/api${r}`, { method: m, credentials: "include", headers: { "Content-Type": "application/json" }, ...(b ? { body: JSON.stringify(b) } : {}) });
        return { status: res.status, body: await res.json().catch(() => null) };
      },
      [method, route, body ?? null],
    );
  const payViaApi = (page, bill, cents, mode = "UPI") =>
    api(page, "POST", "/pharmacy/purchase-ledger/payments", {
      requestKey: `stack-${crypto.randomUUID()}`, distributorGstin: bill.gstin, distributorName: bill.distributor, paymentDate: today, mode, amount: cents / 100,
      allocations: [{ purchaseInvoiceId: bill.id, amount: cents / 100 }],
    });
  const activeLabel = (page) => page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? `${document.activeElement?.tagName}:${(document.activeElement?.textContent || "").trim().slice(0, 30)}`);
  const waitFocus = (page, label) =>
    page.waitForFunction((l) => document.activeElement?.getAttribute("aria-label") === l, label, { timeout: 10000 }).then(
      () => true,
      () => false,
    );

  await scenario("13", "keyboard-month-end", async (s) => {
    const { page } = s.track(await open("pharmacist", { width: 1280, height: 800 }));
    await goto(page);
    const groups = new Map();
    for (const b of fyBills()) if (settleable(b) && !used.has(b.billNo)) groups.set(b.gstin, [...(groups.get(b.gstin) || []), b]);
    const [gstin, candidates] = [...groups.entries()].sort((a, b) => b[1].length - a[1].length)[0];
    const dist = distributors.find((d) => d.gstin === gstin);
    s.ok("a distributor has at least four settleable bills", candidates.length >= 4, candidates.length);
    await search(page, "Distributor", dist.name);
    const order = (await readRows(page)).filter((r) => r.markPaid).map((r) => r.billNo);
    const three = order.slice(0, 3);
    three.forEach((n) => used.add(n));
    s.note(`${dist.name}: Mark paid rows in screen order ${JSON.stringify(order)}`);
    await page.evaluate(() => {
      window.__early = [];
      new MutationObserver(() => {
        const dlg = document.querySelector('[role="dialog"]');
        if (!dlg || dlg.__early) return;
        dlg.__early = true;
        const ev = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
        (dlg.querySelector("select") || dlg).dispatchEvent(ev);
        window.__early.push({ prevented: ev.defaultPrevented });
      }).observe(document.body, { childList: true, subtree: true });
    });
    const bills = three.map((n) => all.find((b) => b.billNo === n));
    for (const [i, bill] of bills.entries()) {
      const button = markPaidButton(page, bill.billNo);
      await button.focus();
      s.check(`#${i + 1} ${bill.billNo}: Mark paid is focused`, await activeLabel(page), `Mark bill ${bill.billNo} paid`);
      await page.keyboard.press("Enter");
      await dialogOf(page).waitFor();
      const inDialog = await page.waitForFunction(() => document.activeElement?.tagName === "SELECT" && !!document.activeElement.closest('[role="dialog"]'), null, { timeout: 5000 }).then(
        () => true,
        () => false,
      );
      s.check(`#${i + 1}: dialog opened with focus on Mode`, inDialog, true);
      if (i === 1) await s.shot(page, "13-dialog-1280");
      const early = await page.evaluate(() => window.__early.at(-1));
      s.check(`#${i + 1}: Enter dispatched the instant the dialog mounted is ignored (inside the 300 ms guard)`, early, { prevented: true });
      await page.waitForTimeout(120);
      s.check(`#${i + 1}: dialog still open and nothing recorded`, [await dialogOf(page).isVisible(), (await paymentsFor(bill.id)).length], [true, 0]);
      await page.waitForTimeout(400);
      await page.keyboard.press("Enter");
      await undoButton(page, bill.billNo).waitFor({ timeout: 30000 });
      await dialogOf(page).waitFor({ state: "hidden" });
      const expected = i < 2 ? `Mark bill ${order[i + 1]} paid` : order[3] ? `Mark bill ${order[3]} paid` : `Open bill ${bill.billNo}`;
      s.check(`#${i + 1}: focus lands on the next row's Mark paid`, (await waitFocus(page, expected)) ? expected : await activeLabel(page), expected);
    }
    await settle(page);
    const rows = await readRows(page);
    s.check("all three rows show inline Undo", rows.filter((r) => r.undo).map((r) => r.billNo), three);
    await s.shot(page, "13-inline-undo-1280");
    await undoButton(page, three[1]).click();
    await page.getByText("Payment undone", { exact: true }).waitFor({ timeout: 20000 });
    await settle(page);
    const state = [];
    for (const bill of bills) {
      const ps = await paymentsFor(bill.id, true);
      state.push(ps.map((p) => (p.reversedAt ? "reversed" : "live")));
    }
    s.check("DB: first and third live, second reversed (2 live + 1 reversed)", state, [["live"], ["reversed"], ["live"]]);
    const after = await readRows(page);
    s.check("undone row is back to Mark paid; the other two keep Undo", after.filter((r) => three.includes(r.billNo)).map((r) => [r.billNo, r.undo ? "undo" : r.markPaid ? "mark" : "none"]), three.map((n, i) => [n, i === 1 ? "mark" : "undo"]));
    await resyncLater();
  });
  async function resyncLater() {
    await resync();
  }

  await scenario("14", "under-pay-race", async (s) => {
    const { page } = s.track(await open("pharmacist", { width: 1280, height: 800 }));
    await goto(page);
    const bill = pick(["DUE", "OVERDUE", "PARTIAL"], (b) => b.plan === "PART_ALLOC" && settleable(b));
    const seeded = await stack.db.pharmacyPurchasePayment.findFirst({ where: { allocations: { some: { purchaseInvoiceId: bill.id } }, requestKey: { startsWith: "seed-" }, reversedAt: null } });
    s.ok("bill has a live seeded partial payment", seeded, null);
    const payable = st(bill).payable;
    await showBill(page, bill.billNo);
    await markPaidButton(page, bill.billNo).click();
    await dialogOf(page).waitFor();
    s.check("dialog opened for the original balance", (await readDialog(page)).title, `Pay ${fmt(payable)} to ${bill.distributor}`);
    const reversed = await api(page, "POST", `/pharmacy/purchase-ledger/payments/${seeded.id}/reverse`, { requestKey: `stack-${crypto.randomUUID()}`, expectedUpdatedAt: seeded.updatedAt.toISOString(), reason: "Stack scenario: reversed behind the open dialog" });
    s.ok("existing partial payment reversed through the API while the dialog is open", reversed.status < 300, reversed);
    await s.shot(page, "14-dialog-before-record");
    await page.waitForTimeout(400);
    await dialogOf(page).getByRole("button", { name: /^Record payment/ }).click();
    const remaining = bill.net - bill.credit - payable;
    const warning = page.getByText(`Recorded ${fmt(payable)}; ${fmt(remaining)} still due`, { exact: true });
    const outcome = await Promise.race([warning.waitFor({ timeout: 30000 }).then(() => "warning"), dialogOf(page).getByRole("alert").waitFor({ timeout: 30000 }).then(() => "inline-error")]).catch((e) => `timeout`);
    s.check("under-pay warning toast names recorded amount and what is still due", outcome, "warning");
    await page.waitForTimeout(800);
    await s.shot(page, "14-warning");
    await settle(page);
    await resync();
    const undoBox = await undoButton(page, bill.billNo).boundingBox();
    s.ok("inline Undo stays on one line (not wrapped letter by letter)", undoBox && undoBox.height <= 40 && undoBox.width >= 40, undoBox);
    const row = (await readRows(page)).find((r) => r.billNo === bill.billNo);
    s.check("row shows the remaining due", row.payment, badgeLines(bill));
    s.ok("remaining due is ₹Y from the warning", row.paymentSr.includes(fmt(remaining)) || row.payment.some((l) => l.includes(`Overdue`)) , row.paymentSr);
    s.check("payment recorded for the dialog's amount, bill still owes the rest", [Math.round(((await paymentsFor(bill.id))[0]?.amount ?? 0) * 100), st(bill).outstanding], [payable, remaining]);
  });

  await scenario("15", "stale-duplicate", async (s) => {
    const { page } = s.track(await open("pharmacist", { width: 1280, height: 800 }));
    await goto(page);
    const bill = pick(["DUE", "OVERDUE", "PARTIAL"]);
    const payable = st(bill).payable;
    await showBill(page, bill.billNo);
    s.check("page lists the bill with Mark paid", (await readRows(page)).find((r) => r.billNo === bill.billNo)?.markPaid, `Mark bill ${bill.billNo} paid`);
    const behind = await payViaApi(page, bill, payable, "NEFT");
    s.ok("bill settled through the API behind the page's back", behind.status < 300, behind);
    await markPaidButton(page, bill.billNo).click();
    await dialogOf(page).waitFor();
    await page.waitForTimeout(400);
    await dialogOf(page).getByRole("button", { name: /^Record payment/ }).click();
    await dialogOf(page).waitFor({ state: "hidden", timeout: 30000 });
    await page.waitForTimeout(800);
    s.ok("dialog closed", true);
    const toast = page.locator('[role="status"], li[role="status"], [data-radix-collection-item]').filter({ hasText: /balance changed|already recorded/ }).first();
    await toast.waitFor({ timeout: 15000 }).catch(() => {});
    const text = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    const message = text.match(/This bill.s balance changed|This payment was already recorded/)?.[0] ?? null;
    s.ok("toast says 'This bill's balance changed' or 'already recorded'", message, text.slice(0, 200));
    s.note(`toast shown: ${message}`);
    await s.shot(page, "15-stale-toast");
    await settle(page);
    await resync();
    const row = (await readRows(page)).find((r) => r.billNo === bill.billNo);
    s.check("list refreshed: row is Paid with no Mark paid", [row.payment, row.markPaid], [["Paid"], null]);
    s.check("exactly one live payment (the API one), nothing double-paid", (await paymentsFor(bill.id)).map((p) => [Math.round(p.amount * 100), p.mode]), [[payable, "NEFT"]]);
    s.note(`focus after the stale close: ${await activeLabel(page)}`);
  });

  await scenario("16", "scheduled-payments", async (s) => {
    const { page } = s.track(await open("pharmacist", { width: 1280, height: 800 }));
    await goto(page);
    const full = all.find((b) => b.plan === "FUTURE_FULL");
    const part = all.find((b) => b.plan === "FUTURE_PART");
    const rows = await readAll(page);
    const by = Object.fromEntries(rows.map((r) => [r.billNo, r]));
    s.check("fully covered bill: badge reads Scheduled with the full date outside this financial year", by[full.billNo].payment, badgeLines(full));
    s.check("fully covered bill: no Mark paid", by[full.billNo].markPaid, null);
    s.ok("fully covered bill: sr text names the full date", by[full.billNo].paymentSr.includes("Payment scheduled for 15/01/2099"), by[full.billNo].paymentSr);
    s.check("fully covered bill still owes the balance in the footer basis (state is Due)", [stateOf(full), st(full).outstanding], ["DUE", full.net]);
    s.check("part-scheduled bill: badge lines", by[part.billNo].payment, badgeLines(part));
    s.check("part-scheduled bill: Mark paid offered", by[part.billNo].markPaid, `Mark bill ${part.billNo} paid`);
    const reach = await page.evaluate((n) => {
      const btn = document.querySelector(`button[aria-label="Mark bill ${n} paid"]`);
      const r = btn.getBoundingClientRect();
      return { left: Math.round(r.left), right: Math.round(r.right), vw: window.innerWidth };
    }, part.billNo);
    s.ok("1280: the part-scheduled row's Mark paid button is inside the viewport", reach.right <= reach.vw && reach.left >= 0, reach);
    await rowFor(page, full.billNo).scrollIntoViewIfNeeded();
    await s.shot(page, "16-scheduled-1280");
    const payable = st(part).payable;
    s.ok("seed: payable = outstanding - scheduled", payable === part.net - part.sched && payable > 0, payable);
    await showBill(page, part.billNo);
    await markPaidButton(page, part.billNo).click();
    await dialogOf(page).waitFor();
    const info = await readDialog(page);
    s.check("Mark paid offers the payable amount (not the full outstanding)", [info.title, info.button], [`Pay ${fmt(payable)} to ${part.distributor}`, `Record payment ${fmt(payable)}`]);
    await s.shot(page, "16-dialog-payable");
    await page.waitForTimeout(400);
    await dialogOf(page).getByRole("button", { name: /^Record payment/ }).click();
    await undoButton(page, part.billNo).waitFor({ timeout: 30000 });
    await settle(page);
    await resync();
    const p = (await paymentsFor(part.id))[0];
    s.check("recording the payable amount succeeds", [Math.round(p.amount * 100), p.reversedAt], [payable, null]);
    const row = (await readRows(page)).find((r) => r.billNo === part.billNo);
    s.check("row now only waits for the scheduled payment", row.payment, badgeLines(part));
    s.check("after paying payable: scheduled-only", st(part).scheduledOnly, true);
  });

  await scenario("17", "export-xlsx", async (s) => {
    const XLSX = require("xlsx");
    const { page, context } = s.track(await open("pharmacist", { width: 1440, height: 900 }, { stubOpen: false }));
    await goto(page);
    const outstandingStates = ["DUE", "OVERDUE", "PARTIAL"];
    const counts = new Map();
    for (const b of fyBills()) if (outstandingStates.includes(stateOf(b))) counts.set(b.gstin, (counts.get(b.gstin) || 0) + 1);
    const [gstin] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    const dist = distributors.find((d) => d.gstin === gstin);
    await selectByLabel(page, "Payment status").selectOption({ label: "Outstanding" });
    await settle(page);
    await openMore(page);
    await selectByLabel(page, "Distributor").selectOption({ value: gstin });
    await settle(page);
    const expected = fyBills().filter((b) => b.gstin === gstin && outstandingStates.includes(stateOf(b)));
    const rank = rankOf(expected);
    s.check("register shows the expected outstanding bills", (await readAll(page)).map((r) => r.billNo).sort(), expected.map((b) => b.billNo).sort());
    await page.getByRole("button", { name: "More", exact: true }).click();
    const item = page.getByRole("menuitem", { name: /Export to Excel/ });
    s.ok("export item has no 'Without the … filter' caveat", !/Without the/.test(await item.innerText()), await item.innerText());
    await page.waitForTimeout(500);
    await s.shot(page, "17-export-menu");
    const downloaded = new Promise((resolve) => {
      page.on("download", resolve);
      context.on("page", (p) => p.on("download", resolve));
    });
    await item.click();
    const download = await Promise.race([downloaded, new Promise((_, rej) => setTimeout(() => rej(new Error("no download event within 60 s")), 60000))]);
    const file = path.join(out, "17-export.xlsx");
    await download.saveAs(file);
    s.check("download failure", await download.failure(), null);
    s.check("file name", download.suggestedFilename(), `purchase-bills-${FY.from}-${FY.to}.xlsx`);
    const url = new URL(download.url(), stack.base);
    s.check("export is served by the register endpoint", url.pathname, "/api/pharmacy/purchase-register");
    s.check("export carries the active filters", [url.searchParams.get("format"), url.searchParams.get("from"), url.searchParams.get("to"), url.searchParams.get("paymentState"), url.searchParams.get("distributorGstin")], ["xlsx", FY.from, FY.to, "OUTSTANDING", gstin]);
    const book = XLSX.readFile(file);
    const sheet = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]]);
    s.check("sheet name", book.SheetNames, ["Purchase bills"]);
    const istTime = (ms) => new Date(ms + 19800000).toISOString().slice(11, 16);
    const label = (b) => {
      const x = st(b);
      if (x.scheduledOnly) return `Scheduled ${x.schedDay}${x.state === "OVERDUE" ? ` · was due ${b.dueDay}` : ""}`;
      const base = x.state === "OVERDUE" ? `Overdue · ${x.lateDays} day${x.lateDays === 1 ? "" : "s"}${x.partlyPaid ? " · part paid" : ""}` : x.state === "PARTIAL" ? "Part paid" : "Due";
      return x.sched > 0 ? `${base} · ${x.sched / 100} scheduled ${x.schedDay}` : base;
    };
    const wanted = [...expected].sort((a, b) => b.entryAt - a.entryAt).map((b) => ({
      "Sr No": rank.get(b.billNo), "Bill No": b.billNo, "Entry Date": `${istDay(new Date(b.entryAt))} ${istTime(b.entryAt)}`, "Bill Date": b.billDay, "Entry By": b.entryBy ?? "", Distributor: b.distributor, GSTIN: b.gstin,
      "Bill Amount": b.net / 100, Payment: label(b), Outstanding: st(b).outstanding / 100,
    }));
    s.check("sheet columns", Object.keys(sheet[0] || {}), ["Sr No", "Bill No", "Entry Date", "Bill Date", "Entry By", "Distributor", "GSTIN", "Bill Amount", "Payment", "Outstanding"]);
    s.check("sheet rows equal the expected outstanding bills (order, amounts, payment label, outstanding)", sheet.map((r) => ({ ...r, "Bill Amount": Math.round(r["Bill Amount"] * 100) / 100, Outstanding: Math.round(r.Outstanding * 100) / 100 })), wanted);
    s.check("sheet outstanding total = footer outstanding", fmt(Math.round(sheet.reduce((sum, r) => sum + r.Outstanding, 0) * 100)), (await footer(page)).outstanding);
    s.note(`${dist.name}: ${sheet.length} outstanding bills exported to ${path.relative(root, file)}`);
  });

  await scenario("18", "today-tab-and-access", async (s) => {
    const { page } = s.track(await open("pharmacist"));
    await page.goto(`${stack.base}/dashboard/inventory`, { waitUntil: "domcontentloaded", timeout: 240000 });
    const card = page.getByRole("button", { name: /Purchase invoices to review/ });
    await card.waitFor({ timeout: 240000 });
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => /Purchase invoices to review/.test(b.innerText) && /^\d+/.test(b.innerText.trim())), null, { timeout: 60000 });
    const cardText = (await card.innerText()).replace(/\s+/g, " ").trim();
    await s.shot(page, "18-today");
    const overdueCard = await page.getByRole("button", { name: /Overdue supplier bills/ }).innerText().catch(() => "");
    s.note(`Today 'Overdue supplier bills' card: ${overdueCard.replace(/\s+/g, " ")}; register OVERDUE bills (all dates, model): ${all.filter((b) => stateOf(b) === "OVERDUE").length}; in FY: ${fyBills().filter((b) => stateOf(b) === "OVERDUE").length}`);
    const expectedNotPosted = all.filter((b) => !["STOCK_COMMITTED", "CANCELLED"].includes(b.status));
    s.check("Today card count = unposted bills", Number(cardText.match(/^\d+/)?.[0]), expectedNotPosted.length);
    await card.click();
    await page.locator("table").first().waitFor({ timeout: 240000 });
    await settle(page);
    const url = new URL(page.url());
    s.check("card opens the purchase bills register", [url.searchParams.get("area"), url.searchParams.get("view"), url.searchParams.get("pay")], ["purchases", "register", "NOT_POSTED"]);
    s.check("Payment status filter shows Not posted", await selectByLabel(page, "Payment status").inputValue(), "NOT_POSTED");
    const rows = await readAll(page);
    s.check("register lists exactly the not-posted bills", rows.map((r) => r.billNo).sort(), fyBills().filter((b) => stateOf(b) === "NOT_POSTED").map((b) => b.billNo).sort());
    s.check("every row reads Not posted", [...new Set(rows.map((r) => r.payment.join("|")))], ["Not posted"]);
    await s.shot(page, "18-register-not-posted");

    const menu = s.track(await open("pharmacist"));
    await goRegisterFromMenu(menu.page);
    const murl = new URL(menu.page.url());
    s.check("Purchases tab opens on Purchase bills (no intake first)", [murl.searchParams.get("area"), murl.searchParams.get("view")], ["purchases", "register"]);
    s.check("Purchase bills table is shown", await menu.page.locator('table[aria-label="Purchase bills"]').count(), 1);
    s.check("Purchase bills is the first task in the Purchases menu", (await menu.page.getByRole("navigation", { name: "purchases tasks" }).getByRole("button").first().innerText()).trim(), "Purchase bills");
    await s.shot(menu.page, "18-purchases-tab");

    const rec = s.track(await open("reception"));
    for (const route of [REGISTER, "/dashboard/inventory?area=purchases"]) {
      await rec.page.goto(`${stack.base}${route}`, { waitUntil: "domcontentloaded", timeout: 240000 });
      await rec.page.waitForFunction(() => /You don.t have access to purchase bills|Forbidden resource|Could not load/.test(document.body.innerText), null, { timeout: 90000 }).catch(() => {});
      const body = (await rec.page.locator("body").innerText()).replace(/\s+/g, " ");
      const statuses = (await rec.page.locator('[role="status"]').allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
      s.ok(`reception ${route}: access message shown`, statuses.some((t) => /You don.t have access to purchase bills\./.test(t)), { statuses, body: body.slice(0, 200) });
      s.check(`reception ${route}: no "Forbidden resource"`, /Forbidden resource/.test(body), false);
      const alerts = (await rec.page.locator('[role="alert"]').allInnerTexts()).map((t) => t.trim()).filter(Boolean); // ignore Next's empty route announcer
      s.check(`reception ${route}: no error alert, no table`, [alerts, await rec.page.locator("table").count()], [[], 0]);
    }
    await s.shot(rec.page, "18-reception");
  });

  await scenario("19", "original-document-link", async (s) => {
    const pool = fyBills().filter((b) => b.status === "STOCK_COMMITTED").sort(byEntry);
    const one = pool.at(-1);
    const two = pool.at(-2);
    const pdf = (tag) => Buffer.from(`%PDF-1.4\n% stack original ${tag}\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n`);
    const make = async (bill, fileName, mimeType, data) =>
      stack.db.pharmacyPurchaseInvoiceDocument.create({
        data: { branchId: stack.branch.id, purchaseInvoiceId: bill.id, fileName, mimeType, sizeBytes: data.length, sha256: crypto.createHash("sha256").update(data).digest("hex"), data },
      });
    const docOne = await make(one, "scan-one.pdf", "application/pdf", pdf(one.billNo));
    const docTwoA = await make(two, "scan-two-a.pdf", "application/pdf", pdf(`${two.billNo}-a`));
    const docTwoB = await make(two, "scan-two-b.pdf", "application/pdf", pdf(`${two.billNo}-b`));
    const { page, context } = s.track(await open("pharmacist", { width: 1280, height: 800 }, { stubOpen: false }));
    await goto(page);
    const requests = [];
    const downloads = [];
    context.on("response", (r) => /purchase-invoices\/documents\//.test(r.url()) && requests.push({ url: new URL(r.url()).pathname, status: r.status() }));
    context.on("page", (p) => p.on("download", (d) => downloads.push(d)));
    await showBill(page, one.billNo);
    const before = page.url();
    const link = rowFor(page, one.billNo).getByRole("link", { name: `Open original bill ${one.billNo}` });
    s.check("single document: link goes to the document endpoint in a new tab", [await link.getAttribute("href"), await link.getAttribute("target")], [`/api/pharmacy/purchase-invoices/documents/${docOne.id}`, "_blank"]);
    const popupOpened = context.waitForEvent("page", { timeout: 20000 }).then(() => true, () => false);
    await link.click();
    s.check("a new tab opened", await popupOpened, true);
    await page.waitForTimeout(2500);
    s.check("the document request succeeded", requests.filter((r) => r.url.endsWith(docOne.id)).map((r) => r.status), [200]);
    s.check("the bill was not opened (still on the register)", [page.url() === before, /invoice=/.test(page.url())], [true, false]);
    if (downloads[0]) {
      const file = path.join(out, "19-original.pdf");
      await downloads[0].saveAs(file);
      s.check("downloaded bytes are the stored original", fs.readFileSync(file).equals(pdf(one.billNo)), true);
    } else s.note("no download event surfaced for the new tab (document served inline or tab closed too early)");
    const served = await page.evaluate(async (id) => {
      const r = await fetch(`/api/pharmacy/purchase-invoices/documents/${id}`, { credentials: "include" });
      return { status: r.status, type: r.headers.get("content-type"), disposition: r.headers.get("content-disposition"), body: new TextDecoder().decode(await r.arrayBuffer()) };
    }, docOne.id);
    s.check("endpoint serves the stored original byte for byte", [served.status, served.type, /attachment/.test(served.disposition || ""), served.body === pdf(one.billNo).toString()], [200, "application/pdf", true, true]);
    await s.shot(page, "19-paperclip");

    await showBill(page, two.billNo);
    const menuTrigger = rowFor(page, two.billNo).getByRole("button", { name: `Open original bill ${two.billNo}` });
    s.check("two documents: one paperclip button showing the count", (await menuTrigger.innerText()).trim(), "2");
    await menuTrigger.click();
    await page.waitForTimeout(500);
    const items = await page.getByRole("menuitem").evaluateAll((els) => els.map((e) => ({ text: e.textContent.trim(), href: e.getAttribute("href") })));
    s.check("menu lists both originals", items, [
      { text: "scan-two-a.pdf", href: `/api/pharmacy/purchase-invoices/documents/${docTwoA.id}` },
      { text: "scan-two-b.pdf", href: `/api/pharmacy/purchase-invoices/documents/${docTwoB.id}` },
    ]);
    s.check("bill not opened by the multi-document menu", /invoice=/.test(page.url()), false);
    await s.shot(page, "19-paperclip-menu");
    await page.keyboard.press("Escape");
  });

  await scenario("20", "density-and-pinned-bill-no", async (s) => {
    for (const [w, h] of [[1280, 800], [1440, 900]]) {
      const { page } = s.track(await open("pharmacist", { width: w, height: h }));
      await goto(page);
      const m = await page.evaluate(() => {
        const bar = [...document.querySelectorAll('[role="status"]')].find((e) => e.innerText.includes("Outstanding ₹"))?.parentElement;
        const footerTop = bar ? bar.getBoundingClientRect().top : window.innerHeight;
        const headBottom = document.querySelector("thead").getBoundingClientRect().bottom;
        const rows = [...document.querySelectorAll("tbody tr")].map((r) => r.getBoundingClientRect());
        const limit = Math.min(footerTop, window.innerHeight);
        const full = rows.filter((r) => r.top >= headBottom - 1 && r.bottom <= limit + 0.5);
        return { footerTop: Math.round(footerTop), headBottom: Math.round(headBottom), visible: full.length, heights: [...new Set(rows.slice(0, 12).map((r) => Math.round(r.height)))], firstTop: Math.round(rows[0].top) };
      });
      s.ok(`${w}x${h}: at least 5 data rows fully visible above the footer`, m.visible >= 5, m);
      s.note(`${w}x${h}: ${m.visible} rows fully visible; row heights ${JSON.stringify(m.heights)}; header bottom ${m.headBottom}; footer top ${m.footerTop}`);
      await s.shot(page, `20-density-${w}`);
    }
    const { page } = s.track(await open("pharmacist", { width: 390, height: 844 }));
    await goto(page);
    const geometry = () =>
      page.evaluate(() => {
        const box = document.querySelector("table").parentElement;
        const c = box.getBoundingClientRect();
        const th = [...document.querySelectorAll("thead th")];
        const bill = th.find((e) => /^Bill No/.test(e.textContent.trim()));
        const sr = th.find((e) => /^Sr No/.test(e.textContent.trim()));
        const cell = document.querySelector("tbody tr td:nth-child(2)");
        const btn = document.querySelector('tbody button[aria-label^="Mark bill"]');
        const r = (el) => (el ? el.getBoundingClientRect() : null);
        const near = (a, b) => Math.abs(a - b) <= 1.5;
        return {
          scrollLeft: Math.round(box.scrollLeft), maxScroll: Math.round(box.scrollWidth - box.clientWidth), containerLeft: Math.round(c.left), position: getComputedStyle(cell).position,
          billHead: Math.round(r(bill).left - c.left), billCell: Math.round(r(cell).left - c.left), srHeadRight: Math.round(r(sr).right - c.left), pinned: near(r(cell).left, c.left) && near(r(bill).left, c.left),
          markPaidVisible: btn ? r(btn).left >= c.left - 1 && r(btn).right <= c.right + 1 : null,
        };
      });
    const start = await geometry();
    await page.locator("table").evaluate((t) => { t.parentElement.scrollLeft = t.parentElement.scrollWidth; });
    await page.waitForTimeout(300);
    const end = await geometry();
    s.ok("390: the table scrolls sideways", end.scrollLeft > 100, { start, end });
    s.ok("390: Bill No header and cells stay pinned at the left edge after scrolling right", end.pinned && end.position === "sticky", end);
    s.ok("390: Sr No has scrolled out of view (so pinning is Bill No, not Sr No)", end.srHeadRight <= end.billHead + 1, end);
    s.ok("390: Mark paid is visible alongside the pinned Bill No", end.markPaidVisible === true, end);
    s.note(`390 geometry start ${JSON.stringify(start)} end ${JSON.stringify(end)}`);
    await s.shot(page, "20-pinned-390");
  });

  const resultsFile = path.join(out, process.env.ONLY ? `results-${process.env.ONLY.replace(/,/g, "_")}.json` : "results.json");
  fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
  console.log("\nSUMMARY");
  for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.scenario}  console-errors=${r.consoleErrors.length}`);
  await browser.close();
  await stack.stop();
  process.exitCode = results.every((r) => r.pass) ? 0 : 1;
})().catch((e) => {
  console.error("CR26 HARNESS ERROR", e);
  process.exit(2);
});
