'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Check, Plus } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDashboardUser } from '@/components/layout/dashboard-user-context';
import { SignOffDialog } from './SignOffDialog';
import { BatchLine, Difference, Split } from './count-parts';
import { countPath, countSummary, differ, failureOf, failureMessage, itemCount, parseCount, type CountDetail, type CountLine } from './count-model';

type Entry = { count: string; note: string };
type SaveState = 'saved' | 'saving' | 'failed';

const SAVE_DELAY_MS = 600;

const entryOf = (line: CountLine): Entry => ({ count: line.physicalStock === null || line.retype ? '' : String(line.physicalStock), note: line.note });

export function sheetLine(line: CountLine, entry: Entry): CountLine {
  const parsed = parseCount(entry.count);
  const counted = typeof parsed === 'number' ? parsed : null;
  const system = !line.retype && line.physicalStock !== null && counted === line.physicalStock ? line.systemStock : (line.currentStock ?? line.systemStock);
  return { ...line, systemStock: system, physicalStock: counted, note: entry.note, retype: line.retype && counted === null };
}

/**
 * @cc [owner:nareshshah139,label:product] count-sheet-keyboard
 * Counted fields MUST start empty for uncounted batches and never be pre-filled. Enter and the
 * arrow keys move between counted fields; Enter on the last one moves to Sign off. The difference
 * shows as soon as a quantity is typed, and every change saves without a button.
 */
