'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useDashboardUser } from '@/components/layout/dashboard-user-context';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/lib/api';
import type { DrugInventoryChangeRequest } from '@/lib/types';
import { fmtMoney, inputClass } from './workspace-model';

/**
 * @cc [owner:nareshshah139,label:product] inventory-approval-queue-only
 * The Inventory approval queue MUST page through every pending branch edit without loading
 * the drug catalog. Read failures MUST remain distinct from an empty queue; only doctors,
 * owners and admins may see review actions.
 */
export function InventoryUpdates() {
  const { user } = useDashboardUser();
  const { toast } = useToast();
  const canApprove = ['DOCTOR', 'ADMIN', 'OWNER'].includes(user?.role || '');
  const [requests, setRequests] = useState<DrugInventoryChangeRequest[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [review, setReview] = useState<{ request: DrugInventoryChangeRequest; action: 'approve' | 'reject' } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiClient.getDrugInventoryChangeRequests({ status: 'PENDING', page, limit: 20 });
      const lastPage = Math.max(1, response.pagination?.pages || 1);
      if (page > lastPage) { setPage(lastPage); return; }
      setRequests(response.data || []);
      setPages(lastPage);
      setTotal(response.pagination?.total ?? response.data.length);
    } catch (e: any) {
      setError(e.message || 'Approval queue unavailable. Try again.');
    } finally { setLoading(false); }
  }, [page]);
  useEffect(() => {
    void load();
    const refresh = () => { void load(); };
    window.addEventListener('inventory-workspace-refresh', refresh);
    return () => window.removeEventListener('inventory-workspace-refresh', refresh);
  }, [load]);

  /**
   * @cc [owner:nareshshah139,label:product] approved-inventory-refresh-consumers
   * A successful approval MUST notify mounted pharmacy stock and dashboard consumers;
   * failed approvals and rejections MUST NOT announce a stock change.
   */
  const submitReview = async () => {
    if (!review || busy) return;
    setBusy(true);
    try {
      if (review.action === 'approve') {
        await apiClient.approveDrugInventoryChangeRequest(review.request.id, note);
        window.dispatchEvent(new CustomEvent('inventory-stock-refresh'));
        window.dispatchEvent(new CustomEvent('pharmacy-dashboard-refresh'));
      } else {
        await apiClient.rejectDrugInventoryChangeRequest(review.request.id, note);
      }
      toast({ title: review.action === 'approve' ? 'Inventory change approved' : 'Inventory change rejected' });
      setReview(null);
      setNote('');
      window.dispatchEvent(new CustomEvent('inventory-workspace-refresh'));
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Review failed', description: e.body?.message || e.message });
    } finally { setBusy(false); }
  };
  return <section className="space-y-4">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-2xl font-semibold">Price / stock approval queue</h2>
        <p className="text-muted-foreground">Changes take effect after doctor approval.</p></div>
      <Button variant="outline" onClick={load} disabled={loading}>Refresh approvals</Button>
    </header>
    {error ? <p role="alert">{error} <Button variant="outline" onClick={load}>Retry queue</Button></p>
      : loading ? <p role="status">Loading approval queue…</p>
      : <>
        <p role="status">{total} pending request{total === 1 ? '' : 's'}</p>
        {requests.length === 0 ? <p className="border-y py-8">No pending price or stock edits.</p>
          : <ul className="divide-y border-y">{requests.map(request => {
            const batch = (request.stockSnapshot as { scope?: string } | undefined)?.scope === 'BATCH';
            return <li key={request.id} className="space-y-3 py-5">
              <div><h3 className="font-semibold">{request.inventoryItem?.name || request.drug?.name || 'Clinic item'}</h3>
                <p className="text-sm text-muted-foreground">{batch ? `Batch: ${request.inventoryItem?.batchNumber || 'Unspecified'} · ${request.inventoryItem?.unit || 'stock units'}` : 'Legacy product-total edit'}</p></div>
              <p>{request.proposedPrice != null && <>Selling price: {fmtMoney(request.currentPrice)} → {fmtMoney(request.proposedPrice)}<br /></>}
                {request.proposedStock != null && <>{batch ? 'Batch physical stock' : 'Total physical stock'}: {request.currentStock} → {request.proposedStock}</>}</p>
              <p><span className="font-medium">Reason: </span>{request.reason || 'No reason recorded (legacy request)'}</p>
              <p className="text-sm text-muted-foreground">{[request.requestedBy?.firstName, request.requestedBy?.lastName].filter(Boolean).join(' ') || 'Staff'} · {new Date(request.createdAt).toLocaleString('en-IN')}</p>
              {canApprove && <div className="flex gap-2">
                <Button onClick={() => { setNote(''); setReview({ request, action: 'approve' }); }}>Approve</Button>
                <Button variant="outline" onClick={() => { setNote(''); setReview({ request, action: 'reject' }); }}>Reject</Button>
              </div>}
            </li>;
          })}</ul>}
        <div className="flex items-center justify-between gap-3">
          <Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <p>Page {page} of {pages}</p>
          <Button variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      </>}
    <Dialog open={!!review} onOpenChange={(open: boolean) => { if (!open && !busy) setReview(null); }}>
      <DialogContent className="inventory-surface">
        <DialogHeader><DialogTitle>{review?.action === 'approve' ? 'Approve inventory change' : 'Reject inventory change'}</DialogTitle>
          <DialogDescription>{review?.request.inventoryItem?.name || review?.request.drug?.name}. {review?.action === 'approve' ? 'Apply the reviewed price or stock change.' : 'Close this request without changing stock or price.'}</DialogDescription></DialogHeader>
        <label>Review note<textarea className={inputClass} value={note} onChange={e => setNote(e.target.value)} placeholder="Optional note" /></label>
        <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setReview(null)}>Cancel</Button>
          <Button disabled={busy} onClick={submitReview}>{busy ? 'Saving…' : review?.action === 'approve' ? 'Approve' : 'Reject'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}
