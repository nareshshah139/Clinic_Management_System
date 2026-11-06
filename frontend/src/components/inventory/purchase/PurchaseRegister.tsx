'use client';

import { useCallback, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { ChevronDown, FileDown, Plus, Receipt, Truck, Wallet } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { displayCalendarDate } from '@/lib/date-display';
import { formatDisplayDay } from '@/lib/date-ranges';
import { formatRupees } from '@/lib/pharmacy-invoice-print';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { requestKey } from '@/components/inventory/workspace-model';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { ToastAction } from '@/components/ui/toast';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { countFilters, errorMessage, isRangeDefault, shortName } from '@/components/register/register-query';
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
import { MarkPaidDialog } from './MarkPaidDialog';
import {
  FILTER_KEYS,
  INVOICE_STATES,
  INVOICE_STATE_LABELS,
  MORE_FILTERS,
  PAYMENT_FILTERS,
  PAYMENT_FILTER_LABELS,
  PURCHASE_QUERY,
  PURCHASE_SOURCES,
  SEARCH_FIELD_OPTIONS,
  SOURCE_LABELS,
  UNDO_REASON,
  canMarkPaid,
  excludedNote,
  exportRequest,
  footerSummary,
  requestParams,
  type FilterKey,
  type PurchaseQuery,
  type PurchaseRegisterResponse,
  type PurchaseRegisterRow,
  type RecordedPayment,
  type SortKey,
} from './purchase-register-model';

const badgeText = 'whitespace-nowrap px-1.5 py-0.5 text-xs font-semibold';

type Column = { key: string; label: string; sort?: SortKey; align?: 'right'; className?: string; cell: (row: PurchaseRegisterRow) => ReactNode };

function PaymentBadge({ row }: { row: PurchaseRegisterRow }) {
  const { state, outstanding, overdueDays } = row.payment;
  const due = formatRupees(outstanding);
  switch (state) {
    case 'PAID':
      return <Badge variant="success" className={badgeText}>Paid</Badge>;
    case 'DUE':
      return <Badge variant="danger" className={badgeText}>Due {due}</Badge>;
    case 'OVERDUE':
      return (
        <Badge variant="destructive" className={cn(badgeText, 'bg-destructive-text text-white dark:bg-destructive')}>
          Overdue {due} · {overdueDays}d
        </Badge>
      );
    case 'PARTIAL':
      return (
        <span className="inline-flex flex-wrap items-center gap-x-1.5">
          <Badge variant="warning" className={badgeText}>{due} due</Badge>
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            part paid{overdueDays > 0 ? ` · ${overdueDays}d late` : ''}
          </span>
        </span>
      );
    case 'NOT_POSTED':
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="rounded-full focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
              <Badge variant="neutral" className={badgeText}>
                Not posted<span className="sr-only">. {INVOICE_STATE_LABELS[row.invoiceState]}. Post stock before paying</span>
              </Badge>
            </span>
          </TooltipTrigger>
          <TooltipContent>{INVOICE_STATE_LABELS[row.invoiceState]} · Post stock before paying</TooltipContent>
        </Tooltip>
      );
    case 'CANCELLED':
      return <Badge variant="neutral" className={cn(badgeText, 'line-through')}>Cancelled</Badge>;
  }
}

/**
 * @cc [owner:nareshshah139,label:product;target] purchase-register-complete
 * The purchase register MUST allow retrieval of every authorized saved invoice and unfinished
 * upload, including records beyond the recent-preview limit, with status and source retained.
 * Acceptance: INV-18. Validation and open gaps:
 * docs/qa/inventory-workflow-contract-review.md. This is a target obligation, not a pass claim.
 */
