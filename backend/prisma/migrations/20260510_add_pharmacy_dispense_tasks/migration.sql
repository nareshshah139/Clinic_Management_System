CREATE TYPE "PharmacyDispenseTaskStatus" AS ENUM (
  'QUEUED',
  'IN_REVIEW',
  'PARTIALLY_FILLED',
  'PAUSED',
  'READY_TO_BILL',
  'PAID',
  'DISPENSED',
  'CANCELLED'
);

CREATE TYPE "PharmacyDispenseTaskSource" AS ENUM (
  'VISIT',
  'E_PRESCRIPTION',
  'PAPER_OCR',
  'WALK_IN'
);

CREATE TYPE "PharmacyDispenseLineAction" AS ENUM (
  'PENDING',
  'ACCEPTED',
  'SUBSTITUTE',
  'EDITED',
  'UNAVAILABLE'
);

CREATE TABLE "pharmacy_dispense_tasks" (
  "id" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "prescriptionId" TEXT,
  "visitId" TEXT,
  "patientId" TEXT NOT NULL,
  "patientName" TEXT NOT NULL,
  "patientCode" TEXT,
  "doctorId" TEXT,
  "doctorName" TEXT,
  "source" "PharmacyDispenseTaskSource" NOT NULL DEFAULT 'VISIT',
  "status" "PharmacyDispenseTaskStatus" NOT NULL DEFAULT 'QUEUED',
  "priority" INTEGER NOT NULL DEFAULT 0,
  "assignedToId" TEXT,
  "startedAt" TIMESTAMP(3),
  "pausedAt" TIMESTAMP(3),
  "readyToBillAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "dispensedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "statusReasonType" TEXT,
  "statusReasonNote" TEXT,
  "exceptionCount" INTEGER NOT NULL DEFAULT 0,
  "lastStockCheckAt" TIMESTAMP(3),
  "linkedInvoiceIds" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pharmacy_dispense_tasks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pharmacy_dispense_task_lines" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "drugName" TEXT NOT NULL,
  "genericName" TEXT,
  "originalText" TEXT,
  "dosage" TEXT,
  "dosageUnit" TEXT,
  "frequency" TEXT,
  "duration" TEXT,
  "durationUnit" TEXT,
  "instructions" TEXT,
  "prescribedQuantity" INTEGER,
  "dispensedQuantity" INTEGER NOT NULL DEFAULT 0,
  "suggestedDrugId" TEXT,
  "suggestedInventoryItemId" TEXT,
  "suggestedDrugName" TEXT,
  "confidence" DOUBLE PRECISION,
  "stockStatus" TEXT,
  "recommendedBatchNumber" TEXT,
  "recommendedExpiryDate" TIMESTAMP(3),
  "recommendedStorageLocation" TEXT,
  "action" "PharmacyDispenseLineAction" NOT NULL DEFAULT 'PENDING',
  "reasonType" TEXT,
  "reasonNote" TEXT,
  "substituteDrugId" TEXT,
  "substituteDrugName" TEXT,
  "editedQuantity" INTEGER,
  "pharmacistNotes" TEXT,
  "warnings" JSONB,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pharmacy_dispense_task_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pharmacy_dispense_tasks_branchId_prescriptionId_key" ON "pharmacy_dispense_tasks"("branchId", "prescriptionId");
CREATE INDEX "pharmacy_dispense_tasks_branchId_idx" ON "pharmacy_dispense_tasks"("branchId");
CREATE INDEX "pharmacy_dispense_tasks_branchId_status_idx" ON "pharmacy_dispense_tasks"("branchId", "status");
CREATE INDEX "pharmacy_dispense_tasks_branchId_createdAt_idx" ON "pharmacy_dispense_tasks"("branchId", "createdAt");
CREATE INDEX "pharmacy_dispense_tasks_patientId_idx" ON "pharmacy_dispense_tasks"("patientId");
CREATE INDEX "pharmacy_dispense_tasks_doctorId_idx" ON "pharmacy_dispense_tasks"("doctorId");
CREATE INDEX "pharmacy_dispense_tasks_assignedToId_idx" ON "pharmacy_dispense_tasks"("assignedToId");
CREATE INDEX "pharmacy_dispense_task_lines_taskId_idx" ON "pharmacy_dispense_task_lines"("taskId");
CREATE INDEX "pharmacy_dispense_task_lines_drugName_idx" ON "pharmacy_dispense_task_lines"("drugName");
CREATE INDEX "pharmacy_dispense_task_lines_suggestedDrugId_idx" ON "pharmacy_dispense_task_lines"("suggestedDrugId");
CREATE INDEX "pharmacy_dispense_task_lines_suggestedInventoryItemId_idx" ON "pharmacy_dispense_task_lines"("suggestedInventoryItemId");

ALTER TABLE "pharmacy_dispense_task_lines"
  ADD CONSTRAINT "pharmacy_dispense_task_lines_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "pharmacy_dispense_tasks"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
