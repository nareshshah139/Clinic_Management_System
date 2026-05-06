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
type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'brand';

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
  discrepancyFlag?: string | null;
  discrepancyReason?: string | null;
};

type PartnerSale = {
  id: string;
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

  const commitStock = async (saleId: string) => {
    setCommittingId(saleId);
    setError(null);
    try {
      await apiClient.post(
        `/pharmacy/partner-sales/${saleId}/commit-stock`,
        {},
      );
      toast({ title: 'Stock commit processed' });
      await loadData();
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      toast({
        variant: 'destructive',
        title: 'Commit failed',
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

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
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
                        <Button
                          size="sm"
                          variant={
                            sale.stockCommittedAt ? 'outline' : 'default'
                          }
                          disabled={Boolean(
                            sale.stockCommittedAt || committingId === sale.id,
                          )}
                          onClick={() => commitStock(sale.id)}
                        >
                          {committingId === sale.id ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : sale.stockCommittedAt ? (
                            <PackageCheck className="mr-2 h-4 w-4" />
                          ) : (
                            <Send className="mr-2 h-4 w-4" />
                          )}
                          {sale.stockCommittedAt ? 'Committed' : 'Commit'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
