export type SharedTermRow = {
  localId: string; productName: string; discountPercent: string; specialDiscountPercent: string;
  cgstPercent: string; sgstPercent: string; igstPercent: string;
};
export type SharedTerms = { kind: 'discount'; rate: string } | { kind: 'gst'; mode: 'split' | 'integrated'; rate: string };
export type SharedTermField = 'discountPercent' | 'cgstPercent' | 'sgstPercent' | 'igstPercent';
export type SharedTermPatch = { localId: string; productName: string; field: SharedTermField; before: string; after: string };
export type SharedTermPreview = { basis: string; selectedIds: string[]; patches: SharedTermPatch[] };

/**
 * @cc [owner:nareshshah139,label:product] selected-shared-terms
 * Only selected stable row IDs receive discount or all three GST components. Invalid percentages,
 * mixed GST and combined discounts above 100 MUST reject the whole preview without changing rows.
 */
export function previewPurchaseTerms(rows: readonly SharedTermRow[], selectedIds: readonly string[], terms: SharedTerms, basis: string): SharedTermPreview {
  const rate = Number(terms.rate);
  if (!terms.rate.trim() || !Number.isFinite(rate) || rate < 0 || rate > 100) throw new Error('Enter a percentage from 0 to 100.');
  const selected = [...new Set(selectedIds)];
  if (!selected.length || selected.some(id => !rows.some(row => row.localId === id))) throw new Error('Select current invoice rows.');
  const values: Partial<Record<SharedTermField, string>> = terms.kind === 'discount'
    ? { discountPercent: String(rate) }
    : { cgstPercent: terms.mode === 'split' ? String(rate / 2) : '0', sgstPercent: terms.mode === 'split' ? String(rate / 2) : '0', igstPercent: terms.mode === 'integrated' ? String(rate) : '0' };
  const patches: SharedTermPatch[] = [];
  for (const row of rows.filter(row => selected.includes(row.localId))) {
    const next = { ...row, ...values };
    for (const field of ['discountPercent', 'specialDiscountPercent', 'cgstPercent', 'sgstPercent', 'igstPercent'] as const) {
      const percentage = Number(next[field]);
      if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) throw new Error(`${row.productName}: ${field} must be a percentage from 0 to 100.`);
    }
    if (Number(next.discountPercent) + Number(next.specialDiscountPercent) > 100) throw new Error(`${row.productName}: combined discounts cannot exceed 100%.`);
    if (Number(next.igstPercent) > 0 && (Number(next.cgstPercent) > 0 || Number(next.sgstPercent) > 0)) throw new Error(`${row.productName}: use either IGST or CGST and SGST, not both.`);
    for (const [field, after] of Object.entries(values) as [SharedTermField, string][]) {
      if (row[field] !== after) patches.push({ localId: row.localId, productName: row.productName, field, before: row[field], after });
    }
  }
  return { basis, selectedIds: selected, patches };
}

/**
 * @cc [owner:nareshshah139,label:state] shared-preview-current-values
 * Applying a preview MUST reject a different invoice/draft basis or changed/missing target cells.
 * It changes only previewed cells and never performs network writes.
 */
export function applyPurchaseTerms<T extends SharedTermRow>(rows: readonly T[], preview: SharedTermPreview, basis: string): T[] {
  if (preview.basis !== basis || preview.patches.some(patch => rows.find(row => row.localId === patch.localId)?.[patch.field] !== patch.before)) throw new Error('The invoice changed. Preview the selected rows again.');
  return rows.map(row => preview.patches.filter(patch => patch.localId === row.localId).reduce((next, patch) => ({ ...next, [patch.field]: patch.after }), row));
}

/**
 * @cc [owner:nareshshah139,label:state] shared-undo-retains-later-corrections
 * Undo MUST restore only cells still equal to the applied value, retain later corrections and
 * report skipped cells. Review evidence is deliberately not restored from an earlier draft.
 */
export function undoPurchaseTerms<T extends SharedTermRow>(rows: readonly T[], preview: SharedTermPreview) {
  let reverted = 0, kept = 0;
  const next = rows.map(row => preview.patches.filter(patch => patch.localId === row.localId).reduce((result, patch) => {
    if (result[patch.field] !== patch.after) { kept++; return result; }
    reverted++; return { ...result, [patch.field]: patch.before };
  }, row));
  kept += preview.patches.filter(patch => !rows.some(row => row.localId === patch.localId)).length;
  return { rows: next, reverted, kept };
}
