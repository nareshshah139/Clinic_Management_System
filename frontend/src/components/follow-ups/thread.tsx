'use client';

import { Badge } from '@/components/ui/badge';
import { displayClinicDateTime } from '@/lib/date-display';
import { DELIVERY_LABEL, type ResponseView, type ThreadMessage } from '@/lib/follow-ups';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

/** Photos come only through the authenticated, uncached staff route. */
export const photoUrl = (id: string) => `/api/follow-ups/attachments/${encodeURIComponent(id)}`;

/** Patient text is always rendered as a plain text node (PP-54). */
export function PlainText({ text, className }: { text: string | null | undefined; className?: string }) {
  return <p className={cn('whitespace-pre-wrap break-words text-sm text-foreground', className)}>{text ?? ''}</p>;
}

export function ResponseCard({ response, title }: { response: ResponseView; title?: string }) {
  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium text-foreground">{title ?? response.instrument}</span>
        <span className="text-muted-foreground">{displayClinicDateTime(response.submittedAt)}</span>
        {response.score !== null && <Badge variant="info">Score {response.score}</Badge>}
        {response.flag && <Badge variant={response.flag === 'URGENT' ? 'danger' : 'warning'}>{response.flag === 'URGENT' ? 'Urgent answer' : 'Flagged answer'}</Badge>}
      </div>
      <dl className="grid gap-1 text-sm">
        {response.answers.map((a) => (
          <div key={a.key} className="grid gap-0.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:gap-3">
            <dt className="text-muted-foreground">{a.prompt}</dt>
            <dd className="whitespace-pre-wrap break-words text-foreground">{a.value || '—'}</dd>
          </div>
        ))}
      </dl>
      {response.photos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {response.photos.map((p) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={p.id} src={photoUrl(p.id)} alt={`Patient photo${p.itemKey ? ` (${p.itemKey})` : ''}`} className="h-28 w-28 rounded-md border border-border object-cover" />
          ))}
        </div>
      )}
    </div>
  );
}

function messageHeading(m: ThreadMessage): string {
  if (m.channel === 'PHONE') return `Call logged${m.author ? ` by ${m.author}` : ''}`;
  if (m.direction === 'OUTBOUND') return m.author ? `Reply from ${m.author}` : 'Clinic';
  return 'Patient';
}

export function MessageThreadView({ messages, renderActions, emptyText = 'No messages yet.' }: {
  messages: ThreadMessage[];
  renderActions?: (m: ThreadMessage) => ReactNode;
  emptyText?: string;
}) {
  if (!messages.length) return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  return (
    <ol aria-label="Message thread" className="space-y-2">
      {messages.map((m) => (
        <li key={m.id} className={cn('max-w-[min(36rem,100%)] rounded-lg border p-3', m.direction === 'OUTBOUND' ? 'ml-auto border-border bg-muted' : 'mr-auto border-border bg-background')}>
          <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{messageHeading(m)}</span>
            <span>{displayClinicDateTime(m.createdAt)}</span>
            {m.delivery && <Badge variant={m.delivery.state === 'FAILED' || m.delivery.state === 'SUPPRESSED' ? 'danger' : 'neutral'}>{DELIVERY_LABEL[m.delivery.state]}</Badge>}
            {m.direction === 'INBOUND' && !m.readAt && <Badge variant="info">Unread</Badge>}
          </div>
          {m.body ? <PlainText text={m.body} /> : <p className="text-sm italic text-muted-foreground">{m.hasMedia ? 'Photo sent on WhatsApp (not downloaded)' : `(${m.kind})`}</p>}
          {m.photos.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {m.photos.map((id) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={id} src={photoUrl(id)} alt="Photo from the patient" className="h-24 w-24 rounded-md border border-border object-cover" />
              ))}
            </div>
          )}
          {renderActions?.(m)}
        </li>
      ))}
    </ol>
  );
}
