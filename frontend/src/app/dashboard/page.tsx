'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { CalendarPlus, Download, UserPlus } from 'lucide-react';
import { LoadingSkeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api';
import type { ClinicAlerts } from '@/lib/dashboard-links';
import { useDashboardUser } from '@/components/layout/dashboard-user-context';
import { QuickGuide } from '@/components/common/QuickGuide';
import { DoctorPatientPanels } from '@/components/dashboard/DoctorPatientPanels';
import { TodaysAppointments } from '@/components/dashboard/TodaysAppointments';
import { ApprovalsFigure, BillsDue, CollectionFigure, NeedsAttention, PharmacyWork, type Loadable } from '@/components/dashboard/LandingCards';
import { loadFailure } from '@/components/dashboard/load-failure';
import { ITEM_REQUEST_APPROVER_ROLES } from '@/lib/inventory-item-requests';

/**
 * @cc [owner:nareshshah139,label:product] dashboard-clinic-day
 * Today's appointments MUST be requested for the current Asia/Kolkata calendar day
 * for both doctor schedules and the general appointment summary.
 */
/**
 * @cc [owner:nareshshah139,label:product] dashboard-patient-label
 * Appointment rows MUST prefer the canonical patient name, falling back to legacy
 * name parts or a nonempty patient label when those names are unavailable.
 */
/**
 * @cc [owner:nareshshah139,label:product] dashboard-booked-slot
 * Appointment rows MUST display the booked slot unchanged, without a clock time
 * derived from the appointment's calendar date.
 */

type Section = 'deskActions' | 'deskDay' | 'billsToCollect' | 'doctorDay' | 'doctorPatients' | 'pharmacy' | 'figures' | 'attention' | 'summaryDay' | 'collection' | 'backup';

/** Each role's landing page, top to bottom: its own work first, rare admin controls last. */
const LANDING: Record<string, Section[]> = {
  RECEPTION: ['deskActions', 'deskDay', 'billsToCollect'],
  DOCTOR: ['doctorDay', 'doctorPatients'],
  PHARMACIST: ['pharmacy'],
  OWNER: ['figures', 'attention', 'summaryDay', 'backup'],
  ADMIN: ['figures', 'attention', 'summaryDay', 'backup'],
  MANAGER: ['figures', 'attention', 'summaryDay'],
  NURSE: ['summaryDay'],
  ACCOUNTANT: ['collection'],
};
const READS_ALERTS: Section[] = ['billsToCollect', 'pharmacy', 'figures', 'attention'];

type Guide = { title: string; items: string[] };

function guideFor(section: Section, { canTakePayment, approves }: { canTakePayment: boolean; approves: boolean }): Guide | null {
  const pressBill = canTakePayment ? ' Press a name to take the payment.' : '';
  switch (section) {
    case 'deskActions': return { title: 'Start here', items: ['Book appointment opens the calendar.', 'New patient registers a walk-in.'] };
    case 'deskDay': return { title: "Today's appointments", items: ['The next patient is at the top; finished visits move to the bottom.', 'Press a bill to see it, create it or take a payment.'] };
    case 'billsToCollect': return { title: 'Bills to collect', items: [`Each open bill with what is still owed.${pressBill}`] };
    case 'doctorDay': return { title: "Today's patients", items: ['Your next patient is at the top.', 'Start visit opens a new visit; Continue visit opens one already started.'] };
    case 'doctorPatients': return { title: 'My patients', items: ['Type a name, phone or code to find one of your patients.', 'Recent visits below open the visit.'] };
    case 'pharmacy': return { title: 'Pharmacy', items: ['Bill opens a bill filled from the prescription.', 'New sale starts a bill for a walk-in.', 'Low stock and Expiring in 3 months open those Inventory lists.'] };
    case 'figures': return {
      title: 'Today',
      items: ['The collection figure opens Daily Collection.', `Bills due lists who still owes.${pressBill}`, ...(approves ? ['Waiting for approval opens the Inventory approvals.'] : [])],
    };
    case 'attention': return { title: 'Needs attention', items: ['Low stock and expiring medicines by name; each heading opens the Inventory list.'] };
    case 'summaryDay': return { title: "Today's appointments", items: ['The next bookings of the day; View All Appointments opens the calendar.'] };
    case 'collection': return { title: 'Collection', items: ['The collection figure opens Daily Collection.'] };
    case 'backup': return { title: 'Database backup', items: ['Backups stay on the server and contain sensitive data.'] };
  }
}

function greeting(firstName?: string) {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  const part = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return firstName ? `${part}, ${firstName}` : part;
}

export default function DashboardPage() {
  const { user, loading } = useDashboardUser();
  const role = user?.role ?? '';
  const sections = LANDING[role] ?? [];
  const readsAlerts = sections.some((s) => READS_ALERTS.includes(s));
  const [alerts, setAlerts] = useState<Loadable<ClinicAlerts>>({ status: 'loading' });

  const loadAlerts = useCallback(() => {
    apiClient.getSystemAlerts<ClinicAlerts>().then(
      (value) => setAlerts({ status: 'ready', value: value ?? {} }),
      (error) => setAlerts({ status: 'error', failure: loadFailure(error) }),
    );
  }, []);
  useEffect(() => {
    if (!loading && readsAlerts) loadAlerts();
  }, [loading, readsAlerts, loadAlerts]);

  const guideFacts = { canTakePayment: alerts.status === 'ready' && !!alerts.value.canTakePayment, approves: ITEM_REQUEST_APPROVER_ROLES.includes(role) };
  const header = (
    <PageHeader
      title={greeting(user?.firstName)}
      actions={sections.length > 0 && (
        <QuickGuide title="Dashboard guide" sections={sections.map((s) => guideFor(s, guideFacts)).filter((g): g is Guide => !!g)} />
      )}
    />
  );
  if (loading) {
    return (
      <div className="space-y-6">
        {header}
        <LoadingSkeleton variant="cards" label="Loading dashboard…" />
      </div>
    );
  }

  const render: Record<Section, () => ReactNode> = {
    deskActions: () => (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" data-tour="desk-actions">
        <Button asChild size="lg" className="h-16 text-lg">
          <Link href="/dashboard/appointments"><CalendarPlus className="mr-2 h-6 w-6" />Book appointment</Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="h-16 text-lg">
          <Link href="/dashboard/patients?new=walkin"><UserPlus className="mr-2 h-6 w-6" />New patient</Link>
        </Button>
      </div>
    ),
    deskDay: () => <TodaysAppointments mode="desk" />,
    billsToCollect: () => <BillsDue alerts={alerts} onRetry={loadAlerts} title="Bills to collect" />,
    doctorDay: () => <TodaysAppointments mode="doctor" doctorId={user?.id} />,
    doctorPatients: () => (user?.id ? <DoctorPatientPanels doctorId={user.id} /> : null),
    pharmacy: () => <PharmacyWork alerts={alerts} onRetry={loadAlerts} />,
    figures: () => (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <CollectionFigure />
        <BillsDue alerts={alerts} onRetry={loadAlerts} />
        <ApprovalsFigure role={role} />
      </div>
    ),
    attention: () => <NeedsAttention alerts={alerts} onRetry={loadAlerts} />,
    summaryDay: () => <TodaysAppointments mode="summary" />,
    collection: () => <div className="max-w-md"><CollectionFigure /></div>,
    backup: () => <BackupCard />,
  };

  return (
    <div className="space-y-6">
      {header}
      {sections.length === 0 && <p className="text-gray-700">Nothing is assigned to your role on this page.</p>}
      {sections.map((section) => (
        <section key={section}>{render[section]()}</section>
      ))}
    </div>
  );
}

function BackupCard() {
  const [busy, setBusy] = useState(false);
  const backup = async () => {
    try {
      setBusy(true);
      const result = await apiClient.createDatabaseBackup();
      const info = (result as unknown as { backup: { timestamp: string; directory: string; size: number } }).backup;
      alert(`Database backup created.\n\nTimestamp: ${info.timestamp}\nLocation: ${info.directory}\nSize: ${(info.size / 1024).toFixed(1)} KB`);
    } catch (error: unknown) {
      console.error('Backup failed:', error);
      alert(`Backup failed\n\n${(error as { message?: string })?.message || 'Backup creation failed'}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Database backup</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-gray-500">⚠️ Backups are stored locally on the server and contain sensitive data.</p>
        <Button variant="outline" onClick={() => void backup()} disabled={busy}>
          {busy ? <><Spinner className="h-4 w-4 mr-2" />Creating...</> : <><Download className="h-4 w-4 mr-2" />Create Backup</>}
        </Button>
      </CardContent>
    </Card>
  );
}
