'use client';

import { displayCalendarDate, displayClinicDate } from '@/lib/date-display';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingSkeleton } from '@/components/ui/skeleton';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import Link from 'next/link';
import { Plus, Search, Edit, Eye, Archive, Link as LinkIcon, Unlink, MessageSquare, Stethoscope, Download, MoreHorizontal, CalendarPlus, Copy } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { track } from '@/lib/analytics';
import { formatPatientName, filterRoomsByVisitType, calculateAge } from '@/lib/utils';
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { useOverbookConfirm } from '@/components/appointments/useOverbookConfirm';
import { overbookFlag } from '@/lib/overbooking';
import { ToastAction } from '@/components/ui/toast';
import type { Patient, BackendPatientRow, GetPatientsResponseWithMeta, VisitType, Room } from '@/lib/types';

type Gender = 'MALE' | 'FEMALE' | 'OTHER';

interface PatientFormState {
  id?: string;
  abhaId?: string;
  firstName: string;
  lastName: string;
  age: string;
  gender: Gender | '';
  phone: string;
  email?: string;
  address?: string;
  emergencyContact?: string;
  referralSource?: string;
  consultationType?: 'ONLINE' | 'OFFLINE';
  patientType?: 'WALKIN' | 'NON_WALKIN';
  walkinDoctorId?: string;
  walkinVisitType?: VisitType;
  walkinRoomId?: string;
  /** Undefined until loaded or chosen, so an unloaded value is never saved; '' means no primary doctor. */
  primaryDoctorId?: string;
}

/**
 * @cc [owner:nareshshah139,label:accessibility] patient-search-hint-layout
 * Search hints MUST reserve their full wrapped height above the next filter.
 */
/**
 * @cc [owner:nareshshah139,label:accessibility] patient-row-actions
 * Every patient row MUST show Start Visit and a "More actions for <name>" menu inside the table's visible box at 1280px and wider, without horizontal scrolling.
 */
const REQUIRED_PATIENT_FIELDS = ['firstName', 'gender', 'phone'] as const;
type RequiredPatientField = (typeof REQUIRED_PATIENT_FIELDS)[number];
const MISSING_FIELD_MESSAGE: Record<RequiredPatientField, string> = {
  firstName: "Enter the patient's first name.",
  gender: "Choose the patient's gender.",
  phone: "Enter the patient's phone number.",
};

