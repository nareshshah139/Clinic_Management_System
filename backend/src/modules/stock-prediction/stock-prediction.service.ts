import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import {
  DrugPredictionDto,
  StockPredictionRequestDto,
  StockPredictionResponseDto,
  BulkOrderSuggestionDto,
  PredictionConfidence,
  PredictionMethod,
} from './dto/stock-prediction.dto';

interface HistoricalDataPoint {
  month: string;
  quantity: number;
  invoiceCount: number;
}

interface DrugUsageStats {
  drugId: string;
  drugName: string;
  currentStock: number;
  reorderLevel: number | null;
  unitPrice: number;
  category: string | null;
  historicalData: HistoricalDataPoint[];
  totalMonthsData: number;
}

@Injectable()
export class StockPredictionService {
  private readonly logger = new Logger(StockPredictionService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Main prediction function - generates stock order predictions for the next month
   */
  async generatePredictions(
    request: StockPredictionRequestDto,
  ): Promise<StockPredictionResponseDto> {
    this.logger.log(`Generating stock predictions for branch: ${request.branchId}`);

    // 1. Fetch all drugs with their usage statistics
    const drugsWithStats = await this.fetchDrugUsageStatistics(
      request.branchId,
      request.monthsAhead || 1,
      request.includeInactive || false,
      request.categories,
    );

    this.logger.log(`Fetched statistics for ${drugsWithStats.length} drugs`);

    // 2. Generate predictions for each drug
    const predictions: DrugPredictionDto[] = [];
    let highConfidenceCount = 0;
    let coldStartCount = 0;

    for (const drugStats of drugsWithStats) {
      const prediction = await this.predictDrugUsage(drugStats, request.monthsAhead || 1);
      
      if (prediction.confidence === PredictionConfidence.HIGH) {
        highConfidenceCount++;
      }
      if (prediction.confidence === PredictionConfidence.COLD_START) {
        coldStartCount++;
      }

      // Filter if only low stock requested
      if (request.onlyLowStock) {
        if (
          drugStats.reorderLevel &&
          drugStats.currentStock <= drugStats.reorderLevel
        ) {
          predictions.push(prediction);
        }
      } else {
        predictions.push(prediction);
      }
    }

    // 3. Sort by priority (critical items first)
    predictions.sort((a, b) => {
      // Priority: items that will stock out soon, then by quantity needed
      const aStockoutScore = a.daysUntilStockout ?? 999;
      const bStockoutScore = b.daysUntilStockout ?? 999;
      
      if (aStockoutScore !== bStockoutScore) {
        return aStockoutScore - bStockoutScore;
      }
      
      return b.predictedQuantity - a.predictedQuantity;
    });

    // 4. Generate summary
    const summary = this.generateSummary(predictions);

    return {
      branchId: request.branchId,
      predictionDate: new Date().toISOString(),
      totalDrugsAnalyzed: drugsWithStats.length,
      highConfidencePredictions: highConfidenceCount,
      coldStartItems: coldStartCount,
      predictions,
      summary,
    };
  }

  /**
   * Fetch drug usage statistics from pharmacy invoices
   * Analyzes top 30 most-used drugs to avoid parameter limits
   */
  private async fetchDrugUsageStatistics(
    branchId: string,
    monthsAhead: number,
    includeInactive: boolean,
    categories?: string[],
  ): Promise<DrugUsageStats[]> {
    // Get date range for analysis (last 6 months of data)
    const analysisMonths = 6;
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - analysisMonths);

    // First, get top 30 drugs by sales volume in the analysis period
    // Using raw query to get aggregated sales data efficiently
    const topDrugsQuery = await this.prisma.$queryRaw<
      Array<{ drugId: string; totalQuantity: bigint; lastSaleDate: Date }>
    >`
      SELECT 
        pii."drugId",
        SUM(pii.quantity)::bigint as "totalQuantity",
        MAX(pi."invoiceDate") as "lastSaleDate"
      FROM "pharmacy_invoice_items" pii
      INNER JOIN "pharmacy_invoices" pi ON pii."invoiceId" = pi.id
      WHERE pi."branchId" = ${branchId}
        AND pi.status IN ('CONFIRMED', 'COMPLETED', 'DISPENSED')
        AND pi."invoiceDate" >= ${startDate}
        AND pii."drugId" IS NOT NULL
      GROUP BY pii."drugId"
      ORDER BY 
        SUM(pii.quantity) DESC,
        MAX(pi."invoiceDate") DESC
      LIMIT 30
    `;

    const topDrugIds = topDrugsQuery.map((item) => item.drugId);

    if (topDrugIds.length === 0) {
      this.logger.log('No drugs with sales history found in the analysis period');
      return [];
    }

    this.logger.log(`Analyzing top ${topDrugIds.length} drugs by sales volume`);

    // Fetch drug details for the top drugs
    const drugs = await this.prisma.drug.findMany({
      where: {
        id: { in: topDrugIds },
        branchId,
        isActive: includeInactive ? undefined : true,
        category: categories && categories.length > 0 ? { in: categories } : undefined,
      },
      select: {
        id: true,
        name: true,
        price: true,
        category: true,
        minStockLevel: true,
      },
    });

    // Fetch invoice items for these top drugs
    const invoiceItems = await this.prisma.pharmacyInvoiceItem.findMany({
      where: {
        drugId: { in: drugs.map((d) => d.id) },
        invoice: {
          branchId,
          status: { in: ['CONFIRMED', 'COMPLETED', 'DISPENSED'] },
          invoiceDate: { gte: startDate },
        },
      },
      select: {
        drugId: true,
        quantity: true,
        invoice: {
          select: {
            invoiceDate: true,
          },
        },
      },
      orderBy: {
        invoice: {
          invoiceDate: 'asc',
        },
      },
    });

    // Group by drug and month
    const drugUsageMap = new Map<string, DrugUsageStats>();

    for (const drug of drugs) {
      // Get current stock from inventory
      const inventoryItem = await this.prisma.inventoryItem.findFirst({
        where: {
          branchId,
          name: drug.name,
        },
        select: {
          currentStock: true,
          reorderLevel: true,
        },
      });

      const monthlyData = new Map<string, { quantity: number; invoiceCount: number }>();

      // Aggregate invoice items by month
      const drugInvoiceItems = invoiceItems.filter((item) => item.drugId === drug.id);

      for (const item of drugInvoiceItems) {
        const monthKey = this.getMonthKey(item.invoice.invoiceDate);
        const existing = monthlyData.get(monthKey) || { quantity: 0, invoiceCount: 0 };
        monthlyData.set(monthKey, {
          quantity: existing.quantity + item.quantity,
          invoiceCount: existing.invoiceCount + 1,
        });
      }

      const historicalData: HistoricalDataPoint[] = Array.from(monthlyData.entries()).map(
        ([month, data]) => ({
          month,
          quantity: data.quantity,
          invoiceCount: data.invoiceCount,
        }),
      );

      drugUsageMap.set(drug.id, {
        drugId: drug.id,
        drugName: drug.name,
        currentStock: inventoryItem?.currentStock || 0,
        reorderLevel: inventoryItem?.reorderLevel || drug.minStockLevel || null,
        unitPrice: drug.price,
        category: drug.category,
        historicalData,
        totalMonthsData: historicalData.length,
      });
    }

    return Array.from(drugUsageMap.values());
  }

