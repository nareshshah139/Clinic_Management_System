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
  referralSource?: string;
  patientType?: 'WALKIN' | 'NON_WALKIN';
  walkinDoctorId?: string;
}

export default function PatientsManagement() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [search, setSearch] = useState<string>('');
  const [genderFilter, setGenderFilter] = useState<'ALL' | Gender>('ALL');
  const [open, setOpen] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalPatients, setTotalPatients] = useState<number>(0);
  const [pageSize] = useState<number>(20); // Fixed page size
  const [error, setError] = useState<string | null>(null);
  const [doctors, setDoctors] = useState<Array<{ id: string; firstName?: string; lastName?: string }>>([]);
  const [form, setForm] = useState<PatientFormState>({
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    gender: 'OTHER',
    phone: '',
    email: '',
    address: '',
    emergencyContact: '',
    referralSource: '',
    patientType: 'NON_WALKIN',
    walkinDoctorId: '',
  });

  const normalizeGender = (g: any): 'MALE' | 'FEMALE' | 'OTHER' | 'UNKNOWN' => {
    const s = String(g || '').trim().toUpperCase();
    if (s === 'M' || s === 'MALE') return 'MALE';
    if (s === 'F' || s === 'FEMALE') return 'FEMALE';
    if (s === 'O' || s === 'OTHER') return 'OTHER';
    return 'UNKNOWN';
  };

  useEffect(() => {
    void fetchPatients();
  }, []);

  useEffect(() => {
    // Reset to page 1 when search or filter changes
    setCurrentPage(1);
    const t = setTimeout(() => void fetchPatients(1), 500); // Increased debounce time
    return () => clearTimeout(t);
  }, [search, genderFilter]);

  useEffect(() => {
    void fetchPatients(currentPage);
  }, [currentPage]);

  const fetchPatients = async (page: number = currentPage) => {
    try {
      setLoading(true);
      setError(null);
      const normGender = genderFilter !== 'ALL' ? (genderFilter === 'MALE' ? 'M' : genderFilter === 'FEMALE' ? 'F' : 'O') : undefined;
      
      // Only search if we have at least 2 characters
      const searchTerm = search.trim().length >= 2 ? search.trim() : undefined;
      
      const response = await apiClient.getPatients({
        page,
        limit: pageSize,
        search: searchTerm,
        gender: normGender,
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
          gender: normalizeGender(bp.gender),
          dob: bp.dob,
          address: bp.address || undefined,
          city: bp.city || undefined,
          state: bp.state || undefined,
          referralSource: bp.referralSource || undefined,
          createdAt: bp.createdAt,
          updatedAt: bp.updatedAt,
        } as Patient;
      });
      setPatients(mapped);
      
      // Update pagination metadata
      const meta = (response as any)?.meta;
      if (meta) {
        setTotalPages(meta.totalPages || 1);
        setTotalPatients(meta.total || 0);
      }
    } catch (err: any) {
      console.error('Failed to fetch patients', err);
      setError(err?.message || 'Failed to load patients. Please try again.');
      setPatients([]);
      setTotalPages(1);
      setTotalPatients(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Load doctors when the form dialog is opened
    if (!open) return;
    (async () => {
      try {
        const res = await apiClient.getUsers({ role: 'DOCTOR', limit: 100 });
        const data = (res as any)?.data || (res as any)?.users || [];
        const mapped = data.map((u: any) => ({ id: u.id, firstName: u.firstName, lastName: u.lastName }));
        setDoctors(mapped);
      } catch {
        setDoctors([]);
      }
    })();
  }, [open]);

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
      referralSource: '',
      patientType: 'NON_WALKIN',
      walkinDoctorId: '',
    });
    setError(null);
  };

  const submitPatient = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Basic validation
      if (!form.firstName.trim() || !form.phone.trim() || !form.dateOfBirth) {
        setError('Please fill in all required fields (Name, Phone, Date of Birth)');
        return;
      }
      
      const name = `${form.firstName} ${form.lastName}`.trim();
      const payload = {
        name: name || form.firstName || form.lastName,
        gender: form.gender,
        dob: form.dateOfBirth,
        phone: form.phone,
        email: form.email || undefined,
        address: form.address || undefined,
        emergencyContact: form.emergencyContact || undefined,
        referralSource: form.referralSource || undefined,
      };
      
      let savedPatientId = form.id;
      if (form.id) {
        await apiClient.updatePatient(form.id, payload);
      } else {
        const created = (await apiClient.createPatient(payload)) as any;
        savedPatientId = created?.id || created?.data?.id || savedPatientId;
      }
      
      // Optional: auto-book next available slot for walk-in patients when doctor is selected
      if (savedPatientId && form.patientType === 'WALKIN' && form.walkinDoctorId) {
        await bookNextAvailableConsultation(savedPatientId, form.walkinDoctorId);
      }
      
      await fetchPatients(currentPage);
      setOpen(false);
      resetForm();
    } catch (err: any) {
      console.error('Failed to save patient', err);
      setError(err?.message || 'Failed to save patient. Please check your input and try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${da}`;
  };

  const bookNextAvailableConsultation = async (patientId: string, doctorId: string) => {
    // Try today and the next 7 days
    const maxDaysAhead = 7;
    for (let i = 0; i <= maxDaysAhead; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      const dateStr = formatDate(date);
      try {
        const slotsRes = (await apiClient.getAvailableSlots({ doctorId, date: dateStr, durationMinutes: 30 })) as any;
        const availableSlots: string[] = slotsRes?.availableSlots || [];
        if (availableSlots.length > 0) {
          const slot = availableSlots[0];
          await apiClient.createAppointment({
            patientId,
            doctorId,
            date: dateStr,
            slot,
            visitType: 'OPD',
            source: 'WALK_IN',
            notes: 'Auto-booked next available slot for walk-in',
          });
          alert(`Walk-in appointment booked on ${dateStr} at ${slot}`);
          return;
        }
      } catch (e) {
        // Ignore and try next day
      }
    }
    alert('No available consultation slots found in the next 7 days for the selected doctor.');
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
      referralSource: p.referralSource || '',
      patientType: 'NON_WALKIN',
      walkinDoctorId: '',
    });
    setOpen(true);
  };

  const initials = (first: string, last: string) => `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase();

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
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}
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
              <div className="md:col-span-2">
                <Label>How did the patient hear about us?</Label>
                <Select value={form.referralSource || ''} onValueChange={(v: string) => setForm({ ...form, referralSource: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select source" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INSTAGRAM">Instagram</SelectItem>
                    <SelectItem value="TWITTER">Twitter</SelectItem>
                    <SelectItem value="GOOGLE">Google</SelectItem>
                    <SelectItem value="DOCTOR">Doctor</SelectItem>
                    <SelectItem value="FRIENDS_FAMILY">Friends & Family</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* Optional Walk-in booking */}
              <div>
                <Label>Patient Type</Label>
                <Select value={form.patientType || 'NON_WALKIN'} onValueChange={(v: 'WALKIN' | 'NON_WALKIN') => setForm({ ...form, patientType: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NON_WALKIN">Non walk-in</SelectItem>
                    <SelectItem value="WALKIN">Walk-in</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Doctor (for walk-in)</Label>
                <Select value={form.walkinDoctorId || ''} onValueChange={(v: string) => setForm({ ...form, walkinDoctorId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select doctor" />
                  </SelectTrigger>
                  <SelectContent>
                    {doctors.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {`Dr. ${(d.firstName || '').trim()} ${(d.lastName || '').trim()}`.trim() || 'Doctor'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="text-xs text-gray-500 mt-1">If Patient Type is Walk-in and a doctor is selected, the next available slot will be automatically booked after saving.</div>
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
              <Input 
                className="pl-10" 
                placeholder="Search by name, phone, or email (min 2 characters)" 
                value={search} 
                onChange={(e) => setSearch(e.target.value)}
              />
              {search.length > 0 && search.length < 2 && (
                <div className="absolute top-full left-0 mt-1 text-xs text-gray-500">
                  Enter at least 2 characters to search
                </div>
              )}
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
          {error ? (
            <div className="text-center py-10">
              <div className="text-red-600 mb-2">{error}</div>
              <Button variant="outline" onClick={() => fetchPatients(currentPage)}>
                Try Again
              </Button>
            </div>
          ) : loading ? (
            <div className="space-y-3">{[...Array(6)].map((_, i) => (<div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />))}</div>
          ) : patients.length === 0 ? (
            <div className="text-center py-10 text-gray-500">
              {search.length >= 2 || genderFilter !== 'ALL' ? 'No patients found matching your search criteria' : 'No patients found'}
            </div>
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
                  {patients.map((p) => (
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
                        <Badge variant="secondary">{normalizeGender(p.gender)}</Badge>
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
          
          {/* Pagination Controls */}
          {!loading && patients.length > 0 && totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t">
              <div className="text-sm text-gray-500">
                Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalPatients)} of {totalPatients} patients
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage <= 1}
                >
                  Previous
                </Button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    
                    return (
                      <Button
                        key={pageNum}
                        variant={currentPage === pageNum ? "default" : "outline"}
                        size="sm"
                        onClick={() => setCurrentPage(pageNum)}
                        className="w-8 h-8 p-0"
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 