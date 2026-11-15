'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import { getErrorMessage } from '@/lib/utils';
import { flashFilledElements, requestVoiceFill, type VoiceFillApply, type VoiceFillFormId } from '@/lib/voice-fill';

export type VoiceFillPhase =
  | { kind: 'idle' }
  | { kind: 'listening'; startedAt: number }
  | { kind: 'filling' }
  | { kind: 'filled'; labels: string[] };

const IDLE: VoiceFillPhase = { kind: 'idle' };
const FILLING: VoiceFillPhase = { kind: 'filling' };
const RECORDING_KEY = 'voice-fill';
const HEARD_PREVIEW_CHARS = 120;

interface UseVoiceFillOptions {
  form: VoiceFillFormId;
  apply: VoiceFillApply;
}

export function useVoiceFill({ form, apply }: UseVoiceFillOptions) {
  const { toast } = useToast();
  const [filling, setFilling] = useState(false);
  const [done, setDone] = useState<{ labels: string[]; undo: () => void } | null>(null);
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fill = async (audio: Blob, filename: string) => {
    setDone(null);
    setFilling(true);
    try {
      const { transcript, fields } = await requestVoiceFill(form, audio, filename);
      if (!mountedRef.current) return;
      const { filled, undo } = await applyRef.current(fields);
      if (!mountedRef.current) return;
      if (filled.length === 0) {
        const heard = transcript.trim();
        toast({
          variant: 'info',
          title: 'Nothing to fill',
          description: heard ? `Heard: “${heard.slice(0, HEARD_PREVIEW_CHARS)}”` : 'No speech was heard. Try speaking closer to the microphone.',
        });
        return;
      }
      flashFilledElements(filled.flatMap((f) => (f.elementId ? [f.elementId] : [])));
      setDone({ labels: filled.map((f) => f.label), undo });
    } catch (error) {
      if (mountedRef.current) {
        toast({ variant: 'warning', title: 'Voice fill failed', description: getErrorMessage(error) || 'Please try again.' });
      }
    } finally {
      if (mountedRef.current) setFilling(false);
    }
  };

  const { recording, toggle: toggleRecording, cancel } = useAudioRecorder({
    toast,
    onRecorded: (_key, audio, filename) => void fill(audio, filename),
  });

  const toggle = useCallback(() => {
    if (filling) return;
    setDone(null);
    void toggleRecording(RECORDING_KEY);
  }, [filling, toggleRecording]);

  const dismiss = useCallback(() => setDone(null), []);
  const undo = useCallback(() => {
    done?.undo();
    setDone(null);
  }, [done]);

  const phase: VoiceFillPhase = filling
    ? FILLING
    : recording
      ? { kind: 'listening', startedAt: recording.startedAt }
      : done
        ? { kind: 'filled', labels: done.labels }
        : IDLE;
  return { phase, toggle, cancel, undo, dismiss };
}
