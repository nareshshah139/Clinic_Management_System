'use client';

import type { ReactNode } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';

export function SalesHeader({ action }: { action?: ReactNode }) {
  return (
    <PageHeader
      title="Sales"
      className="items-center justify-start gap-x-6 gap-y-3"
      actions={
        <>
          <TabsList aria-label="Sales registers">
            <TabsTrigger value="sales" className="min-h-10 px-4 text-sm">Sales</TabsTrigger>
            <TabsTrigger value="returns" className="min-h-10 px-4 text-sm">Returns</TabsTrigger>
          </TabsList>
          {action}
        </>
      }
    />
  );
}
