'use client';

import { useCallback, useId } from 'react';
import { ChevronRight, ClipboardCheck } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { formatDisplayDay } from '@/lib/date-ranges';
import { displayCalendarDate, displayClinicDateTimeCompact, displayClinicTime } from '@/lib/date-display';
import { getISTDateString } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useRegisterQuery } from '@/components/register/useRegisterQuery';
import { RegisterDenied, RegisterGrid, shortName, type RegisterColumn } from '@/components/register/RegisterGrid';
import { ClearFilters, DateRangeFilter, FilterBar, FilterSelect, MoreFilters, filterLabelClass } from '@/components/register/RegisterFilters';
import { RegisterFooter } from '@/components/register/RegisterFooter';
import { CountStateBadge, Money, Split } from './count-parts';
import {
  COUNT_QUERY,
  COUNT_STATES,
  COUNT_STATE_SHORT,
  RECONCILIATION,
  differ,
  itemCount,
  countRequestParams,
  type CountPage,
  type CountQuery,
  type CountRow,
  type CountSortKey,
} from './count-model';

const MORE = ['person'] as const;
const name = (person: CountRow['assignedTo']) => (person ? <span title={person.name}>{shortName(person.name)}</span> : <span className="text-muted-foreground">—</span>);
const none = <span className="text-muted-foreground">—</span>;

function SignedAt({ row, today }: { row: CountRow; today: string }) {
  const at = row.signedAt!;
  const sameDay = getISTDateString(new Date(at)) === row.day;
  return <span className="whitespace-nowrap">{sameDay ? displayClinicTime(at) : displayClinicDateTimeCompact(at, today)}</span>;
}

const shortDay = (day: string, today: string) => {
  const text = displayCalendarDate(day);
  return text.endsWith(` ${today.slice(0, 4)}`) ? text.slice(0, -5) : text;
};

function columns(view: 'history' | 'approvals', today: string, onOpen: (row: CountRow) => void): RegisterColumn<CountRow, CountSortKey>[] {
  const open: RegisterColumn<CountRow, CountSortKey> = {
    key: 'date',
    label: 'Date',
    sort: 'date',
    pinned: true,
    interactive: true,
    cell: (row) => (
      <button
        type="button"
        onClick={() => onOpen(row)}
        className="rounded-sm text-left underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <span className="whitespace-nowrap font-semibold">{shortDay(row.day, today)}</span>
        {row.origin === 'ON_DEMAND' && <span className="whitespace-nowrap text-sm font-normal"> · on demand</span>}
        <span className="sr-only">, open {row.reference}</span>
      </button>
    ),
  };
  const counts: RegisterColumn<CountRow, CountSortKey>[] = [
    { key: 'items', label: 'Items', sort: 'items', align: 'right', cell: (row) => <span className="tabular-nums">{row.items}</span> },
    { key: 'differences', label: 'Differ­ences', sort: 'differences', align: 'right', cell: (row) => <span className="tabular-nums">{row.differences}</span> },
    {
      key: 'shortValue',
      label: 'Short ₹',
      srNote: '(value of the batches found short)',
      sort: 'shortValue',
      align: 'right',
      cell: (row) => (row.shortValue ? <Money value={row.shortValue} /> : none),
    },
    { key: 'netValue', label: 'Net ₹', srNote: '(shortages and surpluses together)', sort: 'netValue', align: 'right', cell: (row) => (row.differences ? <Money value={row.netValue} /> : none) },
  ];
  if (view === 'approvals')
    return [
      open,
      { key: 'signedBy', label: 'Counted by', sort: 'assignedTo', cell: (row) => name(row.signedBy) },
      { key: 'signedAt', label: 'Signed at', sort: 'signedAt', cell: (row) => (row.signedAt ? <SignedAt row={row} today={today} /> : '—') },
      ...counts,
      {
        key: 'review',
        label: 'Action',
        hideLabel: true,
        interactive: true,
        cell: (row) => (
          <Button size="sm" variant="outline" className="h-8" onClick={() => onOpen(row)} aria-label={`Review ${row.reference}`}>
            Review
          </Button>
        ),
      },
    ];
  return [
    open,
    { key: 'assignedTo', label: 'Counted by', sort: 'assignedTo', cell: (row) => name(row.signedBy ?? row.assignedTo) },
    {
      key: 'signedAt',
      label: 'Signed at',
      sort: 'signedAt',
      cell: (row) => (row.signedAt ? <SignedAt row={row} today={today} /> : <span className="text-muted-foreground">—</span>),
    },
    ...counts,
    { key: 'state', label: 'Status', cell: (row) => <CountStateBadge state={row.state} short /> },
    {
      key: 'decidedBy',
      label: 'Decided by',
      cell: (row) => (row.selfApproval && row.decidedBy ? <span title={`${row.decidedBy.name}, who signed it`}>Own count</span> : name(row.decidedBy)),
    },
  ];
}

