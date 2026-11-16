import { BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Billing uses one GST rate per line. Prefer explicitly linked, saleable inventory
 * in this branch, falling back to non-expired active rows when stock is unavailable.
 * Missing or conflicting rates require operator review.
 * A recorded zero is a valid rate, not a missing value.
 */
export async function loadInventoryGstRates(
  prisma: Pick<PrismaClient, 'inventoryItem'>,
  drugIds: string[],
  branchId: string,
): Promise<Map<string, number | null>> {
  if (!branchId) throw new BadRequestException('Branch context is required');
  const ids = [...new Set(drugIds)];
  const rates = new Map<string, number | null>(ids.map(id => [id, null]));
  if (!ids.length) return rates;

  const batches = await prisma.inventoryItem.findMany({
    where: {
      branchId,
      status: 'ACTIVE',
      drugs: { some: { id: { in: ids }, branchId } },
    },
    select: {
      gstRate: true,
      currentStock: true,
      heldStock: true,
      stockStatus: true,
      expiryDate: true,
      drugs: { where: { id: { in: ids }, branchId }, select: { id: true } },
    },
  });
  const byDrug = new Map<string, Array<{ rate: number | null; available: boolean }>>();
  const now = Date.now();
  for (const batch of batches) {
    if (
      batch.stockStatus === 'EXPIRED' ||
      (batch.expiryDate && batch.expiryDate.getTime() < now)
    ) continue;
    const rate = batch.gstRate;
    const validRate = typeof rate === 'number' && Number.isFinite(rate) && rate >= 0 && rate <= 100
      ? rate : null;
    for (const drug of batch.drugs) {
      const values = byDrug.get(drug.id) || [];
      values.push({ rate: validRate, available: batch.currentStock - batch.heldStock > 0 });
      byDrug.set(drug.id, values);
    }
  }
  for (const [id, values] of byDrug) {
    const available = values.filter(value => value.available);
    const candidates = available.length ? available : values;
    const first = candidates[0].rate;
    if (first !== null && candidates.every(value => value.rate === first)) rates.set(id, first);
  }
  return rates;
}
