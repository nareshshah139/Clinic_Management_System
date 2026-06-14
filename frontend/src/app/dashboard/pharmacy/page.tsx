'use client';

import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PharmacyInvoiceBuilderFixed } from '@/components/pharmacy/PharmacyInvoiceBuilderFixed';
import { PackageBrowser } from '@/components/pharmacy/PackageBrowser';
import { PharmacyPackageCreator } from '@/components/pharmacy/PharmacyPackageCreator';
import { PrescriptionDispensingQueue } from '@/components/pharmacy/PrescriptionDispensingQueue';
import { PartnerDailySync } from '@/components/pharmacy/PartnerDailySync';
import { PharmacyCounterCockpit } from '@/components/pharmacy/PharmacyCounterCockpit';
import { apiClient } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { QuickGuide } from '@/components/common/QuickGuide';
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  DollarSign,
  MessageSquare,
  Package,
  Pill,
  Plus,
  Receipt,
  RefreshCcw,
  TrendingUp,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';

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

type PharmacySideTab = 'desk' | 'counter' | 'billing';
type PharmacyBillingPrefill = {
  patientId?: string;
  prescriptionId?: string;
  doctorId?: string;
  visitId?: string;
};

interface PharmacyDashboardData {
  todaySales?: number;
  todayGrowth?: number;
  todayInvoices?: number;
  totalInvoices?: number;
  todayCompletedInvoices?: number;
  completedInvoices?: number;
  totalDrugs?: number;
  lowStockDrugs?: number;
  packagesCount?: number;
}

