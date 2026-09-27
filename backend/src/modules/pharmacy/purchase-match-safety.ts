import { matchProductSearch, normalizeProductSearch, ocrProductSearchQuery, productStrengthConflict, searchPackKey } from '../../shared/search/product-search';
import { purchaseProductKind } from './purchase-product-catalog';

type PurchaseLineIdentity = { productName: string; packSize?: string; packUnitType?: string; productKind?: string };
type SavedProductIdentity = { name: string; packSizeLabel?: string | null; type?: string | null; strength?: string | null; aliases?: string[] };
const genericNameWords = new Set('tablet capsule cream ointment gel lotion solution syrup suspension injection drops powder soap wash oil spray foam shampoo serum moisturizer moisturiser of pack strip tube bottle box kit vial ampoule piece ml g mg mcg iu w v'.split(' '));
const identityWords = (value: string) => normalizeProductSearch(value).split(' ').filter(token => /\p{L}/u.test(token) && !genericNameWords.has(token)).join(' ');

/**
 * @cc [owner:nareshshah139,label:product] purchase-name-evidence-required
 * A suggestion MUST have distinguishing product-name or reviewed-alias evidence. Manufacturer,
 * price, dosage form, strength and pack alone MUST NOT establish a purchase product match.
 */
export function hasPurchaseNameEvidence(line: PurchaseLineIdentity, product: SavedProductIdentity): boolean {
  const query = identityWords(ocrProductSearchQuery(line.productName).query);
  return !!query && !!matchProductSearch(query, {
    names: [identityWords(product.name)], aliases: product.aliases?.map(identityWords),
  }, 'name');
}

/**
 * @cc [owner:nareshshah139,label:product] purchase-mismatch-warning-reasons
 * Different normalized names, known product kinds, strengths or pack dimensions MUST require
 * acknowledgement. Unknown kind/pack data MUST NOT be asserted equal or inferred from price.
 */
export function purchaseMatchMismatches(line: PurchaseLineIdentity, product: SavedProductIdentity): string[] {
  const reasons: string[] = [];
  const query = ocrProductSearchQuery(line.productName).query;
  if (normalizeProductSearch(query) !== normalizeProductSearch(product.name)) reasons.push('Product names differ');
  if (line.productKind && line.productKind !== purchaseProductKind(product.type)) reasons.push('Product kinds differ');
  const pack = searchPackKey(line.packSize || ''), savedPack = searchPackKey(product.packSizeLabel || '');
  const units = (value: string) => normalizeProductSearch(value).split(' ').filter(t => ['ml', 'g'].includes(t));
  const wantedUnits = units(`${line.packSize || ''} ${line.packUnitType || ''}`), savedUnits = units(product.packSizeLabel || '');
  if ((pack && savedPack && pack !== savedPack) || (wantedUnits.length && savedUnits.length && wantedUnits.some(unit => !savedUnits.includes(unit)))) reasons.push('Pack sizes or types differ');
  if (productStrengthConflict(query, { names: [product.name], strength: product.strength })) reasons.push('Product strengths differ');
  return reasons;
}
