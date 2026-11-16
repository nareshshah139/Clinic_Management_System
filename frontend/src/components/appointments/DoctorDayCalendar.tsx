"use client";

import { Spinner } from '@/components/ui/spinner';
import { LoadingSkeleton } from '@/components/ui/skeleton';
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import PatientProgressTracker from '@/components/patients/PatientProgressTracker';
import { apiClient } from '@/lib/api';
import { billTypeLabel, clinicMoney } from '@/lib/clinic-billing';
import { useRouter } from 'next/navigation';
import { X, FileText, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  generateTimeSlots,
  isSlotInPast,
  getErrorMessage,
  formatPatientName,
  createCleanupTimeouts,
  doTimeSlotsOverlap,
  getISTDateString,
  hhmmToMinutes,
  minutesToHHMM,
    addMinutesToHHMM,
    getSlotDurationMinutes,
  calculateAge,
} from '@/lib/utils';
import type {
  AppointmentInSlot,
  TimeSlotConfig,
  GetDoctorScheduleResponse,
  Appointment
} from '@/lib/types';
import { AppointmentStatus } from '@cms/shared-types';

export interface DoctorDayCalendarProps {
  doctorId: string;
  date: string; // YYYY-MM-DD
  recentBookedSlot?: string;
  visitTypeFilter?: string;
  roomFilter?: string;
  onSelectSlot?: (slot: string) => void;
  refreshKey?: number;
  bookingInProgress?: string;
  optimisticAppointment?: AppointmentInSlot;
  onAppointmentUpdate?: () => void;
  timeSlotConfig?: TimeSlotConfig;
  disableSlotBooking?: boolean;
  selectedRoomName?: string;
}

/**
 * @cc [owner:nareshshah139,label:product] appointment-timeline-proportions
 * Every positive appointment duration MUST receive at least 160 pixels of vertical space.
 * Grid rows and appointment positions MUST use the same pixels-per-minute scale so adjacent
 * appointments meet at their shared time boundary regardless of the selected grid interval.
 */
/**
 * @cc [owner:nareshshah139,label:product] appointment-whole-day-extent
 * The timeline height MUST cover the entire configured day, including a final partial grid
 * interval. Displaying that interval MUST NOT add a bookable slot beyond the generated slots.
 */
/**
 * @cc [owner:nareshshah139,label:product] appointment-outside-hours-visible
 * Valid scheduled appointments outside configured hours MUST extend the visible timeline
 * without creating additional bookable slots or shifting configured slots against their labels.
 */
export function appointmentTimelineScale(stepMinutes: number, appointmentSlots: string[], day = { startHour: 9, endHour: 18 }) {
  const step = Math.max(5, Math.floor(stepMinutes || 10));
  const ranges = appointmentSlots.map(slot => {
    const [start, end] = slot.split('-');
    if (!/^\d{2}:\d{2}$/.test(start || '') || !/^\d{2}:\d{2}$/.test(end || '')) return null;
    const from = hhmmToMinutes(start), to = hhmmToMinutes(end);
    return from >= 0 && to <= 1440 && to > from && Number(start.slice(3)) < 60 && Number(end.slice(3)) < 60 ? { from, to } : null;
  }).filter((range): range is { from: number; to: number } => range !== null);
  const durations = ranges.map(({ from, to }) => to - from);
  const pixelsPerMinute = 160 / Math.min(step, ...durations);
  const configuredStart = Math.max(0, Math.floor(day.startHour * 60));
  const configuredEnd = Math.max(configuredStart, Math.floor(day.endHour * 60));
  const startMinute = Math.min(configuredStart, ...ranges.map(range => range.from));
  const endMinute = Math.max(configuredEnd, ...ranges.map(range => range.to));
  return { pixelsPerMinute, tileHeight: pixelsPerMinute * step, startMinute, endMinute, height: (endMinute - startMinute) * pixelsPerMinute };
}

/**
 * @cc [owner:nareshshah139,label:product] appointment-overlap-columns
 * Overlapping appointments MUST occupy different columns. Every appointment in a connected
 * overlap group MUST use the same column count; adjacent and disjoint groups may reuse columns.
 * Assignment MUST be independent of input ordering and MUST NOT mutate appointments.
 */
export function appointmentTimelineColumns(appointments: Pick<AppointmentInSlot, 'id' | 'slot'>[]) {
  const intervals = appointments.map(appointment => {
    const [start, end] = appointment.slot.split('-');
    return { key: appointment.id || appointment.slot, start: hhmmToMinutes(start || ''), end: hhmmToMinutes(end || '') };
  }).filter(interval => interval.end > interval.start)
    .sort((a, b) => a.start - b.start || a.end - b.end || a.key.localeCompare(b.key));
  const result = new Map<string, { column: number; count: number }>();
  let group: { key: string; column: number }[] = [];
  let columnEnds: number[] = [];
  let groupEnd = -Infinity;
  const finishGroup = () => {
    for (const entry of group) result.set(entry.key, { column: entry.column, count: columnEnds.length });
    group = [];
    columnEnds = [];
    groupEnd = -Infinity;
  };
  for (const interval of intervals) {
    if (interval.start >= groupEnd) finishGroup();
    let column = columnEnds.findIndex(end => end <= interval.start);
    if (column < 0) column = columnEnds.length;
    columnEnds[column] = interval.end;
    group.push({ key: interval.key, column });
    groupEnd = Math.max(groupEnd, interval.end);
  }
  finishGroup();
  return result;
}

/**
 * @cc [owner:nareshshah139,label:product] appointment-billing-readable-summary
 * Recorded bill types and total, paid and due amounts MUST remain visible beside the patient.
 * Multiple bills MUST expose every invoice in a keyboard-accessible breakdown without expanding
 * the appointment beyond its time span. Opening the breakdown MUST NOT change the appointment.
 */
/**
 * @cc [owner:nareshshah139,label:product] appointment-billing-dialog-focus
 * Closing the billing breakdown, including with Escape, MUST restore keyboard focus to its opener.
 */
