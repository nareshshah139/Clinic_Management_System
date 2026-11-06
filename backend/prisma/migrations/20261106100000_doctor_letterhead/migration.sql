-- AssetType predates the migration history on deployed databases; fresh databases get it from db push.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AssetType') THEN
    ALTER TYPE "AssetType" ADD VALUE IF NOT EXISTS 'LETTERHEAD';
  END IF;
END $$;
