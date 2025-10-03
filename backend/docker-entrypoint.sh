#!/bin/sh
set -e

if [ -n "$DATABASE_URL" ]; then
  echo "Applying Prisma migrations..."
  npx prisma migrate deploy || true
  echo "Syncing Prisma schema (db push)..."
  npx prisma db push || true
  npx prisma generate || true
fi

exec "$@"
