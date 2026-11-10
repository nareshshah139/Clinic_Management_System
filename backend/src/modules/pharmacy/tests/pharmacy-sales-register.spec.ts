import { Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { QuerySalesRegisterDto } from '../dto/pharmacy-sales-register.dto';
import {
  PharmacyBillRecord,
  SaleEntry,
  SalesRegisterQuery,
  SalesRegisterRow,
  billEntry,
  clinicIdentity,
  linkedBillNos,
  returnSourceLineIds,
  salesRegisterPage,
  workflowEntry,
} from '../pharmacy-sales-register';

const asha = { id: 'user-asha', name: 'Asha Rao' };
const ravi = { id: 'user-ravi', name: 'Ravi Kumar' };

const entry = (
  overrides: Partial<SalesRegisterRow>,
  collected?: SaleEntry['collected'],
): SaleEntry => {
  const amount = overrides.amount ?? 100;
  const paymentModes = overrides.paymentModes ?? ['CASH'];
  const row: SalesRegisterRow = {
    id: `PHARMACY_BILL:${overrides.recordId ?? 'bill'}`,
    source: 'PHARMACY_BILL',
    recordId: 'bill',
    billNo: 'PHI-2026-001',
    reservedNo: null,
    state: 'FINAL',
    entryAt: '2026-06-01T05:00:00.000Z',
    billDate: '2026-06-01',
    entryBy: asha,
    patientName: 'Meera Shah',
    mobile: '9876543210',
    amount,
    paymentModes,
    due: 0,
    refundDue: 0,
    refunded: 0,
    revisedAt: null,
    linkedBillNos: [],
    ...overrides,
  };
  return {
    row,
    collected: collected ?? { [paymentModes[0]]: amount },
  };
};

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

const pharmacyBill = (
  overrides: Partial<PharmacyBillRecord>,
): PharmacyBillRecord => ({
  id: 'inv',
  invoiceNumber: 'PHI-2026-001',
  status: 'CONFIRMED',
  invoiceDate: new Date('2026-05-01T06:00:00.000Z'),
  createdAt: new Date('2026-05-01T06:00:00.000Z'),
  totalAmount: 10,
  revisedAt: null,
  billingName: 'Walk In',
  billingPhone: '9000000000',
  patient: null,
  payments: [],
  ...overrides,
});

const ids = (rows: SalesRegisterRow[]) => rows.map((r) => r.recordId);

describe('sales register rows', () => {
  it('maps a part-paid bill with the modes actually paid, the amount per mode and the balance due', () => {
    expect(
      billEntry(
        pharmacyBill({
          id: 'inv-1',
          invoiceNumber: 'PHI-2026-014',
          invoiceDate: new Date('2026-04-01T19:00:00.000Z'),
          createdAt: new Date('2026-04-01T19:00:05.000Z'),
          totalAmount: 1234.5,
          billingName: '  ',
          billingPhone: '',
          patient: { name: 'Meera Shah', phone: '+91 98765 43210' },
          payments: [
            { method: 'UPI', amount: 500 },
            { method: 'CASH', amount: 300 },
            { method: 'UPI', amount: 34.5 },
          ],
        }),
        asha,
      ),
    ).toEqual({
      row: {
        id: 'PHARMACY_BILL:inv-1',
        source: 'PHARMACY_BILL',
        recordId: 'inv-1',
        billNo: 'PHI-2026-014',
        reservedNo: null,
        state: 'FINAL',
        entryAt: '2026-04-01T19:00:05.000Z',
        billDate: '2026-04-02',
        entryBy: asha,
        patientName: 'Meera Shah',
        mobile: '+91 98765 43210',
        amount: 1234.5,
        paymentModes: ['UPI', 'CASH'],
        due: 400,
        refundDue: 0,
        refunded: 0,
        revisedAt: null,
        linkedBillNos: [],
      },
      collected: { UPI: 534.5, CASH: 300 },
    });
  });

  it('shows a revised bill paid above its new total as a refund due, and a recorded refund nets out of the takings', () => {
    const revised = (payments: PharmacyBillRecord['payments']) =>
      billEntry(
        pharmacyBill({
          totalAmount: 450,
          revisedAt: new Date('2026-05-02T09:30:00.000Z'),
          payments,
        }),
        null,
      );
    const due = revised([{ method: 'CASH', amount: 500 }]);
    const settled = revised([
      { method: 'CASH', amount: 500 },
      { method: 'CASH', amount: -50 },
    ]);
    expect(
      [due, settled].map(({ row: r, collected }) => [r.amount, r.due, r.refundDue, r.refunded, r.revisedAt, collected]),
    ).toEqual([
      [450, 0, 50, 0, '2026-05-02T09:30:00.000Z', { CASH: 500 }],
      [450, 0, 0, 50, '2026-05-02T09:30:00.000Z', { CASH: 450 }],
    ]);
  });

  it('lists only the modes money was received in, so a refund paid out by UPI is not a UPI payment', () => {
    const { row, collected } = billEntry(
      pharmacyBill({
        totalAmount: 450,
        payments: [
          { method: 'CASH', amount: 500 },
          { method: 'UPI', amount: -50 },
        ],
      }),
      null,
    );
    expect([row.paymentModes, row.refunded, collected]).toEqual([['CASH'], 50, { CASH: 500, UPI: -50 }]);
  });

  it('keeps a legacy draft number as reserved but never shows a draft placeholder as one, cancelled or not', () => {
    const draft = (invoiceNumber: string) =>
      billEntry(pharmacyBill({ status: 'DRAFT', invoiceNumber }), null).row;
    const cancelled = billEntry(pharmacyBill({ status: 'CANCELLED', invoiceNumber: 'DRAFT-6f1c2a9e-0b7d-4c55-9b0e-3f8e2a1d4c10' }), null).row;
    expect(
      [draft('PHI-2026-007'), draft('DRAFT-6f1c2a9e-0b7d-4c55-9b0e-3f8e2a1d4c10'), cancelled].map((r) => [r.billNo, r.reservedNo, r.state]),
    ).toEqual([
      [null, 'PHI-2026-007', 'DRAFT'],
      [null, null, 'DRAFT'],
      [null, null, 'CANCELLED'],
    ]);
  });

  it('reserves the number of a draft or pending bill, shows no payment mode when nothing was paid and owes only on final bills', () => {
    const bill = (status: string, payments: PharmacyBillRecord['payments']) =>
      billEntry(
        pharmacyBill({ status, invoiceNumber: `PHI-${status}`, payments }),
        null,
      );
    expect(
      [
        bill('DRAFT', []),
        bill('PENDING', []),
        bill('CANCELLED', []),
        bill('DISPENSED', []),
        bill('COMPLETED', [{ method: 'CARD', amount: 12 }]),
      ].map(({ row: r }) => [
        r.billNo,
        r.reservedNo,
        r.state,
        r.paymentModes,
        r.due,
      ]),
    ).toEqual([
      [null, 'PHI-DRAFT', 'DRAFT', [], 0],
      [null, 'PHI-PENDING', 'DRAFT', [], 0],
      ['PHI-CANCELLED', null, 'CANCELLED', [], 0],
      ['PHI-DISPENSED', null, 'FINAL', [], 10],
      ['PHI-COMPLETED', null, 'FINAL', ['CARD'], 0],
    ]);
  });

  it('lists an unknown status as a draft and warns once per source and status', () => {
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    try {
      const states = [
        billEntry(pharmacyBill({ id: 'a', status: 'ON_HOLD' }), null),
        billEntry(pharmacyBill({ id: 'b', status: 'ON_HOLD' }), null),
        workflowEntry(
          {
            id: 'c',
            kind: 'COUNTER_SALE',
            status: 'PARKED',
            reference: 'CS-1',
            createdAt: new Date('2026-07-10T04:30:00.000Z'),
            totalAmount: 1,
            payload: {},
          },
          null,
          [],
        ),
      ].map(({ row: r }) => [r.state, r.billNo]);
      expect([states, warn.mock.calls.map((call) => call[0])]).toEqual([
        [
          ['DRAFT', null],
          ['DRAFT', null],
          ['DRAFT', null],
        ],
        [
          'Listing PHARMACY_BILL status ON_HOLD as a draft',
          'Listing COUNTER_SALE status PARKED as a draft',
        ],
      ]);
    } finally {
      warn.mockRestore();
    }
  });

  it('maps a posted counter sale with its own bill date and customer and never links it to a bill', () => {
    expect(
      workflowEntry(
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
        ['QUOTE-1'],
      ),
    ).toEqual({
      row: {
        id: 'COUNTER_SALE:doc-1',
        source: 'COUNTER_SALE',
        recordId: 'doc-1',
        billNo: 'CS-0042',
        reservedNo: null,
        state: 'FINAL',
        entryAt: '2026-07-10T04:30:00.000Z',
        billDate: '2026-07-09',
        entryBy: ravi,
        patientName: 'Walk-in Ravi',
        mobile: '9123456780',
        amount: 450.1,
        paymentModes: ['UPI'],
        due: 0,
        refundDue: 0,
        refunded: 0,
        revisedAt: null,
        linkedBillNos: [],
      },
      collected: { UPI: 450.1 },
    });
  });

  it('maps a sales return by refund mode with its bills and reads its bill date in clinic time', () => {
    const mapped = (payload: Record<string, unknown>) =>
      workflowEntry(
        {
          id: 'ret-1',
          kind: 'SALES_RETURN',
          status: 'REVERSED',
          reference: 'SR-7',
          createdAt: new Date('2026-03-31T20:00:00.000Z'),
          totalAmount: 80,
          payload,
        },
        null,
        ['PHI-2026-003', 'CS-9'],
      );
    const plain = mapped({ refundMode: 'BARTER', paymentMode: 'CASH' }).row;
    expect([
      plain.source,
      plain.state,
      plain.billNo,
      plain.billDate,
      plain.paymentModes,
      plain.linkedBillNos,
      plain.patientName,
      mapped({ date: '2026-06-03T20:00:00.000Z' }).row.billDate,
      mapped({ date: '2026-02-30' }).row.billDate,
    ]).toEqual([
      'SALES_RETURN',
      'CANCELLED',
      'SR-7',
      '2026-04-01',
      ['OTHER'],
      ['PHI-2026-003', 'CS-9'],
      null,
      '2026-06-04',
      '2026-04-01',
    ]);
  });

  it('treats unposted workflow documents as drafts', () => {
    const doc = (status: string) =>
      workflowEntry(
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
        [],
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
      ].map((s) => {
        const { row } = doc(s);
        return [row.state, row.billNo, row.reservedNo];
      }),
    ).toEqual([
      ['DRAFT', null, null],
      ['DRAFT', null, null],
      ['DRAFT', null, null],
      ['FINAL', 'CS-POSTED', null],
      ['FINAL', 'CS-RELEASED', null],
      ['CANCELLED', 'CS-CANCELLED', null],
      ['CANCELLED', 'CS-REJECTED', null],
    ]);
  });

  it('resolves the bills a return was raised against from its invoice and the sales its lines return', () => {
    expect([
      returnSourceLineIds({
        lines: [{ sourceLineId: ' tx-1 ' }, {}, { sourceLineId: 'tx-2' }],
      }),
      returnSourceLineIds(null),
      linkedBillNos('PHI-7', [
        'INV-PHI-7',
        'WF-CS-9',
        'PARTNER-SALE-1',
        null,
        'INV-PHI-8',
      ]),
      linkedBillNos(null, ['WF-CS-9', 'WF-CS-9']),
    ]).toEqual([['tx-1', 'tx-2'], [], ['PHI-7', 'CS-9', 'PHI-8'], ['CS-9']]);
  });

  it('builds the clinic identity from the branch and omits missing fields', () => {
    const branch = {
      name: 'Skin Care Clinic',
      address: '12 MG Road',
      city: 'Pune',
      state: ' ',
      pincode: '411001',
      phone: '020 1234 5678',
      gstNumber: '27ABCDE1234F1Z5',
      licenseNumber: 'MH-PUN-20B-1234',
    };
    expect([
      clinicIdentity(branch),
      clinicIdentity({
        ...branch,
        address: '',
        city: null,
        pincode: null,
        phone: null,
        gstNumber: '',
        licenseNumber: null,
      }),
    ]).toEqual([
      {
        name: 'Skin Care Clinic',
        address: '12 MG Road, Pune, 411001',
        phone: '020 1234 5678',
        gstin: '27ABCDE1234F1Z5',
        drugLicence: 'MH-PUN-20B-1234',
      },
      { name: 'Skin Care Clinic' },
    ]);
  });
});