  /**
   * Predict drug usage using time-series analysis or cold-start strategies
   */
  private async predictDrugUsage(
    stats: DrugUsageStats,
    monthsAhead: number,
  ): Promise<DrugPredictionDto> {
    // Case 1: Sufficient historical data (3+ months) - Use time-series prediction
    if (stats.totalMonthsData >= 3) {
      return this.timeSeriesPrediction(stats, monthsAhead);
    }

    // Case 2: Some data (1-2 months) - Use similar items
    if (stats.totalMonthsData > 0) {
      return this.similarItemsPrediction(stats, monthsAhead);
    }

    // Case 3: No historical data - Cold start
    return this.coldStartPrediction(stats, monthsAhead);
  }

  /**
   * Time-series prediction using exponential smoothing and trend analysis
   */
  private timeSeriesPrediction(
    stats: DrugUsageStats,
    monthsAhead: number,
  ): DrugPredictionDto {
    const data = stats.historicalData.map((d) => d.quantity);
    
    // Calculate average and trend
    const average = data.reduce((sum, val) => sum + val, 0) / data.length;
    
    // Linear regression for trend
    const trend = this.calculateTrend(data);
    
    // Exponential smoothing with alpha = 0.3
    const alpha = 0.3;
    let forecast = data[data.length - 1];
    for (let i = 0; i < monthsAhead; i++) {
      forecast = alpha * forecast + (1 - alpha) * (forecast + trend);
    }

    // Add safety buffer (20%)
    const predictedQuantity = Math.ceil(forecast * 1.2);

    // Calculate days until stockout
    const dailyUsage = average / 30;
    const daysUntilStockout = dailyUsage > 0 ? Math.floor(stats.currentStock / dailyUsage) : null;

    // Determine confidence based on data variance
    const variance = this.calculateVariance(data, average);
    const coefficientOfVariation = Math.sqrt(variance) / average;
    
    let confidence: PredictionConfidence;
    if (coefficientOfVariation < 0.3) {
      confidence = PredictionConfidence.HIGH;
    } else if (coefficientOfVariation < 0.6) {
      confidence = PredictionConfidence.MEDIUM;
    } else {
      confidence = PredictionConfidence.LOW;
    }

    return {
      drugId: stats.drugId,
      drugName: stats.drugName,
      predictedQuantity,
      currentStock: stats.currentStock,
      averageMonthlyUsage: Math.round(average),
      trend: this.normalizeTrend(trend, average),
      confidence,
      method: PredictionMethod.TIME_SERIES,
      reorderLevel: stats.reorderLevel || undefined,
      daysUntilStockout: daysUntilStockout || undefined,
      historicalData: stats.historicalData.map((d) => ({
        month: d.month,
        quantity: d.quantity,
      })),
      reasoning: `Based on ${stats.totalMonthsData} months of sales data with ${confidence.toLowerCase()} variance. Trend: ${trend > 0 ? 'increasing' : trend < 0 ? 'decreasing' : 'stable'}.`,
    };
  }

