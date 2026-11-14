'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { formatDisplayDay } from '@/lib/date-ranges';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { requestKey } from '@/components/inventory/workspace-model';
import { ActionDialog, DialogClose } from '@/components/inventory/purchase/ActionDialog';
import { BatchLine } from './count-parts';
import { RECONCILIATION, batchCount, failureMessage } from './count-model';
import { NativeSelect } from '@/components/ui/native-select';

type OpenCount = { id: string; day: string | null; person: string | null; signed: boolean };
type Batch = { id: string; name: string; batchNumber: string; expiryDate: string | null; storageLocation: string | null; currentStock: number; unit: string; openCount: OpenCount | null };
type Shelf = { name: string; batches: number };
type Picker = { batches: Batch[]; total: number; locations: Shelf[] };
type Scope = 'item' | 'shelf';

const onCount = (open: OpenCount) =>
  `On ${open.person ? `${open.person}'s` : 'your'} count${open.day ? ` of ${formatDisplayDay(open.day)}` : ''}, ${open.signed ? 'waiting for approval' : 'not signed yet'}`;

/**
 * @cc [owner:nareshshah139,label:product] on-demand-count
 * A count MUST be startable at any time for the batches someone picks, outside the cycle; it is
 * assigned to the person who starts it and follows the same sign-off and approval. A shelf lists
 * every batch in stock there, ticked; a search finds any batch, zero stock included, and says when
 * it shows fewer than it found. A batch already on an undecided count cannot be picked.
 */
