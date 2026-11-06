'use client';

import { useId, useRef, useState } from 'react';
import { apiClient } from '@/lib/api';
import { formatDisplayDay } from '@/lib/date-ranges';
import { formatRupees } from '@/lib/pharmacy-invoice-print';
import { cn, getISTDateString } from '@/lib/utils';
import { requestKey } from '@/components/inventory/workspace-model';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { filterControlClass, filterLabelClass } from '@/components/register/RegisterFilters';
import { ActionDialog, DialogClose, type DialogOutcome } from './ActionDialog';
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

export function MarkPaidDialog({
  row,
  anchor,
  creditHeld = 0,
  onClose,
  onPaid,
  onStale,
  onSetOff,
}: {
  row: PurchaseRegisterRow;
  anchor: HTMLElement;
  creditHeld?: number;
  onClose: () => void;
  onPaid: (payment: RecordedPayment, amount: number) => void;
  onStale: (failure: Extract<SettleFailure, { kind: 'stale' }>) => void;
  onSetOff?: () => void;
}) {
  const amount = row.payment.payable;
  const [today] = useState(getISTDateString);
  const [key] = useState(requestKey);
  const [mode, setMode] = useState<SettleMode>(readSettleMode);
  const [dateText, setDateText] = useState(() => formatDisplayDay(today));
  const [reference, setReference] = useState('');
  const [error, setError] = useState<{ field?: 'date'; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const modeRef = useRef<HTMLSelectElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const setOffRef = useRef<HTMLButtonElement>(null);
  const errorId = useId();

  const covers = creditHeld > 0 && creditHeld + 0.005 >= amount && !!onSetOff;

  const submit = async (): Promise<DialogOutcome> => {
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
  return (
    <ActionDialog
      anchor={anchor}
      title={<>Pay {formatRupees(amount)} to {row.distributor.name}</>}
      description={
        <>
          For bill <span className="font-semibold">{row.billNo}</span>
          {settled > 0 && <> · {formatRupees(settled)} already settled</>}
        </>
      }
      saving={saving}
      initialFocus={covers ? setOffRef : modeRef}
      onClose={onClose}
      onSubmit={submit}
      footer={(handOff) => (
        <>
          {covers && onSetOff && (
            <Button ref={setOffRef} type="button" className="h-10 sm:order-last" disabled={saving} onClick={() => handOff(onSetOff)}>
              Set off {formatRupees(amount)} credit
            </Button>
          )}
          <DialogClose asChild>
            <Button type="button" variant="ghost" className="h-10" disabled={saving}>Cancel</Button>
          </DialogClose>
          <Button type="submit" variant={covers ? 'outline' : 'default'} className="h-10" disabled={saving}>
            {saving ? 'Recording…' : `Record payment ${formatRupees(amount)}`}
          </Button>
        </>
      )}
    >
      {(handOff) => (
        <>
          {covers ? (
            <p className="rounded-md border border-info-border bg-info-soft px-3 py-2 text-sm text-foreground">
              <span className="font-semibold">{formatRupees(creditHeld)}</span> credit from {row.distributor.name} covers this bill. Set it off,
              or record a payment below.
            </p>
          ) : (
            creditHeld > 0 &&
            onSetOff && (
              <p className="flex flex-wrap items-center gap-x-2 rounded-md border border-info-border bg-info-soft px-3 py-2 text-sm text-foreground">
                <span>
                  <span className="font-semibold">{formatRupees(creditHeld)}</span> credit from {row.distributor.name} is available.
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
          <div className="grid grid-cols-2 gap-3">
            <label className={cn('flex flex-col gap-1', filterLabelClass)}>
              Mode
              <select ref={modeRef} className={filterControlClass} value={mode} onChange={(event) => setMode(event.target.value as SettleMode)} disabled={saving}>
                {SETTLE_MODES.map((value) => (
                  <option key={value} value={value}>{SETTLE_MODE_LABELS[value]}</option>
                ))}
              </select>
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
