import { InventoryWorkflowService } from '../inventory-workflow.service';
import { DEFAULT_INVENTORY_SETTINGS } from '../inventory-workflow.types';
import { InventoryImportService } from '../inventory-import.service';
import { PharmacyPurchaseInvoiceService } from '../../pharmacy/pharmacy-purchase-invoice.service';
import { reconcileInventoryLedger } from '../inventory-ledger';
import { InventoryIdentityRecoveryService } from '../inventory-identity-recovery.service';
import { permissionGrants } from '../../../shared/access/permission-grants';

const actor = { id: 'operator', branchId: 'branch', role: 'OWNER' };

/**
 * @cc [owner:nareshshah139,label:test] reconciliation-transaction-fixture
 * Failed operations MUST roll back all fixture records. Predicate mismatches and duplicate
 * effect/event identities MUST fail so recovery assertions cannot pass through silent overwrites.
 */
function fixture() {
  const state: any = {
    item: { id: 'batch', branchId: 'branch', name: 'Product', unit: 'PIECES', currentStock: 10, heldStock: 0, costPrice: 1, sellingPrice: 1, status: 'ACTIVE', updatedAt: new Date('2026-10-24'), metadata: '{}' },
    documents: [], effects: [], movements: [], events: [], audits: [],
    users: [{ id: 'operator', branchId: 'branch', firstName: 'Rajesh', lastName: 'Iyer', role: 'OWNER', isActive: true }],
  };
  const matches = (row: any, where: any = {}) => Object.entries(where).every(([key, value]: [string, any]) => {
    if (key === 'branchId_requestKey') return matches(row, value);
    if ((key === 'payload' || key === 'detail') && value?.path) return value.path.reduce((v: any, k: string) => v?.[k], row[key]) === value.equals;
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if ('in' in value) return value.in.includes(row[key]);
      if ('not' in value) return row[key] !== value.not;
    }
    return row[key] instanceof Date ? row[key].getTime() === new Date(value).getTime() : row[key] === value;
  });
  const table = (key: string) => ({
    findFirst: async ({ where }: any) => structuredClone(state[key].find((r: any) => matches(r, where)) || null),
    findUnique: async ({ where }: any) => structuredClone(state[key].find((r: any) => matches(r, where)) || null),
    findMany: async ({ where = {}, include }: any) => state[key].filter((r: any) => matches(r, where)).map((r: any) => structuredClone({ ...r, ...(include?.effects ? { effects: state.effects.filter((e: any) => e.documentId === r.id) } : {}) })),
    count: async ({ where = {} }: any) => state[key].filter((r: any) => matches(r, where)).length,
    create: async ({ data }: any) => {
      if (data.effectKey && state[key].some((r: any) => r.effectKey === data.effectKey)) throw new Error('Duplicate effect');
      if (key === 'events' && state[key].some((r: any) => r.documentId === data.documentId && r.version === data.version)) throw new Error('Duplicate event');
      const row = { id: `${key}-${state[key].length}`, version: 1, createdAt: new Date(), ...data };
      state[key].push(row); return structuredClone(row);
    },
    update: async ({ where, data }: any) => {
      const row = state[key].find((r: any) => matches(r, where));
      if (!row) throw Object.assign(new Error('Changed record'), { code: 'P2025' });
      for (const [k, v] of Object.entries(data) as any) row[k] = v?.increment ? row[k] + v.increment : v;
      return structuredClone(row);
    },
  });
  const tx: any = {
    inventoryWorkflowDocument: table('documents'), inventoryWorkflowEffect: table('effects'),
    inventoryWorkflowEvent: table('events'), stockTransaction: table('movements'), inventoryAudit: table('audits'), user: table('users'),
    inventorySupplierCredit: { findUnique: async () => null }, pharmacyPurchaseInvoice: { count: async () => 0 },
    inventoryItem: {
      findFirst: async ({ where }: any) => matches(state.item, where) ? structuredClone(state.item) : null,
      findMany: async ({ where }: any) => matches(state.item, where) ? [structuredClone(state.item)] : [],
      update: async ({ where, data }: any) => {
        if (!matches(state.item, where)) throw Object.assign(new Error('Changed balance'), { code: 'P2025' });
        Object.assign(state.item, data); return structuredClone(state.item);
      },
    },
  };
  tx.$transaction = async (run: any) => {
    const before = structuredClone(state);
    try { return await run(tx); } catch (error) { Object.assign(state, before); throw error; }
  };
  const service = new InventoryWorkflowService(tx);
  jest.spyOn(service, 'permissions').mockResolvedValue(permissionGrants(['*']));
  jest.spyOn(service, 'settings').mockResolvedValue(DEFAULT_INVENTORY_SETTINGS as any);
  const add = (id: string, kind: string, quantity: number, extra: any = {}) => {
    const doc = { id, branchId: 'branch', version: 1, kind, status: 'DRAFT', reference: id, requestKey: id,
      payload: { reason: 'Verified fixture', date: '2026-10-24', lines: [{ id: `${id}-line`, inventoryId: 'batch', quantity, unitPrice: 1 }], ...extra } };
    state.documents.push(doc); return doc;
  };
  return { state, tx, service, add };
}

