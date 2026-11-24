'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient, type ApiError } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { displayClinicDateTime } from '@/lib/date-display';
import {
  DELIVERY_LABEL, KIND_LABEL, PRIORITY_LABEL, RESOLUTION_OPTIONS, formatAge, patientLabel,
  type ThreadMessage, type WorklistItemDetail,
} from '@/lib/follow-ups';
import { MessageThreadView, ResponseCard } from './thread';

const errorText = (e: unknown) => (e as ApiError)?.body?.message || (e as Error)?.message || 'Something went wrong. Try again.';

type PatientOption = { id: string; name: string; phone?: string; patientCode?: string | null };

function AssignMessage({ message, onDone }: { message: ThreadMessage; onDone: () => void }) {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<PatientOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const search = async () => {
    setError(null);
    try {
      const res: any = await apiClient.getPatients({ search: query.trim(), limit: 5 });
      setOptions((res?.data ?? res?.patients ?? []) as PatientOption[]);
    } catch (e) {
      setError(errorText(e));
    }
  };
  const assign = async (patientId: string) => {
    setBusy(true);
    setError(null);
    try {
      await apiClient.assignPatientMessage(message.id, patientId);
      onDone();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-2 space-y-2 border-t border-border pt-2">
      {message.assignment === 'SUGGESTED' && message.patient && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Suggested patient:</span>
          <span className="font-medium text-foreground">{message.patient.name}</span>
          <Button size="sm" variant="outline" disabled={busy} onClick={async () => {
            setBusy(true);
            setError(null);
            try { await apiClient.confirmPatientMessage(message.id); onDone(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
          }}>Confirm patient</Button>
        </div>
      )}
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void search(); }}>
        <div className="min-w-0 flex-1">
          <Label htmlFor={`assign-${message.id}`} className="text-xs">{message.assignment === 'SUGGESTED' ? 'Or assign to another patient' : 'Assign to a patient'}</Label>
          <Input id={`assign-${message.id}`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, phone or patient code" />
        </div>
        <Button type="submit" size="sm" variant="outline" disabled={!query.trim()}>Find</Button>
      </form>
      {options.length > 0 && (
        <ul aria-label="Matching patients" className="space-y-1">
          {options.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="min-w-0 break-words text-foreground">{p.name}{p.phone ? ` · ${p.phone}` : ''}</span>
              <Button size="sm" disabled={busy} onClick={() => assign(p.id)}>Assign to {p.name}</Button>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

export function WorklistItemDetailView({ itemId, currentUserId, onChanged, onClose }: {
  itemId: string;
  currentUserId?: string;
  onChanged: () => void;
  onClose?: () => void;
}) {
  const [item, setItem] = useState<WorklistItemDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState('');
  const [callNote, setCallNote] = useState('');
  const [code, setCode] = useState('');
  const [note, setNote] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const replyKey = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItem(await apiClient.getWorklistItem(itemId));
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, [itemId]);

  useEffect(() => {
    setItem(null);
    setNotice(null);
    void load().then(() => {
      void apiClient.worklistAction(itemId, 'read').then(onChanged).catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  const act = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const next = await fn();
      if (next && typeof next === 'object' && 'thread' in (next as object)) setItem(next as WorklistItemDetail);
      else await load();
      if (done) setNotice(done);
      onChanged();
      return true;
    } catch (e) {
      setError(errorText(e));
      await load();
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (!item) {
    return error ? <p role="alert" className="text-sm text-destructive">{error}</p> : <p role="status" className="text-sm text-muted-foreground">Loading…</p>;
  }

  const mine = item.state === 'CLAIMED' && item.claimedBy?.id === currentUserId;
  const takenByOther = item.state === 'CLAIMED' && !mine;
  const open = item.state !== 'RESOLVED';

  return (
    <section aria-label="Item details" className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <h2 className="break-words text-lg font-semibold text-foreground">{KIND_LABEL[item.kind]}</h2>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {item.patient ? (
              <Link className="font-medium text-primary underline-offset-2 hover:underline" href={`/dashboard/patients/${item.patient.id}`}>{item.patient.name}</Link>
            ) : (
              <span className="font-medium text-foreground">{patientLabel(null, item.phoneE164)}</span>
            )}
            <Badge variant={item.priority === 'URGENT' ? 'danger' : item.priority === 'HIGH' ? 'warning' : 'neutral'}>{PRIORITY_LABEL[item.priority]}</Badge>
            <span className="text-muted-foreground">Waiting {formatAge(item.ageMinutes)}</span>
          </div>
          <p className="text-sm text-muted-foreground" data-testid="item-state">
            {item.state === 'RESOLVED'
              ? `Resolved${item.resolvedBy ? ` by ${item.resolvedBy.name}` : ''}${item.resolvedAt ? ` on ${displayClinicDateTime(item.resolvedAt)}` : ''}`
              : item.claimedBy ? `${mine ? 'You are' : `${item.claimedBy.name} is`} working on this` : 'Nobody is working on this yet'}
          </p>
        </div>
        {onClose && <Button variant="ghost" size="sm" onClick={onClose}>Back to list</Button>}
      </div>

      {open && (
        <div className="flex flex-wrap gap-2">
          {item.state === 'OPEN' && <Button size="sm" disabled={busy} onClick={() => act(() => apiClient.worklistAction(item.id, 'claim'), 'You are working on this item.')}>Claim</Button>}
          {mine && <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => apiClient.worklistAction(item.id, 'release'), 'Item released.')}>Release</Button>}
        </div>
      )}

      {notice && <p role="status" className="text-sm text-success-text">{notice}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      {item.checkIn && (
        <div className="space-y-1 rounded-md border border-border p-3 text-sm">
          <p className="font-medium text-foreground">{item.checkIn.plan} · {item.checkIn.stepKey}</p>
          <p className="text-muted-foreground">Open {displayClinicDateTime(item.checkIn.opensAt)} to {displayClinicDateTime(item.checkIn.closesAt)}</p>
          <p className="text-muted-foreground">
            Message: {item.checkIn.delivery ? DELIVERY_LABEL[item.checkIn.delivery.state] : 'No message was sent'}
          </p>
        </div>
      )}

      {item.response && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Answers</h3>
          <ResponseCard response={item.response} />
        </div>
      )}
      {item.earlierResponses.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Earlier answers to the same questions</h3>
          {item.earlierResponses.map((r) => <ResponseCard key={r.id} response={r} />)}
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Messages</h3>
        <MessageThreadView
          messages={item.thread}
          renderActions={(m) => m.direction === 'INBOUND' && (m.assignment === 'UNASSIGNED' || m.assignment === 'SUGGESTED') ? <AssignMessage message={m} onDone={() => { setNotice('Message assigned.'); void load(); onChanged(); }} /> : null}
        />
      </div>

      {open && (item.reply.canReply ? (
        <form className="space-y-2" onSubmit={async (e) => {
          e.preventDefault();
          replyKey.current ??= `reply-${item.id}-${Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('')}`;
          let delivery: { state: string; outcome: string | null } | null = null;
          const ok = await act(async () => {
            const res = await apiClient.replyToPatient(item.id, reply, replyKey.current!);
            delivery = res.delivery;
            return res.item;
          });
          replyKey.current = null;
          if (!ok || !delivery) return;
          const { state, outcome } = delivery as { state: string; outcome: string | null };
          if (state === 'FAILED' || state === 'SUPPRESSED') setError(`WhatsApp did not take the reply (${outcome ?? state.toLowerCase()}). Your text is kept; try again or log a call.`);
          else { setReply(''); setNotice('Reply sent.'); }
        }}>
          <Label htmlFor="staff-reply">Reply on WhatsApp</Label>
          <Textarea id="staff-reply" value={reply} maxLength={4096} onChange={(e) => { setReply(e.target.value); replyKey.current = null; }} disabled={busy} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">The WhatsApp reply window closes {displayClinicDateTime(item.reply.windowClosesAt)}.</span>
            <Button type="submit" size="sm" disabled={busy || !reply.trim()}>Send reply</Button>
          </div>
        </form>
      ) : (
        <form className="space-y-2" onSubmit={async (e) => {
          e.preventDefault();
          const ok = await act(() => apiClient.logPatientCall(item.id, callNote), 'Call logged.');
          if (ok) setCallNote('');
        }}>
          <p role="note" className="rounded-md border border-warning-border bg-warning-soft p-2 text-sm text-warning-text" data-testid="reply-blocked">
            {item.reply.message} Call the patient instead.
          </p>
          <Label htmlFor="call-note">Log a call</Label>
          <Textarea id="call-note" value={callNote} maxLength={2000} placeholder="What was said on the call" onChange={(e) => setCallNote(e.target.value)} disabled={busy} />
          <div className="flex justify-end">
            <Button type="submit" size="sm" variant="outline" disabled={busy || !callNote.trim()}>Log a call</Button>
          </div>
        </form>
      ))}

      {open && (
        <form className="space-y-2 border-t border-border pt-3" onSubmit={async (e) => {
          e.preventDefault();
          const ok = await act(() => apiClient.resolveWorklistItem(item.id, code, note), 'Item resolved.');
          if (ok) { setCode(''); setNote(''); }
        }}>
          <h3 className="text-sm font-semibold text-foreground">Resolve</h3>
          {!item.canResolve ? (
            <p className="text-sm text-muted-foreground" data-testid="resolve-blocked">Only doctors, nurses and admins can resolve an urgent item. You can claim it and call the patient.</p>
          ) : takenByOther ? (
            <p className="text-sm text-muted-foreground">{item.claimedBy?.name} is working on this item.</p>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
                <div>
                  <Label htmlFor="resolution-code">Outcome</Label>
                  <NativeSelect id="resolution-code" className="w-full" value={code} onChange={(e) => setCode(e.target.value)}>
                    <option value="">Choose an outcome</option>
                    {RESOLUTION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </NativeSelect>
                </div>
                <div>
                  <Label htmlFor="resolution-note">Note</Label>
                  <Textarea id="resolution-note" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="submit" size="sm" disabled={busy || !code || !note.trim()}>Resolve</Button>
              </div>
            </>
          )}
        </form>
      )}
      {item.state === 'RESOLVED' && item.resolutionNote && (
        <div className="rounded-md border border-border p-3 text-sm">
          <p className="text-muted-foreground">{RESOLUTION_OPTIONS.find((o) => o.value === item.resolutionCode)?.label ?? item.resolutionCode}</p>
          <p className="whitespace-pre-wrap break-words text-foreground">{item.resolutionNote}</p>
        </div>
      )}
    </section>
  );
}