function CountCards({ rows, onOpen }: { rows: readonly CountRow[]; onOpen: (row: CountRow) => void }) {
  return (
    <ul className="flex flex-col gap-2 sm:hidden" aria-label="Stock counts">
      {rows.map((row) => (
        <li key={row.id}>
          <button
            type="button"
            onClick={() => onOpen(row)}
            className="flex w-full items-center gap-2 rounded-lg border border-border bg-background p-3 text-left focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex items-start justify-between gap-2">
                <span className="font-semibold">
                  {formatDisplayDay(row.day)}
                  {row.origin === 'ON_DEMAND' && ' · on demand'}
                </span>
                <span className="shrink-0">
                  <CountStateBadge state={row.state} short />
                </span>
              </span>
              <span className="text-sm">
                {(row.signedBy ?? row.assignedTo)?.name ?? 'Former staff member'} · {itemCount(row.items)} · {row.differences ? differ(row.differences) : 'no differences'}
              </span>
              {row.differences > 0 && <Split figures={row} className="text-sm font-semibold" />}
              {row.decidedBy && (
                <span className="text-sm">
                  {row.state === 'REJECTED' ? 'Rejected' : 'Approved'} by {row.decidedBy.name}
                  {row.selfApproval && ', their own count'}
                </span>
              )}
            </span>
            <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * @cc [owner:nareshshah139,label:product] count-history-register
 * Every past count MUST be listed with its date, who it was assigned to, who signed and when, how
 * many items, how many differed, the net variance and its status, filterable by period, person and
 * status, so a run of differences by the same person or on the same item is visible.
 */
export function CountRegister({
  view,
  searchParams,
  onParamsChange,
  onOpen,
}: {
  view: 'history' | 'approvals';
  searchParams: Pick<URLSearchParams, 'get' | 'toString'>;
  onParamsChange: (params: URLSearchParams) => void;
  onOpen: (id: string) => void;
}) {
  const searchId = useId();
  const fetchPage = useCallback((query: CountQuery) => apiClient.get<CountPage>(`${RECONCILIATION}/counts`, countRequestParams(query, view)), [view]);
  const {
    today,
    query,
    dispatch,
    draft,
    setDraft,
    load,
    reload,
    view: state,
    searchRef,
    tableRef,
    clearAll,
    goToPage,
  } = useRegisterQuery({
    config: COUNT_QUERY,
    more: MORE,
    searchParams,
    onParamsChange,
    fetchPage,
  });
  if (load.status === 'denied') return <RegisterDenied noun="stock counts" />;
  const data = load.data;
  const rows = data?.rows ?? [];
  const open = (row: CountRow) => onOpen(row.id);
  const people = (data?.personOptions ?? []).map((person) => ({ value: person.id, label: person.name }));
  if (query.filters.person && !people.some((option) => option.value === query.filters.person)) people.push({ value: query.filters.person, label: 'Selected person' });
  const approvals = view === 'approvals';
  const summary =
    load.status === 'error' ? (
      'Totals not available'
    ) : data ? (
      <span className="tabular-nums">
        <span className="whitespace-nowrap">
          {data.totals.counts} {data.totals.counts === 1 ? 'count' : 'counts'}
        </span>
        {!approvals && (
          <span className="whitespace-nowrap max-sm:hidden">
            {' '}
            · Approved <Money value={data.totals.approvedValue} />
          </span>
        )}
        <span className="whitespace-nowrap">
          {' '}
          · Awaiting <Money value={data.totals.awaitingValue} />
        </span>
      </span>
    ) : (
      <Skeleton className="h-6 w-60" />
    );

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {!approvals && (
        <FilterBar
          count={state.barCount}
          search={
            <div className="flex min-w-0 flex-[1_1_100%] flex-col gap-1 sm:flex-[0_1_13rem]">
              <label htmlFor={searchId} className={filterLabelClass}>
                Search
              </label>
              <Input
                ref={searchRef}
                id={searchId}
                type="search"
                value={draft}
                placeholder="Item, batch or person"
                onChange={(event) => setDraft(event.target.value)}
                className="h-10 min-w-24 px-2.5 text-sm md:text-sm"
              />
            </div>
          }
        >
          <DateRangeFilter range={{ from: query.from, to: query.to }} today={today} onChange={(range) => dispatch({ type: 'range', ...range })} />
          <FilterSelect
            label="Status"
            allLabel="All"
            value={query.filters.state}
            options={COUNT_STATES.map((value) => ({ value, label: COUNT_STATE_SHORT[value] }))}
            onChange={(value) => dispatch({ type: 'filter', key: 'state', value })}
          />
          <MoreFilters count={state.moreCount}>
            <FilterSelect label="Person" allLabel="Anyone" value={query.filters.person} options={people} onChange={(value) => dispatch({ type: 'filter', key: 'person', value })} />
          </MoreFilters>
          {state.filtered && <ClearFilters onClear={clearAll} />}
        </FilterBar>
      )}
      <div className="max-sm:hidden">
        <RegisterGrid
          label={approvals ? 'Counts awaiting approval' : 'Stock count history'}
          noun={approvals ? 'counts awaiting approval' : 'stock counts'}
          columns={columns(view, today, open)}
          rows={rows}
          load={load}
          sort={{ by: query.sortBy, dir: query.sortDir }}
          onSort={(key) => dispatch({ type: 'sort', key })}
          onRowClick={open}
          onRetry={() => void reload()}
          containerRef={tableRef}
          compact
          dense
          empty={
            <EmptyState
              icon={ClipboardCheck}
              title={approvals ? 'Nothing waiting for approval' : state.searching ? 'No counts match your search' : 'No counts in this period'}
              description={
                approvals
                  ? 'Signed counts with differences appear here.'
                  : `No stock counts between ${formatDisplayDay(query.from)} and ${formatDisplayDay(query.to)}${state.searching ? ' with these filters' : ''}.`
              }
              action={
                state.filtered && !approvals ? (
                  <Button variant="outline" onClick={clearAll}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          }
        />
      </div>
      <div className="sm:hidden">
        {load.status === 'error' && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive-border bg-destructive-soft px-4 py-3 text-destructive-text"
          >
            <span>Could not load stock counts. {load.error}</span>
            <Button variant="outline" onClick={() => void reload()}>
              Retry
            </Button>
          </div>
        )}
        {data && !rows.length && <p className="py-6 text-center">{approvals ? 'Nothing waiting for approval.' : 'No counts match.'}</p>}
        <CountCards rows={rows} onOpen={open} />
      </div>
      <RegisterFooter
        summary={summary}
        note={!approvals && data?.totals.rejected ? `${data.totals.rejected} rejected ${data.totals.rejected === 1 ? 'count is' : 'counts are'} not included.` : undefined}
        page={query.page}
        limit={data?.limit ?? 50}
        total={load.status === 'error' ? 0 : (data?.total ?? 0)}
        unit="count"
        label={approvals ? 'Approval pages' : 'Count history pages'}
        busy={load.status === 'loading' && !!data}
        onPage={goToPage}
      />
    </div>
  );
}
