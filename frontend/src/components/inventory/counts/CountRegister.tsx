'use client';

import { useCallback, useId } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { formatDisplayDay } from '@/lib/date-ranges';
import { formatRupees } from '@/lib/pharmacy-invoice-print';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useRegisterQuery } from '@/components/register/useRegisterQuery';
import { RegisterDateTime, RegisterDenied, RegisterGrid, shortName, type RegisterColumn } from '@/components/register/RegisterGrid';
import { ClearFilters, DateRangeFilter, FilterBar, FilterSelect, filterLabelClass } from '@/components/register/RegisterFilters';
import { RegisterFooter } from '@/components/register/RegisterFooter';
import { CountStateBadge } from './count-parts';
import {
  COUNT_QUERY,
  COUNT_STATES,
  COUNT_STATE_LABELS,
  RECONCILIATION,
  countRequestParams,
  signedRupees,
  signedUnits,
  type CountPage,
  type CountQuery,
  type CountRow,
  type CountSortKey,
} from './count-model';

const NONE: [] = [];
const name = (person: CountRow['assignedTo']) => (person ? <span title={person.name}>{shortName(person.name)}</span> : <span className="text-muted-foreground">—</span>);
const units = (n: number) => `${signedUnits(n)} ${n === 1 || n === -1 ? 'unit' : 'units'}`;

function Net({ row }: { row: CountRow }) {
  if (!row.differences) return <span className="text-muted-foreground">None</span>;
  return (
    <span className="flex flex-col items-end leading-tight tabular-nums">
      <span className="whitespace-nowrap font-semibold">{units(row.netUnits)}</span>
      <span className="whitespace-nowrap text-sm">{signedRupees(row.netValue)}</span>
    </span>
  );
}

function columns(view: 'history' | 'approvals', today: string, onOpen: (row: CountRow) => void): RegisterColumn<CountRow, CountSortKey>[] {
  const open: RegisterColumn<CountRow, CountSortKey> = {
    key: 'date',
    label: 'Date',
    sort: 'date',
    pinned: true,
    interactive: true,
    cell: (row) => (
      <button type="button" onClick={() => onOpen(row)} className="rounded-sm text-left underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
        <span className="whitespace-nowrap font-semibold">{formatDisplayDay(row.day)}</span>
        <span className="sr-only">, open {row.reference}</span>
        {row.origin === 'ON_DEMAND' && <span className="block text-xs">On demand</span>}
      </button>
    ),
  };
  const counts: RegisterColumn<CountRow, CountSortKey>[] = [
    { key: 'items', label: 'Items', sort: 'items', align: 'right', cell: (row) => <span className="tabular-nums">{row.items}</span> },
    { key: 'differences', label: 'Differ­ences', sort: 'differences', align: 'right', cell: (row) => <span className="tabular-nums">{row.differences}</span> },
  ];
  if (view === 'approvals')
    return [
      open,
      { key: 'signedBy', label: 'Counted by', sort: 'assignedTo', cell: (row) => name(row.signedBy) },
      { key: 'signedAt', label: 'Signed at', sort: 'signedAt', cell: (row) => (row.signedAt ? <RegisterDateTime value={row.signedAt} today={today} /> : '—') },
      ...counts,
      { key: 'netValue', label: 'Net variance', sort: 'netValue', align: 'right', cell: (row) => <Net row={row} /> },
    ];
  return [
    open,
    { key: 'assignedTo', label: 'Assigned to', sort: 'assignedTo', cell: (row) => name(row.assignedTo) },
    { key: 'signedBy', label: 'Signed by', cell: (row) => name(row.signedBy) },
    { key: 'signedAt', label: 'Signed at', sort: 'signedAt', cell: (row) => (row.signedAt ? <RegisterDateTime value={row.signedAt} today={today} /> : <span className="text-muted-foreground">—</span>) },
    ...counts,
    { key: 'netValue', label: 'Net variance', sort: 'netValue', align: 'right', cell: (row) => <Net row={row} /> },
    { key: 'state', label: 'Status', cell: (row) => <CountStateBadge state={row.state} /> },
    { key: 'decidedBy', label: 'Decided by', cell: (row) => name(row.decidedBy) },
  ];
}

