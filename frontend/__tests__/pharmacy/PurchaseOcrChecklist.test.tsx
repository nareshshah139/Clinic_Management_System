import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { PurchaseOcrChecklist } from '@/components/pharmacy/PurchaseOcrChecklist';
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

  it('confirms duplicate reasons for the same field together', () => {
    const onResolveMany=jest.fn();const onResolve=jest.fn();
    const flags=['missing_packUnitType','uncertain_packUnitType'];
    render(<PurchaseOcrChecklist flags={flags} lineIndex={0} values={{packUnitType:'Tube'}} disabled={false} onResolve={onResolve} onResolveMany={onResolveMany}/>);
    expect(screen.getAllByRole('button', {name:/^Confirm /})).toHaveLength(1);
    fireEvent.click(screen.getByRole('button',{name:'Confirm line 1 stock unit checked'}));
    expect(onResolveMany).toHaveBeenCalledWith(flags);expect(onResolve).not.toHaveBeenCalled();
  });

  it('requires the missing value and an explicit check before resolving a flag', () => {
    const onResolve = jest.fn();
    const props = { flags: ['missing_packUnitType'], lineIndex: 1, lineId: 'line-2', disabled: false, onResolve };
    const view = render(<PurchaseOcrChecklist {...props} values={{ packUnitType: '' }} />);
    expect(screen.getByRole('button', { name: 'Confirm line 2 stock unit checked' })).toBeDisabled();
    view.rerender(<PurchaseOcrChecklist {...props} values={{ packUnitType: 'Tube' }} />);
    expect(onResolve).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm line 2 stock unit checked' }));
    expect(onResolve).toHaveBeenCalledWith('missing_packUnitType');
    expect(screen.getByRole('link', { name: 'Edit line 2 stock unit' })).toHaveAttribute('href', '#line-2-unit');
  });

  it('hides retired missing-manufacturer checks while retaining a reported manufacturer disagreement', () => {
    const onResolve = jest.fn();
    render(<PurchaseOcrChecklist flags={['missing_manufacturer', 'manufacturer is required before review', 'independent_read_disagrees_manufacturer']}
      values={{ manufacturer: '' }} disabled={false} onResolve={onResolve} />);
    expect(screen.queryByText('Manufacturer is missing.')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Confirm manufacturer checked' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm manufacturer checked' }));
    expect(onResolve).toHaveBeenCalledWith('independent_read_disagrees_manufacturer');
  });

  it('requires a valid GSTIN and credit due date before those checks can be confirmed', () => {
    render(<PurchaseOcrChecklist flags={['independent_read_disagrees_distributorGstin', 'uncertain_bill_type']}
      values={{ distributorGstin: 'UNREADABLE', billType: 'CREDIT', dueDate: '' }} disabled={false} onResolve={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Confirm supplier GSTIN checked' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Confirm bill type checked' })).toBeDisabled();
  });

  it('directs missing-page issues to a new upload instead of a confirmation that discards the issue', () => {
    render(<PurchaseOcrChecklist flags={['missing_pages']} values={{}} disabled={false} onResolve={jest.fn()} />);
    expect(screen.queryByRole('button', {name:/^Confirm /})).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Upload pages for complete invoice' })).toHaveAttribute('href', '#purchase-invoice-upload');
  });

  it('keeps confirmation disabled when the draft is locked or the user cannot edit', () => {
    render(<PurchaseOcrChecklist flags={['missing_packUnitType']} values={{ packUnitType: 'Tube' }} disabled onResolve={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Confirm stock unit checked' })).toBeDisabled();
  });
});

it('moves from correction to checking to checked, then requires another check after editing', () => {
  const props = { flags: ['missing_batchNumber'], lineIndex: 0, lineId: 'line', disabled: false, onResolve: jest.fn() };
  const view = render(<PurchaseOcrChecklist {...props} values={{ batchNumber: '' }} />);
  expect(screen.getByRole('listitem')).toHaveAttribute('data-review-state', 'error');
  view.rerender(<PurchaseOcrChecklist {...props} values={{ batchNumber: 'B1' }} />);
  expect(screen.getByRole('listitem')).toHaveAttribute('data-review-state', 'warning');
  fireEvent.click(screen.getByRole('button', { name: 'Confirm line 1 batch checked' }));
  view.rerender(<PurchaseOcrChecklist {...props} flags={[]} values={{ batchNumber: 'B1' }} />);
  expect(screen.getByRole('listitem')).toHaveAttribute('data-review-state', 'success');
  expect(screen.getByText('Checked')).toBeVisible();
  view.rerender(<PurchaseOcrChecklist {...props} flags={[]} values={{ batchNumber: 'B2' }} />);
  expect(screen.getByRole('listitem')).toHaveAttribute('data-review-state', 'warning');
  expect(screen.getByText('Changed — check again')).toBeVisible();
  expect(screen.queryByText('Checked')).not.toBeInTheDocument();
});

it('does not infer a checked state from empty flags and invalidates dependent expiry values', () => {
  const props = { flags: [], disabled: false, onResolve: jest.fn() };
  const view = render(<PurchaseOcrChecklist {...props} values={{ expiryMonth: '12', expiryYear: '2028' }} />);
  expect(screen.queryByText('Checked')).not.toBeInTheDocument();
  view.rerender(<PurchaseOcrChecklist {...props} flags={['uncertain_expiry']} values={{ expiryMonth: '12', expiryYear: '2028' }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Confirm expiry checked' }));
  view.rerender(<PurchaseOcrChecklist {...props} values={{ expiryMonth: '12', expiryYear: '2028' }} />);
  expect(screen.getByText('Checked')).toBeVisible();
  view.rerender(<PurchaseOcrChecklist {...props} values={{ expiryMonth: '12', expiryYear: '2029' }} />);
  expect(screen.getByText('Changed — check again')).toBeVisible();
});
