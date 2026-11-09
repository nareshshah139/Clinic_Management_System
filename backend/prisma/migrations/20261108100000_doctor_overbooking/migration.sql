-- Per-doctor overbooking limit. Existing users get 1, which keeps one patient per slot.
-- Guards keep this safe on databases already brought up to date with `prisma db push`.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "maxBookingsPerSlot" INTEGER NOT NULL DEFAULT 1;

DO $$ BEGIN
  ALTER TABLE "users" ADD CONSTRAINT "users_maxBookingsPerSlot_range" CHECK ("maxBookingsPerSlot" BETWEEN 1 AND 5);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
