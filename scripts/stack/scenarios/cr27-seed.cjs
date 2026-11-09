const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const IST_MS = 19800000;
const DAY_MS = 86400000;
const istDay = (instant) => new Date(instant.getTime() + IST_MS).toISOString().slice(0, 10);
const istInstant = (day, time = "12:00") => new Date(`${day}T${time}:00+05:30`);
const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

const DISTRIBUTORS = {
  SLV: { name: "Shree Laxmi Vitality Pharma", gstin: "27AABCS1234F1Z5" },
  APX: { name: "Apex Medico Distributors", gstin: "27AAACA5678B1ZQ" },
  SKP: { name: "Sai Krupa Pharma Agencies", gstin: "27AAGFS2345C1Z3" },
  NVJ: { name: "Navjeevan Drug House", gstin: "27AAECN9087D1ZM" },
};

async function api(stack, token, method, path, body) {
  const response = await fetch(`${stack.api}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw Object.assign(Error(`${method} ${path} -> ${response.status} ${text.slice(0, 300)}`), { status: response.status, data });
  return data;
}

async function tokenFor(stack, who) {
  const user = stack.users[who];
  const response = await fetch(`${stack.api}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: user.email, password: user.password }),
  });
  assert.equal(response.status, 201, `login ${who}`);
  return (await response.json()).access_token;
}

async function seedRecords(db, stack, today) {
  const branchId = stack.branch.id;
  const pharmacist = stack.users.pharmacist.id;
  const suppliers = {};
  for (const [code, d] of Object.entries(DISTRIBUTORS))
    suppliers[code] = await db.supplier.create({ data: { branchId, name: d.name, gstNumber: d.gstin } });

  const batches = {};
  const batch = async (code, key, name, stock) => {
    batches[key] = await db.inventoryItem.create({
      data: {
        branchId, name, type: "MEDICINE", costPrice: 100, sellingPrice: 160, unit: "TUBES", currentStock: stock, gstRate: 12,
        batchNumber: `${code}-${key}`, expiryDate: new Date(`${addDays(today, 120)}T00:00:00Z`), stockStatus: "IN_STOCK", supplier: DISTRIBUTORS[code].name,
      },
    });
  };
  await batch("SLV", "slv-a", "Clobetasol Cream 15g", 200);
  await batch("SLV", "slv-b", "Adapalene Gel 15g", 200);
  await batch("APX", "apx-a", "Ketoconazole Shampoo 100ml", 100);
  await batch("NVJ", "nvj-a", "Calamine Lotion 100ml", 100);

  const bills = {};
  const bill = async (code, billNo, net, invoiceDay, dueDay, lines = []) => {
    const d = DISTRIBUTORS[code];
    const invoice = await db.pharmacyPurchaseInvoice.create({
      data: {
        branchId, createdBy: pharmacist, distributorName: d.name, distributorGstin: d.gstin, distributorDlNo: `MH-PUN-${code}`, invoiceNumber: billNo,
        invoiceDate: istInstant(invoiceDay, "11:00"), billType: "CREDIT", dueDate: dueDay ? istInstant(dueDay) : null, doctorNameOrRegNo: "Dr. Praneeta Jain",
        source: "MANUAL", status: "STOCK_COMMITTED", grossAmount: net, taxableAmount: net, totalGst: 0, netPayable: net, creditApplied: 0,
        stockCommittedAt: istInstant(invoiceDay, "11:05"), createdAt: istInstant(invoiceDay, "11:01"),
      },
    });
    const items = [];
    for (const [index, line] of lines.entries())
      items.push(
        await db.pharmacyPurchaseInvoiceItem.create({
          data: {
            purchaseInvoiceId: invoice.id, lineNumber: index + 1, productName: batches[line.batch].name, manufacturer: "Synthetic", packSize: "1",
            packUnitType: "TUBE", hsnCode: "3004", batchNumber: batches[line.batch].batchNumber, expiryMonth: 3, expiryYear: 2027, quantityPurchased: line.quantity,
            mrp: 160, discountPercent: 0, purchaseRate: 100, taxableAmount: line.quantity * 100, gstAmount: line.quantity * 12, lineTotal: line.quantity * 112,
            inventoryItemId: batches[line.batch].id,
          },
        }),
      );
    bills[billNo] = { id: invoice.id, billNo, code, net, items };
  };
  await bill("SLV", "SLV/2026/41", 12000, addDays(today, -60), addDays(today, -30), [{ batch: "slv-a", quantity: 60 }, { batch: "slv-b", quantity: 60 }]);
  await bill("SLV", "SLV/2026/52", 4500, addDays(today, -20), addDays(today, 10));
  await bill("SLV", "SLV/2026/57", 2000, addDays(today, -10), addDays(today, 20));
  await bill("SLV", "SLV/2025/88", 3000, "2026-02-10", "2026-03-12", [{ batch: "slv-a", quantity: 20 }]);
  await bill("APX", "APX/2026/12", 3000, addDays(today, -15), addDays(today, 15), [{ batch: "apx-a", quantity: 30 }]);
  for (let i = 1; i <= 12; i++) await bill("NVJ", `NVJ/2026/${String(i).padStart(2, "0")}`, 400 + i * 25, addDays(today, -40 + i), addDays(today, -10 + i), i === 1 ? [{ batch: "nvj-a", quantity: 40 }] : []);
  await db.pharmacyPurchasePayment.create({
    data: {
      branchId, distributorGstin: DISTRIBUTORS.SLV.gstin, distributorName: DISTRIBUTORS.SLV.name, paymentDate: istInstant("2026-03-12", "11:00"), mode: "NEFT",
      paidBy: pharmacist, amount: 3000, referenceNo: "SEED-PREV-FY", requestKey: "seed-prev-fy",
      allocations: { create: [{ purchaseInvoiceId: bills["SLV/2025/88"].id, amount: 3000 }] },
    },
  });
  return { suppliers, batches, bills };
}

