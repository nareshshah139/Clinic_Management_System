import { Prisma, PrismaClient } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import {
  checkedProductQuery,
  matchProductSearch,
  normalizeProductSearch,
  ProductSearchMode,
  ProductSearchMatch,
  SearchableProduct,
} from './product-search';

type SearchDatabase = Pick<
  PrismaClient,
  '$queryRaw' | 'drug' | 'inventoryItem'
>;
export type ReviewedProductAliases = Map<string, string[]>;
export const drugSearchSelect = {
  id: true,
  name: true,
  price: true,
  manufacturerName: true,
  type: true,
  requiresPrescription: true,
  packSizeLabel: true,
  composition1: true,
  composition2: true,
  category: true,
  dosageForm: true,
  strength: true,
  barcode: true,
  sku: true,
} satisfies Prisma.DrugSelect;
export type DrugSearchCandidate = Prisma.DrugGetPayload<{
  select: typeof drugSearchSelect;
}> & { aliases: string[] };

export type CatalogDrugSuggestion = Omit<DrugSearchCandidate, 'aliases'> & {
  searchMatch?: ProductSearchMatch;
};

// Shared by pharmacy and prescription autocomplete so retrieval, scope and ranking stay aligned.
export async function autocompleteDrugCatalog(
  prisma: SearchDatabase,
  query: { q?: string; limit?: number | string; mode?: string },
  branchId: string,
): Promise<CatalogDrugSuggestion[]> {
  if (!branchId) throw new BadRequestException('Branch context is required');
  const limit = Math.min(50, Math.max(1, Math.floor(Number(query.limit) || 10)));
  const q = checkedProductQuery(query.q);
  const mode = String(query.mode || 'all').toLowerCase();
  if (!['all', 'name', 'ingredient'].includes(mode)) {
    throw new BadRequestException('Unknown drug search mode');
  }
  if (!q) {
    return prisma.drug.findMany({
      where: { branchId, isActive: true, isDiscontinued: false },
      select: drugSearchSelect,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: limit,
    });
  }
  const candidates = await findDrugSearchCandidates(prisma, q, branchId, mode as ProductSearchMode);
  return candidates
    .map(drug => ({ drug, match: matchProductSearch(q, searchableDrug(drug), mode as ProductSearchMode) }))
    .filter((row): row is typeof row & { match: NonNullable<typeof row.match> } => !!row.match)
    .sort((a, b) => b.match.score - a.match.score || a.drug.name.localeCompare(b.drug.name) || a.drug.id.localeCompare(b.drug.id))
    .slice(0, limit)
    .map(({ drug, match }) => {
      const { aliases, ...result } = drug;
      return { ...result, searchMatch: match };
    });
}

/**
 * @cc [owner:nareshshah139,label:security] search-alias-verified-branch-link
 * Only reviewed inventory names with one linked drug in the requesting branch MAY contribute
 * aliases. Unmapped or multiply linked inventory MUST NOT establish catalogue identity.
 */
export async function loadReviewedProductAliases(
  prisma: SearchDatabase,
  branchId: string,
): Promise<ReviewedProductAliases> {
  const rows = await prisma.inventoryItem.findMany({
    where: { branchId, metadata: { contains: '"nameNormalization"' } },
    select: {
      name: true,
      metadata: true,
      drugs: { select: { id: true, branchId: true } },
    },
  });
  const aliases: ReviewedProductAliases = new Map();
  for (const row of rows || []) {
    if (row.drugs.length !== 1 || row.drugs[0].branchId !== branchId) continue;
    let meta: any;
    try {
      meta = JSON.parse(row.metadata || '{}');
    } catch {
      continue;
    }
    if (meta.nameNormalization?.version !== 1) continue;
    const original = Array.isArray(meta.nameNormalization.aliases)
      ? meta.nameNormalization.aliases.filter(
          (a: unknown): a is string => typeof a === 'string',
        )
      : [];
    const id = row.drugs[0].id;
    aliases.set(id, [
      ...new Set([...(aliases.get(id) || []), row.name, ...original]),
    ]);
  }
  return aliases;
}

export function searchableDrug(drug: DrugSearchCandidate): SearchableProduct {
  return {
    names: [drug.name],
    aliases: drug.aliases,
    ingredients: [drug.composition1 || '', drug.composition2 || ''],
    manufacturer: drug.manufacturerName,
    category: drug.category,
    strength: drug.strength,
    codes: [drug.id, drug.barcode, drug.sku],
    details: [drug.packSizeLabel, drug.strength, drug.dosageForm],
  };
}

/**
 * @cc [owner:nareshshah139,label:product] search-retrieve-before-rerank
 * Candidate retrieval MUST be branch-scoped and active-only, retrieve exact names/codes and
 * reviewed aliases independently of approximate limits, and use similarity-ordered database
 * retrieval rather than an alphabetically truncated substring list for typo candidates.
 * Retrieval is bounded candidate generation, not an exhaustive identity or equivalence proof.
 */
export async function findDrugSearchCandidates(
  prisma: SearchDatabase,
  rawQuery: string,
  branchId: string,
  mode: ProductSearchMode = 'all',
  reviewedAliases?: ReviewedProductAliases,
): Promise<DrugSearchCandidate[]> {
  const query = checkedProductQuery(rawQuery);
  if (!query) return [];
  const aliases =
    reviewedAliases || (await loadReviewedProductAliases(prisma, branchId));
  const aliasIds =
    mode === 'ingredient'
      ? []
      : [...aliases]
          .filter(([, names]) =>
            matchProductSearch(query, { names: [], aliases: names }, 'name'),
          )
          .map(([id]) => id);
  const fields =
    mode === 'name'
      ? [Prisma.sql`lower(name)`]
      : mode === 'ingredient'
        ? [
            Prisma.sql`lower(coalesce(composition1, '') || ' ' || coalesce(composition2, ''))`,
          ]
        : [
            Prisma.sql`lower(name)`,
            Prisma.sql`lower(coalesce(composition1, '') || ' ' || coalesce(composition2, ''))`,
            Prisma.sql`lower(coalesce("manufacturerName", '') || ' ' || coalesce(category, ''))`,
          ];
  const normalized = normalizeProductSearch(query);
  const ids = await Promise.all(
    fields.map((field) =>
      prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT id FROM drugs
    WHERE "branchId" = ${branchId} AND "isActive" = true AND "isDiscontinued" = false
    ORDER BY ${field} <->> ${normalized}
    LIMIT 300`),
    ),
  );
  const candidates = await prisma.drug.findMany({
    where: {
      branchId,
      isActive: true,
      isDiscontinued: false,
      OR: [
        {
          id: {
            in: [...new Set([...aliasIds, ...ids.flat().map((i) => i.id)])],
          },
        },
        ...(mode === 'ingredient'
          ? []
          : [{ name: { equals: query, mode: 'insensitive' as const } }]),
        ...(mode === 'all'
          ? [{ barcode: query }, { sku: query }, { id: query }]
          : []),
      ],
    },
    select: drugSearchSelect,
  });
  return candidates.map((drug) => ({
    ...drug,
    aliases: aliases.get(drug.id) || [],
  }));
}
