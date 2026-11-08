DO $migration$ BEGIN
  CREATE TYPE "TemplateApprovalStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $migration$;

ALTER TYPE "TemplateApprovalStatus" ADD VALUE IF NOT EXISTS 'DRAFT';

ALTER TYPE "TemplateApprovalStatus" ADD VALUE IF NOT EXISTS 'PENDING';

ALTER TYPE "TemplateApprovalStatus" ADD VALUE IF NOT EXISTS 'APPROVED';

ALTER TYPE "TemplateApprovalStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

DO $migration$ BEGIN
  CREATE TYPE "AssetType" AS ENUM ('LOGO', 'STAMP', 'SIGNATURE', 'LETTERHEAD');
EXCEPTION WHEN duplicate_object THEN NULL;
END $migration$;

ALTER TYPE "AssetType" ADD VALUE IF NOT EXISTS 'LOGO';

ALTER TYPE "AssetType" ADD VALUE IF NOT EXISTS 'STAMP';

ALTER TYPE "AssetType" ADD VALUE IF NOT EXISTS 'SIGNATURE';

ALTER TYPE "AssetType" ADD VALUE IF NOT EXISTS 'LETTERHEAD';

DO $migration$ BEGIN
  CREATE TYPE "VariantType" AS ENUM ('CONTROL', 'VARIANT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $migration$;

ALTER TYPE "VariantType" ADD VALUE IF NOT EXISTS 'CONTROL';

ALTER TYPE "VariantType" ADD VALUE IF NOT EXISTS 'VARIANT';

ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "consultationType" TEXT,
ADD COLUMN IF NOT EXISTS "isArchived" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "pharmacy_invoices" ADD COLUMN IF NOT EXISTS "mutationVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "idempotency_records" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "responseBody" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

DO $migration$ BEGIN
  IF EXISTS (SELECT name FROM (VALUES ('id'), ('key'), ('userId'), ('resourceType'), ('resourceId'), ('method'), ('statusCode'), ('responseBody'), ('createdAt'), ('expiresAt')) AS expected(name) EXCEPT SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'idempotency_records') THEN
    RAISE EXCEPTION 'Existing idempotency_records table is missing required columns';
  END IF;
END $migration$;

CREATE TABLE IF NOT EXISTS "prescription_templates" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "specialty" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "items" TEXT NOT NULL,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prescription_templates_pkey" PRIMARY KEY ("id")
);

DO $migration$ BEGIN
  IF EXISTS (SELECT name FROM (VALUES ('id'), ('branchId'), ('createdBy'), ('name'), ('description'), ('category'), ('specialty'), ('isPublic'), ('items'), ('metadata'), ('createdAt'), ('updatedAt')) AS expected(name) EXCEPT SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'prescription_templates') THEN
    RAISE EXCEPTION 'Existing prescription_templates table is missing required columns';
  END IF;
END $migration$;

CREATE TABLE IF NOT EXISTS "prescription_template_versions" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "language" "Language" NOT NULL DEFAULT 'EN',
    "content" TEXT NOT NULL,
    "changeNotes" TEXT,
    "status" "TemplateApprovalStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prescription_template_versions_pkey" PRIMARY KEY ("id")
);

DO $migration$ BEGIN
  IF EXISTS (SELECT name FROM (VALUES ('id'), ('templateId'), ('versionNumber'), ('language'), ('content'), ('changeNotes'), ('status'), ('submittedAt'), ('approvedAt'), ('approvedBy'), ('createdAt'), ('updatedAt')) AS expected(name) EXCEPT SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'prescription_template_versions') THEN
    RAISE EXCEPTION 'Existing prescription_template_versions table is missing required columns';
  END IF;
END $migration$;

CREATE TABLE IF NOT EXISTS "template_version_approvals" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "status" "TemplateApprovalStatus" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "template_version_approvals_pkey" PRIMARY KEY ("id")
);

DO $migration$ BEGIN
  IF EXISTS (SELECT name FROM (VALUES ('id'), ('versionId'), ('reviewerId'), ('status'), ('note'), ('createdAt')) AS expected(name) EXCEPT SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'template_version_approvals') THEN
    RAISE EXCEPTION 'Existing template_version_approvals table is missing required columns';
  END IF;
END $migration$;

CREATE TABLE IF NOT EXISTS "clinic_assets" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "ownerId" TEXT,
    "type" "AssetType" NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "opacity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "scale" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "rotationDeg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "crop" TEXT,
    "placement" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinic_assets_pkey" PRIMARY KEY ("id")
);

