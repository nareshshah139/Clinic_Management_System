const assert = require('node:assert/strict');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const databaseUrl = process.env.RECOVERY_DATABASE_URL;
const url = new URL(databaseUrl || 'file:///missing');
assert.equal(url.hostname, '127.0.0.1', 'Use an isolated localhost database');
assert.match(url.pathname, /^\/clinic_recovery(?:_[a-z0-9_]+)?$/);
process.env.DATABASE_URL = databaseUrl;
require(root + '/node_modules/ts-node').register({ transpileOnly: true, project: root + '/backend/tsconfig.json' });
const { PrismaClient } = require(process.env.RECOVERY_PRISMA_CLIENT || '@prisma/client');
const { InventoryService } = require(root + '/backend/src/modules/inventory/inventory.service');
const db = new PrismaClient({ datasourceUrl: databaseUrl });
const service = new InventoryService(db);
const results = [];
const check = async (name, run) => {
  try { await run(); results.push({ name, result: 'PASS' }); }
  catch (error) { results.push({ name, result: 'FAIL', message: error.message }); }
};

/**
 * @cc [owner:nareshshah139,label:safety] movement-recovery-local-proof
 * This probe writes synthetic fixtures only after validating a localhost recovery database URL.
 */
async function main() {
  const branch = await db.branch.create({ data: { name: 'Synthetic recovery ' + randomUUID(), address: 'LOCAL TEST' } });
  const user = await db.user.create({ data: { branchId: branch.id, email: randomUUID() + '@example.invalid', firstName: 'Recovery', lastName: 'Test', role: 'ADMIN', password: 'LOCAL-NONLOGIN', status: 'ACTIVE' } });
  const item = await db.inventoryItem.create({ data: { branchId: branch.id, name: 'Synthetic stock', type: 'MEDICINE', unit: 'PIECES', currentStock: 100, costPrice: 1, sellingPrice: 2, mrp: 2, minStockLevel: 0, maxStockLevel: 200, status: 'ACTIVE', stockStatus: 'IN_STOCK' } });
  const input = { itemId: item.id, adjustmentQuantity: 2, reason: 'Synthetic recovery proof', operationId: randomUUID() };
  const first = await service.adjustStock(input, branch.id, user.id);
  const replay = await service.adjustStock(input, branch.id, user.id);
  await check('lost response replay returns the original movement', async () => assert.equal(replay.id, first.id));
  await check('replay applies quantity once', async () => assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: item.id } })).currentStock, 102));
  await check('concurrent identical retries have one effect', async () => {
    const data = { ...input, operationId: randomUUID(), adjustmentQuantity: 3 };
    const replies = await Promise.all([service.adjustStock(data, branch.id, user.id), service.adjustStock(data, branch.id, user.id)]);
    assert.equal(replies[0].id, replies[1].id);
    assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: item.id } })).currentStock, 105);
  });
  await check('changed payload under the same operation conflicts', async () => {
    await assert.rejects(service.adjustStock({ ...input, adjustmentQuantity: 8 }, branch.id, user.id), /different stock changes/);
    assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: item.id } })).currentStock, 105);
  });
  await check('bulk failure and filtered retry preserve successful rows', async () => {
    const operationId = randomUUID();
    const transactions = [
      { rowId: 'first', itemId: item.id, type: 'SALE', quantity: 2 },
      { rowId: 'second', itemId: item.id, type: 'SALE', quantity: 1000 },
    ];
    const partial = await service.bulkStockUpdate({ operationId, transactions }, branch.id, user.id);
    assert.equal(partial.successful, 1); assert.equal(partial.failed, 1);
    const outcome = await service.stockOperationOutcome(operationId, branch.id);
    assert.deepEqual(outcome.rows.map(row => row.status), ['COMPLETED', 'UNKNOWN']);
    assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: item.id } })).currentStock, 103);
    await db.inventoryItem.update({ where: { id: item.id }, data: { currentStock: { increment: 2000 } } });
    const retried = await service.bulkStockUpdate({ operationId, transactions: [transactions[1]] }, branch.id, user.id);
    assert.equal(retried.successful, 1);
    const replayed = await service.bulkStockUpdate({ operationId, transactions: [...transactions].reverse() }, branch.id, user.id);
    assert.equal(replayed.successful, 2);
    assert.equal(replayed.results.find(row => row.rowId === 'first').data.id, partial.results[0].data.id);
    assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: item.id } })).currentStock, 1103);
    assert.equal((await service.stockOperationOutcome(operationId, branch.id)).status, 'COMPLETED');
    await assert.rejects(service.bulkStockUpdate({ operationId, transactions: [{ ...transactions[0], rowId: 'extra' }] }, branch.id, user.id), /different stock changes/);
  });
  await check('duplicate row IDs reject before any effect', async () => {
    const before = await db.stockTransaction.count({ where: { branchId: branch.id } });
    await assert.rejects(service.bulkStockUpdate({ operationId: randomUUID(), transactions: [1, 2].map(quantity => ({ rowId: 'same', itemId: item.id, type: 'SALE', quantity })) }, branch.id, user.id), /distinct stable row ID/);
    assert.equal(await db.stockTransaction.count({ where: { branchId: branch.id } }), before);
  });
  await check('receipt failure rolls back movement and balance, allowing safe retry', async () => {
    const data = { ...input, operationId: randomUUID() };
    const before = (await db.inventoryItem.findUniqueOrThrow({ where: { id: item.id } })).currentStock;
    const failing = new InventoryService({ inventoryStockOperation: db.inventoryStockOperation, stockTransaction: db.stockTransaction,
      $transaction: (run, options) => db.$transaction(tx => run(new Proxy(tx, { get(target, key) {
        if (key === 'stockTransaction') return new Proxy(tx.stockTransaction, { get(delegate, method) {
          if (method === 'update') return async () => { throw Error('Injected receipt failure'); };
          return delegate[method];
        } });
        return target[key];
      } })), options) });
    await assert.rejects(failing.adjustStock(data, branch.id, user.id), /Injected receipt failure/);
    assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: item.id } })).currentStock, before);
    assert.equal((await service.stockOperationOutcome(data.operationId, branch.id)).rows[0].status, 'UNKNOWN');
    await service.adjustStock(data, branch.id, user.id);
    assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: item.id } })).currentStock, before + 2);
  });
  await check('unknown and cross-branch outcomes expose no saved movement', async () => {
    const other = await db.branch.create({ data: { name: 'Synthetic other branch', address: 'LOCAL TEST' } });
    assert.deepEqual(await service.stockOperationOutcome(input.operationId, other.id), { operationId: input.operationId, status: 'UNKNOWN', rows: [] });
    await assert.rejects(service.adjustStock({ ...input, operationId: randomUUID() }, other.id, user.id), /not found in this branch/);
  });
  await check('unkeyed mutations fail before stock writes', async () => {
    await assert.rejects(service.adjustStock({ ...input, operationId: undefined }, branch.id, user.id), /Operation ID/);
  });
  for (const row of results) console.log([row.result, row.name, row.message || ''].join('\t'));
  if (results.some(row => row.result !== 'PASS')) process.exitCode = 1;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
