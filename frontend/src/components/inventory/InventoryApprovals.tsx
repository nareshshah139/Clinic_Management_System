'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { InventoryItemRequests } from './InventoryItemRequests';
import { InventoryUpdates } from './InventoryUpdates';
import type { PendingApprovals } from './use-pending-item-requests';

type Tab = 'edits' | 'items';

const opening = (items: number | null): Tab | null => (items === null ? null : items > 0 ? 'items' : 'edits');

const PendingBadge = ({ count }: { count: number | null }) =>
  count ? <span className="ml-2 rounded-full bg-destructive px-2 text-xs text-destructive-foreground" aria-label={`${count} pending`}>{count}</span> : null;

/**
 * @cc [owner:nareshshah139,label:product] approval-tab-choice-sticks
 * The opening tab MAY prefer new items once their pending count is first known; after that the
 * tab changes only when the user picks one, whatever later counts or refreshes report.
 */
export function InventoryApprovals({ canReadEdits, pending }: { canReadEdits: boolean; pending: PendingApprovals }) {
  const [chosen, setTab] = useState<Tab | null>(() => opening(pending.items));
  if (chosen === null && pending.items !== null) setTab(opening(pending.items));
  if (!canReadEdits) return <InventoryItemRequests />;
  const tab: Tab = chosen ?? 'edits';
  return <div className="space-y-6">
    <div role="tablist" aria-label="Approval types" className="flex gap-2">
      <Button role="tab" aria-selected={tab === 'edits'} variant={tab === 'edits' ? 'secondary' : 'ghost'} onClick={() => setTab('edits')}>
        Price / stock<PendingBadge count={pending.edits} />
      </Button>
      <Button role="tab" aria-selected={tab === 'items'} variant={tab === 'items' ? 'secondary' : 'ghost'} onClick={() => setTab('items')}>
        New items<PendingBadge count={pending.items} />
      </Button>
    </div>
    {tab === 'edits' ? <InventoryUpdates /> : <InventoryItemRequests />}
  </div>;
}
