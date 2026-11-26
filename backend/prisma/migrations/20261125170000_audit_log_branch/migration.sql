-- Each audit entry records its author's branch when written, so reads stay inside one clinic and
-- an entry survives its author's account being deleted. Existing entries take the branch their
-- author belongs to now. Entries whose author is already gone cannot be placed and stay unscoped.
ALTER TABLE "audit_logs" ADD COLUMN "branchId" TEXT;

CREATE INDEX "audit_logs_branchId_timestamp_idx" ON "audit_logs"("branchId", "timestamp");

UPDATE "audit_logs" AS a
SET "branchId" = u."branchId"
FROM "users" AS u
WHERE a."userId" = u."id" AND a."branchId" IS NULL;
