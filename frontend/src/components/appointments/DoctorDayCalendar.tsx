"use client";

import React, { useEffect, useMemo, useState, useCallback } from 'react';
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
  isSlotInPast,
  getErrorMessage,
  formatPatientName,
  createCleanupTimeouts,
} from '@/lib/utils';
import type {
  AppointmentInSlot,
  TimeSlotConfig,
  GetDoctorScheduleResponse
} from '@/lib/types';
import { AppointmentStatus } from '@cms/shared-types';

export interface DoctorDayCalendarProps {
  doctorId: string;
  date: string; // YYYY-MM-DD
  recentBookedSlot?: string;
  visitTypeFilter?: string;
  roomFilter?: string;
  onSelectSlot?: (slot: string) => void;
  refreshKey?: number;
  bookingInProgress?: string;
  optimisticAppointment?: AppointmentInSlot;
  onAppointmentUpdate?: () => void;
  timeSlotConfig?: TimeSlotConfig;
  disableSlotBooking?: boolean;
  selectedRoomName?: string;
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
  onAppointmentUpdate,
  timeSlotConfig = {
    startHour: 9,
    endHour: 18,
    stepMinutes: 30,
    timezone: 'Asia/Kolkata'
  },
  disableSlotBooking = false,
  selectedRoomName,
}: DoctorDayCalendarProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [schedule, setSchedule] = useState<AppointmentInSlot[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentInSlot | null>(null);
  const [cancellingAppointment, setCancellingAppointment] = useState<string | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState<boolean>(false);

  const slots = useMemo(() => generateTimeSlots(timeSlotConfig), [timeSlotConfig]);
  const cleanupTimeouts = useMemo(() => createCleanupTimeouts(), []);
  const roomFilterLabel = roomFilter !== 'ALL' ? (selectedRoomName ?? 'Unknown Room') : undefined;

  // Filter appointments based on visitType and room filters
  const filteredSchedule = useMemo(() => {
    let appointments = [...schedule];
    
    if (optimisticAppointment) {
      const visitTypeMatch = visitTypeFilter === 'ALL' || optimisticAppointment.visitType === visitTypeFilter;
      const roomMatch = roomFilter === 'ALL' || optimisticAppointment.room?.id === roomFilter;
      
      if (visitTypeMatch && roomMatch) {
        appointments = appointments.filter(apt => apt.slot !== optimisticAppointment.slot);
        appointments.push(optimisticAppointment);
      }
    }
    
    return appointments.filter(apt => {
      const visitTypeMatch = visitTypeFilter === 'ALL' || apt.visitType === visitTypeFilter;
      const roomMatch = roomFilter === 'ALL' || apt.room?.id === roomFilter;
      return visitTypeMatch && roomMatch;
    });
  }, [schedule, visitTypeFilter, roomFilter, optimisticAppointment]);

  const bookedBySlot = useMemo(() => new Map(filteredSchedule.map(a => [a.slot, a])), [filteredSchedule]);
  const showLoadingOverlay = loading && (schedule.length > 0 || !!optimisticAppointment);

  const fetchSchedule = useCallback(async () => {
    if (!doctorId || !date) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const res: GetDoctorScheduleResponse = await apiClient.getDoctorSchedule(doctorId, date);

      // Map backend appointments to slot-wise entries with proper type safety
      const items: AppointmentInSlot[] = (res.appointments || []).map((a) => ({
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
        id: a.id,
        status: (a.status as AppointmentStatus) || AppointmentStatus.SCHEDULED,
        visit: a.visit ? { id: a.visit.id, status: a.visit.status ?? undefined } : undefined,
      }));
      
      setSchedule(items);
    } catch (e) {
      const errorMessage = getErrorMessage(e);
      setError(errorMessage);
      toast({
        variant: "destructive",
        title: "Failed to load schedule",
        description: errorMessage,
      });
    } finally {
      setLoading(false);
    }
  }, [doctorId, date, toast]);

  useEffect(() => {
    void fetchSchedule();
  }, [fetchSchedule, refreshKey]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      cleanupTimeouts.clearAll();
    };
  }, [cleanupTimeouts]);

  const handleCancelAppointment = async (appointment: AppointmentInSlot) => {
    if (!appointment.id || appointment.id.startsWith('optimistic-')) return;
    
    setCancellingAppointment(appointment.id);
    setSelectedAppointment(appointment);
    setShowCancelDialog(true);
  };

  const confirmCancelAppointment = async () => {
    if (!cancellingAppointment) return;
    
    try {
      await apiClient.deleteAppointment(cancellingAppointment);
      
      toast({
        variant: "success",
        title: "Appointment Cancelled",
        description: "The appointment has been successfully cancelled.",
      });
      
      // Refresh the schedule
      await fetchSchedule();
      
      // Notify parent component
      onAppointmentUpdate?.();
      
      // Close dialogs
      setShowCancelDialog(false);
      setSelectedAppointment(null);
      setCancellingAppointment(null);
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      toast({
        variant: "destructive",
        title: "Failed to cancel appointment",
        description: errorMessage,
      });
    }
  };

  const handleStartVisit = (appointment: AppointmentInSlot) => {
    if (!appointment.patient?.id || !appointment.id || appointment.id.startsWith('optimistic-')) return;
    
    // Navigate to visits page with appointment data
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

  return (
    <>
      <Card>
        <CardContent className="p-4">
          {(visitTypeFilter !== 'ALL' || roomFilter !== 'ALL') && (
            <div className="mb-4 p-3 bg-blue-50 rounded-lg">
              <div className="text-sm text-blue-700">
                <span className="font-medium">Filters Active:</span>
                {visitTypeFilter !== 'ALL' && <Badge variant="secondary" className="ml-2">{visitTypeFilter}</Badge>}
                {roomFilterLabel && (
                  <Badge variant="outline" className="ml-2">
                    Room: {roomFilterLabel}
                  </Badge>
                )}
              </div>
            </div>
          )}
          
          <div className="relative" aria-busy={loading}>
            {showLoadingOverlay && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/70 backdrop-blur-sm transition-opacity duration-200">
                <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
                <span className="mt-2 text-sm font-medium text-blue-700">Refreshing schedule…</span>
              </div>
            )}
            <div
              className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3"
              style={showLoadingOverlay ? { pointerEvents: 'none', opacity: 0.6 } : undefined}
            >
            {slots.map((slot) => {
              const booked = bookedBySlot.has(slot);
              const appt = bookedBySlot.get(slot);
              const past = isSlotInPast(slot, date);
              const isNewlyBooked = recentBookedSlot === slot;
              const isBookingInProgress = bookingInProgress === slot;
              const isDisabled = past || isBookingInProgress || disableSlotBooking;
              
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
                        {formatPatientName(appt.patient ?? { name: 'Unknown' })}
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
                          disabled={appt.id?.startsWith('optimistic-')}
                        >
                          <FileText className="h-3 w-3 mr-1" />
                          {appt.visit?.id ? 'Continue Visit' : 'Start Visit'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-xs text-white hover:bg-red-500 hover:bg-opacity-80"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCancelAppointment(appt);
                          }}
                          disabled={appt.id?.startsWith('optimistic-')}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      disabled={isDisabled}
                      style={{
                        backgroundColor: past ? '#f3f4f6' : isBookingInProgress ? '#fbbf24' : disableSlotBooking ? '#f9fafb' : 'white',
                        color: past ? '#9ca3af' : isBookingInProgress ? '#92400e' : disableSlotBooking ? '#94a3b8' : '#374151',
                        borderColor: past ? '#d1d5db' : isBookingInProgress ? '#f59e0b' : '#d1d5db',
                        cursor: isDisabled ? 'not-allowed' : 'pointer'
                      }}
                      onClick={() => !isDisabled && onSelectSlot?.(slot)}
                    >
                      {past ? 'Past' : isBookingInProgress ? 'Booking...' : disableSlotBooking ? 'Select patient first' : 'Book'}
                    </Button>
                  )}
                </div>
              );
            })}
            </div>
          </div>
          
          {filteredSchedule.length === 0 && schedule.length > 0 && (
            <div className="text-center text-gray-500 mt-4 p-4">
              No appointments match the current filters.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Appointment Details Dialog */}
      <Dialog open={!!selectedAppointment && !showCancelDialog} onOpenChange={(v: boolean) => { if (!v) setSelectedAppointment(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Appointment Details</DialogTitle>
          </DialogHeader>
          {selectedAppointment && (
            <div className="space-y-3 text-sm">
              <div><span className="text-gray-600">Date:</span> {date}</div>
              <div><span className="text-gray-600">Slot:</span> {selectedAppointment.slot}</div>
              <div><span className="text-gray-600">Patient:</span> {formatPatientName(selectedAppointment.patient)}</div>
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
            {selectedAppointment && !selectedAppointment.id?.startsWith('optimistic-') && (
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
                <div><span className="font-medium">Patient:</span> {formatPatientName(selectedAppointment.patient)}</div>
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