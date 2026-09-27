// Only runs against the isolated local database created for CR-02 validation.
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const url = 'postgresql://nshah@127.0.0.1:55447/cr02';
require(root + '/node_modules/ts-node').register({ transpileOnly: true, project: root + '/backend/tsconfig.json' });
const { PrismaClient } = require('@prisma/client');
const { medicineRegimenDefaults } = require(root + '/backend/src/modules/prescriptions/medicine-regimen-defaults');
const { InventoryService } = require(root + '/backend/src/modules/inventory/inventory.service');
const db = new PrismaClient({ datasourceUrl: url });
const now = new Date('2026-09-27T12:00:00Z');
(async () => {
  try {
    // Roll back every synthetic patient/visit after assertions.
    await db.$transaction(async tx => {
      const branch = await tx.branch.create({ data: { name: 'CR02 synthetic clinic', address: 'QA only' } });
      const other = await tx.branch.create({ data: { name: 'CR02 other clinic', address: 'QA only' } });
      const doctor = await tx.user.create({ data: { branchId: branch.id, email: `cr02-${branch.id}@example.invalid`, password: 'not-a-login', firstName: 'Synthetic', lastName: 'Doctor', role: 'DOCTOR' } });
      const colleague = await tx.user.create({ data: { branchId: branch.id, email: `cr02-other-${branch.id}@example.invalid`, password: 'not-a-login', firstName: 'Synthetic', lastName: 'Colleague', role: 'DOCTOR' } });
      const patient = await tx.patient.create({ data: { branchId: branch.id, name: 'CR02 synthetic patient', phone: '', gender: 'FEMALE' } });
      const outsidePatient = await tx.patient.create({ data: { branchId: other.id, name: 'CR02 outside patient', phone: '', gender: 'FEMALE' } });
      const drug = await tx.drug.create({ data: { branchId: branch.id, name: 'Fucibet cream', price: 10, manufacturerName: 'QA', packSizeLabel: 'QA only' } });
      const add = async (duration, date, who = doctor, person = patient, medicine = drug) => {
        const visit = await tx.visit.create({ data: { patientId: person.id, doctorId: who.id, complaints: 'Synthetic fixture' } });
        await tx.prescription.create({ data: { visitId: visit.id, createdAt: new Date(date), items: JSON.stringify([{ drugId: medicine.id, drugName: medicine.name, duration, durationUnit: 'DAYS', frequency: 'TWICE_DAILY', dosePattern: '1-0-1', timing: 'AM/PM', instructions: 'on the rash' }]) } });
        return visit;
      };
      await add(10, '2026-09-01'); await add(10, '2026-09-02'); await add(14, '2026-09-03');
      for (let i = 0; i < 5; i++) { await add(21, '2026-09-04', colleague); await add(99, '2025-09-26'); await add(99, '2026-09-04', doctor, outsidePatient); }
      const current = await add(99, '2026-09-27');
      const get = () => medicineRegimenDefaults(tx, drug.id, branch.id, doctor.id, current.id, now);
      assert.deepEqual(await get(), { source: 'doctor', prescriptionCount: 3, values: { duration: 10, durationUnit: 'DAYS', frequency: 'TWICE_DAILY', dosePattern: '1-0-1', timing: 'AM/PM', instructions: 'on the rash' } });
      const otherDoctor = await medicineRegimenDefaults(tx, drug.id, branch.id, 'no-history-doctor', current.id, now);
      assert.equal(otherDoctor.source, 'clinic'); assert.equal(otherDoctor.prescriptionCount, 8); assert.equal(otherDoctor.values.duration, 21);
      console.log('PASS real SQL: 12-month cutoff, branch isolation, current-visit exclusion, doctor threshold and clinic fallback');
      const never = await tx.drug.create({ data: { branchId: branch.id, name: 'Never prescribed', price: 10, manufacturerName: 'QA', packSizeLabel: 'QA' } });
      const getNever = () => medicineRegimenDefaults(tx, never.id, branch.id, doctor.id, undefined, now);
      assert.deepEqual(await getNever(), { source: 'none', prescriptionCount: 0, values: {} });
      const inventory = new InventoryService(tx);
      const stock = await inventory.createInventoryItem({ name: never.name, type: 'MEDICINE', unit: 'TUBES', costPrice: 1, sellingPrice: 2,
        defaultDuration: 3, defaultDurationUnit: 'WEEKS', defaultFrequency: '0-0-1', defaultTiming: 'PM', defaultInstructions: 'apply thinly' }, branch.id);
      await tx.drug.update({ where: { id: never.id }, data: { inventoryItems: { connect: { id: stock.id } } } });
      assert.equal((await getNever()).values.duration, 3); assert.equal((await getNever()).source, 'inventory');
      await inventory.updateInventoryItem(stock.id, { defaultDuration: null, defaultFrequency: null, defaultTiming: null, defaultInstructions: null }, branch.id);
      assert.deepEqual(await getNever(), { source: 'none', prescriptionCount: 0, values: {} });
      console.log('PASS real SQL: optional inventory defaults save, read and clear; unknown medicines remain blank');
      const start = performance.now(); await get(); console.log(`PASS small-fixture lookup: ${(performance.now() - start).toFixed(1)} ms (not a production benchmark)`);
      throw new Error('ROLLBACK_QA');
    }, { timeout: 30000 });
  } catch (error) { if (error.message !== 'ROLLBACK_QA') throw error; }
  finally { await db.$disconnect(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
