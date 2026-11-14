'use client';

import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export type ConfirmRequest = {
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
};

/** The control focus should return to. A menu item unmounts with its menu, so it hands back the menu's trigger. */
function returnTarget(active: Element | null): HTMLElement | null {
  const menu = active?.closest('[role="menu"]');
  const trigger = menu?.getAttribute('aria-labelledby');
  if (trigger) return document.getElementById(trigger);
  return active instanceof HTMLElement && active !== document.body ? active : null;
}

/**
 * In-app replacement for window.confirm. `confirm(request)` resolves true only when the
 * confirm button is pressed; Cancel, Escape and clicking outside resolve false. On close, focus
 * returns to the control that asked, or to the menu trigger when a menu item asked.
 */
export function useConfirm(): [(request: ConfirmRequest) => Promise<boolean>, ReactNode] {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const [open, setOpen] = useState(false);
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const opener = useRef<HTMLElement | null>(null);

  const confirm = useCallback((next: ConfirmRequest) => {
    resolver.current?.(false);
    opener.current = returnTarget(document.activeElement);
    setRequest(next);
    setOpen(true);
    return new Promise<boolean>((resolve) => { resolver.current = resolve; });
  }, []);

  const settle = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOpen(false);
  };

  const dialog = (
    <Dialog open={open} onOpenChange={(next: boolean) => { if (!next) settle(false); }}>
      <DialogContent
        role="alertdialog"
        showCloseButton={false}
        className="sm:max-w-md"
        onCloseAutoFocus={(event: Event) => {
          if (!opener.current?.isConnected) return;
          event.preventDefault();
          opener.current.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{request?.title}</DialogTitle>
          {request?.description && <DialogDescription>{request.description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => settle(false)}>Cancel</Button>
          <Button variant={request?.destructive ? 'destructive' : 'default'} onClick={() => settle(true)}>{request?.confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return [confirm, dialog];
}
