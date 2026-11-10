"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { CheckCircle2, AlertTriangle, CircleAlert } from "lucide-react";
import { apiClient } from "@/lib/api";
import { getErrorMessage, cn } from "@/lib/utils";
import { displayClinicDateTime } from "@/lib/date-display";
import { Button } from "@/components/ui/button";
import { LoadingSkeleton } from "@/components/ui/skeleton";
import { inputClass } from "@/components/inventory/workspace-model";
import { useReport } from "../pharmacy-report-model";
import { ReportInfoTip } from "../ReportInfoTip";
import { apiParams, type ReportEntry, type ReportParams } from "./report-catalog";
import { formatCell, formatRupee } from "./report-format";
import { ReportTable } from "./ReportTable";
import { ReportError, ReportNotes, ReportTiles } from "./TableReport";
import { ReportToolbar } from "./ReportToolbar";
import { countPayload, draftChanged, initialDraft, previewCount, statusMessage, type CountDraft } from "./collection-model";
import type { DailyCollectionReport as Report } from "./report-types";

const never = () => false;

const COLUMN_LABEL = { onTodaysBills: "Today's bills", onEarlierBills: "Earlier bills", counterSales: "Counter", refunds: "Refunds", expected: "Expected" } as const;

const COLUMN_HELP = {
  onTodaysBills: "Payments received today against bills dated today.",
  onEarlierBills: "Payments received today against bills from earlier days (balances settled today), and money taken on bills that are not final.",
  counterSales: "Counter sales paid at the counter today. Counter sales on credit move no money.",
  refunds: "Money handed back in this mode today: refunds on bills whose discount was revised, and customer returns. Refunds as store credit move no money.",
  expected: "On today's bills + On earlier bills + Counter sales - Refunds: what should be in hand.",
};

/**
 * CR-33 section A: the day's collection reconciled per payment mode. Staff count the drawer and
 * the UPI and card settlements and enter them in the same table, so the difference shows beside
 * what was expected, the same day.
 */
