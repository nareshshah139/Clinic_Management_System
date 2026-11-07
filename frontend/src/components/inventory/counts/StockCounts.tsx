'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ClipboardList, Plus } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { formatDisplayDay } from '@/lib/date-ranges';
import { toast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingSkeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RegisterDenied } from '@/components/register/RegisterGrid';
import { CountSheet } from './CountSheet';
import { CountRecord } from './CountRecord';
import { CountRegister } from './CountRegister';
import { ReconciliationSettingsPanel } from './ReconciliationSettingsPanel';
import { StartCountDialog } from './StartCountDialog';
import { RECONCILIATION, batchCount, countPath, failureMessage, failureOf, itemCount, type CountDetail, type ReconciliationSummary } from './count-model';

type Load<T> = { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; error: string } | { status: 'denied' };
const TABS = ['mine', 'approvals', 'history', 'settings'] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = {
  mine: 'My counts',
  approvals: 'Approvals',
  history: 'History',
  settings: 'Settings',
};

function useLoad<T>(path: string | null) {
  const [load, setLoad] = useState<Load<T>>({ status: 'loading' });
  const sequence = useRef(0);
  const reload = useCallback(async () => {
    if (!path) return null;
    const request = ++sequence.current;
    try {
      const data = await apiClient.get<T>(path);
      if (request === sequence.current) setLoad({ status: 'ready', data });
      return data;
    } catch (error) {
      if (request === sequence.current) setLoad(failureOf(error).status === 403 ? { status: 'denied' } : { status: 'error', error: failureMessage(error) });
      return null;
    }
  }, [path]);
  useEffect(() => {
    setLoad({ status: 'loading' });
    void reload();
    return () => {
      sequence.current++;
    };
  }, [reload]);
  return { load, reload, set: (data: T) => setLoad({ status: 'ready', data }) };
}

