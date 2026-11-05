'use client';

import { LoadingSkeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { Spinner } from '@/components/ui/spinner';
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
      setPrefill(billingPrefill);
    }
    setPharmacyTab(tab);
    const params = new URLSearchParams();
    params.set('section', tab);
    if (billingPrefill?.patientId) params.set('patientId', billingPrefill.patientId);
    if (billingPrefill?.prescriptionId) params.set('prescriptionId', billingPrefill.prescriptionId);
    if (billingPrefill?.doctorId) params.set('doctorId', billingPrefill.doctorId);
    if (billingPrefill?.visitId) params.set('visitId', billingPrefill.visitId);
    router.push(`/dashboard/pharmacy?${params.toString()}`, { scroll: false });
    if (!billingPrefill) focusWorkbench();
  };

  return (
    <main className="flex-1 bg-background p-2 md:p-3">
      <div ref={pharmacyWorkspaceRef} className="mx-auto max-w-[1560px] scroll-mt-3">
        <div className="space-y-3">
          {pharmacyTab !== 'desk' && <PageHeader title={pharmacyTab === 'counter' ? 'Pharmacy Counter' : 'Pharmacy Billing'} />}
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
            <PharmacyBillingPanel
              prefill={prefill}
              onLoadPrescription={(billingPrefill) =>
                openPharmacyTab('billing', billingPrefill)
              }
            />
          ) : null}
        </div>
      </div>
    </main>
  );
}

function PharmacyPageLoading() {
  return (
    <LoadingSkeleton variant="cards" label="Loading pharmacy dashboard…" />
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
      <section className="rounded-lg border border-border bg-card px-3 py-2.5 text-foreground shadow-sm">
        <div className="grid gap-2 xl:grid-cols-[minmax(220px,0.7fr)_minmax(0,1fr)_auto] xl:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <PageHeader title="Pharmacy Desk" />
              <span className="rounded-full border border-success-border/30 bg-success/10 px-2.5 py-0.5 text-xs font-semibold text-success-text">
                Command center
              </span>
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
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
              className="h-8 border-current/15 bg-card/10 text-foreground hover:bg-card/15 hover:text-foreground"
              onClick={() => window.dispatchEvent(new CustomEvent('pharmacy-dashboard-refresh'))}
            >
              <RefreshCcw className="h-4 w-4" />
              Refresh
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-current/15 bg-card/10 text-foreground hover:bg-card/15 hover:text-foreground"
              onClick={onOpenInvoices}
            >
              <Receipt className="h-4 w-4" />
              Invoices
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-current/15 bg-card/10 text-foreground hover:bg-card/15 hover:text-foreground"
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
            detail="Shelves, invoice scanning, expiry"
            onClick={onOpenInventoryControl}
          />
        </div>
      </section>

      {isAgentDockOpen ? (
        <AgenticPharmacyDock />
      ) : (
        <AgenticPharmacyLauncher onOpen={onOpenAgent} />
      )}

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
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
        <PrescriptionDispensingQueue
          onOpenBilling={onOpenBilling}
          openActionLabel="Bill"
        />
      </section>
    </div>
  );
}

/**
 * @cc [owner:nareshshah139,label:product] prescription-load-visible-draft
 * Loading a prescription MUST bring its bill into view. Switching prescriptions MUST
 * create a separate draft so medicines and billing details from another patient cannot carry over.
 */
function PharmacyBillingPanel({
  prefill,
  onLoadPrescription,
}: {
  prefill?: PharmacyBillingPrefill | null;
  onLoadPrescription: (prefill: PharmacyBillingPrefill) => void;
}) {
  const billRef = useRef<HTMLDivElement>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  useEffect(() => {
    if (!prefill?.prescriptionId && !prefill?.visitId) return;
    const frame = requestAnimationFrame(() => {
      billRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      billRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [prefill?.prescriptionId, prefill?.visitId, loadAttempt]);

  return (
    <section className="space-y-3">
      <WorkbenchHeader
        title="Pharmacy Billing"
        detail="Visit drugs auto-load as a draft; pharmacist review is required before label, invoice, payment, and stock deduction."
      />
      <PrescriptionDispensingQueue
        onOpenBilling={(selected) => {
          onLoadPrescription(selected);
          setLoadAttempt(attempt => attempt + 1);
        }}
        openActionLabel="Load"
      />
      <div ref={billRef} role="region" aria-label="Prescription bill" tabIndex={-1} className="scroll-mt-4">
        <PharmacyInvoiceBuilderFixed
          key={`${prefill?.prescriptionId || prefill?.visitId || 'manual'}:${loadAttempt}`}
          prefill={prefill || undefined}
        />
      </div>
    </section>
  );
}

function AgenticPharmacyLauncher({ onOpen }: { onOpen: () => void }) {
  return (
    <section className="rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-card text-foreground">
            <Bot className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-foreground">
              Pharmacy AI assistant
            </h3>
            <p className="truncate text-xs text-muted-foreground">
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
    <section className="rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
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
      triggerVariant="ghost"
      triggerClassName="text-foreground hover:bg-card/10 hover:text-foreground"
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
            'Use Inventory > Pharmacy Control for invoice scanning',
            'Review batch expiry, reorder needs, supplier payments, and purchase costs in Inventory',
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
    green: 'bg-success-soft text-success-text',
    blue: 'bg-info-soft text-info-text',
    purple: 'bg-highlight-soft text-highlight-text',
    amber: 'bg-warning-soft text-warning-text',
  };

  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-current/10 bg-card/10 px-2.5 py-1.5">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-base font-semibold leading-5 text-foreground">{value}</p>
        <p className="flex items-center text-xs leading-4 text-muted-foreground">
          {label === "Today's sales" && <TrendingUp className="mr-1 h-3 w-3 text-success-text" />}
          {detail}
        </p>
      </div>
      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${colors[intent]}`}>
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
      className="group flex items-center justify-between gap-2 rounded-md border border-current/10 bg-card/10 px-2.5 py-1.5 text-left transition hover:-translate-y-0.5 hover:bg-card/15"
    >
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-card text-foreground">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{title}</p>
          <p className="truncate text-xs text-muted-foreground">{detail}</p>
        </div>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" />
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
    <div className="flex flex-col gap-2 rounded-md border border-border bg-card px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-lg font-semibold text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{detail}</p>
      </div>
      <div className="flex items-center gap-2 rounded-full border border-success-border bg-success-soft px-3 py-1 text-xs font-semibold text-success-text">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Validate before adding stock
      </div>
    </div>
  );
}

function PackagesPanel() {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
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
