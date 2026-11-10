"use client";

import { useCallback, useEffect } from "react";
import { apiClient } from "@/lib/api";
import { LoadingSkeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { reportErrorHint, useReport } from "../pharmacy-report-model";
import { apiParams, type ReportEntry, type ReportParams } from "./report-catalog";
import { formatCell, formatRupee } from "./report-format";
import { ReportTable } from "./ReportTable";
import { ReportToolbar } from "./ReportToolbar";
import type { PharmacyReport, ReportTile } from "./report-types";

const isEmpty = (report: PharmacyReport) => report.sections.every((section) => section.rows.length === 0);

export function ReportTiles({ tiles }: { tiles: ReportTile[] }) {
  if (!tiles.length) return null;
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className={cn(
            "rounded-lg border p-4",
            tile.tone === "good" && "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40",
            tile.tone === "bad" && "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/40",
            tile.tone === "warning" && "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40",
          )}
        >
          <dt className="text-base font-medium">{tile.label}</dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums">
            {tile.kind === "money" && typeof tile.value === "number" ? formatRupee(tile.value) : formatCell(tile.value, tile.kind)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function ReportNotes({ notes }: { notes: string[] }) {
  if (!notes.length) return null;
  return (
    <details className="rounded-md border p-3 text-base">
      <summary className="cursor-pointer font-medium">How these figures are worked out</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </details>
  );
}

export function ReportError({ message, httpStatus }: { message: string; httpStatus?: number }) {
  return (
    <p role="alert" className="rounded-md border border-destructive p-3 text-base text-destructive">
      {message} {reportErrorHint(httpStatus)}
    </p>
  );
}

/** Any report the server lays out as sections: the GST set, HSN, composition, doctor-wise, expiring stock. */
export function TableReport({ entry, params, today, onApply }: { entry: ReportEntry; params: ReportParams; today: string; onApply: (params: ReportParams) => void }) {
  const [state, run] = useReport<PharmacyReport>(isEmpty);
  const query = JSON.stringify(apiParams(entry, params));
  const load = useCallback(() => run(() => apiClient.get<PharmacyReport>(`/pharmacy/reports/${entry.id}`, JSON.parse(query))), [entry.id, query, run]);
  useEffect(() => {
    void load();
  }, [load]);

  const report = state.status === "loaded" || state.status === "empty" ? state.data : null;
  return (
    <div className="space-y-4">
      <ReportToolbar entry={entry} params={params} today={today} loading={state.status === "loading"} canExport={state.status === "loaded" || state.status === "empty"} onApply={onApply} />
      {report?.headline && (
        <p className="flex items-baseline justify-end gap-3" aria-live="polite">
          <span className="text-base font-medium">{report.headline.label}</span>
          <span className="text-2xl font-semibold tabular-nums" data-testid="report-headline">
            {formatRupee(report.headline.value)}
          </span>
        </p>
      )}
      {state.status === "loading" && <LoadingSkeleton variant="table" label={`Loading ${entry.title}…`} />}
      {state.status === "error" && <ReportError message={state.message} httpStatus={state.httpStatus} />}
      {report && (
        <>
          <ReportTiles tiles={report.tiles} />
          {state.status === "empty" && report.sections.length === 1 ? (
            <p className="rounded-md border border-dashed p-4 text-base">{report.sections[0].emptyText ?? "Nothing in this period."} Choose another period and press Go.</p>
          ) : (
            report.sections.map((section) => (
              <section key={section.id} className="space-y-2" aria-labelledby={report.sections.length > 1 ? `section-${section.id}` : undefined}>
                {report.sections.length > 1 && (
                  <h3 id={`section-${section.id}`} className="text-lg font-semibold">
                    {section.title}
                  </h3>
                )}
                <ReportTable section={section} label={report.sections.length > 1 ? `${report.title}: ${section.title}` : report.title} />
              </section>
            ))
          )}
          <ReportNotes notes={report.notes} />
        </>
      )}
    </div>
  );
}
