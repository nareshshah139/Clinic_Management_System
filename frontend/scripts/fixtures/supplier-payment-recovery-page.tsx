"use client";
import { useEffect, useState } from "react";
import { SupplierPaymentRecovery, type RecoverableSupplierPayment } from "@/components/pharmacy/SupplierPaymentRecovery";
import { apiClient } from "@/lib/api";
const payment: RecoverableSupplierPayment = { id: "synthetic-payment", updatedAt: "2026-10-15T10:00:00.000Z", paymentDate: "2026-10-01", amount: 100, mode: "NEFT", allocations: [{ purchaseInvoiceId: "synthetic-a", invoiceNumber: "SYN-A", amount: 100 }] };
export default function PaymentRecoveryPreview() {
  const [payments, setPayments] = useState([payment]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const previous = apiClient.post;
    const calls: { url: string; data: Record<string, unknown> }[] = [];
    (window as any).__paymentRecoveryCalls = calls;
    apiClient.post = (async (url: string, data: Record<string, unknown>) => {
      if (!url.startsWith("/pharmacy/purchase-ledger/payments/synthetic-payment/")) throw new Error("Synthetic preview forbids unrelated requests");
      calls.push({ url, data });
      if (url.endsWith("/reverse") && calls.length === 1) throw new Error("Synthetic lost response");
      const original = { ...payment, reversedAt: "2026-10-15T11:00:00.000Z", reversalReason: String(data.reason) };
      const replacement = url.endsWith("/reallocate") ? { ...payment, id: "synthetic-replacement", replacesPaymentId: payment.id, allocations: [{ purchaseInvoiceId: "synthetic-b", invoiceNumber: "SYN-B", amount: 100 }] } : null;
      setPayments(replacement ? [original, replacement] : [original]);
      return { original, replacement };
    }) as typeof apiClient.post;
    setReady(true);
    return () => { apiClient.post = previous; };
  }, []);
  return <main className="mx-auto max-w-4xl space-y-6 p-4 sm:p-8">
    <h1 className="text-2xl font-semibold">Supplier payment recovery</h1>
    <p className="text-sm text-muted-foreground">Synthetic local fixture. No production records are connected.</p>
    {ready && <SupplierPaymentRecovery payments={payments} invoices={[{ id: "synthetic-a", invoiceNumber: "SYN-A", outstanding: 0 }, { id: "synthetic-b", invoiceNumber: "SYN-B", outstanding: 100 }]} canWrite onChanged={async () => {}} />}
  </main>;
}
