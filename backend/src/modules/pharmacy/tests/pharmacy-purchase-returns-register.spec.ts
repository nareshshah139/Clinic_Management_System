import {
  purchaseReturnEntry,
  purchaseReturnsPage,
  returnCreditState,
  type PurchaseReturnsQuery,
  type ReturnDocumentRecord,
} from '../pharmacy-purchase-returns-register';
import { creditBalance, creditHeldByDistributor } from '../supplier-credit-balance';
import { creditNoteNumberOf, returnReasonOf } from '../../inventory/supplier-return';

const now = new Date('2026-11-06T06:00:00.000Z');
const linae = '36ABCDE1234F1Z5';
const medico = '27AAAAA0000A1Z5';

const credit = (overrides: Record<string, unknown> = {}) => ({
  id: 'credit-1',
  supplierGstin: linae,
  amount: 500,
  createdAt: new Date('2026-10-10T05:00:00Z'),
  reversedAt: null,
  creditNoteNumber: 'CN-1',
  creditNoteDate: new Date('2026-10-12T00:00:00.000Z'),
  receivedAt: new Date('2026-10-12T06:00:00Z'),
  allocations: [],
  ...overrides,
});

const doc = (overrides: Partial<ReturnDocumentRecord> = {}): ReturnDocumentRecord => ({
  id: 'ret-1',
  kind: 'SUPPLIER_RETURN',
  status: 'POSTED',
  reference: 'RET-1',
  version: 3,
  createdAt: new Date('2026-10-05T05:00:00Z'),
  payload: { date: '2026-10-05', returnType: 'EXPIRY' },
  totalAmount: 520,
  supplierGstin: linae,
  distributorName: 'Linae Distributors',
  sourceBillNo: 'LIN-1',
  credit: credit(),
  ...overrides,
});

const query = (overrides: Partial<PurchaseReturnsQuery> = {}): PurchaseReturnsQuery => ({
  from: '2026-04-01',
  to: '2027-03-31',
  sortBy: 'srNo',
  sortDir: 'asc',
  page: 1,
  limit: 50,
  ...overrides,
});

const asha = { id: 'asha', name: 'Asha Rao' };

