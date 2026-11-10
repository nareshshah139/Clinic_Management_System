import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import { InvoiceNumbersService } from '../../../shared/numbering/invoice-numbers.service';
import { PharmacyInvoiceService } from '../pharmacy-invoice.service';
import { PharmacySalesRegisterService } from '../pharmacy-sales-register.service';
import { InventoryWorkflowService } from '../../inventory/inventory-workflow.service';
import { PharmacyComplianceService } from '../pharmacy-compliance.service';
import { clinicDay } from '../clinic-day';

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
      ['cream', 'Synthetic Cream', 50, 40],
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

  it('serialises a discount edit against a sales return: never a return at pre-edit terms after the edit', async () => {
    const pause = () => new Promise((resolve) => setTimeout(resolve, 400));
    const slowSaleReads = new Proxy(db, {
      get(target, prop) {
        if (prop !== '$transaction') return (target as any)[prop];
        return (run: (tx: any) => Promise<unknown>, options: unknown) =>
          target.$transaction(
            (tx: any) =>
              run(
                new Proxy(tx, {
                  get(client, model) {
                    if (model !== 'stockTransaction') return client[model];
                    return new Proxy(client.stockTransaction, {
                      get(delegate, method) {
                        if (method !== 'findMany') return delegate[method];
                        return async (args: unknown) => {
                          const rows = await delegate.findMany(args);
                          await pause();
                          return rows;
                        };
                      },
                    });
                  },
                }),
              ),
            options as any,
          );
      },
    });
    const race = async (round: string, order: 'together' | 'edit reads first' | 'return reads first') => {
      const workflow = new InventoryWorkflowService((order === 'return reads first' ? slowSaleReads : db) as any);
      const sold = await invoices.checkout({ ...cream(1), requestKey: `race-${round}` }, 'branch', 'asha');
      const sale = await db.stockTransaction.findFirstOrThrow({ where: { branchId: 'branch', reference: `INV-${sold.invoiceNumber}` } });
      const original = (PharmacyInvoiceService.prototype as any).salesReturnsAgainst;
      const check = jest.spyOn(invoices as any, 'salesReturnsAgainst');
      if (order === 'edit reads first')
        check.mockImplementation(async (...args: unknown[]) => {
          const found = await original.apply(invoices, args);
          await pause();
          return found;
        });
      const editing = invoices.reviseDiscount(
        sold.id,
        { expectedVersion: sold.mutationVersion, billDiscount: { kind: 'PERCENT', value: 10 }, lines: [], reason: 'Loyalty discount' },
        'branch',
        'asha',
      );
      if (order === 'edit reads first') await new Promise((resolve) => setTimeout(resolve, 100));
      const returning = workflow.saveDocument({ id: 'doctor', branchId: 'branch', role: 'DOCTOR' }, {
        kind: 'SALES_RETURN',
        reference: `SR-${round}`,
        requestKey: `sr-${round}`,
        salesInvoiceId: sold.id,
        payload: { lines: [{ inventoryId: 'cream-batch', sourceLineId: sale.id, quantity: 1, disposition: 'RESTOCK' }] },
      } as any);
      const [edit, ret] = await Promise.allSettled([editing, returning]);
      check.mockRestore();
      const bill = await db.pharmacyInvoice.findUniqueOrThrow({ where: { id: sold.id } });
      const line = ret.status === 'fulfilled' ? (ret.value as any).payload.lines[0] : null;
      return [
        edit.status === 'fulfilled' ? 'edit saved' : `edit refused: ${(edit.reason as Error).message.replace(round, '#')}`,
        bill.totalAmount,
        line ? [line.taxable, line.tax] : `return refused: ${(ret as PromiseRejectedResult).reason?.message}`,
      ];
    };
    const refused = 'edit refused: This bill has a sales return (SR-#), so its discount can no longer be changed. Correct it through the return.';
    expect([
      await race('A', 'edit reads first'),
      await race('B', 'return reads first'),
    ]).toEqual([
      [refused, 56, [50, 6]],
      ['edit saved', 50.4, [45, 5.4]],
    ]);
    const allowed = [JSON.stringify(['edit saved', 50.4, [45, 5.4]]), JSON.stringify([refused, 56, [50, 6]])];
    for (let round = 0; round < 6; round++)
      expect(allowed).toContain(JSON.stringify(await race(`T${round}`, 'together')));
  }, 120000);

  it('revises return terms exactly per sold unit, or refuses when a return could not tell which price applies', async () => {
    const workflow = new InventoryWorkflowService(db as any);
    const twice = {
      ...bill,
      paymentMethod: 'CASH' as const,
      items: [
        { drugId: 'cream', quantity: 1, unitPrice: 50, discountPercent: 0, taxPercent: 12 },
        { drugId: 'cream', quantity: 1, unitPrice: 50, discountPercent: 0, taxPercent: 12 },
      ],
    };
    const sold = await invoices.checkout({ ...twice, requestKey: 'cream-twice' }, 'branch', 'asha');
    const second = sold.items[1].id;
    const edit = (version: number, change: object) =>
      invoices.reviseDiscount(sold.id, { expectedVersion: version, lines: [], reason: 'Agreed discount', ...change } as any, 'branch', 'asha');
    expect(await failure(edit(sold.mutationVersion, { lines: [{ id: second, discountPercent: 10 }] }))).toBe(
      '409: Synthetic Cream is on this bill more than once at different prices, so a return could not tell which price to refund. Give its lines the same discount, or correct the bill through a return.',
    );
    const revised = await edit(sold.mutationVersion, { billDiscount: { kind: 'PERCENT', value: 10 } });
    const sale = await db.stockTransaction.findFirstOrThrow({ where: { branchId: 'branch', reference: `INV-${sold.invoiceNumber}` } });
    const returned = await workflow.saveDocument({ id: 'doctor', branchId: 'branch', role: 'DOCTOR' }, {
      kind: 'SALES_RETURN',
      reference: 'SR-TWICE',
      requestKey: 'sr-twice',
      salesInvoiceId: sold.id,
      payload: { lines: [{ inventoryId: 'cream-batch', sourceLineId: sale.id, quantity: 1, disposition: 'RESTOCK' }] },
    } as any);
    expect([revised.totalAmount, [returned.payload.lines[0].taxable, returned.payload.lines[0].tax]]).toEqual([100.8, [45, 5.4]]);

    await db.drug.create({ data: { id: 'gel', name: 'Synthetic Gel', price: 80, manufacturerName: 'Synthetic', packSizeLabel: '1', branchId: 'branch' } });
    await db.drug.create({ data: { id: 'gel-twin', name: 'Synthetic Gel Twin', price: 80, manufacturerName: 'Synthetic', packSizeLabel: '1', branchId: 'branch' } });
    await db.inventoryItem.create({
      data: {
        id: 'gel-batch', branchId: 'branch', name: 'Synthetic Gel', type: 'MEDICINE', costPrice: 40, sellingPrice: 80, unit: 'PIECES',
        currentStock: 5, stockStatus: 'IN_STOCK', expiryDate: new Date('2099-01-01'), drugs: { connect: { id: 'gel' } },
      },
    });
    const gel = await invoices.checkout(
      { ...bill, paymentMethod: 'CASH' as const, requestKey: 'gel-bill', items: [{ drugId: 'gel', quantity: 1, unitPrice: 80, discountPercent: 0, taxPercent: 12 }] },
      'branch',
      'asha',
    );
    await db.inventoryItem.update({ where: { id: 'gel-batch' }, data: { drugs: { connect: { id: 'gel-twin' } } } });
    expect(
      await failure(
        invoices.reviseDiscount(gel.id, { expectedVersion: gel.mutationVersion, billDiscount: { kind: 'PERCENT', value: 10 }, lines: [], reason: 'x' }, 'branch', 'asha'),
      ),
    ).toBe(
      '409: A batch sold on this bill is now linked to more than one product, so its return price cannot be revised exactly. Correct the bill through a return.',
    );
    expect((await db.pharmacyInvoice.findUniqueOrThrow({ where: { id: gel.id } })).totalAmount).toBe(89.6);
  }, 60000);

  it('keeps refund and payment request keys apart, so a reused key never returns the other kind', async () => {
    const sold = await invoices.checkout({ ...cream(1), paymentMethod: 'INSURANCE' as any, requestKey: 'insured-cream' }, 'branch', 'asha');
    const receipt = await invoices.addPayment(sold.id, { requestKey: 'same-key', amount: 56, method: 'CASH' }, 'branch');
    await invoices.reviseDiscount(
      sold.id,
      { expectedVersion: (await db.pharmacyInvoice.findUniqueOrThrow({ where: { id: sold.id } })).mutationVersion, billDiscount: { kind: 'PERCENT', value: 10 }, lines: [], reason: 'Insurer discount' },
      'branch',
      'asha',
    );
    const asRefund = await failure(invoices.recordRefund(sold.id, { requestKey: 'same-key', amount: 56, method: 'CASH' }, 'branch'));
    const refund = await invoices.recordRefund(sold.id, { requestKey: 'same-key', amount: 5.6, method: 'CASH' }, 'branch');
    const refundReplay = await invoices.recordRefund(sold.id, { requestKey: 'same-key', amount: 5.6, method: 'CASH' }, 'branch');
    const receiptReplay = await invoices.addPayment(sold.id, { requestKey: 'same-key', amount: 56, method: 'CASH' }, 'branch');
    expect([
      asRefund,
      [refund.status, refund.amount, refundReplay.id === refund.id],
      [receiptReplay.id === receipt.id, receiptReplay.status, receiptReplay.amount],
      await db.pharmacyPayment.count({ where: { invoiceId: sold.id } }),
    ]).toEqual([
      '400: Only ₹5.60 is due back on this bill. Reload it to see the latest amounts.',
      ['REFUNDED', -5.6, true],
      [true, 'COMPLETED', 56],
      2,
    ]);
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
  it('reports item margin at the discounted value the bill was charged, before and after a discount edit', async () => {
    await db.drug.create({
      data: { id: 'serum', name: 'Synthetic Serum', price: 100, manufacturerName: 'Synthetic', packSizeLabel: '1', branchId: 'branch' },
    });
    await db.inventoryItem.create({
      data: {
        id: 'serum-batch', branchId: 'branch', name: 'Synthetic Serum', type: 'MEDICINE', costPrice: 40, sellingPrice: 100,
        gstRate: 12, unit: 'PIECES', currentStock: 10, stockStatus: 'IN_STOCK', expiryDate: new Date('2099-01-01'),
        drugs: { connect: { id: 'serum' } },
      },
    });
    const sold = await invoices.checkout(
      {
        ...bill,
        paymentMethod: 'CASH',
        requestKey: 'serum-margin',
        billDiscount: { kind: 'PERCENT', value: 10 },
        items: [{ drugId: 'serum', quantity: 2, unitPrice: 100, discountPercent: 0, taxPercent: 12 }],
      } as any,
      'branch',
      'asha',
    );
    const today = clinicDay(new Date());
    const margin = async () => {
      const report: any = await new PharmacyComplianceService(db as any).getItemMargin(
        { startDate: today, endDate: today, search: 'serum', searchField: 'NAME' } as any,
        'branch',
      );
      return report.rows.map((row: any) => [row.name, row.saleQuantity, row.salesAmount, row.purchase, row.netGst, row.profit, row.profitPercent]);
    };
    // 2 x 100 at 12%, 10% bill discount: taxable 180, GST 21.60, total 201.60; cost 2 x 40 + 12% input GST = 89.60.
    expect([sold.totalAmount, await margin()]).toEqual([201.6, [['Synthetic Serum', 2, 201.6, 89.6, 12, 100, 55.56]]]);

    await invoices.reviseDiscount(
      sold.id,
      { expectedVersion: sold.mutationVersion, billDiscount: { kind: 'PERCENT', value: 20 }, lines: [], reason: 'Loyalty discount' } as any,
      'branch',
      'asha',
    );
    // Revised to 20%: taxable 160, GST 19.20, total 179.20; profit is the taxable value less cost, 80.
    expect(await margin()).toEqual([['Synthetic Serum', 2, 179.2, 89.6, 9.6, 80, 50]]);
  }, 60000);
});
