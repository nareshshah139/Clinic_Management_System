-- AlterTable: Add age column and make dob nullable
-- Backward compatible: existing rows with dob keep their values

-- Step 1: Add the new age column (nullable)
ALTER TABLE "patients" ADD COLUMN "age" INTEGER;

-- Step 2: Backfill age from existing dob values where dob is not a "default" placeholder
-- (patients whose dob was set to their creation date are treated as missing)
UPDATE "patients"
SET "age" = EXTRACT(YEAR FROM AGE(NOW(), "dob"))::INTEGER
WHERE "dob" IS NOT NULL
  AND DATE("dob") <> DATE("createdAt");

-- Step 3: Make dob nullable (drop NOT NULL constraint)
ALTER TABLE "patients" ALTER COLUMN "dob" DROP NOT NULL;
