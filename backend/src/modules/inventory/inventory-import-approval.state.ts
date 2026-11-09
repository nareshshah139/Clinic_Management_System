import { InventoryImportApproval } from '@prisma/client';
import { canReviewItemRequests } from './inventory-item-request.state';

export type ImportReviewAction = 'approve' | 'reject';
type Uploader = 'approver' | 'staff';

const ON_UPLOAD: Record<
  InventoryImportApproval,
  Record<Uploader, InventoryImportApproval>
> = {
  NOT_REQUIRED: { approver: 'NOT_REQUIRED', staff: 'NOT_REQUIRED' },
  PENDING: { approver: 'PENDING', staff: 'PENDING' },
  APPROVED: { approver: 'APPROVED', staff: 'APPROVED' },
  REJECTED: { approver: 'APPROVED', staff: 'PENDING' },
};

const ON_REVIEW: Record<
  InventoryImportApproval,
  Partial<Record<ImportReviewAction, InventoryImportApproval>>
> = {
  NOT_REQUIRED: {},
  PENDING: { approve: 'APPROVED', reject: 'REJECTED' },
  APPROVED: {},
  REJECTED: {},
};

const uploaderOf = (role: string): Uploader =>
  canReviewItemRequests(role) ? 'approver' : 'staff';

export function newImportApproval(role: string): InventoryImportApproval {
  return uploaderOf(role) === 'approver' ? 'NOT_REQUIRED' : 'PENDING';
}

export function importApprovalOnUpload(
  current: InventoryImportApproval,
  role: string,
): InventoryImportApproval {
  return ON_UPLOAD[current][uploaderOf(role)];
}

export function nextImportApproval(
  current: InventoryImportApproval,
  action: ImportReviewAction,
): InventoryImportApproval | null {
  return ON_REVIEW[current][action] ?? null;
}

const ROWS_BLOCKED: Partial<
  Record<InventoryImportApproval, (note: string | null) => string>
> = {
  PENDING: () => "This import is waiting for a doctor's approval",
  REJECTED: (note) => `This import was rejected: ${note ?? ''}`,
};

export function importRowsMayRun(approval: InventoryImportApproval): boolean {
  return !ROWS_BLOCKED[approval];
}

export function importRowsBlockedReason(
  approval: InventoryImportApproval,
  note: string | null,
): string | null {
  return ROWS_BLOCKED[approval]?.(note) ?? null;
}
