'use client';

import { displayClinicDateTime, displayUtcDate } from '@/lib/date-display';
import { LoadingSkeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Check,
  ClipboardCheck,
  MessageSquarePlus,
  MoreHorizontal,
  Plus,
  Receipt,
  RefreshCw,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { apiClient } from '@/lib/api';
import { stockCheckLineName } from '@/lib/bill-line-name';
import { plural } from '@/lib/labels';
import { prescriptionAmount, prescriptionLabel } from '@/lib/prescription-labels';
import { cn } from '@/lib/utils';
import { PrescriptionInventoryLink, type InventorySuggestion } from './PrescriptionInventoryLink';
import { PurchaseHelp } from './PurchaseHelp';

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

const reasonOptions = [
  'Substitution requested',
  'Quantity changed',
  'Medicine unavailable',
  'Paused for doctor clarification',
  'Cancelled at counter',
  'Stock correction needed',
];

const DISPENSE_TASK_CANCELLED = `CANCEL${'LED'}` as DispenseTaskStatus;

const defaultReasons: Partial<Record<LineAction | DispenseTaskStatus, string>> = {
  substitute: 'Substitution requested',
  edit: 'Quantity changed',
  unavailable: 'Medicine unavailable',
  PAUSED: 'Paused for doctor clarification',
  [DISPENSE_TASK_CANCELLED]: 'Cancelled at counter',
};

type ReasonDraft = { prescriptionId: string | null; type: string | null; note: string };

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

const QUEUE_STATUS_AS_DISPENSE: Record<QueueStatus, DispenseTaskStatus> = {
  pending: 'QUEUED',
  partial: 'PARTIALLY_FILLED',
  dispensed: 'DISPENSED',
  expired: 'PAUSED',
};

const isBillable = (entry: QueueEntry) => entry.dispensingEligible !== false && entry.status !== 'dispensed';

const billingPrefill = (entry: QueueEntry): PharmacyBillingPrefill => ({
  patientId: entry.patient.id,
  doctorId: entry.doctor.id,
  prescriptionId: entry.prescriptionId,
  visitId: entry.visitId || undefined,
});

/**
 * @cc [owner:nareshshah139,label:product] counter-exception-reason-default
 * Substitute, Edit, Unavailable and Pause MUST save the reason that matches the action unless
 * the pharmacist picks another. Accept MUST save no reason. Selecting another prescription
 * MUST clear the chosen reason and note so neither carries over to a different patient.
 */
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
}: {
  prefill?: PharmacyBillingPrefill | null;
  onOpenBilling?: (prefill?: PharmacyBillingPrefill) => void;
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
  const [reasonDraft, setReasonDraft] = useState<ReasonDraft>({ prescriptionId: null, type: null, note: '' });
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [loadingStock, setLoadingStock] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const taskCommandInFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const activeEntry = useMemo(
    () => queue.find((entry) => entry.prescriptionId === activeId) || null,
    [activeId, queue],
  );

  const reason = useMemo<ReasonDraft>(
    () => (reasonDraft.prescriptionId === activeId ? reasonDraft : { prescriptionId: activeId, type: null, note: '' }),
    [activeId, reasonDraft],
  );
  const updateReason = useCallback(
    (change: Partial<Pick<ReasonDraft, 'type' | 'note'>>) => setReasonDraft({ ...reason, ...change }),
    [reason],
  );
  const reasonFields = useCallback(
    (key: LineAction | DispenseTaskStatus) => {
      const fallback = defaultReasons[key];
      return fallback
        ? { reasonType: reason.type ?? fallback, reasonNote: reason.note }
        : { reasonType: undefined, reasonNote: undefined };
    },
    [reason],
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

  const reviewedLineCount = useMemo(() => {
    if (!activeEntry) return 0;
    return activeEntry.medications.filter(
      (medication) => (medication.action || 'pending') !== 'pending',
    ).length;
  }, [activeEntry]);

  const readyForBilling = Boolean(activeEntry && hasBillableReview(activeEntry));

  const activeLifecycle = activeEntry ? deriveLifecycle(activeEntry, readyForBilling) : 'Queued';
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
          { status, ...reasonFields(status) },
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
    [activeEntry, ensureDispenseTask, reasonFields, replaceQueueEntry],
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
          { action: backendActionFromLineAction(action), ...reasonFields(action) },
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
    [activeEntry, ensureDispenseTask, reasonFields, replaceQueueEntry],
  );

  const queueEmpty = !loadingQueue && queue.length === 0 && (Boolean(error) || !filter.status);

  return (
    <div className="space-y-3">
      <PageHeader
        title="Pharmacy Counter"
        actions={
          onOpenBilling ? (
            <Button size="sm" onClick={() => onOpenBilling()}>
              <Plus />
              New bill
            </Button>
          ) : null
        }
      />
      <section className="flex min-h-[620px] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm xl:min-h-[calc(100vh-196px)]">
        {error || stockError ? (
          <div role="alert" className="shrink-0 border-b border-destructive-border bg-destructive-soft px-4 py-2.5 text-sm font-medium text-destructive-text">
            {error || stockError}
          </div>
        ) : null}

        {queueEmpty ? (
          <EmptyState
            className="flex-1 justify-center"
            icon={ClipboardCheck}
            title={error ? 'Queue unavailable' : 'No prescriptions waiting'}
            description={error ? undefined : 'Prescriptions saved in a visit appear here.'}
            action={
              <Button size="sm" variant="outline" onClick={loadQueue} disabled={savingTask}>
                <RefreshCw />
                Refresh
              </Button>
            }
          />
        ) : (
          <div className="grid min-h-0 flex-1 divide-y divide-border xl:grid-cols-[300px_minmax(0,1fr)] xl:divide-x xl:divide-y-0">
            <QueueList
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
              refreshDisabled={loadingQueue || savingTask}
              onRefresh={loadQueue}
              onSelect={selectQueueEntry}
              onBill={onOpenBilling ? (entry) => onOpenBilling(billingPrefill(entry)) : undefined}
              onShowMore={queuePages * QUEUE_PAGE_SIZE < queueTotal ? () => setQueuePages((pages) => pages + 1) : undefined}
            />
            <DispenseReview
              key={activeEntry?.prescriptionId ?? 'none'}
              activeEntry={activeEntry}
              stockByLine={stockByLine}
              loadingStock={loadingStock}
              setLineAction={updateLineAction}
              onInventoryLinked={onOpenBilling ? async () => setStockReloadKey((key) => key + 1) : undefined}
              activeLifecycle={activeLifecycle}
              reviewedLineCount={reviewedLineCount}
              readyForBilling={readyForBilling}
              reason={reason}
              updateReason={updateReason}
              onOpenBilling={onOpenBilling ? openActiveBilling : undefined}
              onUpdateStatus={updateTaskStatus}
              savingTask={savingTask}
            />
          </div>
        )}
      </section>
    </div>
  );
}