describe('Inventory reconciliation recovery', () => {
  it('restores the correct source hold when reversing a loss after residual release', async () => {
    const { state, service, add } = fixture();
    add('hold', 'HOLD', 5);
    await service.transition(actor, 'hold', { version: 1, action: 'POST' });
    add('loss', 'LOSS', 3, { sourceHoldId: 'hold' });
    await service.transition(actor, 'loss', { version: 1, action: 'POST' });
    await service.transition(actor, 'hold', { version: 2, action: 'RELEASE' });
    expect([state.item.currentStock, state.item.heldStock]).toEqual([7, 0]);
    await service.transition(actor, 'loss', { version: 2, action: 'REVERSE', reason: 'Goods found' });
    expect([state.item.currentStock, state.item.heldStock]).toEqual([10, 3]);
    expect(state.documents.find((d: any) => d.id === 'hold').status).toBe('POSTED');
    expect(state.documents.find((d: any) => d.id === 'loss').status).toBe('REVERSED');
    await service.transition(actor, 'hold', { version: 4, action: 'RELEASE' });
    expect([state.item.currentStock, state.item.heldStock]).toEqual([10, 0]);
    await expect(service.transition(actor, 'loss', { version: 2, action: 'REVERSE', reason: 'Retry' })).rejects.toThrow();
    expect(state.item.currentStock).toBe(10);
  });

  it('rolls back the source reopening when compensation cannot complete', async () => {
    const { state, service, add, tx } = fixture();
    add('hold', 'HOLD', 5);
    await service.transition(actor, 'hold', { version: 1, action: 'POST' });
    add('loss', 'LOSS', 3, { sourceHoldId: 'hold' });
    await service.transition(actor, 'loss', { version: 1, action: 'POST' });
    await service.transition(actor, 'hold', { version: 2, action: 'RELEASE' });
    const before = structuredClone(state);
    jest.spyOn(tx.stockTransaction, 'create').mockRejectedValueOnce(new Error('Injected movement failure'));
    await expect(service.transition(actor, 'loss', { version: 2, action: 'REVERSE', reason: 'Correct loss' })).rejects.toThrow('Injected');
    expect(state).toEqual(before);
  });

  it('cancels a supplier return challan after release into its own source hold', async () => {
    const { state, service, add } = fixture();
    add('hold', 'HOLD', 5);
    await service.transition(actor, 'hold', { version: 1, action: 'POST' });
    const returned: any = add('return', 'SUPPLIER_RETURN', 3, { sourceHoldId: 'hold', supplierGstin: '27ABCDE1234F1Z5' });
    returned.supplierGstin = '27ABCDE1234F1Z5';
    await service.transition(actor, 'return', { version: 1, action: 'CHALLAN' });
    await service.transition(actor, 'hold', { version: 2, action: 'RELEASE' });
    await service.transition(actor, 'return', { version: 2, action: 'CANCEL' });
    expect([state.item.currentStock, state.item.heldStock]).toEqual([10, 3]);
    expect(state.documents.find((d: any) => d.id === 'hold').status).toBe('POSTED');
  });

  it.each(['DRAFT', 'AWAITING_APPROVAL'])('refuses to recount a %s count, which is still open on its batch', async (status) => {
    const { state, service, add } = fixture();
    add('old-count', 'COUNT', 0, { assigneeId: 'operator', lines: [{ id: 'old-line', inventoryId: 'batch', name: 'Product', batchNumber: 'B-7', quantity: 0, systemStock: 5, physicalStock: 4 }] }).status = status;
    await expect(service.transition(actor, 'old-count', { version: 1, action: 'RECOUNT' })).rejects.toMatchObject({
      response: { code: 'COUNT_BATCH_OPEN', message: `Product, batch B-7, is already on your count of 24/10/2026, ${status === 'DRAFT' ? 'not signed yet. Count it there.' : 'signed and waiting for approval. Approve or reject that count first.'}` },
    });
    expect(state.documents.map((d: any) => d.id)).toEqual(['old-count']);
  });

  it.each(['APPROVED', 'REJECTED', 'CANCELLED', 'POSTED', 'REVERSED'])('starts a fresh uncounted attempt from %s without reusing stale measurements', async (status) => {
    const { state, service, add } = fixture();
    add('old-count', 'COUNT', 0, { lines: [{ id: 'old-line', inventoryId: 'batch', quantity: 0, systemStock: 5, physicalStock: 4, countRevision: 'old' }] }).status = status;
    const result = await service.transition(actor, 'old-count', { version: 1, action: 'RECOUNT' });
    expect(result.status).toBe('DRAFT');
    expect(result.id).not.toBe('old-count');
    expect(result.payload.lines[0].systemStock).toBe(10);
    expect(result.payload.lines[0].physicalStock).toBeUndefined();
    expect(result.payload.lines[0].countRevision).not.toBe('old');
    expect(state.item.currentStock).toBe(10);
    const replay = await service.transition(actor, 'old-count', { version: 1, action: 'RECOUNT' });
    expect(replay.id).toBe(result.id);
    await expect(service.transition(actor, 'old-count', { version: 0, action: 'RECOUNT' })).rejects.toThrow('changed');
  });
});

describe('Independent count ledger', () => {
  const movement = { id: 'sale', type: 'SALE', quantity: 2 };
  const item = { currentStock: 8, metadata: JSON.stringify({ ledgerCheckpoint: { documentId: 'count', quantity: 10, coveredMovementIds: ['legacy'] } }) };
  const legacy = { id: 'legacy', type: 'ADJUSTMENT', quantity: 3 };
  it('does not assert agreement without a recorded baseline', () => {
    expect(reconcileInventoryLedger({ currentStock: 8, metadata: '{}' }, [movement]).status).toBe('UNVERIFIED');
  });
  it('preserves unknown old history while independently detecting later stock drift', () => {
    expect(reconcileInventoryLedger(item, [legacy, movement])).toMatchObject({ expectedStock: 8, difference: 0, status: 'RECONCILED' });
    expect(reconcileInventoryLedger({ ...item, currentStock: 9 }, [legacy, movement])).toMatchObject({ expectedStock: 8, difference: 1, status: 'DISCREPANCY' });
  });
  it('rejects unknown subsequent signs and missing covered history', () => {
    expect(reconcileInventoryLedger(item, [legacy, { ...legacy, id: 'new' }]).status).toBe('UNVERIFIED');
    expect(reconcileInventoryLedger(item, [movement])).toMatchObject({ status: 'UNVERIFIED', missingHistory: true });
  });
});

