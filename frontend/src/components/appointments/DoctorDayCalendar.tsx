"use client";

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { apiClient } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { X, FileText, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  generateTimeSlots,
  getErrorMessage,
  formatPatientName,
  getISTDateString,
  getSlotDurationMinutes,
  calculateAge,
  isConflictError,
} from '@/lib/utils';
import type {
  AppointmentInSlot,
  AppointmentCalendar,
  ClinicBillAccess,
  TimeSlotConfig,
  GetDoctorScheduleResponse,
} from '@/lib/types';
import { AppointmentStatus } from '@cms/shared-types';
import { useOverbookConfirm } from './useOverbookConfirm';
import { overbookFlag } from '@/lib/overbooking';
import { displayCalendarDate } from '@/lib/date-display';
import { CALENDARS, CALENDAR_ORDER, STATUS_LABEL, canMove, visitTypeLabel, type SlotChoice } from './appointment-calendars';
import { visitActionFor } from '@/lib/appointment-access';
import CalendarColumn, { type SlotAction } from './CalendarColumn';
import { AppointmentBillDialog } from './AppointmentBillDialog';
import { BILL_TYPE_LABEL, billingChip } from './appointment-billing-view';

const NO_BILL_ACCESS: ClinicBillAccess = { read: false, createBill: false, takePayment: false, editFees: false };

/**
 * @cc [owner:nareshshah139,label:product] optimistic-booking-origin
 * Doctor and date identify the selection for which the optimistic appointment was submitted.
 */
export type ScopedAppointment = { doctorId: string; date: string; appointment: AppointmentInSlot };

export interface DoctorDayCalendarProps {
  doctorId: string;
  date: string; // YYYY-MM-DD
  recentBookedSlot?: string;
  visitTypeFilter?: string;
  roomFilter?: string;
  onSelectSlot?: (slot: string, calendar: AppointmentCalendar) => void;
  refreshKey?: number;
  bookingInProgress?: SlotChoice;
  optimisticAppointment?: ScopedAppointment;
  onAppointmentUpdate?: () => void;
  timeSlotConfig?: TimeSlotConfig;
  disableSlotBooking?: boolean;
  /** The viewer's role, which decides the visit action a row and the details dialog offer. */
  role?: string;
  selectedRoomName?: string;
  /** Patients the doctor may see in one slot of one calendar. 1 (the default) keeps every occupied tile closed. */
  maxBookingsPerSlot?: number;
}

/**
 * Reschedule mode. `from` is the day the appointment is on. `refused` is set when a confirm or
 * move back found its time taken, and limits the move to that calendar.
 */
type Move = { appointment: AppointmentInSlot; from: string; refused?: SlotChoice };
type MoveState = { move: Move | null; setMove: (move: Move | null) => void };

/**
 * @cc [owner:nareshshah139,label:product] schedule-selection-isolation
 * Changing the doctor or date resets the calendar and its dialogs; a failed or superseded request cannot display appointments from another selection.
 */
/**
 * @cc [owner:nareshshah139,label:product] reschedule-across-days
 * A reschedule in progress MUST survive a date change, so the appointment can move to a free time
 * on another day. It ends when the doctor changes, because a reschedule keeps the doctor.
 */
export default function DoctorDayCalendar(props: DoctorDayCalendarProps) {
  return <DoctorDayCalendarForDoctor key={props.doctorId} {...props} />;
}

function DoctorDayCalendarForDoctor(props: DoctorDayCalendarProps) {
  const [move, setMove] = useState<Move | null>(null);
  return <DoctorDayCalendarForSelection key={props.date} {...props} move={move} setMove={setMove} />;
}

function moveHint(move: Move, date: string): string {
  const where = move.refused ? `the ${CALENDARS[move.refused.calendar].title} calendar` : 'either calendar';
  if (move.from !== date) {
    return `Click a free time in ${where} to move this appointment from ${displayCalendarDate(move.from)} to ${displayCalendarDate(date)}.`;
  }
  return move.refused
    ? `${move.refused.slot} is taken in ${CALENDARS[move.refused.calendar].title}. Click a free time in ${where}, or change the date to pick another day.`
    : `Click a free time in ${where}. To move to another day, change the date first.`;
}

/**
 * @cc [owner:nareshshah139,label:product] optimistic-overlap
 * An optimistic appointment does not hide another appointment solely because they share a time slot.
 */
