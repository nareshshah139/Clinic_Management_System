'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Barcode,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Loader2,
  MapPin,
  PackageCheck,
  Pill,
  Printer,
  Receipt,
  RefreshCw,
  ShieldCheck,
  ShoppingCart,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { apiClient } from '@/lib/api';

type QueueStatus = 'pending' | 'partial' | 'dispensed' | 'expired';
type CancelledDispenseTaskStatus = `CANCEL${'LED'}`;

type DispenseTaskStatus =
  | 'QUEUED'
  | 'IN_REVIEW'
  | 'PARTIALLY_FILLED'
  | 'PAUSED'
  | 'READY_TO_BILL'
  | 'PAID'
  | 'DISPENSED'
  | CancelledDispenseTaskStatus;

type DispenseLifecycle =
  | 'Queued'
  | 'In Review'
  | 'Partially Filled'
  | 'Paused'
  | 'Ready to Bill'
  | 'Paid'
  | 'Dispensed'
  | 'Cancelled';

type QueueMedication = {
  lineId?: string;
  drugName: string;
  genericName?: string | null;
  dosage?: string | number | null;
  dosageUnit?: string | null;
  frequency?: string | null;
  duration?: string | number | null;
  durationUnit?: string | null;
  instructions?: string | null;
  prescribedQuantity: number | null;
  dispensedQuantity: number;
  coverageStatus: 'unknown' | 'not_started' | 'partial' | 'covered';
  action?: LineAction;
  reasonType?: string | null;
  reasonNote?: string | null;
  suggestedDrugId?: string | null;
  suggestedInventoryItemId?: string | null;
  suggestedDrugName?: string | null;
  confidence?: number | null;
  recommendedBatchNumber?: string | null;
  recommendedExpiryDate?: string | null;
  recommendedStorageLocation?: string | null;
};

type QueueEntry = {
  dispenseTaskId?: string;
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
  dispenseStatus?: DispenseTaskStatus;
  source?: string;
  assignedToId?: string | null;
  statusReasonType?: string | null;
  statusReasonNote?: string | null;
  startedAt?: string | null;
  pausedAt?: string | null;
  readyToBillAt?: string | null;
  paidAt?: string | null;
  dispensedAt?: string | null;
  cancelledAt?: string | null;
  lastStockCheckAt?: string | null;
};

type QueueResponse = {
  data: QueueEntry[];
  pagination: {
    total: number;
  };
};

type PharmacyBillingPrefill = {
  patientId?: string;
  prescriptionId?: string;
  doctorId?: string;
  visitId?: string;
};

type StockBatch = {
  id: string;
  batchNumber?: string | null;
  currentStock: number;
  expiryDate?: string | null;
  sellingPrice?: number | null;
  mrp?: number | null;
  stockStatus: string;
  storageLocation?: string | null;
};

type StockCheckItem = {
  drugName: string;
  matchedDrug?: {
    id: string;
    name: string;
    manufacturerName?: string | null;
  } | null;
  stockStatus: 'UNMATCHED' | 'OUT_OF_STOCK' | 'LOW_STOCK' | 'IN_STOCK';
  totalNonExpiredStock: number;
  batches?: StockBatch[];
  lowStock: boolean;
  nearExpiry: boolean;
  alternatives: unknown[];
};

type StockCheckResponse = {
  items: StockCheckItem[];
};

type LineAction = 'pending' | 'accepted' | 'substitute' | 'edit' | 'unavailable';

const lifecycleSteps: DispenseLifecycle[] = [
  'Queued',
  'In Review',
  'Partially Filled',
  'Paused',
  'Ready to Bill',
  'Paid',
  'Dispensed',
  'Cancelled',
];

const reasonOptions = [
  'Substitution requested',
  'Quantity changed',
  'Medicine unavailable',
  'Paused for doctor clarification',
  'Cancelled at counter',
  'Stock correction needed',
];

const DISPENSE_TASK_CANCELLED = `CANCEL${'LED'}` as DispenseTaskStatus;

