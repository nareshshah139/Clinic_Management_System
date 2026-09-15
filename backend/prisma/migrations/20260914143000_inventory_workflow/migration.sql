-- AlterTable
ALTER TABLE "inventory_items" ADD COLUMN     "heldStock" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "stock_transactions" ADD COLUMN     "quantityDelta" INTEGER;

-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN     "drugLicenseNo" TEXT,
ADD COLUMN     "foodLicenseNo" TEXT;

-- AlterTable
ALTER TABLE "pharmacy_purchase_invoices" ADD COLUMN     "actionMetadata" JSONB,
ADD COLUMN     "actionVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "creditApplied" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "workflowReceiptId" TEXT;

-- AlterTable
ALTER TABLE "pharmacy_purchase_invoice_items" ADD COLUMN     "inventoryItemId" TEXT,
ADD COLUMN     "schemeAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "pharmacy_purchase_payments" ADD COLUMN     "requestKey" TEXT;

-- CreateTable
CREATE TABLE "inventory_workflow_documents" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "reference" TEXT NOT NULL,
    "supplierId" TEXT,
    "supplierGstin" TEXT,
    "sourceId" TEXT,
    "purchaseInvoiceId" TEXT,
    "salesInvoiceId" TEXT,
    "payload" JSONB NOT NULL,
    "totalAmount" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "requestKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "postedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "postedAt" TIMESTAMP(3),

    CONSTRAINT "inventory_workflow_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_workflow_events" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "detail" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_workflow_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_workflow_effects" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "effectKey" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "inventoryId" TEXT,
    "transactionId" TEXT,
    "sourceLineId" TEXT,
    "quantityDelta" INTEGER NOT NULL DEFAULT 0,
    "sourceQuantity" INTEGER NOT NULL DEFAULT 0,
    "heldDelta" INTEGER NOT NULL DEFAULT 0,
    "amount" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_workflow_effects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_supplier_credits" (
    "reversedAt" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "supplierGstin" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "amount" DECIMAL(16,2) NOT NULL,
    "applied" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_supplier_credits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_credit_allocations" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "creditId" TEXT NOT NULL,
    "purchaseInvoiceId" TEXT NOT NULL,
    "amount" DECIMAL(16,2) NOT NULL,
    "requestKey" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "reversedAt" TIMESTAMP(3),
    "reversedBy" TEXT,
    "reversalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_credit_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_workflow_settings" (
    "branchId" TEXT NOT NULL,
    "settings" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_workflow_settings_pkey" PRIMARY KEY ("branchId")
);

-- CreateTable
CREATE TABLE "inventory_intake_drafts" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "documentIds" TEXT[],
    "payload" JSONB NOT NULL,
    "channel" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "invoiceId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_intake_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_mailbox_connections" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT,
    "encryptedTokens" TEXT,
    "stateHash" TEXT,
    "stateExpiresAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_mailbox_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_migrations" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "result" JSONB,
    "processingUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_migrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_workflow_documents_branchId_kind_status_createdAt_idx" ON "inventory_workflow_documents"("branchId", "kind", "status", "createdAt");

-- CreateIndex
CREATE INDEX "inventory_workflow_documents_branchId_sourceId_idx" ON "inventory_workflow_documents"("branchId", "sourceId");

-- CreateIndex
CREATE INDEX "inventory_workflow_documents_branchId_supplierGstin_idx" ON "inventory_workflow_documents"("branchId", "supplierGstin");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_workflow_documents_branchId_requestKey_key" ON "inventory_workflow_documents"("branchId", "requestKey");

-- CreateIndex
CREATE INDEX "inventory_workflow_events_branchId_createdAt_idx" ON "inventory_workflow_events"("branchId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_workflow_events_documentId_version_key" ON "inventory_workflow_events"("documentId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_workflow_effects_effectKey_key" ON "inventory_workflow_effects"("effectKey");

-- CreateIndex
CREATE INDEX "inventory_workflow_effects_branchId_inventoryId_idx" ON "inventory_workflow_effects"("branchId", "inventoryId");

-- CreateIndex
CREATE INDEX "inventory_workflow_effects_branchId_sourceLineId_idx" ON "inventory_workflow_effects"("branchId", "sourceLineId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_supplier_credits_documentId_key" ON "inventory_supplier_credits"("documentId");

-- CreateIndex
CREATE INDEX "inventory_supplier_credits_branchId_supplierGstin_idx" ON "inventory_supplier_credits"("branchId", "supplierGstin");

-- CreateIndex
CREATE INDEX "inventory_credit_allocations_branchId_purchaseInvoiceId_idx" ON "inventory_credit_allocations"("branchId", "purchaseInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_credit_allocations_branchId_requestKey_key" ON "inventory_credit_allocations"("branchId", "requestKey");

-- CreateIndex
CREATE INDEX "inventory_intake_drafts_branchId_updatedAt_idx" ON "inventory_intake_drafts"("branchId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_intake_drafts_branchId_requestKey_key" ON "inventory_intake_drafts"("branchId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_mailbox_connections_branchId_userId_key" ON "inventory_mailbox_connections"("branchId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_migrations_branchId_sha256_key" ON "inventory_migrations"("branchId", "sha256");

-- CreateIndex
CREATE UNIQUE INDEX "pharmacy_purchase_invoices_branchId_workflowReceiptId_key" ON "pharmacy_purchase_invoices"("branchId", "workflowReceiptId");

-- CreateIndex
CREATE UNIQUE INDEX "pharmacy_purchase_payments_branchId_requestKey_key" ON "pharmacy_purchase_payments"("branchId", "requestKey");

-- AddForeignKey
ALTER TABLE "inventory_workflow_events" ADD CONSTRAINT "inventory_workflow_events_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "inventory_workflow_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_workflow_effects" ADD CONSTRAINT "inventory_workflow_effects_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "inventory_workflow_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_credit_allocations" ADD CONSTRAINT "inventory_credit_allocations_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "inventory_supplier_credits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

