'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils';

const GAP = 8;
const EDGE = 16;
const ARM_DELAY_MS = 300;

function anchoredStyle(anchor: HTMLElement, width: number, height: number): CSSProperties | undefined {
  if (window.innerWidth < 640) return undefined;
  const rect = anchor.getBoundingClientRect();
  const left = Math.min(Math.max(EDGE, rect.right - width), window.innerWidth - width - EDGE);
  const top = rect.bottom + GAP + height <= window.innerHeight - EDGE ? rect.bottom + GAP : Math.max(EDGE, rect.top - GAP - height);
  return { left, top, width };
}

export function ActionDialog({
  anchor,
  width = 400,
  title,
  description,
  saving,
  initialFocus,
  returnFocus,
  onClose,
  onSubmit,
  children,
}: {
  anchor: HTMLElement;
  width?: number;
  title: ReactNode;
  description: ReactNode;
  saving: boolean;
  initialFocus: RefObject<HTMLElement | null>;
  returnFocus: RefObject<boolean>;
  onClose: () => void;
  onSubmit: () => void;
  children: ReactNode;
}) {
  const [style, setStyle] = useState<CSSProperties>();
  const armed = useRef(false);
  const placed = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      armed.current = true;
    }, ARM_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  const place = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node || placed.current) return;
      placed.current = true;
      setStyle(anchoredStyle(anchor, width, node.offsetHeight));
    },
    [anchor, width],
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!saving) onSubmit();
  };
  const enterSubmits = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== 'Enter' || event.target instanceof HTMLButtonElement) return;
    event.preventDefault();
    if (armed.current && !event.repeat && !saving) onSubmit();
  };

  return (
    <DialogPrimitive.Root open onOpenChange={(open: boolean) => !open && !saving && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 sm:bg-transparent" />
        <DialogPrimitive.Content
          ref={place}
          style={style}
          onOpenAutoFocus={(event: Event) => {
            event.preventDefault();
            initialFocus.current?.focus();
          }}
          onCloseAutoFocus={(event: Event) => {
            event.preventDefault();
            if (returnFocus.current) anchor.focus();
          }}
          onPointerDownOutside={(event: Event) => {
            if (!armed.current) event.preventDefault();
          }}
          className={cn(
            'fixed z-50 flex flex-col gap-3 border border-border bg-popover p-4 text-popover-foreground shadow-xl outline-none',
            style
              ? 'max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-lg'
              : 'inset-x-0 bottom-0 max-h-[90dvh] overflow-y-auto rounded-t-xl pb-[max(1rem,env(safe-area-inset-bottom))] sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/3 sm:w-[25rem] sm:-translate-x-1/2 sm:rounded-lg',
          )}
        >
          <form onSubmit={submit} onKeyDown={enterSubmits} className="flex flex-col gap-3" noValidate>
            <div className="flex flex-col gap-1">
              <DialogPrimitive.Title className="text-base font-semibold leading-snug">{title}</DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-sm text-foreground">{description}</DialogPrimitive.Description>
            </div>
            {children}
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export const DialogClose = DialogPrimitive.Close;
