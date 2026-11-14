'use client';

import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { LoadingSkeleton } from '@/components/ui/skeleton';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { apiClient } from '@/lib/api';
import { getErrorMessage } from '@/lib/utils';
import { displayClinicDate, displayClinicDateTime } from '@/lib/date-display';
import type { WhatsAppConnection, WhatsAppDocumentTemplate, WhatsAppMessage, WhatsAppSendResult } from '@/lib/types';

type LinkedConnection = Extract<WhatsAppConnection, { linked: true }>;

export type WhatsAppCardState =
  | { kind: 'loading' }
  | { kind: 'unlinked'; fallback: 'SERVER_ENV' | null }
  | { kind: 'linked'; connection: LinkedConnection }
  | { kind: 'error'; message: string };

export const cardStateOf = (connection: WhatsAppConnection): WhatsAppCardState =>
  connection.linked ? { kind: 'linked', connection } : { kind: 'unlinked', fallback: connection.fallback };

const MAX_BODY_VALUES = 3;
const selectClass = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground';

const QUALITY: Record<string, { variant: 'success' | 'warning' | 'danger'; label: string }> = {
  GREEN: { variant: 'success', label: 'High quality' },
  YELLOW: { variant: 'warning', label: 'Medium quality' },
  RED: { variant: 'danger', label: 'Low quality' },
};

const KIND_LABEL: Record<WhatsAppMessage['kind'], string> = {
  PRESCRIPTION: 'Prescription',
  TEST_PRESCRIPTION: 'Test prescription',
  APPOINTMENT: 'Appointment',
  TEXT: 'Message',
};

export function sendResultText(result: WhatsAppSendResult): string {
  if (result.status === 'ACCEPTED') return `WhatsApp accepted the message. Message ID ${result.wamid}.`;
  if (result.status === 'NOT_CONFIGURED') return 'Link the clinic WhatsApp first.';
  return result.reason;
}

const templateKey = (t: { name: string; language: string }) => `${t.name}|${t.language}`;

function LinkForm({ fallback, onLinked }: { fallback: 'SERVER_ENV' | null; onLinked: (c: WhatsAppConnection) => void }) {
  const ids = useId();
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [businessAccountId, setBusinessAccountId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLinking(true);
    setError(null);
    try {
      onLinked(await apiClient.linkWhatsApp({ phoneNumberId: phoneNumberId.trim(), accessToken: accessToken.trim(), businessAccountId: businessAccountId.trim() || undefined }));
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLinking(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <form aria-label="Link WhatsApp" className="space-y-4" onSubmit={(e) => void submit(e)}>
        <p className="text-sm text-muted-foreground">
          {fallback === 'SERVER_ENV'
            ? 'Not linked. Until you link the clinic number, WhatsApp messages go out from the server’s shared number.'
            : 'Not linked. Until you link the clinic number, the app cannot send WhatsApp messages.'}
        </p>
        <div className="space-y-1.5">
          <Label htmlFor={`${ids}-phone`}>Phone number ID</Label>
          <Input id={`${ids}-phone`} value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} inputMode="numeric" autoComplete="off" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${ids}-waba`}>WhatsApp Business Account ID (optional)</Label>
          <Input id={`${ids}-waba`} value={businessAccountId} onChange={(e) => setBusinessAccountId(e.target.value)} inputMode="numeric" autoComplete="off" aria-describedby={`${ids}-waba-help`} />
          <p id={`${ids}-waba-help`} className="text-xs text-muted-foreground">Needed to choose an approved prescription template.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${ids}-token`}>Access token</Label>
          <Input id={`${ids}-token`} type="password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} autoComplete="off" required />
        </div>
        {error && <p role="alert" className="text-sm text-destructive-text">{error}</p>}
        <Button type="submit" disabled={linking || !phoneNumberId.trim() || !accessToken.trim()}>
          {linking ? 'Checking with WhatsApp…' : 'Link WhatsApp'}
        </Button>
      </form>
      <div className="rounded-md border bg-muted p-4 text-sm">
        <h3 className="mb-2 font-medium">Where to find these in Meta Business Manager</h3>
        <ol className="ml-5 list-decimal space-y-1.5 text-muted-foreground">
          <li>Open business.facebook.com and choose the clinic’s business.</li>
          <li>Under WhatsApp Accounts, open the clinic’s account. Its ID is the WhatsApp Business Account ID.</li>
          <li>In WhatsApp Manager, open Phone numbers and copy the Phone number ID of the clinic’s number.</li>
          <li>In Business settings, open Users, then System users. Add a system user with Admin access and assign it the WhatsApp account.</li>
          <li>Choose Generate new token, pick the clinic’s app, set it to never expire, and tick whatsapp_business_messaging and whatsapp_business_management.</li>
          <li>Paste the token here. The app checks it with WhatsApp before saving and never shows it again.</li>
        </ol>
      </div>
    </div>
  );
}

