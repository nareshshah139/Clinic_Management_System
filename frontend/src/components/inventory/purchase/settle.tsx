'use client';

import { useState } from 'react';
import { apiClient } from '@/lib/api';
import { formatDisplayDay } from '@/lib/date-ranges';
import { formatRupees } from '@/lib/pharmacy-invoice-print';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { requestKey } from '@/components/inventory/workspace-model';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ToastAction } from '@/components/ui/toast';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { errorMessage } from '@/components/register/register-query';
import {
  INVOICE_STATE_LABELS,
  UNDO_REASON,
  UNDO_WINDOW_MS,
  canMarkPaid,
  daysText,
  isScheduledOnly,
  paymentText,
  scheduledNote,
  shortDay,
  wasDueNote,
  type PurchaseRegisterResponse,
  type PurchaseRegisterRow,
  type RecordedPayment,
  type SettleFailure,
} from './purchase-register-model';
import type { SetOffResult } from './set-off-model';
import { useRowAction, useUndoWindow } from './useRowAction';

const badgeText = 'whitespace-nowrap px-1.5 py-0.5 text-xs font-semibold';
const UNDER_PAY_TOLERANCE = 0.01;

function OverdueDays({ days }: { days: number }) {
  return (
    <>
      <span aria-hidden="true">{days}d</span>
      <span className="sr-only">{daysText(days)}</span>
    </>
  );
}

const noteClass = 'max-w-28 whitespace-normal text-xs leading-tight font-medium text-foreground';

function ScheduledBadge({ row, day, today }: { row: PurchaseRegisterRow; day: string; today: string }) {
  const wasDue = wasDueNote(row, today);
  return (
    <span className="flex flex-col items-start gap-0.5">
      <Badge variant="info" className={badgeText}>
        <span aria-hidden="true">Scheduled {shortDay(day, today)}</span>
        <span className="sr-only">Payment scheduled for {formatDisplayDay(day)}</span>
      </Badge>
      {wasDue && <span className={noteClass}>{wasDue}</span>}
    </span>
  );
}

export function PaymentBadge({ row, today }: { row: PurchaseRegisterRow; today: string }) {
  if (isScheduledOnly(row) && row.payment.scheduledOn) return <ScheduledBadge row={row} day={row.payment.scheduledOn} today={today} />;
  const scheduled = scheduledNote(row, today);
  const badge = <OwedBadge row={row} />;
  if (!scheduled || !['DUE', 'OVERDUE', 'PARTIAL'].includes(row.payment.state)) return badge;
  return (
    <span className="flex flex-col items-start gap-0.5">
      {badge}
      <span className={noteClass}>{scheduled}</span>
    </span>
  );
}

