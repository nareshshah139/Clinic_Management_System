# Stock Prediction Module

## Overview

The Stock Prediction Module provides AI-powered inventory forecasting based on historical pharmacy invoice data. It uses time-series analysis and smart cold-start strategies to predict stock requirements for the upcoming month(s).

## Features

### 1. **Time-Series Prediction**
- Analyzes 6 months of historical sales data
- Uses exponential smoothing and linear regression
- Calculates trends and variance
- Provides confidence levels (HIGH, MEDIUM, LOW)

### 2. **Smart Cold Start**
For drugs with limited or no historical data:
- Uses reorder levels as baseline
- Falls back to category-based estimates
- Provides conservative predictions with safety buffers

### 3. **Prediction Methods**
- **TIME_SERIES**: 3+ months of data, high confidence
- **SIMILAR_ITEMS**: 1-2 months of data, medium confidence
- **CATEGORY_AVERAGE**: No data, uses category defaults
- **MANUAL_RULE**: Custom rules (extensible)

### 4. **Critical Item Detection**
- Identifies items that will stock out soon
- Flags items below reorder level
- Prioritizes urgent orders

### 5. **Bulk Order Generation**
- Creates purchase order suggestions
- Calculates total costs
- Prioritizes by urgency (CRITICAL, HIGH, MEDIUM, LOW)
- Exports to CSV for procurement

## API Endpoints

### GET `/stock-prediction/predictions`
Generate stock predictions for the current branch.

**Query Parameters:**
- `monthsAhead` (optional, default: 1): Number of months to predict
- `includeInactive` (optional, default: false): Include inactive drugs
- `categories` (optional): Comma-separated category list
- `onlyLowStock` (optional, default: false): Only show low stock items

**Response:**
```json
{
  "branchId": "branch123",
  "predictionDate": "2025-09-30T...",
  "totalDrugsAnalyzed": 150,
  "highConfidencePredictions": 120,
  "coldStartItems": 15,
  "predictions": [
    {
      "drugId": "drug123",
      "drugName": "Azithromycin 500mg",
      "predictedQuantity": 50,
      "currentStock": 20,
      "averageMonthlyUsage": 45,
      "trend": 0.12,
      "confidence": "HIGH",
      "method": "TIME_SERIES",
      "reorderLevel": 30,
      "daysUntilStockout": 13,
      "historicalData": [...],
      "reasoning": "Based on 6 months of sales data..."
    }
  ],
  "summary": {
    "totalPredictedOrders": 1250,
    "estimatedCost": 45000,
    "criticalItems": 8
  }
}
```

### GET `/stock-prediction/bulk-order`
Generate bulk order suggestion.

**Query Parameters:**
- `monthsAhead` (optional, default: 1)

**Response:**
```json
{
  "items": [
    {
      "drugId": "drug123",
      "drugName": "Azithromycin 500mg",
      "suggestedQuantity": 30,
      "currentStock": 20,
      "unitPrice": 125.50,
      "totalCost": 3765.00,
      "priority": "HIGH"
    }
  ],
  "totalEstimatedCost": 45000,
  "generatedAt": "2025-09-30T..."
}
```

### GET `/stock-prediction/critical-items`
Get items that need immediate attention.

### GET `/stock-prediction/trends`
Get trending items (increasing/decreasing usage).

**Query Parameters:**
- `direction` (optional): "increasing" | "decreasing" | "all"

## Algorithm Details

### Top 30 Drug Selection

To avoid database query limits and focus on the most impactful predictions, the system analyzes only the **top 30 drugs by sales volume** in the analysis period (last 6 months).

**Tie-Breaking Logic:**
1. **Primary**: Total quantity sold (descending)
2. **Secondary**: Most recent sale date (prefer actively sold items)
3. **Tertiary**: SQL row order (consistent ordering)

This ensures:
- Fast query performance
- Focus on high-value items
- Consistent results across runs
- Avoids PostgreSQL's 32,767 parameter limit

