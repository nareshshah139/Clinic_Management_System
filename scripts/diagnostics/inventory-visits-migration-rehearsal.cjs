const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { randomUUID, createHash } = require('node:crypto');

const root = path.resolve(__dirname, '../..');
const baseline = process.argv.includes('--baseline');
const auditPath = process.argv[2];
assert(auditPath, 'Pass the read-only production-audit.json containing schema-copy and migration metadata');
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
assert.equal(audit.schemaCopy.dataCopied, false);
assert.equal(createHash('sha256').update(fs.readFileSync(audit.schemaCopy.path)).digest('hex'), audit.schemaCopy.sha256, 'Restored schema bytes must match audited provenance');
const database = `pstack_rehearsal_${randomUUID().replaceAll('-', '')}`;
const port = process.env.PSTACK_LOCAL_PORT || '55457';
assert.match(port, /^\d{4,5}$/);
const localUrl = `postgresql://nshah@127.0.0.1:${port}/${database}`;
const psqlBin = process.env.PSTACK_PSQL || '/opt/homebrew/opt/postgresql@17/bin/psql';
const out = path.join(root, 'output/inventory-visits-repair');
fs.mkdirSync(out, { recursive: true });
const report = { checkedAt: new Date().toISOString(), database, schemaSourceHash: audit.schemaCopy.sha256, patientRecordsCopied: false, checks: [] };
const run = (bin, args, options = {}) => execFileSync(bin, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 20 * 1024 * 1024, ...options });
const psql = (db, args) => run(psqlBin, ['-X', '-q', '-h', '127.0.0.1', '-p', port, '-U', 'nshah', '-v', 'ON_ERROR_STOP=1', '-d', db, ...args]);
const quote = value => value == null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
const jsonQuery = sql => JSON.parse(psql(database, ['-At', '-c', sql]).trim());
let created = false;

/**
 * @cc [owner:nareshshah139,label:safety] disposable-migration-rehearsal
 * This rehearsal restores only schema and migration metadata into a newly named local database;
 * cleanup may drop only that database, and never connects to a production data source.
 */
