'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';

export type PurchasePermissions = { read: boolean; create: boolean; review: boolean; commit: boolean; automate: boolean };
const denied: PurchasePermissions = { read: false, create: false, review: false, commit: false, automate: false };

export function usePurchasePermissions(userId?: string) {
  const [state, setState] = useState({ permissions: denied, loading: true, error: '' });
  useEffect(() => {
    let active = true;
    setState({ permissions: denied, loading: true, error: '' });
    if (!userId) { setState({ permissions: denied, loading: false, error: '' }); return; }
    apiClient.get<PurchasePermissions>('/pharmacy/purchase-invoices/capabilities').then(
      permissions => { if (active) setState({ permissions, loading: false, error: '' }); },
      () => { if (active) setState({ permissions: denied, loading: false, error: 'Unable to load invoice permissions. Reload this page to retry.' }); },
    );
    return () => { active = false; };
  }, [userId]);
  return state;
}
