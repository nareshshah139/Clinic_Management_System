'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  PackageCheck,
  Plus,
  RefreshCw,
  Save,
  Send,
  Trash2,
} from 'lucide-react';
import { apiClient } from '@/lib/api';
import { getErrorMessage } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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

type PaymentMode = 'CASH' | 'CARD' | 'UPI' | 'BNPL';
type SaleStatus =
  | 'SUBMITTED'
  | 'STOCK_COMMITTED'
  | 'PARTIAL_STOCK_COMMITTED'
  | 'RECONCILIATION_REQUIRED'
  // eslint-disable-next-line no-restricted-syntax -- Partner sale status, not an appointment status.
  | 'CANCELLED';
type BadgeVariant =
  | 'default'
  | 'secondary'
  | 'destructive'
  | 'outline'
  | 'brand';

type SaleItemForm = {
  localId: string;
  medicineName: string;
  batchNumber: string;
  quantitySold: string;
  mrp: string;
  discountGiven: string;
  paymentMode: PaymentMode;
};

type PartnerSaleItem = {
  id?: string;
  medicineName: string;
  batchNumber: string;
  quantitySold: number;
  mrp: number;
  discountGiven: number;
  paymentMode: PaymentMode;
  committedQuantity?: number;
  recoveryInventoryItemId?: string | null;
  discrepancyFlag?: string | null;
  discrepancyReason?: string | null;
};

type PartnerSale = {
  id: string;
  version: number;
  canReconcile?: boolean;
  partnerOrganizationId: string;
  partnerOrganizationName: string;
  date: string;
  source: 'MANUAL' | 'CSV';
  status: SaleStatus;
  lateEntry: boolean;
  hasDiscrepancy: boolean;
  discrepancyFlags?: string[];
  stockCommittedAt?: string | null;
  totalQuantity: number;
  grossAmount: number;
  totalDiscount: number;
  netAmount: number;
  items?: PartnerSaleItem[];
};

type Summary = {
  date: string;
  partnerCount: number;
  submittedCount: number;
  missingCount: number;
  totalQuantity: number;
  grossAmount: number;
  netAmount: number;
  discrepancyCount: number;
  stockCommittedCount: number;
  statusCounts?: Record<string, number>;
};

type MissingPartner = {
  partnerOrganizationId: string;
  partnerOrganizationName: string;
  cutoffHour: number;
  cutoffAt: string;
  cutoffReached: boolean;
  late: boolean;
};

type SaleListResponse = {
  data?: PartnerSale[];
};

const newLine = (): SaleItemForm => ({
  localId: Math.random().toString(36).slice(2),
  medicineName: '',
  batchNumber: '',
  quantitySold: '1',
  mrp: '',
  discountGiven: '0',
  paymentMode: 'UPI',
});

const today = () => new Date().toISOString().slice(0, 10);

const money = (value: number | string | null | undefined) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const statusTone: Record<SaleStatus, BadgeVariant> = {
  SUBMITTED: 'secondary',
  STOCK_COMMITTED: 'default',
  PARTIAL_STOCK_COMMITTED: 'outline',
  RECONCILIATION_REQUIRED: 'destructive',
  CANCELLED: 'destructive',
};

