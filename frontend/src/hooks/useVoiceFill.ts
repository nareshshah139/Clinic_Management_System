'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { MIC_UNAVAILABLE_TITLE } from '@/hooks/useSpeechToTextRecorder';
import { MicUnavailableError, startDictationSession, type DictationSession } from '@/lib/dictation-session';
import { getErrorMessage } from '@/lib/utils';
import {
  flashFilledElements,
  requestVoiceFillFromText,
  VOICE_FILL_MAX_SPEECH_MS,
  type VoiceFillApply,
  type VoiceFillFormId,
} from '@/lib/voice-fill';

export type VoiceFillPhase =
  | { kind: 'idle' }
  | { kind: 'listening'; startedAt: number }
  | { kind: 'filling' }
  | { kind: 'filled'; labels: string[] };

type VoiceFillState = Exclude<VoiceFillPhase, { kind: 'filled' }> | { kind: 'filled'; labels: string[]; undo: () => void };

const IDLE: VoiceFillState = { kind: 'idle' };
const FILLING: VoiceFillState = { kind: 'filling' };
const HEARD_PREVIEW_CHARS = 120;

interface UseVoiceFillOptions {
  form: VoiceFillFormId;
  apply: VoiceFillApply;
}

interface Dictation {
  session: DictationSession | null;
  stopRequested: boolean;
}

export function useVoiceFill({ form, apply }: UseVoiceFillOptions) {
  const { toast } = useToast();
  const [state, setState] = useState<VoiceFillState>(IDLE);
  const latest = useRef({ form, apply, toast });
  latest.current = { form, apply, toast };
  const dictationRef = useRef<Dictation | null>(null);

  useEffect(() => () => {
    const dictation = dictationRef.current;
    dictationRef.current = null;
    dictation?.session?.dispose();
  }, []);

  const fill = useCallback(async (text: string, isCurrent: () => boolean) => {
    const { form, apply, toast } = latest.current;
    try {
      const { transcript, fields } = await requestVoiceFillFromText(form, text);
      if (!isCurrent()) return;
      const { filled, undo } = await apply(fields);
      if (!isCurrent()) return;
      if (filled.length === 0) {
        const heard = transcript.trim();
        toast({
          variant: 'info',
          title: 'Nothing to fill',
          description: heard ? `Heard: “${heard.slice(0, HEARD_PREVIEW_CHARS)}”` : 'No speech was heard. Try speaking closer to the microphone.',
        });
        setState(IDLE);
        return;
      }
      flashFilledElements(filled.flatMap((f) => (f.elementId ? [f.elementId] : [])));
      setState({ kind: 'filled', labels: filled.map((f) => f.label), undo });
    } catch (error) {
      if (!isCurrent()) return;
      toast({ variant: 'warning', title: 'Voice fill failed', description: getErrorMessage(error) || 'Please try again.' });
      setState(IDLE);
    }
  }, []);

  const listen = useCallback(async () => {
    const dictation: Dictation = { session: null, stopRequested: false };
    dictationRef.current = dictation;
    const isCurrent = () => dictationRef.current === dictation;
    setState({ kind: 'listening', startedAt: Date.now() });
    let session: DictationSession;
    try {
      session = await startDictationSession({
        preference: 'full-transcript',
        limits: { maxMs: VOICE_FILL_MAX_SPEECH_MS },
        onView: (view) => {
          if (isCurrent() && view.phase === 'finishing') setState((current) => (current.kind === 'listening' ? FILLING : current));
        },
        onNotice: () => {},
      });
    } catch (error) {
      if (!isCurrent()) return;
      dictationRef.current = null;
      setState(IDLE);
      latest.current.toast({
        variant: 'warning',
        title: error instanceof MicUnavailableError ? MIC_UNAVAILABLE_TITLE[error.reason] : MIC_UNAVAILABLE_TITLE.denied,
        description: getErrorMessage(error) || 'Check browser permissions and try again.',
      });
      return;
    }
    if (!isCurrent()) {
      session.dispose();
      return;
    }
    dictation.session = session;
    if (dictation.stopRequested) session.stop();
    const outcome = await session.outcome;
    if (!isCurrent()) return;
    switch (outcome.kind) {
      case 'text':
        setState(FILLING);
        await fill(outcome.text, isCurrent);
        break;
      case 'empty':
        latest.current.toast({ variant: 'info', title: 'Nothing to fill', description: 'No speech was heard. Try speaking closer to the microphone.' });
        setState(IDLE);
        break;
      case 'error':
        latest.current.toast({ variant: 'warning', title: 'Voice fill failed', description: outcome.description || outcome.title });
        setState(IDLE);
        break;
      case 'cancelled':
        break;
    }
    if (isCurrent()) dictationRef.current = null;
  }, [fill]);

  const toggle = useCallback(() => {
    if (state.kind === 'filling') return;
    const dictation = dictationRef.current;
    if (state.kind === 'listening' && dictation) {
      if (dictation.session) dictation.session.stop();
      else dictation.stopRequested = true;
      setState(FILLING);
      return;
    }
    void listen();
  }, [state.kind, listen]);

  const cancel = useCallback(() => {
    const dictation = dictationRef.current;
    dictationRef.current = null;
    dictation?.session?.dispose();
    setState(IDLE);
  }, []);

  const dismiss = useCallback(() => setState((current) => (current.kind === 'filled' ? IDLE : current)), []);
  const undo = useCallback(() => {
    if (state.kind === 'filled') state.undo();
    setState(IDLE);
  }, [state]);

  const phase: VoiceFillPhase = state.kind === 'filled' ? { kind: 'filled', labels: state.labels } : state;
  return { phase, toggle, cancel, undo, dismiss };
}
