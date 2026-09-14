ALTER TABLE "pharmacy_purchase_invoice_documents" ADD COLUMN "sourceMap" JSONB;
ALTER TABLE "pharmacy_purchase_invoice_items" ADD COLUMN "ocrSourceRef" TEXT;
