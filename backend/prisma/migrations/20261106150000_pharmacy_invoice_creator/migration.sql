ALTER TABLE "pharmacy_invoices" ADD COLUMN IF NOT EXISTS "createdById" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pharmacy_invoices_createdById_fkey') THEN
    ALTER TABLE "pharmacy_invoices" ADD CONSTRAINT "pharmacy_invoices_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

UPDATE "pharmacy_invoices" AS invoice
SET "createdById" = first_sale."userId"
FROM (
  SELECT DISTINCT ON (sale."branchId", sale."reference")
    sale."branchId", sale."reference", sale."userId"
  FROM "stock_transactions" AS sale
  WHERE sale."type" = 'SALE' AND sale."reference" LIKE 'INV-%'
  ORDER BY sale."branchId", sale."reference", sale."createdAt", sale."id"
) AS first_sale
WHERE invoice."createdById" IS NULL
  AND first_sale."branchId" = invoice."branchId"
  AND first_sale."reference" = 'INV-' || invoice."invoiceNumber";
