import { PrismaClient } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import { autocompleteDrugCatalog } from '../../shared/search/drug-search';
import { checkedProductQuery } from '../../shared/search/product-search';

// Keep this adapter type-checked even while the legacy prescription service uses @ts-nocheck.
export async function searchPrescriptionDrugs(
  prisma: Pick<PrismaClient, '$queryRaw' | 'drug' | 'inventoryItem'>,
  rawQuery: string,
  limit: number,
  branchId: string,
) {
  if (!branchId) throw new BadRequestException('Branch context is required');
  const q = checkedProductQuery(rawQuery);
  if (!q) return [];
  const drugs = await autocompleteDrugCatalog(prisma, { q, limit, mode: 'all' }, branchId);
  return drugs.map(drug => ({
    ...drug,
    genericName: [drug.composition1, drug.composition2].filter(Boolean).join(' + ') || null,
    form: drug.dosageForm,
    manufacturer: drug.manufacturerName,
    // The current catalogue does not track brand aliases or generic/brand classification.
    brandNames: [],
  }));
}
