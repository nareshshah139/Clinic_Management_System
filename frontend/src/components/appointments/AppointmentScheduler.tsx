'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { apiClient } from '@/lib/api';
import type { Appointment, User, Patient } from '@/lib/types';
import { Calendar as CalendarIcon } from 'lucide-react';

interface AvailableSlot { time: string; }

export default function AppointmentScheduler() {
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [doctorId, setDoctorId] = useState<string>('');
  const [patientSearch, setPatientSearch] = useState<string>('');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<User[]>([]);
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    void fetchDoctors();
  }, []);

  useEffect(() => {
    if (doctorId && date) void fetchSlots();
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

  const fetchSlots = async () => {
    try {
      setLoading(true);
      const res: any = await apiClient.getAvailableSlots({ doctorId, date });
      const available = (res.availableSlots || res.data || []) as string[];
      setSlots(available.map((s: any) => ({ time: typeof s === 'string' ? s : (s.time || '') })).filter((s: any) => s.time));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to fetch slots', e);
    } finally {
      setLoading(false);
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

  const book = async (patientId: string, time: string) => {
    try {
      setLoading(true);
      const slot = time;
      await apiClient.createAppointment({ doctorId, patientId, date, slot, visitType: 'OPD' });
      await fetchSlots();
      alert('Appointment booked');
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert('Failed to book appointment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><CalendarIcon className="h-5 w-5" /> Appointment Scheduler</CardTitle>
        <CardDescription>Pick a doctor and date to see available slots</CardDescription>
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

        <div>
          <p className="text-sm text-gray-700 mb-2">Available Slots</p>
          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2">{[...Array(12)].map((_, i) => (<div key={i} className="h-9 bg-gray-100 rounded animate-pulse" />))}</div>
          ) : slots.length === 0 ? (
            <div className="text-gray-500">No slots available</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
              {slots.map((s) => (
                <Button key={s.time} variant="outline" className="justify-center" onClick={() => {
                  const pid = patientSearch.split('|')[1]?.trim();
                  if (!pid) { alert('Select a patient first'); return; }
                  void book(pid, s.time);
                }}>{s.time}</Button>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
} 