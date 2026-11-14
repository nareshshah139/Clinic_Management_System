'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from 'react';
import { CalendarDays, SlidersHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDisplayDay, parseDisplayDay, rangeError, rangePresets, type DayRange } from '@/lib/date-ranges';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';

export const filterLabelClass = 'text-[calc(0.8125rem+var(--app-text-increase))] font-medium leading-5 text-foreground';

export type FilterOption = { value: string; label: string };

function usePopover() {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !open) return;
    event.stopPropagation();
    setOpen(false);
    trigger.current?.focus();
  };
  return { open, setOpen, wrapper, trigger, onKeyDown };
}

const panelClass =
  'absolute left-0 top-full z-40 mt-2 flex w-max max-w-[calc(100vw-2rem)] flex-wrap items-end gap-3 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg sm:left-auto sm:right-0';

export function FilterBar({ search, count, children }: { search: ReactNode; count: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className="flex flex-wrap items-end gap-x-1.5 gap-y-3">
      {search}
      <Button
        type="button"
        variant="outline"
        className="h-10 text-sm sm:hidden"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <SlidersHorizontal aria-hidden="true" />
        Filters{count > 0 ? ` (${count})` : ''}
      </Button>
      <div id={panelId} className={cn(open ? 'flex' : 'hidden', 'w-full flex-wrap items-end gap-x-1.5 gap-y-3 sm:contents')}>
        {children}
      </div>
    </div>
  );
}

export function RegisterSearch({
  fields,
  field,
  onField,
  value,
  onChange,
  inputRef,
}: {
  fields: readonly (FilterOption & { placeholder: string })[];
  field: string;
  onField: (field: string) => void;
  value: string;
  onChange: (value: string) => void;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const inputId = useId();
  const current = fields.find((option) => option.value === field) ?? fields[0];
  return (
    <div className="flex min-w-0 flex-[1_1_100%] items-end gap-1.5 sm:flex-[1_1_12rem]">
      <FilterSelect label="Search by" value={field} options={fields} onChange={onField} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <label htmlFor={inputId} className="sr-only">{`Search ${current.placeholder.toLowerCase()}`}</label>
        <Input
          ref={inputRef}
          id={inputId}
          type="search"
          inputMode={field === 'mobile' ? 'tel' : 'search'}
          value={value}
          placeholder={current.placeholder}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 min-w-24 px-2.5 text-sm md:text-sm"
        />
      </div>
    </div>
  );
}

export function FilterSelect({
  label,
  value,
  options,
  onChange,
  allLabel,
}: {
  label: string;
  value: string;
  options: readonly FilterOption[];
  onChange: (value: string) => void;
  allLabel?: string;
}) {
  return (
    <label className={cn('flex flex-col gap-1', filterLabelClass)}>
      {label}
      <NativeSelect className="h-10 max-w-[8.5rem]" value={value} onChange={(event) => onChange(event.target.value)}>
        {allLabel !== undefined && <option value="">{allLabel}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </NativeSelect>
    </label>
  );
}

export function MoreFilters({ count, children, label = 'More filters', className }: { count: number; children: ReactNode; label?: string; className?: string }) {
  const { open, setOpen, wrapper, trigger, onKeyDown } = usePopover();
  const panelId = useId();
  return (
    <div ref={wrapper} className="relative" onKeyDown={onKeyDown}>
      <Button
        ref={trigger}
        type="button"
        variant="outline"
        className={cn('h-10 px-3 text-sm', className)}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <SlidersHorizontal aria-hidden="true" />
        {label}
        {count > 0 && (
          <>
            <Badge variant="brand" className="min-w-6 text-xs font-semibold">{count}</Badge>
            <span className="sr-only"> active</span>
          </>
        )}
      </Button>
      {open && (
        <div id={panelId} role="group" aria-label={label} className={panelClass}>
          {children}
        </div>
      )}
    </div>
  );
}

export function ClearFilters({ onClear }: { onClear: () => void }) {
  return (
    <Button type="button" variant="ghost" className="h-10 px-2 text-sm" onClick={onClear}>
      <X aria-hidden="true" /> Clear all
    </Button>
  );
}

type Bound = 'from' | 'to';
const BOUND_LABEL: Record<Bound, string> = { from: 'From', to: 'To' };

export function DateRangeFilter({ range, today, onChange }: { range: DayRange; today: string; onChange: (range: DayRange) => void }) {
  const { open, setOpen, wrapper, trigger, onKeyDown } = usePopover();
  const [text, setText] = useState({ from: formatDisplayDay(range.from), to: formatDisplayDay(range.to) });
  const [error, setError] = useState('');
  const labelId = useId();
  const panelId = useId();
  const errorId = useId();
  const presets = rangePresets(today);
  const active = presets.find((preset) => preset.range.from === range.from && preset.range.to === range.to)?.id ?? 'custom';
  const shown = `${formatDisplayDay(range.from)} – ${formatDisplayDay(range.to)}`;

  useEffect(() => {
    setText({ from: formatDisplayDay(range.from), to: formatDisplayDay(range.to) });
    setError('');
  }, [range.from, range.to]);

  const commit = () => {
    const from = parseDisplayDay(text.from);
    const to = parseDisplayDay(text.to);
    const invalid = !from ? 'From' : !to ? 'To' : null;
    if (invalid || !from || !to) {
      setError(`Enter the ${invalid} date as dd/mm/yyyy, year 2000 or later.`);
      return;
    }
    const problem = rangeError({ from, to });
    if (problem) {
      setError(problem);
      return;
    }
    setError('');
    if (from !== range.from || to !== range.to) onChange({ from, to });
  };

  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-col gap-1">
      <span id={labelId} className={filterLabelClass}>Period</span>
      <div ref={wrapper} className="relative flex items-center gap-1" onKeyDown={onKeyDown}>
        <NativeSelect className="h-10"
          aria-label="Period"
          value={active}
          onChange={(event) => {
            const preset = presets.find((p) => p.id === event.target.value);
            if (preset) onChange(preset.range);
            else setOpen(true);
          }}
        >
          {presets.map((preset) => (
            <option key={preset.id} value={preset.id}>{preset.label}</option>
          ))}
          <option value="custom">Custom</option>
        </NativeSelect>
        <button
          ref={trigger}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={`Change dates, ${shown.replace('–', 'to')}`}
          onClick={() => setOpen((value) => !value)}
          className="inline-flex h-10 items-center gap-1 whitespace-nowrap rounded-md px-1 text-sm font-medium tabular-nums text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <CalendarDays aria-hidden="true" className="size-4 shrink-0" />
          {shown}
        </button>
        {open && (
          <div id={panelId} role="group" aria-label="Custom dates" className={cn(panelClass, 'sm:left-0 sm:right-auto')}>
            {(['from', 'to'] as const).map((bound) => (
              <label key={bound} className={cn('flex flex-col gap-1', filterLabelClass)}>
                {BOUND_LABEL[bound]}
                <Input
                  autoFocus={bound === 'from'}
                  inputMode="numeric"
                  placeholder="dd/mm/yyyy"
                  value={text[bound]}
                  aria-invalid={!!error}
                  aria-describedby={error ? errorId : undefined}
                  onChange={(event) => setText((current) => ({ ...current, [bound]: event.target.value }))}
                  onBlur={commit}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') commit();
                  }}
                  className="h-10 w-36 text-sm tabular-nums md:text-sm"
                />
              </label>
            ))}
            {error && (
              <p id={errorId} role="alert" className="basis-full text-sm font-medium text-destructive-text">
                {error}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
