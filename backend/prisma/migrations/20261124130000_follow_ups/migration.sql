-- CreateEnum
CREATE TYPE "AttentionPriority" AS ENUM ('URGENT', 'HIGH', 'NORMAL');

-- CreateEnum
CREATE TYPE "FollowUpTrackState" AS ENUM ('ACTIVE', 'COMPLETED', 'STOPPED');

-- CreateEnum
CREATE TYPE "CheckInState" AS ENUM ('SCHEDULED', 'OPEN', 'ANSWERED', 'MISSED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "OutboundMessagePurpose" ADD VALUE 'STAFF_REPLY';

-- AlterEnum

ALTER TYPE "AttentionKind" ADD VALUE 'RESPONSE_FLAG';
ALTER TYPE "AttentionKind" ADD VALUE 'MISSED_CHECK_IN';

-- AlterTable
ALTER TABLE "visits" ADD COLUMN     "followUpPlanVersionId" TEXT;

-- AlterTable
ALTER TABLE "attention_items" ADD COLUMN     "priority" "AttentionPriority" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "resolutionCode" TEXT,
ADD COLUMN     "resolutionNote" TEXT,
ADD COLUMN     "resolvedById" TEXT;

-- CreateTable
CREATE TABLE "instruments" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instruments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instrument_versions" (
    "id" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instrument_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follow_up_plans" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follow_up_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follow_up_plan_versions" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follow_up_plan_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follow_up_tracks" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "planVersionId" TEXT NOT NULL,
    "state" "FollowUpTrackState" NOT NULL DEFAULT 'ACTIVE',
    "anchorDate" TEXT NOT NULL,
    "stopReason" TEXT,
    "stoppedById" TEXT,
    "stoppedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "follow_up_tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "check_ins" (
    "id" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "stepKey" TEXT NOT NULL,
    "respondent" TEXT NOT NULL DEFAULT 'PATIENT',
    "reminderAfterDays" INTEGER[],
    "instrumentVersionId" TEXT NOT NULL,
    "state" "CheckInState" NOT NULL DEFAULT 'SCHEDULED',
    "onMissed" TEXT NOT NULL,
    "opensAt" TIMESTAMP(3) NOT NULL,
    "closesAt" TIMESTAMP(3) NOT NULL,
    "openedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "check_ins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "check_in_responses" (
    "id" TEXT NOT NULL,
    "checkInId" TEXT NOT NULL,
    "instrumentVersionId" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "score" INTEGER,
    "flag" "AttentionPriority",
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "check_in_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "response_attachments" (
    "id" TEXT NOT NULL,
    "responseId" TEXT,
    "patientMessageId" TEXT,
    "itemKey" TEXT,
    "mime" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "bytes" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "response_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_task_links" (
    "id" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_task_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_task_link_check_ins" (
    "linkId" TEXT NOT NULL,
    "checkInId" TEXT NOT NULL,

    CONSTRAINT "portal_task_link_check_ins_pkey" PRIMARY KEY ("linkId","checkInId")
);

-- CreateIndex
CREATE UNIQUE INDEX "instruments_key_key" ON "instruments"("key");

-- CreateIndex
CREATE UNIQUE INDEX "instrument_versions_instrumentId_version_key" ON "instrument_versions"("instrumentId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "instrument_versions_instrumentId_contentHash_key" ON "instrument_versions"("instrumentId", "contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "follow_up_plans_key_key" ON "follow_up_plans"("key");

-- CreateIndex
CREATE UNIQUE INDEX "follow_up_plan_versions_planId_version_key" ON "follow_up_plan_versions"("planId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "follow_up_plan_versions_planId_contentHash_key" ON "follow_up_plan_versions"("planId", "contentHash");

-- CreateIndex
CREATE INDEX "follow_up_tracks_visitId_idx" ON "follow_up_tracks"("visitId");

-- CreateIndex
CREATE INDEX "follow_up_tracks_patientId_state_idx" ON "follow_up_tracks"("patientId", "state");

-- CreateIndex
CREATE INDEX "check_ins_state_opensAt_idx" ON "check_ins"("state", "opensAt");

-- CreateIndex
CREATE INDEX "check_ins_state_closesAt_idx" ON "check_ins"("state", "closesAt");

-- CreateIndex
CREATE UNIQUE INDEX "check_ins_trackId_seq_key" ON "check_ins"("trackId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "check_in_responses_checkInId_key" ON "check_in_responses"("checkInId");

-- CreateIndex
CREATE INDEX "response_attachments_responseId_idx" ON "response_attachments"("responseId");

-- CreateIndex
CREATE INDEX "response_attachments_patientMessageId_idx" ON "response_attachments"("patientMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "portal_task_links_dedupeKey_key" ON "portal_task_links"("dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "portal_task_links_tokenHash_key" ON "portal_task_links"("tokenHash");

-- CreateIndex
CREATE INDEX "portal_task_links_patientId_idx" ON "portal_task_links"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "portal_task_link_check_ins_checkInId_key" ON "portal_task_link_check_ins"("checkInId");

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_followUpPlanVersionId_fkey" FOREIGN KEY ("followUpPlanVersionId") REFERENCES "follow_up_plan_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instrument_versions" ADD CONSTRAINT "instrument_versions_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "instruments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_plan_versions" ADD CONSTRAINT "follow_up_plan_versions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "follow_up_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_tracks" ADD CONSTRAINT "follow_up_tracks_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_tracks" ADD CONSTRAINT "follow_up_tracks_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_tracks" ADD CONSTRAINT "follow_up_tracks_planVersionId_fkey" FOREIGN KEY ("planVersionId") REFERENCES "follow_up_plan_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "follow_up_tracks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_instrumentVersionId_fkey" FOREIGN KEY ("instrumentVersionId") REFERENCES "instrument_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_in_responses" ADD CONSTRAINT "check_in_responses_checkInId_fkey" FOREIGN KEY ("checkInId") REFERENCES "check_ins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_in_responses" ADD CONSTRAINT "check_in_responses_instrumentVersionId_fkey" FOREIGN KEY ("instrumentVersionId") REFERENCES "instrument_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "response_attachments" ADD CONSTRAINT "response_attachments_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "check_in_responses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "response_attachments" ADD CONSTRAINT "response_attachments_patientMessageId_fkey" FOREIGN KEY ("patientMessageId") REFERENCES "patient_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_task_links" ADD CONSTRAINT "portal_task_links_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_task_link_check_ins" ADD CONSTRAINT "portal_task_link_check_ins_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "portal_task_links"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_task_link_check_ins" ADD CONSTRAINT "portal_task_link_check_ins_checkInId_fkey" FOREIGN KEY ("checkInId") REFERENCES "check_ins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- OneLiveTrackPerVisit: at most one track that is not STOPPED per visit.
CREATE UNIQUE INDEX "follow_up_tracks_one_live_per_visit" ON "follow_up_tracks"("visitId") WHERE "state" <> 'STOPPED';

-- An attachment belongs to exactly one response or one patient message.
ALTER TABLE "response_attachments" ADD CONSTRAINT "response_attachments_one_owner" CHECK (num_nonnulls("responseId", "patientMessageId") = 1);
