-- AlterEnum
ALTER TYPE "OutboundMessagePurpose" ADD VALUE 'PORTAL_REPLY_NOTICE';

-- AlterTable
ALTER TABLE "patient_messages" ADD COLUMN     "clientKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "patient_messages_clientKey_key" ON "patient_messages"("clientKey");

