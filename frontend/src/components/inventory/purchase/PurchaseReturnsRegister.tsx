'use client';

import { useCallback, useRef, useState } from 'react';
import { Info, PackageX, Plus } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { formatDisplayDay } from '@/lib/date-ranges';
import { formatRupees } from '@/lib/pharmacy-invoice-print';
import { toast } from '@/hooks/use-toast';
import { requestKey } from '@/components/inventory/workspace-model';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { ToastAction } from '@/components/ui/toast';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { errorMessage } from '@/components/register/register-query';
import { useRegisterQuery } from '@/components/register/useRegisterQuery';
import { RegisterDenied, RegisterGrid } from '@/components/register/RegisterGrid';
import { ClearFilters, DateRangeFilter, FilterBar, FilterSelect, MoreFilters, RegisterSearch } from '@/components/register/RegisterFilters';
import { RegisterFooter } from '@/components/register/RegisterFooter';
import { RecordCreditNoteDialog } from './RecordCreditNoteDialog';
import { SetOffCreditDialog } from './SetOffCreditDialog';
import { UNDO_REASON, UNDO_WINDOW_MS } from './purchase-register-model';
import { returnView, type ReturnAct } from './returns-columns';
import { DistributorPositionStrip, useDistributorPosition } from './DistributorPositionStrip';
import { useRowAction, useUndoWindow } from './useRowAction';
import type { SetOffResult } from './set-off-model';
import {
  RETURNS_ENDPOINT,
  RETURNS_QUERY,
  RETURN_KINDS,
  RETURN_KIND_LABELS,
  RETURN_MORE_FILTERS,
  RETURN_REASONS,
  RETURN_REASON_LABELS,
  RETURN_SEARCH_OPTIONS,
  RETURN_STATES,
  RETURN_STATE_FILTER_LABELS,
  canRecordCreditNote,
  canSetOff,
  returnCount,
  returnsExcludedNote,
  returnsRequestParams,
  type PurchaseReturnRow,
  type PurchaseReturnsResponse,
  type RecordedCreditNote,
  type ReturnFilterKey,
  type ReturnKind,
  type ReturnsQuery,
  type WriteFailure,
} from './purchase-returns-model';

export { ReturnStateBadge } from './returns-columns';

type Acting = { act: ReturnAct; row: PurchaseReturnRow; anchor: HTMLElement } | { act: 'setOffAll'; gstin: string; name: string; anchor: HTMLElement };

