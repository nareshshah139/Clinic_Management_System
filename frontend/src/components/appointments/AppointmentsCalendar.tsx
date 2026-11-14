'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { apiClient } from '@/lib/api';
import { track } from '@/lib/analytics';
import { usePrefilledPatient } from './usePrefilledPatient';
import { gridHoursFor, loadDoctorDay, describeBlock, type DoctorDay } from '@/lib/doctor-availability';
import { useToast } from '@/hooks/use-toast';
import { createCleanupTimeouts, getISTDateString, formatPatientName } from '@/lib/utils';
import type { User, Patient, TimeSlotConfig, AppointmentInSlot, Appointment, AppointmentCalendar } from '@/lib/types';
import DoctorDayCalendar, { type ScopedAppointment } from '@/components/appointments/DoctorDayCalendar';
import { Badge } from '@/components/ui/badge';
import AppointmentBookingDialog from './AppointmentBookingDialog';
import PatientQuickCreateDialog from './PatientQuickCreateDialog';
import { AlertCircle, Info } from 'lucide-react';
import { useOverbookConfirm } from './useOverbookConfirm';
import { CALENDARS, type SlotChoice } from './appointment-calendars';
import { overbookFlag } from '@/lib/overbooking';
import { enumLabel } from '@/lib/labels';

interface AppointmentsCalendarProps {
  timeSlotConfig?: TimeSlotConfig;
  prefillPatientId?: string;
  controlledDoctorId?: string;
  controlledDate?: string;
  hideHeaderControls?: boolean;
  toolbarLead?: React.ReactNode;
  /** False for a viewer the server refuses rooms; the room filter then stays empty and rooms are never asked for. */
  readsRooms?: boolean;
}

/**
 * @cc [owner:nareshshah139,label:accessibility] appointment-booking-success-feedback
 * A successful booking MUST display its patient and slot details using the success palette
 * and expose the confirmation as a status announcement.
 */