DO $migration$ BEGIN
  IF EXISTS (SELECT name FROM (VALUES ('id'), ('branchId'), ('ownerId'), ('type'), ('name'), ('url'), ('opacity'), ('scale'), ('rotationDeg'), ('crop'), ('placement'), ('isActive'), ('createdAt'), ('updatedAt')) AS expected(name) EXCEPT SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'clinic_assets') THEN
    RAISE EXCEPTION 'Existing clinic_assets table is missing required columns';
  END IF;
END $migration$;

CREATE TABLE IF NOT EXISTS "printer_profiles" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "ownerId" TEXT,
    "name" TEXT NOT NULL,
    "paperPreset" TEXT NOT NULL DEFAULT 'A4',
    "topMarginPx" INTEGER NOT NULL DEFAULT 150,
    "leftMarginPx" INTEGER NOT NULL DEFAULT 45,
    "rightMarginPx" INTEGER NOT NULL DEFAULT 45,
    "bottomMarginPx" INTEGER NOT NULL DEFAULT 45,
    "contentOffsetXPx" INTEGER NOT NULL DEFAULT 0,
    "contentOffsetYPx" INTEGER NOT NULL DEFAULT 0,
    "grayscale" BOOLEAN NOT NULL DEFAULT false,
    "bleedSafeMm" INTEGER NOT NULL DEFAULT 0,
    "metadata" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "printer_profiles_pkey" PRIMARY KEY ("id")
);

DO $migration$ BEGIN
  IF EXISTS (SELECT name FROM (VALUES ('id'), ('branchId'), ('ownerId'), ('name'), ('paperPreset'), ('topMarginPx'), ('leftMarginPx'), ('rightMarginPx'), ('bottomMarginPx'), ('contentOffsetXPx'), ('contentOffsetYPx'), ('grayscale'), ('bleedSafeMm'), ('metadata'), ('isDefault'), ('createdAt'), ('updatedAt')) AS expected(name) EXCEPT SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'printer_profiles') THEN
    RAISE EXCEPTION 'Existing printer_profiles table is missing required columns';
  END IF;
END $migration$;

CREATE TABLE IF NOT EXISTS "prescription_print_events" (
    "id" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "channel" TEXT,
    "count" INTEGER NOT NULL DEFAULT 1,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prescription_print_events_pkey" PRIMARY KEY ("id")
);

DO $migration$ BEGIN
  IF EXISTS (SELECT name FROM (VALUES ('id'), ('prescriptionId'), ('eventType'), ('channel'), ('count'), ('metadata'), ('createdAt')) AS expected(name) EXCEPT SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'prescription_print_events') THEN
    RAISE EXCEPTION 'Existing prescription_print_events table is missing required columns';
  END IF;
END $migration$;

CREATE TABLE IF NOT EXISTS "template_usages" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "doctorId" TEXT,
    "prescriptionId" TEXT,
    "variant" TEXT,
    "alignmentDx" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "template_usages_pkey" PRIMARY KEY ("id")
);

DO $migration$ BEGIN
  IF EXISTS (SELECT name FROM (VALUES ('id'), ('templateId'), ('branchId'), ('doctorId'), ('prescriptionId'), ('variant'), ('alignmentDx'), ('createdAt')) AS expected(name) EXCEPT SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'template_usages') THEN
    RAISE EXCEPTION 'Existing template_usages table is missing required columns';
  END IF;
END $migration$;

CREATE TABLE IF NOT EXISTS "layout_experiments" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "layout_experiments_pkey" PRIMARY KEY ("id")
);

DO $migration$ BEGIN
  IF EXISTS (SELECT name FROM (VALUES ('id'), ('branchId'), ('key'), ('name'), ('description'), ('active'), ('createdAt'), ('updatedAt')) AS expected(name) EXCEPT SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'layout_experiments') THEN
    RAISE EXCEPTION 'Existing layout_experiments table is missing required columns';
  END IF;
END $migration$;

CREATE TABLE IF NOT EXISTS "layout_variants" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "type" "VariantType" NOT NULL DEFAULT 'VARIANT',
    "weight" INTEGER NOT NULL DEFAULT 1,
    "templateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "layout_variants_pkey" PRIMARY KEY ("id")
);

