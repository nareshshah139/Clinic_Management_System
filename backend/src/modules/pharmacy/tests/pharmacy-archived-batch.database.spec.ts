import { PrismaClient } from '@prisma/client';
import { localDatabase } from '../../../shared/testing/local-database';
import { InvoiceNumbersService } from '../../../shared/numbering/invoice-numbers.service';
import { PharmacyInvoiceService } from '../pharmacy-invoice.service';
import { PharmacyPrescriptionQueueService } from '../pharmacy-prescription-queue.service';
import { queueStatusPage } from '../pharmacy-prescription-queue-query';
import { resolvePrescriptionInventory } from '../pharmacy-stock-identity';

const databaseTests = process.env.QUEUE_COVERAGE_TEST_DATABASE_URL ? describe : describe.skip;

databaseTests('Prescription lines saved on a batch that is no longer sellable', () => {
  let fixture: Awaited<ReturnType<typeof localDatabase>>;
  let db: PrismaClient;
  let queue: PharmacyPrescriptionQueueService;
  let invoices: PharmacyInvoiceService;
  const branchId = 'clinic';
  const failure = (promise: Promise<unknown>) =>
    promise.then(() => 'resolved', (error) => `${error.getStatus?.() ?? error.name}: ${error.message}`);
  const stock = async () =>
    Object.fromEntries((await db.inventoryItem.findMany({ select: { id: true, currentStock: true }, orderBy: { id: 'asc' } }))
      .map((item) => [item.id, item.currentStock]));

  beforeAll(async () => {
    fixture = await localDatabase(process.env.QUEUE_COVERAGE_TEST_DATABASE_URL!);
    db = fixture.prisma;
    await db.$executeRawUnsafe(`ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ACTIVE'`);
    await db.$executeRawUnsafe(`ALTER TABLE visits ADD COLUMN IF NOT EXISTS "deletedAt" timestamp(3)`);
    await db.$executeRawUnsafe(`ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS "validUntil" timestamp(3)`);
    queue = new PharmacyPrescriptionQueueService(db as any, { getAlternatives: async () => [] } as any);
    invoices = new PharmacyInvoiceService(db as any, new InvoiceNumbersService(db as any));

    await db.branch.create({ data: { id: branchId, name: 'Skin clinic', address: 'Synthetic' } });
    await db.user.create({ data: { id: 'doctor', branchId, firstName: 'Ravi', lastName: 'Synthetic', email: 'doctor@example.test', password: 'x', role: 'DOCTOR' } });
    await db.user.create({ data: { id: 'asha', branchId, firstName: 'Asha', lastName: 'Synthetic', email: 'asha@example.test', password: 'x', role: 'PHARMACIST' } });
    await db.patient.create({ data: { id: 'patient', branchId, name: 'Meera Shah', phone: '9876543210', gender: 'F' } });
    for (const [id, name] of [['flutas', 'Flutas 150'], ['flutas-50', 'Flutas 50'], ['sotret', 'Sotret 10'], ['sotret-20', 'Sotret 20'], ['itin', 'Itin 12']])
      await db.drug.create({ data: { id, branchId, name, price: 20, manufacturerName: 'Synthetic', packSizeLabel: '10 tablets' } });
    const batch = (id: string, name: string, drug: string | null, currentStock: number, expiry: string, status = 'ACTIVE', pack: { unit?: string; packSize?: number; packUnit?: string } = {}) =>
      db.inventoryItem.create({ data: {
        id, branchId, name, type: 'MEDICINE', costPrice: 10, sellingPrice: 20, unit: (pack.unit ?? 'STRIPS') as any,
        packSize: pack.packSize ?? 10, packUnit: pack.packUnit ?? 'tablets', currentStock, expiryDate: new Date(expiry), status: status as any,
        batchNumber: id.toUpperCase(), ...(drug ? { drugs: { connect: { id: drug } } } : {}),
      } });
    await batch('flutas-a', 'Tab. Flutas 150 mg', 'flutas', 5, '2027-01-31', 'INACTIVE');
    await batch('flutas-b1', 'Tab. Flutas 150 mg', 'flutas', 20, '2028-06-30');
    await batch('flutas-b2', 'Tab. Flutas 150 mg', 'flutas', 7, '2027-09-30');
    await batch('flutas-50', 'Tab. Flutas 50 mg', 'flutas-50', 40, '2028-01-31');
    await batch('sotret-a', 'Cap. Sotret 10 mg', 'sotret', 4, '2027-03-31', 'DISCONTINUED');
    await batch('sotret-20', 'Cap. Sotret 20 mg', 'sotret-20', 12, '2028-03-31');
    await batch('itin-a', 'Cap. Itin 12 mg', 'itin', 6, '2028-12-31');
    await batch('itin-b', 'Cap. Itin 12 mg', 'itin', 9, '2027-12-31');
    await batch('cwin-a', 'Cwin lotion', null, 2, '2027-05-31', 'INACTIVE', { unit: 'BOTTLES', packSize: 30, packUnit: 'ml' });
    await batch('cwin-b', 'Cwin lotion', null, 3, '2028-05-31', 'ACTIVE', { unit: 'BOTTLES', packSize: 30, packUnit: 'ml' });
    await batch('cwin-60', 'Cwin lotion', null, 9, '2028-05-31', 'ACTIVE', { unit: 'BOTTLES', packSize: 60, packUnit: 'ml' });

    const visit = await db.visit.create({ data: { id: 'visit', patientId: 'patient', doctorId: 'doctor', complaints: '[]' } });
    await db.prescription.create({ data: { id: 'rx', visitId: visit.id, items: JSON.stringify([
      { drugName: 'Tab. Flutas 150 mg', drugId: 'flutas', inventoryItemId: 'flutas-a', quantity: 3 },
      { drugName: 'Cap. Sotret 10 mg', drugId: 'sotret', inventoryItemId: 'sotret-a', quantity: 1 },
      { drugName: 'Cap. Itin 12 mg', drugId: 'itin', inventoryItemId: 'itin-a', quantity: 2 },
      { drugName: 'Cwin lotion', inventoryItemId: 'cwin-a', quantity: 1 },
    ]) } });
  }, 120000);
  afterAll(async () => {
    await fixture?.cleanup();
  });

  it('reads stock from the same product\'s sellable batches, earliest expiry first, and never from another product', async () => {
    const checked = await queue.stockCheck('rx', branchId);
    expect(checked.items.map((line: any) => [line.drugName, line.inventoryItemId, line.stockStatus, line.totalNonExpiredStock, line.batches.map((b: any) => b.id)])).toEqual([
      ['Tab. Flutas 150 mg', 'flutas-a', 'IN_STOCK', 27, ['flutas-b2', 'flutas-b1']],
      ['Cap. Sotret 10 mg', 'sotret-a', 'OUT_OF_STOCK', 0, []],
      ['Cap. Itin 12 mg', 'itin-a', 'IN_STOCK', 15, ['itin-b', 'itin-a']],
      ['Cwin lotion', 'cwin-a', 'IN_STOCK', 3, ['cwin-b']],
    ]);
  });

  it('keeps an explicit link outside the branch unresolved', async () => {
    await db.branch.create({ data: { id: 'other', name: 'Other clinic', address: 'Synthetic' } });
    expect(await resolvePrescriptionInventory(db, { drugName: 'Tab. Flutas 150 mg', inventoryItemId: 'flutas-b1' }, 'other')).toBeNull();
    expect(await resolvePrescriptionInventory(db, { drugName: 'Tab. Flutas 150 mg', inventoryItemId: 'no-such-batch' }, branchId)).toBeNull();
  });

  it('bills the archived line from the sellable batch, covers the prescription, and refuses the out-of-stock line', async () => {
    const line = { drugId: 'flutas', inventoryItemId: 'flutas-a', itemType: 'DRUG' as const, quantity: 3, unitPrice: 20, discountPercent: 0, taxPercent: 12 };
    const bill = { patientId: 'patient', doctorId: 'doctor', prescriptionId: 'rx', paymentMethod: 'CASH' as const, billingName: 'Meera Shah', billingPhone: '9876543210' };
    expect(await failure(invoices.checkout({ ...bill, requestKey: 'sotret-key-0001', items: [{ ...line, drugId: 'sotret', inventoryItemId: 'sotret-a', quantity: 1 }] }, branchId, 'asha')))
      .toBe('400: Insufficient non-expired stock for Sotret 10. Required 1, available 0.');
    const sold = await invoices.checkout({ ...bill, requestKey: 'flutas-key-0001', items: [line] }, branchId, 'asha');
    expect([sold.status, (await db.pharmacyInvoiceItem.findMany({ where: { invoiceId: sold.id }, select: { inventoryItemId: true, quantity: true } }))])
      .toEqual(['CONFIRMED', [{ inventoryItemId: 'flutas-a', quantity: 3 }]]);
    expect(await db.stockTransaction.findMany({ where: { type: 'SALE' }, select: { itemId: true, quantity: true, batchNumber: true } }))
      .toEqual([{ itemId: 'flutas-b2', quantity: 3, batchNumber: 'FLUTAS-B2' }]);
    expect(await stock()).toMatchObject({ 'flutas-a': 5, 'flutas-b1': 20, 'flutas-b2': 4, 'flutas-50': 40, 'sotret-a': 4, 'sotret-20': 12 });
    const entry = await queue.findOne('rx', branchId);
    expect(entry.medications.map((m: any) => [m.drugName, m.dispensedQuantity, m.coverageStatus])).toEqual([
      ['Tab. Flutas 150 mg', 3, 'covered'],
      ['Cap. Sotret 10 mg', 0, 'not_started'],
      ['Cap. Itin 12 mg', 0, 'not_started'],
      ['Cwin lotion', 0, 'not_started'],
    ]);
    const [page] = await db.$queryRaw<{ ids: string[] }[]>(queueStatusPage(branchId, 'partial' as any, 1, 10, new Date()));
    expect(page.ids).toEqual(['rx']);
  });
});
