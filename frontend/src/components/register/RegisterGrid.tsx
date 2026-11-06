'use client';

import type { MouseEvent, ReactNode, Ref } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { displayClinicDateTimeCompact } from '@/lib/date-display';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { SortDirection } from './register-query';
import type { RegisterLoad } from './useRegisterQuery';

export type RegisterColumn<Row, Sort extends string = string> = {
  key: string;
  label: string;
  hideLabel?: boolean;
  srNote?: string;
  sort?: Sort;
  align?: 'right';
  pinned?: boolean;
  interactive?: boolean;
  className?: string;
  cell: (row: Row) => ReactNode;
};

const headClass =
  'sticky top-0 xl:-top-6 z-20 h-12 whitespace-normal bg-muted px-1! py-1! text-sm leading-tight font-semibold text-foreground first:rounded-tl-lg first:pl-1.5! last:rounded-tr-lg last:pr-1!';
const pinnedHeadClass = 'left-0 z-30 max-xl:border-r max-xl:border-border';
const cellClass = 'px-1! py-2! text-sm first:pl-1.5! last:pr-1!';
const pinnedCellClass = 'sticky left-0 z-10 bg-background group-hover:bg-[var(--accent-soft)] max-xl:border-r max-xl:border-border';

const stopRowClick = (event: MouseEvent) => event.stopPropagation();

function HeadLabel({ column }: { column: RegisterColumn<unknown> }) {
  const note = column.srNote && <span className="sr-only"> {column.srNote}</span>;
  if (column.hideLabel) return <span className="sr-only">{column.label}{note}</span>;
  return <>{column.label}{note}</>;
}

function SortButton({ column, active, direction, onSort }: { column: RegisterColumn<unknown>; active: boolean; direction: SortDirection; onSort: () => void }) {
  const Arrow = !active ? ArrowUpDown : direction === 'asc' ? ArrowUp : ArrowDown;
  const split = column.label.lastIndexOf(' ') + 1;
  return (
    <button
      type="button"
      onClick={onSort}
      className={cn(
        'min-h-10 rounded-sm py-1 hover:underline hover:underline-offset-4 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        column.align === 'right' ? 'text-right' : 'text-left',
      )}
    >
      {column.label.slice(0, split)}
      <span className="whitespace-nowrap">
        {column.label.slice(split)}&nbsp;<Arrow aria-hidden="true" className={cn('inline size-4 align-[-3px]', !active && 'text-muted-foreground')} />
      </span>
      {column.srNote && <span className="sr-only"> {column.srNote}</span>}
    </button>
  );
}

export function RegisterGrid<Row extends { id: string }, Sort extends string>({
  label,
  noun,
  columns,
  rows,
  load,
  sort,
  onSort,
  onRowClick,
  onRetry,
  empty,
  containerRef,
  rowClassName = 'h-[52px]',
}: {
  label: string;
  noun: string;
  columns: RegisterColumn<Row, Sort>[];
  rows: readonly Row[];
  load: RegisterLoad<unknown>;
  sort: { by: Sort; dir: SortDirection };
  onSort: (key: Sort) => void;
  onRowClick: (row: Row) => void;
  onRetry: () => void;
  empty: ReactNode;
  containerRef?: Ref<HTMLDivElement>;
  rowClassName?: string;
}) {
  const loaded = load.data !== null;
  const firstLoad = !loaded && load.status === 'loading';
  const failed = load.status === 'error';
  return (
    <>
      {failed && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive-border bg-destructive-soft px-4 py-3 text-base text-destructive-text">
          <span>Could not load {noun}. {load.error}</span>
          <Button variant="outline" onClick={onRetry}>Retry</Button>
        </div>
      )}
      <div
        aria-busy={load.status === 'loading'}
        inert={failed || undefined}
        className={cn('transition-opacity', load.status === 'loading' && loaded && 'opacity-60', failed && loaded && 'opacity-30')}
      >
        {firstLoad && <span role="status" className="sr-only">Loading {noun}…</span>}
        <TooltipProvider delayDuration={200}>
          <div ref={containerRef} className="@container relative w-full scroll-mt-24 overflow-auto rounded-lg border border-border bg-background max-xl:max-h-[calc(100dvh-16rem)] max-xl:min-h-48 xl:overflow-visible">
            <table aria-label={label} className="w-full border-separate max-xl:min-w-[60rem] border-spacing-0 tabular-nums tracking-[-0.02em] [&_td]:border-b [&_td]:border-border [&_th]:border-b [&_th]:border-border [&_tr:last-child>td]:border-b-0">
              <TableHeader className="static! z-auto! bg-transparent!">
                <TableRow className="hover:bg-transparent">
                  {columns.map((column) => {
                    const active = column.sort !== undefined && sort.by === column.sort;
                    return (
                      <TableHead
                        key={column.key}
                        aria-sort={column.sort === undefined ? undefined : active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                        className={cn(headClass, column.pinned && pinnedHeadClass, column.align === 'right' && 'text-right')}
                      >
                        {column.sort === undefined ? (
                          <HeadLabel column={column as RegisterColumn<unknown>} />
                        ) : (
                          <SortButton column={column as RegisterColumn<unknown>} active={active} direction={sort.dir} onSort={() => onSort(column.sort!)} />
                        )}
                      </TableHead>
                    );
                  })}
                </TableRow>
              </TableHeader>
              <TableBody>
                {firstLoad &&
                  Array.from({ length: 6 }, (_, i) => (
                    <TableRow key={i} className={rowClassName}>
                      {columns.map((column) => (
                        <TableCell key={column.key} className={cellClass}><Skeleton className="h-5 w-full min-w-12" /></TableCell>
                      ))}
                    </TableRow>
                  ))}
                {loaded && rows.length === 0 && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={columns.length} className="whitespace-normal">{empty}</TableCell>
                  </TableRow>
                )}
                {rows.map((row) => (
                  <TableRow key={row.id} className={cn('group cursor-pointer', rowClassName)} onClick={() => onRowClick(row)}>
                    {columns.map((column) => (
                      <TableCell
                        key={column.key}
                        onClick={column.interactive ? stopRowClick : undefined}
                        className={cn(cellClass, column.pinned && pinnedCellClass, column.align === 'right' && 'text-right', column.className)}
                      >
                        {column.cell(row)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </table>
          </div>
        </TooltipProvider>
      </div>
    </>
  );
}

export function RegisterDenied({ noun, children }: { noun: string; children?: ReactNode }) {
  return (
    <div role="status" className="flex flex-col items-start gap-3 rounded-lg border border-border bg-muted px-4 py-4 text-base">
      <p>
        <span className="font-semibold">You don’t have access to {noun}.</span> Ask a clinic administrator to give your account access if you need it.
      </p>
      {children}
    </div>
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

export function shortName(name: string) {
  const [first, ...rest] = name.trim().split(/\s+/);
  const last = rest.at(-1);
  return last ? `${first} ${last[0]}.` : first;
}
