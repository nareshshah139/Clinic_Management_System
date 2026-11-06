const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
const { bootStack } = require("../boot.cjs");
const { seed, addDays } = require("./cr24-seed.cjs");

const root = path.resolve(__dirname, "../../..");
const out = path.join(root, "output/stack/cr24");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const COLUMNS = [
  { name: "Bill No", key: "billNo" },
  { name: "Entry Date", key: "entryAt" },
  { name: "Bill Date", key: "billDay" },
  { name: "Entry By", key: "entryBy" },
  { name: "Patient", key: "patient" },
  { name: "Mobile", key: "mobile" },
  { name: "Bill Amount", key: "cents" },
];

const fmt = (cents) => {
  const rupees = String(Math.floor(cents / 100));
  const head = rupees.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `₹${head ? `${head},` : ""}${rupees.slice(-3)}.${String(cents % 100).padStart(2, "0")}`;
};
const fmtDay = (day) => `${day.slice(8)} ${MONTHS[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}`;
const fmtEntry = (ms) => {
  const d = new Date(ms + 19800000);
  const h = d.getUTCHours();
  const clock = `${String(h % 12 || 12).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
  return `${fmtDay(d.toISOString().slice(0, 10))}, ${clock}`;
};
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
const compare = (key, a, b) => (typeof a === "number" ? a - b : natural(a, b));
function ordered(rows, key, dir) {
  const known = rows.filter((r) => r[key] !== null && r[key] !== undefined);
  return [...known].sort((a, b) => dir * compare(key, a[key], b[key]) || b.entryAt - a.entryAt);
}
const keyOf = (r) => `${r.billNo ?? "Draft"}|${r.patient ?? "—"}|${fmt(r.cents)}`;
const exclusion = (rows) => {
  const drafts = rows.filter((r) => r.state === "DRAFT").length;
  const cancelled = rows.filter((r) => r.state === "CANCELLED").length;
  const parts = [drafts && `${drafts} draft${drafts === 1 ? "" : "s"}`, cancelled && `${cancelled} cancelled`].filter(Boolean);
  return parts.length ? `Excludes ${parts.join(" and ")}` : null;
};
const finalSum = (rows) => rows.filter((r) => r.state === "FINAL").reduce((s, r) => s + r.cents, 0);
const digits = (s) => (s ?? "").replace(/\D/g, "");

let sink = [];
const watch = (page) => {
  page.on("pageerror", (e) => sink.push({ type: "pageerror", text: e.message.slice(0, 300) }));
  page.on("console", (m) => m.type() === "error" && sink.push({ type: "console", text: m.text().slice(0, 300) }));
};

async function settle(page) {
  await page.waitForTimeout(550);
  await page.waitForFunction(() => {
    const busy = document.querySelector("[aria-busy]");
    return busy && busy.getAttribute("aria-busy") === "false" && (document.body.innerText.includes("Total Amount") || document.body.innerText.includes("match your search") || document.querySelector('[role="alert"]'));
  }, null, { timeout: 90000 });
  await page.waitForTimeout(150);
}

const readRows = (page) =>
  page.locator("table tbody tr").evaluateAll((trs) =>
    trs.map((tr) => {
      const tds = [...tr.querySelectorAll("td")];
      if (tds.length < 9) return { empty: tr.innerText.trim() };
      const lines = tds[0].innerText.split("\n").map((s) => s.trim()).filter(Boolean);
      const buttons = [...tds[8].querySelectorAll("button, a")];
      const wa = buttons.find((b) => /WhatsApp/.test(b.getAttribute("aria-label") || ""));
      const pr = buttons.find((b) => /^Print/.test(b.getAttribute("aria-label") || ""));
      const text = (i) => tds[i].innerText.replace(/ /g, " ").trim();
      return {
        first: lines[0], lines, entry: text(1), billDate: text(2), entryBy: text(3), patient: text(4), mobile: text(5), amount: text(6),
        payments: tds[7].innerText.split("\n").map((s) => s.trim()).filter(Boolean),
        printLabel: pr?.getAttribute("aria-label"), printDisabled: pr?.getAttribute("aria-disabled"),
        waLabel: wa?.getAttribute("aria-label"), waHref: wa?.getAttribute("href"), waDisabled: wa?.getAttribute("aria-disabled"), waTag: wa?.tagName,
      };
    }),
  );

const rowKey = (r) => `${r.first}|${r.patient}|${r.amount}`;

async function footer(page) {
  const text = (await page.locator("p", { hasText: "Total Amount" }).first().innerText()).replace(/ /g, " ").replace(/\s+/g, " ");
  const m = text.match(/Total Amount (₹[\d,]+\.\d{2}) · (\d+) (\w+)/);
  const note = await page.locator("p", { hasText: /^Excludes/ }).first().innerText().catch(() => null);
  const pager = await page.locator('nav[aria-label$="pages"] span').first().innerText().catch(() => null);
  return { total: m?.[1], count: m && Number(m[2]), unit: m?.[3], note: note && note.replace(/\s+/g, " "), pager, raw: text };
}

async function scrollAll(page, to) {
  await page.evaluate((target) => {
    for (let el = document.querySelector("table"); el; el = el.parentElement) {
      if (el.scrollHeight > el.clientHeight + 1 && getComputedStyle(el).overflowY !== "visible") el.scrollTop = target === "bottom" ? el.scrollHeight : 0;
    }
    window.scrollTo(0, target === "bottom" ? document.documentElement.scrollHeight : 0);
  }, to);
  await page.waitForTimeout(250);
}

const footerBox = async (page) => {
  const el = page.getByText("Total Amount").first().locator('xpath=ancestor::div[contains(@class,"sticky")][1]');
  const box = await el.boundingBox();
  const vh = await page.evaluate(() => window.innerHeight);
  return { box, vh, inside: Boolean(box) && box.y >= -1 && box.y + box.height <= vh + 1 };
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
  const stack = await bootStack({ databaseUrl: process.env.STACK_DATABASE_URL, label: "cr24" });
  fs.mkdirSync(out, { recursive: true });
  console.log(`BOOT base=${stack.base}`);
  const data = await seed(stack.db, stack);
  const all = data.expected;
  assert.equal(data.today >= "2026-10-31" && data.today < "2027-03-31", true, `unexpected clock ${data.today}`);
  const FY = { from: "2026-04-01", to: "2027-03-31" };
  const inRange = (r, from, to) => r.billDay >= from && r.billDay <= to;
  const sales = all.filter((r) => r.register === "sales");
  const returns = all.filter((r) => r.register === "returns");
  const fySales = sales.filter((r) => inRange(r, FY.from, FY.to));
  const fyReturns = returns.filter((r) => inRange(r, FY.from, FY.to));
  assert.equal(new Set(fySales.map(keyOf)).size, fySales.length, "seed keys must be unique");
  const rowsOf = (list) => list.map(keyOf);
  console.log(`SEED sales rows in FY=${fySales.length} final=${fySales.filter((r) => r.state === "FINAL").length} sum=${fmt(finalSum(fySales))}`);

  const browser = await chromium.launch();
  const results = [];
  const printStub = () => {
    window.__printCalls = 0;
    window.print = () => { window.__printCalls++; };
  };

  const sessions = new Map();
  async function open(role, size = { width: 1440, height: 900 }) {
    const context = await browser.newContext({ viewport: size, ...(sessions.has(role) && { storageState: sessions.get(role) }) });
    await context.addInitScript(printStub);
    context.on("page", watch);
    const page = await context.newPage();
    page.setDefaultTimeout(60000);
    if (!sessions.has(role)) {
      await stack.login(page, role);
      sessions.set(role, await context.storageState());
    }
    return { page, context };
  }

  const goto = async (page, route) => {
    await page.goto(`${stack.base}${route}`, { waitUntil: "domcontentloaded", timeout: 240000 });
    await page.locator("table").first().waitFor({ timeout: 240000 });
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
    const ctx = { ...h, shot, root, track: (o) => (opened.push(o), (t.page = o.page), o) };
    try {
      await run(ctx);
    } catch (e) {
      error = e;
      try {
        if (t.page) await shot(t.page, `${id}-error`);
      } catch {}
    }
    for (const o of opened) await o.context.close().catch(() => {});
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
    results.push({ scenario: `${id} ${name}`, pass, detail, screenshot: t.shots[0] ?? null, screenshots: t.shots, consoleErrors: consoleErrors.map((e) => e.text), pageErrors: pageErrors.map((e) => e.text), seconds: Math.round((Date.now() - started) / 1000) });
    console.log(`${pass ? "PASS" : "FAIL"} ${id} ${name}\n${detail.split("\n").map((l) => `    ${l}`).join("\n")}`);
  }

  const selectByLabel = (page, label) => page.locator("label").filter({ hasText: new RegExp(`^\\s*${label}`) }).locator("select");
  const sidebarSales = (page) => page.locator("nav, aside").getByRole("link", { name: "Sales", exact: true });
  const setRange = async (page, from, to) => {
    await page.getByLabel("From", { exact: true }).fill(from);
    await page.getByLabel("To", { exact: true }).fill(to);
    await settle(page);
  };
  const search = async (page, field, q) => {
    await selectByLabel(page, "Search by").selectOption({ label: field });
    await page.getByRole("searchbox").fill(q);
    await settle(page);
  };
  const openMore = async (page) => {
    const btn = page.getByRole("button", { name: /More filters/ });
    if ((await btn.getAttribute("aria-expanded")) !== "true") await btn.click();
  };
  const moreCount = async (page) => {
    const text = await page.getByRole("button", { name: /More filters/ }).innerText();
    return Number(text.replace(/\D/g, "") || 0);
  };
  const paymentSelect = (page, label = "Payment type") => selectByLabel(page, label);
  const snapshot = async (page) => ({ rows: await readRows(page), foot: await footer(page) });

  await scenario("01", "pharmacist-sidebar-default-fy", async (s) => {
    const { page } = s.track(await open("pharmacist"));
    await page.goto(`${stack.base}/dashboard/pharmacy`, { waitUntil: "domcontentloaded", timeout: 240000 });
    await page.getByText("Anil", { exact: false }).first().waitFor({ timeout: 120000 });
    await sidebarSales(page).first().click();
    await page.waitForURL("**/dashboard/pharmacy/sales**", { timeout: 240000 });
    await page.locator("table").first().waitFor({ timeout: 240000 });
    await settle(page);
    s.check("default From", await page.getByLabel("From", { exact: true }).inputValue(), FY.from);
    s.check("default To", await page.getByLabel("To", { exact: true }).inputValue(), FY.to);
    const { rows, foot } = await snapshot(page);
    const sorted = [...fySales].sort((a, b) => b.entryAt - a.entryAt);
    s.check("page-1 row count", rows.length, 50);
    s.check("page-1 rows are the 50 newest by entry date", rows.map(rowKey), rowsOf(sorted.slice(0, 50)));
    s.ok("rows include bills and counter sales (all pages combined, checked on page 1 + seed)", rows.some((r) => r.lines.includes("Counter sale")) && rows.some((r) => /^PHI-/.test(r.first)), rows.map((r) => r.first));
    s.check("pinned total", foot.total, fmt(finalSum(fySales)));
    s.check("total count", foot.count, fySales.filter((r) => r.state === "FINAL").length);
    s.check("exclusion note", foot.note, exclusion(fySales));
    s.check("pager", foot.pager, `1–50 of ${fySales.length}`);
    s.check("entry date text per row", rows.map((r) => r.entry), sorted.slice(0, 50).map((r) => fmtEntry(r.entryAt)));
    s.check("bill date text per row", rows.map((r) => r.billDate), sorted.slice(0, 50).map((r) => fmtDay(r.billDay)));
    await scrollAll(page, "bottom");
    const atBottom = await footerBox(page);
    s.ok("footer inside viewport after scrolling to bottom", atBottom.inside, atBottom);
    const lastRow = await page.locator("table tbody tr").last().boundingBox();
    s.ok("last row not hidden behind footer", lastRow.y + lastRow.height <= atBottom.box.y + 1, { lastRowBottom: lastRow.y + lastRow.height, footerTop: atBottom.box.y });
    await s.shot(page, "01-default-fy-bottom");
    await scrollAll(page, "top");
    const atTop = await footerBox(page);
    s.ok("footer inside viewport at top", atTop.inside, atTop);
    await s.shot(page, "01-default-fy");
  });

  await scenario("02", "one-day-filter", async (s) => {
    const { page } = s.track(await open("pharmacist"));
    await goto(page, "/dashboard/pharmacy/sales");
    await setRange(page, "2026-10-15", "2026-10-15");
    const day = sales.filter((r) => r.billDay === "2026-10-15");
    const { rows, foot } = await snapshot(page);
    s.check("total", foot.total, fmt(finalSum(day)));
    s.check("final count", foot.count, day.filter((r) => r.state === "FINAL").length);
    s.check("excluded note", foot.note, exclusion(day));
    s.check("row keys (any order)", rows.map(rowKey).sort(), rowsOf(day).sort());
    s.check("pager", foot.pager, `1–${day.length} of ${day.length}`);
    s.note(`expected ${fmt(finalSum(day))} across ${day.length} rows incl ${day.filter((r) => r.state !== "FINAL").length} non-final`);
    await s.shot(page, "02-one-day");
  });

  await scenario("03", "sorting", async (s) => {
    const { page } = s.track(await open("pharmacist"));
    await goto(page, "/dashboard/pharmacy/sales");
    const th = page.locator("thead th");
    for (const [i, col] of COLUMNS.entries()) {
      for (const dir of ["asc", "desc"]) {
        await th.nth(i).getByRole("button").click();
        await settle(page);
        const sortAttrs = await th.evaluateAll((els) => els.map((e) => e.getAttribute("aria-sort")));
        s.check(`${col.name} ${dir}: aria-sort`, sortAttrs.slice(0, 7), COLUMNS.map((_, j) => (j === i ? (dir === "asc" ? "ascending" : "descending") : "none")));
        const rows = await readRows(page);
        const want = ordered(fySales, col.key, dir === "asc" ? 1 : -1);
        const wantKeys = rowsOf(want);
        const byKey = new Map(fySales.map((r) => [keyOf(r), r]));
        const present = rows.map(rowKey).filter((k) => byKey.get(k)[col.key] !== null && byKey.get(k)[col.key] !== undefined);
        s.check(`${col.name} ${dir}: non-empty values in expected order`, present, wantKeys.slice(0, present.length));
        const firstEmpty = rows.map(rowKey).findIndex((k) => byKey.get(k)[col.key] === null);
        s.note(`${col.name} ${dir}: first row ${rowKey(rows[0])}; first empty-valued row at index ${firstEmpty}`);
        if (col.key === "billNo" && dir === "asc") {
          s.check("PHI-2026-009 then PHI-2026-010 adjacent in order", [rows.findIndex((r) => r.first === "PHI-2026-010") - rows.findIndex((r) => r.first === "PHI-2026-009")], [1]);
          s.ok("no drafts on page 1 of Bill No asc", rows.every((r) => r.first !== "Draft"), rows.filter((r) => r.first === "Draft").length);
          await s.shot(page, "03-sort-billno-asc");
          await page.getByRole("button", { name: "Next page" }).click();
          await settle(page);
          const second = await readRows(page);
          const drafts = fySales.filter((r) => r.billNo === null).length;
          s.check("last rows of Bill No asc are the drafts", second.slice(-drafts).map((r) => r.first), Array(drafts).fill("Draft"));
          s.check("page 2 remaining non-draft keys in order", second.slice(0, second.length - drafts).map(rowKey), wantKeys.slice(50, wantKeys.length));
          await page.getByRole("button", { name: "Previous page" }).click();
          await settle(page);
        }
      }
    }
    await s.shot(page, "03-sort-amount-desc");
  });

  await scenario("04", "filters", async (s) => {
    const { page } = s.track(await open("pharmacist"));
    await goto(page, "/dashboard/pharmacy/sales");
    const expectView = (label, list, foot, rows) => {
      s.check(`${label}: total`, foot.total, fmt(finalSum(list)));
      s.check(`${label}: final count`, foot.count, list.filter((r) => r.state === "FINAL").length);
      s.check(`${label}: row keys`, rows.map(rowKey).sort(), rowsOf(list.slice(0, 50)).sort());
    };
    const byNewest = (list) => [...list].sort((a, b) => b.entryAt - a.entryAt);

    await paymentSelect(page).selectOption({ label: "UPI" });
    await settle(page);
    let { rows, foot } = await snapshot(page);
    const upi = byNewest(fySales.filter((r) => r.modes.includes("UPI")));
    expectView("UPI only", upi, foot, rows);
    s.ok("UPI only: every shown row has UPI badge", rows.every((r) => r.payments.includes("UPI")), rows.map((r) => r.payments));
    s.ok("UPI only: split bill present", upi.some((r) => r.modes.length > 1), "no split in seed");
    await s.shot(page, "04-filter-upi");
    await paymentSelect(page).selectOption({ label: "All" });
    await settle(page);

    await search(page, "Bill No", "PHI-2026-01");
    ({ rows, foot } = await snapshot(page));
    const bill01 = byNewest(fySales.filter((r) => r.billNo && r.billNo.toLowerCase().includes("phi-2026-01")));
    expectView("Bill No PHI-2026-01", bill01, foot, rows);
    await s.shot(page, "04-search-billno");

    await search(page, "Patient", "sharma");
    ({ rows, foot } = await snapshot(page));
    const sharma = byNewest(fySales.filter((r) => (r.patient ?? "").toLowerCase().includes("sharma")));
    expectView("Patient sharma", sharma, foot, rows);
    s.ok("Patient sharma includes counter sale customer", rows.some((r) => r.lines.includes("Counter sale")), rows.map((r) => r.first));

    await search(page, "Mobile", "98765");
    ({ rows, foot } = await snapshot(page));
    const mob = byNewest(fySales.filter((r) => digits(r.mobile).includes("98765")));
    expectView("Mobile 98765", mob, foot, rows);

    await search(page, "Mobile", "9876543210");
    ({ rows, foot } = await snapshot(page));
    const formatted = byNewest(fySales.filter((r) => digits(r.mobile).includes("9876543210")));
    expectView("Mobile 9876543210 matches '98765 43210' formatted", formatted, foot, rows);
    s.ok("seed has a formatted-number match", formatted.length > 0, formatted.length);

    await search(page, "Mobile", "");
    await settle(page);

    await openMore(page);
    await selectByLabel(page, "State").selectOption({ label: "Draft" });
    await settle(page);
    s.check("badge after State", await moreCount(page), 1);
    ({ rows, foot } = await snapshot(page));
    expectView("State=Draft", byNewest(fySales.filter((r) => r.state === "DRAFT")), foot, rows);
    await selectByLabel(page, "Source").selectOption({ label: "Counter sales" });
    await settle(page);
    s.check("badge after Source", await moreCount(page), 2);
    ({ rows, foot } = await snapshot(page));
    expectView("Draft + Counter", byNewest(fySales.filter((r) => r.state === "DRAFT" && r.source === "counter")), foot, rows);
    await selectByLabel(page, "Entry by").selectOption({ label: "Anil Deshmukh" });
    await settle(page);
    s.check("badge after Entry by", await moreCount(page), 3);
    ({ rows, foot } = await snapshot(page));
    expectView("Draft + Counter + Anil", byNewest(fySales.filter((r) => r.state === "DRAFT" && r.source === "counter" && r.entryBy === "Anil Deshmukh")), foot, rows);
    await s.shot(page, "04-more-filters-3");
    await selectByLabel(page, "State").selectOption({ label: "Final" });
    await selectByLabel(page, "Entry by").selectOption({ label: "Priya Menon" });
    await settle(page);
    ({ rows, foot } = await snapshot(page));
    expectView("Final + Counter + Priya", byNewest(fySales.filter((r) => r.state === "FINAL" && r.source === "counter" && r.entryBy === "Priya Menon")), foot, rows);
    const entryOptions = await selectByLabel(page, "Entry by").locator("option").allInnerTexts();
    s.check("Entry by options", entryOptions.slice().sort(), ["Anyone", "Anil Deshmukh", "Priya Menon", "Rajesh Iyer", "Sunita Patil"].sort());

    await paymentSelect(page).selectOption({ label: "Cash" });
    await page.getByRole("searchbox").fill("yusuf");
    await selectByLabel(page, "Search by").selectOption({ label: "Patient" });
    await settle(page);
    s.check("badge before clear", await moreCount(page), 3);
    await page.getByRole("button", { name: /Clear all/ }).click();
    await settle(page);
    ({ rows, foot } = await snapshot(page));
    s.check("Clear all: badge", await moreCount(page), 0);
    s.check("Clear all: search box empty", await page.getByRole("searchbox").inputValue(), "");
    s.check("Clear all: payment type", await paymentSelect(page).inputValue(), "");
    s.check("Clear all: total restored", foot.total, fmt(finalSum(fySales)));
    s.check("Clear all: rows restored", rows.length, 50);
    s.ok("Clear all button hidden afterwards", (await page.getByRole("button", { name: /Clear all/ }).count()) === 0);
    await s.shot(page, "04-clear-all");

    await selectByLabel(page, "Period").selectOption({ label: "Last financial year" });
    await settle(page);
    ({ rows, foot } = await snapshot(page));
    const prev = byNewest(sales.filter((r) => inRange(r, "2025-04-01", "2026-03-31")));
    expectView("Last financial year preset", prev, foot, rows);
    s.check("Last FY From/To", [await page.getByLabel("From", { exact: true }).inputValue(), await page.getByLabel("To", { exact: true }).inputValue()], ["2025-04-01", "2026-03-31"]);
    s.ok("IST boundary: 31 Mar 23:00 IST bill is in previous FY, 01 Apr 00:30 IST bill is not", rows.some((r) => r.first === "PHI-2025-045") && !rows.some((r) => r.first === "PHI-2026-071"), rows.map((r) => r.first));
    await s.shot(page, "04-last-fy");
  });

  await scenario("05", "draft-and-cancelled-rows", async (s) => {
    const { page } = s.track(await open("pharmacist"));
    await goto(page, "/dashboard/pharmacy/sales");
    await openMore(page);
    await selectByLabel(page, "State").selectOption({ label: "Draft" });
    await settle(page);
    let { rows, foot } = await snapshot(page);
    const drafts = fySales.filter((r) => r.state === "DRAFT");
    s.check("draft rows count", rows.length, drafts.length);
    s.ok("draft bill cell shows only the Draft badge", rows.every((r) => r.first === "Draft" && !r.lines.some((l) => /PHI-2026|CS-2026/.test(l))), rows.map((r) => r.lines));
    const bodyText = await page.locator("tbody").innerText();
    s.ok("draft invoice numbers are not displayed anywhere", !drafts.some((d) => bodyText.includes(d.invoiceNumber)), drafts.map((d) => d.invoiceNumber));
    const badge = await page.locator("tbody tr").first().locator("td").first().locator("span").first();
    s.check("badge text", (await badge.innerText()).trim(), "Draft");
    s.check("drafts total is 0", foot.total, fmt(0));
    s.check("drafts excluded note", foot.note, exclusion(drafts));
    await s.shot(page, "05-drafts");
    await selectByLabel(page, "State").selectOption({ label: "Cancelled" });
    await settle(page);
    ({ rows, foot } = await snapshot(page));
    const cancelled = fySales.filter((r) => r.state === "CANCELLED");
    s.check("cancelled keys", rows.map(rowKey).sort(), rowsOf(cancelled).sort());
    s.ok("each cancelled row shows Cancelled badge and bill number", rows.every((r) => r.lines.includes("Cancelled") && /^(PHI|CS)-/.test(r.first)), rows.map((r) => r.lines));
    s.check("cancelled total", foot.total, fmt(0));
    s.check("cancelled note", foot.note, exclusion(cancelled));
    await s.shot(page, "05-cancelled");
    await page.getByRole("button", { name: /Clear all/ }).click();
    await settle(page);
    await search(page, "Bill No", "PHI-2026-031");
    ({ rows, foot } = await snapshot(page));
    s.check("cancelled bill found in default view", rows.map((r) => r.first), ["PHI-2026-031"]);
    s.check("its amount is shown but total excludes it", [rows[0].amount, foot.total, foot.count], [fmt(sales.find((r) => r.billNo === "PHI-2026-031").cents), fmt(0), 0]);
  });

  await scenario("06", "row-actions", async (s) => {
    const { page, context } = s.track(await open("pharmacist"));
    await goto(page, "/dashboard/pharmacy/sales");
    const bill = sales.find((r) => r.billNo === "PHI-2026-056");
    await search(page, "Bill No", bill.billNo);
    let rows = await readRows(page);
    s.check("one row", rows.length, 1);
    const wa = new URL(rows[0].waHref);
    s.check("wa origin+path", [wa.origin, wa.pathname], ["https://wa.me", `/91${digits(bill.mobile).slice(-10)}`]);
    const text = wa.searchParams.get("text");
    s.ok("wa text has bill number", text.includes(bill.billNo), text);
    s.ok("wa text has amount", text.includes(fmt(bill.cents)), text);
    s.ok("wa text has bill date and clinic", text.includes(fmtDay(bill.billDay)) && text.includes(data.clinicName), text);
    s.check("wa link opens in new tab", await page.locator(`a[href^="https://wa.me/"]`).first().evaluate((a) => [a.target, a.rel]), ["_blank", "noopener noreferrer"]);

    await search(page, "Patient", "Anjali");
    rows = await readRows(page);
    const formattedPhone = rows.find((r) => r.mobile === "98765 43210");
    s.ok("a formatted-phone row exists", formattedPhone, rows.map((r) => r.mobile));
    if (formattedPhone) s.check("formatted phone '98765 43210' -> wa path", new URL(formattedPhone.waHref).pathname, "/919876543210");
    await search(page, "Patient", "Meera");
    rows = await readRows(page);
    const plus = rows.find((r) => r.mobile === "+91-9822012345");
    if (plus) s.check("'+91-9822012345' -> no double country code", new URL(plus.waHref).pathname, "/919822012345");
    await search(page, "Patient", "Kavita");
    rows = await readRows(page);
    const zero = rows.find((r) => r.mobile === "09890123456");
    if (zero) s.check("'09890123456' -> wa path", new URL(zero.waHref).pathname, "/919890123456");

    const noPhone = sales.find((r) => r.billNo === "PHI-2026-038");
    await search(page, "Bill No", noPhone.billNo);
    rows = await readRows(page);
    s.check("no-phone row mobile cell", rows[0].mobile, "—");
    s.check("no-phone WhatsApp disabled", [rows[0].waTag, rows[0].waDisabled, rows[0].waHref], ["BUTTON", "true", null]);
    const waBtn = page.locator("tbody tr").first().locator('button[aria-label*="WhatsApp"]');
    await page.locator("tbody tr").first().locator('button[aria-label^="Print"]').focus();
    await page.keyboard.press("Tab");
    await page.waitForTimeout(700);
    const focusedIsWa = await page.evaluate(() => /WhatsApp/.test(document.activeElement?.getAttribute("aria-label") || ""));
    const tip = await page.locator('[role="tooltip"]').first().innerText().catch(() => null);
    s.check("keyboard Tab reaches the disabled WhatsApp button", focusedIsWa, true);
    s.note(`after Tab: ${JSON.stringify(await page.evaluate(() => ({ active: document.activeElement?.getAttribute("aria-label"), focusVisible: document.activeElement?.matches(":focus-visible"), describedby: document.activeElement?.getAttribute("aria-describedby"), poppers: [...document.querySelectorAll("[data-radix-popper-content-wrapper]")].map((e) => e.textContent) })))}`);
    s.check("disabled WhatsApp exposes reason on keyboard focus (tooltip)", tip && tip.trim(), "No mobile number");
    await page.locator("body").click({ position: { x: 700, y: 120 } });
    await page.waitForTimeout(300);
    await waBtn.hover();
    await page.waitForTimeout(700);
    const hoverTip = await page.locator('[role="tooltip"]').first().innerText().catch(() => null);
    s.check("disabled WhatsApp shows reason on mouse hover (tooltip)", hoverTip && hoverTip.trim(), "No mobile number");
    const described = await waBtn.getAttribute("aria-describedby");
    s.ok("disabled WhatsApp button is described by the reason (aria-describedby)", Boolean(described), { ariaLabel: rows[0].waLabel, ariaDescribedby: described });
    await s.shot(page, "06-whatsapp-disabled-nophone");

    await openMore(page);
    await selectByLabel(page, "State").selectOption({ label: "Draft" });
    await search(page, "Bill No", "");
    rows = await readRows(page);
    s.ok("draft rows: WhatsApp disabled", rows.length > 0 && rows.every((r) => r.waDisabled === "true" && !r.waHref), rows.map((r) => [r.waTag, r.waDisabled]));
    await page.locator("tbody tr").first().locator('button[aria-label*="WhatsApp"]').hover();
    await page.waitForTimeout(700);
    s.check("draft reason tooltip on hover", (await page.locator('[role="tooltip"]').first().innerText().catch(() => "")).trim(), "Finish this draft before sending it");
    await page.getByRole("button", { name: /Clear all/ }).click();
    await settle(page);

    await search(page, "Bill No", bill.billNo);
    const popupPromise = context.waitForEvent("page", { timeout: 30000 });
    await page.getByRole("button", { name: `Print ${bill.billNo}` }).click();
    const popup = await popupPromise;
    await popup.waitForFunction((n) => document.body && document.body.innerText.includes(n), bill.billNo, { timeout: 30000 });
    s.ok("print popup shows bill number", true);
    s.ok("print popup shows patient and amount", (await popup.locator("body").innerText()).includes(bill.patient), (await popup.locator("body").innerText()).slice(0, 200));
    await popup.waitForTimeout(500);
    s.check("window.print called in popup", await popup.evaluate(() => window.__printCalls).catch(() => null), 1);
    await s.shot(popup, "06-print-popup");
    await popup.close();
    s.ok("main page URL is still the sales register", page.url().includes("/dashboard/pharmacy/sales"), page.url());

    await search(page, "Bill No", "CS-2026-005");
    rows = await readRows(page);
    s.check("counter-sale print disabled", [rows[0].printDisabled], ["true"]);
    await s.shot(page, "06-row-actions");
  });

  await scenario("07", "entry-by", async (s) => {
    const { page } = s.track(await open("pharmacist"));
    await goto(page, "/dashboard/pharmacy/sales");
    const seen = new Map();
    for (let p = 1; p <= 2; p++) {
      for (const r of await readRows(page)) seen.set(rowKey(r), r.entryBy);
      if (p === 1) {
        await page.getByRole("button", { name: "Next page" }).click();
        await settle(page);
      }
    }
    s.check("rows seen", seen.size, fySales.length);
    const wrong = fySales.filter((r) => seen.get(keyOf(r)) !== (r.entryBy ?? "—")).map((r) => [r.invoiceNumber, seen.get(keyOf(r)), r.entryBy ?? "—"]);
    s.check("every row's Entry By matches creator/fallback", wrong, []);
    const pick = (n) => seen.get(keyOf(sales.find((r) => r.invoiceNumber === `PHI-2026-${String(n).padStart(3, "0")}`)));
    s.check("normal bill -> Anil Deshmukh", pick(1), "Anil Deshmukh");
    s.check("legacy bill 004 (stock tx by doctor) -> Priya Menon", pick(4), "Priya Menon");
    s.check("legacy bill 012 (two stock tx, first by doctor) -> Priya Menon", pick(12), "Priya Menon");
    s.check("bill 008 createdById reception beats stock tx doctor -> Sunita Patil", pick(8), "Sunita Patil");
    s.check("legacy bill 066 with no trace -> —", pick(66), "—");
    await openMore(page);
    await selectByLabel(page, "Entry by").selectOption({ label: "Priya Menon" });
    await settle(page);
    const priya = fySales.filter((r) => r.entryBy === "Priya Menon");
    const { rows, foot } = await snapshot(page);
    s.check("Entry by filter includes legacy fallback bills", rows.map(rowKey).sort(), rowsOf(priya).sort());
    s.check("Entry by Priya total", foot.total, fmt(finalSum(priya)));
    await s.shot(page, "07-entry-by-priya");
  });

  await scenario("08", "returns-tab", async (s) => {
    const { page } = s.track(await open("pharmacist"));
    await goto(page, "/dashboard/pharmacy/sales?tab=returns");
    s.check("Returns tab selected via URL", await page.getByRole("tab", { name: "Returns" }).getAttribute("aria-selected"), "true");
    let { rows, foot } = await snapshot(page);
    const newest = [...fyReturns].sort((a, b) => b.entryAt - a.entryAt);
    s.check("return rows", rows.map(rowKey), rowsOf(newest));
    s.check("linked bill numbers shown", rows.map((r) => r.lines.find((l) => l.startsWith("Against")) ?? null), newest.map((r) => (r.linked ? `Against ${r.linked}` : null)));
    s.check("return total", foot.total, fmt(finalSum(fyReturns)));
    s.check("return count unit", [foot.count, foot.unit], [fyReturns.filter((r) => r.state === "FINAL").length, "returns"]);
    s.check("excluded note", foot.note, exclusion(fyReturns));
    s.check("column headers", await page.locator("thead th").allInnerTexts().then((a) => a.map((x) => x.trim())), ["Bill No", "Entry Date", "Bill Date", "Entry By", "Patient", "Mobile", "Amount", "Refund", "Actions"]);
    await s.shot(page, "08-returns-default");

    await paymentSelect(page, "Refund type").selectOption({ label: "UPI" });
    await settle(page);
    ({ rows, foot } = await snapshot(page));
    const upi = newest.filter((r) => r.modes.includes("UPI"));
    s.check("Refund type UPI rows", rows.map(rowKey), rowsOf(upi));
    s.check("Refund type UPI total", foot.total, fmt(finalSum(upi)));
    await paymentSelect(page, "Refund type").selectOption({ label: "All" });
    await settle(page);

    await page.locator("thead th").nth(0).getByRole("button").click();
    await settle(page);
    rows = await readRows(page);
    const asc = ordered(fyReturns, "billNo", 1);
    s.check("sort Bill No asc: non-draft in order, draft last", rows.map(rowKey), [...rowsOf(asc), ...rowsOf(fyReturns.filter((r) => r.billNo === null))]);
    s.check("aria-sort on Bill No", await page.locator("thead th").nth(0).getAttribute("aria-sort"), "ascending");
    await page.locator("thead th").nth(6).getByRole("button").click();
    await page.locator("thead th").nth(6).getByRole("button").click();
    await settle(page);
    rows = await readRows(page);
    s.check("sort Amount desc order", rows.map(rowKey), rowsOf(ordered(fyReturns, "cents", -1)));

    await search(page, "Patient", "sharma");
    ({ rows, foot } = await snapshot(page));
    const sharma = fyReturns.filter((r) => (r.patient ?? "").toLowerCase().includes("sharma"));
    s.check("patient search in returns", [rows.map((r) => r.first).sort(), foot.total], [sharma.map((r) => r.billNo).sort(), fmt(finalSum(sharma))]);
    await page.getByRole("button", { name: /Clear all/ }).click();
    await settle(page);

    await page.getByRole("button", { name: "New return" }).click();
    await page.waitForURL("**/dashboard/inventory**", { timeout: 120000 });
    const target = new URL(page.url());
    s.check("+ New goes to the new return flow", [target.pathname, target.searchParams.get("area"), target.searchParams.get("view"), target.searchParams.has("new")], ["/dashboard/inventory", "sales", "SALES_RETURN", true]);
    await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(1500);
    s.note(`new-return page text sample: ${(await page.locator("main").first().innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 220)}`);
    await s.shot(page, "08-new-return-flow");

    await goto(page, "/dashboard/pharmacy/sales");
    await page.getByRole("tab", { name: "Returns" }).click();
    await page.waitForFunction(() => location.search.includes("tab=returns"), null, { timeout: 30000 });
    await settle(page);
    rows = await readRows(page);
    s.check("tab control shows returns", rows.map((r) => r.first).sort(), fyReturns.map((r) => r.billNo ?? "Draft").sort());
    s.check("tab control keeps tab in URL", new URL(page.url()).searchParams.get("tab"), "returns");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("table").first().waitFor();
    await settle(page);
    s.check("reload keeps Returns tab", await page.getByRole("tab", { name: "Returns" }).getAttribute("aria-selected"), "true");

    await setRange(page, "2026-04-01", "2026-04-02");
    const empty = await page.locator("tbody").innerText();
    s.ok("empty state message shown", /No returns match your search/.test(empty), empty);
    s.ok("empty state is not a spinner/skeleton", (await page.locator('[aria-busy="true"]').count()) === 0 && (await page.locator("tbody tr").count()) === 1, empty);
    s.check("empty total", (await footer(page)).total, fmt(0));
    await s.shot(page, "08-returns-empty");
  });

  await scenario("09", "pagination", async (s) => {
    const { page } = s.track(await open("pharmacist"));
    await goto(page, "/dashboard/pharmacy/sales");
    const order = [...fySales].sort((a, b) => b.entryAt - a.entryAt);
    const first = await footer(page);
    s.ok("more than 50 rows seeded", fySales.length > 50, fySales.length);
    s.check("Previous disabled on page 1", await page.getByRole("button", { name: "Previous page" }).isDisabled(), true);
    await page.getByRole("button", { name: "Next page" }).click();
    await settle(page);
    const rows = await readRows(page);
    const foot = await footer(page);
    s.check("page 2 rows", rows.map(rowKey), rowsOf(order.slice(50)));
    s.check("page 2 pager", foot.pager, `51–${fySales.length} of ${fySales.length}`);
    s.check("total unchanged on page 2", [foot.total, foot.count, foot.note], [first.total, first.count, first.note]);
    s.check("total is full-filter total", foot.total, fmt(finalSum(fySales)));
    s.check("Next disabled on last page", await page.getByRole("button", { name: "Next page" }).isDisabled(), true);
    await s.shot(page, "09-page-2");
    await page.getByRole("button", { name: "Previous page" }).click();
    await settle(page);
    s.check("back to page 1 pager", (await footer(page)).pager, `1–50 of ${fySales.length}`);
    await page.getByRole("button", { name: "Next page" }).click();
    await settle(page);
    await page.getByRole("searchbox").fill("PHI-2026-05");
    await settle(page);
    const narrowed = await footer(page);
    s.ok("search from page 2 resets to page 1 (not blank)", /^1–\d+ of \d+$/.test(narrowed.pager ?? ""), narrowed);
  });

  await scenario("10", "mobile-390", async (s) => {
    const { page } = s.track(await open("pharmacist", { width: 390, height: 844 }));
    await goto(page, "/dashboard/pharmacy/sales");
    const dims = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, bodySw: document.body.scrollWidth }));
    s.ok("no page-level horizontal overflow", dims.sw <= dims.iw + 1, dims);
    const container = await page.evaluate(() => {
      for (let el = document.querySelector("table").parentElement; el; el = el.parentElement) {
        const o = getComputedStyle(el).overflowX;
        if (o !== "visible" && el.scrollWidth > el.clientWidth + 1) return { tag: el.tagName, cls: String(el.className).slice(0, 60), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
      }
      return null;
    });
    s.ok("table scrolls inside its own container", container, container);
    await scrollAll(page, "bottom");
    const fb = await footerBox(page);
    s.ok("pinned total visible in viewport", fb.inside, fb);
    s.check("mobile total correct", (await footer(page)).total, fmt(finalSum(fySales)));
    const sticky = await page.evaluate(() => {
      const cell = document.querySelector("tbody tr td");
      return getComputedStyle(cell).position;
    });
    s.check("Bill No cell is sticky-left", sticky, "sticky");
    await scrollAll(page, "top");
    await s.shot(page, "10-mobile-top");
    const controls = await page.evaluate(() => [...document.querySelectorAll("main button, main select, main input")].filter((e) => e.offsetParent && !e.closest("table")).map((e) => { const b = e.getBoundingClientRect(); return { n: e.getAttribute("aria-label") || e.innerText.trim().slice(0, 20) || e.type, l: Math.round(b.left), r: Math.round(b.right), w: Math.round(b.width), h: Math.round(b.height) }; }));
    s.ok("filter controls fit inside 390px", controls.every((c) => c.l >= 0 && c.r <= 391), controls.filter((c) => c.l < 0 || c.r > 391));
    s.ok("filter controls at least 40px tall", controls.every((c) => c.h >= 40 || c.n === "search"), controls.filter((c) => c.h < 40));
    await search(page, "Patient", "Meera");
    const rows = await readRows(page);
    s.ok("search works on mobile", rows.length > 0 && rows.every((r) => r.patient.includes("Meera")), rows.map((r) => r.patient));
    await openMore(page);
    await selectByLabel(page, "State").selectOption({ label: "Final" });
    await settle(page);
    s.check("More filters badge on mobile", await moreCount(page), 1);
    const after = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    s.ok("still no overflow with More filters open", after);
    await s.shot(page, "10-mobile-filtered");
    await page.getByRole("button", { name: /Clear all/ }).click();
    await settle(page);
    await page.evaluate(() => { const c = document.querySelector("table").closest("div[class*='overflow']"); if (c) c.scrollLeft = 400; });
    await page.waitForTimeout(250);
    await s.shot(page, "10-mobile-table-scrolled-x");
    const cellBox = await page.locator("tbody tr td").first().boundingBox();
    s.ok("Bill No stays pinned at left while table scrolled sideways", cellBox && cellBox.x >= 0 && cellBox.x < 60, cellBox);
  });

  await scenario("11", "roles", async (s) => {
    for (const role of ["doctor", "owner"]) {
      const { page } = s.track(await open(role));
      await page.goto(`${stack.base}/dashboard`, { waitUntil: "domcontentloaded", timeout: 240000 });
      await page.getByText(stack.users[role].firstName, { exact: false }).first().waitFor({ timeout: 120000 });
      const link = await sidebarSales(page).count();
      s.ok(`${role}: Sales entry in sidebar`, link > 0, link);
      if (link) {
        await sidebarSales(page).first().click();
        await page.waitForURL("**/dashboard/pharmacy/sales**", { timeout: 240000 });
      } else await page.goto(`${stack.base}/dashboard/pharmacy/sales`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1500);
      await page.locator("table").first().waitFor({ timeout: 90000 }).catch(() => {});
      const hasTable = await page.locator("table").count();
      if (hasTable) {
        await settle(page).catch(() => {});
        const foot = await footer(page).catch(() => ({}));
        s.check(`${role}: total`, foot.total, fmt(finalSum(fySales)));
      } else s.note(`${role}: no table; body: ${(await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 200)}`);
      const alert = (await page.locator('[role="alert"]').allInnerTexts()).filter((t) => t.trim());
      s.check(`${role}: no error alert`, alert, []);
      await s.shot(page, `11-${role}`);
    }
    const { page } = s.track(await open("reception"));
    await page.goto(`${stack.base}/dashboard`, { waitUntil: "domcontentloaded", timeout: 240000 });
    await page.getByText("Sunita", { exact: false }).first().waitFor({ timeout: 120000 });
    s.check("reception: no Sales sidebar entry", await sidebarSales(page).count(), 0);
    await page.goto(`${stack.base}/dashboard/pharmacy/sales`, { waitUntil: "domcontentloaded", timeout: 240000 });
    await page.waitForTimeout(4000);
    const overlay = await page.locator("nextjs-portal").locator("[data-nextjs-dialog]").count();
    s.check("reception direct visit: no Next error overlay", overlay, 0);
    const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    s.note(`reception direct visit -> url ${page.url()}; tables=${await page.locator("table").count()}; alerts=${JSON.stringify((await page.locator('[role="alert"]').allInnerTexts()).filter((t) => t.trim()))}; body: ${body.slice(0, 260)}`);
    await s.shot(page, "11-reception-direct");
  });

  await scenario("12", "regression-vs-trunk", async (s) => {
    let trunk = "present";
    try {
      execFileSync("git", ["show", "5d1827f:frontend/src/app/dashboard/pharmacy/sales/page.tsx"], { cwd: root, stdio: "pipe" });
    } catch (e) {
      trunk = "missing";
    }
    s.check("trunk 5d1827f has no pharmacy/sales page", trunk, "missing");
    const { page, context } = s.track(await open("pharmacist"));
    await page.goto(`${stack.base}/dashboard/pharmacy/invoices`, { waitUntil: "domcontentloaded", timeout: 240000 });
    await page.getByText("PHI-2026-072").first().waitFor({ timeout: 180000 });
    s.ok("old invoices list loads and shows today's bill", true);
    await s.shot(page, "12-old-invoices-list");
    let popupPromise = context.waitForEvent("page", { timeout: 30000 });
    await page.locator('button[title="View Invoice"]').first().click();
    let popup = await popupPromise;
    await popup.waitForFunction(() => document.body && document.body.innerText.includes("PHI-2026-072"), null, { timeout: 30000 });
    s.ok("View Invoice popup renders bill", true);
    await popup.close();
    popupPromise = context.waitForEvent("page", { timeout: 30000 });
    await page.locator('button[title="Download Invoice"]').first().click();
    popup = await popupPromise;
    await popup.waitForFunction(() => document.body && document.body.innerText.includes("PHI-2026-072"), null, { timeout: 30000 });
    await popup.waitForTimeout(1200);
    s.check("Download Invoice triggers window.print in popup", await popup.evaluate(() => window.__printCalls).catch(() => null), 1);
    await popup.close();
  });

  const resultsFile = path.join(out, process.env.ONLY ? `results-${process.env.ONLY.replace(/,/g, "_")}.json` : "results.json");
  fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
  console.log("\nSUMMARY");
  for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.scenario}  console-errors=${r.consoleErrors.length}`);
  await browser.close();
  await stack.stop();
  process.exitCode = results.every((r) => r.pass) ? 0 : 1;
})().catch((e) => {
  console.error("CR24 HARNESS ERROR", e);
  process.exit(2);
});