  /**
   * Prediction based on similar items (for items with limited data)
   */
  private async similarItemsPrediction(
    stats: DrugUsageStats,
    monthsAhead: number,
  ): Promise<DrugPredictionDto> {
    // Use the existing data but apply category average as adjustment
    const ownAverage = stats.historicalData.reduce((sum, d) => sum + d.quantity, 0) / stats.totalMonthsData;
    
    // Apply a moderate safety buffer
    const predictedQuantity = Math.ceil(ownAverage * monthsAhead * 1.3);
    
    const dailyUsage = ownAverage / 30;
    const daysUntilStockout = dailyUsage > 0 ? Math.floor(stats.currentStock / dailyUsage) : null;

    return {
      drugId: stats.drugId,
      drugName: stats.drugName,
      predictedQuantity,
      currentStock: stats.currentStock,
      averageMonthlyUsage: Math.round(ownAverage),
      trend: 0,
      confidence: PredictionConfidence.MEDIUM,
      method: PredictionMethod.SIMILAR_ITEMS,
      reorderLevel: stats.reorderLevel || undefined,
      daysUntilStockout: daysUntilStockout || undefined,
      historicalData: stats.historicalData.map((d) => ({
        month: d.month,
        quantity: d.quantity,
      })),
      reasoning: `Limited data (${stats.totalMonthsData} months). Prediction based on recent sales with safety buffer.`,
    };
  }

