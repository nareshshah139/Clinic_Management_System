'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PharmacyInvoiceList } from '@/components/pharmacy/PharmacyInvoiceList';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';

export default function PharmacyInvoicesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Pharmacy Invoices"
        description="Find a bill, collect a balance or download a copy."
        actions={
          <Button asChild variant="outline">
            <Link href="/dashboard/pharmacy?section=counter">
              <ArrowLeft className="h-4 w-4" />
              Back to Counter
            </Link>
          </Button>
        }
      />
      <Suspense fallback={null}>
        <PharmacyInvoiceList />
      </Suspense>
    </div>
  );
}
