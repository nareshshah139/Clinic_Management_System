'use client';

import { Check } from 'lucide-react';
import { displayUtcDate } from '@/lib/date-display';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { COUNT_STATE_BADGE, COUNT_STATE_LABELS, signedRupees, signedUnits, type CountLine, type CountState } from './count-model';

const expiry = (value: string) => (value ? displayUtcDate(value).replace(/^\d{2} /, '') : '');

export function BatchLine({ line }: { line: Pick<CountLine, 'name' | 'batchNumber' | 'expiryDate'> }) {
  const exp = expiry(line.expiryDate);
  return (
    <>
      <span className="block font-semibold leading-snug [overflow-wrap:anywhere]">{line.name}</span>
      <span className="block text-sm leading-snug">
        Batch {line.batchNumber || '—'}
        {exp && <span className="whitespace-nowrap"> · Exp {exp}</span>}
      </span>
    </>
  );
}

export function Difference({ line, withValue = true }: { line: Pick<CountLine, 'systemStock' | 'physicalStock' | 'unitCost' | 'unit'>; withValue?: boolean }) {
  if (line.physicalStock === null || line.systemStock === null) return <span className="text-muted-foreground">—</span>;
  const diff = line.physicalStock - line.systemStock;
  if (!diff)
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap text-success-text">
        <Check aria-hidden="true" className="size-4" /> Matches
      </span>
    );
  return (
    <span className={cn('flex flex-col leading-tight tabular-nums', diff < 0 ? 'text-destructive-text' : 'text-warning-text')}>
      <span className="whitespace-nowrap font-semibold">
        {signedUnits(diff)}
        <span className="sr-only"> {diff < 0 ? 'fewer' : 'more'} than the system</span>
      </span>
      {withValue && <span className="whitespace-nowrap text-sm">{signedRupees(Math.round(diff * line.unitCost * 100) / 100)}</span>}
    </span>
  );
}

export function CountStateBadge({ state }: { state: CountState }) {
  return (
    <Badge variant={COUNT_STATE_BADGE[state]} className="whitespace-nowrap px-1.5 py-0 text-xs font-semibold leading-[1.125rem]">
      {COUNT_STATE_LABELS[state]}
    </Badge>
  );
}
