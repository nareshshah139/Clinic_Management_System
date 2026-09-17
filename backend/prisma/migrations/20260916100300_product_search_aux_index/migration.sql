CREATE INDEX CONCURRENTLY "drugs_search_aux_gist" ON "drugs"
USING GIST (lower(coalesce("manufacturerName", '') || ' ' || coalesce("category", '')) gist_trgm_ops(siglen=32))
WHERE "isActive" = true AND "isDiscontinued" = false;
