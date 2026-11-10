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

export const MARGIN_TYPES = ["NET", "SALES", "RETURNS"] as const;
export const MARGIN_SEARCH_FIELDS = ["ALL", "NAME", "CATEGORY", "MANUFACTURER"] as const;
export const MARGIN_COST_STATUSES = ["ALL", "MISSING_COST", "LOSS"] as const;
export const MARGIN_ITEM_TYPES = ["MEDICINE", "EQUIPMENT", "SUPPLY", "CONSUMABLE"] as const;
export type MarginType = (typeof MARGIN_TYPES)[number];
export type MarginSearchField = (typeof MARGIN_SEARCH_FIELDS)[number];
export type MarginCostStatus = (typeof MARGIN_COST_STATUSES)[number];
export type MarginItemType = (typeof MARGIN_ITEM_TYPES)[number];

export const MARGIN_TYPE_LABELS: Record<MarginType, string> = { NET: "Net sales", SALES: "Sales only", RETURNS: "Returns only" };
export const MARGIN_SEARCH_FIELD_LABELS: Record<MarginSearchField, string> = { ALL: "All fields", NAME: "Item name", CATEGORY: "Category", MANUFACTURER: "Manufacturer" };
export const MARGIN_COST_STATUS_LABELS: Record<MarginCostStatus, string> = { ALL: "All", MISSING_COST: "Missing cost", LOSS: "Loss-making" };
export const MARGIN_ITEM_TYPE_LABELS: Record<MarginItemType, string> = { MEDICINE: "Medicine", EQUIPMENT: "Equipment", SUPPLY: "Supply", CONSUMABLE: "Consumable" };

/** Empty strings mean "no filter" so a field can be bound straight to its input. */
export type MarginFilters = {
  type: MarginType;
  search: string;
  searchField: MarginSearchField;
  tag: string;
  category: string;
  manufacturer: string;
  itemType: MarginItemType | "";
  costStatus: MarginCostStatus;
};

export const DEFAULT_MARGIN_FILTERS: MarginFilters = {
  type: "NET", search: "", searchField: "ALL", tag: "", category: "", manufacturer: "", itemType: "", costStatus: "ALL",
};

export type MarginOptions = { tags: string[]; categories: string[]; manufacturers: string[]; itemTypes: string[] };

const oneOf = <T extends string>(allowed: readonly T[], value: string | null, fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

/** Reads the filters back from the page URL; an unknown value falls back to the default instead of failing the page. */
export function marginFiltersFromParams(params: Pick<URLSearchParams, "get">): MarginFilters {
  return {
    type: oneOf(MARGIN_TYPES, params.get("type"), "NET"),
    searchField: oneOf(MARGIN_SEARCH_FIELDS, params.get("field"), "ALL"),
    costStatus: oneOf(MARGIN_COST_STATUSES, params.get("cost"), "ALL"),
    itemType: oneOf(["", ...MARGIN_ITEM_TYPES], params.get("itemType"), ""),
    search: (params.get("q") || "").slice(0, 100),
    tag: (params.get("tag") || "").slice(0, 100),
    category: (params.get("category") || "").slice(0, 100),
    manufacturer: (params.get("manufacturer") || "").slice(0, 100),
  };
}

const PARAM_KEYS: Record<keyof MarginFilters, string> = {
  type: "type", search: "q", searchField: "field", tag: "tag", category: "category", manufacturer: "manufacturer", itemType: "itemType", costStatus: "cost",
};

/** The URL parameters for the filters that differ from their defaults. */
export function marginFilterParams(filters: MarginFilters): Record<string, string> {
  const params: Record<string, string> = {};
  for (const key of Object.keys(PARAM_KEYS) as (keyof MarginFilters)[]) {
    const value = filters[key].trim();
    if (value && value !== DEFAULT_MARGIN_FILTERS[key]) params[PARAM_KEYS[key]] = value;
  }
  return params;
}
export const MARGIN_FILTER_PARAM_KEYS = Object.values(PARAM_KEYS);

/** The API query for the filters that are set. */
export function marginQuery(startDate: string, endDate: string, filters: MarginFilters): Record<string, string> {
  const query: Record<string, string> = { startDate, endDate };
  for (const key of Object.keys(PARAM_KEYS) as (keyof MarginFilters)[]) {
    const value = filters[key].trim();
    if (value) query[key] = value;
  }
  return query;
}

/** Filters kept in the More Filters panel; the Type, Tags and search controls sit on the toolbar. */
export const MORE_FILTER_KEYS = ["category", "manufacturer", "itemType", "costStatus"] as const;

export const activeMoreFilterCount = (filters: MarginFilters) =>
  MORE_FILTER_KEYS.filter((key) => filters[key] !== DEFAULT_MARGIN_FILTERS[key]).length;

export const hasActiveFilters = (filters: MarginFilters) =>
  (Object.keys(DEFAULT_MARGIN_FILTERS) as (keyof MarginFilters)[]).some((key) => filters[key].trim() !== DEFAULT_MARGIN_FILTERS[key]);

/** One "Label: value" per filter that is set, in toolbar order. */
export function describeMarginFilters(filters: MarginFilters): string[][] {
  const out: string[][] = [["Type", MARGIN_TYPE_LABELS[filters.type]]];
  if (filters.search.trim()) out.push(["Search", `${filters.search.trim()} (${MARGIN_SEARCH_FIELD_LABELS[filters.searchField]})`]);
  if (filters.tag) out.push(["Tag", filters.tag]);
  if (filters.category) out.push(["Category", filters.category]);
  if (filters.manufacturer) out.push(["Manufacturer", filters.manufacturer]);
  if (filters.itemType) out.push(["Item type", MARGIN_ITEM_TYPE_LABELS[filters.itemType]]);
  if (filters.costStatus !== "ALL") out.push(["Cost status", MARGIN_COST_STATUS_LABELS[filters.costStatus]]);
  return out;
}

/** The margin filters for the server export, named so they do not collide with the report toolbar's own `type`. */
export function marginExportParams(filters: MarginFilters): Record<string, string> {
  const out: Record<string, string> = {};
  const pairs: [string, string][] = [
    ["marginType", filters.type], ["field", filters.searchField], ["tag", filters.tag], ["category", filters.category],
    ["manufacturer", filters.manufacturer], ["itemType", filters.itemType], ["cost", filters.costStatus],
  ];
  for (const [key, value] of pairs) if (value.trim()) out[key] = value.trim();
  return out;
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
  tags: string[];
  itemType: string | null;
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
  options: MarginOptions;
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
