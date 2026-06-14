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

echo "Starting application..."
exec node dist/main.js

