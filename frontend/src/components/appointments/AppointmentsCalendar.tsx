'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { apiClient } from '@/lib/api';
import { track } from '@/lib/analytics';
import { usePrefilledPatient } from './usePrefilledPatient';
import { usePatientBox } from './usePatientBox';
import { gridHoursFor, loadDoctorDay, describeBlock, type DoctorDay } from '@/lib/doctor-availability';
import { useToast } from '@/hooks/use-toast';
import { createCleanupTimeouts, getISTDateString, formatPatientName } from '@/lib/utils';
import type { User, Patient, TimeSlotConfig, AppointmentInSlot, Appointment, AppointmentCalendar } from '@/lib/types';
import DoctorDayCalendar, { type ScopedAppointment } from '@/components/appointments/DoctorDayCalendar';
import { Badge } from '@/components/ui/badge';
import AppointmentBookingDialog from './AppointmentBookingDialog';
import PatientQuickCreateDialog from './PatientQuickCreateDialog';
import { AlertCircle, ChevronDown } from 'lucide-react';
import { useOverbookConfirm } from './useOverbookConfirm';
import { CALENDARS, CALENDAR_ORDER, VISIT_TYPE_LABEL, type SlotChoice } from './appointment-calendars';
import { overbookFlag } from '@/lib/overbooking';
import { displayCalendarDate } from '@/lib/date-display';

interface AppointmentsCalendarProps {
  timeSlotConfig?: TimeSlotConfig;
  prefillPatientId?: string;
  controlledDoctorId?: string;
  controlledDate?: string;
  hideHeaderControls?: boolean;
  /** False for a viewer the server refuses rooms; the room filter then stays empty and rooms are never asked for. */
  readsRooms?: boolean;
  /** The viewer's role, which decides the visit action a row and the details dialog offer. */
  role?: string;
  /** Controls the page puts first and last on the calendar's one toolbar row. */
  leadingControls?: React.ReactNode;
  trailingControls?: React.ReactNode;
}

const LEGEND_SWATCHES: [string, string][] = [
  ['rgba(219, 234, 254, 0.95)', VISIT_TYPE_LABEL.OPD],
  ['rgba(237, 233, 254, 0.95)', VISIT_TYPE_LABEL.PROCEDURE],
  ['rgba(243, 244, 246, 0.95)', VISIT_TYPE_LABEL.TELEMED],
  ['rgba(226, 232, 240, 0.95)', 'Completed'],
  ['rgba(239, 246, 255, 0.95)', 'Past consultation'],
  ['rgba(245, 237, 254, 0.95)', 'Past procedure'],
  ['#22c55e', 'Newly Booked'],
  ['#fbbf24', 'Booking In Progress'],
];

type SameDayBooking = { id: string; slot: string; status: string; doctor?: { id?: string; firstName?: string; lastName?: string } };

/**
 * @cc [owner:nareshshah139,label:product] appointment-calendar-legend
 * Calendar legend colors MUST match the doctor timeline for visit types and past or completed
 * appointments in either theme. The legend MUST name the Scheduled and Confirmed calendars and
 * say how Confirm moves a patient between them.
 */
/**
 * @cc [owner:nareshshah139,label:accessibility] appointment-booking-success-feedback
 * A successful booking MUST display its patient and slot details using the success palette
 * and expose the confirmation as a status announcement.
 */
/**
 * @cc [owner:nareshshah139,label:product] optimistic-appointment-scope
 * An optimistic booking appears only for the doctor and date for which it was submitted.
 */
async function findPatients(text: string): Promise<Patient[]> {
  const res: any = await apiClient.getPatients({ search: text, limit: 10 });
  return (res.data || res.patients || []).map((p: any) => ({
    ...p,
    firstName: p.firstName || p.name?.split(' ')[0] || '',
    lastName: p.lastName || p.name?.split(' ').slice(1).join(' ') || '',
  }));
}

