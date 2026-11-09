'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useDashboardUser } from '@/components/layout/dashboard-user-context';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/lib/api';
import { displayClinicDateTime } from '@/lib/date-display';
import {
  describeItemRequestPayload,
  ITEM_REQUEST_APPROVER_ROLES,
  personName,
  type InventoryItemRequest,
} from '@/lib/inventory-item-requests';
import { ItemRequestDuplicateWarning } from './ItemRequestDuplicateWarning';
import { inputClass } from './workspace-model';

const STATUS_LABEL = { PENDING: 'Waiting for doctor', APPROVED: 'Approved', REJECTED: 'Rejected' } as const;

export function InventoryItemRequests() {
  const { user } = useDashboardUser();
  const { toast } = useToast();
  const canReview = ITEM_REQUEST_APPROVER_ROLES.includes(user?.role || '');
  const [requests, setRequests] = useState<InventoryItemRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [review, setReview] = useState<{ request: InventoryItemRequest; action: 'approve' | 'reject' } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRequests(await apiClient.getInventoryItemRequests());
    } catch (e: any) {
      setError(e.message || 'New item requests are unavailable. Try again.');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => {
    void load();
    const refresh = () => { void load(); };
    window.addEventListener('inventory-workspace-refresh', refresh);
    return () => window.removeEventListener('inventory-workspace-refresh', refresh);
  }, [load]);

  const submitReview = async () => {
    if (!review || busy) return;
    if (review.action === 'reject' && !note.trim()) return;
    setBusy(true);
    setConflict('');
    try {
      if (review.action === 'approve') {
        await apiClient.approveInventoryItemRequest(review.request.id);
        window.dispatchEvent(new CustomEvent('inventory-stock-refresh'));
      } else {
        await apiClient.rejectInventoryItemRequest(review.request.id, note.trim());
      }
      toast({ title: review.action === 'approve' ? 'Item approved and added to inventory' : 'Item request rejected' });
      setReview(null);
      setNote('');
    } catch (e: any) {
      const message = e.body?.message || e.message;
      if (e.status === 409) {
        setConflict(`${message}. The list below is up to date.`);
        setReview(null);
        setNote('');
      } else {
        toast({ variant: 'destructive', title: 'Review failed', description: message });
      }
    } finally {
      setBusy(false);
      window.dispatchEvent(new CustomEvent('inventory-workspace-refresh'));
    }
  };

  const pending = requests.filter(r => r.status === 'PENDING');
  const history = requests.filter(r => r.status !== 'PENDING');

  const card = (request: InventoryItemRequest, actions: boolean) => <li key={request.id} className="space-y-3 py-5">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="font-semibold">{request.itemName}</h3>
      <span className="text-sm font-medium" data-status={request.status}>{STATUS_LABEL[request.status]}</span>
    </div>
    <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
      {describeItemRequestPayload(request.payload).map(row => <div key={row.label}>
        <dt className="text-muted-foreground">{row.label}</dt><dd>{row.value}</dd></div>)}
    </dl>
    <p className="text-sm text-muted-foreground">
      Requested by {personName(request.requestedBy) || 'Staff'} · {displayClinicDateTime(request.createdAt)}
    </p>
    {request.status !== 'PENDING' && <p className="text-sm">
      {request.status === 'APPROVED' ? 'Approved' : 'Rejected'} by {personName(request.reviewedBy) || 'a doctor'}
      {request.reviewedAt ? ` · ${displayClinicDateTime(request.reviewedAt)}` : ''}
      {request.reviewNote && <><br /><span className="font-medium">Note: </span>{request.reviewNote}</>}
    </p>}
    {actions && <ItemRequestDuplicateWarning duplicates={request.possibleDuplicates} intro="Check before approving." />}
    {actions && <div className="flex gap-2">
      <Button onClick={() => { setNote(''); setReview({ request, action: 'approve' }); }}>Approve</Button>
      <Button variant="outline" onClick={() => { setNote(''); setReview({ request, action: 'reject' }); }}>Reject</Button>
    </div>}
  </li>;

  return <section className="space-y-4">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-2xl font-semibold">{canReview ? 'New item requests' : 'My item requests'}</h2>
        <p className="text-muted-foreground">New items enter inventory only after a doctor approves them.</p></div>
      <Button variant="outline" onClick={load} disabled={loading}>Refresh requests</Button>
    </header>
    {conflict && <p role="alert" className="rounded-md border border-destructive p-3 text-sm">{conflict}</p>}
    {error ? <p role="alert">{error} <Button variant="outline" onClick={load}>Retry</Button></p>
      : loading && requests.length === 0 ? <p role="status">Loading requests…</p>
      : <>
        <h3 className="text-lg font-semibold">{canReview ? 'Waiting for review' : 'Waiting for a doctor'} ({pending.length})</h3>
        {pending.length === 0 ? <p className="border-y py-8">No pending new item requests.</p>
          : <ul className="divide-y border-y">{pending.map(r => card(r, canReview))}</ul>}
        <h3 className="text-lg font-semibold">History</h3>
        {history.length === 0 ? <p className="border-y py-8">No reviewed requests yet.</p>
          : <ul className="divide-y border-y">{history.map(r => card(r, false))}</ul>}
      </>}
    <Dialog open={!!review} onOpenChange={(open: boolean) => { if (!open && !busy) setReview(null); }}>
      <DialogContent className="inventory-surface">
        <DialogHeader><DialogTitle>{review?.action === 'approve' ? 'Approve new item' : 'Reject new item'}</DialogTitle>
          <DialogDescription>{review?.request.itemName}. {review?.action === 'approve' ? 'The item is added to inventory immediately.' : 'The item will not be added. Tell the requester why.'}</DialogDescription></DialogHeader>
        {review?.action === 'reject' && <label>Reason for rejection (required)
          <textarea className={inputClass} value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Duplicate of an existing 120 ml pack" /></label>}
        <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setReview(null)}>Cancel</Button>
          <Button disabled={busy || (review?.action === 'reject' && !note.trim())} onClick={submitReview}>
            {busy ? 'Saving…' : review?.action === 'approve' ? 'Approve' : 'Reject'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}
