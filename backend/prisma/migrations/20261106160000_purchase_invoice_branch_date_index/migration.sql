-- Separate migration: concurrent index creation must run outside a transaction block.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "pharmacy_purchase_invoices_branchId_invoiceDate_idx" ON "pharmacy_purchase_invoices"("branchId", "invoiceDate");
