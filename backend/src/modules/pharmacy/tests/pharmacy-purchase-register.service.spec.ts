import { PharmacyPurchaseRegisterService } from '../pharmacy-purchase-register.service';
import type { PurchaseRegisterQuery } from '../pharmacy-purchase-register';

describe('PharmacyPurchaseRegisterService', () => {
  const now = new Date('2026-11-06T06:00:00.000Z');
  const pharmacist = { id: 'user-asha', role: 'PHARMACIST', branchId: 'branch-1' };
  let prisma: any;
  let service: PharmacyPurchaseRegisterService;

  const query = (overrides: Partial<PurchaseRegisterQuery> = {}): PurchaseRegisterQuery => ({
    from: '2026-04-01',
    to: '2027-03-31',
    sortBy: 'srNo',
    sortDir: 'asc',
    page: 1,
    limit: 50,
    ...overrides,
  });

  const bill = (overrides: Record<string, unknown>) => ({
    invoiceDate: new Date('2026-10-01T04:30:00.000Z'),
    dueDate: null,
    source: 'MANUAL',
    status: 'STOCK_COMMITTED',
    distributorName: 'Linae Distributors',
    distributorGstin: '36ABCDE1234F1Z5',
    creditApplied: 0,
    paymentAllocations: [],
    ...overrides,
  });

  beforeEach(() => {
    prisma = {
      pharmacyPurchaseInvoice: {
        findMany: jest.fn().mockResolvedValue([
          bill({ id: 'a', invoiceNumber: 'LIN-1', createdAt: new Date('2026-10-01T05:00:00Z'), createdBy: 'user-asha', netPayable: 1000, paymentAllocations: [{ amount: 400 }] }),
          bill({ id: 'b', invoiceNumber: 'LIN-2', createdAt: new Date('2026-10-02T05:00:00Z'), createdBy: 'gmail-intake', netPayable: 250 }),
        ]),
      },
      user: {
        findMany: jest.fn(async ({ where }) =>
          [{ id: 'user-asha', firstName: 'Asha', lastName: 'Rao' }].filter((user) => where.id.in.includes(user.id)),
        ),
        findUnique: jest.fn().mockResolvedValue({ role: 'PHARMACIST', permissions: '["pharmacy:purchase-invoice:read"]' }),
      },
      role: { findFirst: jest.fn().mockResolvedValue({ permissions: '["pharmacy:purchase-ledger:write"]' }) },
    };
    service = new PharmacyPurchaseRegisterService(prisma);
  });

  it('reads this branch bills in the clinic-time range with only unreversed payments', async () => {
    await service.list(query({ from: '2026-11-01', to: '2026-11-06' }), pharmacist, now);
    expect(prisma.pharmacyPurchaseInvoice.findMany.mock.calls[0][0].where).toEqual({
      branchId: 'branch-1',
      invoiceDate: {
        gte: new Date('2026-10-31T18:30:00.000Z'),
        lt: new Date('2026-11-06T18:30:00.000Z'),
      },
    });
    expect(prisma.pharmacyPurchaseInvoice.findMany.mock.calls[0][0].select.paymentAllocations).toEqual({
      where: { payment: { reversedAt: null } },
      select: { amount: true },
    });
  });

  it('names users who entered bills, leaves automated creators blank and reports settle access from role permissions', async () => {
    const page = await service.list(query(), pharmacist, now);
    expect(
      page.rows.map((row) => [row.srNo, row.billNo, row.entryBy?.name ?? null, row.payment.state, row.payment.outstanding]),
    ).toEqual([
      [1, 'LIN-1', 'Asha Rao', 'PARTIAL', 600],
      [2, 'LIN-2', null, 'DUE', 250],
    ]);
    expect(page.totals).toEqual({ amount: 1250, outstanding: 850, count: 2, excluded: { cancelled: 0 } });
    expect(page.canSettle).toBe(true);
  });

  it('withholds settle access from a pharmacist without ledger write, while an admin needs no lookup', async () => {
    prisma.role.findFirst.mockResolvedValue({ permissions: '["pharmacy:purchase-ledger:read"]' });
    expect((await service.list(query(), pharmacist, now)).canSettle).toBe(false);
    prisma.user.findUnique.mockClear();
    expect((await service.list(query(), { id: 'user-admin', role: 'ADMIN', branchId: 'branch-1' }, now)).canSettle).toBe(true);
    expect(prisma.user.findUnique.mock.calls).toEqual([]);
  });
});
