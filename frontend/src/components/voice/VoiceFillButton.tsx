'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Mic, Square } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useVoiceFill, type VoiceFillPhase } from '@/hooks/useVoiceFill';
import { cn } from '@/lib/utils';
import { fetchVoiceFillStatus, type VoiceFillApply, type VoiceFillFormId } from '@/lib/voice-fill';

interface VoiceFillButtonProps {
  form: VoiceFillFormId;
  apply: VoiceFillApply;
  hint: string;
  disabled?: boolean;
  /** True from the first click until the fill is applied, so a sibling mic can step aside. */
  onBusyChange?: (busy: boolean) => void;
  className?: string;
}

export function formatElapsed(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function useElapsedSeconds(phase: VoiceFillPhase): number {
  const startedAt = phase.kind === 'listening' ? phase.startedAt : null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAt === null) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [startedAt]);
  return startedAt === null ? 0 : (now - startedAt) / 1000;
}

// Long enough to notice and reach Undo; hovering the pill or focusing Undo holds it open.
export const FILLED_CONFIRMATION_MS = 12_000;

const fieldCount = (n: number) => `${n} ${n === 1 ? 'field' : 'fields'}`;

function statusText(phase: VoiceFillPhase): string {
  switch (phase.kind) {
    case 'idle':
      return '';
    case 'listening':
      return 'Listening. Click to stop and fill, or press Escape to cancel.';
    case 'filling':
      return 'Filling…';
    case 'filled':
      return `Filled ${fieldCount(phase.labels.length)}: ${phase.labels.join(', ')}`;
  }
}

/** Classes for the mic pill in every phase. */
export function voicePillClass(phase: VoiceFillPhase): string {
  return cn(
    'inline-flex h-8 shrink-0 items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-full px-2 text-sm font-medium',
    'transition-[max-width,background-color,color] duration-200 ease-out motion-reduce:transition-none',
    'outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50',
    phase.kind === 'idle' && 'max-w-8 text-muted-foreground hover:bg-accent hover:text-accent-foreground',
    phase.kind === 'listening' && 'max-w-40 bg-destructive-soft px-3 text-destructive-text',
    phase.kind === 'filling' && 'max-w-40 cursor-default bg-muted px-3 text-muted-foreground',
    phase.kind === 'filled' && 'max-w-40 pl-2.5 pr-1.5 hover:bg-success-border/40',
  );
}

export function VoicePillFace({ phase, busyText }: { phase: VoiceFillPhase; busyText: string }) {
  const elapsed = useElapsedSeconds(phase);
  switch (phase.kind) {
    case 'idle':
      return <Mic className="size-4 shrink-0" aria-hidden="true" />;
    case 'listening':
      return (
        <>
          <span className="size-2 shrink-0 animate-pulse rounded-full bg-destructive motion-reduce:animate-none" aria-hidden="true" />
          <span className="tabular-nums">{formatElapsed(elapsed)}</span>
          <Square className="size-3 shrink-0 fill-current" aria-hidden="true" />
        </>
      );
    case 'filling':
      return (
        <>
          <Spinner className="size-3.5" aria-hidden="true" />
          <span>{busyText}</span>
        </>
      );
    case 'filled':
      return (
        <>
          <Check className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="tabular-nums">{phase.labels.length} filled</span>
        </>
      );
  }
}

/** While listening, Escape cancels the recording without also closing a surrounding dialog. */
export function useCancelOnEscape(listening: boolean, cancel: () => void) {
  useEffect(() => {
    if (!listening) return;
    // Window capture runs before a surrounding dialog's own Escape handler, so cancelling does not also close it.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      event.preventDefault();
      cancel();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [listening, cancel]);
}

export function VoiceFillButton({ form, apply, hint, disabled, onBusyChange, className }: VoiceFillButtonProps) {
  const [available, setAvailable] = useState(false);
  const { phase, toggle, cancel, undo, dismiss } = useVoiceFill({ form, apply });
  const pillRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [hovered, setHovered] = useState(false);
  const [undoFocused, setUndoFocused] = useState(false);

  const idle = phase.kind === 'idle';
  const filled = phase.kind === 'filled';
  const working = phase.kind === 'listening' || phase.kind === 'filling';
  useEffect(() => {
    onBusyChange?.(working);
  }, [working, onBusyChange]);

  useEffect(() => {
    if (!filled || hovered || undoFocused) return;
    const timer = window.setTimeout(dismiss, FILLED_CONFIRMATION_MS);
    return () => window.clearTimeout(timer);
  }, [filled, hovered, undoFocused, dismiss]);

  useEffect(() => {
    if (!filled) return;
    // Editing the form or clicking elsewhere means the fill was seen; the pill steps back to the mic.
    const onPointerDown = (event: PointerEvent) => {
      if (!pillRef.current?.contains(event.target as Node)) dismiss();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('input', dismiss, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('input', dismiss, true);
      // Undo can unmount while focused, which fires no blur.
      setUndoFocused(false);
    };
  }, [filled, dismiss]);

  useEffect(() => {
    let cancelled = false;
    void fetchVoiceFillStatus().then((ok) => {
      if (!cancelled) setAvailable(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useCancelOnEscape(phase.kind === 'listening', cancel);

  if (!available) return null;

  const busy = phase.kind === 'filling';
  const ariaLabel = {
    idle: 'Fill form by voice',
    listening: 'Stop recording and fill form',
    filling: 'Filling…',
    filled: filled ? `${phase.labels.length} filled. Fill by voice again` : '',
  }[phase.kind];

  const onUndo = () => {
    undo();
    // Undo unmounts with the confirmation; keep focus in the dialog on the mic.
    buttonRef.current?.focus();
  };

  const button = (
    <button
      ref={buttonRef}
      type="button"
      onClick={toggle}
      disabled={(idle || filled) && disabled}
      aria-disabled={busy || undefined}
      aria-label={ariaLabel}
      className={voicePillClass(phase)}
    >
      <VoicePillFace phase={phase} busyText="Filling…" />
    </button>
  );

  return (
    <>
      <span role="status" aria-live="polite" className="sr-only">{statusText(phase)}</span>
      <span
        ref={pillRef}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        className={cn(
          'inline-flex shrink-0 items-center rounded-full',
          filled && 'bg-success-soft pr-1 text-success-text motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200',
          className,
        )}
      >
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>{button}</TooltipTrigger>
            {idle && (
              <TooltipContent className="max-w-64 text-center">
                <div className="font-medium">Fill by voice</div>
                <div className="text-xs text-muted-foreground">{hint}</div>
              </TooltipContent>
            )}
            {filled && (
              <TooltipContent className="max-w-64">
                <div className="font-medium">Filled {fieldCount(phase.labels.length)}</div>
                <div className="text-xs text-muted-foreground">{phase.labels.join(', ')}</div>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
        {filled && (
          <button
            type="button"
            onClick={onUndo}
            onFocus={() => setUndoFocused(true)}
            onBlur={() => setUndoFocused(false)}
            aria-label="Undo voice fill"
            className="h-6 rounded-full px-2 text-sm font-semibold outline-none hover:bg-success-border/40 focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            Undo fill
          </button>
        )}
      </span>
    </>
  );
}
