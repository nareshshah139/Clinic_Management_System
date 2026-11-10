const IST_MS = 19800000;
const DAY_MS = 86400000;
const istDay = (instant) => new Date(instant.getTime() + IST_MS).toISOString().slice(0, 10);

const DISTRIBUTORS = {
  SLV: { name: "Shree Laxmi Vitality Pharma", gstin: "27AABCS1234F1Z5" },
  APX: { name: "Apex Medico Distributors", gstin: "27AAACA5678B1ZQ" },
  NVJ: { name: "Navjeevan Drug House", gstin: "27AAECN9087D1ZM" },
  MDX: { name: "Medilink Distributors", gstin: "27AAFCM4455E1Z2" },
};

const complete = { storageLocation: "Rack A1", category: "Cream", hsnCode: "30049099", minStockLevel: 2, maxStockLevel: 30 };
const BATCHES = [
  { key: "adap", name: "Adapalene Gel 0.1% 15g", batch: "ADG2405", stock: 20, cost: 75, gst: 18, expiry: 82, fields: { storageLocation: null, category: "Gel", minStockLevel: null, maxStockLevel: 40 } },
  { key: "clob", name: "Clobetasol Cream 0.05% 15g", batch: "CLB2311", stock: 30, cost: 100, gst: 12, expiry: 141, drug: true },
  { key: "keto", name: "Ketoconazole Shampoo 2% 100ml", batch: "KTS2402", stock: 10, cost: 120, gst: 12, expiry: 200, fields: { storageLocation: "Rack B2", category: null, hsnCode: null } },
  { key: "calam", name: "Calamine Lotion 100ml", batch: "CAL2309", stock: 15, cost: 50, gst: 12, expiry: 45, fields: { storageLocation: "", category: "Lotion", hsnCode: "", maxStockLevel: null } },
  { key: "minox", name: "Minoxidil 5% Solution 60ml", batch: "MNX2406", stock: 10, cost: 200, gst: 12, expiry: 300, drug: true },
  { key: "sun", name: "Sunscreen SPF 50 Gel 50g", batch: "SUN2410", stock: 6, cost: 100, gst: 18, expiry: 500, drug: true },
  { key: "tretA", name: "Tretinoin Cream 0.025% 20g", batch: "TRA2401", stock: 8, cost: 90, gst: 12, expiry: 160, drug: "tret" },
  { key: "tretB", name: "Tretinoin Cream 0.025% 20g", batch: "TRB2312", stock: 0, cost: 90, gst: 12, expiry: 100, drug: "tret" },
  { key: "mupi", name: "Mupirocin Ointment 2% 5g", batch: "MUP2404", stock: 25, cost: 80, gst: 12, expiry: 230, drug: true },
  { key: "hq", name: "Hydroquinone 2% Cream 15g", batch: "HQC2403", stock: 12, cost: 150, gst: 12, expiry: 260, drug: true },
];
const BILLS = [
  { no: "SLV/2026/087", code: "SLV", age: 200, lines: [["clob", 40], ["tretA", 10]] },
  { no: "SLV/2026/112", code: "SLV", age: 150, lines: [["adap", 30]] },
  { no: "SLV/2026/140", code: "SLV", age: 100, lines: [["minox", 10]] },
  { no: "SLV/2025/301", code: "SLV", age: 400, lines: [["calam", 20]] },
  { no: "APX/2026/031", code: "APX", age: 120, lines: [["keto", 10]] },
  { no: "APX/2026/077", code: "APX", age: 5, lines: [["sun", 6]] },
  { no: "NVJ/2026/019", code: "NVJ", age: 95, lines: [["mupi", 25]] },
  { no: "MDX/2026/044", code: "MDX", age: 130, lines: [["hq", 12]] },
];
const SALES = [["minox", 75], ["tretB", 10], ["clob", 120]];

