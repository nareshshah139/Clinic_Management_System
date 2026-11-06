'use client';

import { useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent, type RefObject } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { apiClient } from '@/lib/api';
import { formatDisplayDay } from '@/lib/date-ranges';
import { formatRupees } from '@/lib/pharmacy-invoice-print';
import { cn } from '@/lib/utils';
import { requestKey } from '@/components/inventory/workspace-model';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { errorMessage } from '@/components/register/register-query';
import { filterControlClass, filterLabelClass } from '@/components/register/RegisterFilters';
import {
  SETTLE_MODES,
  SETTLE_MODE_LABELS,
  readSettleMode,
  rememberSettleMode,
  parseSettleDate,
  type PurchaseRegisterRow,
  type RecordedPayment,
  type SettleMode,
} from './purchase-register-model';

const PANEL_WIDTH = 400;
const GAP = 8;

const browserStorage = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

function anchoredStyle(anchor: HTMLElement | null): CSSProperties | undefined {
  if (!anchor || window.innerWidth < 640) return undefined;
  const rect = anchor.getBoundingClientRect();
  const left = Math.min(Math.max(16, rect.right - PANEL_WIDTH), window.innerWidth - PANEL_WIDTH - 16);
  const below = window.innerHeight - rect.bottom > 380;
  return below
    ? { left, top: rect.bottom + GAP, width: PANEL_WIDTH }
    : { left, bottom: window.innerHeight - rect.top + GAP, width: PANEL_WIDTH };
}

export function MarkPaidDialog({
  row,
  today,
  anchorRef,
  onClose,
  onPaid,
}: {
  row: PurchaseRegisterRow;
  today: string;
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onPaid: (payment: RecordedPayment, row: PurchaseRegisterRow) => void;
}) {
  const amount = row.payment.outstanding;
  const [key] = useState(requestKey);
  const [mode, setMode] = useState<SettleMode>(() => readSettleMode(browserStorage()));
  const [dateText, setDateText] = useState(() => formatDisplayDay(today));
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [style, setStyle] = useState<CSSProperties | undefined>();
  const submitRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => setStyle(anchoredStyle(anchorRef.current)), [anchorRef]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const date = parseSettleDate(dateText, today);
    if ('error' in date) {
      setError(date.error);
      return;
    }
    setSaving(true);
    setError('');
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
      rememberSettleMode(browserStorage(), mode);
      onPaid(payment, row);
    } catch (failure) {
      setError(errorMessage(failure));
      setSaving(false);
    }
  };

  const partPaid = row.payment.paid + row.payment.credit;
  return (
    <DialogPrimitive.Root open onOpenChange={(open: boolean) => !open && !saving && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 sm:bg-transparent" />
        <DialogPrimitive.Content
          style={style}
          aria-describedby={undefined}
          onOpenAutoFocus={(event: Event) => {
            event.preventDefault();
            submitRef.current?.focus();
          }}
          onCloseAutoFocus={(event: Event) => {
            event.preventDefault();
            anchorRef.current?.focus();
          }}
          className={cn(
            'fixed z-50 flex flex-col gap-3 border border-border bg-popover p-4 text-popover-foreground shadow-xl outline-none',
            style ? 'rounded-lg' : 'inset-x-0 bottom-0 max-h-[90dvh] overflow-y-auto rounded-t-xl pb-[max(1rem,env(safe-area-inset-bottom))] sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/3 sm:w-[25rem] sm:-translate-x-1/2 sm:rounded-lg',
          )}
        >
          <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
            <div className="flex flex-col gap-1">
              <DialogPrimitive.Title className="text-base font-semibold leading-snug">
                Pay {formatRupees(amount)} to {row.distributor.name}
              </DialogPrimitive.Title>
              <p className="text-sm text-muted-foreground">
                For bill <span className="font-medium text-foreground">{row.billNo}</span>
                {partPaid > 0 && <> · {formatRupees(partPaid)} already settled</>}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className={cn('flex flex-col gap-1', filterLabelClass)}>
                Mode
                <select className={filterControlClass} value={mode} onChange={(event) => setMode(event.target.value as SettleMode)} disabled={saving}>
                  {SETTLE_MODES.map((value) => (
                    <option key={value} value={value}>{SETTLE_MODE_LABELS[value]}</option>
                  ))}
                </select>
              </label>
              <label className={cn('flex flex-col gap-1', filterLabelClass)}>
                Date
                <Input
                  inputMode="numeric"
                  placeholder="dd/mm/yyyy"
                  value={dateText}
                  disabled={saving}
                  onChange={(event) => setDateText(event.target.value)}
                  aria-invalid={error ? true : undefined}
                  className="h-10 text-sm tabular-nums md:text-sm"
                />
              </label>
            </div>
            <label className={cn('flex flex-col gap-1', filterLabelClass)}>
              <span>Cheque / UTR no. <span className="font-normal text-muted-foreground">(optional)</span></span>
              <Input value={reference} disabled={saving} maxLength={80} onChange={(event) => setReference(event.target.value)} className="h-10 text-sm md:text-sm" />
            </label>
            {error && (
              <p role="alert" className="text-sm font-medium text-destructive-text">
                {error}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <DialogPrimitive.Close asChild>
                <Button type="button" variant="ghost" className="h-10" disabled={saving}>Cancel</Button>
              </DialogPrimitive.Close>
              <Button ref={submitRef} type="submit" className="h-10" disabled={saving}>
                {saving ? 'Recording…' : `Record payment ${formatRupees(amount)}`}
              </Button>
            </div>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
