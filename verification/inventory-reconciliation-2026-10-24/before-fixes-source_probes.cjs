const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '../..');
require(require.resolve('ts-node', { paths: [path.join(root, 'backend')] })).register({
  transpileOnly: true,
  project: path.join(root, 'backend/tsconfig.json'),
});
const { InventoryWorkflowService } = require(path.join(root, 'backend/src/modules/inventory/inventory-workflow.service.ts'));
const { movementDelta, writeStockMovement } = require(path.join(root, 'backend/src/modules/inventory/inventory-stock.ts'));
const owner = { id: 'verification-user', branchId: 'verification-branch', role: 'OWNER' };

/**
 * @cc [owner:nareshshah139,label:verification] isolated-source-fixture
 * This fixture MUST supply only in-memory data to real inventory service methods.
 * It MUST reject mismatched balance predicates and MUST NOT connect to a database.
 */
function fixture() {
  const state = {
    item: { id: 'batch', branchId: owner.branchId, currentStock: 10, heldStock: 0, costPrice: 1, unit: 'PIECE', status: 'ACTIVE', updatedAt: new Date('2026-10-24T00:00:00Z') },
    documents: [], effects: [], movements: [],
  };
  const tx = {
    inventoryItem: {
      findFirst: async ({ where }) => where.id === state.item.id && (!where.branchId || where.branchId === state.item.branchId) ? { ...state.item } : null,
      update: async ({ where, data }) => {
        for (const [key, value] of Object.entries(where)) {
          if (state.item[key] !== value) throw Object.assign(new Error('Predicate mismatch'), { code: 'P2025' });
        }
        Object.assign(state.item, data);
        return { ...state.item };
      },
    },
    stockTransaction: {
      create: async ({ data }) => {
        const row = { id: `movement-${state.movements.length}`, ...data };
        state.movements.push(row);
        return row;
      },
      findFirst: async ({ where }) => state.movements.find(row => row.id === where.id) || null,
      count: async () => state.movements.length,
    },
    inventoryWorkflowEffect: {
      findMany: async ({ where }) => state.effects.filter(row => row.documentId === where.documentId),
      create: async ({ data }) => {
        assert(!state.effects.some(row => row.effectKey === data.effectKey), 'Effect key must be unique');
        const row = { id: `effect-${state.effects.length}`, ...data };
        state.effects.push(row);
        return row;
      },
    },
    inventoryWorkflowDocument: {
      findFirst: async ({ where }) => state.documents.find(row => row.id === where.id) || null,
      findMany: async ({ where }) => state.documents
        .filter(row => row.id !== where.id.not && where.status.in.includes(row.status) && row.payload.sourceHoldId === where.payload.equals)
        .map(row => ({ ...row, effects: state.effects.filter(effect => effect.documentId === row.id) })),
      count: async ({ where }) => state.documents.filter(row => where.status.in.includes(row.status) && row.payload.sourceHoldId === where.payload.equals).length,
    },
  };
  return { state, tx, workflow: new InventoryWorkflowService({}) };
}

/**
 * @cc [owner:nareshshah139,label:verification] source-probe-results
 * A failed assertion MUST make the script fail. Expected domain errors count as evidence
 * only when their exact reason is checked and the relevant balances remain unchanged.
 */
