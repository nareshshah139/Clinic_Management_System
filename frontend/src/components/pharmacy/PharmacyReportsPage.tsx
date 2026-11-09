"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowUpRight, ChevronDown, Search } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { LoadingSkeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDashboardUser } from "@/components/layout/dashboard-user-context";
import { cn } from "@/lib/utils";
import { ComplianceCenter } from "./ComplianceCenter";
import { DayWiseSummaryReport } from "./DayWiseSummaryReport";
import { ItemMarginReport } from "./ItemMarginReport";
import {
  type CatalogReport,
  type InPageReport,
  type InPageReportId,
  PHARMACY_REPORT_ROLES,
  REPORT_CATALOG,
  REPORT_CATEGORIES,
  findReport,
  isInPage,
  reportsIn,
  searchReports,
} from "./pharmacy-report-catalog";

const IN_PAGE_REPORTS: Record<InPageReportId, () => React.ReactNode> = {
  "gst-summary": () => <ComplianceCenter report="gst-summary" />,
  "monthly-report": () => <ComplianceCenter report="monthly-report" />,
  "day-wise-summary": () => <DayWiseSummaryReport />,
  "item-margin": () => <ItemMarginReport />,
};

const reportHref = (report: CatalogReport) => report.href ?? `/dashboard/pharmacy/reports?report=${report.id}`;

function ReportLink({ report, active, onNavigate }: { report: CatalogReport; active: boolean; onNavigate: () => void }) {
  return (
    <Link
      href={reportHref(report)}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-10 items-center justify-between gap-2 rounded-md px-3 py-2 text-sm transition-colors",
        active ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-accent-soft hover:text-foreground",
      )}
    >
      <span className="min-w-0">{report.title}</span>
      {!isInPage(report) && <ArrowUpRight className="size-4 shrink-0" aria-label="Opens in Inventory" />}
    </Link>
  );
}

function CategoryList({ reports, activeId, onNavigate }: { reports: readonly CatalogReport[]; activeId: string | null; onNavigate: () => void }) {
  const categories = REPORT_CATEGORIES.filter((category) => reportsIn(category, reports).length > 0);
  if (!categories.length) return <p className="px-3 py-2 text-sm text-muted-foreground">No reports match your search.</p>;
  return (
    <>
      {categories.map((category) => (
        <section key={category} aria-labelledby={`report-category-${category}`} className="space-y-1">
          <h2 id={`report-category-${category}`} className="px-3 text-sm font-semibold text-foreground">{category}</h2>
          <ul className="space-y-0.5">
            {reportsIn(category, reports).map((report) => (
              <li key={report.id}><ReportLink report={report} active={report.id === activeId} onNavigate={onNavigate} /></li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function ReportCard({ report }: { report: CatalogReport }) {
  return (
    <Link
      href={reportHref(report)}
      className="flex min-h-28 min-w-0 flex-col gap-1 rounded-md border bg-card p-4 transition-colors hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-primary"
    >
      <span className="flex items-center justify-between gap-2 text-base font-semibold">
        {report.title}
        {!isInPage(report) && <ArrowUpRight className="size-4 shrink-0" aria-label="Opens in Inventory" />}
      </span>
      <span className="text-sm text-muted-foreground">{report.description}</span>
      {!isInPage(report) && <span className="mt-auto text-sm text-muted-foreground">Opens in Inventory</span>}
    </Link>
  );
}

function Landing({ query, results }: { query: string; results: readonly CatalogReport[] }) {
  if (query.trim()) {
    return (
      <section aria-label="Search results" className="space-y-3">
        <h2 className="text-lg font-semibold">{results.length} {results.length === 1 ? "report matches" : "reports match"} “{query.trim()}”</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{results.map((report) => <ReportCard key={report.id} report={report} />)}</div>
      </section>
    );
  }
  const mostUsed = REPORT_CATALOG.filter((report) => report.mostUsed);
  return (
    <div className="space-y-6">
      <section aria-labelledby="most-used-reports" className="space-y-3">
        <h2 id="most-used-reports" className="text-lg font-semibold">Most used</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{mostUsed.map((report) => <ReportCard key={report.id} report={report} />)}</div>
      </section>
      {REPORT_CATEGORIES.map((category) => (
        <section key={category} aria-labelledby={`all-${category}`} className="space-y-3">
          <h2 id={`all-${category}`} className="text-lg font-semibold">{category}</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{reportsIn(category).map((report) => <ReportCard key={report.id} report={report} />)}</div>
        </section>
      ))}
    </div>
  );
}

/**
 * @cc [owner:nareshshah139,label:product] pharmacy-report-menu
 * Pharmacy reports MUST be reached from their own Pharmacy Report menu item: categories down the left,
 * a search box, and the most used reports on the landing page. Reports that live in Inventory are
 * listed with a link that says so; they are not duplicated here.
 */
function PharmacyReports() {
  const { user, loading } = useDashboardUser();
  const params = useSearchParams();
  const [query, setQuery] = useState("");
  const [railOpen, setRailOpen] = useState(false);
  const selected = findReport(params.get("report"));
  const open = selected && isInPage(selected) ? (selected as InPageReport) : undefined;
  const results = searchReports(query);

  if (loading) return <LoadingSkeleton variant="table" label="Loading reports…" />;
  if (!user || !PHARMACY_REPORT_ROLES.includes(user.role)) {
    return (
      <div className="space-y-2">
        <PageHeader title="Pharmacy Report" />
        <p role="alert" className="rounded-md border border-destructive p-3 text-destructive">
          Your role cannot open pharmacy reports. Ask the clinic owner or an admin for pharmacy compliance access.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PageHeader title="Pharmacy Report" description="GST, margin, stock and accounting reports for the pharmacy." />
      <div className="grid min-w-0 gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="min-w-0 space-y-3 lg:sticky lg:top-4 lg:self-start">
          <div className="space-y-1">
            <Label htmlFor="report-search">Search reports</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input id="report-search" type="search" className="pl-9" placeholder="Search reports" value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>
          </div>
          <button
            type="button"
            className="flex min-h-10 w-full items-center justify-between rounded-md border px-3 text-sm font-medium lg:hidden"
            aria-expanded={railOpen}
            aria-controls="report-categories"
            onClick={() => setRailOpen((current) => !current)}
          >
            Browse by category
            <ChevronDown className={cn("size-4 transition-transform", railOpen && "rotate-180")} aria-hidden="true" />
          </button>
          <nav id="report-categories" aria-label="Report categories" className={cn("space-y-4", !railOpen && "hidden lg:block lg:space-y-4")}>
            <CategoryList reports={results} activeId={open?.id ?? null} onNavigate={() => setRailOpen(false)} />
          </nav>
        </aside>
        <main className="min-w-0 space-y-4">
          {open ? (
            <>
              <Link href="/dashboard/pharmacy/reports" className="inline-flex min-h-10 items-center gap-1 text-sm text-primary underline-offset-4 hover:underline">
                <ArrowLeft className="size-4" aria-hidden="true" /> All reports
              </Link>
              {IN_PAGE_REPORTS[open.id]()}
            </>
          ) : (
            <Landing query={query} results={results} />
          )}
        </main>
      </div>
    </div>
  );
}

export function PharmacyReportsPage() {
  return (
    <Suspense fallback={<LoadingSkeleton variant="table" label="Loading reports…" />}>
      <PharmacyReports />
    </Suspense>
  );
}
