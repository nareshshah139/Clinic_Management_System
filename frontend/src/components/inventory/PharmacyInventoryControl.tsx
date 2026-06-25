'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  DollarSign,
  FileUp,
  MapPin,
  ShieldCheck,
} from 'lucide-react';
import {
  Tabs,
  TabsContent,
  TabsFontSizeControls,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { PharmacyInventoryStarterImport } from '@/components/pharmacy/PharmacyInventoryStarterImport';
import { PurchaseInvoiceWorkbench } from '@/components/pharmacy/PurchaseInvoiceWorkbench';
import { DistributorAnalytics } from '@/components/pharmacy/DistributorAnalytics';
import { PurchaseLedger } from '@/components/pharmacy/PurchaseLedger';
import { ComplianceCenter } from '@/components/pharmacy/ComplianceCenter';
import { ShelfIntelligence } from '@/components/inventory/ShelfIntelligence';

type InventoryControlTab =
  | 'order-ocr'
  | 'shelf-intelligence'
  | 'cost-analytics'
  | 'ledger'
  | 'compliance';

export function PharmacyInventoryControl() {
  const workbenchRef = useRef<HTMLDivElement | null>(null);
  const [inventoryTab, setInventoryTab] =
    useState<InventoryControlTab>('order-ocr');

  useEffect(() => {
    const section =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('section')
        : null;
    if (section === 'shelf') {
      setInventoryTab('shelf-intelligence');
      requestAnimationFrame(() => {
        workbenchRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      });
    }
  }, []);

  const openInventory = (tab: InventoryControlTab) => {
    setInventoryTab(tab);
    requestAnimationFrame(() => {
      workbenchRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  };

  return (
    <div className="space-y-5">
      <InventoryControlSummary />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0">
          <PharmacyInventoryStarterImport compact />
        </div>
        <div className="grid gap-3">
          <ScenarioCard
            active={inventoryTab === 'order-ocr'}
            icon={<FileUp className="h-4 w-4" />}
            title="Supplier invoice OCR"
            detail="Read bills, match HSN/GST/batches, update costs, then commit stock after review."
            action="Scan invoice"
            onClick={() => openInventory('order-ocr')}
          />
          <ScenarioCard
            active={inventoryTab === 'shelf-intelligence'}
            icon={<MapPin className="h-4 w-4" />}
            title="Shelf Intelligence"
            detail="Map rack/shelf/bin locations, rotate FEFO batches, count by shelf, and post variances."
            action="Optimize shelves"
            onClick={() => openInventory('shelf-intelligence')}
          />
          <ScenarioCard
            active={inventoryTab === 'cost-analytics'}
            icon={<BarChart3 className="h-4 w-4" />}
            title="Cost Analytics"
            detail="Find distributor price movement, discount drops, free-stock ratios, and GST patterns."
            action="Analyze cost"
            onClick={() => openInventory('cost-analytics')}
          />
          <ScenarioCard
            active={inventoryTab === 'ledger'}
            icon={<DollarSign className="h-4 w-4" />}
            title="Purchase ledger"
            detail="Track distributor invoices, due dates, UPI/cash payments, and allocation."
            action="Open ledger"
            onClick={() => openInventory('ledger')}
          />
          <ScenarioCard
            active={inventoryTab === 'compliance'}
            icon={<ShieldCheck className="h-4 w-4" />}
            title="Batch, expiry & FEFO"
            detail="Watch GST, expiry returns, FEFO stock picks, and audit adjustments."
            action="Control stock"
            onClick={() => openInventory('compliance')}
          />
        </div>
      </section>

      <section ref={workbenchRef} className="scroll-mt-4 space-y-3">
        <WorkbenchHeader
          title="Pharmacy Inventory Control"
          detail="Excel starts stock, supplier OCR receives orders, Shelf Intelligence controls location-aware picking, and analytics explains costs."
        />
        <Tabs
          value={inventoryTab}
          onValueChange={(value: string) =>
            setInventoryTab(value as InventoryControlTab)
          }
          className="space-y-4"
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-[8px] bg-slate-100 p-1 lg:grid-cols-5">
              <TabsTrigger value="order-ocr" className="min-h-10 gap-2">
                <FileUp className="h-4 w-4" />
                Supplier OCR
              </TabsTrigger>
              <TabsTrigger value="shelf-intelligence" className="min-h-10 gap-2">
                <MapPin className="h-4 w-4" />
                Shelf Intel
              </TabsTrigger>
              <TabsTrigger value="cost-analytics" className="min-h-10 gap-2">
                <BarChart3 className="h-4 w-4" />
                Cost Analytics
              </TabsTrigger>
              <TabsTrigger value="ledger" className="min-h-10 gap-2">
                <DollarSign className="h-4 w-4" />
                Ledger
              </TabsTrigger>
              <TabsTrigger value="compliance" className="min-h-10 gap-2">
                <ShieldCheck className="h-4 w-4" />
                Compliance
              </TabsTrigger>
            </TabsList>
            <TabsFontSizeControls className="shrink-0 justify-end" />
          </div>

          <TabsContent value="order-ocr" className="space-y-6">
            <PurchaseInvoiceWorkbench />
          </TabsContent>
          <TabsContent value="shelf-intelligence" className="space-y-6">
            <ShelfIntelligence />
          </TabsContent>
          <TabsContent value="cost-analytics" className="space-y-6">
            <DistributorAnalytics />
          </TabsContent>
          <TabsContent value="ledger" className="space-y-6">
            <PurchaseLedger />
          </TabsContent>
          <TabsContent value="compliance" className="space-y-6">
            <ComplianceCenter />
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
}

function InventoryControlSummary() {
  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <InventoryControlCard
        title="Live inventory tracking"
        detail="Sales, purchase commits, Excel imports, and returns move stock through auditable transactions."
        points={[
          'Sale deducts stock',
          'Purchase OCR commits stock',
          'Manual correction with reason',
        ]}
      />
      <InventoryControlCard
        title="Expiry, batch & FEFO"
        detail="Batch numbers and expiry dates are preserved so older valid stock can be dispensed first."
        points={['FEFO deduction', 'Near-expiry alerts', 'Expiry return review']}
      />
      <InventoryControlCard
        title="Shelf intelligence"
        detail="Shelf, rack, bin, and fridge location drives picking, replenishment, cycle counts, and variance correction."
        points={['Pick assist', 'Shelf counts', 'Unmapped queue']}
      />
      <InventoryControlCard
        title="Reorder control"
        detail="Minimum stock levels, low-stock alerts, and prediction screens guide purchase planning."
        points={['Min/max levels', 'Low-stock queue', 'Purchase planning']}
      />
    </section>
  );
}

function InventoryControlCard({
  title,
  detail,
  points,
}: {
  title: string;
  detail: string;
  points: string[];
}) {
  return (
    <div className="rounded-[8px] border border-slate-200 bg-white p-4 shadow-sm">
      <p className="font-semibold text-slate-950">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{detail}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {points.map((point) => (
          <span
            key={point}
            className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700"
          >
            {point}
          </span>
        ))}
      </div>
    </div>
  );
}

function ScenarioCard({
  active,
  icon,
  title,
  detail,
  action,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  title: string;
  detail: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex min-h-36 flex-col justify-between rounded-[8px] border p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${
        active
          ? 'border-slate-950 bg-slate-950 text-white'
          : 'border-slate-200 bg-white text-slate-950 hover:border-slate-300'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-[8px] ${
            active ? 'bg-white text-slate-950' : 'bg-slate-100 text-slate-700'
          }`}
        >
          {icon}
        </div>
        <ArrowRight
          className={`h-4 w-4 transition-transform group-hover:translate-x-1 ${
            active ? 'text-white' : 'text-slate-400'
          }`}
        />
      </div>
      <div>
        <p className="mt-4 text-base font-semibold">{title}</p>
        <p
          className={`mt-2 text-sm leading-5 ${
            active ? 'text-slate-300' : 'text-slate-600'
          }`}
        >
          {detail}
        </p>
        <p
          className={`mt-3 text-xs font-semibold uppercase tracking-normal ${
            active ? 'text-emerald-300' : 'text-emerald-700'
          }`}
        >
          {action}
        </p>
      </div>
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
