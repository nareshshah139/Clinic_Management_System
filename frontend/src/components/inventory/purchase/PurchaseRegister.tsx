'use client';

import { useCallback } from 'react';
import { Plus, Receipt } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { displayCalendarDate, displayClinicDateTimeCompact } from '@/lib/date-display';
import { formatDisplayDay } from '@/lib/date-ranges';
import { formatRupees } from '@/lib/pharmacy-invoice-print';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useRegisterQuery } from '@/components/register/useRegisterQuery';
import { RegisterDenied, RegisterGrid, shortName, type RegisterColumn } from '@/components/register/RegisterGrid';
import { ClearFilters, DateRangeFilter, FilterBar, FilterSelect, MoreFilters, RegisterSearch } from '@/components/register/RegisterFilters';
import { RegisterFooter } from '@/components/register/RegisterFooter';
import { MarkPaidDialog } from './MarkPaidDialog';
import { PaymentCell, useSettleBill } from './settle';
import {
  INVOICE_STATE_FILTERS,
  INVOICE_STATE_LABELS,
  MORE_FILTERS,
  PAYMENT_FILTERS,
  PAYMENT_FILTER_LABELS,
  PURCHASE_QUERY,
  PURCHASE_REGISTER_COPY,
  PURCHASE_SOURCES,
  SEARCH_FIELD_OPTIONS,
  SOURCE_LABELS,
  billCount,
  excludedNote,
  requestParams,
  type FilterKey,
  type PurchaseQuery,
  type PurchaseRegisterKind,
  type PurchaseRegisterResponse,
  type PurchaseRegisterRow,
  type SortKey,
} from './purchase-register-model';

const compactDay = (day: string, today: string) => (day.endsWith(` ${today.slice(0, 4)}`) ? day.slice(0, -5) : day);

const linkClass =
  'whitespace-nowrap rounded-sm text-left font-semibold text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';

/**
 * @cc [owner:nareshshah139,label:product;target] purchase-register-complete
 * The purchase register MUST allow retrieval of every authorized saved invoice and unfinished
 * upload, including records beyond the recent-preview limit, with status and source retained.
 * Acceptance: INV-18. Validation and open gaps:
 * docs/qa/inventory-workflow-contract-review.md. This is a target obligation, not a pass claim.
 */
