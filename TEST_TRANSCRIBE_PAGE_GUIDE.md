# Voice Transcription Test Page - User Guide

## Access

Navigate to **Test Transcribe** in the sidebar or visit `/test-transcribe`

**Accessible to:** ADMIN, OWNER, and DOCTOR roles

## Purpose

Test and debug the OpenAI Whisper voice transcription API in an isolated environment without needing to navigate through the patient visit workflow.

## Features

### 1. Real-Time Audio Level Meter 🎤

- **Visual Feedback**: Color-coded bar shows audio input level
  - 🟢 **Green (70%+)**: Excellent audio level
  - 🟡 **Yellow (30-70%)**: Good audio level  
  - 🔴 **Red (< 30%)**: Audio too quiet - speak louder!
- **Warning**: Displays alert if audio level is consistently low
- **Purpose**: Helps diagnose microphone issues before transcription

### 2. Recording Controls

#### Start Recording
- Click **"Start Recording"** button
- Grant microphone permissions when prompted
- Speak clearly into your microphone
- Status badge changes to pulsing "Recording"

#### Stop Recording
- Click **"Stop Recording"** button (red)
- Audio chunks are automatically combined
- Recording saved and ready for transcription

#### Duration Counter
- Real-time display of recording length (MM:SS format)
- Helpful to ensure you've recorded enough audio

### 3. Audio Playback

- After recording, an audio player appears
- Test playback to verify recording quality
- Ensure volume is sufficient before transcribing

### 4. Transcription

Click **"Transcribe"** button to send audio to OpenAI Whisper API

**What Happens:**
1. All audio chunks combined into single file
2. Uploaded to `/api/visits/transcribe` endpoint
3. OpenAI Whisper transcribes audio
4. GPT-4 performs speaker diarization (separates DOCTOR/PATIENT)
5. Results displayed in 3 tabs

### 5. Results Display

#### Tab 1: Combined
- Full transcript as continuous text
- Shows all speakers together
- Use this for quick overview

#### Tab 2: By Speaker
- **Doctor Section** (blue background): All doctor utterances combined
- **Patient Section** (green background): All patient utterances combined
- Color-coded for easy distinction
- Useful for reviewing speaker separation quality

#### Tab 3: Segments
- Individual conversation turns
- Each segment shows:
  - **Speaker badge** (DOCTOR or PATIENT)
  - **Confidence score** (if available)
  - **Segment text**
- Shows conversation flow chronologically
- Useful for verifying diarization accuracy

### 6. Diagnostics Panel

Technical information about the recording:

- **Chunks**: Number of audio chunks created
- **Total Size**: Combined audio file size in KB
- **Format**: Audio codec (WebM or MP4)
- **Duration**: Total recording length
- **Chunk Details**: Individual chunk sizes for debugging

### 7. Additional Actions

#### Download Audio
- Saves recorded audio to your computer
- Filename: `test-recording-[timestamp].[ext]`
- Useful for sharing recordings or testing with other tools

#### Clear Recording
- Removes current recording
- Clears transcription results
- Resets all counters
- Start fresh with new recording

## Tips for Best Results

### Microphone Setup
1. **Check System Settings**: Ensure correct microphone is selected
2. **Get Close**: Position microphone 1-2 feet from your mouth
3. **Speak Normally**: Auto-gain control will adjust volume
4. **Watch Level Meter**: Keep audio in green/yellow range

### Recording Tips
1. **Record 5+ seconds minimum**: Very short recordings may fail
2. **Speak Clearly**: Articulate words, avoid mumbling
3. **Minimize Background Noise**: Close windows, turn off fans
4. **One speaker at a time**: For better diarization results

### Testing Scenarios

#### Test 1: Audio Quality
- Record yourself speaking normally
- Check if audio level meter shows green/yellow
- Verify playback sounds clear

#### Test 2: Transcription Accuracy
- Speak medical terms clearly
- Check if Whisper transcribes correctly
- Note: Model is trained on medical terminology

#### Test 3: Speaker Diarization
- Have two people alternate speaking
- Say "Doctor says..." and "Patient says..." to help
- Check "By Speaker" tab for separation quality

## Troubleshooting

### "No speech detected"

**Causes:**
- Audio too quiet (check level meter)
- Microphone muted in system settings
- Recording too short (< 1 second)
- Only silence/noise recorded

**Solutions:**
1. Check system microphone volume (increase to 70-100%)
2. Get closer to microphone
3. Speak louder
4. Record for at least 5 seconds
5. Test playback before transcribing

### Permission Denied

**Solution:**
- Browser blocked microphone access
- Click browser address bar icon
- Allow microphone permissions
- Reload page and try again

### Transcription Failed

**Check:**
1. Backend logs for detailed error
2. `backend/transcribe_errors.log` file
3. OPENAI_API_KEY is configured
4. Audio file is valid (test playback)

## Audio Settings Used

The page automatically requests high-quality audio:

```javascript
{
  echoCancellation: true,      // Removes echo
  noiseSuppression: true,       // Filters background noise
  autoGainControl: true,        // Auto-adjusts volume
  sampleRate: 48000,           // High-quality 48kHz
}
```

These settings optimize for speech recognition and work with the MediaRecorder fix that combines chunks into complete audio files.

## Technical Notes

### How It Works

1. **MediaRecorder** captures audio in 5-second chunks
2. **AudioContext** analyzes audio for level meter
3. Chunks **accumulated** (not streamed individually)
4. On stop, chunks **combined** into single Blob
5. Complete audio file sent to transcription endpoint
6. Results parsed and displayed in tabs

### Why This Approach?

MediaRecorder chunks are **stream fragments**, not standalone files. OpenAI requires complete valid audio files. By accumulating and combining chunks, we create a properly structured WebM/MP4 file that OpenAI can process.

### Browser Compatibility

- **Chrome/Edge**: WebM with Opus codec ✅
- **Safari**: MP4 with AAC codec ✅  
- **Firefox**: WebM with Opus codec ✅

All major browsers supported!

## Common Use Cases

### 1. Microphone Testing
- Quick way to verify microphone works
- Check audio levels before patient visits
- Ensure correct mic is selected in system

### 2. Transcription Quality Testing
- Test with various accents
- Verify medical term recognition
- Check different audio conditions

### 3. Speaker Diarization Testing
- Test doctor-patient separation
- Verify confidence scores
- Tune speaking patterns for better results

### 4. Debugging Issues
- Reproduce transcription errors
- Capture diagnostic information
- Download problematic audio for analysis

## Comparison: Test Page vs. Production

| Feature | Test Page | Visit Form | Prescription Builder |
|---------|-----------|------------|---------------------|
| Audio Level Meter | ✅ Yes | ❌ No | ❌ No |
| Chunk Details | ✅ Yes | ❌ No | ❌ No |
| Playback Preview | ✅ Yes | ❌ No | ❌ No |
| Download Audio | ✅ Yes | ❌ No | ❌ No |
| Diagnostics | ✅ Yes | ❌ No | ❌ No |
| Speaker Tabs | ✅ Yes | ❌ No | ❌ No |
| Auto-insert Text | ❌ No | ✅ Yes | ✅ Yes |

**Use Test Page for:** Testing, debugging, verification  
**Use Production for:** Actual patient documentation

## Summary

The Test Transcribe page provides a **comprehensive testing environment** for voice transcription with:

- ✅ Visual audio feedback
- ✅ Quality diagnostics
- ✅ Detailed results
- ✅ Download capability
- ✅ Isolated from patient data

Perfect for **troubleshooting, testing new microphones, or verifying transcription quality** before using in production workflows!

