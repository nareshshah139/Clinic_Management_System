const fs = require('node:fs');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');

function stable(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])]));
  return value;
}
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex'); }
function metadata(value) { return value ? JSON.parse(value) : {}; }
function aliases(value) { return Array.isArray(value?.aliases) ? value.aliases.filter(a => typeof a === 'string' && a.trim()) : []; }
function protectedFields(item) {
  const { name, metadata: rawMetadata, updatedAt, ...fields } = item;
  const { nameNormalization, ...meta } = metadata(rawMetadata);
  return { ...fields, metadata: meta, drugs: fields.drugs?.slice().sort((a, b) => a.id.localeCompare(b.id)) };
}
function makePlan(snapshot, rules, actorId) {
  const operationId = `inventory-names-${crypto.randomUUID()}`;
  const matched = new Set();
  const changes = [], groups = [];
  for (const rule of rules.groups) {
    const sourceNames = new Set([rule.name, ...rule.variants]);
    const rows = snapshot.items.filter(i => sourceNames.has(i.name));
    assert(rows.length, `No records for rule: ${rule.name}`);
    for (const name of rule.variants) assert(rows.some(i => i.name === name), `Unknown variant: ${name}`);
    groups.push({ ...rule, rows: rows.length, renamed: rows.filter(i => i.name !== rule.name).length });
    for (const row of rows) {
      assert.equal(row.branchId, snapshot.branchId);
      assert(!matched.has(row.id), `Row matched more than once: ${row.id}`);
      matched.add(row.id);
      const beforeMeta = metadata(row.metadata);
      const nameNormalization = {
        ...beforeMeta.nameNormalization,
        version: 1,
        operationId,
        aliases: [...new Set([...aliases(beforeMeta.nameNormalization), row.name, ...(row.drugs || []).map(d => d.name)])],
        reason: rule.reason,
        ...(rule.packHints?.[row.name] ? { sourcePackLabel: rule.packHints[row.name] } : {}),
      };
      changes.push({
        id: row.id, name: rule.name, expectedName: row.name, expectedMetadata: row.metadata,
        expectedUpdatedAt: new Date(row.updatedAt).toISOString(), protectedDigest: digest(protectedFields(row)),
        metadata: JSON.stringify({ ...beforeMeta, nameNormalization }),
        reason: rule.reason,
      });
    }
  }
  assert(changes.length && new Set(changes.map(c => c.id)).size === changes.length);
  return { version: 1, operationId, branchId: snapshot.branchId, actorId,
    sourceCheckedAt: snapshot.checkedAt, sourceDigest: digest(snapshot), rulesDigest: digest(rules),
    createdAt: new Date().toISOString(), groups, deferred: rules.deferred, changes };
}

/**
 * @cc [owner:nareshshah139,label:product] inventory-name-normalization-audit
 * A reviewed plan MUST change only inventory name, nameNormalization metadata and updatedAt.
 * Every row MUST compare its captured revision and commit an actor/reason/before-after audit
 * atomically. All stock, pack, cost, drug identities, relations and transaction history MUST
 * remain unchanged. Replaying an applied plan MUST be a no-op; a stale plan MUST roll back.
 */
