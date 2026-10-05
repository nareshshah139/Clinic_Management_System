import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';

type Item = Record<string, any>;
type Regimen = { duration?: number; durationUnit?: string; frequency?: string; dosePattern?: string; timing?: string; instructions?: string };
type Field = 'duration' | 'frequency' | 'timing' | 'instructions';
const clean = (value: unknown) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
const nameKey = (value: unknown) => clean(value).toLowerCase();

// Duration + unit and the displayed dose pattern + frequency are single fields.
// Voting on their pieces separately could manufacture a regimen never prescribed.
function fields(item: Item): Partial<Record<Field, Regimen>> {
  const result: Partial<Record<Field, Regimen>> = {};
  const duration = Number(item.duration), unit = clean(item.durationUnit).toUpperCase();
  if (Number.isFinite(duration) && duration > 0 && unit) result.duration = { duration, durationUnit: unit };
  const frequency = clean(item.frequency), dosePattern = clean(item.dosePattern);
  if (frequency || dosePattern) result.frequency = { frequency, dosePattern };
  if (clean(item.timing)) result.timing = { timing: clean(item.timing) };
  if (clean(item.instructions)) result.instructions = { instructions: clean(item.instructions) };
  return result;
}

class Votes {
  count = 0;
  private values = new Map<Field, Map<string, { count: number; recent: number; value: Regimen }>>();
  add(item: Item, recent: number) {
    this.count++;
    for (const [field, value] of Object.entries(fields(item)) as [Field, Regimen][]) {
      const key = field === 'frequency'
        ? nameKey(value.dosePattern || value.frequency)
        : JSON.stringify(value).toLowerCase();
      const group = this.values.get(field) || new Map();
      const entry = group.get(key);
      group.set(key, {
        count: (entry?.count || 0) + 1,
        recent: Math.max(entry?.recent || 0, recent),
        value: entry && entry.recent > recent ? entry.value : value,
      });
      this.values.set(field, group);
    }
  }
  regimen(): Regimen {
    const result: Regimen = {};
    for (const group of this.values.values()) {
      const winner = [...group.values()].sort((a, b) => b.count - a.count || b.recent - a.recent)[0];
      Object.assign(result, winner.value);
    }
    return result;
  }
}

/**
 * @cc [owner:nareshshah139,label:product] eligible-regimen-history
 * Learned regimens MUST exclude cancelled prescriptions and deleted visits;
 * requesting defaults MUST NOT mutate prescription or visit records.
 */
export async function medicineRegimenDefaults(
  prisma: PrismaService, drugId: string, branchId: string, doctorId: string, currentVisitId?: string, now = new Date(),
) {
  if (!branchId || !doctorId) throw new BadRequestException('Authenticated branch and doctor context required');
  const drug = await prisma.drug.findFirst({
    where: { id: drugId, branchId },
    select: { id: true, name: true, inventoryItems: {
      where: { branchId, status: 'ACTIVE' }, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      select: { name: true, defaultDuration: true, defaultDurationUnit: true, defaultFrequency: true, defaultTiming: true, defaultInstructions: true },
    } },
  });
  if (!drug) throw new NotFoundException('Medicine not found in this branch');
  const names = new Set([drug.name, ...drug.inventoryItems.map(item => item.name)].map(nameKey));
  const since = new Date(now);
  // Calendar months, clamped for leap-day anniversaries.
  const day = since.getUTCDate();
  since.setUTCDate(1);
  since.setUTCMonth(since.getUTCMonth() - 12);
  const lastDay = new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth() + 1, 0)).getUTCDate();
  since.setUTCDate(Math.min(day, lastDay));
  const own = new Votes(), clinic = new Votes();
  let cursor: string | undefined;
  // Stream all eligible saved prescriptions: no recent-N truncation can change the mode.
  for (;;) {
    const prescriptions = await prisma.prescription.findMany({
      where: { status: { not: 'CANCELLED' }, createdAt: { gte: since, lte: now }, visit: { deletedAt: null, patient: { branchId }, ...(currentVisitId ? { id: { not: currentVisitId } } : {}) } },
      select: { id: true, items: true, createdAt: true, visit: { select: { doctorId: true } } },
      orderBy: { id: 'asc' }, take: 500,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    for (const prescription of prescriptions) {
      let items: unknown;
      try { items = JSON.parse(prescription.items); } catch { continue; }
      if (!Array.isArray(items)) continue;
      // Count prescriptions, not duplicate medicine rows within one prescription.
      const item = items.find(item => item && typeof item === 'object' &&
        (item.drugId ? item.drugId === drugId : names.has(nameKey(item.drugName))));
      if (!item) continue;
      const recent = prescription.createdAt.getTime();
      clinic.add(item, recent);
      if (prescription.visit.doctorId === doctorId) own.add(item, recent);
    }
    if (prescriptions.length < 500) break;
    cursor = prescriptions[prescriptions.length - 1].id;
  }
  const chosen = own.count >= 3 ? own : clinic;
  if (chosen.count) return { values: chosen.regimen(), source: own.count >= 3 ? 'doctor' : 'clinic', prescriptionCount: chosen.count };

  // Several stock batches can link to one catalog medicine. Resolve each configured
  // field from the most recently maintained active item; blanks remain unconfigured.
  const defaults: Partial<Record<Field, Regimen>> = {};
  for (const item of drug.inventoryItems) {
    const candidate = fields({ duration: item.defaultDuration, durationUnit: item.defaultDurationUnit,
      frequency: item.defaultFrequency, timing: item.defaultTiming, instructions: item.defaultInstructions });
    for (const field of Object.keys(candidate) as Field[]) if (!defaults[field]) defaults[field] = candidate[field];
  }
  const values: Regimen = Object.assign({}, ...Object.values(defaults));
  return { values, source: Object.keys(values).length ? 'inventory' : 'none', prescriptionCount: 0 };
}
