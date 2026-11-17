'use client';

import { useEffect, useState } from 'react';
import { useDashboardUser } from '@/components/layout/dashboard-user-context';
import { fetchVoiceFillStatus } from '@/lib/voice-fill';

/** True once voice fill is available and a dashboard user is signed in. */
export function useVoiceBarShown(): boolean {
  const { user } = useDashboardUser();
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchVoiceFillStatus().then((ok) => {
      if (!cancelled) setAvailable(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return available && !!user;
}
