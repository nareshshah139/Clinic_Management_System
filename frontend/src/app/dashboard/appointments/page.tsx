'use client';

import AppointmentScheduler from '@/components/appointments/AppointmentScheduler';
import AppointmentsCalendar from '@/components/appointments/AppointmentsCalendar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function AppointmentsPage() {
  return (
    <Tabs defaultValue="calendar" className="space-y-4">
      <TabsList>
        <TabsTrigger value="calendar">Calendar</TabsTrigger>
        <TabsTrigger value="slots">Slots</TabsTrigger>
      </TabsList>
      <TabsContent value="calendar">
        <AppointmentsCalendar />
      </TabsContent>
      <TabsContent value="slots">
        <AppointmentScheduler />
      </TabsContent>
    </Tabs>
  );
} 