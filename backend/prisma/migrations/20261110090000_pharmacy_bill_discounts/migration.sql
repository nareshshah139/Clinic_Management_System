-- CreateEnum
CREATE TYPE "PharmacyBillDiscountKind" AS ENUM ('PERCENT', 'AMOUNT');

-- AlterTable
ALTER TABLE "pharmacy_invoices" ADD COLUMN     "billDiscountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "billDiscountKind" "PharmacyBillDiscountKind",
ADD COLUMN     "billDiscountValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "revisedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "pharmacy_invoice_items" ADD COLUMN     "billDiscountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "pharmacy_invoice_revisions" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "revisedById" TEXT,
    "reason" TEXT NOT NULL,
    "previousTotal" DOUBLE PRECISION NOT NULL,
    "revisedTotal" DOUBLE PRECISION NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pharmacy_invoice_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pharmacy_invoice_revisions_invoiceId_createdAt_idx" ON "pharmacy_invoice_revisions"("invoiceId", "createdAt");

-- AddForeignKey
ALTER TABLE "pharmacy_invoice_revisions" ADD CONSTRAINT "pharmacy_invoice_revisions_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "pharmacy_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pharmacy_invoice_revisions" ADD CONSTRAINT "pharmacy_invoice_revisions_revisedById_fkey" FOREIGN KEY ("revisedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

