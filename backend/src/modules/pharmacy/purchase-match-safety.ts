import { matchProductSearch, normalizeProductSearch, ocrProductSearchQuery, productStrengthConflict, searchPackKey } from '../../shared/search/product-search';
import { purchaseNameQuery, withoutLooseAnnotation } from './purchase-match-identity';
import { purchaseProductKind } from './purchase-product-catalog';

type PurchaseLineIdentity = { productName: string; packSize?: string; packUnitType?: string; productKind?: string };
type SavedProductIdentity = { name: string; dosageForm?: string | null; packSizeLabel?: string | null; type?: string | null; strength?: string | null; aliases?: string[] };
const genericNameWords = new Set('tablet capsule cream ointment gel lotion solution syrup suspension injection drops powder soap wash oil spray foam shampoo serum moisturizer moisturiser of pack strip tube bottle box kit vial ampoule piece ml g mg mcg iu w v'.split(' '));
const identityWords = (value: string) => normalizeProductSearch(value).split(' ').filter(token => /\p{L}/u.test(token) && !genericNameWords.has(token)).join(' ');

/**
 * @cc [owner:nareshshah139,label:product] purchase-name-evidence-required
 * A suggestion MUST have distinguishing product-name or reviewed-alias evidence. Manufacturer,
 * price, dosage form, strength and pack alone MUST NOT establish a purchase product match.
 */
export function hasPurchaseNameEvidence(line: PurchaseLineIdentity, product: SavedProductIdentity): boolean {
  const query = identityWords(purchaseNameQuery(line.productName));
  return !!query && !!matchProductSearch(query, {
    names: [identityWords(purchaseNameQuery(product.name))], aliases: product.aliases?.map(alias => identityWords(purchaseNameQuery(alias))),
  }, 'name');
}

/**
 * @cc [owner:nareshshah139,label:product] purchase-mismatch-warning-reasons
 * Different normalized names, known product kinds, forms, strengths or pack dimensions MUST require
 * acknowledgement. Unknown kind/pack data MUST NOT be asserted equal or inferred from price.
 */
export function purchaseMatchMismatches(line: PurchaseLineIdentity, product: SavedProductIdentity): string[] {
  const reasons: string[] = [];
  const query = ocrProductSearchQuery(line.productName).query;
  if (normalizeProductSearch(query) !== normalizeProductSearch(product.name)) reasons.push('Product names differ');
  const forms = (value: string) => normalizeProductSearch(withoutLooseAnnotation(value)).split(' ').filter(word => ['tablet','capsule','cream','ointment','gel','lotion','solution','syrup','suspension','injection','drops'].includes(word));
  const wanted = forms(line.productName), actual = forms(`${product.name} ${product.dosageForm || ''}`);
  if (wanted.length && actual.length && !wanted.some(form => actual.includes(form))) reasons.push('Product forms differ');
  if (line.productKind && line.productKind !== purchaseProductKind(product.type)) reasons.push('Product kinds differ');
  const pack = searchPackKey(line.packSize || ''), savedPack = searchPackKey(product.packSizeLabel || '');
  const units = (value: string) => normalizeProductSearch(value).split(' ').filter(t => ['ml', 'g'].includes(t));
  const wantedUnits = units(`${line.packSize || ''} ${line.packUnitType || ''}`), savedUnits = units(product.packSizeLabel || '');
  if ((pack && savedPack && pack !== savedPack) || (wantedUnits.length && savedUnits.length && wantedUnits.some(unit => !savedUnits.includes(unit)))) reasons.push('Pack sizes or types differ');
  if (productStrengthConflict(purchaseNameQuery(query), { names: [product.name], strength: product.strength })) reasons.push('Product strengths differ');
  return reasons;
}
