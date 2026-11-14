'use client';

import { LoadingSkeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { PageHeader } from '@/components/ui/page-header';
import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { useDashboardUser } from '@/components/layout/dashboard-user-context';
import { QuickGuide } from '@/components/common/QuickGuide';
import { DoctorPatientPanels } from '@/components/dashboard/DoctorPatientPanels';
import {
  AttentionList, DashboardSection, DoctorQueue, Loaded, TodayByDoctor, useLoad,
  type AttentionRow, type DayAppointment,
} from '@/components/dashboard/ClinicDay';
import { fmtMoney } from '@/components/inventory/workspace-model';
import { getISTDateString } from '@/lib/utils';
import { APPOINTMENT_READ_ROLES } from '@/lib/appointment-access';
import { LOW_STOCK_DEFINITION, LOW_STOCK_HREF, UPCOMING_DEFINITION } from '@/lib/clinic-counts';

type DashboardView = 'doctor' | 'pharmacist' | 'admin' | 'front-desk' | 'billing';

const viewFor = (role: string): DashboardView =>
  role === 'DOCTOR' ? 'doctor'
    : role === 'PHARMACIST' ? 'pharmacist'
      : role === 'ADMIN' || role === 'OWNER' ? 'admin'
        : APPOINTMENT_READ_ROLES.includes(role) ? 'front-desk'
          : 'billing';

const GUIDE: Record<DashboardView, string[]> = {
  doctor: ['Your appointments today are listed in time order.', 'Click a row to start that visit, or to reopen it once started.'],
  pharmacist: ['Each row counts one job and opens the matching list.', `Low stock means ${LOW_STOCK_DEFINITION}, the same count Inventory shows.`],
  admin: ['Each row counts one job and opens the matching page.', `Upcoming appointments covers the ${UPCOMING_DEFINITION}.`, "Click a patient in today's list to open their record."],
  'front-desk': ['Each row counts one job and opens the appointments page.', "Today's appointments are grouped by doctor. Click a patient to open their record."],
  billing: ['Each row counts one job and opens the matching page.'],
};

const COLLECTION_HREF = '/dashboard/pharmacy/reports?report=daily-collection';
const DUE_SALES = '/dashboard/pharmacy/sales?pay=CREDIT';
const tomorrow = () => getISTDateString(new Date(Date.now() + 86_400_000));

type AppointmentPage = { appointments?: DayAppointment[]; pagination?: { total?: number } };
const todaysAppointments = async () => {
  const res = await apiClient.getAppointments({ date: getISTDateString(), limit: 100, sortBy: 'slot', sortOrder: 'asc' }) as AppointmentPage;
  return { appointments: res.appointments ?? [], total: res.pagination?.total ?? res.appointments?.length ?? 0 };
};
const countAppointments = async (date: string, status: string) =>
  ((await apiClient.getAppointments({ date, status, limit: 1 })) as AppointmentPage).pagination?.total ?? 0;
type Alerts = { counts: { overdueInvoices: number; pendingPayments: number; upcomingAppointments: number } };
const collectedToday = async () =>
  fmtMoney((await apiClient.get<{ headline: { value: number } }>('/pharmacy/reports/daily-collection', { from: getISTDateString(), to: getISTDateString() })).headline.value);
const COLLECTED_NOTE = 'Clinic and pharmacy, every payment mode';

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
export default function DashboardPage() {
  const { user, loading } = useDashboardUser();

  if (loading || !user) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" />
        <LoadingSkeleton variant="cards" label="Loading dashboard…" />
      </div>
    );
  }

  const view = viewFor(user.role);
  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        description="What needs doing at the clinic today."
        actions={<QuickGuide title="Dashboard Guide" sections={[{ title: 'Today', items: GUIDE[view] }]} />}
      />
      {view === 'doctor' && <DoctorDashboard doctorId={user.id} />}
      {view === 'pharmacist' && <PharmacistDashboard />}
      {view === 'admin' && <AdminDashboard />}
      {view === 'front-desk' && <FrontDeskDashboard />}
      {view === 'billing' && <BillingDashboard />}
    </div>
  );
}

function DoctorDashboard({ doctorId }: { doctorId: string }) {
  const load = useCallback(async () => (await apiClient.getDoctorSchedule(doctorId, getISTDateString()))?.appointments ?? [], [doctorId]);
  const [queue, retry] = useLoad<DayAppointment[]>(load);
  return (
    <>
      <DashboardSection title="Your queue today" description="Click a patient to start the visit, or to reopen it.">
        <Loaded state={queue} subject="today's appointments" retry={retry}>
          {(appointments) => <DoctorQueue appointments={appointments} />}
        </Loaded>
      </DashboardSection>
      <DoctorPatientPanels doctorId={doctorId} />
    </>
  );
}

function FrontDeskDashboard() {
  const load = useCallback(async () => {
    const [day, unconfirmedToday, unconfirmedTomorrow, checkedIn] = await Promise.all([
      todaysAppointments(),
      countAppointments(getISTDateString(), 'SCHEDULED'),
      countAppointments(tomorrow(), 'SCHEDULED'),
      countAppointments(getISTDateString(), 'CHECKED_IN'),
    ]);
    const rows: AttentionRow[] = [
      { count: unconfirmedToday, label: "Today's bookings not yet confirmed", href: '/dashboard/appointments' },
      { count: unconfirmedTomorrow, label: "Tomorrow's bookings to confirm", href: '/dashboard/appointments' },
      { count: checkedIn, label: 'Checked in, waiting for the doctor', href: '/dashboard/appointments' },
    ];
    return { day, rows };
  }, []);
  const [state, retry] = useLoad(load);
  return (
    <Loaded state={state} subject="today's appointments" retry={retry}>
      {({ day, rows }) => (
        <>
          <DashboardSection title="What needs attention" tour="dashboard-stats">
            <AttentionList rows={rows} />
          </DashboardSection>
          <DashboardSection title="Today's appointments" description={`${day.total} booked, grouped by doctor.`} tour="appointments-list">
            <TodayByDoctor appointments={day.appointments} total={day.total} />
          </DashboardSection>
        </>
      )}
    </Loaded>
  );
}

