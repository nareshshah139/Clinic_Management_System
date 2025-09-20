"use client";

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { apiClient } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { X, FileText, AlertTriangle } from 'lucide-react';

type AppointmentInSchedule = {
  slot: string;
  patient?: { id: string; name: string; phone?: string; email?: string };
  doctor?: { firstName: string; lastName: string };
  visitType?: 'OPD' | 'TELEMED' | 'PROCEDURE';
  room?: { id: string; name: string; type: string };
  id?: string;
  status?: string;
};

export interface DoctorDayCalendarProps {
  doctorId: string;
  date: string; // YYYY-MM-DD
  recentBookedSlot?: string;
  visitTypeFilter?: string;
  roomFilter?: string;
  onSelectSlot?: (slot: string) => void;
  refreshKey?: number; // Add refresh key to trigger data reload
  bookingInProgress?: string; // Add slot being booked for immediate feedback
  optimisticAppointment?: { // Add optimistic appointment for immediate display
    slot: string;
    patient: { name: string };
    visitType: 'OPD' | 'PROCEDURE' | 'TELEMED';
    room?: { id: string; name: string; type: string };
  };
  onAppointmentUpdate?: () => void; // Callback for appointment changes
}

function generateSlots(startHour = 9, endHour = 18, stepMinutes = 30): string[] {
  const slots: string[] = [];
  for (let h = startHour; h < endHour; h += stepMinutes / 60) {
    const startH = Math.floor(h);
    const startM = Math.round((h - startH) * 60);
    const endH = Math.floor(h + stepMinutes / 60);
    const endM = Math.round(((h + stepMinutes / 60) - endH) * 60);
    const fmt = (x: number) => x.toString().padStart(2, '0');
    slots.push(`${fmt(startH)}:${fmt(startM)}-${fmt(endH)}:${fmt(endM)}`);
  }
  return slots;
}

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
  onAppointmentUpdate
}: DoctorDayCalendarProps) {
  const router = useRouter();
  const [schedule, setSchedule] = useState<AppointmentInSchedule[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentInSchedule | null>(null);
  const [cancellingAppointment, setCancellingAppointment] = useState<string | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState<boolean>(false);

  const slots = useMemo(() => generateSlots(9, 18, 30), []);

  // Filter appointments based on visitType and room filters
  const filteredSchedule = useMemo(() => {
    let appointments = [...schedule];
    
    // Add optimistic appointment if it exists and matches filters
    if (optimisticAppointment) {
      const visitTypeMatch = visitTypeFilter === 'ALL' || optimisticAppointment.visitType === visitTypeFilter;
      const roomMatch = roomFilter === 'ALL' || optimisticAppointment.room?.id === roomFilter;
      
      if (visitTypeMatch && roomMatch) {
        // Remove any existing appointment for this slot and add optimistic one
        appointments = appointments.filter(apt => apt.slot !== optimisticAppointment.slot);
        appointments.push({
          slot: optimisticAppointment.slot,
          patient: optimisticAppointment.patient,
          visitType: optimisticAppointment.visitType,
          room: optimisticAppointment.room,
          id: 'optimistic-' + optimisticAppointment.slot,
          status: 'SCHEDULED'
        });
      }
    }
    
    return appointments.filter(apt => {
      const visitTypeMatch = visitTypeFilter === 'ALL' || apt.visitType === visitTypeFilter;
      const roomMatch = roomFilter === 'ALL' || apt.room?.id === roomFilter;
      return visitTypeMatch && roomMatch;
    });
  }, [schedule, visitTypeFilter, roomFilter, optimisticAppointment]);

  const bookedBySlot = useMemo(() => new Map(filteredSchedule.map(a => [a.slot, a])), [filteredSchedule]);

  const getLocalDateStr = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${da}`;
  };

  const isPastSlot = (slotTime: string): boolean => {
    // If selected date is in the past, all slots are past
    const todayStr = getLocalDateStr(new Date());
    if (date < todayStr) return true;
    if (date > todayStr) return false;
    // Same day: compare slot start with now
    const [hStr, mStr] = slotTime.split('-')[0].split(':');
    const h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const slotMinutes = h * 60 + m;
    return slotMinutes <= nowMinutes;
  };

  const fetchSchedule = useCallback(async () => {
    if (!doctorId || !date) return;
    try {
      setLoading(true);
      const res: any = await apiClient.getDoctorSchedule(doctorId, date);
      // Map backend appointments to slot-wise entries
      const items = (res.appointments || []).map((a: any) => ({
        slot: a.slot,
        patient: a.patient ? { 
          id: a.patient.id, 
          name: a.patient.name,
          phone: a.patient.phone,
          email: a.patient.email
        } : undefined,
        doctor: a.doctor,
        visitType: a.visitType,
        room: a.room,
        id: a.id,
        status: a.status,
      }));
      setSchedule(items);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to load schedule', e);
    } finally {
      setLoading(false);
    }
  }, [doctorId, date]);

  useEffect(() => {
    void fetchSchedule();
  }, [fetchSchedule, refreshKey]); // Include refreshKey in dependency array

  const handleCancelAppointment = async (appointment: AppointmentInSchedule) => {
    if (!appointment.id) return;
    
    setCancellingAppointment(appointment.id);
    setSelectedAppointment(appointment);
    setShowCancelDialog(true);
  };

  const confirmCancelAppointment = async () => {
    if (!cancellingAppointment) return;
    
    try {
      await apiClient.deleteAppointment(cancellingAppointment);
      
      // Refresh the schedule
      await fetchSchedule();
      
      // Notify parent component
      onAppointmentUpdate?.();
      
      // Close dialogs
      setShowCancelDialog(false);
      setSelectedAppointment(null);
      setCancellingAppointment(null);
    } catch (error) {
      console.error('Failed to cancel appointment:', error);
      alert('Failed to cancel appointment. Please try again.');
    }
  };

  const handleStartVisit = (appointment: AppointmentInSchedule) => {
    if (!appointment.patient?.id || !appointment.id) return;
    
    // Navigate to visits page with appointment data
    const searchParams = new URLSearchParams({
      patientId: appointment.patient.id,
      appointmentId: appointment.id,
      autoStart: 'true'
    });
    
    router.push(`/dashboard/visits?${searchParams.toString()}`);
  };

  return (
    <>
      <Card>
        <CardContent className="p-4">
          {(visitTypeFilter !== 'ALL' || roomFilter !== 'ALL') && (
            <div className="mb-4 p-3 bg-blue-50 rounded-lg">
              <div className="text-sm text-blue-700">
                <span className="font-medium">Filters Active:</span>
                {visitTypeFilter !== 'ALL' && <Badge variant="secondary" className="ml-2">{visitTypeFilter}</Badge>}
                {roomFilter !== 'ALL' && <Badge variant="outline" className="ml-2">Room Filter</Badge>}
              </div>
            </div>
          )}
          
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {slots.map((slot) => {
              const booked = bookedBySlot.has(slot);
              const appt = bookedBySlot.get(slot);
              const past = isPastSlot(slot);
              const isNewlyBooked = recentBookedSlot === slot;
              const isBookingInProgress = bookingInProgress === slot;
              
              return (
                <div 
                  key={slot} 
                  className="border rounded-lg p-3 flex flex-col gap-2 transition-all duration-200"
                  style={{
                    backgroundColor: booked 
                      ? (isNewlyBooked ? '#22c55e' : '#3b82f6')
                      : isBookingInProgress
                      ? '#fbbf24'
                      : (past ? '#f3f4f6' : 'white'),
                    borderColor: booked 
                      ? (isNewlyBooked ? '#16a34a' : '#2563eb')
                      : isBookingInProgress
                      ? '#f59e0b'
                      : (past ? '#d1d5db' : '#e5e7eb'),
                    opacity: past && !booked ? 0.6 : 1,
                    boxShadow: isNewlyBooked 
                      ? '0 0 0 2px rgba(34, 197, 94, 0.3)' 
                      : isBookingInProgress 
                      ? '0 0 0 2px rgba(251, 191, 36, 0.3)' 
                      : 'none'
                  }}
                >
                  <div 
                    className="text-sm font-medium"
                    style={{ color: booked ? 'white' : (past ? '#9ca3af' : '#374151') }}
                  >
                    {slot}
                  </div>
                  
                  {booked && appt ? (
                    <div className="flex flex-col gap-2">
                      <div 
                        className="text-xs truncate cursor-pointer font-medium"
                        style={{ color: 'rgba(255, 255, 255, 0.95)' }}
                        onClick={() => setSelectedAppointment(appt)}
                      >
                        {appt.patient?.name || 'Booked'}
                      </div>
                      
                      <div className="flex flex-col gap-1">
                        <Badge 
                          variant={appt.visitType === 'PROCEDURE' ? 'destructive' : appt.visitType === 'TELEMED' ? 'secondary' : 'default'}
                          className="text-xs w-fit"
                          style={{
                            backgroundColor: appt.visitType === 'PROCEDURE' 
                              ? 'rgba(220, 38, 38, 0.8)' 
                              : appt.visitType === 'TELEMED'
                              ? 'rgba(107, 114, 128, 0.8)'
                              : 'rgba(59, 130, 246, 0.8)',
                            color: 'white',
                            border: 'none'
                          }}
                        >
                          {appt.visitType || 'OPD'}
                        </Badge>
                        
                        {appt.room && (
                          <div 
                            className="text-xs truncate"
                            style={{ color: 'rgba(255, 255, 255, 0.8)' }}
                          >
                            📍 {appt.room.name}
                          </div>
                        )}
                      </div>
                      
                      {/* Action buttons */}
                      <div className="flex gap-1 mt-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-xs text-white hover:bg-white hover:bg-opacity-20"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartVisit(appt);
                          }}
                        >
                          <FileText className="h-3 w-3 mr-1" />
                          Visit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-xs text-white hover:bg-red-500 hover:bg-opacity-80"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCancelAppointment(appt);
                          }}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      disabled={past || isBookingInProgress}
                      style={{
                        backgroundColor: past ? '#f3f4f6' : isBookingInProgress ? '#fbbf24' : 'white',
                        color: past ? '#9ca3af' : isBookingInProgress ? '#92400e' : '#374151',
                        borderColor: past ? '#d1d5db' : isBookingInProgress ? '#f59e0b' : '#d1d5db',
                        cursor: past ? 'not-allowed' : isBookingInProgress ? 'wait' : 'pointer'
                      }}
                      onClick={() => !past && !isBookingInProgress && onSelectSlot?.(slot)}
                    >
                      {past ? 'Past' : isBookingInProgress ? 'Booking...' : 'Book'}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
          
          {filteredSchedule.length === 0 && schedule.length > 0 && (
            <div className="text-center text-gray-500 mt-4 p-4">
              No appointments match the current filters.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Appointment Details Dialog */}
      <Dialog open={!!selectedAppointment && !showCancelDialog} onOpenChange={(v) => { if (!v) setSelectedAppointment(null); }}>
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
                  {selectedAppointment.visitType || 'OPD'}
                </Badge>
              </div>
              {selectedAppointment.room && (
                <div><span className="text-gray-600">Room:</span> {selectedAppointment.room.name} ({selectedAppointment.room.type})</div>
              )}
              {selectedAppointment.status && (
                <div><span className="text-gray-600">Status:</span> {selectedAppointment.status}</div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedAppointment(null)}>
              Close
            </Button>
            {selectedAppointment && (
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
                <div><span className="font-medium">Patient:</span> {selectedAppointment.patient?.name}</div>
                <div><span className="font-medium">Date:</span> {date}</div>
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