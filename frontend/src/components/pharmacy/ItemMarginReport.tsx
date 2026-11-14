"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, SlidersHorizontal, TrendingUp, TriangleAlert } from "lucide-react";
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
  DEFAULT_MARGIN_FILTERS,
  DEFAULT_MARGIN_SORT,
  MARGIN_COST_STATUSES,
  MARGIN_COST_STATUS_LABELS,
  MARGIN_FILTER_PARAM_KEYS,
  MARGIN_ITEM_TYPE_LABELS,
  MARGIN_SEARCH_FIELDS,
  MARGIN_SEARCH_FIELD_LABELS,
  MARGIN_TYPES,
  MARGIN_TYPE_LABELS,
  type MarginFilters,
  type MarginItemType,
  activeMoreFilterCount,
  describeMarginFilters,
  hasActiveFilters,
  marginExportParams,
  marginFilterParams,
  marginFiltersFromParams,
  marginQuery,
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
import { NativeSelect } from '@/components/ui/native-select';

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
      <p className={cn("mt-1 break-words text-lg font-semibold tabular-nums", tone === "good" && "text-success-text", tone === "bad" && "text-destructive")}>
        {value}
      </p>
    </div>
  );
}

const unknownCostText = (lineCount: number) => `${lineCount} ${lineCount === 1 ? "line" : "lines"} without recorded cost`;

