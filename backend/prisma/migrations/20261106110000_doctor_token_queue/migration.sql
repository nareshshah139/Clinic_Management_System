-- Tokens become a per-doctor daily queue. Branch-wide numbering made same-doctor
-- duplicates possible under concurrent booking; give each later duplicate the
-- next free number in that doctor's day so the unique index can be created.
-- No appointment is deleted and every first holder keeps its token.
WITH ranked AS (
  SELECT id, "branchId", "doctorId", "date",
         ROW_NUMBER() OVER (PARTITION BY "branchId", "doctorId", "date", "tokenNumber" ORDER BY "createdAt", id) AS copy
  FROM "appointments"
  WHERE "tokenNumber" IS NOT NULL
), duplicates AS (
  SELECT r.id,
         m.max_token + ROW_NUMBER() OVER (PARTITION BY r."branchId", r."doctorId", r."date" ORDER BY r.id) AS token
  FROM ranked r
  JOIN (
    SELECT "branchId", "doctorId", "date", MAX("tokenNumber") AS max_token
    FROM "appointments" GROUP BY "branchId", "doctorId", "date"
  ) m USING ("branchId", "doctorId", "date")
  WHERE r.copy > 1
)
UPDATE "appointments" a SET "tokenNumber" = d.token FROM duplicates d WHERE a.id = d.id;

CREATE UNIQUE INDEX "appointments_doctor_day_token_key"
  ON "appointments"("branchId", "doctorId", "date", "tokenNumber");
