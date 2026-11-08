'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';

const REFRESH_MS = 60_000;

export function usePendingItemRequestCount(enabled: boolean): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) { setCount(0); return; }
    let cancelled = false;
    const load = async () => {
      try {
        const result = await apiClient.getInventoryItemRequestPendingCount();
        if (!cancelled) setCount(result.count);
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
  }, [enabled]);
  return count;
}
