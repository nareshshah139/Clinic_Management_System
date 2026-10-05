const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'output/inventory-visits-repair');
const railway = '/Users/nshah/.nvm/versions/node/v22.12.0/lib/node_modules/@railway/cli/bin/railway';
const tables = ['patients', 'appointments', 'visits', 'prescriptions', 'inventory_items', 'pharmacy_invoices', 'pharmacy_invoice_items', 'pharmacy_payments', 'stock_transactions', 'stock_movements', 'drugs', 'pharmacy_purchase_invoices', 'pharmacy_purchase_invoice_items'];
const omitted = { visits: ['status', 'completedAt', 'deletedAt', 'version', 'deletedAppointmentId'], prescriptions: ['status', 'validUntil', 'maxRefills', 'cancelledAt', 'cancelledBy', 'cancellationReason', 'metadata'], pharmacy_invoices: ['checkoutRequestKey', 'checkoutPayloadHash', 'paidAmount', 'balanceAmount', 'paymentStatus'], pharmacy_payments: ['requestKey', 'payloadHash'] };
const connect = () => {
  const project = JSON.parse(execFileSync(railway, ['status', '--json'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  assert.equal(project.id, '0806df25-906b-48f3-ab72-fa0650431661');
  const vars = JSON.parse(execFileSync(railway, ['variables', '--service', 'Postgres', '--environment', 'production', '--json'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  return new PrismaClient({ datasourceUrl: vars.DATABASE_PUBLIC_URL });
};
/**
 * @cc [owner:nareshshah139,label:safety] production-record-fingerprints
 * Preservation checks run read-only and export only counts and hashes. The explicitly listed
 * additive fields and reconciled balance caches are excluded consistently before and after migration.
 */
const snapshot = (db, exact = false) => db.$transaction(async tx => {
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  await tx.$executeRawUnsafe("SET LOCAL statement_timeout='15s'");
  const result = {};
  const checkedTables = exact ? [...tables, 'audit_logs', 'branches', 'users', 'idempotency_records', 'number_sequences'] : tables;
  for (const table of checkedTables) {
    const ignored = exact ? [] : omitted[table] || [];
    let source = !exact && table === 'visits' ? "(to_jsonb(t) || jsonb_build_object('appointmentId', COALESCE(to_jsonb(t)->>'appointmentId', to_jsonb(t)->>'deletedAppointmentId')))" : 'to_jsonb(t)';
    if (!exact && table === 'appointments') source = `(to_jsonb(t) || jsonb_build_object('status', CASE WHEN t.status::text IN ('IN_PROGRESS','COMPLETED') AND EXISTS (
      SELECT 1 FROM visits v WHERE COALESCE(to_jsonb(v)->>'appointmentId', to_jsonb(v)->>'deletedAppointmentId')=t.id
        AND (to_jsonb(v)->>'deletedAt' IS NOT NULL OR CASE WHEN pg_input_is_valid(v.plan,'jsonb') THEN v.plan::jsonb->'deleted'='true'::jsonb ELSE false END)
    ) THEN 'CHECKED_IN' ELSE t.status::text END))`;
    const row = ignored.length ? `(${source} - ARRAY[${ignored.map(field => `'${field}'`).join(',')}]::text[])` : source;
    result[table] = (await tx.$queryRawUnsafe(`SELECT count(*)::int AS count, md5(coalesce(string_agg(${row}::text, E'\\n' ORDER BY id),'')) AS hash FROM "${table}" t`))[0];
  }
  return result;
}, { timeout: 90000 });
async function main() {
  assert(['--capture', '--verify'].includes(process.argv[2]));
  const db = connect();
  try {
    const hashes = await snapshot(db);
    const file = path.join(output, 'production-preservation-before.json');
    const report = { checkedAt: new Date().toISOString(), readOnly: true, excludedMigrationFields: omitted, hashes };
    if (process.argv[2] === '--capture') {
      assert(!fs.existsSync(file), 'Preservation baseline already exists; do not overwrite it');
      fs.mkdirSync(output, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(report, null, 2), { mode: 0o600 });
    } else {
      const before = JSON.parse(fs.readFileSync(file));
      report.matches = Object.fromEntries(tables.map(table => [table, JSON.stringify(hashes[table]) === JSON.stringify(before.hashes[table])]));
      report.outcome = Object.values(report.matches).every(Boolean) ? 'VERIFIED' : 'NOT VERIFIED';
      fs.writeFileSync(path.join(output, 'production-preservation-after.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
      assert.equal(report.outcome, 'VERIFIED', 'Existing record hashes changed; inspect before declaring preserved');
    }
    console.log(JSON.stringify(report));
  } finally { await db.$disconnect(); }
}
module.exports = { connect, snapshot };
if (require.main === module) main().catch(error => { console.error(String(error.message).replace(/postgres(?:ql)?:\/\/[^\s]+/g, '[redacted]')); process.exitCode = 1; });
