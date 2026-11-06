'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { apiClient } from '@/lib/api';
import { displayCalendarDate } from '@/lib/date-display';
import { getISTDateString } from '@/lib/utils';
import { formatRupees } from '@/lib/pharmacy-invoice-print';
import { cn } from '@/lib/utils';
import { requestKey } from '@/components/inventory/workspace-model';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/components/register/register-query';
import { ActionDialog, DialogClose, type DialogOutcome } from './ActionDialog';
import { setOffFailure, type WriteFailure } from './purchase-returns-model';
import { prefillSetOff, setOffProblem, type SetOffOptions, type SetOffResult } from './set-off-model';

const shortDay = (day: string) => {
  const text = displayCalendarDate(day);
  return day.slice(0, 4) === getISTDateString().slice(0, 4) ? text.slice(0, -5) : text;
};

export type SetOffScope = { creditId: string } | { distributorGstin: string };

export function SetOffCreditDialog({
  scope,
  distributorName,
  anchor,
  billId,
  onClose,
  onDone,
  onStale,
}: {
  scope: SetOffScope;
  distributorName: string;
  anchor: HTMLElement;
  billId?: string;
  onClose: () => void;
  onDone: (result: SetOffResult, total: number) => void;
  onStale: (failure: Extract<WriteFailure, { kind: 'stale' }>) => void;
}) {
  const [key] = useState(requestKey);
  const [options, setOptions] = useState<SetOffOptions | null>(null);
  const [loadError, setLoadError] = useState('');
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const firstRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const errorId = useId();
  const leftId = useId();
  const inputs = useId();
  const inputId = (id: string) => `${inputs}bill-${id}`;
  const focusBill = billId && options?.bills.some((bill) => bill.id === billId) ? billId : options?.bills[0]?.id;

  const scopeKey = JSON.stringify(scope);
  useEffect(() => {
    let live = true;
    apiClient.get<SetOffOptions>('/inventory/workspace/credits/set-off', JSON.parse(scopeKey)).then(
      (loaded) => {
        if (!live) return;
        setOptions(loaded);
        setAmounts(prefillSetOff(loaded, billId));
      },
      (failure: unknown) => {
        if (!live) return;
        setLoadError(
          (failure as { status?: number } | null)?.status === 403
            ? 'You don’t have access to supplier credits. Ask a clinic administrator if you need it.'
            : `Could not load the open bills. ${errorMessage(failure)}`,
        );
      },
    );
    return () => {
      live = false;
    };
  }, [scopeKey, billId, attempt]);

  useEffect(() => {
    if (options) (firstRef.current ?? cancelRef.current)?.focus();
  }, [options]);

  const check = options ? setOffProblem(options, amounts) : null;
  const left = check?.left ?? 0;

  const submit = async (): Promise<DialogOutcome> => {
    if (!options || !check) return 'stay';
    if (check.problem) {
      setError(check.problem);
      if (check.invalidBill) document.getElementById(inputId(check.invalidBill))?.focus();
      return 'stay';
    }
    setSaving(true);
    setError('');
    try {
      const result = await apiClient.post<SetOffResult>(
        '/inventory/workspace/credits/set-off',
        { requestKey: key, ...scope, allocations: check.allocations },
        { idempotencyKey: key },
      );
      onDone(result, check.total);
      return 'done';
    } catch (failure) {
      const outcome = setOffFailure(failure);
      if (outcome.kind === 'stale') {
        onStale(outcome);
        return 'done';
      }
      setError(outcome.kind === 'inline' ? outcome.message : '');
      setSaving(false);
      return 'stay';
    }
  };

  const name = options?.distributor.name ?? distributorName;
  const credits = options?.credits ?? [];
  const creditLabel = credits.length === 1 ? `credit note ${credits[0].number}` : `${credits.length} credit notes`;
  return (
    <ActionDialog
      anchor={anchor}
      width={480}
      title={<>Set off credit from {name}</>}
      description={
        options ? (
          <>
            <span className="font-semibold">{formatRupees(options.available)}</span> available from {creditLabel}.{' '}
            {billId ? 'Filled against the bill you were paying.' : 'Bills due first are filled first.'}
          </>
        ) : (
          'Loading open bills…'
        )
      }
      saving={saving}
      initialFocus={firstRef}
      onClose={onClose}
      onSubmit={submit}
      footer={() => (
        <>
          <DialogClose asChild>
            <Button ref={cancelRef} type="button" variant="ghost" className="h-10" disabled={saving}>Cancel</Button>
          </DialogClose>
          {options && options.bills.length > 0 && (
            <Button type="submit" className="h-10" disabled={saving || !check || check.total <= 0}>
              {saving ? 'Saving…' : `Set off ${formatRupees(check?.total ?? 0)}`}
            </Button>
          )}
        </>
      )}
    >
      {!options && !loadError && (
        <div className="flex flex-col gap-2" aria-hidden="true">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}
      {loadError && (
        <div role="alert" className="flex flex-col items-start gap-2 text-sm font-medium text-destructive-text">
          {loadError}
          <Button type="button" variant="outline" className="h-9" onClick={() => { setLoadError(''); setAttempt((n) => n + 1); }}>Retry</Button>
        </div>
      )}
      {options && options.bills.length === 0 && (
        <p className="text-sm">No posted bill from {name} has anything left to pay. The credit stays available for the next bill.</p>
      )}
      {options && options.bills.length > 0 && (
        <table className="w-full border-separate border-spacing-0 text-sm tabular-nums">
          <caption className="sr-only">Open bills from {name}, due first at the top</caption>
          <thead>
            <tr className="text-left">
              <th scope="col" className="pb-1 font-semibold">Bill</th>
              <th scope="col" className="pb-1 font-semibold">Due</th>
              <th scope="col" className="pb-1 text-right font-semibold">To pay</th>
              <th scope="col" className="pb-1 pl-2 text-right font-semibold">Set off ₹</th>
            </tr>
          </thead>
          <tbody>
            {options.bills.map((bill) => (
              <tr key={bill.id} className={cn(bill.id === billId && 'bg-info-soft')}>
                <th scope="row" className="whitespace-nowrap border-t border-border py-1.5 pl-1 pr-2 text-left font-medium">
                  {bill.billNo}
                  {bill.id === billId && <span className="block text-xs font-medium leading-tight">Bill you were paying</span>}
                </th>
                <td className="whitespace-nowrap border-t border-border py-1.5 pr-2">{bill.dueDate ? shortDay(bill.dueDate) : <span title={`No due date; billed ${displayCalendarDate(bill.billDate)}`}>—</span>}</td>
                <td className="whitespace-nowrap border-t border-border py-1.5 text-right">{formatRupees(bill.payable)}</td>
                <td className="border-t border-border py-1.5 pl-2">
                  <Input
                    id={inputId(bill.id)}
                    ref={bill.id === focusBill ? firstRef : undefined}
                    inputMode="decimal"
                    aria-label={`Set off against bill ${bill.billNo}, up to ${formatRupees(bill.payable)}`}
                    value={amounts[bill.id] ?? ''}
                    disabled={saving}
                    placeholder="0"
                    onChange={(event) => setAmounts((current) => ({ ...current, [bill.id]: event.target.value }))}
                    aria-invalid={check?.invalidBill === bill.id || undefined}
                    aria-describedby={check?.invalidBill === bill.id && error ? errorId : undefined}
                    className="ml-auto h-9 w-24 text-right text-sm tabular-nums md:text-sm"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {options && options.bills.length > 0 && (
        <p id={leftId} role="status" className={cn('text-sm font-semibold', left < 0 ? 'text-destructive-text' : 'text-foreground')}>
          {left < 0 ? `${formatRupees(-left)} more than the credit available` : `${formatRupees(left)} credit left after this`}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-sm font-medium text-destructive-text">
          {error}
        </p>
      )}
    </ActionDialog>
  );
}
