'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Plus, Search, Edit, Eye, Phone, Mail, Archive, Link as LinkIcon, Unlink, Undo, MessageSquare, Stethoscope, Download } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { formatPatientName, filterRoomsByVisitType, calculateAge, isDefaultDob, formatDob } from '@/lib/utils';
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import type { Patient, BackendPatientRow, GetPatientsResponseWithMeta, VisitType, Room } from '@/lib/types';

type Gender = 'MALE' | 'FEMALE' | 'OTHER';

interface PatientFormState {
  id?: string;
  abhaId?: string;
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
  walkinVisitType?: VisitType;
  walkinRoomId?: string;
}

export default function PatientsManagement() {
  const router = useRouter();
  const { toast } = useToast();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [listLoading, setListLoading] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [search, setSearch] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [genderFilter, setGenderFilter] = useState<'ALL' | Gender>('ALL');
  const [portalFilter, setPortalFilter] = useState<'ALL' | 'LINKED' | 'UNLINKED'>('ALL');
  const [abhaFilter, setAbhaFilter] = useState<'ALL' | 'HAS' | 'NONE'>('ALL');
  const [open, setOpen] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalPatients, setTotalPatients] = useState<number>(0);
  const [pageSize, setPageSize] = useState<number>(() => {
    // Load from localStorage
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('patientsPageSize');
      return saved ? parseInt(saved, 10) : 20;
    }
    return 20;
  });
  const [error, setError] = useState<string | null>(null);
  const [doctors, setDoctors] = useState<Array<{ id: string; firstName?: string; lastName?: string }>>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [linkPortalOpen, setLinkPortalOpen] = useState<boolean>(false);
  const [linkPortalEmail, setLinkPortalEmail] = useState<string>('');
  const [linkPortalTarget, setLinkPortalTarget] = useState<Patient | null>(null);
  const fetchIdRef = useRef(0);
  const [sortBy, setSortBy] = useState<'NAME' | 'AGE' | 'GENDER' | 'LAST_VISIT' | 'CREATED_AT' | 'REFERRAL'>('NAME');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [form, setForm] = useState<PatientFormState>({
    abhaId: '',
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
    walkinVisitType: 'OPD',
    walkinRoomId: '',
  });

  const normalizeGender = (g: any): 'MALE' | 'FEMALE' | 'OTHER' | 'UNKNOWN' => {
    const s = String(g || '').trim().toUpperCase();
    if (s === 'M' || s === 'MALE') return 'MALE';
    if (s === 'F' || s === 'FEMALE') return 'FEMALE';
    if (s === 'O' || s === 'OTHER') return 'OTHER';
    return 'UNKNOWN';
  };

  // Client-side fuzzy suggestions for pre-min-2 search
  const suggestions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [] as string[];
    // Only show suggestions when guard is active (< 2 chars)
    if (q.length >= 2) return [] as string[];

    const pool = patients || [];
    const candidates = new Set<string>();

    for (const p of pool) {
      const name = formatPatientName(p);
      const phone = p.phone || '';
      const abha = p.abhaId || '';
      const email = p.email || '';

      // Prefer prefix matches, then includes
      if (name.toLowerCase().startsWith(q)) candidates.add(name);
      else if (name.toLowerCase().includes(q)) candidates.add(name);

      if (phone.startsWith(q)) candidates.add(phone);
      if (abha.toLowerCase().startsWith(q)) candidates.add(abha);
      if (email.toLowerCase().startsWith(q)) candidates.add(email);
      if (candidates.size >= 8) break; // cap to avoid long lists
    }

    return Array.from(candidates).slice(0, 8);
  }, [search, patients]);

  // Seed search from URL param once on mount
  const searchParams = useSearchParams();
  useEffect(() => {
    const q = (searchParams?.get('search') || '').trim();
    if (q) {
      setSearch(q);
      setDebouncedSearch(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounce search input and reset to page 1 on search/gender change
  useEffect(() => {
    setCurrentPage(1);
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 500);
    return () => clearTimeout(t);
  }, [search, genderFilter]);

  // Trigger fetch when pagination, page size, gender, or debounced search changes
  useEffect(() => {
    void fetchPatients(currentPage);
  }, [currentPage, pageSize, debouncedSearch, genderFilter]);

  // Save page size preference
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('patientsPageSize', pageSize.toString());
    }
  }, [pageSize]);

  const fetchPatients = async (page: number = currentPage) => {
    try {
      setListLoading(true);
      setError(null);
      const requestId = ++fetchIdRef.current;
      const normGender = genderFilter !== 'ALL' ? genderFilter : undefined;
      
      // Only search if we have at least 2 characters
      const searchTerm = debouncedSearch.length >= 2 ? debouncedSearch : undefined;
      
      const response = await apiClient.getPatients({
        page,
        limit: pageSize,
        search: searchTerm,
        gender: normGender,
        // Pass-through filters if backend supports (no-op otherwise)
        portalLinked: portalFilter === 'ALL' ? undefined : portalFilter === 'LINKED',
        abhaPresent: abhaFilter === 'ALL' ? undefined : abhaFilter === 'HAS',
        sortBy: sortBy,
        sortOrder: sortOrder,
      });

      const extractRows = (payload: unknown): BackendPatientRow[] => {
        if (!payload) return [];
        const p = payload as Partial<GetPatientsResponseWithMeta> | BackendPatientRow[] | Patient[];
        if (Array.isArray(p)) return p as BackendPatientRow[];
        if (Array.isArray(p.data)) return p.data as BackendPatientRow[];
        if (Array.isArray(p.patients)) return p.patients as BackendPatientRow[];
        return [];
      };

      const rows = extractRows(response);
      const mapped: Patient[] = rows.map((bp: BackendPatientRow) => {
        const rawName = String(bp.name || '').trim();
        const firstName = String(bp.firstName || '').trim();
        const lastName = String(bp.lastName || '').trim();
        const displayName = formatPatientName({ id: bp.id, name: rawName, firstName, lastName });
        return {
          id: bp.id,
          abhaId: bp.abhaId || undefined,
          firstName: firstName || rawName || '',
          lastName: lastName,
          name: displayName,
          email: bp.email || undefined,
          phone: bp.phone,
          gender: normalizeGender(bp.gender),
          dob: bp.dob,
          address: bp.address || undefined,
          city: bp.city || undefined,
          state: bp.state || undefined,
          referralSource: bp.referralSource || undefined,
          emergencyContact: bp.emergencyContact || undefined,
          portalUserId: bp.portalUserId || undefined,
          createdAt: bp.createdAt,
          updatedAt: bp.updatedAt,
        };
      });
      if (requestId !== fetchIdRef.current) return; // stale response guard
      setPatients(mapped);
      
      // Update pagination metadata
      const meta = (response as Partial<GetPatientsResponseWithMeta>)?.meta;
      if (meta && typeof meta.totalPages === 'number' && typeof meta.total === 'number') {
        setTotalPages(meta.totalPages);
        setTotalPatients(meta.total);
      } else if (typeof (response as { total?: number }).total === 'number') {
        const total = (response as { total: number }).total;
        setTotalPatients(total);
        setTotalPages(Math.max(1, Math.ceil(total / pageSize)));
      }
    } catch (err: any) {
      console.error('Failed to fetch patients', err);
      setError(err?.message || 'Failed to load patients. Please try again.');
      setPatients([]);
      setTotalPages(1);
      setTotalPatients(0);
    } finally {
      setListLoading(false);
    }
  };

  // Derived rows with client-side filters + sorting (in case backend ignores params)
  const displayPatients = useMemo(() => {
    let rows = [...patients];
    if (portalFilter !== 'ALL') {
      const wantLinked = portalFilter === 'LINKED';
      rows = rows.filter(p => (wantLinked ? !!p.portalUserId : !p.portalUserId));
    }
    if (abhaFilter !== 'ALL') {
      const wantAbha = abhaFilter === 'HAS';
      rows = rows.filter(p => (wantAbha ? !!p.abhaId : !p.abhaId));
    }
    const cmp = <T,>(a: T, b: T) => (a === b ? 0 : (a as any) < (b as any) ? -1 : 1);
    rows.sort((a, b) => {
      let r = 0;
      if (sortBy === 'NAME') {
        r = cmp((a.name || '').toLowerCase(), (b.name || '').toLowerCase());
      } else if (sortBy === 'AGE') {
        const ageA = (() => {
          if (!a.dob) return -Infinity;
          const d = new Date(a.dob);
          if (isNaN(d.getTime())) return -Infinity;
          const today = new Date();
          // Check if DOB is today's date (default placeholder)
          const isToday = 
            d.getFullYear() === today.getFullYear() &&
            d.getMonth() === today.getMonth() &&
            d.getDate() === today.getDate();
          if (isToday) return -Infinity; // Treat default date as missing DOB for sorting
          let age = today.getFullYear() - d.getFullYear();
          const m = today.getMonth() - d.getMonth();
          if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
          return age;
        })();
        const ageB = (() => {
          if (!b.dob) return -Infinity;
          const d = new Date(b.dob);
          if (isNaN(d.getTime())) return -Infinity;
          const today = new Date();
          // Check if DOB is today's date (default placeholder)
          const isToday = 
            d.getFullYear() === today.getFullYear() &&
            d.getMonth() === today.getMonth() &&
            d.getDate() === today.getDate();
          if (isToday) return -Infinity; // Treat default date as missing DOB for sorting
          let age = today.getFullYear() - d.getFullYear();
          const m = today.getMonth() - d.getMonth();
          if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
          return age;
        })();
        r = cmp(ageA, ageB);
      } else if (sortBy === 'GENDER') {
        r = cmp((a.gender || '').toString(), (b.gender || '').toString());
      } else if (sortBy === 'LAST_VISIT') {
        const da = a.lastVisitDate ? new Date(a.lastVisitDate).getTime() : -Infinity;
        const db = b.lastVisitDate ? new Date(b.lastVisitDate).getTime() : -Infinity;
        r = cmp(da, db);
      } else if (sortBy === 'REFERRAL') {
        r = cmp((a.referralSource || ''), (b.referralSource || ''));
      } else {
        const ca = a.createdAt ? new Date(a.createdAt).getTime() : -Infinity;
        const cb = b.createdAt ? new Date(b.createdAt).getTime() : -Infinity;
        r = cmp(ca, cb);
      }
      return sortOrder === 'asc' ? r : -r;
    });
    return rows;
  }, [patients, portalFilter, abhaFilter, sortBy, sortOrder]);

  const toggleSort = (key: typeof sortBy) => {
    if (sortBy === key) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(key);
      setSortOrder('asc');
    }
  };

  const clearFilters = () => {
    setSearch('');
    setDebouncedSearch('');
    setGenderFilter('ALL');
    setPortalFilter('ALL');
    setAbhaFilter('ALL');
    setCurrentPage(1);
  };

  const exportCsv = () => {
    const headers = [
      'ID','Name','Age','Gender','Phone','Email','ABHA ID','Referral','Portal Linked','Date of Birth','Created At'
    ];
    const lines = [headers.join(',')];
    const csvEscape = (v: unknown) => {
      const s = String(v ?? '');
      if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    };
    for (const p of displayPatients) {
      const age = calculateAge(p.dob);
      const dobDisplay = formatDob(p.dob);
      const row = [
        p.id,
        p.name,
        age !== null ? age : 'N/A',
        p.gender,
        p.phone,
        p.email || '',
        p.abhaId || '',
        p.referralSource || '',
        p.portalUserId ? 'Yes' : 'No',
        dobDisplay, // Add DOB column with N/A for default dates
        p.createdAt,
      ].map(csvEscape);
      lines.push(row.join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `patients_export_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
      try {
        const r = await apiClient.getRooms();
        setRooms((r as any)?.rooms || []);
      } catch {
        setRooms([]);
      }
    })();
  }, [open]);

  const resetForm = () => {
    setForm({
      abhaId: '',
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
      walkinVisitType: 'OPD',
      walkinRoomId: '',
    });
    setError(null);
  };

  const submitPatient = async () => {
    try {
      setActionLoading(true);
      setError(null);
      
      // Basic validation
      if (!form.firstName.trim() || !form.phone.trim()) {
        setError('Please fill in all required fields (Name, Phone)');
        return;
      }
      if (form.abhaId && form.abhaId.trim().length > 0) {
        const abha = form.abhaId.trim();
        const isDigits = /^\d{14}$/.test(abha);
        if (!isDigits) {
          setError('ABHA ID must be a 14-digit number');
          return;
        }
      }
      
      const name = `${form.firstName} ${form.lastName}`.trim();
      const payload = {
        abhaId: form.abhaId || undefined,
        name: name || form.firstName || form.lastName,
        firstName: form.firstName || undefined,
        lastName: form.lastName || undefined,
        gender: form.gender,
        dob: form.dateOfBirth || undefined,
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
        await bookNextAvailableConsultation(
          savedPatientId,
          form.walkinDoctorId,
          form.walkinVisitType || 'OPD',
          form.walkinRoomId || undefined,
        );
      }
      
      await fetchPatients(currentPage);
      setOpen(false);
      resetForm();
    } catch (err: any) {
      console.error('Failed to save patient', err);
      setError(err?.message || 'Failed to save patient. Please check your input and try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const formatDate = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${da}`;
  };

  const bookNextAvailableConsultation = async (
    patientId: string,
    doctorId: string,
    visitType: VisitType = 'OPD',
    roomId?: string,
  ) => {
    // Try today and the next 7 days
    const maxDaysAhead = 7;
    for (let i = 0; i <= maxDaysAhead; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      const dateStr = formatDate(date);
      try {
        const slotsRes = (await apiClient.getAvailableSlots({ doctorId, date: dateStr, durationMinutes: 30 })) as any;
        let availableSlots: string[] = slotsRes?.availableSlots || [];

        // If a room is specified, filter to slots where the room is also available
        if (roomId) {
          try {
            const roomSchedule = await apiClient.getRoomSchedule(roomId, dateStr);
            const occupied = new Set((roomSchedule as any)?.appointments?.map((a: any) => a.slot) || []);
            availableSlots = availableSlots.filter((s) => !occupied.has(s));
          } catch {
            // If room schedule fails, proceed with doctor availability only
          }
        }
        if (availableSlots.length > 0) {
          const slot = availableSlots[0];
          await apiClient.createAppointment({
            patientId,
            doctorId,
            date: dateStr,
            slot,
            visitType,
            source: 'WALK_IN',
            notes: 'Auto-booked next available slot for walk-in',
            ...(roomId ? { roomId } : {}),
          });
          toast({
            title: 'Walk-in appointment booked',
            description: `Appointment scheduled for ${dateStr} at ${slot}`,
            variant: 'default',
          });
          return;
        }
      } catch (e) {
        // Ignore and try next day
      }
    }
    toast({
      title: 'No slots available',
      description: 'No available consultation slots found in the next 7 days for the selected doctor.',
      variant: 'destructive',
    });
  };

  const onEdit = (p: Patient) => {
    // If DOB is the default date (today), show empty string in the input
    const dobValue = p.dob && !isDefaultDob(p.dob) ? (p.dob || '').split('T')[0] || '' : '';
    setForm({
      id: p.id,
      abhaId: p.abhaId || '',
      firstName: p.firstName,
      lastName: p.lastName,
      dateOfBirth: dobValue,
      gender: (p.gender as Gender) || 'OTHER',
      phone: p.phone,
      email: p.email || '',
      address: p.address || '',
      emergencyContact: p.emergencyContact || '',
      referralSource: p.referralSource || '',
      patientType: 'NON_WALKIN',
      walkinDoctorId: '',
    });
    setOpen(true);
    // Fetch full patient to preserve fields that might not be included in list response
    (async () => {
      try {
        const full: any = await apiClient.getPatient(p.id);
        if (full) {
          setForm(prev => ({
            ...prev,
            emergencyContact: (full.emergencyContact ?? prev.emergencyContact) || '',
          }));
        }
      } catch {}
    })();
  };

  const calculateAge = (dob: string): number | null => {
    if (!dob) return null;
    const birthDate = new Date(dob);
    if (isNaN(birthDate.getTime())) return null;
    const today = new Date();
    // Check if DOB is today's date (default placeholder) - ignore time component
    const isToday = 
      birthDate.getFullYear() === today.getFullYear() &&
      birthDate.getMonth() === today.getMonth() &&
      birthDate.getDate() === today.getDate();
    
    if (isToday) return null; // Skip calculation for default date
    
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const handleArchive = async (patient: Patient) => {
    const patientName = formatPatientName(patient);
    try {
      setActionLoading(true);
      // Optimistic update
      setPatients(prev => prev.filter(p => p.id !== patient.id));
      setTotalPatients(prev => Math.max(0, prev - 1));
      await apiClient.archivePatient(patient.id);
      toast({
        title: 'Patient archived',
        description: `${patientName} has been archived`,
        action: {
          label: 'Undo',
          onClick: async () => {
            try {
              await apiClient.unarchivePatient(patient.id);
              await fetchPatients(currentPage);
              toast({ title: 'Archive undone', description: `${patientName} has been restored` });
            } catch (e: any) {
              toast({ title: 'Failed to restore', description: e?.message || 'Please try again', variant: 'destructive' });
            }
          },
        },
      });
    } catch (e: any) {
      // Revert on failure
      await fetchPatients(currentPage);
      toast({ title: 'Failed to archive', description: e?.message || 'Please try again', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleLinkPortalUser = (patient: Patient) => {
    setLinkPortalTarget(patient);
    setLinkPortalEmail(patient.email || '');
    setLinkPortalOpen(true);
  };

  const confirmLinkPortalUser = async () => {
    if (!linkPortalTarget || !linkPortalEmail.trim()) {
      toast({ title: 'Email required', description: 'Please enter an email address', variant: 'destructive' });
      return;
    }
    try {
      setActionLoading(true);
      await apiClient.linkPortalUser(linkPortalTarget.id, { email: linkPortalEmail.trim() });
      toast({
        title: 'Portal user linked',
        description: `Portal access has been linked for ${formatPatientName(linkPortalTarget)}`,
      });
      await fetchPatients(currentPage);
      setLinkPortalOpen(false);
      setLinkPortalTarget(null);
      setLinkPortalEmail('');
    } catch (err: any) {
      toast({
        title: 'Failed to link portal user',
        description: err?.message || 'An error occurred',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnlinkPortalUser = (patient: Patient) => {
    const patientName = formatPatientName(patient);
    toast({
      title: 'Confirm unlink',
      description: `Remove portal access for ${patientName}?`,
      action: {
        label: 'Confirm',
        onClick: async () => {
          try {
            setActionLoading(true);
            await apiClient.unlinkPortalUser(patient.id);
            toast({
              title: 'Portal user unlinked',
              description: `Portal access has been removed for ${patientName}`,
            });
            await fetchPatients(currentPage);
          } catch (err: any) {
            toast({
              title: 'Failed to unlink portal user',
              description: err?.message || 'An error occurred',
              variant: 'destructive',
            });
          } finally {
            setActionLoading(false);
          }
        },
      },
    });
  };

  const handleSendWhatsApp = async (patient: Patient) => {
    try {
      setActionLoading(true);
      await apiClient.sendAppointmentReminder(patient.id);
      toast({
        title: 'Reminder sent',
        description: `WhatsApp reminder sent to ${formatPatientName(patient)}`,
        variant: 'default',
      });
    } catch (err: any) {
      toast({
        title: 'Failed to send reminder',
        description: err?.message || 'No upcoming appointment or WhatsApp not configured',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const initials = (patient: Patient) => {
    const name = formatPatientName(patient);
    const parts = name.split(' ').filter(Boolean);
    const first = parts[0]?.[0] || '';
    const second = parts.length > 1 ? parts[1]?.[0] || '' : '';
    return `${first}${second}`.toUpperCase();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Patients</h2>
          <p className="text-gray-600">Search, add, and manage patient records</p>
        </div>
        <Dialog open={open} onOpenChange={(v: boolean) => { if (!v) resetForm(); setOpen(v); }}>
          <DialogTrigger asChild>
            <Button data-tour="add-patient-btn">
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
                <Label htmlFor="firstName">First Name</Label>
                <Input id="firstName" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="lastName">Last Name</Label>
                <Input id="lastName" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="dateOfBirth">Date of Birth</Label>
                <Input id="dateOfBirth" type="date" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} />
              </div>
              <div>
                <Label id="gender-label" htmlFor="gender">Gender</Label>
                <Select value={form.gender} onValueChange={(v: Gender) => setForm({ ...form, gender: v })}>
                  <SelectTrigger id="gender" aria-labelledby="gender-label">
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
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="abhaId">ABHA ID (Ayushman Bharat Health Account)</Label>
                <Input 
                  id="abhaId"
                  value={form.abhaId || ''} 
                  onChange={(e) => setForm({ ...form, abhaId: e.target.value })}
                  placeholder="Optional - Enter 14-digit ABHA number"
                />
                <div className="text-xs text-gray-500 mt-1">Enter the patient's ABHA ID for national health record integration</div>
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="address">Address</Label>
                <Input id="address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="emergencyContact">Emergency Contact</Label>
                <Input id="emergencyContact" value={form.emergencyContact} onChange={(e) => setForm({ ...form, emergencyContact: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <Label id="referralSource-label" htmlFor="referralSource">How did the patient hear about us?</Label>
                <Select value={form.referralSource || ''} onValueChange={(v: string) => setForm({ ...form, referralSource: v })}>
                  <SelectTrigger id="referralSource" aria-labelledby="referralSource-label">
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
                <Label id="patientType-label" htmlFor="patientType">Patient Type</Label>
                <Select value={form.patientType || 'NON_WALKIN'} onValueChange={(v: 'WALKIN' | 'NON_WALKIN') => setForm({ ...form, patientType: v })}>
                  <SelectTrigger id="patientType" aria-labelledby="patientType-label">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NON_WALKIN">Non walk-in</SelectItem>
                    <SelectItem value="WALKIN">Walk-in</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label id="walkinDoctorId-label" htmlFor="walkinDoctorId">Doctor (for walk-in)</Label>
                <Select value={form.walkinDoctorId || ''} onValueChange={(v: string) => setForm({ ...form, walkinDoctorId: v })}>
                  <SelectTrigger id="walkinDoctorId" aria-labelledby="walkinDoctorId-label">
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
              {form.patientType === 'WALKIN' && (
                <>
                  <div>
                    <Label id="walkinVisitType-label" htmlFor="walkinVisitType">Appointment Type (walk-in)</Label>
                    <Select value={form.walkinVisitType || 'OPD'} onValueChange={(v: VisitType) => setForm({ ...form, walkinVisitType: v, walkinRoomId: '' })}>
                      <SelectTrigger id="walkinVisitType" aria-labelledby="walkinVisitType-label">
                        <SelectValue placeholder="Select appointment type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="OPD">OPD Consultation</SelectItem>
                        <SelectItem value="PROCEDURE">Procedure</SelectItem>
                        <SelectItem value="TELEMED">Telemedicine</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {form.walkinVisitType !== 'TELEMED' && (
                    <div>
                      <Label id="walkinRoomId-label" htmlFor="walkinRoomId">Room (optional for OPD)</Label>
                      <Select value={form.walkinRoomId || ''} onValueChange={(v: string) => setForm({ ...form, walkinRoomId: v })}>
                        <SelectTrigger id="walkinRoomId" aria-labelledby="walkinRoomId-label">
                          <SelectValue placeholder="Select room" />
                        </SelectTrigger>
                        <SelectContent>
                          {filterRoomsByVisitType(rooms.filter(r => r.isActive), form.walkinVisitType || 'OPD').map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.name} — {r.type}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="text-xs text-gray-500 mt-1">
                        {form.walkinVisitType === 'PROCEDURE' ? 'Selecting an available procedure room is recommended.' : 'Optional: choose a consultation room if needed.'}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => { setOpen(false); resetForm(); }}>Cancel</Button>
              <Button onClick={submitPatient} disabled={actionLoading}>{form.id ? 'Save Changes' : 'Create'}</Button>
            </div>
          </DialogContent>
        </Dialog>
        <div className="flex gap-2">
          <Button variant="outline" onClick={clearFilters}>Clear Filters</Button>
          <Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4 mr-2" /> Export CSV</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row gap-4 items-center">
            <div className="relative w-full sm:flex-1" data-tour="search-patients">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input 
                id="patients-search"
                className="pl-10" 
                placeholder="Search by name, phone, ABHA, or email (min 2 chars)" 
                value={search} 
                onChange={(e) => setSearch(e.target.value)}
              />
              {search.length > 0 && search.length < 2 && (
                <div className="absolute top-full left-0 mt-1 text-xs text-gray-500">
                  Enter at least 2 characters to search
                </div>
              )}
              {search.length === 0 && (
                <div className="absolute top-full left-0 mt-1 text-xs text-gray-400">
                  Try: 9xxx… (phone), abha…, @email
                </div>
              )}
              {search.length > 0 && search.length < 2 && suggestions.length > 0 && (
                <div className="absolute z-10 mt-2 w-full bg-white border border-gray-200 rounded shadow-sm p-2">
                  <div className="text-xs text-gray-600 mb-1">Did you mean</div>
                  <div className="flex flex-wrap gap-2">
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className="text-sm px-2 py-1 rounded border border-gray-200 hover:bg-gray-50"
                        onClick={() => setSearch(s)}
                        aria-label={`Search for ${s}`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
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
            <Select value={portalFilter} onValueChange={(v: 'ALL' | 'LINKED' | 'UNLINKED') => setPortalFilter(v)}>
              <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Portal" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Portal</SelectItem>
                <SelectItem value="LINKED">Portal Linked</SelectItem>
                <SelectItem value="UNLINKED">Not Linked</SelectItem>
              </SelectContent>
            </Select>
            <Select value={abhaFilter} onValueChange={(v: 'ALL' | 'HAS' | 'NONE') => setAbhaFilter(v)}>
              <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="ABHA" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All ABHA</SelectItem>
                <SelectItem value="HAS">Has ABHA</SelectItem>
                <SelectItem value="NONE">No ABHA</SelectItem>
              </SelectContent>
            </Select>
            <Select value={pageSize.toString()} onValueChange={(v: string) => setPageSize(parseInt(v, 10))}>
              <SelectTrigger className="w-full sm:w-32"><SelectValue placeholder="Per page" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 / page</SelectItem>
                <SelectItem value="20">20 / page</SelectItem>
                <SelectItem value="50">50 / page</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Link Portal User Dialog */}
      <Dialog open={linkPortalOpen} onOpenChange={(v: boolean) => { if (!v) { setLinkPortalTarget(null); setLinkPortalEmail(''); } setLinkPortalOpen(v); }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Link Portal Access</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-gray-600">{linkPortalTarget ? `Patient: ${formatPatientName(linkPortalTarget)}` : ''}</div>
            <div>
              <Label htmlFor="linkPortalEmail">Email</Label>
              <Input id="linkPortalEmail" value={linkPortalEmail} onChange={(e) => setLinkPortalEmail(e.target.value)} placeholder="Enter email to link" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { setLinkPortalOpen(false); setLinkPortalTarget(null); setLinkPortalEmail(''); }}>Cancel</Button>
            <Button onClick={confirmLinkPortalUser} disabled={actionLoading || !linkPortalEmail.trim()}>Link</Button>
          </div>
        </DialogContent>
      </Dialog>

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
          ) : listLoading ? (
            <div className="space-y-3">{[...Array(6)].map((_, i) => (<div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />))}</div>
          ) : patients.length === 0 ? (
            <div className="text-center py-10 text-gray-500">
              {search.length >= 2 || genderFilter !== 'ALL' ? 'No patients found matching your search criteria' : 'No patients found'}
            </div>
          ) : (
            <div className="overflow-x-auto" data-tour="patients-table">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead onClick={() => toggleSort('NAME')} className="cursor-pointer select-none">
                      Patient {sortBy === 'NAME' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                    </TableHead>
                    <TableHead onClick={() => toggleSort('AGE')} className="cursor-pointer select-none">
                      Age {sortBy === 'AGE' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                    </TableHead>
                    <TableHead onClick={() => toggleSort('GENDER')} className="cursor-pointer select-none">
                      Gender {sortBy === 'GENDER' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                    </TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>ABHA ID</TableHead>
                    {displayPatients.some(p => !!p.lastVisitDate) && (
                      <TableHead onClick={() => toggleSort('LAST_VISIT')} className="cursor-pointer select-none">
                        Last Visit {sortBy === 'LAST_VISIT' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                      </TableHead>
                    )}
                    <TableHead onClick={() => toggleSort('REFERRAL')} className="cursor-pointer select-none">
                      Referral {sortBy === 'REFERRAL' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                    </TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayPatients.map((p) => (
                    <TableRow key={p.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/dashboard/patients/${p.id}`)}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar><AvatarFallback className="bg-blue-100 text-blue-600">{initials(p)}</AvatarFallback></Avatar>
                          <div>
                            <div className="font-medium text-gray-900">{formatPatientName(p)}</div>
                            <button
                              type="button"
                              className="text-xs text-gray-500 hover:underline"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard?.writeText(p.id).then(() => {
                                  toast({ title: 'Copied', description: 'Patient ID copied to clipboard' });
                                }).catch(() => {});
                              }}
                              title="Click to copy full ID"
                            >
                              ID: {p.id.slice(-8)}
                            </button>
                            {p.portalUserId && <Badge variant="outline" className="text-xs mt-1">Portal Linked</Badge>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{(() => {
                          const age = calculateAge(p.dob);
                          return age !== null ? `${age} yrs` : <span className="text-gray-400">—</span>;
                        })()}</div>
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
                        <div className="text-sm text-gray-600">{p.abhaId || <span className="text-gray-400">—</span>}</div>
                      </TableCell>
                      {displayPatients.some(pp => !!pp.lastVisitDate) && (
                        <TableCell>
                          <div className="text-sm text-gray-600">{p.lastVisitDate ? new Date(p.lastVisitDate).toLocaleDateString() : <span className="text-gray-400">—</span>}</div>
                        </TableCell>
                      )}
                      <TableCell>
                        <div className="text-sm text-gray-600">{p.referralSource || <span className="text-gray-400">—</span>}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/patients/${p.id}`); }}><Eye className="h-3 w-3 mr-1" /> View</Button>
                          <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); onEdit(p); }}><Edit className="h-3 w-3 mr-1" /> Edit</Button>
                          <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); handleArchive(p); }}><Archive className="h-3 w-3 mr-1" /> Archive</Button>
                          {p.portalUserId ? (
                            <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); handleUnlinkPortalUser(p); }}><Unlink className="h-3 w-3 mr-1" /> Unlink</Button>
                          ) : (
                            <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); handleLinkPortalUser(p); }}><LinkIcon className="h-3 w-3 mr-1" /> Link Portal</Button>
                          )}
                          <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); handleSendWhatsApp(p); }}><MessageSquare className="h-3 w-3 mr-1" /> WhatsApp</Button>
                          <Button size="sm" onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/visits?patientId=${p.id}&autoStart=true`); }}>
                            <Stethoscope className="h-3 w-3 mr-1" /> Start Visit
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          
          {/* Pagination Controls */}
          {!listLoading && patients.length > 0 && totalPages > 1 && (
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