export function DailyCollectionReport({ entry, params, today, onApply }: { entry: ReportEntry; params: ReportParams; today: string; onApply: (params: ReportParams) => void }) {
  const [state, run] = useReport<Report>(never);
  const query = JSON.stringify(apiParams(entry, params));
  const load = useCallback(() => run(() => apiClient.get<Report>(`/pharmacy/reports/${entry.id}`, JSON.parse(query))), [entry.id, query, run]);
  useEffect(() => {
    void load();
  }, [load]);

  const [draft, setDraft] = useState<CountDraft>({});
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const noteId = useId();
  const report = state.status === "loaded" ? state.data : null;
  const collection = report?.collection ?? null;

  // A freshly loaded day or count starts the boxes from the latest count; after a conflicting save the
  // other person's count is loaded but what this person typed stays in the boxes.
  const keepTyped = useRef(false);
  const [draftFor, setDraftFor] = useState<string | null>(null);
  useEffect(() => {
    if (!collection) return;
    const key = `${collection.day}:${collection.count?.sequence ?? 0}`;
    if (draftFor === key) return;
    setDraftFor(key);
    if (keepTyped.current) {
      keepTyped.current = false;
      return;
    }
    setDraft(initialDraft(collection));
    setNote(collection.count?.note ?? "");
  }, [collection, draftFor]);
  useEffect(() => setMessage(null), [params.from]);

  const preview = collection ? previewCount(collection.modes, draft) : null;
  const status = collection ? statusMessage(collection.status, collection.difference) : null;
  const StatusIcon = status?.tone === "good" ? CheckCircle2 : status?.tone === "bad" ? CircleAlert : AlertTriangle;
  const dirty = collection ? draftChanged(collection, draft, note) : false;

  const save = async () => {
    if (!collection || !preview || preview.anyInvalid || !preview.entered) return;
    setSaving(true);
    setMessage(null);
    try {
      const saved = await apiClient.post<Report>(`/pharmacy/reports/daily-collection/${collection.day}/counts`, {
        counted: countPayload(draft),
        note: note.trim() || undefined,
        basedOnSequence: collection.count?.sequence ?? 0,
      });
      await run(async () => saved);
      setMessage({ tone: "good", text: `Count saved. ${statusMessage(saved.collection.status, saved.collection.difference).text}` });
    } catch (error) {
      const conflict = (error as { status?: number })?.status === 409;
      setMessage({
        tone: "bad",
        text: conflict
          ? "Someone else saved a count for this day while you were entering yours. Their count is shown below; your figures are still in the boxes. Check them and save again."
          : `${getErrorMessage(error)} Nothing was saved.`,
      });
      if (conflict) {
        keepTyped.current = true;
        await load();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <ReportToolbar entry={entry} params={params} today={today} loading={state.status === "loading"} canExport={state.status === "loaded"} onApply={onApply} />
      {state.status === "loading" && <LoadingSkeleton variant="table" label="Loading the day's collection…" />}
      {state.status === "error" && <ReportError message={state.message} httpStatus={state.httpStatus} />}
      {report && collection && status && preview && (
        <>
          <p
            role="status"
            data-testid="collection-status"
            data-status={collection.status}
            className={cn(
              "flex items-start gap-2 rounded-lg border p-3 text-base font-medium",
              status.tone === "good" && "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100",
              status.tone === "bad" && "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100",
              status.tone === "warning" && "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100",
            )}
          >
            <StatusIcon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            {status.text}
          </p>
          <ReportTiles tiles={report.tiles} />

          <section aria-labelledby="collection-modes" className="space-y-2">
            <h3 id="collection-modes" className="text-lg font-semibold">
              Reconciliation by payment mode
            </h3>
            <ul className="space-y-3 md:hidden" aria-label="Count by payment mode">
              {collection.modes.map((line, index) => {
                const p = preview.lines[index];
                return (
                  <li key={line.mode} className="rounded-lg border p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-lg font-semibold">{line.label}</span>
                      <span className="text-base tabular-nums">
                        Expected <strong>{formatRupee(line.expected)}</strong>
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground tabular-nums">
                      Bills {formatCell(line.onTodaysBills + line.onEarlierBills, "money")} · Counter {formatCell(line.counterSales, "money")} · Refunds {formatCell(line.refunds, "money")}
                    </p>
                    <div className="mt-2 flex items-end justify-between gap-3">
                      {report.canRecordCount ? (
                        <label className="flex flex-1 flex-col gap-1 text-base font-medium">
                          Counted
                          <input
                            aria-label={`${line.label} counted`}
                            inputMode="decimal"
                            className={cn(inputClass, "h-12 text-right text-lg", p.invalid && "border-destructive")}
                            aria-invalid={p.invalid || undefined}
                            placeholder="0.00"
                            value={draft[line.mode] ?? ""}
                            onChange={(event) => setDraft((current) => ({ ...current, [line.mode]: event.target.value }))}
                          />
                        </label>
                      ) : (
                        <span className="text-base">Counted {formatCell(line.counted, "money") || "—"}</span>
                      )}
                      <span className={cn("pb-2 text-lg font-semibold tabular-nums", p.difference !== null && Math.abs(p.difference) >= 0.005 && (p.difference < 0 ? "text-destructive" : "text-amber-700 dark:text-amber-300"))}>
                        {p.difference === null ? "—" : `${p.difference > 0 ? "+" : ""}${formatCell(p.difference, "money")}`}
                      </span>
                    </div>
                  </li>
                );
              })}
              <li className="flex justify-between rounded-lg bg-muted p-3 text-base font-semibold tabular-nums">
                <span>Expected {formatRupee(collection.expectedTotal)}</span>
                <span>Difference {preview.difference === null ? "—" : `${preview.difference > 0 ? "+" : ""}${formatCell(preview.difference, "money")}`}</span>
              </li>
            </ul>
            <div className="hidden overflow-x-auto rounded-md border md:block">
              <table aria-label="Reconciliation by payment mode" className="w-full min-w-[52rem] border-separate border-spacing-0 text-base">
                <thead>
                  <tr className="[&>th]:border-b [&>th]:bg-muted [&>th]:px-3 [&>th]:py-2.5 [&>th]:font-semibold">
                    <th scope="col" className="sticky left-0 z-10 whitespace-nowrap text-left">Mode</th>
                    {(Object.keys(COLUMN_HELP) as (keyof typeof COLUMN_HELP)[]).map((key) => (
                      <th key={key} scope="col" className="whitespace-nowrap text-right">
                        <span className="inline-flex flex-row-reverse items-center gap-1">
                          {COLUMN_LABEL[key]}
                          <ReportInfoTip label={`the ${key} column`}>{COLUMN_HELP[key]}</ReportInfoTip>
                        </span>
                      </th>
                    ))}
                    <th scope="col" className="whitespace-nowrap text-right">Counted</th>
                    <th scope="col" className="whitespace-nowrap text-right">Difference</th>
                  </tr>
                </thead>
                <tbody>
                  {collection.modes.map((line, index) => {
                    const p = preview.lines[index];
                    return (
                      <tr key={line.mode} className="[&>td]:border-b [&>td]:bg-background [&>td]:px-3 [&>td]:py-2 [&>td]:tabular-nums">
                        <th scope="row" className="sticky left-0 z-10 whitespace-nowrap border-b bg-background px-3 py-2 text-left font-medium">{line.label}</th>
                        <td className="text-right">{formatCell(line.onTodaysBills, "money")}</td>
                        <td className="text-right">{formatCell(line.onEarlierBills, "money")}</td>
                        <td className="text-right">{formatCell(line.counterSales, "money")}</td>
                        <td className={cn("text-right", line.refunds > 0 && "text-destructive")}>{line.refunds ? `-${formatCell(line.refunds, "money")}` : formatCell(0, "money")}</td>
                        <td className="text-right font-semibold">{formatCell(line.expected, "money")}</td>
                        <td className="text-right">
                          {report.canRecordCount ? (
                            <input
                              aria-label={`${line.label} counted`}
                              inputMode="decimal"
                              className={cn(inputClass, "ml-auto h-11 w-36 text-right text-base", p.invalid && "border-destructive")}
                              aria-invalid={p.invalid || undefined}
                              placeholder="0.00"
                              value={draft[line.mode] ?? ""}
                              onChange={(event) => setDraft((current) => ({ ...current, [line.mode]: event.target.value }))}
                            />
                          ) : (
                            formatCell(line.counted, "money") || "—"
                          )}
                        </td>
                        <td
                          className={cn("text-right font-semibold", p.difference !== null && Math.abs(p.difference) >= 0.005 && (p.difference < 0 ? "text-destructive" : "text-amber-700 dark:text-amber-300"))}
                          data-testid={`difference-${line.mode}`}
                        >
                          {p.difference === null ? "—" : `${p.difference > 0 ? "+" : ""}${formatCell(p.difference, "money")}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="[&>td]:bg-muted [&>td]:px-3 [&>td]:py-2.5 [&>td]:font-semibold [&>td]:tabular-nums">
                    <th scope="row" className="sticky left-0 z-10 bg-muted px-3 py-2.5 text-left font-semibold">Total</th>
                    <td className="text-right">{formatCell(collection.modes.reduce((s, l) => s + l.onTodaysBills, 0), "money")}</td>
                    <td className="text-right">{formatCell(collection.modes.reduce((s, l) => s + l.onEarlierBills, 0), "money")}</td>
                    <td className="text-right">{formatCell(collection.modes.reduce((s, l) => s + l.counterSales, 0), "money")}</td>
                    <td className="text-right">{formatCell(-collection.modes.reduce((s, l) => s + l.refunds, 0), "money")}</td>
                    <td className="text-right" data-testid="expected-total">{formatCell(collection.expectedTotal, "money")}</td>
                    <td className="text-right" data-testid="counted-total">{preview.counted === null ? "—" : formatCell(preview.counted, "money")}</td>
                    <td className="text-right" data-testid="difference-total">
                      {preview.difference === null ? "—" : `${preview.difference > 0 ? "+" : ""}${formatCell(preview.difference, "money")}`}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {report.canRecordCount && (
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex min-w-64 flex-1 flex-col gap-1">
                  <label htmlFor={noteId} className="text-base font-medium">
                    Note (optional)
                  </label>
                  <input id={noteId} className={cn(inputClass, "h-11 text-base")} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="For example: ₹500 kept aside for change" />
                </div>
                <Button type="button" className="h-11 px-6 text-base" disabled={saving || preview.anyInvalid || !preview.entered || !dirty} onClick={save}>
                  {saving ? "Saving…" : collection.count ? "Save recount" : "Save count"}
                </Button>
              </div>
            )}
            {preview.anyInvalid && (
              <p role="alert" className="text-base text-destructive">
                Enter amounts as numbers, for example 18250 or 18,250.50.
              </p>
            )}
            {message && (
              <p role={message.tone === "bad" ? "alert" : "status"} className={cn("text-base", message.tone === "bad" ? "text-destructive" : "text-emerald-800 dark:text-emerald-200")}>
                {message.text}
              </p>
            )}
            {collection.count && (
              <details className="text-base" data-testid="count-history">
                <summary className="cursor-pointer">
                  Counted by {collection.count.countedBy?.name ?? "someone"} at {displayClinicDateTime(collection.count.countedAt)}
                  {collection.history.length > 1 ? ` · ${collection.history.length - 1} earlier count${collection.history.length > 2 ? "s" : ""}` : ""}
                </summary>
                <ol className="mt-2 space-y-1 pl-5">
                  {collection.history.map((count) => (
                    <li key={count.id} className="list-decimal">
                      {displayClinicDateTime(count.countedAt)} by {count.countedBy?.name ?? "someone"}:{" "}
                      {Object.entries(count.counted)
                        .map(([mode, value]) => `${collection.modes.find((m) => m.mode === mode)?.label ?? mode} ${formatRupee(value)}`)
                        .join(", ")}
                      {count.note ? ` — ${count.note}` : ""}
                    </li>
                  ))}
                </ol>
              </details>
            )}
          </section>

          {report.sections
            .filter((section) => section.id !== "modes")
            .map((section) => (
              <section key={section.id} className="space-y-2" aria-labelledby={`collection-${section.id}`}>
                <h3 id={`collection-${section.id}`} className="text-lg font-semibold">
                  {section.title}
                </h3>
                <ReportTable section={section} />
              </section>
            ))}
          <ReportNotes notes={report.notes} />
        </>
      )}
    </div>
  );
}
