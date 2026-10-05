const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { fingerprint, artifactIdentity } = require('./inventory-visits-build.cjs');

const root = path.resolve(__dirname, '../..');
const database = `pstack_acceptance_${randomUUID().replaceAll('-', '')}`;
const databaseUrl = `postgresql://nshah@127.0.0.1:55457/${database}`;
const admin = new PrismaClient({ datasourceUrl: 'postgresql://nshah@127.0.0.1:55457/postgres' });
const output = path.join(root, 'output/inventory-visits-repair');
fs.mkdirSync(output, { recursive: true });
const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'pstack-clinic-runtime-'));
const db = new PrismaClient({ datasourceUrl: databaseUrl });
const processes = [];
const report = { database, databaseUrl, runtime, frontend: 'http://localhost:3002', backend: 'http://127.0.0.1:4107', syntheticOnly: true };
let created = false;
let stopping = false;
const save = () => fs.writeFileSync(path.join(output, 'local-session.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
const child = (name, args, cwd, env) => {
  const fd = fs.openSync(path.join(output, `${name}.log`), 'a', 0o600);
  const process = spawn(global.process.execPath, args, { cwd, env, stdio: ['ignore', fd, fd] });
  processes.push(process);
  fs.closeSync(fd);
  return process;
};
const waitHealthy = async (url, process) => {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (process.exitCode !== null) throw Error(`Local service exited ${process.exitCode}; see ${output}`);
    try { if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw Error(`Local service did not become healthy: ${url}`);
};

/**
 * @cc [owner:nareshshah139,label:safety] isolated-local-acceptance
 * Fixture writes and application startup use only a newly created localhost database; no external
 * connector credentials are passed to either server, and all seeded identities are synthetic.
 */
async function start() {
  const build = JSON.parse(fs.readFileSync(path.join(output, 'local-build.json'), 'utf8'));
  assert.equal(build.outcome, 'VERIFIED');
  assert.equal(build.sourceSha256, fingerprint(), 'Rebuild current source before starting acceptance');
  for (const [key, value] of Object.entries(artifactIdentity())) assert.equal(build[key], value);
  report.build = build;
  assert.match(database, /^pstack_acceptance_[a-f0-9]{32}$/);
  await admin.$executeRawUnsafe(`CREATE DATABASE "${database}"`);
  created = true;
  execFileSync(process.execPath, [root + '/node_modules/prisma/build/index.js', 'db', 'push', '--skip-generate', '--schema', root + '/backend/prisma/schema.prisma'], { cwd: root, env: { PATH: process.env.PATH, DATABASE_URL: databaseUrl }, stdio: 'pipe' });
  await db.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS pg_trgm');
  execFileSync('/opt/homebrew/opt/postgresql@17/bin/psql', [databaseUrl, '-v', 'ON_ERROR_STOP=1', '-f', root + '/backend/prisma/migrations/20261005093000_inventory_read_queries/migration.sql'], { stdio: 'pipe' });
  const branch = await db.branch.create({ data: { name: 'Synthetic acceptance clinic', address: 'Local testing only' } });
  const foreignBranch = await db.branch.create({ data: { name: 'Synthetic foreign clinic', address: 'Local testing only' } });
  const password = 'Synthetic-local-' + randomUUID();
  const passwordHash = await bcrypt.hash(password, 10);
  const user = (role, branchId, firstName, permissions = []) => db.user.create({ data: { email: `${randomUUID()}@example.invalid`, password: passwordHash, firstName, lastName: 'Synthetic', role, branchId, status: 'ACTIVE', isActive: true, permissions: JSON.stringify(permissions) } });
  const doctor = await user('DOCTOR', branch.id, 'Doctor');
  const foreignDoctor = await user('DOCTOR', foreignBranch.id, 'Foreign');
  const pharmacist = await user('PHARMACIST', branch.id, 'Pharmacist', ['pharmacy:invoice:create', 'pharmacy:invoice:read', 'pharmacy:invoice:update', 'pharmacy:invoice:delete', 'pharmacy:invoice:payment:add', 'inventory:item:read', 'pharmacy:package:create', 'pharmacy:package:read', 'pharmacy:drug:read', 'pharmacy:drug:autocomplete']);
  const nurse = await user('NURSE', branch.id, 'Nurse');
  const restrictedPharmacist = await user('PHARMACIST', branch.id, 'Restricted', ['pharmacy:invoice:create']);
  const patient = await db.patient.create({ data: { name: 'Synthetic visit patient', gender: 'FEMALE', age: 30, phone: '0000000000', branchId: branch.id } });
  const foreignPatient = await db.patient.create({ data: { name: 'Synthetic foreign patient', gender: 'FEMALE', age: 31, phone: '0000000001', branchId: foreignBranch.id } });
  const itemData = { branchId: branch.id, name: 'Synthetic audit cream', type: 'MEDICINE', costPrice: 30, sellingPrice: 50, mrp: 50, unit: 'PIECES', packSize: 1, packUnit: 'piece', currentStock: 20, heldStock: 0, status: 'ACTIVE', stockStatus: 'IN_STOCK', expiryDate: new Date('2099-12-31'), hsnCode: '3004', gstRate: 0 };
  const item = await db.inventoryItem.create({ data: { ...itemData, batchNumber: 'SYNTHETIC-A' } });
  const otherItem = await db.inventoryItem.create({ data: { ...itemData, batchNumber: 'SYNTHETIC-B', currentStock: 7, heldStock: 2 } });
  const drug = await db.drug.create({ data: { name: item.name, price: 50, manufacturerName: 'Synthetic manufacturer', packSizeLabel: '1 piece', branchId: branch.id, inventoryItems: { connect: [{ id: item.id }, { id: otherItem.id }] } } });
  for (const batch of [item, otherItem]) await db.stockTransaction.create({ data: { branchId: branch.id, itemId: batch.id, userId: doctor.id, type: 'PURCHASE', quantity: batch.currentStock, quantityDelta: batch.currentStock, unitPrice: 30, totalAmount: batch.currentStock * 30, reference: 'SYNTHETIC-OPENING' } });
  report.fixture = { branchId: branch.id, foreignBranchId: foreignBranch.id, patientId: patient.id, foreignPatientId: foreignPatient.id, inventoryItemId: item.id, otherInventoryItemId: otherItem.id, drugId: drug.id, password, users: Object.fromEntries(Object.entries({ doctor, foreignDoctor, pharmacist, nurse, restrictedPharmacist }).map(([key, value]) => [key, { id: value.id, email: value.email }])) };
  const env = { PATH: process.env.PATH, NODE_ENV: 'development', DATABASE_URL: databaseUrl, JWT_SECRET: randomUUID() + randomUUID(), JWT_EXPIRES_IN: '1d', MINIMAL_BOOT: 'false', RUN_SEED_ON_STARTUP: 'false', PHARMACY_AGENT_CODEX_PATH: '/usr/bin/false', PORT: '4107' };
  const backend = child('local-backend', [root + '/backend/dist/main.js'], runtime, env);
  await waitHealthy(report.backend + '/health', backend);
  await db.role.updateMany({ where: { name: 'PHARMACIST' }, data: { permissions: '[]' } });
  const manifest = JSON.parse(fs.readFileSync(root + '/frontend/.next/routes-manifest.json', 'utf8'));
  const rewrites = Array.isArray(manifest.rewrites) ? manifest.rewrites : Object.values(manifest.rewrites).flat();
  assert.equal(rewrites.find(route => route.source === '/api/:path*')?.destination, report.backend + '/:path*', 'Rebuild frontend with the local API proxy before acceptance');
  assert.equal(rewrites.find(route => route.source === '/uploads/:path*')?.destination, report.backend + '/uploads/:path*', 'Uploads must use the isolated local API');
  const frontend = child('local-frontend', [root + '/node_modules/next/dist/bin/next', 'start', '--port', '3002'], root + '/frontend', { PATH: process.env.PATH, NODE_ENV: 'production', NEXT_PUBLIC_API_PROXY: report.backend });
  await waitHealthy(report.frontend + '/login', frontend);
  const login = await fetch(report.backend + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: doctor.email, password }) });
  assert.equal(login.status, 201);
  const auth = await login.json();
  const identity = await fetch(report.frontend + '/api/auth/me', { headers: { Authorization: `Bearer ${auth.access_token}` } });
  assert.equal(identity.status, 200);
  assert.equal((await identity.json()).id, doctor.id, 'Frontend proxy must resolve to the synthetic fixture');
  const visitResponse = await fetch(report.backend + '/visits', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.access_token}` }, body: JSON.stringify({ patientId: patient.id, doctorId: doctor.id, complaints: [{ complaint: 'Synthetic rash' }], history: { pastHistory: 'Synthetic history', familyHistory: 'Keep this family history' }, diagnosis: [{ diagnosis: 'Synthetic dermatitis' }], vitals: { heartRate: 80, weight: 60 }, treatmentPlan: { followUpInstructions: 'Synthetic instructions', followUpDate: '2026-11-01', investigations: ['Synthetic investigation'] } }) });
  assert.equal(visitResponse.status, 201, await visitResponse.clone().text());
  report.fixture.visitId = (await visitResponse.json()).id;
  report.ready = true;
  save();
  console.log(JSON.stringify({ ready: true, database, frontend: report.frontend, sessionFile: path.join(output, 'local-session.json') }));
}
async function stop() {
  if (stopping) return;
  stopping = true;
  for (const process of processes) process.kill('SIGTERM');
  await Promise.all(processes.map(process => process.exitCode === null ? new Promise(resolve => { process.once('exit', resolve); setTimeout(resolve, 5000); }) : Promise.resolve()));
  for (const process of processes) if (process.exitCode === null) process.kill('SIGKILL');
  await db.$disconnect();
  if (created) await admin.$executeRawUnsafe(`DROP DATABASE "${database}" WITH (FORCE)`);
  await admin.$disconnect();
  report.stopped = true;
  report.databaseRemoved = created;
  save();
}
process.on('SIGINT', () => stop().then(() => process.exit()));
process.on('SIGTERM', () => stop().then(() => process.exit()));
start().catch(async error => { console.error(String(error.message).replace(/postgres(?:ql)?:\/\/[^\s]+/g, '[redacted]')); await stop(); process.exitCode = 1; });
