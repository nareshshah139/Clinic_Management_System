"use client";

import { displayUtcDate, displayClinicDate } from '@/lib/date-display';
import { useDashboardUser } from "@/components/layout/dashboard-user-context";
import { useEffect, useState } from "react";
import { Search, Download, Plus } from "lucide-react";
import { apiClient } from "@/lib/api";
import { InventoryAction, InventoryHelp } from "./InventoryPresentation";
import { Button } from "@/components/ui/button";
import { InventoryItemPage } from "./InventoryItemPage";
import { AddInventoryItemDialog } from "./AddInventoryItemDialog";
import { StockEditDialog } from "./StockEditDialog";
import { ReviewStatus } from "@/components/ui/ReviewStatus";
import { gapLabel } from "./optimization/stock-optimization-model";
import { batchReviewTone, batchRowClass, batchState, fmtStockExpiry, stockPageQuery } from "./stock-batch-view";
import {
  fmtMoney,
  inputClass,
  downloadCsv,
  requestKey,
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
/**
 * @cc [owner:nareshshah139,label:product] clinic-stock-row-edits
 * The stock list MUST use clinic inventory only and expose batch price/stock proposals to
 * submitting staff. Proposals MUST wait for approval; refresh events MUST reload server balances.
 */
/**
 * @cc [owner:nareshshah139] stock-recovery-evidence-ui
 * The detail view MUST distinguish an unverified ledger from checkpoint agreement; resolving
 * ambiguous product links MUST require an explicit product, revision, reason and confirmation.
 */
/**
 * @cc [owner:nareshshah139,label:product] stock-recovery-permission-handoff
 * A batch that needs a count or identity correction MUST show its recovery reference and the
 * required colleague access when the current user lacks count-write permission.
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
  const canSubmitEdits = ["OWNER", "ADMIN", "DOCTOR", "PHARMACIST"].includes(user?.role || "");
  const [stockEdit, setStockEdit] = useState<{ item: any; field: 'price' | 'stock' } | null>(null);
  const stockQuery = stockPageQuery(query);
  const selectionScope = JSON.stringify(Object.entries(stockQuery)
    .filter(([key]) => !["page", "item", "return"].includes(key))
    .sort(([a], [b]) => a.localeCompare(b)));
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [filters, setFilters] = useState(false),
    [moreColumns, setMoreColumns] = useState(false),
    [search, setSearch] = useState(query.search || ""),
    [add, setAdd] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [notice, setNotice] = useState(""),
    [location, setLocation] = useState(""),
    [locationReason, setLocationReason] = useState(""),
    [showLocation, setShowLocation] = useState(false);
  const load = async () => {
    if (itemId) return;
    setBusy(true);
    setError("");
    try {
      setData(
        await apiClient.get(
          "/inventory/workspace/stock?" + new URLSearchParams(stockQuery),
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
    const refresh = () => { void load(); };
    window.addEventListener('inventory-workspace-refresh', refresh);
    window.addEventListener('inventory-stock-refresh', refresh);
    return () => {
      window.removeEventListener('inventory-workspace-refresh', refresh);
      window.removeEventListener('inventory-stock-refresh', refresh);
    };
  }, [itemId, JSON.stringify(query)]);
  useEffect(() => {
    setSearch(query.search || "");
  }, [JSON.stringify(query)]);
  useEffect(() => { setSelected([]); }, [selectionScope]);
  const filter = (key: string, value: string) =>
    navigate({ [key]: value, page: "1", item: "" });
  const count = async () => {
    setBusy(true);
    try {
      const d = await apiClient.post<any>("/inventory/workspace/counts", {
        filters: stockQuery,
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
          new URLSearchParams({ ...stockQuery, page: "1", limit: "100" }),
      );
      const rows = [...first.rows];
      for (let page = 2; page <= first.totalPages; page++)
        rows.push(
          ...(
            await apiClient.get<any>(
              "/inventory/workspace/stock?" +
                new URLSearchParams({
                  ...stockQuery,
                  page: String(page),
                  limit: "100",
                }),
            )
          ).rows,
        );
      downloadCsv(
        "inventory-stock.csv",
        rows.map((r: any) => ({
          Product: r.productName || r.name,
          SourceName: r.name,
          Pack: r.packLabel,
          BatchState: batchState(r),
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
  if (itemId)
    return (
      <InventoryItemPage
        itemId={itemId}
        query={query}
        navigate={navigate}
        capabilities={capabilities}
        onTask={onTask}
        onDocument={onDocument}
        onInvoice={onInvoice}
        onBack={onBack}
      />
    );
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
          {notice === "Submitted for doctor or admin approval." && <Button variant="link" onClick={() => navigate({ view: 'approvals', item: '', page: '1' })}>Open approval queue</Button>}
        </p>
      )}
      <>
          <header className="flex flex-wrap justify-between gap-3">
            <div>
              <div className="flex items-center gap-2"><h2 className="text-2xl font-semibold">Stock</h2>
                <InventoryHelp label="Stock search">Search by product, generic, old name, batch, barcode or SKU. Open a batch to review its stock and movement history.</InventoryHelp>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {capabilities?.itemCreate && (
                <Button onClick={() => setAdd(true)}>
                  <Plus className="h-4 w-4" />
                  Add batch
                </Button>
              )}
              <InventoryAction
                label="Export all matching stock"
                onClick={download}
                disabled={busy || !data?.total}
              >
                <Download className="h-4 w-4" />
              </InventoryAction>
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
            <label className="w-full basis-full sm:w-auto sm:basis-auto sm:flex-1">
              <span className="mb-1 block text-sm">Search stock</span>
              <input
                className={inputClass}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Type a product name or scan a barcode"
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
          <div className="space-y-2">
            <nav aria-label="Batch view" className="flex flex-wrap gap-2">
              {[["ALL", "All batches"], ["ON_HAND", "Current / on hand"], ["EMPTY", "Previous / depleted"]].map(([value, label]) => (
                <Button key={value} variant={stockQuery.batchView === value ? "default" : "outline"}
                  aria-pressed={stockQuery.batchView === value}
                  onClick={() => navigate({ batchView: value, stock: "", expiryMonths: "", page: "1", item: "" })}>
                  {label}
                </Button>
              ))}
            </nav>
            <p className="text-sm text-muted-foreground">
              {stockQuery.batchView === "ON_HAND" ? "Stock on the shelf, including units set aside or expired."
                : stockQuery.batchView === "EMPTY" ? "Empty batches are kept for history."
                : "One row per batch. Open a product to check its history or correct details."}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">Stock level
              <select className={inputClass} value={query.stock || ""} onChange={event => navigate({ stock: event.target.value, batchView: "ALL", expiryMonths: "", page: "1", item: "" })}>
                {[["", "Any stock level"], ["LOW", "Low stock"], ["HIGH", "Above maximum"], ["POSITIVE", "Stock on shelf"], ["ZERO", "Out of stock"], ["NEGATIVE", "Negative — count needed"], ["HELD", "Set aside / held"], ["EXPIRED", "Expired"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="text-sm">Expiry
              <select className={inputClass} value={query.expiryMonths || ""} onChange={event => navigate({ expiryMonths: event.target.value, stock: "", batchView: "ALL", page: "1", item: "" })}>
                <option value="">Any expiry date</option>
                {[1, 2, 3, 6].map(months => <option key={months} value={months}>Within {months} {months === 1 ? 'month' : 'months'}</option>)}
              </select>
            </label>
            <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={moreColumns} onChange={event => setMoreColumns(event.target.checked)} /> Show cost &amp; stock details</label>
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
                    {k === "gap" ? `${gapLabel(v)} ×` : `${k}: ${v} ×`}
                  </Button>
                ))}
            </div>
          )}
          <label className="block max-w-xs text-sm">
            Sort
            <select
              className={inputClass}
              value={query.sortBy || (query.search?.trim() ? "relevance" : "name")}
              onChange={(e) => filter("sortBy", e.target.value)}
            >
              {[
                ["relevance", "Best match"],
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
              <table data-own-cell-spacing className="w-full min-w-max text-left text-sm">
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
          {moreColumns && (          <p className="text-xs text-muted-foreground">
            Current branch. {data?.filterScope?.expiryBoundary}{" "}
            {data?.filterScope?.asOf &&
              `As of ${displayClinicDate(data.filterScope.asOf)}; expiry window through ${displayUtcDate(data.filterScope.expiryEnd)}.`}{" "}
            PTR and landing price exclude recoverable GST.
          </p>)}
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
            <table data-own-cell-spacing className="w-full text-left text-sm">
              <thead className="bg-muted">
                <tr>
                  {[
                    "Select",
                    "Product / batch",
                    "Batch state",
                    "Expiry",
                    ...(moreColumns ? ["Physical", "Held"] : []),
                    "Available",
                    ...(moreColumns ? ["Stock unit", "Purchase cost", "MRP"] : []),
                    "Selling price",
                    "Location",
                    ...(canSubmitEdits ? ["Edit"] : []),
                  ].map((t) => (
                    <th key={t} className="whitespace-nowrap px-2 py-2">
                      {t === "Select" ? <span className="sr-only">{t}</span> : t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {data?.rows.map((i: any) => (
                  <tr key={i.id} className={batchRowClass(i)}>
                    <td className="px-2 py-2">
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
                    <td className="min-w-60 px-2 py-2">
                      <button
                        onClick={() => navigate({ item: i.id })}
                        className="text-left font-medium underline decoration-muted-foreground/50 underline-offset-4"
                      >
                        {i.productName || i.name}
                      </button>
                      {i.packLabel && <p className="text-sm">{i.packLabel}</p>}
                      {i.recordedName && <p className="text-xs text-muted-foreground">Recorded as {i.recordedName}</p>}
                      {i.strengthMissing && <p className="text-xs text-amber-800 dark:text-amber-200">Strength missing</p>}
                      {i.searchMatch?.kind === "fuzzy" && <p className="text-xs text-amber-800 dark:text-amber-200">Similar spelling: {i.searchMatch.corrections.join(", ")}</p>}
                      {i.searchMatch?.kind === "alias" && <p className="text-xs text-muted-foreground">Matched earlier name: {i.searchMatch.matchedText}</p>}
                      <p className="text-xs text-muted-foreground">
                        {i.batchNumber || "Batch missing"}
                      </p>
                    </td>
                    <td className="w-36 px-2 py-2"><ReviewStatus tone={batchReviewTone(i)}>{batchState(i)}</ReviewStatus></td>
                    <td className="whitespace-nowrap px-2 py-2">
                      {fmtStockExpiry(i.expiryDate)}
                    </td>
                    {moreColumns && <><td className="px-2 py-2">{i.currentStock}</td><td className="px-2 py-2">{i.heldStock}</td></>}
                    <td className="px-2 py-2"><strong className="whitespace-nowrap">{i.available} {!moreColumns && i.unit}</strong>{!moreColumns && i.heldStock > 0 && <p className="text-sm text-muted-foreground">{i.heldStock} set aside</p>}</td>
                    {moreColumns && <><td className="px-2 py-2">{i.unit}</td><td className="px-2 py-2">{fmtMoney(i.costPrice)}</td><td className="px-2 py-2 text-right tabular-nums">{fmtMoney(i.mrp)}</td></>}
                    <td className="px-2 py-2">{fmtMoney(i.sellingPrice)}</td>
                    <td className="whitespace-nowrap px-2 py-2">
                      {i.storageLocation || "Not assigned"}
                    </td>
                    {canSubmitEdits && <td className="px-2 py-2">
                      <div className="flex flex-col items-start gap-2">
                        <Button size="sm" variant="outline" className="whitespace-nowrap! lg:min-h-8!" onClick={() => setStockEdit({ item: i, field: 'price' })}>Edit price</Button>
                        <Button size="sm" variant="outline" className="whitespace-nowrap! lg:min-h-8!" onClick={() => setStockEdit({ item: i, field: 'stock' })}>Edit stock</Button>
                      </div>
                    </td>}
                  </tr>
                ))}
                {!busy && !error && data && !data.rows?.length && (
                  <tr>
                    <td
                      colSpan={(canSubmitEdits ? 8 : 7) + (moreColumns ? 5 : 0)}
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
      {stockEdit && <StockEditDialog item={stockEdit.item} field={stockEdit.field}
        onClose={() => setStockEdit(null)} onSubmitted={() => { setStockEdit(null); setNotice("Submitted for doctor or admin approval."); }} />}
    </div>
  );
}
