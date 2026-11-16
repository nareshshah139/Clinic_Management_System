import { PrismaClient } from '@prisma/client';
import { searchClinicInventory } from '../pharmacy/pharmacy-stock-identity';

/**
 * @cc [owner:nareshshah139,label:product] prescription-picker-inventory-identity
 * The prescription picker MUST return clinic inventory IDs and available quantities; the full
 * catalog is reserved for adding inventory products and MUST NOT fill prescription suggestions.
 */
export async function searchPrescriptionDrugs(
  prisma: Pick<PrismaClient, '$queryRaw' | 'drug' | 'inventoryItem'>,
  rawQuery: string,
  limit: number,
  branchId: string,
) {
  return searchClinicInventory(prisma, rawQuery, branchId, limit);
}
