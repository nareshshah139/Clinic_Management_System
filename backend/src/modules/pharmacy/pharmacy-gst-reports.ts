import { StoredLine, storedLineValue } from './bill-pricing';
import { money, STANDARD_GST_SLABS } from './gst-slabs';
import {
  CellValue,
  ReportColumn,
  ReportRow,
  ReportTile,
  section,
} from './pharmacy-report-table';

/**
 * Pure builders for the Pharmacy Report GST set (pharmacy CRs section 4, CR-33). Every builder takes
 * normalised documents, so the same figures feed the screen and every export. Returns, supplier
 * returns and credit notes arrive with negative amounts and net off on the day they were posted.
 */
export type ReportLine = {
  name: string;
  hsn: string | null;
  unit: string | null;
  quantity: number;
  gross: number;
  discount: number;
  taxable: number;
  rate: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  total: number;
};

export type SaleDocKind = 'BILL' | 'COUNTER_SALE' | 'SALES_RETURN';
export type PurchaseDocKind =
  | 'PURCHASE_BILL'
  | 'SUPPLIER_RETURN'
  | 'CREDIT_NOTE';

export type SaleDoc = {
  id: string;
  kind: SaleDocKind;
  number: string;
  day: string;
  entryAt: string;
  customer: string | null;
  mobile: string | null;
  doctor: string | null;
  lines: ReportLine[];
};

export type PurchaseDoc = {
  id: string;
  kind: PurchaseDocKind;
  number: string;
  day: string;
  entryAt: string;
  distributor: string;
  gstin: string | null;
  /** The supplier's bill amount, which can differ from the lines by TCS, rounding and bill-level adjustments. */
  billAmount: number;
  lines: ReportLine[];
};

export const KIND_LABEL: Record<SaleDocKind | PurchaseDocKind, string> = {
  BILL: 'Bill',
  COUNTER_SALE: 'Counter sale',
  SALES_RETURN: 'Customer return',
  PURCHASE_BILL: 'Purchase bill',
  SUPPLIER_RETURN: 'Supplier return',
  CREDIT_NOTE: 'Credit note',
};

export const isReturn = (kind: SaleDocKind | PurchaseDocKind) =>
  kind === 'SALES_RETURN' ||
  kind === 'SUPPLIER_RETURN' ||
  kind === 'CREDIT_NOTE';

// ---- line normalisation -------------------------------------------------------------------------

/** Intra-state tax arrives as one figure and splits evenly: CGST rounds half up, SGST takes the rest, as gst-slabs does. */
export function splitIntraState(tax: number) {
  const total = money(tax);
  const cgst = money(total / 2);
  return { cgst, sgst: money(total - cgst), igst: 0 };
}

export function signedLine(line: ReportLine, sign: 1 | -1): ReportLine {
  if (sign === 1) return line;
  const flip = (value: number) => money(-value);
  return {
    ...line,
    quantity: -line.quantity,
    gross: flip(line.gross),
    discount: flip(line.discount),
    taxable: flip(line.taxable),
    cgst: flip(line.cgst),
    sgst: flip(line.sgst),
    igst: flip(line.igst),
    cess: flip(line.cess),
    total: flip(line.total),
  };
}

/** A pharmacy bill line: unit price before tax, its own and its share of the bill discount, tax on the discounted value. */
export function billLine(
  item: StoredLine & {
    name: string;
    hsn: string | null;
    unit: string | null;
    taxPercent: number;
  },
): ReportLine {
  const value = storedLineValue(item);
  return {
    name: item.name,
    hsn: item.hsn,
    unit: item.unit,
    quantity: Number(item.quantity || 0),
    gross: value.gross,
    discount: value.discount,
    taxable: value.taxable,
    rate: money(item.taxPercent),
    ...splitIntraState(value.tax),
    cess: 0,
    total: value.total,
  };
}

/** A workflow document line (counter sale, customer return, supplier return, credit note). */
export function workflowLine(line: {
  name: string;
  hsn: string | null;
  unit: string | null;
  quantity: number;
  unitPrice: number;
  taxable: number;
  tax: number;
  gstRate: number;
}): ReportLine {
  const taxable = money(line.taxable);
  const listed = money(
    Number(line.quantity || 0) * Number(line.unitPrice || 0),
  );
  // Refunds priced from the original sale can carry a taxable value above quantity x price; never show a negative discount.
  const gross = Math.max(listed, taxable);
  const tax = money(line.tax);
  return {
    name: line.name,
    hsn: line.hsn,
    unit: line.unit,
    quantity: Number(line.quantity || 0),
    gross,
    discount: money(gross - taxable),
    taxable,
    rate: money(line.gstRate),
    ...splitIntraState(tax),
    cess: 0,
    total: money(taxable + tax),
  };
}

/** A supplier bill line with CGST, SGST and IGST percentages on its taxable value. */
export function purchaseLine(item: {
  productName: string;
  hsnCode: string | null;
  packUnitType: string | null;
  quantityPurchased: number;
  taxableAmount: number;
  cgstPercent: number;
  sgstPercent: number;
  igstPercent: number;
}): ReportLine {
  const taxable = money(item.taxableAmount);
  const part = (percent: number) =>
    money((taxable * Number(percent || 0)) / 100);
  const cgst = part(item.cgstPercent);
  const sgst = part(item.sgstPercent);
  const igst = part(item.igstPercent);
  return {
    name: item.productName,
    hsn: item.hsnCode?.trim() || null,
    unit: item.packUnitType?.trim() || null,
    quantity: Number(item.quantityPurchased || 0),
    gross: taxable,
    discount: 0,
    taxable,
    rate: money(
      Number(item.cgstPercent || 0) +
        Number(item.sgstPercent || 0) +
        Number(item.igstPercent || 0),
    ),
    cgst,
    sgst,
    igst,
    cess: 0,
    total: money(taxable + cgst + sgst + igst),
  };
}

