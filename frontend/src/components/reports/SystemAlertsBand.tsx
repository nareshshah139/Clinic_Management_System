'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import { AlertCircle, ChevronDown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { displayClinicDate } from '@/lib/date-display';
import { paymentModeLabel } from '@/lib/clinic-payment-modes';
import { LOW_STOCK_DEFINITION, LOW_STOCK_HREF, OVERDUE_BILLS_HREF, UPCOMING_DEFINITION } from '@/lib/clinic-counts';
import { can, type Capability } from '@/lib/role-capabilities';
import { useOptionalDashboardUser } from '@/components/layout/dashboard-user-context';
import type { StatusVariant } from '@/lib/status-variants';

export interface SystemAlerts {
  counts: {
    overdueInvoices: number;
    lowStockAlerts: number;
    expiryAlerts: number;
    pendingPayments: number;
    upcomingAppointments: number;
  };
  overdueInvoices?: Array<{ id: string; invoiceNo: string; total: number; dueDate: string | null; patient?: { id: string; name: string } | null }>;
  lowStockAlerts?: Array<{ itemId: string; itemName: string; currentStock: number; reorderLevel: number }>;
  expiryAlerts?: Array<{ itemId: string; itemName: string; daysUntilExpiry: number; currentStock: number }>;
  pendingPayments?: Array<{ id: string; amount: number; mode: string; createdAt: string; invoice?: { invoiceNo: string } | null }>;
  upcomingAppointments?: Array<{ id: string; time: string; slot: string | null; patientName: string; doctorName: string }>;
}

type AlertKey = keyof SystemAlerts['counts'];
type Row = { id: string; text: string; href?: string };
type AlertList = { href: string; label: string; capability: Capability };

const rupees = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

const ALERT_ITEMS: Array<{ key: AlertKey; label: string; tone: StatusVariant; note?: string; list?: AlertList; rowCapability?: Capability; rows: (alerts: SystemAlerts) => Row[] }> = [
  {
    key: 'overdueInvoices', label: 'Overdue Invoices', tone: 'danger', list: { href: OVERDUE_BILLS_HREF, label: 'Open overdue clinic bills', capability: 'billing' }, rowCapability: 'patients',
    rows: (a) => (a.overdueInvoices ?? []).map((invoice) => ({
      id: invoice.id,
      text: `${invoice.invoiceNo} · ${invoice.patient?.name ?? 'Patient'} · ${rupees.format(invoice.total)}${invoice.dueDate ? ` · due ${displayClinicDate(invoice.dueDate)}` : ''}`,
      href: invoice.patient ? `/dashboard/patients/${encodeURIComponent(invoice.patient.id)}` : undefined,
    })),
  },
  {
    key: 'lowStockAlerts', label: 'Low Stock', tone: 'warning', note: LOW_STOCK_DEFINITION, list: { href: LOW_STOCK_HREF, label: 'Open low stock in Inventory', capability: 'inventory' },
    rows: (a) => (a.lowStockAlerts ?? []).map((item) => ({ id: item.itemId, text: `${item.itemName} · ${item.currentStock} left, minimum ${item.reorderLevel}` })),
  },
  {
    key: 'expiryAlerts', label: 'Expiry Alerts', tone: 'warning', note: 'expiring within 30 days',
    list: { href: '/dashboard/inventory?area=stock&view=list&expiryMonths=1', label: 'Open expiring stock in Inventory', capability: 'inventory' },
    rows: (a) => (a.expiryAlerts ?? []).map((item) => ({ id: item.itemId, text: `${item.itemName} · expires in ${item.daysUntilExpiry} ${item.daysUntilExpiry === 1 ? 'day' : 'days'} · ${item.currentStock} in stock` })),
  },
  {
    key: 'pendingPayments', label: 'Pending Payments', tone: 'info',
    rows: (a) => (a.pendingPayments ?? []).map((payment) => ({
      id: payment.id,
      text: `${rupees.format(payment.amount)} · ${paymentModeLabel(payment.mode)}${payment.invoice ? ` · ${payment.invoice.invoiceNo}` : ''} · ${displayClinicDate(payment.createdAt)}`,
    })),
  },
  {
    key: 'upcomingAppointments', label: 'Upcoming Appointments', tone: 'neutral', note: UPCOMING_DEFINITION, list: { href: '/dashboard/appointments', label: 'Open Appointments', capability: 'appointments' },
    rows: (a) => (a.upcomingAppointments ?? []).map((appointment) => ({
      id: appointment.id,
      text: `${displayClinicDate(appointment.time)}${appointment.slot ? ` ${appointment.slot}` : ''} · ${appointment.patientName}${appointment.doctorName ? ` with ${appointment.doctorName}` : ''}`,
    })),
  },
];

