'use client';

import { LoadingSkeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import AppointmentsCalendar from '@/components/appointments/AppointmentsCalendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { apiClient } from '@/lib/api';
import type { User } from '@/lib/types';
import { getISTDateString } from '@/lib/utils';
import { Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useDashboardUser } from '@/components/layout/dashboard-user-context';
import { ROOM_READ_ROLES } from '@/lib/appointment-access';

function isRealDay(text: string | null): text is string {
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const day = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === text;
}

function AppointmentsPageInner() {
  const search = useSearchParams();
  const prefillPatientId = search.get('patientId') || undefined;
  const dateParam = search.get('date');
  const { user } = useDashboardUser();
  const [doctors, setDoctors] = useState<User[]>([]);
  const [doctorId, setDoctorId] = useState<string>('');
  const [date, setDate] = useState<string>(() => {
    // Default to today (IST). Only restore the stored date if it equals today.
    const today = getISTDateString();
    if (isRealDay(dateParam)) return dateParam;
    if (typeof window === 'undefined') return today;
    try {
      const persisted = localStorage.getItem('appointments.date');
      return persisted === today ? persisted : today;
    } catch {
      return today;
    }
  });
  const [guideDialogOpen, setGuideDialogOpen] = useState<boolean>(false);

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
    <div className="space-y-4">
      <PageHeader title="Appointments" />
      <Dialog open={guideDialogOpen} onOpenChange={setGuideDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Info className="h-5 w-5 text-blue-600" />
              Quick Guide
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <ul className="text-sm text-gray-700 space-y-2">
              <li>• <strong>Scheduled</strong> (left) holds patients booked ahead who still need a confirmation call. <strong>Confirmed</strong> (right) is the doctor&apos;s real day, with walk-ins.</li>
              <li>• When a patient confirms on the call, press <strong>Confirm</strong> on their row. They move to Confirmed at the same time.</li>
              <li>• Type at least 3 letters of a name, or the start of a phone number, in <strong>Patient</strong>. When one patient matches, they are picked for you; when several match, click the right one. Then <strong>click a free time</strong> in either column and press <strong>Book</strong>.</li>
              <li>• <strong>Drag across tiles</strong> to pick a longer time. The booking dialog also lets you change the duration.</li>
              <li>• If the patient already has a time that day, with this doctor or another, a note above the calendar says so. You can still book.</li>
              <li>• <strong>Click</strong> an appointment to see its details, reschedule or cancel it. Doctors, admins and owners also get <strong>Start visit</strong> (or <strong>Continue visit</strong>) on the row of a confirmed patient. Nurses get <strong>Open visit</strong> once the visit has started. Reception has no visit button.</li>
              <li>• <strong>Filters</strong> narrow the calendar by type or room and change the time grid. <strong>Legend</strong> explains the colours.</li>
            </ul>
          </div>
        </DialogContent>
      </Dialog>

      <AppointmentsCalendar
        prefillPatientId={prefillPatientId}
        controlledDoctorId={doctorId}
        controlledDate={date}
        hideHeaderControls
        readsRooms={ROOM_READ_ROLES.includes(user?.role ?? '')}
        role={user?.role}
        leadingControls={
          <>
            <div data-tour="doctor-select" className="flex-[1_1_9rem] sm:flex-none sm:w-48">
              <label className="text-sm text-gray-700">Doctor</label>
              <Select value={doctorId} onValueChange={setDoctorId}>
                <SelectTrigger aria-label="Doctor"><SelectValue placeholder="Select doctor" /></SelectTrigger>
                <SelectContent>
                  {doctors.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.firstName} {d.lastName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div data-tour="date-picker" className="flex-[1_1_9rem] sm:flex-none sm:w-44">
              <label className="text-sm text-gray-700">Date</label>
              <Input aria-label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </>
        }
        trailingControls={
          <Button variant="outline" className="gap-2" onClick={() => setGuideDialogOpen(true)}>
            <Info className="h-4 w-4" />
            Quick Guide
          </Button>
        }
      />
    </div>
  );
}

export default function AppointmentsPage() {
  return (
    <Suspense fallback={<LoadingSkeleton label="Loading appointments…" />}>
      <AppointmentsPageInner />
    </Suspense>
  );
}
