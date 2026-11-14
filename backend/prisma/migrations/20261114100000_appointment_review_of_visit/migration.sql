-- AlterTable
ALTER TABLE "appointments" ADD COLUMN "reviewOfVisitId" TEXT;

-- CreateIndex
CREATE INDEX "appointments_reviewOfVisitId_idx" ON "appointments"("reviewOfVisitId");

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_reviewOfVisitId_fkey" FOREIGN KEY ("reviewOfVisitId") REFERENCES "visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A visit has at most one review appointment that is not cancelled.
CREATE UNIQUE INDEX "appointments_one_live_review_per_visit_key"
  ON "appointments"("reviewOfVisitId")
  WHERE "reviewOfVisitId" IS NOT NULL AND "status" <> 'CANCELLED'::"AppointmentStatus";
