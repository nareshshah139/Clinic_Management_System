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
  AttentionList, DashboardSection, DoctorQueue, Loaded, TodayByDoctor, rowFrom, useLoad,
  type DayAppointment, type DoctorQueueAppointment, type Loadable,
} from '@/components/dashboard/ClinicDay';
import { fmtMoney } from '@/components/inventory/workspace-model';
import { getErrorMessage, getISTDateString } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { can, type Capability } from '@/lib/role-capabilities';
import { appointmentsHref } from '@/lib/appointments-link';
import { LOW_STOCK_DEFINITION, LOW_STOCK_HREF, OVERDUE_BILLS_DEFINITION, OVERDUE_BILLS_HREF, UPCOMING_DEFINITION } from '@/lib/clinic-counts';

type DashboardView = 'doctor' | 'pharmacist' | 'admin' | 'front-desk' | 'nurse' | 'billing';

const viewFor = (role: string): DashboardView =>
  role === 'DOCTOR' ? 'doctor'
    : role === 'PHARMACIST' ? 'pharmacist'
      : role === 'ADMIN' || role === 'OWNER' || role === 'MANAGER' ? 'admin'
        : role === 'RECEPTION' ? 'front-desk'
          : role === 'NURSE' ? 'nurse'
            : 'billing';

const GUIDE: Record<DashboardView, string[]> = {
  doctor: ['Your confirmed patients today are listed in time order.', 'Click a row to start that visit, or to reopen it once started.', 'Patients reception has not confirmed yet are counted under the list. Open the count to see them.'],
  pharmacist: ['Each row counts one job and opens the matching list.', `Low stock means ${LOW_STOCK_DEFINITION}, the same count Inventory shows.`],
  admin: ['Each row counts one job and opens the matching page.', `Upcoming appointments covers the ${UPCOMING_DEFINITION}.`, "Click a patient in today's list to open their record."],
  'front-desk': ['Each row counts one job and opens the appointments page.', "Today's appointments are grouped by doctor. Click a patient to open their record."],
  nurse: ['The row counts patients who are checked in and waiting for the doctor.', "Today's appointments are grouped by doctor. Click a patient to open their record."],
  billing: ['Each row counts one job. A row opens its page only when your role can use that page.'],
};

const COLLECTION_HREF = '/dashboard/pharmacy/reports?report=daily-collection';
const tomorrow = () => getISTDateString(new Date(Date.now() + 86_400_000));

const linkIf = (role: string, capability: Capability, href: string) => (can(role, capability) ? href : undefined);

type AppointmentPage = { appointments?: DayAppointment[]; pagination?: { total?: number } };
const todaysAppointments = async () => {
  const res = await apiClient.getAppointments({ date: getISTDateString(), limit: 100, sortBy: 'slot', sortOrder: 'asc' }) as AppointmentPage;
  return { appointments: res.appointments ?? [], total: res.pagination?.total ?? res.appointments?.length ?? 0 };
};
type DayList = Awaited<ReturnType<typeof todaysAppointments>>;
const countAppointments = async (date: string, status: string) =>
  ((await apiClient.getAppointments({ date, status, limit: 1 })) as AppointmentPage).pagination?.total ?? 0;
const unconfirmedToday = () => countAppointments(getISTDateString(), 'SCHEDULED');
const unconfirmedTomorrow = () => countAppointments(tomorrow(), 'SCHEDULED');
const checkedInToday = () => countAppointments(getISTDateString(), 'CHECKED_IN');
const noShowsToday = () => countAppointments(getISTDateString(), 'NO_SHOW');
type Alerts = { counts: { overdueInvoices: number; pendingPayments: number; upcomingAppointments: number } };
const loadAlerts = () => apiClient.getSystemAlerts<Alerts>();
const collectedToday = async () =>
  fmtMoney((await apiClient.get<{ headline: { value: number } }>('/pharmacy/reports/daily-collection', { from: getISTDateString(), to: getISTDateString() })).headline.value);
const COLLECTED_NOTE = 'Clinic and pharmacy, every payment mode';

const prescriptionsIn = (status: string) => async () =>
  (await apiClient.get<{ pagination: { total: number } }>('/pharmacy/prescription-queue', { status, limit: 1 })).pagination.total;
