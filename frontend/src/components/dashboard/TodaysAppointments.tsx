'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock } from 'lucide-react';
import { apiClient } from '@/lib/api';
import type { AppointmentInSlot, AppointmentStatus, ClinicBillAccess, GetDoctorScheduleResponse } from '@/lib/types';
import { formatPatientName, getISTDateString } from '@/lib/utils';
import { visitHref } from '@/lib/dashboard-links';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AppointmentBillDialog } from '@/components/appointments/AppointmentBillDialog';
import { billingChip, parseRupees, type BillingTone } from '@/components/appointments/appointment-billing-view';
import { formatRupee } from '@/components/pharmacy/reports/report-format';
import { LoadFailureState, loadFailure, type LoadFailure } from './load-failure';

/** desk: every doctor's day with its bills; doctor: the signed-in doctor's day with its visits; summary: the next few bookings. */
export type AppointmentsMode = 'desk' | 'doctor' | 'summary';

type Row = AppointmentInSlot & { doctorName?: string };

const STATUS_WORDS: Record<string, string> = {
  SCHEDULED: 'Scheduled',
  CONFIRMED: 'Confirmed',
  CHECKED_IN: 'Checked in',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  NO_SHOW: 'No-show',
  CANCELLED: 'Cancelled',
  RESCHEDULED: 'Rescheduled',
};
const FINISHED = new Set(['COMPLETED', 'NO_SHOW', 'CANCELLED']);

const CHIP_TONE: Record<BillingTone, string> = {
  paid: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  due: 'bg-amber-50 text-amber-900 ring-amber-300',
  unbilled: 'bg-amber-50 text-amber-900 ring-amber-300',
  quiet: 'bg-gray-50 text-gray-700 ring-gray-200',
};

export const NO_BILL_ACCESS: ClinicBillAccess = { read: false, createBill: false, takePayment: false, editFees: false };

type Schedule = GetDoctorScheduleResponse['appointments'][number];

/** The chip keeps the calendar's wording; its amounts take the dashboard's one money format. */
const inPageRupees = (chipText: string) => chipText.replace(/₹[\d,]+(\.\d+)?/g, (amount) => formatRupee(parseRupees(amount) ?? 0));

export function toRow(a: Schedule, doctorName?: string): Row {
  return {
    id: a.id,
    slot: a.slot,
    patient: { id: a.patient?.id ?? '', name: formatPatientName(a.patient), phone: a.patient?.phone },
    doctor: a.doctor ?? { firstName: '', lastName: '' },
    visitType: a.visitType,
    status: a.status,
    calendar: a.calendar,
    visit: a.visit ? { id: a.visit.id, status: a.visit.status ?? undefined } : undefined,
    billType: a.billType,
    billing: a.billing,
    fee: a.fee,
    notes: a.notes ?? undefined,
    doctorName,
  };
}

const SUMMARY_ROWS = 5;

const nextFirst = (rows: Row[]) =>
  [...rows].sort((a, b) => Number(FINISHED.has(a.status)) - Number(FINISHED.has(b.status)) || a.slot.localeCompare(b.slot));

async function loadDay(mode: AppointmentsMode, doctorId: string | undefined, date: string): Promise<{ rows: Row[]; access: ClinicBillAccess }> {
  if (mode === 'doctor') {
    const schedule = await apiClient.getDoctorSchedule(doctorId ?? '', date);
    return { rows: (schedule?.appointments ?? []).map((a) => toRow(a)), access: NO_BILL_ACCESS };
  }
  const res: any = await apiClient.getAppointments({ date, limit: 100, sortBy: 'slot', sortOrder: 'asc' });
  const booked: any[] = res?.appointments || res?.data || [];
  if (mode === 'summary') return { rows: nextFirst(booked.map((a) => toRow(a))).slice(0, SUMMARY_ROWS), access: NO_BILL_ACCESS };
  const doctors = new Map<string, string>();
  for (const a of booked) if (a.doctorId) doctors.set(a.doctorId, [a.doctor?.firstName, a.doctor?.lastName].filter(Boolean).join(' '));
  const schedules = await Promise.all([...doctors.keys()].map((id) => apiClient.getDoctorSchedule(id, date)));
  const named = doctors.size > 1;
  return {
    rows: schedules.flatMap((schedule) => (schedule?.appointments ?? []).map((a) => toRow(a, named ? doctors.get(schedule.doctorId) : undefined))),
    access: schedules.find((s) => s?.billingAccess)?.billingAccess ?? NO_BILL_ACCESS,
  };
}

