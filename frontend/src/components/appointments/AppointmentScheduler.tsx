'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { apiClient } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { isSlotInPast, getErrorMessage, formatPatientName, createCleanupTimeouts, getISTDateString, validateAppointmentForm, getConflictSuggestions, isConflictError, getConflictDetails, doTimeSlotsOverlap, generateTimeSlots, addMinutesToHHMM, getSlotDurationMinutes } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import type { User, Patient, AppointmentInSlot, AvailableSlot, TimeSlotConfig, GetUsersResponse, GetPatientsResponse, GetRoomsResponse, GetAvailableSlotsResponse, GetDoctorScheduleResponse, VisitType, Appointment } from '@/lib/types';
import AppointmentBookingDialog from './AppointmentBookingDialog';
import PatientQuickCreateDialog from './PatientQuickCreateDialog';
import { AlertCircle, Info } from 'lucide-react';
import DoctorDayCalendar from './DoctorDayCalendar';
import { AppointmentStatus } from '@cms/shared-types';
import PatientProgressTracker from '@/components/patients/PatientProgressTracker';

// Stable fallback to avoid recreating default objects each render
const DEFAULT_TIME_SLOT_CONFIG: TimeSlotConfig = {
  startHour: 9,
  endHour: 18,
  stepMinutes: 30,
  timezone: 'Asia/Kolkata'
};

interface AppointmentSchedulerProps {
  timeSlotConfig?: TimeSlotConfig;
  prefillPatientId?: string;
  controlledDoctorId?: string;
  controlledDate?: string;
  hideHeaderControls?: boolean;
}