async function seed(stack) {
  const today = istDay(new Date());
  const records = await stack.db.$transaction(
    async (db) => {
      await db.$executeRawUnsafe("SELECT set_config('app.purchase_recovery_protocol', '2', true)");
      return seedRecords(db, stack, today);
    },
    { timeout: 120000, maxWait: 30000 },
  );
  const token = await tokenFor(stack, "pharmacist");
  const call = (method, path, body) => api(stack, token, method, path, body);
  const returns = {};

  const raise = async (key, { code, billNo, batch, quantity, reason, note, day, status = "CHALLAN" }) => {
    const source = records.bills[billNo];
    const line = source.items.find((item) => item.inventoryItemId === records.batches[batch].id);
    const draft = await call("POST", "/inventory/workspace/documents", {
      kind: "SUPPLIER_RETURN", reference: key, requestKey: crypto.randomUUID(), supplierId: records.suppliers[code].id, purchaseInvoiceId: source.id,
      payload: { date: day, returnReason: reason, reason: note, lines: [{ inventoryId: records.batches[batch].id, quantity, unitPrice: 100, sourceLineId: line.id }] },
    });
    let doc = draft;
    if (status !== "DRAFT") doc = await call("POST", `/inventory/workspace/documents/${draft.id}/transition`, { action: "CHALLAN", version: draft.version });
    if (status === "CANCELLED") doc = await call("POST", `/inventory/workspace/documents/${draft.id}/transition`, { action: "CANCEL", version: doc.version });
    returns[key] = { id: doc.id, key, code, billNo, value: Number(doc.totalAmount), day, reason, status: doc.status, version: doc.version };
    return returns[key];
  };
  const record = async (key, number, date, amount) => {
    const r = returns[key];
    const result = await call("POST", `/inventory/workspace/documents/${r.id}/credit-note`, { requestKey: crypto.randomUUID(), version: r.version, number, date, amount });
    Object.assign(r, { status: "POSTED", version: result.document.version, creditId: result.credit.id, cn: { number, date, amount } });
    return result;
  };
  const setOff = (key, billNo, amount) =>
    call("POST", "/inventory/workspace/credits/set-off", {
      requestKey: crypto.randomUUID(), creditId: returns[key].creditId, allocations: [{ purchaseInvoiceId: records.bills[billNo].id, amount }],
    });

  await raise("RET-SLV-01", { code: "SLV", billNo: "SLV/2026/41", batch: "slv-a", quantity: 5, reason: "NEAR_EXPIRY", note: "Short-dated batch", day: addDays(today, -23) });
  await raise("RET-SLV-02", { code: "SLV", billNo: "SLV/2026/41", batch: "slv-b", quantity: 4, reason: "BREAKAGE", note: "Two tubes crushed", day: addDays(today, -12) });
  await raise("RET-SLV-03", { code: "SLV", billNo: "SLV/2026/41", batch: "slv-a", quantity: 3, reason: "WRONG_ITEM", note: "", day: addDays(today, -9) });
  await record("RET-SLV-03", "SLV-CN-301", addDays(today, -5), 336);
  await raise("RET-SLV-04", { code: "SLV", billNo: "SLV/2026/41", batch: "slv-b", quantity: 2, reason: "EXPIRY", note: "", day: addDays(today, -8) });
  await record("RET-SLV-04", "SLV-CN-302", addDays(today, -4), 224);
  await setOff("RET-SLV-04", "SLV/2026/41", 100);
  await raise("RET-SLV-05", { code: "SLV", billNo: "SLV/2026/41", batch: "slv-a", quantity: 1, reason: "EXCESS_SUPPLY", note: "", day: addDays(today, -7) });
  await record("RET-SLV-05", "SLV-CN-303", addDays(today, -3), 112);
  await setOff("RET-SLV-05", "SLV/2026/41", 112);
  await raise("RET-SLV-06", { code: "SLV", billNo: "SLV/2026/41", batch: "slv-b", quantity: 1, reason: "OTHER", note: "Not needed", day: addDays(today, -6), status: "DRAFT" });
  await raise("RET-SLV-07", { code: "SLV", billNo: "SLV/2026/41", batch: "slv-a", quantity: 1, reason: "OTHER", note: "Sent by mistake", day: addDays(today, -6), status: "CANCELLED" });
  await raise("RET-SLV-OLD", { code: "SLV", billNo: "SLV/2025/88", batch: "slv-a", quantity: 2, reason: "EXPIRY", note: "", day: "2026-03-20" });
  await record("RET-SLV-OLD", "SLV-CN-188", "2026-03-25", 224);
  await raise("RET-APX-01", { code: "APX", billNo: "APX/2026/12", batch: "apx-a", quantity: 30, reason: "WRONG_ITEM", note: "", day: addDays(today, -5) });
  await record("RET-APX-01", "APX-CN-12", addDays(today, -2), 3360);
  await raise("RET-NVJ-01", { code: "NVJ", billNo: "NVJ/2026/01", batch: "nvj-a", quantity: 20, reason: "EXCESS_SUPPLY", note: "", day: addDays(today, -4) });
  await record("RET-NVJ-01", "NVJ-CN-1", addDays(today, -1), 2240);

  await stack.db.inventorySupplierCredit.create({
    data: {
      branchId: stack.branch.id, supplierGstin: DISTRIBUTORS.SKP.gstin, documentId: "seed-skp-credit", reference: "SKP rate difference", amount: 1250,
      creditNoteNumber: "SKP-CN-9", creditNoteDate: new Date(`${addDays(today, -14)}T00:00:00Z`), receivedAt: istInstant(addDays(today, -14)),
    },
  });
  return { today, distributors: DISTRIBUTORS, ...records, returns, call };
}

module.exports = { seed, tokenFor, api, istDay, addDays, DISTRIBUTORS };