DO $migration$ BEGIN
  IF EXISTS (SELECT name FROM (VALUES ('id'), ('experimentId'), ('key'), ('type'), ('weight'), ('templateId'), ('createdAt')) AS expected(name) EXCEPT SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'layout_variants') THEN
    RAISE EXCEPTION 'Existing layout_variants table is missing required columns';
  END IF;
END $migration$;

CREATE TABLE IF NOT EXISTS "experiment_assignments" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "doctorId" TEXT,
    "patientId" TEXT,
    "variantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "experiment_assignments_pkey" PRIMARY KEY ("id")
);

DO $migration$ BEGIN
  IF EXISTS (SELECT name FROM (VALUES ('id'), ('experimentId'), ('doctorId'), ('patientId'), ('variantId'), ('createdAt')) AS expected(name) EXCEPT SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'experiment_assignments') THEN
    RAISE EXCEPTION 'Existing experiment_assignments table is missing required columns';
  END IF;
END $migration$;

CREATE TABLE IF NOT EXISTS "translation_memory_entries" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "sourceText" TEXT NOT NULL,
    "targetLanguage" "Language" NOT NULL,
    "targetText" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "translation_memory_entries_pkey" PRIMARY KEY ("id")
);

DO $migration$ BEGIN
  IF EXISTS (SELECT name FROM (VALUES ('id'), ('branchId'), ('fieldKey'), ('sourceText'), ('targetLanguage'), ('targetText'), ('confidence'), ('usageCount'), ('createdAt'), ('updatedAt')) AS expected(name) EXCEPT SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'translation_memory_entries') THEN
    RAISE EXCEPTION 'Existing translation_memory_entries table is missing required columns';
  END IF;
END $migration$;

CREATE TABLE IF NOT EXISTS "whatsapp_templates" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "ownerId" TEXT,
    "name" TEXT NOT NULL,
    "touchpoint" TEXT NOT NULL,
    "language" TEXT,
    "contentHtml" TEXT,
    "contentText" TEXT NOT NULL,
    "variables" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_templates_pkey" PRIMARY KEY ("id")
);

DO $migration$ BEGIN
  IF EXISTS (SELECT name FROM (VALUES ('id'), ('branchId'), ('ownerId'), ('name'), ('touchpoint'), ('language'), ('contentHtml'), ('contentText'), ('variables'), ('isActive'), ('createdAt'), ('updatedAt')) AS expected(name) EXCEPT SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'whatsapp_templates') THEN
    RAISE EXCEPTION 'Existing whatsapp_templates table is missing required columns';
  END IF;
END $migration$;

CREATE TABLE IF NOT EXISTS "number_sequences" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "periodKey" TEXT,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "number_sequences_pkey" PRIMARY KEY ("id")
);

DO $migration$ BEGIN
  IF EXISTS (SELECT name FROM (VALUES ('id'), ('type'), ('branchId'), ('periodKey'), ('lastNumber'), ('createdAt'), ('updatedAt')) AS expected(name) EXCEPT SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'number_sequences') THEN
    RAISE EXCEPTION 'Existing number_sequences table is missing required columns';
  END IF;
END $migration$;

CREATE INDEX IF NOT EXISTS "idempotency_records_userId_resourceType_resourceId_idx" ON "idempotency_records"("userId", "resourceType", "resourceId");

CREATE UNIQUE INDEX IF NOT EXISTS "idempotency_records_key_userId_resourceType_resourceId_meth_key" ON "idempotency_records"("key", "userId", "resourceType", "resourceId", "method");

CREATE INDEX IF NOT EXISTS "prescription_templates_branchId_idx" ON "prescription_templates"("branchId");

CREATE INDEX IF NOT EXISTS "prescription_templates_createdBy_idx" ON "prescription_templates"("createdBy");

CREATE INDEX IF NOT EXISTS "prescription_template_versions_status_idx" ON "prescription_template_versions"("status");

CREATE UNIQUE INDEX IF NOT EXISTS "prescription_template_versions_templateId_versionNumber_key" ON "prescription_template_versions"("templateId", "versionNumber");

CREATE INDEX IF NOT EXISTS "template_version_approvals_versionId_idx" ON "template_version_approvals"("versionId");

CREATE INDEX IF NOT EXISTS "template_version_approvals_reviewerId_idx" ON "template_version_approvals"("reviewerId");

CREATE INDEX IF NOT EXISTS "clinic_assets_branchId_idx" ON "clinic_assets"("branchId");

CREATE INDEX IF NOT EXISTS "clinic_assets_ownerId_idx" ON "clinic_assets"("ownerId");

