// Fills the guide stack with a believable clinic day. Run once against a fresh `serve.cjs` stack.
const { stack, api, db: openDb } = require("./lib.cjs");

const IST = "+05:30";
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const pad = (n, w = 2) => String(n).padStart(w, "0");
const today = new Date(Date.now() + 19800000).toISOString().slice(0, 10);
const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const at = (day, time) => new Date(`${day}T${time}:00${IST}`);

const PATIENTS = [
  ["Meera Shah", "F", 29, "9876543210", "Banjara Hills, Hyderabad"],
  ["Ravi Kumar", "M", 41, "9000000001", "Kukatpally, Hyderabad"],
  ["Anjali Kulkarni", "F", 34, "9765400123", "Madhapur, Hyderabad"],
  ["Arjun Reddy", "M", 23, "9440011223", "Gachibowli, Hyderabad"],
  ["Sunita Sharma", "F", 52, "9876598765", "Secunderabad"],
  ["Vikram Singh", "M", 37, "9811122334", "Jubilee Hills, Hyderabad"],
  ["Pooja Deshpande", "F", 26, "9765400124", "Kondapur, Hyderabad"],
  ["Mohammed Irfan Khan", "M", 45, "9930077441", "Tolichowki, Hyderabad"],
  ["Lakshmi Venkataraman", "F", 61, "9884455667", "Begumpet, Hyderabad"],
  ["Neha Agarwal", "F", 31, "9810099887", "Hitech City, Hyderabad"],
  ["Rahul Bhatt", "M", 19, "9820123987", "Miyapur, Hyderabad"],
  ["Divya Pillai", "F", 28, "9847012345", "Manikonda, Hyderabad"],
  ["Harish Mishra", "M", 56, "9415566778", "Ameerpet, Hyderabad"],
  ["Kavya Rao", "F", 8, "9895123456", "Banjara Hills, Hyderabad"],
];

// name, rack, stock, price, GST %, HSN, manufacturer, expiry, min level
const ITEMS = [
  ["Adapalene Gel 0.1% 15 g", "A-01", 42, 180, 12, "30049099", "Galderma", "2028-03-31", 10],
  ["Azelaic Acid Cream 20% 15 g", "A-02", 18, 320, 12, "30049099", "Glenmark", "2027-11-30", 8],
  ["Benzoyl Peroxide Gel 2.5% 20 g", "A-03", 35, 145, 12, "30049099", "Galderma", "2027-08-31", 10],
  ["Calamine Lotion 100 ml", "B-01", 60, 95, 12, "30049011", "Lacto Calamine", "2028-01-31", 15],
  ["Cetirizine 10 mg Tablet", "B-02", 240, 3.5, 5, "30049099", "Cipla", "2028-06-30", 60],
  ["Clindamycin Gel 1% 20 g", "B-03", 4, 165, 12, "30049099", "Cipla", "2027-05-31", 10],
  ["Clobetasol Cream 0.05% 15 g", "C-01", 22, 110, 12, "30049099", "GSK", "2027-02-28", 8],
  ["Doxycycline 100 mg Capsule", "C-02", 180, 9, 5, "30049099", "Sun Pharma", "2027-09-30", 50],
  ["Fluconazole 150 mg Tablet", "C-03", 56, 28, 5, "30049099", "Cipla", "2027-01-31", 20],
  ["Isotretinoin 10 mg Capsule", "D-01", 300, 36, 5, "30049099", "Cipla", "2026-12-31", 60],
  ["Ketoconazole Shampoo 2% 100 ml", "D-02", 14, 290, 18, "33051090", "Dr. Reddy's", "2028-04-30", 6],
  ["Luliconazole Cream 1% 20 g", "D-03", 0, 240, 12, "30049099", "Sun Pharma", "2027-07-31", 8],
  ["Minoxidil Solution 5% 60 ml", "E-01", 9, 720, 12, "30049099", "Dr. Reddy's", "2027-10-31", 10],
  ["Mometasone Cream 0.1% 15 g", "E-02", 27, 135, 12, "30049099", "Glenmark", "2026-12-15", 8],
  ["Niacinamide Serum 10% 30 ml", "F-01", 16, 650, 18, "33049990", "Linaé Labs", "2028-02-29", 6],
  ["Sunscreen SPF 50 Lotion 50 ml", "F-02", 48, 450, 18, "33049910", "Linaé Labs", "2028-05-31", 12],
  ["Salicylic Acid Face Wash 100 ml", "F-03", 31, 310, 18, "34013019", "Linaé Labs", "2028-03-31", 10],
  ["Tacrolimus Ointment 0.1% 10 g", "G-01", 12, 410, 12, "30049099", "Glenmark", "2027-06-30", 6],
];

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

