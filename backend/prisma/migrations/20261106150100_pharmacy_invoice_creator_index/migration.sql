-- Separate migration: concurrent index creation must run outside a transaction block.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "pharmacy_invoices_createdById_idx" ON "pharmacy_invoices"("createdById");
