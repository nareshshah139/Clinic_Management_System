'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  PackageCheck,
  RefreshCw,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { apiClient } from '@/lib/api';

type QueueStatus = 'pending' | 'partial' | 'dispensed' | 'expired';

type QueueMedication = {
  drugName: string;
  prescribedQuantity: number | null;
  dispensedQuantity: number;
  coverageStatus: 'unknown' | 'not_started' | 'partial' | 'covered';
};

type QueueEntry = {
  prescriptionId: string;
  patient: {
    id: string;
    name: string;
    patientCode?: string | null;
  };
  doctor: {
    id: string;
    name: string;
  };
  createdAt: string;
  pendingHours: number;
  isOverTwoHours: boolean;
  medications: QueueMedication[];
  linkedInvoiceIds: string[];
  status: QueueStatus;
};

type QueueResponse = {
  data: QueueEntry[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
};

type StockCheckItem = {
  drugName: string;
  stockStatus: 'UNMATCHED' | 'OUT_OF_STOCK' | 'LOW_STOCK' | 'IN_STOCK';
  totalNonExpiredStock: number;
  lowStock: boolean;
  nearExpiry: boolean;
  alternatives: unknown[];
};

type StockCheckResponse = {
  prescriptionId: string;
  items: StockCheckItem[];
};

const statusOptions: Array<{ value: QueueStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'partial', label: 'Partial' },
  { value: 'dispensed', label: 'Dispensed' },
  { value: 'expired', label: 'Expired' },
];

