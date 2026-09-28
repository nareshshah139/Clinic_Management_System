'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { apiClient } from '@/lib/api';
import { fmtMoney, inputClass } from './workspace-model';

/**
 * @cc [owner:nareshshah139,label:product] stock-row-edit-proposal
 * Row edits MUST submit the displayed clinic batch ID and revision with a nonblank reason
 * for approval, never mutate stock directly, and preserve inputs after a failed submission.
 * Blank, unchanged, negative or fractional stock values MUST NOT be submitted.
 */
export function StockEditDialog({ item, field, onClose, onSubmitted }: {
  item: { id: string; name: string; productName?: string; batchNumber?: string; unit: string; currentStock: number; heldStock: number; sellingPrice: number; updatedAt: string };
  field: 'price' | 'stock'; onClose: () => void; onSubmitted: () => void;
}) {
  const current = field === 'price' ? item.sellingPrice : item.currentStock;
  const [value, setValue] = useState(String(current));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const proposed = Number(value);
  const valid = value.trim() !== '' && Number.isFinite(proposed) && proposed >= 0 && proposed !== current &&
    (field === 'price' || Number.isSafeInteger(proposed) && proposed >= item.heldStock) && reason.trim().length > 0;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true); setError('');
    try {
      await apiClient.submitDrugInventoryChanges([{
        inventoryItemId: item.id, scope: 'BATCH', expectedUpdatedAt: item.updatedAt,
        ...(field === 'price' ? { proposedPrice: proposed } : { proposedStock: proposed }), reason: reason.trim(),
      }]);
      window.dispatchEvent(new CustomEvent('inventory-workspace-refresh'));
      onSubmitted();
    } catch (e: any) { setError(e.body?.message || e.message || 'Could not submit. Try again.'); }
    finally { setBusy(false); }
  };
  return <Dialog open onOpenChange={(open: boolean) => { if (!open && !busy) onClose(); }}>
    <DialogContent className="inventory-surface">
      <form onSubmit={submit} className="space-y-4">
        <DialogHeader><DialogTitle>Edit {field === 'price' ? 'price' : 'stock'}</DialogTitle>
          <DialogDescription>{item.productName || item.name} · Batch {item.batchNumber || 'unspecified'}. The change takes effect after doctor or admin approval.</DialogDescription></DialogHeader>
        <p>Current {field === 'price' ? `selling price: ${fmtMoney(current)}` : `physical stock: ${current} ${item.unit}`}</p>
        <label className="block">{field === 'price' ? 'New selling price (₹ per stock unit)' : `Counted physical stock (${item.unit})`}
          <input autoFocus required type="number" min={field === 'stock' ? item.heldStock : 0} step={field === 'price' ? '0.01' : '1'} inputMode={field === 'price' ? 'decimal' : 'numeric'} className={inputClass} value={value} onChange={e => setValue(e.target.value)} />
        </label>
        {field === 'stock' && <p className="text-sm text-muted-foreground">Count only this batch. {item.heldStock} held units must remain included.</p>}
        <label className="block">Reason (invoice or shelf count)
          <textarea required className={inputClass} value={reason} onChange={e => setReason(e.target.value)} placeholder="Invoice number or shelf-count details" />
        </label>
        {error && <p role="alert" className="text-destructive">{error}</p>}
        <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={!valid || busy}>{busy ? 'Submitting…' : 'Submit for approval'}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
