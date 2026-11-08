export interface DuplicateInventoryItem {
  id: string;
  name: string;
  manufacturer: string | null;
  unit: string;
  packSize: number | null;
  packUnit: string | null;
  batchNumber: string | null;
  currentStock: number;
  matchedOn: Array<'name' | 'sku' | 'barcode'>;
}

export interface DuplicatePendingRequest {
  id: string;
  requestedBy: string;
  createdAt: Date;
}

export interface PossibleDuplicates {
  inventory: DuplicateInventoryItem[];
  pendingRequests: DuplicatePendingRequest[];
}

export interface DuplicateProbe {
  id: string;
  itemName: string;
  sku?: string | null;
  barcode?: string | null;
}

export function normalizeItemName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function firstNameToken(name: string): string {
  return normalizeItemName(name).split(' ')[0] ?? '';
}

export function probeOf(request: {
  id: string;
  itemName: string;
  payload: unknown;
}): DuplicateProbe {
  const payload = (request.payload ?? {}) as { sku?: unknown; barcode?: unknown };
  return {
    id: request.id,
    itemName: request.itemName,
    sku: typeof payload.sku === 'string' && payload.sku ? payload.sku : null,
    barcode: typeof payload.barcode === 'string' && payload.barcode ? payload.barcode : null,
  };
}

export function matchInventory(
  probe: DuplicateProbe,
  items: Array<Omit<DuplicateInventoryItem, 'matchedOn'> & { sku: string | null; barcode: string | null }>,
): DuplicateInventoryItem[] {
  const wanted = normalizeItemName(probe.itemName);
  return items.flatMap(({ sku, barcode, ...item }) => {
    const matchedOn: DuplicateInventoryItem['matchedOn'] = [];
    if (normalizeItemName(item.name) === wanted) matchedOn.push('name');
    if (probe.sku && sku === probe.sku) matchedOn.push('sku');
    if (probe.barcode && barcode === probe.barcode) matchedOn.push('barcode');
    return matchedOn.length ? [{ ...item, matchedOn }] : [];
  });
}

export function matchPendingRequests(
  probe: DuplicateProbe,
  pending: Array<{ id: string; itemName: string; createdAt: Date; requestedBy: { firstName: string; lastName: string } }>,
): DuplicatePendingRequest[] {
  const wanted = normalizeItemName(probe.itemName);
  return pending
    .filter((p) => p.id !== probe.id && normalizeItemName(p.itemName) === wanted)
    .map((p) => ({
      id: p.id,
      requestedBy: `${p.requestedBy.firstName} ${p.requestedBy.lastName}`.trim(),
      createdAt: p.createdAt,
    }));
}
