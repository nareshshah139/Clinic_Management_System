'use client';

import { useState } from 'react';
import RoomsManagement from '@/components/rooms/RoomsManagement';
import RoomCalendar from '@/components/rooms/RoomCalendar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MapPin, Calendar, Settings } from 'lucide-react';

export default function RoomsPage() {
  const [activeTab, setActiveTab] = useState('calendar');

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Room Management</h1>
          <p className="text-gray-600 mt-1">
            Manage room schedules, occupancy, and configurations
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
          <TabsTrigger value="calendar" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Calendar View
          </TabsTrigger>
          <TabsTrigger value="management" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Manage Rooms
          </TabsTrigger>
        </TabsList>

        <TabsContent value="calendar" className="space-y-6">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="h-5 w-5 text-blue-600" />
            <h2 className="text-xl font-semibold">Room Calendar & Occupancy</h2>
          </div>
          <RoomCalendar />
        </TabsContent>

        <TabsContent value="management" className="space-y-6">
          <div className="flex items-center gap-2 mb-4">
            <Settings className="h-5 w-5 text-blue-600" />
            <h2 className="text-xl font-semibold">Room Configuration & Management</h2>
          </div>
          <RoomsManagement />
        </TabsContent>
      </Tabs>
    </div>
  );
} 