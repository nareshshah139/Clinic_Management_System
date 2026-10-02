export type PurchaseReviewIssue = {
  key: string;
  message: string;
  label: string;
  help: string;
  field?: string;
  target?: string;
  lineIndex?: number;
  requiresUpload?: boolean;
  category?: 'manual' | 'supplier' | 'product' | 'totals' | 'historical';
};

export function purchaseBlockingIssues(issues: string[]) {
  return issues.filter(raw => {
    const body = raw.trim().replace(/^(?:(?:AUTO|OCR):\s*|Line \d+:\s*)+/i, '');
    return !!body && !/^(?:missing[_\s-]+manufacturer|manufacturer (?:is )?(?:missing|required(?: before review)?))\.?$/i.test(body);
  });
}

const fields = [
  ['billType', 'bill type', 'bill-type', /bill.?type|cash or credit/i],
  ['distributorGstin', 'supplier GSTIN', 'distributor-gstin', /distributor.?gstin|supplier.*gstin/i],
  ['distributorName', 'supplier', 'distributor-name', /distributor.?name/i],
  ['distributorDlNo', 'supplier drug license', 'distributor-dl', /distributor.?dl/i],
  ['invoiceNumber', 'invoice number', 'invoice-number', /invoice.?number/i],
  ['invoiceDate', 'invoice date', 'invoice-date', /invoice.?date/i],
  ['goodsReceivedDate', 'goods received date', 'goods-date', /goods.?received/i],
  ['dueDate', 'due date', 'due-date', /due.?date/i],
  ['manufacturer', 'manufacturer', 'manufacturer', /manufacturer/i],
  ['packUnitType', 'stock unit', 'unit', /pack.?unit.?type|stock unit/i],
  ['packSize', 'pack size', 'pack-size', /pack.?size/i],
  ['productName', 'product', 'product', /product.?name/i],
  ['hsnCode', 'HSN', 'hsn', /hsn/i],
  ['batchNumber', 'batch', 'batch', /batch/i],
  ['expiryMonth', 'expiry', 'expiry-month', /expiry/i],
  ['freeQuantity', 'free quantity', 'free-qty', /free.?quantity/i],
  ['quantityPurchased', 'purchased quantity', 'qty', /quantity.?purchased/i],
  ['purchaseRate', 'purchase rate', 'rate', /purchase.?rate/i],
  ['mrp', 'MRP', 'mrp', /mrp/i],
] as const;

/**
 * @cc [owner:nareshshah139,label:product] purchase-blocker-explanation
 * Known review issues MUST retain their specific cause and correction path. Supplier GSTIN
 * mismatches and missing product fields MUST NOT become generic matching instructions;
 * historical-stock holds MUST NOT recommend posting the invoice as a new receipt.
 */
