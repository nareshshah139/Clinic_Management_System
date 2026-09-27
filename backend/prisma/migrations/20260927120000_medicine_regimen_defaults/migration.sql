-- Nullable columns preserve existing data and remain compatible with the previous app.
-- Abort rather than queue behind a long transaction while holding up clinic traffic.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '15s';
ALTER TABLE "inventory_items"
  ADD COLUMN "defaultDuration" INTEGER,
  ADD COLUMN "defaultDurationUnit" TEXT,
  ADD COLUMN "defaultFrequency" TEXT,
  ADD COLUMN "defaultTiming" TEXT,
  ADD COLUMN "defaultInstructions" TEXT;
COMMIT;
