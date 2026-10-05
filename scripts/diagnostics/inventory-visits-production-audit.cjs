const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const root = path.resolve(__dirname, '../..');
const railway = process.env.PSTACK_RAILWAY || '/Users/nshah/.nvm/versions/node/v22.12.0/lib/node_modules/@railway/cli/bin/railway';
const report = { checkedAt: new Date().toISOString(), readOnly: true };
const output = path.join(root, 'output/inventory-visits-repair');

/**
 * @cc [owner:nareshshah139,label:safety] aggregate-only-production-reconciliation
 * The audit uses a read-only transaction and exports aggregate counts only; database credentials
 * and clinical or financial record contents must never be printed or written to its report.
 */
async function audit() {
  const vars = JSON.parse(execFileSync(railway, ['variables', '--service', 'Postgres', '--environment', 'production', '--json'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  const url = new URL(vars.DATABASE_PUBLIC_URL);
  url.searchParams.set('connection_limit', '1');
  const db = new PrismaClient({ datasourceUrl: url.toString() });
  try {
    await db.$transaction(async tx => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout='20s'");
      report.transactionReadOnly = (await tx.$queryRawUnsafe('SHOW transaction_read_only'))[0].transaction_read_only;
      report.invoices = (await tx.$queryRawUnsafe(`WITH receipts AS (
        SELECT "invoiceId",sum(amount) FILTER (WHERE status='COMPLETED') AS paid FROM pharmacy_payments GROUP BY "invoiceId"
      ) SELECT count(*)::int AS total,
        count(*) FILTER (WHERE abs(i."paidAmount"-coalesce(r.paid,0))>0.01)::int AS cached_paid_mismatch,
        count(*) FILTER (WHERE abs(i."balanceAmount"-(i."totalAmount"-coalesce(r.paid,0)))>0.01)::int AS cached_balance_mismatch,
        count(*) FILTER (WHERE coalesce(r.paid,0)>i."totalAmount"+0.01)::int AS overpaid,
        count(*) FILTER (WHERE i.status='CANCELLED' AND EXISTS(SELECT 1 FROM stock_transactions s WHERE s."branchId"=i."branchId" AND s.reference='INV-'||i."invoiceNumber" AND s.type='SALE'))::int AS cancelled_with_sale_history
        FROM pharmacy_invoices i LEFT JOIN receipts r ON r."invoiceId"=i.id`))[0];
      report.visits = (await tx.$queryRawUnsafe(`SELECT count(*)::int AS total,
        count(*) FILTER (WHERE plan ~ '"deleted"[[:space:]]*:[[:space:]]*true')::int AS legacy_deleted_markers,
        count(*) FILTER (WHERE "appointmentId" IS NULL)::int AS walk_in_records
        FROM visits`))[0];
      report.queue = (await tx.$queryRawUnsafe(`SELECT (SELECT count(*)::int FROM prescriptions) AS prescriptions,
        (SELECT count(*)::int FROM pharmacy_dispense_tasks) AS tasks,
        (SELECT count(*)::int FROM prescriptions p WHERE NOT EXISTS(SELECT 1 FROM pharmacy_dispense_tasks t WHERE t."prescriptionId"=p.id)) AS without_task`))[0];
      report.stock = (await tx.$queryRawUnsafe(`SELECT count(*)::int AS batches,
        count(*) FILTER (WHERE "currentStock"<0)::int AS negative_stock,
        count(*) FILTER (WHERE "heldStock">"currentStock")::int AS held_exceeds_on_hand
        FROM inventory_items`))[0];
    }, { timeout: 60000 });
  } finally { await db.$disconnect(); }
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'production-reconciliation.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(report, null, 2));
}
audit().catch(error => { console.error(String(error.message).replace(/postgres(?:ql)?:\/\/[^\s]+/g, '[redacted]')); process.exitCode = 1; });
