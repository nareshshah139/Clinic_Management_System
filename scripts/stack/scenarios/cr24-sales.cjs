const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
const { bootStack } = require("../boot.cjs");
const { seed } = require("./cr24-seed.cjs");

const root = path.resolve(__dirname, "../../..");
const out = path.join(root, "output/stack/cr24");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MODE_LABEL = { CASH: "Cash", UPI: "UPI", CARD: "Card", NETBANKING: "Net banking", WALLET: "Wallet", INSURANCE: "Insurance", CREDIT: "Credit", OTHER: "Other" };
const COLUMNS = [
  { name: "Bill No", key: "billNo" },
  { name: "Entry Date", key: "entryAt" },
  { name: "Bill Date", key: "billDay" },
  { name: "Entry By", key: "entryBy" },
  { name: "Patient", key: "patient" },
  { name: "Mobile", key: "mobile" },
  { name: "Bill Amount", key: "cents" },
];
const DESC_FIRST = new Set(["entryAt", "billDay", "cents"]);
const SALES_HEADERS = ["Bill No", "Entry Date", "Bill Date", "Entry By", "Patient", "Mobile", "Bill Amount", "Payment", "Actions"];
const RETURN_HEADERS = ["Bill No", "Against bill", "Entry Date", "Bill Date", "Entry By", "Patient", "Mobile", "Amount", "Refund", "Actions"];

const clean = (s) => s.replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();
const fmt = (cents) => {
  const rupees = String(Math.floor(cents / 100));
  const head = rupees.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `₹${head ? `${head},` : ""}${rupees.slice(-3)}.${String(cents % 100).padStart(2, "0")}`;
};
const fmtDay = (day) => `${day.slice(8)} ${MONTHS[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}`;
const display = (day) => `${day.slice(8)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;
const undisplay = (text) => `${text.slice(6)}-${text.slice(3, 5)}-${text.slice(0, 2)}`;
const fmtEntry = (ms, year) => {
  const d = new Date(ms + 19800000);
  const h = d.getUTCHours();
  const clock = `${String(h % 12 || 12).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
  const day = d.toISOString().slice(0, 10);
  const date = `${day.slice(8)} ${MONTHS[Number(day.slice(5, 7)) - 1]}`;
  return `${String(d.getUTCFullYear()) === year ? date : `${date} ${d.getUTCFullYear()}`}, ${clock}`;
};
const shortName = (name) => {
  const [first, ...rest] = name.trim().split(/\s+/);
  const last = rest.at(-1);
  return last ? `${first} ${last[0]}.` : first;
};
const localMobile = (mobile) => {
  let d = (mobile ?? "").replace(/\D/g, "");
  if (d.startsWith("0091")) d = d.slice(4);
  else if (d.length >= 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.startsWith("0")) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
};
const displayMobile = (mobile) => {
  const local = localMobile(mobile);
  return local ? `${local.slice(0, 5)} ${local.slice(5)}` : mobile || "—";
};
const mobileDigits = (value) => {
  const d = value.replace(/\D/g, "");
  const local = d.length >= 12 && d.startsWith("0091") ? d.slice(4) : d.length >= 12 && d.startsWith("91") ? d.slice(2) : d.startsWith("0") ? d.slice(1) : d;
  return local.slice(-10);
};
const collator = new Intl.Collator("en-IN", { numeric: true, sensitivity: "base" });
const compare = (a, b) => (typeof a === "number" && typeof b === "number" ? a - b : collator.compare(String(a), String(b)));
const ordered = (rows, key, dir) =>
  rows.filter((r) => r[key] !== null && r[key] !== undefined).sort((a, b) => dir * compare(a[key], b[key]) || dir * (a.entryAt - b.entryAt));
const keyOf = (r) => `${r.billNo ?? "Draft"}|${r.patient ?? "—"}|${fmt(r.cents)}`;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const exclusion = (rows) => {
  const drafts = rows.filter((r) => r.state === "DRAFT").length;
  const cancelled = rows.filter((r) => r.state === "CANCELLED").length;
  const parts = [drafts && plural(drafts, "draft", "drafts"), cancelled && `${cancelled} cancelled`].filter(Boolean);
  return parts.length ? `${parts.join(" and ")} not included` : null;
};
const finals = (rows) => rows.filter((r) => r.state === "FINAL");
const finalSum = (rows) => finals(rows).reduce((s, r) => s + r.cents, 0);
const collectedBy = (rows, mode) =>
  finals(rows).reduce((s, r) => s + (mode === "CREDIT" ? r.due : r.payments.filter((p) => p.mode === mode).reduce((a, p) => a + p.cents, 0)), 0);
const withMode = (rows, mode) => rows.filter((r) => (mode === "CREDIT" ? r.due > 0 : r.modes.includes(mode)));
const paymentCell = (r) => {
  const cells = [...(r.due > 0 ? [`Due ${fmt(r.due)}`] : []), ...r.modes.map((m) => MODE_LABEL[m])];
  return cells.length ? cells : ["—"];
};
const billLines = (r) => [
  r.billNo ?? "Draft",
  ...(r.state === "DRAFT" && r.reserved ? [`${r.reserved} not final`] : []),
  ...(r.source === "counter" ? ["Counter sale"] : []),
  ...(r.state === "CANCELLED" ? ["Cancelled"] : []),
];
const rowKey = (r) => `${r.first}|${r.patient}|${r.amount}`;
const newest = (rows) => [...rows].sort((a, b) => b.entryAt - a.entryAt);

let sink = [];
const watch = (page) => {
  page.on("pageerror", (e) => sink.push({ type: "pageerror", text: e.message.slice(0, 300) }));
  page.on("console", (m) => m.type() === "error" && sink.push({ type: "console", text: m.text().slice(0, 300) }));
};

const vis = (page) => page.locator('[role="tabpanel"]:visible');

async function settle(page) {
  await page.waitForTimeout(550);
  await page.waitForFunction(
    () => {
      const panel = [...document.querySelectorAll('[role="tabpanel"]')].find((p) => !p.hidden && p.getClientRects().length);
      if (!panel) return false;
      const busy = panel.querySelector("[aria-busy]");
      const status = panel.querySelector('[role="status"][aria-live="polite"]');
      return busy?.getAttribute("aria-busy") === "false" && (/₹/.test(status?.innerText || "") || Boolean(panel.querySelector('[role="alert"]')));
    },
    null,
    { timeout: 90000 },
  );
  await page.waitForTimeout(150);
}

const readRows = (page) =>
  vis(page).locator("table").first().evaluate((table) => {
    const norm = (s) => s.replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();
    const lines = (el) => el.innerText.split("\n").map((s) => s.replace(/[  ]/g, " ").trim()).filter(Boolean);
    const heads = [...table.querySelectorAll("thead th")].map((th) => norm(th.innerText));
    const at = (name) => heads.indexOf(name);
    const amountAt = heads.findIndex((h) => /Amount$/.test(h));
    const paymentAt = heads.findIndex((h) => h === "Payment" || h === "Refund");
    return [...table.querySelectorAll("tbody tr")].map((tr) => {
      const tds = [...tr.children];
      if (tds.length < heads.length) return { empty: norm(tr.innerText) };
      const actions = [...tds[tds.length - 1].querySelectorAll("button, a")];
      const describe = (b) =>
        b && {
          label: b.getAttribute("aria-label"),
          disabled: b.getAttribute("aria-disabled"),
          tag: b.tagName,
          href: b.getAttribute("href"),
          tabindex: b.getAttribute("tabindex"),
          reason: b.getAttribute("aria-describedby") ? document.getElementById(b.getAttribute("aria-describedby"))?.textContent ?? null : null,
        };
      const entryBy = tds[at("Entry By")];
      const bill = lines(tds[0]);
      return {
        first: bill[0],
        lines: bill,
        against: at("Against bill") >= 0 ? lines(tds[at("Against bill")]) : null,
        entry: norm(tds[at("Entry Date")].innerText),
        billDate: norm(tds[at("Bill Date")].innerText),
        entryByText: norm(entryBy.innerText),
        entryByTitle: entryBy.querySelector("[title]")?.getAttribute("title") ?? null,
        patient: norm(tds[at("Patient")].innerText),
        mobile: norm(tds[at("Mobile")].innerText),
        amount: norm(tds[amountAt].innerText),
        payments: lines(tds[paymentAt]),
        print: describe(actions.find((b) => /^Print/.test(b.getAttribute("aria-label") || ""))),
        wa: describe(actions.find((b) => /WhatsApp/.test(b.getAttribute("aria-label") || ""))),
      };
    });
  });

async function footer(page) {
  const status = vis(page).locator('[role="status"][aria-live="polite"]').first();
  const lines = (await status.innerText()).split("\n").map(clean).filter(Boolean);
  const m = (lines[0] ?? "").match(/^(.*?) (₹[\d,]+\.\d{2}) · (\d+) (\w+)$/);
  const pager = await vis(page).locator('nav[aria-label$="pages"] span').first().innerText().catch(() => null);
  return { label: m?.[1], total: m?.[2], count: m && Number(m[3]), unit: m?.[4], note: lines[1] ?? null, pager: pager && clean(pager), raw: lines.join(" | ") };
}

async function scrollAll(page, to) {
  await page.evaluate((target) => {
    const table = [...document.querySelectorAll("table")].find((t) => t.getClientRects().length);
    for (let el = table; el; el = el.parentElement) {
      if (el.scrollHeight > el.clientHeight + 1 && getComputedStyle(el).overflowY !== "visible") el.scrollTop = target === "bottom" ? el.scrollHeight : 0;
    }
    window.scrollTo(0, target === "bottom" ? document.documentElement.scrollHeight : 0);
  }, to);
  await page.waitForTimeout(250);
}

