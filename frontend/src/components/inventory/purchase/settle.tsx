'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { apiClient } from '@/lib/api';
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
  paymentText,
  type PurchaseRegisterResponse,
  type PurchaseRegisterRow,
  type RecordedPayment,
  type SettleFailure,
} from './purchase-register-model';

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

export function PaymentBadge({ row }: { row: PurchaseRegisterRow }) {
  const { state, outstanding, overdueDays, partlyPaid } = row.payment;
  const settled = row.payment.paid + row.payment.credit;
  const note = (text: string) => <span className="whitespace-nowrap text-xs leading-tight font-medium text-foreground">{text}</span>;
  switch (state) {
    case 'PAID':
      return <Badge variant="success" className={badgeText}>Paid</Badge>;
    case 'DUE':
      return <Badge variant="danger" className={badgeText}>Due</Badge>;
    case 'OVERDUE':
      return (
        <span className="flex flex-col items-start gap-0.5">
          <Badge variant="destructive" className={cn(badgeText, 'bg-destructive-text text-white dark:bg-destructive')}>
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
type Recent = { payment: RecordedPayment; undoing: boolean };

export function useSettleBill({
  rows,
  canSettle,
  reload,
}: {
  rows: readonly PurchaseRegisterRow[];
  canSettle: boolean;
  reload: () => Promise<PurchaseRegisterResponse | null>;
}) {
  const ids = useId();
  const [settling, setSettling] = useState<Settling | null>(null);
  const [recent, setRecent] = useState<Record<string, Recent>>({});
  const [focusId, setFocusId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const recentRef = useRef(recent);
  recentRef.current = recent;

  const settleId = (rowId: string) => `${ids}settle-${rowId}`;
  const openId = (rowId: string) => `${ids}open-${rowId}`;

  useEffect(() => {
    if (!focusId) return;
    document.getElementById(focusId)?.focus();
    setFocusId(null);
  }, [focusId, rows]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const forget = (rowId: string) => {
    clearTimeout(timers.current.get(rowId));
    timers.current.delete(rowId);
    setRecent((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== rowId)));
  };
  const remember = (rowId: string, payment: RecordedPayment) => {
    clearTimeout(timers.current.get(rowId));
    timers.current.set(rowId, setTimeout(() => forget(rowId), UNDO_WINDOW_MS));
    setRecent((current) => ({ ...current, [rowId]: { payment, undoing: false } }));
  };

  const focusAfter = (fresh: readonly PurchaseRegisterRow[], rowId: string, oldIndex: number) => {
    const index = fresh.findIndex((row) => row.id === rowId);
    const next = fresh.slice(index >= 0 ? index + 1 : Math.max(0, oldIndex)).find((row) => canMarkPaid(row, canSettle));
    const landing = index >= 0 ? rowId : fresh[Math.min(Math.max(0, oldIndex), fresh.length - 1)]?.id;
    setFocusId(next ? settleId(next.id) : landing ? openId(landing) : null);
  };

  const undo = async (row: PurchaseRegisterRow, key = requestKey()) => {
    const entry = recentRef.current[row.id];
    if (!entry || entry.undoing) return;
    setRecent((current) => ({ ...current, [row.id]: { ...entry, undoing: true } }));
    try {
      await apiClient.post(
        `/pharmacy/purchase-ledger/payments/${encodeURIComponent(entry.payment.id)}/reverse`,
        { requestKey: key, expectedUpdatedAt: entry.payment.updatedAt, reason: UNDO_REASON },
        { idempotencyKey: key },
      );
      forget(row.id);
      const fresh = (await reload())?.rows ?? [];
      const now = fresh.find((candidate) => candidate.id === row.id);
      toast({ title: 'Payment undone', description: `Bill ${row.billNo}: ${now ? paymentText(now) : 'no longer paid'}.` });
      if (now) setFocusId(canMarkPaid(now, canSettle) ? settleId(row.id) : openId(row.id));
    } catch (failure) {
      remember(row.id, entry.payment);
      toast({
        variant: 'destructive',
        title: 'Could not undo the payment',
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
    remember(row.id, payment);
    const remaining = payment.allocations?.find((allocation) => allocation.purchaseInvoiceId === row.id)?.outstandingAfter ?? 0;
    const fresh = (await reload())?.rows ?? [];
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
    focusAfter(fresh, row.id, oldIndex);
  };

  const stale = async (failure: Extract<SettleFailure, { kind: 'stale' }>) => {
    if (!settling) return;
    const { row } = settling;
    const oldIndex = rows.findIndex((candidate) => candidate.id === row.id);
    setSettling(null);
    toast({ variant: 'destructive', title: failure.title, description: failure.description });
    const fresh = (await reload())?.rows ?? [];
    const now = fresh.find((candidate) => candidate.id === row.id);
    if (now && canMarkPaid(now, canSettle)) setFocusId(settleId(row.id));
    else focusAfter(fresh, row.id, oldIndex);
  };

  return {
    settling,
    open: (row: PurchaseRegisterRow, anchor: HTMLButtonElement) => setSettling({ row, anchor }),
    close: () => setSettling(null),
    paid,
    stale,
    recent,
    undo,
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
    <div className="flex items-center justify-between gap-2">
      <PaymentBadge row={row} />
      {recent ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-sm font-semibold underline underline-offset-4 lg:min-h-8!"
          aria-label={`Undo payment for bill ${row.billNo}`}
          disabled={recent.undoing}
          onClick={() => void settle.undo(row)}
        >
          {recent.undoing ? 'Undoing…' : 'Undo'}
        </Button>
      ) : (
        canMarkPaid(row, canSettle) && (
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
        )
      )}
    </div>
  );
}
