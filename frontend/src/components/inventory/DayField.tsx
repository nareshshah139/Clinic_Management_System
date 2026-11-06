'use client';

import { useEffect, useId, useState } from 'react';
import { formatDisplayDay, parseDisplayDay } from '@/lib/date-ranges';
import { cn } from '@/lib/utils';
import { inputClass } from './workspace-model';

export const isCalendarDay = (value: unknown): value is string => typeof value === 'string' && parseDisplayDay(formatDisplayDay(value)) === value;

const shown = (value: string) => (isCalendarDay(value) ? formatDisplayDay(value) : value);

export function DayField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [text, setText] = useState(() => shown(value));
  const hintId = useId();
  useEffect(() => {
    setText((current) => (parseDisplayDay(current) === value || current === value ? current : shown(value)));
  }, [value]);
  const invalid = text.trim() !== '' && !parseDisplayDay(text);
  return (
    <label className="text-sm">
      {label}
      <input
        className={cn(inputClass, 'tabular-nums')}
        inputMode="numeric"
        placeholder="dd/mm/yyyy"
        value={text}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? hintId : undefined}
        onChange={(event) => {
          setText(event.target.value);
          onChange(parseDisplayDay(event.target.value) ?? event.target.value);
        }}
      />
      {invalid && (
        <span id={hintId} className="mt-1 block text-sm font-medium text-destructive-text">
          Enter the date as dd/mm/yyyy.
        </span>
      )}
    </label>
  );
}
