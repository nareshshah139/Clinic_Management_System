BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TYPE "ConsultationType" AS ENUM ('IN_PERSON', 'TELE_VIDEO');

ALTER TABLE "visits"
  ADD COLUMN "consultationType" "ConsultationType" NOT NULL DEFAULT 'IN_PERSON',
  ADD COLUMN "teleVideoConsentById" TEXT,
  ADD COLUMN "teleVideoConsentAt" TIMESTAMP(3),
  ADD CONSTRAINT "visits_tele_video_requires_consent" CHECK (
    "consultationType" <> 'TELE_VIDEO' OR
    ("teleVideoConsentById" IS NOT NULL AND length("teleVideoConsentById") > 0 AND "teleVideoConsentAt" IS NOT NULL)
  );

COMMIT;
