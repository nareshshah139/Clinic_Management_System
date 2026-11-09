CREATE INDEX "stock_transactions_branch_created_timeline_idx" ON "stock_transactions"("branchId", "createdAt" DESC, "id" DESC);
