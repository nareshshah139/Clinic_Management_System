// Idempotent fake-data seed for the voice UX review. Demo database only.
// Run AFTER seed-once.ts. Usage (from anywhere):
//   DATABASE_URL=postgresql://<user>@localhost:5432/cms_ux_voice_20261116 \
//     node docs/ux-auto-improve/voice-bar/notes/seed-voice.mjs
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../../../backend/package.json', import.meta.url));
const { PrismaClient } = require('@prisma/client');

const url = process.env.DATABASE_URL || '';
if (!/cms_ux_voice_/.test(url)) {
  console.error('Refusing to run: DATABASE_URL must point at a cms_ux_voice_* database.');
  process.exit(1);
}
const prisma = new PrismaClient();

const today = new Date();
today.setHours(0, 0, 0, 0);

const patients = [
  { code: 'V0001', name: 'Meera Iyer', gender: 'FEMALE', age: 34, phone: '9845012301' },
  { code: 'V0002', name: 'Rahul Deshmukh', gender: 'MALE', age: 41, phone: '9845012302' },
  { code: 'V0003', name: 'Ananya Reddy', gender: 'FEMALE', age: 27, phone: '9845012303' },
  { code: 'V0004', name: 'Imran Qureshi', gender: 'MALE', age: 52, phone: '9845012304' },
  { code: 'V0005', name: 'Kavitha Nair', gender: 'FEMALE', age: 46, phone: '9845012305' },
  { code: 'V0006', name: 'Suresh Patil', gender: 'MALE', age: 38, phone: '9845012306' },
];

const slots = ['09:30-10:00', '10:00-10:30', '10:30-11:00', '11:30-12:00', '12:00-12:30', '15:00-15:30'];
const statuses = ['COMPLETED', 'IN_PROGRESS', 'CHECKED_IN', 'CONFIRMED', 'SCHEDULED', 'SCHEDULED'];

const inventory = [
  { sku: 'VX-TRET-005', name: 'Tretinoin 0.05% cream', generic: 'Tretinoin', type: 'MEDICINE', unit: 'TUBES', stock: 14, cost: 92, sell: 145, batch: 'TR2406', exp: '2027-08-31', loc: 'Shelf A-02' },
  { sku: 'VX-ADAP-01', name: 'Adapalene 0.1% gel 15 g', generic: 'Adapalene', type: 'MEDICINE', unit: 'TUBES', stock: 22, cost: 78, sell: 120, batch: 'AD2311', exp: '2027-05-31', loc: 'Shelf A-03' },
  { sku: 'VX-AZI-500', name: 'Azithromycin 500 mg', generic: 'Azithromycin', type: 'MEDICINE', unit: 'STRIPS', stock: 40, cost: 58, sell: 86, batch: 'AZ9921', exp: '2027-02-28', loc: 'Shelf B-01' },
  { sku: 'VX-DOXY-100', name: 'Doxycycline 100 mg', generic: 'Doxycycline', type: 'MEDICINE', unit: 'STRIPS', stock: 6, cost: 41, sell: 64, batch: 'DX1187', exp: '2026-12-31', loc: 'Shelf B-02' },
  { sku: 'VX-CETI-10', name: 'Cetirizine 10 mg', generic: 'Cetirizine', type: 'MEDICINE', unit: 'STRIPS', stock: 55, cost: 12, sell: 22, batch: 'CT4410', exp: '2027-11-30', loc: 'Shelf B-04' },
  { sku: 'VX-SUN-50', name: 'Sunscreen SPF 50 gel 50 g', generic: 'Sunscreen', type: 'MEDICINE', unit: 'TUBES', stock: 3, cost: 310, sell: 495, batch: 'SN7702', exp: '2027-03-31', loc: 'Shelf C-01' },
  { sku: 'VX-NEEDLE-30', name: 'Disposable needle 30G', generic: null, type: 'CONSUMABLE', unit: 'BOXES', stock: 9, cost: 140, sell: 0, batch: 'ND0021', exp: '2028-01-31', loc: 'Store 1' },
  { sku: 'VX-GLOVE-M', name: 'Nitrile gloves, medium', generic: null, type: 'CONSUMABLE', unit: 'BOXES', stock: 18, cost: 260, sell: 0, batch: 'GL5543', exp: '2028-06-30', loc: 'Store 1' },
  { sku: 'VX-KETO-2', name: 'Ketoconazole 2% shampoo 100 ml', generic: 'Ketoconazole', type: 'MEDICINE', unit: 'BOTTLES', stock: 0, cost: 118, sell: 185, batch: 'KT3308', exp: '2027-01-31', loc: 'Shelf C-03' },
  { sku: 'VX-CLOB-05', name: 'Clobetasol 0.05% ointment', generic: 'Clobetasol', type: 'MEDICINE', unit: 'TUBES', stock: 11, cost: 54, sell: 88, batch: 'CB6619', exp: '2027-09-30', loc: 'Shelf A-05' },
];

