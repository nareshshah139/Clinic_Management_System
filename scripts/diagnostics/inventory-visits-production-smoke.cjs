const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const bcrypt = require('bcryptjs');
const { connect, snapshot } = require('./inventory-visits-production-preservation.cjs');
const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'output/inventory-visits-repair');
const local = process.argv.includes('--local-rehearsal');
const session = local ? JSON.parse(fs.readFileSync(path.join(output, 'local-session.json'))) : null;
if (local) {
  assert(session.syntheticOnly && session.ready && !session.stopped);
  assert.match(session.databaseUrl, /^postgresql:\/\/nshah@127\.0\.0\.1:55457\/pstack_acceptance_[a-f0-9]{32}$/);
}
const origin = local ? 'http://localhost:3002' : 'https://frontend-production-703e.up.railway.app';
const branchId = 'pstack-release-' + randomUUID();
const users = [];
const entities = new Set([branchId]);
const report = { checkedAt: new Date().toISOString(), normalAuthentication: true, environment: local ? 'local rehearsal' : 'Railway production', syntheticBranch: branchId, checks: [] };
let db, created = false;
const tokens = {};
const request = async (actor, method, route, body) => {
  const response = await fetch(origin + '/api' + route, { method, headers: { 'Content-Type': 'application/json', ...(actor ? { Authorization: 'Bearer ' + tokens[actor] } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  const data = await response.json();
  return { status: response.status, data };
};
const ok = async promise => { const result = await promise; assert(result.status >= 200 && result.status < 300, `Unexpected HTTP status ${result.status}`); return result.data; };
/**
 * @cc [owner:nareshshah139,label:safety] synthetic-production-smoke
 * Production smoke requires --run and a verified native backup. It writes only a newly created
 * uniquely named synthetic branch, authenticates normally, and removes only its exact owned rows.
 * Original table fingerprints must match after cleanup; credentials are never emitted.
 */
async function main() {
  assert(local || process.argv.includes('--run'));
  if (!local) {
    const backup = JSON.parse(fs.readFileSync(path.join(output, 'railway-snapshot.json')));
    assert.equal(backup.outcome, 'VERIFIED');
    assert.equal(backup.projectId, '0806df25-906b-48f3-ab72-fa0650431661');
    db = connect();
  } else db = new (require('@prisma/client').PrismaClient)({ datasourceUrl: session.databaseUrl });
  const before = await snapshot(db, true);
  try {
    await db.branch.create({ data: { id: branchId, name: 'Synthetic release acceptance ' + branchId, address: 'Temporary release test only' } });
    created = true;
    const password = 'Synthetic-' + randomUUID();
    const hash = await bcrypt.hash(password, 10);
    for (const [name, role] of [['doctor', 'DOCTOR'], ['pharmacist', 'PHARMACIST']]) {
      const user = await db.user.create({ data: { email: `${randomUUID()}@example.invalid`, password: hash, firstName: 'Synthetic', lastName: 'Release test', branchId, role, status: 'ACTIVE', isActive: true, permissions: JSON.stringify(['pharmacy:invoice:create', 'pharmacy:invoice:update', 'pharmacy:invoice:read', 'pharmacy:invoice:payment:add', 'inventory:item:read']) } });
      users.push(user.id);
      entities.add(user.id);
      tokens[name] = (await ok(request(null, 'POST', '/auth/login', { identifier: user.email, password }))).access_token;
      assert.equal((await ok(request(name, 'GET', '/auth/me'))).branchId, branchId);
    }
    const patient = await db.patient.create({ data: { name: 'Synthetic release patient', age: 30, gender: 'FEMALE', phone: '0000000000', branchId } });
    const item = await db.inventoryItem.create({ data: { branchId, name: 'Synthetic release cream', type: 'MEDICINE', unit: 'PIECES', costPrice: 10, sellingPrice: 50, mrp: 50, gstRate: 0, packSize: 1, packUnit: 'piece', currentStock: 10, heldStock: 2, status: 'ACTIVE', stockStatus: 'IN_STOCK', batchNumber: 'SYNTHETIC-ONLY', expiryDate: new Date('2099-12-31') } });
    const drug = await db.drug.create({ data: { branchId, name: item.name, price: 50, manufacturerName: 'Synthetic', packSizeLabel: '1 piece', inventoryItems: { connect: { id: item.id } } } });
    entities.add(patient.id);
    entities.add(item.id);
    entities.add(drug.id);
    const sequence = await db.numberSequence.create({ data: { type: 'PHARMACY', branchId, periodKey: String(new Date().getFullYear()), lastNumber: 900000000 } });
    entities.add(sequence.id);
    const visit = await ok(request('doctor', 'POST', '/visits', { patientId: patient.id, doctorId: users[0], complaints: [{ complaint: 'Synthetic release check' }], vitals: { heartRate: 80, weight: 60 } }));
    entities.add(visit.id);
    await ok(request('doctor', 'PATCH', '/visits/' + visit.id, { version: visit.version, vitals: { heartRate: null } }));
    const saved = await ok(request('doctor', 'GET', '/visits/' + visit.id));
    assert(saved.vitals.heartRate == null);
    assert.equal(saved.vitals.weight, 60);
    await ok(request('doctor', 'POST', `/visits/${visit.id}/complete`, { version: saved.version }));
    assert.equal((await ok(request('doctor', 'GET', '/visits/' + visit.id))).status, 'COMPLETED');
    report.checks.push('Clinical clear and walk-in completion persist through the public frontend proxy');
    const payload = { patientId: patient.id, doctorId: users[0], paymentMethod: 'CASH', billingName: patient.name, billingPhone: patient.phone, items: [{ itemType: 'DRUG', drugId: drug.id, inventoryItemId: item.id, quantity: 2, unitPrice: 50, taxPercent: 0 }], requestKey: randomUUID() };
    const invoice = await ok(request('pharmacist', 'POST', '/pharmacy/invoices/checkout', payload));
    entities.add(invoice.id);
    const replay = await ok(request('pharmacist', 'POST', '/pharmacy/invoices/checkout', payload));
    assert.equal(replay.id, invoice.id);
    assert.equal(invoice.status, 'CONFIRMED');
    const stock = await db.inventoryItem.findUniqueOrThrow({ where: { id: item.id } });
    assert.equal(stock.currentStock, 8);
    assert.equal(stock.heldStock, 2);
    const payment = { amount: 60, method: 'CASH', requestKey: randomUUID() };
    const receipt = await ok(request('pharmacist', 'POST', `/pharmacy/invoices/${invoice.id}/payments`, payment));
    entities.add(receipt.id);
    assert.equal((await ok(request('pharmacist', 'POST', `/pharmacy/invoices/${invoice.id}/payments`, payment))).id, receipt.id);
    const paid = await db.pharmacyInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
    assert.equal(paid.paidAmount, 60);
    assert.equal(paid.balanceAmount, 40);
    report.checks.push('Checkout and payment retries produce one invoice, one sale and one receipt');
    const queueBefore = await db.pharmacyDispenseTask.findMany({ where: { branchId } });
    const queue = await ok(request('pharmacist', 'GET', '/pharmacy/prescription-queue?limit=1'));
    assert(Array.isArray(queue.data), 'Queue response must contain an array');
    assert.equal(queue.data.length, 0, 'Synthetic empty branch returned queue entries');
    assert.equal(queue.pagination.total, 0);
    assert.equal(JSON.stringify(await db.pharmacyDispenseTask.findMany({ where: { branchId } })), JSON.stringify(queueBefore), 'Synthetic queue read mutated tasks');
    await ok(request('doctor', 'DELETE', '/visits/' + visit.id));
    assert.equal((await request('doctor', 'GET', '/visits/' + visit.id)).status, 404);
    report.checks.push('Readonly queue and durable deletion execute on the deployed backend');
  } finally {
    if (created) await db.$transaction(async tx => {
      const branch = await tx.branch.findUniqueOrThrow({ where: { id: branchId } });
      assert.equal(branch.name, 'Synthetic release acceptance ' + branchId);
      for (const row of await tx.stockTransaction.findMany({ where: { branchId }, select: { id: true } })) entities.add(row.id);
      for (const row of await tx.pharmacyInvoiceItem.findMany({ where: { invoice: { branchId } }, select: { id: true } })) entities.add(row.id);
      await tx.pharmacyDispenseTask.deleteMany({ where: { branchId } });
      await tx.pharmacyInvoice.deleteMany({ where: { branchId } });
      await tx.stockTransaction.deleteMany({ where: { branchId } });
      await tx.stockMovement.deleteMany({ where: { branchId } });
      await tx.visit.deleteMany({ where: { patient: { branchId } } });
      await tx.patient.deleteMany({ where: { branchId } });
      await tx.inventoryItem.deleteMany({ where: { branchId } });
      await tx.drug.deleteMany({ where: { branchId } });
      await tx.idempotencyRecord.deleteMany({ where: { userId: { in: users } } });
      await tx.auditLog.deleteMany({ where: { OR: [{ userId: { in: users } }, { entityId: { in: [...entities] } }] } });
      await tx.numberSequence.deleteMany({ where: { branchId } });
      await tx.user.deleteMany({ where: { id: { in: users }, branchId } });
      await tx.branch.delete({ where: { id: branchId } });
    }, { timeout: 30000 });
    report.syntheticRemoved = created && !(await db.branch.findUnique({ where: { id: branchId } }));
    const after = await snapshot(db, true);
    report.originalTablesUnchanged = JSON.stringify(before) === JSON.stringify(after);
    assert(report.syntheticRemoved);
    assert(report.originalTablesUnchanged, 'Original records changed during smoke; inspect before claiming preservation');
  }
  report.outcome = 'VERIFIED';
}
main().catch(error => { report.outcome = 'NOT VERIFIED'; report.error = String(error.message).replace(/postgres(?:ql)?:\/\/[^\s]+/g, '[redacted]'); process.exitCode = 1; }).finally(async () => { await db?.$disconnect(); fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(path.join(output, local ? 'production-smoke-rehearsal.json' : 'production-smoke.json'), JSON.stringify(report, null, 2), { mode: 0o600 }); console.log(JSON.stringify(report, null, 2)); });
