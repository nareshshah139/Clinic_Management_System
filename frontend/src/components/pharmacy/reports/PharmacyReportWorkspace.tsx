"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Info, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { inputClass } from "@/components/inventory/workspace-model";
import { ComplianceCenter } from "../ComplianceCenter";
import { DayWiseSummaryReport } from "../DayWiseSummaryReport";
import { ItemMarginReport } from "../ItemMarginReport";
import { ReportInfoTip } from "../ReportInfoTip";
import { clinicToday } from "../pharmacy-report-model";
import { CATEGORIES, commonReports, readParams, reportById, reportHref, searchReports, type ReportEntry, type ReportParams } from "./report-catalog";
import { DailyCollectionReport } from "./DailyCollectionReport";
import { TableReport } from "./TableReport";

/**
 * @cc [owner:nareshshah139,label:product] pharmacy-report-menu
 * Pharmacy Report MUST list every pharmacy report under GST, Margin, Stock, Accounting and Other
 * categories, find reports by search across titles and keywords, surface the common reports on
 * its landing page, and keep the open report and its filters in the address bar.
 */
function ReportRail({ query, onQuery, active }: { query: string; onQuery: (value: string) => void; active: string | null }) {
  const found = searchReports(query);
  return (
    <nav aria-label="Pharmacy reports" className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          type="search"
          aria-label="Search reports"
          placeholder="Search reports, e.g. GSTR"
          className={cn(inputClass, "h-11 pl-9 text-base")}
          value={query}
          onChange={(event) => onQuery(event.target.value)}
        />
      </div>
      {found.length === 0 && <p className="text-base">No report matches “{query}”.</p>}
      {CATEGORIES.map((category) => {
        const reports = found.filter((report) => report.category === category);
        if (!reports.length) return null;
        return (
          <div key={category}>
            <h2 className="px-2 pb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{category}</h2>
            <ul className="space-y-0.5">
              {reports.map((report) => (
                <li key={report.id}>
                  <Link
                    href={reportHref(report.id)}
                    aria-current={active === report.id ? "page" : undefined}
                    className={cn(
                      "block rounded-md px-2 py-2 text-base",
                      active === report.id ? "bg-accent font-semibold text-accent-foreground" : "hover:bg-accent-soft",
                    )}
                  >
                    {report.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function Landing() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Pharmacy Report</h1>
      <p className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-base text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
        <Info className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        Every figure comes from the stock and purchase records behind it. Until the stock take and medicine-name clean-up are done, check margins and GST totals against the bills before filing.
      </p>
      <section aria-labelledby="common-reports" className="space-y-3">
        <h2 id="common-reports" className="text-xl font-semibold">
          Common reports
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {commonReports().map((report) => (
            <li key={report.id}>
              <Link href={reportHref(report.id)} className="flex h-full flex-col gap-1 rounded-lg border p-4 hover:border-primary hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-primary">
                <span className="text-lg font-semibold">{report.title}</span>
                <span className="text-base">{report.about}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function ReportBody({ entry, params, today, onApply }: { entry: ReportEntry; params: ReportParams; today: string; onApply: (params: ReportParams) => void }) {
  switch (entry.view) {
    case "collection":
      return <DailyCollectionReport entry={entry} params={params} today={today} onApply={onApply} />;
    case "day-wise":
      return <DayWiseSummaryReport />;
    case "margin":
      return <ItemMarginReport />;
    case "gst-summary":
      return <ComplianceCenter reportsOnly />;
    default:
      return <TableReport key={entry.id} entry={entry} params={params} today={today} onApply={onApply} />;
  }
}

export function PharmacyReportWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const today = clinicToday();
  const entry = reportById(searchParams.get("report"));
  const search = searchParams.toString();
  const params = useMemo(() => (entry ? readParams(entry, new URLSearchParams(search), today) : null), [entry, search, today]);
  const apply = (next: ReportParams) => {
    if (!entry) return;
    router.replace(reportHref(entry.id, next), { scroll: false });
  };

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <aside className={cn("lg:w-72 lg:shrink-0", entry ? "hidden 2xl:sticky 2xl:top-4 2xl:block" : "block lg:sticky lg:top-4")}>
        <ReportRail query={query} onQuery={setQuery} active={entry?.id ?? null} />
      </aside>
      <section className="min-w-0 flex-1 space-y-4" aria-label={entry ? entry.title : "Pharmacy Report"}>
        {!entry && searchParams.get("report") && (
          <p role="alert" className="text-base text-destructive">
            That report is not available. Choose one from the list.
          </p>
        )}
        {entry && params ? (
          <>
            <nav aria-label="Breadcrumb" className="text-base">
              <Link href="/dashboard/pharmacy/reports" className="inline-flex items-center gap-1 font-medium hover:underline">
                <ArrowLeft className="size-4" aria-hidden="true" /> Pharmacy Report
              </Link>
              <span className="text-muted-foreground"> / {entry.category}</span>
            </nav>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold">{entry.title}</h1>
              <ReportInfoTip label={`the ${entry.title} report`}>{entry.about}</ReportInfoTip>
            </div>
            <ReportBody entry={entry} params={params} today={today} onApply={apply} />
          </>
        ) : (
          <Landing />
        )}
      </section>
    </div>
  );
}