async function seed(stack) {
  const now = Date.now();
  const ago = (days) => new Date(now - days * DAY_MS);
  const ahead = (days) => new Date(`${istDay(new Date(now + days * DAY_MS))}T00:00:00Z`);
  const db = stack.db;
  const branchId = stack.branch.id;
  const userId = stack.users.pharmacist.id;
  const suppliers = {};
  for (const [code, d] of Object.entries(DISTRIBUTORS)) suppliers[code] = await db.supplier.create({ data: { branchId, name: d.name, gstNumber: d.gstin } });
  const drugs = {};
  const batches = {};
  for (const b of BATCHES) {
    const drugKey = b.drug === true ? b.key : b.drug;
    if (drugKey && !drugs[drugKey])
      drugs[drugKey] = await db.drug.create({ data: { name: b.name, price: b.cost * 1.6, manufacturerName: "Synthetic Labs", packSizeLabel: "1 tube", branchId } });
    const bill = BILLS.find((x) => x.lines.some(([key]) => key === b.key));
    batches[b.key] = await db.inventoryItem.create({
      data: {
        branchId, name: b.name, type: "MEDICINE", costPrice: b.cost, sellingPrice: b.cost * 1.6, mrp: b.cost * 1.6, unit: "TUBES", packSize: 1, packUnit: "tube",
        currentStock: b.stock, gstRate: b.gst, batchNumber: b.batch, expiryDate: ahead(b.expiry), stockStatus: b.stock ? "IN_STOCK" : "OUT_OF_STOCK",
        ...complete, ...(b.fields || {}), createdAt: ago(bill ? bill.age : 300),
        ...(drugKey ? { drugs: { connect: { id: drugs[drugKey].id } } } : {}),
      },
    });
  }
  const bills = {};
  for (const bill of BILLS) {
    const d = DISTRIBUTORS[bill.code];
    const invoice = await db.pharmacyPurchaseInvoice.create({
      data: {
        branchId, createdBy: userId, supplierId: suppliers[bill.code].id, distributorName: d.name, distributorGstin: d.gstin, distributorDlNo: `MH-PUN-${bill.code}`,
        invoiceNumber: bill.no, invoiceDate: ago(bill.age), billType: "CREDIT", doctorNameOrRegNo: "Dr. Praneeta Jain", source: "MANUAL", status: "STOCK_COMMITTED",
        grossAmount: 1, taxableAmount: 1, totalGst: 0, netPayable: 1, stockCommittedAt: ago(bill.age), createdAt: ago(bill.age),
      },
    });
    const items = {};
    for (const [index, [key, quantity]] of bill.lines.entries()) {
      const b = BATCHES.find((x) => x.key === key);
      const half = b.gst / 2;
      items[key] = await db.pharmacyPurchaseInvoiceItem.create({
        data: {
          purchaseInvoiceId: invoice.id, lineNumber: index + 1, productName: b.name, manufacturer: "Synthetic Labs", packSize: "1", packUnitType: "TUBE", hsnCode: "30049099",
          batchNumber: b.batch, expiryMonth: 12, expiryYear: 2027, quantityPurchased: quantity, mrp: b.cost * 1.6, discountPercent: 0, purchaseRate: b.cost,
          taxableAmount: quantity * b.cost, cgstPercent: half, sgstPercent: half, igstPercent: 0, gstAmount: (quantity * b.cost * b.gst) / 100,
          lineTotal: quantity * b.cost * (1 + b.gst / 100), inventoryItemId: batches[key].id,
        },
      });
    }
    bills[bill.no] = { id: invoice.id, items };
  }
  await db.stockTransaction.create({
    data: { branchId, itemId: batches.sun.id, userId, type: "PURCHASE", quantity: 6, quantityDelta: 6, unitPrice: 100, totalAmount: 600, reference: "APX/2026/077", createdAt: ago(5) },
  });
  for (const [key, age] of SALES)
    await db.stockTransaction.create({
      data: { branchId, itemId: batches[key].id, userId, type: "SALE", quantity: 1, quantityDelta: -1, unitPrice: 160, totalAmount: 160, reference: `SEED-SALE-${key}`, createdAt: ago(age) },
    });
  return { today: istDay(new Date(now)), suppliers, batches, bills, drugs };
}

module.exports = { seed, DISTRIBUTORS, BATCHES };
