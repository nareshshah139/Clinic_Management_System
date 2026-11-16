import { Prisma } from '@prisma/client';
import { drugSearchSelect, DrugSearchCandidate, ReviewedProductAliases } from '../../shared/search/drug-search';
import { matchProductSearch, normalizeProductSearch, ocrProductSearchQuery, searchPackKey } from '../../shared/search/product-search';

export type PurchaseSupplier = { distributorName?: string; distributorGstin?: string };
export type PurchaseCandidate = DrugSearchCandidate & { inInventory?: boolean };

/**
 * @cc [owner:nareshshah139,label:product] purchase-loose-setting-not-name
 * Parenthesized loose-dispensing annotations MUST NOT be copied into invoice product names.
 * Other product text, including strength and release modifiers, MUST be retained.
 */
export function withoutLooseAnnotation(name: string): string {
  return name.replace(/\s*\(\s*loose\b[^)]*\)/gi, '').trim();
}

/**
 * @cc [owner:nareshshah139,label:product] purchase-name-pack-noise
 * Purchase name comparisons MUST ignore loose annotations, tablet/capsule words, explicit count
 * packs, case and punctuation. Bare doses, strength units and release modifiers MUST remain.
 * Normalization MUST NOT modify the invoice line or its stock quantities.
 */
export function purchaseNameQuery(name: string): string {
  return normalizeProductSearch(ocrProductSearchQuery(withoutLooseAnnotation(name)).query
    .replace(/\b\d+\s*['’]\s*s\b/gi, ' ')
    .replace(/\b\d+\s*(?:tablets|capsules)\b/gi, ' ')
    .replace(/\b(?:pack|strip|box)\s+(?:of\s+)?\d+\b/gi, ' '))
    .split(' ').filter(word => !['tablet', 'capsule', 'pack', 'strip', 'box'].includes(word)).join(' ');
}

export function purchaseSupplierKey(supplier: PurchaseSupplier): string {
  return supplier.distributorGstin?.trim() ? `gst:${supplier.distributorGstin.trim().toUpperCase()}`
    : supplier.distributorName?.trim() ? `name:${normalizeProductSearch(supplier.distributorName)}` : '';
}

export function purchaseBrand(name: string): string {
  return purchaseNameQuery(name).split(' ').find(word => /^[a-z]{4,}$/.test(word) && !['cream','ointment','lotion','solution','syrup','suspension','injection','drops','powder','soap','wash','spray','foam','shampoo','serum','moisturizer','moisturiser','bottle','tube','vial','ampoule','piece'].includes(word)) || '';
}

export function samePurchaseBrand(name: string, drug: { name: string; aliases?: string[] }): boolean {
  const brand = purchaseBrand(name);
  return !!brand && !!matchProductSearch(brand, { names: [purchaseBrand(drug.name)], aliases: drug.aliases?.map(purchaseBrand) }, 'name');
}

export function purchaseMemoryKey(item: { productName: string; packSize?: string; packUnitType?: string }): string {
  const forms = [...new Set(normalizeProductSearch(withoutLooseAnnotation(item.productName)).split(' ').filter(word => ['tablet','capsule','cream','ointment','gel','lotion','solution','syrup','suspension','injection','drops'].includes(word)))].sort();
  return JSON.stringify([purchaseNameQuery(item.productName), forms, searchPackKey(item.packSize || '') || normalizeProductSearch(item.packSize), normalizeProductSearch(item.packUnitType).replace(/\b(strips|bottles|tubes|packs|boxes)\b/g, word => word === 'boxes' ? 'box' : word.slice(0, -1))]);
}

export function purchaseTargetKey(drug: any): string {
  return JSON.stringify([drug.id, drug.name, drug.type, drug.strength || '', drug.dosageForm || '', drug.packSizeLabel]);
}

/**
 * @cc [owner:nareshshah139,label:security;product] purchase-inventory-first-retrieval
 * Purchase retrieval MUST independently search active clinic inventory links before the active
 * branch catalogue, including zero-stock items. Inactive or other-branch records MUST be excluded.
 * Results are candidates for review; retrieval MUST NOT create identities or change stock.
 */
export async function findPurchaseCandidates(prisma: any, name: string, branchId: string, aliases: ReviewedProductAliases, rememberedIds: string[] = []): Promise<PurchaseCandidate[]> {
  const query = purchaseNameQuery(name);
  const brand = purchaseBrand(name);
  const inventoryIds = await prisma.$queryRaw(Prisma.sql`
    SELECT d.id FROM drugs d
    WHERE d."branchId" = ${branchId} AND d."isActive" = true AND d."isDiscontinued" = false
      AND EXISTS (SELECT 1 FROM "_DrugToInventoryItem" link JOIN inventory_items i ON i.id = link."B"
        WHERE link."A" = d.id AND i."branchId" = ${branchId} AND i.status = 'ACTIVE')
    ORDER BY lower(d.name) <->> ${query}, d.id LIMIT 300`);
  const catalogIds = await prisma.$queryRaw(Prisma.sql`
    SELECT id FROM drugs WHERE "branchId" = ${branchId} AND "isActive" = true AND "isDiscontinued" = false
    ORDER BY lower(name) <->> ${query}, id LIMIT 300`);
  const aliasIds = [...aliases].filter(([, names]) => names.some(alias => matchProductSearch(query, { names: [purchaseNameQuery(alias)] }, 'name'))).map(([id]) => id);
  const rows = await prisma.drug.findMany({ where: { branchId, isActive: true, isDiscontinued: false, OR: [
    { id: { in: [...new Set([...inventoryIds, ...catalogIds].map(row => row.id).concat(aliasIds, rememberedIds))] } },
    ...(brand ? [{ name: { contains: brand, mode: 'insensitive' } }] : []),
  ] }, select: { ...drugSearchSelect, inventoryItems: { where: { branchId, status: 'ACTIVE' }, select: { id: true }, take: 1 } } });
  return rows.map((drug: any) => ({ ...drug, aliases: aliases.get(drug.id) || [], inInventory: !!drug.inventoryItems?.length }));
}
