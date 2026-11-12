#!/bin/sh
# Starts the built backend exactly as Railway does (start.sh: migrate deploy, then dist/main.js)
# and fails unless /health answers 200 before the deadline.
set -u
PORT="${PORT:-4999}"
LOG="${BOOT_CHECK_LOG:-/tmp/boot-check.log}"
PORT="$PORT" sh start.sh > "$LOG" 2>&1 &
pid=$!
for _ in $(seq 1 60); do
  if curl -fs -o /dev/null "http://127.0.0.1:$PORT/health"; then
    echo "Backend answered /health on port $PORT."
    kill "$pid" 2>/dev/null
    exit 0
  fi
  if ! kill -0 "$pid" 2>/dev/null; then
    echo "Backend exited before answering /health:"
    tail -40 "$LOG"
    exit 1
  fi
  sleep 2
done
echo "Backend did not answer /health within 120s:"
tail -40 "$LOG"
kill "$pid" 2>/dev/null
exit 1
