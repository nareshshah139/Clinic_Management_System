-- CreateTable
CREATE TABLE "stock_predictions" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "drugId" TEXT NOT NULL,
    "predictionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "predictedQuantity" INTEGER NOT NULL,
    "currentStock" INTEGER NOT NULL,
    "averageMonthlyUsage" DOUBLE PRECISION NOT NULL,
    "trend" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidence" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "daysUntilStockout" INTEGER,
    "historicalData" JSONB,
    "reasoning" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_predictions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_predictions_branchId_idx" ON "stock_predictions"("branchId");

-- CreateIndex
CREATE INDEX "stock_predictions_drugId_idx" ON "stock_predictions"("drugId");

-- CreateIndex
CREATE INDEX "stock_predictions_predictionDate_idx" ON "stock_predictions"("predictionDate");

-- CreateIndex
CREATE INDEX "stock_predictions_confidence_idx" ON "stock_predictions"("confidence");

-- CreateIndex
CREATE INDEX "stock_predictions_branchId_predictionDate_idx" ON "stock_predictions"("branchId", "predictionDate");

