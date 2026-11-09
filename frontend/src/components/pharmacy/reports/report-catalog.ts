import { addDays, financialYear, isDay } from "@/lib/date-ranges";

/**
 * The Pharmacy Report menu (pharmacy CRs section 4, CR-33): categories down the left with the
 * reports inside each, a search across them, and the most-used ones on the landing page.
 */
export type ReportCategory = "GST Reports" | "Margin Reports" | "Stock Reports" | "Accounting Reports" | "Others";
export const CATEGORIES: ReportCategory[] = ["GST Reports", "Margin Reports", "Stock Reports", "Accounting Reports", "Others"];

export type PeriodKind = "range" | "day" | "none";
export type ReportView = "table" | "collection" | "day-wise" | "margin" | "gst-summary";
export type Option = { value: string; label: string };

export type ReportEntry = {
  id: string;
  title: string;
  category: ReportCategory;
  /** What the report is for, in a sentence: shown on the landing card and in the title's (i). */
  about: string;
  keywords: string[];
  view: ReportView;
  period: PeriodKind;
  /** GST returns are filed for the month just ended, so they open on it. */
  defaultPeriod?: "this-month" | "last-month";
  types?: Option[];
  defaultType?: string;
  gstFilter?: boolean;
  searchLabel?: string;
  windows?: Option[];
  compositionRate?: boolean;
  common?: boolean;
};

const SALES_PURCHASE: Option[] = [
  { value: "SALES", label: "Sales" },
  { value: "PURCHASE", label: "Purchase" },
];