describe('Opening import reconciliation', () => {
  it('rejects a stock revision conflict instead of replacing a newer ledger checkpoint', async () => {
    const item: any = { id: 'batch', branchId: 'branch', updatedAt: new Date('2026-10-24'), currentStock: 10, heldStock: 0, unit: 'PIECES', metadata: '{}' };
    const tx: any = { drug: { update: async () => ({ id: 'drug' }) }, inventoryItem: {
      count: async ({ where }: any) => typeof where.drugs.some.id === 'string' ? 1 : 0,
      update: async ({ where, data }: any) => {
        // A separate committed count occurs after the import's snapshot, even in the same millisecond.
        item.metadata = '{"ledgerCheckpoint":{"quantity":10}}';
        if (where.metadata !== item.metadata) throw Object.assign(new Error('Changed revision'), { code: 'P2025' });
        Object.assign(item, data); return item;
      },
    }, auditLog: { create: jest.fn() } };
    const service: any = new InventoryImportService({ $transaction: (run: any) => run(tx) } as any);
    jest.spyOn(service, 'findImportedDrug').mockResolvedValue({ id: 'drug' });
    jest.spyOn(service, 'getSafeDrugUniqueFields').mockResolvedValue({});
    jest.spyOn(service, 'findImportedInventoryItem').mockImplementation(async () => ({ ...item }));
    jest.spyOn(service, 'getSafeInventoryUniqueFields').mockResolvedValue({});
    await expect(service.upsertImportRow({ name: 'Product', currentStock: 10, hasCurrentStock: true, unit: 'PIECES' }, 'branch', 'operator')).rejects.toThrow('Changed revision');
    expect(JSON.parse(item.metadata).ledgerCheckpoint).toEqual({ quantity: 10 });
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('rejects a second product identity instead of attaching it to an existing batch', async () => {
    const update = jest.fn();
    const tx: any = { drug: { update: async () => ({ id: 'new-product' }) }, inventoryItem: { count: async ({ where }: any) => typeof where.drugs.some.id === 'string' ? 0 : 1, update } };
    const service: any = new InventoryImportService({ $transaction: (run: any) => run(tx) } as any);
    jest.spyOn(service, 'findImportedDrug').mockResolvedValue({ id: 'new-product' });
    jest.spyOn(service, 'getSafeDrugUniqueFields').mockResolvedValue({});
    jest.spyOn(service, 'findImportedInventoryItem').mockResolvedValue({ id: 'batch', currentStock: 10, heldStock: 0, unit: 'PIECES', metadata: '{}' });
    jest.spyOn(service, 'getSafeInventoryUniqueFields').mockResolvedValue({});
    await expect(service.upsertImportRow({ name: 'Product', currentStock: 10, hasCurrentStock: true, unit: 'PIECES' }, 'branch', 'operator')).rejects.toThrow('linked to another product');
    expect(update).not.toHaveBeenCalled();
  });

  it('does not overwrite a sale committed after the import read', async () => {
    const item: any = { id: 'batch', currentStock: 10, heldStock: 0, unit: 'PIECES', costPrice: 1, sellingPrice: 1, metadata: '{}' };
    const tx: any = {
      drug: { update: async () => ({ id: 'drug' }) },
      inventoryItem: { count: async ({ where }: any) => typeof where.drugs.some.id === 'string' ? 1 : 0, update: async ({ data }: any) => { item.currentStock = 9; Object.assign(item, data); return item; } },
      auditLog: { create: async () => ({}) },
    };
    const service: any = new InventoryImportService({ $transaction: (run: any) => run(tx) } as any);
    jest.spyOn(service, 'findImportedDrug').mockResolvedValue({ id: 'drug' });
    jest.spyOn(service, 'getSafeDrugUniqueFields').mockResolvedValue({});
    jest.spyOn(service, 'findImportedInventoryItem').mockImplementation(async () => ({ ...item }));
    jest.spyOn(service, 'getSafeInventoryUniqueFields').mockResolvedValue({});
    await service.upsertImportRow({ name: 'Product', currentStock: 10, hasCurrentStock: true, unit: 'PIECES' }, 'branch', 'operator');
    expect(item.currentStock).toBe(9);
  });
});

describe('Reviewed purchase recovery', () => {
  it('rejects an invalid receipt before locking the invoice for review', async () => {
    const invoice = { id: 'bill', branchId: 'branch', status: 'DRAFT', workflowReceiptId: 'missing', goodsReceivedDate: new Date(), items: [], unresolvedOcrFlags: 0, reconciliationIssues: [] };
    const update = jest.fn();
    const db: any = { pharmacyPurchaseInvoice: { findFirst: async () => invoice, update }, inventoryWorkflowDocument: { findFirst: async () => null } };
    db.$transaction = (run: any) => run(db);
    const service: any = new PharmacyPurchaseInvoiceService(db);
    jest.spyOn(service, 'formatPurchaseInvoice').mockImplementation((value: any) => value);
    await expect(service.markReviewed('bill', {}, 'branch', 'operator')).rejects.toThrow('posted inward challan');
    expect(update).not.toHaveBeenCalled();
  });

  it('reopens only an unchanged unposted reviewed invoice and records the actor', async () => {
    const invoice: any = { id: 'bill', branchId: 'branch', status: 'REVIEWED', updatedAt: new Date('2026-10-24'), stockCommittedAt: null, items: [] };
    const audit = jest.fn();
    const db: any = { pharmacyPurchaseInvoice: {
      findFirst: async () => ({ ...invoice }),
      updateMany: async ({ where, data }: any) => {
        if (where.status !== invoice.status || where.updatedAt.getTime() !== invoice.updatedAt.getTime() || invoice.stockCommittedAt) return { count: 0 };
        Object.assign(invoice, data); return { count: 1 };
      },
    } };
    db.$transaction = (run: any) => run(db);
    const service: any = new PharmacyPurchaseInvoiceService(db);
    jest.spyOn(service, 'purchaseAudit').mockImplementation(audit);
    jest.spyOn(service, 'formatPurchaseInvoice').mockImplementation((value: any) => value);
    await expect(service.reopenReview('bill', { reason: 'Correct receipt', expectedUpdatedAt: '2026-10-23T00:00:00.000Z' }, 'branch', 'operator')).rejects.toThrow('changed');
    expect(invoice.status).toBe('REVIEWED');
    expect(audit).not.toHaveBeenCalled();
    await service.reopenReview('bill', { reason: 'Correct receipt link', expectedUpdatedAt: '2026-10-24T00:00:00.000Z' }, 'branch', 'operator');
    expect(invoice.status).toBe('DRAFT');
    expect(audit).toHaveBeenCalledWith(db, 'bill', 'branch', 'operator', 'REVIEW_REOPENED', expect.anything(), expect.objectContaining({ status: 'DRAFT' }));
    invoice.status = 'STOCK_COMMITTED'; invoice.stockCommittedAt = new Date();
    await expect(service.reopenReview('bill', { reason: 'Retry', expectedUpdatedAt: invoice.updatedAt.toISOString() }, 'branch', 'operator')).rejects.toThrow();
  });
});

describe('Ambiguous batch identity recovery', () => {
  it('retains only a physically verified existing product without converting balances', async () => {
    const item = { id: 'batch', branchId: 'branch', updatedAt: new Date('2026-10-24'), currentStock: 10, heldStock: 2, unit: 'PIECES',
      drugs: [{ id: 'correct', branchId: 'branch', isActive: true }, { id: 'wrong', branchId: 'branch', isActive: true }] };
    const update = jest.fn(async ({ data }: any) => ({ ...item, ...data })), audit = jest.fn();
    const tx: any = { inventoryItem: { findFirst: async () => item, update }, auditLog: { create: audit } };
    const authorize = jest.fn();
    const service = new InventoryIdentityRecoveryService({ authorize, transaction: (run: any) => run(tx) } as any);
    const body = { itemId: 'batch', productId: 'correct', updatedAt: item.updatedAt.toISOString(), confirmed: true, reason: 'Checked physical pack' };
    await expect(service.resolveBatch(actor, { ...body, productId: 'other' })).rejects.toThrow('existing active product');
    await expect(service.resolveBatch(actor, { ...body, updatedAt: 'old' })).rejects.toThrow('changed');
    await expect(service.resolveBatch(actor, { ...body, confirmed: false })).rejects.toThrow('Confirm');
    expect(update).not.toHaveBeenCalled();
    const resolved = await service.resolveBatch(actor, body);
    expect(authorize).toHaveBeenCalledWith(actor, 'COUNT', true);
    expect(resolved).toMatchObject({ currentStock: 10, heldStock: 2, unit: 'PIECES' });
    expect(update.mock.calls[0][0].data).toEqual({ drugs: { set: [{ id: 'correct' }] }, updatedAt: expect.any(Date) });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'INVENTORY_IDENTITY_RESOLVED' }) }));
  });
});


