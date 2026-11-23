-- Separate migration: concurrent index creation must run outside a transaction block.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "audit_logs_userId_timestamp_idx" ON "audit_logs"("userId", "timestamp");
