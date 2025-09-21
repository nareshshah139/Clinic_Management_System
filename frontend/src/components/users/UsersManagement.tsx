'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiClient } from '@/lib/api';
import type { User } from '@/lib/types';
import { Plus, Edit, Trash2, Settings } from 'lucide-react';

export default function UsersManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [permOpen, setPermOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [allPermissions, setAllPermissions] = useState<string[]>([]);
  const [rolePerms, setRolePerms] = useState<string[]>([]);
  const [roleSelect, setRoleSelect] = useState<string>('ADMIN');
  const [form, setForm] = useState<{ id?: string; firstName: string; lastName: string; email: string; role: string; status: string; password?: string }>({
    firstName: '', lastName: '', email: '', role: 'RECEPTION', status: 'ACTIVE',
  });

  // Group permissions by resource (e.g., appointments, billing, etc.)
  const groupedPermissions = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const p of allPermissions) {
      const group = p.split(':')[0] || 'other';
      if (!map[group]) map[group] = [];
      map[group].push(p);
    }
    return map;
  }, [allPermissions]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await apiClient.getUsers({ limit: 100 });
      const list = (res as any)?.users ?? (res as any)?.data ?? [];
      setUsers(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchUsers();
  }, []);

  const submit = async () => {
    try {
      setLoading(true);
      const payload = { firstName: form.firstName, lastName: form.lastName, email: form.email, role: form.role, status: form.status } as any;
      if (!form.id) {
        if (!form.password || form.password.length < 8 || form.password.length > 20) {
          alert('Password must be 8-20 characters');
          return;
        }
        payload.password = form.password;
      }
      if (form.id) {
        await apiClient.updateUser(form.id, payload);
      } else {
        await apiClient.createUser(payload);
      }
      setOpen(false);
      setForm({ firstName: '', lastName: '', email: '', role: 'RECEPTION', status: 'ACTIVE' });
      await fetchUsers();
    } finally {
      setLoading(false);
    }
  };

  const onEdit = (u: User) => {
    setForm({ id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email, role: String(u.role), status: String(u.status) });
    setOpen(true);
  };

  const onDelete = async (u: User) => {
    if (!confirm('Delete user?')) return;
    await apiClient.deleteUser(u.id);
    await fetchUsers();
  };

  const openRolePerms = async (u: User) => {
    setSelectedUser(u);
    setPermOpen(true);
    setRoleSelect(u.role as any);
    try {
      const [rolesRes, permsRes] = await Promise.all([
        apiClient.getRoles({ limit: 100 }),
        apiClient.getPermissions({ limit: 1000 }),
      ]);
      const perms = ((permsRes as any)?.data || (permsRes as any)?.permissions || []).map((p: any) => p.name || p);
      setAllPermissions(perms);
      // Suggest defaults based on current role from backend roles
      const role = ((rolesRes as any)?.data || (rolesRes as any)?.roles || []).find((r: any) => r.name === u.role);
      const defaults = role?.permissions ? JSON.parse(role.permissions) : [];
      setRolePerms(defaults);
    } catch (e) {
      // fallback: empty
      setAllPermissions([]);
      setRolePerms([]);
    }
  };

  const applyRole = async (role: string) => {
    if (!selectedUser) return;
    try {
      await apiClient.assignRole(selectedUser.id, { role });
      await fetchUsers();
      
      // Update the selected user's role in the dialog
      setSelectedUser({ ...selectedUser, role: role as any });
      
      // Fetch updated role permissions and apply them
      const rolesRes = await apiClient.getRoles({ limit: 100 });
      const roleRecord = ((rolesRes as any)?.data || (rolesRes as any)?.roles || []).find((r: any) => r.name === role);
      const defaults = roleRecord?.permissions ? JSON.parse(roleRecord.permissions) : [];
      setRolePerms(defaults);
      
      alert(`Role updated to ${role} successfully!`);
    } catch (error) {
      console.error('Error applying role:', error);
      alert('Failed to update role. Please try again.');
    }
  };

  const applyPermissions = async (perms: string[]) => {
    if (!selectedUser) return;
    try {
      await apiClient.updateUserPermissions(selectedUser.id, perms);
      await fetchUsers();
      alert('Permissions updated successfully!');
    } catch (error) {
      console.error('Error updating permissions:', error);
      alert('Failed to update permissions. Please try again.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Users</h2>
          <p className="text-gray-600">Manage users, roles, and statuses</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> New User</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{form.id ? 'Edit User' : 'Create User'}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>First Name</Label>
                <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
              </div>
              <div>
                <Label>Last Name</Label>
                <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <Label>Role</Label>
                <Select value={form.role} onValueChange={(v: string) => setForm({ ...form, role: v })}>
                  <SelectTrigger><SelectValue placeholder="Role" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                    <SelectItem value="DOCTOR">Doctor</SelectItem>
                    <SelectItem value="NURSE">Nurse</SelectItem>
                    <SelectItem value="RECEPTION">Receptionist</SelectItem>
                    <SelectItem value="MANAGER">Manager</SelectItem>
                    <SelectItem value="PHARMACIST">Pharmacist</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v: string) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="INACTIVE">Inactive</SelectItem>
                    <SelectItem value="SUSPENDED">Suspended</SelectItem>
                    <SelectItem value="PENDING">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {!form.id && (
                <div className="md:col-span-2">
                  <Label>Password (8-20 chars)</Label>
                  <Input type="password" value={form.password || ''} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={submit} disabled={loading}>{form.id ? 'Save' : 'Create'}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Users</CardTitle>
          <CardDescription>Manage system users and roles</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">{[...Array(6)].map((_, i) => (<div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />))}</div>
          ) : users.length === 0 ? (
            <div className="text-center py-10 text-gray-500">No users found</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell>{u.firstName} {u.lastName}</TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell>{u.role}</TableCell>
                      <TableCell>{u.status}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => onEdit(u)}><Edit className="h-3 w-3 mr-1" /> Edit</Button>
                          <Button variant="outline" size="sm" onClick={() => void onDelete(u)}><Trash2 className="h-3 w-3 mr-1" /> Delete</Button>
                          <Dialog open={permOpen && selectedUser?.id === u.id} onOpenChange={(open: boolean) => { setPermOpen(open); if (!open) setSelectedUser(null); }}>
                            <DialogTrigger asChild>
                              <Button variant="outline" size="sm" onClick={() => openRolePerms(u)}><Settings className="h-3 w-3 mr-1" /> Role & Permissions</Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-2xl">
                              <DialogHeader>
                                <DialogTitle>Role & Permissions</DialogTitle>
                              </DialogHeader>
                              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                                <div className="md:col-span-4 space-y-3">
                                  <div>
                                    <Label>Role</Label>
                                    <Select value={roleSelect} onValueChange={(v: string) => setRoleSelect(v)}>
                                      <SelectTrigger className="mt-1"><SelectValue placeholder="Select role" /></SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="ADMIN">Admin</SelectItem>
                                        <SelectItem value="MANAGER">Manager</SelectItem>
                                        <SelectItem value="DOCTOR">Doctor</SelectItem>
                                        <SelectItem value="NURSE">Nurse</SelectItem>
                                        <SelectItem value="RECEPTION">Receptionist</SelectItem>
                                        <SelectItem value="PHARMACIST">Pharmacist</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    <div className="flex gap-2 mt-2">
                                      <Button size="sm" onClick={() => void applyRole(roleSelect as string)}>Apply Role</Button>
                                      <Button size="sm" variant="outline" onClick={() => setRolePerms([])}>Clear All</Button>
                                    </div>
                                  </div>
                                  <div>
                                    <Label>Permissions</Label>
                                    <div className="text-xs text-gray-500">Selected: {rolePerms.length}</div>
                                  </div>
                                </div>
                                <div className="md:col-span-8">
                                  <div className="mt-2 max-h-80 overflow-auto space-y-4 pr-1">
                                    {Object.entries(groupedPermissions).map(([group, perms]) => (
                                      <div key={group}>
                                        <div className="flex items-center justify-between">
                                          <div className="font-medium capitalize">{group} <span className="text-xs text-gray-500">({perms.length})</span></div>
                                          <div className="flex gap-2">
                                            <Button variant="outline" size="sm" onClick={() => {
                                              const next = new Set(rolePerms);
                                              perms.forEach((p) => next.add(p));
                                              setRolePerms(Array.from(next));
                                            }}>Select all</Button>
                                            <Button variant="outline" size="sm" onClick={() => {
                                              const next = new Set(rolePerms);
                                              perms.forEach((p) => next.delete(p));
                                              setRolePerms(Array.from(next));
                                            }}>Clear</Button>
                                          </div>
                                        </div>
                                        <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                                          {perms.map((p) => {
                                            const checked = rolePerms.includes(p);
                                            return (
                                              <label key={p} className="flex items-center gap-2 text-sm">
                                                <input
                                                  aria-label={p}
                                                  type="checkbox"
                                                  checked={checked}
                                                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                                    const next = new Set(rolePerms);
                                                    if (e.target.checked) next.add(p); else next.delete(p);
                                                    setRolePerms(Array.from(next));
                                                  }}
                                                />
                                                <span className="truncate" title={p}>{p}</span>
                                              </label>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                  <div className="flex justify-end mt-3">
                                    <Button onClick={() => void applyPermissions(rolePerms)}>Save Permissions</Button>
                                  </div>
                                </div>
                              </div>
                            </DialogContent>
                          </Dialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 