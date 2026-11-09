"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, TrendingUp, TriangleAlert } from "lucide-react";
import { apiClient } from "@/lib/api";
import { displayCalendarDate } from "@/lib/date-display";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingSkeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { reportById } from "./reports/report-catalog";
import { ExportMenu } from "./reports/ReportToolbar";
import { cn } from "@/lib/utils";
import { ReportInfoTip } from "./ReportInfoTip";
import {
  DEFAULT_MARGIN_SORT,
  type ItemMarginReport as Report,
  type MarginRow,
  type MarginSort,
  type MarginSortKey,
  clinicMonthStart,
  clinicToday,
  formatPercent,
  formatRupees,
  reportErrorHint,
  nextMarginSort,
  sortMarginRows,
  useReport,
} from "./pharmacy-report-model";

const UNKNOWN_COST_RULE =
  "A sale whose stock movement has no recorded cost, or a cost of ₹0 (an item with no purchase price), is left out of Purchase, Net GST, Profit and the %, and is flagged instead of being counted as free stock.";

const COLUMNS: { key: MarginSortKey; label: string; numeric?: boolean; help: string }[] = [
  { key: "name", label: "Item Name", help: "The product the sold batches are linked to. Batches without exactly one linked product are grouped by name, manufacturer and pack. The link opens the newest batch's stock page." },
  { key: "category", label: "Category", help: "Category of the newest batch, or of the linked product when the batch has none." },
  { key: "unitLabel", label: "Unit", help: "Pack size of the newest batch: pack size and pack unit, for example 15 g or 10 tabs." },
  { key: "manufacturer", label: "Manufacturer", help: "Manufacturer on the newest batch, or of the linked product when the batch has none." },
  { key: "saleQuantity", label: "Sale (qty)", numeric: true, help: "Stock units sold in the period, including free units on counter sales, less units customers returned. Sale qty × average sale price = Sales Amt." },
  { key: "stock", label: "Stock", numeric: true, help: "Current stock across all batches of the item, as of now (not at the end of the period)." },
  { key: "mrp", label: "MRP", numeric: true, help: "MRP of the most recently added batch." },
  { key: "salesAmount", label: "Sales Amt.", numeric: true, help: "What customers paid, GST included: taxable sale value + output GST, less customer returns. Average sale price = Sales Amt ÷ Sale qty." },
  { key: "purchase", label: "Purchase", numeric: true, help: `Cost of the units sold, GST included: units × cost per stock unit recorded on the sale (the purchase rate before GST), plus the GST paid on that cost at the batch GST rate. A return takes back the cost of the sale it reverses. ${UNKNOWN_COST_RULE}` },
  { key: "netGst", label: "Net GST", numeric: true, help: "Output GST collected on the sales less the input GST included in Purchase: the GST this item adds to what the clinic owes." },
  { key: "profitPercent", label: "Profit ₹ (%)", numeric: true, help: `Profit = Sales Amt − Purchase − Net GST, which equals taxable sale value − taxable cost. % = Profit ÷ taxable sale value (Sales Amt − output GST) × 100. Sorting uses the %. ${UNKNOWN_COST_RULE}` },
];

const TILE_HELP = {
  sales: "Sum of the Sales Amt. column, including sales without a recorded cost.",
  purchase: "Sum of the Purchase column.",
  netGst: "Sum of the Net GST column.",
  profit: "Sum of the Profit column. The % is total Profit ÷ total taxable sale value of the rows with a recorded cost × 100.",
};

const MARGIN = reportById("item-margin")!;

const marginIsEmpty = (report: Report) => report.rows.length === 0;

function Tile({ label, value, help, tone }: { label: string; value: string; help: string; tone?: "good" | "bad" }) {
  return (
    <div className="min-w-0 rounded-md border bg-background p-3">
      <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
        {label} <ReportInfoTip label={label}>{help}</ReportInfoTip>
      </p>
      <p className={cn("mt-1 truncate text-lg font-semibold tabular-nums", tone === "good" && "text-emerald-700 dark:text-emerald-400", tone === "bad" && "text-destructive")}>
        {value}
      </p>
    </div>
  );
}

