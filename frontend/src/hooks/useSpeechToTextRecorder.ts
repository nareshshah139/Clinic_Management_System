'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAudioRecorder, type RecorderToast } from '@/hooks/useAudioRecorder';
import { postAudio, type SpeechToTextResponse } from '@/lib/speech-to-text';
import { getErrorMessage } from '@/lib/utils';

interface UseSpeechToTextRecorderOptions {
  toast: RecorderToast;
  resolveText: (fieldName: string, response: SpeechToTextResponse) => string;
  applyText: (fieldName: string, text: string) => void;
}

export function useSpeechToTextRecorder({ toast, resolveText, applyText }: UseSpeechToTextRecorderOptions) {
  const [transcribingField, setTranscribingField] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const transcribe = async (fieldName: string, audio: Blob, filename: string) => {
    setTranscribingField(fieldName);
    try {
      const data = await postAudio<SpeechToTextResponse>('/api/visits/transcribe', audio, filename);
      const text = resolveText(fieldName, data);
      if (!text) {
        toast({
          variant: 'info',
          title: 'No speech detected',
          description: 'The recording may have been too quiet or contained only silence. Try speaking louder and closer to the microphone.',
        });
        return;
      }
      if (mountedRef.current) applyText(fieldName, text);
    } catch (error) {
      if (mountedRef.current) {
        toast({ variant: 'warning', title: 'Speech-to-text error', description: getErrorMessage(error) || 'Please try again.' });
      }
    } finally {
      if (mountedRef.current) setTranscribingField(null);
    }
  };

  const { recording, toggle } = useAudioRecorder({
    toast,
    onRecorded: (fieldName, audio, filename) => void transcribe(fieldName, audio, filename),
  });

  const isTranscribing = transcribingField !== null;
  const startVoiceInput = useCallback(async (fieldName: string) => {
    if (!isTranscribing) await toggle(fieldName);
  }, [isTranscribing, toggle]);

  return {
    activeVoiceField: recording?.key ?? transcribingField,
    isListening: recording !== null,
    isTranscribing,
    startVoiceInput,
  };
}
