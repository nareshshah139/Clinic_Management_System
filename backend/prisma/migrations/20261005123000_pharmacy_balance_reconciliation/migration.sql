BEGIN;
LOCK TABLE "pharmacy_invoices" IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE "pharmacy_payments" IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE overpaid_count integer;
BEGIN
  SELECT count(*) INTO overpaid_count
  FROM "pharmacy_invoices" invoice
  WHERE round(invoice."totalAmount"::numeric, 2) < (
    SELECT round(COALESCE(sum(payment.amount), 0)::numeric, 2)
    FROM "pharmacy_payments" payment
    WHERE payment."invoiceId" = invoice.id AND payment.status = 'COMPLETED'
  );
  IF overpaid_count > 0 THEN
    RAISE EXCEPTION 'Pharmacy balance reconciliation stopped: % invoices have completed payments exceeding the total. Review receipts before retrying.', overpaid_count;
  END IF;
END $$;

WITH balances AS (
  SELECT invoice.id,
    round(COALESCE(sum(payment.amount), 0)::numeric, 2) AS paid,
    round(invoice."totalAmount"::numeric, 2) - round(COALESCE(sum(payment.amount), 0)::numeric, 2) AS balance
  FROM "pharmacy_invoices" invoice
  LEFT JOIN "pharmacy_payments" payment ON payment."invoiceId" = invoice.id AND payment.status = 'COMPLETED'
  GROUP BY invoice.id
)
UPDATE "pharmacy_invoices" invoice
SET "paidAmount" = balances.paid,
    "balanceAmount" = balances.balance,
    "paymentStatus" = CASE
      WHEN balances.balance = 0 THEN 'COMPLETED'::"PharmacyPaymentStatus"
      WHEN balances.paid > 0 THEN 'PARTIALLY_PAID'::"PharmacyPaymentStatus"
      ELSE 'PENDING'::"PharmacyPaymentStatus"
    END
FROM balances
WHERE invoice.id = balances.id
  AND (invoice."paidAmount" IS DISTINCT FROM balances.paid::double precision
    OR invoice."balanceAmount" IS DISTINCT FROM balances.balance::double precision
    OR invoice."paymentStatus"::text IS DISTINCT FROM CASE
      WHEN balances.balance = 0 THEN 'COMPLETED'
      WHEN balances.paid > 0 THEN 'PARTIALLY_PAID'
      ELSE 'PENDING' END);
COMMIT;
