"use client";
import { useDashboardUser } from "@/components/layout/dashboard-user-context";
import { useEffect, useState } from "react";
import { ArrowLeft, Search, Printer, Download, Plus } from "lucide-react";
import { apiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { AddInventoryItemDialog } from "./AddInventoryItemDialog";
import {
  fmtMoney,
  fmtDate,
  inputClass,
  downloadCsv,
  requestKey,
  workflowKinds,
} from "./workspace-model";

type Props = {
  query: Record<string, string>;
  navigate: (changes: Record<string, string>) => void;
  itemId?: string;
  capabilities: any;
  onTask: (kind: string, initial?: any) => void;
  onDocument: (kind: string, id: string) => void;
  onInvoice: (id: string) => void;
  onBack?: () => void;
};
/**
 * @cc [owner:nareshshah139,label:product;target] inventory-filter-parity
 * The stock list MUST offer every documented inventory filter and distinguish an unapplied
 * search, an empty result and a failed request; pagination MUST preserve the active filters.
 * Acceptance: INV-03. Validation and open gaps:
 * docs/qa/inventory-workflow-contract-review.md. This is a target obligation, not a pass claim.
 */
/**
 * @cc [owner:nareshshah139,label:product;target] inventory-item-batch-workspace
 * Opening an item MUST expose its batches and linked purchase, purchase-return, sale, sales-
 * return, movement, blocked-stock and additional-information histories without losing item
 * context.
 * Acceptance: INV-06. Validation and open gaps:
 * docs/qa/inventory-workflow-contract-review.md. This is a target obligation, not a pass claim.
 */
/**
 * @cc [owner:nareshshah139,label:product;target] inventory-code-lookup-and-labels
 * Barcode/QR lookup and printed labels MUST resolve the intended branch item or batch
 * without changing stock; unknown or ambiguous codes MUST show a recoverable result.
 * Acceptance: INV-39. Validation and open gaps:
 * docs/qa/inventory-workflow-contract-review.md. This is a target obligation, not a pass claim.
 */
export function WorkspaceStock({
  query,
  navigate,
  itemId,
  capabilities,
  onTask,
  onDocument,
  onInvoice,
  onBack,
}: Props) {
  const { user } = useDashboardUser();
  const editKey = `inventory-item-edit:${user?.branchId}:${user?.id}:${itemId}`;
  const [data, setData] = useState<any>(null),
    [detail, setDetail] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [filters, setFilters] = useState(false),
    [search, setSearch] = useState(query.search || ""),
    [add, setAdd] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [edit, setEdit] = useState<any>(null),
    [notice, setNotice] = useState(""),
    [tab, setTab] = useState("batches"),
    [correction, setCorrection] = useState<any>(null),
    [hideZero, setHideZero] = useState(false),
    [location, setLocation] = useState(""),
    [locationReason, setLocationReason] = useState(""),
    [showLocation, setShowLocation] = useState(false);
  const load = async () => {
    setBusy(true);
    setError("");
    try {
      if (itemId) {
        const d = await apiClient.get<any>(
          `/inventory/workspace/stock/${itemId}`,
        );
        setDetail(d);
        try {
          const recovered = JSON.parse(
            sessionStorage.getItem(editKey) || "null",
          );
          setEdit(recovered);
          if (recovered)
            setNotice(
              recovered.updatedAt === d.item.updatedAt
                ? "Restored unsaved product details."
                : "This product changed since your edits. Saving will require reloading the current record.",
            );
        } catch {
          setEdit(null);
        }
      } else
        setData(
          await apiClient.get(
            "/inventory/workspace/stock?" + new URLSearchParams(query),
          ),
        );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void load();
  }, [itemId, JSON.stringify(query)]);
  useEffect(() => {
    if (edit && itemId)
      try {
        sessionStorage.setItem(editKey, JSON.stringify(edit));
      } catch {
        setNotice("Browser recovery unavailable; save before leaving.");
      }
  }, [edit, editKey, itemId]);
  const filter = (key: string, value: string) =>
    navigate({ [key]: value, page: "1", item: "" });
  const count = async () => {
    setBusy(true);
    try {
      const d = await apiClient.post<any>("/inventory/workspace/counts", {
        filters: query,
        itemIds: selected,
        requestKey: requestKey(),
      });
      onDocument("COUNT", d.id);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const download = async () => {
    setBusy(true);
    try {
      const first = await apiClient.get<any>(
        "/inventory/workspace/stock?" +
          new URLSearchParams({ ...query, page: "1", limit: "100" }),
      );
      const rows = [...first.rows];
      for (let page = 2; page <= first.totalPages; page++)
        rows.push(
          ...(
            await apiClient.get<any>(
              "/inventory/workspace/stock?" +
                new URLSearchParams({
                  ...query,
                  page: String(page),
                  limit: "100",
                }),
            )
          ).rows,
        );
      downloadCsv(
        "inventory-stock.csv",
        rows.map((r: any) => ({
          Product: r.name,
          Batch: r.batchNumber,
          Expiry: r.expiryDate,
          Unit: r.unit,
          Physical: r.currentStock,
          Held: r.heldStock,
          Available: r.available,
          PTR: r.costPrice,
          MRP: r.mrp,
          Minimum: r.minStockLevel,
          Maximum: r.maxStockLevel,
          Location: r.storageLocation,
          HSN: r.hsnCode,
          GST: r.gstRate,
        })),
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const item = detail?.item;
  const baseTask = (kind: string) =>
    onTask(kind, {
      payload: {
        reason: "",
        lines: [
          {
            id: requestKey(),
            inventoryId: item.id,
            name: item.name,
            unit: item.unit,
            quantity: 1,
            unitPrice: item.costPrice,
            batchNumber: item.batchNumber,
            expiryDate: item.expiryDate,
          },
        ],
      },
    });
  return (
    <div className="space-y-5">
      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive p-3 text-destructive"
        >
          {error}{" "}
          <button className="underline" onClick={load}>
            Retry
          </button>
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-md border p-3">
          {notice}
        </p>
      )}
      {itemId ? (
        <>
          <Button
            variant="ghost"
            onClick={() => (onBack ? onBack() : navigate({ item: "" }))}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to stock list
          </Button>
          {item && (
            <>
              <header className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-semibold">{item.name}</h2>
                  <p className="text-muted-foreground">
                    {item.batchNumber || "Batch unspecified"} · Expiry{" "}
                    {fmtDate(item.expiryDate)} ·{" "}
                    {item.storageLocation || "Location not assigned"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {capabilities?.itemWrite && (
                    <Button
                      variant="outline"
                      onClick={() => setEdit({ ...item, ...item.metadata })}
                    >
                      Edit product details
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    onClick={() =>
                      window.open(
                        `/api/inventory/workspace/labels/${item.id}`,
                        "_blank",
                      )
                    }
                  >
                    <Printer className="h-4 w-4" />
                    Print batch label
                  </Button>
                </div>
              </header>
              <dl className="grid grid-cols-2 gap-x-8 gap-y-4 border-y py-5 sm:grid-cols-4">
                <div>
                  <dt className="text-sm text-muted-foreground">
                    Physical stock
                  </dt>
                  <dd className="text-xl font-semibold">
                    {item.currentStock} {item.unit}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">Held</dt>
                  <dd className="text-xl font-semibold">
                    {item.heldStock} {item.unit}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">
                    Available to sell
                  </dt>
                  <dd className="text-xl font-semibold">
                    {item.available} {item.unit}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">
                    Minimum / maximum
                  </dt>
                  <dd className="text-xl font-semibold">
                    {item.minStockLevel ?? "—"} / {item.maxStockLevel ?? "—"}{" "}
                    {item.unit}
                  </dd>
                </div>
              </dl>
              <p className="text-sm">
                {item.baseQuantity == null
                  ? "Pack conversion needs verification."
                  : `Physical equivalent: ${item.baseQuantity} base units (${item.baseFactor} per ${item.unit}).`}{" "}
                {item.packQuantity != null && (
                  <span>
                    {" "}
                    Verified pack equivalent: {item.packQuantity}{" "}
                    {item.packEquivalentUnit}.{" "}
                  </span>
                )}{" "}
                PTR {fmtMoney(item.costPrice)} · MRP {fmtMoney(item.mrp)} ·
                Margin {item.margin == null ? "unknown" : `${item.margin}%`}.{" "}
                {item.priceBasis}.
              </p>
              <div className="flex flex-wrap gap-2 print:hidden">
                {["HOLD", "LOSS", "SUPPLIER_RETURN"]
                  .filter((k) => capabilities?.kinds?.[k]?.write)
                  .map((k) => (
                    <Button
                      key={k}
                      variant="outline"
                      onClick={() => baseTask(k)}
                    >
                      {workflowKinds[k].label}
                    </Button>
                  ))}
                {capabilities?.kinds?.COUNT?.write && (
                  <Button
                    variant="outline"
                    onClick={async () => {
                      try {
                        const d = await apiClient.post<any>(
                          "/inventory/workspace/counts",
                          { itemIds: [item.id], requestKey: requestKey() },
                        );
                        onDocument("COUNT", d.id);
                      } catch (e: any) {
                        setError(e.message);
                      }
                    }}
                  >
                    Count this batch
                  </Button>
                )}
              </div>
              {edit && (
                <form
                  className="space-y-4 border-y py-5"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setBusy(true);
                    try {
                      await apiClient.patch(
                        `/inventory/workspace/stock/${item.id}`,
                        edit,
                      );
                      sessionStorage.removeItem(editKey);
                      await load();
                      setNotice(
                        "Product details saved. Physical stock unchanged.",
                      );
                    } catch (e: any) {
                      setError(e.message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <h3 className="text-lg font-semibold">Product details</h3>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      ["name", "Product name"],
                      ["manufacturer", "Manufacturer (optional)"],
                      ["category", "Category"],
                      ["subCategory", "Subcategory"],
                      ["genericName", "Composition / generic"],
                      ["dosageForm", "Dosage form"],
                      ["schedule", "Schedule"],
                      ["hsnCode", "HSN"],
                      ["gstRate", "GST %"],
                      ["storageLocation", "Rack / shelf / bin"],
                      ["minStockLevel", `Minimum (${item.unit})`],
                      ["maxStockLevel", `Maximum (${item.unit})`],
                      ["reorderLevel", `Reorder at (${item.unit})`],
                      ["reason", "Reason for target / metadata change"],
                      ["barcode", "Barcode"],
                      ["sku", "SKU"],
                    ].map(([key, label]) => (
                      <label key={key} className="text-sm">
                        {label}
                        <input
                          className={inputClass}
                          value={edit[key] ?? ""}
                          onChange={(e) =>
                            setEdit({ ...edit, [key]: e.target.value })
                          }
                        />
                      </label>
                    ))}
                    <label className="text-sm">
                      Availability
                      <select
                        className={inputClass}
                        value={edit.status}
                        onChange={(e) =>
                          setEdit({ ...edit, status: e.target.value })
                        }
                      >
                        <option>ACTIVE</option>
                        <option>INACTIVE</option>
                        <option>DISCONTINUED</option>
                      </select>
                    </label>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Manual min/max edits are protected from automatic target
                    changes. Batch units and historical prices remain on their
                    original receipts.
                  </p>
                  <div className="flex gap-2">
                    <Button disabled={busy}>Save product details</Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        sessionStorage.removeItem(editKey);
                        setEdit(null);
                      }}
                    >
                      Discard edits
                    </Button>
                  </div>
                </form>
              )}
              <nav
                aria-label="Item history"
                className="flex flex-wrap gap-2 border-b pb-3"
              >
                {[
                  "batches",
                  "purchases",
                  "purchase returns",
                  "sales",
                  "sales returns",
                  "ledger",
                  "blocked stock",
                  "information",
                ].map((t) => (
                  <Button
                    key={t}
                    variant={tab === t ? "default" : "ghost"}
                    onClick={() => setTab(t)}
                  >
                    {t[0].toUpperCase() + t.slice(1)}
                  </Button>
                ))}
              </nav>
              {tab === "batches" && (
                <>
                  <label className="flex gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={hideZero}
                      onChange={(e) => setHideZero(e.target.checked)}
                    />
                    Hide zero-stock batches
                  </label>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr>
                          {[
                            "Batch",
                            "Expiry",
                            "Physical",
                            "Held",
                            "Available",
                            "Unit",
                            "Base equivalent",
                            "PTR",
                            "MRP",
                            "Landing price",
                            "Margin",
                            "GST",
                            "Location",
                          ].map((t) => (
                            <th key={t} className="p-3">
                              {t}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {detail.batches
                          .filter((b: any) => !hideZero || b.currentStock !== 0)
                          .map((b: any) => (
                            <tr key={b.id}>
                              <td className="p-3">
                                <button
                                  className="font-medium underline"
                                  onClick={() => navigate({ item: b.id })}
                                >
                                  {b.batchNumber || "No batch"}
                                </button>
                              </td>
                              <td>{fmtDate(b.expiryDate)}</td>
                              <td>{b.currentStock}</td>
                              <td>{b.heldStock}</td>
                              <td>{b.available}</td>
                              <td>{b.unit}</td>
                              <td>{b.baseQuantity ?? "Unknown"}</td>
                              <td>{fmtMoney(b.costPrice)}</td>
                              <td>{fmtMoney(b.mrp)}</td>
                              <td>
                                {b.metadata.landingCostPerStockUnit == null
                                  ? "Unknown"
                                  : fmtMoney(
                                      b.metadata.landingCostPerStockUnit,
                                    )}
                              </td>
                              <td>{b.margin ?? "Unknown"}%</td>
                              <td>{b.gstRate ?? "Unknown"}%</td>
                              <td>{b.storageLocation || "—"}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              {tab === "purchases" && (
                <ul className="divide-y">
                  {detail.purchases.map((p: any) => (
                    <li
                      key={p.id}
                      className="flex flex-wrap justify-between gap-3 py-3"
                    >
                      <button
                        className="underline"
                        onClick={() => onInvoice(p.id)}
                      >
                        {p.invoiceNumber} · {p.distributorName}
                      </button>
                      <span>
                        {fmtDate(p.invoiceDate)} · {fmtMoney(p.netPayable)} ·{" "}
                        {p.status}
                      </span>
                    </li>
                  ))}
                  {!detail.purchases.length && (
                    <li className="py-5 text-muted-foreground">
                      No linked purchase bills found.
                    </li>
                  )}
                </ul>
              )}
              {["purchase returns", "sales returns"].includes(tab) && (
                <ul className="divide-y">
                  {detail.history
                    .filter((h: any) =>
                      tab === "blocked stock"
                        ? h.heldDelta !== 0
                        : h.document.kind ===
                          (tab === "purchase returns"
                            ? "SUPPLIER_RETURN"
                            : "SALES_RETURN"),
                    )
                    .map((h: any) => (
                      <li
                        key={h.id}
                        className="flex flex-wrap justify-between gap-3 py-3"
                      >
                        <button
                          className="underline"
                          onClick={() =>
                            onDocument(h.document.kind, h.document.id)
                          }
                        >
                          {h.document.reference}
                        </button>
                        <span>
                          {h.document.status} · Physical {h.quantityDelta} ·
                          Held {h.heldDelta} {item.unit}
                          <span className="block text-xs text-muted-foreground">
                            {fmtDate(h.document.createdAt)} ·{" "}
                            {h.document.createdBy} ·{" "}
                            {h.document.payload?.reason || "No reason recorded"}
                          </span>
                        </span>
                      </li>
                    ))}
                </ul>
              )}
              {tab === "blocked stock" && (
                <section className="space-y-3">
                  <h3 className="font-semibold">Held stock by source</h3>
                  {detail.holdsRestricted ? (
                    <p>
                      Access to held-stock documents is required to view these
                      details.
                    </p>
                  ) : (
                    <ul className="divide-y">
                      {(detail.holds || []).map((h: any) => (
                        <li
                          key={h.id}
                          className="flex flex-wrap justify-between gap-3 py-3 text-sm"
                        >
                          <button
                            className="underline"
                            onClick={() => onDocument(h.kind, h.id)}
                          >
                            {h.reference}
                          </button>
                          <span>
                            {h.remainingHeld} {item.unit} still held ·{" "}
                            {h.status}
                            <span className="block text-xs text-muted-foreground">
                              {fmtDate(h.createdAt)} · {h.ownerName} ·{" "}
                              {h.reason || "No reason recorded"}
                            </span>
                          </span>
                        </li>
                      ))}
                      {!detail.holds?.length && (
                        <li className="py-5 text-muted-foreground">
                          No held-stock history for this batch.
                        </li>
                      )}
                    </ul>
                  )}
                </section>
              )}
              {["ledger", "sales"].includes(tab) && (
                <>
                  <p className="text-sm text-muted-foreground">
                    Opening balance:{" "}
                    {detail.openingBalance ??
                      "Unresolved historical adjustment direction"}
                    . Quantities use {item.unit}.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr>
                          {[
                            "Date",
                            "Reference",
                            "Type",
                            "In / out",
                            "Closing",
                            "Reason",
                            "Action",
                          ].map((t) => (
                            <th className="p-3" key={t}>
                              {t}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {detail.movements
                          .filter(
                            (m: any) => tab !== "sales" || m.type === "SALE",
                          )
                          .map((m: any) => (
                            <tr key={m.id}>
                              <td className="p-3">
                                {new Date(m.createdAt).toLocaleString("en-IN")}
                              </td>
                              <td className="p-3">
                                {(() => {
                                  const h = detail.history.find(
                                    (h: any) => h.transactionId === m.id,
                                  );
                                  const p = detail.purchases.find(
                                    (p: any) =>
                                      p.stockCommitReference === m.reference ||
                                      p.invoiceNumber === m.reference,
                                  );
                                  return h ? (
                                    <button
                                      className="underline"
                                      onClick={() =>
                                        onDocument(
                                          h.document.kind,
                                          h.document.id,
                                        )
                                      }
                                    >
                                      {m.reference}
                                    </button>
                                  ) : p ? (
                                    <button
                                      className="underline"
                                      onClick={() => onInvoice(p.id)}
                                    >
                                      {m.reference}
                                    </button>
                                  ) : (
                                    m.reference || "—"
                                  );
                                })()}
                                <span className="block text-xs text-muted-foreground">
                                  {m.performedBy || m.userId}
                                </span>
                              </td>
                              <td className="p-3">{m.type}</td>
                              <td className="p-3">
                                {m.delta == null
                                  ? "Unknown"
                                  : m.delta > 0
                                    ? `+${m.delta}`
                                    : m.delta}
                              </td>
                              <td className="p-3">{m.closing ?? "—"}</td>
                              <td className="p-3">{m.reason || "—"}</td>
                              <td className="p-3">
                                {capabilities?.approve &&
                                  (() => {
                                    const h = detail.history.find(
                                        (h: any) => h.transactionId === m.id,
                                      ),
                                      p = detail.purchases.find(
                                        (p: any) =>
                                          p.stockCommitReference ===
                                            m.reference ||
                                          p.invoiceNumber === m.reference,
                                      );
                                    return h ? (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() =>
                                          onDocument(
                                            h.document.kind,
                                            h.document.id,
                                          )
                                        }
                                      >
                                        Open source correction
                                      </Button>
                                    ) : p ? (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => onInvoice(p.id)}
                                      >
                                        Open purchase correction
                                      </Button>
                                    ) : m.correctionAllowed === false ? (
                                      m.owner?.type === "sale" ? (
                                        <a
                                          className="underline"
                                          href={`/dashboard/pharmacy/invoices?search=${encodeURIComponent(m.reference || "")}`}
                                        >
                                          Open original sale
                                        </a>
                                      ) : m.owner?.type === "workflow" ? (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() =>
                                            onDocument(m.owner.kind, m.owner.id)
                                          }
                                        >
                                          Open source correction
                                        </Button>
                                      ) : m.owner?.type === "purchase" ? (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => onInvoice(m.owner.id)}
                                        >
                                          Open purchase correction
                                        </Button>
                                      ) : (
                                        <span>
                                          Source document needs identification
                                          before correction.
                                        </span>
                                      )
                                    ) : (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() =>
                                          setCorrection({
                                            transactionId: m.id,
                                            correctDelta: m.delta,
                                            reason: "",
                                            requestKey: requestKey(),
                                          })
                                        }
                                      >
                                        Correct
                                      </Button>
                                    );
                                  })()}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              {correction && (
                <form
                  className="flex flex-wrap items-end gap-3 border p-4"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      const d = await apiClient.post<any>(
                        "/inventory/workspace/movement-corrections",
                        correction,
                      );
                      setCorrection(null);
                      onDocument("CORRECTION", d.id);
                    } catch (e: any) {
                      setError(e.message);
                    }
                  }}
                >
                  <label className="text-sm">
                    Correct signed quantity
                    <input
                      className={inputClass}
                      type="number"
                      value={correction.correctDelta ?? ""}
                      onChange={(e) =>
                        setCorrection({
                          ...correction,
                          correctDelta: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <label className="flex-1 text-sm">
                    Reason
                    <input
                      className={inputClass}
                      required
                      value={correction.reason}
                      onChange={(e) =>
                        setCorrection({ ...correction, reason: e.target.value })
                      }
                    />
                  </label>
                  <Button>Post linked correction</Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCorrection(null)}
                  >
                    Cancel
                  </Button>
                </form>
              )}
              {tab === "information" && (
                <dl className="grid gap-3 sm:grid-cols-2">
                  {[
                    ["Category", item.category],
                    [
                      "Manufacturer",
                      item.manufacturer || "Optional; not recorded",
                    ],
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
            </>
          )}
        </>
      ) : (
        <>
          <header className="flex flex-wrap justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold">Stock</h2>
              <p className="text-muted-foreground">
                Find a batch, see what is available, and take the next action.
              </p>
            </div>
            <div className="flex gap-2">
              {capabilities?.itemCreate && (
                <Button onClick={() => setAdd(true)}>
                  <Plus className="h-4 w-4" />
                  Add product / batch
                </Button>
              )}
              <Button
                variant="outline"
                onClick={download}
                disabled={busy || !data?.total}
              >
                <Download className="h-4 w-4" />
                Export
              </Button>
            </div>
          </header>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (search.startsWith("purchase:")) {
                onInvoice(search.slice(9));
                return;
              }
              if (search.startsWith("inventory-document:")) {
                try {
                  const d = await apiClient.get<any>(
                    `/inventory/workspace/documents/${encodeURIComponent(search.slice(19))}`,
                  );
                  onDocument(d.kind, d.id);
                } catch (e: any) {
                  setError(e.message);
                }
                return;
              }
              filter("search", search);
            }}
          >
            <label className="min-w-60 flex-1">
              <span className="sr-only">Search stock</span>
              <input
                className={inputClass}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Product, generic, batch, barcode or SKU"
              />
            </label>
            <Button type="submit">
              <Search className="h-4 w-4" />
              Search
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setFilters(!filters)}
              aria-expanded={filters}
            >
              Filters
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setSearch("");
                navigate(
                  Object.fromEntries(
                    Object.keys(query)
                      .filter((k) => !["area", "view"].includes(k))
                      .map((k) => [k, ""]),
                  ),
                );
              }}
            >
              Reset
            </Button>
          </form>
          <div className="flex flex-wrap gap-2">
            {[
              ["", "All stock"],
              ["LOW", "Low stock"],
              ["HIGH", "Above maximum"],
              ["POSITIVE", "Positive"],
              ["ZERO", "Out of stock"],
              ["NEGATIVE", "Negative"],
              ["HELD", "Held"],
              ["EXPIRED", "Expired"],
            ].map(([v, t]) => (
              <Button
                size="sm"
                key={v}
                variant={(query.stock || "") === v ? "default" : "outline"}
                onClick={() => filter("stock", v)}
              >
                {t}
              </Button>
            ))}
            {[1, 2, 3, 6].map((n) => (
              <Button
                size="sm"
                key={n}
                variant={
                  query.expiryMonths === String(n) ? "default" : "outline"
                }
                onClick={() =>
                  navigate({ expiryMonths: String(n), stock: "", page: "1" })
                }
              >
                Expires in {n} {n === 1 ? "month" : "months"}
              </Button>
            ))}
          </div>
          {filters && (
            <fieldset className="grid gap-3 border-y py-4 sm:grid-cols-2 lg:grid-cols-4">
              <legend className="sr-only">Stock filters</legend>
              {[
                ["category", "Category"],
                ["subCategory", "Subcategory"],
                ["type", "Product type"],
                ["unit", "Stock unit"],
                ["manufacturer", "Manufacturer"],
                ["supplier", "Supplier"],
                ["storageLocation", "Rack / shelf / bin"],
                ["status", "Item status"],
              ].map(([key, label]) => (
                <label className="text-sm" key={key}>
                  {label}
                  <select
                    className={inputClass}
                    value={query[key] || ""}
                    onChange={(e) => filter(key, e.target.value)}
                  >
                    <option value="">All</option>
                    {data?.facets?.[key]?.map((v: string) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
              ))}
              {[
                ["dosageForm", "Dosage form"],
                ["schedule", "Schedule"],
                ["hsn", "HSN or MISSING"],
                ["gst", "GST rate or MISSING"],
                ["minMargin", "Minimum margin %"],
                ["maxMargin", "Maximum margin %"],
                ["minPrice", "Minimum PTR"],
                ["maxPrice", "Maximum PTR"],
              ].map(([key, label]) => (
                <label className="text-sm" key={key}>
                  {label}
                  <input
                    className={inputClass}
                    value={query[key] || ""}
                    onChange={(e) => filter(key, e.target.value)}
                  />
                </label>
              ))}
              <label className="text-sm">
                Count history
                <select
                  className={inputClass}
                  value={query.audit || ""}
                  onChange={(e) => filter("audit", e.target.value)}
                >
                  <option value="">All</option>
                  <option value="MISSING">Not counted</option>
                  <option value="COUNTED">Counted</option>
                  <option value="PENDING">Pending</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="BLOCKED">Blocked</option>
                </select>
              </label>
              <label className="text-sm">
                Product mapping
                <select
                  className={inputClass}
                  value={query.mapping || ""}
                  onChange={(e) => filter("mapping", e.target.value)}
                >
                  <option value="">All</option>
                  <option value="MAPPED">Mapped</option>
                  <option value="UNMAPPED">Unmapped</option>
                  <option value="PENDING">Waiting for mapping</option>
                </select>
              </label>
              <label className="text-sm">
                Missing information
                <select
                  className={inputClass}
                  value={query.missing || ""}
                  onChange={(e) => filter("missing", e.target.value)}
                >
                  <option value="">Any</option>
                  {Object.entries(data?.quality || {}).map(([key, count]) => (
                    <option key={key} value={key}>
                      {key} ({String(count)})
                    </option>
                  ))}
                </select>
              </label>
            </fieldset>
          )}
          {Object.entries(query).filter(
            ([k, v]) =>
              v && !["area", "view", "page", "item", "return"].includes(k),
          ).length > 0 && (
            <div aria-label="Active filters" className="flex flex-wrap gap-2">
              {Object.entries(query)
                .filter(
                  ([k, v]) =>
                    v &&
                    !["area", "view", "page", "item", "return"].includes(k),
                )
                .map(([k, v]) => (
                  <Button
                    key={k}
                    variant="secondary"
                    size="sm"
                    onClick={() => filter(k, "")}
                  >
                    {k}: {v} ×
                  </Button>
                ))}
            </div>
          )}
          <label className="block max-w-xs text-sm">
            Sort
            <select
              className={inputClass}
              value={query.sortBy || "name"}
              onChange={(e) => filter("sortBy", e.target.value)}
            >
              {[
                ["name", "Product name"],
                ["expiryDate", "Expiry date"],
                ["available", "Available stock"],
                ["costPrice", "Purchase price"],
              ].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          {data?.valuation && !error && (
            <div className="overflow-x-auto border-y py-4">
              <table className="w-full text-left text-sm">
                <caption className="mb-2 text-left font-medium">
                  Value of matching batches · each batch's declared stock unit
                </caption>
                <thead>
                  <tr>
                    <th className="p-2">Scope</th>
                    <th className="p-2">PTR</th>
                    <th className="p-2">MRP</th>
                    <th className="p-2">MRP excluding GST</th>
                    <th className="p-2">Known landing value</th>
                  </tr>
                </thead>
                <tbody>
                  {["current", "expired"].map((k) => (
                    <tr key={k}>
                      <th className="p-2 capitalize">{k}</th>
                      <td className="p-2">{fmtMoney(data.valuation[k].PTR)}</td>
                      <td className="p-2">{fmtMoney(data.valuation[k].MRP)}</td>
                      <td className="p-2">
                        {fmtMoney(data.valuation[k].MRPExcludingTax)}
                        {data.valuation[k].MRPTaxUnknownBatches > 0 && (
                          <span className="block text-xs">
                            GST unknown on{" "}
                            {data.valuation[k].MRPTaxUnknownBatches} batches
                          </span>
                        )}
                      </td>
                      <td className="p-2">
                        {fmtMoney(data.valuation[k].landingKnown)}
                        {data.valuation[k].landingUnknownBatches > 0 && (
                          <span className="block text-xs">
                            Cost basis unknown on{" "}
                            {data.valuation[k].landingUnknownBatches} batches
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Current branch. {data?.filterScope?.expiryBoundary}{" "}
            {data?.filterScope?.asOf &&
              `As of ${fmtDate(data.filterScope.asOf)}; expiry window through ${fmtDate(data.filterScope.expiryEnd)}.`}{" "}
            PTR and landing price exclude recoverable GST.
          </p>
          {capabilities?.itemWrite && selected.length > 0 && (
            <Button
              variant="outline"
              onClick={() => setShowLocation(!showLocation)}
            >
              Set location for {selected.length} selected batches
            </Button>
          )}
          {showLocation && (
            <form
              className="flex flex-wrap items-end gap-3 border p-4"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  const all = await Promise.all(
                    selected.map((id) =>
                      apiClient.get<any>(`/inventory/workspace/stock/${id}`),
                    ),
                  );
                  await apiClient.post(
                    "/inventory/workspace/stock/bulk-location",
                    {
                      items: all.map((d) => ({
                        id: d.item.id,
                        updatedAt: d.item.updatedAt,
                      })),
                      location,
                      reason: locationReason,
                    },
                  );
                  setNotice(
                    `Location saved for ${selected.length} batches. Stock unchanged.`,
                  );
                  setShowLocation(false);
                  setSelected([]);
                  await load();
                } catch (e: any) {
                  setError(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label className="text-sm">
                Rack / shelf / bin
                <input
                  required
                  className={inputClass}
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </label>
              <label className="text-sm">
                Reason
                <input
                  required
                  className={inputClass}
                  value={locationReason}
                  onChange={(e) => setLocationReason(e.target.value)}
                />
              </label>
              <Button disabled={busy}>Apply reviewed location</Button>
            </form>
          )}
          <div className="flex flex-wrap justify-between gap-3 text-sm">
            <p role="status">
              {busy
                ? "Loading stock…"
                : error
                  ? "Stock results unavailable"
                  : `${data?.total ?? 0} matching batches`}
              {selected.length ? ` · ${selected.length} selected` : ""}
            </p>
            {capabilities?.kinds?.COUNT?.write && (
              <Button
                variant="outline"
                size="sm"
                onClick={count}
                disabled={busy || !data?.total}
              >
                {selected.length
                  ? "Count selected batches"
                  : "Count matching batches"}
              </Button>
            )}
          </div>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted">
                <tr>
                  {[
                    "Select",
                    "Product / batch",
                    "Expiry",
                    "Physical",
                    "Held",
                    "Available",
                    "Stock unit",
                    "PTR",
                    "MRP",
                    "Location",
                  ].map((t) => (
                    <th key={t} className="whitespace-nowrap p-3">
                      {t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {data?.rows.map((i: any) => (
                  <tr key={i.id}>
                    <td className="p-3">
                      <input
                        type="checkbox"
                        aria-label={`Select ${i.name} ${i.batchNumber}`}
                        checked={selected.includes(i.id)}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [...selected, i.id]
                              : selected.filter((v) => v !== i.id),
                          )
                        }
                      />
                    </td>
                    <td className="min-w-52 p-3">
                      <button
                        onClick={() => navigate({ item: i.id })}
                        className="text-left font-medium underline decoration-muted-foreground/50 underline-offset-4"
                      >
                        {i.name}
                      </button>
                      <p className="text-xs text-muted-foreground">
                        {i.batchNumber || "Batch missing"}
                      </p>
                    </td>
                    <td className="whitespace-nowrap p-3">
                      {fmtDate(i.expiryDate)}
                    </td>
                    <td className="p-3">{i.currentStock}</td>
                    <td className="p-3">{i.heldStock}</td>
                    <td className="p-3 font-semibold">{i.available}</td>
                    <td className="p-3">{i.unit}</td>
                    <td className="p-3">{fmtMoney(i.costPrice)}</td>
                    <td className="p-3">{fmtMoney(i.mrp)}</td>
                    <td className="p-3">
                      {i.storageLocation || "Not assigned"}
                    </td>
                  </tr>
                ))}
                {!busy && !error && data && !data.rows?.length && (
                  <tr>
                    <td
                      colSpan={10}
                      className="p-8 text-center text-muted-foreground"
                    >
                      No batches match these filters. Reset or change the
                      search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              disabled={busy || !data || data.page <= 1}
              onClick={() => navigate({ page: String(data.page - 1) })}
            >
              Previous
            </Button>
            <p className="text-sm">
              Page {data?.page || 1} of {Math.max(1, data?.totalPages || 1)}
            </p>
            <Button
              variant="outline"
              disabled={busy || !data || data.page >= data.totalPages}
              onClick={() => navigate({ page: String(data.page + 1) })}
            >
              Next
            </Button>
          </div>
          <AddInventoryItemDialog
            open={add}
            onOpenChange={setAdd}
            onSuccess={load}
          />
        </>
      )}
    </div>
  );
}
