-- Guards keep this safe on databases already brought up to date with `prisma db push`.

DO $$ BEGIN
  CREATE TYPE "InventoryImportApproval" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "inventory_migrations"
  ADD COLUMN IF NOT EXISTS "approval" "InventoryImportApproval" NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN IF NOT EXISTS "requestedById" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewedById" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reviewNote" TEXT;

CREATE INDEX IF NOT EXISTS "inventory_migrations_branchId_approval_idx" ON "inventory_migrations"("branchId", "approval");

DO $$ BEGIN
  ALTER TABLE "inventory_migrations" ADD CONSTRAINT "inventory_migrations_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "inventory_migrations" ADD CONSTRAINT "inventory_migrations_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
