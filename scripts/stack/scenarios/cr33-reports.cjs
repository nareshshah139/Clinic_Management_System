// CR-33 Pharmacy Report on the real stack: NestJS + Next.js + PostgreSQL, driven in Chromium.
// Usage: STACK_DATABASE_URL=postgresql://user@127.0.0.1:5432/db node scripts/stack/scenarios/cr33-reports.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
const XLSX = require(require.resolve("xlsx", { paths: [path.resolve(__dirname, "../../../backend")] }));
const { bootStack } = require("../boot.cjs");
const { seed } = require("./cr33-seed.cjs");

const root = path.resolve(__dirname, "../../..");
const out = path.join(root, "output/stack/cr33");
const results = [];
const num = (text) => Number(String(text).replace(/[₹,\s+]/g, "")) || 0;
const near = (a, b, label) => assert.ok(Math.abs(a - b) < 0.011, `${label}: ${a} vs ${b}`);
const clinicToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

async function check(name, fn) {
  const started = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - started });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, ok: false, ms: Date.now() - started, error: String(error.stack || error) });
    console.log(`FAIL ${name}\n  ${String(error.message).split("\n").join("\n  ")}`);
  }
}

async function tableData(page, name) {
  const table = page.getByRole("table", { name, exact: true });
  await table.waitFor();
  return table.evaluate((el) => {
    const head = [...el.tHead.rows];
    const totals = head.find((r) => r.dataset.testid === "report-totals-row");
    const visible = (cell) => {
      const copy = cell.cloneNode(true);
      copy.querySelectorAll(".sr-only").forEach((node) => node.remove());
      return copy.textContent.replace(/\s+/g, " ").trim();
    };
    const labels = [...head[head.length - (totals ? 2 : 1)].cells].map(visible);
    const cells = (r) => [...r.cells].map((c) => c.innerText.trim());
    return { labels, totals: totals ? cells(totals) : null, rows: [...el.tBodies[0].rows].map(cells) };
  });
}

