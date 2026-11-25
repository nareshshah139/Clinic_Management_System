'use client';

import { Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { LoadingSkeleton } from '@/components/ui/skeleton';
import { ClinicBillRegister } from '@/components/billing/ClinicBillRegister';

function BillingPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const replaceParams = (next: URLSearchParams) => {
    const query = next.toString();
    const href = query ? `${pathname}?${query}` : pathname;
    if (href !== `${window.location.pathname}${window.location.search}`) router.replace(href, { scroll: false });
  };
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PageHeader
        title="Clinic billing"
        description="Consultation and procedure bills, with what is collected and still due. Bills are created from an appointment on the calendar; pharmacy bills are under Pharmacy → Sales."
      />
      <ClinicBillRegister searchParams={searchParams} onParamsChange={replaceParams} />
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<LoadingSkeleton label="Loading clinic bills…" />}>
      <BillingPageContent />
    </Suspense>
  );
}