describe('Actionable inventory guard evidence', () => {
  async function rejectedResponse(promise: Promise<unknown>) {
    try { await promise; throw new Error('Expected operation to reject'); }
    catch (error: any) { if (!error.getResponse) throw error; return error.getResponse(); }
  }
  it('returns the actual source and remaining capacity rather than another hold on the batch',async()=>{
    const {state,service,add}=fixture();
    add('hold','HOLD',3); await service.transition(actor,'hold',{version:1,action:'POST'});
    add('loss','LOSS',4,{sourceHoldId:'hold'});
    const body=await rejectedResponse(service.transition(actor,'loss',{version:1,action:'POST'}));
    expect(body).toMatchObject({code:'INVENTORY_SOURCE_CAPACITY',stockEffect:'NONE',recovery:{action:'REVIEW_SOURCE',inventoryId:'batch',sourceId:'hold',sourceKind:'HOLD',quantities:{remaining:3,requested:4}}});
    expect([state.item.currentStock,state.item.heldStock]).toEqual([10,3]);
  });
  it('links the exact active downstream record that blocks reversal',async()=>{
    const {state,service,add}=fixture();
    add('hold','HOLD',5); await service.transition(actor,'hold',{version:1,action:'POST'});
    add('loss','LOSS',2,{sourceHoldId:'hold'});await service.transition(actor,'loss',{version:1,action:'POST'});
    const body=await rejectedResponse(service.transition(actor,'hold',{version:2,action:'REVERSE',reason:'Review correction'}));
    expect(body).toMatchObject({code:'INVENTORY_REVERSAL_BLOCKED',stockEffect:'NONE',recovery:{action:'REVERSE_DEPENDENCIES',documents:[{id:'loss',kind:'LOSS',reference:'loss'}]}});
    expect([state.item.currentStock,state.item.heldStock]).toEqual([8,3]);
  });
  it('identifies an inconsistent source balance without releasing another hold',async()=>{
    const {state,service,add}=fixture();
    add('hold','HOLD',3); await service.transition(actor,'hold',{version:1,action:'POST'});
    const linked=add('old-loss','LOSS',5,{sourceHoldId:'hold'});linked.status='POSTED';
    state.effects.push({id:'legacy-consumption',branchId:'branch',documentId:'old-loss',inventoryId:'batch',heldDelta:-5});
    const body=await rejectedResponse(service.transition(actor,'hold',{version:2,action:'RELEASE'}));
    expect(body).toMatchObject({code:'INVENTORY_SOURCE_INCONSISTENT',stockEffect:'NONE',recovery:{action:'REVIEW_SOURCE',inventoryId:'batch',sourceId:'hold',sourceKind:'HOLD',quantities:{remaining:-2},documents:[{id:'old-loss',kind:'LOSS',reference:'old-loss'}]}});
    expect(body.message).toContain('review its linked disposals or returns');
    expect([state.item.currentStock,state.item.heldStock]).toEqual([10,3]);
  });
  it('returns the batch recovery destination for a concurrent stock change',async()=>{
    const {state,service,tx,add}=fixture();
    add('loss','LOSS',2);
    jest.spyOn(tx.inventoryItem,'update').mockRejectedValueOnce(Object.assign(new Error('changed'),{code:'P2025'}));
    const body=await rejectedResponse(service.transition(actor,'loss',{version:1,action:'POST'}));
    expect(body).toMatchObject({code:'INVENTORY_BATCH_CHANGED',stockEffect:'NONE',recovery:{action:'REVIEW_BATCH',inventoryId:'batch'}});
    expect(state.movements).toEqual([]);
  });
  it.each([-1,1.5])('names the row for invalid physical count %s without saving it',async physicalStock=>{
    const {state,service}=fixture();
    const body=await rejectedResponse(service.saveDocument(actor,{kind:'COUNT',reference:'Count check',requestKey:'invalid-count',payload:{date:'2026-10-24',reason:'Observed',lines:[{id:'observed',inventoryId:'batch',quantity:0,physicalStock}]}}));
    expect(body).toMatchObject({code:'INVENTORY_INVALID_COUNT',stockEffect:'NONE',recovery:{action:'CORRECT_FIELD',inventoryId:'batch',field:'physicalStock'}});
    expect(body.message).toContain('Product');
    expect(body.message).toContain('whole number');
    expect(state.documents).toEqual([]);
  });
});


