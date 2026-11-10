// Change-request audit, Pharmacy Report: CR-33, CR-33a, CR-33b, CR-33c, CR-33d.
// Real backend, real frontend, real browser, on the synthetic month of bills the CR-33 seed writes.
// Run: STACK_DATABASE_URL=postgresql://... node scripts/stack/scenarios/cr-audit-reports.cjs
const { start, sleep, buyAndSell } = require("./cr-audit-lib.cjs");
const { seed } = require("./cr33-seed.cjs");

const GST_REPORTS = [
  ["purchase-register", "Purchase Register"], ["purchase-bills", "Purchase Bills"], ["sales-register", "Sales Register"], ["sales-bills", "Sales Bills"],
  ["day-wise-summary", "Day wise Summary"], ["gstr-1", "GSTR-1"], ["gstr-3b", "GSTR-3B"], ["gstr-2a", "GSTR-2A"], ["gstr-2b", "GSTR-2B"], ["hsn-wise", "HSN wise GST"], ["composition", "Composition GST Report"],
];
const money = (text) => Number(String(text).replace(/[^\d.-]/g, ""));

(async () => {
  const a = await start("cr-audit-reports");
  const { stack, check, shot } = a;
  const today = new Date(Date.now() + 19800000).toISOString().slice(0, 10);
  if (!(await stack.db.inventoryItem.findUnique({ where: { id: "cr33-adapalene" } })))
    await seed(stack.db, { branchId: stack.branch.id, doctorId: stack.users.doctor.id, pharmacistId: stack.users.pharmacist.id, today });
  // two products bought and sold today through the application, so cost, margin and bill ranges are real
  const tag = String(Date.now()).slice(-5);
  const buyer = await a.api(await a.tokenFor("admin"), "POST", "/patients", { name: `HIMASREE ${tag}`, phone: `96${tag}001`, gender: "F", age: 34 });
  const supplier = { distributor: "Vasu Vaccines And Speciality Drugs", gstin: "36AAICV6140M1ZW", patient: buyer };
  await buyAndSell(a, { ...supplier, name: `Anaboom Pro Hair Growth Serum ${tag}`, manufacturer: "Sun Pharmaceutical Industries Ltd", category: "Hair", form: "Serum", strength: "5%", packSize: "60", packUnit: "ml", hsn: "33059011", batch: "WWD0064", qty: 10, mrp: 1450, rate: 983.05, gst: 18, billNo: `SB-26-${tag}`, sell: [1, 2] });
  await buyAndSell(a, { ...supplier, name: `Cosglo New Cream ${tag}`, manufacturer: "Oaknet Healthcare", category: "Skin", form: "Cream", strength: "30 g", packSize: "30", packUnit: "g", hsn: "33049910", batch: "CG2611", qty: 12, mrp: 692, rate: 230, gst: 18, billNo: `SB-27-${tag}`, sell: [4] });
  const { page } = await a.session("owner");
  const main = page.locator("main").first();
  const mainText = async () => (await main.innerText()).replace(/[ \t]+/g, " ");
  const open = async (report, extra = "") => {
    await a.go(page, `/dashboard/pharmacy/reports?report=${report}${extra}`);
    await sleep(1200);
  };
  const section = async (cr, run) => {
    try {
      await run();
    } catch (error) {
      check(cr, "run", "The audit step for this change request ran to the end", false, String(error.message || error).split("\n")[0].slice(0, 300));
    }
  };

  // ---------- CR-33: landing, categories, search, the report set ----------
  await section("CR-33", async () => {
    await a.go(page, "/dashboard/pharmacy/reports");
    const landing = await mainText();
    const categories = ["GST REPORTS", "MARGIN REPORTS", "STOCK REPORTS", "ACCOUNTING REPORTS", "OTHERS"];
    check("CR-33", "org-1", "Left-hand list of report categories: GST, Margin, Stock, Accounting, Others", categories.every((c) => landing.toUpperCase().includes(c)), categories.filter((c) => landing.toUpperCase().includes(c)).join(" · "));
    check("CR-33", "org-3", "Most-used reports are surfaced on the landing page", /Common reports/.test(landing) && /Daily Collection/.test(landing));
    await shot(page, "cr33-1-reports-landing");
    await page.getByRole("searchbox", { name: "Search reports" }).or(page.getByLabel("Search reports")).first().fill("GSTR");
    await sleep(600);
    const found = await mainText();
    check("CR-33", "org-2", "Search box across all reports: \"GSTR\" finds the GST returns", ["GSTR-1", "GSTR-3B", "GSTR-2A", "GSTR-2B"].every((r) => found.includes(r)) && !found.includes("Expiring Stock"));
    await shot(page, "cr33-2-search-gstr");
    for (const [id, title] of GST_REPORTS) {
      await open(id);
      const text = await mainText();
      const hasTable = (await main.locator("table").count()) > 0;
      const download = main.getByRole("button", { name: /Download/ });
      let formats = "";
      if (await download.count()) {
        await download.first().click();
        await sleep(400);
        formats = (await page.getByRole("menuitem").allTextContents()).map((t) => t.trim()).join(" / ");
        await page.keyboard.press("Escape");
      }
      const dated = /Period|From/.test(text);
      check("CR-33", `B-${id}`, `GST report "${title}" opens with a date filter and export`, text.includes(title) && hasTable && dated && /Excel/i.test(formats) && /CSV/i.test(formats) && /PDF/i.test(formats), `table: ${hasTable}; export: ${formats || "none"}`);
    }
    await open("gstr-3b");
    await shot(page, "cr33-3-gstr-3b");
    await open("daily-collection");
    const daily = await mainText();
    check("CR-33", "A", "Daily collection: bills raised, split by payment mode (cash / UPI / card), against money counted", /Reconciliation by payment mode/.test(daily) && /Cash/.test(daily) && /UPI/.test(daily) && /Card/.test(daily) && /Counted/.test(daily) && /Save count/.test(daily) && /Billed today/.test(daily));
    await shot(page, "cr33-4-daily-collection", { fullPage: true });
  });

  // ---------- CR-33a: GST Purchase Bills ----------
  await section("CR-33a", async () => {
    await open("purchase-bills");
    const text = await mainText();
    const controls = { "Period (month) picker": /Period/, "Type dropdown": /Type/, "GST filter (With / Without GST)": /With GST/, "Go": /\bGo\b/, "Download": /Download/, "Total for the period": /Total for the period\s*₹[\d,]+\.\d{2}/ };
    const missingControls = Object.entries(controls).filter(([, re]) => !re.test(text)).map(([k]) => k);
    check("CR-33a", "controls", "Controls: month picker, Type, GST filter, Go, Download, month total top right", missingControls.length === 0, missingControls.join(", "));
    check("CR-33a", "show-columns", "\"Show Columns\" control to choose which columns appear", /Show Columns|Columns/i.test((await main.getByRole("button").allTextContents()).join(" ")), "no column chooser on the report");
    const headers = await main.locator("table thead").innerText();
    const bands = ["CESS", "0%", "5%", "12%", "18%", "28%", "40%", "Total"];
    check("CR-33a", "slabs", "One column group per GST slab (CESS · 0% · 5% · 12% · 18% · 28% · 40% · Total), each with Base · SGST · CGST · IGST", bands.every((b) => headers.includes(b)) && (headers.match(/Base/g) || []).length >= 8 && (headers.match(/IGST/g) || []).length >= 8);
    const fixed = (await main.locator("table thead th").allTextContents()).map((t) => t.trim()).filter(Boolean);
    check("CR-33a", "fixed", "Fixed columns on the left: Sr No. · Bill No. · Entry Date (with time) · Bill Date · Distributor", ["Sr No.", "Bill No.", "Entry Date", "Bill Date", "Distributor"].every((h) => fixed.some((f) => f.startsWith(h))) && /\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/.test(text));
    const totalsRow = main.getByTestId("report-totals-row");
    const totals = (await totalsRow.innerText()).split(/\s+/).filter((t) => /^[\d,.-]+$/.test(t)).map(money);
    const headline = money((text.match(/Total for the period\s*(₹[\d,]+\.\d{2})/) || [])[1]);
    const firstBodyRow = await main.locator("table tbody tr").first().getAttribute("data-testid");
    check("CR-33a", "totals", "A totals row sits directly under the header and its grand total matches the figure at the top", totals[totals.length - 1] === headline && (firstBodyRow === "report-totals-row" || (await main.locator("table thead").getByTestId("report-totals-row").count()) === 1), `grand total ${totals[totals.length - 1]} vs headline ${headline}`);
    await shot(page, "cr33a-1-purchase-bills-left");
    const scroller = main.locator("table").first().locator("xpath=ancestor::div[contains(@class,'overflow')][1]");
    await scroller.evaluate((el) => (el.scrollLeft = el.scrollWidth));
    await sleep(500);
    const visible = await main.locator("table thead th").evaluateAll((ths, names) => {
      const frame = ths[0].closest("div[class*='overflow']").getBoundingClientRect();
      const out = {};
      for (const name of names) {
        const th = ths.find((t) => t.textContent.trim().startsWith(name));
        const r = th.getBoundingClientRect();
        out[name] = r.left >= frame.left - 1 && r.right <= frame.right + 1;
      }
      return out;
    }, ["Sr No.", "Bill No.", "Entry Date", "Bill Date", "Distributor"]);
    const lost = Object.entries(visible).filter(([, ok]) => !ok).map(([k]) => k);
    check("CR-33a", "frozen", "Scrolling right keeps Sr No., Bill No., the dates and Distributor frozen", lost.length === 0, lost.length ? `scrolled out of view at 1440px: ${lost.join(", ")}` : "");
    check("CR-33a", "frozen-billno", "At least Bill No. stays visible when scrolled fully right", visible["Bill No."]);
    await shot(page, "cr33a-2-purchase-bills-scrolled-right");
  });

  // ---------- CR-33b: GST Sales Register ----------
  await section("CR-33b", async () => {
    await open("sales-register");
    const columns = (await main.locator("table thead th").allTextContents()).map((t) => t.trim()).filter(Boolean);
    const wanted = ["Bill No.", "Bill Date", "Customer", "Mobile", "Gross", "Disc.", "Taxable", "CESS", "SGST", "CGST", "IGST", "Total"];
    check("CR-33b", "columns", "Columns in order: Bill No. · Bill Date · Customer · Mobile · Gross · Disc. · Taxable · CESS · SGST · CGST · IGST · Total (flat, no slab bands)", wanted.every((w, i) => columns[i] && columns[i].startsWith(w)) && columns.length === wanted.length, columns.join(" · "));
    const rows = await main.locator("table tbody tr").evaluateAll((trs) => trs.map((tr) => [...tr.children].map((td) => td.textContent.trim())));
    const body = rows.filter((r) => /^PHI-/.test(r[0]));
    const arithmetic = body.every((r) => Math.abs(money(r[4]) - money(r[5]) - money(r[6])) < 0.011 && Math.abs(money(r[6]) + money(r[7]) + money(r[8]) + money(r[9]) + money(r[10]) - money(r[11])) < 0.011);
    check("CR-33b", "arithmetic", "On every row Gross − Disc. = Taxable and Taxable + CESS + SGST + CGST + IGST = Total", body.length > 10 && arithmetic, `${body.length} bills checked`);
    const text = await mainText();
    const headline = money((text.match(/Total for the period\s*(₹[\d,]+\.\d{2})/) || [])[1]);
    const totalsText = (await main.getByTestId("report-totals-row").innerText()).trim().split(/\s+/);
    const totalsUnderHeader = await main.locator("table").first().evaluate((table) => {
      const row = table.querySelector('[data-testid="report-totals-row"]');
      const firstBill = [...table.querySelectorAll("tbody tr")].find((tr) => /^PHI-/.test(tr.textContent.trim()));
      return Boolean(row && firstBill && row.getBoundingClientRect().top < firstBill.getBoundingClientRect().top);
    });
    check("CR-33b", "totals", "Totals under the header; the Total column's month total matches the figure top right", totalsUnderHeader && money(totalsText[totalsText.length - 1]) === headline, `totals row ${totalsText[totalsText.length - 1]} vs headline ${headline}`);
    const numbers = body.map((r) => Number(r[0].slice(-3)));
    check("CR-33b", "order", "Every bill of the month appears once, in bill-number order", new Set(numbers).size === numbers.length && numbers.every((n, i) => i === 0 || n > numbers[i - 1]), `${numbers[0]} … ${numbers[numbers.length - 1]}`);
    const buttons = (await main.getByRole("button").allTextContents()).map((t) => t.trim());
    check("CR-33b", "print-download", "Print and Download are both on this report", buttons.some((b) => /Print/.test(b)) && buttons.some((b) => /Download/.test(b)));
    check("CR-33b", "more-filters", "More Filters, with the active count shown", buttons.some((b) => /More Filters/i.test(b)), "no More Filters control on the Sales Register");
    const selects = await main.locator("select").evaluateAll((all) => all.map((s) => [...s.options].map((o) => o.textContent.trim()).join("/")));
    check("CR-33b", "second-dropdown", "A second dropdown (\"All\") to filter on payment or bill type", selects.some((s) => /^All\b/.test(s) && /Cash|UPI|Card/i.test(s)), `dropdowns: ${selects.map((s) => s.slice(0, 40)).join(" | ")}`);
    await shot(page, "cr33b-1-sales-register");
    await page.getByLabel("Search this report").fill("Meera");
    await main.getByRole("button", { name: "Go", exact: true }).click();
    await sleep(2000);
    const filtered = await main.locator("table tbody tr").evaluateAll((trs) => trs.map((tr) => [...tr.children].map((td) => td.textContent.trim())));
    const meera = filtered.filter((r) => /^PHI-/.test(r[0]));
    const sum = Math.round(meera.reduce((s, r) => s + money(r[11]), 0) * 100) / 100;
    const newHeadline = money(((await mainText()).match(/Total for the period\s*(₹[\d,]+\.\d{2})/) || [])[1]);
    check("CR-33b", "search", "Searching a customer's name narrows the list and the totals follow", meera.length > 0 && meera.every((r) => /Meera/.test(r[2])) && Math.abs(sum - newHeadline) < 0.011 && newHeadline < headline, `${meera.length} bills for Meera; rows add to ${sum}; headline ${newHeadline} (was ${headline})`);
    await shot(page, "cr33b-2-sales-register-search-meera");
  });

  // ---------- CR-33c: Day wise Summary ----------
  await section("CR-33c", async () => {
    await open("day-wise-summary");
    await sleep(1500);
    const current = await main.locator("table tbody tr").evaluateAll((trs) => trs.map((tr) => [...tr.children].map((td) => td.textContent.trim())));
    const todayRow = current.filter((r) => /\d/.test(r[1] || "") && /[-–]/.test(r[1] || ""));
    check("CR-33c", "bill-range", "Bill No. shows the range of bill numbers issued that day (first - last)", todayRow.length > 0, todayRow.length ? `${todayRow[0][0]}: ${todayRow[0][1]}` : `Bill No. cells: ${current.map((r) => r[1]).filter((v) => /\d/.test(v || "")).slice(0, 5).join(" | ")}`);
    await shot(page, "cr33c-0-day-wise-this-month");
    const month = today.slice(0, 7);
    const [y, m] = month.split("-").map(Number);
    const lastMonth = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
    const lastDay = new Date(Date.UTC(Number(lastMonth.slice(0, 4)), Number(lastMonth.slice(5)), 0)).getUTCDate();
    await main.locator("#day-wise-start").fill(`${lastMonth}-01`);
    await main.locator("#day-wise-end").fill(`${lastMonth}-${lastDay}`);
    await main.getByRole("button", { name: "Go", exact: true }).click();
    await sleep(2500);
    const text = await mainText();
    check("CR-33c", "controls", "Date-range picker, Type dropdown (Sales / Purchase), Go, Download and the range total top right", (await main.locator("#day-wise-type").count()) === 1 && /Total for the range\s*₹[\d,]+\.\d{2}/.test(text) && /Download/.test(text));
    const rows = await main.locator("table tbody tr").evaluateAll((trs) => trs.map((tr) => [...tr.children].map((td) => td.textContent.trim())));
    const days = rows.filter((r) => /^\d{2} \w{3} \d{4}$/.test(r[0]));
    check("CR-33c", "one-row-per-day", "One row per day, in date order", days.length === lastDay, `${days.length} rows for a ${lastDay}-day month`);
    check("CR-33c", "zero-days", "Days with no billing are shown as a ₹0 row (so a missed day stands out)", days.some((r) => /No bills/.test(r[1])));
    const head = await main.locator("table thead").innerText();
    check("CR-33c", "slabs", "GST slab groups (CESS · 0% · 5% · 12% · 18% · 28% · 40% · Total), each with Base · SGST · CGST · IGST", ["CESS", "0%", "5%", "12%", "18%", "28%", "40%", "Total"].every((b) => head.includes(b)));
    const headline = money((text.match(/Total for the range\s*(₹[\d,]+\.\d{2})/) || [])[1]);
    const dayTotal = Math.round(days.reduce((s, r) => s + money(r[r.length - 1]), 0) * 100) / 100;
    const totalsRow = await main.getByTestId("slab-totals-row").innerText();
    const totalsLast = money(totalsRow.trim().split(/\s+/).pop());
    check("CR-33c", "totals", "Daily rows add up to the totals row under the header and to the figure top right", Math.abs(dayTotal - headline) < 0.011 && Math.abs(totalsLast - headline) < 0.011, `days ${dayTotal}; totals row ${totalsLast}; headline ${headline}`);
    await shot(page, "cr33c-1-day-wise-summary");
    await main.locator("#day-wise-type").selectOption({ label: "Purchase" });
    await main.getByRole("button", { name: "Go", exact: true }).click();
    await sleep(2500);
    const purchase = await mainText();
    check("CR-33c", "purchase", "Switching the type to Purchase summarises purchases the same way", /SUP-101|MH-88|CASH-7/.test(purchase) || /4 bills/.test(purchase), (purchase.match(/\d+ bills over \d+ days/) || [""])[0]);
    await shot(page, "cr33c-2-day-wise-purchase");
  });

  // ---------- CR-33d: Item Wise Margin ----------
  await section("CR-33d", async () => {
    await open("item-margin");
    await sleep(1500);
    const text = await mainText();
    check("CR-33d", "tiles", "Four summary tiles: Total Sale Amount, Total Purchase, Total Net GST, Total Profit in rupees and as a percentage", /Total Sale Amount\s*₹/.test(text) && /Total Purchase\s*₹/.test(text) && /Total Net GST\s*₹/.test(text) && /Total Profit\s*₹[\d,.]+ \([\d.]+%\)/.test(text), (text.match(/Total Profit\s*₹[\d,.]+ \([\d.]+%\)/) || [""])[0]);
    const controls = ["#margin-start", "#margin-end", "#margin-type", "#margin-tag", "#margin-search-field", "#margin-search"];
    const present = [];
    for (const c of controls) if (await main.locator(c).count()) present.push(c);
    const buttons = (await main.getByRole("button").allTextContents()).map((t) => t.trim());
    check("CR-33d", "controls", "Date range, Type, Tags filter, search-field selector + search box, Go, More Filters, Download", present.length === controls.length && buttons.some((b) => /More Filters/.test(b)) && buttons.some((b) => /Download/.test(b)), `${present.length} of ${controls.length} inputs`);
    const columns = (await main.locator("table thead th").allTextContents()).map((t) => t.trim()).filter(Boolean);
    const wanted = ["Item Name", "Category", "Unit", "Manu", "Sale", "Stock", "MRP", "Sales Amt.", "Purchase", "Net GST", "Profit"];
    check("CR-33d", "columns", "Columns: Item Name · Category · Unit · Manufacturer · Sale (qty) · Stock · MRP · Sales Amt. · Purchase · Net GST · Profit (%)", wanted.every((w, i) => columns[i] && columns[i].startsWith(w)), columns.join(" · "));
    const rows = await main.locator("table tbody tr").evaluateAll((trs) => trs.map((tr) => [...tr.children].map((td) => td.textContent.trim())));
    const margins = rows.map((r) => (r[r.length - 1].match(/\(([\d.-]+)\)/) || [])[1]).filter((v) => v !== undefined).map(Number);
    check("CR-33d", "sort", "Default sort is highest margin first", margins.length > 1 && margins.every((v, i) => i === 0 || v <= margins[i - 1]), `margins: ${margins.join(", ")}`);
    check("CR-33d", "profit-format", "Profit shows the rupee amount with the margin percentage in brackets", rows.some((r) => /₹[\d,.]+ \([\d.]+\)/.test(r[r.length - 1])), rows[0] ? rows[0][rows[0].length - 1] : "");
    check("CR-33d", "item-link", "Item Name is a link through to the item", (await main.locator("table tbody tr").first().locator("a, button").count()) > 0);
    const tips = await main.locator("table thead th").evaluateAll((ths) => ths.filter((th) => th.querySelector("button, svg, [aria-label]")).length);
    check("CR-33d", "tooltips", "Column headers carry an (i) explanation of how the figure is worked out", tips >= 8, `${tips} of ${columns.length} headers have an info control`);
    const names = rows.map((r) => r[0]);
    check("CR-33d", "one-row-per-item", "The same medicine never appears on two rows", new Set(names).size === names.length, `${names.length} rows`);
    const costed = rows.filter((r) => /\(/.test(r[r.length - 1]));
    const reconciles = costed.every((r) => Math.abs(money(r[7]) - money(r[8]) - money(r[9]) - money(r[10].split("(")[0])) < 0.011);
    check("CR-33d", "reconcile", "Sales Amt. − Purchase − Net GST equals the Profit shown on each row", costed.length > 0 && reconciles, `${costed.length} costed rows checked`);
    await shot(page, "cr33d-1-item-wise-margin", { fullPage: true });
  });

  await a.finish("cr-audit-reports");
})().catch((error) => {
  console.error("CRASH", error);
  process.exit(1);
});