/**
 * @cc [owner:nareshshah139,label:product] optimistic-appointment-scope
 * An optimistic booking appears only for the doctor and date for which it was submitted.
 */
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
  toolbarLead,
  readsRooms = true,
}: AppointmentsCalendarProps) {
  const { toast } = useToast();
  const { sendWithOverbookConfirm, overbookDialog } = useOverbookConfirm();
  const [slotConfig, setSlotConfig] = useState<TimeSlotConfig>(timeSlotConfig);
  const [date, setDate] = useState<string>(getISTDateString());
  const [doctorId, setDoctorId] = useState<string>('');
  const [patientSearch, setPatientSearch] = useState<string>('');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<User[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  // const [error, setError] = useState<string | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [bookingDetails, setBookingDetails] = useState<(Appointment & { calendar: AppointmentCalendar }) | null>(null);
  const [searchingPatients, setSearchingPatients] = useState<boolean>(false);
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
  const [autoPromptedForSearch, setAutoPromptedForSearch] = useState<boolean>(false);

  const cleanupTimeouts = useMemo(() => createCleanupTimeouts(), []);

  useEffect(() => {
    void fetchDoctors();
    void fetchRooms();
  }, []);

  usePrefilledPatient(prefillPatientId, selectedPatientId, setSelectedPatientId, setSelectedPatient);

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
      if (list[0]?.id) setDoctorId((current) => current || list[0].id);
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

  const searchPatients = async (q: string) => {
    setPatientSearch(q);

    if (!q.trim()) {
      setPatients([]);
      setQuickCreateOpen(false);
      setAutoPromptedForSearch(false);
      setSearchingPatients(false);
      return;
    }

    try {
      setSearchingPatients(true);
      const res: any = await apiClient.getPatients({ search: q, limit: 10 });
      const matches = (res.data || res.patients || []).map((p: any) => ({
        ...p,
        firstName: p.firstName || p.name?.split(' ')[0] || '',
        lastName: p.lastName || p.name?.split(' ').slice(1).join(' ') || '',
      }));
      setPatients(matches);
      if (matches.length === 0 && !autoPromptedForSearch) {
        setQuickCreateOpen(true);
        setAutoPromptedForSearch(true);
      }
      if (matches.length > 0) {
        setQuickCreateOpen(false);
        setAutoPromptedForSearch(false);
      }
      setSearchingPatients(false);
    } catch (error) {
      console.error('Failed to search patients', error);
      setSearchingPatients(false);
    }
  };

  const handleBookingRequest = (slot: string, calendar: AppointmentCalendar) => {
    if (!selectedPatient || selectedPatient.id !== selectedPatientId) {
      toast({ variant: 'destructive', title: 'Patient required', description: 'Select a patient before booking.' });
      return;
    }
    const pid = selectedPatientId?.trim();
    if (!pid) {
      toast({
        variant: 'destructive',
        title: 'Patient required',
        description: 'Select an existing patient or add a new one before booking.',
      });
      setQuickCreateOpen(true);
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
        : {
            id: selectedPatientId,
            name: patientSearch || 'Unknown Patient',
          };

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

  const currentDoctor = doctors.find((d) => d.id === doctorId);
  const currentDoctorName = currentDoctor
    ? `Dr. ${currentDoctor.firstName ?? ''} ${currentDoctor.lastName ?? ''}`.trim()
    : 'the selected doctor';
  const isCurrentUserTheDoctor = googleStatus.connected && doctorGoogleStatus.connected
    && googleStatus.calendarId === doctorGoogleStatus.calendarId;

  return (
    <>
      <div className="space-y-3">
          <div role="toolbar" aria-label="Calendar filters" className="flex flex-wrap items-center gap-2">
            {toolbarLead}
            {!hideHeaderControls && (
              <>
                <Select value={doctorId} onValueChange={setDoctorId}>
                  <SelectTrigger size="sm" aria-label="Doctor"><SelectValue placeholder="Select doctor" /></SelectTrigger>
                  <SelectContent>
                    {doctors.map((d) => (<SelectItem key={d.id} value={d.id}>{d.firstName} {d.lastName}</SelectItem>))}
                  </SelectContent>
                </Select>
                <Input aria-label="Date" className="h-8 w-40" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </>
            )}
            <Select value={visitTypeFilter} onValueChange={setVisitTypeFilter}>
              <SelectTrigger size="sm" aria-label="Visit type"><SelectValue placeholder="All Types" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Types</SelectItem>
                <SelectItem value="OPD">OPD Consultation</SelectItem>
                <SelectItem value="PROCEDURE">Procedure</SelectItem>
                <SelectItem value="TELEMED">Telemedicine</SelectItem>
              </SelectContent>
            </Select>
            {readsRooms && (
              <Select value={roomFilter} onValueChange={setRoomFilter}>
                <SelectTrigger size="sm" aria-label="Room"><SelectValue placeholder="All Rooms" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Rooms</SelectItem>
                  {rooms.map((room) => (
                    <SelectItem key={room.id} value={room.id}>{room.name} ({room.type})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Input
              aria-label="Patient"
              className="h-8 min-w-28 flex-1"
              placeholder="Find patient"
              value={patientSearch}
              onChange={(e) => { setSelectedPatientId(''); setSelectedPatient(null); void searchPatients(e.target.value); }}
            />
            <Select value={String(gridMinutes)} onValueChange={(v: string) => setGridMinutes(parseInt(v, 10))}>
              <SelectTrigger size="sm" aria-label="Grid interval"><SelectValue placeholder="Grid granularity" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 min</SelectItem>
                <SelectItem value="15">15 min</SelectItem>
                <SelectItem value="20">20 min</SelectItem>
                <SelectItem value="30">30 min</SelectItem>
                <SelectItem value="45">45 min</SelectItem>
                <SelectItem value="60">60 min</SelectItem>
              </SelectContent>
            </Select>
            {googleConfigured !== false && (
              <div className="flex items-center gap-2">
                {googleStatus.connected ? (
                  <>
                    <div className="flex items-center gap-1.5">
                      <svg className="h-4 w-4" viewBox="0 0 24 24">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                      </svg>
                      <span className="text-xs font-medium text-success-text">Syncing</span>
                    </div>
                    <Badge variant="outline" className="text-xs border-success-border bg-success-soft text-success-text">
                      {googleStatus.email || googleStatus.calendarId || 'Connected'}
                    </Badge>
                    <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-destructive-text" onClick={disconnectGoogle} disabled={googleLoading}>
                      {googleLoading ? 'Disconnecting...' : 'Disconnect'}
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 border-border"
                    onClick={startGoogleConnect}
                    disabled={googleLoading}
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    {googleLoading ? 'Connecting...' : 'Sync with Google Calendar'}
                  </Button>
                )}
              </div>
            )}
          </div>


          {/* Doctor-specific Google Calendar status */}
          {googleConfigured !== false && doctorId && !doctorGoogleStatus.connected && googleStatus.connected && (
            <div className="flex items-center gap-2 rounded border border-warning-border bg-warning-soft px-3 py-2 text-xs text-warning-text">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>
                {currentDoctorName}&apos;s Google Calendar is not connected. Appointments won&apos;t sync to their calendar.
                {!isCurrentUserTheDoctor && ' Ask the doctor to log in and connect their own Google Calendar.'}
              </span>
            </div>
          )}
          {googleConfigured !== false && doctorId && doctorGoogleStatus.connected && (
            <div className="flex items-center gap-2 rounded border border-success-border bg-success-soft px-3 py-1.5 text-xs text-success-text">
              <svg className="h-3.5 w-3.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>
                {currentDoctorName}&apos;s appointments will auto-sync to Google Calendar
                {doctorGoogleStatus.email ? ` (${doctorGoogleStatus.email})` : ''}
              </span>
            </div>
          )}
          {selectedPatient && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                Selected: {selectedPatient.firstName} {selectedPatient.lastName} — {selectedPatient.phone}
              </Badge>
              <Button variant="outline" size="sm" onClick={() => { setSelectedPatientId(''); setSelectedPatient(null); setPatientSearch(''); setPatients([]); setQuickCreateOpen(false); }}>Clear</Button>
            </div>
          )}

          {!selectedPatientId && patientSearch && (
            <div className="flex items-center gap-2 rounded border border-warning-border bg-warning-soft px-3 py-2 text-xs text-warning-text">
              <AlertCircle className="h-4 w-4" />
              <span>Select a patient from the list or add them as new before booking.</span>
            </div>
          )}

          {patientSearch && patients.length > 0 && (
            <ul aria-label="Matching patients" className="max-h-40 overflow-auto border rounded">
              {patients.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    onClick={() => {
                      setPatientSearch(`${p.firstName} ${p.lastName} — ${p.phone}`);
                      setSelectedPatientId(p.id);
                      setSelectedPatient(p);
                      setPatients([]);
                      setQuickCreateOpen(false);
                      setAutoPromptedForSearch(false);
                    }}
                  >
                    {p.firstName} {p.lastName} — {p.phone}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {patientSearch && patients.length === 0 && !selectedPatientId && !searchingPatients && (
            <div className="rounded border border-dashed border-border bg-muted p-4 text-sm text-foreground">
              <div className="flex items-center justify-between">
                <span>No matching patients found.</span>
                <Button variant="outline" size="sm" onClick={() => setQuickCreateOpen(true)}>
                  + Add "{patientSearch}" as a new patient
                </Button>
              </div>
            </div>
          )}
          {patientSearch && !patients.length && !quickCreateOpen && !selectedPatientId && !searchingPatients && (
            <div className="text-xs text-muted-foreground">
              Tip: enter patient name and phone, then use "Add" to create a new record instantly.
            </div>
          )}

          {!!bookingDetails && (
            <div 
              className="p-4 rounded-r text-sm shadow-sm"
              role="status"
              style={{
                backgroundColor: 'var(--success-soft)',
                borderLeft: '4px solid var(--success)',
                color: 'var(--success-text)'
              }}
            >
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5" style={{ color: 'var(--success)' }} viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="font-medium">Appointment Successfully Booked!</p>
                  <p>
                    {bookingDetails.patient?.name || `${selectedPatient?.firstName ?? ''} ${selectedPatient?.lastName ?? ''}`.trim()} 
                    {' '} scheduled for {bookingDetails.slot} in the {CALENDARS[bookingDetails.calendar].title} calendar
                    {bookingDetails.room && ` in ${bookingDetails.room.name}`}
                    {bookingDetails.visitType && ` (${enumLabel('visitType', bookingDetails.visitType)})`}
                  </p>
                </div>
              </div>
            </div>
          )}

          {doctorDay && doctorDay.blocked.length > 0 && (
            <div role="status" className="p-3 bg-destructive-soft border border-destructive-border rounded-md text-destructive-text text-sm">
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
            disableSlotBooking={!selectedPatientId || !selectedPatient || selectedPatient.id !== selectedPatientId}
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
        onOpenChange={(open: boolean) => {
          setQuickCreateOpen(open);
          if (!open && !selectedPatientId) {
            setPatientSearch('');
            setAutoPromptedForSearch(false);
          }
        }}
        initialName={patientSearch}
        onPatientCreated={(patient) => {
          setSelectedPatientId(patient.id);
          setSelectedPatient(patient);
          setPatientSearch(`${patient.firstName ?? ''} ${patient.lastName ?? ''} — ${patient.phone ?? ''}`.trim());
          setPatients([]);
          setQuickCreateOpen(false);
          setAutoPromptedForSearch(false);
        }}
      />
    </>
  );
}
