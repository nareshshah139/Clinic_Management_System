export type InventoryItemRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface ItemRequestPerson {
  id: string;
  firstName: string;
  lastName: string;
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
