'use client';

import { useCallback, useState, type MouseEvent } from 'react';
import { Ban, Download, IndianRupee, Printer } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatDisplayDay } from '@/lib/date-ranges';
import { rupee } from '@/components/appointments/appointment-billing-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useRegisterQuery } from '@/components/register/useRegisterQuery';
import { RegisterDateTime, RegisterDenied, RegisterGrid, type RegisterColumn } from '@/components/register/RegisterGrid';
import { ClearFilters, DateRangeFilter, FilterBar, FilterSelect, RegisterSearch } from '@/components/register/RegisterFilters';
import { RegisterFooter } from '@/components/register/RegisterFooter';
import { RowAction } from '@/components/register/RowAction';
import { ClinicBillDialog, useVoidBill } from './ClinicBillDialog';
import { useClinicReceipt } from './ReceiptButtons';
import {
  BILL_QUERY,
  KIND_LABEL,
  SEARCH_FIELD_OPTIONS,
  STATUS_FILTER_OPTIONS,
  STATUS_VIEW,
  footerNote,
  footerSummary,
  requestParams,
  voidBlockedReason,
  type BillQuery,
  type ClinicBillActions,
  type ClinicBillRow,
  type SortKey,
} from './clinic-bill-model';

const NO_ACTIONS: ClinicBillActions = { collect: false, void: false, refund: false };
const quietAction = 'text-muted-foreground group-hover:text-foreground group-focus-within:text-foreground';
const linkClass =
  'whitespace-nowrap rounded-sm text-left font-semibold text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';

function StatusCell({ row }: { row: ClinicBillRow }) {
  const view = STATUS_VIEW[row.status];
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      <Badge variant={view.variant} className="px-1.5 py-0 text-xs">{view.label}</Badge>
      {row.refunded > 0 && row.status !== 'REFUNDED' && <span className="whitespace-nowrap text-xs">Refunded {rupee(row.refunded)}</span>}
    </div>
  );
}

/**
 * @cc [owner:nareshshah139,label:product] clinic-bill-register-page
 * The billing page MUST list clinic bills for the chosen period with their totals, filter them by
 * status and search, and offer each row's actions only where the server's actions allow them. A
 * viewer the register route refuses MUST see an access message, never a broken page.
 */
