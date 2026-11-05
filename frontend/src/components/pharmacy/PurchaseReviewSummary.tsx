"use client";

import { AlertTriangle, CheckCircle2, Circle, FileSearch } from "lucide-react";
import { ReviewStatus, reviewColors } from "@/components/ui/ReviewStatus";
import { focusPurchaseField } from "@/lib/purchase-invoice-review";

// Keep aligned with PharmacyPurchaseInvoiceService's reconciliation tolerance.
const reconciliationTolerance = 1;

const money = (value: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
    value,
  );

/**
 * @cc [owner:nareshshah139,label:product] invoice-verification-summary
 * Only a server-confirmed stock commit may show the final step as complete. Zero OCR flags MUST
 * NOT imply human verification. Missing printed totals MUST stay unknown; a difference exceeding
 * one paise MUST be shown with its amount. Linked receipts MUST name the final action Post bill
 * rather than Add stock. Section links MUST reveal their target before focusing.
 */
/**
 * @cc [owner:nareshshah139,label:product] invoice-total-tolerance
 * Nonzero differences up to and including INR 1 MUST show their amount and tolerance as
 * informational, not as an error or human verification. Larger differences MUST request correction.
 * Proceed guidance applies only to this comparison and MUST be absent for posted, cancelled or
 * unknown outcomes; other invoice checks and final approval remain required.
 */
export function PurchaseReviewSummary({
  hasContent,
  saved,
  committed,
  cancelled,
  unknown,
  stockReceivedEarlier = false,
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
  stockReceivedEarlier?: boolean;
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
    ? (Math.round(calculated * 100) - Math.round(Number(printed) * 100)) / 100
    : null;
  const withinTolerance = difference !== null && Math.abs(difference) <= reconciliationTolerance;
  const current = committed && !unknown ? 3 : saved ? 2 : hasContent ? 1 : 0;
  const paused = unknown || cancelled;
  return (
    <section aria-label="Invoice progress" className="space-y-3 border-y py-4">
      <ol className="grid grid-cols-3 gap-3 text-sm">
        {["Scan or type", "Check details", stockReceivedEarlier ? "Post bill" : "Add stock"].map((label, index) => {
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
              <ReviewStatus tone={difference === null ? "warning" : difference === 0 ? "success" : withinTolerance ? "neutral" : "error"}>
                {difference === null
                  ? "Enter bill total to compare"
                  : difference === 0
                    ? "Totals match"
                    : withinTolerance
                      ? `${money(difference)} — within ${money(reconciliationTolerance)} tolerance`
                      : `${money(difference)} — check amounts`}
              </ReviewStatus>
              {withinTolerance && difference !== 0 && !paused && !committed && (
                <p className="mt-1 text-muted-foreground">
                  You can proceed with review. Other checks still apply.
                </p>
              )}
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}
