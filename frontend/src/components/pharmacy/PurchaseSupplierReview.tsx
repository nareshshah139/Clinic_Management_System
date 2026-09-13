'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Supplier = { id: string; name: string; gstNumber: string | null };
const identity = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '');
const gstin = (value: string | null) => (value || '').trim().toUpperCase();

export function PurchaseSupplierReview({ name, gstNumber, canLoad, canSave, readOnly, disabled, nextAction = 'Save & Process', onChange, onSaved, onBusy, onEdit }: {
  name: string;
  gstNumber: string;
  canLoad: boolean;
  canSave: boolean;
  readOnly: boolean;
  disabled: boolean;
  nextAction?: string;
  onChange: (name: string, gstNumber: string) => void;
  onSaved: () => void;
  onBusy: (busy: boolean) => void;
  onEdit?: () => void;
}) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [verified, setVerified] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const saveLock = useRef(false);
  const mounted = useRef(false);
  const load = useCallback(async () => {
    if (!canLoad) return;
    setLoading(true);
    setLoadError(false);
    try {
      const rows = await apiClient.get<Supplier[]>('/pharmacy/purchase-invoices/suppliers');
      if (!Array.isArray(rows)) throw new Error('Invalid supplier list');
      if (mounted.current) setSuppliers(rows);
    } catch {
      if (mounted.current) setLoadError(true);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [canLoad]);
  useEffect(() => { mounted.current = true; void load(); return () => { mounted.current = false; }; }, [load]);
  useEffect(() => { setVerified(false); setMessage(''); setError(''); }, [name, gstNumber]);

  const matches = suppliers.filter(supplier => identity(supplier.name) === identity(name) && gstin(supplier.gstNumber) === gstin(gstNumber));
  const related = suppliers.some(supplier => identity(supplier.name) === identity(name) || gstin(gstNumber) && gstin(supplier.gstNumber) === gstin(gstNumber));
  const valid = name.trim().length >= 2 && !!identity(name) && /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin(gstNumber));
  const locked = readOnly || disabled || saving;
  const save = async () => {
    if (saveLock.current || locked || !canSave || !verified || !valid || loading || loadError || related) return;
    saveLock.current = true;
    setSaving(true); onBusy(true); setMessage(''); setError('');
    try {
      const saved = await apiClient.post<Supplier>('/pharmacy/purchase-invoices/suppliers', { name: name.trim(), gstNumber: gstin(gstNumber), verified: true });
      if (!saved?.id || identity(saved.name) !== identity(name) || gstin(saved.gstNumber) !== gstin(gstNumber)) throw new Error('The save response could not be confirmed. Retry saving to retrieve the existing supplier.');
      if (!mounted.current) return;
      setSuppliers(current => [...current.filter(supplier => supplier.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name)));
      setMessage(`Supplier saved. Stock has not changed. Choose ${nextAction} to continue invoice review; other checks may remain.`);
      onSaved();
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : 'Supplier save could not be confirmed. Retry saving; an existing matching supplier will be reused.');
    } finally {
      saveLock.current = false;
      if (mounted.current) { setSaving(false); onBusy(false); }
    }
  };

  return <section aria-labelledby="purchase-supplier-title" className="space-y-3 border-b pb-4">
    <h5 id="purchase-supplier-title" className="font-semibold">Supplier</h5>
    <p className="text-sm text-muted-foreground">Check the supplier name and GSTIN against the original invoice. Select a saved supplier or save these verified details here.</p>
    <div className="grid gap-3 md:grid-cols-2">
      <div><Label htmlFor="distributor-name">Distributor</Label><Input id="distributor-name" value={name} disabled={locked} onChange={event => onChange(event.target.value, gstNumber)} /></div>
      <div><Label htmlFor="distributor-gstin">GSTIN</Label><Input id="distributor-gstin" value={gstNumber} disabled={locked} onChange={event => onChange(name, event.target.value.toUpperCase())} placeholder="36ABCDE1234F1Z5" /></div>
    </div>
    {canLoad && <>
      <div>
        <Label htmlFor="saved-purchase-supplier">Saved supplier</Label>
        <select id="saved-purchase-supplier" className="mt-2 block w-full min-w-0 rounded-md border bg-background p-2 text-sm" value={matches.length === 1 ? matches[0].id : ''} disabled={locked || loading || loadError}
          onChange={event => { const supplier = suppliers.find(row => row.id === event.target.value); if (supplier) { onChange(supplier.name, supplier.gstNumber || ''); setVerified(false); } }}>
          <option value="">{loading ? 'Loading saved suppliers…' : loadError ? 'Supplier list unavailable' : suppliers.length ? 'Select after checking the original invoice' : 'No saved suppliers yet'}</option>
          {suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name} — {supplier.gstNumber || 'GSTIN missing'}</option>)}
        </select>
      </div>
      {loadError ? <div role="alert" className="space-y-2 text-sm"><p>Could not load saved suppliers. Retry to check for an existing record. Your invoice details are kept.</p><Button type="button" variant="outline" size="sm" disabled={disabled || loading} onClick={load}>Retry supplier list</Button></div>
        : !loading && <p role="status" className="text-sm">{matches.length === 1 ? 'Matching saved supplier found. Continue with invoice review.' : matches.length > 1 ? 'More than one saved record matches. Ask a supplier administrator to remove the duplicate; manual invoice review remains available.' : related ? 'A saved supplier has this name or GSTIN with different details. Check the original and select the correct record above. Ask a supplier administrator to correct an outdated record.' : suppliers.length ? 'No saved supplier matches these details.' : canSave && !readOnly ? 'Your supplier directory is empty. You can add this supplier below.' : 'Your supplier directory is empty.'}</p>}
    </>}
    {!readOnly && matches.length === 0 && !related && canSave && <div className="space-y-3">
      {!valid && <p className="text-sm text-muted-foreground">Enter the supplier name and its 15-character GSTIN before saving a supplier.</p>}
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 shrink-0" checked={verified} disabled={locked || !valid || loading || loadError} onChange={event => setVerified(event.target.checked)} /><span>I checked the supplier name and GSTIN against the original invoice.</span></label>
      <Button type="button" variant="outline" disabled={locked || !valid || !verified || loading || loadError} onClick={save}>{saving ? 'Saving supplier…' : 'Save verified supplier'}</Button>
    </div>}
    {!readOnly && !canSave && <p className="text-sm text-muted-foreground">Your permissions allow invoice entry but not saving suppliers. A staff member with supplier creation permission can save it here.</p>}
    {readOnly && onEdit && <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={onEdit}>Edit supplier details</Button>}
    {matches.length !== 1 && <p className="text-sm text-muted-foreground">You can also continue without saving a supplier: verify these details, resolve the other checks, then use Mark Reviewed → Commit Stock.</p>}
    {message && <p role="status" className="text-sm font-medium">{message}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>;
}