const waitingPrescriptions = prescriptionsIn('pending');
const partlyDispensedPrescriptions = prescriptionsIn('partial');
type Overview = { lowStock: number; expiring: number; pendingEdits: number | null };
const inventoryOverview = () => apiClient.get<Overview>('/inventory/workspace/overview');

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
        actions={<QuickGuide title="Dashboard Guide" sections={[{ title: 'Today', items: GUIDE[view] }]} />}
      />
      {view === 'doctor' && <DoctorDashboard doctorId={user.id} />}
      {view === 'pharmacist' && <PharmacistDashboard role={user.role} />}
      {view === 'admin' && <AdminDashboard role={user.role} />}
      {view === 'front-desk' && <FrontDeskDashboard role={user.role} />}
      {view === 'nurse' && <NurseDashboard role={user.role} />}
      {view === 'billing' && <BillingDashboard role={user.role} />}
    </div>
  );
}

function DoctorDashboard({ doctorId }: { doctorId: string }) {
  const load = useCallback(async () => (await apiClient.getDoctorSchedule(doctorId, getISTDateString()))?.appointments ?? [], [doctorId]);
  const [queue, retry] = useLoad<DoctorQueueAppointment[]>(load);
  return (
    <>
      <DashboardSection title="Your queue today" description="Confirmed patients in time order. Click one to start the visit, or to reopen it.">
        <Loaded state={queue} subject="today's appointments" retry={retry}>
          {(appointments) => <DoctorQueue appointments={appointments} />}
        </Loaded>
      </DashboardSection>
      <DoctorPatientPanels doctorId={doctorId} />
    </>
  );
}

function TodaysAppointments({ state, retry, tour }: { state: Loadable<DayList>; retry: () => void; tour?: string }) {
  return (
    <DashboardSection
      title="Today's appointments"
      description={state.status === 'ready' ? `${state.value.total} booked, grouped by doctor.` : undefined}
      tour={tour}
    >
      <Loaded state={state} subject="today's appointments" retry={retry}>
        {(day) => <TodayByDoctor appointments={day.appointments} total={day.total} />}
      </Loaded>
    </DashboardSection>
  );
}

function FrontDeskDashboard({ role }: { role: string }) {
  const [day, retryDay] = useLoad(todaysAppointments);
  const [unconfirmed, retryUnconfirmed] = useLoad(unconfirmedToday);
  const [unconfirmedNext, retryUnconfirmedNext] = useLoad(unconfirmedTomorrow);
  const [checkedIn, retryCheckedIn] = useLoad(checkedInToday);
  const rows = [
    rowFrom(unconfirmed, retryUnconfirmed, { label: "Today's bookings not yet confirmed", href: linkIf(role, 'appointments', appointmentsHref(getISTDateString())) }, (n) => n),
    rowFrom(unconfirmedNext, retryUnconfirmedNext, { label: "Tomorrow's bookings to confirm", href: linkIf(role, 'appointments', appointmentsHref(tomorrow())) }, (n) => n),
    rowFrom(checkedIn, retryCheckedIn, { label: 'Checked in, waiting for the doctor', href: linkIf(role, 'appointments', appointmentsHref(getISTDateString())) }, (n) => n),
  ];
  return (
    <>
      <DashboardSection title="What needs attention" tour="dashboard-stats">
        <AttentionList rows={rows} />
      </DashboardSection>
      <TodaysAppointments state={day} retry={retryDay} tour="appointments-list" />
    </>
  );
}

function NurseDashboard({ role }: { role: string }) {
  const [day, retryDay] = useLoad(todaysAppointments);
  const [checkedIn, retryCheckedIn] = useLoad(checkedInToday);
  const rows = [
    rowFrom(checkedIn, retryCheckedIn, { label: 'Checked in, waiting for the doctor', href: linkIf(role, 'appointments', appointmentsHref(getISTDateString())) }, (n) => n),
  ];
  return (
    <>
      <DashboardSection title="What needs attention" tour="dashboard-stats">
        <AttentionList rows={rows} />
      </DashboardSection>
      <TodaysAppointments state={day} retry={retryDay} tour="appointments-list" />
    </>
  );
}

