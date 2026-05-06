-- Distributor purchase payment lifecycle and allocation ledger.

CREATE TYPE "PharmacyPurchasePaymentMode" AS ENUM (
  'CASH',
  'CHEQUE',
  'NEFT',
  'UPI',
  'CARD'
);

CREATE TABLE "pharmacy_purchase_payments" (
  "id" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "distributorGstin" TEXT NOT NULL,
  "distributorName" TEXT NOT NULL,
  "paymentDate" TIMESTAMP(3) NOT NULL,
  "mode" "PharmacyPurchasePaymentMode" NOT NULL,
  "paidBy" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "referenceNo" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pharmacy_purchase_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pharmacy_purchase_payments_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "pharmacy_purchase_payment_allocations" (
  "id" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "purchaseInvoiceId" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pharmacy_purchase_payment_allocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pharmacy_purchase_payment_allocations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "pharmacy_purchase_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "pharmacy_purchase_payment_allocations_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "pharmacy_purchase_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "pharmacy_purchase_payments_branchId_idx" ON "pharmacy_purchase_payments"("branchId");
CREATE INDEX "pharmacy_purchase_payments_distributorGstin_idx" ON "pharmacy_purchase_payments"("distributorGstin");
CREATE INDEX "pharmacy_purchase_payments_paymentDate_idx" ON "pharmacy_purchase_payments"("paymentDate");
CREATE INDEX "pharmacy_purchase_payments_branchId_distributorGstin_paymentDate_idx"
  ON "pharmacy_purchase_payments"("branchId", "distributorGstin", "paymentDate");

CREATE UNIQUE INDEX "pharmacy_purchase_payment_allocations_paymentId_purchaseInvoiceId_key"
  ON "pharmacy_purchase_payment_allocations"("paymentId", "purchaseInvoiceId");
CREATE INDEX "pharmacy_purchase_payment_allocations_paymentId_idx"
  ON "pharmacy_purchase_payment_allocations"("paymentId");
CREATE INDEX "pharmacy_purchase_payment_allocations_purchaseInvoiceId_idx"
  ON "pharmacy_purchase_payment_allocations"("purchaseInvoiceId");