export function purchaseReviewIssue(raw: string, lineIndex?: number): PurchaseReviewIssue {
  const text = raw.trim().replace(/^(?:(?:AUTO|OCR):\s*)+/i, '');
  const line = /^Line (\d+):\s*/i.exec(text);
  const index = line ? Number(line[1]) - 1 : lineIndex;
  const body = line ? text.slice(line[0].length) : text;
  const prefix = index === undefined ? '' : `Line ${index + 1}: `;
  const base = { lineIndex: index, key: `${index ?? 'header'}:${body.toLowerCase()}` };
  if (/historical invoice|historical before.*stock|already.*inventory backfill/i.test(body)) {
    return { ...base, category: 'historical', label: 'historical stock',
      message: 'This invoice may already be included in opening stock.',
      help: 'Ask an inventory administrator to compare this bill with the stock backfill and reconcile it as historical. Do not add it as a new receipt.' };
  }
  if (/Supplier GSTIN does not match the saved supplier/i.test(body)) {
    const savedGstin = /saved supplier\s*\(([^)]+)\)/i.exec(body)?.[1];
    return { ...base, category: 'supplier', key: `${index ?? 'header'}:supplier-gstin-mismatch`,
      label: 'supplier GSTIN', target: 'distributor-gstin',
      message: 'Invoice GSTIN differs from the saved supplier.',
      help: `${savedGstin ? `Saved supplier GSTIN: ${savedGstin}. ` : ''}Check both against the original. Correct the invoice if it was misread, or use Correct saved GSTIN if the supplier record is wrong. That action requires supplier-update permission. Do not change a verified GSTIN just to make it match.` };
  }
  if (/independent_read_disagrees_row_count/i.test(body)) {
    return { ...base, label: 'line items', target: 'purchase-line-items', message: 'The OCR reads disagree on the number of invoice rows.',
      help: 'Count every row against the original, including repeated products with different batches. Restore missing rows or remove extra rows before confirming this check.' };
  }
  if (/missing.?pages|document_completeness|cropped.*rows|not_a_purchase_invoice/i.test(body)) {
    return { ...base, key: `${index ?? 'header'}:pages`, label: 'complete invoice', requiresUpload: true,
      message: `${prefix}The complete invoice could not be verified.`, target: 'purchase-invoice-upload',
      help: 'Upload a clear file containing every invoice page, then extract it again before approving stock.' };
  }
  if (/confidence|independent_read_unavailable/i.test(body)) {
    return { ...base, category: 'manual', key: `${index ?? 'header'}:confidence`, label: 'invoice details',
      message: `${prefix}A person needs to check the OCR reading.`,
      help: 'Check these details against the original and resolve any corrections first. Then confirm the final review. Retrying automatic processing does not change the original confidence score.' };
  }
  if (/active saved supplier|matching name and GSTIN|saved supplier/i.test(body)) {
    return { ...base, category: 'supplier', key: `${index ?? 'header'}:supplier-match`, label: 'saved supplier', target: 'saved-purchase-supplier',
      message: 'Automatic intake could not match the supplier.',
      help: 'Use Supplier in the review checklist: check the name and GSTIN, then select an existing supplier or Save verified supplier. Save & Process checks the invoice again. Manual review is also available without saving a supplier.' };
  }
  if (/product master|drug master|master record/i.test(body)) {
    const missing = /; missing (.+)$/i.exec(body)?.[1];
    if (missing) {
      const labels: Record<string, string> = { composition1: 'composition', category: 'category', dosageForm: 'dosage form', strength: 'strength' };
      const fields = missing.split(',').map(field => labels[field.trim()] || field.trim()).join(', ');
      return { ...base, category: 'product', label: 'product details', target: 'purchase-master-matching',
        message: `${prefix}Saved product is missing ${fields}.`,
        help: 'Open Check or correct saved product details. Verify the product kind first: medicines require clinical details; cosmetics and consumables do not require composition or strength. Enter verified details, save the product, then check the invoice again.' };
    }
    return { ...base, category: 'product', label: 'product match', target: 'purchase-master-matching', message: `${prefix}Confirm the product record.`,
      help: 'Refresh Matches and confirm the correct product and pack. Manufacturer is optional, but can help distinguish similar products. Create a new product only when no matching record exists. Choose its product kind and known details here. For an incomplete saved record, use Check or correct saved product details.' };
  }
  const match = fields.find(([, , , pattern]) => pattern.test(body));
  if (match) {
    const [field, label, target] = match;
    const missing = /missing|required/i.test(body);
    const message = missing ? `${label[0].toUpperCase()}${label.slice(1)} is missing.` : `Check ${label}.`;
    let help = `Compare ${label} with the original invoice and correct it before confirming it is checked.`;
    if (field === 'billType') help = 'APPROVAL BILLS does not establish payment terms. Confirm the agreed terms, choose Cash or Credit, and enter a due date for Credit.';
    if (field === 'distributorGstin') help = 'Check the supplier GSTIN character by character against the original and the saved supplier. Do not use the buyer GSTIN.';
    if (field === 'manufacturer') help = 'Manufacturer is optional. Compare it with the original and correct it if known, or leave it blank before confirming this check.';
    if (field === 'packUnitType') help = 'Enter the stock unit for the purchased pack, such as Bottle, Tube or Strip. Check the product packaging or saved product.';
    return { ...base, key: `${index ?? 'header'}:${field}:${missing ? 'missing' : 'check'}`,
      field, label, target, message: prefix + message, help };
  }
  if (/total|taxable|gst|discount|rounding|rate|quantity/i.test(body)) {
    return { ...base, category: 'totals', label: index === undefined ? 'invoice totals' : 'product amounts',
      target: index === undefined ? 'purchase-totals' : 'purchase-line-items',
      message: prefix + body,
      help: 'Compare the quantities, rates, discounts, taxes and printed amounts with the original. Correct the affected values, then Save & Process to check them again.' };
  }
  return { ...base, label: 'invoice details', message: prefix + body.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2'),
    help: 'Check the original invoice, correct the affected details, then save corrections to refresh the checks.' };
}

/**
 * @cc [owner:nareshshah139,label:product] purchase-status-explains-hold
 * A failed invoice MUST be labelled from its saved blockers: historical hold, totals check,
 * corrections or manual review. Missing or unknown reasons MUST remain a review state;
 * presentation MUST NOT change approval eligibility or claim stock was added.
 */
export function purchaseInvoiceStatusLabel(invoice: { status?: string; reconciliationIssues?: string[]; unresolvedOcrFlags?: number; workflowReceiptId?: string | null }) {
  if (invoice.status === 'STOCK_COMMITTED' && invoice.workflowReceiptId) return 'Invoice posted';
  if (invoice.status === 'REVIEWED' && invoice.workflowReceiptId) return 'Ready to post bill';
  if (['RECONCILIATION_FAILED', 'OCR_REVIEW_REQUIRED'].includes(invoice.status || '')) {
    const issues = uniquePurchaseReviewIssues(invoice.reconciliationIssues || []);
    if (issues.some(issue => issue.category === 'historical')) return 'Historical stock check';
    if (issues.some(issue => issue.category === 'totals')) return 'Check invoice totals';
    if (issues.length && !invoice.unresolvedOcrFlags && issues.every(issue => issue.category === 'manual' || issue.key === 'header:supplier-match')) return 'Needs manual review';
    return issues.length ? 'Needs corrections' : 'Needs review';
  }
  return ({ DRAFT: 'Draft', REVIEWED: 'Ready to add stock', STOCK_COMMITTED: 'Stock added', CANCELLED: 'Cancelled' } as Record<string, string>)[invoice.status || 'DRAFT'] || 'Needs review';
}

export function uniquePurchaseReviewIssues(issues: string[]) {
  return [...new Map(purchaseBlockingIssues(issues).map(raw => {
    const issue = purchaseReviewIssue(raw);
    return [issue.key, issue];
  })).values()];
}

export function groupPurchaseOcrFlags(flags:string[],lineIndex?:number) {
  const groups=new Map<string,string[]>();
  for(const flag of purchaseBlockingIssues(flags)) {
    const issue=purchaseReviewIssue(flag,lineIndex);
    const key=`${issue.lineIndex ?? 'header'}:${issue.field || issue.key}`;
    groups.set(key,[...(groups.get(key)||[]),flag]);
  }
  return [...groups.values()];
}
