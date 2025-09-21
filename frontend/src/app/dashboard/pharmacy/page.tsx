'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PharmacyInvoiceBuilderFixed } from '@/components/pharmacy/PharmacyInvoiceBuilderFixed';
import { PackageBrowser } from '@/components/pharmacy/PackageBrowser';
import { PharmacyPackageCreator } from '@/components/pharmacy/PharmacyPackageCreator';
import { apiClient } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

import {
  Receipt,
  Pill,
  Users,
  DollarSign,
  TrendingUp,
  Package,
  Plus,
  FileText
} from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function PharmacyPage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [dash, setDash] = useState<any | null>(null);
  const [dashReloadKey, setDashReloadKey] = useState<number>(0);
  const [prefill, setPrefill] = useState<{ patientId?: string; prescriptionId?: string } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    const patientId = params.get('patientId') || undefined;
    const prescriptionId = params.get('prescriptionId') || undefined;
    if (patientId || prescriptionId) {
      setPrefill({ patientId, prescriptionId });
    }
  }, []);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        await apiClient.get('/auth/me');
        setIsAuthenticated(true);
      } catch (error) {
        try {
          console.log('Auto-logging in with test credentials...');
          await apiClient.login('9000000000', 'password123');
          setIsAuthenticated(true);
        } catch (loginError) {
          console.error('Auto-login failed:', loginError);
          router.push('/login?next=' + encodeURIComponent(window.location.pathname));
        }
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, [router]);

  useEffect(() => {
    const loadDashboard = async () => {
      if (!isAuthenticated) return;
      try {
        const data = await apiClient.get('/pharmacy/dashboard');
        setDash(data);
      } catch (e) {
        console.error('Failed to load pharmacy dashboard', e);
        setDash(null);
      }
    };
    void loadDashboard();
  }, [isAuthenticated, dashReloadKey]);

  useEffect(() => {
    const handler = () => setDashReloadKey((k) => k + 1);
    window.addEventListener('pharmacy-dashboard-refresh', handler);
    return () => window.removeEventListener('pharmacy-dashboard-refresh', handler);
  }, []);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading pharmacy dashboard...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <p className="text-muted-foreground">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  const todaySales = dash?.todaySales ?? 0;
  const todayGrowth = dash?.todayGrowth ?? 0;
  const invoicesToday = dash?.todayInvoices ?? dash?.totalInvoices ?? 0;
  const completedInvoices = dash?.todayCompletedInvoices ?? dash?.completedInvoices ?? 0;
  const pendingInvoices = Math.max(0, invoicesToday - completedInvoices);
  const totalDrugs = dash?.totalDrugs ?? 0;
  const lowStockDrugs = dash?.lowStockDrugs ?? 0;
  const packagesCount = dash?.packagesCount ?? 0;

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Pharmacy Management</h2>
          <p className="text-muted-foreground">Create invoices, manage packages, and handle prescriptions</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push('/dashboard/pharmacy/invoices')}>
            <Receipt className="h-4 w-4 mr-2" />
            View Invoices
          </Button>
          <Button variant="outline" onClick={() => router.push('/dashboard/pharmacy/drugs')}>
            <Pill className="h-4 w-4 mr-2" />
            Manage Drugs
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Today's Sales</p>
                <p className="text-2xl font-bold">₹{todaySales.toFixed(2)}</p>
                <p className={`text-xs flex items-center ${todayGrowth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  <TrendingUp className="h-3 w-3 mr-1" />
                  {todayGrowth >= 0 ? '+' : ''}{todayGrowth.toFixed(1)}% vs last month
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Invoices Today</p>
                <p className="text-2xl font-bold">{invoicesToday}</p>
                <p className="text-xs text-muted-foreground">{pendingInvoices} pending</p>
              </div>
              <Receipt className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Available Drugs</p>
                <p className="text-2xl font-bold">{totalDrugs}</p>
                <p className="text-xs text-orange-600">{lowStockDrugs} low stock</p>
              </div>
              <Pill className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Treatment Packages</p>
                <p className="text-2xl font-bold">{packagesCount}</p>
                <p className="text-xs text-green-600">Dermatology focused</p>
              </div>
              <Package className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="billing" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="billing" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Billing & Invoices
          </TabsTrigger>
          <TabsTrigger value="packages" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            Treatment Packages
          </TabsTrigger>
        </TabsList>
        <TabsContent value="billing" className="space-y-6">
          <PharmacyInvoiceBuilderFixed prefill={prefill || undefined} />
        </TabsContent>
        <TabsContent value="packages" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  <CardTitle className="flex items-center gap-2">Treatment Packages</CardTitle>
                </div>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="h-4 w-4 mr-2" /> Create Package
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-3xl">
                    <DialogHeader>
                      <DialogTitle>Create Treatment Package</DialogTitle>
                    </DialogHeader>
                    <PharmacyPackageCreator onCreated={() => {
                      const ev = new CustomEvent('reload-packages');
                      window.dispatchEvent(ev);
                    }} onCancel={() => {
                      const modal = document.querySelector('[role="dialog"] button[aria-label="Close"]') as HTMLButtonElement | null;
                      modal?.click();
                    }} />
                  </DialogContent>
                </Dialog>
              </div>
              <CardDescription>
                Browse and select from pre-built dermatology treatment packages
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PackagesWithReload />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PackagesWithReload() {
  const [reloadKey, setReloadKey] = useState<string>('init');
  useEffect(() => {
    const handler = () => setReloadKey(String(Date.now()));
    window.addEventListener('reload-packages', handler);
    return () => window.removeEventListener('reload-packages', handler);
  }, []);
  return <PackageBrowser reloadKey={reloadKey} />;
} 