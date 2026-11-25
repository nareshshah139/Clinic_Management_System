'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';

const REFRESH_MS = 60_000;

const readItemRequests = async () => (await apiClient.getInventoryItemRequestPendingCount()).count;
const readEdits = async () => (await apiClient.getDrugInventoryChangeRequests({ status: 'PENDING', page: 1, limit: 1 })).pagination?.total ?? 0;

function usePendingCount(enabled: boolean, read: () => Promise<number>): number | null {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) { setCount(0); return; }
    let cancelled = false;
    const load = async () => {
      try {
        const result = await read();
        if (!cancelled) setCount(result);
      } catch {
        if (!cancelled) setCount(0);
      }
    };
    void load();
    const timer = window.setInterval(load, REFRESH_MS);
    window.addEventListener('inventory-workspace-refresh', load);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('inventory-workspace-refresh', load);
    };
  }, [enabled, read]);
  return count;
}

export function usePendingItemRequestCount(enabled: boolean): number {
  return usePendingCount(enabled, readItemRequests) ?? 0;
}

/** Pending approvals by queue; a count is null until its first answer arrives. */
export type PendingApprovals = { items: number | null; edits: number | null };

export function usePendingApprovals({ items, edits }: { items: boolean; edits: boolean }): PendingApprovals {
  return { items: usePendingCount(items, readItemRequests), edits: usePendingCount(edits, readEdits) };
}
