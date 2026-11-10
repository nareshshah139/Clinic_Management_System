import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import { InvoiceNumbersService } from '../../../shared/numbering/invoice-numbers.service';
import { PharmacyInvoiceService } from '../pharmacy-invoice.service';
import { PharmacySalesRegisterService } from '../pharmacy-sales-register.service';
import { InventoryWorkflowService } from '../../inventory/inventory-workflow.service';

const databaseTests = process.env.SALES_REGISTER_TEST_DATABASE_URL
  ? describe
  : describe.skip;

databaseTests('Pharmacy bill numbers and discounts on PostgreSQL', () => {
  const schema = `bill_discount_${randomUUID().replaceAll('-', '')}`;
  let admin: PrismaClient;
  let db: PrismaClient;
  let created = false;
  let invoices: PharmacyInvoiceService;
  let register: PharmacySalesRegisterService;

  const lines = [
    {
      drugId: 'cream',
      inventoryItemId: 'cream-batch',
      quantity: 2,
      unitPrice: 50,
      discountPercent: 10,
      taxPercent: 12,
      dosage: 'thin layer',
      frequency: 'twice daily',
      duration: '7 days',
      instructions: 'after bath',
    },
    {
      drugId: 'tablet',
      quantity: 1,
      unitPrice: 30,
      discountPercent: 0,
      taxPercent: 5,
    },
    {
      drugId: 'shampoo',
      quantity: 1,
      unitPrice: 200,
      discountPercent: 5,
      taxPercent: 18,
    },
  ];
  const bill = {
    patientId: 'patient',
    doctorId: 'doctor',
    paymentMethod: 'UPI' as const,
    billingName: 'Meera Shah',
    billingPhone: '9876543210',
    notes: 'Collect at 5 pm',
    items: lines,
  };

  const stock = async () =>
    Object.fromEntries(
      (
        await db.inventoryItem.findMany({
          select: { id: true, currentStock: true },
          orderBy: { id: 'asc' },
        })
      ).map((item) => [item.id, item.currentStock]),
    );
  const year = new Date().getFullYear();
  const sales = async (invoiceNumber: string) =>
    db.stockTransaction.count({ where: { reference: `INV-${invoiceNumber}` } });
  const failure = (promise: Promise<unknown>) =>
    promise.then(
      () => 'resolved',
      (error) => `${error.getStatus?.() ?? error.name}: ${error.message}`,
    );

  beforeAll(async () => {
    const url = new URL(process.env.SALES_REGISTER_TEST_DATABASE_URL!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
      throw new Error('Database tests require local PostgreSQL');
    url.searchParams.set('schema', 'public');
    admin = new PrismaClient({ datasourceUrl: url.toString() });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    created = true;
    url.searchParams.set('schema', schema);
    execFileSync(
      process.execPath,
      [
        require.resolve('prisma/build/index.js'),
        'db',
        'push',
        '--skip-generate',
        '--schema',
        path.resolve('prisma/schema.prisma'),
      ],
      {
        stdio: 'pipe',
        env: {
          ...process.env,
          DATABASE_URL: url.toString(),
          PRISMA_GENERATE_SKIP_AUTOINSTALL: '1',
        },
      },
    );
    db = new PrismaClient({ datasourceUrl: url.toString() });

    await db.branch.create({
      data: { id: 'branch', name: 'Skin Care Clinic', address: 'Synthetic' },
    });
    for (const [id, role] of [
      ['asha', 'PHARMACIST'],
      ['doctor', 'DOCTOR'],
    ] as const)
      await db.user.create({
        data: {
          id,
          firstName: id === 'asha' ? 'Asha' : 'Ravi',
          lastName: 'Synthetic',
          email: `${id}@example.test`,
          password: 'x',
          role,
          branchId: 'branch',
        },
      });
    await db.patient.create({
      data: {
        id: 'patient',
        name: 'Meera Shah',
        gender: 'F',
        phone: '9876543210',
        branchId: 'branch',
      },
    });
    for (const [id, name, price, onHand] of [
      ['cream', 'Synthetic Cream', 50, 20],
      ['tablet', 'Synthetic Tablet', 30, 5],
      ['shampoo', 'Synthetic Shampoo', 200, 3],
    ] as const) {
      await db.drug.create({
        data: {
          id,
          name,
          price,
          manufacturerName: 'Synthetic',
          packSizeLabel: '1',
          branchId: 'branch',
        },
      });
      await db.inventoryItem.create({
        data: {
          id: `${id}-batch`,
          branchId: 'branch',
          name,
          type: 'MEDICINE',
          costPrice: price / 2,
          sellingPrice: price,
          unit: 'PIECES',
          currentStock: onHand,
          stockStatus: 'IN_STOCK',
          expiryDate: new Date('2099-01-01'),
          drugs: { connect: { id } },
        },
      });
    }

    invoices = new PharmacyInvoiceService(
      db as any,
      new InvoiceNumbersService(db as any),
    );
    register = new PharmacySalesRegisterService(db as any);
  }, 120000);

  afterAll(async () => {
    await db?.$disconnect();
    if (created)
      await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin?.$disconnect();
  });

  const cream = (quantity = 1) => ({
    ...bill,
    paymentMethod: 'CASH' as const,
    items: [{ drugId: 'cream', quantity, unitPrice: 50, discountPercent: 0, taxPercent: 12 }],
  });
  const numbers = (ids: string[]) =>
    Promise.all(
      ids.map(async (id) => (await db.pharmacyInvoice.findUniqueOrThrow({ where: { id } })).invoiceNumber),
    );
  const lastIssued = async () =>
    (await db.numberSequence.findFirst({ where: { type: 'PHARMACY', periodKey: String(year) } }))?.lastNumber ?? 0;

  it('numbers bills only when they are finished, so discarded drafts and failed finishes leave no gap', async () => {
    const [a, b, c] = [
      await invoices.create(cream(), 'branch', 'asha'),
      await invoices.create(cream(), 'branch', 'asha'),
      await invoices.create(cream(), 'branch', 'asha'),
    ];
    expect([[a, b, c].map((draft) => draft.invoiceNumber.startsWith('DRAFT-')), await lastIssued()]).toEqual([
      [true, true, true],
      0,
    ]);
    await invoices.remove(b.id, 'branch', b.mutationVersion);

    const finish = (draft: { id: string; mutationVersion: number }, requestKey: string) =>
      invoices.checkout({ ...cream(), requestKey, draftId: draft.id, draftVersion: draft.mutationVersion }, 'branch', 'asha');
    const collect = jest
      .spyOn(invoices as any, 'collectCheckoutPayment')
      .mockRejectedValueOnce(new Error('receipt printer offline'));
    expect(await failure(finish(a, 'finish-a-fails'))).toBe('Error: receipt printer offline');
    collect.mockRestore();
    expect([
      await lastIssued(),
      (await db.pharmacyInvoice.findUniqueOrThrow({ where: { id: a.id } })).status,
      await db.stockTransaction.count(),
    ]).toEqual([0, 'DRAFT', 0]);

    await finish(a, 'finish-a');
    await finish(c, 'finish-c');
    const walkIn = await invoices.checkout({ ...cream(), requestKey: 'new-bill' }, 'branch', 'asha');
    const together = await Promise.all([
      invoices.checkout({ ...cream(), requestKey: 'together-1' }, 'branch', 'asha'),
      invoices.checkout({ ...cream(), requestKey: 'together-2' }, 'branch', 'asha'),
    ]);
    const viaStatus = await invoices.create(cream(), 'branch', 'asha');
    await invoices.updateStatus(viaStatus.id, 'CONFIRMED', 'branch', 'asha');

    const legacy = await invoices.create(cream(), 'branch', 'asha');
    await db.pharmacyInvoice.update({ where: { id: legacy.id }, data: { invoiceNumber: `PHI-${year}-100` } });
    await invoices.updateStatus(legacy.id, 'CONFIRMED', 'branch', 'asha');

    expect([
      await numbers([a.id, c.id, walkIn.id]),
      (await numbers(together.map((bill) => bill.id))).sort(),
      await numbers([viaStatus.id, legacy.id]),
      await lastIssued(),
      await db.pharmacyInvoice.count({ where: { id: b.id } }),
      await db.stockTransaction.count({ where: { reference: `INV-PHI-${year}-001` } }),
    ]).toEqual([
      [`PHI-${year}-001`, `PHI-${year}-002`, `PHI-${year}-003`],
      [`PHI-${year}-004`, `PHI-${year}-005`],
      [`PHI-${year}-006`, `PHI-${year}-100`],
      6,
      0,
      1,
    ]);
    expect(await failure(invoices.getPrintData(viaStatus.id, 'branch'))).toBe('resolved');
    const unfinished = await invoices.create(cream(), 'branch', 'asha');
    expect(await failure(invoices.getPrintData(unfinished.id, 'branch'))).toBe(
      '409: Finish this bill before printing it. A draft is not a tax invoice and has no bill number yet.',
    );
  });

  it('files a bill finished at 00:30 IST on 1 January under the new year, whatever the server clock zone', async () => {
    jest.useFakeTimers({
      now: new Date('2030-12-31T19:00:00Z'),
      doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask', 'hrtime', 'performance'],
    });
    try {
      const sold = await invoices.checkout({ ...cream(), requestKey: 'new-year-bill' }, 'branch', 'asha');
      expect([sold.invoiceNumber, sold.invoiceDate.toISOString()]).toEqual(['PHI-2031-001', '2030-12-31T19:00:00.000Z']);
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps each branch’s series consecutive: a number another branch holds is not skipped', async () => {
    await db.branch.create({ data: { id: 'branch-2', name: 'Second Clinic', address: 'Synthetic' } });
    const next = `PHI-${year}-${String((await lastIssued()) + 1).padStart(3, '0')}`;
    await db.pharmacyInvoice.create({
      data: {
        invoiceNumber: next,
        patientId: 'patient',
        branchId: 'branch-2',
        subtotal: 50,
        totalAmount: 50,
        paymentMethod: 'CASH',
        billingName: 'Ravi',
        billingPhone: '9000000000',
        status: 'CONFIRMED',
      },
    });
    const sold = await invoices.checkout({ ...cream(), requestKey: 'beside-branch-2' }, 'branch', 'asha');
    expect([
      sold.invoiceNumber,
      (await db.pharmacyInvoice.findMany({ where: { invoiceNumber: next }, select: { branchId: true }, orderBy: { branchId: 'asc' } })).map((bill) => bill.branchId),
    ]).toEqual([next, ['branch', 'branch-2']]);
  });

  it('applies a bill discount before tax, keeps it on the draft, and revises a paid bill into a refund due', async () => {
    const discounted = {
      ...bill,
      paymentMethod: 'CASH' as const,
      billDiscount: { kind: 'AMOUNT' as const, value: 25 },
    };
    const draft = await invoices.create(discounted, 'branch', 'asha');
    const reopened = await invoices.findOne(draft.id, 'branch');
    const lineMoney = (items: any[]) =>
      items.map((item) => [item.discountAmount, item.billDiscountAmount, item.taxAmount, item.totalAmount]);
    expect([
      reopened.billDiscountKind,
      reopened.billDiscountValue,
      reopened.subtotal,
      reopened.discountAmount,
      reopened.billDiscountAmount,
      reopened.taxAmount,
      reopened.totalAmount,
      lineMoney(reopened.items),
    ]).toEqual([
      'AMOUNT',
      25,
      330,
      45,
      25,
      42.75,
      327.75,
      [
        [10, 7.26, 9.93, 92.67],
        [0, 2.42, 1.38, 28.96],
        [10, 15.32, 31.44, 206.12],
      ],
    ]);

    const sold = await invoices.checkout(
      { ...discounted, requestKey: 'discounted-bill', draftId: draft.id, draftVersion: draft.mutationVersion },
      'branch',
      'asha',
    );
    const print = await invoices.getPrintData(sold.id, 'branch');
    expect([
      print.invoice.taxableAmount,
      print.invoice.lineDiscountAmount,
      print.invoice.billDiscountAmount,
      print.lines.map((line) => [line.taxableAmount, line.taxAmount]),
      print.gstSummary.map((slab) => [slab.taxPercent, slab.taxableAmount, slab.totalTax]),
      print.invoice.paidAmount,
      print.invoice.balanceAmount,
    ]).toEqual([
      285,
      20,
      25,
      [
        [82.74, 9.93],
        [27.58, 1.38],
        [174.68, 31.44],
      ],
      [
        [5, 27.58, 1.38],
        [12, 82.74, 9.93],
        [18, 174.68, 31.44],
      ],
      327.75,
      0,
    ]);

    const stockBefore = await stock();
    const stale = sold.mutationVersion;
    const revised = await invoices.reviseDiscount(
      sold.id,
      {
        expectedVersion: stale,
        billDiscount: { kind: 'PERCENT', value: 20 },
        lines: [{ id: sold.items.find((item: any) => item.drugId === 'tablet')!.id, discountPercent: 10 }],
        reason: 'Senior citizen discount agreed by the doctor',
      },
      'branch',
      'asha',
    );
    expect([
      revised.invoiceNumber,
      revised.totalAmount,
      revised.paidAmount,
      revised.balanceAmount,
      revised.paymentStatus,
      revised.revisions.map((r: any) => [r.reason, r.previousTotal, r.revisedTotal, r.revisedBy?.firstName]),
      await stock(),
    ]).toEqual([
      sold.invoiceNumber,
      282.68,
      327.75,
      -45.07,
      'COMPLETED',
      [['Senior citizen discount agreed by the doctor', 327.75, 282.68, 'Asha']],
      stockBefore,
    ]);
    expect(
      await failure(
        invoices.reviseDiscount(
          sold.id,
          { expectedVersion: stale, billDiscount: null, lines: [], reason: 'second tab' },
          'branch',
          'asha',
        ),
      ),
    ).toBe('409: This bill was changed after you opened it. Reload it to see the latest amounts.');

    const row = async () =>
      (
        await register.list(
          { register: 'sales', from: '2000-01-01', to: '2099-12-31', sortBy: 'billNo', sortDir: 'asc', page: 1, limit: 50 },
          'branch',
        )
      ).rows
        .filter((r) => r.recordId === sold.id)
        .map((r) => [r.amount, r.due, r.refundDue, r.refunded, Boolean(r.revisedAt)]);
    expect(await row()).toEqual([[282.68, 0, 45.07, 0, true]]);

    const refund = { requestKey: 'refund-1', amount: 45.07, method: 'CASH' as const };
    const first = await invoices.recordRefund(sold.id, refund, 'branch');
    const replay = await invoices.recordRefund(sold.id, refund, 'branch');
    expect([
      replay.id === first.id,
      await failure(invoices.recordRefund(sold.id, { ...refund, amount: 40 }, 'branch')),
      await failure(invoices.recordRefund(sold.id, { ...refund, requestKey: 'refund-2' }, 'branch')),
      await db.pharmacyPayment.findMany({
        where: { invoiceId: sold.id },
        select: { amount: true, method: true, status: true },
        orderBy: { createdAt: 'asc' },
      }),
      await row(),
    ]).toEqual([
      true,
      '409: Refund request key was already used with different refund details',
      '400: Nothing is due back on this bill.',
      [
        { amount: 327.75, method: 'CASH', status: 'COMPLETED' },
        { amount: -45.07, method: 'CASH', status: 'REFUNDED' },
      ],
      [[282.68, 0, 0, 45.07, true]],
    ]);
    expect(
      await db.auditLog.count({ where: { entity: 'PharmacyInvoice', entityId: sold.id, action: 'PHARMACY_BILL_DISCOUNT_REVISED' } }),
    ).toBe(1);

    const creamSale = await db.stockTransaction.findFirstOrThrow({
      where: { reference: `INV-${sold.invoiceNumber}`, itemId: 'cream-batch' },
    });
    const workflow = new InventoryWorkflowService(db as any);
    const returned = await workflow.saveDocument({ id: 'doctor', branchId: 'branch', role: 'DOCTOR' }, {
      kind: 'SALES_RETURN',
      reference: 'SR-DISC-1',
      requestKey: 'sr-disc-1',
      salesInvoiceId: sold.id,
      payload: { lines: [{ inventoryId: 'cream-batch', sourceLineId: creamSale.id, quantity: 1, disposition: 'RESTOCK' }] },
    } as any);
    expect([returned.payload.lines[0].taxable, returned.payload.lines[0].tax, returned.payload.lines[0].total]).toEqual([
      36,
      4.32,
      40.32,
    ]);
    expect(
      await failure(
        invoices.reviseDiscount(
          sold.id,
          { expectedVersion: revised.mutationVersion + 1, billDiscount: null, lines: [], reason: 'undo' },
          'branch',
          'asha',
        ),
      ),
    ).toBe(
      '409: This bill has a sales return (SR-DISC-1), so its discount can no longer be changed. Correct it through the return.',
    );
    const stillDraft = await invoices.create(cream(), 'branch', 'asha');
    expect(
      await failure(
        invoices.reviseDiscount(stillDraft.id, { expectedVersion: 0, billDiscount: null, lines: [], reason: 'x' }, 'branch', 'asha'),
      ),
    ).toBe('409: This bill is not finished yet. Change its discount in the draft.');
  }, 60000);
});
