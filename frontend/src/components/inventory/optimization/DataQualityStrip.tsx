"use client";

import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { apiClient } from "@/lib/api";
import { GAPS, type GapCounts, type GapKey } from "./stock-optimization-model";

const TONE = {
  red: "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100",
  amber: "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100",
  calm: "border-border bg-background text-muted-foreground",
};
const DOT = { red: "bg-red-600", amber: "bg-amber-500", calm: "bg-emerald-600" };

/**
 * @cc [owner:nareshshah139,label:product] data-quality-strip
 * The strip MUST show all five gap counts for the branch, zero included and calm, red for HSN and
 * unmapped and amber for the rest, and each MUST open the stock list filtered to exactly that gap.
 */
export function DataQualityStrip({ active, onOpen }: { active?: string; onOpen: (gap: GapKey | "") => void }) {
  const [counts, setCounts] = useState<GapCounts | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    apiClient.get<GapCounts>("/inventory/workspace/stock/gaps").then(
      (loaded) => {
        setCounts(loaded);
        setFailed(false);
      },
      () => setFailed(true),
    );
  }, []);
  useEffect(() => {
    load();
    window.addEventListener("inventory-workspace-refresh", load);
    window.addEventListener("inventory-stock-refresh", load);
    return () => {
      window.removeEventListener("inventory-workspace-refresh", load);
      window.removeEventListener("inventory-stock-refresh", load);
    };
  }, [load]);
  if (failed && !counts) return null;
  return (
    <section aria-label="Data quality" aria-busy={!counts} className="space-y-1.5 print:hidden">
      <h2 className="text-sm font-semibold">
        Data quality <span className="font-normal text-muted-foreground">· press a count to list those batches</span>
      </h2>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {GAPS.map((gap) => {
          const count = counts?.[gap.key];
          const tone = count ? gap.tone : "calm";
          const pressed = active === gap.key;
          return (
            <li key={gap.key} className={gap.key === "UNMAPPED" ? "max-sm:col-span-2" : undefined}>
              <button
                type="button"
                aria-pressed={pressed}
                aria-label={`${gap.label}: ${count ?? "loading"} ${count === 1 ? "batch" : "batches"}, ${gap.why}. ${pressed ? "Show all stock" : "Show them"}`}
                disabled={count === undefined}
                onClick={() => onOpen(pressed ? "" : gap.key)}
                className={`flex min-h-10 w-full items-center gap-2 rounded-md border px-3 py-1.5 text-left text-sm transition-colors hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60 ${TONE[tone]} ${pressed ? "ring-2 ring-primary ring-offset-1" : ""}`}
              >
                <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${DOT[tone]}`} />
                <span className="min-w-0 flex-1 truncate">{gap.label}</span>
                <span className="font-semibold tabular-nums" data-testid={`gap-${gap.key}`}>
                  {count ?? "…"}
                </span>
                <Search aria-hidden="true" className="h-4 w-4 shrink-0 opacity-70" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
