-- Issue #190: a clinic payment records when the money was received, separately from when it was
-- typed in, so a catch-up entry counts on the day it was taken. Every existing payment was received
-- when it was entered, so history is backfilled from createdAt and no report changes.
ALTER TABLE "new_payments" ADD COLUMN "receivedAt" TIMESTAMP(3);

UPDATE "new_payments" SET "receivedAt" = "createdAt" WHERE "receivedAt" IS NULL;

ALTER TABLE "new_payments" ALTER COLUMN "receivedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "new_payments" ALTER COLUMN "receivedAt" SET NOT NULL;

CREATE INDEX "new_payments_reconStatus_receivedAt_idx" ON "new_payments"("reconStatus", "receivedAt");
