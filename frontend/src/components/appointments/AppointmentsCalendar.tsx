'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiClient } from '@/lib/api';
import { gridHoursFor, loadDoctorDay, describeBlock, type DoctorDay } from '@/lib/doctor-availability';
import { useToast } from '@/hooks/use-toast';
import { formatPatientName } from '@/lib/utils';
import type { User, Patient, TimeSlotConfig, AppointmentInSlot } from '@/lib/types';
import DoctorDayCalendar from '@/components/appointments/DoctorDayCalendar';
import { Badge } from '@/components/ui/badge';
import AppointmentBookingDialog from './AppointmentBookingDialog';
import PatientQuickCreateDialog from './PatientQuickCreateDialog';
import { AlertCircle } from 'lucide-react';
import { AppointmentStatus } from '@cms/shared-types';

interface AppointmentsCalendarProps {
  timeSlotConfig?: TimeSlotConfig;
  prefillPatientId?: string;
  doctor: User | undefined;
  date: string;
}

/**
 * @cc [owner:nareshshah139,label:product] appointment-calendar-legend
 * Calendar legend colors MUST match the doctor timeline for visit types and past or completed
 * appointments in either theme.
 */
/**
 * @cc [owner:nareshshah139,label:accessibility] appointment-booking-success-feedback
 * A successful booking MUST display its patient and slot details using the success palette
 * and expose the confirmation as a status announcement.
 */
