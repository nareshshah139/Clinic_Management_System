import { UserRole } from "@cms/shared-types";

export const REPORT_CATEGORIES = ["GST Reports", "Margin Reports", "Stock Reports", "Accounting Reports", "Others"] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export type InPageReportId = "gst-summary" | "day-wise-summary" | "item-margin" | "monthly-report";

type ReportBase = { title: string; category: ReportCategory; description: string; keywords: readonly string[]; mostUsed: boolean };
export type InPageReport = ReportBase & { id: InPageReportId; href?: undefined };
/** A register that lives in Inventory: the catalog links to it instead of rendering it. */
export type LinkedReport = ReportBase & { id: string; href: string };
export type CatalogReport = InPageReport | LinkedReport;

export const isInPage = (report: CatalogReport): report is InPageReport => report.href === undefined;

export const REPORT_CATALOG: readonly CatalogReport[] = [
  { id: "gst-summary", title: "GST Summary", category: "GST Reports", mostUsed: true, keywords: ["gstr", "input credit", "output tax", "slab", "cgst", "sgst", "tax"], description: "Input credit and output tax by slab, with the posted source records." },
  { id: "day-wise-summary", title: "Day wise Summary", category: "GST Reports", mostUsed: true, keywords: ["daily", "bills", "sales", "purchase", "gaps", "slab"], description: "Bills, GST bands and totals for each day, with missing bill numbers flagged." },
  { id: "purchase-bills", title: "Purchase Bills", category: "GST Reports", mostUsed: false, keywords: ["supplier bills", "purchase register", "invoices"], description: "Supplier bills with their GST, in the Inventory purchase register.", href: "/dashboard/inventory?area=purchases&view=register" },
  { id: "item-margin", title: "Item Wise Margin", category: "Margin Reports", mostUsed: true, keywords: ["profit", "margin", "cost", "sales", "returns", "tags"], description: "What each item sold for, what it cost and what the clinic made." },
  { id: "stock-ledger", title: "Stock ledger", category: "Stock Reports", mostUsed: false, keywords: ["movements", "stock register", "in out"], description: "Every stock movement, in the Inventory stock ledger.", href: "/dashboard/inventory?area=stock&view=ledger" },
  { id: "monthly-report", title: "Monthly Report", category: "Accounting Reports", mostUsed: true, keywords: ["procurement", "p&l", "profit and loss", "stock value", "month"], description: "Procurement, sales, stock value and profit and loss for a month." },
  { id: "supplier-dues", title: "Supplier payments & dues", category: "Accounting Reports", mostUsed: false, keywords: ["creditors", "payables", "outstanding", "distributor"], description: "What the clinic owes each supplier, in the Inventory payments ledger.", href: "/dashboard/inventory?area=purchases&view=ledger" },
  { id: "purchase-costs", title: "Purchase costs", category: "Others", mostUsed: false, keywords: ["distributor", "price", "analytics", "rate"], description: "How purchase prices moved by supplier, in Inventory.", href: "/dashboard/inventory?area=purchases&view=analytics" },
];

export const findReport = (id: string | null | undefined) => REPORT_CATALOG.find((report) => report.id === id);

export const reportsIn = (category: ReportCategory, reports: readonly CatalogReport[] = REPORT_CATALOG) =>
  reports.filter((report) => report.category === category);

const words = (text: string) => text.toLowerCase().split(/[^a-z0-9&]+/).filter(Boolean);

/** Every word of the query must start a word of the title, category, description or keywords. An empty query lists all reports. */
export function searchReports(query: string, reports: readonly CatalogReport[] = REPORT_CATALOG): CatalogReport[] {
  const needles = words(query);
  if (!needles.length) return [...reports];
  return reports.filter((report) => {
    const haystack = words([report.title, report.category, report.description, ...report.keywords].join(" "));
    return needles.every((needle) => haystack.some((word) => word.startsWith(needle)));
  });
}

/** The roles that could open these reports as Inventory tasks; the report APIs enforce their own permissions. */
export const PHARMACY_REPORT_ROLES: readonly string[] = [UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.PHARMACIST, UserRole.DOCTOR];
