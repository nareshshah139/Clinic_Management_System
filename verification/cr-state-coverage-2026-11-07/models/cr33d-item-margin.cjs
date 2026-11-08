"use strict";
// CR-33d Item-wise Margin (pharmacy CRs 4.6): state-machine model + driver.
const D = require("./reports-driver.cjs");
const E = require("./reports-expect.cjs");
const { F, num, near, inr } = D;

const TABLE = "Item-wise margin";
const RANGE_EMPTY = ["2026-10-01", "2026-10-07"];
const RANGE_TOO_LONG = ["2025-01-01", "2026-11-08"];
const defaultRange = () => [E.istMonthStart(), E.istToday()];
const HEADERS = ["Item Name", "Category", "Unit", "Manufacturer", "Sale (qty)", "Stock", "MRP", "Sales Amt.", "Purchase", "Net GST", "Profit"];
const SORTS = {
  default: { label: "Profit", cmp: (a, b) => (b.pct ?? -1e9) - (a.pct ?? -1e9) || a.name.localeCompare(b.name) },
  salesDesc: { label: "Sales Amt.", cmp: (a, b) => b.sales - a.sales || a.name.localeCompare(b.name) },
  salesAsc: { label: "Sales Amt.", cmp: (a, b) => a.sales - b.sales || a.name.localeCompare(b.name) },
};

const model = {
  id: "cr33d-item-margin",
  title: "CR-33d Item-wise Margin",
  initial: "PurchasesHome",
  maxSteps: 16,
  states: {
    PurchasesHome: { label: "Inventory > Purchases, no report open" },
    Loaded: { label: "Loaded: default range, highest margin first" },
    Loading: { label: "Loading (response held)" },
    SortedBySalesDesc: { label: "Sorted by Sales Amt., high to low" },
    SortedBySalesAsc: { label: "Sorted by Sales Amt., low to high" },
    Searched: { label: "Search narrowing (tiles recompute)" },
    SearchEmpty: { label: "Search with no match" },
    Empty: { label: "Empty range (Download disabled)" },
    InvalidBlocked: { label: "End before start: submit blocked" },
    ErrorRange: { label: "Range over 366 days: server error" },
    Forbidden: { label: "RECEPTION: forbidden message" },
    LoadedOtherRole: { label: "Loaded as DOCTOR / PHARMACIST" },
    TooltipOpen: { label: "(i) tooltip open" },
    Downloaded: { label: "CSV downloaded and checked" },
    ItemPage: { label: "Item name link opened the item page" },
  },
  transitions: [
    { from: "PurchasesHome", event: "openFromMenu", to: "Loaded", label: "More tasks > Item-wise margin" },
    { from: "Loaded", event: "leaveReport", to: "PurchasesHome" },
    { from: "Loaded", event: "goHeld", to: "Loading" },
    { from: "Loading", event: "responseArrives", to: "Loaded" },
    { from: "Loaded", event: "sortSales", to: "SortedBySalesDesc" },
    { from: "SortedBySalesDesc", event: "sortSales", to: "SortedBySalesAsc" },
    { from: "SortedBySalesDesc", event: "sortProfit", to: "Loaded" },
    { from: "SortedBySalesAsc", event: "sortProfit", to: "Loaded" },
    { from: "Loaded", event: "searchAcne", to: "Searched" },
    { from: "Searched", event: "searchSun", to: "Searched" },
    { from: "Searched", event: "clearSearch", to: "Loaded" },
    { from: "Loaded", event: "searchNoMatch", to: "SearchEmpty" },
    { from: "SearchEmpty", event: "clearSearch", to: "Loaded" },
    { from: "Loaded", event: "setEmptyRange", to: "Empty" },
    { from: "Empty", event: "resetRange", to: "Loaded" },
    { from: "Loaded", event: "setBackwardsRange", to: "InvalidBlocked" },
    { from: "InvalidBlocked", event: "resetRange", to: "Loaded" },
    { from: "Loaded", event: "setTooLongRange", to: "ErrorRange" },
    { from: "ErrorRange", event: "resetRange", to: "Loaded" },
    { from: "Loaded", event: "switchReception", to: "Forbidden" },
    { from: "Forbidden", event: "switchAdmin", to: "Loaded" },
    { from: "Loaded", event: "switchDoctor", to: "LoadedOtherRole" },
    { from: "Loaded", event: "switchPharmacist", to: "LoadedOtherRole" },
    { from: "LoadedOtherRole", event: "switchAdmin", to: "Loaded" },
    { from: "Loaded", event: "hoverColumnTip", to: "TooltipOpen" },
    { from: "Loaded", event: "hoverTileTip", to: "TooltipOpen" },
    { from: "TooltipOpen", event: "moveAway", to: "Loaded" },
    { from: "Loaded", event: "download", to: "Downloaded" },
    { from: "SortedBySalesAsc", event: "download", to: "Downloaded" },
    { from: "Downloaded", event: "reload", to: "Loaded" },
    { from: "Loaded", event: "openItem", to: "ItemPage" },
    { from: "ItemPage", event: "goBack", to: "Loaded" },
  ],
};