export default function AppointmentsCalendar({
  timeSlotConfig = {
    startHour: 9,
    endHour: 18,
    stepMinutes: 30,
    timezone: 'Asia/Kolkata'
  },
  prefillPatientId,
  doctor,
  date,
}: AppointmentsCalendarProps) {
  const { toast } = useToast();
  const doctorId = doctor?.id ?? '';
  const [slotConfig, setSlotConfig] = useState<TimeSlotConfig>(timeSlotConfig);
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [bookingDetails, setBookingDetails] = useState<any | null>(null);
  const [visitTypeFilter, setVisitTypeFilter] = useState<string>('ALL');
  const [roomFilter, setRoomFilter] = useState<string>('ALL');
  const [rooms, setRooms] = useState<{ id: string; name: string; type: string }[]>([]);
  const selectedRoom = useMemo(
    () => rooms.find((room) => room.id === roomFilter),
    [rooms, roomFilter]
  );
  const [refreshKey, setRefreshKey] = useState<number>(0);
  const [optimisticAppointment, setOptimisticAppointment] = useState<AppointmentInSlot | null>(null);
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
  const [pendingBookingSlot, setPendingBookingSlot] = useState<string>('');
  const [newPatientQuery, setNewPatientQuery] = useState<string | null>(null);

  useEffect(() => {
    void fetchRooms();
  }, []);

  useEffect(() => {
    if (!prefillPatientId) return;
    let cancelled = false;
    apiClient.getPatient(prefillPatientId)
      .then((patient) => { if (!cancelled) setSelectedPatient(patient as Patient); })
      .catch(() => toast({ variant: 'destructive', title: 'Patient not found', description: 'Search for the patient in the booking dialog instead.' }));
    return () => { cancelled = true; };
  }, [prefillPatientId, toast]);

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

  useEffect(() => {
    // Clear transient highlights when doctor/date changes
    setBookingDetails(null);
    setOptimisticAppointment(null);
    setRecentBookedSlot('');
    // Fetch rooms when doctor/date changes
    if (doctorId && date) {
      void fetchRooms();
    }
  }, [doctorId, date]);

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

  const fetchRooms = async () => {
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

  const handleBookingRequest = (slot: string) => {
    setPendingBookingSlot(slot);
    setBookingDialogOpen(true);
  };

  const handleBookingConfirm = async (appointmentData: { 
    visitType: 'OPD' | 'PROCEDURE' | 'TELEMED'; 
    roomId?: string;
    slot?: string;
    notes?: string;
  }) => {
    if (!selectedPatient) return;
    try {
      setLoading(true);
      
      // Create optimistic appointment immediately
      const selectedRoom = appointmentData.roomId 
        ? rooms.find(r => r.id === appointmentData.roomId) 
        : undefined;
        
      const optimisticPatient = {
        id: selectedPatient.id,
        name: formatPatientName(selectedPatient),
        phone: selectedPatient.phone,
        email: selectedPatient.email,
      };

      const finalSlot = appointmentData.slot || pendingBookingSlot;

      const optimisticAppt: AppointmentInSlot = {
        id: `optimistic-${finalSlot}`,
        slot: finalSlot,
        patient: optimisticPatient,
        doctor: doctor
          ? { id: doctor.id, firstName: doctor.firstName, lastName: doctor.lastName }
          : { id: doctorId, firstName: 'Dr.', lastName: 'Unknown' },
        visitType: appointmentData.visitType,
        room: selectedRoom ? { id: selectedRoom.id, name: selectedRoom.name, type: selectedRoom.type } : undefined,
        status: AppointmentStatus.SCHEDULED,
        notes: appointmentData.notes,
      };
      
      setOptimisticAppointment(optimisticAppt);
      
      const created: any = await apiClient.createAppointment({ 
        doctorId, 
        patientId: selectedPatient.id, 
        date, 
        slot: finalSlot, 
        visitType: appointmentData.visitType,
        roomId: appointmentData.roomId,
        notes: appointmentData.notes,
      });
      
      // Clear optimistic appointment and refresh with real data
      setOptimisticAppointment(null);
      setRefreshKey(prev => prev + 1);
      
      // Set success feedback and highlight newly booked slot
      setBookingDetails({ patient: optimisticPatient, ...created });
      setRecentBookedSlot(finalSlot);
      setSelectedPatient(null);
      
      // Refresh rooms after booking
      void fetchRooms();
      
      // Clear success message and highlight after 5 seconds
      setTimeout(() => {
        setBookingDetails(null);
        setRecentBookedSlot('');
      }, 5000);
      
      // Close dialog
      setBookingDialogOpen(false);
      setPendingBookingSlot('');
      
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
    setPendingBookingSlot('');
  };

  const currentDoctorName = doctor
    ? `Dr. ${doctor.firstName ?? ''} ${doctor.lastName ?? ''}`.trim()
    : 'the selected doctor';
  const isCurrentUserTheDoctor = googleStatus.connected && doctorGoogleStatus.connected
    && googleStatus.calendarId === doctorGoogleStatus.calendarId;

  return (
    <>
      <Card>
        <CardHeader className="space-y-2">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CalendarIcon className="h-5 w-5" /> 
                Doctor Calendar
              </CardTitle>
              <CardDescription>Click a free slot to book an appointment.</CardDescription>
            </div>
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
                      <span className="text-xs font-medium text-green-700">Syncing</span>
                    </div>
                    <Badge variant="outline" className="text-xs border-green-200 bg-green-50 text-green-700">
                      {googleStatus.email || googleStatus.calendarId || 'Connected'}
                    </Badge>
                    <Button variant="ghost" size="sm" className="text-xs text-gray-500 hover:text-red-600" onClick={disconnectGoogle} disabled={googleLoading}>
                      {googleLoading ? 'Disconnecting...' : 'Disconnect'}
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 border-gray-300"
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
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-sm text-gray-700">Visit Type</label>
              <Select value={visitTypeFilter} onValueChange={setVisitTypeFilter}>
                <SelectTrigger><SelectValue placeholder="All Types" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Types</SelectItem>
                  <SelectItem value="OPD">OPD Consultation</SelectItem>
                  <SelectItem value="PROCEDURE">Procedure</SelectItem>
                  <SelectItem value="TELEMED">Telemedicine</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-gray-700">Room</label>
              <Select value={roomFilter} onValueChange={setRoomFilter}>
                <SelectTrigger><SelectValue placeholder="All Rooms" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Rooms</SelectItem>
                  {rooms.map((room) => (
                    <SelectItem key={room.id} value={room.id}>{room.name} ({room.type})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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

          {selectedPatient && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                Booking for {formatPatientName(selectedPatient)} — {selectedPatient.phone}
              </Badge>
              <Button variant="outline" size="sm" onClick={() => setSelectedPatient(null)}>Clear</Button>
            </div>
          )}

          {/* Legend */}
          <div className="border rounded p-3 bg-gray-50">
            <h3 className="font-semibold mb-2">Legend</h3>
            <div className="flex flex-wrap gap-4 items-center">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(219, 234, 254, 0.95)' }} />
                <span className="text-sm">OPD</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(237, 233, 254, 0.95)' }} />
                <span className="text-sm">Procedure</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(243, 244, 246, 0.95)' }} />
                <span className="text-sm">Telemedicine</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(226, 232, 240, 0.95)' }} />
                <span className="text-sm">Completed</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(239, 246, 255, 0.95)' }} />
                <span className="text-sm">Past (OPD)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(245, 237, 254, 0.95)' }} />
                <span className="text-sm">Past (Procedure)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: '#22c55e' }} />
                <span className="text-sm">Newly Booked</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: '#fbbf24' }} />
                <span className="text-sm">Booking In Progress</span>
              </div>
            </div>
          </div>

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
                  <p className="font-medium">Appointment Successfully Booked!</p>
                  <p style={{ color: '#16a34a' }}>
                    {bookingDetails.patient?.name} 
                    {' '} scheduled for {bookingDetails.slot}
                    {bookingDetails.room && ` in ${bookingDetails.room.name}`}
                    {bookingDetails.visitType && ` (${bookingDetails.visitType})`}
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
            bookingInProgress={loading ? pendingBookingSlot : undefined}
            optimisticAppointment={optimisticAppointment || undefined}
            onAppointmentUpdate={() => setRefreshKey(prev => prev + 1)}
            selectedRoomName={selectedRoom?.name}
            timeSlotConfig={{ ...slotConfig, stepMinutes: Math.max(10, gridMinutes) }}
          />
        </CardContent>
      </Card>

      <AppointmentBookingDialog
        open={bookingDialogOpen}
        onOpenChange={setBookingDialogOpen}
        doctorId={doctorId}
        date={date}
        slot={pendingBookingSlot}
        patient={selectedPatient}
        onPatientChange={setSelectedPatient}
        onAddNewPatient={setNewPatientQuery}
        onConfirm={handleBookingConfirm}
        onCancel={handleBookingCancel}
      />

      <PatientQuickCreateDialog
        open={newPatientQuery !== null}
        onOpenChange={(open: boolean) => { if (!open) setNewPatientQuery(null); }}
        initialName={newPatientQuery && !/^[+\d\s-]+$/.test(newPatientQuery) ? newPatientQuery : undefined}
        initialPhone={newPatientQuery && /^[+\d\s-]+$/.test(newPatientQuery) ? newPatientQuery : undefined}
        onPatientCreated={(patient) => {
          setSelectedPatient(patient);
          setNewPatientQuery(null);
        }}
      />
    </>
  );
} 