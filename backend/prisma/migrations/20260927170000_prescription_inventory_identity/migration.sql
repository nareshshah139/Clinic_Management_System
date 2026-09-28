BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE "prescription_inventory_links" (
  "id" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "sourceKey" TEXT NOT NULL,
  "sourceName" TEXT NOT NULL,
  "inventoryItemId" TEXT NOT NULL,
  "linkedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "prescription_inventory_links_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "prescription_inventory_links_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "prescription_inventory_links_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "prescription_inventory_links_branchId_sourceKey_key" ON "prescription_inventory_links"("branchId", "sourceKey");
CREATE INDEX "prescription_inventory_links_inventoryItemId_idx" ON "prescription_inventory_links"("inventoryItemId");
ALTER TABLE "pharmacy_invoice_items" ADD COLUMN "inventoryItemId" TEXT;

COMMIT;
