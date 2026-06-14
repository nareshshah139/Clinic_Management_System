-- Safe, additive migration for photo positions
-- Creates enum and adds columns with defaults; no drops

DO $$ BEGIN
  CREATE TYPE "PhotoPosition" AS ENUM ('FRONT','LEFT_PROFILE','RIGHT_PROFILE','BACK','CLOSE_UP','OTHER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Ensure visit_attachments exists (fresh deploys or db push scenarios)
CREATE TABLE IF NOT EXISTS "visit_attachments" (
  "id" TEXT PRIMARY KEY,
  "visitId" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "data" BYTEA NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "position" "PhotoPosition" NOT NULL DEFAULT 'OTHER',
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "visit_attachments_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "visit_attachments_visitId_idx" ON "visit_attachments"("visitId");

ALTER TABLE "visit_attachments"
  ADD COLUMN IF NOT EXISTS "position" "PhotoPosition" NOT NULL DEFAULT 'OTHER',
  ADD COLUMN IF NOT EXISTS "displayOrder" INTEGER NOT NULL DEFAULT 0;

-- draft_attachments
CREATE TABLE IF NOT EXISTS "draft_attachments" (
  "id" TEXT PRIMARY KEY,
  "patientId" TEXT NOT NULL,
  "dateStr" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "data" BYTEA NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "position" "PhotoPosition" NOT NULL DEFAULT 'OTHER',
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "draft_attachments_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "draft_attachments_patientId_dateStr_idx" ON "draft_attachments"("patientId","dateStr");

ALTER TABLE "draft_attachments"
  ADD COLUMN IF NOT EXISTS "position" "PhotoPosition" NOT NULL DEFAULT 'OTHER',
  ADD COLUMN IF NOT EXISTS "displayOrder" INTEGER NOT NULL DEFAULT 0;


