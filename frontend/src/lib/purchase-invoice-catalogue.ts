export const catalogueFieldLabels = {
  composition1: 'composition', category: 'category', dosageForm: 'dosage form', strength: 'strength',
} as const;
export type CatalogueField = keyof typeof catalogueFieldLabels;
export type CatalogueProduct = {
  id: string; name: string; price: number; manufacturerName: string; packSizeLabel: string;
  type?: string; productKind?: 'MEDICINE' | 'COSMETIC' | 'CONSUMABLE';
  requiresPrescription?: boolean | null; catalogIssues?: string[];
  composition1?: string | null; category?: string | null; dosageForm?: string | null; strength?: string | null;
};
export type CatalogueResolution =
  | { state: 'ready'; product: CatalogueProduct }
  | { state: 'incomplete'; product: CatalogueProduct; missingFields: CatalogueField[] }
  | { state: 'missing' | 'ambiguous' | 'unchecked' };
export type CatalogueRow = { localId: string; lineIndex: number; name: string; resolution: CatalogueResolution };
export type CatalogueRequest = Readonly<{ generation: number; scope: string; invoiceId?: string; fingerprint: string; sequence: number }>;
export type CatalogueAssessment =
  | { state: 'unchecked' }
  | { state: 'pending'; request: CatalogueRequest }
  | { state: 'failed'; request: CatalogueRequest; productSaved: boolean }
  | { state: 'assessed'; request: CatalogueRequest; rows: CatalogueRow[] };

type CatalogueLine = { localId: string; productName: string; manufacturer: string; packSize: string; packUnitType: string; productKind?: string };
export function catalogueFingerprint(lines: readonly CatalogueLine[]) {
  return JSON.stringify(lines.map(({ localId, productName, manufacturer, packSize, packUnitType, productKind }) => [localId, productName, manufacturer, packSize, packUnitType, productKind]));
}
export function sameCatalogueRequest(a: CatalogueRequest, b: CatalogueRequest) {
  return a.generation === b.generation && a.scope === b.scope && a.invoiceId === b.invoiceId && a.fingerprint === b.fingerprint && a.sequence === b.sequence;
}

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
export function catalogueFields(value: unknown): CatalogueField[] {
  return Array.isArray(value) ? [...new Set(value.filter((field): field is CatalogueField => typeof field === 'string' && Object.hasOwn(catalogueFieldLabels, field)))] : [];
}

/**
 * @cc [owner:nareshshah139,label:product] explicit-exact-readiness
 * Every input line MUST receive one resolution. Missing, duplicate or malformed response rows
 * MUST remain unchecked; only explicit exact-server readiness MAY enable final review.
 */
export function assessCatalogue(lines: readonly CatalogueLine[], response: unknown): CatalogueRow[] {
  const matches = record(response).matches;
  return lines.map((line, lineIndex) => {
    const rows = Array.isArray(matches) ? matches.filter(row => record(row).lineIndex === lineIndex) : [];
    const value = rows.length === 1 ? record(record(rows[0]).catalogueResolution) : {};
    const product = record(value.product);
    let resolution: CatalogueResolution = { state: 'unchecked' };
    if (value.state === 'missing' || value.state === 'ambiguous') resolution = { state: value.state };
    if (typeof product.id === 'string' && product.id && typeof product.name === 'string' && product.name) {
      if (value.state === 'ready') resolution = { state: 'ready', product: product as CatalogueProduct };
      const fields = catalogueFields(value.missingFields);
      if (value.state === 'incomplete' && fields.length && Array.isArray(value.missingFields) && fields.length === new Set(value.missingFields).size)
        resolution = { state: 'incomplete', product: product as CatalogueProduct, missingFields: fields };
    }
    return { localId: line.localId, lineIndex, name: line.productName, resolution };
  });
}