/**
 * @cc [owner:nareshshah139,label:product] scheduled-and-confirmed-calendars
 * The day shows the Scheduled and Confirmed calendars side by side over one time gutter. Each
 * appointment appears only in the column its `calendar` field names, and a free time books or
 * moves into that column's calendar, counting only that column's appointments.
 */
/**
 * @cc [owner:nareshshah139,label:product] confirm-keeps-time
 * Confirm and Move to Scheduled keep the appointment's date and slot. When that time is taken in
 * the target calendar and not overbooked, the user lands in reschedule mode limited to that calendar.
 */
function DoctorDayCalendarForSelection({
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
  role,
  selectedRoomName,
  maxBookingsPerSlot = 1,
  move,
  setMove,
}: DoctorDayCalendarProps & MoveState) {
  const router = useRouter();
  const { toast } = useToast();
  const { sendWithOverbookConfirm, overbookDialog } = useOverbookConfirm();
  const [schedule, setSchedule] = useState<AppointmentInSlot[]>([]);
  const [loading, setLoading] = useState<boolean>(Boolean(doctorId && date));
  const [error, setError] = useState<string | null>(null);
  const scheduleRequest = useRef(0);
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentInSlot | null>(null);
  const [cancellingAppointment, setCancellingAppointment] = useState<string | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState<boolean>(false);
  const [placing, setPlacing] = useState<boolean>(false);
  const [billAccess, setBillAccess] = useState<ClinicBillAccess>(NO_BILL_ACCESS);
  const [billForId, setBillForId] = useState<string | null>(null);
  const billFor = billForId ? schedule.find((a) => a.id === billForId) ?? null : null;

  const slotMinutes = Math.max(5, timeSlotConfig.stepMinutes || 10);
  const baseGridSlots = useMemo(() => generateTimeSlots({
    startHour: timeSlotConfig.startHour,
    endHour: timeSlotConfig.endHour,
    stepMinutes: slotMinutes,
    timezone: timeSlotConfig.timezone,
  }), [timeSlotConfig.startHour, timeSlotConfig.endHour, slotMinutes, timeSlotConfig.timezone]);
  // Tile height so the entire day grid fits in ~80% of the viewport
  const tileHeightCss = `calc(80vh / ${Math.max(1, baseGridSlots.length)})`;
  const roomFilterLabel = roomFilter !== 'ALL' ? (selectedRoomName ?? 'Unknown Room') : undefined;

  const isToday = date === getISTDateString();
  const scopedOptimisticAppointment = optimisticAppointment?.doctorId === doctorId && optimisticAppointment.date === date
    ? optimisticAppointment.appointment
    : undefined;
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

  const filteredSchedule = useMemo(() => {
    let appointments = schedule.filter(a => a.status !== AppointmentStatus.CANCELLED);

    if (scopedOptimisticAppointment) {
      const visitTypeMatch = visitTypeFilter === 'ALL' || scopedOptimisticAppointment.visitType === visitTypeFilter;
      const roomMatch = roomFilter === 'ALL' || scopedOptimisticAppointment.room?.id === roomFilter;

      if (visitTypeMatch && roomMatch) {
        appointments = appointments.filter(apt => apt.id !== scopedOptimisticAppointment.id);
        appointments.push(scopedOptimisticAppointment);
      }
    }

    return appointments.filter(apt => {
      const visitTypeMatch = visitTypeFilter === 'ALL' || apt.visitType === visitTypeFilter;
      const roomMatch = roomFilter === 'ALL' || apt.room?.id === roomFilter;
      return visitTypeMatch && roomMatch;
    });
  }, [schedule, visitTypeFilter, roomFilter, scopedOptimisticAppointment]);

  const columns = useMemo(
    () => CALENDAR_ORDER.map(calendar => ({ calendar, appointments: filteredSchedule.filter(a => a.calendar === calendar) })),
    [filteredSchedule],
  );

  /**
   * @cc [owner:nareshshah139,label:product] show-outside-hours-appointments
   * The timeline MUST include valid appointments outside configured working hours without
   * creating additional bookable slots or shifting the time gutter out of alignment.
   */
  const timeline = useMemo(() => {
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
    const vh = (minutes: number) => `${80 * minutes / slotMinutes / Math.max(1, baseGridSlots.length)}vh`;
    return { start, end, topPadding: vh(workingStart - start), bottomPadding: vh(end - workingEnd) };
  }, [filteredSchedule, timeSlotConfig.startHour, timeSlotConfig.endHour, slotMinutes, baseGridSlots.length]);

  const showLoadingOverlay = loading && (schedule.length > 0 || !!scopedOptimisticAppointment);

  const fetchSchedule = useCallback(async () => {
    const request = ++scheduleRequest.current;
    if (!doctorId || !date) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const res: GetDoctorScheduleResponse = await apiClient.getDoctorSchedule(doctorId, date);
      const sourceAppointments = Array.isArray(res?.appointments) ? res.appointments : [];
      const items: AppointmentInSlot[] = sourceAppointments
        .filter((a) => (a.status as AppointmentStatus) !== AppointmentStatus.CANCELLED)
        .map((a) => ({
          slot: a.slot,
          patient: a.patient ? {
            id: a.patient.id,
            name: formatPatientName(a.patient),
            phone: a.patient.phone,
            email: a.patient.email ?? undefined,
            gender: a.patient.gender ?? undefined,
            dob: a.patient.dob ?? undefined,
            age: a.patient.age ?? (a.patient.dob ? calculateAge(a.patient.dob) ?? undefined : undefined),
          } : { id: '', name: 'Unknown Patient' },
          doctor: a.doctor || { firstName: 'Dr.', lastName: 'Unknown' },
          visitType: a.visitType || 'OPD',
          room: a.room,
          id: a.id,
          status: (a.status as AppointmentStatus) || AppointmentStatus.SCHEDULED,
          calendar: a.calendar,
          visit: a.visit ? { id: a.visit.id, status: a.visit.status ?? undefined } : undefined,
          billType: a.billType,
          billing: a.billing,
          fee: a.fee,
          notes: a.notes ?? undefined,
          tokenNumber: a.tokenNumber ?? undefined,
        }));

      if (request === scheduleRequest.current) setBillAccess(res?.billingAccess ?? NO_BILL_ACCESS);
      if (request === scheduleRequest.current) setSchedule(items);
    } catch (e) {
      if (request !== scheduleRequest.current) return;
      const errorMessage = getErrorMessage(e);
      setSchedule([]);
      setError(errorMessage);
      toast({
        variant: "destructive",
        title: "Failed to load schedule",
        description: errorMessage,
      });
    } finally {
      if (request === scheduleRequest.current) setLoading(false);
    }
  }, [doctorId, date, toast]);

  useEffect(() => {
    void fetchSchedule();
    return () => { scheduleRequest.current += 1; };
  }, [fetchSchedule, refreshKey]);

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

      await fetchSchedule();
      onAppointmentUpdate?.();

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

  const place = async (appointment: AppointmentInSlot, from: string, target: SlotChoice): Promise<'placed' | 'declined'> => {
    const moved = await sendWithOverbookConfirm((allowOverbook) => apiClient.rescheduleAppointment(appointment.id, {
      date,
      slot: target.slot,
      roomId: appointment.room?.id,
      calendar: target.calendar,
      ...overbookFlag(allowOverbook),
    }));
    if (!moved) return 'declined';
    toast({
      variant: 'success',
      title: target.calendar === appointment.calendar ? 'Appointment rescheduled' : CALENDARS[target.calendar].arrivedTitle,
      description: `${formatPatientName(appointment.patient)} is now ${from === date ? '' : `on ${displayCalendarDate(date)} `}at ${target.slot} in ${CALENDARS[target.calendar].title}.`,
    });
    await fetchSchedule();
    onAppointmentUpdate?.();
    return 'placed';
  };

  const moveAtSameTime = async (appointment: AppointmentInSlot, calendar: AppointmentCalendar) => {
    if (placing) return;
    const target = { slot: appointment.slot, calendar };
    setPlacing(true);
    try {
      const outcome = await place(appointment, date, target);
      setSelectedAppointment(null);
      if (outcome === 'declined') setMove({ appointment, from: date, refused: target });
    } catch (e) {
      if (isConflictError(e)) {
        setSelectedAppointment(null);
        setMove({ appointment, from: date, refused: target });
      } else {
        toast({ variant: 'destructive', title: `Could not move ${formatPatientName(appointment.patient)}`, description: getErrorMessage(e) });
      }
    } finally {
      setPlacing(false);
    }
  };

  const moveInto = async (target: SlotChoice) => {
    if (!move || placing) return;
    setPlacing(true);
    try {
      if (await place(move.appointment, move.from, target) === 'placed') setMove(null);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Failed to reschedule', description: getErrorMessage(e) });
    } finally {
      setPlacing(false);
    }
  };

  const slotActionFor = (calendar: AppointmentCalendar): SlotAction => {
    if (!move) return { kind: 'book', patientMissing: disableSlotBooking };
    if (move.refused && move.refused.calendar !== calendar) return { kind: 'none' };
    return { kind: 'move', minutes: Math.max(1, getSlotDurationMinutes(move.appointment.slot)) };
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

  const selectedMove = selectedAppointment ? CALENDARS[selectedAppointment.calendar].move : null;
  const offersMove = !!selectedAppointment && selectedAppointment.status === selectedMove?.offeredWhile;
  const visitAction = selectedAppointment ? visitActionFor(role, selectedAppointment) : null;

  return (
    <>
      <Card className="gap-0 py-0">
        <CardContent className="p-3 sm:p-4">
          {(visitTypeFilter !== 'ALL' || roomFilter !== 'ALL') && (
            <div className="mb-4 p-3 bg-blue-50 rounded-lg">
              <div className="text-sm text-blue-700">
                <span className="font-medium">Filters Active:</span>
                {visitTypeFilter !== 'ALL' && <Badge variant="secondary" className="ml-2">{visitTypeLabel(visitTypeFilter)}</Badge>}
                {roomFilterLabel && (
                  <Badge variant="outline" className="ml-2">
                    Room: {roomFilterLabel}
                  </Badge>
                )}
              </div>
            </div>
          )}

          <div className="relative" aria-busy={loading}>
            {move && (
              <div role="status" className="sticky top-0 z-20 mb-3 flex items-start justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                <div>
                  <div className="font-medium text-amber-800">
                    {move.refused
                      ? `Moving ${formatPatientName(move.appointment.patient)} to ${CALENDARS[move.refused.calendar].title}`
                      : `Rescheduling ${formatPatientName(move.appointment.patient)}`}
                  </div>
                  <div className="text-amber-700">
                    {moveHint(move, date)}
                  </div>
                </div>
                <Button size="sm" variant="ghost" className="shrink-0" onClick={() => setMove(null)} disabled={placing}>
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
            <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_minmax(0,1fr)] grid-rows-[auto_auto] gap-x-1.5 gap-y-1 sm:grid-cols-[3rem_minmax(0,1fr)_minmax(0,1fr)] sm:gap-x-3">
              <div data-time-gutter aria-hidden="true" className="col-start-1 row-start-2" style={{ paddingTop: timeline.topPadding, paddingBottom: timeline.bottomPadding }}>
                {baseGridSlots.map((slot) => {
                  const slotStart = slot.split('-')[0];
                  return (
                    <div key={`gutter-${slot}`} style={{ height: tileHeightCss }} className="flex items-start justify-end pr-1">
                      {slotStart.endsWith(':00') && (
                        <span className="text-[10px] leading-none text-gray-400">{slotStart}</span>
                      )}
                    </div>
                  );
                })}
              </div>
              {columns.map(({ calendar, appointments }, index) => (
                <CalendarColumn
                  key={calendar}
                  calendar={calendar}
                  column={index + 2}
                  appointments={appointments}
                  date={date}
                  slots={baseGridSlots}
                  stepMinutes={slotMinutes}
                  tileHeight={tileHeightCss}
                  timeline={timeline}
                  nowHHMM={isToday && nowHHMM ? nowHHMM : null}
                  recentBookedSlot={recentBookedSlot}
                  bookingInProgress={bookingInProgress?.calendar === calendar ? bookingInProgress.slot : undefined}
                  maxBookingsPerSlot={maxBookingsPerSlot}
                  slotAction={slotActionFor(calendar)}
                  busy={showLoadingOverlay}
                  role={role}
                  onOpen={setSelectedAppointment}
                  onReschedule={(appointment) => setMove({ appointment, from: date })}
                  onStartVisit={handleStartVisit}
                  onMoveCalendar={(appointment, target) => void moveAtSameTime(appointment, target)}
                  onOpenBill={billAccess.read ? (appointment) => setBillForId(appointment.id) : undefined}
                  onBook={(slot) => onSelectSlot?.(slot, calendar)}
                  onMove={(slot) => void moveInto({ slot, calendar })}
                />
              ))}
            </div>
          </div>

          {filteredSchedule.length === 0 && schedule.length > 0 && (
            <div className="text-center text-gray-500 mt-4 p-4">
              No appointments match the current filters.
            </div>
          )}
        </CardContent>
      </Card>

      {overbookDialog}

      <AppointmentBillDialog
        appointment={billFor}
        access={billAccess}
        onClose={() => setBillForId(null)}
        onChanged={async () => {
          await fetchSchedule();
          onAppointmentUpdate?.();
        }}
      />

      <Dialog open={!!selectedAppointment && !showCancelDialog} onOpenChange={(v: boolean) => { if (!v) setSelectedAppointment(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Appointment Details</DialogTitle>
          </DialogHeader>
          {selectedAppointment && (
            <div className="space-y-3 text-sm">
              <div><span className="text-gray-600">Date:</span> {date}</div>
              <div><span className="text-gray-600">Slot:</span> {selectedAppointment.slot}</div>
              <div><span className="text-gray-600">Calendar:</span> {CALENDARS[selectedAppointment.calendar].title}</div>
              <div><span className="text-gray-600">Patient:</span> {formatPatientName(selectedAppointment.patient)}</div>
              {selectedAppointment.patient?.phone && (
                <div>
                  <span className="text-gray-600">Phone:</span>{' '}
                  <a href={`tel:${selectedAppointment.patient.phone.replace(/[^\d+]/g, '')}`} className="font-medium text-blue-700 underline underline-offset-2">
                    {selectedAppointment.patient.phone}
                  </a>
                </div>
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
              {selectedAppointment.billType && (
                <div><span className="text-gray-600">Bill type:</span> {BILL_TYPE_LABEL[selectedAppointment.billType]}</div>
              )}
              {selectedAppointment.billing && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-gray-600">Bill:</span>
                  <span className={selectedAppointment.billing.attention ? 'font-semibold text-amber-800' : 'font-medium'}>
                    {billingChip(selectedAppointment.billing).text}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setBillForId(selectedAppointment.id);
                      setSelectedAppointment(null);
                    }}
                  >
                    {selectedAppointment.billing.invoices.length ? 'Open bill' : billAccess.createBill ? 'Create bill' : 'View bill'}
                  </Button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-gray-600">Type:</span>
                <Badge variant={selectedAppointment.visitType === 'PROCEDURE' ? 'destructive' : selectedAppointment.visitType === 'TELEMED' ? 'secondary' : 'default'}>
                  {visitTypeLabel(selectedAppointment.visitType)}
                </Badge>
              </div>
              {selectedAppointment.visitType === 'PROCEDURE' && selectedAppointment.notes && (
                <div><span className="text-gray-600">Procedure:</span> {selectedAppointment.notes}</div>
              )}
              {selectedAppointment.room && (
                <div><span className="text-gray-600">Room:</span> {selectedAppointment.room.name} ({selectedAppointment.room.type})</div>
              )}
              {selectedAppointment.status && (
                <div><span className="text-gray-600">Status:</span> {STATUS_LABEL[selectedAppointment.status] ?? selectedAppointment.status}</div>
              )}
            </div>
          )}
          <DialogFooter className="flex-wrap">
            <Button variant="outline" onClick={() => setSelectedAppointment(null)}>
              Close
            </Button>
            {selectedAppointment && !selectedAppointment.id?.startsWith('optimistic-') && (
              <>
                {visitAction && (
                  <Button variant={offersMove && selectedMove?.primary ? 'outline' : 'default'} onClick={() => handleStartVisit(selectedAppointment)} disabled={placing}>
                    <FileText className="h-4 w-4 mr-2" />
                    {visitAction}
                  </Button>
                )}
                {canMove(selectedAppointment.status) && (
                  <Button
                    variant="outline"
                    disabled={placing}
                    onClick={() => {
                      setMove({ appointment: selectedAppointment, from: date });
                      setSelectedAppointment(null);
                    }}
                  >
                    Reschedule
                  </Button>
                )}
                <Button
                  variant="destructive"
                  disabled={placing}
                  onClick={() => handleCancelAppointment(selectedAppointment)}
                >
                  <X className="h-4 w-4 mr-2" />
                  Cancel Appointment
                </Button>
                {offersMove && selectedMove && (
                  <Button
                    variant={selectedMove.primary ? 'default' : 'outline'}
                    disabled={placing}
                    onClick={() => void moveAtSameTime(selectedAppointment, selectedMove.to)}
                  >
                    {placing ? selectedMove.busyLabel : selectedMove.label}
                  </Button>
                )}
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
                <div><span className="font-medium">Type:</span> {visitTypeLabel(selectedAppointment.visitType)}</div>
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
