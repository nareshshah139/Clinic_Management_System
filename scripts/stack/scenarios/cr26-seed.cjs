const IST_MS = 19800000;
const DAY_MS = 86400000;

const istInstant = (day, time = "12:00", second = 0) => new Date(`${day}T${time}:${String(second).padStart(2, "0")}+05:30`);
const istDay = (instant) => new Date(instant.getTime() + IST_MS).toISOString().slice(0, 10);
const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);

const DISTRIBUTORS = [
  { code: "SLV", name: "Shree Laxmi Vitality Pharma", gstin: "27AABCS1234F1Z5" },
  { code: "APX", name: "Apex Medico Distributors", gstin: "27AAACA5678B1ZQ" },
  { code: "SKP", name: "Sai Krupa Pharma Agencies", gstin: "27AAGFS2345C1Z3" },
  { code: "NVJ", name: "Navjeevan Drug House", gstin: "27AAECN9087D1ZM" },
  { code: "MCW", name: "Medi-Care Wholesalers", gstin: "24AAHCM4412E1Z8" },
  { code: "BLS", name: "Bharat Lifesciences Pvt Ltd", gstin: "29AABCB7781K1ZP" },
];

const FY_COUNT = 60;
const FUTURE_DAY = "2099-01-15";
const CANCELLED = new Set([13, 41]);
const NOT_POSTED = new Map([
  [5, "DRAFT"], [29, "DRAFT"], [53, "DRAFT"],
  [11, "OCR_REVIEW_REQUIRED"], [35, "OCR_REVIEW_REQUIRED"],
  [17, "REVIEWED"], [47, "REVIEWED"],
  [23, "RECONCILIATION_FAILED"],
]);
const PLANS = ["PAID", "PART_ALLOC", "PART_CREDIT", "UNPAID", "UNPAID", "PAID_COMBO", "UNPAID_REVERSED", "UNPAID", "PART_BOTH", "UNPAID"];
const SOURCES = ["MANUAL", "OCR", "CSV", "GMAIL"];
const MODES = ["NEFT", "UPI", "CHEQUE", "CASH", "CARD"];
const cents = (rupees) => Math.round(rupees * 100);

function specFor(i, today, committedIndex) {
  const dist = DISTRIBUTORS[i % 6];
  const seq = Math.floor(i / 6) + 1;
  const invoiceDay = addDays("2026-04-05", Math.round((i * 214) / 59));
  const stamp = istInstant(invoiceDay, `${String(9 + ((i * 7) % 10)).padStart(2, "0")}:${String((i * 13) % 60).padStart(2, "0")}`, i % 60);
  const lag = invoiceDay >= "2026-11-02" ? 0 : (i * 37) % 4;
  const created = new Date(stamp.getTime() + lag * DAY_MS + 3600000 + i * 1000);
  const status = CANCELLED.has(i) ? "CANCELLED" : NOT_POSTED.get(i) ?? "STOCK_COMMITTED";
  const net = ((i * 7919) % 450000) + 12000;
  const dueOffset = [15, 30, 45, 60][i % 4];
  let dueDay = i % 9 === 0 ? null : addDays(invoiceDay, dueOffset);
  if (i >= 52) dueDay = addDays(today, i - 50);
  if (i === 51) dueDay = today;
  const creator = ["pharmacist", "owner", null, "pharmacist", "legacy", "owner", "pharmacist"][i % 7];
  return {
    key: i, billNo: `${dist.code}/2026/${seq}`, dist, invoiceDay, invoiceInstant: stamp, createdAt: created, status, net, dueDay,
    source: SOURCES[i % 4], creator, plan: status === "STOCK_COMMITTED" ? (i === 51 ? "UNPAID" : PLANS[committedIndex % 10]) : "NONE", committedIndex, fy: "current",
  };
}

