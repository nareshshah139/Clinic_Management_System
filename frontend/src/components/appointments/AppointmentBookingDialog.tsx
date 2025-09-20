'use client';

import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiClient } from '@/lib/api';
import type { Patient } from '@/lib/types';

interface Room {
  id: string;
  name: string;
  type: string;
  capacity: number;
  isActive: boolean;
}

interface RoomSchedule {
  roomId: string;
  roomName: string;
  roomType: string;
  date: string;
  appointments: Array<{
    slot: string;
    patient: { id: string; name: string; phone?: string };
    doctor: { id: string; firstName: string; lastName: string };
  }>;
}

interface AppointmentBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doctorId: string;
  date: string;
  slot: string;
  patient: Patient | null;
  onConfirm: (appointmentData: { 
    visitType: 'OPD' | 'PROCEDURE' | 'TELEMED'; 
    roomId?: string;
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
  const [visitType, setVisitType] = useState<'OPD' | 'PROCEDURE' | 'TELEMED'>('OPD');
  const [selectedRoomId, setSelectedRoomId] = useState<string>('');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomSchedules, setRoomSchedules] = useState<Record<string, RoomSchedule>>({});
  const [loading, setLoading] = useState(false);
  const [fetchingRooms, setFetchingRooms] = useState(false);

  useEffect(() => {
    if (open) {
      void fetchRooms();
    } else {
      // Reset form when dialog closes
      setVisitType('OPD');
      setSelectedRoomId('');
      setRoomSchedules({});
    }
  }, [open]);

  useEffect(() => {
    if (rooms.length > 0 && visitType) {
      void fetchRoomSchedules();
    }
  }, [rooms, date, visitType]);

  const fetchRooms = async () => {
    try {
      setFetchingRooms(true);
      const res: any = await apiClient.getRooms();
      setRooms(res.rooms || []);
    } catch (e) {
      console.error('Failed to fetch rooms', e);
    } finally {
      setFetchingRooms(false);
    }
  };

  const fetchRoomSchedules = async () => {
    try {
      const schedules: Record<string, RoomSchedule> = {};
      
      // Filter rooms based on appointment type
      const relevantRooms = rooms.filter(room => {
        if (visitType === 'PROCEDURE') {
          return room.type.toLowerCase().includes('procedure') || room.type.toLowerCase().includes('operation');
        }
        if (visitType === 'TELEMED') {
          return room.type.toLowerCase().includes('telemed') || room.type.toLowerCase().includes('virtual');
        }
        // For OPD, show consultation rooms (including 'Consult', 'Consultation', 'OPD')
        const roomTypeLower = room.type.toLowerCase();
        return roomTypeLower.includes('consultation') || 
               roomTypeLower.includes('consult') || 
               roomTypeLower.includes('opd');
      });

      // If no specific room type found, show all rooms
      const roomsToCheck = relevantRooms.length > 0 ? relevantRooms : rooms;

      await Promise.all(
        roomsToCheck.map(async (room) => {
          try {
            const schedule: RoomSchedule = await apiClient.getRoomSchedule(room.id, date);
            schedules[room.id] = schedule;
          } catch (e) {
            console.error(`Failed to fetch schedule for room ${room.name}`, e);
          }
        })
      );
      
      setRoomSchedules(schedules);
    } catch (e) {
      console.error('Failed to fetch room schedules', e);
    }
  };

  const isSlotAvailable = (roomId: string, slotTime: string): boolean => {
    const schedule = roomSchedules[roomId];
    if (!schedule) return true;
    return !schedule.appointments.some(apt => apt.slot === slotTime);
  };

  const getRelevantRooms = () => {
    return rooms.filter(room => {
      if (visitType === 'PROCEDURE') {
        return room.type.toLowerCase().includes('procedure') || room.type.toLowerCase().includes('operation');
      }
      if (visitType === 'TELEMED') {
        return room.type.toLowerCase().includes('telemed') || room.type.toLowerCase().includes('virtual');
      }
      // For OPD, show consultation rooms (including 'Consult', 'Consultation', 'OPD')
      const roomTypeLower = room.type.toLowerCase();
      return roomTypeLower.includes('consultation') || 
             roomTypeLower.includes('consult') || 
             roomTypeLower.includes('opd');
    });
  };

  const handleConfirm = async () => {
    if (!visitType) {
      alert('Please select an appointment type');
      return;
    }

    if (visitType === 'PROCEDURE' && !selectedRoomId) {
      alert('Please select a room for the procedure');
      return;
    }

    setLoading(true);
    try {
      await onConfirm({ 
        visitType, 
        roomId: selectedRoomId || undefined 
      });
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
            <div><span className="font-medium">Patient:</span> {patient?.firstName} {patient?.lastName}</div>
            <div><span className="font-medium">Phone:</span> {patient?.phone}</div>
            <div><span className="font-medium">Date:</span> {date}</div>
            <div><span className="font-medium">Time Slot:</span> {slot}</div>
          </div>

          {/* Appointment Type Selection */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">Appointment Type *</label>
            <Select value={visitType} onValueChange={(value: 'OPD' | 'PROCEDURE' | 'TELEMED') => setVisitType(value)}>
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
              ) : relevantRooms.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No {visitType.toLowerCase()} rooms available
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {relevantRooms.map((room) => {
                    const isAvailable = isSlotAvailable(room.id, slot);
                    const schedule = roomSchedules[room.id];
                    const conflictingAppointment = schedule?.appointments.find(apt => apt.slot === slot);
                    
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
                          <p className="text-sm text-gray-600">{room.type}</p>
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
                            <p className="text-sm text-green-600">✓ Available for {slot}</p>
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