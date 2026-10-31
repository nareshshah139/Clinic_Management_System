import { catalogueFields, catalogueFieldLabels } from './purchase-invoice-catalogue';
import { purchaseReviewIssue, purchaseReviewField, type PurchaseReviewIssue } from './purchase-invoice-review';

export type PurchaseAttempt = Readonly<{
  generation: number;
  scope: string;
  invoiceId?: string;
  revision?: string;
  lineKeys: readonly string[];
}>;

type ExistingPurchaseInvoice = Readonly<{ id: string; invoiceNumber: string; distributorName: string; status: string; workflowReceiptId?: string | null }>;

type RecoveryBase = Readonly<{ message: string; attempt: PurchaseAttempt; reference?: string }>;
export type PurchaseRecovery = RecoveryBase & (
  | { kind: 'duplicate' | 'receipt'; existingInvoiceId?: string; existingInvoice?: ExistingPurchaseInvoice }
  | { kind: 'review' | 'catalogue'; issues: readonly PurchaseReviewIssue[] }
  | { kind: 'stale' | 'locked' | 'permission' | 'unknown' }
);
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const safeId = (value: unknown) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value) ? value : undefined;

/**
 * @cc [owner:nareshshah139,label:state;security] purchase-recovery-error-boundary
 * Unknown API bodies MUST remain non-mutating recovery messages. Only recognized structured conflicts with a valid identifier MAY offer a saved-invoice comparison; saved summaries MUST match that identifier and a known status; review targets MUST use the existing field registry.
 */
export function purchaseRecovery(error: unknown, attempt: PurchaseAttempt): PurchaseRecovery {
  const outer = record(error), body = record(outer.body);
  const message = typeof body.message === 'string' ? body.message : typeof outer.message === 'string' ? outer.message : 'The purchase could not be completed. Check the saved status before trying again.';
  const base = { message, attempt, reference: safeId(body.requestId) || safeId(outer.requestId) };
  if (outer.status === 403) return { ...base, kind: 'permission' };
  if (['PURCHASE_DUPLICATE_INVOICE', 'PURCHASE_RECEIPT_ALREADY_LINKED', 'PURCHASE_SOURCE_ALREADY_LINKED'].includes(String(body.code))) {
    const existingInvoiceId = safeId(body.existingInvoiceId);
    const saved = record(body.existingInvoice);
    const existingInvoice: ExistingPurchaseInvoice | undefined = existingInvoiceId && saved.id === existingInvoiceId &&
      typeof saved.invoiceNumber === 'string' && typeof saved.distributorName === 'string' &&
      typeof saved.status === 'string' && ['DRAFT', 'OCR_REVIEW_REQUIRED', 'RECONCILIATION_FAILED', 'REVIEWED', 'STOCK_COMMITTED', 'CANCELLED'].includes(saved.status)
      ? { id: existingInvoiceId, invoiceNumber: saved.invoiceNumber, distributorName: saved.distributorName, status: saved.status, workflowReceiptId: safeId(saved.workflowReceiptId) || null } : undefined;
    return { ...base, kind: body.code === 'PURCHASE_RECEIPT_ALREADY_LINKED' ? 'receipt' : 'duplicate', existingInvoiceId, ...(existingInvoice ? { existingInvoice } : {}) };
  }
  if (body.code === 'PURCHASE_STALE_REVISION') return { ...base, kind: 'stale' };
  if (body.code === 'PURCHASE_LOCKED') return { ...base, kind: 'locked' };
  if (body.code === 'PURCHASE_REVIEW_REQUIRED' || body.code === 'PURCHASE_CATALOG_REVIEW_REQUIRED') {
    const rawIssues = Array.isArray(body.issues) && body.issues.length ? body.issues : [{ ...body, message }];
    const issues = rawIssues.flatMap(value => {
      const item = record(value);
      const text = typeof value === 'string' ? value : typeof item.message === 'string' ? item.message : undefined;
      if (!text) return [];
      const structuredIndex = typeof item.lineNumber === 'number' && Number.isInteger(item.lineNumber) && item.lineNumber > 0 ? item.lineNumber - 1 : undefined;
      const issue = purchaseReviewIssue(text, structuredIndex);
      const lineIndex = structuredIndex ?? issue.lineIndex;
      if (body.code === 'PURCHASE_CATALOG_REVIEW_REQUIRED' && ['missing', 'ambiguous', 'incomplete'].includes(String(item.reason))) {
        const missingFields = catalogueFields(item.missingFields);
        return [{ ...issue, lineIndex, category: 'product' as const, label: 'product details', target: 'purchase-master-matching',
          catalogueReason: item.reason as 'missing' | 'ambiguous' | 'incomplete', missingFields,
          message: item.reason === 'incomplete' && missingFields.length ? `${lineIndex === undefined ? '' : `Line ${lineIndex + 1}: `}Saved product is missing ${missingFields.map(field => catalogueFieldLabels[field]).join(', ')}.` : text,
        }];
      }
      const field = typeof item.field === 'string' ? purchaseReviewField(item.field, lineIndex) : undefined;
      return [{ ...issue, ...field, ...(lineIndex !== undefined ? { lineIndex } : {}) }];
    });
    return { ...base, kind: body.code === 'PURCHASE_REVIEW_REQUIRED' ? 'review' : 'catalogue', issues };
  }
  return { ...base, kind: 'unknown' };
}

