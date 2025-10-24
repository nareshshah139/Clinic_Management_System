'use client';

import { StockPredictionDashboard } from '@/components/stock-prediction/StockPredictionDashboard';
import { QuickGuide } from '@/components/common/QuickGuide';

export default function StockPredictionsPage() {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Stock Predictions</h1>
          <p className="text-gray-600">AI-powered stock forecasting and inventory planning</p>
        </div>
        <QuickGuide
          title="Stock Predictions Guide"
          sections={[
            {
              title: "Understanding Predictions",
              items: [
                "View predicted stock requirements based on historical usage",
                "Predictions use machine learning to forecast demand",
                "Color-coded alerts show urgency levels for reordering",
                "Confidence scores indicate prediction reliability"
              ]
            },
            {
              title: "Viewing Analytics",
              items: [
                "See usage trends over time for each drug",
                "Identify seasonal patterns in drug consumption",
                "Compare predicted vs actual usage",
                "View top-consuming items and categories"
              ]
            },
            {
              title: "Taking Action",
              items: [
                "Use predictions to optimize purchase orders",
                "Set automatic reorder points based on predictions",
                "Export prediction reports for planning",
                "Adjust inventory levels proactively to avoid stockouts"
              ]
            }
          ]}
        />
      </div>
      <StockPredictionDashboard />
    </div>
  );
}

