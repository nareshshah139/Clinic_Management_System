const assert = require("node:assert/strict");
const { seed: seedBase } = require("./cr29-seed.cjs");
const { api, tokenFor } = require("./cr11-seed.cjs");

const IST_MS = 19800000;
const DAY_MS = 86400000;
const istDay = (instant) => new Date(instant.getTime() + IST_MS).toISOString().slice(0, 10);

// Repeat-purchase products a maintained clinic catalogue would hold: real pack sizes and every clinical field filled.
const CATALOGUE = {
  "Clobetasol Cream 0.05% 15g": { packSizeLabel: "15 g", composition1: "Clobetasol Propionate 0.05% w/w", category: "Topical corticosteroid", dosageForm: "Cream", strength: "0.05%" },
  "Mupirocin Ointment 2% 5g": { packSizeLabel: "5 g", composition1: "Mupirocin 2% w/w", category: "Topical antibiotic", dosageForm: "Ointment", strength: "2%" },
  "Hydroquinone 2% Cream 15g": { packSizeLabel: "15 g", composition1: "Hydroquinone 2% w/w", category: "Skin lightening", dosageForm: "Cream", strength: "2%" },
};

// One typed purchase bill for testers. Amounts follow the bill workbench: line taxable = quantity x rate,
// GST per line on that, net payable = taxable + GST (no discounts, TCS or rounding).
const SAMPLE_LINES = [
  { productName: "Clobetasol Cream 0.05% 15g", packSize: "15 g", stockUnit: "Tube", hsnCode: "30049099", batchNumber: "CLB2611", expiryMonth: 11, expiryYear: 2028, quantity: 20, purchaseRate: 100, mrp: 160, gstPercent: 12 },
  { productName: "Doxycycline 100mg Capsule", packSize: "Strip of 10", stockUnit: "Strip", hsnCode: "30049099", batchNumber: "DOX2611", expiryMonth: 10, expiryYear: 2028, quantity: 10, purchaseRate: 60, mrp: 95, gstPercent: 12 },
  { productName: "Niacinamide Serum 10% 30ml", packSize: "30 ml", stockUnit: "Bottle", hsnCode: "33049990", batchNumber: "NIA2611", expiryMonth: 9, expiryYear: 2028, quantity: 5, purchaseRate: 250, mrp: 399, gstPercent: 18 },
];
const money = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const totals = SAMPLE_LINES.reduce(
  (sum, l) => {
    const taxable = money(l.quantity * l.purchaseRate);
    return { taxable: money(sum.taxable + taxable), gst: money(sum.gst + money((taxable * l.gstPercent) / 100)) };
  },
  { taxable: 0, gst: 0 },
);
const SAMPLE_BILL = {
  supplier: "Shree Laxmi Vitality Pharma",
  invoiceNumber: "SLV/2026/201",
  invoiceDate: istDay(new Date()),
  lines: SAMPLE_LINES,
  taxable: totals.taxable,
  totalGst: totals.gst,
  total: money(totals.taxable + totals.gst), // printed total in rupees: 4387
};

async function seed(stack) {
  const base = await seedBase(stack);
  const now = Date.now();
  const ahead = (days) => new Date(`${istDay(new Date(now + days * DAY_MS))}T00:00:00Z`);
  const branchId = stack.branch.id;
  const db = stack.db;

  await db.$transaction(
    async (tx) => {
      for (const [name, data] of Object.entries(CATALOGUE)) {
        const done = await tx.drug.updateMany({ where: { branchId, name }, data: { ...data, type: "allopathy" } });
        assert.equal(done.count, 1, `catalogue drug ${name}`);
      }
      const doxyDrug = await tx.drug.create({
        data: {
          branchId, name: "Doxycycline 100mg Capsule", price: 95, manufacturerName: "Synthetic Labs", type: "allopathy", packSizeLabel: "Strip of 10",
          composition1: "Doxycycline 100mg", category: "Antibiotic", dosageForm: "Capsule", strength: "100mg",
        },
      });
      base.batches.doxy = await tx.inventoryItem.create({
        data: {
          branchId, name: "Doxycycline 100mg Capsule", type: "MEDICINE", costPrice: 60, sellingPrice: 95, mrp: 95, unit: "STRIPS", packSize: 10, packUnit: "Strip",
          currentStock: 40, gstRate: 12, batchNumber: "DOX2509", expiryDate: ahead(420), stockStatus: "IN_STOCK", storageLocation: "Rack C1", category: "Capsule",
          hsnCode: "30049099", minStockLevel: 10, maxStockLevel: 80, createdAt: new Date(now - 60 * DAY_MS), drugs: { connect: { id: doxyDrug.id } },
        },
      });
      await tx.supplier.updateMany({ where: { branchId, name: "Apex Medico Distributors" }, data: { drugLicenseNo: "MH-PUN-20B-445566" } });
      base.suppliers.SAI = await tx.supplier.create({ data: { branchId, name: "Sai Pharma Agencies", gstNumber: "27AAKCS7788H1Z3" } });
    },
    { timeout: 60000, maxWait: 30000 },
  );

  // Pending approvals go through the real API so the request state machines are valid.
  const token = await tokenFor(stack, "pharmacist");
  const clob = await db.inventoryItem.findUnique({ where: { id: base.batches.clob.id } });
  const edit = await api(stack, token, "POST", "/drugs/inventory-change-requests", {
    changes: [{ inventoryItemId: clob.id, scope: "BATCH", expectedUpdatedAt: clob.updatedAt.toISOString(), proposedPrice: 175, reason: "New MRP list from the distributor" }],
  });
  assert.equal(edit.summary.submitted, 1);
  const created = await api(stack, token, "POST", "/inventory/items", {
    name: "Niacinamide Serum 10% 30ml", type: "MEDICINE", form: "SERUM", strength: "10%", brandName: "Niacinamide Serum", costPrice: 250, sellingPrice: 399, mrp: 399,
    unit: "BOTTLES", packSize: 1, packUnit: "Bottle", gstRate: 18, hsnCode: "33049990", status: "ACTIVE", requiresPrescription: false, isControlled: false,
  });
  assert.equal(created.status, "PENDING_APPROVAL");
  return { ...base, approvals: { edit, newItem: created.request }, sampleBill: SAMPLE_BILL };
}

module.exports = { seed, SAMPLE_BILL };
