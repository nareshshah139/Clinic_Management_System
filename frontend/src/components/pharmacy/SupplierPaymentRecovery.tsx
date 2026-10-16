"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api";
import { getErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type RecoverableSupplierPayment = {
  id: string;
  updatedAt: string;
  paymentDate: string;
  amount: number;
  mode: string;
  reversedAt?: string | null;
  reversalReason?: string | null;
  replacesPaymentId?: string | null;
  allocations: { purchaseInvoiceId: string; invoiceNumber: string; amount: number }[];
};

type Invoice = { id: string; invoiceNumber: string; outstanding: number };
const money = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(value);

/**
 * @cc [owner:nareshshah139,label:product] supplier-payment-recovery-confirmation
 * Corrections MUST require a reason and write permission, preserve a retry key for unchanged
 * submissions, and announce success only after a matching reversed payment is returned.
 */
export function SupplierPaymentRecovery({ payments, invoices, canWrite, onChanged }: {
  payments: RecoverableSupplierPayment[];
  invoices: Invoice[];
  canWrite: boolean;
  onChanged: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<{ payment: RecoverableSupplierPayment; action: "reverse" | "reallocate" } | null>(null);
  const [reason, setReason] = useState("");
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [attempt, setAttempt] = useState<{ signature: string; key: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const total = Object.values(allocations).reduce((sum, value) => sum + (Number(value) || 0), 0);

  useEffect(() => {
    if (!selected || saving) return;
    const current = payments.find(payment => payment.id === selected.payment.id);
    if (!current || current.reversedAt || current.updatedAt !== selected.payment.updatedAt) {
      setSelected(null);
      setAttempt(null);
      setMessage(current?.reversedAt ? "This payment is already reversed. Review its updated history." : "This payment changed. Review its current details before correcting it.");
    }
  }, [payments, selected, saving]);

  const choose = (payment: RecoverableSupplierPayment, action: "reverse" | "reallocate") => {
    setSelected({ payment, action });
    setReason("");
    setAllocations(Object.fromEntries(payment.allocations.map(row => [row.purchaseInvoiceId, String(row.amount)])));
    setAttempt(null);
    setError("");
    setMessage("");
  };

  const submit = async () => {
    if (!selected || !canWrite || !reason.trim() || saving) return;
    const { payment, action } = selected;
    const rows = Object.entries(allocations).map(([purchaseInvoiceId, amount]) => ({ purchaseInvoiceId, amount: Number(amount) }))
      .filter(row => row.amount > 0).sort((a, b) => a.purchaseInvoiceId.localeCompare(b.purchaseInvoiceId));
    if (action === "reallocate" && Math.round(total * 100) !== Math.round(payment.amount * 100)) {
      setError("Allocate the original payment amount exactly.");
      return;
    }
    const payload = { expectedUpdatedAt: payment.updatedAt, reason: reason.trim(), ...(action === "reallocate" ? { allocations: rows } : {}) };
    const signature = JSON.stringify({ id: payment.id, action, payload });
    const next = attempt?.signature === signature ? attempt : { signature, key: crypto.randomUUID() };
    setAttempt(next);
    setSaving(true);
    setError("");
    try {
      const response = await apiClient.post<{ original: RecoverableSupplierPayment; replacement?: RecoverableSupplierPayment | null }>(
        `/pharmacy/purchase-ledger/payments/${payment.id}/${action}`, { ...payload, requestKey: next.key },
      );
      if (response?.original?.id !== payment.id || !response.original.reversedAt ||
        (action === "reallocate" && (!response.replacement?.id || response.replacement.replacesPaymentId !== payment.id || response.replacement.amount !== payment.amount))) {
        throw new Error("The correction outcome is not confirmed. Refresh the ledger or retry the unchanged correction.");
      }
      setSelected(null);
      setAttempt(null);
      setMessage(action === "reverse" ? "Payment reversed. Its invoice balances have reopened." : "Payment reallocated. The original and replacement remain in the history.");
      await onChanged();
    } catch (err) {
      setError(`${getErrorMessage(err)} Refresh the ledger to check the outcome, or retry the unchanged correction.`);
    } finally {
      setSaving(false);
    }
  };

  return <Card>
    <CardHeader><CardTitle>Recorded payments</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!payments.length && <p className="text-sm text-muted-foreground">No recorded payments for this supplier.</p>}
      {payments.map(payment => <div key={payment.id} className="flex flex-wrap items-start justify-between gap-3 rounded-md border p-3">
        <div className="min-w-0 text-sm">
          <p className="font-medium">{money(payment.amount)} · {payment.mode} · {new Date(payment.paymentDate).toLocaleDateString("en-IN")}</p>
          <p>{payment.allocations.map(row => `${row.invoiceNumber}: ${money(row.amount)}`).join(", ")}</p>
          {payment.reversedAt ? <p className="text-muted-foreground">Reversed · {payment.reversalReason}</p> : payment.replacesPaymentId ? <p className="text-muted-foreground">Replacement payment</p> : null}
        </div>
        {canWrite && !payment.reversedAt && <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={saving} onClick={() => choose(payment, "reallocate")}>Reallocate payment</Button>
          <Button size="sm" variant="outline" disabled={saving} onClick={() => choose(payment, "reverse")}>Reverse payment</Button>
        </div>}
      </div>)}
      {selected && canWrite && <div className="space-y-4 rounded-md border bg-muted/30 p-4" aria-label="Correct supplier payment">
        <h3 className="font-medium">{selected.action === "reverse" ? "Reverse" : "Reallocate"} {money(selected.payment.amount)}</h3>
        <p className="text-sm text-muted-foreground">{selected.action === "reverse" ? "This reopens the allocated invoice balances and keeps an audit history. It does not refund or transfer money." : "Move this payment between the supplier’s invoices. Keep the total unchanged. To correct the amount, reverse this payment and record the correct amount."}</p>
        {selected.action === "reallocate" && <div className="space-y-3">
          {invoices.map(invoice => {
            const originalAmount = selected.payment.allocations.find(row => row.purchaseInvoiceId === invoice.id)?.amount || 0;
            const available = Math.round((invoice.outstanding + originalAmount) * 100) / 100;
            if (available <= 0) return null;
            return <div key={invoice.id} className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor={`payment-allocation-${invoice.id}`}>{invoice.invoiceNumber} · up to {money(available)}</Label>
              <Input id={`payment-allocation-${invoice.id}`} type="number" min="0" max={available} step="0.01" className="w-32" disabled={saving}
                value={allocations[invoice.id] || ""} onChange={event => setAllocations(current => ({ ...current, [invoice.id]: event.target.value }))} />
            </div>;
          })}
          <p className="text-sm">Allocated {money(total)} of {money(selected.payment.amount)}</p>
        </div>}
        <div className="space-y-2"><Label htmlFor="payment-correction-reason">Reason for correction</Label>
          <Textarea id="payment-correction-reason" value={reason} maxLength={500} disabled={saving} onChange={event => setReason(event.target.value)} /></div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={saving || !reason.trim() || (selected.action === "reallocate" && Math.round(total * 100) !== Math.round(selected.payment.amount * 100))} onClick={() => void submit()}>
            {saving ? "Saving correction…" : selected.action === "reverse" ? "Confirm reversal" : "Confirm reallocation"}
          </Button>
          <Button variant="outline" disabled={saving} onClick={() => setSelected(null)}>Cancel</Button>
        </div>
      </div>}
    </CardContent>
  </Card>;
}
