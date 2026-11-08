import { useCallback, useRef, useState } from "react";
import { getErrorMessage } from "@/lib/utils";

export type ReportState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; data: T }
  | { status: "empty"; data: T }
  | { status: "error"; message: string; httpStatus?: number };

/** Only the latest request may settle the state, so a slow earlier response cannot overwrite a newer one. */
export function useReport<T>(isEmpty: (data: T) => boolean) {
  const [state, setState] = useState<ReportState<T>>({ status: "idle" });
  const latest = useRef(0);
  const run = useCallback(
    async (fetch: () => Promise<T>) => {
      const request = ++latest.current;
      setState({ status: "loading" });
      try {
        const data = await fetch();
        if (request === latest.current) setState(isEmpty(data) ? { status: "empty", data } : { status: "loaded", data });
      } catch (error) {
        if (request === latest.current) setState({ status: "error", message: getErrorMessage(error), httpStatus: (error as { status?: number })?.status });
      }
    },
    [isEmpty],
  );
  return [state, run] as const;
}

export const reportErrorHint = (httpStatus?: number) =>
  httpStatus === 403
    ? "Your role cannot open pharmacy reports. Ask the clinic owner or an admin for pharmacy compliance access."
    : "Check the dates and press Go to try again.";

export const rupees = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const formatRupees = (value: number | null | undefined) => (value == null ? "—" : rupees.format(value));

export const formatPercent = (value: number | null | undefined) => (value == null ? "—" : value.toFixed(2));

export function clinicToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
}

export const clinicMonthStart = (now = new Date()) => `${clinicToday(now).slice(0, 8)}01`;

export type GstAmounts = {
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalGst: number;
  grossAmount: number;
};

export type GstSlab = GstAmounts & { slabPercent: number };

export type DayWiseType = "SALES" | "PURCHASE";

export type DayBills = {
  billCount: number;
  ranges: { prefix: string; from: number; to: number }[];
  missing: { invoiceNumber: string; status: string | null }[];
  missingCount: number;
  numbers: string[];
  otherReferences: { kind: string; reference: string }[];
};

export type DayWiseRow = {
  date: string;
  noBills: boolean;
  bills: DayBills;
  slabs: GstSlab[];
  total: GstAmounts;
  amount: number;
};

export type DayWiseReport = {
  type: DayWiseType;
  period: { startDate: string; endDate: string; timeZone: string };
  columns: number[];
  rows: DayWiseRow[];
  totals: {
    slabs: GstSlab[];
    total: GstAmounts;
    amount: number;
    billCount: number;
    missingCount: number;
    noBillDays: number;
  };
};

const REFERENCE_LABELS: Record<string, [string, string]> = {
  COUNTER_SALE: ["counter sale", "counter sales"],
  SALES_RETURN: ["customer return", "customer returns"],
  SUPPLIER_RETURN: ["supplier return", "supplier returns"],
  CREDIT_NOTE: ["credit note", "credit notes"],
};

const plural = (count: number, [one, many]: [string, string]) => `${count} ${count === 1 ? one : many}`;
const trailingNumber = (invoiceNumber: string) => /(\d+)$/.exec(invoiceNumber)?.[1].replace(/^0+(?=\d)/, "") ?? invoiceNumber;
const MAX_GAPS_SHOWN = 3;

export type BillCell = { primary: string; gap: string | null; extras: string | null; title: string };

export function billCell(row: Pick<DayWiseRow, "noBills" | "bills">, type: DayWiseType): BillCell {
  const { bills } = row;
  const counts = new Map<string, number>();
  for (const { kind } of bills.otherReferences) counts.set(kind, (counts.get(kind) || 0) + 1);
  const extras = Array.from(counts, ([kind, count]) => `+ ${plural(count, REFERENCE_LABELS[kind] || [kind.toLowerCase(), kind.toLowerCase()])}`).join(", ") || null;
  const references = bills.otherReferences.map((ref) => ref.reference);

  if (row.noBills) return { primary: "No bills", gap: null, extras: null, title: "No bills, returns or credit notes were posted on this day" };

  if (type === "PURCHASE") {
    const primary = bills.billCount ? `${plural(bills.billCount, ["bill", "bills"])}: ${bills.numbers.join(", ")}` : "No supplier bills";
    return { primary, gap: null, extras, title: [...bills.numbers, ...references].join(", ") };
  }

  const ranges = bills.ranges.map(({ from, to }) => (from === to ? `${from}` : `${from} - ${to}`));
  const primary = [...ranges, ...bills.numbers].join(", ") || "No numbered bills";
  const shown = bills.missing.slice(0, MAX_GAPS_SHOWN).map((bill) =>
    bill.status ? `${trailingNumber(bill.invoiceNumber)} (${bill.status.toLowerCase()})` : trailingNumber(bill.invoiceNumber),
  );
  const more = bills.missingCount - shown.length;
  const gap = bills.missingCount ? `gap: ${shown.join(", ")}${more > 0 ? ` +${more} more` : ""}` : null;
  const fullRanges = bills.ranges.map(({ prefix, from, to }) => (from === to ? `${prefix}${from}` : `${prefix}${from} to ${prefix}${to}`));
  const title = [
    `${plural(bills.billCount, ["bill", "bills"])}${fullRanges.length ? `: ${fullRanges.join(", ")}` : ""}`,
    bills.missingCount ? `Not issued: ${bills.missing.map((bill) => `${bill.invoiceNumber}${bill.status ? ` (${bill.status.toLowerCase()})` : ""}`).join(", ")}` : "",
    references.length ? `Also posted: ${references.join(", ")}` : "",
  ].filter(Boolean).join(". ");
  return { primary, gap, extras, title };
}

