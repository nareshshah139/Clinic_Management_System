'use client';

import type { ReactNode, Ref } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TableHead } from '@/components/ui/table';
import { TooltipProvider } from '@/components/ui/tooltip';
import { displayClinicDateTimeCompact } from '@/lib/date-display';
import type { SortDirection } from './register-query';

export const registerHeadClass =
  'sticky -top-4 md:-top-6 z-20 h-12 whitespace-normal bg-muted px-1! py-1! text-sm leading-tight font-semibold text-foreground first:left-0 first:z-30 first:rounded-tl-lg first:pl-1.5! last:rounded-tr-lg last:pr-1! max-xl:first:border-r max-xl:first:border-border';

export const registerCellClass = 'px-1! py-2! text-sm first:pl-1.5! last:pr-1!';

export const registerStickyCellClass =
  'sticky left-0 z-10 bg-background group-hover:bg-[var(--accent-soft)] max-xl:border-r max-xl:border-border';

export function RegisterTable({ label, containerRef, children }: { label: string; containerRef?: Ref<HTMLDivElement>; children: ReactNode }) {
  return (
    <TooltipProvider delayDuration={200}>
      <div ref={containerRef} className="@container relative w-full scroll-mt-24 overflow-x-auto rounded-lg border border-border bg-background xl:overflow-visible">
        <table aria-label={label} className="w-full border-separate max-xl:min-w-[60rem] border-spacing-0 tabular-nums tracking-[-0.02em] [&_td]:border-b [&_td]:border-border [&_th]:border-b [&_th]:border-border [&_tr:last-child>td]:border-b-0">
          {children}
        </table>
      </div>
    </TooltipProvider>
  );
}

export function RegisterHead({ children, align, className }: { children: ReactNode; align?: 'right'; className?: string }) {
  return <TableHead className={cn(registerHeadClass, align === 'right' && 'text-right', className)}>{children}</TableHead>;
}

export function SortableHead({
  label,
  active,
  direction,
  onSort,
  align,
  className,
}: {
  label: string;
  active: boolean;
  direction: SortDirection;
  onSort: () => void;
  align?: 'right';
  className?: string;
}) {
  const Arrow = !active ? ArrowUpDown : direction === 'asc' ? ArrowUp : ArrowDown;
  const split = label.lastIndexOf(' ') + 1;
  const head = label.slice(0, split);
  const last = label.slice(split);
  return (
    <TableHead
      aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn(registerHeadClass, align === 'right' && 'text-right', className)}
    >
      <button
        type="button"
        onClick={onSort}
        className={cn(
          'min-h-10 rounded-sm py-1 hover:underline hover:underline-offset-4 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
          align === 'right' ? 'text-right' : 'text-left',
        )}
      >
        {head}
        <span className="whitespace-nowrap">
          {last}&nbsp;<Arrow aria-hidden="true" className={cn('inline size-4 align-[-3px]', !active && 'text-muted-foreground')} />
        </span>
      </button>
    </TableHead>
  );
}

export function RegisterDateTime({ value, today }: { value: string; today: string }) {
  const [date, time] = displayClinicDateTimeCompact(value, today).split(', ');
  if (!time) return <>{date}</>;
  return (
    <span className="whitespace-nowrap @max-[70rem]:whitespace-normal">
      <span className="whitespace-nowrap">{date},</span> <span className="whitespace-nowrap">{time}</span>
    </span>
  );
}
