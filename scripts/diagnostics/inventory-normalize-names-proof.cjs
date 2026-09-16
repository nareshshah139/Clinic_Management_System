// Local-only acceptance proof. Clone the backfill rehearsal DB into this dedicated database first.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const url = 'postgresql://invoice_review@127.0.0.1:55443/inventory_names_rehearsal_20260916';
const { PrismaClient } = require('@prisma/client');
const { makePlan, applyPlan, digest } = require('./inventory-normalize-names.cjs');
const rules = require('./inventory-name-rules-20260916.json');
require(root + '/node_modules/ts-node').register({ transpileOnly: true, project: root + '/backend/tsconfig.json' });
const { InventoryWorkspaceService } = require(root + '/backend/src/modules/inventory/inventory-workspace.service');
const db = new PrismaClient({ datasourceUrl: url });
const out = root + '/output/diagnostics/inventory-name-normalization-2026-09-16';
(async () => {
  const branchId = 'branch-seed-1', actorId = 'cmfr3pv6c0001agr0rh4t1hb7';
  const snapshot = { branchId, checkedAt: new Date().toISOString(), items: await db.inventoryItem.findMany({ where: { branchId }, include: { drugs: true } }) };
  const plan = makePlan(snapshot, rules, actorId);
  const fingerprint = async () => digest({
    items: await db.inventoryItem.findMany({ where: { branchId }, include: { drugs: true }, orderBy: { id: 'asc' } }),
    audits: await db.auditLog.count(),
  });
  const baseline = await fingerprint();
  await assert.rejects(() => applyPlan(db, plan, { failAfter: 7 }), /INJECTED_FAILURE/);
  assert.equal(await fingerprint(), baseline, 'Partial writes/audits survived injected failure');
  const stale = structuredClone(plan); stale.changes[8].expectedUpdatedAt = '2000-01-01T00:00:00.000Z';
  await assert.rejects(() => applyPlan(db, stale), /Stale revision/);
  assert.equal(await fingerprint(), baseline, 'Earlier rows survived stale revision rollback');
  const invalid = structuredClone(plan), invalidMeta = JSON.parse(invalid.changes[0].metadata);
  invalidMeta.sourceItemCode = 'DO-NOT-CHANGE'; invalid.changes[0].metadata = JSON.stringify(invalidMeta);
  await assert.rejects(() => applyPlan(db, invalid), /Plan changes protected fields/);
  assert.equal(await fingerprint(), baseline);
  const rehearsal = await applyPlan(db, plan, { rollback: true });
  assert.equal(await fingerprint(), baseline, 'Readback rehearsal did not roll back');
  const result = await applyPlan(db, plan);
  const appliedFingerprint = await fingerprint();
  const replay = await applyPlan(db, plan);
  assert.equal(replay.updated, 0); assert.equal(replay.alreadyApplied, plan.changes.length);
  assert.equal(await fingerprint(), appliedFingerprint, 'Replay changed a row or audit');
  const service = new InventoryWorkspaceService(db, { permissions: async () => new Set(['inventory:item:read']) });
  const actor = { id: actorId, branchId };
  let aliasChecks = 0, displayChecks = 0;
  for (const change of plan.changes) {
    const result = await service.stock(actor, { search: change.expectedName, limit: '100' });
    assert(result.rows.some(i => i.id === change.id), `Old name no longer searchable: ${change.expectedName}`); aliasChecks++;
    const row = (await service.stock(actor, { search: 'inventory:' + change.id })).rows[0];
    const original = snapshot.items.find(i => i.id === change.id);
    const loose = original.drugs.length === 1 ? original.drugs[0].name.match(/ \(loose (?:tablets|capsules)\)$/i)?.[0] || '' : '';
    assert.equal(row.productName, change.name + loose); displayChecks++;
    assert.equal(row.currentStock, original.currentStock);
    assert.equal(row.unit, original.unit);
  }
  const summary = { status: 'PASS', checkedAt: new Date().toISOString(), database: 'isolated local inventory_names_rehearsal_20260916',
    result, rollbackReadback: rehearsal.rolledBack, injectedFailureAtomic: true, staleRevisionAtomic: true,
    unrelatedMetadataRejected: true, replayNoOp: true, aliasChecks, displayChecks };
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(out + '/local-proof.json', JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary));
})().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => db.$disconnect());
