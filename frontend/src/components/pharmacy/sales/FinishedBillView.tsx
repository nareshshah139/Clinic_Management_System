'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { History, Percent, Printer, RotateCcw, Undo2 } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { getErrorMessage } from '@/lib/utils';
import { displayClinicDate, displayClinicDateTime } from '@/lib/date-display';
import { formatRupees, printHtml, renderPharmacyInvoiceHtml } from '@/lib/pharmacy-invoice-print';
import type { BillDiscount } from '@/lib/bill-pricing';
import { billNumberLabel, isIssuedBillNumber } from '@/lib/bill-number';
import { toast } from '@/hooks/use-toast';
import { requestKey } from '@/components/inventory/workspace-model';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingSkeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { BillDiscountInput } from './BillDiscountInput';
import {
  clinicOf,
  lineName,
  previewDiscount,
  revisionRequest,
  settlementOf,
  storedDiscount,
  type FinishedBill,
} from './finished-bill-model';

const POSTED = new Set(['CONFIRMED', 'DISPENSED', 'COMPLETED']);
const REFUND_METHODS = [
  ['CASH', 'Cash'],
  ['UPI', 'UPI'],
  ['CARD', 'Card'],
  ['NETBANKING', 'Net banking'],
  ['WALLET', 'Wallet'],
] as const;
const METHOD_LABEL: Record<string, string> = Object.fromEntries([...REFUND_METHODS, ['INSURANCE', 'Insurance']]);

type Load = { status: 'loading' } | { status: 'ready'; bill: FinishedBill } | { status: 'missing' } | { status: 'error'; message: string };
type Refusal = { status: number; message: string };

const refusalOf = (error: unknown): Refusal | null => {
  const status = (error as { status?: number })?.status;
  const message = (error as { body?: { message?: unknown } })?.body?.message;
  if (!status || ![400, 403, 404, 409].includes(status)) return null;
  return { status, message: typeof message === 'string' ? message : Array.isArray(message) ? message.join(' ') : getErrorMessage(error) };
};

