import {
  PurchaseInvoiceRecord,
  PurchaseRegisterQuery,
  canSettlePurchases,
  purchaseEntry,
  purchaseRegisterPage,
} from '../pharmacy-purchase-register';

const TODAY = '2026-11-06';

const invoice = (
  overrides: Partial<PurchaseInvoiceRecord> = {},
): PurchaseInvoiceRecord => ({
  id: 'inv-a',
  invoiceNumber: 'LIN/2026/101',
  invoiceDate: new Date('2026-10-01T04:30:00.000Z'),
  dueDate: null,
  createdAt: new Date('2026-10-01T05:00:00.000Z'),
  source: 'MANUAL',
  status: 'STOCK_COMMITTED',
  distributorName: 'Linae Distributors',
  distributorGstin: '36ABCDE1234F1Z5',
  netPayable: 1000,
  creditApplied: 0,
  paymentAllocations: [],
  ...overrides,
});

const payment = (overrides: Partial<PurchaseInvoiceRecord>) =>
  purchaseEntry(invoice(overrides), null, TODAY).payment;

const query = (
  overrides: Partial<PurchaseRegisterQuery> = {},
): PurchaseRegisterQuery => ({
  from: '2026-04-01',
  to: '2027-03-31',
  sortBy: 'srNo',
  sortDir: 'asc',
  page: 1,
  limit: 50,
  ...overrides,
});

describe('purchase register rows', () => {
  it('maps a posted bill to its register row with clinic dates and entry person', () => {
    const asha = { id: 'user-asha', name: 'Asha Rao' };
    expect(
      purchaseEntry(
        invoice({
          invoiceDate: new Date('2026-10-31T19:00:00.000Z'),
          dueDate: new Date('2026-11-30T18:30:00.000Z'),
          source: 'OCR',
          netPayable: 1234.567,
        }),
        asha,
        TODAY,
      ),
    ).toEqual({
      id: 'inv-a',
      billNo: 'LIN/2026/101',
      entryAt: '2026-10-01T05:00:00.000Z',
      billDate: '2026-11-01',
      entryBy: asha,
      source: 'OCR',
      distributor: { name: 'Linae Distributors', gstin: '36ABCDE1234F1Z5' },
      amount: 1234.57,
      invoiceState: 'POSTED',
      payment: {
        state: 'DUE',
        paid: 0,
        credit: 0,
        outstanding: 1234.57,
        dueDate: '2026-12-01',
        overdueDays: 0,
      },
    });
  });

  it('maps every saved status to the bill status the register filters on', () => {
    const states = [
      'DRAFT',
      'OCR_REVIEW_REQUIRED',
      'RECONCILIATION_FAILED',
      'REVIEWED',
      'STOCK_COMMITTED',
      'CANCELLED',
    ].map((status) => purchaseEntry(invoice({ status }), null, TODAY).invoiceState);
    expect(states).toEqual(['DRAFT', 'REVIEW', 'REVIEW', 'REVIEW', 'POSTED', 'CANCELLED']);
  });

  it('derives each payment state from payments, credits, status and the due date', () => {
    expect(payment({ status: 'CANCELLED', paymentAllocations: [{ amount: 200 }] })).toEqual({
      state: 'CANCELLED', paid: 200, credit: 0, outstanding: 0, dueDate: null, overdueDays: 0,
    });
    expect(payment({ status: 'REVIEWED' })).toEqual({
      state: 'NOT_POSTED', paid: 0, credit: 0, outstanding: 0, dueDate: null, overdueDays: 0,
    });
    expect(payment({ paymentAllocations: [{ amount: 600 }], creditApplied: 400 })).toEqual({
      state: 'PAID', paid: 600, credit: 400, outstanding: 0, dueDate: null, overdueDays: 0,
    });
    expect(payment({ paymentAllocations: [{ amount: 999.995 }] }).state).toBe('PAID');
    expect(payment({ creditApplied: 250 })).toEqual({
      state: 'PARTIAL', paid: 0, credit: 250, outstanding: 750, dueDate: null, overdueDays: 0,
    });
    expect(
      payment({ paymentAllocations: [{ amount: 100 }], dueDate: new Date('2026-10-26T18:30:00.000Z') }),
    ).toEqual({
      state: 'PARTIAL', paid: 100, credit: 0, outstanding: 900, dueDate: '2026-10-27', overdueDays: 10,
    });
  });

  it('turns a bill overdue only after its due day has passed in clinic time', () => {
    const dueTodayStart = payment({ dueDate: new Date('2026-11-05T18:30:00.000Z') });
    const dueYesterdayEnd = payment({ dueDate: new Date('2026-11-05T18:29:59.000Z') });
    expect([dueTodayStart.state, dueTodayStart.dueDate, dueTodayStart.overdueDays]).toEqual([
      'DUE', '2026-11-06', 0,
    ]);
    expect([dueYesterdayEnd.state, dueYesterdayEnd.dueDate, dueYesterdayEnd.overdueDays]).toEqual([
      'OVERDUE', '2026-11-05', 1,
    ]);
  });
});