// ---- shared sums ---------------------------------------------------------------------------------

export type Amounts = {
  gross: number;
  discount: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  total: number;
};

export const zero = (): Amounts => ({
  gross: 0,
  discount: 0,
  taxable: 0,
  cgst: 0,
  sgst: 0,
  igst: 0,
  cess: 0,
  total: 0,
});

export function add(sum: Amounts, line: Amounts): Amounts {
  return {
    gross: money(sum.gross + line.gross),
    discount: money(sum.discount + line.discount),
    taxable: money(sum.taxable + line.taxable),
    cgst: money(sum.cgst + line.cgst),
    sgst: money(sum.sgst + line.sgst),
    igst: money(sum.igst + line.igst),
    cess: money(sum.cess + line.cess),
    total: money(sum.total + line.total),
  };
}

export const sumLines = (lines: Amounts[]) => lines.reduce(add, zero());
export const taxOf = (amounts: Amounts) =>
  money(amounts.cgst + amounts.sgst + amounts.igst + amounts.cess);

// ---- columns -------------------------------------------------------------------------------------

const text = (
  key: string,
  label: string,
  extra: Partial<ReportColumn> = {},
): ReportColumn => ({ key, label, kind: 'text', ...extra });
const date = (
  key: string,
  label: string,
  extra: Partial<ReportColumn> = {},
): ReportColumn => ({ key, label, kind: 'date', ...extra });
const rupees = (
  key: string,
  label: string,
  extra: Partial<ReportColumn> = {},
): ReportColumn => ({ key, label, kind: 'money', ...extra });
const count = (
  key: string,
  label: string,
  extra: Partial<ReportColumn> = {},
): ReportColumn => ({ key, label, kind: 'number', ...extra });

export function entryStamp(iso: string) {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return iso;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(instant);
  return parts.replace(',', '');
}

const byDayThenNumber = <
  T extends { day: string; entryAt: string; number: string },
>(
  a: T,
  b: T,
) =>
  a.day.localeCompare(b.day) ||
  a.entryAt.localeCompare(b.entryAt) ||
  a.number.localeCompare(b.number, 'en', { numeric: true });

// ---- CR-33b Sales Register: flat money columns, one row per bill ---------------------------------

export type SalesRegisterType = 'SALES' | 'RETURNS' | 'ALL';

export function matchesCustomer(
  doc: SaleDoc,
  search: string | null | undefined,
) {
  const q = search?.trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/\D/g, '');
  return (
    (doc.customer ?? '').toLowerCase().includes(q) ||
    doc.number.toLowerCase().includes(q) ||
    (digits.length >= 4 &&
      (doc.mobile ?? '').replace(/\D/g, '').includes(digits))
  );
}

export const salesOfType = (docs: SaleDoc[], type: SalesRegisterType) =>
  docs.filter((doc) =>
    type === 'ALL'
      ? true
      : type === 'RETURNS'
        ? doc.kind === 'SALES_RETURN'
        : doc.kind !== 'SALES_RETURN',
  );

export type SalesRegisterFilters = {
  gst: GstFilter;
  source: 'ALL' | 'BILL' | 'COUNTER_SALE';
  doctor: string | null;
  discount: 'ALL' | 'DISCOUNTED';
};

export const NO_SALES_FILTERS: SalesRegisterFilters = {
  gst: 'ALL',
  source: 'ALL',
  doctor: null,
  discount: 'ALL',
};

const doctorKey = (name: string | null) => (name ?? '').trim().toLowerCase();

const SALES_FILTERS: {
  [K in keyof SalesRegisterFilters]: (
    doc: SaleDoc,
    value: SalesRegisterFilters[K],
  ) => boolean;
} = {
  gst: (doc, value) =>
    value === 'ALL' || (value === 'WITH_GST') === hasGst(doc.lines),
  source: (doc, value) => value === 'ALL' || doc.kind === value,
  doctor: (doc, value) => value === null || doctorKey(doc.doctor) === doctorKey(value),
  discount: (doc, value) => value === 'ALL' || sumLines(doc.lines).discount > 0,
};

const FILTER_KEYS = Object.keys(
  NO_SALES_FILTERS,
) as (keyof SalesRegisterFilters)[];

const accepts = <K extends keyof SalesRegisterFilters>(
  key: K,
  doc: SaleDoc,
  filters: SalesRegisterFilters,
) => SALES_FILTERS[key](doc, filters[key]);

const matchesFilters = (doc: SaleDoc, filters: SalesRegisterFilters) =>
  FILTER_KEYS.every((key) => accepts(key, doc, filters));

const FILTER_PHRASES: {
  [K in keyof SalesRegisterFilters]: (
    value: SalesRegisterFilters[K],
  ) => string | null;
} = {
  gst: (value) =>
    value === 'WITH_GST'
      ? 'bills with GST'
      : value === 'WITHOUT_GST'
        ? 'bills without GST'
        : null,
  source: (value) =>
    value === 'BILL'
      ? 'prescription bills'
      : value === 'COUNTER_SALE'
        ? 'counter sales'
        : null,
  doctor: (value) => value?.trim() || null,
  discount: (value) => (value === 'DISCOUNTED' ? 'discounted bills' : null),
};

export function salesFilterNote(filters: SalesRegisterFilters): string | null {
  const phrase = <K extends keyof SalesRegisterFilters>(key: K) =>
    FILTER_PHRASES[key](filters[key]);
  const phrases = FILTER_KEYS.map((key) => phrase(key)).filter(
    (text): text is string => !!text,
  );
  return phrases.length ? `Showing only: ${phrases.join(', ')}.` : null;
}

const doctorsOf = (docs: SaleDoc[]) => {
  const seen = new Map<string, string>();
  for (const { doctor } of docs) {
    const key = doctorKey(doctor);
    if (key && !seen.has(key)) seen.set(key, doctor!.trim());
  }
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b, 'en'));
};

