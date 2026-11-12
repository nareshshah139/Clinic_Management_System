import { PrismaClient } from '@prisma/client';
import { PharmacyPrescriptionQueueService } from '../pharmacy-prescription-queue.service';
import { queueStatusPage } from '../pharmacy-prescription-queue-query';
import { PrescriptionQueueStatus } from '../dto/pharmacy-prescription-queue.dto';
import { localDatabase } from '../../../shared/testing/local-database';
import { PrescriptionsService } from '../../prescriptions/prescriptions.service';

const databaseTests = process.env.QUEUE_COVERAGE_TEST_DATABASE_URL ? describe : describe.skip;

type Line = Record<string, unknown>;
type Bill = { inventoryItemId?: string | null; drugId?: string | null; quantity: number };
type Invoice = { status: string; items: Bill[] };

const statuses = Object.values(PrescriptionQueueStatus) as PrescriptionQueueStatus[];

const thirtyDays = { frequency: 'ONCE_DAILY', duration: 30, durationUnit: 'DAYS' };

function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

databaseTests('Queue coverage in selling units with PostgreSQL', () => {
  let fixture: Awaited<ReturnType<typeof localDatabase>>;
  let db: PrismaClient;
  let queue: PharmacyPrescriptionQueueService;
  let doctorId: string;
  let invoiceCount = 0;
  const drugs: Record<string, string> = {};
  const inventory: Record<string, string> = {};

  const products: Record<string, { drug: string; unit: string; packSize: number | null; packUnit: string | null }> = {
    tricogroStrips: { drug: 'TRICOGRO TABLET', unit: 'STRIPS', packSize: 10, packUnit: 'tablets' },
    tricogroPieces: { drug: 'TRICOGRO TABLET', unit: 'PIECES', packSize: 1, packUnit: 'tablets' },
    tricogroNoPack: { drug: 'TRICOGRO TABLET', unit: 'STRIPS', packSize: null, packUnit: null },
    serum: { drug: 'ANABOOM PRO ADVANCED HAIR SERUM', unit: 'BOTTLES', packSize: 60, packUnit: 'ml' },
    foitrax: { drug: 'Foitrax 10', unit: 'PIECES', packSize: 1, packUnit: 'tablets' },
    folvite: { drug: 'Folvite 5mg', unit: 'STRIPS', packSize: 10, packUnit: 'tablets' },
    minoxidil: { drug: 'Minoxidil 5', unit: 'PACKS', packSize: 1, packUnit: 'g' },
    azithral: { drug: 'Azithral 500', unit: 'BOXES', packSize: 3, packUnit: 'tablets' },
    ketoconazole: { drug: 'Ketoconazole 2%', unit: 'BOTTLES', packSize: 100, packUnit: 'ml' },
  };

  beforeAll(async () => {
    fixture = await localDatabase(process.env.QUEUE_COVERAGE_TEST_DATABASE_URL!);
    db = fixture.prisma;
    await db.$executeRawUnsafe(`ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ACTIVE'`);
    await db.$executeRawUnsafe(`ALTER TABLE visits ADD COLUMN IF NOT EXISTS "deletedAt" timestamp(3)`);
    await db.$executeRawUnsafe(`ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS "validUntil" timestamp(3)`);
    queue = new PharmacyPrescriptionQueueService(db as any, {} as any);
  }, 60000);
  afterAll(async () => {
    await fixture?.cleanup();
  });

  async function clinic(name: string) {
    const branchId = (await db.branch.create({ data: { name, address: 'test' } })).id;
    doctorId = (await db.user.create({
      data: { branchId, firstName: 'Test', lastName: 'Doctor', email: `${branchId}@example.invalid`, password: 'no-login', role: 'DOCTOR' },
    })).id;
    const patientId = (await db.patient.create({
      data: { branchId, name: 'Test patient', phone: '0000000000', gender: 'FEMALE' },
    })).id;
    for (const name of new Set(Object.values(products).map(product => product.drug))) {
      drugs[name] = (await db.drug.create({
        data: { branchId, name, manufacturerName: 'Synthetic', packSizeLabel: 'pack', price: 10 },
      })).id;
    }
    for (const [key, product] of Object.entries(products)) {
      inventory[key] = (await db.inventoryItem.create({
        data: {
          branchId, name: product.drug, type: 'MEDICINE', costPrice: 5, sellingPrice: 10,
          unit: product.unit as any, packSize: product.packSize, packUnit: product.packUnit, currentStock: 500,
          drugs: { connect: { id: drugs[product.drug] } },
        },
      })).id;
    }
    return { branchId, patientId };
  }

  async function rx(
    where: { branchId: string; patientId: string },
    id: string,
    items: Line[],
    invoices: Invoice[] = [],
  ) {
    const visit = await db.visit.create({ data: { patientId: where.patientId, doctorId, complaints: '[]' } });
    await db.prescription.create({
      data: { id, visitId: visit.id, createdAt: new Date(Date.now() - 60 * 60 * 1000), items: JSON.stringify(items) },
    });
    for (const invoice of invoices) {
      await db.pharmacyInvoice.create({
        data: {
          branchId: where.branchId, prescriptionId: id, patientId: where.patientId, doctorId,
          invoiceNumber: `INV-${++invoiceCount}`, status: invoice.status as any,
          subtotal: 10, totalAmount: 10, balanceAmount: 10, paymentMethod: 'CASH',
          billingName: 'Test patient', billingPhone: '0000000000',
          items: { create: invoice.items.map(item => ({ ...item, unitPrice: 10, totalAmount: 10 })) },
        },
      });
    }
  }

  async function listed(branchId: string) {
    const status = new Map<string, PrescriptionQueueStatus>();
    for (const value of statuses) {
      const [selection] = await db.$queryRaw<{ ids: string[] }[]>(queueStatusPage(branchId, value, 1, 10000, new Date()));
      for (const id of selection.ids) {
        expect(status.get(id)).toBeUndefined();
        status.set(id, value);
      }
    }
    return status;
  }

  const bill = (key: string, quantity: number): Bill => ({ inventoryItemId: inventory[key], drugId: drugs[products[key].drug], quantity });
  const line = (key: string, extra: Line = {}): Line => ({ drugName: products[key].drug, inventoryItemId: inventory[key], drugId: drugs[products[key].drug], ...extra });
  const confirmed = (...items: Bill[]): Invoice[] => [{ status: 'CONFIRMED', items }];

  it('shows correctly billed strips, bottles and weekly or alternate-day courses as dispensed in the list and detail', async () => {
    const at = await clinic('Selling unit scenarios');
    const tablet = { dosage: 1, dosageUnit: 'TABLET', ...thirtyDays };
    const serum = { dosage: 2, dosageUnit: 'ML', ...thirtyDays };
    const weekly = { dosage: 1, dosageUnit: 'TABLET', frequency: 'ONCE_DAILY', duration: 16, durationUnit: 'WEEKS', instructions: 'weekly once- Sunday' };
    const alternate = { ...tablet, instructions: 'Take every alternate day' };
    const cases: Array<[string, Line[], Invoice[], PrescriptionQueueStatus, Array<[number | null, number, string]>]> = [
      ['tricogro-3-strips', [line('tricogroStrips', tablet)], confirmed(bill('tricogroStrips', 3)), PrescriptionQueueStatus.DISPENSED, [[30, 30, 'covered']]],
      ['tricogro-2-strips', [line('tricogroStrips', tablet)], confirmed(bill('tricogroStrips', 2)), PrescriptionQueueStatus.PARTIAL, [[30, 20, 'partial']]],
      ['tricogro-30-pieces', [line('tricogroPieces', tablet)], confirmed(bill('tricogroPieces', 30)), PrescriptionQueueStatus.DISPENSED, [[30, 30, 'covered']]],
      ['tricogro-29-pieces', [line('tricogroPieces', tablet)], confirmed(bill('tricogroPieces', 29)), PrescriptionQueueStatus.PARTIAL, [[30, 29, 'partial']]],
      ['tricogro-no-pack-size', [line('tricogroNoPack', tablet)], confirmed(bill('tricogroNoPack', 1)), PrescriptionQueueStatus.DISPENSED, [[30, 30, 'covered']]],
      ['serum-1-bottle', [line('serum', serum)], confirmed(bill('serum', 1)), PrescriptionQueueStatus.DISPENSED, [[30, 30, 'covered']]],
      ['serum-no-schedule', [line('serum', { dosage: 2, dosageUnit: 'ML' })], confirmed(bill('serum', 1)), PrescriptionQueueStatus.DISPENSED, [[1, 1, 'covered']]],
      ['serum-draft-invoice', [line('serum', serum)], [{ status: 'DRAFT', items: [bill('serum', 1)] }], PrescriptionQueueStatus.PENDING, [[30, 0, 'not_started']]],
      ['weekly-16-pieces', [line('foitrax', weekly)], confirmed(bill('foitrax', 16)), PrescriptionQueueStatus.DISPENSED, [[16, 16, 'covered']]],
      ['weekly-15-pieces', [line('foitrax', weekly)], confirmed(bill('foitrax', 15)), PrescriptionQueueStatus.PARTIAL, [[16, 15, 'partial']]],
      ['alternate-2-strips', [line('tricogroStrips', alternate)], confirmed(bill('tricogroStrips', 2)), PrescriptionQueueStatus.DISPENSED, [[15, 15, 'covered']]],
      ['alternate-1-strip', [line('tricogroStrips', alternate)], confirmed(bill('tricogroStrips', 1)), PrescriptionQueueStatus.PARTIAL, [[15, 10, 'partial']]],
      ['explicit-10-tablets-1-strip', [line('folvite', { ...tablet, quantity: 10 })], confirmed(bill('folvite', 1)), PrescriptionQueueStatus.DISPENSED, [[10, 10, 'covered']]],
      ['explicit-15-tablets-2-strips', [line('folvite', { ...tablet, quantity: 15 })], confirmed(bill('folvite', 2)), PrescriptionQueueStatus.DISPENSED, [[15, 15, 'covered']]],
      ['explicit-15-tablets-1-strip', [line('folvite', { ...tablet, quantity: 15 })], confirmed(bill('folvite', 1)), PrescriptionQueueStatus.PARTIAL, [[15, 10, 'partial']]],
      ['explicit-5-strips-stated', [line('folvite', { ...tablet, quantity: 5, quantityUnit: 'STRIPS' })], confirmed(bill('folvite', 5)), PrescriptionQueueStatus.DISPENSED, [[5, 5, 'covered']]],
      ['explicit-4-of-5-strips-stated', [line('folvite', { ...tablet, quantity: 5, quantityUnit: 'strips' })], confirmed(bill('folvite', 4)), PrescriptionQueueStatus.PARTIAL, [[5, 4, 'partial']]],
      ['explicit-2-bottles', [line('ketoconazole', { dosageUnit: 'TABLET', quantity: 2 })], confirmed(bill('ketoconazole', 2)), PrescriptionQueueStatus.DISPENSED, [[2, 2, 'covered']]],
      ['explicit-1-of-2-bottles', [line('ketoconazole', { dosageUnit: 'TABLET', quantity: 2 })], confirmed(bill('ketoconazole', 1)), PrescriptionQueueStatus.PARTIAL, [[2, 1, 'partial']]],
      ['two-lines-5-strips', [line('tricogroStrips', tablet), line('tricogroStrips', tablet)], confirmed(bill('tricogroStrips', 5)), PrescriptionQueueStatus.PARTIAL, [[30, 30, 'covered'], [30, 20, 'partial']]],
      ['two-lines-6-strips', [line('tricogroStrips', tablet), line('tricogroStrips', tablet)], confirmed(bill('tricogroStrips', 6)), PrescriptionQueueStatus.DISPENSED, [[30, 30, 'covered'], [30, 30, 'covered']]],
      ['two-lines-share-a-cut-strip', [line('tricogroStrips', { ...tablet, duration: 25 }), line('tricogroStrips', { ...tablet, duration: 25 })], confirmed(bill('tricogroStrips', 5)), PrescriptionQueueStatus.DISPENSED, [[25, 25, 'covered'], [25, 25, 'covered']]],
      ['two-lines-share-a-box-of-3', [line('azithral', { ...tablet, duration: 5 }), line('azithral', { ...tablet, duration: 1 })], confirmed(bill('azithral', 2)), PrescriptionQueueStatus.DISPENSED, [[5, 5, 'covered'], [1, 1, 'covered']]],
      ['strips-and-pieces-of-one-drug', [{ drugName: 'TRICOGRO TABLET', drugId: drugs['TRICOGRO TABLET'], ...tablet }], confirmed(bill('tricogroStrips', 2), bill('tricogroPieces', 10)), PrescriptionQueueStatus.DISPENSED, [[30, 30, 'covered']]],
      ['bill-without-inventory', [{ drugName: 'TRICOGRO TABLET', drugId: drugs['TRICOGRO TABLET'], ...tablet }], confirmed({ drugId: drugs['TRICOGRO TABLET'], quantity: 3 }), PrescriptionQueueStatus.PARTIAL, [[30, 3, 'partial']]],
      ['numeric-instructions', [line('foitrax', { ...tablet, duration: 5, instructions: 2 })], confirmed(bill('foitrax', 5)), PrescriptionQueueStatus.DISPENSED, [[5, 5, 'covered']]],
      ['array-instructions', [line('foitrax', { ...weekly, instructions: ['weekly'] })], confirmed(bill('foitrax', 16)), PrescriptionQueueStatus.DISPENSED, [[16, 16, 'covered']]],
      ['unscheduled-line-billed-as-bottle', [line('ketoconazole', { dosageUnit: 'TABLET' })], confirmed(bill('ketoconazole', 1)), PrescriptionQueueStatus.DISPENSED, [[1, 1, 'covered']]],
      ['unscheduled-line-two-bottles', [line('ketoconazole'), line('ketoconazole')], confirmed(bill('ketoconazole', 1)), PrescriptionQueueStatus.PARTIAL, [[1, 1, 'covered'], [1, 0, 'not_started']]],
      ['unscheduled-line-bottle-by-drug', [{ drugName: 'Keto shampoo base', drugId: drugs['Ketoconazole 2%'] }], confirmed({ drugId: drugs['Ketoconazole 2%'], quantity: 1 }, bill('ketoconazole', 1)), PrescriptionQueueStatus.DISPENSED, [[1, 1, 'covered']]],
      ['unscheduled-line-draft-bottle', [line('ketoconazole')], [{ status: 'DRAFT', items: [bill('ketoconazole', 1)] }], PrescriptionQueueStatus.PENDING, [[null, 0, 'unknown']]],
      ['numeric-dosage-unit', [line('foitrax', { dosageUnit: 5 })], confirmed(bill('foitrax', 1)), PrescriptionQueueStatus.PARTIAL, [[null, 1, 'unknown']]],
      ['fraction-past-a-whole-dose', [line('foitrax', { frequency: 'WEEKLY', duration: '4.0000000005', durationUnit: 'WEEKS' })], confirmed(bill('foitrax', 4)), PrescriptionQueueStatus.DISPENSED, [[4, 4, 'covered']]],
      ['completed-invoice-short', [line('tricogroStrips', tablet)], [{ status: 'COMPLETED', items: [bill('tricogroStrips', 1)] }], PrescriptionQueueStatus.DISPENSED, [[30, 10, 'partial']]],
    ];
    for (const [id, items, invoices] of cases) await rx(at, id, items, invoices);

    const list = await listed(at.branchId);
    for (const [id, , , status, lines] of cases) {
      const detail = await queue.findOne(id, at.branchId);
      expect([id, list.get(id), detail.status]).toEqual([id, status, status]);
      expect([id, detail.medications.map(m => [m.prescribedQuantity, m.dispensedQuantity, m.coverageStatus])]).toEqual([id, lines]);
    }
    const page = await queue.findAll({ status: PrescriptionQueueStatus.DISPENSED, limit: 100 }, at.branchId);
    expect(page.data.map(entry => entry.prescriptionId).sort()).toEqual(
      cases.filter(([, , , status]) => status === PrescriptionQueueStatus.DISPENSED).map(([id]) => id).sort(),
    );
  });

  it('marks a prescription dispensed after billing exactly what the stock check suggests', async () => {
    const at = await clinic('Billing suggestion round trip');
    await rx(at, 'billed-as-suggested', [
      line('tricogroStrips', { dosage: 1, dosageUnit: 'TABLET', ...thirtyDays }),
      line('serum', { dosage: 2, dosageUnit: 'ML', ...thirtyDays }),
      line('foitrax', { dosage: 1, dosageUnit: 'TABLET', frequency: 'ONCE_DAILY', duration: 16, durationUnit: 'WEEKS', instructions: 'weekly once- Sunday' }),
      line('azithral', { dosage: 1, dosageUnit: 'TABLET', frequency: 'TWICE_DAILY', duration: 5, durationUnit: 'DAYS' }),
      line('minoxidil', { dosageUnit: 'APPLICATION', frequency: 'TWICE_DAILY', duration: 3, durationUnit: 'MONTHS' }),
      line('folvite', { dosage: 1, dosageUnit: 'TABLET', ...thirtyDays, quantity: 15 }),
      line('folvite', { dosage: 1, dosageUnit: 'TABLET', ...thirtyDays, quantity: 2, quantityUnit: 'STRIPS' }),
      line('ketoconazole', { dosageUnit: 'TABLET', quantity: 2 }),
    ]);
    const suggested = (await queue.stockCheck('billed-as-suggested', at.branchId)).items
      .map(item => ({ inventoryItemId: item.inventoryItemId, quantity: item.billingQuantity.quantity, unit: item.billingQuantity.unit }));
    expect(suggested.map(({ quantity, unit }) => [quantity, unit])).toEqual([[3, 'STRIPS'], [1, 'BOTTLES'], [16, 'PIECES'], [4, 'BOXES'], [1, 'PACKS'], [2, 'STRIPS'], [2, 'STRIPS'], [2, 'BOTTLES']]);

    const keys = ['tricogroStrips', 'serum', 'foitrax', 'azithral', 'minoxidil', 'folvite', 'folvite', 'ketoconazole'];
    await db.pharmacyInvoice.create({
      data: {
        branchId: at.branchId, prescriptionId: 'billed-as-suggested', patientId: at.patientId, doctorId,
        invoiceNumber: `INV-${++invoiceCount}`, status: 'CONFIRMED', subtotal: 10, totalAmount: 10, balanceAmount: 10,
        paymentMethod: 'CASH', billingName: 'Test patient', billingPhone: '0000000000',
        items: { create: suggested.map((item, index) => ({ ...bill(keys[index], item.quantity), unitPrice: 10, totalAmount: 10 })) },
      },
    });
    expect((await listed(at.branchId)).get('billed-as-suggested')).toBe(PrescriptionQueueStatus.DISPENSED);
    const detail = await queue.findOne('billed-as-suggested', at.branchId);
    expect(detail.status).toBe(PrescriptionQueueStatus.DISPENSED);
    expect(detail.medications.map(m => m.coverageStatus)).toEqual(Array(8).fill('covered'));
  });

  it('agrees with detail coverage on every prescription in a seeded random branch', async () => {
    const at = await clinic('Random coverage agreement');
    const next = random(20261106);
    const pick = <T,>(values: readonly T[]) => values[Math.floor(next() * values.length)];
    const keys = Object.keys(products);
    const schedules: Line[] = [
      { frequency: 'ONCE_DAILY', duration: 30, durationUnit: 'DAYS' },
      { frequency: 'TWICE_DAILY', duration: 7, durationUnit: 'DAYS' },
      { frequency: 'THREE_TIMES_DAILY', duration: '5', durationUnit: 'days' },
      { frequency: 'ONCE_DAILY', duration: 16, durationUnit: 'WEEKS', instructions: 'weekly once- Sunday' },
      { frequency: 'ONCE_DAILY', duration: 30, durationUnit: 'DAYS', instructions: 'every alternate day' },
      { frequency: 'TWICE_DAILY', duration: 4, durationUnit: 'WEEKS', instructions: 'Twice a week' },
      { frequency: 'WEEKLY', duration: 2, durationUnit: 'MONTHS' },
      { frequency: 'ONCE_DAILY', duration: 25, durationUnit: ' ' },
      { frequency: 'WHENEVER', duration: 10 },
      { frequency: 'ONCE_DAILY' },
      { quantity: 2 },
      { quantity: '1.5' },
      { quantity: 15, frequency: 'ONCE_DAILY', duration: 15 },
      { quantity: 2, quantityUnit: 'STRIPS' },
      { quantity: 3, quantityUnit: ' bottles ' },
      { quantity: 4, quantityUnit: 'TABLET' },
      { quantity: 2, quantityUnit: '\tSTRIPS' },
      { quantity: 0, frequency: 'ONCE_DAILY', duration: 9 },
      { frequency: 'ONCE_DAILY', duration: 10, instructions: 7 },
      { frequency: 'ONCE_DAILY', duration: 30, instructions: ['every alternate day'] },
      { frequency: 'WEEKLY', duration: '4.0000000005', durationUnit: 'WEEKS' },
      { frequency: 'TWICE_DAILY', duration: 2.5 },
      { frequency: ['TWICE_DAILY'], duration: 3, durationUnit: ['WEEKS'] },
    ];
    const dosageUnits: unknown[] = ['TABLET', 'ML', 'APPLICATION', 'CAPSULE', '', 'drops', 5, null];
    const expected: Record<string, PrescriptionQueueStatus> = {};
    for (let n = 0; n < 240; n++) {
      const lines = Array.from({ length: 1 + Math.floor(next() * 3) }, () => {
        const key = pick(keys);
        const identity = pick(['inventory', 'drug', 'name'] as const);
        const label = identity === 'name' && next() < 0.5 ? `${products[key].drug} cream` : products[key].drug;
        const naming = pick(['drugName', 'drugName', 'brandName', 'genericName'] as const);
        return {
          [naming]: label,
          ...(next() < 0.2 ? { genericName: pick(['Hair serum', 'Minoxidil', 'Ketoconazole lotion']) } : {}),
          ...(identity === 'inventory' ? { inventoryItemId: inventory[key] } : {}),
          ...(identity !== 'name' ? { drugId: drugs[products[key].drug] } : {}),
          dosageUnit: pick(dosageUnits),
          ...pick(schedules),
        };
      });
      const invoices = Array.from({ length: Math.floor(next() * 3) }, () => ({
        status: pick(['CONFIRMED', 'CONFIRMED', 'CONFIRMED', 'DRAFT', 'CANCELLED', 'COMPLETED']),
        items: Array.from({ length: 1 + Math.floor(next() * 3) }, () => {
          const key = pick(keys);
          return { inventoryItemId: next() < 0.85 ? inventory[key] : null, drugId: drugs[products[key].drug], quantity: Math.floor(next() * 8) };
        }),
      }));
      const id = `random-${String(n).padStart(3, '0')}`;
      await rx(at, id, lines, invoices);
      expected[id] = (await queue.findOne(id, at.branchId)).status;
    }
    const list = await listed(at.branchId);
    expect(Object.fromEntries([...list.entries()].sort())).toEqual(expected);
    const seen = new Set(Object.values(expected));
    expect([...seen].sort()).toEqual(['dispensed', 'partial', 'pending']);
  }, 120000);
  it('does not classify a historic manually dispensed task as billed', async () => {
    const at = await clinic('Historical manual task');
    await rx(at, 'manual-task-without-sale', [line('tricogroStrips')]);
    await db.pharmacyDispenseTask.create({ data: { branchId: at.branchId, patientId: at.patientId, patientName: 'Test patient', prescriptionId: 'manual-task-without-sale', status: 'DISPENSED' } });
    expect((await listed(at.branchId)).get('manual-task-without-sale')).toBe(PrescriptionQueueStatus.PENDING);
    expect((await queue.findOne('manual-task-without-sale', at.branchId)).status).toBe(PrescriptionQueueStatus.PENDING);
  });

  it('rejects a medicine edit racing an invoice held under the prescription lock', async () => {
    const at = await clinic('Invoice edit race');
    await rx(at, 'rx-edit-race', [line('tricogroStrips')]);
    let release!: () => void;
    let locked!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const ready = new Promise<void>(resolve => { locked = resolve; });
    const invoiceWrite = db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM prescriptions WHERE id = ${'rx-edit-race'} FOR UPDATE`;
      await tx.pharmacyInvoice.create({ data: { branchId: at.branchId, prescriptionId: 'rx-edit-race', patientId: at.patientId, doctorId, invoiceNumber: `RACE-${++invoiceCount}`, status: 'CONFIRMED', subtotal: 10, totalAmount: 10, balanceAmount: 10, paymentMethod: 'CASH', billingName: 'Test patient', billingPhone: '0000000000' } });
      locked();
      await gate;
    });
    await ready;
    const edit = new PrescriptionsService(db as any, {} as any).updatePrescription('rx-edit-race', { items: [{ drugName: 'Changed medicine' }] } as any, at.branchId);
    release();
    await invoiceWrite;
    await expect(edit).rejects.toMatchObject({ status: 409 });
    expect(JSON.parse((await db.prescription.findUniqueOrThrow({ where: { id: 'rx-edit-race' } })).items)[0].drugName).toBe(products.tricogroStrips.drug);
  });

});
