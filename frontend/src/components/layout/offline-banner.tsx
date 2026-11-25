'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Wifi, WifiOff } from 'lucide-react';

const BACK_ONLINE_NOTICE_MS = 4000;

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

export function OfflineBanner() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  const [backOnline, setBackOnline] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const announce = () => {
      clearTimeout(timer);
      setBackOnline(true);
      timer = setTimeout(() => setBackOnline(false), BACK_ONLINE_NOTICE_MS);
    };
    window.addEventListener('online', announce);
    return () => {
      window.removeEventListener('online', announce);
      clearTimeout(timer);
    };
  }, []);

  return (
    <div role="status" aria-live="polite">
      {!online ? (
        <p className="flex items-center gap-2 border-b border-warning-border bg-warning-soft px-4 py-2 text-sm font-medium text-warning-text">
          <WifiOff className="size-4 shrink-0" aria-hidden="true" />
          You&apos;re offline. Changes won&apos;t save until the connection is back.
        </p>
      ) : backOnline ? (
        <p className="flex items-center gap-2 border-b border-success-border bg-success-soft px-4 py-2 text-sm font-medium text-success-text">
          <Wifi className="size-4 shrink-0" aria-hidden="true" />
          You&apos;re back online.
        </p>
      ) : null}
    </div>
  );
}
