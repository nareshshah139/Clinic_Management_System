import { classifyStock, draftLines, parseOptimizationRules, StockBatch, PurchaseSource } from '../stock-optimization';

const now = new Date('2026-11-10T06:30:00.000Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000);
const rules = { nonMovingDays: 90, minimumBatchValue: 1500 };

const SLV = { distributorGstin: '27AABCS1234F1Z5', distributorName: 'Shree Laxmi Vitality Pharma' };
const APX = { distributorGstin: '27AAACA5678B1ZQ', distributorName: 'Apex Medico Distributors' };

const bought = (lineId: string, age: number, extra: Partial<PurchaseSource> = {}): PurchaseSource => ({
  lineId, invoiceId: `bill-${lineId}`, invoiceNumber: `SLV/${lineId}`, invoiceDate: daysAgo(age), ...SLV, ptr: 100, gstRate: 12, unreturned: 1000, ...extra,
});

const batch = (id: string, extra: Partial<StockBatch> = {}): StockBatch => ({
  id, name: `Item ${id}`, batchNumber: `B-${id}`, expiryDate: new Date('2027-05-31T00:00:00.000Z'), unit: 'TUBES', available: 20,
  costPrice: 95, gstRate: 12, receivedAt: daysAgo(200), lastSaleAt: null, purchases: [bought(id, 200)], openReturn: null, ...extra,
});

const summary = (result: ReturnType<typeof classifyStock>) => ({
  slow: result.slow,
  returnable: result.returnable.map((g) => [g.gstin, g.value, g.belowMinimum, g.rows.map((r) => `${r.inventoryId}:${r.quantity}`)]),
  nonReturnable: result.nonReturnable.map((g) => [g.gstin, g.value, g.rows.map((r) => `${r.inventoryId}:${r.quantity}`)]),
});

describe('stock optimization classification', () => {
  it('flags only batches whose product has not sold for the non-moving days and that were received before them', () => {
    const result = classifyStock(
      [
        batch('idle', { lastSaleAt: daysAgo(91) }),
        batch('moving', { lastSaleAt: daysAgo(89) }),
        batch('never-sold'),
        batch('fresh', { receivedAt: daysAgo(1), purchases: [bought('fresh', 1)] }),
        batch('empty', { available: 0 }),
      ],
      rules,
      now,
    );
    expect(summary(result)).toEqual({
      slow: 2,
      returnable: [['27AABCS1234F1Z5', 4000, false, ['idle:20', 'never-sold:20']]],
      nonReturnable: [],
    });
    expect(result.scanned).toBe(4);
  });

  it('changes what is flagged when the non-moving days go from 90 to 60', () => {
    const batches = [batch('sold-75-days-ago', { lastSaleAt: daysAgo(75) }), batch('received-70-days-ago', { receivedAt: daysAgo(70) })];
    expect(summary(classifyStock(batches, rules, now)).returnable).toEqual([]);
    expect(summary(classifyStock(batches, { ...rules, nonMovingDays: 60 }, now)).returnable).toEqual([
      ['27AABCS1234F1Z5', 4000, false, ['received-70-days-ago:20', 'sold-75-days-ago:20']],
    ]);
  });

  it('returns a batch bought 364 days ago and keeps one bought 366 days ago, at its batch PTR', () => {
    const result = classifyStock(
      [batch('d364', { purchases: [bought('d364', 364)] }), batch('d366', { purchases: [bought('d366', 366)], costPrice: 95 })],
      rules,
      now,
    );
    expect(summary(result)).toEqual({
      slow: 2,
      returnable: [['27AABCS1234F1Z5', 2000, false, ['d364:20']]],
      nonReturnable: [['27AABCS1234F1Z5', 1900, ['d366:20']]],
    });
    expect(result.returnable[0].rows[0].source).toEqual({ lineId: 'd364', invoiceId: 'bill-d364', invoiceNumber: 'SLV/d364', invoiceDate: '2025-11-11' });
    expect(result.nonReturnable[0].rows[0].source).toBeNull();
  });

  it('flags a returnable distributor below the minimum batch value and offers it no draft lines', () => {
    const result = classifyStock(
      [
        batch('small', { available: 14, purchases: [bought('small', 200, { ...APX, ptr: 100 })] }),
        batch('big', { available: 15 }),
      ],
      rules,
      now,
    );
    expect(result.returnable.map((g) => [g.name, g.value, g.belowMinimum])).toEqual([
      ['Shree Laxmi Vitality Pharma', 1500, false],
      ['Apex Medico Distributors', 1400, true],
    ]);
    expect(draftLines(result.returnable[1])).toEqual([]);
    expect(draftLines(result.returnable[0]).map((line) => line.inventoryId)).toEqual(['big']);
  });

  it('values a group with mixed GST at PTR excluding tax and keeps each line its own GST on the draft', () => {
    const result = classifyStock(
      [
        batch('gst12', { available: 10, purchases: [bought('gst12', 100, { ptr: 80, gstRate: 12 })] }),
        batch('gst18', { available: 5, purchases: [bought('gst18', 120, { ptr: 250.5, gstRate: 18 })] }),
      ],
      rules,
      now,
    );
    expect(result.returnable[0].value).toBe(2052.5);
    expect(draftLines(result.returnable[0])).toEqual([
      { inventoryId: 'gst12', quantity: 10, unitPrice: 80, gstRate: 12, sourceLineId: 'gst12' },
      { inventoryId: 'gst18', quantity: 5, unitPrice: 250.5, gstRate: 18, sourceLineId: 'gst18' },
    ]);
  });

  it('splits a batch across in-window bills newest first and keeps what no bill can take', () => {
    const result = classifyStock(
      [
        batch('split', {
          available: 30,
          purchases: [bought('old-slv', 300, { unreturned: 12 }), bought('new-apx', 100, { ...APX, unreturned: 10, ptr: 90 }), bought('ancient', 500)],
        }),
      ],
      rules,
      now,
    );
    expect(summary(result)).toEqual({
      slow: 1,
      returnable: [
        ['27AABCS1234F1Z5', 1200, true, ['split:12']],
        ['27AAACA5678B1ZQ', 900, true, ['split:10']],
      ],
      nonReturnable: [['27AAACA5678B1ZQ', 760, ['split:8']]],
    });
  });

  it('keeps stock with no purchase on record as non-returnable and sorts rows by shelf life left', () => {
    const result = classifyStock(
      [
        batch('later', { purchases: [], expiryDate: new Date('2027-08-31T00:00:00Z') }),
        batch('expired', { purchases: [], expiryDate: new Date('2026-10-31T00:00:00Z') }),
        batch('soon', { purchases: [], expiryDate: new Date('2026-12-31T00:00:00Z') }),
        batch('undated', { purchases: [], expiryDate: null }),
      ],
      rules,
      now,
    );
    expect(result.nonReturnable.map((g) => [g.gstin, g.name, g.rows.map((r) => [r.inventoryId, r.shelfLifeDays, r.expiryDate])])).toEqual([
      ['', 'No purchase on record', [['expired', -10, '2026-10-31'], ['soon', 51, '2026-12-31'], ['later', 294, '2027-08-31'], ['undated', null, null]]],
    ]);
  });

  it('leaves rows already on an open return out of the next draft', () => {
    const result = classifyStock(
      [batch('drafted', { openReturn: { id: 'doc-1', reference: 'RET-1', status: 'DRAFT' } }), batch('free')],
      rules,
      now,
    );
    expect(draftLines(result.returnable[0])).toEqual([{ inventoryId: 'free', quantity: 20, unitPrice: 100, gstRate: 12, sourceLineId: 'free' }]);
  });

  it('reads the two rules and refuses values outside their range', () => {
    expect(parseOptimizationRules({ nonMovingDays: '60', minimumBatchValue: '2000.456' }, rules)).toEqual({ nonMovingDays: 60, minimumBatchValue: 2000.46 });
    expect(() => parseOptimizationRules({ nonMovingDays: 0 }, rules)).toThrow('Non-moving days must be a whole number from 1 to 730');
    expect(() => parseOptimizationRules({ minimumBatchValue: -1 }, rules)).toThrow('Minimum batch value must be an amount from ₹0 to ₹10,00,000');
  });
});
