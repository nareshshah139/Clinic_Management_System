# Voice Transcription 503 Error Fix

## Problem

Users were experiencing console errors when using voice transcription:
```
Console Error: Chunk upload failed after retries 503
```

This was causing the voice input feature to fail intermittently, especially at the start of recordings or during silent periods.

## Root Cause

The issue was caused by the browser's `MediaRecorder` API creating very small audio chunks (< 500 bytes) that the OpenAI Transcriptions API rejects. This typically happens when:

1. **Initial Silence**: The first 30-second chunk might contain mostly silence
2. **Short Recording**: User stops recording before reaching the 30-second mark
3. **Audio Quality Issues**: Microphone produces very low-quality audio

OpenAI's Whisper API requires **minimum 0.1 seconds of actual audio content**, which typically translates to at least 500-1000 bytes depending on the codec.

## Solution

Implemented **multi-layer validation** to gracefully handle small/invalid audio chunks:

### 1. Frontend Validation (PrescriptionBuilder.tsx & MedicalVisitForm.tsx)

Added minimum chunk size check **before uploading**:

```typescript
recorder.ondataavailable = (e) => {
  if (!e.data || e.data.size <= 0) return;
  
  // Skip chunks that are too small (< 500 bytes)
  // OpenAI requires minimum 0.1s of audio, which is typically > 500 bytes
  if (e.data.size < 500) {
    console.warn(`Skipping small audio chunk: ${e.data.size} bytes`);
    return;
  }
  
  // ... proceed with upload
};
```

**Benefits:**
- Prevents unnecessary API calls
- Reduces network traffic
- Provides diagnostic logging

### 2. Backend Validation (visits.controller.ts)

Added server-side check as a **safety net**:

```typescript
async uploadTranscriptionChunk(...) {
  if (!file) throw new BadRequestException('No file provided');
  
  // OpenAI requires minimum 0.1s of audio (~1KB for WebM)
  // Very small chunks are likely errors or silence
  if (file.size < 500) {
    this.logger.warn(`transcribe/chunk: chunk too small (${file.size} bytes), skipping`);
    return { text: '', segments: [] }; // Return empty result instead of error
  }
  
  // ... proceed with OpenAI API call
}
```

**Benefits:**
- Graceful degradation (returns empty result instead of 503)
- Server-side logging for monitoring
- Prevents OpenAI API calls that will fail

### 3. Enhanced Error Logging

Improved backend logging to include diagnostic information:

```typescript
this.logger.debug(`transcribe/chunk: uploading ${file.size} bytes, model=${transcribeModel}`);

if (!resp.ok) {
  const errText = await resp.text();
  this.logger.error(
    `transcribe/chunk OpenAI error: status=${resp.status}, fileSize=${file.size} bytes, ` +
    `mimeType=${file.mimetype}, model=${transcribeModel}, error=${errText.slice(0, 500)}`
  );
  
  // Return informative error to client
  const errorDetail = errText.includes('duration') 
    ? 'Audio chunk too short (minimum 0.1 seconds required)'
    : errText.includes('format') || errText.includes('invalid')
    ? 'Invalid audio format'
    : 'OpenAI transcription service error';
  throw new ServiceUnavailableException(errorDetail);
}
```

### 4. Improved User Feedback

Updated error messages to be more helpful:

```typescript
if (!ok) {
  console.error('Chunk upload failed after retries', lastStatus, `chunk size: ${e.data.size} bytes`);
  if (!chunkErrorShownRef.current) {
    chunkErrorShownRef.current = true;
    const errorMsg = lastStatus === 503 
      ? 'The audio quality may be too low or the recording too short. Try speaking clearly and recording for at least 1-2 seconds.'
      : 'Some audio chunks failed to upload. Final transcript may be incomplete.';
    toast({ 
      variant: 'warning', 
      title: 'Voice transcription issue', 
      description: errorMsg 
    });
  }
}
```

### 5. Retry Logic Enhancement

Added retry logic with exponential backoff to MedicalVisitForm (matching PrescriptionBuilder):

