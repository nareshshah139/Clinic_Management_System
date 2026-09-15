'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, FileDown, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api';
import { downloadCsv, fmtDate, fmtMoney, inputClass, labelStatus, requestKey } from './workspace-model';

type Props = {
  view: string; documentId?: string; caps: any;
  query?: Record<string, string>; navigate?: (changes: Record<string, string>) => void;
  onOpen: (kind: string, id: string) => void;
  onCreate: (kind: string, initial?: any) => void;
  onReceive: (context: any) => void;
  onBack?: () => void;
};
const emptyFilters = { search: '', from: '', to: '', status: '', gstin: '' };
const time = (value: string | null) => value ? new Date(value).toLocaleString('en-IN') : 'Not scheduled';
const api = '/inventory/workspace';

/**
 * @cc [owner:nareshshah139,label:product] replenishment-controls-authoritative-state
 * Target review MUST show prior values, proposal evidence and explicit per-line decisions. Order
 * receipts and delivery outcomes MUST come from saved server records; failed loads cannot show zero.
 * URL filters MUST govern the complete list/export scope; older responses cannot replace a newer scope.
 */
/**
 * @cc [owner:nareshshah139,label:product;target] inventory-shortbook-workflow
 * The reorder workspace MUST provide a Shortbook with persisted item requests, supplier, required
 * quantity, priority and status; accepting a request MUST NOT itself receive stock.
 * Acceptance: INV-35. Validation and open gaps:
 * docs/qa/inventory-workflow-contract-review.md. This is a target obligation, not a pass claim.
 */
/**
 * @cc [owner:nareshshah139,label:product;target] inventory-auto-po-observable
 * Automated ordering MUST expose its supplier selection, approval policy, last result and
 * failures; a forecast MUST NOT be presented as a placed or received order.
 * Acceptance: INV-37. Validation and open gaps:
 * docs/qa/inventory-workflow-contract-review.md. This is a target obligation, not a pass claim.
 */