CREATE INDEX IF NOT EXISTS "clinic_assets_type_idx" ON "clinic_assets"("type");

CREATE INDEX IF NOT EXISTS "printer_profiles_branchId_idx" ON "printer_profiles"("branchId");

CREATE INDEX IF NOT EXISTS "printer_profiles_ownerId_idx" ON "printer_profiles"("ownerId");

CREATE INDEX IF NOT EXISTS "prescription_print_events_prescriptionId_idx" ON "prescription_print_events"("prescriptionId");

CREATE INDEX IF NOT EXISTS "prescription_print_events_eventType_idx" ON "prescription_print_events"("eventType");

CREATE INDEX IF NOT EXISTS "template_usages_templateId_idx" ON "template_usages"("templateId");

CREATE INDEX IF NOT EXISTS "template_usages_branchId_idx" ON "template_usages"("branchId");

CREATE INDEX IF NOT EXISTS "template_usages_doctorId_idx" ON "template_usages"("doctorId");

CREATE UNIQUE INDEX IF NOT EXISTS "layout_experiments_branchId_key_key" ON "layout_experiments"("branchId", "key");

CREATE UNIQUE INDEX IF NOT EXISTS "layout_variants_experimentId_key_key" ON "layout_variants"("experimentId", "key");

CREATE INDEX IF NOT EXISTS "experiment_assignments_experimentId_idx" ON "experiment_assignments"("experimentId");

CREATE INDEX IF NOT EXISTS "experiment_assignments_doctorId_idx" ON "experiment_assignments"("doctorId");

CREATE INDEX IF NOT EXISTS "experiment_assignments_patientId_idx" ON "experiment_assignments"("patientId");

CREATE INDEX IF NOT EXISTS "translation_memory_entries_branchId_idx" ON "translation_memory_entries"("branchId");

CREATE INDEX IF NOT EXISTS "translation_memory_entries_fieldKey_idx" ON "translation_memory_entries"("fieldKey");

CREATE INDEX IF NOT EXISTS "translation_memory_entries_targetLanguage_idx" ON "translation_memory_entries"("targetLanguage");

CREATE UNIQUE INDEX IF NOT EXISTS "translation_memory_entries_branchId_fieldKey_sourceText_tar_key" ON "translation_memory_entries"("branchId", "fieldKey", "sourceText", "targetLanguage");

CREATE INDEX IF NOT EXISTS "whatsapp_templates_branchId_idx" ON "whatsapp_templates"("branchId");

CREATE INDEX IF NOT EXISTS "whatsapp_templates_ownerId_idx" ON "whatsapp_templates"("ownerId");

CREATE INDEX IF NOT EXISTS "whatsapp_templates_touchpoint_idx" ON "whatsapp_templates"("touchpoint");

CREATE UNIQUE INDEX IF NOT EXISTS "number_sequences_type_branchId_periodKey_key" ON "number_sequences"("type", "branchId", "periodKey");

CREATE INDEX IF NOT EXISTS "patients_isArchived_idx" ON "patients"("isArchived");

CREATE INDEX IF NOT EXISTS "pharmacy_invoices_createdAt_idx" ON "pharmacy_invoices"("createdAt");

CREATE INDEX IF NOT EXISTS "pharmacy_payments_createdAt_idx" ON "pharmacy_payments"("createdAt");

CREATE INDEX IF NOT EXISTS "visits_patientId_idx" ON "visits"("patientId");

CREATE INDEX IF NOT EXISTS "visits_doctorId_idx" ON "visits"("doctorId");

CREATE INDEX IF NOT EXISTS "visits_createdAt_idx" ON "visits"("createdAt");

CREATE INDEX IF NOT EXISTS "visits_appointmentId_idx" ON "visits"("appointmentId");

