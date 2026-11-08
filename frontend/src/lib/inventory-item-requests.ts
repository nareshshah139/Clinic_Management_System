export type InventoryItemRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface ItemRequestPerson {
  id: string;
  firstName: string;
  lastName: string;
}

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
  createdAt: string;
}

export interface PossibleDuplicates {
  inventory: DuplicateInventoryItem[];
  pendingRequests: DuplicatePendingRequest[];
}

export interface InventoryItemRequest {
  id: string;
  status: InventoryItemRequestStatus;
  itemName: string;
  payload: Record<string, unknown>;
  reviewNote: string | null;
  inventoryItemId: string | null;
  reviewedAt: string | null;
  createdAt: string;
  requestedBy: ItemRequestPerson;
  reviewedBy: ItemRequestPerson | null;
  possibleDuplicates?: PossibleDuplicates | null;
}

export interface PendingApprovalResponse {
  status: 'PENDING_APPROVAL';
  request: InventoryItemRequest;
}

export function isPendingApproval(response: unknown): response is PendingApprovalResponse {
  return (
    typeof response === 'object' &&
    response !== null &&
    (response as { status?: unknown }).status === 'PENDING_APPROVAL'
  );
}

export const ITEM_REQUEST_APPROVER_ROLES = ['DOCTOR', 'ADMIN', 'OWNER'];

const FIELD_LABELS: Array<[string, string]> = [
  ['manufacturer', 'Manufacturer'],
  ['genericName', 'Generic name'],
  ['type', 'Type'],
  ['category', 'Category'],
  ['unit', 'Unit'],
  ['packSize', 'Pack size'],
  ['packUnit', 'Pack unit'],
  ['batchNumber', 'Batch'],
  ['expiryDate', 'Expiry'],
  ['mrp', 'MRP'],
  ['costPrice', 'Cost price'],
  ['sellingPrice', 'Selling price'],
  ['gstRate', 'GST %'],
  ['hsnCode', 'HSN'],
  ['sku', 'SKU'],
  ['barcode', 'Barcode'],
  ['supplier', 'Supplier'],
  ['minStockLevel', 'Min stock'],
  ['reorderLevel', 'Reorder level'],
  ['requiresPrescription', 'Prescription only'],
  ['isControlled', 'Controlled'],
];

export function describeItemRequestPayload(payload: Record<string, unknown>): Array<{ label: string; value: string }> {
  return FIELD_LABELS.flatMap(([key, label]) => {
    const raw = payload[key];
    if (raw === undefined || raw === null || raw === '') return [];
    if (typeof raw === 'boolean') return raw ? [{ label, value: 'Yes' }] : [];
    const value = key === 'expiryDate' ? String(raw).slice(0, 10) : String(raw);
    return [{ label, value }];
  });
}

export function personName(person: ItemRequestPerson | null): string {
  return person ? `${person.firstName} ${person.lastName}`.trim() : '';
}

const MATCH_LABEL = { name: 'same name', sku: 'same SKU', barcode: 'same barcode' } as const;

export function hasPossibleDuplicates(duplicates?: PossibleDuplicates | null): duplicates is PossibleDuplicates {
  return !!duplicates && (duplicates.inventory.length > 0 || duplicates.pendingRequests.length > 0);
}

export function describePossibleDuplicates(
  duplicates: PossibleDuplicates,
  formatDate: (iso: string) => string,
): { inventoryHeading: string; inventory: string[]; pending: string[] } {
  const count = duplicates.inventory.length;
  return {
    inventoryHeading: count ? `Already in inventory (${count} ${count === 1 ? 'batch' : 'batches'})` : '',
    inventory: duplicates.inventory.map(item => [
      item.name,
      item.manufacturer,
      item.packSize ? `${item.packSize}${item.packUnit ? ` ${item.packUnit}` : ''} pack` : null,
      item.batchNumber ? `batch ${item.batchNumber}` : null,
      `${item.currentStock} in stock`,
      item.matchedOn.map(m => MATCH_LABEL[m]).join(', '),
    ].filter(Boolean).join(' · ')),
    pending: duplicates.pendingRequests.map(r => `Also requested by ${r.requestedBy || 'staff'} on ${formatDate(r.createdAt)}`),
  };
}
