'use client';

import { useEffect, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useVoiceFill, type VoiceFillPhase } from '@/hooks/useVoiceFill';
import { cn } from '@/lib/utils';
import { fetchVoiceFillStatus, type VoiceFillApplyResult, type VoiceFillFields, type VoiceFillFormId } from '@/lib/voice-fill';

interface VoiceFillButtonProps {
  form: VoiceFillFormId;
  apply: (fields: VoiceFillFields) => VoiceFillApplyResult;
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

function useElapsedSeconds(phase: VoiceFillPhase): number {
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

const STATUS_TEXT: Record<VoiceFillPhase['kind'], string> = {
  idle: '',
  listening: 'Listening. Click to stop and fill, or press Escape to cancel.',
  transcribing: 'Transcribing…',
  filling: 'Filling…',
};

export function VoiceFillButton({ form, apply, hint, disabled, onBusyChange, className }: VoiceFillButtonProps) {
  const [available, setAvailable] = useState(false);
  const { phase, toggle, cancel } = useVoiceFill({ form, apply });
  const elapsed = useElapsedSeconds(phase);

  const idle = phase.kind === 'idle';
  useEffect(() => {
    onBusyChange?.(!idle);
  }, [idle, onBusyChange]);

  useEffect(() => {
    let cancelled = false;
    void fetchVoiceFillStatus().then((ok) => {
      if (!cancelled) setAvailable(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (phase.kind !== 'listening') return;
    // Window capture runs before a surrounding dialog's own Escape handler, so cancelling does not also close it.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      event.preventDefault();
      cancel();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [phase.kind, cancel]);

  if (!available) return null;

  const busy = phase.kind === 'transcribing' || phase.kind === 'filling';

  const button = (
    <button
      type="button"
      onClick={toggle}
      disabled={idle && disabled}
      aria-disabled={busy || undefined}
      aria-label={idle ? 'Fill form by voice' : phase.kind === 'listening' ? 'Stop recording and fill form' : STATUS_TEXT[phase.kind]}
      className={cn(
        'inline-flex h-8 shrink-0 items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-full px-2 text-sm font-medium',
        'transition-[max-width,background-color,color] duration-200 ease-out motion-reduce:transition-none',
        'outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50',
        idle && 'max-w-8 text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        phase.kind === 'listening' && 'max-w-40 bg-destructive-soft px-3 text-destructive-text',
        busy && 'max-w-40 cursor-default bg-muted px-3 text-muted-foreground',
        className,
      )}
    >
      {idle && <Mic className="size-4 shrink-0" aria-hidden="true" />}
      {phase.kind === 'listening' && (
        <>
          <span className="size-2 shrink-0 animate-pulse rounded-full bg-destructive motion-reduce:animate-none" aria-hidden="true" />
          <span className="tabular-nums">{formatElapsed(elapsed)}</span>
          <Square className="size-3 shrink-0 fill-current" aria-hidden="true" />
        </>
      )}
      {busy && (
        <>
          <Spinner className="size-3.5" aria-hidden="true" />
          <span>{STATUS_TEXT[phase.kind]}</span>
        </>
      )}
    </button>
  );

  return (
    <>
      <span role="status" aria-live="polite" className="sr-only">{STATUS_TEXT[phase.kind]}</span>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          {idle && (
            <TooltipContent className="max-w-64 text-center">
              <div className="font-medium">Fill by voice</div>
              <div className="text-xs text-muted-foreground">{hint}</div>
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>
    </>
  );
}
