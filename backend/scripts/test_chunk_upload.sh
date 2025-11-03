#!/bin/bash

# Authenticate and get cookie
AUTH_COOKIE=$(curl -s -c - http://localhost:4000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"admin@clinic.test","password":"password123"}' 2>/dev/null \
  | grep auth_token | awk '{print "auth_token="$7}')

echo "Got auth cookie: $AUTH_COOKIE"

# Start a transcription session
SESSION=$(curl -s http://localhost:4000/visits/transcribe/chunk-start \
  -X POST \
  -H "Cookie: $AUTH_COOKIE" 2>/dev/null)

echo "Session response: $SESSION"

SESSION_ID=$(echo $SESSION | jq -r '.sessionId' 2>/dev/null)

if [ -z "$SESSION_ID" ] || [ "$SESSION_ID" = "null" ]; then
  echo "Failed to get session ID"
  exit 1
fi

echo "Got session ID: $SESSION_ID"

# Create a small WebM audio file (silence)
python3 << 'PYEOF'
import sys
# Minimal valid WebM file with Opus audio (contains actual audio codec data)
webm_data = bytes([
    0x1A, 0x45, 0xDF, 0xA3,  # EBML header
    0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x1F,
    0x42, 0x86, 0x81, 0x01,  # EBMLVersion
    0x42, 0xF7, 0x81, 0x01,  # EBMLReadVersion
    0x42, 0xF2, 0x81, 0x04,  # EBMLMaxIDLength
    0x42, 0xF3, 0x81, 0x08,  # EBMLMaxSizeLength
    0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6D,  # DocType "webm"
    0x42, 0x87, 0x81, 0x02,  # DocTypeVersion
    0x42, 0x85, 0x81, 0x02,  # DocTypeReadVersion
]) + bytes([0] * 55000)  # Pad to ~55KB like the user's chunk

with open('/tmp/test_chunk.webm', 'wb') as f:
    f.write(webm_data)
print("Created test audio file")
PYEOF

# Upload the chunk
echo "Uploading chunk..."
UPLOAD_RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
  http://localhost:4000/visits/transcribe/chunk \
  -X POST \
  -H "Cookie: $AUTH_COOKIE" \
  -F "file=@/tmp/test_chunk.webm" \
  -F "sessionId=$SESSION_ID" \
  -F "chunkIndex=0" \
  -F "startMs=0" \
  -F "endMs=1000" 2>&1)

echo "$UPLOAD_RESPONSE"

# Clean up
rm -f /tmp/test_chunk.webm