function buildSpecs(today) {
  const specs = [];
  let k = 0;
  for (let i = 0; i < FY_COUNT; i++) {
    const committed = !CANCELLED.has(i) && !NOT_POSTED.has(i);
    specs.push(specFor(i, today, committed ? k : -1));
    if (committed) k++;
  }
  const extra = (key, code, billNo, invoiceInstant, net, dueDay, fy) => {
    const dist = DISTRIBUTORS.find((d) => d.code === code);
    specs.push({
      key, billNo, dist, invoiceDay: istDay(invoiceInstant), invoiceInstant, createdAt: new Date(invoiceInstant.getTime() + 600000), status: "STOCK_COMMITTED", net,
      dueDay, source: "MANUAL", creator: "pharmacist", plan: "UNPAID", committedIndex: -1, fy,
    });
  };
  extra(100, "SLV", "SLV/2025/48", istInstant("2025-12-12", "11:20"), 5400000, "2026-01-11", "previous");
  extra(101, "SLV", "SLV/2026/0", istInstant("2026-02-03", "15:05"), 2750050, "2026-03-05", "previous");
  extra(102, "NVJ", "NVJ/2025/77", istInstant("2026-03-31", "23:30"), 1250000, "2026-04-30", "previous");
  extra(103, "APX", "APX/2026/0", istInstant("2026-04-01", "00:15"), 880000, "2026-05-01", "current");
  const plan = (spec, plan) => Object.assign(spec, { plan });
  // CR-26 fix round: payments dated after now are "scheduled" - they do not reduce the balance but reduce what is payable.
  extra(104, "SKP", "SKP/2026/FUT-FULL", istInstant(addDays(today, -2), "10:30"), 1860000, addDays(today, 20), "current");
  plan(specs.at(-1), "FUTURE_FULL");
  extra(105, "MCW", "MCW/2026/FUT-PART", istInstant(addDays(today, -60), "14:10"), 2400000, addDays(today, -10), "current");
  plan(specs.at(-1), "FUTURE_PART");
  return specs;
}

async function seed(client, stack) {
  return client.$transaction(
    async (db) => {
      await db.$executeRawUnsafe("SELECT set_config('app.purchase_recovery_protocol', '2', true)");
      return seedRows(db, stack);
    },
    { timeout: 120000, maxWait: 30000 },
  );
}

