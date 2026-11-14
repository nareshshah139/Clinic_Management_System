'use client';

import { useEffect, useState } from 'react';
import { apiClient, type DoctorLetterhead } from '@/lib/api';

export const DOCTOR_LETTERHEAD_CHANGED = 'doctor-letterhead-changed';

const loaded = new Map<string, Promise<DoctorLetterhead | null>>();

function readLetterhead(doctorId: string): Promise<DoctorLetterhead | null> {
  let request = loaded.get(doctorId);
  if (!request) {
    request = apiClient.getDoctorLetterhead(doctorId).then((result) => result?.letterhead ?? null);
    loaded.set(doctorId, request);
    request.catch(() => { if (loaded.get(doctorId) === request) loaded.delete(doctorId); });
  }
  return request;
}

/**
 * Loads the doctor's own letterhead; a different doctor never sees the previous doctor's image.
 * The visit form and its prescription editor share one read until the letterhead changes.
 */
export function useDoctorLetterhead(doctorId: string | undefined) {
  const [state, setState] = useState<{ doctorId: string; letterhead: DoctorLetterhead | null; loading: boolean }>({ doctorId: '', letterhead: null, loading: true });
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!doctorId) { setState({ doctorId: '', letterhead: null, loading: false }); return; }
    let cancelled = false;
    setState({ doctorId, letterhead: null, loading: true });
    (async () => {
      let letterhead: DoctorLetterhead | null = null;
      try { letterhead = await readLetterhead(doctorId); } catch {}
      if (!cancelled) setState({ doctorId, letterhead, loading: false });
    })();
    return () => { cancelled = true; };
  }, [doctorId, revision]);

  useEffect(() => {
    const changed = (event: Event) => {
      if ((event as CustomEvent).detail?.doctorId !== doctorId) return;
      if (doctorId) loaded.delete(doctorId);
      setRevision(value => value + 1);
    };
    window.addEventListener(DOCTOR_LETTERHEAD_CHANGED, changed);
    return () => window.removeEventListener(DOCTOR_LETTERHEAD_CHANGED, changed);
  }, [doctorId]);

  const current = state.doctorId === (doctorId || '');
  return { letterhead: current ? state.letterhead : null, loading: !current || state.loading };
}
