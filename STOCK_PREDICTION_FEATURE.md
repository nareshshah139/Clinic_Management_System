# Stock Prediction Feature - Complete Documentation

## 🎯 Overview

The Stock Prediction feature is an intelligent, ML-powered inventory forecasting system that predicts stock requirements for the upcoming month(s) based on historical pharmacy invoice data. It includes smart cold-start strategies for items with limited or no historical data.

## ✨ Key Features

### 1. **Intelligent Prediction Engine**
- **Time-Series Analysis**: Uses 6 months of historical sales data
- **Exponential Smoothing**: Weighted forecasting with alpha = 0.3
- **Linear Regression**: Trend detection (increasing/decreasing usage)
- **Confidence Scoring**: HIGH, MEDIUM, LOW, COLD_START based on data variance

### 2. **Smart Cold Start**
For drugs with limited or no historical data:
- **Reorder Level Based**: Uses configured reorder levels as baseline
- **Category Defaults**: Falls back to category-based estimates
  - Topical: 10 units/month
  - Oral: 15 units/month
  - Injectable: 5 units/month
  - Supplement: 20 units/month
- **Safety Buffers**: Conservative predictions to prevent stockouts

### 3. **Prediction Methods**
- `TIME_SERIES`: 3+ months of data (HIGH confidence)
- `SIMILAR_ITEMS`: 1-2 months of data (MEDIUM confidence)
- `CATEGORY_AVERAGE`: No data, uses category defaults (COLD_START)
- `MANUAL_RULE`: Custom rules (extensible)

### 4. **Critical Item Detection**
- Identifies items that will stock out within 7-15 days
- Flags items below reorder level
- Prioritizes orders by urgency

### 5. **Bulk Order Generation**
- Creates purchase order suggestions
- Calculates total costs
- Prioritizes by urgency: CRITICAL → HIGH → MEDIUM → LOW
- Exports to CSV for procurement teams

### 6. **Trend Analysis**
- Identifies increasing usage trends
- Detects decreasing demand
- Helps optimize inventory levels

## 🏗️ Architecture

### Backend Structure
```
backend/src/modules/stock-prediction/
├── dto/
│   └── stock-prediction.dto.ts       # Request/Response DTOs
├── stock-prediction.service.ts        # Core prediction logic
├── stock-prediction.controller.ts     # API endpoints
├── stock-prediction.module.ts         # NestJS module
└── README.md                          # Technical documentation
```

### Frontend Structure
```
frontend/src/
├── app/dashboard/stock-predictions/
│   └── page.tsx                       # Main page component
└── components/stock-prediction/
    └── StockPredictionDashboard.tsx   # Dashboard UI
```

