#!/usr/bin/env node
const path = require('node:path'), assert = require('node:assert/strict'), fs = require('node:fs'), { randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '../..'), url = 'postgresql://invoice_review@127.0.0.1:55443/inventory_workflow_acceptance?schema=public';
process.env.DATABASE_URL = url;
require(root + '/node_modules/ts-node').register({ transpileOnly: true, project: root + '/backend/tsconfig.json' });
require('reflect-metadata');
const { PrismaClient } = require('@prisma/client');
const { InventoryWorkflowService } = require(root + '/backend/src/modules/inventory/inventory-workflow.service');
const { InventoryReplenishmentService } = require(root + '/backend/src/modules/inventory/inventory-replenishment.service');
const db = new PrismaClient({ datasourceUrl: url }), wf = new InventoryWorkflowService(db), rep = new InventoryReplenishmentService(db, wf), results = [];
const check = async (name, run) => { try { await run(); results.push({ name, status: 'PASS' }); } catch (e) { results.push({ name, status: 'FAIL', message: e.message.slice(-2000) }); } };
(async () => {
  const branch = await db.branch.create({ data: { name: 'Reorder gaps ' + randomUUID(), address: 'ISOLATED FIXTURES ONLY' } });
  const user = await db.user.create({ data: { branchId: branch.id, email: `target-${randomUUID()}@example.invalid`, firstName: 'Target', lastName: 'Reviewer', role: 'ADMIN', password: 'fixture-no-login', status: 'ACTIVE', isActive: true } });
  const doctor = await db.user.create({ data: { branchId: branch.id, email: `count-${randomUUID()}@example.invalid`, firstName: 'Count', lastName: 'Operator', role: 'DOCTOR', password: 'fixture-no-login', status: 'ACTIVE', isActive: true } });
  const actor = { id: user.id, branchId: branch.id, role: user.role }, staff = { id: doctor.id, branchId: branch.id, role: doctor.role };
  const make = name => db.inventoryItem.create({ data: { branchId: branch.id, name, type: 'CONSUMABLE', unit: 'PIECES', packSize: 10, packUnit: 'BOX', costPrice: 10, sellingPrice: 15, minStockLevel: 2, maxStockLevel: 8, reorderLevel: 3, currentStock: 2, heldStock: 1, metadata: JSON.stringify({ skuExtra: 'preserve', replenishmentSupplierId: 'saved-choice' }), status: 'ACTIVE' } });
  const a = await make('Target A'), b = await make('Target B');
  const saveSettings = async patch => wf.saveSettings(actor, { ...await wf.settings(actor), ...patch });
  const request = async (ids = [a.id, b.id]) => { const read = await rep.manualTargets(actor); return { settingsVersion: read.version, reason: 'Manager reviewed monthly demand', items: read.rows.filter(i => ids.includes(i.id)).map(i => ({ id: i.id, updatedAt: i.updatedAt.toISOString(), minStockLevel: 4, maxStockLevel: 12, reorderLevel: 5, manualTargets: true, excluded: i.id === b.id })) }; };
  const stock = async () => ({ items: (await db.inventoryItem.findMany({ where: { branchId: branch.id }, orderBy: { id: 'asc' } })).map(i => [i.id, i.currentStock, i.heldStock, i.costPrice, i.sellingPrice, i.unit, i.packSize, i.packUnit]), movements: await db.stockTransaction.count({ where: { branchId: branch.id } }) });
  await check('Whole bulk selection saves target/exclusion revisions and actor before/after history without stock or price effects', async () => {
    const before = await stock(), input = await request(), saved = await rep.saveManualTargets(actor, input); assert.equal(saved.updated, 2); assert.equal(saved.settingsVersion, input.settingsVersion + 1);
    const read = await rep.manualTargets(actor); assert.equal(read.rows.length, 2); assert.equal(read.rows.find(i => i.id === a.id).unit, 'PIECES');
    for (const row of read.rows) { assert.equal(row.minStockLevel, 4); assert.equal(row.maxStockLevel, 12); assert.equal(row.reorderLevel, 5); assert.equal(row.manualTargets, true); assert.equal(row.history.length, 1); assert.equal(row.history[0].before.minStockLevel, 2); assert.equal(row.history[0].after.minStockLevel, 4); assert.equal(row.history[0].after.reason, input.reason); assert.equal(row.history[0].actorId, user.id); }
    assert.equal(read.rows.find(i => i.id === b.id).excluded, true); assert.deepEqual(await stock(), before);
    for (const item of await db.inventoryItem.findMany({ where: { branchId: branch.id } })) { const meta = JSON.parse(item.metadata); assert.equal(meta.skuExtra, 'preserve'); assert.equal(meta.replenishmentSupplierId, 'saved-choice'); }
  });
  await check('Blank unconfigured levels remain null; manual and explicit exclusions survive a proposal refresh', async () => {
    const input = await request([b.id]); input.items[0].minStockLevel = ''; input.items[0].manualTargets = false; await rep.saveManualTargets(actor, input);
    const item = await db.inventoryItem.findUnique({ where: { id: b.id } }); assert.equal(item.minStockLevel, null);
    const proposal = await rep.proposeTargets(actor, {}); assert.equal(proposal.payload.lines.length, 0); assert.equal(proposal.payload.calculation.excluded.length, 2); assert.match(proposal.payload.calculation.excluded.find(i => i.inventoryId === a.id).reason, /Manual/); assert.match(proposal.payload.calculation.excluded.find(i => i.inventoryId === b.id).reason, /excluded/);
    const found = await rep.manualTargets(actor, { search: 'Target B' }); assert.equal(found.rows.length, 1); assert.equal(found.rows[0].id, b.id);
  });
  await check('One stale item rolls back the entire selection and creates no partial audit or settings revision', async () => {
    const input = await request(), before = await rep.manualTargets(actor), count = await db.auditLog.count({ where: { entityId: { in: [a.id, b.id] } } });
    input.items.find(i => i.id === a.id).maxStockLevel = 20;
    await db.inventoryItem.update({ where: { id: b.id }, data: { updatedAt: new Date(Date.now() + 1000) } });
    await assert.rejects(() => rep.saveManualTargets(actor, input), /details changed/);
    const after = await rep.manualTargets(actor); assert.equal(after.version, before.version); assert.equal(after.rows.find(i => i.id === a.id).maxStockLevel, before.rows.find(i => i.id === a.id).maxStockLevel); assert.equal(await db.auditLog.count({ where: { entityId: { in: [a.id, b.id] } } }), count);
  });
  await check('Stale configuration and invalid reason/units/min-max/duplicate rows are rejected without effects', async () => {
    const stale = await request(); await saveSettings({ includeBounce: true }); await assert.rejects(() => rep.saveManualTargets(actor, stale), /settings changed/);
    const before = await stock(), input = await request();
    for (const bad of [{ ...input, reason: '' }, { ...input, items: [input.items[0], input.items[0]] }, ...[-1, 1.2, true, ' ', undefined, 13].map(v => ({ ...input, items: [{ ...input.items[0], minStockLevel: v }] }))]) await assert.rejects(() => rep.saveManualTargets(actor, bad));
    assert.deepEqual(await stock(), before);
  });
  await check('Foreign branch and non-approver manual changes are rejected', async () => {
    const input = await request(); await assert.rejects(() => rep.saveManualTargets(staff, input), /manager/);
    const foreign = await db.branch.create({ data: { name: 'Target foreign ' + randomUUID(), address: 'ISOLATED FIXTURE' } }); await assert.rejects(() => rep.manualTargets({ ...actor, branchId: foreign.id }));
  });
  const countDraft = async (delta = 1) => { const item = await db.inventoryItem.findUnique({ where: { id: a.id } }); return wf.saveDocument(staff, { kind: 'COUNT', reference: 'count-' + randomUUID(), requestKey: randomUUID(), payload: { reason: 'One extra stock unit physically verified', lines: [{ inventoryId: a.id, quantity: 0, physicalStock: item.currentStock + delta }] } }); };
  await check('Approval policy holds a small positive staff count for manager approval without stock effects', async () => {
    await saveSettings({ auditAdjustmentMode: 'APPROVAL', approvalValue: 5000, negativeCountNeedsApproval: false });
    const draft = await countDraft(), before = await stock(), saved = await wf.transition(staff, draft.id, { version: draft.version, action: 'POST' }); assert.equal(saved.status, 'AWAITING_APPROVAL'); assert.deepEqual(await stock(), before);
    const approved = await wf.transition(actor, saved.id, { version: saved.version, action: 'APPROVE' }); const posted = await wf.transition(staff, approved.id, { version: approved.version, action: 'POST' }); assert.equal(posted.status, 'POSTED'); assert.equal((await db.inventoryItem.findUnique({ where: { id: a.id } })).currentStock, before.items.find(i => i[0] === a.id)[1] + 1);
  });
  await check('Approval policy posts a zero-variance count even when the threshold is zero', async () => {
    await saveSettings({ auditAdjustmentMode: 'APPROVAL', approvalValue: 0, negativeCountNeedsApproval: true }); const draft = await countDraft(0), before = await stock(); const saved = await wf.transition(staff, draft.id, { version: draft.version, action: 'POST' }); assert.equal(saved.status, 'POSTED'); assert.deepEqual(await stock(), before);
  });
  await check('Threshold policy allows a small positive staff count and rejects unsupported policy names', async () => {
    await saveSettings({ auditAdjustmentMode: 'THRESHOLD', approvalValue: 5000, negativeCountNeedsApproval: false }); const draft = await countDraft(); const saved = await wf.transition(staff, draft.id, { version: draft.version, action: 'POST' }); assert.equal(saved.status, 'POSTED'); await assert.rejects(() => saveSettings({ auditAdjustmentMode: 'SILENT' }), /mode/);
  });
  const result = { database: 'isolated local inventory_workflow_acceptance', branchId: branch.id, results }; fs.writeFileSync('/tmp/inventory-reorder-gaps-results.json', JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2)); console.log(`Reorder gaps DB: ${results.filter(r => r.status === 'PASS').length}/${results.length} PASS`); if (results.some(r => r.status === 'FAIL')) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