function UnknownCostChip({ lineCount, salesAmount }: { lineCount: number; salesAmount: number }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded bg-warning-soft px-1.5 py-0.5 text-xs font-medium text-warning-text"
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

const itemHref = (itemId: string, returnTo: string) =>
  `/dashboard/inventory?area=stock&view=list&item=${encodeURIComponent(itemId)}&return=${encodeURIComponent(returnTo)}`;

function MarginTableRow({ row, returnTo }: { row: MarginRow; returnTo: string }) {
  const money = "px-2 text-right tabular-nums";
  return (
    <TableRow>
      <TableCell className={cn("px-2 font-medium", FROZEN_NAME)}>
        {row.itemId ? <a className="text-primary underline-offset-4 hover:underline" href={itemHref(row.itemId, returnTo)}>{row.name}</a> : row.name}
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

type Applied = { startDate: string; endDate: string; filters: MarginFilters };

const withCurrent = (options: string[], current: string) => (current && !options.includes(current) ? [current, ...options] : options);

function FilterSelect({ id, label, value, onChange, children }: { id: string; label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <NativeSelect id={id} className="w-full min-w-0" value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </NativeSelect>
    </div>
  );
}

/**
 * @cc [owner:nareshshah139,label:product] item-margin-filters
 * The item-wise margin report MUST offer Type (net, sales, returns), Tags, a search-field selector and
 * a More Filters panel whose button shows how many of its filters are active. Dropdown options come from
 * the report period, so an option never shows an empty report. The dates and filters live in the page
 * URL so refresh and back keep them, and the tiles always add up the visible rows.
 */
export function ItemMarginReport() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const paramsKey = params.toString();
  const applied = useMemo<Applied>(() => {
    const current = new URLSearchParams(paramsKey);
    return { startDate: current.get("from") || clinicMonthStart(), endDate: current.get("to") || clinicToday(), filters: marginFiltersFromParams(current) };
  }, [paramsKey]);
  const [startDate, setStartDate] = useState(applied.startDate);
  const [endDate, setEndDate] = useState(applied.endDate);
  const [filters, setFilters] = useState<MarginFilters>(applied.filters);
  const [moreOpen, setMoreOpen] = useState(false);
  const [sort, setSort] = useState<MarginSort>(DEFAULT_MARGIN_SORT);
  const [state, run] = useReport<Report>(marginIsEmpty);
  const setFilter = <K extends keyof MarginFilters>(key: K, value: MarginFilters[K]) => setFilters((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    setStartDate(applied.startDate);
    setEndDate(applied.endDate);
    setFilters(applied.filters);
  }, [applied]);

  useEffect(() => {
    void run(() => apiClient.get<Report>("/pharmacy/compliance/item-margin", marginQuery(applied.startDate, applied.endDate, applied.filters)));
  }, [applied, run]);

  const apply = (next: Applied) => {
    const query = new URLSearchParams(paramsKey);
    for (const key of ["from", "to", ...MARGIN_FILTER_PARAM_KEYS]) query.delete(key);
    query.set("from", next.startDate);
    query.set("to", next.endDate);
    for (const [key, value] of Object.entries(marginFilterParams(next.filters))) query.set(key, value);
    const href = `${pathname}?${query.toString()}`;
    if (query.toString() === paramsKey) void run(() => apiClient.get<Report>("/pharmacy/compliance/item-margin", marginQuery(next.startDate, next.endDate, next.filters)));
    else router.replace(href, { scroll: false });
  };

  const rows = useMemo(() => (state.status === "loaded" ? sortMarginRows(state.data.rows, sort) : []), [sort, state]);
  const totals = state.status === "loaded" ? state.data.totals : null;
  const options = state.status === "loaded" || state.status === "empty" ? state.data.options : { tags: [], categories: [], manufacturers: [], itemTypes: [] };
  const moreCount = activeMoreFilterCount(filters);
  const returnTo = `${pathname}?${paramsKey}`;

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
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            apply({ startDate, endDate, filters });
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(2,minmax(0,11rem))_minmax(0,11rem)_minmax(0,11rem)]">
            <div className="space-y-1">
              <Label htmlFor="margin-start">From</Label>
              <Input id="margin-start" className="h-10" type="date" required value={startDate} max={endDate} onChange={(event) => setStartDate(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="margin-end">To</Label>
              <Input id="margin-end" className="h-10" type="date" required value={endDate} min={startDate} onChange={(event) => setEndDate(event.target.value)} />
            </div>
            <FilterSelect id="margin-type" label="Type" value={filters.type} onChange={(value) => setFilter("type", value as MarginFilters["type"])}>
              {MARGIN_TYPES.map((type) => <option key={type} value={type}>{MARGIN_TYPE_LABELS[type]}</option>)}
            </FilterSelect>
            <FilterSelect id="margin-tag" label="Tags" value={filters.tag} onChange={(value) => setFilter("tag", value)}>
              <option value="">All tags</option>
              {withCurrent(options.tags, filters.tag).map((tag) => <option key={tag} value={tag}>{tag}</option>)}
            </FilterSelect>
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)] lg:grid-cols-[minmax(0,11rem)_minmax(0,22rem)_auto_auto_auto] lg:items-end">
            <FilterSelect id="margin-search-field" label="Search in" value={filters.searchField} onChange={(value) => setFilter("searchField", value as MarginFilters["searchField"])}>
              {MARGIN_SEARCH_FIELDS.map((field) => <option key={field} value={field}>{MARGIN_SEARCH_FIELD_LABELS[field]}</option>)}
            </FilterSelect>
            <div className="space-y-1">
              <Label htmlFor="margin-search">Search</Label>
              <Input id="margin-search" className="h-10" type="search" maxLength={100} placeholder="Type to search" value={filters.search} onChange={(event) => setFilter("search", event.target.value)} />
            </div>
            <Button type="submit" disabled={state.status === "loading"}>Go</Button>
            <Button type="button" variant="outline" aria-expanded={moreOpen} aria-controls="margin-more-filters" onClick={() => setMoreOpen((open) => !open)}>
              <SlidersHorizontal className="size-4" aria-hidden="true" />
              More Filters{moreCount > 0 ? ` (${moreCount})` : ""}
            </Button>
            <ExportMenu
              entry={MARGIN}
              params={{ from: applied.startDate, to: applied.endDate, q: applied.filters.search.trim() || undefined }}
              extra={marginExportParams(applied.filters)}
              disabled={state.status !== "loaded"}
            />
          </div>
          {moreOpen && (
            <fieldset id="margin-more-filters" className="grid gap-3 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-4">
              <legend className="px-1 text-sm font-medium">More Filters</legend>
              <FilterSelect id="margin-category" label="Category" value={filters.category} onChange={(value) => setFilter("category", value)}>
                <option value="">All categories</option>
                {withCurrent(options.categories, filters.category).map((category) => <option key={category} value={category}>{category}</option>)}
              </FilterSelect>
              <FilterSelect id="margin-manufacturer" label="Manufacturer" value={filters.manufacturer} onChange={(value) => setFilter("manufacturer", value)}>
                <option value="">All manufacturers</option>
                {withCurrent(options.manufacturers, filters.manufacturer).map((name) => <option key={name} value={name}>{name}</option>)}
              </FilterSelect>
              <FilterSelect id="margin-item-type" label="Item type" value={filters.itemType} onChange={(value) => setFilter("itemType", value as MarginItemType | "")}>
                <option value="">All types</option>
                {Object.entries(MARGIN_ITEM_TYPE_LABELS).filter(([type]) => options.itemTypes.includes(type) || type === filters.itemType).map(([type, label]) => <option key={type} value={type}>{label}</option>)}
              </FilterSelect>
              <FilterSelect id="margin-cost-status" label="Cost status" value={filters.costStatus} onChange={(value) => setFilter("costStatus", value as MarginFilters["costStatus"])}>
                {MARGIN_COST_STATUSES.map((status) => <option key={status} value={status}>{MARGIN_COST_STATUS_LABELS[status]}</option>)}
              </FilterSelect>
              <div className="sm:col-span-2 lg:col-span-4">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={!hasActiveFilters(filters)}
                  onClick={() => apply({ startDate, endDate, filters: { ...DEFAULT_MARGIN_FILTERS } })}
                >
                  Clear filters
                </Button>
              </div>
            </fieldset>
          )}
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
          <p role="status" className="flex flex-wrap items-center gap-2 rounded-md border border-warning-border bg-warning-soft p-3 text-sm text-warning-text">
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
            title={hasActiveFilters(applied.filters) ? "No items match these filters" : "No items sold in this range"}
            description={`${
              hasActiveFilters(applied.filters)
                ? `Nothing posted between ${displayCalendarDate(state.data.period.startDate)} and ${displayCalendarDate(state.data.period.endDate)} matches ${describeMarginFilters(applied.filters).map(([label, value]) => `${label.toLowerCase()} ${value}`).join(", ")}.`
                : `No posted sales between ${displayCalendarDate(state.data.period.startDate)} and ${displayCalendarDate(state.data.period.endDate)}.`
            } Change the range or filters and press Go.`}
          />
        )}
        {state.status === "loaded" && (
          <Table aria-label="Item-wise margin" className="min-w-[72rem]" containerClassName="max-h-[70vh]">
            <TableHeader>
              <TableRow>
                {COLUMNS.map((column) => (
                  <SortHeader key={column.key} column={column} sort={sort} onSort={(key) => setSort((current) => nextMarginSort(current, key))} />
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => <MarginTableRow key={row.key} row={row} returnTo={returnTo} />)}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