async function main() {
  const branch = await prisma.branch.findFirst();
  if (!branch) throw new Error('Run seed-once.ts first (no branch found).');
  const doctor = await prisma.user.findUnique({ where: { email: 'shravya@clinic.test' } });
  if (!doctor) throw new Error('Run seed-once.ts first (doctor missing).');

  let room = await prisma.room.findFirst({ where: { branchId: branch.id, name: 'Consult Room 1' } });
  if (!room) room = await prisma.room.create({ data: { name: 'Consult Room 1', type: 'CONSULTATION', capacity: 1, branchId: branch.id } });

  const created = [];
  for (let i = 0; i < patients.length; i++) {
    const p = patients[i];
    let patient = await prisma.patient.findUnique({ where: { patientCode: p.code } });
    if (!patient) {
      patient = await prisma.patient.create({
        data: { patientCode: p.code, name: p.name, gender: p.gender, age: p.age, phone: p.phone, city: 'Hyderabad', branchId: branch.id },
      });
    }
    let appt = await prisma.appointment.findFirst({ where: { patientId: patient.id, date: today } });
    if (!appt) {
      appt = await prisma.appointment.create({
        data: {
          patientId: patient.id, doctorId: doctor.id, date: today, slot: slots[i], status: statuses[i],
          visitType: 'OPD', branchId: branch.id, roomId: room.id, tokenNumber: i + 1,
        },
      });
    }
    created.push({ patient, appt });
  }

  // One open visit (the IN_PROGRESS appointment: Rahul Deshmukh).
  const open = created[1];
  let visit = await prisma.visit.findUnique({ where: { appointmentId: open.appt.id } });
  if (!visit) {
    visit = await prisma.visit.create({
      data: { patientId: open.patient.id, doctorId: doctor.id, appointmentId: open.appt.id, complaints: '', consultationType: 'IN_PERSON' },
    });
  }

  for (const it of inventory) {
    const exists = await prisma.inventoryItem.findUnique({ where: { sku: it.sku } });
    if (exists) continue;
    await prisma.inventoryItem.create({
      data: {
        branchId: branch.id, name: it.name, genericName: it.generic, type: it.type, unit: it.unit,
        sku: it.sku, costPrice: it.cost, sellingPrice: it.sell, mrp: it.sell || null,
        currentStock: it.stock, minStockLevel: 5, reorderLevel: 8, batchNumber: it.batch,
        expiryDate: new Date(it.exp), storageLocation: it.loc, status: 'ACTIVE',
        stockStatus: it.stock === 0 ? 'OUT_OF_STOCK' : it.stock <= 5 ? 'LOW_STOCK' : 'IN_STOCK',
      },
    });
  }
  console.log(JSON.stringify({ patients: created.length, openVisitId: visit.id, openVisitPatient: open.patient.name, inventory: inventory.length }));
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
