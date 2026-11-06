'use client';

import { useCallback, useState } from 'react';
import { PackageX, Plus } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { formatDisplayDay } from '@/lib/date-ranges';
import { formatRupees } from '@/lib/pharmacy-invoice-print';
import { toast } from '@/hooks/use-toast';
import { requestKey } from '@/components/inventory/workspace-model';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { ToastAction } from '@/components/ui/toast';
import { errorMessage } from '@/components/register/register-query';
import { useRegisterQuery } from '@/components/register/useRegisterQuery';
import { RegisterDenied, RegisterGrid } from '@/components/register/RegisterGrid';
import { ClearFilters, DateRangeFilter, FilterBar, FilterSelect, MoreFilters, RegisterSearch } from '@/components/register/RegisterFilters';
import { RegisterFooter } from '@/components/register/RegisterFooter';
import { RecordCreditNoteDialog } from './RecordCreditNoteDialog';
import { SetOffCreditDialog } from './SetOffCreditDialog';
import { UNDO_REASON, UNDO_WINDOW_MS } from './purchase-register-model';
import { returnColumns, type ReturnAct } from './returns-columns';
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

type Acting = { act: ReturnAct; row: PurchaseReturnRow; anchor: HTMLElement };

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
  const action = useRowAction({ reload, next: (row: PurchaseReturnRow) => canRecordCreditNote(row, canWrite) });
  const undoWindow = useUndoWindow<string>(UNDO_WINDOW_MS);

  const data = load.data;
  const rows = data?.rows ?? [];
  const failed = load.status === 'error';
  const setFilter = (key: ReturnFilterKey) => (value: string) => dispatch({ type: 'filter', key, value });
  const indexOf = (row: PurchaseReturnRow) => rows.findIndex((candidate) => candidate.id === row.id);

  const recorded = async (row: PurchaseReturnRow, result: RecordedCreditNote, corrected: boolean) => {
    setActing(null);
    const { credit } = result;
    const message = corrected
      ? `Credit note ${credit.number} corrected.`
      : `Credit note ${credit.number} recorded: ${formatRupees(credit.amount)} from ${row.distributor.name}.`;
    setAnnouncement(message);
    const fresh = (await reload())?.rows ?? [];
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
    if (settable) action.focus(action.actionId(row.id), action.openId(row.id));
    else action.focusAfter(fresh, row.id, indexOf(row));
  };

  const setOffDone = async (row: PurchaseReturnRow, result: SetOffResult, total: number) => {
    setActing(null);
    const billNos = [...new Set(result.bills.map((bill) => bill.billNo))];
    undoWindow.remember([row.id], result.setOffId);
    const message = `Set off ${formatRupees(total)} against bill${billNos.length === 1 ? '' : 's'} ${billNos.join(', ')}.`;
    setAnnouncement(message);
    toast({ title: message, description: 'Undo is next to the credit note for 30 seconds.' });
    await action.refresh(row.id, indexOf(row), (candidate) => canSetOff(candidate, canWrite));
  };

  const undo = async (row: PurchaseReturnRow, key = requestKey()) => {
    const entry = undoWindow.entry(row.id);
    if (!entry || entry.undoing) return;
    const rowIds = undoWindow.sharing(entry.value);
    undoWindow.mark(rowIds, entry.value, true);
    try {
      await apiClient.post(
        `/inventory/workspace/credits/set-off/${encodeURIComponent(entry.value)}/reverse`,
        { reason: UNDO_REASON },
        { idempotencyKey: key },
      );
      undoWindow.forget(rowIds);
      toast({ title: 'Set-off undone', description: `Credit note ${row.creditNote?.number ?? row.returnRef} has its credit back.` });
      await reload();
      action.focus(action.actionId(row.id), action.openId(row.id));
    } catch (failure) {
      if ((failure as { status?: number } | null)?.status === 409) {
        undoWindow.forget(rowIds);
        toast({ variant: 'warning', title: 'This set-off was already undone', description: 'The list now shows the latest balance.' });
        await reload();
        action.focus(action.actionId(row.id), action.openId(row.id));
        return;
      }
      undoWindow.mark(rowIds, entry.value, false);
      toast({
        variant: 'destructive',
        title: 'Could not undo the set-off',
        description: `${errorMessage(failure)} You can reverse it from Payments & dues.`,
        action: (
          <ToastAction altText="Try undo again" onClick={() => void undo(row, key)}>
            Try again
          </ToastAction>
        ),
      });
    }
  };

  const stale = async (row: PurchaseReturnRow, failure: Extract<WriteFailure, { kind: 'stale' }>) => {
    setActing(null);
    toast({ variant: 'destructive', title: failure.title, description: failure.description });
    await action.refresh(row.id, indexOf(row), () => false);
  };

  const entryByOptions = (data?.entryByOptions ?? []).map((person) => ({ value: person.id, label: person.name }));
  if (query.filters.entryById && !entryByOptions.some((option) => option.value === query.filters.entryById))
    entryByOptions.push({ value: query.filters.entryById, label: 'Selected person' });
  const distributorOptions = (data?.distributorOptions ?? []).map((d) => ({ value: d.gstin, label: d.name }));
  const gstin = query.filters.distributorGstin;
  if (gstin && !distributorOptions.some((option) => option.value === gstin)) distributorOptions.push({ value: gstin, label: gstin });

  const columns = returnColumns({
    today,
    canWrite,
    actionId: action.actionId,
    openId: action.openId,
    undo: {
      pending: (rowId) => {
        const entry = undoWindow.pending[rowId];
        return entry ? (entry.undoing ? 'undoing' : 'ready') : null;
      },
      run: (row) => void undo(row),
    },
    onOpen: (row) => onOpen(row.kind, row.id),
    onAct: (act, row, anchor) => setActing({ act, row, anchor }),
  });

  if (load.status === 'denied') {
    return <RegisterDenied noun="purchase returns" />;
  }

  const summary = failed ? (
    'Totals not available'
  ) : data ? (
    <>
      Credit held (all dates) {formatRupees(data.totals.held)} · Awaited {formatRupees(data.totals.awaited.amount)} (
      {returnCount(data.totals.awaited.count)}) · {returnCount(data.totals.count)} in this period
    </>
  ) : (
    <Skeleton className="h-6 w-72" />
  );
  const note = failed
    ? 'Could not load purchase returns. Retry to see the latest totals.'
    : data
      ? [returnsExcludedNote(data.totals.excluded), 'Awaited counts our return value until the note arrives'].filter(Boolean).join('. ')
      : '';

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

      <RegisterGrid
        label="Purchase returns"
        noun="purchase returns"
        columns={columns}
        rows={rows}
        load={load}
        sort={{ by: query.sortBy, dir: query.sortDir }}
        onSort={(key) => dispatch({ type: 'sort', key })}
        onRowClick={(row) => onOpen(row.kind, row.id)}
        onRetry={() => void reload()}
        containerRef={tableRef}
        compact
        empty={
          <EmptyState
            icon={PackageX}
            title={`No purchase returns ${view.searching ? 'match your search' : 'in this period'}`}
            description={`Nothing returned to a distributor with a return date between ${formatDisplayDay(query.from)} and ${formatDisplayDay(query.to)}${view.searching ? ' with these filters' : ''}.`}
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

      {acting && acting.act !== 'setOff' && (
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
          onDone={(result, total) => void setOffDone(acting.row, result, total)}
          onStale={(failure) => void stale(acting.row, failure)}
        />
      )}
    </div>
  );
}