export function AppointmentBillingSummary({ appointment }: { appointment: AppointmentInSlot }) {
  const bills = appointment.billing?.invoices || [];
  if (!bills.length) return <div data-appointment-billing={appointment.id} className="text-base text-muted-foreground">No bill recorded</div>;
  const totals = bills.reduce((sum, bill) => ({ total: sum.total + Math.round(bill.total * 100), paid: sum.paid + Math.round(bill.received * 100), due: sum.due + Math.round(bill.balance * 100) }), { total: 0, paid: 0, due: 0 });
  const patientName = formatPatientName(appointment.patient ?? { name: 'Unknown' });
  return <Dialog>
    <DialogTrigger asChild>
    <button type="button" data-appointment-billing={appointment.id} aria-label={`Billing for ${patientName}`} aria-haspopup="dialog" onClick={event => event.stopPropagation()} className="w-full min-w-0 rounded-md p-1 text-left text-base font-normal hover:bg-card/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
      <span className="block break-words font-semibold">{Array.from(new Set(bills.map(bill => billTypeLabel(bill.billType)))).join(' · ')}</span>
      <span className="grid grid-cols-3 gap-2">
        {([['Total', totals.total], ['Paid', totals.paid], ['Due', totals.due]] as const).map(([label, amount]) => <span key={label} className="min-w-0"><span className="block text-muted-foreground">{label}</span><span className="block break-words tabular-nums">{clinicMoney(amount / 100)}</span></span>)}
      </span>
      <span className="block text-info-text underline">{bills.length} {bills.length === 1 ? 'bill' : 'bills'} · Details</span>
    </button>
    </DialogTrigger>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Billing for {patientName}</DialogTitle><DialogDescription>Payments and outstanding amounts for this appointment.</DialogDescription></DialogHeader>
        <div className="space-y-4">{bills.map(bill => <section key={bill.id} className="border-b pb-4 text-base">
          <h3 className="font-semibold">{billTypeLabel(bill.billType)} · {bill.invoiceNo}</h3>
          <p>{bill.status}</p>
          <dl className="grid grid-cols-3 gap-3">{([['Total', bill.total], ['Paid', bill.received], ['Due', bill.balance]] as const).map(([label, amount]) => <div key={label}><dt>{label}</dt><dd className="break-words tabular-nums">{clinicMoney(amount)}</dd></div>)}</dl>
        </section>)}</div>
      </DialogContent>
  </Dialog>;
}

/**
 * @cc [owner:nareshshah139,label:product] appointment-calendar-readable-slots
 * The day MUST remain in a bounded scrolling viewport with readable time slots. Patient and
 * billing text MUST wrap and scroll within each appointment's time span when it does not fit;
 * action buttons MUST remain keyboard accessible.
 * Changing the presentation MUST NOT change booking times or appointment action destinations.
 */
/**
 * @cc [owner:nareshshah139,label:product] appointment-calendar-theme-states
 * Visit types, completed and past appointments, pending bookings and the current-time marker
 * MUST use theme-aware colors. Theme changes MUST NOT alter slot or overlap geometry.
 */