function AdminDashboard({ role }: { role: string }) {
  const [day, retryDay] = useLoad(todaysAppointments);
  const [noShows, retryNoShows] = useLoad(noShowsToday);
  const [alerts, retryAlerts] = useLoad(loadAlerts);
  const [collected, retryCollected] = useLoad(collectedToday);
  const rows = [
    rowFrom(day, retryDay, { label: 'Appointments today', href: linkIf(role, 'appointments', appointmentsHref(getISTDateString())) }, (list) => list.total),
    rowFrom(alerts, retryAlerts, { label: 'Upcoming appointments', note: UPCOMING_DEFINITION, href: linkIf(role, 'appointments', '/dashboard/appointments') }, (a) => a.counts.upcomingAppointments),
    rowFrom(noShows, retryNoShows, { label: 'No-shows today', href: linkIf(role, 'appointments', appointmentsHref(getISTDateString())) }, (n) => n),
    rowFrom(collected, retryCollected, { label: 'Collected today', note: COLLECTED_NOTE, href: linkIf(role, 'pharmacy-reports', COLLECTION_HREF) }, (amount) => amount),
  ];
  return (
    <>
      <DashboardSection title="Clinic today">
        <AttentionList rows={rows} />
      </DashboardSection>
      <TodaysAppointments state={day} retry={retryDay} />
      {can(role, 'backup') && <DatabaseBackup />}
    </>
  );
}

function PharmacistDashboard({ role }: { role: string }) {
  const [waiting, retryWaiting] = useLoad(waitingPrescriptions);
  const [partial, retryPartial] = useLoad(partlyDispensedPrescriptions);
  const [overview, retryOverview] = useLoad(inventoryOverview);
  const counter = linkIf(role, 'pharmacy-counter', '/dashboard/pharmacy?section=counter');
  const rows = [
    rowFrom(waiting, retryWaiting, { label: 'Prescriptions waiting to dispense', href: counter }, (n) => n),
    rowFrom(partial, retryPartial, { label: 'Prescriptions partly dispensed', href: counter }, (n) => n),
    rowFrom(overview, retryOverview, { label: 'Low stock', note: LOW_STOCK_DEFINITION, href: linkIf(role, 'inventory', LOW_STOCK_HREF) }, (o) => o.lowStock),
    rowFrom(overview, retryOverview, { label: 'Expiring in the next 3 months', href: linkIf(role, 'inventory', '/dashboard/inventory?area=stock&view=list&expiryMonths=3') }, (o) => o.expiring),
    ...(overview.status === 'ready' && overview.value.pendingEdits != null
      ? [rowFrom(overview, retryOverview, { label: 'Price/stock edits awaiting approval', href: linkIf(role, 'inventory', '/dashboard/inventory?area=stock&view=approvals') }, (o) => o.pendingEdits ?? 0)]
      : []),
  ];
  return (
    <DashboardSection title="Pharmacy queue" description="Each row opens the matching records.">
      <AttentionList rows={rows} />
    </DashboardSection>
  );
}

function BillingDashboard({ role }: { role: string }) {
  const [alerts, retryAlerts] = useLoad(loadAlerts);
  const [collected, retryCollected] = useLoad(collectedToday);
  const rows = [
    rowFrom(collected, retryCollected, { label: 'Collected today', note: COLLECTED_NOTE, href: linkIf(role, 'pharmacy-reports', COLLECTION_HREF) }, (amount) => amount),
    rowFrom(alerts, retryAlerts, { label: 'Overdue clinic bills', note: OVERDUE_BILLS_DEFINITION, href: linkIf(role, 'billing', OVERDUE_BILLS_HREF) }, (a) => a.counts.overdueInvoices),
    rowFrom(alerts, retryAlerts, { label: 'Payments awaiting reconciliation' }, (a) => a.counts.pendingPayments),
  ];
  return (
    <DashboardSection title="Billing to follow up">
      <AttentionList rows={rows} />
    </DashboardSection>
  );
}

function DatabaseBackup() {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const backup = async () => {
    try {
      setBusy(true);
      await apiClient.createDatabaseBackup();
      toast({ variant: 'success', title: 'Backup started', description: 'The server is writing the backup now and keeps it with the earlier ones.' });
    } catch (error: unknown) {
      toast({ variant: 'destructive', title: 'Backup failed', description: getErrorMessage(error) });
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