function OwedBadge({ row }: { row: PurchaseRegisterRow }) {
  const { state, outstanding, overdueDays, partlyPaid } = row.payment;
  const settled = row.payment.paid + row.payment.credit;
  const note = (text: string) => <span className={noteClass}>{text}</span>;
  switch (state) {
    case 'PAID':
      return <Badge variant="success" className={badgeText}>Paid</Badge>;
    case 'DUE':
      return <Badge variant="danger" className={badgeText}>Due</Badge>;
    case 'OVERDUE':
      return (
        <span className="flex flex-col items-start gap-0.5">
          <Badge variant="destructive" className={cn(badgeText, 'bg-destructive-text text-white')}>
            Overdue · <OverdueDays days={overdueDays} />
          </Badge>
          {partlyPaid && note(`${formatRupees(settled)} paid`)}
        </span>
      );
    case 'PARTIAL':
      return (
        <span className="flex flex-col items-start gap-0.5">
          <Badge variant="warning" className={badgeText}>{formatRupees(outstanding)} due</Badge>
          {note(`${formatRupees(settled)} paid`)}
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

type Settling = { row: PurchaseRegisterRow; anchor: HTMLButtonElement };
type Undoable = { kind: 'payment'; payment: RecordedPayment } | { kind: 'setOff'; setOffId: string; billNos: string[] };

export function useSettleBill({
  rows,
  canSettle,
  today,
  reload,
}: {
  rows: readonly PurchaseRegisterRow[];
  canSettle: boolean;
  today: string;
  reload: () => Promise<PurchaseRegisterResponse | null>;
}) {
  const [settling, setSettling] = useState<Settling | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const action = useRowAction({ reload, next: (row: PurchaseRegisterRow) => canMarkPaid(row, canSettle) });
  const { actionId: settleId, openId } = action;
  const undoWindow = useUndoWindow<Undoable>(UNDO_WINDOW_MS);
  const { remember, forget } = undoWindow;

  const undo = async (row: Pick<PurchaseRegisterRow, 'id' | 'billNo'>, key = requestKey()) => {
    const entry = undoWindow.entry(row.id);
    if (!entry || entry.undoing) return;
    const undoable = entry.value;
    const rowIds = undoWindow.sharing(undoable);
    undoWindow.mark(rowIds, undoable, true);
    const noun = undoable.kind === 'payment' ? 'payment' : 'set-off';
    try {
      if (undoable.kind === 'payment')
        await apiClient.post(
          `/pharmacy/purchase-ledger/payments/${encodeURIComponent(undoable.payment.id)}/reverse`,
          { requestKey: key, expectedUpdatedAt: undoable.payment.updatedAt, reason: UNDO_REASON },
          { idempotencyKey: key },
        );
      else
        await apiClient.post(
          `/inventory/workspace/credits/set-off/${encodeURIComponent(undoable.setOffId)}/reverse`,
          { reason: UNDO_REASON },
          { idempotencyKey: key },
        );
      forget(rowIds);
      const fresh = (await reload())?.rows ?? [];
      const now = fresh.find((candidate) => candidate.id === row.id);
      toast({
        title: undoable.kind === 'payment' ? 'Payment undone' : 'Set-off undone',
        description:
          undoable.kind === 'payment'
            ? `Bill ${row.billNo}: ${now ? paymentText(now, today) : 'no longer paid'}.`
            : `The credit is back with the distributor and bill${undoable.billNos.length === 1 ? '' : 's'} ${undoable.billNos.join(', ')} owe${undoable.billNos.length === 1 ? 's' : ''} it again.`,
      });
      if (now) action.focus(settleId(row.id), openId(row.id));
    } catch (failure) {
      if ((failure as { status?: number } | null)?.status === 409) {
        forget(rowIds);
        toast({
          variant: 'warning',
          title: `This ${noun} was already undone`,
          description: `The list now shows bill ${row.billNo}’s latest balance.`,
        });
        await reload();
        action.focus(settleId(row.id), openId(row.id));
        return;
      }
      remember(rowIds, undoable);
      toast({
        variant: 'destructive',
        title: `Could not undo the ${noun}`,
        description: `${errorMessage(failure)} You can reverse it from Payments & dues.`,
        action: (
          <ToastAction altText="Try undo again" onClick={() => void undo(row, key)}>
            Try again
          </ToastAction>
        ),
      });
    }
  };

  const paid = async (payment: RecordedPayment, amount: number) => {
    if (!settling) return;
    const { row } = settling;
    const oldIndex = rows.findIndex((candidate) => candidate.id === row.id);
    setSettling(null);
    remember([row.id], { kind: 'payment', payment });
    const remaining = payment.allocations?.find((allocation) => allocation.purchaseInvoiceId === row.id)?.outstandingAfter ?? 0;
    const fresh = await action.refresh(row.id, oldIndex);
    const visible = fresh.some((candidate) => candidate.id === row.id);
    if (remaining > UNDER_PAY_TOLERANCE) {
      toast({
        variant: 'warning',
        title: `Recorded ${formatRupees(amount)}; ${formatRupees(remaining)} still due`,
        description: `The balance on bill ${row.billNo} changed while you were paying. Check the bill before paying the rest.`,
      });
    } else if (!visible) {
      toast({
        title: 'Payment recorded',
        description: `${formatRupees(amount)} to ${row.distributor.name} for bill ${row.billNo}.`,
        action: (
          <ToastAction altText={`Undo payment for bill ${row.billNo}`} onClick={() => void undo(row)}>
            Undo
          </ToastAction>
        ),
      });
    }
    setAnnouncement(`Recorded ${formatRupees(amount)} for bill ${row.billNo}.`);
  };

  const setOff = async (result: SetOffResult, total: number, from: { rowId: string } | null) => {
    const billNos = result.bills.map((bill) => bill.billNo);
    remember(
      result.bills.map((bill) => bill.id),
      { kind: 'setOff', setOffId: result.setOffId, billNos },
    );
    const message = `Set off ${formatRupees(total)} of credit against bill${billNos.length === 1 ? '' : 's'} ${billNos.join(', ')}.`;
    setAnnouncement(message);
    const [first] = result.bills;
    toast({
      title: message,
      description: 'Undo is in the Payment column for 30 seconds.',
      ...(first
        ? {
            action: (
              <ToastAction altText={`Undo the set-off against bill${billNos.length === 1 ? '' : 's'} ${billNos.join(', ')}`} onClick={() => void undo(first)}>
                Undo
              </ToastAction>
            ),
          }
        : {}),
    });
    if (from) await action.refresh(from.rowId, rows.findIndex((candidate) => candidate.id === from.rowId));
    else await reload();
  };

  const stale = async (failure: Extract<SettleFailure, { kind: 'stale' }>) => {
    if (!settling) return;
    const { row } = settling;
    const oldIndex = rows.findIndex((candidate) => candidate.id === row.id);
    setSettling(null);
    toast({ variant: 'warning', title: failure.title, description: failure.description });
    const fresh = (await reload())?.rows ?? [];
    const now = fresh.find((candidate) => candidate.id === row.id);
    if (now && canMarkPaid(now, canSettle)) action.focus(settleId(row.id), openId(row.id));
    else action.focusAfter(fresh, row.id, oldIndex);
  };

  return {
    settling,
    open: (row: PurchaseRegisterRow, anchor: HTMLButtonElement) => setSettling({ row, anchor }),
    close: () => setSettling(null),
    paid,
    setOff,
    stale,
    recent: undoWindow.pending,
    undo,
    today,
    settleId,
    openId,
    announcement,
  };
}

export function PaymentCell({
  row,
  settle,
  canSettle,
}: {
  row: PurchaseRegisterRow;
  settle: ReturnType<typeof useSettleBill>;
  canSettle: boolean;
}) {
  const recent = settle.recent[row.id];
  return (
    <div className="flex items-center gap-2">
      <PaymentBadge row={row} today={settle.today} />
      {recent && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 whitespace-nowrap! px-2 text-sm font-semibold underline underline-offset-4 lg:min-h-8!"
          aria-label={`Undo ${recent.value.kind === 'payment' ? 'payment' : 'credit set-off'} for bill ${row.billNo}`}
          disabled={recent.undoing}
          onClick={() => void settle.undo(row)}
        >
          {recent.undoing ? 'Undoing…' : 'Undo'}
        </Button>
      )}
      {canMarkPaid(row, canSettle) && (
        <Button
          id={settle.settleId(row.id)}
          type="button"
          variant="outline"
          size="sm"
          className="h-8 max-w-none! whitespace-nowrap! px-2.5 text-sm lg:min-h-8!"
          aria-label={`Mark bill ${row.billNo} paid`}
          aria-haspopup="dialog"
          onClick={(event) => settle.open(row, event.currentTarget)}
        >
          Mark paid
        </Button>
      )}
    </div>
  );
}
