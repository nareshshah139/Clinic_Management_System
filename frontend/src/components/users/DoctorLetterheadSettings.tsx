'use client';

import { useState } from 'react';
import { apiClient } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getErrorMessage } from '@/lib/utils';
import { DOCTOR_LETTERHEAD_CHANGED, useDoctorLetterhead } from '@/hooks/useDoctorLetterhead';

export function DoctorLetterheadSettings({ doctorId }: { doctorId: string }) {
  const { letterhead, loading } = useDoctorLetterhead(doctorId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const changeLetterhead = async (file: File | null) => {
    setError('');
    setStatus('');
    if (file && (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 5 * 1024 * 1024)) {
      setError('Choose a PNG or JPG image up to 5 MB.');
      return;
    }
    setSaving(true);
    try {
      if (file) await apiClient.uploadOwnLetterhead(file);
      else await apiClient.removeOwnLetterhead();
      setStatus(file ? 'Letterhead saved.' : 'Letterhead removed.');
      window.dispatchEvent(new CustomEvent(DOCTOR_LETTERHEAD_CHANGED, { detail: { doctorId } }));
    } catch (e) {
      setError(getErrorMessage(e) || 'Could not save your letterhead. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby="doctor-letterhead-heading" className="border rounded-md p-3 space-y-3">
      <h3 id="doctor-letterhead-heading" className="font-medium">Prescription letterhead</h3>
      <p id="doctor-letterhead-help" className="text-sm text-gray-600">
        Your prescriptions print on this full-page image. Use an A4 portrait PNG or JPG, up to 5 MB.
      </p>
      {loading ? <p role="status" className="text-sm text-gray-600">Loading letterhead…</p> : letterhead ? (
        <div className="rounded-md border bg-white p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={letterhead.url} alt="Your prescription letterhead" className="h-40 max-w-full object-contain" />
          {letterhead.source === 'bundled' && <p className="mt-2 text-xs text-gray-600">Clinic-supplied letterhead.</p>}
        </div>
      ) : <p className="text-sm text-gray-600">No letterhead uploaded. Prescriptions print on plain paper.</p>}
      <div className="space-y-2">
        <label htmlFor="doctor-letterhead-file" className="text-sm font-medium">{letterhead ? 'Replace letterhead' : 'Upload letterhead'}</label>
        <Input id="doctor-letterhead-file" type="file" accept="image/png,image/jpeg" aria-describedby="doctor-letterhead-help" disabled={loading || saving}
          onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void changeLetterhead(file); }} />
      </div>
      {letterhead && <Button type="button" variant="outline" size="sm" disabled={loading || saving} onClick={() => void changeLetterhead(null)}>Remove letterhead</Button>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <p role="status" className="text-sm text-gray-600">{saving ? 'Saving letterhead…' : status || 'Only you can change your letterhead. Changes save immediately.'}</p>
    </section>
  );
}
