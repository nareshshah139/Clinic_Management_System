'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  TrendingUp, 
  TrendingDown,
  DollarSign,
  FileText,
  Package,
  AlertTriangle,
  Calendar,
  Users,
  Pill,
  Activity,
  Clock,
  CheckCircle
} from 'lucide-react';
import { apiClient } from '@/lib/api';

interface DashboardStats {
  todaySales: number;
  todayGrowth: number;
  monthSales: number;
  monthGrowth: number;
  totalInvoices: number;
  pendingInvoices: number;
  completedInvoices: number;
  totalDrugs: number;
  lowStockDrugs: number;
  expiredDrugs: number;
  topSellingDrugs: {
    id: string;
    name: string;
    quantity: number;
    revenue: number;
  }[];
  recentInvoices: {
    id: string;
    invoiceNumber: string;
    patientName: string;
    amount: number;
    status: string;
    createdAt: string;
  }[];
  lowStockAlerts: {
    id: string;
    name: string;
    currentStock: number;
    minStock: number;
    manufacturerName: string;
  }[];
}

export function PharmacyDashboard() {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<DashboardStats>({
    todaySales: 0,
    todayGrowth: 0,
    monthSales: 0,
    monthGrowth: 0,
    totalInvoices: 0,
    pendingInvoices: 0,
    completedInvoices: 0,
    totalDrugs: 0,
    lowStockDrugs: 0,
    expiredDrugs: 0,
    topSellingDrugs: [],
    recentInvoices: [],
    lowStockAlerts: [],
  });

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Call the actual dashboard API
      const dashboardData = await apiClient.getPharmacyDashboard() as any;
      
      // Map backend response to frontend DashboardStats interface
      const mappedStats: DashboardStats = {
        todaySales: dashboardData.todaySales || 0,
        todayGrowth: dashboardData.todayGrowth || 0,
        monthSales: dashboardData.monthSales || 0,
        monthGrowth: dashboardData.monthGrowth || 0,
        totalInvoices: dashboardData.totalInvoices || 0,
        pendingInvoices: dashboardData.pendingInvoices || dashboardData.todayPendingInvoices || 0,
        completedInvoices: dashboardData.completedInvoices || dashboardData.todayCompletedInvoices || 0,
        totalDrugs: dashboardData.totalDrugs || 0,
        lowStockDrugs: dashboardData.lowStockDrugs || 0,
        expiredDrugs: dashboardData.expiredDrugs || 0,
        topSellingDrugs: (dashboardData.topSellingDrugs || []).map((drug: any) => ({
          id: drug.id || '',
          name: drug.name || 'Unknown Drug',
          quantity: drug.quantity || 0,
          revenue: drug.revenue || 0,
        })),
        recentInvoices: (dashboardData.recentInvoices || []).map((invoice: any) => ({
          id: invoice.id || '',
          invoiceNumber: invoice.invoiceNumber || '',
          patientName: invoice.patientName || 'Unknown Patient',
          amount: invoice.amount || 0,
          status: invoice.status || 'PENDING',
          createdAt: invoice.createdAt || new Date().toISOString(),
        })),
        lowStockAlerts: (dashboardData.lowStockAlerts || []).map((alert: any) => ({
          id: alert.id || '',
          name: alert.name || 'Unknown Drug',
          currentStock: alert.currentStock || 0,
          minStock: alert.minStock || 0,
          manufacturerName: alert.manufacturerName || 'Unknown',
        })),
      };
      
      setStats(mappedStats);
    } catch (error: any) {
      console.error('Failed to load dashboard data:', error);
      // Set empty stats on error to show empty state
      setStats({
        todaySales: 0,
        todayGrowth: 0,
        monthSales: 0,
        monthGrowth: 0,
        totalInvoices: 0,
        pendingInvoices: 0,
        completedInvoices: 0,
        totalDrugs: 0,
        lowStockDrugs: 0,
        expiredDrugs: 0,
        topSellingDrugs: [],
        recentInvoices: [],
        lowStockAlerts: [],
      });
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', { 
      style: 'currency', 
      currency: 'INR',
      minimumFractionDigits: 2 
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const getStatusColor = (status: string) => {
    const colors = {
      COMPLETED: 'bg-green-100 text-green-800',
      PENDING: 'bg-yellow-100 text-yellow-800',
      DISPENSED: 'bg-blue-100 text-blue-800',
      CANCELLED: 'bg-red-100 text-red-800',
    };
    return colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <p className="text-gray-500">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Pharmacy Dashboard</h2>
          <p className="text-gray-600">Overview of pharmacy operations and performance</p>
        </div>
        <Button onClick={loadDashboardData} variant="outline">
          <Activity className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Today's Sales</p>
                <p className="text-2xl font-bold">{formatCurrency(stats.todaySales)}</p>
                <div className="flex items-center mt-1">
                  {stats.todayGrowth > 0 ? (
                    <TrendingUp className="h-3 w-3 text-green-600 mr-1" />
                  ) : (
                    <TrendingDown className="h-3 w-3 text-red-600 mr-1" />
                  )}
                  <span className={`text-xs ${stats.todayGrowth > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {Math.abs(stats.todayGrowth)}% vs yesterday
                  </span>
                </div>
              </div>
              <DollarSign className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Monthly Sales</p>
                <p className="text-2xl font-bold">{formatCurrency(stats.monthSales)}</p>
                <div className="flex items-center mt-1">
                  <TrendingUp className="h-3 w-3 text-green-600 mr-1" />
                  <span className="text-xs text-green-600">
                    {stats.monthGrowth}% vs last month
                  </span>
                </div>
              </div>
              <Calendar className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Invoices</p>
                <p className="text-2xl font-bold">{stats.totalInvoices.toLocaleString()}</p>
                <div className="flex items-center mt-1">
                  <CheckCircle className="h-3 w-3 text-green-600 mr-1" />
                  <span className="text-xs text-gray-600">
                    {stats.completedInvoices} completed
                  </span>
                </div>
              </div>
              <FileText className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Drug Inventory</p>
                <p className="text-2xl font-bold">{stats.totalDrugs.toLocaleString()}</p>
                <div className="flex items-center mt-1">
                  <AlertTriangle className="h-3 w-3 text-orange-600 mr-1" />
                  <span className="text-xs text-orange-600">
                    {stats.lowStockDrugs} low stock
                  </span>
                </div>
              </div>
              <Pill className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts and Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Selling Drugs */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Top Selling Drugs
            </CardTitle>
            <CardDescription>Best performing drugs this month</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats.topSellingDrugs.map((drug, index) => (
                <div key={drug.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-sm font-semibold text-blue-600">
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{drug.name}</p>
                      <p className="text-xs text-gray-500">{drug.quantity} units sold</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-sm">{formatCurrency(drug.revenue)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Invoices */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Recent Invoices
            </CardTitle>
            <CardDescription>Latest pharmacy transactions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats.recentInvoices.map((invoice) => (
                <div key={invoice.id} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{invoice.invoiceNumber}</p>
                    <p className="text-xs text-gray-500">{invoice.patientName}</p>
                    <p className="text-xs text-gray-400">{formatDate(invoice.createdAt)}</p>
                  </div>
                  <div className="text-right flex items-center gap-2">
                    <Badge className={getStatusColor(invoice.status)}>
                      {invoice.status}
                    </Badge>
                    <p className="font-semibold text-sm">{formatCurrency(invoice.amount)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alerts Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-600" />
            Stock Alerts
          </CardTitle>
          <CardDescription>Drugs requiring immediate attention</CardDescription>
        </CardHeader>
        <CardContent>
          {stats.lowStockAlerts.length === 0 ? (
            <p className="text-center text-gray-500 py-4">No stock alerts at this time</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {stats.lowStockAlerts.map((alert) => (
                <div key={alert.id} className="border rounded-lg p-3 bg-orange-50 border-orange-200">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-sm">{alert.name}</h4>
                    <Badge variant="destructive">Low Stock</Badge>
                  </div>
                  <p className="text-xs text-gray-600 mb-1">{alert.manufacturerName}</p>
                  <div className="flex justify-between text-xs">
                    <span>Current: <span className="font-semibold text-orange-600">{alert.currentStock}</span></span>
                    <span>Min Required: <span className="font-semibold">{alert.minStock}</span></span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 