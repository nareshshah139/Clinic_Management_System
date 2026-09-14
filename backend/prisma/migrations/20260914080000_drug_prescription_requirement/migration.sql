-- Existing catalog and inventory values are preserved. New invoice products
-- record the operator's prescription choice instead of guessing it.
ALTER TABLE "drugs" ADD COLUMN "requiresPrescription" BOOLEAN;
