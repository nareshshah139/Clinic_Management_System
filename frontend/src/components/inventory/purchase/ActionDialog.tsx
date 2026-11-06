'use client';

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils';

const GAP = 8;
const EDGE = 16;
const ARM_DELAY_MS = 300;

export type DialogOutcome = 'done' | 'stay';
export type HandOff = (run: () => void) => void;

function anchoredStyle(anchor: HTMLElement, width: number, height: number): CSSProperties | undefined {
  if (window.innerWidth < 640) return undefined;
  const rect = anchor.getBoundingClientRect();
  const preferred = rect.left + rect.width / 2 < window.innerWidth / 2 ? rect.left : rect.right - width;
  const left = Math.min(Math.max(EDGE, preferred), window.innerWidth - width - EDGE);
  const below = rect.bottom + GAP;
  const roomBelow = window.innerHeight - EDGE - below;
  const roomAbove = rect.top - GAP - EDGE;
  if (height <= roomBelow || roomBelow >= roomAbove) return { left, top: below, width, maxHeight: Math.max(roomBelow, 240) };
  const capped = Math.min(height, roomAbove);
  return { left, top: Math.max(EDGE, rect.top - GAP - capped), width, maxHeight: roomAbove };
}

/**
 * A small dialog anchored to the row action that opened it. When onSubmit resolves 'done' the
 * caller has moved focus on (to the next row's action); any other close returns focus to the anchor.
 */
export function ActionDialog({
  anchor,
  width = 400,
  title,
  description,
  saving,
  initialFocus,
  onClose,
  onSubmit,
  footer,
  children,
}: {
  anchor: HTMLElement;
  width?: number;
  title: ReactNode;
  description: ReactNode;
  saving: boolean;
  initialFocus: RefObject<HTMLElement | null>;
  onClose: () => void;
  onSubmit: () => Promise<DialogOutcome>;
  footer: (handOff: HandOff) => ReactNode;
  children: ReactNode | ((handOff: HandOff) => ReactNode);
}) {
  const [style, setStyle] = useState<CSSProperties>();
  const armed = useRef(false);
  const handedOff = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      armed.current = true;
    }, ARM_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  const [node, setNode] = useState<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!node) return;
    const place = () => {
      const body = node.querySelector<HTMLElement>('[data-dialog-content]');
      const foot = node.querySelector<HTMLElement>('[data-dialog-footer]');
      if (!body) return;
      const next = anchoredStyle(anchor, width, body.offsetHeight + (foot?.offsetHeight ?? 0) + 30);
      setStyle((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
    };
    place();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
    const body = node.querySelector('[data-dialog-content]');
    if (body) observer?.observe(body);
    window.addEventListener('resize', place);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', place);
    };
  }, [node, anchor, width]);

  const run = async () => {
    if (saving) return;
    if ((await onSubmit()) === 'done') handedOff.current = true;
  };
  const handOff = (next: () => void) => {
    handedOff.current = true;
    next();
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run();
  };
  const enterSubmits = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== 'Enter' || event.target instanceof HTMLButtonElement || event.target instanceof HTMLTextAreaElement) return;
    event.preventDefault();
    if (armed.current && !event.repeat) void run();
  };

  return (
    <DialogPrimitive.Root open onOpenChange={(open: boolean) => !open && !saving && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 sm:bg-transparent" />
        <DialogPrimitive.Content
          ref={setNode}
          style={style}
          onOpenAutoFocus={(event: Event) => {
            event.preventDefault();
            initialFocus.current?.focus();
          }}
          onCloseAutoFocus={(event: Event) => {
            event.preventDefault();
            if (!handedOff.current && anchor.isConnected) anchor.focus();
          }}
          onPointerDownOutside={(event: Event) => {
            if (!armed.current) event.preventDefault();
          }}
          className={cn(
            'fixed z-50 flex flex-col border border-border bg-popover text-popover-foreground shadow-xl outline-none',
            style
              ? 'rounded-lg'
              : 'inset-x-0 bottom-0 max-h-[90dvh] rounded-t-xl sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/3 sm:max-h-[calc(100dvh-2rem)] sm:w-[25rem] sm:-translate-x-1/2 sm:rounded-lg',
          )}
        >
          <form onSubmit={submit} onKeyDown={enterSubmits} className="flex min-h-0 flex-1 flex-col" noValidate>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div data-dialog-content className="flex flex-col gap-3 p-4 pb-3">
                <div className="flex flex-col gap-1">
                  <DialogPrimitive.Title className="text-base font-semibold leading-snug">{title}</DialogPrimitive.Title>
                  <DialogPrimitive.Description className="text-sm text-foreground">{description}</DialogPrimitive.Description>
                </div>
                {typeof children === 'function' ? children(handOff) : children}
              </div>
            </div>
            <div data-dialog-footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
              {footer(handOff)}
            </div>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export const DialogClose = DialogPrimitive.Close;