export function ClinicBillRegister({
  searchParams,
  onParamsChange,
}: {
  searchParams: Pick<URLSearchParams, 'get' | 'toString'>;
  onParamsChange: (params: URLSearchParams) => void;
}) {
  const [open, setOpen] = useState<{ id: string; collecting: boolean } | null>(null);
  const fetchPage = useCallback((query: BillQuery) => apiClient.getClinicBillRegister(requestParams(query)), []);
  const { today, query, dispatch, draft, setDraft, load, reload, view, searchRef, tableRef, clearAll, goToPage } = useRegisterQuery({
    config: BILL_QUERY,
    more: [],
    searchParams,
    onParamsChange,
    fetchPage,
  });
  const receipt = useClinicReceipt();
  const [voidBill, voidDialog] = useVoidBill();
  const data = load.data;
  const actions = data?.actions ?? NO_ACTIONS;
  const failed = load.status === 'error';

  const actionsCell = (row: ClinicBillRow) => {
    const name = `bill ${row.billNo} for ${row.patient.name}`;
    return (
      <div className="inline-flex">
        {actions.collect && row.due > 0 && (
          <RowAction
            icon={IndianRupee}
            label={`Collect payment on ${name}`}
            hint={`Collect ${rupee(row.due)}`}
            onClick={() => setOpen({ id: row.id, collecting: true })}
            className="text-destructive-text"
          />
        )}
        <RowAction icon={Printer} label={`Print receipt for ${name}`} hint="Print receipt" reason={receipt.busy ? 'Preparing a receipt…' : null} onClick={() => void receipt.print(row.id)} className={quietAction} />
        <RowAction icon={Download} label={`Download receipt PDF for ${name}`} hint="Download PDF" reason={receipt.busy ? 'Preparing a receipt…' : null} onClick={() => void receipt.download(row.id)} className={quietAction} />
        {actions.void && row.status !== 'CANCELLED' && (
          <RowAction
            icon={Ban}
            label={`Void ${name}`}
            hint="Void bill"
            reason={voidBlockedReason(row)}
            onClick={async () => {
              if (await voidBill(row)) await reload();
            }}
            className="text-muted-foreground group-hover:text-destructive-text group-focus-within:text-destructive-text"
          />
        )}
      </div>
    );
  };

  const stop = (event: MouseEvent) => event.stopPropagation();
  const billLink = (row: ClinicBillRow) => (
    <button type="button" onClick={(event) => { stop(event); setOpen({ id: row.id, collecting: false }); }} aria-label={`Open bill ${row.billNo}`} className={linkClass}>
      {row.billNo}
    </button>
  );

  const columns: RegisterColumn<ClinicBillRow, SortKey>[] = [
    { key: 'billedAt', label: 'Date', sort: 'billedAt', className: 'w-[1%]', cell: (row) => <RegisterDateTime value={row.billedAt} today={today} /> },
    { key: 'billNo', label: 'Bill No', pinned: true, className: 'w-[1%]', cell: billLink },
    { key: 'patient', label: 'Patient', sort: 'patient', className: 'min-w-[8rem] whitespace-normal font-medium leading-snug', cell: (row) => row.patient.name },
    { key: 'doctor', label: 'Doctor', className: 'whitespace-normal', cell: (row) => row.doctor?.name ?? '—' },
    { key: 'kind', label: 'Type', className: 'w-[1%]', cell: (row) => (row.kind ? KIND_LABEL[row.kind] : '—') },
    {
      key: 'amount',
      label: 'Amount',
      sort: 'amount',
      align: 'right',
      className: 'w-[1%]',
      cell: (row) => <span className={cn('font-semibold', row.status === 'CANCELLED' && 'line-through')}>{rupee(row.amount)}</span>,
    },
    { key: 'paid', label: 'Paid', align: 'right', className: 'w-[1%]', cell: (row) => rupee(row.paid) },
    { key: 'due', label: 'Due', sort: 'due', align: 'right', className: 'w-[1%]', cell: (row) => (row.due > 0 ? <span className="font-semibold text-destructive-text">{rupee(row.due)}</span> : '—') },
    { key: 'status', label: 'Status', className: 'w-[1%]', cell: (row) => <StatusCell row={row} /> },
    { key: 'actions', label: 'Actions', hideLabel: true, align: 'right', interactive: true, className: 'w-[1%] py-1! pl-1!', cell: actionsCell },
  ];

  const card = (row: ClinicBillRow) => (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate font-medium">{row.patient.name}</span>
        <span className={cn('whitespace-nowrap font-semibold', row.status === 'CANCELLED' && 'line-through')}>{rupee(row.amount)}</span>
      </div>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="flex min-w-0 items-center gap-1">
          {billLink(row)}
          <span aria-hidden="true">·</span>
          <RegisterDateTime value={row.billedAt} today={today} />
        </span>
        {row.due > 0 && <span className="whitespace-nowrap font-semibold text-destructive-text">{rupee(row.due)} due</span>}
      </div>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="min-w-0 truncate">{[row.doctor?.name, row.kind && KIND_LABEL[row.kind]].filter(Boolean).join(' · ') || '—'}</span>
        <StatusCell row={row} />
      </div>
      <div className="-mr-2 flex justify-end" onClick={stop}>{actionsCell(row)}</div>
    </div>
  );

  if (load.status === 'denied') return <RegisterDenied noun="clinic bills" />;

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
        <FilterSelect label="Status" allLabel="All" value={query.filters.status} options={STATUS_FILTER_OPTIONS} onChange={(value) => dispatch({ type: 'filter', key: 'status', value })} />
        {view.filtered && <ClearFilters onClear={clearAll} />}
      </FilterBar>

      <RegisterGrid
        label="Clinic bills"
        noun="clinic bills"
        columns={columns}
        rows={data?.rows ?? []}
        load={load}
        sort={{ by: query.sortBy, dir: query.sortDir }}
        onSort={(key) => dispatch({ type: 'sort', key })}
        onRowClick={(row) => setOpen({ id: row.id, collecting: false })}
        onRetry={() => void reload()}
        containerRef={tableRef}
        compact
        card={card}
        empty={
          <EmptyState
            title={`No clinic bills ${view.searching ? 'match your search' : 'in this period'}`}
            description={`Nothing billed between ${formatDisplayDay(query.from)} and ${formatDisplayDay(query.to)}${view.searching ? ' with these filters' : ''}. Bills are created from an appointment on the calendar.`}
            action={view.filtered ? <Button variant="outline" onClick={clearAll}>Clear filters</Button> : undefined}
          />
        }
      />

      <RegisterFooter
        summary={failed ? 'Totals not available' : data ? footerSummary(data.totals) : <Skeleton className="h-6 w-64" />}
        note={failed ? 'Could not load clinic bills. Retry to see the latest totals.' : data ? footerNote(data.totals) : ''}
        page={query.page}
        limit={data?.limit ?? 50}
        total={failed ? 0 : data?.total ?? 0}
        unit="bill"
        label="Clinic bill pages"
        busy={load.status === 'loading' && !!data}
        onPage={goToPage}
      />

      {open && (
        <ClinicBillDialog
          billId={open.id}
          actions={actions}
          collecting={open.collecting}
          onClose={() => setOpen(null)}
          onChanged={() => void reload()}
        />
      )}
      {voidDialog}
    </div>
  );
}
