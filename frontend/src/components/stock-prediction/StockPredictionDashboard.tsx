'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger, TabsFontSizeControls } from '@/components/ui/tabs';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Package,
  Calendar,
  DollarSign,
  RefreshCw,
  Download,
  BarChart3,
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

interface DrugPrediction {
  drugId: string;
  drugName: string;
  predictedQuantity: number;
  currentStock: number;
  averageMonthlyUsage: number;
  trend: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'COLD_START';
  method: string;
  reorderLevel?: number;
  daysUntilStockout?: number;
  historicalData?: { month: string; quantity: number }[];
  reasoning?: string;
}

interface PredictionResponse {
  branchId: string;
  predictionDate: string;
  totalDrugsAnalyzed: number;
  highConfidencePredictions: number;
  coldStartItems: number;
  predictions: DrugPrediction[];
  summary?: {
    totalPredictedOrders: number;
    estimatedCost: number;
    criticalItems: number;
  };
}

interface BulkOrderItem {
  drugId: string;
  drugName: string;
  suggestedQuantity: number;
  currentStock: number;
  unitPrice: number;
  totalCost: number;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
}

export function StockPredictionDashboard() {
  const [predictions, setPredictions] = useState<PredictionResponse | null>(null);
  const [bulkOrder, setBulkOrder] = useState<{ items: BulkOrderItem[]; totalEstimatedCost: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedDrug, setSelectedDrug] = useState<DrugPrediction | null>(null);
  const [monthsAhead, setMonthsAhead] = useState(1);

  useEffect(() => {
    fetchPredictions();
  }, [monthsAhead]);

  const fetchPredictions = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/stock-prediction/predictions?monthsAhead=${monthsAhead}`,
        {
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );

      if (response.ok) {
        const data = await response.json();
        setPredictions(data);
      } else {
        console.error('Failed to fetch predictions:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Error fetching predictions:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchBulkOrder = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/stock-prediction/bulk-order?monthsAhead=${monthsAhead}`,
        {
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );

      if (response.ok) {
        const data = await response.json();
        setBulkOrder(data);
      } else {
        console.error('Failed to fetch bulk order:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Error fetching bulk order:', error);
    } finally {
      setLoading(false);
    }
  };

  const getConfidenceBadge = (confidence: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      HIGH: 'default',
      MEDIUM: 'secondary',
      LOW: 'destructive',
      COLD_START: 'outline',
    };
    return (
      <Badge variant={variants[confidence] || 'default'} className="ml-2">
        {confidence}
      </Badge>
    );
  };

  const getPriorityBadge = (priority: string) => {
    const colors: Record<string, string> = {
      CRITICAL: 'bg-red-500 text-white',
      HIGH: 'bg-orange-500 text-white',
      MEDIUM: 'bg-yellow-500 text-black',
      LOW: 'bg-green-500 text-white',
    };
    return <Badge className={colors[priority]}>{priority}</Badge>;
  };

  const exportToCSV = () => {
    if (!bulkOrder) return;

    const headers = ['Drug Name', 'Suggested Quantity', 'Current Stock', 'Unit Price', 'Total Cost', 'Priority'];
    const rows = bulkOrder.items.map((item) => [
      item.drugName,
      item.suggestedQuantity,
      item.currentStock,
      item.unitPrice.toFixed(2),
      item.totalCost.toFixed(2),
      item.priority,
    ]);

    const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bulk-order-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Smart Stock Predictions</h1>
          <p className="text-muted-foreground mt-1">
            AI-powered inventory forecasting for the next {monthsAhead} month{monthsAhead > 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={monthsAhead}
            onChange={(e) => setMonthsAhead(Number(e.target.value))}
            className="border rounded px-3 py-2"
          >
            <option value={1}>1 Month</option>
            <option value={2}>2 Months</option>
            <option value={3}>3 Months</option>
          </select>
          <Button onClick={fetchPredictions} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {predictions && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Drugs Analyzed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{predictions.totalDrugsAnalyzed}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {predictions.highConfidencePredictions} high confidence
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Critical Items</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{predictions.summary?.criticalItems || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Need immediate attention</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Cold Start Items</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{predictions.coldStartItems}</div>
              <p className="text-xs text-muted-foreground mt-1">Limited historical data</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Predicted Orders</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{predictions.summary?.totalPredictedOrders || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Units to order</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Content Tabs */}
      <Tabs defaultValue="predictions" className="space-y-4">
        <div className="flex justify-end">
          <TabsFontSizeControls />
        </div>
        <TabsList>
          <TabsTrigger value="predictions">All Predictions</TabsTrigger>
          <TabsTrigger value="critical">Critical Items</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="bulk-order">Bulk Order</TabsTrigger>
        </TabsList>

        {/* All Predictions Tab */}
        <TabsContent value="predictions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Stock Predictions</CardTitle>
              <CardDescription>AI-generated predictions based on historical sales data</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {predictions?.predictions.slice(0, 50).map((pred) => (
                  <div
                    key={pred.drugId}
                    className="flex items-center justify-between p-3 border rounded hover:bg-gray-50 cursor-pointer"
                    onClick={() => setSelectedDrug(pred)}
                  >
                    <div className="flex-1">
                      <div className="font-medium">{pred.drugName}</div>
                      <div className="text-sm text-muted-foreground">
                        Current: {pred.currentStock} | Predicted: {pred.predictedQuantity} | Avg/mo:{' '}
                        {pred.averageMonthlyUsage.toFixed(0)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {pred.trend > 0.1 && <TrendingUp className="h-4 w-4 text-green-600" />}
                      {pred.trend < -0.1 && <TrendingDown className="h-4 w-4 text-red-600" />}
                      {pred.daysUntilStockout && pred.daysUntilStockout < 15 && (
                        <AlertTriangle className="h-4 w-4 text-orange-500" />
                      )}
                      {getConfidenceBadge(pred.confidence)}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Drug Detail Modal */}
          {selectedDrug && (
            <Card>
              <CardHeader>
                <CardTitle>{selectedDrug.drugName} - Detailed Analysis</CardTitle>
                <Button variant="outline" size="sm" onClick={() => setSelectedDrug(null)}>
                  Close
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Current Stock</p>
                    <p className="text-2xl font-bold">{selectedDrug.currentStock}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Predicted Quantity</p>
                    <p className="text-2xl font-bold">{selectedDrug.predictedQuantity}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Average Monthly Usage</p>
                    <p className="text-2xl font-bold">{selectedDrug.averageMonthlyUsage.toFixed(0)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Days Until Stockout</p>
                    <p className="text-2xl font-bold">{selectedDrug.daysUntilStockout || 'N/A'}</p>
                  </div>
                </div>

                {selectedDrug.reasoning && (
                  <div className="p-3 bg-blue-50 rounded">
                    <p className="text-sm font-medium">Reasoning:</p>
                    <p className="text-sm text-muted-foreground">{selectedDrug.reasoning}</p>
                  </div>
                )}

                {selectedDrug.historicalData && selectedDrug.historicalData.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2">Historical Sales Data</p>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={selectedDrug.historicalData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" />
                        <YAxis />
                        <Tooltip />
                        {/* @ts-expect-error - recharts v3 Legend type compatibility with React 19 */}
                        <Legend />
                        <Line type="monotone" dataKey="quantity" stroke="#8884d8" name="Quantity Sold" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Critical Items Tab */}
        <TabsContent value="critical">
          <Card>
            <CardHeader>
              <CardTitle>Critical Items</CardTitle>
              <CardDescription>Items that need immediate attention</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {predictions?.predictions
                  .filter(
                    (pred) =>
                      (pred.daysUntilStockout && pred.daysUntilStockout < 15) ||
                      (pred.reorderLevel && pred.currentStock <= pred.reorderLevel),
                  )
                  .map((pred) => (
                    <div key={pred.drugId} className="flex items-center justify-between p-3 border rounded bg-red-50">
                      <div className="flex-1">
                        <div className="font-medium flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-red-600" />
                          {pred.drugName}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {pred.daysUntilStockout && `Stockout in ${pred.daysUntilStockout} days | `}
                          Current: {pred.currentStock} | Order: {pred.predictedQuantity}
                        </div>
                      </div>
                      {getConfidenceBadge(pred.confidence)}
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Trends Tab */}
        <TabsContent value="trends">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-green-600" />
                  Increasing Usage
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {predictions?.predictions
                    .filter((pred) => pred.trend > 0.1)
                    .slice(0, 10)
                    .map((pred) => (
                      <div key={pred.drugId} className="flex justify-between p-2 border rounded">
                        <span className="text-sm">{pred.drugName}</span>
                        <span className="text-sm font-medium text-green-600">+{(pred.trend * 100).toFixed(1)}%</span>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingDown className="h-5 w-5 text-red-600" />
                  Decreasing Usage
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {predictions?.predictions
                    .filter((pred) => pred.trend < -0.1)
                    .slice(0, 10)
                    .map((pred) => (
                      <div key={pred.drugId} className="flex justify-between p-2 border rounded">
                        <span className="text-sm">{pred.drugName}</span>
                        <span className="text-sm font-medium text-red-600">{(pred.trend * 100).toFixed(1)}%</span>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Bulk Order Tab */}
        <TabsContent value="bulk-order">
          <Card>
            <CardHeader>
              <CardTitle>Bulk Order Suggestion</CardTitle>
              <CardDescription>Generate a purchase order based on predictions</CardDescription>
              <div className="flex gap-2 mt-2">
                <Button onClick={fetchBulkOrder} disabled={loading}>
                  <Package className="h-4 w-4 mr-2" />
                  Generate Order
                </Button>
                {bulkOrder && (
                  <Button variant="outline" onClick={exportToCSV}>
                    <Download className="h-4 w-4 mr-2" />
                    Export CSV
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {bulkOrder && (
                <>
                  <div className="mb-4 p-4 bg-blue-50 rounded">
                    <p className="text-lg font-semibold">
                      Total Estimated Cost: ₹{bulkOrder.totalEstimatedCost.toFixed(2)}
                    </p>
                    <p className="text-sm text-muted-foreground">{bulkOrder.items.length} items to order</p>
                  </div>

                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {bulkOrder.items.map((item) => (
                      <div key={item.drugId} className="flex items-center justify-between p-3 border rounded">
                        <div className="flex-1">
                          <div className="font-medium">{item.drugName}</div>
                          <div className="text-sm text-muted-foreground">
                            Order: {item.suggestedQuantity} | Current: {item.currentStock} | ₹{item.unitPrice.toFixed(2)}{' '}
                            each
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="font-semibold">₹{item.totalCost.toFixed(2)}</span>
                          {getPriorityBadge(item.priority)}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

