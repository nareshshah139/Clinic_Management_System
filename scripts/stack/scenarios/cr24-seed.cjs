const IST_MS = 19800000;
const DAY_MS = 86400000;

const istInstant = (day, time = "12:00", second = 0) => new Date(`${day}T${time}:${String(second).padStart(2, "0")}+05:30`);
const istDay = (instant) => new Date(instant.getTime() + IST_MS).toISOString().slice(0, 10);
const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);

const PATIENTS = [
  ["Ramesh Sharma", "9876512345"], ["Sunita Sharma", "9876598765"], ["Anjali Kulkarni", "98765 43210"],
  ["Vikram Singh Rathore", "9811122334"], ["Meera Nair", "+91-9822012345"], ["Suresh Patel", "9898989898"],
  ["Kavita Joshi", "09890123456"], ["Arjun Reddy", "9440011223"], ["Pooja Deshpande", "9765400123"],
  ["Mohammed Irfan Khan", "9930077441"], ["Lakshmi Venkataraman", "9884455667"], ["Sandeep Gupta", "9871234560"],
  ["Neha Agarwal", "9810099887"], ["Rahul Bhatt", "9820123987"], ["Divya Pillai", "9847012345"],
  ["Harish Chandra Mishra", "9415566778"], ["Fatima Shaikh", "9867300112"], ["Gurpreet Kaur", "9876500321"],
  ["Manoj Tiwari", "9919188776"], ["Rekha Banerjee", "9830456789"], ["Prakash Jadhav", "9923345566"],
  ["Aditi Chavan", "9850612345"], ["Nitin Kamble", "9822233445"], ["Shalini Menon", "9895123456"],
  ["Kavya Rao", ""],
];
const NO_PHONE_PATIENT = 24;

const BILL_COUNT = 70;
const OCT15_BILLS = [55, 56, 57, 58, 59, 61];
const DRAFT_BILLS = { 23: "DRAFT", 47: "PENDING", 61: "DRAFT" };
const CANCELLED_BILLS = [31, 55];
const LEGACY_WITH_STOCK = [4, 12, 20, 33, 41];
const LEGACY_NO_TRACE = [66];
const RECEPTION_BILLS = [8, 19, 27, 52, 63];
const OWNER_BILLS = [14, 49, 58];
const NO_PHONE_BILL = 38;
const BACKDATED_BILL = 15;
const SPLIT_CASH_UPI = (n) => n % 7 === 0 && n % 14 !== 0;
const SPLIT_UPI_CARD = (n) => n % 14 === 0;

function billDay(n) {
  if (OCT15_BILLS.includes(n)) return "2026-10-15";
  if (n === 60) return "2026-10-16";
  if (n >= 62) return addDays("2026-10-17", (n - 62) * 2);
  if (n === 45) return "2026-09-10";
  if (n === 46) return "2026-09-11";
  return addDays("2026-04-03", Math.round(((n - 1) * daysBetween("2026-04-03", "2026-10-14")) / 53));
}

function billTime(n) {
  if (n === 45) return "23:45";
  if (n === 46) return "00:20";
  return `${String(9 + ((n * 7) % 11)).padStart(2, "0")}:${String((n * 13) % 60).padStart(2, "0")}`;
}

const pad3 = (n) => String(n).padStart(3, "0");
const centsFor = (n, salt = 7919) => ((n * salt) % 450000) + 12000;