export function salesRegister(
  docs: SaleDoc[],
  {
    type,
    search,
    ...given
  }: {
    type: SalesRegisterType;
    search?: string | null;
  } & Partial<SalesRegisterFilters>,
) {
  const filters: SalesRegisterFilters = { ...NO_SALES_FILTERS, ...given };
  const ofType = salesOfType(docs, type);
  const columns: ReportColumn[] = [
    text('billNo', 'Bill No.', { frozen: true }),
    date('billDate', 'Bill Date'),
    text('customer', 'Customer'),
    text('mobile', 'Mobile'),
    rupees('gross', 'Gross', {
      help: 'Quantity x unit price before discount and tax.',
    }),
    rupees('discount', 'Disc.'),
    rupees('taxable', 'Taxable', { help: 'Gross - Disc.' }),
    rupees('cess', 'CESS'),
    rupees('sgst', 'SGST'),
    rupees('cgst', 'CGST'),
    rupees('igst', 'IGST'),
    rupees('total', 'Total', { help: 'Taxable + CESS + SGST + CGST + IGST.' }),
  ];
  const rows: ReportRow[] = ofType
    .filter((doc) => matchesCustomer(doc, search))
    .filter((doc) => matchesFilters(doc, filters))
    .sort(byDayThenNumber)
    .map((doc) => {
      const sum = sumLines(doc.lines);
      return {
        key: `${doc.kind}:${doc.id}`,
        tone: doc.kind === 'SALES_RETURN' ? 'warning' : undefined,
        cells: {
          billNo:
            doc.kind === 'SALES_RETURN' ? `${doc.number} (return)` : doc.number,
          billDate: doc.day,
          customer: doc.customer,
          mobile: doc.mobile,
          gross: sum.gross,
          discount: sum.discount,
          taxable: sum.taxable,
          cess: sum.cess,
          sgst: sum.sgst,
          cgst: sum.cgst,
          igst: sum.igst,
          total: sum.total,
        },
      };
    });
  const sec = section({
    id: 'sales-register',
    title: 'Sales Register',
    columns,
    rows,
    emptyText: 'No bills in this period.',
  });
  return {
    section: sec,
    total: Number(sec.totals!.total),
    filterChoices: { doctor: doctorsOf(ofType) },
    filterNote: salesFilterNote(filters),
  };
}

// ---- CR-33a / CR-33c shared slab bands ------------------------------------------------------------

export const SLAB_CELLS = [
  ['taxable', 'Base'],
  ['sgst', 'SGST'],
  ['cgst', 'CGST'],
  ['igst', 'IGST'],
] as const;

export const slabGroupLabel = (rate: number) => `${rate}%`;

/** CESS, every slab in use (the standard ones always), then Total with the bill amount. */
export function slabBandColumns(rates: number[]): ReportColumn[] {
  const band = (group: string, prefix: string): ReportColumn[] =>
    SLAB_CELLS.map(([field, label]) =>
      rupees(`${prefix}.${field}`, label, { group }),
    );
  return [
    ...band('CESS', 'cess'),
    ...rates.flatMap((rate) => band(slabGroupLabel(rate), `r${rate}`)),
    ...band('Total', 'total'),
    rupees('total.amount', 'Amount', { group: 'Total' }),
  ];
}

export function slabCells(
  lines: ReportLine[],
  rates: number[],
): Record<string, number> {
  const cells: Record<string, number> = {
    'cess.taxable': 0,
    'cess.sgst': 0,
    'cess.cgst': 0,
    'cess.igst': 0,
  };
  for (const rate of rates) {
    const sum = sumLines(lines.filter((line) => line.rate === rate));
    for (const [field] of SLAB_CELLS) cells[`r${rate}.${field}`] = sum[field];
  }
  const all = sumLines(lines);
  for (const [field] of SLAB_CELLS) cells[`total.${field}`] = all[field];
  cells['total.amount'] = money(
    all.taxable + all.sgst + all.cgst + all.igst + all.cess,
  );
  return cells;
}

export const ratesInUse = (lines: ReportLine[]) => {
  const rates = new Set<number>(STANDARD_GST_SLABS);
  for (const line of lines) rates.add(line.rate);
  return Array.from(rates).sort((a, b) => a - b);
};

export type GstFilter = 'ALL' | 'WITH_GST' | 'WITHOUT_GST';
export type BillsType = 'SALES' | 'PURCHASE';

const hasGst = (lines: ReportLine[]) =>
  lines.some((line) => line.cgst || line.sgst || line.igst || line.cess);

/** CR-33a: Purchase Bills (and Sales Bills, the same screen with Type = Sales). One row per bill, values in their slab. */
export function slabBills(input: {
  type: BillsType;
  gst: GstFilter;
  sales: SaleDoc[];
  purchases: PurchaseDoc[];
  search?: string | null;
}) {
  const docs = (
    input.type === 'SALES'
      ? input.sales
          .filter((doc) => matchesCustomer(doc, input.search))
          .map((doc) => ({ ...doc, party: doc.customer ?? '' }))
      : input.purchases
          .filter(
            (doc) =>
              !input.search?.trim() ||
              `${doc.distributor} ${doc.number} ${doc.gstin ?? ''}`
                .toLowerCase()
                .includes(input.search.trim().toLowerCase()),
          )
          .map((doc) => ({ ...doc, party: doc.distributor }))
  )
    .filter(
      (doc) =>
        input.gst === 'ALL' || (input.gst === 'WITH_GST') === hasGst(doc.lines),
    )
    .sort(byDayThenNumber);
  const rates = ratesInUse(docs.flatMap((doc) => doc.lines));
  const partyLabel = input.type === 'SALES' ? 'Customer' : 'Distributor';
  const columns: ReportColumn[] = [
    count('srNo', 'Sr No.', { frozen: true, total: false }),
    text('billNo', 'Bill No.', { frozen: true }),
    text('entryAt', 'Entry Date', { frozen: true }),
    date('billDate', 'Bill Date', { frozen: true }),
    text('party', partyLabel, { frozen: true }),
    ...slabBandColumns(rates),
  ];
  const rows: ReportRow[] = docs.map((doc, index) => ({
    key: `${doc.kind}:${doc.id}`,
    tone: isReturn(doc.kind) ? 'warning' : undefined,
    cells: {
      srNo: index + 1,
      billNo: isReturn(doc.kind)
        ? `${doc.number} (${KIND_LABEL[doc.kind].toLowerCase()})`
        : doc.number,
      entryAt: entryStamp(doc.entryAt),
      billDate: doc.day,
      party: doc.party,
      ...slabCells(doc.lines, rates),
    },
  }));
  const title = input.type === 'SALES' ? 'Sales Bills' : 'Purchase Bills';
  const sec = section({
    id: input.type === 'SALES' ? 'sales-bills' : 'purchase-bills',
    title,
    columns,
    rows,
    emptyText: 'No bills in this period.',
  });
  return { section: sec, rates, total: Number(sec.totals!['total.amount']) };
}