describe('Stock count sign-off', () => {
  const anil = { id: 'anil', branchId: 'branch', role: 'PHARMACIST' };
  async function failure(promise: Promise<unknown>) {
    try { await promise; } catch (error: any) { return { status: error.getStatus?.(), body: error.getResponse?.() }; }
    throw new Error('Expected the operation to fail');
  }
  function counting(assigneeId = 'anil') {
    const f = fixture();
    f.state.item.name = 'Isotroin 10';
    f.state.users.push(
      { id: 'anil', branchId: 'branch', firstName: 'Anil', lastName: 'Deshmukh', role: 'PHARMACIST', isActive: true },
      { id: 'doctor', branchId: 'branch', firstName: 'Priya', lastName: 'Menon', role: 'DOCTOR', isActive: true },
    );
    f.add('count', 'COUNT', 0, {
      origin: 'CYCLE', assigneeId,
      lines: [{ id: 'line', inventoryId: 'batch', name: 'Isotroin 10', quantity: 0, unitPrice: 12.5, systemStock: 10 }],
    });
    return f;
  }

  it('posts a count with no difference at once, writes the audit and the ledger baseline, and moves no stock', async () => {
    const { state, service } = counting();
    state.movements.push({ id: 'legacy', branchId: 'branch', itemId: 'batch', type: 'ADJUSTMENT', quantity: 2 });
    const signed = await service.signOffCount(anil, 'count', { version: 1, requestKey: 'sign-1', lines: [{ id: 'line', physicalStock: 10 }] });
    expect([signed.status, signed.version, signed.postedBy]).toEqual(['POSTED', 2, 'anil']);
    expect(signed.payload.signOff).toMatchObject({ by: 'anil', note: '', requestKey: 'sign-1' });
    expect(state.audits.map((a: any) => [a.auditorId, a.systemStock, a.physicalStock, a.variance])).toEqual([['anil', 10, 10, 0]]);
    expect(state.movements.map((m: any) => m.id)).toEqual(['legacy']);
    expect(state.item.currentStock).toBe(10);
    expect(JSON.parse(state.item.metadata)).toMatchObject({ lastCountDocumentId: 'count', ledgerCheckpoint: { quantity: 10, coveredMovementIds: ['legacy'], documentId: 'count' } });
    expect(reconcileInventoryLedger(state.item, state.movements).status).toBe('RECONCILED');
    expect(state.events.map((e: any) => [e.action, e.fromStatus, e.toStatus])).toEqual([['SIGN_OFF', 'DRAFT', 'POSTED']]);
  });

  it('needs every batch counted, and a note when a count differs', async () => {
    const { state, service } = counting();
    expect(await failure(service.signOffCount(anil, 'count', { version: 1, requestKey: 'sign-1' }))).toEqual({
      status: 400,
      body: { code: 'COUNT_INCOMPLETE', message: 'Count every item before signing off. Not counted yet: Isotroin 10.', lineIds: ['line'] },
    });
    expect(await failure(service.signOffCount(anil, 'count', { version: 1, requestKey: 'sign-1', lines: [{ id: 'line', physicalStock: 7 }] }))).toEqual({
      status: 400,
      body: { code: 'COUNT_NOTE_REQUIRED', message: 'Add a note explaining the differences before signing off.' },
    });
    expect((await failure(service.signOffCount(anil, 'count', { version: 1, requestKey: 'sign-1', lines: [{ id: 'line', physicalStock: 2.5 }], note: 'x' }))).body).toMatchObject({
      code: 'INVENTORY_INVALID_COUNT', message: 'Isotroin 10: the counted quantity must be a whole number of at least 0.',
    });
    expect([state.documents[0].status, state.documents[0].version, state.events.length]).toEqual(['DRAFT', 1, 0]);
  });

  it('locks the signed count: a replay returns it, other figures get 409 and nothing edits it', async () => {
    const { state, service } = counting();
    const input = { version: 1, requestKey: 'sign-1', lines: [{ id: 'line', physicalStock: 7, note: 'Strip torn' }], note: 'Two strips damaged' };
    const signed = await service.signOffCount(anil, 'count', input);
    expect([signed.status, signed.payload.lines[0].physicalStock, signed.payload.lines[0].note, signed.payload.signOff.note]).toEqual(['AWAITING_APPROVAL', 7, 'Strip torn', 'Two strips damaged']);
    expect([state.item.currentStock, state.movements.length, state.audits.length]).toEqual([10, 0, 0]);
    expect((await service.signOffCount(anil, 'count', input)).version).toBe(2);
    expect(state.events).toHaveLength(1);
    expect(await failure(service.signOffCount(anil, 'count', { ...input, lines: [{ id: 'line', physicalStock: 6 }] }))).toMatchObject({ status: 409, body: { code: 'COUNT_REQUEST_KEY_REUSED' } });
    expect(await failure(service.signOffCount(anil, 'count', { ...input, requestKey: 'sign-2' }))).toMatchObject({ status: 409, body: { message: 'This count was already signed off. Reload to see the signed record.' } });
    expect((await failure(service.saveCountProgress(anil, 'count', { version: 2, lines: [{ id: 'line', physicalStock: 9 }] }))).status).toBe(409);
    expect(await failure(service.saveDocument(anil, { kind: 'COUNT', version: 2, reference: 'count', requestKey: 'count', payload: {} } as any, 'count'))).toMatchObject({ status: 400, body: { message: 'Enter counted quantities from Stock counts › My counts' } });
    expect(state.documents[0].payload.lines[0].physicalStock).toBe(7);
  });

  it('refuses a request key already used to sign another count', async () => {
    const { state, service, add } = counting();
    add('second', 'COUNT', 0, { assigneeId: 'anil', lines: [{ id: 'second-line', inventoryId: 'batch', name: 'Isotroin 10', quantity: 0, systemStock: 10 }] });
    await service.signOffCount(anil, 'count', { version: 1, requestKey: 'shared', lines: [{ id: 'line', physicalStock: 10 }] });
    expect(await failure(service.signOffCount(anil, 'second', { version: 1, requestKey: 'shared', lines: [{ id: 'second-line', physicalStock: 10 }] }))).toMatchObject({ status: 409, body: { code: 'COUNT_REQUEST_KEY_REUSED' } });
    expect(state.documents[1].status).toBe('DRAFT');
  });

  it('lets only the assigned person enter and sign a count', async () => {
    const { state, service } = counting();
    expect(await failure(service.saveCountProgress(actor, 'count', { version: 1, lines: [{ id: 'line', physicalStock: 9 }] }))).toEqual({
      status: 403, body: { statusCode: 403, error: 'Forbidden', message: 'This count is assigned to Anil Deshmukh. Only they can enter and sign it off.' },
    });
    expect(state.documents[0].version).toBe(1);
  });

  it('captures the system stock at the moment each quantity is entered', async () => {
    const { state, service } = counting();
    const first = await service.saveCountProgress(anil, 'count', { version: 1, lines: [{ id: 'line', physicalStock: 9 }] });
    expect([first.payload.lines[0].systemStock, first.payload.lines[0].physicalStock, state.item.currentStock]).toEqual([10, 9, 10]);
    state.item.currentStock = 8;
    const noted = await service.saveCountProgress(anil, 'count', { version: 2, lines: [{ id: 'line', note: 'Behind the shelf' }] });
    expect([noted.payload.lines[0].systemStock, noted.payload.lines[0].physicalStock, noted.payload.lines[0].note]).toEqual([10, 9, 'Behind the shelf']);
    const recounted = await service.saveCountProgress(anil, 'count', { version: 3, lines: [{ id: 'line', physicalStock: 7 }] });
    expect([recounted.payload.lines[0].systemStock, recounted.payload.lines[0].physicalStock]).toEqual([8, 7]);
    expect(state.movements).toEqual([]);
  });

  it('stamps when each quantity was entered and clears the stamp when the quantity is cleared', async () => {
    const { service } = counting();
    jest.useFakeTimers({ now: new Date('2026-11-07T04:30:00.000Z') });
    try {
      const typed = await service.saveCountProgress(anil, 'count', { version: 1, lines: [{ id: 'line', physicalStock: 9 }] });
      expect(typed.payload.lines[0].capturedAt).toBe('2026-11-07T04:30:00.000Z');
      jest.setSystemTime(new Date('2026-11-07T05:00:00.000Z'));
      const noted = await service.saveCountProgress(anil, 'count', { version: 2, lines: [{ id: 'line', physicalStock: 9, note: 'Top shelf' }] });
      expect(noted.payload.lines[0].capturedAt).toBe('2026-11-07T04:30:00.000Z');
      const cleared = await service.saveCountProgress(anil, 'count', { version: 3, lines: [{ id: 'line', physicalStock: '' }] });
      expect(cleared.payload.lines[0].capturedAt).toBeUndefined();
    } finally {
      jest.useRealTimers();
    }
  });

  it('refuses to sign a count typed before capture times were kept, and a retyped count signs', async () => {
    const { state, service } = counting();
    state.documents[0].payload.lines[0].physicalStock = 9;
    const refused = await failure(service.signOffCount(anil, 'count', { version: 1, requestKey: 'sign-legacy', note: 'One short', lines: [{ id: 'line', physicalStock: 9 }] }));
    expect(refused).toEqual({
      status: 400,
      body: { code: 'COUNT_RETYPE', message: 'Type these counts again before signing off: Isotroin 10. The system quantity they were compared with is out of date.', lineIds: ['line'] },
    });
    const retyped = await service.saveCountProgress(anil, 'count', { version: 1, lines: [{ id: 'line', physicalStock: 9 }] });
    expect(retyped.payload.lines[0].capturedAt).toEqual(expect.any(String));
    const signed = await service.signOffCount(anil, 'count', { version: 2, requestKey: 'sign-legacy', note: 'One short', lines: [{ id: 'line', physicalStock: 9 }] });
    expect(signed.status).toBe('AWAITING_APPROVAL');
  });

  it('refuses the old submit, approve and post actions on a count', async () => {
    const { service } = counting();
    for (const action of ['SUBMIT', 'POST', 'APPROVE'])
      await expect(service.transition(actor, 'count', { version: 1, action })).rejects.toThrow('A stock count is signed off by the person who counted it, then approved or rejected from Stock counts › Approvals');
  });
});