async function seedRows(db, stack) {
  const branchId = stack.branch.id;
  const today = istDay(new Date());
  const userId = { pharmacist: stack.users.pharmacist.id, owner: stack.users.owner.id, legacy: "legacy-import", null: null };
  const specs = buildSpecs(today);
  const names = { pharmacist: "Anil Deshmukh", owner: "Rajesh Iyer" };
  const model = [];
  const paymentGroups = new Map();
  let creditSeq = 0;
  let paymentSeq = 0;

  for (const s of specs) {
    const net = s.net / 100;
    const paidAlloc = [];
    let credit = 0;
    let reversed = false;
    switch (s.plan) {
      case "PAID": paidAlloc.push(s.net); break;
      case "PAID_COMBO": paidAlloc.push(Math.round(s.net * 0.7)); credit = s.net - Math.round(s.net * 0.7); break;
      case "PART_ALLOC": paidAlloc.push(Math.round(s.net * 0.4)); break;
      case "PART_CREDIT": credit = Math.round(s.net * 0.25); break;
      case "PART_BOTH": paidAlloc.push(Math.round(s.net * 0.3)); credit = Math.round(s.net * 0.2); break;
      case "UNPAID_REVERSED": paidAlloc.push(s.net); reversed = true; break;
      default: break;
    }
    if (s.committedIndex === 10) paidAlloc.splice(0, paidAlloc.length, s.net + 500);
    const future = s.plan === "FUTURE_FULL" ? s.net : s.plan === "FUTURE_PART" ? Math.round(s.net * 0.4) : 0;
    const invoice = await db.pharmacyPurchaseInvoice.create({
      data: {
        branchId, createdBy: userId[s.creator ?? "null"] ?? null, distributorName: s.dist.name, distributorGstin: s.dist.gstin, distributorDlNo: `MH-PUN-${s.dist.code}-2026`,
        invoiceNumber: s.billNo, invoiceDate: s.invoiceInstant, billType: "CREDIT", dueDate: s.dueDay ? istInstant(s.dueDay, "12:00") : null, doctorNameOrRegNo: "Dr. Praneeta Jain",
        source: s.source, status: s.status, grossAmount: net, taxableAmount: net, totalGst: 0, netPayable: net, creditApplied: credit / 100,
        stockCommittedAt: s.status === "STOCK_COMMITTED" ? new Date(s.invoiceInstant.getTime() + 60000) : null, createdAt: s.createdAt,
      },
    });
    s.id = invoice.id;
    if (credit > 0) {
      creditSeq++;
      const note = await db.inventorySupplierCredit.create({
        data: { branchId, supplierGstin: s.dist.gstin, documentId: `seed-credit-doc-${creditSeq}`, reference: `CN/2026/${creditSeq}`, amount: credit / 100, applied: credit / 100 },
      });
      await db.inventoryCreditAllocation.create({
        data: { branchId, creditId: note.id, purchaseInvoiceId: invoice.id, amount: credit / 100, requestKey: `seed-credit-${creditSeq}`, createdBy: userId.pharmacist },
      });
    }
    for (const amountCents of paidAlloc) {
      const group = !reversed && s.plan === "PAID" ? paymentGroups.get(s.dist.gstin) : null;
      if (group && group.count === 1) {
        await db.pharmacyPurchasePaymentAllocation.create({ data: { paymentId: group.id, purchaseInvoiceId: invoice.id, amount: amountCents / 100 } });
        await db.pharmacyPurchasePayment.update({ where: { id: group.id }, data: { amount: group.total / 100 + amountCents / 100 } });
        group.count = 2;
        continue;
      }
      paymentSeq++;
      const payment = await db.pharmacyPurchasePayment.create({
        data: {
          branchId, distributorGstin: s.dist.gstin, distributorName: s.dist.name, paymentDate: istInstant(addDays(s.invoiceDay, 3) > today ? today : addDays(s.invoiceDay, 3), "11:00"),
          mode: MODES[paymentSeq % 5], paidBy: userId.pharmacist, amount: amountCents / 100, referenceNo: `SEED-REF-${paymentSeq}`, requestKey: `seed-payment-${paymentSeq}`,
          reversedAt: reversed ? new Date(Date.now() - DAY_MS) : null, reversedBy: reversed ? userId.pharmacist : null, reversalReason: reversed ? "Seeded reversal" : null,
          allocations: { create: [{ purchaseInvoiceId: invoice.id, amount: amountCents / 100 }] },
        },
      });
      if (!reversed && s.plan === "PAID") paymentGroups.set(s.dist.gstin, { id: payment.id, count: 1, total: amountCents });
    }
    if (future) {
      paymentSeq++;
      await db.pharmacyPurchasePayment.create({
        data: {
          branchId, distributorGstin: s.dist.gstin, distributorName: s.dist.name, paymentDate: istInstant(FUTURE_DAY, "00:00"), mode: "NEFT", paidBy: userId.pharmacist,
          amount: future / 100, referenceNo: `SEED-FUTURE-${paymentSeq}`, requestKey: `seed-payment-${paymentSeq}`,
          allocations: { create: [{ purchaseInvoiceId: invoice.id, amount: future / 100 }] },
        },
      });
    }
    const live = reversed ? 0 : paidAlloc.reduce((a, b) => a + b, 0);
    model.push({
      id: invoice.id, key: s.key, billNo: s.billNo, distributor: s.dist.name, gstin: s.dist.gstin, billDay: s.invoiceDay, entryAt: s.createdAt.getTime(),
      net: s.net, paid: live, credit, dueDay: s.dueDay, status: s.status, source: s.source, entryBy: s.creator && names[s.creator] ? names[s.creator] : null, plan: s.plan, fy: s.fy, sched: future, schedDay: future ? FUTURE_DAY : null,
    });
  }
  return { model, today, names, distributors: DISTRIBUTORS };
}

// CR-26 fix round rules: OVERDUE wins over PARTIAL; scheduled (future-dated) payments only reduce `payable`.
function derive(bill, today) {
  const settled = bill.paid + bill.credit;
  const posted = bill.status === "STOCK_COMMITTED";
  const outstanding = posted ? Math.max(bill.net - settled, 0) : 0;
  const lateDays = bill.dueDay && bill.dueDay < today ? daysBetween(bill.dueDay, today) : 0;
  let state;
  if (bill.status === "CANCELLED") state = "CANCELLED";
  else if (!posted) state = "NOT_POSTED";
  else if (outstanding <= 1) state = "PAID";
  else if (lateDays > 0) state = "OVERDUE";
  else if (settled > 1) state = "PARTIAL";
  else state = "DUE";
  const open = ["DUE", "OVERDUE", "PARTIAL"].includes(state);
  const sched = open ? bill.sched || 0 : 0;
  return {
    state,
    outstanding: state === "PAID" ? 0 : outstanding,
    lateDays: state === "OVERDUE" ? lateDays : 0,
    partlyPaid: open && settled > 1,
    settled,
    sched,
    schedDay: sched ? bill.schedDay : null,
    payable: open ? Math.max(outstanding - sched, 0) : 0,
    scheduledOnly: open && sched > 0 && outstanding - sched <= 1,
  };
}

module.exports = { seed, derive, istDay, istInstant, addDays, daysBetween, DISTRIBUTORS, FUTURE_DAY };
