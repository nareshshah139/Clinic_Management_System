'use client';

import { useCallback, useSyncExternalStore } from 'react';

export function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (change: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', change);
      return () => list.removeEventListener('change', change);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}

export const PHONE_QUERY = '(max-width: 639px)';
