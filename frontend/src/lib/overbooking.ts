/** The `overbook` part of a 409 from booking or rescheduling. */
export interface OverbookOffer {
  /** Whether resending with allowOverbook would be accepted. */
  allowed: boolean;
  booked: number;
  limit: number;
}

/** The server's offer to book anyway, or null when the error is anything else. */
export function overbookOfferFrom(error: unknown): OverbookOffer | null {
  const e = error as { status?: number; body?: { overbook?: unknown } } | null;
  const offer = e?.status === 409 ? (e.body?.overbook as Partial<OverbookOffer> | undefined) : undefined;
  if (!offer || typeof offer.allowed !== 'boolean' || !Number.isInteger(offer.booked) || !Number.isInteger(offer.limit)) return null;
  return { allowed: offer.allowed, booked: offer.booked as number, limit: offer.limit as number };
}

export function overbookQuestion({ booked, limit }: OverbookOffer): string {
  return `This slot already has ${booked} patient${booked === 1 ? '' : 's'}. Book anyway? (${booked + 1} of ${limit} allowed)`;
}

/** Spread into a booking or reschedule body; false sends nothing, as before overbooking existed. */
export const overbookFlag = (allowOverbook: boolean) => (allowOverbook ? { allowOverbook: true } : {});
