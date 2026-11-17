'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MicUnavailableError,
  startDictationSession,
  type DictationPhase,
  type DictationSession,
  type DictationView,
} from '@/lib/dictation-session';
import type { SpeechToTextPreference } from '@/lib/speech-to-text';

type ToastFn = (input: {
  variant?: 'default' | 'destructive' | 'success' | 'warning' | 'info';
  title: string;
  description?: string;
}) => void;

interface UseSpeechToTextRecorderOptions<F extends string> {
  toast: ToastFn;
  fields: Readonly<Record<F, SpeechToTextPreference>>;
  applyText: (field: F, text: string) => void;
}

const MIC_UNAVAILABLE_TITLE: Record<MicUnavailableError['reason'], string> = {
  unsupported: 'Voice capture unavailable',
  denied: 'Microphone access denied',
  busy: 'Dictation already running',
};

interface ActiveDictation<F extends string> {
  field: F;
  phase: DictationPhase;
  session: DictationSession | null;
  stopRequested: boolean;
}

export function useSpeechToTextRecorder<F extends string>({
  toast,
  fields,
  applyText,
}: UseSpeechToTextRecorderOptions<F>) {
  const [active, setActive] = useState<{ field: F; view: DictationView } | null>(null);
  const activeRef = useRef<ActiveDictation<F> | null>(null);
  const latest = useRef({ toast, fields, applyText });
  latest.current = { toast, fields, applyText };

  useEffect(() => () => {
    const current = activeRef.current;
    activeRef.current = null;
    current?.session?.dispose();
  }, []);

  const startVoiceInput = useCallback(async (field: F) => {
    const current = activeRef.current;
    if (current) {
      if (current.field !== field || current.phase === 'finishing') return;
      if (current.session) current.session.stop();
      else current.stopRequested = true;
      return;
    }

    const entry: ActiveDictation<F> = { field, phase: 'connecting', session: null, stopRequested: false };
    activeRef.current = entry;
    setActive({ field, view: { phase: 'connecting', live: false, preview: '' } });
    const isCurrent = () => activeRef.current === entry;
    const release = () => {
      activeRef.current = null;
      setActive(null);
    };

    let session: DictationSession;
    try {
      session = await startDictationSession({
        preference: latest.current.fields[field],
        onView: (view) => {
          if (!isCurrent()) return;
          entry.phase = view.phase;
          setActive({ field, view });
        },
        onNotice: (notice) => {
          if (isCurrent()) latest.current.toast({ variant: 'info', ...notice });
        },
      });
    } catch (error) {
      if (!isCurrent()) return;
      release();
      latest.current.toast({
        variant: 'warning',
        title: error instanceof MicUnavailableError ? MIC_UNAVAILABLE_TITLE[error.reason] : MIC_UNAVAILABLE_TITLE.denied,
        description: error instanceof Error && error.message ? error.message : 'Check browser permissions and try again.',
      });
      return;
    }

    if (!isCurrent()) {
      session.dispose();
      return;
    }
    entry.session = session;
    if (entry.stopRequested) session.stop();

    const outcome = await session.outcome;
    if (!isCurrent()) return;
    release();
    switch (outcome.kind) {
      case 'text':
        latest.current.applyText(field, outcome.text);
        break;
      case 'empty':
        latest.current.toast({
          variant: 'info',
          title: 'No speech detected',
          description: 'The recording may have been too quiet or contained only silence. Try speaking louder and closer to the microphone.',
        });
        break;
      case 'error':
        latest.current.toast({ variant: 'warning', title: outcome.title, description: outcome.description });
        break;
      case 'cancelled':
        break;
    }
  }, []);

  const phase = active?.view.phase;
  return {
    activeVoiceField: active?.field ?? null,
    isConnecting: phase === 'connecting',
    isListening: phase === 'listening',
    isTranscribing: phase === 'finishing',
    livePreview: active?.view.preview ?? '',
    startVoiceInput,
  };
}