export default function AppointmentsCalendar({
  timeSlotConfig = {
    startHour: 9,
    endHour: 18,
    stepMinutes: 30,
    timezone: 'Asia/Kolkata'
  },
  prefillPatientId,
  controlledDoctorId,
  controlledDate,
  hideHeaderControls,
  readsRooms = true,
  role,
  leadingControls,
  trailingControls,
}: AppointmentsCalendarProps) {
  const { toast } = useToast();
  const { sendWithOverbookConfirm, overbookDialog } = useOverbookConfirm();
  const [slotConfig, setSlotConfig] = useState<TimeSlotConfig>(timeSlotConfig);
  const [date, setDate] = useState<string>(getISTDateString());
  const [doctorId, setDoctorId] = useState<string>('');
  const [panel, setPanel] = useState<'filters' | 'legend' | null>(null);
  const [doctors, setDoctors] = useState<User[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  // const [error, setError] = useState<string | null>(null);
  const patientBox = usePatientBox(findPatients);
  const { box, type: typePatient, select: choosePatient, clear: clearPatient } = patientBox;
  const selectedPatient = box.kind === 'selected' ? box.patient : null;
  const selectedPatientId = selectedPatient?.id ?? '';
  const [bookingDetails, setBookingDetails] = useState<(Appointment & { calendar: AppointmentCalendar }) | null>(null);
  // const [recentBookedSlot, setRecentBookedSlot] = useState<string>('');
  const [visitTypeFilter, setVisitTypeFilter] = useState<string>('ALL');
  const [roomFilter, setRoomFilter] = useState<string>('ALL');
  const [rooms, setRooms] = useState<{ id: string; name: string; type: string }[]>([]);
  const selectedRoom = useMemo(
    () => rooms.find((room) => room.id === roomFilter),
    [rooms, roomFilter]
  );
  const [refreshKey, setRefreshKey] = useState<number>(0);
  const [optimisticAppointment, setOptimisticAppointment] = useState<ScopedAppointment | null>(null);
  const [gridMinutes, setGridMinutes] = useState<number>(timeSlotConfig.stepMinutes ?? 30);
  const [recentBookedSlot, setRecentBookedSlot] = useState<string>('');
  const [googleConfigured, setGoogleConfigured] = useState<boolean | null>(null);
  const [googleStatus, setGoogleStatus] = useState<{ connected: boolean; calendarId?: string | null; email?: string | null }>({
    connected: false,
  });
  const [doctorGoogleStatus, setDoctorGoogleStatus] = useState<{ connected: boolean; calendarId?: string | null; email?: string | null }>({
    connected: false,
  });
  const [googleLoading, setGoogleLoading] = useState<boolean>(false);

  // Booking dialog state
  const [bookingDialogOpen, setBookingDialogOpen] = useState<boolean>(false);
  const [pendingBooking, setPendingBooking] = useState<SlotChoice | null>(null);
  const [quickCreateOpen, setQuickCreateOpen] = useState<boolean>(false);

  const cleanupTimeouts = useMemo(() => createCleanupTimeouts(), []);

  useEffect(() => {
    void fetchDoctors();
    void fetchRooms();
  }, []);

  usePrefilledPatient(prefillPatientId, patientBox);

  // Keep local slot config in sync with prop defaults
  useEffect(() => {
    setSlotConfig((prev) => {
      const next = timeSlotConfig;
      if (
        prev.startHour === next.startHour &&
        prev.endHour === next.endHour &&
        prev.stepMinutes === next.stepMinutes &&
        prev.timezone === next.timezone
      ) {
        return prev;
      }
      return next;
    });
  }, [timeSlotConfig.startHour, timeSlotConfig.endHour, timeSlotConfig.stepMinutes, timeSlotConfig.timezone]);

  // Apply doctor working hours when doctor/date changes (mirrors AppointmentScheduler behavior)
  const [doctorDay, setDoctorDay] = useState<DoctorDay | null>(null);
  useEffect(() => {
    let cancelled = false;
    const applyHours = async () => {
      const day = doctorId && date ? await loadDoctorDay(doctorId, date) : null;
      if (cancelled) return;
      setDoctorDay(day);
      const hours = gridHoursFor(day);
      if (hours) setSlotConfig((prev) => ({ ...prev, ...hours }));
    };
    void applyHours();
    return () => { cancelled = true; };
  }, [doctorId, date]);

  // Keep grid dropdown aligned if stepMinutes changes
  useEffect(() => {
    if (typeof slotConfig.stepMinutes === 'number') {
      setGridMinutes(slotConfig.stepMinutes);
    }
  }, [slotConfig.stepMinutes]);

  // Apply controlled doctor/date when provided
  useEffect(() => {
    if (controlledDoctorId) setDoctorId(controlledDoctorId);
  }, [controlledDoctorId]);
  useEffect(() => {
    if (controlledDate) setDate(controlledDate);
  }, [controlledDate]);

  useEffect(() => {
    // Clear transient highlights when doctor/date changes
    setBookingDetails(null);
    setOptimisticAppointment(null);
    setRecentBookedSlot('');
    // Fetch rooms when doctor/date changes
    if (doctorId && date) {
      void fetchRooms();
    }
  }, [doctorId, date, readsRooms]);

  useEffect(() => {
    void fetchGoogleConfigured();
    void fetchGoogleStatus();
  }, []);

  useEffect(() => {
    if (doctorId) {
      void fetchDoctorGoogleStatus(doctorId);
    } else {
      setDoctorGoogleStatus({ connected: false });
    }
  }, [doctorId]);

  const fetchDoctors = async () => {
    try {
      const res: any = await apiClient.getUsers({ limit: 100 });
      const list: User[] = (res.users || res.data || []).filter((u: User) => u.role === 'DOCTOR');
      setDoctors(list);
      if (list[0]?.id) setDoctorId(list[0].id);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to fetch doctors', e);
    }
  };

  const fetchRooms = async () => {
    if (!readsRooms) return;
    try {
      const res: any = await apiClient.getRooms();
      setRooms(res.rooms || []);
    } catch (e) {
      console.error('Failed to fetch rooms', e);
    }
  };

  const fetchGoogleConfigured = async () => {
    try {
      const res = await apiClient.getGoogleCalendarConfigured();
      setGoogleConfigured(!!res?.configured);
    } catch {
      setGoogleConfigured(false);
    }
  };

  const fetchGoogleStatus = async () => {
    try {
      const res = await apiClient.getGoogleCalendarStatus();
      setGoogleStatus({
        connected: !!res?.connected,
        calendarId: res?.calendarId ?? null,
        email: res?.email ?? null,
      });
    } catch (e) {
      console.error('Failed to fetch Google Calendar status', e);
    }
  };

  const fetchDoctorGoogleStatus = async (dId: string) => {
    try {
      const res = await apiClient.getGoogleCalendarDoctorStatus(dId);
      setDoctorGoogleStatus({
        connected: !!res?.connected,
        calendarId: res?.calendarId ?? null,
        email: res?.email ?? null,
      });
    } catch {
      setDoctorGoogleStatus({ connected: false });
    }
  };

  const startGoogleConnect = async () => {
    try {
      setGoogleLoading(true);
      const res = await apiClient.getGoogleCalendarAuthUrl('/dashboard/appointments');
      if (res?.url) {
        window.location.href = res.url;
      } else {
        throw new Error('Missing auth URL');
      }
    } catch (e: any) {
      const msg = e?.body?.message || e?.message || 'Failed to start Google connect';
      toast({ variant: 'destructive', title: 'Google Calendar', description: msg });
    } finally {
      setGoogleLoading(false);
    }
  };

  const disconnectGoogle = async () => {
    try {
      setGoogleLoading(true);
      await apiClient.disconnectGoogleCalendar();
      setGoogleStatus({ connected: false });
      void fetchDoctorGoogleStatus(doctorId);
      toast({ title: 'Google Calendar', description: 'Disconnected successfully.' });
    } catch (e: any) {
      const msg = e?.body?.message || e?.message || 'Failed to disconnect';
      toast({ variant: 'destructive', title: 'Google Calendar', description: msg });
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleBookingRequest = (slot: string, calendar: AppointmentCalendar) => {
    if (!selectedPatient) {
      toast({ variant: 'destructive', title: 'Patient required', description: 'Select a patient before booking.' });
      return;
    }

    setPendingBooking({ slot, calendar });
    setBookingDialogOpen(true);
  };

  const handleBookingConfirm = async (appointmentData: { 
    visitType: 'OPD' | 'PROCEDURE' | 'TELEMED'; 
    roomId?: string;
    slot?: string;
    notes?: string;
  }) => {
    if (!pendingBooking) return;
    const { calendar } = pendingBooking;
    try {
      setLoading(true);
      
      // Create optimistic appointment immediately
      const selectedRoom = appointmentData.roomId 
        ? rooms.find(r => r.id === appointmentData.roomId) 
        : undefined;
        
      const optimisticPatient = selectedPatient
        ? {
            id: selectedPatient.id,
            name: `${selectedPatient.firstName ?? ''} ${selectedPatient.lastName ?? ''}`.trim() || selectedPatient.name || 'Unknown',
            phone: selectedPatient.phone,
            email: selectedPatient.email,
          }
        : { id: selectedPatientId, name: 'Unknown Patient' };

      const optimisticDoctor = doctors.find((d) => d.id === doctorId);

      const finalSlot = appointmentData.slot || pendingBooking.slot;

      const optimisticAppt: AppointmentInSlot = {
        id: `optimistic-${finalSlot}`,
        slot: finalSlot,
        patient: optimisticPatient,
        doctor: optimisticDoctor
          ? { id: optimisticDoctor.id, firstName: optimisticDoctor.firstName, lastName: optimisticDoctor.lastName }
          : { id: doctorId, firstName: 'Dr.', lastName: 'Unknown' },
        visitType: appointmentData.visitType,
        room: selectedRoom ? { id: selectedRoom.id, name: selectedRoom.name, type: selectedRoom.type } : undefined,
        status: CALENDARS[calendar].entryStatus,
        calendar,
        notes: appointmentData.notes,
      };
      
      setOptimisticAppointment({ doctorId, date, appointment: optimisticAppt });
      
      const created: any = await sendWithOverbookConfirm((allowOverbook) => apiClient.createAppointment({
        doctorId, 
        patientId: selectedPatientId, 
        date, 
        slot: finalSlot, 
        visitType: appointmentData.visitType,
        roomId: appointmentData.roomId,
        notes: appointmentData.notes,
        calendar,
        ...overbookFlag(allowOverbook),
      }));
      if (!created) {
        setOptimisticAppointment(null);
        return;
      }
      
      track('appointment_booked', { source: 'calendar' });
      // Clear optimistic appointment and refresh with real data
      setOptimisticAppointment(null);
      setRefreshKey(prev => prev + 1);
      
      // Set success feedback and highlight newly booked slot
      setBookingDetails({ ...created, calendar });
      setRecentBookedSlot(finalSlot);
      
      // Refresh rooms after booking
      void fetchRooms();
      
      // Clear success message and highlight after 5 seconds
      setTimeout(() => {
        setBookingDetails(null);
        setRecentBookedSlot('');
      }, 5000);
      
      // Close dialog
      setBookingDialogOpen(false);
      setPendingBooking(null);
      
    } catch (e: any) {
      // Reset optimistic update on error
      setOptimisticAppointment(null);
      
      const status = e?.status;
      const body = e?.body || {};
      if (status === 409) {
        const suggestions = Array.isArray(body?.suggestions) ? body.suggestions : [];
        const msg = body?.message || 'Scheduling conflict detected';
        toast({
          variant: 'destructive',
          title: 'Scheduling Conflict',
          description: `${msg}${suggestions.length ? ` — Try: ${suggestions.join(', ')}` : ''}`,
        });
        return;
      }
      const errMsg = body?.message || 'Failed to book appointment';
      toast({ variant: 'destructive', title: 'Failed to book appointment', description: errMsg });
    } finally {
      setLoading(false);
    }
  };

  const handleBookingCancel = () => {
    setBookingDialogOpen(false);
    setPendingBooking(null);
  };

  const [sameDay, setSameDay] = useState<{ key: string; bookings: SameDayBooking[] }>({ key: '', bookings: [] });
  const sameDayKey = `${selectedPatientId}|${date}`;
  useEffect(() => {
    if (!selectedPatientId || !date) return;
    let active = true;
    apiClient.getAppointments({ patientId: selectedPatientId, date, limit: 20 })
      .then((res: any) => {
        if (active) setSameDay({ key: sameDayKey, bookings: res?.appointments || res?.data || [] });
      })
      .catch(() => {
        if (active) setSameDay({ key: sameDayKey, bookings: [] });
      });
    return () => { active = false; };
  }, [selectedPatientId, date, refreshKey, sameDayKey]);

  const startSearchFromKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      clearPatient();
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      typePatient(e.key);
    }
  };

  const currentDoctor = doctors.find((d) => d.id === doctorId);
  const currentDoctorName = currentDoctor
    ? `Dr. ${currentDoctor.firstName ?? ''} ${currentDoctor.lastName ?? ''}`.trim()
    : 'the selected doctor';
  const sameDayNote = (() => {
    const booked = sameDay.key === sameDayKey && selectedPatient
      ? sameDay.bookings.filter((a) => a.status !== 'CANCELLED').sort((a, b) => a.slot.localeCompare(b.slot))
      : [];
    if (!booked.length) return null;
    const times = booked.map((a) => {
      const other = a.doctor?.id && a.doctor.id !== doctorId ? `Dr. ${a.doctor.firstName ?? ''} ${a.doctor.lastName ?? ''}`.trim() : '';
      return `${a.slot.split('-')[0]}${other ? ` with ${other}` : ''}`;
    });
    return `${formatPatientName(selectedPatient)} already has ${times.join(', ')} on ${displayCalendarDate(date)}`;
  })();
  const isCurrentUserTheDoctor = googleStatus.connected && doctorGoogleStatus.connected
    && googleStatus.calendarId === doctorGoogleStatus.calendarId;

  return (
    <>
      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
          {leadingControls}
          {!hideHeaderControls && (
            <>
              <div className="w-48">
                <label className="text-sm text-gray-700">Doctor</label>
                <Select value={doctorId} onValueChange={setDoctorId}>
                  <SelectTrigger><SelectValue placeholder="Select doctor" /></SelectTrigger>
                  <SelectContent>
                    {doctors.map((d) => (<SelectItem key={d.id} value={d.id}>{d.firstName} {d.lastName}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-44">
                <label className="text-sm text-gray-700">Date</label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </>
          )}
          <div className="min-w-56 flex-[3_1_16rem]">
            <label className="text-sm text-gray-700">Patient</label>
            <div className="relative">
              <Input
                placeholder="Name or phone"
                value={box.kind === 'selected' ? `${formatPatientName(box.patient)} — ${box.patient.phone ?? ''}` : box.text}
                readOnly={box.kind === 'selected'}
                className={box.kind === 'selected' ? 'bg-gray-50 pr-16 font-medium' : undefined}
                onChange={(e) => typePatient(e.target.value)}
                onKeyDown={box.kind === 'selected' ? startSearchFromKey : undefined}
                onPaste={box.kind === 'selected' ? (e) => { e.preventDefault(); typePatient(e.clipboardData.getData('text')); } : undefined}
              />
              {box.kind === 'selected' && (
                <Button variant="ghost" size="sm" className="absolute right-1 top-1/2 h-7 -translate-y-1/2 px-2" onClick={clearPatient}>Clear</Button>
              )}
            </div>
          </div>
          {(['filters', 'legend'] as const).map((name) => (
            <Button key={name} type="button" variant="outline" aria-expanded={panel === name} onClick={() => setPanel(panel === name ? null : name)}>
              {name === 'filters' ? 'Filters' : 'Legend'}
              <ChevronDown className={`h-4 w-4 transition-transform ${panel === name ? 'rotate-180' : ''}`} aria-hidden="true" />
            </Button>
          ))}
          {trailingControls}
          {googleConfigured !== false && (
            googleStatus.connected ? (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <svg className="h-4 w-4" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                  <span className="text-xs font-medium text-green-700">Syncing</span>
                </div>
                <Badge variant="outline" className="text-xs border-green-200 bg-green-50 text-green-700">
                  {googleStatus.email || googleStatus.calendarId || 'Connected'}
                </Badge>
                <Button variant="ghost" size="sm" className="text-xs text-gray-500 hover:text-red-600" onClick={disconnectGoogle} disabled={googleLoading}>
                  {googleLoading ? 'Disconnecting...' : 'Disconnect'}
                </Button>
              </div>
            ) : (
              <Button variant="outline" className="gap-2 border-gray-300" onClick={startGoogleConnect} disabled={googleLoading}>
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                {googleLoading ? 'Connecting...' : 'Sync with Google Calendar'}
              </Button>
            )
          )}
        </div>

        {googleConfigured !== false && doctorId && !doctorGoogleStatus.connected && googleStatus.connected && (
          <div className="flex items-center gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>
              {currentDoctorName}&apos;s Google Calendar is not connected. Appointments won&apos;t sync to their calendar.
              {!isCurrentUserTheDoctor && ' Ask the doctor to log in and connect their own Google Calendar.'}
            </span>
          </div>
        )}
        {googleConfigured !== false && doctorId && doctorGoogleStatus.connected && (
          <div className="flex items-center gap-2 rounded border border-green-200 bg-green-50 px-3 py-1.5 text-xs text-green-700">
            <svg className="h-3.5 w-3.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span>
              {currentDoctorName}&apos;s appointments will auto-sync to Google Calendar
              {doctorGoogleStatus.email ? ` (${doctorGoogleStatus.email})` : ''}
            </span>
          </div>
        )}

        {panel === 'filters' && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="text-sm text-gray-700">Type</label>
              <Select value={visitTypeFilter} onValueChange={setVisitTypeFilter}>
                <SelectTrigger><SelectValue placeholder="All types" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All types</SelectItem>
                  <SelectItem value="OPD">{VISIT_TYPE_LABEL.OPD}</SelectItem>
                  <SelectItem value="PROCEDURE">{VISIT_TYPE_LABEL.PROCEDURE}</SelectItem>
                  <SelectItem value="TELEMED">{VISIT_TYPE_LABEL.TELEMED}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {readsRooms && (
              <div>
                <label className="text-sm text-gray-700">Room</label>
                <Select value={roomFilter} onValueChange={setRoomFilter}>
                  <SelectTrigger><SelectValue placeholder="All rooms" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All rooms</SelectItem>
                    {rooms.map((room) => (
                      <SelectItem key={room.id} value={room.id}>{room.name} ({room.type})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <label className="text-sm text-gray-700">Grid</label>
              <Select value={String(gridMinutes)} onValueChange={(v: string) => setGridMinutes(parseInt(v, 10))}>
                <SelectTrigger><SelectValue placeholder="Grid granularity" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 minutes</SelectItem>
                  <SelectItem value="15">15 minutes</SelectItem>
                  <SelectItem value="20">20 minutes</SelectItem>
                  <SelectItem value="30">30 minutes</SelectItem>
                  <SelectItem value="45">45 minutes</SelectItem>
                  <SelectItem value="60">60 minutes</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {box.kind === 'searching' && box.results.length > 0 && (
          <div className="max-h-40 overflow-auto border rounded">
            {box.results.map((p) => (
              <div
                key={p.id}
                className="px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer"
                onClick={() => choosePatient(p)}
              >
                {p.firstName} {p.lastName} — {p.phone}
              </div>
            ))}
          </div>
        )}

        {box.kind === 'searching' && box.text.trim() && box.done && box.results.length === 0 && (
          <div className="rounded border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
            <div className="flex items-center justify-between">
              <span>No matching patients found.</span>
              <Button variant="outline" size="sm" onClick={() => setQuickCreateOpen(true)}>
                New patient
              </Button>
            </div>
          </div>
        )}

        {panel === 'legend' && (
          <div className="border rounded p-3 bg-gray-50">
            <ul className="mb-3 space-y-1 text-sm">
              {CALENDAR_ORDER.map((calendar) => (
                <li key={calendar} className="flex items-start gap-2">
                  <span aria-hidden="true" className="mt-1.5 h-1 w-4 shrink-0 rounded" style={{ backgroundColor: CALENDARS[calendar].accentColor }} />
                  <span><strong>{CALENDARS[calendar].title}:</strong> {CALENDARS[calendar].description}</span>
                </li>
              ))}
              <li className="text-gray-700">Open a scheduled patient and press <strong>Confirm</strong> to move them to Confirmed at the same time.</li>
            </ul>
            <div className="flex flex-wrap gap-4 items-center">
              {LEGEND_SWATCHES.map(([color, label]) => (
                <div key={label} className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: color }} />
                  <span className="text-sm">{label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {sameDayNote && (
          <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {sameDayNote}
          </div>
        )}

        {!!bookingDetails && (
          <div
            className="p-4 rounded-r text-sm shadow-sm"
            role="status"
            style={{
              backgroundColor: '#f0fdf4',
              borderLeft: '4px solid #22c55e',
              color: '#15803d'
            }}
          >
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5" style={{ color: '#22c55e' }} viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="font-medium">
                  Booked: {bookingDetails.patient?.name || formatPatientName(selectedPatient)}, {displayCalendarDate(date)}, {bookingDetails.slot}
                </p>
              </div>
            </div>
          </div>
        )}

        {doctorDay && doctorDay.blocked.length > 0 && (
          <div role="status" className="p-3 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm">
            Not bookable: {doctorDay.blocked.map(describeBlock).join('; ')}
          </div>
        )}

        <DoctorDayCalendar
          doctorId={doctorId}
          date={date}
          recentBookedSlot={recentBookedSlot}
          visitTypeFilter={visitTypeFilter}
          roomFilter={roomFilter}
          onSelectSlot={handleBookingRequest}
          refreshKey={refreshKey}
          bookingInProgress={loading && pendingBooking ? pendingBooking : undefined}
          optimisticAppointment={optimisticAppointment?.doctorId === doctorId && optimisticAppointment.date === date ? optimisticAppointment : undefined}
          onAppointmentUpdate={() => setRefreshKey(prev => prev + 1)}
          disableSlotBooking={!selectedPatient}
          role={role}
          selectedRoomName={selectedRoom?.name}
          timeSlotConfig={{ ...slotConfig, stepMinutes: Math.max(10, gridMinutes) }}
          maxBookingsPerSlot={doctorDay?.maxBookingsPerSlot ?? 1}
        />
      </div>

      <AppointmentBookingDialog
        open={bookingDialogOpen}
        onOpenChange={setBookingDialogOpen}
        doctorId={doctorId}
        date={date}
        slot={pendingBooking?.slot ?? ''}
        patient={selectedPatient}
        onConfirm={handleBookingConfirm}
        onCancel={handleBookingCancel}
      />

      {overbookDialog}

      <PatientQuickCreateDialog
        open={quickCreateOpen}
        onOpenChange={setQuickCreateOpen}
        initialName={box.kind === 'searching' ? box.text : ''}
        onPatientCreated={(patient) => {
          choosePatient(patient);
          setQuickCreateOpen(false);
        }}
      />
    </>
  );
}
