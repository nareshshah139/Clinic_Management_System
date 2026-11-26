'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { apiClient } from '@/lib/api';
import { getErrorMessage } from '@/lib/utils';
import type { ClinicDetails } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useDashboardUser } from './dashboard-user-context';

const FIELDS = [
  { key: 'name', label: 'Clinic name', hint: 'Printed at the top of receipts, invoices and reports.' },
  { key: 'address', label: 'Address' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'pincode', label: 'Pincode' },
  { key: 'phone', label: 'Phone' },
  { key: 'gstNumber', label: 'GSTIN' },
] as const;

type FieldKey = (typeof FIELDS)[number]['key'];
type Draft = Record<FieldKey, string>;

const toDraft = (clinic: Partial<ClinicDetails>): Draft =>
  Object.fromEntries(FIELDS.map(({ key }) => [key, (clinic[key] ?? '').trim()])) as Draft;

export function ClinicDetailsForm({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
  const { user } = useDashboardUser();
  const { toast } = useToast();
  const branchId = user?.branchId;
  const [saved, setSaved] = useState<Draft | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const changed = saved && draft ? FIELDS.filter(({ key }) => draft[key].trim() !== saved[key]) : [];
  const dirty = changed.length > 0;

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  useEffect(() => {
    if (!branchId) return;
    let cancelled = false;
    apiClient
      .getClinicDetails(branchId)
      .then((clinic) => {
        if (cancelled) return;
        const loaded = toDraft(clinic);
        setSaved(loaded);
        setDraft(loaded);
      })
      .catch((e) => { if (!cancelled) setLoadError(getErrorMessage(e) || 'Could not load the clinic details.'); });
    return () => { cancelled = true; };
  }, [branchId]);

  if (loadError) return <p role="alert" className="text-sm text-destructive">{loadError}</p>;
  if (!saved || !draft || !branchId) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner className="h-4 w-4" />
        Loading clinic details…
      </div>
    );
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (draft.name.trim().length < 2) {
      setError('Enter the clinic name, at least 2 characters.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const updated = await apiClient.updateClinicDetails(
        branchId,
        Object.fromEntries(changed.map(({ key }) => [key, draft[key].trim()])),
      );
      const next = toDraft(updated);
      setSaved(next);
      setDraft(next);
      toast({ variant: 'success', title: 'Clinic details saved', description: 'New receipts, invoices and reports show them straight away.' });
    } catch (e) {
      setError(getErrorMessage(e) || 'Could not save the clinic details. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-4">
      <p className="text-sm text-muted-foreground">These details are printed on every receipt, invoice and report your clinic produces.</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FIELDS.map((field) => (
          <div key={field.key} className={field.key === 'name' || field.key === 'address' ? 'sm:col-span-2' : undefined}>
            <label htmlFor={`clinic-${field.key}`} className="text-sm">{field.label}</label>
            <Input
              id={`clinic-${field.key}`}
              value={draft[field.key]}
              onChange={(event) => {
                setError('');
                setDraft((current) => (current ? { ...current, [field.key]: event.target.value } : current));
              }}
              maxLength={field.key === 'name' ? 100 : undefined}
            />
            {'hint' in field && <p className="mt-1 text-xs text-muted-foreground">{field.hint}</p>}
          </div>
        ))}
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving || !dirty}>
          {saving ? (<><Spinner className="h-4 w-4" />Saving…</>) : 'Save clinic details'}
        </Button>
        {!dirty && !saving && <p role="status" className="text-sm text-muted-foreground">No unsaved changes.</p>}
      </div>
    </form>
  );
}
