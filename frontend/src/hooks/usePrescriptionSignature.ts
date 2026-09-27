'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';

export const DOCTOR_SIGNATURE_CHANGED = 'doctor-signature-changed';
export const signaturePreferenceKey = (doctorId: string) => `cms:prescription:showSignature:${doctorId}`;

/**
 * @cc [owner:nareshshah139,label:product] signature-preference-scope
 * The Show signature choice MUST survive reloads per doctor in this browser.
 * Changing doctor MUST NOT display the previous doctor's image or preference.
 */
export function usePrescriptionSignature(doctorId: string, previewOpen: boolean) {
  const [selection, setSelection] = useState({ doctorId: '', show: false });
  const [asset, setAsset] = useState({ doctorId: '', url: null as string | null, ratio: 160 / 72, loading: true, error: '' });
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision(value => value + 1), []);

  useEffect(() => {
    let show = false;
    try { show = localStorage.getItem(signaturePreferenceKey(doctorId)) === 'true'; } catch {}
    setSelection({ doctorId, show });
  }, [doctorId]);

  useEffect(() => {
    let cancelled = false;
    setAsset({ doctorId, url: null, ratio: 160 / 72, loading: true, error: '' });
    (async () => {
      try {
        const result = await apiClient.getDoctorSignature(doctorId);
        const ratio = result.signature?.width && result.signature?.height ? result.signature.width / result.signature.height : 160 / 72;
        if (!cancelled) setAsset({ doctorId, url: result.signature?.url || null, ratio, loading: false, error: '' });
      } catch {
        if (!cancelled) setAsset({ doctorId, url: null, ratio: 160 / 72, loading: false, error: 'Could not load the doctor’s signature. Retry before printing with a signature.' });
      }
    })();
    return () => { cancelled = true; };
  }, [doctorId, previewOpen, revision]);

  useEffect(() => {
    const changed = (event: Event) => { if ((event as CustomEvent).detail?.doctorId === doctorId) reload(); };
    window.addEventListener(DOCTOR_SIGNATURE_CHANGED, changed);
    return () => window.removeEventListener(DOCTOR_SIGNATURE_CHANGED, changed);
  }, [doctorId, reload]);

  const setShowSignature = (show: boolean) => {
    setSelection({ doctorId, show });
    try { localStorage.setItem(signaturePreferenceKey(doctorId), String(show)); } catch {}
  };

  return {
    showSignature: selection.doctorId === doctorId && selection.show,
    setShowSignature,
    signatureUrl: asset.doctorId === doctorId ? asset.url : null,
    signatureWidth: Math.min(160, 72 * asset.ratio),
    signatureHeight: Math.min(72, 160 / asset.ratio),
    signatureLoading: asset.doctorId !== doctorId || asset.loading,
    signatureError: asset.doctorId === doctorId ? asset.error : '',
    reloadSignature: reload,
  };
}
