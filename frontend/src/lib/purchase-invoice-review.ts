export type PurchaseReviewIssue = {
  key: string;
  message: string;
  label: string;
  help: string;
  field?: string;
  target?: string;
  lineIndex?: number;
  requiresUpload?: boolean;
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

export function purchaseReviewIssue(raw: string, lineIndex?: number): PurchaseReviewIssue {
  const text = raw.trim().replace(/^(?:(?:AUTO|OCR):\s*)+/i, '');
  const line = /^Line (\d+):\s*/i.exec(text);
  const index = line ? Number(line[1]) - 1 : lineIndex;
  const body = line ? text.slice(line[0].length) : text;
  const prefix = index === undefined ? '' : `Line ${index + 1}: `;
  const base = { lineIndex: index, key: `${index ?? 'header'}:${body.toLowerCase()}` };
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
    return { ...base, key: `${index ?? 'header'}:confidence`, label: 'invoice details',
      message: `${prefix}A person needs to check the OCR reading.`,
      help: 'Check the original, correct the details and resolve the other issues. Save corrections, then use Mark Reviewed. The model confidence score stays unchanged.' };
  }
  if (/active saved supplier|matching name and GSTIN|saved supplier/i.test(body)) {
    return { ...base, key: `${index ?? 'header'}:supplier-match`, label: 'saved supplier', target: 'saved-purchase-supplier',
      message: 'Automatic intake could not match the supplier.',
      help: 'Use Supplier in the review checklist: check the name and GSTIN, then select an existing supplier or Save verified supplier. Save & Process checks the invoice again. Manual review is also available without saving a supplier.' };
  }
  if (/product master|drug master|master record/i.test(body)) {
    return { ...base, label: 'product match', target: 'purchase-master-matching', message: `${prefix}Confirm the product record.`,
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
    return { ...base, label: index === undefined ? 'invoice totals' : 'product amounts',
      target: index === undefined ? 'purchase-totals' : 'purchase-line-items',
      message: prefix + body,
      help: 'Compare the quantities, rates, discounts, taxes and printed amounts with the original. Correct the affected values, then Save & Process to check them again.' };
  }
  return { ...base, label: 'invoice details', message: prefix + body.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2'),
    help: 'Check the original invoice, correct the affected details, then save corrections to refresh the checks.' };
}

export function uniquePurchaseReviewIssues(issues: string[]) {
  return [...new Map(purchaseBlockingIssues(issues).map(raw => {
    const issue = purchaseReviewIssue(raw);
    return [issue.key, issue];
  })).values()];
}