// ---- Purchase Register: flat, one row per supplier document ---------------------------------------

export function purchaseRegister(docs: PurchaseDoc[], search?: string | null) {
  const q = search?.trim().toLowerCase();
  const columns: ReportColumn[] = [
    text('billNo', 'Bill No.', { frozen: true }),
    date('billDate', 'Bill Date'),
    text('entryAt', 'Entry Date'),
    text('distributor', 'Distributor'),
    text('gstin', 'GSTIN'),
    rupees('taxable', 'Taxable'),
    rupees('cgst', 'CGST'),
    rupees('sgst', 'SGST'),
    rupees('igst', 'IGST'),
    rupees('cess', 'CESS'),
    rupees('tax', 'Total GST'),
    rupees('other', 'Other', {
      help: "The supplier's bill amount less taxable value and GST: TCS, rounding and bill-level adjustments.",
    }),
    rupees('billAmount', 'Bill Amount'),
  ];
  const rows: ReportRow[] = docs
    .filter(
      (doc) =>
        !q ||
        `${doc.distributor} ${doc.number} ${doc.gstin ?? ''}`
          .toLowerCase()
          .includes(q),
    )
    .sort(byDayThenNumber)
    .map((doc) => {
      const sum = sumLines(doc.lines);
      const tax = taxOf(sum);
      return {
        key: `${doc.kind}:${doc.id}`,
        tone: isReturn(doc.kind) ? 'warning' : undefined,
        cells: {
          billNo: isReturn(doc.kind)
            ? `${doc.number} (${KIND_LABEL[doc.kind].toLowerCase()})`
            : doc.number,
          billDate: doc.day,
          entryAt: entryStamp(doc.entryAt),
          distributor: doc.distributor,
          gstin: doc.gstin,
          taxable: sum.taxable,
          cgst: sum.cgst,
          sgst: sum.sgst,
          igst: sum.igst,
          cess: sum.cess,
          tax,
          other: money(doc.billAmount - sum.taxable - tax),
          billAmount: money(doc.billAmount),
        },
      };
    });
  const sec = section({
    id: 'purchase-register',
    title: 'Purchase Register',
    columns,
    rows,
    emptyText: 'No purchase bills in this period.',
  });
  return { section: sec, total: Number(sec.totals!.billAmount) };
}

// ---- HSN wise GST (GSTR-1 Table 12) ----------------------------------------------------------------

export const HSN_MISSING = 'Not recorded';

export function hsnSummary(
  lines: ReportLine[],
  id = 'hsn',
  title = 'HSN wise GST',
) {
  const groups = new Map<
    string,
    {
      hsn: string;
      rate: number;
      names: Map<string, number>;
      units: Set<string>;
      quantity: number;
      sum: Amounts;
    }
  >();
  for (const line of lines) {
    const hsn = line.hsn?.trim() || HSN_MISSING;
    const key = `${hsn}|${line.rate}`;
    const group = groups.get(key) || {
      hsn,
      rate: line.rate,
      names: new Map(),
      units: new Set(),
      quantity: 0,
      sum: zero(),
    };
    group.names.set(line.name, (group.names.get(line.name) || 0) + 1);
    if (line.unit) group.units.add(line.unit);
    group.quantity = money(group.quantity + line.quantity);
    group.sum = add(group.sum, line);
    groups.set(key, group);
  }
  const columns: ReportColumn[] = [
    text('hsn', 'HSN', { frozen: true }),
    text('description', 'Description'),
    text('uqc', 'UQC'),
    count('quantity', 'Total Qty'),
    { key: 'rate', label: 'Rate %', kind: 'percent' },
    rupees('taxable', 'Taxable Value'),
    rupees('igst', 'IGST'),
    rupees('cgst', 'CGST'),
    rupees('sgst', 'SGST'),
    rupees('cess', 'CESS'),
    rupees('value', 'Total Value'),
  ];
  const rows: ReportRow[] = Array.from(groups.values())
    .sort(
      (a, b) =>
        (a.hsn === HSN_MISSING
          ? 1
          : b.hsn === HSN_MISSING
            ? -1
            : a.hsn.localeCompare(b.hsn)) || a.rate - b.rate,
    )
    .map((group) => {
      const names = Array.from(group.names.keys()).sort();
      return {
        key: `${group.hsn}|${group.rate}`,
        tone: group.hsn === HSN_MISSING ? 'warning' : undefined,
        cells: {
          hsn: group.hsn,
          description:
            names.length <= 2
              ? names.join(', ')
              : `${names.slice(0, 2).join(', ')} +${names.length - 2} more`,
          uqc:
            group.units.size === 1
              ? Array.from(group.units)[0]
              : group.units.size
                ? 'Mixed'
                : 'NOS',
          quantity: group.quantity,
          rate: group.rate,
          taxable: group.sum.taxable,
          igst: group.sum.igst,
          cgst: group.sum.cgst,
          sgst: group.sum.sgst,
          cess: group.sum.cess,
          value: money(group.sum.taxable + taxOf(group.sum)),
        },
      };
    });
  const missing = rows.filter((row) => row.cells.hsn === HSN_MISSING).length;
  return {
    section: section({
      id,
      title,
      columns,
      rows,
      emptyText: 'No items in this period.',
    }),
    missingHsnGroups: missing,
  };
}