describe('purchase returns register', () => {
  it('derives one credit state per return from its status and its credit note', () => {
    expect(
      [
        returnCreditState('DRAFT', null),
        returnCreditState('APPROVED', null),
        returnCreditState('CHALLAN', null),
        returnCreditState('POSTED', { number: null, amount: 520, applied: 0 }),
        returnCreditState('POSTED', { number: 'CN-1', amount: 500, applied: 0 }),
        returnCreditState('POSTED', { number: 'CN-1', amount: 500, applied: 200 }),
        returnCreditState('POSTED', { number: 'CN-1', amount: 500, applied: 499.995 }),
        returnCreditState('REVERSED', { number: 'CN-1', amount: 500, applied: 0 }),
        returnCreditState('CANCELLED', null),
      ],
    ).toEqual(['DRAFT', 'DRAFT', 'AWAITED', 'AWAITED', 'RECEIVED', 'ADJUSTED', 'USED', 'CANCELLED', 'CANCELLED']);
  });

  it('shows the credit note as received from the distributor next to our own return value', () => {
    const row = purchaseReturnEntry(
      doc({ credit: credit({ allocations: [{ amount: 200, createdAt: new Date('2026-10-20T05:00:00Z'), reversedAt: null }] }) }),
      asha,
      now,
    );
    expect(row).toEqual({
      id: 'ret-1',
      kind: 'SUPPLIER_RETURN',
      version: 3,
      returnRef: 'RET-1',
      creditNote: { number: 'CN-1', date: '2026-10-12', amount: 500 },
      entryAt: '2026-10-05T05:00:00.000Z',
      returnDate: '2026-10-05',
      entryBy: asha,
      distributor: { name: 'Linae Distributors', gstin: linae },
      sourceBillNo: 'LIN-1',
      returnValue: 520,
      credit: { id: 'credit-1', amount: 500, applied: 200, available: 300 },
      state: 'ADJUSTED',
      reason: 'EXPIRY',
    });
  });

  it('keeps a legacy posted return without a credit note number awaited, with its computed credit', () => {
    const row = purchaseReturnEntry(
      doc({ credit: credit({ creditNoteNumber: null, creditNoteDate: null, receivedAt: null, amount: 520 }), payload: { returnType: 'DAMAGE' } }),
      null,
      now,
    );
    expect([row.state, row.creditNote, row.credit?.available, row.reason, row.returnDate]).toEqual([
      'AWAITED',
      null,
      520,
      'BREAKAGE',
      '2026-10-05',
    ]);
  });

  const entries = () => [
    purchaseReturnEntry(doc(), asha, now),
    purchaseReturnEntry(
      doc({
        id: 'ret-2',
        reference: 'RET-2',
        status: 'CHALLAN',
        createdAt: new Date('2026-10-06T05:00:00Z'),
        payload: { date: '2026-10-06', returnType: 'BREAKAGE' },
        totalAmount: 150,
        credit: null,
      }),
      asha,
      now,
    ),
    purchaseReturnEntry(
      doc({
        id: 'ret-3',
        reference: 'RET-3',
        createdAt: new Date('2026-10-07T05:00:00Z'),
        payload: { date: '2026-10-07', returnType: 'EXCESS_SUPPLY' },
        supplierGstin: medico,
        distributorName: 'Medico Agencies',
        totalAmount: 80,
        credit: credit({
          id: 'credit-3',
          supplierGstin: medico,
          creditNoteNumber: 'MED-CN-9',
          creditNoteDate: new Date('2026-10-08T00:00:00.000Z'),
          amount: 80,
          allocations: [{ amount: 80, createdAt: new Date('2026-10-09T05:00:00Z'), reversedAt: null }],
        }),
      }),
      { id: 'ravi', name: 'Ravi Iyer' },
      now,
    ),
    purchaseReturnEntry(
      doc({ id: 'ret-4', reference: 'RET-4', status: 'DRAFT', createdAt: new Date('2026-10-08T05:00:00Z'), payload: { date: '2026-10-08' }, totalAmount: 60, credit: null }),
      asha,
      now,
    ),
    purchaseReturnEntry(
      doc({ id: 'cn-5', kind: 'CREDIT_NOTE', reference: 'Rate difference', status: 'CANCELLED', createdAt: new Date('2026-10-09T05:00:00Z'), payload: { date: '2026-10-09' }, totalAmount: 40, credit: null, sourceBillNo: null }),
      asha,
      now,
    ),
    purchaseReturnEntry(
      doc({ id: 'ret-old', reference: 'RET-OLD', createdAt: new Date('2026-03-20T05:00:00Z'), payload: { date: '2026-03-20' }, credit: null, status: 'CHALLAN' }),
      asha,
      now,
    ),
  ];

  it('numbers rows by entry, totals credit held and awaited, and states what the count leaves out', () => {
    const page = purchaseReturnsPage(entries(), query());
    expect(page.rows.map((row) => [row.srNo, row.returnRef, row.state])).toEqual([
      [1, 'RET-1', 'RECEIVED'],
      [2, 'RET-2', 'AWAITED'],
      [3, 'RET-3', 'USED'],
      [4, 'RET-4', 'DRAFT'],
      [5, 'Rate difference', 'CANCELLED'],
    ]);
    expect(page.totals).toEqual({
      held: 500,
      awaited: { amount: 150, count: 1 },
      count: 3,
      excluded: { drafts: 1, cancelled: 1 },
    });
    expect(page.distributorOptions).toEqual([
      { name: 'Linae Distributors', gstin: linae },
      { name: 'Medico Agencies', gstin: medico },
    ]);
    expect(page.entryByOptions).toEqual([asha, { id: 'ravi', name: 'Ravi Iyer' }]);
  });

  it('filters by credit note number, return reference, distributor, state, type, reason and entry person', () => {
    const refs = (overrides: Partial<PurchaseReturnsQuery>) =>
      purchaseReturnsPage(entries(), query(overrides)).rows.map((row) => row.returnRef);
    expect(refs({ field: 'creditNoteNo', q: 'med-cn' })).toEqual(['RET-3']);
    expect(refs({ field: 'returnRef', q: 'ret-2' })).toEqual(['RET-2']);
    expect(refs({ field: 'distributor', q: '27AAAAA' })).toEqual(['RET-3']);
    expect(refs({ state: 'AWAITED' })).toEqual(['RET-2']);
    expect(refs({ distributorGstin: medico.toLowerCase() })).toEqual(['RET-3']);
    expect(refs({ kind: 'CREDIT_NOTE' })).toEqual(['Rate difference']);
    expect(refs({ reason: 'BREAKAGE' })).toEqual(['RET-2']);
    expect(refs({ entryById: 'ravi' })).toEqual(['RET-3']);
    expect(refs({ from: '2026-03-01', to: '2026-03-31' })).toEqual(['RET-OLD']);
  });

  it('sorts by the amount shown, the credit note number and the lifecycle state', () => {
    const order = (sortBy: PurchaseReturnsQuery['sortBy'], sortDir: 'asc' | 'desc') =>
      purchaseReturnsPage(entries(), query({ sortBy, sortDir })).rows.map((row) => row.returnRef);
    expect(order('amount', 'desc')).toEqual(['RET-1', 'RET-2', 'RET-3', 'RET-4', 'Rate difference']);
    expect(order('creditNoteNo', 'asc')).toEqual(['RET-2', 'RET-4', 'Rate difference', 'RET-1', 'RET-3']);
    expect(order('state', 'asc')).toEqual(['RET-4', 'RET-2', 'RET-1', 'RET-3', 'Rate difference']);
    expect(purchaseReturnsPage(entries(), query({ page: 2, limit: 2 })).rows.map((row) => row.srNo)).toEqual([3, 4]);
  });
});

