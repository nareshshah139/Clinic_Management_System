'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiClient } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage, filterRoomsByVisitType, formatPatientName, addMinutesToHHMM, doTimeSlotsOverlap, getSlotDurationMinutes } from '@/lib/utils';
import type { 
  Patient, 
  Room, 
  RoomSchedule, 
  VisitType,
  GetRoomsResponse 
} from '@/lib/types';

interface AppointmentBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doctorId: string;
  date: string;
  slot: string;
  patient: Patient | null;
  onConfirm: (appointmentData: { 
    visitType: VisitType; 
    roomId?: string;
    slot?: string;
  }) => Promise<void>;
  onCancel: () => void;
}

export default function AppointmentBookingDialog({
  open,
  onOpenChange,
  doctorId,
  date,
  slot,
  patient,
  onConfirm,
  onCancel
}: AppointmentBookingDialogProps) {
  const { toast } = useToast();
  const [visitType, setVisitType] = useState<VisitType>('OPD');
  const [selectedRoomId, setSelectedRoomId] = useState<string>('');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomSchedules, setRoomSchedules] = useState<Record<string, RoomSchedule>>({});
  const [loading, setLoading] = useState(false);
  const [fetchingRooms, setFetchingRooms] = useState(false);
  const [fetchingSchedules, setFetchingSchedules] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [durationMinutes, setDurationMinutes] = useState<number>(() => {
    // Default to the slot's current duration if provided, else 30
    const initial = getSlotDurationMinutes(slot);
    return initial > 0 ? initial : 30;
  });

  const derivedSlot = React.useMemo(() => {
    // slot is HH:MM-HH:MM; recompute end using durationMinutes and keep the start
    const [start] = (slot || '').split('-');
    if (!start || !/\d{2}:\d{2}/.test(start)) return slot;
    const newEnd = addMinutesToHHMM(start, durationMinutes);
    return `${start}-${newEnd}`;
  }, [slot, durationMinutes]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (open) {
      void fetchRooms();
    } else {
      // Reset form when dialog closes
      setVisitType('OPD');
      setSelectedRoomId('');
      setRoomSchedules({});
      setErrors([]);
    }
  }, [open]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (rooms.length > 0 && visitType) {
      void fetchRoomSchedules();
    }
  }, [rooms, date, visitType]);

  const fetchRooms = useCallback(async () => {
    try {
      setFetchingRooms(true);
      const res: GetRoomsResponse = await apiClient.getRooms();
      setRooms(res.rooms || []);
    } catch (e) {
      const errorMessage = getErrorMessage(e);
      toast({
        variant: "destructive",
        title: "Failed to fetch rooms",
        description: errorMessage,
      });
    } finally {
      setFetchingRooms(false);
    }
  }, [toast]);

  const fetchRoomSchedules = useCallback(async () => {
    try {
      setFetchingSchedules(true);
      const schedules: Record<string, RoomSchedule> = {};
      
      // Filter rooms based on appointment type using improved logic
      const relevantRooms = filterRoomsByVisitType(rooms, visitType);

      // If no specific room type found, show all active rooms
      const roomsToCheck = relevantRooms.length > 0 ? relevantRooms : rooms.filter(r => r.isActive);

      await Promise.all(
        roomsToCheck.map(async (room) => {
          try {
            const schedule: RoomSchedule = await apiClient.getRoomSchedule(room.id, date);
            schedules[room.id] = schedule;
          } catch (e) {
            // Log error but don't show toast for individual room failures
            console.error(`Failed to fetch schedule for room ${room.name}`, e);
          }
        })
      );
      
      setRoomSchedules(schedules);
    } catch (e) {
      const errorMessage = getErrorMessage(e);
      toast({
        variant: "destructive",
        title: "Failed to fetch room schedules",
        description: errorMessage,
      });
    } finally {
      setFetchingSchedules(false);
    }
  }, [rooms, visitType, date, toast]);

  const isSlotAvailable = (roomId: string, slotTime: string): boolean => {
    const schedule = roomSchedules[roomId];
    if (!schedule) return true;
    // Use overlap detection with the derived slot (so changing duration re-validates)
    return !schedule.appointments.some(apt => doTimeSlotsOverlap(apt.slot, slotTime));
  };

  const getRelevantRooms = () => {
    return filterRoomsByVisitType(rooms.filter(r => r.isActive), visitType);
  };

  const validateForm = (): string[] => {
    const validationErrors: string[] = [];
    
    if (!visitType) {
      validationErrors.push('Please select an appointment type');
    }
    
    if (!patient) {
      validationErrors.push('Patient information is missing');
    }
    
    if (!doctorId) {
      validationErrors.push('Doctor information is missing');
    }
    
    if (!date) {
      validationErrors.push('Date information is missing');
    }
    
    if (!slot) {
      validationErrors.push('Time slot information is missing');
    }

    if (visitType === 'PROCEDURE' && !selectedRoomId) {
      validationErrors.push('Please select a room for the procedure');
    }
    
    // Check if selected room is available
    if (selectedRoomId && !isSlotAvailable(selectedRoomId, derivedSlot)) {
      validationErrors.push('Selected room is not available at this time');
    }

    return validationErrors;
  };

  const handleConfirm = async () => {
    const validationErrors = validateForm();
    setErrors(validationErrors);
    
    if (validationErrors.length > 0) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: validationErrors[0],
      });
      return;
    }

    setLoading(true);
    try {
      await onConfirm({ 
        visitType, 
        roomId: selectedRoomId || undefined,
        slot: derivedSlot
      });
    } catch (error) {
      // Error handling is done in parent component
      // Just re-throw to maintain error flow
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const relevantRooms = getRelevantRooms();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Book Appointment</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Appointment Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
            <div><span className="font-medium">Patient:</span> {formatPatientName(patient)}</div>
            <div><span className="font-medium">Phone:</span> {patient?.phone || 'N/A'}</div>
            <div><span className="font-medium">Date:</span> {date}</div>
            <div><span className="font-medium">Time Slot:</span> {derivedSlot}</div>
          </div>

          {/* Duration selector */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">Duration</label>
            <Select value={String(durationMinutes)} onValueChange={(v: string) => setDurationMinutes(parseInt(v, 10))}>
              <SelectTrigger>
                <SelectValue placeholder="Select duration" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15">15 minutes</SelectItem>
                <SelectItem value="20">20 minutes</SelectItem>
                <SelectItem value="30">30 minutes</SelectItem>
                <SelectItem value="45">45 minutes</SelectItem>
                <SelectItem value="60">60 minutes</SelectItem>
                <SelectItem value="90">90 minutes</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500 mt-1">Adjusts end time and validates room availability for the new duration.</p>
          </div>

          {/* Validation Errors */}
          {errors.length > 0 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="text-sm text-red-800">
                <div className="font-medium mb-1">Please fix the following errors:</div>
                <ul className="list-disc list-inside space-y-1">
                  {errors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Appointment Type Selection */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">Appointment Type *</label>
            <Select value={visitType} onValueChange={(value: VisitType) => {
              setVisitType(value);
              setSelectedRoomId(''); // Reset room selection when visit type changes
              setErrors([]);
            }}>
              <SelectTrigger>
                <SelectValue placeholder="Select appointment type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="OPD">OPD Consultation</SelectItem>
                <SelectItem value="PROCEDURE">Procedure</SelectItem>
                <SelectItem value="TELEMED">Telemedicine</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500 mt-1">
              {visitType === 'OPD' && 'Regular outpatient consultation'}
              {visitType === 'PROCEDURE' && 'Medical procedure or surgery - room selection required'}
              {visitType === 'TELEMED' && 'Virtual consultation via video call'}
            </p>
          </div>

          {/* Room Selection and Availability */}
          {visitType && (
            <div>
              <label className="text-sm font-medium text-gray-700 mb-3 block">
                Room Availability for {visitType} {visitType === 'PROCEDURE' && '*'}
              </label>
              
              {fetchingRooms ? (
                <div className="text-center py-8">Loading rooms...</div>
              ) : fetchingSchedules ? (
                <div className="text-center py-8">Loading room schedules...</div>
              ) : relevantRooms.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>No {visitType.toLowerCase()} rooms available</p>
                  <p className="text-xs mt-2">
                    You can still book this appointment. Room assignment can be done later.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {relevantRooms.map((room) => {
                    const isAvailable = isSlotAvailable(room.id, derivedSlot);
                    const schedule = roomSchedules[room.id];
                    const conflictingAppointment = schedule?.appointments.find(apt => doTimeSlotsOverlap(apt.slot, derivedSlot));
                    
                    return (
                      <Card 
                        key={room.id} 
                        className={`cursor-pointer transition-all ${
                          selectedRoomId === room.id 
                            ? 'ring-2 ring-blue-500 bg-blue-50' 
                            : isAvailable 
                            ? 'hover:bg-gray-50' 
                            : 'bg-red-50 border-red-200'
                        }`}
                        onClick={() => {
                          if (isAvailable) {
                            setSelectedRoomId(selectedRoomId === room.id ? '' : room.id);
                            setErrors([]); // Clear errors when selecting a room
                          }
                        }}
                      >
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-lg">{room.name}</CardTitle>
                            <Badge 
                              variant={isAvailable ? 'default' : 'destructive'}
                              className="text-xs"
                            >
                              {isAvailable ? 'Available' : 'Occupied'}
                            </Badge>
                          </div>
                          <p className="text-sm text-gray-600">{room.type} • Capacity: {room.capacity}</p>
                        </CardHeader>
                        <CardContent className="pt-0">
                          {!isAvailable && conflictingAppointment && (
                            <div className="text-sm text-red-600">
                              <p className="font-medium">Conflict with:</p>
                              <p>{conflictingAppointment.patient.name}</p>
                              <p>Dr. {conflictingAppointment.doctor.firstName} {conflictingAppointment.doctor.lastName}</p>
                            </div>
                          )}
                          {isAvailable && (
                            <p className="text-sm text-green-600">✓ Available for {derivedSlot}</p>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
              
              {visitType === 'PROCEDURE' && relevantRooms.length > 0 && (
                <p className="text-xs text-gray-500 mt-2">
                  * Room selection is required for procedures. Click on an available room to select it.
                </p>
              )}
              
              {visitType !== 'PROCEDURE' && (
                <p className="text-xs text-gray-500 mt-2">
                  Room selection is optional for {visitType.toLowerCase()} appointments.
                </p>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end space-x-3 pt-4 border-t">
            <Button variant="outline" onClick={onCancel} disabled={loading}>
              Cancel
            </Button>
            <Button 
              onClick={handleConfirm} 
              disabled={loading || (visitType === 'PROCEDURE' && !selectedRoomId)}
            >
              {loading ? 'Booking...' : 'Confirm Booking'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
} 