export function StartCountDialog({ anchor, onClose, onStarted }: { anchor: HTMLElement; onClose: () => void; onStarted: (id: string) => void }) {
  const [key] = useState(requestKey);
  const [scope, setScope] = useState<Scope>('item');
  const [search, setSearch] = useState('');
  const [shelf, setShelf] = useState('');
  const [found, setFound] = useState<Picker | null>(null);
  const [shelves, setShelves] = useState<Shelf[] | null>(null);
  const [chosen, setChosen] = useState<Batch[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const shelfRef = useRef<HTMLSelectElement>(null);
  const id = useId();

  useEffect(() => {
    if (scope !== 'shelf' || shelves) return;
    let live = true;
    apiClient
      .get<Picker>(`${RECONCILIATION}/batches`)
      .then((page) => live && setShelves(page.locations))
      .catch((failure) => live && setError(failureMessage(failure)));
    return () => {
      live = false;
    };
  }, [scope, shelves]);

  useEffect(() => {
    const text = search.trim();
    const params = scope === 'shelf' ? (shelf ? { location: shelf } : null) : text.length >= 2 ? { q: text } : null;
    if (!params) {
      setFound(null);
      return;
    }
    let live = true;
    const timer = setTimeout(
      () => {
        apiClient
          .get<Picker>(`${RECONCILIATION}/batches`, params)
          .then((page) => {
            if (!live) return;
            setFound(page);
            if (scope === 'shelf') setChosen(page.batches.filter((batch) => !batch.openCount));
          })
          .catch((failure) => live && setError(failureMessage(failure)));
      },
      scope === 'shelf' ? 0 : 250,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [scope, search, shelf]);

  const pickShelf = (name: string) => {
    setScope('shelf');
    setShelf(name);
    setChosen([]);
    setError('');
  };
  const switchScope = (next: Scope) => {
    if (next === scope) return;
    setScope(next);
    setFound(null);
    setChosen([]);
    setError('');
    requestAnimationFrame(() => (next === 'shelf' ? shelfRef.current : searchRef.current)?.focus());
  };
  const toggle = (batch: Batch, on: boolean) => setChosen((current) => (on ? [...current, batch] : current.filter((candidate) => candidate.id !== batch.id)));

  const submit = async () => {
    if (!chosen.length) {
      setError(scope === 'shelf' && !shelf ? 'Choose a shelf.' : 'Choose at least one batch to count.');
      (scope === 'shelf' ? shelfRef : searchRef).current?.focus();
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

  const rows = found?.batches ?? [];
  const listed = scope === 'shelf' ? rows : [...chosen.filter((picked) => !rows.some((batch) => batch.id === picked.id)), ...rows];
  const pickable = rows.filter((batch) => !batch.openCount);
  const allPicked = pickable.length > 0 && pickable.every((batch) => chosen.some((picked) => picked.id === batch.id));
  const places = scope === 'item' && search.trim().length >= 2 ? (found?.locations ?? []).slice(0, 3) : [];

  return (
    <ActionDialog
      anchor={anchor}
      width={520}
      title="Count an item or a shelf"
      description="Outside the cycle, for an item or a shelf that looks wrong. You count and sign it off; differences go for approval as usual."
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
      <div role="radiogroup" aria-label="What to count" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
        {(
          [
            ['item', 'Item or batch'],
            ['shelf', 'Shelf / location'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={scope === value}
            onClick={() => switchScope(value)}
            className={cn(
              'min-h-10 rounded-md px-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
              scope === value ? 'bg-background shadow-sm' : 'text-muted-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {scope === 'item' ? (
        <div className="flex flex-col gap-1">
          <label htmlFor={id} className="text-sm font-medium">
            Find a batch
          </label>
          <Input
            id={id}
            ref={searchRef}
            type="search"
            value={search}
            placeholder="Item name, batch, or rack"
            onChange={(event) => setSearch(event.target.value)}
            className="h-10 text-base md:text-sm"
          />
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-shelf`} className="text-sm font-medium">
            Shelf
          </label>
          <NativeSelect
            id={`${id}-shelf`}
            ref={shelfRef}
            value={shelf}
            onChange={(event) => pickShelf(event.target.value)}
          >
            <option value="">{shelves ? 'Choose a shelf' : 'Loading shelves…'}</option>
            {(shelves ?? []).map((place) => (
              <option key={place.name} value={place.name}>
                {place.name} · {batchCount(place.batches)}
              </option>
            ))}
            {shelf && shelves && !shelves.some((place) => place.name === shelf) && <option value={shelf}>{shelf}</option>}
          </NativeSelect>
        </div>
      )}
      {places.length > 0 && (
        <ul aria-label="Shelves" className="flex flex-wrap gap-2">
          {places.map((place) => (
            <li key={place.name}>
              <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => pickShelf(place.name)}>
                <MapPin aria-hidden="true" /> Count shelf {place.name} · {batchCount(place.batches)}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {scope === 'shelf' && pickable.length > 1 && (
        <label className="flex items-center gap-2 px-3 text-sm font-medium">
          <input
            type="checkbox"
            className="size-4"
            checked={allPicked}
            onChange={(event) => setChosen(event.target.checked ? pickable : [])}
          />
          Select all {pickable.length} on {shelf}
        </label>
      )}
      {listed.length > 0 && (
        <ul aria-label="Batches" className="flex max-h-64 flex-col divide-y divide-border overflow-y-auto rounded-md border border-border">
          {listed.map((batch) => (
            <li key={batch.id}>
              <label className={cn('flex items-start gap-2 px-3 py-2 text-sm', batch.openCount && 'text-muted-foreground')}>
                <input
                  type="checkbox"
                  className="mt-1 size-4 shrink-0"
                  disabled={!!batch.openCount}
                  checked={chosen.some((picked) => picked.id === batch.id)}
                  onChange={(event) => toggle(batch, event.target.checked)}
                />
                <span className="min-w-0 flex-1">
                  <BatchLine line={{ name: batch.name, batchNumber: batch.batchNumber, expiryDate: batch.expiryDate ?? '' }} />
                  <span className="block">
                    {batch.storageLocation || 'Location not recorded'} · <span className={cn('tabular-nums', batch.currentStock === 0 && 'font-medium')}>{batch.currentStock} in stock</span>
                  </span>
                  {batch.openCount && <span className="block font-medium text-warning-text">{onCount(batch.openCount)}</span>}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {found && found.total > rows.length && (
        <p className="text-sm">
          Showing {rows.length} of {found.total}. Type more of the name or batch to narrow it down.
        </p>
      )}
      {found && !rows.length && (
        <p className="text-sm">{scope === 'shelf' ? `No batch in stock on ${shelf}.` : `No batch matches “${search.trim()}”.`}</p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive-text">
          {error}
        </p>
      )}
    </ActionDialog>
  );
}
