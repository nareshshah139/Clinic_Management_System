-- CreateEnum
CREATE TYPE "public"."PharmacyItemType" AS ENUM ('DRUG', 'PACKAGE');

-- DropForeignKey
ALTER TABLE "public"."pharmacy_invoice_items" DROP CONSTRAINT "pharmacy_invoice_items_drugId_fkey";

-- AlterTable
ALTER TABLE "public"."pharmacy_invoice_items" ADD COLUMN     "itemType" "public"."PharmacyItemType" NOT NULL DEFAULT 'DRUG',
ADD COLUMN     "packageId" TEXT,
ALTER COLUMN "drugId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "public"."pharmacy_packages" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'Dermatology',
    "subcategory" TEXT,
    "originalPrice" DOUBLE PRECISION NOT NULL,
    "packagePrice" DOUBLE PRECISION NOT NULL,
    "discountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "duration" TEXT,
    "instructions" TEXT,
    "indications" TEXT,
    "contraindications" TEXT,
    "createdBy" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "branchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pharmacy_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."pharmacy_package_items" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "drugId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "dosage" TEXT,
    "frequency" TEXT,
    "duration" TEXT,
    "instructions" TEXT,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pharmacy_package_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pharmacy_packages_branchId_idx" ON "public"."pharmacy_packages"("branchId");

-- CreateIndex
CREATE INDEX "pharmacy_packages_category_idx" ON "public"."pharmacy_packages"("category");

-- CreateIndex
CREATE INDEX "pharmacy_packages_subcategory_idx" ON "public"."pharmacy_packages"("subcategory");

-- CreateIndex
CREATE INDEX "pharmacy_packages_createdBy_idx" ON "public"."pharmacy_packages"("createdBy");

-- CreateIndex
CREATE INDEX "pharmacy_packages_isActive_idx" ON "public"."pharmacy_packages"("isActive");

-- CreateIndex
CREATE INDEX "pharmacy_packages_isPublic_idx" ON "public"."pharmacy_packages"("isPublic");

-- CreateIndex
CREATE INDEX "pharmacy_package_items_packageId_idx" ON "public"."pharmacy_package_items"("packageId");

-- CreateIndex
CREATE INDEX "pharmacy_package_items_drugId_idx" ON "public"."pharmacy_package_items"("drugId");

-- CreateIndex
CREATE INDEX "pharmacy_invoice_items_packageId_idx" ON "public"."pharmacy_invoice_items"("packageId");

-- CreateIndex
CREATE INDEX "pharmacy_invoice_items_itemType_idx" ON "public"."pharmacy_invoice_items"("itemType");

-- AddForeignKey
ALTER TABLE "public"."pharmacy_invoice_items" ADD CONSTRAINT "pharmacy_invoice_items_drugId_fkey" FOREIGN KEY ("drugId") REFERENCES "public"."drugs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."pharmacy_invoice_items" ADD CONSTRAINT "pharmacy_invoice_items_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "public"."pharmacy_packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."pharmacy_packages" ADD CONSTRAINT "pharmacy_packages_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."pharmacy_packages" ADD CONSTRAINT "pharmacy_packages_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "public"."branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."pharmacy_package_items" ADD CONSTRAINT "pharmacy_package_items_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "public"."pharmacy_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."pharmacy_package_items" ADD CONSTRAINT "pharmacy_package_items_drugId_fkey" FOREIGN KEY ("drugId") REFERENCES "public"."drugs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