export function PurchaseRegister({
  searchParams,
  onParamsChange,
  onOpen,
  onNew,
  onLedger,
  onSuppliers,
}: {
  searchParams: Pick<URLSearchParams, 'get'>;
  onParamsChange: (params: URLSearchParams) => void;
  onOpen: (invoiceId: string) => void;
  onNew: () => void;
  onLedger: () => void;
  onSuppliers: () => void;
}) {
  const searchRef = useRef<HTMLInputElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const settleAnchor = useRef<HTMLButtonElement | null>(null);
  const [settling, setSettling] = useState<PurchaseRegisterRow | null>(null);
  const fetchPage = useCallback(
    (query: PurchaseQuery) => apiClient.get<PurchaseRegisterResponse>('/pharmacy/purchase-register', requestParams(query)),
    [],
  );
  const { today, query, dispatch, draft, setDraft, clear, load, retry } = useRegisterQuery({
    config: PURCHASE_QUERY,
    searchParams,
    onParamsChange,
    fetchPage,
  });

  const data = load.data;
  const rows = data?.rows ?? [];
  const canSettle = data?.canSettle ?? false;
  const firstLoad = !data && load.status === 'loading';
  const failed = load.status === 'error';
  const searching = query.q.trim() !== '' || draft.trim() !== '' || countFilters(query, FILTER_KEYS) > 0;
  const rangeChanged = !isRangeDefault(query, today);
  const filtered = searching || rangeChanged;
  const exported = exportRequest(query);

  const clearAll = () => {
    clear();
    searchRef.current?.focus();
  };
  const goToPage = (page: number) => {
    dispatch({ type: 'page', page });
    tableRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  };
  const setFilter = (key: FilterKey) => (value: string) => dispatch({ type: 'filter', key, value });

  const undo = async (payment: RecordedPayment, row: PurchaseRegisterRow, key = requestKey()) => {
    try {
      await apiClient.post(
        `/pharmacy/purchase-ledger/payments/${encodeURIComponent(payment.id)}/reverse`,
        { requestKey: key, expectedUpdatedAt: payment.updatedAt, reason: UNDO_REASON },
        { idempotencyKey: key },
      );
      toast({ title: 'Payment undone', description: `Bill ${row.billNo} is due again.` });
      retry();
    } catch (failure) {
      toast({
        variant: 'destructive',
        title: 'Could not undo the payment',
        description: `${errorMessage(failure)} You can reverse it from Payments & dues.`,
        action: (
          <ToastAction altText="Try undo again" onClick={() => void undo(payment, row, key)}>
            Try again
          </ToastAction>
        ),
      });
    }
  };

  const paid = (payment: RecordedPayment, row: PurchaseRegisterRow) => {
    setSettling(null);
    retry();
    toast({
      title: 'Payment recorded',
      description: `${formatRupees(row.payment.outstanding)} to ${row.distributor.name} for bill ${row.billNo}.`,
      duration: 10000,
      action: (
        <ToastAction altText="Undo payment" onClick={() => void undo(payment, row)}>
          Undo
        </ToastAction>
      ),
    });
  };

  const entryByOptions = (data?.entryByOptions ?? []).map((person) => ({ value: person.id, label: person.name }));
  if (query.filters.entryById && !entryByOptions.some((option) => option.value === query.filters.entryById)) {
    entryByOptions.push({ value: query.filters.entryById, label: 'Selected person' });
  }
  const distributorOptions = (data?.distributorOptions ?? []).map((d) => ({ value: d.gstin, label: d.name }));
  if (query.filters.distributorGstin && !distributorOptions.some((option) => option.value === query.filters.distributorGstin)) {
    distributorOptions.push({ value: query.filters.distributorGstin, label: query.filters.distributorGstin });
  }

  const stop = (event: MouseEvent) => event.stopPropagation();
  const linkClass =
    'whitespace-nowrap rounded-sm text-left font-semibold text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';

  const paymentCell = (row: PurchaseRegisterRow) => (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1" onClick={stop}>
      <PaymentBadge row={row} />
      {canMarkPaid(row, canSettle) && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 px-2.5 text-sm"
          aria-label={`Mark bill ${row.billNo} paid`}
          aria-haspopup="dialog"
          onClick={(event) => {
            settleAnchor.current = event.currentTarget;
            setSettling(row);
          }}
        >
          Mark paid
        </Button>
      )}
    </div>
  );

  const columns: Column[] = [
    { key: 'srNo', label: 'Sr No', sort: 'srNo', className: cn('w-[1%] tabular-nums', registerStickyCellClass), cell: (row) => row.srNo },
    {
      key: 'billNo',
      label: 'Bill No',
      sort: 'billNo',
      className: 'w-[1%]',
      cell: (row) => (
        <button type="button" onClick={(event) => { stop(event); onOpen(row.id); }} aria-label={`Open bill ${row.billNo}`} className={linkClass}>
          {row.billNo}
        </button>
      ),
    },
    { key: 'entryAt', label: 'Entry Date', sort: 'entryAt', className: 'w-[1%]', cell: (row) => <RegisterDateTime value={row.entryAt} today={today} /> },
    { key: 'billDate', label: 'Bill Date', sort: 'billDate', className: 'w-[1%] whitespace-nowrap', cell: (row) => displayCalendarDate(row.billDate) },
    { key: 'entryBy', label: 'Entry By', className: 'w-[1%] whitespace-nowrap', cell: (row) => (row.entryBy ? <span title={row.entryBy.name}>{shortName(row.entryBy.name)}</span> : '—') },
    {
      key: 'distributor',
      label: 'Distributor',
      sort: 'distributor',
      className: 'min-w-[9rem] whitespace-normal leading-snug',
      cell: (row) => (
        <div title={row.distributor.gstin}>
          <div className="font-medium [overflow-wrap:anywhere]">{row.distributor.name}</div>
          <div className="hidden whitespace-nowrap font-mono text-sm text-muted-foreground @min-[68rem]:block">{row.distributor.gstin}</div>
        </div>
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
    { key: 'payment', label: 'Payment', sort: 'outstanding', className: 'w-[1%] min-w-[11rem] whitespace-normal', cell: paymentCell },
  ];

  const footerSummaryText = failed ? 'Total not available' : data ? footerSummary(data.totals) : <Skeleton className="h-6 w-72" />;
  const footerNote = failed ? 'Could not load purchase bills. Retry to see the latest totals.' : data ? excludedNote(data.totals.excluded) : '';

  return (
    <section aria-labelledby="purchase-register-title" className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="purchase-register-title" className="text-xl font-semibold">Purchase bills</h2>
        <div className="flex items-center gap-2">
          <Button className="h-10 text-sm" onClick={onNew}>
            <Plus aria-hidden="true" /> New purchase
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-10 text-sm">
                More <ChevronDown aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuItem onSelect={() => window.open(exported.href, '_blank')} className="flex-col items-start gap-0.5">
                <span className="flex items-center gap-2"><FileDown aria-hidden="true" /> Export to Excel</span>
                {exported.ignored.length > 0 && (
                  <span className="text-xs text-muted-foreground">Without the {exported.ignored.join(' and ')} filter</span>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onLedger}>
                <Wallet aria-hidden="true" /> Payments &amp; dues
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onSuppliers}>
                <Truck aria-hidden="true" /> Suppliers
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <FilterBar
        count={countFilters(query, FILTER_KEYS) + (rangeChanged ? 1 : 0)}
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
        <MoreFilters count={countFilters(query, MORE_FILTERS)}>
          <FilterSelect label="Distributor" allLabel="All" value={query.filters.distributorGstin} options={distributorOptions} onChange={setFilter('distributorGstin')} />
          <FilterSelect
            label="Bill status"
            allLabel="All"
            value={query.filters.invoiceState}
            options={INVOICE_STATES.map((value) => ({ value, label: INVOICE_STATE_LABELS[value] }))}
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
        {filtered && <ClearFilters onClear={clearAll} />}
      </FilterBar>

      {failed && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive-border bg-destructive-soft px-4 py-3 text-base text-destructive-text">
          <span>Could not load purchase bills. {load.error}</span>
          <Button variant="outline" onClick={retry}>Retry</Button>
        </div>
      )}

      <div
        aria-busy={load.status === 'loading'}
        inert={failed || undefined}
        className={cn('transition-opacity', load.status === 'loading' && data && 'opacity-60', failed && data && 'opacity-30')}
      >
        {firstLoad && <span role="status" className="sr-only">Loading purchase bills…</span>}
        <RegisterTable label="Purchase bills" containerRef={tableRef}>
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {firstLoad &&
              Array.from({ length: 6 }, (_, i) => (
                <TableRow key={i} className="h-[52px]">
                  {columns.map((column) => (
                    <TableCell key={column.key} className={registerCellClass}><Skeleton className="h-5 w-full min-w-12" /></TableCell>
                  ))}
                </TableRow>
              ))}
            {data && rows.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className="whitespace-normal">
                  <EmptyState
                    icon={Receipt}
                    title={`No purchase bills ${searching ? 'match your search' : 'in this period'}`}
                    description={`Nothing entered with a bill date between ${formatDisplayDay(query.from)} and ${formatDisplayDay(query.to)}${searching ? ' with these filters' : ''}.`}
                    action={
                      filtered ? (
                        <Button variant="outline" onClick={clearAll}>Clear filters</Button>
                      ) : (
                        <Button onClick={onNew}><Plus aria-hidden="true" /> New purchase</Button>
                      )
                    }
                  />
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => (
              <TableRow key={row.id} className="group h-[52px] cursor-pointer" onClick={() => onOpen(row.id)}>
                {columns.map((column) => (
                  <TableCell key={column.key} className={cn(registerCellClass, column.align === 'right' && 'text-right', column.className)}>
                    {column.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </RegisterTable>
      </div>

      <RegisterFooter
        summary={footerSummaryText}
        note={footerNote}
        page={query.page}
        limit={data?.limit ?? 50}
        total={failed ? 0 : data?.total ?? 0}
        unit="bills"
        label="Purchase bill pages"
        onPage={goToPage}
      />

      {settling && (
        <MarkPaidDialog row={settling} today={today} anchorRef={settleAnchor} onClose={() => setSettling(null)} onPaid={paid} />
      )}
    </section>
  );
}
