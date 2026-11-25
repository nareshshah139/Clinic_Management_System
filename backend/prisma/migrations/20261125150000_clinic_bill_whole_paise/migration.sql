-- Clinic bill money is kept in whole paise. GST bills saved before this kept fractions of a paisa,
-- so the total, received and balance shown could disagree by a paisa once each was rounded.
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
