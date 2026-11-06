'use client';

import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
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
  onPage,
}: {
  summary: ReactNode;
  note?: ReactNode;
  page: number;
  limit: number;
  total: number;
  unit?: string;
  label: string;
  onPage: (page: number) => void;
}) {
  const last = lastPage(total, limit);
  const step = (target: number, enabled: boolean) => () => {
    if (enabled) onPage(target);
  };
  const hasPrevious = page > 1;
  const hasNext = page < last;
  return (
    <div className="sticky -bottom-4 z-30 -mx-4 -mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-border bg-background px-4 py-2.5 shadow-[0_-4px_12px_-8px_rgb(0_0_0/0.25)] md:-bottom-6 md:-mx-6 md:-mb-6 md:px-6 md:py-3">
      <div role="status" aria-live="polite" className="min-w-0">
        <div className="text-lg font-semibold leading-6">{summary}</div>
        {note && <p className="text-sm text-foreground">{note}</p>}
      </div>
      {total > 0 && (
        <nav aria-label={label} className="flex items-center gap-2">
          <span className="text-sm tabular-nums">
            {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total} {unit}
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
