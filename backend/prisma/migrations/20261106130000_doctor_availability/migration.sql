-- Guards keep this safe on databases already brought up to date with `prisma db push`.
-- Legacy users.metadata workingHours are not copied: the application falls back to them until hours are saved.
DO $$ BEGIN
  CREATE TYPE "TimeOffKind" AS ENUM ('LEAVE', 'HOLIDAY', 'BLOCKED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "doctor_working_hours" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "doctor_working_hours_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "doctor_time_off" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "doctorId" TEXT,
    "kind" "TimeOffKind" NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "doctor_time_off_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "doctor_working_hours_doctorId_weekday_idx" ON "doctor_working_hours"("doctorId", "weekday");
CREATE INDEX IF NOT EXISTS "doctor_time_off_branchId_startsAt_idx" ON "doctor_time_off"("branchId", "startsAt");
CREATE INDEX IF NOT EXISTS "doctor_time_off_doctorId_startsAt_idx" ON "doctor_time_off"("doctorId", "startsAt");

DO $$ BEGIN
  ALTER TABLE "doctor_working_hours" ADD CONSTRAINT "doctor_working_hours_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "doctor_working_hours" ADD CONSTRAINT "doctor_working_hours_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "doctor_time_off" ADD CONSTRAINT "doctor_time_off_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "doctor_time_off" ADD CONSTRAINT "doctor_time_off_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "doctor_time_off" ADD CONSTRAINT "doctor_time_off_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
