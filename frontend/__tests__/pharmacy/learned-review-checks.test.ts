import { confirmPurchaseChecks, pendingPurchaseOcrFlags } from '@/components/pharmacy/PurchaseFieldReview';
import { purchaseCheckStops, purchaseReviewIssue } from '@/lib/purchase-invoice-review';

describe('learned correction checks', () => {
  it.each([
    ['learned_product_needs_confirmation', 0, { field: 'productName', target: 'product', key: '0:productName:learned', message: 'Line 1: Check the learned product match.' }],
    ['Line 3: learned_manufacturer_needs_confirmation', undefined, { field: 'manufacturer', target: 'manufacturer', key: '2:manufacturer:learned', message: 'Line 3: Check the learned manufacturer match.' }],
    ['learned_distributor_needs_confirmation', undefined, { field: 'distributorName', target: 'distributor-name', key: 'header:distributorName:learned', message: 'Check the learned supplier match.' }],
  ])('words %s plainly and points at the corrected field', (flag, lineIndex, expected) => {
    expect(purchaseReviewIssue(flag, lineIndex)).toMatchObject(expected);
  });

  it('confirms a learned product flag once the product name is present and keeps it pending when blank', () => {
    expect(confirmPurchaseChecks(['learned_product_needs_confirmation'], { productName: 'Dolo 650mg Tablet' }, {}, 0).flags).toEqual([]);
    expect(confirmPurchaseChecks(['learned_product_needs_confirmation'], { productName: '  ' }, {}, 0).flags).toEqual(['learned_product_needs_confirmation']);
  });

  it('confirms the learned supplier flag only against the current supplier name and GSTIN', () => {
    const values = { distributorName: 'Apex Pharma', distributorGstin: '36ABCDE1234F1Z5' };
    const review = confirmPurchaseChecks(['learned_distributor_needs_confirmation'], values);
    expect(review.flags).toEqual([]);
    expect(pendingPurchaseOcrFlags([], values, review.checked)).toEqual([]);
    expect(pendingPurchaseOcrFlags([], { ...values, distributorName: 'Apex Pharmaceuticals' }, review.checked)).toEqual(['learned_distributor_needs_confirmation']);
  });

  it('lists a learned flag as its own check stop beside the line it belongs to', () => {
    const stops = purchaseCheckStops([], [{ localId: 'a', flags: ['learned_product_needs_confirmation'] }], []);
    expect(stops.map(stop => [stop.id, stop.issue.label])).toEqual([['a:productName', 'learned product match']]);
  });
});
