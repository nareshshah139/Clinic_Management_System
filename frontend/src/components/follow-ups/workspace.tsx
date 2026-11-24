'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiClient } from '@/lib/api';
import { useDashboardUser } from '@/components/layout/dashboard-user-context';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { displayClinicDateTime } from '@/lib/date-display';
import {
  DELIVERY_LABEL, KIND_LABEL, PRIORITY_LABEL, formatAge, patientLabel,
  type MessageThread, type WaitingCheckIn, type WorklistItem,
} from '@/lib/follow-ups';
import { cn } from '@/lib/utils';
import { WorklistItemDetailView } from './item-detail';

type Tab = 'attention' | 'waiting' | 'messages';
const TABS: Tab[] = ['attention', 'waiting', 'messages'];

function ItemRow({ item, selected, onSelect }: { item: WorklistItem; selected: boolean; onSelect: () => void }) {
  return (
    <li>
      <button type="button" onClick={onSelect} aria-current={selected ? 'true' : undefined}
        className={cn('w-full rounded-md border p-3 text-left transition-colors hover:bg-accent', selected ? 'border-primary bg-accent' : 'border-border')}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={item.priority === 'URGENT' ? 'danger' : item.priority === 'HIGH' ? 'warning' : 'neutral'}>{PRIORITY_LABEL[item.priority]}</Badge>
          <span className="min-w-0 break-words font-medium text-foreground">{patientLabel(item.patient, item.phoneE164)}</span>
          <span className="ml-auto text-xs text-muted-foreground" aria-label={`Waiting ${formatAge(item.ageMinutes)}`}>{formatAge(item.ageMinutes)}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>{KIND_LABEL[item.kind]}</span>
          {item.claimedBy && <span>· {item.claimedBy.name} is working on this</span>}
        </div>
      </button>
    </li>
  );
}

export function FollowUpsWorkspace() {
  const { user } = useDashboardUser();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = (TABS.includes(params.get('tab') as Tab) ? params.get('tab') : 'attention') as Tab;
  const selected = params.get('item');
  const [items, setItems] = useState<WorklistItem[] | null>(null);
  const [waiting, setWaiting] = useState<WaitingCheckIn[] | null>(null);
  const [threads, setThreads] = useState<MessageThread[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const navigate = useCallback((next: { tab?: Tab; item?: string | null }) => {
    const q = new URLSearchParams(params.toString());
    if (next.tab) q.set('tab', next.tab);
    if (next.item === null) q.delete('item');
    else if (next.item) q.set('item', next.item);
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  }, [params, pathname, router]);

  const refresh = useCallback(async () => {
    try {
      const [i, w, t] = await Promise.all([apiClient.getWorklistItems(), apiClient.getWaitingCheckIns(), apiClient.getMessageThreads()]);
      setItems(i);
      setWaiting(w);
      setThreads(t);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Could not load the worklist.');
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const list = (
    <Tabs value={tab} onValueChange={(v: string) => navigate({ tab: v as Tab })} className="min-w-0">
      <TabsList className="flex h-auto w-full flex-wrap justify-start">
        <TabsTrigger value="attention">Needs attention{items ? ` (${items.length})` : ''}</TabsTrigger>
        <TabsTrigger value="waiting">Waiting on patient{waiting ? ` (${waiting.length})` : ''}</TabsTrigger>
        <TabsTrigger value="messages">Messages{threads ? ` (${threads.length})` : ''}</TabsTrigger>
      </TabsList>
      <TabsContent value="attention" className="mt-3">
        {!items ? <p role="status" className="text-sm text-muted-foreground">Loading…</p> : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing needs attention.</p>
        ) : (
          <ul aria-label="Items that need attention" className="space-y-2">
            {items.map((item) => <ItemRow key={item.id} item={item} selected={item.id === selected} onSelect={() => navigate({ item: item.id })} />)}
          </ul>
        )}
      </TabsContent>
      <TabsContent value="waiting" className="mt-3">
        {!waiting ? <p role="status" className="text-sm text-muted-foreground">Loading…</p> : waiting.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open check-ins.</p>
        ) : (
          <ul aria-label="Open check-ins" className="space-y-2">
            {waiting.map((c) => (
              <li key={c.checkInId} className="rounded-md border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  {c.patient ? <Link href={`/dashboard/patients/${c.patient.id}`} className="font-medium text-primary hover:underline">{c.patient.name}</Link> : null}
                  <span className="text-muted-foreground">{c.plan} · {c.stepKey}</span>
                  <Badge className="ml-auto" variant={c.delivery?.state === 'FAILED' || c.delivery?.state === 'SUPPRESSED' ? 'danger' : 'neutral'}>
                    {c.delivery ? DELIVERY_LABEL[c.delivery.state] : 'No message yet'}
                  </Badge>
                </div>
                <p className="mt-1 text-muted-foreground">Closes {displayClinicDateTime(c.closesAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </TabsContent>
      <TabsContent value="messages" className="mt-3">
        {!threads ? <p role="status" className="text-sm text-muted-foreground">Loading…</p> : threads.length === 0 ? (
          <p className="text-sm text-muted-foreground">No unread messages.</p>
        ) : (
          <ul aria-label="Unread message threads" className="space-y-2">
            {threads.map((t) => (
              <li key={t.subjectKey}>
                <button type="button" disabled={!t.itemId} onClick={() => t.itemId && navigate({ item: t.itemId })}
                  aria-current={t.itemId && t.itemId === selected ? 'true' : undefined}
                  className={cn('w-full rounded-md border p-3 text-left transition-colors hover:bg-accent disabled:cursor-default', t.itemId && t.itemId === selected ? 'border-primary bg-accent' : 'border-border')}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 break-words font-medium text-foreground">{patientLabel(t.patient, t.phoneE164)}</span>
                    {t.suggested && <Badge variant="warning">Patient not confirmed</Badge>}
                    <Badge variant="info">{t.unread} unread</Badge>
                    <span className="ml-auto text-xs text-muted-foreground">{displayClinicDateTime(t.lastMessageAt)}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">{t.preview}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </TabsContent>
    </Tabs>
  );

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader title="Follow-ups" description="Patients who need a call, a reply or a booking." />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className={cn('min-w-0', selected && 'hidden lg:block')}>{list}</div>
        {selected ? (
          <div className="min-w-0 rounded-lg border border-border p-4">
            <WorklistItemDetailView itemId={selected} currentUserId={user?.id} onChanged={refresh} onClose={() => navigate({ item: null })} />
          </div>
        ) : (
          <p className="hidden text-sm text-muted-foreground lg:block">Choose an item to see the answers and the messages.</p>
        )}
      </div>
    </div>
  );
}
