#!/bin/sh
set -e

if [ -n "$DATABASE_URL" ]; then
  echo "Applying Prisma migrations..."
  npx prisma migrate deploy || true
  npx prisma generate || true
fi

exec "$@"
