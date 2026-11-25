import { Prisma, PrismaClient } from '@prisma/client';
import {
  deriveLessons, LearningDrug, LearningExample, LearningExampleRow, Lesson, parseLessonKey, summarizeLearningMetrics,
} from './purchase-learning';

type LearningDb = Pick<Prisma.TransactionClient, 'pharmacyPurchaseLearningExample' | 'drug'>;

const learningDrugSelect = {
  id: true, branchId: true, name: true, manufacturerName: true, packSizeLabel: true, strength: true,
  dosageForm: true, type: true, isActive: true, isDiscontinued: true,
} satisfies Prisma.DrugSelect;

const asExample = (row: Prisma.PharmacyPurchaseLearningExampleGetPayload<{}>) => row as unknown as LearningExample;

async function branchDrugs(db: LearningDb, branchId: string, examples: LearningExample[]) {
  const ids = [...new Set(examples.map(example => example.drugId).filter((id): id is string => !!id))];
  const drugs = ids.length ? await db.drug.findMany({ where: { id: { in: ids }, branchId }, select: learningDrugSelect }) : [];
  return new Map<string, LearningDrug>(drugs.map(drug => [drug.id, drug]));
}

async function humanExamples(db: LearningDb, branchId: string, where: Prisma.PharmacyPurchaseLearningExampleWhereInput = {}) {
  return (await db.pharmacyPurchaseLearningExample.findMany({
    where: { ...where, branchId, origin: 'HUMAN_REVIEW', revokedAt: null },
    orderBy: { committedAt: 'desc' }, take: 20000,
  })).map(asExample);
}

export async function loadPurchaseLessons(db: LearningDb, branchId: string, supplierGstin: string, rawKeys: string[]) {
  if (!rawKeys.length) return { lessons: [] as Lesson[], drugs: new Map<string, LearningDrug>() };
  const examples = await humanExamples(db, branchId, { rawKey: { in: rawKeys } });
  const drugs = await branchDrugs(db, branchId, examples);
  const gstin = supplierGstin.trim().toUpperCase();
  return { lessons: deriveLessons(examples, drugs).filter(lesson => lesson.supplierGstin === gstin || lesson.supplierGstin === '*'), drugs };
}

export type LearnedBoosts = Map<string, Map<string, number>>;

export async function loadPurchaseLearnedAliases(db: LearningDb, branchId: string, supplierGstin?: string) {
  const lessons = deriveLessons(await humanExamples(db, branchId, { field: 'product' }));
  const aliases = new Map<string, string[]>();
  const boosts: LearnedBoosts = new Map();
  const gstin = supplierGstin?.trim().toUpperCase();
  for (const lesson of lessons) {
    if (!lesson.drugId || !lesson.rawValue) continue;
    aliases.set(lesson.drugId, [...new Set([...(aliases.get(lesson.drugId) || []), lesson.rawValue])]);
    if (gstin && lesson.supplierGstin === gstin) {
      boosts.set(lesson.rawKey, new Map([...(boosts.get(lesson.rawKey) || []), [lesson.drugId, lesson.total]]));
    }
  }
  return { aliases, boosts };
}

export async function recordPurchaseOutcome(tx: Pick<Prisma.TransactionClient, 'pharmacyPurchaseLearningExample'>, rows: LearningExampleRow[]) {
  if (!rows.length) return 0;
  const data = rows.map(row => ({ ...row, identitySnapshot: row.identitySnapshot ? { ...row.identitySnapshot } : Prisma.DbNull }));
  return (await tx.pharmacyPurchaseLearningExample.createMany({ data, skipDuplicates: true })).count;
}

export async function listPurchaseLessons(db: LearningDb, branchId: string) {
  const examples = await humanExamples(db, branchId);
  return deriveLessons(examples, await branchDrugs(db, branchId, examples))
    .sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime() || a.key.localeCompare(b.key));
}

export async function forgetPurchaseLesson(db: Pick<PrismaClient, '$transaction'>, branchId: string, key: string, userId: string) {
  const lesson = parseLessonKey(key);
  if (!lesson) return null;
  return db.$transaction(async tx => {
    const revoked = await tx.pharmacyPurchaseLearningExample.updateMany({
      where: { branchId, field: lesson.field, rawKey: lesson.rawKey, revokedAt: null,
        ...(lesson.supplierGstin === '*' ? {} : { supplierGstin: lesson.supplierGstin }) },
      data: { revokedAt: new Date() },
    });
    if (revoked.count) await tx.auditLog.create({ data: {
      entity: 'PharmacyPurchaseLearningLesson', entityId: key, action: 'LESSON_FORGOTTEN', userId,
      oldValues: JSON.stringify({ branchId, lessonKey: key }), newValues: JSON.stringify({ branchId, lessonKey: key, revokedExamples: revoked.count }),
    } });
    return revoked.count;
  });
}

export async function purchaseLearningMetrics(db: LearningDb, branchId: string, range: { from: Date; to: Date }) {
  const examples = (await db.pharmacyPurchaseLearningExample.findMany({
    where: { branchId, committedAt: { gte: range.from, lt: range.to } },
    select: { invoiceId: true, slot: true, field: true, supplierGstin: true, rawValue: true, finalValue: true, provenance: true, origin: true, committedAt: true },
  })) as unknown as LearningExample[];
  const lessons = await listPurchaseLessons(db, branchId);
  const activeLessons = { SUGGEST: 0, APPLY: 0, TRUSTED: 0 };
  for (const lesson of lessons) if (lesson.supplierGstin !== '*') activeLessons[lesson.tier]++;
  return { from: range.from, to: range.to, ...summarizeLearningMetrics(examples), activeLessons };
}
