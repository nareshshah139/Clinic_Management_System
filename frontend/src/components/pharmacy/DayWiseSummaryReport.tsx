"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { apiClient } from "@/lib/api";
import { displayCalendarDate } from "@/lib/date-display";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingSkeleton } from "@/components/ui/skeleton";
import { reportById } from "./reports/report-catalog";
import { ExportMenu } from "./reports/ReportToolbar";
import { GstSlabGroupTable, type SlabGroupRow } from "./GstSlabGroupTable";
import { ReportInfoTip } from "./ReportInfoTip";
import {
  type DayWiseReport,
  type DayWiseType,
  billCell,
  clinicMonthStart,
  clinicToday,
  formatRupees,
  reportErrorHint,
  useReport,
} from "./pharmacy-report-model";
import { NativeSelect } from '@/components/ui/native-select';
import { plural } from '@/lib/labels';

const BILL_NO_HELP: Record<DayWiseType, string> = {
  SALES:
    "The lowest and highest pharmacy bill number confirmed on the day. A gap lists numbers missing from the clinic's sequence, inside the day's range or since the previous day's last bill, with the status of the bill if it exists (for example a draft that was never confirmed). Counter sales and customer returns carry free-text references, so they are counted beside the range rather than in it.",
  PURCHASE:
    "Supplier bill numbers of the purchase bills posted to stock on the day. These are the distributor's own numbers, not a sequence the clinic issues, so no gap check applies. Supplier returns and credit notes are counted beside them.",
};

const TOTAL_HELP =
  "Sum of the Total amount column: Base + SGST + CGST + IGST for every day in the range. Returns and credit notes count as negative amounts on the day they were posted.";

const DAY_WISE = reportById("day-wise-summary")!;

const dayWiseIsEmpty = (report: DayWiseReport) => report.rows.every((row) => row.noBills);

export function DayWiseSummaryReport() {
  const [startDate, setStartDate] = useState(clinicMonthStart);
  const [endDate, setEndDate] = useState(clinicToday);
  const [type, setType] = useState<DayWiseType>("SALES");
  const [state, run] = useReport<DayWiseReport>(dayWiseIsEmpty);

  const load = useCallback(
    (reportType: DayWiseType) =>
      run(() => apiClient.get<DayWiseReport>("/pharmacy/compliance/day-wise-summary", { startDate, endDate, type: reportType })),
    [endDate, run, startDate],
  );

  useEffect(() => {
    if (state.status === "idle") void load(type);
  }, [load, state.status, type]);

  const report = state.status === "loaded" || state.status === "empty" ? state.data : null;
  const rows: SlabGroupRow[] = (state.status === "loaded" ? state.data.rows : []).map((row) => {
    const cell = billCell(row, state.status === "loaded" ? state.data.type : type);
    return {
      key: row.date,
      muted: row.noBills,
      slabs: row.slabs,
      total: row.total,
      amount: row.amount,
      frozen: [
        <span key="date" className="whitespace-nowrap">{displayCalendarDate(row.date)}</span>,
        <span key="bills" title={cell.title} className="block leading-snug">
          <span className={row.noBills ? "italic" : "font-medium"}>{cell.primary}</span>
          {cell.gap && (
            <span className="ml-1 rounded bg-warning-soft px-1 text-xs font-medium text-warning-text">
              {cell.gap}
            </span>
          )}
          {cell.extras && <span className="block text-xs text-muted-foreground">{cell.extras}</span>}
        </span>,
      ],
    };
  });

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="size-5" aria-hidden="true" />
              Day-wise Summary
            </CardTitle>
            <CardDescription>One row per day, split across GST slabs. Days are Asia/Kolkata calendar days.</CardDescription>
          </div>
          <div className="text-right" aria-live="polite">
            <p className="flex items-center justify-end gap-1 text-xs font-medium text-muted-foreground">
              Total for the range <ReportInfoTip label="the range total">{TOTAL_HELP}</ReportInfoTip>
            </p>
            <p className="text-2xl font-semibold tabular-nums" data-testid="day-wise-range-total">
              {report ? formatRupees(report.totals.amount) : "—"}
            </p>
          </div>
        </div>
        <form
          className="grid gap-3 sm:grid-cols-[repeat(3,minmax(0,12rem))_auto_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            void load(type);
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="day-wise-start">From</Label>
            <Input id="day-wise-start" type="date" required value={startDate} max={endDate} onChange={(event) => setStartDate(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="day-wise-end">To</Label>
            <Input id="day-wise-end" type="date" required value={endDate} min={startDate} onChange={(event) => setEndDate(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="day-wise-type">Type</Label>
            <NativeSelect
              id="day-wise-type"
              className="h-10 w-full min-w-0"
              value={type}
              onChange={(event) => {
                const next = event.target.value as DayWiseType;
                setType(next);
                void load(next);
              }}
            >
              <option value="SALES">Sales</option>
              <option value="PURCHASE">Purchase</option>
            </NativeSelect>
          </div>
          <Button type="submit" disabled={state.status === "loading"}>Go</Button>
          <ExportMenu
            entry={DAY_WISE}
            params={{ from: report?.period.startDate ?? startDate, to: report?.period.endDate ?? endDate, type: report?.type ?? type }}
            disabled={!report}
          />
        </form>
      </CardHeader>
      <CardContent className="space-y-3">
        {state.status === "loading" && <LoadingSkeleton variant="table" label="Loading day-wise summary…" />}
        {state.status === "error" && (
          <p role="alert" className="rounded-md border border-destructive p-3 text-destructive">
            {state.message} {reportErrorHint(state.httpStatus)}
          </p>
        )}
        {state.status === "empty" && (
          <EmptyState
            title={`No ${state.data.type === "SALES" ? "sales" : "purchase"} bills in this range`}
            description={`Nothing was posted between ${displayCalendarDate(state.data.period.startDate)} and ${displayCalendarDate(state.data.period.endDate)}. Choose another range and press Go.`}
          />
        )}
        {state.status === "loaded" && (
          <>
            <p className="text-sm text-muted-foreground">
              {state.data.totals.billCount} {state.data.totals.billCount === 1 ? "bill" : "bills"} over {state.data.rows.length} days
              {state.data.totals.noBillDays
                ? `; ${state.data.totals.noBillDays} ${state.data.totals.noBillDays === 1 ? "day with no bills is" : "days with no bills are"} shown as ₹0 rows`
                : ""}
              {state.data.totals.missingCount
                ? `; ${state.data.totals.missingCount} ${state.data.totals.missingCount === 1 ? "bill number is" : "bill numbers are"} missing from the sequence`
                : ""}
              . Amounts in ₹.
            </p>
            <GstSlabGroupTable
              label={`Day-wise ${state.data.type === "SALES" ? "sales" : "purchase"} summary`}
              frozenColumns={[
                { label: "Bill Date", width: 136 },
                {
                  label: (
                    <span className="flex items-center gap-1">
                      Bill No. <ReportInfoTip label="the Bill No. column">{BILL_NO_HELP[state.data.type]}</ReportInfoTip>
                    </span>
                  ),
                  width: 220,
                },
              ]}
              columns={state.data.columns}
              rows={rows}
              totals={{
                key: "totals",
                frozen: ["Total", plural(state.data.totals.billCount, 'bill')],
                slabs: state.data.totals.slabs,
                total: state.data.totals.total,
                amount: state.data.totals.amount,
              }}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
