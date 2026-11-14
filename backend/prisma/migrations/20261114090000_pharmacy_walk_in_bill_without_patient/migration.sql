-- A walk-in sale names its customer on the bill and links no patient. Existing rows are unchanged.
ALTER TABLE "pharmacy_invoices" ALTER COLUMN "patientId" DROP NOT NULL;
