ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "primaryDoctorId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patients_primaryDoctorId_fkey') THEN
    ALTER TABLE "patients" ADD CONSTRAINT "patients_primaryDoctorId_fkey"
      FOREIGN KEY ("primaryDoctorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "patients_branchId_primaryDoctorId_idx" ON "patients"("branchId", "primaryDoctorId");

-- Every patient registered before multi-doctor support was Dr. Praneeta Jain's.
-- Tag each unassigned patient to her account in the patient's own branch.
UPDATE "patients" p
SET "primaryDoctorId" = d.id
FROM (
  SELECT DISTINCT ON ("branchId") id, "branchId"
  FROM "users"
  WHERE role = 'DOCTOR'
    AND lower(regexp_replace(regexp_replace(trim("firstName" || ' ' || "lastName"), '^dr\.?\s+', '', 'i'), '\s+', ' ', 'g')) = 'praneeta jain'
  ORDER BY "branchId", "isActive" DESC, "createdAt", id
) d
WHERE p."branchId" = d."branchId" AND p."primaryDoctorId" IS NULL;
