import { canonicalPurchasePack, verifyPurchaseRead } from '../purchase-invoice-identity';
import { PharmacyPurchaseInvoiceService } from '../pharmacy-purchase-invoice.service';

describe('Purchase identity and access', () => {
  const twentyRows = () => Array.from({ length: 20 }, (_, index) => ({
    productName: `Cream ${index % 16}`, packSize: '50GM', hsnCode: '33049990',
    batchNumber: `B00${index}`, expiryMonth: 12, expiryYear: 2028,
    quantityPurchased: index + 1, freeQuantity: index % 3, mrp: 150, purchaseRate: 100,
  }));
  const invoice = (items: ReturnType<typeof twentyRows>) => ({
    distributorGstin: '36ABCDE1234F1Z5', invoiceNumber: 'SYN-20', invoiceDate: '2026-09-13', netPayable: 11111.75, items,
  });

  it('preserves all 20 batch rows, including repeated products, when independent reads agree', () => {
    const first = invoice(twentyRows());
    const checked = verifyPurchaseRead(first, { ...first, complete: true,
      items: first.items.map(row => ({ ...row, packSize: '50 g' })) });
    expect(checked.ocrFlags).toEqual([]);
    expect(checked.items).toHaveLength(20);
    expect(checked.items.map((row: any) => row.batchNumber)).toEqual(first.items.map(row => row.batchNumber));
    expect(checked.items.every((row: any) => row.ocrFlags.length === 0)).toBe(true);
  });

  it('blocks a dropped final row without truncating the first 20-row read', () => {
    const first = invoice(twentyRows());
    const checked = verifyPurchaseRead(first, { ...first, complete: true, items: first.items.slice(0, 19) });
    expect(checked.items).toHaveLength(20);
    expect(checked.ocrFlags).toContain('independent_read_disagrees_row_count');
    expect(checked.items[19].ocrFlags).toContain('independent_read_disagrees_batchNumber');
  });

  it.each(['productName', 'packSize', 'hsnCode'])('blocks a changed %s even when batch and all numbers agree', field => {
    const first = invoice(twentyRows());
    const second = first.items.map(row => ({ ...row }));
    (second[19] as any)[field] = field === 'packSize' ? '50ML' : 'DIFFERENT';
    const checked = verifyPurchaseRead(first, { ...first, complete: true, items: second });
    expect(checked.items[19].ocrFlags).toContain(`independent_read_disagrees_${field}`);
    expect(checked.items[19][field]).toBe((first.items[19] as any)[field]);
  });

  it('keeps unknown payment terms blocked even if OCR omitted its uncertainty flag', () => {
    const service = new PharmacyPurchaseInvoiceService({} as any);
    const checked = (service as any).normalizeExtractedPurchaseDraft({ ...invoice(twentyRows()), billType: null }, []);
    expect(checked.ocrFlags).toContain('uncertain_bill_type');
    expect(checked.items).toHaveLength(20);
  });

  it('does not erase a strength decimal point when comparing product names', () => {
    const rows = twentyRows();
    rows[0].productName = 'Sample Cream 1.0%';
    const first = invoice(rows);
    const second = rows.map(row => ({ ...row }));
    second[0].productName = 'Sample Cream 10%';
    const checked = verifyPurchaseRead(first, { ...first, complete: true, items: second });
    expect(checked.items[0].ocrFlags).toContain('independent_read_disagrees_productName');
  });

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
    expect(await service.capabilities({id:'test',role:'RECEPTION'})).toEqual({read:true,create:true,review:true,commit:true,automate:true,saveSupplier:false});
    prisma.user.findUnique = async()=>({role:'RECEPTION',permissions:'[]'});
    expect(await service.capabilities({id:'test',role:'RECEPTION'})).toMatchObject({create:true,commit:false,automate:false});
  });
});