export const REPORTS: ReportEntry[] = [
  { id: "purchase-register", title: "Purchase Register", category: "GST Reports", view: "table", period: "range", defaultPeriod: "last-month", searchLabel: "Distributor, bill no. or GSTIN",
    about: "Every supplier bill posted to stock, one row each, with taxable value, GST and the bill amount.", keywords: ["purchase", "supplier", "distributor", "inward", "gst"] },
  { id: "purchase-bills", title: "Purchase Bills", category: "GST Reports", view: "table", period: "range", defaultPeriod: "last-month", types: SALES_PURCHASE, defaultType: "PURCHASE", gstFilter: true, searchLabel: "Distributor, bill no. or GSTIN",
    about: "Supplier bills split across GST slabs (0, 5, 12, 18, 28, 40%), each with Base, SGST, CGST and IGST.", keywords: ["purchase", "slab", "gst", "itc", "bills"] },
  { id: "sales-register", title: "Sales Register", category: "GST Reports", view: "table", period: "range", defaultPeriod: "last-month", common: true, searchLabel: "Customer, bill no. or mobile",
    types: [
      { value: "SALES", label: "Sales" },
      { value: "RETURNS", label: "Returns" },
      { value: "ALL", label: "Sales net of returns" },
    ],
    defaultType: "SALES",
    about: "Every pharmacy bill and counter sale with Gross, Discount, Taxable, GST and Total. Search a patient to read their month.", keywords: ["sales", "bills", "outward", "gst", "customer"] },
  { id: "sales-bills", title: "Sales Bills", category: "GST Reports", view: "table", period: "range", defaultPeriod: "last-month", types: SALES_PURCHASE, defaultType: "SALES", gstFilter: true, searchLabel: "Customer, bill no. or mobile",
    about: "Pharmacy bills split across GST slabs, the sales side of Purchase Bills.", keywords: ["sales", "slab", "gst", "outward"] },
  { id: "day-wise-summary", title: "Day wise Summary", category: "GST Reports", view: "day-wise", period: "range", common: true,
    about: "One row per day with the bill-number range and the GST slab split; gaps in the numbering stand out.", keywords: ["daily", "day", "summary", "slab", "gst", "bill range"] },
  { id: "gstr-1", title: "GSTR-1", category: "GST Reports", view: "table", period: "range", defaultPeriod: "last-month", common: true,
    about: "Outward supplies for the return: B2C rate-wise (Table 7), HSN summary (Table 12) and documents issued (Table 13).", keywords: ["gstr", "gstr1", "return", "outward", "b2c", "hsn", "filing"] },
  { id: "gstr-3b", title: "GSTR-3B", category: "GST Reports", view: "table", period: "range", defaultPeriod: "last-month", common: true,
    about: "Output tax, eligible ITC and the tax payable in cash after setting credit off in the statutory order.", keywords: ["gstr", "gstr3b", "3b", "return", "itc", "payable", "filing"] },
  { id: "gstr-2a", title: "GSTR-2A", category: "GST Reports", view: "table", period: "range", defaultPeriod: "last-month",
    about: "The clinic's supplier invoices and credit notes, laid out like GSTR-2A, to match against the GST portal.", keywords: ["gstr", "gstr2a", "2a", "itc", "supplier", "reconcile"] },
  { id: "gstr-2b", title: "GSTR-2B", category: "GST Reports", view: "table", period: "range", defaultPeriod: "last-month",
    about: "Input tax credit per supplier from the clinic's books, to match against the portal's GSTR-2B. Flags suppliers without a valid GSTIN.", keywords: ["gstr", "gstr2b", "2b", "itc", "supplier", "reconcile"] },
  { id: "hsn-wise", title: "HSN wise GST", category: "GST Reports", view: "table", period: "range", defaultPeriod: "last-month", types: SALES_PURCHASE, defaultType: "SALES",
    about: "Quantity, taxable value and GST per HSN code and rate. Items without an HSN code are listed last.", keywords: ["hsn", "gst", "code", "summary"] },
  { id: "composition", title: "Composition GST Report", category: "GST Reports", view: "table", period: "range", defaultPeriod: "last-month", compositionRate: true,
    about: "Turnover and tax at the composition rate (CMP-08). Only for a pharmacy registered under the composition scheme.", keywords: ["composition", "cmp", "cmp-08", "gst"] },
  { id: "item-margin", title: "Item Wise Margin Report", category: "Margin Reports", view: "margin", period: "range", common: true,
    about: "For each item sold: what it sold for, what it cost, the net GST and the profit, highest margin first.", keywords: ["margin", "profit", "item", "cost"] },
  { id: "expiring-stock", title: "Expiring Stock", category: "Stock Reports", view: "table", period: "none",
    windows: [
      { value: "expired", label: "Already expired" },
      { value: "1m", label: "Within 1 month" },
      { value: "2m", label: "Within 2 months" },
      { value: "3m", label: "Within 3 months" },
      { value: "6m", label: "Within 6 months" },
    ],
    about: "Batches with stock that have expired or expire soon, with their value at cost and MRP.", keywords: ["expiry", "expired", "stock", "return", "near expiry"] },
  { id: "daily-collection", title: "Daily Collection", category: "Accounting Reports", view: "collection", period: "day", common: true,
    about: "The day's takings by payment mode against the bills raised, with a count of the drawer to show any shortfall the same day.", keywords: ["collection", "daily", "cash", "upi", "card", "payment", "reconciliation", "takings"] },
  { id: "gst-summary", title: "GST Summary & Monthly P&L", category: "Accounting Reports", view: "gst-summary", period: "none",
    about: "Input and output GST for a range, and the month's procurement, sales, profit and stock value.", keywords: ["gst", "summary", "monthly", "profit", "p&l", "procurement"] },
  { id: "doctor-wise-sales", title: "Daily Sales Summary – Doctorwise", category: "Others", view: "table", period: "range",
    about: "Pharmacy sales by prescribing doctor, with each doctor's share.", keywords: ["doctor", "doctorwise", "sales", "prescriber"] },
];

export const reportById = (id: string | null | undefined) => REPORTS.find((report) => report.id === id) ?? null;

const fold = (text: string) => text.toLowerCase().replace(/[\s\-–_.&]+/g, "");

/** Every word of the title and keywords, and each phrase whole, folded so "GSTR-3B" also reads as "gstr3b". */
const tokensOf = (report: ReportEntry) =>
  [report.title, ...report.keywords].flatMap((phrase) => [fold(phrase), ...phrase.split(/\s+/).map(fold)]).filter(Boolean);

/**
 * Each typed word must start one of the report's words, ignoring case and hyphens: "GSTR" finds the
 * four returns (and not "Composition GST Report"), "gstr3b" just one.
 */
export function searchReports(query: string, reports: ReportEntry[] = REPORTS): ReportEntry[] {
  const words = query.trim().split(/\s+/).map(fold).filter(Boolean);
  if (!words.length) return reports;
  return reports.filter((report) => {
    const tokens = tokensOf(report);
    return words.every((word) => tokens.some((token) => token.startsWith(word)));
  });
}

export const commonReports = () => REPORTS.filter((report) => report.common);

// ---- periods -----------------------------------------------------------------------------------

export type Range = { from: string; to: string };

const pad = (value: number) => String(value).padStart(2, "0");
const lastDay = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

