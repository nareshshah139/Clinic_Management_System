'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, ChevronLeft, ChevronRight, Clock, User, Stethoscope } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { getISTDateString, minutesToHHMM, hhmmToMinutes } from '@/lib/utils';
import type { RoomSchedule } from '@/lib/types';
import { AppointmentStatus } from '@cms/shared-types';
import { useToast } from '@/hooks/use-toast';

import type { Room } from '@/lib/types';

export default function RoomCalendar() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomSchedules, setRoomSchedules] = useState<Record<string, RoomSchedule>>({});
  const [selectedRoomType, setSelectedRoomType] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [gridMinutes, setGridMinutes] = useState<number>(30);

  // Generate time grid from 8 AM to 8 PM using selected granularity (min 10 minutes)
  const timeSlots = (() => {
    const slots: { label: string; startMin: number; endMin: number }[] = [];
    const start = 8 * 60;
    const end = 20 * 60;
    const step = Math.max(10, Math.floor(gridMinutes));
    for (let m = start; m < end; m += step) {
      const startMin = m;
      const endMin = Math.min(m + step, end);
      slots.push({ label: minutesToHHMM(startMin), startMin, endMin });
    }
    return slots;
  })();

  const fetchRooms = async () => {
    try {
      console.log('🏠 Fetching rooms...');
      let response: any;
      try {
        // Prefer endpoint with broader read permissions
        response = await apiClient.getRooms();
      } catch (err) {
        // Fallback to admin/doctor-only endpoint if needed
        response = await apiClient.getAllRooms();
      }
      const roomsData = response?.rooms || response;
      const roomsList = Array.isArray(roomsData) ? roomsData : [];
      setRooms(roomsList);
      if (roomsList.length === 0) {
        setLoading(false);
      }
    } catch (error) {
      console.error('❌ Error fetching rooms:', error);
      setRooms([]); // Ensure rooms is always an array
      setLoading(false);
      toast({ variant: 'destructive', title: 'Failed to fetch rooms' });
    }
  };

  const fetchRoomSchedules = async () => {
    try {
      // Use clinic timezone (IST) date string to align with backend expectations
      const dateStr = getISTDateString(selectedDate);
      const schedules: Record<string, RoomSchedule> = {};
      const results = await Promise.all(
        rooms.map(async (room) => {
          try {
            const schedule = await apiClient.getRoomSchedule(room.id, dateStr);
            return { id: room.id, schedule };
          } catch (error) {
            console.error(`Error fetching schedule for room ${room.id}:`, error);
            return {
              id: room.id,
              schedule: {
                roomId: room.id,
                roomName: room.name,
                roomType: room.type,
                date: dateStr,
                appointments: [],
              } as RoomSchedule,
            };
          }
        })
      );
      for (const { id, schedule } of results) {
        schedules[id] = schedule;
      }
      setRoomSchedules(schedules);
    } catch (error) {
      console.error('Error fetching room schedules:', error);
      toast({ variant: 'destructive', title: 'Failed to fetch room schedules' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRooms();
  }, []);

  useEffect(() => {
    if (Array.isArray(rooms) && rooms.length > 0) {
      fetchRoomSchedules();
    }
  }, [selectedDate, rooms]);

  const filteredRooms = Array.isArray(rooms) ? rooms.filter(room => {
    const matchesType = selectedRoomType === 'all' || room.type === selectedRoomType;
    const matchesQuery = !search.trim() || room.name.toLowerCase().includes(search.trim().toLowerCase());
    return room.isActive && matchesType && matchesQuery;
  }) : [];

  const getAppointmentsForRange = (roomId: string, startMin: number, endMin: number) => {
    const schedule = roomSchedules[roomId];
    if (!schedule) return [] as RoomSchedule['appointments'];
    const overlaps = schedule.appointments.filter((apt) => {
      const parts = apt.slot?.split('-') || [];
      if (parts.length !== 2) return false;
      const slotStart = hhmmToMinutes(parts[0]);
      const slotEnd = hhmmToMinutes(parts[1]);
      return slotStart < endMin && slotEnd > startMin;
    });
    return overlaps.sort((a, b) => hhmmToMinutes((a.slot || '00:00-00:00').split('-')[0]) - hhmmToMinutes((b.slot || '00:00-00:00').split('-')[0]));
  };

  const navigateDate = (direction: 'prev' | 'next') => {
    const newDate = new Date(selectedDate);
    newDate.setDate(selectedDate.getDate() + (direction === 'next' ? 1 : -1));
    setSelectedDate(newDate);
  };

  const scrollToCurrentHour = () => {
    const now = new Date();
    const hour = now.getHours();
    const minutes = now.getMinutes();
    const withinDay = hour * 60 + minutes;
    // Find nearest slot label
    let nearest = timeSlots[0]?.label;
    let minDiff = Number.MAX_SAFE_INTEGER;
    for (const s of timeSlots) {
      const diff = Math.abs(s.startMin - withinDay);
      if (diff < minDiff) {
        minDiff = diff;
        nearest = s.label;
      }
    }
    const anchor = document.getElementById(`time-${nearest}`);
    if (anchor) {
      anchor.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    }
  };

  const roomTypes = ['all', ...new Set(Array.isArray(rooms) ? rooms.map(room => room.type) : [])];

  const getRoomTypeIcon = (type: string) => {
    switch (type) {
      case 'Consultation': return '🩺';
      case 'Procedure': return '⚕️';
      case 'Operation': return '🏥';
      case 'Telemedicine':
      case 'Telemed':
        return '💻';
      case 'Emergency': return '🚨';
      default: return '🏢';
    }
  };

  const getVisitTypeColor = (visitType: string) => {
    const vt = (visitType || '').toUpperCase();
    switch (vt) {
      case 'OPD':
        return 'bg-blue-100 text-blue-800';
      case 'PROCEDURE':
        return 'bg-purple-100 text-purple-800';
      case 'TELEMED':
      case 'TELEMEDICINE':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Calendar className="h-8 w-8 animate-spin mx-auto mb-2" />
          <p>Loading room calendar...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigateDate('prev')}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2 min-w-[200px]">
              <Calendar className="h-5 w-5 text-blue-600" />
              <h2 className="text-lg font-semibold">
                {selectedDate.toLocaleDateString('en-US', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </h2>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigateDate('next')}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Select value={selectedRoomType} onValueChange={setSelectedRoomType}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by room type" />
            </SelectTrigger>
            <SelectContent>
              {roomTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {type === 'all' ? 'All Room Types' : `${getRoomTypeIcon(type)} ${type}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input
            className="border rounded px-3 py-2 text-sm w-[220px]"
            placeholder="Search room name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button
            variant="outline"
            onClick={() => setSelectedDate(new Date())}
          >
            Today
          </Button>
          <Button variant="outline" onClick={scrollToCurrentHour}>Now</Button>
          <Select value={String(gridMinutes)} onValueChange={(v: string) => setGridMinutes(Math.max(10, parseInt(v, 10) || 10))}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Grid" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="10">Grid: 10m</SelectItem>
              <SelectItem value="15">Grid: 15m</SelectItem>
              <SelectItem value="20">Grid: 20m</SelectItem>
              <SelectItem value="30">Grid: 30m</SelectItem>
              <SelectItem value="45">Grid: 45m</SelectItem>
              <SelectItem value="60">Grid: 60m</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Room Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <User className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm text-gray-600">Total Rooms</p>
                <p className="text-2xl font-bold">{filteredRooms.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm text-gray-600">Available</p>
                <p className="text-2xl font-bold text-green-600">
                  {filteredRooms.filter(room => {
                    const schedule = roomSchedules[room.id];
                    return !schedule || schedule.appointments.length === 0;
                  }).length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <User className="h-5 w-5 text-orange-600" />
              <div>
                <p className="text-sm text-gray-600">Occupied</p>
                <p className="text-2xl font-bold text-orange-600">
                  {filteredRooms.filter(room => {
                    const schedule = roomSchedules[room.id];
                    return schedule && schedule.appointments.length > 0;
                  }).length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5 text-purple-600" />
              <div>
                <p className="text-sm text-gray-600">Appointments</p>
                <p className="text-2xl font-bold text-purple-600">
                  {Object.values(roomSchedules).reduce((total, schedule) => 
                    total + schedule.appointments.length, 0
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Calendar Grid */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Room Occupancy Calendar
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div className="min-w-[800px]">
              {/* Header Row */}
              <div className="grid grid-cols-[120px_repeat(auto-fit,minmax(200px,1fr))] gap-2 mb-2">
                <div className="font-semibold text-sm text-gray-600 p-2">Time</div>
                {filteredRooms.map((room) => (
                  <div key={room.id} className="text-center p-2 bg-gray-50 rounded">
                    <div className="font-semibold text-sm">{room.name}</div>
                    <div className="text-xs text-gray-600 flex items-center justify-center gap-1">
                      <span>{getRoomTypeIcon(room.type)}</span>
                      <span>{room.type}</span>
                      <Badge variant="outline" className="text-xs">
                        Cap: {room.capacity}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>

              {/* Time Slots */}
              {timeSlots.map((slot) => (
                <div key={slot.label} className="grid grid-cols-[120px_repeat(auto-fit,minmax(200px,1fr))] gap-2 mb-2">
                  <div className="flex items-center p-2 font-medium text-sm text-gray-700" id={`time-${slot.label}`}>
                    <Clock className="h-4 w-4 mr-1" />
                    {slot.label}
                  </div>
                  {filteredRooms.map((room) => {
                    const appointments = getAppointmentsForRange(room.id, slot.startMin, slot.endMin);
                    return (
                      <div key={`${room.id}-${slot.label}`} className="p-2 min-h-[56px]">
                        {appointments.length > 0 ? (
                          <div className="space-y-1">
                            {appointments.map((appointment) => (
                              <div key={appointment.id} className="bg-blue-50 border border-blue-200 rounded p-2">
                                <div className="flex items-start justify-between mb-1">
                                  <Badge 
                                    variant="secondary" 
                                    className={`text-xs ${getVisitTypeColor(appointment.visitType || '')}`}
                                  >
                                    {appointment.visitType || 'APPT'}
                                  </Badge>
                                  <Badge 
                                    variant={appointment.status === AppointmentStatus.SCHEDULED ? 'default' : 'secondary'}
                                    className="text-xs"
                                  >
                                    {appointment.status}
                                  </Badge>
                                </div>
                                <div className="text-xs font-medium text-gray-900 truncate">
                                  {appointment.patient.name}
                                </div>
                                <div className="text-[11px] text-gray-600 truncate">
                                  Dr. {appointment.doctor.firstName} {appointment.doctor.lastName}
                                </div>
                                <div className="text-[11px] text-gray-500 mt-1">
                                  {appointment.slot}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="bg-green-50 border border-green-200 rounded p-2 h-full flex items-center justify-center">
                            <span className="text-xs text-green-600 font-medium">Available</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <Card>
        <CardContent className="p-4">
          <h3 className="font-semibold mb-3">Legend</h3>
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-green-50 border border-green-200 rounded"></div>
              <span className="text-sm">Available</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-blue-50 border border-blue-200 rounded"></div>
              <span className="text-sm">Occupied</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="bg-blue-100 text-blue-800 text-xs">OPD</Badge>
              <span className="text-sm">OPD Consultation</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="bg-purple-100 text-purple-800 text-xs">Procedure</Badge>
              <span className="text-sm">Medical Procedure</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="bg-green-100 text-green-800 text-xs">Telemedicine</Badge>
              <span className="text-sm">Telemedicine</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 