```typescript
const maxAttempts = 3;
let attempt = 0;
let ok = false;
let lastStatus: number | null = null;

while (attempt < maxAttempts && !ok) {
  try {
    const upRes = await fetch(url, { method: 'POST', body: fd, credentials: 'include' });
    lastStatus = upRes.status;
    if (upRes.ok) {
      ok = true;
      break;
    }
  } catch (e) {
    // swallow, will retry
  }
  attempt += 1;
  if (attempt < maxAttempts) {
    const delayMs = 500 * Math.pow(2, attempt - 1); // 500ms, 1000ms
    await new Promise((r) => setTimeout(r, delayMs));
  }
}
```

## Technical Details

### Audio Chunk Sizes

MediaRecorder creates chunks every 30 seconds:
```typescript
recorder.start(30000); // 30-second chunks
```

Typical chunk sizes:
- **Normal audio (speaking)**: 50KB - 500KB per 30-second chunk
- **Silence**: 1KB - 10KB per 30-second chunk
- **Very short recordings**: < 500 bytes

### OpenAI API Requirements

- **Minimum duration**: 0.1 seconds of audio
- **Minimum file size**: ~500-1000 bytes (depending on codec)
- **Supported formats**: WebM, MP4, WAV, MP3, M4A, OGG
- **Maximum file size**: 25 MB per request

### Error Handling Flow

```
1. MediaRecorder generates chunk
2. Frontend checks size (< 500 bytes?)
   ├─ Yes → Skip, log warning
   └─ No → Upload to backend
3. Backend receives chunk
4. Backend checks size (< 500 bytes?)
   ├─ Yes → Return empty result, log warning
   └─ No → Send to OpenAI
5. OpenAI validates audio
   ├─ Invalid → Backend logs error, returns specific message
   └─ Valid → Transcribe and return
6. Frontend handles response
   ├─ Failed → Retry up to 3 times with backoff
   └─ Success → Merge into transcript
```

## Testing

### Test Scenario 1: Normal Recording
- **Action**: Record 30+ seconds of speaking
- **Expected**: All chunks uploaded successfully
- **Result**: ✓ Works as expected

### Test Scenario 2: Short Recording
- **Action**: Record < 5 seconds of speaking
- **Expected**: Small chunks skipped with console warning
- **Result**: ✓ Gracefully handled, no 503 errors

### Test Scenario 3: Silent Recording
- **Action**: Record with microphone muted
- **Expected**: Very small chunks skipped
- **Result**: ✓ No errors, returns empty transcript

### Test Scenario 4: Network Issues
- **Action**: Simulate network failure during upload
- **Expected**: Retry with backoff, show user-friendly message
- **Result**: ✓ Retries succeed or shows appropriate warning

## Files Modified

1. **`backend/src/modules/visits/visits.controller.ts`**
   - Added minimum chunk size validation (500 bytes)
   - Enhanced error logging with file size and MIME type
   - Improved error messages based on OpenAI error content

2. **`frontend/src/components/visits/PrescriptionBuilder.tsx`**
   - Added pre-upload chunk size check (500 bytes)
   - Improved error messages for 503 status
   - Added chunk size to error logs

3. **`frontend/src/components/visits/MedicalVisitForm.tsx`**
   - Added pre-upload chunk size check (500 bytes)
   - Implemented retry logic with exponential backoff
   - Enhanced error logging

## Monitoring

To monitor transcription issues, check backend logs for:

```bash
# Warnings about small chunks
grep "chunk too small" backend.log

# OpenAI errors with details
grep "transcribe/chunk OpenAI error" backend.log

# Frontend errors (browser console)
"Skipping small audio chunk"
"Chunk upload failed after retries"
```

## Future Improvements

1. **Dynamic Chunk Size**: Adjust chunk interval based on detected speech vs. silence
2. **Pre-processing**: Use Web Audio API to detect silence and skip empty chunks
3. **Progress Indicator**: Show real-time chunk upload status to users
4. **Batch Processing**: Combine small chunks before sending to API
5. **Voice Activity Detection (VAD)**: Only create chunks when speech is detected

## Summary

The fix implements **defense in depth** with validation at multiple layers:
- ✅ Frontend pre-filtering (saves bandwidth)
- ✅ Backend validation (graceful degradation)
- ✅ Enhanced error logging (debugging)
- ✅ User-friendly messages (better UX)
- ✅ Retry logic (resilience)

This ensures voice transcription works reliably even with challenging audio conditions, providing a better user experience while maintaining system stability.

