-- Separate migration: concurrent index creation must run outside a transaction block.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "new_invoices_branchId_createdAt_idx" ON "new_invoices"("branchId", "createdAt");
