import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { InvoiceNumbersService } from '../../../shared/numbering/invoice-numbers.service';
import { PharmacyInvoiceService } from '../pharmacy-invoice.service';
import { PharmacySalesRegisterService } from '../pharmacy-sales-register.service';
import type { SalesRegisterQuery } from '../pharmacy-sales-register';

const databaseTests = process.env.SALES_REGISTER_TEST_DATABASE_URL
  ? describe
  : describe.skip;

databaseTests('Sales register on PostgreSQL', () => {
  const schema = `sales_register_${randomUUID().replaceAll('-', '')}`;
  let admin: PrismaClient;
  let db: PrismaClient;
  let fixtures: string;
  let created = false;
  let invoices: PharmacyInvoiceService;
  let register: PharmacySalesRegisterService;
  let creatorColumnsBeforeMigration: number;

  const query = (
    overrides: Partial<SalesRegisterQuery> = {},
  ): SalesRegisterQuery => ({
    register: 'sales',
    from: '2026-04-01',
    to: '2027-03-31',
    sortBy: 'billNo',
    sortDir: 'asc',
    page: 1,
    limit: 50,
    ...overrides,
  });
  const bill = {
    patientId: 'patient',
    paymentMethod: 'CASH' as const,
    billingName: 'Meera Shah',
    billingPhone: '9876543210',
    items: [{ drugId: 'drug', quantity: 2, unitPrice: 50 }],
  };

  beforeAll(async () => {
    const url = new URL(process.env.SALES_REGISTER_TEST_DATABASE_URL!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
      throw new Error('Database tests require local PostgreSQL');
    url.searchParams.set('schema', 'public');
    admin = new PrismaClient({ datasourceUrl: url.toString() });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    created = true;
    url.searchParams.set('schema', schema);
    fixtures = mkdtempSync(path.join(tmpdir(), 'sales-register-'));
    const legacy = readFileSync(path.resolve('prisma/schema.prisma'), 'utf8')
      .replace(/model PharmacyInvoice \{[\s\S]*?\n\}/, (model) =>
        model
          .split('\n')
          .filter(
            (line) =>
              !/^\s*createdBy(Id)?\s/.test(line) &&
              !/@@index\(\[createdById\]\)/.test(line),
          )
          .join('\n'),
      )
      .replace(/^\s*createdPharmacyInvoices\s.*\n/m, '');
    writeFileSync(path.join(fixtures, 'legacy.prisma'), legacy);
    const prisma = (...args: string[]) =>
      execFileSync(
        process.execPath,
        [require.resolve('prisma/build/index.js'), ...args],
        {
          stdio: 'pipe',
          env: {
            ...process.env,
            DATABASE_URL: url.toString(),
            PRISMA_GENERATE_SKIP_AUTOINSTALL: '1',
          },
        },
      );
    prisma(
      'db',
      'push',
      '--skip-generate',
      '--schema',
      path.join(fixtures, 'legacy.prisma'),
    );
    db = new PrismaClient({ datasourceUrl: url.toString() });

    await db.branch.create({
      data: {
        id: 'branch',
        name: 'Skin Care Clinic',
        address: 'Synthetic',
        city: 'Pune',
        gstNumber: '27ABCDE1234F1Z5',
      },
    });
    await db.branch.create({
      data: { id: 'other-branch', name: 'Other Clinic', address: 'Synthetic' },
    });
    for (const [id, firstName] of [
      ['asha', 'Asha'],
      ['ravi', 'Ravi'],
    ])
      await db.user.create({
        data: {
          id,
          firstName,
          lastName: 'Synthetic',
          email: `${id}@example.test`,
          password: 'x',
          role: 'PHARMACIST',
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
    await db.drug.create({
      data: {
        id: 'drug',
        name: 'Synthetic Cream',
        price: 50,
        manufacturerName: 'Synthetic',
        packSizeLabel: '1 tube',
        branchId: 'branch',
      },
    });
    await db.inventoryItem.create({
      data: {
        id: 'batch',
        branchId: 'branch',
        name: 'Synthetic Cream',
        type: 'MEDICINE',
        costPrice: 20,
        sellingPrice: 50,
        unit: 'TUBES',
        currentStock: 10,
        stockStatus: 'IN_STOCK',
        expiryDate: new Date('2099-01-01'),
        drugs: { connect: { id: 'drug' } },
      },
    });

    creatorColumnsBeforeMigration = Number(
      (
        await db.$queryRawUnsafe<{ count: bigint }[]>(
          `SELECT count(*) AS count FROM information_schema.columns
           WHERE table_schema = $1 AND table_name = 'pharmacy_invoices' AND column_name = 'createdById'`,
          schema,
        )
      )[0].count,
    );
    for (const invoiceNumber of ['LEGACY-1', 'LEGACY-UNSOLD'])
      await db.$executeRawUnsafe(
        `INSERT INTO "pharmacy_invoices" ("id", "invoiceNumber", "patientId", "branchId", "subtotal", "totalAmount",
           "paymentMethod", "billingName", "billingPhone", "status", "invoiceDate", "updatedAt")
         VALUES ($1, $1, 'patient', 'branch', 100, 100, 'CASH', 'Meera Shah', '9876543210', 'CONFIRMED',
           '2026-05-01T06:00:00Z', now())`,
        invoiceNumber,
      );
    for (const [id, branchId, userId, createdAt] of [
      ['sale-later', 'branch', 'ravi', '2026-05-01T06:05:00Z'],
      ['sale-first', 'branch', 'asha', '2026-05-01T06:01:00Z'],
      ['sale-elsewhere', 'other-branch', 'ravi', '2026-05-01T06:00:00Z'],
    ])
      await db.$executeRawUnsafe(
        `INSERT INTO "stock_transactions" ("id", "branchId", "itemId", "userId", "type", "quantity", "unitPrice",
           "totalAmount", "reference", "createdAt", "updatedAt")
         VALUES ($1, $2, 'batch', $3, 'SALE', 1, 50, 50, 'INV-LEGACY-1', $4::timestamptz, now())`,
        id,
        branchId,
        userId,
        createdAt,
      );
    for (let run = 0; run < 2; run++)
      for (const migration of [
        '20261106150000_pharmacy_invoice_creator',
        '20261106150100_pharmacy_invoice_creator_index',
      ])
        prisma(
          'db',
          'execute',
          '--url',
          url.toString(),
          '--file',
          path.resolve(`prisma/migrations/${migration}/migration.sql`),
        );

    const numbers = new InvoiceNumbersService(db as any);
    invoices = new PharmacyInvoiceService(db as any, numbers);
    register = new PharmacySalesRegisterService(db as any);
  }, 120000);

  afterAll(async () => {
    await db?.$disconnect();
    if (created)
      await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin?.$disconnect();
    if (fixtures) rmSync(fixtures, { recursive: true, force: true });
  });

  it('adds the creator column to an existing table, backfills legacy bills from their first sale in the branch and indexes it', async () => {
    const creators = await db.pharmacyInvoice.findMany({
      where: { invoiceNumber: { in: ['LEGACY-1', 'LEGACY-UNSOLD'] } },
      select: { invoiceNumber: true, createdById: true },
      orderBy: { invoiceNumber: 'asc' },
    });
    const indexes = await db.$queryRawUnsafe<{ indexname: string }[]>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = $1 AND indexname = 'pharmacy_invoices_createdById_idx'`,
      schema,
    );
    expect([creatorColumnsBeforeMigration, creators, indexes]).toEqual([
      0,
      [
        { invoiceNumber: 'LEGACY-1', createdById: 'asha' },
        { invoiceNumber: 'LEGACY-UNSOLD', createdById: null },
      ],
      [{ indexname: 'pharmacy_invoices_createdById_idx' }],
    ]);
  });

  it('names who entered each bill, shows what was paid and owed, links returns to their bills and totals only posted sales', async () => {
    const draft = await invoices.create(bill, 'branch', 'asha');
    const sold = await invoices.checkout(
      { ...bill, paymentMethod: 'UPI', requestKey: 'sales-register-1' },
      'branch',
      'ravi',
    );
    const document = (id: string, data: Record<string, unknown>) =>
      db.inventoryWorkflowDocument.create({
        data: {
          id,
          branchId: 'branch',
          kind: 'COUNTER_SALE',
          status: 'POSTED',
          requestKey: id,
          createdBy: 'ravi',
          reference: id.toUpperCase(),
          totalAmount: 25,
          payload: {},
          ...data,
        },
      });
    await document('cs-in-range', {
      payload: {
        date: '2026-05-02',
        customerName: 'Walk-in',
        paymentMode: 'UPI',
      },
    });
    await document('cs-entered-early', {
      createdAt: new Date('2025-01-01T06:00:00Z'),
      payload: { date: '2026-05-03', paymentMode: 'CARD' },
    });
    await document('cs-backdated', {
      payload: { date: '2026-03-30', paymentMode: 'CASH' },
    });
    await document('cs-other-branch', {
      branchId: 'other-branch',
      payload: { date: '2026-05-02' },
    });
    const soldLine = await db.stockTransaction.findFirstOrThrow({
      where: { branchId: 'branch', reference: `INV-${sold.invoiceNumber}` },
    });
    await document('sr-1', {
      kind: 'SALES_RETURN',
      createdBy: 'asha',
      totalAmount: 50,
      payload: {
        date: '2026-05-04',
        refundMode: 'CASH',
        lines: [{ sourceLineId: soldLine.id }],
      },
    });

    const sales = await register.list(
      query({ from: '2026-04-01', to: '2099-03-31' }),
      'branch',
    );
    const upi = await register.list(
      query({ from: '2026-04-01', to: '2099-03-31', paymentMode: 'UPI' }),
      'branch',
    );
    const draftByNumber = await register.list(
      query({
        from: '2026-04-01',
        to: '2099-03-31',
        field: 'billNo',
        q: draft.invoiceNumber,
      }),
      'branch',
    );
    const returns = await register.list(
      query({ register: 'returns', from: '2026-04-01', to: '2099-03-31' }),
      'branch',
    );

    expect(
      Object.fromEntries(
        sales.rows.map((r) => [
          r.billNo ?? `draft ${r.reservedNo === draft.invoiceNumber}`,
          [r.entryBy?.name ?? null, r.paymentModes, r.due],
        ]),
      ),
    ).toEqual({
      'CS-ENTERED-EARLY': ['Ravi Synthetic', ['CARD'], 0],
      'CS-IN-RANGE': ['Ravi Synthetic', ['UPI'], 0],
      [sold.invoiceNumber]: ['Ravi Synthetic', ['UPI'], 0],
      'LEGACY-1': ['Asha Synthetic', [], 100],
      'LEGACY-UNSOLD': [null, [], 100],
      'draft true': ['Asha Synthetic', [], 0],
    });
    expect([
      sales.totals,
      sales.clinic,
      upi.totals.collected,
      draftByNumber.rows.map((r) => r.recordId),
      returns.rows.map((r) => [r.billNo, r.linkedBillNos, r.paymentModes]),
    ]).toEqual([
      {
        amount: 350,
        count: 5,
        collected: null,
        excluded: { drafts: 1, cancelled: 0 },
      },
      {
        name: 'Skin Care Clinic',
        address: 'Synthetic, Pune',
        gstin: '27ABCDE1234F1Z5',
      },
      125,
      [draft.id],
      [['SR-1', [sold.invoiceNumber], ['CASH']]],
    ]);
    expect(
      await db.pharmacyInvoice.findUnique({
        where: { id: sold.id },
        select: { createdById: true },
      }),
    ).toEqual({ createdById: 'ravi' });
  }, 60000);

  it('clears the creator when that user is deleted', async () => {
    const user = await db.user.create({
      data: {
        firstName: 'Temp',
        lastName: 'Synthetic',
        email: `${randomUUID()}@example.test`,
        password: 'x',
        role: 'PHARMACIST',
        branchId: 'branch',
      },
    });
    const draft = await invoices.create(bill, 'branch', user.id);
    await db.user.delete({ where: { id: user.id } });
    expect(
      await db.pharmacyInvoice.findUnique({
        where: { id: draft.id },
        select: { createdById: true },
      }),
    ).toEqual({ createdById: null });
  }, 60000);
});
