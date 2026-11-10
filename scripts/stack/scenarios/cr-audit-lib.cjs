// Shared helpers for the change-request audit scenarios (cr-audit-*.cjs).
// Each scenario boots the real stack (Postgres schema, backend, frontend), drives a real browser and
// records one row per requirement: PASS when the screen meets it, FAIL when it does not.
// A FAIL here is a finding about the product, so the scenarios always exit 0 unless they crash.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { seed, api, tokenFor, addUser } = require("./cr31-seed.cjs");

const root = path.resolve(__dirname, "../../..");
const outDir = path.resolve(process.env.CR_AUDIT_OUT || path.join(root, "verification/cr-audit-2026-11-10"));
const shotDir = path.join(outDir, "shots");
const resultDir = path.join(outDir, "results");

async function start(label) {
  fs.mkdirSync(shotDir, { recursive: true });
  fs.mkdirSync(resultDir, { recursive: true });
  let stack;
  if (process.env.CR_AUDIT_LIVE) {
    // Reuse an already booted stack (see the JSON a keep-alive boot script wrote). No database handle.
    stack = { ...JSON.parse(fs.readFileSync(process.env.CR_AUDIT_LIVE, "utf8")), live: true, stop: async () => {} };
    if (stack.clientDir && stack.databaseUrl) {
      const { PrismaClient } = require(stack.clientDir);
      stack.db = new PrismaClient({ datasourceUrl: stack.databaseUrl });
      stack.stop = () => stack.db.$disconnect();
    }
  } else {
    const { bootStack } = require("../boot.cjs");
    stack = await bootStack({ databaseUrl: process.env.STACK_DATABASE_URL, label });
    await seed(stack);
  }
  // The harness builds its schema with `prisma db push`, which skips the migration that installs trigram search
  // (20260916100000_product_search_extension). Production runs that migration; install it here the same way.
  if (stack.db) await stack.db.$executeRawUnsafe("CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA pg_catalog").catch((e) => console.log(`pg_trgm: ${e.message}`));
  const browser = await chromium.launch();
  const rows = [];
  const consoleErrors = [];

  const check = (cr, point, requirement, pass, observed = "") => {
    rows.push({ cr, point, requirement, pass: Boolean(pass), observed: String(observed) });
    console.log(`${pass ? "PASS" : "FAIL"} ${cr} ${point} ${requirement}${observed === "" ? "" : ` :: ${observed}`}`);
    return Boolean(pass);
  };

  const session = async (who, { width = 1440, height = 900 } = {}) => {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, timezoneId: "Asia/Kolkata", locale: "en-IN", acceptDownloads: true });
    const token = await tokenFor(stack, who);
    await context.addCookies([{ name: "auth_token", value: token, url: stack.base, httpOnly: true, sameSite: "Lax" }]);
    const page = await context.newPage();
    page.setDefaultTimeout(60000);
    page.on("pageerror", (e) => consoleErrors.push(`${who}: ${e.message}`));
    return { context, page, token };
  };

  const go = async (page, route) => {
    await page.goto(`${stack.base}${route}`, { waitUntil: "domcontentloaded", timeout: 240000 });
    await page.waitForLoadState("networkidle", { timeout: 45000 }).catch(() => {});
  };

  // target is a page or a locator; shots are JPEG to keep the evidence folder small
  const shot = async (target, name, options = {}) => {
    const file = path.join(shotDir, `${name}.jpg`);
    await target.screenshot({ path: file, type: "jpeg", quality: 72, ...options });
    return `shots/${name}.jpg`;
  };

  const finish = async (name) => {
    const summary = { scenario: name, ranAt: new Date().toISOString(), passed: rows.filter((r) => r.pass).length, failed: rows.filter((r) => !r.pass).length, pageErrors: consoleErrors, rows };
    fs.writeFileSync(path.join(resultDir, `${name}.json`), JSON.stringify(summary, null, 2));
    console.log(`\n${name}: ${summary.passed} requirement checks met, ${summary.failed} not met, ${consoleErrors.length} page errors`);
    await browser.close();
    await stack.stop();
  };

  return { stack, browser, check, session, go, shot, finish, api: (token, method, route, body) => api(stack, token, method, route, body), tokenFor: (who) => tokenFor(stack, who), addUser: (key, data) => addUser(stack, key, data) };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const purchaseLine = (productName, manufacturer, packSize, packUnitType, hsnCode, batchNumber, qty, mrp, rate, gst) => {
  const taxableAmount = Math.round(qty * rate * 100) / 100;
  const gstAmount = Math.round(taxableAmount * gst) / 100;
  return {
    productName, manufacturer, packSize, packUnitType, hsnCode, batchNumber, expiryMonth: 4, expiryYear: 2028, quantityPurchased: qty, freeQuantity: 0, mrp, discountPercent: 0,
    purchaseRate: rate, taxableAmount, cgstPercent: gst / 2, sgstPercent: gst / 2, igstPercent: 0, gstAmount, lineTotal: Math.round((taxableAmount + gstAmount) * 100) / 100,
  };
};

