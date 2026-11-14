import { statusLabel, statusVariant } from '@/lib/status-variants';

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
    ['dispense', 'PARTIAL', 'warning'],
    ['dispense', 'EXPIRED', 'danger'],
    ['dispense', 'READY_TO_BILL', 'highlight'],
    ['appointment', 'IN_PROGRESS', 'highlight'],
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
    expect(statusVariant('dispense', 'DISPENSED')).toBe('success');
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

  it.each([
    ['appointment', 'SCHEDULED', 'Scheduled'],
    ['appointment', 'IN_PROGRESS', 'In consultation'],
    ['appointment', 'no-show', 'No-show'],
    ['visit', 'IN_PROGRESS', 'In progress'],
    ['invoice', 'PARTIALLY_PAID', 'Partly paid'],
    ['dispense', 'READY_TO_BILL', 'Ready to bill'],
    ['stock', 'LOW_STOCK', 'Low stock'],
  ] as const)('labels %s / %s as %s', (domain, status, expected) => {
    expect(statusLabel(domain, status)).toBe(expected);
  });

  it('turns an unknown status into words instead of showing the raw enum', () => {
    expect(statusLabel('workflow', 'AWAITING_SUPPLIER_CREDIT')).toBe('Awaiting supplier credit');
    expect(statusLabel('invoice', null)).toBe('Unknown');
  });
});
