'use client';

import { LoadingSkeleton } from '@/components/ui/skeleton';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import BillingManagement from '@/components/billing/BillingManagement';

function ClinicBilling() {
  const params = useSearchParams();
  return <BillingManagement initialPatientId={params.get('patientId') || undefined} initialAppointmentId={params.get('appointmentId') || undefined} />;
}

export default function ClinicBillingPage() {
  return <Suspense fallback={<LoadingSkeleton label="Loading billing…" />}><ClinicBilling /></Suspense>;
}
