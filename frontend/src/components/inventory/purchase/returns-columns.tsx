'use client';

import type { MouseEvent, ReactNode } from 'react';
import { Pencil } from 'lucide-react';
import { displayCalendarDate, displayClinicDateTimeCompact } from '@/lib/date-display';
import { formatRupees } from '@/lib/pharmacy-invoice-print';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { shortName, type RegisterColumn } from '@/components/register/RegisterGrid';
import {
  RETURN_REASON_LABELS,
  awaitedDays,
  canCorrectCreditNote,
  canRecordCreditNote,
  canSetOff,
  sourceBills,
  type PurchaseReturnRow,
  type ReturnSortKey,
} from './purchase-returns-model';

const badgeText = 'whitespace-nowrap px-1 py-0 text-xs font-semibold leading-[1.125rem]';
const noteClass = 'whitespace-nowrap text-xs font-medium leading-tight';
const actionClass = 'h-8 max-w-none! whitespace-nowrap! px-1.5 text-sm lg:min-h-8!';
const primaryLinkClass =
  '-my-0.5 whitespace-nowrap rounded-sm py-0.5 text-left font-semibold leading-[1.125rem] text-primary underline decoration-2 underline-offset-4 hover:decoration-[3px] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';
const refClass =
  'whitespace-nowrap rounded-sm text-left text-xs font-medium leading-tight underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';
const compactDay = (day: string, today: string) => (day.endsWith(` ${today.slice(0, 4)}`) ? day.slice(0, -5) : day);
const keepButtonClicks = (event: MouseEvent) => {
  if ((event.target as HTMLElement).closest('button')) event.stopPropagation();
};

function AwaitedBadge({ row, today }: { row: PurchaseReturnRow; today: string }) {
  const days = awaitedDays(row, today);
  return (
    <Badge variant="warning" className={badgeText}>
      Credit note awaited
      {days !== null && (
        <>
          <span aria-hidden="true"> · {days === 0 ? 'today' : `${days}d`}</span>
          <span className="sr-only">{days === 0 ? ', challan sent today' : `, for ${days} ${days === 1 ? 'day' : 'days'} since the challan`}</span>
        </>
      )}
    </Badge>
  );
}

export function ReturnStateBadge({ row, today, inline = false }: { row: PurchaseReturnRow; today: string; inline?: boolean }) {
  switch (row.state) {
    case 'AWAITED':
      return <AwaitedBadge row={row} today={today} />;
    case 'RECEIVED':
    case 'ADJUSTED':
      return (
        <span className={cn('flex', inline ? 'items-center gap-1.5' : 'flex-col items-start')}>
          <Badge variant="info" className={badgeText}>{row.state === 'RECEIVED' ? 'Received' : 'Adjusted'}</Badge>
          <span className={noteClass}>{formatRupees(row.credit?.available ?? 0)} left</span>
        </span>
      );
    case 'USED':
      return <Badge variant="success" className={badgeText}>Fully used</Badge>;
    case 'DRAFT':
      return <Badge variant="neutral" className={badgeText}>Draft</Badge>;
    case 'CANCELLED':
      return <Badge variant="neutral" className={badgeText}>Cancelled</Badge>;
  }
}

export type ReturnAct = 'record' | 'correct' | 'setOff';

type ReturnViewInput = {
  today: string;
  canWrite: boolean;
  actionId: (rowId: string) => string;
  openId: (rowId: string) => string;
  undo: { pending: (rowId: string) => 'ready' | 'undoing' | null; run: (row: PurchaseReturnRow) => void };
  onOpen: (row: PurchaseReturnRow) => void;
  onAct: (act: ReturnAct, row: PurchaseReturnRow, anchor: HTMLButtonElement) => void;
};

const noun = (row: PurchaseReturnRow) => (row.kind === 'CREDIT_NOTE' ? 'credit' : 'return');
const Noun = (row: PurchaseReturnRow) => (row.kind === 'CREDIT_NOTE' ? 'Credit' : 'Return');