CREATE INDEX IF NOT EXISTS "visits_followUp_idx" ON "visits"("followUp");

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"prescription_templates"'::regclass AND conname = 'prescription_templates_branchId_fkey') THEN
    ALTER TABLE "prescription_templates" ADD CONSTRAINT "prescription_templates_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"prescription_templates"'::regclass AND conname = 'prescription_templates_createdBy_fkey') THEN
    ALTER TABLE "prescription_templates" ADD CONSTRAINT "prescription_templates_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"prescription_template_versions"'::regclass AND conname = 'prescription_template_versions_templateId_fkey') THEN
    ALTER TABLE "prescription_template_versions" ADD CONSTRAINT "prescription_template_versions_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "prescription_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"prescription_template_versions"'::regclass AND conname = 'prescription_template_versions_approvedBy_fkey') THEN
    ALTER TABLE "prescription_template_versions" ADD CONSTRAINT "prescription_template_versions_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"template_version_approvals"'::regclass AND conname = 'template_version_approvals_versionId_fkey') THEN
    ALTER TABLE "template_version_approvals" ADD CONSTRAINT "template_version_approvals_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "prescription_template_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"template_version_approvals"'::regclass AND conname = 'template_version_approvals_reviewerId_fkey') THEN
    ALTER TABLE "template_version_approvals" ADD CONSTRAINT "template_version_approvals_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"clinic_assets"'::regclass AND conname = 'clinic_assets_branchId_fkey') THEN
    ALTER TABLE "clinic_assets" ADD CONSTRAINT "clinic_assets_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"clinic_assets"'::regclass AND conname = 'clinic_assets_ownerId_fkey') THEN
    ALTER TABLE "clinic_assets" ADD CONSTRAINT "clinic_assets_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"printer_profiles"'::regclass AND conname = 'printer_profiles_branchId_fkey') THEN
    ALTER TABLE "printer_profiles" ADD CONSTRAINT "printer_profiles_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"printer_profiles"'::regclass AND conname = 'printer_profiles_ownerId_fkey') THEN
    ALTER TABLE "printer_profiles" ADD CONSTRAINT "printer_profiles_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"prescription_print_events"'::regclass AND conname = 'prescription_print_events_prescriptionId_fkey') THEN
    ALTER TABLE "prescription_print_events" ADD CONSTRAINT "prescription_print_events_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "prescriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"template_usages"'::regclass AND conname = 'template_usages_templateId_fkey') THEN
    ALTER TABLE "template_usages" ADD CONSTRAINT "template_usages_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "prescription_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"template_usages"'::regclass AND conname = 'template_usages_branchId_fkey') THEN
    ALTER TABLE "template_usages" ADD CONSTRAINT "template_usages_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"template_usages"'::regclass AND conname = 'template_usages_doctorId_fkey') THEN
    ALTER TABLE "template_usages" ADD CONSTRAINT "template_usages_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"template_usages"'::regclass AND conname = 'template_usages_prescriptionId_fkey') THEN
    ALTER TABLE "template_usages" ADD CONSTRAINT "template_usages_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "prescriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"layout_experiments"'::regclass AND conname = 'layout_experiments_branchId_fkey') THEN
    ALTER TABLE "layout_experiments" ADD CONSTRAINT "layout_experiments_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"layout_variants"'::regclass AND conname = 'layout_variants_experimentId_fkey') THEN
    ALTER TABLE "layout_variants" ADD CONSTRAINT "layout_variants_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "layout_experiments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"layout_variants"'::regclass AND conname = 'layout_variants_templateId_fkey') THEN
    ALTER TABLE "layout_variants" ADD CONSTRAINT "layout_variants_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "prescription_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"experiment_assignments"'::regclass AND conname = 'experiment_assignments_experimentId_fkey') THEN
    ALTER TABLE "experiment_assignments" ADD CONSTRAINT "experiment_assignments_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "layout_experiments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"experiment_assignments"'::regclass AND conname = 'experiment_assignments_doctorId_fkey') THEN
    ALTER TABLE "experiment_assignments" ADD CONSTRAINT "experiment_assignments_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"experiment_assignments"'::regclass AND conname = 'experiment_assignments_patientId_fkey') THEN
    ALTER TABLE "experiment_assignments" ADD CONSTRAINT "experiment_assignments_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"experiment_assignments"'::regclass AND conname = 'experiment_assignments_variantId_fkey') THEN
    ALTER TABLE "experiment_assignments" ADD CONSTRAINT "experiment_assignments_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "layout_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"translation_memory_entries"'::regclass AND conname = 'translation_memory_entries_branchId_fkey') THEN
    ALTER TABLE "translation_memory_entries" ADD CONSTRAINT "translation_memory_entries_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"whatsapp_templates"'::regclass AND conname = 'whatsapp_templates_ownerId_fkey') THEN
    ALTER TABLE "whatsapp_templates" ADD CONSTRAINT "whatsapp_templates_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"whatsapp_templates"'::regclass AND conname = 'whatsapp_templates_branchId_fkey') THEN
    ALTER TABLE "whatsapp_templates" ADD CONSTRAINT "whatsapp_templates_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $migration$;
