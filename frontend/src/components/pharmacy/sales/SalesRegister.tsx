'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useReducer, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, MessageCircle, Plus, Printer, SlidersHorizontal, X } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { displayCalendarDate, displayClinicDateTime } from '@/lib/date-display';
import { renderPharmacyInvoiceHtml } from '@/lib/pharmacy-invoice-print';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { fmtMoney, requestKey } from '@/components/inventory/workspace-model';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  PAGE_SIZE,
  PAYMENT_MODE_BADGES,
  PAYMENT_MODE_LABELS,
  REGISTER_COPY,
  SEARCH_FIELDS,
  SOURCE_LABELS,
  STATE_LABELS,
  clinicToday,
  hasActiveFilters,
  moreFilterCount,
  parseState,
  periodPresets,
  registerReducer,
  requestParams,
  stateParams,
  whatsappAction,
  workspaceDocumentHref,
  type PaymentMode,
  type Register,
  type SalesRegisterResponse,
  type SalesRegisterRow,
  type SearchField,
  type SortKey,
} from './sales-register-model';

const selectClass =
  'h-10 rounded-md border border-input bg-background px-3 text-base text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

const COLUMNS: { key: SortKey; label: (register: Register) => string; numeric?: boolean }[] = [
  { key: 'billNo', label: () => 'Bill No' },
  { key: 'entryAt', label: () => 'Entry Date' },
  { key: 'billDate', label: () => 'Bill Date' },
  { key: 'entryBy', label: () => 'Entry By' },
  { key: 'patient', label: () => 'Patient' },
  { key: 'mobile', label: () => 'Mobile' },
  { key: 'amount', label: (register) => REGISTER_COPY[register].amount, numeric: true },
];

type Load = { status: 'loading' | 'ready' | 'error'; data: SalesRegisterResponse | null; error: string };

async function showInvoice(id: string, print: boolean) {
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
    if (print) {
      view.focus();
      view.print();
    }
  } catch {
    view.close();
    toast({ variant: 'destructive', title: 'Could not open the bill', description: 'Check your connection and try again.' });
  }
}

function RowAction({ hint, children }: { hint: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );
}

