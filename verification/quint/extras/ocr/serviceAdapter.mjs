// Drives the real PharmacyPurchaseInvoiceService over HTTP, on an isolated Postgres schema that
// scripts/stack/boot.cjs creates, seeds and drops. Each trace gets its own bill; the supplier and the drug are shared.
import { clinicPath } from '../../clinic.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const { bootStack } = createRequire(import.meta.url)(clinicPath('scripts/stack/boot.cjs'));

// MUTANT removes one guard from the real service source before boot; the file is restored on exit.
// Each entry is [from, to] pairs and each `from` must occur once. Line numbers are at 09d2709.
const SERVICE = clinicPath('backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts');
const REVIEW_REVISION = [`if (dto.expectedUpdatedAt && new Date(dto.expectedUpdatedAt).getTime() !== new Date(invoice.updatedAt).getTime()) {`, 'if (false) {']; // :1323
const COMMIT_PRECHECK = [`    if (invoice.status !== 'REVIEWED') {
      throw new BadRequestException(
        \`Only reviewed`, `    if (false) {
      throw new BadRequestException(
        \`Only reviewed`]; // :1666
const COMMIT_CLAIM = [`        status: 'REVIEWED',
        stockCommittedAt: null,
      },
      data: {
        status: 'STOCK_COMMITTED',`, `        stockCommittedAt: null,
      },
      data: {
        status: 'STOCK_COMMITTED',`]; // :1475
const REJECT_PRECHECK = [`if (before.stockCommittedAt || before.status === 'STOCK_COMMITTED') throw new ConflictException('Posted stock cannot be rejected.`, `if (false) throw new ConflictException('Posted stock cannot be rejected.`]; // :455
const REJECT_REVISION = [`stockCommittedAt: null, updatedAt: revision,`, 'stockCommittedAt: null,']; // :456
const REJECT_POSTED = [`stockCommittedAt: null, updatedAt: revision,`, 'updatedAt: revision,']; // :456
const REJECT_STATUSES = [`status: { in: ['DRAFT', 'OCR_REVIEW_REQUIRED', 'RECONCILIATION_FAILED', 'REVIEWED'] } }, data: { status: 'CANCELLED' }`,
  `status: { in: ['DRAFT', 'OCR_REVIEW_REQUIRED', 'RECONCILIATION_FAILED', 'REVIEWED', 'STOCK_COMMITTED'] } }, data: { status: 'CANCELLED' }`]; // :457
