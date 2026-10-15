ALTER TABLE "partner_daily_sales" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "partner_daily_sale_items" ADD COLUMN "recoveryInventoryItemId" TEXT;