export default function PharmacyPage() {
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
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [dash, setDash] = useState<PharmacyDashboardData | null>(null);
  const [dashReloadKey, setDashReloadKey] = useState<number>(0);
  const [pharmacyTab, setPharmacyTab] = useState<PharmacySideTab>('desk');
  const [prefill, setPrefill] = useState<PharmacyBillingPrefill | null>(null);
  const [isAgentDockOpen, setIsAgentDockOpen] = useState(false);

  useEffect(() => {
    const requestedTab = searchParams.get('section') || searchParams.get('tab') || '';
    const patientId = searchParams.get('patientId') || undefined;
    const prescriptionId = searchParams.get('prescriptionId') || undefined;
    const doctorId = searchParams.get('doctorId') || undefined;
    const visitId = searchParams.get('visitId') || undefined;
    let nextTab: PharmacySideTab = 'desk';

    if (requestedTab === 'desk' || requestedTab === 'counter' || requestedTab === 'billing') {
      nextTab = requestedTab;
    } else if (requestedTab === 'invoices' || requestedTab === 'payments') {
      nextTab = 'billing';
    }

    if (patientId || prescriptionId || doctorId || visitId) {
      setPrefill({ patientId, prescriptionId, doctorId, visitId });
      nextTab = 'billing';
    } else {
      setPrefill(null);
    }

    setPharmacyTab(nextTab);
  }, [searchParams]);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        await apiClient.get('/auth/me');
        setIsAuthenticated(true);
      } catch {
        const next = typeof window !== 'undefined'
          ? window.location.pathname + window.location.search
          : '/dashboard/pharmacy';
        router.push('/login?next=' + encodeURIComponent(next));
      } finally {
        setIsLoading(false);
      }
    };

    void checkAuth();
  }, [router]);

  useEffect(() => {
    const loadDashboard = async () => {
      if (!isAuthenticated) return;
      try {
        const data = await apiClient.get<PharmacyDashboardData>('/pharmacy/dashboard');
        setDash(data ?? null);
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

  const focusWorkbench = () => {
    requestAnimationFrame(() => {
      pharmacyWorkspaceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const openPharmacyTab = (tab: PharmacySideTab, billingPrefill?: PharmacyBillingPrefill) => {
    if (billingPrefill) {
      setPrefill((current) => ({
        ...(current ?? {}),
        ...billingPrefill,
      }));
    }
    setPharmacyTab(tab);
    const params = new URLSearchParams();
    params.set('section', tab);
    if (billingPrefill?.patientId) params.set('patientId', billingPrefill.patientId);
    if (billingPrefill?.prescriptionId) params.set('prescriptionId', billingPrefill.prescriptionId);
    if (billingPrefill?.doctorId) params.set('doctorId', billingPrefill.doctorId);
    if (billingPrefill?.visitId) params.set('visitId', billingPrefill.visitId);
    router.push(`/dashboard/pharmacy?${params.toString()}`);
    focusWorkbench();
  };

  return (
    <main className="flex-1 bg-[#eef4f8] p-2 md:p-3">
      <div ref={pharmacyWorkspaceRef} className="mx-auto max-w-[1560px] scroll-mt-3">
        <div className="space-y-3">
          {pharmacyTab === 'desk' ? (
            <PharmacyDeskPanel
              todaySales={todaySales}
              todayGrowth={todayGrowth}
              invoicesToday={invoicesToday}
              pendingInvoices={pendingInvoices}
              totalDrugs={totalDrugs}
              lowStockDrugs={lowStockDrugs}
              packagesCount={packagesCount}
              isAgentDockOpen={isAgentDockOpen}
              onOpenAgent={() => setIsAgentDockOpen(true)}
              onOpenCounter={() => openPharmacyTab('counter')}
              onOpenBilling={() => openPharmacyTab('billing')}
              onOpenInventoryControl={() => router.push('/dashboard/inventory?tab=pharmacy-control')}
              onOpenInvoices={() => router.push('/dashboard/pharmacy/invoices')}
              onOpenDrugs={() => router.push('/dashboard/pharmacy/drugs')}
            />
          ) : null}

          {pharmacyTab === 'counter' ? (
            <PharmacyCounterPanel
              prefill={prefill}
              onOpenBilling={(billingPrefill) => openPharmacyTab('billing', billingPrefill)}
              onOpenPartnerSync={() => openPharmacyTab('desk')}
              onOpenInventoryControl={() => router.push('/dashboard/inventory?tab=pharmacy-control&section=shelf')}
            />
          ) : null}

          {pharmacyTab === 'billing' ? (
            <PharmacyBillingPanel prefill={prefill} />
          ) : null}
        </div>
      </div>
    </main>
  );
}

function PharmacyPageLoading() {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-muted-foreground">Loading pharmacy dashboard...</p>
      </div>
    </div>
  );
}

function PharmacyDeskPanel({
  todaySales,
  todayGrowth,
  invoicesToday,
  pendingInvoices,
  totalDrugs,
  lowStockDrugs,
  packagesCount,
  isAgentDockOpen,
  onOpenAgent,
  onOpenCounter,
  onOpenBilling,
  onOpenInventoryControl,
  onOpenInvoices,
  onOpenDrugs,
}: {
  todaySales: number;
  todayGrowth: number;
  invoicesToday: number;
  pendingInvoices: number;
  totalDrugs: number;
  lowStockDrugs: number;
  packagesCount: number;
  isAgentDockOpen: boolean;
  onOpenAgent: () => void;
  onOpenCounter: () => void;
  onOpenBilling: () => void;
  onOpenInventoryControl: () => void;
  onOpenInvoices: () => void;
  onOpenDrugs: () => void;
}) {
  return (
    <div className="space-y-3">
      <section className="rounded-[12px] border border-slate-800 bg-slate-950 px-3 py-2.5 text-white shadow-[0_14px_40px_rgba(15,23,42,0.10)]">
        <div className="grid gap-2 xl:grid-cols-[minmax(220px,0.7fr)_minmax(0,1fr)_auto] xl:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold tracking-tight">
                Pharmacy Desk
              </h2>
              <span className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-100">
                Command center
              </span>
            </div>
            <p className="mt-0.5 truncate text-xs text-slate-300">
              Queue, review, pick, bill, pay, dispense.
            </p>
          </div>

          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
            <MetricStrip
              label="Sales"
              value={`₹${todaySales.toFixed(2)}`}
              detail={`${todayGrowth >= 0 ? '+' : ''}${todayGrowth.toFixed(1)}%`}
              icon={<DollarSign className="h-4 w-4" />}
              intent="green"
            />
            <MetricStrip
              label="Invoices"
              value={invoicesToday}
              detail={`${pendingInvoices} pending`}
              icon={<Receipt className="h-4 w-4" />}
              intent="blue"
            />
            <MetricStrip
              label="Stock"
              value={totalDrugs}
              detail={`${lowStockDrugs} low`}
              icon={<Pill className="h-4 w-4" />}
              intent="purple"
            />
            <MetricStrip
              label="Packages"
              value={packagesCount}
              detail="bundles"
              icon={<Package className="h-4 w-4" />}
              intent="amber"
            />
          </div>

          <div className="flex flex-wrap justify-start gap-1.5 xl:justify-end">
            <PharmacyGuide />
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-white/15 bg-white/10 text-white hover:bg-white/15 hover:text-white"
              onClick={() => window.dispatchEvent(new CustomEvent('pharmacy-dashboard-refresh'))}
            >
              <RefreshCcw className="h-4 w-4" />
              Refresh
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-white/15 bg-white/10 text-white hover:bg-white/15 hover:text-white"
              onClick={onOpenInvoices}
            >
              <Receipt className="h-4 w-4" />
              Invoices
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-white/15 bg-white/10 text-white hover:bg-white/15 hover:text-white"
              onClick={onOpenDrugs}
            >
              <Pill className="h-4 w-4" />
              Drugs
            </Button>
          </div>
        </div>

        <div className="mt-2 grid gap-1.5 lg:grid-cols-3">
          <QuickAction
            icon={<ClipboardCheck className="h-4 w-4" />}
            title="Pharmacy Counter"
            detail="Review and pick"
            onClick={onOpenCounter}
          />
          <QuickAction
            icon={<Receipt className="h-4 w-4" />}
            title="Pharmacy Billing"
            detail="Invoice and payment"
            onClick={onOpenBilling}
          />
          <QuickAction
            icon={<Package className="h-4 w-4" />}
            title="Inventory Control"
            detail="Shelf, OCR, FEFO"
            onClick={onOpenInventoryControl}
          />
        </div>
      </section>

      {isAgentDockOpen ? (
        <AgenticPharmacyDock />
      ) : (
        <AgenticPharmacyLauncher onOpen={onOpenAgent} />
      )}

      <div className="grid gap-3 xl:grid-cols-2">
        <PartnerDailySync />
        <PackagesPanel />
      </div>
    </div>
  );
}

function PharmacyCounterPanel({
  prefill,
  onOpenBilling,
  onOpenPartnerSync,
  onOpenInventoryControl,
}: {
  prefill?: PharmacyBillingPrefill | null;
  onOpenBilling: (prefill?: PharmacyBillingPrefill) => void;
  onOpenPartnerSync: () => void;
  onOpenInventoryControl: () => void;
}) {
  return (
    <div className="space-y-3">
      <PharmacyCounterCockpit
        prefill={prefill}
        onOpenBilling={onOpenBilling}
        onOpenQueue={() => undefined}
        onOpenPartnerSync={onOpenPartnerSync}
        onOpenInventoryControl={onOpenInventoryControl}
      />

      <section className="space-y-3">
        <WorkbenchHeader
          title="Prescription Queue"
          detail="Review visit prescriptions and send approved medicines into Pharmacy Billing."
        />
        <PrescriptionDispensingQueue />
      </section>
    </div>
  );
}

function PharmacyBillingPanel({
  prefill,
}: {
  prefill?: PharmacyBillingPrefill | null;
}) {
  return (
    <section className="space-y-3">
      <WorkbenchHeader
        title="Pharmacy Billing"
        detail="Visit drugs auto-load as a draft; pharmacist review is required before label, invoice, payment, and stock deduction."
      />
      <PharmacyInvoiceBuilderFixed prefill={prefill || undefined} />
    </section>
  );
}

function AgenticPharmacyLauncher({ onOpen }: { onOpen: () => void }) {
  return (
    <section className="rounded-[10px] border border-slate-200 bg-white px-4 py-3 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-slate-950 text-white">
            <Bot className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-slate-950">
              Agentic Pharmacy
            </h3>
            <p className="truncate text-xs text-slate-500">
              Opens when needed.
            </p>
          </div>
        </div>
        <Button size="sm" className="h-9 shrink-0 gap-2" onClick={onOpen}>
          <MessageSquare className="h-4 w-4" />
          Open AI Assistant
        </Button>
      </div>
    </section>
  );
}

function AgenticPharmacyDockLoading() {
  return (
    <section className="rounded-[10px] border border-slate-200 bg-white px-4 py-3 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
      <div className="flex items-center gap-3 text-sm text-slate-600">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-slate-800" />
        Loading Agentic Pharmacy...
      </div>
    </section>
  );
}

function PharmacyGuide() {
  return (
    <QuickGuide
      title="Pharmacy Management Guide"
      triggerVariant="ghost"
      triggerClassName="text-white hover:bg-white/10 hover:text-white"
      sections={[
        {
          title: 'Prescription & Auto-Fill',
          items: [
            'Open prescriptions from Visits or the Rx queue',
            'Review auto-loaded medicines before billing',
            'Check stock warnings, alternatives, quantity, discount, and payment',
            'Finalize only after pharmacist confirmation',
          ],
        },
        {
          title: 'Billing',
          items: [
            'Create GST pharmacy invoices from the Billing & GST tab',
            'Use payment modes such as cash, UPI, card, or insurance',
            'Confirmed invoices deduct stock and keep patient records linked',
          ],
        },
        {
          title: 'Inventory Controls',
          items: [
            'Use Inventory > Pharmacy Control for Excel import',
            'Use Inventory > Pharmacy Control for supplier invoice OCR',
            'Review FEFO, expiry, reorder, ledger, and cost analytics in Inventory',
          ],
        },
      ]}
    />
  );
}

function MetricStrip({
  label,
  value,
  detail,
  icon,
  intent,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: ReactNode;
  intent: 'green' | 'blue' | 'purple' | 'amber';
}) {
  const colors = {
    green: 'bg-emerald-50 text-emerald-700',
    blue: 'bg-blue-50 text-blue-700',
    purple: 'bg-violet-50 text-violet-700',
    amber: 'bg-amber-50 text-amber-700',
  };

  return (
    <div className="flex items-center justify-between gap-2 rounded-[8px] border border-white/10 bg-white/10 px-2.5 py-1.5">
      <div className="min-w-0">
        <p className="text-[11px] text-slate-300">{label}</p>
        <p className="truncate text-base font-semibold leading-5 text-white">{value}</p>
        <p className="flex items-center text-[10px] leading-4 text-slate-400">
          {label === "Today's sales" && <TrendingUp className="mr-1 h-3 w-3 text-emerald-700" />}
          {detail}
        </p>
      </div>
      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] ${colors[intent]}`}>
        {icon}
      </div>
    </div>
  );
}

function QuickAction({
  icon,
  title,
  detail,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center justify-between gap-2 rounded-[8px] border border-white/10 bg-white/10 px-2.5 py-1.5 text-left transition hover:-translate-y-0.5 hover:bg-white/15"
    >
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-white text-slate-950">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{title}</p>
          <p className="truncate text-[11px] text-slate-300">{detail}</p>
        </div>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-1" />
    </button>
  );
}

function WorkbenchHeader({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-[8px] border border-slate-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-lg font-semibold text-slate-950">{title}</p>
        <p className="text-sm text-slate-600">{detail}</p>
      </div>
      <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Review before commit
      </div>
    </div>
  );
}

function PackagesPanel() {
  return (
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
