"use client";

import React, { useCallback, useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { CircleAlert, CheckCircle2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiClient } from '@/lib/api';
import { cn, formatPatientName, getErrorMessage } from '@/lib/utils';
import { displayCalendarDate, displayClinicDateTime } from '@/lib/date-display';
import { useToast } from '@/hooks/use-toast';
import type { AppointmentInSlot, ClinicBillAccess } from '@/lib/types';
import { DESK_PAYMENT_MODES, paymentModeLabel, type DeskPaymentMode } from '@/lib/clinic-payment-modes';
import { BILL_TYPE_LABEL, FEE_LIST_PATH, defaultBillLine, parseRupees, rupee } from './appointment-billing-view';

type InvoiceDetail = {
  id: string;
  invoiceNo: string;
  total: number;
  received: number;
  balance: number;
  createdAt?: string;
  items: { id: string; name: string; qty: number; total: number }[];
  payments: { id: string; amount: number; mode: string; reference?: string | null; createdAt: string }[];
};

type Mode = DeskPaymentMode;
/** What the desk notes down for a mode that has a paper trail: a cheque number or a bank reference. */
function referenceLabel(mode: Mode): string | undefined {
  const found = DESK_PAYMENT_MODES.find((m) => m.value === mode);
  return found && 'reference' in found ? found.reference : undefined;
}

function ModePicker({ value, onChange, label, reference, onReference }: {
  value: Mode;
  onChange: (mode: Mode) => void;
  label: string;
  reference: string;
  onReference: (text: string) => void;
}) {
  const asks = referenceLabel(value);
  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
        {DESK_PAYMENT_MODES.map((mode) => (
          <button
            key={mode.value}
            type="button"
            role="radio"
            aria-checked={value === mode.value}
            onClick={() => onChange(mode.value)}
            className={cn(
              'h-10 min-w-16 rounded-md border px-3 text-sm font-medium',
              value === mode.value ? 'border-info bg-info-soft text-info-text' : 'border-border bg-white text-foreground hover:bg-accent',
            )}
          >
            {mode.label}
          </button>
        ))}
      </div>
      {asks && (
        <label className="flex flex-col gap-1 text-sm font-medium">
          {asks} (optional)
          <Input value={reference} onChange={(e) => onReference(e.target.value)} maxLength={60} autoComplete="off" className="h-10 text-base" />
        </label>
      )}
    </div>
  );
}

/**
 * @cc [owner:nareshshah139,label:product] appointment-bill-dialog
 * The calendar's bill opens the appointment's clinic bills with their lines, payments and what is
 * due. A user who may take payments records one against a bill with something due; a user who may
 * create bills creates one prefilled with the patient, appointment, visit and bill type, and with
 * the fee list's fee for that bill type, named as its source and still editable; without a fee the
 * field is empty and says so, with a way to the fee list for a user who may edit it. Every change is
 * saved on the server and the calendar row is reloaded from it.
 */
