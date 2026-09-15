"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ClipboardCheck,
  FileText,
  PackageX,
  RefreshCw,
  Scale,
} from "lucide-react";
import {
  downloadCsv,
  workflowKinds,
} from "@/components/inventory/workspace-model";
import { apiClient } from "@/lib/api";
import { getErrorMessage } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type GstSlab = {
  slabPercent: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalGst: number;
  grossAmount: number;
};

type GstSummary = {
  scope?: any;
  records?: any[];
  purchaseInputGst: number;
  salesOutputGst: number;
  netPayable: number;
  purchases: { invoiceCount: number; slabs: GstSlab[] };
  sales: { invoiceCount: number; slabs: GstSlab[] };
};

type MonthlyReport = {
  scope?: any;
  records?: any[];
  month: string;
  procurement: {
    invoiceCount: number;
    taxableAmount: number;
    gstAmount: number;
    netPayable: number;
  };
  sales: {
    invoiceCount: number;
    beforeTax: number;
    gstAmount: number;
    totalAmount: number;
  };
  profitAndLoss: {
    unknownCostMovementCount?: number;
    unknownCostAdjustmentCount?: number;
    revenue: number;
    estimatedCogs: number;
    grossProfit: number;
    grossMarginPercent: number;
    expiredDamagedWriteOff: number;
    netAfterWriteOff: number;
  };
  stockValue: { itemCount: number; atCost: number; atMrp: number };
  distributorPerformance: Array<{
    distributorName: string;
    distributorGstin: string;
    invoiceCount: number;
    netPayable: number;
    gstAmount: number;
  }>;
};

type ExpiryReturns = {
  window: string;
  totals: {
    batchCount: number;
    stockQuantity: number;
    valueAtCost: number;
    valueAtMrp: number;
  };
  batches: Array<{
    inventoryId: string;
    name: string;
    batchNumber?: string;
    manufacturer?: string;
    expiryDate?: string;
    currentStock: number;
    valueAtCost: number;
    suggestedAction: string;
  }>;
};



const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

const number = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 2,
});

function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function defaultStartDate() {
  const date = new Date();
  date.setDate(1);
  return toDateInput(date);
}

function formatDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function SummaryMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "warn";
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-700"
      : tone === "warn"
        ? "text-amber-700"
        : "text-foreground";
  return (
    <div className="min-w-0 rounded-md border bg-background p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1 truncate text-lg font-semibold ${toneClass}`}>
        {value}
      </p>
    </div>
  );
}



