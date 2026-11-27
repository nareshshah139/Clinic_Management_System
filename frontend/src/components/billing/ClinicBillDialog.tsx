"use client";

import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';
import { Ban } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePrompt } from '@/components/ui/confirm-dialog';
import { requestKey } from '@/components/inventory/workspace-model';
import { apiClient } from '@/lib/api';
import { getErrorMessage } from '@/lib/utils';
import { displayClinicDate, displayClinicDateTime } from '@/lib/date-display';
import { paymentModeLabel, type DeskPaymentMode } from '@/lib/clinic-payment-modes';
import { toast } from '@/hooks/use-toast';
import { parseRupees, rupee } from '@/components/appointments/appointment-billing-view';
import { PaymentModePicker, ReceivedOnField, deskPayment, receivedOnInvalid } from './PaymentModePicker';
import { ReceiptButtons } from './ReceiptButtons';
import { KIND_LABEL, STATUS_VIEW, voidBlockedReason, type ClinicBillActions, type ClinicBillRow, type ClinicReceipt } from './clinic-bill-model';

/** Asks for a reason, then voids the bill. Resolves true once the server has voided it. */
export function useVoidBill(): [(bill: Pick<ClinicBillRow, 'id' | 'billNo' | 'patient'>) => Promise<boolean>, ReactNode] {
  const [prompt, dialog] = usePrompt();
  const voidBill = useCallback(async (bill: Pick<ClinicBillRow, 'id' | 'billNo' | 'patient'>) => {
    const reason = await prompt({
      title: `Void bill ${bill.billNo}?`,
      description: `${bill.patient.name} will owe nothing on it. It stays in the register marked Void, with your reason.`,
      inputLabel: 'Reason for voiding',
      confirmLabel: 'Void bill',
      destructive: true,
    });
    if (!reason) return false;
    try {
      await apiClient.voidInvoice(bill.id, reason);
      toast({ variant: 'success', title: `Bill ${bill.billNo} voided` });
      return true;
    } catch (error) {
      toast({ variant: 'destructive', title: `Could not void bill ${bill.billNo}`, description: getErrorMessage(error) });
      return false;
    }
  }, [prompt]);
  return [voidBill, dialog];
}

type Refund = { paymentId: string; amount: string; reason: string; error?: string };

/**
 * @cc [owner:nareshshah139,label:product] clinic-bill-dialog
 * Opening a bill MUST show its lines, payments and refunds, and what is paid and due, as the server
 * has them now. It MUST offer Collect payment only on a bill with something due, Refund only on a
 * payment the server says has money left to refund (defaulting to that amount) and Void only on a
 * bill with nothing received, each only where the viewer's actions allow it, and MUST reload the
 * bill from the server after every change.
 */
