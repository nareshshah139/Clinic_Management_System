const { api, tokenFor, browserLogin, addUser } = require("./cr31-seed.cjs");

const RECORDED = [
  { key: "flutas", name: "13 74 | Flutas 150Mg(Pc)", unit: "STRIPS", stock: 30, drug: { name: "Flutas 150", dosageForm: "Tablet" } },
  { key: "zimba", name: "244 | Zimba Cream", unit: "TUBES", stock: 12 },
  { key: "bact", name: "1-Bact Oin", unit: "TUBES", stock: 9 },
  { key: "cwin", name: "293 | Cwin Lotion 30Ml", unit: "BOTTLES", stock: 6 },
  { key: "sotret", name: "242 | Sotret 10Mg Cap", unit: "STRIPS", stock: 20 },
  { key: "antoxid", name: "1 Antoxid-Hc Capsules 30S (loose capsules)", unit: "STRIPS", stock: 15, genericName: "Beta carotene + Ascorbic acid + Zinc", drug: { name: "Antoxid HC", dosageForm: "Capsule" } },
  { key: "acnosis", name: "199 | Acnosis Tab (loose tablets)", unit: "STRIPS", stock: 18, drug: { name: "Acnosis", dosageForm: "Tablet" } },
  { key: "teczine", name: "1100 | Teczine Syrup 2.5Mg/5Ml 60Ml", unit: "BOTTLES", stock: 8 },
  { key: "augmentin", name: "Augmentin 500mg 125mg Tab", unit: "STRIPS", stock: 10 },
  { key: "cotton", name: "Cotton roll", unit: "PACKS", stock: 25, type: "CONSUMABLE" },
];

async function seed(stack) {
  const db = stack.db;
  const branchId = stack.branch.id;
  await addUser(stack, "admin", { role: "ADMIN", firstName: "Asha", lastName: "Rao", permissions: [] });
  const items = {};
  for (const [index, row] of RECORDED.entries()) {
    const item = await db.inventoryItem.create({
      data: {
        branchId, name: row.name, type: row.type || "MEDICINE", unit: row.unit, genericName: row.genericName || null,
        costPrice: 20 + index, sellingPrice: 40 + index * 3, mrp: 45 + index * 3, gstRate: 12, currentStock: row.stock, packSize: 10,
        batchNumber: `CR11-${String(index + 1).padStart(2, "0")}`, expiryDate: new Date("2027-12-31T23:59:59.999Z"),
        stockStatus: "IN_STOCK", storageLocation: `Rack ${String.fromCharCode(65 + index)}-1`, status: "ACTIVE", hsnCode: "30049099",
      },
    });
    if (row.drug)
      await db.drug.create({
        data: { branchId, name: row.drug.name, dosageForm: row.drug.dosageForm, price: item.sellingPrice, manufacturerName: "Lakshmi Pharma", packSizeLabel: "10 per strip", inventoryItems: { connect: { id: item.id } } },
      });
    items[row.key] = item;
  }
  const patient = (name, phone) => db.patient.create({ data: { branchId, name, gender: "F", phone } });
  const meera = await patient("Meera Shah", "9876500011");
  const pooja = await patient("Pooja Menon", "9876500012");
  const kiran = await patient("Kiran Bhatt", "9876500013");
  const visit = (forPatient, complaints) => db.visit.create({ data: { patientId: forPatient.id, doctorId: stack.users.doctor.id, complaints } });
  const newVisit = await visit(meera, "Itchy ring-shaped patches on the waist");
  const phoneVisit = await visit(pooja, "Acne on cheeks");
  const oldVisit = await visit(kiran, "Fungal infection, review");
  const oldPrescription = await db.prescription.create({
    data: {
      visitId: oldVisit.id, status: "ACTIVE", createdAt: new Date("2026-09-20T05:00:00Z"),
      items: JSON.stringify([
        { drugName: "13 74 | Flutas 150Mg(Pc)", dosage: 1, dosageUnit: "TABLET", frequency: "ONCE_WEEKLY", duration: 4, durationUnit: "WEEKS", quantity: 4 },
        { drugName: "1 Antoxid-Hc Capsules 30S (loose capsules)", dosage: 1, dosageUnit: "CAPSULE", frequency: "ONCE_DAILY", duration: 30, durationUnit: "DAYS", quantity: 30 },
      ]),
    },
  });
  return { items, patients: { meera, pooja, kiran }, visits: { newVisit, phoneVisit, oldVisit }, oldPrescription };
}

module.exports = { seed, api, tokenFor, browserLogin, RECORDED };
