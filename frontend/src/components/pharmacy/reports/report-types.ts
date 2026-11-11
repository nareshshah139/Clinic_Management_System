/** Mirrors backend/src/modules/pharmacy/pharmacy-report-table.ts and pharmacy-daily-collection.ts. */
export type CellValue = string | number | null;
export type ColumnKind = "text" | "money" | "number" | "percent" | "date";

export type ReportColumn = { key: string; label: string; kind: ColumnKind; group?: string; frozen?: boolean; total?: boolean; help?: string };
export type ReportRow = { key: string; cells: Record<string, CellValue>; tone?: "muted" | "warning" };
export type ReportSection = {
  id: string;
  title: string;
  description?: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  totals: Record<string, CellValue> | null;
  emptyText?: string;
};
export type ReportTile = { label: string; value: CellValue; kind: ColumnKind; help?: string; tone?: "good" | "warning" | "bad" };

export type PharmacyReport = {
  id: string;
  title: string;
  period: { startDate: string; endDate: string; timeZone: string };
  headline: { label: string; value: number } | null;
  tiles: ReportTile[];
  sections: ReportSection[];
  notes: string[];
  search: string | null;
};

export const COLLECTION_MODES = ["CASH", "UPI", "CARD", "NETBANKING", "CHEQUE", "WALLET", "INSURANCE", "OTHER"] as const;
export type CollectionMode = (typeof COLLECTION_MODES)[number];

export type CashCount = {
  id: string;
  sequence: number;
  counted: Partial<Record<CollectionMode, number>>;
  note: string | null;
  countedBy: { id: string; name: string } | null;
  countedAt: string;
};

export type ModeLine = {
  mode: CollectionMode;
  label: string;
  onTodaysBills: number;
  onEarlierBills: number;
  counterSales: number;
  refunds: number;
  expected: number;
  counted: number | null;
  difference: number | null;
};

export type CollectionStatus = "NOT_COUNTED" | "BALANCED" | "SHORT" | "OVER";

export type DailyCollection = {
  day: string;
  modes: ModeLine[];
  billing: {
    billCount: number;
    billed: number;
    counterSaleCount: number;
    counterSales: number;
    counterSalesOnCredit: number;
    collectedOnTodaysBills: number;
    receivedBeforeToday: number;
    dueAtDayEnd: number;
    paidAboveBill: number;
    totalBilled: number;
  };
  refunds: { count: number; paidOut: number; storeCredit: number };
  outsideBills: { count: number; amount: number };
  expectedTotal: number;
  countedTotal: number | null;
  difference: number | null;
  status: CollectionStatus;
  count: CashCount | null;
  history: CashCount[];
};

/** Mirrors backend/src/modules/pharmacy/daily-collection-clinic.ts. */
export type ClinicCollection = {
  day: string;
  modes: { mode: CollectionMode; label: string; received: number; refunds: number; net: number }[];
  billCount: number;
  billed: number;
  collectedOnTodaysBills: number;
  dueAtDayEnd: number;
  received: number;
  refunds: number;
  net: number;
};
export type WholeDay = {
  modes: { mode: CollectionMode; label: string; clinic: number; pharmacy: number; total: number }[];
  clinic: number;
  pharmacy: number;
  total: number;
};

export type DailyCollectionReport = PharmacyReport & {
  collection: DailyCollection;
  canRecordCount: boolean;
  /** Null for a viewer who cannot read clinic bills. */
  clinic: ClinicCollection | null;
  wholeDay: WholeDay | null;
};
