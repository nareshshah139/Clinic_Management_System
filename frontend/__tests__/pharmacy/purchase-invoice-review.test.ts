import { purchaseInvoiceReviewTone } from '@/lib/purchase-invoice-review';
import { focusPurchaseField, purchaseCheckStops, purchaseInvoiceStatusLabel, purchaseReviewIssue } from '@/lib/purchase-invoice-review';

const confidence = 'AUTO: Line 1: OCR confidence must be at least 98% for automatic stock intake; review this line manually.';

describe('invoice check navigation', () => {
  it('deduplicates product validation wording against the current required product field', () => {
    const stops = purchaseCheckStops([], [{ localId: 'first', flags: [] }], [
      purchaseReviewIssue('Line 1: productName is required before review'),
      purchaseReviewIssue('Line 1: product is required'),
    ]);
    expect(stops.map(stop => [stop.id, stop.issue.target])).toEqual([['first:productName', 'product']]);
  });

  it('routes an expired batch to expiry while retaining the restriction on review and stock', () => {
    const message = 'Line 1: expired batches can be saved for correction but cannot be reviewed or committed';
    expect(purchaseReviewIssue(message)).toMatchObject({ field: 'expiryMonth', target: 'expiry-month', lineIndex: 0, message });
  });

  it('routes a due date relative to the invoice to the due date', () => {
    expect(purchaseReviewIssue('Due date cannot be before invoice date')).toMatchObject({ field: 'dueDate', target: 'due-date' });
  });

  it.each([
    'purchase and free quantities must be whole numbers',
    'quantities cannot be negative',
    'purchased plus free quantity must be greater than zero',
    'purchase rate and MRP cannot be negative',
    'schemeAmount must be a finite number',
  ])('keeps combined or unmapped amount validation at the amounts section: %s', body => {
    const issue = purchaseReviewIssue(`Line 1: ${body}`);
    expect(issue).toMatchObject({ target: 'purchase-line-items', category: 'totals', message: `Line 1: ${body}` });
    expect(issue.field).toBeUndefined();
  });

  it('orders current header and row checks and merges repeated field flags without approving them', () => {
    const rows = [
      { localId: 'first', flags: ['uncertain_batchNumber', 'missing_batchNumber', 'uncertain_hsnCode'] },
      { localId: 'second', flags: ['uncertain_expiry'] },
    ];
    const stops = purchaseCheckStops(['uncertain_distributorGstin'], rows, [purchaseReviewIssue('Line 1: batchNumber is required')]);
    expect(stops.map(stop => [stop.id, stop.issue.target])).toEqual([
      ['header:distributorGstin', 'distributor-gstin'], ['first:batchNumber', 'batch'],
      ['first:hsnCode', 'hsn'], ['second:expiryMonth', 'expiry-month'],
    ]);
    expect(rows[0].flags).toEqual(['uncertain_batchNumber', 'missing_batchNumber', 'uncertain_hsnCode']);
  });

  it('keeps a row identity after removal or reorder, including old ordinal text in a row flag', () => {
    const first = { localId: 'first', flags: ['uncertain_batchNumber'] };
    const second = { localId: 'second', flags: ['Line 2: uncertain_batchNumber'] };
    expect(purchaseCheckStops([], [first, second], []).map(stop => stop.id)).toEqual(['first:batchNumber', 'second:batchNumber']);
    expect(purchaseCheckStops([], [second], []).map(stop => [stop.id, stop.issue.lineIndex])).toEqual([['second:batchNumber', 0]]);
    expect(purchaseCheckStops([], [second, first], []).map(stop => [stop.id, stop.issue.lineIndex])).toEqual([['second:batchNumber', 0], ['first:batchNumber', 1]]);
    expect(purchaseCheckStops([], [], [purchaseReviewIssue('Line 3: missing_batchNumber')])).toEqual([]);
  });

  it('retains upload and explanation stops while an empty invoice has no navigation', () => {
    expect(purchaseCheckStops(['missing_pages', 'unexpected_document_note'], [], []).map(stop => [stop.id, stop.issue.target])).toEqual([
      ['header:pages', 'purchase-invoice-upload'], ['header:unexpected_document_note', undefined],
    ]);
    expect(purchaseCheckStops([], [{ localId: 'clear', flags: [] }], [])).toEqual([]);
  });

  it('opens nested details to focus a field and leaves current focus when its target is absent', () => {
    const container = document.createElement('div');
    container.innerHTML = '<details><summary>Commercial</summary><details><summary>Tax</summary><input id="nested-check" value="3004"></details></details>';
    document.body.append(container);
    focusPurchaseField('nested-check');
    expect(document.activeElement).toBe(container.querySelector('input'));
    expect([...container.querySelectorAll('details')].map(details => details.open)).toEqual([true, true]);
    focusPurchaseField('removed-check');
    expect(document.activeElement).toBe(container.querySelector('input'));
    expect(container.querySelector('input')?.value).toBe('3004');
    container.remove();
  });
});

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

it('distinguishes verified invoices from failed, unchecked and cancelled states', () => {
  expect(purchaseInvoiceReviewTone({ status: 'DRAFT' })).toBe('warning');
  expect(purchaseInvoiceReviewTone({ status: 'RECONCILIATION_FAILED', reconciliationIssues: ['Net payable total mismatch'] })).toBe('error');
  expect(purchaseInvoiceReviewTone({ status: 'RECONCILIATION_FAILED', reconciliationIssues: ['OCR confidence requires manual review'] })).toBe('warning');
  expect(purchaseInvoiceReviewTone({ status: 'REVIEWED' })).toBe('success');
  expect(purchaseInvoiceReviewTone({ status: 'STOCK_COMMITTED' })).toBe('success');
  expect(purchaseInvoiceReviewTone({ status: 'CANCELLED' })).toBe('neutral');
});

it('keeps a wrong document distinct from missing pages and names the correct replacement', () => {
  expect(purchaseReviewIssue('OCR: not_a_purchase_invoice')).toMatchObject({
    key: 'header:wrong-document', label: 'supplier invoice', requiresUpload: true,
    message: 'This document was not recognized as a supplier purchase invoice.',
    target: 'purchase-invoice-upload',
  });
  expect(purchaseReviewIssue('OCR: not_a_purchase_invoice').help).toContain('correct supplier invoice');
  expect(purchaseReviewIssue('OCR: not_a_purchase_invoice').help).toContain('Enter complete invoice manually');
  expect(purchaseReviewIssue('OCR: missing_pages').message).toBe('The complete invoice could not be verified.');
  expect(purchaseReviewIssue('OCR: missing_pages').help).toContain('every invoice page');
});
