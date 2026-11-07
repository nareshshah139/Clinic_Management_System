import { UserRole } from '@prisma/client';

export const TRADE_TERM_EDITORS = [
  UserRole.OWNER,
  UserRole.ADMIN,
  UserRole.DOCTOR,
] as const;
export const TRADE_TERM_READERS = [
  ...TRADE_TERM_EDITORS,
  UserRole.PHARMACIST,
  UserRole.RECEPTION,
  UserRole.MANAGER,
  UserRole.ACCOUNTANT,
] as const;

export function tradeTermAccess(role: string | undefined) {
  return {
    read: (TRADE_TERM_READERS as readonly string[]).includes(role ?? ''),
    edit: (TRADE_TERM_EDITORS as readonly string[]).includes(role ?? ''),
  };
}

export type TradeTermProduct = { drugId?: string | null; productName: string };

export function normalizeTradeTermName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function tradeTermProductKey(product: TradeTermProduct): string {
  return product.drugId
    ? `drug:${product.drugId}`
    : `name:${normalizeTradeTermName(product.productName)}`;
}

/**
 * A product carrying a drug id matches the term for that drug, or a free-typed term with the
 * same name. A term tied to a different drug never matches by name, so two master products
 * that share a display name keep separate terms.
 */
export function matchTradeTerm<T extends TradeTermProduct>(
  terms: readonly T[],
  product: TradeTermProduct,
): T | null {
  if (product.drugId) {
    const byDrug = terms.find((term) => term.drugId === product.drugId);
    if (byDrug) return byDrug;
  }
  const name = normalizeTradeTermName(product.productName);
  if (!name) return null;
  return (
    terms.find(
      (term) =>
        (!product.drugId || !term.drugId) &&
        normalizeTradeTermName(term.productName) === name,
    ) ?? null
  );
}

export type TradeTermValues = {
  discountPercent?: number | null;
  schemeBuy?: number | null;
  schemeFree?: number | null;
  minExpiryMonths?: number | null;
  marginPercent?: number | null;
  ptr?: number | null;
  ptrRule?: string | null;
  note?: string | null;
};

export function tradeTermIssue(values: TradeTermValues): string | null {
  const hasBuy = values.schemeBuy != null;
  const hasFree = values.schemeFree != null;
  if (hasBuy !== hasFree)
    return 'Enter both the buy and free quantities of the scheme, or neither.';
  if (hasBuy && values.schemeBuy! < 1)
    return 'A scheme needs a buy quantity of at least 1.';
  if (hasBuy && values.schemeFree! > values.schemeBuy! * 10)
    return 'The free quantity cannot exceed ten times the buy quantity.';
  const recorded =
    [
      values.discountPercent,
      values.schemeBuy,
      values.minExpiryMonths,
      values.marginPercent,
      values.ptr,
    ].some((value) => value != null) ||
    !!values.ptrRule?.trim() ||
    !!values.note?.trim();
  return recorded ? null : 'Enter at least one agreed term for each product.';
}
