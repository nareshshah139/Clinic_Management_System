import { PharmacyPurchaseInvoiceService } from '../pharmacy-purchase-invoice.service';

const item: any = { productName: "ZITCARE FORT CAPSULE, 15's", manufacturer: 'Canixa', packSize: "15's", packUnitType: 'Strip', mrp: 107, purchaseRate: 81.52 };
const drug: any = { id: 'zitcare', name: 'Zitcare Forte', manufacturerName: 'Canixa', packSizeLabel: '15 Capsules', price: 107, type: 'allopathy', dosageForm: 'Capsule', strength: '', inventoryItems: [{ id: 'stock-1' }] };
const supplier = { distributorName: 'SLV Pharma', distributorGstin: '36ABCDE1234F1Z5' };
function setup(products = [drug]) {
  const events: any[] = [];
  const db: any = { $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn(async () => products.map(p => ({ id: p.id }))),
    drug: { findMany: jest.fn(async () => products), findFirst: jest.fn(async () => drug), update: jest.fn(async () => drug), create: jest.fn() },
    inventoryItem: { findMany: jest.fn(async () => []) },
    auditLog: { findMany: jest.fn(async () => [...events].reverse()), create: jest.fn(async ({ data }) => { events.push(data); return data; }) },
    $transaction: jest.fn(async cb => cb(db)) };
  return { db, service: new PharmacyPurchaseInvoiceService(db), events };
}
describe('CR-14 purchase matching', () => {
  it.each([item.productName, 'Zitcare Forte Capsule (loose capsules)', "zitcare fort cap. (15’s)"])('finds inventory Zitcare from %s', async productName => {
    const { service } = setup();
    const result = await service.suggestMasterMatches([{ ...item, productName }], 'branch-1');
    expect(result.matches[0].candidates[0]?.drug.id).toBe('zitcare');
    expect(result.matches[0].recommendedAction).not.toBe('CREATE_NEW');
  });
});

