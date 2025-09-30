import { Controller, Get, Post, Body, Query, UseGuards, Req } from '@nestjs/common';
import { StockPredictionService } from './stock-prediction.service';
import {
  StockPredictionRequestDto,
  StockPredictionResponseDto,
  BulkOrderSuggestionDto,
} from './dto/stock-prediction.dto';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { Roles } from '../../shared/decorators/roles.decorator';

@Controller('stock-prediction')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StockPredictionController {
  constructor(private readonly stockPredictionService: StockPredictionService) {}

  /**
   * GET /stock-prediction/predictions
   * Generate stock predictions for the current branch
   */
  @Get('predictions')
  @Roles('OWNER', 'ADMIN', 'MANAGER', 'PHARMACIST')
  async getPredictions(
    @Req() req: any,
    @Query('monthsAhead') monthsAhead?: string,
    @Query('includeInactive') includeInactive?: string,
    @Query('categories') categories?: string,
    @Query('onlyLowStock') onlyLowStock?: string,
  ): Promise<StockPredictionResponseDto> {
    const branchId = req.user.branchId;

    const request: StockPredictionRequestDto = {
      branchId,
      monthsAhead: monthsAhead ? parseInt(monthsAhead, 10) : 1,
      includeInactive: includeInactive === 'true',
      categories: categories ? categories.split(',').filter(Boolean) : undefined,
      onlyLowStock: onlyLowStock === 'true',
    };

    return this.stockPredictionService.generatePredictions(request);
  }

  /**
   * POST /stock-prediction/predictions
   * Generate predictions with custom parameters (POST version for complex filters)
   */
  @Post('predictions')
  @Roles('OWNER', 'ADMIN', 'MANAGER', 'PHARMACIST')
  async postPredictions(
    @Req() req: any,
    @Body() body: Partial<StockPredictionRequestDto>,
  ): Promise<StockPredictionResponseDto> {
    const branchId = req.user.branchId;

    const request: StockPredictionRequestDto = {
      branchId,
      monthsAhead: body.monthsAhead || 1,
      includeInactive: body.includeInactive || false,
      categories: body.categories,
      onlyLowStock: body.onlyLowStock || false,
    };

    return this.stockPredictionService.generatePredictions(request);
  }

  /**
   * GET /stock-prediction/bulk-order
   * Generate a bulk order suggestion based on predictions
   */
  @Get('bulk-order')
  @Roles('OWNER', 'ADMIN', 'MANAGER', 'PHARMACIST')
  async getBulkOrderSuggestion(
    @Req() req: any,
    @Query('monthsAhead') monthsAhead?: string,
  ): Promise<BulkOrderSuggestionDto> {
    const branchId = req.user.branchId;

    const request: StockPredictionRequestDto = {
      branchId,
      monthsAhead: monthsAhead ? parseInt(monthsAhead, 10) : 1,
    };

    const predictions = await this.stockPredictionService.generatePredictions(request);
    return this.stockPredictionService.generateBulkOrderSuggestion(
      branchId,
      predictions.predictions,
    );
  }

  /**
   * GET /stock-prediction/critical-items
   * Get items that are critically low or will stock out soon
   */
  @Get('critical-items')
  @Roles('OWNER', 'ADMIN', 'MANAGER', 'PHARMACIST')
  async getCriticalItems(@Req() req: any) {
    const branchId = req.user.branchId;

    const predictions = await this.stockPredictionService.generatePredictions({
      branchId,
      monthsAhead: 1,
      onlyLowStock: false,
    });

    // Filter for critical items (stock out in < 7 days or below reorder level)
    const criticalItems = predictions.predictions.filter((pred) => {
      return (
        (pred.daysUntilStockout && pred.daysUntilStockout < 7) ||
        (pred.reorderLevel && pred.currentStock <= pred.reorderLevel)
      );
    });

    return {
      branchId,
      totalCriticalItems: criticalItems.length,
      items: criticalItems,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * GET /stock-prediction/trends
   * Get trending items (increasing or decreasing usage)
   */
  @Get('trends')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  async getTrends(@Req() req: any, @Query('direction') direction?: 'increasing' | 'decreasing') {
    const branchId = req.user.branchId;

    const predictions = await this.stockPredictionService.generatePredictions({
      branchId,
      monthsAhead: 1,
    });

    let filteredPredictions = predictions.predictions;

    if (direction === 'increasing') {
      filteredPredictions = filteredPredictions.filter((pred) => pred.trend > 0.1);
    } else if (direction === 'decreasing') {
      filteredPredictions = filteredPredictions.filter((pred) => pred.trend < -0.1);
    }

    // Sort by absolute trend value
    filteredPredictions.sort((a, b) => Math.abs(b.trend) - Math.abs(a.trend));

    return {
      branchId,
      direction: direction || 'all',
      totalItems: filteredPredictions.length,
      items: filteredPredictions.slice(0, 20), // Top 20
      generatedAt: new Date().toISOString(),
    };
  }
}

