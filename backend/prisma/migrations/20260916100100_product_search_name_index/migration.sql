-- Separate migration: concurrent index creation must run outside a transaction block.
CREATE INDEX CONCURRENTLY "drugs_search_name_gist" ON "drugs"
USING GIST (lower("name") gist_trgm_ops(siglen=32))
WHERE "isActive" = true AND "isDiscontinued" = false;
