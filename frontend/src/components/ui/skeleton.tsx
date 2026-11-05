import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * @cc [owner:nareshshah139,label:accessibility] skeleton-decoration
 * Placeholder shapes MUST be hidden from assistive technology and MUST stop
 * pulsing when reduced motion is requested.
 */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-muted motion-reduce:animate-none', className)} aria-hidden="true" {...props} />;
}

/**
 * @cc [owner:nareshshah139,label:accessibility] loading-skeleton-status
 * A loading skeleton MUST announce one supplied label while placeholder cells
 * stay hidden. It MUST NOT represent unavailable data as zero or empty results.
 */
export function LoadingSkeleton({ label = 'Loading…', variant = 'table', className }: { label?: string; variant?: 'table' | 'cards'; className?: string }) {
  return (
    <div role="status" aria-label={label} className={cn('w-full space-y-4 py-4', className)}>
      <span className="sr-only">{label}</span>
      {variant === 'cards' ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => <div key={index} className="space-y-4 rounded-lg border border-border bg-card p-5"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-8 w-1/3" /><Skeleton className="h-3 w-1/2" /></div>)}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="grid grid-cols-3 gap-6 bg-muted/50 p-4"><Skeleton className="h-4" /><Skeleton className="h-4" /><Skeleton className="h-4" /></div>
          {Array.from({ length: 5 }, (_, index) => <div key={index} className="grid grid-cols-3 gap-6 border-t border-border p-4"><Skeleton className="h-4 w-4/5" /><Skeleton className="h-4 w-3/5" /><Skeleton className="ml-auto h-4 w-2/5" /></div>)}
        </div>
      )}
    </div>
  );
}