export default function AppointmentScheduler({ 
  timeSlotConfig,
  prefillPatientId,
  controlledDoctorId,
  controlledDate,
  hideHeaderControls,
}: AppointmentSchedulerProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [slotConfig, setSlotConfig] = useState<TimeSlotConfig>(timeSlotConfig ?? DEFAULT_TIME_SLOT_CONFIG);
  const [date, setDate] = useState<string>(getISTDateString());
  const [doctorId, setDoctorId] = useState<string>('');
  const [patientSearch, setPatientSearch] = useState<string>('');
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [visitTypeFilter, setVisitTypeFilter] = useState<string>('ALL');
  const [roomFilter, setRoomFilter] = useState<string>('ALL');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<User[]>([]);
  // We derive available start times locally to allow mixed-duration bookings
  const [appointments, setAppointments] = useState<AppointmentInSlot[]>([]);
  const [appointmentsBySlot, setAppointmentsBySlot] = useState<Record<string, AppointmentInSlot>>({});
  const [rooms, setRooms] = useState<{ id: string; name: string; type: string }[]>([]);
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentInSlot | null>(null);
  const [bookingDetails, setBookingDetails] = useState<any | null>(null);
  const [optimisticAppointment, setOptimisticAppointment] = useState<AppointmentInSlot | undefined>(undefined);
  const [recentBookedSlot, setRecentBookedSlot] = useState<string>('');
  const [isBooking, setIsBooking] = useState<boolean>(false);
  const [bookingSlot, setBookingSlot] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searchingPatients, setSearchingPatients] = useState<boolean>(false);
  const [rescheduleContext, setRescheduleContext] = useState<{ appointment: AppointmentInSlot; originalDate: string } | null>(null);
  const [rescheduleLoading, setRescheduleLoading] = useState<boolean>(false);
  const [refreshKey, setRefreshKey] = useState(0);
  
  // Booking dialog state
  const [bookingDialogOpen, setBookingDialogOpen] = useState<boolean>(false);
  // Grid-level duration selector for preview and click actions
  const [gridDurationMinutes, setGridDurationMinutes] = useState<number>(slotConfig.stepMinutes);
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
  
  // Keep internal slot config in sync if parent changes defaults, without causing loops
  useEffect(() => {
    if (!timeSlotConfig) return;
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
  }, [timeSlotConfig]);

  // Auto-apply doctor working hours to slotConfig when doctor/date changes
  useEffect(() => {
    const applyHours = async () => {
      if (!doctorId || !date) return;
      try {
        const res: any = await apiClient.getUser(doctorId);
        const meta = (res?.metadata && typeof res.metadata === 'object') ? res.metadata : (res?.metadata ? JSON.parse(res.metadata) : {});
        const wh = meta?.workingHours;
        if (!wh) return;
        const tz = 'Asia/Kolkata';
        const noonUtc = new Date(`${date}T12:00:00.000Z`);
        const localNoon = new Date(noonUtc.toLocaleString('en-US', { timeZone: tz }));
        const dayKey = ['sun','mon','tue','wed','thu','fri','sat'][localNoon.getDay()];
        const byDay = wh?.byDay?.[dayKey] || {};
        const startHour = Number.isInteger(byDay?.startHour) ? byDay.startHour : wh?.startHour;
        const endHour = Number.isInteger(byDay?.endHour) ? byDay.endHour : wh?.endHour;
        setSlotConfig((prev) => ({
          ...prev,
          ...(Number.isInteger(startHour) ? { startHour } : {}),
          ...(Number.isInteger(endHour) ? { endHour } : {}),
        }));
      } catch {}
    };
    void applyHours();
  }, [doctorId, date]);
  const [pendingBookingSlot, setPendingBookingSlot] = useState<string>('');
  const [quickCreateOpen, setQuickCreateOpen] = useState<boolean>(false);
  const [autoPromptedForSearch, setAutoPromptedForSearch] = useState<boolean>(false);

  const cleanupTimeouts = useMemo(() => createCleanupTimeouts(), []);
  // Keep grid duration in sync with header duration when it changes
  useEffect(() => {
    if (typeof slotConfig.stepMinutes === 'number') {
      setGridDurationMinutes(slotConfig.stepMinutes);
    }
  }, [slotConfig.stepMinutes]);

  useEffect(() => {
    void fetchDoctors();
    void fetchRooms();
  }, []);

  useEffect(() => {
    if (doctorId && date) {
      void fetchSlots();
    }
  }, [doctorId, date, refreshKey, slotConfig.startHour, slotConfig.endHour, slotConfig.stepMinutes]);

  useEffect(() => {
    // Clear transient highlights when doctor/date changes
    setRecentBookedSlot('');
    setBookingDetails(null);
    setError(null);
  }, [doctorId, date]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      cleanupTimeouts.clearAll();
    };
  }, [cleanupTimeouts]);

  const fetchDoctors = useCallback(async () => {
    try {
      setLoading(true);
      const res: GetUsersResponse = await apiClient.getUsers({ limit: 100 });
      const list: User[] = (res.users || []).filter((u: User) => u.role === 'DOCTOR');
      setDoctors(list);
      if (list[0]?.id) setDoctorId(list[0].id);
    } catch (e) {
      const errorMessage = getErrorMessage(e);
      setError(errorMessage);
      toast({
        variant: "destructive",
        title: "Failed to fetch doctors",
        description: errorMessage,
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const fetchRooms = useCallback(async () => {
    try {
      const res: GetRoomsResponse = await apiClient.getRooms();
      setRooms(res.rooms || []);
    } catch (e) {
      const errorMessage = getErrorMessage(e);
      toast({
        variant: "destructive",
        title: "Failed to fetch rooms",
        description: errorMessage,
      });
    }
  }, [toast]);

  const fetchSlots = useCallback(async () => {
    if (!doctorId || !date) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const scheduleRes: GetDoctorScheduleResponse = await apiClient.getDoctorSchedule(doctorId, date);
      const scheduleAppointments: Appointment[] = Array.isArray(scheduleRes?.appointments) ? scheduleRes.appointments : [];
      const appts: AppointmentInSlot[] = scheduleAppointments
        .filter((a: Appointment) => (a.status as AppointmentStatus) !== AppointmentStatus.CANCELLED)
        .map((a: Appointment) => ({
        id: a.id,
        slot: a.slot,
        patient: a.patient ? {
          id: a.patient.id,
          name: formatPatientName(a.patient),
          phone: a.patient.phone,
          email: a.patient.email
        } : { id: '', name: 'Unknown Patient' },
        doctor: a.doctor || { firstName: 'Dr.', lastName: 'Unknown' },
        visitType: a.visitType || 'OPD',
        room: a.room,
        status: (a.status as AppointmentStatus) || AppointmentStatus.SCHEDULED,
        visit: a.visit ? { id: a.visit.id, status: a.visit.status ?? undefined } : undefined,
      }));
      
      setAppointments(appts);
      
      const bySlot: Record<string, AppointmentInSlot> = {};
      appts.forEach(a => { bySlot[a.slot] = a; });
      setAppointmentsBySlot(bySlot);
    } catch (e) {
      const errorMessage = getErrorMessage(e);
      setError(errorMessage);
      toast({
        variant: "destructive",
        title: "Failed to fetch slots",
        description: errorMessage,
      });
    } finally {
      setLoading(false);
    }
  }, [doctorId, date, slotConfig.startHour, slotConfig.endHour, slotConfig.stepMinutes, toast]);

  const searchPatients = useCallback(async (q: string) => {
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
      const res: GetPatientsResponse = await apiClient.getPatients({ search: q, limit: 10 });
      const patientsData = res.data || res.patients || [];

      setPatients(patientsData.map((p) => ({
        ...p,
        name: formatPatientName(p),
        firstName: p.firstName || p.name?.split(' ')[0] || '',
        lastName: p.lastName || p.name?.split(' ').slice(1).join(' ') || '',
      })));

      if (patientsData.length === 0 && !autoPromptedForSearch) {
        setQuickCreateOpen(true);
        setAutoPromptedForSearch(true);
      }
      if (patientsData.length > 0) {
        setQuickCreateOpen(false);
        setAutoPromptedForSearch(false);
      }
      setSearchingPatients(false);
    } catch (e) {
      const errorMessage = getErrorMessage(e);
      toast({
        variant: "destructive",
        title: "Failed to search patients",
        description: errorMessage,
      });
      setSearchingPatients(false);
    }
  }, [autoPromptedForSearch, toast]);

  const handleBookingRequest = (slot: string) => {
    // Validate the appointment form
    const validationErrors = validateAppointmentForm({
      doctorId,
      patientId: selectedPatientId,
      date,
      slot,
      visitType: 'OPD' // Default for initial validation
    });
    
    if (validationErrors.length > 0) {
      const hasPatientError = validationErrors.includes('Please select a patient');

      toast({
        variant: "destructive",
        title: "Validation Error",
        description: validationErrors[0],
      });

      if (hasPatientError) {
        setQuickCreateOpen(true);
      }
      return;
    }
    
    setPendingBookingSlot(slot);
    setBookingSlot(slot);
    setBookingDialogOpen(true);
  };

  const handleBookingConfirm = async (appointmentData: { 
    visitType: VisitType; 
    roomId?: string;
    slot?: string;
  }) => {
    try {
      setIsBooking(true);
      const finalSlot = appointmentData.slot || pendingBookingSlot;
      const created = await apiClient.createAppointment({ 
        doctorId, 
        patientId: selectedPatientId, 
        date, 
        slot: finalSlot, 
        visitType: appointmentData.visitType,
        roomId: appointmentData.roomId
      });
      
      // Success toast
      toast({
        variant: "success",
        title: "Appointment Booked Successfully",
        description: `${formatPatientName(selectedPatient)} scheduled for ${finalSlot}`,
      });
      
      // Optimistic UI update with better error handling
      const newAppt: AppointmentInSlot = {
        id: created.id || 'temp',
        slot: finalSlot,
        patient: selectedPatient ? {
          id: selectedPatient.id,
          name: formatPatientName(selectedPatient),
          phone: selectedPatient.phone,
          email: selectedPatient.email,
        } : { id: selectedPatientId, name: 'Unknown Patient' },
        doctor: created.doctor || { firstName: 'Dr.', lastName: 'Unknown' },
        visitType: appointmentData.visitType,
        room: created.room,
        status: AppointmentStatus.SCHEDULED,
        visit: created.visit ? { id: created.visit.id, status: created.visit.status } : undefined,
      };
      
      setAppointments(prev => [...prev, newAppt]);
      setAppointmentsBySlot(prev => ({ ...prev, [pendingBookingSlot]: newAppt }));
      setOptimisticAppointment(newAppt);
      
      setRecentBookedSlot(finalSlot);
      setBookingDetails(created);
      
      // Use cleanup timeout management
      const timeoutId = setTimeout(() => {
        setBookingDetails(null);
        setRecentBookedSlot('');
      }, 5000);
      cleanupTimeouts.addTimeout(timeoutId);
      
      // Close dialog
      setBookingDialogOpen(false);
      setPendingBookingSlot('');
      setBookingSlot('');
      setRefreshKey(prev => prev + 1);
      
    } catch (e: any) {
      if (isConflictError(e)) {
        const suggestions = getConflictSuggestions(e);
        const details = getConflictDetails(e);
        const base = getErrorMessage(e) || 'Scheduling conflict detected';
        const detailText = details.length ? `\n• ${details.join('\n• ')}` : '';
        const suggestionText = suggestions.length ? ` — Try: ${suggestions.join(', ')}` : '';
        toast({
          variant: "destructive",
          title: "Scheduling Conflict",
          description: `${base}${suggestionText}${detailText}`,
        });
        return;
      }
      
      const errorMessage = getErrorMessage(e);
      toast({
        variant: "destructive",
        title: "Failed to book appointment",
        description: errorMessage,
      });
    } finally {
      setIsBooking(false);
      setBookingSlot('');
    }
  };

  const handleBookingCancel = () => {
    setBookingDialogOpen(false);
    setPendingBookingSlot('');
    setBookingSlot('');
  };

  const startReschedule = (appointment: AppointmentInSlot) => {
    if (!appointment.id) return;
    setRescheduleContext({ appointment, originalDate: date });
    // Auto-select patient and doctor to simplify reschedule flow
    if (appointment.patient?.id) {
      setSelectedPatientId(appointment.patient.id);
      setSelectedPatient({
        ...(appointment.patient as any),
        name: appointment.patient.name,
      } as Patient);
      setPatientSearch(`${formatPatientName(appointment.patient)}${appointment.patient.phone ? ` — ${appointment.patient.phone}` : ''}`);
    }
    if (appointment.doctor && (appointment as any).doctor.id) {
      setDoctorId((appointment as any).doctor.id);
    }
    // Jump calendar date to the appointment's date if different
    if (rescheduleContext?.originalDate !== date) {
      // keep existing date; if appointment date available in context, prefer it
    }
  };

  const cancelReschedule = () => {
    setRescheduleContext(null);
    setRescheduleLoading(false);
  };

  const handleRescheduleSlotSelect = useCallback(async (newSlot: string) => {
    if (!rescheduleContext || !rescheduleContext.appointment.id || rescheduleLoading) return;

    const targetDate = date;
    if (newSlot === rescheduleContext.appointment.slot && targetDate === rescheduleContext.originalDate) {
      toast({
        variant: "default",
        title: "No changes made",
        description: "The appointment is already scheduled for this slot.",
      });
      cancelReschedule();
      return;
    }

    setRescheduleLoading(true);
    try {
      await apiClient.rescheduleAppointment(rescheduleContext.appointment.id, {
        date: targetDate,
        slot: newSlot,
        roomId: rescheduleContext.appointment.room?.id,
      });

      toast({
        variant: "success",
        title: "Appointment rescheduled",
        description: `${formatPatientName(rescheduleContext.appointment.patient)} moved to ${newSlot} on ${targetDate}`,
      });

      setRescheduleContext(null);
      setRecentBookedSlot(newSlot);
      await fetchSlots();
      setOptimisticAppointment(undefined);
      setRefreshKey(prev => prev + 1);
    } catch (e: any) {
      if (isConflictError(e)) {
        const suggestions = getConflictSuggestions(e);
        const details = getConflictDetails(e);
        const base = getErrorMessage(e) || 'Scheduling conflict detected';
        const detailText = details.length ? `\n• ${details.join('\n• ')}` : '';
        const suggestionText = suggestions.length ? ` — Try: ${suggestions.join(', ')}` : '';
        toast({
          variant: "destructive",
          title: "Scheduling Conflict",
          description: `${base}${suggestionText}${detailText}`,
        });
      } else {
        const errorMessage = getErrorMessage(e);
        toast({
          variant: "destructive",
          title: "Failed to reschedule appointment",
          description: errorMessage,
        });
      }
    } finally {
      setRescheduleLoading(false);
    }
  }, [rescheduleContext, rescheduleLoading, date, fetchSlots, toast]);

  // Filter appointments based on status, visitType and room
  const filteredAppointments = appointments.filter(apt => {
    if (apt.status === AppointmentStatus.CANCELLED) return false;
    const visitTypeMatch = visitTypeFilter === 'ALL' || apt.visitType === visitTypeFilter;
    const roomMatch = roomFilter === 'ALL' || apt.room?.id === roomFilter;
    return visitTypeMatch && roomMatch;
  });

  const filteredAppointmentsBySlot = Object.fromEntries(
    Object.entries(appointmentsBySlot).filter(([_, apt]) => {
      if (apt.status === AppointmentStatus.CANCELLED) return false;
      const visitTypeMatch = visitTypeFilter === 'ALL' || apt.visitType === visitTypeFilter;
      const roomMatch = roomFilter === 'ALL' || apt.room?.id === roomFilter;
      return visitTypeMatch && roomMatch;
    })
  );

  const booked = filteredAppointments.map(a => a.slot);

  // Build a base grid (10-minute resolution) so users can choose any start time,
  // and then pick duration in the booking dialog
  const baseGridSlots = useMemo(() => generateTimeSlots({
    startHour: slotConfig.startHour,
    endHour: slotConfig.endHour,
    stepMinutes: 10,
    timezone: slotConfig.timezone,
  }), [slotConfig.startHour, slotConfig.endHour, slotConfig.timezone]);

  const handleStartVisit = async (appointment: AppointmentInSlot) => {
    try {
      console.log('🚀 Starting visit for appointment:', appointment);
      console.log('📋 Patient data:', {
        id: appointment.patient.id,
        name: appointment.patient.name,
        phone: appointment.patient.phone
      });
      
      // Validate IDs
      const pid = appointment.patient.id as string | undefined;
      const did = (appointment.doctor?.id || doctorId) as string | undefined;
      if (!pid || !did) {
        console.warn('[AppointmentScheduler] Missing IDs when starting visit', { pid, did, appointmentId: appointment.id });
        toast({
          variant: 'destructive',
          title: 'Invalid IDs',
          description: 'Patient or Doctor ID is missing. Please refresh and try again.',
        });
        return;
      }

      // Auto-create visit if doesn't exist
      if (!appointment.visit) {
        const visitPayload = {
          patientId: pid,
          doctorId: did,
          appointmentId: appointment.id,
          complaints: [{ complaint: 'General consultation' }],
        };
        
        console.log('💾 Creating new visit with payload:', visitPayload);
        const newVisit = await apiClient.createVisit(visitPayload);
        console.log('✅ New visit created:', newVisit);
        
        // Navigate to visit form with pre-populated data
        const visitUrl = `/dashboard/visits?visitId=${(newVisit as any).id}&patientId=${appointment.patient.id}&appointmentId=${appointment.id}&autoStart=true`;
        router.push(visitUrl);
      } else {
        // Navigate to existing visit
        const visitUrl = `/dashboard/visits?visitId=${appointment.visit.id}&patientId=${appointment.patient.id}&appointmentId=${appointment.id}`;
        router.push(visitUrl);
      }
    } catch (error) {
      console.error('Failed to start visit:', error);
      toast({
        variant: "destructive",
        title: "Failed to start visit",
        description: "Please try again or create the visit manually.",
      });
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">Appointment Scheduler</CardTitle>
          <CardDescription>Select a doctor and date to view available appointment slots</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
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
              <label className="text-sm text-gray-700">Duration</label>
              <Select
                value={String(slotConfig.stepMinutes)}
                onValueChange={(v: string) => {
                  const m = parseInt(v, 10);
                  if (!Number.isNaN(m)) {
                    setSlotConfig((prev) => ({ ...prev, stepMinutes: m }));
                  }
                }}
              >
                <SelectTrigger><SelectValue placeholder="Select duration" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 minutes</SelectItem>
                  <SelectItem value="15">15 minutes</SelectItem>
                  <SelectItem value="20">20 minutes</SelectItem>
                  <SelectItem value="30">30 minutes</SelectItem>
                  <SelectItem value="45">45 minutes</SelectItem>
                  <SelectItem value="60">60 minutes</SelectItem>
                  <SelectItem value="90">90 minutes</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-sm text-gray-700">Patient</label>
            <Input 
              placeholder="Search patient by name/phone" 
              value={patientSearch} 
              onChange={(e) => { 
                setSelectedPatientId(''); 
                setSelectedPatient(null); 
                void searchPatients(e.target.value); 
              }} 
            />
            {selectedPatient && (
              <div className="mt-2 rounded border border-green-200 bg-green-50 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-green-800">✓ Selected Patient</div>
                    <div className="text-green-700 font-medium">{formatPatientName(selectedPatient)}</div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-green-600">
                      <span>ID: {selectedPatient.id}</span>
                      {selectedPatient.phone && <span>📞 {selectedPatient.phone}</span>}
                      {selectedPatient.email && <span>✉️ {selectedPatient.email}</span>}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedPatientId('');
                      setSelectedPatient(null);
                      setPatientSearch('');
                      setPatients([]);
                      setQuickCreateOpen(false);
                    }}
                  >
                    Clear
                  </Button>
                </div>
              </div>
            )}

            {!selectedPatientId && patientSearch && (
              <div className="mt-2 flex items-center gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                <AlertCircle className="h-4 w-4" />
                <span>Select a patient from the list or add them as new before booking a slot.</span>
              </div>
            )}

            {patientSearch && patients.length > 0 && (
              <div className="mt-2 max-h-40 overflow-auto border rounded">
                {patients.map((p) => (
                  <div
                    key={p.id}
                    className="px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer"
                    onClick={() => {
                      setPatientSearch(`${formatPatientName(p)} — ${p.phone}`);
                      setSelectedPatientId(p.id);
                      setSelectedPatient(p);
                      setPatients([]);
                      setQuickCreateOpen(false);
                      setAutoPromptedForSearch(false);
                    }}
                  >
                    <div className="font-medium">{formatPatientName(p)}</div>
                    <div className="text-xs text-gray-500 flex items-center gap-3">
                      <span>ID: {p.id}</span>
                      {p.phone && <span>📞 {p.phone}</span>}
                      {p.email && <span>✉️ {p.email}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {patientSearch && patients.length === 0 && !selectedPatientId && !searchingPatients && (
              <div className="mt-2 flex flex-col gap-2 rounded border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                <div>No matching patients found.</div>
                <Button variant="outline" size="sm" onClick={() => setQuickCreateOpen(true)}>
                  + Add "{patientSearch}" as a new patient
                </Button>
              </div>
            )}
            {patientSearch && !patients.length && !quickCreateOpen && !selectedPatientId && !searchingPatients && (
              <div className="mt-2 text-xs text-gray-500">
                Tip: enter patient name and phone, then use "Add" to create a new record instantly.
              </div>
            )}
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
                    {bookingDetails.patient?.name || selectedPatient?.name || 'Unknown Patient'} 
                    {' '} scheduled for {bookingDetails.slot}
                    {bookingDetails.room && ` in ${bookingDetails.room.name}`}
                    {bookingDetails.visitType && ` (${bookingDetails.visitType})`}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Unified calendar-only view; legacy slots grid removed for consistency */}
        </CardContent>
      </Card>

      <DoctorDayCalendar
        doctorId={doctorId}
        date={date}
        recentBookedSlot={recentBookedSlot}
        visitTypeFilter={visitTypeFilter}
        roomFilter={roomFilter}
        onSelectSlot={handleBookingRequest}
        refreshKey={refreshKey}
        bookingInProgress={isBooking ? bookingSlot : undefined}
        onAppointmentUpdate={() => setRefreshKey((prev) => prev + 1)}
        timeSlotConfig={slotConfig}
        disableSlotBooking={!selectedPatientId && !rescheduleContext}
        optimisticAppointment={optimisticAppointment}
      />

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
          setSelectedPatient(patient);
          setSelectedPatientId(patient.id);
          setPatientSearch(`${formatPatientName(patient)}${patient.phone ? ` — ${patient.phone}` : ''}`);
          setPatients([]);
          setQuickCreateOpen(false);
          setAutoPromptedForSearch(false);
        }}
      />
    </>
  );
} 