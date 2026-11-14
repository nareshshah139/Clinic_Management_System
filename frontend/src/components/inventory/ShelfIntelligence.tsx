'use client';

import { displayUtcDate } from '@/lib/date-display';
import { Spinner } from '@/components/ui/spinner';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  MapPin,
  PackageCheck,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/lib/api';
import type { InventoryItem } from '@/lib/types';
import { NativeSelect } from '@/components/ui/native-select';
import { plural } from '@/lib/labels';

type ShelfInventoryItem = InventoryItem & {
  batchNumber?: string | null;
  expiryDate?: string | null;
  storageLocation?: string | null;
  stockStatus?: string | null;
  minStockLevel?: number | null;
  maxStockLevel?: number | null;
  reorderQuantity?: number | null;
  supplier?: string | null;
};

type ShelfGroup = {
  location: string;
  items: ShelfInventoryItem[];
  totalStock: number;
  nearExpiry: number;
  lowStock: number;
};



export function ShelfIntelligence() {
  const { toast } = useToast();
  const [items, setItems] = useState<ShelfInventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedItemId, setSelectedItemId] = useState('');
  const [shelfLocation, setShelfLocation] = useState('');
  const [physicalCounts, setPhysicalCounts] = useState<Record<string, string>>({});
  const [countReason, setCountReason] = useState('');
  const [savingShelf, setSavingShelf] = useState(false);
  const [postingCounts, setPostingCounts] = useState(false);
  const [pendingCorrections, setPendingCorrections] = useState<Array<Parameters<typeof apiClient.adjustStock>[0]> | null>(null);

  const loadItems = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiClient.getInventoryItems({
        page: 1,
        limit: 100,
        category: 'MEDICINE',
        sortBy: 'name',
        sortOrder: 'asc',
      });
      const nextItems = Array.isArray(response) ? response : response.items || [];
      setItems(nextItems as ShelfInventoryItem[]);
      setSelectedItemId((current) => {
        if (current && nextItems.some((item) => item.id === current)) return current;
        return nextItems[0]?.id || '';
      });
    } catch (err) {
      console.error('Failed to load shelf stock:', err);
      toast({
        variant: 'destructive',
        title: 'Shelf stock unavailable',
        description: 'Inventory could not be loaded.',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return items;
    return items.filter((item) =>
      [
        item.name,
        item.sku,
        item.batchNumber,
        item.storageLocation,
        item.manufacturer,
        item.supplier,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized)),
    );
  }, [items, query]);

  const shelfGroups = useMemo(() => groupByShelf(filteredItems), [filteredItems]);
  const nearExpiryItems = useMemo(
    () =>
      filteredItems
        .filter((item) => isNearExpiry(item))
        .sort((a, b) => expiryTime(a) - expiryTime(b))
        .slice(0, 8),
    [filteredItems],
  );
  const lowStockItems = useMemo(
    () =>
      filteredItems
        .filter((item) => isLowStock(item))
        .sort((a, b) => a.currentStock - b.currentStock)
        .slice(0, 8),
    [filteredItems],
  );
  const unmappedItems = useMemo(
    () => filteredItems.filter((item) => !item.storageLocation).slice(0, 8),
    [filteredItems],
  );

  const selectedItem = items.find((item) => item.id === selectedItemId) || null;
  const mappedCount = items.filter((item) => Boolean(item.storageLocation)).length;
  const nearExpiryCount = items.filter((item) => isNearExpiry(item)).length;
  const lowStockCount = items.filter((item) => isLowStock(item)).length;
  const deadStockCount = items.filter((item) => daysOfCover(item) > 120).length;

  const assignShelf = async () => {
    if (!selectedItem || !shelfLocation.trim()) {
      toast({
        variant: 'destructive',
        title: 'Shelf required',
        description: 'Select a medicine and enter a rack, shelf, bin, or fridge location.',
      });
      return;
    }

    try {
      setSavingShelf(true);
      await apiClient.updateInventoryItem(selectedItem.id, {
        storageLocation: shelfLocation.trim(),
        updatedAt: selectedItem.updatedAt,
      });
      toast({
        description: `${selectedItem.name} mapped to ${shelfLocation.trim()}.`,
      });
      setShelfLocation('');
      await loadItems();
    } catch (err: unknown) {
      toast({
        variant: 'destructive',
        title: 'Shelf update failed',
        description: getApiErrorMessage(err, 'Could not update shelf location.'),
      });
    } finally {
      setSavingShelf(false);
    }
  };


  /**
   * @cc [owner:nareshshah139,label:product] shelf-count-retry-identity
   * Unconfirmed count corrections MUST retain their original quantities and operation IDs until
   * acknowledged; retrying a partially completed submission MUST NOT repeat successful effects.
   */
  const postCycleCounts = async () => {
    if (postingCounts) return;
    let corrections = pendingCorrections;
    if (!corrections) {
      const entered = Object.entries(physicalCounts).filter(([, value]) => value.trim() !== '');
      if (entered.some(([, value]) => !Number.isSafeInteger(Number(value)) || Number(value) < 0)) {
        toast({ variant: 'destructive', title: 'Check physical counts', description: 'Enter nonnegative whole numbers.' });
        return;
      }
      if (!countReason.trim()) {
        toast({ variant: 'destructive', title: 'Reason required', description: 'Enter a reason for each stock correction.' });
        return;
      }
      corrections = entered.flatMap(([itemId, value]) => {
        const item = items.find(candidate => candidate.id === itemId);
        const delta = item ? Number(value) - item.currentStock : 0;
        if (!item || delta === 0) return [];
        return [{ operationId: crypto.randomUUID(), itemId, adjustmentQuantity: delta,
          reason: countReason.trim(), notes: `Shelf cycle count at ${item.storageLocation || 'unmapped shelf'}` }];
      });
      if (!corrections.length) { toast({ description: 'No stock corrections to record.' }); return; }
      setPendingCorrections(corrections);
    }
    setPostingCounts(true);
    try {
      const outcomes = await Promise.allSettled(corrections.map(async data => {
        const saved = await apiClient.adjustStock(data) as { id?: string; operationId?: string; itemId?: string; quantityDelta?: number };
        if (!saved?.id || saved.operationId !== data.operationId || saved.itemId !== data.itemId || saved.quantityDelta !== data.adjustmentQuantity) {
          throw new Error('Correction acknowledgement could not be verified');
        }
        return saved;
      }));
      const unknown = corrections.filter((_, index) => outcomes[index].status === 'rejected');
      if (unknown.length) {
        setPendingCorrections(unknown);
        toast({ variant: 'destructive', title: 'Some corrections are unconfirmed',
          description: `${unknown.length} correction${unknown.length === 1 ? '' : 's'} need confirmation. Retry uses the same details and cannot repeat a saved change.` });
        return;
      }
      setPendingCorrections(null);
      setPhysicalCounts({});
      setCountReason('');
      toast({ description: 'All stock corrections are confirmed.' });
      await loadItems();
    } finally {
      setPostingCounts(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className="grid gap-3 md:grid-cols-4">
        <ShelfMetric
          label="Shelf mapped"
          value={`${mappedCount}/${items.length}`}
          detail="Batches with rack/bin/fridge"
          intent="blue"
        />
        <ShelfMetric
          label="Near expiry"
          value={nearExpiryCount}
          detail="Review these batches before dispensing"
          intent="amber"
        />
        <ShelfMetric
          label="Low stock"
          value={lowStockCount}
          detail="Replenishment queue"
          intent="red"
        />
        <ShelfMetric
          label="Slow/dead stock"
          value={deadStockCount}
          detail="Over 120 days cover"
          intent="slate"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="rounded-md border border-border bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-foreground" />
                <p className="text-lg font-semibold text-foreground">
                  Shelf Map
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                Find batches by shelf, count stock, and pick the batches that expire first.
              </p>
            </div>
            <div className="flex min-w-0 flex-wrap gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search medicine, batch, shelf"
                  className="pl-9"
                />
              </div>
              <Button variant="outline" onClick={loadItems} disabled={loading}>
                {loading ? <Spinner className="mr-2 h-4 w-4" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Refresh
              </Button>
            </div>
          </div>
          <div className="grid gap-3 p-4 md:grid-cols-2 2xl:grid-cols-3">
            {shelfGroups.slice(0, 9).map((group) => (
              <ShelfGroupCard key={group.location} group={group} />
            ))}
            {shelfGroups.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground md:col-span-2">
                No matching medicines or shelf locations.
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-md border border-border bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <PackageCheck className="h-5 w-5 text-foreground" />
              <p className="font-semibold text-foreground">Assign Shelf</p>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Map incoming Excel/OCR batches to a rack, shelf, bin, or fridge.
            </p>
            <div className="mt-4 space-y-3">
              <div className="space-y-2">
                <Label htmlFor="shelf-item">Medicine batch</Label>
                <NativeSelect
                  id="shelf-item"
                  value={selectedItemId}
                  onChange={(event) => setSelectedItemId(event.target.value)}
                  className="h-10 w-full"
                >
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} {item.batchNumber ? `(${item.batchNumber})` : ''}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-2">
                <Label htmlFor="shelf-location">Shelf location</Label>
                <Input
                  id="shelf-location"
                  value={shelfLocation}
                  onChange={(event) => setShelfLocation(event.target.value)}
                  placeholder={selectedItem?.storageLocation || 'Rack A / Shelf 2 / Bin 04'}
                />
              </div>
              <Button className="w-full" onClick={assignShelf} disabled={savingShelf}>
                <MapPin className="mr-2 h-4 w-4" />
                Save shelf mapping
              </Button>
            </div>
          </div>

          <div className="rounded-md border border-border bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-foreground" />
              <p className="font-semibold text-foreground">Receiving Rules</p>
            </div>
            <div className="mt-3 space-y-2 text-sm text-muted-foreground">
              <RuleRow done text="Excel import accepts storageLocation as shelf input." />
              <RuleRow done text="Invoice scanning creates batch receipts for review before stock is added." />
              <RuleRow done={unmappedItems.length === 0} text="Unmapped committed batches enter the shelf assignment queue." />
              <RuleRow done text="Stock count corrections are recorded in stock history." />
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <IntelligenceTable
          title="Near-Expiry Shelf Queue"
          detail="Rotate these first, return to supplier, or block if expired."
          rows={nearExpiryItems}
          empty="No near-expiry stock in the current filter."
          mode="expiry"
        />
        <IntelligenceTable
          title="Reorder And Days Of Cover"
          detail="Suggested ordering based on current stock and minimum levels."
          rows={lowStockItems}
          empty="No low-stock medicines in the current filter."
          mode="reorder"
        />
      </section>

      <section className="rounded-md border border-border bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-foreground" />
              <p className="text-lg font-semibold text-foreground">
                Shelf stock count
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              Count by shelf, enter the physical quantity, and record stock corrections with a reason.
            </p>
          </div>
          <Badge variant="outline" className="w-fit bg-success-soft text-success-text">
            Adjustment movement, no silent overwrite
          </Badge>
        </div>
        <div className="p-4">
          <div className="overflow-hidden rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Medicine</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Shelf</TableHead>
                  <TableHead className="text-right">System</TableHead>
                  <TableHead className="w-36 text-right">Physical</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.slice(0, 8).map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="font-medium">{item.name}</div>
                      <div className="text-xs text-muted-foreground">{item.sku || item.manufacturer || '-'}</div>
                    </TableCell>
                    <TableCell>{item.batchNumber || '-'}</TableCell>
                    <TableCell>{item.storageLocation || 'Unmapped'}</TableCell>
                    <TableCell className="text-right">{item.currentStock}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        className="text-right"
                        value={physicalCounts[item.id] || ''}
                        aria-label={`Physical count for ${item.name}`}
                        disabled={Boolean(pendingCorrections) || postingCounts}
                        onChange={(event) =>
                          setPhysicalCounts((current) => ({
                            ...current,
                            [item.id]: event.target.value,
                          }))
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {pendingCorrections && <p role="status" className="mt-3 text-sm text-warning-text">Some corrections are unconfirmed. Their quantities and reason are kept for a safe retry. Confirmed corrections will not be applied again.</p>}
          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
            <Textarea
              value={countReason}
              disabled={Boolean(pendingCorrections) || postingCounts}
              onChange={(event) => setCountReason(event.target.value)}
              placeholder="Reason required, for example: Shelf stock count checked by pharmacist"
            />
            <Button onClick={postCycleCounts} disabled={postingCounts}>
              <Send className="mr-2 h-4 w-4" />
              {pendingCorrections ? 'Retry corrections' : 'Post corrections'}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function ShelfMetric({
  label,
  value,
  detail,
  intent,
}: {
  label: string;
  value: string | number;
  detail: string;
  intent: 'blue' | 'amber' | 'red' | 'slate';
}) {
  const colors = {
    blue: 'bg-info-soft text-info-text border-info-border',
    amber: 'bg-warning-soft text-warning-text border-warning-border',
    red: 'bg-destructive-soft text-destructive-text border-destructive-border',
    slate: 'bg-muted text-foreground border-border',
  };

  return (
    <div className={`rounded-md border p-4 shadow-sm ${colors[intent]}`}>
      <p className="text-sm font-medium">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs opacity-80">{detail}</p>
    </div>
  );
}

function ShelfGroupCard({ group }: { group: ShelfGroup }) {
  return (
    <div className="rounded-md border border-border bg-muted p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground">{group.location}</p>
          <p className="text-xs text-muted-foreground">
            {plural(group.items.length, 'batch', 'batches')} · {group.totalStock} units
          </p>
        </div>
        <MapPin className="h-5 w-5 shrink-0 text-muted-foreground" />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {group.lowStock > 0 ? (
          <Badge variant="outline" className="bg-warning-soft text-warning-text">
            {group.lowStock} low
          </Badge>
        ) : null}
        {group.nearExpiry > 0 ? (
          <Badge variant="outline" className="bg-destructive-soft text-destructive-text">
            {group.nearExpiry} expiry
          </Badge>
        ) : null}
        {group.lowStock === 0 && group.nearExpiry === 0 ? (
          <Badge variant="outline" className="bg-success-soft text-success-text">
            Healthy
          </Badge>
        ) : null}
      </div>
      <div className="mt-4 space-y-2">
        {group.items.slice(0, 3).map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate text-foreground">{item.name}</span>
            <span className="font-semibold text-foreground">{item.currentStock}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RuleRow({ done, text }: { done: boolean; text: string }) {
  return (
    <div className="flex gap-2">
      {done ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-text" />
      ) : (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-text" />
      )}
      <span>{text}</span>
    </div>
  );
}

function IntelligenceTable({
  title,
  detail,
  rows,
  empty,
  mode,
}: {
  title: string;
  detail: string;
  rows: ShelfInventoryItem[];
  empty: string;
  mode: 'expiry' | 'reorder';
}) {
  return (
    <div className="rounded-md border border-border bg-white shadow-sm">
      <div className="border-b border-border p-4">
        <p className="font-semibold text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{detail}</p>
      </div>
      <div className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Medicine</TableHead>
              <TableHead>Shelf</TableHead>
              <TableHead className="text-right">
                {mode === 'expiry' ? 'Expiry' : 'Order'}
              </TableHead>
              <TableHead className="text-right">Cover</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length ? (
              rows.map((item) => (
                <TableRow key={`${mode}-${item.id}`}>
                  <TableCell>
                    <div className="font-medium">{item.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {item.batchNumber || item.sku || '-'}
                    </div>
                  </TableCell>
                  <TableCell>{item.storageLocation || 'Unmapped'}</TableCell>
                  <TableCell className="text-right">
                    {mode === 'expiry'
                      ? displayUtcDate(item.expiryDate, "-")
                      : suggestedOrder(item)}
                  </TableCell>
                  <TableCell className="text-right">
                    {Math.round(daysOfCover(item))}d
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                  {empty}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function groupByShelf(items: ShelfInventoryItem[]): ShelfGroup[] {
  const groups = new Map<string, ShelfInventoryItem[]>();
  for (const item of items) {
    const key = item.storageLocation || 'Unmapped';
    groups.set(key, [...(groups.get(key) || []), item]);
  }
  return Array.from(groups.entries())
    .map(([location, groupItems]) => ({
      location,
      items: groupItems,
      totalStock: groupItems.reduce((sum, item) => sum + item.currentStock, 0),
      nearExpiry: groupItems.filter((item) => isNearExpiry(item)).length,
      lowStock: groupItems.filter((item) => isLowStock(item)).length,
    }))
    .sort((a, b) => {
      if (a.location === 'Unmapped') return -1;
      if (b.location === 'Unmapped') return 1;
      return b.nearExpiry + b.lowStock - (a.nearExpiry + a.lowStock);
    });
}

function isLowStock(item: ShelfInventoryItem) {
  const threshold = item.reorderLevel ?? item.minStockLevel ?? 0;
  return item.currentStock <= threshold;
}

function isNearExpiry(item: ShelfInventoryItem) {
  if (!item.expiryDate || item.currentStock <= 0) return false;
  const diffDays =
    (new Date(item.expiryDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000);
  return diffDays <= 90;
}

function expiryTime(item: ShelfInventoryItem) {
  return item.expiryDate ? new Date(item.expiryDate).getTime() : Number.MAX_SAFE_INTEGER;
}

function daysOfCover(item: ShelfInventoryItem) {
  const baseMonthlyUse = Math.max(1, (item.reorderLevel ?? item.minStockLevel ?? 10) * 2);
  const dailyUse = baseMonthlyUse / 30;
  return item.currentStock / Math.max(0.1, dailyUse);
}

function suggestedOrder(item: ShelfInventoryItem) {
  const threshold = item.reorderLevel ?? item.minStockLevel ?? 10;
  const target = item.maxStockLevel ?? threshold * 3;
  return Math.max(item.reorderQuantity ?? 0, target - item.currentStock, threshold);
}


function getApiErrorMessage(error: unknown, fallback: string) {
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { body?: { message?: string }; message?: string };
    return candidate.body?.message || candidate.message || fallback;
  }
  return fallback;
}
