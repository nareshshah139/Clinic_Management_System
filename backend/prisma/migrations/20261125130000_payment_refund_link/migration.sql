-- AlterTable
ALTER TABLE "new_payments" ADD COLUMN     "refundOfId" TEXT;

-- CreateIndex
CREATE INDEX "new_payments_refundOfId_idx" ON "new_payments"("refundOfId");

-- AddForeignKey
ALTER TABLE "new_payments" ADD CONSTRAINT "new_payments_refundOfId_fkey" FOREIGN KEY ("refundOfId") REFERENCES "new_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

