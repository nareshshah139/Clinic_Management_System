import { canonicalPurchasePack, verifyPurchaseRead } from '../purchase-invoice-identity';
import { PharmacyPurchaseInvoiceService } from '../pharmacy-purchase-invoice.service';

describe('Purchase identity and access', () => {
  it('blocks a second read that disagrees on GSTIN or batch without silently selecting a value', () => {
    const item = { batchNumber: 'AT-240424', expiryMonth: 3, expiryYear: 2029, quantityPurchased: 10, freeQuantity: 0, mrp: 101.33, purchaseRate: 77.21 };
    const first = { distributorGstin:'36AAICV6118K1ZV', invoiceNumber:'SB-26-110614', invoiceDate:'2026-08-12', netPayable:1698, items:[item] };
    const checked = verifyPurchaseRead(first, { ...first, distributorGstin:'36AAICV6118K1ZY', complete:true, items:[{ ...item, batchNumber:'AT-240426' }] });
    expect(checked.distributorGstin).toBe(first.distributorGstin);
    expect(checked.ocrFlags).toContain('independent_read_disagrees_distributorGstin');
    expect(checked.items[0].ocrFlags).toContain('independent_read_disagrees_batchNumber');
  });

  it('requires a complete page set and explicit quantities in the independent read', () => {
    const checked = verifyPurchaseRead({ items:[{freeQuantity:0}], ocrFlags:[] }, { items:[{}], complete:false });
    expect(checked.ocrFlags).toContain('document_completeness_unconfirmed');
    expect(checked.items[0].ocrFlags).toContain('independent_read_disagrees_freeQuantity');
  });

  it('normalizes equivalent pack labels while preserving volume versus weight', () => {
    expect(canonicalPurchasePack('30','ML')).toBe(canonicalPurchasePack('30 ml'));
    expect(canonicalPurchasePack('50GM')).toBe(canonicalPurchasePack('50g'));
    expect(canonicalPurchasePack("10'S")).toBe(canonicalPurchasePack('10 TABLETS'));
    expect(canonicalPurchasePack('30ML')).not.toBe(canonicalPurchasePack('30G'));
    expect(canonicalPurchasePack('10X10')).not.toBe(canonicalPurchasePack("10'S"));
  });

  it('uses role defaults and user permissions together for UI capabilities', async () => {
    const prisma = { user:{findUnique:async()=>({role:'RECEPTION',permissions:'["inventory:transaction:create"]'})}, role:{findFirst:async()=>({permissions:'["inventory:po:create","inventory:po:read","inventory:po:update"]'})} };
    const service = new PharmacyPurchaseInvoiceService(prisma as any);
    expect(await service.capabilities({id:'test',role:'RECEPTION'})).toEqual({read:true,create:true,review:true,commit:true,automate:true});
    prisma.user.findUnique = async()=>({role:'RECEPTION',permissions:'[]'});
    expect(await service.capabilities({id:'test',role:'RECEPTION'})).toMatchObject({create:true,commit:false,automate:false});
  });
});
