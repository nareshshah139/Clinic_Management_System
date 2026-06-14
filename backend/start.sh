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

  if [ -n "$CODEX_AUTH_JSON_B64" ]; then
    echo "Configuring Codex CLI auth from ChatGPT OAuth cache..."
    if node <<'NODE' >/dev/null 2>&1
const fs = require('fs');
const path = require('path');

const codexHome = process.env.CODEX_HOME;
const encoded = process.env.CODEX_AUTH_JSON_B64 || '';
const decoded = Buffer.from(encoded, 'base64').toString('utf8');
JSON.parse(decoded);
fs.mkdirSync(codexHome, { recursive: true });
fs.writeFileSync(path.join(codexHome, 'auth.json'), decoded, { mode: 0o600 });
NODE
    then
      if "$CODEX_BIN" login status >/dev/null 2>&1; then
        echo "Codex CLI authenticated with ChatGPT OAuth cache."
      else
        echo "Warning: Codex CLI OAuth cache was written but login status failed; Pharmacy Agent will report offline."
      fi
    else
      echo "Warning: CODEX_AUTH_JSON_B64 is invalid; Pharmacy Agent will report offline."
    fi
  elif [ -n "$CODEX_ACCESS_TOKEN" ]; then
    echo "Configuring Codex CLI auth from CODEX_ACCESS_TOKEN..."
    if printf '%s' "$CODEX_ACCESS_TOKEN" | "$CODEX_BIN" login --with-access-token >/dev/null 2>&1; then
      echo "Codex CLI authenticated with ChatGPT access token."
    else
      echo "Warning: Codex CLI ChatGPT auth failed; Pharmacy Agent will report offline."
    fi
  else
    CODEX_LOGIN_STATUS="$("$CODEX_BIN" login status 2>&1 || true)"
    if printf '%s' "$CODEX_LOGIN_STATUS" | grep -qi 'logged in' &&
      ! printf '%s' "$CODEX_LOGIN_STATUS" | grep -qi 'api key'; then
      echo "Codex CLI already authenticated with ChatGPT auth."
    else
      echo "CODEX_ACCESS_TOKEN is not set; Pharmacy Agent Codex CLI will report offline."
      echo "Provide a ChatGPT/Codex access token instead of OPENAI_API_KEY for Pharmacy Agent auth."
    fi
  fi

  unset CODEX_ACCESS_TOKEN
  unset CODEX_AUTH_JSON_B64
else
  echo "Codex CLI not found at '$CODEX_BIN'; Pharmacy Agent will report offline."
fi

echo "Starting application..."
exec node dist/main.js
