'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useRef, type MouseEvent, type ReactNode } from 'react';
import { MessageCircle, Plus, Printer } from 'lucide-react';
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
import { TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { countFilters, isRangeDefault, queryParams } from '@/components/register/register-query';
import { useRegisterQuery } from '@/components/register/useRegisterQuery';
import {
  RegisterDateTime,
  RegisterHead,
  RegisterTable,
  SortableHead,
  registerCellClass,
  registerStickyCellClass,
} from '@/components/register/RegisterTable';
import { ClearFilters, DateRangeFilter, FilterBar, FilterSelect, MoreFilters, RegisterSearch } from '@/components/register/RegisterFilters';
import { RegisterFooter } from '@/components/register/RegisterFooter';
import { RowAction } from '@/components/register/RowAction';
import {
  FILTER_KEYS,
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
  excludedNote,
  footerSummary,
  newEntryHref,
  openHref,
  printBlockedReason,
  requestParams,
  salesTabHref,
  shortName,
  whatsappAction,
  type PaymentMode,
  type Register,
  type SalesQuery,
  type SalesRegisterResponse,
  type SalesRegisterRow,
  type SortKey,
} from './sales-register-model';

const MODE_BADGE: Partial<Record<PaymentMode, string>> = {
  CASH: 'border-success-border bg-success-soft text-success-text',
  UPI: 'border-violet-300 bg-violet-50 text-violet-900 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-100',
  CARD: 'border-info-border bg-info-soft text-info-text',
  CREDIT: 'border-destructive-border bg-destructive-soft text-destructive-text',
};
const badgeText = 'whitespace-nowrap px-1.5 py-0.5 text-xs font-semibold';

type Column = { key: string; label: string; sort?: SortKey; align?: 'right'; className?: string; cell: (row: SalesRegisterRow) => ReactNode };

async function openInvoice(id: string) {
  const view = window.open('', '_blank');
  if (!view) {
    toast({ variant: 'destructive', title: 'Pop-up blocked', description: 'Allow pop-ups for this site to open bills.' });
    return;
  }
  view.document.write('<p style="font-family:sans-serif;padding:24px">Loading bill…</p>');
  try {
    const invoice = await apiClient.get(`/pharmacy/invoices/${encodeURIComponent(id)}`);
    view.document.open();
    view.document.write(renderPharmacyInvoiceHtml(invoice));
    view.document.close();
  } catch {
    view.close();
    toast({ variant: 'destructive', title: 'Could not open the bill', description: 'Check your connection and try again.' });
  }
}

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
  if (!row.paymentModes.length && row.due <= 0) return <span aria-label="None">—</span>;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {row.due > 0 && (
        <Badge variant="destructive" className={cn(badgeText, 'bg-destructive-text text-white dark:bg-destructive')}>
          Due {formatRupees(row.due)}
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
  const searchRef = useRef<HTMLInputElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const fetchPage = useCallback(
    (query: SalesQuery) => apiClient.get<SalesRegisterResponse>('/pharmacy/sales-register', requestParams(register, query)),
    [register],
  );
  const { today, query, dispatch, draft, setDraft, clear, load, retry } = useRegisterQuery({
    config: REGISTER_QUERY[register],
    searchParams,
    onParamsChange,
    fetchPage,
    enabled: active,
  });

  const returnTo = useMemo(() => salesTabHref(register, queryParams(REGISTER_QUERY[register], query, today)), [register, query, today]);
  const data = load.data;
  const rows = data?.rows ?? [];
  const clinic = data?.clinic ?? null;
  const firstLoad = !data && load.status === 'loading';
  const failed = load.status === 'error';
  const searching = query.q.trim() !== '' || draft.trim() !== '' || countFilters(query, FILTER_KEYS) > 0;
  const rangeChanged = !isRangeDefault(query, today);
  const filtered = searching || rangeChanged;
  const moreCount = countFilters(query, MORE_FILTERS);
  const barCount = countFilters(query, FILTER_KEYS) + (rangeChanged ? 1 : 0);

  const clearAll = () => {
    clear();
    searchRef.current?.focus();
  };
  const startNew = () => router.push(newEntryHref(register, returnTo, requestKey()));
  const openRow = (row: SalesRegisterRow) => {
    const href = openHref(row, returnTo);
    if (href) router.push(href);
    else void openInvoice(row.recordId);
  };
  const goToPage = (page: number) => {
    dispatch({ type: 'page', page });
    tableRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  };

  const billName = (row: SalesRegisterRow) => row.billNo ?? `draft ${copy.one} for ${row.patientName ?? 'walk-in customer'}`;
  const setFilter = (key: (typeof FILTER_KEYS)[number]) => (value: string) => dispatch({ type: 'filter', key, value });
  const paymentModes = paymentModesFor(register);
  const entryByOptions = (data?.entryByOptions ?? []).map((person) => ({ value: person.id, label: person.name }));
  if (query.filters.entryById && !entryByOptions.some((option) => option.value === query.filters.entryById)) {
    entryByOptions.push({ value: query.filters.entryById, label: 'Selected person' });
  }

  const billCell = (row: SalesRegisterRow) => {
    const href = openHref(row, returnTo);
    const label = row.billNo ?? <Badge variant="warning" className={badgeText}>Draft</Badge>;
    const linkClass =
      'whitespace-nowrap rounded-sm text-left font-semibold text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';
    const stop = (event: MouseEvent) => event.stopPropagation();
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {href ? (
          <Link href={href} onClick={stop} aria-label={`Open ${billName(row)}`} className={linkClass}>{label}</Link>
        ) : (
          <button type="button" onClick={(event) => { stop(event); openRow(row); }} aria-label={`Open ${billName(row)}`} className={linkClass}>
            {label}
          </button>
        )}
        {row.state === 'DRAFT' && row.reservedNo && (
          <span className="text-xs text-muted-foreground">{row.reservedNo} not final</span>
        )}
        {row.source === 'COUNTER_SALE' && <Badge variant="info" className={badgeText}>Counter sale</Badge>}
        {row.state === 'CANCELLED' && <Badge variant="danger" className={badgeText}>Cancelled</Badge>}
      </div>
    );
  };

  const columns: Column[] = [
    { key: 'billNo', label: 'Bill No', sort: 'billNo', className: cn('w-[1%] whitespace-normal', registerStickyCellClass), cell: billCell },
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
  ];

  const footerSummaryText = failed
    ? 'Total not available'
    : data
      ? footerSummary(register, query, data.totals)
      : <Skeleton className="h-6 w-64" />;
  const footerNote = failed ? `Could not load ${copy.name}. Retry to see the latest total.` : data ? excludedNote(data.totals.excluded) : '';

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <FilterBar
        count={barCount}
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
        <MoreFilters count={moreCount}>
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
        {filtered && <ClearFilters onClear={clearAll} />}
      </FilterBar>

      {failed && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive-border bg-destructive-soft px-4 py-3 text-base text-destructive-text">
          <span>Could not load {copy.name}. {load.error}</span>
          <Button variant="outline" onClick={retry}>Retry</Button>
        </div>
      )}

      <div
        aria-busy={load.status === 'loading'}
        inert={failed || undefined}
        className={cn('transition-opacity', load.status === 'loading' && data && 'opacity-60', failed && data && 'opacity-30')}
      >
        {firstLoad && <span role="status" className="sr-only">Loading {copy.name}…</span>}
        <RegisterTable label={copy.table} containerRef={tableRef}>
          <TableHeader className="static! z-auto! bg-transparent!">
            <TableRow className="hover:bg-transparent">
              {columns.map((column) =>
                column.sort ? (
                  <SortableHead
                    key={column.key}
                    label={column.label}
                    align={column.align}
                    active={query.sortBy === column.sort}
                    direction={query.sortDir}
                    onSort={() => dispatch({ type: 'sort', key: column.sort! })}
                  />
                ) : (
                  <RegisterHead key={column.key} align={column.align}>{column.label}</RegisterHead>
                ),
              )}
              <RegisterHead align="right"><span className="sr-only">Actions</span></RegisterHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {firstLoad &&
              Array.from({ length: 6 }, (_, i) => (
                <TableRow key={i} className="h-[52px]">
                  {Array.from({ length: columns.length + 1 }, (_, j) => (
                    <TableCell key={j} className={registerCellClass}><Skeleton className="h-5 w-full min-w-16" /></TableCell>
                  ))}
                </TableRow>
              ))}
            {data && rows.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length + 1} className="whitespace-normal">
                  <EmptyState
                    title={`No ${copy.name} ${searching ? 'match your search' : 'in this period'}`}
                    description={`Nothing recorded between ${formatDisplayDay(query.from)} and ${formatDisplayDay(query.to)}${searching ? ' with these filters' : ''}.`}
                    action={
                      filtered ? (
                        <Button variant="outline" onClick={clearAll}>Clear filters</Button>
                      ) : (
                        <Button onClick={startNew}><Plus aria-hidden="true" /> {copy.newLabel}</Button>
                      )
                    }
                  />
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => {
              const whatsapp = whatsappAction(row, clinic?.name ?? '');
              const name = billName(row);
              return (
                <TableRow key={row.id} className="group h-[52px] cursor-pointer" onClick={() => openRow(row)}>
                  {columns.map((column) => (
                    <TableCell key={column.key} className={cn(registerCellClass, column.align === 'right' && 'text-right', column.className)}>
                      {column.cell(row)}
                    </TableCell>
                  ))}
                  <TableCell className={cn(registerCellClass, 'w-[1%] py-1! pl-1! text-right')} onClick={(event: MouseEvent) => event.stopPropagation()}>
                    <div className="inline-flex">
                      <RowAction
                        icon={Printer}
                        label={`Print ${name}`}
                        hint="Print"
                        reason={printBlockedReason(row)}
                        onClick={() => void printRow(row, clinic)}
                      />
                      <RowAction
                        icon={MessageCircle}
                        label={`Send ${name} on WhatsApp`}
                        hint="Send on WhatsApp"
                        reason={'reason' in whatsapp ? whatsapp.reason : null}
                        href={'href' in whatsapp ? whatsapp.href : undefined}
                        className="text-success-text"
                      />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </RegisterTable>
      </div>

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
