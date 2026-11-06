-- Guards keep this safe on databases already brought up to date with `prisma db push`.
CREATE TABLE IF NOT EXISTS "clinic_investigations" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "clinic_investigations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "clinic_investigations_branchId_normalizedName_key" ON "clinic_investigations"("branchId", "normalizedName");

DO $$ BEGIN
  ALTER TABLE "clinic_investigations" ADD CONSTRAINT "clinic_investigations_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
