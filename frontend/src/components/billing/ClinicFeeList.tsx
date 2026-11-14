"use client";

import React, { useCallback, useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingSkeleton } from '@/components/ui/skeleton';
import { apiClient } from '@/lib/api';
import { getErrorMessage, isConflictError } from '@/lib/utils';
import { displayClinicDateTime } from '@/lib/date-display';
import { useToast } from '@/hooks/use-toast';
import type { BillType, ClinicFee } from '@/lib/types';
import { parseRupees, rupee } from '@/components/appointments/appointment-billing-view';

const WHEN: Record<BillType, string> = {
  FIRST_CONSULTATION: "A patient's first visit in this branch",
  REVIEW: 'A patient who has visited before',
  PROCEDURE: 'A procedure appointment',
};
const MAX_FEE = 1_000_000;

const textOf = (amount: number | null) => (amount === null ? '' : String(amount));

function FeeRow({ fee }: { fee: ClinicFee }) {
  const { toast } = useToast();
  const ids = useId();
  const [text, setText] = useState(textOf(fee.amount));
  const [base, setBase] = useState(fee);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const value = parseRupees(text);
  const invalid = value !== null && (Number.isNaN(value) || value <= 0 || value > MAX_FEE);
  const changed = !invalid && value !== base.amount;

  const save = async () => {
    if (!changed) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await apiClient.setClinicFee(fee.billType, value, base.version);
      setBase(saved);
      setText(textOf(saved.amount));
      toast({ variant: 'success', title: saved.amount === null ? `${fee.label} fee cleared` : `${fee.label} fee saved: ${rupee(saved.amount)}` });
    } catch (e) {
      if (isConflictError(e)) {
        const { fees } = await apiClient.getClinicFees().catch(() => ({ fees: [] as ClinicFee[] }));
        const now = fees.find((f) => f.billType === fee.billType);
        if (now) setBase(now);
        setError(`${(e as { body?: { message?: string } }).body?.message ?? getErrorMessage(e)} Your ${text.trim() ? rupee(value ?? 0) : 'empty fee'} is still in the box.`);
      } else {
        setError(`${getErrorMessage(e)} Nothing was saved.`);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      aria-labelledby={`${ids}-name`}
      className="grid gap-x-6 gap-y-2 border-b py-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto]"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="min-w-0">
        <h2 id={`${ids}-name`} className="text-base font-semibold">{fee.label}</h2>
        <p className="text-sm text-muted-foreground">{WHEN[fee.billType]}</p>
        <p data-testid="fee-status" className="mt-1 text-sm text-foreground">
          {base.version === 0
            ? 'No fee set yet'
            : `${base.amount === null ? 'No fee' : rupee(base.amount)} · ${base.amount === null ? 'cleared' : 'changed'} ${displayClinicDateTime(base.updatedAt)}${base.updatedBy ? ` by ${base.updatedBy}` : ''}`}
        </p>
      </div>
      <div className="flex items-end gap-2">
        <label className="flex flex-col gap-1 text-sm font-medium">
          <span className="sr-only">{fee.label} fee in rupees</span>
          <span className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground" aria-hidden="true">₹</span>
            <Input
              inputMode="decimal"
              placeholder="Not set"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setError(null);
              }}
              aria-invalid={invalid || undefined}
              aria-describedby={`${ids}-help`}
              className="h-10 w-36 pl-7 text-base tabular-nums"
            />
          </span>
        </label>
        <Button type="submit" className="h-10 min-w-24" disabled={saving || !changed}>
          {saving ? 'Saving…' : value === null && base.amount !== null ? 'Clear fee' : 'Save'}
        </Button>
      </div>
      <div id={`${ids}-help`} className="sm:col-span-2">
        {invalid && <p className="text-sm text-destructive-text">Enter an amount above 0 and up to {rupee(MAX_FEE)}, for example 500.</p>}
        {error && <p role="alert" className="text-sm text-destructive-text">{error}</p>}
      </div>
    </form>
  );
}

/**
 * @cc [owner:nareshshah139,label:product] clinic-fee-list-screen
 * The fee list MUST show every bill type with its fee or "No fee set yet", and who changed it and
 * when. Each fee MUST save on its own; an empty box clears it. When someone else changed the fee
 * first, the screen MUST say so in words, show their fee, and keep what was typed.
 */
export function ClinicFeeList() {
  const [fees, setFees] = useState<ClinicFee[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setFees((await apiClient.getClinicFees()).fees);
    } catch (e) {
      setLoadError(getErrorMessage(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loadError)
    return (
      <div role="alert" className="space-y-2 rounded-lg border p-4 text-sm text-destructive-text">
        <p>Could not load the fee list: {loadError}</p>
        <Button size="sm" variant="outline" onClick={() => void load()}>Retry</Button>
      </div>
    );
  if (!fees) return <LoadingSkeleton label="Loading the fee list…" variant="cards" />;
  return (
    <section aria-label="Fees by bill type" className="rounded-lg border bg-card px-4">
      {fees.map((fee) => (
        <FeeRow key={fee.billType} fee={fee} />
      ))}
    </section>
  );
}
