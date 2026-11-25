'use client';

import { useId, useState } from 'react';
import { apiClient } from '@/lib/api';
import { getErrorMessage } from '@/lib/utils';
import { formatRupees } from '@/lib/pharmacy-invoice-print';
import { toast } from '@/hooks/use-toast';
import { requestKey } from '@/components/inventory/workspace-model';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { paymentAmount } from './finished-bill-model';
import { PAYMENT_MODE_LABELS } from './sales-register-model';

const METHODS = ['CASH', 'UPI', 'CARD', 'NETBANKING', 'WALLET', 'INSURANCE'] as const;
type Method = (typeof METHODS)[number];

export function CollectPaymentDialog({ billId, billNo, due, onClose, onSaved }: {
  billId: string;
  billNo: string;
  due: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const id = useId();
  const [key] = useState(requestKey);
  const [amountText, setAmountText] = useState(String(due));
  const [method, setMethod] = useState<Method>('CASH');
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const amount = paymentAmount(amountText, due);

  const save = async () => {
    if (!amount.ok || saving) return;
    setSaving(true);
    setProblem(null);
    try {
      await apiClient.post(`/pharmacy/invoices/${encodeURIComponent(billId)}/payments`, {
        requestKey: key,
        amount: amount.amount,
        method,
        ...(reference.trim() ? { reference: reference.trim() } : {}),
      });
      toast({ title: 'Payment collected', description: `${formatRupees(amount.amount)} by ${PAYMENT_MODE_LABELS[method]} on ${billNo}.` });
      onSaved();
    } catch (error) {
      setProblem(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(next: boolean) => !next && !saving && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="pr-6">Collect payment on {billNo}</DialogTitle>
          <DialogDescription>{formatRupees(due)} is due. Take all of it or part of it now.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          {problem && <p role="alert" className="rounded-md border border-destructive-border bg-destructive-soft p-3 text-sm text-destructive-text">{problem}</p>}
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-amount`}>Amount</Label>
            <Input
              id={`${id}-amount`}
              type="number"
              inputMode="decimal"
              min={0.01}
              max={due}
              step="0.01"
              value={amountText}
              onChange={(event) => setAmountText(event.target.value)}
              aria-invalid={!amount.ok}
              aria-describedby={amount.ok ? undefined : `${id}-amount-problem`}
              className="tabular-nums"
            />
            {!amount.ok && <p id={`${id}-amount-problem`} className="text-xs text-destructive-text">{amount.problem}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-method`}>Paid by</Label>
            <NativeSelect id={`${id}-method`} value={method} onChange={(event) => setMethod(event.target.value as Method)} className="w-full">
              {METHODS.map((value) => <option key={value} value={value}>{PAYMENT_MODE_LABELS[value]}</option>)}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-reference`}>Reference (optional)</Label>
            <Input id={`${id}-reference`} value={reference} maxLength={200} onChange={(event) => setReference(event.target.value)} placeholder="UPI or card reference" />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={!amount.ok || saving}>
              {saving ? 'Saving…' : `Collect ${amount.ok ? formatRupees(amount.amount) : 'payment'}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