// ---- screen reading ---------------------------------------------------------------------------
const tileValue = (page, label) => page.locator(`xpath=//p[contains(normalize-space(.), "${label}")]/following-sibling::p[1]`).first().innerText();

async function readScreen(page) {
  const table = page.getByRole("table", { name: TABLE });
  const headers = await table.locator("thead th").evaluateAll((ths) => ths.map((t) => ({ text: t.innerText.replace(/\s+/g, " ").trim(), sort: t.getAttribute("aria-sort"), tips: t.querySelectorAll("button[aria-label^='How']").length })));
  const rows = await table.locator("tbody tr").evaluateAll((trs) =>
    trs.map((tr) => ({ cells: [...tr.cells].map((c) => c.innerText.trim()), avgTitle: tr.cells[4].getAttribute("title"), href: tr.cells[0].querySelector("a")?.getAttribute("href") || null })));
  const tiles = {
    sales: num(await tileValue(page, "Total Sale Amount")), purchase: num(await tileValue(page, "Total Purchase")), netGst: num(await tileValue(page, "Total Net GST")),
    profitText: (await tileValue(page, "Total Profit")).trim(),
  };
  return { headers, rows, tiles };
}
const profitOf = (cell) => { const m = /₹([\d,.-]+) \(([\d.-]+)\)/.exec(cell); return m ? { profit: num(m[1]), pct: Number(m[2]) } : null; };