export default function DoctorDayCalendar({ 
  doctorId, 
  date, 
  recentBookedSlot, 
  visitTypeFilter = 'ALL',
  roomFilter = 'ALL',
  onSelectSlot,
  refreshKey = 0,
  bookingInProgress,
  optimisticAppointment,
  onAppointmentUpdate,
  timeSlotConfig = {
    startHour: 9,
    endHour: 18,
    stepMinutes: 30,
    timezone: 'Asia/Kolkata'
  },
  disableSlotBooking = false,
  selectedRoomName,
}: DoctorDayCalendarProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [schedule, setSchedule] = useState<AppointmentInSlot[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentInSlot | null>(null);
  const [cancellingAppointment, setCancellingAppointment] = useState<string | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState<boolean>(false);
  const [rescheduleTarget, setRescheduleTarget] = useState<AppointmentInSlot | null>(null);
  const [rescheduleLoading, setRescheduleLoading] = useState<boolean>(false);
  // Drag-to-select state for creating appointments
  const [selecting, setSelecting] = useState<boolean>(false);
  const [selectionStartIdx, setSelectionStartIdx] = useState<number | null>(null);
  const [selectionEndIdx, setSelectionEndIdx] = useState<number | null>(null);
  // Long press state for appointment details
  const [longPressTimer, setLongPressTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [isLongPressing, setIsLongPressing] = useState<boolean>(false);

  // Use selected grid size (stepMinutes) to control tiles per hour
  const baseGridSlots = useMemo(() => generateTimeSlots({
    startHour: timeSlotConfig.startHour,
    endHour: timeSlotConfig.endHour,
    stepMinutes: Math.max(5, timeSlotConfig.stepMinutes || 10),
    timezone: timeSlotConfig.timezone,
  }), [timeSlotConfig.startHour, timeSlotConfig.endHour, timeSlotConfig.stepMinutes, timeSlotConfig.timezone]);
  const cleanupTimeouts = useMemo(() => createCleanupTimeouts(), []);
  const roomFilterLabel = roomFilter !== 'ALL' ? (selectedRoomName ?? 'Unknown Room') : undefined;

  // Compute 'now' data in calendar timezone (defaults to Asia/Kolkata)
  const isToday = useMemo(() => date === getISTDateString(), [date]);
  const nowHHMM = useMemo(() => {
    try {
      const tz = timeSlotConfig.timezone || 'Asia/Kolkata';
      const local = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${pad(local.getHours())}:${pad(local.getMinutes())}`;
    } catch {
      return '';
    }
  }, [timeSlotConfig.timezone]);

  // Filter appointments based on status, visitType and room filters
  const filteredSchedule = useMemo(() => {
    let appointments = schedule.filter(a => a.status !== AppointmentStatus.CANCELLED);
    
    if (optimisticAppointment) {
      const visitTypeMatch = visitTypeFilter === 'ALL' || optimisticAppointment.visitType === visitTypeFilter;
      const roomMatch = roomFilter === 'ALL' || optimisticAppointment.room?.id === roomFilter;
      
      if (visitTypeMatch && roomMatch) {
        appointments = appointments.filter(apt => apt.slot !== optimisticAppointment.slot);
        appointments.push(optimisticAppointment);
      }
    }
    
    return appointments.filter(apt => {
      const visitTypeMatch = visitTypeFilter === 'ALL' || apt.visitType === visitTypeFilter;
      const roomMatch = roomFilter === 'ALL' || apt.room?.id === roomFilter;
      return visitTypeMatch && roomMatch;
    });
  }, [schedule, visitTypeFilter, roomFilter, optimisticAppointment]);
  const timelineScale = appointmentTimelineScale(timeSlotConfig.stepMinutes, filteredSchedule.map(appointment => appointment.slot), timeSlotConfig);
  const tileHeightCss = timelineScale.tileHeight;
  const timelineColumns = useMemo(() => appointmentTimelineColumns(filteredSchedule), [filteredSchedule]);

  // Build quick lookup for overlap checks
  const bookedBySlot = useMemo(() => new Map(filteredSchedule.map(a => [a.slot, a])), [filteredSchedule]);
  const showLoadingOverlay = loading && (schedule.length > 0 || !!optimisticAppointment);

  const fetchSchedule = useCallback(async () => {
    if (!doctorId || !date) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const res: GetDoctorScheduleResponse = await apiClient.getDoctorSchedule(doctorId, date);

      // Map backend appointments to slot-wise entries with proper type safety
      const sourceAppointments: Appointment[] = Array.isArray(res?.appointments) ? res.appointments : [];
      
      // Enrich appointments with patient details (age, gender, visit history)
      const items: AppointmentInSlot[] = await Promise.all(
        sourceAppointments
          .filter((a: Appointment) => (a.status as AppointmentStatus) !== AppointmentStatus.CANCELLED)
          .map(async (a: Appointment) => {
            let patientDetails: any = null;
            let isFollowUp = false;
            
            // Fetch full patient details to get gender, dob, and visit history
            if (a.patient?.id) {
              try {
                patientDetails = await apiClient.getPatient(a.patient.id);
                // Check if patient has previous visits (follow-up)
                if (patientDetails) {
                  try {
                    const visitHistory: any = await apiClient.getPatientVisitHistory(a.patient.id);
                    const visits = Array.isArray(visitHistory) ? visitHistory : (visitHistory?.visits || visitHistory?.data || []);
                    isFollowUp = visits.length > 0;
                  } catch (err) {
                    console.warn('Failed to fetch visit history:', err);
                  }
                }
              } catch (err) {
                console.warn('Failed to fetch patient details:', err);
              }
            }
            
            const age = (patientDetails as any)?.age != null
              ? (patientDetails as any).age
              : patientDetails?.dob ? calculateAge(patientDetails.dob) : undefined;
            
            return {
              slot: a.slot,
              patient: a.patient ? { 
                id: a.patient.id, 
                name: formatPatientName(a.patient),
                phone: a.patient.phone,
                email: a.patient.email,
                gender: patientDetails?.gender,
                dob: patientDetails?.dob,
                age: age ?? undefined,
              } : { id: '', name: 'Unknown Patient' },
              doctor: a.doctor || { firstName: 'Dr.', lastName: 'Unknown' },
              visitType: a.visitType || 'OPD',
              room: a.room,
              id: a.id,
              status: (a.status as AppointmentStatus) || AppointmentStatus.SCHEDULED,
              visit: a.visit ? { id: a.visit.id, status: a.visit.status ?? undefined } : undefined,
              isFollowUp,
              notes: (a as any).notes ?? undefined,
              billing: a.billing,
            };
          })
      );
      
      setSchedule(items);
    } catch (e) {
      const errorMessage = getErrorMessage(e);
      setError(errorMessage);
      toast({
        variant: "destructive",
        title: "Failed to load schedule",
        description: errorMessage,
      });
    } finally {
      setLoading(false);
    }
  }, [doctorId, date, toast]);

  useEffect(() => {
    void fetchSchedule();
  }, [fetchSchedule, refreshKey]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      cleanupTimeouts.clearAll();
      if (longPressTimer) {
        clearTimeout(longPressTimer);
      }
    };
  }, [cleanupTimeouts, longPressTimer]);

  const handleCancelAppointment = async (appointment: AppointmentInSlot) => {
    if (!appointment.id || appointment.id.startsWith('optimistic-')) return;
    
    setCancellingAppointment(appointment.id);
    setSelectedAppointment(appointment);
    setShowCancelDialog(true);
  };

  const confirmCancelAppointment = async () => {
    if (!cancellingAppointment) return;
    
    const appointmentIdToCancel = cancellingAppointment;
    
    try {
      await apiClient.deleteAppointment(appointmentIdToCancel);
      
      toast({
        variant: "success",
        title: "Appointment Cancelled",
        description: "The appointment has been successfully cancelled.",
      });
      
      // Refresh the schedule
      await fetchSchedule();
      
      // Notify parent component
      onAppointmentUpdate?.();
      
      // Close dialogs
      setShowCancelDialog(false);
      setSelectedAppointment(null);
      setCancellingAppointment(null);
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      console.error('Failed to cancel appointment:', error);
      toast({
        variant: "destructive",
        title: "Failed to cancel appointment",
        description: errorMessage,
      });
      // Clear cancelling state even on error to allow retry
      setCancellingAppointment(null);
    }
  };

  const handleStartVisit = (appointment: AppointmentInSlot) => {
    if (!appointment.patient?.id || !appointment.id || appointment.id.startsWith('optimistic-')) return;
    
    // Navigate to visits page with appointment data
    const searchParams = new URLSearchParams({
      patientId: appointment.patient.id,
      appointmentId: appointment.id,
    });

    if (appointment.visit?.id) {
      searchParams.set('visitId', appointment.visit.id);
    } else {
      searchParams.set('autoStart', 'true');
    }

    router.push(`/dashboard/visits?${searchParams.toString()}`);
  };

  if (loading && schedule.length === 0) {
    return (
      <Card>
        <CardContent className="p-4">
          <LoadingSkeleton label="Loading schedule…" />
        </CardContent>
      </Card>
    );
  }

  if (error && schedule.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="text-destructive-text mb-4">Failed to load schedule</div>
          <Button onClick={() => void fetchSchedule()} variant="outline">
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardContent className="p-4">
          {(visitTypeFilter !== 'ALL' || roomFilter !== 'ALL') && (
            <div className="mb-4 p-3 bg-info-soft rounded-lg">
              <div className="text-sm text-info-text">
                <span className="font-medium">Filters Active:</span>
                {visitTypeFilter !== 'ALL' && <Badge variant="secondary" className="ml-2">{visitTypeFilter}</Badge>}
                {roomFilterLabel && (
                  <Badge variant="outline" className="ml-2">
                    Room: {roomFilterLabel}
                  </Badge>
                )}
              </div>
            </div>
          )}
          
          <div className="relative" aria-busy={loading}>
            {rescheduleTarget && (
              <div className="mb-3 flex items-start justify-between rounded-lg border border-warning-border bg-warning-soft p-3 text-sm">
                <div>
                  <div className="font-medium text-warning-text">Rescheduling {formatPatientName(rescheduleTarget.patient)}</div>
                  <div className="text-warning-text">Click a free time to move this appointment to {date}.</div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setRescheduleTarget(null)} disabled={rescheduleLoading}>
                  Cancel
                </Button>
              </div>
            )}
            {showLoadingOverlay && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-card/70 backdrop-blur-sm transition-opacity duration-200">
                <Spinner className=" h-8 w-8    " />
                <span className="mt-2 text-sm font-medium text-info-text">Refreshing schedule…</span>
              </div>
            )}
            <div className="flex max-h-[72vh] overflow-auto overscroll-contain" role="region" aria-label="Doctor appointment timeline" tabIndex={0} data-calendar-scroll>
              {/* Sticky left gutter with hour labels */}
              <div className="w-16 shrink-0 sticky left-0 self-start z-10 bg-card/95" style={{ minHeight: timelineScale.height, paddingTop: (Math.max(0, Math.floor(timeSlotConfig.startHour * 60)) - timelineScale.startMinute) * timelineScale.pixelsPerMinute, boxSizing: 'border-box' }}>
                {baseGridSlots.map((slot) => {
                  const slotStart = slot.split('-')[0];
                  const isHourStart = slotStart.endsWith(':00');
                  return (
                    <div key={`gutter-${slot}`} style={{ height: tileHeightCss }} className="flex items-start justify-end pr-1">
                      {isHourStart && (
                        <span className="text-base leading-normal text-muted-foreground">{slotStart}</span>
                      )}
                    </div>
                  );
                })}
              </div>
              {/* Main calendar grid */}
              <div
                className="flex-1 self-start grid grid-cols-1 gap-0"
                data-calendar-grid
                style={{ height: timelineScale.height, paddingTop: (Math.max(0, Math.floor(timeSlotConfig.startHour * 60)) - timelineScale.startMinute) * timelineScale.pixelsPerMinute, boxSizing: 'border-box', gridAutoRows: timelineScale.tileHeight, minWidth: 640 * Math.max(1, ...Array.from(timelineColumns.values(), value => value.count)), position: 'relative', ...(showLoadingOverlay ? { pointerEvents: 'none', opacity: 0.6 } : {}) }}
              >
            {/* Appointment-level background overlays across full spans (merges cells visually) */}
            {(() => {
              const dayStartMin = timelineScale.startMinute;
              const dayEndMin = timelineScale.endMinute;
              const getColor = (apt: AppointmentInSlot) => {
                const isPast = isSlotInPast(apt.slot, date);
                
                if (apt.status === AppointmentStatus.COMPLETED) return 'var(--muted)';
                
                if (isPast) {
                  if (apt.visitType === 'PROCEDURE') return 'color-mix(in oklab, var(--calendar-procedure) 55%, var(--card))';
                  if (apt.visitType === 'TELEMED') return 'color-mix(in oklab, var(--highlight-soft) 55%, var(--card))';
                  return 'color-mix(in oklab, var(--calendar-consultation) 55%, var(--card))';
                }
                
                if (apt.visitType === 'PROCEDURE') return 'var(--calendar-procedure)';
                if (apt.visitType === 'TELEMED') return 'var(--highlight-soft)';
                return 'var(--calendar-consultation)';
              };
              return filteredSchedule.map((apt) => {
                const [as, ae] = (apt.slot || '').split('-');
                if (!as || !ae) return null;
                const aptStart = hhmmToMinutes(as);
                const aptEnd = hhmmToMinutes(ae);
                const clampedStart = Math.max(dayStartMin, Math.min(aptStart, dayEndMin));
                const clampedEnd = Math.max(dayStartMin, Math.min(aptEnd, dayEndMin));
                if (clampedEnd <= clampedStart) return null;
                const topPx = (clampedStart - dayStartMin) * timelineScale.pixelsPerMinute;
                const heightPx = (clampedEnd - clampedStart) * timelineScale.pixelsPerMinute;
                const layout = timelineColumns.get(apt.id || apt.slot) || { column: 0, count: 1 };
                const widthPct = 100 / layout.count;
                const leftPct = layout.column * widthPct;
                const bg = getColor(apt);
                return (
                  <div
                    key={`span-bg-${apt.id || apt.slot}`}
                    className="absolute"
                    style={{
                      top: topPx,
                      height: heightPx,
                      left: `${leftPct}%`,
                      width: `${widthPct}%`,
                      backgroundColor: bg,
                      borderRadius: 6,
                      zIndex: 1,
                      pointerEvents: 'none',
                    }}
                  />
                );
              });
            })()}
            {/* Floating labels across full appointment spans */}
            {(() => {
              const dayStartMin = timelineScale.startMinute;
              const dayEndMin = timelineScale.endMinute;
              return filteredSchedule.map((apt) => {
                const [as, ae] = (apt.slot || '').split('-');
                if (!as || !ae) return null;
                const aptStart = hhmmToMinutes(as);
                const aptEnd = hhmmToMinutes(ae);
                const clampedStart = Math.max(dayStartMin, Math.min(aptStart, dayEndMin));
                const clampedEnd = Math.max(dayStartMin, Math.min(aptEnd, dayEndMin));
                if (clampedEnd <= clampedStart) return null;
                const topPx = (clampedStart - dayStartMin) * timelineScale.pixelsPerMinute;
                const heightPx = (clampedEnd - clampedStart) * timelineScale.pixelsPerMinute;
                const layout = timelineColumns.get(apt.id || apt.slot) || { column: 0, count: 1 };
                const widthPct = 100 / layout.count;
                return (
                  <div
                    key={`span-label-${apt.id || apt.slot}`}
                    className="absolute group"
                    style={{
                      left: `${layout.column * widthPct}%`,
                      width: `${widthPct}%`,
                      top: topPx,
                      height: heightPx,
                      pointerEvents: 'auto',
                      color: apt.status === AppointmentStatus.COMPLETED ? 'var(--foreground)' : apt.visitType === 'PROCEDURE' ? 'var(--calendar-procedure-foreground)' : apt.visitType === 'TELEMED' ? 'var(--highlight-text)' : 'var(--calendar-consultation-foreground)',
                      zIndex: 2,
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'center',
                    }}
                  >
                    <div className="grid w-full min-w-0 max-h-full overflow-y-auto overscroll-contain grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-4 px-3 py-2 text-base" data-appointment-label={apt.id} role="group" aria-label={`Appointment for ${formatPatientName(apt.patient ?? { name: 'Unknown' })}`} tabIndex={0}>
                      <div className="min-w-0 space-y-1 break-words">
                        <div className="font-semibold">{`${as}–${ae}`}</div>
                        <div className="font-semibold" data-patient-name>{formatPatientName(apt.patient ?? { name: 'Unknown' })}</div>
                        <div className="flex flex-wrap gap-x-2">
                          {apt.patient?.age !== undefined && <span>{apt.patient.age}y</span>}
                          {apt.patient?.gender && <span>{apt.patient.gender}</span>}
                          {apt.room?.name && <span>{apt.room.name}</span>}
                          <span>{apt.visitType || 'OPD'}</span>
                          {apt.isFollowUp && <span className="text-warning-text">Follow-up</span>}
                        </div>
                        {apt.visitType === 'PROCEDURE' && apt.notes && <p className="text-highlight-text">{apt.notes}</p>}
                      </div>
                      <div className="min-w-0"><AppointmentBillingSummary appointment={apt} /></div>
                    </div>
                    
                    {/* Action buttons - appear on hover */}
                    <div className="absolute right-2 top-1 z-20 flex flex-wrap justify-end gap-1 rounded-md bg-card p-1 shadow-sm opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto transition-opacity duration-200">
                      <button className="bg-card border rounded-md px-2 text-base" onClick={e => { e.stopPropagation(); router.push(`/dashboard/clinic-billing?appointmentId=${encodeURIComponent(apt.id)}&patientId=${encodeURIComponent(apt.patient.id)}`); }}>Bill</button>
                      {/* View Appointment Details Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedAppointment(apt);
                        }}
                        className="bg-secondary hover:bg-muted text-secondary-foreground text-xs px-2 py-1 rounded-md shadow-sm transition-colors font-medium"
                        title="View Appointment Details"
                        disabled={apt.id?.startsWith('optimistic-')}
                      >
                        INFO
                      </button>
                      
                      {/* Reschedule Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setRescheduleTarget(apt);
                        }}
                        className="bg-warning hover:bg-warning text-warning-foreground text-xs px-2 py-1 rounded-md shadow-sm transition-colors font-medium"
                        title="Reschedule Appointment"
                        disabled={apt.id?.startsWith('optimistic-')}
                      >
                        RESCHED
                      </button>
                      
                      {/* Connect to Visit Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartVisit(apt);
                        }}
                        className="bg-info hover:bg-info text-info-foreground text-xs px-2 py-1 rounded-md shadow-sm transition-colors font-medium"
                        title={apt.visit?.id ? 'Continue Visit' : 'Start Visit'}
                        disabled={apt.id?.startsWith('optimistic-')}
                      >
                        {apt.visit?.id ? 'CONT' : 'START'}
                      </button>
                    </div>
                  </div>
                );
              });
            })()}
            {baseGridSlots.map((slot, idx) => {
              // Determine overlaps with any appointment
              const overlappingAppointments = filteredSchedule.filter(a => doTimeSlotsOverlap(a.slot, slot));
              const hasAny = overlappingAppointments.length > 0;
              const primary = overlappingAppointments[0];
              const past = isSlotInPast(slot, date);
              const isNewlyBooked = recentBookedSlot === slot || (primary?.slot === recentBookedSlot);
              const isBookingInProgress = bookingInProgress === slot;
              const isDisabled = past || isBookingInProgress || hasAny || (!rescheduleTarget && disableSlotBooking);
              const slotStart = slot.split('-')[0];
              const primaryStart = primary?.slot?.split('-')[0];
              const isPrimaryStartTile = !!(hasAny && primary && slotStart === primaryStart);

              // Hour divider: draw a subtle top line on HH:00 tiles
              const isHourStart = slotStart.endsWith(':00');
              // Now line: highlight current 10-min tile for today
              const showNowLine = (() => {
                if (!isToday || !nowHHMM) return false;
                const [s, e] = slot.split('-');
                const n = hhmmToMinutes(nowHHMM);
                return n >= hhmmToMinutes(s) && n < hhmmToMinutes(e);
              })();

              // Selection preview highlighting (only on free tiles)
              const inSelectionPreview = (() => {
                if (!selecting || selectionStartIdx === null || selectionEndIdx === null) return false;
                const lo = Math.min(selectionStartIdx, selectionEndIdx);
                const hi = Math.max(selectionStartIdx, selectionEndIdx);
                return idx >= lo && idx <= hi && !hasAny;
              })();

              // Precompute tile boundaries in minutes for partial-fill overlays
              const [tileStartStr, tileEndStr] = slot.split('-');
              const tileStartMin = hhmmToMinutes(tileStartStr);
              const tileEndMin = hhmmToMinutes(tileEndStr);
              const crossesTop = hasAny && overlappingAppointments.some((apt) => {
                const [as, ae] = apt.slot.split('-');
                const aptStart = hhmmToMinutes(as);
                const aptEnd = hhmmToMinutes(ae);
                return aptStart < tileStartMin && aptEnd > tileStartMin;
              });
              const crossesBottom = hasAny && overlappingAppointments.some((apt) => {
                const [as, ae] = apt.slot.split('-');
                const aptStart = hhmmToMinutes(as);
                const aptEnd = hhmmToMinutes(ae);
                return aptStart < tileEndMin && aptEnd > tileEndMin;
              });
              // Floating labels are enabled, so avoid duplicating inline details on the start tile
              const showInlineDetails = false;
              const showInlineActions = false;
              // Compute base border color once; avoid shorthand borderColor conflicts with per-side overrides
              const baseBorderColor = isBookingInProgress ? 'var(--warning-border)' : 'var(--border)';

              // Flexible selection within a tile: allow booking in sub-segments (e.g., 15m) if space exists
              const FLEX_STEP_MIN = 15; // baseline flexible start granularity
              const findFirstFreeStart = (requiredMinutes: number): number | null => {
                const maxStart = tileEndMin - requiredMinutes;
                for (let s = tileStartMin; s <= maxStart; s += FLEX_STEP_MIN) {
                  const e = s + requiredMinutes;
                  const candidate = `${minutesToHHMM(s)}-${minutesToHHMM(e)}`;
                  const overlaps = filteredSchedule.some(a => doTimeSlotsOverlap(a.slot, candidate));
                  if (!overlaps) return s;
                }
                return null;
              };
              // For booking (not reschedule), require FLEX_STEP_MIN free; for reschedule, require original duration
              const requiredMinutesForAction = rescheduleTarget ? Math.max(1, getSlotDurationMinutes(rescheduleTarget.slot)) : FLEX_STEP_MIN;
              const freeStartMin = findFirstFreeStart(requiredMinutesForAction);

              return (
                <div 
                  key={slot} 
                  className={`border rounded-none ${hasAny ? 'p-0' : 'p-1'} flex flex-col gap-1 transition-all duration-200 relative`}
                  style={{
                    backgroundColor: (() => {
                      if (isBookingInProgress) return 'var(--warning-soft)';
                      return past ? 'var(--muted)' : (inSelectionPreview ? 'var(--warning-soft)' : 'var(--card)');
                    })(),
                    // Per-side border colors to avoid shorthand conflicts
                    borderTopColor: hasAny && crossesTop ? 'transparent' : baseBorderColor,
                    borderBottomColor: hasAny && crossesBottom ? 'transparent' : baseBorderColor,
                    borderLeftColor: baseBorderColor,
                    borderRightColor: baseBorderColor,
                    opacity: past && !hasAny ? 0.6 : 1,
                    boxShadow: (() => {
                      const parts: string[] = [];
                      if (isNewlyBooked) parts.push('0 0 0 2px var(--success-border)');
                      else if (isBookingInProgress) parts.push('0 0 0 2px var(--warning-border)');
                      if (showNowLine) parts.push('inset 0 2px 0 var(--destructive)');
                      else if (isHourStart && !(hasAny && crossesTop)) parts.push('inset 0 1px 0 var(--border)');
                      return parts.length ? parts.join(', ') : 'none';
                    })(),
                    height: tileHeightCss,
                    pointerEvents: past ? 'none' : undefined,
                    overflow: 'hidden',
                  }}
                  title={(() => {
                    if (hasAny && primary) return `Long press to view details: ${formatPatientName(primary.patient ?? { name: 'Unknown' })} — ${primary.slot}`;
                    if (!past && freeStartMin !== null) {
                      const s = minutesToHHMM(freeStartMin);
                      const e = minutesToHHMM(freeStartMin + requiredMinutesForAction);
                      return `Book ${s}-${e}`;
                    }
                    return undefined;
                  })()}
                  onMouseDown={(e) => {
                    if (e.button !== 0) return; // left-click only
                    
                    // Start long press timer for appointments
                    if (hasAny && primary) {
                      const timer = setTimeout(() => {
                        setIsLongPressing(true);
                        setSelectedAppointment(primary);
                      }, 500); // 500ms for long press
                      setLongPressTimer(timer);
                    }
                    
                    if (rescheduleTarget) return; // creation only
                    if (past) return;
                    if (disableSlotBooking) {
                      if (!hasAny) {
                        toast({ variant: 'destructive', title: 'Patient required', description: 'Search and select a patient before booking a slot.' });
                      }
                      return;
                    }
                    setSelecting(true);
                    setSelectionStartIdx(idx);
                    setSelectionEndIdx(idx);
                  }}
                  onMouseEnter={() => {
                    if (!selecting) return;
                    setSelectionEndIdx(idx);
                  }}
                  onMouseLeave={() => {
                    // Cancel long press if mouse leaves
                    if (longPressTimer) {
                      clearTimeout(longPressTimer);
                      setLongPressTimer(null);
                    }
                  }}
                  onTouchStart={(e) => {
                    // Handle touch for mobile devices
                    if (hasAny && primary) {
                      const timer = setTimeout(() => {
                        setIsLongPressing(true);
                        setSelectedAppointment(primary);
                      }, 500);
                      setLongPressTimer(timer);
                    }
                  }}
                  onTouchEnd={() => {
                    // Clear long press timer on touch end
                    if (longPressTimer) {
                      clearTimeout(longPressTimer);
                      setLongPressTimer(null);
                    }
                    if (isLongPressing) {
                      setIsLongPressing(false);
                    }
                  }}
                  onTouchCancel={() => {
                    // Cancel long press if touch is cancelled
                    if (longPressTimer) {
                      clearTimeout(longPressTimer);
                      setLongPressTimer(null);
                    }
                    setIsLongPressing(false);
                  }}
                  onMouseUp={() => {
                    // Clear long press timer
                    if (longPressTimer) {
                      clearTimeout(longPressTimer);
                      setLongPressTimer(null);
                    }
                    
                    // If it was a long press, don't process as selection
                    if (isLongPressing) {
                      setIsLongPressing(false);
                      return;
                    }
                    
                    if (!selecting) return;
                    const startIdx = selectionStartIdx ?? idx;
                    const endIdx = selectionEndIdx ?? idx;
                    const lo = Math.min(startIdx, endIdx);
                    const hi = Math.max(startIdx, endIdx);
                    const startSlot = baseGridSlots[lo];
                    const endSlot = baseGridSlots[hi];
                    const startHH = startSlot.split('-')[0];
                    // If single-tile click, default to grid stepMinutes span
                    const defaultMinutes = Math.max(5, timeSlotConfig.stepMinutes || 10);
                    const endHH = (lo === hi) ? addMinutesToHHMM(startHH, defaultMinutes) : endSlot.split('-')[1];
                    const newSpan = `${startHH}-${endHH}`;
                    // Validate overlap
                    const overlaps = filteredSchedule.some(a => doTimeSlotsOverlap(a.slot, newSpan));
                    if (overlaps) {
                      // Fall back to flexible sub-segment booking within this tile if available
                      if (freeStartMin !== null) {
                        const s = minutesToHHMM(freeStartMin);
                        const e = minutesToHHMM(freeStartMin + FLEX_STEP_MIN);
                        setSelecting(false);
                        setSelectionStartIdx(null);
                        setSelectionEndIdx(null);
                        onSelectSlot?.(`${s}-${e}`);
                        return;
                      } else {
                        toast({ variant: 'destructive', title: 'Overlaps existing appointment', description: 'Please select a free time range.' });
                        setSelecting(false);
                        setSelectionStartIdx(null);
                        setSelectionEndIdx(null);
                        return;
                      }
                    }
                    setSelecting(false);
                    setSelectionStartIdx(null);
                    setSelectionEndIdx(null);
                    onSelectSlot?.(newSpan);
                  }}
                >
                  {/* Tile-level overlays removed; appointment-level overlays above handle merged blocks */}
                  {/* hour labels are rendered in the sticky gutter; suppress in occupied start tile */}
                  {(showInlineDetails && hasAny && isPrimaryStartTile) && (
                    <div 
                      className="text-sm font-medium"
                      style={{ color: 'var(--foreground)', position: 'relative', zIndex: 1 }}
                    >
                      {slot}
                    </div>
                  )}

                  {hasAny && primary ? (
                    isPrimaryStartTile ? (
                      <div className="flex flex-col gap-2" style={{ position: 'relative', zIndex: 1, padding: '0.25rem' }}>
                        {showInlineDetails && (
                          <>
                            <div 
                              className="text-xs truncate cursor-pointer font-medium"
                              style={{ color: 'var(--foreground)' }}
                              onClick={() => setSelectedAppointment(primary)}
                            >
                              {formatPatientName(primary.patient ?? { name: 'Unknown' })}
                              {overlappingAppointments.length > 1 && (
                                <span className="ml-2 text-xs opacity-90">(+{overlappingAppointments.length - 1} more)</span>
                              )}
                            </div>
                            <div className="flex flex-col gap-1">
                              <Badge 
                                variant={primary.visitType === 'PROCEDURE' ? 'destructive' : primary.visitType === 'TELEMED' ? 'secondary' : 'default'}
                                className="text-xs w-fit"
                                style={{
                                  backgroundColor: primary.visitType === 'PROCEDURE' 
                                    ? 'var(--calendar-procedure)'
                                    : primary.visitType === 'TELEMED'
                                    ? 'var(--highlight-soft)'
                                    : 'var(--calendar-consultation)',
                                  color: 'var(--foreground)',
                                  border: 'none'
                                }}
                              >
                                {primary.visitType || 'OPD'}
                              </Badge>
                              {primary.room && (
                                <div className="text-xs truncate" style={{ color: 'var(--foreground)' }}>
                                  Room: {primary.room.name}
                                </div>
                              )}
                            </div>
                          </>
                        )}
                        {showInlineActions && (
                          <div className="flex gap-1 mt-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-xs text-foreground hover:bg-muted"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStartVisit(primary);
                              }}
                              disabled={primary.id?.startsWith('optimistic-')}
                            >
                              <FileText className="h-3 w-3 mr-1" />
                              {primary.visit?.id ? 'Continue Visit' : 'Start Visit'}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-xs text-destructive-text hover:bg-destructive-soft hover:text-destructive-text"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCancelAppointment(primary);
                              }}
                              disabled={primary.id?.startsWith('optimistic-')}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-xs text-foreground hover:bg-muted"
                              onClick={(e) => {
                                e.stopPropagation();
                                setRescheduleTarget(primary);
                              }}
                              disabled={primary.id?.startsWith('optimistic-')}
                            >
                              Reschedule
                            </Button>
                          </div>
                        )}
                      </div>
                    ) : null
                  ) : (
                    <div
                      role="button"
                      aria-label={rescheduleTarget ? `Move to ${slot}` : `Book ${slot}`}
                      onClick={async () => {
                        if (selecting) return;
                        if (past) return;
                        if (disableSlotBooking && !rescheduleTarget) {
                          toast({ variant: 'destructive', title: 'Patient required', description: 'Search and select a patient before booking a slot.' });
                          return;
                        }
                        if (rescheduleTarget && rescheduleTarget.id) {
                          const dur = Math.max(1, getSlotDurationMinutes(rescheduleTarget.slot));
                          // Flexible reschedule: try to place within this tile's first free sub-range
                          const targetStartMin = findFirstFreeStart(dur);
                          const newSlot = targetStartMin !== null
                            ? `${minutesToHHMM(targetStartMin)}-${minutesToHHMM(targetStartMin + dur)}`
                            : `${slotStart}-${addMinutesToHHMM(slotStart, dur)}`;
                          setRescheduleLoading(true);
                          try {
                            await apiClient.rescheduleAppointment(rescheduleTarget.id, {
                              date,
                              slot: newSlot,
                              roomId: rescheduleTarget.room?.id,
                            } as any);
                            toast({ variant: 'success', title: 'Appointment rescheduled', description: `${formatPatientName(rescheduleTarget.patient)} moved to ${newSlot}` });
                            setRescheduleTarget(null);
                            await fetchSchedule();
                            onAppointmentUpdate?.();
                          } catch (e) {
                            const msg = getErrorMessage(e);
                            toast({ variant: 'destructive', title: 'Failed to reschedule', description: msg });
                          } finally {
                            setRescheduleLoading(false);
                          }
                          return;
                        }
                        // Flexible booking within tile
                        if (freeStartMin !== null) {
                          const s = minutesToHHMM(freeStartMin);
                          const e = minutesToHHMM(freeStartMin + FLEX_STEP_MIN);
                          onSelectSlot?.(`${s}-${e}`);
                        }
                      }}
                      title={rescheduleTarget
                        ? (() => {
                            const dur = Math.max(1, getSlotDurationMinutes(rescheduleTarget?.slot || '00:00-00:10'));
                            const start = findFirstFreeStart(dur);
                            const s = start !== null ? minutesToHHMM(start) : slotStart;
                            const e = addMinutesToHHMM(s, dur);
                            return `Move to ${s}-${e}`;
                          })()
                        : (() => {
                            if (freeStartMin !== null) {
                              const s = minutesToHHMM(freeStartMin);
                              const e = minutesToHHMM(freeStartMin + FLEX_STEP_MIN);
                              return `Book ${s}-${e}`;
                            }
                            return `Book`;
                          })()
                      }
                      style={{
                        height: '1.75rem',
                        backgroundColor: isBookingInProgress && !past ? 'var(--warning-soft)' : 'var(--card)',
                        cursor: (past || (disableSlotBooking && !rescheduleTarget) || freeStartMin === null) ? 'not-allowed' : 'pointer'
                      }}
                    />
                  )}
                </div>
              );
            })}
              </div>
            </div>
          </div>
          
          {filteredSchedule.length === 0 && schedule.length > 0 && (
            <div className="text-center text-muted-foreground mt-4 p-4">
              No appointments match the current filters.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Appointment Details Dialog */}
      <Dialog open={!!selectedAppointment && !showCancelDialog} onOpenChange={(v: boolean) => { if (!v) setSelectedAppointment(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Appointment Details</DialogTitle>
          </DialogHeader>
          {selectedAppointment && (
            <div className="space-y-3 text-sm">
              <div><span className="text-muted-foreground">Date:</span> {date}</div>
              <div><span className="text-muted-foreground">Slot:</span> {selectedAppointment.slot}</div>
              <div><span className="text-muted-foreground">Patient:</span> {formatPatientName(selectedAppointment.patient)}</div>
              {selectedAppointment.patient?.phone && (
                <div><span className="text-muted-foreground">Phone:</span> {selectedAppointment.patient.phone}</div>
              )}
              {selectedAppointment.patient?.email && (
                <div><span className="text-muted-foreground">Email:</span> {selectedAppointment.patient.email}</div>
              )}
              {selectedAppointment.patient?.age !== undefined && (
                <div><span className="text-muted-foreground">Age:</span> {selectedAppointment.patient.age} years</div>
              )}
              {selectedAppointment.patient?.gender && (
                <div><span className="text-muted-foreground">Sex:</span> {selectedAppointment.patient.gender}</div>
              )}
              {selectedAppointment.isFollowUp && (
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-warning-soft text-warning-text border-warning-border">
                    FOLLOW-UP (Existing Patient)
                  </Badge>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Type:</span>
                <Badge variant={selectedAppointment.visitType === 'PROCEDURE' ? 'destructive' : selectedAppointment.visitType === 'TELEMED' ? 'secondary' : 'default'}>
                  {selectedAppointment.visitType || 'OPD'}
                </Badge>
              </div>
              {selectedAppointment.visitType === 'PROCEDURE' && selectedAppointment.notes && (
                <div><span className="text-muted-foreground">Procedure:</span> {selectedAppointment.notes}</div>
              )}
              {selectedAppointment.room && (
                <div><span className="text-muted-foreground">Room:</span> {selectedAppointment.room.name} ({selectedAppointment.room.type})</div>
              )}
              {selectedAppointment.status && (
                <div><span className="text-muted-foreground">Status:</span> {selectedAppointment.status}</div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedAppointment(null)}>
              Close
            </Button>
            {selectedAppointment && !selectedAppointment.id?.startsWith('optimistic-') && (
              <>
                <Button onClick={() => handleStartVisit(selectedAppointment)}>
                  <FileText className="h-4 w-4 mr-2" />
                  Start Visit
                </Button>
                <Button 
                  variant="destructive" 
                  onClick={() => handleCancelAppointment(selectedAppointment)}
                >
                  <X className="h-4 w-4 mr-2" />
                  Cancel Appointment
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Confirmation Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive-text" />
              Cancel Appointment
            </DialogTitle>
          </DialogHeader>
          {selectedAppointment && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Are you sure you want to cancel this appointment? This action cannot be undone.
              </p>
              <div className="bg-background p-3 rounded-lg space-y-2 text-sm">
                <div><span className="font-medium">Patient:</span> {formatPatientName(selectedAppointment.patient)}</div>
                <div><span className="font-medium">Date:</span> {date}</div>
                <div><span className="font-medium">Time:</span> {selectedAppointment.slot}</div>
                <div><span className="font-medium">Type:</span> {selectedAppointment.visitType}</div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowCancelDialog(false);
                setCancellingAppointment(null);
              }}
            >
              Keep Appointment
            </Button>
            <Button 
              variant="destructive" 
              onClick={confirmCancelAppointment}
              disabled={!cancellingAppointment}
            >
              Yes, Cancel Appointment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
