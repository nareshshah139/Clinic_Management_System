import { batchRowClass, batchState, fmtStockExpiry, stockPageQuery } from '@/components/inventory/stock-batch-view';
const now = new Date('2026-09-16T10:00:00Z');
const item = { currentStock: 2, heldStock: 0, status: 'ACTIVE', expiryDate: '2028-05-31T23:59:59.999Z' };
it('shows all batches by default and preserves an explicit view', () => {
  expect(stockPageQuery({ search: 'cream' })).toEqual({ search: 'cream', batchView: 'ALL' });
  expect(stockPageQuery({ stock: 'ZERO' }).batchView).toBe('ALL');
  expect(stockPageQuery({ batchView: 'EMPTY' }).batchView).toBe('EMPTY');
});
it('distinguishes depleted balances from expired, held and unverified stock without choosing by recency', () => {
  expect(batchState(item, now)).toBe('Current / on hand');
  expect(batchState({ ...item, currentStock: 0 }, now)).toBe('Previous / depleted');
  expect(batchState({ ...item, heldStock: 2 }, now)).toBe('Held, on hand');
  expect(batchState({ ...item, expiryDate: '2026-09-15T23:59:59.999Z' }, now)).toBe('Expired, on hand');
  expect(batchState({ ...item, expiryDate: '2026-09-16T00:00:00Z' }, now)).toBe('Current / on hand');
  expect(batchState({ ...item, expiryDate: null }, now)).toBe('On hand, expiry unverified');
  expect(batchRowClass({ ...item, currentStock: 0 }, now)).toContain('bg-muted');
  expect(batchRowClass({ ...item, status: 'INACTIVE' }, now)).toContain('bg-amber');
});
it('formats month-end expiry as the stored UTC calendar date, including in India', () => {
  expect(fmtStockExpiry('2027-05-31T23:59:59.999Z')).toBe('31/5/2027');
  expect(fmtStockExpiry('bad')).toBe('Unverified');
  expect(fmtStockExpiry(null)).toBe('Unverified');
});
