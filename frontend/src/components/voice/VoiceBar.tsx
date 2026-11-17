'use client';

import { useCallback, useEffect, useId, useRef, useState, type Dispatch, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react';
import { ArrowUp, ChevronDown, ChevronUp, Mic, Square } from 'lucide-react';
import { useDashboardUser } from '@/components/layout/dashboard-user-context';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { NativeSelect } from '@/components/ui/native-select';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import {
  MicUnavailableError,
  startDictationSession,
  type DictationNotice,
  type DictationPhase,
  type DictationSession,
} from '@/lib/dictation-session';
import { cn, getErrorMessage } from '@/lib/utils';
import {
  VOICE_BAR_COPY as COPY,
  type VoiceBarEvent,
  type VoiceBarRetry,
  type VoiceBarState,
  type VoiceBarTarget,
} from '@/lib/voice-bar';
import {
  flashFilledElements,
  fetchVoiceFillStatus,
  mergeVoiceFillFields,
  requestVoiceFillFromText,
} from '@/lib/voice-fill';
import { useVoiceBar } from './VoiceBarProvider';
import { VoiceCommandDialog } from './VoiceCommandDialog';
import { formatElapsed, useCancelOnEscape, useElapsedSeconds } from './VoiceFillButton';

// Matches useAudioRecorder's clip cap, so a long dictation is cut off at the same point on every voice surface.
const MAX_SPEECH_MS = 40 * 60_000;
// Well under the server's 60000-character cap, even for 3-byte scripts.
const MAX_TYPED_CHARS = 8000;

function statusText(state: VoiceBarState, formLabel: string): string {
  switch (state.kind) {
    case 'idle':
      return state.notice ?? '';
    case 'listening':
      return { connecting: COPY.opening, listening: COPY.listening, finishing: COPY.finishing }[state.phase];
    case 'working':
      return COPY.working;
    case 'draft':
      return `${COPY.heard} “${state.heard}”. ${COPY.draftReady(state.lines.length)}`;
    case 'applied':
      return `${COPY.filled(formLabel, state.labels)} ${state.opened ? COPY.notSavedDialog(formLabel) : COPY.notSavedWithUndo}`;
    case 'failed':
    case 'confirming':
      return '';
  }
}

const joinSpoken = (typed: string, spoken: string) => [typed.trim(), spoken.trim()].filter(Boolean).join(' ');

function micFailureMessage(error: unknown): string {
  if (!(error instanceof MicUnavailableError)) return COPY.cannotRecord;
  switch (error.reason) {
    case 'denied':
      return COPY.micBlocked;
    case 'unsupported':
      return COPY.cannotRecord;
    case 'busy':
      return error.message;
  }
}

interface SpeechEntry {
  session: DictationSession | null;
  stopRequested: boolean;
}

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta']);

/**
 * @cc [owner:nareshshah139,label:product] voice-bar-undo-only-while-form-untouched
 * The voice bar MUST stop offering Undo once the user clicks, types, pastes, cuts or drops anywhere on the page outside the bar, MUST do so only after the page has handled that event, and MUST NOT change the bar's height or move page content when it does.
 */
function useDropUndoWhenFormTouched(
  barRef: RefObject<HTMLElement | null>,
  state: VoiceBarState,
  dispatch: Dispatch<VoiceBarEvent>,
) {
  const undoable = state.kind === 'applied' && state.undo !== null;
  useEffect(() => {
    if (!undoable) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const touch = (event: Event) => {
      if (event.target instanceof Node && barRef.current?.contains(event.target)) return;
      if (event instanceof KeyboardEvent && (MODIFIER_KEYS.has(event.key) || (event.key === '/' && (event.ctrlKey || event.metaKey)))) return;
      // Dispatching inside the event would re-render the bar before the page's own handlers have run.
      clearTimeout(timer);
      timer = setTimeout(() => dispatch({ type: 'form-touched' }), 0);
    };
    const types = ['click', 'input', 'keydown', 'drop', 'paste', 'cut'] as const;
    for (const type of types) document.addEventListener(type, touch, true);
    return () => {
      clearTimeout(timer);
      for (const type of types) document.removeEventListener(type, touch, true);
    };
  }, [undoable, barRef, dispatch]);
}

/**
 * @cc [owner:nareshshah139,label:product] voice-bar-speech-is-reviewed-like-text
 * Speech in the voice bar MUST only appear in the bar's text box while it is spoken and MUST then go through the same typed path and review as typed text, never straight into a form.
 */
function useSpeechIntoBox() {
  const [speech, setSpeech] = useState<{ preview: string; notice: DictationNotice | null }>({ preview: '', notice: null });
  const entryRef = useRef<SpeechEntry | null>(null);

  const release = useCallback(() => {
    const entry = entryRef.current;
    entryRef.current = null;
    entry?.session?.dispose();
  }, []);
  useEffect(() => release, [release]);

  const stop = useCallback(() => {
    const entry = entryRef.current;
    if (!entry) return;
    if (entry.session) entry.session.stop();
    else entry.stopRequested = true;
  }, []);

  /** Resolves with the dictated text, or null once the dictation failed, was discarded or the bar moved on. */
  const listen = useCallback(async (on: {
    phase(phase: DictationPhase): void;
    failed(message: string): void;
    cancelled(): void;
  }): Promise<string | null> => {
    const entry: SpeechEntry = { session: null, stopRequested: false };
    entryRef.current = entry;
    setSpeech({ preview: '', notice: null });
    const isCurrent = () => entryRef.current === entry;
    let session: DictationSession;
    try {
      session = await startDictationSession({
        preference: 'full-transcript',
        limits: { maxMs: MAX_SPEECH_MS },
        onView: (view) => {
          if (!isCurrent()) return;
          on.phase(view.phase);
          setSpeech((current) => (current.preview === view.preview ? current : { ...current, preview: view.preview }));
        },
        onNotice: (notice) => {
          if (isCurrent()) setSpeech((current) => ({ ...current, notice }));
        },
      });
    } catch (error) {
      if (!isCurrent()) return null;
      entryRef.current = null;
      on.failed(micFailureMessage(error));
      return null;
    }
    if (!isCurrent()) {
      session.dispose();
      return null;
    }
    entry.session = session;
    if (entry.stopRequested) session.stop();
    const outcome = await session.outcome;
    if (!isCurrent()) return null;
    entryRef.current = null;
    switch (outcome.kind) {
      case 'text':
        return outcome.text;
      case 'empty':
        on.failed(COPY.nothingHeard);
        return null;
      case 'error':
        on.failed(outcome.description || outcome.title);
        return null;
      case 'cancelled':
        on.cancelled();
        return null;
    }
  }, []);

  return { speech, listen, stop, release };
}

/**
 * @cc [owner:nareshshah139,label:product] voice-bar-review-before-fill
 * The voice bar MUST show the heard text and every line it would fill before it changes a form, MUST pass only the lines the user kept to the page, and MUST NOT save.
 */
export function VoiceBar() {
  const { user } = useDashboardUser();
  const { active, state, dispatch, collapsed, setCollapsed, pendingFocus } = useVoiceBar();
  const [text, setText] = useState('');
  const [toCommand, setToCommand] = useState(false);
  const [available, setAvailable] = useState(false);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const stripRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const attemptRef = useRef(0);
  const barRef = useRef<HTMLElement>(null);
  const applyingRef = useRef(false);
  const [applying, setApplying] = useState(false);
  const focusBoxAfterApplyRef = useRef(false);
  useEffect(() => {
    // The text box is disabled while a fill is applied, so it can only take focus once that ends.
    if (applying || !focusBoxAfterApplyRef.current) return;
    focusBoxAfterApplyRef.current = false;
    boxRef.current?.focus();
  }, [applying]);
  const stateRef = useRef(state);
  stateRef.current = state;
  const activeRef = useRef(active);
  activeRef.current = active;
  const idPrefix = useId();
  const shown = available && !!user;

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
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    if (target === 'box') boxRef.current?.focus();
    else stripRef.current?.focus();
  }, [collapsed, pendingFocus]);

  const activeId = active?.id ?? null;
  useEffect(() => {
    setToCommand(false);
  }, [activeId]);

  const send = useCallback(async (to: VoiceBarTarget, retry: VoiceBarRetry) => {
    const registration = to.kind === 'form' ? activeRef.current : null;
    if (to.kind === 'form' && registration?.id !== to.registrationId) return;
    attemptRef.current += 1;
    const attempt = attemptRef.current;
    dispatch({ type: 'send', target: to, retry, attempt });
    const form = registration ? registration.form.current.form : 'voice-command';
    try {
      const { transcript, fields } = await requestVoiceFillFromText(form, retry.text);
      const lines = registration ? registration.form.current.preview(fields) : [];
      if (registration && transcript.trim() && !lines.length && attemptRef.current === attempt && activeRef.current?.id === registration.id) {
        setText((current) => current || transcript.trim());
      }
      dispatch({ type: 'heard', attempt, transcript, fields, lines });
    } catch (error) {
      dispatch({ type: 'request-failed', attempt, message: getErrorMessage(error) || COPY.requestFailed });
    }
  }, [dispatch]);

  const { speech, listen, stop: stopSpeech, release: releaseSpeech } = useSpeechIntoBox();

  useDropUndoWhenFormTouched(barRef, state, dispatch);

  const confirming = state.kind === 'confirming';
  const wasConfirmingRef = useRef(false);
  useEffect(() => {
    if (wasConfirmingRef.current && !confirming) boxRef.current?.focus();
    wasConfirmingRef.current = confirming;
  }, [confirming]);

  const listening = state.kind === 'listening';
  useEffect(() => {
    // The newest words are the ones being checked, so a box that has grown past its height follows them.
    const box = boxRef.current;
    if (listening && box) box.scrollTop = box.scrollHeight;
  }, [listening, speech.preview]);
  const working = state.kind === 'working';
  useEffect(() => {
    // The page changed or the bar was dismissed mid-dictation: release the mic and send nothing.
    if (!listening) releaseSpeech();
  }, [listening, releaseSpeech]);

  const restoreFocus = useCallback(() => {
    const previous = returnFocusRef.current;
    returnFocusRef.current = null;
    if (previous?.isConnected) previous.focus();
  }, []);

  const discardRecording = useCallback(() => {
    releaseSpeech();
    dispatch({ type: 'discard-recording' });
    restoreFocus();
  }, [releaseSpeech, dispatch, restoreFocus]);
  useCancelOnEscape(listening, discardRecording);

  useEffect(() => {
    if (!shown) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || !(event.ctrlKey || event.metaKey)) return;
      const box = boxRef.current;
      if (!box && !collapsed) return;
      event.preventDefault();
      if (document.activeElement !== box && document.activeElement instanceof HTMLElement) {
        returnFocusRef.current = document.activeElement;
      }
      if (box) box.focus();
      else setCollapsed(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [shown, collapsed, setCollapsed]);

  if (!shown) return null;
  if (collapsed) return <CollapsedVoiceBar buttonRef={stripRef} onShow={() => setCollapsed(false)} />;

  const form = active?.form.current ?? null;
  const formLabel = form?.label ?? '';
  const target: VoiceBarTarget = active && !toCommand ? { kind: 'form', registrationId: active.id } : { kind: 'command' };
  const status = statusText(state, formLabel);

  const speak = async (to: VoiceBarTarget, typed: string) => {
    dispatch({ type: 'listen', target: to, startedAt: Date.now() });
    const spoken = await listen({
      phase: (phase) => dispatch({ type: 'dictation-phase', phase }),
      failed: (message) => dispatch({ type: 'dictation-failed', message }),
      cancelled: () => dispatch({ type: 'dismiss' }),
    });
    if (spoken === null || stateRef.current.kind !== 'listening') return;
    setText('');
    void send(to, { kind: 'text', text: joinSpoken(typed, spoken) });
  };

  const onMic = () => {
    if (listening) stopSpeech();
    else if (!working && !applying) void speak(target, text);
  };

  const sendText = () => {
    const typed = text.trim();
    if (!typed || working) return;
    setText('');
    void send(target, { kind: 'text', text: typed });
  };

  const onBoxKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (applying) return;
    if (listening) stopSpeech();
    else sendText();
  };

  const onBarKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    // The command card is portalled, but its key events still bubble here through React; it handles its own Escape.
    if (event.key !== 'Escape' || listening || applying || state.kind === 'confirming') return;
    if (state.kind === 'draft' || state.kind === 'applied' || state.kind === 'failed' || (state.kind === 'idle' && state.notice)) {
      dispatch({ type: 'dismiss' });
    }
    restoreFocus();
  };

  const dismissToBox = () => {
    dispatch({ type: 'dismiss' });
    boxRef.current?.focus();
  };

  const onEdit = () => {
    if (state.kind !== 'draft') return;
    setText(state.heard);
    dismissToBox();
  };

  const addToForm = async () => {
    if (state.kind !== 'draft' || applyingRef.current) return;
    const registration = activeRef.current;
    if (registration?.id !== state.registrationId) return;
    const fields = mergeVoiceFillFields(state.lines.filter((line) => state.kept.includes(line.id)).map((line) => line.fields));
    applyingRef.current = true;
    setApplying(true);
    try {
      const { filled, undo } = await registration.form.current.apply(fields);
      if (!filled.length) throw new Error('nothing applied');
      flashFilledElements(filled.flatMap((entry) => (entry.elementId ? [entry.elementId] : [])));
      dispatch({ type: 'applied', registrationId: registration.id, labels: filled.map((entry) => entry.label), undo });
      // A null undo means apply opened a dialog, which owns focus.
      focusBoxAfterApplyRef.current = undo !== null;
    } catch {
      dispatch({ type: 'apply-failed', registrationId: registration.id });
    } finally {
      applyingRef.current = false;
      setApplying(false);
    }
  };

  const onUndo = () => {
    if (state.kind !== 'applied' || !state.undo || activeRef.current?.id !== state.registrationId) return;
    state.undo();
    dispatch({ type: 'dismiss', notice: COPY.undone });
    boxRef.current?.focus();
  };

  const onRetry = () => {
    if (state.kind === 'failed' && state.retry) void send(state.target, state.retry);
  };

  const hasText = text.trim().length > 0;
  const boxValue = listening ? joinSpoken(text, speech.preview) : text;
  const hintId = `${idPrefix}-nothing-ticked`;
  const lineId = (id: string) => `${idPrefix}-line-${id}`;
  const tapTarget = 'min-h-11 md:min-h-8';

  return (
    <section
      ref={barRef}
      aria-label="Voice bar"
      aria-busy={working}
      onKeyDown={onBarKeyDown}
      className="shrink-0 border-t border-border bg-card px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:px-6"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
        {state.kind === 'draft' && (
          <div aria-busy={applying} className="flex flex-col rounded-lg border border-border bg-background">
            <div className="max-h-[45dvh] overflow-y-auto p-3">
              <div className="flex items-start gap-2">
                <p className="min-w-0 flex-1 text-sm">
                  <span className="text-muted-foreground">{COPY.heard} </span>“{state.heard}”
                </p>
                <Button type="button" variant="ghost" size="sm" className={tapTarget} aria-label={COPY.editLabel} disabled={applying} onClick={onEdit}>
                  {COPY.edit}
                </Button>
              </div>
              <ul className="mt-2 flex flex-col gap-1">
                {state.lines.map((line) => (
                  <li key={line.id}>
                    <label htmlFor={lineId(line.id)} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-muted md:min-h-9">
                      <Checkbox
                        id={lineId(line.id)}
                        aria-label={`${line.label}: ${line.value}`}
                        checked={state.kept.includes(line.id)}
                        disabled={applying}
                        onCheckedChange={() => dispatch({ type: 'toggle-line', id: line.id })}
                        className="mt-0.5"
                      />
                      <span className="flex min-w-0 flex-1 flex-col text-sm">
                        <span className="font-medium">{line.label}</span>
                        <span className="whitespace-pre-wrap break-words text-muted-foreground">{line.value}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-border p-3">
              {state.error && <p role="alert" className="w-full text-sm text-destructive-text">{state.error}</p>}
              {state.kept.length === 0 && <p id={hintId} className="w-full text-sm text-muted-foreground">{COPY.nothingTicked}</p>}
              <Button
                type="button"
                className={tapTarget}
                disabled={applying || state.kept.length === 0}
                aria-describedby={state.kept.length === 0 ? hintId : undefined}
                onClick={() => void addToForm()}
              >
                {COPY.addToForm}
              </Button>
              <Button type="button" variant="outline" className={tapTarget} disabled={applying} onClick={dismissToBox}>{COPY.discard}</Button>
            </div>
          </div>
        )}

        {state.kind === 'failed' && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-destructive-border bg-destructive-soft px-3 py-2 text-sm text-destructive-text">
            <p role="alert" className="min-w-0 flex-1">{state.message}</p>
            {state.retry && <Button type="button" variant="outline" size="sm" className={tapTarget} onClick={onRetry}>{COPY.retry}</Button>}
            <Button type="button" variant="ghost" size="sm" className={tapTarget} onClick={dismissToBox}>{COPY.dismiss}</Button>
          </div>
        )}

        <div className={cn(
          'flex flex-wrap items-center gap-2',
          state.kind === 'applied' && 'rounded-md border border-success-border bg-success-soft px-3 py-2 text-success-text',
        )}>
          <p
            role="status"
            aria-live="polite"
            className={cn('min-w-0 flex-1 text-sm', (!status || state.kind === 'draft') && 'sr-only', state.kind !== 'applied' && 'text-muted-foreground')}
          >
            {status}
          </p>
          {listening && speech.notice && (
            <p aria-live="polite" className="w-full text-sm text-muted-foreground">{COPY.speechNotice(speech.notice)}</p>
          )}
          {state.kind === 'applied' && (
            <>
              {!state.opened && (
                // A hidden Undo keeps its space so the banner does not change height under the pointer.
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn(tapTarget, !state.undo && 'invisible')}
                  disabled={!state.undo}
                  tabIndex={state.undo ? undefined : -1}
                  aria-hidden={state.undo ? undefined : true}
                  onClick={onUndo}
                >
                  {COPY.undo}
                </Button>
              )}
              <Button type="button" size="sm" className={tapTarget} onClick={dismissToBox}>{COPY.done}</Button>
            </>
          )}
        </div>

        <div className="flex items-end gap-2">
          {form && (
            <NativeSelect
              aria-label={COPY.targetLabel}
              value={toCommand ? 'command' : 'form'}
              disabled={listening || working || applying}
              onChange={(event) => setToCommand(event.target.value === 'command')}
              // On a phone the picker steps aside while listening, so the live words get the width.
              className={cn('h-11 max-w-28 shrink-0 md:h-9 md:max-w-36', listening && 'max-md:hidden')}
            >
              <option value="form">{form.label}</option>
              <option value="command">{COPY.commandTarget}</option>
            </NativeSelect>
          )}
          <Textarea
            ref={boxRef}
            rows={1}
            value={boxValue}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onBoxKeyDown}
            readOnly={listening}
            disabled={applying}
            placeholder={target.kind === 'form' && form ? form.hint : COPY.commandHint}
            aria-label={COPY.textBoxLabel}
            maxLength={MAX_TYPED_CHARS}
            className={cn(
              'max-h-28 min-h-11 resize-none md:min-h-9',
              // An empty box would grow to fit a wrapped placeholder, so it is held to one line until text is typed.
              !boxValue && 'field-sizing-fixed h-11 overflow-hidden placeholder:overflow-hidden placeholder:text-ellipsis placeholder:whitespace-nowrap md:h-9',
            )}
          />
          {listening && <ListeningClock startedAt={state.startedAt} />}
          <Button
            type="button"
            size="icon"
            variant={listening ? 'destructive' : 'outline'}
            // On a phone the row has room for one action: the mic while the box is empty, Send once there is text.
            className={cn('size-11 md:size-9', hasText && !listening && 'max-md:hidden')}
            aria-label={listening ? COPY.stopAndSend : COPY.speak}
            disabled={working || applying}
            onClick={onMic}
          >
            {listening ? <Square className="fill-current" aria-hidden="true" /> : <Mic aria-hidden="true" />}
          </Button>
          <Button
            type="button"
            size="icon"
            className={cn('size-11 md:size-9', (!hasText || listening) && 'max-md:hidden')}
            aria-label={COPY.send}
            disabled={working || listening || applying || !hasText}
            onClick={sendText}
          >
            {working ? <Spinner aria-hidden="true" /> : <ArrowUp aria-hidden="true" />}
          </Button>
          {state.kind === 'idle' && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className={cn('size-11 md:size-9', hasText && 'max-md:hidden')}
              aria-label={COPY.hideBar}
              aria-expanded="true"
              title={COPY.hideBar}
              onClick={() => setCollapsed(true)}
            >
              <ChevronDown aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
      {state.kind === 'confirming' && user && (
        <VoiceCommandDialog key={state.heard.id} heard={state.heard} role={user.role} onClose={() => dispatch({ type: 'dismiss' })} />
      )}
    </section>
  );
}

