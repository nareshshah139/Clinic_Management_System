"use client";

import { displayCalendarDate } from '@/lib/date-display';
import { Spinner } from '@/components/ui/spinner';
import { LoadingSkeleton } from '@/components/ui/skeleton';
import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
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
 * @cc [owner:nareshshah139,label:product] non-overlapping-calendar-lanes
 * Appointments that overlap in time MUST occupy disjoint horizontal lanes.
 * Every connected overlap group MUST use one lane width; touching endpoints may reuse a lane.
 */
function getAppointmentLanes(appointments: AppointmentInSlot[]) {
  const intervals = appointments.map(appointment => {
    const [start, end] = appointment.slot.split('-').map(hhmmToMinutes);
    return { appointment, start, end };
  }).filter(interval => Number.isFinite(interval.start) && Number.isFinite(interval.end) && interval.end > interval.start)
    .sort((a, b) => a.start - b.start || a.end - b.end || String(a.appointment.id).localeCompare(String(b.appointment.id)));
  const groups: typeof intervals[] = [];
  let groupEnd = -Infinity;
  for (const interval of intervals) {
    if (interval.start >= groupEnd) groups.push([]);
    groups[groups.length - 1].push(interval);
    groupEnd = Math.max(groupEnd, interval.end);
  }
  const lanes = new Map<AppointmentInSlot, { left: number; width: number }>();
  for (const group of groups) {
    const ends: number[] = [];
    const assignments = group.map(interval => {
      const available = ends.findIndex(end => end <= interval.start);
      const column = available < 0 ? ends.length : available;
      ends[column] = interval.end;
      return { appointment: interval.appointment, column };
    });
    const width = 100 / ends.length;
    assignments.forEach(({ appointment, column }) => lanes.set(appointment, { left: column * width, width }));
  }
  return lanes;
}

