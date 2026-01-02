'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { apiClient } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { createCleanupTimeouts, getISTDateString, formatPatientName } from '@/lib/utils';
import type { User, Patient, TimeSlotConfig, AppointmentInSlot } from '@/lib/types';
import DoctorDayCalendar from '@/components/appointments/DoctorDayCalendar';
import { Badge } from '@/components/ui/badge';
import AppointmentBookingDialog from './AppointmentBookingDialog';
import PatientQuickCreateDialog from './PatientQuickCreateDialog';
import { AlertCircle, Info } from 'lucide-react';
import { AppointmentStatus } from '@cms/shared-types';

interface AppointmentsCalendarProps {
  timeSlotConfig?: TimeSlotConfig;
  prefillPatientId?: string;
  controlledDoctorId?: string;
  controlledDate?: string;
  hideHeaderControls?: boolean;
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
}: AppointmentsCalendarProps) {
  const { toast } = useToast();
  const [date, setDate] = useState<string>(getISTDateString());
  const [doctorId, setDoctorId] = useState<string>('');
  const [patientSearch, setPatientSearch] = useState<string>('');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<User[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  // const [error, setError] = useState<string | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [bookingDetails, setBookingDetails] = useState<any | null>(null);
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
  const [optimisticAppointment, setOptimisticAppointment] = useState<AppointmentInSlot | null>(null);
  const [gridMinutes, setGridMinutes] = useState<number>(30);
  const [recentBookedSlot, setRecentBookedSlot] = useState<string>('');
  const [googleStatus, setGoogleStatus] = useState<{ connected: boolean; calendarId?: string | null; email?: string | null }>({
    connected: false,
  });
  const [googleLoading, setGoogleLoading] = useState<boolean>(false);

  // Booking dialog state
  const [bookingDialogOpen, setBookingDialogOpen] = useState<boolean>(false);
  const [pendingBookingSlot, setPendingBookingSlot] = useState<string>('');
  const [quickCreateOpen, setQuickCreateOpen] = useState<boolean>(false);
  const [autoPromptedForSearch, setAutoPromptedForSearch] = useState<boolean>(false);

  const cleanupTimeouts = useMemo(() => createCleanupTimeouts(), []);

  useEffect(() => {
    void fetchDoctors();
    void fetchRooms();
  }, []);

  useEffect(() => {
    if (prefillPatientId) {
      setSelectedPatientId(prefillPatientId);
    }
  }, [prefillPatientId]);

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
  }, [doctorId, date]);

  useEffect(() => {
    void fetchGoogleStatus();
  }, []);

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
    try {
      const res: any = await apiClient.getRooms();
      setRooms(res.rooms || []);
    } catch (e) {
      console.error('Failed to fetch rooms', e);
    }
  };

  const fetchGoogleStatus = async () => {
    try {
      const res: any = await apiClient.getGoogleCalendarStatus();
      setGoogleStatus({
        connected: !!res?.connected,
        calendarId: res?.calendarId ?? null,
        email: res?.email ?? null,
      });
    } catch (e) {
      console.error('Failed to fetch Google Calendar status', e);
    }
  };

  const startGoogleConnect = async () => {
    try {
      setGoogleLoading(true);
      const redirectTarget = typeof window !== 'undefined' ? window.location.href : '/dashboard/appointments';
      const res = await apiClient.getGoogleCalendarAuthUrl(redirectTarget);
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

  const handleBookingRequest = (slot: string) => {
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

    setPendingBookingSlot(slot);
    setBookingDialogOpen(true);
  };

  const handleBookingConfirm = async (appointmentData: { 
    visitType: 'OPD' | 'PROCEDURE' | 'TELEMED'; 
    roomId?: string;
    slot?: string;
  }) => {
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

      const finalSlot = appointmentData.slot || pendingBookingSlot;

      const optimisticAppt: AppointmentInSlot = {
        id: `optimistic-${finalSlot}`,
        slot: finalSlot,
        patient: optimisticPatient,
        doctor: optimisticDoctor
          ? { id: optimisticDoctor.id, firstName: optimisticDoctor.firstName, lastName: optimisticDoctor.lastName }
          : { id: doctorId, firstName: 'Dr.', lastName: 'Unknown' },
        visitType: appointmentData.visitType,
        room: selectedRoom ? { id: selectedRoom.id, name: selectedRoom.name, type: selectedRoom.type } : undefined,
        status: AppointmentStatus.SCHEDULED,
      };
      
      setOptimisticAppointment(optimisticAppt);
      
      const created: any = await apiClient.createAppointment({ 
        doctorId, 
        patientId: selectedPatientId, 
        date, 
        slot: finalSlot, 
        visitType: appointmentData.visitType,
        roomId: appointmentData.roomId
      });
      
      // Clear optimistic appointment and refresh with real data
      setOptimisticAppointment(null);
      setRefreshKey(prev => prev + 1);
      
      // Set success feedback and highlight newly booked slot
      setBookingDetails(created);
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
              <CardDescription>Daily calendar for selected doctor. Click an empty slot to schedule.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {googleStatus.connected ? (
                <>
                  <Badge variant="secondary">
                    Google Calendar connected {googleStatus.calendarId ? `(${googleStatus.calendarId})` : ''}
                  </Badge>
                  <Button variant="outline" size="sm" onClick={disconnectGoogle} disabled={googleLoading}>
                    {googleLoading ? 'Disconnecting...' : 'Disconnect'}
                  </Button>
                </>
              ) : (
                <Button size="sm" onClick={startGoogleConnect} disabled={googleLoading}>
                  {googleLoading ? 'Opening Google...' : 'Connect Google Calendar'}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            {!hideHeaderControls && (
              <>
                <div>
                  <label className="text-sm text-gray-700">Doctor</label>
                  <Select value={doctorId} onValueChange={setDoctorId}>
                    <SelectTrigger><SelectValue placeholder="Select doctor" /></SelectTrigger>
                    <SelectContent>
                      {doctors.map((d) => (<SelectItem key={d.id} value={d.id}>{d.firstName} {d.lastName}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm text-gray-700">Date</label>
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
              </>
            )}
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
              <label className="text-sm text-gray-700">Patient</label>
              <Input placeholder="Search patient by name/phone" value={patientSearch} onChange={(e) => { setSelectedPatientId(''); setSelectedPatient(null); void searchPatients(e.target.value); }} />
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
                Selected: {selectedPatient.firstName} {selectedPatient.lastName} — {selectedPatient.phone}
              </Badge>
              <Button variant="outline" size="sm" onClick={() => { setSelectedPatientId(''); setSelectedPatient(null); setPatientSearch(''); setPatients([]); setQuickCreateOpen(false); }}>Clear</Button>
            </div>
          )}

          {!selectedPatientId && patientSearch && (
            <div className="flex items-center gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              <AlertCircle className="h-4 w-4" />
              <span>Select a patient from the list or add them as new before booking.</span>
            </div>
          )}

          {patientSearch && patients.length > 0 && (
            <div className="max-h-40 overflow-auto border rounded">
              {patients.map((p) => (
                <div
                  key={p.id}
                  className="px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer"
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
                </div>
              ))}
            </div>
          )}

          {patientSearch && patients.length === 0 && !selectedPatientId && !searchingPatients && (
            <div className="rounded border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
              <div className="flex items-center justify-between">
                <span>No matching patients found.</span>
                <Button variant="outline" size="sm" onClick={() => setQuickCreateOpen(true)}>
                  + Add "{patientSearch}" as a new patient
                </Button>
              </div>
            </div>
          )}
          {patientSearch && !patients.length && !quickCreateOpen && !selectedPatientId && !searchingPatients && (
            <div className="text-xs text-gray-500">
              Tip: enter patient name and phone, then use "Add" to create a new record instantly.
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
                    {bookingDetails.patient?.name || `${selectedPatient?.firstName ?? ''} ${selectedPatient?.lastName ?? ''}`.trim()} 
                    {' '} scheduled for {bookingDetails.slot}
                    {bookingDetails.room && ` in ${bookingDetails.room.name}`}
                    {bookingDetails.visitType && ` (${bookingDetails.visitType})`}
                  </p>
                </div>
              </div>
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
            disableSlotBooking={!selectedPatientId}
            selectedRoomName={selectedRoom?.name}
            timeSlotConfig={{ ...timeSlotConfig, stepMinutes: Math.max(10, gridMinutes) }}
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
        onConfirm={handleBookingConfirm}
        onCancel={handleBookingCancel}
      />

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