/**
 * @cc [owner:nareshshah139,label:product] voice-bar-collapse-only-when-idle
 * The voice bar MUST offer Hide only while nothing is in flight, MUST shrink to a single strip no taller than 32 px (plus the safe-area inset) while hidden, and the strip and Ctrl+/ or Cmd+/ MUST each reopen it with focus in the text box.
 */
function CollapsedVoiceBar({ buttonRef, onShow }: { buttonRef: RefObject<HTMLButtonElement | null>; onShow: () => void }) {
  return (
    <section aria-label="Voice bar" className="shrink-0 bg-card pb-[env(safe-area-inset-bottom)]">
      <button
        ref={buttonRef}
        type="button"
        className="box-border block h-8 w-full border-t border-border px-4 text-sm text-muted-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset md:px-6"
        aria-label={COPY.showBar}
        aria-expanded="false"
        title={COPY.showBarTitle}
        onClick={onShow}
      >
        <span className="mx-auto flex h-full w-full max-w-3xl items-center gap-2">
          <Mic className="size-4 shrink-0" aria-hidden="true" />
          <span>{COPY.stripLabel}</span>
          <ChevronUp className="ml-auto size-4 shrink-0" aria-hidden="true" />
        </span>
      </button>
    </section>
  );
}

function ListeningClock({ startedAt }: { startedAt: number }) {
  const elapsed = useElapsedSeconds({ kind: 'listening', startedAt });
  return (
    <span className="flex h-11 shrink-0 items-center gap-1.5 text-sm md:h-9" aria-hidden="true">
      <span className="size-2 animate-pulse rounded-full bg-destructive motion-reduce:animate-none" />
      <span className="font-mono tabular-nums">{formatElapsed(elapsed)}</span>
    </span>
  );
}
