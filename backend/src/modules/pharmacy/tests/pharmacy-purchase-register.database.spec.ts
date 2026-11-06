import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as XLSX from 'xlsx';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import { InventoryWorkspaceService } from '../../inventory/inventory-workspace.service';
import { PharmacyPurchaseInvoiceService } from '../pharmacy-purchase-invoice.service';
import { PharmacyPurchaseLedgerService } from '../pharmacy-purchase-ledger.service';
import { PharmacyPurchaseRegisterService } from '../pharmacy-purchase-register.service';
import { PharmacyPurchasePaymentModeDto } from '../dto/pharmacy-purchase-ledger.dto';
import type { PurchaseRegisterQuery } from '../pharmacy-purchase-register';

const databaseTests = process.env.PURCHASE_REGISTER_TEST_DATABASE_URL
  ? describe
  : describe.skip;

databaseTests('Purchase register on PostgreSQL', () => {
  const schema = `purchase_register_${randomUUID().replaceAll('-', '')}`;
  const linae = '36ABCDE1234F1Z5';
  const medico = '27AAAAA0000A1Z5';
  const zenith = '29ZZZZZ9999Z1Z5';
  let admin: PrismaClient;
  let db: PrismaClient;
  let ledger: PharmacyPurchaseLedgerService;
  let register: PharmacyPurchaseRegisterService;
  let branchId: string;
  let userId: string;
  let bills: Record<string, string>;
  let workspace: InventoryWorkspaceService;
  let creditAllocationId: string;

  const query = (overrides: Partial<PurchaseRegisterQuery> = {}): PurchaseRegisterQuery => ({
    from: '2026-04-01',
    to: '2027-03-31',
    sortBy: 'srNo',
    sortDir: 'asc',
    page: 1,
    limit: 50,
    ...overrides,
  });
  const actor = () => ({ id: userId, role: 'ACCOUNTANT', branchId });
  const rows = async (overrides: Partial<PurchaseRegisterQuery> = {}, now?: Date) =>
    Object.fromEntries(
      (await register.list(query(overrides), actor(), now)).rows.map((row) => [
        row.billNo,
        [row.payment.state, row.payment.outstanding],
      ]),
    );
  const ledgerOutstanding = async (gstin: string, asOf?: Date) =>
    Object.fromEntries(
      (await ledger.getDistributorLedger(branchId, gstin, asOf)).invoices.map((row) => [row.invoiceNumber, row.outstanding]),
    );
  const registerOutstanding = async (gstin: string, now?: Date) =>
    Object.fromEntries(
      (await register.list(query({ distributorGstin: gstin, invoiceState: 'POSTED' }), actor(), now)).rows.map((row) => [
        row.billNo,
        row.payment.outstanding,
      ]),
    );
  const pay = (invoiceId: string, gstin: string, amount: number, requestKey = randomUUID(), paymentDate = '2026-10-20') =>
    ledger.createPayment(
      {
        requestKey,
        distributorGstin: gstin,
        distributorName: gstin === linae ? 'Linae Distributors' : 'Medico Agencies',
        paymentDate,
        mode: PharmacyPurchasePaymentModeDto.NEFT,
        amount,
        allocations: [{ purchaseInvoiceId: invoiceId, amount }],
      },
      branchId,
      userId,
    );

  beforeAll(async () => {
    const url = new URL(process.env.PURCHASE_REGISTER_TEST_DATABASE_URL!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
      throw new Error('Database tests require local PostgreSQL');
    url.searchParams.set('schema', 'public');
    admin = new PrismaClient({ datasourceUrl: url.toString() });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    url.searchParams.set('schema', schema);
    execFileSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'db', 'push', '--skip-generate', '--schema', path.resolve('prisma/schema.prisma')],
      { stdio: 'pipe', env: { ...process.env, DATABASE_URL: url.toString(), PRISMA_GENERATE_SKIP_AUTOINSTALL: '1' } },
    );
    db = new PrismaClient({ datasourceUrl: url.toString() });
    ledger = new PharmacyPurchaseLedgerService(db as any);
    register = new PharmacyPurchaseRegisterService(db as any);
  }, 120000);

  afterAll(async () => {
    await db?.$disconnect();
    if (admin) {
      await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.$disconnect();
    }
  });

  beforeEach(async () => {
    branchId = (await db.branch.create({ data: { name: 'Synthetic purchase register', address: 'Synthetic' } })).id;
    userId = (
      await db.user.create({
        data: {
          email: `${randomUUID()}@example.invalid`,
          firstName: 'Asha',
          lastName: 'Rao',
          password: 'not-a-login',
          role: 'ACCOUNTANT',
          branchId,
          permissions: '["pharmacy:purchase-ledger:write"]',
        },
      })
    ).id;
    const seeds: [string, string, number, string, string | null, string][] = [
      ['LIN-1', linae, 1000, 'STOCK_COMMITTED', '2026-10-15T00:00:00+05:30', '2026-10-01T10:00:00+05:30'],
      ['LIN-2', linae, 500, 'STOCK_COMMITTED', null, '2026-10-02T10:00:00+05:30'],
      ['LIN-3', linae, 300, 'STOCK_COMMITTED', null, '2026-10-03T10:00:00+05:30'],
      ['LIN-4', linae, 700, 'REVIEWED', null, '2026-10-04T10:00:00+05:30'],
      ['LIN-5', linae, 200, 'CANCELLED', null, '2026-10-05T10:00:00+05:30'],
      ['MED-1', medico, 900, 'STOCK_COMMITTED', null, '2026-10-06T10:00:00+05:30'],
      ['ZEN-1', zenith, 100, 'STOCK_COMMITTED', null, '2026-09-30T23:30:00+05:30'],
      ['ZEN-2', zenith, 100, 'STOCK_COMMITTED', null, '2026-10-01T00:30:00+05:30'],
    ];
    bills = {};
    for (const [index, [invoiceNumber, gstin, netPayable, status, dueDate, invoiceDate]] of seeds.entries()) {
      const bill = await db.pharmacyPurchaseInvoice.create({
        data: {
          branchId,
          createdBy: userId,
          distributorName: gstin === linae ? 'Linae Distributors' : gstin === medico ? 'Medico Agencies' : 'Zenith Pharma',
          distributorGstin: gstin,
          distributorDlNo: 'synthetic',
          invoiceNumber,
          invoiceDate: new Date(invoiceDate),
          dueDate: dueDate ? new Date(dueDate) : null,
          createdAt: new Date(`2026-10-0${index + 1}T11:00:00+05:30`),
          billType: 'CREDIT',
          doctorNameOrRegNo: 'Synthetic',
          status: status as any,
          stockCommittedAt: status === 'STOCK_COMMITTED' ? new Date('2026-10-01') : null,
          grossAmount: netPayable,
          taxableAmount: netPayable,
          totalGst: 0,
          netPayable,
        },
      });
      bills[invoiceNumber] = bill.id;
    }
    await pay(bills['LIN-2'], linae, 500);
    await pay(bills['LIN-3'], linae, 100);
    const workflow = {
      permissions: async () => new Set(['*']),
      transaction: (run: any) => db.$transaction(run, { isolationLevel: 'Serializable' }),
    };
    workspace = new InventoryWorkspaceService(db as any, workflow as any);
    const credit = await db.inventorySupplierCredit.create({
      data: { branchId, supplierGstin: linae, documentId: randomUUID(), reference: 'SYN-CREDIT', amount: 50 },
    });
    creditAllocationId = (
      await workspace.allocateCredit(actor(), {
        requestKey: randomUUID(),
        creditId: credit.id,
        purchaseInvoiceId: bills['LIN-3'],
        amount: 50,
      })
    ).id;
  });

  it('shows the same balances as the supplier ledger for one distributor', async () => {
    const page = await register.list(query({ distributorGstin: linae }), actor());
    expect(page.rows.map((row) => [row.srNo, row.billNo, row.entryBy?.name, row.payment.state, row.payment.outstanding])).toEqual([
      [1, 'LIN-1', 'Asha Rao', 'OVERDUE', 1000],
      [2, 'LIN-2', 'Asha Rao', 'PAID', 0],
      [3, 'LIN-3', 'Asha Rao', 'PARTIAL', 150],
      [4, 'LIN-4', 'Asha Rao', 'NOT_POSTED', 0],
      [5, 'LIN-5', 'Asha Rao', 'CANCELLED', 0],
    ]);
    expect(page.totals).toEqual({
      amount: 1800,
      outstanding: 1150,
      count: 3,
      excluded: { notPosted: 1, cancelled: 1 },
    });

    const summary = (await ledger.getDistributorSummaries(branchId)).distributors.find(
      (row) => row.distributorGstin === linae,
    )!;
    expect(summary.outstanding).toBe(page.totals.outstanding);
    const ledgerRows = (await ledger.getDistributorLedger(branchId, linae)).invoices;
    expect(Object.fromEntries(ledgerRows.map((row) => [row.invoiceNumber, row.outstanding]))).toEqual({
      'LIN-1': 1000,
      'LIN-2': 0,
      'LIN-3': 150,
    });
    expect(await rows({ paymentState: 'OUTSTANDING' })).toEqual({
      'LIN-1': ['OVERDUE', 1000],
      'LIN-3': ['PARTIAL', 150],
      'MED-1': ['DUE', 900],
      'ZEN-1': ['DUE', 100],
      'ZEN-2': ['DUE', 100],
    });
  });

  it('agrees with the ledger bill by bill after a payment is reallocated and a credit allocation is reversed', async () => {
    const payment = await pay(bills['LIN-1'], linae, 300);
    await ledger.reallocatePayment(
      payment.id,
      {
        requestKey: randomUUID(),
        expectedUpdatedAt: payment.updatedAt.toISOString(),
        reason: 'Split across two bills',
        allocations: [
          { purchaseInvoiceId: bills['LIN-1'], amount: 150 },
          { purchaseInvoiceId: bills['LIN-3'], amount: 150 },
        ],
      },
      branchId,
      userId,
    );
    await workspace.reverseAllocation(actor(), creditAllocationId, 'Credit note withdrawn');

    expect(await registerOutstanding(linae)).toEqual({ 'LIN-1': 850, 'LIN-2': 0, 'LIN-3': 50 });
    expect(await ledgerOutstanding(linae)).toEqual({ 'LIN-1': 850, 'LIN-2': 0, 'LIN-3': 50 });
    const page = await register.list(query({ distributorGstin: linae, paymentState: 'OVERDUE' }), actor());
    expect(page.rows.map((row) => [row.billNo, row.payment.state, row.payment.partlyPaid, row.payment.paid])).toEqual([
      ['LIN-1', 'OVERDUE', true, 150],
    ]);
    expect((await register.list(query({ distributorGstin: linae }), actor())).totals.outstanding).toBe(900);
    expect(
      (await ledger.getDistributorSummaries(branchId)).distributors.find((row) => row.distributorGstin === linae)!.outstanding,
    ).toBe(900);
  });

  it('stores a calendar-day payment as the clinic day start and counts it only from that day', async () => {
    const payment = await pay(bills['MED-1'], medico, 400, randomUUID(), '2099-01-15');
    expect((await db.pharmacyPurchasePayment.findUniqueOrThrow({ where: { id: payment.id } })).paymentDate.toISOString()).toBe(
      '2099-01-14T18:30:00.000Z',
    );
    const before = new Date('2099-01-14T18:29:59.000Z');
    const from = new Date('2099-01-14T18:30:00.000Z');
    expect([await registerOutstanding(medico, before), await ledgerOutstanding(medico, before)]).toEqual([
      { 'MED-1': 900 },
      { 'MED-1': 900 },
    ]);
    expect([await registerOutstanding(medico, from), await ledgerOutstanding(medico, from)]).toEqual([
      { 'MED-1': 500 },
      { 'MED-1': 500 },
    ]);
  });

  it('offers Mark paid only what a future-dated payment has not already covered, and accepts exactly that', async () => {
    await pay(bills['MED-1'], medico, 400, randomUUID(), '2099-01-15');
    const [before] = (await register.list(query({ distributorGstin: medico }), actor())).rows;
    expect(before.payment).toMatchObject({ state: 'DUE', outstanding: 900, scheduled: 400, scheduledOn: '2099-01-15', payable: 500 });

    await expect(pay(bills['MED-1'], medico, 500.01)).rejects.toThrow('Allocation exceeds outstanding balance');
    await pay(bills['MED-1'], medico, before.payment.payable);

    const [after] = (await register.list(query({ distributorGstin: medico }), actor())).rows;
    expect(after.payment).toMatchObject({ state: 'PARTIAL', outstanding: 400, scheduled: 400, scheduledOn: '2099-01-15', payable: 0 });
    await expect(pay(bills['MED-1'], medico, 0.5)).rejects.toThrow('Allocation exceeds outstanding balance');

    const later = new Date('2099-01-14T18:30:00.000Z');
    const [arrived] = (await register.list(query({ distributorGstin: medico }), actor(), later)).rows;
    expect(arrived.payment).toMatchObject({ state: 'PAID', outstanding: 0, scheduled: 0, scheduledOn: null, payable: 0 });
  });

  it('lists the original uploaded documents on the bill row', async () => {
    await db.pharmacyPurchaseInvoiceDocument.create({
      data: {
        branchId, purchaseInvoiceId: bills['MED-1'], fileName: 'med-1.pdf', mimeType: 'application/pdf',
        sizeBytes: 3, sha256: randomUUID(), data: Buffer.from('pdf'),
      },
    });
    const [row] = (await register.list(query({ distributorGstin: medico }), actor())).rows;
    expect(row.documents).toEqual([{ id: expect.any(String), fileName: 'med-1.pdf', mimeType: 'application/pdf' }]);
  });

  it('keeps the bills export, the register spreadsheet and the screen on the same clinic days', async () => {
    const october = { from: '2026-10-01', to: '2026-10-31', distributorGstin: zenith };
    expect(Object.keys(await rows(october))).toEqual(['ZEN-2']);
    const purchases = await new PharmacyPurchaseInvoiceService(db as any).findAll(
      { startDate: october.from, endDate: october.to, distributorGstin: zenith },
      branchId,
    );
    expect(purchases.data.map((bill: any) => bill.invoiceNumber)).toEqual(['ZEN-2']);

    const file = await register.export(query({ distributorGstin: linae, paymentState: 'OUTSTANDING', sortBy: 'billNo', sortDir: 'desc' }), actor());
    const sheet = XLSX.read(file.data, { type: 'buffer' }).Sheets['Purchase bills'];
    expect(
      XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet).map((row) => [row['Sr No'], row['Bill No'], row['Outstanding']]),
    ).toEqual([
      [2, 'LIN-3', 150],
      [1, 'LIN-1', 1000],
    ]);
  });

  it('counts the bills to review exactly as the register lists them for the financial year', async () => {
    await db.pharmacyPurchaseInvoice.create({
      data: {
        branchId,
        createdBy: userId,
        distributorName: 'Linae Distributors',
        distributorGstin: linae,
        distributorDlNo: 'synthetic',
        invoiceNumber: 'LIN-OLD',
        invoiceDate: new Date('2026-03-31T10:00:00+05:30'),
        billType: 'CREDIT',
        doctorNameOrRegNo: 'Synthetic',
        status: 'REVIEWED' as any,
        grossAmount: 10,
        taxableAmount: 10,
        totalGst: 0,
        netPayable: 10,
      },
    });
    const now = new Date('2026-11-06T06:00:00.000Z');
    const listed = await register.list(query({ paymentState: 'NOT_POSTED' }), actor(), now);
    expect(listed.rows.map((row) => row.billNo)).toEqual(['LIN-4']);
    expect(await register.toReviewCount(actor(), now)).toBe(1);
  });

  it('replays a payment retried under a legacy UTC-midnight fingerprint and rejects a payment dated before its bill', async () => {
    const requestKey = randomUUID();
    const legacy = await db.pharmacyPurchasePayment.create({
      data: {
        branchId,
        requestKey,
        requestFingerprint: (ledger as any).paymentFingerprint({
          distributorGstin: medico,
          distributorName: 'Medico Agencies',
          paymentDate: new Date('2026-10-20'),
          mode: 'NEFT',
          amount: 400,
          allocations: [{ purchaseInvoiceId: bills['MED-1'], amount: 400 }],
        }),
        distributorGstin: medico,
        distributorName: 'Medico Agencies',
        paymentDate: new Date('2026-10-20T00:00:00.000Z'),
        mode: 'NEFT',
        paidBy: userId,
        amount: 400,
        allocations: { create: [{ purchaseInvoiceId: bills['MED-1'], amount: 400 }] },
      },
    });
    expect((await pay(bills['MED-1'], medico, 400, requestKey, '2026-10-20')).id).toBe(legacy.id);
    await expect(pay(bills['MED-1'], medico, 100, randomUUID(), '2026-10-05')).rejects.toThrow(
      'The payment date cannot be before the bill date for invoice MED-1',
    );
  });

  it('settles a bill once for its outstanding amount across a retry, and its reversal reopens it', async () => {
    const requestKey = randomUUID();
    const [first, retry] = await Promise.all([
      pay(bills['LIN-3'], linae, 150, requestKey),
      pay(bills['LIN-3'], linae, 150, requestKey),
    ]);
    expect(retry.id).toBe(first.id);
    expect(await db.pharmacyPurchasePayment.count({ where: { requestKey } })).toBe(1);
    expect((await rows({ field: 'billNo', q: 'LIN-3' }))['LIN-3']).toEqual(['PAID', 0]);
    expect(
      (await ledger.getDistributorSummaries(branchId)).distributors.find((row) => row.distributorGstin === linae)!.outstanding,
    ).toBe(1000);

    await ledger.reversePayment(
      first.id,
      { requestKey: randomUUID(), expectedUpdatedAt: first.updatedAt.toISOString(), reason: 'Undone from purchase list' },
      branchId,
      userId,
    );
    expect((await rows({ field: 'billNo', q: 'LIN-3' }))['LIN-3']).toEqual(['PARTIAL', 150]);
    expect(
      (await ledger.getDistributorSummaries(branchId)).distributors.find((row) => row.distributorGstin === linae)!.outstanding,
    ).toBe(1150);
  });
});
