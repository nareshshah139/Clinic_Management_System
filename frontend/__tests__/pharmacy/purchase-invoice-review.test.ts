import { purchaseInvoiceStatusLabel, purchaseReviewIssue } from '@/lib/purchase-invoice-review';

const confidence = 'AUTO: Line 1: OCR confidence must be at least 98% for automatic stock intake; review this line manually.';

describe('purchase failure explanations', () => {
  it.each([
    [[confidence], 0, 'Needs manual review'],
    [[confidence], 1, 'Needs corrections'],
    [[confidence, 'AUTO: Line 1: product master is incomplete for Moisturex; missing composition1, strength'], 0, 'Needs corrections'],
    [['AUTO: Header net payable mismatch: taxable+GST+TCS+rounding is 120, supplied net payable is 112'], 0, 'Check invoice totals'],
    [['This historical invoice predates the stock snapshot.'], 1, 'Historical stock check'],
    [[], 0, 'Needs review'],
    [['Unexpected validation issue'], 0, 'Needs corrections'],
  ])('labels saved blockers without asserting success: %j', (reconciliationIssues, unresolvedOcrFlags, expected) => {
    expect(purchaseInvoiceStatusLabel({ status: 'RECONCILIATION_FAILED', reconciliationIssues: reconciliationIssues as string[], unresolvedOcrFlags: unresolvedOcrFlags as number })).toBe(expected);
  });

  it('keeps a supplier identity mismatch distinct from a missing directory match', () => {
    const issue = purchaseReviewIssue('AUTO: Supplier GSTIN does not match the saved supplier (36AAYCV6140M1ZW). Check the original and select the correct saved supplier.');
    expect(issue).toMatchObject({ category: 'supplier', target: 'distributor-gstin', key: 'header:supplier-gstin-mismatch' });
    expect(issue.help).toContain('36AAYCV6140M1ZW');
    expect(issue.help).not.toContain('Manual review is also available');
  });

  it('never lets old blockers override a posted outcome or imply another stock receipt', () => {
    expect(purchaseInvoiceStatusLabel({ status: 'STOCK_COMMITTED', reconciliationIssues: [confidence] })).toBe('Stock added');
    expect(purchaseInvoiceStatusLabel({ status: 'STOCK_COMMITTED', workflowReceiptId: 'receipt' })).toBe('Invoice posted');
  });
});