function buildBills() {
  const bills = [];
  const make = (spec) => bills.push(spec);
  for (let n = 1; n <= BILL_COUNT; n++) {
    const patientIndex = n === NO_PHONE_BILL ? NO_PHONE_PATIENT : (n * 5) % 24;
    const status = DRAFT_BILLS[n] ?? (CANCELLED_BILLS.includes(n) ? "CANCELLED" : ["COMPLETED", "DISPENSED", "CONFIRMED"][n % 3]);
    const creator = LEGACY_WITH_STOCK.includes(n) || LEGACY_NO_TRACE.includes(n) ? null : RECEPTION_BILLS.includes(n) ? "reception" : OWNER_BILLS.includes(n) ? "owner" : "pharmacist";
    const invoiceDate = istInstant(billDay(n), billTime(n), n % 60);
    make({
      n,
      invoiceNumber: `PHI-2026-${pad3(n)}`,
      status,
      patientIndex,
      creator,
      invoiceDate,
      createdAt: n === BACKDATED_BILL ? new Date(invoiceDate.getTime() + 2 * DAY_MS + 3600000) : new Date(invoiceDate.getTime() + 180000 + n * 1000),
      cents: centsFor(n),
      paymentMethod: SPLIT_CASH_UPI(n) || SPLIT_UPI_CARD(n) ? "CASH" : ["CASH", "UPI", "CARD", "CASH"][n % 4],
      paymentRows: ["DRAFT", "PENDING", "CANCELLED"].includes(status) ? [] : SPLIT_CASH_UPI(n) ? ["CASH", "UPI"] : SPLIT_UPI_CARD(n) ? ["UPI", "CARD"] : n % 5 === 0 ? [["CASH", "UPI", "CARD", "CASH"][n % 4]] : [],
      legacyStock: LEGACY_WITH_STOCK.includes(n),
    });
  }
  make({
    n: 71, invoiceNumber: "PHI-2026-071", status: "COMPLETED", patientIndex: 3, creator: "pharmacist",
    invoiceDate: new Date("2026-03-31T19:00:00Z"), createdAt: new Date("2026-03-31T19:05:00Z"), cents: 98750,
    paymentMethod: "UPI", paymentRows: [], legacyStock: false,
  });
  make({
    n: 72, invoiceNumber: "PHI-2026-072", status: "COMPLETED", patientIndex: 9, creator: "pharmacist",
    invoiceDate: new Date("2026-11-06T04:45:00Z"), createdAt: new Date("2026-11-06T04:50:00Z"), cents: 156025,
    paymentMethod: "CARD", paymentRows: [], legacyStock: false,
  });
  const previous = [
    [41, "2025-12-09", "11:10", 45500], [42, "2026-01-21", "16:40", 120075], [43, "2026-02-14", "10:05", 83300], [44, "2026-03-15", "18:20", 27650],
  ];
  for (const [n, day, time, cents] of previous)
    make({
      n: 1000 + n, invoiceNumber: `PHI-2025-${pad3(n)}`, status: "COMPLETED", patientIndex: n % 24, creator: "pharmacist",
      invoiceDate: istInstant(day, time), createdAt: istInstant(day, time, 30), cents, paymentMethod: ["CASH", "UPI", "CARD", "CASH"][n % 4], paymentRows: [], legacyStock: false,
    });
  make({
    n: 1045, invoiceNumber: "PHI-2025-045", status: "COMPLETED", patientIndex: 11, creator: "pharmacist",
    invoiceDate: new Date("2026-03-31T17:30:00Z"), createdAt: new Date("2026-03-31T17:35:00Z"), cents: 64100, paymentMethod: "CASH", paymentRows: [], legacyStock: false,
  });
  return bills;
}

const COUNTER_SALES = [
  { ref: "CS-2026-001", status: "POSTED", day: "2026-04-20", time: "10:30", name: "Deepak Salvi", phone: "9822011100", mode: "CASH", cents: 34500, by: "pharmacist" },
  { ref: "CS-2026-002", status: "POSTED", day: "2026-05-18", time: "17:05", name: "Ritu Sharma", phone: "9876511122", mode: "upi", cents: 78925, by: "pharmacist" },
  { ref: "CS-2026-003", status: "POSTED", day: "2026-07-04", time: "13:15", name: "Imran Qureshi", phone: "9833344455", mode: "CARD", cents: 152000, by: "reception" },
  { ref: "CS-2026-004", status: "POSTED", day: "2026-08-22", time: "19:40", name: null, phone: null, mode: "CASH", cents: 9900, by: "pharmacist" },
  { ref: "CS-2026-005", status: "POSTED", day: "2026-10-15", time: "12:20", name: "Bhavesh Thakkar", phone: "9825566778", mode: "UPI", cents: 41850, by: "pharmacist" },
  { ref: "CS-2026-006", status: "DRAFT", day: "2026-10-15", time: "15:50", name: "Smita Gokhale", phone: "9890055443", mode: "CASH", cents: 27375, by: "pharmacist" },
  { ref: "CS-2026-007", status: "POSTED", day: "2026-10-30", time: "11:25", name: "Yusuf Ansari", phone: "9867788990", mode: "CASH", cents: 61200, by: "doctor" },
  { ref: "CS-2026-008", status: "REVERSED", day: "2026-09-02", time: "14:00", name: "Tanvi Apte", phone: "9822100200", mode: "NETBANKING", cents: 18650, by: "pharmacist" },
];