// ---- place of supply -------------------------------------------------------------------------------

export const GST_STATES: Record<string, string> = {
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
  '97': 'Other Territory',
};

export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const isGstin = (value: string | null | undefined) =>
  GSTIN_PATTERN.test(
    String(value ?? '')
      .trim()
      .toUpperCase(),
  );

export function placeOfSupply(
  gstin: string | null | undefined,
  stateName?: string | null,
): string {
  const code = String(gstin ?? '')
    .trim()
    .slice(0, 2);
  if (isGstin(gstin) && GST_STATES[code]) return `${code}-${GST_STATES[code]}`;
  const byName = Object.entries(GST_STATES).find(
    ([, name]) =>
      name.toLowerCase() ===
      String(stateName ?? '')
        .trim()
        .toLowerCase(),
  );
  return byName
    ? `${byName[0]}-${byName[1]}`
    : stateName?.trim() || 'Not recorded';
}

// ---- GSTR-1 -------------------------------------------------------------------------------------------

const SEQUENCE = /^(.*?)(\d+)$/;

/** GSTR-1 Table 13: each bill series with its first and last number, and how many were cancelled. */
export function documentsIssued(input: {
  sales: SaleDoc[];
  cancelledBillNumbers: string[];
}) {
  type Series = {
    nature: string;
    prefix: string;
    numbers: number[];
    width: number;
    refs: string[];
    cancelled: number;
  };
  const series = new Map<string, Series>();
  const note = (nature: string, reference: string, cancelled: boolean) => {
    const match = SEQUENCE.exec(reference.trim());
    const prefix = match ? match[1] : reference.trim();
    const key = `${nature}|${match ? prefix : '*'}`;
    const entry = series.get(key) || {
      nature,
      prefix: match ? prefix : '',
      numbers: [],
      width: match ? match[2].length : 0,
      refs: [],
      cancelled: 0,
    };
    if (match) {
      entry.numbers.push(Number(match[2]));
      entry.width = Math.min(entry.width || match[2].length, match[2].length);
    }
    entry.refs.push(reference);
    if (cancelled) entry.cancelled += 1;
    series.set(key, entry);
  };
  for (const doc of input.sales) {
    if (doc.kind === 'BILL')
      note('Invoices for outward supply', doc.number, false);
    else if (doc.kind === 'COUNTER_SALE')
      note('Invoices for outward supply (counter sales)', doc.number, false);
    else note('Credit notes (customer returns)', doc.number, false);
  }
  for (const number of input.cancelledBillNumbers)
    note('Invoices for outward supply', number, true);
  const columns: ReportColumn[] = [
    text('nature', 'Nature of document', { frozen: true }),
    text('from', 'Sr. No. From'),
    text('to', 'Sr. No. To'),
    count('total', 'Total number'),
    count('cancelled', 'Cancelled'),
    count('net', 'Net issued'),
  ];
  const rows: ReportRow[] = Array.from(series.values())
    .sort(
      (a, b) =>
        a.nature.localeCompare(b.nature) || a.prefix.localeCompare(b.prefix),
    )
    .map((entry) => {
      const pad = (value: number) =>
        `${entry.prefix}${String(value).padStart(entry.width, '0')}`;
      const sortedRefs = [...entry.refs].sort((a, b) =>
        a.localeCompare(b, 'en', { numeric: true }),
      );
      const from = entry.numbers.length
        ? pad(Math.min(...entry.numbers))
        : sortedRefs[0];
      const to = entry.numbers.length
        ? pad(Math.max(...entry.numbers))
        : sortedRefs[sortedRefs.length - 1];
      return {
        key: `${entry.nature}|${entry.prefix}`,
        cells: {
          nature: entry.nature,
          from,
          to,
          total: entry.refs.length,
          cancelled: entry.cancelled,
          net: entry.refs.length - entry.cancelled,
        },
      };
    });
  return section({
    id: 'docs',
    title: 'Documents issued (Table 13)',
    columns,
    rows,
    emptyText: 'No documents issued in this period.',
  });
}

/** GSTR-1 Table 7 (B2C small): rate-wise, net of customer returns, at the clinic's place of supply. */
export function b2cs(lines: ReportLine[], place: string) {
  const byRate = new Map<number, Amounts>();
  for (const line of lines)
    byRate.set(line.rate, add(byRate.get(line.rate) || zero(), line));
  const columns: ReportColumn[] = [
    text('type', 'Type', { frozen: true }),
    text('place', 'Place of Supply'),
    { key: 'rate', label: 'Rate %', kind: 'percent' },
    rupees('taxable', 'Taxable Value'),
    rupees('cgst', 'CGST'),
    rupees('sgst', 'SGST'),
    rupees('cess', 'Cess'),
  ];
  const rows: ReportRow[] = Array.from(byRate)
    .sort(([a], [b]) => a - b)
    .map(([rate, sum]) => ({
      key: String(rate),
      cells: {
        type: 'OE',
        place,
        rate,
        taxable: sum.taxable,
        cgst: sum.cgst,
        sgst: sum.sgst,
        cess: sum.cess,
      },
    }));
  return section({
    id: 'b2cs',
    title: 'B2C small, rate-wise (Table 7)',
    columns,
    rows,
    emptyText: 'No outward supplies in this period.',
  });
}

