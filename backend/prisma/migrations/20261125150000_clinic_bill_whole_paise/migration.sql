-- Clinic bill money is kept in whole paise. GST bills saved before this kept fractions of a paisa,
-- so the total, received and balance shown could disagree by a paisa once each was rounded. Payment
-- rows are what was taken and are left as they are.

-- A bill whose balance was under half a paisa read as paid, so it stays paid at what it received.
UPDATE "new_invoices"
SET "total" = ROUND("received"::numeric, 2),
    "received" = ROUND("received"::numeric, 2),
    "balance" = 0
WHERE "status" <> 'CANCELLED'
  AND ABS("balance") < 0.005
  AND ("total" <> ROUND("received"::numeric, 2)::double precision
    OR "received" <> ROUND("received"::numeric, 2)::double precision
    OR "balance" <> 0);

UPDATE "new_invoices"
SET "balance" = ROUND("total"::numeric, 2) - ROUND("received"::numeric, 2)
WHERE ABS("balance" - ("total" - "received")) < 0.01
  AND "balance" <> (ROUND("total"::numeric, 2) - ROUND("received"::numeric, 2))::double precision;

UPDATE "new_invoices"
SET "total" = ROUND("total"::numeric, 2),
    "received" = ROUND("received"::numeric, 2),
    "balance" = ROUND("balance"::numeric, 2)
WHERE "total" <> ROUND("total"::numeric, 2)::double precision
   OR "received" <> ROUND("received"::numeric, 2)::double precision
   OR "balance" <> ROUND("balance"::numeric, 2)::double precision;
