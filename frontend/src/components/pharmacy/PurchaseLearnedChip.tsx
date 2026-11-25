'use client';

import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { learnedChipText, type LearnedCorrection } from '@/lib/purchase-learning';

export function PurchaseLearnedChips({ corrections, label, disabled, onUndo }: {
  corrections?: LearnedCorrection[];
  label: string;
  disabled?: boolean;
  onUndo: (correction: LearnedCorrection) => void;
}) {
  const applied = (corrections || []).filter(correction => correction.tier !== 'SUGGEST');
  if (!applied.length) return null;
  return <ul className="space-y-1 text-sm" aria-label={label}>
    {applied.map(correction => <li key={correction.field} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2">
      <span className="flex min-w-0 items-start gap-2 break-words"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" /><span className="min-w-0 break-words">{learnedChipText(correction)}</span></span>
      <Button type="button" variant="outline" size="sm" disabled={disabled} aria-label={`Undo learned ${correction.field === 'distributorName' ? 'supplier' : correction.field} correction`} onClick={() => onUndo(correction)}>Undo</Button>
    </li>)}
  </ul>;
}
