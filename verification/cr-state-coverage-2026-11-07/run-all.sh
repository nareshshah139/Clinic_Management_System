#!/usr/bin/env bash
# Re-runs every CR state model against the current checkout, one fresh database per feature area.
# Needs: Postgres on PGHOST:PGPORT with a TEMPLATE_DB built by `prisma migrate deploy`, `prisma db push`,
# backend/scripts/seed.ts and backend/scripts/seed_rbac.ts; a built backend (backend/dist); and a Next dev
# server on FE_PORT whose NEXT_PUBLIC_API_PROXY points at http://localhost:API_PORT.
set -euo pipefail
: "${JWT_SECRET:?export the backend environment (JWT_SECRET and friends) before running}"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HERE="$ROOT/verification/cr-state-coverage-2026-11-07"
PGHOST="${PGHOST:-127.0.0.1}" PGPORT="${PGPORT:-5433}" PGUSER="${PGUSER:-postgres}"
TEMPLATE_DB="${TEMPLATE_DB:-clinic_verify}"
API_PORT="${API_PORT:-4310}" FE_PORT="${FE_PORT:-3310}"
SHOT_ROOT="${SHOT_ROOT:-$ROOT/output/diagnostics/cr-state-coverage/screenshots}"
LOG_DIR="${LOG_DIR:-$ROOT/output/diagnostics/cr-state-coverage/logs}"
mkdir -p "$SHOT_ROOT" "$LOG_DIR"
export PGHOST PGPORT PGUSER

psql_admin() { psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -q -v ON_ERROR_STOP=1 "$@"; }

api_pid=""
stop_api() { if [ -n "$api_pid" ]; then kill "$api_pid" 2>/dev/null || true; wait "$api_pid" 2>/dev/null || true; api_pid=""; fi; }
trap stop_api EXIT

run_family() {
  local family="$1"; shift
  local db="cov_${family}"
  psql_admin -c "DROP DATABASE IF EXISTS $db" -c "CREATE DATABASE $db TEMPLATE $TEMPLATE_DB"
  rm -f /tmp/tot-verify-tokens.json "${TMPDIR:-/tmp}/cr30-itemreq-tokens.json" "$LOG_DIR/$family-tokens.json"
  local url="postgresql://$PGUSER@$PGHOST:$PGPORT/$db"
  (cd "$ROOT/backend" && DATABASE_URL="$url" PORT="$API_PORT" exec node dist/main) > "$LOG_DIR/$family-api.log" 2>&1 &
  api_pid=$!
  for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$API_PORT" && break; sleep 1; done
  (cd "$HERE" && BASE_URL="http://localhost:$FE_PORT" API_URL="http://localhost:$API_PORT" \
    SHOT_DIR="$SHOT_ROOT" VERIFY_DB="$url" VERIFY_DB_URL="$url" DATABASE_NAME="$db" DB_URL="$url" \
    VERIFY_TOKEN_CACHE="$LOG_DIR/$family-tokens.json" \
    node harness/run.cjs "$@") | tee "$LOG_DIR/$family-harness.log" || status=1
  stop_api
  sleep "${LOGIN_COOLDOWN:-65}"
}

status=0
run_family visits models/cr21-visit-identity.cjs models/cr22-on-examination.cjs
run_family tot models/cr28-tot-entry.cjs models/cr28-tot-roles.cjs models/cr28-tot-invoice.cjs
run_family itemreq models/cr30-item-request-lifecycle.cjs
run_family reports models/cr33c-day-wise-summary.cjs models/cr33d-item-margin.cjs
exit "$status"
