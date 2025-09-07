"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { apiClient } from '@/lib/api';

type AppointmentInSchedule = {
  slot: string;
  patient?: { id: string; name: string };
};

export interface DoctorDayCalendarProps {
  doctorId: string;
  date: string; // YYYY-MM-DD
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

export default function DoctorDayCalendar({ doctorId, date, onSelectSlot }: DoctorDayCalendarProps) {
  const [schedule, setSchedule] = useState<AppointmentInSchedule[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const slots = useMemo(() => generateSlots(9, 18, 30), []);
  const bookedBySlot = useMemo(() => new Map(schedule.map(a => [a.slot, a])), [schedule]);

  useEffect(() => {
    const fetch = async () => {
      if (!doctorId || !date) return;
      try {
        setLoading(true);
        const res: any = await apiClient.getDoctorSchedule(doctorId, date);
        // Map backend appointments to slot-wise entries
        const items = (res.appointments || []).map((a: any) => ({
          slot: a.slot,
          patient: a.patient ? { id: a.patient.id, name: a.patient.name } : undefined,
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
    <Card>
      <CardContent className="p-0">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0">
          <div className="col-span-1 md:col-span-2 lg:col-span-3">
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-0">
              {slots.map((slot) => {
                const booked = bookedBySlot.has(slot);
                const appt = bookedBySlot.get(slot);
                return (
                  <div key={slot} className="border p-2 flex items-center justify-between">
                    <div className="text-sm font-medium">{slot}</div>
                    {booked ? (
                      <div className="text-xs text-gray-600 truncate">Booked{appt?.patient?.name ? ` — ${appt?.patient?.name}` : ''}</div>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => onSelectSlot?.(slot)}>
                        Book
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
} 