export function PrescriptionDispensingQueue() {
  const [status, setStatus] = useState<QueueStatus | 'all'>('pending');
  const [page, setPage] = useState(1);
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [pagination, setPagination] = useState<QueueResponse['pagination']>({
    page: 1,
    limit: 20,
    total: 0,
    pages: 0,
  });
  const [stockByPrescription, setStockByPrescription] = useState<
    Record<string, StockCheckItem[]>
  >({});
  const [loading, setLoading] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStockChecks = useCallback(async (entries: QueueEntry[]) => {
    if (entries.length === 0) {
      setStockByPrescription({});
      return;
    }

    const results = await Promise.all(
      entries.map(async (entry) => {
        try {
          const response = await apiClient.get<StockCheckResponse>(
            `/pharmacy/prescription-queue/${entry.prescriptionId}/stock-check`,
          );
          return [entry.prescriptionId, response.items || []] as const;
        } catch (err) {
          console.error('Failed to load prescription stock check:', err);
          return [entry.prescriptionId, []] as const;
        }
      }),
    );

    setStockByPrescription(Object.fromEntries(results));
  }, []);

  const loadQueue = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.get<QueueResponse>(
        '/pharmacy/prescription-queue',
        {
          page,
          limit: 20,
          status: status === 'all' ? undefined : status,
        },
      );
      setQueue(response.data || []);
      setPagination(response.pagination);
      void loadStockChecks(response.data || []);
    } catch (err) {
      console.error('Failed to load prescription dispensing queue:', err);
      setError('Unable to load prescription queue');
      setQueue([]);
      setStockByPrescription({});
    } finally {
      setLoading(false);
    }
  }, [loadStockChecks, page, status]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const handlePull = async (prescriptionId: string) => {
    try {
      setRefreshingId(prescriptionId);
      await apiClient.post(
        `/pharmacy/prescription-queue/${prescriptionId}/pull`,
        {},
      );
      await loadQueue();
    } catch (err) {
      console.error('Failed to recompute prescription queue entry:', err);
      setError('Unable to recompute prescription queue entry');
    } finally {
      setRefreshingId(null);
    }
  };

  const visibleRange = useMemo(() => {
    if (pagination.total === 0) return '0';
    const start = (pagination.page - 1) * pagination.limit + 1;
    const end = Math.min(pagination.total, start + queue.length - 1);
    return `${start}-${end}`;
  }, [pagination, queue.length]);

  return (
    <Card className="rounded-lg">
      <CardHeader className="flex flex-col gap-3 border-b sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-lg">
            Prescription dispensing queue
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {visibleRange} of {pagination.total} prescriptions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={status}
            onValueChange={(value: string) => {
              setStatus(value as QueueStatus | 'all');
              setPage(1);
            }}
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={loadQueue}>
            <RefreshCw className={loading ? 'animate-spin' : ''} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {error ? (
          <div className="border-b px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Patient</TableHead>
              <TableHead>Doctor</TableHead>
              <TableHead>Medication</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  Loading queue...
                </TableCell>
              </TableRow>
            ) : queue.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  No prescriptions in this queue.
                </TableCell>
              </TableRow>
            ) : (
              queue.map((entry) => (
                <TableRow key={entry.prescriptionId}>
                  <TableCell className="whitespace-normal">
                    <div className="font-medium">{entry.patient.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {entry.patient.patientCode || entry.patient.id}
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="size-3" />
                      {formatAge(entry.pendingHours)}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <div>{entry.doctor.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(entry.createdAt)}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-sm whitespace-normal">
                    <div className="flex flex-col gap-1">
                      {entry.medications.map((medication) => (
                        <div
                          key={`${entry.prescriptionId}-${medication.drugName}`}
                          className="text-sm"
                        >
                          <span className="font-medium">
                            {medication.drugName}
                          </span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {formatCoverage(medication)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start gap-2">
                      <StatusBadge status={entry.status} />
                      {entry.isOverTwoHours && entry.status !== 'dispensed' ? (
                        <Badge
                          variant="outline"
                          className="gap-1 text-amber-700"
                        >
                          <AlertTriangle className="size-3" />
                          Over 2h
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <StockWarnings
                      items={stockByPrescription[entry.prescriptionId] || []}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handlePull(entry.prescriptionId)}
                        disabled={refreshingId === entry.prescriptionId}
                      >
                        <RefreshCw
                          className={
                            refreshingId === entry.prescriptionId
                              ? 'animate-spin'
                              : ''
                          }
                        />
                      </Button>
                      <Button asChild size="sm">
                        <a href={buildDispenseUrl(entry)}>
                          <ExternalLink />
                          Open
                        </a>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between border-t px-4 py-3">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {pagination.page} of {Math.max(1, pagination.pages)}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pagination.pages || loading}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: QueueStatus }) {
  const config: Record<
    QueueStatus,
    { label: string; className: string; icon: typeof Clock }
  > = {
    pending: {
      label: 'Pending',
      className: 'bg-slate-100 text-slate-800',
      icon: Clock,
    },
    partial: {
      label: 'Partial',
      className: 'bg-amber-100 text-amber-800',
      icon: PackageCheck,
    },
    dispensed: {
      label: 'Dispensed',
      className: 'bg-emerald-100 text-emerald-800',
      icon: CheckCircle2,
    },
    expired: {
      label: 'Expired',
      className: 'bg-red-100 text-red-800',
      icon: AlertTriangle,
    },
  };
  const Icon = config[status].icon;

  return (
    <Badge variant="outline" className={config[status].className}>
      <Icon className="size-3" />
      {config[status].label}
    </Badge>
  );
}

function StockWarnings({ items }: { items: StockCheckItem[] }) {
  if (items.length === 0) {
    return <span className="text-sm text-muted-foreground">Checking...</span>;
  }

  const warnings = items.filter(
    (item) =>
      item.stockStatus === 'UNMATCHED' ||
      item.stockStatus === 'OUT_OF_STOCK' ||
      item.lowStock ||
      item.nearExpiry,
  );

  if (warnings.length === 0) {
    return (
      <Badge variant="outline" className="bg-emerald-50 text-emerald-700">
        Stock available
      </Badge>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {warnings.slice(0, 3).map((item) => (
        <div key={item.drugName} className="text-xs">
          <Badge variant="outline" className="mr-2 text-amber-700">
            {stockWarningLabel(item)}
          </Badge>
          <span className="text-muted-foreground">
            {item.drugName} ({item.totalNonExpiredStock})
          </span>
          {item.alternatives.length > 0 ? (
            <span className="ml-1 text-emerald-700">
              {item.alternatives.length} alt
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function stockWarningLabel(item: StockCheckItem) {
  if (item.stockStatus === 'UNMATCHED') return 'No match';
  if (item.stockStatus === 'OUT_OF_STOCK') return 'Out';
  if (item.lowStock) return 'Low';
  if (item.nearExpiry) return 'Expiry';
  return 'OK';
}

function formatCoverage(medication: QueueMedication) {
  if (medication.prescribedQuantity === null) {
    return `${medication.dispensedQuantity} dispensed`;
  }

  return `${medication.dispensedQuantity}/${medication.prescribedQuantity}`;
}

function formatAge(hours: number) {
  if (hours < 1) return `${Math.round(hours * 60)}m pending`;
  return `${hours.toFixed(1)}h pending`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildDispenseUrl(entry: QueueEntry) {
  const params = new URLSearchParams({
    patientId: entry.patient.id,
    prescriptionId: entry.prescriptionId,
    doctorId: entry.doctor.id,
  });

  return `/dashboard/pharmacy?${params.toString()}`;
}
