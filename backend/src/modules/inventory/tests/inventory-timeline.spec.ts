import { BadRequestException } from '@nestjs/common';
import { parseTimelineQuery, readInventoryTimeline } from '../inventory-timeline';

const at = (minute: number) => new Date(Date.UTC(2026, 10, 4, 10, minute));
const movement = (id: string, minute: number, fields: Record<string, any>) => ({
  id, branchId: 'branch', itemId: 'batch', createdAt: at(minute), type: 'ADJUSTMENT', quantity: 1, quantityDelta: null,
  unitPrice: 2, totalAmount: 2, reference: null, reason: null, notes: null, batchNumber: 'B1', supplier: null, customer: null,
  item: { id: 'batch', name: 'Cetirizine 10mg', unit: 'TABLETS', batchNumber: 'B1' },
  user: { id: 'u1', firstName: 'Asha', lastName: 'Rao' },
  ...fields,
});

const movements = [
  movement('purchase', 1, { type: 'PURCHASE', quantity: 100, quantityDelta: 100, reference: 'PINV-778-abcd1234' }),
  movement('rx', 2, { type: 'SALE', quantity: 10, quantityDelta: -10, reference: 'INV-PH-1',
    notes: JSON.stringify({ beforeStock: 100, afterStock: 90, quantityUnit: 'TABLETS' }) }),
  movement('walkin', 3, { type: 'SALE', quantity: 5, quantityDelta: -5, reference: 'INV-PH-2' }),
  movement('loss', 4, { type: 'DAMAGED', quantity: 2, quantityDelta: -2, reference: 'WF-LOSS-9',
    notes: JSON.stringify({ workflowDocumentId: 'doc-loss' }) }),
  movement('open', 5, { quantity: 40, quantityDelta: 40, reference: 'OPEN-imp1:7', notes: JSON.stringify({ importId: 'imp1', sourceRow: 7 }) }),
  movement('legacy', 6, { type: 'ADJUSTMENT', quantity: 3, reference: 'counted shelf' }),
  movement('approval', 7, { quantity: 4, quantityDelta: 4, reference: 'INVENTORY-APPROVAL-req1' }),
  movement('unknown-inv', 8, { type: 'SALE', quantity: 1, quantityDelta: -1, reference: 'INV-MISSING' }),
];

function prisma(rows = movements) {
  return {
    stockTransaction: { findMany: jest.fn(async () => rows) },
    inventoryWorkflowEffect: { findMany: async () => [] },
    inventoryWorkflowDocument: { findMany: async () => [{ id: 'doc-loss', kind: 'LOSS', reference: 'LOSS-9', status: 'POSTED' }] },
    pharmacyPurchaseInvoice: { findMany: async () => [
      { id: 'pi1', invoiceNumber: '778', stockCommitReference: 'PINV-778-abcd1234', status: 'POSTED', distributorName: 'Medline Distributors' },
    ] },
    pharmacyInvoice: { findMany: async () => [
      { id: 'si1', invoiceNumber: 'PH-1', status: 'PAID', prescriptionId: 'rx-1', billingName: 'Ravi Kumar' },
      { id: 'si2', invoiceNumber: 'PH-2', status: 'PAID', prescriptionId: null, billingName: 'Walk-in' },
    ] },
  };
}
const read = (q: Record<string, any> = {}, db = prisma()) =>
  readInventoryTimeline(db, 'branch', parseTimelineQuery({ from: '2026-11-01', to: '2026-11-05', ...q }));

