'use client';

import { displayCalendarDate } from '@/lib/date-display';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { apiClient } from '@/lib/api';
import { track } from '@/lib/analytics';
import { usePrefilledPatient } from './usePrefilledPatient';
import { gridHoursFor, loadDoctorDay, describeBlock, type DoctorDay } from '@/lib/doctor-availability';
import { useToast } from '@/hooks/use-toast';
import { isSlotInPast, getErrorMessage, formatPatientName, createCleanupTimeouts, getISTDateString, validateAppointmentForm, getConflictSuggestions, isConflictError, getConflictDetails, doTimeSlotsOverlap, generateTimeSlots, addMinutesToHHMM, getSlotDurationMinutes } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import type { User, Patient, AppointmentInSlot, AppointmentCalendar, AvailableSlot, TimeSlotConfig, GetUsersResponse, GetPatientsResponse, GetRoomsResponse, GetAvailableSlotsResponse, GetDoctorScheduleResponse, VisitType, Appointment } from '@/lib/types';
import AppointmentBookingDialog from './AppointmentBookingDialog';
import PatientQuickCreateDialog from './PatientQuickCreateDialog';
import { AlertCircle, Info } from 'lucide-react';
import DoctorDayCalendar, { type ScopedAppointment } from './DoctorDayCalendar';
import { useOverbookConfirm } from './useOverbookConfirm';
import { overbookFlag } from '@/lib/overbooking';
import { AppointmentStatus } from '@cms/shared-types';
import PatientProgressTracker from '@/components/patients/PatientProgressTracker';
import { CALENDARS, type SlotChoice } from './appointment-calendars';
import { enumLabel } from '@/lib/labels';

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

/**
 * @cc [owner:nareshshah139,label:product] optimistic-appointment-scope
 * A booking response cannot display its optimistic appointment under a different doctor or date.
 */
