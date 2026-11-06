import { PharmacyPurchaseInvoiceStatus } from '@prisma/client';
import {
  PurchaseInvoiceRecord,
  PurchaseRegisterQuery,
  purchaseEntry,
  purchaseRegisterPage,
  purchaseRegisterRows,
  purchaseRegisterSheet,
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
      documents: [],
      payment: {
        state: 'DUE',
        paid: 0,
        credit: 0,
        outstanding: 1234.57,
        scheduled: 0,
        scheduledOn: null,
        payable: 1234.57,
        dueDate: '2026-12-01',
        overdueDays: 0,
        partlyPaid: false,
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
    ].map((status) =>
      purchaseEntry(invoice({ status: status as PharmacyPurchaseInvoiceStatus }), null, TODAY).invoiceState,
    );
    expect(states).toEqual([
      'DRAFT',
      'OCR_REVIEW',
      'RECONCILIATION_FAILED',
      'REVIEWED',
      'POSTED',
      'CANCELLED',
    ]);
  });

  it('derives each payment state from payments, credits, status and the due date', () => {
    expect(payment({ status: 'CANCELLED', paymentAllocations: [{ amount: 200 }] })).toEqual({
      state: 'CANCELLED', paid: 200, credit: 0, outstanding: 0, scheduled: 0, scheduledOn: null, payable: 0, dueDate: null, overdueDays: 0, partlyPaid: false,
    });
    expect(payment({ status: 'REVIEWED' })).toEqual({
      state: 'NOT_POSTED', paid: 0, credit: 0, outstanding: 0, scheduled: 0, scheduledOn: null, payable: 0, dueDate: null, overdueDays: 0, partlyPaid: false,
    });
    expect(payment({ paymentAllocations: [{ amount: 600 }], creditApplied: 400 })).toEqual({
      state: 'PAID', paid: 600, credit: 400, outstanding: 0, scheduled: 0, scheduledOn: null, payable: 0, dueDate: null, overdueDays: 0, partlyPaid: false,
    });
    expect(payment({ paymentAllocations: [{ amount: 999.995 }] }).state).toBe('PAID');
    expect(payment({ creditApplied: 250 })).toEqual({
      state: 'PARTIAL', paid: 0, credit: 250, outstanding: 750, scheduled: 0, scheduledOn: null, payable: 750, dueDate: null, overdueDays: 0, partlyPaid: true,
    });
    expect(payment({ creditApplied: 250, dueDate: new Date('2026-11-10T18:30:00.000Z') })).toEqual({
      state: 'PARTIAL', paid: 0, credit: 250, outstanding: 750, scheduled: 0, scheduledOn: null, payable: 750, dueDate: '2026-11-11', overdueDays: 0, partlyPaid: true,
    });
  });

  it('ranks a part-paid bill past its due day as overdue and still says it was part paid', () => {
    expect(
      payment({ paymentAllocations: [{ amount: 100 }], dueDate: new Date('2026-10-26T18:30:00.000Z') }),
    ).toEqual({
      state: 'OVERDUE', paid: 100, credit: 0, outstanding: 900, scheduled: 0, scheduledOn: null, payable: 900, dueDate: '2026-10-27', overdueDays: 10, partlyPaid: true,
    });
  });

  it('splits future-dated payments off the balance a bill can be paid now', () => {
    const entry = purchaseEntry(
      invoice({
        paymentAllocations: [{ amount: 100 }],
        scheduledAllocations: [
          { amount: 400, payment: { paymentDate: new Date('2099-01-14T18:30:00.000Z') } },
          { amount: 50, payment: { paymentDate: new Date('2098-06-01T18:30:00.000Z') } },
        ],
      }),
      null,
      TODAY,
    );
    expect(entry.payment).toMatchObject({
      state: 'PARTIAL', paid: 100, outstanding: 900, scheduled: 450, scheduledOn: '2098-06-02', payable: 450,
    });
    const covered = payment({
      scheduledAllocations: [{ amount: 1000, payment: { paymentDate: new Date('2099-01-14T18:30:00.000Z') } }],
    });
    expect(covered).toMatchObject({ state: 'DUE', outstanding: 1000, scheduled: 1000, scheduledOn: '2099-01-15', payable: 0 });
  });

  it('words scheduled payments in the spreadsheet, including an overdue bill they fully cover', () => {
    const sheetPayment = (overrides: Partial<PurchaseInvoiceRecord>) =>
      purchaseRegisterSheet(
        purchaseRegisterRows([{ ...purchaseEntry(invoice(overrides), null, TODAY) }], query()),
      )[0].Payment;
    const future = (amount: number) => ({
      amount,
      payment: { paymentDate: new Date('2099-01-14T18:30:00.000Z') },
    });
    expect(
      sheetPayment({ dueDate: new Date('2026-10-27T18:30:00.000Z'), scheduledAllocations: [future(1000)] }),
    ).toBe('Scheduled 2099-01-15 · was due 2026-10-28');
    expect(
      sheetPayment({ dueDate: new Date('2026-10-27T18:30:00.000Z'), scheduledAllocations: [future(400)] }),
    ).toBe('Overdue · 9 days · 400 scheduled 2099-01-15');
  });

  it('carries the original uploaded documents on the row', () => {
    const documents = [{ id: 'doc-1', fileName: 'bill.pdf', mimeType: 'application/pdf' }];
    expect(purchaseEntry(invoice({ documents }), null, TODAY).documents).toEqual(documents);
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
        id: 'g',
        invoiceNumber: 'MED-3',
        createdAt: new Date('2026-10-03T06:00:00Z'),
        distributorName: 'Medico Agencies',
        distributorGstin: '27AAAAA0000A1Z5',
        netPayable: 400,
        dueDate: new Date('2026-10-31T18:30:00Z'),
        paymentAllocations: [{ amount: 150 }],
      }),
      asha,
      TODAY,
    ),
    purchaseEntry(
      invoice({
        id: 'h',
        invoiceNumber: 'LIN-12',
        createdAt: new Date('2026-10-06T05:00:00Z'),
        netPayable: 600,
        status: 'OCR_REVIEW_REQUIRED',
        source: 'OCR',
      }),
      ravi,
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

  it('numbers bills in entry order and totals only posted bills in the period', () => {
    const page = view();
    expect(page.rows.map((row) => `${row.srNo}:${row.billNo}:${row.invoiceState}:${row.payment.state}`)).toEqual([
      '1:LIN-10:POSTED:DUE',
      '2:LIN-9:POSTED:PAID',
      '3:MED-1:POSTED:OVERDUE',
      '4:MED-3:POSTED:OVERDUE',
      '5:MED-2:CANCELLED:CANCELLED',
      '6:LIN-11:DRAFT:NOT_POSTED',
      '7:LIN-12:OCR_REVIEW:NOT_POSTED',
    ]);
    expect(page.total).toBe(7);
    expect(page.totals).toEqual({
      amount: 2200,
      outstanding: 1550,
      count: 4,
      excluded: { notPosted: 2, cancelled: 1 },
    });
    expect(page.entryByOptions).toEqual([asha, ravi]);
    expect(page.distributorOptions).toEqual([
      { name: 'Linae Distributors', gstin: '36ABCDE1234F1Z5' },
      { name: 'Medico Agencies', gstin: '27AAAAA0000A1Z5' },
    ]);
  });

  it('numbers over the filtered set, so one supplier starts at Sr No 1', () => {
    expect(shown({ field: 'distributor', q: 'medico' })).toEqual(['1:MED-1', '2:MED-3', '3:MED-2']);
    expect(shown({ field: 'distributor', q: '36abcde' })).toEqual(['1:LIN-10', '2:LIN-9', '3:LIN-11', '4:LIN-12']);
    expect(shown({ field: 'billNo', q: 'lin-1' })).toEqual(['1:LIN-10', '2:LIN-11', '3:LIN-12']);
    expect(shown({ distributorGstin: '27aaaaa0000a1z5' })).toEqual(['1:MED-1', '2:MED-3', '3:MED-2']);
  });

  it('filters by payment state, with overdue including part-paid late bills and outstanding covering every unpaid posted bill', () => {
    expect(shown({ paymentState: 'OVERDUE' })).toEqual(['1:MED-1', '2:MED-3']);
    expect(view({ paymentState: 'OVERDUE' }).rows.map((row) => row.payment.partlyPaid)).toEqual([false, true]);
    expect(shown({ paymentState: 'OUTSTANDING' })).toEqual(['1:LIN-10', '2:MED-1', '3:MED-3']);
    expect(view({ paymentState: 'OUTSTANDING' }).totals).toEqual({
      amount: 1700, outstanding: 1550, count: 3, excluded: { notPosted: 0, cancelled: 0 },
    });
    expect(shown({ paymentState: 'DUE' })).toEqual(['1:LIN-10']);
    expect(shown({ paymentState: 'PAID' })).toEqual(['1:LIN-9']);
    expect(shown({ paymentState: 'NOT_POSTED' })).toEqual(['1:LIN-11', '2:LIN-12']);
    expect(shown({ paymentState: 'PARTIAL' })).toEqual([]);
    expect(shown({ source: 'GMAIL' })).toEqual(['1:LIN-11']);
    expect(shown({ entryById: 'user-ravi' })).toEqual(['1:LIN-9', '2:LIN-11', '3:LIN-12']);
    expect(shown({ from: '2026-03-31', to: '2026-03-31' })).toEqual(['1:OLD-1']);
  });

  it('filters by each bill status, with in review covering the three review statuses', () => {
    expect(shown({ invoiceState: 'CANCELLED' })).toEqual(['1:MED-2']);
    expect(shown({ invoiceState: 'DRAFT' })).toEqual(['1:LIN-11']);
    expect(shown({ invoiceState: 'OCR_REVIEW' })).toEqual(['1:LIN-12']);
    expect(shown({ invoiceState: 'IN_REVIEW' })).toEqual(['1:LIN-12']);
    expect(shown({ invoiceState: 'REVIEWED' })).toEqual([]);
    expect(view({ invoiceState: 'IN_REVIEW' }).totals).toEqual({
      amount: 0, outstanding: 0, count: 0, excluded: { notPosted: 1, cancelled: 0 },
    });
  });

  it('sorts both ways, with bill numbers in numeric order', () => {
    expect(shown({ sortBy: 'billNo', sortDir: 'asc' })).toEqual([
      '2:LIN-9', '1:LIN-10', '6:LIN-11', '7:LIN-12', '3:MED-1', '5:MED-2', '4:MED-3',
    ]);
    expect(shown({ sortBy: 'srNo', sortDir: 'desc' })).toEqual([
      '7:LIN-12', '6:LIN-11', '5:MED-2', '4:MED-3', '3:MED-1', '2:LIN-9', '1:LIN-10',
    ]);
    expect(shown({ sortBy: 'amount', sortDir: 'desc' })).toEqual([
      '1:LIN-10', '6:LIN-11', '7:LIN-12', '2:LIN-9', '4:MED-3', '3:MED-1', '5:MED-2',
    ]);
    expect(shown({ sortBy: 'outstanding', sortDir: 'desc' })).toEqual([
      '1:LIN-10', '3:MED-1', '4:MED-3', '7:LIN-12', '6:LIN-11', '5:MED-2', '2:LIN-9',
    ]);
    expect(shown({ sortBy: 'distributor', sortDir: 'desc' })).toEqual([
      '5:MED-2', '4:MED-3', '3:MED-1', '7:LIN-12', '6:LIN-11', '2:LIN-9', '1:LIN-10',
    ]);
    expect(shown({ sortBy: 'entryAt', sortDir: 'desc', page: 2, limit: 2 })).toEqual(['5:MED-2', '4:MED-3']);
  });

  it('lays out every filtered bill for the spreadsheet in the screen order with clinic times', () => {
    expect(
      purchaseRegisterSheet(
        purchaseRegisterRows(entries, query({ field: 'distributor', q: 'medico', sortBy: 'billNo', sortDir: 'desc', limit: 1 })),
      ),
    ).toEqual([
      {
        'Sr No': 2, 'Bill No': 'MED-3', 'Entry Date': '2026-10-03 11:30', 'Bill Date': '2026-10-01',
        'Entry By': 'Asha Rao', Distributor: 'Medico Agencies', GSTIN: '27AAAAA0000A1Z5',
        'Bill Amount': 400, Payment: 'Overdue · 5 days · part paid', Outstanding: 250,
      },
      {
        'Sr No': 3, 'Bill No': 'MED-2', 'Entry Date': '2026-10-04 10:30', 'Bill Date': '2026-10-01',
        'Entry By': '', Distributor: 'Medico Agencies', GSTIN: '27AAAAA0000A1Z5',
        'Bill Amount': 200, Payment: 'Cancelled', Outstanding: 0,
      },
      {
        'Sr No': 1, 'Bill No': 'MED-1', 'Entry Date': '2026-10-03 10:30', 'Bill Date': '2026-10-01',
        'Entry By': 'Asha Rao', Distributor: 'Medico Agencies', GSTIN: '27AAAAA0000A1Z5',
        'Bill Amount': 300, Payment: 'Overdue · 6 days', Outstanding: 300,
      },
    ]);
  });
});
