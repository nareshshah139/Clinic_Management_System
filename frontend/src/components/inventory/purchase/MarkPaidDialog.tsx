'use client';

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { apiClient } from '@/lib/api';
import { formatDisplayDay } from '@/lib/date-ranges';
import { formatRupees } from '@/lib/pharmacy-invoice-print';
import { cn, getISTDateString } from '@/lib/utils';
import { requestKey } from '@/components/inventory/workspace-model';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { filterControlClass, filterLabelClass } from '@/components/register/RegisterFilters';
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

const PANEL_WIDTH = 400;
const GAP = 8;
const EDGE = 16;
const ARM_DELAY_MS = 300;

function anchoredStyle(anchor: HTMLElement, height: number): CSSProperties | undefined {
  if (window.innerWidth < 640) return undefined;
  const rect = anchor.getBoundingClientRect();
  const left = Math.min(Math.max(EDGE, rect.right - PANEL_WIDTH), window.innerWidth - PANEL_WIDTH - EDGE);
  const top = rect.bottom + GAP + height <= window.innerHeight - EDGE ? rect.bottom + GAP : Math.max(EDGE, rect.top - GAP - height);
  return { left, top, width: PANEL_WIDTH };
}

export function MarkPaidDialog({
  row,
  anchor,
  onClose,
  onPaid,
  onStale,
}: {
  row: PurchaseRegisterRow;
  anchor: HTMLElement;
  onClose: () => void;
  onPaid: (payment: RecordedPayment, amount: number) => void;
  onStale: (failure: Extract<SettleFailure, { kind: 'stale' }>) => void;
}) {
  const amount = row.payment.outstanding;
  const [today] = useState(getISTDateString);
  const [key] = useState(requestKey);
  const [mode, setMode] = useState<SettleMode>(readSettleMode);
  const [dateText, setDateText] = useState(() => formatDisplayDay(today));
  const [reference, setReference] = useState('');
  const [error, setError] = useState<{ field?: 'date'; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [style, setStyle] = useState<CSSProperties>();
  const armed = useRef(false);
  const returnFocus = useRef(true);
  const modeRef = useRef<HTMLSelectElement>(null);
  const errorId = useId();

  useEffect(() => {
    const timer = setTimeout(() => {
      armed.current = true;
    }, ARM_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  const placed = useRef(false);
  const place = useCallback((node: HTMLDivElement | null) => {
    if (!node || placed.current) return;
    placed.current = true;
    setStyle(anchoredStyle(anchor, node.offsetHeight));
  }, [anchor]);

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (saving) return;
    const date = parseSettleDate(dateText, today, row.billDate);
    if ('error' in date) {
      setError({ field: 'date', message: date.error });
      return;
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
      returnFocus.current = false;
      onPaid(payment, amount);
    } catch (failure) {
      const outcome = settleFailure(failure);
      if (outcome.kind === 'stale') {
        returnFocus.current = false;
        onStale(outcome);
        return;
      }
      setError({ message: outcome.message });
      setSaving(false);
    }
  };

  const enterSubmits = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== 'Enter' || event.target instanceof HTMLButtonElement) return;
    event.preventDefault();
    if (armed.current && !event.repeat) void submit();
  };

  const settled = row.payment.paid + row.payment.credit;
  const dateInvalid = error?.field === 'date';
  return (
    <DialogPrimitive.Root open onOpenChange={(open: boolean) => !open && !saving && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 sm:bg-transparent" />
        <DialogPrimitive.Content
          ref={place}
          style={style}
          onOpenAutoFocus={(event: Event) => {
            event.preventDefault();
            modeRef.current?.focus();
          }}
          onCloseAutoFocus={(event: Event) => {
            event.preventDefault();
            if (returnFocus.current) anchor.focus();
          }}
          onPointerDownOutside={(event: Event) => {
            if (!armed.current) event.preventDefault();
          }}
          className={cn(
            'fixed z-50 flex flex-col gap-3 border border-border bg-popover p-4 text-popover-foreground shadow-xl outline-none',
            style ? 'rounded-lg' : 'inset-x-0 bottom-0 max-h-[90dvh] overflow-y-auto rounded-t-xl pb-[max(1rem,env(safe-area-inset-bottom))] sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/3 sm:w-[25rem] sm:-translate-x-1/2 sm:rounded-lg',
          )}
        >
          <form onSubmit={submit} onKeyDown={enterSubmits} className="flex flex-col gap-3" noValidate>
            <div className="flex flex-col gap-1">
              <DialogPrimitive.Title className="text-base font-semibold leading-snug">
                Pay {formatRupees(amount)} to {row.distributor.name}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-sm text-foreground">
                For bill <span className="font-semibold">{row.billNo}</span>
                {settled > 0 && <> · {formatRupees(settled)} already settled</>}
              </DialogPrimitive.Description>
            </div>
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
            <div className="flex flex-wrap justify-end gap-2">
              <DialogPrimitive.Close asChild>
                <Button type="button" variant="ghost" className="h-10" disabled={saving}>Cancel</Button>
              </DialogPrimitive.Close>
              <Button type="submit" className="h-10" disabled={saving}>
                {saving ? 'Recording…' : `Record payment ${formatRupees(amount)}`}
              </Button>
            </div>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