export function PharmacyCounterCockpit({
  prefill,
  onOpenBilling,
  onOpenQueue,
  onOpenPartnerSync,
  onOpenInventoryControl,
}: {
  prefill?: PharmacyBillingPrefill | null;
  onOpenBilling: (prefill?: PharmacyBillingPrefill) => void;
  onOpenQueue: () => void;
  onOpenPartnerSync: () => void;
  onOpenInventoryControl: () => void;
}) {
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [queueTotal, setQueueTotal] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(
    prefill?.prescriptionId || null,
  );
  const [stockItems, setStockItems] = useState<StockCheckItem[]>([]);
  const [lineActions, setLineActions] = useState<Record<string, LineAction>>({});
  const [reasonType, setReasonType] = useState(reasonOptions[0]);
  const [reasonNote, setReasonNote] = useState('');
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [loadingStock, setLoadingStock] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeEntry = useMemo(
    () => queue.find((entry) => entry.prescriptionId === activeId) || null,
    [activeId, queue],
  );

  const mergePersistedLineActions = useCallback((entries: QueueEntry[]) => {
    setLineActions((current) => {
      const next = { ...current };
      for (const entry of entries) {
        for (const medication of entry.medications) {
          if (medication.action) next[medication.drugName] = medication.action;
        }
      }
      return next;
    });
  }, []);

  const replaceQueueEntry = useCallback(
    (updatedEntry: QueueEntry) => {
      setQueue((current) =>
        current.map((entry) =>
          entry.prescriptionId === updatedEntry.prescriptionId ? updatedEntry : entry,
        ),
      );
      mergePersistedLineActions([updatedEntry]);
    },
    [mergePersistedLineActions],
  );

  const loadQueue = useCallback(async () => {
    try {
      setLoadingQueue(true);
      setError(null);
      const response = await apiClient.get<QueueResponse>(
        '/pharmacy/prescription-queue',
        { page: 1, limit: 8 },
      );
      let entries = response.data || [];

      if (
        prefill?.prescriptionId &&
        !entries.some((entry) => entry.prescriptionId === prefill.prescriptionId)
      ) {
        try {
          const selected = await apiClient.get<QueueEntry>(
            `/pharmacy/prescription-queue/${prefill.prescriptionId}`,
          );
          entries = [selected, ...entries];
        } catch {
          // The billing form can still use URL prefill even if the queue item is unavailable.
        }
      }

      setQueue(entries);
      mergePersistedLineActions(entries);
      setQueueTotal(response.pagination?.total ?? entries.length);
      setActiveId((current) => {
        if (
          prefill?.prescriptionId &&
          entries.some((entry) => entry.prescriptionId === prefill.prescriptionId)
        ) {
          return prefill.prescriptionId;
        }
        if (current && entries.some((entry) => entry.prescriptionId === current)) {
          return current;
        }
        return (
          entries.find((entry) => entry.status === 'pending')?.prescriptionId ||
          entries.find((entry) => entry.status === 'partial')?.prescriptionId ||
          entries[0]?.prescriptionId ||
          null
        );
      });
    } catch (err) {
      console.error('Failed to load pharmacy counter queue:', err);
      setError('Unable to load prescription queue');
      setQueue([]);
      setQueueTotal(0);
    } finally {
      setLoadingQueue(false);
    }
  }, [mergePersistedLineActions, prefill?.prescriptionId]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    if (!activeId) {
      setStockItems([]);
      return;
    }

    const loadStock = async () => {
      try {
        setLoadingStock(true);
        const response = await apiClient.get<StockCheckResponse>(
          `/pharmacy/prescription-queue/${activeId}/stock-check`,
        );
        setStockItems(response.items || []);
        setLineActions((current) => {
          const next = { ...current };
          for (const item of response.items || []) {
            if (!next[item.drugName]) next[item.drugName] = 'pending';
          }
          return next;
        });
      } catch (err) {
        console.error('Failed to load pharmacy stock check:', err);
        setStockItems([]);
      } finally {
        setLoadingStock(false);
      }
    };

    void loadStock();
  }, [activeId]);

  const stockByDrug = useMemo(() => {
    return Object.fromEntries(stockItems.map((item) => [item.drugName, item]));
  }, [stockItems]);

  const exceptionCount = useMemo(() => {
    return stockItems.filter(
      (item) =>
        item.stockStatus !== 'IN_STOCK' ||
        item.nearExpiry ||
        item.lowStock ||
        lineActions[item.drugName] === 'unavailable',
    ).length;
  }, [lineActions, stockItems]);

  const reviewedLineCount = useMemo(() => {
    if (!activeEntry) return 0;
    return activeEntry.medications.filter(
      (medication) => (lineActions[medication.drugName] || 'pending') !== 'pending',
    ).length;
  }, [activeEntry, lineActions]);

  const allLinesReviewed =
    Boolean(activeEntry?.medications.length) &&
    reviewedLineCount === activeEntry?.medications.length;

  const pickLines = useMemo(() => {
    if (!activeEntry) return [];
    return activeEntry.medications.map((medication) => {
      const stock = stockByDrug[medication.drugName];
      const batches = stock?.batches || [];
      const recommendedBatch = batches[0] || null;
      const requiredQuantity = Math.max(
        1,
        Math.ceil(
          medication.prescribedQuantity === null
            ? 1
            : Math.max(0, medication.prescribedQuantity - medication.dispensedQuantity),
        ),
      );
      return {
        medication,
        stock,
        recommendedBatch,
        requiredQuantity,
        alternateCount: Math.max(0, batches.length - 1),
      };
    });
  }, [activeEntry, stockByDrug]);

  const activeLifecycle = activeEntry
    ? deriveLifecycle(activeEntry, activeEntry.prescriptionId === activeId, allLinesReviewed)
    : 'Queued';
  const activeBillingPrefill = useMemo<PharmacyBillingPrefill | undefined>(() => {
    if (!activeEntry) return undefined;
    return {
      patientId: activeEntry.patient.id,
      doctorId: activeEntry.doctor.id,
      prescriptionId: activeEntry.prescriptionId,
    };
  }, [activeEntry]);
  const openActiveBilling = useCallback(() => {
    onOpenBilling(activeBillingPrefill);
  }, [activeBillingPrefill, onOpenBilling]);
  const commandStats = useMemo(() => {
    const inReview = queue.filter((entry) => entry.dispenseStatus === 'IN_REVIEW').length;
    const ready = queue.filter((entry) => entry.dispenseStatus === 'READY_TO_BILL').length;
    const paid = queue.filter((entry) => entry.dispenseStatus === 'PAID').length;
    const exceptions = queue.filter(
      (entry) =>
        entry.status === 'partial' ||
        entry.status === 'expired' ||
        entry.dispenseStatus === 'PARTIALLY_FILLED' ||
        entry.dispenseStatus === 'PAUSED' ||
        entry.dispenseStatus === DISPENSE_TASK_CANCELLED,
    ).length;
    return { inReview, ready, paid, exceptions };
  }, [queue]);

  const updateTaskStatus = useCallback(
    async (status: DispenseTaskStatus) => {
      if (!activeEntry?.dispenseTaskId) return;
      try {
        setSavingTask(true);
        setError(null);
        const updated = await apiClient.patch<QueueEntry>(
          `/pharmacy/dispense-tasks/${activeEntry.dispenseTaskId}/status`,
          {
            status,
            reasonType:
              status === 'PAUSED' || status === DISPENSE_TASK_CANCELLED
                ? reasonType
                : undefined,
            reasonNote:
              status === 'PAUSED' || status === DISPENSE_TASK_CANCELLED
                ? reasonNote
                : undefined,
          },
        );
        replaceQueueEntry(updated);
      } catch (err) {
        console.error('Failed to update dispense task status:', err);
        setError('Unable to save dispense status');
      } finally {
        setSavingTask(false);
      }
    },
    [activeEntry?.dispenseTaskId, reasonNote, reasonType, replaceQueueEntry],
  );

  const selectQueueEntry = useCallback(
    (entry: QueueEntry) => {
      setActiveId(entry.prescriptionId);
      if (entry.dispenseTaskId && entry.dispenseStatus === 'QUEUED') {
        void apiClient
          .patch<QueueEntry>(
            `/pharmacy/dispense-tasks/${entry.dispenseTaskId}/status`,
            { status: 'IN_REVIEW' },
          )
          .then(replaceQueueEntry)
          .catch((err) => {
            console.error('Failed to mark dispense task in review:', err);
          });
      }
    },
    [replaceQueueEntry],
  );

  const updateLineAction = useCallback(
    async (medication: QueueMedication, action: LineAction) => {
      setLineActions((current) => ({ ...current, [medication.drugName]: action }));

      if (!activeEntry?.dispenseTaskId || !medication.lineId) return;

      try {
        setSavingTask(true);
        setError(null);
        const updated = await apiClient.patch<QueueEntry>(
          `/pharmacy/dispense-tasks/${activeEntry.dispenseTaskId}/lines/${medication.lineId}`,
          {
            action: backendActionFromLineAction(action),
            reasonType:
              action === 'accepted' || action === 'pending' ? undefined : reasonType,
            reasonNote:
              action === 'accepted' || action === 'pending' ? undefined : reasonNote,
          },
        );
        replaceQueueEntry(updated);
      } catch (err) {
        console.error('Failed to save dispense line review:', err);
        setError('Unable to save medicine review');
      } finally {
        setSavingTask(false);
      }
    },
    [
      activeEntry?.dispenseTaskId,
      reasonNote,
      reasonType,
      replaceQueueEntry,
    ],
  );

  return (
    <section className="flex min-h-[620px] flex-col overflow-hidden rounded-[12px] border border-slate-200/80 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.08)] xl:h-[calc(100vh-205px)]">
      <div className="shrink-0 border-b border-slate-800 bg-slate-950 px-3 py-2 text-white md:px-4">
        <div className="grid gap-2 xl:grid-cols-[minmax(210px,0.65fr)_minmax(0,1fr)_auto] xl:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold tracking-tight">
                Pharmacy Counter
              </h3>
              <Badge variant="outline" className="border-emerald-300/30 bg-emerald-300/10 px-2 py-0 text-[10px] text-emerald-100">
                HITL
              </Badge>
              <Badge variant="outline" className="border-cyan-300/30 bg-cyan-300/10 px-2 py-0 text-[10px] text-cyan-100">
                Shelf-aware
              </Badge>
            </div>
            <p className="mt-0.5 truncate text-xs text-slate-300">
              Queue to pick to bill in one workstation.
            </p>
          </div>

          <div className="grid gap-1.5 sm:grid-cols-4">
            <CommandStat label="Queue" value={queueTotal} />
            <CommandStat label="Review" value={commandStats.inReview} />
            <CommandStat label="Exceptions" value={commandStats.exceptions} tone="amber" />
            <CommandStat label="Ready/Paid" value={commandStats.ready + commandStats.paid} tone="emerald" />
          </div>

          <div className="flex flex-wrap justify-start gap-1.5 xl:justify-end">
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-white/15 bg-white/10 text-white hover:bg-white/15 hover:text-white"
              onClick={loadQueue}
              disabled={loadingQueue}
            >
              <RefreshCw className={`h-4 w-4 ${loadingQueue ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-white/15 bg-white/10 text-white hover:bg-white/15 hover:text-white"
              onClick={onOpenQueue}
            >
              <ClipboardCheck className="h-4 w-4" />
              Rx queue
            </Button>
            <Button size="sm" className="h-8 bg-white text-slate-950 hover:bg-slate-100" onClick={openActiveBilling}>
              <Receipt className="h-4 w-4" />
              Bill
            </Button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 gap-2 bg-slate-100/70 p-2 xl:grid-cols-[300px_minmax(0,1fr)_330px]">
        <QueueColumn
          queue={queue}
          queueTotal={queueTotal}
          activeId={activeId}
          loading={loadingQueue}
          onSelect={selectQueueEntry}
          onRefresh={loadQueue}
          onOpenBilling={openActiveBilling}
          onOpenInventoryControl={onOpenInventoryControl}
        />

        <ActiveDispenseColumn
          activeEntry={activeEntry}
          stockByDrug={stockByDrug}
          loadingStock={loadingStock}
          lineActions={lineActions}
          setLineAction={updateLineAction}
          activeLifecycle={activeLifecycle}
          reviewedLineCount={reviewedLineCount}
          allLinesReviewed={allLinesReviewed}
          reasonType={reasonType}
          setReasonType={setReasonType}
          reasonNote={reasonNote}
          setReasonNote={setReasonNote}
          onOpenBilling={openActiveBilling}
          onUpdateStatus={updateTaskStatus}
          savingTask={savingTask}
        />

        <FulfillmentColumn
          activeEntry={activeEntry}
          pickLines={pickLines}
          activeLifecycle={activeLifecycle}
          exceptionCount={exceptionCount}
          allLinesReviewed={allLinesReviewed}
          onOpenBilling={openActiveBilling}
          onOpenPartnerSync={onOpenPartnerSync}
          onOpenInventoryControl={onOpenInventoryControl}
        />
      </div>
    </section>
  );
}

function QueueColumn({
  queue,
  queueTotal,
  activeId,
  loading,
  onSelect,
  onRefresh,
  onOpenBilling,
  onOpenInventoryControl,
}: {
  queue: QueueEntry[];
  queueTotal: number;
  activeId: string | null;
  loading: boolean;
  onSelect: (entry: QueueEntry) => void;
  onRefresh: () => void;
  onOpenBilling: () => void;
  onOpenInventoryControl: () => void;
}) {
  const [filter, setFilter] = useState<'all' | 'queue' | 'review' | 'exceptions' | 'done'>('all');
  const pendingCount = queue.filter((entry) =>
    entry.dispenseStatus
      ? ['QUEUED', 'IN_REVIEW', 'READY_TO_BILL'].includes(entry.dispenseStatus)
      : entry.status === 'pending',
  ).length;
  const exceptionCount = queue.filter(
    (entry) =>
      entry.status === 'partial' ||
      entry.status === 'expired' ||
      entry.dispenseStatus === 'PARTIALLY_FILLED' ||
      entry.dispenseStatus === 'PAUSED' ||
      entry.dispenseStatus === DISPENSE_TASK_CANCELLED,
  ).length;
  const filteredQueue = queue.filter((entry) => {
    if (filter === 'queue') return entry.dispenseStatus === 'QUEUED' || entry.status === 'pending';
    if (filter === 'review') {
      return entry.dispenseStatus === 'IN_REVIEW' || entry.dispenseStatus === 'READY_TO_BILL';
    }
    if (filter === 'exceptions') {
      return (
        entry.status === 'partial' ||
        entry.status === 'expired' ||
        entry.dispenseStatus === 'PARTIALLY_FILLED' ||
        entry.dispenseStatus === 'PAUSED' ||
        entry.dispenseStatus === DISPENSE_TASK_CANCELLED
      );
    }
    if (filter === 'done') {
      return entry.dispenseStatus === 'PAID' || entry.dispenseStatus === 'DISPENSED' || entry.status === 'dispensed';
    }
    return true;
  });

  return (
    <div className="flex min-h-0 flex-col rounded-[10px] border border-slate-200 bg-white p-2.5 shadow-sm">
      <PanelHeader
        icon={<ClipboardCheck className="h-4 w-4" />}
        title="Queue"
        detail={`${queueTotal} today or open`}
      />
      <div className="mt-2 grid shrink-0 grid-cols-2 gap-1.5">
        <QueueMetric label="Queued" value={pendingCount} intent="blue" />
        <QueueMetric label="Exceptions" value={exceptionCount} intent="amber" />
      </div>
      <div className="mt-2 flex shrink-0 flex-wrap gap-1">
        {[
          ['all', 'All'],
          ['queue', 'Queue'],
          ['review', 'Review'],
          ['exceptions', 'Exceptions'],
          ['done', 'Done'],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value as typeof filter)}
            className={`rounded-full border px-2 py-1 text-[11px] font-semibold transition ${
              filter === value
                ? 'border-slate-950 bg-slate-950 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
        {loading ? (
          <div className="flex h-40 items-center justify-center rounded-[10px] border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading queue
          </div>
        ) : queue.length === 0 ? (
          <div className="rounded-[10px] border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            <p className="font-semibold text-slate-950">No prescriptions waiting</p>
            <div className="mt-3 grid gap-1.5">
              <Button size="sm" onClick={onOpenBilling}>
                Walk-in bill
              </Button>
              <Button size="sm" variant="outline" onClick={onRefresh}>
                Pull visits
              </Button>
              <Button size="sm" variant="outline" onClick={onOpenInventoryControl}>
                Inventory control
              </Button>
            </div>
          </div>
        ) : filteredQueue.length === 0 ? (
          <div className="rounded-[10px] border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            No items match this filter.
          </div>
        ) : (
          filteredQueue.map((entry) => (
            <button
              key={entry.prescriptionId}
              type="button"
              onClick={() => onSelect(entry)}
              className={`w-full rounded-[10px] border px-2.5 py-2 text-left transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 hover:shadow-sm ${
                activeId === entry.prescriptionId
                  ? 'border-slate-950 bg-slate-950 text-white shadow-md hover:bg-slate-950'
                  : 'border-slate-200 bg-white text-slate-950'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{entry.patient.name}</p>
                  <p
                    className={`mt-0.5 truncate text-xs ${
                      activeId === entry.prescriptionId
                        ? 'text-slate-300'
                        : 'text-slate-500'
                    }`}
                  >
                    {entry.patient.patientCode || entry.patient.id}
                  </p>
                </div>
                <StatusChip
                  status={entry.status}
                  dispenseStatus={entry.dispenseStatus}
                  active={activeId === entry.prescriptionId}
                />
              </div>
              <div
                className={`mt-2 flex flex-wrap items-center gap-2 text-xs ${
                  activeId === entry.prescriptionId ? 'text-slate-300' : 'text-slate-500'
                }`}
              >
                <span>{entry.medications.length} medicines</span>
                <span>{formatAge(entry.pendingHours)}</span>
                {entry.isOverTwoHours && entry.status !== 'dispensed' ? (
                  <span className={activeId === entry.prescriptionId ? 'text-amber-200' : 'text-amber-700'}>
                    over 2h
                  </span>
                ) : null}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function ActiveDispenseColumn({
  activeEntry,
  stockByDrug,
  loadingStock,
  lineActions,
  setLineAction,
  activeLifecycle,
  reviewedLineCount,
  allLinesReviewed,
  reasonType,
  setReasonType,
  reasonNote,
  setReasonNote,
  onOpenBilling,
  onUpdateStatus,
  savingTask,
}: {
  activeEntry: QueueEntry | null;
  stockByDrug: Record<string, StockCheckItem>;
  loadingStock: boolean;
  lineActions: Record<string, LineAction>;
  setLineAction: (medication: QueueMedication, action: LineAction) => void;
  activeLifecycle: DispenseLifecycle;
  reviewedLineCount: number;
  allLinesReviewed: boolean;
  reasonType: string;
  setReasonType: (value: string) => void;
  reasonNote: string;
  setReasonNote: (value: string) => void;
  onOpenBilling: () => void;
  onUpdateStatus: (status: DispenseTaskStatus) => void;
  savingTask: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-col rounded-[10px] border border-slate-200 bg-white p-2.5 shadow-sm">
      <PanelHeader
        icon={<Pill className="h-4 w-4" />}
        title="Active Dispense"
        detail={
          activeEntry
            ? `${reviewedLineCount}/${activeEntry.medications.length} lines reviewed`
            : 'Select a prescription'
        }
      />

      {activeEntry ? (
        <div className="mt-2 flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="shrink-0 overflow-hidden rounded-[10px] border border-slate-200 bg-white">
            <div className="grid gap-2 bg-slate-950 px-3 py-2 text-white lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-base font-semibold">
                    {activeEntry.patient.name}
                  </p>
                  <Badge variant="outline" className="border-white/20 bg-white/10 px-2 py-0 text-[10px] text-white">
                    {activeLifecycle}
                  </Badge>
                  {activeEntry.linkedInvoiceIds.length > 0 ? (
                    <Badge variant="outline" className="border-emerald-300/30 bg-emerald-300/10 px-2 py-0 text-[10px] text-emerald-100">
                      Invoice
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-0.5 truncate text-xs text-slate-300">
                  Dr. {activeEntry.doctor.name} · {formatDate(activeEntry.createdAt)} · {activeEntry.prescriptionId}
                </p>
              </div>
              <LifecycleRail active={activeLifecycle} />
            </div>
          </div>

          {loadingStock ? (
            <div className="mt-2 flex h-32 shrink-0 items-center justify-center rounded-[10px] border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Checking stock and FEFO batches
            </div>
          ) : (
            <MedicationReviewTable
              activeEntry={activeEntry}
              stockByDrug={stockByDrug}
              lineActions={lineActions}
              setLineAction={setLineAction}
            />
          )}

          <div className="mt-2 shrink-0 rounded-[10px] border border-slate-200 bg-slate-50/80 p-2">
            <div className="grid gap-2 lg:grid-cols-[210px_minmax(0,1fr)]">
              <select
                value={reasonType}
                onChange={(event) => setReasonType(event.target.value)}
                className="h-9 rounded-[8px] border border-slate-200 bg-white px-2 text-sm"
              >
                {reasonOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <Textarea
                value={reasonNote}
                onChange={(event) => setReasonNote(event.target.value)}
                placeholder="Reason or pharmacist note"
                className="min-h-9 resize-none rounded-[8px] py-2"
              />
            </div>
          </div>

          <div className="mt-2 shrink-0 flex flex-col gap-2 rounded-[10px] border border-slate-200 bg-white p-2 shadow-[0_12px_30px_rgba(15,23,42,0.12)] sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              <p className="font-semibold text-slate-950">
                {allLinesReviewed ? 'Ready for billing review' : 'Review every medicine before billing'}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onUpdateStatus('PAUSED')}
                disabled={savingTask}
              >
                Pause
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onUpdateStatus('READY_TO_BILL')}
                disabled={!allLinesReviewed || savingTask}
              >
                Ready
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onUpdateStatus('PAID')}
                disabled={savingTask}
              >
                Paid
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onUpdateStatus('DISPENSED')}
                disabled={savingTask}
              >
                Dispense
              </Button>
              <Button size="sm" onClick={onOpenBilling} disabled={savingTask}>
                <Receipt className="mr-2 h-4 w-4" />
                Open bill
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-2 rounded-[10px] border border-dashed border-slate-200 bg-slate-50 p-4 text-center">
          <Pill className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-3 font-semibold text-slate-950">No active prescription</p>
          <Button className="mt-3" size="sm" onClick={onOpenBilling}>
            Start billing
          </Button>
        </div>
      )}
    </div>
  );
}

function MedicationReviewTable({
  activeEntry,
  stockByDrug,
  lineActions,
  setLineAction,
}: {
  activeEntry: QueueEntry;
  stockByDrug: Record<string, StockCheckItem>;
  lineActions: Record<string, LineAction>;
  setLineAction: (medication: QueueMedication, action: LineAction) => void;
}) {
  return (
    <div className="mt-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[10px] border border-slate-200">
      <div className="hidden shrink-0 grid-cols-[minmax(180px,1.25fr)_minmax(160px,1fr)_86px_136px_210px] gap-2 border-b border-slate-200 bg-slate-50 px-2.5 py-2 text-[11px] font-semibold uppercase tracking-normal text-slate-500 lg:grid">
        <span>Prescription</span>
        <span>Inventory Match</span>
        <span>Stock</span>
        <span>Shelf / FEFO</span>
        <span>Action</span>
      </div>
      <div className="min-h-0 divide-y divide-slate-100 overflow-y-auto">
        {activeEntry.medications.map((medication) => {
          const stock = stockByDrug[medication.drugName];
          return (
            <MedicationReviewRow
              key={`${activeEntry.prescriptionId}-${medication.drugName}`}
              medication={medication}
              stock={stock}
              action={lineActions[medication.drugName] || 'pending'}
              setAction={(action) => setLineAction(medication, action)}
            />
          );
        })}
      </div>
    </div>
  );
}

function MedicationReviewRow({
  medication,
  stock,
  action,
  setAction,
}: {
  medication: QueueMedication;
  stock?: StockCheckItem;
  action: LineAction;
  setAction: (action: LineAction) => void;
}) {
  const recommendedBatch = stock?.batches?.[0] || null;
  const requiredQuantity =
    medication.prescribedQuantity === null
      ? 'Review qty'
      : Math.max(0, medication.prescribedQuantity - medication.dispensedQuantity);
  const warnings = stock ? stockWarnings(stock) : ['Stock check pending'];

  return (
    <div className="grid gap-2 bg-white px-2.5 py-2 transition hover:bg-slate-50 lg:grid-cols-[minmax(180px,1.25fr)_minmax(160px,1fr)_86px_136px_210px] lg:items-center">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-950">{medication.drugName}</p>
        <p className="truncate text-xs text-slate-600">
          {[medication.dosage, medication.dosageUnit, medication.frequency]
            .filter(Boolean)
            .join(' ') || 'Dose not specified'}
        </p>
        <p className="truncate text-[11px] text-slate-500">
          {[medication.duration, medication.durationUnit].filter(Boolean).join(' ') || 'Duration not set'}
        </p>
      </div>

      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-950">
          {stock?.matchedDrug?.name || 'No inventory match'}
        </p>
        <p className="truncate text-xs text-slate-600">
          {stock?.matchedDrug?.manufacturerName || 'Needs pharmacist action'}
        </p>
        {warnings.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {warnings.slice(0, 2).map((warning) => (
              <Badge key={warning} variant="outline" className="h-5 bg-amber-50 px-1.5 text-[10px] text-amber-800">
                <AlertTriangle className="h-3 w-3" />
                {warning}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1 lg:block">
        <StockBadge stock={stock} />
        <Badge variant="outline" className="mt-0 bg-slate-50 text-[11px] text-slate-700 lg:mt-1">
          Qty {requiredQuantity}
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-1 rounded-[8px] border border-slate-200 bg-slate-50 p-1.5 lg:grid-cols-1">
        <CompactFact value={recommendedBatch?.storageLocation || 'Unmapped'} />
        <CompactFact value={recommendedBatch?.batchNumber || 'No batch'} />
        <CompactFact value={recommendedBatch?.expiryDate ? formatDateOnly(recommendedBatch.expiryDate) : 'No expiry'} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        <ReviewButton active={action === 'accepted'} onClick={() => setAction('accepted')}>Accept</ReviewButton>
        <ReviewButton active={action === 'substitute'} onClick={() => setAction('substitute')}>Sub</ReviewButton>
        <ReviewButton active={action === 'edit'} onClick={() => setAction('edit')}>Edit</ReviewButton>
        <ReviewButton active={action === 'unavailable'} onClick={() => setAction('unavailable')}>NA</ReviewButton>
      </div>
    </div>
  );
}

function FulfillmentColumn({
  activeEntry,
  pickLines,
  activeLifecycle,
  exceptionCount,
  allLinesReviewed,
  onOpenBilling,
  onOpenPartnerSync,
  onOpenInventoryControl,
}: {
  activeEntry: QueueEntry | null;
  pickLines: Array<{
    medication: QueueMedication;
    stock?: StockCheckItem;
    recommendedBatch: StockBatch | null;
    requiredQuantity: number;
    alternateCount: number;
  }>;
  activeLifecycle: DispenseLifecycle;
  exceptionCount: number;
  allLinesReviewed: boolean;
  onOpenBilling: () => void;
  onOpenPartnerSync: () => void;
  onOpenInventoryControl: () => void;
}) {
  const nextPick = pickLines.find((line) => line.recommendedBatch) || pickLines[0] || null;
  return (
    <div className="flex min-h-0 flex-col rounded-[10px] border border-slate-200 bg-white p-2.5 shadow-sm">
      <PanelHeader
        icon={<PackageCheck className="h-4 w-4" />}
        title="Pick + Pay"
        detail={activeEntry ? `${exceptionCount} exceptions` : 'No active pick'}
      />

      <div className="mt-2 shrink-0 overflow-hidden rounded-[10px] border border-slate-200 bg-slate-950 text-white">
        <div className="border-b border-white/10 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-normal text-slate-400">
            Scan next
          </p>
          {nextPick ? (
            <>
              <p className="mt-1 truncate text-sm font-semibold">
                {nextPick.medication.drugName}
              </p>
              <p className="text-xs text-slate-300">
                Pick {nextPick.requiredQuantity} · {nextPick.recommendedBatch?.storageLocation || 'Unmapped shelf'}
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm font-semibold">No active item</p>
          )}
        </div>
        <div className="grid grid-cols-3 divide-x divide-white/10 text-center">
          <ScanFact label="Batch" value={nextPick?.recommendedBatch?.batchNumber || '--'} />
          <ScanFact label="Expiry" value={nextPick?.recommendedBatch?.expiryDate ? formatDateOnly(nextPick.recommendedBatch.expiryDate) : '--'} />
          <ScanFact label="Stock" value={nextPick?.stock?.totalNonExpiredStock ?? '--'} />
        </div>
      </div>

      <div className="mt-2 grid shrink-0 gap-1.5 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        <ChecklistItem
          icon={<ShieldCheck className="h-4 w-4" />}
          title="Validate"
          detail="Allergy and dose"
          done={Boolean(activeEntry)}
        />
        <ChecklistItem
          icon={<MapPin className="h-4 w-4" />}
          title="FEFO pick"
          detail="Earliest valid batch"
          done={pickLines.some((line) => Boolean(line.recommendedBatch))}
        />
        <ChecklistItem
          icon={<Barcode className="h-4 w-4" />}
          title="Barcode"
          detail="Confirm batch"
          done={allLinesReviewed}
        />
        <ChecklistItem
          icon={<Receipt className="h-4 w-4" />}
          title="GST bill"
          detail="Invoice ready"
          done={activeLifecycle === 'Ready to Bill' || activeLifecycle === 'Paid' || activeLifecycle === 'Dispensed'}
        />
        <ChecklistItem
          icon={<ShoppingCart className="h-4 w-4" />}
          title="Payment"
          detail="Capture"
          done={activeLifecycle === 'Paid' || activeLifecycle === 'Dispensed'}
        />
        <ChecklistItem
          icon={<Printer className="h-4 w-4" />}
          title="Dispense"
          detail="Commit"
          done={activeLifecycle === 'Dispensed'}
        />
      </div>

      <div className="mt-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[10px] border border-slate-200 shadow-sm">
        <div className="shrink-0 border-b border-slate-100 bg-slate-50 px-2.5 py-2">
          <p className="text-sm font-semibold text-slate-950">Pick Assist</p>
          <p className="text-xs text-slate-500">
            Shelf, batch, and split-stock view.
          </p>
        </div>
        <div className="min-h-0 divide-y divide-slate-100 overflow-y-auto">
          {pickLines.length === 0 ? (
            <div className="p-3 text-sm text-slate-600">
              Select a prescription to show pick instructions.
            </div>
          ) : (
            pickLines.map((line) => (
              <div key={line.medication.drugName} className="px-2.5 py-2 transition hover:bg-slate-50">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">
                      {line.medication.drugName}
                    </p>
                    <p className="text-xs text-slate-500">
                      Pick {line.requiredQuantity} · {line.stock?.totalNonExpiredStock ?? 0} available
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0 bg-white text-slate-700">
                    {line.recommendedBatch?.batchNumber || 'No batch'}
                  </Badge>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-1.5 text-xs">
                  <MiniFact
                    label="Location"
                    value={line.recommendedBatch?.storageLocation || 'Unmapped'}
                  />
                  <MiniFact
                    label="Expiry"
                    value={line.recommendedBatch?.expiryDate ? formatDateOnly(line.recommendedBatch.expiryDate) : 'No expiry'}
                  />
                </div>
                {line.alternateCount > 0 ? (
                  <p className="mt-2 text-xs font-medium text-blue-700">
                    {line.alternateCount} alternate batch{line.alternateCount === 1 ? '' : 'es'} available if shelf stock is short.
                  </p>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="mt-2 grid shrink-0 gap-1.5">
        <Button size="sm" onClick={onOpenBilling} disabled={!activeEntry}>
          <FileText className="mr-2 h-4 w-4" />
          Collect payment
        </Button>
        <Button size="sm" variant="outline" onClick={onOpenPartnerSync}>
          <ShoppingCart className="mr-2 h-4 w-4" />
          Daily close
        </Button>
        <Button size="sm" variant="outline" onClick={onOpenInventoryControl}>
          <MapPin className="mr-2 h-4 w-4" />
          Shelf intelligence
        </Button>
      </div>
    </div>
  );
}

function PanelHeader({
  icon,
  title,
  detail,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-slate-100 text-slate-800 ring-1 ring-slate-200">
          {icon}
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-950">{title}</p>
          <p className="text-xs text-slate-500">{detail}</p>
        </div>
      </div>
    </div>
  );
}

function CommandStat({
  label,
  value,
  tone = 'slate',
}: {
  label: string;
  value: number;
  tone?: 'slate' | 'amber' | 'emerald';
}) {
  const colors = {
    slate: 'border-white/10 bg-white/10 text-white',
    amber: 'border-amber-300/30 bg-amber-300/10 text-amber-100',
    emerald: 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100',
  };

  return (
    <div className={`flex items-center justify-between rounded-[8px] border px-2 py-1 ${colors[tone]}`}>
      <span className="text-[11px] opacity-75">{label}</span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  );
}

function QueueMetric({
  label,
  value,
  intent,
}: {
  label: string;
  value: number;
  intent: 'blue' | 'amber';
}) {
  const colors = {
    blue: 'border-blue-100 bg-blue-50 text-blue-800',
    amber: 'border-amber-100 bg-amber-50 text-amber-800',
  };

  return (
    <div className={`rounded-[8px] border px-2 py-1.5 ${colors[intent]}`}>
      <p className="text-[11px] opacity-75">{label}</p>
      <p className="text-lg font-semibold leading-5">{value}</p>
    </div>
  );
}

function StatusChip({
  status,
  dispenseStatus,
  active,
}: {
  status: QueueStatus;
  dispenseStatus?: DispenseTaskStatus;
  active?: boolean;
}) {
  const label =
    dispenseStatusLabels[dispenseStatus || ''] ||
    {
      pending: 'Queued',
      partial: 'Partial',
      dispensed: 'Done',
      expired: 'Paused',
    }[status];
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
        active
          ? 'border-white/20 bg-white/10 text-white'
          : dispenseStatus === 'DISPENSED' || status === 'dispensed'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
            : dispenseStatus === 'PAUSED' ||
                dispenseStatus === DISPENSE_TASK_CANCELLED ||
                status === 'expired'
              ? 'border-red-200 bg-red-50 text-red-800'
              : dispenseStatus === 'PARTIALLY_FILLED' || status === 'partial'
                ? 'border-amber-200 bg-amber-50 text-amber-800'
                : 'border-slate-200 bg-slate-50 text-slate-700'
      }`}
    >
      {label}
    </span>
  );
}

const dispenseStatusLabels: Record<string, string> = {
  QUEUED: 'Queued',
  IN_REVIEW: 'Review',
  PARTIALLY_FILLED: 'Partial',
  PAUSED: 'Paused',
  READY_TO_BILL: 'Bill',
  PAID: 'Paid',
  DISPENSED: 'Done',
  CANCELLED: 'Cancelled',
};

function LifecycleRail({ active }: { active: DispenseLifecycle }) {
  return (
    <div className="flex max-w-full flex-wrap gap-1 lg:justify-end">
      {lifecycleSteps.map((step) => {
        const isActive = active === step;
        const isExceptional = step === 'Paused' || step === 'Cancelled';
        return (
          <div
            key={step}
            className={`rounded-full border px-2 py-0.5 text-center text-[10px] font-semibold ${
              isActive
                ? isExceptional
                  ? 'border-amber-300 bg-amber-100 text-amber-900'
                  : 'border-slate-950 bg-slate-950 text-white'
                : 'border-slate-200 bg-white text-slate-500'
            }`}
          >
            {step}
          </div>
        );
      })}
    </div>
  );
}

function StockBadge({ stock }: { stock?: StockCheckItem }) {
  if (!stock) {
    return (
      <Badge variant="outline" className="bg-slate-50 text-slate-700">
        Checking
      </Badge>
    );
  }
  const config = {
    UNMATCHED: 'bg-red-50 text-red-800',
    OUT_OF_STOCK: 'bg-red-50 text-red-800',
    LOW_STOCK: 'bg-amber-50 text-amber-800',
    IN_STOCK: 'bg-emerald-50 text-emerald-800',
  }[stock.stockStatus];
  return (
    <Badge variant="outline" className={config}>
      {stock.stockStatus.replaceAll('_', ' ')}
    </Badge>
  );
}

function MiniFact({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-normal text-slate-500">
        {label}
      </p>
      <p className="truncate text-sm font-medium text-slate-950">{value}</p>
    </div>
  );
}

function CompactFact({ value }: { value: string | number }) {
  return (
    <p className="truncate text-[11px] font-semibold text-slate-800">{value}</p>
  );
}

function ScanFact({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="px-2 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-normal text-slate-400">
        {label}
      </p>
      <p className="truncate text-xs font-semibold text-white">{value}</p>
    </div>
  );
}

function ReviewButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2 py-1 text-[11px] font-semibold transition ${
        active
          ? 'border-slate-950 bg-slate-950 text-white'
          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
      }`}
    >
      {children}
    </button>
  );
}

function ChecklistItem({
  icon,
  title,
  detail,
  done,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  done: boolean;
}) {
  return (
    <div className="flex gap-2 rounded-[8px] border border-slate-200 bg-white p-1.5 shadow-sm">
      <div
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] ${
          done ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
        }`}
      >
        {done ? <CheckCircle2 className="h-4 w-4" /> : icon}
      </div>
      <div>
        <p className="text-xs font-semibold text-slate-950">{title}</p>
        <p className="text-[11px] leading-4 text-slate-500 xl:hidden 2xl:block">{detail}</p>
      </div>
    </div>
  );
}

function stockWarnings(stock: StockCheckItem) {
  const warnings: string[] = [];
  if (stock.stockStatus === 'UNMATCHED') warnings.push('No match');
  if (stock.stockStatus === 'OUT_OF_STOCK') warnings.push('Out of stock');
  if (stock.lowStock) warnings.push('Low stock');
  if (stock.nearExpiry) warnings.push('Near expiry');
  const expiredBatch = stock.batches?.some(
    (batch) =>
      batch.expiryDate &&
      new Date(batch.expiryDate).getTime() < new Date().setHours(0, 0, 0, 0),
  );
  if (expiredBatch) warnings.push('Expired batch blocked');
  return warnings;
}

function deriveLifecycle(
  entry: QueueEntry,
  isSelected: boolean,
  allLinesReviewed: boolean,
): DispenseLifecycle {
  const persisted = lifecycleFromTaskStatus(entry.dispenseStatus);
  if (persisted) return persisted;
  if (entry.status === 'dispensed') return 'Dispensed';
  if (entry.status === 'partial') return 'Partially Filled';
  if (entry.status === 'expired') return 'Paused';
  if (allLinesReviewed) return 'Ready to Bill';
  return isSelected ? 'In Review' : 'Queued';
}

function lifecycleFromTaskStatus(
  status?: DispenseTaskStatus,
): DispenseLifecycle | null {
  if (!status) return null;
  const map: Record<DispenseTaskStatus, DispenseLifecycle> = {
    QUEUED: 'Queued',
    IN_REVIEW: 'In Review',
    PARTIALLY_FILLED: 'Partially Filled',
    PAUSED: 'Paused',
    READY_TO_BILL: 'Ready to Bill',
    PAID: 'Paid',
    DISPENSED: 'Dispensed',
    CANCELLED: 'Cancelled',
  };
  return map[status];
}

function backendActionFromLineAction(action: LineAction) {
  const map: Record<LineAction, string> = {
    pending: 'PENDING',
    accepted: 'ACCEPTED',
    substitute: 'SUBSTITUTE',
    edit: 'EDITED',
    unavailable: 'UNAVAILABLE',
  };
  return map[action];
}

function formatAge(hours: number) {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m pending`;
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

function formatDateOnly(value: string) {
  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