export function ClinicBillDialog({ billId, actions, collecting = false, onClose, onChanged }: {
  billId: string;
  actions: ClinicBillActions;
  collecting?: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const ids = useId();
  const [receipt, setReceipt] = useState<ClinicReceipt | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<DeskPaymentMode>('CASH');
  const [reference, setReference] = useState('');
  const [receivedOn, setReceivedOn] = useState<string | null>(null);
  const [key, setKey] = useState(requestKey);
  const [refund, setRefund] = useState<Refund | null>(null);
  const [voidBill, voidDialog] = useVoidBill();

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const next = await apiClient.getClinicReceipt(billId);
      setReceipt(next);
      setAmount(next.bill.due > 0 ? String(next.bill.due) : '');
    } catch (e) {
      setLoadError(getErrorMessage(e));
    }
  }, [billId]);

  useEffect(() => {
    void load();
  }, [load]);

  const changed = async (message: string) => {
    toast({ variant: 'success', title: message });
    setRefund(null);
    setReference('');
    setReceivedOn(null);
    await load();
    onChanged();
  };

  if (!receipt) {
    return (
      <Dialog open onOpenChange={(open: boolean) => { if (!open) onClose(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Bill</DialogTitle>
            <DialogDescription>{loadError ? 'Could not load the bill.' : 'Loading the bill…'}</DialogDescription>
          </DialogHeader>
          {loadError && (
            <div role="alert" className="space-y-2 text-sm text-destructive-text">
              <p>{loadError}</p>
              <Button size="sm" variant="outline" onClick={() => void load()}>Retry</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    );
  }

  const { bill } = receipt;
  const voided = bill.status === 'CANCELLED';
  const payValue = parseRupees(amount);
  const payInvalid = payValue !== null && (Number.isNaN(payValue) || payValue <= 0 || payValue > bill.due);
  const dayInvalid = receivedOnInvalid(receivedOn);
  const canCollect = actions.collect && !voided && bill.due > 0;
  const refundValue = refund ? parseRupees(refund.amount) : null;
  const refundPayment = refund ? receipt.payments.find((p) => p.id === refund.paymentId) : undefined;
  const refundInvalid = !refundPayment || refundValue === null || Number.isNaN(refundValue) || refundValue <= 0 || refundValue > refundPayment.refundable;
  const blocked = voidBlockedReason(bill);

  const collect = async () => {
    if (!canCollect || payValue === null || payInvalid || dayInvalid || saving) return;
    setSaving(true);
    setError(null);
    try {
      await apiClient.collectClinicPayment(deskPayment(bill.id, payValue, mode, reference, receivedOn), key);
      setKey(requestKey());
      await changed(`${rupee(payValue)} ${paymentModeLabel(mode)} recorded on ${bill.billNo}`);
    } catch (e) {
      setError(`${getErrorMessage(e)} Nothing was saved.`);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const sendRefund = async () => {
    if (!refund || refundInvalid || refundValue === null || saving) return;
    setSaving(true);
    setError(null);
    try {
      await apiClient.refundPayment({ paymentId: refund.paymentId, amount: refundValue, notes: refund.reason.trim() });
      await changed(`${rupee(refundValue)} refunded on ${bill.billNo}`);
    } catch (e) {
      setRefund({ ...refund, error: `${getErrorMessage(e)} Nothing was refunded.` });
      await load();
    } finally {
      setSaving(false);
    }
  };

  const voidNow = async () => {
    if (await voidBill(bill)) {
      await load();
      onChanged();
    }
  };

  return (
    <Dialog open onOpenChange={(open: boolean) => { if (!open && !saving) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            Bill {bill.billNo}
            <Badge variant={STATUS_VIEW[bill.status].variant}>{STATUS_VIEW[bill.status].label}</Badge>
          </DialogTitle>
          <DialogDescription>
            {[bill.patient.name, displayClinicDate(bill.billedAt), bill.doctor?.name, bill.kind && KIND_LABEL[bill.kind]].filter(Boolean).join(' · ')}
          </DialogDescription>
        </DialogHeader>

        {voided && (
          <p className="rounded-md border border-border bg-muted p-3 text-sm">
            <span className="font-semibold">Void.</span> {bill.voidReason ?? 'No reason recorded.'}
          </p>
        )}

        <section aria-label={`Lines on ${bill.billNo}`} className="rounded-lg border p-3 text-sm">
          <ul className="space-y-1">
            {receipt.items.map((item) => (
              <li key={item.id} className="flex justify-between gap-3">
                <span className="min-w-0 truncate">{item.qty > 1 ? `${item.name} × ${item.qty}` : item.name}</span>
                <span className="tabular-nums">{rupee(item.total)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-2 grid grid-cols-3 gap-2 border-t pt-2 tabular-nums">
            <div><dt className="text-muted-foreground">Total</dt><dd className="font-semibold">{rupee(bill.amount)}</dd></div>
            <div><dt className="text-muted-foreground">Paid</dt><dd className="font-semibold">{rupee(bill.paid)}</dd></div>
            <div><dt className="text-muted-foreground">Due</dt><dd className="font-semibold">{rupee(bill.due)}</dd></div>
          </dl>
        </section>

        {receipt.payments.length > 0 && (
          <section aria-labelledby={`${ids}-payments`} className="text-sm">
            <h3 id={`${ids}-payments`} className="mb-1 font-semibold">Payments</h3>
            <ul className="space-y-1">
              {receipt.payments.map((p) => (
                <li key={p.id} className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 tabular-nums">
                    <span>
                      {p.amount < 0 ? `Refund ${rupee(-p.amount)}` : rupee(p.amount)} {paymentModeLabel(p.mode)}
                      {p.reference ? ` · ${p.reference}` : ''} · {displayClinicDateTime(p.paidAt)}
                    </span>
                    {actions.refund && p.refundable > 0 && refund?.paymentId !== p.id && (
                      <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => setRefund({ paymentId: p.id, amount: String(p.refundable), reason: '' })}>
                        Refund
                      </Button>
                    )}
                  </div>
                  {refund?.paymentId === p.id && (
                    <div role="group" aria-label={`Refund ${rupee(p.amount)} ${paymentModeLabel(p.mode)}`} className="space-y-2 rounded-md bg-muted p-3">
                      <div className="grid grid-cols-2 gap-2">
                        <label className="flex flex-col gap-1 font-medium">
                          Refund amount
                          <Input inputMode="decimal" value={refund.amount} onChange={(e) => setRefund({ ...refund, amount: e.target.value })} className="h-10 text-base" />
                        </label>
                        <label className="flex flex-col gap-1 font-medium">
                          Reason
                          <Input value={refund.reason} onChange={(e) => setRefund({ ...refund, reason: e.target.value })} maxLength={120} className="h-10 text-base" />
                        </label>
                      </div>
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" className="h-10" onClick={() => setRefund(null)} disabled={saving}>Cancel</Button>
                        <Button type="button" variant="destructive" className="h-10 flex-1" disabled={saving || refundInvalid || !refund.reason.trim()} onClick={() => void sendRefund()}>
                          {saving ? 'Saving…' : refundInvalid ? 'Refund' : `Refund ${rupee(refundValue ?? 0)}`}
                        </Button>
                      </div>
                      {refund.error && <p role="alert" className="text-sm text-destructive-text">{refund.error}</p>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {canCollect && (
          <section aria-labelledby={`${ids}-collect`} className="space-y-3 rounded-lg bg-muted p-3">
            <h3 id={`${ids}-collect`} className="text-sm font-semibold">Collect payment</h3>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Amount received
              <Input autoFocus={collecting} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={payInvalid || undefined} className="h-10 text-base" />
            </label>
            {payInvalid && <p className="text-sm text-destructive-text">Enter an amount above 0 and up to the {rupee(bill.due)} due.</p>}
            <PaymentModePicker value={mode} onChange={setMode} label="Payment mode" reference={reference} onReference={setReference} />
            <ReceivedOnField key={key} value={receivedOn} onChange={setReceivedOn} />
            <Button className="h-10 w-full" disabled={saving || payValue === null || payInvalid || dayInvalid} onClick={() => void collect()}>
              {saving ? 'Saving…' : payValue && !payInvalid ? `Record ${rupee(payValue)} payment` : 'Record payment'}
            </Button>
          </section>
        )}

        {error && <p role="alert" className="text-sm text-destructive-text">{error}</p>}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <ReceiptButtons invoiceId={bill.id} billNo={bill.billNo} />
          {actions.void && !voided && (
            <Button type="button" variant="ghost" size="sm" className="h-9 text-destructive-text" disabled={Boolean(blocked) || saving} onClick={() => void voidNow()}>
              <Ban aria-hidden="true" /> Void bill
            </Button>
          )}
        </div>
        {actions.void && !voided && blocked && <p className="text-xs text-muted-foreground">{blocked}.</p>}
        {voidDialog}
      </DialogContent>
    </Dialog>
  );
}