describe('Stock count approval', () => {
  const anil = { id: 'anil', branchId: 'branch', role: 'PHARMACIST' };
  const doctor = { id: 'doctor', branchId: 'branch', role: 'DOCTOR' };
  async function failure(promise: Promise<unknown>) {
    try { await promise; } catch (error: any) { return { status: error.getStatus?.(), body: error.getResponse?.() }; }
    throw new Error('Expected the operation to fail');
  }
  async function signed(counted: number, signer = anil) {
    const f = fixture();
    f.state.item.name = 'Isotroin 10';
    f.state.users.push(
      { id: 'anil', branchId: 'branch', firstName: 'Anil', lastName: 'Deshmukh', role: 'PHARMACIST', isActive: true },
      { id: 'doctor', branchId: 'branch', firstName: 'Priya', lastName: 'Menon', role: 'DOCTOR', isActive: true },
    );
    f.add('count', 'COUNT', 0, { origin: 'CYCLE', assigneeId: signer.id, lines: [{ id: 'line', inventoryId: 'batch', name: 'Isotroin 10', quantity: 0, unitPrice: 12.5, systemStock: 10 }] });
    await f.service.signOffCount(signer, 'count', { version: 1, requestKey: 'sign', lines: [{ id: 'line', physicalStock: counted }], note: 'Counted twice' });
    return f;
  }

  it('applies the counted difference to the current stock, so a sale after the count does not block approval', async () => {
    const { state, service } = await signed(7);
    state.item.currentStock = 8;
    state.movements.push({ id: 'sale', branchId: 'branch', itemId: 'batch', type: 'SALE', quantity: 2, quantityDelta: -2 });
    const approved = await service.decideCount(doctor, 'count', 'APPROVE', { version: 2, requestKey: 'decide', reason: 'Two strips broken in the drawer' });
    expect([approved.status, approved.approvedBy, approved.postedBy, state.item.currentStock]).toEqual(['POSTED', 'doctor', 'doctor', 5]);
    expect(state.movements.at(-1)).toMatchObject({ userId: 'doctor', quantityDelta: -3, reason: 'Stock count approved: Two strips broken in the drawer', reference: 'WF-count' });
    expect(state.audits.map((a: any) => [a.auditorId, a.systemStock, a.physicalStock, a.variance, JSON.parse(a.notes).approvedBy])).toEqual([['anil', 10, 7, -3, 'doctor']]);
    expect(approved.payload.decision).toMatchObject({ decision: 'APPROVE', by: 'doctor', reason: 'Two strips broken in the drawer', selfApproval: false });
    expect(state.events.map((e: any) => [e.action, e.actorId, e.toStatus])).toEqual([['SIGN_OFF', 'anil', 'AWAITING_APPROVAL'], ['APPROVE', 'doctor', 'POSTED']]);
    expect(state.events[1].detail).toMatchObject({ reason: 'Two strips broken in the drawer', stockEffect: true, adjustments: [{ inventoryId: 'batch', delta: -3 }] });
  });

  it('adds stock when the shelf holds more than the system', async () => {
    const { state, service } = await signed(13);
    await service.decideCount(doctor, 'count', 'APPROVE', { version: 2, requestKey: 'decide', reason: 'Found an unrecorded box' });
    expect([state.item.currentStock, state.movements.at(-1).quantityDelta]).toEqual([13, 3]);
  });

  it('refuses a decrease larger than the stock left now', async () => {
    const { state, service } = await signed(2);
    state.item.currentStock = 5;
    expect(await failure(service.decideCount(doctor, 'count', 'APPROVE', { version: 2, requestKey: 'decide', reason: 'Approve' }))).toEqual({
      status: 409,
      body: { code: 'COUNT_DELTA_BELOW_STOCK', stockEffect: 'NONE', message: 'Isotroin 10: the count found 8 fewer than the system had, but only 5 pieces are left now. The count cannot be right. Reject it and ask for a fresh count.' },
    });
    expect([state.item.currentStock, state.documents[0].status, state.movements.length]).toEqual([5, 'AWAITING_APPROVAL', 0]);
  });

  it('names the protected balances when the count is below held stock', async () => {
    const { state, service, add } = await signed(2);
    add('hold', 'HOLD', 5);
    await service.transition(actor, 'hold', { version: 1, action: 'POST' });
    const { body } = await failure(service.decideCount(doctor, 'count', 'APPROVE', { version: 2, requestKey: 'decide', reason: 'Approve' })) as any;
    expect(body).toMatchObject({ code: 'INVENTORY_HELD_STOCK', stockEffect: 'NONE', recovery: { action: 'REVIEW_BATCH', inventoryId: 'batch', quantities: { onHand: 10, held: 5, available: 5, requested: 8 } } });
    expect([state.item.currentStock, state.item.heldStock, state.documents[0].status]).toEqual([10, 5, 'AWAITING_APPROVAL']);
  });

  it('rejects with a reason, changes no stock and records who decided', async () => {
    const { state, service } = await signed(7);
    expect((await failure(service.decideCount(doctor, 'count', 'REJECT', { version: 2, requestKey: 'decide', reason: ' ' }))).body).toMatchObject({ message: 'Give a reason for rejecting this count' });
    const rejected = await service.decideCount(doctor, 'count', 'REJECT', { version: 2, requestKey: 'decide', reason: 'Recount the top shelf' });
    expect([rejected.status, rejected.payload.decision.decision, rejected.payload.decision.by, rejected.payload.decision.reason]).toEqual(['REJECTED', 'REJECT', 'doctor', 'Recount the top shelf']);
    expect([state.item.currentStock, state.movements.length, state.audits.length]).toEqual([10, 0, 0]);
  });

  it('replays a decision and refuses the same key with another answer', async () => {
    const { state, service } = await signed(7);
    const input = { version: 2, requestKey: 'decide', reason: 'Two strips broken' };
    await service.decideCount(doctor, 'count', 'APPROVE', input);
    expect((await service.decideCount(doctor, 'count', 'APPROVE', input)).status).toBe('POSTED');
    expect(await failure(service.decideCount(doctor, 'count', 'REJECT', input))).toMatchObject({ status: 409, body: { code: 'COUNT_REQUEST_KEY_REUSED' } });
    expect([state.item.currentStock, state.movements.length, state.events.length]).toEqual([7, 1, 2]);
  });

  it('keeps the signer from deciding their own count while another approver is active', async () => {
    const { state, service } = await signed(7, doctor);
    expect(await failure(service.decideCount(doctor, 'count', 'APPROVE', { version: 2, requestKey: 'decide', reason: 'Fine', selfApproval: true }))).toEqual({
      status: 403, body: { code: 'COUNT_SEPARATION_OF_DUTIES', message: 'You signed this count, so someone else decides it. Ask Rajesh Iyer.' },
    });
    expect(await failure(service.decideCount(anil, 'count', 'APPROVE', { version: 2, requestKey: 'decide', reason: 'Fine' }))).toMatchObject({ status: 403, body: { message: 'A doctor or an administrator decides stock count differences' } });
    await service.decideCount(actor, 'count', 'APPROVE', { version: 2, requestKey: 'decide', reason: 'Fine' });
    expect([state.documents[0].status, state.documents[0].approvedBy, state.item.currentStock]).toEqual(['POSTED', 'operator', 7]);
  });

  it('keeps managers off count decisions and out of the people to ask', async () => {
    const { state, service } = await signed(7, doctor);
    state.users.push({ id: 'ravi', branchId: 'branch', firstName: 'Ravi', lastName: 'Kumar', role: 'MANAGER', isActive: true });
    expect(await failure(service.decideCount({ id: 'ravi', branchId: 'branch', role: 'MANAGER' }, 'count', 'APPROVE', { version: 2, requestKey: 'manager', reason: 'Fine' }))).toMatchObject({
      status: 403, body: { message: 'A doctor or an administrator decides stock count differences' },
    });
    expect(await failure(service.decideCount(doctor, 'count', 'APPROVE', { version: 2, requestKey: 'decide', reason: 'Fine' }))).toMatchObject({
      body: { message: 'You signed this count, so someone else decides it. Ask Rajesh Iyer.' },
    });
    state.users.find((u: any) => u.id === 'operator').isActive = false;
    expect(await failure(service.decideCount(doctor, 'count', 'APPROVE', { version: 2, requestKey: 'decide', reason: 'Fine' }))).toMatchObject({ body: { code: 'COUNT_SELF_APPROVAL_CONFIRM' } });
  });

  it('cancels a count only while unsigned, and only for its assignee or an approver', async () => {
    const f = fixture();
    f.state.users.push({ id: 'meera', branchId: 'branch', firstName: 'Meera', lastName: 'Kulkarni', role: 'PHARMACIST', isActive: true });
    f.add('count', 'COUNT', 0, { assigneeId: 'anil', lines: [{ id: 'line', inventoryId: 'batch', name: 'Isotroin 10', quantity: 0, systemStock: 10 }] });
    expect(await failure(f.service.transition({ id: 'meera', branchId: 'branch', role: 'PHARMACIST' }, 'count', { version: 1, action: 'CANCEL' }))).toEqual({
      status: 403, body: expect.objectContaining({ message: 'Only the person this count is assigned to, or a doctor or administrator, can cancel it.' }),
    });
    expect((await f.service.transition(anil, 'count', { version: 1, action: 'CANCEL' })).status).toBe('CANCELLED');
    f.add('other', 'COUNT', 0, { assigneeId: 'anil', lines: [{ id: 'other-line', inventoryId: 'batch', name: 'Isotroin 10', quantity: 0, systemStock: 10 }] });
    expect((await f.service.transition(doctor, 'other', { version: 1, action: 'CANCEL' })).status).toBe('CANCELLED');
    const { service } = await signed(7);
    expect(await failure(service.transition(doctor, 'count', { version: 2, action: 'CANCEL' }))).toEqual({
      status: 400, body: expect.objectContaining({ message: 'A signed count cannot be cancelled. A doctor or administrator rejects it from Stock counts › Approvals.' }),
    });
  });

  it('lets the only approver decide their own count once they confirm it', async () => {
    const { state, service } = await signed(7, doctor);
    state.users.find((u: any) => u.id === 'operator').isActive = false;
    expect(await failure(service.decideCount(doctor, 'count', 'APPROVE', { version: 2, requestKey: 'decide', reason: 'Fine' }))).toEqual({
      status: 400, body: { code: 'COUNT_SELF_APPROVAL_CONFIRM', message: 'You are the only approver in this branch. Confirm that you are deciding your own count.' },
    });
    const approved = await service.decideCount(doctor, 'count', 'APPROVE', { version: 2, requestKey: 'decide', reason: 'Fine', selfApproval: true });
    expect([approved.status, approved.payload.decision.selfApproval, state.events.at(-1).detail.selfApproval, state.item.currentStock]).toEqual(['POSTED', true, true, 7]);
  });
});