const SALES_RETURNS = [
  { ref: "SR-2026-001", status: "POSTED", day: "2026-06-12", time: "12:10", name: "Ramesh Sharma", phone: "9876512345", mode: "CASH", cents: 12500, bill: 9, by: "pharmacist" },
  { ref: "SR-2026-002", status: "POSTED", day: "2026-07-25", time: "16:30", name: "Sunita Sharma", phone: "9876598765", mode: "UPI", cents: 8975, bill: 15, by: "pharmacist" },
  { ref: "SR-2026-003", status: "POSTED", day: "2026-09-09", time: "10:45", name: "Fatima Shaikh", phone: "9867300112", mode: "CARD", cents: 23400, bill: 30, by: "reception" },
  { ref: "SR-2026-004", status: "DRAFT", day: "2026-10-28", time: "18:00", name: "Kavya Rao", phone: null, mode: "CASH", cents: 5200, bill: 44, by: "pharmacist" },
  { ref: "SR-2026-005", status: "POSTED", day: "2026-11-02", time: "09:35", name: "Walk-in customer", phone: "9899900011", mode: "UPI", cents: 31050, bill: null, by: "doctor" },
];

const BILL_FINAL = new Set(["CONFIRMED", "DISPENSED", "COMPLETED"]);
const billState = (status) => (BILL_FINAL.has(status) ? "FINAL" : status === "CANCELLED" ? "CANCELLED" : "DRAFT");
const documentState = (status) => (status === "POSTED" ? "FINAL" : status === "DRAFT" ? "DRAFT" : "CANCELLED");

