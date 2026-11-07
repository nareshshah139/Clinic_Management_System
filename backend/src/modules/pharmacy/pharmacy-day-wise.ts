import {
  GstAmounts,
  GstSlab,
  SlabLine,
  addAmounts,
  money,
  slabColumns,
  slabsFromLines,
  zeroAmounts,
} from './gst-slabs';

export type DayWiseType = 'SALES' | 'PURCHASE';

/**
 * How a document is numbered decides how it shows in the Bill No. column. Only SEQUENCE numbers
 * come from the clinic's own counter (PHI-2026-536), so only they take part in gap detection.
 * SUPPLIER numbers are the distributor's bill numbers. REFERENCE documents (counter sales,
 * returns, credit notes) carry free-text references and are listed beside the bills.
 */
export type Numbering = 'SEQUENCE' | 'SUPPLIER' | 'REFERENCE';

export type DayDocument = {
  day: string;
  kind: string;
  reference: string;
  numbering: Numbering;
  lines: SlabLine[];
};

export type MissingBill = { invoiceNumber: string; status: string | null };

export type DayBills = {
  billCount: number;
  ranges: { prefix: string; from: number; to: number }[];
  missing: MissingBill[];
  missingCount: number;
  numbers: string[];
  otherReferences: { kind: string; reference: string }[];
};

export type DayRow = {
  date: string;
  noBills: boolean;
  bills: DayBills;
  slabs: GstSlab[];
  total: GstAmounts;
  amount: number;
};

const MAX_LISTED_MISSING = 200;
const SEQUENCE = /^(.*?)(\d+)$/;

function parseSequence(reference: string) {
  const match = SEQUENCE.exec(reference.trim());
  return match ? { prefix: match[1], value: Number(match[2]), width: match[2].length } : null;
}

export function highestSequence(invoiceNumbers: string[]) {
  const highest = new Map<string, number>();
  for (const invoiceNumber of invoiceNumbers) {
    const sequence = parseSequence(invoiceNumber);
    if (sequence) highest.set(sequence.prefix, Math.max(highest.get(sequence.prefix) ?? 0, sequence.value));
  }
  return highest;
}

const formatSequence = (prefix: string, value: number, width: number) =>
  `${prefix}${String(value).padStart(width, '0')}`;

const rowAmount = (total: GstAmounts) => money(total.taxableAmount + total.sgst + total.cgst + total.igst);

function columnSlabs(lines: SlabLine[], columns: number[]): GstSlab[] {
  const slabs = slabsFromLines(lines);
  return columns.map((slabPercent) => slabs.get(slabPercent) || { slabPercent, ...zeroAmounts() });
}

export function buildDayWiseReport(input: {
  days: string[];
  documents: DayDocument[];
  priorSequence: Map<string, number>;
  unissuedStatus: Map<string, string>;
}) {
  const columns = slabColumns([slabsFromLines(input.documents.flatMap((doc) => doc.lines))]);
  const byDay = new Map<string, DayDocument[]>();
  for (const doc of input.documents) byDay.set(doc.day, [...(byDay.get(doc.day) || []), doc]);

  const issued = new Map<string, Set<number>>();
  for (const doc of input.documents) {
    const sequence = doc.numbering === 'SEQUENCE' ? parseSequence(doc.reference) : null;
    if (sequence) issued.set(sequence.prefix, (issued.get(sequence.prefix) || new Set()).add(sequence.value));
  }
  const lastIssued = new Map(input.priorSequence);

  const rows: DayRow[] = input.days.map((date) => {
    const docs = byDay.get(date) || [];
    const parsed = docs.filter((doc) => doc.numbering === 'SEQUENCE').map((doc) => ({ doc, sequence: parseSequence(doc.reference) }));
    const byPrefix = new Map<string, { values: number[]; width: number }>();
    for (const { sequence } of parsed) {
      if (!sequence) continue;
      const group = byPrefix.get(sequence.prefix) || { values: [], width: sequence.width };
      group.values.push(sequence.value);
      group.width = Math.min(group.width, sequence.width);
      byPrefix.set(sequence.prefix, group);
    }

    const ranges: DayBills['ranges'] = [];
    const missing: MissingBill[] = [];
    let missingCount = 0;
    for (const [prefix, { values, width }] of Array.from(byPrefix).sort(([a], [b]) => a.localeCompare(b))) {
      const from = Math.min(...values);
      const to = Math.max(...values);
      ranges.push({ prefix, from, to });
      const previous = lastIssued.get(prefix);
      const firstExpected = previous !== undefined && previous < from ? previous + 1 : from;
      const issuedHere = issued.get(prefix)!;
      const issuedInSpan = Array.from(issuedHere).filter((value) => value >= firstExpected && value <= to).length;
      missingCount += to - firstExpected + 1 - issuedInSpan;
      for (let value = firstExpected; value <= to && missing.length < MAX_LISTED_MISSING; value++) {
        if (issuedHere.has(value)) continue;
        const invoiceNumber = formatSequence(prefix, value, width);
        missing.push({ invoiceNumber, status: input.unissuedStatus.get(invoiceNumber) || null });
      }
      lastIssued.set(prefix, Math.max(previous ?? to, to));
    }

    const slabs = columnSlabs(docs.flatMap((doc) => doc.lines), columns);
    const total = slabs.reduce<GstAmounts>((sum, slab) => addAmounts(sum, slab), zeroAmounts());
    return {
      date,
      noBills: docs.length === 0,
      bills: {
        billCount: docs.filter((doc) => doc.numbering !== 'REFERENCE').length,
        ranges,
        missing,
        missingCount,
        numbers: [
          ...parsed.filter(({ sequence }) => !sequence).map(({ doc }) => doc.reference),
          ...docs.filter((doc) => doc.numbering === 'SUPPLIER').map((doc) => doc.reference),
        ],
        otherReferences: docs
          .filter((doc) => doc.numbering === 'REFERENCE')
          .map((doc) => ({ kind: doc.kind, reference: doc.reference })),
      },
      slabs,
      total,
      amount: rowAmount(total),
    };
  });

  const totalSlabs = columns.map((slabPercent, index) =>
    rows.reduce<GstSlab>(
      (sum, row) => ({ slabPercent, ...addAmounts(sum, row.slabs[index]) }),
      { slabPercent, ...zeroAmounts() },
    ),
  );
  const total = rows.reduce<GstAmounts>((sum, row) => addAmounts(sum, row.total), zeroAmounts());
  return {
    columns,
    rows,
    totals: {
      slabs: totalSlabs,
      total,
      amount: money(rows.reduce((sum, row) => sum + row.amount, 0)),
      billCount: rows.reduce((sum, row) => sum + row.bills.billCount, 0),
      missingCount: rows.reduce((sum, row) => sum + row.bills.missingCount, 0),
      noBillDays: rows.filter((row) => row.noBills).length,
    },
  };
}
