#!/usr/bin/env bash
set -euo pipefail
URL="postgresql://postgres:postgres@127.0.0.1:5432/clinic_stack"
if PGPASSWORD=postgres psql -h 127.0.0.1 -U postgres -d clinic_stack -Atc 'select 1' >/dev/null 2>&1; then
  echo "OK $URL"; exit 0
fi
service postgresql start >/dev/null
for _ in $(seq 1 30); do su postgres -c "psql -Atc 'select 1'" >/dev/null 2>&1 && break; sleep 1; done
su postgres -c "psql -qc \"ALTER USER postgres PASSWORD 'postgres';\""
su postgres -c "psql -Atc \"SELECT 1 FROM pg_database WHERE datname='clinic_stack'\"" | grep -q 1 || su postgres -c "psql -qc 'CREATE DATABASE clinic_stack;'"
PGPASSWORD=postgres psql -h 127.0.0.1 -U postgres -d clinic_stack -Atc 'select 1' >/dev/null
echo "OK $URL"
