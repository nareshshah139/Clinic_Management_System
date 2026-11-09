"use client";

import React, { useCallback, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { overbookOfferFrom, overbookQuestion, type OverbookOffer } from '@/lib/overbooking';

/**
 * @cc [owner:nareshshah139,label:product] overbook-needs-confirmation
 * A booking or reschedule MUST send allowOverbook only after the user confirms the
 * "book anyway" dialog for a 409 whose overbook.allowed is true. Cancelling sends nothing.
 */
export function useOverbookConfirm() {
  const [offer, setOffer] = useState<OverbookOffer | null>(null);
  const answer = useRef<((confirmed: boolean) => void) | null>(null);

  const settle = useCallback((confirmed: boolean) => {
    answer.current?.(confirmed);
    answer.current = null;
    setOffer(null);
  }, []);

  /**
   * Sends without the flag. When the server offers to overbook, asks the user and resends with it.
   * Resolves to null when the user declines; any other error is rethrown unchanged.
   */
  const sendWithOverbookConfirm = useCallback(async <T,>(send: (allowOverbook: boolean) => Promise<T>): Promise<T | null> => {
    try {
      return await send(false);
    } catch (error) {
      const offered = overbookOfferFrom(error);
      if (!offered?.allowed) throw error;
      const confirmed = await new Promise<boolean>((resolve) => {
        answer.current = resolve;
        setOffer(offered);
      });
      return confirmed ? send(true) : null;
    }
  }, []);

  const overbookDialog = (
    <Dialog open={offer !== null} onOpenChange={(open: boolean) => { if (!open) settle(false); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Overbook this slot?</DialogTitle>
          <DialogDescription>{offer ? overbookQuestion(offer) : ''}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => settle(false)}>Cancel</Button>
          <Button onClick={() => settle(true)}>Book anyway</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { sendWithOverbookConfirm, overbookDialog };
}
