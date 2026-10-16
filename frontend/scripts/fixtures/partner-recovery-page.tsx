'use client';
import { useEffect, useState } from 'react';
import { PartnerDailySync } from '@/components/pharmacy/PartnerDailySync';
import { apiClient } from '@/lib/api';
/**
 * @cc [owner:nareshshah139,label:testing] partner-synthetic-recovery-fixture
 * This fixture MUST refuse non-loopback hosts and answer every supported API call in memory;
 * unexpected calls MUST fail without reaching a backend. Matching preserves stock and sold
 * snapshots; the separate retry applies only the synthetic outstanding quantity.
 */
export default function PartnerRecoveryQa() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (
      !['127.0.0.1', 'localhost', '[::1]'].includes(window.location.hostname)
    ) {
      throw new Error('Synthetic recovery fixture is local-only');
    }
    let sale: any = {
      id: 'sale-synthetic',
      version: 0,
      canReconcile: true,
      partnerOrganizationId: 'partner-synthetic',
      partnerOrganizationName: 'Synthetic Partner',
      date: '2026-10-15',
      source: 'MANUAL',
      status: 'PARTIAL_STOCK_COMMITTED',
      lateEntry: false,
      hasDiscrepancy: true,
      stockCommittedAt: '2026-10-14T12:00:00Z',
      totalQuantity: 7,
      netAmount: 70,
      items: [
        {
          id: 'line-synthetic',
          medicineName: 'Cream typo',
          batchNumber: 'B-1',
          quantitySold: 7,
          committedQuantity: 5,
          discrepancyReason:
            'Choose the correct product and batch for the remaining quantity.',
        },
      ],
    };
    const state = { stock: 5, commands: [] as any[], sale };
    (window as any).__partnerRecoveryQa = state;
    const get = apiClient.get;
    const post = apiClient.post;
    apiClient.get = (async (url: string) => {
      if (url.endsWith('today-summary'))
        return {
          partnerCount: 1,
          submittedCount: 1,
          missingCount: 0,
          totalQuantity: 7,
          grossAmount: 70,
          netAmount: 70,
          discrepancyCount: 1,
          stockCommittedCount: 0,
        };
      if (url.endsWith('/missing')) return { missingPartners: [] };
      if (url.endsWith('/recovery-matches'))
        return {
          matches: [
            {
              id: 'batch-synthetic',
              name: 'Synthetic Cream',
              batchNumber: 'B-2',
              availableQuantity: state.stock,
              unit: 'PIECES',
              expiryDate: '2099-12-31',
            },
          ],
        };
      if (url === '/pharmacy/partner-sales')
        return { data: [structuredClone(sale)] };
      throw new Error(`Unexpected synthetic GET: ${url}`);
    }) as any;
    apiClient.post = (async (url: string, input: any) => {
      if (!url.endsWith('/reconcile') && !url.endsWith('/commit-stock'))
        throw new Error(`Unexpected synthetic POST: ${url}`);
      state.commands.push({ url, input });
      if (input.expectedVersion !== sale.version)
        throw new Error('Stale revision');
      if (url.endsWith('/reconcile'))
        sale = {
          ...sale,
          version: sale.version + 1,
          items: [
            {
              ...sale.items[0],
              recoveryInventoryItemId: input.inventoryItemId,
            },
          ],
        };
      else if (url.endsWith('/commit-stock')) {
        state.stock -= 2;
        sale = {
          ...sale,
          version: sale.version + 1,
          status: 'STOCK_COMMITTED',
          hasDiscrepancy: false,
          items: [
            { ...sale.items[0], committedQuantity: 7, discrepancyReason: null },
          ],
        };
      }
      state.sale = sale;
      return structuredClone(sale);
    }) as any;
    setReady(true);
    return () => {
      apiClient.get = get;
      apiClient.post = post;
    };
  }, []);
  return ready ? (
    <main className="mx-auto max-w-6xl p-4">
      <PartnerDailySync />
    </main>
  ) : (
    <p>Loading synthetic fixture</p>
  );
}
