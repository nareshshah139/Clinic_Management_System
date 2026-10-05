const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const sharp = require('sharp');
const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'output/inventory-visits-repair');
const session = JSON.parse(fs.readFileSync(path.join(output, 'local-session.json'), 'utf8'));
assert.equal(session.syntheticOnly, true);
assert.equal(session.ready, true);
assert(!session.stopped);
assert.match(session.databaseUrl, /^postgresql:\/\/nshah@127\.0\.0\.1:55457\/pstack_acceptance_[a-f0-9]{32}$/);
assert.equal(session.frontend, 'http://localhost:3002');
const f = session.fixture;
const db = new PrismaClient({ datasourceUrl: session.databaseUrl });
const auth = {};
const checks = [];
const report = { checkedAt: new Date().toISOString(), normalAuthentication: true, syntheticOnly: true, build: session.build, checks };
const key = () => randomUUID();
const request = async (actor, method, route, body, extraHeaders = {}) => {
  const headers = { ...extraHeaders };
  if (actor) headers.Authorization = `Bearer ${auth[actor]}`;
  if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const response = await fetch(session.frontend + '/api' + route, { method, headers, body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data };
};
const ok = async promise => { const result = await promise; assert(result.status >= 200 && result.status < 300, JSON.stringify(result)); return result.data; };
const check = async (name, action) => { await action(); checks.push({ name, outcome: 'VERIFIED' }); };
const visit = async () => {
  const patient = await db.patient.create({ data: { name: 'Synthetic HTTP patient', gender: 'FEMALE', phone: '0000000000', branchId: f.branchId } });
  return ok(request('doctor', 'POST', '/visits', { patientId: patient.id, doctorId: f.users.doctor.id, complaints: [{ complaint: 'Synthetic HTTP rash' }] }, { 'Idempotency-Key': key() }));
};
const invoicePayload = (patientId = f.patientId) => ({ patientId, doctorId: f.users.doctor.id, paymentMethod: 'CASH', billingName: 'Synthetic HTTP patient', billingPhone: '0000000000', items: [{ itemType: 'DRUG', drugId: f.drugId, inventoryItemId: f.inventoryItemId, quantity: 2, unitPrice: 50, taxPercent: 0 }] });

/**
 * @cc [owner:nareshshah139,label:safety] normal-auth-local-acceptance
 * Mutating HTTP acceptance requires the generated localhost synthetic session and real login;
 * guards cannot be overridden, and a failing check must produce a nonzero exit status.
 */
async function main() {
  for (const [actor, user] of Object.entries(f.users)) {
    const result = await ok(request(null, 'POST', '/auth/login', { identifier: user.email, password: f.password }));
    auth[actor] = result.access_token;
  }
  await check('Authentication and pharmacist permission guards execute', async () => {
    assert.equal((await request(null, 'GET', '/visits')).status, 401);
    assert.equal((await request('nurse', 'POST', '/pharmacy/invoices/checkout', { ...invoicePayload(), requestKey: key() })).status, 403);
    assert.equal((await request('restrictedPharmacist', 'POST', '/pharmacy/invoices/checkout', { ...invoicePayload(), requestKey: key() })).status, 403);
    assert.equal((await ok(request('doctor', 'GET', '/auth/me'))).branchId, f.branchId);
  });
  await check('Explicit clinical clears survive HTTP validation and saved reload', async () => {
    const before = await ok(request('doctor', 'GET', '/visits/' + f.visitId));
    await ok(request('doctor', 'PATCH', '/visits/' + f.visitId, { version: before.version, history: { pastHistory: '' }, diagnosis: [], vitals: { heartRate: null }, treatmentPlan: { followUpInstructions: '', followUpDate: null, investigations: [] } }, { 'Idempotency-Key': key() }));
    const saved = await ok(request('doctor', 'GET', '/visits/' + f.visitId));
    assert.deepEqual(saved.diagnosis, []);
    assert.equal(saved.history.pastHistory, '');
    assert.equal(saved.history.familyHistory, 'Keep this family history');
    assert(saved.vitals.heartRate == null);
    assert.equal(saved.vitals.weight, 60);
    assert.equal(saved.plan.followUpInstructions, '');
    assert.deepEqual(saved.plan.investigations, []);
    assert.equal(saved.followUp, null);
    assert.equal((await request('doctor', 'PATCH', '/visits/' + f.visitId, { version: before.version, history: { pastHistory: 'stale' } }, { 'Idempotency-Key': key() })).status, 409);
  });
  await check('Walk-in completion persists and repeats without changing completion time', async () => {
    const created = await visit();
    await ok(request('doctor', 'POST', `/visits/${created.id}/complete`, { version: created.version }, { 'Idempotency-Key': key() }));
    const completed = await ok(request('doctor', 'GET', '/visits/' + created.id));
    assert.equal(completed.status, 'COMPLETED');
    assert(completed.completedAt);
    await ok(request('doctor', 'POST', `/visits/${created.id}/complete`, {}, { 'Idempotency-Key': key() }));
    const repeated = await ok(request('doctor', 'GET', '/visits/' + created.id));
    assert.equal(repeated.completedAt, completed.completedAt);
    const history = await ok(request('doctor', 'GET', `/visits/patient/${created.patientId}/history`));
    assert.equal(history.visits.find(row => row.id === created.id).status, 'COMPLETED');
  });
  await check('Deleted visits disappear from normal lists, history and detail', async () => {
    const created = await visit();
    await ok(request('doctor', 'DELETE', '/visits/' + created.id));
    assert.equal((await request('doctor', 'GET', '/visits/' + created.id)).status, 404);
    const list = await ok(request('doctor', 'GET', '/visits?patientId=' + created.patientId));
    const history = await ok(request('doctor', 'GET', `/visits/patient/${created.patientId}/history`));
    assert(!list.visits.some(row => row.id === created.id));
    assert(!history.visits.some(row => row.id === created.id));
    const patient = await ok(request('doctor', 'GET', '/patients/' + created.patientId));
    assert(!patient.visits.some(row => row.id === created.id));
  });
  await check('Every draft-photo route rejects another branch without altering its photo', async () => {
    const bytes = await sharp({ create: { width: 8, height: 8, channels: 3, background: 'white' } }).png().toBuffer();
    const upload = () => { const form = new FormData(); form.append('files', new Blob([bytes], { type: 'image/png' }), 'synthetic.png'); return form; };
    const photos = await ok(request('foreignDoctor', 'POST', '/visits/photos/draft/' + f.foreignPatientId, upload()));
    assert(photos.items.length >= 1);
    const binaryPath = new URL(photos.items.at(-1).url, session.backend).pathname.replace(/^\/api/, '');
    for (const route of ['/visits/photos/draft/' + f.foreignPatientId, '/visits/photos/draft/' + f.foreignPatientId + '?allDates=true', binaryPath]) {
      assert([403, 404].includes((await request('doctor', 'GET', route)).status));
    }
    assert([403, 404].includes((await request('doctor', 'DELETE', binaryPath)).status));
    assert([403, 404].includes((await request('doctor', 'POST', '/visits/photos/draft/' + f.foreignPatientId, upload())).status));
    assert.equal((await request('foreignDoctor', 'GET', binaryPath)).status, 200);
    assert.equal((await ok(request('foreignDoctor', 'GET', '/visits/photos/draft/' + f.foreignPatientId))).items.length, photos.items.length);
  });
  let invoice;
  await check('Duplicate checkout produces one invoice and one stock deduction', async () => {
    const before = await db.inventoryItem.findUniqueOrThrow({ where: { id: f.inventoryItemId } });
    const payload = { ...invoicePayload(), requestKey: key() };
    const results = await Promise.all([ok(request('pharmacist', 'POST', '/pharmacy/invoices/checkout', payload)), ok(request('pharmacist', 'POST', '/pharmacy/invoices/checkout', payload))]);
    invoice = results[0];
    assert.equal(results[1].id, invoice.id);
    assert.equal(invoice.status, 'CONFIRMED');
    const after = await db.inventoryItem.findUniqueOrThrow({ where: { id: f.inventoryItemId } });
    assert.equal(after.currentStock, before.currentStock - 2);
    assert.equal(after.heldStock, before.heldStock);
    const altered = await request('pharmacist', 'POST', '/pharmacy/invoices/checkout', { ...payload, notes: 'different payload' });
    assert.equal(altered.status, 409);
    assert.equal((await request('pharmacist', 'PATCH', `/pharmacy/invoices/${invoice.id}/status`, { status: 'CANCELLED' })).status, 400);
    assert.equal((await db.pharmacyInvoice.findUniqueOrThrow({ where: { id: invoice.id } })).status, 'CONFIRMED');
  });
  await check('Competing payments and lost-response retries preserve authoritative balance', async () => {
    const payloads = [{ amount: 60, method: 'CASH', requestKey: key() }, { amount: 60, method: 'CASH', requestKey: key() }];
    const results = await Promise.all(payloads.map(payload => request('pharmacist', 'POST', `/pharmacy/invoices/${invoice.id}/payments`, payload)));
    assert.equal(results.filter(result => result.status === 201).length, 1);
    const accepted = results.findIndex(result => result.status === 201);
    const replay = await ok(request('pharmacist', 'POST', `/pharmacy/invoices/${invoice.id}/payments`, payloads[accepted]));
    assert.equal(replay.id, results[accepted].data.id);
    const saved = await db.pharmacyInvoice.findUniqueOrThrow({ where: { id: invoice.id }, include: { payments: true } });
    assert.equal(saved.payments.length, 1);
    assert.equal(saved.paidAmount, 60);
    assert.equal(saved.balanceAmount, 40);
  });
  const makePrescription = async (extra = {}) => {
    const created = await visit();
    const rx = await ok(request('doctor', 'POST', '/prescriptions', { visitId: created.id, patientId: created.patientId, doctorId: f.users.doctor.id, language: 'EN', items: [{ drugName: 'Synthetic audit cream', drugId: f.drugId, inventoryItemId: f.inventoryItemId, dosageUnit: 'TABLET', frequency: 'ONCE_DAILY', duration: 2, durationUnit: 'DAYS', quantity: 2 }], ...extra }, { 'Idempotency-Key': key() }));
    return { ...rx, patientId: created.patientId, visitId: created.id };
  };
  await check('Refill decisions enforce roles and persist doctor approvals', async () => {
    const rx = await makePrescription({ maxRefills: 1 });
    const refill = await ok(request('nurse', 'POST', '/prescriptions/refills', { prescriptionId: rx.id }, { 'Idempotency-Key': key() }));
    for (const action of ['approve', 'reject']) assert.equal((await request('nurse', 'POST', `/prescriptions/refills/${refill.id}/${action}`, { reason: 'Synthetic denial' }, { 'Idempotency-Key': key() })).status, 403);
    assert.equal((await db.prescriptionRefill.findUniqueOrThrow({ where: { id: refill.id } })).status, 'PENDING');
    await ok(request('doctor', 'POST', `/prescriptions/refills/${refill.id}/approve`, {}, { 'Idempotency-Key': key() }));
    assert.equal((await db.prescriptionRefill.findUniqueOrThrow({ where: { id: refill.id } })).status, 'APPROVED');
  });
  await check('Cancelled and expired prescriptions cannot start or post dispensing', async () => {
    const rx = await makePrescription();
    const draft = await ok(request('pharmacist', 'POST', '/pharmacy/invoices', { ...invoicePayload(rx.patientId), prescriptionId: rx.id }));
    await ok(request('doctor', 'DELETE', '/prescriptions/' + rx.id, undefined, { 'Idempotency-Key': key() }));
    const before = await db.inventoryItem.findUniqueOrThrow({ where: { id: f.inventoryItemId } });
    assert.equal((await request('pharmacist', 'POST', '/pharmacy/prescription-queue/' + rx.id + '/pull', {})).status, 400);
    assert.equal((await request('pharmacist', 'PATCH', `/pharmacy/invoices/${draft.id}/status`, { status: 'CONFIRMED' })).status, 400);
    const expired = await makePrescription({ validUntil: '2000-01-01T00:00:00.000Z' });
    assert.equal((await request('pharmacist', 'POST', '/pharmacy/invoices/checkout', { ...invoicePayload(expired.patientId), prescriptionId: expired.id, requestKey: key() })).status, 400);
    const after = await db.inventoryItem.findUniqueOrThrow({ where: { id: f.inventoryItemId } });
    assert.equal(after.currentStock, before.currentStock);
    assert.equal((await db.pharmacyInvoice.findUniqueOrThrow({ where: { id: draft.id } })).status, 'DRAFT');
  });
  await check('Queue filters precede pagination and GET aliases never write', async () => {
    const baseline = await ok(request('doctor', 'GET', '/pharmacy/prescription-queue?status=pending&limit=2&page=1'));
    const active = [];
    for (let index = 0; index < 3; index++) active.push(await makePrescription());
    const expired = await makePrescription({ validUntil: '2000-01-01T00:00:00.000Z' });
    const cancelled = await makePrescription();
    await ok(request('doctor', 'DELETE', '/prescriptions/' + cancelled.id, undefined, { 'Idempotency-Key': key() }));
    const taskIds = (await db.pharmacyDispenseTask.findMany({ where: { prescriptionId: { in: active.map(rx => rx.id) }, branchId: f.branchId }, select: { id: true } })).map(task => task.id);
    await db.pharmacyDispenseTaskLine.deleteMany({ where: { taskId: { in: taskIds } } });
    await db.pharmacyDispenseTask.deleteMany({ where: { id: { in: taskIds } } });
    const before = await db.pharmacyDispenseTask.findMany({ where: { branchId: f.branchId }, include: { lines: true }, orderBy: { id: 'asc' } });
    const first = await ok(request('doctor', 'GET', '/pharmacy/prescription-queue?status=pending&limit=2&page=1'));
    const second = await ok(request('doctor', 'GET', '/pharmacy/prescription-queue?status=pending&limit=2&page=2'));
    const alias = await ok(request('doctor', 'GET', '/pharmacy/dispense-tasks?status=pending&limit=2&page=1'));
    const expiredPage = await ok(request('doctor', 'GET', '/pharmacy/prescription-queue?status=expired&limit=100&page=1'));
    const after = await db.pharmacyDispenseTask.findMany({ where: { branchId: f.branchId }, include: { lines: true }, orderBy: { id: 'asc' } });
    const expected = [...active].reverse().map(rx => rx.id);
    assert.deepEqual(first.data.map(row => row.prescriptionId), expected.slice(0, 2));
    assert.equal(second.data[0].prescriptionId, expected[2]);
    assert.equal(first.pagination.total, baseline.pagination.total + 3);
    assert.equal(first.pagination.limit, 2);
    assert.equal(first.pagination.page, 1);
    assert.equal(second.pagination.page, 2);
    assert(first.data.every(row => row.status === 'pending' && row.dispenseTaskId === null));
    assert.deepEqual(alias.data.map(row => row.prescriptionId), expected.slice(0, 2));
    assert.deepEqual(alias.pagination, first.pagination);
    assert(expiredPage.data.some(row => row.prescriptionId === expired.id && row.status === 'expired'));
    assert(!expiredPage.data.some(row => row.prescriptionId === cancelled.id));
    assert.deepEqual(after, before);
    const pulled = await ok(request('pharmacist', 'POST', '/pharmacy/prescription-queue/' + active[0].id + '/pull', {}));
    assert(pulled.data.dispenseTaskId);
    assert.equal(pulled.data.prescriptionId, active[0].id);
    assert.equal(await db.pharmacyDispenseTask.count({ where: { prescriptionId: active[0].id, branchId: f.branchId } }), 1);
  });
  report.outcome = 'VERIFIED';
}
main().catch(error => { report.outcome = 'NOT VERIFIED'; report.error = error.message; process.exitCode = 1; }).finally(async () => { await db.$disconnect(); fs.writeFileSync(path.join(output, 'http-acceptance.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)); });
