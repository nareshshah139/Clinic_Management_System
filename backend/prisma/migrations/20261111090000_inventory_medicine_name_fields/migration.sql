-- A medicine's printed name is built from its form, own name and strength; codes and pack sizes live apart.
DO $$ BEGIN
  CREATE TYPE "MedicineForm" AS ENUM ('TABLET', 'CAPSULE', 'SYRUP', 'CREAM', 'OINTMENT', 'SOLUTION', 'LOTION', 'GEL', 'SHAMPOO', 'FACE_WASH', 'SERUM', 'SUNSCREEN', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "inventory_items"
  ADD COLUMN IF NOT EXISTS "form" "MedicineForm",
  ADD COLUMN IF NOT EXISTS "strength" TEXT,
  ADD COLUMN IF NOT EXISTS "isCombination" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "itemCode" TEXT;