async function seed(db, stack) {
  const branchId = stack.branch.id;
  const names = { pharmacist: "Anil Deshmukh", doctor: "Priya Menon", reception: "Sunita Patil", owner: "Rajesh Iyer" };
  const userId = (key) => stack.users[key].id;

  const patients = [];
  for (const [i, [name, phone]] of PATIENTS.entries())
    patients.push(await db.patient.create({ data: { branchId, name, gender: i % 3 === 0 ? "MALE" : "FEMALE", phone, city: "Pune", state: "Maharashtra" } }));

  const item = await db.inventoryItem.create({
    data: { branchId, name: "Paracetamol 650mg Tab", type: "MEDICINE", costPrice: 1.2, sellingPrice: 2.5, unit: "PIECES", currentStock: 5000, minStockLevel: 100 },
  });

  const bills = buildBills();
  const expected = [];
  for (const b of bills) {
    const patient = patients[b.patientIndex];
    const total = b.cents / 100;
    const final = billState(b.status) === "FINAL";
    const invoice = await db.pharmacyInvoice.create({
      data: {
        invoiceNumber: b.invoiceNumber, patientId: patient.id, branchId, subtotal: total, totalAmount: total,
        paymentMethod: b.paymentMethod, paymentStatus: final ? "COMPLETED" : "PENDING", paidAmount: final ? total : 0, balanceAmount: final ? 0 : total,
        billingName: patient.name, billingPhone: patient.phone, status: b.status, invoiceDate: b.invoiceDate, createdAt: b.createdAt,
        createdById: b.creator ? userId(b.creator) : null,
      },
    });
    if (b.paymentRows.length) {
      const first = Math.round(b.cents * 0.6);
      for (const [i, method] of b.paymentRows.entries()) {
        const share = b.paymentRows.length === 1 ? b.cents : i === 0 ? first : b.cents - first;
        await db.pharmacyPayment.create({
          data: { invoiceId: invoice.id, amount: share / 100, method, status: "COMPLETED", paymentDate: b.invoiceDate, createdAt: new Date(b.invoiceDate.getTime() + (i + 1) * 60000) },
        });
      }
    }
    if (b.legacyStock) {
      await db.stockTransaction.create({
        data: {
          branchId, itemId: item.id, userId: userId("doctor"), type: "SALE", quantity: 2, unitPrice: 2.5, totalAmount: 5,
          reference: `INV-${b.invoiceNumber}`, createdAt: new Date(b.invoiceDate.getTime() + 60000),
        },
      });
      if (b.n === 12)
        await db.stockTransaction.create({
          data: {
            branchId, itemId: item.id, userId: userId("pharmacist"), type: "SALE", quantity: 1, unitPrice: 2.5, totalAmount: 2.5,
            reference: `INV-${b.invoiceNumber}`, createdAt: new Date(b.invoiceDate.getTime() + 600000),
          },
        });
    }
    if (b.n === 8)
      await db.stockTransaction.create({
        data: {
          branchId, itemId: item.id, userId: userId("doctor"), type: "SALE", quantity: 1, unitPrice: 2.5, totalAmount: 2.5,
          reference: `INV-${b.invoiceNumber}`, createdAt: new Date(b.invoiceDate.getTime() + 60000),
        },
      });
    const modes = b.paymentRows.length ? b.paymentRows : [b.paymentMethod];
    const entryByKey = b.creator ?? (b.legacyStock ? "doctor" : null);
    expected.push({
      key: `${b.invoiceNumber}`,
      register: "sales",
      source: "bill",
      recordId: invoice.id,
      billNo: billState(b.status) === "DRAFT" ? null : b.invoiceNumber,
      invoiceNumber: b.invoiceNumber,
      state: billState(b.status),
      entryAt: b.createdAt.getTime(),
      billDay: istDay(b.invoiceDate),
      entryBy: entryByKey ? names[entryByKey] : null,
      patient: patient.name,
      mobile: patient.phone || null,
      cents: b.cents,
      modes: [...new Set(modes)],
      linked: null,
    });
  }

  const workflow = async (kind, spec, extra) => {
    const at = istInstant(spec.day, spec.time);
    const payload = { date: spec.day, ...(spec.name && { customerName: spec.name }), ...(spec.phone && { customerPhone: spec.phone }) };
    payload[kind === "SALES_RETURN" ? "refundMode" : "paymentMode"] = spec.mode;
    const doc = await db.inventoryWorkflowDocument.create({
      data: {
        branchId, kind, status: spec.status, reference: spec.ref, payload, totalAmount: (spec.cents / 100).toFixed(2), requestKey: `seed-${spec.ref}`,
        createdBy: userId(spec.by), createdAt: at, ...extra,
      },
    });
    return { doc, at };
  };

  for (const spec of COUNTER_SALES) {
    const { doc, at } = await workflow("COUNTER_SALE", spec, {});
    expected.push({
      key: spec.ref, register: "sales", source: "counter", recordId: doc.id, billNo: documentState(spec.status) === "DRAFT" ? null : spec.ref, invoiceNumber: spec.ref,
      state: documentState(spec.status), entryAt: at.getTime(), billDay: spec.day, entryBy: names[spec.by], patient: spec.name, mobile: spec.phone,
      cents: spec.cents, modes: [spec.mode.toUpperCase()], linked: null,
    });
  }

  const idByNumber = Object.fromEntries(expected.map((e) => [e.invoiceNumber, e.recordId]));
  for (const spec of SALES_RETURNS) {
    const linkedNumber = spec.bill ? `PHI-2026-${pad3(spec.bill)}` : null;
    const { doc, at } = await workflow("SALES_RETURN", spec, linkedNumber ? { salesInvoiceId: idByNumber[linkedNumber] } : {});
    expected.push({
      key: spec.ref, register: "returns", source: "return", recordId: doc.id, billNo: documentState(spec.status) === "DRAFT" ? null : spec.ref, invoiceNumber: spec.ref,
      state: documentState(spec.status), entryAt: at.getTime(), billDay: spec.day, entryBy: names[spec.by], patient: spec.name, mobile: spec.phone,
      cents: spec.cents, modes: [spec.mode.toUpperCase()], linked: linkedNumber,
    });
  }
  return { expected, names, clinicName: stack.branch.name, today: istDay(new Date()) };
}

module.exports = { seed, istDay, addDays };
