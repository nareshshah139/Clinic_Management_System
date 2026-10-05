ALTER TABLE "pharmacy_invoices" ADD COLUMN "checkoutRequestKey" TEXT, ADD COLUMN "checkoutPayloadHash" TEXT;
CREATE UNIQUE INDEX "pharmacy_invoices_branchId_checkoutRequestKey_key" ON "pharmacy_invoices"("branchId", "checkoutRequestKey");
ALTER TABLE "pharmacy_payments" ADD COLUMN "requestKey" TEXT, ADD COLUMN "payloadHash" TEXT;
CREATE UNIQUE INDEX "pharmacy_payments_invoiceId_requestKey_key" ON "pharmacy_payments"("invoiceId", "requestKey");
