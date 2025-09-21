'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { apiClient } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import {
  getErrorMessage,
  formatPatientName,
  createCleanupTimeouts,
  getISTDateString,
  isConflictError,
  getConflictSuggestions
} from '@/lib/utils';
import type { 
  User, 
  Patient, 
  TimeSlotConfig,
  GetUsersResponse,
  GetPatientsResponse,
  GetRoomsResponse,
  VisitType
} from '@/lib/types';
import DoctorDayCalendar from '@/components/appointments/DoctorDayCalendar';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import AppointmentBookingDialog from './AppointmentBookingDialog';

interface AppointmentsCalendarProps {
  timeSlotConfig?: TimeSlotConfig;
}

export default function AppointmentsCalendar({
  timeSlotConfig = {
    startHour: 9,
    endHour: 18,
    stepMinutes: 30,
    timezone: 'Asia/Kolkata'
  }
}: AppointmentsCalendarProps) {
  const { toast } = useToast();
  const [date, setDate] = useState<string>(getISTDateString());
  const [doctorId, setDoctorId] = useState<string>('');
  const [patientSearch, setPatientSearch] = useState<string>('');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<User[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [bookingDetails, setBookingDetails] = useState<any | null>(null);
  const [recentBookedSlot, setRecentBookedSlot] = useState<string>('');
  const [visitTypeFilter, setVisitTypeFilter] = useState<string>('ALL');
  const [roomFilter, setRoomFilter] = useState<string>('ALL');
  const [rooms, setRooms] = useState<{ id: string; name: string; type: string }[]>([]);
  const [refreshKey, setRefreshKey] = useState<number>(0);
  const [optimisticAppointment, setOptimisticAppointment] = useState<{
    slot: string;
    patient: { name: string };
    visitType: VisitType;
    room?: { id: string; name: string; type: string };
  } | null>(null);

  // Booking dialog state
  const [bookingDialogOpen, setBookingDialogOpen] = useState<boolean>(false);
  const [pendingBookingSlot, setPendingBookingSlot] = useState<string>('');

  const cleanupTimeouts = useMemo(() => createCleanupTimeouts(), []);

  useEffect(() => {
    void fetchDoctors();
    void fetchRooms();
  }, []);

  useEffect(() => {
    // Clear transient highlights when doctor/date changes
    setRecentBookedSlot('');
    setBookingDetails(null);
    setOptimisticAppointment(null);
    // Fetch rooms when doctor/date changes
    if (doctorId && date) {
      void fetchRooms();
    }
  }, [doctorId, date]);

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

  const searchPatients = async (q: string) => {
    setPatientSearch(q);
    const res: any = await apiClient.getPatients({ search: q, limit: 10 });
    setPatients((res.data || res.patients || []).map((p: any) => ({
      ...p,
      firstName: p.firstName || p.name?.split(' ')[0] || '',
      lastName: p.lastName || p.name?.split(' ').slice(1).join(' ') || '',
    })));
  };

  const handleBookingRequest = (slot: string) => {
    const pid = selectedPatientId?.trim();
    if (!pid) { 
      alert('Please select a patient first'); 
      return; 
    }
    
    setPendingBookingSlot(slot);
    setBookingDialogOpen(true);
  };

  const handleBookingConfirm = async (appointmentData: { 
    visitType: 'OPD' | 'PROCEDURE' | 'TELEMED'; 
    roomId?: string;
  }) => {
    try {
      setLoading(true);
      
      // Create optimistic appointment immediately
      const selectedRoom = appointmentData.roomId 
        ? rooms.find(r => r.id === appointmentData.roomId) 
        : undefined;
        
      const optimisticAppt = {
        slot: pendingBookingSlot,
        patient: { 
          name: `${selectedPatient?.firstName || ''} ${selectedPatient?.lastName || ''}`.trim() || 'Unknown'
        },
        visitType: appointmentData.visitType,
        room: selectedRoom
      };
      
      setOptimisticAppointment(optimisticAppt);
      setRecentBookedSlot(pendingBookingSlot);
      
      const created: any = await apiClient.createAppointment({ 
        doctorId, 
        patientId: selectedPatientId, 
        date, 
        slot: pendingBookingSlot, 
        visitType: appointmentData.visitType,
        roomId: appointmentData.roomId
      });
      
      // Clear optimistic appointment and refresh with real data
      setOptimisticAppointment(null);
      setRefreshKey(prev => prev + 1);
      
      // Set success feedback
      setBookingDetails(created);
      
      // Refresh rooms after booking
      void fetchRooms();
      
      // Clear success message after 5 seconds
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
      setRecentBookedSlot('');
      
      const status = e?.status;
      const body = e?.body || {};
      if (status === 409) {
        const suggestions = Array.isArray(body?.suggestions) ? body.suggestions : [];
        const msg = body?.message || 'Scheduling conflict detected';
        // eslint-disable-next-line no-alert
        alert(`${msg}${suggestions.length ? ` — Try: ${suggestions.join(', ')}` : ''}`);
        return;
      }
      // eslint-disable-next-line no-alert
      alert('Failed to book appointment');
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
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" /> 
            Doctor Calendar
            <span style={{ 
              backgroundColor: '#22c55e', 
              color: 'white', 
              padding: '2px 6px', 
              borderRadius: '4px', 
              fontSize: '10px',
              marginLeft: '8px'
            }}>
              v2.3
            </span>
          </CardTitle>
          <CardDescription>Daily calendar for selected doctor. Click an empty slot to schedule.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
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
          </div>

          {selectedPatient && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                Selected: {selectedPatient.firstName} {selectedPatient.lastName} — {selectedPatient.phone}
              </Badge>
              <Button variant="outline" size="sm" onClick={() => { setSelectedPatientId(''); setSelectedPatient(null); setPatientSearch(''); setPatients([]); }}>Clear</Button>
            </div>
          )}

          {patientSearch && patients.length > 0 && (
            <div className="max-h-40 overflow-auto border rounded">
              {patients.map((p) => (
                <div key={p.id} className="px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer" onClick={() => { setPatientSearch(`${p.firstName} ${p.lastName} — ${p.phone}`); setSelectedPatientId(p.id); setSelectedPatient(p); setPatients([]); }}>
                  {p.firstName} {p.lastName} — {p.phone}
                </div>
              ))}
            </div>
          )}

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
    </>
  );
} 