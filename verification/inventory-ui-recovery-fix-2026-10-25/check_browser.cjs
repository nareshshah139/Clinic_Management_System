/**
 * @cc [owner:nareshshah139,label:verification] browser-proof-isolation
 * This adapter MUST retain the existing runner's loopback database and owned-resource cleanup,
 * execute production modules, and fail if an expected adapter replacement is missing.
 */
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const filename = path.join(root, 'e2e/recovery/run.cjs');
let source = fs.readFileSync(filename, 'utf8');
function replaceOnce(before, after) {
  assert.equal(source.split(before).length, 2, `Runner adapter mismatch: ${before}`);
  source = source.replace(before, after);
}
replaceOnce('require("./registry.cjs")', JSON.stringify([{ id: 'stock', category: 'production-ui', checkpoints: ['stale-count', 'posted-count', 'fresh-count', 'missing-invoice', 'delegated-recovered', 'delegated-rejected'] }]));
replaceOnce('require("./scenarios.cjs")', `require(${JSON.stringify(path.join(__dirname, 'browser_scenarios.cjs'))})`);
replaceOnce('  const recoverySql = fs.readFileSync(path.join(root, "backend/prisma/migrations/20261024150000_unlinked_purchase_recovery/migration.sql"), "utf8");\n  for (const statement of recoverySql.split("-- statement-breakpoint")) {\n    if (/^\\s*CREATE (FUNCTION|TRIGGER) /.test(statement)) await owned.db.$executeRawUnsafe(statement);\n  }', `  await owned.db.$executeRawUnsafe('DROP TABLE "pharmacy_purchase_import_attempts"');
  const attemptSql = fs.readFileSync(path.join(root, 'backend/prisma/migrations/20261024120000_purchase_import_recovery/migration.sql'), 'utf8');
  for (const statement of attemptSql.split(';').filter(sql => sql.trim())) await owned.db.$executeRawUnsafe(statement);
  await owned.db.pharmacyPurchaseImportAttempt.create({data:{id:'aa000000-0000-4000-8000-000000000001',branchId:'pre-migration-fixture',userId:'pre-migration-fixture',status:'INVOICE_SAVED',purchaseInvoiceId:'aa000000-0000-4000-8000-000000000002'}});
  const recoverySql = fs.readFileSync(path.join(root, 'backend/prisma/migrations/20261024150000_unlinked_purchase_recovery/migration.sql'), 'utf8');
  for (const statement of recoverySql.split('-- statement-breakpoint').filter(sql => sql.trim())) await owned.db.$executeRawUnsafe(statement);
`);
replaceOnce('  const branch = await owned.db.branch.create({', `  const readMigration = fs.readFileSync(path.join(root, 'backend/prisma/migrations/20261005093000_inventory_read_queries/migration.sql'), 'utf8');
  const readFunctions = readMigration.split('CREATE OR REPLACE FUNCTION ').filter(part => part.startsWith('inventory_read_'));
  assert.equal(readFunctions.length, 2, 'Both inventory read functions must be installed');
  for (const part of readFunctions) await owned.db.$executeRawUnsafe('CREATE OR REPLACE FUNCTION ' + part.slice(0, part.indexOf('$$;') + 3));
  const branch = await owned.db.branch.create({`);
const start = source.indexOf('  const executable =\n');
const end = source.indexOf('  checkCancelled();\n  result.browser', start);
assert(start > 0 && end > start, 'Browser adapter boundaries');
if (!process.argv.includes('--chromium')) source = source.slice(0, start) + `  const cdpPort = await port();
  const obscura = child('/Users/nshah/.local/share/obscura/v0.2.2/obscura', ['serve', '--host', '127.0.0.1', '--port', String(cdpPort), '--storage-dir', path.join(temp, 'browser'), '--allow-private-network'], temp, 'obscura');
  await ready('http://127.0.0.1:' + cdpPort + '/json/version', obscura);
  owned.browser = await frontReq('puppeteer-core').connect({ browserURL: 'http://127.0.0.1:' + cdpPort });
` + source.slice(end);
const runner = new Module(filename, module);
runner.filename = filename;
runner.paths = Module._nodeModulePaths(path.dirname(filename));
runner._compile(source, filename);
