import { useEffect, useState } from 'react';
import { getISTTime } from '@/lib/utils';

const MINUTE_MS = 60_000;

export function clinicHHMM(timezone: string, at: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  try {
    const local = new Date(at.toLocaleString('en-US', { timeZone: timezone }));
    return `${pad(local.getHours())}:${pad(local.getMinutes())}`;
  } catch {
    const { hours, minutes } = getISTTime(at);
    return `${pad(hours)}:${pad(minutes)}`;
  }
}

/** The clinic's wall-clock time as HH:MM, refreshed on each minute boundary. */
export function useClinicHHMM(timezone: string): string {
  const [hhmm, setHHMM] = useState(() => clinicHHMM(timezone));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      setHHMM(clinicHHMM(timezone));
      timer = setTimeout(tick, MINUTE_MS - (Date.now() % MINUTE_MS) + 50);
    };
    tick();
    return () => clearTimeout(timer);
  }, [timezone]);
  return hhmm;
}
