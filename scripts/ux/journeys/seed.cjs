const path = require("node:path");
const { createRequire } = require("node:module");

const root = path.resolve(__dirname, "../../..");
const DAY = 86400000;
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const istDay = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const at = (day, time) => new Date(`${day}T${time}:00+05:30`);
// The API validates ids as CUIDs, so seeded ids keep that shape while staying readable.
const cid = (kind, n = "") => `cux${kind}`.padEnd(25 - String(n).length, "0") + n;

function rolePermissions(role) {
  const tsNode = ["backend", ""].map((d) => path.join(root, d, "package.json")).map((p) => { try { return createRequire(p).resolve("ts-node"); } catch { return null; } }).find(Boolean);
  require(tsNode).register({ transpileOnly: true, project: path.join(root, "backend/tsconfig.json") });
  return [...(require(path.join(root, "backend/src/shared/access/role-permissions.ts")).ROLE_PERMISSIONS[role] ?? [])];
}

const PATIENTS = [
  ["Meera Shah", "F", "1992-03-04", "9822011101", "Flat 4, Sai Residency, Kothrud", "411038", "Penicillin", "Acne since teens"],
  ["Rohan Kulkarni", "M", "1988-07-19", "9822011102", "22 Karve Road, Erandwane", "411004", null, null],
  ["Ananya Joshi", "F", "1999-11-02", "9822011103", "B-12 Sanjivani Society, Aundh", "411007", null, "Eczema as a child"],
  ["Vikram Patil", "M", "1975-01-25", "9822011104", "Row House 7, Baner Road", "411045", "Sulfa drugs", "Type 2 diabetes, on metformin"],
  ["Sneha Deshpande", "F", "1996-09-30", "9822011105", "301 Deccan Heights, FC Road", "411004", null, null],
  ["Aditya Bhosale", "M", "2001-05-12", "9822011106", "Lane 5, Koregaon Park", "411001", null, null],
  ["Pooja Gokhale", "F", "1985-12-08", "9822011107", "45 Prabhat Road, Deccan", "411004", null, null],
  ["Sanjay Pawar", "M", "1969-04-17", "9822011108", "Wing C, Hadapsar Gardens", "411028", null, "Hypertension"],
  ["Kavita Naik", "F", "1990-06-21", "9822011109", "A-9 Pashan Link Road", "411021", null, null],
  ["Imran Sheikh", "M", "1994-02-14", "9822011110", "Camp, MG Road", "411001", null, null],
  ["Nisha Jadhav", "F", "2003-08-29", "9822011111", "Wakad Phata, Pimpri-Chinchwad", "411057", null, null],
  ["Prakash Kale", "M", "1980-10-03", "9822011112", "Shivajinagar, Gokhale Nagar", "411016", null, null],
];

const MEDICINES = [
  ["Adapalene Gel 0.1% 15g", "Adapalene", "GEL", "0.1%", "TUBES", 185, 12, 34, 14, "Dr. Reddy's Laboratories"],
  ["Clindamycin Gel 1% 20g", "Clindamycin", "GEL", "1%", "TUBES", 140, 12, 28, 10, "Glenmark Pharmaceuticals"],
  ["Benzoyl Peroxide Gel 2.5% 20g", "Benzoyl Peroxide", "GEL", "2.5%", "TUBES", 120, 12, 22, 10, "Galderma"],
  ["Tretinoin Cream 0.025% 20g", "Tretinoin", "CREAM", "0.025%", "TUBES", 165, 12, 3, 8, "Glenmark Pharmaceuticals"],
  ["Isotretinoin 20mg Capsule", "Isotretinoin", "CAPSULE", "20mg", "STRIPS", 310, 12, 18, 6, "Sun Pharma"],
  ["Doxycycline 100mg Capsule", "Doxycycline", "CAPSULE", "100mg", "STRIPS", 95, 12, 60, 20, "Cipla"],
  ["Cetirizine 10mg Tablet", "Cetirizine", "TABLET", "10mg", "STRIPS", 32, 12, 90, 30, "Cipla"],
  ["Fluconazole 150mg Tablet", "Fluconazole", "TABLET", "150mg", "STRIPS", 48, 12, 25, 10, "Mankind Pharma"],
  ["Terbinafine 250mg Tablet", "Terbinafine", "TABLET", "250mg", "STRIPS", 168, 12, 30, 10, "Sun Pharma"],
  ["Luliconazole Cream 1% 15g", "Luliconazole", "CREAM", "1%", "TUBES", 210, 12, 16, 8, "Glenmark Pharmaceuticals"],
  ["Mometasone Cream 0.1% 15g", "Mometasone", "CREAM", "0.1%", "TUBES", 135, 12, 20, 8, "Cipla"],
  ["Clobetasol Cream 0.05% 20g", "Clobetasol", "CREAM", "0.05%", "TUBES", 98, 12, 0, 8, "Sun Pharma"],
  ["Ketoconazole Shampoo 2% 100ml", "Ketoconazole", "SHAMPOO", "2%", "BOTTLES", 240, 12, 4, 8, "Zydus Cadila"],
  ["Sunscreen SPF 50 Gel 50g", "Zinc Oxide", "SUNSCREEN", "SPF 50", "TUBES", 520, 18, 26, 10, "Sebamed"],
  ["Minoxidil Solution 5% 60ml", "Minoxidil", "SOLUTION", "5%", "BOTTLES", 575, 12, 12, 6, "Dr. Reddy's Laboratories"],
];
const NEAR_EXPIRY = "Fluconazole 150mg Tablet";
const SECOND_BATCH = new Set(["Doxycycline 100mg Capsule", "Cetirizine 10mg Tablet", "Adapalene Gel 0.1% 15g"]);

