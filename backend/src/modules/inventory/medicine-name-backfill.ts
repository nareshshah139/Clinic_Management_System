import { randomUUID } from 'node:crypto';
import { retainPreviousInventoryName } from './inventory-names';
import { jsonObject } from './inventory-stock';
import { nameNeedsUnit, parseRecordedName } from './medicine-name-parser';
import { strengthMissing } from './medicine-names';

export type BackfillItem = {
  id: string;
  branchId: string;
  name: string;
  type: string;
  brandName: string | null;
  genericName: string | null;
  form: string | null;
  strength: string | null;
  isCombination: boolean;
  itemCode: string | null;
  unit: string;
  packUnit: string | null;
  metadata: string | null;
  updatedAt: Date | string;
  drugs?: { dosageForm?: string | null; composition1?: string | null; composition2?: string | null }[];
};

type Naming = { name: string; brandName: string; form: string; strength: string | null; isCombination: boolean; itemCode: string | null; metadata: string };

export type MedicineNamePlan = {
  version: 1;
  operationId: string;
  branchId: string;
  actorId: string;
  createdAt: string;
  changes: { id: string; expected: { name: string; metadata: string | null; updatedAt: string }; next: Naming; strengthSource: string }[];
  unparsed: { id: string; name: string; type: string; reason: string; message: string }[];
  missingStrength: { id: string; name: string; recordedName: string }[];
  needsUnit: { id: string; name: string; recordedName: string }[];
  alreadyStandard: number;
  notMedicine: number;
};

const NAMING_FIELDS = ['name', 'brandName', 'form', 'strength', 'isCombination', 'itemCode', 'metadata'] as const;
const iso = (value: Date | string) => new Date(value).toISOString();

/**
 * Reads every medicine that has no form yet and proposes its standard-format fields. Items whose
 * recorded name cannot be read are listed, never guessed; medicines still missing a strength are
 * listed for the clinic (Q17), and those whose name carries a number without its unit are also
 * listed for the pharmacist to enter the unit. Items that already have a form, and items that are
 * not medicines, are left alone.
 */
export function planMedicineNames(items: BackfillItem[], branchId: string, actorId: string): MedicineNamePlan {
  const operationId = `medicine-names-${randomUUID()}`;
  const plan: MedicineNamePlan = {
    version: 1, operationId, branchId, actorId, createdAt: new Date().toISOString(), changes: [], unparsed: [], missingStrength: [], needsUnit: [], alreadyStandard: 0, notMedicine: 0,
  };
  for (const item of [...items].sort((a, b) => a.id.localeCompare(b.id))) {
    if (item.branchId !== branchId) throw new Error(`Item ${item.id} is not in branch ${branchId}`);
    const meta = jsonObject(item.metadata);
    if (item.form) {
      plan.alreadyStandard++;
      const listed = { id: item.id, name: item.name, recordedName: meta.nameNormalization?.recordedName ?? item.name };
      if (strengthMissing(item)) plan.missingStrength.push(listed);
      if (nameNeedsUnit({ ...item, name: item.brandName || item.name })) plan.needsUnit.push(listed);
      continue;
    }
    if (item.type !== 'MEDICINE') {
      plan.notMedicine++;
      continue;
    }
    const drug = item.drugs?.length === 1 ? item.drugs[0] : undefined;
    const parsed = parseRecordedName(item.name, {
      dosageForm: drug?.dosageForm,
      packUnit: item.packUnit,
      unit: item.unit,
      genericName: item.genericName,
      ingredients: [drug?.composition1, drug?.composition2],
    });
    if (!parsed.ok) {
      plan.unparsed.push({ id: item.id, name: item.name, type: item.type, reason: parsed.reason, message: parsed.message });
      continue;
    }
    if (parsed.standardName !== item.name) retainPreviousInventoryName(meta, item.name, true);
    meta.nameNormalization = { ...meta.nameNormalization, version: 1, standardizedBy: operationId };
    plan.changes.push({
      id: item.id,
      expected: { name: item.name, metadata: item.metadata, updatedAt: iso(item.updatedAt) },
      next: {
        name: parsed.standardName,
        brandName: parsed.name,
        form: parsed.form,
        strength: parsed.strength || null,
        isCombination: parsed.isCombination,
        itemCode: parsed.itemCode || item.itemCode || null,
        metadata: JSON.stringify(meta),
      },
      strengthSource: parsed.isCombination
        ? 'combination: none printed'
        : parsed.strength
          ? 'unit stated in recorded name'
          : parsed.needsUnit
            ? 'none: number without a unit (needs-unit.csv)'
            : 'none in recorded name',
    });
    if (parsed.strengthMissing) plan.missingStrength.push({ id: item.id, name: parsed.standardName, recordedName: item.name });
    if (parsed.needsUnit) plan.needsUnit.push({ id: item.id, name: parsed.standardName, recordedName: item.name });
  }
  return plan;
}

