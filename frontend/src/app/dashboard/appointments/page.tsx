'use client';

import { LoadingSkeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import AppointmentScheduler from '@/components/appointments/AppointmentScheduler';
import AppointmentsCalendar from '@/components/appointments/AppointmentsCalendar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { apiClient } from '@/lib/api';
import type { User } from '@/lib/types';
import { getISTDateString } from '@/lib/utils';
import { ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useDashboardUser } from '@/components/layout/dashboard-user-context';
import { ROOM_READ_ROLES } from '@/lib/appointment-access';
import { resolveDefaultDoctorId } from '@/lib/default-visit-doctor';

function AppointmentsPageInner() {
  const search = useSearchParams();
  const prefillPatientId = search.get('patientId') || undefined;
  const { user, loading: userLoading } = useDashboardUser();
  const [doctors, setDoctors] = useState<User[]>([]);
  const [doctorId, setDoctorId] = useState<string>('');
  const [date, setDate] = useState<string>(() => {
    // Default to today (IST). Only restore the stored date if it equals today.
    const today = getISTDateString();
    if (typeof window === 'undefined') return today;
    try {
      const persisted = localStorage.getItem('appointments.date');
      return persisted === today ? persisted : today;
    } catch {
      return today;
    }
  });
  const [guideDialogOpen, setGuideDialogOpen] = useState<boolean>(false);

  const loadDoctors = useCallback(async () => {
    try {
      const res: any = await apiClient.getUsers({ limit: 100 });
      setDoctors((res.users || res.data || []).filter((u: User) => u.role === 'DOCTOR'));
    } catch {
      // silently ignore for page-level; child components handle errors
    }
  }, []);

  useEffect(() => { void loadDoctors(); }, [loadDoctors]);

  useEffect(() => {
    if (doctorId || userLoading || doctors.length === 0) return;
    let persistedId: string | null = null;
    try { persistedId = localStorage.getItem('appointments.doctorId'); } catch {}
    const listed = (id: string | null) => (id && doctors.some((d) => d.id === id) ? id : '');
    const signedInDoctor = resolveDefaultDoctorId({ role: user?.role, userId: user?.id, current: '' });
    setDoctorId(listed(signedInDoctor) || listed(persistedId) || doctors[0].id);
  }, [doctors, doctorId, user, userLoading]);

  // Persist selections
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { if (doctorId) localStorage.setItem('appointments.doctorId', doctorId); } catch {}
  }, [doctorId]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { if (date) localStorage.setItem('appointments.date', date); } catch {}
  }, [date]);
  const shiftDate = (days: number) => {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    setDate(d.toISOString().slice(0, 10));
  };

  const doctorAndDate = (
    <>
      <div data-tour="doctor-select">
        <Select value={doctorId} onValueChange={setDoctorId}>
          <SelectTrigger size="sm" aria-label="Doctor"><SelectValue placeholder="Select doctor" /></SelectTrigger>
          <SelectContent>
            {doctors.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.firstName} {d.lastName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div data-tour="date-picker" className="flex items-center gap-1">
        <Button variant="outline" size="icon" className="size-8" aria-label="Previous day" onClick={() => shiftDate(-1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Input aria-label="Date" className="h-8 w-40" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        <Button variant="outline" size="sm" disabled={date === getISTDateString()} onClick={() => setDate(getISTDateString())}>Today</Button>
        <Button variant="outline" size="icon" className="size-8" aria-label="Next day" onClick={() => shiftDate(1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </>
  );

  return (
    <Tabs defaultValue="calendar" className="space-y-3">
      <PageHeader
        title="Appointments"
        actions={
          <>
            <TabsList data-tour="view-tabs">
              <TabsTrigger value="calendar">Calendar</TabsTrigger>
              <TabsTrigger value="slots">Slots</TabsTrigger>
            </TabsList>
            <Button variant="outline" size="icon" aria-label="Quick Guide" title="Quick Guide" onClick={() => setGuideDialogOpen(true)}>
              <Info className="h-4 w-4" />
            </Button>
          </>
        }
      />

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
              <li>• When a patient confirms on the call, click them and press <strong>Confirm</strong>. They move to Confirmed at the same time.</li>
              <li>• <strong>Search patient</strong> by name or phone, then <strong>click a free time</strong> in either column to book into that calendar</li>
              <li>• Calendar auto-finds 15-min slots even in larger grid views</li>
              <li>• <strong>Click</strong> an appointment to view, confirm, reschedule or cancel it</li>
              <li>• <strong>Drag across tiles</strong> to select custom time ranges</li>
              <li>• Adjust appointment duration in the booking dialog (15/30/45/60/90 min)</li>
            </ul>
          </div>
        </DialogContent>
      </Dialog>

      <TabsContent value="calendar">
        <AppointmentsCalendar 
          prefillPatientId={prefillPatientId}
          controlledDoctorId={doctorId}
          controlledDate={date}
          hideHeaderControls
          toolbarLead={doctorAndDate}
          readsRooms={ROOM_READ_ROLES.includes(user?.role ?? '')}
        />
      </TabsContent>
      <TabsContent value="slots" className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">{doctorAndDate}</div>
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
    <Suspense fallback={<LoadingSkeleton label="Loading appointments…" />}>
      <AppointmentsPageInner />
    </Suspense>
  );
}
