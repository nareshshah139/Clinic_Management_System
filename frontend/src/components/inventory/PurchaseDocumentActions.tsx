'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FileDown, History, Loader2, Pencil, Printer, RotateCcw, Upload } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { inputClass, labelStatus } from './workspace-model';
import { SupplierCreditPanel } from './SupplierCreditPanel';

type Purchase = { id: string; status: string; invoiceNumber?: string; updatedAt?: string };
type Props = {
  invoice: Purchase;
  onRefresh?: () => void | Promise<void>;
  onEdit?: () => void;
  onDocument?: (kind: string, id: string) => void;
  onReturn?: (invoiceId: string) => void;
};

/**
 * @cc [owner:nareshshah139,label:product] purchase-actions-preserve-posted-history
 * Posted corrections MUST route to a linked return and replacement bill. Location and discount
 * controls MUST state their prospective effect; exports, originals and logs remain discoverable.
 */
/**
 * @cc [owner:nareshshah139,label:product] purchase-linked-draft-source-isolation
 * Return and credit draft links MUST use distinct stable keys per source purchase and action,
 * so reopening a purchase resumes its draft without recovering another purchase's edits.
 */
/**
 * @cc [owner:nareshshah139,label:product;target] purchase-related-document-links
 * The purchase editor MUST expose linked purchase orders, gate passes and inward challans with
 * each document’s receipt status, so converting a previously received document cannot add the
 * same stock twice.
 * Acceptance: INV-19. Validation and open gaps:
 * docs/qa/inventory-workflow-contract-review.md. This is a target obligation, not a pass claim.
 */
/**
 * @cc [owner:nareshshah139,label:product;target] purchase-posted-correction-traceable
 * A posted purchase MUST retain its original receipt history; corrections MUST link a reversal or
 * amendment rather than silently editing or deleting its recorded stock effect.
 * Acceptance: INV-20. Validation and open gaps:
 * docs/qa/inventory-workflow-contract-review.md. This is a target obligation, not a pass claim.
 */
