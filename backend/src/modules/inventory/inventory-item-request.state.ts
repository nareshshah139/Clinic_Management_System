import { InventoryItemRequestStatus, UserRole } from '@prisma/client';

export type ItemRequestAction = 'approve' | 'reject';

export const ITEM_REQUEST_APPROVER_ROLES: readonly UserRole[] = [
  UserRole.DOCTOR,
  UserRole.ADMIN,
  UserRole.OWNER,
];

const TRANSITIONS: Record<
  InventoryItemRequestStatus,
  Partial<Record<ItemRequestAction, InventoryItemRequestStatus>>
> = {
  PENDING: { approve: 'APPROVED', reject: 'REJECTED' },
  APPROVED: {},
  REJECTED: {},
};

export function nextItemRequestStatus(
  from: InventoryItemRequestStatus,
  action: ItemRequestAction,
): InventoryItemRequestStatus | null {
  return TRANSITIONS[from][action] ?? null;
}

export function canReviewItemRequests(role: string): boolean {
  return ITEM_REQUEST_APPROVER_ROLES.includes(role as UserRole);
}