export function gstr1(input: {
  sales: SaleDoc[];
  cancelledBillNumbers: string[];
  place: string;
}) {
  const lines = input.sales.flatMap((doc) => doc.lines);
  const sum = sumLines(lines);
  const hsn = hsnSummary(lines, 'hsn', 'HSN summary (Table 12)');
  const tiles: ReportTile[] = [
    { label: 'Taxable value', value: sum.taxable, kind: 'money' },
    { label: 'CGST', value: sum.cgst, kind: 'money' },
    { label: 'SGST', value: sum.sgst, kind: 'money' },
    { label: 'Total tax', value: taxOf(sum), kind: 'money' },
  ];
  return {
    sections: [b2cs(lines, input.place), hsn.section, documentsIssued(input)],
    tiles,
    total: money(sum.taxable + taxOf(sum)),
    missingHsnGroups: hsn.missingHsnGroups,
  };
}

// ---- GSTR-3B ------------------------------------------------------------------------------------------

export type Heads = { igst: number; cgst: number; sgst: number; cess: number };

export type SetOff = {
  liability: Heads;
  credit: Heads;
  /** utilised[from][to]: credit of head `from` used against liability of head `to`. */
  utilised: Record<keyof Heads, Heads>;
  paidByCredit: Heads;
  cash: Heads;
  carriedForward: Heads;
};

const heads = (): Heads => ({ igst: 0, cgst: 0, sgst: 0, cess: 0 });

/**
 * Statutory credit utilisation (CGST Act s.49(5) and rule 88A). IGST credit is used first, against
 * IGST and then against CGST and SGST in any order, and must be exhausted before any CGST or SGST
 * credit is touched. CGST credit then goes against CGST, then IGST; SGST credit against SGST, then
 * IGST; CGST credit never pays SGST nor SGST credit CGST; cess only pays cess. Within those rules
 * the leftover IGST credit is steered to the CGST and SGST shortfalls their own credit cannot
 * cover, which is what keeps the tax paid in cash as low as the law allows. Whatever liability is
 * left is payable in cash; whatever credit is left carries forward.
 */
export function setOff(liabilityIn: Heads, creditIn: Heads): SetOff {
  const liability = { ...liabilityIn };
  const credit = { ...creditIn };
  const left = {
    igst: Math.max(0, liability.igst),
    cgst: Math.max(0, liability.cgst),
    sgst: Math.max(0, liability.sgst),
    cess: Math.max(0, liability.cess),
  };
  const avail = {
    igst: Math.max(0, credit.igst),
    cgst: Math.max(0, credit.cgst),
    sgst: Math.max(0, credit.sgst),
    cess: Math.max(0, credit.cess),
  };
  const utilised: Record<keyof Heads, Heads> = {
    igst: heads(),
    cgst: heads(),
    sgst: heads(),
    cess: heads(),
  };
  const use = (from: keyof Heads, to: keyof Heads, cap = Infinity) => {
    const amount = money(Math.min(avail[from], left[to], cap));
    if (amount <= 0) return;
    avail[from] = money(avail[from] - amount);
    left[to] = money(left[to] - amount);
    utilised[from][to] = money(utilised[from][to] + amount);
  };
  use('igst', 'igst');
  // IGST credit first fills the part of each head that the head's own credit cannot pay...
  use('igst', 'cgst', Math.max(0, money(left.cgst - avail.cgst)));
  use('igst', 'sgst', Math.max(0, money(left.sgst - avail.sgst)));
  // ...and must still be exhausted before CGST or SGST credit is used.
  use('igst', 'cgst');
  use('igst', 'sgst');
  use('cgst', 'cgst');
  use('cgst', 'igst');
  use('sgst', 'sgst');
  use('sgst', 'igst');
  use('cess', 'cess');
  const paidByCredit = heads();
  for (const from of Object.keys(utilised) as (keyof Heads)[])
    for (const to of Object.keys(paidByCredit) as (keyof Heads)[])
      paidByCredit[to] = money(paidByCredit[to] + utilised[from][to]);
  return {
    liability,
    credit,
    utilised,
    paidByCredit,
    cash: left,
    carriedForward: avail,
  };
}

