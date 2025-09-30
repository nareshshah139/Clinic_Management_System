import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type TemplateItem = {
  drugName?: string;
  mrp?: number;
  [key: string]: any;
};

async function main() {
  console.log('🔎 Auditing prescription templates vs Drug table...');

  // Detect whether the model exists in this deployment
  const hasTemplatesModel = (prisma as any).prescriptionTemplate &&
    typeof (prisma as any).prescriptionTemplate.findMany === 'function';

  if (!hasTemplatesModel) {
    console.log('ℹ️ PrescriptionTemplate model not found in Prisma client. Skipping template audit.');
    await prisma.$disconnect();
    process.exit(0);
  }

  const templates = await (prisma as any).prescriptionTemplate.findMany({
    select: {
      id: true,
      name: true,
      items: true,
      branchId: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!templates || templates.length === 0) {
    console.log('ℹ️ No prescription templates found. Nothing to audit.');
    await prisma.$disconnect();
    process.exit(0);
  }

  // Build a per-branch cache of Drug name -> price
  const branchIds: string[] = Array.from(new Set((templates as Array<any>).map((t) => String(t.branchId || '')).filter((b) => !!b)));
  const drugMapByBranch = new Map<string, Map<string, number>>();

  for (const branchId of branchIds) {
    const drugs: Array<{ name: string; price: number }> = await prisma.drug.findMany({
      where: { branchId: String(branchId) },
      select: { name: true, price: true },
    }) as any;
    const map = new Map<string, number>();
    for (const d of drugs) {
      map.set(String(d.name), Number(d.price));
    }
    drugMapByBranch.set(branchId, map);
  }

  const results: Array<{
    templateId: string;
    templateName: string;
    branchId: string;
    missingInDb: Array<{ index: number; drugName: string }>;
    priceMismatch: Array<{ index: number; drugName: string; templateMrp?: number; dbPrice?: number }>;
    okCount: number;
    totalItems: number;
  }> = [];

  for (const t of templates) {
    let items: TemplateItem[] = [];
    try {
      items = Array.isArray(t.items) ? (t.items as any) : JSON.parse((t.items as unknown as string) || '[]');
    } catch {
      items = [];
    }

    const branchDrugMap = drugMapByBranch.get(t.branchId) || new Map<string, number>();
    const missingInDb: Array<{ index: number; drugName: string }> = [];
    const priceMismatch: Array<{ index: number; drugName: string; templateMrp?: number; dbPrice?: number }> = [];
    let okCount = 0;

    items.forEach((item, index) => {
      const name = String(item?.drugName || '').trim();
      if (!name) return;
      const dbPrice = branchDrugMap.get(name);
      if (dbPrice === undefined) {
        missingInDb.push({ index, drugName: name });
        return;
        }
      // If template has mrp, compare; otherwise consider it ok (will be enriched server-side)
      if (item.mrp !== undefined && item.mrp !== null) {
        const mrpNum = Number(item.mrp);
        if (Number.isFinite(mrpNum) && Math.abs(mrpNum - dbPrice) < 0.0001) {
          okCount += 1;
        } else {
          priceMismatch.push({ index, drugName: name, templateMrp: mrpNum, dbPrice });
        }
      } else {
        // No mrp on template item; since server enriches on fetch/create, treat as ok
        okCount += 1;
      }
    });

    results.push({
      templateId: t.id,
      templateName: t.name,
      branchId: t.branchId,
      missingInDb,
      priceMismatch,
      okCount,
      totalItems: items.length,
    });
  }

  let totalTemplates = results.length;
  let totalItems = results.reduce((s, r) => s + r.totalItems, 0);
  let totalMissing = results.reduce((s, r) => s + r.missingInDb.length, 0);
  let totalMismatch = results.reduce((s, r) => s + r.priceMismatch.length, 0);

  console.log('\n===== Template Audit Summary =====');
  console.log(`Templates scanned: ${totalTemplates}`);
  console.log(`Template items scanned: ${totalItems}`);
  console.log(`Missing in DB: ${totalMissing}`);
  console.log(`Price mismatches: ${totalMismatch}`);

  for (const r of results) {
    if (r.missingInDb.length === 0 && r.priceMismatch.length === 0) continue;
    console.log(`\nTemplate: ${r.templateName} (${r.templateId}) [branch=${r.branchId}]`);
    if (r.missingInDb.length > 0) {
      console.log('  - Missing in DB:');
      for (const m of r.missingInDb) {
        console.log(`    • [${m.index}] ${m.drugName}`);
      }
    }
    if (r.priceMismatch.length > 0) {
      console.log('  - Price mismatches:');
      for (const p of r.priceMismatch) {
        console.log(`    • [${p.index}] ${p.drugName}: template=${p.templateMrp} vs db=${p.dbPrice}`);
      }
    }
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('❌ Audit failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});