// Buys a product on a supplier bill and sells some of it on a pharmacy bill, all through the application's
// own API, so the stock movements, costs and bill numbers are the ones the product itself writes.
async function buyAndSell(a, { name, manufacturer, category, form, strength, packSize, packUnit, hsn, batch, qty, mrp, rate, gst, distributor, gstin, billNo, sell, patient }) {
  const admin = await a.tokenFor("admin");
  const pharmacist = await a.tokenFor("pharmacist");
  const today = new Date(Date.now() + 19800000).toISOString().slice(0, 10);
  const drug = await a.api(admin, "POST", "/drugs", { name, price: mrp, manufacturerName: manufacturer, packSizeLabel: `${packSize} ${packUnit}`, category, composition1: name.split(" ")[0], dosageForm: form, strength });
  const line = purchaseLine(name, manufacturer, packSize, packUnit, hsn, batch, qty, mrp, rate, gst);
  const draft = await a.api(pharmacist, "POST", "/pharmacy/purchase-invoices/drafts", {
    distributorName: distributor, distributorGstin: gstin, distributorDlNo: "TS-HYD-20B-1", invoiceNumber: billNo, invoiceDate: today, billType: "CREDIT", dueDate: "2026-12-31", doctorNameOrRegNo: "Dr Priya",
    items: [line], grossAmount: line.taxableAmount, taxableAmount: line.taxableAmount, totalCgst: line.gstAmount / 2, totalSgst: line.gstAmount / 2, totalIgst: 0, totalGst: line.gstAmount, netPayable: line.lineTotal,
  });
  const purchaseId = draft.id ?? draft.invoice?.id;
  await a.api(pharmacist, "PATCH", `/pharmacy/purchase-invoices/${purchaseId}/review`, { goodsReceivedDate: today });
  await a.api(pharmacist, "POST", `/pharmacy/purchase-invoices/${purchaseId}/commit-stock`);
  const item = await a.stack.db.inventoryItem.findFirst({ where: { name } });
  const bills = [];
  for (const quantity of sell || []) {
    const bill = await a.api(pharmacist, "POST", "/pharmacy/invoices", { patientId: patient.id, paymentMethod: "UPI", billingName: patient.name, billingPhone: patient.phone, items: [{ drugId: drug.id, inventoryItemId: item.id, quantity, unitPrice: mrp, taxPercent: gst, itemType: "DRUG" }] });
    await a.api(pharmacist, "PATCH", `/pharmacy/invoices/${bill.id}/status`, { status: "CONFIRMED" });
    bills.push(bill);
  }
  return { drug, item, purchaseId, bills };
}

module.exports = { start, sleep, purchaseLine, buyAndSell, outDir, shotDir };
