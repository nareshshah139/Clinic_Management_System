-- Add patientCode to patients for shortcode rollout
-- Nullable for backfill; unique constraint allows multiple NULLs

ALTER TABLE "patients"
  ADD COLUMN IF NOT EXISTS "patientCode" VARCHAR(5);

-- Unique index (allows multiple NULL values)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'patients_patientCode_key'
  ) THEN
    CREATE UNIQUE INDEX "patients_patientCode_key" ON "patients"("patientCode");
  END IF;
END$$;

