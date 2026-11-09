'use client';

import { Suspense } from 'react';
import { LoadingSkeleton } from '@/components/ui/skeleton';
import { PharmacyReportWorkspace } from '@/components/pharmacy/reports/PharmacyReportWorkspace';

export default function PharmacyReportPage() {
  return (
    <Suspense fallback={<LoadingSkeleton variant="table" label="Loading Pharmacy Report…" />}>
      <PharmacyReportWorkspace />
    </Suspense>
  );
}