export function returnView({ today, canWrite, actionId, openId, undo, onOpen, onAct }: ReturnViewInput) {
  const draft = (row: PurchaseReturnRow) => row.state === 'DRAFT';

  const lead = (row: PurchaseReturnRow): ReactNode => {
    if (canRecordCreditNote(row, canWrite))
      return (
        <button
          id={actionId(row.id)}
          type="button"
          className={primaryLinkClass}
          aria-label={`Record credit note for ${noun(row)} ${row.returnRef}`}
          aria-haspopup="dialog"
          onClick={(event) => onAct('record', row, event.currentTarget)}
        >
          Record credit note
        </button>
      );
    if (draft(row))
      return (
        <button id={openId(row.id)} type="button" className={primaryLinkClass} onClick={() => onOpen(row)}>
          Open draft<span className="sr-only"> {noun(row)} {row.returnRef}</span>
        </button>
      );
    if (row.creditNote) return <span className="whitespace-nowrap font-semibold leading-[1.125rem]">{row.creditNote.number}</span>;
    return (
      <span className="leading-[1.125rem]">
        <span aria-hidden="true">—</span>
        <span className="sr-only">No credit note yet</span>
      </span>
    );
  };

  const reference = (row: PurchaseReturnRow): ReactNode => (
    <span className="flex min-w-0 items-baseline gap-0.5 text-xs font-medium leading-tight tracking-[-0.04em]">
      {draft(row) ? (
        <span className="whitespace-nowrap">{row.returnRef}</span>
      ) : (
        <button id={openId(row.id)} type="button" onClick={() => onOpen(row)} className={refClass}>
          <span className="sr-only">Open {Noun(row)} </span>
          {row.returnRef}
        </button>
      )}
      {row.sourceBillNo && (
        <span className="whitespace-nowrap" title={sourceBills(row.sourceBillNo).count > 1 ? row.sourceBillNo : undefined}>
          <span aria-hidden="true">· </span>
          {sourceBills(row.sourceBillNo).count > 1 ? (
            <>
              <span className="sr-only">against bills {row.sourceBillNo}</span>
              <span aria-hidden="true">{sourceBills(row.sourceBillNo).shown}</span>
            </>
          ) : (
            <>
              <span className="sr-only">against bill </span>
              {row.sourceBillNo}
            </>
          )}
        </span>
      )}
    </span>
  );

  const correct = (row: PurchaseReturnRow): ReactNode =>
    canCorrectCreditNote(row, canWrite) && (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="-my-1.5 size-7 shrink-0 lg:min-h-7!"
        aria-label={`Correct credit note ${row.creditNote!.number}`}
        aria-haspopup="dialog"
        title="Correct the number, date or amount"
        onClick={(event) => onAct('correct', row, event.currentTarget)}
      >
        <Pencil aria-hidden="true" className="size-4" />
      </Button>
    );

  const actions = (row: PurchaseReturnRow): ReactNode => {
    const pending = undo.pending(row.id);
    return (
      <span className="flex items-center gap-1">
        {pending && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 whitespace-nowrap! px-2 text-sm font-semibold underline underline-offset-4 lg:min-h-8!"
            aria-label={`Undo set-off of credit note ${row.creditNote?.number ?? row.returnRef}`}
            disabled={pending === 'undoing'}
            onClick={() => undo.run(row)}
          >
            {pending === 'undoing' ? 'Undoing…' : 'Undo'}
          </Button>
        )}
        {canSetOff(row, canWrite) && (
          <Button
            id={actionId(row.id)}
            type="button"
            variant="outline"
            size="sm"
            className={actionClass}
            aria-label={`Set off credit note ${row.creditNote?.number ?? row.returnRef} against bills`}
            aria-haspopup="dialog"
            onClick={(event) => onAct('setOff', row, event.currentTarget)}
          >
            Set off
          </Button>
        )}
      </span>
    );
  };

  const amount = (row: PurchaseReturnRow) => (
    <span className={cn('whitespace-nowrap font-semibold leading-[1.125rem]', row.state === 'CANCELLED' && 'line-through')}>
      {formatRupees(row.creditNote?.amount ?? row.returnValue)}
    </span>
  );
  const amountNote = (row: PurchaseReturnRow): ReactNode => {
    if (!row.creditNote) return <span className={noteClass}>{noun(row)} value</span>;
    if (Math.abs(row.creditNote.amount - row.returnValue) > 0.01) return <span className={noteClass}>Return {formatRupees(row.returnValue)}</span>;
    return null;
  };

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
        <span className="flex flex-col items-start">
          <span className="flex items-center gap-0.5">
            {lead(row)}
            {correct(row)}
          </span>
          {reference(row)}
        </span>
      ),
    },
    {
      key: 'entryAt',
      label: 'Entry Date',
      sort: 'entryAt',
      className: 'w-[1%] whitespace-nowrap',
      cell: (row) => {
        const [day, time] = displayClinicDateTimeCompact(row.entryAt, today).split(', ');
        return (
          <span className="flex flex-col" title={time ? `${day}, ${time}` : undefined}>
            <span className="leading-[1.125rem]">{day}</span>
            {time && <span className="text-xs font-medium leading-tight @max-[64rem]:sr-only">{time}</span>}
          </span>
        );
      },
    },
    {
      key: 'creditNoteDate',
      label: 'Credit Note Date',
      sort: 'creditNoteDate',
      className: 'w-[1%] min-w-[6.25rem] whitespace-nowrap',
      cell: (row) => (row.creditNote?.date ? compactDay(displayCalendarDate(row.creditNote.date), today) : '—'),
    },
    {
      key: 'entryBy',
      label: 'Entry By',
      className: 'w-[1%] whitespace-nowrap',
      cell: (row) => (row.entryBy ? <span title={row.entryBy.name}>{shortName(row.entryBy.name)}</span> : '—'),
    },
    {
      key: 'distributor',
      label: 'Distributor',
      sort: 'distributor',
      className: 'w-full max-w-0 min-w-[9rem]',
      cell: (row) => (
        <span className="flex min-w-0 flex-col items-start">
          <span title={`${row.distributor.name} · GSTIN ${row.distributor.gstin}`} className="block max-w-full truncate font-medium leading-[1.125rem]">
            {row.distributor.name}
          </span>
          {row.reason && (
            <Badge variant="neutral" className="shrink-0 whitespace-nowrap px-0.5 py-0 text-xs font-medium leading-4 tracking-[-0.03em]">
              {RETURN_REASON_LABELS[row.reason]}
            </Badge>
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
      cell: (row) => (
        <span className="flex flex-col items-end">
          {amount(row)}
          {amountNote(row)}
        </span>
      ),
    },
    {
      key: 'state',
      label: 'Status',
      sort: 'state',
      interactive: true,
      className: 'w-[1%] whitespace-nowrap py-0.5!',
      cell: (row) => (
        <div className="flex items-center justify-between gap-1">
          <ReturnStateBadge row={row} today={today} />
          {actions(row)}
        </div>
      ),
    },
  ];

  const card = (row: PurchaseReturnRow) => (
    <div className="flex flex-col gap-1 text-sm tabular-nums" onClick={keepButtonClicks}>
      <div className="flex items-baseline justify-between gap-3">
        <span title={`${row.distributor.name} · GSTIN ${row.distributor.gstin}`} className="min-w-0 truncate font-medium">
          {row.distributor.name}
        </span>
        {amount(row)}
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 flex-wrap items-center gap-x-1.5">
          {lead(row)}
          {reference(row)}
          {correct(row)}
        </span>
        {amountNote(row)}
      </div>
      <div className="flex min-h-8 items-center justify-between gap-2">
        <ReturnStateBadge row={row} today={today} inline />
        {actions(row)}
      </div>
    </div>
  );

  return { columns, card };
}
