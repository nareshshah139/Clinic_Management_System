DROP INDEX IF EXISTS "inventory_supplier_credits_credit_note_key";

CREATE UNIQUE INDEX IF NOT EXISTS "inventory_supplier_credits_open_credit_note_key"
  ON "inventory_supplier_credits"("branchId", "supplierGstin", "creditNoteNumber")
  WHERE "reversedAt" IS NULL AND "creditNoteNumber" IS NOT NULL;