describe('inventory timeline ledger', () => {
  it('names the method behind each stock change', async () => {
    const { rows } = await read();
    const byId = Object.fromEntries(rows.map(r => [r.id, r]));
    expect(byId.purchase.source).toMatchObject({ channel: 'PURCHASE_INVOICE', counterparty: 'Medline Distributors', document: { type: 'PURCHASE_INVOICE', id: 'pi1', number: '778' } });
    expect(byId.rx.source).toMatchObject({ channel: 'PRESCRIPTION', label: 'Prescription dispensed', counterparty: 'Ravi Kumar', document: { prescriptionId: 'rx-1' } });
    expect(byId.walkin.source.channel).toBe('PHARMACY_BILL');
    expect(byId.loss.source).toMatchObject({ channel: 'LOSS', document: { type: 'WORKFLOW', id: 'doc-loss', kind: 'LOSS' } });
    expect(byId.open.source).toMatchObject({ channel: 'OPENING_STOCK', document: { type: 'IMPORT', id: 'imp1', row: '7' } });
    expect(byId.approval.source).toMatchObject({ channel: 'APPROVED_EDIT', document: { type: 'APPROVAL', id: 'req1' } });
    expect(byId.legacy.source.channel).toBe('MANUAL');
    expect(byId['unknown-inv'].source).toMatchObject({ channel: 'PHARMACY_BILL', document: null });
  });

  it('records the signed change and recorded balance, newest first', async () => {
    const { rows } = await read();
    const rx = rows.find(r => r.id === 'rx')!;
    expect(rx).toMatchObject({ delta: -10, direction: 'OUT', balance: { before: 100, after: 90 }, unit: 'TABLETS', actor: { name: 'Asha Rao' } });
    expect(rows.find(r => r.id === 'legacy')).toMatchObject({ delta: null, direction: 'UNKNOWN', balance: null });
  });

  it('filters rows by method', async () => {
    const { rows, pagination } = await read({ channel: 'PRESCRIPTION,PURCHASE_INVOICE' });
    expect(rows.map(r => r.id).sort()).toEqual(['purchase', 'rx']);
    expect(pagination.total).toBe(2);
  });

  it('filters by direction and pages the result', async () => {
    const outs = await read({ direction: 'OUT', limit: '2', page: '2' });
    expect(outs.pagination).toEqual({ page: 2, limit: 2, total: 4, pages: 2 });
    expect(outs.rows.every(r => r.direction === 'OUT')).toBe(true);
  });

  it('scopes the read to the branch and an inclusive day range', async () => {
    const db = prisma();
    await read({ itemId: 'batch' }, db);
    const where = (db.stockTransaction.findMany.mock.calls[0] as any[])[0].where;
    expect(where).toMatchObject({ branchId: 'branch', itemId: 'batch' });
    expect(where.createdAt.gte.toISOString()).toBe('2026-10-31T18:30:00.000Z');
    expect(where.createdAt.lt.toISOString()).toBe('2026-11-05T18:30:00.000Z');
  });

  it('defaults to the 30 clinic days ending on the clinic date', () => {
    const lateEvening = new Date('2026-11-05T20:00:00.000Z');
    expect(parseTimelineQuery({}, lateEvening)).toMatchObject({ fromDay: '2026-10-08', toDay: '2026-11-06' });
    expect(parseTimelineQuery({ from: '2025-11-06', to: '2026-11-05' }).fromDay).toBe('2025-11-06');
  });

  it('rejects ranges and filters it cannot honour', () => {
    expect(() => parseTimelineQuery({ from: '2025-01-01', to: '2026-11-05' })).toThrow(BadRequestException);
    expect(() => parseTimelineQuery({ from: '2026-11-06', to: '2026-11-05' })).toThrow(BadRequestException);
    expect(() => parseTimelineQuery({ from: '05/11/2026' })).toThrow(BadRequestException);
    expect(() => parseTimelineQuery({ channel: 'SOMETHING' })).toThrow(BadRequestException);
    expect(() => parseTimelineQuery({ direction: 'SIDEWAYS' })).toThrow(BadRequestException);
  });

  it('reports truncation when the range exceeds the scan limit', async () => {
    const many = Array.from({ length: 10001 }, (_, i) => movement(`m${i}`, 0, { quantityDelta: 1, reference: 'manual' }));
    const result = await read({}, prisma(many));
    expect(result.truncated).toBe(true);
    expect(result.pagination.total).toBe(10000);
  });
});
