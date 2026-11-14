import { humanizeEnum, normalizeEnum } from './labels';

export type StatusVariant = 'success' | 'warning' | 'info' | 'highlight' | 'neutral' | 'danger';
export type StatusDomain = 'appointment' | 'visit' | 'invoice' | 'dispense' | 'stock' | 'room' | 'workflow' | 'priority' | 'confidence';

type Presentation = readonly [StatusVariant, string];

const statuses: Record<StatusDomain, Readonly<Record<string, Presentation>>> = {
  appointment: {
    SCHEDULED: ['neutral', 'Scheduled'], CONFIRMED: ['info', 'Confirmed'], CHECKED_IN: ['warning', 'Checked in'],
    IN_PROGRESS: ['highlight', 'In consultation'], COMPLETED: ['success', 'Completed'], NO_SHOW: ['danger', 'No-show'],
    CANCELLED: ['neutral', 'Cancelled'], RESCHEDULED: ['info', 'Rescheduled'],
  },
  visit: {
    DRAFT: ['neutral', 'Draft'], SCHEDULED: ['info', 'Scheduled'], WAITING: ['warning', 'Waiting'], IN_PROGRESS: ['highlight', 'In progress'],
    COMPLETED: ['success', 'Completed'], SIGNED: ['success', 'Signed'], CANCELLED: ['neutral', 'Cancelled'],
  },
  invoice: {
    CONFIRMED: ['info', 'Confirmed'], FAILED: ['danger', 'Failed'], DRAFT: ['neutral', 'Draft'], PENDING: ['warning', 'Pending'],
    UNPAID: ['warning', 'Unpaid'], PARTIALLY_PAID: ['warning', 'Partly paid'], PARTIAL: ['warning', 'Partly paid'], PAID: ['success', 'Paid'],
    COMPLETED: ['success', 'Completed'], DISPENSED: ['info', 'Dispensed'], OVERDUE: ['danger', 'Overdue'], CANCELLED: ['neutral', 'Cancelled'],
    REFUNDED: ['info', 'Refunded'], VOID: ['neutral', 'Void'],
  },
  dispense: {
    QUEUED: ['neutral', 'Queued'], PENDING: ['neutral', 'Queued'], IN_REVIEW: ['info', 'In review'],
    PARTIALLY_FILLED: ['warning', 'Partly filled'], PARTIALLY_DISPENSED: ['warning', 'Partly filled'], PARTIAL: ['warning', 'Partly filled'],
    PAUSED: ['warning', 'Paused'], READY_TO_BILL: ['highlight', 'Ready to bill'], READY: ['highlight', 'Ready to bill'], PAID: ['info', 'Paid'],
    DISPENSED: ['success', 'Dispensed'], COMPLETED: ['success', 'Dispensed'], EXPIRED: ['danger', 'Expired'], CANCELLED: ['neutral', 'Cancelled'],
    DRAFT: ['neutral', 'Draft'],
  },
  stock: {
    UNMATCHED: ['neutral', 'Not linked'], IN_STOCK: ['success', 'In stock'], AVAILABLE: ['success', 'Available'], NORMAL: ['success', 'Normal'],
    LOW_STOCK: ['warning', 'Low stock'], LOW: ['warning', 'Low'], EXPIRING: ['warning', 'Expiring'], OUT_OF_STOCK: ['danger', 'Out of stock'],
    OUT: ['danger', 'Out'], EXPIRED: ['danger', 'Expired'], CRITICAL: ['danger', 'Critical'],
  },
  room: {
    AVAILABLE: ['success', 'Available'], FREE: ['success', 'Free'], OCCUPIED: ['warning', 'Occupied'], BOOKED: ['info', 'Booked'],
    RESERVED: ['info', 'Reserved'], MAINTENANCE: ['danger', 'Maintenance'], CLEANING: ['warning', 'Cleaning'], INACTIVE: ['neutral', 'Inactive'],
  },
  workflow: {
    SUBMITTED: ['info', 'Submitted'], STOCK_COMMITTED: ['success', 'Stock committed'], PARTIAL_STOCK_COMMITTED: ['warning', 'Partly committed'],
    RECONCILIATION_REQUIRED: ['danger', 'Needs reconciliation'], DRAFT: ['neutral', 'Draft'], PENDING: ['warning', 'Pending'],
    IN_PROGRESS: ['info', 'In progress'], APPROVED: ['success', 'Approved'], POSTED: ['success', 'Posted'], COMPLETED: ['success', 'Completed'],
    CANCELLED: ['neutral', 'Cancelled'], REJECTED: ['danger', 'Rejected'], FAILED: ['danger', 'Failed'], ERROR: ['danger', 'Error'],
  },
  priority: { CRITICAL: ['danger', 'Critical'], HIGH: ['warning', 'High'], MEDIUM: ['warning', 'Medium'], LOW: ['neutral', 'Low'] },
  confidence: { HIGH: ['success', 'High'], MEDIUM: ['info', 'Medium'], LOW: ['warning', 'Low'], COLD_START: ['neutral', 'Cold start'] },
};

const presentation = (domain: StatusDomain, status: string | null | undefined): Presentation | undefined => {
  const key = normalizeEnum(status);
  return Object.hasOwn(statuses[domain], key) ? statuses[domain][key] : undefined;
};

/**
 * @cc [owner:nareshshah139,label:product] domain-status-meaning
 * Status styling MUST use the supplied domain. Unknown or missing statuses MUST
 * return neutral, never imply success. Case, spaces and hyphens are normalized.
 */
export function statusVariant(domain: StatusDomain, status: string | null | undefined): StatusVariant {
  return presentation(domain, status)?.[0] ?? 'neutral';
}

/**
 * @cc [owner:nareshshah139,label:product] domain-status-label
 * Status text MUST be the domain's human label. An unknown status MUST read as
 * sentence-case words, never as a raw enum such as SCHEDULED or LOW_STOCK.
 */
export function statusLabel(domain: StatusDomain, status: string | null | undefined): string {
  return presentation(domain, status)?.[1] ?? humanizeEnum(status);
}
