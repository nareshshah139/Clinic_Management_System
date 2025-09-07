'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { apiClient } from '@/lib/api';
import type { User, Patient } from '@/lib/types';
import DoctorDayCalendar from '@/components/appointments/DoctorDayCalendar';
import { Calendar as CalendarIcon } from 'lucide-react';

export default function AppointmentsCalendar() {
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [doctorId, setDoctorId] = useState<string>('');
  const [patientSearch, setPatientSearch] = useState<string>('');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<User[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    void fetchDoctors();
  }, []);

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

  const searchPatients = async (q: string) => {
    setPatientSearch(q);
    const res: any = await apiClient.getPatients({ search: q, limit: 10 });
    setPatients((res.data || res.patients || []).map((p: any) => ({
      ...p,
      firstName: p.firstName || p.name?.split(' ')[0] || '',
      lastName: p.lastName || p.name?.split(' ').slice(1).join(' ') || '',
    })));
  };

  const book = async (patientId: string, slot: string) => {
    try {
      setLoading(true);
      await apiClient.createAppointment({ doctorId, patientId, date, slot, visitType: 'OPD' });
      // eslint-disable-next-line no-alert
      alert('Appointment booked');
    } catch (e: any) {
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><CalendarIcon className="h-5 w-5" /> Doctor Calendar</CardTitle>
        <CardDescription>Daily calendar for selected doctor. Click an empty slot to schedule.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
            <label className="text-sm text-gray-700">Patient</label>
            <Input placeholder="Search patient by name/phone" value={patientSearch} onChange={(e) => void searchPatients(e.target.value)} />
            {patientSearch && patients.length > 0 && (
              <div className="mt-2 max-h-40 overflow-auto border rounded">
                {patients.map((p) => (
                  <div key={p.id} className="px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer" onClick={() => setPatientSearch(`${p.firstName} ${p.lastName} | ${p.id}`)}>
                    {p.firstName} {p.lastName} — {p.phone}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DoctorDayCalendar
          doctorId={doctorId}
          date={date}
          onSelectSlot={(slot) => {
            const pid = patientSearch.split('|')[1]?.trim();
            if (!pid) { alert('Select a patient first'); return; }
            void book(pid, slot);
          }}
        />
      </CardContent>
    </Card>
  );
} 