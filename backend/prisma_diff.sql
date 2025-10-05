-- Optional performance indexes beyond Prisma @@index (requires Postgres extensions)
-- Enable pg_trgm for efficient ILIKE/contains searches on large text
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Visits text search GIN indexes (complaints, diagnosis, plan)
CREATE INDEX IF NOT EXISTS visits_complaints_trgm_idx ON visits USING gin (complaints gin_trgm_ops);
CREATE INDEX IF NOT EXISTS visits_diagnosis_trgm_idx ON visits USING gin (diagnosis gin_trgm_ops);
CREATE INDEX IF NOT EXISTS visits_plan_trgm_idx ON visits USING gin (plan gin_trgm_ops);

-- Pharmacy invoices common search fields (use snake_case column names)
CREATE INDEX IF NOT EXISTS pharmacy_invoices_invoice_number_trgm_idx ON pharmacy_invoices USING gin ("invoiceNumber" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS pharmacy_invoices_billing_name_trgm_idx ON pharmacy_invoices USING gin ("billingName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS pharmacy_invoices_billing_phone_trgm_idx ON pharmacy_invoices USING gin ("billingPhone" gin_trgm_ops);

-- Payments date/status composite for reporting (use snake_case column names)
CREATE INDEX IF NOT EXISTS pharmacy_payments_status_payment_date_idx ON pharmacy_payments (status, "paymentDate" DESC);


