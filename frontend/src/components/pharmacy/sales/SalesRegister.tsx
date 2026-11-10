'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, type MouseEvent } from 'react';
import { MessageCircle, Percent, Plus, Printer } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { displayCalendarDate } from '@/lib/date-display';
import { formatDisplayDay } from '@/lib/date-ranges';
import { formatRupees, printHtml, renderPharmacyInvoiceHtml, renderSaleReceiptHtml, type ClinicIdentity } from '@/lib/pharmacy-invoice-print';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { requestKey } from '@/components/inventory/workspace-model';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { queryParams } from '@/components/register/register-query';
import { useRegisterQuery } from '@/components/register/useRegisterQuery';
import { RegisterDateTime, RegisterDenied, RegisterGrid, shortName, type RegisterColumn } from '@/components/register/RegisterGrid';
import { ClearFilters, DateRangeFilter, FilterBar, FilterSelect, MoreFilters, RegisterSearch } from '@/components/register/RegisterFilters';
import { RegisterFooter } from '@/components/register/RegisterFooter';
import { RowAction } from '@/components/register/RowAction';
import {
  MORE_FILTERS,
  PAYMENT_FILTER_LABELS,
  REGISTER_QUERY,
  REGISTER_COPY,
  paymentBadgeLabel,
  paymentModesFor,
  SEARCH_FIELD_OPTIONS,
  SOURCE_FILTER_LABELS,
  STATE_LABELS,
  displayMobile,
  editDiscountAction,
  excludedNote,
  footerSummary,
  newEntryHref,
  openHref,
  printBlockedReason,
  requestParams,
  salesTabHref,
  whatsappAction,
  type PaymentMode,
  type Register,
  type SalesQuery,
  type SalesRegisterResponse,
  type SalesRegisterRow,
  type FilterKey,
  type SortKey,
} from './sales-register-model';

const MODE_BADGE: Partial<Record<PaymentMode, string>> = {
  CASH: 'border-success-border bg-success-soft text-success-text',
  UPI: 'border-violet-300 bg-violet-50 text-violet-900 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-100',
  CARD: 'border-info-border bg-info-soft text-info-text',
  CREDIT: 'border-destructive-border bg-destructive-soft text-destructive-text',
};
const badgeText = 'whitespace-nowrap px-1.5 py-0.5 text-xs font-semibold';

async function printRow(row: SalesRegisterRow, clinic: ClinicIdentity | null) {
  try {
    const id = encodeURIComponent(row.recordId);
    const html =
      row.source === 'PHARMACY_BILL'
        ? renderPharmacyInvoiceHtml(await apiClient.get(`/pharmacy/invoices/${id}`), clinic)
        : renderSaleReceiptHtml(await apiClient.get(`/inventory/workspace/documents/${id}`), clinic);
    await printHtml(html);
  } catch {
    toast({ variant: 'destructive', title: 'Could not print', description: 'Check your connection and try again.' });
  }
}

function PaymentCell({ row, register }: { row: SalesRegisterRow; register: Register }) {
  if (!row.paymentModes.length && row.due <= 0 && row.refundDue <= 0) return <span aria-label="None">—</span>;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {row.due > 0 && (
        <Badge variant="destructive" className={cn(badgeText, 'bg-destructive-text text-white dark:bg-destructive')}>
          Due {formatRupees(row.due)}
        </Badge>
      )}
      {row.refundDue > 0 && (
        <Badge variant="warning" className={badgeText}>
          Refund due {formatRupees(row.refundDue)}
        </Badge>
      )}
      {row.refunded > 0 && (
        <Badge variant="neutral" className={badgeText}>
          Refunded {formatRupees(row.refunded)}
        </Badge>
      )}
      {row.paymentModes.map((mode) => (
        <Badge key={mode} variant="outline" className={cn(badgeText, (register === 'returns' && mode === 'CREDIT' ? undefined : MODE_BADGE[mode]) ?? 'border-border bg-muted text-foreground')}>
          {paymentBadgeLabel(register, mode)}
        </Badge>
      ))}
    </div>
  );
}

