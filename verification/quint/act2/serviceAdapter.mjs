// Drives the real PharmacyPartnerSalesService over HTTP, on an isolated Postgres schema that
// scripts/stack/boot.cjs creates, seeds and drops. Each trace gets its own partner, sale and batches.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const { bootStack } = createRequire(import.meta.url)('../../../scripts/stack/boot.cjs');

// MUTANT removes one guard from the real service source before boot; the file is restored on exit.
const SERVICE = new URL('../../../backend/src/modules/pharmacy/pharmacy-partner-sales.service.ts', import.meta.url);
const PRECHECK = [`          if ((sale.version ?? 0) !== dto.expectedVersion)
            throw new ConflictException(
              'Partner sale changed. Refresh before retrying outstanding stock.',
            );
`, ''];
const MUTANTS = {
  'no-precheck': [PRECHECK],                                                        // :332 only; the claim at :335 still checks
  'no-version-check': [PRECHECK, ['where: { id, branchId, version: dto.expectedVersion },\n            data: {\n              version: { increment: 1 },\n              stockCommittedAt',
    'where: { id, branchId },\n            data: {\n              version: { increment: 1 },\n              stockCommittedAt']], // :332 and :335
  'no-done-shortcut': [['            (sale.items || []).every(', '            false && (sale.items || []).every(']], // :325
  'drop-discrepancy': [["return hasDiscrepancy ? 'RECONCILIATION_REQUIRED' : 'STOCK_COMMITTED';", "return 'STOCK_COMMITTED';"]], // :716
};
const original = fs.readFileSync(SERVICE, 'utf8');
const restore = () => fs.writeFileSync(SERVICE, original);
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
  label: 'quint-act2',
  backendOnly: true,
});
const { email, password } = stack.users.pharmacist;
const login = await fetch(`${stack.api}/auth/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: email, password }),
});
assert.equal(login.status, 201, 'pharmacist login');
const { access_token } = await login.json();

async function call(path, body) {
  const r = await fetch(stack.api + path, {
    method: 'POST', body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', authorization: `Bearer ${access_token}` },
  });
  if (r.status >= 500 || r.status === 401 || r.status === 403) throw Error(`${path} ${r.status} ${await r.text()}`);
  return r.status < 300 ? 'Ok' : 'Refused';
}

let n = 0;
const batch = (currentStock) => stack.db.inventoryItem.create({
  data: {
    branchId: stack.branch.id, name: 'Quint partner medicine', batchNumber: `QUINT-${++n}`, currentStock,
    costPrice: 1, sellingPrice: 2, mrp: 2, type: 'MEDICINE', unit: 'PIECES', status: 'ACTIVE',
  },
});

export async function open({ onHand }) {
  const first = await batch(onHand);
  const partner = await stack.db.partnerOrganization.create({ data: { branchId: stack.branch.id, name: `Quint partner ${n}` } });
  assert.equal(await call('/pharmacy/partner-sales', {
    partnerOrganizationId: partner.id, date: new Date().toISOString().slice(0, 10),
    items: [{ medicineName: first.name, batchNumber: first.batchNumber, quantitySold: 7, mrp: 2, discountGiven: 0, paymentMode: 'CASH' }],
  }), 'Ok');
  const { id, status, items: [line] } = await stack.db.partnerDailySale.findFirstOrThrow({
    where: { partnerOrganizationId: partner.id }, include: { items: true },
  });
  assert.equal(status, 'SUBMITTED', 'a late entry starts in RECONCILIATION_REQUIRED; rerun before 22:00 UTC');
  return {
    async apply(action, { v, available }) {
      if (action === 'commitStock') return call(`/pharmacy/partner-sales/${id}/commit-stock`, { expectedVersion: v });
      const target = await batch(available);
      return call(`/pharmacy/partner-sales/${id}/items/${line.id}/reconcile`, { expectedVersion: v, inventoryItemId: target.id, reason: 'Quint replay' });
    },
    async view() {
      const sale = await stack.db.partnerDailySale.findUniqueOrThrow({ where: { id }, include: { items: true } });
      const item = sale.items[0];
      const b = await stack.db.inventoryItem.findUniqueOrThrow({ where: { id: item.recoveryInventoryItemId ?? first.id } });
      return { status: sale.status, version: sale.version, committed: item.committedQuantity, onHand: b.currentStock - b.heldStock };
    },
  };
}

export async function close() {
  await stack.stop();
  restore();
}
