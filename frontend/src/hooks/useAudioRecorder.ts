'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getErrorMessage } from '@/lib/utils';

export type RecorderToast = (input: {
  variant?: 'default' | 'destructive' | 'success' | 'warning' | 'info';
  title: string;
  description?: string;
}) => void;

interface UseAudioRecorderOptions {
  toast: RecorderToast;
  onRecorded: (key: string, audio: Blob, filename: string) => void;
}

const CHUNK_MS = 30_000;
const MAX_RECORDING_MS = 40 * 60_000;
// Chrome defaults opus to 128 kbps, which puts 30 minutes over the 25 MB upload limit; 32 kbps is plenty for speech.
const AUDIO_BITS_PER_SECOND = 32_000;

function pickMimeType(): string {
  const recorder = (window as any).MediaRecorder as typeof MediaRecorder;
  if (recorder.isTypeSupported('audio/webm')) return 'audio/webm';
  if (recorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
  return '';
}

/** One recording at a time, identified by `key`. `toggle` with the active key stops it and hands the audio to `onRecorded`. */
export function useAudioRecorder({ toast, onRecorded }: UseAudioRecorderOptions) {
  const [recording, setRecording] = useState<{ key: string; startedAt: number } | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stopTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const sessionRef = useRef(0);
  const onRecordedRef = useRef(onRecorded);
  onRecordedRef.current = onRecorded;

  const release = useCallback(() => {
    if (stopTimerRef.current !== null) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
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
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      release();
    };
  }, [release]);

  const cancel = useCallback(() => {
    sessionRef.current += 1;
    release();
    setRecording(null);
  }, [release]);

  const toggle = useCallback(async (key: string) => {
    if (recording) {
      const recorder = recorderRef.current;
      if (recording.key === key && recorder && recorder.state !== 'inactive') {
        try {
          recorder.stop();
        } catch {}
      }
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

    setRecording({ key, startedAt: Date.now() });
    const session = sessionRef.current;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 48000 },
      });
      if (session !== sessionRef.current || !mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, { ...(mimeType && { mimeType }), audioBitsPerSecond: AUDIO_BITS_PER_SECOND });
      recorderRef.current = recorder;
      const chunks: Blob[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunks.push(event.data);
      };

      recorder.onstop = () => {
        release();
        if (!mountedRef.current) return;
        setRecording(null);
        if (chunks.length === 0) {
          toast({ variant: 'warning', title: 'No audio recorded', description: 'Please try recording again.' });
          return;
        }
        const type = mimeType || 'audio/webm';
        onRecordedRef.current(key, new Blob(chunks, { type }), type === 'audio/mp4' ? 'recording.m4a' : 'recording.webm');
      };

      recorder.start(CHUNK_MS);
      stopTimerRef.current = window.setTimeout(() => {
        if (recorder.state !== 'inactive') recorder.stop();
      }, MAX_RECORDING_MS);
    } catch (error) {
      release();
      if (mountedRef.current) {
        setRecording(null);
        toast({
          variant: 'warning',
          title: 'Microphone access denied',
          description: getErrorMessage(error) || 'Check browser permissions and try again.',
        });
      }
    }
  }, [recording, release, toast]);

  return { recording, toggle, cancel };
}
