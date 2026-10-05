CREATE TYPE "VisitStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');
CREATE TYPE "PrescriptionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'EXPIRED');
CREATE TYPE "RefillStatus" AS ENUM ('NONE', 'PENDING', 'APPROVED', 'REJECTED', 'COMPLETED');
ALTER TABLE "visits"
  ADD COLUMN "status" "VisitStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  ADD COLUMN "completedAt" TIMESTAMP(3),
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "prescriptions"
  ADD COLUMN "status" "PrescriptionStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "validUntil" TIMESTAMP(3),
  ADD COLUMN "maxRefills" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancelledBy" TEXT,
  ADD COLUMN "cancellationReason" TEXT,
  ADD COLUMN "metadata" TEXT,
  ADD CONSTRAINT "prescriptions_maxRefills_check" CHECK ("maxRefills" BETWEEN 0 AND 5);
CREATE TABLE "prescription_refills" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "prescriptionId" TEXT NOT NULL REFERENCES "prescriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "status" "RefillStatus" NOT NULL DEFAULT 'PENDING',
  "reason" TEXT, "notes" TEXT,
  "requestedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedAt" TIMESTAMP(3), "approvedBy" TEXT,
  "rejectedAt" TIMESTAMP(3), "rejectedBy" TEXT, "rejectionReason" TEXT,
  "metadata" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "prescription_refills_prescriptionId_status_idx" ON "prescription_refills"("prescriptionId", "status");
CREATE INDEX "prescription_refills_createdAt_idx" ON "prescription_refills"("createdAt");

-- Invalid legacy free text is not evidence of deletion.
CREATE FUNCTION pg_temp.visit_legacy_json(value TEXT) RETURNS JSONB LANGUAGE plpgsql AS $$
BEGIN RETURN value::jsonb;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END $$;
CREATE FUNCTION pg_temp.visit_legacy_time(value TEXT, fallback TIMESTAMP) RETURNS TIMESTAMP LANGUAGE plpgsql AS $$
BEGIN RETURN COALESCE(value::timestamptz AT TIME ZONE 'UTC', fallback);
EXCEPTION WHEN OTHERS THEN RETURN fallback;
END $$;
UPDATE "visits" SET "deletedAt" = pg_temp.visit_legacy_time(pg_temp.visit_legacy_json("plan")->>'deletedAt', "updatedAt")
WHERE pg_temp.visit_legacy_json("plan")->'deleted' = 'true'::jsonb;
-- Only a linked completed appointment provides reliable legacy completion evidence.
UPDATE "visits" v SET "status" = 'COMPLETED', "completedAt" = a."updatedAt"
FROM "appointments" a WHERE v."appointmentId" = a.id AND a.status = 'COMPLETED';
