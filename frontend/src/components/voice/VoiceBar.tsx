'use client';

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react';
import { ArrowUp, ChevronDown, ChevronUp, Mic, Square } from 'lucide-react';
import { useDashboardUser } from '@/components/layout/dashboard-user-context';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { NativeSelect } from '@/components/ui/native-select';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { useAudioRecorder, type RecorderToast } from '@/hooks/useAudioRecorder';
import { cn, getErrorMessage } from '@/lib/utils';
import {
  recorderFailureMessage,
  VOICE_BAR_COPY as COPY,
  type VoiceBarRetry,
  type VoiceBarState,
  type VoiceBarTarget,
} from '@/lib/voice-bar';
import {
  flashFilledElements,
  fetchVoiceFillStatus,
  mergeVoiceFillFields,
  requestVoiceFill,
  requestVoiceFillFromText,
} from '@/lib/voice-fill';
import { useVoiceBar } from './VoiceBarProvider';
import { VoiceCommandDialog } from './VoiceCommandDialog';
import { formatElapsed, useCancelOnEscape, useElapsedSeconds } from './VoiceFillButton';

const RECORDING_KEY = 'voice-bar';
// Well under the server's 60000-character cap and Express's 100 KB body limit, even for 3-byte scripts.
const MAX_TYPED_CHARS = 8000;

