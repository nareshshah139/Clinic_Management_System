BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Batch edits also cover clinic items that have no drug-catalog link.
ALTER TABLE "drug_inventory_change_requests" ALTER COLUMN "drugId" DROP NOT NULL;

COMMIT;
