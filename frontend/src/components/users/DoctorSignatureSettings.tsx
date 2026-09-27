'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getErrorMessage } from '@/lib/utils';
import { DOCTOR_SIGNATURE_CHANGED } from '@/hooks/usePrescriptionSignature';

export function DoctorSignatureSettings({ doctorId }: { doctorId: string }) {
  const [signature, setSignature] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    apiClient.getDoctorSignature(doctorId).then(result => {
      if (!cancelled) setSignature(result.signature?.url || null);
    }).catch(() => {
      if (!cancelled) setError('Could not load your signature. Please retry.');
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [doctorId, reload]);

  const changeSignature = async (file: File | null) => {
    setError('');
    setStatus('');
    if (file && (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 2 * 1024 * 1024)) {
      setError('Choose a PNG or JPG image up to 2 MB.');
      return;
    }
    setSaving(true);
    try {
      if (file) {
        const result = await apiClient.uploadOwnSignature(file);
        setSignature(result.signature.url);
      } else {
        await apiClient.removeOwnSignature();
        setSignature(null);
      }
      setStatus(file ? 'Signature saved.' : 'Signature removed.');
      window.dispatchEvent(new CustomEvent(DOCTOR_SIGNATURE_CHANGED, { detail: { doctorId } }));
    } catch (e) {
      setError(getErrorMessage(e) || 'Could not save your signature. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby="doctor-signature-heading" className="border rounded p-3 space-y-3">
      <h3 id="doctor-signature-heading" className="font-medium">Doctor signature</h3>
      <p id="doctor-signature-help" className="text-sm text-gray-600">
        Upload your signature, then select “Show signature” in Print Preview. PNG or JPG, up to 2 MB. Transparent backgrounds are supported.
      </p>
      {loading ? <p role="status" className="text-sm text-gray-600">Loading signature…</p> : signature ? (
        <div className="rounded border bg-white p-3">
          {/* A native image preserves the uploaded PNG transparency in the print pipeline. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={signature} alt="Your saved signature" className="h-20 max-w-full object-contain" />
        </div>
      ) : <p className="text-sm text-gray-600">No signature uploaded. Space is left for signing by hand.</p>}
      <div className="space-y-2">
        <label htmlFor="doctor-signature-file" className="text-sm font-medium">{signature ? 'Replace signature' : 'Upload signature'}</label>
        <Input id="doctor-signature-file" type="file" accept="image/png,image/jpeg" aria-describedby="doctor-signature-help" disabled={loading || saving}
          onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void changeSignature(file); }} />
      </div>
      {signature && <Button type="button" variant="outline" size="sm" disabled={loading || saving} onClick={() => void changeSignature(null)}>Remove signature</Button>}
      {error && <div role="alert" className="space-y-2 text-sm text-red-700"><p>{error}</p><Button type="button" variant="outline" size="sm" disabled={saving || loading} onClick={() => setReload(value => value + 1)}>Reload signature</Button></div>}
      <p role="status" className="text-sm text-gray-600">{saving ? 'Saving signature…' : status || 'Only you can change your signature. Changes save immediately.'}</p>
    </section>
  );
}
