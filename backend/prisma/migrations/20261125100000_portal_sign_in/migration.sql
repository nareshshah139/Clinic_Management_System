-- CreateEnum
CREATE TYPE "PortalAccessKind" AS ENUM ('SIGN_IN', 'PROFILE_CHOICE', 'RECORD_VIEW', 'SIGN_OUT', 'SIGN_OUT_EVERYWHERE');

-- AlterEnum
ALTER TYPE "OutboundMessagePurpose" ADD VALUE 'PORTAL_SIGN_IN_CODE';

-- AlterEnum
ALTER TYPE "PortalOtpPurpose" ADD VALUE 'SIGN_IN';

-- CreateTable
CREATE TABLE "portal_identities" (
    "id" TEXT NOT NULL,
    "phoneE164" TEXT NOT NULL,
    "lastSignInAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_sessions" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "identityId" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "patientId" TEXT,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idleExpiresAt" TIMESTAMP(3) NOT NULL,
    "absoluteExpiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_access_events" (
    "id" TEXT NOT NULL,
    "identityId" TEXT NOT NULL,
    "sessionId" TEXT,
    "patientId" TEXT,
    "kind" "PortalAccessKind" NOT NULL,
    "view" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_access_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "portal_identities_phoneE164_key" ON "portal_identities"("phoneE164");

-- CreateIndex
CREATE UNIQUE INDEX "portal_sessions_tokenHash_key" ON "portal_sessions"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "portal_sessions_challengeId_key" ON "portal_sessions"("challengeId");

-- CreateIndex
CREATE INDEX "portal_sessions_identityId_idx" ON "portal_sessions"("identityId");

-- CreateIndex
CREATE INDEX "portal_sessions_patientId_idx" ON "portal_sessions"("patientId");

-- CreateIndex
CREATE INDEX "portal_access_events_identityId_createdAt_idx" ON "portal_access_events"("identityId", "createdAt");

-- CreateIndex
CREATE INDEX "portal_access_events_patientId_createdAt_idx" ON "portal_access_events"("patientId", "createdAt");

-- AddForeignKey
ALTER TABLE "portal_sessions" ADD CONSTRAINT "portal_sessions_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "portal_identities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_sessions" ADD CONSTRAINT "portal_sessions_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_access_events" ADD CONSTRAINT "portal_access_events_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "portal_identities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_access_events" ADD CONSTRAINT "portal_access_events_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

