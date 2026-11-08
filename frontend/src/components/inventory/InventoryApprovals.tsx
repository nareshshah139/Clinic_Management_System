'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { InventoryItemRequests } from './InventoryItemRequests';
import { InventoryUpdates } from './InventoryUpdates';

type Tab = 'edits' | 'items';

export function InventoryApprovals({ canReadEdits, pendingItems }: { canReadEdits: boolean; pendingItems: number }) {
  const [chosen, setTab] = useState<Tab | null>(null);
  const tab: Tab = chosen ?? (!canReadEdits || pendingItems > 0 ? 'items' : 'edits');
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
