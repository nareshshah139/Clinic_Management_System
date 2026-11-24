'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { displayClinicDate, displayClinicDateTime } from '@/lib/date-display';
import { STOP_REASON_LABEL, type PatientTimeline, type ResponseView, type ThreadMessage } from '@/lib/follow-ups';
import { MessageThreadView, ResponseCard } from './thread';

const CONSENT_LABEL: Record<string, string> = {
  NOT_ASKED: 'Not asked', PENDING: 'Waiting for the number to confirm', OPTED_IN: 'Agreed and confirmed', OPTED_OUT: 'Opted out',
};
const LANGUAGE_LABEL: Record<string, string> = { EN: 'English', TE: 'Telugu', HI: 'Hindi' };
const CHECK_IN_LABEL: Record<string, string> = {
  SCHEDULED: 'Scheduled', OPEN: 'Open', ANSWERED: 'Answered', MISSED: 'Missed', CANCELLED: 'Cancelled',
};

type Event =
  | { at: string; key: string; kind: 'track'; text: string }
  | { at: string; key: string; kind: 'check-in'; text: string; state: string; response: ResponseView | null }
  | { at: string; key: string; kind: 'message'; message: ThreadMessage };

function events(t: PatientTimeline): Event[] {
  const list: Event[] = [];
  for (const track of t.tracks) {
    list.push({ at: `${track.anchorDate}T00:00:00+05:30`, key: `${track.id}-start`, kind: 'track', text: `${track.plan} started` });
    if (track.stoppedAt) list.push({ at: track.stoppedAt, key: `${track.id}-stop`, kind: 'track', text: `${track.plan} ${STOP_REASON_LABEL[track.stopReason ?? ''] ?? 'stopped'}` });
    if (track.completedAt) list.push({ at: track.completedAt, key: `${track.id}-done`, kind: 'track', text: `${track.plan} completed` });
    for (const c of track.checkIns) {
      list.push({ at: c.response?.submittedAt ?? c.opensAt, key: c.id, kind: 'check-in', text: `${track.plan} · ${c.stepKey}`, state: c.state, response: c.response });
    }
  }
  for (const m of t.messages) list.push({ at: m.createdAt, key: m.id, kind: 'message', message: m });
  return list.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

/** PP-53: tracks, check-ins, answers, confirmed messages, consent and language on the patient page. */
export function PatientFollowUpTimeline({ patientId }: { patientId: string }) {
  const [data, setData] = useState<PatientTimeline | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    apiClient.getFollowUpTimeline(patientId).then(setData).catch((e) => setError(e?.message || 'Could not load follow-ups.'));
  }, [patientId]);
  const list = useMemo(() => (data ? events(data) : []), [data]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Follow-up timeline</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {error && <p role="alert" className="text-destructive">{error}</p>}
        {!data && !error && <p role="status" className="text-muted-foreground">Loading…</p>}
        {data && (
          <>
            <div className="flex flex-wrap gap-x-6 gap-y-1">
              <span><span className="text-muted-foreground">WhatsApp consent:</span> <span className="text-foreground" data-testid="timeline-consent">{CONSENT_LABEL[data.profile?.consentState ?? 'NOT_ASKED']}</span></span>
              <span><span className="text-muted-foreground">Language:</span> <span className="text-foreground">{LANGUAGE_LABEL[data.profile?.preferredLanguage ?? 'EN']}</span></span>
              <span><span className="text-muted-foreground">Active plans:</span> <span className="text-foreground">{data.tracks.filter((t) => t.state === 'ACTIVE').map((t) => t.plan).join(', ') || 'None'}</span></span>
            </div>
            {list.length === 0 ? <p className="text-muted-foreground">No follow-ups or messages yet.</p> : (
              <ol aria-label="Follow-up timeline" className="space-y-3">
                {list.map((e) => (
                  <li key={e.key} className="min-w-0 border-l-2 border-border pl-3">
                    <p className="text-xs text-muted-foreground">{e.kind === 'track' ? displayClinicDate(e.at) : displayClinicDateTime(e.at)}</p>
                    {e.kind === 'track' && <p className="font-medium text-foreground">{e.text}</p>}
                    {e.kind === 'check-in' && (
                      <div className="space-y-1">
                        <p className="flex flex-wrap items-center gap-2 text-foreground">Check-in {e.text} <Badge variant={e.state === 'MISSED' ? 'warning' : 'neutral'}>{CHECK_IN_LABEL[e.state] ?? e.state}</Badge></p>
                        {e.response && <ResponseCard response={e.response} />}
                      </div>
                    )}
                    {e.kind === 'message' && <MessageThreadView messages={[e.message]} />}
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
