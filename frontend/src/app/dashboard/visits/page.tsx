'use client';

import { useEffect, useState } from 'react';
import MedicalVisitForm from '@/components/visits/MedicalVisitForm';
import { apiClient } from '@/lib/api';
import VisitPhotos from '@/components/visits/VisitPhotos';

export default function VisitsPage() {
  const [patientId, setPatientId] = useState<string | null>(null);
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [recentVisitId, setRecentVisitId] = useState<string | null>(null);

  useEffect(() => {
    const loadIds = async () => {
      try {
        // Fetch a patient (first page)
        const patients = await apiClient.getPatients({ page: 1, limit: 1 });
        const p = (patients as any)?.data?.[0];
        if (p?.id) setPatientId(p.id);

        // Fetch a doctor user
        const users = await apiClient.get('/users', { role: 'DOCTOR', limit: 1 });
        const d = (users as any)?.users?.[0];
        if (d?.id) setDoctorId(d.id);
      } catch (e) {
        // noop; page will not render the form if IDs missing
      }
    };
    void loadIds();
  }, []);

  if (!patientId || !doctorId) {
    return <div className="text-sm text-gray-600">Loading visit form…</div>;
  }

  return (
    <div className="space-y-4">
      <MedicalVisitForm patientId={patientId} doctorId={doctorId} />
      {recentVisitId && <VisitPhotos visitId={recentVisitId} />}
    </div>
  );
} 