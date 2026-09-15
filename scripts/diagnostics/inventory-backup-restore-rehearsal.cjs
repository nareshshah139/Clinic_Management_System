// Production access is read-only. Full data remains in a private local directory/database.
// Restore and migration targets are hard-coded to the isolated localhost PostgreSQL server.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { execFileSync, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { createHash, randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const run = promisify(execFile);
const root = path.resolve(__dirname, '../..');
const out = root + '/output/diagnostics/inventory-production-readiness';
const railway = '/Users/nshah/.nvm/versions/node/v22.12.0/lib/node_modules/@railway/cli/bin/railway';
const pgBin = '/opt/homebrew/opt/postgresql@17/bin/';
const quoteId = x => '"' + x.replaceAll('"', '""') + '"';
const dumpDir = fs.mkdtempSync('/tmp/inventory-predeploy-backup-');
fs.chmodSync(dumpDir, 0o700);
const archive = dumpDir + '/production.dump';
const database = 'inventory_backup_restore_' + randomUUID().replaceAll('-', '').slice(0, 12);
assert.match(database, /^inventory_backup_restore_[a-f0-9]{12}$/);
const localUrl = `postgresql://invoice_review@127.0.0.1:55443/${database}?schema=public`;
const localEnv = { ...process.env, PGHOST: '127.0.0.1', PGPORT: '55443', PGUSER: 'invoice_review', PGDATABASE: database, PGPASSWORD: '', PGOPTIONS: '' };
const report = { checkedAt: new Date().toISOString(), productionReadOnly: true, database, privateArchive: archive, checks: {} };
const save = () => fs.writeFileSync(out + '/backup-restore-rehearsal.json', JSON.stringify(report, null, 2));
async function fingerprint(client, tables) {
  const result = [];
  for (const t of tables) {
    const columns = t.columns.map(quoteId).join(',');
    const rows = await client.$queryRawUnsafe(`SELECT count(*)::text AS count,
      encode(sha256(convert_to(coalesce(string_agg(digest, '' ORDER BY digest), ''), 'UTF8')), 'hex') AS digest
      FROM (SELECT encode(sha256(convert_to(row_to_json(r)::text, 'UTF8')), 'hex') AS digest
      FROM (SELECT ${columns} FROM public.${quoteId(t.name)}) r) hashes`);
    result.push({ table: t.name, ...rows[0] });
  }
  return result;
}
async function main() {
  save();
  const variables = JSON.parse(execFileSync(railway, ['variables', '--service', 'Postgres', '--json'], { cwd: root, encoding: 'utf8' }));
  const u = new URL(variables.DATABASE_PUBLIC_URL);
  assert(!['localhost', '127.0.0.1'].includes(u.hostname));
  const production = new PrismaClient({ datasourceUrl: variables.DATABASE_PUBLIC_URL });
  let tables, before;
  try {
    await production.$transaction(async tx => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      await tx.$executeRawUnsafe("SET LOCAL timezone = 'UTC'");
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '60s'");
      assert.equal((await tx.$queryRawUnsafe('SHOW transaction_read_only'))[0].transaction_read_only, 'on');
      const snapshot = (await tx.$queryRawUnsafe('SELECT pg_export_snapshot() AS snapshot'))[0].snapshot;
      const cols = await tx.$queryRawUnsafe(`SELECT c.table_name,c.column_name FROM information_schema.columns c
        JOIN information_schema.tables t ON t.table_schema=c.table_schema AND t.table_name=c.table_name
        WHERE c.table_schema='public' AND t.table_type='BASE TABLE' ORDER BY c.table_name,c.ordinal_position`);
      tables = [];
      for (const c of cols) {
        let t = tables.find(t => t.name === c.table_name);
        if (!t) tables.push(t = { name: c.table_name, columns: [] });
        t.columns.push(c.column_name);
      }
      console.log('Creating consistent read-only production backup.');
      await run(pgBin + 'pg_dump', ['--format=custom', '--no-owner', '--no-privileges', '--snapshot', snapshot, '--file', archive], {
        env: { ...process.env, PGHOST: u.hostname, PGPORT: u.port, PGUSER: decodeURIComponent(u.username), PGPASSWORD: decodeURIComponent(u.password), PGDATABASE: u.pathname.slice(1), PGOPTIONS: '-c default_transaction_read_only=on' },
        maxBuffer: 1024 * 1024,
      });
      fs.chmodSync(archive, 0o600);
      before = await fingerprint(tx, tables);
      fs.writeFileSync(dumpDir + '/snapshot-digests.json', JSON.stringify({ tables, before }, null, 2), { mode: 0o600 });
    }, { isolationLevel: 'RepeatableRead', timeout: 1200000 });
  } finally { await production.$disconnect(); }
  report.archiveBytes = fs.statSync(archive).size;
  report.archiveSha256 = createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
  report.sourceTables = tables.length;
  report.sourceRows = before.reduce((n, t) => n + Number(t.count), 0);
  save();
  console.log('Restoring backup into a new isolated local database.');
  await run(pgBin + 'psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-d', 'postgres', '-c', `CREATE DATABASE ${quoteId(database)}`], { env: localEnv });
  await run(pgBin + 'pg_restore', ['--exit-on-error', '--no-owner', '--no-privileges', '--dbname', database, archive], { env: localEnv, maxBuffer: 5 * 1024 * 1024 });
  const local = new PrismaClient({ datasourceUrl: localUrl });
  try {
    const afterRestore = await local.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET LOCAL timezone = 'UTC'");
      return fingerprint(tx, tables);
    }, { timeout: 300000 });
    assert.deepEqual(afterRestore, before, 'Restored rows differ from the exact backup snapshot');
    report.checks.allTablesRestoredIdentically = true;
    save();
    const release = JSON.parse(fs.readFileSync(out + '/release-candidate.json')).directory;
    const env = { ...process.env, DATABASE_URL: localUrl };
    const start = Date.now();
    const first = await run(root + '/node_modules/.bin/prisma', ['migrate', 'deploy', '--schema', release + '/backend/prisma/schema.prisma'], { cwd: release, env });
    report.migrationMilliseconds = Date.now() - start;
    report.migrationOutput = first.stdout;
    const afterMigration = await local.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET LOCAL timezone = 'UTC'");
      return fingerprint(tx, tables.filter(t => t.name !== '_prisma_migrations'));
    }, { timeout: 300000 });
    assert.deepEqual(afterMigration, before.filter(t => t.table !== '_prisma_migrations'), 'Migration changed pre-existing application data');
    report.checks.allExistingApplicationColumnsUnchanged = true;
    const second = await run(root + '/node_modules/.bin/prisma', ['migrate', 'deploy', '--schema', release + '/backend/prisma/schema.prisma'], { cwd: release, env });
    assert.match(second.stdout, /No pending migrations/);
    report.checks.secondMigrationNoOp = true;
    const defaults = await local.$queryRawUnsafe(`SELECT
      (SELECT count(*)::int FROM inventory_items WHERE "heldStock" <> 0) AS held_stock_nonzero,
      (SELECT count(*)::int FROM pharmacy_purchase_invoices WHERE "creditApplied" <> 0 OR "actionVersion" <> 1 OR "workflowReceiptId" IS NOT NULL) AS changed_purchase_defaults,
      (SELECT count(*)::int FROM stock_transactions WHERE "quantityDelta" IS NOT NULL) AS historical_signed_deltas`);
    assert.deepEqual(defaults, [{ held_stock_nonzero: 0, changed_purchase_defaults: 0, historical_signed_deltas: 0 }]);
    report.checks.safeNewColumnDefaults = true;
    report.status = 'PASS';
    save();
    console.log(JSON.stringify({ status: report.status, database, sourceTables: report.sourceTables, sourceRows: report.sourceRows, archiveBytes: report.archiveBytes, checks: report.checks, migrationMilliseconds: report.migrationMilliseconds }));
  } finally { await local.$disconnect(); }
}
main().catch(e => {
  report.status = 'FAIL';
  // Do not log child command arguments, database URLs, data values or credentials.
  report.error = String(e.message).replace(/postgres(?:ql)?:\/\/[^\s]+/g, '[redacted]');
  save(); console.error(report.error); process.exitCode = 1;
});
