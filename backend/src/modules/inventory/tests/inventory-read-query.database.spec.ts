import { PrismaClient } from '@prisma/client';
import { PharmacyPrescriptionQueueService } from '../../pharmacy/pharmacy-prescription-queue.service';
import { PrescriptionQueueStatus } from '../../pharmacy/dto/pharmacy-prescription-queue.dto';
import { InventoryWorkspaceService } from '../inventory-workspace.service';
import { localDatabase } from '../../../shared/testing/local-database';

const databaseTests = process.env.INVENTORY_READ_TEST_DATABASE_URL
  ? describe
  : describe.skip;
databaseTests('Inventory and queue reads with PostgreSQL', () => {
  let fixture: Awaited<ReturnType<typeof localDatabase>>;
  let db: PrismaClient;
  let branchId: string,
    otherBranch: string,
    doctorId: string,
    patientId: string,
    drugId: string;
  let queue: PharmacyPrescriptionQueueService, stock: InventoryWorkspaceService;
  const actor = () => ({ id: doctorId, branchId }) as any;
  const stamp = new Date('2020-01-01T00:00:00Z');
  const hour = 60 * 60 * 1000;
  beforeAll(async () => {
    fixture = await localDatabase(
      process.env.INVENTORY_READ_TEST_DATABASE_URL!,
    );
    db = fixture.prisma;
    await db.$executeRawUnsafe(
      `ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ACTIVE'`,
    );
    await db.$executeRawUnsafe(
      `ALTER TABLE visits ADD COLUMN IF NOT EXISTS "deletedAt" timestamp(3)`,
    );
    await db.$executeRawUnsafe(`ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS "validUntil" timestamp(3)`);
    branchId = (
      await db.branch.create({
        data: { name: 'Synthetic read fixtures', address: 'test' },
      })
    ).id;
    otherBranch = (
      await db.branch.create({
        data: { name: 'Other synthetic branch', address: 'test' },
      })
    ).id;
    doctorId = (
      await db.user.create({
        data: {
          branchId,
          firstName: 'Test',
          lastName: 'Doctor',
          email: 'read@example.invalid',
          password: 'no-login',
          role: 'DOCTOR',
        },
      })
    ).id;
    patientId = (
      await db.patient.create({
        data: {
          branchId,
          name: 'Test patient',
          phone: '0000000000',
          gender: 'FEMALE',
        },
      })
    ).id;
    drugId = (
      await db.drug.create({
        data: {
          branchId,
          name: 'Azithral 500',
          manufacturerName: 'Synthetic',
          packSizeLabel: '3 tablets',
          price: 20,
        },
      })
    ).id;
    queue = new PharmacyPrescriptionQueueService(db as any, {} as any);
    stock = new InventoryWorkspaceService(
      db as any,
      { permissions: async () => new Set(['inventory:item:read']) } as any,
    );
  }, 60000);
  afterAll(async () => {
    await fixture?.cleanup();
  });

  async function rx(
    id: string,
    options: {
      items?: unknown;
      age?: number;
      invoice?: string;
      quantity?: number;
      task?: string;
      branch?: string;
    } = {},
  ) {
    let patient = patientId;
    if (options.branch)
      patient = (
        await db.patient.create({
          data: {
            branchId: options.branch,
            name: 'Other',
            phone: '0000000000',
            gender: 'FEMALE',
          },
        })
      ).id;
    const visit = await db.visit.create({
      data: { patientId: patient, doctorId, complaints: '[]' },
    });
    await db.prescription.create({
      data: {
        id,
        visitId: visit.id,
        createdAt: new Date(Date.now() - (options.age || 1) * hour),
        items: JSON.stringify(
          options.items ?? [
            {
              drugName: 'Azithral 500',
              frequency: 'TWICE_DAILY',
              duration: '3',
              durationUnit: 'DAYS',
            },
          ],
        ),
      },
    });
    if (options.invoice)
      await db.pharmacyInvoice.create({
        data: {
          branchId,
          prescriptionId: id,
          patientId,
          doctorId,
          invoiceNumber: `INV-${id}`,
          status: options.invoice as any,
          subtotal: 20,
          totalAmount: 20,
          balanceAmount: 20,
          paymentMethod: 'CASH',
          billingName: 'Test patient',
          billingPhone: '0000000000',
          items: {
            create: {
              drugId,
              quantity: options.quantity ?? 6,
              unitPrice: 20,
              totalAmount: 20,
            },
          },
        },
      });
    if (options.task)
      await db.pharmacyDispenseTask.create({
        data: {
          branchId,
          prescriptionId: id,
          patientId,
          patientName: 'Test patient',
          status: options.task as any,
          paidAt: stamp,
          dispensedAt: stamp,
        },
      });
  }

  it('filters complete live invoice coverage and staff workflow before pagination without writes', async () => {
    await rx('pending', {});
    await rx('expired', { age: 30 });
    await rx('draft', { invoice: 'DRAFT' });
    await rx('partial', { invoice: 'CONFIRMED', quantity: 2 });
    await rx('covered', { invoice: 'CONFIRMED' });
    await rx('complete-unknown', {
      invoice: 'COMPLETED',
      items: [{ drugName: 'Azithral 500' }],
    });
    await rx('cancelled-invoice', { invoice: 'CANCELLED' });
    await rx('in-review-old', { age: 30, task: 'IN_REVIEW' });
    await rx('paid-partial', {
      invoice: 'CONFIRMED',
      quantity: 2,
      task: 'PAID',
    });
    await rx('paused-covered', { invoice: 'CONFIRMED', task: 'PAUSED' });
    await rx('cancelled-task', { invoice: 'COMPLETED', task: 'CANCELLED' });
    await rx('cancelled-prescription', {});
    await db.$executeRawUnsafe(
      `UPDATE prescriptions SET status = 'CANCELLED' WHERE id = 'cancelled-prescription'`,
    );
    await rx('deleted-prescription', {});
    await db.$executeRawUnsafe(
      `UPDATE visits SET "deletedAt" = NOW() WHERE id = (SELECT "visitId" FROM prescriptions WHERE id = 'deleted-prescription')`,
    );
    await rx('foreign', { branch: otherBranch });
    const before = await db.pharmacyDispenseTask.findMany({
      orderBy: { id: 'asc' },
    });
    fixture.queries.length = 0;
    const expected = {
      pending: ['draft', 'in-review-old', 'pending'],
      expired: ['cancelled-task', 'expired'],
      partial: ['cancelled-invoice', 'paid-partial', 'partial'],
      dispensed: ['complete-unknown', 'covered', 'paused-covered'],
    };
    for (const [status, ids] of Object.entries(expected)) {
      const found: string[] = [];
      for (let page = 1; page <= ids.length; page++) {
        const result = await queue.findAll(
          { status: status as PrescriptionQueueStatus, page, limit: 1 },
          branchId,
        );
        expect(result.pagination).toEqual({
          page,
          limit: 1,
          total: ids.length,
          pages: ids.length,
        });
        expect(result.data[0].status).toBe(status);
        found.push(result.data[0].prescriptionId);
      }
      expect(found.sort()).toEqual(ids);
      const empty = await queue.findAll(
        { status: status as PrescriptionQueueStatus, page: 99, limit: 1 },
        branchId,
      );
      expect(empty.data).toEqual([]);
      expect(empty.pagination.total).toBe(ids.length);
    }
    await queue.findOne('paid-partial', branchId);
    await queue.stockCheck('paid-partial', branchId);
    expect(
      fixture.queries.filter((sql) => /^(INSERT|UPDATE|DELETE)/.test(sql)),
    ).toEqual([]);
    expect(
      await db.pharmacyDispenseTask.findMany({ orderBy: { id: 'asc' } }),
    ).toEqual(before);
    await expect(
      queue.findOne('cancelled-prescription', branchId),
    ).rejects.toThrow('Prescription not found');
    await expect(queue.findOne('foreign', branchId)).rejects.toThrow(
      'Prescription not found',
    );
    await expect(
      queue.findOne('deleted-prescription', branchId),
    ).rejects.toThrow('Prescription not found');
    const detail = await queue.findOne('covered', branchId);
    expect(detail.medications[0]).toMatchObject({
      prescribedQuantity: 6,
      dispensedQuantity: 6,
      coverageStatus: 'covered',
    });
  });

  it('keeps query count bounded as the branch grows and hydrates only a page', async () => {
    const createdAt = new Date('2024-01-01T00:00:00Z');
    await db.visit.createMany({
      data: Array.from({ length: 1000 }, (_, n) => ({
        id: `bulk-visit-${n}`,
        patientId,
        doctorId,
        complaints: '[]',
      })),
    });
    await db.prescription.createMany({
      data: Array.from({ length: 1000 }, (_, n) => ({
        id: `bulk-rx-${n}`,
        visitId: `bulk-visit-${n}`,
        items: '[]',
        createdAt,
      })),
    });
    fixture.events.length = 0;
    fixture.queries.length = 0;
    const start = performance.now();
    const result = await queue.findAll(
      { status: PrescriptionQueueStatus.EXPIRED, limit: 10 },
      branchId,
    );
    const ms = performance.now() - start;
    expect(result.pagination.total).toBe(1002);
    expect(result.data).toHaveLength(10);
    expect(fixture.queries.length).toBeLessThanOrEqual(13);
    const hydration = fixture.events.find(
      (e) =>
        e.query.startsWith('SELECT') &&
        e.query.includes('."prescriptions"."id"'),
    )!;
    expect(
      JSON.parse(hydration.params)
        .filter((value: unknown) => typeof value === 'string')
        .sort(),
    ).toEqual(result.data.map((row) => row.prescriptionId).sort());
    console.log(
      JSON.stringify({
        fixture: '1014 prescriptions / queue page 10',
        ms,
        queries: fixture.queries.length,
        writes: fixture.queries.filter((sql) =>
          /^(INSERT|UPDATE|DELETE)/.test(sql),
        ).length,
      }),
    );
  });

  it('preserves stock filters, missing values, global quality, valuation and fuzzy results across pages', async () => {
    const rows = [
      {
        id: 'a',
        name: 'Tyrodin Cream',
        currentStock: 10,
        heldStock: 10,
        minStockLevel: 0,
        mrp: 20,
        gstRate: 0,
        category: 'Cream',
        metadata: JSON.stringify({ landingCostPerStockUnit: 0 }),
      },
      {
        id: 'b',
        name: 'Tyrobin Cream',
        currentStock: 3,
        heldStock: 0,
        minStockLevel: null,
        mrp: null,
        gstRate: null,
        category: null,
      },
      {
        id: 'c',
        name: 'Tyrodin Cream',
        currentStock: 0,
        heldStock: 0,
        minStockLevel: 0,
        mrp: 20,
        gstRate: 18,
        category: 'Cream',
      },
      {
        id: 'd',
        name: 'Expired Cream',
        currentStock: 2,
        heldStock: 0,
        minStockLevel: null,
        mrp: 30,
        gstRate: 0,
        expiryDate: new Date('2020-01-01'),
        category: 'Other',
      },
      {
        id: 'e',
        name: 'Tricosilk Pro Hair Solution',
        currentStock: 1,
        heldStock: 0,
        minStockLevel: null,
        mrp: 20,
        gstRate: 0,
        metadata: JSON.stringify({
          nameNormalization: {
            version: 1,
            aliases: ['TRICOSLIK PRO SOLUTION 60ML'],
            sourcePackLabel: '60 ml',
          },
        }),
      },
    ];
    await db.inventoryItem.createMany({
      data: rows.map((row) => ({
        branchId,
        type: 'MEDICINE' as const,
        unit: 'PIECES' as const,
        costPrice: 10,
        sellingPrice: 25,
        expiryDate: new Date('2099-01-01'),
        ...row,
      })),
    });
    await db.inventoryItem.create({
      data: {
        id: 'foreign-stock',
        branchId: otherBranch,
        name: 'Tyrodin Cream',
        type: 'MEDICINE',
        unit: 'PIECES',
        costPrice: 100,
        sellingPrice: 200,
        currentStock: 500,
      },
    });
    const onHand = await stock.stock(actor(), {
      batchView: 'ON_HAND',
      limit: 1,
      page: 2,
    });
    expect(onHand.rows.map((row) => row.id)).toEqual(['e']);
    expect(onHand.total).toBe(4);
    expect(onHand.valuation.current).toEqual({
      batches: 3,
      units: 14,
      PTR: 140,
      MRP: 295,
      MRPExcludingTax: 220,
      MRPTaxUnknownBatches: 1,
      landingKnown: 0,
      landingUnknownBatches: 2,
    });
    expect(onHand.valuation.expired).toEqual({
      batches: 1,
      units: 2,
      PTR: 20,
      MRP: 60,
      MRPExcludingTax: 60,
      MRPTaxUnknownBatches: 0,
      landingKnown: 0,
      landingUnknownBatches: 1,
    });
    expect(onHand.facets.category).toEqual(['Cream', 'Other']);
    expect(onHand.quality['GST missing']).toBe(1);
    expect(
      (await stock.stock(actor(), { gst: '0' })).rows.map((row) => row.id),
    ).toEqual(['d', 'e', 'a']);
    expect(
      (await stock.stock(actor(), { gst: 'MISSING' })).rows.map(
        (row) => row.id,
      ),
    ).toEqual(['b']);
    expect(
      (await stock.stock(actor(), { stock: 'LOW' })).rows.map((row) => row.id),
    ).toEqual(['a', 'c']);
    expect(
      (await stock.stock(actor(), { priceBasis: 'MRP', minPrice: '0' })).total,
    ).toBe(4);
    expect(
      (
        await stock.stock(actor(), {
          priceBasis: 'LANDING',
          minPrice: '0',
          maxPrice: '0',
        })
      ).rows.map((row) => row.id),
    ).toEqual(['a']);
    expect(
      (
        await stock.stock(actor(), {
          search: 'tyrodin cream',
          batchView: 'ON_HAND',
          limit: 1,
        })
      ).rows.map((row) => row.id),
    ).toEqual(['a']);
    const fuzzy = await stock.stock(actor(), {
      search: 'tyrodin cream',
      batchView: 'ON_HAND',
      limit: 1,
      page: 2,
    });
    expect(fuzzy.total).toBe(2);
    expect(fuzzy.rows.map((row) => [row.id, row.searchMatch.kind])).toEqual([
      ['b', 'fuzzy'],
    ]);
    expect(
      (await stock.stock(actor(), { search: 'tricoslik 60ml' })).rows.map(
        (row) => row.id,
      ),
    ).toEqual(['e']);
    expect(
      (
        await stock.stock(actor(), {
          search: 'inventory:c',
          batchView: 'ON_HAND',
        })
      ).total,
    ).toBe(0);
    expect(
      (
        await stock.stock(actor(), {
          sortBy: 'available',
          sortOrder: 'desc',
          limit: 2,
        })
      ).rows.map((row) => row.id),
    ).toEqual(['b', 'd']);
    expect(
      (
        await stock.stock(actor(), {
          missing: 'minimum',
          sortBy: 'currentStock',
        })
      ).rows.map((row) => row.id),
    ).toEqual(['e', 'd', 'b']);
  });

  it('scans fuzzy candidates in bounded batches without losing distant matches or loading full rows', async () => {
    await db.inventoryItem.createMany({
      data: Array.from({ length: 1200 }, (_, n) => ({
        id: `bulk-stock-${String(n).padStart(4, '0')}`,
        branchId,
        name: `Synthetic product ${n}`,
        type: 'MEDICINE',
        unit: 'PIECES',
        costPrice: 10,
        sellingPrice: 20,
        currentStock: 1,
      })),
    });
    await db.inventoryItem.update({
      where: { id: 'bulk-stock-1199' },
      data: { name: 'Tyrodin Cream' },
    });
    fixture.events.length = 0;
    fixture.queries.length = 0;
    const start = performance.now();
    const result = await stock.stock(actor(), {
      search: 'tyrodin cream',
      batchView: 'ON_HAND',
      sortBy: 'currentStock',
      limit: 1,
    });
    expect(result.total).toBe(3);
    expect(result.rows.map((row) => row.id)).toEqual(['bulk-stock-1199']);
    expect(result.valuation.current.PTR).toBe(140);
    const hydration = fixture.events.find(
      (e) =>
        e.query.startsWith('SELECT') &&
        e.query.includes('."inventory_items"."id"'),
    )!;
    expect(
      JSON.parse(hydration.params)
        .filter((value: unknown) => typeof value === 'string')
        .sort(),
    ).toEqual([branchId, 'bulk-stock-1199'].sort());
    expect(
      fixture.queries.filter((sql) => /^(INSERT|UPDATE|DELETE)/.test(sql)),
    ).toEqual([]);
    console.log(
      JSON.stringify({
        fixture: '1205 stock batches / fuzzy page 1',
        ms: performance.now() - start,
        queries: fixture.queries.length,
        hydratedRows: result.rows.length,
      }),
    );
  });

  it('retains source codes, reordered words, linked names and loose pack identity', async () => {
    const drug = await db.drug.create({
      data: {
        branchId,
        name: 'Folitrax Tablet (loose tablets)',
        manufacturerName: 'Synthetic',
        price: 20,
        packSizeLabel: '10 tablets',
      },
    });
    await db.inventoryItem.create({
      data: {
        id: 'linked-name',
        branchId,
        name: 'Folitrax Tablet',
        type: 'MEDICINE',
        unit: 'PIECES',
        currentStock: 12,
        costPrice: 10,
        sellingPrice: 20,
        metadata: JSON.stringify({
          sourceItemCode: 'M12345',
          nameNormalization: { version: 1, aliases: ['FOLITRAX TAB'] },
        }),
        drugs: { connect: { id: drug.id } },
      },
    });
    await db.inventoryItem.create({
      data: {
        id: 'punctuated',
        branchId,
        name: 'T-Bact Ointment',
        type: 'MEDICINE',
        unit: 'PACKS',
        currentStock: 2,
        costPrice: 10,
        sellingPrice: 20,
      },
    });
    expect(
      (await stock.stock(actor(), { search: 'ointment t bact' })).rows.map(
        (row) => row.id,
      ),
    ).toEqual(['punctuated']);
    const found = await stock.stock(actor(), { search: 'M12345' });
    expect(
      found.rows.map((row) => [
        row.id,
        row.productName,
        row.unit,
        row.currentStock,
      ]),
    ).toEqual([
      ['linked-name', 'Folitrax Tablet (loose tablets)', 'PIECES', 12],
    ]);
    expect(
      (await stock.stock(actor(), { search: 'folitrax tab' })).rows.map(
        (row) => row.id,
      ),
    ).toEqual(['linked-name']);
    expect(
      (await stock.stock(actor(), { search: 't bact absentword' })).total,
    ).toBe(0);
    expect(
      (await stock.stock(actor(), { mapping: 'MAPPED' })).rows.map(
        (row) => row.id,
      ),
    ).toEqual(['linked-name']);
  });

  it('uses the latest count document for audit filters and counts the full result', async () => {
    await db.inventoryWorkflowDocument.createMany({
      data: [
        {
          id: 'count-old',
          branchId,
          kind: 'COUNT',
          status: 'POSTED',
          reference: 'old',
          requestKey: 'old',
          createdBy: doctorId,
          createdAt: stamp,
          payload: { lines: [{ inventoryId: 'a' }, { inventoryId: 'b' }] },
        },
        {
          id: 'count-new',
          branchId,
          kind: 'COUNT',
          status: 'AWAITING_APPROVAL',
          reference: 'new',
          requestKey: 'new',
          createdBy: doctorId,
          payload: { lines: [{ inventoryId: 'a' }] },
        },
      ],
    });
    const blocked = await stock.stock(actor(), { audit: 'BLOCKED', limit: 1 });
    expect(blocked.total).toBe(1);
    expect(blocked.rows.map((row) => [row.id, row.auditState])).toEqual([
      ['a', 'BLOCKED'],
    ]);
    expect(
      (await stock.stock(actor(), { audit: 'COMPLETED' })).rows.map(
        (row) => row.id,
      ),
    ).toEqual(['b']);
  });

  it('creates tasks only for explicit pull and preserves timestamps on repeated commands', async () => {
    await rx('staff-command', { items: [] });
    const detail = await queue.findOne('staff-command', branchId);
    expect(detail.dispenseTaskId).toBeUndefined();
    const pulled = await queue.pull('staff-command', branchId);
    const task = await db.pharmacyDispenseTask.findUniqueOrThrow({
      where: { id: pulled.data.dispenseTaskId },
    });
    expect(task.status).toBe('QUEUED');
    await db.pharmacyDispenseTask.update({
      where: { id: task.id },
      data: { status: 'PAID', paidAt: stamp },
    });
    await queue.pull('staff-command', branchId);
    await queue.updateTaskStatus(
      task.id,
      { status: 'PAID' as any },
      branchId,
      doctorId,
    );
    expect(
      (
        await db.pharmacyDispenseTask.findUniqueOrThrow({
          where: { id: task.id },
        })
      ).paidAt,
    ).toEqual(stamp);
  });

  it('preserves prescription line identity for legacy duplicates, stock, edits and removal', async () => {
    const items = [5, 10].map(dosage => ({ drugName: 'Drug X', dosage, dosageUnit: 'MG', quantity: 3, inventoryItemId: `identity-stock-${dosage}` }));
    await db.inventoryItem.createMany({ data: [5, 10].map(dosage => ({
      id: `identity-stock-${dosage}`, branchId, name: 'Drug X', type: 'MEDICINE', unit: 'PIECES',
      currentStock: dosage, costPrice: 1, sellingPrice: 2, batchNumber: `DOSE-${dosage}`,
    })) });
    await rx('line-identity', { items, task: 'IN_REVIEW' });
    const task = await db.pharmacyDispenseTask.findFirstOrThrow({ where: { prescriptionId: 'line-identity' } });
    await db.pharmacyDispenseTaskLine.createMany({ data: items.map((item, index) => ({
      id: `identity-line-${index}`, taskId: task.id, drugName: item.drugName, dosage: String(item.dosage),
      dosageUnit: item.dosageUnit, prescribedQuantity: 3, action: index ? 'ACCEPTED' : 'PENDING',
      originalText: JSON.stringify({ drugName: item.drugName, dosage: item.dosage, dosageUnit: item.dosageUnit, prescribedQuantity: 3 }),
    })) });
    const before = await db.pharmacyDispenseTaskLine.findMany({ where: { taskId: task.id }, orderBy: { id: 'asc' } });
    const detail = await queue.findOne('line-identity', branchId);
    expect(detail.medications.map(line => [line.lineId, line.action])).toEqual([['identity-line-0', 'pending'], ['identity-line-1', 'accepted']]);
    expect(await db.pharmacyDispenseTaskLine.findMany({ where: { taskId: task.id }, orderBy: { id: 'asc' } })).toEqual(before);
    const pulled = (await queue.pull('line-identity', branchId)).data;
    expect(pulled.medications.map(line => [line.lineId, line.recommendedBatchNumber])).toEqual([['identity-line-0', 'DOSE-5'], ['identity-line-1', 'DOSE-10']]);
    const accepted = await queue.updateTaskLine(task.id, 'identity-line-0', { action: 'ACCEPTED' as any }, branchId, doctorId);
    expect(accepted.dispenseStatus).toBe('READY_TO_BILL');
    const reordered = [items[1], items[0], { ...items[0] }];
    await db.prescription.update({ where: { id: 'line-identity' }, data: { items: JSON.stringify(reordered) } });
    await expect(queue.updateTaskStatus(task.id, { status: 'READY_TO_BILL' as any }, branchId, doctorId)).rejects.toThrow('Review every available medicine');
    const duplicate = (await queue.pull('line-identity', branchId)).data;
    expect(duplicate.medications.map(line => line.action)).toEqual(['accepted', 'accepted', 'pending']);
    expect(duplicate.medications.slice(0, 2).map(line => line.lineId)).toEqual(['identity-line-1', 'identity-line-0']);
    expect(new Set(duplicate.medications.map(line => line.lineId)).size).toBe(3);
    await queue.pull('line-identity', branchId);
    expect(await db.pharmacyDispenseTaskLine.count({ where: { taskId: task.id } })).toBe(3);
    const changed = [{ ...items[0], dosage: 20 }];
    await db.prescription.update({ where: { id: 'line-identity' }, data: { items: JSON.stringify(changed) } });
    expect((await queue.findOne('line-identity', branchId)).medications[0].action).toBe('pending');
    await expect(queue.updateTaskLine(task.id, 'identity-line-0', { action: 'ACCEPTED' as any }, branchId, doctorId)).rejects.toThrow('Prescription line changed');
    const replacement = (await queue.pull('line-identity', branchId)).data.medications[0];
    expect(replacement.lineId).not.toBe('identity-line-0');
    const finished = await queue.updateTaskLine(task.id, replacement.lineId!, { action: 'ACCEPTED' as any }, branchId, doctorId);
    expect(finished.dispenseStatus).toBe('READY_TO_BILL');
    await queue.updateTaskStatus(task.id, { status: 'READY_TO_BILL' as any }, branchId, doctorId);
  });

  it('binds indistinguishable legacy prescription duplicates once each and retains their reviews', async () => {
    const item = { drugName: 'Legacy medicine', dosage: 5, dosageUnit: 'MG', quantity: 2 };
    await rx('legacy-equal-lines', { items: [item, item], task: 'IN_REVIEW' });
    const task = await db.pharmacyDispenseTask.findFirstOrThrow({ where: { prescriptionId: 'legacy-equal-lines' } });
    await db.pharmacyDispenseTaskLine.createMany({ data: [
      { id: 'legacy-line-z', action: 'PENDING' as const, createdAt: stamp },
      { id: 'legacy-line-a', action: 'ACCEPTED' as const, createdAt: new Date(stamp.getTime() + 1000) },
    ].map(line => ({ ...line, taskId: task.id, drugName: item.drugName, dosage: '5', dosageUnit: 'MG', prescribedQuantity: 2 })) });
    const detail = await queue.findOne('legacy-equal-lines', branchId);
    expect(detail.medications.map(line => [line.lineId, line.action])).toEqual([['legacy-line-z', 'pending'], ['legacy-line-a', 'accepted']]);
    const pulled = (await queue.pull('legacy-equal-lines', branchId)).data;
    expect(pulled.medications.map(line => line.lineId)).toEqual(['legacy-line-z', 'legacy-line-a']);
    expect(new Set(pulled.medications.map(line => line.sourceLineKey)).size).toBe(2);
    expect((await queue.pull('legacy-equal-lines', branchId)).data.medications.map(line => line.action)).toEqual(['pending', 'accepted']);
    expect(await db.pharmacyDispenseTaskLine.count({ where: { taskId: task.id } })).toBe(2);
  });

  it('credits invoice quantities once across repeated prescription lines in detail and filtered pages', async () => {
    const items = [5, 10].map(dosage => ({ drugName: 'Azithral 500', drugId, dosage, quantity: 3 }));
    await rx('invoice-line-identity', { items, invoice: 'CONFIRMED', quantity: 4 });
    const detail = await queue.findOne('invoice-line-identity', branchId);
    expect(detail.medications.map(line => line.dispensedQuantity)).toEqual([3, 1]);
    expect(detail.status).toBe('partial');
    expect((await queue.findAll({ status: PrescriptionQueueStatus.PARTIAL, limit: 100 }, branchId)).data.map(row => row.prescriptionId)).toContain('invoice-line-identity');
    await db.pharmacyInvoiceItem.updateMany({ where: { invoice: { prescriptionId: 'invoice-line-identity' } }, data: { quantity: 6 } });
    expect((await queue.findOne('invoice-line-identity', branchId)).medications.map(line => line.dispensedQuantity)).toEqual([3, 3]);
    expect((await queue.findAll({ status: PrescriptionQueueStatus.DISPENSED, limit: 100 }, branchId)).data.map(row => row.prescriptionId)).toContain('invoice-line-identity');
  });

  it('requires saved review of every available line before marking a task Ready', async () => {
    await rx('ready-review-guard', { task: 'IN_REVIEW', items: [{ drugName: 'Azithral 500' }, { drugName: 'Other medicine' }] });
    const task = await db.pharmacyDispenseTask.findFirstOrThrow({ where: { prescriptionId: 'ready-review-guard' } });
    const markReady = () => queue.updateTaskStatus(task.id, { status: 'READY_TO_BILL' as any }, branchId, doctorId);
    const readTask = () => db.pharmacyDispenseTask.findUniqueOrThrow({ where: { id: task.id }, include: { lines: { orderBy: { id: 'asc' } } } });
    const empty = await readTask();
    await expect(markReady()).rejects.toThrow('Review every available medicine');
    expect(await readTask()).toEqual(empty);
    await db.pharmacyDispenseTaskLine.createMany({ data: [
      { id: 'ready-line-1', taskId: task.id, drugName: 'Azithral 500', action: 'ACCEPTED' },
      { id: 'ready-line-2', taskId: task.id, drugName: 'Other medicine', action: 'PENDING' },
    ] });
    const pending = await readTask();
    await expect(markReady()).rejects.toThrow('Review every available medicine');
    expect(await readTask()).toEqual(pending);
    await queue.updateTaskLine(task.id, 'ready-line-2', { action: 'UNAVAILABLE' as any }, branchId, doctorId);
    const partial = await readTask();
    expect(partial.status).toBe('PARTIALLY_FILLED');
    await expect(markReady()).rejects.toThrow('Review every available medicine');
    expect(await readTask()).toEqual(partial);
    await queue.updateTaskLine(task.id, 'ready-line-2', { action: 'ACCEPTED' as any }, branchId, doctorId);
    const ready = await readTask();
    expect(ready.status).toBe('READY_TO_BILL');
    await markReady();
    expect((await readTask()).readyToBillAt).toEqual(ready.readyToBillAt);
  });

  it('enforces stored lifecycle and validity before every prescription-backed command', async () => {
    for (const [name, status, validUntil] of [
      ['draft', 'DRAFT', null], ['cancelled', 'CANCELLED', null], ['closed', 'COMPLETED', null],
      ['expired-state', 'EXPIRED', null], ['expired-time', 'ACTIVE', new Date('2020-01-01')],
    ] as const) {
      const id = `lifecycle-${name}`;
      await rx(id, { task: 'IN_REVIEW' });
      await db.$executeRawUnsafe(`UPDATE prescriptions SET status = '${status}', "validUntil" = $1 WHERE id = $2`, validUntil, id);
      const task = await db.pharmacyDispenseTask.findFirstOrThrow({ where: { prescriptionId: id } });
      await db.pharmacyDispenseTaskLine.create({ data: { id: `line-${id}`, taskId: task.id, drugName: 'Azithral 500' } });
      const before = await db.pharmacyDispenseTask.findUnique({ where: { id: task.id }, include: { lines: true } });
      await expect(queue.pull(id, branchId)).rejects.toThrow('not active or has expired');
      await expect(queue.updateTaskStatus(task.id, { status: 'IN_REVIEW' as any }, branchId, doctorId)).rejects.toThrow('not active or has expired');
      await expect(queue.updateTaskLine(task.id, `line-${id}`, { action: 'ACCEPTED' as any }, branchId, doctorId)).rejects.toThrow('not active or has expired');
      await expect(queue.linkInventory(id, 0, 'a', branchId, doctorId, 'stale')).rejects.toThrow('not active or has expired');
      expect(await db.pharmacyDispenseTask.findUnique({ where: { id: task.id }, include: { lines: true } })).toEqual(before);
      if (['DRAFT', 'CANCELLED'].includes(status)) {
        await expect(queue.findOne(id, branchId)).rejects.toThrow('Prescription not found');
        expect((await queue.findAll({ limit: 100 }, branchId)).data.some(row => row.prescriptionId === id)).toBe(false);
      } else {
        expect(await queue.findOne(id, branchId)).toMatchObject({ status: 'expired', dispensingEligible: false });
        expect((await queue.findAll({ status: PrescriptionQueueStatus.EXPIRED, limit: 100 }, branchId)).data.some(row => row.prescriptionId === id)).toBe(true);
      }
    }
    await rx('historical-completed', { invoice: 'COMPLETED' });
    await db.$executeRawUnsafe(`UPDATE prescriptions SET status = 'COMPLETED', "validUntil" = '2020-01-01' WHERE id = 'historical-completed'`);
    expect(await queue.findOne('historical-completed', branchId)).toMatchObject({ status: 'dispensed', dispensingEligible: false });
    expect((await queue.findAll({ status: PrescriptionQueueStatus.DISPENSED, limit: 100 }, branchId)).data.map(row => row.prescriptionId)).toContain('historical-completed');
  });

  it('resolves pg_trgm operators through the disposable schema search path', async () => {
    const [row] = await db.$queryRaw<
      { distance: number }[]
    >`SELECT 'cream'::text <->> 'cream'::text AS distance`;
    expect(row.distance).toBe(0);
  });
});
