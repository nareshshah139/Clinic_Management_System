import { InventoryWorkflowService } from '../inventory-workflow.service';
import { DEFAULT_INVENTORY_SETTINGS } from '../inventory-workflow.types';
import { InventoryImportService } from '../inventory-import.service';
import { PharmacyPurchaseInvoiceService } from '../../pharmacy/pharmacy-purchase-invoice.service';
import { reconcileInventoryLedger } from '../inventory-ledger';
import { InventoryIdentityRecoveryService } from '../inventory-identity-recovery.service';

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
  };
  const matches = (row: any, where: any = {}) => Object.entries(where).every(([key, value]: [string, any]) => {
    if (key === 'branchId_requestKey') return matches(row, value);
    if (key === 'payload') return row.payload?.[value.path[0]] === value.equals;
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
    inventoryWorkflowEvent: table('events'), stockTransaction: table('movements'), inventoryAudit: table('audits'),
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
  jest.spyOn(service, 'permissions').mockResolvedValue(new Set(['*']));
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

  it('records direct manager approval and a physical ledger baseline even for a zero-delta count', async () => {
    const { state, service, add } = fixture();
    state.movements.push({ id: 'legacy', branchId: 'branch', itemId: 'batch', type: 'ADJUSTMENT', quantity: 2 });
    add('count', 'COUNT', 0, { lines: [{ id: 'count-line', inventoryId: 'batch', quantity: 0, unitPrice: 1, systemStock: 10, physicalStock: 10 }] });
    await service.transition(actor, 'count', { version: 1, action: 'POST' });
    expect(state.documents.find((d: any) => d.id === 'count').approvedBy).toBe('operator');
    expect(JSON.parse(state.item.metadata).ledgerCheckpoint).toMatchObject({ quantity: 10, coveredMovementIds: ['legacy'], documentId: 'count', actorId: 'operator' });
    expect(state.audits[0].physicalStock).toBe(10);
    expect(state.movements).toHaveLength(1);
    expect(reconcileInventoryLedger(state.item, state.movements).status).toBe('RECONCILED');
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

  it('posts a nonzero count with its own movement inside the baseline, then detects later drift', async () => {
    const { state, service, add } = fixture();
    add('count', 'COUNT', 0, { lines: [{ id: 'line', inventoryId: 'batch', quantity: 0, unitPrice: 1, systemStock: 10, physicalStock: 7 }] });
    await service.transition(actor, 'count', { version: 1, action: 'POST' });
    expect(state.item.currentStock).toBe(7);
    expect(reconcileInventoryLedger(state.item, state.movements)).toMatchObject({ expectedStock: 7, difference: 0 });
    state.item.currentStock = 6;
    expect(reconcileInventoryLedger(state.item, state.movements)).toMatchObject({ expectedStock: 7, difference: -1 });
  });

  it('reconciles physical stock below held stock through a verified source loss and fresh count', async () => {
    const { state, service, add } = fixture();
    add('hold', 'HOLD', 5);
    await service.transition(actor, 'hold', { version: 1, action: 'POST' });
    add('blocked-count', 'COUNT', 0, { lines: [{ id: 'line', inventoryId: 'batch', quantity: 0, unitPrice: 1, systemStock: 10, physicalStock: 2 }] });
    await expect(service.transition(actor, 'blocked-count', { version: 1, action: 'POST' })).rejects.toThrow();
    expect([state.item.currentStock, state.item.heldStock]).toEqual([10, 5]);
    add('missing-held-goods', 'LOSS', 3, { sourceHoldId: 'hold' });
    await service.transition(actor, 'missing-held-goods', { version: 1, action: 'POST' });
    const fresh = await service.transition(actor, 'blocked-count', { version: 1, action: 'RECOUNT' });
    expect(fresh.payload.lines[0].systemStock).toBe(7);
    // Record the new physical observation through the public save route.
    const observed = await service.saveDocument(actor, {
      kind: 'COUNT', version: fresh.version, reference: fresh.reference, requestKey: fresh.requestKey,
      payload: { ...fresh.payload, lines: fresh.payload.lines.map((l: any) => ({ ...l, physicalStock: 2 })) },
    }, fresh.id);
    await service.transition(actor, fresh.id, { version: observed.version, action: 'POST' });
    expect([state.item.currentStock, state.item.heldStock]).toEqual([2, 2]);
    expect(reconcileInventoryLedger(state.item, state.movements)).toMatchObject({ status: 'RECONCILED', expectedStock: 2 });
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

  it.each(['DRAFT', 'AWAITING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED', 'POSTED', 'REVERSED'])('starts a fresh uncounted attempt from %s without reusing stale measurements', async (status) => {
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
  it('names the protected batch balances when a real count is below held stock', async () => {
    const {state, service, add}=fixture();
    add('hold','HOLD',5); await service.transition(actor,'hold',{version:1,action:'POST'});
    add('count','COUNT',0,{lines:[{id:'observed',inventoryId:'batch',quantity:0,unitPrice:1,systemStock:10,physicalStock:2}]});
    const body=await rejectedResponse(service.transition(actor,'count',{version:1,action:'POST'}));
    expect(body).toMatchObject({code:'INVENTORY_HELD_STOCK',stockEffect:'NONE',recovery:{action:'REVIEW_BATCH',inventoryId:'batch',quantities:{onHand:10,held:5,available:5,requested:8}}});
    expect(body.message).toContain('Do not change the physical observation');
    expect([state.item.currentStock,state.item.heldStock,state.movements.length]).toEqual([10,5,0]);
  });
  it('identifies a stale count row and requires a fresh physical observation',async()=>{
    const {state,service,add}=fixture();
    add('count','COUNT',0,{lines:[{id:'observed',inventoryId:'batch',quantity:0,unitPrice:1,systemStock:9,physicalStock:2}]});
    const body=await rejectedResponse(service.transition(actor,'count',{version:1,action:'POST'}));
    expect(body).toMatchObject({code:'INVENTORY_STALE_COUNT',stockEffect:'NONE',recovery:{action:'START_FRESH_COUNT',inventoryId:'batch',quantities:{onHand:10}}});
    expect(body.message).toContain('Start fresh count');
    expect(state.movements).toEqual([]);
  });
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
    expect(body).toMatchObject({code:'INVENTORY_SOURCE_INCONSISTENT',stockEffect:'NONE',recovery:{action:'REVIEW_SOURCE',inventoryId:'batch',sourceId:'hold',sourceKind:'HOLD',quantities:{remaining:-2}}});
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