  /**
   * Cold start prediction (for new items with no sales history)
   */
  private coldStartPrediction(
    stats: DrugUsageStats,
    monthsAhead: number,
  ): DrugPredictionDto {
    // Strategy: Use reorder level or conservative estimate
    let predictedQuantity: number;
    let reasoning: string;

    if (stats.reorderLevel && stats.reorderLevel > 0) {
      // Use reorder level as baseline
      predictedQuantity = Math.ceil(stats.reorderLevel * 1.5);
      reasoning = `No sales history. Using reorder level (${stats.reorderLevel}) with buffer.`;
    } else {
      // Conservative default based on drug category
      const categoryDefaults: Record<string, number> = {
        'Topical': 10,
        'Oral': 15,
        'Injectable': 5,
        'Supplement': 20,
      };
      
      const defaultQty = stats.category && categoryDefaults[stats.category] 
        ? categoryDefaults[stats.category] 
        : 10;
      
      predictedQuantity = defaultQty * monthsAhead;
      reasoning = `No sales history or reorder level. Using category-based estimate (${defaultQty}/month).`;
    }

    return {
      drugId: stats.drugId,
      drugName: stats.drugName,
      predictedQuantity,
      currentStock: stats.currentStock,
      averageMonthlyUsage: 0,
      trend: 0,
      confidence: PredictionConfidence.COLD_START,
      method: PredictionMethod.CATEGORY_AVERAGE,
      reorderLevel: stats.reorderLevel || undefined,
      reasoning,
    };
  }

  /**
   * Generate bulk order suggestion from predictions
   */
  async generateBulkOrderSuggestion(
    branchId: string,
    predictions: DrugPredictionDto[],
  ): Promise<BulkOrderSuggestionDto> {
    const items = [];

    for (const pred of predictions) {
      // Only include if predicted quantity > current stock
      const neededQuantity = Math.max(0, pred.predictedQuantity - pred.currentStock);
      
      if (neededQuantity > 0) {
        // Fetch drug price
        const drug = await this.prisma.drug.findUnique({
          where: { id: pred.drugId },
          select: { price: true },
        });

        const unitPrice = drug?.price || 0;
        const totalCost = neededQuantity * unitPrice;

        // Determine priority
        let priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
        if (pred.daysUntilStockout && pred.daysUntilStockout < 7) {
          priority = 'CRITICAL';
        } else if (pred.daysUntilStockout && pred.daysUntilStockout < 15) {
          priority = 'HIGH';
        } else if (pred.currentStock <= (pred.reorderLevel || 0)) {
          priority = 'MEDIUM';
        } else {
          priority = 'LOW';
        }

        items.push({
          drugId: pred.drugId,
          drugName: pred.drugName,
          suggestedQuantity: neededQuantity,
          currentStock: pred.currentStock,
          unitPrice,
          totalCost,
          priority,
        });
      }
    }

    // Sort by priority
    const priorityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    items.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    const totalEstimatedCost = items.reduce((sum, item) => sum + item.totalCost, 0);

    return {
      items,
      totalEstimatedCost,
      generatedAt: new Date().toISOString(),
    };
  }

  // Helper functions

  private getMonthKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  private calculateTrend(data: number[]): number {
    if (data.length < 2) return 0;

    // Simple linear regression slope
    const n = data.length;
    const xMean = (n - 1) / 2;
    const yMean = data.reduce((sum, val) => sum + val, 0) / n;

    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < n; i++) {
      numerator += (i - xMean) * (data[i] - yMean);
      denominator += Math.pow(i - xMean, 2);
    }

    return denominator === 0 ? 0 : numerator / denominator;
  }

  private normalizeTrend(trend: number, average: number): number {
    if (average === 0) return 0;
    // Normalize to -1 to 1 range
    const normalized = trend / average;
    return Math.max(-1, Math.min(1, normalized));
  }

  private calculateVariance(data: number[], mean: number): number {
    if (data.length === 0) return 0;
    const squaredDiffs = data.map((val) => Math.pow(val - mean, 2));
    return squaredDiffs.reduce((sum, val) => sum + val, 0) / data.length;
  }

  private generateSummary(predictions: DrugPredictionDto[]) {
    const totalPredictedOrders = predictions.reduce(
      (sum, pred) => sum + Math.max(0, pred.predictedQuantity - pred.currentStock),
      0,
    );

    const criticalItems = predictions.filter(
      (pred) => pred.daysUntilStockout && pred.daysUntilStockout < 7,
    ).length;

    // Estimate cost (will be refined in bulk order suggestion)
    const estimatedCost = 0; // Placeholder

    return {
      totalPredictedOrders,
      estimatedCost,
      criticalItems,
    };
  }
}