export function gstr3b(input: { sales: SaleDoc[]; purchases: PurchaseDoc[] }) {
  const outLines = input.sales.flatMap((doc) => doc.lines);
  const taxed = sumLines(outLines.filter((line) => line.rate > 0));
  const nil = sumLines(outLines.filter((line) => line.rate <= 0));
  const itcDocs = input.purchases.filter((doc) => isGstin(doc.gstin));
  const blocked = input.purchases.filter((doc) => !isGstin(doc.gstin));
  const itc = sumLines(itcDocs.flatMap((doc) => doc.lines));
  const blockedSum = sumLines(blocked.flatMap((doc) => doc.lines));
  const liability: Heads = {
    igst: taxed.igst,
    cgst: taxed.cgst,
    sgst: taxed.sgst,
    cess: taxed.cess,
  };
  const credit: Heads = {
    igst: itc.igst,
    cgst: itc.cgst,
    sgst: itc.sgst,
    cess: itc.cess,
  };
  const result = setOff(liability, credit);
  const columns: ReportColumn[] = [
    text('table', 'Table', { frozen: true }),
    text('nature', 'Nature of supplies / tax'),
    rupees('taxable', 'Taxable value'),
    rupees('igst', 'IGST'),
    rupees('cgst', 'CGST'),
    rupees('sgst', 'SGST'),
    rupees('cess', 'Cess'),
  ];
  const row = (
    key: string,
    table: string,
    nature: string,
    values: Partial<Record<'taxable' | keyof Heads, CellValue>>,
    tone?: ReportRow['tone'],
  ): ReportRow => ({
    key,
    tone,
    cells: {
      table,
      nature,
      taxable: values.taxable ?? null,
      igst: values.igst ?? 0,
      cgst: values.cgst ?? 0,
      sgst: values.sgst ?? 0,
      cess: values.cess ?? 0,
    },
  });
  const outward = section({
    id: 'outward',
    title: '3.1 Outward supplies and 4 Eligible ITC',
    columns,
    totals: null,
    rows: [
      row(
        '3.1a',
        '3.1(a)',
        'Outward taxable supplies (other than zero rated, nil rated and exempted)',
        { taxable: taxed.taxable, ...liability },
      ),
      row('3.1c', '3.1(c)', 'Other outward supplies (nil rated, exempted)', {
        taxable: nil.taxable,
        igst: 0,
        cgst: 0,
        sgst: 0,
        cess: 0,
      }),
      row(
        '4a5',
        '4(A)(5)',
        'All other ITC: posted supplier bills, net of supplier returns and credit notes',
        { ...credit },
      ),
      row(
        '4c',
        '4(C)',
        'Net ITC available (4(A) - 4(B); no reversals are recorded in this software)',
        { ...credit },
      ),
      ...(blocked.length
        ? [
            row(
              '4d',
              '4(D)',
              `Not claimed: ${blocked.length} supplier document(s) without a valid GSTIN`,
              {
                igst: blockedSum.igst,
                cgst: blockedSum.cgst,
                sgst: blockedSum.sgst,
                cess: blockedSum.cess,
              },
              'warning',
            ),
          ]
        : []),
    ],
  });
  const payment = section({
    id: 'payment',
    title: '6.1 Payment of tax',
    columns: columns.filter((column) => column.key !== 'taxable'),
    totals: null,
    rows: [
      row('liability', '6.1', 'Tax payable (from 3.1(a))', liability),
      row(
        'itc-igst',
        '6.1',
        'Paid through ITC: IGST credit',
        result.utilised.igst,
      ),
      row(
        'itc-cgst',
        '6.1',
        'Paid through ITC: CGST credit',
        result.utilised.cgst,
      ),
      row(
        'itc-sgst',
        '6.1',
        'Paid through ITC: SGST credit',
        result.utilised.sgst,
      ),
      row(
        'itc-cess',
        '6.1',
        'Paid through ITC: Cess credit',
        result.utilised.cess,
      ),
      row(
        'cash',
        '6.1',
        'Tax payable in cash',
        result.cash,
        Object.values(result.cash).some((value) => value > 0)
          ? 'warning'
          : undefined,
      ),
      row('carry', '—', 'ITC left to carry forward', result.carriedForward),
    ],
  });
  const tiles: ReportTile[] = [
    {
      label: 'Output tax',
      value: money(
        liability.igst + liability.cgst + liability.sgst + liability.cess,
      ),
      kind: 'money',
    },
    {
      label: 'Eligible ITC',
      value: money(credit.igst + credit.cgst + credit.sgst + credit.cess),
      kind: 'money',
    },
    {
      label: 'Payable in cash',
      value: money(
        result.cash.igst +
          result.cash.cgst +
          result.cash.sgst +
          result.cash.cess,
      ),
      kind: 'money',
      tone: 'warning',
    },
    {
      label: 'ITC carried forward',
      value: money(
        result.carriedForward.igst +
          result.carriedForward.cgst +
          result.carriedForward.sgst +
          result.carriedForward.cess,
      ),
      kind: 'money',
    },
  ];
  return {
    sections: [outward, payment],
    tiles,
    setOff: result,
    blockedDocuments: blocked.length,
  };
}

// ---- GSTR-2A / 2B as per the clinic's books ------------------------------------------------------------

export function gstr2a(purchases: PurchaseDoc[]) {
  const columns: ReportColumn[] = [
    text('gstin', 'Supplier GSTIN', { frozen: true }),
    text('supplier', 'Supplier name'),
    text('number', 'Invoice / note No.'),
    date('date', 'Date'),
    rupees('value', 'Invoice value', {
      total: false,
      help: 'The whole document, repeated on each of its rate rows as GSTR-2A lists it.',
    }),
    text('place', 'Place of supply'),
    { key: 'rate', label: 'Rate %', kind: 'percent' },
    rupees('taxable', 'Taxable value'),
    rupees('igst', 'IGST'),
    rupees('cgst', 'CGST'),
    rupees('sgst', 'SGST'),
    rupees('cess', 'Cess'),
  ];
  const rowsFor = (docs: PurchaseDoc[]): ReportRow[] =>
    docs
      .sort(
        (a, b) =>
          (a.gstin ?? '').localeCompare(b.gstin ?? '') || byDayThenNumber(a, b),
      )
      .flatMap((doc) => {
        const byRate = new Map<number, Amounts>();
        for (const line of doc.lines)
          byRate.set(line.rate, add(byRate.get(line.rate) || zero(), line));
        return Array.from(byRate)
          .sort(([a], [b]) => a - b)
          .map(([rate, sum]) => ({
            key: `${doc.kind}:${doc.id}:${rate}`,
            tone: isGstin(doc.gstin) ? undefined : ('warning' as const),
            cells: {
              gstin: doc.gstin || 'Not recorded',
              supplier: doc.distributor,
              number: doc.number,
              date: doc.day,
              value: money(doc.billAmount),
              place: placeOfSupply(doc.gstin),
              rate,
              taxable: sum.taxable,
              igst: sum.igst,
              cgst: sum.cgst,
              sgst: sum.sgst,
              cess: sum.cess,
            },
          }));
      });
  return {
    sections: [
      section({
        id: 'b2b',
        title: 'B2B invoices',
        columns,
        rows: rowsFor(purchases.filter((doc) => !isReturn(doc.kind))),
        emptyText: 'No supplier bills in this period.',
      }),
      section({
        id: 'cdnr',
        title: 'Credit / debit notes (supplier returns and credit notes)',
        columns,
        rows: rowsFor(purchases.filter((doc) => isReturn(doc.kind))),
        emptyText: 'No supplier returns or credit notes in this period.',
      }),
    ],
  };
}

