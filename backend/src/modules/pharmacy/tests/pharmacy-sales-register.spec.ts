import {
  SalesRegisterQuery,
  SalesRegisterRow,
  billRow,
  clinicDay,
  clinicDayRange,
  salesRegisterPage,
  workflowRow,
} from '../pharmacy-sales-register';

const asha = { id: 'user-asha', name: 'Asha Rao' };
const ravi = { id: 'user-ravi', name: 'Ravi Kumar' };

const row = (overrides: Partial<SalesRegisterRow>): SalesRegisterRow => ({
  id: `PHARMACY_BILL:${overrides.recordId ?? 'bill'}`,
  source: 'PHARMACY_BILL',
  recordId: 'bill',
  billNo: 'PHI-2026-001',
  state: 'FINAL',
  entryAt: '2026-06-01T05:00:00.000Z',
  billDate: '2026-06-01',
  entryBy: asha,
  patientName: 'Meera Shah',
  mobile: '9876543210',
  amount: 100,
  paymentModes: ['CASH'],
  linkedBillNo: null,
  ...overrides,
});

const query = (
  overrides: Partial<SalesRegisterQuery> = {},
): SalesRegisterQuery => ({
  register: 'sales',
  from: '2026-04-01',
  to: '2027-03-31',
  sortBy: 'entryAt',
  sortDir: 'desc',
  page: 1,
  limit: 50,
  ...overrides,
});

const ids = (rows: SalesRegisterRow[]) => rows.map((r) => r.recordId);

describe('sales register rows', () => {
  it('maps a confirmed pharmacy bill with its completed payment modes in order', () => {
    expect(
      billRow(
        {
          id: 'inv-1',
          invoiceNumber: 'PHI-2026-014',
          status: 'CONFIRMED',
          invoiceDate: new Date('2026-04-01T19:00:00.000Z'),
          createdAt: new Date('2026-04-01T19:00:05.000Z'),
          totalAmount: 1234.5,
          paymentMethod: 'CASH',
          billingName: '  ',
          billingPhone: '',
          patient: { name: 'Meera Shah', phone: '+91 98765 43210' },
          payments: [{ method: 'UPI' }, { method: 'CASH' }, { method: 'UPI' }],
        },
        asha,
      ),
    ).toEqual({
      id: 'PHARMACY_BILL:inv-1',
      source: 'PHARMACY_BILL',
      recordId: 'inv-1',
      billNo: 'PHI-2026-014',
      state: 'FINAL',
      entryAt: '2026-04-01T19:00:05.000Z',
      billDate: '2026-04-02',
      entryBy: asha,
      patientName: 'Meera Shah',
      mobile: '+91 98765 43210',
      amount: 1234.5,
      paymentModes: ['UPI', 'CASH'],
      linkedBillNo: null,
    });
  });

  it('hides the reserved number of a draft or pending bill and keeps it on a cancelled bill', () => {
    const bill = (status: string) =>
      billRow(
        {
          id: status,
          invoiceNumber: `PHI-${status}`,
          status,
          invoiceDate: new Date('2026-05-01T06:00:00.000Z'),
          createdAt: new Date('2026-05-01T06:00:00.000Z'),
          totalAmount: 10,
          paymentMethod: 'CARD',
          billingName: 'Walk In',
          billingPhone: '9000000000',
          patient: null,
          payments: [],
        },
        null,
      );
    expect(
      [
        bill('DRAFT'),
        bill('PENDING'),
        bill('CANCELLED'),
        bill('DISPENSED'),
      ].map((r) => [r.billNo, r.state, r.paymentModes]),
    ).toEqual([
      [null, 'DRAFT', ['CARD']],
      [null, 'DRAFT', ['CARD']],
      ['PHI-CANCELLED', 'CANCELLED', ['CARD']],
      ['PHI-DISPENSED', 'FINAL', ['CARD']],
    ]);
  });

  it('maps a posted counter sale with its own bill date and customer', () => {
    expect(
      workflowRow(
        {
          id: 'doc-1',
          kind: 'COUNTER_SALE',
          status: 'POSTED',
          reference: 'CS-0042',
          createdAt: new Date('2026-07-10T04:30:00.000Z'),
          totalAmount: { toString: () => '450.10' },
          payload: {
            customerName: 'Walk-in Ravi',
            customerPhone: '9123456780',
            paymentMode: 'upi',
            date: '2026-07-09',
          },
        },
        ravi,
        null,
      ),
    ).toEqual({
      id: 'COUNTER_SALE:doc-1',
      source: 'COUNTER_SALE',
      recordId: 'doc-1',
      billNo: 'CS-0042',
      state: 'FINAL',
      entryAt: '2026-07-10T04:30:00.000Z',
      billDate: '2026-07-09',
      entryBy: ravi,
      patientName: 'Walk-in Ravi',
      mobile: '9123456780',
      amount: 450.1,
      paymentModes: ['UPI'],
      linkedBillNo: null,
    });
  });

  it('maps a sales return by refund mode, links its original bill and falls back to the clinic day of entry', () => {
    const mapped = workflowRow(
      {
        id: 'ret-1',
        kind: 'SALES_RETURN',
        status: 'REVERSED',
        reference: 'SR-7',
        createdAt: new Date('2026-03-31T20:00:00.000Z'),
        totalAmount: 80,
        payload: { refundMode: 'BARTER', paymentMode: 'CASH' },
      },
      null,
      'PHI-2026-003',
    );
    expect([
      mapped.source,
      mapped.state,
      mapped.billNo,
      mapped.billDate,
      mapped.paymentModes,
      mapped.linkedBillNo,
      mapped.patientName,
    ]).toEqual([
      'SALES_RETURN',
      'CANCELLED',
      'SR-7',
      '2026-04-01',
      ['OTHER'],
      'PHI-2026-003',
      null,
    ]);
  });

  it('treats unposted workflow documents as drafts', () => {
    const doc = (status: string) =>
      workflowRow(
        {
          id: status,
          kind: 'COUNTER_SALE',
          status,
          reference: `CS-${status}`,
          createdAt: new Date('2026-07-10T04:30:00.000Z'),
          totalAmount: 1,
          payload: {},
        },
        null,
        null,
      );
    expect(
      [
        'DRAFT',
        'AWAITING_APPROVAL',
        'APPROVED',
        'POSTED',
        'RELEASED',
        'CANCELLED',
        'REJECTED',
      ].map((s) => [doc(s).state, doc(s).billNo]),
    ).toEqual([
      ['DRAFT', null],
      ['DRAFT', null],
      ['DRAFT', null],
      ['FINAL', 'CS-POSTED'],
      ['FINAL', 'CS-RELEASED'],
      ['CANCELLED', 'CS-CANCELLED'],
      ['CANCELLED', 'CS-REJECTED'],
    ]);
  });
});

