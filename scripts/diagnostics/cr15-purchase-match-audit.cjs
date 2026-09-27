// Read-only: compare posted purchase mappings with retained source rows and earliest draft audits.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const root = path.resolve(__dirname, '../..');
const parse = value => { try { return typeof value === 'string' ? JSON.parse(value) : value; } catch { return null; } };
const normalized = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * @cc [owner:nareshshah139,label:security] purchase-match-audit-read-only
 * This diagnostic MUST use a read-only database transaction, retain evidence gaps in its report,
 * and MUST NOT alter stock based solely on scores or name differences.
 */
async function main() {
  const cli = '/Users/nshah/.nvm/versions/node/v22.12.0/lib/node_modules/@railway/cli/bin/railway';
  const variables = JSON.parse(execFileSync(cli, ['variables', '--service', 'Postgres', '--environment', 'production', '--json'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  const url = new URL(variables.DATABASE_PUBLIC_URL); url.searchParams.set('connection_limit', '1');
  const db = new PrismaClient({ datasourceUrl: url.toString() });
  try {
    const report = await db.$transaction(async tx => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout='25s'");
      const invoices = await tx.pharmacyPurchaseInvoice.findMany({ select: {
        id: true, branchId: true, invoiceNumber: true, status: true, stockCommittedAt: true, stockCommitReference: true,
        items: { orderBy: { lineNumber: 'asc' } },
        documents: { select: { id: true, fileName: true, sourceMap: true } },
      } });
      const audits = await tx.auditLog.findMany({ where: { entity: { in: ['PharmacyPurchaseInvoice', 'PurchaseProductMatch'] } }, orderBy: { timestamp: 'asc' }, select: { id: true, entity: true, entityId: true, action: true, timestamp: true, oldValues: true, newValues: true } });
      const inventoryIds = [...new Set(invoices.flatMap(invoice => invoice.items.map(item => item.inventoryItemId).filter(Boolean)))];
      const inventory = await tx.inventoryItem.findMany({ where: { id: { in: inventoryIds } }, select: { id: true, name: true, batchNumber: true, currentStock: true, unit: true, drugs: { select: { id: true, name: true } } } });
      const referenceStocks = await tx.inventoryItem.findMany({ where: { OR: [{ name: { contains: 'Abzorb', mode: 'insensitive' } }, { batchNumber: 'SGD0183' }] }, select: { id: true, name: true, batchNumber: true, currentStock: true, unit: true } });
      const postedTransactions = await tx.stockTransaction.findMany({ where: { reference: { in: invoices.map(invoice => invoice.stockCommitReference).filter(Boolean) } }, select: { itemId: true, quantity: true, type: true, reference: true, batchNumber: true } });
      const transactionInventory = await tx.inventoryItem.findMany({ where: { id: { in: postedTransactions.map(transaction => transaction.itemId) } }, select: { id: true, name: true, batchNumber: true, currentStock: true, unit: true, drugs: { select: { id: true, name: true } } } });
      const abzorbCream = await tx.drug.findMany({ where: { name: { contains: 'Abzorb 1%', mode: 'insensitive' } }, select: { id: true, name: true, inventoryItems: { select: { id: true, name: true, currentStock: true, batchNumber: true } } } });
      const sourceEvidence = invoices.filter(invoice => invoice.stockCommittedAt).map(invoice => ({ invoiceNumber: invoice.invoiceNumber,
        sourceRows: invoice.documents.flatMap(document => (parse(document.sourceMap)?.rows || []).map(row => ({ documentId: document.id, index: row.index, productName: row.values?.productName, pack: row.values?.packSize, batch: row.values?.batchNumber }))),
        earliestDraft: audits.filter(event => event.entityId === invoice.id).map(event => parse(event.action === 'DRAFT_CORRECTED' ? event.oldValues : event.newValues)).find(snapshot => Array.isArray(snapshot?.items))?.items?.map(item => ({ lineNumber: item.lineNumber, productName: item.productName, pack: item.packSize, batch: item.batchNumber })),
        postedMappings: audits.filter(event => event.entityId === invoice.id && event.action === 'PRODUCT_MAPPED').map(event => parse(event.newValues)),
      }));
      const findings = [], namedLines = [], gaps = [];
      let comparedPostedLines = 0;
      for (const invoice of invoices) {
        const history = audits.filter(event => event.entityId === invoice.id);
        for (const item of invoice.items) {
          const row = { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, status: invoice.status, lineId: item.id, lineNumber: item.lineNumber, productName: item.productName, batch: item.batchNumber, pack: item.packSize, quantity: item.quantityPurchased + item.freeQuantity, inventory: inventory.find(stock => stock.id === item.inventoryItemId) || null };
          if (/moisturex|abzorb/i.test(item.productName) || item.batchNumber === 'SGD0183') namedLines.push(row);
          if (!invoice.stockCommittedAt) continue;
          const evidence = [];
          for (const document of invoice.documents) {
            const rows = parse(document.sourceMap)?.rows || [];
            const byRef = rows.find(source => `${document.id}:${source.index}` === item.ocrSourceRef);
            const byBatch = rows.filter(source => normalized(source.values?.batchNumber) === normalized(item.batchNumber));
            const source = byRef || (byBatch.length === 1 ? byBatch[0] : null);
            if (source?.values?.productName) evidence.push({ source: `document:${document.id}:${source.index}`, productName: source.values.productName, pack: source.values.packSize });
          }
          const earliest = history.map(event => ({ event, snapshot: parse(event.action === 'DRAFT_CORRECTED' ? event.oldValues : event.newValues) })).find(({ snapshot }) => Array.isArray(snapshot?.items));
          const original = earliest?.snapshot.items.find(line => line.lineNumber === item.lineNumber && normalized(line.batchNumber) === normalized(item.batchNumber));
          if (original) evidence.push({ source: `audit:${earliest.event.id}`, productName: original.productName, pack: original.packSize });
          if (!evidence.length) gaps.push({ ...row, reason: 'No retained original row or earliest draft line available for comparison' });
          else comparedPostedLines++;
          if (evidence.some(source => normalized(source.productName) !== normalized(item.productName))) findings.push({ ...row, reason: 'Original and posted product names differ; verify original before correcting stock', evidence });
        }
      }
      const riskyConfirmations = audits.filter(event => {
        const value = parse(event.newValues);
        const reasons = value?.reasons || [];
        return event.action === 'MATCH_CONFIRMED' && ((typeof value?.score === 'number' && value.score < 65) || (reasons.length && reasons.every(reason => /manufacturer|mrp|pack/i.test(reason))) || value?.nameEvidence === false);
      }).map(({ oldValues, newValues, ...event }) => ({ ...event, original: parse(oldValues), confirmed: parse(newValues) }));
      return { checkedAt: new Date().toISOString(), readOnly: true, invoices: invoices.length, postedInvoices: invoices.filter(invoice => invoice.stockCommittedAt).length,
        totalLines: invoices.reduce((sum, invoice) => sum + invoice.items.length, 0), comparedPostedLines,
        confirmationEvents: audits.filter(event => event.action === 'MATCH_CONFIRMED').length,
        historicalScoreCoverage: 'Older confirmations did not record their scores or original names; source/draft evidence is used where available.',
        namedLines, referenceStocks, abzorbCream, postedTransactions, transactionInventory, sourceEvidence, findings, riskyConfirmations, gaps, stockCorrectionsApplied: 0 };
    }, { timeout: 60000, isolationLevel: 'RepeatableRead' });
    const directory = path.join(root, 'output/cr15'); fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'production-match-audit.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
    console.log(JSON.stringify(report, null, 2));
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(String(error.message).replace(/postgres(?:ql)?:\/\/[^\s]+/g, '[redacted]')); process.exitCode = 1; });
