'use client';

import { formatRupees } from '@/lib/pharmacy-invoice-print';
import { Button } from '@/components/ui/button';
import type { DistributorPosition } from './purchase-register-model';

export function DistributorPositionStrip({
  position,
  name,
  canSetOff,
  onSetOff,
}: {
  position: DistributorPosition;
  name: string;
  canSetOff: boolean;
  onSetOff: (anchor: HTMLButtonElement) => void;
}) {
  const inFavour = position.net < 0;
  return (
    <section
      aria-label={`${name} position`}
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-border bg-muted px-3 py-2"
    >
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-base tabular-nums">
        <span className="font-semibold">{name}</span>
        <span className="text-sm">all posted bills:</span>
        <span>
          Due <span className="font-semibold">{formatRupees(position.outstanding)}</span>
        </span>
        <span aria-hidden="true">−</span>
        <span className="sr-only">minus</span>
        <span>
          Credit held <span className="font-semibold">{formatRupees(position.creditHeld)}</span>
        </span>
        <span aria-hidden="true">=</span>
        <span className="sr-only">equals</span>
        <span className="font-semibold">
          {inFavour ? `${formatRupees(-position.net)} in your favour` : `Net payable ${formatRupees(position.net)}`}
        </span>
      </p>
      {canSetOff && position.creditHeld > 0 && position.outstanding > 0 && (
        <Button type="button" variant="outline" className="h-9 text-sm" aria-haspopup="dialog" onClick={(event) => onSetOff(event.currentTarget)}>
          Set off credit
        </Button>
      )}
    </section>
  );
}
