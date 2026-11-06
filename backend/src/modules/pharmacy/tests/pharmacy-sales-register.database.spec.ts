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
          .filter((line) => !/^\s*createdBy(Id)?\s/.test(line))
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
    prisma(
      'db',
      'execute',
      '--url',
      url.toString(),
      '--file',
      path.resolve(
        'prisma/migrations/20261106150000_pharmacy_invoice_creator/migration.sql',
      ),
    );
    db = new PrismaClient({ datasourceUrl: url.toString() });

    await db.branch.create({
      data: { id: 'branch', name: 'Skin Care Clinic', address: 'Synthetic' },
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

  it('names who entered each bill, falls back to the first seller for legacy bills and totals only posted sales', async () => {
    const draft = await invoices.create(bill, 'branch', 'asha');
    const sold = await invoices.checkout(
      { ...bill, requestKey: 'sales-register-1' },
      'branch',
      'ravi',
    );
    const legacy = await invoices.checkout(
      { ...bill, requestKey: 'sales-register-2' },
      'branch',
      'asha',
    );
    await db.pharmacyInvoice.update({
      where: { id: legacy.id },
      data: { createdById: null },
    });
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

    const result = await register.list(
      query({ from: '2026-04-01', to: '2099-03-31' }),
      'branch',
    );

    expect(
      result.rows.map((r) => [
        r.recordId,
        r.billNo === null,
        r.entryBy?.name ?? null,
        r.paymentModes,
      ]),
    ).toEqual([
      ['cs-entered-early', false, 'Ravi Synthetic', ['CARD']],
      ['cs-in-range', false, 'Ravi Synthetic', ['UPI']],
      [sold.id, false, 'Ravi Synthetic', ['CASH']],
      [legacy.id, false, 'Asha Synthetic', ['CASH']],
      [draft.id, true, 'Asha Synthetic', ['CASH']],
    ]);
    expect(result.totals).toEqual({
      amount: 250,
      count: 4,
      excluded: { drafts: 1, cancelled: 0 },
    });
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