async function checkReport(ctx, check, { start, end, search = "", sort = SORTS.default, sortHeader = "Profit", dir = "descending" }) {
  const page = ctx.page;
  const exp = E.margin(start, end, search);
  check((await page.getByText("Item-wise Margin", { exact: true }).locator("visible=true").count()) === 1, "Item-wise Margin title visible");
  check((await page.locator("#margin-start").inputValue()) === start && (await page.locator("#margin-end").inputValue()) === end, `range pickers show ${start} to ${end}`);
  check((await page.locator("#margin-search").inputValue()) === search, `search box shows "${search}"`);
  check(await page.getByRole("button", { name: "Go", exact: true }).isEnabled() && await page.getByRole("button", { name: "Download" }).isEnabled(), "Go and Download enabled");

  const s = await readScreen(page);
  check(s.headers.length === 11 && HEADERS.every((h, i) => s.headers[i].text.startsWith(h)), `columns in CR order (got ${s.headers.map((h) => h.text).join(" | ")})`);
  check(s.headers.every((h) => h.tips === 1), "every column header has an (i) tooltip button");
  const sortedHead = s.headers.filter((h) => h.sort && h.sort !== "none");
  check(sortedHead.length === 1 && sortedHead[0].text.startsWith(sortHeader) && sortedHead[0].sort === dir, `sorted by ${sortHeader} ${dir}`);

  const want = [...exp.rows].sort(sort.cmp);
  check(s.rows.length === want.length && s.rows.every((r, i) => r.cells[0] === want[i].name), `row order ${want.map((r) => r.name.split(" ")[0]).join(", ")} (got ${s.rows.map((r) => r.cells[0].split(" ")[0]).join(", ")})`);

  let sumSales = 0, sumPurchase = 0, sumNet = 0, sumProfit = 0, unknownSeen = 0;
  s.rows.forEach((r, i) => {
    const w = want[i], c = r.cells;
    const qty = num(c[4]), stock = num(c[5]), mrp = num(c[6]), sales = num(c[7]), purchase = num(c[8]), net = num(c[9]);
    const p = profitOf(c[10]);
    check(c[1] === w.category && c[2] === w.unit && c[3] === w.manufacturer, `${w.name}: category/unit(pack size)/manufacturer = ${w.category} / ${w.unit} / ${w.manufacturer}`);
    check(qty === w.qty && stock === w.stock && near(mrp, w.mrp), `${w.name}: sale qty ${w.qty}, current stock ${w.stock}, MRP ${w.mrp}`);
    check(near(sales, w.sales) && near(purchase, w.purchase) && near(net, w.netGst), `${w.name}: Sales ${w.sales} Purchase ${w.purchase} Net GST ${w.netGst} match SQL`);
    check(p && near(p.profit, w.profit) && near(p.pct, w.pct, 0.0051), `${w.name}: Profit ${w.profit} (${w.pct}) match SQL (got ${c[10].split("\n")[0]})`);
    check(/^\/dashboard\/inventory\?area=stock&view=list&item=/.test(r.href || "") && w.itemIds.some((id) => r.href.includes(`item=${id}`)), `${w.name}: name links to the item page for its stock record`);
    // CR reconciliation rules
    const avg = Number((r.avgTitle || "").replace(/[^\d.]/g, ""));
    check(avg > 0 && Math.abs(qty * avg - sales) <= 0.005 * qty + 0.01, `${w.name}: sale qty ${qty} x average sale price ${avg} = Sales Amt ${sales}`);
    if (w.unknownLines === 0) {
      check(near(sales - purchase - net, p.profit), `${w.name}: Sales - Purchase - Net GST (${E.r2(sales - purchase - net)}) = Profit ${p.profit}`);
    } else {
      unknownSeen += w.unknownLines;
      check(near(sales - w.unknownSales - purchase - net, p.profit), `${w.name}: costed part reconciles (Sales - uncosted ${w.unknownSales} - Purchase - Net GST = Profit ${p.profit})`);
      check(!near(sales - purchase - net, p.profit), `${w.name}: NOTE literal CR rule Sales - Purchase - Net GST (${E.r2(sales - purchase - net)}) differs from Profit ${p.profit} by the uncosted sales`);
      check(c[10].includes(`${w.unknownLines} line without recorded cost`), `${w.name}: row flagged "${w.unknownLines} line without recorded cost"`);
    }
    if (w.unknownLines === 0) check(!/without recorded cost/.test(c[10]), `${w.name}: no cost flag on a fully costed row`);
    sumSales += sales; sumPurchase += purchase; sumNet += net; sumProfit += p.profit;
  });

  // tiles: SQL, and the sum of the rows shown
  const t = exp.totals;
  check(near(s.tiles.sales, t.sales) && near(s.tiles.purchase, t.purchase) && near(s.tiles.netGst, t.netGst), `tiles: Sale ${t.sales}, Purchase ${t.purchase}, Net GST ${t.netGst} match SQL`);
  check(s.tiles.profitText === `${inr(t.profit)} (${t.pct.toFixed(2)}%)`, `Total Profit tile "${inr(t.profit)} (${t.pct.toFixed(2)}%)" (got "${s.tiles.profitText}")`);
  const tp = profitOf(s.tiles.profitText.replace("%)", ")"));
  const tol = 0.011 * Math.max(1, s.rows.length);
  check(near(sumSales, s.tiles.sales, tol) && near(sumPurchase, s.tiles.purchase, tol) && near(sumNet, s.tiles.netGst, tol) && near(sumProfit, tp.profit, tol), "row totals add up to the four summary tiles");
  const banner = page.getByRole("status").filter({ hasText: "without recorded cost" });
  if (t.unknownLines) {
    check(await banner.isVisible() && (await banner.innerText()).includes(inr(t.unknownSales)), `banner flags ${inr(t.unknownSales)} of sales without recorded cost`);
    check(unknownSeen === t.unknownLines, "uncosted lines flagged on their rows");
  } else check((await banner.count()) === 0, "no cost banner when every line has a cost");
  return { exp, screen: s };
}

// ---- driver -----------------------------------------------------------------------------------
const fillRange = async (page, a, b) => { await page.locator("#margin-start").fill(a); await page.locator("#margin-end").fill(b); };
const go = (ctx) => ctx.page.getByRole("button", { name: "Go", exact: true }).click();
const goSettled = (ctx) => D.andSettle(ctx, "/item-margin", () => go(ctx));
const REPORT_URL = (ctx) => `${ctx.baseUrl}/dashboard/inventory?area=purchases&view=margin`;
async function openReport(ctx, who) {
  await D.useRole(ctx, who);
  await D.andSettle(ctx, "/item-margin", () => ctx.page.goto(REPORT_URL(ctx)));
  ctx.vars.search = "";
}
async function search(ctx, text) { await ctx.page.locator("#margin-search").fill(text); await goSettled(ctx); ctx.vars.search = text; }
const header = (ctx, name) => ctx.page.getByRole("table", { name: TABLE }).getByRole("button", { name, exact: false }).first();