export function ComplianceCenter({
  reportsOnly = false,
}: { reportsOnly?: boolean } = {}) {
  const [gstStartDate, setGstStartDate] = useState(defaultStartDate);
  const [gstEndDate, setGstEndDate] = useState(() => toDateInput(new Date()));
  const [month, setMonth] = useState(currentMonth);
  const [expiryWindow, setExpiryWindow] = useState("3m");
  const [gstSummary, setGstSummary] = useState<GstSummary | null>(null);
  const [monthlyReport, setMonthlyReport] = useState<MonthlyReport | null>(
    null,
  );
  const [expiryReturns, setExpiryReturns] = useState<ExpiryReturns | null>(
    null,
  );
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const setBusy = useCallback((key: string, value: boolean) => {
    setLoading((current) => ({ ...current, [key]: value }));
  }, []);

  const loadGstSummary = useCallback(async () => {
    setBusy("gst", true);
    setGstSummary(null);
    setError(null);
    try {
      const result = await apiClient.get<GstSummary>(
        "/pharmacy/compliance/gst-summary",
        { startDate: gstStartDate, endDate: gstEndDate },
      );
      setGstSummary(result);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy("gst", false);
    }
  }, [gstEndDate, gstStartDate, setBusy]);

  const loadMonthlyReport = useCallback(async () => {
    setBusy("monthly", true);
    setMonthlyReport(null);
    setError(null);
    try {
      const result = await apiClient.get<MonthlyReport>(
        "/pharmacy/compliance/monthly-report",
        { month },
      );
      setMonthlyReport(result);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy("monthly", false);
    }
  }, [month, setBusy]);

  const loadExpiryReturns = useCallback(async () => {
    setBusy("expiry", true);
    setError(null);
    try {
      const result = await apiClient.get<ExpiryReturns>(
        "/pharmacy/compliance/expiry-returns",
        { window: expiryWindow },
      );
      setExpiryReturns(result);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy("expiry", false);
    }
  }, [expiryWindow, setBusy]);

  useEffect(() => {
    void loadGstSummary();
    void loadMonthlyReport();
    void loadExpiryReturns();
  }, [loadExpiryReturns, loadGstSummary, loadMonthlyReport]);

  const gstNetTone = useMemo(
    () => ((gstSummary?.netPayable || 0) >= 0 ? "warn" : "good"),
    [gstSummary?.netPayable],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-normal">
            Pharmacy Compliance
          </h2>
          <p className="text-sm text-muted-foreground">
            {reportsOnly
              ? "Posted GST and monthly reports for the current branch"
              : "GST, monthly reports, expiry returns, and reviewed inventory counts"}
          </p>
        </div>
        {error ? (
          <p
            role="alert"
            className="max-w-full rounded-md border border-destructive p-3 text-destructive"
          >
            {error} Use the report Refresh button to retry.
          </p>
        ) : null}
      </div>

      <Card>
        <CardHeader className="gap-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2">
                <Scale className="size-5" />
                GST Summary
              </CardTitle>
              <CardDescription>
                Input credit and output tax by slab
              </CardDescription>
            </div>
            <Button
              variant="outline"
              onClick={loadGstSummary}
              disabled={loading.gst}
            >
              <RefreshCw className={loading.gst ? "animate-spin" : ""} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="gst-start-date">Start date</Label>
              <Input
                id="gst-start-date"
                type="date"
                value={gstStartDate}
                onChange={(event) => setGstStartDate(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gst-end-date">End date</Label>
              <Input
                id="gst-end-date"
                type="date"
                value={gstEndDate}
                onChange={(event) => setGstEndDate(event.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <SummaryMetric
              label="Input GST"
              value={
                gstSummary
                  ? currency.format(gstSummary.purchaseInputGst || 0)
                  : loading.gst
                    ? "Loading…"
                    : "Unavailable"
              }
            />
            <SummaryMetric
              label="Output GST"
              value={
                gstSummary
                  ? currency.format(gstSummary.salesOutputGst || 0)
                  : loading.gst
                    ? "Loading…"
                    : "Unavailable"
              }
            />
            <SummaryMetric
              label="Net payable"
              value={
                gstSummary
                  ? currency.format(gstSummary.netPayable || 0)
                  : loading.gst
                    ? "Loading…"
                    : "Unavailable"
              }
              tone={gstNetTone}
            />
          </div>
          {gstSummary && (
            <div className="grid gap-4 lg:grid-cols-2">
              <SlabTable
                title="Purchase Slabs"
                slabs={gstSummary?.purchases.slabs || []}
              />
              <SlabTable
                title="Sales Slabs"
                slabs={gstSummary?.sales.slabs || []}
              />
            </div>
          )}
          {gstSummary && (
            <ReportRecords title="GST source records" report={gstSummary} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2">
                <FileText className="size-5" />
                Monthly Report
              </CardTitle>
              <CardDescription>
                Procurement, sales, stock value, and P&L
              </CardDescription>
            </div>
            <Button
              variant="outline"
              onClick={loadMonthlyReport}
              disabled={loading.monthly}
            >
              <RefreshCw className={loading.monthly ? "animate-spin" : ""} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-xs space-y-2">
            <Label htmlFor="report-month">Month</Label>
            <Input
              id="report-month"
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <SummaryMetric
              label="Procurement"
              value={
                monthlyReport
                  ? currency.format(monthlyReport.procurement.netPayable || 0)
                  : loading.monthly
                    ? "Loading…"
                    : "Unavailable"
              }
            />
            <SummaryMetric
              label="Sales"
              value={
                monthlyReport
                  ? currency.format(monthlyReport.sales.totalAmount || 0)
                  : loading.monthly
                    ? "Loading…"
                    : "Unavailable"
              }
            />
            <SummaryMetric
              label="Gross profit"
              value={
                monthlyReport
                  ? currency.format(
                      monthlyReport.profitAndLoss.grossProfit || 0,
                    )
                  : loading.monthly
                    ? "Loading…"
                    : "Unavailable"
              }
              tone={
                (monthlyReport?.profitAndLoss.grossProfit || 0) >= 0
                  ? "good"
                  : "warn"
              }
            />
            <SummaryMetric
              label="Stock at cost"
              value={
                monthlyReport
                  ? currency.format(monthlyReport.stockValue.atCost || 0)
                  : loading.monthly
                    ? "Loading…"
                    : "Unavailable"
              }
            />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <SummaryMetric
              label="Write-off"
              value={
                monthlyReport
                  ? currency.format(
                      monthlyReport.profitAndLoss.expiredDamagedWriteOff || 0,
                    )
                  : loading.monthly
                    ? "Loading…"
                    : "Unavailable"
              }
              tone="warn"
            />
            <SummaryMetric
              label="Stock at MRP"
              value={
                monthlyReport
                  ? currency.format(monthlyReport.stockValue.atMrp || 0)
                  : loading.monthly
                    ? "Loading…"
                    : "Unavailable"
              }
            />
            <SummaryMetric
              label="Margin"
              value={
                monthlyReport
                  ? `${number.format(monthlyReport.profitAndLoss.grossMarginPercent || 0)}%`
                  : "Unavailable"
              }
            />
          </div>
          {monthlyReport && (
            <>
              <p className="text-sm text-muted-foreground">
                Stock valuation is the current snapshot. Historical cost is
                unknown for{" "}
                {(monthlyReport.profitAndLoss.unknownCostMovementCount || 0) +
                  (monthlyReport.profitAndLoss.unknownCostAdjustmentCount ||
                    0)}{" "}
                movements / adjustments; these costs are excluded from
                known-cost totals.
              </p>
              <DistributorTable
                rows={monthlyReport.distributorPerformance || []}
              />
              <ReportRecords
                title="Monthly source records"
                report={monthlyReport}
              />
            </>
          )}
        </CardContent>
      </Card>

      {!reportsOnly && (
        <>
          <Card>
            <CardHeader className="gap-2">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <CardTitle className="flex items-center gap-2">
                    <PackageX className="size-5" />
                    Expiry Returns
                  </CardTitle>
                  <CardDescription>
                    Batches to return, segregate, or quarantine
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  onClick={loadExpiryReturns}
                  disabled={loading.expiry}
                >
                  <RefreshCw className={loading.expiry ? "animate-spin" : ""} />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="max-w-xs space-y-2">
                <Label>Window</Label>
                <Select value={expiryWindow} onValueChange={setExpiryWindow}>
                  <SelectTrigger>
                    <SelectValue placeholder="Window" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1m">1 month</SelectItem>
                    <SelectItem value="3m">3 months</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                <SummaryMetric
                  label="Batches"
                  value={number.format(expiryReturns?.totals.batchCount || 0)}
                />
                <SummaryMetric
                  label="Units"
                  value={number.format(
                    expiryReturns?.totals.stockQuantity || 0,
                  )}
                />
                <SummaryMetric
                  label="Value at cost"
                  value={currency.format(
                    expiryReturns?.totals.valueAtCost || 0,
                  )}
                />
                <SummaryMetric
                  label="Value at MRP"
                  value={currency.format(expiryReturns?.totals.valueAtMrp || 0)}
                />
              </div>
              <ExpiryTable rows={expiryReturns?.batches || []} />
            </CardContent>
          </Card>

          <LegacyAuditDestination />
        </>
      )}
    </div>
  );
}

function SlabTable({ title, slabs }: { title: string; slabs: GstSlab[] }) {
  return (
    <div className="overflow-hidden rounded-md border">
      <div className="border-b bg-muted/40 px-3 py-2 text-sm font-medium">
        {title}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Slab</TableHead>
            <TableHead className="text-right">Taxable</TableHead>
            <TableHead className="text-right">GST</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {slabs.length ? (
            slabs.map((slab) => (
              <TableRow key={`${title}-${slab.slabPercent}`}>
                <TableCell>{number.format(slab.slabPercent)}%</TableCell>
                <TableCell className="text-right">
                  {currency.format(slab.taxableAmount)}
                </TableCell>
                <TableCell className="text-right">
                  {currency.format(slab.totalGst)}
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell
                colSpan={3}
                className="text-center text-muted-foreground"
              >
                No rows
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function DistributorTable({
  rows,
}: {
  rows: MonthlyReport["distributorPerformance"];
}) {
  return (
    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Distributor</TableHead>
            <TableHead>GSTIN</TableHead>
            <TableHead className="text-right">Invoices</TableHead>
            <TableHead className="text-right">Net payable</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length ? (
            rows.map((row) => (
              <TableRow key={`${row.distributorGstin}-${row.distributorName}`}>
                <TableCell className="max-w-52 truncate">
                  {row.distributorName}
                </TableCell>
                <TableCell className="max-w-40 truncate">
                  {row.distributorGstin}
                </TableCell>
                <TableCell className="text-right">{row.invoiceCount}</TableCell>
                <TableCell className="text-right">
                  {currency.format(row.netPayable)}
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell
                colSpan={4}
                className="text-center text-muted-foreground"
              >
                No rows
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function ExpiryTable({
  rows,
}: {
  rows: NonNullable<ExpiryReturns>["batches"];
}) {
  return (
    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Batch</TableHead>
            <TableHead>Expiry</TableHead>
            <TableHead className="text-right">Stock</TableHead>
            <TableHead className="text-right">Value</TableHead>
            <TableHead>Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length ? (
            rows.map((row) => (
              <TableRow key={row.inventoryId}>
                <TableCell className="max-w-56">
                  <div className="truncate font-medium">{row.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {row.batchNumber || "-"}
                  </div>
                </TableCell>
                <TableCell>{formatDate(row.expiryDate)}</TableCell>
                <TableCell className="text-right">{row.currentStock}</TableCell>
                <TableCell className="text-right">
                  {currency.format(row.valueAtCost)}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="max-w-56 truncate">
                    {row.suggestedAction.replaceAll("_", " ")}
                  </Badge>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell
                colSpan={5}
                className="text-center text-muted-foreground"
              >
                No rows
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * @cc [owner:nareshshah139,label:product] legacy-audit-ui-canonical-destination
 * The legacy audit section MUST link to canonical Counts & audit and MUST NOT expose an
 * adjustment form or call the retired direct stock-adjustment endpoint.
 */
function LegacyAuditDestination() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardCheck className="size-5" />
          Counts &amp; audit
        </CardTitle>
        <CardDescription>
          Enter physical counts, review variances and apply the required approval in the inventory workspace.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild>
          <a href="/dashboard/inventory?area=stock&view=COUNT">Open Counts &amp; audit</a>
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * @cc [owner:nareshshah139,label:product] report-export-same-eligible-records
 * Report source tables and CSV exports MUST use the same complete server-returned records as
 * posted totals, preserve scope/status and link each source by its actual document type.
 */
function ReportRecords({ title, report }: { title: string; report: any }) {
  const rows = report.records || [];
  const href = (r: any) =>
    r.sourceType === "purchase"
      ? `/dashboard/inventory?area=purchases&view=intake&invoice=${r.id}`
      : r.sourceType === "workflow"
        ? `/dashboard/inventory?area=${workflowKinds[r.kind]?.area || "sales"}&view=${r.kind}&document=${r.id}`
        : `/dashboard/pharmacy/invoices?search=${encodeURIComponent(r.invoiceNumber)}`;
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap justify-between gap-3">
        <h3 className="font-semibold">{title}</h3>
        <Button
          variant="outline"
          onClick={() =>
            downloadCsv(
              title + ".csv",
              rows.flatMap((r: any) =>
                r.lines?.length
                  ? r.lines.map((line: any) => ({
                      ...report.scope,
                      ...r,
                      lines: undefined,
                      ...line,
                    }))
                  : [{ ...report.scope, ...r }],
              ),
            )
          }
        >
          Export all source rows
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        {report.scope?.draftsExcluded
          ? "Posted records only; drafts excluded. "
          : ""}
        {report.scope?.startDate || report.scope?.start || ""} to{" "}
        {report.scope?.endDate || report.scope?.end || ""} · current branch ·{" "}
        {rows.length} records
      </p>
      <div className="max-h-96 overflow-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {["Source", "Date", "Status", "Taxable", "GST", "Total"].map(
                (v) => (
                  <th key={v} className="p-2">
                    {v}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any) => (
              <tr className="border-t" key={`${r.sourceType}-${r.id}`}>
                <td className="p-2">
                  <a className="underline" href={href(r)}>
                    {r.invoiceNumber}
                  </a>
                  <span className="block text-xs">{r.party}</span>
                </td>
                <td className="p-2">{r.invoiceDate?.slice(0, 10)}</td>
                <td className="p-2">{r.status}</td>
                <td className="p-2">{currency.format(r.taxableAmount)}</td>
                <td className="p-2">{currency.format(r.gstAmount)}</td>
                <td className="p-2">{currency.format(r.totalAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <p>No posted records in this date range.</p>}
    </section>
  );
}
