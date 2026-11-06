'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { apiClient } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { requestKey } from '@/components/inventory/workspace-model';
import { ActionDialog, DialogClose } from '@/components/inventory/purchase/ActionDialog';
import { BatchLine } from './count-parts';
import { batchCount, failureMessage } from './count-model';

type Batch = { id: string; name: string; batchNumber: string; expiryDate: string | null; storageLocation: string | null; currentStock: number; unit: string };

/**
 * @cc [owner:nareshshah139,label:product] on-demand-count
 * A count MUST be startable at any time for the batches someone picks, outside the cycle; it is
 * assigned to the person who starts it and follows the same sign-off and approval.
 */
export function StartCountDialog({ anchor, onClose, onStarted }: { anchor: HTMLElement; onClose: () => void; onStarted: (id: string) => void }) {
  const [key] = useState(requestKey);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Batch[] | null>(null);
  const [chosen, setChosen] = useState<Batch[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const id = useId();

  useEffect(() => {
    const text = search.trim();
    if (text.length < 2) {
      setResults(null);
      return;
    }
    let live = true;
    const timer = setTimeout(() => {
      apiClient
        .get<{ rows: Batch[] }>('/inventory/workspace/stock', { search: text, limit: 20, batchView: 'ON_HAND' })
        .then((page) => live && setResults(page.rows))
        .catch((failure) => live && setError(failureMessage(failure)));
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [search]);

  const toggle = (batch: Batch, on: boolean) => setChosen((current) => (on ? [...current, batch] : current.filter((candidate) => candidate.id !== batch.id)));

  const submit = async () => {
    if (!chosen.length) {
      setError('Choose at least one batch to count.');
      searchRef.current?.focus();
      return 'stay' as const;
    }
    setSaving(true);
    setError('');
    try {
      const created = await apiClient.post<{ id: string }>('/inventory/workspace/counts', { itemIds: chosen.map((batch) => batch.id), requestKey: key });
      onStarted(created.id);
      return 'done' as const;
    } catch (failure) {
      setError(failureMessage(failure));
      return 'stay' as const;
    } finally {
      setSaving(false);
    }
  };

  const listed = [...chosen, ...(results ?? []).filter((batch) => !chosen.some((picked) => picked.id === batch.id))];
  return (
    <ActionDialog
      anchor={anchor}
      width={460}
      title="Count an item now"
      description="Outside the cycle, for an item or shelf that looks wrong. You count and sign it off; differences go for approval as usual."
      saving={saving}
      initialFocus={searchRef}
      onClose={onClose}
      onSubmit={submit}
      footer={() => (
        <>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={saving}>
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" disabled={saving}>
            {saving ? 'Starting…' : chosen.length ? `Count ${batchCount(chosen.length)}` : 'Count'}
          </Button>
        </>
      )}
    >
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className="text-sm font-medium">
          Item or batch
        </label>
        <Input id={id} ref={searchRef} type="search" value={search} onChange={(event) => setSearch(event.target.value)} className="h-10 text-base md:text-sm" />
      </div>
      {listed.length > 0 && (
        <ul aria-label="Batches" className="flex max-h-64 flex-col divide-y divide-border overflow-y-auto rounded-md border border-border">
          {listed.map((batch) => (
            <li key={batch.id}>
              <label className="flex items-start gap-2 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 size-4"
                  checked={chosen.some((picked) => picked.id === batch.id)}
                  onChange={(event) => toggle(batch, event.target.checked)}
                />
                <span className="min-w-0">
                  <BatchLine line={{ name: batch.name, batchNumber: batch.batchNumber, expiryDate: batch.expiryDate ?? '' }} />
                  <span className="block">{batch.storageLocation || 'Location not recorded'}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {results !== null && !results.length && <p className="text-sm">No batch in stock matches “{search.trim()}”.</p>}
      {error && (
        <p role="alert" className="text-sm text-destructive-text">
          {error}
        </p>
      )}
    </ActionDialog>
  );
}
