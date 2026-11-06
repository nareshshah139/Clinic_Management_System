CREATE TABLE IF NOT EXISTS "inventory_credit_set_offs" (
  "id" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "requestKey" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_credit_set_offs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "inventory_credit_set_offs_branchId_requestKey_key"
  ON "inventory_credit_set_offs"("branchId", "requestKey");

ALTER TABLE "inventory_credit_allocations" ADD COLUMN IF NOT EXISTS "setOffId" TEXT;

CREATE INDEX IF NOT EXISTS "inventory_credit_allocations_setOffId_idx" ON "inventory_credit_allocations"("setOffId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_credit_allocations_setOffId_fkey') THEN
    ALTER TABLE "inventory_credit_allocations" ADD CONSTRAINT "inventory_credit_allocations_setOffId_fkey"
      FOREIGN KEY ("setOffId") REFERENCES "inventory_credit_set_offs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
