CREATE INDEX CONCURRENTLY "drugs_search_ingredient_gist" ON "drugs"
USING GIST (lower(coalesce("composition1", '') || ' ' || coalesce("composition2", '')) gist_trgm_ops(siglen=32))
WHERE "isActive" = true AND "isDiscontinued" = false;
