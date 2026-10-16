ALTER TABLE "inventory_migrations" ADD COLUMN "rowTrackingVersion" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "legacyResult" JSONB;
CREATE TABLE "inventory_migration_rows" (
  "importId" TEXT NOT NULL REFERENCES "inventory_migrations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "sourceRow" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "outcome" JSONB,
  "retryable" BOOLEAN NOT NULL DEFAULT false,
  "errorCode" TEXT,
  "message" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  PRIMARY KEY ("importId", "sourceRow"),
  CONSTRAINT "opening_row_state" CHECK ("status" IN ('PENDING', 'SUCCEEDED', 'FAILED', 'UNKNOWN'))
);
