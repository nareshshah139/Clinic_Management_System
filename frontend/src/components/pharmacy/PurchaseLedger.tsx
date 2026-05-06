"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock,
  CreditCard,
  Loader2,
  RefreshCw,
  Send,
} from "lucide-react";
import { apiClient } from "@/lib/api";
import { getErrorMessage } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";

type PaymentMode = "CASH" | "CHEQUE" | "NEFT" | "UPI" | "CARD";
type PaymentStatus = "PENDING" | "PARTIALLY_PAID" | "PAID";

type DistributorSummary = {
  distributorGstin: string;
  distributorName: string;
  invoiceCount: number;
  invoiceTotal: number;
  paid: number;
  outstanding: number;
  counts: {
    pending: number;
    partial: number;
    paid: number;
  };
  overdue: {
    count: number;
    amount: number;
  };
  dueSoon: {
    count: number;
    amount: number;
  };
  averagePaymentCycleDays: number | null;
  annualPurchaseTotal: number;
  tcsThreshold: number;
  tcsRemaining: number;
  tcsApproaching: boolean;
};

type AgingBucket = {
  label: string;
  count: number;
  amount: number;
};

type LedgerInvoice = {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string | null;
  netPayable: number;
  paid: number;
  outstanding: number;
  paymentStatus: PaymentStatus;
};

type DistributorLedger = {
  distributorGstin: string;
  distributorName: string;
  invoices: LedgerInvoice[];
};

type AlertInvoice = {
  id: string;
  invoiceNumber: string;
  distributorName: string;
  distributorGstin: string;
  dueDate: string;
  outstanding: number;
  daysPastDue: number;
};

type AlertsResponse = {
  dueIn7Days: AlertInvoice[];
  dueToday: AlertInvoice[];
  overdue: AlertInvoice[];
  tcsApproaching: {
    distributorName: string;
    distributorGstin: string;
    annualPurchaseTotal: number;
    tcsThreshold: number;
    tcsRemaining: number;
  }[];
  counts: {
    dueIn7Days: number;
    dueToday: number;
    overdue: number;
    tcsApproaching: number;
  };
};

const paymentModes: PaymentMode[] = ["CASH", "CHEQUE", "NEFT", "UPI", "CARD"];