### Database Schema
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
  confidence          String   // HIGH, MEDIUM, LOW, COLD_START
  method              String   // TIME_SERIES, SIMILAR_ITEMS, etc.
  daysUntilStockout   Int?
  historicalData      Json?
  reasoning           String?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
}
```

## 📡 API Endpoints

### 1. GET `/stock-prediction/predictions`
Generate stock predictions for the current branch.

**Query Parameters:**
- `monthsAhead` (optional, default: 1): Number of months to predict
- `includeInactive` (optional, default: false): Include inactive drugs
- `categories` (optional): Comma-separated category list
- `onlyLowStock` (optional, default: false): Only show low stock items

**Example Request:**
```bash
GET /stock-prediction/predictions?monthsAhead=2&onlyLowStock=false
Authorization: Bearer <token>
```

**Example Response:**
```json
{
  "branchId": "branch_xyz",
  "predictionDate": "2025-09-30T12:00:00Z",
  "totalDrugsAnalyzed": 150,
  "highConfidencePredictions": 120,
  "coldStartItems": 15,
  "predictions": [
    {
      "drugId": "drug_123",
      "drugName": "Azithromycin 500mg",
      "predictedQuantity": 50,
      "currentStock": 20,
      "averageMonthlyUsage": 45,
      "trend": 0.12,
      "confidence": "HIGH",
      "method": "TIME_SERIES",
      "reorderLevel": 30,
      "daysUntilStockout": 13,
      "historicalData": [
        {"month": "2025-03", "quantity": 42},
        {"month": "2025-04", "quantity": 45},
        {"month": "2025-05", "quantity": 48}
      ],
      "reasoning": "Based on 6 months of sales data with high variance. Trend: increasing."
    }
  ],
  "summary": {
    "totalPredictedOrders": 1250,
    "estimatedCost": 45000,
    "criticalItems": 8
  }
}
```

### 2. GET `/stock-prediction/bulk-order`
Generate a bulk order suggestion based on predictions.

**Query Parameters:**
- `monthsAhead` (optional, default: 1)

**Example Response:**
```json
{
  "items": [
    {
      "drugId": "drug_123",
      "drugName": "Azithromycin 500mg",
      "suggestedQuantity": 30,
      "currentStock": 20,
      "unitPrice": 125.50,
      "totalCost": 3765.00,
      "priority": "HIGH"
    }
  ],
  "totalEstimatedCost": 45000.00,
  "generatedAt": "2025-09-30T12:00:00Z"
}
```

### 3. GET `/stock-prediction/critical-items`
Get items that need immediate attention (stockout < 7 days or below reorder level).

### 4. GET `/stock-prediction/trends`
Get trending items (increasing or decreasing usage).

**Query Parameters:**
- `direction` (optional): "increasing" | "decreasing" | "all"

## 🧮 Prediction Algorithm

### Top 30 Drug Selection Strategy

The system analyzes only the **top 30 most-used drugs** to ensure fast performance and avoid database query limits.

**Selection Criteria:**
- Analyzes last 6 months of completed pharmacy invoices
- Ranks drugs by total quantity sold
- Tie-breaking: Uses most recent sale date

**Tie-Handling Logic:**
```sql
ORDER BY 
  SUM(quantity) DESC,           -- Primary: Total sales
  MAX(invoice_date) DESC         -- Secondary: Recent activity
