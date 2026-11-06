'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { PackageX, Plus } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { displayCalendarDate } from '@/lib/date-display';
import { formatDisplayDay } from '@/lib/date-ranges';
import { formatRupees } from '@/lib/pharmacy-invoice-print';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useRegisterQuery } from '@/components/register/useRegisterQuery';
import { RegisterDateTime, RegisterDenied, RegisterGrid, shortName, type RegisterColumn } from '@/components/register/RegisterGrid';
import { ClearFilters, DateRangeFilter, FilterBar, FilterSelect, MoreFilters, RegisterSearch } from '@/components/register/RegisterFilters';
import { RegisterFooter } from '@/components/register/RegisterFooter';
import { RecordCreditNoteDialog } from './RecordCreditNoteDialog';
import { SetOffCreditDialog } from './SetOffCreditDialog';
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
  type ReturnFilterKey,
  type ReturnKind,
  type ReturnSortKey,
  type ReturnsQuery,
  type WriteFailure,
} from './purchase-returns-model';

const badgeText = 'whitespace-nowrap px-1.5 py-0.5 text-xs font-semibold';
const linkClass =
  'flex flex-col items-start rounded-sm text-left focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&:hover_.ref]:underline';
const compactDay = (day: string, today: string) => (day.endsWith(` ${today.slice(0, 4)}`) ? day.slice(0, -5) : day);

export function ReturnStateBadge({ row }: { row: PurchaseReturnRow }) {
  const available = row.credit?.available ?? 0;
  switch (row.state) {
    case 'AWAITED':
      return <Badge variant="warning" className={badgeText}>Credit note awaited</Badge>;
    case 'RECEIVED':
      return (
        <span className="flex flex-col items-start gap-0.5">
          <Badge variant="info" className={badgeText}>Received</Badge>
          <span className="whitespace-nowrap text-xs font-medium leading-tight">{formatRupees(available)} available</span>
        </span>
      );
    case 'ADJUSTED':
      return (
        <span className="flex flex-col items-start gap-0.5">
          <Badge variant="info" className={badgeText}>Adjusted</Badge>
          <span className="whitespace-nowrap text-xs font-medium leading-tight">{formatRupees(available)} left</span>
        </span>
      );
    case 'USED':
      return <Badge variant="success" className={badgeText}>Fully used</Badge>;
    case 'DRAFT':
      return <Badge variant="neutral" className={badgeText}>Draft</Badge>;
    case 'CANCELLED':
      return <Badge variant="neutral" className={cn(badgeText, 'line-through')}>Cancelled</Badge>;
  }
}