const REOPEN_PRECHECK = [`if (before.status !== 'REVIEWED' || before.stockCommittedAt) {`, 'if (before.stockCommittedAt) {']; // :1402
const REOPEN_CLAIM = `where: { id, branchId, status: 'REVIEWED', stockCommittedAt: null, updatedAt: expectedUpdatedAt },`; // :1406
const REOPEN_STATUS = [REOPEN_CLAIM, `where: { id, branchId, stockCommittedAt: null, updatedAt: expectedUpdatedAt },`];
const REOPEN_REVISION = [REOPEN_CLAIM, `where: { id, branchId, status: 'REVIEWED', stockCommittedAt: null },`];
const MUTANTS = {
  'no-review-revision': [REVIEW_REVISION],                               // :1323
  'no-reject-revision': [REJECT_REVISION],                               // :456
  'no-reopen-revision': [REOPEN_REVISION],                               // :1406
  'reopen-any-status': [REOPEN_PRECHECK, REOPEN_STATUS],                 // :1402 and :1406
  'no-commit-status': [COMMIT_PRECHECK, COMMIT_CLAIM],                   // :1666 and :1475
  'no-commit-idempotent': [[`    if (invoice.status === 'STOCK_COMMITTED' || invoice.stockCommittedAt) {
      return this.formatPurchaseInvoice(invoice);
    }

    this.assertPurchaseInvoiceCanCommit(invoice);`, '    this.assertPurchaseInvoiceCanCommit(invoice);']], // :1463
  'no-lowconf-check': [[`if (['OCR', 'GMAIL'].includes(dto.source || '') && (item.ocrConfidence === undefined || item.ocrConfidence < 0.98)) {`, 'if (false) {']], // :594
  'reject-posted': [REJECT_PRECHECK, REJECT_POSTED, REJECT_STATUSES],     // :455, :456 and :457
  'no-edit-guard': [[`where: { id, branchId, status: { in: ['DRAFT', 'OCR_REVIEW_REQUIRED', 'RECONCILIATION_FAILED'] },`, 'where: { id, branchId,']], // :1089
  'no-review-flag-check': [[`if (current.unresolvedOcrFlags > 0) {`, 'if (false) {']], // :1343
  'no-commit-precheck': [COMMIT_PRECHECK],                               // :1666 only; the claim at :1475 still checks
  'no-claim-status': [COMMIT_CLAIM],                                     // :1475 only; the check at :1666 still runs
  'no-reject-precheck': [REJECT_PRECHECK],                               // :455 only; the claim at :456-457 still checks
};
const original = fs.readFileSync(SERVICE, 'utf8');
const restore = () => process.env.MUTANT && fs.writeFileSync(SERVICE, original);
if (process.env.MUTANT) {
  const edits = MUTANTS[process.env.MUTANT];
  assert(edits, `unknown MUTANT; one of ${Object.keys(MUTANTS).join(', ')}`);
  process.on('exit', restore);
  fs.writeFileSync(SERVICE, edits.reduce((src, [from, to]) => {
    assert.equal(src.split(from).length, 2, `mutant text must occur once: ${from.slice(0, 60)}`);
    return src.replace(from, to);
  }, original));
}
const stack = await bootStack({
  databaseUrl: process.env.STACK_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/clinic_stack',
  label: 'quint-ocr',
  backendOnly: true,
});
const { email, password } = stack.users.pharmacist;
const login = await fetch(`${stack.api}/auth/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: email, password }),
});
assert.equal(login.status, 201, 'pharmacist login');
const { access_token } = await login.json();

const GSTIN = '36ABCDE1234F1Z5';
await stack.db.supplier.create({ data: { branchId: stack.branch.id, name: 'Quint Supplier', gstNumber: GSTIN } });
await stack.db.drug.create({ data: {
  branchId: stack.branch.id, name: 'Quint Cream', manufacturerName: 'Quint Pharma', packSizeLabel: '20g', price: 150,
  composition1: 'Quint', category: 'Topical', dosageForm: 'Cream', strength: '1%',
} });

async function call(method, path, body) {
  const r = await fetch(stack.api + path, {
    method, body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', authorization: `Bearer ${access_token}` },
  });
  const text = await r.text();
  if (r.status >= 500 || r.status === 401 || r.status === 403 || r.status === 404) throw Error(`${method} ${path} ${r.status} ${text}`);
  return { reply: r.status < 300 ? 'Ok' : 'Refused', json: r.status < 300 ? JSON.parse(text) : undefined };
}

// One line, 1000 taxable at 12% GST. The three flags are the ones the spec's edit sets.
const draftBody = (invoiceNumber, batchNumber, { ocr, issues, lowConf }) => ({
  distributorName: 'Quint Supplier', distributorGstin: GSTIN, distributorDlNo: 'QUINT-DL',
  invoiceNumber, invoiceDate: '2026-01-01', goodsReceivedDate: '2026-01-02', billType: 'CASH', doctorNameOrRegNo: 'Quint Clinic', source: 'OCR',
  grossAmount: 1000, taxableAmount: 1000, totalCgst: 60, totalSgst: 60, totalIgst: 0, totalGst: 120, netPayable: issues ? 1125 : 1120,
  items: [{
    productName: 'Quint Cream', manufacturer: 'Quint Pharma', packSize: '20g', packUnitType: 'Tube', hsnCode: '3004', batchNumber,
    expiryMonth: 12, expiryYear: 2099, quantityPurchased: 10, freeQuantity: 2, mrp: 150, purchaseRate: 100, discountPercent: 0,
    taxableAmount: 1000, cgstPercent: 6, sgstPercent: 6, igstPercent: 0, gstAmount: 120, lineTotal: 1120,
    ocrConfidence: lowConf ? 0.5 : 0.99, ...(ocr ? { ocrFlags: ['low_confidence_batchNumber'] } : {}),
  }],
});

let n = 0;
export async function open(content) {
  const invoiceNumber = `QUINT-${process.pid}-${++n}`, batchNumber = `QB-${process.pid}-${n}`;
  const created = await call('POST', '/pharmacy/purchase-invoices/drafts', draftBody(invoiceNumber, batchNumber, content));
  assert.equal(created.reply, 'Ok');
  const path = `/pharmacy/purchase-invoices/${created.json.id}`, draftPath = `/pharmacy/purchase-invoices/drafts/${created.json.id}`;
  const reason = 'Quint replay';
  return {
    async apply(action, { expected, content }) {
      const { reply } = await {
        edit: () => call('PATCH', draftPath, draftBody(invoiceNumber, batchNumber, content)),
        review: () => call('PATCH', `${path}/review`, { expectedUpdatedAt: expected }),
        reopen: () => call('POST', `${path}/reopen-review`, { expectedUpdatedAt: expected, reason }),
        reject: () => call('POST', `${path}/reject`, { expectedUpdatedAt: expected, reason }),
        commit: () => call('POST', `${path}/commit-stock`, {}),
        process: () => call('POST', `${path}/process`, {}),
      }[action]();
      return reply;
    },
    async view() {
      const row = await stack.db.pharmacyPurchaseInvoice.findUniqueOrThrow({ where: { id: created.json.id } });
      const posts = await stack.db.stockTransaction.count({ where: { type: 'PURCHASE', reference: { startsWith: `PINV-${invoiceNumber}-` } } });
      return {
        status: row.status, committed: row.stockCommittedAt !== null, ocr: row.unresolvedOcrFlags > 0,
        issues: JSON.parse(row.reconciliationIssues ?? '[]').length > 0, posts, updatedAt: row.updatedAt.toISOString(),
      };
    },
  };
}

export async function close() {
  await stack.stop();
  restore();
}
