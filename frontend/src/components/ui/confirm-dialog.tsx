'use client';

import { useCallback, useId, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export type ConfirmRequest = {
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
};

export type PromptRequest = ConfirmRequest & { inputLabel: string };

type AskRequest = ConfirmRequest & { inputLabel?: string };

/** The control focus should return to. A menu item unmounts with its menu, so it hands back the menu's trigger. */
function returnTarget(active: Element | null): HTMLElement | null {
  const menu = active?.closest('[role="menu"]');
  const trigger = menu?.getAttribute('aria-labelledby');
  if (trigger) return document.getElementById(trigger);
  return active instanceof HTMLElement && active !== document.body ? active : null;
}

function useAsk(): [(request: AskRequest) => Promise<string | null>, ReactNode] {
  const [request, setRequest] = useState<AskRequest | null>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const resolver = useRef<((answer: string | null) => void) | null>(null);
  const inputId = useId();
  const opener = useRef<HTMLElement | null>(null);

  const ask = useCallback((next: AskRequest) => {
    resolver.current?.(null);
    opener.current = returnTarget(document.activeElement);
    setRequest(next);
    setText('');
    setOpen(true);
    return new Promise<string | null>((resolve) => { resolver.current = resolve; });
  }, []);

  const settle = (answer: string | null) => {
    resolver.current?.(answer);
    resolver.current = null;
    setOpen(false);
  };

  const answer = text.trim();
  const dialog = (
    <Dialog open={open} onOpenChange={(next: boolean) => { if (!next) settle(null); }}>
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
        {request?.inputLabel && (
          <div className="space-y-2">
            <Label htmlFor={inputId}>{request.inputLabel}</Label>
            <Textarea id={inputId} value={text} onChange={(event) => setText(event.target.value)} rows={3} />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => settle(null)}>Cancel</Button>
          <Button
            variant={request?.destructive ? 'destructive' : 'default'}
            disabled={Boolean(request?.inputLabel) && !answer}
            onClick={() => settle(answer)}
          >
            {request?.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return [ask, dialog];
}

/**
 * In-app replacement for window.confirm. `confirm(request)` resolves true only when the
 * confirm button is pressed; Cancel, Escape and clicking outside resolve false. On close, focus
 * returns to the control that asked, or to the menu trigger when a menu item asked.
 */
export function useConfirm(): [(request: ConfirmRequest) => Promise<boolean>, ReactNode] {
  const [ask, dialog] = useAsk();
  const confirm = useCallback((request: ConfirmRequest) => ask(request).then((answer) => answer !== null), [ask]);
  return [confirm, dialog];
}

/**
 * In-app replacement for window.prompt. Resolves the trimmed text when the confirm button is pressed;
 * that button stays disabled until the text is non-empty. Cancel, Escape and clicking outside resolve null.
 */
export const usePrompt: () => [(request: PromptRequest) => Promise<string | null>, ReactNode] = useAsk;