async function applyPlan(db, plan, { rollback = false, failAfter = 0 } = {}) {
  assert.equal(plan.version, 1);
  assert(plan.actorId && plan.branchId && plan.operationId && plan.changes.length);
  assert.equal(new Set(plan.changes.map(c => c.id)).size, plan.changes.length);
  let result;
  const rollbackSentinel = new Error('REHEARSAL_ROLLBACK');
  try {
    return await db.$transaction(async tx => {
      const actor = await tx.user.findUnique({ where: { id: plan.actorId }, select: { id: true } });
      assert(actor, 'Audit actor not found');
      const before = await tx.inventoryItem.findMany({ where: { branchId: plan.branchId }, include: { drugs: true }, orderBy: { id: 'asc' } });
      const byId = new Map(before.map(i => [i.id, i]));
      const history = async () => ({
        transactions: await tx.stockTransaction.findMany({ where: { branchId: plan.branchId }, orderBy: { id: 'asc' } }),
        purchases: await tx.pharmacyPurchaseInvoice.findMany({ where: { branchId: plan.branchId }, include: { items: { orderBy: { id: 'asc' } } }, orderBy: { id: 'asc' } }),
      });
      const historyBefore = await history();
      let updated = 0, renamed = 0, alreadyApplied = 0;
      for (const change of plan.changes) {
        const item = byId.get(change.id);
        assert(item, 'Planned batch no longer exists in this branch');
        assert.equal(typeof change.name, 'string');
        assert(change.name.trim(), 'Empty product name');
        const nextMeta = metadata(change.metadata);
        assert.equal(nextMeta.nameNormalization?.operationId, plan.operationId);
        assert.equal(nextMeta.nameNormalization?.version, 1);
        const next = { ...item, name: change.name, metadata: change.metadata };
        assert.equal(digest(protectedFields(next)), digest(protectedFields(item)), 'Plan changes protected fields');
        assert(aliases(nextMeta.nameNormalization).includes(change.expectedName), 'Original name missing from aliases');
        if (item.name === change.name && item.metadata === change.metadata) { alreadyApplied++; continue; }
        assert.equal(item.name, change.expectedName, `Stale name: ${item.id}`);
        assert.equal(item.metadata, change.expectedMetadata, `Stale metadata: ${item.id}`);
        assert.equal(item.updatedAt.toISOString(), change.expectedUpdatedAt, `Stale revision: ${item.id}`);
        assert.equal(digest(protectedFields(item)), change.protectedDigest, `Protected data changed: ${item.id}`);
        await tx.inventoryItem.update({ where: { id: item.id, branchId: plan.branchId, updatedAt: item.updatedAt }, data: { name: change.name, metadata: change.metadata } });
        await tx.auditLog.create({ data: {
          userId: plan.actorId, action: 'INVENTORY_NAME_NORMALIZED', entity: 'InventoryItem', entityId: item.id,
          oldValues: JSON.stringify({ branchId: plan.branchId, name: item.name, metadata: item.metadata, updatedAt: item.updatedAt }),
          newValues: JSON.stringify({ branchId: plan.branchId, name: change.name, metadata: change.metadata, operationId: plan.operationId, reason: change.reason }),
        } });
        updated++; if (item.name !== change.name) renamed++;
        if (failAfter && updated >= failAfter) throw new Error('INJECTED_FAILURE');
      }
      const after = await tx.inventoryItem.findMany({ where: { branchId: plan.branchId }, include: { drugs: true }, orderBy: { id: 'asc' } });
      assert.equal(digest(after.map(protectedFields)), digest(before.map(protectedFields)), 'Protected inventory/drug data changed');
      assert.equal(digest(await history()), digest(historyBefore), 'Stock or purchase history changed');
      const plannedIds = new Set(plan.changes.map(c => c.id));
      assert.equal(digest(after.filter(i => !plannedIds.has(i.id))), digest(before.filter(i => !plannedIds.has(i.id))), 'Unplanned row changed');
      for (const change of plan.changes) {
        const saved = after.find(i => i.id === change.id);
        assert.equal(saved.name, change.name);
        assert.equal(saved.metadata, change.metadata);
      }
      const audit = await tx.auditLog.findMany({ where: { action: 'INVENTORY_NAME_NORMALIZED', newValues: { contains: plan.operationId } } });
      assert.equal(audit.length, plan.changes.length, 'Missing or duplicate name audit entries');
      result = { operationId: plan.operationId, updated, renamed, alreadyApplied, totalBatches: after.length,
        protectedInventoryDigest: digest(after.map(protectedFields)), historyDigest: digest(historyBefore),
        auditEntries: audit.length, rolledBack: rollback, checkedAt: new Date().toISOString() };
      if (rollback) throw rollbackSentinel;
      return result;
    }, { isolationLevel: 'Serializable', timeout: 120000, maxWait: 10000 });
  } catch (error) { if (error === rollbackSentinel) return result; throw error; }
}

async function main() {
  const [mode, inputPath, outputPath, actorId] = process.argv.slice(2);
  if (mode === 'plan') {
    const snapshot = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    const rules = JSON.parse(fs.readFileSync(path.join(__dirname, 'inventory-name-rules-20260916.json'), 'utf8'));
    const plan = makePlan(snapshot, rules, actorId);
    fs.writeFileSync(outputPath, JSON.stringify(plan, null, 2), { mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify({ groups: plan.groups.length, batches: plan.changes.length, renamed: plan.changes.filter(c => c.expectedName !== c.name).length, plan: outputPath }));
  } else if (mode === 'apply' || mode === 'rehearse') {
    assert(process.env.DATABASE_URL, 'DATABASE_URL is required');
    const { PrismaClient } = require('@prisma/client');
    const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
    try {
      const result = await applyPlan(db, JSON.parse(fs.readFileSync(inputPath, 'utf8')), { rollback: mode === 'rehearse' });
      if (outputPath) fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), { mode: 0o600, flag: 'wx' });
      console.log(JSON.stringify(result));
    } finally { await db.$disconnect(); }
  } else throw new Error('Usage: plan <snapshot> <new-plan> <actor-id> | rehearse/apply <plan> <new-result>');
}
module.exports = { makePlan, applyPlan, protectedFields, digest };
if (require.main === module) main().catch(error => {
  console.error(String(error.message).replace(/postgres(?:ql)?:\/\/\S+/g, '[redacted]')); process.exitCode = 1;
});
