import type { ItemRequestPerson } from './inventory-item-requests';

export type ImportApprovalStatus = 'NOT_REQUIRED' | 'PENDING' | 'APPROVED' | 'REJECTED';

export interface ImportApproval {
  status: ImportApprovalStatus;
  requestedBy: ItemRequestPerson | null;
  reviewedBy: ItemRequestPerson | null;
  reviewedAt: string | null;
  note: string | null;
}

export interface InventoryImportSummary {
  status?: 'PENDING_APPROVAL';
  importId?: string;
  approval?: ImportApproval;
  totalRows: number;
  created: number;
  updated: number;
  skipped: number;
  drugsCreated: number;
  stockAdjusted: number;
  retryableRows?: number;
  pendingRows?: number;
  reconciliationRequired?: number;
  errors: Array<{ row: number; message: string }>;
}

export interface ImportPreviewRow {
  sourceRow: number;
  name?: string;
  batchNumber?: string;
  currentStock?: number;
  batch?: 'NEW' | 'EXISTING';
  existingStock?: number;
  error?: string;
}

export interface PendingInventoryImport {
  importId: string;
  fileName: string;
  createdAt: string;
  rowCount: number;
  approval: ImportApproval;
  rows: ImportPreviewRow[];
}

export interface ReviewedInventoryImport {
  importId: string;
  fileName: string;
  createdAt: string;
  rowCount: number;
  approval: ImportApproval;
}

export type ImportStage = 'awaiting-approval' | 'rejected' | 'results';

const STAGE_BY_APPROVAL: Record<ImportApprovalStatus, ImportStage> = {
  NOT_REQUIRED: 'results',
  APPROVED: 'results',
  PENDING: 'awaiting-approval',
  REJECTED: 'rejected',
};

export function importStage(summary: InventoryImportSummary): ImportStage {
  return summary.approval ? STAGE_BY_APPROVAL[summary.approval.status] : 'results';
}

const COUNTS = ['totalRows', 'created', 'updated', 'skipped', 'drugsCreated', 'stockAdjusted'] as const;

export function validateImportSummary(value: unknown, expectedId?: string): InventoryImportSummary {
  const summary = value as InventoryImportSummary | null;
  if (
    !summary ||
    typeof summary !== 'object' ||
    COUNTS.some(key => !Number.isInteger(summary[key]) || summary[key] < 0) ||
    (expectedId && summary.importId !== expectedId) ||
    summary.created + summary.updated + summary.skipped !== summary.totalRows ||
    !Array.isArray(summary.errors) ||
    summary.errors.some(error => !Number.isInteger(error.row) || typeof error.message !== 'string') ||
    (summary.approval !== undefined && !STAGE_BY_APPROVAL[summary.approval?.status as ImportApprovalStatus]) ||
    (summary.status === 'PENDING_APPROVAL' && importStage(summary) !== 'awaiting-approval')
  ) {
    throw new Error('The server did not confirm the import outcome.');
  }
  return summary;
}

export function describePreviewTarget(row: ImportPreviewRow): string {
  if (row.error) return 'Not importable';
  if (row.batch === 'EXISTING') return `Existing batch (${row.existingStock ?? 0} in stock)`;
  return 'New batch';
}
