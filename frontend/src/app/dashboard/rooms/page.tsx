'use client';

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
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Room Management</h1>
          <p className="text-gray-600 mt-1">
            Manage room schedules, occupancy, and configurations
          </p>
        </div>
        <QuickGuide
          title="Room Management Guide"
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
        />
      </div>

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
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="h-5 w-5 text-blue-600" />
            <h2 className="text-xl font-semibold">Room Calendar & Occupancy</h2>
          </div>
          <RoomCalendar />
        </TabsContent>

        {canManageRooms && (
          <TabsContent value="management" className="space-y-6">
            <div className="flex items-center gap-2 mb-4">
              <Settings className="h-5 w-5 text-blue-600" />
              <h2 className="text-xl font-semibold">Room Configuration & Management</h2>
            </div>
            <RoomsManagement />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
} 