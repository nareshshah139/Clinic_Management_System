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
      <PageHeader title="Rooms" description="Room schedules, occupancy and setup." actions={<><QuickGuide
          title="Rooms guide"
          sections={[
            {
              title: "Calendar View",
              items: [
                "View all room occupancy in a visual calendar format",
                "See which appointments are assigned to each room",
                "Identify available time slots across all rooms",
                "Click on appointments to view details or reassign rooms"
              ]
            },
            {
              title: "Managing Rooms",
              items: [
                "Add new rooms with name, type, and capacity",
                "Configure room amenities and equipment",
                "Set room availability schedules",
                "Mark rooms as active or inactive as needed"
              ]
            },
            {
              title: "Room Assignment",
              items: [
                "Assign rooms to appointments during booking",
                "Reassign rooms if conflicts arise",
                "View room utilization metrics",
                "Track room cleaning and maintenance schedules"
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