function Failed({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive-border bg-destructive-soft px-4 py-3 text-base text-destructive-text"
    >
      <span>Could not load stock counts. {error}</span>
      <Button variant="outline" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

function CountDocument({
  id,
  next,
  onBack,
  onNext,
  onChanged,
}: {
  id: string;
  next: { id: string; reference: string } | null;
  onBack: () => void;
  onNext: (id: string) => void;
  onChanged: () => void;
}) {
  const { load, reload, set } = useLoad<CountDetail>(countPath(id));
  const focusHeading = () => requestAnimationFrame(() => document.getElementById('count-record-title')?.focus());
  const stale = (message: string) => {
    toast({
      variant: 'warning',
      title: 'This count changed',
      description: `${message} Showing the latest saved version.`,
    });
    void reload();
  };
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Button variant="ghost" className="self-start px-2" onClick={onBack}>
        <ArrowLeft aria-hidden="true" /> Back to stock counts
      </Button>
      {load.status === 'loading' && <LoadingSkeleton variant="cards" label="Loading the count…" />}
      {load.status === 'denied' && <RegisterDenied noun="stock counts" />}
      {load.status === 'error' && <Failed error={load.error} onRetry={() => void reload()} />}
      {load.status === 'ready' &&
        (load.data.state === 'ASSIGNED' && load.data.can.count ? (
          <CountSheet
            key={`${load.data.id}:${load.data.version}`}
            detail={load.data}
            onStale={stale}
            onSigned={(signed) => {
              set(signed);
              onChanged();
              focusHeading();
            }}
          />
        ) : (
          <CountRecord
            key={`${load.data.id}:${load.data.version}`}
            detail={load.data}
            next={next}
            onNext={onNext}
            onStale={stale}
            onDecided={(decided) => {
              set(decided);
              onChanged();
              focusHeading();
            }}
          />
        ))}
    </div>
  );
}

function MyCounts({ summary, onOpen, onSettings }: { summary: ReconciliationSummary; onOpen: (id: string) => void; onSettings: (() => void) | null }) {
  const { cycle, forecast, settings } = summary;
  const mine = [...summary.mine].sort((a, b) => Number(b.day === summary.today) - Number(a.day === summary.today) || a.day.localeCompare(b.day));
  return (
    <div className="flex flex-col gap-4">
      {settings.enabled ? (
        <p className="text-base">
          Cycle {formatDisplayDay(cycle.start)} to {formatDisplayDay(cycle.end)} · day {cycle.day} of {cycle.days} ·{' '}
          <span className="tabular-nums">
            {forecast.covered} of {batchCount(forecast.batches)}
          </span>{' '}
          counted
        </p>
      ) : (
        <p className="text-base">
          Stock reconciliation is off, so no counts are assigned.{' '}
          {onSettings && (
            <button type="button" className="underline underline-offset-4" onClick={onSettings}>
              Turn it on in Settings
            </button>
          )}
        </p>
      )}
      {mine.length ? (
        <ul aria-label="Counts assigned to you" className="flex flex-col gap-2">
          {mine.map((count, index) => {
            const left = count.items - count.counted - count.retype;
            const label = count.counted ? 'Continue counting' : 'Start counting';
            return (
              <li key={count.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2 font-semibold">
                    {count.reference}
                    {count.day === summary.today && count.origin === 'CYCLE' && (
                      <Badge variant="info" className="px-1.5 py-0 text-xs">
                        Due today
                      </Badge>
                    )}
                    {count.day < summary.today && (
                      <Badge variant="warning" className="px-1.5 py-0 text-xs">
                        From {formatDisplayDay(count.day)}
                      </Badge>
                    )}
                  </span>
                  <span className="text-sm tabular-nums">
                    {itemCount(count.items)} · {count.counted} counted
                    {count.retype > 0 && <span className="font-medium text-warning-text"> · {count.retype} to type again</span>}
                    {left > 0 ? ` · ${left} left` : count.retype ? '' : ' · ready to sign off'}
                  </span>
                </div>
                <Button variant={index === 0 ? 'default' : 'outline'} onClick={() => onOpen(count.id)} aria-label={`${label}: ${count.reference}`}>
                  {label}
                </Button>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          icon={ClipboardList}
          title="Nothing to count right now"
          description={
            settings.enabled && summary.settings.assigneeIds.length
              ? 'Your next list appears on your next counting day. Use Count an item if something looks wrong.'
              : 'Counts assigned to you appear here.'
          }
        />
      )}
    </div>
  );
}

/**
 * @cc [owner:nareshshah139,label:product] stock-counts-workspace
 * Stock counts MUST open on the signed-in person's assigned counts, with approvals for approvers,
 * the full history for anyone who can read counts, and settings for whoever configures inventory.
 * A count opened from anywhere shows the counting sheet to its assignee and the locked record to
 * everyone else.
 */
export function StockCounts({
  searchParams,
  navigate,
  onRegisterParams,
}: {
  searchParams: URLSearchParams;
  navigate: (changes: Record<string, string>) => void;
  onRegisterParams: (tab: Tab, params: URLSearchParams) => void;
}) {
  const { load, reload } = useLoad<ReconciliationSummary>(RECONCILIATION);
  const [starting, setStarting] = useState<HTMLElement | null>(null);
  const documentId = searchParams.get('document');
  const requested = searchParams.get('tab') as Tab | null;

  if (documentId) {
    const waiting = load.status === 'ready' ? load.data.mine.find((count) => count.id !== documentId) : undefined;
    return (
      <CountDocument
        key={documentId}
        id={documentId}
        next={waiting ? { id: waiting.id, reference: waiting.reference } : null}
        onBack={() => navigate({ document: '' })}
        onNext={(id) => navigate({ document: id })}
        onChanged={() => void reload()}
      />
    );
  }
  if (load.status === 'denied') return <RegisterDenied noun="stock counts" />;
  if (load.status === 'error') return <Failed error={load.error} onRetry={() => void reload()} />;
  if (load.status === 'loading') return <LoadingSkeleton variant="cards" label="Loading stock counts…" />;

  const summary = load.data;
  const visible = TABS.filter((tab) => (tab !== 'approvals' || summary.canApprove) && (tab !== 'settings' || summary.canConfigure));
  const fallback: Tab = !summary.mine.length && summary.approvals?.count && visible.includes('approvals') ? 'approvals' : 'mine';
  const tab: Tab = requested && visible.includes(requested) ? requested : fallback;
  const switchTab = (next: string) =>
    navigate({
      tab: next === fallback ? '' : next,
      document: '',
      from: '',
      to: '',
      q: '',
      state: '',
      person: '',
      sort: '',
      dir: '',
      page: '',
    });
  const open = (id: string) => navigate({ document: id });

  return (
    <section aria-labelledby="stock-counts-title" className="flex min-w-0 flex-col gap-3">
      <h2 id="stock-counts-title" className="sr-only">
        Stock counts
      </h2>
      <Tabs value={tab} onValueChange={switchTab}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList aria-label="Stock count views" className="grid h-auto w-full grid-cols-2 gap-1 sm:flex sm:w-fit sm:flex-nowrap">
            {visible.map((value) => (
              <TabsTrigger key={value} value={value} className="min-h-10 whitespace-nowrap px-2 text-sm [overflow-wrap:normal] sm:flex-none sm:px-4">
                {TAB_LABELS[value]}
                {value === 'mine' && summary.mine.length > 0 && (
                  <Badge variant="brand" className="ml-1.5 min-w-6 text-xs">
                    {summary.mine.length}
                  </Badge>
                )}
                {value === 'approvals' && !!summary.approvals?.count && (
                  <Badge variant="warning" className="ml-1.5 min-w-6 text-xs">
                    {summary.approvals.count}
                  </Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
          {summary.canCount && (
            <Button variant="outline" className="h-10" onClick={(event) => setStarting(event.currentTarget)}>
              <Plus aria-hidden="true" /> Count an item
            </Button>
          )}
        </div>
        <TabsContent value="mine" className="min-w-0 pt-2">
          <MyCounts summary={summary} onOpen={open} onSettings={summary.canConfigure ? () => switchTab('settings') : null} />
        </TabsContent>
        {(['approvals', 'history'] as const).map((value) => (
          <TabsContent key={value} value={value} className="min-w-0 pt-2">
            <CountRegister view={value} searchParams={searchParams} onParamsChange={(params) => onRegisterParams(value, params)} onOpen={open} />
          </TabsContent>
        ))}
        <TabsContent value="settings" className="min-w-0 pt-2">
          <ReconciliationSettingsPanel key={summary.settingsVersion} summary={summary} onSaved={() => void reload()} />
        </TabsContent>
      </Tabs>
      {starting && (
        <StartCountDialog
          anchor={starting}
          onClose={() => setStarting(null)}
          onStarted={(id) => {
            setStarting(null);
            open(id);
          }}
        />
      )}
    </section>
  );
}
