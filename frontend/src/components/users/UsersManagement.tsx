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
import { Switch } from '@/components/ui/switch';
import React, { useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

export default function UsersManagement() {
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [permOpen, setPermOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [allPermissions, setAllPermissions] = useState<string[]>([]);
  const [rolePerms, setRolePerms] = useState<string[]>([]);
  const [roleSelect, setRoleSelect] = useState<string>('ADMIN');
  const [waOpen, setWaOpen] = useState(false);
  const [waAutoConfirm, setWaAutoConfirm] = useState(false);
  const [waUseTemplate, setWaUseTemplate] = useState(false);
  const [waTemplateName, setWaTemplateName] = useState('');
  const [waTemplateLanguage, setWaTemplateLanguage] = useState('en');
  const [waPhoneNumberId, setWaPhoneNumberId] = useState('');
  const [waAccessToken, setWaAccessToken] = useState('');
  // WhatsApp Template Editor state
  const [tplOpen, setTplOpen] = useState(false);
  const [tplList, setTplList] = useState<any[]>([]);
  const [tplLoading, setTplLoading] = useState(false);
  const [tplEditing, setTplEditing] = useState<any | null>(null);
  const [tplName, setTplName] = useState('');
  const [tplTouchpoint, setTplTouchpoint] = useState('appointment_confirmation');
  const [tplLanguage, setTplLanguage] = useState('en');
  const [tplOwnerScope, setTplOwnerScope] = useState<'ME' | 'BRANCH'>('ME');
  const [tplHtml, setTplHtml] = useState('');
  const [tplText, setTplText] = useState('');
  const [tplVars, setTplVars] = useState<string[]>(['patient_name','patient_phone','doctor_name','appointment_date','appointment_time','invoice_number','invoice_total','prescription_link']);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [genLoading, setGenLoading] = useState(false);
  const [genHints, setGenHints] = useState('');
  // Working Hours editor state
  const [whOpen, setWhOpen] = useState(false);
  const [whStartHour, setWhStartHour] = useState<number>(9);
  const [whEndHour, setWhEndHour] = useState<number>(18);
  const [whByDay, setWhByDay] = useState<Record<string, { startHour?: number; endHour?: number }>>({});
  const [form, setForm] = useState<{ id?: string; firstName: string; lastName: string; email: string; phone: string; role: string; status: string; password?: string }>({
    firstName: '', lastName: '', email: '', phone: '', role: 'RECEPTION', status: 'ACTIVE',
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
      const trimmedPhone = form.phone.trim();
      if (!trimmedPhone) {
        alert('Phone number is required');
        return;
      }

      const payload = { firstName: form.firstName, lastName: form.lastName, email: form.email, phone: trimmedPhone, role: form.role, status: form.status } as any;
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
      setForm({ firstName: '', lastName: '', email: '', phone: '', role: 'RECEPTION', status: 'ACTIVE' });
      await fetchUsers();
    } finally {
      setLoading(false);
    }
  };

  const onEdit = (u: User) => {
    setForm({ id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email, phone: u.phone || '', role: String(u.role), status: String(u.status) });
    setOpen(true);
  };

  const onDelete = async (u: User) => {
    if (!confirm('Delete user?')) return;
    await apiClient.deleteUser(u.id);
    await fetchUsers();
  };

  const openWhatsAppSettings = (u: User) => {
    setSelectedUser(u);
    const meta = (u as any)?.metadata || {};
    try {
      setWaAutoConfirm(Boolean(meta?.whatsappAutoConfirmAppointments));
      setWaUseTemplate(Boolean(meta?.whatsappUseTemplate));
      setWaTemplateName(String(meta?.whatsappTemplateName || ''));
      setWaTemplateLanguage(String(meta?.whatsappTemplateLanguage || 'en'));
      setWaPhoneNumberId(String(meta?.whatsappPhoneNumberId || ''));
      setWaAccessToken(''); // do not prefill token for security; allow overwrite
    } catch {
      setWaAutoConfirm(false);
      setWaUseTemplate(false);
      setWaTemplateName('');
      setWaTemplateLanguage('en');
      setWaPhoneNumberId('');
      setWaAccessToken('');
    }
    setWaOpen(true);
  };

  const openWorkingHours = (u: User) => {
    setSelectedUser(u);
    const meta = (u as any)?.metadata || {};
    const wh = (meta?.workingHours || {}) as any;
    const start = Number.isInteger(wh?.startHour) ? wh.startHour : 9;
    const end = Number.isInteger(wh?.endHour) ? wh.endHour : 18;
    const byDay = typeof wh?.byDay === 'object' && wh.byDay ? wh.byDay : {};
    setWhStartHour(start);
    setWhEndHour(end);
    setWhByDay(byDay);
    setWhOpen(true);
  };

  const saveWorkingHours = async () => {
    if (!selectedUser) return;
    try {
      setLoading(true);
      const existing = ((selectedUser as any)?.metadata || {}) as Record<string, any>;
      const byDayClean: Record<string, { startHour?: number; endHour?: number }> = {};
      const days = ['sun','mon','tue','wed','thu','fri','sat'];
      days.forEach((d) => {
        const v = whByDay[d];
        if (v && (Number.isInteger(v.startHour) || Number.isInteger(v.endHour))) {
          byDayClean[d] = {
            ...(Number.isInteger(v.startHour) ? { startHour: v.startHour } : {}),
            ...(Number.isInteger(v.endHour) ? { endHour: v.endHour } : {}),
          };
        }
      });
      const workingHours = {
        startHour: whStartHour,
        endHour: whEndHour,
        ...(Object.keys(byDayClean).length ? { byDay: byDayClean } : {}),
      };
      const metadata = { ...existing, workingHours } as Record<string, any>;
      await apiClient.updateUserProfile(selectedUser.id, { metadata });
      setWhOpen(false);
      await fetchUsers();
      alert('Working hours saved');
    } finally {
      setLoading(false);
    }
  };

  const stripHtml = (html: string) => {
    try {
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      return (tmp.textContent || tmp.innerText || '').trim();
    } catch {
      return html;
    }
  };

  const loadTemplates = async () => {
    try {
      setTplLoading(true);
      const res = await apiClient.getWhatsAppTemplates();
      const list = (res as any)?.data || (res as any) || [];
      setTplList(Array.isArray(list) ? list : []);
    } finally {
      setTplLoading(false);
    }
  };

  const openTemplateEditor = async () => {
    await loadTemplates();
    setTplEditing(null);
    setTplName('');
    setTplTouchpoint('appointment_confirmation');
    setTplLanguage('en');
    setTplOwnerScope('ME');
    setTplHtml('');
    setTplText('');
    setTplOpen(true);
  };

  const startEditTemplate = (tpl: any) => {
    setTplEditing(tpl);
    setTplName(String(tpl.name || ''));
    setTplTouchpoint(String(tpl.touchpoint || 'appointment_confirmation'));
    setTplLanguage(String(tpl.language || 'en'));
    setTplOwnerScope(tpl.ownerId ? 'ME' : 'BRANCH');
    setTplHtml(String(tpl.contentHtml || ''));
    setTplText(String(tpl.contentText || ''));
  };

  const saveTemplate = async () => {
    if (!tplName || !tplText) {
      alert('Name and Plain Text are required');
      return;
    }
    if (tplEditing?.id) {
      await apiClient.updateWhatsAppTemplate(tplEditing.id, {
        name: tplName,
        touchpoint: tplTouchpoint,
        language: tplLanguage,
        contentHtml: tplHtml || undefined,
        contentText: tplText,
        variables: tplVars,
      });
    } else {
      await apiClient.createWhatsAppTemplate({
        name: tplName,
        touchpoint: tplTouchpoint,
        language: tplLanguage,
        contentHtml: tplHtml || undefined,
        contentText: tplText,
        variables: tplVars,
        ownerScope: tplOwnerScope,
      });
    }
    await loadTemplates();
    alert('Template saved');
  };

  const deleteTemplate = async (tpl: any) => {
    if (!tpl?.id) return;
    if (!confirm('Delete this template?')) return;
    await apiClient.deleteWhatsAppTemplate(String(tpl.id));
    await loadTemplates();
  };

  const applyEditorCommand = (cmd: string) => {
    try {
      document.execCommand(cmd, false);
      if (editorRef.current) {
        const html = editorRef.current.innerHTML;
        setTplHtml(html);
        setTplText(stripHtml(html));
      }
    } catch {}
  };

  const insertVariable = (v: string) => {
    try {
      const token = `{{${v}}}`;
      if (editorRef.current) {
        editorRef.current.focus();
        document.execCommand('insertText', false, token);
        const html = editorRef.current.innerHTML;
        setTplHtml(html);
        setTplText(stripHtml(html));
      }
    } catch {}
  };

  const saveWhatsAppSettings = async () => {
    if (!selectedUser) return;
    try {
      setLoading(true);
      const existing = ((selectedUser as any)?.metadata || {}) as Record<string, any>;
      const metadata = {
        ...existing,
        whatsappAutoConfirmAppointments: waAutoConfirm,
        whatsappUseTemplate: waUseTemplate,
        whatsappTemplateName: waTemplateName || undefined,
        whatsappTemplateLanguage: waTemplateLanguage || undefined,
        // Admin-configurable per-doctor credentials
        whatsappPhoneNumberId: waPhoneNumberId || undefined,
        // Only persist token if a new one is provided (avoid overwriting with empty)
        ...(waAccessToken ? { whatsappAccessToken: waAccessToken } : {}),
      } as Record<string, any>;
      await apiClient.updateUserProfile(selectedUser.id, { metadata });
      setWaOpen(false);
      await fetchUsers();
      alert('WhatsApp settings saved');
    } finally {
      setLoading(false);
    }
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
              <div className="md:col-span-2">
                <Label>Phone</Label>
                <Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
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
                          {u.role === 'DOCTOR' && (
                            <Dialog open={whOpen && selectedUser?.id === u.id} onOpenChange={(open: boolean) => { setWhOpen(open); if (!open) setSelectedUser(null); }}>
                              <DialogTrigger asChild>
                                <Button variant="outline" size="sm" onClick={() => openWorkingHours(u)}>Working Hours</Button>
                              </DialogTrigger>
                              <DialogContent className="sm:max-w-[520px]">
                                <DialogHeader>
                                  <DialogTitle>Doctor Working Hours</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4">
                                  <div className="border rounded p-3 space-y-3">
                                    <div className="grid grid-cols-2 gap-3">
                                      <div>
                                        <Label className="text-sm">Default Start Hour</Label>
                                        <Input type="number" min={0} max={23} value={whStartHour} onChange={(e) => setWhStartHour(parseInt(e.target.value || '0', 10))} />
                                      </div>
                                      <div>
                                        <Label className="text-sm">Default End Hour</Label>
                                        <Input type="number" min={1} max={24} value={whEndHour} onChange={(e) => setWhEndHour(parseInt(e.target.value || '0', 10))} />
                                      </div>
                                    </div>
                                    <div className="text-xs text-gray-500">Hours are in 24h format. End should be greater than Start.</div>
                                  </div>

                                  <div className="border rounded p-3 space-y-3">
                                    <div className="font-medium">Per-day Overrides (optional)</div>
                                    {['sun','mon','tue','wed','thu','fri','sat'].map((d) => (
                                      <div key={d} className="grid grid-cols-5 gap-2 items-end">
                                        <div className="col-span-1 capitalize text-sm">{d}</div>
                                        <div className="col-span-2">
                                          <Label className="text-xs">Start</Label>
                                          <Input
                                            type="number"
                                            min={0}
                                            max={23}
                                            value={Number.isInteger(whByDay[d]?.startHour) ? (whByDay[d]?.startHour as number) : ''}
                                            onChange={(e) => {
                                              const v = e.target.value;
                                              setWhByDay((prev) => ({
                                                ...prev,
                                                [d]: { ...(prev[d] || {}), startHour: v === '' ? undefined : parseInt(v, 10) },
                                              }));
                                            }}
                                            placeholder="—"
                                          />
                                        </div>
                                        <div className="col-span-2">
                                          <Label className="text-xs">End</Label>
                                          <Input
                                            type="number"
                                            min={1}
                                            max={24}
                                            value={Number.isInteger(whByDay[d]?.endHour) ? (whByDay[d]?.endHour as number) : ''}
                                            onChange={(e) => {
                                              const v = e.target.value;
                                              setWhByDay((prev) => ({
                                                ...prev,
                                                [d]: { ...(prev[d] || {}), endHour: v === '' ? undefined : parseInt(v, 10) },
                                              }));
                                            }}
                                            placeholder="—"
                                          />
                                        </div>
                                      </div>
                                    ))}
                                  </div>

                                  <div className="flex justify-end gap-2">
                                    <Button variant="outline" onClick={() => setWhOpen(false)}>Close</Button>
                                    <Button onClick={() => void saveWorkingHours()}>Save</Button>
                                  </div>
                                </div>
                              </DialogContent>
                            </Dialog>
                          )}
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
                          {u.role === 'DOCTOR' && (
                            <Dialog open={waOpen && selectedUser?.id === u.id} onOpenChange={(open: boolean) => { setWaOpen(open); if (!open) setSelectedUser(null); }}>
                              <DialogTrigger asChild>
                                <Button variant="outline" size="sm" onClick={() => openWhatsAppSettings(u)}>WhatsApp Settings</Button>
                              </DialogTrigger>
                              <DialogContent className="sm:max-w-[520px]">
                                <DialogHeader>
                                  <DialogTitle>Doctor WhatsApp Settings</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4">
                                  <div className="border rounded p-3 space-y-3">
                                    <div className="flex items-center justify-between">
                                      <div>
                                        <div className="font-medium">Send WhatsApp on appointment creation</div>
                                        <div className="text-xs text-gray-500">Automatic confirmation to patients when this doctor is assigned.</div>
                                      </div>
                                      <Switch checked={waAutoConfirm} onCheckedChange={(v: boolean) => setWaAutoConfirm(v)} />
                                    </div>
                                    <div className="text-xs text-gray-500">Requires backend WhatsApp credentials. Uses text messages by default.</div>
                                  </div>

                                  <div className="border rounded p-3 space-y-3">
                                    <div className="grid grid-cols-1 gap-3">
                                      <div>
                                        <Label className="text-sm">Doctor WhatsApp Phone Number ID</Label>
                                        <Input value={waPhoneNumberId} onChange={(e) => setWaPhoneNumberId(e.target.value)} placeholder="e.g., 123456789012345" />
                                        <div className="text-xs text-gray-500 mt-1">Optional. Overrides clinic default phone number ID.</div>
                                      </div>
                                      <div>
                                        <Label className="text-sm">Doctor WhatsApp Access Token</Label>
                                        <Input type="password" value={waAccessToken} onChange={(e) => setWaAccessToken(e.target.value)} placeholder="Paste long-lived access token" />
                                        <div className="text-xs text-gray-500 mt-1">Optional. Stored in user metadata. Leave blank to keep existing.</div>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="border rounded p-3 space-y-3">
                                    <div className="flex items-center justify-between">
                                      <div>
                                        <div className="font-medium">Use WhatsApp Template</div>
                                        <div className="text-xs text-gray-500">Recommended for messages outside the 24h window.</div>
                                      </div>
                                      <Switch checked={waUseTemplate} onCheckedChange={(v: boolean) => setWaUseTemplate(v)} />
                                    </div>
                                    {waUseTemplate && (
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div>
                                          <Label className="text-sm">Template Name</Label>
                                          <Input value={waTemplateName} onChange={(e) => setWaTemplateName(e.target.value)} placeholder="e.g., appointment_confirm" />
                                        </div>
                                        <div>
                                          <Label className="text-sm">Language Code</Label>
                                          <Input value={waTemplateLanguage} onChange={(e) => setWaTemplateLanguage(e.target.value)} placeholder="e.g., en, en_US, hi" />
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  <div className="border rounded p-3 space-y-3">
                                    <div className="flex items-center justify-between">
                                      <div>
                                        <div className="font-medium">Templates</div>
                                        <div className="text-xs text-gray-500">Create and customize WhatsApp templates for common actions.</div>
                                      </div>
                                      <Button size="sm" variant="outline" onClick={() => void openTemplateEditor()}>Manage</Button>
                                    </div>
                                  </div>

                                  <div className="flex justify-end gap-2">
                                    <Button variant="outline" onClick={() => setWaOpen(false)}>Close</Button>
                                    <Button onClick={() => void saveWhatsAppSettings()}>Save</Button>
                                  </div>
                                </div>
                              </DialogContent>
                            </Dialog>
                          )}
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

      {/* WhatsApp Template Editor Modal */}
      <Dialog open={tplOpen} onOpenChange={setTplOpen}>
        <DialogContent className="sm:max-w-[900px]">
          <DialogHeader>
            <DialogTitle>WhatsApp Template Editor</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-5 border rounded p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium">Existing Templates</div>
                <Button size="sm" variant="outline" onClick={() => startEditTemplate({})}>New</Button>
              </div>
              <div className="space-y-2 max-h-96 overflow-auto">
                {tplLoading ? (
                  <div className="text-sm text-gray-500">Loading templates...</div>
                ) : tplList.length === 0 ? (
                  <div className="text-sm text-gray-500">No templates yet.</div>
                ) : (
                  tplList.map((t) => (
                    <div key={t.id} className={`border rounded p-2 ${tplEditing?.id === t.id ? 'ring-1 ring-blue-500' : ''}`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-sm">{t.name}</div>
                          <div className="text-xs text-gray-500">{t.touchpoint} • {t.language || 'en'} {t.ownerId ? '• Mine' : '• Branch'}</div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => startEditTemplate(t)}>Edit</Button>
                          <Button size="sm" variant="outline" onClick={() => void deleteTemplate(t)}>Delete</Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="md:col-span-7 border rounded p-3 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm">Name</Label>
                  <Input value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="e.g., Appointment Confirmation" />
                </div>
                <div>
                  <Label className="text-sm">Touchpoint</Label>
                  <Select value={tplTouchpoint} onValueChange={(v: string) => setTplTouchpoint(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="appointment_confirmation">Appointment Confirmation</SelectItem>
                      <SelectItem value="appointment_reminder">Appointment Reminder</SelectItem>
                      <SelectItem value="invoice_share">Invoice Share</SelectItem>
                      <SelectItem value="prescription_share">Prescription Share</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm">Language</Label>
                  <Input value={tplLanguage} onChange={(e) => setTplLanguage(e.target.value)} placeholder="e.g., en, en_US, hi" />
                </div>
                <div>
                  <Label className="text-sm">Ownership</Label>
                  <Select value={tplOwnerScope} onValueChange={(v: string) => setTplOwnerScope(v as 'ME' | 'BRANCH')}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ME">My Template</SelectItem>
                      <SelectItem value="BRANCH">Branch Template (Admin)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                <div className="md:col-span-9">
                  <Label className="text-sm">Generator Hints (optional)</Label>
                  <Input value={genHints} onChange={(e) => setGenHints(e.target.value)} placeholder="Add context like clinic name, specialty, signature" />
                </div>
                <div className="md:col-span-3 flex gap-2">
                  <Button
                    variant="outline"
                    disabled={genLoading}
                    onClick={async () => {
                      try {
                        setGenLoading(true);
                        const res = await apiClient.generateWhatsAppTemplate({
                          touchpoint: tplTouchpoint,
                          language: tplLanguage,
                          variables: tplVars,
                          hints: genHints,
                          tone: 'friendly',
                        });
                        const out = (res as any) || {};
                        const html = String(out.contentHtml || '');
                        const text = String(out.contentText || '');
                        const vars = Array.isArray(out.variables) ? out.variables : tplVars;
                        setTplHtml(html);
                        setTplText(text);
                        setTplVars(vars);
                        // Reflect in editor
                        if (editorRef.current) {
                          editorRef.current.innerHTML = html;
                        }
                        toast({ title: 'Template generated', description: 'Review and save if it looks good.' });
                      } catch (e) {
                        const msg = (e as any)?.body?.message || (e as any)?.message || 'Failed to generate';
                        toast({ title: 'Generation failed', description: msg });
                      } finally {
                        setGenLoading(false);
                      }
                    }}
                  >
                    {genLoading ? (
                      <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Generating…</span>
                    ) : (
                      'Generate'
                    )}
                  </Button>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Label className="text-sm">Designer (WYSIWYG)</Label>
                  <div className="ml-auto flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => applyEditorCommand('bold')}>B</Button>
                    <Button size="sm" variant="outline" onClick={() => applyEditorCommand('italic')}><span style={{ fontStyle: 'italic' }}>I</span></Button>
                    <Button size="sm" variant="outline" onClick={() => applyEditorCommand('underline')}><span style={{ textDecoration: 'underline' }}>U</span></Button>
                  </div>
                </div>
                <div
                  ref={editorRef}
                  contentEditable
                  className="border rounded min-h-32 p-2 prose prose-sm max-w-none"
                  onInput={() => {
                    const html = editorRef.current?.innerHTML || '';
                    setTplHtml(html);
                    setTplText(stripHtml(html));
                  }}
                  dangerouslySetInnerHTML={{ __html: tplHtml }}
                />
                <div className="text-xs text-gray-500 mt-1">Use variables to personalize messages.</div>
              </div>

              <div>
                <Label className="text-sm">Variables</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {tplVars.map((v) => (
                    <Button key={v} size="sm" variant="outline" onClick={() => insertVariable(v)}>{`{{${v}}}`}</Button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-sm">Plain Text (fallback)</Label>
                <Input value={tplText} onChange={(e) => setTplText(e.target.value)} placeholder="Auto-filled from WYSIWYG. You can edit." />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setTplOpen(false)}>Close</Button>
                <Button onClick={() => void saveTemplate()}>Save Template</Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
} 