const personName = (person: { firstName: string; lastName: string } | null) => (person ? `${person.firstName} ${person.lastName}`.trim() : 'Someone');

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: 'good' | 'warn' }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${strong ? 'text-lg font-semibold' : ''} ${tone === 'good' ? 'text-success-text' : tone === 'warn' ? 'font-semibold text-warning-text' : ''}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function EditDiscountDialog({ bill, open, onOpenChange, onSaved, onReload }: {
  bill: FinishedBill;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (bill: FinishedBill) => void;
  onReload: () => void;
}) {
  const reasonId = useId();
  const [billDiscount, setBillDiscount] = useState<BillDiscount | null>(storedDiscount(bill));
  const [lineText, setLineText] = useState<Record<string, string>>(() => Object.fromEntries(bill.items.map((line) => [line.id, String(line.discountPercent)])));
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const lineDiscounts = Object.fromEntries(Object.entries(lineText).map(([id, text]) => [id, text.trim() === '' ? 0 : Number(text)]));
  const preview = previewDiscount(bill, { billDiscount, lineDiscounts });
  const ready = preview.ok && preview.changed && reason.trim().length > 0 && !saving;

  const save = async () => {
    if (!ready) return;
    setSaving(true);
    setRefusal(null);
    try {
      const saved = await apiClient.patch<FinishedBill>(`/pharmacy/invoices/${encodeURIComponent(bill.id)}/discount`, revisionRequest(bill, { billDiscount, lineDiscounts }, reason));
      onSaved(saved);
      toast({ title: 'Discount changed', description: `${bill.invoiceNumber} is now ${formatRupees(saved.totalAmount)}.` });
    } catch (error) {
      const refused = refusalOf(error);
      if (refused) setRefusal(refused);
      else toast({ variant: 'destructive', title: 'Discount not changed', description: getErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next: boolean) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="pr-6">Edit discount on {bill.invoiceNumber}</DialogTitle>
          <DialogDescription>Only discounts change. Items, quantities, batches and stock stay as billed, and the bill keeps its number.</DialogDescription>
        </DialogHeader>
        {refusal && (
          <div role="alert" className="space-y-2 rounded-md border border-destructive-border bg-destructive-soft p-3 text-sm text-destructive-text">
            <p className="font-semibold">Discount not changed</p>
            <p>{refusal.message}</p>
            {refusal.status === 409 && /changed after you opened it|changed while saving/.test(refusal.message) && (
              <Button type="button" size="sm" variant="outline" onClick={onReload}>
                <RotateCcw aria-hidden="true" /> Reload bill
              </Button>
            )}
          </div>
        )}
        <fieldset className="min-w-0 space-y-2">
          <legend className="text-sm font-medium">Item discount %</legend>
          {bill.items.map((line, index) => (
            <div key={line.id} className="flex min-w-0 items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{lineName(line)}</div>
                <div className="text-xs text-muted-foreground tabular-nums">
                  {line.quantity} × {formatRupees(line.unitPrice)} · {line.taxPercent}% GST
                  {preview.ok ? ` · ${formatRupees(preview.price.lines[index].total)}` : ''}
                </div>
              </div>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                step="0.01"
                aria-label={`Discount % for ${lineName(line)}`}
                value={lineText[line.id]}
                onChange={(event) => setLineText((current) => ({ ...current, [line.id]: event.target.value }))}
                className="w-24 shrink-0 text-right tabular-nums"
              />
            </div>
          ))}
        </fieldset>
        <BillDiscountInput value={billDiscount} onChange={setBillDiscount} problem={preview.ok ? null : preview.problem} disabled={saving} />
        {preview.ok && (
          <dl className="space-y-1 rounded-md bg-muted p-3 text-sm">
            <Row label="Total now" value={formatRupees(bill.totalAmount)} />
            <Row label="Total after change" value={formatRupees(preview.price.total)} strong />
            {preview.settlement.refundDue > 0 && <Row label="Refund due after saving" value={formatRupees(preview.settlement.refundDue)} tone="warn" />}
            {preview.settlement.due > 0 && <Row label="Still to collect" value={formatRupees(preview.settlement.due)} tone="warn" />}
          </dl>
        )}
        <div className="space-y-1.5">
          <Label htmlFor={reasonId}>Reason *</Label>
          <Textarea id={reasonId} value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder="For example: senior citizen discount agreed by the doctor" rows={2} />
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={() => void save()} disabled={!ready} aria-describedby={`${reasonId}-why`}>
            {saving ? 'Saving…' : 'Save discount'}
          </Button>
        </DialogFooter>
        {!ready && !saving && (
          <p id={`${reasonId}-why`} className="text-right text-xs text-muted-foreground">
            {!preview.ok ? 'Fix the discount first.' : !preview.changed ? 'Change a discount to save.' : 'Enter a reason to save.'}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RecordRefundDialog({ bill, amount, open, onOpenChange, onSaved }: {
  bill: FinishedBill;
  amount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [key] = useState(requestKey);
  const [method, setMethod] = useState('CASH');
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const referenceId = useId();

  const save = async () => {
    setSaving(true);
    setProblem(null);
    try {
      await apiClient.post(`/pharmacy/invoices/${encodeURIComponent(bill.id)}/refunds`, {
        requestKey: key,
        amount,
        method,
        ...(reference.trim() ? { reference: reference.trim() } : {}),
      });
      toast({ title: 'Refund recorded', description: `${formatRupees(amount)} paid back by ${METHOD_LABEL[method]} on ${bill.invoiceNumber}.` });
      onSaved();
    } catch (error) {
      setProblem(refusalOf(error)?.message ?? getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next: boolean) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="pr-6">Record refund of {formatRupees(amount)}</DialogTitle>
          <DialogDescription>
            {bill.billingName || 'The patient'} paid more than the revised total of {bill.invoiceNumber}. Record the money you hand back.
          </DialogDescription>
        </DialogHeader>
        {problem && <p role="alert" className="rounded-md border border-destructive-border bg-destructive-soft p-3 text-sm text-destructive-text">{problem}</p>}
        <div className="space-y-1.5">
          <Label>Paid back by</Label>
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger aria-label="Paid back by"><SelectValue /></SelectTrigger>
            <SelectContent>
              {REFUND_METHODS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={referenceId}>Reference (optional)</Label>
          <Input id={referenceId} value={reference} maxLength={200} onChange={(event) => setReference(event.target.value)} placeholder="UPI or card reference" />
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={() => void save()} disabled={saving}>{saving ? 'Recording…' : `Record refund ${formatRupees(amount)}`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * @cc [owner:nareshshah139,label:product] finished-bill-view
 * A finished bill MUST show its revised amounts, every discount change with who, when, why and the old
 * and new totals, and what the ledger owes either way. Money taken above the total MUST show as a refund
 * due with an explicit Record refund action; Edit discount MUST NOT offer item, quantity or price changes.
 */
export function FinishedBillView({ id, notice, startEditing }: { id: string; notice?: string; startEditing?: boolean }) {
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [editing, setEditing] = useState(false);
  const [editKey, setEditKey] = useState(0);
  const [refunding, setRefunding] = useState(false);
  const autoOpened = useRef(false);

  const fetchBill = useCallback(async () => {
    try {
      const bill = await apiClient.get<FinishedBill>(`/pharmacy/invoices/${encodeURIComponent(id)}`);
      setLoad({ status: 'ready', bill });
      return bill;
    } catch (error) {
      setLoad((error as { status?: number })?.status === 404 ? { status: 'missing' } : { status: 'error', message: getErrorMessage(error) });
      return null;
    }
  }, [id]);

  useEffect(() => {
    void fetchBill();
  }, [fetchBill]);

  useEffect(() => {
    if (load.status !== 'ready' || !startEditing || autoOpened.current) return;
    autoOpened.current = true;
    if (POSTED.has(load.bill.status)) setEditing(true);
  }, [load, startEditing]);

  if (load.status === 'loading') return <LoadingSkeleton variant="cards" label="Loading bill…" />;
  if (load.status === 'missing') return <Card><EmptyState title="This bill no longer exists" description="The link is out of date. Find the bill in Sales." /></Card>;
  if (load.status === 'error')
    return (
      <Card>
        <EmptyState title="Could not open the bill" description={`${load.message}. Check your connection and try again.`} action={<Button onClick={() => void fetchBill()}>Try again</Button>} />
      </Card>
    );

  const { bill } = load;
  const editable = POSTED.has(bill.status);
  const issued = isIssuedBillNumber(bill.invoiceNumber);
  const { paid, due, refundDue } = settlementOf(bill);
  const lineDiscount = bill.discountAmount - bill.billDiscountAmount;
  const reload = async () => {
    setEditing(false);
    const fresh = await fetchBill();
    if (fresh) setEditKey((key) => key + 1);
  };
  const print = async () => {
    try {
      await printHtml(renderPharmacyInvoiceHtml(bill, clinicOf(bill)));
    } catch {
      toast({ variant: 'destructive', title: 'Could not print', description: 'Try again.' });
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {notice && <p role="status" className="rounded-md border border-info-border bg-info-soft p-3 text-sm text-info-text">{notice}</p>}
      <Card>
        <CardHeader className="gap-2">
          <CardTitle className="flex flex-wrap items-center gap-2 text-xl">
            <span>{issued ? `Bill ${bill.invoiceNumber}` : billNumberLabel(bill)}</span>
            {bill.status === 'CANCELLED' ? (
              <Badge variant="danger">Cancelled</Badge>
            ) : refundDue > 0 ? (
              <Badge variant="warning">Refund due {formatRupees(refundDue)}</Badge>
            ) : due > 0 ? (
              <Badge variant="danger">Due {formatRupees(due)}</Badge>
            ) : (
              <Badge variant="success">Paid</Badge>
            )}
            {bill.revisedAt && <Badge variant="info">Revised {displayClinicDate(bill.revisedAt)}</Badge>}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {displayClinicDate(bill.invoiceDate)} · {bill.billingName || bill.patient?.name || 'Walk-in'}
            {bill.billingPhone ? ` · ${bill.billingPhone}` : ''}
            {bill.doctor ? ` · Dr. ${personName(bill.doctor)}` : ''}
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {issued && (
              <Button type="button" variant="outline" onClick={() => void print()}>
                <Printer aria-hidden="true" /> Print
              </Button>
            )}
            {editable && (
              <Button type="button" variant="outline" onClick={() => setEditing(true)}>
                <Percent aria-hidden="true" /> Edit discount
              </Button>
            )}
            {refundDue > 0 && (
              <Button type="button" onClick={() => setRefunding(true)}>
                <Undo2 aria-hidden="true" /> Record refund {formatRupees(refundDue)}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {refundDue > 0 && (
            <p role="status" className="rounded-md border border-warning-border bg-warning-soft p-3 text-sm text-warning-text">
              {formatRupees(paid)} was taken, {formatRupees(refundDue)} more than the bill total of {formatRupees(bill.totalAmount)}. Hand it back and record the refund.
            </p>
          )}
          <ul className="divide-y rounded-md border" aria-label="Items">
            {bill.items.map((line) => (
              <li key={line.id} className="flex min-w-0 items-start justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="font-medium [overflow-wrap:anywhere]">{lineName(line)}</div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {line.quantity} × {formatRupees(line.unitPrice)}
                    {line.discountPercent ? ` · ${line.discountPercent}% off` : ''}
                    {line.billDiscountAmount ? ` · bill discount ${formatRupees(line.billDiscountAmount)}` : ''} · {line.taxPercent}% GST
                  </div>
                </div>
                <div className="shrink-0 font-semibold tabular-nums">{formatRupees(line.totalAmount)}</div>
              </li>
            ))}
          </ul>
          <dl className="ml-auto max-w-sm space-y-1 text-sm">
            <Row label="Subtotal" value={formatRupees(bill.subtotal)} />
            {lineDiscount > 0 && <Row label="Item discount" value={formatRupees(-lineDiscount)} tone="good" />}
            {bill.billDiscountAmount > 0 && (
              <Row
                label={bill.billDiscountKind === 'PERCENT' ? `Bill discount (${bill.billDiscountValue}%)` : 'Bill discount'}
                value={formatRupees(-bill.billDiscountAmount)}
                tone="good"
              />
            )}
            <Row label="Tax" value={formatRupees(bill.taxAmount)} />
            <div className="border-t pt-1"><Row label="Total" value={formatRupees(bill.totalAmount)} strong /></div>
            <Row label="Paid" value={formatRupees(paid)} />
            {due > 0 && <Row label="Due" value={formatRupees(due)} tone="warn" />}
            {refundDue > 0 && <Row label="Refund due" value={formatRupees(refundDue)} tone="warn" />}
          </dl>
        </CardContent>
      </Card>

      {bill.payments.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Payments</CardTitle></CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {bill.payments.map((payment) => (
                <li key={payment.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                  <span>
                    {payment.status === 'REFUNDED' ? 'Refund' : 'Received'} · {METHOD_LABEL[payment.method] ?? payment.method} · {displayClinicDateTime(payment.paymentDate)}
                    {payment.reference ? ` · ${payment.reference}` : ''}
                  </span>
                  <span className="font-semibold tabular-nums">{formatRupees(payment.amount)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {bill.revisions.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><History aria-hidden="true" className="size-4" /> Discount changes</CardTitle></CardHeader>
          <CardContent>
            <ol className="divide-y text-sm">
              {bill.revisions.map((revision) => (
                <li key={revision.id} className="space-y-0.5 py-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{displayClinicDateTime(revision.createdAt)} · {personName(revision.revisedBy)}</span>
                    <span className="tabular-nums">{formatRupees(revision.previousTotal)} → {formatRupees(revision.revisedTotal)}</span>
                  </div>
                  <p className="text-muted-foreground [overflow-wrap:anywhere]">{revision.reason}</p>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      {editable && (
        <EditDiscountDialog
          key={`${bill.mutationVersion}:${editKey}`}
          bill={bill}
          open={editing}
          onOpenChange={setEditing}
          onSaved={(saved) => {
            setEditing(false);
            setLoad({ status: 'ready', bill: saved });
          }}
          onReload={() => void reload()}
        />
      )}
      {refundDue > 0 && refunding && (
        <RecordRefundDialog
          bill={bill}
          amount={refundDue}
          open={refunding}
          onOpenChange={setRefunding}
          onSaved={() => {
            setRefunding(false);
            void fetchBill();
          }}
        />
      )}
    </div>
  );
}
