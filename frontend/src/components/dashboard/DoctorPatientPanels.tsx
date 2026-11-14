'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ClipboardList, UserRound } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { displayClinicDate, displayClinicDateTime } from '@/lib/date-display';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

type RecentVisit = {
  id: string;
  createdAt: string;
  status?: string;
  patient: { id: string; name: string };
  diagnosis?: Array<{ diagnosis?: string; name?: string } | string>;
};
type MyPatient = { id: string; name: string; patientCode?: string | null; phone?: string; lastVisitAt?: string | null };
type Loadable<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; value: T };

const PAGE_SIZE = 10;

function diagnosisSummary(visit: RecentVisit): string {
  const first = visit.diagnosis?.[0];
  if (!first) return 'No diagnosis recorded';
  return typeof first === 'string' ? first : first.diagnosis || first.name || 'No diagnosis recorded';
}

/** The patients assigned to the logged-in doctor as primary doctor, searchable, then the doctor's recent visits. */
export function DoctorPatientPanels({ doctorId }: { doctorId: string }) {
  const [visits, setVisits] = useState<Loadable<RecentVisit[]>>({ status: 'loading' });
  const [patients, setPatients] = useState<Loadable<{ rows: MyPatient[]; total: number }>>({ status: 'loading' });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.get<{ visits: RecentVisit[] }>(`/visits/doctor/${encodeURIComponent(doctorId)}`, { limit: 8 });
        if (!cancelled) setVisits({ status: 'ready', value: res?.visits ?? [] });
      } catch {
        if (!cancelled) setVisits({ status: 'error' });
      }
    })();
    return () => { cancelled = true; };
  }, [doctorId]);

  useEffect(() => {
    let cancelled = false;
    setPatients({ status: 'loading' });
    const timer = setTimeout(async () => {
      try {
        const res = await apiClient.get<{ data: MyPatient[]; meta?: { total: number } }>('/patients', {
          primaryDoctorId: doctorId, page, limit: PAGE_SIZE, ...(search.trim().length >= 2 ? { search: search.trim() } : {}),
        });
        if (!cancelled) setPatients({ status: 'ready', value: { rows: res?.data ?? [], total: res?.meta?.total ?? res?.data?.length ?? 0 } });
      } catch {
        if (!cancelled) setPatients({ status: 'error' });
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [doctorId, page, search]);

  const totalPages = patients.status === 'ready' ? Math.max(1, Math.ceil(patients.value.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center"><UserRound className="h-5 w-5 text-blue-500 mr-2" />My patients{patients.status === 'ready' ? ` (${patients.value.total})` : ''}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input aria-label="Search my patients" placeholder="Find a patient" value={search}
            onChange={event => { setSearch(event.target.value); setPage(1); }} />
          {patients.status === 'loading' && <p role="status" className="text-sm text-gray-500">Loading your patients…</p>}
          {patients.status === 'error' && <p role="alert" className="text-sm text-red-700">Could not load your patients. Refresh to try again.</p>}
          {patients.status === 'ready' && (patients.value.rows.length === 0
            ? <p className="text-gray-500 text-center py-4">{search.trim() ? 'No matching patients' : 'No patients assigned to you yet'}</p>
            : (
              <ul className="space-y-2" aria-label="My patients">
                {patients.value.rows.map(patient => (
                  <li key={patient.id}>
                    <Link href={`/dashboard/patients/${encodeURIComponent(patient.id)}`}
                      className="flex items-center justify-between gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 focus-visible:outline focus-visible:outline-2">
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-gray-900 truncate">{patient.name}</span>
                        <span className="block text-xs text-gray-600">{[patient.patientCode, patient.phone].filter(Boolean).join(' · ')}</span>
                      </span>
                      <span className="shrink-0 text-xs text-gray-600">{patient.lastVisitAt ? `Last visit ${displayClinicDate(patient.lastVisitAt)}` : 'No visits yet'}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ))}
          {patients.status === 'ready' && totalPages > 1 && (
            <div className="flex items-center justify-between">
              <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <span className="text-xs text-gray-600">Page {page} of {totalPages}</span>
              <Button type="button" variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center"><ClipboardList className="h-5 w-5 text-blue-500 mr-2" />Recent visits</CardTitle>
        </CardHeader>
        <CardContent>
          {visits.status === 'loading' && <p role="status" className="text-sm text-gray-500">Loading recent visits…</p>}
          {visits.status === 'error' && <p role="alert" className="text-sm text-red-700">Could not load your recent visits. Refresh to try again.</p>}
          {visits.status === 'ready' && (visits.value.length === 0
            ? <p className="text-gray-500 text-center py-4">No visits yet</p>
            : (
              <ul className="space-y-2" aria-label="Recent visits">
                {visits.value.map(visit => (
                  <li key={visit.id}>
                    <Link href={`/dashboard/visits?patientId=${encodeURIComponent(visit.patient.id)}&visitId=${encodeURIComponent(visit.id)}`}
                      className="flex items-center justify-between gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 focus-visible:outline focus-visible:outline-2">
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-gray-900 truncate">{visit.patient.name}</span>
                        <span className="block text-xs text-gray-600 truncate">{diagnosisSummary(visit)}</span>
                      </span>
                      <span className="shrink-0 text-xs text-gray-600 tabular-nums">{displayClinicDateTime(visit.createdAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ))}
        </CardContent>
      </Card>

    </div>
  );
}
