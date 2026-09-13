import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { PurchaseOcrChecklist } from '@/components/pharmacy/PurchaseOcrChecklist';
import { uniquePurchaseReviewIssues } from '@/lib/purchase-invoice-review';

describe('Purchase OCR review controls', () => {
  it('combines old AUTO/OCR duplicates and missing-field variants into one issue per line', () => {
    const issues = uniquePurchaseReviewIssues([
      'OCR: independent_read_disagrees_distributorGstin', 'AUTO: OCR: independent_read_disagrees_distributorGstin',
      'AUTO: Line 2: manufacturer is required before review', 'AUTO: Line 2: missing_manufacturer',
      'AUTO: Line 1: missing_manufacturer',
    ]);
    expect(issues).toHaveLength(3);
    expect(issues.map(issue => issue.message)).toEqual(['Check supplier GSTIN.', 'Line 2: Manufacturer is missing.', 'Line 1: Manufacturer is missing.']);
  });

  it('requires the missing value and an explicit check before resolving a flag', () => {
    const onResolve = jest.fn();
    const props = { flags: ['missing_manufacturer'], lineIndex: 1, lineId: 'line-2', disabled: false, onResolve };
    const view = render(<PurchaseOcrChecklist {...props} values={{ manufacturer: '' }} />);
    expect(screen.getByRole('button', { name: 'Confirm line 2 manufacturer checked' })).toBeDisabled();
    view.rerender(<PurchaseOcrChecklist {...props} values={{ manufacturer: 'Verified manufacturer' }} />);
    expect(onResolve).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm line 2 manufacturer checked' }));
    expect(onResolve).toHaveBeenCalledWith('missing_manufacturer');
    expect(screen.getByRole('link', { name: 'Go to manufacturer' })).toHaveAttribute('href', '#line-2-manufacturer');
  });

  it('requires a valid GSTIN and credit due date before those checks can be confirmed', () => {
    render(<PurchaseOcrChecklist flags={['independent_read_disagrees_distributorGstin', 'uncertain_bill_type']}
      values={{ distributorGstin: 'UNREADABLE', billType: 'CREDIT', dueDate: '' }} disabled={false} onResolve={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Confirm supplier GSTIN checked' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Confirm bill type checked' })).toBeDisabled();
  });

  it('directs missing-page issues to a new upload instead of a confirmation that discards the issue', () => {
    render(<PurchaseOcrChecklist flags={['missing_pages']} values={{}} disabled={false} onResolve={jest.fn()} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to complete invoice' })).toHaveAttribute('href', '#purchase-invoice-upload');
  });

  it('keeps confirmation disabled when the draft is locked or the user cannot edit', () => {
    render(<PurchaseOcrChecklist flags={['missing_packUnitType']} values={{ packUnitType: 'Tube' }} disabled onResolve={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Confirm stock unit checked' })).toBeDisabled();
  });
});
