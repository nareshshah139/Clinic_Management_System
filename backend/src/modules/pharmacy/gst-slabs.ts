export type GstAmounts = {
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalGst: number;
  grossAmount: number;
};

export type GstSlab = GstAmounts & { slabPercent: number };

export type SlabLine = { slabPercent: number; amounts: GstAmounts };

export type SlabMap = Map<number, GstSlab>;

export const STANDARD_GST_SLABS = [0, 5, 12, 18, 28, 40] as const;

export function money(value: number) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

export function percentAmount(amount: number, percent: number) {
  return money((Number(amount || 0) * Number(percent || 0)) / 100);
}

export const zeroAmounts = (): GstAmounts => ({
  taxableAmount: 0,
  cgst: 0,
  sgst: 0,
  igst: 0,
  totalGst: 0,
  grossAmount: 0,
});

/** Sales lines carry one tax figure; the clinic bills intra-state, so it splits evenly into CGST and SGST. */
export function saleLineSlab(item: {
  taxPercent?: number;
  taxAmount?: number;
  totalAmount?: number;
}): SlabLine {
  const taxableAmount = money(Number(item.totalAmount || 0) - Number(item.taxAmount || 0));
  const totalGst = money(item.taxAmount as number);
  const cgst = money(totalGst / 2);
  return {
    slabPercent: money(item.taxPercent as number),
    amounts: {
      taxableAmount,
      cgst,
      sgst: money(totalGst - cgst),
      igst: 0,
      totalGst,
      grossAmount: item.totalAmount as number,
    },
  };
}

export function purchaseLineSlab(item: {
  taxableAmount: number;
  cgstPercent?: number;
  sgstPercent?: number;
  igstPercent?: number;
  gstAmount: number;
  lineTotal: number;
}): SlabLine {
  return {
    slabPercent: money(
      (Number(item.cgstPercent) || 0) + (Number(item.sgstPercent) || 0) + (Number(item.igstPercent) || 0),
    ),
    amounts: {
      taxableAmount: item.taxableAmount,
      cgst: percentAmount(item.taxableAmount, item.cgstPercent as number),
      sgst: percentAmount(item.taxableAmount, item.sgstPercent as number),
      igst: percentAmount(item.taxableAmount, item.igstPercent as number),
      totalGst: item.gstAmount,
      grossAmount: item.lineTotal,
    },
  };
}

export function addAmounts(sum: GstAmounts, amounts: GstAmounts): GstAmounts {
  return {
    taxableAmount: money(sum.taxableAmount + Number(amounts.taxableAmount || 0)),
    cgst: money(sum.cgst + Number(amounts.cgst || 0)),
    sgst: money(sum.sgst + Number(amounts.sgst || 0)),
    igst: money(sum.igst + Number(amounts.igst || 0)),
    totalGst: money(sum.totalGst + Number(amounts.totalGst || 0)),
    grossAmount: money(sum.grossAmount + Number(amounts.grossAmount || 0)),
  };
}

export function addSlab(slabs: SlabMap, line: SlabLine) {
  const existing = slabs.get(line.slabPercent) || { slabPercent: line.slabPercent, ...zeroAmounts() };
  slabs.set(line.slabPercent, { slabPercent: line.slabPercent, ...addAmounts(existing, line.amounts) });
}

export function slabsFromLines(lines: SlabLine[]): SlabMap {
  const slabs: SlabMap = new Map();
  for (const line of lines) addSlab(slabs, line);
  return slabs;
}

export function sortedSlabs(slabs: SlabMap) {
  return Array.from(slabs.values()).sort((a, b) => a.slabPercent - b.slabPercent);
}

export function sumSlabs(slabs: SlabMap): GstAmounts {
  return sortedSlabs(slabs).reduce((sum, slab) => addAmounts(sum, slab), zeroAmounts());
}

/** Standard rates always appear so a report reads the same every month; any other rate in use gets its own column. */
export function slabColumns(slabMaps: SlabMap[]): number[] {
  const rates = new Set<number>(STANDARD_GST_SLABS);
  for (const slabs of slabMaps) for (const rate of slabs.keys()) rates.add(rate);
  return Array.from(rates).sort((a, b) => a - b);
}
