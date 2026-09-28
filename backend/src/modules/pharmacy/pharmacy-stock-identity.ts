import { BadRequestException } from '@nestjs/common';
import {
  checkedProductQuery,
  matchProductSearch,
} from '../../shared/search/product-search';

export type PrescriptionIdentity = {
  drugName: string;
  drugId?: string | null;
  inventoryItemId?: string | null;
};
export const inventoryIdentityInclude = { drugs: true };
export const prescriptionNameKey = (name: string) =>
  name.normalize('NFKC').toLowerCase().trim().replace(/\s+/g, ' ');
export const prescriptionSourceKey = (item: PrescriptionIdentity) =>
  item.drugId
    ? `drug:${item.drugId}`
    : `name:${prescriptionNameKey(item.drugName)}`;
/**
 * @cc [owner:nareshshah139,label:product] pharmacy-available-stock
 * Availability MUST exclude held units and inactive or expired batches, never return less than
 * zero, and accept an expiry date through that UTC calendar day.
 */
export const availableStock = (item: any, now = new Date()) => {
  const day = new Date(now.toISOString().slice(0, 10) + 'T00:00:00.000Z');
  return item.status !== 'ACTIVE' ||
    (item.expiryDate && new Date(item.expiryDate) < day)
    ? 0
    : Math.max(0, item.currentStock - (item.heldStock || 0));
};
export const stockIdentityKey = (item: any) =>
  item.drugs?.length === 1
    ? JSON.stringify([
        item.drugs[0].id,
        item.unit,
        item.packSize ?? null,
        item.packUnit ?? null,
      ])
    : `inventory:${item.id}`;

/**
 * @cc [owner:nareshshah139,label:product] clinic-inventory-search-only
 * Prescription suggestions MUST come from active inventory in the current branch, ranked before
 * limiting. Similar names are suggestions only; different stock units or packs remain separate.
 */
export async function searchClinicInventory(
  prisma: any,
  raw: string,
  branchId: string,
  limit = 20,
) {
  if (!branchId) throw new BadRequestException('Branch context is required');
  const q = checkedProductQuery(raw);
  if (!q) return [];
  const items = await prisma.inventoryItem.findMany({
    where: { branchId, status: 'ACTIVE' },
    include: inventoryIdentityInclude,
    orderBy: { id: 'asc' },
  });
  const groups = new Map<string, any>();
  for (const item of items) {
    const match = matchProductSearch(q, {
      names: [item.name, ...item.drugs.map((d: any) => d.name)],
      ingredients: [
        item.genericName || '',
        ...item.drugs.flatMap((d: any) => [
          d.composition1 || '',
          d.composition2 || '',
        ]),
      ],
      codes: [item.id, item.barcode, item.sku],
      details: [item.packUnit],
    });
    const key = stockIdentityKey(item),
      previous = groups.get(key);
    const quantity = availableStock(item);
    if (previous) {
      previous.totalStock += quantity;
      if (
        match &&
        (!previous.searchMatch || match.score > previous.searchMatch.score)
      )
        previous.searchMatch = match;
      continue;
    }
    const drug =
      item.drugs.length === 1 &&
      item.drugs[0].branchId === branchId &&
      item.drugs[0].isActive &&
      !item.drugs[0].isDiscontinued
        ? item.drugs[0]
        : null;
    groups.set(key, {
      id: drug?.id,
      inventoryItemId: item.id,
      name: item.name,
      genericName:
        item.genericName ||
        [drug?.composition1, drug?.composition2].filter(Boolean).join(' + ') ||
        null,
      price: item.sellingPrice,
      gstRate: item.gstRate,
      manufacturerName: item.manufacturer || drug?.manufacturerName || '',
      manufacturer: item.manufacturer || drug?.manufacturerName || '',
      dosageForm: drug?.dosageForm || null,
      form: drug?.dosageForm || null,
      packSizeLabel:
        drug?.packSizeLabel ||
        `${item.packSize || 1} ${item.packUnit || item.unit}`,
      unit: item.unit,
      packSize: item.packSize,
      packUnit: item.packUnit,
      totalStock: quantity,
      brandNames: [],
      searchMatch: match,
    });
  }
  return [...groups.values()]
    .filter((row) => row.searchMatch)
    .sort(
      (a, b) =>
        b.searchMatch.score - a.searchMatch.score ||
        a.name.localeCompare(b.name) ||
        a.inventoryItemId.localeCompare(b.inventoryItemId),
    )
    .slice(0, Math.min(50, Math.max(1, limit)));
}

/**
 * @cc [owner:nareshshah139,label:product] prescription-stock-stable-identity
 * Saved inventory IDs take precedence over names; otherwise branch-confirmed mappings precede
 * catalog IDs and unique exact inventory names. Invalid explicit links and ambiguous matches
 * MUST remain unresolved; fuzzy suggestions MUST NOT establish identity or mutate stock.
 */
export async function resolvePrescriptionInventory(
  prisma: any,
  item: PrescriptionIdentity,
  branchId: string,
) {
  let inventoryId = item.inventoryItemId;
  if (!inventoryId) {
    const remembered = await prisma.prescriptionInventoryLink.findUnique({
      where: {
        branchId_sourceKey: {
          branchId,
          sourceKey: prescriptionSourceKey(item),
        },
      },
    });
    inventoryId = remembered?.inventoryItemId;
  }
  let anchor: any;
  if (inventoryId) {
    anchor = await prisma.inventoryItem.findFirst({
      where: { id: inventoryId, branchId, status: 'ACTIVE' },
      include: inventoryIdentityInclude,
    });
    if (!anchor) return null;
  } else {
    const candidates = await prisma.inventoryItem.findMany({
      where: {
        branchId,
        status: 'ACTIVE',
        ...(item.drugId
          ? {
              drugs: {
                some: {
                  id: item.drugId,
                  isActive: true,
                  isDiscontinued: false,
                },
              },
            }
          : { name: { equals: item.drugName.trim(), mode: 'insensitive' } }),
      },
      include: inventoryIdentityInclude,
      orderBy: { id: 'asc' },
    });
    // An existing catalog identity without stock must be reviewed, never switched by name.
    if (
      !candidates.length ||
      new Set(candidates.map(stockIdentityKey)).size !== 1
    )
      return null;
    anchor = candidates[0];
  }
  const drug =
    anchor.drugs.length === 1 &&
    anchor.drugs[0].branchId === branchId &&
    anchor.drugs[0].isActive &&
    !anchor.drugs[0].isDiscontinued
      ? anchor.drugs[0]
      : null;
  const batches = drug
    ? await prisma.inventoryItem.findMany({
        where: {
          branchId,
          status: 'ACTIVE',
          unit: anchor.unit,
          packSize: anchor.packSize ?? null,
          packUnit: anchor.packUnit ?? null,
          drugs: { some: { id: drug.id }, every: { id: drug.id } },
        },
        include: inventoryIdentityInclude,
      })
    : [anchor];
  return { anchor, drug, batches };
}