describe('CR-14 supplier memory and duplicate protection', () => {
  const confirm = (service: PharmacyPurchaseInvoiceService, overrides = {}) => service.confirmMasterRecord({ action: 'MATCH_EXISTING', drugId: drug.id, item, mismatchAcknowledged: true, ...supplier, ...overrides } as any, 'branch-1', 'reviewer');
  it('ranks clinic stock ahead of a closer catalogue spelling and offers five review choices', async () => {
    const products = [{ ...drug, id: 'catalog', name: 'Zitcare Fort', inventoryItems: [] }, drug,
      ...['Alpha', 'Beta', 'Gamma', 'Delta'].map(name => ({ ...drug, id: name, name, inventoryItems: [] }))];
    const { service, db } = setup(products);
    const [match] = (await service.suggestMasterMatches([item], 'branch-1')).matches;
    expect(match.candidates[0].drug.id).toBe('zitcare');
    expect(match.candidates.length + match.alternatives.length).toBe(5);
    expect(match.alternatives.every((choice: { confidence: string }) => choice.confidence === 'LOW')).toBe(true);
    expect(db.drug.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ branchId: 'branch-1', isActive: true, isDiscontinued: false }), select: expect.objectContaining({ inventoryItems: expect.objectContaining({ where: { branchId: 'branch-1', status: 'ACTIVE' } }) }) }));
  });
  it('keeps a same-brand pack conflict available for review and blocks new duplicates', async () => {
    const { service, db } = setup();
    const loose = { ...item, productName: 'Zitcare Forte Capsule (loose capsules)', packSize: '1 capsule; source pack 15 Capsules' };
    const [match] = (await service.suggestMasterMatches([loose], 'branch-1')).matches;
    expect(match).toMatchObject({ sameBrandExists: true, recommendedAction: 'REVIEW_MATCHES', candidates: [], alternatives: [expect.objectContaining({ drug: expect.objectContaining({ id: 'zitcare' }) })] });
    await expect(service.confirmMasterRecord({ action: 'CREATE_NEW', creationConfirmed: true, item: loose, catalog: { productKind: 'COSMETIC' } } as any, 'branch-1')).rejects.toMatchObject({ response: { code: 'PURCHASE_SAME_BRAND_EXISTS' } });
    expect(db.drug.create).not.toHaveBeenCalled();
  });
  it('requires creation confirmation at the API boundary', async () => {
    const { service, db } = setup([]);
    await expect(service.confirmMasterRecord({ action: 'CREATE_NEW', item, catalog: { productKind: 'COSMETIC' } } as any, 'branch-1')).rejects.toThrow('Confirm creation');
    expect(db.drug.create).not.toHaveBeenCalled();
  });
  it('remembers an audited SLV confirmation across service instances, refreshes, and uploads', async () => {
    const { service, db, events } = setup();
    await confirm(service);
    expect(events).toHaveLength(1);
    const nextService = new PharmacyPurchaseInvoiceService(db);
    const [match] = (await nextService.suggestMasterMatches([item], 'branch-1', supplier)).matches;
    expect(match).toMatchObject({ matchLabel: 'Remembered match', automaticMatch: { drug: { id: 'zitcare' }, linePatch: { productName: 'Zitcare Forte', mrp: 107, purchaseRate: 81.52 } } });
    const nextInvoice = { ...supplier, items: [{ ...item, quantityPurchased: 7, freeQuantity: 2 }] };
    await (nextService as any).enrichKnownProducts(nextInvoice, 'branch-1');
    expect(nextInvoice.items[0]).toMatchObject({ productName: 'Zitcare Forte', quantityPurchased: 7, freeQuantity: 2, mrp: 107, purchaseRate: 81.52 });
    expect(db.drug.create).not.toHaveBeenCalled();
    expect(db.drug.update).toHaveBeenCalledTimes(1);
    expect(db.auditLog.create).toHaveBeenCalledTimes(1);
  });
  it.each(['supplier', 'branch', 'pack', 'strength', 'kind', 'target', 'inactive'])('does not automatically apply memory after %s changes', async change => {
    const { service, db } = setup();
    await confirm(service);
    const next = { ...item };
    if (change === 'pack') next.packSize = "10's";
    if (change === 'strength') next.productName = 'Zitcare Fort 20mg Capsule';
    if (change === 'kind') next.productKind = 'COSMETIC';
    if (change === 'target') db.drug.findMany.mockResolvedValue([{ ...drug, strength: '20mg' }]);
    if (change === 'inactive') db.drug.findMany.mockResolvedValue([]);
    const result = await service.suggestMasterMatches([next], change === 'branch' ? 'branch-2' : 'branch-1', change === 'supplier' ? { ...supplier, distributorGstin: 'OTHER' } : supplier);
    expect(result.matches[0].automaticMatch).toBeUndefined();
  });
  it('does not learn a cancelled mismatch or a missing supplier identity', async () => {
    const { service, events } = setup();
    await expect(confirm(service, { mismatchAcknowledged: false })).rejects.toThrow('different products');
    expect(events).toHaveLength(0);
    await confirm(service, { distributorName: undefined, distributorGstin: undefined });
    expect((await service.suggestMasterMatches([item], 'branch-1', supplier)).matches[0].automaticMatch).toBeUndefined();
  });
  it('does not add loose dispensing annotations to the extracted invoice name', () => {
    const { service } = setup();
    const normalized = (service as any).normalizeExtractedPurchaseLine({ ...item, productName: 'ZITCARE FORT CAPSULE (loose capsules)' }, 1);
    expect(normalized.productName).toBe('ZITCARE FORT CAPSULE');
    expect(normalized.packSize).toBe("15's");
  });
  it('retains bare doses, strengths and release modifiers during name comparison', async () => {
    const { service } = setup([{ ...drug, name: 'Folitrax 10mg Tablet', strength: '10mg', dosageForm: 'Tablet', packSizeLabel: '5 Tablets' }]);
    const match = (await service.suggestMasterMatches([{ ...item, productName: 'Folitrax 5 Tab', packSize: '5 Tablets' }], 'branch-1')).matches[0];
    expect(match.candidates).toEqual([]);
    expect(match.alternatives[0].mismatches).toContain('Product strengths differ');
  });
  it('does not reuse a capsule confirmation for tablets when the catalog form is missing', async () => {
    const unknownForm = { ...drug, dosageForm: null };
    const { service, db } = setup([unknownForm]);
    db.drug.findFirst.mockResolvedValue(unknownForm);
    db.drug.update.mockResolvedValue(unknownForm);
    await confirm(service);
    const next = { ...item, productName: "ZITCARE FORT TABLET, 15's" };
    expect((await service.suggestMasterMatches([next], 'branch-1', supplier)).matches[0].automaticMatch).toBeUndefined();
  });

});
