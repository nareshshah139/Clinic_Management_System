# Voice Transcription Quick Debug Reference

## 🚀 Quick Test

1. **Open Test Page**: http://localhost:3000/test-transcribe
2. **Open Browser Console**: Press `F12` → Console tab
3. **Open Backend Terminal**: Where `npm run dev` is running
4. **Record & Transcribe**: Follow the steps below

---

## 📊 What to Look For

### ✅ Successful Recording Checklist

**Frontend (Browser Console):**
```
✓ MEDIARECORDER SETUP shows: "audio/webm;codecs=opus"
✓ Audio level meter shows 50-80% (green/yellow)
✓ TRANSCRIPTION REQUEST shows: blob size > 10 KB
✓ Recording duration > 2 seconds
✓ TRANSCRIPTION RESPONSE shows: Status 200 OK
✓ Response body has non-empty "text" field
```

**Backend (Terminal):**
```
✓ AUDIO FILE DETAILS shows: Original size matches frontend
✓ Was converted: Yes (WebM → WAV)
✓ Final size > Original size (WAV is uncompressed)
✓ OPENAI TRANSCRIPTION RESPONSE: Status 200 OK
✓ TRANSCRIPTION RESULT: "✓ Successfully transcribed X characters"
```

---

## ❌ Common Issues & Quick Fixes

### Issue: Empty Transcript ("No speech detected")

**Check 1: Audio Level During Recording**
- Look at audio level meter in UI
- Should be GREEN (> 70%) or YELLOW (30-70%)
- If RED (< 30%) → **Speak louder** or **move closer to microphone**

**Check 2: Recording Size**
- Browser console → `TRANSCRIPTION REQUEST` section
- Look for: `Combined audio blob size: X bytes`
- If < 10 KB → **Recording is too short or only silence**
- Expected: ~20-50 KB per second of speech

**Check 3: Backend Conversion**
- Backend terminal → Look for:
  ```
  Converting WebM to WAV for gpt-4o-transcribe: /path/to/file.webm
  Successfully converted to WAV: /path/to/file.webm.wav
  ```
- If missing → **FFmpeg not installed** (see below)

**Check 4: OpenAI Response**
- Backend terminal → `OPENAI TRANSCRIPTION RESPONSE` section
- If Status 200 but empty text → **Audio is silence or too quiet**
- If Status 400 → **Format issue** (should not happen after conversion)
- If Status 401 → **Invalid API key**

---

### Issue: FFmpeg Conversion Fails

**Symptoms:**
```
WebM conversion failed: spawn ffmpeg ENOENT
```

**Fix:**
```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt-get install ffmpeg

# Then restart backend
npm run dev
```

**Verify:**
```bash
ffmpeg -version
# Should show: ffmpeg version 7.x.x
```

---

### Issue: Microphone Not Working

**Quick Checks:**
1. Browser permissions → Allow microphone access
2. System Settings → Sound → Input → Select correct microphone
3. Test in another app (Voice Memos, Zoom)
4. Refresh page and allow permissions again

---

## 🎯 Expected Log Output (Success Case)

### Frontend Console (Browser)
```
========== MEDIARECORDER SETUP ==========
Selected mimeType: audio/webm;codecs=opus
Supported formats:
  audio/webm;codecs=opus: true
  ...
=========================================

Chunk received: 81920 bytes
Chunk received: 81920 bytes
Recording stopped

========== TRANSCRIPTION REQUEST ==========
Total chunks: 3
Combined audio blob size: 245832 bytes (240.07 KB)
Recording duration: 12 seconds
===========================================

========== TRANSCRIPTION RESPONSE ==========
Status: 200 OK
Response body (parsed): {
  "text": "Hello, how can I help you today?",
  ...
}
============================================
```

### Backend Terminal
```
========== AUDIO FILE DETAILS ==========
Original file: test-recording.webm
Original mimetype: audio/webm
Original size: 245832 bytes (240.07 KB)
Final mimetype: audio/wav
Was converted: Yes (WebM → WAV)
========================================

========== OPENAI TRANSCRIPTION REQUEST ==========
Endpoint: https://api.openai.com/v1/audio/transcriptions
Model: gpt-4o-transcribe
==================================================

========== OPENAI TRANSCRIPTION RESPONSE ==========
Status: 200 OK
Response body (parsed JSON):
{
  "text": "Hello, how can I help you today?",
  ...
}
===================================================

========== TRANSCRIPTION RESULT ==========
Text extracted: "Hello, how can I help you today?"
Text length: 35 characters
✓ Successfully transcribed 35 characters
==========================================
```

---

## 🔍 Debug Workflow (3 Minutes)

**Step 1: Start Recording (30 sec)**
- Click "Start Recording"
- **Watch audio level meter** → Should show activity
- Speak clearly for 5-10 seconds
- Click "Stop Recording"

**Step 2: Check Frontend (30 sec)**
- Open browser console (F12)
- Look for `TRANSCRIPTION REQUEST` section
- Verify blob size > 10 KB
- Note recording duration

**Step 3: Transcribe (30 sec)**
- Click "Transcribe" button
- Wait for response (5-10 seconds)

**Step 4: Check Logs (1 min)**
- **Backend terminal**: Look for all 4 sections
- **Browser console**: Look for `TRANSCRIPTION RESPONSE`
- Compare with "Expected Log Output" above

**Step 5: Diagnose (30 sec)**
- If text appears in UI → ✅ **Success!**
- If empty → Check which step failed using logs
- Use "Common Issues" section above

---

## 📋 Microphone Setup Tips

### Best Settings (Already Configured)
- ✅ Echo cancellation
- ✅ Noise suppression
- ✅ Auto gain control (boosts quiet speech)
- ✅ 48 kHz sample rate

### Recording Tips
1. **Distance**: 15-30 cm from microphone
2. **Environment**: Quiet room
3. **Speech**: Clear, moderate pace
4. **Volume**: Watch meter, aim for green/yellow

---

## 🆘 Still Not Working?

1. **Download audio** from test page
2. **Play it back** → Can you hear yourself?
3. **Check file size** → Should be ~20-50 KB/second
4. **Copy all logs** from browser + backend
5. **Check** `VOICE_TRANSCRIPTION_DEBUG_GUIDE.md` for detailed troubleshooting

---

## 📁 Key Files

- **Frontend**: `frontend/src/app/test-transcribe/page.tsx`
- **Backend**: `backend/src/modules/visits/visits.controller.ts`
- **Detailed Guide**: `VOICE_TRANSCRIPTION_DEBUG_GUIDE.md`
- **Updates Log**: `updates_log.txt` (entry 2025-10-27 14:30)

---

**Last Updated:** 2025-10-27 14:30 UTC  
**Quick Reference Version:** 1.0

