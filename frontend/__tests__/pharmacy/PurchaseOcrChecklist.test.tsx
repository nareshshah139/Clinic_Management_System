import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { PurchaseOcrChecklist } from '@/components/pharmacy/PurchaseOcrChecklist';
import { confirmPurchaseChecks, pendingPurchaseOcrFlags } from '@/components/pharmacy/PurchaseFieldReview';
import { uniquePurchaseReviewIssues, groupPurchaseOcrFlags } from '@/lib/purchase-invoice-review';

describe('Purchase OCR review controls', () => {
  it('combines old AUTO/OCR duplicates and missing-field variants into one issue per line', () => {
    const issues = uniquePurchaseReviewIssues([
      'OCR: independent_read_disagrees_distributorGstin', 'AUTO: OCR: independent_read_disagrees_distributorGstin',
      'AUTO: Line 2: packUnitType is required before review', 'AUTO: Line 2: missing_packUnitType',
      'AUTO: Line 1: missing_manufacturer',
    ]);
    expect(issues).toHaveLength(2);
    expect(issues.map(issue => issue.message)).toEqual(['Check supplier GSTIN.', 'Line 2: Stock unit is missing.']);
  });

  it('never groups checks belonging to different invoice rows',()=>{
    expect(groupPurchaseOcrFlags(['Line 1: missing_packUnitType','Line 2: missing_packUnitType'])).toHaveLength(2);
  });

  it('groups duplicate uncertainties without a separate acknowledgement button', () => {
    render(<PurchaseOcrChecklist flags={['missing_packUnitType', 'uncertain_packUnitType']} lineIndex={0} values={{ packUnitType: 'Tube' }} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /^Confirm / })).not.toBeInTheDocument();
    expect(confirmPurchaseChecks(['missing_packUnitType', 'uncertain_packUnitType'], { packUnitType: 'Tube' }).flags).toEqual([]);
  });

  it('keeps missing values unresolved and provides a keyboard correction target', () => {
    const values = { packUnitType: '' };
    render(<PurchaseOcrChecklist flags={['missing_packUnitType']} lineIndex={1} lineId="line-2" values={values} />);
    expect(screen.getByRole('listitem')).toHaveAttribute('data-review-state', 'error');
    expect(screen.getByRole('link', { name: 'Edit line 2 stock unit' })).toHaveAttribute('href', '#line-2-unit');
    expect(confirmPurchaseChecks(['missing_packUnitType'], values).flags).toEqual(['missing_packUnitType']);
  });

  it('retires missing manufacturer checks while preserving a disagreement for final review', () => {
    render(<PurchaseOcrChecklist flags={['missing_manufacturer', 'manufacturer is required before review', 'independent_read_disagrees_manufacturer']} values={{ manufacturer: '' }} />);
    expect(screen.queryByText('Manufacturer is missing.')).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(confirmPurchaseChecks(['independent_read_disagrees_manufacturer'], { manufacturer: '' }).flags).toEqual([]);
  });

  it('retains invalid GSTIN and credit terms without a due date', () => {
    const flags = ['independent_read_disagrees_distributorGstin', 'uncertain_bill_type'];
    const values = { distributorGstin: 'UNREADABLE', billType: 'CREDIT', dueDate: '' };
    render(<PurchaseOcrChecklist flags={flags} values={values} />);
    expect(screen.getAllByRole('listitem').map(item => item.dataset.reviewState)).toEqual(['error', 'error']);
    expect(confirmPurchaseChecks(flags, values).flags).toEqual(flags);
  });

  it.each(['missing_pages', 'pdf_truncated_to_5_pages'])('retains upload-only %s checks', flag => {
    render(<PurchaseOcrChecklist flags={[flag]} values={{}} />);
    expect(screen.getByRole('link', { name: 'Upload pages for complete invoice' })).toHaveAttribute('href', '#purchase-invoice-upload');
    expect(confirmPurchaseChecks([flag], {}).flags).toEqual([flag]);
  });

  it('never silently accepts an unknown check or a catalogue mismatch', () => {
    expect(confirmPurchaseChecks(['new_unknown_server_obligation', 'Confirm the product master record'], {}).flags).toEqual(['new_unknown_server_obligation', 'Confirm the product master record']);
  });
});

it('an explicit correction verifies only its field and invalidates changed dependencies', () => {
  const values = { batchNumber: 'B1', expiryMonth: '12', expiryYear: '2028' };
  const result = confirmPurchaseChecks(['uncertain_batchNumber', 'uncertain_expiry'], values, {}, 0, 'batchNumber');
  expect(result.flags).toEqual(['uncertain_expiry']);
  expect(pendingPurchaseOcrFlags(result.flags, { ...values, batchNumber: 'B2' }, result.checked, 0)).toEqual(['uncertain_expiry', 'uncertain_batchNumber']);
  const expiry = confirmPurchaseChecks(['uncertain_expiry'], values);
  expect(pendingPurchaseOcrFlags([], { ...values, expiryYear: '2029' }, expiry.checked)).toEqual(['uncertain_expiry']);
});

it.each([
  ['13', '2028'], ['0', '2028'], ['1.5', '2028'], ['', '2028'],
  ['12', ''], ['12', '2019'], ['12', '2101'], ['12', '2028.5'], ['NaN', '2028'],
])('rejects invalid expiry %s/%s before confirmation', (expiryMonth, expiryYear) => {
  const values = { expiryMonth, expiryYear };
  render(<PurchaseOcrChecklist flags={['uncertain_expiry']} values={values} />);
  expect(screen.getByRole('listitem')).toHaveAttribute('data-review-state', 'error');
  expect(confirmPurchaseChecks(['uncertain_expiry'], values).flags).toEqual(['uncertain_expiry']);
});

it.each([['1', '2020'], ['12', '2100']])('allows valid expiry boundary %s/%s to be checked', (expiryMonth, expiryYear) => {
  expect(confirmPurchaseChecks(['uncertain_expiry'], { expiryMonth, expiryYear }).flags).toEqual([]);
});

it('directs the wrong document to the correct invoice upload without confirming it', () => {
  render(<><PurchaseOcrChecklist flags={['not_a_purchase_invoice']} values={{}} /><input id="purchase-invoice-upload" aria-label="Invoice upload" /></>);
  const upload = screen.getByRole('link', { name: 'Upload correct supplier invoice' });
  fireEvent.click(upload);
  expect(screen.getByRole('textbox', { name: 'Invoice upload' })).toHaveFocus();
  expect(confirmPurchaseChecks(['not_a_purchase_invoice'], {}).flags).toEqual(['not_a_purchase_invoice']);
});
