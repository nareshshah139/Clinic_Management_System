"use strict";
// CR-33c Day-wise Summary (pharmacy CRs 4.5): state-machine model + driver.
const D = require("./reports-driver.cjs");
const E = require("./reports-expect.cjs");
const { F, displayDate, num, near, inr } = D;

const SLABS = [0, 5, 12, 18, 28, 40];
const RANGE_NARROW = ["2026-11-03", "2026-11-04"];
const RANGE_EMPTY = ["2026-10-01", "2026-10-07"];
const RANGE_TOO_LONG = ["2025-01-01", "2026-11-08"];
const defaultRange = () => [E.istMonthStart(), E.istToday()];
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const TABLE = /Day-wise (sales|purchase) summary/;

const model = {
  id: "cr33c-day-wise-summary",
  title: "CR-33c Day-wise Summary",
  initial: "PurchasesHome",
  maxSteps: 16,
  states: {
    PurchasesHome: { label: "Inventory > Purchases, no report open" },
    Loaded: { label: "Loaded: Sales, default range (month to date)" },
    Loading: { label: "Loading (response held)" },
    LoadedRange: { label: "Loaded: Sales, 3-4 Nov" },
    LoadedPurchase: { label: "Loaded: Purchase type" },
    Empty: { label: "Empty range (Download disabled)" },
    InvalidBlocked: { label: "End before start: submit blocked, no request" },
    ErrorRange: { label: "Range over 366 days: server error shown" },
    Forbidden: { label: "RECEPTION: forbidden message" },
    HomeNoReportTasks: { label: "RECEPTION: Purchases home, report tasks absent from menu" },
    LoadedOtherRole: { label: "Loaded as DOCTOR / PHARMACIST" },
    TooltipOpen: { label: "Bill No. (i) tooltip open" },
    ScrolledRight: { label: "Scrolled right, left columns frozen" },
    Downloaded: { label: "CSV downloaded and checked" },
  },
  transitions: [
    { from: "PurchasesHome", event: "openFromMenu", to: "Loaded", label: "More tasks > Day-wise summary" },
    { from: "Loaded", event: "leaveReport", to: "PurchasesHome", label: "Purchases tab / address bar" },
    { from: "Loaded", event: "goHeld", to: "Loading", label: "Go with the response held" },
    { from: "Loading", event: "responseArrives", to: "Loaded" },
    { from: "Loaded", event: "setNarrowRange", to: "LoadedRange" },
    { from: "LoadedRange", event: "resetRange", to: "Loaded" },
    { from: "LoadedRange", event: "reload", to: "Loaded", label: "reload: range not persisted" },
    { from: "Loaded", event: "typePurchase", to: "LoadedPurchase" },
    { from: "LoadedPurchase", event: "typeSales", to: "Loaded" },
    { from: "Loaded", event: "setEmptyRange", to: "Empty" },
    { from: "Empty", event: "resetRange", to: "Loaded" },
    { from: "Loaded", event: "setBackwardsRange", to: "InvalidBlocked" },
    { from: "InvalidBlocked", event: "resetRange", to: "Loaded" },
    { from: "Loaded", event: "setTooLongRange", to: "ErrorRange" },
    { from: "ErrorRange", event: "resetRange", to: "Loaded" },
    { from: "Loaded", event: "switchReception", to: "Forbidden" },
    { from: "Forbidden", event: "switchAdmin", to: "Loaded" },
    { from: "Loaded", event: "switchReceptionHome", to: "HomeNoReportTasks" },
    { from: "HomeNoReportTasks", event: "switchAdminHome", to: "PurchasesHome" },
    { from: "Loaded", event: "switchAccountant", to: "LoadedOtherRole" },
    { from: "Loaded", event: "switchDoctor", to: "LoadedOtherRole" },
    { from: "Loaded", event: "switchPharmacist", to: "LoadedOtherRole" },
    { from: "LoadedOtherRole", event: "switchAdmin", to: "Loaded" },
    { from: "Loaded", event: "hoverBillNoTip", to: "TooltipOpen" },
    { from: "TooltipOpen", event: "moveAway", to: "Loaded" },
    { from: "Loaded", event: "scrollRight", to: "ScrolledRight" },
    { from: "ScrolledRight", event: "scrollLeft", to: "Loaded" },
    { from: "Loaded", event: "download", to: "Downloaded" },
    { from: "LoadedPurchase", event: "download", to: "Downloaded" },
    { from: "Downloaded", event: "reload", to: "Loaded" },
  ],
};

