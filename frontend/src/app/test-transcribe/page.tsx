'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Mic, MicOff, Download, Trash2, Activity } from 'lucide-react';

interface TranscriptionResult {
  text: string;
  segments?: Array<{
    speaker: 'DOCTOR' | 'PATIENT';
    text: string;
    confidence?: number;
  }>;
  speakers?: {
    doctorText: string;
    patientText: string;
  };
}

export default function TestTranscribePage() {
  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [chunks, setChunks] = useState<Blob[]>([]);
  const [transcription, setTranscription] = useState<TranscriptionResult | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Audio level visualization
  useEffect(() => {
    if (isRecording && analyserRef.current) {
      const updateLevel = () => {
        if (!analyserRef.current) return;
        
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        
        // Calculate average volume
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        setAudioLevel(Math.min(100, (average / 255) * 100 * 2)); // Scale up for visibility
        
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };
      
      updateLevel();
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      setAudioLevel(0);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isRecording]);

  const startRecording = async () => {
    setError(null);
    setTranscription(null);
    setRecordingDuration(0);
    chunksRef.current = [];
    setChunks([]);

    try {
      // Request high-quality audio with auto gain control
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
        },
      });

      streamRef.current = stream;

      // Set up audio analysis for level meter
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      // Set up MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : '';

      console.log('========== MEDIARECORDER SETUP ==========');
      console.log('Selected mimeType:', mimeType);
      console.log('Supported formats:');
      console.log('  audio/webm;codecs=opus:', MediaRecorder.isTypeSupported('audio/webm;codecs=opus'));
      console.log('  audio/webm:', MediaRecorder.isTypeSupported('audio/webm'));
      console.log('  audio/mp4:', MediaRecorder.isTypeSupported('audio/mp4'));
      console.log('  audio/ogg;codecs=opus:', MediaRecorder.isTypeSupported('audio/ogg;codecs=opus'));
      console.log('Audio constraints:', {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48000,
      });
      console.log('=========================================');

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      
      console.log('MediaRecorder created:');
      console.log('  Actual mimeType:', recorder.mimeType);
      console.log('  State:', recorder.state);
      console.log('  audioBitsPerSecond:', recorder.audioBitsPerSecond || 'default');
      console.log('=========================================');

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
          setChunks([...chunksRef.current]);
          console.log(`Chunk received: ${e.data.size} bytes`);
        }
      };

      recorder.onstop = async () => {
        console.log('Recording stopped');
        stream.getTracks().forEach((track) => track.stop());
        
        if (audioContextRef.current) {
          audioContextRef.current.close();
          audioContextRef.current = null;
        }

        if (durationIntervalRef.current) {
          clearInterval(durationIntervalRef.current);
          durationIntervalRef.current = null;
        }

        // Create audio URL for playback
        if (chunksRef.current.length > 0) {
          const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' });
          const url = URL.createObjectURL(blob);
          setAudioUrl(url);
          console.log(`Complete audio: ${blob.size} bytes from ${chunksRef.current.length} chunks`);
        }
      };

      recorder.start(5000); // Chunk every 5 seconds for testing
      setIsRecording(true);

      // Duration counter
      durationIntervalRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Error starting recording:', err);
      setError(err instanceof Error ? err.message : 'Failed to start recording');
    }
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const transcribeAudio = async () => {
    if (chunksRef.current.length === 0) {
      setError('No audio chunks available');
      return;
    }

    setIsTranscribing(true);
    setError(null);

    try {
      // Combine all chunks into a single blob
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const completeAudio = new Blob(chunksRef.current, { type: mimeType });
      
      console.log('========== TRANSCRIPTION REQUEST ==========');
      console.log(`Total chunks: ${chunksRef.current.length}`);
      console.log(`Individual chunk sizes:`, chunksRef.current.map((c, i) => `${i + 1}: ${c.size} bytes`));
      console.log(`Combined audio blob size: ${completeAudio.size} bytes (${(completeAudio.size / 1024).toFixed(2)} KB)`);
      console.log(`Blob type: ${completeAudio.type}`);
      console.log(`Recording duration: ${recordingDuration} seconds`);
      console.log(`Expected file size per second: ~${(completeAudio.size / recordingDuration).toFixed(0)} bytes/sec`);
      console.log('===========================================');

      const fileName = `test-recording.${mimeType === 'audio/webm' ? 'webm' : 'm4a'}`;
      const formData = new FormData();
      formData.append('file', completeAudio, fileName);
      
      console.log(`FormData prepared with file: ${fileName}`);

      const response = await fetch('/api/visits/transcribe', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      console.log('========== TRANSCRIPTION RESPONSE ==========');
      console.log(`Status: ${response.status} ${response.statusText}`);
      console.log(`Response headers:`, Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Error response body: ${errorText}`);
        console.log('============================================');
        throw new Error(`Transcription failed: ${response.status} - ${errorText}`);
      }

      const result: TranscriptionResult = await response.json();
      console.log(`Response body (parsed):`, result);
      console.log('============================================');
      
      setTranscription(result);
    } catch (err) {
      console.error('========== TRANSCRIPTION ERROR ==========');
      console.error(err);
      console.error('=========================================');
      setError(err instanceof Error ? err.message : 'Transcription failed');
    } finally {
      setIsTranscribing(false);
    }
  };

  const clearRecording = () => {
    chunksRef.current = [];
    setChunks([]);
    setTranscription(null);
    setError(null);
    setRecordingDuration(0);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
  };

  const downloadAudio = () => {
    if (chunksRef.current.length === 0) return;

    const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
    const blob = new Blob(chunksRef.current, { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `test-recording-${Date.now()}.${mimeType === 'audio/webm' ? 'webm' : 'm4a'}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Voice Transcription Test</h1>
        <p className="text-muted-foreground">
          Test the OpenAI Whisper transcription API with speaker diarization
        </p>
      </div>

      <div className="grid gap-6">
        {/* Recording Controls */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Recording
            </CardTitle>
            <CardDescription>
              Record audio to test transcription. Speak clearly into your microphone.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Audio Level Meter */}
            {isRecording && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Audio Level</span>
                  <span className="font-mono">{Math.round(audioLevel)}%</span>
                </div>
                <div className="h-4 bg-secondary rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-100 ${
                      audioLevel > 70 ? 'bg-green-500' : audioLevel > 30 ? 'bg-yellow-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${audioLevel}%` }}
                  />
                </div>
                {audioLevel < 20 && (
                  <p className="text-xs text-amber-600">
                    ⚠️ Low audio level - speak louder or move closer to microphone
                  </p>
                )}
              </div>
            )}

            {/* Duration and Chunk Count */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                {isRecording ? (
                  <Badge variant="destructive" className="animate-pulse">
                    Recording
                  </Badge>
                ) : (
                  <Badge variant="secondary">Idle</Badge>
                )}
                <span className="font-mono text-lg">{formatDuration(recordingDuration)}</span>
              </div>
              {chunks.length > 0 && (
                <Badge variant="outline">
                  {chunks.length} chunk{chunks.length !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>

            {/* Control Buttons */}
            <div className="flex gap-2">
              {!isRecording ? (
                <Button onClick={startRecording} size="lg" className="gap-2">
                  <Mic className="h-4 w-4" />
                  Start Recording
                </Button>
              ) : (
                <Button onClick={stopRecording} variant="destructive" size="lg" className="gap-2">
                  <MicOff className="h-4 w-4" />
                  Stop Recording
                </Button>
              )}

              {chunks.length > 0 && !isRecording && (
                <>
                  <Button
                    onClick={transcribeAudio}
                    disabled={isTranscribing}
                    variant="default"
                    size="lg"
                  >
                    {isTranscribing ? 'Transcribing...' : 'Transcribe'}
                  </Button>
                  <Button onClick={downloadAudio} variant="outline" size="lg" className="gap-2">
                    <Download className="h-4 w-4" />
                    Download
                  </Button>
                  <Button onClick={clearRecording} variant="outline" size="lg" className="gap-2">
                    <Trash2 className="h-4 w-4" />
                    Clear
                  </Button>
                </>
              )}
            </div>

            {/* Audio Playback */}
            {audioUrl && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Playback</p>
                <audio controls src={audioUrl} className="w-full" />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Error Display */}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Transcription Results */}
        {transcription && (
          <Card>
            <CardHeader>
              <CardTitle>Transcription Results</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="combined" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="combined">Combined</TabsTrigger>
                  <TabsTrigger value="speakers">By Speaker</TabsTrigger>
                  <TabsTrigger value="segments">Segments</TabsTrigger>
                </TabsList>

                <TabsContent value="combined" className="space-y-4">
                  {transcription.text ? (
                    <div className="p-4 bg-secondary rounded-lg">
                      <p className="whitespace-pre-wrap">{transcription.text}</p>
                    </div>
                  ) : (
                    <Alert>
                      <AlertDescription>
                        No speech detected. The recording may have been too quiet or contained only silence.
                      </AlertDescription>
                    </Alert>
                  )}
                </TabsContent>

                <TabsContent value="speakers" className="space-y-4">
                  {transcription.speakers?.doctorText && (
                    <div>
                      <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
                        <Badge>Doctor</Badge>
                      </h3>
                      <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                        <p className="whitespace-pre-wrap">{transcription.speakers.doctorText}</p>
                      </div>
                    </div>
                  )}

                  {transcription.speakers?.patientText && (
                    <div>
                      <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
                        <Badge variant="secondary">Patient</Badge>
                      </h3>
                      <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                        <p className="whitespace-pre-wrap">{transcription.speakers.patientText}</p>
                      </div>
                    </div>
                  )}

                  {!transcription.speakers?.doctorText && !transcription.speakers?.patientText && (
                    <Alert>
                      <AlertDescription>
                        No speaker separation available. This may occur with very short recordings.
                      </AlertDescription>
                    </Alert>
                  )}
                </TabsContent>

                <TabsContent value="segments" className="space-y-2">
                  {transcription.segments && transcription.segments.length > 0 ? (
                    transcription.segments.map((segment, idx) => (
                      <div
                        key={idx}
                        className={`p-3 rounded-lg ${
                          segment.speaker === 'DOCTOR'
                            ? 'bg-blue-50 dark:bg-blue-950'
                            : 'bg-green-50 dark:bg-green-950'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant={segment.speaker === 'DOCTOR' ? 'default' : 'secondary'}>
                            {segment.speaker}
                          </Badge>
                          {segment.confidence !== undefined && (
                            <span className="text-xs text-muted-foreground">
                              {Math.round(segment.confidence * 100)}% confidence
                            </span>
                          )}
                        </div>
                        <p className="text-sm">{segment.text}</p>
                      </div>
                    ))
                  ) : (
                    <Alert>
                      <AlertDescription>No segmented data available.</AlertDescription>
                    </Alert>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}

        {/* Diagnostics */}
        {chunks.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Diagnostics</CardTitle>
              <CardDescription>Technical information about the recording</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="font-medium text-muted-foreground">Chunks</dt>
                  <dd className="font-mono">{chunks.length}</dd>
                </div>
                <div>
                  <dt className="font-medium text-muted-foreground">Total Size</dt>
                  <dd className="font-mono">
                    {(chunks.reduce((sum, chunk) => sum + chunk.size, 0) / 1024).toFixed(2)} KB
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-muted-foreground">Recording Format</dt>
                  <dd className="font-mono">
                    {MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                      ? 'WebM (Opus codec)'
                      : MediaRecorder.isTypeSupported('audio/webm')
                      ? 'WebM'
                      : 'MP4'}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-muted-foreground">Duration</dt>
                  <dd className="font-mono">{formatDuration(recordingDuration)}</dd>
                </div>
                <div>
                  <dt className="font-medium text-muted-foreground">Avg. Bitrate</dt>
                  <dd className="font-mono">
                    {recordingDuration > 0
                      ? `~${((chunks.reduce((sum, chunk) => sum + chunk.size, 0) * 8) / recordingDuration / 1000).toFixed(1)} kbps`
                      : 'N/A'}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-muted-foreground">Sample Rate</dt>
                  <dd className="font-mono">48 kHz</dd>
                </div>
                <div className="col-span-2">
                  <dt className="font-medium text-muted-foreground mb-1">Backend Processing</dt>
                  <dd className="text-xs text-muted-foreground">
                    {MediaRecorder.isTypeSupported('audio/webm') ? (
                      <>
                        WebM files are automatically converted to WAV (16-bit PCM, 16kHz mono) on the backend for gpt-4o-transcribe compatibility.
                        <br />
                        <span className="font-mono text-xs">WebM → WAV → gpt-4o-transcribe → Transcription</span>
                      </>
                    ) : (
                      'MP4 files are sent directly to gpt-4o-transcribe (already supported format)'
                    )}
                  </dd>
                </div>
              </dl>

              <div className="mt-4">
                <h4 className="font-medium text-sm mb-2">Chunk Details</h4>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {chunks.map((chunk, idx) => (
                    <div key={idx} className="text-xs font-mono text-muted-foreground">
                      Chunk {idx + 1}: {(chunk.size / 1024).toFixed(2)} KB
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

