import * as XLSX from 'xlsx';
import { PharmacyPurchaseRegisterService } from '../pharmacy-purchase-register.service';
import type { PurchaseRegisterQuery } from '../pharmacy-purchase-register';

describe('PharmacyPurchaseRegisterService', () => {
  const now = new Date('2026-11-06T06:00:00.000Z');
  const branch = { branchId: 'branch-1' };
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
          bill({ id: 'a', invoiceNumber: 'LIN-1', createdAt: new Date('2026-10-01T05:00:00Z'), createdBy: 'user-asha', netPayable: 1000, paymentAllocations: [
            { amount: 400, payment: { paymentDate: new Date('2026-10-05T18:30:00.000Z') } },
            { amount: 250, payment: { paymentDate: new Date('2026-11-06T18:30:00.000Z') } },
          ],
          documents: [{ id: 'doc-1', fileName: 'lin-1.pdf', mimeType: 'application/pdf' }] }),
          bill({ id: 'b', invoiceNumber: 'LIN-2', createdAt: new Date('2026-10-02T05:00:00Z'), createdBy: 'gmail-intake', netPayable: 250 }),
          bill({ id: 'c', invoiceNumber: 'LIN-3', createdAt: new Date('2026-10-03T05:00:00Z'), createdBy: 'user-asha', netPayable: 300, paymentAllocations: [{ amount: 300, payment: { paymentDate: new Date('2026-10-05T18:30:00.000Z') } }] }),
          bill({ id: 'd', invoiceNumber: 'LIN-4', createdAt: new Date('2026-10-04T05:00:00Z'), createdBy: 'user-asha', netPayable: 700, status: 'REVIEWED' }),
        ]),
      },
      user: {
        findMany: jest.fn(async ({ where }) =>
          [{ id: 'user-asha', firstName: 'Asha', lastName: 'Rao' }].filter((user) => where.id.in.includes(user.id)),
        ),
      },
    };
    service = new PharmacyPurchaseRegisterService(prisma);
  });

  it('reads this branch bills in the clinic-time range with only unreversed payments already in effect', async () => {
    await service.list(query({ from: '2026-11-01', to: '2026-11-06' }), branch, now);
    expect(prisma.pharmacyPurchaseInvoice.findMany.mock.calls[0][0].where).toEqual({
      branchId: 'branch-1',
      invoiceDate: {
        gte: new Date('2026-10-31T18:30:00.000Z'),
        lt: new Date('2026-11-06T18:30:00.000Z'),
      },
    });
    expect(prisma.pharmacyPurchaseInvoice.findMany.mock.calls[0][0].select.paymentAllocations).toEqual({
      where: { payment: { reversedAt: null } },
      select: { amount: true, payment: { select: { paymentDate: true } } },
    });
  });

  it('names users who entered bills, leaves automated creators blank and totals posted bills', async () => {
    const page = await service.list(query(), branch, now);
    expect(
      page.rows.map((row) => [row.srNo, row.billNo, row.entryBy?.name ?? null, row.payment.state, row.payment.outstanding]),
    ).toEqual([
      [1, 'LIN-1', 'Asha Rao', 'PARTIAL', 600],
      [2, 'LIN-2', null, 'DUE', 250],
      [3, 'LIN-3', 'Asha Rao', 'PAID', 0],
      [4, 'LIN-4', 'Asha Rao', 'NOT_POSTED', 0],
    ]);
    expect(page.totals).toEqual({
      amount: 1550,
      outstanding: 850,
      count: 3,
      excluded: { notPosted: 1, cancelled: 0 },
    });
    expect(Object.keys(page)).not.toContain('canSettle');
  });

  it('keeps a payment dated tomorrow out of the balance but off the amount that can be paid now', async () => {
    const [first] = (await service.list(query(), branch, now)).rows;
    expect(first.payment).toMatchObject({
      outstanding: 600, scheduled: 250, scheduledOn: '2026-11-07', payable: 350, paid: 400,
    });
    expect(first.documents).toEqual([{ id: 'doc-1', fileName: 'lin-1.pdf', mimeType: 'application/pdf' }]);
    const arrived = (await service.list(query(), branch, new Date('2026-11-06T18:30:00.000Z'))).rows[0];
    expect(arrived.payment).toMatchObject({ outstanding: 350, scheduled: 0, scheduledOn: null, payable: 350, paid: 650 });
  });

  it('exports every filtered bill, not just the page, as a spreadsheet named for the range', async () => {
    const file = await service.export(
      query({ paymentState: 'OUTSTANDING', sortBy: 'outstanding', sortDir: 'desc', page: 2, limit: 1 }),
      branch,
      now,
    );
    expect(file.fileName).toBe('purchase-bills-2026-04-01-2027-03-31.xlsx');
    expect(file.mimeType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const book = XLSX.read(file.data, { type: 'buffer' });
    expect(book.SheetNames).toEqual(['Purchase bills']);
    expect(XLSX.utils.sheet_to_json(book.Sheets['Purchase bills'])).toEqual([
      {
        'Sr No': 1, 'Bill No': 'LIN-1', 'Entry Date': '2026-10-01 10:30', 'Bill Date': '2026-10-01',
        'Entry By': 'Asha Rao', Distributor: 'Linae Distributors', GSTIN: '36ABCDE1234F1Z5',
        'Bill Amount': 1000, Payment: 'Part paid · 250 scheduled 2026-11-07', Outstanding: 600,
      },
      {
        'Sr No': 2, 'Bill No': 'LIN-2', 'Entry Date': '2026-10-02 10:30', 'Bill Date': '2026-10-01',
        'Entry By': '', Distributor: 'Linae Distributors', GSTIN: '36ABCDE1234F1Z5',
        'Bill Amount': 250, Payment: 'Due', Outstanding: 250,
      },
    ]);
  });
});
