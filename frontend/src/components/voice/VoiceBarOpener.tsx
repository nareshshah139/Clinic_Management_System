'use client';

import { Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { VOICE_BAR_COPY as COPY } from '@/lib/voice-bar';
import { useVoiceBar } from './VoiceBarProvider';
import { useVoiceBarShown } from './useVoiceBarShown';

const OPENER_ATTRIBUTE = 'data-voice-bar-opener';

/** Focuses the opener that is on screen; one is mounted per header and CSS hides the other. */
export function focusVoiceBarOpener(): void {
  const openers = Array.from(document.querySelectorAll<HTMLElement>(`[${OPENER_ATTRIBUTE}]`));
  const visible = openers.find((opener) => opener.getClientRects().length > 0) ?? openers[0];
  visible?.focus();
}

/**
 * @cc [owner:nareshshah139,label:product] voice-bar-collapse-only-when-idle
 * The voice bar MUST offer Hide only while nothing is in flight, MUST take no layout space while hidden, and a hidden bar MUST be reopenable from a visible control and from Ctrl+/ or Cmd+/.
 */
export function VoiceBarOpener({ className }: { className?: string }) {
  const shown = useVoiceBarShown();
  const { collapsed, setCollapsed } = useVoiceBar();
  if (!shown || !collapsed) return null;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      {...{ [OPENER_ATTRIBUTE]: '' }}
      className={cn('size-11 md:size-9', className)}
      aria-label={COPY.showBar}
      aria-expanded="false"
      title={COPY.showBarTitle}
      onClick={() => setCollapsed(false)}
    >
      <Mic aria-hidden="true" />
    </Button>
  );
}
