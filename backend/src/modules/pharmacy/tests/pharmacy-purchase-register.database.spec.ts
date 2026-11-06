import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import { InventoryWorkspaceService } from '../../inventory/inventory-workspace.service';
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
  let admin: PrismaClient;
  let db: PrismaClient;
  let ledger: PharmacyPurchaseLedgerService;
  let register: PharmacyPurchaseRegisterService;
  let branchId: string;
  let userId: string;
  let bills: Record<string, string>;

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
  const rows = async (overrides: Partial<PurchaseRegisterQuery> = {}) =>
    Object.fromEntries(
      (await register.list(query(overrides), actor())).rows.map((row) => [
        row.billNo,
        [row.payment.state, row.payment.outstanding],
      ]),
    );
  const pay = (invoiceId: string, gstin: string, amount: number, requestKey = randomUUID()) =>
    ledger.createPayment(
      {
        requestKey,
        distributorGstin: gstin,
        distributorName: gstin === linae ? 'Linae Distributors' : 'Medico Agencies',
        paymentDate: '2026-10-20',
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
    const seeds: [string, string, number, string, string | null][] = [
      ['LIN-1', linae, 1000, 'STOCK_COMMITTED', '2026-10-15T00:00:00+05:30'],
      ['LIN-2', linae, 500, 'STOCK_COMMITTED', null],
      ['LIN-3', linae, 300, 'STOCK_COMMITTED', null],
      ['LIN-4', linae, 700, 'REVIEWED', null],
      ['LIN-5', linae, 200, 'CANCELLED', null],
      ['MED-1', medico, 900, 'STOCK_COMMITTED', null],
    ];
    bills = {};
    for (const [index, [invoiceNumber, gstin, netPayable, status, dueDate]] of seeds.entries()) {
      const bill = await db.pharmacyPurchaseInvoice.create({
        data: {
          branchId,
          createdBy: userId,
          distributorName: gstin === linae ? 'Linae Distributors' : 'Medico Agencies',
          distributorGstin: gstin,
          distributorDlNo: 'synthetic',
          invoiceNumber,
          invoiceDate: new Date(`2026-10-0${index + 1}T10:00:00+05:30`),
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
    const workspace = new InventoryWorkspaceService(db as any, workflow as any);
    const credit = await db.inventorySupplierCredit.create({
      data: { branchId, supplierGstin: linae, documentId: randomUUID(), reference: 'SYN-CREDIT', amount: 50 },
    });
    await workspace.allocateCredit(actor(), {
      requestKey: randomUUID(),
      creditId: credit.id,
      purchaseInvoiceId: bills['LIN-3'],
      amount: 50,
    });
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
    expect(page.totals).toEqual({ amount: 2500, outstanding: 1150, count: 4, excluded: { cancelled: 1 } });
    expect(page.canSettle).toBe(true);

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
    });
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