describe('purchase register page', () => {
  const asha = { id: 'user-asha', name: 'Asha Rao' };
  const ravi = { id: 'user-ravi', name: 'Ravi Kumar' };
  const entries = [
    purchaseEntry(
      invoice({ id: 'a', invoiceNumber: 'LIN-10', createdAt: new Date('2026-10-01T05:00:00Z'), netPayable: 1000 }),
      asha,
      TODAY,
    ),
    purchaseEntry(
      invoice({
        id: 'b',
        invoiceNumber: 'LIN-9',
        createdAt: new Date('2026-10-02T05:00:00Z'),
        netPayable: 500,
        paymentAllocations: [{ amount: 500 }],
      }),
      ravi,
      TODAY,
    ),
    purchaseEntry(
      invoice({
        id: 'c',
        invoiceNumber: 'MED-1',
        createdAt: new Date('2026-10-03T05:00:00Z'),
        distributorName: 'Medico Agencies',
        distributorGstin: '27AAAAA0000A1Z5',
        netPayable: 300,
        dueDate: new Date('2026-10-30T18:30:00Z'),
      }),
      asha,
      TODAY,
    ),
    purchaseEntry(
      invoice({
        id: 'd',
        invoiceNumber: 'MED-2',
        createdAt: new Date('2026-10-04T05:00:00Z'),
        distributorName: 'Medico Agencies',
        distributorGstin: '27AAAAA0000A1Z5',
        netPayable: 200,
        status: 'CANCELLED',
      }),
      null,
      TODAY,
    ),
    purchaseEntry(
      invoice({
        id: 'e',
        invoiceNumber: 'LIN-11',
        createdAt: new Date('2026-10-05T05:00:00Z'),
        netPayable: 800,
        status: 'DRAFT',
        source: 'GMAIL',
      }),
      ravi,
      TODAY,
    ),
    purchaseEntry(
      invoice({
        id: 'f',
        invoiceNumber: 'OLD-1',
        invoiceDate: new Date('2026-03-31T10:00:00Z'),
        createdAt: new Date('2026-03-31T10:00:00Z'),
        distributorName: 'Zenith Pharma',
        distributorGstin: '29ZZZZZ9999Z1Z5',
      }),
      { id: 'user-old', name: 'Old Hand' },
      TODAY,
    ),
  ];
  const view = (overrides: Partial<PurchaseRegisterQuery> = {}) => purchaseRegisterPage(entries, query(overrides));
  const shown = (overrides: Partial<PurchaseRegisterQuery> = {}) =>
    view(overrides).rows.map((row) => `${row.srNo}:${row.billNo}`);

  it('numbers bills in entry order and totals non-cancelled bills in the period', () => {
    const page = view();
    expect(page.rows.map((row) => `${row.srNo}:${row.billNo}:${row.payment.state}`)).toEqual([
      '1:LIN-10:DUE',
      '2:LIN-9:PAID',
      '3:MED-1:OVERDUE',
      '4:MED-2:CANCELLED',
      '5:LIN-11:NOT_POSTED',
    ]);
    expect(page.total).toBe(5);
    expect(page.totals).toEqual({ amount: 2600, outstanding: 1300, count: 4, excluded: { cancelled: 1 } });
    expect(page.entryByOptions).toEqual([asha, ravi]);
    expect(page.distributorOptions).toEqual([
      { name: 'Linae Distributors', gstin: '36ABCDE1234F1Z5' },
      { name: 'Medico Agencies', gstin: '27AAAAA0000A1Z5' },
    ]);
  });

  it('numbers over the filtered set, so one supplier starts at Sr No 1', () => {
    expect(shown({ field: 'distributor', q: 'medico' })).toEqual(['1:MED-1', '2:MED-2']);
    expect(shown({ field: 'distributor', q: '36abcde' })).toEqual(['1:LIN-10', '2:LIN-9', '3:LIN-11']);
    expect(shown({ field: 'billNo', q: 'lin-1' })).toEqual(['1:LIN-10', '2:LIN-11']);
    expect(shown({ distributorGstin: '27aaaaa0000a1z5' })).toEqual(['1:MED-1', '2:MED-2']);
  });

  it('filters by payment state, with outstanding covering due, overdue and part-paid bills', () => {
    expect(shown({ paymentState: 'OUTSTANDING' })).toEqual(['1:LIN-10', '2:MED-1']);
    expect(view({ paymentState: 'OUTSTANDING' }).totals).toEqual({
      amount: 1300, outstanding: 1300, count: 2, excluded: { cancelled: 0 },
    });
    expect(shown({ paymentState: 'DUE' })).toEqual(['1:LIN-10']);
    expect(shown({ paymentState: 'OVERDUE' })).toEqual(['1:MED-1']);
    expect(shown({ paymentState: 'PAID' })).toEqual(['1:LIN-9']);
    expect(shown({ paymentState: 'NOT_POSTED' })).toEqual(['1:LIN-11']);
    expect(shown({ paymentState: 'PARTIAL' })).toEqual([]);
    expect(shown({ invoiceState: 'CANCELLED' })).toEqual(['1:MED-2']);
    expect(shown({ source: 'GMAIL' })).toEqual(['1:LIN-11']);
    expect(shown({ entryById: 'user-ravi' })).toEqual(['1:LIN-9', '2:LIN-11']);
    expect(shown({ from: '2026-03-31', to: '2026-03-31' })).toEqual(['1:OLD-1']);
  });

  it('sorts both ways, with bill numbers in numeric order', () => {
    expect(shown({ sortBy: 'billNo', sortDir: 'asc' })).toEqual(['2:LIN-9', '1:LIN-10', '5:LIN-11', '3:MED-1', '4:MED-2']);
    expect(shown({ sortBy: 'srNo', sortDir: 'desc' })).toEqual(['5:LIN-11', '4:MED-2', '3:MED-1', '2:LIN-9', '1:LIN-10']);
    expect(shown({ sortBy: 'amount', sortDir: 'desc' })).toEqual(['1:LIN-10', '5:LIN-11', '2:LIN-9', '3:MED-1', '4:MED-2']);
    expect(shown({ sortBy: 'outstanding', sortDir: 'desc' })).toEqual(['1:LIN-10', '3:MED-1', '5:LIN-11', '4:MED-2', '2:LIN-9']);
    expect(shown({ sortBy: 'distributor', sortDir: 'desc' })).toEqual(['4:MED-2', '3:MED-1', '5:LIN-11', '2:LIN-9', '1:LIN-10']);
    expect(shown({ sortBy: 'entryAt', sortDir: 'desc', page: 2, limit: 2 })).toEqual(['3:MED-1', '2:LIN-9']);
  });
});

describe('settle access', () => {
  it('matches the purchase ledger write guard', () => {
    expect(
      [
        ['OWNER', []],
        ['ADMIN', []],
        ['DOCTOR', []],
        ['PHARMACIST', ['pharmacy:purchase-ledger:write']],
        ['ACCOUNTANT', ['pharmacy:purchase-ledger:write']],
        ['PHARMACIST', ['pharmacy:purchase-ledger:read']],
        ['RECEPTION', ['pharmacy:purchase-ledger:write']],
      ].map(([role, permissions]) => canSettlePurchases(role as string, permissions as string[])),
    ).toEqual([true, true, true, true, true, false, false]);
  });
});
