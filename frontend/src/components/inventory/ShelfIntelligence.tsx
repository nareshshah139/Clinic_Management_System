'use client';

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
      console.error('Failed to load shelf intelligence inventory:', err);
      toast({
        variant: 'destructive',
        title: 'Shelf intelligence unavailable',
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

  const postCycleCounts = async () => {
    const countRows = Object.entries(physicalCounts)
      .map(([itemId, value]) => {
        const item = items.find((candidate) => candidate.id === itemId);
        const physical = Number(value);
        if (!item || !Number.isFinite(physical)) return null;
        const delta = Math.round(physical - item.currentStock);
        if (delta === 0) return null;
        return { item, delta };
      })
      .filter(Boolean) as Array<{ item: ShelfInventoryItem; delta: number }>;

    if (countRows.length === 0) {
      toast({ description: 'No stock variance to post.' });
      return;
    }
    if (!countReason.trim()) {
      toast({
        variant: 'destructive',
        title: 'Reason required',
        description: 'Cycle count corrections need an auditable reason.',
      });
      return;
    }

    try {
      setPostingCounts(true);
      await Promise.all(
        countRows.map(({ item, delta }) =>
          apiClient.adjustStock({
            itemId: item.id,
            adjustmentQuantity: delta,
            reason: countReason.trim(),
            notes: `Shelf cycle count at ${item.storageLocation || 'unmapped shelf'}`,
            batchNumber: item.batchNumber || undefined,
            expiryDate: item.expiryDate || undefined,
          }),
        ),
      );
      toast({
        description: `Posted ${countRows.length} cycle count correction${countRows.length === 1 ? '' : 's'}.`,
      });
      setPhysicalCounts({});
      setCountReason('');
      await loadItems();
    } catch (err: unknown) {
      toast({
        variant: 'destructive',
        title: 'Cycle count failed',
        description: getApiErrorMessage(err, 'Could not post corrections.'),
      });
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
          detail="Needs FEFO attention"
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
        <div className="rounded-[8px] border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-slate-700" />
                <p className="text-lg font-semibold text-slate-950">
                  Shelf Map
                </p>
              </div>
              <p className="text-sm text-slate-600">
                Location-aware batches for faster picking, cycle counts, and FEFO rotation.
              </p>
            </div>
            <div className="flex gap-2">
              <div className="relative min-w-64">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search medicine, batch, shelf"
                  className="pl-9"
                />
              </div>
              <Button variant="outline" onClick={loadItems} disabled={loading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>
          <div className="grid gap-3 p-4 md:grid-cols-2 2xl:grid-cols-3">
            {shelfGroups.slice(0, 9).map((group) => (
              <ShelfGroupCard key={group.location} group={group} />
            ))}
            {shelfGroups.length === 0 ? (
              <div className="rounded-[8px] border border-dashed border-slate-200 p-6 text-center text-sm text-slate-600 md:col-span-2">
                No matching medicines or shelf locations.
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[8px] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <PackageCheck className="h-5 w-5 text-slate-700" />
              <p className="font-semibold text-slate-950">Assign Shelf</p>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              Map incoming Excel/OCR batches to a rack, shelf, bin, or fridge.
            </p>
            <div className="mt-4 space-y-3">
              <div className="space-y-2">
                <Label htmlFor="shelf-item">Medicine batch</Label>
                <select
                  id="shelf-item"
                  value={selectedItemId}
                  onChange={(event) => setSelectedItemId(event.target.value)}
                  className="h-10 w-full rounded-[8px] border border-slate-200 bg-white px-3 text-sm"
                >
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} {item.batchNumber ? `(${item.batchNumber})` : ''}
                    </option>
                  ))}
                </select>
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

          <div className="rounded-[8px] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-slate-700" />
              <p className="font-semibold text-slate-950">Receiving Rules</p>
            </div>
            <div className="mt-3 space-y-2 text-sm text-slate-600">
              <RuleRow done text="Excel import accepts storageLocation as shelf input." />
              <RuleRow done text="Supplier OCR creates reviewed batch receipts before stock commit." />
              <RuleRow done={unmappedItems.length === 0} text="Unmapped committed batches enter the shelf assignment queue." />
              <RuleRow done text="Cycle count corrections post auditable adjustment movements." />
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

      <section className="rounded-[8px] border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-slate-700" />
              <p className="text-lg font-semibold text-slate-950">
                Shelf Cycle Count
              </p>
            </div>
            <p className="text-sm text-slate-600">
              Count by shelf, enter physical quantity, and post variance with a mandatory reason.
            </p>
          </div>
          <Badge variant="outline" className="w-fit bg-emerald-50 text-emerald-800">
            Adjustment movement, no silent overwrite
          </Badge>
        </div>
        <div className="p-4">
          <div className="overflow-hidden rounded-[8px] border border-slate-200">
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
                      <div className="text-xs text-slate-500">{item.sku || item.manufacturer || '-'}</div>
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
          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
            <Textarea
              value={countReason}
              onChange={(event) => setCountReason(event.target.value)}
              placeholder="Reason required, for example: Shelf cycle count variance verified by pharmacist"
            />
            <Button onClick={postCycleCounts} disabled={postingCounts}>
              <Send className="mr-2 h-4 w-4" />
              Post corrections
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
    blue: 'bg-blue-50 text-blue-800 border-blue-100',
    amber: 'bg-amber-50 text-amber-800 border-amber-100',
    red: 'bg-red-50 text-red-800 border-red-100',
    slate: 'bg-slate-50 text-slate-800 border-slate-200',
  };

  return (
    <div className={`rounded-[8px] border p-4 shadow-sm ${colors[intent]}`}>
      <p className="text-sm font-medium">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs opacity-80">{detail}</p>
    </div>
  );
}

function ShelfGroupCard({ group }: { group: ShelfGroup }) {
  return (
    <div className="rounded-[8px] border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-950">{group.location}</p>
          <p className="text-xs text-slate-500">
            {group.items.length} batches · {group.totalStock} units
          </p>
        </div>
        <MapPin className="h-5 w-5 shrink-0 text-slate-500" />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {group.lowStock > 0 ? (
          <Badge variant="outline" className="bg-amber-50 text-amber-800">
            {group.lowStock} low
          </Badge>
        ) : null}
        {group.nearExpiry > 0 ? (
          <Badge variant="outline" className="bg-red-50 text-red-800">
            {group.nearExpiry} expiry
          </Badge>
        ) : null}
        {group.lowStock === 0 && group.nearExpiry === 0 ? (
          <Badge variant="outline" className="bg-emerald-50 text-emerald-800">
            Healthy
          </Badge>
        ) : null}
      </div>
      <div className="mt-4 space-y-2">
        {group.items.slice(0, 3).map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate text-slate-700">{item.name}</span>
            <span className="font-semibold text-slate-950">{item.currentStock}</span>
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
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
      ) : (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
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
    <div className="rounded-[8px] border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-4">
        <p className="font-semibold text-slate-950">{title}</p>
        <p className="text-sm text-slate-600">{detail}</p>
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
                    <div className="text-xs text-slate-500">
                      {item.batchNumber || item.sku || '-'}
                    </div>
                  </TableCell>
                  <TableCell>{item.storageLocation || 'Unmapped'}</TableCell>
                  <TableCell className="text-right">
                    {mode === 'expiry'
                      ? formatDateOnly(item.expiryDate)
                      : suggestedOrder(item)}
                  </TableCell>
                  <TableCell className="text-right">
                    {Math.round(daysOfCover(item))}d
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-slate-500">
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

function formatDateOnly(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function getApiErrorMessage(error: unknown, fallback: string) {
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { body?: { message?: string }; message?: string };
    return candidate.body?.message || candidate.message || fallback;
  }
  return fallback;
}
