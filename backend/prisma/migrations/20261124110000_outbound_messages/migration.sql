CREATE TYPE "OutboundMessageState" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'SUPPRESSED', 'EXPIRED');
CREATE TYPE "OutboundMessagePurpose" AS ENUM ('NUMBER_CONFIRMATION', 'APPOINTMENT_CONFIRMATION', 'REVIEW_REMINDER', 'CHECK_IN_OPENED', 'CHECK_IN_REMINDER', 'ACKNOWLEDGEMENT', 'OPT_OUT_CONFIRMATION');
CREATE TYPE "PortalOtpPurpose" AS ENUM ('CONFIRM_NUMBER');
CREATE TYPE "AttentionKind" AS ENUM ('PATIENT_MESSAGE', 'DELIVERY_FAILURE');
CREATE TYPE "AttentionState" AS ENUM ('OPEN', 'CLAIMED', 'RESOLVED');

CREATE TABLE "outbound_messages" (
    "id" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "purpose" "OutboundMessagePurpose" NOT NULL,
    "state" "OutboundMessageState" NOT NULL DEFAULT 'QUEUED',
    "patientId" TEXT,
    "toE164" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "params" JSONB,
    "subjectType" TEXT,
    "subjectId" TEXT,
    "notBefore" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "providerMessageId" TEXT,
    "outcome" TEXT,
    "sentAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "outbound_messages_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "outbound_messages_dedupeKey_key" ON "outbound_messages"("dedupeKey");
CREATE UNIQUE INDEX "outbound_messages_providerMessageId_key" ON "outbound_messages"("providerMessageId");
CREATE INDEX "outbound_messages_state_notBefore_idx" ON "outbound_messages"("state", "notBefore");
CREATE INDEX "outbound_messages_patientId_sentAt_idx" ON "outbound_messages"("patientId", "sentAt");
CREATE INDEX "outbound_messages_toE164_purpose_createdAt_idx" ON "outbound_messages"("toE164", "purpose", "createdAt");
ALTER TABLE "outbound_messages" ADD CONSTRAINT "outbound_messages_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "portal_otp_challenges" (
    "id" TEXT NOT NULL,
    "purpose" "PortalOtpPurpose" NOT NULL,
    "phoneE164" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "portal_otp_challenges_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "portal_otp_challenges_phoneE164_purpose_createdAt_idx" ON "portal_otp_challenges"("phoneE164", "purpose", "createdAt");

CREATE TABLE "attention_items" (
    "id" TEXT NOT NULL,
    "kind" "AttentionKind" NOT NULL,
    "state" "AttentionState" NOT NULL DEFAULT 'OPEN',
    "subjectKey" TEXT NOT NULL,
    "patientId" TEXT,
    "phoneE164" TEXT,
    "branchId" TEXT,
    "reason" TEXT,
    "claimedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "lastEventAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "attention_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "attention_items_state_lastEventAt_idx" ON "attention_items"("state", "lastEventAt");
CREATE INDEX "attention_items_kind_subjectKey_idx" ON "attention_items"("kind", "subjectKey");
-- One open (OPEN or CLAIMED) item per kind and subject.
CREATE UNIQUE INDEX "attention_items_one_open_per_subject" ON "attention_items"("kind", "subjectKey") WHERE "state" <> 'RESOLVED';
ALTER TABLE "attention_items" ADD CONSTRAINT "attention_items_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
