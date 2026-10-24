CREATE TABLE "pharmacy_purchase_import_attempts" (
  "id" UUID PRIMARY KEY,
  "branchId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "requestHash" TEXT,
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "purchaseInvoiceId" TEXT,
  "result" JSONB,
  "message" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "purchase_import_outcome" CHECK (
    ("status" IN ('RUNNING', 'NO_STOCK_WRITTEN') AND "purchaseInvoiceId" IS NULL)
    OR ("status" = 'INVOICE_SAVED' AND "purchaseInvoiceId" IS NOT NULL)
  )
);
CREATE INDEX "pharmacy_purchase_import_attempts_branchId_userId_createdAt_idx"
 ON "pharmacy_purchase_import_attempts"("branchId", "userId", "createdAt");
