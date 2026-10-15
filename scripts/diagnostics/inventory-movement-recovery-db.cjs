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
  for (const row of results) console.log([row.result, row.name, row.message || ''].join('\t'));
  if (results.some(row => row.result !== 'PASS')) process.exitCode = 1;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
