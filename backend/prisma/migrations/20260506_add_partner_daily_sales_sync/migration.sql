-- Partner pharmacy daily sales sync storage.
-- Stock mutations are applied only through the commit endpoint.

CREATE TYPE "PartnerDailySaleSource" AS ENUM (
  'MANUAL',
  'CSV'
);

CREATE TYPE "PartnerDailySaleStatus" AS ENUM (
  'SUBMITTED',
  'STOCK_COMMITTED',
  'PARTIAL_STOCK_COMMITTED',
  'RECONCILIATION_REQUIRED',
  'CANCELLED'
);

CREATE TYPE "PartnerDailySaleDiscrepancyFlag" AS ENUM (
  'MISSING_ENTRY',
  'LATE_ENTRY',
  'UNMATCHED_BATCH',
  'INSUFFICIENT_STOCK',
  'PRICE_VARIANCE'
);

CREATE TABLE "partner_organizations" (
  "id" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "externalCode" TEXT,
  "contactName" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "partnerUserId" TEXT,
  "cutoffHour" INTEGER NOT NULL DEFAULT 22,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "metadata" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "partner_organizations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "partner_organizations_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "partner_daily_sales" (
  "id" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "partnerOrganizationId" TEXT NOT NULL,
  "partnerOrganizationName" TEXT NOT NULL,
  "partnerUserId" TEXT,
  "partnerUserName" TEXT,
  "date" TIMESTAMP(3) NOT NULL,
  "submittedById" TEXT,
  "source" "PartnerDailySaleSource" NOT NULL DEFAULT 'MANUAL',
  "status" "PartnerDailySaleStatus" NOT NULL DEFAULT 'SUBMITTED',
  "missingEntry" BOOLEAN NOT NULL DEFAULT false,
  "lateEntry" BOOLEAN NOT NULL DEFAULT false,
  "hasDiscrepancy" BOOLEAN NOT NULL DEFAULT false,
  "discrepancyFlags" TEXT,
  "stockCommittedAt" TIMESTAMP(3),
  "stockCommittedBy" TEXT,
  "totalQuantity" INTEGER NOT NULL DEFAULT 0,
  "grossAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "totalDiscount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "netAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "paymentSummary" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "partner_daily_sales_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "partner_daily_sales_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "partner_daily_sales_partnerOrganizationId_fkey" FOREIGN KEY ("partnerOrganizationId") REFERENCES "partner_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "partner_daily_sales_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "partner_daily_sale_items" (
  "id" TEXT NOT NULL,
  "partnerDailySaleId" TEXT NOT NULL,
  "medicineName" TEXT NOT NULL,
  "batchNumber" TEXT NOT NULL,
  "quantitySold" INTEGER NOT NULL,
  "mrp" DOUBLE PRECISION NOT NULL,
  "discountGiven" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "paymentMode" "PaymentMode" NOT NULL,
  "matchedDrugId" TEXT,
  "matchedInventoryItemId" TEXT,
  "committedQuantity" INTEGER NOT NULL DEFAULT 0,
  "discrepancyFlag" "PartnerDailySaleDiscrepancyFlag",
  "discrepancyReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "partner_daily_sale_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "partner_daily_sale_items_partnerDailySaleId_fkey" FOREIGN KEY ("partnerDailySaleId") REFERENCES "partner_daily_sales"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "partner_organizations_branchId_name_key" ON "partner_organizations"("branchId", "name");
CREATE INDEX "partner_organizations_branchId_idx" ON "partner_organizations"("branchId");
CREATE INDEX "partner_organizations_branchId_isActive_idx" ON "partner_organizations"("branchId", "isActive");
CREATE INDEX "partner_organizations_branchId_externalCode_idx" ON "partner_organizations"("branchId", "externalCode");

CREATE UNIQUE INDEX "partner_daily_sales_branchId_partnerOrganizationId_date_key" ON "partner_daily_sales"("branchId", "partnerOrganizationId", "date");
CREATE INDEX "partner_daily_sales_branchId_date_idx" ON "partner_daily_sales"("branchId", "date");
CREATE INDEX "partner_daily_sales_branchId_partnerOrganizationId_date_idx" ON "partner_daily_sales"("branchId", "partnerOrganizationId", "date");
CREATE INDEX "partner_daily_sales_branchId_status_idx" ON "partner_daily_sales"("branchId", "status");
CREATE INDEX "partner_daily_sales_branchId_date_partnerOrganizationId_status_idx" ON "partner_daily_sales"("branchId", "date", "partnerOrganizationId", "status");

CREATE INDEX "partner_daily_sale_items_partnerDailySaleId_idx" ON "partner_daily_sale_items"("partnerDailySaleId");
CREATE INDEX "partner_daily_sale_items_medicineName_idx" ON "partner_daily_sale_items"("medicineName");
CREATE INDEX "partner_daily_sale_items_batchNumber_idx" ON "partner_daily_sale_items"("batchNumber");
CREATE INDEX "partner_daily_sale_items_matchedDrugId_idx" ON "partner_daily_sale_items"("matchedDrugId");
CREATE INDEX "partner_daily_sale_items_matchedInventoryItemId_idx" ON "partner_daily_sale_items"("matchedInventoryItemId");
