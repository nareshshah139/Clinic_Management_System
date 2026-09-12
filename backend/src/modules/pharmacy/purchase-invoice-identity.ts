export const normalizedIdentity = (value: unknown) => String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// Preserve pack dimensions: 30 ML is distinct from 30 tablets or 30 G.
export function canonicalPurchasePack(size: string, unit = ''): string {
  let value = size.toUpperCase().replace(/\s+/g, '').replace(/GRAMS?|GMS?/g, 'G').replace(/MILLILIT(?:RE|ER)S?/g, 'ML');
  if (/^\d+(\.\d+)?$/.test(value) && /^(ML|G|GM|GMS)$/i.test(unit)) value += unit.toUpperCase().replace(/GMS?/, 'G');
  return value.replace(/^(STRIPOF|PACKOF)/, '').replace(/^1X/, '').replace(/('S|S|TABLETS?|CAPSULES?)$/, '');
}

export function verifyPurchaseRead(draft: any, verification: any) {
  const flags: string[] = [];
  for (const field of ['distributorGstin', 'invoiceNumber', 'invoiceDate']) {
    if (!verification?.[field] || normalizedIdentity(draft[field]) !== normalizedIdentity(verification[field])) {
      flags.push(`independent_read_disagrees_${field}`);
    }
  }
  if (verification?.complete !== true) flags.push('document_completeness_unconfirmed');
  if (verification?.netPayable == null || Number(verification.netPayable) !== Number(draft.netPayable)) flags.push('independent_read_disagrees_netPayable');
  if (!Array.isArray(verification?.items) || verification.items.length !== draft.items.length) flags.push('independent_read_disagrees_row_count');
  const items = draft.items.map((item: any, index: number) => {
    const other = verification?.items?.[index];
    const itemFlags = [...(item.ocrFlags || [])];
    for (const key of ['batchNumber', 'expiryMonth', 'expiryYear', 'quantityPurchased', 'freeQuantity', 'mrp', 'purchaseRate']) {
      const equal = key === 'batchNumber'
        ? normalizedIdentity(item[key]) === normalizedIdentity(other?.[key])
        : Number(item[key] ?? 0) === Number(other?.[key]);
      if (other?.[key] == null || !equal) itemFlags.push(`independent_read_disagrees_${key}`);
    }
    return { ...item, ocrFlags: [...new Set(itemFlags)] };
  });
  return { ...draft, items, ocrFlags: [...new Set([...(draft.ocrFlags || []), ...flags])] };
}
