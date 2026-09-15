#!/usr/bin/env node
// @cc [owner:nareshshah139,label:validation] migration-probe-new-database-only
// This probe MUST create its own inventory_migration_integrity_* database on local :55443,
// apply the supplied baseline and migration there, and never connect to the guide database.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { randomUUID, createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const prior = '/tmp/inventory-schema-before.prisma';
const migration = root + '/backend/prisma/migrations/20260914143000_inventory_workflow/migration.sql';
const database = 'inventory_migration_integrity_' + randomUUID().replaceAll('-', '').slice(0, 16);
assert.match(database, /^inventory_migration_integrity_[a-f0-9]{16}$/);
const url = `postgresql://invoice_review@127.0.0.1:55443/${database}?schema=public`;
const psql = '/opt/homebrew/bin/psql';
const args = ['-X', '-q', '-A', '-t', '-h', '127.0.0.1', '-p', '55443', '-U', 'invoice_review', '-d', database, '-v', 'ON_ERROR_STOP=1'];
const sql = query => execFileSync(psql, [...args, '-c', query], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const json = query => JSON.parse(sql(query));
const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const results = [];
const evidence = { generatedAt: new Date().toISOString(), database, server: '127.0.0.1:55443', guideDatabaseAccessed: false, results };
const test = (name, run) => { try { const detail = run(); results.push({ name, status: 'PASS', ...(detail ? { detail } : {}) }); } catch (error) { results.push({ name, status: 'FAIL', error: error.message }); throw error; } };
try {
  const migrationText = fs.readFileSync(migration, 'utf8');
  const statements = migrationText.replace(/--[^\n]*/g, '').split(';').map(s => s.trim()).filter(Boolean);
  evidence.inputHashes = { baselineSchema: hash(fs.readFileSync(prior)), migrationSql: hash(migrationText), targetSchema: hash(fs.readFileSync(root + '/backend/prisma/schema.prisma')) };
  test('Every migration statement is additive DDL; no destructive DML, drops, rename or type replacement', () => {
    for (const statement of statements) {
      assert.match(statement, /^(?:CREATE (?:UNIQUE )?INDEX|CREATE TABLE|ALTER TABLE "[^"]+" ADD (?:COLUMN|CONSTRAINT))\b/);
      assert.doesNotMatch(statement, /\b(?:DROP|TRUNCATE|RENAME)\b/i);
      assert.doesNotMatch(statement, /^(?:UPDATE|DELETE|INSERT|MERGE|COPY|DO|CALL)\b/i);
      if (statement.startsWith('ALTER TABLE')) assert.doesNotMatch(statement, /\bALTER COLUMN\b/i);
    }
    const counts = { statements: statements.length, addedColumns: (migrationText.match(/ADD COLUMN/g) || []).length, newTables: statements.filter(s => s.startsWith('CREATE TABLE')).length, newIndexes: statements.filter(s => /^CREATE (UNIQUE )?INDEX/.test(s)).length, newForeignKeys: statements.filter(s => s.startsWith('ALTER TABLE') && s.includes('FOREIGN KEY')).length };
    assert.deepEqual(counts, { statements: 37, addedColumns: 11, newTables: 9, newIndexes: 19, newForeignKeys: 3 });
    evidence.ddl = counts; return counts;
  });
  execFileSync('/opt/homebrew/bin/createdb', ['-h', '127.0.0.1', '-p', '55443', '-U', 'invoice_review', database], { stdio: ['ignore', 'pipe', 'pipe'] });
  assert.equal(sql('SELECT current_database()'), database);
  const baselineSql = execFileSync(root + '/node_modules/.bin/prisma', ['migrate', 'diff', '--from-empty', '--to-schema-datamodel', prior, '--script'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 8 * 1024 * 1024 });
  const baselineFile = `/tmp/${database}_baseline.sql`;
  fs.writeFileSync(baselineFile, baselineSql); evidence.inputHashes.baselineSql = hash(baselineSql);
  test('Full baseline schema applies to a newly created isolated database', () => {
    execFileSync(psql, [...args, '--single-transaction', '-f', baselineFile], { stdio: ['ignore', 'pipe', 'pipe'] });
    const count = Number(sql("SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")); assert(count > 50); evidence.baselineTableCount = count;
  });
  const sentinel = `
INSERT INTO branches (id,name,address,"updatedAt") VALUES ('branch-sentinel','Migration synthetic branch','TEST ONLY','2020-01-02');
INSERT INTO users (id,"firstName","lastName",email,password,role,"branchId","updatedAt") VALUES ('user-sentinel','Migration','Sentinel','migration@example.invalid','NO_LOGIN_TEST','ADMIN','branch-sentinel','2020-01-02');
INSERT INTO suppliers (id,"branchId",name,"gstNumber","updatedAt") VALUES ('supplier-sentinel','branch-sentinel','Migration supplier','MIGRATION-GST','2020-01-02');
INSERT INTO drugs (id,"branchId",name,price,"manufacturerName","packSizeLabel","updatedAt") VALUES ('drug-sentinel','branch-sentinel','Migration mapped product',15.5,'Synthetic manufacturer','10 tablets','2020-01-02');
INSERT INTO inventory_items (id,"branchId",name,type,unit,"packSize","packUnit","currentStock","costPrice","sellingPrice",mrp,"batchNumber","expiryDate",metadata,"updatedAt") VALUES ('item-sentinel','branch-sentinel','Migration mapped product','MEDICINE','STRIPS',10,'tablets',17,10,15.5,20,'OLD-BATCH','2030-12-31','{"legacy":"preserve verbatim","stockUnit":"STRIPS"}','2020-01-02');
INSERT INTO "_DrugToInventoryItem" ("A","B") VALUES ('drug-sentinel','item-sentinel');
INSERT INTO stock_transactions (id,"branchId","itemId","userId",type,quantity,"unitPrice","totalAmount",reference,notes,"updatedAt") VALUES
 ('movement-purchase','branch-sentinel','item-sentinel','user-sentinel','PURCHASE',20,10,200,'OLD-RECEIPT','Legacy stock basis','2020-01-02'),
 ('movement-sale','branch-sentinel','item-sentinel','user-sentinel','SALE',3,15.5,46.5,'OLD-SALE','Historical sale terms','2020-01-02');
INSERT INTO pharmacy_purchase_invoices (id,"branchId","supplierId","distributorName","distributorGstin","distributorDlNo","invoiceNumber","invoiceDate","billType","doctorNameOrRegNo","grossAmount","taxableAmount","totalGst","netPayable",status,"stockCommitReference","updatedAt") VALUES
 ('invoice-sentinel','branch-sentinel','supplier-sentinel','Migration supplier','MIGRATION-GST','TEST-DL','OLD-001','2020-01-01','CREDIT','TEST',200,200,24,224,'STOCK_COMMITTED','OLD-RECEIPT','2020-01-02'),
 ('invoice-draft','branch-sentinel','supplier-sentinel','Migration supplier','MIGRATION-GST','TEST-DL','OLD-002','2020-01-01','CREDIT','TEST',50,50,6,56,'DRAFT',null,'2020-01-02');
INSERT INTO pharmacy_purchase_invoice_items (id,"purchaseInvoiceId","lineNumber","productName",manufacturer,"packSize","packUnitType","hsnCode","batchNumber","expiryMonth","expiryYear","quantityPurchased","freeQuantity",mrp,"discountPercent","purchaseRate","taxableAmount","gstAmount","lineTotal","updatedAt") VALUES ('line-sentinel','invoice-sentinel',1,'Migration mapped product','Synthetic manufacturer','10 tablets','STRIPS','3004','OLD-BATCH',12,2030,18,2,20,0,10,200,24,224,'2020-01-02');
INSERT INTO pharmacy_purchase_invoice_documents (id,"branchId","purchaseInvoiceId","uploadedBy","fileName","mimeType","sizeBytes",sha256,data,"sourceMap") VALUES ('original-sentinel','branch-sentinel','invoice-sentinel','user-sentinel','retained-sentinel.bin','application/octet-stream',8,'${hash(Buffer.from('00010203fffe4142', 'hex'))}',decode('00010203fffe4142','hex'),'{"page":1,"original":true}');
INSERT INTO pharmacy_purchase_payments (id,"branchId","distributorGstin","distributorName","paymentDate",mode,"paidBy",amount,"updatedAt") VALUES
 ('payment-one','branch-sentinel','MIGRATION-GST','Migration supplier','2020-01-02','CASH','user-sentinel',30,'2020-01-02'),
 ('payment-two','branch-sentinel','MIGRATION-GST','Migration supplier','2020-01-03','CASH','user-sentinel',20,'2020-01-02');
INSERT INTO pharmacy_purchase_payment_allocations (id,"paymentId","purchaseInvoiceId",amount) VALUES ('allocation-one','payment-one','invoice-sentinel',30),('allocation-two','payment-two','invoice-sentinel',20);
`;
  sql(sentinel);
  const tables = ['branches', 'users', 'suppliers', 'drugs', 'inventory_items', '_DrugToInventoryItem', 'stock_transactions', 'pharmacy_purchase_invoices', 'pharmacy_purchase_invoice_items', 'pharmacy_purchase_invoice_documents', 'pharmacy_purchase_payments', 'pharmacy_purchase_payment_allocations'];
  const columns = {};
  for (const table of tables) columns[table] = json(`SELECT json_agg(column_name ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='${table}'`);
  const snapshot = () => Object.fromEntries(tables.map(table => [table, json(`SELECT coalesce(json_agg(t ORDER BY row_to_json(t)::text),'[]'::json) FROM (SELECT ${columns[table].map(c => `"${c}"`).join(',')} FROM "${table}") t`)]));
  let before;
  test('Baseline sentinels cover twelve existing tables, quantities, money, foreign links and binary original', () => {
    before = snapshot(); assert.equal(Object.keys(before).length, 12); assert.equal(before.inventory_items[0].currentStock, 17);
    evidence.sentinels = Object.fromEntries(tables.map(table => [table, { rows: before[table].length, columns: columns[table].length, beforeSha256: hash(before[table]) }]));
    evidence.originalSha256 = hash(Buffer.from('00010203fffe4142', 'hex'));
  });
  test('The regenerated migration applies successfully over populated baseline data', () => {
    execFileSync(psql, [...args, '--single-transaction', '-f', migration], { stdio: ['ignore', 'pipe', 'pipe'] });
    assert.equal(sql('SELECT current_database()'), database);
  });
  test('Every pre-existing sentinel column and row survives byte-for-byte JSON comparison', () => {
    const after = snapshot(); assert.deepEqual(after, before);
    for (const table of tables) { evidence.sentinels[table].afterSha256 = hash(after[table]); assert.equal(evidence.sentinels[table].afterSha256, evidence.sentinels[table].beforeSha256); }
  });
  test('Added fields receive safe defaults; historical movement direction is left unknown', () => {
    assert.equal(sql('SELECT "heldStock" FROM inventory_items WHERE id=\'item-sentinel\''), '0');
    assert.equal(sql('SELECT count(*) FROM stock_transactions WHERE "quantityDelta" IS NULL'), '2');
    assert.equal(sql('SELECT count(*) FROM suppliers WHERE "drugLicenseNo" IS NULL AND "foodLicenseNo" IS NULL'), '1');
    assert.equal(sql('SELECT count(*) FROM pharmacy_purchase_invoices WHERE "actionVersion"=1 AND "creditApplied"=0 AND "workflowReceiptId" IS NULL AND "actionMetadata" IS NULL'), '2');
    assert.equal(sql('SELECT count(*) FROM pharmacy_purchase_invoice_items WHERE "schemeAmount"=0 AND "inventoryItemId" IS NULL'), '1');
    assert.equal(sql('SELECT count(*) FROM pharmacy_purchase_payments WHERE "requestKey" IS NULL'), '2');
  });
  test('Declared stock units, supplier payable balance, product link and original bytes remain correct', () => {
    const item = json('SELECT row_to_json(t) FROM (SELECT "currentStock",unit,"packSize","packUnit","costPrice","sellingPrice" FROM inventory_items WHERE id=\'item-sentinel\') t');
    assert.deepEqual(item, { currentStock: 17, unit: 'STRIPS', packSize: 10, packUnit: 'tablets', costPrice: 10, sellingPrice: 15.5 });
    assert.equal(Number(sql('SELECT "netPayable"-(SELECT sum(amount) FROM pharmacy_purchase_payment_allocations WHERE "purchaseInvoiceId"=\'invoice-sentinel\') FROM pharmacy_purchase_invoices WHERE id=\'invoice-sentinel\'')), 174);
    assert.equal(sql('SELECT count(*) FROM "_DrugToInventoryItem" WHERE "A"=\'drug-sentinel\' AND "B"=\'item-sentinel\''), '1');
    assert.equal(hash(Buffer.from(sql('SELECT encode(data,\'hex\') FROM pharmacy_purchase_invoice_documents WHERE id=\'original-sentinel\''), 'hex')), evidence.originalSha256);
    assert.equal(sql('SELECT sha256 FROM pharmacy_purchase_invoice_documents WHERE id=\'original-sentinel\''), evidence.originalSha256);
    evidence.preserved = { currentStock: 17, unit: 'STRIPS', packSize: 10, physicalBaseEquivalent: 170, payableAfterRecordedPayments: 174, originalByteCount: 8 };
  });
  test('All nine new tables exist empty without synthesizing transactions or credits from history', () => {
    const newTables = statements.filter(s => s.startsWith('CREATE TABLE')).map(s => s.match(/^CREATE TABLE "([^"]+)"/)[1]);
    for (const table of newTables) assert.equal(sql(`SELECT count(*) FROM "${table}"`), '0');
    assert.equal(Number(sql("SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")), evidence.baselineTableCount + 9);
  });
  test('New idempotency and foreign-key constraints reject duplicate or orphaned workflow records', () => {
    sql(`INSERT INTO inventory_workflow_documents (id,"branchId",kind,reference,payload,"requestKey","createdBy","updatedAt") VALUES ('workflow-new','branch-sentinel','COUNT','NEW-COUNT','{"lines":[]}','same-request','user-sentinel','2020-01-02')`);
    assert.throws(() => sql(`INSERT INTO inventory_workflow_documents (id,"branchId",kind,reference,payload,"requestKey","createdBy","updatedAt") VALUES ('workflow-duplicate','branch-sentinel','COUNT','DUPLICATE','{"lines":[]}','same-request','user-sentinel','2020-01-02')`), /unique constraint/);
    assert.throws(() => sql(`INSERT INTO inventory_workflow_events (id,"documentId","branchId","actorId",action,"toStatus",version,detail) VALUES ('event-orphan','missing','branch-sentinel','user-sentinel','POST','POSTED',1,'{}')`), /foreign key constraint/);
    assert.equal(sql('SELECT count(*) FROM inventory_workflow_documents'), '1'); assert.equal(sql('SELECT count(*) FROM inventory_workflow_events'), '0');
  });
  test('Applied database schema exactly matches the current Prisma target with no remaining schema diff', () => {
    const diff = execFileSync(root + '/node_modules/.bin/prisma', ['migrate', 'diff', '--from-url', url, '--to-schema-datamodel', root + '/backend/prisma/schema.prisma', '--exit-code', '--script'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 8 * 1024 * 1024 });
    assert.match(diff, /empty migration/i); evidence.remainingSchemaDiff = diff.trim();
    assert.equal(hash(fs.readFileSync(prior)), evidence.inputHashes.baselineSchema);
    assert.equal(hash(fs.readFileSync(migration)), evidence.inputHashes.migrationSql);
    assert.equal(hash(fs.readFileSync(root + '/backend/prisma/schema.prisma')), evidence.inputHashes.targetSchema);
  });
} catch (error) {
  evidence.error = error.message;
  process.exitCode = 1;
} finally {
  evidence.passed = results.filter(r => r.status === 'PASS').length; evidence.total = results.length;
  evidence.basis = 'Synthetic sentinels in a newly created local database. Existing guide/acceptance databases were not accessed. This is not a production-scale locking or rollout test. Isolated database retained for inspection.';
  fs.mkdirSync(root + '/output/diagnostics/inventory-workflow', { recursive: true });
  fs.writeFileSync(root + '/output/diagnostics/inventory-workflow/migration-db-proof.json', JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ database, passed: evidence.passed, total: evidence.total, results, error: evidence.error }, null, 2));
}