function rehearse() {
  assert.match(database, /^pstack_rehearsal_[a-f0-9]{32}$/);
  psql('postgres', ['-c', `CREATE DATABASE "${database}"`]);
  created = true;
  psql(database, ['-f', audit.schemaCopy.path]);
  for (const migration of audit.migrations.applied) {
    psql(database, ['-c', `INSERT INTO _prisma_migrations (id,checksum,migration_name,started_at,finished_at,rolled_back_at,applied_steps_count) VALUES (${quote(randomUUID())},${quote(migration.checksum)},${quote(migration.migration_name)},${quote(migration.finished_at)},${quote(migration.finished_at)},${quote(migration.rolled_back_at)},1)`]);
  }
  psql(database, ['-c', `
    INSERT INTO branches(id,name,address,"updatedAt") VALUES ('rehearsal-branch','Synthetic migration branch','Local fixture only',now());
    INSERT INTO users(id,email,password,"firstName","lastName",role,"branchId","updatedAt") VALUES ('rehearsal-doctor','migration@example.invalid','not-a-login','Synthetic','Doctor','DOCTOR','rehearsal-branch',now());
    INSERT INTO patients(id,name,gender,phone,"branchId","updatedAt") VALUES ('rehearsal-patient','Synthetic migration patient','FEMALE','0000000000','rehearsal-branch',now());
    INSERT INTO visits(id,"patientId","doctorId",complaints,plan,"updatedAt") VALUES
      ('rehearsal-active','rehearsal-patient','rehearsal-doctor','[]','{"pastHistory":"preserve"}',now()),
      ('rehearsal-deleted-compact','rehearsal-patient','rehearsal-doctor','[]','{"deleted":true,"deletedAt":"2026-09-01T10:00:00.000Z"}',now()),
      ('rehearsal-deleted-spaced','rehearsal-patient','rehearsal-doctor','[]','{"deleted": true}',now()),
      ('rehearsal-malformed','rehearsal-patient','rehearsal-doctor','[]','old non-json plan',now());
  `]);
  psql(database, ['-c', `
    INSERT INTO appointments(id,"patientId","doctorId",date,slot,status,"branchId","updatedAt") VALUES ('rehearsal-appointment','rehearsal-patient','rehearsal-doctor','2026-09-02','10:00','COMPLETED','rehearsal-branch','2026-09-02');
    INSERT INTO visits(id,"patientId","doctorId","appointmentId",complaints,"updatedAt") VALUES ('rehearsal-completed','rehearsal-patient','rehearsal-doctor','rehearsal-appointment','[]','2026-09-02');
  `]);
  report.originalPlans = jsonQuery(`SELECT json_agg(json_build_object('id',id,'plan',plan) ORDER BY id) FROM visits`);
  const env = { ...process.env, DATABASE_URL: localUrl };
  const prisma = args => run(process.execPath, [root + '/node_modules/prisma/build/index.js', ...args], { env });
  const started = Date.now();
  report.deploy = prisma(['migrate', 'deploy', '--schema', 'backend/prisma/schema.prisma']);
  report.milliseconds = Date.now() - started;
  report.secondDeploy = prisma(['migrate', 'deploy', '--schema', 'backend/prisma/schema.prisma']);
  assert.match(report.secondDeploy, /No pending migrations/);
  report.checks.push('A second deploy has no pending migrations');
  const plans = jsonQuery(`SELECT json_agg(json_build_object('id',id,'plan',plan) ORDER BY id) FROM visits`);
  assert.deepEqual(plans, report.originalPlans);
  report.checks.push('Legacy clinical plan strings remain byte-for-byte unchanged');
  const columns = jsonQuery(`SELECT json_agg(column_name) FROM information_schema.columns WHERE table_name='visits' AND table_schema='public'`);
  if (columns.includes('deletedAt')) {
    const rows = jsonQuery(`SELECT json_agg(json_build_object('id',id,'deletedAt',"deletedAt",'status',status,'completedAt',"completedAt") ORDER BY id) FROM visits`);
    assert(rows.find(row => row.id === 'rehearsal-deleted-compact').deletedAt);
    assert(rows.find(row => row.id === 'rehearsal-deleted-spaced').deletedAt);
    for (const id of ['rehearsal-active', 'rehearsal-malformed']) {
      const row = rows.find(row => row.id === id);
      assert.equal(row.deletedAt, null);
      assert.equal(row.completedAt, null);
      assert.equal(row.status, 'IN_PROGRESS');
    }
    const completed = rows.find(row => row.id === 'rehearsal-completed');
    assert.equal(completed.status, 'COMPLETED');
    assert(completed.completedAt);
    report.checks.push('Linked completed appointments backfill visit completion');
    report.checks.push('Both legacy deletion whitespace forms are hidden; malformed and active plans remain active');
  } else {
    assert(baseline, 'Release rehearsal requires integrated lifecycle columns');
    report.checks.push('Baseline captured before lifecycle migration is integrated');
  }
  report.invalidIndexes = jsonQuery(`SELECT coalesce(json_agg(c.relname),'[]'::json) FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE NOT i.indisvalid`);
  assert.deepEqual(report.invalidIndexes, []);
  report.checks.push('All PostgreSQL indexes are valid');
  const diff = prisma(['migrate', 'diff', '--from-url', localUrl, '--to-schema-datamodel', 'backend/prisma/schema.prisma', '--script']);
  const diffPath = path.join(out, 'schema-drift.sql');
  fs.writeFileSync(diffPath, diff, { mode: 0o600 });
  report.schemaDiffPath = diffPath;
  report.schemaDiffEmpty = /empty migration/i.test(diff);
  const normalize = text => text.replace(/^--.*$/gm, '').replace(/\s+/g, ' ').trim();
  const allowedDrift = fs.readFileSync(path.join(root, 'docs/qa/inventory-visits-repair/baseline-schema-drift.txt'), 'utf8');
  assert.equal(normalize(diff), normalize(allowedDrift), 'Schema drift changed from the independently reviewed constraint-name-only baseline');
  report.checks.push('Schema drift matches the six existing constraint/index naming differences');
  report.outcome = baseline ? 'BASELINE_CAPTURED' : 'VERIFIED';
}
try { rehearse(); }
catch (error) { report.outcome = 'NOT VERIFIED'; report.error = String(error.message).replace(/postgres(?:ql)?:\/\/[^\s]+/g, '[redacted]'); process.exitCode = 1; }
finally {
  if (created) {
    psql('postgres', ['-c', `DROP DATABASE "${database}" WITH (FORCE)`]);
    report.databaseRemoved = true;
  }
  fs.writeFileSync(path.join(out, 'migration-rehearsal.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(report, null, 2));
}
