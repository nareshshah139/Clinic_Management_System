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
    const admin = await stack.db.user.create({
      data: { branchId: stack.branch.id, email: "asha.admin@stack.example.invalid", firstName: "Asha", lastName: "Admin", role: "ADMIN", password: owner.password, permissions: JSON.stringify([]) },
    });
    users.admin = { ...users.owner, id: admin.id, email: admin.email, role: "ADMIN" };
    const expected = await seed(stack.db, { branchId: stack.branch.id, doctorId: users.doctor.id, pharmacistId: users.pharmacist.id, today });
    const month = expected.month;

    const sessions = new Map();
    const open = async (who, viewport = { width: 1440, height: 900 }) => {
      const context = await browser.newContext({ viewport, acceptDownloads: true, timezoneId: "Asia/Kolkata", ...(sessions.has(who) && { storageState: sessions.get(who) }) });
      const page = await context.newPage();
      page.on("console", (m) => m.type() === "error" && !/Download the React DevTools|favicon/.test(m.text()) && errors.push(`${who}: ${m.text()}`));
      page.on("pageerror", (e) => errors.push(`${who}: ${e.message}`));
      if (!sessions.has(who)) {
        await stack.login(page, who);
        sessions.set(who, await context.storageState());
      }
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

    const wed = expected.filterDay;
    const seededDoctor = await stack.db.user.findUnique({ where: { id: users.doctor.id } }).then((u) => `${u.firstName} ${u.lastName}`.trim());
    const filteredRegister = async (target, { gst, source, doctor, discount }) => {
      await target.goto(`${reports}?report=sales-register&from=${wed}&to=${wed}`, { waitUntil: "networkidle" });
      await target.getByRole("table", { name: "Sales Register" }).waitFor();
      if (gst) await target.getByRole("combobox", { name: "GST" }).selectOption(gst);
      if (source || doctor || discount) {
        await target.getByRole("button", { name: /More filters/ }).click();
        const panel = target.getByRole("group", { name: "More filters" });
        if (source) await panel.getByRole("combobox", { name: "Source" }).selectOption(source);
        if (doctor) await panel.getByRole("combobox", { name: "Doctor" }).selectOption(doctor);
        if (discount) await panel.getByRole("combobox", { name: "Discount" }).selectOption(discount);
        await target.keyboard.press("Escape");
      }
      if (gst || source || doctor || discount) {
        const applied = target.waitForResponse((r) => r.url().includes("/api/pharmacy/reports/sales-register") && r.request().method() === "GET");
        await target.getByRole("button", { name: "Go", exact: true }).click();
        await applied;
      }
      await target.waitForLoadState("networkidle");
      const data = await tableData(target, "Sales Register");
      return { data, numbers: data.rows.map((r) => r[0]), headline: num(await target.getByTestId("report-headline").innerText()) };
    };

    await check("Sales Register GST dropdown: with GST and without GST split the day, and the headline follows the rows", async () => {
      const all = await filteredRegister(page, {});
      assert.deepEqual(all.numbers, ["PHI-2024-003", "PHI-2024-004", "CS-2024-001", "CS-2024-002"]);
      near(all.headline, 1241.1, "headline, all bills");
      const withGst = await filteredRegister(page, { gst: "WITH_GST" });
      assert.deepEqual(withGst.numbers, ["PHI-2024-003", "PHI-2024-004", "CS-2024-002"]);
      near(withGst.headline, 1070.1, "headline, with GST");
      near(num(withGst.data.totals[11]), 1070.1, "totals row, with GST");
      const without = await filteredRegister(page, { gst: "WITHOUT_GST" });
      assert.deepEqual(without.numbers, ["CS-2024-001"]);
      near(without.headline, 171, "headline, without GST");
    });

    await check("Sales Register More filters: source, doctor and discount each narrow the rows and the headline, and the badge counts them", async () => {
      const counter = await filteredRegister(page, { source: "COUNTER_SALE" });
      assert.deepEqual(counter.numbers, ["CS-2024-001", "CS-2024-002"]);
      near(counter.headline, 360, "headline, counter sales");
      assert.match(await page.getByRole("button", { name: /More filters/ }).innerText(), /^More filters\s+1\s+active$/);
      const bills = await filteredRegister(page, { source: "BILL" });
      assert.deepEqual(bills.numbers, ["PHI-2024-003", "PHI-2024-004"]);
      near(bills.headline, 881.1, "headline, prescription bills");
      const doctor = await filteredRegister(page, { doctor: seededDoctor });
      assert.deepEqual(doctor.numbers, ["PHI-2024-003", "PHI-2024-004"]);
      const visiting = await filteredRegister(page, { doctor: "Dr. Visiting" });
      assert.deepEqual(visiting.numbers, ["CS-2024-001"]);
      near(visiting.headline, 171, "headline, Dr. Visiting");
      const discounted = await filteredRegister(page, { discount: "DISCOUNTED" });
      assert.deepEqual(discounted.numbers, ["PHI-2024-004", "CS-2024-001"]);
      near(discounted.headline, 648.9, "headline, discounted");
      const both = await filteredRegister(page, { gst: "WITH_GST", source: "BILL", discount: "DISCOUNTED" });
      assert.deepEqual(both.numbers, ["PHI-2024-004"]);
      near(both.headline, 477.9, "headline, with GST, bills, discounted");
      assert.match(await page.getByRole("button", { name: /More filters/ }).innerText(), /^More filters\s+2\s+active$/);
      const choices = await page.getByRole("button", { name: /More filters/ }).click().then(() => page.getByRole("combobox", { name: "Doctor" }).locator("option").allInnerTexts());
      assert.deepEqual(choices, ["All doctors", "Dr. Visiting", seededDoctor].sort((a, b) => (a === "All doctors" ? -1 : b === "All doctors" ? 1 : a.localeCompare(b))));
      await page.getByRole("group", { name: "More filters" }).getByRole("button", { name: "Clear" }).click();
      assert.equal(await page.getByRole("button", { name: /More filters/ }).innerText(), "More filters");
      await page.keyboard.press("Escape");
    });

    await check("a filtered Sales Register prints and downloads only the filtered rows and names the filters", async () => {
      await filteredRegister(page, { gst: "WITH_GST", source: "BILL", discount: "DISCOUNTED" });
      await page.getByRole("button", { name: "Download" }).click();
      const csvLink = await page.getByRole("menuitem", { name: "CSV" }).getAttribute("href");
      const query = new URL(csvLink, stack.base).searchParams;
      assert.deepEqual([query.get("gst"), query.get("source"), query.get("discount"), query.get("doctor")], ["WITH_GST", "BILL", "DISCOUNTED", null]);
      const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "CSV" }).click()]);
      const target = path.join(out, `filtered-${file.suggestedFilename()}`);
      await file.saveAs(target);
      const csv = fs.readFileSync(target, "utf8").replace(/^﻿/, "").trim().split("\r\n");
      assert.equal(csv.length, 3, "header, totals and one bill");
      assert.ok(csv[2].startsWith("PHI-2024-004"));
      await page.getByRole("button", { name: "Download" }).click();
      const [pdfFile] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "PDF" }).click()]);
      const pdfTarget = path.join(out, `filtered-${pdfFile.suggestedFilename()}`);
      await pdfFile.saveAs(pdfTarget);
      const text = execFileSync("pdftotext", ["-layout", pdfTarget, "-"], { encoding: "utf8" }).replace(/\s+/g, " ");
      assert.ok(text.includes("Showing only: bills with GST, prescription bills, discounted bills."), "pdf names the filters");
      assert.ok(!text.includes("PHI-2024-003"), "pdf holds no bill outside the filters");
    });

    await check("Sales Register filter controls at 1440 and 390 px", async () => {
      await filteredRegister(page, { gst: "WITH_GST", source: "BILL", discount: "DISCOUNTED" });
      await page.getByRole("button", { name: /More filters/ }).click();
      await shot(page, "sales-register-more-filters-1440");
      await page.keyboard.press("Escape");
      const phone = await open("pharmacist", { width: 390, height: 844 });
      await phone.page.goto(`${reports}?report=sales-register&from=${wed}&to=${wed}&gst=WITH_GST&source=BILL&discount=DISCOUNTED`, { waitUntil: "networkidle" });
      await phone.page.getByRole("button", { name: /More filters/ }).click();
      await phone.page.getByRole("group", { name: "More filters" }).waitFor();
      const box = await phone.page.getByRole("group", { name: "More filters" }).boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= 390, `panel stays on screen (${box.x}, ${box.width})`);
      assert.ok(await phone.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 0, "no sideways scroll");
      await shot(phone.page, "sales-register-more-filters-390");
      await phone.context.close();
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
      const table = await tableData(page, "Pharmacy reconciliation by payment mode");
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
      await page.getByText(/Count saved\. Pharmacy short by ₹50\.00/).waitFor();
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
      await page.getByText(/Count saved\. Pharmacy balanced/).waitFor();
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

    const { monday, tuesday } = expected.refundDay;
    for (const who of ["pharmacist", "doctor", "admin"]) {
      const role = await open(who);
      const text = () => role.page.locator("main").innerText();
      await check(`${who}: a refund handed back on Tuesday for Monday's revised bill takes 50 out of Tuesday's expected cash`, async () => {
        await role.page.goto(`${reports}?report=daily-collection&from=${tuesday}`, { waitUntil: "networkidle" });
        const modes = await tableData(role.page, "Pharmacy reconciliation by payment mode");
        const mode = (label) => modes.rows.find((r) => r[0] === label);
        assert.deepEqual([mode("Cash").slice(0, 6), mode("Card").slice(0, 6)], [
          ["Cash", "0.00", "0.00", "0.00", "-50.00", "-50.00"],
          ["Card", "1,008.00", "0.00", "0.00", "0.00", "1,008.00"],
        ]);
        const documents = await tableData(role.page, "Pharmacy bills, counter sales and returns");
        const refunded = documents.rows.find((r) => r[0] === "PHI-2024-001");
        assert.deepEqual([refunded[1], refunded[5], refunded[6]], ["Bill of 11/03/2024", "-50.00", "Refund · Cash"]);
        assert.ok(!(await text()).includes("DRAFT-"), "no draft placeholder on the page");
        await shot(role.page, `refund-day-${who}-1440`);
        await role.page.goto(`${reports}?report=daily-collection&from=${monday}`, { waitUntil: "networkidle" });
        const mondayModes = await tableData(role.page, "Pharmacy reconciliation by payment mode");
        assert.deepEqual(mondayModes.rows.find((r) => r[0] === "Cash").slice(0, 6), ["Cash", "200.00", "0.00", "0.00", "0.00", "200.00"]);
      });
      await check(`${who}: the bill-discounted bill reads taxable 900 on 1000 at 12% with a 10% bill discount, in the Sales Register and GSTR-1`, async () => {
        await role.page.goto(`${reports}?report=sales-register&from=${tuesday}&to=${tuesday}`, { waitUntil: "networkidle" });
        const register = await tableData(role.page, "Sales Register");
        assert.deepEqual(register.rows.map((r) => [r[0], ...r.slice(4)]), [["PHI-2024-002", "1,000.00", "100.00", "900.00", "0.00", "54.00", "54.00", "0.00", "1,008.00"]]);
        await shot(role.page, `bill-discount-register-${who}-1440`);
        await role.page.goto(`${reports}?report=gstr-1&from=${tuesday}&to=${tuesday}`, { waitUntil: "networkidle" });
        const b2cs = await tableData(role.page, "GSTR-1: B2C small, rate-wise (Table 7)");
        assert.deepEqual(b2cs.rows.map((r) => r.slice(2, 6)), [["12.00", "900.00", "54.00", "54.00"]]);
      });
      await check(`${who}: a draft cancelled before it got a number is not a document issued in GSTR-1 and shows no number in Sales`, async () => {
        const docs = await tableData(role.page, "GSTR-1: Documents issued (Table 13)");
        assert.deepEqual(docs.rows, [["Invoices for outward supply", "PHI-2024-002", "PHI-2024-002", "1", "0", "1"]]);
        assert.ok(!(await text()).includes("DRAFT-"), "no draft placeholder in GSTR-1");
        await shot(role.page, `gstr1-documents-${who}-1440`);
        await role.page.goto(`${stack.base}/dashboard/pharmacy/sales?from=${tuesday}&to=${tuesday}`, { waitUntil: "networkidle" });
        const sales = role.page.getByRole("tabpanel", { name: "Sales" });
        const row = sales.locator("tbody tr").filter({ hasText: "Cancelled draft" });
        await row.first().waitFor();
        assert.equal(await row.count(), 1);
        assert.ok(!(await sales.innerText()).includes("DRAFT-"), "no draft placeholder in Sales");
        await shot(role.page, `sales-cancelled-draft-${who}-1440`);
      });
      await role.context.close();
    }

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
