-- Separate migration: concurrent index creation must run outside a transaction block.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "audit_logs_entity_entityId_timestamp_idx" ON "audit_logs"("entity", "entityId", "timestamp");
