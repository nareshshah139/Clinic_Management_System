'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { handleUnauthorizedRedirect } from '@/lib/authRedirect';
import { formatSpeechToTextError, type SpeechToTextResponse } from '@/lib/speech-to-text';
import { getErrorMessage } from '@/lib/utils';

type ToastFn = (input: {
  variant?: 'default' | 'destructive' | 'success' | 'warning' | 'info';
  title: string;
  description?: string;
}) => void;

interface UseSpeechToTextRecorderOptions {
  toast: ToastFn;
  resolveText: (fieldName: string, response: SpeechToTextResponse) => string;
  applyText: (fieldName: string, text: string) => void;
  /** Set false when the text is used as-is and the doctor/patient split would be wasted work. */
  diarize?: boolean;
}

export function useSpeechToTextRecorder({
  toast,
  resolveText,
  applyText,
  diarize = true,
}: UseSpeechToTextRecorderOptions) {
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [activeVoiceField, setActiveVoiceField] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stopTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const sessionRef = useRef(0);

  const clearStopTimer = useCallback(() => {
    if (stopTimerRef.current !== null) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
  }, []);

  const cancelActiveRecording = useCallback(() => {
    clearStopTimer();

    const recorder = recorderRef.current;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      try {
        if (recorder.state !== 'inactive') recorder.stop();
      } catch {}
    }

    try {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    } catch {}

    recorderRef.current = null;
    streamRef.current = null;
  }, [clearStopTimer]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      cancelActiveRecording();
    };
  }, [cancelActiveRecording]);

  const cancelVoiceInput = useCallback(() => {
    sessionRef.current += 1;
    cancelActiveRecording();
    setIsListening(false);
    setActiveVoiceField(null);
  }, [cancelActiveRecording]);

  const startVoiceInput = useCallback(async (fieldName: string) => {
    if (isTranscribing) return;

    if (
      isListening &&
      activeVoiceField === fieldName &&
      recorderRef.current &&
      recorderRef.current.state !== 'inactive'
    ) {
      try {
        recorderRef.current.stop();
      } catch {}
      return;
    }

    if (!navigator.mediaDevices || !(window as any).MediaRecorder) {
      toast({
        variant: 'warning',
        title: 'Voice capture unavailable',
        description: 'Microphone recording is not supported in this browser.',
      });
      return;
    }

    setIsListening(true);
    setActiveVoiceField(fieldName);
    const session = sessionRef.current;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
        },
      });
      if (session !== sessionRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;

      const mediaRecorder = (window as any).MediaRecorder as typeof MediaRecorder;
      const mimeType = mediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : mediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';
      const recorder = new MediaRecorder(stream, mimeType ? ({ mimeType } as MediaRecorderOptions) : undefined);
      recorderRef.current = recorder;

      const chunksAccumulator: Blob[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksAccumulator.push(event.data);
        }
      };

      recorder.onstop = async () => {
        clearStopTimer();

        try {
          stream.getTracks().forEach((track) => track.stop());
        } catch {}
        streamRef.current = null;
        recorderRef.current = null;

        if (mountedRef.current) {
          setIsListening(false);
          setIsTranscribing(true);
        }

        try {
          if (chunksAccumulator.length === 0) {
            toast({
              variant: 'warning',
              title: 'No audio recorded',
              description: 'Please try recording again.',
            });
            return;
          }

          const recordedType = mimeType || 'audio/webm';
          const completeAudio = new Blob(chunksAccumulator, { type: recordedType });
          const filename = recordedType === 'audio/mp4' ? 'recording.m4a' : 'recording.webm';
          const formData = new FormData();
          formData.append('file', completeAudio, filename);

          const response = await fetch(diarize ? '/api/visits/transcribe' : '/api/visits/transcribe?diarize=false', {
            method: 'POST',
            body: formData,
            credentials: 'include',
          });

          if (!response.ok) {
            handleUnauthorizedRedirect(response);
            let errText = '';
            try {
              errText = await response.text();
            } catch {}
            throw new Error(formatSpeechToTextError(response.status, errText));
          }

          const data = (await response.json()) as SpeechToTextResponse;
          const nextText = resolveText(fieldName, data);

          if (!nextText) {
            toast({
              variant: 'info',
              title: 'No speech detected',
              description: 'The recording may have been too quiet or contained only silence. Try speaking louder and closer to the microphone.',
            });
            return;
          }

          if (mountedRef.current) {
            applyText(fieldName, nextText);
          }
        } catch (error) {
          if (mountedRef.current) {
            toast({
              variant: 'warning',
              title: 'Speech-to-text error',
              description: getErrorMessage(error) || 'Please try again.',
            });
          }
        } finally {
          if (mountedRef.current) {
            setIsTranscribing(false);
            setActiveVoiceField(null);
          }
        }
      };

      recorder.start(30_000);
      stopTimerRef.current = window.setTimeout(() => {
        if (recorder.state !== 'inactive') {
          recorder.stop();
        }
      }, 600_000);
    } catch (error) {
      cancelActiveRecording();
      if (mountedRef.current) {
        setIsListening(false);
        setActiveVoiceField(null);
        toast({
          variant: 'warning',
          title: 'Microphone access denied',
          description: getErrorMessage(error) || 'Check browser permissions and try again.',
        });
      }
    }
  }, [activeVoiceField, applyText, cancelActiveRecording, clearStopTimer, diarize, isListening, isTranscribing, resolveText, toast]);

  return {
    activeVoiceField,
    isListening,
    isTranscribing,
    startVoiceInput,
    cancelVoiceInput,
  };
}
