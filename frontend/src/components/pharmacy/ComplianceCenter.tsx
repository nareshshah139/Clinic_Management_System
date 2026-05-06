'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import {
  ClipboardCheck,
  FileText,
  PackageX,
  RefreshCw,
  Scale,
  Send,
} from 'lucide-react';
import { apiClient } from '@/lib/api';
import { getErrorMessage } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

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
  purchaseInputGst: number;
  salesOutputGst: number;
  netPayable: number;
  purchases: { invoiceCount: number; slabs: GstSlab[] };
  sales: { invoiceCount: number; slabs: GstSlab[] };
};

type MonthlyReport = {
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

type AuditRow = {
  auditRowId: string;
  inventoryId: string;
  name: string;
  batchNumber?: string;
  expiryDate?: string;
  systemStock: number;
  physicalStock: number;
  variance: number;
};

type AuditBatch = {
  auditId: string;
  itemCount: number;
  rows: AuditRow[];
};

type AdjustmentResponse = {
  auditId: string;
  adjustmentCount: number;
  adjustments: Array<{
    auditRowId: string;
    inventoryId: string;
    itemName: string;
    userId: string;
    reason: string;
    beforeCount: number;
    afterCount: number;
    variance: number;
    approvalRequired: boolean;
    stockAdjustmentId?: string | null;
    stockTransactionId?: string | null;
    transactionReference: string;
  }>;
};

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

const number = new Intl.NumberFormat('en-IN', {
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
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function SummaryMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'good' | 'warn';
}) {
  const toneClass =
    tone === 'good'
      ? 'text-emerald-700'
      : tone === 'warn'
        ? 'text-amber-700'
        : 'text-foreground';
  return (
    <div className="min-w-0 rounded-md border bg-background p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1 truncate text-lg font-semibold ${toneClass}`}>
        {value}
      </p>
    </div>
  );
}

export function ComplianceCenter() {
  const [gstStartDate, setGstStartDate] = useState(defaultStartDate);
  const [gstEndDate, setGstEndDate] = useState(() => toDateInput(new Date()));
  const [month, setMonth] = useState(currentMonth);
  const [expiryWindow, setExpiryWindow] = useState('3m');
  const [gstSummary, setGstSummary] = useState<GstSummary | null>(null);
  const [monthlyReport, setMonthlyReport] = useState<MonthlyReport | null>(
    null,
  );
  const [expiryReturns, setExpiryReturns] = useState<ExpiryReturns | null>(
    null,
  );
  const [auditBatch, setAuditBatch] = useState<AuditBatch | null>(null);
  const [auditSelection, setAuditSelection] = useState({
    inventoryIds: '',
    category: '',
    manufacturer: '',
    expiryFrom: '',
    expiryTo: '',
    notes: '',
  });
  const [physicalCounts, setPhysicalCounts] = useState<Record<string, string>>(
    {},
  );
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [adjustmentResult, setAdjustmentResult] =
    useState<AdjustmentResponse | null>(null);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const setBusy = useCallback((key: string, value: boolean) => {
    setLoading((current) => ({ ...current, [key]: value }));
  }, []);

  const loadGstSummary = useCallback(async () => {
    setBusy('gst', true);
    setError(null);
    try {
      const result = await apiClient.get<GstSummary>(
        '/pharmacy/compliance/gst-summary',
        { startDate: gstStartDate, endDate: gstEndDate },
      );
      setGstSummary(result);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy('gst', false);
    }
  }, [gstEndDate, gstStartDate, setBusy]);

  const loadMonthlyReport = useCallback(async () => {
    setBusy('monthly', true);
    setError(null);
    try {
      const result = await apiClient.get<MonthlyReport>(
        '/pharmacy/compliance/monthly-report',
        { month },
      );
      setMonthlyReport(result);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy('monthly', false);
    }
  }, [month, setBusy]);

  const loadExpiryReturns = useCallback(async () => {
    setBusy('expiry', true);
    setError(null);
    try {
      const result = await apiClient.get<ExpiryReturns>(
        '/pharmacy/compliance/expiry-returns',
        { window: expiryWindow },
      );
      setExpiryReturns(result);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy('expiry', false);
    }
  }, [expiryWindow, setBusy]);

  useEffect(() => {
    void loadGstSummary();
    void loadMonthlyReport();
    void loadExpiryReturns();
  }, [loadExpiryReturns, loadGstSummary, loadMonthlyReport]);

  const createAuditBatch = async () => {
    setBusy('audit', true);
    setError(null);
    setAdjustmentResult(null);
    try {
      const inventoryIds = auditSelection.inventoryIds
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
      const payload: Record<string, unknown> = {
        ...auditSelection,
        inventoryIds: inventoryIds.length ? inventoryIds : undefined,
      };
      for (const key of Object.keys(payload)) {
        if (payload[key] === '') delete payload[key];
      }
      const result = await apiClient.post<AuditBatch>(
        '/pharmacy/compliance/audits',
        payload,
      );
      setAuditBatch(result);
      setPhysicalCounts(
        Object.fromEntries(
          result.rows.map((row) => [row.inventoryId, String(row.systemStock)]),
        ),
      );
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy('audit', false);
    }
  };

  const applyAdjustments = async () => {
    if (!auditBatch) return;
    setBusy('adjust', true);
    setError(null);
    try {
      const counts = auditBatch.rows.map((row) => ({
        auditRowId: row.auditRowId,
        inventoryId: row.inventoryId,
        physicalStock: Number(physicalCounts[row.inventoryId] || 0),
      }));
      const result = await apiClient.post<AdjustmentResponse>(
        `/pharmacy/compliance/audits/${auditBatch.auditId}/adjustments`,
        { reason: adjustmentReason, counts },
      );
      setAdjustmentResult(result);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy('adjust', false);
    }
  };

  const gstNetTone = useMemo(
    () => ((gstSummary?.netPayable || 0) >= 0 ? 'warn' : 'good'),
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
            GST, monthly reports, expiry returns, and stock audit posting
          </p>
        </div>
        {error ? (
          <Badge variant="destructive" className="w-fit max-w-full truncate">
            {error}
          </Badge>
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
              <CardDescription>Input credit and output tax by slab</CardDescription>
            </div>
            <Button
              variant="outline"
              onClick={loadGstSummary}
              disabled={loading.gst}
            >
              <RefreshCw className={loading.gst ? 'animate-spin' : ''} />
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
              value={currency.format(gstSummary?.purchaseInputGst || 0)}
            />
            <SummaryMetric
              label="Output GST"
              value={currency.format(gstSummary?.salesOutputGst || 0)}
            />
            <SummaryMetric
              label="Net payable"
              value={currency.format(gstSummary?.netPayable || 0)}
              tone={gstNetTone}
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <SlabTable title="Purchase Slabs" slabs={gstSummary?.purchases.slabs || []} />
            <SlabTable title="Sales Slabs" slabs={gstSummary?.sales.slabs || []} />
          </div>
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
              <CardDescription>Procurement, sales, stock value, and P&L</CardDescription>
            </div>
            <Button
              variant="outline"
              onClick={loadMonthlyReport}
              disabled={loading.monthly}
            >
              <RefreshCw className={loading.monthly ? 'animate-spin' : ''} />
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
              value={currency.format(monthlyReport?.procurement.netPayable || 0)}
            />
            <SummaryMetric
              label="Sales"
              value={currency.format(monthlyReport?.sales.totalAmount || 0)}
            />
            <SummaryMetric
              label="Gross profit"
              value={currency.format(monthlyReport?.profitAndLoss.grossProfit || 0)}
              tone={(monthlyReport?.profitAndLoss.grossProfit || 0) >= 0 ? 'good' : 'warn'}
            />
            <SummaryMetric
              label="Stock at cost"
              value={currency.format(monthlyReport?.stockValue.atCost || 0)}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <SummaryMetric
              label="Write-off"
              value={currency.format(monthlyReport?.profitAndLoss.expiredDamagedWriteOff || 0)}
              tone="warn"
            />
            <SummaryMetric
              label="Stock at MRP"
              value={currency.format(monthlyReport?.stockValue.atMrp || 0)}
            />
            <SummaryMetric
              label="Margin"
              value={`${number.format(monthlyReport?.profitAndLoss.grossMarginPercent || 0)}%`}
            />
          </div>
          <DistributorTable rows={monthlyReport?.distributorPerformance || []} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2">
                <PackageX className="size-5" />
                Expiry Returns
              </CardTitle>
              <CardDescription>Batches to return, segregate, or quarantine</CardDescription>
            </div>
            <Button
              variant="outline"
              onClick={loadExpiryReturns}
              disabled={loading.expiry}
            >
              <RefreshCw className={loading.expiry ? 'animate-spin' : ''} />
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
              value={number.format(expiryReturns?.totals.stockQuantity || 0)}
            />
            <SummaryMetric
              label="Value at cost"
              value={currency.format(expiryReturns?.totals.valueAtCost || 0)}
            />
            <SummaryMetric
              label="Value at MRP"
              value={currency.format(expiryReturns?.totals.valueAtMrp || 0)}
            />
          </div>
          <ExpiryTable rows={expiryReturns?.batches || []} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="size-5" />
            Audit Count Entry
          </CardTitle>
          <CardDescription>Cycle count batch and correction posting</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="audit-inventory-ids">Inventory IDs</Label>
              <Input
                id="audit-inventory-ids"
                value={auditSelection.inventoryIds}
                onChange={(event) =>
                  setAuditSelection((current) => ({
                    ...current,
                    inventoryIds: event.target.value,
                  }))
                }
                placeholder="Comma separated"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="audit-category">Category</Label>
              <Input
                id="audit-category"
                value={auditSelection.category}
                onChange={(event) =>
                  setAuditSelection((current) => ({
                    ...current,
                    category: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="audit-manufacturer">Manufacturer</Label>
              <Input
                id="audit-manufacturer"
                value={auditSelection.manufacturer}
                onChange={(event) =>
                  setAuditSelection((current) => ({
                    ...current,
                    manufacturer: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="audit-expiry-from">Expiry from</Label>
              <Input
                id="audit-expiry-from"
                type="date"
                value={auditSelection.expiryFrom}
                onChange={(event) =>
                  setAuditSelection((current) => ({
                    ...current,
                    expiryFrom: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="audit-expiry-to">Expiry to</Label>
              <Input
                id="audit-expiry-to"
                type="date"
                value={auditSelection.expiryTo}
                onChange={(event) =>
                  setAuditSelection((current) => ({
                    ...current,
                    expiryTo: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="audit-notes">Notes</Label>
              <Input
                id="audit-notes"
                value={auditSelection.notes}
                onChange={(event) =>
                  setAuditSelection((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
              />
            </div>
          </div>
          <Button onClick={createAuditBatch} disabled={loading.audit}>
            <ClipboardCheck />
            Create Audit
          </Button>

          {auditBatch ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{auditBatch.auditId}</Badge>
                <Badge variant="outline">{auditBatch.itemCount} items</Badge>
              </div>
              <AuditTable
                rows={auditBatch.rows}
                physicalCounts={physicalCounts}
                setPhysicalCounts={setPhysicalCounts}
              />
              <div className="space-y-2">
                <Label htmlFor="adjustment-reason">Adjustment reason</Label>
                <Textarea
                  id="adjustment-reason"
                  rows={3}
                  value={adjustmentReason}
                  onChange={(event) => setAdjustmentReason(event.target.value)}
                />
              </div>
              <Button
                onClick={applyAdjustments}
                disabled={loading.adjust || !adjustmentReason.trim()}
              >
                <Send />
                Apply Adjustments
              </Button>
            </div>
          ) : null}

          {adjustmentResult ? (
            <AdjustmentResultTable rows={adjustmentResult.adjustments} />
          ) : null}
        </CardContent>
      </Card>
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
              <TableCell colSpan={3} className="text-center text-muted-foreground">
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
  rows: MonthlyReport['distributorPerformance'];
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
                <TableCell className="max-w-52 truncate">{row.distributorName}</TableCell>
                <TableCell className="max-w-40 truncate">{row.distributorGstin}</TableCell>
                <TableCell className="text-right">{row.invoiceCount}</TableCell>
                <TableCell className="text-right">
                  {currency.format(row.netPayable)}
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                No rows
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function ExpiryTable({ rows }: { rows: NonNullable<ExpiryReturns>['batches'] }) {
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
                    {row.batchNumber || '-'}
                  </div>
                </TableCell>
                <TableCell>{formatDate(row.expiryDate)}</TableCell>
                <TableCell className="text-right">{row.currentStock}</TableCell>
                <TableCell className="text-right">
                  {currency.format(row.valueAtCost)}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="max-w-56 truncate">
                    {row.suggestedAction.replaceAll('_', ' ')}
                  </Badge>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                No rows
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function AuditTable({
  rows,
  physicalCounts,
  setPhysicalCounts,
}: {
  rows: AuditRow[];
  physicalCounts: Record<string, string>;
  setPhysicalCounts: Dispatch<SetStateAction<Record<string, string>>>;
}) {
  return (
    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead>Batch</TableHead>
            <TableHead className="text-right">System</TableHead>
            <TableHead className="w-32 text-right">Physical</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.auditRowId}>
              <TableCell className="max-w-64 truncate">{row.name}</TableCell>
              <TableCell className="max-w-40 truncate">{row.batchNumber || '-'}</TableCell>
              <TableCell className="text-right">{row.systemStock}</TableCell>
              <TableCell>
                <Input
                  type="number"
                  min={0}
                  className="text-right"
                  value={physicalCounts[row.inventoryId] || ''}
                  onChange={(event) =>
                    setPhysicalCounts((current) => ({
                      ...current,
                      [row.inventoryId]: event.target.value,
                    }))
                  }
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function AdjustmentResultTable({
  rows,
}: {
  rows: NonNullable<AdjustmentResponse>['adjustments'];
}) {
  return (
    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead className="text-right">Before</TableHead>
            <TableHead className="text-right">After</TableHead>
            <TableHead className="text-right">Variance</TableHead>
            <TableHead>Transaction</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.auditRowId}>
              <TableCell className="max-w-56 truncate">
                <div className="truncate font-medium">{row.itemName}</div>
                {row.approvalRequired ? (
                  <Badge variant="secondary">Approval required</Badge>
                ) : null}
              </TableCell>
              <TableCell className="text-right">{row.beforeCount}</TableCell>
              <TableCell className="text-right">{row.afterCount}</TableCell>
              <TableCell className="text-right">{row.variance}</TableCell>
              <TableCell className="max-w-56 truncate">
                {row.transactionReference}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
