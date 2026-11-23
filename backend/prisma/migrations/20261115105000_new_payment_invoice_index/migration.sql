-- Separate migration: concurrent index creation must run outside a transaction block.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "new_payments_invoiceId_idx" ON "new_payments"("invoiceId");
