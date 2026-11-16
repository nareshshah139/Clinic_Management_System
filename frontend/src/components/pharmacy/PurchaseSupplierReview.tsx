'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '@/lib/api';
import { SourceFieldLink } from './PurchaseSourcePreview';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PurchaseHelp, PurchaseStatusCue } from './PurchaseHelp';

type Supplier = { id: string; name: string; gstNumber: string | null };
const identity = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '');
const gstin = (value: string | null) => (value || '').trim().toUpperCase();

/**
 * @cc [owner:nareshshah139,label:product;target] purchase-supplier-inline-resolution
 * An unmatched or ambiguous supplier MUST be selectable or verifiable in the invoice screen using
 * its name and GSTIN; resolving it MUST preserve the invoice edits and original document.
 * Acceptance: INV-09. Validation and open gaps:
 * docs/qa/inventory-workflow-contract-review.md. This is a target obligation, not a pass claim.
 */
/**
 * @cc [owner:nareshshah139,label:product] purchase-supplier-mismatch-visible
 * Without an exact supplier match, a same-name supplier with a different GSTIN MUST show both
 * values and direct verification against the original. Selecting a saved value MUST NOT imply verification.
 */
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
  const differentGstins = matches.length ? [] : suppliers.filter(supplier => identity(supplier.name) === identity(name) && gstin(supplier.gstNumber) !== gstin(gstNumber));
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
      setMessage(`Supplier saved. Stock has not changed. Continue with ${nextAction}.`);
      onSaved();
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : 'Supplier save could not be confirmed. Retry saving; an existing matching supplier will be reused.');
    } finally {
      saveLock.current = false;
      if (mounted.current) { setSaving(false); onBusy(false); }
    }
  };

  return <section aria-labelledby="purchase-supplier-title" className="space-y-3 border-b pb-4">
    <div className="flex items-center gap-1"><h5 id="purchase-supplier-title" className="font-semibold">Supplier</h5><PurchaseHelp label="Supplier matching">Match the name and GSTIN against the original. Select a saved supplier or verify and save a new one here.</PurchaseHelp></div>
    <div className="grid gap-3 md:grid-cols-2">
      <div><div className="flex items-center"><Label htmlFor="distributor-name">Distributor</Label><SourceFieldLink id="distributor-name" label="Distributor"/></div><Input id="distributor-name" value={name} disabled={locked} onChange={event => onChange(event.target.value, gstNumber)} /></div>
      <div><div className="flex items-center"><Label htmlFor="distributor-gstin">GSTIN</Label><SourceFieldLink id="distributor-gstin" label="GSTIN"/></div><Input id="distributor-gstin" value={gstNumber} disabled={locked} onChange={event => onChange(name, event.target.value.toUpperCase())} placeholder="36ABCDE1234F1Z5" /></div>
    </div>
    {canLoad && <>
      <div>
        <Label htmlFor="saved-purchase-supplier">Saved supplier</Label>
        <select id="saved-purchase-supplier" className="mt-2 block w-full min-w-0 rounded-md border bg-background p-2 text-sm" value={matches.length === 1 ? matches[0].id : ''} disabled={locked || loading || loadError}
          onChange={event => { const supplier = suppliers.find(row => row.id === event.target.value); if (supplier) { onChange(supplier.name, supplier.gstNumber || ''); setVerified(false); } }}>
          <option value="">{loading ? 'Loading saved suppliers…' : loadError ? 'Supplier list unavailable' : suppliers.length ? 'Select a saved supplier' : 'No saved suppliers yet'}</option>
          {suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name} — {supplier.gstNumber || 'GSTIN missing'}</option>)}
        </select>
      </div>
      {loadError ? <div role="alert" className="space-y-2 text-sm"><p>Could not load saved suppliers. Retry to check for an existing record. Your invoice details are kept.</p><Button type="button" variant="outline" size="sm" disabled={disabled || loading} onClick={load}>Retry supplier list</Button></div>
        : !loading && differentGstins.length === 0 && <p role="status"><PurchaseStatusCue tone={matches.length === 1 ? 'success' : 'warning'}>{matches.length === 1 ? 'Matching saved supplier found' : matches.length > 1 ? 'Duplicate supplier records. Ask an administrator to resolve them.' : related ? 'A saved supplier has this name or GSTIN with different details. Check and select the correct record.' : suppliers.length ? 'No saved supplier match' : 'Supplier directory is empty'}</PurchaseStatusCue></p>}
    </>}
    {canLoad && !loading && !loadError && differentGstins.length > 0 && <div className="space-y-2 text-sm">
      <p className="font-medium">Supplier GSTIN needs correction</p>
      <dl className="space-y-1">
        <div className="flex flex-wrap gap-x-2"><dt>On this invoice:</dt><dd className="break-all font-medium">{gstNumber || 'Not entered'}</dd></div>
        {differentGstins.map(supplier => <div key={supplier.id} className="flex flex-wrap gap-x-2"><dt>Saved supplier:</dt><dd className="break-all font-medium">{supplier.gstNumber || 'Not entered'}</dd></div>)}
      </dl>
      <p className="max-w-prose text-muted-foreground">Compare both with the original. If the saved GSTIN is wrong, ask a supplier administrator to correct it. Selecting a supplier replaces the invoice name and GSTIN.</p>
    </div>}
    {!readOnly && matches.length === 0 && !related && canSave && <div className="space-y-3">
      {!valid && <p className="text-sm text-destructive">Supplier name and valid GSTIN required to save.</p>}
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 shrink-0" checked={verified} disabled={locked || !valid || loading || loadError} onChange={event => setVerified(event.target.checked)} /><span>I checked the supplier name and GSTIN against the original invoice.</span></label>
      <Button type="button" variant="outline" disabled={locked || !valid || !verified || loading || loadError} onClick={save}>{saving ? 'Saving supplier…' : 'Save verified supplier'}</Button>
    </div>}
    {!readOnly && !canSave && <p className="text-sm text-muted-foreground">Supplier creation needs an authorised staff member.</p>}
    {readOnly && onEdit && <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={onEdit}>Edit supplier details</Button>}
    {matches.length !== 1 && differentGstins.length === 0 && !loadError && !loading && <div className="flex items-center gap-1 text-sm text-muted-foreground"><span>Or continue without saving a supplier.</span><PurchaseHelp label="Continue without a saved supplier">Verify the supplier details, resolve the other checks, then confirm your review and choose Save &amp; Process. A missing supplier match blocks automatic intake, but manual review remains available.</PurchaseHelp></div>}
    {message && <p role="status" className="text-sm font-medium">{message}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>;
}
