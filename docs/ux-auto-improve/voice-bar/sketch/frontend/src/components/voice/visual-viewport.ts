// Repo path: frontend/src/components/voice/visual-viewport.ts
// iOS Safari ignores `interactive-widget`, so the on-screen keyboard overlays the page instead of
// shrinking it. While the bar's text box has focus, this sizes the shell to the visual viewport so
// the bar sits just above the keyboard. Android Chrome resizes the layout itself
// (app/dashboard/layout.tsx viewport export), and there the pure function returns null.

/** CSS variables the shell root in dashboard-layout.tsx reads, with 100dvh and 0px fallbacks. */
export const SHELL_HEIGHT_VAR = '--voice-shell-height';
export const SHELL_OFFSET_VAR = '--voice-shell-offset';

/** A visual viewport shorter than the window by less than this is a browser bar, not a keyboard. */
export const KEYBOARD_MIN_PX = 80;

export interface ViewportSample {
  innerHeight: number;          // window.innerHeight (layout viewport)
  vvHeight: number;             // window.visualViewport.height
  vvOffsetTop: number;          // window.visualViewport.offsetTop
}

export interface ShellBox { heightPx: number; offsetTopPx: number }

/**
 * @cc [owner:nareshshah139,label:accessibility] voice-bar-above-keyboard
 * While the bar's text box has focus and an on-screen keyboard overlays the page, the shell MUST be
 * sized to the visual viewport so the bar stays above the keyboard; otherwise no override applies.
 */
export function shellBoxFor(sample: ViewportSample, composerFocused: boolean): ShellBox | null {
  // !composerFocused -> null
  // sample.innerHeight - sample.vvHeight < KEYBOARD_MIN_PX -> null
  // -> { heightPx: Math.round(sample.vvHeight), offsetTopPx: Math.max(0, Math.round(sample.vvOffsetTop)) }
  throw new Error('not implemented');
}

/**
 * Listens to window.visualViewport `resize` and `scroll` while `composerFocused`, and writes
 * SHELL_HEIGHT_VAR / SHELL_OFFSET_VAR on document.documentElement from shellBoxFor(). Removes both
 * variables when focus leaves, on null, and on unmount. No-op without window.visualViewport.
 */
export function useVisualViewportShell(composerFocused: boolean): void {
  throw new Error('not implemented');
}
