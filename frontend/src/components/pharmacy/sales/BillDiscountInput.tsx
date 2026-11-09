'use client';

import { useId, useState } from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { BillDiscount, BillDiscountKind } from '@/lib/bill-pricing';

const KINDS: { kind: BillDiscountKind; label: string; name: string }[] = [
  { kind: 'PERCENT', label: '%', name: 'Percent' },
  { kind: 'AMOUNT', label: '₹', name: 'Rupees' },
];

const textOf = (value: BillDiscount | null) => (value?.value ? String(value.value) : '');

export function BillDiscountInput({
  value,
  onChange,
  problem,
  disabled,
}: {
  value: BillDiscount | null;
  onChange: (value: BillDiscount | null) => void;
  problem?: string | null;
  disabled?: boolean;
}) {
  const id = useId();
  const [kind, setKind] = useState<BillDiscountKind>(value?.kind ?? 'PERCENT');
  const [text, setText] = useState(textOf(value));

  const emit = (nextKind: BillDiscountKind, nextText: string) => {
    const amount = Number(nextText);
    onChange(nextText.trim() && Number.isFinite(amount) && amount > 0 ? { kind: nextKind, value: amount } : null);
  };

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Bill discount</Label>
      <div className="flex min-w-0 items-stretch gap-2">
        <div role="group" aria-label="Bill discount in" className="inline-flex shrink-0 overflow-hidden rounded-md border border-input">
          {KINDS.map((option) => (
            <button
              key={option.kind}
              type="button"
              aria-pressed={kind === option.kind}
              aria-label={option.name}
              disabled={disabled}
              onClick={() => {
                setKind(option.kind);
                emit(option.kind, text);
              }}
              className={cn(
                'min-w-10 px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                kind === option.kind ? 'bg-primary text-primary-foreground' : 'bg-background text-foreground hover:bg-muted',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          min={0}
          max={kind === 'PERCENT' ? 100 : undefined}
          step="0.01"
          value={text}
          disabled={disabled}
          placeholder={kind === 'PERCENT' ? '0 %' : '₹0.00'}
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? `${id}-problem` : `${id}-hint`}
          onChange={(event) => {
            setText(event.target.value);
            emit(kind, event.target.value);
          }}
          className="min-w-0 flex-1 text-right tabular-nums"
        />
      </div>
      {problem ? (
        <p id={`${id}-problem`} role="alert" className="text-sm text-destructive-text">{problem}</p>
      ) : (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">On the whole bill after item discounts, before tax.</p>
      )}
    </div>
  );
}
