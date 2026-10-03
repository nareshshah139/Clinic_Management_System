"use client";

import { AlertTriangle, CheckCircle2, Circle, FileSearch } from "lucide-react";
import { ReviewStatus, reviewColors } from "@/components/ui/ReviewStatus";
import { focusPurchaseField } from "@/lib/purchase-invoice-review";

const money = (value: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
    value,
  );

/**
 * @cc [owner:nareshshah139,label:product] invoice-verification-summary
 * Only a server-confirmed stock commit may show the final step as complete. Zero OCR flags MUST
 * NOT imply human verification. Missing printed totals MUST stay unknown; a difference exceeding
 * one paise MUST be shown with its amount. Section links MUST reveal their target before focusing.
 */
export function PurchaseReviewSummary({
  hasContent,
  saved,
  committed,
  cancelled,
  unknown,
  checks,
  lines,
  calculated,
  printed,
}: {
  hasContent: boolean;
  saved: boolean;
  committed: boolean;
  cancelled: boolean;
  unknown: boolean;
  checks: number;
  lines: number;
  calculated: number;
  printed: unknown;
}) {
  const hasPrinted =
    printed !== null &&
    printed !== undefined &&
    printed !== "" &&
    Number.isFinite(Number(printed));
  const difference = hasPrinted && Number.isFinite(calculated)
    ? Math.round((calculated - Number(printed)) * 100) / 100
    : null;
  const current = committed && !unknown ? 3 : saved ? 2 : hasContent ? 1 : 0;
  const paused = unknown || cancelled;
  return (
    <section aria-label="Invoice progress" className="space-y-3 border-y py-4">
      <ol className="grid grid-cols-3 gap-3 text-sm">
        {["Scan or type", "Check details", "Add stock"].map((label, index) => {
          const complete = !paused && current > index;
          const Icon = complete
            ? CheckCircle2
            : current === index
              ? FileSearch
              : Circle;
          return (
            <li
              key={label}
              aria-current={!paused && current === index ? "step" : undefined}
              className={`flex items-center gap-2 rounded-md border p-2 ${complete ? reviewColors.success : current === index && !paused ? reviewColors.warning : reviewColors.neutral}`}
            >
              <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
              <span>
                {index + 1}. {label}
                <span className="sr-only">{complete ? " complete" : ""}</span>
              </span>
            </li>
          );
        })}
      </ol>
      {hasContent && !committed && !cancelled && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <a
            href="#purchase-review-checklist"
            onClick={() => focusPurchaseField("purchase-review-checklist")}
            className="flex items-center gap-2 underline underline-offset-4"
          >
            {checks > 0 ? (
              <AlertTriangle
                aria-hidden="true"
                className="h-4 w-4 text-amber-700 dark:text-amber-300"
              />
            ) : (
              <FileSearch aria-hidden="true" className="h-4 w-4" />
            )}
            {checks
              ? `${checks} ${checks === 1 ? "check" : "checks"} left`
              : "Compare every item with the bill"}
          </a>
          <a
            href="#purchase-line-items"
            onClick={() => focusPurchaseField("purchase-line-items")}
            className="underline underline-offset-4"
          >
            {lines} {lines === 1 ? "product" : "products"}
          </a>
          <a
            href="#purchase-totals"
            onClick={() => focusPurchaseField("purchase-totals")}
            className="underline underline-offset-4"
          >
            Check total
          </a>
        </div>
      )}
      {hasContent && (
        <dl
          aria-label="Compare bill total"
          className="flex flex-wrap gap-x-8 gap-y-2 text-sm"
        >
          <div>
            <dt className="text-muted-foreground">Bill total</dt>
            <dd className="font-semibold">
              {hasPrinted ? money(Number(printed)) : "Not entered"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Calculated total</dt>
            <dd className="font-semibold">{money(calculated)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Difference</dt>
            <dd className="mt-1">
              <ReviewStatus tone={difference === null ? "warning" : Math.abs(difference) <= 0.01 ? "success" : "error"}>
                {difference === null
                  ? "Enter bill total to compare"
                  : Math.abs(difference) <= 0.01
                    ? "Totals match"
                    : `${money(difference)} — check amounts`}
              </ReviewStatus>
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}
