"use client";

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge, badgeVariants } from '@/components/ui/badge';
import type { VariantProps } from 'class-variance-authority';
import PatientProgressTracker from '@/components/patients/PatientProgressTracker';
import { apiClient } from '@/lib/api';
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
import { layoutDay } from './day-layout';

type StatusStyle = {
  label: string;
  badgeVariant: NonNullable<VariantProps<typeof badgeVariants>['variant']>;
  accentClassName: string;
  muted: boolean;
  strikeName: boolean;
};

const APPOINTMENT_STATUS_STYLE: Record<AppointmentStatus, StatusStyle> = {
  [AppointmentStatus.SCHEDULED]: { label: 'Scheduled', badgeVariant: 'neutral', accentClassName: 'border-l-slate-400', muted: false, strikeName: false },
  [AppointmentStatus.CONFIRMED]: { label: 'Confirmed', badgeVariant: 'info', accentClassName: 'border-l-sky-500', muted: false, strikeName: false },
  [AppointmentStatus.CHECKED_IN]: { label: 'Checked in', badgeVariant: 'warning', accentClassName: 'border-l-amber-500', muted: false, strikeName: false },
  [AppointmentStatus.IN_PROGRESS]: { label: 'In progress', badgeVariant: 'success', accentClassName: 'border-l-emerald-500', muted: false, strikeName: false },
  [AppointmentStatus.COMPLETED]: { label: 'Completed', badgeVariant: 'neutral', accentClassName: 'border-l-slate-300', muted: true, strikeName: false },
  [AppointmentStatus.NO_SHOW]: { label: 'No-show', badgeVariant: 'danger', accentClassName: 'border-l-red-500', muted: true, strikeName: true },
  [AppointmentStatus.CANCELLED]: { label: 'Cancelled', badgeVariant: 'danger', accentClassName: 'border-l-red-300', muted: true, strikeName: true },
};

