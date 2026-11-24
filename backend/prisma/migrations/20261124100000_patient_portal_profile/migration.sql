-- CreateEnum
CREATE TYPE "WhatsAppConsentState" AS ENUM ('NOT_ASKED', 'PENDING', 'OPTED_IN', 'OPTED_OUT');

-- CreateTable
CREATE TABLE "patient_portal_profiles" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "phoneE164" TEXT,
    "phoneConfirmedAt" TIMESTAMP(3),
    "consentState" "WhatsAppConsentState" NOT NULL DEFAULT 'NOT_ASKED',
    "consentRecordedById" TEXT,
    "consentRecordedAt" TIMESTAMP(3),
    "consentMethod" TEXT,
    "preferredLanguage" "Language" NOT NULL DEFAULT 'EN',
    "portalEnabled" BOOLEAN NOT NULL DEFAULT true,
    "mergeHoldReason" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "patient_portal_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "patient_portal_profiles_patientId_key" ON "patient_portal_profiles"("patientId");
CREATE INDEX "patient_portal_profiles_phoneE164_idx" ON "patient_portal_profiles"("phoneE164");

ALTER TABLE "patient_portal_profiles" ADD CONSTRAINT "patient_portal_profiles_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "actorKind" TEXT;

-- Backfill: one profile per existing patient, E.164 derived by the same rules as toE164().
INSERT INTO "patient_portal_profiles" ("id", "patientId", "phoneE164", "updatedAt")
SELECT 'ppp_' || md5(p."id"), p."id",
  CASE
    WHEN left(btrim(p."phone"), 1) <> '+' AND d ~ '^[6-9][0-9]{9}$' THEN '+91' || d
    WHEN left(btrim(p."phone"), 1) <> '+' AND d ~ '^0[6-9][0-9]{9}$' THEN '+91' || substr(d, 2)
    WHEN d ~ '^91[6-9][0-9]{9}$' THEN '+' || d
    WHEN d LIKE '91%' THEN NULL
    WHEN left(btrim(p."phone"), 1) = '+' AND d ~ '^[1-9][0-9]{7,14}$' THEN '+' || d
    ELSE NULL
  END,
  CURRENT_TIMESTAMP
FROM (SELECT "id", "phone", regexp_replace(coalesce("phone", ''), '[^0-9]', '', 'g') AS d FROM "patients") p
ON CONFLICT ("patientId") DO NOTHING;
