import { describePreviewTarget, importStage, validateImportSummary } from './inventory-imports';

const counts = { totalRows: 2, created: 0, updated: 0, skipped: 2, drugsCreated: 0, stockAdjusted: 0, errors: [] };
const approval = (status: string) => ({ status, requestedBy: null, reviewedBy: null, reviewedAt: null, note: null });

describe('opening import summaries', () => {
  it('accepts the pending-approval answer and places it in the awaiting stage', () => {
    const pending = validateImportSummary({ status: 'PENDING_APPROVAL', importId: 'imp-1', ...counts, approval: approval('PENDING') });
    expect(importStage(pending)).toBe('awaiting-approval');
  });

  it('maps every approval to the stage the import screen shows', () => {
    expect(['NOT_REQUIRED', 'APPROVED', 'PENDING', 'REJECTED'].map(status => importStage({ ...counts, approval: approval(status) } as any)))
      .toEqual(['results', 'results', 'awaiting-approval', 'rejected']);
    expect(importStage(counts)).toBe('results');
  });

  it('refuses summaries whose counts or approval do not add up', () => {
    expect(() => validateImportSummary({ ...counts, skipped: 1 })).toThrow('The server did not confirm the import outcome.');
    expect(() => validateImportSummary({ ...counts, approval: approval('MAYBE') })).toThrow('The server did not confirm the import outcome.');
    expect(() => validateImportSummary({ status: 'PENDING_APPROVAL', ...counts, approval: approval('APPROVED') })).toThrow('The server did not confirm the import outcome.');
    expect(() => validateImportSummary({ ...counts, importId: 'other' }, 'imp-1')).toThrow('The server did not confirm the import outcome.');
  });

  it('describes what each previewed row would do to stock', () => {
    expect([
      describePreviewTarget({ sourceRow: 2, batch: 'NEW' }),
      describePreviewTarget({ sourceRow: 3, batch: 'EXISTING', existingStock: 12 }),
      describePreviewTarget({ sourceRow: 4, error: 'Product name is required' }),
    ]).toEqual(['New batch', 'Existing batch (12 in stock)', 'Not importable']);
  });
});
