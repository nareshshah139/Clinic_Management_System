-- CreateEnum
CREATE TYPE "WhatsAppMessageKind" AS ENUM ('PRESCRIPTION', 'TEST_PRESCRIPTION', 'APPOINTMENT', 'TEXT');

-- CreateEnum
CREATE TYPE "WhatsAppMessageStatus" AS ENUM ('ACCEPTED', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- CreateTable
CREATE TABLE "whatsapp_connections" (
    "branchId" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "businessAccountId" TEXT,
    "displayPhoneNumber" TEXT NOT NULL,
    "verifiedName" TEXT NOT NULL,
    "qualityRating" TEXT,
    "accessTokenCipher" TEXT NOT NULL,
    "prescriptionTemplateName" TEXT,
    "prescriptionTemplateLanguage" TEXT,
    "prescriptionTemplateBodyParams" INTEGER NOT NULL DEFAULT 0,
    "linkedById" TEXT,
    "verifiedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_connections_pkey" PRIMARY KEY ("branchId")
);

-- CreateTable
CREATE TABLE "whatsapp_messages" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "wamid" TEXT NOT NULL,
    "toPhone" TEXT NOT NULL,
    "kind" "WhatsAppMessageKind" NOT NULL,
    "prescriptionId" TEXT,
    "status" "WhatsAppMessageStatus" NOT NULL DEFAULT 'ACCEPTED',
    "errorCode" INTEGER,
    "errorTitle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_messages_wamid_key" ON "whatsapp_messages"("wamid");

-- CreateIndex
CREATE INDEX "whatsapp_messages_branchId_createdAt_idx" ON "whatsapp_messages"("branchId", "createdAt");

-- AddForeignKey
ALTER TABLE "whatsapp_connections" ADD CONSTRAINT "whatsapp_connections_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_connections" ADD CONSTRAINT "whatsapp_connections_linkedById_fkey" FOREIGN KEY ("linkedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

