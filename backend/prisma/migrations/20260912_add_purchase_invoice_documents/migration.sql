-- Keep original invoice uploads in PostgreSQL, independently of OCR success.
-- Existing invoices and stock are unchanged.
CREATE TABLE "pharmacy_purchase_invoice_documents" (
  "id" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "purchaseInvoiceId" TEXT,
  "uploadedBy" TEXT,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "data" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pharmacy_purchase_invoice_documents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "purchase_invoice_documents_branch_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "purchase_invoice_documents_invoice_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "pharmacy_purchase_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "pharmacy_purchase_invoice_documents_branchId_sha256_key" ON "pharmacy_purchase_invoice_documents"("branchId", "sha256");
CREATE INDEX "pharmacy_purchase_invoice_documents_purchaseInvoiceId_idx" ON "pharmacy_purchase_invoice_documents"("purchaseInvoiceId");
CREATE INDEX "pharmacy_purchase_invoice_documents_branchId_createdAt_idx" ON "pharmacy_purchase_invoice_documents"("branchId", "createdAt");
