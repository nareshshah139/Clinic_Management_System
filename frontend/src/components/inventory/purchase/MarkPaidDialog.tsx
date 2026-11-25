'use client';

import { useId, useRef, useState } from 'react';
import { apiClient } from '@/lib/api';
import { formatDisplayDay } from '@/lib/date-ranges';
import { formatRupees } from '@/lib/pharmacy-invoice-print';
import { cn, getISTDateString } from '@/lib/utils';
import { requestKey } from '@/components/inventory/workspace-model';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { filterLabelClass } from '@/components/register/RegisterFilters';
import { ActionDialog, DialogClose, type DialogOutcome, type HandOff } from './ActionDialog';
import { setOffFailure } from './purchase-returns-model';
import type { SetOffResult } from './set-off-model';
import {
  SETTLE_MODES,
  SETTLE_MODE_LABELS,
  parseSettleDate,
  readSettleMode,
  rememberSettleMode,
  settleFailure,
  type PurchaseRegisterRow,
  type RecordedPayment,
  type SettleFailure,
  type SettleMode,
} from './purchase-register-model';
import { NativeSelect } from '@/components/ui/native-select';

function parsePaymentAmount(text: string, due: number) {
  const value = Number(text.replace(/[,\s₹]/g, ''));
  const cents = Math.round(value * 100);
  if (!text.trim() || !Number.isFinite(value) || cents < 1 || cents > Math.round(due * 100)) return null;
  return cents / 100;
}

