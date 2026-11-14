'use client';

import { Suspense, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LoadingSkeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { requestKey } from '@/components/inventory/workspace-model';
import { SalesHeader } from '@/components/pharmacy/sales/SalesHeader';
import { SalesRegister } from '@/components/pharmacy/sales/SalesRegister';
import { REGISTERS, REGISTER_COPY, newReturnHref, salesTabHref, type Register } from '@/components/pharmacy/sales/sales-register-model';

const NO_PARAMS = new URLSearchParams();

function SalesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab: Register = searchParams.get('tab') === 'returns' ? 'returns' : 'sales';
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const params = useRef<Record<Register, string>>({ sales: '', returns: '' });
  const newLabel = REGISTER_COPY[tab].newLabel;

  const recordParams = (register: Register) => (next: URLSearchParams) => {
    params.current[register] = next.toString();
    if (register !== tabRef.current) return;
    const href = salesTabHref(register, next);
    if (href !== `${window.location.pathname}${window.location.search}`) router.replace(href, { scroll: false });
  };

  return (
    <Tabs value={tab} onValueChange={(value: string) => router.push(salesTabHref(value as Register, params.current[value as Register]), { scroll: false })}>
      <div className="flex min-w-0 flex-col gap-3">
        <SalesHeader
          action={
            newLabel && (
              <Button
                className="h-10 text-sm"
                onClick={() => router.push(newReturnHref(salesTabHref(tab, params.current[tab]), requestKey()))}
              >
                <Plus aria-hidden="true" /> {newLabel}
              </Button>
            )
          }
        />
        {REGISTERS.map((register) => (
          <TabsContent key={register} value={register} forceMount hidden={register !== tab} className="min-w-0">
            <SalesRegister
              register={register}
              active={register === tab}
              searchParams={register === tab ? searchParams : NO_PARAMS}
              onParamsChange={recordParams(register)}
            />
          </TabsContent>
        ))}
      </div>
    </Tabs>
  );
}

export default function SalesPage() {
  return (
    <Suspense fallback={<LoadingSkeleton label="Loading sales…" />}>
      <SalesPageContent />
    </Suspense>
  );
}