export default function AppointmentScheduler({ 
  timeSlotConfig,
  prefillPatientId,
  controlledDoctorId,
  controlledDate,
  hideHeaderControls,
}: AppointmentSchedulerProps) {
  const { toast } = useToast();
  const { sendWithOverbookConfirm, overbookDialog } = useOverbookConfirm();
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
  const [optimisticAppointment, setOptimisticAppointment] = useState<ScopedAppointment | undefined>(undefined);
  const [recentBookedSlot, setRecentBookedSlot] = useState<string>('');
  const [isBooking, setIsBooking] = useState<boolean>(false);
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
  usePrefilledPatient(prefillPatientId, selectedPatientId, setSelectedPatientId, setSelectedPatient);

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
  const [pendingBooking, setPendingBooking] = useState<SlotChoice | null>(null);
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
      if (list[0]?.id) setDoctorId((current) => current || list[0].id);
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
      const scheduleAppointments = Array.isArray(scheduleRes?.appointments) ? scheduleRes.appointments : [];
      const appts: AppointmentInSlot[] = scheduleAppointments
        .filter((a: Appointment) => (a.status as AppointmentStatus) !== AppointmentStatus.CANCELLED)
        .map((a) => ({
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
        calendar: a.calendar,
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

  const handleBookingRequest = (slot: string, calendar: AppointmentCalendar) => {
    if (!selectedPatient || selectedPatient.id !== selectedPatientId) {
      toast({ variant: 'destructive', title: 'Patient required', description: 'Select a patient before booking.' });
      return;
    }
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
    
    setPendingBooking({ slot, calendar });
    setBookingDialogOpen(true);
  };

  const handleBookingConfirm = async (appointmentData: { 
    visitType: VisitType; 
    roomId?: string;
    slot?: string;
  }) => {
    if (!pendingBooking) return;
    const { calendar } = pendingBooking;
    try {
      setIsBooking(true);
      const finalSlot = appointmentData.slot || pendingBooking.slot;
      const created = await sendWithOverbookConfirm((allowOverbook) => apiClient.createAppointment({
        doctorId, 
        patientId: selectedPatientId, 
        date, 
        slot: finalSlot, 
        visitType: appointmentData.visitType,
        roomId: appointmentData.roomId,
        calendar,
        ...overbookFlag(allowOverbook),
      }));
      if (!created) return;
      track('appointment_booked', { source: 'scheduler' });
      
      // Success toast
      toast({
        variant: "success",
        title: "Appointment Booked Successfully",
        description: `${formatPatientName(selectedPatient)} scheduled for ${finalSlot} in the ${CALENDARS[calendar].title} calendar`,
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
        status: CALENDARS[calendar].entryStatus,
        calendar,
        visit: created.visit ? { id: created.visit.id, status: created.visit.status } : undefined,
      };
      
      setAppointments(prev => [...prev, newAppt]);
      setAppointmentsBySlot(prev => ({ ...prev, [pendingBooking.slot]: newAppt }));
      setOptimisticAppointment({ doctorId, date, appointment: newAppt });
      
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
      setPendingBooking(null);
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
    }
  };

  const handleBookingCancel = () => {
    setBookingDialogOpen(false);
    setPendingBooking(null);
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
      const moved = await sendWithOverbookConfirm((allowOverbook) => apiClient.rescheduleAppointment(rescheduleContext.appointment.id!, {
        date: targetDate,
        slot: newSlot,
        roomId: rescheduleContext.appointment.room?.id,
        ...overbookFlag(allowOverbook),
      }));
      if (!moved) return;

      toast({
        variant: "success",
        title: "Appointment rescheduled",
        description: `${formatPatientName(rescheduleContext.appointment.patient)} moved to ${newSlot} on ${displayCalendarDate(targetDate)}`,
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
  }, [rescheduleContext, rescheduleLoading, date, fetchSlots, toast, sendWithOverbookConfirm]);

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
                  <label htmlFor="slots-doctor" className="text-sm text-foreground">Doctor</label>
                  <Select value={doctorId} onValueChange={setDoctorId}>
                    <SelectTrigger id="slots-doctor"><SelectValue placeholder="Select doctor" /></SelectTrigger>
                    <SelectContent>
                      {doctors.map((d) => (<SelectItem key={d.id} value={d.id}>{d.firstName} {d.lastName}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label htmlFor="slots-date" className="text-sm text-foreground">Date</label>
                  <Input id="slots-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
              </>
            )}
            <div>
              <label htmlFor="slots-visit-type" className="text-sm text-foreground">Visit Type</label>
              <Select value={visitTypeFilter} onValueChange={setVisitTypeFilter}>
                <SelectTrigger id="slots-visit-type"><SelectValue placeholder="All Types" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Types</SelectItem>
                  <SelectItem value="OPD">OPD Consultation</SelectItem>
                  <SelectItem value="PROCEDURE">Procedure</SelectItem>
                  <SelectItem value="TELEMED">Telemedicine</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label htmlFor="slots-room" className="text-sm text-foreground">Room</label>
              <Select value={roomFilter} onValueChange={setRoomFilter}>
                <SelectTrigger id="slots-room"><SelectValue placeholder="All Rooms" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Rooms</SelectItem>
                  {rooms.map((room) => (
                    <SelectItem key={room.id} value={room.id}>{room.name} ({room.type})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label htmlFor="slots-duration" className="text-sm text-foreground">Duration</label>
              <Select
                value={String(slotConfig.stepMinutes)}
                onValueChange={(v: string) => {
                  const m = parseInt(v, 10);
                  if (!Number.isNaN(m)) {
                    setSlotConfig((prev) => ({ ...prev, stepMinutes: m }));
                  }
                }}
              >
                <SelectTrigger id="slots-duration"><SelectValue placeholder="Select duration" /></SelectTrigger>
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
            <label htmlFor="slots-patient" className="text-sm text-foreground">Patient</label>
            <Input id="slots-patient" 
              placeholder="Search patient by name/phone" 
              value={patientSearch} 
              onChange={(e) => { 
                setSelectedPatientId(''); 
                setSelectedPatient(null); 
                void searchPatients(e.target.value); 
              }} 
            />
            {selectedPatient && (
              <div className="mt-2 rounded-md border border-success-border bg-success-soft p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-success-text">✓ Selected Patient</div>
                    <div className="text-success-text font-medium">{formatPatientName(selectedPatient)}</div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-success-text">
                      {selectedPatient.patientCode && <span className="font-mono">{selectedPatient.patientCode}</span>}
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
              <div className="mt-2 flex items-center gap-2 rounded-md border border-warning-border bg-warning-soft px-3 py-2 text-xs text-warning-text">
                <AlertCircle className="h-4 w-4" />
                <span>Select a patient from the list or add them as new before booking a slot.</span>
              </div>
            )}

            {patientSearch && patients.length > 0 && (
              <div className="mt-2 max-h-40 overflow-auto border rounded-md">
                {patients.map((p) => (
                  <div
                    key={p.id}
                    className="px-3 py-2 text-sm hover:bg-accent cursor-pointer"
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
                    <div className="text-xs text-muted-foreground flex items-center gap-3">
                      {p.patientCode && <span className="font-mono">{p.patientCode}</span>}
                      {p.phone && <span>📞 {p.phone}</span>}
                      {p.email && <span>✉️ {p.email}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {patientSearch && patients.length === 0 && !selectedPatientId && !searchingPatients && (
              <div className="mt-2 flex flex-col gap-2 rounded-md border border-dashed border-border bg-muted p-4 text-sm text-foreground">
                <div>No matching patients found.</div>
                <Button variant="outline" size="sm" onClick={() => setQuickCreateOpen(true)}>
                  + Add "{patientSearch}" as a new patient
                </Button>
              </div>
            )}
            {patientSearch && !patients.length && !quickCreateOpen && !selectedPatientId && !searchingPatients && (
              <div className="mt-2 text-xs text-muted-foreground">
                Tip: enter patient name and phone, then use "Add" to create a new record instantly.
              </div>
            )}
          </div>

          {!!bookingDetails && (
            <div 
              className="p-4 rounded-r text-sm shadow-sm"
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
                  <p style={{ color: 'var(--success-text)' }}>
                    {bookingDetails.patient?.name || selectedPatient?.name || 'Unknown Patient'} 
                    {' '} scheduled for {bookingDetails.slot}
                    {bookingDetails.room && ` in ${bookingDetails.room.name}`}
                    {bookingDetails.visitType && ` (${enumLabel('visitType', bookingDetails.visitType)})`}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Unified calendar-only view; legacy slots grid removed for consistency */}
        </CardContent>
      </Card>

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
        bookingInProgress={isBooking && pendingBooking ? pendingBooking : undefined}
        onAppointmentUpdate={() => setRefreshKey((prev) => prev + 1)}
        timeSlotConfig={slotConfig}
        disableSlotBooking={(!selectedPatientId || !selectedPatient || selectedPatient.id !== selectedPatientId) && !rescheduleContext}
        optimisticAppointment={optimisticAppointment?.doctorId === doctorId && optimisticAppointment.date === date ? optimisticAppointment : undefined}
        maxBookingsPerSlot={doctorDay?.maxBookingsPerSlot ?? 1}
      />

      {overbookDialog}

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