// ---- screen reading ---------------------------------------------------------------------------
async function readScreen(page) {
  const table = page.getByRole("table", { name: TABLE });
  const head0 = await table.locator("thead tr").nth(0).locator("th").allInnerTexts();
  const head1 = await table.locator("thead tr").nth(1).locator("th").allInnerTexts();
  const totalsCells = await table.locator("thead tr").nth(2).locator("th,td").allInnerTexts();
  const rows = await table.locator("tbody tr").evaluateAll((trs) => trs.map((tr) => [...tr.cells].map((c) => c.innerText.trim())));
  return { head0: head0.map((t) => t.replace(/\s+/g, " ").trim()), head1: head1.map((t) => t.trim()), totalsCells: totalsCells.map((t) => t.trim()), rows };
}

const money = (cells) => cells.slice(2).map(num);
function expectedMoney(d) {
  const out = [0, 0, 0, 0];
  for (const rate of SLABS) { const s = d.slabs[rate] || { base: 0, sgst: 0, cgst: 0, igst: 0 }; out.push(s.base, s.sgst, s.cgst, s.igst); }
  out.push(d.total.base, d.total.sgst, d.total.cgst, d.total.igst, d.amount);
  return out.map(E.r2);
}
const totalsAsDay = (t) => ({ slabs: t.slabs, total: t.total, amount: t.amount });

