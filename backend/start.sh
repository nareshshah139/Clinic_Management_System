#!/bin/sh
set -e

if [ -n "$DATABASE_URL" ]; then
  echo "Applying Prisma migrations..."
  npx prisma migrate deploy
else
  echo "DATABASE_URL is not set; skipping Prisma migrations."
fi

if [ "$RUN_SEED_ON_STARTUP" = "true" ]; then
  echo "Running seed-once because RUN_SEED_ON_STARTUP=true..."
  node dist/scripts/seed-once.js
else
  echo "Skipping seed-once. Set RUN_SEED_ON_STARTUP=true to enable startup seeding."
fi

CODEX_BIN="${PHARMACY_AGENT_CODEX_PATH:-codex}"
if command -v "$CODEX_BIN" >/dev/null 2>&1; then
  export CODEX_HOME="${CODEX_HOME:-/tmp/codex-home}"
  mkdir -p "$CODEX_HOME"

  if [ -n "$OPENAI_API_KEY" ]; then
    echo "Configuring Codex CLI auth from OPENAI_API_KEY..."
    if printf '%s' "$OPENAI_API_KEY" | "$CODEX_BIN" login --with-api-key >/dev/null 2>&1; then
      echo "Codex CLI authenticated."
    else
      echo "Warning: Codex CLI auth failed; Pharmacy Agent will report offline."
    fi
  else
    echo "OPENAI_API_KEY is not set; Pharmacy Agent Codex CLI will report offline."
  fi
else
  echo "Codex CLI not found at '$CODEX_BIN'; Pharmacy Agent will report offline."
fi

echo "Starting application..."
exec node dist/main.js
