-- A pharmacy bill number is issued by its branch's PHARMACY counter, so it is unique within that branch.
-- Every existing number is already unique across branches, so the narrower key holds for all rows.
DROP INDEX IF EXISTS "pharmacy_invoices_invoiceNumber_key";

CREATE UNIQUE INDEX IF NOT EXISTS "pharmacy_invoices_branchId_invoiceNumber_key" ON "pharmacy_invoices"("branchId", "invoiceNumber");
