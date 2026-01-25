'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDob } from '@/lib/utils';
import PatientProgressTracker from '@/components/patients/PatientProgressTracker';
import VisitPhotos from '@/components/visits/VisitPhotos';
import { Calendar, Stethoscope, Users, ArrowLeft } from 'lucide-react';

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

  // Normalize thumbnail/image URLs so they work both for legacy `/uploads/*` files
  // and new DB-backed endpoints served under `/api/visits/...`.
  const toAbsolute = (path: string) => {
    if (!path) return path as unknown as string;
    const p = String(path);
    if (/^https?:\/\//i.test(p)) return p;
    const cleaned = p.replace(/^\/?api\/+/, '/');
    if (/^\/?uploads\//i.test(cleaned) || /\/uploads\//i.test(cleaned)) {
      const startIdx = cleaned.toLowerCase().indexOf('/uploads/');
      const suffix = startIdx >= 0 ? cleaned.slice(startIdx) : `/${cleaned.replace(/^\/?/, '')}`;
      return suffix.startsWith('/uploads/') ? suffix : `/uploads/${suffix.replace(/^\/?uploads\//i, '')}`;
    }
  // Default to proxying through Next.js API rewrite (ensure single slash)
  return `/api/${cleaned.replace(/^\//, '')}`;
  };

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

  const calculateAge = (dob: string | undefined) => {
    if (!dob) return null;
    const birthDate = new Date(dob);
    if (isNaN(birthDate.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
    return age;
  };

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
    const date = v.createdAt ? new Date(String(v.createdAt)) : null;
    const doctorName = v.doctor ? `${v.doctor.firstName ?? ''} ${v.doctor.lastName ?? ''}`.trim() : undefined;
    const diagnosis = getPrimaryDiagnosis(v);
    const complaint = getChiefComplaint(v);
    const photoCount = Number((v as any)?.photos || 0);
    const photoPreviews = Array.isArray((v as any)?.photoPreviewUrls)
      ? ((v as any).photoPreviewUrls as string[])
      : [];
    const drugNames = Array.isArray((v as any)?.prescriptionDrugNames)
      ? ((v as any).prescriptionDrugNames as string[])
      : [];
    // Additional fields surfaced by visit history API
    const visitVitals = ((): any => {
      const raw = (v as any)?.vitals as unknown;
      if (!raw) return undefined;
      if (typeof raw === 'object') return raw as any;
      try { return JSON.parse(String(raw)); } catch { return undefined; }
    })();
    const bpS = (visitVitals?.bpS ?? visitVitals?.bpSys ?? visitVitals?.systolicBP) as string | number | undefined;
    const bpD = (visitVitals?.bpD ?? visitVitals?.bpDia ?? visitVitals?.diastolicBP) as string | number | undefined;
    const hrVal = (visitVitals?.hr ?? visitVitals?.heartRate ?? visitVitals?.pulse ?? visitVitals?.pr) as string | number | undefined;
    const tempVal = (visitVitals?.temp ?? visitVitals?.temperature) as string | number | undefined;
    const spo2Val = (visitVitals?.spo2) as string | number | undefined;
    const rrVal = (visitVitals?.rr ?? visitVitals?.respiratoryRate) as string | number | undefined;
    const heightCm = (visitVitals?.height ?? visitVitals?.heightCm) as string | number | undefined;
    const weightKg = (visitVitals?.weight) as string | number | undefined;

    const rxItems = Array.isArray((v as any)?.prescriptionItems)
      ? ((v as any).prescriptionItems as Array<Record<string, unknown>>)
      : [];
    const rxMeta = (v as any)?.prescriptionMeta as Record<string, unknown> | undefined;
    const planSummary = (v as any)?.planSummary as Record<string, unknown> | undefined;
    const historySummary = (v as any)?.historySummary as Record<string, unknown> | undefined;
    const examSummary = (v as any)?.examSummary as Record<string, unknown> | undefined;

    const invs: string[] = Array.isArray((planSummary as any)?.investigations)
      ? ((planSummary as any).investigations as unknown[]).map((x) => String(x))
      : [];
    const procedurePlannedText: string | undefined = (planSummary && (planSummary as any).procedurePlanned != null)
      ? String((planSummary as any).procedurePlanned)
      : undefined;
    const followUpText: string | undefined = (planSummary && (planSummary as any).followUpInstructions != null)
      ? String((planSummary as any).followUpInstructions)
      : undefined;
    const counselingText: string | undefined = (planSummary && (planSummary as any).counseling != null)
      ? String((planSummary as any).counseling)
      : undefined;
    const validUntilIso: string | undefined = (rxMeta && (rxMeta as any).validUntil != null)
      ? String((rxMeta as any).validUntil)
      : undefined;
    const pastHistoryText: string | undefined = (historySummary && (historySummary as any).pastHistory != null)
      ? String((historySummary as any).pastHistory)
      : undefined;
    const medicationHistoryText: string | undefined = (historySummary && (historySummary as any).medicationHistory != null)
      ? String((historySummary as any).medicationHistory)
      : undefined;
    const menstrualHistoryText: string | undefined = (historySummary && (historySummary as any).menstrualHistory != null)
      ? String((historySummary as any).menstrualHistory)
      : undefined;
    const familyHistoryObj: unknown = historySummary ? (historySummary as any).familyHistory : undefined;
    const generalAppearanceText: string | undefined = (examSummary && (examSummary as any).generalAppearance != null)
      ? String((examSummary as any).generalAppearance)
      : undefined;
    const dermatologyText: string | undefined = (() => {
      if (!examSummary) return undefined;
      const val = (examSummary as any).dermatology as unknown;
      if (val == null) return undefined;
      if (typeof val === 'string') return val;
      try { return JSON.stringify(val); } catch { return String(val); }
    })();
    const hasHistorySummary: boolean = Boolean(pastHistoryText) || Boolean(medicationHistoryText) || Boolean(menstrualHistoryText) || Boolean(familyHistoryObj && Object.keys((familyHistoryObj as Record<string, unknown>) || {}).length > 0);
    return (
      <div key={v.id || `${String(v.createdAt)}`} className="rounded border border-gray-200 p-3">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <Calendar className="h-4 w-4 text-gray-400" />
            <span>{date ? `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Unknown date'}</span>
          </div>
          <div className="flex items-center gap-2">
            {doctorName && (
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <Stethoscope className="h-4 w-4 text-gray-400" />
                <span>Dr. {doctorName}</span>
              </div>
            )}
            {v.id && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => router.push(`/dashboard/visits?visitId=${encodeURIComponent(String(v.id))}&patientId=${encodeURIComponent(id)}`)}
              >
                Resume
              </Button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
          {complaint && <div><span className="text-gray-600">Chief complaint:</span> <span className="text-gray-900">{complaint}</span></div>}
          <div className="flex items-center justify-between">
            {diagnosis && <div><span className="text-gray-600">Diagnosis:</span> <span className="text-gray-900">{diagnosis}</span></div>}
            {photoCount > 0 && (
              <Badge variant="outline" className="ml-2">{photoCount} Photos</Badge>
            )}
          </div>
        </div>
        {drugNames.length > 0 && (
          <div className="mt-2 text-sm">
            <span className="text-gray-600">Drugs:</span>
            <div className="mt-1 flex flex-wrap gap-1">
              {drugNames.slice(0, 6).map((d, i) => (
                <Badge key={`${v.id || 'visit'}-drug-${i}`} variant="outline">{String(d)}</Badge>
              ))}
              {drugNames.length > 6 && (
                <span className="text-xs text-gray-500 ml-1">+{drugNames.length - 6} more</span>
              )}
            </div>
          </div>
        )}
        {(bpS || bpD || hrVal || tempVal || spo2Val || rrVal || heightCm || weightKg) && (
          <div className="mt-2 pt-2 border-t border-gray-200">
            <div className="text-sm text-gray-600 font-medium mb-1">Vitals</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              {(bpS || bpD) && (
                <div><span className="text-gray-600 mr-1">BP:</span><span className="font-medium">{bpS ?? '?'} / {bpD ?? '?'}</span></div>
              )}
              {hrVal !== undefined && hrVal !== null && String(hrVal) !== '' && (
                <div><span className="text-gray-600 mr-1">Pulse:</span><span className="font-medium">{hrVal} bpm</span></div>
              )}
              {tempVal !== undefined && tempVal !== null && String(tempVal) !== '' && (
                <div><span className="text-gray-600 mr-1">Temp:</span><span className="font-medium">{tempVal} °F</span></div>
              )}
              {spo2Val !== undefined && spo2Val !== null && String(spo2Val) !== '' && (
                <div><span className="text-gray-600 mr-1">SpO₂:</span><span className="font-medium">{spo2Val} %</span></div>
              )}
              {rrVal !== undefined && rrVal !== null && String(rrVal) !== '' && (
                <div><span className="text-gray-600 mr-1">RR:</span><span className="font-medium">{rrVal} /min</span></div>
              )}
              {heightCm !== undefined && heightCm !== null && String(heightCm) !== '' && (
                <div><span className="text-gray-600 mr-1">Height:</span><span className="font-medium">{heightCm} cm</span></div>
              )}
              {weightKg !== undefined && weightKg !== null && String(weightKg) !== '' && (
                <div><span className="text-gray-600 mr-1">Weight:</span><span className="font-medium">{weightKg} kg</span></div>
              )}
            </div>
          </div>
        )}
        {rxItems.length > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-200">
            <div className="text-sm text-gray-600 font-medium mb-1">Prescription Items</div>
            <div className="space-y-2">
              {rxItems.map((it, idx) => {
                const name = typeof it.drugName === 'string' ? it.drugName : undefined;
                const dosage = (it.dosage != null) ? String(it.dosage) : undefined;
                const dosageUnit = typeof it.dosageUnit === 'string' ? it.dosageUnit : undefined;
                const frequency = typeof it.frequency === 'string' ? it.frequency.replaceAll('_', ' ') : undefined;
                const duration = (it.duration != null) ? String(it.duration) : undefined;
                const durationUnit = typeof it.durationUnit === 'string' ? it.durationUnit : undefined;
                const route = typeof it.route === 'string' ? it.route : undefined;
                const timing = typeof it.timing === 'string' ? it.timing : undefined;
                const instructions = typeof it.instructions === 'string' ? it.instructions : undefined;
                const quantity = (it.quantity != null) ? String(it.quantity) : undefined;
                const line: string[] = [];
                if (dosage) line.push(dosage + (dosageUnit ? ` ${dosageUnit}` : ''));
                if (frequency) line.push(frequency);
                if (duration) line.push(`${duration}${durationUnit ? ` ${durationUnit}` : ''}`);
                if (route) line.push(route);
                if (timing) line.push(timing);
                if (quantity) line.push(`Qty: ${quantity}`);
                return (
                  <div key={`${v.id || 'visit'}-rx-${idx}`} className="rounded border border-gray-200 p-2">
                    <div className="text-sm">
                      <div className="font-medium text-gray-900">{name || `Item ${idx + 1}`}</div>
                      {line.length > 0 && (
                        <div className="text-gray-700">{line.join(' • ')}</div>
                      )}
                      {instructions && (
                        <div className="text-gray-700 mt-1">Instructions: {instructions}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {(invs.length > 0 || procedurePlannedText || followUpText || counselingText || validUntilIso) && (
          <div className="mt-2 pt-2 border-t border-gray-200">
            <div className="text-sm text-gray-600 font-medium mb-1">Prescription Summary</div>
            <div className="space-y-1 text-sm">
              {invs.length > 0 && (
                <div><span className="text-gray-600 mr-1">Investigations:</span><span className="font-medium">{invs.join(', ')}</span></div>
              )}
              {procedurePlannedText && (
                <div><span className="text-gray-600 mr-1">Procedure Planned:</span><span className="font-medium">{procedurePlannedText}</span></div>
              )}
              {followUpText && (
                <div><span className="text-gray-600 mr-1">Follow-up:</span><span className="font-medium">{followUpText}</span></div>
              )}
              {validUntilIso && (
                <div><span className="text-gray-600 mr-1">Valid Until:</span><span className="font-medium">{new Date(validUntilIso).toLocaleDateString()}</span></div>
              )}
              {counselingText && (
                <div><span className="text-gray-600 mr-1">Counseling:</span><span className="font-medium">{counselingText}</span></div>
              )}
            </div>
          </div>
        )}
        {hasHistorySummary && (
          <div className="mt-2 pt-2 border-t border-gray-200">
            <div className="text-sm text-gray-600 font-medium mb-1">History</div>
            <div className="space-y-1 text-sm">
              {pastHistoryText && (
                <div><span className="text-gray-600 mr-1">Past:</span><span className="font-medium">{pastHistoryText}</span></div>
              )}
              {medicationHistoryText && (
                <div><span className="text-gray-600 mr-1">Medications:</span><span className="font-medium">{medicationHistoryText}</span></div>
              )}
              {menstrualHistoryText && (
                <div><span className="text-gray-600 mr-1">Menstrual:</span><span className="font-medium">{menstrualHistoryText}</span></div>
              )}
              {familyHistoryObj ? (
                <div><span className="text-gray-600 mr-1">Family:</span><span className="font-medium">{(() => { try { return String(JSON.stringify(familyHistoryObj)); } catch { return String(familyHistoryObj as any); } })()}</span></div>
              ) : null}
            </div>
          </div>
        )}
        {(generalAppearanceText || dermatologyText) && (
          <div className="mt-2 pt-2 border-t border-gray-200">
            <div className="text-sm text-gray-600 font-medium mb-1">Examination</div>
            <div className="space-y-1 text-sm">
              {generalAppearanceText && (
                <div><span className="text-gray-600 mr-1">General:</span><span className="font-medium">{generalAppearanceText}</span></div>
              )}
              {dermatologyText ? (
                <div><span className="text-gray-600 mr-1">Dermatology:</span><span className="font-medium">{String(dermatologyText)}</span></div>
              ) : null}
            </div>
          </div>
        )}
        {photoPreviews.length > 0 && (
          <div className="mt-2 flex gap-2 overflow-x-auto">
            {photoPreviews.map((u, i) => (
              <img key={`${v.id || 'visit'}-p-${i}`} src={toAbsolute(u)} alt="preview" className="h-12 w-20 object-cover rounded border" />
            ))}
          </div>
        )}
      </div>
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
                {calculateAge(patient.dob) !== null && <Badge variant="outline">{calculateAge(patient.dob)} yrs</Badge>}
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
              <div><span className="text-gray-600">Date of Birth:</span> <span className="text-gray-900">{formatDob(patient.dob)}</span></div>
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


