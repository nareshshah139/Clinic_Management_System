"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

export type ConfirmationOptions = {
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: "default" | "destructive";
};

type PendingConfirmation = {
  id: number;
  owner: symbol;
  options: ConfirmationOptions;
  resolve: (accepted: boolean) => void;
  opener: HTMLElement | null;
};

type ConfirmationContextValue = {
  request: (owner: symbol, options: ConfirmationOptions) => Promise<boolean>;
  cancel: (owner: symbol) => void;
};

const ConfirmationContext = React.createContext<ConfirmationContextValue | null>(null);

/**
 * @cc [owner:nareshshah139,label:product] confirmation-explicit-acceptance
 * Only the affirmative button may resolve true. Cancel, Escape, close and provider teardown
 * MUST resolve false. An overlapping request MUST resolve false without replacing the active one.
 */
/**
 * @cc [owner:nareshshah139,label:accessibility] confirmation-focus
 * Opening MUST focus Cancel and closing MUST restore the connected invoking control.
 * The dialog MUST expose its title and full multiline description to assistive technology.
 */
export function ConfirmationProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = React.useState<PendingConfirmation | null>(null);
  const active = React.useRef<PendingConfirmation | null>(null);
  const nextId = React.useRef(0);
  const mounted = React.useRef(false);
  const cancelButton = React.useRef<HTMLButtonElement>(null);

  const settle = React.useCallback((accepted: boolean) => {
    const current = active.current;
    if (!current) return;
    active.current = null;
    setPending(null);
    current.resolve(accepted);
  }, []);

  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const current = active.current;
      active.current = null;
      current?.resolve(false);
    };
  }, []);

  const request = React.useCallback((owner: symbol, options: ConfirmationOptions) => {
    if (!mounted.current || active.current) return Promise.resolve(false);
    return new Promise<boolean>(resolve => {
      const current: PendingConfirmation = {
        id: ++nextId.current,
        owner,
        options,
        resolve,
        opener: document.activeElement instanceof HTMLElement ? document.activeElement : null,
      };
      active.current = current;
      setPending(current);
    });
  }, []);

  const cancel = React.useCallback((owner: symbol) => {
    if (active.current?.owner === owner) settle(false);
  }, [settle]);
  const context = React.useMemo(() => ({ request, cancel }), [request, cancel]);

  return (
    <ConfirmationContext.Provider value={context}>
      {children}
      {pending && (
        <Dialog key={pending.id} open onOpenChange={(open: boolean) => { if (!open) settle(false); }}>
          <DialogContent
            role="alertdialog"
            className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
            onOpenAutoFocus={(event: Event) => { event.preventDefault(); cancelButton.current?.focus(); }}
            onCloseAutoFocus={(event: Event) => {
              event.preventDefault();
              if (pending.opener?.isConnected) pending.opener.focus();
            }}
            onPointerDownOutside={(event: Event) => event.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle>{pending.options.title}</DialogTitle>
              <DialogDescription className="whitespace-pre-wrap break-words">
                {pending.options.description}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button ref={cancelButton} type="button" variant="outline" onClick={() => settle(false)}>
                Cancel
              </Button>
              <Button type="button" variant={pending.options.variant ?? "default"} onClick={() => settle(true)}>
                {pending.options.confirmLabel ?? "Continue"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </ConfirmationContext.Provider>
  );
}

/**
 * @cc [owner:nareshshah139,label:state] confirmation-owner-lifetime
 * Unmounting the caller MUST cancel its pending request. Calls without a mounted provider or
 * after caller teardown MUST resolve false without opening a native browser popup.
 */
export function useConfirm() {
  const context = React.useContext(ConfirmationContext);
  const owner = React.useRef(Symbol("confirmation-owner"));
  const mounted = React.useRef(false);
  React.useEffect(() => {
    mounted.current = true;
    const identity = owner.current;
    return () => {
      mounted.current = false;
      context?.cancel(identity);
    };
  }, [context]);
  return React.useCallback((options: ConfirmationOptions) => {
    if (!mounted.current || !context) return Promise.resolve(false);
    return context.request(owner.current, options);
  }, [context]);
}