export function SalesRegister({
  register,
  active,
  searchParams,
  onParamsChange,
}: {
  register: Register;
  active: boolean;
  searchParams: Pick<URLSearchParams, 'get' | 'toString'>;
  onParamsChange: (params: URLSearchParams) => void;
}) {
  const router = useRouter();
  const copy = REGISTER_COPY[register];
  const fetchPage = useCallback(
    (query: SalesQuery) => apiClient.get<SalesRegisterResponse>('/pharmacy/sales-register', requestParams(register, query)),
    [register],
  );
  const { today, query, dispatch, draft, setDraft, load, reload, view, searchRef, tableRef, clearAll, goToPage } = useRegisterQuery({
    config: REGISTER_QUERY[register],
    more: MORE_FILTERS,
    searchParams,
    onParamsChange,
    fetchPage,
    enabled: active,
  });

  const returnTo = useMemo(() => salesTabHref(register, queryParams(REGISTER_QUERY[register], query, today)), [register, query, today]);
  const data = load.data;
  const rows = data?.rows ?? [];
  const clinic = data?.clinic ?? null;
  const failed = load.status === 'error';

  const startNew = () => router.push(newEntryHref(register, returnTo, requestKey()));
  const openRow = (row: SalesRegisterRow) => router.push(openHref(row, returnTo));

  const billName = (row: SalesRegisterRow) =>
    row.billNo ?? `${row.state === 'CANCELLED' ? 'cancelled draft' : 'draft'} ${copy.one} for ${row.patientName ?? 'walk-in customer'}`;
  const setFilter = (key: FilterKey) => (value: string) => dispatch({ type: 'filter', key, value });
  const paymentModes = paymentModesFor(register);
  const entryByOptions = (data?.entryByOptions ?? []).map((person) => ({ value: person.id, label: person.name }));
  if (query.filters.entryById && !entryByOptions.some((option) => option.value === query.filters.entryById)) {
    entryByOptions.push({ value: query.filters.entryById, label: 'Selected person' });
  }

  const billCell = (row: SalesRegisterRow) => {
    const label = row.billNo ?? (row.state === 'CANCELLED' ? 'Cancelled draft' : <Badge variant="warning" className={badgeText}>Draft</Badge>);
    const linkClass =
      'whitespace-nowrap rounded-sm text-left font-semibold text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';
    const stop = (event: MouseEvent) => event.stopPropagation();
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Link href={openHref(row, returnTo)} onClick={stop} aria-label={`Open ${billName(row)}`} className={linkClass}>{label}</Link>
        {row.state === 'DRAFT' && row.reservedNo && (
          <span className="text-xs text-muted-foreground">{row.reservedNo} not final</span>
        )}
        {row.source === 'COUNTER_SALE' && <Badge variant="info" className={badgeText}>Counter sale</Badge>}
        {row.revisedAt && <Badge variant="info" className={badgeText}>Revised</Badge>}
        {row.state === 'CANCELLED' && <Badge variant="danger" className={badgeText}>Cancelled</Badge>}
      </div>
    );
  };

  const actionsCell = (row: SalesRegisterRow) => {
    const whatsapp = whatsappAction(row, clinic?.name ?? '');
    const editDiscount = editDiscountAction(row);
    const name = billName(row);
    return (
      <div className="inline-flex">
        {register === 'sales' && (
          <RowAction
            icon={Percent}
            label={`Edit discount on ${name}`}
            hint="Edit discount"
            reason={'reason' in editDiscount ? editDiscount.reason : null}
            onClick={'href' in editDiscount ? () => router.push(editDiscount.href) : undefined}
          />
        )}
        <RowAction icon={Printer} label={`Print ${name}`} hint="Print" reason={printBlockedReason(row)} onClick={() => void printRow(row, clinic)} />
        <RowAction
          icon={MessageCircle}
          label={`Send ${name} on WhatsApp`}
          hint="Send on WhatsApp"
          reason={'reason' in whatsapp ? whatsapp.reason : null}
          href={'href' in whatsapp ? whatsapp.href : undefined}
          className="text-success-text"
        />
      </div>
    );
  };

  const columns: RegisterColumn<SalesRegisterRow, SortKey>[] = [
    { key: 'billNo', label: 'Bill No', sort: 'billNo', pinned: true, className: 'w-[1%] whitespace-normal', cell: billCell },
    ...(register === 'returns'
      ? [{ key: 'against', label: 'Against bill', className: 'w-[1%]', cell: (row: SalesRegisterRow) => (row.linkedBillNos.length ? row.linkedBillNos.map((no) => <div key={no}>{no}</div>) : '—') }]
      : []),
    { key: 'entryAt', label: 'Entry Date', sort: 'entryAt', className: 'w-[1%]', cell: (row) => <RegisterDateTime value={row.entryAt} today={today} /> },
    { key: 'billDate', label: 'Bill Date', sort: 'billDate', className: 'w-[1%]', cell: (row) => displayCalendarDate(row.billDate) },
    { key: 'entryBy', label: 'Entry By', sort: 'entryBy', className: 'w-[1%]', cell: (row) => (row.entryBy ? <span title={row.entryBy.name}>{shortName(row.entryBy.name)}</span> : '—') },
    {
      key: 'patient',
      label: 'Patient',
      sort: 'patient',
      className: 'min-w-[6.5rem] whitespace-normal text-base font-medium leading-snug hyphens-auto [overflow-wrap:anywhere]',
      cell: (row) => row.patientName ?? '—',
    },
    { key: 'mobile', label: 'Mobile', sort: 'mobile', className: 'w-[1%]', cell: (row) => displayMobile(row.mobile) },
    {
      key: 'amount',
      label: copy.amount,
      sort: 'amount',
      align: 'right',
      className: 'w-[1%]',
      cell: (row) => <span className={cn('font-semibold', row.state === 'CANCELLED' && 'line-through')}>{formatRupees(row.amount)}</span>,
    },
    { key: 'payment', label: copy.payment, className: 'whitespace-normal', cell: (row) => <PaymentCell row={row} register={register} /> },
    { key: 'actions', label: 'Actions', hideLabel: true, align: 'right', interactive: true, className: 'w-[1%] py-1! pl-1!', cell: actionsCell },
  ];

  const footerSummaryText = failed
    ? 'Total not available'
    : data
      ? footerSummary(register, query, data.totals)
      : <Skeleton className="h-6 w-64" />;
  const footerNote = failed ? `Could not load ${copy.name}. Retry to see the latest total.` : data ? excludedNote(data.totals.excluded) : '';

  if (load.status === 'denied') return <RegisterDenied noun={copy.name} />;

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
          label={copy.payment}
          allLabel="All"
          value={query.filters.paymentMode}
          options={paymentModes.map((mode) => ({ value: mode, label: PAYMENT_FILTER_LABELS[mode] }))}
          onChange={setFilter('paymentMode')}
        />
        <MoreFilters count={view.moreCount}>
          <FilterSelect
            label="State"
            allLabel="All"
            value={query.filters.state}
            options={(Object.keys(STATE_LABELS) as (keyof typeof STATE_LABELS)[]).map((state) => ({ value: state, label: STATE_LABELS[state] }))}
            onChange={setFilter('state')}
          />
          {register === 'sales' && (
            <FilterSelect
              label="Source"
              allLabel="All"
              value={query.filters.source}
              options={Object.entries(SOURCE_FILTER_LABELS).map(([value, label]) => ({ value, label }))}
              onChange={setFilter('source')}
            />
          )}
          <FilterSelect label="Entry by" allLabel="Anyone" value={query.filters.entryById} options={entryByOptions} onChange={setFilter('entryById')} />
        </MoreFilters>
        {view.filtered && <ClearFilters onClear={clearAll} />}
      </FilterBar>

      <RegisterGrid
        label={copy.table}
        noun={copy.name}
        columns={columns}
        rows={rows}
        load={load}
        sort={{ by: query.sortBy, dir: query.sortDir }}
        onSort={(key) => dispatch({ type: 'sort', key })}
        onRowClick={openRow}
        onRetry={() => void reload()}
        containerRef={tableRef}
        empty={
          <EmptyState
            title={`No ${copy.name} ${view.searching ? 'match your search' : 'in this period'}`}
            description={`Nothing recorded between ${formatDisplayDay(query.from)} and ${formatDisplayDay(query.to)}${view.searching ? ' with these filters' : ''}.`}
            action={
              view.filtered ? (
                <Button variant="outline" onClick={clearAll}>Clear filters</Button>
              ) : (
                <Button onClick={startNew}><Plus aria-hidden="true" /> {copy.newLabel}</Button>
              )
            }
          />
        }
      />

      <RegisterFooter
        summary={footerSummaryText}
        note={footerNote}
        page={query.page}
        limit={data?.limit ?? 50}
        total={failed ? 0 : data?.total ?? 0}
        label={`${copy.table} pages`}
        busy={load.status === 'loading' && !!data}
        onPage={goToPage}
      />
    </div>
  );
}