function statusText(state: VoiceBarState, formLabel: string): string {
  switch (state.kind) {
    case 'idle':
      return state.notice ?? '';
    case 'listening':
      return COPY.listening;
    case 'working':
      return COPY.working;
    case 'draft':
      return `${COPY.heard} “${state.heard}”. ${COPY.draftReady(state.lines.length)}`;
    case 'applied':
      return `${COPY.filled(formLabel, state.labels)} ${state.undo ? COPY.notSavedWithUndo : COPY.notSavedDialog(formLabel)}`;
    case 'failed':
    case 'confirming':
      return '';
  }
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
  const applyingRef = useRef(false);
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
      const { transcript, fields } = retry.kind === 'audio'
        ? await requestVoiceFill(form, retry.audio, retry.filename)
        : await requestVoiceFillFromText(form, retry.text);
      const lines = registration ? registration.form.current.preview(fields) : [];
      if (registration && transcript.trim() && !lines.length) setText(transcript.trim());
      dispatch({ type: 'heard', attempt, transcript, fields, lines });
    } catch (error) {
      dispatch({ type: 'request-failed', attempt, message: getErrorMessage(error) || COPY.requestFailed });
    }
  }, [dispatch]);

  const recorderToast = useCallback<RecorderToast>(({ title }) => {
    dispatch({ type: 'recorder-failed', message: recorderFailureMessage(title) });
  }, [dispatch]);
  const { recording, toggle, cancel } = useAudioRecorder({
    toast: recorderToast,
    onRecorded: (_key, audio, filename) => {
      const current = stateRef.current;
      if (current.kind === 'listening') void send(current.target, { kind: 'audio', audio, filename });
    },
  });

  const listening = state.kind === 'listening';
  const working = state.kind === 'working';
  useEffect(() => {
    // The page changed or the bar was dismissed mid-recording: stop the mic and upload nothing.
    if (!listening && recording) cancel();
  }, [listening, recording, cancel]);

  const restoreFocus = useCallback(() => {
    const previous = returnFocusRef.current;
    returnFocusRef.current = null;
    if (previous?.isConnected) previous.focus();
  }, []);

  const discardRecording = useCallback(() => {
    cancel();
    dispatch({ type: 'discard-recording' });
    restoreFocus();
  }, [cancel, dispatch, restoreFocus]);
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

  const onMic = () => {
    if (!listening) dispatch({ type: 'listen', target, startedAt: Date.now() });
    void toggle(RECORDING_KEY);
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
    if (listening) void toggle(RECORDING_KEY);
    else sendText();
  };

  const onBarKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    // The command card is portalled, but its key events still bubble here through React; it handles its own Escape.
    if (event.key !== 'Escape' || listening || state.kind === 'confirming') return;
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
    try {
      const { filled, undo } = await registration.form.current.apply(fields);
      if (!filled.length) throw new Error('nothing applied');
      flashFilledElements(filled.flatMap((entry) => (entry.elementId ? [entry.elementId] : [])));
      dispatch({ type: 'applied', registrationId: registration.id, labels: filled.map((entry) => entry.label), undo });
      // A null undo means apply opened a dialog, which owns focus.
      if (undo) boxRef.current?.focus();
    } catch {
      dispatch({ type: 'apply-failed', registrationId: registration.id });
    } finally {
      applyingRef.current = false;
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
  const hintId = `${idPrefix}-nothing-ticked`;
  const lineId = (id: string) => `${idPrefix}-line-${id}`;
  const tapTarget = 'min-h-11 md:min-h-8';

  return (
    <section
      aria-label="Voice bar"
      aria-busy={working}
      onKeyDown={onBarKeyDown}
      className="shrink-0 border-t border-border bg-card px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:px-6"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
        {state.kind === 'draft' && (
          <div className="flex flex-col rounded-lg border border-border bg-background">
            <div className="max-h-[45dvh] overflow-y-auto p-3">
              <div className="flex items-start gap-2">
                <p className="min-w-0 flex-1 text-sm">
                  <span className="text-muted-foreground">{COPY.heard} </span>“{state.heard}”
                </p>
                <Button type="button" variant="ghost" size="sm" className={tapTarget} aria-label={COPY.editLabel} onClick={onEdit}>
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
                disabled={state.kept.length === 0}
                aria-describedby={state.kept.length === 0 ? hintId : undefined}
                onClick={() => void addToForm()}
              >
                {COPY.addToForm}
              </Button>
              <Button type="button" variant="outline" className={tapTarget} onClick={dismissToBox}>{COPY.discard}</Button>
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
          {state.kind === 'applied' && (
            <>
              {state.undo && <Button type="button" variant="outline" size="sm" className={tapTarget} onClick={onUndo}>{COPY.undo}</Button>}
              <Button type="button" size="sm" className={tapTarget} onClick={dismissToBox}>{COPY.done}</Button>
            </>
          )}
        </div>

        <div className="flex items-end gap-2">
          {form && (
            <NativeSelect
              aria-label={COPY.targetLabel}
              value={toCommand ? 'command' : 'form'}
              disabled={listening || working}
              onChange={(event) => setToCommand(event.target.value === 'command')}
              className="h-11 max-w-28 shrink-0 md:h-9 md:max-w-36"
            >
              <option value="form">{form.label}</option>
              <option value="command">{COPY.commandTarget}</option>
            </NativeSelect>
          )}
          <Textarea
            ref={boxRef}
            rows={1}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onBoxKeyDown}
            placeholder={target.kind === 'form' && form ? form.hint : COPY.commandHint}
            aria-label={COPY.textBoxLabel}
            maxLength={MAX_TYPED_CHARS}
            className={cn(
              'max-h-28 min-h-11 resize-none md:min-h-9',
              // An empty box would grow to fit a wrapped placeholder, so it is held to one line until text is typed.
              !text && 'field-sizing-fixed h-11 overflow-hidden placeholder:overflow-hidden placeholder:text-ellipsis placeholder:whitespace-nowrap md:h-9',
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
            disabled={working}
            onClick={onMic}
          >
            {listening ? <Square className="fill-current" aria-hidden="true" /> : <Mic aria-hidden="true" />}
          </Button>
          <Button
            type="button"
            size="icon"
            className={cn('size-11 md:size-9', (!hasText || listening) && 'max-md:hidden')}
            aria-label={COPY.send}
            disabled={working || listening || !hasText}
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
    <section aria-label="Voice bar" className="shrink-0 border-t border-border bg-card pb-[env(safe-area-inset-bottom)]">
      <button
        ref={buttonRef}
        type="button"
        className="block h-8 w-full px-4 text-sm text-muted-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset md:px-6"
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
