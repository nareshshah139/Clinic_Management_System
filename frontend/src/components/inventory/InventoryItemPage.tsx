"use client";

import { MEDICINE_FORMS, type MedicineFormKey } from "@/lib/medicine-names";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ArrowLeft, Download, Pencil, Printer } from "lucide-react";
import { displayClinicDate, displayClinicDateTime, displayUtcDate } from "@/lib/date-display";
import { useDashboardUser } from "@/components/layout/dashboard-user-context";
import { UserRole } from "@cms/shared-types";
import { apiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ReviewStatus } from "@/components/ui/ReviewStatus";
import { InventoryAction } from "./InventoryPresentation";
import { StockDetailsEditor } from "./StockDetailsEditor";
import { StockEditDialog } from "./StockEditDialog";
import { stockLedgerExplanation } from "./stock-recovery";
import { batchReviewTone, batchRowClass, batchState, fmtStockExpiry } from "./stock-batch-view";
import { downloadCsv, fmtMoney, inputClass, requestKey, workflowKinds } from "./workspace-model";
import { billHref } from "@/components/pharmacy/sales/sales-bill-model";
import {
  LEDGER_KIND_LABEL,
  chainBreakNote,
  documentLabel,
  filterLedgerRows,
  ledgerCsvRows,
  type ItemLedger,
  type ItemLedgerRow,
  type LedgerFilter,
  type LedgerKind,
} from "./item-ledger-view";

export const ITEM_TABS = [
  ["batches", "Batches"],
  ["purchases", "Purchases"],
  ["purchase-returns", "Purchase returns"],
  ["sales", "Sales"],
  ["sales-returns", "Sales returns"],
  ["ledger", "Ledger"],
  ["blocked-stock", "Blocked stock"],
  ["information", "Information"],
] as const;
type ItemTab = (typeof ITEM_TABS)[number][0];
const isItemTab = (value: string | undefined): value is ItemTab => ITEM_TABS.some(([id]) => id === value);

type Props = {
  itemId: string;
  query: Record<string, string>;
  navigate: (changes: Record<string, string>) => void;
  capabilities: any;
  onTask: (kind: string, initial?: any) => void;
  onDocument: (kind: string, id: string) => void;
  onInvoice: (id: string) => void;
  onBack?: () => void;
};
const EDIT_SUBMITTERS: string[] = [UserRole.OWNER, UserRole.ADMIN, UserRole.DOCTOR, UserRole.PHARMACIST];
type EditDraft = { batchId: string; value: Record<string, any>; focusField?: string };

const notSet = <span className="text-muted-foreground">Not set</span>;
const known = (value: unknown, render: (v: any) => ReactNode = (v) => String(v)) =>
  value == null || value === "" ? notSet : render(value);
const editValue = (batch: any) => ({ ...batch, ...batch.metadata, expiryDate: batch.expiryDate?.slice(0, 10) || "", reason: "" });
const numberCell = "p-3 text-right tabular-nums";

/**
 * @cc [owner:nareshshah139,label:product] item-page-whole-item
 * The item page MUST describe the medicine across all sibling batches: header stock, batch
 * totals, returns, held stock and the ledger cover every batch, while the opened batch keeps its
 * own state badge and checkpoint explanation. Missing master data MUST read "Not set". The
 * selected tab MUST live in the URL. A batch can be deleted only when the server says it is
 * deletable; otherwise its blocking reason MUST be visible.
 */
