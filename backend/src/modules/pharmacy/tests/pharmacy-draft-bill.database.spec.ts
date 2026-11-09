import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import { InvoiceNumbersService } from '../../../shared/numbering/invoice-numbers.service';
import { PharmacyInvoiceService } from '../pharmacy-invoice.service';
import { PharmacySalesRegisterService } from '../pharmacy-sales-register.service';

const databaseTests = process.env.SALES_REGISTER_TEST_DATABASE_URL
  ? describe
  : describe.skip;

databaseTests('Draft pharmacy bills on PostgreSQL', () => {
  const schema = `draft_bill_${randomUUID().replaceAll('-', '')}`;
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
      ['cream', 'Synthetic Cream', 50, 10],
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

  it('saves a draft without stock, reopens every line, refuses a stale save, then finishes the same bill once', async () => {
    const draft = await invoices.create(bill, 'branch', 'asha');
    const reopened = await invoices.findOne(draft.id, 'branch');
    expect([
      reopened.status,
      reopened.mutationVersion,
      reopened.doctorId,
      reopened.paymentMethod,
      reopened.notes,
      reopened.items.map((item) => [
        item.drugId,
        item.inventoryItemId,
        item.quantity,
        item.unitPrice,
        item.discountPercent,
        item.taxPercent,
        item.dosage,
        item.frequency,
        item.duration,
        item.instructions,
      ]),
    ]).toEqual([
      'DRAFT',
      0,
      'doctor',
      'UPI',
      'Collect at 5 pm',
      [
        [
          'cream',
          'cream-batch',
          2,
          50,
          10,
          12,
          'thin layer',
          'twice daily',
          '7 days',
          'after bath',
        ],
        ['tablet', null, 1, 30, 0, 5, null, null, null, null],
        ['shampoo', null, 1, 200, 5, 18, null, null, null, null],
      ],
    ]);
    expect(await stock()).toEqual({
      'cream-batch': 10,
      'shampoo-batch': 3,
      'tablet-batch': 5,
    });

    const edited = {
      ...bill,
      items: [{ ...lines[0], quantity: 3 }, lines[1], lines[2]],
    };
    const saved = await invoices.update(
      draft.id,
      { ...edited, expectedVersion: 0 },
      'branch',
    );
    expect([saved.mutationVersion, saved.totalAmount]).toEqual([1, 406.9]);
    expect(
      await failure(
        invoices.update(
          draft.id,
          { ...bill, notes: 'From the other tab', expectedVersion: 0 },
          'branch',
        ),
      ),
    ).toBe(
      '409: This draft was changed after you opened it. Reload it to see the latest version.',
    );

    const registerRow = async () =>
      (
        await register.list(
          {
            register: 'sales',
            from: '2000-01-01',
            to: '2099-12-31',
            sortBy: 'billNo',
            sortDir: 'asc',
            page: 1,
            limit: 50,
          },
          'branch',
        )
      ).rows.map((row) => [
        row.recordId,
        row.billNo,
        row.reservedNo,
        row.state,
        row.paymentModes,
        row.due,
      ]);
    expect(await registerRow()).toEqual([
      [draft.id, null, draft.invoiceNumber, 'DRAFT', [], 0],
    ]);

    const finish = {
      ...edited,
      items: [{ ...lines[0], quantity: 4 }, lines[1], lines[2]],
      requestKey: 'finish-draft-1',
      draftId: draft.id,
      draftVersion: 1,
    };
    const finished = await invoices.checkout(finish, 'branch', 'asha');
    expect([
      finished.id,
      finished.invoiceNumber,
      finished.status,
      finished.mutationVersion,
    ]).toEqual([draft.id, draft.invoiceNumber, 'CONFIRMED', 4]);
    expect([
      finished.paymentStatus,
      finished.balanceAmount,
      await db.pharmacyPayment.findMany({
        where: { invoiceId: draft.id },
        select: { amount: true, method: true, status: true },
      }),
    ]).toEqual([
      'COMPLETED',
      0,
      [{ amount: 457.3, method: 'UPI', status: 'COMPLETED' }],
    ]);
    expect(await stock()).toEqual({
      'cream-batch': 6,
      'shampoo-batch': 2,
      'tablet-batch': 4,
    });
    expect(await sales(draft.invoiceNumber)).toBe(3);

    const retried = await invoices.checkout(finish, 'branch', 'asha');
    expect([
      retried.id,
      retried.status,
      await sales(draft.invoiceNumber),
    ]).toEqual([draft.id, 'CONFIRMED', 3]);
    expect(await stock()).toEqual({
      'cream-batch': 6,
      'shampoo-batch': 2,
      'tablet-batch': 4,
    });
    expect(await registerRow()).toEqual([
      [draft.id, draft.invoiceNumber, null, 'FINAL', ['UPI'], 0],
    ]);
    expect(
      await db.pharmacyPayment.count({ where: { invoiceId: draft.id } }),
    ).toBe(1);

    expect([
      await failure(
        invoices.update(draft.id, { ...bill, expectedVersion: 4 }, 'branch'),
      ),
      await failure(
        invoices.checkout(
          { ...finish, requestKey: 'finish-draft-2' },
          'branch',
          'asha',
        ),
      ),
      await failure(invoices.remove(draft.id, 'branch', 4)),
    ]).toEqual([
      '409: This bill was already finished. It can no longer be edited.',
      '409: This bill was already finished. It can no longer be edited.',
      '409: This bill was already finished. It can no longer be discarded.',
    ]);
    expect(await db.pharmacyInvoice.count()).toBe(1);
  });

  it('refuses to finish or discard from an older version and discards the current one', async () => {
    const before = await stock();
    const draft = await invoices.create(bill, 'branch', 'asha');
    await invoices.update(
      draft.id,
      { notes: 'Patient will return', expectedVersion: 0 },
      'branch',
    );
    expect([
      await failure(
        invoices.checkout(
          {
            ...bill,
            requestKey: 'stale-finish',
            draftId: draft.id,
            draftVersion: 0,
          },
          'branch',
          'asha',
        ),
      ),
      await failure(invoices.remove(draft.id, 'branch', 0)),
    ]).toEqual([
      '409: This draft was changed after you opened it. Reload it to see the latest version.',
      '409: This draft was changed after you opened it. Reload it before discarding.',
    ]);
    expect([
      (await invoices.findOne(draft.id, 'branch')).status,
      await stock(),
    ]).toEqual(['DRAFT', before]);

    expect(await invoices.remove(draft.id, 'branch', 1)).toEqual({
      message: 'Invoice deleted successfully',
    });
    expect([
      await failure(invoices.findOne(draft.id, 'branch')),
      await failure(
        invoices.update(draft.id, { ...bill, expectedVersion: 1 }, 'branch'),
      ),
    ]).toEqual(['404: Invoice not found', '404: Invoice not found']);
  });

  const cashRegister = async () => {
    const page = await register.list(
      {
        register: 'sales',
        from: '2000-01-01',
        to: '2099-12-31',
        paymentMode: 'CASH',
        sortBy: 'billNo',
        sortDir: 'asc',
        page: 1,
        limit: 50,
      },
      'branch',
    );
    return [
      page.rows.map((row) => [row.recordId, row.paymentModes, row.due]),
      page.totals.collected,
    ];
  };
  const ledger = async (invoiceId: string) =>
    db.pharmacyPayment.findMany({
      where: { invoiceId },
      select: { amount: true, method: true, status: true },
      orderBy: { createdAt: 'asc' },
    });
  const fiveHundred = {
    patientId: 'patient',
    billingName: 'Meera Shah',
    billingPhone: '9876543210',
    paymentMethod: 'CASH' as const,
    items: [
      {
        drugId: 'tablet',
        quantity: 1,
        unitPrice: 500,
        discountPercent: 0,
        taxPercent: 0,
      },
    ],
  };

  it('refuses payments on a draft and finishes a draft holding an earlier receipt by collecting only the rest', async () => {
    const draft = await invoices.create(fiveHundred, 'branch', 'asha');
    expect(
      await failure(
        invoices.addPayment(
          draft.id,
          { requestKey: 'draft-receipt', amount: 200, method: 'CASH' },
          'branch',
        ),
      ),
    ).toBe('400: Finish the bill in Sales before taking payment');

    await db.pharmacyPayment.create({
      data: {
        invoiceId: draft.id,
        requestKey: 'receipt-before-sales',
        amount: 200,
        method: 'CASH',
        status: 'COMPLETED',
      },
    });
    await db.pharmacyInvoice.update({
      where: { id: draft.id },
      data: {
        paidAmount: 200,
        balanceAmount: 300,
        paymentStatus: 'PARTIALLY_PAID',
        mutationVersion: { increment: 1 },
      },
    });

    const finish = {
      ...fiveHundred,
      requestKey: 'finish-part-paid',
      draftId: draft.id,
      draftVersion: 1,
    };
    const finished = await invoices.checkout(finish, 'branch', 'asha');
    expect([
      finished.status,
      finished.totalAmount,
      finished.paidAmount,
      finished.balanceAmount,
      finished.paymentStatus,
      await ledger(draft.id),
      await cashRegister(),
    ]).toEqual([
      'CONFIRMED',
      500,
      500,
      0,
      'COMPLETED',
      [
        { amount: 200, method: 'CASH', status: 'COMPLETED' },
        { amount: 300, method: 'CASH', status: 'COMPLETED' },
      ],
      [[[draft.id, ['CASH'], 0]], 500],
    ]);

    const retried = await invoices.checkout(finish, 'branch', 'asha');
    expect([
      retried.paidAmount,
      (await ledger(draft.id)).length,
      await sales(draft.invoiceNumber),
    ]).toEqual([500, 2, 1]);
    expect(
      await failure(
        invoices.addPayment(
          draft.id,
          { requestKey: 'after-finish', amount: 1, method: 'CASH' },
          'branch',
        ),
      ),
    ).toBe('400: Payment amount exceeds remaining balance');
  });
});
