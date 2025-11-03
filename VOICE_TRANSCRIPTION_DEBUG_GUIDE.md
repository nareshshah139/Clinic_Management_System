# Voice Transcription Debug Guide

**Date:** 2025-10-27  
**Status:** ✅ FIXED - FFmpeg Import + Comprehensive Diagnostic Logging Added

## 🔍 Overview

This guide documents the comprehensive debugging tools and logging added to diagnose "no speech detected" issues in the voice transcription feature. The system now provides detailed information about every step of the audio processing pipeline.

---

## 🐛 Issues Fixed

### 1. FFmpeg Import Error (CRITICAL)
**Problem:** `_fluentffmpeg is not a function` error preventing WebM→WAV conversion  
**Root Cause:** Incorrect CommonJS import statement  
**Solution:**
```typescript
// Before (WRONG):
import * as ffmpeg from 'fluent-ffmpeg';

// After (CORRECT):
import ffmpeg from 'fluent-ffmpeg';
```

**Impact:** Without this fix, WebM files could not be converted to WAV format, causing all transcriptions to fail since gpt-4o-transcribe doesn't support WebM.

---

## 📊 Comprehensive Logging Added

### Backend Logging (`visits.controller.ts`)

The backend now logs **4 detailed sections** for every transcription request:

#### 1. AUDIO FILE DETAILS Section
Logs information about the uploaded audio file:
```
========== AUDIO FILE DETAILS ==========
Original file: test-recording.webm
Original mimetype: audio/webm
Original size: 245832 bytes (240.07 KB)
Final file path: /uploads/tmp/transcribe/1761548363495_017d47a20d2e.webm.wav
Final mimetype: audio/wav
Final size: 512000 bytes (500.00 KB)
Display name: test-recording.wav
Was converted: Yes (WebM → WAV)
========================================
```

**What to check:**
- ✅ Original size > 0 (not empty)
- ✅ Final size > Original size for WAV (expected due to uncompressed format)
- ✅ Conversion status matches file format

#### 2. OPENAI TRANSCRIPTION REQUEST Section
Logs the exact parameters being sent to OpenAI:
```
========== OPENAI TRANSCRIPTION REQUEST ==========
Endpoint: https://api.openai.com/v1/audio/transcriptions
Model: gpt-4o-transcribe
Language: en
Temperature: 0
Response format: verbose_json
API Key: sk-proj...xyz (length: 164)
==================================================
```

**What to check:**
- ✅ API Key is present and correct length (~164 chars)
- ✅ Model is `gpt-4o-transcribe` (not `whisper-1`)
- ✅ Response format is `verbose_json` (provides segments)

#### 3. OPENAI TRANSCRIPTION RESPONSE Section
Logs the raw response from OpenAI:
```
========== OPENAI TRANSCRIPTION RESPONSE ==========
Status: 200 OK
Headers: {
  "content-type": "application/json",
  "x-request-id": "req_abc123...",
  ...
}
Response body (parsed JSON):
{
  "text": "Hello, how can I help you today?",
  "language": "en",
  "duration": 12.5,
  "segments": [...]
}
===================================================
```

**What to check:**
- ✅ Status is `200 OK`
- ✅ Response body contains `text` field
- ❌ If Status is 4xx/5xx, check error message
- ❌ If `text` is empty, audio may be silence or too quiet

#### 4. TRANSCRIPTION RESULT Section
Logs the parsed result with diagnostics:
```
========== TRANSCRIPTION RESULT ==========
Text extracted: "Hello, how can I help you today?"
Text length: 35 characters
Has segments: Yes
Number of segments: 3
==========================================
✓ Successfully transcribed 35 characters
```

**If text is EMPTY:**
```
========== TRANSCRIPTION RESULT ==========
Text extracted: (EMPTY)
Text length: 0 characters
Has segments: No
==========================================
⚠️  EMPTY TRANSCRIPT: No speech detected by OpenAI Whisper API
Possible causes:
  1. Audio file contains only silence
  2. Audio level too low to detect speech
  3. Audio format issue (though conversion should have fixed this)
  4. Audio duration too short (< 0.1 seconds)
```

---

### Frontend Logging (`test-transcribe/page.tsx`)

The frontend test page logs **3 detailed sections** in the browser console:

#### 1. MEDIARECORDER SETUP Section
Logs when recording starts:
```
========== MEDIARECORDER SETUP ==========
Selected mimeType: audio/webm;codecs=opus
Supported formats:
  audio/webm;codecs=opus: true
  audio/webm: true
  audio/mp4: false
  audio/ogg;codecs=opus: true
Audio constraints: {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  sampleRate: 48000
}
=========================================
MediaRecorder created:
  Actual mimeType: audio/webm; codecs=opus
  State: recording
  audioBitsPerSecond: 128000
=========================================
```

