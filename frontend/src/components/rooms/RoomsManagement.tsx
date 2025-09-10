'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { apiClient } from '@/lib/api';
import { Plus, Edit, Trash2, MapPin, Users } from 'lucide-react';

interface Room {
  id: string;
  name: string;
  type: string;
  capacity: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface RoomFormData {
  name: string;
  type: string;
  capacity: number;
  isActive: boolean;
}

export default function RoomsManagement() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [formData, setFormData] = useState<RoomFormData>({
    name: '',
    type: 'Consultation',
    capacity: 1,
    isActive: true,
  });

  const roomTypes = [
    { value: 'Consultation', label: 'Consultation Room', icon: '🩺' },
    { value: 'Procedure', label: 'Procedure Room', icon: '🏥' },
    { value: 'Operation', label: 'Operation Theater', icon: '⚕️' },
    { value: 'Telemed', label: 'Telemedicine Suite', icon: '💻' },
    { value: 'Emergency', label: 'Emergency Room', icon: '🚨' },
    { value: 'Recovery', label: 'Recovery Room', icon: '🛏️' },
    { value: 'Waiting', label: 'Waiting Area', icon: '⏳' },
    { value: 'Laboratory', label: 'Laboratory', icon: '🔬' },
    { value: 'Imaging', label: 'Imaging Room', icon: '📷' },
    { value: 'Pharmacy', label: 'Pharmacy', icon: '💊' },
  ];

  useEffect(() => {
    void fetchRooms();
  }, []);

  const fetchRooms = async () => {
    try {
      setLoading(true);
      const res: any = await apiClient.getAllRooms();
      setRooms(res.rooms || []);
    } catch (e) {
      console.error('Failed to fetch rooms', e);
      alert('Failed to fetch rooms');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert('Please enter a room name');
      return;
    }

    try {
      setLoading(true);
      if (editingRoom) {
        // Update existing room
        await apiClient.updateRoom(editingRoom.id, formData);
      } else {
        // Create new room
        await apiClient.createRoom(formData);
      }
      
      await fetchRooms();
      handleCloseDialog();
    } catch (e: any) {
      console.error('Failed to save room', e);
      alert(`Failed to ${editingRoom ? 'update' : 'create'} room`);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (room: Room) => {
    setEditingRoom(room);
    setFormData({
      name: room.name,
      type: room.type,
      capacity: room.capacity,
      isActive: room.isActive,
    });
    setDialogOpen(true);
  };

  const handleDelete = async (room: Room) => {
    if (!confirm(`Are you sure you want to delete "${room.name}"?`)) {
      return;
    }

    try {
      setLoading(true);
      await apiClient.deleteRoom(room.id);
      await fetchRooms();
    } catch (e: any) {
      console.error('Failed to delete room', e);
      alert('Failed to delete room');
    } finally {
      setLoading(false);
    }
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingRoom(null);
    setFormData({
      name: '',
      type: 'Consultation',
      capacity: 1,
      isActive: true,
    });
  };

  const getRoomTypeInfo = (type: string) => {
    return roomTypes.find(rt => rt.value === type) || { value: type, label: type, icon: '🏢' };
  };

  const getRoomStats = () => {
    const activeRooms = rooms.filter(r => r.isActive);
    const typeStats = roomTypes.map(type => ({
      ...type,
      count: activeRooms.filter(r => r.type === type.value).length,
    }));
    return { total: activeRooms.length, typeStats };
  };

  const stats = getRoomStats();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Rooms Management</h2>
          <p className="text-gray-600">Manage clinic rooms and their configurations</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Add Room
        </Button>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-sm text-gray-600">Total Rooms</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <span className="text-lg">🩺</span>
              <div>
                <p className="text-sm text-gray-600">Consultation</p>
                <p className="text-2xl font-bold">{stats.typeStats.find(s => s.value === 'Consultation')?.count || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <span className="text-lg">🏥</span>
              <div>
                <p className="text-sm text-gray-600">Procedure</p>
                <p className="text-2xl font-bold">{stats.typeStats.find(s => s.value === 'Procedure')?.count || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <span className="text-lg">💻</span>
              <div>
                <p className="text-sm text-gray-600">Telemedicine</p>
                <p className="text-2xl font-bold">{stats.typeStats.find(s => s.value === 'Telemed')?.count || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Rooms Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Rooms</CardTitle>
          <CardDescription>View and manage all clinic rooms</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">Loading rooms...</div>
          ) : rooms.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No rooms found. Add your first room to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Capacity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rooms.map((room) => {
                  const typeInfo = getRoomTypeInfo(room.type);
                  return (
                    <TableRow key={room.id}>
                      <TableCell className="font-medium">{room.name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span>{typeInfo.icon}</span>
                          <span>{typeInfo.label}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Users className="h-4 w-4 text-gray-400" />
                          {room.capacity}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={room.isActive ? 'default' : 'secondary'}>
                          {room.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell>{new Date(room.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(room)}
                            className="flex items-center gap-1"
                          >
                            <Edit className="h-3 w-3" />
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(room)}
                            className="flex items-center gap-1 text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-3 w-3" />
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Room Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingRoom ? 'Edit Room' : 'Add New Room'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Room Name *</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Consultation Room 1"
                required
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Room Type *</label>
              <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select room type" />
                </SelectTrigger>
                <SelectContent>
                  {roomTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      <div className="flex items-center gap-2">
                        <span>{type.icon}</span>
                        <span>{type.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Capacity *</label>
              <Input
                type="number"
                min="1"
                max="20"
                value={formData.capacity}
                onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value) || 1 })}
                placeholder="Number of people this room can accommodate"
                required
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isActive"
                checked={formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              />
              <label htmlFor="isActive" className="text-sm text-gray-700">Room is active</label>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={handleCloseDialog}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Saving...' : editingRoom ? 'Update Room' : 'Add Room'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
} 