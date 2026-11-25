import { BillPricingError, priceBill, type BillDiscount, type BillPrice } from '@/lib/bill-pricing';
import { billLineName } from '@/lib/bill-line-name';
import { formatRupees } from '@/lib/pharmacy-invoice-print';

export type BillPayment = { id: string; amount: number; method: string; status: string; reference?: string | null; paymentDate: string };
export type BillRevision = {
  id: string;
  reason: string;
  previousTotal: number;
  revisedTotal: number;
  createdAt: string;
  revisedBy: { firstName: string; lastName: string } | null;
};
export type BillLine = {
  id: string;
  itemType: 'DRUG' | 'PACKAGE';
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  discountAmount: number;
  billDiscountAmount: number;
  taxPercent: number;
  taxAmount: number;
  totalAmount: number;
  name?: string | null;
  drug: { name: string } | null;
  package: { name: string } | null;
};
export type FinishedBill = {
  id: string;
  invoiceNumber: string;
  status: string;
  mutationVersion: number;
  invoiceDate: string;
  revisedAt: string | null;
  billingName: string;
  billingPhone: string;
  patient: { name: string; phone?: string | null } | null;
  doctor: { firstName: string; lastName: string } | null;
  subtotal: number;
  discountAmount: number;
  billDiscountKind: BillDiscount['kind'] | null;
  billDiscountValue: number;
  billDiscountAmount: number;
  taxAmount: number;
  totalAmount: number;
  items: BillLine[];
  payments: BillPayment[];
  revisions: BillRevision[];
};

const LEDGER = new Set(['COMPLETED', 'REFUNDED']);
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/** The bill's ledger: receipts plus refunds (negative entries); paid above the total is a refund due. */
export function settlementOf(bill: { totalAmount: number; payments: { status: string; amount: number }[] }, total = bill.totalAmount) {
  const paid = money(bill.payments.filter((payment) => LEDGER.has(payment.status)).reduce((sum, payment) => sum + payment.amount, 0));
  const balance = money(total - paid);
  return { paid, due: Math.max(0, balance), refundDue: Math.max(0, -balance) };
}

export function paymentAmount(text: string, due: number): { ok: true; amount: number } | { ok: false; problem: string } {
  const amount = Number(text.trim());
  if (!text.trim() || !Number.isFinite(amount) || amount <= 0) return { ok: false, problem: 'Enter an amount above ₹0.' };
  if (money(amount) !== amount) return { ok: false, problem: 'Use at most two decimal places.' };
  if (amount > due) return { ok: false, problem: `Only ${formatRupees(due)} is due on this bill.` };
  return { ok: true, amount };
}

export const storedDiscount =(bill: Pick<FinishedBill, 'billDiscountKind' | 'billDiscountValue'>): BillDiscount | null =>
  bill.billDiscountKind ? { kind: bill.billDiscountKind, value: bill.billDiscountValue } : null;

export type DiscountEdit = { billDiscount: BillDiscount | null; lineDiscounts: Record<string, number> };

export type DiscountPreview =
  | { ok: true; price: BillPrice; changed: boolean; settlement: ReturnType<typeof settlementOf> }
  | { ok: false; problem: string };

export function previewDiscount(bill: FinishedBill, edit: DiscountEdit): DiscountPreview {
  const percents = bill.items.map((line) => edit.lineDiscounts[line.id] ?? line.discountPercent);
  const invalid = percents.findIndex((value) => !Number.isFinite(value) || value < 0 || value > 100);
  if (invalid >= 0) return { ok: false, problem: `Discount for ${billLineName(bill.items[invalid])} must be between 0 and 100%.` };
  try {
    const price = priceBill(
      bill.items.map((line, index) => ({ quantity: line.quantity, unitPrice: line.unitPrice, discountPercent: percents[index], taxPercent: line.taxPercent })),
      edit.billDiscount,
    );
    const before = storedDiscount(bill);
    const changed =
      (before?.kind ?? null) !== (edit.billDiscount?.kind ?? null) ||
      (before?.value ?? 0) !== (edit.billDiscount?.value ?? 0) ||
      percents.some((value, index) => value !== bill.items[index].discountPercent);
    return { ok: true, price, changed, settlement: settlementOf(bill, price.total) };
  } catch (error) {
    if (error instanceof BillPricingError) return { ok: false, problem: error.message };
    throw error;
  }
}

export function revisionRequest(bill: FinishedBill, edit: DiscountEdit, reason: string) {
  return {
    expectedVersion: bill.mutationVersion,
    billDiscount: edit.billDiscount?.value ? edit.billDiscount : null,
    lines: bill.items.map((line) => ({ id: line.id, discountPercent: edit.lineDiscounts[line.id] ?? line.discountPercent })),
    reason: reason.trim(),
  };
}
