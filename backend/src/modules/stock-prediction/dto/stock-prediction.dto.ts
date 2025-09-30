import { IsString, IsOptional, IsInt, IsNumber, IsArray, IsEnum, IsBoolean } from 'class-validator';

export enum PredictionConfidence {
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
  COLD_START = 'COLD_START'
}

export enum PredictionMethod {
  TIME_SERIES = 'TIME_SERIES',
  SIMILAR_ITEMS = 'SIMILAR_ITEMS',
  CATEGORY_AVERAGE = 'CATEGORY_AVERAGE',
  MANUAL_RULE = 'MANUAL_RULE'
}

export class DrugPredictionDto {
  @IsString()
  drugId: string;

  @IsString()
  drugName: string;

  @IsInt()
  predictedQuantity: number;

  @IsInt()
  currentStock: number;

  @IsNumber()
  averageMonthlyUsage: number;

  @IsNumber()
  trend: number; // -1 to 1, negative = decreasing, positive = increasing

  @IsEnum(PredictionConfidence)
  confidence: PredictionConfidence;

  @IsEnum(PredictionMethod)
  method: PredictionMethod;

  @IsNumber()
  @IsOptional()
  reorderLevel?: number;

  @IsNumber()
  @IsOptional()
  daysUntilStockout?: number;

  @IsArray()
  @IsOptional()
  historicalData?: { month: string; quantity: number }[];

  @IsString()
  @IsOptional()
  reasoning?: string;
}

export class StockPredictionRequestDto {
  @IsString()
  branchId: string;

  @IsOptional()
  @IsInt()
  monthsAhead?: number = 1; // How many months to predict ahead

  @IsOptional()
  @IsBoolean()
  includeInactive?: boolean = false;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categories?: string[];

  @IsOptional()
  @IsBoolean()
  onlyLowStock?: boolean = false;
}

export class StockPredictionResponseDto {
  @IsString()
  branchId: string;

  @IsString()
  predictionDate: string;

  @IsInt()
  totalDrugsAnalyzed: number;

  @IsInt()
  highConfidencePredictions: number;

  @IsInt()
  coldStartItems: number;

  @IsArray()
  predictions: DrugPredictionDto[];

  @IsOptional()
  summary?: {
    totalPredictedOrders: number;
    estimatedCost: number;
    criticalItems: number;
  };
}

export class BulkOrderSuggestionDto {
  @IsArray()
  items: {
    drugId: string;
    drugName: string;
    suggestedQuantity: number;
    currentStock: number;
    unitPrice: number;
    totalCost: number;
    priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  }[];

  @IsNumber()
  totalEstimatedCost: number;

  @IsString()
  generatedAt: string;
}

