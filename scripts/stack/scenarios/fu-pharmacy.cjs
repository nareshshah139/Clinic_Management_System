const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { bootStack } = require("../boot.cjs");
const { api, tokenFor, browserLogin, addUser } = require("./cr31-seed.cjs");

const root = path.resolve(__dirname, "../../..");
const out = process.env.SHOTS_DIR || path.join(root, "output/stack/fu-pharmacy");
const VIEWPORTS = { 1280: { width: 1280, height: 800 }, 390: { width: 390, height: 844 } };
const clean = (text) => String(text ?? "").replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();
const FLUTAS = "Tab. Flutas 150 mg";
const FLUTAS_50 = "Tab. Flutas 50 mg";
const SOTRET = "Cap. Sotret 10 mg";
const CATALOGUE_ONLY = /Flutas 150(?! mg)/;
const RECORDED = { nameNormalization: { version: 1, aliases: ["13 74 | Flutas 150Mg(Pc)"] } };
const PARTIAL = ["13 74 | Flutas", "Flutas", "| Flutas", "74 |", "Tab. Flutas 150"];
const PUNCTUATION = ['"', "%", "_", "\\", "'", "|", "&", "!", "(", ")", "%_%", "' OR 1=1 --"];

async function seed(stack) {
  const db = stack.db;
  const branchId = stack.branch.id;
  await addUser(stack, "admin", { role: "ADMIN", firstName: "Asha", lastName: "Rao", permissions: [] });
  const drug = (name, dosageForm) => db.drug.create({ data: { branchId, name, dosageForm, price: 40, manufacturerName: "Lakshmi Pharma", packSizeLabel: "10 per strip" } });
  const drugs = { flutas: await drug("Flutas 150", "Tablet"), flutas50: await drug("Flutas 50", "Tablet"), sotret: await drug("Sotret 10", "Capsule"), sotret20: await drug("Sotret 20", "Capsule") };
  const batch = (key, name, drugKey, stock, expiry, batchNumber, extra = {}) =>
    db.inventoryItem.create({
      data: {
        branchId, name, type: "MEDICINE", unit: "STRIPS", packSize: 10, packUnit: "tablets", costPrice: 20, sellingPrice: 40, mrp: 45, gstRate: 12,
        currentStock: stock, batchNumber, expiryDate: new Date(`${expiry}T23:59:59.999Z`), stockStatus: stock ? "IN_STOCK" : "OUT_OF_STOCK", status: "ACTIVE",
        hsnCode: "30049099", storageLocation: "Rack F-1", drugs: { connect: { id: drugs[drugKey].id } }, ...extra,
      },
    });
  const items = {
    flutasA: await batch("flutasA", FLUTAS, "flutas", 0, "2027-03-31", "FA-01", { metadata: JSON.stringify(RECORDED), strength: "150 mg", form: "TABLET" }),
    flutasB1: await batch("flutasB1", FLUTAS, "flutas", 20, "2028-06-30", "FB-01", { metadata: JSON.stringify(RECORDED), strength: "150 mg", form: "TABLET" }),
    flutasB2: await batch("flutasB2", FLUTAS, "flutas", 8, "2027-11-30", "FB-02", { metadata: JSON.stringify(RECORDED), strength: "150 mg", form: "TABLET" }),
    flutas50: await batch("flutas50", FLUTAS_50, "flutas50", 30, "2028-01-31", "F50-01", { strength: "50 mg", form: "TABLET" }),
    sotretA: await batch("sotretA", SOTRET, "sotret", 0, "2027-04-30", "SA-01", { strength: "10 mg", form: "CAPSULE" }),
    sotret20: await batch("sotret20", "Cap. Sotret 20 mg", "sotret20", 12, "2028-04-30", "S20-01", { strength: "20 mg", form: "CAPSULE" }),
  };
  const patient = (name, phone) => db.patient.create({ data: { branchId, name, gender: "F", phone } });
  const meera = await patient("Meera Shah", "9876500021");
  const pooja = await patient("Pooja Menon", "9876500022");
  const visit = (who, extra = {}) => db.visit.create({ data: { patientId: who.id, doctorId: stack.users.doctor.id, complaints: "[]", ...extra } });
  const course = (drugName, drugKey, inventoryItemId, dosageUnit) => ({ drugName, drugId: drugs[drugKey].id, inventoryItemId, dosage: 1, dosageUnit, frequency: "ONCE_DAILY", duration: 10, durationUnit: "DAYS", quantity: 10 });
  const lastVisit = await visit(meera, { diagnosis: JSON.stringify(["Tinea corporis"]), createdAt: new Date(Date.now() - 20 * 86400000) });
  await db.prescription.create({ data: { visitId: lastVisit.id, status: "ACTIVE", createdAt: lastVisit.createdAt, items: JSON.stringify([course(FLUTAS, "flutas", items.flutasA.id, "TABLET"), course(SOTRET, "sotret", items.sotretA.id, "CAPSULE")]) } });
  await db.pharmacyInvoice.create({ data: { branchId, patientId: meera.id, invoiceNumber: "PHI-OLD-001", status: "COMPLETED", subtotal: 40, totalAmount: 40, balanceAmount: 0, paymentMethod: "CASH", billingName: meera.name, billingPhone: meera.phone, prescriptionId: (await db.prescription.findUnique({ where: { visitId: lastVisit.id } })).id } });
  const newVisit = await visit(meera);
  const olderVisit = await visit(pooja, { createdAt: new Date(Date.now() - 2 * 3600000) });
  const older = await db.prescription.create({ data: { visitId: olderVisit.id, status: "ACTIVE", createdAt: new Date(Date.now() - 2 * 3600000), items: JSON.stringify([{ ...course("13 74 | Flutas 150Mg(Pc)", "flutas", items.flutasA.id, "TABLET"), quantity: 10 }]) } });
  const searchVisit = await visit(pooja);
  return { drugs, items, patients: { meera, pooja }, visits: { newVisit, searchVisit }, older };
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const stack = await bootStack({ databaseUrl: process.env.STACK_DATABASE_URL, label: "fu-pharmacy" });
  let browser;
  let failed = 0;
  const check = (label, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failed++;
    console.log(`${ok ? "PASS" : "FAIL"} ${label}${ok ? "" : ` :: expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`}`);
  };
  try {
    console.log(`BOOT base=${stack.base}`);
    const { items, patients, visits, older } = await seed(stack);
    const db = stack.db;
    const tokens = {};
    const call = async (who, method, url, body) => {
      for (let attempt = 0; ; attempt++) {
        try {
          return await api(stack, (tokens[who] ??= await tokenFor(stack, who)), method, url, body);
        } catch (error) {
          if (error.status !== 429 || attempt >= 6) throw error;
          console.log(`  ${who} ${url}: throttled, waiting`);
          await new Promise((r) => setTimeout(r, 15000));
        }
      }
    };
    const q = (params) => new URLSearchParams(params).toString();
    const stockOf = async () => Object.fromEntries((await db.inventoryItem.findMany({ select: { batchNumber: true, currentStock: true, status: true } })).map((i) => [i.batchNumber, [i.currentStock, i.status]]));

    for (const [key, item] of [["flutasA", items.flutasA], ["sotretA", items.sotretA]]) {
      const fresh = await db.inventoryItem.findUnique({ where: { id: item.id } });
      await call("admin", "PATCH", `/inventory/items/${item.id}`, { status: "INACTIVE", reason: "Batch sold out; archived", updatedAt: fresh.updatedAt.toISOString() });
      console.log(`NOTE archived ${key}`);
    }
    check("admin archives the sold-out batches FA-01 and SA-01 through the API", Object.entries(await stockOf()).map(([b, [, s]]) => [b, s]).sort(),
      [["F50-01", "ACTIVE"], ["FA-01", "INACTIVE"], ["FB-01", "ACTIVE"], ["FB-02", "ACTIVE"], ["S20-01", "ACTIVE"], ["SA-01", "INACTIVE"]]);

    const searches = {
      doctor: async (query) => (await call("doctor", "GET", `/prescriptions/drugs/autocomplete?${q({ q: query, limit: "10" })}`)).map((r) => r.name),
      pharmacist: async (query) => (await call("pharmacist", "GET", `/pharmacy/prescription-queue/inventory-suggestions?${q({ q: query })}`)).map((r) => r.name),
      admin: async (query) => [...new Set((await call("admin", "GET", `/inventory/workspace/stock?${q({ search: query, limit: "50" })}`)).rows.map((r) => r.name))],
      billing: async (query) => (await call("pharmacist", "GET", `/drugs/autocomplete?${q({ q: query, limit: "10" })}`)).map((r) => r.stockName || r.name),
    };
    for (const [who, search] of Object.entries(searches)) {
      const partial = [];
      for (const query of PARTIAL) partial.push(await search(query));
      check(`${who} search finds the item by part of its recorded name, "|" included`, partial, [[FLUTAS], [FLUTAS, FLUTAS_50], [FLUTAS, FLUTAS_50], [FLUTAS], [FLUTAS]]);
      const odd = [];
      for (const query of PUNCTUATION) odd.push(await search(query).then((names) => names.length, (error) => `${error.status}`));
      check(`${who} search treats quotes, wildcards, slashes and operators as text`, odd, PUNCTUATION.map(() => 0));
    }

    browser = await chromium.launch();
    const sessions = new Map();
    const open = async (who, width) => {
      const context = await browser.newContext({ viewport: VIEWPORTS[width], ...(sessions.has(who) && { storageState: sessions.get(who) }) });
      const page = await context.newPage();
      page.setDefaultTimeout(60000);
      const seen = { errors: [], refused: [] };
      page.on("pageerror", (e) => seen.errors.push(`pageerror ${e.message.slice(0, 200)}`));
      page.on("console", (m) => m.type() === "error" && seen.errors.push(m.text().slice(0, 200)));
      page.on("response", (r) => r.url().includes("/api/") && [401, 403, 429, 500].includes(r.status()) && seen.refused.push(`${r.status()} ${new URL(r.url()).pathname}`));
      if (!sessions.has(who)) {
        await browserLogin(stack, page, who);
        sessions.set(who, await context.storageState());
        seen.errors.length = 0;
        seen.refused.length = 0;
      }
      return { page, context, seen };
    };
    const go = async (page, route) => {
      await page.goto(`${stack.base}${route}`, { waitUntil: "domcontentloaded", timeout: 240000 });
      await page.locator("main").first().waitFor({ state: "attached", timeout: 240000 });
    };
    const settle = (page) => page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    const overflow = (page) =>
      page.evaluate(() => {
        const main = document.querySelector("main");
        return Math.max(document.scrollingElement.scrollWidth - window.innerWidth, main ? main.scrollWidth - main.clientWidth : 0);
      });
    const shot = async (page, name) => {
      const viewport = page.viewportSize();
      const height = await page.evaluate(() => Math.max(document.querySelector("main")?.scrollHeight ?? 0, document.documentElement.scrollHeight) + 80);
      await page.setViewportSize({ width: viewport.width, height: Math.min(Math.max(height, viewport.height), 9000) });
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(out, `fu-pharmacy-${name}.png`), fullPage: true });
      await page.setViewportSize(viewport);
    };
    const line = (page, name) => page.locator("[data-invoice-item]").filter({ has: page.getByRole("heading", { name, level: 4, exact: true }) });
    const lineHeadings = async (page) => (await page.locator("[data-invoice-item] h4").allInnerTexts()).map(clean);
    const pickerRow = (page, index) => page.getByPlaceholder("Search medicine name...").nth(index);
    const openPrescription = async (page, visit, patient) => {
      await page.goto(`${stack.base}/dashboard/visits?visitId=${visit.id}&patientId=${patient.id}`, { waitUntil: "domcontentloaded", timeout: 240000 });
      await page.getByTestId("visit-identity").first().waitFor({ timeout: 240000 });
      await page.getByRole("tab", { name: "Prescription" }).first().click();
      const ready = await pickerRow(page, 0).waitFor({ timeout: 60000 }).then(() => true, () => false);
      if (!ready) {
        await page.getByRole("button", { name: "Add Row" }).first().click();
        await pickerRow(page, 0).waitFor({ timeout: 60000 });
      }
    };
    const pickerOffers = async (page, query) => {
      await pickerRow(page, 0).click();
      await pickerRow(page, 0).fill(query);
      const rows = page.locator("div[title]").filter({ has: page.getByRole("button", { name: "Select" }) });
      await rows.first().waitFor({ timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(800);
      return (await rows.locator(".font-medium").allInnerTexts()).map(clean).map((t) => t.replace(/ Strength missing$/, ""));
    };
    const billSearch = async (page, query) => {
      await page.getByLabel("Search Drugs").fill(query);
      await page.waitForTimeout(1200);
      await settle(page);
      return (await page.locator('[role="button"] h4.font-medium').allInnerTexts()).map(clean);
    };
    const finish = async (page) => {
      for (const input of await page.locator('input[id^="gst-"]').all()) if (!(await input.inputValue())) await input.fill("12");
      await page.getByRole("button", { name: "Print Preview" }).click();
      const preview = clean(await page.getByRole("dialog").last().innerText());
      await page.getByRole("button", { name: "Confirm Invoice" }).click();
      await page.getByRole("button", { name: "Invoice Confirmed" }).waitFor({ timeout: 120000 });
      return preview;
    };
    const loadFromQueue = async (page, patient) => {
      await go(page, "/dashboard/pharmacy/sales/bill");
      const row = page.locator("tbody tr").filter({ hasText: patient.name }).first();
      await row.waitFor({ timeout: 240000 });
      await row.getByRole("button", { name: "Load" }).click();
      await page.getByRole("heading", { name: "Linked Prescription" }).waitFor({ timeout: 120000 });
      await page.locator("[data-invoice-item]").first().waitFor({ timeout: 120000 });
      await settle(page);
    };

    let prescription;
    {
      const { page, context, seen } = await open("doctor", "1280");
      await openPrescription(page, visits.newVisit, patients.meera);
      await page.getByLabel("Diagnosis").first().fill("Tinea corporis");
      const filled = await page.waitForFunction((name) => [...document.querySelectorAll('input[placeholder="Search medicine name..."]')].some((el) => el.value === name), FLUTAS, { timeout: 120000 }).then(() => true, () => false);
      const values = await page.locator('input[placeholder="Search medicine name..."]').evaluateAll((els) => els.map((el) => el.value).filter(Boolean));
      check("doctor-1280 the diagnosis brings back the patient's last plan on the archived batches", [filled, values], [true, [FLUTAS, SOTRET]]);
      await shot(page, "doctor-1280-01-learned-plan-applied");
      await page.getByRole("button", { name: "Create Prescription" }).click();
      const stay = page.getByRole("button", { name: "Stay Here" });
      if (await stay.waitFor({ timeout: 30000 }).then(() => true, () => false)) await stay.click();
      for (let i = 0; i < 60 && !prescription; i++) {
        prescription = await db.prescription.findFirst({ where: { visitId: visits.newVisit.id } });
        if (!prescription) await new Promise((r) => setTimeout(r, 1000));
      }
      check("doctor-1280 the saved prescription keeps the archived batches as its lines' identity",
        prescription && JSON.parse(prescription.items).map((it) => [it.drugName, it.inventoryItemId]), [[FLUTAS, items.flutasA.id], [SOTRET, items.sotretA.id]]);
      check("doctor-1280 prescribing: no console error or refused call", [seen.errors, seen.refused], [[], []]);
      await context.close();
    }

    const stock = await call("pharmacist", "GET", `/pharmacy/prescription-queue/${prescription.id}/stock-check`);
    check("stock check: the archived Flutas batch reads the product's in-stock batches, earliest expiry first; Sotret is out of stock and never Sotret 20",
      stock.items.map((l) => [l.drugName, l.inventoryItemId === items.flutasA.id || l.inventoryItemId === items.sotretA.id, l.stockName, l.stockStatus, l.totalNonExpiredStock, l.batches.map((b) => b.batchNumber)]),
      [[FLUTAS, true, FLUTAS, "IN_STOCK", 28, ["FB-02", "FB-01"]], [SOTRET, true, SOTRET, "OUT_OF_STOCK", 0, []]]);

    let sold;
    {
      const { page, context, seen } = await open("pharmacist", "1280");
      await loadFromQueue(page, patients.meera);
      await line(page, SOTRET).waitFor({ timeout: 120000 });
      const flutasCard = clean(await line(page, FLUTAS).innerText());
      const sotretCard = clean(await line(page, SOTRET).innerText());
      check("pharmacist-1280 the bill heads the lines with the stock names, Flutas matched and in stock, Sotret out of stock, no Prescribed repeat",
        [await lineHeadings(page), flutasCard.includes("No match"), flutasCard.includes("Out of stock"), flutasCard.includes("Prescribed:"), sotretCard.includes("Out of stock"), CATALOGUE_ONLY.test(flutasCard)],
        [[FLUTAS, SOTRET], false, false, false, true, false]);
      await shot(page, "pharmacist-1280-02-bill-from-learned-plan");
      await line(page, SOTRET).getByRole("button", { name: `Remove ${SOTRET}` }).click();
      const before = await stockOf();
      const preview = await finish(page);
      check("pharmacist-1280 the print preview names the line by its stock name", [preview.includes(FLUTAS), CATALOGUE_ONLY.test(preview)], [true, false]);
      await shot(page, "pharmacist-1280-03-bill-confirmed");
      sold = await db.pharmacyInvoice.findFirst({ where: { prescriptionId: prescription.id, status: "CONFIRMED" }, include: { items: true } });
      const sales = await db.stockTransaction.findMany({ where: { type: "SALE", reference: { contains: sold.invoiceNumber } }, select: { itemId: true, quantity: true, batchNumber: true } });
      const after = await stockOf();
      check("pharmacist-1280 the bill keeps the saved line identity and sells the earliest-expiring in-stock batch FB-02",
        [sold.items.map((i) => [i.inventoryItemId === items.flutasA.id, i.quantity]), sales.map((s) => [s.batchNumber, s.quantity]), after["FB-02"][0] - before["FB-02"][0], after["FB-01"][0] - before["FB-01"][0], after["FA-01"], after["F50-01"]],
        [[[true, 1]], [["FB-02", 1]], -1, 0, [0, "INACTIVE"], [30, "ACTIVE"]]);
      check("pharmacist-1280 billing: no console error or refused call", [seen.errors, seen.refused], [[], []]);
      await context.close();
    }
    const entry = await call("pharmacist", "GET", `/pharmacy/prescription-queue/${prescription.id}`);
    check("the queue counts the Flutas line covered by the bill and leaves Sotret open", entry.medications.map((m) => [m.drugName, m.coverageStatus]), [[FLUTAS, "covered"], [SOTRET, "not_started"]]);
    const printed = await call("pharmacist", "GET", `/pharmacy/invoices/${sold.id}/print-data?${q({ format: "A5" })}`);
    check("the bill's print data names the line by its stock name and batch", printed.lines.map((l) => [l.name, l.batchAllocations.map((b) => b.batchNumber)]), [[FLUTAS, ["FB-02"]]]);

    for (const width of ["1280", "390"]) {
      const { page, context, seen } = await open("pharmacist", width);
      await go(page, `/dashboard/pharmacy/sales/bill?bill=${sold.id}`);
      await page.getByText(sold.invoiceNumber).first().waitFor({ timeout: 240000 });
      await settle(page);
      const text = clean(await page.locator("main").innerText());
      check(`pharmacist-${width} the finished bill shows the stock name, not the catalogue name`, [text.includes(FLUTAS), CATALOGUE_ONLY.test(text)], [true, false]);
      check(`pharmacist-${width} finished bill: no page overflow`, await overflow(page), 0);
      await shot(page, `pharmacist-${width}-04-finished-bill`);
      check(`pharmacist-${width} finished bill: no console error or refused call`, [seen.errors, seen.refused], [[], []]);
      await context.close();
    }

    {
      const { page, context, seen } = await open("pharmacist", "390");
      await loadFromQueue(page, patients.pooja);
      const card = clean(await page.locator("[data-invoice-item]").first().innerText());
      check("pharmacist-390 an older prescription on the archived batch loads matched, in stock, under the stock name with what was prescribed",
        [await lineHeadings(page), card.includes("No match"), card.includes("Out of stock"), card.includes("Prescribed: 13 74 | Flutas 150Mg(Pc)")], [[FLUTAS], false, false, true]);
      check("pharmacist-390 bill from the older prescription: no page overflow", await overflow(page), 0);
      await shot(page, "pharmacist-390-05-older-prescription-bill");
      check("pharmacist-390 loading: no console error or refused call", [seen.errors, seen.refused], [[], []]);
      await context.close();
    }
    check("the older prescription is unchanged in the database", JSON.parse((await db.prescription.findUnique({ where: { id: older.id } })).items).map((it) => [it.drugName, it.inventoryItemId === items.flutasA.id]), [["13 74 | Flutas 150Mg(Pc)", true]]);

    for (const [who, width] of [["pharmacist", "1280"], ["doctor", "1280"], ["admin", "1280"], ["pharmacist", "390"]]) {
      const tag = `${who}-${width}`;
      const { page, context, seen } = await open(who, width);
      await go(page, "/dashboard/pharmacy/sales/bill");
      await page.getByLabel("Search Drugs").waitFor({ timeout: 240000 });
      const found = [];
      for (const query of ["13 74 | Flutas", "| Flutas", "Tab. Flutas 150", "%"]) {
        found.push(await billSearch(page, query));
        if (query === "13 74 | Flutas") await shot(page, `${tag}-06-bill-search-pipe`);
      }
      check(`${tag} the bill's product search finds part of a recorded name and lists stock names`, found, [[FLUTAS], [FLUTAS, FLUTAS_50], [FLUTAS], []]);
      await billSearch(page, "13 74 | Flutas");
      await page.locator('[role="button"]').filter({ has: page.getByRole("heading", { name: FLUTAS, level: 4 }) }).first().getByRole("button", { name: "Add" }).click();
      await line(page, FLUTAS).waitFor({ timeout: 30000 });
      check(`${tag} the added line carries the stock name`, await lineHeadings(page), [FLUTAS]);
      check(`${tag} bill search: no page overflow`, await overflow(page), 0);
      check(`${tag} bill search: no console error or refused call`, [seen.errors, seen.refused], [[], []]);
      await context.close();
    }

    for (const [who, width] of [["pharmacist", "1280"], ["doctor", "1280"], ["admin", "1280"], ["admin", "390"]]) {
      const tag = `${who}-${width}`;
      const { page, context, seen } = await open(who, width);
      const found = [];
      for (const search of ["13 74 | Flutas", "74 |"]) {
        await go(page, `/dashboard/inventory?area=stock&view=list&${q({ search })}`);
        await page.getByText(/\d+ matching batch/).first().waitFor({ timeout: 240000 });
        await settle(page);
        found.push(clean(await page.getByText(/\d+ matching batch/).first().innerText()));
        if (search === "13 74 | Flutas") await shot(page, `${tag}-07-stock-list-pipe`);
      }
      check(`${tag} the stock list finds the Flutas 150 batches by part of the recorded name`, found.map((t) => t.match(/\d+ matching batch/)[0]), ["2 matching batch", "2 matching batch"]);
      check(`${tag} stock list: no page overflow`, await overflow(page), 0);
      check(`${tag} stock list: no console error or refused call`, [seen.errors, seen.refused], [[], []]);
      await context.close();
    }

    for (const [who, width] of [["doctor", "1280"], ["doctor", "390"]]) {
      const tag = `${who}-${width}`;
      const { page, context, seen } = await open(who, width);
      await openPrescription(page, visits.searchVisit, patients.pooja);
      const offered = [];
      for (const query of ["13 74 | Flutas", "74 |", "| Flutas"]) {
        offered.push(await pickerOffers(page, query));
        if (query === "13 74 | Flutas") await shot(page, `${tag}-08-rx-picker-pipe`);
      }
      check(`${tag} the prescription picker offers the standard name for part of the recorded name`, offered, [[FLUTAS], [FLUTAS], [FLUTAS, FLUTAS_50]]);
      check(`${tag} picker: no page overflow`, await overflow(page), 0);
      check(`${tag} picker: no console error or refused call`, [seen.errors, seen.refused], [[], []]);
      await context.close();
    }
  } finally {
    await browser?.close();
    await stack.stop();
  }
  console.log(failed ? `FU-PHARMACY FAIL ${failed}` : "FU-PHARMACY PASS");
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error("FU-PHARMACY FAIL", e);
  process.exit(1);
});
