import { statusVariant } from '@/lib/status-variants';

describe('domain status presentation', () => {
  it.each([
    ['appointment', 'COMPLETED', 'success'],
    ['appointment', 'NO_SHOW', 'danger'],
    ['visit', 'WAITING', 'warning'],
    ['invoice', 'CONFIRMED', 'info'],
    ['invoice', 'PAID', 'success'],
    ['invoice', 'FAILED', 'danger'],
    ['stock', 'LOW_STOCK', 'warning'],
    ['stock', 'OUT_OF_STOCK', 'danger'],
    ['stock', 'UNMATCHED', 'neutral'],
    ['prescription', 'PARTIAL', 'warning'],
    ['prescription', 'EXPIRED', 'danger'],
    ['room', 'AVAILABLE', 'success'],
    ['workflow', 'PARTIAL_STOCK_COMMITTED', 'warning'],
    ['workflow', 'RECONCILIATION_REQUIRED', 'danger'],
  ] as const)('shows %s / %s as %s', (domain, status, expected) => {
    expect(statusVariant(domain, status)).toBe(expected);
  });

  it('keeps identical labels scoped to their domain', () => {
    expect(statusVariant('priority', 'HIGH')).toBe('warning');
    expect(statusVariant('confidence', 'HIGH')).toBe('success');
    expect(statusVariant('invoice', 'DISPENSED')).toBe('info');
    expect(statusVariant('prescription', 'DISPENSED')).toBe('success');
    expect(statusVariant('stock', 'LOW')).toBe('warning');
    expect(statusVariant('priority', 'LOW')).toBe('neutral');
  });

  it('normalizes casing, spaces and hyphens', () => {
    expect(statusVariant('invoice', ' partially-paid ')).toBe('warning');
    expect(statusVariant('appointment', 'checked in')).toBe('warning');
    expect(statusVariant('confidence', 'cold-start')).toBe('neutral');
  });

  it.each([undefined, null, '', 'unrecognized', 'constructor'])('keeps unknown or missing status %s neutral', (status) => {
    expect(statusVariant('invoice', status)).toBe('neutral');
  });

  it('does not borrow a status meaning from a different domain', () => {
    expect(statusVariant('invoice', 'IN_STOCK')).toBe('neutral');
  });
});