/**
 * @cc [owner:nareshshah139,label:accessibility] appointment-text-containment
 * Appointment text and actions MUST fit inside their time span when labels wrap.
 * Resizing or text scaling MUST preserve a uniform time scale and aligned hour labels.
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
  const calendarGrid = useRef<HTMLDivElement>(null);
  const [pixelsPerMinute, setPixelsPerMinute] = useState(0);
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
  const tileHeightCss = `max(calc(80vh / ${Math.max(1, baseGridSlots.length)}), ${pixelsPerMinute * Math.max(5, timeSlotConfig.stepMinutes || 10)}px)`;
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

  const appointmentLanes = useMemo(() => getAppointmentLanes(filteredSchedule), [filteredSchedule]);

  useEffect(() => {
    const grid = calendarGrid.current;
    if (!grid || typeof ResizeObserver === 'undefined') return;
    const content = [...grid.querySelectorAll<HTMLElement>('[data-appointment-content]')];
    const measure = () => {
      const required = content.reduce((scale, element) => {
        const minutes = Number(element.dataset.durationMinutes);
        return minutes > 0 ? Math.max(scale, (element.scrollHeight + 4) / minutes) : scale;
      }, 0);
      setPixelsPerMinute(current => Math.abs(current - required) < 0.05 ? current : required);
    };
    const observer = new ResizeObserver(measure);
    content.forEach(element => observer.observe(element));
    measure();
    return () => observer.disconnect();
  }, [filteredSchedule, loading, timeSlotConfig.startHour, timeSlotConfig.endHour]);

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
                  <div className="text-warning-text">Click a free time to move this appointment to {displayCalendarDate(date)}.</div>
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
            <div className="flex max-h-[80vh] overflow-y-auto">
              {/* Sticky left gutter with hour labels */}
              <div className="w-14 shrink-0 sticky left-0 self-start z-10 bg-card/80 backdrop-blur-sm">
                {baseGridSlots.map((slot) => {
                  const slotStart = slot.split('-')[0];
                  const isHourStart = slotStart.endsWith(':00');
                  return (
                    <div key={`gutter-${slot}`} style={{ height: tileHeightCss }} className="flex items-start justify-end pr-1">
                      {isHourStart && (
                        <span className="text-xs leading-none text-muted-foreground">{slotStart}</span>
                      )}
                    </div>
                  );
                })}
              </div>
              {/* Main calendar grid */}
              <div
                ref={calendarGrid}
                className="min-w-0 h-max flex-1 grid grid-cols-1 gap-0"
                style={{ position: 'relative', ...(showLoadingOverlay ? { pointerEvents: 'none', opacity: 0.6 } : {}) }}
              >
            {/* Appointment-level background overlays across full spans (merges cells visually) */}
            {(() => {
              const dayStartMin = (timeSlotConfig.startHour ?? 9) * 60;
              const dayEndMin = (timeSlotConfig.endHour ?? 18) * 60;
              const totalDayMin = Math.max(1, dayEndMin - dayStartMin);
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
                const topPct = ((clampedStart - dayStartMin) * 100) / totalDayMin;
                const heightPct = ((clampedEnd - clampedStart) * 100) / totalDayMin;
                const lane = appointmentLanes.get(apt);
                if (!lane) return null;
                const bg = getColor(apt);
                return (
                  <div
                    key={`span-bg-${apt.id || apt.slot}`}
                    className="absolute"
                    style={{
                      top: `${topPct}%`,
                      height: `${heightPct}%`,
                      left: `${lane.left}%`,
                      width: `${lane.width}%`,
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
              const dayStartMin = (timeSlotConfig.startHour ?? 9) * 60;
              const dayEndMin = (timeSlotConfig.endHour ?? 18) * 60;
              const totalDayMin = Math.max(1, dayEndMin - dayStartMin);
              return filteredSchedule.map((apt) => {
                const [as, ae] = (apt.slot || '').split('-');
                if (!as || !ae) return null;
                const aptStart = hhmmToMinutes(as);
                const aptEnd = hhmmToMinutes(ae);
                const clampedStart = Math.max(dayStartMin, Math.min(aptStart, dayEndMin));
                const clampedEnd = Math.max(dayStartMin, Math.min(aptEnd, dayEndMin));
                if (clampedEnd <= clampedStart) return null;
                const topPct = ((clampedStart - dayStartMin) * 100) / totalDayMin;
                const heightPct = ((clampedEnd - clampedStart) * 100) / totalDayMin;
                const lane = appointmentLanes.get(apt);
                if (!lane) return null;
                return (
                  <div
                    key={`span-label-${apt.id || apt.slot}`}
                    className="absolute min-w-0 group"
                    data-appointment-id={apt.id}
                    style={{
                      top: `${topPct}%`,
                      left: `${lane.left}%`,
                      width: `${lane.width}%`,
                      height: `${heightPct}%`,
                      pointerEvents: 'auto',
                      color: apt.status === AppointmentStatus.COMPLETED ? 'var(--foreground)' : apt.visitType === 'PROCEDURE' ? 'var(--calendar-procedure-foreground)' : apt.visitType === 'TELEMED' ? 'var(--highlight-text)' : 'var(--calendar-consultation-foreground)',
                      zIndex: 2,
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'center',
                    }}
                  >
                    <div data-appointment-content data-duration-minutes={clampedEnd - clampedStart} style={{ color: '#000000' }} className="w-full min-w-0 space-y-1 p-2 [overflow-wrap:anywhere]">
                      <div className="flex min-w-0 flex-wrap items-start gap-x-2 gap-y-1 text-sm font-semibold">
                        <span className="text-info-text font-bold">{`${as}-${ae}`}</span>
                        <span className="min-w-0 basis-full sm:basis-0 flex-1">
                          {formatPatientName(apt.patient ?? { name: 'Unknown' })}
                          {apt.visitType === 'PROCEDURE' && apt.notes && (
                            <span className="text-highlight-text font-medium ml-1">({apt.notes})</span>
                          )}
                        </span>
                      </div>
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                        {apt.isFollowUp && <span className="text-warning-text font-semibold">FOLLOW-UP</span>}
                        <span className="text-highlight-text font-medium">{apt.visitType || 'OPD'}</span>
                        {apt.patient?.age !== undefined && <span className="text-muted-foreground">{apt.patient.age}y</span>}
                        {apt.patient?.gender && <span className="text-muted-foreground bg-muted px-1 rounded-md">{apt.patient.gender.charAt(0).toUpperCase()}</span>}
                        {apt.room?.name && <span className="text-success-text font-medium">{apt.room.name}</span>}
                      </div>
                      <div className="flex min-w-0 flex-wrap gap-1 opacity-100 transition-opacity duration-200 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
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
              <div><span className="text-muted-foreground">Date:</span> {displayCalendarDate(date)}</div>
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
                <div><span className="font-medium">Date:</span> {displayCalendarDate(date)}</div>
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