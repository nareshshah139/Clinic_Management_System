'use client';

import { createElement, useCallback, useEffect, useReducer, useRef } from 'react';
import { ToastAction } from '@/components/ui/toast';
import { useToast } from '@/hooks/use-toast';
import { useSpeechToTextRecorder } from '@/hooks/useSpeechToTextRecorder';
import { pickSpeechToTextInsert } from '@/lib/speech-to-text';
import { getErrorMessage } from '@/lib/utils';
import {
  flashFilledElements,
  requestVoiceFill,
  type VoiceFillApplyResult,
  type VoiceFillFormId,
} from '@/lib/voice-fill';

export type VoiceFillPhase =
  | { kind: 'idle' }
  | { kind: 'listening'; startedAt: number }
  | { kind: 'transcribing' }
  | { kind: 'filling' };

export type VoiceFillEvent =
  | { type: 'recorder'; listening: boolean; transcribing: boolean; now: number }
  | { type: 'transcript-ready' }
  | { type: 'finished' };

export function voiceFillReducer(phase: VoiceFillPhase, event: VoiceFillEvent): VoiceFillPhase {
  switch (event.type) {
    case 'recorder':
      // The recorder knows nothing about the fill request, so it must not end that phase.
      if (phase.kind === 'filling') return phase;
      if (event.listening) return phase.kind === 'listening' ? phase : { kind: 'listening', startedAt: event.now };
      if (event.transcribing) return phase.kind === 'transcribing' ? phase : { kind: 'transcribing' };
      return phase.kind === 'idle' ? phase : { kind: 'idle' };
    case 'transcript-ready':
      return { kind: 'filling' };
    case 'finished':
      return { kind: 'idle' };
  }
}

const FIELD = 'voice-fill';
const HEARD_PREVIEW_CHARS = 120;

interface UseVoiceFillOptions {
  form: VoiceFillFormId;
  apply: (fields: Awaited<ReturnType<typeof requestVoiceFill>>) => VoiceFillApplyResult;
}

export function useVoiceFill({ form, apply }: UseVoiceFillOptions) {
  const { toast } = useToast();
  const [phase, dispatch] = useReducer(voiceFillReducer, { kind: 'idle' } as VoiceFillPhase);
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const resolveText = useCallback((_: string, response: Parameters<typeof pickSpeechToTextInsert>[0]) => pickSpeechToTextInsert(response), []);

  const applyText = useCallback(
    async (_: string, transcript: string) => {
      dispatch({ type: 'transcript-ready' });
      try {
        const fields = await requestVoiceFill(form, transcript);
        if (!mountedRef.current) return;
        const { filled, undo } = applyRef.current(fields);
        if (filled.length === 0) {
          toast({
            variant: 'info',
            title: 'Nothing to fill',
            description: `Heard: “${transcript.slice(0, HEARD_PREVIEW_CHARS)}”`,
          });
          return;
        }
        flashFilledElements(filled.flatMap((f) => (f.elementId ? [f.elementId] : [])));
        toast({
          variant: 'success',
          title: `Filled ${filled.length} ${filled.length === 1 ? 'field' : 'fields'}`,
          description: filled.map((f) => f.label).join(', '),
          action: createElement(ToastAction, { altText: 'Undo voice fill', onClick: undo }, 'Undo'),
        });
      } catch (error) {
        if (mountedRef.current) {
          toast({
            variant: 'warning',
            title: 'Voice fill failed',
            description: getErrorMessage(error) || 'Please try again.',
          });
        }
      } finally {
        if (mountedRef.current) dispatch({ type: 'finished' });
      }
    },
    [form, toast],
  );

  const { isListening, isTranscribing, startVoiceInput, cancelVoiceInput } = useSpeechToTextRecorder({ toast, resolveText, applyText, diarize: false });

  useEffect(() => {
    dispatch({ type: 'recorder', listening: isListening, transcribing: isTranscribing, now: Date.now() });
  }, [isListening, isTranscribing]);

  const toggle = useCallback(() => {
    if (phase.kind === 'idle' || phase.kind === 'listening') void startVoiceInput(FIELD);
  }, [phase.kind, startVoiceInput]);

  const cancel = useCallback(() => {
    if (phase.kind === 'listening') cancelVoiceInput();
  }, [phase.kind, cancelVoiceInput]);

  return { phase, toggle, cancel };
}