(async () => {
  const db = openDb();
  const branchId = stack.branchId;
  const doctorId = stack.users.doctor.id;
  const pharmacistId = stack.users.pharmacist.id;

  await db.branch.update({
    where: { id: branchId },
    data: { name: "Linaé Skin, Hair & Aesthetic Clinic", address: "8-2-293 Road No. 12, Banjara Hills, Hyderabad 500034", gstNumber: "36AAACL1234F1Z5", state: "Telangana" },
  });

  const owner = await db.user.findUnique({ where: { id: stack.users.owner.id } });
  const extra = async (email, firstName, lastName, role) =>
    db.user.create({ data: { branchId, email, firstName, lastName, role, password: owner.password, permissions: owner.permissions } });
  const doctor2 = await extra("arvind.shetty@stack.example.invalid", "Arvind", "Shetty", "DOCTOR");
  await extra("asha.kulkarni@stack.example.invalid", "Asha", "Kulkarni", "NURSE");

  const patients = [];
  for (const [name, gender, age, phone, address] of PATIENTS)
    patients.push(await api("admin", "POST", "/patients", { name, gender, age, phone, address, city: "Hyderabad", state: "Telangana" }));
  console.log(`patients: ${patients.length}`);

  const rooms = [];
  for (const [name, type, capacity] of [["Consultation Room 1", "Consultation", 3], ["Consultation Room 2", "Consultation", 3], ["Laser Suite", "Procedure", 4], ["Minor Procedure Room", "Procedure", 4]])
    rooms.push(await api("admin", "POST", "/appointments/rooms", { name, type, capacity, isActive: true }));
  console.log(`rooms: ${rooms.length}`);

  for (const [type, amount] of [["FIRST_CONSULTATION", 800], ["REVIEW", 500], ["PROCEDURE", 2500]])
    await api("admin", "PUT", `/billing/fees/${type}`, { amount, version: 0 }).catch((e) => console.log(`fee ${type}: ${e.message}`));

  const items = [];
  await db.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe("SELECT set_config('app.purchase_recovery_protocol', '2', true)");
      for (const [name, rack, stock, price, rate, hsn, maker, expiry, min] of ITEMS) {
        const id = `guide-${slug(name)}`;
        await tx.drug.create({ data: { id: `${id}-drug`, name, price, manufacturerName: maker, packSizeLabel: "1", branchId } });
        await tx.inventoryItem.create({
          data: {
            id, branchId, name, type: "MEDICINE", costPrice: r2(price * 0.62), sellingPrice: price, mrp: price, unit: "PIECES", manufacturer: maker,
            currentStock: stock, minStockLevel: min, maxStockLevel: min * 6, reorderLevel: min * 2, storageLocation: `Rack ${rack}`, batchNumber: `LN${rack.replace("-", "")}26`,
            stockStatus: stock === 0 ? "OUT_OF_STOCK" : stock <= min ? "LOW_STOCK" : "IN_STOCK", hsnCode: hsn, gstRate: rate, expiryDate: new Date(expiry), drugs: { connect: { id: `${id}-drug` } },
          },
        });
        items.push({ id, name, price, rate, hsn });
      }

      let n = 0;
      const bill = async (day, time, lines, payments, status = "CONFIRMED", patient) => {
        n += 1;
        const rows = lines.map(([item, qty, disc = 0]) => {
          const gross = r2(qty * item.price);
          const discountAmount = r2((gross * disc) / 100);
          const taxAmount = r2(((gross - discountAmount) * item.rate) / 100);
          return { item, qty, disc, gross, discountAmount, taxAmount, total: r2(gross - discountAmount + taxAmount) };
        });
        const total = r2(rows.reduce((s, i) => s + i.total, 0));
        await tx.pharmacyInvoice.create({
          data: {
            id: `guide-bill-${n}`, invoiceNumber: `PHI-2026-${pad(n, 3)}`, patientId: patient.id, doctorId, branchId, createdById: pharmacistId,
            subtotal: r2(rows.reduce((s, i) => s + i.gross, 0)), discountAmount: r2(rows.reduce((s, i) => s + i.discountAmount, 0)), taxAmount: r2(rows.reduce((s, i) => s + i.taxAmount, 0)), totalAmount: total,
            paymentMethod: payments[0]?.[0] || "CASH", billingName: patient.name, billingPhone: patient.phone, status, invoiceDate: at(day, time), createdAt: at(day, time),
            items: { create: rows.map((i) => ({ drugId: `${i.item.id}-drug`, inventoryItemId: i.item.id, quantity: i.qty, unitPrice: i.item.price, discountPercent: i.disc, discountAmount: i.discountAmount, taxPercent: i.item.rate, taxAmount: i.taxAmount, totalAmount: i.total })) },
            payments: { create: payments.map(([method, share]) => ({ method, amount: r2(total * share), status: "COMPLETED", paymentDate: at(day, time) })) },
          },
        });
      };

      const start = addDays(today, -42);
      for (let d = 0; d < 42; d++) {
        const day = addDays(start, d);
        if (new Date(`${day}T00:00:00Z`).getUTCDay() === 0) continue;
        for (let k = 0; k < 1 + (d % 3); k++) {
          const a = items[(d * 3 + k) % items.length];
          const b = items[(d * 5 + k * 7 + 2) % items.length];
          const pay = (d + k) % 5 === 0 ? [["CASH", 0.5], ["UPI", 0.5]] : [[["UPI", "CASH", "CARD"][(d + k) % 3], 1]];
          await bill(day, `${pad(10 + ((d + k * 3) % 8))}:${pad((d * 7 + k * 13) % 60)}`, [[a, 1 + ((d + k) % 3), d % 4 === 0 ? 10 : 0], [b, 1]], pay, d === 20 && k === 0 ? "CANCELLED" : "CONFIRMED", patients[(d + k * 2) % patients.length]);
        }
      }
      await bill(today, "09:40", [[items[0], 1], [items[15], 1]], [["UPI", 1]], "CONFIRMED", patients[0]);
      await bill(today, "10:15", [[items[9], 30], [items[3], 1]], [["CASH", 1]], "CONFIRMED", patients[3]);
      await bill(today, "10:50", [[items[14], 1], [items[16], 1, 10]], [["CARD", 0.5]], "CONFIRMED", patients[9]);

      // New bills take the next number from this counter, so it has to start after the seeded ones.
      await tx.numberSequence.upsert({
        where: { type_branchId_periodKey: { type: "PHARMACY", branchId, periodKey: today.slice(0, 4) } },
        create: { type: "PHARMACY", branchId, periodKey: today.slice(0, 4), lastNumber: n },
        update: { lastNumber: n },
      });

      const purchases = [
        ["SSP/26-27/1182", "Sri Sai Pharma Distributors", "36AAAAA0000A1Z5", [[0, 40], [2, 30], [5, 20]], -38, 6, 6, 0, true],
        ["MDS-4471", "Mumbai Derma Supplies", "27BBBBB1111B1Z5", [[14, 24], [15, 48], [16, 36]], -31, 0, 0, 18, true],
        ["SSP/26-27/1240", "Sri Sai Pharma Distributors", "36AAAAA0000A1Z5", [[9, 300], [7, 200], [4, 300]], -24, 2.5, 2.5, 0, true],
        ["HYD/8821", "Hyderabad Medical Agencies", "36CCCCC2222C1Z5", [[6, 24], [13, 30], [17, 12]], -15, 6, 6, 0, false],
        ["MDS-4630", "Mumbai Derma Supplies", "27BBBBB1111B1Z5", [[10, 18], [12, 12]], -6, 0, 0, 18, false],
      ];
      for (const [i, [number, name, gstin, lines, offset, c, s, ig]] of purchases.entries()) {
        const day = addDays(today, offset);
        const rows = lines.map(([index, qty], line) => {
          const item = items[index];
          const rate = r2(item.price * 0.62);
          const taxable = r2(rate * qty);
          return { item, qty, rate, taxable, cgst: r2((taxable * c) / 100), sgst: r2((taxable * s) / 100), igst: r2((taxable * ig) / 100), line: line + 1 };
        });
        const taxable = r2(rows.reduce((t, r) => t + r.taxable, 0));
        const cgst = r2(rows.reduce((t, r) => t + r.cgst, 0)), sgst = r2(rows.reduce((t, r) => t + r.sgst, 0)), igst = r2(rows.reduce((t, r) => t + r.igst, 0));
        await tx.pharmacyPurchaseInvoice.create({
          data: {
            id: `guide-purchase-${i}`, branchId, distributorName: name, distributorGstin: gstin, distributorDlNo: `TS/HYD/20B-${4410 + i}`, invoiceNumber: number, invoiceDate: at(day, "10:00"), createdAt: at(day, "11:00"),
            billType: "CREDIT", doctorNameOrRegNo: "Dr. Priya Menon", status: "STOCK_COMMITTED", grossAmount: taxable, taxableAmount: taxable, totalCgst: cgst, totalSgst: sgst, totalIgst: igst, totalGst: r2(cgst + sgst + igst), netPayable: r2(taxable + cgst + sgst + igst),
            items: {
              create: rows.map((r) => ({
                lineNumber: r.line, productName: r.item.name, manufacturer: "", packSize: "1", packUnitType: "PIECE", hsnCode: r.item.hsn, batchNumber: `B${i}${r.line}26`, expiryMonth: 6, expiryYear: 2028, quantityPurchased: r.qty,
                inventoryItemId: r.item.id, mrp: r.item.price, discountPercent: 0, purchaseRate: r.rate, taxableAmount: r.taxable, cgstPercent: c, sgstPercent: s, igstPercent: ig, gstAmount: r2(r.cgst + r.sgst + r.igst), lineTotal: r2(r.taxable + r.cgst + r.sgst + r.igst),
              })),
            },
          },
        });
      }
    },
    { timeout: 180000, maxWait: 30000 },
  );
  console.log(`items: ${items.length}, bills and purchases seeded`);

  // Earlier visits, so patient history, reports and the pharmacy queue have something to show.
  const rx = (drugName, frequency, duration, instructions, quantity) => ({ drugName, dosage: 1, dosageUnit: "TABLET", frequency, duration, durationUnit: "DAYS", instructions, quantity });
  const history = [
    [0, -28, "Acne on the cheeks and forehead for 6 months", "Acne vulgaris, grade 2", [rx(ITEMS[0][0], "ONCE_DAILY", 30, "Apply a pea-sized amount at night"), rx(ITEMS[7][0], "ONCE_DAILY", 14, "After food", 14)]],
    [1, -21, "Itchy red patches on both elbows", "Chronic plaque psoriasis", [rx(ITEMS[6][0], "TWICE_DAILY", 14, "Apply thinly on the patches"), rx(ITEMS[4][0], "ONCE_DAILY", 10, "At bedtime", 10)]],
    [2, -14, "Dark patches on the cheeks", "Melasma", [rx(ITEMS[15][0], "TWICE_DAILY", 30, "Reapply every 3 hours outdoors"), rx(ITEMS[1][0], "ONCE_DAILY", 30, "Apply at night")]],
    [4, -9, "Hair fall for 4 months", "Telogen effluvium", [rx(ITEMS[12][0], "TWICE_DAILY", 60, "1 ml on a dry scalp")]],
    [5, -3, "Ring-shaped itchy rash in the groin", "Tinea cruris", [rx(ITEMS[8][0], "ONCE_DAILY", 2, "Once a week for 2 weeks", 2), rx(ITEMS[3][0], "TWICE_DAILY", 14, "Apply on the rash")]],
    [0, -1, "Acne review, new lesions fewer", "Acne vulgaris, improving", [rx(ITEMS[0][0], "ONCE_DAILY", 30, "Continue at night"), rx(ITEMS[9][0], "ONCE_DAILY", 30, "After dinner", 30)]],
  ];
  const visits = [];
  for (const [p, offset, complaint, diagnosis, medicines] of history) {
    const patient = patients[p];
    const visit = await api("doctor", "POST", "/visits", {
      patientId: patient.id, doctorId,
      vitals: { systolicBP: 118, diastolicBP: 76, heartRate: 74, weight: 62, height: 164 },
      complaints: [{ complaint }], diagnosis: [{ diagnosis }],
    });
    await api("doctor", "POST", "/prescriptions", { patientId: patient.id, visitId: visit.id, doctorId, items: medicines, diagnosis, followUpInstructions: "Review in 4 weeks. Use sunscreen daily." }, { "Idempotency-Key": `guide-rx-${visit.id}` })
      .catch((e) => console.log(`prescription for ${patient.name}: ${e.message}`));
    const when = at(addDays(today, offset), "11:30");
    await db.visit.update({ where: { id: visit.id }, data: { createdAt: when } }).catch(() => {});
    await db.prescription.updateMany({ where: { visitId: visit.id }, data: { createdAt: when } }).catch(() => {});
    visits.push(visit.id);
  }
  console.log(`visits: ${visits.length}`);

  // Today's calendar for Dr. Priya Menon, plus two patients with Dr. Arvind Shetty.
  let token = 0;
  const book = async (p, slot, visitType, room, status, doctor = doctorId, notes, day = today) =>
    db.appointment.create({
      data: { patientId: patients[p].id, doctorId: doctor, roomId: rooms[room].id, branchId, date: new Date(`${day}T00:00:00Z`), slot, visitType, status, notes, tokenNumber: ++token },
    });
  const booked = [];
  booked.push(await book(6, "10:00-10:30", "OPD", 0, "COMPLETED"));
  booked.push(await book(7, "10:30-11:00", "OPD", 0, "CHECKED_IN"));
  booked.push(await book(8, "11:30-12:00", "OPD", 0, "CONFIRMED", doctorId, "Prefers a morning slot"));
  booked.push(await book(10, "12:00-12:30", "OPD", 0, "CONFIRMED"));
  booked.push(await book(11, "14:00-14:30", "PROCEDURE", 2, "SCHEDULED", doctorId, "Laser hair reduction, session 3"));
  booked.push(await book(12, "15:00-15:30", "OPD", 0, "SCHEDULED"));
  booked.push(await book(13, "16:30-17:00", "OPD", 0, "SCHEDULED", doctorId, "Child. Parent will accompany"));
  booked.push(await book(2, "11:00-11:30", "OPD", 1, "COMPLETED", doctor2.id));
  booked.push(await book(9, "15:30-16:00", "PROCEDURE", 3, "SCHEDULED", doctor2.id, "Chemical peel"));
  for (const offset of [1, 2, 3]) await book(offset, "10:30-11:00", "OPD", 0, "SCHEDULED", doctorId, undefined, addDays(today, offset));
  console.log(`appointments: ${booked.filter(Boolean).length}`);

  require("node:fs").writeFileSync(
    require("node:path").join(__dirname, "../../output/stack/guide/seed.json"),
    JSON.stringify({ today, patients: patients.map((p) => ({ id: p.id, name: p.name })), rooms: rooms.map((r) => ({ id: r.id, name: r.name })), visits, appointments: booked.filter(Boolean).map((a) => a.id), doctor2: doctor2.id }, null, 2),
  );
  await db.$disconnect();
  console.log("seed complete");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