export function gstr2b(purchases: PurchaseDoc[]) {
  const bySupplier = new Map<
    string,
    { gstin: string | null; name: string; documents: number; sum: Amounts }
  >();
  for (const doc of purchases) {
    const key = (doc.gstin || `name:${doc.distributor}`).toUpperCase();
    const entry = bySupplier.get(key) || {
      gstin: doc.gstin,
      name: doc.distributor,
      documents: 0,
      sum: zero(),
    };
    entry.documents += 1;
    entry.sum = add(entry.sum, sumLines(doc.lines));
    bySupplier.set(key, entry);
  }
  const columns: ReportColumn[] = [
    text('gstin', 'Supplier GSTIN', { frozen: true }),
    text('supplier', 'Supplier name'),
    count('documents', 'Documents'),
    rupees('taxable', 'Taxable value'),
    rupees('igst', 'IGST'),
    rupees('cgst', 'CGST'),
    rupees('sgst', 'SGST'),
    rupees('cess', 'Cess'),
    rupees('itc', 'Total ITC'),
    text('status', 'ITC status'),
  ];
  const rows: ReportRow[] = Array.from(bySupplier.values())
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => {
      const valid = isGstin(entry.gstin);
      return {
        key: entry.gstin || entry.name,
        tone: valid ? undefined : 'warning',
        cells: {
          gstin: entry.gstin || 'Not recorded',
          supplier: entry.name,
          documents: entry.documents,
          taxable: entry.sum.taxable,
          igst: entry.sum.igst,
          cgst: entry.sum.cgst,
          sgst: entry.sum.sgst,
          cess: entry.sum.cess,
          itc: taxOf(entry.sum),
          status: valid
            ? 'Eligible as per books'
            : 'Not claimable: GSTIN missing or invalid',
        },
      };
    });
  return {
    sections: [
      section({
        id: 'itc',
        title: 'Supplier-wise ITC',
        columns,
        rows,
        emptyText: 'No supplier documents in this period.',
      }),
    ],
  };
}

// ---- Composition GST (CMP-08) ------------------------------------------------------------------------

export function compositionReport(input: {
  sales: SaleDoc[];
  ratePercent: number;
}) {
  const byMonth = new Map<string, Amounts>();
  for (const doc of input.sales)
    for (const line of doc.lines)
      byMonth.set(
        doc.day.slice(0, 7),
        add(byMonth.get(doc.day.slice(0, 7)) || zero(), line),
      );
  const half = input.ratePercent / 2;
  const columns: ReportColumn[] = [
    text('month', 'Month', { frozen: true }),
    rupees('turnover', 'Outward turnover', {
      help: 'Taxable value of every outward supply, net of customer returns, at the value billed.',
    }),
    { key: 'rate', label: 'Composition rate %', kind: 'percent' },
    rupees('cgst', 'CGST'),
    rupees('sgst', 'SGST'),
    rupees('tax', 'Composition tax'),
  ];
  const rows: ReportRow[] = Array.from(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, sum]) => {
      const cgst = money((sum.taxable * half) / 100);
      const sgst = money((sum.taxable * half) / 100);
      return {
        key: month,
        cells: {
          month,
          turnover: sum.taxable,
          rate: input.ratePercent,
          cgst,
          sgst,
          tax: money(cgst + sgst),
        },
      };
    });
  const sec = section({
    id: 'composition',
    title: 'Composition tax on turnover',
    columns,
    rows,
    emptyText: 'No outward supplies in this period.',
  });
  return { section: sec, total: Number(sec.totals!.tax) };
}

// ---- Daily Sales Summary, doctor-wise ------------------------------------------------------------------

export const NO_DOCTOR = 'No doctor recorded';

export function doctorWiseSales(docs: SaleDoc[]) {
  const byDoctor = new Map<
    string,
    { bills: number; returns: number; sum: Amounts }
  >();
  for (const doc of docs) {
    const name = doc.doctor?.trim() || NO_DOCTOR;
    const entry = byDoctor.get(name) || { bills: 0, returns: 0, sum: zero() };
    if (doc.kind === 'SALES_RETURN') entry.returns += 1;
    else entry.bills += 1;
    entry.sum = add(entry.sum, sumLines(doc.lines));
    byDoctor.set(name, entry);
  }
  const grand = money(
    Array.from(byDoctor.values()).reduce(
      (sum, entry) => sum + entry.sum.total,
      0,
    ),
  );
  const columns: ReportColumn[] = [
    text('doctor', 'Doctor', { frozen: true }),
    count('bills', 'Bills'),
    count('returns', 'Returns'),
    rupees('gross', 'Gross'),
    rupees('discount', 'Disc.'),
    rupees('taxable', 'Taxable'),
    rupees('gst', 'GST'),
    rupees('total', 'Total'),
    { key: 'share', label: 'Share %', kind: 'percent', total: false },
  ];
  const rows: ReportRow[] = Array.from(byDoctor)
    .sort(([a, x], [b, y]) =>
      a === NO_DOCTOR
        ? 1
        : b === NO_DOCTOR
          ? -1
          : y.sum.total - x.sum.total || a.localeCompare(b),
    )
    .map(([doctor, entry]) => ({
      key: doctor,
      tone: doctor === NO_DOCTOR ? 'muted' : undefined,
      cells: {
        doctor,
        bills: entry.bills,
        returns: entry.returns,
        gross: entry.sum.gross,
        discount: entry.sum.discount,
        taxable: entry.sum.taxable,
        gst: taxOf(entry.sum),
        total: entry.sum.total,
        share: grand ? money((entry.sum.total / grand) * 100) : 0,
      },
    }));
  const sec = section({
    id: 'doctor-wise',
    title: 'Sales by doctor',
    columns,
    rows,
    emptyText: 'No sales in this period.',
  });
  return { section: sec, total: Number(sec.totals!.total) };
}