export function ReplenishmentCenter({ view, documentId, caps, onOpen, onCreate, onReceive, onBack, query, navigate }: Props) {
  const [state, setState] = useState<any>(null), [rows, setRows] = useState<any[]>([]), [doc, setDoc] = useState<any>(null);
  const [owners, setOwners] = useState<any[]>([]), [settings, setSettings] = useState<any>(null), [suggestions, setSuggestions] = useState<any[]>([]);
  const [selected, setSelected] = useState<string[]>([]), [sync, setSync] = useState(true), [supplierId, setSupplierId] = useState(''), [reason, setReason] = useState('');
  const urlFilters = useMemo(() => ({ search: query?.search || '', from: query?.from || '', to: query?.to || '', status: query?.status || '', gstin: query?.gstin || '' }), [query?.search, query?.from, query?.to, query?.status, query?.gstin]);
  const [filter, setFilter] = useState(urlFilters), [localApplied, setLocalApplied] = useState(emptyFilters);
  const applied = query ? urlFilters : localApplied;
  useEffect(() => { setFilter(urlFilters); }, [urlFilters]);
  const applyFilters = (values: typeof emptyFilters) => { setFilter(values); if (navigate) navigate({ ...values, page: '1', document: '', new: '' }); else setLocalApplied(values); };
  const [loading, setLoading] = useState(true), [loadFailed, setLoadFailed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const feedback = useRef<HTMLDivElement>(null), lock = useRef(false), loadGeneration = useRef(0);
  const canWrite = !!caps?.kinds?.[view]?.write, canApprove = !!caps?.approve;
  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    setLoading(true); setLoadFailed(false); setError('');
    try {
      let nextDoc: any, nextState: any, nextRows: any[] | undefined, nextOwners: any[] | undefined, nextSuggestions: any[] | undefined;
      if (documentId) {
        nextDoc = await apiClient.get(`${api}/documents/${documentId}`);
        if (view === 'PURCHASE_ORDER') nextState = await apiClient.get(`${api}/replenishment/orders/${documentId}/receipt`);
        if (view === 'SHORTBOOK') nextSuggestions = await Promise.all(nextDoc.payload.lines.map((l: any) => apiClient.get(`${api}/replenishment/suppliers/${l.inventoryId}`)));
      } else if (view === 'settings') {
        nextState = await apiClient.get(`${api}/replenishment/status`);
        if (caps?.settings) nextOwners = await apiClient.get<any[]>(`${api}/owners`);
      } else if (view === 'targets') {
        nextState = await apiClient.get(`${api}/replenishment/manual-targets?${new URLSearchParams({ search: applied.search })}`);
      } else if (view === 'monitor') {
        const params = new URLSearchParams({ ...(applied.from ? { from: applied.from } : {}), ...(applied.to ? { to: applied.to } : {}) });
        nextState = await apiClient.get(`${api}/replenishment/monitor?${params}`);
      } else {
        const params = new URLSearchParams({ kind: view, limit: '100', ...(applied.status ? { status: applied.status } : {}), ...(applied.gstin ? { gstin: applied.gstin } : {}), ...(applied.from ? { from: applied.from } : {}), ...(applied.to ? { to: applied.to } : {}) });
        const first: any = await apiClient.get(`${api}/documents?${params}`), all = [...first.rows];
        for (let page = 2; page <= first.totalPages; page++) all.push(...(await apiClient.get<any>(`${api}/documents?${params}&page=${page}`)).rows);
        nextRows = all.filter((d: any) => !applied.search || `${d.reference} ${d.payload.lines.map((l: any) => l.name).join(' ')}`.toLowerCase().includes(applied.search.toLowerCase()));
      }
      if (generation !== loadGeneration.current) return;
      if (nextDoc) { setDoc(nextDoc); setSelected([]); setSupplierId(nextDoc.supplierId || ''); }
      if (nextState) { setState(nextState); if (view === 'settings') setSettings(nextState.settings); }
      if (nextRows) setRows(nextRows);
      if (nextOwners) setOwners(nextOwners);
      if (nextSuggestions) setSuggestions(nextSuggestions);
    } catch (e: any) { if (generation === loadGeneration.current) { setLoadFailed(true); setError(e.message || 'Could not load replenishment. Retry.'); } }
    finally { if (generation === loadGeneration.current) setLoading(false); }
  }, [view, documentId, applied, caps?.settings]);
  useEffect(() => { setDoc(null); setState(null); setSuggestions([]); setNotice(''); void load(); }, [load]);
  useEffect(() => { const refresh = () => { void load(); }; window.addEventListener('inventory-workspace-refresh', refresh); return () => window.removeEventListener('inventory-workspace-refresh', refresh); }, [load]);
  const action = async (work: () => Promise<any>, success: string) => {
    if (lock.current) return; lock.current = true; setBusy(true); setError(''); setNotice('');
    try { const result = await work(); await load(); setNotice(result?.delivery?.message || success); }
    catch (e: any) { setError(e.message || 'The action could not be completed. Reload to check the saved state.'); }
    finally { setBusy(false); lock.current = false; feedback.current?.focus(); }
  };
  const propose = () => action(async () => { const result: any = await apiClient.post(`${api}/targets/propose`, { requestKey: requestKey() }); onOpen('TARGET_REVIEW', result.id); return result; }, 'Proposal ready for review; active targets are unchanged.');
  const field = (key: string, value: any) => setSettings((s: any) => ({ ...s, [key]: value }));
  const filters = <form className="flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); applyFilters({ ...filter }); }}>
    {view !== 'monitor' && <label className="min-w-48 flex-1 text-sm">Search item or reference<input className={inputClass} value={filter.search} onChange={e => setFilter({ ...filter, search: e.target.value })}/></label>}
    {!['monitor', 'targets'].includes(view) && <label className="text-sm">Status<select className={inputClass} value={filter.status} onChange={e => setFilter({ ...filter, status: e.target.value })}><option value="">All statuses</option>{['OPEN', 'DRAFT', 'AWAITING_APPROVAL', 'APPROVED', 'SENT', 'PART_REVIEWED', 'PART_RECEIVED', 'RECEIVED', 'POSTED', 'CANCELLED', 'REJECTED'].map(value => <option key={value} value={value}>{labelStatus(value)}</option>)}</select></label>}
    {['SHORTBOOK', 'PURCHASE_ORDER'].includes(view) && <label className="text-sm">Supplier GSTIN<input className={inputClass} value={filter.gstin} onChange={e => setFilter({ ...filter, gstin: e.target.value.toUpperCase() })}/></label>}
    {view !== 'targets' && <><label className="text-sm">From<input type="date" className={inputClass} value={filter.from} onChange={e => setFilter({ ...filter, from: e.target.value })}/></label>
    <label className="text-sm">Through<input type="date" className={inputClass} value={filter.to} onChange={e => setFilter({ ...filter, to: e.target.value })}/></label></>}
    <Button variant="outline" type="submit">Apply filters</Button><Button variant="ghost" type="button" onClick={() => applyFilters({ ...emptyFilters })}>Clear</Button>
  </form>;
  return <section className="min-w-0 space-y-5" aria-label="Replenishment review">
    <div ref={feedback} tabIndex={-1} className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" aria-live="polite">
      {error && <div role="alert" className="space-y-2 rounded-md border border-destructive p-3 text-destructive"><p>{error}</p><Button variant="outline" onClick={() => void load()}>Retry loading</Button></div>}
      {notice && <p role="status" className="rounded-md border p-3">{notice}</p>}
    </div>
    {loading ? <p role="status" className="py-6">Loading saved replenishment records…</p> : loadFailed ? null : documentId && doc ? <>
      {onBack && <Button variant="ghost" onClick={onBack}><ArrowLeft className="h-4 w-4"/>Back to list</Button>}
      {view === 'TARGET_REVIEW' && <>
        <header><h2 className="text-2xl font-semibold">{doc.reference}</h2><p className="mt-1 text-sm text-muted-foreground">{labelStatus(doc.status)} · {doc.payload.calculation?.model || 'Saved proposal'} · {fmtDate(doc.createdAt)}</p></header>
        <p className="max-w-3xl text-sm">{doc.payload.calculation?.assumptions}</p>
        <dl className="grid gap-3 border-y py-4 text-sm sm:grid-cols-3"><div><dt className="text-muted-foreground">Evidence dates</dt><dd>{fmtDate(doc.payload.calculation?.from)} – {fmtDate(doc.payload.calculation?.to)}</dd></div><div><dt className="text-muted-foreground">Demand inputs</dt><dd>{doc.payload.calculation?.lookbackDays} days · {doc.payload.calculation?.minimumOrders} minimum orders · Bounce {doc.payload.calculation?.includeBounce ? 'On' : 'Off'} · Refill {doc.payload.calculation?.includeRefill ? 'On' : 'Off'}</dd></div><div><dt className="text-muted-foreground">Coverage</dt><dd>{doc.payload.calculation?.minCoverDays} / {doc.payload.calculation?.maxCoverDays} min / max days</dd></div></dl>
        <div className="flex flex-wrap items-center gap-3"><Button variant="outline" disabled={!canApprove || busy} onClick={() => setSelected(doc.payload.lines.filter((l: any) => !doc.payload.decisions?.[l.id]).map((l: any) => l.id))}>Select unreviewed</Button><Button variant="ghost" onClick={() => setSelected([])}>Clear selection</Button><span className="text-sm">{selected.length} selected</span></div>
        <div className="space-y-0 divide-y border-y">{doc.payload.lines.map((line: any) => {
          const evidence = doc.payload.calculation?.items?.[line.inventoryId], decision = doc.payload.decisions?.[line.id];
          return <article key={line.id} className="grid gap-3 py-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <label className="flex items-start gap-3"><input className="mt-1 h-4 w-4 accent-primary" type="checkbox" disabled={!canApprove || !!decision || busy} checked={selected.includes(line.id)} onChange={e => setSelected(e.target.checked ? [...selected, line.id] : selected.filter(id => id !== line.id))}/><span><strong>{line.name}</strong><span className="mt-1 block text-sm text-muted-foreground">{line.batchNumber || 'No batch'} · {line.unit}</span><span className="mt-1 block text-sm">{decision ? `${decision.action === 'ACCEPT' ? 'Accepted' : 'Rejected'} ${time(decision.at)} by ${decision.actorId}` : evidence?.coldStart ? evidence.unconfigured ? 'Unconfigured: set manual targets first' : 'Cold start: retain saved targets' : 'Ready for review'}</span></span></label>
            <div className="space-y-2 text-sm"><p>Saved min / max <strong>{line.beforeMin ?? 'Unconfigured'} / {line.beforeMax ?? 'Unconfigured'}</strong> → Proposed <strong>{line.minStockLevel} / {line.maxStockLevel} {line.unit}</strong></p><p>Available {evidence?.available ?? '—'} · Sales {evidence?.salesUnits ?? '—'} · Bounce {evidence?.bounceUnits ?? 0} · Refill {evidence?.refillUnits ?? 0} · {evidence?.orders ?? '—'} orders</p>
            {evidence?.records?.length > 0 && <details><summary className="cursor-pointer underline underline-offset-4">Demand records ({evidence.records.length})</summary><ul className="mt-2 space-y-1">{evidence.records.map((r: any, i: number) => <li key={`${r.id}-${i}`}>{fmtDate(r.date)} · {r.kind} · {r.quantity} {line.unit} · <span className="break-all">{r.id}</span></li>)}</ul></details>}</div>
          </article>;
        })}</div>
        {!!doc.payload.calculation?.excluded?.length && <details open><summary className="font-semibold">Excluded items ({doc.payload.calculation.excluded.length})</summary><ul className="mt-2 space-y-2 text-sm">{doc.payload.calculation.excluded.map((item: any) => <li key={item.inventoryId}>{item.name} · {item.reason} · saved {item.beforeMin ?? 'Unconfigured'} / {item.beforeMax ?? 'Unconfigured'} {item.unit}</li>)}</ul></details>}
        {canApprove && <div className="flex flex-wrap items-center gap-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sync} onChange={e => setSync(e.target.checked)}/>Sync accepted targets to Shortbook</label><Button disabled={!selected.length || busy} onClick={() => action(() => apiClient.post(`${api}/replenishment/targets/${doc.id}/review`, { version: doc.version, action: 'ACCEPT', lineIds: selected, syncShortbook: sync }), 'Selected targets accepted. Unselected lines remain available for review.')}>Accept selected</Button><Button variant="outline" disabled={!selected.length || busy} onClick={() => action(() => apiClient.post(`${api}/replenishment/targets/${doc.id}/review`, { version: doc.version, action: 'REJECT', lineIds: selected }), 'Selected proposal lines rejected; saved targets retained.')}>Reject selected</Button></div>}
      </>}
      {view === 'SHORTBOOK' && <section className="space-y-4"><h3 className="text-lg font-semibold">Supplier recommendation</h3><p className="text-sm">Review saved suppliers and posted purchase history. Availability means an active saved supplier; live supplier stock is not connected.</p>
        {suggestions.map(item => <div key={item.inventoryId} className="space-y-2 border-y py-3"><h4 className="font-medium">{item.item} · {item.unit}</h4>{item.suggestions.map((supplier: any) => <details key={supplier.id} className="py-1"><summary className="cursor-pointer text-sm">{supplier.name} · {supplier.id === doc.supplierId ? 'Chosen supplier' : 'Alternative'} · {supplier.history.length} posted purchase records</summary>{supplier.history.length ? <ul className="mt-2 space-y-2 text-sm">{supplier.history.map((h: any) => <li key={h.invoiceId}>{h.reference} · {fmtDate(h.date)} · {fmtMoney(h.purchaseRate)} / {h.unit} · pack {h.pack} · paid {h.quantity}, free {h.freeQuantity}, discount {h.discountPercent}%<p>{h.priceBasis}. {!h.comparable && 'Different quantity unit; no price ranking.'}</p></li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">No posted purchase history for this item.</p>}</details>)}</div>)}
        {canWrite && doc.status === 'DRAFT' && <div className="flex flex-wrap items-end gap-3"><label className="min-w-48 flex-1 text-sm">Choose supplier for this request<select className={inputClass} value={supplierId} onChange={e => setSupplierId(e.target.value)}><option value="">Select a saved supplier</option>{suggestions[0]?.suggestions.map((s: any) => <option key={s.id} value={s.id}>{s.name} · {s.gstNumber || 'GSTIN missing'}</option>)}</select></label><Button disabled={busy || !supplierId} onClick={() => action(() => apiClient.post(`${api}/replenishment/shortbook/${doc.id}/supplier`, { version: doc.version, supplierId }), 'Supplier choice saved for this request and future shortages.')}>Save supplier choice</Button></div>}
      </section>}
      {view === 'PURCHASE_ORDER' && state && <section className="space-y-4"><h3 className="text-lg font-semibold">Order delivery & receipts</h3><p className="text-sm">{state.policy}</p>
        <div className="overflow-x-auto rounded-md border"><table className="w-full text-left text-sm"><caption className="sr-only">Expected, previously received and remaining order units</caption><thead className="bg-muted"><tr>{['Item / unit', 'Ordered', 'Previously received', 'Remaining'].map(h => <th key={h} className="p-3">{h}</th>)}</tr></thead><tbody className="divide-y">{state.lines.map((l: any) => <tr key={l.id}><th className="min-w-44 p-3 font-medium">{l.name}<span className="block text-xs text-muted-foreground">{l.unit}</span></th><td className="p-3">{l.orderedQuantity}</td><td className="p-3">{l.receivedQuantity}</td><td className="p-3">{l.remainingQuantity}{state.payload.cancelledRemaining && ' cancelled'}</td></tr>)}</tbody></table></div>
        <div className="flex flex-wrap gap-3">{state.canReceive && caps?.kinds?.INWARD_CHALLAN?.write && <Button onClick={() => onReceive(state)}>Receive remaining stock</Button>}{canApprove && ['APPROVED', 'PART_RECEIVED'].includes(doc.status) && <Button variant="outline" disabled={busy} onClick={() => action(() => apiClient.post(`${api}/replenishment/orders/${doc.id}/dispatch`, { version: doc.version, requestKey: requestKey() }), 'Delivery result recorded.')}>Send purchase order</Button>}<Button variant="outline" onClick={() => downloadCsv(`${doc.reference}.csv`, state.lines)}>Export order & remaining quantities</Button></div>
        <p className="text-sm text-muted-foreground">Supplier mail transport: setup required. Sending records the setup failure; export is available for manual delivery.</p>
        {!!doc.payload.dispatchAttempts?.length && <ul className="space-y-2 text-sm">{doc.payload.dispatchAttempts.map((a: any) => <li key={a.requestKey}>{time(a.at)} · {a.status} · {a.message}</li>)}</ul>}
        {state.receipts.length > 0 && <div><h4 className="font-medium">Receipt history</h4><ul className="mt-2 space-y-2">{state.receipts.map((r: any) => <li key={r.id}><Button variant="link" className="h-auto p-0 text-left" onClick={() => onOpen('INWARD_CHALLAN', r.id)}>{r.reference}</Button> <span className="text-sm">· {labelStatus(r.status)} · {fmtDate(r.createdAt)}</span></li>)}</ul></div>}
        {canApprove && ['DRAFT', 'AWAITING_APPROVAL', 'APPROVED', 'SENT', 'PART_RECEIVED'].includes(doc.status) && <details><summary className="cursor-pointer text-sm underline underline-offset-4">Cancel remaining quantities</summary><div className="mt-3 flex flex-wrap items-end gap-3"><label className="min-w-48 flex-1 text-sm">Cancellation reason (required)<input className={inputClass} value={reason} onChange={e => setReason(e.target.value)}/></label><Button variant="outline" disabled={busy || !reason.trim()} onClick={() => action(() => apiClient.post(`${api}/replenishment/orders/${doc.id}/cancel-remaining`, { version: doc.version, reason }), 'Remaining units cancelled. Posted receipts and stock are retained.')}>Cancel remaining units</Button></div></details>}
      </section>}
    </> : view === 'targets' && state ? <ManualTargets key={state.version} data={state} filters={filters} canEdit={canApprove && !!caps?.kinds?.TARGET_REVIEW?.write} busy={busy} onSave={input => action(() => apiClient.post(`${api}/replenishment/manual-targets`, input), 'Reviewed targets and exclusions saved with their history.')} /> : view === 'settings' && state && settings ? <>
      <header><h2 className="text-2xl font-semibold">Automation setup & summary</h2><p className="mt-1 text-sm text-muted-foreground">{state.schedule}</p></header>
      <dl className="grid gap-4 border-y py-4 text-sm sm:grid-cols-2 lg:grid-cols-4"><div><dt className="text-muted-foreground">Owner</dt><dd>{state.owner ? `${state.owner.firstName} ${state.owner.lastName}${state.owner.isActive ? '' : ' (inactive)'}` : 'Setup required'}</dd></div><div><dt className="text-muted-foreground">Last run</dt><dd>{state.lastRunAt ? time(state.lastRunAt) : 'Never run'}</dd></div><div><dt className="text-muted-foreground">Next scheduler / target run</dt><dd>{time(state.nextRunAt)}<br/>{time(state.nextTargetRunAt)}</dd></div><div><dt className="text-muted-foreground">Model / version</dt><dd>{state.model}</dd></div></dl>
      <p className="max-w-3xl text-sm">{state.approvalPolicy} Sales outflows and selected bounce/refill quotations drive demand. Each proposal preserves source records; manual overrides and exclusions remain unchanged.</p>
      {!caps?.settings && <p className="text-sm">An inventory manager can change automation settings.</p>}
      <fieldset disabled={!caps?.settings || busy} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-sm">Automation owner<select className={inputClass} value={settings.ownerId} onChange={e => field('ownerId', e.target.value)}><option value="">Select an active branch owner</option>{owners.map(o => <option key={o.id} value={o.id}>{o.firstName} {o.lastName} · {o.role}</option>)}</select></label>
        {[['autoMinMaxEnabled', 'Automatic target proposals'], ['autoPoEnabled', 'Automatic PO drafts'], ['auditEnabled', 'Daily stock count']].map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings[key]} onChange={e => field(key, e.target.checked)}/>{label}: {settings[key] ? 'On' : 'Off'}</label>)}
        {[['lookbackDays', 'Demand lookback (days)'], ['minimumOrders', 'Minimum order history'], ['minCoverDays', 'Minimum stock cover (days)'], ['maxCoverDays', 'Maximum stock cover (days)'], ['refreshDays', 'Target refresh (days)'], ['auditDailyCount', 'Batches per daily count']].map(([key, label]) => <label key={key} className="text-sm">{label}<input className={inputClass} type="number" min="1" step="1" value={settings[key]} onChange={e => field(key, e.target.value === '' ? '' : Number(e.target.value))}/></label>)}
        <label className="text-sm">Count adjustment policy<select className={inputClass} value={settings.auditAdjustmentMode} onChange={e => field('auditAdjustmentMode', e.target.value)}><option value="APPROVAL">Manager approval for every variance</option><option value="THRESHOLD">Approval based on variance rules</option></select><span className="mt-1 block text-xs text-muted-foreground">Managers can approve. Other staff follow this policy when posting a stock count.</span></label>
        <label className="text-sm">Count variance approval threshold (₹)<input className={inputClass} type="number" min="0" step="0.01" value={settings.approvalValue} onChange={e => field('approvalValue', e.target.value === '' ? '' : Number(e.target.value))}/></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.negativeCountNeedsApproval} onChange={e => field('negativeCountNeedsApproval', e.target.checked)}/>Negative count variances require approval</label>
        {[['includeBounce', 'Include unfulfilled bounce quotations'], ['includeRefill', 'Include planned refill quotations']].map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings[key]} onChange={e => field(key, e.target.checked)}/>{label}</label>)}
      </fieldset>
      <p className="text-sm">{settings.auditAdjustmentMode === 'APPROVAL' ? 'Every nonzero count variance requires a manager. The threshold and negative-variance rules apply only when the rule-based policy is selected.' : 'Approval is required when the variance value reaches the threshold, or a negative variance meets the selected rule.'}</p>
      <div className="flex flex-wrap gap-3">{caps?.settings && <><Button disabled={busy} onClick={() => action(() => apiClient.patch(`${api}/settings`, settings), 'Automation settings saved.')}>Save settings</Button><Button variant="outline" disabled={busy} onClick={() => action(() => apiClient.post(`${api}/automation/run`, {}), 'Run recorded. Review the outcomes below.')}>Run saved configuration now</Button></>}</div>
      <p className="text-sm">{state.transport.message}</p>
      <RunHistory runs={state.runs} onOpen={onOpen}/>
    </> : view === 'monitor' && state ? <>
      <header><h2 className="text-2xl font-semibold">Replenishment monitor</h2><p className="mt-1 max-w-3xl text-sm text-muted-foreground">{state.basis}</p></header>{filters}
      <p className="text-sm">Scope: {fmtDate(state.from)} – {fmtDate(state.to)} · Branch {state.branchId}</p>
      <div className="space-y-3" aria-label="Order outcomes chart">{state.series.map((s: any) => <details key={s.name}><summary className="grid cursor-pointer grid-cols-[9rem_1fr_3rem] items-center gap-3 text-sm"><span>{s.name.replaceAll('_', ' ')}</span><span className="h-3 overflow-hidden rounded-sm bg-muted"><span className="block h-full bg-primary" style={{ width: `${100 * s.count / Math.max(1, ...state.series.map((v: any) => v.count))}%` }}/></span><strong>{s.count}</strong></summary><ul className="mt-3 space-y-2 text-sm">{s.records.length ? s.records.map((r: any) => <li key={r.id}><Button variant="link" className="h-auto p-0" onClick={() => onOpen('PURCHASE_ORDER', r.documentId)}>{state.documents.find((d: any) => d.id === r.documentId)?.reference || 'Open purchase order'}</Button> · {time(r.at)} · {r.action}</li>) : <li>No matching events.</li>}</ul></details>)}</div>
      <Button variant="outline" onClick={() => downloadCsv('replenishment-events.csv', state.series.flatMap((s: any) => s.records.map((r: any) => ({ outcome: s.name, ...r }))))}><FileDown className="h-4 w-4"/>Export underlying records</Button>
      <section className="space-y-3"><h3 className="text-lg font-semibold">Demand & stock coverage</h3><p className="text-sm text-muted-foreground">Latest proposal created in this date scope. Cover uses available stock divided by observed daily demand in the displayed unit.</p>{state.coverage?.length ? <div className="overflow-x-auto rounded-md border"><table className="w-full text-left text-sm"><caption className="sr-only">All items from the latest target proposal</caption><thead className="bg-muted"><tr>{['Item / unit', 'Available', 'Demand per day', 'Days of cover', 'Evidence'].map(h => <th key={h} className="p-3">{h}</th>)}</tr></thead><tbody className="divide-y">{state.coverage.map((item: any) => <tr key={item.inventoryId}><th className="min-w-40 p-3 font-medium">{item.name || item.inventoryId}<span className="block text-xs">{item.unit}</span></th><td className="p-3">{item.available}</td><td className="p-3">{Number(item.averageDailyDemand).toFixed(2)}</td><td className="p-3">{item.daysCover ?? 'No observed demand'}</td><td className="p-3"><Button variant="link" className="h-auto p-0" onClick={() => onOpen('TARGET_REVIEW', item.proposalId)}>Review proposal</Button></td></tr>)}</tbody></table></div> : <p className="text-sm">No target proposals in this date scope.</p>}</section>
      <section className="space-y-3"><h3 className="text-lg font-semibold">Supplier choices</h3>{state.supplierChoices?.length ? state.supplierChoices.map((supplier: any) => <details key={supplier.id}><summary className="cursor-pointer text-sm">{supplier.name} · {supplier.orders.length} orders</summary><ul className="mt-2 space-y-2 text-sm">{supplier.orders.map((order: any) => <li key={order.id}><Button variant="link" className="h-auto p-0" onClick={() => onOpen('PURCHASE_ORDER', order.id)}>{order.reference}</Button> · {labelStatus(order.status)} · {fmtDate(order.date)}</li>)}</ul></details>) : <p className="text-sm">No saved supplier choices on orders in this date scope.</p>}</section>
      <RunHistory runs={state.runs} onOpen={onOpen}/>
    </> : !documentId && !['settings', 'monitor', 'targets'].includes(view) ? <>
      <header className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-2xl font-semibold">{view === 'SHORTBOOK' ? 'Shortbook' : view === 'PURCHASE_ORDER' ? 'Purchase orders' : 'Target proposals'}</h2><p className="mt-1 text-sm text-muted-foreground">{rows.length} matching records · all result pages included</p></div>{canWrite && <div className="flex flex-wrap gap-2">{view === 'TARGET_REVIEW' ? <Button disabled={busy} onClick={propose}>Generate target proposal</Button> : <Button onClick={() => onCreate(view)}>Add {view === 'SHORTBOOK' ? 'manual request' : 'purchase order'}</Button>}{view === 'SHORTBOOK' && <Button variant="outline" disabled={busy} onClick={() => action(() => apiClient.post(`${api}/shortbook/refresh`, { requestKey: requestKey() }), 'Shortbook refreshed from active targets. Existing requests are preserved.')}><RefreshCw className="h-4 w-4"/>Sync shortages</Button>}</div>}</header>{filters}
      <Button variant="outline" disabled={!rows.length} onClick={() => downloadCsv(`${view.toLowerCase()}.csv`, rows.flatMap(d => d.payload.lines.map((l: any) => ({ reference: d.reference, status: d.status, supplierId: d.supplierId, priority: d.payload.priority, source: d.payload.source, requester: d.payload.requester || d.createdBy, date: d.createdAt, ...l }))))}><FileDown className="h-4 w-4"/>Download all matching lines</Button>
      <ul className="divide-y border-y">{rows.length ? rows.map(d => <li key={d.id}><button className="flex w-full flex-wrap items-start justify-between gap-3 px-1 py-4 text-left hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" onClick={() => onOpen(view, d.id)}><span className="min-w-0 flex-1"><strong className="break-words">{d.reference}</strong><span className="mt-1 block text-sm">{d.payload.lines.map((l: any) => `${l.name}: ${l.quantity} ${l.unit}`).join(' · ')}</span><span className="mt-1 block text-xs text-muted-foreground">{d.payload.source || 'MANUAL'} · {d.payload.priority || 'NORMAL'} · {fmtDate(d.createdAt)} · Requested by {d.payload.requester || d.createdBy}</span>{view === 'SHORTBOOK' && <span className="mt-1 block text-xs">{d.payload.lines.map((l: any) => `Min ${l.minStockLevel ?? 'See item'} / available ${l.currentStock ?? 'See item'}`).join(' · ')} · {d.supplierId ? `Supplier ${d.supplierId}` : 'Supplier selection required'}</span>}</span><span className="text-sm">{labelStatus(d.status)}</span></button></li>) : <li className="py-8 text-sm text-muted-foreground">No matching records. {view === 'SHORTBOOK' ? 'Add a manual request or sync shortages from active targets.' : view === 'TARGET_REVIEW' ? 'Generate a proposal to review demand and saved targets.' : 'Create an order or start from a Shortbook request.'}</li>}</ul>
    </> : null}
  </section>;
}

function RunHistory({ runs, onOpen }: { runs: any[]; onOpen: Props['onOpen'] }) {
  return <section className="space-y-3"><h3 className="text-lg font-semibold">Saved run outcomes</h3>{runs?.length ? <ol className="divide-y border-y">{[...runs].reverse().map(run => <li key={run.id} className="space-y-2 py-3 text-sm"><p><strong>{time(run.at)}</strong> · {run.scheduled ? 'Scheduled' : 'Manual run'} · {run.disabled ? 'Automation off; no documents created' : run.actorId || 'Owner setup required'}</p>{run.outcomes.map((outcome: any, i: number) => <div key={i}><p>{outcome.name} · {outcome.status} {outcome.message}</p>{outcome.documentId && <Button variant="link" className="h-auto p-0" onClick={() => onOpen(outcome.name === 'Target proposal' ? 'TARGET_REVIEW' : 'COUNT', outcome.documentId)}>Open generated document</Button>}{outcome.results?.map((result: any, j: number) => <p key={j}>{result.status} · {result.message} {result.documentId && <Button variant="link" className="h-auto p-0" onClick={() => onOpen(result.kind || 'PURCHASE_ORDER', result.documentId)}>Open record</Button>}</p>)}</div>)}</li>)}</ol> : <p className="text-sm text-muted-foreground">No saved runs yet. Save an owner and enabled configuration to schedule automation.</p>}</section>;
}

type TargetEdit = { minStockLevel: string; maxStockLevel: string; reorderLevel: string; manualTargets: boolean; excluded: boolean };
const targetValue = (value: unknown) => value === null || value === undefined || value === '' ? 'Unconfigured' : String(value);
/**
 * @cc [owner:nareshshah139,label:product] replenishment-manual-target-review-ui
 * Bulk changes MUST include only explicitly selected rows, show stock units and saved/proposed
 * values, and require a reason before sending item and settings revisions to the server.
 */
/**
 * @cc [owner:nareshshah139,label:product;target] inventory-minmax-valid-units
 * Manual replenishment targets MUST identify their quantity unit and enforce nonnegative minimum
 * not exceeding maximum; manual overrides MUST survive automatic recommendations until explicitly
 * accepted.
 * Acceptance: INV-34. Validation and open gaps:
 * docs/qa/inventory-workflow-contract-review.md. This is a target obligation, not a pass claim.
 */
function ManualTargets({ data, filters, canEdit, busy, onSave }: { data: any; filters: React.ReactNode; canEdit: boolean; busy: boolean; onSave: (input: any) => Promise<void> }) {
  const [edits, setEdits] = useState<Record<string, TargetEdit>>({}), [selected, setSelected] = useState<string[]>([]), [review, setReview] = useState(false), [reason, setReason] = useState('');
  useEffect(() => {
    setEdits(Object.fromEntries(data.rows.map((row: any) => [row.id, { minStockLevel: row.minStockLevel == null ? '' : String(row.minStockLevel), maxStockLevel: row.maxStockLevel == null ? '' : String(row.maxStockLevel), reorderLevel: row.reorderLevel == null ? '' : String(row.reorderLevel), manualTargets: row.manualTargets, excluded: row.excluded }])));
    setSelected([]); setReview(false); setReason('');
  }, [data]);
  const change = (id: string, field: keyof TargetEdit, value: string | boolean) => { setEdits(current => ({ ...current, [id]: { ...current[id], [field]: value } })); setReview(false); };
  const selectedRows = data.rows.filter((row: any) => selected.includes(row.id));
  return <section className="space-y-4" aria-label="Manual targets and exclusions">
    <header><h2 className="text-2xl font-semibold">Manual targets & exclusions</h2><p className="mt-1 max-w-3xl text-sm text-muted-foreground">Review reorder levels in each item's stock unit. Manual targets are protected from demand proposals. Excluded items are omitted from automatic target proposals; saved reorder levels still drive shortages. Blank levels mean unconfigured.</p></header>
    {filters}<p className="text-sm">{data.rows.length} matching items · {selected.length} selected · Branch {data.branchId}</p>
    {!canEdit && <p className="text-sm">An inventory manager with target-review access can change these values.</p>}
    {canEdit && <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={busy || data.rows.length > 1000} onClick={() => { setSelected(data.rows.map((row: any) => row.id)); setReview(false); }}>Select all matching items</Button><Button variant="ghost" disabled={busy} onClick={() => { setSelected([]); setReview(false); }}>Clear selection</Button>{data.rows.length > 1000 && <p className="text-sm">Narrow the search or select up to 1,000 items for one review.</p>}</div>}
    <form className="space-y-4" onSubmit={event => { event.preventDefault(); setReview(true); }}>
      <div className="overflow-x-auto rounded-md border"><table className="w-full text-left text-sm"><caption className="sr-only">Saved and proposed reorder targets in stock units</caption><thead className="bg-muted"><tr>{['Select / item', 'Saved min / max / reorder', 'Minimum', 'Maximum', 'Reorder level', 'Automation'].map(label => <th className="p-3" key={label}>{label}</th>)}</tr></thead><tbody className="divide-y">{data.rows.map((row: any) => {
        const edit = edits[row.id]; if (!edit) return null;
        return <tr key={row.id}><th className="min-w-56 p-3 align-top font-normal"><label className="flex items-start gap-2"><input type="checkbox" className="mt-1 h-4 w-4" aria-label={`Select ${row.name}`} checked={selected.includes(row.id)} disabled={!canEdit || busy || !selected.includes(row.id) && selected.length >= 1000} onChange={event => { setSelected(event.target.checked ? [...selected, row.id] : selected.filter(id => id !== row.id)); setReview(false); }}/><span><strong>{row.name}</strong><span className="mt-1 block text-xs text-muted-foreground">{row.unit} · Available {row.available}{row.packSize ? ` · Pack ${row.packSize} ${row.packUnit || row.unit}` : ''}</span>{row.lastChangedAt && <span className="mt-1 block text-xs text-muted-foreground">Changed {time(row.lastChangedAt)} by {row.lastChangedBy}</span>}</span></label>{row.history?.length > 0 && <details className="mt-2 text-xs"><summary className="cursor-pointer underline">Target change history ({row.history.length})</summary><ul className="mt-2 space-y-3">{row.history.map((event: any) => <li key={event.id}><p>{time(event.at)} · {event.actorId}</p><p>{event.after.reason}</p><p>Min / max / reorder: {targetValue(event.before.minStockLevel)} / {targetValue(event.before.maxStockLevel)} / {targetValue(event.before.reorderLevel)} → {targetValue(event.after.minStockLevel)} / {targetValue(event.after.maxStockLevel)} / {targetValue(event.after.reorderLevel)} {row.unit}</p><p>Manual {event.before.manualTargets ? 'On' : 'Off'} → {event.after.manualTargets ? 'On' : 'Off'} · Excluded {event.before.excluded ? 'On' : 'Off'} → {event.after.excluded ? 'On' : 'Off'}</p></li>)}</ul></details>}</th>
          <td className="min-w-40 p-3 align-top">{targetValue(row.minStockLevel)} / {targetValue(row.maxStockLevel)} / {targetValue(row.reorderLevel)}<span className="mt-1 block text-xs">{row.unit}</span></td>
          {(['minStockLevel', 'maxStockLevel', 'reorderLevel'] as const).map((field, index) => <td className="min-w-28 p-3 align-top" key={field}><input type="number" min="0" step="1" className={inputClass} aria-label={`${['Minimum', 'Maximum', 'Reorder level'][index]} for ${row.name} (${row.unit})`} value={edit[field]} disabled={!canEdit || busy} onChange={event => change(row.id, field, event.target.value)}/></td>)}
          <td className="min-w-56 space-y-2 p-3 align-top"><label className="flex items-center gap-2"><input type="checkbox" checked={edit.manualTargets} disabled={!canEdit || busy} onChange={event => change(row.id, 'manualTargets', event.target.checked)}/>Protect manual targets for {row.name}</label><label className="flex items-center gap-2"><input type="checkbox" checked={edit.excluded} disabled={!canEdit || busy} onChange={event => change(row.id, 'excluded', event.target.checked)}/>Exclude {row.name} from target proposals</label></td>
        </tr>;
      })}{!data.rows.length && <tr><td colSpan={6} className="p-6 text-muted-foreground">No active items match this search.</td></tr>}</tbody></table></div>
      {canEdit && <Button type="submit" variant="outline" disabled={busy || !selected.length}>Review selected changes</Button>}
    </form>
    {review && <form aria-label="Review manual target changes" className="space-y-4 rounded-md border p-4" onSubmit={event => { event.preventDefault(); void onSave({ settingsVersion: data.version, reason: reason.trim(), items: selectedRows.map((row: any) => ({ id: row.id, updatedAt: row.updatedAt, ...edits[row.id] })) }); }}>
      <h3 className="text-lg font-semibold">Review {selected.length} selected {selected.length === 1 ? 'item' : 'items'}</h3>
      <ul className="divide-y border-y">{selectedRows.map((row: any) => <li key={row.id} className="space-y-1 py-3 text-sm"><strong>{row.name} · {row.unit}</strong><p>Saved min / max / reorder: {targetValue(row.minStockLevel)} / {targetValue(row.maxStockLevel)} / {targetValue(row.reorderLevel)}</p><p>New min / max / reorder: {targetValue(edits[row.id].minStockLevel)} / {targetValue(edits[row.id].maxStockLevel)} / {targetValue(edits[row.id].reorderLevel)}</p><p>Manual protection: {row.manualTargets ? 'On' : 'Off'} → {edits[row.id].manualTargets ? 'On' : 'Off'} · Exclusion: {row.excluded ? 'On' : 'Off'} → {edits[row.id].excluded ? 'On' : 'Off'}</p></li>)}</ul>
      <label className="block text-sm">Reason for target changes (required)<textarea className={inputClass} required value={reason} disabled={busy} onChange={event => setReason(event.target.value)}/></label>
      <p className="text-sm text-muted-foreground">The complete selection saves together with your reason and a record of the prior values. Stock quantities and purchase prices are unaffected.</p>
      <div className="flex flex-wrap gap-3"><Button type="submit" disabled={busy || !reason.trim()}>Save reviewed targets</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => setReview(false)}>Back to editing</Button></div>
    </form>}
  </section>;
}
