-- CreateIndex
CREATE INDEX "patients_branchId_idx" ON "public"."patients"("branchId");

-- CreateIndex
CREATE INDEX "patients_name_idx" ON "public"."patients"("name");

-- CreateIndex
CREATE INDEX "patients_phone_idx" ON "public"."patients"("phone");

-- CreateIndex
CREATE INDEX "patients_gender_idx" ON "public"."patients"("gender");

-- CreateIndex
CREATE INDEX "patients_createdAt_idx" ON "public"."patients"("createdAt");

-- CreateIndex
CREATE INDEX "patients_branchId_name_idx" ON "public"."patients"("branchId", "name");

-- CreateIndex
CREATE INDEX "patients_branchId_phone_idx" ON "public"."patients"("branchId", "phone");