function AdminDashboard() {
  const load = useCallback(async () => {
    const [day, noShows, alerts, collected] = await Promise.all([
      todaysAppointments(),
      countAppointments(getISTDateString(), 'NO_SHOW'),
      apiClient.getSystemAlerts<Alerts>(),
      collectedToday(),
    ]);
    const rows: AttentionRow[] = [
      { count: day.total, label: 'Appointments today', href: '/dashboard/appointments' },
      { count: alerts.counts.upcomingAppointments, label: 'Upcoming appointments', note: UPCOMING_DEFINITION, href: '/dashboard/appointments' },
      { count: noShows, label: 'No-shows today', href: '/dashboard/appointments' },
      { count: collected, label: 'Collected today', note: COLLECTED_NOTE, href: COLLECTION_HREF },
    ];
    return { day, rows };
  }, []);
  const [state, retry] = useLoad(load);
  return (
    <>
      <Loaded state={state} subject="today's clinic figures" retry={retry}>
        {({ day, rows }) => (
          <>
            <DashboardSection title="Clinic today">
              <AttentionList rows={rows} />
            </DashboardSection>
            <DashboardSection title="Today's appointments" description={`${day.total} booked, grouped by doctor.`}>
              <TodayByDoctor appointments={day.appointments} total={day.total} />
            </DashboardSection>
          </>
        )}
      </Loaded>
      <DatabaseBackup />
    </>
  );
}

function PharmacistDashboard() {
  const load = useCallback(async () => {
    type Queue = { pagination: { total: number } };
    type Overview = { lowStock: number; expiring: number; pendingEdits: number | null };
    const [waiting, partial, overview] = await Promise.all([
      apiClient.get<Queue>('/pharmacy/prescription-queue', { status: 'pending', limit: 1 }),
      apiClient.get<Queue>('/pharmacy/prescription-queue', { status: 'partial', limit: 1 }),
      apiClient.get<Overview>('/inventory/workspace/overview'),
    ]);
    const rows: AttentionRow[] = [
      { count: waiting.pagination.total, label: 'Prescriptions waiting to dispense', href: '/dashboard/pharmacy?section=counter' },
      { count: partial.pagination.total, label: 'Prescriptions partly dispensed', href: '/dashboard/pharmacy?section=counter' },
      { count: overview.lowStock, label: 'Low stock', note: LOW_STOCK_DEFINITION, href: LOW_STOCK_HREF },
      { count: overview.expiring, label: 'Expiring in the next 3 months', href: '/dashboard/inventory?area=stock&view=list&expiryMonths=3' },
      ...(overview.pendingEdits != null
        ? [{ count: overview.pendingEdits, label: 'Price/stock edits awaiting approval', href: '/dashboard/inventory?area=stock&view=approvals' }]
        : []),
    ];
    return rows;
  }, []);
  const [state, retry] = useLoad(load);
  return (
    <DashboardSection title="Pharmacy queue" description="Each row opens the matching records.">
      <Loaded state={state} subject="pharmacy counts" retry={retry}>
        {(rows) => <AttentionList rows={rows} />}
      </Loaded>
    </DashboardSection>
  );
}

function BillingDashboard() {
  const load = useCallback(async () => {
    const [alerts, collected] = await Promise.all([apiClient.getSystemAlerts<Alerts>(), collectedToday()]);
    const rows: AttentionRow[] = [
      { count: collected, label: 'Collected today', note: COLLECTED_NOTE, href: COLLECTION_HREF },
      { count: alerts.counts.overdueInvoices, label: 'Overdue invoices', href: DUE_SALES },
      { count: alerts.counts.pendingPayments, label: 'Payments awaiting reconciliation', href: DUE_SALES },
    ];
    return rows;
  }, []);
  const [state, retry] = useLoad(load);
  return (
    <DashboardSection title="Billing to follow up">
      <Loaded state={state} subject="billing counts" retry={retry}>
        {(rows) => <AttentionList rows={rows} />}
      </Loaded>
    </DashboardSection>
  );
}

function DatabaseBackup() {
  const [busy, setBusy] = useState(false);
  const backup = async () => {
    try {
      setBusy(true);
      const { backup: info } = (await apiClient.createDatabaseBackup()) as unknown as { backup: { timestamp: string; directory: string; size: number } };
      alert(`Database backup created.\n\nTimestamp: ${info.timestamp}\nLocation: ${info.directory}\nSize: ${(info.size / 1024).toFixed(1)} KB`);
    } catch (error: unknown) {
      alert(`Backup failed.\n\n${(error as { message?: string })?.message || 'Backup creation failed'}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <DashboardSection title="Database backup" description="The server keeps each backup, and it contains patient data.">
      <Button variant="outline" onClick={backup} disabled={busy}>
        {busy ? <Spinner className="mr-2 h-4 w-4" /> : <Download className="mr-2 h-4 w-4" />}
        {busy ? 'Creating…' : 'Create backup'}
      </Button>
    </DashboardSection>
  );
}
