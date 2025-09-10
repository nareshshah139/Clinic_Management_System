"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { apiClient } from '@/lib/api';

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
  onSelectSlot 
}: DoctorDayCalendarProps) {
  const [schedule, setSchedule] = useState<AppointmentInSchedule[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentInSchedule | null>(null);

  const slots = useMemo(() => generateSlots(9, 18, 30), []);

  // Filter appointments based on visitType and room filters
  const filteredSchedule = useMemo(() => {
    return schedule.filter(apt => {
      const visitTypeMatch = visitTypeFilter === 'ALL' || apt.visitType === visitTypeFilter;
      const roomMatch = roomFilter === 'ALL' || apt.room?.id === roomFilter;
      return visitTypeMatch && roomMatch;
    });
  }, [schedule, visitTypeFilter, roomFilter]);

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

  useEffect(() => {
    const fetch = async () => {
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
    };
    void fetch();
  }, [doctorId, date]);

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
              
              return (
                <div 
                  key={slot} 
                  className="border rounded-lg p-3 flex flex-col gap-2 transition-all duration-200"
                  style={{
                    backgroundColor: booked 
                      ? (isNewlyBooked ? '#22c55e' : '#3b82f6')
                      : (past ? '#f3f4f6' : 'white'),
                    borderColor: booked 
                      ? (isNewlyBooked ? '#16a34a' : '#2563eb')
                      : (past ? '#d1d5db' : '#e5e7eb'),
                    opacity: past && !booked ? 0.6 : 1,
                    boxShadow: isNewlyBooked ? '0 0 0 2px rgba(34, 197, 94, 0.3)' : 'none'
                  }}
                >
                  <div 
                    className="text-sm font-medium"
                    style={{ color: booked ? 'white' : (past ? '#9ca3af' : '#374151') }}
                  >
                    {slot}
                  </div>
                  
                  {booked && appt ? (
                    <div className="flex flex-col gap-1">
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
                    </div>
                  ) : (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      disabled={past}
                      style={{
                        backgroundColor: past ? '#f3f4f6' : 'white',
                        color: past ? '#9ca3af' : '#374151',
                        borderColor: past ? '#d1d5db' : '#d1d5db',
                        cursor: past ? 'not-allowed' : 'pointer'
                      }}
                      onClick={() => !past && onSelectSlot?.(slot)}
                    >
                      {past ? 'Past' : 'Book'}
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
        </DialogContent>
      </Dialog>
    </>
  );
} 