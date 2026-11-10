import { PrismaClient } from '@prisma/client';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { applyMedicineNamePlan, backfillItemSelect, MedicineNamePlan, planMedicineNames } from '../src/modules/inventory/medicine-name-backfill';

const usage = `Usage (DATABASE_URL set):
  plan <branchId> <actorUserId> <newOutputDir>   writes plan.json, could-not-read.csv, missing-strength.csv
  rehearse <plan.json>                           applies inside a transaction, reports, rolls back
  apply <plan.json>                              applies with an audit entry per item; re-running is a no-op`;

const csv = (rows: Record<string, unknown>[], columns: string[]) =>
  [columns.join(','), ...rows.map((row) => columns.map((c) => `"${String(row[c] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n') + '\n';

async function main() {
  const [mode, a, b, c] = process.argv.slice(2);
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
  try {
    if (mode === 'plan' && a && b && c) {
      fs.mkdirSync(c, { recursive: false, mode: 0o700 });
      const items = await db.inventoryItem.findMany({ where: { branchId: a }, select: backfillItemSelect });
      const plan = planMedicineNames(items as any, a, b);
      fs.writeFileSync(path.join(c, 'plan.json'), JSON.stringify(plan, null, 2), { mode: 0o600, flag: 'wx' });
      fs.writeFileSync(path.join(c, 'could-not-read.csv'), csv(plan.unparsed, ['id', 'type', 'name', 'reason', 'message']), { flag: 'wx' });
      fs.writeFileSync(path.join(c, 'missing-strength.csv'), csv(plan.missingStrength, ['id', 'name', 'recordedName']), { flag: 'wx' });
      console.log(JSON.stringify({ items: items.length, changes: plan.changes.length, couldNotRead: plan.unparsed.length, missingStrength: plan.missingStrength.length, alreadyStandard: plan.alreadyStandard, dir: c }));
    } else if ((mode === 'rehearse' || mode === 'apply') && a) {
      const plan: MedicineNamePlan = JSON.parse(fs.readFileSync(a, 'utf8'));
      console.log(JSON.stringify(await applyMedicineNamePlan(db, plan, { rollback: mode === 'rehearse' })));
    } else throw new Error(usage);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(String(error.message).replace(/postgres(?:ql)?:\/\/\S+/g, '[redacted]'));
  process.exitCode = 1;
});
