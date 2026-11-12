import { PrismaClient } from '@prisma/client';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { applyMedicineNamePlan, backfillItemSelect, MedicineNamePlan, planMedicineNames, planReviewFiles } from '../src/modules/inventory/medicine-name-backfill';

const usage = `Usage (DATABASE_URL set):
  plan <branchId> <actorUserId> <newOutputDir>   writes plan.json, changes.csv, could-not-read.csv, missing-strength.csv, needs-unit.csv
  rehearse <plan.json>                           applies inside a transaction, reports, rolls back; rewrites changes.csv beside the plan
  apply <plan.json>                              applies with an audit entry per item; re-running is a no-op`;

const firstChanges = (plan: MedicineNamePlan) =>
  plan.changes.slice(0, 20).map((c) => `${c.expected.name}  ->  ${c.next.name}  [${c.strengthSource}]`).join('\n');

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
      for (const [file, content] of Object.entries(planReviewFiles(plan))) fs.writeFileSync(path.join(c, file), content, { flag: 'wx' });
      console.log(firstChanges(plan));
      console.log(JSON.stringify({
        items: items.length, changes: plan.changes.length, couldNotRead: plan.unparsed.length, missingStrength: plan.missingStrength.length,
        needsUnit: plan.needsUnit.length, alreadyStandard: plan.alreadyStandard, notMedicine: plan.notMedicine, dir: c,
      }));
    } else if ((mode === 'rehearse' || mode === 'apply') && a) {
      const plan: MedicineNamePlan = JSON.parse(fs.readFileSync(a, 'utf8'));
      if (mode === 'rehearse') {
        fs.writeFileSync(path.join(path.dirname(a), 'changes.csv'), planReviewFiles(plan)['changes.csv']);
        console.log(firstChanges(plan));
      }
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
