// CR-33 Pharmacy Report: a synthetic month of pharmacy activity, with the expected figures worked out
// here independently of the report code, so the browser scenario can check the screen and the files.
const IST = "+05:30";
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const pad = (n, w = 2) => String(n).padStart(w, "0");
const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const at = (day, time) => new Date(`${day}T${time}:00${IST}`);

function lastMonth(today) {
  const [y, m] = today.split("-").map(Number);
  const year = m === 1 ? y - 1 : y;
  const month = m === 1 ? 12 : m - 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(last)}`, days: last };
}

const ITEMS = [
  { id: "cr33-adapalene", name: "Adapalene Gel 15 Gm", hsn: "30049099", rate: 12, price: 180 },
  { id: "cr33-sunscreen", name: "Sunscreen SPF 50 Lotion 50 Ml", hsn: "33049910", rate: 18, price: 450 },
  { id: "cr33-isotroin", name: "Isotroin 10 Capsule", hsn: "30049099", rate: 5, price: 36 },
  { id: "cr33-calamine", name: "Calamine Lotion 100 Ml", hsn: "30049011", rate: 12, price: 95 },
  { id: "cr33-serum", name: "Niacinamide Serum 30 Ml", hsn: null, rate: 18, price: 650 },
];

async function seed(client, stack) {
  return client.$transaction(
    async (db) => {
      // Purchase bills may only be written by the current recovery protocol, as the app does.
      await db.$executeRawUnsafe("SELECT set_config('app.purchase_recovery_protocol', '2', true)");
      return seedRows(db, stack);
    },
    { timeout: 120000, maxWait: 30000 },
  );
}

async function seedRows(db, { branchId, doctorId, pharmacistId, today }) {
  const month = lastMonth(today);
  await db.branch.update({ where: { id: branchId }, data: { gstNumber: "36AAACL1234F1Z5", state: "Telangana", name: "Linaé Skin, Hair & Aesthetic Clinic" } });
  const patients = [];
  for (const [i, [name, phone]] of [["Meera Shah", "9876543210"], ["Ravi Kumar", "9000000001"], ["Anjali Kulkarni", "9765400123"], ["Arjun Reddy", "9440011223"]].entries())
    patients.push(await db.patient.create({ data: { id: `cr33-patient-${i}`, name, phone, gender: "F", branchId } }));
  for (const item of ITEMS) {
    await db.drug.create({ data: { id: `${item.id}-drug`, name: item.name, price: item.price, manufacturerName: "Synthetic Pharma", packSizeLabel: "1", branchId } });
    await db.inventoryItem.create({
      data: {
        id: item.id, branchId, name: item.name, type: "MEDICINE", costPrice: r2(item.price * 0.6), sellingPrice: item.price, mrp: item.price, unit: "PIECES",
        currentStock: 50, stockStatus: "IN_STOCK", hsnCode: item.hsn, gstRate: item.rate, expiryDate: new Date("2099-01-01"), drugs: { connect: { id: `${item.id}-drug` } },
      },
    });
  }

  const expected = { month, monthSales: { gross: 0, discount: 0, taxable: 0, tax: 0, total: 0, bills: 0 }, monthByRate: {}, monthPurchase: { taxable: 0, cgst: 0, sgst: 0, igst: 0, amount: 0 }, today: { CASH: 0, UPI: 0, CARD: 0, billed: 0, due: 0 } };
  const addRate = (rate, taxable, tax) => {
    const row = (expected.monthByRate[rate] ||= { taxable: 0, tax: 0 });
    row.taxable = r2(row.taxable + taxable);
    row.tax = r2(row.tax + tax);
  };

  const bill = async (n, day, time, lines, payments, status = "CONFIRMED", patient = patients[n % patients.length]) => {
    const items = lines.map(([item, qty, disc]) => {
      const gross = r2(qty * item.price);
      const discountAmount = r2((gross * disc) / 100);
      const taxAmount = r2(((gross - discountAmount) * item.rate) / 100);
      return { item, gross, discountAmount, taxAmount, total: r2(gross - discountAmount + taxAmount), qty, disc };
    });
    const total = r2(items.reduce((s, i) => s + i.total, 0));
    await db.pharmacyInvoice.create({
      data: {
        id: `cr33-bill-${n}`, invoiceNumber: `PHI-2026-${pad(n, 3)}`, patientId: patient.id, doctorId, branchId, createdById: pharmacistId,
        subtotal: r2(items.reduce((s, i) => s + i.gross, 0)), discountAmount: r2(items.reduce((s, i) => s + i.discountAmount, 0)), taxAmount: r2(items.reduce((s, i) => s + i.taxAmount, 0)), totalAmount: total,
        paymentMethod: "CASH", billingName: patient.name, billingPhone: patient.phone, status, invoiceDate: at(day, time), createdAt: at(day, time),
        items: { create: items.map((i) => ({ drugId: `${i.item.id}-drug`, inventoryItemId: i.item.id, quantity: i.qty, unitPrice: i.item.price, discountPercent: i.disc, discountAmount: i.discountAmount, taxPercent: i.item.rate, taxAmount: i.taxAmount, totalAmount: i.total })) },
        payments: { create: payments.map(([method, share, payDay = day]) => ({ method, amount: r2(total * share), status: "COMPLETED", paymentDate: at(payDay, time) })) },
      },
    });
    return { items, total };
  };

  // Last month: one bill on most days, a cancelled bill, a split payment now and then.
  let n = 500;
  for (let d = 1; d <= month.days; d++) {
    if (d % 6 === 0) continue; // closed days
    n += 1;
    const day = `${month.from.slice(0, 8)}${pad(d)}`;
    const a = ITEMS[d % ITEMS.length];
    const b = ITEMS[(d * 3) % ITEMS.length];
    const status = n === 510 ? "CANCELLED" : "CONFIRMED";
    const { items } = await bill(n, day, `1${d % 9}:15`, [[a, 1 + (d % 3), d % 4 === 0 ? 10 : 0], [b, 1, 0]], d % 5 === 0 ? [["CASH", 0.5], ["UPI", 0.5]] : [[d % 2 ? "UPI" : "CASH", 1]], status);
    if (status !== "CONFIRMED") continue;
    expected.monthSales.bills += 1;
    for (const i of items) {
      expected.monthSales.gross = r2(expected.monthSales.gross + i.gross);
      expected.monthSales.discount = r2(expected.monthSales.discount + i.discountAmount);
      expected.monthSales.taxable = r2(expected.monthSales.taxable + i.gross - i.discountAmount);
      expected.monthSales.tax = r2(expected.monthSales.tax + i.taxAmount);
      expected.monthSales.total = r2(expected.monthSales.total + i.total);
      addRate(i.item.rate, r2(i.gross - i.discountAmount), i.taxAmount);
    }
  }
  expected.lastMonthBillNumber = n;

  // Last month's supplier bills: intra-state, one inter-state (IGST), one unregistered supplier.
  const purchases = [
    ["SUP-101", "Sri Sai Pharma", "36AAAAA0000A1Z5", ITEMS[0], 40, 6, 6, 0],
    ["SUP-102", "Sri Sai Pharma", "36AAAAA0000A1Z5", ITEMS[2], 300, 2.5, 2.5, 0],
    ["MH-88", "Mumbai Derma Supplies", "27BBBBB1111B1Z5", ITEMS[1], 30, 0, 0, 18],
    ["CASH-7", "Local Medical Store", "URP", ITEMS[3], 20, 6, 6, 0],
  ];
  for (const [i, [number, name, gstin, item, qty, c, s, ig]] of purchases.entries()) {
    const rate = r2(item.price * 0.6);
    const taxable = r2(rate * qty);
    const cgst = r2((taxable * c) / 100), sgst = r2((taxable * s) / 100), igst = r2((taxable * ig) / 100);
    const total = r2(taxable + cgst + sgst + igst);
    const day = `${month.from.slice(0, 8)}${pad(3 + i * 5)}`;
    await db.pharmacyPurchaseInvoice.create({
      data: {
        id: `cr33-purchase-${i}`, branchId, distributorName: name, distributorGstin: gstin, distributorDlNo: "DL-1", invoiceNumber: number, invoiceDate: at(day, "10:00"), createdAt: at(day, "11:00"),
        billType: "CREDIT", doctorNameOrRegNo: "x", status: "STOCK_COMMITTED", grossAmount: taxable, taxableAmount: taxable, totalCgst: cgst, totalSgst: sgst, totalIgst: igst, totalGst: r2(cgst + sgst + igst), netPayable: total,
        items: { create: [{ lineNumber: 1, productName: item.name, manufacturer: "Synthetic Pharma", packSize: "1", packUnitType: "PIECE", hsnCode: item.hsn || "3004", batchNumber: `B${i}`, expiryMonth: 12, expiryYear: 2099, quantityPurchased: qty, mrp: item.price, discountPercent: 0, purchaseRate: rate, taxableAmount: taxable, cgstPercent: c, sgstPercent: s, igstPercent: ig, gstAmount: r2(cgst + sgst + igst), lineTotal: total }] },
      },
    });
    expected.monthPurchase.taxable = r2(expected.monthPurchase.taxable + taxable);
    expected.monthPurchase.cgst = r2(expected.monthPurchase.cgst + cgst);
    expected.monthPurchase.sgst = r2(expected.monthPurchase.sgst + sgst);
    expected.monthPurchase.igst = r2(expected.monthPurchase.igst + igst);
    expected.monthPurchase.amount = r2(expected.monthPurchase.amount + total);
  }

  // Today: two bills (one part-paid), an older bill settled in UPI, a counter sale and a cash refund.
  const t1 = await bill(601, today, "10:05", [[ITEMS[0], 2, 0]], [["CASH", 1]]);
  const t2 = await bill(602, today, "11:30", [[ITEMS[1], 1, 0], [ITEMS[3], 2, 0]], [["CARD", 0.5]]);
  const older = await bill(590, addDays(today, -2), "12:00", [[ITEMS[2], 10, 0]], [["UPI", 1, today]]);
  const counter = { taxable: 2 * ITEMS[3].price, tax: r2((2 * ITEMS[3].price * 12) / 100) };
  const refund = { taxable: ITEMS[0].price, tax: r2((ITEMS[0].price * 12) / 100) };
  const wf = (id, kind, payload, totals) =>
    db.inventoryWorkflowDocument.create({
      data: {
        id, branchId, kind, status: "POSTED", reference: id, requestKey: id, createdBy: pharmacistId, createdAt: at(today, "12:30"), totalAmount: r2(totals.taxable + totals.tax),
        payload: { date: today, ...payload, lines: [{ inventoryId: payload.item.id, name: payload.item.name, unit: "PIECES", quantity: payload.qty, unitPrice: payload.item.price, taxable: totals.taxable, tax: totals.tax, total: r2(totals.taxable + totals.tax), gstRate: payload.item.rate }] },
      },
    });
  await wf("CS-2026-001", "COUNTER_SALE", { paymentMode: "CASH", customerName: "Walk-in", item: ITEMS[3], qty: 2 }, counter);
  await wf("RET-2026-001", "SALES_RETURN", { refundMode: "CASH", customerName: "Meera Shah", item: ITEMS[0], qty: 1 }, refund);
  expected.today = {
    CASH: r2(t1.total + counter.taxable + counter.tax - refund.taxable - refund.tax),
    UPI: older.total,
    CARD: r2(t2.total * 0.5),
    billed: r2(t1.total + t2.total + counter.taxable + counter.tax),
    due: r2(t2.total - r2(t2.total * 0.5)),
  };
  expected.today.expected = r2(expected.today.CASH + expected.today.UPI + expected.today.CARD);

  // A Monday and Tuesday of their own: a bill paid 200 in cash on Monday whose discount was later edited to
  // 150, with 50 handed back in cash on Tuesday; Tuesday's bill of 1000 at 12% with a 10% bill discount; and a
  // draft cancelled on Tuesday before it got a number.
  const MON = "2024-03-11";
  const TUE = "2024-03-12";
  const patient = patients[0];
  const doc = (id, invoiceNumber, day, data) =>
    db.pharmacyInvoice.create({
      data: {
        id, invoiceNumber, patientId: patient.id, doctorId, branchId, createdById: pharmacistId, paymentMethod: "CASH",
        billingName: patient.name, billingPhone: patient.phone, invoiceDate: at(day, "10:00"), createdAt: at(day, "10:00"), ...data,
      },
    });
  await doc("cr33-revised", "PHI-2024-001", MON, {
    subtotal: 150, totalAmount: 150, status: "CONFIRMED", revisedAt: at(TUE, "09:00"),
    items: { create: [{ drugId: `${ITEMS[2].id}-drug`, inventoryItemId: ITEMS[2].id, quantity: 1, unitPrice: 150, taxPercent: 0, taxAmount: 0, totalAmount: 150 }] },
    payments: {
      create: [
        { requestKey: "cr33-paid", method: "CASH", amount: 200, status: "COMPLETED", paymentDate: at(MON, "10:01") },
        { requestKey: "refund:cr33-back", method: "CASH", amount: -50, status: "REFUNDED", paymentDate: at(TUE, "09:05") },
      ],
    },
  });
  await doc("cr33-bill-discount", "PHI-2024-002", TUE, {
    subtotal: 1000, discountAmount: 100, billDiscountKind: "PERCENT", billDiscountValue: 10, billDiscountAmount: 100, taxAmount: 108, totalAmount: 1008, status: "CONFIRMED", paymentMethod: "CARD",
    items: { create: [{ drugId: `${ITEMS[0].id}-drug`, inventoryItemId: ITEMS[0].id, quantity: 1, unitPrice: 1000, discountAmount: 0, billDiscountAmount: 100, taxPercent: 12, taxAmount: 108, totalAmount: 1008 }] },
    payments: { create: [{ requestKey: "cr33-card", method: "CARD", amount: 1008, status: "COMPLETED", paymentDate: at(TUE, "10:02") }] },
  });
  await doc("cr33-cancelled-draft", "DRAFT-0d6b1f2a-7c3e-4a59-9e81-5b2c4d6f8a10", TUE, {
    subtotal: 180, taxAmount: 21.6, totalAmount: 201.6, status: "CANCELLED",
    items: { create: [{ drugId: `${ITEMS[0].id}-drug`, inventoryItemId: ITEMS[0].id, quantity: 1, unitPrice: 180, taxPercent: 12, taxAmount: 21.6, totalAmount: 201.6 }] },
  });
  expected.refundDay = { monday: MON, tuesday: TUE };
  return expected;
}

module.exports = { seed, lastMonth, ITEMS };
