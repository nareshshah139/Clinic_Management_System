'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { apiClient } from '@/lib/api';
import type { User, Patient } from '@/lib/types';
import AppointmentBookingDialog from './AppointmentBookingDialog';

type AppointmentInSlot = {
  id: string;
  slot: string;
  patient: { id: string; name: string; phone?: string; email?: string };
  doctor: { firstName: string; lastName: string };
  visitType: 'OPD' | 'TELEMED' | 'PROCEDURE';
  room?: { id: string; name: string; type: string };
  status: string;
};

export default function AppointmentScheduler() {
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [doctorId, setDoctorId] = useState<string>('');
  const [patientSearch, setPatientSearch] = useState<string>('');
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [visitTypeFilter, setVisitTypeFilter] = useState<string>('ALL');
  const [roomFilter, setRoomFilter] = useState<string>('ALL');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<User[]>([]);
  const [slots, setSlots] = useState<{ time: string; available: boolean }[]>([]);
  const [appointments, setAppointments] = useState<AppointmentInSlot[]>([]);
  const [appointmentsBySlot, setAppointmentsBySlot] = useState<Record<string, AppointmentInSlot>>({});
  const [rooms, setRooms] = useState<{ id: string; name: string; type: string }[]>([]);
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentInSlot | null>(null);
  const [bookingDetails, setBookingDetails] = useState<any | null>(null);
  const [recentBookedSlot, setRecentBookedSlot] = useState<string>('');
  const [isBooking, setIsBooking] = useState<boolean>(false);
  const [bookingSlot, setBookingSlot] = useState<string>('');
  
  // Booking dialog state
  const [bookingDialogOpen, setBookingDialogOpen] = useState<boolean>(false);
  const [pendingBookingSlot, setPendingBookingSlot] = useState<string>('');

  // Debug log to confirm component is loading with changes
  console.log('🎨 AppointmentScheduler loaded with booking dialog - Version 2024-12-10-v3');

  useEffect(() => {
    void fetchDoctors();
    void fetchRooms();
  }, []);

  useEffect(() => {
    if (doctorId && date) {
      void fetchSlots();
    }
  }, [doctorId, date]);

  useEffect(() => {
    // Clear transient highlights when doctor/date changes
    setRecentBookedSlot('');
    setBookingDetails(null);
  }, [doctorId, date]);

  const fetchDoctors = async () => {
    try {
      const res: any = await apiClient.getUsers({ limit: 100 });
      const list: User[] = (res.users || res.data || []).filter((u: User) => u.role === 'DOCTOR');
      setDoctors(list);
      if (list[0]?.id) setDoctorId(list[0].id);
    } catch (e) {
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

  const fetchSlots = async () => {
    try {
      const res: any = await apiClient.getAvailableSlots({ doctorId, date, durationMinutes: 30 });
      setSlots(res.slots || []);
      
      const scheduleRes: any = await apiClient.getDoctorSchedule(doctorId, date);
      const appts: AppointmentInSlot[] = (scheduleRes.appointments || []).map((a: any) => ({
        id: a.id,
        slot: a.slot,
        patient: a.patient,
        doctor: a.doctor,
        visitType: a.visitType,
        room: a.room,
        status: a.status,
      }));
      
      setAppointments(appts);
      
      const bySlot: Record<string, AppointmentInSlot> = {};
      appts.forEach(a => { bySlot[a.slot] = a; });
      setAppointmentsBySlot(bySlot);
    } catch (e) {
      console.error('Failed to fetch slots', e);
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

  const getLocalDateStr = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${da}`;
  };

  const isPastSlot = (slotTime: string): boolean => {
    const todayStr = getLocalDateStr(new Date());
    if (date < todayStr) return true;
    if (date > todayStr) return false;
    const [hStr, mStr] = slotTime.split('-')[0].split(':');
    const h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const slotMinutes = h * 60 + m;
    return slotMinutes <= nowMinutes;
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
      setIsBooking(true);
      const created: any = await apiClient.createAppointment({ 
        doctorId, 
        patientId: selectedPatientId, 
        date, 
        slot: pendingBookingSlot, 
        visitType: appointmentData.visitType,
        roomId: appointmentData.roomId
      });
      
      // Optimistic UI update
      const newAppt: AppointmentInSlot = {
        id: created.id || 'temp',
        slot: pendingBookingSlot,
        patient: selectedPatient ? {
          id: selectedPatient.id,
          name: selectedPatient.name || 'Unknown Patient',
          phone: selectedPatient.phone,
          email: selectedPatient.email,
        } : { id: selectedPatientId, name: 'Unknown' },
        doctor: { firstName: 'Dr.', lastName: 'Unknown' },
        visitType: appointmentData.visitType,
        room: created.room,
        status: 'SCHEDULED',
      };
      
      setAppointments(prev => [...prev, newAppt]);
      setAppointmentsBySlot(prev => ({ ...prev, [pendingBookingSlot]: newAppt }));
      setSlots(prev => prev.filter(s => s.time !== pendingBookingSlot));
      
      setRecentBookedSlot(pendingBookingSlot);
      setBookingDetails(created);
      
      setTimeout(() => {
        setBookingDetails(null);
        setRecentBookedSlot('');
      }, 5000);
      
      // Close dialog
      setBookingDialogOpen(false);
      setPendingBookingSlot('');
      
    } catch (e: any) {
      const status = e?.status;
      const body = e?.body || {};
      if (status === 409) {
        const suggestions = Array.isArray(body?.suggestions) ? body.suggestions : [];
        const msg = body?.message || 'Scheduling conflict detected';
        alert(`${msg}${suggestions.length ? ` — Try: ${suggestions.join(', ')}` : ''}`);
        return;
      }
      alert('Failed to book appointment');
    } finally {
      setIsBooking(false);
    }
  };

  const handleBookingCancel = () => {
    setBookingDialogOpen(false);
    setPendingBookingSlot('');
  };

  // Filter appointments based on visitType and room
  const filteredAppointments = appointments.filter(apt => {
    const visitTypeMatch = visitTypeFilter === 'ALL' || apt.visitType === visitTypeFilter;
    const roomMatch = roomFilter === 'ALL' || apt.room?.id === roomFilter;
    return visitTypeMatch && roomMatch;
  });

  const filteredAppointmentsBySlot = Object.fromEntries(
    Object.entries(appointmentsBySlot).filter(([_, apt]) => {
      const visitTypeMatch = visitTypeFilter === 'ALL' || apt.visitType === visitTypeFilter;
      const roomMatch = roomFilter === 'ALL' || apt.room?.id === roomFilter;
      return visitTypeMatch && roomMatch;
    })
  );

  const booked = filteredAppointments.map(a => a.slot);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            📅 Appointment Slots
            <span style={{ 
              backgroundColor: '#22c55e', 
              color: 'white', 
              padding: '2px 6px', 
              borderRadius: '4px', 
              fontSize: '10px',
              marginLeft: '8px'
            }}>
              v2.0
            </span>
          </CardTitle>
          <CardDescription>Select a doctor and date to view available appointment slots</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
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
          </div>

          <div>
            <label className="text-sm text-gray-700">Patient</label>
            <Input placeholder="Search patient by name/phone" value={patientSearch} onChange={(e) => { setSelectedPatientId(''); setSelectedPatient(null); void searchPatients(e.target.value); }} />
            {selectedPatient && (
              <div className="mt-2 p-3 bg-green-50 rounded border border-green-200">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-green-800">✓ Selected Patient</div>
                    <div className="text-green-700 font-medium">{selectedPatient.name || `Patient ${selectedPatient.id?.slice(-4) || 'Unknown'}`}</div>
                    <div className="text-xs text-green-600 flex items-center gap-3 mt-1">
                      <span>ID: {selectedPatient.id}</span>
                      {selectedPatient.phone && <span>📞 {selectedPatient.phone}</span>}
                      {selectedPatient.email && <span>✉️ {selectedPatient.email}</span>}
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => { setSelectedPatientId(''); setSelectedPatient(null); setPatientSearch(''); setPatients([]); }}>Clear</Button>
                </div>
              </div>
            )}
            {patientSearch && patients.length > 0 && (
              <div className="mt-2 max-h-40 overflow-auto border rounded">
                {patients.map((p) => (
                  <div key={p.id} className="px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer" onClick={() => { setPatientSearch(`${p.name || 'Unknown'} — ${p.phone}`); setSelectedPatientId(p.id); setSelectedPatient(p); setPatients([]); }}>
                    <div className="font-medium">{p.name || `Patient ${p.id?.slice(-4) || 'Unknown'}`}</div>
                    <div className="text-xs text-gray-500 flex items-center gap-3">
                      <span>ID: {p.id}</span>
                      {p.phone && <span>📞 {p.phone}</span>}
                      {p.email && <span>✉️ {p.email}</span>}
                    </div>
                  </div>
                ))}
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

          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium">Available & Booked Slots</h4>
              <div className="flex gap-2 text-xs">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded" style={{ backgroundColor: '#22c55e' }}></div>
                  <span>Newly Booked</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded" style={{ backgroundColor: '#3b82f6' }}></div>
                  <span>Booked</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-white border"></div>
                  <span>Available</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded" style={{ backgroundColor: '#f3f4f6' }}></div>
                  <span>Past</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {booked.map((t) => {
                const appt = filteredAppointmentsBySlot[t];
                const isNewlyBooked = (recentBookedSlot === t) || (bookingDetails?.slot === t);
                return (
                  <div key={`booked-${t}`} className="flex flex-col">
                    <Button
                      variant={isNewlyBooked ? "default" : "secondary"}
                      style={{
                        backgroundColor: isNewlyBooked ? '#22c55e' : '#3b82f6',
                        color: 'white',
                        borderColor: isNewlyBooked ? '#16a34a' : '#2563eb',
                        boxShadow: isNewlyBooked ? '0 0 0 2px rgba(34, 197, 94, 0.3)' : 'none'
                      }}
                      className="justify-center text-sm font-medium transition-all duration-200 mb-1"
                      onClick={() => {
                        if (appt) setSelectedAppointment(appt);
                      }}
                    >{t}</Button>
                    {appt && (
                      <div className="text-xs text-center space-y-1">
                        <Badge 
                          variant={appt.visitType === 'PROCEDURE' ? 'destructive' : appt.visitType === 'TELEMED' ? 'secondary' : 'default'}
                          className="text-xs"
                        >
                          {appt.visitType}
                        </Badge>
                        {appt.room && (
                          <div className="text-gray-600 truncate">{appt.room.name}</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {slots.map((s) => {
                const past = isPastSlot(s.time);
                const isThisBooking = isBooking && bookingSlot === s.time;
                return (
                  <Button
                    key={s.time}
                    variant="outline"
                    style={{
                      backgroundColor: past
                        ? '#f3f4f6'
                        : isThisBooking
                        ? '#fef3c7'
                        : 'white',
                      color: past
                        ? '#9ca3af'
                        : isThisBooking
                        ? '#92400e'
                        : '#374151',
                      borderColor: past
                        ? '#d1d5db'
                        : isThisBooking
                        ? '#f59e0b'
                        : '#d1d5db',
                      opacity: past ? 0.6 : 1,
                      cursor: past ? 'not-allowed' : isThisBooking ? 'wait' : 'pointer'
                    }}
                    className="justify-center text-sm font-medium transition-all duration-200"
                    disabled={past || isThisBooking}
                    onClick={() => {
                      if (past) return;
                      handleBookingRequest(s.time);
                    }}
                  >{isThisBooking ? 'Booking…' : s.time}</Button>
                );
              })}
            </div>
          </div>
        </CardContent>

        <Dialog open={!!selectedAppointment} onOpenChange={(v) => { if (!v) setSelectedAppointment(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Appointment Details</DialogTitle>
            </DialogHeader>
            {selectedAppointment && (
              <div className="space-y-3 text-sm">
                <div><span className="text-gray-600">Date:</span> {date}</div>
                <div><span className="text-gray-600">Slot:</span> {selectedAppointment.slot}</div>
                <div><span className="text-gray-600">Patient:</span> {selectedAppointment.patient?.name || 'Unknown'}</div>
                {selectedAppointment.patient?.phone && (
                  <div><span className="text-gray-600">Phone:</span> {selectedAppointment.patient.phone}</div>
                )}
                {selectedAppointment.patient?.email && (
                  <div><span className="text-gray-600">Email:</span> {selectedAppointment.patient.email}</div>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-gray-600">Type:</span> 
                  <Badge variant={selectedAppointment.visitType === 'PROCEDURE' ? 'destructive' : selectedAppointment.visitType === 'TELEMED' ? 'secondary' : 'default'}>
                    {selectedAppointment.visitType}
                  </Badge>
                </div>
                {selectedAppointment.room && (
                  <div><span className="text-gray-600">Room:</span> {selectedAppointment.room.name} ({selectedAppointment.room.type})</div>
                )}
                <div><span className="text-gray-600">Status:</span> {selectedAppointment.status}</div>
              </div>
            )}
          </DialogContent>
        </Dialog>
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