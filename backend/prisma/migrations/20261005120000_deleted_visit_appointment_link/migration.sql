BEGIN;
ALTER TABLE "visits" ADD COLUMN "deletedAppointmentId" TEXT;
UPDATE "appointments" a SET "status" = 'CHECKED_IN'
WHERE a."status" IN ('IN_PROGRESS', 'COMPLETED')
  AND EXISTS (SELECT 1 FROM "visits" v WHERE v."appointmentId" = a.id AND v."deletedAt" IS NOT NULL);
UPDATE "visits" SET "deletedAppointmentId" = "appointmentId", "appointmentId" = NULL
WHERE "deletedAt" IS NOT NULL AND "appointmentId" IS NOT NULL;
COMMIT;
