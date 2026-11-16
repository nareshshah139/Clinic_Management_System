BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE "drug_inventory_change_requests" ADD COLUMN "stockSnapshot" JSONB;

COMMIT;