export function PartnerDailySync() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [committingId, setCommittingId] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [matchingId, setMatchingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(today());
  const [partnerOrganizationName, setPartnerOrganizationName] = useState('');
  const [partnerOrganizationId, setPartnerOrganizationId] = useState('');
  const [partnerUserName, setPartnerUserName] = useState('');
  const [items, setItems] = useState<SaleItemForm[]>([newLine()]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [missing, setMissing] = useState<MissingPartner[]>([]);
  const [recentSales, setRecentSales] = useState<PartnerSale[]>([]);

  const formTotal = useMemo(
    () =>
      items.reduce((sum, item) => {
        const qty = Number(item.quantitySold || 0);
        const mrp = Number(item.mrp || 0);
        const discount = Number(item.discountGiven || 0);
        return sum + Math.max(0, qty * mrp - discount);
      }, 0),
    [items],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryResponse, missingResponse, salesResponse] =
        await Promise.all([
          apiClient.get<Summary>('/pharmacy/partner-sales/today-summary'),
          apiClient.get<{ missingPartners?: MissingPartner[] }>(
            '/pharmacy/partner-sales/missing',
            { date },
          ),
          apiClient.get<SaleListResponse>('/pharmacy/partner-sales', {
            date,
            limit: 8,
          }),
        ]);
      setSummary(summaryResponse);
      setMissing(missingResponse.missingPartners || []);
      setRecentSales(salesResponse.data || []);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const updateItem = <K extends keyof SaleItemForm>(
    localId: string,
    field: K,
    value: SaleItemForm[K],
  ) => {
    setItems((current) =>
      current.map((item) =>
        item.localId === localId ? { ...item, [field]: value } : item,
      ),
    );
  };

  const removeItem = (localId: string) => {
    setItems((current) =>
      current.length === 1
        ? current
        : current.filter((item) => item.localId !== localId),
    );
  };

  const submitSale = async () => {
    const validItems = items.filter(
      (item) =>
        item.medicineName.trim() &&
        item.batchNumber.trim() &&
        Number(item.quantitySold) > 0,
    );
    if (!partnerOrganizationId.trim() && !partnerOrganizationName.trim()) {
      toast({
        variant: 'destructive',
        title: 'Partner organization required',
      });
      return;
    }
    if (validItems.length === 0) {
      toast({ variant: 'destructive', title: 'At least one item is required' });
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await apiClient.post<PartnerSale>('/pharmacy/partner-sales', {
        partnerOrganizationId: partnerOrganizationId.trim() || undefined,
        partnerOrganizationName: partnerOrganizationName.trim() || undefined,
        partnerUserName: partnerUserName.trim() || undefined,
        date,
        source: 'MANUAL',
        items: validItems.map((item) => ({
          medicineName: item.medicineName.trim(),
          batchNumber: item.batchNumber.trim(),
          quantitySold: Number(item.quantitySold),
          mrp: Number(item.mrp || 0),
          discountGiven: Number(item.discountGiven || 0),
          paymentMode: item.paymentMode,
        })),
      });
      toast({ title: 'Partner sale submitted' });
      setItems([newLine()]);
      await loadData();
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      toast({
        variant: 'destructive',
        title: 'Submission failed',
        description: message,
      });
    } finally {
      setSaving(false);
    }
  };

  const commitStock = async (sale: PartnerSale) => {
    setCommittingId(sale.id);
    setError(null);
    try {
      const updated = await apiClient.post<PartnerSale>(
        `/pharmacy/partner-sales/${sale.id}/commit-stock`,
        { expectedVersion: sale.version },
      );
      if (!isConfirmedPartnerCommit(sale, updated))
        throw new Error('The stock result could not be verified');
      setRecentSales((current) =>
        current.map((row) => (row.id === updated.id ? updated : row)),
      );
      const remaining = outstandingQuantity(updated);
      toast({
        title: remaining
          ? `${remaining} units still outstanding`
          : 'All sale quantities committed',
        description: remaining
          ? 'Match unresolved products or receive stock, then retry outstanding quantities.'
          : undefined,
      });
      await loadData();
    } catch (err) {
      await loadData();
      const message = `The stock outcome was not confirmed. Refresh the submission and review its quantities before retrying. ${getErrorMessage(err)}`;
      setError(message);
      toast({
        variant: 'destructive',
        title: 'Check the stock outcome',
        description: message,
      });
    } finally {
      setCommittingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-normal">
            Partner Daily Sync
          </h2>
        </div>
        <Button variant="outline" onClick={loadData} disabled={loading}>
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Refresh
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Partner sync error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Partners</CardDescription>
            <CardTitle>{summary?.partnerCount ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Submitted Today</CardDescription>
            <CardTitle>{summary?.submittedCount ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Missing</CardDescription>
            <CardTitle>{summary?.missingCount ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Net Sales</CardDescription>
            <CardTitle>{money(summary?.netAmount)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Manual Daily Entry</CardTitle>
            <CardDescription>{date}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="partner-date">Date</Label>
                <Input
                  id="partner-date"
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="partner-id">Organization ID</Label>
                <Input
                  id="partner-id"
                  value={partnerOrganizationId}
                  onChange={(event) =>
                    setPartnerOrganizationId(event.target.value)
                  }
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="partner-name">Organization Name</Label>
                <Input
                  id="partner-name"
                  value={partnerOrganizationName}
                  onChange={(event) =>
                    setPartnerOrganizationName(event.target.value)
                  }
                  placeholder="Required without ID"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="partner-user">Submitted By</Label>
                <Input
                  id="partner-user"
                  value={partnerUserName}
                  onChange={(event) => setPartnerUserName(event.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>

            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[180px]">Medicine</TableHead>
                    <TableHead className="min-w-[120px]">Batch</TableHead>
                    <TableHead className="w-[96px]">Qty</TableHead>
                    <TableHead className="w-[120px]">MRP</TableHead>
                    <TableHead className="w-[120px]">Discount</TableHead>
                    <TableHead className="w-[130px]">Payment</TableHead>
                    <TableHead className="w-[52px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.localId}>
                      <TableCell>
                        <Input
                          value={item.medicineName}
                          onChange={(event) =>
                            updateItem(
                              item.localId,
                              'medicineName',
                              event.target.value,
                            )
                          }
                          placeholder="Medicine name"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={item.batchNumber}
                          onChange={(event) =>
                            updateItem(
                              item.localId,
                              'batchNumber',
                              event.target.value,
                            )
                          }
                          placeholder="Batch"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="1"
                          value={item.quantitySold}
                          onChange={(event) =>
                            updateItem(
                              item.localId,
                              'quantitySold',
                              event.target.value,
                            )
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          value={item.mrp}
                          onChange={(event) =>
                            updateItem(item.localId, 'mrp', event.target.value)
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          value={item.discountGiven}
                          onChange={(event) =>
                            updateItem(
                              item.localId,
                              'discountGiven',
                              event.target.value,
                            )
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={item.paymentMode}
                          onValueChange={(value: string) =>
                            updateItem(
                              item.localId,
                              'paymentMode',
                              value as PaymentMode,
                            )
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="CASH">Cash</SelectItem>
                            <SelectItem value="CARD">Card</SelectItem>
                            <SelectItem value="UPI">UPI</SelectItem>
                            <SelectItem value="BNPL">BNPL</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeItem(item.localId)}
                          disabled={items.length === 1}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => setItems((current) => [...current, newLine()])}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Item
              </Button>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  Form total {money(formTotal)}
                </span>
                <Button onClick={submitSale} disabled={saving}>
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Submit
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Missing Entries</CardTitle>
            <CardDescription>
              Organizations without a sale for {date}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {missing.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                No missing entries for the selected date.
              </div>
            ) : (
              <div className="space-y-3">
                {missing.map((partner) => (
                  <div
                    key={partner.partnerOrganizationId}
                    className="rounded-md border p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">
                          {partner.partnerOrganizationName}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Cutoff {partner.cutoffHour}:00
                        </p>
                      </div>
                      <Badge variant={partner.late ? 'destructive' : 'outline'}>
                        <Clock className="mr-1 h-3 w-3" />
                        {partner.late ? 'Late' : 'Pending'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Submissions</CardTitle>
          <CardDescription>{date}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Partner</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Net</TableHead>
                  <TableHead>Flags</TableHead>
                  <TableHead className="w-[140px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentSales.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="h-20 text-center text-muted-foreground"
                    >
                      No submissions for this date.
                    </TableCell>
                  </TableRow>
                ) : (
                  recentSales.map((sale) => (
                    <TableRow key={sale.id}>
                      <TableCell className="font-medium">
                        {sale.partnerOrganizationName}
                      </TableCell>
                      <TableCell>{sale.date.slice(0, 10)}</TableCell>
                      <TableCell>
                        <Badge variant={statusTone[sale.status]}>
                          {sale.status.replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>{sale.totalQuantity}</TableCell>
                      <TableCell>{money(sale.netAmount)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {sale.lateEntry && (
                            <Badge variant="outline">Late</Badge>
                          )}
                          {sale.hasDiscrepancy && (
                            <Badge variant="destructive">Discrepancy</Badge>
                          )}
                          {!sale.lateEntry && !sale.hasDiscrepancy && (
                            <Badge variant="secondary">Clear</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-2">
                          <Button
                            size="sm"
                            variant={
                              outstandingQuantity(sale) > 0
                                ? 'default'
                                : 'outline'
                            }
                            disabled={
                              sale.status === 'CANCELLED' ||
                              outstandingQuantity(sale) <= 0 ||
                              committingId === sale.id ||
                              matchingId === sale.id ||
                              !Number.isSafeInteger(sale.version)
                            }
                            onClick={() => void commitStock(sale)}
                          >
                            {committingId === sale.id ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : outstandingQuantity(sale) <= 0 ? (
                              <PackageCheck className="mr-2 h-4 w-4" />
                            ) : (
                              <Send className="mr-2 h-4 w-4" />
                            )}
                            {sale.status === 'CANCELLED'
                              ? 'Cancelled'
                              : outstandingQuantity(sale) <= 0
                                ? 'Committed'
                                : sale.stockCommittedAt
                                  ? 'Retry outstanding'
                                  : 'Commit'}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {recentSales
            .filter(
              (sale) =>
                sale.canReconcile &&
                sale.status !== 'CANCELLED' &&
                outstandingQuantity(sale) > 0,
            )
            .map((sale) => (
              <div
                key={sale.id}
                className="mt-4 space-y-4 rounded-md border bg-muted/30 p-3 sm:p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">
                    {sale.partnerOrganizationName} · {outstandingQuantity(sale)}{' '}
                    units outstanding
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      committingId === sale.id || matchingId === sale.id
                    }
                    onClick={() =>
                      setResolvingId((current) =>
                        current === sale.id ? null : sale.id,
                      )
                    }
                  >
                    {resolvingId === sale.id
                      ? 'Close corrections'
                      : 'Resolve outstanding'}
                  </Button>
                </div>
                {resolvingId === sale.id && (
                  <div className="space-y-4">
                    <p className="text-sm">
                      Already committed quantities stay unchanged. Correct the
                      product lookup, choose the stocked batch and enter a
                      reason. Matching does not deduct stock.
                    </p>
                    {(sale.items || [])
                      .filter(
                        (item) =>
                          item.quantitySold >
                          Number(item.committedQuantity || 0),
                      )
                      .map((item) => (
                        <PartnerLineRecovery
                          key={item.id}
                          sale={sale}
                          item={item}
                          onChanged={loadData}
                          onBusyChange={(busy) =>
                            setMatchingId(busy ? sale.id : null)
                          }
                          disabled={
                            committingId === sale.id || matchingId === sale.id
                          }
                        />
                      ))}
                    <Button
                      disabled={
                        committingId === sale.id ||
                        matchingId === sale.id ||
                        !Number.isSafeInteger(sale.version)
                      }
                      onClick={() => void commitStock(sale)}
                    >
                      Retry these outstanding units
                    </Button>
                  </div>
                )}
              </div>
            ))}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * @cc [owner:nareshshah139,label:product] partner-complete-acknowledgement
 * A write acknowledgement MUST retain every original line identity and sold quantity and advance
 * the sale revision. Missing, stale, inconsistent or regressing progress MUST remain an unknown outcome.
 */
function hasCompletePartnerSnapshot(
  previous: PartnerSale,
  updated: PartnerSale,
) {
  if (
    !updated ||
    typeof updated !== 'object' ||
    updated.id !== previous.id ||
    !Number.isSafeInteger(updated.version) ||
    updated.version <= previous.version ||
    !Array.isArray(previous.items) ||
    previous.items.length === 0 ||
    !Array.isArray(updated.items) ||
    updated.items.length !== previous.items.length ||
    typeof updated.hasDiscrepancy !== 'boolean' ||
    typeof updated.canReconcile !== 'boolean'
  )
    return false;
  const immutableHeaders = [
    'partnerOrganizationId',
    'partnerOrganizationName',
    'date',
    'source',
    'totalQuantity',
    'grossAmount',
    'totalDiscount',
    'netAmount',
    'lateEntry',
  ] as const;
  if (immutableHeaders.some((key) => updated[key] !== previous[key]))
    return false;
  const originals = new Map(previous.items.map((line) => [line.id, line]));
  if (
    originals.size !== previous.items.length ||
    new Set(updated.items.map((line) => line?.id)).size !==
      previous.items.length
  )
    return false;
  return updated.items.every((line) => {
    if (
      !line ||
      typeof line.id !== 'string' ||
      !line.id ||
      !Number.isSafeInteger(line.quantitySold) ||
      line.quantitySold <= 0 ||
      !Number.isSafeInteger(line.committedQuantity)
    )
      return false;
    const original = originals.get(line.id);
    return Boolean(
      original &&
        line.quantitySold === original.quantitySold &&
        line.medicineName === original.medicineName &&
        line.batchNumber === original.batchNumber &&
        line.mrp === original.mrp &&
        line.discountGiven === original.discountGiven &&
        line.paymentMode === original.paymentMode &&
        Number(line.committedQuantity) >=
          Number(original.committedQuantity || 0) &&
        Number(line.committedQuantity) <= line.quantitySold &&
        (line.discrepancyReason == null ||
          typeof line.discrepancyReason === 'string') &&
        (line.recoveryInventoryItemId == null ||
          typeof line.recoveryInventoryItemId === 'string'),
    );
  });
}

function isConfirmedPartnerCommit(previous: PartnerSale, updated: PartnerSale) {
  if (!hasCompletePartnerSnapshot(previous, updated)) return false;
  const lines = updated.items!;
  const committed = lines.reduce(
    (sum, line) => sum + Number(line.committedQuantity),
    0,
  );
  const complete = lines.every(
    (line) => line.committedQuantity === line.quantitySold,
  );
  return (
    updated.status ===
    (complete
      ? 'STOCK_COMMITTED'
      : committed > 0
        ? 'PARTIAL_STOCK_COMMITTED'
        : 'RECONCILIATION_REQUIRED')
  );
}

function isConfirmedPartnerMatch(
  previous: PartnerSale,
  updated: PartnerSale,
  lineId: string | undefined,
  batchId: string,
) {
  if (
    !hasCompletePartnerSnapshot(previous, updated) ||
    updated.version !== previous.version + 1 ||
    updated.status !== previous.status
  )
    return false;
  return updated.items!.every((line) => {
    const original = previous.items!.find((item) => item.id === line.id)!;
    return (
      line.committedQuantity === Number(original.committedQuantity || 0) &&
      (line.id === lineId
        ? line.recoveryInventoryItemId === batchId
        : line.recoveryInventoryItemId === original.recoveryInventoryItemId)
    );
  });
}

const outstandingQuantity = (sale: PartnerSale) =>
  (sale.items || []).reduce(
    (sum, item) =>
      sum +
      Math.max(0, item.quantitySold - Number(item.committedQuantity || 0)),
    0,
  );

type RecoveryBatch = {
  id: string;
  name: string;
  batchNumber?: string | null;
  availableQuantity: number;
  unit: string;
  expiryDate?: string | null;
};

/**
 * @cc [owner:nareshshah139,label:product] partner-inline-match-preserves-sale
 * Staff MUST explicitly choose a batch and supply a reason for only the outstanding quantity.
 * Saving a match MUST preserve sold inputs and require a separate action before stock is deducted.
 */
function PartnerLineRecovery({
  sale,
  item,
  onChanged,
  onBusyChange,
  disabled,
}: {
  sale: PartnerSale;
  item: PartnerSaleItem;
  onChanged: () => Promise<void>;
  onBusyChange: (busy: boolean) => void;
  disabled: boolean;
}) {
  const [search, setSearch] = useState(item.medicineName);
  const [matches, setMatches] = useState<RecoveryBatch[] | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const searchBatches = async () => {
    setBusy(true);
    onBusyChange(true);
    setError(null);
    setMatches(null);
    setSelectedId('');
    setSaved(false);
    try {
      const result = await apiClient.get<{ matches: RecoveryBatch[] }>(
        `/pharmacy/partner-sales/${sale.id}/items/${item.id}/recovery-matches`,
        { search: search.trim() },
      );
      if (!Array.isArray(result.matches))
        throw new Error('Batch search could not be verified');
      setMatches(result.matches);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  };
  const saveMatch = async () => {
    setBusy(true);
    onBusyChange(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await apiClient.post<PartnerSale>(
        `/pharmacy/partner-sales/${sale.id}/items/${item.id}/reconcile`,
        {
          expectedVersion: sale.version,
          inventoryItemId: selectedId,
          reason: reason.trim(),
        },
      );
      if (!isConfirmedPartnerMatch(sale, updated, item.id, selectedId))
        throw new Error('The match result could not be verified');
      await onChanged();
      setSaved(true);
    } catch (err) {
      await onChanged();
      setError(
        `The match was not confirmed. Refresh the submission and review its selected batch before retrying. ${getErrorMessage(err)}`,
      );
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  };
  return (
    <div className="space-y-3 rounded-md border bg-background p-3">
      <div>
        <p className="font-medium">
          {item.medicineName} · batch {item.batchNumber}
        </p>
        <p className="text-sm text-muted-foreground">
          {Number(item.committedQuantity || 0)} committed ·{' '}
          {item.quantitySold - Number(item.committedQuantity || 0)} outstanding
        </p>
      </div>
      {item.discrepancyReason && (
        <p className="text-sm">{item.discrepancyReason}</p>
      )}
      {item.recoveryInventoryItemId && (
        <p className="text-sm text-emerald-700">
          A batch is selected for the outstanding quantity. Retry outstanding
          when stock is available.
        </p>
      )}
      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <Label htmlFor={`partner-search-${item.id}`}>
            Corrected product name or batch
          </Label>
          <Input
            id={`partner-search-${item.id}`}
            value={search}
            maxLength={100}
            onChange={(event) => setSearch(event.target.value)}
            disabled={disabled || busy}
          />
        </div>
        <Button
          variant="outline"
          onClick={() => void searchBatches()}
          disabled={disabled || busy || !search.trim()}
        >
          Search batches
        </Button>
      </div>
      {matches && matches.length === 0 && (
        <p className="text-sm">
          No stocked batch matches this search. Add or correct the product in
          Inventory, receive its stock, then search again. The submitted sale
          stays saved.
        </p>
      )}
      {matches && matches.length > 0 && (
        <>
          <Label htmlFor={`partner-batch-${item.id}`}>
            Choose the actual product and batch
          </Label>
          <select
            id={`partner-batch-${item.id}`}
            value={selectedId}
            onChange={(event) => {
              setSelectedId(event.target.value);
              setSaved(false);
            }}
            disabled={disabled || busy}
            className="w-full min-w-0 rounded-md border bg-background p-2 text-sm"
          >
            <option value="">Choose a batch</option>
            {matches.map((batch) => (
              <option key={batch.id} value={batch.id}>
                {batch.name} · batch {batch.batchNumber || 'not recorded'} ·{' '}
                {batch.availableQuantity} {batch.unit} available
                {batch.expiryDate
                  ? ` · expires ${batch.expiryDate.slice(0, 10)}`
                  : ''}
              </option>
            ))}
          </select>
          <div>
            <Label htmlFor={`partner-reason-${item.id}`}>
              Reason for correcting the match
            </Label>
            <Input
              id={`partner-reason-${item.id}`}
              value={reason}
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
              disabled={disabled || busy}
            />
          </div>
          <Button
            onClick={() => void saveMatch()}
            disabled={disabled || busy || !selectedId || !reason.trim()}
          >
            Save match
          </Button>
        </>
      )}
      {saved && (
        <p role="status" className="text-sm text-emerald-700">
          Match saved. Use Retry outstanding to deduct only the remaining
          quantities.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