const footerBox = async (page) => {
  const el = vis(page).locator('[role="status"][aria-live="polite"]').first().locator('xpath=ancestor::div[contains(@class,"sticky")][1]');
  const box = await el.boundingBox();
  const vh = await page.evaluate(() => window.innerHeight);
  return { box, vh, gap: box ? Math.round(vh - (box.y + box.height)) : null, inside: Boolean(box) && box.y >= -1 && box.y + box.height <= vh + 1 };
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
  const thisYear = data.today.slice(0, 4);
  const clinic = data.clinic;
  const FY = { from: "2026-04-01", to: "2027-03-31" };
  const inRange = (r, from, to) => r.billDay >= from && r.billDay <= to;
  const sales = all.filter((r) => r.register === "sales");
  const returns = all.filter((r) => r.register === "returns");
  const fySales = sales.filter((r) => inRange(r, FY.from, FY.to));
  const fyReturns = returns.filter((r) => inRange(r, FY.from, FY.to));
  assert.equal(new Set(fySales.map(keyOf)).size, fySales.length, "seed keys must be unique");
  const rowsOf = (list) => list.map(keyOf);
  const bySale = (no) => sales.find((r) => r.invoiceNumber === no);
  console.log(`SEED sales rows in FY=${fySales.length} final=${finals(fySales).length} sum=${fmt(finalSum(fySales))} returns=${fyReturns.length}`);

  const factsOf = (r) => ({
    lines: billLines(r),
    entry: fmtEntry(r.entryAt, thisYear),
    billDate: fmtDay(r.billDay),
    entryByText: r.entryBy ? shortName(r.entryBy) : "—",
    patient: r.patient ?? "—",
    mobile: displayMobile(r.mobile),
    amount: fmt(r.cents),
    payments: paymentCell(r),
  });
  const rowMismatches = (rows, list) => {
    const byKey = new Map(list.map((r) => [keyOf(r), r]));
    const bad = [];
    for (const row of rows) {
      const exp = byKey.get(rowKey(row));
      if (!exp) {
        bad.push({ row: rowKey(row), problem: "unexpected row" });
        continue;
      }
      const want = factsOf(exp);
      for (const field of Object.keys(want)) if (JSON.stringify(row[field]) !== JSON.stringify(want[field])) bad.push({ row: rowKey(row), field, actual: row[field], expected: want[field] });
    }
    return bad;
  };

  const browser = await chromium.launch();
  const results = [];
  const printStub = () => {
    window.__printCalls = 0;
    window.print = () => {
      window.__printCalls++;
    };
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
    await vis(page).locator("table").first().waitFor({ timeout: 240000 });
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
      error && `EXCEPTION: ${error.message.split("\n").slice(0, 3).join(" / ")}`,
      ...failed.map((c) => `FAIL ${c.label}: expected ${JSON.stringify(c.expected)} actual ${JSON.stringify(c.actual)}`),
      ...pageErrors.map((e) => `PAGEERROR ${e.text}`),
      ...t.notes.map((n) => `note: ${n}`),
      `${t.checks.length - failed.length}/${t.checks.length} checks passed`,
    ]
      .filter(Boolean)
      .join("\n");
    results.push({ scenario: `${id} ${name}`, pass, detail, screenshot: t.shots[0] ?? null, screenshots: t.shots, consoleErrors: consoleErrors.map((e) => e.text), pageErrors: pageErrors.map((e) => e.text), seconds: Math.round((Date.now() - started) / 1000) });
    console.log(`${pass ? "PASS" : "FAIL"} ${id} ${name}\n${detail.split("\n").map((l) => `    ${l}`).join("\n")}`);
  }

  const selectByLabel = (page, label) => vis(page).locator("label").filter({ hasText: new RegExp(`^\\s*${label}`) }).locator("select");
  const periodSelect = (page) => vis(page).locator('select[aria-label="Period"]');
  const datesButton = (page) => vis(page).getByRole("button", { name: /^Change dates/ });
  const rangeText = async (page) => clean(await datesButton(page).innerText());
  const openDates = async (page) => {
    const btn = datesButton(page);
    if ((await btn.getAttribute("aria-expanded")) !== "true") await btn.click();
  };
  const dateInput = (page, label) => vis(page).getByLabel(label, { exact: true });
  const setRange = async (page, from, to) => {
    await openDates(page);
    const currentTo = undisplay(await dateInput(page, "To").inputValue());
    const order = from > currentTo ? [["To", to], ["From", from]] : [["From", from], ["To", to]];
    for (const [label, day] of order) {
      const input = dateInput(page, label);
      await input.fill(display(day));
      await input.press("Enter");
      await settle(page);
    }
    await page.keyboard.press("Escape");
  };
  const preset = async (page, label) => {
    await periodSelect(page).selectOption({ label });
    await settle(page);
  };
  const search = async (page, field, q) => {
    await selectByLabel(page, "Search by").selectOption({ label: field });
    await vis(page).getByRole("searchbox").fill(q);
    await settle(page);
  };
  const openMore = async (page) => {
    const btn = vis(page).getByRole("button", { name: /More filters/ });
    if ((await btn.getAttribute("aria-expanded")) !== "true") await btn.click();
  };
  const moreCount = async (page) => Number((await vis(page).getByRole("button", { name: /More filters/ }).innerText()).replace(/\D/g, "") || 0);
  const paymentSelect = (page, label = "Payment") => selectByLabel(page, label);
  const clearAll = (page) => vis(page).getByRole("button", { name: /Clear all/ });
  const snapshot = async (page) => ({ rows: await readRows(page), foot: await footer(page) });
  const tabsOf = (page) => page.getByRole("tab");
  const sidebarSales = (page) => page.locator("nav, aside").getByRole("link", { name: "Sales", exact: true });

  async function printAndCapture(page, context, button) {
    const pagesBefore = context.pages().length;
    await button.click();
    const handle = await page.waitForSelector("iframe[data-print-frame]", { state: "attached", timeout: 30000 });
    const frame = await handle.contentFrame();
    await frame.waitForFunction(() => document.body && document.body.innerText.trim().length > 20, null, { timeout: 30000 });
    await page.waitForTimeout(500);
    const text = await frame.evaluate(() => document.body.innerText);
    const calls = await frame.evaluate(() => window.__printCalls).catch(() => null);
    const html = await handle.evaluate((el) => el.srcdoc);
    const images = await frame.locator("img").count();
    const xss = await Promise.all(page.frames().map((f) => f.evaluate(() => window.__xss).catch(() => "unreadable")));
    return { text, calls, html, images, xss, newPages: context.pages().length - pagesBefore, frame };
  }

  await scenario("01", "pharmacist-sidebar-default-fy", async (s) => {
    const { page } = s.track(await open("pharmacist"));
    await page.goto(`${stack.base}/dashboard/pharmacy`, { waitUntil: "domcontentloaded", timeout: 240000 });
    await page.getByText("Anil", { exact: false }).first().waitFor({ timeout: 120000 });
    await sidebarSales(page).first().click();
    await page.waitForURL("**/dashboard/pharmacy/sales**", { timeout: 240000 });
    await vis(page).locator("table").first().waitFor({ timeout: 240000 });
    await settle(page);
    s.check("default range text", await rangeText(page), `${display(FY.from)} – ${display(FY.to)}`);
    s.check("Period preset shows this FY", await periodSelect(page).evaluate((el) => el.options[el.selectedIndex].text), "FY 2026-27");
    s.check("Period options", await periodSelect(page).locator("option").allInnerTexts(), ["Today", "Yesterday", "Last 7 days", "This month", "FY 2026-27", "FY 2025-26", "Custom"]);
    s.check("tab labels", (await tabsOf(page).allInnerTexts()).map(clean), ["Sales", "Returns"]);
    s.check("header + New sale button", await page.getByRole("button", { name: "New sale" }).count(), 1);
    const { rows, foot } = await snapshot(page);
    const sorted = newest(fySales);
    s.check("column headers", (await vis(page).locator("thead th").allInnerTexts()).map(clean), SALES_HEADERS);
    s.check("page-1 row count", rows.length, 50);
    s.check("page-1 rows are the 50 newest by entry date", rows.map(rowKey), rowsOf(sorted.slice(0, 50)));
    s.check("every page-1 cell matches the seed (bill cell, entry, date, entry by, patient, mobile, amount, payments)", rowMismatches(rows, sorted.slice(0, 50)), []);
    s.ok("rows include bills and counter sales", rows.some((r) => r.lines.includes("Counter sale")) && rows.some((r) => /^PHI-/.test(r.first)), rows.map((r) => r.first));
    s.check("footer label+total", [foot.label, foot.total], ["Total Amount", fmt(finalSum(fySales))]);
    s.check("footer count/unit", [foot.count, foot.unit], [finals(fySales).length, "bills"]);
    s.check("exclusion note", foot.note, exclusion(fySales));
    s.check("pager", foot.pager, `1–50 of ${fySales.length} rows`);
    s.note(`footer raw: ${foot.raw}`);
    await scrollAll(page, "bottom");
    const atBottom = await footerBox(page);
    s.ok("footer inside viewport after scrolling to bottom", atBottom.inside, atBottom);
    s.ok("footer flush with viewport bottom (gap <= 1px)", atBottom.gap !== null && Math.abs(atBottom.gap) <= 1, atBottom);
    const lastRow = await vis(page).locator("table tbody tr").last().boundingBox();
    s.ok("last row not hidden behind footer", lastRow.y + lastRow.height <= atBottom.box.y + 1, { lastRowBottom: lastRow.y + lastRow.height, footerTop: atBottom.box.y });
    await scrollAll(page, "top");
    await page.mouse.move(700, 500);
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(400);
    const z = await page.evaluate(() => {
      const table = [...document.querySelectorAll("table")].find((t) => t.getClientRects().length);
      const heads = [...table.querySelectorAll("thead th")];
      return heads.map((th) => {
        const b = th.getBoundingClientRect();
        const top = document.elementFromPoint(Math.min(Math.max(b.left + b.width / 2, 1), innerWidth - 1), Math.min(Math.max(b.top + b.height / 2, 1), innerHeight - 1));
        return { text: th.innerText.trim().slice(0, 14), visible: b.bottom > 0 && b.top < innerHeight, onTop: Boolean(top && th.contains(top)), coveredBy: top && !th.contains(top) ? `${top.tagName}.${String(top.className).slice(0, 40)}` : null };
      });
    });
    s.ok("sticky header cells are on top of body cells while scrolled (z-order, incl. sticky Bill No column)", z.every((h) => !h.visible || h.onTop), z.filter((h) => h.visible && !h.onTop));
    await s.shot(page, "01-default-fy-scrolled");
    await scrollAll(page, "bottom");
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
    s.check("range text", await rangeText(page), "15/10/2026 – 15/10/2026");
    s.check("Period shows Custom", await periodSelect(page).inputValue(), "custom");
    s.check("total", foot.total, fmt(finalSum(day)));
    s.check("final count", foot.count, finals(day).length);
    s.check("excluded note", foot.note, exclusion(day));
    s.check("row keys (any order)", rows.map(rowKey).sort(), rowsOf(day).sort());
    s.check("pager", foot.pager, `1–${day.length} of ${day.length} rows`);
    s.note(`expected ${fmt(finalSum(day))} across ${day.length} rows incl ${day.filter((r) => r.state !== "FINAL").length} non-final`);
    await s.shot(page, "02-one-day");
  });

  await scenario("03", "sorting", async (s) => {
    const { page } = s.track(await open("pharmacist"));
    await goto(page, "/dashboard/pharmacy/sales");
    const th = vis(page).locator("thead th");
    let active = "entryAt";
    let activeDir = "desc";
    const byKey = new Map(fySales.map((r) => [keyOf(r), r]));
    for (const [i, col] of COLUMNS.entries()) {
      const seen = [];
      for (let click = 0; click < 2; click++) {
        const dir = active !== col.key ? (DESC_FIRST.has(col.key) ? "desc" : "asc") : activeDir === "asc" ? "desc" : "asc";
        await th.nth(i).getByRole("button").click();
        await settle(page);
        active = col.key;
        activeDir = dir;
        seen.push(dir);
        const sortAttrs = await th.evaluateAll((els) => els.map((e) => e.getAttribute("aria-sort")));
        s.check(`${col.name} click ${click + 1} (${dir}): aria-sort`, sortAttrs.slice(0, 7), COLUMNS.map((_, j) => (j === i ? (dir === "asc" ? "ascending" : "descending") : "none")));
        const rows = await readRows(page);
        const want = rowsOf(ordered(fySales, col.key, dir === "asc" ? 1 : -1));
        const present = rows.map(rowKey).filter((k) => byKey.get(k)[col.key] !== null && byKey.get(k)[col.key] !== undefined);
        s.check(`${col.name} ${dir}: non-empty values in expected order`, present, want.slice(0, present.length));
        if (col.key === "billNo" && dir === "asc") {
          s.check("PHI-2026-009 then PHI-2026-010 adjacent in order", [rows.findIndex((r) => r.first === "PHI-2026-010") - rows.findIndex((r) => r.first === "PHI-2026-009")], [1]);
          s.ok("no drafts on page 1 of Bill No asc", rows.every((r) => r.first !== "Draft"), rows.filter((r) => r.first === "Draft").length);
          await s.shot(page, "03-sort-billno-asc");
          await vis(page).getByRole("button", { name: "Next page" }).click();
          await settle(page);
          const second = await readRows(page);
          const drafts = fySales.filter((r) => r.billNo === null).length;
          s.check("last rows of Bill No asc are the drafts", second.slice(-drafts).map((r) => r.first), Array(drafts).fill("Draft"));
          s.check("page 2 remaining non-draft keys in order", second.slice(0, second.length - drafts).map(rowKey), want.slice(50, want.length));
          await vis(page).getByRole("button", { name: "Previous page" }).click();
          await settle(page);
        }
      }
      s.check(`${col.name}: first-click direction`, seen[0], DESC_FIRST.has(col.key) ? "desc" : "asc");
    }
    await s.shot(page, "03-sort-amount-last");
  });

  await scenario("04", "filters", async (s) => {
    const { page } = s.track(await open("pharmacist"));
    await goto(page, "/dashboard/pharmacy/sales");
    const expectView = (label, list, foot, rows, mode) => {
      if (mode) {
        s.check(`${label}: footer total (payment amounts, not bill totals)`, foot.total, fmt(collectedBy(list, mode)));
        s.check(`${label}: footer label`, foot.label, mode === "CREDIT" ? "Due (unpaid)" : `Collected by ${MODE_LABEL[mode]}`);
      } else {
        s.check(`${label}: total`, foot.total, fmt(finalSum(list)));
        s.check(`${label}: footer label`, foot.label, "Total Amount");
      }
      s.check(`${label}: final count`, foot.count, finals(list).length);
      s.check(`${label}: row keys`, rows.map(rowKey).sort(), rowsOf(list.slice(0, 50)).sort());
    };

    await paymentSelect(page).selectOption({ label: "UPI" });
    await settle(page);
    let { rows, foot } = await snapshot(page);
    const upi = newest(withMode(fySales, "UPI"));
    expectView("UPI only", upi, foot, rows, "UPI");
    s.ok("UPI only: every shown row has UPI badge", rows.every((r) => r.payments.includes("UPI")), rows.map((r) => r.payments));
    s.ok("UPI only: split bill present", upi.some((r) => r.modes.length > 1), "no split in seed");
    await s.shot(page, "04-filter-upi");
    await paymentSelect(page).selectOption({ label: "All" });
    await settle(page);

    await search(page, "Bill No", "PHI-2026-01");
    ({ rows, foot } = await snapshot(page));
    expectView("Bill No PHI-2026-01", newest(fySales.filter((r) => (r.billNo ?? r.reserved ?? "").toLowerCase().includes("phi-2026-01"))), foot, rows);
    await s.shot(page, "04-search-billno");

    await search(page, "Patient", "sharma");
    ({ rows, foot } = await snapshot(page));
    expectView("Patient sharma", newest(fySales.filter((r) => (r.patient ?? "").toLowerCase().includes("sharma"))), foot, rows);
    s.ok("Patient sharma includes counter sale customer", rows.some((r) => r.lines.includes("Counter sale")), rows.map((r) => r.first));

    await search(page, "Mobile", "98765");
    ({ rows, foot } = await snapshot(page));
    expectView("Mobile 98765", newest(fySales.filter((r) => mobileDigits(r.mobile ?? "").includes("98765"))), foot, rows);

    await search(page, "Mobile", "9876543210");
    ({ rows, foot } = await snapshot(page));
    const formatted = newest(fySales.filter((r) => mobileDigits(r.mobile ?? "").includes("9876543210")));
    expectView("Mobile 9876543210 matches '98765 43210' formatted", formatted, foot, rows);
    s.ok("seed has a formatted-number match", formatted.length > 0, formatted.length);

    await search(page, "Mobile", "+91 98220-12345");
    ({ rows, foot } = await snapshot(page));
    expectView("Mobile '+91 98220-12345' normalised", newest(fySales.filter((r) => mobileDigits(r.mobile ?? "").includes("9822012345"))), foot, rows);
    await search(page, "Mobile", "");

    await openMore(page);
    await selectByLabel(page, "State").selectOption({ label: "Draft" });
    await settle(page);
    s.check("badge after State", await moreCount(page), 1);
    ({ rows, foot } = await snapshot(page));
    expectView("State=Draft", newest(fySales.filter((r) => r.state === "DRAFT")), foot, rows);
    await selectByLabel(page, "Source").selectOption({ label: "Counter sales" });
    await settle(page);
    s.check("badge after Source", await moreCount(page), 2);
    ({ rows, foot } = await snapshot(page));
    expectView("Draft + Counter", newest(fySales.filter((r) => r.state === "DRAFT" && r.source === "counter")), foot, rows);
    await selectByLabel(page, "Entry by").selectOption({ label: "Anil Deshmukh" });
    await settle(page);
    s.check("badge after Entry by", await moreCount(page), 3);
    ({ rows, foot } = await snapshot(page));
    expectView("Draft + Counter + Anil", newest(fySales.filter((r) => r.state === "DRAFT" && r.source === "counter" && r.entryBy === "Anil Deshmukh")), foot, rows);
    await s.shot(page, "04-more-filters-3");
    await selectByLabel(page, "State").selectOption({ label: "Final" });
    await selectByLabel(page, "Entry by").selectOption({ label: "Priya Menon" });
    await settle(page);
    ({ rows, foot } = await snapshot(page));
    expectView("Final + Counter + Priya", newest(fySales.filter((r) => r.state === "FINAL" && r.source === "counter" && r.entryBy === "Priya Menon")), foot, rows);
    const entryOptions = await selectByLabel(page, "Entry by").locator("option").allInnerTexts();
    s.check("Entry by options", entryOptions.slice().sort(), ["Anyone", "Anil Deshmukh", "Priya Menon", "Rajesh Iyer", "Sunita Patil"].sort());
    await page.keyboard.press("Escape");
    s.check("Escape closes More filters", await vis(page).getByRole("button", { name: /More filters/ }).getAttribute("aria-expanded"), "false");

    await paymentSelect(page).selectOption({ label: "Cash" });
    await vis(page).getByRole("searchbox").fill("yusuf");
    await selectByLabel(page, "Search by").selectOption({ label: "Patient" });
    await settle(page);
    s.check("badge before clear", await moreCount(page), 3);
    await clearAll(page).click();
    await settle(page);
    ({ rows, foot } = await snapshot(page));
    s.check("Clear all: badge", await moreCount(page), 0);
    s.check("Clear all: search box empty", await vis(page).getByRole("searchbox").inputValue(), "");
    s.check("Clear all: focus moves to search box", await page.evaluate(() => document.activeElement?.getAttribute("type")), "search");
    s.check("Clear all: payment", await paymentSelect(page).inputValue(), "");
    s.check("Clear all: total restored", foot.total, fmt(finalSum(fySales)));
    s.check("Clear all: rows restored", rows.length, 50);
    s.ok("Clear all button hidden afterwards", (await clearAll(page).count()) === 0);
    await s.shot(page, "04-clear-all");

    await preset(page, "FY 2025-26");
    ({ rows, foot } = await snapshot(page));
    expectView("FY 2025-26 preset", newest(sales.filter((r) => inRange(r, "2025-04-01", "2026-03-31"))), foot, rows);
    s.check("FY 2025-26 range text", await rangeText(page), "01/04/2025 – 31/03/2026");
    s.ok("IST boundary: 31 Mar 23:00 IST bill is in previous FY, 01 Apr 00:30 IST bill is not", rows.some((r) => r.first === "PHI-2025-045") && !rows.some((r) => r.first === "PHI-2026-071"), rows.map((r) => r.first));
    await s.shot(page, "04-last-fy");

    await preset(page, "This month");
    ({ rows, foot } = await snapshot(page));
    const month = `${data.today.slice(0, 8)}01`;
    expectView("This month preset", newest(sales.filter((r) => r.billDay >= month && r.billDay <= data.today.slice(0, 8) + "31")), foot, rows);
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
    s.check("draft bill-cell lines match (Draft + '<no> not final' for pharmacy bills)", rowMismatches(rows, drafts).filter((m) => m.field === "lines" || m.problem), []);
    s.ok("every draft row leads with the Draft badge, never the reserved number", rows.every((r) => r.first === "Draft"), rows.map((r) => r.lines));
    const draftBills = drafts.filter((d) => d.source === "bill");
    s.ok("pharmacy drafts show '<no> not final'", draftBills.every((d) => rows.some((r) => r.lines.includes(`${d.reserved} not final`))), rows.map((r) => r.lines));
    s.ok("draft counter sales show no reserved number", rows.filter((r) => r.lines.includes("Counter sale")).every((r) => r.lines.length === 2), rows.map((r) => r.lines));
    s.check("badge text", clean(await vis(page).locator("tbody tr").first().locator("td").first().locator("a, button").first().innerText()), "Draft");
    s.check("drafts total is 0", foot.total, fmt(0));
    s.check("drafts excluded note", foot.note, exclusion(drafts));
    await s.shot(page, "05-drafts");
    await selectByLabel(page, "State").selectOption({ label: "Cancelled" });
    await settle(page);
    ({ rows, foot } = await snapshot(page));
    const cancelled = fySales.filter((r) => r.state === "CANCELLED");
    s.check("cancelled keys", rows.map(rowKey).sort(), rowsOf(cancelled).sort());
    s.check("cancelled rows cell facts", rowMismatches(rows, cancelled), []);
    s.ok("each cancelled row shows Cancelled badge and bill number", rows.every((r) => r.lines.includes("Cancelled") && /^(PHI|CS)-/.test(r.first)), rows.map((r) => r.lines));
    const struck = await vis(page).locator("tbody tr").first().evaluate((tr) => [...tr.querySelectorAll("td span")].some((e) => getComputedStyle(e).textDecorationLine.includes("line-through")));
    s.ok("cancelled amount is struck through", struck);
    s.check("cancelled total", foot.total, fmt(0));
    s.check("cancelled note", foot.note, exclusion(cancelled));
    await s.shot(page, "05-cancelled");
    await clearAll(page).click();
    await settle(page);
    await search(page, "Bill No", "PHI-2026-031");
    ({ rows, foot } = await snapshot(page));
    s.check("cancelled bill found in default view", rows.map((r) => r.first), ["PHI-2026-031"]);
    s.check("its amount is shown but total excludes it", [rows[0].amount, foot.total, foot.count], [fmt(bySale("PHI-2026-031").cents), fmt(0), 0]);
    s.check("singular count unit", foot.unit, "bills");
    await search(page, "Bill No", "NO-SUCH-BILL");
    const empty = await vis(page).locator("tbody").innerText();
    s.ok("empty-state title reflects search context", /No sales match your search/.test(empty), empty);
    await clearAll(page).click();
    await settle(page);
    await setRange(page, "2026-04-02", "2026-04-02");
    const emptyPeriod = await vis(page).locator("tbody").innerText();
    s.ok("empty-state title reflects period context", /No sales in this period/.test(emptyPeriod), emptyPeriod);
    s.check("empty period (range changed) offers Clear filters", await vis(page).getByRole("button", { name: "Clear filters" }).count(), 1);
  });

  await scenario("06", "row-actions", async (s) => {
    const { page, context } = s.track(await open("pharmacist"));
    await goto(page, "/dashboard/pharmacy/sales");
    const bill = bySale("PHI-2026-056");
    await search(page, "Bill No", bill.billNo);
    let rows = await readRows(page);
    s.check("one row", rows.length, 1);
    const wa = new URL(rows[0].wa.href);
    s.check("wa origin+path", [wa.origin, wa.pathname], ["https://wa.me", `/91${localMobile(bill.mobile)}`]);
    s.check("wa message text", wa.searchParams.get("text"), `Dear ${bill.patient}, thank you for visiting ${clinic.name}. Your pharmacy bill ${bill.billNo} dated ${display(bill.billDay)} is ${fmt(bill.cents)} (${bill.modes.map((m) => MODE_LABEL[m]).join(", ")}).`);
    s.check("wa link opens in new tab", await vis(page).locator(`a[href^="https://wa.me/"]`).first().evaluate((a) => [a.target, a.rel]), ["_blank", "noopener noreferrer"]);

    await search(page, "Bill No", "PHI-2026-073");
    rows = await readRows(page);
    const partialText = new URL(rows[0].wa.href).searchParams.get("text");
    s.check("wa message for a bill with balance due", partialText, `Dear ${bySale("PHI-2026-073").patient}, thank you for visiting ${clinic.name}. Your pharmacy bill PHI-2026-073 dated ${display(bySale("PHI-2026-073").billDay)} is ${fmt(285000)} (UPI). Balance due ${fmt(185000)}.`);

    const phoneCases = [
      ["Anjali", "98765 43210", "/919876543210"],
      ["Meera", "98220 12345", "/919822012345"],
      ["Kavita", "98901 23456", "/919890123456"],
    ];
    for (const [patient, shown, waPath] of phoneCases) {
      await search(page, "Patient", patient);
      rows = await readRows(page);
      const hit = rows.find((r) => r.mobile === shown && r.wa.href);
      s.ok(`${patient}: mobile shown as '${shown}'`, hit, rows.map((r) => r.mobile));
      if (hit) s.check(`${patient}: wa path`, new URL(hit.wa.href).pathname, waPath);
    }

    const noPhone = bySale("PHI-2026-038");
    await search(page, "Bill No", noPhone.billNo);
    rows = await readRows(page);
    s.check("no-phone row mobile cell", rows[0].mobile, "—");
    s.check("no-phone WhatsApp disabled button, not a link", [rows[0].wa.tag, rows[0].wa.disabled, rows[0].wa.href], ["BUTTON", "true", null]);
    s.check("no-phone WhatsApp is not a tab stop (tabindex -1)", rows[0].wa.tabindex, "-1");
    s.check("no-phone WhatsApp reason via aria-describedby", rows[0].wa.reason, "No mobile number");
    const waBtn = vis(page).locator("tbody tr").first().locator('button[aria-label*="WhatsApp"]');
    await vis(page).locator("tbody tr").first().locator('button[aria-label^="Print"]').focus();
    await page.keyboard.press("Tab");
    s.ok("Tab from Print skips the disabled WhatsApp", await page.evaluate(() => !/WhatsApp/.test(document.activeElement?.getAttribute("aria-label") || "")));
    await page.locator("body").click({ position: { x: 700, y: 120 } });
    await waBtn.hover();
    await page.waitForTimeout(700);
    s.check("disabled WhatsApp shows reason on mouse hover (tooltip)", clean((await page.locator('[role="tooltip"]').first().innerText().catch(() => "")) || ""), "No mobile number");
    await s.shot(page, "06-whatsapp-disabled-nophone");

    await openMore(page);
    await selectByLabel(page, "State").selectOption({ label: "Draft" });
    await search(page, "Bill No", "");
    rows = await readRows(page);
    s.ok("draft rows: WhatsApp disabled with reason", rows.length > 0 && rows.every((r) => r.wa.disabled === "true" && !r.wa.href && r.wa.reason === "Finish this draft bill first"), rows.map((r) => r.wa));
    await vis(page).locator("tbody tr").first().locator('button[aria-label*="WhatsApp"]').hover();
    await page.waitForTimeout(700);
    s.check("draft reason tooltip on hover", clean((await page.locator('[role="tooltip"]').first().innerText().catch(() => "")) || ""), "Finish this draft bill first");
    await clearAll(page).click();
    await settle(page);

    await search(page, "Bill No", bill.billNo);
    const printed = await printAndCapture(page, context, vis(page).getByRole("button", { name: `Print ${bill.billNo}` }));
    s.ok("receipt shows bill number", printed.text.includes(bill.billNo), printed.text.slice(0, 200));
    s.ok("receipt shows patient and grouped amount", printed.text.includes(bill.patient) && printed.text.includes(fmt(bill.cents)), printed.text.slice(0, 400));
    s.check("window.print called once in the print frame", printed.calls, 1);
    s.check("print opened no new tab/popup", printed.newPages, 0);
    s.ok("main page URL is still the sales register", page.url().includes("/dashboard/pharmacy/sales"), page.url());
    await s.shot(page, "06-row-actions");
  });

  await scenario("07", "entry-by", async (s) => {
    const { page } = s.track(await open("pharmacist"));
    await goto(page, "/dashboard/pharmacy/sales");
    const seen = new Map();
    for (let p = 1; p <= 2; p++) {
      for (const r of await readRows(page)) seen.set(rowKey(r), r);
      if (p === 1) {
        await vis(page).getByRole("button", { name: "Next page" }).click();
        await settle(page);
      }
    }
    s.check("rows seen", seen.size, fySales.length);
    const withCreator = fySales.filter((r) => r.entryBy);
    const wrong = withCreator.filter((r) => seen.get(keyOf(r)).entryByText !== shortName(r.entryBy)).map((r) => [r.invoiceNumber, seen.get(keyOf(r)).entryByText, shortName(r.entryBy)]);
    s.check("every row created WITH createdById shows 'First L.'", wrong, []);
    const noTitle = withCreator.filter((r) => seen.get(keyOf(r)).entryByTitle !== r.entryBy).map((r) => [r.invoiceNumber, seen.get(keyOf(r)).entryByTitle]);
    s.check("full name is on hover (title attribute)", noTitle, []);
    s.check("bill 001 -> Anil D.", seen.get(keyOf(bySale("PHI-2026-001"))).entryByText, "Anil D.");
    s.check("bill 008 createdById reception -> Sunita P.", seen.get(keyOf(bySale("PHI-2026-008"))).entryByText, "Sunita P.");
    s.check("bill 014 owner -> Rajesh I.", seen.get(keyOf(bySale("PHI-2026-014"))).entryByText, "Rajesh I.");
    s.check("counter sale by doctor -> Priya M.", seen.get(keyOf(bySale("CS-2026-007"))).entryByText, "Priya M.");
    const legacy = fySales.filter((r) => r.legacyCreator);
    s.note(`legacy bills with NULL createdById (${legacy.map((r) => r.invoiceNumber).join(", ")}) show: ${JSON.stringify(legacy.map((r) => seen.get(keyOf(r)).entryByText))}; the migration backfill itself is covered by the backend database spec, boot uses db push so it is not exercised here`);
    await openMore(page);
    await selectByLabel(page, "Entry by").selectOption({ label: "Priya Menon" });
    await settle(page);
    const priya = fySales.filter((r) => r.entryBy === "Priya Menon");
    const { rows, foot } = await snapshot(page);
    s.check("Entry by filter rows", rows.map(rowKey).sort(), rowsOf(priya).sort());
    s.check("Entry by Priya total", foot.total, fmt(finalSum(priya)));
    await s.shot(page, "07-entry-by-priya");
  });

  await scenario("08", "returns-tab", async (s) => {
    const { page } = s.track(await open("pharmacist"));
    await goto(page, "/dashboard/pharmacy/sales?tab=returns");
    s.check("Returns tab selected via URL", await page.getByRole("tab", { name: "Returns" }).getAttribute("aria-selected"), "true");
    s.check("header + New return button", await page.getByRole("button", { name: "New return" }).count(), 1);
    let { rows, foot } = await snapshot(page);
    const list = newest(fyReturns);
    s.check("return rows", rows.map(rowKey), rowsOf(list));
    s.check("return cell facts", rowMismatches(rows, list), []);
    s.check("Against bill column", rows.map((r) => r.against), list.map((r) => (r.linked.length ? r.linked : ["—"])));
    s.check("return total", [foot.label, foot.total], ["Total Amount", fmt(finalSum(fyReturns))]);
    s.check("return count unit", [foot.count, foot.unit], [finals(fyReturns).length, "returns"]);
    s.check("excluded note", foot.note, exclusion(fyReturns));
    s.check("column headers", (await vis(page).locator("thead th").allInnerTexts()).map(clean), RETURN_HEADERS);
    s.check("Refund filter has no Due option", await paymentSelect(page, "Refund").locator("option").allInnerTexts(), ["All", "Cash", "UPI", "Card", "Net banking", "Wallet", "Insurance", "Other"]);
    await s.shot(page, "08-returns-default");

    await paymentSelect(page, "Refund").selectOption({ label: "UPI" });
    await settle(page);
    ({ rows, foot } = await snapshot(page));
    const upi = list.filter((r) => r.modes.includes("UPI"));
    s.check("Refund UPI rows", rows.map(rowKey), rowsOf(upi));
    s.check("Refund UPI footer", [foot.label, foot.total, foot.count], ["Refunded by UPI", fmt(collectedBy(upi, "UPI")), finals(upi).length]);
    await paymentSelect(page, "Refund").selectOption({ label: "All" });
    await settle(page);

    await vis(page).locator("thead th").nth(0).getByRole("button").click();
    await settle(page);
    rows = await readRows(page);
    s.check("sort Bill No asc: non-draft in order, draft last", rows.map(rowKey), [...rowsOf(ordered(fyReturns, "billNo", 1)), ...rowsOf(fyReturns.filter((r) => r.billNo === null))]);
    s.check("aria-sort on Bill No", await vis(page).locator("thead th").nth(0).getAttribute("aria-sort"), "ascending");
    await vis(page).locator("thead th").nth(7).getByRole("button").click();
    await settle(page);
    rows = await readRows(page);
    s.check("sort Amount: first click is descending", await vis(page).locator("thead th").nth(7).getAttribute("aria-sort"), "descending");
    s.check("sort Amount desc order", rows.map(rowKey), rowsOf(ordered(fyReturns, "cents", -1)));

    await search(page, "Patient", "sharma");
    ({ rows, foot } = await snapshot(page));
    const sharma = fyReturns.filter((r) => (r.patient ?? "").toLowerCase().includes("sharma"));
    s.check("patient search in returns", [rows.map((r) => r.first).sort(), foot.total], [sharma.map((r) => r.billNo).sort(), fmt(finalSum(sharma))]);
    await clearAll(page).click();
    await settle(page);

    await page.getByRole("button", { name: "New return" }).click();
    await page.waitForURL("**/dashboard/inventory**", { timeout: 120000 });
    const target = new URL(page.url());
    s.check("+ New return opens the inventory workspace", [target.pathname, target.searchParams.get("area"), target.searchParams.get("view"), target.searchParams.has("new")], ["/dashboard/inventory", "sales", "SALES_RETURN", true]);
    s.ok("+ New return carries return= to the Returns tab", (target.searchParams.get("return") ?? "").startsWith("/dashboard/pharmacy/sales?tab=returns"), target.searchParams.get("return"));
    await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await s.shot(page, "08-new-return-flow");

    await goto(page, "/dashboard/pharmacy/sales");
    await page.getByRole("tab", { name: "Returns" }).click();
    await page.waitForFunction(() => location.search.includes("tab=returns"), null, { timeout: 30000 });
    await settle(page);
    rows = await readRows(page);
    s.check("tab control shows returns", rows.map((r) => r.first).sort(), fyReturns.map((r) => r.billNo ?? "Draft").sort());
    s.check("tab control keeps tab in URL", new URL(page.url()).searchParams.get("tab"), "returns");
    await page.reload({ waitUntil: "domcontentloaded" });
    await vis(page).locator("table").first().waitFor();
    await settle(page);
    s.check("reload keeps Returns tab", await page.getByRole("tab", { name: "Returns" }).getAttribute("aria-selected"), "true");

    await setRange(page, "2026-04-01", "2026-04-02");
    const emptyText = await vis(page).locator("tbody").innerText();
    s.ok("empty state: 'No returns in this period'", /No returns in this period/.test(emptyText), emptyText);
    s.ok("empty state is not a spinner/skeleton", (await vis(page).locator('[aria-busy="true"]').count()) === 0 && (await vis(page).locator("tbody tr").count()) === 1, emptyText);
    s.check("empty total", (await footer(page)).total, fmt(0));
    await s.shot(page, "08-returns-empty");
  });

  await scenario("09", "pagination", async (s) => {
    const { page } = s.track(await open("pharmacist"));
    await goto(page, "/dashboard/pharmacy/sales");
    const order = newest(fySales);
    const first = await footer(page);
    s.ok("more than 50 rows seeded", fySales.length > 50, fySales.length);
    const next = vis(page).getByRole("button", { name: "Next page" });
    const previous = vis(page).getByRole("button", { name: "Previous page" });
    s.check("Previous aria-disabled on page 1", await previous.getAttribute("aria-disabled"), "true");
    await next.click();
    await settle(page);
    const rows = await readRows(page);
    const foot = await footer(page);
    s.check("page 2 rows", rows.map(rowKey), rowsOf(order.slice(50)));
    s.check("page 2 pager", foot.pager, `51–${fySales.length} of ${fySales.length} rows`);
    s.check("total unchanged on page 2", [foot.total, foot.count, foot.note], [first.total, first.count, first.note]);
    s.check("total is full-filter total", foot.total, fmt(finalSum(fySales)));
    s.check("Next aria-disabled on last page", await next.getAttribute("aria-disabled"), "true");
    s.check("focus stays on Next after it becomes disabled", await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Next page");
    await s.shot(page, "09-page-2");
    await previous.click();
    await settle(page);
    s.check("back to page 1 pager", (await footer(page)).pager, `1–50 of ${fySales.length} rows`);
    await next.click();
    await settle(page);
    await vis(page).getByRole("searchbox").fill("PHI-2026-05");
    await settle(page);
    const narrowed = await footer(page);
    s.ok("search from page 2 resets to page 1 (not blank)", /^1–\d+ of \d+ rows$/.test(narrowed.pager ?? ""), narrowed);
  });

  await scenario("10", "mobile-390", async (s) => {
    const { page } = s.track(await open("pharmacist", { width: 390, height: 844 }));
    await goto(page, "/dashboard/pharmacy/sales");
    const filtersBtn = vis(page).getByRole("button", { name: /^Filters/ });
    s.check("Filters disclosure exists", await filtersBtn.count(), 1);
    s.check("Filters disclosure starts collapsed", await filtersBtn.getAttribute("aria-expanded"), "false");
    s.ok("Period/Payment controls hidden until Filters opens", !(await periodSelect(page).isVisible()) && !(await paymentSelect(page).isVisible()));
    const firstRow = await vis(page).locator("tbody tr").first().boundingBox();
    const vh = await page.evaluate(() => window.innerHeight);
    s.ok("first data row is fully visible in the first viewport after load", firstRow && firstRow.y >= 0 && firstRow.y + firstRow.height <= vh, { firstRow, vh });
    const visibleRows = await vis(page).locator("tbody tr").evaluateAll((trs, h) => trs.filter((tr) => { const b = tr.getBoundingClientRect(); return b.top >= 0 && b.bottom <= h; }).length, vh);
    s.note(`rows fully visible in the first 390x844 viewport: ${visibleRows}`);
    const dims = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    s.ok("no page-level horizontal overflow", dims.sw <= dims.iw + 1, dims);
    const container = await page.evaluate(() => {
      const table = [...document.querySelectorAll("table")].find((t) => t.getClientRects().length);
      for (let el = table.parentElement; el; el = el.parentElement) {
        const o = getComputedStyle(el).overflowX;
        if (o !== "visible" && el.scrollWidth > el.clientWidth + 1) return { tag: el.tagName, cls: String(el.className).slice(0, 60), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
      }
      return null;
    });
    s.ok("table scrolls sideways inside its own container", container, container);
    const nested = await page.evaluate(() => {
      const table = [...document.querySelectorAll("table")].find((t) => t.getClientRects().length);
      const found = [];
      for (let el = table.parentElement; el && el !== document.body; el = el.parentElement) {
        const o = getComputedStyle(el).overflowY;
        if ((o === "auto" || o === "scroll") && el.scrollHeight > el.clientHeight + 1) found.push({ tag: el.tagName, cls: String(el.className).slice(0, 50), sh: el.scrollHeight, ch: el.clientHeight });
      }
      return found;
    });
    s.note(`vertical scroll containers around the table: ${JSON.stringify(nested)}`);
    await scrollAll(page, "bottom");
    const fb = await footerBox(page);
    s.ok("pinned total visible in viewport", fb.inside, fb);
    s.ok("mobile footer is one compact line, at most 64px tall", fb.box.height <= 64, fb.box);
    s.check("mobile total correct", (await footer(page)).total, fmt(finalSum(fySales)));
    const lastRow = await vis(page).locator("tbody tr").last().boundingBox();
    s.ok("footer does not cover the last row", lastRow.y + lastRow.height <= fb.box.y + 1, { lastRowBottom: lastRow.y + lastRow.height, footerTop: fb.box.y });
    const sticky = await vis(page).locator("tbody tr td").first().evaluate((cell) => {
      const cs = getComputedStyle(cell);
      return { position: cs.position, background: cs.backgroundColor, borderRight: cs.borderRightWidth };
    });
    s.check("Bill No cell is sticky-left", sticky.position, "sticky");
    s.ok("sticky Bill No cell has an opaque background and a right divider", sticky.background !== "rgba(0, 0, 0, 0)" && sticky.borderRight !== "0px", sticky);
    await scrollAll(page, "top");
    await s.shot(page, "10-mobile-top");
    await filtersBtn.click();
    s.check("Filters disclosure expands", await filtersBtn.getAttribute("aria-expanded"), "true");
    const controls = await page.evaluate(() =>
      [...document.querySelectorAll("main button, main select, main input")]
        .filter((e) => e.offsetParent && !e.closest("table") && !e.closest('[role="tabpanel"][hidden]'))
        .map((e) => {
          const b = e.getBoundingClientRect();
          return { n: e.getAttribute("aria-label") || e.innerText.trim().slice(0, 20) || e.type, l: Math.round(b.left), r: Math.round(b.right), w: Math.round(b.width), h: Math.round(b.height) };
        }),
    );
    s.ok("filter controls fit inside 390px", controls.every((c) => c.l >= 0 && c.r <= 391), controls.filter((c) => c.l < 0 || c.r > 391));
    s.ok("filter controls at least 40px tall", controls.every((c) => c.h >= 40 || /search/i.test(c.n)), controls.filter((c) => c.h < 40));
    await s.shot(page, "10-mobile-filters-open");
    await search(page, "Patient", "Meera");
    const rows = await readRows(page);
    s.ok("search works on mobile", rows.length > 0 && rows.every((r) => r.patient.includes("Meera")), rows.map((r) => r.patient));
    await openMore(page);
    await selectByLabel(page, "State").selectOption({ label: "Final" });
    await settle(page);
    s.check("More filters badge on mobile", await moreCount(page), 1);
    s.check("Filters disclosure count reflects applied filters", clean(await filtersBtn.innerText()), "Filters (1)");
    s.ok("still no overflow with More filters open", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await s.shot(page, "10-mobile-filtered");
    await clearAll(page).click();
    await settle(page);
    await page.evaluate(() => {
      const table = [...document.querySelectorAll("table")].find((t) => t.getClientRects().length);
      const c = table.closest("div[class*='overflow']");
      if (c) c.scrollLeft = 400;
    });
    await page.waitForTimeout(250);
    await s.shot(page, "10-mobile-table-scrolled-x");
    const cellBox = await vis(page).locator("tbody tr td").first().boundingBox();
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
      await vis(page).locator("table").first().waitFor({ timeout: 90000 }).catch(() => {});
      const hasTable = await vis(page).locator("table").count();
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
    const pagesBefore = context.pages().length;
    const downloadPromise = page.waitForEvent("download", { timeout: 60000 });
    await page.locator('button[title="Download Invoice"]').first().click();
    const download = await downloadPromise;
    s.check("Download Invoice saves a PDF without a pop-up", [download.suggestedFilename(), context.pages().length], ["pharmacy-invoice-PHI-2026-072.pdf", pagesBefore]);
  });

  await scenario("13", "no-horizontal-scroll-1280-1440", async (s) => {
    for (const size of [{ width: 1280, height: 800 }, { width: 1440, height: 900 }]) {
      const { page } = s.track(await open("pharmacist", size));
      await goto(page, "/dashboard/pharmacy/sales");
      const m = await page.evaluate(() => {
        const table = [...document.querySelectorAll("table")].find((t) => t.getClientRects().length);
        const box = (el) => {
          const b = el.getBoundingClientRect();
          return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) };
        };
        const container = table.closest("div.overflow-auto") ?? table.parentElement;
        const heads = [...table.querySelectorAll("thead th")].map((th) => ({ text: th.innerText.replace(/\s+/g, " ").trim(), ...box(th) }));
        const actions = [...table.querySelectorAll("tbody tr")].flatMap((tr) => [...tr.querySelectorAll("button[aria-label], a[aria-label]")].map((b) => ({ n: b.getAttribute("aria-label").slice(0, 24), ...box(b) })));
        const lastCells = [...table.querySelectorAll("tbody tr")].map((tr) => box(tr.lastElementChild));
        const rowHeights = [...table.querySelectorAll("tbody tr")].map((tr) => Math.round(tr.getBoundingClientRect().height));
        const bar = [...document.querySelectorAll('[role="tabpanel"]')].find((p) => p.getClientRects().length);
        const controls = [...bar.querySelectorAll("select, input[type=search], button")].filter((e) => !e.closest("table") && !e.closest("nav") && e.getClientRects().length && !/Retry/.test(e.innerText)).map((e) => ({ n: e.getAttribute("aria-label") || e.innerText.replace(/\s+/g, " ").trim().slice(0, 18), ...box(e) }));
        const fontOf = (sel) => { const el = table.querySelector(sel); return el ? getComputedStyle(el).fontSize : null; };
        const badgeSizes = [...table.querySelectorAll('tbody [data-slot="badge"]')].map((b) => parseFloat(getComputedStyle(b).fontSize));
        return {
          iw: innerWidth,
          docSw: document.documentElement.scrollWidth,
          bodySw: document.body.scrollWidth,
          containerSw: container.scrollWidth,
          containerCw: container.clientWidth,
          heads,
          actions,
          maxRight: Math.max(...lastCells.map((c) => c.r)),
          minRowHeight: Math.min(...rowHeights),
          badgeSizes,
          controls,
          fonts: { head: fontOf("thead th"), cell: fontOf("tbody td"), patient: fontOf("tbody td:nth-child(5)"), label: getComputedStyle(bar.querySelector("label")).fontSize },
        };
      });
      const tag = `${size.width}`;
      s.check(`${tag}: headers`, m.heads.map((h) => h.text), SALES_HEADERS);
      s.ok(`${tag}: every header box is fully inside the viewport`, m.heads.every((h) => h.l >= 0 && h.r <= m.iw && h.w > 0), m.heads.filter((h) => h.l < 0 || h.r > m.iw));
      s.ok(`${tag}: every row action button is fully inside the viewport (${m.actions.length} buttons)`, m.actions.length > 0 && m.actions.every((a) => a.l >= 0 && a.r <= m.iw && a.w > 0), m.actions.filter((a) => a.r > m.iw || a.l < 0).slice(0, 6));
      s.ok(`${tag}: documentElement.scrollWidth <= innerWidth`, m.docSw <= m.iw, { docSw: m.docSw, iw: m.iw });
      s.ok(`${tag}: table container scrollWidth <= clientWidth`, m.containerSw <= m.containerCw, { sw: m.containerSw, cw: m.containerCw });
      s.ok(`${tag}: last cell of every row ends inside the viewport`, m.maxRight <= m.iw, m.maxRight);
      s.ok(`${tag}: every payment badge computes to at least 14px (${m.badgeSizes.length} badges)`, m.badgeSizes.length > 0 && Math.min(...m.badgeSizes) >= 14, { min: Math.min(...m.badgeSizes) });
      s.ok(`${tag}: rows at least 52px high`, m.minRowHeight >= 52, m.minRowHeight);
      const main = m.controls.filter((c) => !/^(Previous|Next)/.test(c.n) && c.t < 260);
      const spread = Math.max(...main.map((c) => c.t + c.h / 2)) - Math.min(...main.map((c) => c.t + c.h / 2));
      s.ok(`${tag}: filter bar controls sit on one row (vertical centre spread <= 8px)`, spread <= 8, { spread, controls: main.map((c) => `${c.n}@${c.t}`) });
      s.note(`${tag}: docSw=${m.docSw} iw=${m.iw} container=${m.containerSw}/${m.containerCw} maxRight=${m.maxRight} fonts=${JSON.stringify(m.fonts)} headRights=${m.heads.map((h) => h.r).join(",")}`);
      await s.shot(page, `13-${tag}`);
      await scrollAll(page, "bottom");
      await s.shot(page, `13-${tag}-bottom`);
      await page.close();
    }
  });

  await scenario("13b", "sticky-header-below-xl", async (s) => {
    const { page } = s.track(await open("pharmacist", { width: 1200, height: 800 }));
    await goto(page, "/dashboard/pharmacy/sales");
    const before = await page.evaluate(() => {
      const table = [...document.querySelectorAll("table")].find((t) => t.getClientRects().length);
      const wrapper = table.parentElement;
      const rows = table.querySelectorAll("tbody tr").length;
      const target = table.querySelectorAll("tbody tr")[Math.min(30, rows - 1)];
      wrapper.scrollTop = target.offsetTop;
      return { rows, wrapperScrolls: wrapper.scrollHeight > wrapper.clientHeight + 1, scrollTop: Math.round(wrapper.scrollTop) };
    });
    await page.waitForTimeout(250);
    s.ok("wrapper has at least 31 rows and scrolls vertically", before.rows >= 31 && before.wrapperScrolls && before.scrollTop > 500, before);
    const after = await page.evaluate(() => {
      const table = [...document.querySelectorAll("table")].find((t) => t.getClientRects().length);
      const wrapper = table.parentElement.getBoundingClientRect();
      const heads = [...table.querySelectorAll("thead th")].map((th) => {
        const b = th.getBoundingClientRect();
        return { text: th.innerText.replace(/\s+/g, " ").trim(), top: Math.round(b.top - wrapper.top), h: Math.round(b.height), onTop: document.elementFromPoint(b.left + 4, b.top + b.height / 2)?.closest("th") === th };
      });
      return heads;
    });
    s.ok("every column header stays pinned at the top of the table after scrolling 30 rows", after.every((h) => h.top >= -1 && h.top <= 2 && h.h > 0 && h.onTop), after);
    await s.shot(page, "13b-1200-scrolled");
    await scrollAll(page, "bottom");
    const fb = await footerBox(page);
    const last = await vis(page).locator("tbody tr").last().boundingBox();
    s.ok("footer does not cover the last row at 1200", last.y + last.height <= fb.box.y + 1, { lastBottom: last.y + last.height, footerTop: fb.box.y });
  });

  await scenario("14", "due-and-collected", async (s) => {
    const { page } = s.track(await open("pharmacist"));
    await goto(page, "/dashboard/pharmacy/sales");
    const partial = bySale("PHI-2026-073");
    const unpaid = bySale("PHI-2026-074");
    s.check("seed partial bill due", partial.due, 185000);
    await search(page, "Bill No", partial.billNo);
    let rows = await readRows(page);
    s.check("partial bill shows Due badge then UPI", rows[0].payments, [`Due ${fmt(185000)}`, "UPI"]);
    s.check("partial bill amount is the full bill total", rows[0].amount, fmt(285000));
    await s.shot(page, "14-partial-due");
    await search(page, "Bill No", unpaid.billNo);
    rows = await readRows(page);
    s.check("unpaid bill shows only a Due badge (no payment modes)", rows[0].payments, [`Due ${fmt(96000)}`]);
    await search(page, "Bill No", "");

    const dueRows = newest(fySales.filter((r) => r.due > 0));
    s.check("seed: exactly the two bills have due", dueRows.map((r) => r.invoiceNumber).sort(), ["PHI-2026-073", "PHI-2026-074"]);
    await paymentSelect(page).selectOption({ label: "Due (unpaid)" });
    await settle(page);
    let { foot } = await snapshot(page);
    rows = await readRows(page);
    s.check("Due (unpaid): lists exactly the bills with due>0", rows.map(rowKey).sort(), rowsOf(dueRows).sort());
    const dueSum = dueRows.reduce((a, r) => a + r.due, 0);
    s.check("Due (unpaid) footer", [foot.label, foot.total, foot.count, foot.unit], ["Due (unpaid)", fmt(dueSum), 2, "bills"]);
    s.check("Due (unpaid) pager", foot.pager, "1–2 of 2 rows");
    s.check("URL carries pay=CREDIT", new URL(page.url()).searchParams.get("pay"), "CREDIT");
    await s.shot(page, "14-due-filter");

    await paymentSelect(page).selectOption({ label: "UPI" });
    await settle(page);
    ({ foot } = await snapshot(page));
    rows = await readRows(page);
    const upiRows = newest(withMode(fySales, "UPI"));
    const upiCollected = collectedBy(upiRows, "UPI");
    s.ok("seed check: UPI collected differs from the sum of those bills' totals", upiCollected !== finalSum(upiRows), { upiCollected, billTotals: finalSum(upiRows) });
    s.check("Collected by UPI footer from payment amounts", [foot.label, foot.total, foot.count, foot.unit], ["Collected by UPI", fmt(upiCollected), finals(upiRows).length, "bills"]);
    s.check("UPI rows", rows.map(rowKey).sort(), rowsOf(upiRows.slice(0, 50)).sort());
    s.ok("partial bill (UPI 1,000.00 of 2,850.00) is in the UPI list", rows.some((r) => r.first === "PHI-2026-073"));
    await s.shot(page, "14-collected-upi");
  });

  await scenario("15", "print-escaping", async (s) => {
    const { page, context } = s.track(await open("pharmacist"));
    await goto(page, "/dashboard/pharmacy/sales");
    const bill = bySale("PHI-2026-075");
    s.check("seed: HTML patient name", bill.patient, data.xssName);
    await search(page, "Bill No", bill.billNo);
    const rows = await readRows(page);
    s.check("register shows the HTML name as literal text", rows.map((r) => r.patient), [data.xssName]);
    s.check("register rendered no <img> element for it", await page.locator('img[src="x"]').count(), 0);
    s.check("grouped amount in the register", rows[0].amount, "₹1,35,234.40");
    const printed = await printAndCapture(page, context, vis(page).getByRole("button", { name: `Print ${bill.billNo}` }));
    s.check("window.__xss is unset in every frame", printed.xss.filter((v) => v !== undefined), []);
    s.check("window.__xss unset on the main page", await page.evaluate(() => window.__xss), undefined);
    s.ok("receipt text contains the literal '<img'", printed.text.includes("<img"), printed.text.slice(0, 300));
    s.check("receipt DOM has no <img> element", printed.images, 0);
    s.ok("srcdoc has the escaped form and no raw tag", printed.html.includes("&lt;img src=x onerror=window.__xss=1&gt;") && !printed.html.includes("<img src=x"), printed.html.slice(0, 200));
    s.ok("receipt shows the clinic name", printed.text.includes(clinic.name), printed.text.slice(0, 200));
    s.ok("receipt shows the clinic address", printed.text.includes(clinic.address), printed.text.slice(0, 300));
    s.ok("receipt shows the grouped grand total ₹1,35,234.40", printed.text.includes("₹1,35,234.40"), printed.text);
    s.check("print opened no popup", printed.newPages, 0);
    s.check("window.print called once", printed.calls, 1);
    await s.shot(page, "15-print-escaping");
  });

  await scenario("16", "counter-print-and-blocked-actions", async (s) => {
    const { page, context } = s.track(await open("pharmacist"));
    await goto(page, "/dashboard/pharmacy/sales");
    const cs = bySale("CS-2026-005");
    await search(page, "Bill No", cs.billNo);
    let rows = await readRows(page);
    s.check("counter-sale Print enabled", [rows[0].print.disabled, rows[0].print.tag], [null, "BUTTON"]);
    const printed = await printAndCapture(page, context, vis(page).getByRole("button", { name: `Print ${cs.billNo}` }));
    s.ok("receipt title", printed.text.includes("Pharmacy Receipt CS-2026-005"), printed.text.slice(0, 120));
    s.ok("receipt lines: item names, batch, qty", ["Paracetamol 650mg Tab", "Cough Syrup 100ml", "B-2201", "CS-77"].every((t) => printed.text.includes(t)), printed.text);
    s.ok("receipt total and line amounts", [fmt(41850), fmt(2500), fmt(39350)].every((t) => printed.text.includes(t)), printed.text);
    s.ok("receipt customer, payment mode and clinic", ["Bhavesh Thakkar", "UPI", clinic.name].every((t) => printed.text.includes(t)), printed.text);
    s.check("window.print called once", printed.calls, 1);
    s.check("no popup", printed.newPages, 0);
    await s.shot(page, "16-counter-receipt");
    await search(page, "Bill No", "");

    await openMore(page);
    for (const [stateLabel, reason] of [["Draft", "Finish this draft bill first"], ["Cancelled", "This bill is cancelled"]]) {
      await openMore(page);
      await selectByLabel(page, "State").selectOption({ label: stateLabel });
      await settle(page);
      rows = await readRows(page);
      s.ok(`${stateLabel}: rows present`, rows.length > 0, rows.length);
      s.ok(`${stateLabel}: Print and WhatsApp are aria-disabled, not tab stops, with reason via aria-describedby`, rows.every((r) => [r.print, r.wa].every((a) => a.disabled === "true" && a.tabindex === "-1" && a.reason === reason && a.tag === "BUTTON")), rows.map((r) => [r.print, r.wa]));
      s.ok(`${stateLabel}: includes a counter sale`, rows.some((r) => r.lines.includes("Counter sale")), rows.map((r) => r.lines));
      for (const kind of ["Print", "WhatsApp"]) {
        for (const index of [0, rows.length - 1]) {
          const btn = vis(page).locator("tbody tr").nth(index).locator(kind === "Print" ? 'button[aria-label^="Print"]' : 'button[aria-label*="WhatsApp"]');
          await btn.hover();
          const at = await btn.boundingBox();
          await page.mouse.move(at.x + at.width / 2 + 2, at.y + at.height / 2 + 2);
          await page.waitForTimeout(650);
          const tipText = clean((await page.locator('[role="tooltip"]').first().innerText().catch(() => "")) || "");
          s.check(`${stateLabel}: row ${index} ${kind} tooltip shows the reason on hover`, tipText, reason);
          if (!tipText) await s.shot(page, `16-no-tooltip-${stateLabel.toLowerCase()}-${index}-${kind}`);
          await page.mouse.move(5, 5);
          await page.waitForTimeout(250);
        }
      }
      const framesBefore = await page.locator("iframe[data-print-frame]").count();
      await vis(page).locator("tbody tr").first().locator('button[aria-label^="Print"]').click({ force: true });
      await page.waitForTimeout(500);
      s.check(`${stateLabel}: clicking disabled Print opens nothing`, await page.locator("iframe[data-print-frame]").count(), framesBefore);
      await s.shot(page, `16-blocked-${stateLabel.toLowerCase()}`);
    }
  });

  await scenario("17", "draft-link", async (s) => {
    const { page } = s.track(await open("pharmacist"));
    await goto(page, "/dashboard/pharmacy/sales");
    const draft = bySale("PHI-2026-023");
    await search(page, "Bill No", draft.reserved);
    let { rows, foot } = await snapshot(page);
    s.check("searching the reserved number in Sales finds the draft", rows.map((r) => r.lines), [["Draft", `${draft.reserved} not final`]]);
    s.check("draft is excluded from the total", [foot.total, foot.count, foot.note], [fmt(0), 0, "1 draft not included"]);
    s.check("draft row reopens the bill in Sales", await vis(page).locator("tbody tr a").first().getAttribute("href"), `/dashboard/pharmacy/sales/bill?draft=${draft.recordId}`);
    await s.shot(page, "17-draft-found");
    await vis(page).locator("tbody tr a").first().click();
    await page.waitForURL("**/dashboard/pharmacy/sales/bill?draft=**", { timeout: 120000 });
    const reopened = await page.getByText(`${draft.reserved} not final`).first().waitFor({ timeout: 120000 }).then(() => true, () => false);
    s.ok("the reopened draft names its reserved number", reopened, page.url());
    await s.shot(page, "17-draft-reopened");
    await page.goBack();
    await vis(page).locator("table").first().waitFor({ timeout: 120000 });
    await settle(page);
    s.check("browser Back returns to Sales with the search kept", [await vis(page).getByRole("searchbox").inputValue(), (await readRows(page)).map((r) => r.first)], [draft.reserved, ["Draft"]]);

    await search(page, "Bill No", "");
    await openMore(page);
    await selectByLabel(page, "State").selectOption({ label: "Draft" });
    await selectByLabel(page, "Source").selectOption({ label: "Counter sales" });
    await settle(page);
    rows = await readRows(page);
    s.check("draft counter sale row", rows.map((r) => r.lines), [["Draft", "Counter sale"]]);
    await vis(page).locator("tbody tr a").first().click();
    await page.waitForURL("**/dashboard/inventory**", { timeout: 120000 });
    const ws = new URL(page.url());
    s.ok("draft counter sale opens the workspace editor with document= and return=", ws.searchParams.get("view") === "COUNTER_SALE" && ws.searchParams.has("document") && (ws.searchParams.get("return") ?? "").startsWith("/dashboard/pharmacy/sales"), page.url());
  });

  await scenario("18", "return-against-bill", async (s) => {
    const { page, context } = s.track(await open("pharmacist"));
    await goto(page, "/dashboard/pharmacy/sales?tab=returns");
    const stockOnly = fyReturns.find((r) => r.stockLinked);
    s.check("seed: a return linked only via stock lines", [stockOnly.invoiceNumber, stockOnly.linked], ["SR-2026-006", ["PHI-2026-050"]]);
    await search(page, "Bill No", stockOnly.billNo);
    let rows = await readRows(page);
    s.check("Against bill shows the bill number resolved from the stock line", rows.map((r) => r.against), [["PHI-2026-050"]]);
    const wa = new URL(rows[0].wa.href);
    s.check("return WhatsApp message", wa.searchParams.get("text"), `Dear ${stockOnly.patient}, ${clinic.name} has processed a refund of ${fmt(25000)} against bill PHI-2026-050 on ${display(stockOnly.billDay)}.`);
    await s.shot(page, "18-return-against-stock-line");
    const printed = await printAndCapture(page, context, vis(page).getByRole("button", { name: `Print ${stockOnly.billNo}` }));
    s.ok("return receipt: title, line, refund total", ["Sales Return SR-2026-006", "Paracetamol 650mg Tab", "B-2201", "Refund total", fmt(25000), clinic.name].every((t) => printed.text.includes(t)), printed.text);
    await search(page, "Bill No", "");
    const noLink = fyReturns.find((r) => r.invoiceNumber === "SR-2026-005");
    await search(page, "Bill No", noLink.billNo);
    rows = await readRows(page);
    s.check("a return with no bill link shows an em dash", rows.map((r) => r.against), [["—"]]);
  });

  await scenario("19", "workspace-round-trip", async (s) => {
    const { page } = s.track(await open("pharmacist"));
    await goto(page, "/dashboard/pharmacy/sales?tab=returns");
    await page.getByRole("button", { name: "New return" }).click();
    await page.waitForURL("**/dashboard/inventory**", { timeout: 120000 });
    const back = page.getByRole("button", { name: /^Back/ }).first();
    await back.waitFor({ timeout: 120000 });
    s.ok("workspace shows a Back control", await back.isVisible());
    await s.shot(page, "19-workspace-new-return");
    await back.click();
    await page.waitForURL("**/dashboard/pharmacy/sales**", { timeout: 120000 });
    const url = new URL(page.url());
    s.check("Back returns to /dashboard/pharmacy/sales?tab=returns", `${url.pathname}${url.search}`, "/dashboard/pharmacy/sales?tab=returns");
    await vis(page).locator("table").first().waitFor({ timeout: 120000 });
    await settle(page);
    s.check("Returns tab is selected", await page.getByRole("tab", { name: "Returns" }).getAttribute("aria-selected"), "true");

    await paymentSelect(page, "Refund").selectOption({ label: "UPI" });
    await settle(page);
    await page.getByRole("button", { name: "New return" }).click();
    await page.waitForURL("**/dashboard/inventory**", { timeout: 120000 });
    const back2 = page.getByRole("button", { name: /^Back/ }).first();
    await back2.waitFor({ timeout: 120000 });
    await back2.click();
    await page.waitForURL("**/dashboard/pharmacy/sales**", { timeout: 120000 });
    await vis(page).locator("table").first().waitFor({ timeout: 120000 });
    await settle(page);
    const filtered = new URL(page.url());
    s.check("Back keeps the Refund=UPI filter in the URL", [filtered.searchParams.get("tab"), filtered.searchParams.get("pay")], ["returns", "UPI"]);
    s.check("Refund select still UPI", await paymentSelect(page, "Refund").inputValue(), "UPI");
    await s.shot(page, "19-back-to-returns");
  });

  await scenario("20", "tabs-keep-filters", async (s) => {
    const { page } = s.track(await open("pharmacist"));
    await goto(page, "/dashboard/pharmacy/sales");
    await preset(page, "Today");
    const todayText = `${display(data.today)} – ${display(data.today)}`;
    s.check("Sales shows Today", await rangeText(page), todayText);
    const todaySales = sales.filter((r) => r.billDay === data.today);
    s.check("Sales Today total", (await footer(page)).total, fmt(finalSum(todaySales)));

    await page.getByRole("tab", { name: "Returns" }).click();
    await page.waitForFunction(() => location.search.includes("tab=returns"), null, { timeout: 30000 });
    await settle(page);
    s.check("Returns has its own default FY range", await rangeText(page), `${display(FY.from)} – ${display(FY.to)}`);
    s.check("Returns tab is selected", await page.getByRole("tab", { name: "Returns" }).getAttribute("aria-selected"), "true");

    await page.getByRole("tab", { name: "Sales" }).click();
    await page.waitForFunction(() => !location.search.includes("tab=returns"), null, { timeout: 30000 });
    await settle(page);
    s.check("back on Sales: Today is still set", await rangeText(page), todayText);
    s.check("back on Sales: Period preset still Today", await periodSelect(page).inputValue(), "today");
    const backRows = await readRows(page);
    s.check("back on Sales: rows are today's", backRows.filter((r) => !r.empty).map(rowKey).sort(), rowsOf(todaySales).sort());
    if (!todaySales.length) s.ok("back on Sales: no sales today shows the empty state", /No sales/.test(backRows[0]?.empty ?? ""), backRows);
    s.check("Sales URL kept from/to", [new URL(page.url()).searchParams.get("from"), new URL(page.url()).searchParams.get("to")], [data.today, data.today]);

    await page.getByRole("tab", { name: "Returns" }).click();
    await page.waitForFunction(() => location.search.includes("tab=returns"), null, { timeout: 30000 });
    await settle(page);
    await page.goBack();
    await page.waitForFunction(() => !location.search.includes("tab=returns"), null, { timeout: 30000 });
    await settle(page);
    s.check("browser Back after a tab switch returns to the previous tab (Sales)", await page.getByRole("tab", { name: "Sales" }).getAttribute("aria-selected"), "true");
    s.check("... and Sales still shows Today", await rangeText(page), todayText);
    await page.goForward();
    await page.waitForFunction(() => location.search.includes("tab=returns"), null, { timeout: 30000 });
    await settle(page);
    s.check("browser Forward returns to Returns", await page.getByRole("tab", { name: "Returns" }).getAttribute("aria-selected"), "true");
    await s.shot(page, "20-tabs-forward");
  });

  await scenario("21", "date-entry", async (s) => {
    const { page } = s.track(await open("pharmacist"));
    await goto(page, "/dashboard/pharmacy/sales");
    let fetches = 0;
    page.on("request", (r) => r.url().includes("/pharmacy/sales-register") && fetches++);
    await openDates(page);
    await s.shot(page, "21-date-popover");
    const from = dateInput(page, "From");
    const to = dateInput(page, "To");
    s.check("native date inputs are not used (text inputs with dd/mm/yyyy placeholder)", [await from.evaluate((el) => el.type), await from.getAttribute("placeholder")], ["text", "dd/mm/yyyy"]);
    s.check("From shows dd/mm/yyyy", await from.inputValue(), "01/04/2026");

    await to.click();
    await to.fill("");
    const baseline = fetches;
    const fromWhileTyping = [];
    for (const ch of "31/03/2027") {
      await page.keyboard.type(ch);
      fromWhileTyping.push(await from.inputValue());
    }
    s.check("typing 31/03/2027 into To char by char never changes From", [...new Set(fromWhileTyping)], ["01/04/2026"]);
    s.check("no fetch while typing", fetches - baseline, 0);
    s.check("To holds the typed value", await to.inputValue(), "31/03/2027");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(800);
    s.check("committed range unchanged", await rangeText(page), "01/04/2026 – 31/03/2027");

    await to.fill("");
    const fromWhileTyping2 = [];
    for (const ch of "30/11/2026") {
      await page.keyboard.type(ch);
      fromWhileTyping2.push(await from.inputValue());
    }
    s.check("typing 30/11/2026 never changes From", [...new Set(fromWhileTyping2)], ["01/04/2026"]);
    await page.keyboard.press("Enter");
    await settle(page);
    s.check("valid To commits and From stays", await rangeText(page), "01/04/2026 – 30/11/2026");
    s.check("URL has to=2026-11-30 and default from", [new URL(page.url()).searchParams.get("to"), new URL(page.url()).searchParams.get("from")], ["2026-11-30", null]);

    const before = fetches;
    await to.fill("31/02/2027");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(900);
    const alert = vis(page).locator('[role="alert"]').filter({ hasText: "dd/mm/yyyy" });
    s.check("impossible date 31/02/2027 shows an inline error", await alert.count(), 1);
    s.ok("error text names the field and format", /To date as dd\/mm\/yyyy/.test(await alert.innerText().catch(() => "")), await alert.innerText().catch(() => ""));
    s.check("impossible date does not fetch", fetches - before, 0);
    s.check("committed range unchanged after the error", await rangeText(page), "01/04/2026 – 30/11/2026");
    await s.shot(page, "21-date-error");

    await to.fill("30/11/2026");
    await from.fill("01/01/2027");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(700);
    s.ok("From after To shows an inline error", (await vis(page).locator('[role="alert"]').filter({ hasText: "after the To date" }).count()) === 1);
    s.check("From after To does not fetch", fetches - before, 0);
    await from.fill("01/01/1999");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(700);
    s.ok("year before 2000 is rejected inline", (await vis(page).locator('[role="alert"]').filter({ hasText: "2000 or later" }).count()) === 1);
    s.check("year before 2000 does not fetch", fetches - before, 0);
    await page.keyboard.press("Escape");
    s.check("Escape closes the popover", await datesButton(page).getAttribute("aria-expanded"), "false");
    s.check("Escape restores the committed range", await rangeText(page), "01/04/2026 – 30/11/2026");
  });

  await scenario("22", "error-state", async (s) => {
    const { page } = s.track(await open("pharmacist"));
    await goto(page, "/dashboard/pharmacy/sales");
    s.ok("loaded with a total before the outage", (await footer(page)).total === fmt(finalSum(fySales)));
    await page.route(/\/pharmacy\/sales-register/, (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "Simulated register outage" }) }));
    await paymentSelect(page).selectOption({ label: "Cash" });
    await vis(page).locator('[role="alert"]').first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(600);
    const alertText = clean(await vis(page).locator('[role="alert"]').first().innerText());
    s.ok("error banner shows", /Could not load sales/.test(alertText), alertText);
    s.ok("banner carries the server message", /Simulated register outage/.test(alertText), alertText);
    s.check("Retry button exists", await vis(page).getByRole("button", { name: "Retry" }).count(), 1);
    s.check("no 'Total Amount ₹' text is visible", await vis(page).getByText(/Total Amount ₹/).count(), 0);
    s.check("footer says the total is unavailable", (await footer(page)).raw.startsWith("Total not available"), true);
    s.ok("no 'Collected by' or stale ₹ total in the footer", !/₹/.test((await footer(page)).raw.split("|")[0]), (await footer(page)).raw);
    const dim = await vis(page).locator("[aria-busy]").first().evaluate((el) => ({ inert: el.hasAttribute("inert"), opacity: getComputedStyle(el).opacity }));
    s.ok("stale rows are dimmed and inert", dim.inert && Number(dim.opacity) < 0.5, dim);
    s.check("pager hidden while failed", await vis(page).locator('nav[aria-label$="pages"]').count(), 0);
    await s.shot(page, "22-error-state");
    await page.unroute(/\/pharmacy\/sales-register/);
    await vis(page).getByRole("button", { name: "Retry" }).click();
    await settle(page);
    const recovered = await footer(page);
    s.check("Retry recovers with the Cash view", [recovered.label, recovered.total], ["Collected by Cash", fmt(collectedBy(withMode(fySales, "CASH"), "CASH"))]);
    s.check("banner gone after recovery", await vis(page).locator('[role="alert"]').count(), 0);
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
