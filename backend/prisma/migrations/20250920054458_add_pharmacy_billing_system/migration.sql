/*
  Warnings:

  - You are about to drop the `Drug` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "public"."PharmacyInvoiceStatus" AS ENUM ('DRAFT', 'PENDING', 'CONFIRMED', 'DISPENSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."PharmacyPaymentMethod" AS ENUM ('CASH', 'CARD', 'UPI', 'NETBANKING', 'WALLET', 'INSURANCE');

-- CreateEnum
CREATE TYPE "public"."PharmacyPaymentStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED', 'PARTIALLY_PAID');

-- DropTable
DROP TABLE "public"."Drug";

-- CreateTable
CREATE TABLE "public"."drugs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "isDiscontinued" BOOLEAN NOT NULL DEFAULT false,
    "manufacturerName" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'allopathy',
    "packSizeLabel" TEXT NOT NULL,
    "composition1" TEXT,
    "composition2" TEXT,
    "barcode" TEXT,
    "sku" TEXT,
    "category" TEXT,
    "description" TEXT,
    "dosageForm" TEXT,
    "strength" TEXT,
    "storageConditions" TEXT,
    "expiryMonths" INTEGER DEFAULT 24,
    "minStockLevel" INTEGER DEFAULT 10,
    "maxStockLevel" INTEGER DEFAULT 1000,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "branchId" TEXT NOT NULL,

    CONSTRAINT "drugs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."pharmacy_invoices" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT,
    "prescriptionId" TEXT,
    "branchId" TEXT NOT NULL,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "paymentMethod" "public"."PharmacyPaymentMethod" NOT NULL,
    "paymentStatus" "public"."PharmacyPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balanceAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "billingName" TEXT NOT NULL,
    "billingPhone" TEXT NOT NULL,
    "billingAddress" TEXT,
    "billingCity" TEXT,
    "billingState" TEXT,
    "billingPincode" TEXT,
    "status" "public"."PharmacyInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "invoiceDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pharmacy_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."pharmacy_invoice_items" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "drugId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "discountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "dosage" TEXT,
    "frequency" TEXT,
    "duration" TEXT,
    "instructions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pharmacy_invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."pharmacy_payments" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "method" "public"."PharmacyPaymentMethod" NOT NULL,
    "reference" TEXT,
    "gateway" TEXT,
    "status" "public"."PharmacyPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pharmacy_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."_DrugToInventoryItem" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_DrugToInventoryItem_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "drugs_barcode_key" ON "public"."drugs"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX "drugs_sku_key" ON "public"."drugs"("sku");

-- CreateIndex
CREATE INDEX "drugs_name_idx" ON "public"."drugs"("name");

-- CreateIndex
CREATE INDEX "drugs_manufacturerName_idx" ON "public"."drugs"("manufacturerName");

-- CreateIndex
CREATE INDEX "drugs_type_idx" ON "public"."drugs"("type");

-- CreateIndex
CREATE INDEX "drugs_branchId_idx" ON "public"."drugs"("branchId");

-- CreateIndex
CREATE INDEX "drugs_isActive_idx" ON "public"."drugs"("isActive");

-- CreateIndex
CREATE INDEX "drugs_isDiscontinued_idx" ON "public"."drugs"("isDiscontinued");

-- CreateIndex
CREATE UNIQUE INDEX "pharmacy_invoices_invoiceNumber_key" ON "public"."pharmacy_invoices"("invoiceNumber");

-- CreateIndex
CREATE INDEX "pharmacy_invoices_patientId_idx" ON "public"."pharmacy_invoices"("patientId");

-- CreateIndex
CREATE INDEX "pharmacy_invoices_doctorId_idx" ON "public"."pharmacy_invoices"("doctorId");

-- CreateIndex
CREATE INDEX "pharmacy_invoices_branchId_idx" ON "public"."pharmacy_invoices"("branchId");

-- CreateIndex
CREATE INDEX "pharmacy_invoices_status_idx" ON "public"."pharmacy_invoices"("status");

-- CreateIndex
CREATE INDEX "pharmacy_invoices_paymentStatus_idx" ON "public"."pharmacy_invoices"("paymentStatus");

-- CreateIndex
CREATE INDEX "pharmacy_invoices_invoiceDate_idx" ON "public"."pharmacy_invoices"("invoiceDate");

-- CreateIndex
CREATE INDEX "pharmacy_invoice_items_invoiceId_idx" ON "public"."pharmacy_invoice_items"("invoiceId");

-- CreateIndex
CREATE INDEX "pharmacy_invoice_items_drugId_idx" ON "public"."pharmacy_invoice_items"("drugId");

-- CreateIndex
CREATE INDEX "pharmacy_payments_invoiceId_idx" ON "public"."pharmacy_payments"("invoiceId");

-- CreateIndex
CREATE INDEX "pharmacy_payments_status_idx" ON "public"."pharmacy_payments"("status");

-- CreateIndex
CREATE INDEX "pharmacy_payments_paymentDate_idx" ON "public"."pharmacy_payments"("paymentDate");

-- CreateIndex
CREATE INDEX "_DrugToInventoryItem_B_index" ON "public"."_DrugToInventoryItem"("B");

-- AddForeignKey
ALTER TABLE "public"."drugs" ADD CONSTRAINT "drugs_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "public"."branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."pharmacy_invoices" ADD CONSTRAINT "pharmacy_invoices_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "public"."patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."pharmacy_invoices" ADD CONSTRAINT "pharmacy_invoices_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."pharmacy_invoices" ADD CONSTRAINT "pharmacy_invoices_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "public"."prescriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."pharmacy_invoices" ADD CONSTRAINT "pharmacy_invoices_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "public"."branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."pharmacy_invoice_items" ADD CONSTRAINT "pharmacy_invoice_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "public"."pharmacy_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."pharmacy_invoice_items" ADD CONSTRAINT "pharmacy_invoice_items_drugId_fkey" FOREIGN KEY ("drugId") REFERENCES "public"."drugs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."pharmacy_payments" ADD CONSTRAINT "pharmacy_payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "public"."pharmacy_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_DrugToInventoryItem" ADD CONSTRAINT "_DrugToInventoryItem_A_fkey" FOREIGN KEY ("A") REFERENCES "public"."drugs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_DrugToInventoryItem" ADD CONSTRAINT "_DrugToInventoryItem_B_fkey" FOREIGN KEY ("B") REFERENCES "public"."inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
