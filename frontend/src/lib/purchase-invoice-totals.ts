type Fields = Record<string, unknown>;
export const reportedLineAmounts = { taxableAmount: 'Taxable', gstAmount: 'GST', lineTotal: 'Line total' };
export const reportedHeaderAmounts = { grossAmount: 'Gross', taxableAmount: 'Taxable', totalCgst: 'CGST', totalSgst: 'SGST', totalIgst: 'IGST', totalGst: 'GST total', netPayable: 'Net payable' };
export function reportedAmountErrors(original: Fields | null): string[] {
  if (!original) return [];
  const check = (values: Fields, labels: Fields, prefix: string) => Object.entries(labels).flatMap(([key, label]) => {
    const value = values[key];
    if (value === undefined || value === null) return [];
    return value === '' || !Number.isFinite(Number(value)) || Number(value) < 0 ? [`${prefix} ${label}: enter a non-negative amount from the invoice.`] : [];
  });
  return [...check(original, reportedHeaderAmounts, 'Reported'),
    ...(Array.isArray(original.items) ? original.items.flatMap((item: Fields, index: number) => check(item, reportedLineAmounts, `Line ${index + 1} reported`)) : [])];
}
const copyAmounts = (target: Fields, source: Fields, keys: string[]) => {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== '' && Number.isFinite(Number(value))) target[key] = Number(value);
  }
};

// Reported amounts are evidence from the document, independent of calculations.
// A changed quantity/rate must produce a mismatch until the reported value is
// explicitly corrected, including when rows are added or removed.
export function preserveInvoiceTotals(payload: Fields, original: Fields | null): Fields {
  if (!original) return payload;
  const previous: Fields[] = Array.isArray(original.items) ? original.items : [];
  const items = Array.isArray(payload.items) ? payload.items.map((item: Fields, index: number) => {
    const next = { ...item };
    if (previous[index]) copyAmounts(next, previous[index], Object.keys(reportedLineAmounts));
    return next;
  }) : payload.items;
  const result = { ...payload, items };
  copyAmounts(result, original, Object.keys(reportedHeaderAmounts));
  return result;
}