export function PurchaseRegister({
  register,
  active,
  searchParams,
  onParamsChange,
  canSettle,
  onOpen,
  onNew,
  onLedger,
}: {
  register: PurchaseRegisterKind;
  active: boolean;
  searchParams: Pick<URLSearchParams, 'get' | 'toString'>;
  onParamsChange: (params: URLSearchParams) => void;
  canSettle: boolean;
  onOpen: (invoiceId: string) => void;
  onNew: () => void;
  onLedger: ((gstin?: string) => void) | null;
}) {
  const copy = PURCHASE_REGISTER_COPY[register];
  const fetchPage = useCallback(
    (query: PurchaseQuery) => apiClient.get<PurchaseRegisterResponse>(copy.endpoint, requestParams(query)),
    [copy.endpoint],
  );
  const { today, query, dispatch, draft, setDraft, load, reload, view, searchRef, tableRef, clearAll, goToPage } = useRegisterQuery({
    config: PURCHASE_QUERY,
    more: MORE_FILTERS,
    searchParams,
    onParamsChange,
    fetchPage,
    enabled: active,
  });

  const data = load.data;
  const rows = data?.rows ?? [];
  const failed = load.status === 'error';
  const settle = useSettleBill({ rows, canSettle, reload });
  const setFilter = (key: FilterKey) => (value: string) => dispatch({ type: 'filter', key, value });

  const entryByOptions = (data?.entryByOptions ?? []).map((person) => ({ value: person.id, label: person.name }));
  if (query.filters.entryById && !entryByOptions.some((option) => option.value === query.filters.entryById)) {
    entryByOptions.push({ value: query.filters.entryById, label: 'Selected person' });
  }
  const distributorOptions = (data?.distributorOptions ?? []).map((d) => ({ value: d.gstin, label: d.name }));
  const gstin = query.filters.distributorGstin;
  if (gstin && !distributorOptions.some((option) => option.value === gstin)) distributorOptions.push({ value: gstin, label: gstin });

  const columns: RegisterColumn<PurchaseRegisterRow, SortKey>[] = [
    { key: 'srNo', label: 'Sr No', sort: 'srNo', className: 'w-[1%] tabular-nums', cell: (row) => row.srNo },
    {
      key: 'billNo',
      label: 'Bill No',
      sort: 'billNo',
      pinned: true,
      interactive: true,
      className: 'w-[1%]',
      cell: (row) => (
        <button id={settle.openId(row.id)} type="button" onClick={() => onOpen(row.id)} aria-label={`Open bill ${row.billNo}`} className={linkClass}>
          {row.billNo}
        </button>
      ),
    },
    { key: 'entryAt', label: 'Entry Date', sort: 'entryAt', className: 'w-[1%] whitespace-nowrap', cell: (row) => displayClinicDateTimeCompact(row.entryAt, today) },
    { key: 'billDate', label: 'Bill Date', sort: 'billDate', className: 'w-[1%] whitespace-nowrap', cell: (row) => compactDay(displayCalendarDate(row.billDate), today) },
    { key: 'entryBy', label: 'Entry By', className: 'w-[1%] whitespace-nowrap', cell: (row) => (row.entryBy ? <span title={row.entryBy.name}>{shortName(row.entryBy.name)}</span> : '—') },
    {
      key: 'distributor',
      label: 'Distributor',
      sort: 'distributor',
      className: 'w-full max-w-0 min-w-[7rem]',
      cell: (row) => (
        <span title={`${row.distributor.name} · GSTIN ${row.distributor.gstin}`} className="block truncate font-medium">
          {row.distributor.name}
        </span>
      ),
    },
    {
      key: 'amount',
      label: 'Bill Amount',
      sort: 'amount',
      align: 'right',
      className: 'w-[1%] whitespace-nowrap',
      cell: (row) => <span className={cn('font-semibold', row.invoiceState === 'CANCELLED' && 'line-through')}>{formatRupees(row.amount)}</span>,
    },
    {
      key: 'payment',
      label: 'Payment',
      srNote: '(by amount outstanding)',
      sort: 'outstanding',
      interactive: true,
      className: 'w-[1%] whitespace-nowrap py-0.5!',
      cell: (row) => <PaymentCell row={row} settle={settle} canSettle={canSettle} />,
    },
  ];

  if (load.status === 'denied') {
    return (
      <RegisterDenied noun={copy.noun}>
        <Button variant="outline" onClick={onNew}><Plus aria-hidden="true" /> Scan or enter a bill</Button>
      </RegisterDenied>
    );
  }

  const outstanding = data && formatRupees(data.totals.outstanding);
  const summary = failed ? (
    'Total not available'
  ) : data ? (
    <>
      Bills {formatRupees(data.totals.amount)} ·{' '}
      {onLedger ? (
        <button
          type="button"
          onClick={() => onLedger(gstin || undefined)}
          aria-label={`Outstanding ${outstanding}, open Payments & dues`}
          className="inline rounded-sm text-left underline underline-offset-4 hover:decoration-2 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          Outstanding {outstanding}
        </button>
      ) : (
        <>Outstanding {outstanding}</>
      )}{' '}
      · {billCount(data.totals.count)}
    </>
  ) : (
    <Skeleton className="h-6 w-72" />
  );
  const note = failed ? `Could not load ${copy.noun}. Retry to see the latest totals.` : data ? excludedNote(data.totals.excluded) : '';

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <FilterBar
        count={view.barCount}
        search={
          <RegisterSearch
            fields={SEARCH_FIELD_OPTIONS}
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
          label="Payment status"
          allLabel="All"
          value={query.filters.paymentState}
          options={PAYMENT_FILTERS.map((value) => ({ value, label: PAYMENT_FILTER_LABELS[value] }))}
          onChange={setFilter('paymentState')}
        />
        <MoreFilters count={view.moreCount}>
          <FilterSelect label="Distributor" allLabel="All" value={gstin} options={distributorOptions} onChange={setFilter('distributorGstin')} />
          <FilterSelect
            label="Bill status"
            allLabel="All"
            value={query.filters.invoiceState}
            options={INVOICE_STATE_FILTERS.map((value) => ({ value, label: INVOICE_STATE_LABELS[value] }))}
            onChange={setFilter('invoiceState')}
          />
          <FilterSelect
            label="Source"
            allLabel="All"
            value={query.filters.source}
            options={PURCHASE_SOURCES.map((value) => ({ value, label: SOURCE_LABELS[value] }))}
            onChange={setFilter('source')}
          />
          <FilterSelect label="Entry by" allLabel="Anyone" value={query.filters.entryById} options={entryByOptions} onChange={setFilter('entryById')} />
        </MoreFilters>
        {view.filtered && <ClearFilters onClear={clearAll} />}
      </FilterBar>

      <RegisterGrid
        label={copy.table}
        noun={copy.noun}
        columns={columns}
        rows={rows}
        load={load}
        sort={{ by: query.sortBy, dir: query.sortDir }}
        onSort={(key) => dispatch({ type: 'sort', key })}
        onRowClick={(row) => onOpen(row.id)}
        onRetry={() => void reload()}
        containerRef={tableRef}
        compact
        empty={
          <EmptyState
            icon={Receipt}
            title={`No ${copy.noun} ${view.searching ? 'match your search' : 'in this period'}`}
            description={`Nothing entered with a bill date between ${formatDisplayDay(query.from)} and ${formatDisplayDay(query.to)}${view.searching ? ' with these filters' : ''}.`}
            action={
              view.filtered ? (
                <Button variant="outline" onClick={clearAll}>Clear filters</Button>
              ) : (
                <Button onClick={onNew}><Plus aria-hidden="true" /> New purchase</Button>
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
        label={`${copy.table} pages`}
        busy={load.status === 'loading' && !!data}
        onPage={goToPage}
      />

      <p role="status" className="sr-only">{settle.announcement}</p>

      {settle.settling && (
        <MarkPaidDialog
          row={settle.settling.row}
          anchor={settle.settling.anchor}
          onClose={settle.close}
          onPaid={(payment, amount) => void settle.paid(payment, amount)}
          onStale={(failure) => void settle.stale(failure)}
        />
      )}
    </div>
  );
}