const driver = {
  async setup({ apiUrl, shared }) { await F.seed({ apiUrl, shared }); },
  async reset(ctx) { D.trackRequests(ctx); ctx.vars.search = ""; await D.openPurchasesHome(ctx, "admin"); },
  actions: {
    openFromMenu: (ctx) => D.andSettle(ctx, "/item-margin", () => D.openFromMenu(ctx, "Item-wise margin")),
    leaveReport: async (ctx) => { await ctx.page.getByRole("button", { name: "Purchases", exact: true }).first().click().catch(() => {}); if (/view=margin/.test(ctx.page.url())) await ctx.page.goto(ctx.baseUrl + "/dashboard/inventory?area=purchases"); },
    async goHeld(ctx) { ctx.vars.release = await D.holdResponses(ctx, "pharmacy/compliance/item-margin"); await go(ctx); },
    async responseArrives(ctx) { const done = ctx.page.waitForResponse((r) => r.url().includes("/item-margin")); ctx.vars.release(); await done; await ctx.page.unroute("**/pharmacy/compliance/item-margin*"); await ctx.page.getByText(/^Loading /).waitFor({ state: "hidden" }); },
    sortSales: (ctx) => header(ctx, "Sales Amt.").click(),
    sortProfit: (ctx) => header(ctx, "Profit").click(),
    searchAcne: (ctx) => search(ctx, "Acne"),
    searchSun: (ctx) => search(ctx, "Sun"),
    searchNoMatch: (ctx) => search(ctx, "zzzz-no-such-item"),
    clearSearch: (ctx) => search(ctx, ""),
    async setEmptyRange(ctx) { await fillRange(ctx.page, ...RANGE_EMPTY); await goSettled(ctx); },
    async setBackwardsRange(ctx) { ctx.vars.before = ctx.vars.requests.length; await fillRange(ctx.page, "2026-11-06", "2026-11-02"); await go(ctx); await ctx.page.waitForTimeout(400); },
    async setTooLongRange(ctx) { await fillRange(ctx.page, ...RANGE_TOO_LONG); await goSettled(ctx); },
    async resetRange(ctx) { await fillRange(ctx.page, ...defaultRange()); await goSettled(ctx); },
    async reload(ctx) { await D.andSettle(ctx, "/item-margin", () => ctx.page.reload()); ctx.vars.search = ""; },
    switchReception: (ctx) => openReport(ctx, "reception"),
    switchAdmin: (ctx) => openReport(ctx, "admin"),
    switchDoctor: (ctx) => openReport(ctx, "doctor"),
    switchPharmacist: (ctx) => openReport(ctx, "pharmacist"),
    async hoverColumnTip(ctx) { ctx.vars.tip = "column"; await ctx.page.getByRole("button", { name: "How Profit ₹ (%) is calculated" }).hover(); await ctx.page.getByRole("tooltip").first().waitFor(); },
    async hoverTileTip(ctx) { ctx.vars.tip = "tile"; await ctx.page.getByRole("button", { name: "How Total Net GST is calculated" }).hover(); await ctx.page.getByRole("tooltip").first().waitFor(); },
    async moveAway(ctx) { await ctx.page.mouse.move(5, 5); await ctx.page.getByRole("tooltip").first().waitFor({ state: "hidden" }).catch(() => {}); },
    async download(ctx) {
      ctx.vars.screen = await readScreen(ctx.page);
      ctx.vars.range = [await ctx.page.locator("#margin-start").inputValue(), await ctx.page.locator("#margin-end").inputValue()];
      ctx.vars.csv = await D.readCsvDownload(ctx.page, () => ctx.page.getByRole("button", { name: "Download" }).click());
    },
    async openItem(ctx) { ctx.vars.itemName = "Doxycycline 100 mg Tablets (Strip of 10)"; await ctx.page.getByRole("link", { name: ctx.vars.itemName }).click(); await ctx.page.waitForURL(/area=stock/, { timeout: 60000 }); },
    async goBack(ctx) { await D.andSettle(ctx, "/item-margin", () => ctx.page.goBack()); },
  },
  checks: {
    async PurchasesHome(ctx, check) {
      const p = ctx.page;
      check(await p.locator("select").filter({ hasText: "More tasks" }).first().isVisible(), "More tasks… menu visible");
      check((await p.locator("select").filter({ hasText: "More tasks" }).first().locator("option").allInnerTexts()).includes("Item-wise margin"), "menu offers Item-wise margin");
      check((await p.getByText("Item-wise Margin", { exact: true }).count()) === 0 && (await p.getByText("Total Sale Amount").count()) === 0, "no margin report shown yet");
    },
    async Loaded(ctx, check) {
      check(/view=margin/.test(ctx.page.url()), "URL is view=margin");
      const [start, end] = defaultRange();
      await checkReport(ctx, check, { start, end });
    },
    async Loading(ctx, check) {
      const p = ctx.page;
      check(await p.getByText("Loading item-wise margin…").first().isVisible(), "loading skeleton announced");
      check(await p.getByRole("button", { name: "Go", exact: true }).isDisabled() && await p.getByRole("button", { name: "Download" }).isDisabled(), "Go and Download disabled while loading");
      check((await p.getByRole("table", { name: TABLE }).count()) === 0, "no stale table");
      check((await tileValue(p, "Total Sale Amount")).trim() === "—", "tiles show — while loading");
    },
    async SortedBySalesDesc(ctx, check) { const [start, end] = defaultRange(); await checkReport(ctx, check, { start, end, sort: SORTS.salesDesc, sortHeader: "Sales Amt.", dir: "descending" }); },
    async SortedBySalesAsc(ctx, check) { const [start, end] = defaultRange(); await checkReport(ctx, check, { start, end, sort: SORTS.salesAsc, sortHeader: "Sales Amt.", dir: "ascending" }); },
    async Searched(ctx, check) {
      const [start, end] = defaultRange();
      const r = await checkReport(ctx, check, { start, end, search: ctx.vars.search });
      if (ctx.vars.search === "Acne") check(r.exp.rows.map((x) => x.name.split(" ")[0]).join() === "Doxycycline,Adapalene" && r.exp.totals.sales === 526.4, "Acne: Doxycycline + Adapalene only, tiles recomputed to 526.40");
      else check(r.exp.rows.length === 1 && r.exp.totals.sales === 1321.6 && r.exp.totals.unknownLines === 0, "Sun: only the sunscreen, tiles 1,321.60 and no uncosted-line banner");
      check(r.screen.rows.length < 5, "fewer rows than the unfiltered report");
    },
    async SearchEmpty(ctx, check) {
      const p = ctx.page;
      check(await p.getByText('No sold items match "zzzz-no-such-item"').isVisible(), "empty state names the search");
      check(await p.getByRole("button", { name: "Download" }).isDisabled(), "Download disabled");
      check((await p.getByRole("table", { name: TABLE }).count()) === 0, "no table");
      check((await tileValue(p, "Total Sale Amount")).trim() === "—", "tiles show —");
    },
    async Empty(ctx, check) {
      const p = ctx.page;
      check(await p.getByText("No items sold in this range").isVisible(), "empty-state title");
      check(await p.getByRole("button", { name: "Download" }).isDisabled(), "Download disabled on empty range");
      check((await p.getByRole("table", { name: TABLE }).count()) === 0, "no table");
      check(E.margin(...RANGE_EMPTY).rows.length === 0, "SQL agrees: nothing sold 1-7 Oct");
    },
    async InvalidBlocked(ctx, check) {
      const p = ctx.page;
      check(ctx.vars.requests.length === ctx.vars.before, "no request sent for end-before-start");
      check(await p.locator("#margin-end").evaluate((el) => !el.checkValidity()), "end date flagged invalid by the form");
      check(await p.getByRole("table", { name: TABLE }).isVisible(), "previous results remain");
    },
    async ErrorRange(ctx, check) {
      const p = ctx.page;
      const alert = p.getByRole("alert").filter({ hasText: /\S/ }).first();
      check(await alert.isVisible(), "error alert for a range over 366 days");
      const text = await alert.innerText();
      check(/366/.test(text), `message names the 366-day limit (got "${text}")`);
      check(await p.getByRole("button", { name: "Download" }).isDisabled(), "Download disabled on error");
      check((await p.getByRole("table", { name: TABLE }).count()) === 0, "no table");
    },
    async Forbidden(ctx, check) {
      const p = ctx.page;
      const alert = p.getByRole("alert").filter({ hasText: /pharmacy reports/ });
      check(await alert.isVisible() && /Your role cannot open pharmacy reports/.test(await alert.innerText()), "RECEPTION sees the forbidden message");
      check((await p.getByRole("table", { name: TABLE }).count()) === 0 && (await tileValue(p, "Total Sale Amount")).trim() === "—", "no data or tiles leaked");
      const r = await ctx.context.request.get(`${ctx.apiUrl}/pharmacy/compliance/item-margin?startDate=2026-11-01&endDate=2026-11-07`, { headers: { authorization: `Bearer ${ctx.shared.tokens.reception}` } });
      check(r.status() === 403, `API answers 403 to RECEPTION (got ${r.status()})`);
    },
    async LoadedOtherRole(ctx, check) {
      const [start, end] = defaultRange();
      await checkReport(ctx, check, { start, end });
      check(["doctor", "pharmacist"].includes(ctx.vars.who), `viewed as ${ctx.vars.who}`);
    },
    async TooltipOpen(ctx, check) {
      const tip = ctx.page.getByRole("tooltip").first();
      check(await tip.isVisible(), "tooltip visible");
      const text = await tip.innerText();
      if (ctx.vars.tip === "column") check(/Profit/.test(text) && /Sales Amt/.test(text) && /Purchase/.test(text), `Profit tooltip explains the calculation (got "${text.slice(0, 70)}…")`);
      else check(/Net GST/.test(text), `Net GST tile tooltip (got "${text.slice(0, 70)}…")`);
      const b = await tip.boundingBox(); const vp = ctx.page.viewportSize();
      check(b.x >= 0 && b.x + b.width <= vp.width && b.y >= 0, "tooltip inside the viewport");
    },
    async Downloaded(ctx, check) {
      const { csv, screen, range } = ctx.vars;
      check(csv.name === `item-margin-${range[0]}-to-${range[1]}.csv`, `file name item-margin-${range[0]}-to-${range[1]}.csv (got ${csv.name})`);
      const items = csv.rows.slice(0, -1), total = csv.rows[csv.rows.length - 1];
      check(items.length === screen.rows.length && total["Item Name"] === "Total", `CSV has ${screen.rows.length} item rows plus a Total row`);
      for (const h of ["Sale Qty", "Sales Amt", "Purchase", "Net GST", "Profit"]) check(near(items.reduce((a, r) => a + Number(r[h] || 0), 0), Number(total[h]), 0.011 * items.length), `CSV item rows sum to the Total row in "${h}"`);
      check(near(Number(total["Sales Amt"]), screen.tiles.sales) && near(Number(total["Purchase"]), screen.tiles.purchase) && near(Number(total["Net GST"]), screen.tiles.netGst) && near(Number(total["Profit"]), profitOf(screen.tiles.profitText.replace("%)", ")")).profit), "CSV Total row equals the four tiles on screen");
      items.forEach((r, i) => {
        const c = screen.rows[i].cells, p = profitOf(c[10]);
        check(r["Item Name"] === c[0] && near(Number(r["Sales Amt"]), num(c[7])) && near(Number(r["Purchase"]), num(c[8])) && near(Number(r["Net GST"]), num(c[9])) && near(Number(r["Profit"]), p.profit) && near(Number(r["Profit %"]), p.pct, 0.0051), `CSV row ${i} (${c[0].split(" ")[0]}) = screen row, same order`);
        check(Number(r["Sale Qty"]) === num(c[4]) && near(Number(r["Sale Qty"]) * Number(r["Average Sale Price"]), Number(r["Sales Amt"]), 0.005 * Number(r["Sale Qty"]) + 0.01), `CSV row ${i}: Sale Qty x Average Sale Price = Sales Amt`);
      });
      const exp = E.margin(range[0], range[1]);
      check(near(Number(total["Sales Amt"]), exp.totals.sales) && near(Number(total["Profit"]), exp.totals.profit), `CSV totals equal SQL (${exp.totals.sales} / ${exp.totals.profit})`);
    },
    async ItemPage(ctx, check) {
      const u = new URL(ctx.page.url());
      const want = E.margin(...defaultRange()).rows.find((r) => r.name === ctx.vars.itemName);
      check(u.pathname === "/dashboard/inventory" && u.searchParams.get("area") === "stock" && want.itemIds.includes(u.searchParams.get("item")), `item page URL carries the item id (${u.search.slice(0, 60)})`);
      check(await ctx.page.getByText(ctx.vars.itemName).locator("visible=true").first().isVisible(), "the item's name is shown on the item page");
      check((await ctx.page.getByText("Total Sale Amount").count()) === 0, "left the margin report");
    },
  },
};

module.exports = { model, driver };
