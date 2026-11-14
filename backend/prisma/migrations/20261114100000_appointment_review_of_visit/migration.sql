-- AlterTable
ALTER TABLE "appointments" ADD COLUMN "reviewOfVisitId" TEXT,
ADD COLUMN "reviewRequestedFor" DATE;

-- CreateIndex
CREATE INDEX "appointments_reviewOfVisitId_idx" ON "appointments"("reviewOfVisitId");

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_reviewOfVisitId_fkey" FOREIGN KEY ("reviewOfVisitId") REFERENCES "visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A visit has at most one pending review booking. Under way, cancelled, missed and completed reviews do not count.
CREATE UNIQUE INDEX "appointments_one_pending_review_per_visit_key"
  ON "appointments"("reviewOfVisitId")
  WHERE "reviewOfVisitId" IS NOT NULL
    AND "status" IN ('SCHEDULED'::"AppointmentStatus", 'CONFIRMED'::"AppointmentStatus");
