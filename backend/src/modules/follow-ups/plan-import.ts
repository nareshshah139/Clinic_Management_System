import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { InstrumentFile, PlanContent, PlanFile, contentHash, instrumentContent, instrumentProblems, planProblems } from './content';

type Tx = Prisma.TransactionClient;
export const DATA_DIR = join(__dirname, 'data');

function readDir<T>(dir: string): T[] {
  return readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as T);
}

export function readDataFiles(dir = DATA_DIR) {
  return { instruments: readDir<InstrumentFile>(join(dir, 'instruments')), plans: readDir<PlanFile>(join(dir, 'plans')) };
}

export type ImportResult = { kind: 'instrument' | 'plan'; key: string; version: number; versionId: string; created: boolean };

async function publish(
  tx: Tx,
  kind: 'instrument' | 'plan',
  key: string,
  content: unknown,
  actorId: string | null,
): Promise<ImportResult> {
  const hash = contentHash(content);
  if (kind === 'instrument') {
    const parent = await tx.instrument.upsert({ where: { key }, create: { key }, update: {} });
    const same = await tx.instrumentVersion.findUnique({ where: { instrumentId_contentHash: { instrumentId: parent.id, contentHash: hash } } });
    if (same) return { kind, key, version: same.version, versionId: same.id, created: false };
    const last = await tx.instrumentVersion.findFirst({ where: { instrumentId: parent.id }, orderBy: { version: 'desc' } });
    const row = await tx.instrumentVersion.create({
      data: { instrumentId: parent.id, version: (last?.version ?? 0) + 1, contentHash: hash, content: content as Prisma.InputJsonValue, createdById: actorId },
    });
    return { kind, key, version: row.version, versionId: row.id, created: true };
  }
  const parent = await tx.followUpPlan.upsert({ where: { key }, create: { key }, update: {} });
  const same = await tx.followUpPlanVersion.findUnique({ where: { planId_contentHash: { planId: parent.id, contentHash: hash } } });
  if (same) return { kind, key, version: same.version, versionId: same.id, created: false };
  const last = await tx.followUpPlanVersion.findFirst({ where: { planId: parent.id }, orderBy: { version: 'desc' } });
  const row = await tx.followUpPlanVersion.create({
    data: { planId: parent.id, version: (last?.version ?? 0) + 1, contentHash: hash, content: content as Prisma.InputJsonValue, createdById: actorId },
  });
  return { kind, key, version: row.version, versionId: row.id, created: true };
}

/**
 * @cc [owner:nareshshah139,label:product] reviewed-plan-import
 * Instruments and plans MUST come only from the reviewed data files through the owner-only
 * import. Identical content is a no-op, changed content creates the next version, and a
 * published version is never changed (PP-24). Nothing is published if any file is refused.
 */
export async function importFollowUpData(tx: Tx, files: ReturnType<typeof readDataFiles>, actorId: string | null): Promise<ImportResult[]> {
  const problems = [...files.instruments.flatMap(instrumentProblems), ...files.plans.flatMap(planProblems)];
  const instrumentKeys = new Set(files.instruments.map((i) => i.key));
  for (const plan of files.plans) {
    for (const step of plan.steps ?? []) {
      if (!instrumentKeys.has(step.instrument)) problems.push(`${plan.key}: step ${step.key} names unknown instrument ${step.instrument}`);
    }
  }
  if (problems.length) throw new BadRequestException({ message: 'Follow-up data refused', problems });

  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('follow-up-import'))`;
  const results: ImportResult[] = [];
  const pinned = new Map<string, string>();
  for (const file of files.instruments) {
    const r = await publish(tx, 'instrument', file.key, instrumentContent(file), actorId);
    pinned.set(file.key, r.versionId);
    results.push(r);
  }
  for (const file of files.plans) {
    const content: PlanContent = {
      name: file.name,
      steps: file.steps.map(({ instrument, ...step }) => ({ ...step, reminderAfterDays: step.reminderAfterDays ?? [], instrumentVersionId: pinned.get(instrument)! })),
    };
    results.push(await publish(tx, 'plan', file.key, content, actorId));
  }
  return results;
}
