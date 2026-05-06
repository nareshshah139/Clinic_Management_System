'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  BarChart3,
  PackageSearch,
  RefreshCw,
  Search,
  Truck,
} from 'lucide-react';
import { apiClient } from '@/lib/api';
import { getErrorMessage } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type AnalyticsTotals = {
  invoiceCount: number;
  lineCount: number;
  taxableAmount: number;
  gstAmount: number;
  lineTotal: number;
  purchasedQuantity: number;
  freeQuantity: number;
  totalQuantity: number;
  freeQuantityRatioPercent: number;
  effectiveUnitCost: number;
  averageDiscountPercent: number;
};

type DistributorRow = {
  distributorName: string;
  distributorGstin: string;
  invoiceCount: number;
  lineCount: number;
  taxableAmount: number;
  gstAmount: number;
  lineTotal: number;
  purchasedQuantity: number;
  freeQuantity: number;
  totalQuantity: number;
  freeQuantityRatioPercent: number;
  effectiveUnitCost: number;
  averageDiscountPercent: number;
  lastInvoiceDate: string;
};

type ProductRow = {
  distributorName: string;
  distributorGstin: string;
  productName: string;
  manufacturer: string;
  packSize: string;
  hsnCode: string;
  invoiceCount: number;
  purchasedQuantity: number;
  freeQuantity: number;
  totalQuantity: number;
  taxableAmount: number;
  gstAmount: number;
  lineTotal: number;
  effectiveUnitCost: number;
  averageDiscountPercent: number;
  latestPurchaseRate: number;
  latestDiscountPercent: number;
  lastInvoiceDate: string;
};

type DiscountDropAlert = {
  distributorName: string;
  distributorGstin: string;
  productName: string;
  manufacturer: string;
  packSize: string;
  previousInvoiceNumber: string;
  latestInvoiceNumber: string;
  previousInvoiceDate: string;
  latestInvoiceDate: string;
  previousDiscountPercent: number;
  latestDiscountPercent: number;
  dropPercent: number;
};

type AnalyticsResponse = {
  totals: AnalyticsTotals;
  distributors: DistributorRow[];
  products: ProductRow[];
  discountDropAlerts: DiscountDropAlert[];
};

type FilterState = {
  startDate: string;
  endDate: string;
  distributorGstin: string;
  productName: string;
  hsnCode: string;
  minDiscountDropPercent: string;
};

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
});

const number = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 2,
});

function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function defaultFilters(): FilterState {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - 90);
  return {
    startDate: toDateInput(start),
    endDate: toDateInput(end),
    distributorGstin: '',
    productName: '',
    hsnCode: '',
    minDiscountDropPercent: '5',
  };
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

function emptyAnalytics(): AnalyticsResponse {
  return {
    totals: {
      invoiceCount: 0,
      lineCount: 0,
      taxableAmount: 0,
      gstAmount: 0,
      lineTotal: 0,
      purchasedQuantity: 0,
      freeQuantity: 0,
      totalQuantity: 0,
      freeQuantityRatioPercent: 0,
      effectiveUnitCost: 0,
      averageDiscountPercent: 0,
    },
    distributors: [],
    products: [],
    discountDropAlerts: [],
  };
}

function buildRequestParams(filters: FilterState) {
  const params: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value.trim()) params[key] = value.trim();
  }
  return params;
}

