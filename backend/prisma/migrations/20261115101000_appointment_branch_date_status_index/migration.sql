-- Separate migration: concurrent index creation must run outside a transaction block.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "appointments_branchId_date_status_idx" ON "appointments"("branchId", "date", "status");
