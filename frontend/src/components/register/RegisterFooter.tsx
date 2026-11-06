'use client';

import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { lastPage } from './register-query';

export function RegisterFooter({
  summary,
  note,
  page,
  limit,
  total,
  unit = 'rows',
  label,
  busy = false,
  onPage,
}: {
  summary: ReactNode;
  note?: ReactNode;
  page: number;
  limit: number;
  total: number;
  unit?: string;
  label: string;
  busy?: boolean;
  onPage: (page: number) => void;
}) {
  const last = lastPage(total, limit);
  const step = (target: number, enabled: boolean) => () => {
    if (enabled) onPage(target);
  };
  const hasPrevious = page > 1;
  const hasNext = page < last;
  const first = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);
  return (
    <div className="sticky -bottom-4 z-30 -mx-4 -mb-4 flex items-center justify-between gap-x-3 gap-y-1 border-t border-border bg-background px-3 py-1.5 shadow-[0_-4px_12px_-8px_rgb(0_0_0/0.25)] sm:flex-wrap sm:gap-x-4 sm:px-4 sm:py-2.5 md:-bottom-6 md:-mx-6 md:-mb-6 md:px-6 md:py-3">
      <div role="status" aria-live="polite" aria-busy={busy} className={cn('min-w-0 flex-1 transition-opacity sm:flex-none', busy && 'opacity-50')}>
        <div className="line-clamp-2 text-sm font-semibold leading-tight sm:line-clamp-none sm:text-lg sm:leading-6">{summary}</div>
        {note && <p className="text-sm text-foreground max-sm:sr-only">{note}</p>}
      </div>
      {total > 0 && (
        <nav aria-label={label} className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <span className="text-xs tabular-nums sm:text-sm">
            <span aria-hidden="true" className="sm:hidden">{first}–{end}/{total}</span>
            <span className="max-sm:sr-only">{first}–{end} of {total} {unit}</span>
          </span>
          <Button variant="outline" size="icon" className="size-10 aria-disabled:cursor-not-allowed aria-disabled:opacity-50" aria-label="Previous page" aria-disabled={!hasPrevious} onClick={step(page - 1, hasPrevious)}>
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button variant="outline" size="icon" className="size-10 aria-disabled:cursor-not-allowed aria-disabled:opacity-50" aria-label="Next page" aria-disabled={!hasNext} onClick={step(page + 1, hasNext)}>
            <ChevronRight aria-hidden="true" />
          </Button>
        </nav>
      )}
    </div>
  );
}