const formatMoney = (value: number) =>
  `Rs ${Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;

const todayInput = () => new Date().toISOString().slice(0, 10);

export function PurchaseLedger() {
  const [summaries, setSummaries] = useState<DistributorSummary[]>([]);
  const [aging, setAging] = useState<AgingBucket[]>([]);
  const [alerts, setAlerts] = useState<AlertsResponse | null>(null);
  const [ledger, setLedger] = useState<DistributorLedger | null>(null);
  const [selectedGstin, setSelectedGstin] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayInput());
  const [mode, setMode] = useState<PaymentMode>("NEFT");
  const [amount, setAmount] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [allocations, setAllocations] = useState<Record<string, string>>({});

  const selectedDistributor = useMemo(
    () =>
      summaries.find((summary) => summary.distributorGstin === selectedGstin) ||
      null,
    [selectedGstin, summaries],
  );

  const outstandingInvoices = useMemo(
    () => (ledger?.invoices || []).filter((invoice) => invoice.outstanding > 0),
    [ledger],
  );

  const allocationTotal = useMemo(
    () =>
      Object.values(allocations).reduce((sum, value) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? sum + parsed : sum;
      }, 0),
    [allocations],
  );

  const loadLedger = useCallback(async (gstin: string) => {
    if (!gstin) {
      setLedger(null);
      return;
    }
    const response = await apiClient.get<DistributorLedger>(
      `/pharmacy/purchase-ledger/distributors/${gstin}`,
    );
    setLedger(response);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [summaryResponse, agingResponse, alertsResponse] =
        await Promise.all([
          apiClient.get<{ distributors?: DistributorSummary[] }>(
            "/pharmacy/purchase-ledger/distributors",
          ),
          apiClient.get<{ buckets?: AgingBucket[] }>(
            "/pharmacy/purchase-ledger/aging",
          ),
          apiClient.get<AlertsResponse>("/pharmacy/purchase-ledger/alerts"),
        ]);

      const nextSummaries = summaryResponse.distributors || [];
      setSummaries(nextSummaries);
      setAging(agingResponse.buckets || []);
      setAlerts(alertsResponse);

      const nextGstin =
        selectedGstin ||
        nextSummaries.find((summary) => summary.outstanding > 0)
          ?.distributorGstin ||
        nextSummaries[0]?.distributorGstin ||
        "";
      setSelectedGstin(nextGstin);
      await loadLedger(nextGstin);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [loadLedger, selectedGstin]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    setAllocations({});
    setAmount("");
  }, [selectedGstin]);

  const handleDistributorChange = async (gstin: string) => {
    setSelectedGstin(gstin);
    setError("");
    try {
      await loadLedger(gstin);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const allocateOutstanding = (invoice: LedgerInvoice) => {
    setAllocations((previous) => {
      const next = {
        ...previous,
        [invoice.id]: String(invoice.outstanding),
      };
      const total = Object.values(next).reduce((sum, value) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? sum + parsed : sum;
      }, 0);
      setAmount(String(total));
      return next;
    });
  };

  const submitPayment = async () => {
    if (!selectedDistributor) return;
    const allocationRows = Object.entries(allocations)
      .map(([purchaseInvoiceId, value]) => ({
        purchaseInvoiceId,
        amount: Number(value),
      }))
      .filter((allocation) => allocation.amount > 0);

    setSaving(true);
    setError("");
    setMessage("");
    try {
      await apiClient.post("/pharmacy/purchase-ledger/payments", {
        distributorGstin: selectedDistributor.distributorGstin,
        distributorName: selectedDistributor.distributorName,
        paymentDate,
        mode,
        amount: Number(amount),
        referenceNo: referenceNo || undefined,
        notes: notes || undefined,
        allocations: allocationRows,
      });
      setMessage("Payment recorded and allocated.");
      setAllocations({});
      setAmount("");
      setReferenceNo("");
      setNotes("");
      await loadAll();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-normal">
            Purchase Ledger
          </h2>
        </div>
        <Button
          variant="outline"
          onClick={() => void loadAll()}
          disabled={loading}
        >
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
          <AlertTitle>Ledger error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {message && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Saved</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Outstanding</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {formatMoney(
              summaries.reduce((sum, summary) => sum + summary.outstanding, 0),
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Overdue</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {formatMoney(
              summaries.reduce(
                (sum, summary) => sum + summary.overdue.amount,
                0,
              ),
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Due Soon</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {alerts?.counts.dueIn7Days || 0}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">TCS Watch</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {alerts?.counts.tcsApproaching || 0}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Distributor Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Distributor</TableHead>
                  <TableHead className="text-right">Invoices</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead className="text-right">Overdue</TableHead>
                  <TableHead className="text-right">TCS Remaining</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summaries.map((summary) => (
                  <TableRow
                    key={summary.distributorGstin}
                    className="cursor-pointer"
                    onClick={() =>
                      void handleDistributorChange(summary.distributorGstin)
                    }
                  >
                    <TableCell>
                      <div className="font-medium">
                        {summary.distributorName}
                      </div>
                      <div className="text-xs text-gray-500">
                        {summary.distributorGstin}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Badge variant="outline">
                          Pending {summary.counts.pending}
                        </Badge>
                        <Badge variant="outline">
                          Partial {summary.counts.partial}
                        </Badge>
                        <Badge variant="outline">
                          Paid {summary.counts.paid}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {summary.invoiceCount}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatMoney(summary.outstanding)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatMoney(summary.overdue.amount)}
                    </TableCell>
                    <TableCell className="text-right">
                      {summary.tcsApproaching && (
                        <Badge className="mb-1 bg-amber-100 text-amber-800">
                          Watch
                        </Badge>
                      )}
                      <div>{formatMoney(summary.tcsRemaining)}</div>
                    </TableCell>
                  </TableRow>
                ))}
                {summaries.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-8 text-center text-sm text-gray-500"
                    >
                      No distributor ledger rows found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Aging</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {aging.map((bucket) => (
                <div
                  key={bucket.label}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-gray-500" />
                    <span className="font-medium">{bucket.label}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">
                      {formatMoney(bucket.amount)}
                    </div>
                    <div className="text-xs text-gray-500">
                      {bucket.count} invoices
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Alerts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <AlertLine
                icon={<Bell className="h-4 w-4 text-blue-600" />}
                label="Due in 7 days"
                count={alerts?.counts.dueIn7Days || 0}
              />
              <AlertLine
                icon={<Clock className="h-4 w-4 text-amber-600" />}
                label="Due today"
                count={alerts?.counts.dueToday || 0}
              />
              <AlertLine
                icon={<AlertTriangle className="h-4 w-4 text-red-600" />}
                label="Overdue"
                count={alerts?.counts.overdue || 0}
              />
              <AlertLine
                icon={<CreditCard className="h-4 w-4 text-purple-600" />}
                label="TCS approaching"
                count={alerts?.counts.tcsApproaching || 0}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bulk Payment Allocation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-5">
            <div className="md:col-span-2">
              <Label>Distributor</Label>
              <Select
                value={selectedGstin}
                onValueChange={(value: string) =>
                  void handleDistributorChange(value)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select distributor" />
                </SelectTrigger>
                <SelectContent>
                  {summaries.map((summary) => (
                    <SelectItem
                      key={summary.distributorGstin}
                      value={summary.distributorGstin}
                    >
                      {summary.distributorName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Payment Date</Label>
              <Input
                type="date"
                value={paymentDate}
                onChange={(event) => setPaymentDate(event.target.value)}
              />
            </div>
            <div>
              <Label>Mode</Label>
              <Select
                value={mode}
                onValueChange={(value: string) => setMode(value as PaymentMode)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {paymentModes.map((paymentMode) => (
                    <SelectItem key={paymentMode} value={paymentMode}>
                      {paymentMode}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Amount</Label>
              <Input
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Reference No</Label>
              <Input
                value={referenceNo}
                onChange={(event) => setReferenceNo(event.target.value)}
                placeholder="Cheque, UTR, or receipt number"
              />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Optional payment note"
                rows={1}
              />
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead className="text-right">Net Payable</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead className="w-44 text-right">Allocate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {outstandingInvoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell>
                    <div className="font-medium">{invoice.invoiceNumber}</div>
                    <div className="text-xs text-gray-500">
                      Due {invoice.dueDate ? invoice.dueDate.slice(0, 10) : "-"}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {formatMoney(invoice.netPayable)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatMoney(invoice.outstanding)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Input
                        inputMode="decimal"
                        className="text-right"
                        value={allocations[invoice.id] || ""}
                        onChange={(event) =>
                          setAllocations((previous) => ({
                            ...previous,
                            [invoice.id]: event.target.value,
                          }))
                        }
                        placeholder="0.00"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => allocateOutstanding(invoice)}
                      >
                        Max
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {outstandingInvoices.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="py-8 text-center text-sm text-gray-500"
                  >
                    No outstanding invoices for this distributor.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              <span className="text-gray-500">Allocated total </span>
              <span className="font-semibold">
                {formatMoney(allocationTotal)}
              </span>
              <span className="mx-2 text-gray-300">/</span>
              <span className="text-gray-500">Payment amount </span>
              <span className="font-semibold">
                {formatMoney(Number(amount || 0))}
              </span>
            </div>
            <Button
              onClick={() => void submitPayment()}
              disabled={
                saving ||
                !selectedDistributor ||
                Number(amount || 0) <= 0 ||
                allocationTotal <= 0 ||
                Math.abs(allocationTotal - Number(amount || 0)) > 0.01
              }
            >
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Record Payment
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AlertLine({
  icon,
  label,
  count,
}: {
  icon: ReactNode;
  label: string;
  count: number;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border p-3">
      <div className="flex items-center gap-2">
        {icon}
        <span>{label}</span>
      </div>
      <Badge variant="outline">{count}</Badge>
    </div>
  );
}
