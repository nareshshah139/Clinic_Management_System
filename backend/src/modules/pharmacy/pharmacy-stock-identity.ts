import { BadRequestException } from '@nestjs/common';
import {
  checkedProductQuery,
  matchProductSearch,
} from '../../shared/search/product-search';
import { inventoryNameAliases } from '../inventory/inventory-names';
import { strengthMissing } from '../inventory/medicine-names';
import { jsonObject } from '../inventory/inventory-stock';

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
 * The product a batch belongs to: its linked drug, or for a batch with no single linked drug, its standard name, stock
 * unit and pack. Batches of one product are interchangeable on a sale and are judged on one product's sales; sales take
 * the earliest expiry first, so a later batch of a product that sells every day may itself never sell.
 */
export const productKey = (item: { name: string; unit: string; packSize?: number | null; packUnit?: string | null; drugs: { id: string }[] }) =>
  item.drugs.length === 1
    ? stockIdentityKey(item)
    : `name:${JSON.stringify([prescriptionNameKey(item.name), item.unit, item.packSize ?? null, item.packUnit ?? null])}`;

/** Names an item has been known by, so prescriptions and searches that used them still find it. */
export const inventoryKnownNames = (item: { name: string; metadata?: string | null }) => [
  item.name,
  ...inventoryNameAliases(jsonObject(item.metadata)),
];

/**
 * @cc [owner:nareshshah139,label:product] clinic-inventory-search-only
 * Prescription suggestions MUST come from active inventory in the current branch, ranked before
 * limiting, and MUST show each item's stored standard name while still matching its earlier names.
 * Similar names are suggestions only; different stock units or packs remain separate.
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
    const aliases = inventoryKnownNames(item).slice(1);
    const match = matchProductSearch(q, {
      names: [item.name, item.brandName, ...item.drugs.map((d: any) => d.name)].filter(Boolean),
      aliases,
      ingredients: [
        item.genericName || '',
        ...item.drugs.flatMap((d: any) => [
          d.composition1 || '',
          d.composition2 || '',
        ]),
      ],
      codes: [item.id, item.barcode, item.sku, item.itemCode],
      details: [item.packUnit, item.strength],
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
      dosageForm: drug?.dosageForm || item.form || null,
      form: drug?.dosageForm || item.form || null,
      strengthMissing: strengthMissing(item),
      knownNames: aliases,
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
 * catalog IDs and unique exact inventory names, current or earlier (aliases). A saved ID stays the line's identity
 * after its batch is archived or sold out: stock comes from its product's active batches (linked drug, or standard
 * name, unit and pack), earliest expiry first, and none in stock reads as out of stock. Links outside the branch and
 * ambiguous matches MUST remain unresolved; another product MUST NOT stand in; fuzzy suggestions MUST NOT establish
 * identity or mutate stock.
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
      where: { id: inventoryId, branchId },
      include: inventoryIdentityInclude,
    });
    if (!anchor) return null;
  } else {
    const find = (where: object) =>
      prisma.inventoryItem.findMany({
        where: { branchId, status: 'ACTIVE', ...where },
        include: inventoryIdentityInclude,
        orderBy: { id: 'asc' },
      });
    const name = item.drugName.trim();
    let candidates = await find(
      item.drugId
        ? { drugs: { some: { id: item.drugId, isActive: true, isDiscontinued: false } } }
        : { name: { equals: name, mode: 'insensitive' } },
    );
    // A line written before the item was renamed still names it by an earlier name.
    if (!candidates.length && !item.drugId)
      candidates = (await find({ metadata: { contains: JSON.stringify(name).slice(1, -1), mode: 'insensitive' } })).filter((row: any) =>
        inventoryKnownNames(row).some((known) => prescriptionNameKey(known) === prescriptionNameKey(name)),
      );
    // An existing catalog identity without stock must be reviewed, never switched by name.
    if (
      !candidates.length ||
      new Set(candidates.map(productKey)).size !== 1
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
  const sameShape = {
    branchId,
    status: 'ACTIVE',
    unit: anchor.unit,
    packSize: anchor.packSize ?? null,
    packUnit: anchor.packUnit ?? null,
  };
  const batches = drug
    ? await prisma.inventoryItem.findMany({
        where: { ...sameShape, drugs: { some: { id: drug.id }, every: { id: drug.id } } },
        include: inventoryIdentityInclude,
      })
    : anchor.drugs.length === 1
      ? [anchor].filter((batch) => batch.status === 'ACTIVE')
      : (await prisma.inventoryItem.findMany({
          where: { ...sameShape, name: { equals: anchor.name, mode: 'insensitive' } },
          include: inventoryIdentityInclude,
        })).filter((batch: any) => productKey(batch) === productKey(anchor));
  return { anchor, drug, batches };
}

/**
 * @cc [owner:nareshshah139,label:product] bill-line-stock-name
 * A bill line and a billing product MUST be named by the standard name of the stock they sell: the line's saved
 * inventory item, else the one name its drug's active stock carries in the branch, else the catalogue name.
 * Names are read live; a bill is never rewritten to rename it.
 */
export async function drugStockNames(db: any, branchId: string, drugIds: (string | null | undefined)[]) {
  const ids = [...new Set(drugIds.filter((id): id is string => !!id))];
  const names = new Map<string, Set<string>>();
  if (ids.length)
    for (const row of await db.inventoryItem.findMany({
      where: { branchId, status: 'ACTIVE', drugs: { some: { id: { in: ids } } } },
      select: { name: true, drugs: { select: { id: true } } },
    }))
      if (row.drugs.length === 1) names.set(row.drugs[0].id, (names.get(row.drugs[0].id) ?? new Set()).add(row.name));
  return new Map([...names].filter(([, found]) => found.size === 1).map(([id, found]) => [id, [...found][0]]));
}

type NamedLine = {
  itemType?: string | null;
  drugId?: string | null;
  inventoryItemId?: string | null;
  drug?: { name: string } | null;
  package?: { name: string } | null;
};
export async function withStockNames<T extends NamedLine>(db: any, branchId: string, lines: T[]): Promise<(T & { name: string | null })[]> {
  const saved = new Map<string, string>(
    (await db.inventoryItem.findMany({
      where: { branchId, id: { in: [...new Set(lines.map((line) => line.inventoryItemId).filter(Boolean))] } },
      select: { id: true, name: true },
    })).map((item: { id: string; name: string }) => [item.id, item.name]),
  );
  const byDrug = await drugStockNames(db, branchId, lines.filter((line) => !saved.has(line.inventoryItemId ?? '')).map((line) => line.drugId));
  return lines.map((line) => ({
    ...line,
    name: line.itemType === 'PACKAGE'
      ? line.package?.name ?? null
      : saved.get(line.inventoryItemId ?? '') ?? byDrug.get(line.drugId ?? '') ?? line.drug?.name ?? null,
  }));
}
