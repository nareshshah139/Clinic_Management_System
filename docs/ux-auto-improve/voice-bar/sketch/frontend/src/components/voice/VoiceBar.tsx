// Repo path: frontend/src/components/voice/VoiceBar.tsx
// The docked composer. Renders the model; every user action is store.send(event). Knows intents
// (through INTENTS and ProposalReview) but no page: it never imports a page component or setter.
// Existing components and tokens only: ui/textarea Textarea, ui/button Button, ui/spinner Spinner,
// lucide-react icons (Mic, Square, ArrowUp, Undo2, X). No new colours, fonts or radii.

'use client';

import type { JSX } from 'react';
import type { BarModel } from '@/lib/voice/machine';

/**
 * @cc [owner:nareshshah139,label:accessibility] voice-bar-keyboard
 * The bar MUST be fully operable by keyboard: Enter sends, Shift+Enter inserts a newline, Escape
 * discards a recording or dismisses a draft and returns focus to the element focused before the
 * shortcut, and Ctrl or Cmd plus / focuses the text box from anywhere, including from a text field.
 */
/**
 * @cc [owner:nareshshah139,label:accessibility] voice-bar-never-covers
 * The bar MUST sit in the shell's flow after main, never fixed over content, dialogs or footers;
 * its Apply row MUST stay outside the review's scroll area, and it MUST stay usable at 390 px wide
 * with the on-screen keyboard open.
 */
/**
 * @cc [owner:nareshshah139,label:accessibility] voice-bar-state-legible
 * Listening, writing down, working out, draft ready and applied MUST be announced in one polite
 * status region and failures in an alert; the text box and mic MUST keep their DOM nodes and focus
 * across phase changes.
 */
export function VoiceBar(): JSX.Element | null {
  // const registry = useVoiceRegistry(); if (!registry) return null
  // const [store] = useState(() => createVoiceBarStore({ transport: createTransport(), lookups: createLookups(),
  //                                                     clock: istClock, registry, now: Date.now }));
  // const model = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  // useEffect(() => { const off = store.subscribe(noop); return () => { off(); store.reset(); }; }, [store]);
  // const [composerFocused, setComposerFocused] = useState(false)
  // useVisualViewportShell(composerFocused)
  // const remembered = useRef<HTMLElement | null>(null)
  // useEffect: window keydown (capture): (e.ctrlKey || e.metaKey) && e.key === '/' && model.active ->
  //   e.preventDefault(); if (!barEl.contains(document.activeElement)) remembered.current = document.activeElement;
  //   composerRef.current?.focus()
  // store.attachFocus({ composer: () => composerRef.current?.focus(),
  //                     restore: () => remembered.current?.isConnected ? remembered.current.focus() : composerRef.current?.focus() })
  // useTicker(model.phase.phase === 'listening')          // 1 s re-render for "Listening 0:12" and "Stopping in N s"
  // if (!model.active) return null
  //
  // One element tree for every phase, so focus never jumps:
  // <section aria-label={COPY.barLabel} aria-busy={isBusy(phase)}
  //   className="shrink-0 border-t border-border bg-card px-4 md:px-6 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
  //  <div className="mx-auto w-full max-w-3xl">
  //   <p role="status" aria-live="polite">{statusLine(model, now)}</p>         // also the applied / undone line
  //   {failed notice && <div role="alert" className="rounded-lg border bg-destructive-soft text-destructive-text border-destructive-border p-3">
  //       {FAILURE_COPY[kind].message} {retryLabel && <Button onClick={() => send({ type: 'retry' })}>{retryLabel}</Button>}</div>}
  //   {applied notice && <div className="bg-success-soft text-success-text border-success-border ...">
  //       {canUndo && <Button variant="outline">{COPY.undo}</Button>} <Button variant="ghost">{COPY.done}</Button></div>}
  //   {review|refining|applying && <ProposalReview … scrollClassName={composerFocused ? 'max-h-[30dvh]' : 'max-h-[45dvh]'} />}
  //   <div className="flex items-end gap-2">                                   // input row, always present
  //     {listening ? <span className="flex-1">{red dot animate-pulse motion-reduce:animate-none} {COPY.listening(mmss)} {COPY.listeningHint}</span>
  //                : <Textarea ref={composerRef} rows={1} className="max-h-28 text-base md:text-sm"
  //                    aria-label={COPY.textBoxLabel} placeholder={COPY.placeholder[active.intent]}
  //                    disabled={isBusy(phase) || configured === false}
  //                    onFocus/onBlur -> setComposerFocused, onKeyDown={composerKeys} />}
  //     <Button variant="outline" size="icon" className="size-11 md:size-9" aria-label={listening ? COPY.micStop : COPY.micIdle} />
  //     {listening && <Button variant="ghost" aria-label={COPY.discardRecordingLabel} />}
  //     <Button size="icon" className="size-11 md:size-9" aria-label={COPY.sendLabel} />
  //     <kbd className="hidden md:inline">{isMac ? COPY.shortcutHintMac : COPY.shortcutHint}</kbd>
  //   </div>
  //  </div>
  // </section>
  //
  // composerKeys: Enter without Shift -> preventDefault, send({ type: 'send' }); Escape -> send({ type: 'escape' })
  // window Escape while listening, review or a notice shows -> send({ type: 'escape' })
  throw new Error('not implemented');
}

/** Pure: the one line for the polite status region. */
export function statusLine(model: BarModel, nowMs: number): string {
  // configured === false                     -> COPY.notConfigured
  // listening: since === null ? COPY.openingMic : elapsed >= WARN_AT_MS ? COPY.listeningEnding(s) : COPY.listening(m:ss)
  // transcribing -> COPY.transcribing; interpreting -> COPY.working; refining -> COPY.replanning
  // review: added.length ? COPY.visitPartial(added, unsortedCount) : COPY.draftReady
  // idle notice: applied -> COPY.applied.*(summary); undone -> COPY.undone(result); discarded -> COPY.discarded
  //   page-changed -> COPY.pageChanged; too-long -> COPY.tooLong(limit); failed -> '' (the alert carries it)
  throw new Error('not implemented');
}
