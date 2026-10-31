import { assessCatalogue, catalogueFingerprint, sameCatalogueRequest } from '@/lib/purchase-invoice-catalogue';

const lines = [{ localId: 'line-a', productName: 'Cosglo New Cream', manufacturer: '', packSize: '30 Gm', packUnitType: 'Tube' }];
const product = { id: 'cosglo', name: 'Cosglo New Cream', packSizeLabel: '30 Gm' };
it('shows each exact missing field independently of the candidate ranking', () => {
  expect(assessCatalogue(lines, { matches: [{ lineIndex: 0, candidates: [], catalogueResolution: { state: 'incomplete', product, missingFields: ['composition1', 'category', 'dosageForm', 'strength'] } }] })).toEqual([
    { localId: 'line-a', lineIndex: 0, name: 'Cosglo New Cream', resolution: { state: 'incomplete', product, missingFields: ['composition1', 'category', 'dosageForm', 'strength'] } },
  ]);
});
it.each([undefined, {}, { matches: [] }, { matches: [{ lineIndex: 0, candidates: [{ drug: product }], matchLabel: 'Same product' }] }, { matches: [{ lineIndex: 0, catalogueResolution: { state: 'ready' } }] }, { matches: [{ lineIndex: 0, catalogueResolution: { state: 'incomplete', product, missingFields: ['untrusted-selector'] } }] }])('keeps absent or malformed exact checks unchecked (%p)', response => {
  expect(assessCatalogue(lines, response)).toEqual([{ localId: 'line-a', lineIndex: 0, name: 'Cosglo New Cream', resolution: { state: 'unchecked' } }]);
});
it('keeps duplicate response rows unchecked and provides an unchecked row for omitted lines', () => {
  const row = { lineIndex: 0, catalogueResolution: { state: 'ready', product } };
  expect(assessCatalogue([...lines, { ...lines[0], localId: 'line-b' }], { matches: [row, row] }).map(row => row.resolution)).toEqual([{ state: 'unchecked' }, { state: 'unchecked' }]);
});
it('rejects stale generations, scopes, invoices, line identities and request sequences', () => {
  const current = { generation: 2, scope: 'branch/user', invoiceId: 'invoice-a', fingerprint: catalogueFingerprint(lines), sequence: 3 };
  expect(sameCatalogueRequest(current, { ...current })).toBe(true);
  for (const patch of [{ generation: 1 }, { scope: 'other-user' }, { invoiceId: 'invoice-b' }, { sequence: 2 }, { fingerprint: catalogueFingerprint([{ ...lines[0], packSize: '50 Gm' }]) }]) expect(sameCatalogueRequest(current, { ...current, ...patch })).toBe(false);
});
