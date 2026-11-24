'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { displayClinicDate } from '@/lib/date-display';
import type { ActiveTrack, FollowUpPlan } from '@/lib/follow-ups';

/** Roles POST /follow-ups/tracks/:id/stop admits. */
const TRACK_STOPPERS = ['DOCTOR', 'ADMIN', 'OWNER'];

const planName = (t: ActiveTrack) => t.planVersion.content?.name?.EN ?? t.planVersion.plan.key;

/**
 * @cc [owner:nareshshah139,label:product] follow-up-plan-picker
 * The visit form's Follow-up tab MUST offer "No follow-up" and every current plan, and list the
 * patient's active tracks with a stop action; no track stops unless the doctor stops it (PP-26).
 */
export function FollowUpPlanPicker({ patientId, value, onChange, disabled, userRole }: {
  patientId: string;
  value: string;
  onChange: (planVersionId: string) => void;
  disabled?: boolean;
  userRole?: string;
}) {
  const [plans, setPlans] = useState<FollowUpPlan[]>([]);
  const [tracks, setTracks] = useState<ActiveTrack[]>([]);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadTracks = useCallback(async () => {
    if (!patientId) return;
    try { setTracks(await apiClient.getActiveFollowUpTracks(patientId)); } catch { setTracks([]); }
  }, [patientId]);

  useEffect(() => {
    apiClient.getFollowUpPlans().then(setPlans).catch(() => setPlans([]));
    void loadTracks();
  }, [loadTracks]);

  const known = !value || plans.some((p) => p.planVersionId === value);
  const stop = async (trackId: string) => {
    setBusy(true);
    setError(null);
    try {
      await apiClient.stopFollowUpTrack(trackId);
      setConfirming(null);
      await loadTracks();
    } catch (e: any) {
      setError(e?.body?.message || e?.message || 'Could not stop the plan.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <label htmlFor="follow-up-plan" className="text-sm text-foreground">Follow-up plan</label>
      <NativeSelect id="follow-up-plan" className="w-full" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value="">No follow-up</option>
        {plans.map((p) => (
          <option key={p.planVersionId} value={p.planVersionId}>{p.name?.EN ?? p.key}</option>
        ))}
        {!known && <option value={value}>Earlier version of a plan</option>}
      </NativeSelect>
      <p className="text-xs text-muted-foreground">When you complete the visit, the patient gets WhatsApp check-ins on this plan.</p>
      {tracks.length > 0 && (
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Active plans for this patient</p>
          <ul aria-label="Active follow-up plans" className="space-y-1">
            {tracks.map((t) => {
              const next = t.checkIns.find((c) => c.state === 'SCHEDULED' || c.state === 'OPEN');
              return (
                <li key={t.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2 text-sm">
                  <span className="min-w-0 break-words text-foreground">{planName(t)}</span>
                  <span className="text-muted-foreground">from {displayClinicDate(t.anchorDate)}{next ? `, next check-in ${displayClinicDate(next.opensAt)}` : ''}</span>
                  {TRACK_STOPPERS.includes(userRole ?? '') && (confirming === t.id ? (
                    <span className="ml-auto flex gap-1">
                      <Button type="button" size="sm" variant="destructive" disabled={busy} onClick={() => stop(t.id)}>Stop {planName(t)}</Button>
                      <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setConfirming(null)}>Keep</Button>
                    </span>
                  ) : (
                    <Button type="button" size="sm" variant="outline" className="ml-auto" onClick={() => setConfirming(t.id)}>Stop</Button>
                  ))}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
