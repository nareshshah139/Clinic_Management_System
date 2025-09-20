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
      
      // TODO: Replace with actual API calls
      // const [salesStats, invoiceStats, drugStats, topSelling, recentInvoices, alerts] = await Promise.all([
      //   apiClient.get('/pharmacy/dashboard/sales'),
      //   apiClient.get('/pharmacy/dashboard/invoices'),
      //   apiClient.get('/pharmacy/dashboard/drugs'),
      //   apiClient.get('/pharmacy/dashboard/top-selling'),
      //   apiClient.get('/pharmacy/dashboard/recent-invoices'),
      //   apiClient.get('/pharmacy/dashboard/alerts'),
      // ]);
      
      // Mock data for now
      const mockStats: DashboardStats = {
        todaySales: 12450.75,
        todayGrowth: 8.5,
        monthSales: 345680.25,
        monthGrowth: 12.3,
        totalInvoices: 1247,
        pendingInvoices: 23,
        completedInvoices: 1224,
        totalDrugs: 253973, // From the Indian Medicine Dataset
        lowStockDrugs: 45,
        expiredDrugs: 12,
        topSellingDrugs: [
          { id: '1', name: 'Paracetamol 500mg Tablet', quantity: 450, revenue: 11250 },
          { id: '2', name: 'Azithromycin 500mg Tablet', quantity: 180, revenue: 35820 },
          { id: '3', name: 'Amoxyclav 625 Tablet', quantity: 120, revenue: 38400 },
          { id: '4', name: 'Omeprazole 20mg Capsule', quantity: 200, revenue: 16000 },
          { id: '5', name: 'Metformin 500mg Tablet', quantity: 300, revenue: 9600 },
        ],
        recentInvoices: [
          { id: '1', invoiceNumber: 'PHI-2024-001', patientName: 'John Doe', amount: 477.90, status: 'COMPLETED', createdAt: new Date().toISOString() },
          { id: '2', invoiceNumber: 'PHI-2024-002', patientName: 'Alice Johnson', amount: 377.60, status: 'PENDING', createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() },
          { id: '3', invoiceNumber: 'PHI-2024-003', patientName: 'Bob Smith', amount: 156.25, status: 'COMPLETED', createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() },
          { id: '4', invoiceNumber: 'PHI-2024-004', patientName: 'Emma Wilson', amount: 892.50, status: 'DISPENSED', createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() },
          { id: '5', invoiceNumber: 'PHI-2024-005', patientName: 'Michael Brown', amount: 234.75, status: 'COMPLETED', createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString() },
        ],
        lowStockAlerts: [
          { id: '1', name: 'Insulin Glargine 100IU/ml', currentStock: 2, minStock: 10, manufacturerName: 'Sanofi' },
          { id: '2', name: 'Salbutamol Inhaler 100mcg', currentStock: 5, minStock: 15, manufacturerName: 'GSK' },
          { id: '3', name: 'Atorvastatin 20mg Tablet', currentStock: 8, minStock: 25, manufacturerName: 'Pfizer' },
          { id: '4', name: 'Losartan 50mg Tablet', currentStock: 12, minStock: 30, manufacturerName: 'Teva' },
        ]
      };
      
      setStats(mockStats);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
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