describe('clinic day bounds', () => {
  it('reads the clinic day in Asia/Kolkata', () => {
    expect([
      clinicDay(new Date('2026-03-31T18:29:59.999Z')),
      clinicDay(new Date('2026-03-31T18:30:00.000Z')),
    ]).toEqual(['2026-03-31', '2026-04-01']);
  });

  it('turns an inclusive day range into Kolkata midnight bounds', () => {
    const range = clinicDayRange('2026-04-01', '2026-04-02');
    expect([range.gte.toISOString(), range.lt.toISOString()]).toEqual([
      '2026-03-31T18:30:00.000Z',
      '2026-04-02T18:30:00.000Z',
    ]);
  });
});

describe('sales register page', () => {
  it('totals only final rows across every page and counts the excluded drafts and cancellations', () => {
    const rows = [
      row({ recordId: 'a', amount: 100.1 }),
      row({ recordId: 'b', amount: 200.2 }),
      row({ recordId: 'c', amount: 999, state: 'DRAFT', billNo: null }),
      row({ recordId: 'd', amount: 50, state: 'CANCELLED' }),
      row({ recordId: 'e', amount: 0.05, source: 'COUNTER_SALE' }),
    ];
    const page = salesRegisterPage(rows, query({ limit: 2 }));
    expect([page.rows.length, page.total, page.totals]).toEqual([
      2,
      5,
      { amount: 300.35, count: 3, excluded: { drafts: 1, cancelled: 1 } },
    ]);
  });

  it('sorts bill numbers numerically with drafts last in both directions', () => {
    const rows = [
      row({ recordId: 'ten', billNo: 'PHI-2026-10' }),
      row({ recordId: 'draft', billNo: null, state: 'DRAFT' }),
      row({ recordId: 'nine', billNo: 'PHI-2026-9' }),
      row({ recordId: 'hundred', billNo: 'PHI-2026-100' }),
    ];
    expect(
      ids(
        salesRegisterPage(rows, query({ sortBy: 'billNo', sortDir: 'asc' }))
          .rows,
      ),
    ).toEqual(['nine', 'ten', 'hundred', 'draft']);
    expect(
      ids(
        salesRegisterPage(rows, query({ sortBy: 'billNo', sortDir: 'desc' }))
          .rows,
      ),
    ).toEqual(['hundred', 'ten', 'nine', 'draft']);
  });

  it('breaks ties by newest entry and sorts amounts as numbers', () => {
    const rows = [
      row({
        recordId: 'old-9',
        amount: 9,
        entryAt: '2026-06-01T05:00:00.000Z',
      }),
      row({
        recordId: 'new-9',
        amount: 9,
        entryAt: '2026-06-02T05:00:00.000Z',
      }),
      row({ recordId: 'eighty', amount: 80 }),
    ];
    expect(
      ids(
        salesRegisterPage(rows, query({ sortBy: 'amount', sortDir: 'asc' }))
          .rows,
      ),
    ).toEqual(['new-9', 'old-9', 'eighty']);
  });

  it('sorts by entry person with unknown creators last', () => {
    const rows = [
      row({ recordId: 'none', entryBy: null }),
      row({ recordId: 'ravi', entryBy: ravi }),
      row({ recordId: 'asha', entryBy: asha }),
    ];
    expect(
      ids(
        salesRegisterPage(rows, query({ sortBy: 'entryBy', sortDir: 'desc' }))
          .rows,
      ),
    ).toEqual(['ravi', 'asha', 'none']);
  });

  it('searches the chosen field and combines every filter', () => {
    const rows = [
      row({
        recordId: 'upi-asha',
        billNo: 'PHI-2026-120',
        patientName: 'Meera Shah',
        mobile: '+91 98765-43210',
        paymentModes: ['UPI', 'CASH'],
      }),
      row({
        recordId: 'cash-ravi',
        billNo: 'PHI-2026-121',
        patientName: 'Anil Shah',
        mobile: null,
        entryBy: ravi,
      }),
      row({
        recordId: 'counter',
        billNo: 'CS-12',
        source: 'COUNTER_SALE',
        patientName: 'Meera Iyer',
        paymentModes: ['UPI'],
      }),
      row({
        recordId: 'draft',
        billNo: null,
        state: 'DRAFT',
        patientName: 'Meera Rao',
      }),
    ];
    const found = (overrides: Partial<SalesRegisterQuery>) =>
      ids(salesRegisterPage(rows, query(overrides)).rows).sort();
    expect(found({ field: 'billNo', q: 'phi-2026-12' })).toEqual([
      'cash-ravi',
      'upi-asha',
    ]);
    expect(found({ field: 'patient', q: 'meera' })).toEqual([
      'counter',
      'draft',
      'upi-asha',
    ]);
    expect(found({ field: 'mobile', q: '98765 43' })).toEqual([
      'counter',
      'draft',
      'upi-asha',
    ]);
    expect(found({ field: 'mobile', q: 'abc' })).toEqual([]);
    expect(found({ paymentMode: 'UPI' })).toEqual(['counter', 'upi-asha']);
    expect(found({ state: 'DRAFT' })).toEqual(['draft']);
    expect(found({ source: 'COUNTER_SALE' })).toEqual(['counter']);
    expect(found({ entryById: 'user-ravi' })).toEqual(['cash-ravi']);
    expect(
      found({
        field: 'patient',
        q: 'shah',
        paymentMode: 'CASH',
        entryById: 'user-asha',
      }),
    ).toEqual(['upi-asha']);
  });

  it('keeps only rows billed within the inclusive range, whatever the financial year', () => {
    const rows = [
      row({ recordId: 'before', billDate: '2026-03-14' }),
      row({ recordId: 'fy25-end', billDate: '2026-03-31' }),
      row({ recordId: 'fy26-start', billDate: '2026-04-01' }),
      row({ recordId: 'last-day', billDate: '2026-04-15' }),
      row({ recordId: 'after', billDate: '2026-04-16' }),
    ];
    const page = salesRegisterPage(
      rows,
      query({ from: '2026-03-15', to: '2026-04-15' }),
    );
    expect([ids(page.rows).sort(), page.totals.amount]).toEqual([
      ['fy25-end', 'fy26-start', 'last-day'],
      300,
    ]);
  });

  it('pages after sorting', () => {
    const rows = ['1', '2', '3', '4', '5'].map((n) =>
      row({ recordId: n, billNo: `PHI-2026-${n}` }),
    );
    const page = salesRegisterPage(
      rows,
      query({ sortBy: 'billNo', sortDir: 'asc', page: 2, limit: 2 }),
    );
    expect([ids(page.rows), page.total, page.page, page.limit]).toEqual([
      ['3', '4'],
      5,
      2,
      2,
    ]);
  });

  it('offers every person who entered a row in the date range, by name, regardless of other filters', () => {
    const rows = [
      row({ recordId: 'a', entryBy: ravi, paymentModes: ['CARD'] }),
      row({ recordId: 'b', entryBy: asha }),
      row({ recordId: 'c', entryBy: asha }),
      row({ recordId: 'd', entryBy: null }),
      row({
        recordId: 'e',
        entryBy: { id: 'user-old', name: 'Old Staff' },
        billDate: '2025-01-01',
      }),
    ];
    expect(
      salesRegisterPage(rows, query({ paymentMode: 'CASH' })).entryByOptions,
    ).toEqual([asha, ravi]);
  });
});