export default function PatientsManagement() {
  const router = useRouter();
  const { toast } = useToast();
  const { sendWithOverbookConfirm, overbookDialog } = useOverbookConfirm();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [listLoading, setListLoading] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [search, setSearch] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [genderFilter, setGenderFilter] = useState<'ALL' | Gender>('ALL');
  const [consultationTypeFilter, setConsultationTypeFilter] = useState<'ALL' | 'ONLINE' | 'OFFLINE'>('ALL');
  const [dateRangeFilter, setDateRangeFilter] = useState<'ALL' | 'LAST_1_WEEK' | 'LAST_1_MONTH'>('ALL');
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
  const [missingFields, setMissingFields] = useState<RequiredPatientField[]>([]);
  const [doctors, setDoctors] = useState<Array<{ id: string; firstName?: string; lastName?: string }>>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [linkPortalOpen, setLinkPortalOpen] = useState<boolean>(false);
  const [linkPortalEmail, setLinkPortalEmail] = useState<string>('');
  const [linkPortalTarget, setLinkPortalTarget] = useState<Patient | null>(null);
  const fetchIdRef = useRef(0);
  const [sortBy, setSortBy] = useState<'NAME' | 'AGE' | 'LAST_VISIT'>('NAME');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [form, setForm] = useState<PatientFormState>({
    abhaId: '',
    firstName: '',
    lastName: '',
    age: '',
    gender: '',
    phone: '',
    email: '',
    address: '',
    emergencyContact: '',
    referralSource: '',
    consultationType: 'OFFLINE',
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
      const code = p.patientCode || '';

      // Prefer prefix matches, then includes
      if (name.toLowerCase().startsWith(q)) candidates.add(name);
      else if (name.toLowerCase().includes(q)) candidates.add(name);

      if (phone.startsWith(q)) candidates.add(phone);
      if (abha.toLowerCase().startsWith(q)) candidates.add(abha);
      if (email.toLowerCase().startsWith(q)) candidates.add(email);
      if (code.toLowerCase().startsWith(q)) candidates.add(code);
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

  // Trigger fetch when pagination, page size, gender, date range, or debounced search changes
  useEffect(() => {
    void fetchPatients(currentPage);
  }, [currentPage, pageSize, debouncedSearch, genderFilter, consultationTypeFilter, dateRangeFilter]);

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
      const normConsultationType = consultationTypeFilter !== 'ALL' ? consultationTypeFilter : undefined;
      const normDateRange = dateRangeFilter !== 'ALL' ? dateRangeFilter : undefined;
      
      const searchTerm = debouncedSearch.length >= 2 ? debouncedSearch : undefined;
      
      const response = await apiClient.getPatients({
        page,
        limit: pageSize,
        search: searchTerm,
        gender: normGender,
        consultationType: normConsultationType,
        dateRange: normDateRange,
        abhaPresent: undefined,
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
          patientCode: bp.patientCode || undefined,
          abhaId: bp.abhaId || undefined,
          firstName: firstName || rawName || '',
          lastName: lastName,
          name: displayName,
          email: bp.email || undefined,
          phone: bp.phone,
          gender: normalizeGender(bp.gender),
          dob: bp.dob || undefined,
          age: bp.age ?? undefined,
          address: bp.address || undefined,
          city: bp.city || undefined,
          state: bp.state || undefined,
          referralSource: bp.referralSource || undefined,
          emergencyContact: bp.emergencyContact || undefined,
          portalUserId: bp.portalUserId || undefined,
          lastVisitDate: bp.lastVisitAt || undefined,
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
    const cmp = <T,>(a: T, b: T) => (a === b ? 0 : (a as any) < (b as any) ? -1 : 1);
    rows.sort((a, b) => {
      let r = 0;
      if (sortBy === 'NAME') {
        r = cmp((a.name || '').toLowerCase(), (b.name || '').toLowerCase());
      } else if (sortBy === 'AGE') {
        const ageA = calculateAge(a) ?? -Infinity;
        const ageB = calculateAge(b) ?? -Infinity;
        r = cmp(ageA, ageB);
      } else {
        const da = a.lastVisitDate ? new Date(a.lastVisitDate).getTime() : -Infinity;
        const db = b.lastVisitDate ? new Date(b.lastVisitDate).getTime() : -Infinity;
        r = cmp(da, db);
      }
      return sortOrder === 'asc' ? r : -r;
    });
    return rows;
  }, [patients, sortBy, sortOrder]);

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
    setConsultationTypeFilter('ALL');
    setDateRangeFilter('ALL');
    setCurrentPage(1);
  };

  const [exporting, setExporting] = useState(false);

  const exportCsv = async () => {
    try {
      setExporting(true);
      const normGender = genderFilter !== 'ALL' ? genderFilter : undefined;
      const normConsultationType = consultationTypeFilter !== 'ALL' ? consultationTypeFilter : undefined;
      const normDateRange = dateRangeFilter !== 'ALL' ? dateRangeFilter : undefined;
      const searchTerm = debouncedSearch.length >= 2 ? debouncedSearch : undefined;

      const response = await apiClient.getPatients({
        export: 'true',
        search: searchTerm,
        gender: normGender,
        consultationType: normConsultationType,
        dateRange: normDateRange,
      });

      const extractRows = (payload: unknown): BackendPatientRow[] => {
        if (!payload) return [];
        const p = payload as Partial<GetPatientsResponseWithMeta> | BackendPatientRow[];
        if (Array.isArray(p)) return p as BackendPatientRow[];
        if (Array.isArray((p as any).data)) return (p as any).data as BackendPatientRow[];
        if (Array.isArray((p as any).patients)) return (p as any).patients as BackendPatientRow[];
        return [];
      };

      const allRows = extractRows(response);
      const allPatients: Patient[] = allRows.map((bp: BackendPatientRow) => {
        const rawName = String(bp.name || '').trim();
        const firstName = String(bp.firstName || '').trim();
        const lastName = String(bp.lastName || '').trim();
        const displayName = formatPatientName({ id: bp.id, name: rawName, firstName, lastName });
        return {
          id: bp.id,
          patientCode: bp.patientCode || undefined,
          abhaId: bp.abhaId || undefined,
          firstName: firstName || rawName || '',
          lastName: lastName,
          name: displayName,
          email: bp.email || undefined,
          phone: bp.phone,
          gender: normalizeGender(bp.gender),
          dob: bp.dob || undefined,
          age: bp.age ?? undefined,
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

      const headers = [
        'ID','Name','Age','Gender','Phone','Email','ABHA ID','Referral','Consultation Type','Portal Linked','Created At'
      ];
      const lines = [headers.join(',')];
      const csvEscape = (v: unknown) => {
        const s = String(v ?? '');
        if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
        return s;
      };
      for (const p of allPatients) {
        const age = calculateAge(p);
        const row = [
          p.id,
          p.name,
          age !== null ? age : 'N/A',
          p.gender,
          p.phone,
          p.email || '',
          p.abhaId || '',
          p.referralSource || '',
          (p as any).consultationType === 'ONLINE' ? 'Online' : (p as any).consultationType === 'OFFLINE' ? 'Offline' : '',
          p.portalUserId ? 'Yes' : 'No',
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

      toast({ title: `Exported ${allPatients.length} patients to CSV` });
    } catch (err: any) {
      console.error('CSV export failed', err);
      toast({ title: 'Export failed', description: err?.message || 'Could not export patients.', variant: 'destructive' });
    } finally {
      setExporting(false);
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
      age: '',
      gender: '',
      phone: '',
      email: '',
      address: '',
      emergencyContact: '',
      referralSource: '',
      consultationType: 'OFFLINE',
      patientType: 'NON_WALKIN',
      walkinDoctorId: '',
      walkinVisitType: 'OPD',
      walkinRoomId: '',
    });
    setError(null);
    setMissingFields([]);
  };

  const clearMissing = (field: RequiredPatientField) =>
    setMissingFields((fields) => fields.filter((f) => f !== field));
  const missingProps = (field: RequiredPatientField) =>
    missingFields.includes(field)
      ? { 'aria-invalid': true as const, 'aria-describedby': `${field}-missing` }
      : {};
  const missingMessage = (field: RequiredPatientField) =>
    missingFields.includes(field) ? (
      <p id={`${field}-missing`} className="mt-1 text-sm text-destructive">{MISSING_FIELD_MESSAGE[field]}</p>
    ) : null;

  const submitPatient = async () => {
    try {
      setActionLoading(true);
      setError(null);
      
      // Basic validation
      const missing = REQUIRED_PATIENT_FIELDS.filter((field) => !String(form[field] ?? '').trim());
      setMissingFields(missing);
      if (missing.length) {
        document.getElementById(missing[0])?.focus();
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
      const parsedAge = form.age ? parseInt(form.age, 10) : undefined;
      const payload = {
        abhaId: form.abhaId || undefined,
        name: name || form.firstName || form.lastName,
        firstName: form.firstName || undefined,
        lastName: form.lastName || undefined,
        gender: form.gender,
        age: parsedAge != null && !isNaN(parsedAge) ? parsedAge : undefined,
        phone: form.phone,
        email: form.email || undefined,
        address: form.address || undefined,
        emergencyContact: form.emergencyContact || undefined,
        referralSource: form.referralSource || undefined,
        consultationType: form.consultationType || undefined,
        ...(form.primaryDoctorId !== undefined ? { primaryDoctorId: form.primaryDoctorId || null } : {}),
      };
      
      let savedPatientId = form.id;
      if (form.id) {
        await apiClient.updatePatient(form.id, payload);
      } else {
        const created = (await apiClient.createPatient(payload)) as any;
        savedPatientId = created?.id || created?.data?.id || savedPatientId;
        track('patient_registered', { source: 'patients_page' });
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
        const slotsRes = (await apiClient.getAvailableSlots({ doctorId, date: dateStr, durationMinutes: 30, calendar: 'CONFIRMED' })) as any;
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
          const booked = await sendWithOverbookConfirm((allowOverbook) => apiClient.createAppointment({
            patientId,
            doctorId,
            date: dateStr,
            slot,
            visitType,
            source: 'WALK_IN',
            calendar: 'CONFIRMED',
            notes: 'Auto-booked next available slot for walk-in',
            ...(roomId ? { roomId } : {}),
            ...overbookFlag(allowOverbook),
          }));
          if (!booked) {
            toast({ title: 'Walk-in not booked', description: `${slot} on ${displayCalendarDate(dateStr)} was taken and you chose not to overbook it.` });
            return;
          }
          track('appointment_booked', { source: 'walk_in' });
          toast({
            title: 'Walk-in appointment booked',
            description: `Booked into the Confirmed calendar for ${displayCalendarDate(dateStr)} at ${slot}`,
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
    const resolvedAge = calculateAge(p);
    setForm({
      id: p.id,
      abhaId: p.abhaId || '',
      firstName: p.firstName,
      lastName: p.lastName,
      age: resolvedAge != null ? String(resolvedAge) : '',
      gender: (['MALE', 'FEMALE', 'OTHER'] as const).find((g) => g === p.gender) ?? '',
      phone: p.phone,
      email: p.email || '',
      address: p.address || '',
      emergencyContact: p.emergencyContact || '',
      referralSource: p.referralSource || '',
      consultationType: (p as any).consultationType === 'ONLINE' ? 'ONLINE' : 'OFFLINE',
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
            primaryDoctorId: prev.primaryDoctorId ?? (full.primaryDoctorId || ''),
          }));
        }
      } catch {}
    })();
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
        action: (
          <ToastAction
            altText="Undo archive"
            onClick={async () => {
              try {
                await apiClient.unarchivePatient(patient.id);
                await fetchPatients(currentPage);
                toast({ title: 'Archive undone', description: `${patientName} has been restored` });
              } catch (e: unknown) {
                const errMsg = e instanceof Error ? e.message : 'Please try again';
                toast({ title: 'Failed to restore', description: errMsg, variant: 'destructive' });
              }
            }}
          >
            Undo
          </ToastAction>
        ),
      });
    } catch (e: unknown) {
      // Revert on failure
      await fetchPatients(currentPage);
      const errMsg = e instanceof Error ? e.message : 'Please try again';
      toast({ title: 'Failed to archive', description: errMsg, variant: 'destructive' });
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

  const ageSex = (patient: Patient) => {
    const age = calculateAge(patient);
    const sex = { MALE: 'Male', FEMALE: 'Female', OTHER: 'Other' }[patient.gender as Gender];
    return [age !== null ? String(age) : null, sex].filter(Boolean).join(' · ') || '—';
  };

  const copyPatientCode = (code: string) => {
    navigator.clipboard?.writeText(code).then(() => {
      toast({ title: 'Copied', description: 'Patient code copied to clipboard' });
    }).catch(() => {});
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="outline" onClick={clearFilters}>Clear Filters</Button>
        <Button variant="outline" onClick={exportCsv} disabled={exporting}><Download className="h-4 w-4 mr-2" /> {exporting ? 'Exporting...' : 'Export CSV'}</Button>
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
              <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
                {error}
              </div>
            )}
            <p className="text-sm text-muted-foreground">Fields marked <span aria-hidden="true">*</span> are required.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="firstName">First Name<span aria-hidden="true" className="text-destructive"> *</span></Label>
                <Input id="firstName" required aria-required="true" {...missingProps('firstName')} value={form.firstName} onChange={(e) => { setForm({ ...form, firstName: e.target.value }); clearMissing('firstName'); }} />
                {missingMessage('firstName')}
              </div>
              <div>
                <Label htmlFor="lastName">Last Name</Label>
                <Input id="lastName" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="age">Age (years)</Label>
                <Input id="age" type="number" min="0" max="150" placeholder="e.g. 35" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} />
              </div>
              <div>
                <Label id="gender-label" htmlFor="gender">Gender<span aria-hidden="true" className="text-destructive"> *</span></Label>
                <Select value={form.gender} onValueChange={(v: Gender) => { setForm({ ...form, gender: v }); clearMissing('gender'); }}>
                  <SelectTrigger id="gender" aria-labelledby="gender-label" aria-required="true" {...missingProps('gender')}>
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MALE">Male</SelectItem>
                    <SelectItem value="FEMALE">Female</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
                {missingMessage('gender')}
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="phone">Phone<span aria-hidden="true" className="text-destructive"> *</span></Label>
                <Input id="phone" type="tel" required aria-required="true" {...missingProps('phone')} value={form.phone} onChange={(e) => { setForm({ ...form, phone: e.target.value }); clearMissing('phone'); }} />
                {missingMessage('phone')}
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
              <div>
                <Label id="consultationType-label" htmlFor="consultationType">Consultation Type</Label>
                <Select value={form.consultationType || 'OFFLINE'} onValueChange={(v: 'ONLINE' | 'OFFLINE') => setForm({ ...form, consultationType: v })}>
                  <SelectTrigger id="consultationType" aria-labelledby="consultationType-label">
                    <SelectValue placeholder="Select consultation type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ONLINE">Online</SelectItem>
                    <SelectItem value="OFFLINE">Offline (In-Clinic Visit)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label id="primaryDoctor-label" htmlFor="primaryDoctor">Primary Doctor</Label>
                <Select value={form.primaryDoctorId === undefined ? (form.id ? 'LOADING' : 'DEFAULT') : form.primaryDoctorId || 'NONE'}
                  onValueChange={(v: string) => setForm({ ...form, primaryDoctorId: v === 'NONE' ? '' : v })}>
                  <SelectTrigger id="primaryDoctor" aria-labelledby="primaryDoctor-label">
                    <SelectValue placeholder="Select primary doctor" />
                  </SelectTrigger>
                  <SelectContent>
                    {form.primaryDoctorId === undefined && !form.id && <SelectItem value="DEFAULT">Automatic</SelectItem>}
                    {form.primaryDoctorId === undefined && form.id && <SelectItem value="LOADING" disabled>Loading…</SelectItem>}
                    <SelectItem value="NONE">Not assigned</SelectItem>
                    {doctors.map(d => (
                      <SelectItem key={d.id} value={d.id}>Dr. {`${d.firstName || ''} ${d.lastName || ''}`.trim().replace(/^dr\.?\s+/i, '')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.primaryDoctorId === undefined && !form.id && <p className="mt-1 text-xs text-gray-500">A doctor registering the patient becomes the primary doctor; otherwise the first visiting doctor does.</p>}
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
      </div>

      <Card>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <div className="relative w-full sm:flex-1" data-tour="search-patients">
              <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input 
                id="patients-search"
                aria-label="Search patients"
                className="pl-10" 
                placeholder="Search by name, phone, ABHA, or email (min 2 chars)" 
                value={search} 
                onChange={(e) => setSearch(e.target.value)}
                aria-describedby="patients-search-hint"
              />
              </div>
              <div id="patients-search-hint" className="mt-1 min-h-8 text-xs text-muted-foreground">
              {search.length > 0 && search.length < 2 && (
                <div className="text-xs text-gray-500">
                  Enter at least 2 characters to search
                </div>
              )}
              {search.length === 0 && (
                <div className="text-xs text-muted-foreground">
                  Try: 9xxx… (phone), abha…, @email
                </div>
              )}
              </div>
              {search.length > 0 && search.length < 2 && suggestions.length > 0 && (
                <div className="relative z-10 mt-2 w-full bg-white border border-gray-200 rounded-md shadow-sm p-2">
                  <div className="text-xs text-gray-600 mb-1">Did you mean</div>
                  <div className="flex flex-wrap gap-2">
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className="text-sm px-2 py-1 rounded-md border border-gray-200 hover:bg-gray-50"
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
              <SelectTrigger aria-label="Filter by gender" className="w-full sm:w-48"><SelectValue placeholder="Gender" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Genders</SelectItem>
                <SelectItem value="MALE">Male</SelectItem>
                <SelectItem value="FEMALE">Female</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
            <Select value={consultationTypeFilter} onValueChange={(v: 'ALL' | 'ONLINE' | 'OFFLINE') => setConsultationTypeFilter(v)}>
              <SelectTrigger aria-label="Filter by consultation type" className="w-full sm:w-48"><SelectValue placeholder="Consultation Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Consultations</SelectItem>
                <SelectItem value="ONLINE">Online</SelectItem>
                <SelectItem value="OFFLINE">Offline</SelectItem>
              </SelectContent>
            </Select>
            <Select value={dateRangeFilter} onValueChange={(v: 'ALL' | 'LAST_1_WEEK' | 'LAST_1_MONTH') => { setDateRangeFilter(v); setCurrentPage(1); }}>
              <SelectTrigger aria-label="Filter by date range" className="w-full sm:w-48"><SelectValue placeholder="Date Range" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Time</SelectItem>
                <SelectItem value="LAST_1_WEEK">Last 1 Week</SelectItem>
                <SelectItem value="LAST_1_MONTH">Last 1 Month</SelectItem>
              </SelectContent>
            </Select>
            <Select value={pageSize.toString()} onValueChange={(v: string) => setPageSize(parseInt(v, 10))}>
              <SelectTrigger aria-label="Patients per page" className="w-full sm:w-32"><SelectValue placeholder="Per page" /></SelectTrigger>
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
              <Input id="linkPortalEmail" value={linkPortalEmail} onChange={(e) => setLinkPortalEmail(e.target.value)} placeholder="Existing portal account email" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { setLinkPortalOpen(false); setLinkPortalTarget(null); setLinkPortalEmail(''); }}>Cancel</Button>
            <Button onClick={confirmLinkPortalUser} disabled={actionLoading || !linkPortalEmail.trim()}>Link</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Card>
        <CardContent>
          {error ? (
            <div className="text-center py-10">
              <div className="text-red-600 mb-2">{error}</div>
              <Button variant="outline" onClick={() => fetchPatients(currentPage)}>
                Try Again
              </Button>
            </div>
          ) : listLoading ? (
            <LoadingSkeleton label="Loading patients…" />
          ) : patients.length === 0 ? (
            <EmptyState title="No patients found" description={search.length >= 2 || genderFilter !== 'ALL' || dateRangeFilter !== 'ALL' ? 'Adjust your search or filters to find a patient.' : 'Add a patient to start their clinic record.'} />
          ) : (
            <div data-tour="patients-table">
              <Table data-own-cell-spacing className="[&_td]:py-1.5">
                <TableHeader>
                  <TableRow>
                    <TableHead aria-sort={sortBy === 'NAME' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}>
                      <button type="button" onClick={() => toggleSort('NAME')}>Patient {sortBy === 'NAME' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}</button>
                    </TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead aria-sort={sortBy === 'AGE' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}>
                      <button type="button" onClick={() => toggleSort('AGE')}>Age · Sex {sortBy === 'AGE' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}</button>
                    </TableHead>
                    <TableHead aria-sort={sortBy === 'LAST_VISIT' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}>
                      <button type="button" onClick={() => toggleSort('LAST_VISIT')}>Last visit {sortBy === 'LAST_VISIT' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}</button>
                    </TableHead>
                    <TableHead className="w-0"><span className="sr-only">Actions</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayPatients.map((p) => {
                    const name = formatPatientName(p);
                    const href = `/dashboard/patients/${p.id}`;
                    return (
                    <TableRow
                      key={p.id}
                      className="cursor-pointer"
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest('a, button, [role="menu"]')) return;
                        router.push(href);
                      }}
                    >
                      <TableCell>
                        <Link href={href} className="font-medium leading-tight text-foreground hover:underline">{name}</Link>
                        <div className="text-xs leading-tight text-muted-foreground">
                          {p.patientCode ? <span className="font-mono">{p.patientCode}</span> : 'No patient code'}
                          {p.portalUserId && ' · Portal linked'}
                        </div>
                      </TableCell>
                      <TableCell className="tabular-nums">{p.phone}</TableCell>
                      <TableCell>{ageSex(p)}</TableCell>
                      <TableCell>{p.lastVisitDate ? displayClinicDate(p.lastVisitDate) : <span className="text-muted-foreground">No visits yet</span>}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" className="whitespace-nowrap" onClick={() => router.push(`/dashboard/visits?patientId=${p.id}&autoStart=true`)}>
                            <Stethoscope /> Start Visit
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="size-8" aria-label={`More actions for ${name}`}><MoreHorizontal /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => router.push(href)}><Eye /> View</DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => onEdit(p)}><Edit /> Edit</DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => router.push(`/dashboard/appointments?patientId=${encodeURIComponent(p.id)}`)}><CalendarPlus /> Book appointment</DropdownMenuItem>
                              {p.patientCode && <DropdownMenuItem onSelect={() => copyPatientCode(p.patientCode!)}><Copy /> Copy code</DropdownMenuItem>}
                              <DropdownMenuItem onSelect={() => handleSendWhatsApp(p)}><MessageSquare /> WhatsApp reminder</DropdownMenuItem>
                              {p.portalUserId
                                ? <DropdownMenuItem onSelect={() => handleUnlinkPortalUser(p)}><Unlink /> Unlink portal</DropdownMenuItem>
                                : <DropdownMenuItem onSelect={() => handleLinkPortalUser(p)}><LinkIcon /> Link portal</DropdownMenuItem>}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem variant="destructive" onSelect={() => handleArchive(p)}><Archive /> Archive</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          
          {/* Pagination Controls */}
          {!listLoading && patients.length > 0 && totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t">
              <div className="text-sm text-gray-500">
                Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalPatients)} of {totalPatients} patients
              </div>
              <div className="flex flex-wrap items-center gap-2">
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
      {overbookDialog}
    </div>
  );
} 