const unknownCostText = (lineCount: number) => `${lineCount} ${lineCount === 1 ? "line" : "lines"} without recorded cost`;

function UnknownCostChip({ lineCount, salesAmount }: { lineCount: number; salesAmount: number }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-100"
      title={`${formatRupees(salesAmount)} of sales is not in Purchase, Net GST or Profit`}
    >
      <TriangleAlert className="size-3" aria-hidden="true" />
      {unknownCostText(lineCount)}
    </span>
  );
}

function SortHeader({ column, sort, onSort }: { column: (typeof COLUMNS)[number]; sort: MarginSort; onSort: (key: MarginSortKey) => void }) {
  const active = sort.key === column.key;
  const Icon = !active ? ArrowUpDown : sort.direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead
      aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
      className={cn("whitespace-nowrap px-2", column.numeric && "text-right", column.key === "name" && FROZEN_NAME)}
    >
      <span className={cn("inline-flex items-center gap-1", column.numeric && "justify-end")}>
        <button type="button" className="inline-flex items-center gap-1 font-medium hover:underline" onClick={() => onSort(column.key)}>
          {column.label}
          <Icon className={cn("size-3.5", !active && "opacity-40")} aria-hidden="true" />
        </button>
        <ReportInfoTip label={column.label}>{column.help}</ReportInfoTip>
      </span>
    </TableHead>
  );
}

const FROZEN_NAME = "sticky left-0 z-10 min-w-48 max-w-64 whitespace-normal border-r bg-background";

const itemHref = (itemId: string) =>
  `/dashboard/inventory?area=stock&view=list&item=${encodeURIComponent(itemId)}&return=${encodeURIComponent("area=purchases&view=margin")}`;

function MarginTableRow({ row }: { row: MarginRow }) {
  const money = "px-2 text-right tabular-nums";
  return (
    <TableRow>
      <TableCell className={cn("px-2 font-medium", FROZEN_NAME)}>
        {row.itemId ? <a className="text-primary underline-offset-4 hover:underline" href={itemHref(row.itemId)}>{row.name}</a> : row.name}
      </TableCell>
      <TableCell className="px-2">{row.category || "—"}</TableCell>
      <TableCell className="whitespace-nowrap px-2">{row.unitLabel || "—"}</TableCell>
      <TableCell className="px-2">{row.manufacturer || "—"}</TableCell>
      <TableCell className={money} title={row.averageSalePrice == null ? undefined : `Average sale price ${formatRupees(row.averageSalePrice)}`}>{row.saleQuantity}</TableCell>
      <TableCell className={money}>{row.stock}</TableCell>
      <TableCell className={money}>{formatRupees(row.mrp)}</TableCell>
      <TableCell className={money}>{formatRupees(row.salesAmount)}</TableCell>
      <TableCell className={money}>{formatRupees(row.purchase)}</TableCell>
      <TableCell className={money}>{formatRupees(row.netGst)}</TableCell>
      <TableCell className={cn(money, "whitespace-nowrap")}>
        <span className={cn(row.profit != null && row.profit < 0 && "text-destructive")}>
          {row.profit == null ? "—" : `${formatRupees(row.profit)} (${formatPercent(row.profitPercent)})`}
        </span>
        {row.unknownCost.lineCount > 0 && (
          <span className="mt-1 flex justify-end">
            <UnknownCostChip lineCount={row.unknownCost.lineCount} salesAmount={row.unknownCost.salesAmount} />
          </span>
        )}
      </TableCell>
    </TableRow>
  );
}

