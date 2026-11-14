'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { isEmptyHistoryEntry } from '@/lib/history-visibility';
import { apiClient } from '@/lib/api';
import { PATIENT_HISTORY_CHANGED } from '@/lib/patient-history';

type HistoryEntry = Record<string, any>;
const inFlight = new Map<string, { promise: Promise<HistoryEntry[]>; startedAt: number }>();

/**
 * @cc [owner:nareshshah139,label:performance] shared-patient-history
 * Readers of one patient's history (appointments included) MUST share a request that is still in
 * flight. A history change, a window focus or an explicit refresh MUST NOT reuse a request that
 * started before it.
 */
export function loadPatientHistory(patientId: string, notBefore?: number): Promise<HistoryEntry[]> {
  const shared = inFlight.get(patientId);
  if (shared && (notBefore === undefined || shared.startedAt >= notBefore)) return shared.promise;
  const promise = apiClient.getAllPatientVisitHistory<HistoryEntry>(patientId, true);
  const load = { promise, startedAt: performance.now() };
  inFlight.set(patientId, load);
  const settle = () => { if (inFlight.get(patientId) === load) inFlight.delete(patientId); };
  promise.then(settle, settle);
  return promise;
}

export const visitEntries = (entries: HistoryEntry[]) => entries.filter((entry) => entry.entryType !== 'appointment');

export function usePatientHistory(patientId: string, includeAppointments = true) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const load = useCallback(async (notBefore?: number) => {
    const current = ++generation.current;
    if (!patientId) { setEntries([]); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const records = await loadPatientHistory(patientId, notBefore);
      if (current === generation.current) setEntries(includeAppointments ? records : visitEntries(records));
    } catch (e) {
      if (current === generation.current) setError(e instanceof Error ? e.message : 'Unable to load history');
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [patientId, includeAppointments]);
  const refresh = useCallback(() => load(performance.now()), [load]);
  useEffect(() => {
    setEntries([]);
    void load();
    const reload = (event: Event) => { void load(event.timeStamp); };
    window.addEventListener(PATIENT_HISTORY_CHANGED, reload);
    window.addEventListener('focus', reload);
    return () => {
      ++generation.current;
      window.removeEventListener(PATIENT_HISTORY_CHANGED, reload);
      window.removeEventListener('focus', reload);
    };
  }, [load]);
  return { entries: entries.filter(entry => !isEmptyHistoryEntry(entry)), loading, error, refresh };
}