### Time-Series Forecasting

1. **Data Collection**: Aggregates invoice items by month for past 6 months
2. **Trend Analysis**: Linear regression to detect increasing/decreasing usage
3. **Exponential Smoothing**: Alpha = 0.3 for weighted forecast
4. **Safety Buffer**: 20% added to prediction
5. **Confidence Calculation**: Based on coefficient of variation
   - CV < 0.3 → HIGH confidence
   - CV < 0.6 → MEDIUM confidence
   - CV ≥ 0.6 → LOW confidence

### Cold Start Strategy

**Case 1: Has Reorder Level**
```
predictedQuantity = reorderLevel * 1.5
```

**Case 2: No Reorder Level**
Uses category-based defaults:
- Topical: 10 units/month
- Oral: 15 units/month
- Injectable: 5 units/month
- Supplement: 20 units/month
- Default: 10 units/month

### Stock-out Prediction
```
dailyUsage = averageMonthlyUsage / 30
daysUntilStockout = currentStock / dailyUsage
```

## Frontend Integration

### Dashboard URL
`/dashboard/stock-predictions`

### Features
- **Summary Cards**: Total drugs, critical items, cold start items
- **All Predictions Tab**: Scrollable list with confidence badges
- **Critical Items Tab**: Urgent attention items
- **Trends Tab**: Increasing/decreasing usage items
- **Bulk Order Tab**: CSV export for procurement
- **Detail View**: Historical charts, reasoning, trends

## Database Schema

```prisma
model StockPrediction {
  id                  String   @id @default(cuid())
  branchId            String
  drugId              String
  predictionDate      DateTime @default(now())
  predictedQuantity   Int
  currentStock        Int
  averageMonthlyUsage Float
  trend               Float    @default(0)
  confidence          String
  method              String
  daysUntilStockout   Int?
  historicalData      Json?
  reasoning           String?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
}
```

## Permissions

Required roles:
- OWNER
- ADMIN
- MANAGER
- PHARMACIST

## Future Enhancements

1. **ML Model Integration**: TensorFlow.js for more advanced predictions
2. **Seasonal Adjustments**: Account for seasonal variations
3. **Supplier Integration**: Auto-generate POs with suppliers
4. **Notification System**: Alert for critical stock levels
5. **Multi-branch Analysis**: Cross-branch stock optimization
6. **Price Forecasting**: Predict cost changes
7. **Demand Clustering**: Group similar drugs for better predictions

## Testing

To test the predictions:
1. Ensure you have at least 3 months of pharmacy invoice data
2. Navigate to `/dashboard/stock-predictions`
3. Adjust months ahead (1-3)
4. Review predictions and confidence levels
5. Generate bulk order and export CSV

## Troubleshooting

**Issue**: All predictions show COLD_START
- **Solution**: Need at least 1 month of invoice data with COMPLETED status

**Issue**: Low confidence predictions
- **Solution**: High variance in sales data; review and adjust safety buffers

**Issue**: Missing drugs in predictions
- **Solution**: Ensure drugs are marked as active and have inventory items

## Example Usage

```typescript
// Generate predictions
const response = await fetch('/stock-prediction/predictions?monthsAhead=2');
const data = await response.json();

// Get critical items
const critical = await fetch('/stock-prediction/critical-items');

// Generate bulk order
const bulkOrder = await fetch('/stock-prediction/bulk-order');
```

## Performance Considerations

- Predictions are calculated on-demand (not cached)
- For large inventories (500+ drugs), expect 5-10 second response time
- Consider implementing background jobs for pre-calculation
- Database indexes are optimized for branch + date queries

## Contributing

To add new prediction methods:
1. Add method to `PredictionMethod` enum in DTOs
2. Implement method in `StockPredictionService`
3. Update confidence calculation logic
4. Add tests for new method

## License

Part of the Clinic Management System - Internal Use Only

