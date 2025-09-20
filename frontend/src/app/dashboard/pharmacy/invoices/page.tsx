'use client';

import { PharmacyInvoiceList } from '@/components/pharmacy/PharmacyInvoiceList';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

export default function PharmacyInvoicesPage() {
  const router = useRouter();
  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => router.push('/dashboard/pharmacy')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h2 className="text-3xl font-bold tracking-tight">Pharmacy Invoices</h2>
        </div>
      </div>
      <PharmacyInvoiceList />
    </div>
  );
} 