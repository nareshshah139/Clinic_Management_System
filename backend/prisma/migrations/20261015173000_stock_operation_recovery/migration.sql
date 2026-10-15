ALTER TABLE "stock_transactions" ADD COLUMN "operationId" TEXT,
  ADD COLUMN "operationRowId" TEXT, ADD COLUMN "requestFingerprint" TEXT;
CREATE UNIQUE INDEX "stock_transactions_branchId_operationId_operationRowId_key"
  ON "stock_transactions"("branchId", "operationId", "operationRowId");
CREATE TABLE "inventory_stock_operations" (
  "id" TEXT NOT NULL, "branchId" TEXT NOT NULL, "operationId" TEXT NOT NULL,
  "kind" TEXT NOT NULL, "rows" JSONB NOT NULL, "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_stock_operations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "inventory_stock_operations_branchId_operationId_key"
  ON "inventory_stock_operations"("branchId", "operationId");