function PaymentBadges({ modes }: { modes: PaymentMode[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {modes.map((mode) => (
        <Badge key={mode} variant="neutral" className={cn('px-2.5 py-0.5 text-sm font-semibold', PAYMENT_MODE_BADGES[mode])}>
          {PAYMENT_MODE_LABELS[mode]}
        </Badge>
      ))}
    </div>
  );
}

export function SalesRegister({ register, searchParams, onParamsChange }: {
  register: Register;
  searchParams: Pick<URLSearchParams, 'get'>;
  onParamsChange: (params: URLSearchParams) => void;
}) {
  const router = useRouter();
  const copy = REGISTER_COPY[register];
  const [today] = useState(() => clinicToday());
  const [state, dispatch] = useReducer(registerReducer, undefined, () => parseState(searchParams, today));
  const [draft, setDraft] = useState(state.q);
  const [moreOpen, setMoreOpen] = useState(() => moreFilterCount(state) > 0);
  const [load, setLoad] = useState<Load>({ status: 'loading', data: null, error: '' });
  const [attempt, setAttempt] = useState(0);
  const latest = useRef(0);
  const morePanelId = useId();
  const searchId = useId();
  const onParamsChangeRef = useRef(onParamsChange);
  onParamsChangeRef.current = onParamsChange;

  useEffect(() => {
    if (draft === state.q) return;
    const timer = setTimeout(() => dispatch({ type: 'search', q: draft }), 300);
    return () => clearTimeout(timer);
  }, [draft, state.q]);

  useEffect(() => {
    onParamsChangeRef.current(stateParams(state, today));
  }, [state, today]);

  useEffect(() => {
    const request = ++latest.current;
    setLoad((current) => ({ ...current, status: 'loading', error: '' }));
    apiClient
      .get<SalesRegisterResponse>('/pharmacy/sales-register', requestParams(register, state))
      .then((data) => {
        if (request !== latest.current) return;
        if (!data.rows.length && data.total > 0 && state.page > 1) dispatch({ type: 'page', page: 1 });
        else setLoad({ status: 'ready', data, error: '' });
      })
      .catch((error: { body?: { message?: string }; message?: string }) => {
        if (request === latest.current)
          setLoad((current) => ({ status: 'error', data: current.data, error: error?.body?.message || error?.message || 'Something went wrong' }));
      });
  }, [register, state, attempt]);

  const clearAll = () => {
    setDraft('');
    dispatch({ type: 'clear', today });
  };

  const presets = useMemo(() => periodPresets(today), [today]);
  const activePreset = presets.find((p) => p.range.from === state.from && p.range.to === state.to)?.id ?? 'custom';
  const filtersActive = hasActiveFilters(state, today) || draft.trim() !== '';
  const moreCount = moreFilterCount(state);
  const data = load.data;
  const rows = data?.rows ?? [];
  const firstLoad = load.status === 'loading' && !data;
  const rangeText = `${displayCalendarDate(state.from)} – ${displayCalendarDate(state.to)}`;
  const searchField = SEARCH_FIELDS.find((f) => f.value === state.field)!;

  const startNew = () => {
    if (register === 'sales') router.push('/dashboard/pharmacy?section=billing');
    else router.push(`/dashboard/inventory?area=sales&view=SALES_RETURN&new=${requestKey()}`);
  };

  const openRow = (row: SalesRegisterRow) => {
    if (row.source === 'PHARMACY_BILL') void showInvoice(row.recordId, false);
    else router.push(workspaceDocumentHref(row));
  };

  const billLabel = (row: SalesRegisterRow) => row.billNo ?? `draft ${copy.one} for ${row.patientName ?? 'walk-in customer'}`;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <Button onClick={startNew} aria-label={copy.newLabel} className="h-10 text-base">
            <Plus aria-hidden="true" /> New
          </Button>

          <div className="flex min-w-0 flex-[1_1_20rem] items-end gap-2">
            <label className="flex flex-col gap-1 text-sm font-medium">
              Search by
              <select
                className={selectClass}
                value={state.field}
                onChange={(e) => dispatch({ type: 'search', field: e.target.value as SearchField })}
              >
                {SEARCH_FIELDS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </label>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <label htmlFor={searchId} className="sr-only">{searchField.placeholder}</label>
              <Input
                id={searchId}
                type="search"
                inputMode={state.field === 'mobile' ? 'tel' : 'search'}
                value={draft}
                placeholder={searchField.placeholder}
                onChange={(e) => setDraft(e.target.value)}
                className="h-10 text-base md:text-base"
              />
            </div>
          </div>

          <label className="flex flex-col gap-1 text-sm font-medium">
            Period
            <select
              className={selectClass}
              value={activePreset}
              onChange={(e) => {
                const preset = presets.find((p) => p.id === e.target.value);
                if (preset) dispatch({ type: 'range', ...preset.range });
              }}
            >
              {presets.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
              {activePreset === 'custom' && <option value="custom">Custom range</option>}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            From
            <Input
              type="date"
              value={state.from}
              max={state.to}
              onChange={(e) => e.target.value && dispatch({ type: 'range', from: e.target.value, to: e.target.value > state.to ? e.target.value : state.to })}
              className="h-10 w-auto text-base md:text-base"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            To
            <Input
              type="date"
              value={state.to}
              min={state.from}
              onChange={(e) => e.target.value && dispatch({ type: 'range', from: e.target.value < state.from ? e.target.value : state.from, to: e.target.value })}
              className="h-10 w-auto text-base md:text-base"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium">
            {copy.payment} type
            <select
              className={selectClass}
              value={state.paymentMode}
              onChange={(e) => dispatch({ type: 'filter', key: 'paymentMode', value: e.target.value })}
            >
              <option value="">All</option>
              {(Object.keys(PAYMENT_MODE_LABELS) as PaymentMode[]).map((mode) => (
                <option key={mode} value={mode}>{PAYMENT_MODE_LABELS[mode]}</option>
              ))}
            </select>
          </label>

          <Button
            variant="outline"
            className="h-10 text-base"
            aria-expanded={moreOpen}
            aria-controls={morePanelId}
            onClick={() => setMoreOpen((open) => !open)}
          >
            <SlidersHorizontal aria-hidden="true" />
            More filters
            {moreCount > 0 && (
              <>
                <Badge variant="brand" className="ml-1 min-w-6 text-sm">{moreCount}</Badge>
                <span className="sr-only"> active</span>
              </>
            )}
          </Button>
          {filtersActive && (
            <Button variant="ghost" className="h-10 text-base" onClick={clearAll}>
              <X aria-hidden="true" /> Clear all
            </Button>
          )}
        </div>

        {moreOpen && (
          <div id={morePanelId} className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-muted/40 p-3">
            <label className="flex flex-col gap-1 text-sm font-medium">
              State
              <select className={selectClass} value={state.state} onChange={(e) => dispatch({ type: 'filter', key: 'state', value: e.target.value })}>
                <option value="">All</option>
                {(Object.keys(STATE_LABELS) as (keyof typeof STATE_LABELS)[]).map((s) => (
                  <option key={s} value={s}>{STATE_LABELS[s]}</option>
                ))}
              </select>
            </label>
            {register === 'sales' && (
              <label className="flex flex-col gap-1 text-sm font-medium">
                Source
                <select className={selectClass} value={state.source} onChange={(e) => dispatch({ type: 'filter', key: 'source', value: e.target.value })}>
                  <option value="">All</option>
                  {Object.entries(SOURCE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex flex-col gap-1 text-sm font-medium">
              Entry by
              <select className={selectClass} value={state.entryById} onChange={(e) => dispatch({ type: 'filter', key: 'entryById', value: e.target.value })}>
                <option value="">Anyone</option>
                {(data?.entryByOptions ?? []).map((person) => (
                  <option key={person.id} value={person.id}>{person.name}</option>
                ))}
                {state.entryById && !data?.entryByOptions.some((p) => p.id === state.entryById) && (
                  <option value={state.entryById}>Selected person</option>
                )}
              </select>
            </label>
          </div>
        )}

        {load.status === 'error' && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive-border bg-destructive-soft px-4 py-3 text-base text-destructive-text">
            <span>Could not load {copy.name}. {load.error}</span>
            <Button variant="outline" onClick={() => setAttempt((n) => n + 1)}>Retry</Button>
          </div>
        )}

        <div aria-busy={load.status === 'loading'} className={cn('transition-opacity', load.status === 'loading' && data && 'opacity-60')}>
          {firstLoad && <span role="status" className="sr-only">Loading {copy.name}…</span>}
          <Table className="text-base">
            <TableHeader>
              <TableRow>
                {COLUMNS.map((column, index) => {
                  const active = state.sortBy === column.key;
                  const Arrow = !active ? ArrowUpDown : state.sortDir === 'asc' ? ArrowUp : ArrowDown;
                  return (
                    <TableHead
                      key={column.key}
                      aria-sort={active ? (state.sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      className={cn('h-12 px-2 text-[0.9375rem] font-semibold', column.numeric && 'text-right', index === 0 && 'sticky left-0 z-[1] bg-muted')}
                    >
                      <button
                        type="button"
                        onClick={() => dispatch({ type: 'sort', key: column.key })}
                        className={cn(
                          'inline-flex min-h-10 items-center gap-1.5 rounded-md px-2 hover:bg-background/70 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                          column.numeric && 'flex-row-reverse',
                        )}
                      >
                        {column.label(register)}
                        <Arrow aria-hidden="true" className={cn('size-4', !active && 'text-muted-foreground')} />
                      </button>
                    </TableHead>
                  );
                })}
                <TableHead className="h-12 text-[0.9375rem] font-semibold">{copy.payment}</TableHead>
                <TableHead className="h-12 text-right text-[0.9375rem] font-semibold"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {firstLoad &&
                Array.from({ length: 6 }, (_, i) => (
                  <TableRow key={i} className="h-12">
                    {Array.from({ length: COLUMNS.length + 2 }, (_, j) => (
                      <TableCell key={j}><Skeleton className="h-5 w-full min-w-16" /></TableCell>
                    ))}
                  </TableRow>
                ))}
              {data && rows.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={COLUMNS.length + 2} className="whitespace-normal">
                    <EmptyState
                      title={`No ${copy.name} match your search`}
                      description={`Nothing found for ${rangeText}${filtersActive ? ' with these filters' : ''}.`}
                      action={
                        filtersActive ? (
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
                const whatsapp = whatsappAction(row, data?.clinicName ?? '');
                const printable = row.source === 'PHARMACY_BILL';
                const name = billLabel(row);
                return (
                  <TableRow key={row.id} className="h-12 cursor-pointer" onClick={() => openRow(row)}>
                    <TableCell className="sticky left-0 z-[1] bg-background">
                      <div className="flex flex-col items-start gap-0.5">
                        {row.source === 'PHARMACY_BILL' ? (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openRow(row); }}
                            aria-label={`Open ${name}`}
                            className="rounded-sm font-semibold text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                          >
                            {row.billNo ?? <Badge variant="warning" className="text-sm font-semibold">Draft</Badge>}
                          </button>
                        ) : (
                          <Link
                            href={workspaceDocumentHref(row)}
                            onClick={(e: MouseEvent) => e.stopPropagation()}
                            aria-label={`Open ${name}`}
                            className="rounded-sm font-semibold text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                          >
                            {row.billNo ?? <Badge variant="warning" className="text-sm font-semibold">Draft</Badge>}
                          </Link>
                        )}
                        {row.state === 'CANCELLED' && <Badge variant="danger" className="text-xs">Cancelled</Badge>}
                        {row.source === 'COUNTER_SALE' && <span className="text-sm text-muted-foreground">Counter sale</span>}
                        {row.linkedBillNo && <span className="text-sm text-muted-foreground">Against {row.linkedBillNo}</span>}
                      </div>
                    </TableCell>
                    <TableCell>{displayClinicDateTime(row.entryAt)}</TableCell>
                    <TableCell>{displayCalendarDate(row.billDate)}</TableCell>
                    <TableCell>{row.entryBy?.name ?? '—'}</TableCell>
                    <TableCell className="max-w-64 truncate" title={row.patientName ?? undefined}>{row.patientName ?? '—'}</TableCell>
                    <TableCell>{row.mobile ?? '—'}</TableCell>
                    <TableCell className={cn('text-right font-semibold tabular-nums', row.state !== 'FINAL' && 'text-muted-foreground')}>
                      {fmtMoney(row.amount)}
                    </TableCell>
                    <TableCell><PaymentBadges modes={row.paymentModes} /></TableCell>
                    <TableCell className="text-right" onClick={(e: MouseEvent) => e.stopPropagation()}>
                      <div className="inline-flex gap-1">
                        <RowAction hint={printable ? 'Print' : 'Printing is available for pharmacy bills only'}>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Print ${name}`}
                            aria-disabled={!printable}
                            className={cn('size-10', !printable && 'cursor-not-allowed opacity-50')}
                            onClick={() => printable && void showInvoice(row.recordId, true)}
                          >
                            <Printer aria-hidden="true" className="size-5" />
                          </Button>
                        </RowAction>
                        <RowAction hint={'href' in whatsapp ? 'Send on WhatsApp' : whatsapp.reason}>
                          {'href' in whatsapp ? (
                            <Button asChild variant="ghost" size="icon" className="size-10 text-success-text">
                              <a href={whatsapp.href} target="_blank" rel="noopener noreferrer" aria-label={`Send ${name} on WhatsApp`}>
                                <MessageCircle aria-hidden="true" className="size-5" />
                              </a>
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Send ${name} on WhatsApp`}
                              aria-disabled="true"
                              className="size-10 cursor-not-allowed opacity-50"
                            >
                              <MessageCircle aria-hidden="true" className="size-5" />
                            </Button>
                          )}
                        </RowAction>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div className="sticky bottom-0 z-20 -mx-1 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background px-1 py-3">
          <div role="status" aria-live="polite" className="min-w-0">
            {data ? (
              <>
                <p className="text-lg font-semibold">
                  Total Amount <span className="tabular-nums">{fmtMoney(data.totals.amount)}</span>
                  <span className="font-normal"> · {data.totals.count} {data.totals.count === 1 ? copy.one : copy.many}</span>
                </p>
                {(data.totals.excluded.drafts > 0 || data.totals.excluded.cancelled > 0) && (
                  <p className="text-sm text-muted-foreground">
                    Excludes {[
                      data.totals.excluded.drafts && `${data.totals.excluded.drafts} draft${data.totals.excluded.drafts === 1 ? '' : 's'}`,
                      data.totals.excluded.cancelled && `${data.totals.excluded.cancelled} cancelled`,
                    ].filter(Boolean).join(' and ')}
                  </p>
                )}
              </>
            ) : (
              load.status === 'loading' && <Skeleton className="h-7 w-64" />
            )}
          </div>
          {data && data.total > 0 && (
            <nav aria-label={`${copy.name} pages`} className="flex items-center gap-2">
              <span className="text-base tabular-nums">
                {(data.page - 1) * data.limit + 1}–{Math.min(data.page * data.limit, data.total)} of {data.total}
              </span>
              <Button variant="outline" size="icon" className="size-10" aria-label="Previous page" disabled={state.page <= 1} onClick={() => dispatch({ type: 'page', page: state.page - 1 })}>
                <ChevronLeft aria-hidden="true" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="size-10"
                aria-label="Next page"
                disabled={state.page * PAGE_SIZE >= data.total}
                onClick={() => dispatch({ type: 'page', page: state.page + 1 })}
              >
                <ChevronRight aria-hidden="true" />
              </Button>
            </nav>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
