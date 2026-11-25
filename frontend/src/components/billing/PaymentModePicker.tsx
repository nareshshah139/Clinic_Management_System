"use client";

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { DESK_PAYMENT_MODES, type DeskPaymentMode } from '@/lib/clinic-payment-modes';

/** What the desk notes down for a mode that has a paper trail: a cheque number or a bank reference. */
export function referenceLabel(mode: DeskPaymentMode): string | undefined {
  const found = DESK_PAYMENT_MODES.find((m) => m.value === mode);
  return found && 'reference' in found ? found.reference : undefined;
}

/** The clinic payment as the payments route takes it; a reference is sent only for a mode that asks for one. */
export function deskPayment(invoiceId: string, amount: number, mode: DeskPaymentMode, reference: string) {
  const ref = referenceLabel(mode) && reference.trim();
  return { invoiceId, amount, method: mode, ...(ref ? { reference: ref } : {}) };
}

export function PaymentModePicker({ value, onChange, label, reference, onReference }: {
  value: DeskPaymentMode;
  onChange: (mode: DeskPaymentMode) => void;
  label: string;
  reference: string;
  onReference: (text: string) => void;
}) {
  const asks = referenceLabel(value);
  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
        {DESK_PAYMENT_MODES.map((mode) => (
          <button
            key={mode.value}
            type="button"
            role="radio"
            aria-checked={value === mode.value}
            onClick={() => onChange(mode.value)}
            className={cn(
              'h-10 min-w-16 rounded-md border px-3 text-sm font-medium',
              value === mode.value ? 'border-info bg-info-soft text-info-text' : 'border-border bg-background text-foreground hover:bg-accent',
            )}
          >
            {mode.label}
          </button>
        ))}
      </div>
      {asks && (
        <label className="flex flex-col gap-1 text-sm font-medium">
          {asks} (optional)
          <Input value={reference} onChange={(e) => onReference(e.target.value)} maxLength={60} autoComplete="off" className="h-10 text-base" />
        </label>
      )}
    </div>
  );
}
