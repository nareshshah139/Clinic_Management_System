"use client";
import { useState } from "react";
import { apiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { downloadCsv, inputClass } from "./workspace-model";
import type { InventorySuggestion } from "@/components/pharmacy/PrescriptionInventoryLink";

/**
 * @cc [owner:nareshshah139,label:product] stocktake-reviewed-import-ui
 * Export MUST include all active branch batches. Import MUST open the saved count for review;
 * the interface MUST not claim stock was reset until the count workflow reports a posted result.
 */
export function StocktakeTools({
  onOpen,
}: {
  onOpen: (kind: string, id: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null),
    [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (e: any) {
      setMessage(e.message || "Unable to complete stock take");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <h3 className="font-semibold">Full physical stock take</h3>
      <p className="text-sm text-muted-foreground">
        Export every active batch, including zero and expired stock. Fill
        physicalStock in the displayed unit; update batchNumber and expiryDate
        (YYYY-MM-DD). Keep IDs, systemStock and updatedAt unchanged. Blank
        counts are skipped; enter 0 for a shelf counted empty. Pause billing and
        receipts during counting; changed stock must be recounted.
      </p>
      <Button
        variant="outline"
        disabled={busy}
        onClick={() =>
          run(async () => {
            const result = await apiClient.get<{
              rows: Record<string, unknown>[];
            }>("/inventory/workspace/stocktake/template");
            if (!result.rows.length) {
              setMessage("No active inventory batches to export.");
              return;
            }
            downloadCsv("physical-stock-take.csv", result.rows);
            setMessage(
              `Exported ${result.rows.length} batches. Open the CSV in Excel and save as CSV or XLSX.`,
            );
          })
        }
      >
        Export stock-take CSV
      </Button>
      <div className="grid gap-3 md:grid-cols-2">
        <label>
          Completed CSV / Excel file
          <input
            className="mt-1 block w-full"
            type="file"
            accept=".csv,.xlsx"
            disabled={busy}
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </label>
        <label>
          Reason
          <input
            className={inputClass}
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Full shelf count — date / location"
          />
        </label>
      </div>
      <p className="text-sm text-muted-foreground">
        Up to 10,000 rows per import. Review old vs actual counts, then
        submit/post using the existing approval rules.
      </p>
      <Button
        disabled={!file || !reason.trim() || busy}
        onClick={() =>
          run(async () => {
            const form = new FormData();
            form.append("file", file!);
            form.append("reason", reason);
            const doc = await apiClient.post<{ id: string }>(
              "/inventory/workspace/stocktake/import",
              form,
            );
            onOpen("COUNT", doc.id);
          })
        }
      >
        {busy ? "Working…" : "Import for review"}
      </Button>
      {message && <p role="status">{message}</p>}
      <DuplicateProductMerge />
    </section>
  );
}

function DuplicateProductMerge() {
  const [query, setQuery] = useState(""),
    [results, setResults] = useState<InventorySuggestion[]>([]);
  const [targetId, setTargetId] = useState(""),
    [sourceId, setSourceId] = useState("");
  const [preview, setPreview] = useState<any>(null),
    [reason, setReason] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="border-t pt-3">
      <summary className="cursor-pointer font-medium">
        Review duplicate products
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-sm text-muted-foreground">
          Merge only after the clinic confirms these are the same product and
          strength. Batch balances and historical bills stay intact. Different
          units or pack sizes require a reviewed conversion first.
        </p>
        <label>
          Find products
          <input
            className={inputClass}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <Button
          variant="outline"
          disabled={busy || !query.trim()}
          onClick={() =>
            run(async () => {
              setResults(
                await apiClient.get<InventorySuggestion[]>(
                  "/pharmacy/prescription-queue/inventory-suggestions",
                  { q: query },
                ),
              );
              setPreview(null);
              setTargetId("");
              setSourceId("");
              setConfirmed(false);
            })
          }
        >
          Search duplicate products
        </Button>
        <div className="grid gap-3 md:grid-cols-2">
          {(["Keep product", "Merge duplicate"] as const).map((label, i) => (
            <label key={label}>
              {label}
              <select
                className={inputClass}
                value={i ? sourceId : targetId}
                onChange={(e) => {
                  (i ? setSourceId : setTargetId)(e.target.value);
                  setPreview(null);
                  setConfirmed(false);
                }}
              >
                <option value="">Choose product</option>
                {results.map((r) => (
                  <option key={r.inventoryItemId} value={r.inventoryItemId}>
                    {r.name} · {r.packSizeLabel} · {r.totalStock} {r.unit}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <Button
          variant="outline"
          disabled={!targetId || !sourceId || targetId === sourceId || busy}
          onClick={() =>
            run(async () => {
              setPreview(
                await apiClient.get(
                  "/inventory/workspace/stocktake/merge-preview",
                  { targetId, sourceId },
                ),
              );
              setConfirmed(false);
            })
          }
        >
          Preview merge
        </Button>
        {preview && (
          <div className="space-y-3 rounded-md border p-3">
            <p>
              <strong>{preview.source.name}</strong> will use{" "}
              <strong>{preview.target.name}</strong> as its product identity.{" "}
              {preview.batches.length} batch records will be retained.
            </p>
            <ul className="list-disc pl-5">
              {preview.batches.map((b: any) => (
                <li key={b.id}>
                  {b.name} · Batch {b.batchNumber || "—"} · {b.currentStock}{" "}
                  {b.unit}
                </li>
              ))}
            </ul>
            <label>
              Merge reason
              <input
                className={inputClass}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              Clinic confirmed the same product, strength and stock unit
            </label>
            <Button
              disabled={busy || !confirmed || !reason.trim()}
              onClick={() =>
                run(async () => {
                  await apiClient.post("/inventory/workspace/stocktake/merge", {
                    targetId,
                    sourceId,
                    revision: preview.revision,
                    reason,
                    confirmed,
                  });
                  setPreview(null);
                  setResults([]);
                  setTargetId("");
                  setSourceId("");
                  setMessage(
                    "Product identities merged. Batch balances and history retained. Refresh prescription stock checks.",
                  );
                })
              }
            >
              Confirm product merge
            </Button>
          </div>
        )}
        {message && <p role="status">{message}</p>}
      </div>
    </details>
  );
}