export function ItemMarginReport() {
  const [startDate, setStartDate] = useState(clinicMonthStart);
  const [endDate, setEndDate] = useState(clinicToday);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<MarginSort>(DEFAULT_MARGIN_SORT);
  const [state, run] = useReport<Report>(marginIsEmpty);

  const load = useCallback(
    () =>
      run(() =>
        apiClient.get<Report>("/pharmacy/compliance/item-margin", {
          startDate,
          endDate,
          ...(search.trim() ? { search: search.trim() } : {}),
        }),
      ),
    [endDate, run, search, startDate],
  );

  useEffect(() => {
    if (state.status === "idle") void load();
  }, [load, state.status]);

  const rows = useMemo(() => (state.status === "loaded" ? sortMarginRows(state.data.rows, sort) : []), [sort, state]);
  const totals = state.status === "loaded" ? state.data.totals : null;
  const loaded = state.status === "loaded" || state.status === "empty" ? state.data : null;

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="size-5" aria-hidden="true" />
            Item-wise Margin
          </CardTitle>
          <CardDescription>What each item sold for, what it cost and what the clinic made, for posted sales in the period.</CardDescription>
        </div>
        <form
          className="grid gap-3 sm:grid-cols-[repeat(2,minmax(0,12rem))_minmax(0,18rem)_auto_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            void load();
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="margin-start">From</Label>
            <Input id="margin-start" type="date" required value={startDate} max={endDate} onChange={(event) => setStartDate(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="margin-end">To</Label>
            <Input id="margin-end" type="date" required value={endDate} min={startDate} onChange={(event) => setEndDate(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="margin-search">Search</Label>
            <Input id="margin-search" type="search" maxLength={100} placeholder="Item, category or manufacturer" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <Button type="submit" disabled={state.status === "loading"}>Go</Button>
          <ExportMenu
            entry={MARGIN}
            params={{
              from: loaded?.period.startDate ?? startDate,
              to: loaded?.period.endDate ?? endDate,
              q: loaded?.search ?? undefined,
            }}
            disabled={!loaded}
          />
        </form>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-live="polite">
          <Tile label="Total Sale Amount" value={totals ? formatRupees(totals.salesAmount) : "—"} help={TILE_HELP.sales} />
          <Tile label="Total Purchase" value={totals ? formatRupees(totals.purchase) : "—"} help={TILE_HELP.purchase} />
          <Tile label="Total Net GST" value={totals ? formatRupees(totals.netGst) : "—"} help={TILE_HELP.netGst} />
          <Tile
            label="Total Profit"
            value={totals ? `${formatRupees(totals.profit)} (${formatPercent(totals.profitPercent)}%)` : "—"}
            help={TILE_HELP.profit}
            tone={totals ? (totals.profit < 0 ? "bad" : "good") : undefined}
          />
        </div>
        {totals && totals.unknownCost.lineCount > 0 && (
          <p role="status" className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">
            <UnknownCostChip lineCount={totals.unknownCost.lineCount} salesAmount={totals.unknownCost.salesAmount} />
            {formatRupees(totals.unknownCost.salesAmount)} of sales on {totals.unknownCost.itemCount} {totals.unknownCost.itemCount === 1 ? "item" : "items"} is in Total Sale Amount but not in Purchase, Net GST or Profit. Add the purchase price on the item to include future sales.
          </p>
        )}
        {state.status === "loading" && <LoadingSkeleton variant="table" label="Loading item-wise margin…" />}
        {state.status === "error" && (
          <p role="alert" className="rounded-md border border-destructive p-3 text-destructive">
            {state.message} {reportErrorHint(state.httpStatus)}
          </p>
        )}
        {state.status === "empty" && (
          <EmptyState
            title={state.data.search ? `No sold items match "${state.data.search}"` : "No items sold in this range"}
            description={`No posted sales between ${displayCalendarDate(state.data.period.startDate)} and ${displayCalendarDate(state.data.period.endDate)}${state.data.search ? " match the search" : ""}. Change the range or search and press Go.`}
          />
        )}
        {state.status === "loaded" && (
          <Table aria-label="Item-wise margin" className="min-w-[72rem]">
            <TableHeader>
              <TableRow>
                {COLUMNS.map((column) => (
                  <SortHeader key={column.key} column={column} sort={sort} onSort={(key) => setSort((current) => nextMarginSort(current, key))} />
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => <MarginTableRow key={row.key} row={row} />)}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