export const slabLabel = (slabPercent: number) => `${slabPercent}%`;

export function dayWiseCsvRows(report: DayWiseReport): Record<string, string | number>[] {
  const cells = (slabs: GstSlab[], total: GstAmounts, amount: number) => {
    const out: Record<string, number> = { "CESS Base": 0, "CESS SGST": 0, "CESS CGST": 0, "CESS IGST": 0 };
    for (const slab of slabs) {
      const label = slabLabel(slab.slabPercent);
      out[`${label} Base`] = slab.taxableAmount;
      out[`${label} SGST`] = slab.sgst;
      out[`${label} CGST`] = slab.cgst;
      out[`${label} IGST`] = slab.igst;
    }
    return { ...out, "Total Base": total.taxableAmount, "Total SGST": total.sgst, "Total CGST": total.cgst, "Total IGST": total.igst, "Total Amount": amount };
  };
  return [
    ...report.rows.map((row) => {
      const cell = billCell(row, report.type);
      return {
        "Bill Date": row.date,
        "Bill No.": [cell.primary, cell.gap, cell.extras].filter(Boolean).join(" · "),
        "Bill Count": row.bills.billCount,
        ...cells(row.slabs, row.total, row.amount),
      };
    }),
    { "Bill Date": "Total", "Bill No.": "", "Bill Count": report.totals.billCount, ...cells(report.totals.slabs, report.totals.total, report.totals.amount) },
  ];
}

export type MarginRow = {
  key: string;
  name: string;
  category: string | null;
  unitLabel: string;
  manufacturer: string | null;
  stock: number;
  mrp: number | null;
  itemId: string | null;
  saleQuantity: number;
  averageSalePrice: number | null;
  salesAmount: number;
  purchase: number | null;
  netGst: number | null;
  profit: number | null;
  profitPercent: number | null;
  knownTaxableSales: number | null;
  unknownCost: { lineCount: number; quantity: number; salesAmount: number };
};

export type ItemMarginReport = {
  period: { startDate: string; endDate: string; timeZone: string };
  search: string | null;
  rows: MarginRow[];
  totals: {
    salesAmount: number;
    purchase: number;
    netGst: number;
    profit: number;
    profitPercent: number | null;
    itemCount: number;
    unknownCost: { lineCount: number; itemCount: number; salesAmount: number };
  };
};

export type MarginSortKey = "name" | "category" | "unitLabel" | "manufacturer" | "saleQuantity" | "stock" | "mrp" | "salesAmount" | "purchase" | "netGst" | "profitPercent";
export type MarginSort = { key: MarginSortKey; direction: "asc" | "desc" };
export const DEFAULT_MARGIN_SORT: MarginSort = { key: "profitPercent", direction: "desc" };

/** Rows without a value for the sorted column (no recorded cost) always sit at the bottom. */
export function sortMarginRows(rows: MarginRow[], sort: MarginSort): MarginRow[] {
  const sign = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = a[sort.key];
    const right = b[sort.key];
    if (left == null || right == null) return left == null ? (right == null ? 0 : 1) : -1;
    const order = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right));
    return sign * order || a.name.localeCompare(b.name);
  });
}

export const nextMarginSort = (current: MarginSort, key: MarginSortKey): MarginSort =>
  current.key === key
    ? { key, direction: current.direction === "desc" ? "asc" : "desc" }
    : { key, direction: ["name", "category", "unitLabel", "manufacturer"].includes(key) ? "asc" : "desc" };

export function marginCsvRows(report: ItemMarginReport, rows: MarginRow[]): Record<string, string | number | null>[] {
  return [
    ...rows.map((row) => ({
      "Item Name": row.name,
      Category: row.category,
      Unit: row.unitLabel,
      Manufacturer: row.manufacturer,
      "Sale Qty": row.saleQuantity,
      "Average Sale Price": row.averageSalePrice,
      Stock: row.stock,
      MRP: row.mrp,
      "Sales Amt": row.salesAmount,
      Purchase: row.purchase,
      "Net GST": row.netGst,
      "Profit": row.profit,
      "Profit %": row.profitPercent,
      "Lines Without Cost": row.unknownCost.lineCount,
      "Sales Without Cost": row.unknownCost.salesAmount,
    })),
    {
      "Item Name": "Total",
      Category: null,
      Unit: null,
      Manufacturer: null,
      "Sale Qty": null,
      "Average Sale Price": null,
      Stock: null,
      MRP: null,
      "Sales Amt": report.totals.salesAmount,
      Purchase: report.totals.purchase,
      "Net GST": report.totals.netGst,
      "Profit": report.totals.profit,
      "Profit %": report.totals.profitPercent,
      "Lines Without Cost": report.totals.unknownCost.lineCount,
      "Sales Without Cost": report.totals.unknownCost.salesAmount,
    },
  ];
}
