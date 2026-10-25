-- Recovery is fail-closed across application versions. DDL waits for pre-existing writers.
ALTER TABLE "pharmacy_purchase_import_attempts" DROP CONSTRAINT "purchase_import_outcome";
-- statement-breakpoint
ALTER TABLE "pharmacy_purchase_import_attempts" ADD CONSTRAINT "purchase_import_outcome" CHECK (
 ("status" IN ('RUNNING', 'NO_STOCK_WRITTEN') AND "purchaseInvoiceId" IS NULL)
 OR ("status" = 'INVOICE_SAVED' AND "purchaseInvoiceId" IS NOT NULL)
 OR "status" = 'RETRY_REJECTED'
);
-- statement-breakpoint
-- Existing orphan links remain recoverable; new links and future deletes are constrained.
ALTER TABLE "pharmacy_purchase_import_attempts" ADD CONSTRAINT "pharmacy_purchase_import_attempts_purchaseInvoiceId_fkey"
 FOREIGN KEY ("purchaseInvoiceId") REFERENCES "pharmacy_purchase_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
-- statement-breakpoint
CREATE INDEX "pharmacy_purchase_import_attempts_branchId_status_idx" ON "pharmacy_purchase_import_attempts"("branchId", "status");
-- statement-breakpoint
CREATE FUNCTION purchase_recovery_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('purchase-recovery:' || NEW."branchId", 0));
 IF TG_TABLE_NAME = 'pharmacy_purchase_invoice_documents' THEN
  IF NEW."purchaseInvoiceId" IS NOT NULL AND EXISTS (
   SELECT 1 FROM "pharmacy_purchase_import_attempts" a WHERE a."branchId" = NEW."branchId" AND a.status = 'RETRY_REJECTED'
    AND (a.result->'rejectedSourceDocumentIds') ? NEW.id
  ) THEN RAISE EXCEPTION 'Original belongs to a rejected uncertain import; use inventory reconciliation' USING ERRCODE = '23514'; END IF;
 ELSE
  IF current_setting('app.purchase_recovery_protocol', true) IS DISTINCT FROM '2' THEN
   RAISE EXCEPTION 'Purchase worker predates durable recovery protocol; retry through the current application' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
   SELECT 1 FROM "pharmacy_purchase_import_attempts" a WHERE a."branchId" = NEW."branchId" AND a.status = 'RETRY_REJECTED'
    AND (a."purchaseInvoiceId" = NEW.id OR (a.result->'historicalInvoiceIds') ? NEW.id OR EXISTS (
     SELECT 1 FROM "pharmacy_purchase_invoice_documents" d WHERE d."purchaseInvoiceId" = NEW.id
      AND d."branchId" = NEW."branchId" AND (a.result->'rejectedSourceDocumentIds') ? d.id
    ))
  ) THEN RAISE EXCEPTION 'Uncertain receipt was rejected for further intake; use inventory reconciliation' USING ERRCODE = '23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
-- statement-breakpoint
CREATE TRIGGER purchase_recovery_create BEFORE INSERT ON "pharmacy_purchase_invoices"
 FOR EACH ROW EXECUTE FUNCTION purchase_recovery_guard();
-- statement-breakpoint
CREATE TRIGGER purchase_recovery_commit BEFORE UPDATE ON "pharmacy_purchase_invoices"
 FOR EACH ROW WHEN ((OLD."stockCommittedAt" IS NULL AND NEW."stockCommittedAt" IS NOT NULL)
 OR (OLD.status IS DISTINCT FROM 'STOCK_COMMITTED' AND NEW.status = 'STOCK_COMMITTED'))
 EXECUTE FUNCTION purchase_recovery_guard();
-- statement-breakpoint
CREATE TRIGGER purchase_recovery_link BEFORE INSERT OR UPDATE OF "purchaseInvoiceId" ON "pharmacy_purchase_invoice_documents"
 FOR EACH ROW EXECUTE FUNCTION purchase_recovery_guard();
