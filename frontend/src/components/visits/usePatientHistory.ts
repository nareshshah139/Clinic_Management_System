'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '@/lib/api';
import { PATIENT_HISTORY_CHANGED } from '@/lib/patient-history';

export function usePatientHistory(patientId: string, includeAppointments = true) {
  const [entries, setEntries] = useState<Record<string, any>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    if (!patientId) { setEntries([]); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const records = await apiClient.getAllPatientVisitHistory(patientId, includeAppointments);
      if (current === generation.current) setEntries(records);
    } catch (e) {
      if (current === generation.current) setError(e instanceof Error ? e.message : 'Unable to load history');
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [patientId, includeAppointments]);
  useEffect(() => {
    setEntries([]);
    void refresh();
    const reload = () => { void refresh(); };
    window.addEventListener(PATIENT_HISTORY_CHANGED, reload);
    window.addEventListener('focus', reload);
    return () => {
      ++generation.current;
      window.removeEventListener(PATIENT_HISTORY_CHANGED, reload);
      window.removeEventListener('focus', reload);
    };
  }, [refresh]);
  return { entries, loading, error, refresh };
}
