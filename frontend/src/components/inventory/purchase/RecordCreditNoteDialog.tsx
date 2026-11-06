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
import { ActionDialog, DialogClose } from './ActionDialog';
import {
  amountLocked,
  creditNoteFailure,
  differenceNote,
  differsFromReturn,
  parseCreditNote,
  type PurchaseReturnRow,
  type RecordedCreditNote,
  type WriteFailure,
} from './purchase-returns-model';

type Field = 'number' | 'date' | 'amount';

export function RecordCreditNoteDialog({
  row,
  anchor,
  onClose,
  onRecorded,
  onStale,
}: {
  row: PurchaseReturnRow;
  anchor: HTMLElement;
  onClose: () => void;
  onRecorded: (recorded: RecordedCreditNote) => void;
  onStale: (failure: Extract<WriteFailure, { kind: 'stale' }>) => void;
}) {
  const locked = amountLocked(row);
  const [today] = useState(getISTDateString);
  const [key] = useState(requestKey);
  const [number, setNumber] = useState('');
  const [dateText, setDateText] = useState(() => formatDisplayDay(today));
  const [amountText, setAmountText] = useState(() => String(locked ? row.credit!.amount : row.returnValue));
  const [error, setError] = useState<{ field?: Field; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const returnFocus = useRef(true);
  const numberRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const warningId = useId();

  const typed = Number(amountText.replace(/[₹,\s]/g, ''));
  const differs = Number.isFinite(typed) && typed > 0 && differsFromReturn(typed, row);

  const submit = async () => {
    const parsed = parseCreditNote({ number, date: dateText, amount: amountText }, today);
    if ('error' in parsed) {
      setError({ field: parsed.field, message: parsed.error });
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const recorded = await apiClient.post<RecordedCreditNote>(
        `/inventory/workspace/documents/${encodeURIComponent(row.id)}/credit-note`,
        { requestKey: key, version: row.version, ...parsed.value },
        { idempotencyKey: key },
      );
      returnFocus.current = false;
      onRecorded(recorded);
    } catch (failure) {
      const outcome = creditNoteFailure(failure);
      if (outcome.kind === 'stale') {
        returnFocus.current = false;
        onStale(outcome);
        return;
      }
      setError(outcome.kind === 'field' ? { field: outcome.field, message: outcome.message } : { message: outcome.message });
      setSaving(false);
      if (outcome.kind === 'field') numberRef.current?.focus();
    }
  };

  const invalid = (field: Field) => (error?.field === field ? { 'aria-invalid': true, 'aria-describedby': errorId } : {});
  return (
    <ActionDialog
      anchor={anchor}
      title={<>Record credit note from {row.distributor.name}</>}
      description={
        <>
          For return <span className="font-semibold">{row.returnRef}</span>
          {row.sourceBillNo && <> against bill {row.sourceBillNo}</>} · return value {formatRupees(row.returnValue)}
        </>
      }
      saving={saving}
      initialFocus={numberRef}
      returnFocus={returnFocus}
      onClose={onClose}
      onSubmit={() => void submit()}
    >
      <label className={cn('flex flex-col gap-1', filterLabelClass)}>
        Credit note no.
        <Input
          ref={numberRef}
          value={number}
          disabled={saving}
          maxLength={50}
          autoComplete="off"
          onChange={(event) => setNumber(event.target.value)}
          className="h-10 text-sm uppercase md:text-sm"
          {...invalid('number')}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className={cn('flex flex-col gap-1', filterLabelClass)}>
          Credit note date
          <Input
            inputMode="numeric"
            placeholder="dd/mm/yyyy"
            value={dateText}
            disabled={saving}
            onChange={(event) => setDateText(event.target.value)}
            className="h-10 text-sm tabular-nums md:text-sm"
            {...invalid('date')}
          />
        </label>
        <label className={cn('flex flex-col gap-1', filterLabelClass)}>
          Amount (₹)
          <Input
            inputMode="decimal"
            value={amountText}
            disabled={saving}
            readOnly={locked}
            aria-readonly={locked || undefined}
            aria-describedby={[error?.field === 'amount' && errorId, differs && warningId].filter(Boolean).join(' ') || undefined}
            aria-invalid={error?.field === 'amount' || undefined}
            onChange={(event) => setAmountText(event.target.value)}
            className={cn('h-10 text-right text-sm tabular-nums md:text-sm', locked && 'bg-muted')}
          />
        </label>
      </div>
      {locked && (
        <p className="text-sm text-foreground">
          {formatRupees(row.credit!.applied)} of this credit is already set off against bills, so its amount stays {formatRupees(row.credit!.amount)}.
        </p>
      )}
      {differs && !locked && (
        <p id={warningId} className="rounded-md border border-warning-border bg-warning-soft px-3 py-2 text-sm font-medium text-warning-text">
          {differenceNote(typed, row)} Enter the amount printed on the distributor’s credit note.
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-sm font-medium text-destructive-text">
          {error.message}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <DialogClose asChild>
          <Button type="button" variant="ghost" className="h-10" disabled={saving}>Cancel</Button>
        </DialogClose>
        <Button type="submit" className="h-10" disabled={saving}>
          {saving ? 'Saving…' : 'Record credit note'}
        </Button>
      </div>
    </ActionDialog>
  );
}