**What to check:**
- ✅ Browser supports `audio/webm;codecs=opus` (preferred)
- ✅ Sample rate is 48000 Hz
- ✅ Auto gain control is enabled (helps with quiet speech)

#### 2. TRANSCRIPTION REQUEST Section
Logs before sending to backend:
```
========== TRANSCRIPTION REQUEST ==========
Total chunks: 3
Individual chunk sizes: ["1: 81920 bytes", "2: 81920 bytes", "3: 81992 bytes"]
Combined audio blob size: 245832 bytes (240.07 KB)
Blob type: audio/webm
Recording duration: 12 seconds
Expected file size per second: ~20486 bytes/sec
===========================================
```

**What to check:**
- ✅ Total size > 10 KB (too small = likely silence)
- ✅ Bitrate ~20-50 KB/sec is normal for Opus codec
- ✅ Duration matches actual recording time

#### 3. TRANSCRIPTION RESPONSE Section
Logs the API response:
```
========== TRANSCRIPTION RESPONSE ==========
Status: 200 OK
Response headers: {
  "content-type": "application/json",
  ...
}
Response body (parsed): {
  "text": "Hello, how can I help you today?",
  "segments": [...],
  "speakers": {...}
}
============================================
```

**What to check:**
- ✅ Status is `200 OK`
- ✅ `text` field is not empty
- ❌ If error, check error message in console

---

## 🎯 Diagnostic UI Enhancements

The test page (`/test-transcribe`) now displays:

### Recording Info
- **Recording Format:** WebM (Opus codec)
- **Sample Rate:** 48 kHz
- **Avg. Bitrate:** ~20-50 kbps (calculated from size/duration)

### Audio Level Meter
- Real-time visualization (Green = Good, Yellow = OK, Red = Low)
- Warning if level < 20%: "⚠️ Low audio level - speak louder or move closer to microphone"

### Backend Processing Pipeline
```
WebM → WAV → gpt-4o-transcribe → Transcription
```

---

## 🔧 Troubleshooting Guide

### Problem: "No speech detected" (Empty Transcript)

**Check in this order:**

1. **Frontend Browser Console**
   - Look for `TRANSCRIPTION REQUEST` section
   - Verify `Combined audio blob size` > 10 KB
   - Check `Recording duration` > 1 second
   - If blob is tiny (<5 KB), recording is likely silence

2. **Backend Server Logs**
   - Look for `AUDIO FILE DETAILS` section
   - Verify `Original size` matches frontend blob size
   - Check `Was converted: Yes` if WebM file
   - If conversion fails, ffmpeg may not be installed

3. **OpenAI Response**
   - Look for `OPENAI TRANSCRIPTION RESPONSE` section
   - If Status is 400, check error message (usually format issue)
   - If Status is 401, API key is invalid
   - If Status is 200 but text is empty, audio is silence or too quiet

4. **Audio Quality**
   - Check frontend `Audio Level Meter` during recording
   - If meter shows < 20% (red), speak louder
   - If meter shows 0%, microphone may be muted or not working
   - Try browser DevTools → Settings → Privacy → Microphone permissions

### Problem: FFmpeg Conversion Fails

**Symptoms:**
```
WebM conversion failed: spawn ffmpeg ENOENT
```

**Solution:**
1. Install ffmpeg on your system:
   ```bash
   # macOS (Homebrew)
   brew install ffmpeg
   
   # Ubuntu/Debian
   sudo apt-get install ffmpeg
   
   # Windows (Chocolatey)
   choco install ffmpeg
   ```

2. Verify installation:
   ```bash
   ffmpeg -version
   ```

3. Restart backend server

### Problem: API Key Issues

**Symptoms:**
```
OpenAI error response: 401 Unauthorized
```

**Solution:**
1. Check `.env` file has valid `OPENAI_API_KEY`
2. Verify key format: `sk-proj-...` (164 chars)
3. Check key hasn't expired in OpenAI dashboard
4. Restart backend to reload environment variables

---

## 📝 Testing Workflow

1. **Navigate to Test Page**
   ```
   http://localhost:3000/test-transcribe
   ```

2. **Open Browser Console**
   - Chrome/Edge: F12 → Console tab
   - Firefox: F12 → Console tab
   - Safari: Cmd+Opt+C

3. **Record Audio**
   - Click "Start Recording"
   - Watch audio level meter (should be green/yellow)
   - Speak clearly for 5-10 seconds
   - Click "Stop Recording"