const SERVICES = [
  ["Dermatology Consultation", "Consult", 0, 500],
  ["Review Consultation", "Consult", 0, 300],
  ["Chemical Peel", "Procedure", 18, 2500],
  ["Acne Scar Microneedling", "Procedure", 18, 3500],
  ["Wart Removal (Cautery)", "Procedure", 18, 1800],
  ["Laser Hair Removal - Underarms", "Aesthetic", 18, 1500],
  ["Skin Glow Facial", "Aesthetic", 18, 2000],
];

const DISTRIBUTORS = [
  ["Shree Laxmi Pharma Distributors", "27AABCS1234F1Z5", "MH-PUN-2041", "Narayan Peth, Pune 411030", "Rakesh Shinde", "9890012345"],
  ["Apex Medico Agencies", "27AAACA5678B1ZQ", "MH-PUN-3187", "Hadapsar Industrial Estate, Pune 411013", "Deepa Nair", "9822098220"],
];

const CLINIC_TODAY = [
  ["09:00-09:15", 0, "COMPLETED", "OPD", 1, 0],
  ["09:30-10:00", 1, "COMPLETED", "PROCEDURE", 2, 2],
  ["10:30-10:45", 2, "IN_PROGRESS", "OPD", 3, 0],
  ["11:30-11:45", 3, "CONFIRMED", "OPD", 4, 1],
  ["12:15-12:30", 4, "CONFIRMED", "OPD", 5, 0],
  ["14:00-14:15", 5, "SCHEDULED", "OPD", 6, 1],
  ["15:15-15:30", 6, "SCHEDULED", "OPD", null, 0],
  ["16:00-16:15", 7, "CONFIRMED", "OPD", 7, 1],
];
const TOMORROW = [["10:00-10:15", 8, "CONFIRMED", 1, 0], ["11:15-11:30", 9, "SCHEDULED", 2, 1]];

const EARLIER = [
  [0, 28, "Acne on cheeks and forehead", "Acne vulgaris", true],
  [1, 45, "Dark spots on the face", "Post-inflammatory hyperpigmentation", true],
  [2, 14, "Itchy dry patches on elbows", "Atopic dermatitis", true],
  [3, 21, "Ring-shaped itchy rash on groin", "Tinea cruris", true],
  [4, 33, "Hair fall for 3 months", "Telogen effluvium", false],
  [5, 9, "Oily skin and breakouts", "Acne vulgaris", true],
  [7, 52, "Scaly scalp, itching", "Seborrheic dermatitis", false],
  [8, 18, "Painless wart on the finger", "Verruca vulgaris", false],
  [9, 12, "Itchy rash between toes", "Tinea pedis", false],
  [0, 70, "Breakouts before periods", "Acne vulgaris", false],
];

