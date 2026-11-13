'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { InventoryItemRequests } from './InventoryItemRequests';
import { InventoryUpdates } from './InventoryUpdates';

type Tab = 'edits' | 'items';

/**
 * @cc [owner:nareshshah139,label:product] approvals-open-requested-tab
 * A request for the edits or items tab MUST open that tab; without one, new-item requests
 * open first while any are pending.
 */
export function InventoryApprovals({ canReadEdits, pendingItems, initialTab }: { canReadEdits: boolean; pendingItems: number; initialTab?: string }) {
  const [chosen, setTab] = useState<Tab | null>(null);
  const requested: Tab | null = initialTab === 'edits' || initialTab === 'items' ? initialTab : null;
  const tab: Tab = chosen ?? requested ?? (!canReadEdits || pendingItems > 0 ? 'items' : 'edits');
  if (!canReadEdits) return <InventoryItemRequests />;
  return <div className="space-y-6">
    <div role="tablist" aria-label="Approval types" className="flex gap-2">
      <Button role="tab" aria-selected={tab === 'edits'} variant={tab === 'edits' ? 'secondary' : 'ghost'} onClick={() => setTab('edits')}>Price / stock</Button>
      <Button role="tab" aria-selected={tab === 'items'} variant={tab === 'items' ? 'secondary' : 'ghost'} onClick={() => setTab('items')}>
        New items{pendingItems > 0 && <span className="ml-2 rounded-full bg-destructive px-2 text-xs text-destructive-foreground" aria-label={`${pendingItems} pending`}>{pendingItems}</span>}
      </Button>
    </div>
    {tab === 'edits' ? <InventoryUpdates /> : <InventoryItemRequests />}
  </div>;
}
