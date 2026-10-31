import { purchaseRecovery, purchaseRecoveryTarget, purchaseDifferences, isPurchaseReadback, canCorrectPurchase } from '@/lib/purchase-invoice-recovery';
const attempt = Object.freeze({ generation: 1, scope: 'branch:user', invoiceId: 'invoice-1', revision: '2026-10-01T00:00:00Z', lineKeys: ['line-a'] });

describe('purchase recovery boundary', () => {
  it('does not turn unstructured duplicate text into invoice navigation', () => {
    expect(purchaseRecovery({ status: 409, message: 'Duplicate invoice-1' }, attempt)).toEqual({ kind: 'unknown', message: 'Duplicate invoice-1', attempt, reference: undefined });
  });
  it('rejects unsafe identifiers and retains receipt-specific recovery', () => {
    expect(purchaseRecovery({ body: { code: 'PURCHASE_RECEIPT_ALREADY_LINKED', existingInvoiceId: '../other', message: 'Receipt already linked' } }, attempt)).toEqual({ kind: 'receipt', message: 'Receipt already linked', existingInvoiceId: undefined, attempt, reference: undefined });
  });
  it('accepts linked-source recovery only with an identity-matched, known saved status', () => {
    const existingInvoice = { id: 'saved-1', invoiceNumber: 'A003906', distributorName: 'Supplier', status: 'DRAFT', workflowReceiptId: null };
    const body = { code: 'PURCHASE_SOURCE_ALREADY_LINKED', message: 'PDF already attached', existingInvoiceId: 'saved-1', existingInvoice };
    expect(purchaseRecovery({ body }, attempt)).toMatchObject({ kind: 'duplicate', existingInvoiceId: 'saved-1', existingInvoice });
    for (const invalid of [{ ...existingInvoice, id: 'other' }, { ...existingInvoice, status: 'SUCCESS' }, { ...existingInvoice, invoiceNumber: null }]) {
      expect(purchaseRecovery({ body: { ...body, existingInvoice: invalid } }, attempt)).not.toHaveProperty('existingInvoice');
    }
    expect(purchaseRecovery({ status: 403, body }, attempt)).toMatchObject({ kind: 'permission' });
    expect(purchaseRecovery({ status: 403, body }, attempt)).not.toHaveProperty('existingInvoice');
  });
  it('focuses the observed stable line key for a structured review issue', () => {
    const recovery = purchaseRecovery({body:{code:'PURCHASE_REVIEW_REQUIRED',issues:[{message:'Line 1: batchNumber is required'}]}},attempt);
    if (recovery.kind !== 'review') throw new Error('Expected review recovery');
    expect(purchaseRecoveryTarget(recovery.issues[0],attempt.lineKeys)).toBe('line-a-batch');
  });
  it('honors structured fields and line numbers over ambiguous wording', () => {
    const recovery = purchaseRecovery({body:{code:'PURCHASE_REVIEW_REQUIRED',issues:[
      {message:'Goods received date cannot be before invoice date',field:'goodsReceivedDate'},
      {message:'This value needs checking',field:'batchNumber',lineNumber:1},
    ]}},attempt);
    if (recovery.kind !== 'review') throw new Error('Expected review recovery');
    expect(recovery.issues.map(issue=>purchaseRecoveryTarget(issue,attempt.lineKeys))).toEqual(['goods-date','line-a-batch']);
  });
  it('uses structured catalogue fields without inventing a line or losing a parsed line', () => {
    for (const [message, lineIndex] of [['Product details incomplete', undefined], ['Line 3: product master incomplete', 2]] as const) {
      const result = purchaseRecovery({ body: { code: 'PURCHASE_CATALOG_REVIEW_REQUIRED', reason: 'incomplete', missingFields: ['composition1', 'strength'], message } }, attempt);
      if (result.kind !== 'catalogue') throw new Error('Expected catalogue recovery');
      expect(result.issues[0]).toMatchObject({ lineIndex, missingFields: ['composition1', 'strength'], catalogueReason: 'incomplete', message: `${lineIndex === undefined ? '' : 'Line 3: '}Saved product is missing composition, strength.` });
    }
  });
  it('requires same invoice and complete saved state for stock proof', () => {
    const saved = {id:'invoice-1',status:'STOCK_COMMITTED',stockCommittedAt:'2026-10-01T00:00:00Z',items:[],updatedAt:'2026-10-01T00:00:00Z'};
    expect(isPurchaseReadback(saved,'invoice-1')).toBe(true);
    expect(isPurchaseReadback({...saved,id:'invoice-2'},'invoice-1')).toBe(false);
    expect(isPurchaseReadback({...saved,status:'SUCCESS'},'invoice-1')).toBe(false);
    expect(isPurchaseReadback({...saved,items:undefined},'invoice-1')).toBe(false);
    expect(isPurchaseReadback({...saved,updatedAt:'unknown'},'invoice-1')).toBe(false);
  });
  it('locks reviewed, posted, cancelled and unknown comparisons', () => {
    expect(['REVIEWED','STOCK_COMMITTED','CANCELLED','NEW_STATUS'].map(status=>canCorrectPurchase({status}))).toEqual([false,false,false,false]);
    expect(canCorrectPurchase({status:'DRAFT'})).toBe(true);
  });
  it('compares notes and changed quantities without changing either snapshot', () => {
    const local = {header:{handwrittenNotes:'Corrected'},lines:[{localId:'a',quantityPurchased:'2'}]};
    const saved = {header:{handwrittenNotes:'Original'},lines:[{localId:'b',quantityPurchased:'1'}]};
    expect(purchaseDifferences(local,saved)).toEqual([{label:'handwritten notes',local:'Corrected',saved:'Original'},{label:'Line 1 quantity purchased',local:'2',saved:'1'}]);
    expect(saved.lines).toEqual([{localId:'b',quantityPurchased:'1'}]);
  });
});
