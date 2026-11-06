import { formatRupees } from '@/lib/pharmacy-invoice-print';

export type SetOffOptions = {
  distributor: { gstin: string; name: string };
  available: number;
  credits: { id: string; number: string; date: string | null; reference: string; available: number }[];
  bills: { id: string; billNo: string; billDate: string; dueDate: string | null; payable: number }[];
};

export type SetOffResult = {
  setOffId: string;
  allocations: { id: string; creditId: string; creditNoteNumber: string | null; purchaseInvoiceId: string; amount: number }[];
  bills: { id: string; billNo: string; payableAfter: number }[];
  credits: { id: string; number: string | null; available: number }[];
};

const paise = (value: number) => Math.round(value * 100);
const rupees = (value: number) => paise(value) / 100;
const text = (value: number) => (value > 0 ? String(rupees(value)) : '');

export function prefillSetOff(options: SetOffOptions, billId?: string): Record<string, string> {
  let left = options.available;
  const order = billId ? options.bills.filter((bill) => bill.id === billId) : options.bills;
  const filled: Record<string, string> = Object.fromEntries(options.bills.map((bill) => [bill.id, '']));
  for (const bill of order) {
    const take = rupees(Math.min(left, bill.payable));
    filled[bill.id] = text(take);
    left = rupees(left - take);
  }
  return filled;
}

const amountOf = (value: string | undefined) => {
  const cleaned = (value ?? '').replace(/[₹,\s]/g, '');
  return cleaned === '' ? 0 : Number(cleaned);
};

export function setOffProblem(options: SetOffOptions, amounts: Record<string, string>) {
  const allocations: { purchaseInvoiceId: string; amount: number }[] = [];
  let problem: string | null = null;
  let invalidBill: string | null = null;
  for (const bill of options.bills) {
    const amount = amountOf(amounts[bill.id]);
    if (!Number.isFinite(amount) || amount < 0) {
      problem ??= `Enter a rupee amount for bill ${bill.billNo}.`;
      invalidBill ??= bill.id;
      continue;
    }
    if (paise(amount) > paise(bill.payable)) {
      problem ??= `Bill ${bill.billNo} has only ${formatRupees(bill.payable)} left to pay.`;
      invalidBill ??= bill.id;
    }
    if (amount > 0) allocations.push({ purchaseInvoiceId: bill.id, amount: rupees(amount) });
  }
  const total = rupees(allocations.reduce((sum, allocation) => sum + allocation.amount, 0));
  const left = rupees(options.available - total);
  if (!problem && left < 0) problem = `Only ${formatRupees(options.available)} credit is available.`;
  if (!problem && total <= 0) problem = 'Enter an amount against at least one bill.';
  return { allocations, total, left, problem, invalidBill };
}
