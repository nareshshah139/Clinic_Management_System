'use client';

import { PageHeader } from '@/components/ui/page-header';
import { useState } from 'react';
import RoomsManagement from '@/components/rooms/RoomsManagement';
import RoomCalendar from '@/components/rooms/RoomCalendar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, Settings } from 'lucide-react';
import { useDashboardUser } from '@/components/layout/dashboard-user-context';
import { QuickGuide } from '@/components/common/QuickGuide';

export default function RoomsPage() {
  const [activeTab, setActiveTab] = useState('calendar');
  const { user } = useDashboardUser();
  const role = user?.role;
  const canManageRooms = role === 'ADMIN' || role === 'DOCTOR' || role === 'OWNER';

  return (
    <div className="space-y-6">
      <PageHeader title="Rooms" actions={<><QuickGuide
          title="Rooms guide"
          sections={[
            {
              title: "Calendar View",
              items: [
                "See each active room's bookings for one day, hour by hour",
                "Filter by room type or search by room name",
                "Click a booking to see the patient, doctor and visit type, then open it in Appointments"
              ]
            },
            {
              title: "Manage Rooms (Admin, Doctor, Owner)",
              items: [
                "Add a room with a name, type and capacity",
                "Use the switch to make a room inactive. Inactive rooms leave the calendar",
                "Delete only works for a room that has never had an appointment"
              ]
            },
            {
              title: "Room Assignment",
              items: [
                "Pick a room in the booking dialog when you book an appointment",
                "Procedures need a room. For other visits it is optional"
              ]
            }
          ]}
        /></>} />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
          <TabsTrigger value="calendar" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Calendar View
          </TabsTrigger>
          {canManageRooms && (
            <TabsTrigger value="management" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Manage Rooms
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="calendar" className="space-y-6">
          <div data-tour="room-calendar">
            <RoomCalendar />
          </div>
        </TabsContent>

        {canManageRooms && (
          <TabsContent value="management" className="space-y-6">
            <RoomsManagement />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
} 