type Acting = { kind: 'record' | 'setOff'; row: PurchaseReturnRow; anchor: HTMLButtonElement };

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
  const ids = useId();
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
  const [focusId, setFocusId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const data = load.data;
  const rows = data?.rows ?? [];
  const failed = load.status === 'error';
  const setFilter = (key: ReturnFilterKey) => (value: string) => dispatch({ type: 'filter', key, value });
  const actionId = (rowId: string) => `${ids}act-${rowId}`;
  const openId = (rowId: string) => `${ids}open-${rowId}`;

  useEffect(() => {
    if (!focusId) return;
    document.getElementById(focusId)?.focus();
    setFocusId(null);
  }, [focusId, rows]);

  const focusAfter = (fresh: readonly PurchaseReturnRow[], row: PurchaseReturnRow, next: (candidate: PurchaseReturnRow) => boolean) => {
    const index = fresh.findIndex((candidate) => candidate.id === row.id);
    const following = fresh.slice(index + 1).find(next);
    const self = fresh[index];
    if (following) setFocusId(actionId(following.id));
    else if (self && (canSetOff(self, canWrite) || canRecordCreditNote(self, canWrite))) setFocusId(actionId(self.id));
    else if (self) setFocusId(openId(self.id));
  };

  const finish = async (row: PurchaseReturnRow, message: string, next: (candidate: PurchaseReturnRow) => boolean) => {
    setActing(null);
    setAnnouncement(message);
    toast({ title: message });
    const fresh = (await reload())?.rows ?? [];
    focusAfter(fresh, row, next);
  };
  const stale = async (row: PurchaseReturnRow, failure: Extract<WriteFailure, { kind: 'stale' }>) => {
    setActing(null);
    toast({ variant: 'destructive', title: failure.title, description: failure.description });
    const fresh = (await reload())?.rows ?? [];
    focusAfter(fresh, row, () => false);
  };

  const entryByOptions = (data?.entryByOptions ?? []).map((person) => ({ value: person.id, label: person.name }));
  if (query.filters.entryById && !entryByOptions.some((option) => option.value === query.filters.entryById))
    entryByOptions.push({ value: query.filters.entryById, label: 'Selected person' });
  const distributorOptions = (data?.distributorOptions ?? []).map((d) => ({ value: d.gstin, label: d.name }));
  const gstin = query.filters.distributorGstin;
  if (gstin && !distributorOptions.some((option) => option.value === gstin)) distributorOptions.push({ value: gstin, label: gstin });

  const columns: RegisterColumn<PurchaseReturnRow, ReturnSortKey>[] = [
    { key: 'srNo', label: 'Sr No', sort: 'srNo', className: 'w-[1%] tabular-nums', cell: (row) => row.srNo },
    {
      key: 'creditNoteNo',
      label: 'Credit Note No.',
      sort: 'creditNoteNo',
      pinned: true,
      interactive: true,
      className: 'w-[1%]',
      cell: (row) => (
        <button id={openId(row.id)} type="button" onClick={() => onOpen(row.kind, row.id)} className={linkClass}>
          {row.creditNote ? (
            <span className="ref whitespace-nowrap font-semibold underline-offset-4">{row.creditNote.number}</span>
          ) : row.state === 'AWAITED' ? (
            <Badge variant="warning" className={badgeText}>Awaited</Badge>
          ) : (
            <span aria-hidden="true">—</span>
          )}
          <span className="ref whitespace-nowrap text-xs font-medium leading-tight underline-offset-4">
            <span className="sr-only">Open </span>
            {row.kind === 'CREDIT_NOTE' ? 'Credit' : 'Return'} {row.returnRef}
          </span>
        </button>
      ),
    },
    { key: 'entryAt', label: 'Entry Date', sort: 'entryAt', className: 'w-[1%]', cell: (row) => <RegisterDateTime value={row.entryAt} today={today} /> },
    {
      key: 'creditNoteDate',
      label: 'Credit Note Date',
      sort: 'creditNoteDate',
      className: 'w-[1%] whitespace-nowrap',
      cell: (row) => (row.creditNote?.date ? compactDay(displayCalendarDate(row.creditNote.date), today) : '—'),
    },
    { key: 'entryBy', label: 'Entry By', className: 'w-[1%] whitespace-nowrap', cell: (row) => (row.entryBy ? <span title={row.entryBy.name}>{shortName(row.entryBy.name)}</span> : '—') },
    {
      key: 'distributor',
      label: 'Distributor',
      sort: 'distributor',
      className: 'w-full max-w-0 min-w-[7rem]',
      cell: (row) => (
        <span className="flex min-w-0 flex-col">
          <span title={`${row.distributor.name} · GSTIN ${row.distributor.gstin}`} className="truncate font-medium">{row.distributor.name}</span>
          {(row.sourceBillNo || row.reason) && (
            <span className="truncate text-xs font-medium leading-tight">
              {[row.sourceBillNo && `Bill ${row.sourceBillNo}`, row.reason && RETURN_REASON_LABELS[row.reason]].filter(Boolean).join(' · ')}
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'amount',
      label: 'Amount',
      sort: 'amount',
      align: 'right',
      className: 'w-[1%] whitespace-nowrap',
      cell: (row) => {
        const amount = row.creditNote?.amount ?? row.returnValue;
        const differs = row.creditNote && Math.abs(row.creditNote.amount - row.returnValue) > 0.01;
        return (
          <span className="flex flex-col items-end">
            <span className={cn('font-semibold', row.state === 'CANCELLED' && 'line-through')}>
              {formatRupees(amount)}
              {!row.creditNote && <span className="ml-1 text-xs font-medium">est.</span>}
            </span>
            {differs && <span className="text-xs font-medium leading-tight">Return {formatRupees(row.returnValue)}</span>}
          </span>
        );
      },
    },
    {
      key: 'state',
      label: 'Status',
      sort: 'state',
      interactive: true,
      className: 'w-[1%] whitespace-nowrap py-0.5!',
      cell: (row) => (
        <div className="flex items-center justify-between gap-2">
          <ReturnStateBadge row={row} />
          {canRecordCreditNote(row, canWrite) && (
            <Button
              id={actionId(row.id)}
              type="button"
              variant="outline"
              size="sm"
              className="h-8 max-w-none! whitespace-nowrap! px-2.5 text-sm lg:min-h-8!"
              aria-label={`Record credit note for ${row.kind === 'CREDIT_NOTE' ? 'credit' : 'return'} ${row.returnRef}`}
              aria-haspopup="dialog"
              onClick={(event) => setActing({ kind: 'record', row, anchor: event.currentTarget })}
            >
              Record CN
            </Button>
          )}
          {canSetOff(row, canWrite) && (
            <Button
              id={actionId(row.id)}
              type="button"
              variant="outline"
              size="sm"
              className="h-8 max-w-none! whitespace-nowrap! px-2.5 text-sm lg:min-h-8!"
              aria-label={`Set off credit note ${row.creditNote?.number ?? row.returnRef} against bills`}
              aria-haspopup="dialog"
              onClick={(event) => setActing({ kind: 'setOff', row, anchor: event.currentTarget })}
            >
              Set off
            </Button>
          )}
        </div>
      ),
    },
  ];

  if (load.status === 'denied') {
    return <RegisterDenied noun="purchase returns" />;
  }

  const summary = failed ? (
    'Totals not available'
  ) : data ? (
    <>
      Credit held {formatRupees(data.totals.held)} · Awaited {formatRupees(data.totals.awaited.amount)} ({returnCount(data.totals.awaited.count)}) ·{' '}
      {returnCount(data.totals.count)}
    </>
  ) : (
    <Skeleton className="h-6 w-72" />
  );
  const note = failed
    ? 'Could not load purchase returns. Retry to see the latest totals.'
    : data
      ? [returnsExcludedNote(data.totals.excluded), 'Awaited is our return value until the credit note arrives'].filter(Boolean).join('. ')
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

      {acting?.kind === 'record' && (
        <RecordCreditNoteDialog
          row={acting.row}
          anchor={acting.anchor}
          onClose={() => setActing(null)}
          onRecorded={(recorded) =>
            void finish(
              acting.row,
              `Credit note ${recorded.credit.number} recorded: ${formatRupees(recorded.credit.amount)} from ${acting.row.distributor.name}.`,
              (candidate) => canRecordCreditNote(candidate, canWrite),
            )
          }
          onStale={(failure) => void stale(acting.row, failure)}
        />
      )}
      {acting?.kind === 'setOff' && acting.row.credit && (
        <SetOffCreditDialog
          scope={{ creditId: acting.row.credit.id }}
          distributorName={acting.row.distributor.name}
          anchor={acting.anchor}
          onClose={() => setActing(null)}
          onDone={(result, total) =>
            void finish(
              acting.row,
              `Set off ${formatRupees(total)} against ${[...new Set(result.bills.map((bill) => bill.billNo))].join(', ')}.`,
              (candidate) => canSetOff(candidate, canWrite),
            )
          }
          onStale={(failure) => void stale(acting.row, failure)}
        />
      )}
    </div>
  );
}