(async () => {
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const stack = await bootStack({ label: "cr33" });
  const browser = await chromium.launch();
  const errors = [];
  const today = clinicToday();
  try {
    const users = stack.users;
    const owner = await stack.db.user.findUnique({ where: { id: users.owner.id } });
    const accountant = await stack.db.user.create({
      data: { branchId: stack.branch.id, email: "kiran.accounts@stack.example.invalid", firstName: "Kiran", lastName: "Accounts", role: "ACCOUNTANT", password: owner.password, permissions: JSON.stringify(["pharmacy:compliance:read"]) },
    });
    users.accountant = { ...users.owner, id: accountant.id, email: accountant.email, role: "ACCOUNTANT" };
    const expected = await seed(stack.db, { branchId: stack.branch.id, doctorId: users.doctor.id, pharmacistId: users.pharmacist.id, today });
    const month = expected.month;

    const open = async (who, viewport = { width: 1440, height: 900 }) => {
      const context = await browser.newContext({ viewport, acceptDownloads: true, timezoneId: "Asia/Kolkata" });
      const page = await context.newPage();
      page.on("console", (m) => m.type() === "error" && !/Download the React DevTools|favicon/.test(m.text()) && errors.push(`${who}: ${m.text()}`));
      page.on("pageerror", (e) => errors.push(`${who}: ${e.message}`));
      await stack.login(page, who);
      return { context, page };
    };
    const shot = (page, name) => page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });
    const reports = `${stack.base}/dashboard/pharmacy/reports`;

    const { page } = await open("pharmacist");

    await check("Pharmacy Report sits in the Pharmacy group of the menu, apart from Admin > Reports", async () => {
      await page.goto(`${stack.base}/dashboard`, { waitUntil: "networkidle" });
      const nav = page.getByRole("navigation", { name: "Main navigation" });
      await nav.getByRole("link", { name: "Pharmacy Report" }).click();
      await page.waitForURL(/\/dashboard\/pharmacy\/reports$/);
      const texts = await nav.locator("p, a").allInnerTexts();
      assert.ok(texts.indexOf("Pharmacy Report") > texts.indexOf("Pharmacy"));
      await page.getByRole("heading", { level: 1, name: "Pharmacy Report" }).waitFor();
      await shot(page, "landing-1440");
    });

    await check("the landing page surfaces the common reports and the categories; searching GSTR finds the four returns", async () => {
      const common = page.getByRole("region", { name: "Common reports" });
      assert.deepEqual(await common.locator("a > span:first-child").allInnerTexts(), ["Sales Register", "Day wise Summary", "GSTR-1", "GSTR-3B", "Item Wise Margin Report", "Daily Collection"]);
      const rail = page.getByRole("navigation", { name: "Pharmacy reports" });
      assert.deepEqual(await rail.getByRole("heading").allInnerTexts(), ["GST REPORTS", "MARGIN REPORTS", "STOCK REPORTS", "ACCOUNTING REPORTS", "OTHERS"].map((t) => t));
      assert.equal(await rail.getByRole("link").count(), 16);
      await rail.getByRole("searchbox", { name: "Search reports" }).fill("GSTR");
      assert.deepEqual(await rail.getByRole("link").allInnerTexts(), ["GSTR-1", "GSTR-3B", "GSTR-2A", "GSTR-2B"]);
      await shot(page, "search-gstr-1440");
    });

    let salesScreen;
    await check("Sales Register (CR-33b) for last month: flat columns, totals under the header reconcile with every row and the seeded bills", async () => {
      await page.goto(`${reports}?report=sales-register`, { waitUntil: "networkidle" });
      salesScreen = await tableData(page, "Sales Register");
      assert.deepEqual(salesScreen.labels, ["Bill No.", "Bill Date", "Customer", "Mobile", "Gross", "Disc.", "Taxable", "CESS", "SGST", "CGST", "IGST", "Total"]);
      assert.equal(salesScreen.rows.length, expected.monthSales.bills);
      const col = (label) => salesScreen.labels.indexOf(label);
      for (const row of salesScreen.rows) {
        near(num(row[col("Taxable")]), num(row[col("Gross")]) - num(row[col("Disc.")]), `${row[0]} taxable`);
        near(num(row[col("Total")]), num(row[col("Taxable")]) + num(row[col("CESS")]) + num(row[col("SGST")]) + num(row[col("CGST")]) + num(row[col("IGST")]), `${row[0]} total`);
      }
      for (const label of ["Gross", "Disc.", "Taxable", "SGST", "CGST", "Total"])
        near(num(salesScreen.totals[col(label)]), salesScreen.rows.reduce((s, r) => s + num(r[col(label)]), 0), `${label} column total`);
      near(num(salesScreen.totals[col("Gross")]), expected.monthSales.gross, "gross vs seed");
      near(num(salesScreen.totals[col("Total")]), expected.monthSales.total, "total vs seed");
      near(num(await page.getByTestId("report-headline").innerText()), expected.monthSales.total, "headline");
      assert.ok(!salesScreen.rows.some((r) => r[0] === "PHI-2026-510"), "cancelled bill excluded");
      await shot(page, "sales-register-1440");
    });

    await check("searching a customer filters the rows and recalculates the totals", async () => {
      await page.getByRole("searchbox", { name: "Search this report" }).fill("Ravi");
      await page.getByRole("button", { name: "Go" }).click();
      await page.waitForURL(/q=Ravi/);
      await page.waitForLoadState("networkidle");
      const filtered = await tableData(page, "Sales Register");
      assert.ok(filtered.rows.length > 0 && filtered.rows.every((r) => r[2] === "Ravi Kumar"));
      near(num(filtered.totals[11]), filtered.rows.reduce((s, r) => s + num(r[11]), 0), "filtered total");
    });

    await check("Excel, CSV and PDF downloads carry the screen's totals", async () => {
      await page.goto(`${reports}?report=sales-register`, { waitUntil: "networkidle" });
      const download = async (label) => {
        await page.getByRole("button", { name: "Download" }).click();
        const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: label }).click()]);
        const target = path.join(out, file.suggestedFilename());
        await file.saveAs(target);
        return target;
      };
      const xlsx = await download("Excel (.xlsx)");
      assert.match(path.basename(xlsx), new RegExp(`^sales-register-${month.from}-to-${month.to}\\.xlsx$`));
      const sheet = XLSX.readFile(xlsx).Sheets["Sales Register"];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });
      assert.deepEqual(rows[2], salesScreen.labels);
      near(rows[3][11], num(salesScreen.totals[11]), "xlsx total");
      assert.equal(rows.length - 4, salesScreen.rows.length);
      const csv = fs.readFileSync(await download("CSV"), "utf8").replace(/^﻿/, "").split("\r\n");
      near(Number(csv[1].split(",").at(-1)), num(salesScreen.totals[11]), "csv total");
      const pdf = await download("PDF");
      const text = execFileSync("pdftotext", ["-layout", pdf, "-"], { encoding: "utf8" });
      assert.ok(text.includes(salesScreen.totals[11]), "pdf carries the total");
    });

    await check("Purchase Bills (CR-33a): slab bands, frozen identifying columns while the money scrolls", async () => {
      await page.goto(`${reports}?report=purchase-bills`, { waitUntil: "networkidle" });
      const data = await tableData(page, "Purchase Bills");
      assert.deepEqual(data.labels.slice(0, 9), ["Sr No.", "Bill No.", "Entry Date", "Bill Date", "Distributor", "Base", "SGST", "CGST", "IGST"]);
      const bands = await page.getByRole("table", { name: "Purchase Bills" }).locator("thead tr").first().locator("th[scope=colgroup]").allInnerTexts();
      assert.deepEqual(bands, ["CESS", "0%", "5%", "12%", "18%", "28%", "40%", "Total"]);
      const baseTotal = data.labels.lastIndexOf("Base");
      near(num(data.totals[baseTotal]), expected.monthPurchase.taxable, "purchase base total");
      near(num(data.totals[data.labels.lastIndexOf("IGST")]), expected.monthPurchase.igst, "IGST total");
      near(num(data.totals.at(-1)), expected.monthPurchase.amount, "amount total");
      const scroller = page.locator("div.overflow-auto:has(table[aria-label='Purchase Bills'])");
      const billCell = page.getByRole("table", { name: "Purchase Bills" }).locator("tbody tr").first().locator("td").nth(1);
      const before = await billCell.boundingBox();
      await scroller.evaluate((el) => (el.scrollLeft = el.scrollWidth));
      const after = await billCell.boundingBox();
      assert.ok(Math.abs(before.x - after.x) < 1, `Bill No. stays put (${before.x} -> ${after.x})`);
      await shot(page, "purchase-bills-scrolled-1440");
    });

    await check("GSTR-3B: output tax and ITC from the seeded month, unregistered supplier not claimed", async () => {
      await page.goto(`${reports}?report=gstr-3b`, { waitUntil: "networkidle" });
      const outward = await tableData(page, "GSTR-3B: 3.1 Outward supplies and 4 Eligible ITC");
      const row = (table) => outward.rows.find((r) => r[0] === table);
      const taxedTaxable = Object.entries(expected.monthByRate).filter(([rate]) => Number(rate) > 0).reduce((s, [, v]) => s + v.taxable, 0);
      near(num(row("3.1(a)")[2]), taxedTaxable, "3.1(a) taxable");
      assert.ok(row("4(D)"), "unregistered supplier listed as not claimed");
      await shot(page, "gstr-3b-1440");
    });

    await check("GSTR-1: B2C rate-wise at Telangana, HSN summary, documents issued with the cancelled bill", async () => {
      await page.goto(`${reports}?report=gstr-1`, { waitUntil: "networkidle" });
      const b2cs = await tableData(page, "GSTR-1: B2C small, rate-wise (Table 7)");
      for (const [rate, v] of Object.entries(expected.monthByRate)) {
        const r = b2cs.rows.find((x) => num(x[2]) === Number(rate));
        assert.equal(r[1], "36-Telangana");
        near(num(r[3]), v.taxable, `rate ${rate} taxable`);
      }
      const docs = await tableData(page, "GSTR-1: Documents issued (Table 13)");
      const invoices = docs.rows.find((r) => r[0] === "Invoices for outward supply");
      assert.equal(invoices[4], "1", "one cancelled");
      const hsn = await tableData(page, "GSTR-1: HSN summary (Table 12)");
      assert.equal(hsn.rows.at(-1)[0], "Not recorded");
    });

    await check("Daily Collection: expected by mode matches the seeded day, and a short count shows the shortfall", async () => {
      await page.goto(`${reports}?report=daily-collection`, { waitUntil: "networkidle" });
      await page.getByTestId("collection-status").waitFor();
      assert.equal(await page.getByTestId("collection-status").getAttribute("data-status"), "NOT_COUNTED");
      const table = await tableData(page, "Reconciliation by payment mode");
      const expectedOf = (label) => num(table.rows.find((r) => r[0] === label)[5]);
      near(expectedOf("Cash"), expected.today.CASH, "cash expected");
      near(expectedOf("UPI"), expected.today.UPI, "upi expected");
      near(expectedOf("Card"), expected.today.CARD, "card expected");
      near(num(await page.getByTestId("expected-total").innerText()), expected.today.expected, "expected total");
      await shot(page, "daily-collection-1440");
      await page.getByRole("textbox", { name: "Cash counted" }).fill(String(expected.today.CASH - 50));
      await page.getByRole("textbox", { name: "UPI counted" }).fill(String(expected.today.UPI));
      await page.getByRole("textbox", { name: "Card counted" }).fill(String(expected.today.CARD));
      assert.equal(await page.getByTestId("difference-total").innerText(), "-50.00");
      await page.getByRole("button", { name: "Save count" }).click();
      await page.getByText(/Count saved\. Short by ₹50\.00/).waitFor();
      assert.equal(await page.getByTestId("collection-status").getAttribute("data-status"), "SHORT");
      await shot(page, "daily-collection-short-1440");
    });

    await check("two people recounting at once: the second is refused, sees the first count and keeps their figures", async () => {
      const doctor = await open("doctor");
      await doctor.page.goto(`${reports}?report=daily-collection`, { waitUntil: "networkidle" });
      await doctor.page.getByRole("textbox", { name: "Cash counted" }).fill(String(expected.today.CASH));
      await page.reload({ waitUntil: "networkidle" });
      await page.getByRole("textbox", { name: "Cash counted" }).fill(String(expected.today.CASH));
      await page.getByRole("button", { name: "Save recount" }).click();
      await page.getByText(/Count saved\. Balanced/).waitFor();
      await doctor.page.getByRole("button", { name: "Save recount" }).click();
      await doctor.page.getByText(/Someone else saved a count/).waitFor();
      assert.equal(await doctor.page.getByRole("textbox", { name: "Cash counted" }).inputValue(), String(expected.today.CASH));
      const counts = await stack.db.pharmacyCashCount.findMany({ where: { day: today }, orderBy: { sequence: "asc" } });
      assert.deepEqual(counts.map((c) => c.sequence), [1, 2]);
      await doctor.context.close();
    });

    await check("an accountant opens the GST reports; reception has no menu entry and is refused by the server", async () => {
      const acc = await open("accountant");
      await acc.page.goto(`${reports}?report=gstr-2b`, { waitUntil: "networkidle" });
      await acc.page.getByRole("table", { name: "GSTR-2B" }).waitFor();
      await acc.context.close();
      const rec = await open("reception");
      await rec.page.goto(`${stack.base}/dashboard`, { waitUntil: "networkidle" });
      assert.equal(await rec.page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Pharmacy Report" }).count(), 0);
      await rec.page.goto(`${reports}?report=sales-register`, { waitUntil: "networkidle" });
      await rec.page.getByText("Your role cannot open pharmacy reports").waitFor();
      await rec.context.close();
    });

    await check("old Inventory report links land on the same report in Pharmacy Report", async () => {
      await page.goto(`${stack.base}/dashboard/inventory?area=purchases&view=daywise`, { waitUntil: "networkidle" });
      await page.waitForURL(/report=day-wise-summary/);
      await page.getByRole("table", { name: /Day-wise sales summary/ }).waitFor();
      await page.getByRole("button", { name: "Download" }).click();
      assert.match(await page.getByRole("menuitem", { name: "PDF" }).getAttribute("href"), /^\/api\/pharmacy\/reports\/day-wise-summary\?.*format=pdf/);
      await page.keyboard.press("Escape");
      await page.goto(`${stack.base}/dashboard/inventory?area=purchases&view=margin`, { waitUntil: "networkidle" });
      await page.waitForURL(/report=item-margin/);
    });

    await check("at 390 px the page never scrolls sideways; wide tables scroll inside their frame", async () => {
      const phone = await open("pharmacist", { width: 390, height: 844 });
      for (const [name, url] of [["landing", reports], ["purchase-bills", `${reports}?report=purchase-bills`], ["daily-collection", `${reports}?report=daily-collection`]]) {
        await phone.page.goto(url, { waitUntil: "networkidle" });
        const overflow = await phone.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert.ok(overflow <= 0, `${name} overflows by ${overflow}px`);
        await shot(phone.page, `${name}-390`);
      }
      await phone.context.close();
    });

    await check("no console errors or failed requests along the way", async () => {
      assert.deepEqual(errors.filter((e) => !/403|Forbidden|Failed to load resource/.test(e)), []);
    });
  } finally {
    await browser.close();
    await stack.stop();
    fs.writeFileSync(path.join(out, "results.json"), JSON.stringify(results, null, 2));
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\n${results.length - failed}/${results.length} CR-33 scenarios passed`);
    process.exitCode = failed ? 1 : 0;
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