function CountCards({ rows, onOpen }: { rows: readonly CountRow[]; onOpen: (row: CountRow) => void }) {
  return (
    <ul className="flex flex-col gap-2 sm:hidden" aria-label="Stock counts">
      {rows.map((row) => (
        <li key={row.id}>
          <button type="button" onClick={() => onOpen(row)} className="flex w-full flex-col gap-1 rounded-lg border border-border bg-background p-3 text-left focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
            <span className="flex items-start justify-between gap-2">
              <span className="font-semibold">{formatDisplayDay(row.day)}{row.origin === 'ON_DEMAND' && ' · on demand'}</span>
              <CountStateBadge state={row.state} />
            </span>
            <span className="text-sm">
              {(row.signedBy ?? row.assignedTo)?.name ?? 'Former staff member'} · {row.items} items · {row.differences ? `${row.differences} differ` : 'no differences'}
            </span>
            {row.differences > 0 && (
              <span className="whitespace-nowrap text-sm font-semibold tabular-nums">
                Net {units(row.netUnits)} · {signedRupees(row.netValue)}
              </span>
            )}
            {row.decidedBy && <span className="text-sm">{row.state === 'REJECTED' ? 'Rejected' : 'Approved'} by {row.decidedBy.name}</span>}
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
  const { today, query, dispatch, draft, setDraft, load, reload, view: state, searchRef, tableRef, clearAll, goToPage } = useRegisterQuery({
    config: COUNT_QUERY,
    more: NONE,
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
  const summary = load.status === 'error' ? 'Totals not available' : data ? (
    <span className="tabular-nums">
      {data.totals.counts} {data.totals.counts === 1 ? 'count' : 'counts'} · {data.totals.differences} {data.totals.differences === 1 ? 'difference' : 'differences'}
      <span className="whitespace-nowrap"> · Net {formatRupees(data.totals.netValue)}</span>
    </span>
  ) : <Skeleton className="h-6 w-60" />;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {!approvals && (
        <FilterBar
          count={state.barCount}
          search={
            <div className="flex min-w-0 flex-[1_1_100%] flex-col gap-1 sm:flex-[1_1_14rem]">
              <label htmlFor={searchId} className={filterLabelClass}>Search</label>
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
          <FilterSelect label="Status" allLabel="All" value={query.filters.state} options={COUNT_STATES.map((value) => ({ value, label: COUNT_STATE_LABELS[value] }))} onChange={(value) => dispatch({ type: 'filter', key: 'state', value })} />
          <FilterSelect label="Person" allLabel="Anyone" value={query.filters.person} options={people} onChange={(value) => dispatch({ type: 'filter', key: 'person', value })} />
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
          empty={
            <EmptyState
              icon={ClipboardCheck}
              title={approvals ? 'Nothing waiting for approval' : state.searching ? 'No counts match your search' : 'No counts in this period'}
              description={approvals ? 'Signed counts with differences appear here.' : `No stock counts between ${formatDisplayDay(query.from)} and ${formatDisplayDay(query.to)}${state.searching ? ' with these filters' : ''}.`}
              action={state.filtered && !approvals ? <Button variant="outline" onClick={clearAll}>Clear filters</Button> : undefined}
            />
          }
        />
      </div>
      <div className="sm:hidden">
        {load.status === 'error' && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive-border bg-destructive-soft px-4 py-3 text-destructive-text">
            <span>Could not load stock counts. {load.error}</span>
            <Button variant="outline" onClick={() => void reload()}>Retry</Button>
          </div>
        )}
        {data && !rows.length && <p className="py-6 text-center">{approvals ? 'Nothing waiting for approval.' : 'No counts match.'}</p>}
        <CountCards rows={rows} onOpen={open} />
      </div>
      <RegisterFooter
        summary={summary}
        page={query.page}
        limit={data?.limit ?? 50}
        total={load.status === 'error' ? 0 : data?.total ?? 0}
        unit="count"
        label={approvals ? 'Approval pages' : 'Count history pages'}
        busy={load.status === 'loading' && !!data}
        onPage={goToPage}
      />
    </div>
  );
}
