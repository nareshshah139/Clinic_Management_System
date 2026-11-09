const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { bootStack } = require("../boot.cjs");

const out = path.resolve(__dirname, "../../../output/stack/access-roles");
const GSTIN = "36ABCDE1234F1Z5";
const DENIED = /Forbidden|don.t have access|do not have access|access denied|not allowed|not authori[sz]ed|insufficient permission/i;
const PHARMACY_LINKS = ["Pharmacy Desk", "Pharmacy Counter", "Sales", "Inventory"];

const PAGES = [
  { name: "Pharmacy Desk", route: "/dashboard/pharmacy?section=desk", actions: [] },
  { name: "Pharmacy Counter", route: "/dashboard/pharmacy?section=counter", actions: [] },
  { name: "New sale bill", route: "/dashboard/pharmacy/sales/bill", actions: [["Save draft", (p) => p.getByRole("button", { name: "Save draft" })], ["Load prescriptions", (p) => p.getByRole("heading", { name: /Prescription/ })]] },
  { name: "Sales", route: "/dashboard/pharmacy/sales", actions: [["New sale", (p) => p.getByRole("button", { name: /New sale/ })]] },
  { name: "Purchase bills", route: "/dashboard/inventory?area=purchases&view=register", actions: [["Mark paid", (p) => p.getByRole("button", { name: "Mark bill LIN-1 paid" })]] },
  { name: "Payments & dues", route: `/dashboard/inventory?area=purchases&view=ledger&gstin=${GSTIN}`, actions: [["Purchase Ledger", (p) => p.getByRole("heading", { name: "Purchase Ledger" })]] },
  {
    name: "Returns",
    route: "/dashboard/inventory?area=purchases&view=register&tab=returns",
    actions: [
      ["Record credit note", (p) => p.getByRole("button", { name: "Record credit note for return RET-A" })],
      ["Set off", (p) => p.getByRole("button", { name: "Set off credit note CN-B against bills" })],
    ],
  },
  { name: "Stock counts", route: "/dashboard/inventory?area=stock&view=COUNT", actions: [["Count an item", (p) => p.getByRole("button", { name: "Count an item" })]] },
];

async function seedPurchases(stack) {
  return stack.db.$transaction(async (db) => {
    await db.$executeRawUnsafe("SELECT set_config('app.purchase_recovery_protocol', '2', true)");
    return seedRows(db, stack);
  });
}

async function seedRows(db, stack) {
  const branchId = stack.branch.id;
  const supplier = await db.supplier.create({ data: { branchId, name: "Linae Distributors", gstNumber: GSTIN } });
  const item = await db.inventoryItem.create({
    data: {
      branchId, name: "Synthetic Cream", type: "MEDICINE", costPrice: 10, sellingPrice: 20, unit: "TUBES", currentStock: 100, gstRate: 12,
      batchNumber: "B-1", expiryDate: new Date("2027-01-31T00:00:00Z"), stockStatus: "IN_STOCK",
    },
  });
  const bill = await db.pharmacyPurchaseInvoice.create({
    data: {
      branchId, createdBy: stack.users.owner.id, distributorName: "Linae Distributors", distributorGstin: GSTIN, distributorDlNo: "synthetic",
      invoiceNumber: "LIN-1", invoiceDate: new Date("2026-10-01T00:00:00+05:30"), dueDate: new Date("2026-12-31T00:00:00+05:30"),
      billType: "CREDIT", doctorNameOrRegNo: "Synthetic", status: "STOCK_COMMITTED", stockCommittedAt: new Date("2026-10-02T00:00:00Z"),
      grossAmount: 2000, taxableAmount: 2000, totalGst: 0, netPayable: 2000,
    },
  });
  const line = await db.pharmacyPurchaseInvoiceItem.create({
    data: {
      purchaseInvoiceId: bill.id, lineNumber: 1, productName: "Synthetic Cream", manufacturer: "Synthetic", packSize: "1", packUnitType: "TUBE",
      hsnCode: "3004", batchNumber: "B-1", expiryMonth: 1, expiryYear: 2027, quantityPurchased: 200, mrp: 20, discountPercent: 0, purchaseRate: 10,
      taxableAmount: 1000, gstAmount: 120, lineTotal: 1120, inventoryItemId: item.id,
    },
  });
  return { supplier, item, bill, line };
}

async function api(page, method, url, body) {
  const result = await page.evaluate(
    async ({ method, url, body }) => {
      const response = await fetch(`/api${url}`, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
      return { status: response.status, body: await response.json().catch(() => null) };
    },
    { method, url, body },
  );
  assert(result.status < 300, `${method} ${url} -> ${result.status} ${JSON.stringify(result.body)}`);
  return result.body;
}

async function raiseReturn(page, seed, reference) {
  const draft = await api(page, "POST", "/inventory/workspace/documents", {
    kind: "SUPPLIER_RETURN", reference, requestKey: crypto.randomUUID(), supplierId: seed.supplier.id, purchaseInvoiceId: seed.bill.id,
    payload: { date: "2026-11-02", returnType: "NEAR_EXPIRY", lines: [{ inventoryId: seed.item.id, quantity: 1, unitPrice: 10, sourceLineId: seed.line.id }] },
  });
  return api(page, "POST", `/inventory/workspace/documents/${draft.id}/transition`, { action: "CHALLAN", version: draft.version });
}

async function signedIn(stack, browser, who) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await stack.login(await context.newPage(), who);
  return context;
}

