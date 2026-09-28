'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { PrescriptionInventoryLink, type InventorySuggestion } from './PrescriptionInventoryLink';
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
  visitId?: string | null;
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
  prescriptionVersion?: string;
  expiredStock?: number;
  inventoryItemId?: string | null;
  matchedDrug?: { id: string } | null;
  unit?: string;
  totalOnHandStock?: number;
  heldStock?: number;
  suggestions?: InventorySuggestion[];
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

type PharmacyBillingPrefill = {
  patientId?: string;
  prescriptionId?: string;
  doctorId?: string;
  visitId?: string;
};

type PrescriptionDispensingQueueProps = {
  onOpenBilling?: (prefill: PharmacyBillingPrefill) => void;
  openActionLabel?: string;
};

const statusOptions: Array<{ value: QueueStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'partial', label: 'Partial' },
  { value: 'dispensed', label: 'Dispensed' },
  { value: 'expired', label: 'Expired' },
];

/**
 * @cc [owner:nareshshah139,label:product] pending-refresh-after-invoice
 * After a pharmacy invoice refresh event, the queue MUST reload its current filter from
 * the server so prescriptions linked to saved invoices leave Pending without a page reload.
 */
export function PrescriptionDispensingQueue({
  onOpenBilling,
  openActionLabel = 'Open',
}: PrescriptionDispensingQueueProps = {}) {
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
  const stockRequest = useRef(0);
  const [stockErrors, setStockErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStockChecks = useCallback(async (entries: QueueEntry[]) => {
    const request = ++stockRequest.current;
    setStockErrors({});
    setStockByPrescription({});
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
          return [entry.prescriptionId, null] as const;
        }
      }),
    );

    if (request !== stockRequest.current) return;
    setStockByPrescription(Object.fromEntries(results.filter(([, items]) => items !== null).map(([id, items]) => [id, items || []])));
    setStockErrors(Object.fromEntries(results.filter(([, items]) => items === null).map(([id]) => [id, 'Stock check failed. Refresh to retry.'])));
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
      await loadStockChecks(response.data || []);
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

  useEffect(() => {
    const refresh = () => { void loadQueue(); };
    window.addEventListener('pharmacy-invoices-refresh', refresh);
    window.addEventListener('inventory-stock-refresh', refresh);
    return () => {
      window.removeEventListener('pharmacy-invoices-refresh', refresh);
      window.removeEventListener('inventory-stock-refresh', refresh);
    };
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
          <Button variant="outline" size="icon" onClick={loadQueue} aria-label="Refresh prescription queue">
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
                    {stockErrors[entry.prescriptionId] ? <p role="alert" className="text-sm text-destructive">{stockErrors[entry.prescriptionId]}</p> : <StockWarnings
                      items={stockByPrescription[entry.prescriptionId] || []}
                      prescriptionId={entry.prescriptionId} onLinked={loadQueue}
                    />}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label={`Refresh stock for ${entry.patient.name}`}
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
                      {onOpenBilling ? (
                        <Button
                          size="sm"
                          onClick={() => onOpenBilling(buildBillingPrefill(entry))}
                        >
                          <ExternalLink />
                          {openActionLabel}
                        </Button>
                      ) : (
                        <Button asChild size="sm">
                          <a href={buildDispenseUrl(entry)}>
                            <ExternalLink />
                            {openActionLabel}
                          </a>
                        </Button>
                      )}
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

/**
 * @cc [owner:nareshshah139,label:product] stock-column-all-prescribed-items
 * Every checked prescription line MUST show its stock status and available quantity with unit.
 * Unlinked quantities MUST be unknown, not zero; no healthy lines may be hidden or truncated.
 */
function StockWarnings({ items, prescriptionId, onLinked }: { items: StockCheckItem[]; prescriptionId: string; onLinked: () => Promise<void> }) {
  if (!items.length) return <span className="text-sm text-muted-foreground">Checking…</span>;
  return <div className="flex flex-col gap-2">{items.map((item, index) => <div key={`${index}-${item.drugName}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
    <Badge variant="outline" className={item.stockStatus === 'IN_STOCK' ? 'text-emerald-700' : 'text-amber-700'}>
      {{ UNMATCHED: 'Not linked', OUT_OF_STOCK: 'Out', LOW_STOCK: 'Low', IN_STOCK: 'In stock' }[item.stockStatus]}
    </Badge>
    <span>{item.drugName} ({item.stockStatus === 'UNMATCHED' ? '—' : `${item.totalNonExpiredStock}${item.unit ? ` ${item.unit.toLowerCase()}` : ''}`})</span>
    {!!(item.heldStock || item.expiredStock) && <span className="ml-1 text-muted-foreground">{item.totalOnHandStock} on hand · {item.heldStock || 0} held · {item.expiredStock || 0} expired</span>}
    {item.nearExpiry && <span className="ml-1 text-amber-700">Near expiry</span>}
    <PrescriptionInventoryLink prescriptionId={prescriptionId} lineIndex={index} linked={!!item.inventoryItemId} prescriptionVersion={item.prescriptionVersion} name={item.drugName} suggestions={item.suggestions} onLinked={onLinked} />
  </div>)}</div>;
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
    section: 'billing',
    patientId: entry.patient.id,
    prescriptionId: entry.prescriptionId,
    doctorId: entry.doctor.id,
  });
  if (entry.visitId) params.set('visitId', entry.visitId);

  return `/dashboard/pharmacy?${params.toString()}`;
}

function buildBillingPrefill(entry: QueueEntry): PharmacyBillingPrefill {
  return {
    patientId: entry.patient.id,
    prescriptionId: entry.prescriptionId,
    doctorId: entry.doctor.id,
    visitId: entry.visitId || undefined,
  };
}
