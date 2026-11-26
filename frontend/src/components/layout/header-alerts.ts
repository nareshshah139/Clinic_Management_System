import { displayUtcDate } from '@/lib/date-display';
import { UserRole } from '@cms/shared-types';
import { enumLabel, plural } from '@/lib/labels';
import { statusLabel } from '@/lib/status-variants';
import { appointmentsHref } from '@/lib/appointments-link';
import { LOW_STOCK_HREF, OVERDUE_BILLS_DEFINITION, OVERDUE_BILLS_HREF, UPCOMING_DEFINITION } from '@/lib/clinic-counts';
import { can } from '@/lib/role-capabilities';
import { doctorLabel } from './doctor-label';

export type NotificationItem = {
  id: string;
  title: string;
  description?: string;
  href?: string;
  variant?: 'default' | 'warning' | 'destructive' | 'success';
};

export const EXPIRING_STOCK_HREF = '/dashboard/inventory?area=stock&view=list&expiryMonths=1';

const REPORTS_ROLES: string[] = [UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER];

export const canOpenReports = (role?: string | null) => REPORTS_ROLES.includes(String(role ?? '').toUpperCase());

function formatCurrency(amount: number): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'INR' }).format(amount || 0);
  } catch {
    return `₹${(amount || 0).toFixed(2)}`;
  }
}

function formatRelative(value: string | Date): string {
  const mins = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function whenLabel(appointment: any): string {
  const day = displayUtcDate(appointment.time);
  return appointment.slot ? `${day}, ${appointment.slot}` : day;
}

export function buildRoleNotifications(alerts: any, role?: string): NotificationItem[] {
  const items: NotificationItem[] = [];
  const counts = alerts?.counts || {};
  const lowStock = alerts?.lowStockAlerts || [];
  const expiry = alerts?.expiryAlerts || [];
  const overdue = alerts?.overdueInvoices || [];
  const pending = alerts?.pendingPayments || [];
  const upcoming = alerts?.upcomingAppointments || [];

  const pushMany = (arr: NotificationItem[], max: number = 5) =>
    arr.slice(0, max).forEach((it) => items.push(it));

  const overdueHref = can(role?.toUpperCase(), 'billing') ? OVERDUE_BILLS_HREF : undefined;
  const overdueItems = (variant: NotificationItem['variant']): NotificationItem[] =>
    overdue.map((inv: any) => ({
      id: `inv-${inv.id}`,
      title: `Overdue bill ${inv.invoiceNo}`,
      description: `${inv.patient?.name || 'Patient'} • Due ${displayUtcDate(inv.dueDate)}`,
      href: overdueHref,
      variant,
    }));

  switch ((role || '').toUpperCase()) {
    case UserRole.DOCTOR: {
      const list: NotificationItem[] = upcoming.map((a: any) => ({
        id: `appt-${a.id}`,
        title: `${a.patientName || 'Patient'} on ${whenLabel(a)}`,
        description: `${a.visitType ? enumLabel('visitType', a.visitType) : 'Visit'} • ${statusLabel('appointment', a.status)}`,
        href: `/dashboard/visits?appointmentId=${encodeURIComponent(a.id)}`,
        variant: 'default',
      }));
      pushMany(list, 6);
      break;
    }
    case UserRole.RECEPTION: {
      const apptItems: NotificationItem[] = upcoming.map((a: any) => ({
        id: `appt-${a.id}`,
        title: `Upcoming: ${a.patientName || 'Patient'} on ${whenLabel(a)}`,
        description: [a.visitType ? enumLabel('visitType', a.visitType) : 'Visit', doctorLabel(a.doctorName)].filter(Boolean).join(' • '),
        href: appointmentsHref(String(a.time ?? '').slice(0, 10)),
      }));
      pushMany(apptItems, 4);
      pushMany(overdueItems('warning'), 3);
      break;
    }
    case UserRole.PHARMACIST:
    case 'INVENTORY': {
      const stockItems: NotificationItem[] = lowStock.map((i: any) => ({
        id: `stock-${i.itemId}`,
        title: `Low stock: ${i.itemName}`,
        description: `Stock ${i.currentStock} • Reorder ${i.reorderLevel}`,
        href: LOW_STOCK_HREF,
        variant: 'destructive',
      }));
      const expItems: NotificationItem[] = expiry.map((i: any) => ({
        id: `exp-${i.itemId}`,
        title: `Expiring soon: ${i.itemName}`,
        description: `${plural(i.daysUntilExpiry, 'day')} left • Qty ${i.currentStock}`,
        href: EXPIRING_STOCK_HREF,
        variant: 'warning',
      }));
      pushMany(stockItems, 5);
      pushMany(expItems, 3);
      break;
    }
    case UserRole.ACCOUNTANT:
    case 'BILLING': {
      const payItems: NotificationItem[] = pending.map((p: any) => ({
        id: `pay-${p.id}`,
        title: `Pending ${formatCurrency(p.amount)} (${p.mode})`,
        description: `Invoice ${p.invoice?.invoiceNo || ''} • ${formatRelative(p.createdAt)}`,
        variant: 'warning',
      }));
      pushMany(payItems, 5);
      pushMany(overdueItems('destructive'), 3);
      break;
    }
    case UserRole.OWNER:
    case UserRole.ADMIN:
    default: {
      const summary: NotificationItem[] = [];
      if (counts.overdueInvoices > 0) {
        summary.push({
          id: 'summary-overdue',
          title: `${counts.overdueInvoices} overdue clinic bill${counts.overdueInvoices === 1 ? '' : 's'}`,
          description: OVERDUE_BILLS_DEFINITION,
          href: overdueHref,
          variant: 'destructive',
        });
      }
      if (counts.pendingPayments > 0) {
        summary.push({
          id: 'summary-pending',
          title: `${counts.pendingPayments} payment${counts.pendingPayments === 1 ? '' : 's'} awaiting reconciliation`,
          description: 'No page lists these payments yet',
          variant: 'warning',
        });
      }
      if (counts.lowStockAlerts > 0) {
        summary.push({
          id: 'summary-stock',
          title: `${counts.lowStockAlerts} low-stock item${counts.lowStockAlerts === 1 ? '' : 's'}`,
          description: 'Restock inventory',
          href: LOW_STOCK_HREF,
        });
      }
      if (counts.expiryAlerts > 0) {
        summary.push({
          id: 'summary-expiry',
          title: `${counts.expiryAlerts} near-expiry item${counts.expiryAlerts === 1 ? '' : 's'}`,
          description: 'Check expirations',
          href: EXPIRING_STOCK_HREF,
          variant: 'warning',
        });
      }
      if (counts.upcomingAppointments > 0) {
        summary.push({
          id: 'summary-appts',
          title: `${counts.upcomingAppointments} upcoming appointment${counts.upcomingAppointments === 1 ? '' : 's'}`,
          description: UPCOMING_DEFINITION,
          href: '/dashboard/appointments',
        });
      }
      pushMany(summary, 6);
      break;
    }
  }
  return items;
}
