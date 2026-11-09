-- CR-33: what staff counted at the end of a clinic day, per payment mode. Rows are only ever added;
-- a recount takes the next sequence, and the unique key rejects two recounts racing on one sequence.
CREATE TABLE IF NOT EXISTS "pharmacy_cash_counts" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "day" VARCHAR(10) NOT NULL,
    "sequence" INTEGER NOT NULL,
    "counted" JSONB NOT NULL,
    "note" TEXT,
    "countedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pharmacy_cash_counts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "pharmacy_cash_counts_branchId_day_sequence_key" ON "pharmacy_cash_counts"("branchId", "day", "sequence");
CREATE INDEX IF NOT EXISTS "pharmacy_cash_counts_branchId_day_idx" ON "pharmacy_cash_counts"("branchId", "day");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pharmacy_cash_counts_branchId_fkey') THEN
    ALTER TABLE "pharmacy_cash_counts" ADD CONSTRAINT "pharmacy_cash_counts_branchId_fkey"
      FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