export function monthRange(day: string, offset = 0): Range {
  const [year, month] = day.split("-").map(Number);
  const index = year * 12 + (month - 1) + offset;
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(lastDay(y, m))}` };
}

export function quarterRange(day: string, offset = 0): Range {
  const [year, month] = day.split("-").map(Number);
  // Financial-year quarters: Apr-Jun, Jul-Sep, Oct-Dec, Jan-Mar.
  const startMonth = month - ((month - 4 + 12) % 3);
  const start = monthRange(`${year}-${pad(startMonth)}-01`, offset * 3);
  return { from: start.from, to: monthRange(start.from, 2).to };
}

export type PeriodPreset = { id: string; label: string; range: Range };

export function periodPresets(today: string): PeriodPreset[] {
  const monthLabel = (range: Range) =>
    new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${range.from}T00:00:00Z`));
  const months = Array.from({ length: 12 }, (_, i) => monthRange(today, -i));
  return [
    { id: "this-month", label: `This month (${monthLabel(months[0])})`, range: { from: months[0].from, to: today } },
    { id: "last-month", label: `Last month (${monthLabel(months[1])})`, range: months[1] },
    ...months.slice(2).map((range) => ({ id: `month-${range.from.slice(0, 7)}`, label: monthLabel(range), range })),
    { id: "this-quarter", label: "This quarter", range: { from: quarterRange(today).from, to: today } },
    { id: "last-quarter", label: "Last quarter", range: quarterRange(today, -1) },
    { id: "this-fy", label: `This financial year`, range: { from: financialYear(today).from, to: today } },
    { id: "last-fy", label: "Last financial year", range: financialYear(today, -1) },
  ];
}

export const presetFor = (range: Range, today: string) =>
  periodPresets(today).find((preset) => preset.range.from === range.from && preset.range.to === range.to)?.id ?? "custom";

export function defaultRange(entry: ReportEntry, today: string): Range {
  if (entry.period === "day") return { from: today, to: today };
  const preset = periodPresets(today).find((p) => p.id === (entry.defaultPeriod ?? "this-month"))!;
  return preset.range;
}

// ---- URL state ---------------------------------------------------------------------------------

export type ReportParams = {
  from: string;
  to: string;
  type?: string;
  gst?: string;
  q?: string;
  window?: string;
  rate?: string;
};

const clean = (value: string | null | undefined) => (value && value.trim() ? value.trim() : undefined);

/** Reads a report's filters from the address bar, falling back to its defaults for anything missing or invalid. */
export function readParams(entry: ReportEntry, search: Pick<URLSearchParams, "get">, today: string): ReportParams {
  const fallback = defaultRange(entry, today);
  const from = clean(search.get("from"));
  const to = clean(search.get("to"));
  const validFrom = from && isDay(from) ? from : fallback.from;
  const validTo = entry.period === "day" ? validFrom : to && isDay(to) && to >= validFrom ? to : validFrom > fallback.to ? validFrom : fallback.to;
  const type = clean(search.get("type"));
  const gst = clean(search.get("gst"));
  const window = clean(search.get("window"));
  return {
    from: validFrom,
    to: validTo,
    type: entry.types ? (entry.types.some((o) => o.value === type) ? type : entry.defaultType) : undefined,
    gst: entry.gstFilter ? (["ALL", "WITH_GST", "WITHOUT_GST"].includes(gst ?? "") ? gst : "ALL") : undefined,
    q: entry.searchLabel ? clean(search.get("q")) : undefined,
    window: entry.windows ? (entry.windows.some((o) => o.value === window) ? window : "3m") : undefined,
    rate: entry.compositionRate ? clean(search.get("rate")) ?? "1" : undefined,
  };
}

export function reportHref(id: string, params?: Partial<ReportParams>) {
  const search = new URLSearchParams({ report: id });
  for (const [key, value] of Object.entries(params ?? {})) if (value !== undefined && value !== "") search.set(key, String(value));
  return `/dashboard/pharmacy/reports?${search}`;
}

/** Query string for the server: the period kind decides whether `to` is sent. */
export function apiParams(entry: ReportEntry, params: ReportParams): Record<string, string> {
  const out: Record<string, string> = { from: params.from };
  if (entry.period === "range") out.to = params.to;
  for (const key of ["type", "gst", "q", "window", "rate"] as const) if (params[key]) out[key] = params[key]!;
  return out;
}

export function exportHref(entry: ReportEntry, params: ReportParams, format: "xlsx" | "csv" | "pdf") {
  return `/api/pharmacy/reports/${entry.id}?${new URLSearchParams({ ...apiParams(entry, params), format })}`;
}

export const shiftDay = (day: string, days: number) => addDays(day, days);
