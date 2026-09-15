"use client";
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  fmtMoney,
  fmtDate,
  inputClass,
  requestKey,
  workflowKinds,
} from "./workspace-model";
/**
 * @cc [owner:nareshshah139,label:product] supplier-credit-context-allocation
 * The shared credit panel MUST constrain bill choices to the credit supplier, preselect an explicit
 * source bill and retain the allocation request key across retries until the server confirms success.
 */
/**
 * @cc [owner:nareshshah139,label:product;target] purchase-credit-adjustment-visible
 * Supplier credits and voucher adjustments MUST be selectable against eligible bills in the
 * supplier account, with an auditable balance effect and no duplicate stock movement.
 * Acceptance: INV-22. Validation and open gaps:
 * docs/qa/inventory-workflow-contract-review.md. This is a target obligation, not a pass claim.
 */
export function SupplierCreditPanel({
  canWrite,
  onNew,
  onOpen,
  onInvoice,
  purchaseInvoiceId,
  supplierGstin,
  onChanged,
}: any) {
  const [data, setData] = useState<any>(null),
    [credit, setCredit] = useState<any>(null),
    [form, setForm] = useState<any>({}),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const load = () => {
    setError("");
    return apiClient
      .get("/inventory/workspace/credits")
      .then(setData)
      .catch((e: any) => setError(e.message));
  };
  useEffect(() => {
    load();
  }, [supplierGstin, purchaseInvoiceId]);
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap justify-between gap-3">
        <h2 className="text-2xl font-semibold">Supplier credits & vouchers</h2>
        {canWrite && onNew && (
          <Button onClick={onNew}>Record credit note</Button>
        )}
      </div>
      {error && (
        <p role="alert">
          {error}{" "}
          <button className="underline" onClick={load}>
            Retry
          </button>
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {credit && (
        <form
          className="flex flex-wrap items-end gap-3 border p-4"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await apiClient.post("/inventory/workspace/credits/allocate", {
                ...form,
                creditId: credit.id,
                amount: Number(form.amount),
              });
              setCredit(null);
              setNotice(
                "Credit allocated. The posted bill balance has been updated.",
              );
              load();
              onChanged?.();
            } catch (e: any) {
              setError(e.message);
            }
          }}
        >
          <label className="min-w-64 flex-1 text-sm">
            Posted bill
            <select
              className={inputClass}
              required
              value={form.purchaseInvoiceId || ""}
              onChange={(e) =>
                setForm({ ...form, purchaseInvoiceId: e.target.value })
              }
            >
              <option value="">Select a bill</option>
              {data.invoices
                .filter(
                  (i: any) =>
                    i.distributorGstin === credit.supplierGstin &&
                    i.outstanding > 0,
                )
                .map((i: any) => (
                  <option key={i.id} value={i.id}>
                    {i.invoiceNumber} · due {fmtMoney(i.outstanding)}
                  </option>
                ))}
            </select>
          </label>
          <label className="text-sm">
            Amount
            <input
              type="number"
              min="0.01"
              max={credit.available}
              step="0.01"
              required
              className={inputClass}
              value={form.amount || ""}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </label>
          <Button>Allocate credit</Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setCredit(null)}
          >
            Cancel
          </Button>
        </form>
      )}
      <ul className="divide-y border-y">
        {data?.credits
          .filter(
            (c: any) => !supplierGstin || c.supplierGstin === supplierGstin,
          )
          .map((c: any) => (
            <li key={c.id} className="space-y-3 py-4">
              <div className="flex flex-wrap justify-between gap-3">
                <button
                  className="text-left"
                  onClick={async () => {
                    try {
                      const d = await apiClient.get<any>(
                        `/inventory/workspace/documents/${c.documentId}`,
                      );
                      if (onOpen) onOpen(d.kind, d.id);
                      else
                        window.location.assign(
                          `/dashboard/inventory?area=${workflowKinds[d.kind].area}&view=${d.kind}&document=${d.id}`,
                        );
                    } catch (e: any) {
                      setError(e.message);
                    }
                  }}
                >
                  <strong className="underline">{c.reference}</strong>
                  <p className="text-sm text-muted-foreground">
                    {c.supplierGstin} ·{" "}
                    {c.reversedAt
                      ? "Reversed"
                      : `Available ${fmtMoney(c.available)} of ${fmtMoney(c.amount)}`}
                  </p>
                </button>
                {canWrite && c.available > 0 && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setCredit(c);
                      setForm({
                        requestKey: requestKey(),
                        purchaseInvoiceId: purchaseInvoiceId || "",
                      });
                    }}
                  >
                    Allocate to bill
                  </Button>
                )}
              </div>
              {c.allocations.map((a: any) => (
                <div
                  key={a.id}
                  className="flex flex-wrap items-center gap-3 text-sm"
                >
                  <span>
                    {fmtDate(a.createdAt)} · {fmtMoney(a.amount)} allocated{" "}
                    {a.reversedAt ? "· reversed" : ""}{" "}
                    <a
                      className="underline"
                      href={`/dashboard/inventory?area=purchases&view=intake&invoice=${a.purchaseInvoiceId}`}
                    >
                      View bill
                    </a>
                  </span>
                  {canWrite && !a.reversedAt && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        const reason = window.prompt(
                          "Reason for reversing this credit allocation",
                        );
                        if (!reason) return;
                        try {
                          await apiClient.post(
                            `/inventory/workspace/credits/allocations/${a.id}/reverse`,
                            { reason },
                          );
                          load();
                          onChanged?.();
                        } catch (e: any) {
                          setError(e.message);
                        }
                      }}
                    >
                      Reverse allocation
                    </Button>
                  )}
                </div>
              ))}
            </li>
          ))}
        {data &&
          !data.credits.some(
            (c: any) => !supplierGstin || c.supplierGstin === supplierGstin,
          ) && (
            <li className="py-6 text-muted-foreground">
              No supplier credits yet. Finalised supplier returns and posted
              credit notes appear here.
            </li>
          )}
      </ul>
    </section>
  );
}
