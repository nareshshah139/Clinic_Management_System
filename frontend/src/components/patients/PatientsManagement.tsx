'use client';

import { displayClinicDate } from '@/lib/date-display';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingSkeleton } from '@/components/ui/skeleton';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Plus, Search, Edit, Eye, Phone, Mail, Archive, Link as LinkIcon, Unlink, Undo, MessageSquare, Stethoscope, Download } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { formatPatientName, calculateAge } from '@/lib/utils';
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import PatientFormDialog, { normalizeGender, type Gender } from './PatientFormDialog';
import { ToastAction } from '@/components/ui/toast';
import type { Patient, BackendPatientRow, GetPatientsResponseWithMeta } from '@/lib/types';

/**
 * @cc [owner:nareshshah139,label:accessibility] patient-search-hint-layout
 * Search hints MUST reserve their full wrapped height above the next filter.
 */
/**
 * @cc [owner:nareshshah139,label:accessibility] patient-row-actions
 * Patient actions remain available through labeled controls when the table is horizontally constrained.
 */
export default function PatientsManagement() {
  const router = useRouter();
  const { toast } = useToast();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [listLoading, setListLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [search, setSearch] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [genderFilter, setGenderFilter] = useState<'ALL' | Gender>('ALL');
  const [consultationTypeFilter, setConsultationTypeFilter] = useState<'ALL' | 'ONLINE' | 'OFFLINE'>('ALL');
  const [dateRangeFilter, setDateRangeFilter] = useState<'ALL' | 'LAST_1_WEEK' | 'LAST_1_MONTH'>('ALL');
  const [abhaFilter, setAbhaFilter] = useState<'ALL' | 'HAS' | 'NONE'>('ALL');
  const searchParams = useSearchParams();
  const [formOpen, setFormOpen] = useState<boolean>(() => searchParams?.get('new') === 'walkin');
  const [editId, setEditId] = useState<string | undefined>(undefined);
  const searchRef = useRef<HTMLInputElement>(null);
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
  const [linkPortalOpen, setLinkPortalOpen] = useState<boolean>(false);
  const [linkPortalEmail, setLinkPortalEmail] = useState<string>('');
  const [linkPortalTarget, setLinkPortalTarget] = useState<Patient | null>(null);
  const fetchIdRef = useRef(0);
  const [sortBy, setSortBy] = useState<'NAME' | 'AGE' | 'GENDER' | 'LAST_VISIT' | 'CREATED_AT'>('NAME');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
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
  useEffect(() => {
    const q = (searchParams?.get('search') || '').trim();
    if (q) {
      setSearch(q);
      setDebouncedSearch(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    searchRef.current?.focus();
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
      } else if (sortBy === 'GENDER') {
        r = cmp((a.gender || '').toString(), (b.gender || '').toString());
      } else if (sortBy === 'LAST_VISIT') {
        const da = a.lastVisitDate ? new Date(a.lastVisitDate).getTime() : -Infinity;
        const db = b.lastVisitDate ? new Date(b.lastVisitDate).getTime() : -Infinity;
        r = cmp(da, db);
      } else {
        const ca = a.createdAt ? new Date(a.createdAt).getTime() : -Infinity;
        const cb = b.createdAt ? new Date(b.createdAt).getTime() : -Infinity;
        r = cmp(ca, cb);
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

  const initials = (patient: Patient) => {
    const name = formatPatientName(patient);
    const parts = name.split(' ').filter(Boolean);
    const first = parts[0]?.[0] || '';
    const second = parts.length > 1 ? parts[1]?.[0] || '' : '';
    return `${first}${second}`.toUpperCase();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Button data-tour="add-patient-btn" onClick={() => { setEditId(undefined); setFormOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> New patient
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={clearFilters}>Clear filters</Button>
          <Button variant="outline" onClick={exportCsv} disabled={exporting}><Download className="h-4 w-4 mr-2" /> {exporting ? 'Exporting...' : 'Export CSV'}</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <div className="relative w-full sm:flex-1" data-tour="search-patients">
              <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input 
                id="patients-search"
                ref={searchRef}
                aria-label="Search patients"
                className="pl-10" 
                placeholder="Search name or phone" 
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
            <EmptyState title="No patients found" description={search.length >= 2 || genderFilter !== 'ALL' || dateRangeFilter !== 'ALL' ? 'Adjust your search or filters to find a patient.' : undefined} />
          ) : (
            <div className="min-w-0 max-w-full overflow-x-auto" data-tour="patients-table">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead aria-sort={sortBy === 'NAME' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}>
                      <button type="button" onClick={() => toggleSort('NAME')}>Patient {sortBy === 'NAME' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}</button>
                    </TableHead>
                    <TableHead>Patient Code</TableHead>
                    <TableHead aria-sort={sortBy === 'AGE' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}>
                      <button type="button" onClick={() => toggleSort('AGE')}>Age {sortBy === 'AGE' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}</button>
                    </TableHead>
                    <TableHead aria-sort={sortBy === 'GENDER' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}>
                      <button type="button" onClick={() => toggleSort('GENDER')}>Gender {sortBy === 'GENDER' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}</button>
                    </TableHead>
                    <TableHead>Contact</TableHead>
                    {displayPatients.some(p => !!p.lastVisitDate) && (
                      <TableHead aria-sort={sortBy === 'LAST_VISIT' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}>
                        <button type="button" onClick={() => toggleSort('LAST_VISIT')}>Last Visit {sortBy === 'LAST_VISIT' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}</button>
                      </TableHead>
                    )}
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
                        <div className="flex flex-col text-sm">
                          <div className="font-mono">
                            {p.patientCode ? p.patientCode : <span className="text-gray-400">—</span>}
                          </div>
                          {p.patientCode && (
                            <button
                              type="button"
                              className="text-xs text-gray-500 hover:underline"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard?.writeText(p.patientCode || '').then(() => {
                                  toast({ title: 'Copied', description: 'Patient code copied to clipboard' });
                                }).catch(() => {});
                              }}
                              title="Click to copy patient code"
                            >
                              Copy code
                            </button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{(() => {
                          const age = calculateAge(p);
                          return age !== null ? `${age} yrs` : <span className="text-gray-400">—</span>;
                        })()}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="whitespace-nowrap">{normalizeGender(p.gender)}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1 text-sm text-gray-700">
                          <div className="flex items-center"><Phone className="h-3 w-3 mr-1" /> {p.phone}</div>
                          {p.email && <div className="flex items-center"><Mail className="h-3 w-3 mr-1" /> {p.email}</div>}
                        </div>
                      </TableCell>
                      {displayPatients.some(pp => !!pp.lastVisitDate) && (
                        <TableCell>
                          <div className="text-sm text-gray-600">{p.lastVisitDate ? displayClinicDate(p.lastVisitDate) : <span className="text-gray-400">—</span>}</div>
                        </TableCell>
                      )}
                      <TableCell>
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <Button variant="outline" size="sm" className="whitespace-nowrap" onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/patients/${p.id}`); }}><Eye className="h-3 w-3 mr-1" /> View</Button>
                          <Button size="sm" className="whitespace-nowrap" onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/visits?patientId=${p.id}&autoStart=true`); }}>
                            <Stethoscope className="h-3 w-3 mr-1" /> Start visit
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="whitespace-nowrap" aria-label={`More actions for ${formatPatientName(p)}`} onClick={e => e.stopPropagation()}>More</Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end" onClick={(e: import('react').MouseEvent) => e.stopPropagation()}>
                              <DropdownMenuItem onSelect={() => { setEditId(p.id); setFormOpen(true); }}>Edit</DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => handleArchive(p)}>Archive</DropdownMenuItem>
                              {p.portalUserId ? <DropdownMenuItem onSelect={() => handleUnlinkPortalUser(p)}>Unlink portal</DropdownMenuItem> : <DropdownMenuItem onSelect={() => handleLinkPortalUser(p)}>Link portal</DropdownMenuItem>}
                              <DropdownMenuItem onSelect={() => handleSendWhatsApp(p)}>WhatsApp</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
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
      <PatientFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        patientId={editId}
        onSaved={() => { void fetchPatients(currentPage); }}
      />
    </div>
  );
} 