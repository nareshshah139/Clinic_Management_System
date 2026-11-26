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

  it('finishes six bills checked out at the same moment in one branch, each with the next number', async () => {
    await db.drug.create({
      data: { id: 'balm', name: 'Synthetic Balm', price: 40, manufacturerName: 'Synthetic', packSizeLabel: '1', branchId: 'branch' },
    });
    await db.inventoryItem.create({
      data: {
        id: 'balm-batch',
        branchId: 'branch',
        name: 'Synthetic Balm',
        type: 'MEDICINE',
        costPrice: 20,
        sellingPrice: 40,
        unit: 'PIECES',
        currentStock: 12,
        stockStatus: 'IN_STOCK',
        expiryDate: new Date('2099-01-01'),
        drugs: { connect: { id: 'balm' } },
      },
    });
    const before = await lastIssued();
    const outcomes = await Promise.allSettled(
      [1, 2, 3, 4, 5, 6].map((terminal) =>
        invoices.checkout(
          {
            ...bill,
            paymentMethod: 'CASH' as const,
            requestKey: `terminal-${terminal}`,
            items: [{ drugId: 'balm', quantity: 1, unitPrice: 40, discountPercent: 0, taxPercent: 12 }],
          },
          'branch',
          'asha',
        ),
      ),
    );
    const sold = outcomes.flatMap((outcome) => (outcome.status === 'fulfilled' ? [outcome.value] : []));
    expect([
      outcomes.filter((outcome) => outcome.status === 'rejected').map((outcome) => String((outcome as PromiseRejectedResult).reason)),
      sold.map((bill) => bill.invoiceNumber).sort(),
      (await db.inventoryItem.findUniqueOrThrow({ where: { id: 'balm-batch' } })).currentStock,
    ]).toEqual([
      [],
      [1, 2, 3, 4, 5, 6].map((n) => `PHI-${year}-${String(before + n).padStart(3, '0')}`),
      6,
    ]);
  });

  it('finds bills by their issued number and never by a draft placeholder', async () => {
    const draft = await invoices.create(cream(), 'branch', 'asha');
    const sold = await invoices.checkout({ ...cream(), requestKey: 'searchable-bill' }, 'branch', 'asha');
    const found = async (search: string) =>
      (await invoices.findAll({ search, limit: 100 } as any, 'branch')).data.map((bill: { id: string }) => bill.id);
    const placeholderPiece = draft.invoiceNumber.slice('DRAFT-'.length, 'DRAFT-'.length + 8);
    expect([
      (await found('draft')).includes(draft.id),
      (await found(placeholderPiece)).includes(draft.id),
      await found(sold.invoiceNumber),
    ]).toEqual([false, false, [sold.id]]);
    await invoices.updateStatus(draft.id, 'CANCELLED', 'branch', 'asha');
    expect(await failure(invoices.getPrintData(draft.id, 'branch'))).toBe(
      '409: This draft was cancelled before it was finished, so it has no bill to print.',
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
      [refused, 50, [44.64, 5.36]],
      ['edit saved', 45, [40.18, 4.82]],
    ]);
    const allowed = [JSON.stringify(['edit saved', 45, [40.18, 4.82]]), JSON.stringify([refused, 50, [44.64, 5.36]])];
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
    expect([revised.totalAmount, [returned.payload.lines[0].taxable, returned.payload.lines[0].tax]]).toEqual([90, [40.18, 4.82]]);

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
    expect((await db.pharmacyInvoice.findUniqueOrThrow({ where: { id: gel.id } })).totalAmount).toBe(80);
  }, 60000);

  it('keeps refund and payment request keys apart, so a reused key never returns the other kind', async () => {
    const sold = await invoices.checkout({ ...cream(1), paymentMethod: 'INSURANCE' as any, requestKey: 'insured-cream' }, 'branch', 'asha');
    const receipt = await invoices.addPayment(sold.id, { requestKey: 'same-key', amount: 50, method: 'CASH' }, 'branch');
    await invoices.reviseDiscount(
      sold.id,
      { expectedVersion: (await db.pharmacyInvoice.findUniqueOrThrow({ where: { id: sold.id } })).mutationVersion, billDiscount: { kind: 'PERCENT', value: 10 }, lines: [], reason: 'Insurer discount' },
      'branch',
      'asha',
    );
    const asRefund = await failure(invoices.recordRefund(sold.id, { requestKey: 'same-key', amount: 50, method: 'CASH' }, 'branch'));
    const refund = await invoices.recordRefund(sold.id, { requestKey: 'same-key', amount: 5, method: 'CASH' }, 'branch');
    const refundReplay = await invoices.recordRefund(sold.id, { requestKey: 'same-key', amount: 5, method: 'CASH' }, 'branch');
    const receiptReplay = await invoices.addPayment(sold.id, { requestKey: 'same-key', amount: 50, method: 'CASH' }, 'branch');
    expect([
      asRefund,
      [refund.status, refund.amount, refundReplay.id === refund.id],
      [receiptReplay.id === receipt.id, receiptReplay.status, receiptReplay.amount],
      await db.pharmacyPayment.count({ where: { invoiceId: sold.id } }),
    ]).toEqual([
      '400: Only ₹5.00 is due back on this bill. Reload it to see the latest amounts.',
      ['REFUNDED', -5, true],
      [true, 'COMPLETED', 50],
      2,
    ]);
  });

  it('takes a bill discount off the MRP price, keeps it on the draft, and revises a paid bill into a refund due', async () => {
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
      36.82,
      285,
      [
        [10, 7.26, 8.86, 82.74],
        [0, 2.42, 1.31, 27.58],
        [10, 15.32, 26.65, 174.68],
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
      248.18,
      20,
      25,
      [
        [73.88, 8.86],
        [26.27, 1.31],
        [148.03, 26.65],
      ],
      [
        [5, 26.27, 1.31],
        [12, 73.88, 8.86],
        [18, 148.03, 26.65],
      ],
      285,
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
      245.6,
      285,
      -39.4,
      'COMPLETED',
      [['Senior citizen discount agreed by the doctor', 285, 245.6, 'Asha']],
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
    expect(await row()).toEqual([[245.6, 0, 39.4, 0, true]]);

    const refund = { requestKey: 'refund-1', amount: 39.4, method: 'CASH' as const };
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
        { amount: 285, method: 'CASH', status: 'COMPLETED' },
        { amount: -39.4, method: 'CASH', status: 'REFUNDED' },
      ],
      [[245.6, 0, 0, 39.4, true]],
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
      32.15,
      3.86,
      36.01,
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
  it('bills a medicine at its MRP, so the total is the price and the 5% GST sits inside it on the bill, its print and the register', async () => {
    await db.drug.create({
      data: { id: 'tacroz', name: 'Tacroz Forte 0.1% Oint', price: 853.13, manufacturerName: 'Synthetic', packSizeLabel: '1', branchId: 'branch' },
    });
    await db.inventoryItem.create({
      data: {
        id: 'tacroz-batch', branchId: 'branch', name: 'Tacroz Forte 0.1% Oint', type: 'MEDICINE', costPrice: 600, sellingPrice: 853.13, mrp: 853.13,
        gstRate: 5, unit: 'PIECES', currentStock: 5, stockStatus: 'IN_STOCK', expiryDate: new Date('2099-01-01'),
        drugs: { connect: { id: 'tacroz' } },
      },
    });
    const sold = await invoices.checkout(
      {
        ...bill,
        paymentMethod: 'CASH' as const,
        requestKey: 'tacroz-mrp',
        items: [{ drugId: 'tacroz', quantity: 1, unitPrice: 853.13, discountPercent: 0, taxPercent: 5 }],
      },
      'branch',
      'asha',
    );
    expect([sold.subtotal, sold.discountAmount, sold.taxAmount, sold.totalAmount, sold.balanceAmount, sold.paymentStatus]).toEqual([
      853.13, 0, 40.63, 853.13, 0, 'COMPLETED',
    ]);
    expect(sold.items.map((item: any) => [item.unitPrice, item.taxPercent, item.taxAmount, item.totalAmount])).toEqual([[853.13, 5, 40.63, 853.13]]);
    expect(await db.pharmacyPayment.findMany({ where: { invoiceId: sold.id }, select: { amount: true, status: true } })).toEqual([
      { amount: 853.13, status: 'COMPLETED' },
    ]);
    const print = await invoices.getPrintData(sold.id, 'branch');
    expect([
      print.invoice.subtotal,
      print.invoice.taxableAmount,
      print.invoice.taxAmount,
      print.invoice.totalAmount,
      print.lines.map((line) => [line.unitPrice, line.taxableAmount, line.taxAmount, line.totalAmount]),
      print.gstSummary.map((slab) => [slab.taxPercent, slab.taxableAmount, slab.totalTax]),
    ]).toEqual([853.13, 812.5, 40.63, 853.13, [[853.13, 812.5, 40.63, 853.13]], [[5, 812.5, 40.63]]]);
    const rows = (
      await register.list({ register: 'sales', from: '2000-01-01', to: '2099-12-31', sortBy: 'billNo', sortDir: 'asc', page: 1, limit: 50 }, 'branch')
    ).rows.filter((r) => r.recordId === sold.id);
    expect(rows.map((r) => [r.amount, r.due])).toEqual([[853.13, 0]]);
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
    // 2 x 100 MRP at 12% less a 10% bill discount: total 180, of which taxable 160.71 and GST 19.29; cost 2 x 40 + 12% input GST = 89.60.
    expect([sold.totalAmount, await margin()]).toEqual([180, [['Synthetic Serum', 2, 180, 89.6, 9.69, 80.71, 50.22]]]);

    await invoices.reviseDiscount(
      sold.id,
      { expectedVersion: sold.mutationVersion, billDiscount: { kind: 'PERCENT', value: 20 }, lines: [], reason: 'Loyalty discount' } as any,
      'branch',
      'asha',
    );
    // Revised to 20%: total 160, of which taxable 142.86 and GST 17.14; profit is the taxable value less cost, 62.86.
    expect(await margin()).toEqual([['Synthetic Serum', 2, 160, 89.6, 7.54, 62.86, 44]]);
  }, 60000);
});
