'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { apiClient } from '@/lib/api';
import { formatDisplayDay } from '@/lib/date-ranges';
import { formatRupees } from '@/lib/pharmacy-invoice-print';
import { cn, getISTDateString } from '@/lib/utils';
import { requestKey } from '@/components/inventory/workspace-model';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { filterLabelClass } from '@/components/register/RegisterFilters';
import { ActionDialog, DialogClose, type DialogOutcome } from './ActionDialog';
import {
  amountLocked,
  creditNoteFailure,
  differenceNote,
  differsFromReturn,
  needsConfirming,
  parseCreditNote,
  type CreditNoteTarget,
  type RecordedCreditNote,
  type WriteFailure,
} from './purchase-returns-model';

type Field = 'number' | 'date' | 'amount' | 'reason';
const amountOf = (text: string) => Number(text.replace(/[₹,\s]/g, ''));

export function RecordCreditNoteDialog({
  row,
  anchor,
  mode = 'record',
  onClose,
  onRecorded,
  onStale,
}: {
  row: CreditNoteTarget;
  anchor: HTMLElement;
  mode?: 'record' | 'correct';
  onClose: () => void;
  onRecorded: (recorded: RecordedCreditNote) => void;
  onStale: (failure: Extract<WriteFailure, { kind: 'stale' }>) => void;
}) {
  const correcting = mode === 'correct' && row.creditNote !== null;
  const locked = amountLocked(row);
  const [today] = useState(getISTDateString);
  const [key] = useState(requestKey);
  const [number, setNumber] = useState(correcting ? row.creditNote!.number : '');
  const [dateText, setDateText] = useState(() => formatDisplayDay(correcting && row.creditNote!.date ? row.creditNote!.date : today));
  const [amountText, setAmountText] = useState(() => String(correcting ? row.creditNote!.amount : locked ? row.credit!.amount : row.returnValue));
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState<number | null>(null);
  const [error, setError] = useState<{ field?: Field; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const refs = { number: useRef<HTMLInputElement>(null), date: useRef<HTMLInputElement>(null), amount: useRef<HTMLInputElement>(null), reason: useRef<HTMLInputElement>(null) };
  const errorId = useId();
  const warningId = useId();
  const noun = row.kind === 'CREDIT_NOTE' ? 'supplier credit' : 'return';

  const typed = amountOf(amountText);
  const differs = Number.isFinite(typed) && typed > 0 && differsFromReturn(typed, row);
  const confirming = confirmed !== null && confirmed === typed;

  const [focusTarget, setFocusTarget] = useState<{ field: Field } | null>(null);
  useEffect(() => {
    if (!focusTarget || saving) return;
    refs[focusTarget.field].current?.focus();
    setFocusTarget(null);
  }, [focusTarget, saving, refs]);

  const fail = (field: Field | undefined, message: string) => {
    setError({ field, message });
    if (field) setFocusTarget({ field });
  };

  const submit = async (): Promise<DialogOutcome> => {
    const parsed = parseCreditNote({ number, date: dateText, amount: amountText }, today, row.returnDate);
    if ('error' in parsed) {
      fail(parsed.field, parsed.error);
      return 'stay';
    }
    if (correcting && !reason.trim()) {
      fail('reason', 'Say why the credit note is being corrected, for the record.');
      return 'stay';
    }
    if (!locked && needsConfirming(parsed.value.amount, row) && confirmed !== parsed.value.amount) {
      setError(null);
      setConfirmed(parsed.value.amount);
      return 'stay';
    }
    setSaving(true);
    setError(null);
    try {
      const recorded = await apiClient.post<RecordedCreditNote>(
        `/inventory/workspace/documents/${encodeURIComponent(row.id)}/credit-note`,
        { requestKey: key, version: row.version, ...parsed.value, ...(correcting ? { correct: true, reason: reason.trim() } : {}) },
        { idempotencyKey: key },
      );
      onRecorded(recorded);
      return 'done';
    } catch (failure) {
      const outcome = creditNoteFailure(failure);
      if (outcome.kind === 'stale') {
        onStale(outcome);
        return 'done';
      }
      setSaving(false);
      fail(outcome.kind === 'field' ? outcome.field : undefined, outcome.message);
      return 'stay';
    }
  };

  const invalid = (field: Field) => (error?.field === field ? { 'aria-invalid': true as const } : {});
  const describedBy = (field: Field, ...extra: (string | false)[]) =>
    [error?.field === field && errorId, ...extra].filter(Boolean).join(' ') || undefined;
  return (
    <ActionDialog
      anchor={anchor}
      title={correcting ? <>Correct credit note {row.creditNote!.number}</> : <>Record credit note from {row.distributor.name}</>}
      description={
        <>
          For {noun} <span className="font-semibold">{row.returnRef}</span>
          {row.sourceBillNo && <> against bill {row.sourceBillNo}</>} · {noun} value {formatRupees(row.returnValue)}
        </>
      }
      saving={saving}
      initialFocus={refs.number}
      onClose={onClose}
      onSubmit={submit}
      footer={() => (
        <>
          <DialogClose asChild>
            <Button type="button" variant="ghost" className="h-10" disabled={saving}>Cancel</Button>
          </DialogClose>
          <Button type="submit" className="h-10" disabled={saving}>
            {saving ? 'Saving…' : confirming ? `Record ${formatRupees(typed)} anyway` : correcting ? 'Save correction' : 'Record credit note'}
          </Button>
        </>
      )}
    >
      <label className={cn('flex flex-col gap-1', filterLabelClass)}>
        Credit note no.
        <Input
          ref={refs.number}
          value={number}
          disabled={saving}
          maxLength={50}
          autoComplete="off"
          onChange={(event) => setNumber(event.target.value)}
          className="h-10 text-sm uppercase md:text-sm"
          aria-describedby={describedBy('number')}
          {...invalid('number')}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className={cn('flex flex-col gap-1', filterLabelClass)}>
          Credit note date
          <Input
            ref={refs.date}
            inputMode="numeric"
            placeholder="dd/mm/yyyy"
            value={dateText}
            disabled={saving}
            onChange={(event) => setDateText(event.target.value)}
            className="h-10 text-sm tabular-nums md:text-sm"
            aria-describedby={describedBy('date')}
            {...invalid('date')}
          />
        </label>
        <label className={cn('flex flex-col gap-1', filterLabelClass)}>
          Amount (₹)
          <Input
            ref={refs.amount}
            inputMode="decimal"
            value={amountText}
            disabled={saving}
            readOnly={locked}
            aria-readonly={locked || undefined}
            aria-describedby={describedBy('amount', differs && !locked && warningId)}
            onChange={(event) => {
              setAmountText(event.target.value);
              setConfirmed(null);
            }}
            className={cn('h-10 text-right text-sm tabular-nums md:text-sm', locked && 'bg-muted')}
            {...invalid('amount')}
          />
        </label>
      </div>
      {correcting && (
        <label className={cn('flex flex-col gap-1', filterLabelClass)}>
          Why correct it?
          <Input
            ref={refs.reason}
            value={reason}
            disabled={saving}
            maxLength={500}
            placeholder="For example: misread the number on the note"
            onChange={(event) => setReason(event.target.value)}
            className="h-10 text-sm md:text-sm"
            aria-describedby={describedBy('reason')}
            {...invalid('reason')}
          />
        </label>
      )}
      {locked && (
        <p className="text-sm text-foreground">
          {formatRupees(row.credit!.applied)} of this credit is already set off against bills, so its amount stays {formatRupees(row.credit!.amount)}.
        </p>
      )}
      {differs && !locked && (
        <p
          id={warningId}
          role={confirming ? 'alert' : undefined}
          className="rounded-md border border-warning-border bg-warning-soft px-3 py-2 text-sm font-medium text-warning-text"
        >
          {differenceNote(typed, row)}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-sm font-medium text-destructive-text">
          {error.message}
        </p>
      )}
    </ActionDialog>
  );
}
