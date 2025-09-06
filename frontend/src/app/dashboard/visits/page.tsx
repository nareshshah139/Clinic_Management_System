'use client';

import MedicalVisitForm from '@/components/visits/MedicalVisitForm';

export default function VisitsPage() {
  // TODO: wire actual patientId/doctorId via route or selection
  return <MedicalVisitForm patientId="demo-patient" doctorId="demo-doctor" />;
} 