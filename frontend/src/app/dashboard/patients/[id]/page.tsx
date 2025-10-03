'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Users, Calendar, Stethoscope, ArrowLeft } from 'lucide-react';

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
    return (
      <div key={v.id || `${String(v.createdAt)}`} className="rounded border border-gray-200 p-3">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <Calendar className="h-4 w-4 text-gray-400" />
            <span>{date ? `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Unknown date'}</span>
          </div>
          {doctorName && (
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <Stethoscope className="h-4 w-4 text-gray-400" />
              <span>Dr. {doctorName}</span>
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
          {complaint && <div><span className="text-gray-600">Chief complaint:</span> <span className="text-gray-900">{complaint}</span></div>}
          {diagnosis && <div><span className="text-gray-600">Diagnosis:</span> <span className="text-gray-900">{diagnosis}</span></div>}
        </div>
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          <h1 className="text-2xl font-semibold text-gray-900">{patientName || 'Patient'}</h1>
          <Badge variant="secondary" className="ml-1">ID: {patient.id}</Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push('/dashboard/patients')}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
          <Button onClick={() => router.push(`/dashboard/appointments?patientId=${encodeURIComponent(id)}`)}>Book appointment</Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Patient Information</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div><span className="text-gray-600">Gender:</span> <span className="text-gray-900">{patient.gender || '—'}</span></div>
          <div><span className="text-gray-600">Date of Birth:</span> <span className="text-gray-900">{patient.dob ? new Date(patient.dob).toLocaleDateString() : '—'}</span></div>
          <div><span className="text-gray-600">Phone:</span> <span className="text-gray-900">{patient.phone || '—'}</span></div>
          <div><span className="text-gray-600">Email:</span> <span className="text-gray-900">{patient.email || '—'}</span></div>
          <div><span className="text-gray-600">ABHA ID:</span> <span className="text-gray-900">{patient.abhaId || '—'}</span></div>
          <div><span className="text-gray-600">Address:</span> <span className="text-gray-900">{patient.address || '—'}</span></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Visit History</CardTitle>
        </CardHeader>
        <CardContent>
          {visits.length === 0 ? (
            <div className="text-sm text-gray-500">None</div>
          ) : (
            <div className="space-y-3">
              {visits.map(renderVisitItem)}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