export function InventoryItemPage({ itemId, query, navigate, capabilities, onTask, onDocument, onInvoice, onBack }: Props) {
  const { user } = useDashboardUser();
  const canSubmitEdits = EDIT_SUBMITTERS.includes(user?.role || "");
  const editKey = `inventory-item-edit:${user?.branchId}:${user?.id}:${itemId}`;
  const [detail, setDetail] = useState<any>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [edit, setEdit] = useState<EditDraft | null>(null),
    [stockEdit, setStockEdit] = useState<{ item: any; field: "price" | "stock" } | null>(null),
    [correction, setCorrection] = useState<any>(null),
    [hideZero, setHideZero] = useState(false),
    [ledgerFilter, setLedgerFilter] = useState<LedgerFilter>({ from: "", to: "", kind: "" }),
    [deleting, setDeleting] = useState<any>(null);
  const tab: ItemTab = isItemTab(query.itemTab) ? query.itemTab : "batches";
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const load = async () => {
    setBusy(true);
    setError("");
    try {
      const d = await apiClient.get<any>(`/inventory/workspace/stock/${itemId}`);
      setDetail(d);
      try {
        const recovered = JSON.parse(sessionStorage.getItem(editKey) || "null");
        const batch = recovered?.batchId && [d.item, ...d.batches].find((b: any) => b.id === recovered.batchId);
        setEdit(batch ? recovered : null);
        if (batch)
          setNotice(recovered.value.updatedAt === batch.updatedAt
            ? "Restored unsaved product details."
            : "This product changed since your edits. Saving will require reloading the current record.");
      } catch {
        setEdit(null);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void load();
    const refresh = () => { void load(); };
    window.addEventListener("inventory-workspace-refresh", refresh);
    window.addEventListener("inventory-stock-refresh", refresh);
    return () => {
      window.removeEventListener("inventory-workspace-refresh", refresh);
      window.removeEventListener("inventory-stock-refresh", refresh);
    };
  }, [itemId]);
  useEffect(() => {
    if (edit)
      try {
        sessionStorage.setItem(editKey, JSON.stringify(edit));
      } catch {
        setNotice("Browser recovery unavailable; save before leaving.");
      }
  }, [edit, editKey]);

  const selectTab = (id: ItemTab) => navigate({ itemTab: id === "batches" ? "" : id });
  const onTabKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = ITEM_TABS.findIndex(([id]) => id === tab);
    const next = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: ITEM_TABS.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const [id] = ITEM_TABS[(next + ITEM_TABS.length) % ITEM_TABS.length];
    selectTab(id);
    tabRefs.current[id]?.focus();
  };

  const item = detail?.item;
  const ledger: ItemLedger | undefined = detail?.itemLedger;
  const batchNumbers = new Map<string, string>((detail?.batches || []).map((b: any) => [b.id, b.batchNumber || "No batch"]));
  const baseTask = (kind: string) =>
    onTask(kind, {
      payload: {
        reason: "",
        lines: [{ id: requestKey(), inventoryId: item.id, name: item.name, unit: item.unit, quantity: 1, unitPrice: item.costPrice, batchNumber: item.batchNumber, expiryDate: item.expiryDate }],
      },
    });
  const removeBatch = async (batch: any) => {
    setBusy(true);
    setError("");
    try {
      await apiClient.delete(`/inventory/items/${batch.id}`);
      setDeleting(null);
      setNotice(`Batch ${batch.batchNumber || "without number"} deleted.`);
      if (batch.id === item.id) navigate({ item: detail.batches.find((b: any) => b.id !== batch.id)?.id || "" });
      else await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const visibleBatches = (detail?.batches || []).filter((b: any) => !hideZero || b.currentStock !== 0);
  const total = (pick: (b: any) => number | null) => {
    const values = visibleBatches.map(pick);
    return { sum: values.reduce((n: number, v: number | null) => n + (v ?? 0), 0), missing: values.filter((v: number | null) => v == null).length };
  };
  const byMrp = (b: any) => (b.mrp == null ? null : b.currentStock * b.mrp);
  const byPtr = (b: any) => (b.costPrice == null ? null : b.currentStock * b.costPrice);

  return (
    <div className="space-y-5">
      {error && (
        <p role="alert" className="rounded-md border border-destructive p-3 text-destructive">
          {error} <button className="underline" onClick={load}>Retry</button>
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-md border p-3">
          {notice}
          {notice === "Submitted for doctor or admin approval." && <Button variant="link" onClick={() => navigate({ view: "approvals", item: "", page: "1" })}>Open approval queue</Button>}
        </p>
      )}
      <Button variant="ghost" onClick={() => (onBack ? onBack() : navigate({ item: "", itemTab: "" }))}>
        <ArrowLeft className="h-4 w-4" />
        Back to stock list
      </Button>
      {item && (
        <>
          <header className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0 space-y-1">
              <h2 className="text-2xl font-semibold">{item.productName || item.name}</h2>
              {item.recordedName && <p className="text-sm text-muted-foreground">Recorded as {item.recordedName}</p>}
              <p className="flex flex-wrap gap-x-3 gap-y-1">
                {item.manufacturer ? (
                  <button
                    className="underline decoration-muted-foreground/50 underline-offset-4"
                    onClick={() => navigate({ item: "", itemTab: "", search: "", manufacturer: item.manufacturer, page: "1" })}
                  >
                    {item.manufacturer}
                  </button>
                ) : (
                  <span className="text-muted-foreground">Manufacturer not set</span>
                )}
                <span>{item.packLabel || "Pack not set"} · Stock counted in {item.unit}</span>
              </p>
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <ReviewStatus tone={batchReviewTone(item)}>{batchState(item)}</ReviewStatus>
                <span className="text-muted-foreground">
                  Opened batch {item.batchNumber || "unspecified"} · Expiry {fmtStockExpiry(item.expiryDate)}
                </span>
              </p>
            </div>
            <div className="flex flex-wrap items-start gap-3">
              <button
                type="button"
                onClick={() => selectTab("batches")}
                className="rounded-md border px-4 py-2 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary"
              >
                <span className="block text-sm text-muted-foreground">Current stock</span>
                <span className="block text-2xl font-semibold tabular-nums">{detail.product.physical} {item.unit}</span>
                <span className="block text-sm text-muted-foreground">{detail.product.held} held · {detail.product.available} available</span>
                <span className="sr-only">Show batches</span>
              </button>
              <div className="flex flex-wrap gap-2">
                {capabilities?.itemWrite && (
                  <>
                    <Button variant="outline" onClick={() => setEdit({ batchId: item.id, value: editValue(item) })}>
                      <Pencil className="h-4 w-4" /> Edit item
                    </Button>
                    <Button variant="outline" onClick={() => setEdit({ batchId: item.id, value: editValue(item), focusField: "minStockLevel" })}>
                      Set stock alert
                    </Button>
                  </>
                )}
                <InventoryAction label="Print batch label" onClick={() => window.open(`/api/inventory/workspace/labels/${item.id}`, "_blank")}>
                  <Printer className="h-4 w-4" />
                </InventoryAction>
              </div>
            </div>
          </header>
          <dl aria-label="Item details" className="grid grid-cols-2 gap-x-6 gap-y-2 border-y py-3 sm:grid-cols-3 lg:grid-cols-5">
            {([
              ...(item.form ? [
                ["Form", MEDICINE_FORMS[item.form as MedicineFormKey]?.label ?? item.form],
                ["Strength", item.isCombination ? "Combination" : item.strength || <span className="text-amber-800 dark:text-amber-200">Strength missing</span>],
              ] : []),
              ["Item code", known(item.itemCode)],
              ["Std. MRP", known(item.mrp, fmtMoney)],
              ["GST %", known(item.gstRate, (v) => `${v}%`)],
              ["HSN", known(item.hsnCode)],
              ["GTIN (barcode)", known(item.barcode)],
              ["Category", known(item.category)],
              ["Schedule", item.metadata?.schedule || (item.requiresPrescription ? "Rx required" : "Non-schedule")],
              ["Location", known(item.storageLocation)],
              ["Min qty", known(item.minStockLevel, (v) => `${v} ${item.unit}`)],
              ["Max qty", known(item.maxStockLevel, (v) => `${v} ${item.unit}`)],
              ["Margin %", known(item.margin, (v) => `${v}%`)],
            ] as const).map(([label, value]) => (
              <div key={label}>
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="font-medium">{value}</dd>
              </div>
            ))}
          </dl>
          {!capabilities?.kinds?.COUNT?.write && (
            <section className="space-y-2 rounded-md border p-4" aria-label="Batch recovery handoff">
              {item.drugs?.length > 1 && <p>This batch is linked to more than one product. Its physical product must be verified before reconciliation.</p>}
              <p>Ask a colleague who can count stock to open this batch, verify its product identity when needed, and record a fresh physical count. Viewing this batch or sharing this reference does not change stock.</p>
              <label className="block">Batch recovery reference
                <input className="mt-1 w-full rounded-md border p-2" readOnly value={`/dashboard/inventory?area=stock&view=list&item=${encodeURIComponent(item.id)}`} onFocus={(event) => event.currentTarget.select()} />
              </label>
            </section>
          )}
          {item.drugs?.length > 1 && capabilities?.kinds?.COUNT?.write && (
            <form key={`${item.id}:${item.updatedAt}`} className="space-y-3 rounded-md border p-4 print:hidden" onSubmit={async (e) => {
              e.preventDefault();
              const values = new FormData(e.currentTarget);
              setBusy(true); setError("");
              try {
                await apiClient.post("/inventory/workspace/stocktake/resolve-identity", {
                  itemId: item.id, updatedAt: item.updatedAt, productId: values.get("productId"),
                  reason: values.get("reason"), confirmed: values.get("confirmed") === "on",
                });
                await load();
                setNotice("Product identity resolved. Stock quantity has not changed. Verify the physical count before using this batch.");
              } catch (error: any) { setError(error.message); }
              finally { setBusy(false); }
            }}>
              <p className="font-medium">Resolve this batch’s product identity</p>
              <p>This batch is linked to more than one product. Verify the physical pack before choosing its product. Resolving the link does not change the stock quantity.</p>
              <label className="block">Verified product
                <select name="productId" required className="ml-2 rounded-md border p-2" defaultValue="">
                  <option value="" disabled>Select the product on the physical pack</option>
                  {item.drugs.map((drug: any) => <option key={drug.id} value={drug.id}>{drug.name}</option>)}
                </select>
              </label>
              <label className="block">Reason <input name="reason" required maxLength={500} className="ml-2 rounded-md border p-2" /></label>
              <label className="block"><input name="confirmed" type="checkbox" required /> I verified the physical product and the existing {item.unit} stock unit and pack size.</label>
              <Button disabled={busy}>Resolve product identity</Button>
            </form>
          )}
          <div className="flex flex-wrap gap-2 print:hidden">
            {canSubmitEdits && <>
              <Button variant="outline" onClick={() => setStockEdit({ item, field: "stock" })}>Edit stock</Button>
              <Button variant="outline" onClick={() => setStockEdit({ item, field: "price" })}>Edit price</Button>
            </>}
            {["HOLD", "LOSS", "SUPPLIER_RETURN"].filter((k) => capabilities?.kinds?.[k]?.write).map((k) => (
              <Button key={k} variant="outline" onClick={() => baseTask(k)}>{workflowKinds[k].label}</Button>
            ))}
            {capabilities?.kinds?.COUNT?.write && (
              <Button variant="outline" onClick={async () => {
                try {
                  const d = await apiClient.post<any>("/inventory/workspace/counts", { itemIds: [item.id], requestKey: requestKey() });
                  onDocument("COUNT", d.id);
                } catch (e: any) { setError(e.message); }
              }}>
                Count this batch
              </Button>
            )}
          </div>
          {edit && (
            <section aria-label="Batch being edited" className="space-y-2">
              <p className="font-medium">Editing batch {batchNumbers.get(edit.batchId) ?? item.batchNumber ?? "without number"}</p>
              <StockDetailsEditor
                item={[item, ...detail.batches].find((b: any) => b.id === edit.batchId)}
                value={edit.value}
                focusField={edit.focusField}
                onChange={(value) => setEdit({ ...edit, value })}
                busy={busy}
                onCancel={() => { sessionStorage.removeItem(editKey); setEdit(null); }}
                onSave={async () => {
                  setBusy(true); setError("");
                  try {
                    await apiClient.patch(`/inventory/workspace/stock/${edit.batchId}`, { ...edit.value, batchNumber: edit.value.batchNumber || undefined, expiryDate: edit.value.expiryDate || undefined });
                    sessionStorage.removeItem(editKey);
                    await load();
                    setNotice("Corrected details saved. Stock quantity unchanged.");
                  } catch (e: any) { setError(e.message); }
                  finally { setBusy(false); }
                }}
              />
            </section>
          )}
          <div role="tablist" aria-label="Item history" onKeyDown={onTabKey} className="flex flex-wrap gap-2 border-b pb-3">
            {ITEM_TABS.map(([id, label]) => (
              <Button
                key={id}
                ref={(node) => { tabRefs.current[id] = node; }}
                role="tab"
                id={`item-tab-${id}`}
                aria-selected={tab === id}
                aria-controls="item-tab-panel"
                tabIndex={tab === id ? 0 : -1}
                variant={tab === id ? "default" : "ghost"}
                onClick={() => selectTab(id)}
              >
                {label}
              </Button>
            ))}
          </div>
          <div role="tabpanel" id="item-tab-panel" aria-labelledby={`item-tab-${tab}`} className="space-y-3">
            {tab === "batches" && (
              <>
                <p className="text-sm text-muted-foreground">{detail.identityBasis}. Multiple batches can be on hand; compare expiry dates when choosing stock.</p>
                <label className="flex gap-2 text-sm">
                  <input type="checkbox" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} />
                  Hide zero quantity
                </label>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr>
                        {["Batch no.", "Qty", "Expiry", "MRP", "PTR", "Discount %", "Landing price", "Margin %", "Total by MRP", "Total by PTR", "GST %", "Actions"].map((t) => (
                          <th key={t} scope="col" className="whitespace-nowrap p-3">{t}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {visibleBatches.map((b: any) => (
                        <tr key={b.id} className={batchRowClass(b)}>
                          <th scope="row" className="min-w-44 p-3 text-left font-normal">
                            <span className="block font-medium">{b.batchNumber || "No batch"}</span>
                            <ReviewStatus tone={batchReviewTone(b)}>{batchState(b)}</ReviewStatus>
                          </th>
                          <td className={`${numberCell} whitespace-nowrap`}>
                            {b.currentStock} {b.unit}
                            {b.heldStock > 0 && <span className="block text-sm text-muted-foreground">({b.heldStock} held)</span>}
                          </td>
                          <td className="whitespace-nowrap p-3">{fmtStockExpiry(b.expiryDate)}</td>
                          <td className={numberCell}>{known(b.mrp, fmtMoney)}</td>
                          <td className={numberCell}>{known(b.costPrice, fmtMoney)}</td>
                          <td className={numberCell}>{known(b.purchaseDiscountPercent, (v) => `${v}%`)}</td>
                          <td className={numberCell}>{known(b.metadata?.landingCostPerStockUnit, fmtMoney)}</td>
                          <td className={numberCell}>{known(b.margin, (v) => `${v}%`)}</td>
                          <td className={numberCell}>{known(byMrp(b), fmtMoney)}</td>
                          <td className={numberCell}>{known(byPtr(b), fmtMoney)}</td>
                          <td className={numberCell}>{known(b.gstRate, (v) => `${v}%`)}</td>
                          <td className="min-w-72 p-3">
                            <div className="flex items-center gap-2 [&>*]:shrink-0">
                              {b.id !== item.id && <Button size="sm" variant="outline" onClick={() => navigate({ item: b.id })}>Open</Button>}
                              {capabilities?.itemWrite && (
                                <Button size="sm" variant="outline" onClick={() => setEdit({ batchId: b.id, value: editValue(b) })}>Edit</Button>
                              )}
                              <InventoryAction label={`Print label for batch ${b.batchNumber || "without number"}`} onClick={() => window.open(`/api/inventory/workspace/labels/${b.id}`, "_blank")}>
                                <Printer className="h-4 w-4" />
                              </InventoryAction>
                              {capabilities?.itemDelete && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={!b.deletable}
                                  title={b.deleteBlockedReason || undefined}
                                  aria-describedby={b.deletable ? undefined : `delete-blocked-${b.id}`}
                                  onClick={() => setDeleting(b)}
                                >
                                  Delete
                                </Button>
                              )}
                            </div>
                            {capabilities?.itemDelete && !b.deletable && (
                              <p id={`delete-blocked-${b.id}`} className="mt-1 max-w-64 text-sm text-muted-foreground">{b.deleteBlockedReason}</p>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t-2 font-semibold">
                      {(() => {
                        const qty = total((b) => b.currentStock), mrp = total(byMrp), ptr = total(byPtr);
                        const gap = (missing: number, what: string) => missing > 0 && (
                          <span className="block text-sm font-normal text-muted-foreground">{missing} without {what}</span>
                        );
                        return (
                          <tr>
                            <th scope="row" className="p-3 text-left">Total</th>
                            <td className={numberCell}>{qty.sum} {item.unit}</td>
                            <td colSpan={6} />
                            <td className={numberCell}>{fmtMoney(mrp.sum)}{gap(mrp.missing, "MRP")}</td>
                            <td className={numberCell}>{fmtMoney(ptr.sum)}{gap(ptr.missing, "PTR")}</td>
                            <td colSpan={2} />
                          </tr>
                        );
                      })()}
                    </tfoot>
                  </table>
                </div>
              </>
            )}
            {tab === "purchases" && (
              <ul className="divide-y">
                {detail.purchases.map((p: any) => (
                  <li key={p.id} className="flex flex-wrap justify-between gap-3 py-3">
                    <button className="underline" onClick={() => onInvoice(p.id)}>{p.invoiceNumber} · {p.distributorName}</button>
                    <span>{displayUtcDate(p.invoiceDate)} · {fmtMoney(p.netPayable)} · {p.status}</span>
                  </li>
                ))}
                {!detail.purchases.length && <li className="py-5 text-muted-foreground">No linked purchase bills found.</li>}
              </ul>
            )}
            {(tab === "purchase-returns" || tab === "sales-returns") && (() => {
              const kind = tab === "purchase-returns" ? "SUPPLIER_RETURN" : "SALES_RETURN";
              const rows = detail.history.filter((h: any) => h.document.kind === kind);
              return (
                <ul className="divide-y">
                  {rows.map((h: any) => (
                    <li key={h.id} className="flex flex-wrap justify-between gap-3 py-3">
                      <button className="underline" onClick={() => onDocument(h.document.kind, h.document.id)}>{h.document.reference}</button>
                      <span>
                        Batch {batchNumbers.get(h.inventoryId) ?? "unknown"} · {h.document.status} · Physical {h.quantityDelta} · Held {h.heldDelta} {item.unit}
                        <span className="block text-sm text-muted-foreground">
                          {displayClinicDate(h.document.createdAt)} · {h.document.createdBy} · {h.document.payload?.reason || "No reason recorded"}
                        </span>
                      </span>
                    </li>
                  ))}
                  {!rows.length && <li className="py-5 text-muted-foreground">No {tab === "purchase-returns" ? "purchase" : "sales"} returns for this item.</li>}
                </ul>
              );
            })()}
            {tab === "blocked-stock" && (
              <section className="space-y-3">
                <h3 className="font-semibold">Held stock by source</h3>
                {detail.holdsRestricted ? (
                  <p>Access to held-stock documents is required to view these details.</p>
                ) : (
                  <ul className="divide-y">
                    {(detail.holds || []).map((h: any) => (
                      <li key={h.id} className="flex flex-wrap justify-between gap-3 py-3 text-sm">
                        <button className="underline" onClick={() => onDocument(h.kind, h.id)}>{h.reference}</button>
                        <span>
                          {h.remainingHeld} {item.unit} still held · {h.status}
                          <span className="block text-sm text-muted-foreground">
                            {displayClinicDate(h.createdAt)} · {h.ownerName} · {h.reason || "No reason recorded"}
                          </span>
                        </span>
                      </li>
                    ))}
                    {!detail.holds?.length && <li className="py-5 text-muted-foreground">No held-stock history for this item.</li>}
                  </ul>
                )}
              </section>
            )}
            {tab === "ledger" && ledger && (
              <>
                <LedgerReconciliation ledger={ledger} unit={item.unit} batchNumbers={batchNumbers} />
                <p className="text-sm text-muted-foreground">
                  Opened batch {item.batchNumber || "unspecified"}: {stockLedgerExplanation(detail.ledger, item.unit)}{" "}
                  {capabilities?.kinds?.COUNT?.write
                    ? "Use Count this batch to record a fresh physical observation. Applying an approved count may adjust stock; starting a count does not."
                    : "Use the batch recovery reference above to ask an authorized colleague to review the evidence and record a fresh count."}
                </p>
                <LedgerFilters
                  filter={ledgerFilter}
                  onChange={setLedgerFilter}
                  shown={filterLedgerRows(ledger.rows, ledgerFilter)}
                  total={ledger.rows.length}
                  fileName={`item-ledger-${(item.productName || item.name).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`}
                />
                <LedgerTable
                  rows={filterLedgerRows(ledger.rows, ledgerFilter)}
                  approve={!!capabilities?.approve}
                  onDocument={onDocument}
                  onInvoice={onInvoice}
                  onCorrect={(row) => setCorrection({ transactionId: row.id, correctDelta: row.delta, reason: "", requestKey: requestKey() })}
                />
              </>
            )}
            {tab === "sales" && ledger && (
              <LedgerTable
                rows={ledger.rows.filter((row) => row.kind === "SALE")}
                approve={!!capabilities?.approve}
                onDocument={onDocument}
                onInvoice={onInvoice}
                onCorrect={(row) => setCorrection({ transactionId: row.id, correctDelta: row.delta, reason: "", requestKey: requestKey() })}
              />
            )}
            {correction && (
              <form className="flex flex-wrap items-end gap-3 border p-4" onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const d = await apiClient.post<any>("/inventory/workspace/movement-corrections", correction);
                  setCorrection(null);
                  onDocument("CORRECTION", d.id);
                } catch (e: any) { setError(e.message); }
              }}>
                <label className="text-sm">
                  Correct signed quantity
                  <input className={inputClass} type="number" value={correction.correctDelta ?? ""}
                    onChange={(e) => setCorrection({ ...correction, correctDelta: Number(e.target.value) })} />
                </label>
                <label className="flex-1 text-sm">
                  Reason
                  <input className={inputClass} required value={correction.reason}
                    onChange={(e) => setCorrection({ ...correction, reason: e.target.value })} />
                </label>
                <Button>Post linked correction</Button>
                <Button type="button" variant="outline" onClick={() => setCorrection(null)}>Cancel</Button>
              </form>
            )}
            {tab === "information" && (
              <dl className="grid gap-3 sm:grid-cols-2">
                {[
                  ["Category", item.category],
                  ["Manufacturer", item.manufacturer || "Optional; not recorded"],
                  ["HSN", item.hsnCode],
                  ["GST", item.gstRate],
                  ["Barcode", item.barcode],
                  ["SKU", item.sku],
                  ["Missing details", item.issues.join(", ") || "None"],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-sm text-muted-foreground">{k}</dt>
                    <dd>{v ?? "—"}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
          <Dialog open={!!deleting} onOpenChange={(open: boolean) => !open && setDeleting(null)}>
            <DialogContent role="alertdialog" className="inventory-surface">
              <DialogHeader>
                <DialogTitle>Delete batch {deleting?.batchNumber || "without number"}?</DialogTitle>
                <DialogDescription>
                  This permanently removes an empty batch record with no stock movements or workflow history. It cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
                <Button variant="destructive" disabled={busy} onClick={() => removeBatch(deleting)}>Delete batch</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
      {stockEdit && <StockEditDialog item={stockEdit.item} field={stockEdit.field}
        onClose={() => setStockEdit(null)} onSubmitted={() => { setStockEdit(null); setNotice("Submitted for doctor or admin approval."); }} />}
    </div>
  );
}

function LedgerReconciliation({ ledger, unit, batchNumbers }: { ledger: ItemLedger; unit: string; batchNumbers: Map<string, string> }) {
  const off = ledger.batches.filter((b) => b.matches !== true);
  const breaks = ledger.rows.filter((row) => row.chainBreak).length;
  const clean = ledger.matches && breaks === 0;
  return (
    <div className="space-y-2">
      <p className="flex flex-wrap items-center gap-2">
        <ReviewStatus tone={clean ? "success" : "warning"}>
          {clean ? "Ledger matches stock on hand" : ledger.matches ? "Matches only after unrecorded changes" : "Ledger does not match"}
        </ReviewStatus>
        <span>
          Ledger closes at {ledger.closing == null ? "an unknown balance" : `${ledger.closing} ${unit}`}; stock on hand is {ledger.currentStock} {unit}.
        </span>
        {breaks > 0 && <span>{breaks} {breaks === 1 ? "entry shows" : "entries show"} stock that changed without a ledger entry; marked below.</span>}
      </p>
      {off.length > 0 && (
        <ul role="alert" className="list-disc rounded-md border border-amber-600 bg-amber-50 p-3 pl-8 text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          {off.map((b) => (
            <li key={b.batchId}>
              Batch {batchNumbers.get(b.batchId) ?? b.batchId}:{" "}
              {b.closing == null
                ? `ledger balance unknown; on hand ${b.currentStock} ${unit}.`
                : `ledger closes at ${b.closing} ${unit}; on hand ${b.currentStock} ${unit}.`}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LedgerFilters({ filter, onChange, shown, total, fileName }: {
  filter: LedgerFilter; onChange: (filter: LedgerFilter) => void; shown: ItemLedgerRow[]; total: number; fileName: string;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-sm">From
        <input type="date" className={inputClass} value={filter.from} onChange={(e) => onChange({ ...filter, from: e.target.value })} />
      </label>
      <label className="text-sm">To
        <input type="date" className={inputClass} value={filter.to} onChange={(e) => onChange({ ...filter, to: e.target.value })} />
      </label>
      <label className="text-sm">Type
        <select className={inputClass} value={filter.kind} onChange={(e) => onChange({ ...filter, kind: e.target.value as LedgerKind | "" })}>
          <option value="">All types</option>
          {Object.entries(LEDGER_KIND_LABEL).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}
        </select>
      </label>
      <Button variant="outline" disabled={!shown.length} onClick={() => downloadCsv(fileName, ledgerCsvRows(shown))}>
        <Download className="h-4 w-4" /> Download CSV
      </Button>
      <p role="status" className="text-sm text-muted-foreground">Showing {shown.length} of {total} entries. Filters hide rows; closings stay as recorded.</p>
    </div>
  );
}

function DocumentCell({ row, onDocument, onInvoice }: { row: ItemLedgerRow; onDocument: (kind: string, id: string) => void; onInvoice: (id: string) => void }) {
  const label = documentLabel(row) || "—";
  const doc = row.document;
  const link = doc?.type === "WORKFLOW" ? <button className="underline" onClick={() => onDocument(doc.kind, doc.id)}>{label}</button>
    : doc?.type === "PURCHASE_INVOICE" ? <button className="underline" onClick={() => onInvoice(doc.id)}>{label}</button>
    : doc?.type === "PHARMACY_INVOICE" ? <a className="underline" href={billHref({ bill: doc.id })}>{label}</a>
    : <span>{label}</span>;
  return (
    <>
      {link}
      {row.reference && row.reference !== label && <span className="block text-sm text-muted-foreground">{row.reference}</span>}
    </>
  );
}

function CorrectionAction({ row, onDocument, onInvoice, onCorrect }: {
  row: ItemLedgerRow; onDocument: (kind: string, id: string) => void; onInvoice: (id: string) => void; onCorrect: (row: ItemLedgerRow) => void;
}) {
  const owner = row.owner;
  if (owner?.type === "workflow") return <Button size="sm" variant="outline" onClick={() => onDocument(owner.kind, owner.id)}>Open source correction</Button>;
  if (owner?.type === "purchase") return <Button size="sm" variant="outline" onClick={() => onInvoice(owner.id)}>Open purchase correction</Button>;
  if (owner?.type === "sale")
    return <a className="underline" href={billHref({ bill: owner.id })}>Open original sale</a>;
  if (row.correctionAllowed) return <Button size="sm" variant="outline" onClick={() => onCorrect(row)}>Correct</Button>;
  return <span>Source document needs identification before correction.</span>;
}

function LedgerTable({ rows, approve, onDocument, onInvoice, onCorrect }: {
  rows: ItemLedgerRow[]; approve: boolean; onDocument: (kind: string, id: string) => void; onInvoice: (id: string) => void; onCorrect: (row: ItemLedgerRow) => void;
}) {
  const headings = ["Bill No. / Sr. No.", "Entry date", "Type", "Batch", "In", "Out", "Batch closing", "Item closing", "Customer / Distributor", "By", "Action"];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr>{headings.map((t) => <th key={t} scope="col" className="whitespace-nowrap p-3">{t}</th>)}</tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => {
            const warn = row.chainBreak ? "bg-amber-50 dark:bg-amber-950/30" : undefined;
            return [
              <tr key={row.id} data-ledger-row={row.id} className={warn}>
                <td className="p-3"><DocumentCell row={row} onDocument={onDocument} onInvoice={onInvoice} /></td>
                <td className="whitespace-nowrap p-3 tabular-nums">{displayClinicDateTime(row.at)}</td>
                <td className="p-3">
                  {LEDGER_KIND_LABEL[row.kind]}
                  <span className="block text-sm text-muted-foreground">{row.channelLabel}</span>
                </td>
                <td className="p-3">{row.batchNumber || "No batch"}</td>
                <td className={numberCell}>{row.in ?? (row.delta == null ? "Unknown" : "")}</td>
                <td className={numberCell}>{row.out ?? ""}</td>
                <td className={numberCell}>{row.batchClosing ?? "Unknown"}</td>
                <td className={numberCell}>{row.itemClosing ?? "Unknown"}</td>
                <td className="p-3">{row.counterparty || "—"}</td>
                <td className="p-3">{row.actor?.name || "—"}</td>
                <td className="p-3">{approve && <CorrectionAction row={row} onDocument={onDocument} onInvoice={onInvoice} onCorrect={onCorrect} />}</td>
              </tr>,
              row.chainBreak && (
                <tr key={`${row.id}:break`} className={warn}>
                  <td colSpan={headings.length} className="px-3 pb-3">
                    <ReviewStatus tone="warning">{chainBreakNote(row.chainBreak)}</ReviewStatus>
                  </td>
                </tr>
              ),
            ];
          })}
          {!rows.length && (
            <tr><td colSpan={headings.length} className="p-6 text-center text-muted-foreground">No ledger entries match.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
