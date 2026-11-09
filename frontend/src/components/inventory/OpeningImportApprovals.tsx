'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useDashboardUser } from '@/components/layout/dashboard-user-context';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/lib/api';
import { displayClinicDateTime } from '@/lib/date-display';
import {
  describePreviewTarget,
  type ImportApproval,
  type PendingInventoryImport,
  type ReviewedInventoryImport,
} from '@/lib/inventory-imports';
import { ITEM_REQUEST_APPROVER_ROLES, personName } from '@/lib/inventory-item-requests';
import { inputClass } from './workspace-model';

type Review = { entry: PendingInventoryImport; action: 'approve' | 'reject' };

const rowsLabel = (count: number) => `${count} ${count === 1 ? 'row' : 'rows'}`;

function reviewLine(approval: ImportApproval) {
  const verb = approval.status === 'APPROVED' ? 'Approved' : 'Rejected';
  const when = approval.reviewedAt ? ` · ${displayClinicDateTime(approval.reviewedAt)}` : '';
  return `${verb} by ${personName(approval.reviewedBy) || 'a doctor'}${when}`;
}

export function OpeningImportApprovals() {
  const { user } = useDashboardUser();
  const { toast } = useToast();
  const canReview = ITEM_REQUEST_APPROVER_ROLES.includes(user?.role || '');
  const [pending, setPending] = useState<PendingInventoryImport[]>([]);
  const [history, setHistory] = useState<ReviewedInventoryImport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [review, setReview] = useState<Review | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [open, reviewed] = await Promise.all([
        apiClient.getPendingInventoryImports(),
        apiClient.getReviewedInventoryImports(),
      ]);
      setPending(open);
      setHistory(reviewed);
    } catch (e: any) {
      setError(e.message || 'Opening stock imports are unavailable. Try again.');
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
        const outcome = await apiClient.approveInventoryImport(review.entry.importId);
        window.dispatchEvent(new CustomEvent('inventory-stock-refresh'));
        toast({
          variant: outcome.skipped > 0 ? 'destructive' : 'default',
          title: 'Opening stock approved',
          description: `${outcome.created} created, ${outcome.updated} updated, ${outcome.skipped} need attention.`,
        });
      } else {
        await apiClient.rejectInventoryImport(review.entry.importId, note.trim());
        toast({ title: 'Opening stock import rejected' });
      }
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

  const pendingCard = (entry: PendingInventoryImport) => <li key={entry.importId} className="space-y-3 py-5" data-import-id={entry.importId}>
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h4 className="font-semibold">{entry.fileName}</h4>
      <span className="text-sm font-medium">Waiting for doctor</span>
    </div>
    <p className="text-sm text-muted-foreground">
      Requested by {personName(entry.approval.requestedBy) || 'Staff'} · {displayClinicDateTime(entry.createdAt)} · {rowsLabel(entry.rowCount)}
    </p>
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm" aria-label={`Rows in ${entry.fileName}`}>
        <thead><tr className="text-muted-foreground">
          {['Row', 'Product', 'Batch', 'Opening qty', 'Effect', 'Errors'].map(h => <th key={h} className="p-2 font-medium">{h}</th>)}
        </tr></thead>
        <tbody>
          {entry.rows.map(row => <tr key={row.sourceRow} className="border-t">
            <td className="p-2">{row.sourceRow}</td>
            <td className="p-2">{row.name ?? '—'}</td>
            <td className="p-2">{row.batchNumber || '—'}</td>
            <td className="p-2 tabular-nums">{row.currentStock ?? '—'}</td>
            <td className="p-2">{describePreviewTarget(row)}</td>
            <td className="p-2 text-destructive">{row.error ?? ''}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
    {canReview && <div className="flex gap-2">
      <Button onClick={() => { setNote(''); setReview({ entry, action: 'approve' }); }}>Approve import</Button>
      <Button variant="outline" onClick={() => { setNote(''); setReview({ entry, action: 'reject' }); }}>Reject import</Button>
    </div>}
  </li>;

  const historyCard = (entry: ReviewedInventoryImport) => <li key={entry.importId} className="space-y-1 py-4">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h4 className="font-semibold">{entry.fileName}</h4>
      <span className="text-sm font-medium">{entry.approval.status === 'APPROVED' ? 'Approved' : 'Rejected'}</span>
    </div>
    <p className="text-sm text-muted-foreground">
      Requested by {personName(entry.approval.requestedBy) || 'Staff'} · {displayClinicDateTime(entry.createdAt)} · {rowsLabel(entry.rowCount)}
    </p>
    <p className="text-sm">{reviewLine(entry.approval)}
      {entry.approval.note && <><br /><span className="font-medium">Note: </span>{entry.approval.note}</>}
    </p>
  </li>;

  return <section className="space-y-4" aria-labelledby="opening-import-approvals">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 id="opening-import-approvals" className="text-2xl font-semibold">{canReview ? 'Opening stock imports' : 'My opening stock imports'}</h2>
        <p className="text-muted-foreground">Excel opening stock from staff changes inventory only after a doctor approves the file.</p></div>
      <Button variant="outline" onClick={load} disabled={loading}>Refresh imports</Button>
    </header>
    {conflict && <p role="alert" className="rounded-md border border-destructive p-3 text-sm">{conflict}</p>}
    {error ? <p role="alert">{error} <Button variant="outline" onClick={load}>Retry</Button></p>
      : loading && pending.length === 0 && history.length === 0 ? <p role="status">Loading imports…</p>
      : <>
        <h3 className="text-lg font-semibold">Imports waiting for review ({pending.length})</h3>
        {pending.length === 0 ? <p className="border-y py-8">No opening stock imports are waiting.</p>
          : <ul className="divide-y border-y">{pending.map(pendingCard)}</ul>}
        <h3 className="text-lg font-semibold">Reviewed imports</h3>
        {history.length === 0 ? <p className="border-y py-8">No reviewed imports yet.</p>
          : <ul className="divide-y border-y">{history.map(historyCard)}</ul>}
      </>}
    <Dialog open={!!review} onOpenChange={(open: boolean) => { if (!open && !busy) setReview(null); }}>
      <DialogContent className="inventory-surface">
        <DialogHeader><DialogTitle>{review?.action === 'approve' ? 'Approve opening stock import' : 'Reject opening stock import'}</DialogTitle>
          <DialogDescription>{review?.entry.fileName} ({rowsLabel(review?.entry.rowCount ?? 0)}). {review?.action === 'approve'
            ? 'New batches get their opening stock and existing batches get their details updated, now.'
            : 'No stock changes. Tell the requester why.'}</DialogDescription></DialogHeader>
        {review?.action === 'reject' && <label>Reason for rejection (required)
          <textarea className={inputClass} value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Counts are from last year's stocktake" /></label>}
        <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setReview(null)}>Cancel</Button>
          <Button disabled={busy || (review?.action === 'reject' && !note.trim())} onClick={submitReview}>
            {busy ? 'Saving…' : review?.action === 'approve' ? 'Approve' : 'Reject'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}