export function PurchaseDocumentActions({ invoice, onRefresh, onEdit, onDocument, onReturn }: Props) {
  const [detail, setDetail] = useState<any>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [panel, setPanel] = useState<'metadata' | 'logs' | 'returns' | 'correction' | 'credits' | null>(null);
  const [metadata, setMetadata] = useState({ location: '', futureSaleDiscountPercent: '0', reason: '' });
  const upload = useRef<HTMLInputElement>(null), lock = useRef(false);
  const activeInvoice = useRef(invoice.id);
  activeInvoice.current = invoice.id;
  const base = `/inventory/workspace/purchases/${encodeURIComponent(invoice.id)}`;
  const load = useCallback(async () => {
    const result = await apiClient.get<any>(`${base}/actions`);
    if (activeInvoice.current !== invoice.id) return;
    if (!result?.invoice || result.invoice.id !== invoice.id || !result.metadata || !result.permissions || !Array.isArray(result.events) || !Array.isArray(result.related)) {
      throw new Error('Purchase actions could not be loaded. Reload the actions and retry.');
    }
    setDetail(result);
    setMetadata({ location: result.metadata.location || '', futureSaleDiscountPercent: String(result.metadata.futureSaleDiscountPercent || 0), reason: '' });
  }, [base, invoice.id]);
  useEffect(() => { setDetail(null); setPanel(null); setError(''); void load().catch((e: Error) => setError(e.message)); }, [load, invoice.updatedAt]);
  const perform = async (name: string, action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(name); setError(''); setNotice('');
    try { await action(); } catch (e: any) { setError(e.message || 'The purchase action failed. Retry after reloading the purchase.'); }
    finally { lock.current = false; setBusy(''); }
  };
  const download = async (format: string) => {
    const response = await fetch(`/api${base}/export?format=${format}`, { credentials: 'include' });
    if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.message || 'Download failed. Reload the purchase and retry.'); }
    const url = URL.createObjectURL(await response.blob()), link = document.createElement('a');
    link.href = url;
    link.download = /filename="([^"]+)"/.exec(response.headers.get('content-disposition') || '')?.[1] || `purchase-${format}.${format === 'qr' ? 'pdf' : format}`;
    link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    setNotice(format === 'qr' ? 'QR PDF downloaded. Print it, then scan or paste its purchase code into the register search.' : 'Saved purchase downloaded with all rows, taxes, totals and status.');
  };
  const linkedDraftKey = (kind: string) => encodeURIComponent(`purchase-${invoice.id}-${kind}`);
  const returnToSupplier = () => onReturn ? onReturn(invoice.id) : window.location.assign(`/dashboard/inventory?area=stock&view=SUPPLIER_RETURN&new=${linkedDraftKey('return')}&purchaseInvoiceId=${encodeURIComponent(invoice.id)}`);
  const openDocument = (doc: any) => onDocument ? onDocument(doc.kind, doc.id) : window.location.assign(`/dashboard/inventory?area=${['PURCHASE_ORDER'].includes(doc.kind) ? 'reorder' : ['SUPPLIER_RETURN', 'CORRECTION'].includes(doc.kind) ? 'stock' : 'purchases'}&view=${encodeURIComponent(doc.kind)}&document=${encodeURIComponent(doc.id)}`);
  const posted = (detail?.invoice?.status || invoice.status) === 'STOCK_COMMITTED';
  const editable = ['DRAFT', 'OCR_REVIEW_REQUIRED', 'RECONCILIATION_FAILED'].includes(detail?.invoice?.status || invoice.status);
  const returns = (detail?.related || []).filter((doc: any) => ['SUPPLIER_RETURN', 'CORRECTION', 'CREDIT_NOTE'].includes(doc.kind));
  return <section aria-label="Purchase document actions" className="space-y-4 border-y py-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="text-lg font-semibold">Purchase documents & history</h3><p className="mt-1 max-w-3xl text-sm text-muted-foreground">{posted ? 'The receipt is posted. Keep corrections linked to its original stock and supplier history.' : 'Saved files and exports reflect the last saved purchase.'}</p></div>
      {!detail && !error && <span role="status" className="flex items-center gap-2 text-sm"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />Loading actions…</span>}
    </div>
    {error && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm"><p>{error}</p><Button type="button" variant="outline" size="sm" disabled={!!busy} onClick={() => void perform('Reload', load)}>Reload actions</Button></div>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
    <div className="flex flex-wrap gap-2">
      {(editable || posted) && detail?.permissions.edit && <Button type="button" variant="outline" disabled={!!busy || (!posted && !onEdit)} onClick={() => posted ? setPanel('correction') : onEdit?.()}><Pencil className="h-4 w-4" aria-hidden="true" />{posted ? 'Correct posted purchase' : 'Edit draft'}</Button>}
      {posted && detail?.permissions.return && <Button type="button" variant="outline" disabled={!!busy} onClick={returnToSupplier}><RotateCcw className="h-4 w-4" aria-hidden="true" />Return to supplier</Button>}
      <Button type="button" variant="outline" disabled={!detail || !!busy} onClick={() => setPanel(panel === 'returns' ? null : 'returns')}>Return history ({returns.length})</Button>
      {posted && detail?.permissions.ledgerRead && <Button type="button" variant="outline" disabled={!!busy} aria-expanded={panel === 'credits'} onClick={() => setPanel(panel === 'credits' ? null : 'credits')}>Eligible supplier credits</Button>}
      {detail?.permissions.metadata && <Button type="button" variant="outline" disabled={!!busy} onClick={() => setPanel(panel === 'metadata' ? null : 'metadata')}>Set location & discount</Button>}
      <Button type="button" variant="outline" disabled={!detail || !!busy} onClick={() => setPanel(panel === 'logs' ? null : 'logs')}><History className="h-4 w-4" aria-hidden="true" />Logs</Button>
    </div>
    <div className="flex flex-wrap gap-2" aria-label="Purchase exports">
      {([['pdf', 'PDF'], ['xlsx', 'Excel'], ['csv', 'Purchase CSV'], ['qr', 'Print QR']] as const).map(([format, name]) => <Button key={format} type="button" size="sm" variant="outline" disabled={!detail || !!busy} onClick={() => void perform(name, () => download(format))}>{busy === name ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : format === 'qr' ? <Printer className="h-4 w-4" aria-hidden="true" /> : <FileDown className="h-4 w-4" aria-hidden="true" />}{name}</Button>)}
    </div>
    {panel === 'correction' && <div className="space-y-3 bg-muted/40 p-4 text-sm"><h4 className="font-semibold">Correct this posted purchase</h4><p className="max-w-3xl">Create a linked supplier return with a reason for affected quantities. Finalise its credit, then enter the corrected replacement bill. For a price-only supplier credit, use a linked credit note. The original bill, stock receipt and files remain available.</p><div className="flex flex-wrap gap-2">{detail?.permissions.return && <Button type="button" onClick={returnToSupplier}>Start linked return</Button>}<a className="inline-flex min-h-10 items-center underline underline-offset-4" href={`/dashboard/inventory?area=purchases&view=CREDIT_NOTE&new=${linkedDraftKey('credit')}&purchaseInvoiceId=${encodeURIComponent(invoice.id)}`}>Record linked supplier credit</a><Button type="button" variant="ghost" onClick={() => setPanel(null)}>Close</Button></div></div>}
    {panel === 'credits' && posted && detail?.permissions.ledgerRead && <SupplierCreditPanel
      key={invoice.id} canWrite={!!detail.permissions.mayAllocate} purchaseInvoiceId={invoice.id}
      supplierGstin={detail.invoice.distributorGstin} onOpen={onDocument}
      onChanged={async () => { await load(); await onRefresh?.(); }} />}
    {panel === 'metadata' && <form className="space-y-3 bg-muted/40 p-4" onSubmit={event => { event.preventDefault(); void perform('Save location', async () => { await apiClient.patch(`${base}/metadata`, { ...metadata, futureSaleDiscountPercent: Number(metadata.futureSaleDiscountPercent), version: detail.version }); await load(); await onRefresh?.(); setPanel(null); setNotice('Location and suggested future sale discount saved. Purchase totals and historical discounts are unchanged.'); }); }}>
      <h4 className="font-semibold">Location & suggested future sale discount</h4><p className="max-w-3xl text-sm text-muted-foreground">Applies to this purchase’s linked batches. This records a suggestion for future sales; it does not change this bill, supplier dues or earlier sales.</p>
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Shelf / location<input className={inputClass} maxLength={160} value={metadata.location} onChange={e => setMetadata({ ...metadata, location: e.target.value })} /></label><label className="text-sm">Suggested future sale discount (%)<input className={inputClass} type="number" min="0" max="100" step="0.01" required value={metadata.futureSaleDiscountPercent} onChange={e => setMetadata({ ...metadata, futureSaleDiscountPercent: e.target.value })} /></label></div>
      <label className="block text-sm">Reason for change<input className={inputClass} required minLength={3} maxLength={500} value={metadata.reason} onChange={e => setMetadata({ ...metadata, reason: e.target.value })} /></label>
      <div className="flex gap-2"><Button type="submit" disabled={!!busy}>{busy ? 'Saving…' : 'Save location & discount'}</Button><Button type="button" variant="ghost" disabled={!!busy} onClick={() => setPanel(null)}>Cancel</Button></div>
    </form>}
    {panel === 'returns' && <div><h4 className="font-semibold">Linked returns & corrections</h4>{!returns.length ? <p className="mt-2 text-sm text-muted-foreground">No return, correction or credit note is linked to this purchase.</p> : <ul className="mt-2 divide-y">{returns.map((doc: any) => <li key={doc.id} className="py-2"><button type="button" className="min-h-10 text-left text-sm underline underline-offset-4" onClick={() => openDocument(doc)}>{doc.reference} · {labelStatus(doc.status)}</button></li>)}</ul>}</div>}
    {panel === 'logs' && <div><h4 className="font-semibold">Purchase logs</h4><ol className="mt-2 divide-y">{detail?.events.map((event: any) => <li key={event.id} className="space-y-1 py-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong>{event.action.replaceAll('_', ' ').toLowerCase()}</strong><time dateTime={event.at}>{new Date(event.at).toLocaleString('en-IN')}</time></div><p className="text-muted-foreground">{event.actor}</p><details><summary className="cursor-pointer py-1">View recorded details</summary><pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all bg-muted p-3 text-xs">{JSON.stringify({ before: event.before, after: event.after }, null, 2)}</pre></details></li>)}</ol></div>}
    {!!detail?.related.length && <div><h4 className="text-sm font-semibold">Related documents</h4><ul className="mt-1 flex flex-wrap gap-x-5 gap-y-1">{detail.related.map((doc: any) => <li key={doc.id}><button type="button" className="min-h-10 text-left text-sm underline underline-offset-4" onClick={() => openDocument(doc)}>{doc.reference} · {doc.kind.replaceAll('_', ' ').toLowerCase()} · {labelStatus(doc.status)}</button></li>)}</ul></div>}
    <div><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-semibold">Retained originals</h4>{detail?.permissions.attach && <><input ref={upload} type="file" accept="image/*,application/pdf" className="hidden" aria-label="Supporting original file" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; void perform('Upload original', async () => { const form = new FormData(); form.append('file', file); const response = await fetch(`/api${base}/originals`, { method: 'POST', credentials: 'include', body: form }); if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.message || 'Original upload failed. Use a valid image or PDF up to 25 MB.'); } await load(); await onRefresh?.(); setNotice('Supporting original retained. Existing files and stock are unchanged.'); }); }} /><Button type="button" size="sm" variant="outline" disabled={!!busy} onClick={() => upload.current?.click()}><Upload className="h-4 w-4" aria-hidden="true" />{busy === 'Upload original' ? 'Uploading…' : 'Add supporting original'}</Button></>}</div>
      {detail && !detail.invoice.documents?.length && <p className="mt-2 text-sm text-muted-foreground">No original files are attached to this purchase.</p>}
      <ul className="mt-1 divide-y">{detail?.invoice.documents?.map((file: any) => <li key={file.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><a className="min-h-10 content-center break-all underline underline-offset-4" href={`/api/pharmacy/purchase-invoices/documents/${encodeURIComponent(file.id)}`} target="_blank" rel="noreferrer">{file.fileName}</a><span className="text-muted-foreground">{Math.ceil(file.sizeBytes / 1024)} KB · {new Date(file.createdAt).toLocaleDateString('en-IN')}</span></li>)}</ul>
    </div>
  </section>;
}