function TemplatePicker({ connection, onChange }: { connection: LinkedConnection; onChange: (c: WhatsAppConnection) => void }) {
  const ids = useId();
  const [templates, setTemplates] = useState<WhatsAppDocumentTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const chosen = connection.prescriptionTemplate;

  useEffect(() => {
    if (!connection.businessAccountId) return;
    let live = true;
    apiClient
      .getWhatsAppDocumentTemplates()
      .then((list) => live && setTemplates(list))
      .catch((e) => live && setError(getErrorMessage(e)));
    return () => {
      live = false;
    };
  }, [connection.businessAccountId]);

  const choose = async (value: string) => {
    const template = templates?.find((t) => templateKey(t) === value) ?? null;
    setSaving(true);
    setError(null);
    try {
      onChange(await apiClient.setWhatsAppPrescriptionTemplate(template && { name: template.name, language: template.language }));
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby={`${ids}-title`} className="space-y-2">
      <h3 id={`${ids}-title`} className="font-medium">Prescription template</h3>
      <p className="text-sm text-muted-foreground">
        WhatsApp only lets the clinic message a patient freely within 24 hours of the patient’s last message. An approved template with a document header lets prescriptions reach every patient.
      </p>
      {!connection.businessAccountId ? (
        <p className="text-sm text-muted-foreground">Link WhatsApp again with the WhatsApp Business Account ID to choose a template.</p>
      ) : !templates && !error ? (
        <p className="text-sm text-muted-foreground">Loading approved templates…</p>
      ) : (
        <>
          <Label htmlFor={`${ids}-select`} className="sr-only">Prescription template</Label>
          <select
            id={`${ids}-select`}
            className={selectClass}
            value={chosen ? templateKey(chosen) : ''}
            disabled={saving || !templates}
            onChange={(e) => void choose(e.target.value)}
          >
            <option value="">No template: plain document, 24-hour window only</option>
            {chosen && !templates?.some((t) => templateKey(t) === templateKey(chosen)) && (
              <option value={templateKey(chosen)}>{`${chosen.name} (${chosen.language})`}</option>
            )}
            {templates?.map((t) => (
              <option key={templateKey(t)} value={templateKey(t)} disabled={t.bodyParams > MAX_BODY_VALUES}>
                {`${t.name} (${t.language})${t.bodyParams > MAX_BODY_VALUES ? ` needs ${t.bodyParams} values, at most ${MAX_BODY_VALUES} are filled` : ''}`}
              </option>
            ))}
          </select>
          {templates?.length === 0 && (
            <p className="text-sm text-muted-foreground">No approved template with a document header was found. Create one in WhatsApp Manager; its body may use up to three values: patient name, doctor name and clinic name.</p>
          )}
          {chosen && <p className="text-sm text-foreground">Prescriptions are sent with {chosen.name} ({chosen.language}).</p>}
        </>
      )}
      {error && <p role="alert" className="text-sm text-destructive-text">{error}</p>}
    </section>
  );
}

function TestSend({ onSent }: { onSent: () => void }) {
  const ids = useId();
  const [to, setTo] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<WhatsAppSendResult | null>(null);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    setSending(true);
    setResult(null);
    try {
      const sent = await apiClient.sendWhatsAppTestPrescription(to.trim());
      setResult(sent);
      if (sent.status === 'ACCEPTED') onSent();
    } catch (e) {
      setResult({ status: 'FAILED', reason: getErrorMessage(e) });
    } finally {
      setSending(false);
    }
  };

  return (
    <form aria-labelledby={`${ids}-title`} className="space-y-2" onSubmit={(e) => void send(e)}>
      <h3 id={`${ids}-title`} className="font-medium">Send test prescription</h3>
      <p className="text-sm text-muted-foreground">Sends a sample prescription, marked not for clinical use, the way patients receive theirs.</p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor={`${ids}-to`}>WhatsApp number</Label>
          <Input id={`${ids}-to`} type="tel" placeholder="+91 97048 02443" value={to} onChange={(e) => setTo(e.target.value)} autoComplete="off" />
        </div>
        <Button type="submit" disabled={sending || !to.trim()}>{sending ? 'Sending…' : 'Send test prescription'}</Button>
      </div>
      {result && (
        <p role={result.status === 'ACCEPTED' ? 'status' : 'alert'} data-testid="test-send-result" className={result.status === 'ACCEPTED' ? 'text-sm text-success-text' : 'text-sm text-destructive-text'}>
          {sendResultText(result)}
        </p>
      )}
    </form>
  );
}

