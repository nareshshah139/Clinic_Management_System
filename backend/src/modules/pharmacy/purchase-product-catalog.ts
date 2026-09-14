import { BadRequestException } from '@nestjs/common';
import { PurchaseProductCatalogDto } from './dto/pharmacy-purchase-invoice.dto';

const placeholder = /^(?:review\b.*|unknown|unspecified|uncategorized|not specified|not available|n\/?a|none|[-?]+)$/i;
export const hasCatalogValue = (value: unknown) => typeof value === 'string' && !!value.trim() && !placeholder.test(value.trim());
export function purchaseProductKind(type?: string | null) {
  if (type?.toLowerCase() === 'cosmetic') return 'COSMETIC';
  if (type?.toLowerCase() === 'consumable') return 'CONSUMABLE';
  return 'MEDICINE';
}

export function purchaseCatalogIssues(drug: { type?: string | null; composition1?: string | null; category?: string | null; dosageForm?: string | null; strength?: string | null }) {
  const fields = purchaseProductKind(drug.type) === 'MEDICINE'
    ? ['composition1', 'category', 'dosageForm', 'strength'] as const : ['category'] as const;
  return fields.filter(field => !hasCatalogValue(drug[field]));
}

export function purchaseCatalogData(catalog?: PurchaseProductCatalogDto) {
  if (!catalog || !['MEDICINE', 'COSMETIC', 'CONSUMABLE'].includes(catalog.productKind)) {
    throw new BadRequestException('Choose the product kind before saving a new product.');
  }
  const medicine = catalog.productKind === 'MEDICINE';
  const data = {
    type: medicine ? 'allopathy' : catalog.productKind === 'COSMETIC' ? 'cosmetic' : 'consumable',
    category: catalog.category?.trim() || (medicine ? null : catalog.productKind === 'COSMETIC' ? 'Cosmetic' : 'Consumable'),
    composition1: catalog.composition1?.trim() || null,
    dosageForm: catalog.dosageForm?.trim() || null,
    strength: catalog.strength?.trim() || null,
    requiresPrescription: medicine ? catalog.requiresPrescription : false,
  };
  const missing: string[] = purchaseCatalogIssues(data);
  if (medicine && typeof catalog.requiresPrescription !== 'boolean') missing.push('prescription requirement');
  for (const field of ['composition1', 'dosageForm', 'strength'] as const) {
    if (!medicine && data[field] && !hasCatalogValue(data[field])) missing.push(field);
  }
  if (missing.length) throw new BadRequestException(`Enter verified product details for ${[...new Set(missing)].join(', ')}. Leave unknown optional fields blank; do not enter placeholders.`);
  return data;
}

export function purchaseInventoryClassification(drug: { type?: string | null; requiresPrescription?: boolean | null }) {
  return purchaseProductKind(drug.type) === 'MEDICINE'
    // Preserve existing medicine behavior when older catalog records have no
    // recorded prescription choice. All new invoice medicines require one.
    ? { type: 'MEDICINE' as const, requiresPrescription: drug.requiresPrescription ?? true }
    : { type: 'CONSUMABLE' as const, requiresPrescription: false };
}