function visitLabel(row: Row): string | null {
  if (row.status === 'NO_SHOW' || row.status === 'CANCELLED') return null;
  if (!row.visit) return 'Start visit';
  return row.visit.status === 'COMPLETED' ? 'Open visit' : 'Continue visit';
}

export function TodaysAppointments({ mode, doctorId }: { mode: AppointmentsMode; doctorId?: string }) {
  const router = useRouter();
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error'; failure: LoadFailure } | { status: 'ready'; rows: Row[]; access: ClinicBillAccess }>({ status: 'loading' });
  const [billForId, setBillForId] = useState<string | null>(null);
  const today = getISTDateString();

  const load = useCallback(async () => {
    try {
      const day = await loadDay(mode, doctorId, today);
      setState({ status: 'ready', rows: nextFirst(day.rows), access: day.access });
    } catch (error) {
      console.error("Failed to load today's appointments", error);
      setState({ status: 'error', failure: loadFailure(error) });
    }
  }, [doctorId, mode, today]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = state.status === 'ready' ? state.rows : [];
  const nextId = rows.find((row) => !FINISHED.has(row.status))?.id;
  const billFor = rows.find((row) => row.id === billForId) ?? null;

  return (
    <Card data-tour="appointments-list" className="gap-3">
      <CardHeader>
        <CardTitle className="flex items-center">
          <Clock className="h-5 w-5 text-blue-500 mr-2" />
          {mode === 'doctor' ? "Today's patients" : "Today's appointments"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {state.status === 'loading' && <p role="status" className="text-sm text-gray-500">Loading today&apos;s appointments…</p>}
        {state.status === 'error' && <LoadFailureState failure={state.failure} subject="today's appointments" onRetry={() => void load()} />}
        {state.status === 'ready' && rows.length === 0 && <p className="text-gray-500 text-center py-4">No appointments scheduled for today</p>}
        {state.status === 'ready' && rows.length > 0 && (
          <>
            <ul className="divide-y rounded-lg border" aria-label="Today's appointments">
              {rows.map((row) => {
                const chip = mode === 'desk' && row.billing && state.access.read ? billingChip(row.billing, row.billType) : null;
                const action = mode === 'doctor' ? visitLabel(row) : null;
                return (
                  <li key={row.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 ${FINISHED.has(row.status) ? 'text-gray-500' : ''}`}>
                    <span data-appointment-time className="w-28 shrink-0 whitespace-nowrap text-sm tabular-nums">{row.slot}</span>
                    <span className="order-first basis-full text-sm font-medium text-gray-900 sm:order-none sm:min-w-0 sm:flex-1 sm:basis-0 sm:truncate">
                      <span data-patient-name>{row.patient.name}</span>
                      {row.doctorName && <span className="font-normal text-gray-500"> · Dr. {row.doctorName}</span>}
                    </span>
                    <span className="mr-auto text-xs text-gray-600 sm:mr-0" data-appointment-status={row.status}>{STATUS_WORDS[row.status as AppointmentStatus] ?? row.status}</span>
                    {chip && (
                      <button
                        type="button"
                        onClick={() => setBillForId(row.id)}
                        aria-label={inPageRupees(chip.label)}
                        title={inPageRupees(chip.label)}
                        className={`rounded px-2 py-0.5 text-xs font-semibold ring-1 ring-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${CHIP_TONE[chip.tone]}`}
                      >
                        {inPageRupees(chip.text)}
                      </button>
                    )}
                    {action && (
                      <Button asChild size="sm" variant={row.id === nextId ? 'default' : 'outline'}>
                        <Link href={visitHref(row)}>{action}</Link>
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
            <Button variant="outline" className="w-full mt-3" onClick={() => router.push('/dashboard/appointments')}>
              View All Appointments
            </Button>
          </>
        )}
      </CardContent>
      {mode === 'desk' && (
        <AppointmentBillDialog
          appointment={billFor}
          date={today}
          access={state.status === 'ready' ? state.access : NO_BILL_ACCESS}
          onClose={() => setBillForId(null)}
          onChanged={load}
        />
      )}
    </Card>
  );
}
