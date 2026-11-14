'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import { displayClinicDate } from '@/lib/date-display';
import { agreedSummary, formatPercent, type TradeTerm, type TradeTermLookup } from '@/lib/trade-terms';

type InvoiceProduct = { productName: string; drugId?: string };
type InvoiceLineTerms = { discountPercent: string; quantityPurchased: string; freeQuantity: string; expiryMonth: string; expiryYear: string; purchaseRate: string };

const GSTIN_LENGTH = 15;

export function useAgreedTerms(gstin: string, products: InvoiceProduct[]) {
  const [lookup, setLookup] = useState<TradeTermLookup | null>(null);
  const distributor = gstin.trim().toUpperCase();
  const request = JSON.stringify({ gstin: distributor, products: products.map(p => ({ productName: p.productName.slice(0, 200), ...(p.drugId ? { drugId: p.drugId } : {}) })) });
  useEffect(() => {
    if (distributor.length !== GSTIN_LENGTH) { setLookup(null); return; }
    let active = true;
    const timer = setTimeout(() => {
      apiClient.post<TradeTermLookup>('/pharmacy/trade-terms/lookup', JSON.parse(request)).then(
        result => { if (active) setLookup(Array.isArray(result?.terms) && Array.isArray(result?.matches) ? result : null); },
        () => { if (active) setLookup(null); },
      );
    }, 400);
    return () => { active = false; clearTimeout(timer); };
  }, [request, distributor]);
  const byId = new Map((lookup?.terms ?? []).map(term => [term.id, term]));
  return {
    supplier: lookup?.supplier ?? null,
    terms: lookup?.terms ?? [],
    termFor: (index: number): TradeTerm | null => byId.get(lookup?.matches[index] ?? '') ?? null,
  };
}

export function AgreedTermsPanel({ supplierName, terms }: { supplierName: string; terms: TradeTerm[] }) {
  if (!terms.length) return null;
  return (
    <section aria-label="Agreed terms" className="rounded-lg border border-info-border bg-info-soft p-3 text-sm">
      <h4 className="font-semibold">Agreed terms with {supplierName}</h4>
      <p className="text-muted-foreground">Recorded under Purchases, Terms of Trade. Compare each line with what was promised.</p>
      <ul className="mt-2 space-y-1">
        {terms.map(term => (
          <li key={term.id} className="flex flex-wrap justify-between gap-x-3">
            <span><strong>{term.productName}</strong>: {agreedSummary(term) || '—'}{term.marginPercent != null && ` · margin ${formatPercent(term.marginPercent)}`}{term.note && ` · ${term.note}`}</span>
            <span className="text-muted-foreground">by {term.updatedBy.name} on {displayClinicDate(term.updatedAt)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const rupees = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });

export function invoiceLineSummary(line: InvoiceLineTerms) {
  const rate = Number(line.purchaseRate);
  return [
    `${line.discountPercent.trim() || '0'}%`,
    `${line.quantityPurchased.trim() || '0'} paid + ${line.freeQuantity.trim() || '0'} free`,
    line.expiryMonth.trim() && line.expiryYear.trim() ? `exp ${line.expiryMonth.trim().padStart(2, '0')}/${line.expiryYear.trim()}` : 'expiry not entered',
    line.purchaseRate.trim() && Number.isFinite(rate) ? `rate ${rupees.format(rate)}` : 'rate not entered',
  ].join(' · ');
}

export function AgreedTermHint({ term, line }: { term: TradeTerm | null; line: InvoiceLineTerms }) {
  if (!term) return null;
  return (
    <div className="rounded-md border border-info-border bg-info-soft px-3 py-2 text-sm" data-testid="agreed-term-hint">
      <p><strong>Agreed:</strong> {agreedSummary(term) || term.note || '—'}</p>
      <p className="text-muted-foreground"><strong>Invoice:</strong> {invoiceLineSummary(line)}</p>
    </div>
  );
}