function RecentMessages({ messages, onRefresh }: { messages: WhatsAppMessage[] | null; onRefresh: () => void }) {
  const ids = useId();
  return (
    <section aria-labelledby={`${ids}-title`} className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 id={`${ids}-title`} className="font-medium">Recent messages</h3>
        <Button type="button" size="sm" variant="outline" onClick={onRefresh}>Refresh</Button>
      </div>
      {!messages ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : messages.length === 0 ? (
        <p className="text-sm text-muted-foreground">No messages sent from this number yet.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {messages.map((m) => (
            <li key={m.id} data-testid="whatsapp-message" className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="font-medium">{KIND_LABEL[m.kind]}</span> to +{m.toPhone}
                <span className="block text-xs text-muted-foreground">
                  {displayClinicDateTime(m.createdAt)}
                  {m.status === 'FAILED' && m.errorTitle ? ` · ${m.errorTitle}${m.errorCode ? ` (${m.errorCode})` : ''}` : ''}
                </span>
              </span>
              <StatusBadge domain="message" status={m.status} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function LinkedView({ connection, onChange }: { connection: LinkedConnection; onChange: (c: WhatsAppConnection) => void }) {
  const [messages, setMessages] = useState<WhatsAppMessage[] | null>(null);
  const [unlinking, setUnlinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, confirmDialog] = useConfirm();
  const quality = connection.qualityRating ? QUALITY[connection.qualityRating] : undefined;

  const loadMessages = useCallback(() => {
    apiClient.getWhatsAppMessages(20).then(setMessages).catch(() => setMessages([]));
  }, []);
  useEffect(loadMessages, [loadMessages]);

  const unlink = async () => {
    const ok = await confirm({
      title: 'Unlink WhatsApp?',
      description: `Prescriptions will stop going out from ${connection.displayPhoneNumber}. The token is deleted from the app; it stays valid in Meta until you revoke it there.`,
      confirmLabel: 'Unlink',
      destructive: true,
    });
    if (!ok) return;
    setUnlinking(true);
    setError(null);
    try {
      onChange(await apiClient.unlinkWhatsApp());
    } catch (e) {
      setError(getErrorMessage(e));
      setUnlinking(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <p className="text-base font-semibold" data-testid="whatsapp-verified-name">{connection.verifiedName}</p>
          <p className="text-sm text-foreground">{connection.displayPhoneNumber}</p>
          <p className="text-xs text-muted-foreground">
            Linked {displayClinicDate(connection.verifiedAt)}
            {connection.linkedBy ? ` by ${connection.linkedBy.name}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {quality ? <Badge variant={quality.variant}>{quality.label}</Badge> : <Badge variant="neutral">Quality not rated</Badge>}
          <Button type="button" variant="outline" disabled={unlinking} onClick={() => void unlink()}>
            {unlinking ? 'Unlinking…' : 'Unlink'}
          </Button>
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-destructive-text">{error}</p>}
      <TemplatePicker connection={connection} onChange={onChange} />
      <TestSend onSent={loadMessages} />
      <RecentMessages messages={messages} onRefresh={loadMessages} />
      {confirmDialog}
    </div>
  );
}

/**
 * @cc [owner:nareshshah139,label:product] clinic-whatsapp-card
 * The card MUST show exactly one of loading, unlinked, linked or error. A test send MUST show
 * Meta's message id only when WhatsApp accepted it, and otherwise the reason it was not sent.
 */
export function WhatsAppCard() {
  const [state, setState] = useState<WhatsAppCardState>({ kind: 'loading' });

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      setState(cardStateOf(await apiClient.getWhatsAppConnection()));
    } catch (e) {
      setState({ kind: 'error', message: getErrorMessage(e) });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const update = (connection: WhatsAppConnection) => setState(cardStateOf(connection));

  return (
    <section aria-labelledby="whatsapp-card-title" className="space-y-4 rounded-lg border bg-card p-4 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 id="whatsapp-card-title" className="text-lg font-semibold">WhatsApp</h2>
        {state.kind === 'linked' && <Badge variant="success">Linked</Badge>}
        {state.kind === 'unlinked' && <Badge variant="neutral">Not linked</Badge>}
      </div>
      {state.kind === 'loading' && <LoadingSkeleton label="Loading WhatsApp…" variant="cards" />}
      {state.kind === 'error' && (
        <div role="alert" className="space-y-2 text-sm text-destructive-text">
          <p>Could not load WhatsApp: {state.message}</p>
          <Button size="sm" variant="outline" onClick={() => void load()}>Retry</Button>
        </div>
      )}
      {state.kind === 'unlinked' && <LinkForm fallback={state.fallback} onLinked={update} />}
      {state.kind === 'linked' && <LinkedView connection={state.connection} onChange={update} />}
    </section>
  );
}