async function visit(stack, context, who, target) {
  const page = await context.newPage();
  const refused = [];
  page.on("response", (r) => r.url().includes("/api/") && [401, 403].includes(r.status()) && refused.push(`${r.status()} ${new URL(r.url()).pathname}`));
  try {
    await page.goto(`${stack.base}${target.route}`, { waitUntil: "domcontentloaded", timeout: 240000 });
    await page.getByText(stack.users[who].firstName, { exact: false }).first().waitFor({ timeout: 120000 });
    const actions = {};
    for (const [label, locate] of target.actions)
      actions[label] = await locate(page).first().waitFor({ timeout: 60000 }).then(() => true, () => false);
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    const body = (await page.locator("main").innerText().catch(() => page.locator("body").innerText())).replace(/\s+/g, " ");
    const nav = await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link").allInnerTexts();
    await page.screenshot({ path: path.join(out, `${who}-${target.name.replace(/\W+/g, "-").toLowerCase()}.png`), fullPage: true });
    return {
      url: page.url(),
      denied: (body.match(DENIED) || [null])[0],
      refused,
      actions,
      links: nav.map((t) => t.trim()).filter((t) => PHARMACY_LINKS.includes(t)),
    };
  } finally {
    await page.close();
  }
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const stack = await bootStack({ databaseUrl: process.env.STACK_DATABASE_URL, label: "access-roles" });
  fs.mkdirSync(out, { recursive: true });
  console.log(`BOOT base=${stack.base}`);
  let browser;
  let failed = 0;
  const check = (label, ok, detail) => {
    if (!ok) failed++;
    console.log(`${ok ? "PASS" : "FAIL"} ${label}${ok ? "" : ` :: ${JSON.stringify(detail)}`}`);
  };
  try {
    const owner = await stack.db.user.findUnique({ where: { id: stack.users.owner.id } });
    const admin = await stack.db.user.create({
      data: { branchId: stack.branch.id, email: "meera.kulkarni@stack.example.invalid", firstName: "Meera", lastName: "Kulkarni", role: "ADMIN", password: owner.password, permissions: JSON.stringify(["*"]) },
    });
    stack.users.admin = { id: admin.id, email: admin.email, password: stack.users.owner.password, role: "ADMIN", firstName: "Meera", lastName: "Kulkarni" };
    const pharmacist = JSON.parse((await stack.db.user.findUnique({ where: { id: stack.users.pharmacist.id } })).permissions);
    console.log(`PHARMACIST seeded with ${pharmacist.length} permissions: ${pharmacist.join(", ")}`);

    const seed = await seedPurchases(stack);
    browser = await chromium.launch();
    const setup = await (await browser.newContext()).newPage();
    await stack.login(setup, "owner");
    await raiseReturn(setup, seed, "RET-A");
    const credited = await raiseReturn(setup, seed, "RET-B");
    await api(setup, "POST", `/inventory/workspace/documents/${credited.id}/credit-note`, {
      requestKey: crypto.randomUUID(), version: credited.version, number: "CN-B", date: "2026-11-05", amount: 11.2,
    });
    await setup.context().close();

    for (const who of ["pharmacist", "doctor", "admin"]) {
      const context = await signedIn(stack, browser, who);
      for (const target of PAGES) {
        const seen = await visit(stack, context, who, target);
        const label = `${who} ${target.name}`;
        check(`${label}: no access-denied message`, seen.denied === null, seen.denied);
        check(`${label}: no refused API call`, seen.refused.length === 0, seen.refused);
        check(`${label}: stays on the page`, !seen.url.includes("/login"), seen.url);
        for (const [action, offered] of Object.entries(seen.actions)) check(`${label}: ${action} offered`, offered, seen.actions);
        if (target.name === "Pharmacy Desk") check(`${who}: sidebar lists every Pharmacy entry, with Sales in place of Pharmacy Billing`, JSON.stringify(seen.links) === JSON.stringify(PHARMACY_LINKS), seen.links);
      }
      await context.close();
    }
    const reception = await signedIn(stack, browser, "reception");
    for (const target of PAGES) {
      const seen = await visit(stack, reception, "reception", target);
      console.log(`NOTE reception ${target.name}: denied=${JSON.stringify(seen.denied)} refused=${JSON.stringify(seen.refused)} actions=${JSON.stringify(seen.actions)} links=${JSON.stringify(seen.links)}`);
    }
  } finally {
    await browser?.close();
    await stack.stop();
  }
  console.log(failed ? `ACCESS ROLES FAIL ${failed}` : "ACCESS ROLES PASS");
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error("ACCESS ROLES FAIL", e);
  process.exit(1);
});
