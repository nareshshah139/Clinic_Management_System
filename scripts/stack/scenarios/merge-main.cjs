const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { chromium } = require("playwright");
const { bootStack } = require("../boot.cjs");
const { seed, api, tokenFor, browserLogin } = require("./cr31-seed.cjs");

const root = path.resolve(__dirname, "../../..");
const out = process.env.MERGE_SHOTS || path.join(root, "output/stack/merge-main");
const GSTIN = "36ABCDE1234F1Z5";
const ROLES = ["pharmacist", "doctor", "admin"];
const PHARMACY_LINKS = ["Pharmacy Desk", "Pharmacy Counter", "Pharmacy Billing", "Sales", "Inventory"];
const DESKTOP = { width: 1280, height: 800 };
const WIDE = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const PAGES = [
  ["purchase-bills", "/dashboard/inventory?area=purchases&view=register", (p) => p.getByRole("button", { name: "Mark bill LIN-1 paid" })],
  ["purchase-returns", "/dashboard/inventory?area=purchases&view=register&tab=returns", (p) => p.getByText("RET-A").first()],
  ["terms-of-trade", "/dashboard/inventory?area=purchases&view=terms", (p) => p.getByRole("heading", { name: "Terms of Trade" })],
  ["day-wise-summary", "/dashboard/inventory?area=purchases&view=daywise", (p) => p.getByText("Day-wise Summary", { exact: true })],
  ["item-margin", "/dashboard/inventory?area=purchases&view=margin", (p) => p.getByText("Item-wise Margin", { exact: true })],
  ["payments-dues", `/dashboard/inventory?area=purchases&view=ledger&gstin=${GSTIN}`, (p) => p.getByRole("heading", { name: "Purchase Ledger" })],
  ["stock-ledger", "/dashboard/inventory?area=stock&view=ledger", (p) => p.getByRole("list", { name: "Stock movements" })],
  ["stock-counts", "/dashboard/inventory?area=stock&view=COUNT", (p) => p.getByRole("button", { name: "Count an item" })],
  ["approvals", "/dashboard/inventory?area=stock&view=approvals", (p) => p.getByRole("tablist", { name: "Approval types" })],
  ["sales-register", "/dashboard/pharmacy/sales", (p) => p.getByRole("button", { name: /New sale/ })],
];
const WIDE_PAGES = new Set(["purchase-bills", "purchase-returns", "item-margin", "stock-ledger", "sales-register"]);
const clean = (text) => String(text ?? "").replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const stack = await bootStack({ databaseUrl: process.env.STACK_DATABASE_URL, label: "merge-main" });
  let browser;
  let failed = 0;
  const check = (label, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failed++;
    console.log(`${ok ? "PASS" : "FAIL"} ${label}${ok ? "" : ` :: expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`}`);
  };
  try {
    console.log(`BOOT base=${stack.base}`);
    const { today, batches } = await seed(stack);
    const U = stack.users;
    const tokens = {};
    const call = async (who, method, url, body) => api(stack, (tokens[who] ??= await tokenFor(stack, who)), method, url, body);
    const branchId = stack.branch.id;

    const purchase = await stack.db.$transaction(async (db) => {
      await db.$executeRawUnsafe("SELECT set_config('app.purchase_recovery_protocol', '2', true)");
      const supplier = await db.supplier.create({ data: { branchId, name: "Linae Distributors", gstNumber: GSTIN } });
      const item = await db.inventoryItem.create({
        data: {
          branchId, name: "Synthetic Cream", type: "MEDICINE", costPrice: 10, sellingPrice: 20, unit: "TUBES", currentStock: 100, gstRate: 12,
          batchNumber: "SC-1", expiryDate: new Date("2027-01-31T00:00:00Z"), stockStatus: "IN_STOCK",
        },
      });
      const bill = await db.pharmacyPurchaseInvoice.create({
        data: {
          branchId, createdBy: U.owner.id, distributorName: "Linae Distributors", distributorGstin: GSTIN, distributorDlNo: "synthetic",
          invoiceNumber: "LIN-1", invoiceDate: new Date("2026-10-01T00:00:00+05:30"), dueDate: new Date("2026-12-31T00:00:00+05:30"),
          billType: "CREDIT", doctorNameOrRegNo: "Synthetic", status: "STOCK_COMMITTED", stockCommittedAt: new Date("2026-10-02T00:00:00Z"),
          grossAmount: 2000, taxableAmount: 2000, totalGst: 0, netPayable: 2000,
        },
      });
      const line = await db.pharmacyPurchaseInvoiceItem.create({
        data: {
          purchaseInvoiceId: bill.id, lineNumber: 1, productName: "Synthetic Cream", manufacturer: "Synthetic", packSize: "1", packUnitType: "TUBE",
          hsnCode: "3004", batchNumber: "SC-1", expiryMonth: 1, expiryYear: 2027, quantityPurchased: 200, mrp: 20, discountPercent: 0, purchaseRate: 10,
          taxableAmount: 1000, gstAmount: 120, lineTotal: 1120, inventoryItemId: item.id,
        },
      });
      return { supplier, item, bill, line };
    });

    const draft = await call("pharmacist", "POST", "/inventory/workspace/documents", {
      kind: "SUPPLIER_RETURN", reference: "RET-A", requestKey: crypto.randomUUID(), supplierId: purchase.supplier.id, purchaseInvoiceId: purchase.bill.id,
      payload: { date: today, returnType: "NEAR_EXPIRY", lines: [{ inventoryId: purchase.item.id, quantity: 2, unitPrice: 10, sourceLineId: purchase.line.id }] },
    });
    await call("pharmacist", "POST", `/inventory/workspace/documents/${draft.id}/transition`, { action: "CHALLAN", version: draft.version });
    check("CR-27 return challan as the seeded pharmacist takes 2 tubes out", (await stack.db.inventoryItem.findUnique({ where: { id: purchase.item.id } })).currentStock, 98);

    const counted = "Adapalene Gel 15g";
    const before = batches[counted].currentStock;
    const count = await call("pharmacist", "POST", "/inventory/workspace/counts", { itemIds: [batches[counted].id], requestKey: crypto.randomUUID() });
    const fresh = await stack.db.inventoryWorkflowDocument.findUnique({ where: { id: count.id } });
    await call("pharmacist", "POST", `/inventory/workspace/reconciliation/counts/${count.id}/sign-off`, {
      version: fresh.version, requestKey: crypto.randomUUID(), note: "One tube missing", lines: fresh.payload.lines.map((line) => ({ id: line.id, physicalStock: before - 1 })),
    });

    await call("doctor", "PUT", "/pharmacy/trade-terms", {
      supplierId: purchase.supplier.id,
      items: [{ productName: "Synthetic Cream", discountPercent: 12, schemeBuy: 10, schemeFree: 1, minExpiryMonths: 9 }],
    }).catch(async (error) => console.log(`NOTE trade term seed: ${error.message}`));

    const patient = await stack.db.patient.create({ data: { branchId, name: "Kiran Bhatt", gender: "F", phone: "9876543210" } });
    const sale = await stack.db.pharmacyInvoice.create({
      data: {
        invoiceNumber: "PH-DRAFT-1", patientId: patient.id, branchId, subtotal: 40, totalAmount: 40, paymentMethod: "CASH",
        billingName: "Kiran Bhatt", billingPhone: "9876543210", status: "DRAFT", createdById: U.pharmacist.id,
      },
    });
    const visit = await stack.db.visit.create({ data: { patientId: patient.id, doctorId: U.doctor.id, complaints: "Itchy rash on both forearms" } });

    browser = await chromium.launch();
    const sessions = new Map();
    const open = async (who, viewport) => {
      const context = await browser.newContext({ viewport, ...(sessions.has(who) && { storageState: sessions.get(who) }) });
      const page = await context.newPage();
      page.setDefaultTimeout(60000);
      const seen = { errors: [], refused: [] };
      page.on("pageerror", (e) => seen.errors.push(e.message.slice(0, 200)));
      page.on("console", (m) => m.type() === "error" && seen.errors.push(m.text().slice(0, 200)));
      page.on("response", (r) => r.url().includes("/api/") && [401, 403].includes(r.status()) && seen.refused.push(`${r.status()} ${new URL(r.url()).pathname}`));
      if (!sessions.has(who)) {
        await browserLogin(stack, page, who);
        sessions.set(who, await context.storageState());
      }
      return { page, context, seen };
    };
    const go = async (page, route) => {
      await page.goto(`${stack.base}${route}`, { waitUntil: "domcontentloaded", timeout: 240000 });
      await page.locator("main").first().waitFor({ state: "attached", timeout: 240000 });
    };
    const settle = (page) => page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    const overflow = (page) => page.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);
    const shot = (page, name) => page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });
    const sidebar = async (page) => {
      const nav = page.getByRole("navigation", { name: "Main navigation" });
      await nav.getByRole("link", { name: /^Inventory/ }).waitFor({ timeout: 120000 }).catch(() => {});
      return (await nav.getByRole("link").allInnerTexts()).map(clean);
    };

    for (const who of ROLES) {
      const { page, context, seen } = await open(who, DESKTOP);
      await go(page, "/dashboard/inventory?area=purchases&view=register");
      const links = await sidebar(page);
      check(`${who} sidebar lists every Pharmacy entry`, PHARMACY_LINKS.filter((name) => links.some((link) => link.startsWith(name))), PHARMACY_LINKS);
      const purchaseNav = page.getByRole("navigation", { name: "purchases tasks" });
      await purchaseNav.locator("option", { hasText: "Payments & dues" }).waitFor({ state: "attached", timeout: 120000 }).catch(() => {});
      const tasks = (await purchaseNav.locator("button, option").allInnerTexts()).map(clean);
      check(`${who} Purchases holds Purchase bills, Terms of Trade, Day-wise summary, Item-wise margin and Payments & dues`,
        ["Purchase bills", "Terms of Trade", "Day-wise summary", "Item-wise margin", "Payments & dues"].filter((t) => tasks.includes(t)),
        ["Purchase bills", "Terms of Trade", "Day-wise summary", "Item-wise margin", "Payments & dues"]);
      await go(page, "/dashboard/inventory?area=stock&view=list");
      const stockNav = page.getByRole("navigation", { name: "stock tasks" });
      await stockNav.getByRole("button", { name: "Stock counts" }).waitFor({ timeout: 120000 }).catch(() => {});
      const stockTasks = (await stockNav.getByRole("button").allInnerTexts()).map(clean).slice(0, 4).map((t) => t.replace(/ \(\d+\)$/, ""));
      check(`${who} Stock shows Stock list, Stock ledger, approvals and Stock counts as tasks`, stockTasks, ["Stock list", "Stock ledger", "Approve corrections", "Stock counts"]);
      await shot(page, `${who}-stock-tasks-1280`);
      await context.close();
    }

    {
      const { page, context, seen } = await open("pharmacist", DESKTOP);
      await go(page, "/dashboard/inventory?area=stock&view=list");
      await page.getByRole("button", { name: "Add batch" }).first().click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("Item Name *").fill("Ketoconazole Shampoo 2%");
      await dialog.getByLabel("Cost Price (₹) *").fill("120");
      await dialog.getByLabel("Selling Price (₹) *").fill("185");
      await shot(page, "pharmacist-new-item-form-1280");
      await dialog.getByRole("button", { name: "Add Item" }).click();
      await page.getByRole("heading", { name: "Sent to doctor for approval" }).waitFor({ timeout: 60000 });
      await shot(page, "pharmacist-new-item-sent-1280");
      const request = await stack.db.inventoryItemRequest.findFirst({ where: { branchId, itemName: "Ketoconazole Shampoo 2%" } });
      check("CR-30 the pharmacist's new item waits for a doctor", [request?.status, request?.requestedById, request?.inventoryItemId ?? null], ["PENDING", U.pharmacist.id, null]);
      check("pharmacist new-item request: no console error or refused call", [seen.errors, seen.refused], [[], []]);
      await context.close();
    }

    for (const who of ["doctor", "admin"]) {
      const { page, context } = await open(who, DESKTOP);
      await go(page, "/dashboard");
      const badge = page.getByRole("navigation", { name: "Main navigation" }).getByLabel(/new item requests waiting for approval/);
      check(`${who} sidebar badge counts the waiting item request`, clean(await badge.innerText({ timeout: 60000 }).catch(() => "")), "1");
      await shot(page, `${who}-sidebar-badge-1280`);
      await context.close();
    }

    {
      const { page, context, seen } = await open("doctor", DESKTOP);
      await go(page, "/dashboard/inventory?area=stock&view=approvals");
      await page.getByRole("tab", { name: /New items/ }).click();
      await page.getByText("Ketoconazole Shampoo 2%").first().waitFor();
      await shot(page, "doctor-item-requests-1280");
      await page.getByRole("button", { name: "Approve", exact: true }).first().click();
      const dialog = page.getByRole("dialog", { name: "Approve new item" });
      await dialog.waitFor();
      await dialog.getByRole("button", { name: "Approve", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      const request = await stack.db.inventoryItemRequest.findFirst({ where: { branchId, itemName: "Ketoconazole Shampoo 2%" } });
      check("CR-30 the doctor's approval creates the item", [request.status, request.reviewedById, !!request.inventoryItemId], ["APPROVED", U.doctor.id, true]);

      await go(page, `/dashboard/inventory?area=stock&view=COUNT&document=${count.id}`);
      await page.getByRole("button", { name: "Approve and adjust stock" }).click();
      const approve = page.getByRole("dialog", { name: "Approve and adjust stock" });
      await approve.waitFor();
      await page.waitForTimeout(350);
      await approve.getByRole("button", { name: "Approve and adjust stock" }).click();
      await approve.waitFor({ state: "hidden" });
      check("CR-31 doctor approval adjusts stock once", (await stack.db.inventoryItem.findUnique({ where: { id: batches[counted].id } })).currentStock, before - 1);
      check("doctor approvals: no console error or refused call", [seen.errors, seen.refused], [[], []]);
      await context.close();
    }

    {
      const { page, context, seen } = await open("pharmacist", DESKTOP);
      await go(page, "/dashboard/inventory?area=stock&view=approvals");
      await page.getByRole("tab", { name: /New items/ }).click();
      await page.getByText(/Approved by Priya Menon/).first().waitFor();
      check("the pharmacist sees the doctor's decision on the request", true, true);
      check("pharmacist sees no Approve button on item requests", await page.getByRole("button", { name: "Approve", exact: true }).count(), 0);
      await shot(page, "pharmacist-item-requests-approved-1280");
      check("pharmacist item requests: no console error or refused call", [seen.errors, seen.refused], [[], []]);
      await context.close();
    }

    {
      const { page, context, seen } = await open("admin", WIDE);
      await go(page, "/dashboard/inventory?area=stock&view=ledger");
      const movements = page.getByRole("list", { name: "Stock movements" });
      await movements.waitFor({ timeout: 120000 });
      await settle(page);
      const text = clean(await movements.innerText());
      check("#70 Stock ledger shows the CR-31 count approval", /Stock count/.test(text) && text.includes(counted), true);
      check("#70 Stock ledger shows the CR-27 supplier return", /Supplier return/.test(text) && text.includes("RET-A"), true);
      check("#70 Stock ledger names a count once", /Stock counts Stock count/.test(text), false);
      await shot(page, "admin-stock-ledger-1440");
      await movements.getByRole("button", { name: /^Stock count / }).first().click();
      await page.locator("#count-record-title").waitFor({ timeout: 60000 });
      check("the ledger's count link opens that count's record", new URL(page.url()).searchParams.get("view"), "COUNT");
      await shot(page, "admin-ledger-count-link-1440");
      await page.goBack();
      await movements.waitFor({ timeout: 60000 });
      await movements.getByRole("button", { name: /RET-A/ }).first().click();
      await page.waitForFunction(() => new URL(location.href).searchParams.get("view") === "SUPPLIER_RETURN", null, { timeout: 60000 });
      await page.getByText("RET-A").first().waitFor({ timeout: 60000 });
      check("the ledger's supplier return link opens the return", new URL(page.url()).searchParams.get("area"), "purchases");
      await shot(page, "admin-ledger-return-link-1440");
      check("admin stock ledger: no console error or refused call", [seen.errors, seen.refused], [[], []]);
      await context.close();
    }

    for (const [who, canEdit] of [["doctor", true], ["admin", true], ["pharmacist", false]]) {
      const { page, context, seen } = await open(who, DESKTOP);
      await go(page, "/dashboard/inventory?area=purchases&view=terms");
      await page.getByRole("heading", { name: "Terms of Trade" }).waitFor({ timeout: 120000 });
      await settle(page);
      const distributor = page.getByRole("button", { name: /Linae Distributors/ }).first();
      if (await distributor.isVisible().catch(() => false)) {
        await distributor.click();
        await page.getByRole("table", { name: "Agreed terms" }).waitFor();
      }
      await settle(page);
      check(`${who} Terms of Trade ${canEdit ? "offers Add terms" : "is read-only"}`,
        [await page.getByRole("button", { name: "Add terms" }).count() > 0, await page.getByText("Read-only. Doctors and admins can change terms.").count() > 0],
        [canEdit, !canEdit]);
      check(`${who} Terms of Trade lists the agreed term`, await page.getByRole("table", { name: "Agreed terms" }).getByText("Synthetic Cream").count() > 0, true);
      await shot(page, `${who}-terms-of-trade-1280`);
      check(`${who} Terms of Trade: no console error or refused call`, [seen.errors, seen.refused], [[], []]);
      await context.close();
    }

    {
      const { page, context, seen } = await open("pharmacist", WIDE);
      await go(page, "/dashboard/pharmacy/sales");
      const link = page.getByRole("link", { name: /Open .*PH-DRAFT-1|Open .*Kiran Bhatt/ }).first();
      await link.waitFor({ timeout: 120000 });
      await shot(page, "pharmacist-sales-register-draft-1440");
      await link.click();
      await page.waitForURL(/\/dashboard\/pharmacy\/invoices\?search=/, { timeout: 120000 });
      await page.getByText("PH-DRAFT-1").first().waitFor({ timeout: 120000 });
      await settle(page);
      const card = page.locator("text=PH-DRAFT-1").first().locator("xpath=ancestor::*[.//button][1]");
      const actions = (await card.getByRole("button").allInnerTexts()).map(clean).filter(Boolean);
      console.log(`NOTE draft actions offered: ${JSON.stringify(actions)}`);
      check("the Sales register draft link lands on the draft with no Edit button", [await page.getByText("PH-DRAFT-1").count() > 0, actions.includes("Edit")], [true, false]);
      await shot(page, "pharmacist-draft-in-invoice-list-1440");
      check("sales draft link: no console error or refused call", [seen.errors, seen.refused], [[], []]);
      await context.close();
    }

    {
      const { page, context, seen } = await open("doctor", DESKTOP);
      await page.goto(`${stack.base}/dashboard/visits?visitId=${visit.id}&patientId=${patient.id}`, { waitUntil: "domcontentloaded", timeout: 240000 });
      const identity = page.getByTestId("visit-identity").first();
      await identity.waitFor({ timeout: 240000 });
      check("CR-21 the visit identity bar names the patient", clean(await identity.innerText()).includes("Kiran Bhatt"), true);
      await page.getByRole("tab", { name: "Prescription" }).first().click().catch(() => {});
      const exam = page.getByRole("button", { name: /On Examination/ }).first();
      if (await exam.waitFor({ timeout: 60000 }).then(() => true, () => false)) {
        const was = await exam.getAttribute("aria-expanded");
        await exam.click();
        check("CR-22 On Examination collapses and expands", [was !== null, await exam.getAttribute("aria-expanded") !== was], [true, true]);
      } else check("CR-22 On Examination is on the Prescription tab", false, true);
      await shot(page, "doctor-visit-identity-1280");
      check("doctor visit page: no refused call", seen.refused, []);
      console.log(`NOTE doctor visit console errors: ${JSON.stringify(seen.errors)}`);
      await context.close();
    }

    {
      const { page, context, seen } = await open("admin", WIDE);
      await go(page, "/dashboard/reports");
      await settle(page);
      await shot(page, "admin-reports-1440");
      check("admin reports page: no console error or refused call", [seen.errors, seen.refused], [[], []]);
      await context.close();
    }

    for (const who of ROLES)
      for (const viewport of [DESKTOP, PHONE, WIDE]) {
        const width = viewport.width;
        const { page, context, seen } = await open(who, viewport);
        for (const [name, route, ready] of PAGES) {
          if (width === WIDE.width && !WIDE_PAGES.has(name)) continue;
          seen.errors.length = 0;
          seen.refused.length = 0;
          await go(page, route);
          const shown = await ready(page).first().waitFor({ timeout: 120000 }).then(() => true, () => false);
          await settle(page);
          await page.waitForTimeout(300);
          const label = `${who} ${name} at ${width}`;
          check(`${label}: renders`, shown, true);
          check(`${label}: no refused call`, seen.refused, []);
          check(`${label}: no console error`, seen.errors, []);
          if (width === PHONE.width) check(`${label}: no sideways page scroll`, await overflow(page) <= 0, true);
          await shot(page, `${who}-${name}-${width}`);
        }
        await context.close();
      }
  } finally {
    await browser?.close();
    await stack.stop();
  }
  console.log(failed ? `MERGE MAIN FAIL ${failed}` : "MERGE MAIN PASS");
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error("MERGE MAIN FAIL", e);
  process.exit(1);
});