async function checkReport(ctx, check, { start, end, type }) {
  const page = ctx.page;
  const exp = E.dayWise(start, end, type);
  const word = type === "SALES" ? "sales" : "purchase";

  check(await page.getByText("Day-wise Summary", { exact: true }).locator("visible=true").count() === 1, "Day-wise Summary title visible");
  check((await page.locator("#day-wise-start").inputValue()) === start && (await page.locator("#day-wise-end").inputValue()) === end, `range pickers show ${start} to ${end}`);
  check((await page.locator("#day-wise-type").inputValue()) === type, `Type dropdown shows ${type}`);
  check(await page.getByRole("button", { name: "Go", exact: true }).isEnabled(), "Go enabled");
  check(await page.getByRole("button", { name: "Download" }).isEnabled(), "Download enabled with rows");

  const s = await readScreen(page);
  // header layout: frozen Bill Date + Bill No., then CESS, slabs, Total
  check(/^Bill Date/.test(s.head0[0]) && /^Bill No\./.test(s.head0[1]), "frozen columns Bill Date, Bill No. come first");
  check(s.head0.slice(2).join("|") === ["CESS", "0%", "5%", "12%", "18%", "28%", "40%", "Total"].join("|"), `slab groups CESS 0% 5% 12% 18% 28% 40% Total (got ${s.head0.slice(2).join(" ")})`);
  check(s.head1.slice(0, 4).join() === "Base,SGST,CGST,IGST" && s.head1.length === 4 * 7 + 4 + 1, "each group has Base SGST CGST IGST (+ Amount)");
  check(await page.getByTestId("slab-totals-row").evaluate((el) => el.parentElement.tagName === "THEAD"), "totals row sits under the header");
  check(s.totalsCells[0] === "Total" && s.totalsCells[1] === plural(exp.totals.billCount, "bill", "bills"), `totals row label "Total", ${exp.totals.billCount} bills`);

  // rows: one per day, ascending, values equal independent SQL
  check(s.rows.length === exp.days.length, `one row per day (${exp.days.length}), not per bill; got ${s.rows.length}`);
  s.rows.forEach((cells, i) => {
    const d = exp.days[i];
    check(cells[0] === displayDate(d.date), `row ${i} date ${displayDate(d.date)} (got ${cells[0]})`);
    const bill = cells[1];
    if (d.noBills) check(bill === "No bills", `${d.date} marked "No bills" (got ${bill})`);
    else if (type === "SALES") {
      const first = d.nums[0], last = d.nums[d.nums.length - 1];
      const range = first === last ? `${first}` : `${first} - ${last}`;
      check(bill.startsWith(range) && !/^\d+ - \d+ - /.test(bill), `${d.date} Bill No. range "${range}" (got "${bill}")`);
      for (const m of d.missing) check(bill.includes(`gap: ${Number(m.n.match(/(\d+)$/)[1])} (${m.status.toLowerCase()})`), `${d.date} shows gap ${m.n} (${m.status})`);
      if (!d.missing.length) check(!/gap/.test(bill), `${d.date} no gap marker`);
      if (d.returns) check(bill.includes(`+ ${plural(d.returns, "customer return", "customer returns")}`), `${d.date} counts the customer return beside the range`);
    } else check(bill.includes(d.numbers.join(", ")) && bill.startsWith(plural(d.numbers.length, "bill", "bills")), `${d.date} lists supplier bills ${d.numbers.join(", ")} (got "${bill}")`);
    const got = money(cells), want = expectedMoney(d);
    check(got.length === 33 && got.every((v, k) => near(v, want[k])), `${d.date} money cells equal SQL expectation ${JSON.stringify(want.slice(4).filter((v) => v))} (got ${JSON.stringify(got.filter((v) => v))})`);
    check(near(got[32], got[28] + got[29] + got[30] + got[31]), `${d.date} Total amount = Base+SGST+CGST+IGST`);
    for (let k = 0; k < 7; k++) check(near(got[4 * k + 1], got[4 * k + 2]) || got[4 * k + 3] > 0, `${d.date} SGST = CGST unless IGST`);
  });

  // reconciliation: rows sum to totals row, Total column sums to the top-right figure
  const tot = money(s.totalsCells);
  const colSums = Array.from({ length: 33 }, (_, k) => s.rows.reduce((a, c) => a + num(c[k + 2]), 0));
  check(tot.length === 33 && colSums.every((v, k) => near(v, tot[k], 0.011 * s.rows.length)), "daily rows sum to the totals row in every column");
  check(near(tot[32], exp.totals.amount) && near(tot[28], E.r2(exp.totals.total.base)), `totals row equals SQL totals (amount ${exp.totals.amount})`);
  const topRight = num(await page.getByTestId("day-wise-range-total").innerText());
  check(near(topRight, tot[32]) && near(topRight, colSums[32], 0.011 * s.rows.length), `Total for the range (top right ${topRight}) = totals row Amount = sum of daily Totals`);
  check(await page.getByText("Total for the range").isVisible(), "Total for the range label visible");

  // summary sentence
  const noBillDays = exp.days.filter((d) => d.noBills).length;
  const missing = exp.days.reduce((a, d) => a + d.missing.length, 0);
  const sentence = await page.getByText(/ over \d+ days/).first().innerText();
  check(sentence.includes(`${plural(exp.totals.billCount, "bill", "bills")} over ${exp.days.length} days`), `summary says ${exp.totals.billCount} bills over ${exp.days.length} days`);
  check(noBillDays ? sentence.includes(`${noBillDays} days with no bills are shown as ₹0 rows`.replace("1 days with no bills are", "1 day with no bills is")) : !/no bills/.test(sentence), `summary mentions ${noBillDays} no-bill days`);
  check(missing ? sentence.includes(`${plural(missing, "bill number is", "bill numbers are")} missing from the sequence`) : !/missing/.test(sentence), `summary mentions ${missing} missing numbers`);
  return { exp, screen: s };
}

// ---- driver -----------------------------------------------------------------------------------
async function fillRange(page, start, end) {
  await page.locator("#day-wise-start").fill(start);
  await page.locator("#day-wise-end").fill(end);
}
const go = (ctx) => ctx.page.getByRole("button", { name: "Go", exact: true }).click();
const goSettled = (ctx) => D.andSettle(ctx, "/day-wise-summary", () => go(ctx));
const REPORT_URL = (ctx) => `${ctx.baseUrl}/dashboard/inventory?area=purchases&view=daywise`;

