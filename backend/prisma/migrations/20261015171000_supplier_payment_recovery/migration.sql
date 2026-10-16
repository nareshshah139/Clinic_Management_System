ALTER TABLE "pharmacy_purchase_payments"
  ADD COLUMN "requestFingerprint" TEXT,
  ADD COLUMN "reversedAt" TIMESTAMP(3),
  ADD COLUMN "reversedBy" TEXT,
  ADD COLUMN "reversalReason" TEXT,
  ADD COLUMN "correctionRequestKey" TEXT,
  ADD COLUMN "correctionFingerprint" TEXT,
  ADD COLUMN "replacesPaymentId" TEXT;
CREATE UNIQUE INDEX "pharmacy_purchase_payments_branchId_correctionRequestKey_key"
  ON "pharmacy_purchase_payments"("branchId", "correctionRequestKey");
CREATE UNIQUE INDEX "pharmacy_purchase_payments_replacesPaymentId_key"
  ON "pharmacy_purchase_payments"("replacesPaymentId");
ALTER TABLE "pharmacy_purchase_payments" ADD CONSTRAINT "pharmacy_purchase_payments_replacesPaymentId_fkey"
  FOREIGN KEY ("replacesPaymentId") REFERENCES "pharmacy_purchase_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