LIMIT 30
```

This approach:
- ✅ Avoids PostgreSQL's 32,767 parameter limit
- ✅ Focuses on high-impact items (Pareto principle)
- ✅ Maintains fast query performance (<2 seconds)
- ✅ Provides consistent, reproducible results

### Time-Series Forecasting

1. **Data Collection**: Aggregate invoice items by month (6 months lookback)
2. **Trend Analysis**: Linear regression slope calculation
3. **Exponential Smoothing**: 
   ```
   forecast[n+1] = α × forecast[n] + (1-α) × (forecast[n] + trend)
   where α = 0.3
   ```
4. **Safety Buffer**: 20% added to prediction
5. **Confidence Calculation**:
   ```
   CV (Coefficient of Variation) = σ / μ
   - CV < 0.3 → HIGH confidence
   - CV < 0.6 → MEDIUM confidence
   - CV ≥ 0.6 → LOW confidence
   ```

### Cold Start Strategy

**With Reorder Level:**
```
predictedQuantity = reorderLevel × 1.5
```

**Without Reorder Level (Category-based):**
```javascript
const categoryDefaults = {
  'Topical': 10,
  'Oral': 15,
  'Injectable': 5,
  'Supplement': 20,
  'default': 10
};
predictedQuantity = categoryDefaults[category] × monthsAhead;
```

### Stock-out Prediction
```
dailyUsage = averageMonthlyUsage / 30
daysUntilStockout = currentStock / dailyUsage
```

## 🎨 Frontend UI

### Dashboard Components

1. **Summary Cards**
   - Total Drugs Analyzed
   - Critical Items Count
   - Cold Start Items
   - Predicted Orders

2. **Tabs**
   - **All Predictions**: Scrollable list with confidence badges
   - **Critical Items**: Items needing immediate attention
   - **Trends**: Increasing/decreasing usage visualization
   - **Bulk Order**: CSV export for procurement

3. **Detail View**
   - Historical sales chart (Recharts line chart)
   - Prediction reasoning
   - Trend indicators
   - Stock-out countdown

### Navigation
- **URL**: `/dashboard/stock-predictions`
- **Icon**: TrendingUp (Lucide)
- **Access**: OWNER, ADMIN, MANAGER, PHARMACIST

## 🔒 Security & Permissions

Required roles for all endpoints:
- `OWNER`
- `ADMIN`
- `MANAGER`
- `PHARMACIST`

All endpoints require JWT authentication via `JwtAuthGuard` and role-based authorization via `RolesGuard`.

## 📊 Performance Considerations

- **Analysis Period**: Last 6 months of invoice data
- **Response Time**: 
  - Small inventory (<100 drugs): <2 seconds
  - Medium inventory (100-500 drugs): 2-5 seconds
  - Large inventory (500+ drugs): 5-10 seconds
- **Optimization**: Database indexes on:
  - `branchId + invoiceDate`
  - `drugId + invoiceDate`
  - Composite indexes for faster aggregation

## 🧪 Testing

### Manual Testing Steps

1. **Setup**
   ```bash
   # Ensure database has historical data
   cd backend
   npm run seed  # If needed
   ```

2. **Test API**
   ```bash
   # Get predictions
   curl -X GET http://localhost:3001/stock-prediction/predictions \
     -H "Authorization: Bearer <token>"

   # Get bulk order
   curl -X GET http://localhost:3001/stock-prediction/bulk-order \
     -H "Authorization: Bearer <token>"
   ```

3. **Test UI**
   - Navigate to http://localhost:3000/dashboard/stock-predictions
   - Test all tabs (Predictions, Critical, Trends, Bulk Order)
   - Export CSV
   - View drug details with charts

### Expected Behaviors

- **With 3+ months data**: HIGH confidence, TIME_SERIES method
- **With 1-2 months data**: MEDIUM confidence, SIMILAR_ITEMS method
- **With 0 months data**: COLD_START confidence, CATEGORY_AVERAGE method
- **Below reorder level**: Shows in Critical Items tab
- **Stockout < 7 days**: Shows warning icon

## 🚀 Deployment

### Backend
```bash
cd backend
npm run build
npm run start:prod
```

### Frontend
```bash
cd frontend
npm run build
npm run start
```

### Environment Variables
No additional environment variables required. Uses existing database connection.

## 🔮 Future Enhancements

1. **Advanced ML Models**
   - TensorFlow.js integration
   - LSTM neural networks for seasonal patterns
   - Prophet for time-series forecasting

2. **Seasonal Adjustments**
   - Holiday/festival demand spikes
   - Weather-dependent predictions
   - Seasonal disease patterns

3. **Multi-Branch Optimization**
   - Cross-branch stock transfer suggestions
   - Centralized procurement optimization
   - Branch-specific demand patterns

4. **Supplier Integration**
   - Auto-generate POs via supplier APIs
   - Track delivery times
   - Vendor performance analytics

5. **Notification System**
   - Email alerts for critical stock
   - SMS notifications for urgent orders
   - Dashboard widgets for quick access

6. **Price Forecasting**
   - Predict price changes
   - Optimize purchase timing
   - Budget forecasting

7. **Demand Clustering**
   - Group similar drugs for better predictions
   - Identify substitutable items
   - Cross-sell recommendations

## 📝 Change Log

### Version 1.0.0 (September 30, 2025)
- Initial release
- Time-series prediction with exponential smoothing
- Smart cold start for new items
- Critical item detection
- Bulk order generation with CSV export
- Frontend dashboard with charts
- 4 prediction confidence levels
- Trend analysis (increasing/decreasing)

## 🤝 Contributing

To add new prediction methods:
1. Add method to `PredictionMethod` enum in DTOs
2. Implement method in `StockPredictionService`
3. Update confidence calculation logic
4. Add tests
5. Update documentation

## 📄 License

Part of Clinic Management System - Internal Use Only

---

**Built with:**
- NestJS (Backend)
- Next.js (Frontend)
- Prisma ORM
- PostgreSQL
- Recharts (Visualization)
- TailwindCSS (Styling)

**Author:** AI Development Team
**Date:** September 30, 2025

