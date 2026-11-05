export type StatusVariant = 'success' | 'warning' | 'info' | 'neutral' | 'danger';
export type StatusDomain = 'appointment' | 'visit' | 'invoice' | 'stock' | 'prescription' | 'room' | 'workflow' | 'priority' | 'confidence';

const statuses: Record<StatusDomain, Readonly<Record<string, StatusVariant>>> = {
  appointment: { SCHEDULED: 'info', CONFIRMED: 'info', CHECKED_IN: 'warning', IN_PROGRESS: 'warning', COMPLETED: 'success', CANCELLED: 'neutral', NO_SHOW: 'danger', RESCHEDULED: 'info' },
  visit: { DRAFT: 'neutral', SCHEDULED: 'info', WAITING: 'warning', IN_PROGRESS: 'warning', COMPLETED: 'success', SIGNED: 'success', CANCELLED: 'neutral' },
  invoice: { CONFIRMED: 'info', FAILED: 'danger', DRAFT: 'neutral', PENDING: 'warning', UNPAID: 'warning', PARTIALLY_PAID: 'warning', PARTIAL: 'warning', PAID: 'success', COMPLETED: 'success', DISPENSED: 'info', OVERDUE: 'danger', CANCELLED: 'neutral', REFUNDED: 'info', VOID: 'neutral' },
  stock: { UNMATCHED: 'neutral', IN_STOCK: 'success', AVAILABLE: 'success', NORMAL: 'success', LOW_STOCK: 'warning', LOW: 'warning', EXPIRING: 'warning', OUT_OF_STOCK: 'danger', OUT: 'danger', EXPIRED: 'danger', CRITICAL: 'danger' },
  prescription: { PARTIAL: 'warning', EXPIRED: 'danger', DRAFT: 'neutral', PENDING: 'warning', PARTIALLY_DISPENSED: 'warning', READY: 'info', DISPENSED: 'success', COMPLETED: 'success', CANCELLED: 'neutral' },
  room: { AVAILABLE: 'success', FREE: 'success', OCCUPIED: 'warning', BOOKED: 'info', RESERVED: 'info', MAINTENANCE: 'danger', CLEANING: 'warning', INACTIVE: 'neutral' },
  workflow: { SUBMITTED: 'info', STOCK_COMMITTED: 'success', PARTIAL_STOCK_COMMITTED: 'warning', RECONCILIATION_REQUIRED: 'danger', DRAFT: 'neutral', PENDING: 'warning', IN_PROGRESS: 'info', APPROVED: 'success', POSTED: 'success', COMPLETED: 'success', CANCELLED: 'neutral', REJECTED: 'danger', FAILED: 'danger', ERROR: 'danger' },
  priority: { CRITICAL: 'danger', HIGH: 'warning', MEDIUM: 'warning', LOW: 'neutral' },
  confidence: { HIGH: 'success', MEDIUM: 'info', LOW: 'warning', COLD_START: 'neutral' },
};

/**
 * @cc [owner:nareshshah139,label:product] domain-status-meaning
 * Status styling MUST use the supplied domain. Unknown or missing statuses MUST
 * return neutral, never imply success. Case, spaces and hyphens are normalized.
 */
export function statusVariant(domain: StatusDomain, status: string | null | undefined): StatusVariant {
  return statuses[domain][status?.trim().toUpperCase().replace(/[\s-]+/g, '_') ?? ''] ?? 'neutral';
}