const TONE_RANK: StatusVariant[] = ['neutral', 'success', 'info', 'highlight', 'warning', 'danger'];
const BAND_CLASS: Record<StatusVariant, string> = {
  neutral: '', success: 'border-success-border bg-success-soft', info: 'border-info-border bg-info-soft',
  highlight: 'border-highlight-border bg-highlight-soft', warning: 'border-warning-border bg-warning-soft', danger: 'border-destructive-border bg-destructive-soft',
};
const LABEL_CLASS: Record<StatusVariant, string> = {
  neutral: 'text-muted-foreground', success: 'text-success-text', info: 'text-info-text',
  highlight: 'text-highlight-text', warning: 'text-warning-text', danger: 'text-destructive-text',
};

export function SystemAlertsBand({ alerts }: { alerts: SystemAlerts }) {
  const { counts } = alerts;
  const [open, setOpen] = useState<AlertKey | null>(null);
  const panelId = useId();
  const tones = ALERT_ITEMS.map((item) => (counts[item.key] > 0 ? item.tone : 'neutral'));
  const band = tones.reduce((worst, tone) => (TONE_RANK.indexOf(tone) > TONE_RANK.indexOf(worst) ? tone : worst), 'neutral' as StatusVariant);
  const role = useOptionalDashboardUser()?.user?.role;
  const opens = (capability: Capability | undefined) => !!role && !!capability && can(role, capability);
  const opened = ALERT_ITEMS.find((item) => item.key === open);
  const rows = opened ? opened.rows(alerts).map((row) => (opens(opened.rowCapability) ? row : { ...row, href: undefined })) : [];
  const list = opened?.list && opens(opened.list.capability) ? opened.list : undefined;
  return (
    <Card className={`gap-3 px-4 py-3 ${BAND_CLASS[band]}`}>
      <div className="flex flex-row flex-wrap items-center gap-x-6 gap-y-2">
        <h2 className={`flex w-full items-center text-sm font-semibold sm:w-auto ${LABEL_CLASS[band] || 'text-foreground'}`}>
          <AlertCircle className="h-4 w-4 mr-2" aria-hidden="true" />
          System Alerts
        </h2>
        <ul className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
          {ALERT_ITEMS.map((item, index) => {
            const count = counts[item.key];
            const label = (
              <>
                <span className={LABEL_CLASS[tones[index]]}>{item.label}</span>
                <span className="font-semibold tabular-nums text-foreground">{count}</span>
              </>
            );
            return (
              <li key={item.key} className="flex flex-wrap items-baseline gap-x-1.5">
                {count > 0 ? (
                  <button
                    type="button"
                    className="inline-flex min-h-8 items-baseline gap-x-1.5 rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-expanded={open === item.key}
                    aria-controls={panelId}
                    onClick={() => setOpen(open === item.key ? null : item.key)}
                  >
                    {label}
                    <ChevronDown className={cn('size-3.5 self-center transition-transform', open === item.key && 'rotate-180')} aria-hidden="true" />
                  </button>
                ) : (
                  <span className="inline-flex items-baseline gap-x-1.5">{label}</span>
                )}
                {item.note && count > 0 && <span className="text-xs text-muted-foreground">{item.note}</span>}
              </li>
            );
          })}
        </ul>
      </div>
      {opened && (
        <section id={panelId} aria-label={opened.label} className="rounded-md border bg-card p-3 text-sm">
          <ul className="space-y-1.5">
            {rows.map((row) => (
              <li key={row.id}>{row.href ? <Link href={row.href} className="hover:underline">{row.text}</Link> : row.text}</li>
            ))}
          </ul>
          {(counts[opened.key] > rows.length || list) && (
            <p className="mt-2 flex flex-wrap gap-x-4 text-muted-foreground">
              {counts[opened.key] > rows.length && <span>Showing {rows.length} of {counts[opened.key]}.</span>}
              {list && <Link href={list.href} className="font-medium text-foreground underline underline-offset-4">{list.label}</Link>}
            </p>
          )}
        </section>
      )}
    </Card>
  );
}
