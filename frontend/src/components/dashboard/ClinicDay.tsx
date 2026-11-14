'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import type { ApiError } from '@/lib/api';
import type { Appointment } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingSkeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatPatientName } from '@/lib/utils';

type LoadFailure = 'forbidden' | 'unavailable';
type Loadable<T> = { status: 'loading' } | { status: 'failed'; failure: LoadFailure } | { status: 'ready'; value: T };

export type AttentionRow = { label: string; count: number | string; href: string; note?: string };

export type DayAppointment = Pick<Appointment, 'id' | 'slot' | 'status' | 'doctorId' | 'doctor' | 'visit'> & {
  patient?: { id: string; name?: string; firstName?: string; lastName?: string };
};

export function useLoad<T>(load: () => Promise<T>) {
  const [state, setState] = useState<Loadable<T>>({ status: 'loading' });
  const run = useCallback(() => {
    setState({ status: 'loading' });
    load().then(
      (value) => setState({ status: 'ready', value }),
      (error: unknown) => setState({ status: 'failed', failure: (error as ApiError)?.status === 403 ? 'forbidden' : 'unavailable' }),
    );
  }, [load]);
  useEffect(run, [run]);
  return [state, run] as const;
}

export function LoadFailureState({ failure, subject, onRetry }: { failure: LoadFailure; subject: string; onRetry: () => void }) {
  return (
    <div role="alert">
      <EmptyState
        icon={AlertTriangle}
        title={`Couldn't load ${subject}`}
        description={
          failure === 'forbidden'
            ? 'Your account does not have access to this yet. Ask an admin to check your role permissions.'
            : 'This is not an empty list. Check your connection and try again.'
        }
        action={<Button variant="outline" onClick={onRetry}>Try again</Button>}
      />
    </div>
  );
}

export function Loaded<T>({ state, subject, retry, children }: { state: Loadable<T>; subject: string; retry: () => void; children: (value: T) => ReactNode }) {
  if (state.status === 'loading') return <LoadingSkeleton label={`Loading ${subject}…`} />;
  if (state.status === 'failed') return <LoadFailureState failure={state.failure} subject={subject} onRetry={retry} />;
  return <>{children(state.value)}</>;
}

export function DashboardSection({ title, description, tour, children }: { title: string; description?: string; tour?: string; children: ReactNode }) {
  return (
    <section className="space-y-3" aria-label={title} data-tour={tour}>
      <header>
        <h2 className="text-xl font-semibold text-foreground">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </header>
      {children}
    </section>
  );
}

export function AttentionList({ rows }: { rows: AttentionRow[] }) {
  return (
    <ul className="divide-y border-y">
      {rows.map((row) => (
        <li key={row.label}>
          <Link href={row.href} className="flex items-center gap-4 px-1 py-3 hover:bg-muted/50 focus-visible:outline focus-visible:outline-2">
            <span className="min-w-20 shrink-0 text-2xl font-semibold tabular-nums text-foreground">{row.count}</span>
            <span className="flex-1">
              <strong className="font-medium text-foreground">{row.label}</strong>
              {row.note && <span className="block text-sm text-muted-foreground">{row.note}</span>}
            </span>
            <ArrowRight className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function AppointmentRow({ appointment, href, action }: { appointment: DayAppointment; href: string; action?: string }) {
  return (
    <li>
      <Link href={href} className="grid grid-cols-[7rem_minmax(0,1fr)_auto] items-center gap-3 px-1 py-2.5 hover:bg-muted/50 focus-visible:outline focus-visible:outline-2">
        <span className="tabular-nums text-sm text-muted-foreground">{appointment.slot}</span>
        <span className="truncate font-medium text-foreground">{formatPatientName(appointment.patient)}</span>
        <span className="flex items-center gap-3">
          <StatusBadge domain="appointment" status={appointment.status} />
          {action && <span className="flex w-24 items-center justify-end gap-1 text-sm font-medium text-foreground">{action}<ArrowRight className="h-4 w-4" aria-hidden="true" /></span>}
        </span>
      </Link>
    </li>
  );
}

function visitHref(appointment: DayAppointment): string {
  const params = new URLSearchParams({ patientId: appointment.patient?.id ?? '', appointmentId: appointment.id });
  if (appointment.visit?.id) params.set('visitId', appointment.visit.id);
  else params.set('autoStart', 'true');
  return `/dashboard/visits?${params}`;
}

export function DoctorQueue({ appointments }: { appointments: DayAppointment[] }) {
  const queue = appointments.filter((a) => a.status !== 'CANCELLED').sort((a, b) => a.slot.localeCompare(b.slot));
  if (queue.length === 0) return <p className="py-4 text-muted-foreground">No appointments booked with you today.</p>;
  return (
    <ul className="divide-y border-y" aria-label="Your appointments today">
      {queue.map((a) => <AppointmentRow key={a.id} appointment={a} href={visitHref(a)} action={a.visit?.id ? 'Open visit' : 'Start visit'} />)}
    </ul>
  );
}

const doctorName = (a: DayAppointment) => (a.doctor ? `Dr. ${`${a.doctor.firstName ?? ''} ${a.doctor.lastName ?? ''}`.trim()}` : 'Doctor not set');

export function TodayByDoctor({ appointments, total }: { appointments: DayAppointment[]; total: number }) {
  if (appointments.length === 0) return <p className="py-4 text-muted-foreground">No appointments scheduled for today.</p>;
  const groups = new Map<string, DayAppointment[]>();
  for (const a of [...appointments].sort((x, y) => x.slot.localeCompare(y.slot))) groups.set(a.doctorId, [...(groups.get(a.doctorId) ?? []), a]);
  return (
    <div className="space-y-3">
      <div className="grid gap-6 lg:grid-cols-2">
        {[...groups.values()].map((list) => (
          <div key={list[0].doctorId}>
            <h3 className="pb-1 text-sm font-semibold text-foreground">{doctorName(list[0])} <span className="font-normal text-muted-foreground">· {list.length} booked</span></h3>
            <ul className="divide-y border-y" aria-label={`${doctorName(list[0])} today`}>
              {list.map((a) => <AppointmentRow key={a.id} appointment={a} href={a.patient ? `/dashboard/patients/${encodeURIComponent(a.patient.id)}` : '/dashboard/appointments'} />)}
            </ul>
          </div>
        ))}
      </div>
      {total > appointments.length && (
        <p className="text-sm text-muted-foreground">
          Showing {appointments.length} of {total}. <Link className="font-medium text-foreground underline" href="/dashboard/appointments">Open the full calendar</Link>
        </p>
      )}
    </div>
  );
}