async function main() {
  const results = [];
  {
    const { state, tx } = fixture();
    await writeStockMovement(tx, { branchId: owner.branchId, userId: owner.id, itemId: 'batch', delta: -3, type: 'ADJUSTMENT' });
    assert.equal(state.item.currentStock, 7);
    assert.equal(state.movements[0].quantityDelta, -3);
    await assert.rejects(() => writeStockMovement(tx, { branchId: owner.branchId, userId: owner.id, itemId: 'batch', delta: -8, type: 'SALE' }), /Insufficient available stock/);
    assert.equal(state.item.currentStock, 7);
    assert.equal(state.movements.length, 1);
    results.push({ status: 'PASS', claim: 'Real movement helper records signed deltas and rejects overdraft' });
  }
  {
    const { state, tx, workflow } = fixture();
    const count = { id: 'count', version: 1, kind: 'COUNT', status: 'POSTED', reference: 'COUNT', payload: { reason: 'Fixture physical count', lines: [{ id: 'count-line', inventoryId: 'batch', quantity: 0, physicalStock: 12, systemStock: 10, unitPrice: 1 }] } };
    await workflow.applyStockDocument(tx, owner, count, 'DRAFT');
    await workflow.applyStockDocument(tx, owner, count, 'DRAFT');
    assert.equal(state.item.currentStock, 12);
    assert.equal(state.movements.length, 1);
    assert.equal(state.effects.length, 1);
    results.push({ status: 'PASS', claim: 'Real COUNT effect calculation reaches the target and does not duplicate the same effect' });
  }
  {
    const { state, tx, workflow } = fixture();
    const count = { kind: 'COUNT', payload: { reason: 'Fixture', date: '2026-10-24', lines: [{ inventoryId: 'batch', quantity: 0, physicalStock: 7, systemStock: 9 }] } };
    await assert.rejects(() => workflow.validatePosting(tx, owner, count, {}), /stock changed since the count started/);
    assert.equal(state.item.currentStock, 10);
    assert.equal(state.effects.length, 0);
    results.push({ status: 'PASS', claim: 'Real posting validation rejects stale count snapshots' });
  }
  {
    const { state, tx, workflow } = fixture();
    state.item.heldStock = 5;
    const count = { id: 'count', version: 1, kind: 'COUNT', status: 'POSTED', reference: 'COUNT', payload: { reason: 'Fixture', lines: [{ id: 'count-line', inventoryId: 'batch', quantity: 0, physicalStock: 2, systemStock: 10, unitPrice: 1 }] } };
    await assert.rejects(() => workflow.applyStockDocument(tx, owner, count, 'DRAFT'), /Insufficient available stock/);
    assert.deepEqual([state.item.currentStock, state.item.heldStock, state.movements.length], [10, 5, 0]);
    results.push({ status: 'CONFIRMED_GUARD', claim: 'A count below held stock is blocked until holds are resolved' });
  }
  {
    const { state, tx, workflow } = fixture();
    const hold = { id: 'hold', version: 1, kind: 'HOLD', status: 'POSTED', reference: 'HOLD', payload: { reason: 'Fixture', lines: [{ id: 'hold-line', inventoryId: 'batch', quantity: 5, unitPrice: 1 }] } };
    state.documents.push(hold);
    await workflow.applyStockDocument(tx, owner, hold, 'DRAFT');
    assert.deepEqual([state.item.currentStock, state.item.heldStock], [10, 5]);
    const loss = { id: 'loss', version: 1, kind: 'LOSS', status: 'POSTED', reference: 'LOSS', payload: { reason: 'Fixture', sourceHoldId: hold.id, lines: [{ id: 'loss-line', inventoryId: 'batch', quantity: 3, unitPrice: 1 }] } };
    state.documents.push(loss);
    await workflow.applyStockDocument(tx, owner, loss, 'DRAFT');
    assert.deepEqual([state.item.currentStock, state.item.heldStock], [7, 2]);
    hold.status = 'RELEASED';
    hold.version += 1;
    await workflow.releaseHold(tx, owner, hold);
    assert.deepEqual([state.item.currentStock, state.item.heldStock], [7, 0]);
    await assert.rejects(() => workflow.reverse(tx, owner, loss, 'Undo mistaken loss'), /Select an active hold or quarantined return/);
    await assert.rejects(() => workflow.reverse(tx, owner, hold, 'Reopen source'), /Only a posted document can be reversed/);
    assert.deepEqual([state.item.currentStock, state.item.heldStock], [7, 0]);
    const count = { id: 'repair-count', version: 1, kind: 'COUNT', status: 'POSTED', reference: 'COUNT', payload: { reason: 'Goods found', lines: [{ id: 'repair-line', inventoryId: 'batch', quantity: 0, physicalStock: 10, systemStock: 7, unitPrice: 1 }] } };
    await workflow.applyStockDocument(tx, owner, count, 'DRAFT');
    assert.deepEqual([state.item.currentStock, state.item.heldStock], [10, 0]);
    assert.equal(loss.status, 'POSTED');
    results.push({ status: 'CONFIRMED_COUNTEREXAMPLE', claim: 'Releasing a partly consumed hold blocks its loss reversal; a fresh count repairs quantity but leaves loss provenance unchanged', trace: ['(q=10,h=0)', 'HOLD 5 -> (10,5)', 'LOSS 3 from hold -> (7,2)', 'RELEASE residual 2 -> (7,0)', 'REVERSE loss rejected', 'REVERSE released hold rejected', 'COUNT physical 10 -> (10,0); loss remains POSTED'] });
  }
  assert.equal(movementDelta({ type: 'ADJUSTMENT', quantity: 3, notes: '{}' }), null);
  results.push({ status: 'CONFIRMED_LIMIT', claim: 'An unsigned historical adjustment cannot reconstruct a signed ledger' });
  const output = { scope: 'Actual service methods with in-memory Prisma substitutes. No HTTP, real database, production data, or database concurrency test. Private helpers are exercised directly.', results };
  fs.writeFileSync(path.join(__dirname, 'source-results.json'), JSON.stringify(output, null, 2) + '\n');
  for (const row of results) process.stdout.write(`${row.status}\t${row.claim}\n`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
