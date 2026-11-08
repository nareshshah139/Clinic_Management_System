-- Guards keep this safe on databases already brought up to date with `prisma db push`.

DO $$ BEGIN
  CREATE TYPE "InventoryItemRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "pharmacy_trade_terms" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "drugId" TEXT,
    "productName" TEXT NOT NULL,
    "productKey" TEXT NOT NULL,
    "discountPercent" DOUBLE PRECISION,
    "schemeBuy" INTEGER,
    "schemeFree" INTEGER,
    "minExpiryMonths" INTEGER,
    "marginPercent" DOUBLE PRECISION,
    "ptr" DOUBLE PRECISION,
    "ptrRule" TEXT,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pharmacy_trade_terms_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "inventory_item_requests" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "status" "InventoryItemRequestStatus" NOT NULL DEFAULT 'PENDING',
    "itemName" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "reason" TEXT,
    "reviewNote" TEXT,
    "inventoryItemId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_item_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "pharmacy_trade_terms_branchId_supplierId_idx" ON "pharmacy_trade_terms"("branchId", "supplierId");

CREATE UNIQUE INDEX IF NOT EXISTS "pharmacy_trade_terms_branchId_supplierId_productKey_key" ON "pharmacy_trade_terms"("branchId", "supplierId", "productKey");

CREATE UNIQUE INDEX IF NOT EXISTS "inventory_item_requests_inventoryItemId_key" ON "inventory_item_requests"("inventoryItemId");

CREATE INDEX IF NOT EXISTS "inventory_item_requests_branchId_status_idx" ON "inventory_item_requests"("branchId", "status");

DO $$ BEGIN
  ALTER TABLE "pharmacy_trade_terms" ADD CONSTRAINT "pharmacy_trade_terms_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "pharmacy_trade_terms" ADD CONSTRAINT "pharmacy_trade_terms_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "pharmacy_trade_terms" ADD CONSTRAINT "pharmacy_trade_terms_drugId_fkey" FOREIGN KEY ("drugId") REFERENCES "drugs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "pharmacy_trade_terms" ADD CONSTRAINT "pharmacy_trade_terms_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "pharmacy_trade_terms" ADD CONSTRAINT "pharmacy_trade_terms_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "inventory_item_requests" ADD CONSTRAINT "inventory_item_requests_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "inventory_item_requests" ADD CONSTRAINT "inventory_item_requests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "inventory_item_requests" ADD CONSTRAINT "inventory_item_requests_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "inventory_item_requests" ADD CONSTRAINT "inventory_item_requests_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
