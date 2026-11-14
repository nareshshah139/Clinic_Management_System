'use client';

import { displayClinicDate } from '@/lib/date-display';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { LoadingSkeleton } from '@/components/ui/skeleton';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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


  if (loading) {
    return <LoadingSkeleton label="Loading pharmacy dashboard…" variant="cards" />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader title="Pharmacy Dashboard" description="Overview of pharmacy operations and performance" actions={
        <Button onClick={loadDashboardData} variant="outline">
          <Activity className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      } />

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Today's Sales</p>
                <p className="text-2xl font-bold">{formatCurrency(stats.todaySales)}</p>
                <div className="flex items-center mt-1">
                  {stats.todayGrowth > 0 ? (
                    <TrendingUp className="h-3 w-3 text-success-text mr-1" />
                  ) : (
                    <TrendingDown className="h-3 w-3 text-destructive-text mr-1" />
                  )}
                  <span className={`text-xs ${stats.todayGrowth > 0 ? 'text-success-text' : 'text-destructive-text'}`}>
                    {Math.abs(stats.todayGrowth)}% vs yesterday
                  </span>
                </div>
              </div>
              <DollarSign className="h-8 w-8 text-success-text" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Monthly Sales</p>
                <p className="text-2xl font-bold">{formatCurrency(stats.monthSales)}</p>
                <div className="flex items-center mt-1">
                  <TrendingUp className="h-3 w-3 text-success-text mr-1" />
                  <span className="text-xs text-success-text">
                    {stats.monthGrowth}% vs last month
                  </span>
                </div>
              </div>
              <Calendar className="h-8 w-8 text-info-text" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Invoices</p>
                <p className="text-2xl font-bold">{stats.totalInvoices.toLocaleString()}</p>
                <div className="flex items-center mt-1">
                  <CheckCircle className="h-3 w-3 text-success-text mr-1" />
                  <span className="text-xs text-muted-foreground">
                    {stats.completedInvoices} completed
                  </span>
                </div>
              </div>
              <FileText className="h-8 w-8 text-highlight-text" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Drug Inventory</p>
                <p className="text-2xl font-bold">{stats.totalDrugs.toLocaleString()}</p>
                <div className="flex items-center mt-1">
                  <AlertTriangle className="h-3 w-3 text-warning-text mr-1" />
                  <span className="text-xs text-warning-text">
                    {stats.lowStockDrugs} low stock
                  </span>
                </div>
              </div>
              <Pill className="h-8 w-8 text-warning-text" />
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
                    <div className="w-8 h-8 rounded-full bg-info-soft flex items-center justify-center text-sm font-semibold text-info-text">
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{drug.name}</p>
                      <p className="text-xs text-muted-foreground">{drug.quantity} units sold</p>
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
                    <p className="text-xs text-muted-foreground">{invoice.patientName}</p>
                    <p className="text-xs text-muted-foreground">{displayClinicDate(invoice.createdAt)}</p>
                  </div>
                  <div className="text-right flex items-center gap-2">
                    <StatusBadge domain="invoice" status={invoice.status} />
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
            <AlertTriangle className="h-5 w-5 text-warning-text" />
            Stock Alerts
          </CardTitle>
          <CardDescription>Drugs requiring immediate attention</CardDescription>
        </CardHeader>
        <CardContent>
          {stats.lowStockAlerts.length === 0 ? (
            <EmptyState title="No stock alerts at this time" icon={Package} />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {stats.lowStockAlerts.map((alert) => (
                <div key={alert.id} className="border rounded-lg p-3 bg-warning-soft border-warning-border">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-sm">{alert.name}</h4>
                    <StatusBadge domain="stock" status="LOW_STOCK" />
                  </div>
                  <p className="text-xs text-muted-foreground mb-1">{alert.manufacturerName}</p>
                  <div className="flex justify-between text-xs">
                    <span>Current: <span className="font-semibold text-warning-text">{alert.currentStock}</span></span>
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