export function purchaseRecoveryTarget(issue: PurchaseReviewIssue, lineKeys: readonly string[]) {
  if (issue.lineIndex !== undefined && issue.field) return lineKeys[issue.lineIndex] ? `${lineKeys[issue.lineIndex]}-${issue.target}` : undefined;
  return issue.target;
}

/**
 * @cc [owner:nareshshah139,label:state] purchase-saved-status-proof
 * Stock readback MUST reject wrong identities, missing line data, unknown statuses and malformed revisions. A mutation response alone MUST NOT establish persisted stock success.
 */
export function isPurchaseReadback(value: unknown, id: string): boolean {
  const invoice = record(value);
  const posted = invoice.stockCommittedAt !== null && invoice.stockCommittedAt !== undefined;
  if (posted && (invoice.status !== 'STOCK_COMMITTED' || typeof invoice.stockCommittedAt !== 'string' || !Number.isFinite(Date.parse(invoice.stockCommittedAt)))) return false;
  if (invoice.status === 'STOCK_COMMITTED' && !posted) return false;
  return invoice.id === id && typeof invoice.status === 'string' && ['DRAFT', 'OCR_REVIEW_REQUIRED', 'RECONCILIATION_FAILED', 'REVIEWED', 'STOCK_COMMITTED', 'CANCELLED'].includes(invoice.status) && Array.isArray(invoice.items) && typeof invoice.updatedAt === 'string' && Number.isFinite(Date.parse(invoice.updatedAt));
}

export function canCorrectPurchase(invoice: { status?: string; stockCommittedAt?: unknown }) {
  return !invoice.stockCommittedAt && ['DRAFT', 'OCR_REVIEW_REQUIRED', 'RECONCILIATION_FAILED'].includes(invoice.status || '');
}

export type PurchaseDifference = { label: string; local: string; saved: string };
const printable = (value: unknown) => value === null || value === undefined || value === '' ? 'Not recorded' : String(value);

/**
 * @cc [owner:nareshshah139,label:product] purchase-comparison-no-mutation
 * Comparing draft values MUST leave both snapshots unchanged and show changed header and line values, including added or removed lines.
 */
export function purchaseDifferences(local: { header: Record<string, unknown>; lines: readonly Record<string, unknown>[] }, saved: { header: Record<string, unknown>; lines: readonly Record<string, unknown>[] }): PurchaseDifference[] {
  const result: PurchaseDifference[] = [];
  const compare = (a: Record<string, unknown>, b: Record<string, unknown>, prefix = '') => {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (['localId', 'id', 'lineNumber', 'ocrSourceRef', 'ocrFlags', 'ocrConfidence'].includes(key)) continue;
      if (printable(a[key]) !== printable(b[key])) result.push({ label: `${prefix}${key.replace(/([A-Z])/g, ' $1').toLowerCase()}`, local: printable(a[key]), saved: printable(b[key]) });
    }
  };
  compare(local.header, saved.header);
  for (let i = 0; i < Math.max(local.lines.length, saved.lines.length); i++) compare(local.lines[i] || {}, saved.lines[i] || {}, `Line ${i + 1} `);
  return result;
}