describe('sales register page', () => {
  it('totals only final rows across every page, counts the excluded drafts and cancellations and returns plain rows', () => {
    const rows = [
      entry({ recordId: 'a', amount: 100.1 }),
      entry({ recordId: 'b', amount: 200.2 }),
      entry({ recordId: 'c', amount: 999, state: 'DRAFT', billNo: null }),
      entry({ recordId: 'd', amount: 50, state: 'CANCELLED' }),
      entry({ recordId: 'e', amount: 0.05, source: 'COUNTER_SALE' }),
    ];
    const page = salesRegisterPage(rows, query({ limit: 2, sortDir: 'asc' }));
    expect([page.rows.length, page.total, page.totals, page.rows[0]]).toEqual([
      2,
      5,
      {
        amount: 300.35,
        count: 3,
        collected: null,
        excluded: { drafts: 1, cancelled: 1 },
      },
      {
        id: 'PHARMACY_BILL:a',
        source: 'PHARMACY_BILL',
        recordId: 'a',
        billNo: 'PHI-2026-001',
        reservedNo: null,
        state: 'FINAL',
        entryAt: '2026-06-01T05:00:00.000Z',
        billDate: '2026-06-01',
        entryBy: asha,
        patientName: 'Meera Shah',
        mobile: '9876543210',
        amount: 100.1,
        paymentModes: ['CASH'],
        due: 0,
        refundDue: 0,
        refunded: 0,
        revisedAt: null,
        linkedBillNos: [],
      },
    ]);
  });

  it('collects only the amount paid in the chosen mode on final rows', () => {
    const rows = [
      entry(
        {
          recordId: 'split',
          amount: 300,
          paymentModes: ['UPI', 'CASH'],
        },
        { UPI: 200, CASH: 100 },
      ),
      entry({
        recordId: 'counter',
        source: 'COUNTER_SALE',
        amount: 50.25,
        paymentModes: ['UPI'],
      }),
      entry(
        {
          recordId: 'draft',
          state: 'DRAFT',
          billNo: null,
          amount: 80,
          paymentModes: ['UPI'],
        },
        { UPI: 20 },
      ),
      entry({ recordId: 'cash', amount: 75 }),
    ];
    const page = salesRegisterPage(rows, query({ paymentMode: 'UPI' }));
    expect([ids(page.rows).sort(), page.total, page.totals]).toEqual([
      ['counter', 'draft', 'split'],
      3,
      {
        amount: 350.25,
        count: 2,
        collected: 250.25,
        excluded: { drafts: 1, cancelled: 0 },
      },
    ]);
  });

  it('treats credit as money still owed: final bills with a balance and sales on credit', () => {
    const rows = [
      entry(
        { recordId: 'owing', amount: 300, paymentModes: ['CASH'], due: 120 },
        { CASH: 180 },
      ),
      entry({ recordId: 'paid', amount: 90 }),
      entry({
        recordId: 'on-credit',
        source: 'COUNTER_SALE',
        amount: 40,
        paymentModes: ['CREDIT'],
      }),
      entry(
        {
          recordId: 'unpaid-draft',
          state: 'DRAFT',
          billNo: null,
          paymentModes: [],
        },
        {},
      ),
    ];
    const page = salesRegisterPage(rows, query({ paymentMode: 'CREDIT' }));
    expect([ids(page.rows).sort(), page.totals.collected]).toEqual([
      ['on-credit', 'owing'],
      160,
    ]);
  });

  it('sorts bill numbers numerically with drafts last in both directions', () => {
    const rows = [
      entry({ recordId: 'ten', billNo: 'PHI-2026-10' }),
      entry({ recordId: 'draft', billNo: null, state: 'DRAFT' }),
      entry({ recordId: 'nine', billNo: 'PHI-2026-9' }),
      entry({ recordId: 'hundred', billNo: 'PHI-2026-100' }),
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

  it('breaks ties by entry time then id in the requested direction and sorts amounts as numbers', () => {
    const rows = [
      entry({
        recordId: 'new-9',
        amount: 9,
        entryAt: '2026-06-02T05:00:00.000Z',
      }),
      entry({
        recordId: 'old-9-b',
        amount: 9,
        entryAt: '2026-06-01T05:00:00.000Z',
      }),
      entry({
        recordId: 'old-9-a',
        amount: 9,
        entryAt: '2026-06-01T05:00:00.000Z',
      }),
      entry({ recordId: 'eighty', amount: 80 }),
    ];
    const sorted = (sortDir: 'asc' | 'desc') =>
      ids(salesRegisterPage(rows, query({ sortBy: 'amount', sortDir })).rows);
    expect([sorted('asc'), sorted('desc')]).toEqual([
      ['old-9-a', 'old-9-b', 'new-9', 'eighty'],
      ['eighty', 'new-9', 'old-9-b', 'old-9-a'],
    ]);
  });

  it('sorts by entry person with unknown creators last', () => {
    const rows = [
      entry({ recordId: 'none', entryBy: null }),
      entry({ recordId: 'ravi', entryBy: ravi }),
      entry({ recordId: 'asha', entryBy: asha }),
    ];
    expect(
      ids(
        salesRegisterPage(rows, query({ sortBy: 'entryBy', sortDir: 'desc' }))
          .rows,
      ),
    ).toEqual(['ravi', 'asha', 'none']);
  });

  it('searches the chosen field, finds a draft by its reserved number and combines every filter', () => {
    const rows = [
      entry({
        recordId: 'upi-asha',
        billNo: 'PHI-2026-120',
        patientName: 'Meera Shah',
        mobile: '+91 98765-43210',
        paymentModes: ['UPI', 'CASH'],
      }),
      entry({
        recordId: 'cash-ravi',
        billNo: 'PHI-2026-121',
        patientName: 'Anil Shah',
        mobile: null,
        entryBy: ravi,
      }),
      entry({
        recordId: 'counter',
        billNo: 'CS-12',
        source: 'COUNTER_SALE',
        patientName: 'Meera Iyer',
        paymentModes: ['UPI'],
      }),
      entry({
        recordId: 'draft',
        billNo: null,
        reservedNo: 'PHI-2026-125',
        state: 'DRAFT',
        patientName: 'Meera Rao',
      }),
    ];
    const found = (overrides: Partial<SalesRegisterQuery>) =>
      ids(salesRegisterPage(rows, query(overrides)).rows).sort();
    expect(found({ field: 'billNo', q: 'phi-2026-12' })).toEqual([
      'cash-ravi',
      'draft',
      'upi-asha',
    ]);
    expect(found({ field: 'billNo', q: 'PHI-2026-125' })).toEqual(['draft']);
    expect(found({ field: 'patient', q: 'meera' })).toEqual([
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

  it('matches a mobile however the country code, trunk zero or spacing was typed on either side', () => {
    const rows = [
      entry({ recordId: 'plus', mobile: '+91 98765-43210' }),
      entry({ recordId: 'intl', mobile: '0091 98765 43210' }),
      entry({ recordId: 'trunk', mobile: '09876543210' }),
      entry({ recordId: 'local', mobile: '9876543210' }),
      entry({ recordId: 'other', mobile: '9198765400' }),
    ];
    const found = (q: string) =>
      ids(salesRegisterPage(rows, query({ field: 'mobile', q })).rows).sort();
    expect([
      found('+91 98765 43210'),
      found('0091-9876543210'),
      found('098765'),
      found('98765 43'),
    ]).toEqual([
      ['intl', 'local', 'plus', 'trunk'],
      ['intl', 'local', 'plus', 'trunk'],
      ['intl', 'local', 'other', 'plus', 'trunk'],
      ['intl', 'local', 'plus', 'trunk'],
    ]);
  });

  it('keeps only rows billed within the inclusive range, whatever the financial year', () => {
    const rows = [
      entry({ recordId: 'before', billDate: '2026-03-14' }),
      entry({ recordId: 'fy25-end', billDate: '2026-03-31' }),
      entry({ recordId: 'fy26-start', billDate: '2026-04-01' }),
      entry({ recordId: 'last-day', billDate: '2026-04-15' }),
      entry({ recordId: 'after', billDate: '2026-04-16' }),
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
      entry({ recordId: n, billNo: `PHI-2026-${n}` }),
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
      entry({ recordId: 'a', entryBy: ravi, paymentModes: ['CARD'] }),
      entry({ recordId: 'b', entryBy: asha }),
      entry({ recordId: 'c', entryBy: asha }),
      entry({ recordId: 'd', entryBy: null }),
      entry({
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

describe('sales register query', () => {
  const errors = async (from: string, to: string) => {
    const dto = plainToInstance(QuerySalesRegisterDto, {
      register: 'sales',
      from,
      to,
    });
    return (await validate(dto)).flatMap((error) =>
      Object.values(error.constraints ?? {}),
    );
  };

  it('accepts at most 400 days, rejects a reversed range with a plain message and leaves malformed dates to the format checks', async () => {
    expect([
      await errors('2026-04-01', '2027-05-05'),
      await errors('2026-04-01', '2026-04-01'),
      await errors('2026-04-01', '2027-05-06'),
      await errors('2026-05-01', '2026-04-30'),
      (await errors('2026-04-01', '2026-02-30')).includes(
        'The start date must be on or before the end date',
      ),
    ]).toEqual([
      [],
      [],
      ['Choose a date range of at most 400 days'],
      ['The start date must be on or before the end date'],
      false,
    ]);
  });
});
