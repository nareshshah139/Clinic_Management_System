'use client';

import { displayClinicDateTime, displayUtcDate } from '@/lib/date-display';
import { LoadingSkeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Barcode,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  MapPin,
  PackageCheck,
  Pill,
  Printer,
  Receipt,
  Plus,
  RefreshCw,
  ShieldCheck,
  ShoppingCart,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { apiClient } from '@/lib/api';
import { stockCheckLineName } from '@/lib/bill-line-name';
import { PrescriptionInventoryLink, type InventorySuggestion } from './PrescriptionInventoryLink';

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
  sourceLineKey?: string;
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
  dispensingEligible?: boolean;
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
  counts?: Record<QueueStatus, number>;
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
  sourceLineKey?: string;
  drugName: string;
  inventoryItemId?: string | null;
  stockName?: string | null;
  unit?: string | null;
  prescriptionVersion?: string;
  suggestions?: InventorySuggestion[];
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

const QUEUE_PAGE_SIZE = 25;
const QUEUE_ENDPOINT = '/pharmacy/prescription-queue';

const QUEUE_FILTERS: ReadonlyArray<{ id: string; label: string; status?: QueueStatus }> = [
  { id: 'all', label: 'All' },
  { id: 'waiting', label: 'Waiting', status: 'pending' },
  { id: 'partial', label: 'Partial', status: 'partial' },
  { id: 'paused', label: 'Paused', status: 'expired' },
  { id: 'done', label: 'Done', status: 'dispensed' },
];

type QueueFilter = (typeof QUEUE_FILTERS)[number];

const isBillable = (entry: QueueEntry) => entry.dispensingEligible !== false && entry.status !== 'dispensed';

const billingPrefill = (entry: QueueEntry): PharmacyBillingPrefill => ({
  patientId: entry.patient.id,
  doctorId: entry.doctor.id,
  prescriptionId: entry.prescriptionId,
  visitId: entry.visitId || undefined,
});

/**
 * @cc [owner:nareshshah139,label:product] counter-current-stock-refresh
 * Refresh and pharmacy stock-change events MUST recheck the active prescription's stock.
 * Obsolete responses MUST NOT replace a newer selection; failed reads MUST clear stale stock
 * and show a retryable error rather than a successful availability result.
 */
/**
 * @cc [owner:nareshshah139,label:product] counter-explicit-task-commands
 * Passive queue and stock refreshes MUST NOT create tasks. Staff review and status actions
 * MUST obtain a persisted task and line identity before saving; failed saves MUST NOT mark a line reviewed.
 */
/**
 * @cc [owner:nareshshah139,label:product] counter-prescription-line-review
 * Review state MUST come from each active prescription line, defaulting to pending when absent.
 * Stock and review commands MUST use that line identity, even when other medicines share its name.
 */
/**
 * @cc [owner:nareshshah139,label:product] counter-ready-reviewed-task
 * Ready MUST recheck the prepared task and reject empty tasks or pending and unavailable lines
 * before saving status. Unreviewed or unavailable lines MUST keep the Ready button disabled.
 */
/**
 * @cc [owner:nareshshah139,label:product] counter-single-queue
 * The Counter MUST be the only list of waiting prescriptions. Each filter chip MUST filter and count
 * on the server by its queue status, and Show more MUST page within that filter. Bill MUST appear only
 * for roles that can create a bill (onOpenBilling given); there each billable row MUST offer Bill with
 * its patient, doctor, prescription and visit, and ineligible or dispensed rows MUST NOT. A pharmacy
 * invoice refresh MUST reload the queue so billed prescriptions leave waiting without a page reload.
 * Link item and Change link MUST follow Bill: roles without onOpenBilling see neither, because the
 * server refuses inventory linking for them.
 */
export function PharmacyCounterCockpit({
  prefill,
  onOpenBilling,
  onOpenPartnerSync,
  onOpenInventoryControl,
}: {
  prefill?: PharmacyBillingPrefill | null;
  onOpenBilling?: (prefill?: PharmacyBillingPrefill) => void;
  onOpenPartnerSync: () => void;
  onOpenInventoryControl: () => void;
}) {
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [queueTotal, setQueueTotal] = useState(0);
  const [queuePages, setQueuePages] = useState(1);
  const [filter, setFilter] = useState<QueueFilter>(QUEUE_FILTERS[0]);
  const [statusCounts, setStatusCounts] = useState<Record<QueueStatus, number> | null>(null);
  const queueRequest = useRef(0);
  const [activeId, setActiveId] = useState<string | null>(
    prefill?.prescriptionId || null,
  );
  const [stockItems, setStockItems] = useState<StockCheckItem[]>([]);
  const [stockReloadKey, setStockReloadKey] = useState(0);
  const [stockError, setStockError] = useState<string | null>(null);
  const [reasonType, setReasonType] = useState(reasonOptions[0]);
  const [reasonNote, setReasonNote] = useState('');
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [loadingStock, setLoadingStock] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const taskCommandInFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const activeEntry = useMemo(
    () => queue.find((entry) => entry.prescriptionId === activeId) || null,
    [activeId, queue],
  );

  const replaceQueueEntry = useCallback((updatedEntry: QueueEntry) => {
    setQueue((current) =>
      current.map((entry) =>
        entry.prescriptionId === updatedEntry.prescriptionId ? updatedEntry : entry,
      ),
    );
  }, []);

  const loadQueue = useCallback(async () => {
    const request = ++queueRequest.current;
    setStockReloadKey(key => key + 1);
    try {
      setLoadingQueue(true);
      setError(null);
      const responses = await Promise.all(
        Array.from({ length: queuePages }, (_, index) =>
          apiClient.get<QueueResponse>(QUEUE_ENDPOINT, {
            page: index + 1,
            limit: QUEUE_PAGE_SIZE,
            status: filter.status,
          }),
        ),
      );
      if (request !== queueRequest.current) return;
      const response = responses[responses.length - 1];
      let entries = [
        ...new Map(
          responses.flatMap((page) => page.data || []).map((entry) => [entry.prescriptionId, entry]),
        ).values(),
      ];

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
        if (request !== queueRequest.current) return;
      }

      setQueue(entries);
      setQueueTotal(response.pagination?.total ?? entries.length);
      setStatusCounts(response.counts ?? null);
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
      if (request !== queueRequest.current) return;
      console.error('Failed to load pharmacy counter queue:', err);
      setError('Unable to load prescription queue');
      setQueue([]);
      setQueueTotal(0);
    } finally {
      if (request === queueRequest.current) setLoadingQueue(false);
    }
  }, [filter, prefill?.prescriptionId, queuePages]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    const refresh = () => { void loadQueue(); };
    window.addEventListener('pharmacy-invoices-refresh', refresh);
    window.addEventListener('inventory-stock-refresh', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('pharmacy-invoices-refresh', refresh);
      window.removeEventListener('inventory-stock-refresh', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [loadQueue]);

  useEffect(() => {
    let current = true;
    setStockItems([]);
    setStockError(null);
    if (!activeId) {
      setLoadingStock(false);
      return;
    }

    const loadStock = async () => {
      try {
        setLoadingStock(true);
        const response = await apiClient.get<StockCheckResponse>(
          `/pharmacy/prescription-queue/${activeId}/stock-check`,
        );
        if (!current) return;
        setStockItems(response.items || []);
      } catch (err) {
        if (!current) return;
        console.error('Failed to load pharmacy stock check:', err);
        setStockItems([]);
        setStockError('Unable to check current stock. Use Refresh to retry.');
      } finally {
        if (current) setLoadingStock(false);
      }
    };

    void loadStock();
    return () => { current = false; };
  }, [activeId, stockReloadKey]);

  const stockByLine = useMemo(() => {
    return Object.fromEntries(stockItems.map((item, index) => [item.sourceLineKey ?? String(index), item]));
  }, [stockItems]);

  const exceptionCount = useMemo(() => {
    return stockItems.filter(
      (item, index) =>
        item.stockStatus !== 'IN_STOCK' ||
        item.nearExpiry ||
        item.lowStock ||
        activeEntry?.medications.find((line, lineIndex) =>
          item.sourceLineKey ? line.sourceLineKey === item.sourceLineKey : lineIndex === index,
        )?.action === 'unavailable',
    ).length;
  }, [activeEntry, stockItems]);

  const reviewedLineCount = useMemo(() => {
    if (!activeEntry) return 0;
    return activeEntry.medications.filter(
      (medication) => (medication.action || 'pending') !== 'pending',
    ).length;
  }, [activeEntry]);

  const allLinesReviewed =
    Boolean(activeEntry?.medications.length) &&
    reviewedLineCount === activeEntry?.medications.length;
  const readyForBilling = Boolean(activeEntry && hasBillableReview(activeEntry));

  const pickLines = useMemo(() => {
    if (!activeEntry) return [];
    return activeEntry.medications.map((medication, index) => {
      const stock = stockByLine[medication.sourceLineKey ?? String(index)];
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
  }, [activeEntry, stockByLine]);

  const activeLifecycle = activeEntry
    ? deriveLifecycle(activeEntry, activeEntry.prescriptionId === activeId, readyForBilling)
    : 'Queued';
  const openActiveBilling = useCallback(() => {
    if (activeEntry && isBillable(activeEntry)) onOpenBilling?.(billingPrefill(activeEntry));
  }, [activeEntry, onOpenBilling]);

  const ensureDispenseTask = useCallback(async (entry: QueueEntry) => {
    if (entry.dispensingEligible === false) throw new Error('Prescription is not active or has expired');
    if (entry.dispenseTaskId && entry.medications.every(line => line.lineId)) {
      return { ...entry, dispenseTaskId: entry.dispenseTaskId };
    }
    const response = await apiClient.post<{ data: QueueEntry }>(
      `/pharmacy/prescription-queue/${entry.prescriptionId}/pull`,
      {},
    );
    if (!response.data.dispenseTaskId) throw new Error('Dispense task was not created');
    replaceQueueEntry(response.data);
    return { ...response.data, dispenseTaskId: response.data.dispenseTaskId };
  }, [replaceQueueEntry]);

  const updateTaskStatus = useCallback(
    async (status: DispenseTaskStatus) => {
      if (!activeEntry || taskCommandInFlight.current) return;
      taskCommandInFlight.current = true;
      try {
        setSavingTask(true);
        setError(null);
        const task = await ensureDispenseTask(activeEntry);
        if (status === 'READY_TO_BILL' && !hasBillableReview(task)) {
          setError(
            'Review every available medicine before marking ready for billing. Unavailable medicines must be resolved first.',
          );
          return;
        }
        const updated = await apiClient.patch<QueueEntry>(
          `/pharmacy/dispense-tasks/${task.dispenseTaskId}/status`,
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
        taskCommandInFlight.current = false;
        setSavingTask(false);
      }
    },
    [activeEntry, ensureDispenseTask, reasonNote, reasonType, replaceQueueEntry],
  );

  const selectQueueEntry = useCallback(
    async (entry: QueueEntry) => {
      if (taskCommandInFlight.current) return;
      setActiveId(entry.prescriptionId);
      if (entry.dispensingEligible === false) return;
      taskCommandInFlight.current = true;
      try {
        setSavingTask(true);
        setError(null);
        const task = await ensureDispenseTask(entry);
        if (task.dispenseStatus === 'QUEUED') {
          const updated = await apiClient.patch<QueueEntry>(
            `/pharmacy/dispense-tasks/${task.dispenseTaskId}/status`,
            { status: 'IN_REVIEW' },
          );
          replaceQueueEntry(updated);
        }
      } catch (err) {
        console.error('Failed to start dispense review:', err);
        setError('Unable to start medicine review. Select the prescription to retry.');
      } finally {
        taskCommandInFlight.current = false;
        setSavingTask(false);
      }
    },
    [ensureDispenseTask, replaceQueueEntry],
  );

  const updateLineAction = useCallback(
    async (medication: QueueMedication, action: LineAction) => {
      if (!activeEntry || taskCommandInFlight.current) return;
      taskCommandInFlight.current = true;
      try {
        setSavingTask(true);
        setError(null);
        const task = await ensureDispenseTask(activeEntry);
        const line = medication.lineId
          ? task.medications.find(item => item.lineId === medication.lineId)
          : medication.sourceLineKey
            ? task.medications.find(item => item.sourceLineKey === medication.sourceLineKey)
            : task.medications[activeEntry.medications.indexOf(medication)];
        if (!line?.lineId || line.drugName !== medication.drugName) {
          throw new Error('Prescription line no longer exists');
        }
        const updated = await apiClient.patch<QueueEntry>(
          `/pharmacy/dispense-tasks/${task.dispenseTaskId}/lines/${line.lineId}`,
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
        taskCommandInFlight.current = false;
        setSavingTask(false);
      }
    },
    [activeEntry, ensureDispenseTask, reasonNote, reasonType, replaceQueueEntry],
  );

  return (
    <section className="flex min-h-[620px] flex-col overflow-hidden rounded-lg border border-slate-200/80 bg-white shadow-sm xl:h-[calc(100vh-130px)]">
      <div className="shrink-0 border-b border-slate-800 bg-slate-950 px-3 py-2 text-white md:px-4">
        <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight">
                Pharmacy Counter
              </h1>
              <Badge variant="outline" className="border-emerald-300/30 bg-emerald-300/10 px-2 py-0 text-xs text-emerald-100">
                Pharmacist review
              </Badge>
              <Badge variant="outline" className="border-cyan-300/30 bg-cyan-300/10 px-2 py-0 text-xs text-cyan-100">
                Shelf locations
              </Badge>
            </div>
            <p className="mt-0.5 truncate text-xs text-slate-300">
              Queue to pick to bill in one workstation.
            </p>
          </div>

          <div className="flex flex-wrap justify-start gap-1.5 xl:justify-end">
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-white/15 bg-white/10 text-white hover:bg-white/15 hover:text-white"
              onClick={loadQueue}
              disabled={loadingQueue || savingTask}
            >
              {loadingQueue ? <Spinner className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </Button>
            {onOpenBilling ? (
              <Button size="sm" className="h-8 bg-white text-slate-950 hover:bg-slate-100" onClick={() => onOpenBilling()}>
                <Plus className="h-4 w-4" />
                New bill
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {error || stockError ? (
        <div role="alert" className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm font-medium text-red-700">
          {error || stockError}
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 gap-2 bg-slate-100/70 p-2 xl:grid-cols-[280px_minmax(0,1fr)_290px] 2xl:grid-cols-[300px_minmax(0,1fr)_330px]">
        <QueueColumn
          queue={queue}
          queueTotal={queueTotal}
          filter={filter}
          statusCounts={statusCounts}
          onFilter={(option) => {
            setFilter(option);
            setQueuePages(1);
          }}
          activeId={activeId}
          loading={loadingQueue}
          onSelect={selectQueueEntry}
          onBill={onOpenBilling ? (entry) => onOpenBilling(billingPrefill(entry)) : undefined}
          onShowMore={queuePages * QUEUE_PAGE_SIZE < queueTotal ? () => setQueuePages((pages) => pages + 1) : undefined}
        />

        <ActiveDispenseColumn
          activeEntry={activeEntry}
          stockByLine={stockByLine}
          loadingStock={loadingStock}
          setLineAction={updateLineAction}
          onInventoryLinked={onOpenBilling ? async () => setStockReloadKey((key) => key + 1) : undefined}
          activeLifecycle={activeLifecycle}
          reviewedLineCount={reviewedLineCount}
          readyForBilling={readyForBilling}
          reasonType={reasonType}
          setReasonType={setReasonType}
          reasonNote={reasonNote}
          setReasonNote={setReasonNote}
          onOpenBilling={onOpenBilling ? openActiveBilling : undefined}
          onUpdateStatus={updateTaskStatus}
          savingTask={savingTask}
        />

        <FulfillmentColumn
          activeEntry={activeEntry}
          pickLines={pickLines}
          activeLifecycle={activeLifecycle}
          exceptionCount={exceptionCount}
          allLinesReviewed={allLinesReviewed}
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
  filter,
  statusCounts,
  onFilter,
  activeId,
  loading,
  onSelect,
  onBill,
  onShowMore,
}: {
  queue: QueueEntry[];
  queueTotal: number;
  filter: QueueFilter;
  statusCounts: Record<QueueStatus, number> | null;
  onFilter: (filter: QueueFilter) => void;
  activeId: string | null;
  loading: boolean;
  onSelect: (entry: QueueEntry) => void;
  onBill?: (entry: QueueEntry) => void;
  onShowMore?: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-col rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
      <PanelHeader
        icon={<ClipboardCheck className="h-4 w-4" />}
        title="Prescription queue"
        detail={queueTotal > queue.length ? `Newest ${queue.length} of ${queueTotal}` : 'Newest first'}
      />
      <div className="mt-2 flex shrink-0 flex-wrap gap-1">
        {QUEUE_FILTERS.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={filter.id === option.id}
            onClick={() => onFilter(option)}
            className={`rounded-full border px-2 py-1 text-xs font-semibold transition ${
              filter.id === option.id
                ? 'border-slate-950 bg-slate-950 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
            }`}
          >
            {option.label}
            {statusCounts ? (
              <>
                {' '}
                <span className="tabular-nums">
                  {option.status ? statusCounts[option.status] : Object.values(statusCounts).reduce((sum, count) => sum + count, 0)}
                </span>
              </>
            ) : null}
          </button>
        ))}
      </div>
      <div className="mt-2 min-h-0 flex-1 overflow-y-auto pr-1">
        {loading && queue.length === 0 ? (
          <LoadingSkeleton label="Loading prescription queue…" />
        ) : queue.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            {filter.status ? (
              'No items match this filter.'
            ) : (
              <>
                <p className="font-semibold text-slate-950">No prescriptions waiting</p>
                <p className="mt-1">Prescriptions saved in a visit appear here.</p>
              </>
            )}
          </div>
        ) : (
          <ul aria-label="Prescription queue" className="space-y-1.5">
            {queue.map((entry) => (
              <QueueRow
                key={entry.prescriptionId}
                entry={entry}
                active={activeId === entry.prescriptionId}
                onSelect={() => onSelect(entry)}
                onBill={onBill && isBillable(entry) ? () => onBill(entry) : undefined}
              />
            ))}
          </ul>
        )}
        {onShowMore ? (
          <Button size="sm" variant="outline" className="mt-2 w-full" onClick={onShowMore} disabled={loading}>
            Show more
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function QueueRow({
  entry,
  active,
  onSelect,
  onBill,
}: {
  entry: QueueEntry;
  active: boolean;
  onSelect: () => void;
  onBill?: () => void;
}) {
  const nameId = `queue-patient-${entry.prescriptionId}`;
  return (
    <li
      className={`relative rounded-lg border transition ${
        active ? 'border-slate-950 bg-slate-950 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-950 hover:border-slate-300 hover:bg-slate-50'
      }`}
    >
      <button type="button" onClick={onSelect} className="w-full px-2.5 py-2 text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p id={nameId} className="truncate text-sm font-semibold">{entry.patient.name}</p>
            <p className={`mt-0.5 truncate text-xs ${active ? 'text-slate-300' : 'text-slate-500'}`}>
              {entry.patient.patientCode || entry.patient.id}
            </p>
          </div>
          <StatusChip status={entry.status} dispenseStatus={entry.dispenseStatus} active={active} />
        </div>
        <div className={`mt-2 flex flex-wrap items-center gap-2 text-xs ${onBill ? 'pr-20' : ''} ${active ? 'text-slate-300' : 'text-slate-500'}`}>
          <span>{entry.medications.length} medicines</span>
          <span>{formatAge(entry.pendingHours)}</span>
          {entry.isOverTwoHours && entry.status !== 'dispensed' ? (
            <span className={active ? 'text-amber-200' : 'text-amber-700'}>over 2h</span>
          ) : null}
        </div>
      </button>
      {onBill ? (
        <Button size="sm" variant="outline" className="absolute bottom-1.5 right-2 text-foreground" aria-describedby={nameId} onClick={onBill}>
          <Receipt className="h-4 w-4" />
          Bill
        </Button>
      ) : null}
    </li>
  );
}

function ActiveDispenseColumn({
  activeEntry,
  stockByLine,
  loadingStock,
  setLineAction,
  onInventoryLinked,
  activeLifecycle,
  reviewedLineCount,
  readyForBilling,
  reasonType,
  setReasonType,
  reasonNote,
  setReasonNote,
  onOpenBilling,
  onUpdateStatus,
  savingTask,
}: {
  activeEntry: QueueEntry | null;
  stockByLine: Record<string, StockCheckItem>;
  loadingStock: boolean;
  setLineAction: (medication: QueueMedication, action: LineAction) => void;
  onInventoryLinked?: () => Promise<void>;
  activeLifecycle: DispenseLifecycle;
  reviewedLineCount: number;
  readyForBilling: boolean;
  reasonType: string;
  setReasonType: (value: string) => void;
  reasonNote: string;
  setReasonNote: (value: string) => void;
  onOpenBilling?: () => void;
  onUpdateStatus: (status: DispenseTaskStatus) => void;
  savingTask: boolean;
}) {
  return (
    <div className="@container flex min-h-0 flex-col rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
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
          <div className="shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="grid gap-2 bg-slate-950 px-3 py-2 text-white @2xl:grid-cols-[minmax(0,1fr)_auto] @2xl:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-base font-semibold">
                    {activeEntry.patient.name}
                  </p>
                  <Badge variant="outline" className="border-white/20 bg-white/10 px-2 py-0 text-xs text-white">
                    {activeLifecycle}
                  </Badge>
                  {activeEntry.linkedInvoiceIds.length > 0 ? (
                    <Badge variant="outline" className="border-emerald-300/30 bg-emerald-300/10 px-2 py-0 text-xs text-emerald-100">
                      Invoice
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-0.5 truncate text-xs text-slate-300">
                  Dr. {activeEntry.doctor.name} · {displayClinicDateTime(activeEntry.createdAt)} · {activeEntry.prescriptionId}
                </p>
              </div>
              <LifecycleRail active={activeLifecycle} />
            </div>
          </div>

          {loadingStock ? (
            <div className="mt-2 flex h-32 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
              <Spinner className="mr-2 h-4 w-4 " />
              Checking stock and batch expiry
            </div>
          ) : (
            <fieldset disabled={savingTask || activeEntry?.dispensingEligible === false} className="contents">
              <MedicationReviewTable
                activeEntry={activeEntry}
                stockByLine={stockByLine}
                setLineAction={setLineAction}
                onInventoryLinked={onInventoryLinked}
              />
            </fieldset>
          )}

          <div className="mt-2 shrink-0 rounded-lg border border-slate-200 bg-slate-50/80 p-2">
            <div className="grid gap-2 @md:grid-cols-[210px_minmax(0,1fr)]">
              <select
                value={reasonType}
                onChange={(event) => setReasonType(event.target.value)}
                className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
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
                className="min-h-9 resize-none rounded-md py-2"
              />
            </div>
          </div>

          <div className="mt-2 shrink-0 flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm @md:flex-row @md:items-center @md:justify-between">
            <div className="text-sm">
              <p className="font-semibold text-slate-950">
                {readyForBilling ? 'Ready for billing review' : 'Review every medicine before billing'}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onUpdateStatus('PAUSED')}
                disabled={savingTask || activeEntry?.dispensingEligible === false}
              >
                Pause
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onUpdateStatus('READY_TO_BILL')}
                disabled={!readyForBilling || savingTask || activeEntry?.dispensingEligible === false}
              >
                Ready
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onUpdateStatus('PAID')}
                disabled={savingTask || activeEntry?.dispensingEligible === false}
              >
                Paid
              </Button>
              {onOpenBilling ? (
                <Button size="sm" onClick={onOpenBilling} disabled={savingTask || !isBillable(activeEntry)}>
                  <Receipt className="mr-2 h-4 w-4" />
                  Bill
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-2 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-center">
          <Pill className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-3 font-semibold text-slate-950">No active prescription</p>
          <p className="mt-1 text-sm text-slate-600">Select a prescription in the queue to review its medicines.</p>
        </div>
      )}
    </div>
  );
}

function MedicationReviewTable({
  activeEntry,
  stockByLine,
  setLineAction,
  onInventoryLinked,
}: {
  activeEntry: QueueEntry;
  stockByLine: Record<string, StockCheckItem>;
  setLineAction: (medication: QueueMedication, action: LineAction) => void;
  onInventoryLinked?: () => Promise<void>;
}) {
  return (
    <div className="mt-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200">
      <div className="hidden shrink-0 grid-cols-[minmax(180px,1.25fr)_minmax(160px,1fr)_86px_136px_210px] gap-2 border-b border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-semibold uppercase tracking-normal text-slate-500 @3xl:grid">
        <span>Prescription</span>
        <span>Inventory Match</span>
        <span>Stock</span>
        <span>Shelf and batch</span>
        <span>Action</span>
      </div>
      <div className="min-h-0 divide-y divide-slate-100 overflow-y-auto">
        {activeEntry.medications.map((medication, index) => {
          const stock = stockByLine[medication.sourceLineKey ?? String(index)];
          return (
            <MedicationReviewRow
              key={`${activeEntry.prescriptionId}-${medication.sourceLineKey || medication.lineId || index}`}
              medication={medication}
              stock={stock}
              action={medication.action || 'pending'}
              setAction={(action) => setLineAction(medication, action)}
              inventoryLink={
                onInventoryLinked && activeEntry.dispensingEligible !== false && stock ? (
                  <PrescriptionInventoryLink
                    prescriptionId={activeEntry.prescriptionId}
                    lineIndex={index}
                    linked={Boolean(stock.inventoryItemId)}
                    prescriptionVersion={stock.prescriptionVersion}
                    name={medication.drugName}
                    suggestions={stock.suggestions}
                    onLinked={onInventoryLinked}
                  />
                ) : null
              }
            />
          );
        })}
      </div>
    </div>
  );
}

/**
 * @cc [owner:nareshshah139,label:product] stock-column-all-prescribed-items
 * Every checked prescription line MUST show its stock status and available quantity with unit.
 * Unlinked quantities MUST be unknown, not zero; no prescribed line may be hidden.
 */
function MedicationReviewRow({
  medication,
  stock,
  action,
  setAction,
  inventoryLink,
}: {
  medication: QueueMedication;
  stock?: StockCheckItem;
  action: LineAction;
  setAction: (action: LineAction) => void;
  inventoryLink: ReactNode;
}) {
  const recommendedBatch = stock?.batches?.[0] || null;
  const requiredQuantity =
    medication.prescribedQuantity === null
      ? 'Review qty'
      : Math.max(0, medication.prescribedQuantity - medication.dispensedQuantity);
  const warnings = stock ? stockWarnings(stock) : [];

  return (
    <div role="group" aria-label={medication.drugName} className="grid gap-2 bg-white px-2.5 py-2 transition hover:bg-slate-50 @3xl:grid-cols-[minmax(180px,1.25fr)_minmax(160px,1fr)_86px_136px_210px] @3xl:items-center">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-950">{medication.drugName}</p>
        <p className="truncate text-xs text-slate-600">
          {[medication.dosage, medication.dosageUnit, medication.frequency]
            .filter(Boolean)
            .join(' ') || 'Dose not specified'}
        </p>
        <p className="truncate text-xs text-slate-500">
          {[medication.duration, medication.durationUnit].filter(Boolean).join(' ') || 'Duration not set'}
        </p>
      </div>

      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-950">
          {stock ? (isLinked(stock) ? stockCheckLineName(stock) : 'Not linked') : 'Checking stock'}
        </p>
        <p className="truncate text-xs text-slate-600">{availableText(stock)}</p>
        {warnings.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {warnings.slice(0, 2).map((warning) => (
              <Badge key={warning} variant="outline" className="h-5 bg-amber-50 px-1.5 text-xs text-amber-800">
                <AlertTriangle className="h-3 w-3" />
                {warning}
              </Badge>
            ))}
          </div>
        ) : null}
        {inventoryLink}
      </div>

      <div className="flex flex-wrap gap-1 @3xl:block">
        <StockBadge stock={stock} />
        <Badge variant="outline" className="mt-0 bg-slate-50 text-xs text-slate-700 @3xl:mt-1">
          Qty {requiredQuantity}
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-1 rounded-md border border-slate-200 bg-slate-50 p-1.5 @3xl:grid-cols-1">
        <CompactFact value={recommendedBatch?.storageLocation || 'Unmapped'} />
        <CompactFact value={recommendedBatch?.batchNumber || 'No batch'} />
        <CompactFact value={recommendedBatch?.expiryDate ? displayUtcDate(recommendedBatch.expiryDate) : 'No expiry'} />
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
  onOpenPartnerSync: () => void;
  onOpenInventoryControl: () => void;
}) {
  const nextPick = pickLines.find((line) => line.recommendedBatch) || pickLines[0] || null;
  return (
    <div className="flex min-h-0 flex-col rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
      <PanelHeader
        icon={<PackageCheck className="h-4 w-4" />}
        title="Pick + Pay"
        detail={activeEntry ? `${exceptionCount} exceptions` : 'No active pick'}
      />

      <div className="mt-2 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-950 text-white">
        <div className="border-b border-white/10 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-normal text-slate-400">
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
          <ScanFact label="Expiry" value={nextPick?.recommendedBatch?.expiryDate ? displayUtcDate(nextPick.recommendedBatch.expiryDate) : '--'} />
          <ScanFact label="Stock" value={nextPick?.stock ? stockQuantity(nextPick.stock) : '--'} />
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
          title="Pick earliest-expiry batch"
          detail="Use an unexpired batch with the nearest expiry date"
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

      <div className="mt-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 shadow-sm">
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
                      Pick {line.requiredQuantity} · {availableText(line.stock)}
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
                    value={line.recommendedBatch?.expiryDate ? displayUtcDate(line.recommendedBatch.expiryDate) : 'No expiry'}
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
        {activeEntry && activeEntry.linkedInvoiceIds.length > 0 ? (
          <Button asChild size="sm">
            <Link href={`/dashboard/pharmacy/invoices?search=${encodeURIComponent(activeEntry.patient.name)}`}>
              <FileText className="mr-2 h-4 w-4" />
              Collect payment
            </Link>
          </Button>
        ) : null}
        <Button size="sm" variant="outline" onClick={onOpenPartnerSync}>
          <ShoppingCart className="mr-2 h-4 w-4" />
          Daily close
        </Button>
        <Button size="sm" variant="outline" onClick={onOpenInventoryControl}>
          <MapPin className="mr-2 h-4 w-4" />
          Shelf locations
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
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-800 ring-1 ring-slate-200">
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
      className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
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
    <div className="flex max-w-full flex-wrap gap-1 @2xl:justify-end">
      {lifecycleSteps.map((step) => {
        const isActive = active === step;
        const isExceptional = step === 'Paused' || step === 'Cancelled';
        return (
          <div
            key={step}
            className={`rounded-full border px-2 py-0.5 text-center text-xs font-semibold ${
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
      {stockStatusLabels[stock.stockStatus]}
    </Badge>
  );
}

const stockStatusLabels: Record<StockCheckItem['stockStatus'], string> = {
  UNMATCHED: 'Not linked',
  OUT_OF_STOCK: 'Out of stock',
  LOW_STOCK: 'Low stock',
  IN_STOCK: 'In stock',
};

const isLinked = (stock: StockCheckItem) => stock.stockStatus !== 'UNMATCHED';

const stockQuantity = (stock: StockCheckItem) =>
  isLinked(stock) ? `${stock.totalNonExpiredStock}${stock.unit ? ` ${stock.unit.toLowerCase()}` : ''}` : '—';

const availableText = (stock?: StockCheckItem) =>
  !stock ? 'Checking stock' : isLinked(stock) ? `${stockQuantity(stock)} available` : stockQuantity(stock);

function MiniFact({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">
        {label}
      </p>
      <p className="truncate text-sm font-medium text-slate-950">{value}</p>
    </div>
  );
}

function CompactFact({ value }: { value: string | number }) {
  return (
    <p className="truncate text-xs font-semibold text-slate-800">{value}</p>
  );
}

function ScanFact({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="px-2 py-2">
      <p className="text-xs font-semibold uppercase tracking-normal text-slate-400">
        {label}
      </p>
      <p className="whitespace-normal text-xs font-semibold text-white">{value}</p>
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
      className={`rounded-full border px-2 py-1 text-xs font-semibold transition ${
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
    <div className="flex gap-2 rounded-md border border-slate-200 bg-white p-1.5 shadow-sm">
      <div
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
          done ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
        }`}
      >
        {done ? <CheckCircle2 className="h-4 w-4" /> : icon}
      </div>
      <div>
        <p className="text-xs font-semibold text-slate-950">{title}</p>
        <p className="text-xs leading-4 text-slate-500 xl:hidden 2xl:block">{detail}</p>
      </div>
    </div>
  );
}

function stockWarnings(stock: StockCheckItem) {
  const warnings: string[] = [];
  if (stock.lowStock && stock.stockStatus === 'IN_STOCK') warnings.push('Low stock');
  if (stock.nearExpiry) warnings.push('Near expiry');
  const expiredBatch = stock.batches?.some(
    (batch) =>
      batch.expiryDate &&
      new Date(batch.expiryDate).getTime() < new Date().setHours(0, 0, 0, 0),
  );
  if (expiredBatch) warnings.push('Expired batch blocked');
  return warnings;
}

function hasBillableReview(entry: QueueEntry): boolean {
  return (
    entry.medications.length > 0 &&
    entry.medications.every(
      line => line.action && line.action !== 'pending' && line.action !== 'unavailable',
    )
  );
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
