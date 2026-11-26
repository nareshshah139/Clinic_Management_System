'use client';

import { LoadingSkeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { Spinner } from '@/components/ui/spinner';
import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PackageBrowser } from '@/components/pharmacy/PackageBrowser';
import { PharmacyPackageCreator } from '@/components/pharmacy/PharmacyPackageCreator';
import { PartnerDailySync } from '@/components/pharmacy/PartnerDailySync';
import { PharmacyCounterCockpit } from '@/components/pharmacy/PharmacyCounterCockpit';
import { apiClient } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { QuickGuide } from '@/components/common/QuickGuide';
import {
  ArrowRight,
  Bot,
  ClipboardCheck,
  MessageSquare,
  Package,
  Pill,
  Plus,
  Receipt,
  RefreshCcw,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { billHref, type BillPrefill } from '@/components/pharmacy/sales/sales-bill-model';
import { useDashboardUser } from '@/components/layout/dashboard-user-context';
import { canSellPharmacy } from '@/lib/pharmacy-access';

const AgenticPharmacyDock = dynamic(
  () =>
    import('@/components/pharmacy/AgenticPharmacyDock').then(
      (mod) => mod.AgenticPharmacyDock,
    ),
  {
    ssr: false,
    loading: () => <AgenticPharmacyDockLoading />,
  },
);

type PharmacySideTab = 'desk' | 'counter';

interface PharmacyDashboardData {
  todaySales?: number;
  todayGrowth?: number;
  todayInvoices?: number;
  totalInvoices?: number;
  todayCompletedInvoices?: number;
  completedInvoices?: number;
  lowStockDrugs?: number;
  packagesCount?: number;
}

export function PharmacyWorkspace() {
  return (
    <Suspense fallback={<PharmacyPageLoading />}>
      <PharmacyPageContent />
    </Suspense>
  );
}

function PharmacyPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pharmacyWorkspaceRef = useRef<HTMLDivElement | null>(null);
  const [dash, setDash] = useState<PharmacyDashboardData | null>(null);
  const [dashReloadKey, setDashReloadKey] = useState<number>(0);
  const [isAgentDockOpen, setIsAgentDockOpen] = useState(false);
  const requestedTab = searchParams.get('section') || searchParams.get('tab');
  const pharmacyTab: PharmacySideTab = requestedTab === 'counter' ? 'counter' : 'desk';
  const { user, loading } = useDashboardUser();
  const isAuthenticated = !!user;
  const isLoading = loading && !isAuthenticated;
  const sells = canSellPharmacy(user?.role);

  useEffect(() => {
    if (isLoading || user) return;
    router.push('/login?next=' + encodeURIComponent(window.location.pathname + window.location.search));
  }, [isLoading, user, router]);

  useEffect(() => {
    const loadDashboard = async () => {
      if (!isAuthenticated || pharmacyTab !== 'desk' || !sells) return;
      try {
        const data = await apiClient.get<PharmacyDashboardData>('/pharmacy/dashboard');
        setDash(data ?? null);
      } catch (e) {
        console.error('Failed to load pharmacy dashboard', e);
        setDash(null);
      }
    };
    void loadDashboard();
  }, [isAuthenticated, pharmacyTab, sells, dashReloadKey]);

  useEffect(() => {
    const handler = () => setDashReloadKey((k) => k + 1);
    window.addEventListener('pharmacy-dashboard-refresh', handler);
    return () => window.removeEventListener('pharmacy-dashboard-refresh', handler);
  }, []);

  if (isLoading) {
    return (
      <LoadingSkeleton variant="cards" label="Loading pharmacy dashboard…" />
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
  const lowStockDrugs = dash?.lowStockDrugs ?? 0;
  const packagesCount = dash?.packagesCount ?? 0;

  const focusWorkbench = () => {
    requestAnimationFrame(() => {
      pharmacyWorkspaceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const openPharmacyTab = (tab: PharmacySideTab) => {
    router.push(`/dashboard/pharmacy?section=${tab}`, { scroll: false });
    focusWorkbench();
  };
  const openBill = (prefill?: BillPrefill) => router.push(billHref({ prefill }));

  return (
    <div className="flex-1">
      <div ref={pharmacyWorkspaceRef} className="mx-auto max-w-[1560px] scroll-mt-3">
        <div className="space-y-3">
          {pharmacyTab === 'desk' ? (
            <PharmacyDeskPanel
              sells={sells}
              todaySales={todaySales}
              todayGrowth={todayGrowth}
              invoicesToday={invoicesToday}
              pendingInvoices={pendingInvoices}
              lowStockDrugs={lowStockDrugs}
              packagesCount={packagesCount}
              isAgentDockOpen={isAgentDockOpen}
              onOpenAgent={() => setIsAgentDockOpen(true)}
              onOpenCounter={() => openPharmacyTab('counter')}
              onOpenInventoryControl={() => router.push('/dashboard/inventory?tab=pharmacy-control')}
              onOpenInvoices={() => router.push('/dashboard/pharmacy/invoices')}
              onOpenDrugs={() => router.push('/dashboard/pharmacy/drugs')}
            />
          ) : null}

          {pharmacyTab === 'counter' ? (
            <PharmacyCounterCockpit onOpenBilling={sells ? openBill : undefined} />
          ) : null}

        </div>
      </div>
    </div>
  );
}

function PharmacyPageLoading() {
  return (
    <LoadingSkeleton variant="cards" label="Loading pharmacy dashboard…" />
  );
}

function PharmacyDeskPanel({
  sells,
  todaySales,
  todayGrowth,
  invoicesToday,
  pendingInvoices,
  lowStockDrugs,
  packagesCount,
  isAgentDockOpen,
  onOpenAgent,
  onOpenCounter,
  onOpenInventoryControl,
  onOpenInvoices,
  onOpenDrugs,
}: {
  sells: boolean;
  todaySales: number;
  todayGrowth: number;
  invoicesToday: number;
  pendingInvoices: number;
  lowStockDrugs: number;
  packagesCount: number;
  isAgentDockOpen: boolean;
  onOpenAgent: () => void;
  onOpenCounter: () => void;
  onOpenInventoryControl: () => void;
  onOpenInvoices: () => void;
  onOpenDrugs: () => void;
}) {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
      <PageHeader
        title="Pharmacy Desk"
        actions={
          <>
            <PharmacyGuide />
            {sells && (
              <>
                <Button size="sm" variant="outline" onClick={() => window.dispatchEvent(new CustomEvent('pharmacy-dashboard-refresh'))}>
                  <RefreshCcw className="h-4 w-4" />
                  Refresh
                </Button>
                <Button size="sm" variant="outline" onClick={onOpenInvoices}>
                  <Receipt className="h-4 w-4" />
                  Invoices
                </Button>
                <Button size="sm" variant="outline" onClick={onOpenDrugs}>
                  <Pill className="h-4 w-4" />
                  Drugs
                </Button>
              </>
            )}
          </>
        }
      />

      {sells && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricStrip label="Sales" value={`₹${todaySales.toFixed(2)}`} detail={`${todayGrowth >= 0 ? '+' : ''}${todayGrowth.toFixed(1)}%`} />
          <MetricStrip label="Invoices" value={invoicesToday} detail={`${pendingInvoices} pending`} />
          <MetricStrip label="Low stock" value={lowStockDrugs} detail="at or below minimum stock" />
          <MetricStrip label="Packages" value={packagesCount} />
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <QuickAction
          icon={<ClipboardCheck className="h-4 w-4" />}
          title="Pharmacy Counter"
          onClick={onOpenCounter}
        />
        <QuickAction
          icon={<Package className="h-4 w-4" />}
          title="Inventory Control"
          onClick={onOpenInventoryControl}
        />
      </div>

      {isAgentDockOpen ? (
        <AgenticPharmacyDock />
      ) : (
        <AgenticPharmacyLauncher onOpen={onOpenAgent} />
      )}
      </div>

      <PartnerDailySync />
      <PackagesPanel />
    </div>
  );
}

function AgenticPharmacyLauncher({ onOpen }: { onOpen: () => void }) {
  return (
    <section className="rounded-lg border bg-card px-4 py-3 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
            <Bot className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-foreground">
              Pharmacy assistant
            </h3>
            <p className="truncate text-xs text-muted-foreground">
              Ask about stock and drug records. You approve every change.
            </p>
          </div>
        </div>
        <Button size="sm" className="h-9 shrink-0 gap-2" onClick={onOpen}>
          <MessageSquare className="h-4 w-4" />
          Open assistant
        </Button>
      </div>
    </section>
  );
}

function AgenticPharmacyDockLoading() {
  return (
    <section className="rounded-lg border bg-card px-4 py-3 shadow-sm">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Spinner className="h-4 w-4     " />
        Loading pharmacy assistant…
      </div>
    </section>
  );
}

function PharmacyGuide() {
  return (
    <QuickGuide
      title="Pharmacy Management Guide"
      sections={[
        {
          title: 'Prescriptions',
          items: [
            'Prescriptions saved in a visit wait in the Pharmacy Counter queue',
            'Check each medicine against stock: accept it, substitute, edit, or mark it unavailable with a reason',
            'Mark the prescription Ready to bill, then press Bill',
          ],
        },
        {
          title: 'Billing',
          items: [
            'Create GST pharmacy bills from Pharmacy Counter > New bill, or save one as a draft to finish later',
            'Take payment by cash, UPI, card, net banking, wallet or insurance',
            'Confirming a bill takes the medicines out of stock',
          ],
        },
        {
          title: 'Inventory',
          items: [
            'Scan or type a supplier bill in Inventory > Purchases > Scan or enter bill',
            'Import a supplier CSV in Inventory > Purchases > Import CSV',
            'Inventory > Today lists the jobs due, such as low stock and expiring batches',
          ],
        },
      ]}
    />
  );
}

function MetricStrip({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 shadow-sm">
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="truncate text-xl font-semibold tabular-nums text-foreground">{value}</p>
        {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
      </div>
    </div>
  );
}

function QuickAction({ icon, title, onClick }: { icon: ReactNode; title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 text-left shadow-sm transition-colors hover:bg-accent"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
          {icon}
        </div>
        <p className="min-w-0 truncate text-sm font-semibold text-foreground">{title}</p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" />
    </button>
  );
}

function PackagesPanel() {
  const [createOpen, setCreateOpen] = useState(false);
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Treatment packages</CardTitle>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" /> Create package
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Create treatment package</DialogTitle>
              </DialogHeader>
              <PharmacyPackageCreator onCreated={() => {
                const ev = new CustomEvent('reload-packages');
                window.dispatchEvent(ev);
                setCreateOpen(false);
              }} onCancel={() => setCreateOpen(false)} />
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <PackagesWithReload />
      </CardContent>
    </Card>
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