export function MarkPaidDialog({
  row,
  anchor,
  creditHeld = 0,
  onClose,
  onPaid,
  onStale,
  onSetOff,
  onSetOffDone,
}: {
  row: PurchaseRegisterRow;
  anchor: HTMLElement;
  creditHeld?: number;
  onClose: () => void;
  onPaid: (payment: RecordedPayment, amount: number) => void;
  onStale: (failure: Extract<SettleFailure, { kind: 'stale' }>) => void;
  onSetOff?: () => void;
  onSetOffDone?: (result: SetOffResult, total: number) => void;
}) {
  const due = row.payment.payable;
  const [today] = useState(getISTDateString);
  const [key] = useState(requestKey);
  const [setOffKey] = useState(requestKey);
  const [mode, setMode] = useState<SettleMode>(readSettleMode);
  const [dateText, setDateText] = useState(() => formatDisplayDay(today));
  const [reference, setReference] = useState('');
  const [amountText, setAmountText] = useState(() => due.toFixed(2));
  const [error, setError] = useState<{ field?: 'date' | 'amount'; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const modeRef = useRef<HTMLSelectElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const setOffRef = useRef<HTMLButtonElement>(null);
  const errorId = useId();

  const amount = parsePaymentAmount(amountText, due);
  const covers = creditHeld > 0 && creditHeld + 0.005 >= due && !!onSetOffDone;
  const offersCredit = creditHeld > 0 && (covers || !!onSetOff);

  const settleByCredit = async (handOff: HandOff) => {
    if (saving || !onSetOffDone) return;
    setSaving(true);
    setError(null);
    try {
      const result = await apiClient.post<SetOffResult>(
        '/inventory/workspace/credits/set-off',
        { requestKey: setOffKey, distributorGstin: row.distributor.gstin, allocations: [{ purchaseInvoiceId: row.id, amount: due }] },
        { idempotencyKey: setOffKey },
      );
      handOff(() => onSetOffDone(result, due));
    } catch (failure) {
      const outcome = setOffFailure(failure);
      if (outcome.kind === 'stale') {
        handOff(() => onStale(outcome));
        return;
      }
      setError({ message: outcome.message });
      setSaving(false);
    }
  };

  const submit = async (): Promise<DialogOutcome> => {
    if (amount === null) {
      setError({ field: 'amount', message: `Enter an amount from ${formatRupees(0.01)} to ${formatRupees(due)}.` });
      amountRef.current?.focus();
      return 'stay';
    }
    const date = parseSettleDate(dateText, today, row.billDate);
    if ('error' in date) {
      setError({ field: 'date', message: date.error });
      dateRef.current?.focus();
      return 'stay';
    }
    setSaving(true);
    setError(null);
    try {
      const payment = await apiClient.post<RecordedPayment>(
        '/pharmacy/purchase-ledger/payments',
        {
          requestKey: key,
          distributorGstin: row.distributor.gstin,
          distributorName: row.distributor.name,
          paymentDate: date.day,
          mode,
          amount,
          referenceNo: reference.trim() || undefined,
          allocations: [{ purchaseInvoiceId: row.id, amount }],
        },
        { idempotencyKey: key },
      );
      rememberSettleMode(mode);
      onPaid(payment, amount);
      return 'done';
    } catch (failure) {
      const outcome = settleFailure(failure);
      if (outcome.kind === 'stale') {
        onStale(outcome);
        return 'done';
      }
      setError({ message: outcome.message });
      setSaving(false);
      return 'stay';
    }
  };

  const settled = row.payment.paid + row.payment.credit;
  const dateInvalid = error?.field === 'date';
  const amountInvalid = error?.field === 'amount';
  const remaining = amount === null ? null : Math.round((due - amount) * 100) / 100;
  return (
    <ActionDialog
      anchor={anchor}
      title={offersCredit ? <>Settle bill {row.billNo} · {formatRupees(due)}</> : <>Pay {formatRupees(due)} to {row.distributor.name}</>}
      description={
        offersCredit ? (
          <>
            {row.distributor.name}
            {settled > 0 && <> · {formatRupees(settled)} already settled</>}
          </>
        ) : (
          <>
            For bill <span className="font-semibold">{row.billNo}</span>
            {settled > 0 && <> · {formatRupees(settled)} already settled</>}
          </>
        )
      }
      saving={saving}
      initialFocus={covers ? setOffRef : modeRef}
      onClose={onClose}
      onSubmit={submit}
      footer={() => (
        <>
          <DialogClose asChild>
            <Button type="button" variant="ghost" className="h-10" disabled={saving}>Cancel</Button>
          </DialogClose>
          <Button type="submit" variant={covers ? 'outline' : 'default'} className="h-10" disabled={saving}>
            {saving ? 'Saving…' : amount === null ? 'Record payment' : `Record payment ${formatRupees(amount)}`}
          </Button>
        </>
      )}
    >
      {(handOff) => (
        <>
          {covers ? (
            <div className="flex flex-col items-start gap-2 rounded-md border border-info-border bg-info-soft px-3 py-2 text-sm text-foreground">
              <p>
                <span className="whitespace-nowrap font-semibold">{formatRupees(creditHeld)}</span> credit from {row.distributor.name} covers this bill. Set
                it off, or record a payment below.
              </p>
              <Button ref={setOffRef} type="button" className="h-10" disabled={saving} onClick={() => void settleByCredit(handOff)}>
                {saving ? 'Setting off…' : `Set off ${formatRupees(due)} credit`}
              </Button>
            </div>
          ) : (
            creditHeld > 0 &&
            onSetOff && (
              <p className="flex flex-wrap items-center gap-x-2 rounded-md border border-info-border bg-info-soft px-3 py-2 text-sm text-foreground">
                <span>
                  <span className="whitespace-nowrap font-semibold">{formatRupees(creditHeld)}</span> credit from {row.distributor.name} is available.
                </span>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handOff(onSetOff)}
                  className="rounded-sm font-semibold underline underline-offset-4 hover:decoration-2 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  Set off {formatRupees(creditHeld)} instead
                </button>
              </p>
            )
          )}
          <label className={cn('flex flex-col gap-1', filterLabelClass)}>
            Amount
            <Input
              ref={amountRef}
              inputMode="decimal"
              value={amountText}
              disabled={saving}
              onChange={(event) => setAmountText(event.target.value)}
              aria-invalid={amountInvalid || undefined}
              aria-describedby={amountInvalid ? errorId : undefined}
              className="h-10 text-sm tabular-nums md:text-sm"
            />
            {remaining !== null && remaining > 0 && (
              <span className="text-sm font-medium normal-case text-foreground">{formatRupees(remaining)} will still be due</span>
            )}
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className={cn('flex flex-col gap-1', filterLabelClass)}>
              Mode
              <NativeSelect className="h-10" ref={modeRef} value={mode} onChange={(event) => setMode(event.target.value as SettleMode)} disabled={saving}>
                {SETTLE_MODES.map((value) => (
                  <option key={value} value={value}>{SETTLE_MODE_LABELS[value]}</option>
                ))}
              </NativeSelect>
            </label>
            <label className={cn('flex flex-col gap-1', filterLabelClass)}>
              Date
              <Input
                ref={dateRef}
                inputMode="numeric"
                placeholder="dd/mm/yyyy"
                value={dateText}
                disabled={saving}
                onChange={(event) => setDateText(event.target.value)}
                aria-invalid={dateInvalid || undefined}
                aria-describedby={dateInvalid ? errorId : undefined}
                className="h-10 text-sm tabular-nums md:text-sm"
              />
            </label>
          </div>
          <label className={cn('flex flex-col gap-1', filterLabelClass)}>
            <span>Cheque / UTR no. <span className="font-normal text-muted-foreground">(optional)</span></span>
            <Input value={reference} disabled={saving} maxLength={80} onChange={(event) => setReference(event.target.value)} className="h-10 text-sm md:text-sm" />
          </label>
          {error && (
            <p id={errorId} role="alert" className="text-sm font-medium text-destructive-text">
              {error.message}
            </p>
          )}
        </>
      )}
    </ActionDialog>
  );
}
