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
      aria-label={`${name} position across all bills`}
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-border bg-muted px-3 py-2"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-sm">
          <span className="font-semibold">{name}</span> · across all bills, not just this period
        </p>
        <dl className="grid grid-cols-[auto_auto] gap-x-3 text-sm tabular-nums sm:flex sm:flex-wrap sm:items-baseline sm:gap-x-1.5">
          <dt>Due</dt>
          <dd className="text-right font-semibold sm:text-left">{formatRupees(position.outstanding)}</dd>
          <dt>
            <span aria-hidden="true" className="max-sm:hidden">− </span>Credit held
          </dt>
          <dd className="text-right font-semibold sm:text-left">{formatRupees(position.creditHeld)}</dd>
          <dt className="text-base font-semibold">
            <span aria-hidden="true" className="max-sm:hidden">= </span>
            {inFavour ? 'In your favour' : 'Net payable'}
          </dt>
          <dd className="text-right text-base font-semibold sm:text-left">{formatRupees(Math.abs(position.net))}</dd>
        </dl>
      </div>
      {canSetOff && position.creditHeld > 0 && position.outstanding > 0 && (
        <Button type="button" variant="outline" className="h-9 shrink-0 text-sm" aria-haspopup="dialog" onClick={(event) => onSetOff(event.currentTarget)}>
          Set off credit
        </Button>
      )}
    </section>
  );
}