const csv = (rows: Record<string, unknown>[], columns: string[]) =>
  [columns.join(','), ...rows.map((row) => columns.map((c) => `"${String(row[c] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n') + '\n';

/** The files a reviewer reads before a plan is applied: every rename, and every list the clinic must act on. */
export function planReviewFiles(plan: MedicineNamePlan): Record<string, string> {
  const changes = plan.changes.map((c) => ({
    id: c.id, recordedName: c.expected.name, newName: c.next.name, form: c.next.form, strength: c.next.strength ?? '', strengthSource: c.strengthSource,
  }));
  return {
    'changes.csv': csv(changes, ['id', 'recordedName', 'newName', 'form', 'strength', 'strengthSource']),
    'could-not-read.csv': csv(plan.unparsed, ['id', 'type', 'name', 'reason', 'message']),
    'missing-strength.csv': csv(plan.missingStrength, ['id', 'name', 'recordedName']),
    'needs-unit.csv': csv(plan.needsUnit, ['id', 'name', 'recordedName']),
  };
}

/**
 * @cc [owner:nareshshah139,label:product] medicine-name-backfill-audit
 * Applying a reviewed plan MUST change only the naming fields and metadata of the planned items,
 * compare each item's captured revision, and commit an actor/reason/before-after audit with every
 * change atomically. Stock, cost, pack and drug links MUST NOT change. Applying the same plan again
 * MUST be a no-op; a stale plan MUST roll back without changing anything.
 */
export async function applyMedicineNamePlan(db: any, plan: MedicineNamePlan, options: { rollback?: boolean } = {}) {
  if (plan.version !== 1 || !plan.operationId || !plan.branchId || !plan.actorId) throw new Error('Not a medicine name plan');
  const rollback = new Error('REHEARSAL_ROLLBACK');
  let result: { operationId: string; updated: number; alreadyApplied: number; auditEntries: number; rolledBack: boolean } | undefined;
  try {
    return await db.$transaction(
      async (tx: any) => {
        if (!(await tx.user.findUnique({ where: { id: plan.actorId }, select: { id: true } }))) throw new Error('Audit actor not found');
        const stock = async () =>
          (await tx.inventoryItem.findMany({ where: { branchId: plan.branchId }, select: { id: true, currentStock: true, heldStock: true, costPrice: true, unit: true, packSize: true, packUnit: true }, orderBy: { id: 'asc' } }));
        const before = JSON.stringify(await stock());
        let updated = 0, alreadyApplied = 0;
        for (const change of plan.changes) {
          const item = await tx.inventoryItem.findFirst({ where: { id: change.id, branchId: plan.branchId } });
          if (!item) throw new Error(`Planned item ${change.id} is no longer in this branch`);
          if (NAMING_FIELDS.every((f) => item[f] === change.next[f])) {
            alreadyApplied++;
            continue;
          }
          if (item.name !== change.expected.name || item.metadata !== change.expected.metadata || iso(item.updatedAt) !== change.expected.updatedAt || item.form)
            throw new Error(`Item ${change.id} changed after the plan was made; make a new plan`);
          await tx.inventoryItem.update({ where: { id: item.id, branchId: plan.branchId, updatedAt: item.updatedAt }, data: change.next });
          await tx.auditLog.create({
            data: {
              userId: plan.actorId,
              action: 'INVENTORY_NAME_STANDARDIZED',
              entity: 'InventoryItem',
              entityId: item.id,
              oldValues: JSON.stringify({ branchId: plan.branchId, ...Object.fromEntries(NAMING_FIELDS.map((f) => [f, item[f]])) }),
              newValues: JSON.stringify({ branchId: plan.branchId, ...change.next, operationId: plan.operationId, reason: 'CR-11 standard medicine name format' }),
            },
          });
          updated++;
        }
        if (JSON.stringify(await stock()) !== before) throw new Error('Stock, cost or pack fields changed');
        const auditEntries = await tx.auditLog.count({ where: { action: 'INVENTORY_NAME_STANDARDIZED', newValues: { contains: plan.operationId } } });
        result = { operationId: plan.operationId, updated, alreadyApplied, auditEntries, rolledBack: Boolean(options.rollback) };
        if (options.rollback) throw rollback;
        return result;
      },
      { isolationLevel: 'Serializable', timeout: 120000, maxWait: 10000 },
    );
  } catch (error) {
    if (error === rollback) return result!;
    throw error;
  }
}

export const backfillItemSelect = {
  id: true, branchId: true, name: true, type: true, brandName: true, genericName: true, form: true, strength: true,
  isCombination: true, itemCode: true, unit: true, packUnit: true, metadata: true, updatedAt: true,
  drugs: { select: { dosageForm: true, composition1: true, composition2: true } },
} as const;
