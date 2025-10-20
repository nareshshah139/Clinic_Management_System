'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import AppointmentScheduler from '@/components/appointments/AppointmentScheduler';
import AppointmentsCalendar from '@/components/appointments/AppointmentsCalendar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { apiClient } from '@/lib/api';
import type { User } from '@/lib/types';
import { getISTDateString } from '@/lib/utils';

function AppointmentsPageInner() {
  const search = useSearchParams();
  const prefillPatientId = search.get('patientId') || undefined;
  const [doctors, setDoctors] = useState<User[]>([]);
  const [doctorId, setDoctorId] = useState<string>('');
  const [date, setDate] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    try { return localStorage.getItem('appointments.date') || getISTDateString(); } catch { return getISTDateString(); }
  });

  // Load doctors + persisted doctorId
  const loadDoctors = useCallback(async () => {
    try {
      const res: any = await apiClient.getUsers({ limit: 100 });
      const list: User[] = (res.users || res.data || []).filter((u: User) => u.role === 'DOCTOR');
      setDoctors(list);
      // Initialize doctorId from localStorage if valid, else first doctor
      let persistedId: string | null = null;
      if (typeof window !== 'undefined') {
        try { persistedId = localStorage.getItem('appointments.doctorId'); } catch {}
      }
      const initialId = (persistedId && list.some(d => d.id === persistedId)) ? persistedId : (list[0]?.id || '');
      setDoctorId(initialId);
    } catch {
      // silently ignore for page-level; child components handle errors
    }
  }, []);

  useEffect(() => { void loadDoctors(); }, [loadDoctors]);

  // Persist selections
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { if (doctorId) localStorage.setItem('appointments.doctorId', doctorId); } catch {}
  }, [doctorId]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { if (date) localStorage.setItem('appointments.date', date); } catch {}
  }, [date]);
  return (
    <Tabs defaultValue="calendar" className="space-y-4">
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-sm text-gray-700">Doctor</label>
              <Select value={doctorId} onValueChange={setDoctorId}>
                <SelectTrigger><SelectValue placeholder="Select doctor" /></SelectTrigger>
                <SelectContent>
                  {doctors.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.firstName} {d.lastName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-gray-700">Date</label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <TabsList>
        <TabsTrigger value="calendar">Calendar</TabsTrigger>
        <TabsTrigger value="slots">Slots</TabsTrigger>
      </TabsList>
      <TabsContent value="calendar">
        <AppointmentsCalendar 
          prefillPatientId={prefillPatientId}
          controlledDoctorId={doctorId}
          controlledDate={date}
          hideHeaderControls
        />
      </TabsContent>
      <TabsContent value="slots">
        <AppointmentScheduler 
          prefillPatientId={prefillPatientId}
          controlledDoctorId={doctorId}
          controlledDate={date}
          hideHeaderControls
        />
      </TabsContent>
    </Tabs>
  );
}

export default function AppointmentsPage() {
  return (
    <Suspense fallback={<div className="p-4">Loading...</div>}>
      <AppointmentsPageInner />
    </Suspense>
  );
}