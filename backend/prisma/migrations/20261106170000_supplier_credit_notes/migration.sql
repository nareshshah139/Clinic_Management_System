ALTER TABLE "inventory_supplier_credits" ADD COLUMN IF NOT EXISTS "creditNoteNumber" TEXT;
ALTER TABLE "inventory_supplier_credits" ADD COLUMN IF NOT EXISTS "creditNoteDate" DATE;
ALTER TABLE "inventory_supplier_credits" ADD COLUMN IF NOT EXISTS "receivedAt" TIMESTAMP(3);
ALTER TABLE "inventory_supplier_credits" ADD COLUMN IF NOT EXISTS "receivedById" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_supplier_credits_receivedById_fkey' AND conrelid = '"inventory_supplier_credits"'::regclass) THEN
    ALTER TABLE "inventory_supplier_credits" ADD CONSTRAINT "inventory_supplier_credits_receivedById_fkey"
      FOREIGN KEY ("receivedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "inventory_supplier_credits_credit_note_key"
  ON "inventory_supplier_credits"("branchId", "supplierGstin", "creditNoteNumber");