function QueueList({
  queue,
  queueTotal,
  filter,
  statusCounts,
  onFilter,
  activeId,
  loading,
  refreshDisabled,
  onRefresh,
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
  refreshDisabled: boolean;
  onRefresh: () => void;
  onSelect: (entry: QueueEntry) => void;
  onBill?: (entry: QueueEntry) => void;
  onShowMore?: () => void;
}) {
  const countFor = (option: QueueFilter) =>
    statusCounts
      ? option.status
        ? statusCounts[option.status]
        : Object.values(statusCounts).reduce((sum, count) => sum + count, 0)
      : null;
  const allCount = countFor(QUEUE_FILTERS[0]);
  const filters = QUEUE_FILTERS.filter(
    (option) => !option.status || option.id === filter.id || countFor(option) !== 0,
  );
  const filtersNarrowTheList =
    allCount === null ||
    Boolean(filter.status) ||
    filters.some((option) => option.status && (countFor(option) ?? 0) < allCount);

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 px-4 pt-3">
        <h2 className="text-sm font-semibold text-foreground">
          Queue
          <span className="ml-1.5 font-normal tabular-nums text-muted-foreground">{queueTotal}</span>
        </h2>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={onRefresh}
          disabled={refreshDisabled}
          aria-label="Refresh"
        >
          {loading ? <Spinner className="h-4 w-4" /> : <RefreshCw />}
        </Button>
      </div>

      {filtersNarrowTheList ? (
        <div className="flex shrink-0 flex-wrap gap-1 px-4 pt-2">
          {filters.map((option) => {
            const count = countFor(option);
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={filter.id === option.id}
                onClick={() => onFilter(option)}
                className={cn(
                  'rounded-full border border-border px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                  filter.id === option.id
                    ? 'bg-muted text-foreground'
                    : 'bg-card text-muted-foreground hover:text-foreground',
                )}
              >
                {option.label}
                {count === null ? null : (
                  <>
                    {' '}
                    <span className="tabular-nums">{count}</span>
                  </>
                )}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="relative mt-2 min-h-40 flex-1">
        <div className="max-h-72 overflow-y-auto px-2 pb-2 xl:absolute xl:inset-0 xl:max-h-none">
          {loading && queue.length === 0 ? (
            <LoadingSkeleton label="Loading prescription queue…" className="px-2" />
          ) : queue.length === 0 ? (
            <p className="px-2.5 py-2 text-sm text-muted-foreground">No items match this filter.</p>
          ) : (
            <ul aria-label="Prescription queue" className="space-y-0.5">
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
          {queueTotal > queue.length && queue.length > 0 ? (
            <div className="flex items-center justify-between gap-2 px-2.5 pt-2">
              <p className="text-xs text-muted-foreground">
                Showing {queue.length} of {queueTotal}
              </p>
              {onShowMore ? (
                <Button size="sm" variant="ghost" onClick={onShowMore} disabled={loading}>
                  Show more
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
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
  const isLate = entry.isOverTwoHours && entry.status !== 'dispensed';
  const summary = [entry.patient.patientCode, plural(entry.medications.length, 'medicine')]
    .filter(Boolean)
    .join(' · ');
  return (
    <li className={cn('flex items-center gap-1 rounded-md transition-colors hover:bg-muted/60', active && 'bg-muted hover:bg-muted')}>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? 'true' : undefined}
        className="min-w-0 flex-1 rounded-md px-2.5 py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span className="flex items-center justify-between gap-2">
          <span id={nameId} className="truncate text-sm font-medium text-foreground" title={entry.patient.name}>
            {entry.patient.name}
          </span>
          <StatusBadge className="shrink-0" domain="dispense" status={entry.dispenseStatus ?? QUEUE_STATUS_AS_DISPENSE[entry.status]} />
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          {summary}
          {entry.status !== 'dispensed' ? (
            <>
              {' · '}
              <span className={isLate ? 'font-medium text-warning-text' : undefined}>
                {formatAge(entry.pendingHours)}
              </span>
            </>
          ) : null}
        </span>
      </button>
      {onBill ? (
        <Button size="sm" variant="ghost" className="mr-1 shrink-0" aria-describedby={nameId} onClick={onBill}>
          Bill
        </Button>
      ) : null}
    </li>
  );
}

function DispenseReview({
  activeEntry,
  stockByLine,
  loadingStock,
  setLineAction,
  onInventoryLinked,
  activeLifecycle,
  reviewedLineCount,
  readyForBilling,
  reason,
  updateReason,
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
  reason: ReasonDraft;
  updateReason: (change: Partial<Pick<ReasonDraft, 'type' | 'note'>>) => void;
  onOpenBilling?: () => void;
  onUpdateStatus: (status: DispenseTaskStatus) => void;
  savingTask: boolean;
}) {
  const [noteOpen, setNoteOpen] = useState(false);

  if (!activeEntry) {
    return (
      <div className="flex min-h-40 items-center justify-center p-6 text-sm text-muted-foreground">
        Select a prescription
      </div>
    );
  }

  const eligible = activeEntry.dispensingEligible !== false;
  const nextStep = NEXT_STEPS[entryLifecycle(activeEntry)];
  const statusMenu = eligible
    ? STATUS_MENU.filter(
        (item) =>
          item.status !== activeEntry.dispenseStatus &&
          (typeof nextStep !== 'object' || nextStep === null || item.status !== nextStep.status),
      )
    : [];
  const hasNote = Boolean(reason.type || reason.note.trim());

  return (
    <section aria-labelledby="counter-review-patient" className="@container flex min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 pt-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="counter-review-patient" className="truncate text-base font-semibold text-foreground">{activeEntry.patient.name}</h2>
            <StatusBadge domain="dispense" status={activeLifecycle} />
            {activeEntry.linkedInvoiceIds.length > 0 ? <Badge variant="success">Invoiced</Badge> : null}
          </div>
          <div className="flex items-center gap-1">
            <p className="truncate text-xs text-muted-foreground">
              Dr. {activeEntry.doctor.name} · {displayClinicDateTime(activeEntry.createdAt)}
            </p>
            <PurchaseHelp label="Prescription details">
              Prescription {activeEntry.prescriptionId}
            </PurchaseHelp>
          </div>
        </div>
        <p className="text-xs tabular-nums text-muted-foreground">
          {reviewedLineCount}/{activeEntry.medications.length} lines reviewed
        </p>
      </div>

      <div className="mt-1 flex-1">
        <div className={cn('hidden gap-3 border-b border-border px-4 py-2 text-xs font-medium text-muted-foreground @2xl:grid', REVIEW_GRID)}>
          <span>Medicine</span>
          <span>Stock</span>
          <span>Shelf</span>
          <span>Review</span>
        </div>
        <fieldset disabled={savingTask || loadingStock || !eligible} className="contents">
          <div className="divide-y divide-border">
            {activeEntry.medications.map((medication, index) => {
              const stock = stockByLine[medication.sourceLineKey ?? String(index)];
              return (
                <MedicationRow
                  key={`${activeEntry.prescriptionId}-${medication.sourceLineKey || medication.lineId || index}`}
                  medication={medication}
                  stock={stock}
                  loadingStock={loadingStock}
                  action={medication.action || 'pending'}
                  setAction={(action) => setLineAction(medication, action)}
                  inventoryLink={
                    onInventoryLinked && eligible && stock ? (
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
        </fieldset>
      </div>

      <div className="shrink-0 border-t border-border">
        {noteOpen ? (
          <div id="counter-reason" className="grid gap-2 px-4 pt-3 @md:grid-cols-[230px_minmax(0,1fr)]">
            <NativeSelect
              aria-label="Reason"
              className="h-8 w-full"
              value={reason.type ?? ''}
              onChange={(event) => updateReason({ type: event.target.value || null })}
            >
              <option value="">Reason from action</option>
              {reasonOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </NativeSelect>
            <Input
              value={reason.note}
              onChange={(event) => updateReason({ note: event.target.value })}
              placeholder="Note for a substitution, edit or pause"
              aria-label="Pharmacist note"
              className="h-8"
            />
          </div>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            aria-expanded={noteOpen}
            aria-controls="counter-reason"
            onClick={() => setNoteOpen((open) => !open)}
          >
            <MessageSquarePlus />
            {hasNote ? 'Note added' : 'Add note'}
          </Button>
          <div className="flex items-center gap-1.5">
            {statusMenu.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8" aria-label="More status actions" disabled={savingTask}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {statusMenu.map((item) => (
                    <DropdownMenuItem key={item.status} onSelect={() => onUpdateStatus(item.status)}>
                      {item.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            {activeEntry.linkedInvoiceIds.length > 0 ? (
              <Button asChild size="sm" variant="outline">
                <Link href={`/dashboard/pharmacy/invoices?search=${encodeURIComponent(activeEntry.patient.name)}`}>
                  Collect payment
                </Link>
              </Button>
            ) : null}
            {onOpenBilling ? (
              <Button
                size="sm"
                variant={nextStep === 'bill' ? 'default' : 'outline'}
                onClick={onOpenBilling}
                disabled={savingTask || !isBillable(activeEntry)}
              >
                <Receipt />
                Bill
              </Button>
            ) : null}
            {typeof nextStep === 'object' && nextStep !== null ? (
              <Button
                size="sm"
                onClick={() => onUpdateStatus(nextStep.status)}
                disabled={savingTask || !eligible || (nextStep.status === 'READY_TO_BILL' && !readyForBilling)}
              >
                {nextStep.label}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * @cc [owner:nareshshah139,label:product] stock-column-all-prescribed-items
 * Every checked prescription line MUST show its stock status and available quantity with unit.
 * Unlinked quantities MUST be unknown, not zero; no prescribed line may be hidden.
 */
function MedicationRow({
  medication,
  stock,
  loadingStock,
  action,
  setAction,
  inventoryLink,
}: {
  medication: QueueMedication;
  stock?: StockCheckItem;
  loadingStock: boolean;
  action: LineAction;
  setAction: (action: LineAction) => void;
  inventoryLink: ReactNode;
}) {
  const batch = stock?.batches?.[0] || null;
  const alternateBatches = Math.max(0, (stock?.batches?.length ?? 0) - 1);
  const regimen = [
    prescriptionAmount('dosageUnit', medication.dosage, medication.dosageUnit),
    prescriptionLabel('frequency', medication.frequency),
    prescriptionAmount('durationUnit', medication.duration, medication.durationUnit),
  ]
    .filter(Boolean)
    .join(' · ');
  const stockName = stock && isLinked(stock) ? stockCheckLineName(stock) : null;
  const showStockName = stockName !== null && stockName.toLowerCase() !== medication.drugName.toLowerCase();
  const pick =
    medication.prescribedQuantity === null
      ? 'Review qty'
      : `Pick ${Math.max(0, medication.prescribedQuantity - medication.dispensedQuantity)}`;
  const warnings = stock ? stockWarnings(stock) : [];
  const batchLine = batch
    ? [
        batch.batchNumber,
        batch.expiryDate ? `exp ${displayUtcDate(batch.expiryDate)}` : null,
        alternateBatches > 0 ? `+${alternateBatches} more` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';
  const exception = EXCEPTION_ACTIONS.find((option) => option.value === action);

  return (
    <div role="group" aria-label={medication.drugName} className={cn('grid gap-x-3 gap-y-2 px-4 py-2.5 @2xl:items-center', REVIEW_GRID)}>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{medication.drugName}</p>
        <p className="truncate text-xs text-muted-foreground">{regimen || 'Dose not specified'}</p>
        {showStockName || inventoryLink ? (
          <div className="flex min-w-0 items-center text-xs text-muted-foreground">
            {showStockName ? (
              <span className="truncate">
                Stock item <span>{stockName}</span>
              </span>
            ) : null}
            {inventoryLink}
          </div>
        ) : null}
      </div>

      <div className="min-w-0">
        {stock ? (
          <StatusBadge domain="stock" status={stock.stockStatus} />
        ) : (
          <Badge variant="neutral">{loadingStock ? 'Checking' : 'Not checked'}</Badge>
        )}
        <p className="mt-1 truncate text-xs tabular-nums text-muted-foreground">
          {pick}
          {stock ? (
            <>
              {' · '}
              <span>{availableText(stock)}</span>
            </>
          ) : null}
        </p>
        {warnings.length > 0 ? (
          <p className="truncate text-xs font-medium text-warning-text">{warnings.join(' · ')}</p>
        ) : null}
      </div>

      <div className="min-w-0">
        {batch ? (
          <>
            <p className="truncate text-sm text-foreground">{batch.storageLocation || 'Unmapped shelf'}</p>
            {batchLine ? <p className="text-xs text-muted-foreground">{batchLine}</p> : null}
          </>
        ) : stock ? (
          <p className="text-xs text-muted-foreground">No batch</p>
        ) : null}
      </div>

      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setAction('accepted')}
          className={cn(
            action === 'accepted' &&
              'border-success-border bg-success-soft text-success-text hover:bg-success-soft hover:text-success-text',
          )}
        >
          {action === 'accepted' ? <Check /> : null}
          {action === 'accepted' ? 'Accepted' : 'Accept'}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant={exception ? 'outline' : 'ghost'}
              aria-label={
                exception
                  ? `${exception.label}. Change review for ${medication.drugName}`
                  : `Other review options for ${medication.drugName}`
              }
              className={cn(
                exception
                  ? 'border-warning-border bg-warning-soft text-warning-text hover:bg-warning-soft hover:text-warning-text'
                  : 'px-2',
              )}
            >
              {exception ? exception.label : <MoreHorizontal />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup value={action} onValueChange={(value: string) => setAction(value as LineAction)}>
              {EXCEPTION_ACTIONS.map((option) => (
                <DropdownMenuRadioItem key={option.value} value={option.value}>
                  {option.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

const REVIEW_GRID = '@2xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)_minmax(0,1.1fr)_190px]';

type NextStep = { label: string; status: DispenseTaskStatus } | 'bill' | null;

const READY_STEP: NextStep = { label: 'Ready to bill', status: 'READY_TO_BILL' };

const NEXT_STEPS: Record<DispenseLifecycle, NextStep> = {
  Queued: READY_STEP,
  'In Review': READY_STEP,
  'Partially Filled': READY_STEP,
  Paused: READY_STEP,
  'Ready to Bill': 'bill',
  Paid: null,
  Dispensed: null,
  Cancelled: null,
};

const STATUS_MENU: Array<{ label: string; status: DispenseTaskStatus }> = [
  { label: 'Pause', status: 'PAUSED' },
  { label: 'Mark paid', status: 'PAID' },
];

const EXCEPTION_ACTIONS: Array<{ value: LineAction; label: string }> = [
  { value: 'substitute', label: 'Substitute' },
  { value: 'edit', label: 'Edit' },
  { value: 'unavailable', label: 'Unavailable' },
];

const isLinked = (stock: StockCheckItem) => stock.stockStatus !== 'UNMATCHED';

const stockQuantity = (stock: StockCheckItem) =>
  isLinked(stock) ? `${stock.totalNonExpiredStock}${stock.unit ? ` ${stock.unit.toLowerCase()}` : ''}` : '—';

const availableText = (stock: StockCheckItem) =>
  isLinked(stock) ? `${stockQuantity(stock)} available` : stockQuantity(stock);

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

function entryLifecycle(entry: QueueEntry): DispenseLifecycle {
  return lifecycleFromTaskStatus(entry.dispenseStatus ?? QUEUE_STATUS_AS_DISPENSE[entry.status]);
}

function deriveLifecycle(entry: QueueEntry, readyForBilling: boolean): DispenseLifecycle {
  if (entry.dispenseStatus || entry.status !== 'pending') return entryLifecycle(entry);
  return readyForBilling ? 'Ready to Bill' : 'In Review';
}

function lifecycleFromTaskStatus(status: DispenseTaskStatus): DispenseLifecycle {
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
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  return `${hours.toFixed(1)}h`;
}