async function openReport(ctx, who) {
  await D.useRole(ctx, who);
  ctx.vars.type = "SALES";
  await D.andSettle(ctx, "/day-wise-summary", () => ctx.page.goto(REPORT_URL(ctx)));
  await ctx.page.waitForTimeout(150);
}
async function resetToDefault(ctx) {
  const [s, e] = defaultRange();
  await fillRange(ctx.page, s, e);
  if ((await ctx.page.locator("#day-wise-type").inputValue()) !== "SALES") {
    await D.andSettle(ctx, "/day-wise-summary", () => ctx.page.locator("#day-wise-type").selectOption("SALES"));
  }
  await goSettled(ctx);
  ctx.vars.type = "SALES";
}

const driver = {
  async setup({ baseUrl, apiUrl, shared }) {
    await F.seed({ apiUrl, shared });
  },
  async reset(ctx) {
    D.trackRequests(ctx);
    ctx.vars.type = "SALES";
    await D.openPurchasesHome(ctx, "admin");
  },
  actions: {
    openFromMenu: (ctx) => D.andSettle(ctx, "/day-wise-summary", () => D.openFromMenu(ctx, "Day-wise summary")),
    leaveReport: async (ctx) => { await ctx.page.getByRole("button", { name: "Purchases", exact: true }).first().click().catch(() => {}); if (/view=daywise/.test(ctx.page.url())) await ctx.page.goto(ctx.baseUrl + "/dashboard/inventory?area=purchases"); },
    async goHeld(ctx) { ctx.vars.release = await D.holdResponses(ctx, "pharmacy/compliance/day-wise-summary"); await go(ctx); },
    async responseArrives(ctx) { const done = ctx.page.waitForResponse((r) => r.url().includes("/day-wise-summary")); ctx.vars.release(); await done; await ctx.page.unroute("**/pharmacy/compliance/day-wise-summary*"); await ctx.page.getByText(/^Loading /).waitFor({ state: "hidden" }); },
    async setNarrowRange(ctx) { await fillRange(ctx.page, ...RANGE_NARROW); await goSettled(ctx); },
    async setEmptyRange(ctx) { await fillRange(ctx.page, ...RANGE_EMPTY); await goSettled(ctx); },
    async setBackwardsRange(ctx) { ctx.vars.before = ctx.vars.requests.length; await fillRange(ctx.page, "2026-11-06", "2026-11-02"); await go(ctx); await ctx.page.waitForTimeout(400); },
    async setTooLongRange(ctx) { await fillRange(ctx.page, ...RANGE_TOO_LONG); await goSettled(ctx); },
    resetRange: (ctx) => resetToDefault(ctx),
    async typePurchase(ctx) { await D.andSettle(ctx, "/day-wise-summary", () => ctx.page.locator("#day-wise-type").selectOption("PURCHASE")); ctx.vars.type = "PURCHASE"; },
    async typeSales(ctx) { await D.andSettle(ctx, "/day-wise-summary", () => ctx.page.locator("#day-wise-type").selectOption("SALES")); ctx.vars.type = "SALES"; },
    async reload(ctx) { await D.andSettle(ctx, "/day-wise-summary", () => ctx.page.reload()); ctx.vars.type = "SALES"; },
    switchReception: (ctx) => openReport(ctx, "reception"),
    switchAdmin: (ctx) => openReport(ctx, "admin"),
    switchDoctor: (ctx) => openReport(ctx, "doctor"),
    switchAccountant: (ctx) => openReport(ctx, "accountant"),
    async switchReceptionHome(ctx) { await D.openPurchasesHome(ctx, "reception"); },
    async switchAdminHome(ctx) { await D.openPurchasesHome(ctx, "admin"); },
    switchPharmacist: (ctx) => openReport(ctx, "pharmacist"),
    async hoverBillNoTip(ctx) { await ctx.page.getByRole("button", { name: "How the Bill No. column is calculated" }).hover(); await ctx.page.getByRole("tooltip").first().waitFor(); },
    async moveAway(ctx) { await ctx.page.mouse.move(5, 5); await ctx.page.getByRole("tooltip").first().waitFor({ state: "hidden" }).catch(() => {}); },
    async scrollRight(ctx) {
      const cell = ctx.page.getByRole("table", { name: TABLE }).locator("tbody tr").first().locator("td").first();
      ctx.vars.dateX = (await cell.boundingBox()).x;
      await D.scrollTable(ctx.page, TABLE, 100000);
    },
    scrollLeft: (ctx) => D.scrollTable(ctx.page, TABLE, 0),
    async download(ctx) {
      ctx.vars.screen = await readScreen(ctx.page);
      ctx.vars.range = [await ctx.page.locator("#day-wise-start").inputValue(), await ctx.page.locator("#day-wise-end").inputValue()];
      ctx.vars.csvType = ctx.vars.type;
      ctx.vars.topRight = num(await ctx.page.getByTestId("day-wise-range-total").innerText());
      ctx.vars.csv = await D.readCsvDownload(ctx.page, () => ctx.page.getByRole("button", { name: "Download" }).click());
    },
  },
  checks: {
    async PurchasesHome(ctx, check) {
      const p = ctx.page;
      await p.waitForFunction((t) => [...document.querySelectorAll("select option")].some((o) => o.textContent === t), "Day-wise summary", { timeout: 15000 }).catch(() => {});
      check(await p.locator("select").filter({ hasText: "More tasks" }).first().isVisible(), "More tasks… menu visible");
      check((await p.locator("select").filter({ hasText: "More tasks" }).first().locator("option").allInnerTexts()).includes("Day-wise summary"), "menu offers Day-wise summary");
      check((await p.getByText("Day-wise Summary", { exact: true }).count()) === 0 && (await p.getByText("Total for the range").count()) === 0, "no Day-wise report shown yet");
      check(!/view=daywise/.test(p.url()), "URL has no daywise view");
    },
    async Loaded(ctx, check) {
      check(/view=daywise/.test(ctx.page.url()), "URL is view=daywise");
      const [start, end] = defaultRange();
      await checkReport(ctx, check, { start, end, type: "SALES" });
      const bill = await ctx.page.getByRole("table", { name: TABLE }).locator("tbody tr").nth(3).locator("td").nth(1).innerText();
      check(/^3 - 5/.test(bill) && /gap: 4 \(draft\)/.test(bill), `4 Nov shows "3 - 5" with the draft bill's gap (got "${bill}")`);
    },
    async Loading(ctx, check) {
      const p = ctx.page;
      check(await p.getByText("Loading day-wise summary…").first().isVisible(), "loading skeleton announced");
      check(await p.getByRole("button", { name: "Go", exact: true }).isDisabled(), "Go disabled while loading");
      check(await p.getByRole("button", { name: "Download" }).isDisabled(), "Download disabled while loading");
      check((await p.getByTestId("day-wise-range-total").innerText()).trim() === "—", "range total shows — while loading");
      check((await p.getByRole("table", { name: TABLE }).count()) === 0, "no stale table while loading");
    },
    async LoadedRange(ctx, check) {
      const exp = await checkReport(ctx, check, { start: RANGE_NARROW[0], end: RANGE_NARROW[1], type: "SALES" });
      check(exp.screen.rows.length === 2 && exp.exp.totals.amount === 2814.28, `a range, not a month: 2 day rows totalling 2814.28 (got ${exp.exp.totals.amount})`);
    },
    async LoadedPurchase(ctx, check) {
      const [start, end] = defaultRange();
      const r = await checkReport(ctx, check, { start, end, type: "PURCHASE" });
      check(r.exp.totals.amount === 10352.8 && r.exp.totals.billCount === 2, "purchases total 10,352.80 over 2 supplier bills");
      check((await ctx.page.getByText("Day-wise Summary", { exact: true }).locator("visible=true").count()) === 1, "still on Day-wise Summary");
    },
    async Empty(ctx, check) {
      const p = ctx.page;
      check(await p.getByText("No sales bills in this range").isVisible(), "empty-state title");
      check(await p.getByRole("button", { name: "Download" }).isDisabled(), "Download disabled on empty range");
      check(await p.getByRole("button", { name: "Go", exact: true }).isEnabled(), "Go still enabled");
      check((await p.getByRole("table", { name: TABLE }).count()) === 0, "no table");
      check((await p.getByTestId("day-wise-range-total").innerText()).trim() === "₹0.00", "range total shows ₹0.00");
      check(E.dayWise(...RANGE_EMPTY, "SALES").totals.billCount === 0, "SQL agrees: no bills 1-7 Oct");
    },
    async InvalidBlocked(ctx, check) {
      const p = ctx.page;
      check(ctx.vars.requests.length === ctx.vars.before, "no report request was sent for end-before-start");
      check(await p.locator("#day-wise-end").evaluate((el) => !el.checkValidity()), "end date is flagged invalid by the form");
      check((await p.getByRole("alert").filter({ hasText: /Forbidden|range|date/i }).count()) === 0, "no server error alert (blocked client-side)");
      check(await p.getByRole("table", { name: TABLE }).isVisible(), "previous results remain on screen");
    },
    async ErrorRange(ctx, check) {
      const p = ctx.page;
      const alert = p.getByRole("alert").filter({ hasText: /\S/ }).first();
      check(await alert.isVisible(), "error alert shown for a range over 366 days");
      const text = await alert.innerText();
      check(/366/.test(text), `message names the 366-day limit (got "${text}")`);
      check(/Check the dates/.test(text), "hint to check the dates and press Go");
      check(await p.getByRole("button", { name: "Download" }).isDisabled(), "Download disabled on error");
      check((await p.getByRole("table", { name: TABLE }).count()) === 0, "no table on error");
    },
    async Forbidden(ctx, check) {
      const p = ctx.page;
      await p.waitForTimeout(2000);
      const menu = await p.locator("select").filter({ hasText: "More tasks" }).first().locator("option").allInnerTexts().catch(() => []);
      check(!menu.includes("Day-wise summary") && !menu.includes("Item-wise margin"), "RECEPTION menu hides the report tasks even on the direct URL");
      const alert = p.getByRole("alert").filter({ hasText: /pharmacy reports/ });
      check(await alert.isVisible(), "RECEPTION sees the forbidden alert");
      check(/Your role cannot open pharmacy reports/.test(await alert.innerText()), "alert says the role cannot open pharmacy reports");
      check((await p.getByRole("table", { name: TABLE }).count()) === 0, "no data table for RECEPTION");
      check((await p.getByTestId("day-wise-range-total").innerText()).trim() === "—", "no totals leaked");
      check(await p.getByRole("button", { name: "Download" }).isDisabled(), "Download disabled");
      const status = await ctx.context.request.get(`${ctx.apiUrl}/pharmacy/compliance/day-wise-summary?startDate=2026-11-01&endDate=2026-11-07&type=SALES`, { headers: { authorization: `Bearer ${ctx.shared.tokens.reception}` } });
      check(status.status() === 403, `API answers 403 to RECEPTION (got ${status.status()})`);
    },
    async HomeNoReportTasks(ctx, check) {
      const opts = await ctx.page.locator("select").filter({ hasText: "More tasks" }).first().locator("option").allInnerTexts().catch(() => []);
      check(opts.length > 0 && !opts.includes("Day-wise summary") && !opts.includes("Item-wise margin"), `RECEPTION menu hides the report tasks (options: ${opts.join(", ")})`);
      check(ctx.vars.who === "reception", "viewing as RECEPTION");
    },
    async LoadedOtherRole(ctx, check) {
      const [start, end] = defaultRange();
      await checkReport(ctx, check, { start, end, type: "SALES" });
      check(["doctor", "pharmacist", "accountant"].includes(ctx.vars.who), `viewed as ${ctx.vars.who}`);
    },
    async TooltipOpen(ctx, check) {
      const tip = ctx.page.getByRole("tooltip").first();
      check(await tip.isVisible(), "tooltip visible");
      const text = await tip.innerText();
      check(/bill number/i.test(text) && /gap/i.test(text), `tooltip explains the bill-number range and gaps (got "${text.slice(0, 80)}…")`);
      const b = await tip.boundingBox(); const vp = ctx.page.viewportSize();
      check(b.x >= 0 && b.x + b.width <= vp.width && b.y >= 0, "tooltip fully inside the viewport");
      check((await ctx.page.getByRole("button", { name: "How the range total is calculated" }).count()) === 1, "range total also has an (i)");
    },
    async ScrolledRight(ctx, check) {
      const p = ctx.page;
      const table = p.getByRole("table", { name: TABLE });
      const dateCell = table.locator("tbody tr").first().locator("td").first();
      const billCell = table.locator("tbody tr").first().locator("td").nth(1);
      const d = await dateCell.boundingBox(), b = await billCell.boundingBox();
      check(Math.abs(d.x - ctx.vars.dateX) < 2, `Bill Date column frozen at x=${ctx.vars.dateX} (now ${d.x})`);
      check(b.x >= d.x + d.width - 2 && b.x < 600, "Bill No. column frozen beside it");
      check(await dateCell.isVisible() && Math.abs((await table.getByRole("columnheader", { name: "Bill Date" }).boundingBox()).x - ctx.vars.dateX) < 2, "Bill Date header still in view");
      const amountHead = table.getByRole("columnheader", { name: "Amount" });
      const a = await amountHead.boundingBox(); const vp = p.viewportSize();
      check(a.x + a.width <= vp.width + 1 && a.x > b.x + b.width, "Total Amount column scrolled into view on the right");
      const cess = table.getByRole("columnheader", { name: "CESS" });
      const cb = await cess.boundingBox();
      check(cb.x + cb.width <= b.x + b.width + 2, "CESS group scrolled out behind the frozen columns");
      const tr = await table.locator("thead tr").nth(2).locator("th,td").first().boundingBox();
      check(Math.abs(tr.x - d.x) < 2, "totals row also keeps its left cells frozen");
    },
    async Downloaded(ctx, check) {
      const { csv, screen, range, csvType, topRight } = ctx.vars;
      const word = csvType === "SALES" ? "sales" : "purchase";
      check(csv.name === `day-wise-${word}-${range[0]}-to-${range[1]}.csv`, `file name day-wise-${word}-${range[0]}-to-${range[1]}.csv (got ${csv.name})`);
      const exp = E.dayWise(range[0], range[1], csvType);
      check(csv.rows.length === exp.days.length + 1, `CSV has one row per day plus a Total row (${csv.rows.length})`);
      check(csv.head[0] === "Bill Date" && csv.head[1] === "Bill No.", "CSV starts with Bill Date, Bill No.");
      check(["CESS Base", "0% Base", "5% Base", "12% Base", "18% Base", "28% Base", "40% Base", "Total Base", "Total Amount"].every((h) => csv.head.includes(h)), "CSV has every slab group and Total");
      const numeric = csv.head.filter((h) => /Base|SGST|CGST|IGST|Amount|Count/.test(h));
      const days = csv.rows.slice(0, -1), total = csv.rows[csv.rows.length - 1];
      check(total["Bill Date"] === "Total", "last CSV row is Total");
      for (const h of numeric) check(near(days.reduce((a, r) => a + Number(r[h]), 0), Number(total[h]), 0.011 * days.length), `CSV daily rows sum to the Total row in "${h}"`);
      check(near(Number(total["Total Amount"]), topRight), `CSV Total Amount ${total["Total Amount"]} = figure on screen ${topRight}`);
      days.forEach((r, i) => {
        check(r["Bill Date"] === exp.days[i].date, `CSV row ${i} date ${exp.days[i].date}`);
        check(near(Number(r["Total Amount"]), exp.days[i].amount) && near(Number(r["Total Amount"]), num(screen.rows[i][34])), `CSV ${r["Bill Date"]} Total Amount = SQL = screen (${exp.days[i].amount})`);
        const sc = num(screen.rows[i][2 + 12]);
        check(near(Number(r["12% Base"]), E.r2((exp.days[i].slabs[12] || { base: 0 }).base)) && near(Number(r["12% Base"]), sc), `CSV ${r["Bill Date"]} 12% Base = SQL = screen`);
        check(csvType !== "SALES" || (exp.days[i].noBills ? r["Bill No."] === "No bills" : r["Bill No."].startsWith(`${exp.days[i].nums[0]}`)), `CSV ${r["Bill Date"]} Bill No. matches`);
      });
      check(await ctx.page.getByRole("button", { name: "Download" }).isEnabled(), "page still loaded after download");
    },
  },
};

module.exports = { model, driver };
