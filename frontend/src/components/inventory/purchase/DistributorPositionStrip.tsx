'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import { formatRupees } from '@/lib/pharmacy-invoice-print';
import { Button } from '@/components/ui/button';
import type { DistributorPosition } from './purchase-register-model';

const POSITION_ENDPOINT = '/pharmacy/purchase-register/position';

export function useDistributorPosition(gstin: string) {
  const [version, setVersion] = useState(0);
  const [position, setPosition] = useState<DistributorPosition | null>(null);
  useEffect(() => {
    if (!gstin) {
      setPosition(null);
      return;
    }
    let live = true;
    apiClient.get<DistributorPosition>(POSITION_ENDPOINT, { distributorGstin: gstin }).then(
      (loaded) => live && setPosition(loaded),
      () => live && setPosition(null),
    );
    return () => {
      live = false;
    };
  }, [gstin, version]);
  const refresh = useCallback(() => setVersion((current) => current + 1), []);
  return { position: position && position.gstin === gstin ? position : null, refresh };
}

export const settableCredit = (position: DistributorPosition) => Math.min(position.creditHeld, position.outstanding);

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
  const settable = settableCredit(position);
  return (
    <section
      aria-label={`${name} position across all bills`}
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-border bg-muted px-3 py-2"
    >
      <div className="flex min-w-0 flex-1 basis-64 flex-col gap-0.5">
        <p className="text-sm">
          <span className="font-semibold">{name}</span> · across all bills, not just this period
        </p>
        <dl className="grid grid-cols-[auto_auto] justify-between gap-x-3 text-sm tabular-nums sm:flex sm:flex-wrap sm:items-baseline sm:justify-start sm:gap-x-1.5">
          <dt>Due</dt>
          <dd className="whitespace-nowrap text-right font-semibold sm:text-left">{formatRupees(position.outstanding)}</dd>
          <dt>
            <span aria-hidden="true" className="max-sm:hidden">− </span>Credit held
          </dt>
          <dd className="whitespace-nowrap text-right font-semibold sm:text-left">{formatRupees(position.creditHeld)}</dd>
          <dt className="text-base font-semibold">
            <span aria-hidden="true" className="max-sm:hidden">= </span>
            {inFavour ? 'In your favour' : 'Net payable'}
          </dt>
          <dd className="whitespace-nowrap text-right text-base font-semibold sm:text-left">{formatRupees(Math.abs(position.net))}</dd>
        </dl>
      </div>
      {canSetOff && settable > 0.005 && (
        <Button
          type="button"
          variant="outline"
          className="h-10 shrink-0 text-sm max-sm:w-full sm:h-9"
          aria-haspopup="dialog"
          onClick={(event) => onSetOff(event.currentTarget)}
        >
          Set off all {formatRupees(settable)}
        </Button>
      )}
    </section>
  );
}
