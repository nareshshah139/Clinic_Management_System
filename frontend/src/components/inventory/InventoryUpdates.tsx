'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  ClipboardCheck,
  Loader2,
  RefreshCw,
  Search,
  Send,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Textarea } from '@/components/ui/textarea';
import { useDashboardUser } from '@/components/layout/dashboard-user-context';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/lib/api';
import type {
  DrugInventoryCatalogRow,
  DrugInventoryChangeRequest,
} from '@/lib/types';

type DraftEdit = {
  proposedPrice?: string;
  proposedStock?: string;
  reason: string;
};

type ApprovalDialogState = {
  request: DrugInventoryChangeRequest;
  action: 'approve' | 'reject';
} | null;

const PAGE_SIZE = 50;

export function InventoryUpdates() {
  const { user } = useDashboardUser();
  const { toast } = useToast();
  const [drugs, setDrugs] = useState<DrugInventoryCatalogRow[]>([]);
  const [pendingRequests, setPendingRequests] = useState<
    DrugInventoryChangeRequest[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogPages, setCatalogPages] = useState(1);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, DraftEdit>>({});
  const [approvalDialog, setApprovalDialog] = useState<ApprovalDialogState>(null);
  const [reviewNote, setReviewNote] = useState('');

  const canApprove =
    user?.role === 'DOCTOR' || user?.role === 'ADMIN' || user?.role === 'OWNER';
  const canSubmit =
    user?.role === 'PHARMACIST' ||
    user?.role === 'ADMIN' ||
    user?.role === 'OWNER';

  const pendingByDrugId = useMemo(() => {
    return new Map(
      pendingRequests
        .filter((request) => request.status === 'PENDING')
        .map((request) => [request.drugId, request]),
    );
  }, [pendingRequests]);

  const draftChanges = useMemo(() => {
    return drugs
      .map((drug) => {
        const draft = drafts[drug.id];
        if (!draft) return null;
        const priceValue = draft.proposedPrice?.trim();
        const stockValue = draft.proposedStock?.trim();
        const proposedPrice =
          priceValue === undefined || priceValue === ''
            ? undefined
            : Number(priceValue);
        const proposedStock =
          stockValue === undefined || stockValue === ''
            ? undefined
            : Number(stockValue);
        const hasValidPrice =
          proposedPrice !== undefined &&
          Number.isFinite(proposedPrice) &&
          proposedPrice >= 0 &&
          proposedPrice !== drug.price;
        const currentStock = drug.totalStock ?? 0;
        const hasValidStock =
          proposedStock !== undefined &&
          Number.isInteger(proposedStock) &&
          proposedStock >= 0 &&
          proposedStock !== currentStock &&
          Boolean(drug.primaryInventoryItemId);

        if (!hasValidPrice && !hasValidStock) {
          return null;
        }
        return {
          drug,
          proposedPrice: hasValidPrice ? proposedPrice : undefined,
          proposedStock: hasValidStock ? proposedStock : undefined,
          reason: draft.reason.trim(),
        };
      })
      .filter(Boolean) as Array<{
      drug: DrugInventoryCatalogRow;
      proposedPrice?: number;
      proposedStock?: number;
      reason: string;
    }>;
  }, [drafts, drugs]);

  const fetchCatalog = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiClient.getDrugInventoryCatalog({
        page: catalogPage,
        limit: PAGE_SIZE,
        search: debouncedSearchTerm || undefined,
        isActive: true,
        includeDiscontinued: false,
        sortBy: 'name',
        sortOrder: 'asc',
      });
      setDrugs(Array.isArray(response.data) ? response.data : []);
      setCatalogPages(response.pagination?.pages || 1);
      setCatalogTotal(response.pagination?.total || response.data?.length || 0);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Catalog unavailable',
        description: getApiErrorMessage(error, 'Failed to load drugs.'),
      });
      setDrugs([]);
      setCatalogPages(1);
      setCatalogTotal(0);
    } finally {
      setLoading(false);
    }
  }, [catalogPage, debouncedSearchTerm, toast]);

  const fetchPendingRequests = useCallback(async () => {
    try {
      setRequestsLoading(true);
      const response = await apiClient.getDrugInventoryChangeRequests({
        status: 'PENDING',
        limit: 100,
      });
      setPendingRequests(response.data || []);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Approval queue unavailable',
        description: getApiErrorMessage(error, 'Failed to load inventory requests.'),
      });
      setPendingRequests([]);
    } finally {
      setRequestsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setCatalogPage(1);
      setDebouncedSearchTerm(searchTerm);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    void fetchCatalog();
  }, [fetchCatalog]);

  useEffect(() => {
    void fetchPendingRequests();
  }, [fetchPendingRequests]);

  const refreshAll = async () => {
    await Promise.all([fetchCatalog(), fetchPendingRequests()]);
  };

  const normalizeDraft = (drug: DrugInventoryCatalogRow, draft: DraftEdit) => {
    const priceText = draft.proposedPrice?.trim() || '';
    const stockText = draft.proposedStock?.trim() || '';
    const priceNumber = priceText === '' ? undefined : Number(priceText);
    const stockNumber = stockText === '' ? undefined : Number(stockText);
    const priceChanged =
      priceText !== '' && Number.isFinite(priceNumber) && priceNumber !== drug.price;
    const stockChanged =
      stockText !== '' &&
      Number.isFinite(stockNumber) &&
      stockNumber !== (drug.totalStock ?? 0);
    return priceChanged || stockChanged || draft.reason.trim() ? draft : null;
  };

  const setDraftPrice = (drug: DrugInventoryCatalogRow, proposedPrice: string) => {
    setDrafts((current) => {
      const next = { ...current };
      const draft = normalizeDraft(drug, {
        proposedPrice,
        proposedStock: next[drug.id]?.proposedStock,
        reason: next[drug.id]?.reason || '',
      });
      if (!draft) {
        delete next[drug.id];
      } else {
        next[drug.id] = draft;
      }
      return next;
    });
  };

  const setDraftStock = (drug: DrugInventoryCatalogRow, proposedStock: string) => {
    setDrafts((current) => {
      const next = { ...current };
      const draft = normalizeDraft(drug, {
        proposedPrice: next[drug.id]?.proposedPrice,
        proposedStock,
        reason: next[drug.id]?.reason || '',
      });
      if (!draft) {
        delete next[drug.id];
      } else {
        next[drug.id] = draft;
      }
      return next;
    });
  };

  const setDraftReason = (drug: DrugInventoryCatalogRow, reason: string) => {
    setDrafts((current) => {
      const next = { ...current };
      const draft = normalizeDraft(drug, {
        proposedPrice: next[drug.id]?.proposedPrice,
        proposedStock: next[drug.id]?.proposedStock,
        reason,
      });
      if (!draft) {
        delete next[drug.id];
      } else {
        next[drug.id] = draft;
      }
      return next;
    });
  };

  const clearDraft = (drugId: string) => {
    setDrafts((current) => {
      const next = { ...current };
      delete next[drugId];
      return next;
    });
  };

  const submitDrafts = async () => {
    if (draftChanges.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No valid edits',
        description: 'Change at least one price or stock value before submitting.',
      });
      return;
    }

    const blocked = draftChanges.filter(({ drug }) => pendingByDrugId.has(drug.id));
    if (blocked.length > 0) {
      toast({
        variant: 'destructive',
        title: 'Pending request exists',
        description: `Clear rows already awaiting approval: ${blocked
          .map(({ drug }) => drug.name)
          .join(', ')}`,
      });
      return;
    }

    try {
      setSubmitting(true);
      const response = await apiClient.submitDrugInventoryChanges(
        draftChanges.map(({ drug, proposedPrice, proposedStock, reason }) => ({
          drugId: drug.id,
          inventoryItemId:
            proposedStock !== undefined
              ? drug.primaryInventoryItemId || undefined
              : undefined,
          proposedPrice,
          proposedStock,
          reason: reason || undefined,
        })),
      );
      toast({
        title: 'Submitted for approval',
        description: `${response.summary.submitted} inventory change${
          response.summary.submitted === 1 ? '' : 's'
        } sent to the doctor queue.`,
      });
      setDrafts({});
      await refreshAll();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Submission failed',
        description: getApiErrorMessage(error, 'Failed to submit inventory edits.'),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const openReview = (
    request: DrugInventoryChangeRequest,
    action: 'approve' | 'reject',
  ) => {
    setApprovalDialog({ request, action });
    setReviewNote('');
  };

  const submitReview = async () => {
    if (!approvalDialog) return;
    const { request, action } = approvalDialog;
    try {
      setReviewingId(request.id);
      if (action === 'approve') {
        await apiClient.approveDrugInventoryChangeRequest(request.id, reviewNote);
      } else {
        await apiClient.rejectDrugInventoryChangeRequest(request.id, reviewNote);
      }
      toast({
        title: action === 'approve' ? 'Inventory change approved' : 'Inventory change rejected',
        description:
          action === 'approve'
            ? `${request.drug.name} was updated.`
            : `${request.drug.name} request closed.`,
      });
      setApprovalDialog(null);
      setReviewNote('');
      await refreshAll();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Review failed',
        description: getApiErrorMessage(error, 'Failed to review request.'),
      });
    } finally {
      setReviewingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-[8px] bg-emerald-100 text-emerald-800">
              <ClipboardCheck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-slate-950">
                Inventory Updates
              </h1>
              <p className="text-sm text-slate-600">
                Drug prices and stock edits with doctor approval.
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-72">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              className="pl-9"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search drug, manufacturer, salt"
            />
          </div>
          <Button variant="outline" onClick={refreshAll} disabled={loading}>
            <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            Refresh
          </Button>
          {canSubmit && (
            <Button
              onClick={submitDrafts}
              disabled={submitting || draftChanges.length === 0}
              className="min-w-36"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Submit {draftChanges.length || ''}
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_410px]">
        <section className="min-w-0 rounded-[8px] border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-slate-950">Drug inventory catalog</p>
              <p className="text-sm text-slate-600">
                {catalogTotal.toLocaleString()} active drug
                {catalogTotal === 1 ? '' : 's'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">
                {draftChanges.length} draft
                {draftChanges.length === 1 ? '' : 's'}
              </Badge>
              <Badge variant="secondary">
                {pendingRequests.length} pending
              </Badge>
            </div>
          </div>

          <div className="max-h-[62vh] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-slate-50">
                <TableRow>
                  <TableHead className="min-w-[260px] px-4">Drug</TableHead>
                  <TableHead className="min-w-32">Price</TableHead>
                  <TableHead className="min-w-40">New Price</TableHead>
                  <TableHead className="min-w-28">Stock</TableHead>
                  <TableHead className="min-w-36">New Stock</TableHead>
                  <TableHead className="min-w-[220px]">Reason</TableHead>
                  <TableHead className="w-28 text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-36 text-center">
                      <span className="inline-flex items-center gap-2 text-sm text-slate-600">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading catalog
                      </span>
                    </TableCell>
                  </TableRow>
                ) : drugs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-36 text-center text-sm text-slate-600">
                      No drugs found
                    </TableCell>
                  </TableRow>
                ) : (
                  drugs.map((drug) => {
                    const pending = pendingByDrugId.get(drug.id);
                    const draft = drafts[drug.id];
                    const disabled = Boolean(pending) || !canSubmit;
                    const currentStock = drug.totalStock ?? 0;
                    const proposedPriceValue =
                      draft?.proposedPrice ??
                      (pending?.proposedPrice !== null &&
                      pending?.proposedPrice !== undefined
                        ? String(pending.proposedPrice)
                        : String(drug.price));
                    const proposedStockValue =
                      draft?.proposedStock ??
                      (pending?.proposedStock !== null &&
                      pending?.proposedStock !== undefined
                        ? String(pending.proposedStock)
                        : drug.primaryInventoryItemId
                          ? String(currentStock)
                          : '');
                    return (
                      <TableRow key={drug.id}>
                        <TableCell className="px-4">
                          <div className="min-w-0">
                            <p className="max-w-[320px] truncate font-medium text-slate-950">
                              {drug.name}
                            </p>
                            <p className="max-w-[320px] truncate text-xs text-slate-600">
                              {drug.manufacturerName} · {drug.packSizeLabel}
                            </p>
                            <p className="max-w-[320px] truncate text-xs text-slate-500">
                              {[drug.category, drug.dosageForm, drug.strength]
                                .filter(Boolean)
                                .join(' · ') || 'Uncategorized'}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">
                          {formatCurrency(drug.price)}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.01"
                            disabled={disabled}
                            value={proposedPriceValue}
                            onChange={(event) =>
                              setDraftPrice(drug, event.target.value)
                            }
                            className="h-9 w-32"
                          />
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium text-slate-950">
                              {currentStock.toLocaleString('en-IN')}
                            </p>
                            <p className="text-xs text-slate-500">
                              {drug.primaryStockStatus || 'No stock row'}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            inputMode="numeric"
                            min="0"
                            step="1"
                            disabled={disabled || !drug.primaryInventoryItemId}
                            value={proposedStockValue}
                            onChange={(event) =>
                              setDraftStock(drug, event.target.value)
                            }
                            className="h-9 w-28"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            disabled={disabled}
                            value={draft?.reason ?? pending?.reason ?? ''}
                            onChange={(event) =>
                              setDraftReason(drug, event.target.value)
                            }
                            placeholder="Invoice or shelf count"
                            className="h-9 min-w-52"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          {pending ? (
                            <Badge variant="secondary">Pending</Badge>
                          ) : draft ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => clearDraft(drug.id)}
                            >
                              <X className="h-4 w-4" />
                              Clear
                            </Button>
                          ) : (
                            <Badge variant="outline">Current</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
            <p className="text-sm text-slate-600">
              Page {catalogPage} of {catalogPages}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={catalogPage <= 1 || loading}
                onClick={() => setCatalogPage((page) => Math.max(1, page - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={catalogPage >= catalogPages || loading}
                onClick={() =>
                  setCatalogPage((page) => Math.min(catalogPages, page + 1))
                }
              >
                Next
              </Button>
            </div>
          </div>
        </section>

        <section className="rounded-[8px] border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <p className="font-semibold text-slate-950">Approval queue</p>
              <p className="text-sm text-slate-600">
                {pendingRequests.length} pending request
                {pendingRequests.length === 1 ? '' : 's'}
              </p>
            </div>
            <ClipboardCheck className="h-5 w-5 text-slate-500" />
          </div>
          <div className="max-h-[62vh] overflow-auto p-3">
            {requestsLoading ? (
              <div className="flex h-36 items-center justify-center gap-2 text-sm text-slate-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading queue
              </div>
            ) : pendingRequests.length === 0 ? (
              <div className="flex h-36 items-center justify-center rounded-[8px] border border-dashed border-slate-200 text-sm text-slate-600">
                No pending inventory changes
              </div>
            ) : (
              <div className="space-y-3">
                {pendingRequests.map((request) => (
                  <div
                    key={request.id}
                    className="rounded-[8px] border border-slate-200 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-950">
                          {request.drug.name}
                        </p>
                        <p className="truncate text-xs text-slate-600">
                          {request.drug.manufacturerName} ·{' '}
                          {request.drug.packSizeLabel}
                        </p>
                      </div>
                      <Badge variant="secondary">Pending</Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      {request.proposedPrice !== null &&
                        request.proposedPrice !== undefined && (
                          <ChangeMetric
                            label="Price"
                            current={formatCurrency(request.currentPrice || 0)}
                            proposed={formatCurrency(request.proposedPrice)}
                          />
                        )}
                      {request.proposedStock !== null &&
                        request.proposedStock !== undefined && (
                          <ChangeMetric
                            label="Stock"
                            current={`${request.currentStock ?? 0}`}
                            proposed={`${request.proposedStock}`}
                          />
                        )}
                    </div>
                    {request.reason && (
                      <p className="mt-3 rounded-[8px] bg-slate-50 px-3 py-2 text-sm text-slate-700">
                        {request.reason}
                      </p>
                    )}
                    <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500">
                      <span>{staffName(request.requestedBy)}</span>
                      <span>{formatDate(request.createdAt)}</span>
                    </div>
                    {canApprove && (
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={reviewingId === request.id}
                          onClick={() => openReview(request, 'reject')}
                        >
                          <X className="h-4 w-4" />
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          disabled={reviewingId === request.id}
                          onClick={() => openReview(request, 'approve')}
                        >
                          <Check className="h-4 w-4" />
                          Approve
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      <Dialog
        open={Boolean(approvalDialog)}
        onOpenChange={(open: boolean) => {
          if (!open) {
            setApprovalDialog(null);
            setReviewNote('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {approvalDialog?.action === 'approve'
                ? 'Approve inventory change'
                : 'Reject inventory change'}
            </DialogTitle>
          </DialogHeader>
          {approvalDialog && (
            <div className="space-y-4">
              <div className="rounded-[8px] border border-slate-200 p-3">
                <p className="font-medium text-slate-950">
                  {approvalDialog.request.drug.name}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {changeSummary(approvalDialog.request)}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="review-note">Review note</Label>
                <Textarea
                  id="review-note"
                  value={reviewNote}
                  onChange={(event) => setReviewNote(event.target.value)}
                  placeholder="Optional note"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setApprovalDialog(null);
                setReviewNote('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant={
                approvalDialog?.action === 'reject' ? 'destructive' : 'default'
              }
              onClick={submitReview}
              disabled={Boolean(reviewingId)}
            >
              {reviewingId ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : approvalDialog?.action === 'approve' ? (
                <Check className="h-4 w-4" />
              ) : (
                <X className="h-4 w-4" />
              )}
              {approvalDialog?.action === 'approve' ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ChangeMetric({
  label,
  current,
  proposed,
}: {
  label: string;
  current: string;
  proposed: string;
}) {
  return (
    <div className="rounded-[8px] bg-slate-50 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="font-semibold text-slate-950">
        {current} to {proposed}
      </p>
    </div>
  );
}

function changeSummary(request: DrugInventoryChangeRequest) {
  const parts: string[] = [];
  if (request.proposedPrice !== null && request.proposedPrice !== undefined) {
    parts.push(
      `Price ${formatCurrency(request.currentPrice || 0)} to ${formatCurrency(
        request.proposedPrice,
      )}`,
    );
  }
  if (request.proposedStock !== null && request.proposedStock !== undefined) {
    parts.push(`Stock ${request.currentStock ?? 0} to ${request.proposedStock}`);
  }
  return parts.join(' · ');
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function staffName(staff?: { firstName?: string; lastName?: string; role?: string }) {
  const name = `${staff?.firstName || ''} ${staff?.lastName || ''}`.trim();
  return name || staff?.role || 'Staff';
}

function getApiErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'body' in error) {
    const body = (error as { body?: { message?: string | string[] } }).body;
    if (Array.isArray(body?.message)) return body.message.join(', ');
    if (typeof body?.message === 'string') return body.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
