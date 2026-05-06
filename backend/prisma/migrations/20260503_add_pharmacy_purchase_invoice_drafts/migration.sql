-- Pharmacy purchase invoice OCR/manual draft storage.
-- This migration intentionally stores reviewed purchase bills without applying stock mutations.

CREATE TYPE "PharmacyPurchaseInvoiceStatus" AS ENUM (
  'DRAFT',
  'OCR_REVIEW_REQUIRED',
  'RECONCILIATION_FAILED',
  'REVIEWED',
  'STOCK_COMMITTED',
  'CANCELLED'
);

CREATE TYPE "PharmacyPurchaseBillType" AS ENUM (
  'CASH',
  'CREDIT'
);

CREATE TABLE "pharmacy_purchase_invoices" (
  "id" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "createdBy" TEXT,
  "supplierId" TEXT,
  "distributorName" TEXT NOT NULL,
  "distributorAddress" TEXT,
  "distributorGstin" TEXT NOT NULL,
  "distributorDlNo" TEXT NOT NULL,
  "distributorFoodLicense" TEXT,
  "invoiceNumber" TEXT NOT NULL,
  "invoiceDate" TIMESTAMP(3) NOT NULL,
  "goodsReceivedDate" TIMESTAMP(3),
  "billType" "PharmacyPurchaseBillType" NOT NULL,
  "dueDate" TIMESTAMP(3),
  "eWayBillNo" TEXT,
  "casesTransport" TEXT,
  "lrNo" TEXT,
  "salesmanName" TEXT,
  "salesmanContact" TEXT,
  "buyerCode" TEXT,
  "doctorNameOrRegNo" TEXT NOT NULL,
  "urcCode" TEXT,
  "handwrittenNotes" TEXT,
  "source" TEXT NOT NULL DEFAULT 'MANUAL',
  "status" "PharmacyPurchaseInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
  "grossAmount" DOUBLE PRECISION NOT NULL,
  "tradeDiscount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "specialDiscount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "cashDiscount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "damageAdjustment" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "visibilityAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "creditDebitAdjustment" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "taxableAmount" DOUBLE PRECISION NOT NULL,
  "totalCgst" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "totalSgst" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "totalIgst" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "totalGst" DOUBLE PRECISION NOT NULL,
  "tcsAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "rounding" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "netPayable" DOUBLE PRECISION NOT NULL,
  "unresolvedOcrFlags" INTEGER NOT NULL DEFAULT 0,
  "reconciliationIssues" TEXT,
  "stockCommittedAt" TIMESTAMP(3),
  "stockCommittedBy" TEXT,
  "stockCommitReference" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pharmacy_purchase_invoices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pharmacy_purchase_invoices_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "pharmacy_purchase_invoice_items" (
  "id" TEXT NOT NULL,
  "purchaseInvoiceId" TEXT NOT NULL,
  "lineNumber" INTEGER NOT NULL,
  "serialNumber" INTEGER,
  "productName" TEXT NOT NULL,
  "manufacturer" TEXT NOT NULL,
  "packSize" TEXT NOT NULL,
  "packUnitType" TEXT NOT NULL,
  "hsnCode" TEXT NOT NULL,
  "batchNumber" TEXT NOT NULL,
  "expiryMonth" INTEGER NOT NULL,
  "expiryYear" INTEGER NOT NULL,
  "quantityPurchased" DOUBLE PRECISION NOT NULL,
  "freeQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "mrp" DOUBLE PRECISION NOT NULL,
  "oldMrp" DOUBLE PRECISION,
  "discountPercent" DOUBLE PRECISION NOT NULL,
  "specialDiscountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "purchaseRate" DOUBLE PRECISION NOT NULL,
  "taxableAmount" DOUBLE PRECISION NOT NULL,
  "cgstPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "sgstPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "igstPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "gstAmount" DOUBLE PRECISION NOT NULL,
  "lineTotal" DOUBLE PRECISION NOT NULL,
  "ocrConfidence" DOUBLE PRECISION,
  "ocrFlags" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pharmacy_purchase_invoice_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pharmacy_purchase_invoice_items_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "pharmacy_purchase_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "pharmacy_purchase_invoices_branchId_distributorGstin_invoiceNumber_key"
  ON "pharmacy_purchase_invoices"("branchId", "distributorGstin", "invoiceNumber");

CREATE INDEX "pharmacy_purchase_invoices_branchId_idx" ON "pharmacy_purchase_invoices"("branchId");
CREATE INDEX "pharmacy_purchase_invoices_distributorGstin_idx" ON "pharmacy_purchase_invoices"("distributorGstin");
CREATE INDEX "pharmacy_purchase_invoices_invoiceDate_idx" ON "pharmacy_purchase_invoices"("invoiceDate");
CREATE INDEX "pharmacy_purchase_invoices_goodsReceivedDate_idx" ON "pharmacy_purchase_invoices"("goodsReceivedDate");
CREATE INDEX "pharmacy_purchase_invoices_status_idx" ON "pharmacy_purchase_invoices"("status");
CREATE INDEX "pharmacy_purchase_invoices_stockCommittedAt_idx" ON "pharmacy_purchase_invoices"("stockCommittedAt");

CREATE INDEX "pharmacy_purchase_invoice_items_purchaseInvoiceId_idx" ON "pharmacy_purchase_invoice_items"("purchaseInvoiceId");
CREATE INDEX "pharmacy_purchase_invoice_items_productName_idx" ON "pharmacy_purchase_invoice_items"("productName");
CREATE INDEX "pharmacy_purchase_invoice_items_batchNumber_idx" ON "pharmacy_purchase_invoice_items"("batchNumber");
CREATE INDEX "pharmacy_purchase_invoice_items_expiryYear_expiryMonth_idx" ON "pharmacy_purchase_invoice_items"("expiryYear", "expiryMonth");
CREATE INDEX "pharmacy_purchase_invoice_items_hsnCode_idx" ON "pharmacy_purchase_invoice_items"("hsnCode");