describe('supplier credit balance', () => {
  it('counts only recorded credit notes received and not reversed by the cutoff, less allocations in effect', () => {
    const held = creditHeldByDistributor(
      [
        credit({ allocations: [{ amount: 100, createdAt: new Date('2026-10-20T00:00:00Z'), reversedAt: new Date('2026-10-25T00:00:00Z') }] }),
        credit({ amount: 70, creditNoteNumber: null }),
        credit({ amount: 30, receivedAt: new Date('2026-11-10T00:00:00Z') }),
        credit({ amount: 40, reversedAt: new Date('2026-10-30T00:00:00Z') }),
        credit({ supplierGstin: medico.toLowerCase(), amount: 25 }),
      ],
      now,
    );
    expect(Object.fromEntries(held)).toEqual({ [linae]: 500, [medico]: 25 });
    expect(
      creditBalance(
        credit({ allocations: [{ amount: 100, createdAt: new Date('2026-10-20T00:00:00Z'), reversedAt: new Date('2026-10-25T00:00:00Z') }] }),
        new Date('2026-10-22T00:00:00Z'),
      ),
    ).toEqual({ amount: 500, applied: 100, available: 400 });
  });

  it('reads return reasons including the earlier return types and normalises credit note numbers', () => {
    expect(['near_expiry', 'DAMAGE', 'EXCESS', 'WRONG_ITEM', 'misc', ''].map(returnReasonOf)).toEqual([
      'NEAR_EXPIRY',
      'BREAKAGE',
      'EXCESS_SUPPLY',
      'WRONG_ITEM',
      null,
      null,
    ]);
    expect(creditNoteNumberOf('  cn/26   0042 ')).toBe('CN/26 0042');
  });
});
