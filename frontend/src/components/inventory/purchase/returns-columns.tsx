'use client';

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
  type PurchaseReturnRow,
  type ReturnSortKey,
} from './purchase-returns-model';

const badgeText = 'whitespace-nowrap px-1.5 py-0 text-xs font-semibold leading-[1.125rem]';
const noteClass = 'whitespace-nowrap text-xs font-medium leading-tight';
const actionClass = 'h-8 max-w-none! whitespace-nowrap! px-2.5 text-sm lg:min-h-8!';
const linkClass =
  'flex min-w-0 flex-col items-start rounded-sm text-left focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&:hover_.ref]:underline';
const compactDay = (day: string, today: string) => (day.endsWith(` ${today.slice(0, 4)}`) ? day.slice(0, -5) : day);

export function ReturnStateBadge({ row, today }: { row: PurchaseReturnRow; today: string }) {
  const available = row.credit?.available ?? 0;
  switch (row.state) {
    case 'AWAITED': {
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
    case 'RECEIVED':
    case 'ADJUSTED':
      return (
        <span className="flex flex-col items-start">
          <Badge variant="info" className={badgeText}>{row.state === 'RECEIVED' ? 'Received' : 'Adjusted'}</Badge>
          <span className={noteClass}>{formatRupees(available)} left</span>
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

export type ReturnAct = 'record' | 'correct' | 'setOff';

export function returnColumns({
  today,
  canWrite,
  actionId,
  openId,
  undo,
  onOpen,
  onAct,
}: {
  today: string;
  canWrite: boolean;
  actionId: (rowId: string) => string;
  openId: (rowId: string) => string;
  undo: { pending: (rowId: string) => 'ready' | 'undoing' | null; run: (row: PurchaseReturnRow) => void };
  onOpen: (row: PurchaseReturnRow) => void;
  onAct: (act: ReturnAct, row: PurchaseReturnRow, anchor: HTMLButtonElement) => void;
}): RegisterColumn<PurchaseReturnRow, ReturnSortKey>[] {
  const noun = (row: PurchaseReturnRow) => (row.kind === 'CREDIT_NOTE' ? 'credit' : 'return');
  return [
    { key: 'srNo', label: 'Sr No', sort: 'srNo', className: 'w-[1%] tabular-nums', cell: (row) => row.srNo },
    {
      key: 'creditNoteNo',
      label: 'Credit Note No.',
      sort: 'creditNoteNo',
      pinned: true,
      interactive: true,
      className: 'w-[1%]',
      cell: (row) => (
        <span className="flex items-start gap-0.5">
          {canRecordCreditNote(row, canWrite) ? (
            <span className="flex flex-col items-start">
              <button
                id={actionId(row.id)}
                type="button"
                className="-my-0.5 whitespace-nowrap rounded-sm py-0.5 text-left font-semibold leading-[1.125rem] text-primary underline decoration-2 underline-offset-4 hover:decoration-[3px] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                aria-label={`Record credit note for ${noun(row)} ${row.returnRef}`}
                aria-haspopup="dialog"
                onClick={(event) => onAct('record', row, event.currentTarget)}
              >
                Record credit note
              </button>
              <button id={openId(row.id)} type="button" onClick={() => onOpen(row)} className={linkClass}>
                <span className="ref whitespace-nowrap text-xs font-medium leading-tight underline-offset-4">
                  <span className="sr-only">Open {row.kind === 'CREDIT_NOTE' ? 'Credit' : 'Return'} </span>
                  {row.returnRef}
                </span>
              </button>
            </span>
          ) : (
            <button id={openId(row.id)} type="button" onClick={() => onOpen(row)} className={linkClass}>
              {row.creditNote ? (
                <span className="ref whitespace-nowrap font-semibold leading-[1.125rem] underline-offset-4">{row.creditNote.number}</span>
              ) : (
                <span className="leading-[1.125rem]">
                  <span aria-hidden="true">—</span>
                  <span className="sr-only">No credit note yet</span>
                </span>
              )}
              <span className="ref whitespace-nowrap text-xs font-medium leading-tight underline-offset-4">
                <span className="sr-only">Open {row.kind === 'CREDIT_NOTE' ? 'Credit' : 'Return'} </span>
                {row.returnRef}
              </span>
            </button>
          )}
          {canCorrectCreditNote(row, canWrite) && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 lg:min-h-8!"
              aria-label={`Correct credit note ${row.creditNote!.number}`}
              aria-haspopup="dialog"
              title="Correct the number, date or amount"
              onClick={(event) => onAct('correct', row, event.currentTarget)}
            >
              <Pencil aria-hidden="true" className="size-4" />
            </Button>
          )}
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
          <span className="flex flex-col">
            <span className="leading-[1.125rem]">{day}</span>
            {time && <span className="text-xs font-medium leading-tight">{time}</span>}
          </span>
        );
      },
    },
    {
      key: 'creditNoteDate',
      label: 'Credit Note Date',
      sort: 'creditNoteDate',
      className: 'w-[1%] min-w-[6.5rem] whitespace-nowrap',
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
        <span className="flex min-w-0 flex-col">
          <span title={`${row.distributor.name} · GSTIN ${row.distributor.gstin}`} className="truncate font-medium leading-[1.125rem]">{row.distributor.name}</span>
          {(row.sourceBillNo || row.reason) && (
            <span className="flex min-w-0 items-center gap-1.5">
              {row.sourceBillNo && (
                <span title={`Bill ${row.sourceBillNo}`} className="truncate text-xs font-medium leading-tight">
                  Bill {row.sourceBillNo}
                </span>
              )}
              {row.reason && (
                <Badge variant="neutral" className="shrink-0 whitespace-nowrap px-1.5 py-0 text-xs font-medium leading-4">
                  {RETURN_REASON_LABELS[row.reason]}
                </Badge>
              )}
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
            <span className={cn('font-semibold leading-[1.125rem]', row.state === 'CANCELLED' && 'line-through')}>{formatRupees(amount)}</span>
            {!row.creditNote && <span className={noteClass}>{noun(row)} value</span>}
            {differs && <span className={noteClass}>Return {formatRupees(row.returnValue)}</span>}
          </span>
        );
      },
    },
    {
      key: 'state',
      label: 'Status',
      sort: 'state',
      interactive: true,
      pinnedEnd: true,
      className: 'w-[1%] whitespace-nowrap py-0.5!',
      cell: (row) => {
        const pending = undo.pending(row.id);
        return (
          <div className="flex items-center justify-between gap-2 max-sm:flex-col max-sm:items-start max-sm:gap-1">
            <ReturnStateBadge row={row} today={today} />
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
          </div>
        );
      },
    },
  ];
}
