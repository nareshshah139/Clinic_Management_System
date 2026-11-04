import { previewPurchaseTerms, applyPurchaseTerms, undoPurchaseTerms } from '@/lib/purchase-invoice-batch';

const rows = [
  { localId: 'a', productName: 'Cream', discountPercent: '0', specialDiscountPercent: '5', cgstPercent: '9', sgstPercent: '9', igstPercent: '0' },
  { localId: 'b', productName: 'Lotion', discountPercent: '10', specialDiscountPercent: '0', cgstPercent: '6', sgstPercent: '6', igstPercent: '0' },
];
it('previews and changes only selected stable identities, clearing split GST when applying IGST', () => {
  const preview = previewPurchaseTerms(rows, ['a'], { kind: 'gst', mode: 'integrated', rate: '18' }, 'draft-1');
  expect(preview.patches.map(({ field, before, after }) => ({ field, before, after }))).toEqual([
    { field: 'cgstPercent', before: '9', after: '0' }, { field: 'sgstPercent', before: '9', after: '0' }, { field: 'igstPercent', before: '0', after: '18' },
  ]);
  expect(applyPurchaseTerms(rows, preview, 'draft-1')).toEqual([{ ...rows[0], cgstPercent: '0', sgstPercent: '0', igstPercent: '18' }, rows[1]]);
  expect(rows[0].cgstPercent).toBe('9');
});
it.each(['', 'NaN', '-1', '101'])('rejects invalid shared percentage %s', rate => {
  expect(() => previewPurchaseTerms(rows, ['a'], { kind: 'discount', rate }, 'draft')).toThrow('Enter a percentage from 0 to 100.');
});
it('rejects a combined discount above 100 and deleted selections', () => {
  expect(() => previewPurchaseTerms(rows, ['a'], { kind: 'discount', rate: '96' }, 'draft')).toThrow('Cream: combined discounts cannot exceed 100%.');
  expect(() => previewPurchaseTerms(rows, ['gone'], { kind: 'discount', rate: '10' }, 'draft')).toThrow('Select current invoice rows.');
});
it('invalidates previews after another edit, row deletion or invoice change', () => {
  const preview = previewPurchaseTerms(rows, ['a'], { kind: 'discount', rate: '10' }, 'draft');
  for (const [current, basis] of [[rows, 'other'], [rows.slice(1), 'draft'], [[{ ...rows[0], discountPercent: '5' }, rows[1]], 'draft']] as const) {
    expect(() => applyPurchaseTerms(current, preview, basis)).toThrow('The invoice changed. Preview the selected rows again.');
  }
});
it('undo keeps later corrections and unrelated fields while restoring unchanged applied cells', () => {
  const preview = previewPurchaseTerms(rows, ['a', 'b'], { kind: 'discount', rate: '20' }, 'draft');
  const applied = applyPurchaseTerms(rows, preview, 'draft');
  const result = undoPurchaseTerms([{ ...applied[0], discountPercent: '25' }, { ...applied[1], productName: 'Corrected lotion' }], preview);
  expect(result).toEqual({ rows: [{ ...rows[0], discountPercent: '25' }, { ...rows[1], productName: 'Corrected lotion' }], reverted: 1, kept: 1 });
});
it('rejects all invalid resulting percentages and mixed GST, while a GST replacement can repair mixed tax', () => {
  const mixed = [{ ...rows[0], igstPercent: '18' }];
  expect(() => previewPurchaseTerms(mixed, ['a'], { kind: 'discount', rate: '10' }, 'draft')).toThrow('Cream: use either IGST or CGST and SGST, not both.');
  expect(() => previewPurchaseTerms([{ ...rows[0], discountPercent: 'nonsense' }], ['a'], { kind: 'gst', mode: 'split', rate: '18' }, 'draft')).toThrow('Cream: discountPercent must be a percentage from 0 to 100.');
  expect(() => previewPurchaseTerms([{ ...rows[0], specialDiscountPercent: '-1' }], ['a'], { kind: 'gst', mode: 'split', rate: '18' }, 'draft')).toThrow('Cream: specialDiscountPercent must be a percentage from 0 to 100.');
  const repair = previewPurchaseTerms(mixed, ['a'], { kind: 'gst', mode: 'integrated', rate: '18' }, 'draft');
  expect(applyPurchaseTerms(mixed, repair, 'draft')).toEqual([{ ...rows[0], cgstPercent: '0', sgstPercent: '0', igstPercent: '18' }]);
});
