"use client";

import { Suspense } from 'react';
import PatientsManagement from '@/components/patients/PatientsManagement';

export default function PatientsPage() {
  return (
    <Suspense fallback={<div className="p-4">Loading...</div>}>
      <PatientsManagement />
    </Suspense>
  );
} 