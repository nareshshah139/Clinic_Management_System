#!/bin/sh
set -e

echo "Applying Prisma schema (db push)..."
npx prisma db push

echo "Running seed-once (idempotent)..."
node dist/scripts/seed-once.js || echo "Seed step skipped/failed (non-fatal)"

echo "Starting application..."
exec node dist/main.js


