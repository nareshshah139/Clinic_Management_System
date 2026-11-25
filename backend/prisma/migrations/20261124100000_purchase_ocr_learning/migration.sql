-- AlterTable
ALTER TABLE "pharmacy_purchase_invoice_documents" ADD COLUMN     "ocrRead" JSONB;

-- AlterTable
ALTER TABLE "pharmacy_purchase_invoice_items" ADD COLUMN     "ocrLineKey" TEXT;

-- CreateTable
CREATE TABLE "pharmacy_purchase_learning_examples" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "supplierGstin" TEXT NOT NULL,
    "rawKey" TEXT NOT NULL,
    "rawValue" TEXT,
    "finalValue" TEXT,
    "drugId" TEXT,
    "provenance" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "appliedLessonKey" TEXT,
    "identitySnapshot" JSONB,
    "decidedBy" TEXT NOT NULL,
    "promptVersion" TEXT,
    "committedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pharmacy_purchase_learning_examples_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pharmacy_purchase_learning_examples_branchId_field_supplier_idx" ON "pharmacy_purchase_learning_examples"("branchId", "field", "supplierGstin", "rawKey");

-- CreateIndex
CREATE INDEX "pharmacy_purchase_learning_examples_branchId_field_rawKey_idx" ON "pharmacy_purchase_learning_examples"("branchId", "field", "rawKey");

-- CreateIndex
CREATE INDEX "pharmacy_purchase_learning_examples_branchId_committedAt_idx" ON "pharmacy_purchase_learning_examples"("branchId", "committedAt");

-- CreateIndex
CREATE UNIQUE INDEX "pharmacy_purchase_learning_examples_invoiceId_slot_field_key" ON "pharmacy_purchase_learning_examples"("invoiceId", "slot", "field");

-- AddForeignKey
ALTER TABLE "pharmacy_purchase_learning_examples" ADD CONSTRAINT "pharmacy_purchase_learning_examples_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pharmacy_purchase_learning_examples" ADD CONSTRAINT "pharmacy_purchase_learning_examples_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "pharmacy_purchase_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