4. **Check Frontend Console**
   - Look for `MEDIARECORDER SETUP` logs
   - Verify recording format and settings
   - Check `TRANSCRIPTION REQUEST` logs
   - Note blob size and duration

5. **Transcribe**
   - Click "Transcribe" button
   - Check `TRANSCRIPTION RESPONSE` in browser console

6. **Check Backend Logs**
   - Look in terminal/console where backend is running
   - Find all 4 sections:
     1. AUDIO FILE DETAILS
     2. OPENAI TRANSCRIPTION REQUEST
     3. OPENAI TRANSCRIPTION RESPONSE
     4. TRANSCRIPTION RESULT

7. **Analyze Results**
   - If successful, text will appear in UI
   - If failed, review logs section by section
   - Use troubleshooting guide above

---

## 🎤 Microphone Tips for Better Results

### Audio Quality Settings (Already Configured)
- ✅ Echo cancellation: Enabled
- ✅ Noise suppression: Enabled
- ✅ Auto gain control: Enabled (boosts quiet speech)
- ✅ Sample rate: 48 kHz (high quality)

### Recording Best Practices
1. **Distance:** 15-30 cm (6-12 inches) from microphone
2. **Environment:** Quiet room with minimal background noise
3. **Speech:** Clear pronunciation, moderate pace
4. **Volume:** Aim for 50-80% on audio level meter (green/yellow)
5. **Duration:** At least 2-3 seconds (Whisper needs some context)

### Microphone Check
1. Open browser settings → Privacy → Microphone
2. Verify correct microphone selected (not system default)
3. Check system sound settings (not muted)
4. Test in another app (Voice Memos, Zoom) to verify hardware works

---

## 📁 Files Modified

### Backend
- `backend/src/modules/visits/visits.controller.ts`
  - Fixed ffmpeg import (CommonJS default)
  - Added 4 comprehensive logging sections
  - Enhanced error messages

### Frontend
- `frontend/src/app/test-transcribe/page.tsx`
  - Added MediaRecorder setup logging
  - Added transcription request/response logging
  - Enhanced diagnostics UI (bitrate, codec info)

### Documentation
- `updates_log.txt` - Detailed entry added
- `VOICE_TRANSCRIPTION_DEBUG_GUIDE.md` (this file)

---

## ✅ Verification Steps

1. **Backend Logs Appear**
   ```bash
   # Start recording and transcribing
   # Check terminal shows all 4 sections
   ========== AUDIO FILE DETAILS ==========
   ========== OPENAI TRANSCRIPTION REQUEST ==========
   ========== OPENAI TRANSCRIPTION RESPONSE ==========
   ========== TRANSCRIPTION RESULT ==========
   ```

2. **Frontend Console Logs Appear**
   ```javascript
   // Open browser console (F12)
   // Check for 3 sections
   ========== MEDIARECORDER SETUP ==========
   ========== TRANSCRIPTION REQUEST ==========
   ========== TRANSCRIPTION RESPONSE ==========
   ```

3. **FFmpeg Works**
   ```bash
   # Check backend logs show successful conversion
   Converting WebM to WAV for gpt-4o-transcribe: /path/to/file.webm
   Successfully converted to WAV: /path/to/file.webm.wav
   Was converted: Yes (WebM → WAV)
   ```

4. **Transcription Succeeds**
   - Record 5-10 seconds of speech
   - Click transcribe
   - See text appear in UI
   - Backend logs show: `✓ Successfully transcribed X characters`

---

## 🔍 Next Steps if Still Failing

If transcription still fails after these fixes:

1. **Download the recorded audio** (test page has Download button)
2. **Play it back** - Can you hear your voice clearly?
3. **Check the WAV file** in `backend/uploads/tmp/transcribe/`
4. **Try the WAV directly** with OpenAI API using curl:
   ```bash
   curl https://api.openai.com/v1/audio/transcriptions \
     -H "Authorization: Bearer $OPENAI_API_KEY" \
     -F "file=@/path/to/file.wav" \
     -F "model=gpt-4o-transcribe"
   ```

5. **Compare logs** between working and failing cases
6. **Check OpenAI API status** at status.openai.com

---

## 📞 Support

If issues persist:
1. Copy all logs from both browser console and backend terminal
2. Include the downloaded audio file (if < 1 MB)
3. Note your environment (OS, browser, Node version)
4. Share via issue tracker or support channel

---

**Last Updated:** 2025-10-27 14:30 UTC  
**Author:** AI Assistant  
**Version:** 1.0

