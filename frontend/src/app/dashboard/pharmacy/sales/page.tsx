'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { LoadingSkeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SalesRegister } from '@/components/pharmacy/sales/SalesRegister';
import type { Register } from '@/components/pharmacy/sales/sales-register-model';

const PATH = '/dashboard/pharmacy/sales';
const NO_PARAMS = new URLSearchParams();

function SalesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlTab: Register = searchParams.get('tab') === 'returns' ? 'returns' : 'sales';
  const [tab, setTab] = useState<Register>(urlTab);

  useEffect(() => setTab(urlTab), [urlTab]);

  const replaceParams = useCallback(
    (params: URLSearchParams) => {
      const next = new URLSearchParams(params);
      if (tab === 'returns') next.set('tab', 'returns');
      const query = next.toString();
      if (query === new URLSearchParams(window.location.search).toString()) return;
      router.replace(query ? `${PATH}?${query}` : PATH, { scroll: false });
    },
    [router, tab],
  );

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PageHeader title="Sales" />
      <Tabs value={tab} onValueChange={(value: string) => setTab(value as Register)}>
        <TabsList aria-label="Sales registers" className="w-fit">
          <TabsTrigger value="sales" className="min-h-10 px-5">Sales</TabsTrigger>
          <TabsTrigger value="returns" className="min-h-10 px-5">Returns</TabsTrigger>
        </TabsList>
        {(['sales', 'returns'] as const).map((register) => (
          <TabsContent key={register} value={register} className="pt-2">
            <SalesRegister
              register={register}
              searchParams={register === urlTab ? searchParams : NO_PARAMS}
              onParamsChange={replaceParams}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

export default function SalesPage() {
  return (
    <Suspense fallback={<LoadingSkeleton label="Loading sales…" />}>
      <SalesPageContent />
    </Suspense>
  );
}
