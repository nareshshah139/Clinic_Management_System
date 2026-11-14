import { useEffect, type MutableRefObject } from 'react';
import { apiClient } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import type { Patient } from '@/lib/types';

/**
 * @cc [owner:nareshshah139,label:product] booking-prefilled-patient
 * A chart patient ID MUST resolve to that patient's details before booking. Failed lookups
 * MUST clear the selection, and an obsolete lookup MUST NOT replace a newer selection.
 */
export function usePrefilledPatient(
  prefillId: string | undefined,
  box: { select: (patient: Patient) => void; clear: () => void; turn: MutableRefObject<number> },
) {
  const { select, clear, turn } = box;
  useEffect(() => {
    if (!prefillId) return;
    const startedAt = turn.current;
    const newer = () => turn.current !== startedAt;
    let active = true;
    void apiClient.getPatient(prefillId).then((result) => {
      const patient = result as Patient;
      if (!patient || patient.id !== prefillId) throw new Error('Patient lookup did not match');
      if (active && !newer()) select(patient);
    }).catch(() => {
      if (!active || newer()) return;
      clear();
      toast({ title: 'Patient unavailable', description: 'Search for the patient before booking.', variant: 'destructive' });
    });
    return () => { active = false; };
  }, [prefillId, select, clear, turn]);
}