export function CountSheet({ detail, onSigned, onStale }: { detail: CountDetail; onSigned: (detail: CountDetail) => void; onStale: (message: string) => void }) {
  const { user } = useDashboardUser();
  const [entries, setEntries] = useState<Record<string, Entry>>(() => Object.fromEntries(detail.lines.map((line) => [line.id, entryOf(line)])));
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [signing, setSigning] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [missing, setMissing] = useState<string[]>([]);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const signButton = useRef<HTMLButtonElement>(null);
  const version = useRef(detail.version);
  const dirty = useRef(new Set<string>());
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const inflight = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [server, setServer] = useState(detail);
  const [noting, setNoting] = useState<string[]>([]);

  const flush = useCallback(async (): Promise<boolean> => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    while (inflight.current) await inflight.current;
    const ids = [...dirty.current].filter((id) => parseCount(entriesRef.current[id].count) !== 'invalid');
    if (!ids.length) return true;
    ids.forEach((id) => dirty.current.delete(id));
    setSaveState('saving');
    let ok = true;
    const request = (async () => {
      try {
        const lines = ids.map((id) => {
          const parsed = parseCount(entriesRef.current[id].count);
          return { id, physicalStock: parsed === null ? null : parsed, note: entriesRef.current[id].note };
        });
        const saved = await apiClient.patch<CountDetail>(countPath(detail.id), { version: version.current, lines });
        version.current = saved.version;
        setServer(saved);
        setSaveState(dirty.current.size ? 'saving' : 'saved');
      } catch (error) {
        ok = false;
        ids.forEach((id) => dirty.current.add(id));
        if (failureOf(error).status === 409) onStale(failureMessage(error));
        else setSaveState('failed');
      }
    })();
    inflight.current = request;
    await request;
    inflight.current = null;
    return ok;
  }, [detail.id, onStale]);

  useEffect(() => {
    const first = detail.lines.findIndex((line) => line.physicalStock === null);
    inputs.current[first < 0 ? 0 : first]?.focus();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [detail.lines]);

  const change = (line: CountLine, patch: Partial<Entry>) => {
    setEntries((current) => ({ ...current, [line.id]: { ...current[line.id], ...patch } }));
    dirty.current.add(line.id);
    if (missing.includes(line.id)) setMissing((ids) => ids.filter((id) => id !== line.id));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
  };

  const move = (index: number, step: number) => {
    const next = inputs.current[index + step];
    if (next) {
      next.focus();
      next.select();
    } else if (step > 0) signButton.current?.focus();
  };
  const onCountKey = (index: number) => (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === 'ArrowDown') {
      event.preventDefault();
      move(index, 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      move(index, -1);
    }
  };

  const lines = server.lines.map((line) => sheetLine(line, entries[line.id] ?? entryOf(line)));
  const figures = countSummary(lines);
  const invalid = server.lines.filter((line) => parseCount(entries[line.id]?.count ?? '') === 'invalid').map((line) => line.id);

  const startSignOff = async () => {
    setPrompt('');
    const unfinished = lines.filter((line) => line.physicalStock === null).map((line) => line.id);
    const first = [...invalid, ...unfinished][0];
    if (first) {
      setMissing(unfinished);
      setPrompt(invalid.length ? 'Fix the highlighted quantity before signing off.' : `Count every item before signing off. ${itemCount(unfinished.length)} still to count.`);
      inputs.current[server.lines.findIndex((line) => line.id === first)]?.focus();
      return;
    }
    if (!(await flush())) {
      setPrompt('Your latest counts are not saved yet. Check your connection and try again.');
      return;
    }
    setSigning(true);
  };

  return (
    <section aria-labelledby="count-sheet-title" className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="count-sheet-title" tabIndex={-1} className="text-xl font-semibold">
          {detail.reference}
        </h2>
        <p className="text-sm">Count what is on the shelf. Enter 0 when a batch is not there.</p>
      </div>
      <div role="list" aria-label="Batches to count" className="flex flex-col rounded-lg border border-border">
        <div
          aria-hidden="true"
          className="hidden gap-x-3 rounded-t-lg bg-muted px-3 py-2 text-sm font-semibold sm:grid sm:grid-cols-[minmax(12rem,2.4fr)_minmax(5rem,1fr)_4.5rem_6.5rem_minmax(7.5rem,1.2fr)_minmax(9rem,1.8fr)]"
        >
          <span>Item</span>
          <span>Location</span>
          <span className="text-right">System</span>
          <span>Counted</span>
          <span>Difference</span>
          <span>Note</span>
        </div>
        {lines.map((line, index) => {
          const raw = entries[line.id] ?? entryOf(line);
          const bad = invalid.includes(line.id);
          const flagged = missing.includes(line.id);
          const errorId = `count-error-${line.id}`;
          const diffId = `count-diff-${line.id}`;
          const hint = bad ? 'Whole number, 0 or more' : line.retype ? `Type it again (was ${server.lines[index].physicalStock})` : flagged ? 'Not counted yet' : null;
          return (
            <div
              key={line.id}
              role="listitem"
              className={cn(
                'grid grid-cols-3 items-start gap-x-3 sm:items-center gap-y-1.5 border-t border-border px-3 py-2.5 first:border-t-0 sm:grid-cols-[minmax(12rem,2.4fr)_minmax(5rem,1fr)_4.5rem_6.5rem_minmax(7.5rem,1.2fr)_minmax(9rem,1.8fr)] sm:py-2 sm:first-of-type:border-t-0',
                (bad || flagged) && 'bg-destructive-soft/40',
              )}
            >
              <div className="col-span-3 min-w-0 sm:col-span-1">
                <BatchLine line={line} />
              </div>
              <div className="col-span-3 text-sm sm:col-span-1">
                <span className="sm:sr-only">Location </span>
                {line.location || <span className="text-muted-foreground">Not recorded</span>}
              </div>
              <div className="text-sm sm:text-right">
                <span className="block text-xs sm:sr-only">System</span>
                <span className="whitespace-nowrap tabular-nums">{line.systemStock ?? '—'}</span>
              </div>
              <div>
                <label htmlFor={`count-${line.id}`} className="block text-xs sm:sr-only">
                  Counted
                  <span className="sr-only">
                    {' '}
                    quantity of {line.name}, batch {line.batchNumber || 'not recorded'}
                  </span>
                </label>
                <Input
                  id={`count-${line.id}`}
                  ref={(node) => {
                    inputs.current[index] = node;
                  }}
                  inputMode="numeric"
                  autoComplete="off"
                  enterKeyHint={index === lines.length - 1 ? 'done' : 'next'}
                  value={raw.count}
                  aria-invalid={bad || flagged || undefined}
                  aria-describedby={hint ? `${errorId} ${diffId}` : diffId}
                  onChange={(event) => change(line, { count: event.target.value })}
                  onKeyDown={onCountKey(index)}
                  onBlur={() => void flush()}
                  className="h-10 w-full max-w-28 px-2 text-right text-base tabular-nums md:text-base"
                />
                {hint && (
                  <span id={errorId} className={cn('mt-0.5 block text-xs', bad || flagged ? 'text-destructive-text' : 'text-warning-text')}>
                    {hint}
                  </span>
                )}
              </div>
              <div className="text-sm">
                <span className="block text-xs sm:sr-only">Difference</span>
                <span id={diffId}>
                  <Difference line={line} />
                </span>
              </div>
              <div className="col-span-3 sm:col-span-1">
                {raw.note || noting.includes(line.id) || (line.physicalStock !== null && line.physicalStock !== line.systemStock) ? (
                  <>
                    <label htmlFor={`note-${line.id}`} className="sr-only">
                      Note for {line.name}
                    </label>
                    <Input
                      id={`note-${line.id}`}
                      value={raw.note}
                      maxLength={300}
                      placeholder="Why it differs (optional)"
                      autoFocus={noting.includes(line.id) && !raw.note}
                      onChange={(event) => change(line, { note: event.target.value })}
                      onBlur={() => void flush()}
                      className="h-9 px-2 text-sm md:text-sm"
                    />
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setNoting((ids) => [...ids, line.id])}
                    className="inline-flex h-9 items-center gap-1 rounded-md px-1 text-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    <Plus aria-hidden="true" className="size-4" /> Note<span className="sr-only"> for {line.name}</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="sticky -bottom-4 z-20 -mx-4 -mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border bg-background px-4 py-3 shadow-[0_-4px_12px_-8px_rgb(0_0_0/0.25)] md:-bottom-6 md:-mx-6 md:-mb-6 md:px-6">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="flex flex-wrap items-baseline gap-x-2 text-base">
            <span className="whitespace-nowrap font-semibold tabular-nums">
              {figures.counted} of {figures.items} counted
              {figures.differences > 0 && <span className="font-normal"> · {differ(figures.differences)}</span>}
            </span>
            <span role="status" aria-live="polite" className="text-sm">
              {saveState === 'saving' ? (
                'Saving…'
              ) : saveState === 'failed' ? (
                <span className="text-destructive-text">Not saved. Check your connection; your counts stay on this screen.</span>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <Check aria-hidden="true" className="size-4" /> Saved
                </span>
              )}
            </span>
          </p>
          {figures.differences > 0 && <Split figures={figures} className="text-sm font-medium" />}
        </div>
        <Button ref={signButton} aria-label="Sign off count" className="h-11 shrink-0 px-5 text-base" onClick={() => void startSignOff()}>
          <span className="max-sm:hidden">Sign off count</span>
          <span className="sm:hidden">Sign off</span>
        </Button>
        {prompt && (
          <p role="alert" className="w-full text-sm font-medium text-destructive-text">
            {prompt}
          </p>
        )}
      </div>
      {signing && signButton.current && (
        <SignOffDialog
          anchor={signButton.current}
          detail={server}
          version={version.current}
          lines={lines}
          signer={user ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() : ''}
          onClose={() => setSigning(false)}
          onIncomplete={(ids, message, retype) => {
            setSigning(false);
            if (retype) {
              setServer((current) => ({ ...current, lines: current.lines.map((line) => (ids.includes(line.id) ? { ...line, retype: true } : line)) }));
              setEntries((current) => Object.fromEntries(Object.entries(current).map(([id, entry]) => [id, ids.includes(id) ? { ...entry, count: '' } : entry])));
            }
            setMissing(ids);
            setPrompt(message);
            inputs.current[server.lines.findIndex((line) => ids.includes(line.id))]?.focus();
          }}
          onStale={(message) => {
            setSigning(false);
            onStale(message);
          }}
          onSigned={(signed) => {
            setSigning(false);
            toast({
              title: signed.state === 'POSTED_NO_DIFF' ? 'Count signed off. Stock confirmed.' : 'Count signed off and sent for approval.',
              description:
                signed.state === 'POSTED_NO_DIFF' ? `All ${itemCount(signed.items)} match the system.` : 'Stock changes only when a doctor or administrator approves it.',
            });
            onSigned(signed);
          }}
        />
      )}
    </section>
  );
}
