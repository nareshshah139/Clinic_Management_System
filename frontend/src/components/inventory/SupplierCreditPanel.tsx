"use client";

import { displayClinicDate } from '@/lib/date-display';
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { fmtMoney, workflowKinds } from "./workspace-model";
import { SetOffCreditDialog } from "./purchase/SetOffCreditDialog";
import { usePrompt } from "@/components/ui/confirm-dialog";
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
    [credit, setCredit] = useState<{ credit: any; anchor: HTMLElement } | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [askReason, reasonDialog] = usePrompt();
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
      {reasonDialog}
      {credit && (
        <SetOffCreditDialog
          scope={{ creditId: credit.credit.id }}
          distributorName={credit.credit.supplierGstin}
          anchor={credit.anchor}
          billId={purchaseInvoiceId || undefined}
          onClose={() => setCredit(null)}
          onDone={(_, total) => {
            const anchor = credit.anchor;
            setCredit(null);
            setNotice(`Set off ${fmtMoney(total)} of credit ${credit.credit.creditNoteNumber || credit.credit.reference}. The bill balance has been updated.`);
            load();
            onChanged?.();
            anchor.focus();
          }}
          onStale={(failure) => {
            setCredit(null);
            setError(`${failure.title}. ${failure.description}`);
            load();
          }}
        />
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
                  <strong className="underline">{c.creditNoteNumber ? `${c.creditNoteNumber} · ${c.reference}` : c.reference}</strong>
                  <p className="text-sm text-muted-foreground">
                    {c.supplierGstin} ·{" "}
                    {c.reversedAt
                      ? "Reversed"
                      : `Available ${fmtMoney(c.available)} of ${fmtMoney(c.amount)}`}
                  </p>
                </button>
                {canWrite && c.available > 0 && c.creditNoteNumber && (
                  <Button
                    variant="outline"
                    aria-haspopup="dialog"
                    onClick={(event) => setCredit({ credit: c, anchor: event.currentTarget })}
                  >
                    Set off against bills
                  </Button>
                )}
                {canWrite && c.available > 0 && !c.creditNoteNumber && (
                  <span className="text-sm">Record the distributor’s credit note number to set this credit off.</span>
                )}
              </div>
              {c.allocations.map((a: any) => (
                <div
                  key={a.id}
                  className="flex flex-wrap items-center gap-3 text-sm"
                >
                  <span>
                    {displayClinicDate(a.createdAt)} · {fmtMoney(a.amount)} allocated{" "}
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
                        const reason = await askReason({
                          title: `Reverse the ${fmtMoney(a.amount)} allocation?`,
                          description: "It stays in the allocation history, marked reversed.",
                          inputLabel: "Reason for reversing this credit allocation",
                          confirmLabel: "Reverse allocation",
                          destructive: true,
                        });
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
