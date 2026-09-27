'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export type PurchaseSearchProduct = {
  id: string; name: string; price: number; manufacturerName: string; packSizeLabel: string;
  type?: string; productKind?: 'MEDICINE' | 'COSMETIC' | 'CONSUMABLE';
};

/**
 * @cc [owner:nareshshah139,label:product] purchase-manual-selection-only
 * Search MUST NOT select or confirm a product automatically. Cleared or changed queries MUST
 * discard stale results; search failures MUST remain visible. Selection uses the same guarded
 * confirmation callback as suggested products.
 */
export function PurchaseManualMatchSearch({ lineNumber, disabled, onSelect }: {
  lineNumber: number; disabled: boolean; onSelect: (product: PurchaseSearchProduct) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PurchaseSearchProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!query.trim()) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const rows = await apiClient.get<PurchaseSearchProduct[]>('/pharmacy/purchase-invoices/master-products', { q: query.trim() });
        if (!cancelled) setResults(rows);
      } catch {
        if (!cancelled) setError('Could not search saved products. Try again.');
      } finally { if (!cancelled) setSearching(false); }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);
  return <section className="mt-4 space-y-2 border-t pt-3" aria-label={`Manual product matching for line ${lineNumber}`}>
    <label htmlFor={`purchase-product-search-${lineNumber}`} className="text-sm font-medium">Search saved products manually</label>
    <Input id={`purchase-product-search-${lineNumber}`} value={query} disabled={disabled} placeholder="Search by product name" onChange={event => {
      setQuery(event.target.value); setResults([]); setError(''); setSearching(!!event.target.value.trim());
    }} />
    {searching && <p role="status" className="text-sm">Searching saved products…</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {!!query.trim() && !searching && !error && !results.length && <p className="text-sm text-muted-foreground">No saved products found.</p>}
    {results.map(product => <div key={product.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-3 text-sm">
      <div><p className="font-medium">{product.name}</p><p className="text-muted-foreground">{[product.manufacturerName, product.packSizeLabel, product.productKind].filter(Boolean).join(' · ')}</p></div>
      <Button type="button" variant="outline" disabled={disabled || searching} onClick={() => onSelect(product)}>Match {product.name}</Button>
    </div>)}
  </section>;
}
