'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Plus, Search, Edit, Eye, Phone, Mail } from 'lucide-react';
import { apiClient } from '@/lib/api';
import type { Patient } from '@/lib/types';

type Gender = 'MALE' | 'FEMALE' | 'OTHER';

interface PatientFormState {
  id?: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: Gender;
  phone: string;
  email?: string;
  address?: string;
  emergencyContact?: string;
}

export default function PatientsManagement() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [search, setSearch] = useState<string>('');
  const [genderFilter, setGenderFilter] = useState<'ALL' | Gender>('ALL');
  const [open, setOpen] = useState<boolean>(false);
  const [form, setForm] = useState<PatientFormState>({
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    gender: 'OTHER',
    phone: '',
    email: '',
    address: '',
    emergencyContact: '',
  });

  useEffect(() => {
    void fetchPatients();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void fetchPatients(), 300);
    return () => clearTimeout(t);
  }, [search, genderFilter]);

  const fetchPatients = async () => {
    try {
      setLoading(true);
      const normGender = genderFilter !== 'ALL' ? (genderFilter === 'MALE' ? 'Male' : genderFilter === 'FEMALE' ? 'Female' : 'Other') : undefined;
      const response = await apiClient.getPatients({
        search: search || undefined,
        gender: normGender,
        limit: 50,
      });
      const rows = (response as any)?.data ?? [];
      const mapped: Patient[] = rows.map((bp: any) => {
        const fullName: string = String(bp.name || '').trim();
        const [first, ...rest] = fullName.split(' ').filter(Boolean);
        return {
          id: bp.id,
          firstName: first || fullName || '',
          lastName: rest.join(' '),
          email: bp.email || undefined,
          phone: bp.phone,
          gender: bp.gender,
          dob: bp.dob,
          address: bp.address || undefined,
          city: bp.city || undefined,
          state: bp.state || undefined,
          createdAt: bp.createdAt,
          updatedAt: bp.updatedAt,
        } as Patient;
      });
      setPatients(mapped);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to fetch patients', err);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setForm({
      firstName: '',
      lastName: '',
      dateOfBirth: '',
      gender: 'OTHER',
      phone: '',
      email: '',
      address: '',
      emergencyContact: '',
    });
  };

  const submitPatient = async () => {
    try {
      setLoading(true);
      const name = `${form.firstName} ${form.lastName}`.trim();
      const payload = {
        name: name || form.firstName || form.lastName,
        gender: form.gender,
        dob: form.dateOfBirth,
        phone: form.phone,
        email: form.email || undefined,
        address: form.address || undefined,
        emergencyContact: form.emergencyContact || undefined,
      };
      if (form.id) {
        await apiClient.updatePatient(form.id, payload);
      } else {
        await apiClient.createPatient(payload);
      }
      await fetchPatients();
      setOpen(false);
      resetForm();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to save patient', err);
      // eslint-disable-next-line no-alert
      alert('Failed to save patient. Please check required fields and phone format.');
    } finally {
      setLoading(false);
    }
  };

  const onEdit = (p: Patient) => {
    setForm({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      dateOfBirth: (p.dob || '').split('T')[0] || '',
      gender: (p.gender as Gender) || 'OTHER',
      phone: p.phone,
      email: p.email || '',
      address: p.address || '',
      emergencyContact: '',
    });
    setOpen(true);
  };

  const initials = (first: string, last: string) => `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase();

  const filtered = useMemo(() => {
    if (genderFilter === 'ALL') return patients;
    return patients.filter((p) => String(p.gender).toUpperCase() === String(genderFilter).toUpperCase());
  }, [patients, genderFilter]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Patients</h2>
          <p className="text-gray-600">Search, add, and manage patient records</p>
        </div>
        <Dialog open={open} onOpenChange={(v: boolean) => { if (!v) resetForm(); setOpen(v); }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" /> New Patient
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>{form.id ? 'Edit Patient' : 'Create Patient'}</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>First Name</Label>
                <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
              </div>
              <div>
                <Label>Last Name</Label>
                <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
              </div>
              <div>
                <Label>Date of Birth</Label>
                <Input type="date" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} />
              </div>
              <div>
                <Label>Gender</Label>
                <Select value={form.gender} onValueChange={(v: Gender) => setForm({ ...form, gender: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MALE">Male</SelectItem>
                    <SelectItem value="FEMALE">Female</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2">
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <Label>Email</Label>
                <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <Label>Address</Label>
                <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <Label>Emergency Contact</Label>
                <Input value={form.emergencyContact} onChange={(e) => setForm({ ...form, emergencyContact: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => { setOpen(false); resetForm(); }}>Cancel</Button>
              <Button onClick={submitPatient} disabled={loading}>{form.id ? 'Save Changes' : 'Create'}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row gap-4 items-center">
            <div className="relative w-full sm:flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input className="pl-10" placeholder="Search by name, phone, or email" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={genderFilter} onValueChange={(v: 'ALL' | Gender) => setGenderFilter(v)}>
              <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Gender" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Genders</SelectItem>
                <SelectItem value="MALE">Male</SelectItem>
                <SelectItem value="FEMALE">Female</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Patient Records</CardTitle>
          <CardDescription>Manage and view all patient information</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">{[...Array(6)].map((_, i) => (<div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />))}</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 text-gray-500">No patients found</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Patient</TableHead>
                    <TableHead>Gender</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar><AvatarFallback className="bg-blue-100 text-blue-600">{initials(p.firstName, p.lastName)}</AvatarFallback></Avatar>
                          <div>
                            <div className="font-medium text-gray-900">{p.firstName} {p.lastName}</div>
                            <div className="text-xs text-gray-500">ID: {p.id.slice(-8)}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{p.gender}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1 text-sm text-gray-700">
                          <div className="flex items-center"><Phone className="h-3 w-3 mr-1" /> {p.phone}</div>
                          {p.email && <div className="flex items-center"><Mail className="h-3 w-3 mr-1" /> {p.email}</div>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm"><Eye className="h-3 w-3 mr-1" /> View</Button>
                          <Button variant="outline" size="sm" onClick={() => onEdit(p)}><Edit className="h-3 w-3 mr-1" /> Edit</Button>
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