export function PurchaseReturnsRegister({
  active,
  searchParams,
  onParamsChange,
  canWrite,
  onOpen,
  onNew,
}: {
  active: boolean;
  searchParams: Pick<URLSearchParams, 'get' | 'toString'>;
  onParamsChange: (params: URLSearchParams) => void;
  canWrite: boolean;
  onOpen: (kind: ReturnKind, id: string) => void;
  onNew: () => void;
}) {
  const fetchPage = useCallback(
    (query: ReturnsQuery) => apiClient.get<PurchaseReturnsResponse>(RETURNS_ENDPOINT, returnsRequestParams(query)),
    [],
  );
  const { today, query, dispatch, draft, setDraft, load, reload, view, searchRef, tableRef, clearAll, goToPage } = useRegisterQuery({
    config: RETURNS_QUERY,
    more: RETURN_MORE_FILTERS,
    searchParams,
    onParamsChange,
    fetchPage,
    enabled: active,
  });
  const [acting, setActing] = useState<Acting | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const gstin = query.filters.distributorGstin;
  const { position, refresh: refreshPosition } = useDistributorPosition(active ? gstin.toUpperCase() : '');
  const reloadAll = useCallback(async () => {
    const fresh = await reload();
    refreshPosition();
    return fresh;
  }, [reload, refreshPosition]);
  const action = useRowAction({ reload: reloadAll, next: (row: PurchaseReturnRow) => canRecordCreditNote(row, canWrite) });
  const undoWindow = useUndoWindow<string>(UNDO_WINDOW_MS);
  const undoing = useRef(new Set<string>());

  const data = load.data;
  const rows = data?.rows ?? [];
  const failed = load.status === 'error';
  const setFilter = (key: ReturnFilterKey) => (value: string) => dispatch({ type: 'filter', key, value });
  const indexOf = (row: PurchaseReturnRow) => rows.findIndex((candidate) => candidate.id === row.id);
  const focusRow = (rowId: string) => action.focus(action.actionId(rowId), action.openId(rowId));

  const recorded = async (row: PurchaseReturnRow, result: RecordedCreditNote, corrected: boolean) => {
    setActing(null);
    const { credit } = result;
    const message = corrected
      ? `Credit note ${credit.number} corrected.`
      : `Credit note ${credit.number} recorded: ${formatRupees(credit.amount)} from ${row.distributor.name}.`;
    setAnnouncement(message);
    const fresh = (await reloadAll())?.rows ?? [];
    const now = fresh.find((candidate) => candidate.id === row.id);
    const settable = now && canSetOff(now, canWrite);
    toast({
      title: message,
      ...(settable && !corrected
        ? {
            description: 'Set it off against the distributor’s bills now, or later from this list.',
            action: (
              <ToastAction
                altText={`Set off ${formatRupees(credit.available)} now`}
                onClick={() => {
                  const anchor = document.getElementById(action.actionId(row.id));
                  if (now && anchor) setActing({ act: 'setOff', row: now, anchor });
                }}
              >
                Set off {formatRupees(credit.available)} now
              </ToastAction>
            ),
          }
        : {}),
    });
    if (settable) focusRow(row.id);
    else action.focusAfter(fresh, row.id, indexOf(row));
  };

  const undo = async (setOffId: string, label: string, focusRowId: string | null, key = requestKey()) => {
    if (undoing.current.has(setOffId)) return;
    undoing.current.add(setOffId);
    const rowIds = undoWindow.sharing(setOffId);
    undoWindow.mark(rowIds, setOffId, true);
    try {
      await apiClient.post(
        `/inventory/workspace/credits/set-off/${encodeURIComponent(setOffId)}/reverse`,
        { reason: UNDO_REASON },
        { idempotencyKey: key },
      );
      undoWindow.forget(rowIds);
      toast({ title: 'Set-off undone', description: `${label} has its credit back.` });
      await reloadAll();
      if (focusRowId) focusRow(focusRowId);
    } catch (failure) {
      if ((failure as { status?: number } | null)?.status === 409) {
        undoWindow.forget(rowIds);
        toast({ variant: 'warning', title: 'This set-off was already undone', description: 'The list now shows the latest balance.' });
        await reloadAll();
        if (focusRowId) focusRow(focusRowId);
        return;
      }
      undoWindow.mark(rowIds, setOffId, false);
      toast({
        variant: 'destructive',
        title: 'Could not undo the set-off',
        description: `${errorMessage(failure)} You can reverse it from Payments & dues.`,
        action: (
          <ToastAction altText="Try undo again" onClick={() => void undo(setOffId, label, focusRowId, key)}>
            Try again
          </ToastAction>
        ),
      });
    } finally {
      undoing.current.delete(setOffId);
    }
  };

  const setOffDone = async (result: SetOffResult, total: number, from: PurchaseReturnRow | null, anchor: HTMLElement) => {
    setActing(null);
    const creditIds = new Set(result.allocations.map((allocation) => allocation.creditId));
    const rowIds = rows.filter((row) => row.credit && creditIds.has(row.credit.id)).map((row) => row.id);
    if (from && !rowIds.includes(from.id)) rowIds.push(from.id);
    undoWindow.remember(rowIds, result.setOffId);
    const billNos = [...new Set(result.bills.map((bill) => bill.billNo))];
    const numbers = [...new Set(result.allocations.map((allocation) => allocation.creditNoteNumber).filter(Boolean))];
    const label = numbers.length === 1 ? `Credit note ${numbers[0]}` : from ? `Credit note ${from.creditNote?.number ?? from.returnRef}` : `${numbers.length} credit notes`;
    const message = `Set off ${formatRupees(total)} against bill${billNos.length === 1 ? '' : 's'} ${billNos.join(', ')}.`;
    setAnnouncement(message);
    const focusRowId = from?.id ?? rowIds[0] ?? null;
    toast({
      title: message,
      description: 'Undo is in the Status column for 30 seconds.',
      action: (
        <ToastAction altText={`Undo the set-off of ${formatRupees(total)}`} onClick={() => void undo(result.setOffId, label, focusRowId)}>
          Undo
        </ToastAction>
      ),
    });
    if (from) await action.refresh(from.id, indexOf(from), (candidate) => canSetOff(candidate, canWrite));
    else {
      await reloadAll();
      if (anchor.isConnected) anchor.focus();
    }
  };

  const stale = async (row: PurchaseReturnRow | null, failure: Extract<WriteFailure, { kind: 'stale' }>) => {
    setActing(null);
    toast({ variant: 'destructive', title: failure.title, description: failure.description });
    if (row) await action.refresh(row.id, indexOf(row), () => false);
    else await reloadAll();
  };

  const entryByOptions = (data?.entryByOptions ?? []).map((person) => ({ value: person.id, label: person.name }));
  if (query.filters.entryById && !entryByOptions.some((option) => option.value === query.filters.entryById))
    entryByOptions.push({ value: query.filters.entryById, label: 'Selected person' });
  const distributorOptions = (data?.distributorOptions ?? []).map((d) => ({ value: d.gstin, label: d.name }));
  if (gstin && !distributorOptions.some((option) => option.value === gstin)) distributorOptions.push({ value: gstin, label: gstin });

  const { columns, card } = returnView({
    today,
    canWrite,
    actionId: action.actionId,
    openId: action.openId,
    undo: {
      pending: (rowId) => {
        const entry = undoWindow.pending[rowId];
        return entry ? (entry.undoing ? 'undoing' : 'ready') : null;
      },
      run: (row) => {
        const entry = undoWindow.entry(row.id);
        if (entry) void undo(entry.value, `Credit note ${row.creditNote?.number ?? row.returnRef}`, row.id);
      },
    },
    onOpen: (row) => onOpen(row.kind, row.id),
    onAct: (act, row, anchor) => setActing({ act, row, anchor }),
  });

  const awaitedOnly = query.filters.state === 'AWAITED';

  if (load.status === 'denied') {
    return <RegisterDenied noun="purchase returns" />;
  }

  const totalsNote = data
    ? [returnsExcludedNote(data.totals.excluded), 'Credit held and Awaited cover all dates; Awaited counts our return value until the note arrives.']
        .filter(Boolean)
        .join('. ')
    : '';
  const summary = failed ? (
    'Totals not available'
  ) : data ? (
    <>
      <span aria-hidden="true" className="sm:hidden">
        Held {formatRupees(data.totals.held)} · Awaited {formatRupees(data.totals.awaited.amount)}
      </span>
      <span className="max-sm:sr-only">
        Credit held (all dates) {formatRupees(data.totals.held)} · Awaited {formatRupees(data.totals.awaited.amount)} (
        {returnCount(data.totals.awaited.count)})
      </span>
      <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="About these totals"
            className="ml-1.5 inline-flex size-6 items-center justify-center rounded-full align-[-3px] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:hidden"
          >
            <Info aria-hidden="true" className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-80">{totalsNote}</TooltipContent>
      </Tooltip>
      </TooltipProvider>
    </>
  ) : (
    <Skeleton className="h-6 w-72" />
  );
  const note = failed ? 'Could not load purchase returns. Retry to see the latest totals.' : <span className="sr-only">{totalsNote}</span>;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <FilterBar
        count={view.barCount}
        search={
          <RegisterSearch
            fields={RETURN_SEARCH_OPTIONS}
            field={query.field}
            onField={(field) => dispatch({ type: 'search', field })}
            value={draft}
            onChange={setDraft}
            inputRef={searchRef}
          />
        }
      >
        <DateRangeFilter range={{ from: query.from, to: query.to }} today={today} onChange={(range) => dispatch({ type: 'range', ...range })} />
        <FilterSelect
          label="Status"
          allLabel="All"
          value={query.filters.state}
          options={RETURN_STATES.map((value) => ({ value, label: RETURN_STATE_FILTER_LABELS[value] }))}
          onChange={setFilter('state')}
        />
        <MoreFilters count={view.moreCount}>
          <FilterSelect label="Distributor" allLabel="All" value={gstin} options={distributorOptions} onChange={setFilter('distributorGstin')} />
          <FilterSelect
            label="Type"
            allLabel="All"
            value={query.filters.kind}
            options={RETURN_KINDS.map((value) => ({ value, label: RETURN_KIND_LABELS[value] }))}
            onChange={setFilter('kind')}
          />
          <FilterSelect
            label="Reason"
            allLabel="Any"
            value={query.filters.reason}
            options={RETURN_REASONS.map((value) => ({ value, label: RETURN_REASON_LABELS[value] }))}
            onChange={setFilter('reason')}
          />
          <FilterSelect label="Entry by" allLabel="Anyone" value={query.filters.entryById} options={entryByOptions} onChange={setFilter('entryById')} />
        </MoreFilters>
        {view.filtered && <ClearFilters onClear={clearAll} />}
      </FilterBar>

      {gstin && position && !failed && (
        <DistributorPositionStrip
          position={position}
          name={position.name ?? distributorOptions.find((option) => option.value === position.gstin)?.label ?? position.gstin}
          canSetOff={canWrite}
          onSetOff={(anchor) => setActing({ act: 'setOffAll', gstin: position.gstin, name: position.name ?? position.gstin, anchor })}
        />
      )}

      <RegisterGrid
        label="Purchase returns"
        noun="purchase returns"
        columns={columns}
        rows={rows}
        load={load}
        sort={{ by: query.sortBy, dir: query.sortDir }}
        onSort={(key) => dispatch({ type: 'sort', key })}
        onRowClick={(row) => onOpen(row.kind, row.id)}
        onRetry={() => void reloadAll()}
        containerRef={tableRef}
        compact
        dense
        card={card}
        empty={
          <EmptyState
            icon={PackageX}
            title={awaitedOnly ? 'No credit notes awaited' : `No purchase returns ${view.searching ? 'match your search' : 'in this period'}`}
            description={
              awaitedOnly
                ? `Every return dated between ${formatDisplayDay(query.from)} and ${formatDisplayDay(query.to)} has its credit note recorded${view.moreCount || query.q.trim() ? ' for these filters' : ''}.`
                : `Nothing returned to a distributor with a return date between ${formatDisplayDay(query.from)} and ${formatDisplayDay(query.to)}${view.searching ? ' with these filters' : ''}.`
            }
            action={
              view.filtered ? (
                <Button variant="outline" onClick={clearAll}>Clear filters</Button>
              ) : (
                <Button onClick={onNew}><Plus aria-hidden="true" /> New return</Button>
              )
            }
          />
        }
      />

      <RegisterFooter
        summary={summary}
        note={note}
        page={query.page}
        limit={data?.limit ?? 50}
        total={failed ? 0 : data?.total ?? 0}
        label="Purchase returns pages"
        busy={load.status === 'loading' && !!data}
        onPage={goToPage}
      />

      <p role="status" className="sr-only">{announcement}</p>

      {acting && (acting.act === 'record' || acting.act === 'correct') && (
        <RecordCreditNoteDialog
          row={acting.row}
          anchor={acting.anchor}
          mode={acting.act}
          onClose={() => setActing(null)}
          onRecorded={(result) => void recorded(acting.row, result, acting.act === 'correct')}
          onStale={(failure) => void stale(acting.row, failure)}
        />
      )}
      {acting?.act === 'setOff' && acting.row.credit && (
        <SetOffCreditDialog
          scope={{ creditId: acting.row.credit.id }}
          distributorName={acting.row.distributor.name}
          anchor={acting.anchor}
          onClose={() => setActing(null)}
          onDone={(result, total) => void setOffDone(result, total, acting.row, acting.anchor)}
          onStale={(failure) => void stale(acting.row, failure)}
        />
      )}
      {acting?.act === 'setOffAll' && (
        <SetOffCreditDialog
          scope={{ distributorGstin: acting.gstin }}
          distributorName={acting.name}
          anchor={acting.anchor}
          onClose={() => setActing(null)}
          onDone={(result, total) => void setOffDone(result, total, null, acting.anchor)}
          onStale={(failure) => void stale(null, failure)}
        />
      )}
    </div>
  );
}
