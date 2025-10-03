'use client';

import { useSearchParams } from 'next/navigation';
import AppointmentScheduler from '@/components/appointments/AppointmentScheduler';
import AppointmentsCalendar from '@/components/appointments/AppointmentsCalendar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function AppointmentsPage() {
  const search = useSearchParams();
  const prefillPatientId = search.get('patientId') || undefined;
  return (
    <Tabs defaultValue="calendar" className="space-y-4">
      <TabsList>
        <TabsTrigger value="calendar">Calendar</TabsTrigger>
        <TabsTrigger value="slots">Slots</TabsTrigger>
      </TabsList>
      <TabsContent value="calendar">
        <AppointmentsCalendar prefillPatientId={prefillPatientId} />
      </TabsContent>
      <TabsContent value="slots">
        <AppointmentScheduler prefillPatientId={prefillPatientId} />
      </TabsContent>
    </Tabs>
  );
}