export function DistributorAnalytics() {
  const [filters, setFilters] = useState<FilterState>(() => defaultFilters());
  const [analytics, setAnalytics] = useState<AnalyticsResponse>(() =>
    emptyAnalytics(),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response =
        await apiClient.getPharmacyPurchaseDistributorAnalytics<AnalyticsResponse>(
          buildRequestParams(filters),
        );
      setAnalytics({
        ...emptyAnalytics(),
        ...response,
        totals: {
          ...emptyAnalytics().totals,
          ...(response?.totals || {}),
        },
        distributors: Array.isArray(response?.distributors)
          ? response.distributors
          : [],
        products: Array.isArray(response?.products) ? response.products : [],
        discountDropAlerts: Array.isArray(response?.discountDropAlerts)
          ? response.discountDropAlerts
          : [],
      });
    } catch (err) {
      setAnalytics(emptyAnalytics());
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void loadAnalytics();
    // Load once on tab mount. Filter changes are applied by Refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateFilter = (key: keyof FilterState, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => {
    setFilters(defaultFilters());
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-xl font-semibold tracking-tight">
            Distributor Analytics
          </h3>
          <p className="text-sm text-muted-foreground">
            Reviewed purchase invoices only. Drafts with OCR or reconciliation
            issues are excluded.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={resetFilters} disabled={loading}>
            Reset
          </Button>
          <Button onClick={loadAnalytics} disabled={loading}>
            <RefreshCw
              className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
        <div>
          <Label htmlFor="purchase-start">Start</Label>
          <Input
            id="purchase-start"
            type="date"
            value={filters.startDate}
            onChange={(event) => updateFilter('startDate', event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="purchase-end">End</Label>
          <Input
            id="purchase-end"
            type="date"
            value={filters.endDate}
            onChange={(event) => updateFilter('endDate', event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="purchase-distributor">GSTIN</Label>
          <Input
            id="purchase-distributor"
            value={filters.distributorGstin}
            onChange={(event) =>
              updateFilter('distributorGstin', event.target.value)
            }
            placeholder="Distributor GSTIN"
          />
        </div>
        <div>
          <Label htmlFor="purchase-product">Product</Label>
          <Input
            id="purchase-product"
            value={filters.productName}
            onChange={(event) =>
              updateFilter('productName', event.target.value)
            }
            placeholder="Product name"
          />
        </div>
        <div>
          <Label htmlFor="purchase-hsn">HSN</Label>
          <Input
            id="purchase-hsn"
            value={filters.hsnCode}
            onChange={(event) => updateFilter('hsnCode', event.target.value)}
            placeholder="HSN code"
          />
        </div>
        <div>
          <Label htmlFor="discount-drop">Drop %</Label>
          <Input
            id="discount-drop"
            type="number"
            min="0"
            max="100"
            value={filters.minDiscountDropPercent}
            onChange={(event) =>
              updateFilter('minDiscountDropPercent', event.target.value)
            }
          />
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          title="Purchase Value"
          value={currency.format(analytics.totals.lineTotal || 0)}
          detail={`${analytics.totals.invoiceCount || 0} invoices`}
          icon={<Truck className="h-5 w-5 text-blue-600" />}
        />
        <MetricCard
          title="Taxable"
          value={currency.format(analytics.totals.taxableAmount || 0)}
          detail={`GST ${currency.format(analytics.totals.gstAmount || 0)}`}
          icon={<BarChart3 className="h-5 w-5 text-green-600" />}
        />
        <MetricCard
          title="Free Stock"
          value={number.format(analytics.totals.freeQuantity || 0)}
          detail={`${number.format(analytics.totals.freeQuantityRatioPercent || 0)}% of stock`}
          icon={<PackageSearch className="h-5 w-5 text-purple-600" />}
        />
        <MetricCard
          title="Effective Cost"
          value={currency.format(analytics.totals.effectiveUnitCost || 0)}
          detail={`Avg discount ${number.format(analytics.totals.averageDiscountPercent || 0)}%`}
          icon={<Search className="h-5 w-5 text-slate-600" />}
        />
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold">Distributor Ranking</h4>
          <Badge variant="outline">
            {analytics.distributors.length} distributors
          </Badge>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Distributor</TableHead>
              <TableHead>Invoices</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead className="text-right">Free Qty</TableHead>
              <TableHead className="text-right">Avg Discount</TableHead>
              <TableHead>Last Invoice</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {analytics.distributors.length === 0 ? (
              <EmptyRow colSpan={6} label="No reviewed purchase data found" />
            ) : (
              analytics.distributors.map((row) => (
                <TableRow key={row.distributorGstin}>
                  <TableCell>
                    <div className="font-medium">{row.distributorName}</div>
                    <div className="text-xs text-muted-foreground">
                      {row.distributorGstin}
                    </div>
                  </TableCell>
                  <TableCell>{row.invoiceCount}</TableCell>
                  <TableCell className="text-right">
                    {currency.format(row.lineTotal || 0)}
                  </TableCell>
                  <TableCell className="text-right">
                    {number.format(row.freeQuantity || 0)}
                  </TableCell>
                  <TableCell className="text-right">
                    {number.format(row.averageDiscountPercent || 0)}%
                  </TableCell>
                  <TableCell>{formatDate(row.lastInvoiceDate)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold">Product Effective Cost</h4>
          <Badge variant="outline">{analytics.products.length} products</Badge>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Distributor</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Effective Cost</TableHead>
              <TableHead className="text-right">Latest Rate</TableHead>
              <TableHead className="text-right">Discount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {analytics.products.length === 0 ? (
              <EmptyRow colSpan={6} label="No product analytics available" />
            ) : (
              analytics.products.map((row) => (
                <TableRow
                  key={`${row.distributorGstin}-${row.productName}-${row.packSize}`}
                >
                  <TableCell>
                    <div className="font-medium">{row.productName}</div>
                    <div className="text-xs text-muted-foreground">
                      {row.manufacturer} · {row.packSize} · HSN {row.hsnCode}
                    </div>
                  </TableCell>
                  <TableCell>{row.distributorName}</TableCell>
                  <TableCell className="text-right">
                    {number.format(row.totalQuantity || 0)}
                  </TableCell>
                  <TableCell className="text-right">
                    {currency.format(row.effectiveUnitCost || 0)}
                  </TableCell>
                  <TableCell className="text-right">
                    {currency.format(row.latestPurchaseRate || 0)}
                  </TableCell>
                  <TableCell className="text-right">
                    {number.format(row.latestDiscountPercent || 0)}%
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold">Discount Drop Alerts</h4>
          <Badge variant={analytics.discountDropAlerts.length ? 'destructive' : 'outline'}>
            {analytics.discountDropAlerts.length} alerts
          </Badge>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Distributor</TableHead>
              <TableHead className="text-right">Previous</TableHead>
              <TableHead className="text-right">Latest</TableHead>
              <TableHead className="text-right">Drop</TableHead>
              <TableHead>Invoices</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {analytics.discountDropAlerts.length === 0 ? (
              <EmptyRow colSpan={6} label="No discount-drop alerts" />
            ) : (
              analytics.discountDropAlerts.map((alert) => (
                <TableRow
                  key={`${alert.distributorGstin}-${alert.productName}-${alert.latestInvoiceNumber}`}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-600" />
                      <span className="font-medium">{alert.productName}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {alert.manufacturer} · {alert.packSize}
                    </div>
                  </TableCell>
                  <TableCell>{alert.distributorName}</TableCell>
                  <TableCell className="text-right">
                    {number.format(alert.previousDiscountPercent || 0)}%
                  </TableCell>
                  <TableCell className="text-right">
                    {number.format(alert.latestDiscountPercent || 0)}%
                  </TableCell>
                  <TableCell className="text-right text-red-700 font-medium">
                    {number.format(alert.dropPercent || 0)}%
                  </TableCell>
                  <TableCell>
                    <div className="text-xs">
                      {alert.previousInvoiceNumber} to {alert.latestInvoiceNumber}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(alert.latestInvoiceDate)}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}

function MetricCard({
  title,
  value,
  detail,
  icon,
}: {
  title: string;
  value: string;
  detail: string;
  icon: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-xs text-muted-foreground">{detail}</p>
          </div>
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <TableRow>
      <TableCell
        colSpan={colSpan}
        className="h-20 text-center text-muted-foreground"
      >
        {label}
      </TableCell>
    </TableRow>
  );
}
