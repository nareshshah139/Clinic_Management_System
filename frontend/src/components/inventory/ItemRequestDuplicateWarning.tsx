import { displayClinicDateTime } from '@/lib/date-display';
import { describePossibleDuplicates, hasPossibleDuplicates, type PossibleDuplicates } from '@/lib/inventory-item-requests';

export function ItemRequestDuplicateWarning({ duplicates, intro }: { duplicates?: PossibleDuplicates | null; intro?: string }) {
  if (!hasPossibleDuplicates(duplicates)) return null;
  const lines = describePossibleDuplicates(duplicates, displayClinicDateTime);
  return <div role="note" data-testid="duplicate-warning" className="rounded-md border border-amber-500 bg-amber-50 p-3 text-sm text-amber-950">
    <p className="font-semibold">Possible duplicate{intro ? `. ${intro}` : ''}</p>
    {lines.inventory.length > 0 && <>
      <p className="mt-1 font-medium">{lines.inventoryHeading}</p>
      <ul className="list-disc pl-5">{lines.inventory.map(l => <li key={l}>{l}</li>)}</ul></>}
    {lines.pending.length > 0 && <ul className="mt-1 list-disc pl-5">{lines.pending.map(l => <li key={l}>{l}</li>)}</ul>}
  </div>;
}