export function AppointmentBillDialog({
  appointment,
  date,
  access,
  onClose,
  onChanged,
}: {
  appointment: AppointmentInSlot | null;
  date: string;
  access: ClinicBillAccess;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const { toast } = useToast();
  const ids = useId();
  const [invoices, setInvoices] = useState<InvoiceDetail[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [line, setLine] = useState('');
  const [fee, setFee] = useState('');
  const [paidNow, setPaidNow] = useState<string | null>(null);
  const [payFor, setPayFor] = useState<string | null>(null);
  const [payment, setPayment] = useState('');
  const [mode, setMode] = useState<Mode>('CASH');
  const [reference, setReference] = useState('');

  const invoiceIds = (appointment?.billing?.invoices ?? []).map((i) => i.id).join(',');
  const load = useCallback(async () => {
    if (!invoiceIds) {
      setInvoices([]);
      return;
    }
    setLoadError(null);
    try {
      setInvoices(await Promise.all(invoiceIds.split(',').map((id) => apiClient.getInvoiceById(id) as Promise<InvoiceDetail>)));
    } catch (e) {
      setLoadError(getErrorMessage(e));
    }
  }, [invoiceIds]);

  const resetForm = useCallback(() => {
    if (!appointment) return;
    setAdding(false);
    setLine(defaultBillLine(appointment.billType, appointment.visitType === 'PROCEDURE' ? appointment.notes : undefined));
    setFee(appointment.fee != null ? String(appointment.fee) : '');
    setPaidNow(null);
    setMode('CASH');
    setReference('');
  }, [appointment]);

  useEffect(() => {
    setInvoices(null);
    setError(null);
    resetForm();
  }, [appointment?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (appointment) void load();
  }, [appointment, load]);

  const withDue = (invoices ?? []).filter((i) => i.balance > 0);
  const payInvoice = withDue.find((i) => i.id === payFor) ?? withDue[0] ?? null;
  useEffect(() => {
    setPayment(payInvoice ? String(payInvoice.balance) : '');
  }, [payInvoice?.id, payInvoice?.balance]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!appointment) return null;
  const patient = formatPatientName(appointment.patient);
  const kind = appointment.billType ? BILL_TYPE_LABEL[appointment.billType] : 'Consultation';
  const listFee = appointment.fee ?? null;
  const feeValue = parseRupees(fee);
  const paidText = paidNow ?? fee;
  const paidValue = parseRupees(paidText);
  const paymentValue = parseRupees(payment);
  const creating = access.createBill && invoices !== null && (invoices.length === 0 || adding);
  const feeInvalid = feeValue !== null && (Number.isNaN(feeValue) || feeValue <= 0);
  const paidInvalid = paidValue !== null && (Number.isNaN(paidValue) || (feeValue !== null && paidValue > feeValue));
  const paymentInvalid = paymentValue !== null && (Number.isNaN(paymentValue) || paymentValue <= 0 || (payInvoice !== null && paymentValue > payInvoice.balance));

  const paymentOf = (invoiceId: string, amount: number) => {
    const ref = referenceLabel(mode) && reference.trim();
    return { invoiceId, amount, method: mode, ...(ref ? { reference: ref } : {}) };
  };

  const finish = async (message: string) => {
    toast({ variant: 'success', title: message });
    resetForm();
    await onChanged();
  };

  const createBill = async () => {
    if (feeValue === null || feeInvalid || paidInvalid || !line.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const created = (await apiClient.createInvoice({
        patientId: appointment.patient.id,
        appointmentId: appointment.id,
        ...(appointment.visit?.id ? { visitId: appointment.visit.id } : {}),
        items: [{ name: line.trim(), description: line.trim(), quantity: 1, unitPrice: feeValue, gstRate: 0, discount: 0 }],
      })) as { id: string; invoiceNo: string };
      const paid = paidValue ?? 0;
      if (paid > 0) {
        try {
          await apiClient.processPayment(paymentOf(created.id, paid));
        } catch (e) {
          setError(`Bill ${created.invoiceNo} was created, but the payment was not recorded: ${getErrorMessage(e)}`);
          await onChanged();
          return;
        }
      }
      await finish(paid > 0 ? `Bill ${created.invoiceNo} created and ${rupee(paid)} ${paymentModeLabel(mode)} recorded` : `Bill ${created.invoiceNo} created`);
    } catch (e) {
      setError(`${getErrorMessage(e)} Nothing was saved.`);
    } finally {
      setSaving(false);
    }
  };

  const recordPayment = async () => {
    if (!payInvoice || paymentValue === null || paymentInvalid) return;
    setSaving(true);
    setError(null);
    try {
      await apiClient.processPayment(paymentOf(payInvoice.id, paymentValue));
      await finish(`${rupee(paymentValue)} ${paymentModeLabel(mode)} recorded on ${payInvoice.invoiceNo}`);
    } catch (e) {
      setError(`${getErrorMessage(e)} Nothing was saved.`);
      await onChanged();
    } finally {
      setSaving(false);
    }
  };

  const total = (invoices ?? []).reduce((sum, i) => sum + i.total, 0);
  const due = (invoices ?? []).reduce((sum, i) => sum + Math.max(0, i.balance), 0);

  return (
    <Dialog open onOpenChange={(open: boolean) => { if (!open && !saving) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Bill for {patient}</DialogTitle>
          <DialogDescription>
            {kind} · {displayCalendarDate(date)} · {appointment.slot}
          </DialogDescription>
        </DialogHeader>

        {invoices === null && !loadError && <p className="text-sm text-muted-foreground">Loading the bill…</p>}
        {loadError && (
          <div role="alert" className="space-y-2 text-sm text-destructive-text">
            <p>Could not load the bill: {loadError}</p>
            <Button size="sm" variant="outline" onClick={() => void load()}>Retry</Button>
          </div>
        )}

        {invoices && invoices.length > 0 && (
          <div className="space-y-3">
            {invoices.length > 1 && (
              <p data-testid="bill-summary" className="text-sm font-semibold">
                {invoices.length} bills · {rupee(total)} · {due > 0 ? `Due ${rupee(due)}` : 'Paid'}
              </p>
            )}
            {invoices.map((invoice) => (
              <section key={invoice.id} aria-label={`Bill ${invoice.invoiceNo}`} className="rounded-lg border p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{invoice.invoiceNo}</span>
                  {invoice.balance > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded bg-warning-soft px-2 py-0.5 font-semibold text-warning-text">
                      <CircleAlert className="size-3.5" aria-hidden="true" /> Due {rupee(invoice.balance)}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded bg-success-soft px-2 py-0.5 font-semibold text-success-text">
                      <CheckCircle2 className="size-3.5" aria-hidden="true" /> Paid
                    </span>
                  )}
                </div>
                <ul className="mt-2 space-y-1">
                  {invoice.items.map((item) => (
                    <li key={item.id} className="flex justify-between gap-3">
                      <span className="min-w-0 truncate">{item.qty > 1 ? `${item.name} × ${item.qty}` : item.name}</span>
                      <span className="tabular-nums">{rupee(item.total)}</span>
                    </li>
                  ))}
                </ul>
                <dl className="mt-2 grid grid-cols-3 gap-2 border-t pt-2 tabular-nums">
                  <div><dt className="text-muted-foreground">Total</dt><dd className="font-semibold">{rupee(invoice.total)}</dd></div>
                  <div><dt className="text-muted-foreground">Received</dt><dd className="font-semibold">{rupee(invoice.received)}</dd></div>
                  <div><dt className="text-muted-foreground">Due</dt><dd className="font-semibold">{rupee(Math.max(0, invoice.balance))}</dd></div>
                </dl>
                {invoice.payments.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-foreground" aria-label={`Payments on ${invoice.invoiceNo}`}>
                    {invoice.payments.map((p) => (
                      <li key={p.id} className="tabular-nums">
                        {p.amount < 0 ? `Refund ${rupee(-p.amount)}` : rupee(p.amount)} {paymentModeLabel(p.mode)}
                        {p.amount > 0 && p.reference ? ` · ${p.reference}` : ''} · {displayClinicDateTime(p.createdAt)}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        )}

        {invoices && payInvoice && access.takePayment && !adding && (
          <section aria-labelledby={`${ids}-pay`} className="space-y-3 rounded-lg bg-muted p-3">
            <h3 id={`${ids}-pay`} className="text-sm font-semibold">Record payment</h3>
            {withDue.length > 1 && (
              <div role="radiogroup" aria-label="Bill to pay" className="flex flex-wrap gap-2">
                {withDue.map((i) => (
                  <button key={i.id} type="button" role="radio" aria-checked={payInvoice.id === i.id} onClick={() => setPayFor(i.id)}
                    className={cn('rounded-md border px-2 py-1 text-sm', payInvoice.id === i.id ? 'border-info bg-info-soft text-info-text' : 'border-border bg-white')}>
                    {i.invoiceNo} · Due {rupee(i.balance)}
                  </button>
                ))}
              </div>
            )}
            <label className="flex flex-col gap-1 text-sm font-medium">
              Amount received
              <Input inputMode="decimal" value={payment} onChange={(e) => setPayment(e.target.value)} aria-invalid={paymentInvalid || undefined} className="h-10 text-base" />
            </label>
            {paymentInvalid && <p className="text-sm text-destructive-text">Enter an amount above 0 and up to the {rupee(payInvoice.balance)} due.</p>}
            <ModePicker value={mode} onChange={setMode} label="Payment mode" reference={reference} onReference={setReference} />
            <Button className="h-10 w-full" disabled={saving || paymentValue === null || paymentInvalid} onClick={() => void recordPayment()}>
              {saving ? 'Saving…' : paymentValue && !paymentInvalid ? `Record ${rupee(paymentValue)} payment` : 'Record payment'}
            </Button>
          </section>
        )}

        {creating && (
          <section aria-labelledby={`${ids}-create`} className="space-y-3 rounded-lg bg-muted p-3">
            <h3 id={`${ids}-create`} className="text-sm font-semibold">{invoices && invoices.length ? 'Add another bill' : 'Create bill'}</h3>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Bill line
              <Input value={line} onChange={(e) => setLine(e.target.value)} className="h-10 text-base" maxLength={120} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm font-medium">
                Fee
                <Input inputMode="decimal" placeholder="Type the fee" value={fee} onChange={(e) => setFee(e.target.value)} aria-invalid={feeInvalid || undefined} aria-describedby={`${ids}-fee-source`} className="h-10 text-base" />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium">
                Paid now
                <Input inputMode="decimal" placeholder="0" value={paidText} onChange={(e) => setPaidNow(e.target.value)} aria-invalid={paidInvalid || undefined} className="h-10 text-base" />
              </label>
            </div>
            <p id={`${ids}-fee-source`} data-testid="fee-source" className="flex flex-wrap items-center gap-x-2 text-sm text-foreground">
              {listFee === null ? (
                <>
                  <span>No fee set for {kind}.</span>
                  {access.editFees && ' '}
                  {access.editFees && <Link href={FEE_LIST_PATH} className="font-medium text-info-text underline underline-offset-2">Set fees</Link>}
                </>
              ) : feeValue === listFee ? (
                <span>From fee list: {kind} {rupee(listFee)}</span>
              ) : (
                <>
                  <span>Fee list: {kind} {rupee(listFee)}, changed for this bill.</span>{' '}
                  <button type="button" className="font-medium text-info-text underline underline-offset-2" onClick={() => setFee(String(listFee))}>
                    Use {rupee(listFee)}
                  </button>
                </>
              )}
            </p>
            {feeInvalid && <p className="text-sm text-destructive-text">Enter the fee as an amount above 0, for example 500.</p>}
            {paidInvalid && <p className="text-sm text-destructive-text">Paid now can be from 0 up to the fee.</p>}
            {(paidValue ?? 0) > 0 && <ModePicker value={mode} onChange={setMode} label="Payment mode" reference={reference} onReference={setReference} />}
            <p className="text-xs text-muted-foreground">Consultation and procedure fees are billed without GST.</p>
            <div className="flex gap-2">
              {adding && <Button variant="outline" className="h-10" onClick={() => setAdding(false)} disabled={saving}>Cancel</Button>}
              <Button className="h-10 flex-1" disabled={saving || feeValue === null || feeInvalid || paidInvalid || !line.trim()} onClick={() => void createBill()}>
                {saving ? 'Saving…' : (paidValue ?? 0) > 0 && !paidInvalid ? `Create bill and record ${rupee(paidValue ?? 0)}` : 'Create bill'}
              </Button>
            </div>
          </section>
        )}

        {invoices && invoices.length > 0 && access.createBill && !adding && (
          <Button variant="ghost" size="sm" className="self-start" onClick={() => setAdding(true)}>Add another bill</Button>
        )}
        {invoices && invoices.length === 0 && !access.createBill && (
          <p className="text-sm text-foreground">Not billed yet. The front desk creates the bill.</p>
        )}
        {error && <p role="alert" className="text-sm text-destructive-text">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}