const VISIT_TYPE_BACKGROUND: Record<string, { current: string; past: string }> = {
  OPD: { current: 'rgba(219, 234, 254, 0.95)', past: 'rgba(239, 246, 255, 0.95)' },
  PROCEDURE: { current: 'rgba(237, 233, 254, 0.95)', past: 'rgba(245, 237, 254, 0.95)' },
  TELEMED: { current: 'rgba(243, 244, 246, 0.95)', past: 'rgba(249, 250, 251, 0.95)' },
};

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
 * @cc [owner:nareshshah139,label:product] appointment-details-access
 * Appointment facts MUST remain inline on calendar cards; hovering MUST NOT open a details preview.
 * Saved appointments MUST expose their full details and actions through the INFO control.
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
  // Tile height so the entire day grid fits in ~80% of the viewport
  const tileHeightCss = useMemo(() => `calc(80vh / ${Math.max(1, baseGridSlots.length)})`, [baseGridSlots.length]);
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

  /**
   * @cc [owner:nareshshah139,label:product] show-outside-hours-appointments
   * The timeline MUST include valid appointments outside configured working hours without
   * creating additional bookable slots or shifting the time gutter out of alignment.
   */
  const timelineBounds = useMemo(() => {
    const workingStart = (timeSlotConfig.startHour ?? 9) * 60;
    const workingEnd = (timeSlotConfig.endHour ?? 18) * 60;
    let start = workingStart;
    let end = workingEnd;
    for (const apt of filteredSchedule) {
      const match = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/.exec(apt.slot || '');
      if (!match) continue;
      const [, sh, sm, eh, em] = match.map(Number);
      if (sh > 23 || sm > 59 || eh > 24 || em > 59 || (eh === 24 && em !== 0)) continue;
      const from = sh * 60 + sm;
      const to = eh * 60 + em;
      if (to <= from) continue;
      start = Math.min(start, from);
      end = Math.max(end, to);
    }
    return { start, end, workingStart, workingEnd };
  }, [filteredSchedule, timeSlotConfig.startHour, timeSlotConfig.endHour]);
  const slotMinutes = Math.max(5, timeSlotConfig.stepMinutes || 10);
  const topPadding = `${80 * (timelineBounds.workingStart - timelineBounds.start) / slotMinutes / Math.max(1, baseGridSlots.length)}vh`;
  const bottomPadding = `${80 * (timelineBounds.end - timelineBounds.workingEnd) / slotMinutes / Math.max(1, baseGridSlots.length)}vh`;

  const appointmentBlocks = useMemo(() => {
    const dayStartMin = timelineBounds.start;
    const dayEndMin = timelineBounds.end;
    const totalDayMin = Math.max(1, dayEndMin - dayStartMin);
    const spans = filteredSchedule.flatMap((apt, index) => {
      const [start, end] = (apt.slot || '').split('-');
      if (!start || !end) return [];
      const startMin = Math.max(dayStartMin, Math.min(hhmmToMinutes(start), dayEndMin));
      const endMin = Math.max(dayStartMin, Math.min(hhmmToMinutes(end), dayEndMin));
      if (endMin <= startMin) return [];
      return [{ apt, key: apt.id || `${apt.slot}#${index}`, start, end, startMin, endMin }];
    });
    const lanes = layoutDay(spans.map(({ key, startMin, endMin }) => ({ id: key, startMin, endMin })));
    return spans.map((span) => ({
      ...span,
      ...lanes.get(span.key)!,
      topPct: ((span.startMin - dayStartMin) * 100) / totalDayMin,
      heightPct: ((span.endMin - span.startMin) * 100) / totalDayMin,
    }));
  }, [filteredSchedule, timelineBounds]);
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
              tokenNumber: a.tokenNumber ?? undefined,
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

  const blockBackground = (apt: AppointmentInSlot) => {
    if (apt.status === AppointmentStatus.COMPLETED) return 'rgba(226, 232, 240, 0.95)';
    const tone = VISIT_TYPE_BACKGROUND[apt.visitType] ?? VISIT_TYPE_BACKGROUND.OPD;
    return isSlotInPast(apt.slot, date) ? tone.past : tone.current;
  };

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
        <CardContent className="p-8 text-center">
          <div className="text-gray-500">Loading schedule...</div>
        </CardContent>
      </Card>
    );
  }

  if (error && schedule.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="text-red-600 mb-4">Failed to load schedule</div>
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
            <div className="mb-4 p-3 bg-blue-50 rounded-lg">
              <div className="text-sm text-blue-700">
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
              <div className="mb-3 flex items-start justify-between rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                <div>
                  <div className="font-medium text-amber-800">Rescheduling {formatPatientName(rescheduleTarget.patient)}</div>
                  <div className="text-amber-700">Click a free time to move this appointment to {date}.</div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setRescheduleTarget(null)} disabled={rescheduleLoading}>
                  Cancel
                </Button>
              </div>
            )}
            {showLoadingOverlay && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/70 backdrop-blur-sm transition-opacity duration-200">
                <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
                <span className="mt-2 text-sm font-medium text-blue-700">Refreshing schedule…</span>
              </div>
            )}
            <div className="flex">
              {/* Sticky left gutter with hour labels */}
              <div className="w-14 sticky left-0 top-0 self-start z-10 bg-white/80 backdrop-blur-sm" style={{ paddingTop: topPadding, paddingBottom: bottomPadding }}>
                {baseGridSlots.map((slot) => {
                  const slotStart = slot.split('-')[0];
                  const isHourStart = slotStart.endsWith(':00');
                  return (
                    <div key={`gutter-${slot}`} style={{ height: tileHeightCss }} className="flex items-start justify-end pr-1">
                      {isHourStart && (
                        <span className="text-[10px] leading-none text-gray-400">{slotStart}</span>
                      )}
                    </div>
                  );
                })}
              </div>
              {/* Main calendar grid */}
              <div
                className="flex-1 grid grid-cols-1 gap-0"
                style={{ position: 'relative', paddingTop: topPadding, paddingBottom: bottomPadding, gridAutoRows: tileHeightCss, ...(showLoadingOverlay ? { pointerEvents: 'none', opacity: 0.6 } : {}) }}
              >
            {appointmentBlocks.map(({ apt, key, start, end, topPct, heightPct, lane, laneCount }) => {
              const status = APPOINTMENT_STATUS_STYLE[apt.status] ?? APPOINTMENT_STATUS_STYLE[AppointmentStatus.SCHEDULED];
              const patientName = formatPatientName(apt.patient ?? { name: 'Unknown' });
              const isOptimistic = apt.id?.startsWith('optimistic-');
              const accessibleName = [
                apt.tokenNumber != null ? `Token ${apt.tokenNumber}` : null,
                patientName,
                `${start}-${end}`,
                status.label,
              ].filter(Boolean).join(', ');
              return (
                <div
                  key={key}
                  data-appointment-block={apt.id || apt.slot}
                  className="@container group absolute p-px"
                  style={{
                    top: `${topPct}%`,
                    height: `${heightPct}%`,
                    left: `${(lane * 100) / laneCount}%`,
                    width: `${100 / laneCount}%`,
                    zIndex: 2,
                  }}
                >
                  <button
                    type="button"
                    aria-label={accessibleName}
                    title={accessibleName}
                    onClick={() => setSelectedAppointment(apt)}
                    disabled={isOptimistic}
                    className={`@container flex h-full w-full items-start overflow-hidden rounded-md border-l-[3px] px-1.5 py-0.5 text-left leading-tight shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${status.accentClassName} ${apt.slot === recentBookedSlot ? 'ring-2 ring-green-500/60' : ''}`}
                    style={{
                      backgroundColor: blockBackground(apt),
                      fontSize: 'calc(0.75rem + var(--app-text-increase, 0rem))',
                    }}
                  >
                    <span className={`flex w-full min-w-0 items-center gap-1.5 whitespace-nowrap ${status.muted ? 'text-gray-500' : 'text-gray-900'}`}>
                      {apt.tokenNumber != null && (
                        <span className="shrink-0 font-semibold text-gray-500">#{apt.tokenNumber}</span>
                      )}
                      <span data-appointment-time className="hidden shrink-0 font-bold text-blue-700 @min-[14rem]:inline">{`${start}-${end}`}</span>
                      <span
                        data-patient-name
                        className={`min-w-0 flex-auto truncate font-semibold ${status.strikeName ? 'line-through' : ''}`}
                      >
                        {patientName}
                      </span>
                      <span className="hidden min-w-0 shrink-[100] items-center gap-1.5 overflow-hidden @min-[24rem]:flex">
                        {apt.visitType === 'PROCEDURE' && apt.notes && (
                          <span className="truncate font-medium text-purple-700">({apt.notes})</span>
                        )}
                        {apt.isFollowUp && <span className="font-semibold text-amber-600">FOLLOW-UP</span>}
                        <span className="font-medium text-purple-600">{apt.visitType || 'OPD'}</span>
                        {apt.patient?.age !== undefined && <span className="text-gray-600">{apt.patient.age}y</span>}
                        {apt.patient?.gender && <span className="rounded bg-gray-100 px-1 text-gray-600">{apt.patient.gender.charAt(0).toUpperCase()}</span>}
                        {apt.room?.name && <span className="truncate font-medium text-green-600">{apt.room.name}</span>}
                      </span>
                      <Badge variant={status.badgeVariant} className="hidden shrink-0 whitespace-nowrap px-1.5 py-0 text-[10px] leading-4 @min-[9rem]:inline-flex">
                        {status.label}
                      </Badge>
                    </span>
                  </button>

                  <div data-appointment-actions className="pointer-events-none absolute right-1 top-0.5 hidden gap-1 opacity-0 transition-opacity duration-200 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 @min-[16rem]:flex">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedAppointment(apt);
                      }}
                      className="bg-gray-500 hover:bg-gray-600 text-white text-xs px-2 py-1 rounded shadow-sm transition-colors font-medium"
                      title="View Appointment Details"
                      disabled={isOptimistic}
                    >
                      INFO
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRescheduleTarget(apt);
                      }}
                      className="bg-amber-500 hover:bg-amber-600 text-white text-xs px-2 py-1 rounded shadow-sm transition-colors font-medium"
                      title="Reschedule Appointment"
                      disabled={isOptimistic}
                    >
                      RESCHED
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartVisit(apt);
                      }}
                      className="bg-blue-500 hover:bg-blue-600 text-white text-xs px-2 py-1 rounded shadow-sm transition-colors font-medium"
                      title={apt.visit?.id ? 'Continue Visit' : 'Start Visit'}
                      disabled={isOptimistic}
                    >
                      {apt.visit?.id ? 'CONT' : 'START'}
                    </button>
                  </div>
                </div>
              );
            })}
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
              // Compute base border color once; avoid shorthand borderColor conflicts with per-side overrides
              const baseBorderColor = isBookingInProgress ? '#f59e0b' : (past ? '#d1d5db' : '#e5e7eb');

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
                      if (isBookingInProgress) return '#fbbf24';
                      return past ? '#f3f4f6' : (inSelectionPreview ? '#fef3c7' : 'white');
                    })(),
                    // Per-side border colors to avoid shorthand conflicts
                    borderTopColor: hasAny && crossesTop ? 'transparent' : baseBorderColor,
                    borderBottomColor: hasAny && crossesBottom ? 'transparent' : baseBorderColor,
                    borderLeftColor: baseBorderColor,
                    borderRightColor: baseBorderColor,
                    opacity: past && !hasAny ? 0.6 : 1,
                    boxShadow: (() => {
                      const parts: string[] = [];
                      if (isNewlyBooked) parts.push('0 0 0 2px rgba(34, 197, 94, 0.3)');
                      else if (isBookingInProgress) parts.push('0 0 0 2px rgba(251, 191, 36, 0.3)');
                      if (showNowLine) parts.push('inset 0 2px 0 #ef4444');
                      else if (isHourStart && !(hasAny && crossesTop)) parts.push('inset 0 1px 0 #e5e7eb');
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
                  {hasAny ? null : (
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
                        backgroundColor: past ? '#ffffff' : (isBookingInProgress ? '#fbbf24' : '#ffffff'),
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
            <div className="text-center text-gray-500 mt-4 p-4">
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
              <div><span className="text-gray-600">Date:</span> {date}</div>
              <div><span className="text-gray-600">Slot:</span> {selectedAppointment.slot}</div>
              <div><span className="text-gray-600">Patient:</span> {formatPatientName(selectedAppointment.patient)}</div>
              {selectedAppointment.patient?.phone && (
                <div><span className="text-gray-600">Phone:</span> {selectedAppointment.patient.phone}</div>
              )}
              {selectedAppointment.patient?.email && (
                <div><span className="text-gray-600">Email:</span> {selectedAppointment.patient.email}</div>
              )}
              {selectedAppointment.patient?.age !== undefined && (
                <div><span className="text-gray-600">Age:</span> {selectedAppointment.patient.age} years</div>
              )}
              {selectedAppointment.patient?.gender && (
                <div><span className="text-gray-600">Sex:</span> {selectedAppointment.patient.gender}</div>
              )}
              {selectedAppointment.isFollowUp && (
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                    FOLLOW-UP (Existing Patient)
                  </Badge>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-gray-600">Type:</span>
                <Badge variant={selectedAppointment.visitType === 'PROCEDURE' ? 'destructive' : selectedAppointment.visitType === 'TELEMED' ? 'secondary' : 'default'}>
                  {selectedAppointment.visitType || 'OPD'}
                </Badge>
              </div>
              {selectedAppointment.visitType === 'PROCEDURE' && selectedAppointment.notes && (
                <div><span className="text-gray-600">Procedure:</span> {selectedAppointment.notes}</div>
              )}
              {selectedAppointment.room && (
                <div><span className="text-gray-600">Room:</span> {selectedAppointment.room.name} ({selectedAppointment.room.type})</div>
              )}
              {selectedAppointment.status && (
                <div><span className="text-gray-600">Status:</span> {selectedAppointment.status}</div>
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
                  variant="outline"
                  onClick={() => {
                    setRescheduleTarget(selectedAppointment);
                    setSelectedAppointment(null);
                  }}
                >
                  Reschedule
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
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Cancel Appointment
            </DialogTitle>
          </DialogHeader>
          {selectedAppointment && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Are you sure you want to cancel this appointment? This action cannot be undone.
              </p>
              <div className="bg-gray-50 p-3 rounded-lg space-y-2 text-sm">
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
