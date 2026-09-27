-- Separate migration: concurrent index creation must run outside a transaction block.
CREATE INDEX CONCURRENTLY "prescriptions_createdAt_idx" ON "prescriptions"("createdAt");
