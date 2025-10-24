'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, ChevronLeft, ChevronRight, Clock, User, Stethoscope } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { getISTDateString, minutesToHHMM, hhmmToMinutes, isSlotInPast } from '@/lib/utils';
import type { RoomSchedule } from '@/lib/types';
import { AppointmentStatus } from '@cms/shared-types';

import type { Room } from '@/lib/types';

export default function RoomCalendar() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomSchedules, setRoomSchedules] = useState<Record<string, RoomSchedule>>({});
  const [selectedRoomType, setSelectedRoomType] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [gridMinutes, setGridMinutes] = useState<number>(30);
  const schedulesAbortRef = useRef<AbortController | null>(null);
  const fetchRoomsRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchSchedulesRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Tooltip state (fixed-position hover card)
  const [hoveredApt, setHoveredApt] = useState<any | null>(null);
  const [hoveredRoomInfo, setHoveredRoomInfo] = useState<{ name: string; type: string } | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null);
  const [tooltipLocked, setTooltipLocked] = useState<boolean>(false);


  // Generate time grid from 8 AM to 8 PM using selected granularity (min 10 minutes)
  const timeSlots = (() => {
    const slots: { label: string; startMin: number; endMin: number }[] = [];
    const start = 9 * 60;
    const end = 18 * 60;
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
    } catch (error: any) {
      console.error('❌ Error fetching rooms:', error);
      setRooms([]); // Ensure rooms is always an array
      setLoading(false);
      console.error('Failed to fetch rooms:', error?.message || error);
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
            
            return { 
              id: room.id, 
              schedule: schedule
            };
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
    } catch (error: any) {
      console.error('Error fetching room schedules:', error?.message || error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Debounce initial rooms fetch (avoid rapid mounts/rerenders causing bursts)
    if (fetchRoomsRef.current) clearTimeout(fetchRoomsRef.current);
    fetchRoomsRef.current = setTimeout(() => {
      fetchRooms();
    }, 150);
    return () => {
      if (fetchRoomsRef.current) clearTimeout(fetchRoomsRef.current);
    };
  }, []);

  useEffect(() => {
    if (!(Array.isArray(rooms) && rooms.length > 0)) return;
    // Debounce schedule fetches to avoid hammering backend on quick date changes
    if (fetchSchedulesRef.current) clearTimeout(fetchSchedulesRef.current);
    fetchSchedulesRef.current = setTimeout(() => {
      fetchRoomSchedules();
    }, 250);
    return () => {
      if (fetchSchedulesRef.current) clearTimeout(fetchSchedulesRef.current);
    };
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
        <CardContent style={{ overflow: 'visible' }}>
          <div className="overflow-x-auto overflow-y-visible" style={{ overflowY: 'visible' }}>
            <div className="min-w-[800px]" style={{ overflow: 'visible' }}>
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
              <div className="grid grid-cols-[120px_repeat(auto-fit,minmax(200px,1fr))] gap-2" style={{ overflow: 'visible' }}>
                {/* Time gutter (left) */}
                <div className="relative" style={{ height: '80vh' }}>
                  {timeSlots.map((slot) => (
                    <div key={`gutter-${slot.label}`} className="absolute left-0 right-0 flex items-center pl-2 text-xs text-gray-600"
                      style={{ top: `${((slot.startMin - 9*60) * 100) / (9*60)}%`, transform: 'translateY(-50%)' }}
                      id={`time-${slot.label}`}
                    >
                      <Clock className="h-3 w-3 mr-1" />
                      {slot.label}
                    </div>
                  ))}
                </div>
                {/* Room columns */}
                {filteredRooms.map((room) => {
                  const schedule = roomSchedules[room.id];
                  const appointments = schedule?.appointments || [];
                  const dayStart = 9 * 60;
                  const dayEnd = 18 * 60;
                  const total = Math.max(1, dayEnd - dayStart);
                  const dateStr = getISTDateString(selectedDate);
                  const getColor = (vt: string, completed: boolean, slot: string) => {
                    const isPast = isSlotInPast(slot, dateStr);
                    
                    // Completed status - 3 shades lighter
                    if (completed) return 'rgba(226, 232, 240, 0.95)';
                    
                    const upper = (vt || '').toUpperCase();
                    
                    // For past appointments (not completed), use even lighter colors
                    if (isPast) {
                      if (upper === 'PROCEDURE') return 'rgba(245, 237, 254, 0.95)'; // very light purple
                      if (upper === 'TELEMED' || upper === 'TELEMEDICINE') return 'rgba(249, 250, 251, 0.95)'; // very light gray
                      return 'rgba(239, 246, 255, 0.95)'; // very light blue
                    }
                    
                    // Normal colors - all 3 shades lighter
                    if (upper === 'PROCEDURE') return 'rgba(237, 233, 254, 0.95)'; // light purple
                    if (upper === 'TELEMED' || upper === 'TELEMEDICINE') return 'rgba(243, 244, 246, 0.95)'; // light gray
                    return 'rgba(219, 234, 254, 0.95)'; // light blue
                  };
                  const overlapsWith = (a: any, b: any) => {
                    const [as, ae] = (a.slot || '').split('-');
                    const [bs, be] = (b.slot || '').split('-');
                    if (!as || !ae || !bs || !be) return false;
                    const a1 = hhmmToMinutes(as), a2 = hhmmToMinutes(ae);
                    const b1 = hhmmToMinutes(bs), b2 = hhmmToMinutes(be);
                    return a1 < b2 && a2 > b1;
                  };
                  return (
                    <div key={`col-${room.id}`} className="relative bg-white rounded border group/col" style={{ height: '80vh' }}>
                      {/* Horizontal grid lines */}
                      {timeSlots.map((slot) => (
                        <div key={`line-${room.id}-${slot.label}`} className="absolute left-0 right-0 border-t border-gray-200"
                          style={{ top: `${((slot.startMin - dayStart) * 100) / total}%` }}
                        />
                      ))}
                      {/* Appointment blocks */}
                      {appointments.map((apt, idx) => {
                        const [s, e] = (apt.slot || '').split('-');
                        if (!s || !e) return null;
                        const start = Math.max(dayStart, Math.min(hhmmToMinutes(s), dayEnd));
                        const end = Math.max(dayStart, Math.min(hhmmToMinutes(e), dayEnd));
                        if (end <= start) return null;
                        const topPct = ((start - dayStart) * 100) / total;
                        const heightPct = ((end - start) * 100) / total;
                        const getStart = (x: any) => hhmmToMinutes(((x.slot || '').split('-')[0]) || '00:00');
                        const overlapping = appointments
                          .filter((b) => overlapsWith(apt, b))
                          .sort((a, b) => getStart(a) - getStart(b));
                        const index = Math.max(0, overlapping.findIndex((b) => (b.id && apt.id ? b.id === apt.id : b.slot === apt.slot)));
                        const widthPct = 100 / Math.max(1, overlapping.length);
                        const leftPct = index * widthPct;
                        const bg = getColor(apt.visitType || '', apt.status === AppointmentStatus.COMPLETED, apt.slot);
                        return (
                          <div key={`apt-${room.id}-${idx}`} className="absolute rounded"
                            style={{
                              top: `${topPct}%`,
                              height: `${heightPct}%`,
                              left: `${leftPct}%`,
                              width: `${widthPct}%`,
                              backgroundColor: bg,
                              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.2)',
                              pointerEvents: 'none',
                            }}
                          />
                        );
                      })}
                      {/* Floating labels */}
                      {appointments.map((apt, idx) => {
                        const [s, e] = (apt.slot || '').split('-');
                        if (!s || !e) return null;
                        const start = Math.max(dayStart, Math.min(hhmmToMinutes(s), dayEnd));
                        const end = Math.max(dayStart, Math.min(hhmmToMinutes(e), dayEnd));
                        if (end <= start) return null;
                        const topPct = ((start - dayStart) * 100) / total;
                        const heightPct = ((end - start) * 100) / total;
                        return (
                          <div
                            key={`label-${room.id}-${idx}`}
                            className="absolute left-0 right-0 group"
                            style={{ top: `${topPct}%`, height: `${heightPct}%`, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            onMouseEnter={(e) => {
                              const el = (e.currentTarget as HTMLElement) || null;
                              if (!el || typeof el.getBoundingClientRect !== 'function') {
                                // Element may be null if unmounted or event fired during layout changes
                                setTooltipPos(null);
                                return;
                              }
                              const rect = el.getBoundingClientRect();
                              if (!rect) {
                                setTooltipPos(null);
                                return;
                              }
                              setTooltipPos({ top: rect.top + rect.height / 2, left: rect.right + 12 });
                              setHoveredApt(apt);
                              setHoveredRoomInfo({ name: room.name, type: room.type });
                            }}
                            onMouseLeave={() => {
                              if (!tooltipLocked) {
                                setHoveredApt(null);
                                setHoveredRoomInfo(null);
                                setTooltipPos(null);
                              }
                            }}
                          >
                            <div className="font-medium px-1 py-1 text-center transition-all duration-200 group-hover/col:opacity-40 hover:opacity-100" style={{ color: '#000000', fontSize: '0.75rem', lineHeight: '1.2' }}>
                              <div className="truncate font-semibold">
                                {apt.patient.name}
                              </div>
                            </div>
                            
                            {/* Per-tile no inline tooltip: global fixed tooltip below */}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Global fixed tooltip - avoids parent overflow clipping */}
      {hoveredApt && tooltipPos && (
        <div
          className="fixed bg-white shadow-2xl border border-gray-300 rounded-xl"
          style={{
            top: Math.max(8, tooltipPos.top - 120),
            left: tooltipPos.left,
            zIndex: 10000,
            minWidth: 340,
            minHeight: 240,
            padding: 12,
          }}
          onMouseEnter={() => setTooltipLocked(true)}
          onMouseLeave={() => {
            setTooltipLocked(false);
            setHoveredApt(null);
            setHoveredRoomInfo(null);
            setTooltipPos(null);
          }}
        >
          <div className="text-sm space-y-2">
            <div className="border-b border-gray-200 pb-2">
              <div className="font-semibold text-gray-900">{hoveredApt.patient?.name}</div>
              <div className="text-xs text-gray-600">{getISTDateString(selectedDate)} • {hoveredApt.slot}</div>
            </div>
            <div>
              {hoveredApt.patient?.phone && (
                <div className="text-xs"><span className="font-medium text-gray-700">Phone:</span> {hoveredApt.patient.phone}</div>
              )}
              {hoveredApt.patient?.email && (
                <div className="text-xs"><span className="font-medium text-gray-700">Email:</span> {hoveredApt.patient.email}</div>
              )}
            </div>
            <div>
              {hoveredApt.doctor && (
                <div className="text-xs"><span className="font-medium text-gray-700">Doctor:</span> Dr. {hoveredApt.doctor.firstName} {hoveredApt.doctor.lastName}</div>
              )}
              <div className="text-xs">
                <span className="font-medium text-gray-700">Type:</span>
                <span className={`ml-1 px-2 py-0.5 rounded text-xs font-medium ${
                  hoveredApt.visitType === 'PROCEDURE' ? 'bg-red-100 text-red-800' :
                  hoveredApt.visitType === 'TELEMED' ? 'bg-gray-100 text-gray-800' :
                  'bg-blue-100 text-blue-800'
                }`}>
                  {hoveredApt.visitType || 'OPD'}
                </span>
              </div>
              {hoveredApt.status && (
                <div className="text-xs"><span className="font-medium text-gray-700">Status:</span> {hoveredApt.status}</div>
              )}
            </div>
            {hoveredRoomInfo && (
              <div className="text-xs">
                <span className="font-medium text-gray-700">Room:</span> {hoveredRoomInfo.name} ({hoveredRoomInfo.type})
              </div>
            )}
          </div>
        </div>
      )}

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
              <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(219, 234, 254, 0.95)' }} />
              <span className="text-sm">OPD</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(237, 233, 254, 0.95)' }} />
              <span className="text-sm">Procedure</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(243, 244, 246, 0.95)' }} />
              <span className="text-sm">Telemedicine</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(226, 232, 240, 0.95)' }} />
              <span className="text-sm">Completed</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(239, 246, 255, 0.95)' }} />
              <span className="text-sm">Past (OPD)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(245, 237, 254, 0.95)' }} />
              <span className="text-sm">Past (Procedure)</span>
            </div>
          </div>
        </CardContent>
      </Card>

    </div>
  );
} 