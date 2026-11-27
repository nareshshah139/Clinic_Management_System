"use client";

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { DESK_PAYMENT_MODES, type DeskPaymentMode } from '@/lib/clinic-payment-modes';
import { addDays } from '@/lib/date-ranges';
import { displayCalendarDate } from '@/lib/date-display';
import { clinicToday } from '@/components/pharmacy/pharmacy-report-model';

/** How far back a catch-up payment may be dated; mirrors RECEIVED_ON_DAYS_BACK in backend/src/modules/billing/received-on.ts. */
export const RECEIVED_ON_DAYS_BACK = 30;

/** The days a payment may say it was received on: the last RECEIVED_ON_DAYS_BACK days up to today, in clinic time. */
export function receivedOnBounds(today = clinicToday()) {
  return { min: addDays(today, -RECEIVED_ON_DAYS_BACK), max: today };
}

export function receivedOnInvalid(day: string | null, today = clinicToday()) {
  if (day === null) return false;
  const { min, max } = receivedOnBounds(today);
  return !/^\d{4}-\d{2}-\d{2}$/.test(day) || day < min || day > max;
}

/** What the desk notes down for a mode that has a paper trail: a cheque number or a bank reference. */
export function referenceLabel(mode: DeskPaymentMode): string | undefined {
  const found = DESK_PAYMENT_MODES.find((m) => m.value === mode);
  return found && 'reference' in found ? found.reference : undefined;
}

/**
 * The clinic payment as the payments route takes it; a reference is sent only for a mode that asks for
 * one, and receivedOn only for a day staff chose that is before today at the moment of sending.
 */
export function deskPayment(invoiceId: string, amount: number, mode: DeskPaymentMode, reference: string, receivedOn?: string | null, today = clinicToday()) {
  const ref = referenceLabel(mode) && reference.trim();
  return { invoiceId, amount, method: mode, ...(ref ? { reference: ref } : {}), ...(receivedOn && receivedOn !== today ? { receivedOn } : {}) };
}

/**
 * @cc [owner:nareshshah139,label:product] payment-received-on-field
 * Taking a payment MUST default to received today and say so quietly. The desk MAY change it to an
 * earlier day, from RECEIVED_ON_DAYS_BACK days ago to today, for money taken before it was typed in;
 * an earlier day MUST say that reports will count it on that day, and a day outside that window
 * MUST be shown as invalid so it cannot be sent.
 */
export function ReceivedOnField({ value, onChange, today = clinicToday() }: { value: string | null; onChange: (day: string) => void; today?: string }) {
  const [open, setOpen] = useState(value !== null);
  const { min, max } = receivedOnBounds(today);
  const invalid = receivedOnInvalid(value, today);
  if (!open) {
    return (
      <p className="text-sm text-muted-foreground">
        Received today.{' '}
        <button type="button" aria-label="Change the day the money was received" className="font-medium text-info-text underline underline-offset-2" onClick={() => setOpen(true)}>
          Change
        </button>
      </p>
    );
  }
  return (
    <div className="space-y-1">
      <label className="flex flex-col gap-1 text-sm font-medium">
        Received on
        <Input type="date" value={value ?? ''} min={min} max={max} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid || undefined} className="h-10 w-44 text-base" />
      </label>
      {invalid ? (
        <p className="text-sm text-destructive-text">Choose a day from {displayCalendarDate(min)} to today.</p>
      ) : value === null ? (
        <p className="text-xs text-muted-foreground">Leave empty for today.</p>
      ) : value !== today ? (
        <p className="text-xs text-muted-foreground">Reports count this payment on {displayCalendarDate(value)}, the day the money came in.</p>
      ) : null}
    </div>
  );
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
