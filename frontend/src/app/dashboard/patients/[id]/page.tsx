'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { calculateAge, formatAge } from '@/lib/utils';
import PatientProgressTracker from '@/components/patients/PatientProgressTracker';
import PatientHistoryVisitCard from '@/components/visits/PatientHistoryVisitCard';
import VisitPhotos from '@/components/visits/VisitPhotos';
import { Calendar, Users, ArrowLeft } from 'lucide-react';

type VisitEntry = Record<string, unknown> & {
  id?: string;
  createdAt?: string | Date;
  doctor?: { firstName?: string; lastName?: string } | null;
  diagnosis?: unknown;
  complaints?: unknown;
  plan?: unknown;
};

export default function PatientDetailsPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id as unknown as string;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [patient, setPatient] = useState<Record<string, any> | null>(null);
  const [visits, setVisits] = useState<VisitEntry[]>([]);
  const [doctorFilter, setDoctorFilter] = useState<string>('ALL');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [collapsedDates, setCollapsedDates] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        setError(null);
        const [p, h] = await Promise.all([
          apiClient.getPatient(id),
          apiClient.getPatientVisitHistory<VisitEntry[] | { visits?: VisitEntry[]; data?: VisitEntry[] }>(id, { limit: 10 }),
        ]);

        setPatient(p as any);
        const arr = Array.isArray(h) ? h : (h?.visits || h?.data || []);
        setVisits(arr as VisitEntry[]);
      } catch (e: any) {
        setError(e?.message || 'Failed to load patient');
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [id]);

  const patientName = useMemo(() => {
    if (!patient) return '';
    const raw = String(patient.name || '').trim();
    const first = String(patient.firstName || '').trim();
    const last = String(patient.lastName || '').trim();
    return (raw || `${first} ${last}`).trim();
  }, [patient]);

  const sortedVisits = useMemo(() => {
    return [...visits].sort((a, b) => {
      const da = a.createdAt ? new Date(String(a.createdAt)).getTime() : 0;
      const db = b.createdAt ? new Date(String(b.createdAt)).getTime() : 0;
      return db - da;
    });
  }, [visits]);

  const doctorOptions = useMemo(() => {
    const set = new Set<string>();
    sortedVisits.forEach((v) => {
      const label = `${v.doctor?.firstName ?? ''} ${v.doctor?.lastName ?? ''}`.trim();
      if (label) set.add(label);
    });
    return Array.from(set);
  }, [sortedVisits]);

  const filteredVisits = useMemo(() => {
    return sortedVisits.filter((v) => {
      const created = v.createdAt ? new Date(String(v.createdAt)) : null;
      if (doctorFilter !== 'ALL') {
        const label = `${v.doctor?.firstName ?? ''} ${v.doctor?.lastName ?? ''}`.trim();
        if (label !== doctorFilter) return false;
      }
      if (fromDate && created) {
        const from = new Date(fromDate);
        if (created < from) return false;
      }
      if (toDate && created) {
        const to = new Date(toDate);
        to.setHours(23, 59, 59, 999);
        if (created > to) return false;
      }
      return true;
    });
  }, [sortedVisits, doctorFilter, fromDate, toDate]);

  const groupedByDate = useMemo(() => {
    const groups: Array<{ dateLabel: string; entries: VisitEntry[] }> = [];
    for (const v of filteredVisits) {
      const d = v.createdAt ? new Date(String(v.createdAt)) : null;
      const key = d ? d.toLocaleDateString() : 'Unknown date';
      const last = groups[groups.length - 1];
      if (last && last.dateLabel === key) {
        last.entries.push(v);
      } else {
        groups.push({ dateLabel: key, entries: [v] });
      }
    }
    return groups;
  }, [filteredVisits]);

  const lastVisit = sortedVisits[0];
  const lastVisitDate = lastVisit?.createdAt ? new Date(String(lastVisit.createdAt)) : null;

  const nextAppointmentLabel = (() => {
    const upcoming = patient?.nextAppointment as any;
    if (upcoming?.date && upcoming?.slot) {
      return `${new Date(String(upcoming.date)).toLocaleDateString()} @ ${upcoming.slot}`;
    }
    return 'Not scheduled';
  })();

  const getPrimaryDiagnosis = (entry: VisitEntry): string | undefined => {
    const d = entry.diagnosis;
    if (Array.isArray(d) && d.length > 0) {
      const first = d[0] as any;
      if (typeof first === 'string') return first;
      if (first && typeof first === 'object') return String(first.diagnosis || first.name || '').trim() || undefined;
    }
    if (typeof d === 'string') return d;
    return undefined;
  };

  const getChiefComplaint = (entry: VisitEntry): string | undefined => {
    const c = entry.complaints;
    if (Array.isArray(c) && c.length > 0) {
      const first = c[0] as any;
      if (typeof first === 'string') return first;
      if (first && typeof first === 'object') return String(first.complaint || '').trim() || undefined;
    }
    if (typeof c === 'string') return c;
    return undefined;
  };

  const renderVisitItem = (v: VisitEntry) => {
    return (
      <PatientHistoryVisitCard
        key={v.id || `${String(v.createdAt)}`}
        visit={v}
        visitLabel={
          [getChiefComplaint(v), getPrimaryDiagnosis(v)].filter(Boolean).length === 0
            ? 'Visit record'
            : undefined
        }
        onResume={
          v.id
            ? () =>
                router.push(
                  `/dashboard/visits?visitId=${encodeURIComponent(String(v.id))}&patientId=${encodeURIComponent(id)}`
                )
            : undefined
        }
      />
    );
  };

  if (loading) {
    return (
      <div className="p-6 text-sm text-gray-600">Loading patient…</div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="mb-4 text-red-700 bg-red-50 border border-red-200 p-3 rounded text-sm">{error}</div>
        <Button variant="outline" onClick={() => router.push('/dashboard/patients')}>Back to Patients</Button>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="p-6">
        <div className="mb-4 text-gray-700 bg-gray-50 border border-gray-200 p-3 rounded text-sm">Patient not found.</div>
        <Button variant="outline" onClick={() => router.push('/dashboard/patients')}>Back to Patients</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            <div>
              <h1 className="text-2xl font-semibold text-gray-900 leading-tight">{patientName || 'Patient'}</h1>
              <div className="flex flex-wrap gap-2 mt-1 text-xs text-gray-600">
                <Badge variant="secondary">ID: {patient.id}</Badge>
                {patient.patientCode && <Badge variant="secondary">Code: {patient.patientCode}</Badge>}
                {patient.abhaId && <Badge variant="outline">ABHA: {patient.abhaId}</Badge>}
                {patient.gender && <Badge variant="outline">{patient.gender}</Badge>}
                {calculateAge(patient) !== null && <Badge variant="outline">{calculateAge(patient)} yrs</Badge>}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {lastVisit?.id && (
              <Button variant="outline" onClick={() => router.push(`/dashboard/visits?visitId=${encodeURIComponent(String(lastVisit.id))}&patientId=${encodeURIComponent(id)}`)}>
                Resume last visit
              </Button>
            )}
            <Button onClick={() => router.push(`/dashboard/visits?patientId=${encodeURIComponent(id)}&autoStart=true`)}>
              Start new visit
            </Button>
            <Button variant="outline" onClick={() => router.push(`/dashboard/appointments?patientId=${encodeURIComponent(id)}`)}>Book appointment</Button>
            <Button variant="outline" onClick={() => router.push('/dashboard/patients')}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Back
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div className="space-y-1">
              <div className="text-gray-500">Primary contact</div>
              <div className="font-medium text-gray-900">{patient.phone || '—'}</div>
              <div className="text-gray-600">{patient.email || '—'}</div>
            </div>
            <div className="space-y-1">
              <div className="text-gray-500">Last visit</div>
              <div className="font-medium text-gray-900">
                {lastVisitDate ? lastVisitDate.toLocaleDateString() : 'No visits yet'}
              </div>
              {lastVisit?.doctor && (
                <div className="text-gray-600">Dr. {(lastVisit.doctor.firstName ?? '')} {(lastVisit.doctor.lastName ?? '')}</div>
              )}
            </div>
            <div className="space-y-1">
              <div className="text-gray-500">Next appointment</div>
              <div className="font-medium text-gray-900">{nextAppointmentLabel}</div>
              <div className="text-gray-600">{patient.referralSource ? `Referral: ${patient.referralSource}` : ''}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Minimal Patient Progress Tracker */}
      <PatientProgressTracker patientId={id} />

      <Tabs defaultValue="info" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="info">Info</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="uploads">Uploads</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Patient Information</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div><span className="text-gray-600">Gender:</span> <span className="text-gray-900">{patient.gender || '—'}</span></div>
              <div><span className="text-gray-600">Age:</span> <span className="text-gray-900">{formatAge(patient)}</span></div>
              <div><span className="text-gray-600">Phone:</span> <span className="text-gray-900">{patient.phone || '—'}</span></div>
              <div><span className="text-gray-600">Email:</span> <span className="text-gray-900">{patient.email || '—'}</span></div>
              <div><span className="text-gray-600">ABHA ID:</span> <span className="text-gray-900">{patient.abhaId || '—'}</span></div>
              <div><span className="text-gray-600">Address:</span> <span className="text-gray-900">{patient.address || '—'}</span></div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Visit History</CardTitle>
            </CardHeader>
            <CardContent>
              {visits.length === 0 ? (
                <div className="text-sm text-gray-500">None</div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3">
                    <div className="flex flex-wrap gap-2 items-center text-sm">
                      <span className="text-gray-600">Filter:</span>
                      <select
                        className="border border-gray-200 rounded px-3 py-2 text-sm"
                        value={doctorFilter}
                        onChange={(e) => setDoctorFilter(e.target.value)}
                      >
                        <option value="ALL">All doctors</option>
                        {doctorOptions.map((d) => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex gap-2 items-center">
                      <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} aria-label="From date" />
                      <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} aria-label="To date" />
                    </div>
                    <div className="flex items-center justify-end">
                      <Button variant="outline" size="sm" onClick={() => { setDoctorFilter('ALL'); setFromDate(''); setToDate(''); }}>
                        Clear filters
                      </Button>
                    </div>
                  </div>

                  {groupedByDate.length === 0 ? (
                    <div className="text-sm text-gray-500">No visits match the current filters.</div>
                  ) : (
                    <div className="space-y-3">
                      {groupedByDate.map((group) => {
                        const collapsed = collapsedDates[group.dateLabel];
                        const toggle = () => setCollapsedDates((prev) => ({ ...prev, [group.dateLabel]: !prev[group.dateLabel] }));
                        return (
                          <div key={group.dateLabel} className="border border-gray-200 rounded">
                            <button
                              type="button"
                              className="w-full flex items-center justify-between px-4 py-2 bg-gray-50 hover:bg-gray-100"
                              onClick={toggle}
                            >
                              <div className="flex items-center gap-3">
                                <Calendar className="h-4 w-4 text-gray-500" />
                                <span className="font-medium text-gray-900">{group.dateLabel}</span>
                                <Badge variant="secondary">{group.entries.length} visit{group.entries.length > 1 ? 's' : ''}</Badge>
                              </div>
                              <span className="text-sm text-gray-600">{collapsed ? 'Show' : 'Hide'}</span>
                            </button>
                            {!collapsed && (
                              <div className="p-3 space-y-2">
                                {group.entries.map(renderVisitItem)}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="uploads" className="mt-4">
          <VisitPhotos visitId="temp" patientId={id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

