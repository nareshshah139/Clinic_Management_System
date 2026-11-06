const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
const { bootStack } = require("../boot.cjs");
const { seed, derive, istDay, daysBetween } = require("./cr26-seed.cjs");

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
    const counted = list.filter((b) => b.status !== "CANCELLED");
    return {
      amount: counted.reduce((s, b) => s + b.net, 0),
      outstanding: counted.reduce((s, b) => s + st(b).outstanding, 0),
      count: counted.length,
      cancelled: list.length - counted.length,
    };
  };
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
  const used = new Set();

  async function open(role, size = { width: 1440, height: 900 }) {
    const context = await browser.newContext({ viewport: size, ...(sessions.has(role) && { storageState: sessions.get(role) }) });
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
        const text = (i) => tds[i].innerText.replace(/ /g, " ").replace(/\s+/g, " ").trim();
        const lines = (i) => tds[i].innerText.replace(/ /g, " ").split("\n").map((s) => s.trim()).filter(Boolean);
        const settleButton = tr.querySelector('button[aria-label^="Mark bill"]');
        return {
          srNo: Number(text(0)), billNo: tds[1].innerText.trim(), entry: text(2), billDate: text(3), entryBy: text(4), distributor: lines(5), amount: text(6),
          payment: lines(7), paymentText: text(7), markPaid: settleButton ? settleButton.getAttribute("aria-label") : null, cells: tds.length,
        };
      }),
    );

  async function footer(page) {
    const raw = (await page.locator('[role="status"]', { hasText: "Outstanding ₹" }).first().innerText()).replace(/ /g, " ");
    const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
    const m = lines[0].match(/^Bills (₹[\d,]+\.\d{2}) · Outstanding (₹[\d,]+\.\d{2}) · (\d+) bills?$/);
    const pager = await page.locator('nav[aria-label="Purchase bill pages"] span').first().innerText().catch(() => null);
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
    const allocations = await stack.db.pharmacyPurchasePaymentAllocation.findMany({ where: { payment: { reversedAt: null } }, select: { purchaseInvoiceId: true, amount: true } });
    const paid = new Map();
    for (const a of allocations) paid.set(a.purchaseInvoiceId, (paid.get(a.purchaseInvoiceId) || 0) + Math.round(a.amount * 100));
    for (const b of all) b.paid = paid.get(b.id) || 0;
  }
  const rowFor = (page, billNo) => page.locator("tbody tr").filter({ has: page.getByRole("button", { name: `Open bill ${billNo}`, exact: true }) });
  const markPaidButton = (page, billNo) => page.getByRole("button", { name: `Mark bill ${billNo} paid`, exact: true });
  const pick = (states, extra = () => true) => {
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

  const badgeLines = (b) => {
    const s = st(b);
    switch (s.state) {
      case "PAID": return ["Paid"];
      case "DUE": return ["Due"];
      case "OVERDUE": return [`Overdue · ${s.lateDays}d`];
      case "PARTIAL": return [`${fmt(s.outstanding)} due`, `part paid${s.lateDays > 0 ? ` · ${s.lateDays}d late` : ""}`];
      case "CANCELLED": return ["Cancelled"];
      default: return null;
    }
  };
  const settleable = (b) => ["DUE", "OVERDUE", "PARTIAL"].includes(stateOf(b));

  async function goRegisterFromMenu(page) {
    await page.goto(`${stack.base}/dashboard/inventory`, { waitUntil: "domcontentloaded", timeout: 240000 });
    const tasks = page.getByRole("navigation", { name: "purchases tasks" });
    for (let attempt = 0; attempt < 8 && !(await tasks.isVisible()); attempt++) {
      await page.getByRole("navigation", { name: "Inventory areas" }).getByRole("button", { name: "Purchases", exact: true }).click();
      await tasks.waitFor({ timeout: 4000 }).catch(() => {});
    }
    await tasks.getByRole("button", { name: "Purchase bills" }).click();
    await page.locator("table").first().waitFor({ timeout: 240000 });
    await settle(page);
  }

  await scenario("01", "default-fy-rows-footer", async (s) => {
    const { page } = s.track(await open("pharmacist"));
    await goRegisterFromMenu(page);
    s.ok("URL is purchases register", /area=purchases/.test(page.url()) && /view=register/.test(page.url()), page.url());
    s.check("heading", await page.getByRole("heading", { name: "Purchase bills" }).count(), 1);
    s.check("column headers", (await page.locator("thead th").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim()), ["Sr No", "Bill No", "Entry Date", "Bill Date", "Entry By", "Distributor", "Bill Amount", "Payment", "Settle"]);
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
    s.check("footer summary", foot.summary, `Bills ${fmt(tot.amount)} · Outstanding ${fmt(tot.outstanding)} · ${tot.count} bills`);
    s.check("footer cancelled note", foot.note, `${tot.cancelled} cancelled not included`);
    s.check("pager", foot.pager, `1–${PAGE_SIZE} of ${fy.length} bills`);
    s.note(`UX: footer says "${foot.count} bills" (cancelled excluded) while the pager beside it says "of ${fy.length} bills" (cancelled included)`);
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
        s.check(`${label}: footer`, f.summary, `Bills ${fmt(tot.amount)} · Outstanding ${fmt(tot.outstanding)} · ${tot.count} ${tot.count === 1 ? "bill" : "bills"}`);
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
      ["Part paid", (b) => stateOf(b) === "PARTIAL"],
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
    s.ok("seed has an overdue partial and a not-yet-late partial", fy.some((b) => stateOf(b) === "PARTIAL" && st(b).lateDays > 0) && fy.some((b) => stateOf(b) === "PARTIAL" && st(b).lateDays === 0));
    s.ok("seed has a bill due today (not overdue)", fy.some((b) => b.dueDay === today && stateOf(b) === "DUE"));
    const wrong = [];
    for (const b of fy) {
      const expected = badgeLines(b);
      const row = by[b.billNo];
      if (expected) {
        if (JSON.stringify(row.payment.slice(0, expected.length)) !== JSON.stringify(expected) || (stateOf(b) !== "PARTIAL" && row.payment.length !== 1)) wrong.push({ bill: b.billNo, expected, actual: row.payment });
      } else if (!row.payment[0].startsWith("Not posted")) wrong.push({ bill: b.billNo, expected: "Not posted", actual: row.payment });
    }
    s.check("every badge matches the derived state", wrong, []);
    const overpaid = all.find((b) => b.paid > b.net);
    s.check("over-allocated bill floors outstanding at zero (Paid)", by[overpaid.billNo]?.payment, ["Paid"]);
    const reversedOne = all.find((b) => b.plan === "UNPAID_REVERSED" && b.status === "STOCK_COMMITTED");
    s.ok("bill whose only payment was reversed is not Paid", by[reversedOne.billNo] && by[reversedOne.billNo].payment[0] !== "Paid", by[reversedOne.billNo]?.payment);
    const np = fy.filter((b) => stateOf(b) === "NOT_POSTED").sort((a, b) => b.entryAt - a.entryAt).find((b) => rows.slice(0, PAGE_SIZE).includes(by[b.billNo]));
    const badge = rowFor(page, np.billNo).locator("td").nth(7).locator("span").filter({ hasText: "Not posted" }).first();
    await badge.hover();
    const tip = page.getByRole("tooltip").first();
    await tip.waitFor({ timeout: 8000 });
    const tipText = (await tip.innerText()).replace(/\s+/g, " ").trim();
    s.check("Not posted hover reason", tipText, `${np.status === "DRAFT" ? "Draft" : "In review"} · Post stock before paying`);
    await s.shot(page, "04-not-posted-hover");
    const cancelled = fy.find((b) => stateOf(b) === "CANCELLED");
    const decoration = await rowFor(page, cancelled.billNo).locator("td").nth(7).locator("span").first().evaluate((el) => getComputedStyle(el).textDecorationLine);
    s.check("Cancelled badge is struck through", decoration, "line-through");
    const amountDecoration = await rowFor(page, cancelled.billNo).locator("td").nth(6).locator("span").first().evaluate((el) => getComputedStyle(el).textDecorationLine);
    s.check("Cancelled amount is struck through", amountDecoration, "line-through");
    const entryBy = Object.fromEntries(rows.map((r) => [r.billNo, r.entryBy]));
    s.check("Entry By names (null/non-user creators show a dash)", Object.fromEntries(fy.map((b) => [b.billNo, entryBy[b.billNo]])), Object.fromEntries(fy.map((b) => [b.billNo, b.entryBy ? `${b.entryBy.split(" ")[0]} ${b.entryBy.split(" ").at(-1)[0]}.` : "—"])));
    s.note("design said 'Due ₹X'; the UI shows only 'Due' (amount appears in the Mark paid popover)");
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
    const out = st(bill).outstanding;
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
    await page.getByText("Payment recorded", { exact: true }).waitFor({ timeout: 20000 });
    await page.waitForTimeout(900);
    await s.shot(page, "05-toast");
    await settle(page);
    const row = (await readRows(page)).find((r) => r.billNo === bill.billNo);
    s.check("row is Paid", row.payment, ["Paid"]);
    s.check("Mark paid gone from the row", row.markPaid, null);
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
    s.check("Payment recorded toast offers Undo", await page.getByRole("button", { name: "Undo" }).count(), 1);
  });

  await scenario("06", "undo-from-toast", async (s) => {
    const { page } = s.track(await open("pharmacist"));
    await goto(page);
    const bill = pick(["DUE"]);
    const out = st(bill).outstanding;
    const before = await ledgerOf(page, bill.gstin);
    await showBill(page, bill.billNo);
    const footBefore = await footer(page);
    await pay(page, bill, { mode: "NEFT", reference: "UNDO-1" });
    await page.getByText("Payment recorded", { exact: true }).waitFor({ timeout: 20000 });
    await settle(page);
    s.check("row Paid after payment", (await readRows(page)).find((r) => r.billNo === bill.billNo).payment, ["Paid"]);
    const mid = await ledgerOf(page, bill.gstin);
    s.check("ledger dropped", before.outstanding - mid.outstanding, out);
    await page.getByRole("button", { name: "Undo" }).click();
    await page.getByText("Payment undone", { exact: true }).waitFor({ timeout: 20000 });
    await page.waitForTimeout(900);
    await s.shot(page, "06-undone-toast");
    await settle(page);
    const payments = await paymentsFor(bill.id, true);
    s.check("payment kept but reversed", [payments.length, payments[0]?.reversedAt !== null, payments[0]?.reversalReason], [1, true, "Undone from purchase list"]);
    const row = (await readRows(page)).find((r) => r.billNo === bill.billNo);
    s.check("row back to Due with Mark paid", [row.payment, row.markPaid], [badgeLines(bill), `Mark bill ${bill.billNo} paid`]);
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
    const firstOut = st(first).outstanding;
    const requests = [];
    page.on("request", (r) => r.method() === "POST" && /purchase-ledger\/payments$/.test(r.url()) && requests.push(r.postDataJSON?.()?.requestKey));
    await showBill(page, first.billNo);
    await markPaidButton(page, first.billNo).click();
    await dialogOf(page).getByRole("button", { name: /^Record payment/ }).dblclick();
    await page.getByText("Payment recorded", { exact: true }).waitFor({ timeout: 20000 });
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
    const out = st(second).outstanding;
    await markPaidButton(page, second.billNo).click();
    const d = dialogOf(page);
    await d.getByRole("button", { name: /^Record payment/ }).click();
    const secondToast = page.getByText(new RegExp(`for bill ${second.billNo.replace("/", "\\/")}\\.`)).first();
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
    await page.getByText("Payment recorded", { exact: true }).waitFor({ timeout: 20000 });
    await settle(page);
    a.paid += st(a).outstanding;
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
    s.check("pharmacist without ledger write: no Settle column", await readonly.page.locator("thead th").count(), 8);
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
    const receptionAlert = (await rec.page.locator('[role="alert"]').allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);
    s.note(`reception register alert: ${JSON.stringify(receptionAlert)}; badge rows rendered: ${(await readRows(rec.page)).filter((r) => r.billNo).length}`);
    s.check("reception register API is forbidden (no purchase read permission)", api.register, 403);
    s.ok("reception UI explains the failure instead of showing a blank/crashed page", receptionAlert.some((t) => /Could not load purchase bills/.test(t)), receptionAlert);
    await s.shot(rec.page, "09-reception");

    for (const role of ["doctor", "owner"]) {
      const { page: p } = s.track(await open(role));
      await goto(p);
      const bill = pick(["DUE", "OVERDUE", "PARTIAL"]);
      const out = st(bill).outstanding;
      await showBill(p, bill.billNo);
      s.check(`${role}: Mark paid offered`, await markPaidButton(p, bill.billNo).count(), 1);
      await markPaidButton(p, bill.billNo).click();
      await dialogOf(p).getByRole("button", { name: /^Record payment/ }).click();
      const result = await Promise.race([
        p.getByText("Payment recorded", { exact: true }).waitFor({ timeout: 20000 }).then(() => "recorded"),
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

  await scenario("10", "links-new-export", async (s) => {
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
    const nvj = distributors.find((d) => d.code === "NVJ");
    await search(page, "Distributor", "Navjeevan");
    await openMore(page);
    await selectByLabel(page, "Distributor").selectOption({ value: nvj.gstin });
    await selectByLabel(page, "Source").selectOption({ label: "Scanned" });
    await selectByLabel(page, "Bill status").selectOption({ label: "Stock posted" });
    await settle(page);
    await page.keyboard.press("Escape");
    await selectByLabel(page, "Payment status").selectOption({ label: "Overdue" });
    await settle(page);
    await page.getByRole("button", { name: "More", exact: true }).click();
    const exportItem = page.getByRole("menuitem", { name: /Export to Excel/ });
    const itemText = (await exportItem.innerText()).replace(/\s+/g, " ");
    s.ok("export item warns the payment status filter is not applied", /Without the payment status filter/.test(itemText), itemText);
    await s.shot(page, "10-export-menu");
    await exportItem.click();
    const opened = await page.evaluate(() => window.__opened);
    s.check("window.open called once", opened.length, 1);
    const exp = new URL(opened[0], stack.base);
    s.check("export path", exp.pathname, "/api/inventory/workspace/purchases/export");
    s.check("export carries the active filters", Object.fromEntries(exp.searchParams), {
      format: "xlsx", startDate: FY.from, endDate: FY.to, search: "Navjeevan", distributorGstin: nvj.gstin, source: "OCR", status: "STOCK_COMMITTED",
    });
    const download = await page.evaluate(async (u) => {
      const r = await fetch(u, { credentials: "include" });
      const buf = await r.arrayBuffer();
      return { status: r.status, type: r.headers.get("content-type"), bytes: buf.byteLength, zip: new Uint8Array(buf).slice(0, 2).join(",") };
    }, opened[0]);
    s.note(`export fetch: ${JSON.stringify(download)}`);
    s.check("export URL responds with an xlsx file", [download.status, /spreadsheetml|octet-stream/.test(download.type || ""), download.zip], [200, true, "80,75"]);
    const noFilter = await page.evaluate(async () => {
      const r = await fetch("/api/inventory/workspace/purchases/export?format=xlsx&startDate=2026-04-01&endDate=2027-03-31", { credentials: "include" });
      return (await r.arrayBuffer()).byteLength;
    });
    s.ok("filtered export is smaller than the unfiltered export", download.bytes < noFilter, { filtered: download.bytes, unfiltered: noFilter });

    await goto(page);
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("menuitem", { name: /Payments & dues/ }).click();
    await page.waitForURL(/view=ledger/, { timeout: 60000 });
    s.ok("More > Payments & dues opens the ledger view", true);
    await goto(page);
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("menuitem", { name: /Suppliers/ }).click();
    await page.waitForURL(/view=suppliers/, { timeout: 60000 });
    s.ok("More > Suppliers opens the suppliers view", true);
  });

  const layoutMetrics = (page) =>
    page.evaluate(() => {
      const vw = window.innerWidth;
      const box = (el) => {
        const r = el.getBoundingClientRect();
        return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) };
      };
      const heads = [...document.querySelectorAll("thead th")].map((th) => ({ name: th.innerText.replace(/\s+/g, " ").trim() || "Settle", ...box(th) }));
      const buttons = [...document.querySelectorAll('button[aria-label^="Mark bill"]')].map(box);
      const container = document.querySelector("table").closest(".overflow-x-auto");
      const badgeSizes = [...document.querySelectorAll("tbody tr td:nth-child(8) *")]
        .filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
        .map((el) => parseFloat(getComputedStyle(el).fontSize));
      const gstin = document.querySelector("tbody tr td:nth-child(6) .font-mono");
      return {
        vw, scrollWidth: document.documentElement.scrollWidth, heads, buttons, containerOverflow: container ? container.scrollWidth - container.clientWidth : null,
        badgeMin: Math.min(...badgeSizes), badgeSet: [...new Set(badgeSizes)].sort(), gstinSize: gstin ? parseFloat(getComputedStyle(gstin).fontSize) : null,
        markPaidHeight: buttons.length ? Math.min(...buttons.map((b) => b.h)) : null,
      };
    });

  await scenario("11", "layout", async (s) => {
    for (const [w, hgt] of [[1280, 800], [1440, 900]]) {
      const { page } = s.track(await open("pharmacist", { width: w, height: hgt }));
      await goto(page);
      const m = await layoutMetrics(page);
      s.check(`${w}: nine headers`, m.heads.length, 9);
      s.check(`${w}: headers outside the viewport`, m.heads.filter((h) => h.left < 0 || h.right > w).map((h) => h.name), []);
      s.ok(`${w}: Mark paid buttons present`, m.buttons.length > 0, m.buttons.length);
      s.check(`${w}: Mark paid buttons outside the viewport`, m.buttons.filter((b) => b.left < 0 || b.right > w).length, 0);
      s.ok(`${w}: no horizontal page scroll`, m.scrollWidth <= w, m.scrollWidth);
      s.check(`${w}: table container does not scroll sideways`, m.containerOverflow <= 1, true);
      s.ok(`${w}: payment badge font-size >= 14px`, m.badgeMin >= 14, { min: m.badgeMin, sizes: m.badgeSet });
      s.note(`${w}: GSTIN font ${m.gstinSize}px, Mark paid height ${m.markPaidHeight}px, rightmost header edge ${Math.max(...m.heads.map((h) => h.right))}`);
      if (w === 1280) {
        await s.shot(page, "11-layout-1280");
        await page.evaluate(() => window.scrollTo(0, 0));
        await selectByLabel(page, "Payment status").selectOption({ label: "Part paid" });
        await settle(page);
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
    const limitAlert = page.getByRole("alert").filter({ hasText: "Could not load purchase bills" });
    await limitAlert.waitFor({ timeout: 60000 });
    s.note(`range wider than the server limit shows: ${(await limitAlert.innerText()).replace(/\s+/g, " ").trim()}`);
    s.ok("register explains ranges over 400 days", /at most 400 days/.test(await limitAlert.innerText()));
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