async function seed(stack) {
  const db = stack.db;
  const branchId = stack.branch.id;
  const today = istDay();
  const tomorrow = addDays(today, 1);
  const doctorId = stack.users.doctor.id;
  const doctorName = `Dr. ${stack.users.doctor.firstName} ${stack.users.doctor.lastName}`;
  const pharmacistId = stack.users.pharmacist.id;
  const ownerId = stack.users.owner.id;

  for (const user of Object.values(stack.users))
    await db.user.update({ where: { id: user.id }, data: { permissions: JSON.stringify(rolePermissions(user.role)), phone: user.role === "DOCTOR" ? "9822000001" : undefined } });

  await db.branch.update({ where: { id: branchId }, data: { gstNumber: "27AAACL1234F1Z5", state: "Maharashtra" } });

  const rooms = [];
  for (const [name, type, capacity] of [["Consultation Room 1", "Consultation", 3], ["Consultation Room 2", "Consultation", 3], ["Procedure Room", "Procedure", 2]])
    rooms.push(await db.room.create({ data: { id: cid("room", rooms.length + 1), name, type, capacity, branchId } }));

  for (let weekday = 0; weekday < 7; weekday++)
    for (const [start, end] of weekday === 0 ? [[600, 780]] : [[540, 780], [840, 1080]])
      await db.doctorWorkingHours.create({ data: { branchId, doctorId, weekday, startMinute: start, endMinute: end } });

  const patients = [];
  for (const [i, [name, gender, dob, phone, address, pincode, allergies, medicalHistory]] of PATIENTS.entries())
    patients.push(await db.patient.create({
      data: {
        id: cid("patient", i + 1), patientCode: `UX${String(i + 1).padStart(3, "0")}`, name, gender, dob: new Date(dob), phone, address, city: "Pune", state: "Maharashtra", pincode,
        allergies, medicalHistory, consultationType: "OFFLINE", primaryDoctorId: i < 10 ? doctorId : null, branchId, createdAt: at(addDays(today, i < 10 ? -90 + i * 3 : -(12 - i)), "11:00"),
      },
    }));

  const course = (drug, inventory, dosage, frequency, duration, quantity, instructions) => ({
    drugName: drug.name, drugId: drug.drugId, inventoryItemId: inventory, dosage, dosageUnit: drug.form === "TABLET" ? "TABLET" : drug.form === "CAPSULE" ? "CAPSULE" : "APPLICATION",
    frequency, duration, durationUnit: "DAYS", quantity, instructions,
  });

  const medicines = [];
  for (const [i, [name, generic, form, strength, unit, mrp, gst, stock, min, manufacturer]] of MEDICINES.entries()) {
    const drug = await db.drug.create({ data: { id: cid("drug", i + 1), name, dosageForm: form[0] + form.slice(1).toLowerCase(), strength, price: mrp, manufacturerName: manufacturer, packSizeLabel: unit === "STRIPS" ? "10 per strip" : "1 unit", composition1: generic, category: "Dermatology", minStockLevel: min, branchId } });
    const batches = SECOND_BATCH.has(name) ? [[Math.ceil(stock * 0.6), 1, "2027-08-31"], [Math.floor(stock * 0.4), 2, "2028-02-29"]] : [[stock, 1, name === NEAR_EXPIRY ? addDays(today, 21) : `${2027 + (i % 2)}-${String(3 + (i % 9)).padStart(2, "0")}-28`]];
    let primary;
    for (const [qty, n, expiry] of batches) {
      const item = await db.inventoryItem.create({
        data: {
          id: cid("inv", `${i + 1}x${n}`), branchId, name, genericName: generic, brandName: name.split(" ")[0], form, strength, manufacturer, type: "MEDICINE", category: "Dermatology", costPrice: r2(mrp * 0.68), sellingPrice: mrp, mrp, unit,
          packSize: unit === "STRIPS" ? 10 : 1, currentStock: qty, minStockLevel: min, maxStockLevel: min * 6, reorderLevel: min, reorderQuantity: min * 3, expiryDate: new Date(`${expiry}T00:00:00Z`), batchNumber: `DM${String(i + 1).padStart(2, "0")}${n}25`,
          hsnCode: "30049099", gstRate: gst, requiresPrescription: ["Isotretinoin", "Doxycycline", "Fluconazole", "Terbinafine", "Clobetasol"].includes(generic), storageLocation: `Rack ${"ABC"[i % 3]}-${(i % 5) + 1}`, stockStatus: qty === 0 ? "OUT_OF_STOCK" : qty <= min ? "LOW_STOCK" : "IN_STOCK",
          status: "ACTIVE", drugs: { connect: { id: drug.id } },
        },
      });
      primary ||= item;
    }
    medicines.push({ id: primary.id, drugId: drug.id, name, form, mrp, gst, stock, generic });
  }
  const medicine = (name) => medicines.find((m) => m.name.startsWith(name));

  for (const [i, [name, gstNumber, drugLicenseNo, address, contactPerson, phone]] of DISTRIBUTORS.entries())
    await db.supplier.create({ data: { id: cid("supplier", i + 1), branchId, name, gstNumber, drugLicenseNo, address, city: "Pune", state: "Maharashtra", pincode: "411030", contactPerson, phone, paymentTerms: i ? "Net 15" : "Net 30" } });

  const visit = (patientIdx, day, time, complaint, diagnosis, extra = {}) =>
    db.visit.create({
      data: {
        patientId: patients[patientIdx].id, doctorId, complaints: JSON.stringify([{ complaint, duration: "3 weeks", severity: "Moderate" }]),
        vitals: JSON.stringify({ systolicBP: 118, diastolicBP: 76, heartRate: 74, temperature: 36.8, weight: 62 }), diagnosis: diagnosis ? JSON.stringify([{ diagnosis, type: "Primary" }]) : null,
        plan: JSON.stringify({ notes: "Review in 3 weeks. Sun protection advised." }), createdAt: at(day, time), ...extra,
      },
    });

  const earlierRx = [];
  for (const [i, [idx, ago, complaint, diagnosis, hasRx]] of EARLIER.entries()) {
    const day = addDays(today, -ago);
    const appt = await db.appointment.create({ data: { id: cid("apptold", i + 1), branchId, doctorId, patientId: patients[idx].id, date: new Date(day), slot: "10:00-10:15", status: "COMPLETED", tokenNumber: 1 + (i % 4), roomId: rooms[i % 2].id } });
    const v = await visit(idx, day, "10:05", complaint, diagnosis, { id: cid("visitold", i + 1), appointmentId: appt.id, status: "COMPLETED", completedAt: at(day, "10:20") });
    if (hasRx) {
      const picks = [medicine("Adapalene"), medicine("Cetirizine")];
      const rx = await db.prescription.create({ data: { id: cid("rxold", i + 1), visitId: v.id, status: "ACTIVE", createdAt: at(day, "10:18"), items: JSON.stringify(picks.map((m) => course(m, m.id, 1, "ONCE_DAILY", 14, 1, "After meals"))) } });
      earlierRx.push({ rx, patientIdx: idx, day, picks });
    }
  }

  const appointments = { today: [], tomorrow: [] };
  const todayVisits = {};
  for (const [slot, idx, status, visitType, token, roomIdx] of CLINIC_TODAY) {
    const appt = await db.appointment.create({
      data: { id: cid("appttoday", appointments.today.length + 1), branchId, doctorId, patientId: patients[idx].id, date: new Date(today), slot, status, visitType, tokenNumber: appointments.today.length + 1, roomId: rooms[visitType === "PROCEDURE" ? 2 : roomIdx].id, notes: visitType === "PROCEDURE" ? "Chemical peel, 2nd session" : null, source: idx % 3 ? "PHONE" : "WALK_IN" },
    });
    appointments.today.push({ id: appt.id, patientId: appt.patientId, patient: patients[idx].name, slot, status });
    if (status === "COMPLETED")
      todayVisits[idx] = await visit(idx, today, slot.slice(0, 5), visitType === "PROCEDURE" ? "Follow-up for chemical peel" : "Pimples on face and back", visitType === "PROCEDURE" ? "Post-inflammatory hyperpigmentation" : "Acne vulgaris", { id: cid("visittoday", idx + 1), appointmentId: appt.id, status: "COMPLETED", completedAt: new Date() });
    if (status === "IN_PROGRESS")
      todayVisits[idx] = await db.visit.create({ data: { id: cid("visittoday", idx + 1), patientId: patients[idx].id, doctorId, appointmentId: appt.id, complaints: JSON.stringify([{ complaint: "Itchy red patches on both arms", duration: "2 weeks" }]), vitals: JSON.stringify({ systolicBP: 112, diastolicBP: 72, heartRate: 78, temperature: 36.7 }) } });
  }
  for (const [slot, idx, status, token, roomIdx] of TOMORROW) {
    const appt = await db.appointment.create({ data: { id: cid("appttomorrow", appointments.tomorrow.length + 1), branchId, doctorId, patientId: patients[idx].id, date: new Date(tomorrow), slot, status, tokenNumber: token, roomId: rooms[roomIdx].id, source: "PHONE" } });
    appointments.tomorrow.push({ id: appt.id, patientId: appt.patientId, patient: patients[idx].name, slot, status });
  }

  const waitingMeds = [[medicine("Doxycycline"), "TWICE_DAILY", 30, 2], [medicine("Adapalene"), "ONCE_DAILY", 30, 1], [medicine("Sunscreen"), "ONCE_DAILY", 30, 1]];
  const waiting = await db.prescription.create({
    data: {
      id: cid("rxwaiting"), visitId: todayVisits[0].id, status: "ACTIVE", instructions: "Avoid picking at lesions. Use sunscreen daily. Review in 4 weeks.",
      items: JSON.stringify(waitingMeds.map(([m, frequency, duration, quantity]) => course(m, m.id, 1, frequency, duration, quantity, m.form === "GEL" ? "Apply a thin layer at night" : "After food"))),
    },
  });

  const bills = [];
  const bill = async (n, patientIdx, day, time, items, payments, extra = {}) => {
    const total = r2(items.reduce((s, [, , price, gst, qty = 1]) => s + qty * price * (1 + gst / 100), 0));
    const received = r2(payments.reduce((s, [, amount]) => s + amount, 0));
    const invoice = await db.newInvoice.create({
      data: {
        id: cid("invoice", n), invoiceNo: `INV-${day.replaceAll("-", "")}-${String(extra.seq ?? 1).padStart(3, "0")}`, patientId: patients[patientIdx].id, branchId, total, received, balance: r2(total - received), status: received >= total ? "PAID" : received ? "PARTIALLY_PAID" : extra.dueDate ? "OVERDUE" : "PENDING",
        mode: payments[0]?.[2] ?? null, dueDate: extra.dueDate ? at(extra.dueDate, "12:00") : null, createdAt: at(day, time), appointmentId: extra.appointmentId, visitId: extra.visitId,
        items: { create: items.map(([name, serviceId, price, gst, qty = 1]) => ({ serviceId, name, description: name, qty, unitPrice: price, gstRate: gst, total: price * qty })) },
        payments: { create: payments.map(([, amount, mode], j) => ({ amount, mode, reconStatus: "COMPLETED", createdAt: at(day, `${time.slice(0, 2)}:${String(Number(time.slice(3)) + 5 + j).padStart(2, "0")}`) })) },
      },
    });
    bills.push({ id: invoice.id, invoiceNo: invoice.invoiceNo, patient: patients[patientIdx].name, total, received, balance: invoice.balance });
    return invoice;
  };

  const services = [];
  for (const [i, [name, type, gstRate, price]] of SERVICES.entries())
    services.push(await db.service.create({ data: { id: cid("service", i + 1), name, type, taxable: gstRate > 0, gstRate, priceMrp: price, priceNet: price, branchId } }));
  const svc = (name) => services.find((s) => s.name === name);
  const line = (name, qty = 1) => [name, svc(name).id, svc(name).priceNet, svc(name).gstRate, qty];
  await bill(1, 0, today, "09:20", [line("Dermatology Consultation")], [["x", 500, "CASH"]], { appointmentId: appointments.today[0].id, visitId: todayVisits[0].id });
  await bill(2, 1, today, "10:05", [line("Chemical Peel")], [["x", 1500, "UPI"]], { appointmentId: appointments.today[1].id, visitId: todayVisits[1].id, seq: 2 });
  await bill(3, 3, addDays(today, -3), "12:10", [line("Review Consultation"), line("Wart Removal (Cautery)")], [["x", 2424, "UPI"]]);
  await bill(4, 5, addDays(today, -5), "17:40", [line("Skin Glow Facial")], [], { dueDate: addDays(today, -2) });
  for (const [periodKey, lastNumber] of [[today.replaceAll("-", ""), 2], [addDays(today, -3).replaceAll("-", ""), 1], [addDays(today, -5).replaceAll("-", ""), 1]])
    await db.numberSequence.create({ data: { type: "BILLING", branchId, periodKey, lastNumber } });

  for (const [billType, amount] of [["FIRST_CONSULTATION", 700], ["REVIEW", 400], ["PROCEDURE", 2500]])
    await db.clinicFee.create({ data: { branchId, billType, amount, updatedById: ownerId } });
  for (const name of ["CBC", "Skin biopsy", "KOH mount", "Patch test", "Serum IgE"])
    await db.clinicInvestigation.create({ data: { branchId, name, normalizedName: name.toLowerCase(), createdById: doctorId } });

  const year = today.slice(0, 4);
  const sales = [
    [1, 7, 0, [["Doxycycline", 2], ["Cetirizine", 1]], "CASH", 0.1],
    [2, 6, 3, [["Clobetasol", 1], ["Luliconazole", 1], ["Terbinafine", 2]], "UPI", 0],
    [3, 5, 2, [["Isotretinoin", 3]], "CARD", 0],
    [4, 3, 4, [["Minoxidil", 1], ["Ketoconazole", 1]], "UPI", 0],
    [5, 1, 5, [["Adapalene", 1], ["Sunscreen", 1], ["Benzoyl", 1]], "CASH", 0],
    [6, 0, 4, [["Mometasone", 1], ["Cetirizine", 2]], "UPI", 0],
  ];
  const saleIds = [];
  for (const [n, ago, patientIdx, lines, method] of sales) {
    const day = addDays(today, -ago);
    const time = `${String(9 + (n % 3)).padStart(2, "0")}:${10 + n * 7}`;
    const rows = lines.map(([name, qty]) => {
      const m = medicine(name);
      const gross = r2(m.mrp * qty);
      const tax = r2((gross * m.gst) / (100 + m.gst));
      return { m, qty, gross, tax };
    });
    const total = r2(rows.reduce((s, r) => s + r.gross, 0));
    const taxAmount = r2(rows.reduce((s, r) => s + r.tax, 0));
    const earlier = earlierRx.find((e) => e.patientIdx === patientIdx);
    const inv = await db.pharmacyInvoice.create({
      data: {
        id: cid("sale", n), invoiceNumber: `PHI-${year}-${String(n).padStart(3, "0")}`, patientId: patients[patientIdx].id, doctorId, branchId, createdById: pharmacistId, prescriptionId: earlier?.rx.id,
        subtotal: r2(total - taxAmount), taxAmount, totalAmount: total, paymentMethod: method, paymentStatus: "COMPLETED", paidAmount: total, balanceAmount: 0, billingName: patients[patientIdx].name, billingPhone: patients[patientIdx].phone,
        billingCity: "Pune", status: "COMPLETED", invoiceDate: at(day, time), createdAt: at(day, time),
        items: { create: rows.map(({ m, qty, gross, tax }) => ({ drugId: m.drugId, inventoryItemId: m.id, quantity: qty, unitPrice: m.mrp, taxPercent: m.gst, taxAmount: tax, totalAmount: gross })) },
        payments: { create: [{ method, amount: total, status: "COMPLETED", paymentDate: at(day, time) }] },
      },
    });
    saleIds.push({ id: inv.id, invoiceNumber: inv.invoiceNumber, patient: patients[patientIdx].name, total });
  }
  await db.numberSequence.create({ data: { type: "PHARMACY", branchId, periodKey: year, lastNumber: sales.length } });

  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.purchase_recovery_protocol', '2', true)");
    const purchases = [
      [0, "SLP/26/1184", 12, [["Doxycycline", 40], ["Adapalene", 30], ["Cetirizine", 60]], "PAID"],
      [1, "AMA/2288", 20, [["Mometasone", 24], ["Sunscreen", 20], ["Minoxidil", 12]], "CREDIT"],
    ];
    for (const [d, number, ago, lines, billType] of purchases) {
      const day = addDays(today, -ago);
      const rows = lines.map(([name, qty], j) => {
        const m = medicine(name);
        const rate = r2(m.mrp * 0.68);
        const taxable = r2(rate * qty);
        const gst = r2((taxable * m.gst) / 100);
        return { m, qty, rate, taxable, gst, line: j + 1 };
      });
      const taxable = r2(rows.reduce((s, r) => s + r.taxable, 0));
      const gst = r2(rows.reduce((s, r) => s + r.gst, 0));
      await tx.pharmacyPurchaseInvoice.create({
        data: {
          id: cid("purchase", d + 1), branchId, createdBy: pharmacistId, supplierId: cid("supplier", d + 1), distributorName: DISTRIBUTORS[d][0], distributorGstin: DISTRIBUTORS[d][1], distributorDlNo: DISTRIBUTORS[d][2],
          invoiceNumber: number, invoiceDate: at(day, "10:00"), goodsReceivedDate: at(day, "15:00"), createdAt: at(day, "15:30"), billType: billType === "PAID" ? "CASH" : "CREDIT", dueDate: billType === "PAID" ? null : at(addDays(today, -5), "12:00"),
          doctorNameOrRegNo: doctorName, status: "STOCK_COMMITTED", stockCommittedAt: at(day, "15:45"), grossAmount: taxable, taxableAmount: taxable, totalCgst: r2(gst / 2), totalSgst: r2(gst / 2), totalGst: gst, netPayable: r2(taxable + gst),
          items: {
            create: rows.map((r) => ({
              lineNumber: r.line, inventoryItemId: r.m.id, productName: r.m.name, manufacturer: "Various", packSize: "1", packUnitType: "PIECE", hsnCode: "30049099", batchNumber: `PB${d}${r.line}`, expiryMonth: 6, expiryYear: 2028, quantityPurchased: r.qty, mrp: r.m.mrp,
              discountPercent: 0, purchaseRate: r.rate, taxableAmount: r.taxable, cgstPercent: r.m.gst / 2, sgstPercent: r.m.gst / 2, gstAmount: r.gst, lineTotal: r2(r.taxable + r.gst),
            })),
          },
        },
      });
      if (billType === "PAID")
        await tx.pharmacyPurchasePayment.create({
          data: {
            branchId, distributorGstin: DISTRIBUTORS[d][1], distributorName: DISTRIBUTORS[d][0], paymentDate: at(day, "16:00"), mode: "CASH", paidBy: pharmacistId, amount: r2(taxable + gst),
            allocations: { create: [{ purchaseInvoiceId: cid("purchase", d + 1), amount: r2(taxable + gst) }] },
          },
        });
    }
  }, { timeout: 60000, maxWait: 30000 });

  return {
    today, tomorrow, branch: { id: branchId, name: stack.branch.name },
    patients: patients.map((p) => ({ id: p.id, name: p.name, phone: p.phone })),
    newPatients: [patients[10], patients[11]].map((p) => ({ id: p.id, name: p.name })),
    firstTimePatientToday: { id: patients[6].id, name: patients[6].name },
    doctor: { id: doctorId, name: doctorName },
    rooms: rooms.map((r) => ({ id: r.id, name: r.name, type: r.type })),
    appointments,
    inProgress: { appointmentId: appointments.today[2].id, visitId: todayVisits[2].id, patient: patients[2].name },
    medicines: medicines.map((m) => ({ id: m.id, name: m.name, stock: m.stock })),
    medicineStates: { outOfStock: medicine("Clobetasol").name, low: [medicine("Tretinoin").name, medicine("Ketoconazole").name], nearExpiry: NEAR_EXPIRY },
    waitingPrescription: { id: waiting.id, visitId: todayVisits[0].id, appointmentId: appointments.today[0].id, patientId: patients[0].id, patient: patients[0].name, medicines: waitingMeds.map(([m]) => ({ id: m.id, name: m.name })) },
    suppliers: DISTRIBUTORS.map(([name], i) => ({ id: cid("supplier", i + 1), name })),
    services: services.map((s) => ({ id: s.id, name: s.name, type: s.type, price: s.priceNet })),
    fees: { FIRST_CONSULTATION: 700, REVIEW: 400, PROCEDURE: 2500 },
    invoices: { clinic: bills, pharmacy: saleIds, purchases: [cid("purchase", 1), cid("purchase", 2)] },
  };
}

module.exports = { seed };
