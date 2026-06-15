CREATE TYPE "DrugInventoryChangeRequestStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'REJECTED'
);

CREATE TABLE "drug_inventory_change_requests" (
  "id" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "drugId" TEXT NOT NULL,
  "inventoryItemId" TEXT,
  "requestedById" TEXT NOT NULL,
  "reviewedById" TEXT,
  "currentPrice" DOUBLE PRECISION,
  "proposedPrice" DOUBLE PRECISION,
  "currentStock" INTEGER,
  "proposedStock" INTEGER,
  "reason" TEXT,
  "status" "DrugInventoryChangeRequestStatus" NOT NULL DEFAULT 'PENDING',
  "reviewNote" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "drug_inventory_change_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "drug_inventory_change_requests_branchId_status_idx"
  ON "drug_inventory_change_requests"("branchId", "status");

CREATE INDEX "drug_inventory_change_requests_drugId_status_idx"
  ON "drug_inventory_change_requests"("drugId", "status");

CREATE INDEX "drug_inventory_change_requests_inventoryItemId_status_idx"
  ON "drug_inventory_change_requests"("inventoryItemId", "status");

CREATE INDEX "drug_inventory_change_requests_requestedById_idx"
  ON "drug_inventory_change_requests"("requestedById");

CREATE INDEX "drug_inventory_change_requests_reviewedById_idx"
  ON "drug_inventory_change_requests"("reviewedById");

ALTER TABLE "drug_inventory_change_requests"
  ADD CONSTRAINT "drug_inventory_change_requests_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "drug_inventory_change_requests"
  ADD CONSTRAINT "drug_inventory_change_requests_drugId_fkey"
  FOREIGN KEY ("drugId") REFERENCES "drugs"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "drug_inventory_change_requests"
  ADD CONSTRAINT "drug_inventory_change_requests_inventoryItemId_fkey"
  FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "drug_inventory_change_requests"
  ADD CONSTRAINT "drug_inventory_change_requests_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "drug_inventory_change_requests"
  ADD CONSTRAINT "drug_inventory_change_requests_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "permissions" ("id", "name", "description", "resource", "action", "isActive", "createdAt", "updatedAt")
VALUES
  ('perm_pharmacy_drug_inventory_change_read', 'pharmacy:drug:inventory-change:read', 'Read drug inventory change approval requests', 'pharmacy_drug', 'inventory-change:read', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_pharmacy_drug_inventory_change_create', 'pharmacy:drug:inventory-change:create', 'Submit drug price or stock changes for approval', 'pharmacy_drug', 'inventory-change:create', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_pharmacy_drug_inventory_change_approve', 'pharmacy:drug:inventory-change:approve', 'Approve or reject drug inventory change requests', 'pharmacy_drug', 'inventory-change:approve', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

UPDATE "roles"
SET
  "permissions" = (
    SELECT jsonb_agg(DISTINCT value)::text
    FROM jsonb_array_elements_text(
      COALESCE(NULLIF("roles"."permissions", ''), '[]')::jsonb ||
      '["pharmacy:drug:inventory-change:read","pharmacy:drug:inventory-change:create"]'::jsonb
    ) AS merged(value)
  ),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "name" = 'PHARMACIST';

UPDATE "users"
SET
  "permissions" = (
    SELECT jsonb_agg(DISTINCT value)::text
    FROM jsonb_array_elements_text(
      COALESCE(NULLIF("users"."permissions", ''), '[]')::jsonb ||
      '["pharmacy:drug:inventory-change:read","pharmacy:drug:inventory-change:create"]'::jsonb
    ) AS merged(value)
  ),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "role" = 'PHARMACIST';

UPDATE "roles"
SET
  "permissions" = (
    SELECT jsonb_agg(DISTINCT value)::text
    FROM jsonb_array_elements_text(
      COALESCE(NULLIF("roles"."permissions", ''), '[]')::jsonb ||
      '["pharmacy:drug:inventory-change:read","pharmacy:drug:inventory-change:approve"]'::jsonb
    ) AS merged(value)
  ),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "name" = 'DOCTOR';

UPDATE "users"
SET
  "permissions" = (
    SELECT jsonb_agg(DISTINCT value)::text
    FROM jsonb_array_elements_text(
      COALESCE(NULLIF("users"."permissions", ''), '[]')::jsonb ||
      '["pharmacy:drug:inventory-change:read","pharmacy:drug:inventory-change:approve"]'::jsonb
    ) AS merged(value)
  ),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "role" = 'DOCTOR';
