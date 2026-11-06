ALTER TABLE "pharmacy_invoices" ADD COLUMN IF NOT EXISTS "createdById" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pharmacy_invoices_createdById_fkey') THEN
    ALTER TABLE "pharmacy_invoices" ADD CONSTRAINT "pharmacy_invoices_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
