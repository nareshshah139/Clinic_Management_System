# Stock Prediction - Quick Start Guide

## 🚀 Quick Start (5 minutes)

### 1. Start the Application

```bash
# Terminal 1 - Backend
cd backend
npm run start:dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

### 2. Access the Feature

1. Open browser: http://localhost:3000
2. Login with your credentials
3. Navigate to **Stock Predictions** in the sidebar (TrendingUp icon)

### 3. Generate Your First Prediction

1. Click **"Refresh"** button to generate predictions
2. View the summary cards showing:
   - Total drugs analyzed
   - Critical items needing attention
   - Cold start items (limited data)
   - Predicted orders

### 4. Explore Different Views

#### **All Predictions Tab**
- Scroll through all predicted drugs
- Click on any drug to see detailed analysis
- View historical sales chart
- Check confidence level and reasoning

#### **Critical Items Tab**
- See items that will stock out soon
- Items below reorder level
- Urgent attention required

#### **Trends Tab**
- **Increasing Usage**: Drugs with growing demand
- **Decreasing Usage**: Drugs with declining sales

#### **Bulk Order Tab**
1. Click **"Generate Order"**
2. Review suggested quantities and costs
3. Click **"Export CSV"** to download for procurement
4. Total estimated cost displayed at top

### 5. Adjust Time Period

Use the dropdown to change prediction horizon:
- 1 Month (default)
- 2 Months
- 3 Months

## 📊 Understanding the Results

### Confidence Levels

- 🟢 **HIGH**: 3+ months of reliable data, low variance
- 🟡 **MEDIUM**: 1-2 months of data or moderate variance
- 🔴 **LOW**: High variance in sales data
- ⚪ **COLD_START**: No or minimal historical data

### Prediction Methods

- **TIME_SERIES**: Based on historical trend analysis
- **SIMILAR_ITEMS**: Based on limited data with adjustments
- **CATEGORY_AVERAGE**: Category-based estimates for new items

### Icons Explained

- 📈 **TrendingUp**: Increasing demand
- 📉 **TrendingDown**: Decreasing demand
- ⚠️ **AlertTriangle**: Low stock or stockout warning

## 🎯 Common Use Cases

### Use Case 1: Monthly Stock Planning
1. On the last day of the month, navigate to Stock Predictions
2. Set "1 Month" in the dropdown
3. Review all predictions
4. Generate bulk order
5. Export CSV and share with procurement team

### Use Case 2: Emergency Stock Check
1. Go to **Critical Items** tab
2. Review items with stockout warnings
3. Place urgent orders for items showing < 7 days
4. Check current stock vs predicted need

### Use Case 3: Budget Planning
1. Set "3 Months" in dropdown
2. Generate bulk order
3. Review total estimated cost
4. Use for quarterly budget planning

### Use Case 4: Identify Fast-Moving Items
1. Go to **Trends** tab
2. Select "Increasing Usage"
3. Review top trending items
4. Adjust stock levels proactively

## 💡 Pro Tips

1. **Run predictions weekly** to stay ahead of stockouts
2. **Export CSV** for integration with existing procurement systems
3. **Monitor critical items** daily for urgent orders
4. **Use historical charts** to understand seasonal patterns
5. **Review cold start items** and set appropriate reorder levels

## ⚙️ Configuration

### Setting Reorder Levels
To improve cold start predictions:
1. Go to **Inventory** page
2. Edit each drug's reorder level
3. Set minimum stock level
4. Predictions will use these values

### Drug Categories
Ensure drugs have proper categories:
- Topical
- Oral
- Injectable
- Supplement

This helps cold start predictions for new items.

## 🔍 Troubleshooting

### All predictions show COLD_START
**Problem**: No historical invoice data
**Solution**: 
- Ensure you've created pharmacy invoices with COMPLETED status
- Wait for at least 1 month of data
- Set reorder levels in inventory

### Low confidence predictions
**Problem**: High variance in sales
**Solution**:
- Review historical data for anomalies
- Adjust for seasonal variations
- Consider external factors (promotions, holidays)

### Missing drugs in predictions
**Problem**: Drugs not appearing
**Solution**:
- Check if drugs are marked as "Active"
- Ensure drugs have inventory items
- Verify branch assignment

## 📞 Support

For issues or questions:
1. Check the full documentation: `STOCK_PREDICTION_FEATURE.md`
2. Review API documentation: `backend/src/modules/stock-prediction/README.md`
3. Contact system administrator

## 🎓 Learning Path

1. **Day 1**: Explore all tabs, understand confidence levels
2. **Day 2**: Generate first bulk order, export CSV
3. **Day 3**: Compare predictions with actual usage
4. **Week 2**: Adjust reorder levels based on insights
5. **Month 1**: Full integration into procurement workflow

---

**Remember**: The more data you have, the better the predictions!
Start using the system consistently, and predictions will become more accurate over time.

Happy forecasting! 🎯

