CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');
CREATE TYPE "MessageAssignment" AS ENUM ('EXACT', 'SUGGESTED', 'CONFIRMED', 'UNASSIGNED');

CREATE TABLE "inbound_whatsapp_events" (
    "id" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "appliedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "inbound_whatsapp_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "inbound_whatsapp_events_providerEventId_key" ON "inbound_whatsapp_events"("providerEventId");
CREATE INDEX "inbound_whatsapp_events_kind_appliedAt_idx" ON "inbound_whatsapp_events"("kind", "appliedAt");

CREATE TABLE "patient_messages" (
    "id" TEXT NOT NULL,
    "patientId" TEXT,
    "phoneE164" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'WHATSAPP',
    "kind" TEXT NOT NULL,
    "body" TEXT,
    "mediaId" TEXT,
    "mediaMime" TEXT,
    "providerMessageId" TEXT,
    "replyToOutboundId" TEXT,
    "assignment" "MessageAssignment" NOT NULL,
    "assignedById" TEXT,
    "authorKind" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "patient_messages_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "patient_messages_providerMessageId_key" ON "patient_messages"("providerMessageId");
CREATE INDEX "patient_messages_patientId_createdAt_idx" ON "patient_messages"("patientId", "createdAt");
CREATE INDEX "patient_messages_phoneE164_createdAt_idx" ON "patient_messages"("phoneE164", "createdAt");
ALTER TABLE "patient_messages" ADD CONSTRAINT "patient_messages_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
